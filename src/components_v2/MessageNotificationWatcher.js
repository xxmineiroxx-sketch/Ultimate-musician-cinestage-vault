import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getUserProfile } from '../services/storage';
import { playNotificationSequence } from '../services/notificationSounds';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

const POLL_INTERVAL_MS = 15000;

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function createAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

async function fetchJson(url) {
  const { signal, clear } = createAbortSignal(6000);
  try {
    const response = await fetch(url, { headers: syncHeaders(), signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clear();
  }
}

function isPersonalInboxMessage(thread, email = '') {
  const normalizedEmail = normalize(email);
  if (!thread || typeof thread !== 'object') return false;
  if (thread.visibility === 'admin_only' || thread.isSystemMsg) return false;
  return (
    normalize(thread.fromEmail) === normalizedEmail ||
    thread.to === 'all_team' ||
    normalize(thread.to) === normalizedEmail
  );
}

function buildPersonalEventKeys(threads, email) {
  const normalizedEmail = normalize(email);
  const keys = [];
  for (const thread of Array.isArray(threads) ? threads : []) {
    if (!isPersonalInboxMessage(thread, normalizedEmail)) continue;

    const isIncomingThread =
      Boolean(normalize(thread.fromEmail)) &&
      normalize(thread.fromEmail) !== normalizedEmail;

    if (isIncomingThread && thread.id) {
      keys.push(`thread:${thread.id}`);
    }

    for (const [index, reply] of (thread.replies || []).entries()) {
      const replyAuthorEmail = normalize(reply?.fromEmail || reply?.email);
      if (replyAuthorEmail && replyAuthorEmail === normalizedEmail) continue;
      const replyKey = reply?.id || reply?.timestamp || `${thread.id || 'thread'}:${index}`;
      keys.push(`reply:${thread.id || 'thread'}:${replyKey}`);
    }
  }
  return keys.sort();
}

function buildAdminEventKeys(threads) {
  return (Array.isArray(threads) ? threads : [])
    .map((thread) => thread?.id)
    .filter(Boolean)
    .sort();
}

function buildAssignmentEventKeys(assignments) {
  return (Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => normalize(assignment?.status) !== 'declined')
    .map((assignment) => {
      const serviceId = assignment?.service_id || assignment?.id || 'service';
      const role = normalize(
        assignment?.role || assignment?.grantedRole || assignment?.assignedRole || 'role'
      );
      return `assignment:${serviceId}:${role}`;
    })
    .filter(Boolean)
    .sort();
}

function hasNewKeys(previousKeys, nextKeys) {
  if (!Array.isArray(previousKeys)) return false;
  const previous = new Set(previousKeys);
  return nextKeys.some((key) => !previous.has(key));
}

async function fetchPersonalKeys(email) {
  const data = await fetchJson(
    `${SYNC_URL}/sync/messages/replies?email=${encodeURIComponent(email)}`
  );
  return buildPersonalEventKeys(data, email);
}

async function fetchAdminKeys() {
  const data = await fetchJson(`${SYNC_URL}/sync/messages/admin`);
  return buildAdminEventKeys(data);
}

async function fetchAssignmentKeys(email, fullName = '') {
  const url = fullName
    ? `${SYNC_URL}/sync/assignments?email=${encodeURIComponent(email)}&name=${encodeURIComponent(fullName)}`
    : `${SYNC_URL}/sync/assignments?email=${encodeURIComponent(email)}`;
  const data = await fetchJson(url);
  return buildAssignmentEventKeys(data);
}

export default function MessageNotificationWatcher() {
  const appStateRef = useRef(AppState.currentState || 'active');
  const pollingRef = useRef(false);
  const identityRef = useRef('');
  const previousKeysRef = useRef({
    personal: null,
    admin: null,
    assignments: null,
  });

  useEffect(() => {
    let mounted = true;
    let intervalId = null;

    const pollMessages = async () => {
      if (!mounted || appStateRef.current !== 'active' || pollingRef.current) return;
      pollingRef.current = true;

      try {
        const profile = await getUserProfile();
        const email = normalize(profile?.email);
        const fullName = [profile?.name, profile?.lastName].filter(Boolean).join(' ').trim();
        const grantedRole = normalize(profile?.grantedRole);
        const identity = `${email}|${fullName.toLowerCase()}|${grantedRole}`;
        const shouldCheckAdmin = grantedRole === 'admin' || grantedRole === 'md';

        if (!email && !shouldCheckAdmin) {
          identityRef.current = '';
          previousKeysRef.current = { personal: null, admin: null, assignments: null };
          return;
        }

        if (identityRef.current !== identity) {
          identityRef.current = identity;
          previousKeysRef.current = { personal: null, admin: null, assignments: null };
        }

        const [personalKeys, adminKeys, assignmentKeys] = await Promise.all([
          email ? fetchPersonalKeys(email).catch(() => null) : Promise.resolve(null),
          shouldCheckAdmin ? fetchAdminKeys().catch(() => null) : Promise.resolve(null),
          email ? fetchAssignmentKeys(email, fullName).catch(() => null) : Promise.resolve(null),
        ]);

        let shouldPlayMessage = false;
        let shouldPlayAssignment = false;

        if (Array.isArray(personalKeys)) {
          shouldPlayMessage =
            shouldPlayMessage || hasNewKeys(previousKeysRef.current.personal, personalKeys);
          previousKeysRef.current.personal = personalKeys;
        }

        if (shouldCheckAdmin) {
          if (Array.isArray(adminKeys)) {
            shouldPlayMessage =
              shouldPlayMessage || hasNewKeys(previousKeysRef.current.admin, adminKeys);
            previousKeysRef.current.admin = adminKeys;
          }
        } else {
          previousKeysRef.current.admin = null;
        }

        if (Array.isArray(assignmentKeys)) {
          shouldPlayAssignment = hasNewKeys(previousKeysRef.current.assignments, assignmentKeys);
          previousKeysRef.current.assignments = assignmentKeys;
        }

        const queue = [];
        if (shouldPlayAssignment) queue.push('assignment');
        if (shouldPlayMessage) queue.push('message');
        if (queue.length > 0) {
          await playNotificationSequence(queue);
        }
      } finally {
        pollingRef.current = false;
      }
    };

    const handleAppStateChange = (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        void pollMessages();
      }
    };

    void pollMessages();
    intervalId = setInterval(() => {
      void pollMessages();
    }, POLL_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
      subscription.remove();
    };
  }, []);

  return null;
}
