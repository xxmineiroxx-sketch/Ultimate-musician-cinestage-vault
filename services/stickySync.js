/**
 * Sticky Sync / Reconnect helper
 * - Keeps trying to reconnect to Sync server (and bridge) when disconnected.
 */

import { connectSync, getSyncStatus } from './syncClient';
import { connectBridge, getBridgeUrl } from './bridgeClient';

let timer = null;

export function startStickySync({ syncUrl, role, roomId, deviceId, bridgeUrl }) {
  stopStickySync();
  timer = setInterval(() => {
    try {
      if (syncUrl && getSyncStatus() !== 'connected') connectSync(syncUrl, { role, roomId, deviceId });
    } catch {}
    try {
      const b = bridgeUrl || getBridgeUrl();
      if (b) connectBridge(b);
    } catch {}
  }, 3000);
}

export function stopStickySync() {
  if (timer) clearInterval(timer);
  timer = null;
}
