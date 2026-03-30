/**
 * cinestageStatus.js — Global CineStage™ activity singleton.
 *
 * Any screen can call setCineStageStatus / clearCineStageStatus to show or
 * hide the floating "CineStage™ is thinking…" bar across the entire app.
 *
 * Usage:
 *   import { setCineStageStatus, clearCineStageStatus } from '../services/cinestageStatus';
 *
 *   setCineStageStatus('Generating vocal parts');
 *   // ... await some async work ...
 *   clearCineStageStatus();
 */

const _listeners = new Set();
let _current = { active: false, message: "" };

export function setCineStageStatus(message) {
  _current = { active: true, message: message || "Processing" };
  _listeners.forEach((fn) => fn({ ..._current }));
}

export function clearCineStageStatus() {
  _current = { active: false, message: "" };
  _listeners.forEach((fn) => fn({ ..._current }));
}

/** Subscribe to status changes. Returns an unsubscribe function. */
export function subscribeToCineStageStatus(callback) {
  _listeners.add(callback);
  // Immediately emit current state so late subscribers sync up
  callback({ ..._current });
  return () => _listeners.delete(callback);
}
