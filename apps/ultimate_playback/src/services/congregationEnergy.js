/**
 * congregationEnergy.js
 *
 * Uses the device microphone to detect room energy during live worship and
 * surfaces real-time level readings + director suggestions.
 *
 * Uses expo-av Audio recording (already in package.json as expo-av ~16.0.8).
 */

import { Audio } from 'expo-av';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHUNK_MS       = 500;   // Recording chunk duration
const WINDOW_SIZE    = 5;     // Rolling window for trend detection (samples)
const DB_MIN         = -60;   // Silence floor in dBFS
const DB_MAX         = 0;     // Clipping ceiling in dBFS

// How many consecutive samples a condition must hold before suggesting.
const DROP_SAMPLES   = 6;     // 3 s / 0.5 s chunks
const RISE_SAMPLES   = 6;     // 3 s
const HIGH_SAMPLES   = 20;    // 10 s
const LOW_SAMPLES    = 30;    // 15 s

const HIGH_THRESHOLD = 70;    // 0-100 energy level
const LOW_THRESHOLD  = 30;
const DROP_DELTA     = 20;    // points drop to trigger loop suggestion
const RISE_DELTA     = 15;    // points rise to trigger extend suggestion

const SUGGESTION_COOLDOWN_MS = 30_000; // per-type minimum gap

// ── Module-level state ────────────────────────────────────────────────────────

let _recording    = null;
let _timer        = null;
let _running      = false;
let _sensitivity  = 'medium';

let _window       = [];          // Rolling energy window (0-100)
let _lastReading  = null;        // { level, trend, db }

let _lastSuggestionAt = {
  loop:       0,
  extend:     0,
  transition: 0,
  release:    0,
};

// Consecutive-sample counters for each suggestion condition.
let _dropCount       = 0;
let _riseCount       = 0;
let _highCount       = 0;
let _lowCount        = 0;

let _onEnergyUpdate  = null;
let _onSuggestion    = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert dBFS to 0-100 energy scale. */
function dbToLevel(db) {
  if (db == null || isNaN(db)) return 0;
  const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
  return Math.round(((clamped - DB_MIN) / (DB_MAX - DB_MIN)) * 100);
}

/** Apply sensitivity offset. High sensitivity = amplify low signals. */
function applySensitivity(level) {
  switch (_sensitivity) {
    case 'high': {
      // Stretch the signal so quiet rooms register higher.
      const boosted = Math.pow(level / 100, 0.6) * 100;
      return Math.min(100, Math.round(boosted));
    }
    case 'low': {
      // Compress: only loud signals register.
      const compressed = Math.pow(level / 100, 1.6) * 100;
      return Math.min(100, Math.round(compressed));
    }
    default:
      return level;
  }
}

function computeTrend(window) {
  if (window.length < 2) return 'stable';
  const oldest = window[0];
  const newest = window[window.length - 1];
  const delta  = newest - oldest;
  if (delta > 8)  return 'rising';
  if (delta < -8) return 'falling';
  return 'stable';
}

function canSuggest(type) {
  return Date.now() - (_lastSuggestionAt[type] || 0) >= SUGGESTION_COOLDOWN_MS;
}

function suggest(type, message, onSuggestion) {
  if (!canSuggest(type)) return;
  _lastSuggestionAt[type] = Date.now();
  if (typeof onSuggestion === 'function') {
    try { onSuggestion({ message, type }); } catch (_) {}
  }
}

async function _startChunk() {
  try {
    _recording = new Audio.Recording();
    await _recording.prepareToRecordAsync({
      android: {
        extension:         '.aac',
        outputFormat:      Audio.AndroidOutputFormat.AAC_ADTS,
        audioEncoder:      Audio.AndroidAudioEncoder.AAC,
        sampleRate:        22050,
        numberOfChannels:  1,
        bitRate:           64_000,
      },
      ios: {
        extension:         '.caf',
        audioQuality:      Audio.IOSAudioQuality.LOW,
        sampleRate:        22050,
        numberOfChannels:  1,
        bitRate:           64_000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat:  false,
      },
      isMeteringEnabled: true,
    });
    await _recording.startAsync();
  } catch (err) {
    // Permissions were revoked mid-session or device conflict — stop gracefully.
    _running = false;
    _clearTimer();
  }
}

