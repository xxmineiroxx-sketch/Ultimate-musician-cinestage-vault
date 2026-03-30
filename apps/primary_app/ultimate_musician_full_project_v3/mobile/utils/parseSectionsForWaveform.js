/**
 * parseSectionsForWaveform(chart, durationSec)
 *
 * Parses a lyrics/chord chart and returns section cue markers for the waveform
 * pipeline.  Handles all common formats:
 *
 *   [Verse 1]              → bracket format
 *   Intro:| C | Am | ...   → label-colon (content on same line)
 *   Verse 1                → bare line (title-case or ALL CAPS)
 *   REPEAT CHORUS          → all-caps with compound name
 *   Alt Chorus             → adjective + section keyword
 *   Channel 2              → named instrument section with number
 *
 * Returns: Array<{ label, timeSec, positionSeconds, color }>
 */

// ── Vocabulary ─────────────────────────────────────────────────────────────────
// These keywords (and their prefixes) are recognised as section markers.
const SECTION_RE =
  /^(intro|verse|chorus|bridge|outro|pre[\s-]?chorus|channel|vamp|tag|hook|interlude|break|instrumental|solo|turnaround|refrain|coda|ending|repeat|alt(?:ernate)?|vamp|fill|part\s*\d|section\s*\d)/i;

// Color palette per section type
const COLOR_MAP = [
  [/intro/i,                '#6B7280'],
  [/verse/i,                '#6366F1'],
  [/pre.?chorus/i,          '#8B5CF6'],
  [/repeat.?chorus|chorus/i,'#EC4899'],
  [/bridge/i,               '#F59E0B'],
  [/outro|coda|ending/i,    '#10B981'],
  [/channel|interlude/i,    '#0EA5E9'],
  [/vamp|tag|hook|fill/i,   '#F97316'],
  [/instrumental|break|solo/i, '#6B7280'],
  [/alt/i,                  '#F472B6'],
  [/repeat/i,               '#EC4899'],
];

function colorFor(label) {
  for (const [re, color] of COLOR_MAP) {
    if (re.test(label)) return color;
  }
  return '#6366F1';
}

function toTitleCase(str) {
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ── Main export ────────────────────────────────────────────────────────────────
export function parseSectionsForWaveform(chart, durationSec) {
  if (!chart || durationSec <= 0) return [];

  const lines   = chart.split(/\r?\n/);
  const total   = lines.length || 1;
  const results = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 60) return;

    let rawLabel = null;

    // ── Format 1: [Section Name] ──────────────────────────────────────────────
    const bracket = trimmed.match(/^\[([^\]]+)\]$/);
    if (bracket) {
      rawLabel = bracket[1];
    }

    // ── Format 2: "Label:" or "Label:| chords |..." ────────────────────────
    if (!rawLabel) {
      const colon = trimmed.match(/^([A-Za-z][A-Za-z0-9\s\-]*?)\s*:/);
      if (colon && SECTION_RE.test(colon[1].trim())) {
        rawLabel = colon[1].trim();
      }
    }

    // ── Format 3: Bare standalone line ───────────────────────────────────────
    // Accept if: matches SECTION_RE, short, no chord-bar delimiters, not a
    // single chord letter (C, Am, G#, etc.)
    if (!rawLabel) {
      const isChordLine = /^\|/.test(trimmed) || /^[A-G][b#m]?\s*$/.test(trimmed);
      if (!isChordLine && trimmed.length < 50 && SECTION_RE.test(trimmed)) {
        rawLabel = trimmed;
      }
    }

    if (!rawLabel) return;

    rawLabel = rawLabel.trim();
    if (!SECTION_RE.test(rawLabel)) return;

    const label     = toTitleCase(rawLabel);
    const timeSec   = (idx / total) * durationSec;
    const color     = colorFor(label);

    results.push({ label, timeSec, positionSeconds: timeSec, color });
  });

  // Remove consecutive duplicates (e.g. two lines both saying "Chorus")
  const deduped = results.filter(
    (s, i) => i === 0 || s.label !== results[i - 1].label,
  );

  return deduped.length >= 2 ? deduped : [];
}
