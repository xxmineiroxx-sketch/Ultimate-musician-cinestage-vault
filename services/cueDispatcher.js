/**
 * Cue Dispatcher v1
 *
 * Sends section + loop state updates to external systems through Bridge.
 * Targets:
 * - ProPresenter / Lyrics software (OSC/MIDI via Bridge)
 * - Lighting cues (OSC/ArtNet via Bridge)
 *
 * Message format is generic; Bridge maps it to actual protocols.
 */

import { sendBridge } from './bridgeClient';
import { buildProPresenterMidi } from './propresenterMidiMap';

function hexToRgb(hex) {
  if (!hex) return null;
  const clean = hex.replace('#','');
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0,2),16);
  const g = parseInt(clean.slice(2,4),16);
  const b = parseInt(clean.slice(4,6),16);
  if ([r,g,b].some(v => Number.isNaN(v))) return null;
  return { r, g, b };
}

export function sendSectionCue({ songTitle, marker, songIndex = 0, midiConfig = null, loopActive = false, propresenterFileUri = null, serviceFileUri = null }) {
  if (!marker) return;
  const midi = buildProPresenterMidi({ songIndex, marker, midiConfig: midiConfig || {} });
  sendBridge({
    type: 'SECTION_CUE',
    songTitle: songTitle || 'Unknown',
    songIndex,
    propresenterFileUri,
    serviceFileUri,
    section: {
      id: marker.id,
      name: marker.name,
      type: marker.type,
      start: marker.start,
      end: marker.end,
      lyricsCue: marker.lyricsCue ?? null,
      lightingCue: marker.lightingCue ?? null,
      lightingColor: marker.lightingColor ?? null,
      lightingColorRgb: hexToRgb(marker.lightingColor),
      midiCue: marker.midiCue ?? null,
    },
    midi,
    loopActive,
    ts: Date.now(),
  });
}

export function sendLoopState({ active, marker }) {
  sendBridge({
    type: 'LOOP_STATE',
    active: !!active,
    sectionId: marker?.id || null,
    sectionName: marker?.name || null,
    ts: Date.now(),
  });
}

export function sendPitchShift({ semitones = 0, mode = 'OFF' }) {
  sendBridge({
    type: 'PITCH_SHIFT',
    semitones,
    mode,
    ts: Date.now(),
  });
}

export function sendTransport({ action, positionSec, bpm }) {
  sendBridge({
    type: 'TRANSPORT',
    action, // play/pause/stop/seek
    positionSec: positionSec ?? 0,
    bpm: bpm ?? 120,
    ts: Date.now(),
  });
}