async function _readAndCycle() {
  if (!_running || !_recording) return;

  try {
    const status = await _recording.getStatusAsync();
    const db     = status?.metering ?? status?.averageDecibels ?? null;
    const raw    = dbToLevel(db);
    const level  = applySensitivity(raw);

    // Update rolling window.
    _window.push(level);
    if (_window.length > WINDOW_SIZE) _window.shift();

    const trend = computeTrend(_window);
    _lastReading = { level, trend, db: db ?? DB_MIN };

    if (typeof _onEnergyUpdate === 'function') {
      try { _onEnergyUpdate(_lastReading); } catch (_) {}
    }

    // ── Suggestion logic ────────────────────────────────────────────────────
    const windowFirst = _window[0] ?? level;
    const drop        = windowFirst - level;
    const rise        = level - windowFirst;

    // Drop suggestion: level dropped >20 points since start of window.
    if (drop > DROP_DELTA) {
      _dropCount++;
      _riseCount  = 0;
      _highCount  = 0;
      _lowCount   = 0;
    } else {
      _dropCount = 0;
    }
    if (_dropCount >= DROP_SAMPLES) {
      suggest('loop', 'Congregation energy dropped — consider looping', _onSuggestion);
      _dropCount = 0;
    }

    // Rise suggestion.
    if (rise > RISE_DELTA) {
      _riseCount++;
      _dropCount  = 0;
      _highCount  = 0;
      _lowCount   = 0;
    } else {
      _riseCount = 0;
    }
    if (_riseCount >= RISE_SAMPLES) {
      suggest('extend', 'Energy rising — good time to build', _onSuggestion);
      _riseCount = 0;
    }

    // Sustained high.
    if (level >= HIGH_THRESHOLD) {
      _highCount++;
      _lowCount = 0;
    } else {
      _highCount = 0;
    }
    if (_highCount >= HIGH_SAMPLES) {
      suggest('transition', 'Peak energy — transition soon', _onSuggestion);
      _highCount = 0;
    }

    // Sustained low.
    if (level < LOW_THRESHOLD) {
      _lowCount++;
      _highCount = 0;
    } else {
      _lowCount = 0;
    }
    if (_lowCount >= LOW_SAMPLES) {
      suggest('release', 'Quiet moment — freely or release', _onSuggestion);
      _lowCount = 0;
    }
  } catch (_) {
    // Status read failed — not fatal, skip this chunk.
  }

  // Stop old recording and start a fresh chunk.
  try {
    await _recording.stopAndUnloadAsync();
  } catch (_) {}
  _recording = null;

  if (_running) {
    await _startChunk();
  }
}

function _clearTimer() {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start energy detection using the device microphone.
 *
 * @param {object}   params
 * @param {Function} params.onEnergyUpdate - Called with { level: 0-100, trend, db } each chunk.
 * @param {Function} [params.onSuggestion] - Called with { message, type } for director prompts.
 * @param {'low'|'medium'|'high'} [params.sensitivity='medium']
 * @returns {Promise<{ stop: Function }>}
 */
export async function startEnergyDetection({
  onEnergyUpdate,
  onSuggestion,
  sensitivity = 'medium',
} = {}) {
  if (_running) await stopEnergyDetection();

  // Request microphone permission.
  const { status } = await Audio.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('[congregationEnergy] Microphone permission denied');
  }

  // Configure audio session so recording works in silent mode on iOS.
  await Audio.setAudioModeAsync({
    allowsRecordingIOS:   true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeIOS:  Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
    interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });

  _running          = true;
  _sensitivity      = sensitivity;
  _onEnergyUpdate   = onEnergyUpdate;
  _onSuggestion     = onSuggestion || null;
  _window           = [];
  _lastReading      = null;
  _dropCount        = 0;
  _riseCount        = 0;
  _highCount        = 0;
  _lowCount         = 0;
  _lastSuggestionAt = { loop: 0, extend: 0, transition: 0, release: 0 };

  await _startChunk();

  // Poll every CHUNK_MS — read metering, cycle chunk.
  _timer = setInterval(() => {
    _readAndCycle().catch(() => {});
  }, CHUNK_MS);

  return { stop: stopEnergyDetection };
}

/** Stop detection and release the microphone. */
export async function stopEnergyDetection() {
  _running = false;
  _clearTimer();
  _onEnergyUpdate = null;
  _onSuggestion   = null;

  if (_recording) {
    try { await _recording.stopAndUnloadAsync(); } catch (_) {}
    _recording = null;
  }

  // Restore audio mode to playback-only (duck rather than stop stems).
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:   false,
      playsInSilentModeIOS: true,
      interruptionModeIOS:  Audio.INTERRUPTION_MODE_IOS_DUCK_OTHERS,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS,
      shouldDuckAndroid: true,
    });
  } catch (_) {}
}

/**
 * Returns the most recent energy reading, or null if not running.
 * @returns {{ level: number, trend: string, db: number } | null}
 */
export function getLastEnergyReading() {
  return _lastReading;
}
