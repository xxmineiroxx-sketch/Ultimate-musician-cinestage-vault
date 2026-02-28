/**
 * Bridge Client v1
 * Sends JSON messages to a local companion "Ultimate Bridge" app/server
 * that can translate to:
 *  - MIDI Clock / MIDI Notes / Program Change
 *  - OSC (ProPresenter, lighting controllers)
 *  - Art-Net / sACN (future)
 *
 * In Expo managed workflow, raw MIDI + UDP are limited.
 * This bridge approach keeps the mobile app lightweight and cross-platform.
 */

let ws = null;
let lastUrl = null;
let listeners = new Set();

export function connectBridge(url) {
  try {
    lastUrl = url;
    if (ws) ws.close();
    ws = new WebSocket(url);

    ws.onopen = () => notify({ type: 'BRIDGE_STATUS', status: 'connected', url });
    ws.onclose = () => notify({ type: 'BRIDGE_STATUS', status: 'disconnected', url });
    ws.onerror = (e) => notify({ type: 'BRIDGE_STATUS', status: 'error', error: String(e?.message || e), url });
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        notify({ type: 'BRIDGE_MESSAGE', message: msg });
      } catch {
        notify({ type: 'BRIDGE_MESSAGE', message: evt.data });
      }
    };
    return true;
  } catch (e) {
    notify({ type: 'BRIDGE_STATUS', status: 'error', error: String(e?.message || e), url });
    return false;
  }
}

export function disconnectBridge() {
  if (ws) ws.close();
  ws = null;
}

export function sendBridge(payload) {
  try {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function getBridgeUrl() {
  return lastUrl;
}

export function subscribeBridge(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(evt) {
  for (const fn of listeners) {
    try { fn(evt); } catch {}
  }
}
