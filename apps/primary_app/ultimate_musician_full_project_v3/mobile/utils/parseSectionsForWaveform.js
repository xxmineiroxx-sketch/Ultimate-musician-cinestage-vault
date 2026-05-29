/**
 * parseSectionsForWaveform(chart, durationSec)
 *
 * Parses a lyrics/chord chart and returns section cue markers for the waveform.
 * Delegates vocabulary to sectionUtils — single source of truth for EN + PT-BR.
 */
import { SECTION_RE, colorForSection } from './sectionUtils';

function toTitleCase(str) {
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function parseSectionsForWaveform(chart, durationSec) {
  if (!chart || durationSec <= 0) return [];

  const lines   = chart.split(/\r?\n/);
  const total   = lines.length || 1;
  const results = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 80) return;

    let rawLabel    = null;
    let fromBracket = false;

    // Format 1: [Section Name]
    const bracket = trimmed.match(/^\[([^\]]+)\]$/);
    if (bracket) {
      rawLabel    = bracket[1];
      fromBracket = true;
    }

    // Format 2: "Label:" or "Label:| chords |..."
    if (!rawLabel) {
      const colon = trimmed.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\s\-]*?)\s*:/);
      if (colon && SECTION_RE.test(colon[1].trim())) {
        rawLabel = colon[1].trim();
      }
    }

    // Format 3: Bare standalone section line
    if (!rawLabel) {
      const isChordLine = /^\|/.test(trimmed) || /^[A-G][b#m]?\s*$/.test(trimmed);
      if (!isChordLine && trimmed.length < 50 && SECTION_RE.test(trimmed)) {
        rawLabel = trimmed;
      }
    }

    if (!rawLabel) return;
    rawLabel = rawLabel.trim();
    if (!fromBracket && !SECTION_RE.test(rawLabel)) return;

    const label   = toTitleCase(rawLabel);
    const timeSec = (idx / total) * durationSec;
    const color   = colorForSection(label);

    results.push({ label, timeSec, positionSeconds: timeSec, color });
  });

  const deduped = results.filter(
    (s, i) => i === 0 || s.label !== results[i - 1].label,
  );

  return deduped.length >= 2 ? deduped : [];
}
