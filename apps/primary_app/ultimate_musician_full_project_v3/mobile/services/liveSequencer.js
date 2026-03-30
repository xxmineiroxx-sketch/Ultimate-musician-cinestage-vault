/**
 * liveSequencer.js
 *
 * Orchestrates the full live rehearsal sequence:
 *   1. Count-in  → plays "1, 2, 3, 4" audio beats at song BPM
 *   2. Pad start → loads + loops the correct key pad after 1 bar
 *   3. Cue guide → announces upcoming sections 1 bar before each marker
 *
 * Usage in RehearsalScreen:
 *   import { startSequence, stopSequence, setPadVolume } from '../services/liveSequencer';
 */

import { Audio } from "expo-av";

import {
  resolveGuideUrl,
  resolveCountUrl,
  resolvePadUrl,
  playGuideFile,
} from "./audioGuide";

let _timers = [];
let _padSound = null;
let _padVol = 0.6;

/** Stop all timers + unload pad */
export function stopSequence() {
  _timers.forEach(clearTimeout);
  _timers = [];
  if (_padSound) {
    _padSound.stopAsync().catch(() => {});
    _padSound.unloadAsync().catch(() => {});
    _padSound = null;
  }
}

export async function setPadVolume(vol) {
  _padVol = Math.max(0, Math.min(vol, 1.5));
  if (_padSound) await _padSound.setVolumeAsync(_padVol).catch(() => {});
}

/** Stop only the pad (leave timers/cues running). Fades out over fadeMs. */
export async function stopSequencePad(fadeMs = 600) {
  if (!_padSound) return;
  const dying = _padSound;
  _padSound = null;
  // Fade out then unload
  const steps = 12;
  const stepMs = Math.max(16, Math.floor(fadeMs / steps));
  for (let i = steps - 1; i >= 0; i--) {
    await new Promise((r) => setTimeout(r, stepMs));
    dying.setVolumeAsync((i / steps) * _padVol).catch(() => {});
  }
  dying.stopAsync().catch(() => {});
  dying.unloadAsync().catch(() => {});
}

/** Swap the running pad to a different key with a crossfade. */
export async function startSequencePad(note, vol = 2, fadeMs = 900) {
  if (!note) {
    await stopSequencePad(fadeMs);
    return;
  }
  const url = resolvePadUrl(note, vol);
  let incoming;
  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { volume: 0, shouldPlay: true, isLooping: true },
    );
    incoming = sound;
  } catch (e) {
    console.warn('[LiveSeq] startSequencePad load failed:', url, e?.message);
    return;
  }

  const outgoing = _padSound;
  _padSound = incoming; // register new sound immediately so stop/seek hits it

  const steps = 16;
  const stepMs = Math.max(16, Math.floor(fadeMs / steps));
  for (let i = 1; i <= steps; i++) {
    await new Promise((r) => setTimeout(r, stepMs));
    const t = i / steps;
    incoming.setVolumeAsync(t * _padVol).catch(() => {});
    if (outgoing) outgoing.setVolumeAsync((1 - t) * _padVol).catch(() => {});
  }

  if (outgoing) {
    outgoing.stopAsync().catch(() => {});
    outgoing.unloadAsync().catch(() => {});
  }
}

/**
 * Start the live sequence from the given playback position.
 *
 * @param {object} opts
 * @param {number}   opts.bpm         Song tempo (default 120)
 * @param {string}   opts.timeSig     e.g. '4/4', '3/4' (default '4/4')
 * @param {string}   opts.songKey     e.g. 'G', 'C#' (default 'C')
 * @param {number}   opts.padVol      1 | 2 | 3 — Motion Pads volume set (default 2)
 * @param {Array}    opts.markers     Marker objects with { start, label, name }
 * @param {number}   opts.position    Current playback position in seconds
 * @param {number}   opts.padVolume   Pad audio gain 0-1 (default 0.6)
 * @param {number}   opts.guideVolume Guide audio gain 0-1 (default 0.85)
 * @param {string}   opts.lang        'PT' | 'EN' (default 'PT')
 * @param {function} opts.onCountBeat Called with beat number (1…n) during count-in
 * @param {function} opts.onPadStart  Called when pad starts looping
 * @param {function} opts.onCueFire   Called with section label string when cue fires
 * @param {function} opts.onPlayStart Called after count-in — trigger audioEngine.play() here
 */
