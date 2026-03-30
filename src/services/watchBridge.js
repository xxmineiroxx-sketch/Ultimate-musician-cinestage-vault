/**
 * watchBridge.js — Ultimate Playback ↔ Apple Watch bridge
 *
 * Uses the native WatchBridgeModule (see native/RN/WatchBridgeModule.swift).
 * Gracefully no-ops if the native module is not installed yet
 * (safe to import in Expo Go — it just does nothing).
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { WatchBridgeModule } = NativeModules;
const emitter = WatchBridgeModule ? new NativeEventEmitter(WatchBridgeModule) : null;

export const IS_WATCH_SUPPORTED =
  Platform.OS === 'ios' && !!WatchBridgeModule;

// ── Send current playback state to Watch ─────────────────────────────────────
// Call this whenever song/section/scroll state changes in SetlistRunnerScreen.
export function sendPlaybackState({
  isPlaying   = false,
  songTitle   = '',
  artist      = '',
  songIndex   = 0,
  totalSongs  = 0,
  sectionLabel = '',
  bpm         = null,
  key         = null,
}) {
  if (!IS_WATCH_SUPPORTED) return;
  const payload = { isPlaying, songTitle, artist, songIndex, totalSongs, sectionLabel, bpm, key };
  // sendMessage = real-time if Watch reachable; updateApplicationContext = persistent fallback
  WatchBridgeModule.sendMessage(payload)
    .catch(() => WatchBridgeModule.updateApplicationContext(payload).catch(() => {}));
}

// ── Send verse of the day to Watch ─────────────────────────────────────────
export function sendVerseToWatch({ text = '', ref = '', theme = '' }) {
  if (!IS_WATCH_SUPPORTED) return;
  WatchBridgeModule.updateApplicationContext({ verseText: text, verseRef: ref, verseTheme: theme })
    .catch(() => {});
}

// ── Send upcoming service info to Watch ──────────────────────────────────────
export function sendServiceInfoToWatch({ serviceName = '', serviceDate = '', role = '' }) {
  if (!IS_WATCH_SUPPORTED) return;
  WatchBridgeModule.updateApplicationContext({ serviceName, serviceDate, role })
    .catch(() => {});
}

// ── Listen for commands FROM the Watch (PLAY/PAUSE/NEXT/PREV) ────────────────
// Returns unsubscribe function.
export function onWatchCommand(handler) {
  if (!emitter) return () => {};
  const sub = emitter.addListener('WatchCommand', handler);
  return () => sub.remove();
}

// ── Check Watch connectivity ─────────────────────────────────────────────────
export async function getWatchReachability() {
  if (!IS_WATCH_SUPPORTED) return false;
  try {
    return await WatchBridgeModule.isReachable();
  } catch {
    return false;
  }
}
