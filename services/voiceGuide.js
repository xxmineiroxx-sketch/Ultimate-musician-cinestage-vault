/**
 * Voice Guide v1.2 (TTS-first)
 * - Cue lead time (NONE / seconds / 1BAR)
 * - Speak once or repeat
 * - Visual-only cue (no audio)
 * - Count-in voice: "1,2,3,4, Intro" before a section based on marker.countInBars
 */

import * as Speech from 'expo-speech';

export function speak(phrase, { rate = 0.95, pitch = 1.0, repeat = "ONCE" } = {}) {
  const say = () => Speech.speak(phrase, { rate, pitch });
  say();
  if (repeat === "TWICE") setTimeout(() => say(), 650);
}

export function formatCueText(marker, mode = 'TYPE_COLON_NAME') {
  const type = marker?.type || '';
  const name = marker?.name || '';
  if (mode === 'NAME_ONLY') return name;
  if (mode === 'TYPE_THEN_NAME') return type ? `${type} ${name}`.trim() : name;
  // TYPE_COLON_NAME
  return type ? `${type}: ${name}`.trim() : name;
}

export function speakCountIn({ beats = 4, markerName = "Intro", rate = 0.95 } = {}) {
  // Simple spoken count: "1, 2, 3, 4, Intro"
  const phrase = Array.from({ length: beats }, (_, i) => String(i + 1)).join(", ") + `, ${markerName}`;
  Speech.speak(phrase, { rate, pitch: 1.0 });
}

export function leadTimeToSeconds(leadTime, bpm) {
  if (!leadTime || leadTime === "NONE") return 0;
  if (leadTime === "0.5s") return 0.5;
  if (leadTime === "1s") return 1;
  if (leadTime === "2s") return 2;
  if (leadTime === "1BAR") {
    const beat = 60 / (bpm || 120);
    return beat * 4;
  }
  return 0;
}

export function barsToSeconds(bars, bpm) {
  const beat = 60 / (bpm || 120);
  return beat * 4 * (bars || 0);
}

/**
 * Schedule cue timers based on marker start times (seconds from "now").
 * Supports:
 * - visual-only cues (overlay)
 * - voice cues (marker name)
 * - count-in bars prior to section start:
 *   If marker.countInBars > 0, we schedule a count-in phrase at start - barsToSeconds(countInBars).
 *   Count-in uses 4 beats spoken.
 */
export function scheduleCues({ markers, bpm, onVisualCue, onCountIn, cueTextMode = 'TYPE_COLON_NAME' } = {}) {
  const timers = [];
  const safeMarkers = markers || [];

  for (const m of safeMarkers) {
    const start = (m.start || 0);

    // Count-in scheduling (if enabled)
    if (m.countInBars && m.countInBars > 0) {
      const whenCountIn = Math.max(0, start - barsToSeconds(m.countInBars, bpm));
      const tCount = setTimeout(() => {
        if (m.cueVisualOnly && onVisualCue) onVisualCue({ marker: { ...m, name: `Count-in: ${m.name}` }, whenSec: whenCountIn });
        if (!m.cueVisualOnly) {
          if (onCountIn) onCountIn(m);
          else speakCountIn({ markerName: formatCueText(m, cueTextMode) });
        }
      }, whenCountIn * 1000);
      timers.push(tCount);
    }

    // Main cue scheduling
    if (!m.cueVoice && !m.cueVisualOnly) continue;

    const lead = leadTimeToSeconds(m.cueLeadTime, bpm);
    const when = Math.max(0, start - lead);

    const timer = setTimeout(() => {
      if (m.cueVisualOnly && onVisualCue) onVisualCue({ marker: m, whenSec: when });
      if (!m.cueVisualOnly && m.cueVoice) speak(formatCueText(m, cueTextMode), { repeat: m.cueRepeat || "ONCE" });
    }, when * 1000);

    timers.push(timer);
  }
  return timers;
}

export function cancelCues(timers = []) {
  timers.forEach(t => clearTimeout(t));
}
