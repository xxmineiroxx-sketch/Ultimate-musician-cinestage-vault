/**
 * spontaneousPad.js
 *
 * Generates a key-matched ambient pad when the worship leader goes "freely".
 * Pre-recorded pads (sustained ambient chords) are fetched from the CineStage
 * CDN and played via expo-av Sound with fade in/out and crossfade support.
 */

import { Audio } from 'expo-av';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAD_CDN_BASE = 'https://cinestage.ultimatelabs.co/storage/pads';

const FADE_STEP_MS     = 100;   // Volume update interval during fades
const DEFAULT_FADE_IN  = 3000;
const DEFAULT_FADE_OUT = 4000;
const DEFAULT_VOLUME   = 0.6;

/** All 12 chromatic keys in major and minor forms. */
export const PAD_KEYS = [
  { key: 'C',  mode: 'major' }, { key: 'C',  mode: 'minor' },
  { key: 'Db', mode: 'major' }, { key: 'Db', mode: 'minor' },
  { key: 'D',  mode: 'major' }, { key: 'D',  mode: 'minor' },
  { key: 'Eb', mode: 'major' }, { key: 'Eb', mode: 'minor' },
  { key: 'E',  mode: 'major' }, { key: 'E',  mode: 'minor' },
  { key: 'F',  mode: 'major' }, { key: 'F',  mode: 'minor' },
  { key: 'Gb', mode: 'major' }, { key: 'Gb', mode: 'minor' },
  { key: 'G',  mode: 'major' }, { key: 'G',  mode: 'minor' },
  { key: 'Ab', mode: 'major' }, { key: 'Ab', mode: 'minor' },
  { key: 'A',  mode: 'major' }, { key: 'A',  mode: 'minor' },
  { key: 'Bb', mode: 'major' }, { key: 'Bb', mode: 'minor' },
  { key: 'B',  mode: 'major' }, { key: 'B',  mode: 'minor' },
];

// ── Module-level state ────────────────────────────────────────────────────────

let _active = {
  sound:       null,
  key:         null,
  mode:        null,
  targetVol:   DEFAULT_VOLUME,
  fadeTimerId: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _padUrl(key, mode) {
  return `${PAD_CDN_BASE}/${key}_${mode}.mp3`;
}

/** Cancel any in-progress fade. */
function _clearFade() {
  if (_active.fadeTimerId !== null) {
    clearInterval(_active.fadeTimerId);
    _active.fadeTimerId = null;
  }
}

/**
 * Ramp a Sound object's volume from `fromVol` to `toVol` over `durationMs`.
 * Resolves when the fade completes.
 *
 * @param {Audio.Sound} sound
 * @param {number} fromVol
 * @param {number} toVol
 * @param {number} durationMs
 * @returns {Promise<void>}
 */
function _fade(sound, fromVol, toVol, durationMs) {
  return new Promise((resolve) => {
    if (!sound || durationMs <= 0) {
      if (sound) sound.setVolumeAsync(toVol).catch(() => {});
      resolve();
      return;
    }

    const steps     = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
    const delta     = (toVol - fromVol) / steps;
    let   current   = fromVol;
    let   stepsDone = 0;

    const id = setInterval(async () => {
      stepsDone++;
      current += delta;
      const vol = Math.max(0, Math.min(1, current));

      try { await sound.setVolumeAsync(vol); } catch (_) {}

      if (stepsDone >= steps) {
        clearInterval(id);
        resolve();
      }
    }, FADE_STEP_MS);

    _active.fadeTimerId = id;
  });
}

/**
 * Load and start a Sound, ready for fade-in.
 * Returns the Sound object at volume 0.
 */
async function _loadSound(key, mode) {
  const uri = _padUrl(key, mode);
  const { sound } = await Audio.Sound.createAsync(
    { uri },
    {
      shouldPlay:  true,
      isLooping:   true,
      volume:      0,
    },
  );
  return sound;
}

async function _unloadSound(sound) {
  if (!sound) return;
  try {
    await sound.stopAsync();
    await sound.unloadAsync();
  } catch (_) {}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start (or restart) an ambient pad for the given key/mode.
 *
 * @param {object} params
 * @param {string} params.key       - e.g. 'G', 'Eb', 'Bb'
 * @param {'major'|'minor'} [params.mode='major']
 * @param {number} [params.volume=0.6]   - Target volume 0-1.
 * @param {number} [params.fadeInMs=3000]
 * @returns {Promise<{ stop: Function, setVolume: Function, crossfadeTo: Function }>}
 */
export async function startPad({
  key,
  mode = 'major',
  volume = DEFAULT_VOLUME,
  fadeInMs = DEFAULT_FADE_IN,
} = {}) {
  // Stop any existing pad before starting a new one.
  await stopPad({ fadeOutMs: 0 });

  // Set audio session to allow playback alongside recordings (duck mode).
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:   false,
      playsInSilentModeIOS: true,
      interruptionModeIOS:  Audio.INTERRUPTION_MODE_IOS_DUCK_OTHERS,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS,
      shouldDuckAndroid: true,
    });
  } catch (_) {}

  const sound = await _loadSound(key, mode);

  _active.sound     = sound;
  _active.key       = key;
  _active.mode      = mode;
  _active.targetVol = volume;

  await _fade(sound, 0, volume, fadeInMs);

  return {
    stop:        (opts) => stopPad(opts),
    setVolume:   (v)    => setVolume(v),
    crossfadeTo: (opts) => crossfadePad(opts),
  };
}

