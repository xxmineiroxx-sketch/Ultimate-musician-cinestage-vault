/**
 * desktopBridge.js
 * Detects if running inside Electron desktop app and provides
 * the IPC bridge exposed by preload.js via contextBridge.
 *
 * Usage:
 *   import { isDesktop, bridge } from '../utils/desktopBridge';
 *   if (isDesktop) {
 *     const stems = await bridge.listLocalStems(songId);
 *   }
 */

/** True when running inside the Electron desktop wrapper */
export const isDesktop =
  typeof window !== 'undefined' &&
  typeof window.electronBridge !== 'undefined' &&
  window.electronBridge !== null;

/** The IPC bridge object (null when not on desktop) */
export const bridge = isDesktop ? window.electronBridge : null;

/**
 * Download stems to local disk (desktop only).
 * @param {string} songId
 * @param {{ vocals?: string, drums?: string, bass?: string, other?: string }} stemUrls
 * @returns {Promise<{ success: boolean, paths: object }>}
 */
export async function downloadStemsToDesktop(songId, stemUrls) {
  if (!isDesktop || !bridge?.downloadStems) return { success: false, paths: {} };
  return bridge.downloadStems(songId, stemUrls);
}

/**
 * List locally downloaded stems for a song (desktop only).
 * @param {string} songId
 * @returns {Promise<string[]>} stem names that are downloaded
 */
export async function listLocalStems(songId) {
  if (!isDesktop || !bridge?.listLocalStems) return [];
  return bridge.listLocalStems(songId);
}

/**
 * Get the local file path for a stem (desktop only).
 * Returns null on mobile.
 */
export async function getLocalStemPath(songId, stemName) {
  if (!isDesktop || !bridge?.getStemPath) return null;
  return bridge.getStemPath(songId, stemName);
}

/**
 * Fetch waveform data from CineStage via Electron (bypasses CORS).
 */
export async function fetchWaveformViaDesktop(songId, audioUrl) {
  if (!isDesktop || !bridge?.fetchWaveform) return null;
  return bridge.fetchWaveform(songId, audioUrl);
}

/**
 * Fetch per-stem waveform peaks via Electron.
 */
export async function fetchStemPeaksViaDesktop(songId, stemUrls) {
  if (!isDesktop || !bridge?.fetchStemPeaks) return null;
  return bridge.fetchStemPeaks(songId, stemUrls);
}

/**
 * Open a native audio file picker (desktop only).
 * Returns { uri, name, size, mimeType } or null if cancelled.
 */
export async function pickAudioFileDesktop() {
  if (!isDesktop || !bridge?.pickAudioFile) return null;
  return bridge.pickAudioFile();
}

/**
 * Push project data to CineStage cloud via Electron.
 */
export async function syncPushDesktop(payload) {
  if (!isDesktop || !bridge?.syncPush) return { ok: false };
  return bridge.syncPush(payload);
}

/**
 * Pull project data from CineStage cloud via Electron.
 */
export async function syncPullDesktop(type) {
  if (!isDesktop || !bridge?.syncPull) return { ok: false, projects: [] };
  return bridge.syncPull(type);
}
