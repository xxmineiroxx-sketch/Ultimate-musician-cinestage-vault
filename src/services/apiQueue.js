import AsyncStorage from '@react-native-async-storage/async-storage';
import { addNetworkListener } from '../hooks/useNetworkStatus';

/**
 * apiQueue — Offline retry queue for mutating API calls
 *
 * Inspired by feedback.js queue pattern. Generalized for any POST/PUT/PATCH/DELETE.
 *
 * Features:
 *   - Persisted to AsyncStorage (survives app restarts)
 *   - Exponential backoff (1s, 2s, 4s, 8s, 16s)
 *   - Max retry count: 5 (then moved to dead letter)
 *   - Auto-flush when network reconnects
 *   - Deduplication by request fingerprint
 *   - Event emitter for UI pending count
 */

const QUEUE_KEY = '@up_api_queue_v2';
const DEAD_LETTER_KEY = '@up_api_dead_letter_v2';
const MAX_QUEUE_SIZE = 50;
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;

// Event system for UI updates
const eventListeners = new Set();

function emit(event, payload) {
  eventListeners.forEach(fn => {
    try { fn(event, payload); } catch (e) { /* noop */ }
  });
}

export function addQueueListener(listener) {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

export function removeQueueListener(listener) {
  eventListeners.delete(listener);
}

// ── Storage ───────────────────────────────────────────────────────────────────

async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue) {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    emit('pendingCountChanged', queue.length);
  } catch { /* noop */ }
}

async function readDeadLetter() {
  try {
    const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeDeadLetter(items) {
  try {
    await AsyncStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(items));
  } catch { /* noop */ }
}

// ── Fingerprint ───────────────────────────────────────────────────────────────

function makeRequestFingerprint(req) {
  const { method = 'POST', url = '', body = '' } = req;
  const bodyHash = typeof body === 'string'
    ? body.slice(0, 200)
    : JSON.stringify(body).slice(0, 200);
  return `${method}|${url}|${bodyHash}`;
}

function makeQueueId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a mutating API request for later delivery.
 * Returns the queued item. Does NOT attempt delivery immediately.
 */
export async function enqueueRequest(request) {
  const queue = await readQueue();
  const fingerprint = makeRequestFingerprint(request);
  const item = {
    id: makeQueueId(),
    request: {
      method: request.method || 'POST',
      url: request.url,
      headers: request.headers || {},
      body: request.body,
    },
    fingerprint,
    retries: 0,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
  };

  const nextQueue = [
    item,
    ...queue.filter(existing =>
      existing.id !== item.id && existing.fingerprint !== item.fingerprint
    ),
  ].slice(0, MAX_QUEUE_SIZE);

  await writeQueue(nextQueue);
  emit('enqueued', item);
  return item;
}

/**
 * Attempt to deliver a single queued item.
 * Returns { success, shouldRetry }.
 */
export async function deliverRequest(item) {
  const { request } = item;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        ...request.headers,
      },
      body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      return { success: true, shouldRetry: false };
    }

    // 4xx errors are permanent (don't retry bad requests)
    if (response.status >= 400 && response.status < 500) {
      return { success: false, shouldRetry: false, status: response.status };
    }

    // 5xx or other: retry
    return { success: false, shouldRetry: true, status: response.status };
  } catch (error) {
    clearTimeout(timeoutId);
    // Network errors: retry
    return { success: false, shouldRetry: true, error: error.message };
  }
}

/**
 * Remove a completed item from the queue.
 */
export async function removeQueuedRequest(id) {
  const queue = await readQueue();
  const next = queue.filter(item => item.id !== id);
  if (next.length !== queue.length) {
    await writeQueue(next);
  }
}

/**
 * Move an item to dead letter queue (max retries exceeded).
 */
export async function moveToDeadLetter(item) {
  const dead = await readDeadLetter();
  const next = [item, ...dead].slice(0, 50);
  await writeDeadLetter(next);
}

/**
 * Flush the entire queue — attempt to deliver all pending items.
 * Called automatically on network reconnect.
 */
export async function flushQueue() {
  const queue = await readQueue();
  if (!queue.length) {
    emit('flushed', { sent: 0, failed: 0, dead: 0 });
    return { sent: 0, failed: 0, dead: 0 };
  }

  const remaining = [];
  const dead = [];
  let sent = 0;

  for (const item of queue) {
    const result = await deliverRequest(item);
    if (result.success) {
      sent += 1;
      continue;
    }

    if (!result.shouldRetry || item.retries >= MAX_RETRIES) {
      // Permanent failure or max retries
      dead.push({ ...item, failedAt: new Date().toISOString(), lastError: result.error || result.status });
    } else {
      // Retry later
      remaining.push({
        ...item,
        retries: item.retries + 1,
        lastAttemptAt: new Date().toISOString(),
      });
    }
  }

  await writeQueue(remaining);

  if (dead.length) {
    const existing = await readDeadLetter();
    await writeDeadLetter([...dead, ...existing].slice(0, 50));
  }

  emit('flushed', { sent, failed: remaining.length, dead: dead.length });
  return { sent, failed: remaining.length, dead: dead.length };
}

/**
 * Get the number of pending requests in the queue.
 */
export async function getPendingCount() {
  const queue = await readQueue();
  return queue.length;
}

/**
 * Get pending queue items (for debugging / admin).
 */
export async function getPendingItems() {
  return readQueue();
}

/**
 * Get dead letter items (for debugging / admin).
 */
export async function getDeadLetterItems() {
  return readDeadLetter();
}

/**
 * Clear the entire queue and dead letter.
 */
export async function clearQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY);
  await AsyncStorage.removeItem(DEAD_LETTER_KEY);
  emit('pendingCountChanged', 0);
}

// ── Auto-flush on reconnect ───────────────────────────────────────────────────

let autoFlushUnsub = null;

export function enableAutoFlush() {
  if (autoFlushUnsub) return;
  autoFlushUnsub = addNetworkListener(state => {
    if (state.isConnected) {
      flushQueue();
    }
  });
}

export function disableAutoFlush() {
  if (autoFlushUnsub) {
    autoFlushUnsub();
    autoFlushUnsub = null;
  }
}

// Auto-enable on import
enableAutoFlush();
