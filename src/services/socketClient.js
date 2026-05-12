/**
 * Socket.io Client — Real-time sync for Ultimate Playback
 *
 * Singleton that manages the Socket.io connection to the sync server.
 * Falls back gracefully to REST polling when disconnected.
 *
 * Auth: passes x-org-id + x-secret-key via handshake auth object.
 * Path: /sync/socket.io (to avoid conflict with /midi/ws)
 */

import { io } from 'socket.io-client';
import { SYNC_URL, SYNC_ORG_ID, SYNC_SECRET_KEY } from '../../config/syncConfig';

let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const listeners = new Map(); // event -> Set<handler>

function buildSocketUrl() {
  // Socket.io connects to the base URL; the path is handled by the client
  return SYNC_URL;
}

export function getSocket() {
  return socket;
}

export function isConnected() {
  return socket?.connected ?? false;
}

export function connectSocket() {
  if (socket?.connected) return socket;
  if (!SYNC_ORG_ID || !SYNC_SECRET_KEY) {
    console.warn('[socket] Missing credentials — skipping connection');
    return null;
  }

  socket = io(buildSocketUrl(), {
    path: '/sync/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    auth: {
      orgId: SYNC_ORG_ID,
      secretKey: SYNC_SECRET_KEY,
    },
  });

  socket.on('connect', () => {
    console.log(`[socket] connected ${socket.id}`);
    reconnectAttempts = 0;
    // Re-subscribe to all rooms on reconnect
    for (const room of subscribedRooms) {
      socket.emit('subscribe', room);
    }
  });

  socket.on('connect_error', (err) => {
    reconnectAttempts += 1;
    console.warn(`[socket] connect_error (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}):`, err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] disconnected:', reason);
  });

  socket.on('error', (err) => {
    console.error('[socket] error:', err);
  });

  // Replay registered listeners onto the new socket instance
  for (const [event, handlerSet] of listeners) {
    for (const handler of handlerSet) {
      socket.on(event, handler);
    }
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

const subscribedRooms = new Set();

export function subscribeRoom(room) {
  subscribedRooms.add(room);
  if (socket?.connected) {
    socket.emit('subscribe', room);
  }
}

export function unsubscribeRoom(room) {
  subscribedRooms.delete(room);
  if (socket?.connected) {
    socket.emit('unsubscribe', room);
  }
}

/**
 * Register an event listener.
 * The handler will be attached to the current socket (if any) and
 * automatically re-attached after reconnects.
 */
export function onSocketEvent(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  if (socket) socket.on(event, handler);
  return () => offSocketEvent(event, handler);
}

export function offSocketEvent(event, handler) {
  listeners.get(event)?.delete(handler);
  if (socket) socket.off(event, handler);
}

/**
 * One-shot event listener — auto-removes after first fire.
 */
export function onceSocketEvent(event, handler) {
  const wrapper = (...args) => {
    offSocketEvent(event, wrapper);
    handler(...args);
  };
  onSocketEvent(event, wrapper);
}

/**
 * Emit an event to the server.
 */
export function emitSocketEvent(event, data) {
  if (socket?.connected) {
    socket.emit(event, data);
  } else {
    console.warn(`[socket] cannot emit "${event}" — not connected`);
  }
}
