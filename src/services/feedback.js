import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';
import { getUserProfile } from './storage';

const FEEDBACK_QUEUE_KEY = '@up_feedback_queue_v1';
const MAX_QUEUE_SIZE = 20;

let runtimeContext = {
  routeName: 'unknown',
};

let globalHandlerRegistered = false;

function makeFeedbackId(prefix = 'feedback') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clipText(value, max = 12000) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function parseErrorResponse(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function createFingerprint(draft) {
  return [
    draft.type || 'manual',
    clipText(draft.subject, 160).toLowerCase(),
    clipText(draft.message, 240).toLowerCase(),
    clipText(draft.routeName || '', 80).toLowerCase(),
  ].join('|');
}

function serializeError(error) {
  if (!error) {
    return {
      name: 'UnknownError',
      message: 'Unknown error',
      stack: '',
    };
  }

  return {
    name: clipText(error.name || 'Error', 160),
    message: clipText(error.message || String(error), 1000),
    stack: clipText(error.stack || '', 12000),
  };
}

async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(queue));
}

async function enrichReporter(reporter = {}) {
  const profile = await getUserProfile().catch(() => null);
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];

  return {
    name: reporter.name || profile?.name || '',
    lastName: reporter.lastName || profile?.lastName || '',
    email: reporter.email || profile?.email || '',
    phone: reporter.phone || profile?.phone || '',
    roleAssignments:
      reporter.roleAssignments ||
      profile?.roleAssignments ||
      roles.join(', '),
  };
}

async function buildPayload(draft) {
  return {
    id: draft.id,
    type: draft.type || 'manual',
    severity: draft.severity || 'info',
    subject: clipText(draft.subject || '', 160),
    message: clipText(draft.message || '', 12000),
    routeName: clipText(draft.routeName || runtimeContext.routeName || '', 120),
    createdAt: draft.createdAt || new Date().toISOString(),
    app: {
      name: 'Ultimate Playback',
      platform: Platform.OS,
      platformVersion: String(Platform.Version ?? ''),
      jsEngine: global.HermesInternal ? 'hermes' : 'unknown',
      releaseChannel: __DEV__ ? 'development' : 'production',
      ...(draft.app || {}),
    },
    reporter: await enrichReporter(draft.reporter),
    metadata: draft.metadata && typeof draft.metadata === 'object' ? draft.metadata : {},
  };
}

export function setFeedbackRuntimeContext(nextContext = {}) {
  runtimeContext = {
    ...runtimeContext,
    ...nextContext,
  };
}

export function createManualFeedbackDraft({
  subject = '',
  message = '',
  reporter = {},
  metadata = {},
  routeName = '',
}) {
  return {
    id: makeFeedbackId('feedback'),
    type: 'manual',
    severity: 'info',
    subject: clipText(subject || 'Playback problem report', 160),
    message: clipText(message, 12000),
    routeName: clipText(routeName || runtimeContext.routeName || '', 120),
    metadata,
    reporter,
    createdAt: new Date().toISOString(),
  };
}

export function createCrashFeedbackDraft(error, details = {}) {
  const serialized = serializeError(error);
  const componentStack = clipText(details.componentStack || '', 12000);
  const reportLines = [
    `Error: ${serialized.name}`,
    `Message: ${serialized.message}`,
    details.routeName || runtimeContext.routeName
      ? `Screen: ${details.routeName || runtimeContext.routeName}`
      : '',
    componentStack ? `Component Stack:\n${componentStack}` : '',
    serialized.stack ? `Stack:\n${serialized.stack}` : '',
  ].filter(Boolean);

  return {
    id: makeFeedbackId('crash'),
    type: 'crash',
    severity: details.isFatal ? 'fatal' : 'error',
    subject: clipText(`Playback crash: ${serialized.message}`, 160),
    message: clipText(reportLines.join('\n\n'), 12000),
    routeName: clipText(details.routeName || runtimeContext.routeName || '', 120),
    metadata: {
      source: details.source || 'error_boundary',
      isFatal: Boolean(details.isFatal),
      errorName: serialized.name,
      errorMessage: serialized.message,
      errorStack: serialized.stack,
    },
    reporter: details.reporter || {},
    createdAt: new Date().toISOString(),
  };
}

export async function queueFeedbackDraft(draft) {
  const queue = await readQueue();
  const item = {
    ...draft,
    fingerprint: draft.fingerprint || createFingerprint(draft),
  };
  const nextQueue = [
    item,
    ...queue.filter(existing =>
      existing.id !== item.id && existing.fingerprint !== item.fingerprint
    ),
  ].slice(0, MAX_QUEUE_SIZE);
  await writeQueue(nextQueue);
  return item;
}

export async function removeQueuedFeedbackDraft(draftId) {
  const queue = await readQueue();
  const nextQueue = queue.filter(item => item.id !== draftId);
  if (nextQueue.length !== queue.length) {
    await writeQueue(nextQueue);
  }
}

export async function deliverFeedbackDraft(draft) {
  const payload = await buildPayload(draft);
  const response = await fetch(`${SYNC_URL}/sync/feedback`, {
    method: 'POST',
    headers: syncHeaders(),
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  const data = parseErrorResponse(raw);

  if (!response.ok) {
    const error = new Error(data?.error || 'Failed to send feedback');
    error.status = response.status;
    throw error;
  }

  await removeQueuedFeedbackDraft(draft.id);
  return data;
}

export async function submitManualFeedback(input) {
  const draft = createManualFeedbackDraft(input);
  try {
    const response = await deliverFeedbackDraft(draft);
    return { queued: false, response, draft };
  } catch (error) {
    await queueFeedbackDraft(draft);
    error.queued = true;
    error.draft = draft;
    throw error;
  }
}

export async function flushFeedbackQueue() {
  const queue = await readQueue();
  if (!queue.length) {
    return { sent: 0, failed: 0 };
  }

  const remaining = [];
  let sent = 0;

  for (const item of queue) {
    try {
      await deliverFeedbackDraft(item);
      sent += 1;
    } catch {
      remaining.push(item);
    }
  }

  await writeQueue(remaining);
  return { sent, failed: remaining.length };
}

export function registerGlobalErrorHandler() {
  if (globalHandlerRegistered) return;

  const errorUtils = global.ErrorUtils;
  if (
    !errorUtils ||
    typeof errorUtils.getGlobalHandler !== 'function' ||
    typeof errorUtils.setGlobalHandler !== 'function'
  ) {
    return;
  }

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    const draft = createCrashFeedbackDraft(error, {
      isFatal,
      source: 'global_handler',
      routeName: runtimeContext.routeName,
    });
    queueFeedbackDraft(draft).catch(() => {});

    if (typeof previousHandler === 'function') {
      previousHandler(error, isFatal);
    }
  });

  globalHandlerRegistered = true;
}
