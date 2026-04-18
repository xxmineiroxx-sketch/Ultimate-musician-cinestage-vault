/**
 * hapticClickTrack.js
 *
 * Drives phone haptics in sync with a waveform beats_ms array.
 * No earpiece needed — the performer feels the beat through the device.
 *
 * NOTE: expo-haptics is not in package.json. Install it before use:
 *   npx expo install expo-haptics
 */

import * as Haptics from 'expo-haptics';

// ── Constants ─────────────────────────────────────────────────────────────────

export const HAPTIC_MODES = {
  CLICK: 'click',           // every beat
  DOWNBEAT_ONLY: 'downbeat_only', // beat 1 of each bar only
  FREELY: 'freely',         // slow pulse every 2 s (no fixed tempo)
  OFF: 'off',
};

const TICK_INTERVAL_MS = 16; // ~60 fps
const FREELY_PULSE_MS  = 2000;
const BEATS_PER_BAR    = 4;  // 4/4 time

// ── Module-level state ────────────────────────────────────────────────────────

let _state = {
  running:        false,
  paused:         false,
  intervalId:     null,
  beats_ms:       [],
  bpm:            120,
  mode:           HAPTIC_MODES.CLICK,
  intensity:      'medium',    // 'off' | 'light' | 'medium' | 'heavy'
  startRealTime:  0,           // Date.now() when clock was started/resumed
  offsetMs:       0,           // playback position in ms when started/resumed
  nextBeatIndex:  0,
  barIndex:       0,
  onBeat:         null,
  onBar:          null,
  freelyTimer:    0,           // tracks next freely-pulse target in ms
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function _elapsedMs() {
  return Date.now() - _state.startRealTime + _state.offsetMs;
}

/** Map intensity level to Haptics style. */
function _impactStyle() {
  switch (_state.intensity) {
    case 'heavy': return Haptics.ImpactFeedbackStyle.Heavy;
    case 'light': return Haptics.ImpactFeedbackStyle.Light;
    default:      return Haptics.ImpactFeedbackStyle.Medium;
  }
}

function _fireDownbeat() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

function _fireBeat() {
  if (_state.intensity === 'off') return;
  Haptics.impactAsync(_impactStyle()).catch(() => {});
}

function _fireFreely() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

function _tick() {
  if (!_state.running || _state.paused) return;

  const now = _elapsedMs();
  const { mode, beats_ms, nextBeatIndex } = _state;

  // ── FREELY mode ─────────────────────────────────────────────────────────────
  if (mode === HAPTIC_MODES.FREELY) {
    if (now >= _state.freelyTimer) {
      _fireFreely();
      _state.freelyTimer = now + FREELY_PULSE_MS;
    }
    return;
  }

  if (mode === HAPTIC_MODES.OFF) return;

  // ── CLICK / DOWNBEAT_ONLY modes ──────────────────────────────────────────────
  if (nextBeatIndex >= beats_ms.length) return;

  // Drain all beats that have come due (handles any dropped ticks).
  while (
    _state.nextBeatIndex < beats_ms.length &&
    now >= beats_ms[_state.nextBeatIndex]
  ) {
    const beatIndex    = _state.nextBeatIndex;
    const isDownbeat   = (beatIndex % BEATS_PER_BAR) === 0;
    const currentBar   = Math.floor(beatIndex / BEATS_PER_BAR);

    if (mode === HAPTIC_MODES.CLICK) {
      if (_state.intensity !== 'off') {
        if (isDownbeat) {
          _fireDownbeat();
        } else {
          _fireBeat();
        }
      }
    } else if (mode === HAPTIC_MODES.DOWNBEAT_ONLY) {
      if (isDownbeat && _state.intensity !== 'off') {
        _fireDownbeat();
      }
    }

    if (typeof _state.onBeat === 'function') {
      try { _state.onBeat(beatIndex, isDownbeat); } catch (_) {}
    }

    if (isDownbeat && currentBar !== _state.barIndex) {
      _state.barIndex = currentBar;
      if (typeof _state.onBar === 'function') {
        try { _state.onBar(currentBar); } catch (_) {}
      }
    }

    _state.nextBeatIndex += 1;
  }
}

function _findNextBeatIndex(beats_ms, currentMs) {
  // Binary search for first beat >= currentMs
  let lo = 0, hi = beats_ms.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (beats_ms[mid] < currentMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function _clearTimer() {
  if (_state.intervalId !== null) {
    clearInterval(_state.intervalId);
    _state.intervalId = null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the haptic click track.
 *
 * @param {object} params
 * @param {number[]} params.beats_ms - Beat timestamps in milliseconds from waveform analysis.
 * @param {number}   params.bpm      - Current song BPM.
 * @param {number}   [params.startPositionMs=0] - Playback offset; use when user has scrubbed.
 * @param {string}   [params.mode]   - One of HAPTIC_MODES (default CLICK).
 * @param {Function} [params.onBeat] - Called with (beatIndex: number, isDownbeat: boolean).
 * @param {Function} [params.onBar]  - Called with (barIndex: number).
 * @returns {{ stop: Function, isRunning: () => boolean }}
 */
export function startHapticClock({
  beats_ms = [],
  bpm = 120,
  startPositionMs = 0,
  mode = HAPTIC_MODES.CLICK,
  onBeat = null,
  onBar = null,
} = {}) {
  _clearTimer();

  _state = {
    running:       true,
    paused:        false,
    intervalId:    null,
    beats_ms:      beats_ms.slice().sort((a, b) => a - b),
    bpm,
    mode,
    intensity:     _state.intensity || 'medium',
    startRealTime: Date.now(),
    offsetMs:      startPositionMs,
    nextBeatIndex: _findNextBeatIndex(beats_ms, startPositionMs),
    barIndex:      Math.floor(_findNextBeatIndex(beats_ms, startPositionMs) / BEATS_PER_BAR),
    onBeat,
    onBar,
    freelyTimer:   startPositionMs + (mode === HAPTIC_MODES.FREELY ? 0 : 0),
  };

  _state.intervalId = setInterval(_tick, TICK_INTERVAL_MS);

  return {
    stop:      stopHapticClock,
    isRunning: () => _state.running && !_state.paused,
  };
}

/** Stop the haptic clock entirely. Safe to call multiple times. */
export function stopHapticClock() {
  _state.running = false;
  _state.paused  = false;
  _clearTimer();
}

/** Pause without losing position. */
export function pauseHapticClock() {
  if (!_state.running || _state.paused) return;
  // Record how far we are so we can resume from here.
  _state.offsetMs = _elapsedMs();
  _state.paused   = true;
  _clearTimer();
}

/**
 * Resume from where we paused.
 * If called without a prior pause it's a no-op.
 */
export function resumeHapticClock() {
  if (!_state.running || !_state.paused) return;
  _state.startRealTime = Date.now();
  // offsetMs already holds the paused position.
  _state.paused        = false;
  _state.intervalId    = setInterval(_tick, TICK_INTERVAL_MS);
}

/**
 * Set haptic feedback intensity.
 * @param {'off'|'light'|'medium'|'heavy'} level
 */
export function setHapticIntensity(level) {
  if (['off', 'light', 'medium', 'heavy'].includes(level)) {
    _state.intensity = level;
  }
}

/**
 * Seek to a new playback position without stopping the clock.
 * Call this whenever the user scrubs the waveform.
 * @param {number} positionMs
 */
export function seekHapticClock(positionMs) {
  _state.offsetMs      = positionMs;
  _state.startRealTime = Date.now();
  _state.nextBeatIndex = _findNextBeatIndex(_state.beats_ms, positionMs);
  _state.barIndex      = Math.floor(_state.nextBeatIndex / BEATS_PER_BAR);
  if (_state.mode === HAPTIC_MODES.FREELY) {
    _state.freelyTimer = positionMs;
  }
}

/**
 * Switch haptic mode without restarting the clock.
 * @param {string} mode - One of HAPTIC_MODES.
 */
export function setHapticMode(mode) {
  if (Object.values(HAPTIC_MODES).includes(mode)) {
    _state.mode = mode;
    if (mode === HAPTIC_MODES.FREELY) {
      _state.freelyTimer = _elapsedMs();
    }
  }
}
