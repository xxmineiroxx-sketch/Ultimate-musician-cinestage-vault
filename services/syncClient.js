/**
 * Sync Client v1 (v3.0)
 * - Connects to local Bridge Sync Server OR cloud sync endpoint
 * - Publishes host state, receives updates for stage/rehearsal clients
 */

let ws = null;
let listeners = new Set();
let status = 'disconnected';

export function connectSync(url, { role='STAGE', roomId='default', deviceId='device' } = {}) {
  try {
    if (!url) return false;
    if (ws) ws.close();

    ws = new WebSocket(url);
    ws.onopen = () => {
      status = 'connected';
      notify({ type: 'SYNC_STATUS', status });
      send({ type: 'HELLO', role, roomId, deviceId, ts: Date.now() });
    };
    ws.onclose = () => {
      status = 'disconnected';
      notify({ type: 'SYNC_STATUS', status });
    };
    ws.onerror = (e) => {
      status = 'error';
      notify({ type: 'SYNC_STATUS', status, error: String(e?.message || e) });
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        notify({ type: 'SYNC_MESSAGE', message: msg });
      } catch {
        notify({ type: 'SYNC_MESSAGE', message: evt.data });
      }
    };
    return true;
  } catch (e) {
    status = 'error';
    notify({ type: 'SYNC_STATUS', status, error: String(e?.message || e) });
    return false;
  }
}

export function disconnectSync() {
  if (ws) ws.close();
  ws = null;
  status = 'disconnected';
  notify({ type: 'SYNC_STATUS', status });
}

export function send(payload) {
  try {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function subscribeSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSyncStatus() { return status; }

function notify(evt) {
  for (const fn of listeners) {
    try { fn(evt); } catch {}
  }
}