/**
 * Stop the active pad with a fade-out.
 *
 * @param {object} [params]
 * @param {number} [params.fadeOutMs=4000]
 */
export async function stopPad({ fadeOutMs = DEFAULT_FADE_OUT } = {}) {
  if (!_active.sound) return;

  _clearFade();

  const sound = _active.sound;
  const startVol = _active.targetVol;

  // Null out early so crossfade doesn't race.
  _active.sound = null;
  _active.key   = null;
  _active.mode  = null;

  await _fade(sound, startVol, 0, fadeOutMs);
  await _unloadSound(sound);
}

/**
 * Set the volume of the active pad immediately.
 * @param {number} volume - 0 to 1.
 */
export async function setVolume(volume) {
  const vol = Math.max(0, Math.min(1, volume));
  _active.targetVol = vol;
  if (_active.sound) {
    try { await _active.sound.setVolumeAsync(vol); } catch (_) {}
  }
}

/**
 * Crossfade to a different key/mode without silence.
 *
 * The new pad fades in while the old pad fades out simultaneously.
 *
 * @param {object} params
 * @param {string} params.key
 * @param {'major'|'minor'} [params.mode='major']
 * @param {number} [params.fadeMs=3000]
 * @param {number} [params.volume]        - Target volume; defaults to current target.
 */
export async function crossfadePad({
  key,
  mode = 'major',
  fadeMs = DEFAULT_FADE_IN,
  volume,
} = {}) {
  const targetVol  = volume ?? _active.targetVol ?? DEFAULT_VOLUME;
  const oldSound   = _active.sound;
  const oldVol     = _active.targetVol;

  // Start new pad at 0 volume.
  const newSound = await _loadSound(key, mode);

  // Update active state to the new pad immediately so setVolume / stop work.
  _active.sound     = newSound;
  _active.key       = key;
  _active.mode      = mode;
  _active.targetVol = targetVol;

  // Fade in new + fade out old concurrently.
  await Promise.all([
    _fade(newSound, 0, targetVol, fadeMs),
    oldSound ? _fade(oldSound, oldVol, 0, fadeMs).then(() => _unloadSound(oldSound)) : Promise.resolve(),
  ]);
}

/** @returns {boolean} Whether a pad is currently loaded and active. */
export function isPadActive() {
  return _active.sound !== null;
}

/** @returns {{ key: string, mode: string } | null} The currently playing key and mode. */
export function getCurrentPadKey() {
  if (!_active.sound) return null;
  return { key: _active.key, mode: _active.mode };
}

// ── Key Parser Helper ─────────────────────────────────────────────────────────

// Normalisation table: aliases / enharmonic spellings → canonical key names
// that match the CDN filename format.
const KEY_ALIASES = {
  'c#': 'Db', 'c sharp': 'Db',
  'db': 'Db', 'd flat': 'Db', 'des': 'Db',
  'd#': 'Eb', 'd sharp': 'Eb',
  'eb': 'Eb', 'e flat': 'Eb', 'es': 'Eb',
  'e#': 'F',  'e sharp': 'F',
  'fb': 'E',  'f flat': 'E',
  'f#': 'Gb', 'f sharp': 'Gb',
  'gb': 'Gb', 'g flat': 'Gb', 'ges': 'Gb',
  'g#': 'Ab', 'g sharp': 'Ab',
  'ab': 'Ab', 'a flat': 'Ab', 'as': 'Ab',
  'a#': 'Bb', 'a sharp': 'Bb',
  'bb': 'Bb', 'b flat': 'Bb', 'bes': 'Bb', 'hes': 'Bb',
  'b#': 'C',  'b sharp': 'C',
  'cb': 'B',  'c flat': 'B',
};

const VALID_KEYS = new Set(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']);

/**
 * Parse a key string from waveform analysis data into { key, mode }.
 *
 * Handles inputs like:
 *   "G Major", "A Minor", "Eb Major", "g minor", "F# Major" → { key: 'Gb', mode: 'major' }
 *
 * @param {object|string} waveformData - Normalised waveform object (uses .key field) or raw string.
 * @returns {{ key: string, mode: 'major'|'minor' } | null}
 */
export function keyFromWaveformData(waveformData) {
  const raw = typeof waveformData === 'string'
    ? waveformData
    : (waveformData?.key || waveformData?.analysis?.key || null);

  if (!raw || typeof raw !== 'string') return null;

  const str = raw.trim();

  // Split on whitespace: e.g. "G Major" → ['G', 'Major']
  const parts = str.split(/\s+/);
  if (parts.length < 1) return null;

  const keyPart  = parts[0];
  const modePart = (parts[1] || '').toLowerCase();

  const mode = modePart === 'minor' ? 'minor' : 'major';

  // Normalise the key part.
  const keyLower = keyPart.toLowerCase();
  let resolved   = null;

  // Direct alias lookup.
  if (KEY_ALIASES[keyLower]) {
    resolved = KEY_ALIASES[keyLower];
  } else {
    // Capitalise first letter and check validity (e.g. "g" → "G").
    const capitalised = keyPart.charAt(0).toUpperCase() + keyPart.slice(1).toLowerCase();
    if (VALID_KEYS.has(capitalised)) {
      resolved = capitalised;
    }
  }

  if (!resolved) return null;

  return { key: resolved, mode };
}