export async function startSequence({
  bpm = 120,
  timeSig = "4/4",
  songKey = "C",
  padVol = 2,
  markers = [],
  position = 0,
  padVolume = 0.6,
  guideVolume = 0.85,
  lang = "PT",
  skipPad = true,   // when true: pad never auto-starts (user must trigger it manually)
  skipAudioCues = false, // when true: section cue audio is suppressed (stems mode)
  onCountBeat,
  onPadStart,
  onCueFire,
  onPlayStart,
} = {}) {
  stopSequence();

  const safeBpm = Math.max(40, Number(bpm) || 120);
  const beats = Math.max(2, parseInt((timeSig || "4/4").split("/")[0]) || 4);
  const beatMs = (60 / safeBpm) * 1000;
  const barMs = beatMs * beats;

  _padVol = padVolume;

  // ── Step 1: Pre-load all count-in sounds, then play at exact beat times ───
  // We do NOT use playGuideFile here — it stops the previous sound when the
  // next fires (shared _guideSound), which cuts off beats. Instead each beat
  // gets its own fire-and-forget Sound instance, pre-loaded before the first
  // setTimeout fires so there is no network-fetch latency during the count-in.
  const countUrls = Array.from({ length: beats }, (_, i) => resolveCountUrl(i + 1, lang));
  const countSounds = await Promise.all(
    countUrls.map(async (url) => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: false, volume: guideVolume },
        );
        return sound;
      } catch {
        return null;
      }
    }),
  );

  for (let b = 1; b <= beats; b++) {
    const delay = (b - 1) * beatMs;
    const sound = countSounds[b - 1];
    const t = setTimeout(() => {
      if (onCountBeat) onCountBeat(b);
      if (sound) {
        sound.playAsync().catch(() => {});
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.didJustFinish) sound.unloadAsync().catch(() => {});
        });
      }
    }, delay);
    _timers.push(t);
  }

  // ── Step 2: After the final count-in beat → start stems + pad + announce first section ──────
  const afterCountIn = setTimeout(async () => {
    // Start stems via callback
    if (onPlayStart) onPlayStart();

    // Start pad (looping) — only if skipPad is false (user must opt-in)
    if (!skipPad) {
      const url = resolvePadUrl(songKey, padVol);
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { volume: padVolume, shouldPlay: true, isLooping: true },
        );
        _padSound = sound;
        if (onPadStart) onPadStart();
      } catch (e) {
        console.warn("[LiveSeq] pad load failed:", url, e?.message);
      }
    }

    // Announce the first upcoming section immediately
    const firstMarker = [...markers]
      .filter((m) => (m.start || 0) >= position)
      .sort((a, b) => a.start - b.start)[0];
    if (firstMarker) {
      const label = firstMarker.label || firstMarker.name || "";
      if (label) {
        if (onCueFire) onCueFire(label);
        if (!skipAudioCues) {
          const url = resolveGuideUrl(label);
          if (url) playGuideFile(url, guideVolume);
        }
      }
    }

    // Schedule pre-announcements for ALL upcoming markers (1 bar lead)
    for (const marker of markers) {
      const markerRelSec = (marker.start || 0) - position;
      if (markerRelSec <= 0) continue; // already past
      if (marker === firstMarker) continue; // already announced

      const label = marker.label || marker.name || "";
      if (!label) continue;

      const announceInMs = markerRelSec * 1000 - barMs;
      if (announceInMs < 100) continue; // too close, skip

      const t = setTimeout(() => {
        if (onCueFire) onCueFire(label);
        if (!skipAudioCues) {
          const cueUrl = resolveGuideUrl(label);
          if (cueUrl) playGuideFile(cueUrl, guideVolume);
        }
      }, announceInMs);
      _timers.push(t);
    }
  }, barMs);

  _timers.push(afterCountIn);
}

/**
 * Schedule cues for remaining markers (used when resuming mid-song without count-in).
 */
export function scheduleCuesFromPosition({
  markers = [],
  position = 0,
  bpm = 120,
  timeSig = "4/4",
  guideVolume = 0.85,
  onCueFire,
}) {
  // Clear only cue timers (not pad)
  _timers.forEach(clearTimeout);
  _timers = [];

  const beats = Math.max(2, parseInt((timeSig || "4/4").split("/")[0]) || 4);
  const beatMs = (60 / Math.max(40, Number(bpm) || 120)) * 1000;
  const barMs = beatMs * beats;

  for (const marker of markers) {
    const markerRelSec = (marker.start || 0) - position;
    if (markerRelSec <= 0) continue;

    const label = marker.label || marker.name || "";
    if (!label) continue;

    const announceInMs = markerRelSec * 1000 - barMs;
    if (announceInMs < 100) continue;

    const t = setTimeout(() => {
      if (onCueFire) onCueFire(label);
      const cueUrl = resolveGuideUrl(label);
      if (cueUrl) playGuideFile(cueUrl, guideVolume);
    }, announceInMs);
    _timers.push(t);
  }
}
