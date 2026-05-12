/**
 * MessageNotificationWatcher — Real-time notifications via Socket.io
 *
 * Replaces 15-second HTTP polling with event-driven push notifications.
 * Falls back to a single REST poll on reconnect if socket is unavailable.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';

import { getUserProfile } from '../services/storage';
import { playNotificationSequence } from '../services/notificationSounds';
import {
  connectSocket,
  subscribeRoom,
  unsubscribeRoom,
  onSocketEvent,
  isConnected,
} from '../services/socketClient';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

const FALLBACK_POLL_INTERVAL_MS = 30000; // 30s fallback when socket down

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, { headers: syncHeaders(), signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAdminKeys() {
  const data = await fetchJson(`${SYNC_URL}/sync/messages/admin`);
  return (Array.isArray(data) ? data : []).map((t) => t?.id).filter(Boolean).sort();
}

async function fetchPersonalKeys(email) {
  const data = await fetchJson(`${SYNC_URL}/sync/messages/replies?email=${encodeURIComponent(email)}`);
  const normalizedEmail = normalize(email);
  const keys = [];
  for (const thread of Array.isArray(data) ? data : []) {
    if (!thread || typeof thread !== 'object') continue;
    if (thread.visibility === 'admin_only' || thread.isSystemMsg) continue;
    const isForMe =
      normalize(thread.fromEmail) === normalizedEmail ||
      thread.to === 'all_team' ||
      normalize(thread.to) === normalizedEmail;
    if (!isForMe) continue;

    const isIncoming = Boolean(normalize(thread.fromEmail)) && normalize(thread.fromEmail) !== normalizedEmail;
    if (isIncoming && thread.id) keys.push(`thread:${thread.id}`);

    for (const [index, reply] of (thread.replies || []).entries()) {
      const author = normalize(reply?.fromEmail || reply?.email);
      if (author === normalizedEmail) continue;
      keys.push(`reply:${thread.id || 'thread'}:${reply?.id || reply?.timestamp || index}`);
    }
  }
  return keys.sort();
}

async function fetchAssignmentKeys(email, fullName = '') {
  const url = fullName
    ? `${SYNC_URL}/sync/assignments?email=${encodeURIComponent(email)}&name=${encodeURIComponent(fullName)}`
    : `${SYNC_URL}/sync/assignments?email=${encodeURIComponent(email)}`;
  const data = await fetchJson(url);
  return (Array.isArray(data) ? data : [])
    .filter((a) => normalize(a?.status) !== 'declined')
    .map((a) => `assignment:${a?.service_id || a?.id || 'service'}:${normalize(a?.role || a?.grantedRole || a?.assignedRole || 'role')}`)
    .filter(Boolean)
    .sort();
}

function hasNewKeys(previousKeys, nextKeys) {
  if (!Array.isArray(previousKeys)) return false;
  const prev = new Set(previousKeys);
  return nextKeys.some((k) => !prev.has(k));
}

export default function MessageNotificationWatcher() {
  const appStateRef = useRef(AppState.currentState || 'active');
  const identityRef = useRef('');
  const previousKeysRef = useRef({ personal: null, admin: null, assignments: null });
  const fallbackTimerRef = useRef(null);
  const cleanupFnsRef = useRef([]);

  const performFallbackPoll = useCallback(async () => {
    if (appStateRef.current !== 'active') return;
    try {
      const profile = await getUserProfile();
      const email = normalize(profile?.email);
      const fullName = [profile?.name, profile?.lastName].filter(Boolean).join(' ').trim();
      const grantedRole = normalize(profile?.grantedRole);
      const shouldCheckAdmin = grantedRole === 'admin' || grantedRole === 'md';
      if (!email && !shouldCheckAdmin) return;

      const identity = `${email}|${fullName.toLowerCase()}|${grantedRole}`;
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
        shouldPlayMessage = shouldPlayMessage || hasNewKeys(previousKeysRef.current.personal, personalKeys);
        previousKeysRef.current.personal = personalKeys;
      }
      if (shouldCheckAdmin && Array.isArray(adminKeys)) {
        shouldPlayMessage = shouldPlayMessage || hasNewKeys(previousKeysRef.current.admin, adminKeys);
        previousKeysRef.current.admin = adminKeys;
      }
      if (Array.isArray(assignmentKeys)) {
        shouldPlayAssignment = hasNewKeys(previousKeysRef.current.assignments, assignmentKeys);
        previousKeysRef.current.assignments = assignmentKeys;
      }

      const queue = [];
      if (shouldPlayAssignment) queue.push('assignment');
      if (shouldPlayMessage) queue.push('message');
      if (queue.length > 0) await playNotificationSequence(queue);
    } catch (e) {
      // Silently ignore fallback poll errors
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const setupSocket = async () => {
      const profile = await getUserProfile();
      const email = normalize(profile?.email);
      const orgId = profile?.orgId || '';
      if (!email || !orgId) return;

      connectSocket();
      const room = `${orgId}:messages`;
      subscribeRoom(room);

      // ── Real-time event handlers ──
      const unsubMessageNew = onSocketEvent('message:new', (msg) => {
        if (!mounted || appStateRef.current !== 'active') return;
        const isForMe =
          normalize(msg?.to) === email ||
          msg?.to === 'all_team' ||
          normalize(msg?.from_email) !== email;
        if (isForMe) playNotificationSequence(['message']);
      });

      const unsubMessageReplied = onSocketEvent('message:replied', (payload) => {
        if (!mounted || appStateRef.current !== 'active') return;
        const replyAuthor = normalize(payload?.reply?.from || payload?.reply?.from_email);
        if (replyAuthor && replyAuthor !== email) {
          playNotificationSequence(['message']);
        }
      });

      const unsubAssignment = onSocketEvent('assignment:responded', () => {
        if (!mounted || appStateRef.current !== 'active') return;
        playNotificationSequence(['assignment']);
      });

      cleanupFnsRef.current.push(() => {
        unsubMessageNew();
        unsubMessageReplied();
        unsubAssignment();
        unsubscribeRoom(room);
      });

      // Initial baseline fetch (once on mount)
      await performFallbackPoll();
    };

    const startFallbackIfNeeded = () => {
      if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = setInterval(() => {
        if (!isConnected() && appStateRef.current === 'active') {
          void performFallbackPoll();
        }
      }, FALLBACK_POLL_INTERVAL_MS);
    };

    const handleAppStateChange = (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        connectSocket();
        void performFallbackPoll();
      }
    };

    void setupSocket();
    startFallbackIfNeeded();

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      mounted = false;
      subscription.remove();
      if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
      for (const fn of cleanupFnsRef.current) fn();
      cleanupFnsRef.current = [];
    };
  }, [performFallbackPoll]);

  return null;
}
