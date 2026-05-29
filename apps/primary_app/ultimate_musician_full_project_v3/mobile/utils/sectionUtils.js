/**
 * sectionUtils.js — Single source of truth for section parsing across
 * StemMixerScreen, RehearsalScreen, LiveScreen, and the waveform pipeline.
 *
 * Supports English + PT-BR section names.
 */

// ── Bilingual section regex ──────────────────────────────────────────────────
export const SECTION_RE =
  /^(intro|verse|chorus|bridge|outro|pre[\s-]?chorus|channel|vamp|tag|hook|interlude|break|instrumental|solo|turnaround|refrain|coda|ending|repeat|alt(?:ernate)?|fill|part\s*\d|section\s*\d|refr[aã]o|ponte|abertura|final|parte|verso|interlúdio|pré[\s-]?refrão|primeira|segunda|terceira|quarta|quinta)/i;

// ── PT-BR → EN canonical mapping ────────────────────────────────────────────
const PT_MAP = [
  [/^refr[aã]o/i,                   'chorus'],
  [/^pré[\s-]?refr/i,               'pre-chorus'],
  [/^verso/i,                        'verse'],
  [/^ponte/i,                        'bridge'],
  [/^abertura/i,                     'intro'],
  [/^(final|coda|c[oó]da|ending)/i, 'outro'],
  [/^interl[uú]dio/i,               'interlude'],
  [/^parte/i,                        'verse'],
  [/^(primeira|segunda|terceira|quarta|quinta)/i, 'verse'],
];

/**
 * Normalize any EN or PT section label to a canonical EN key.
 * e.g. "Refrão 2" → "chorus", "Verse 1" → "verse", "Ponte" → "bridge"
 */
export function normSectionLabel(label) {
  if (!label) return '';
  const s = String(label).trim().toLowerCase();
  for (const [re, en] of PT_MAP) {
    if (re.test(s)) return en;
  }
  // Strip trailing number, normalize spaces → hyphens
  return s
    .replace(/\s*\d+\s*$/, '')
    .trim()
    .replace(/\s+/g, '-');
}

// ── Canonical color map ──────────────────────────────────────────────────────
export const SECTION_COLORS = {
  intro:          '#6B7280',
  verse:          '#6366F1',
  'pre-chorus':   '#8B5CF6',
  prechorus:      '#8B5CF6',
  chorus:         '#EC4899',
  bridge:         '#F59E0B',
  outro:          '#10B981',
  coda:           '#10B981',
  ending:         '#10B981',
  interlude:      '#0EA5E9',
  channel:        '#0EA5E9',
  vamp:           '#F97316',
  tag:            '#F97316',
  hook:           '#EC4899',
  repeat:         '#EC4899',
  refrain:        '#EC4899',
  instrumental:   '#6B7280',
  break:          '#6B7280',
  solo:           '#6B7280',
  alt:            '#F472B6',
};

/** Returns the color for any EN or PT section label. */
export function colorForSection(label) {
  const norm = normSectionLabel(label);
  return SECTION_COLORS[norm] || SECTION_COLORS[label?.toLowerCase()?.replace(/\s+/g, '-')] || '#6366F1';
}

// ── Default section fallback list ────────────────────────────────────────────
export const DEFAULT_SECTIONS = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'];

// ── Parse section labels from a chord chart / lyrics string ─────────────────
export function parseSectionsFromChart(text) {
  if (!text) return null;
  const seen = new Set();
  const found = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 80) continue;

    // Bracket format: [Refrão], [Verse 1]
    const bracket = trimmed.match(/^\[([^\]]+)\]$/);
    const raw = bracket ? bracket[1] : trimmed;

    if (!SECTION_RE.test(raw)) continue;

    const base = raw.replace(/\s*\d+\s*$/i, '').trim();
    const cap  = base.charAt(0).toUpperCase() + base.slice(1);
    const key  = cap.toLowerCase();
    if (!seen.has(key)) { seen.add(key); found.push(cap); }
  }
  return found.length >= 2 ? found : null;
}

// ── Mix presets keyed by canonical name ─────────────────────────────────────
export const SECTION_MIX_PRESETS = {
  intro:          { vocals: 0.55, drums: 0.40, bass: 0.50, keys: 0.50, guitars: 0.45, other: 0.45 },
  verse:          { vocals: 0.88, drums: 0.62, bass: 0.70, keys: 0.60, guitars: 0.60, other: 0.50 },
  'pre-chorus':   { vocals: 0.85, drums: 0.72, bass: 0.75, keys: 0.68, guitars: 0.68, other: 0.55 },
  chorus:         { vocals: 1.00, drums: 0.90, bass: 0.85, keys: 0.78, guitars: 0.82, other: 0.65 },
  bridge:         { vocals: 0.82, drums: 0.65, bass: 0.62, keys: 0.72, guitars: 0.60, other: 0.55 },
  outro:          { vocals: 0.65, drums: 0.50, bass: 0.55, keys: 0.55, guitars: 0.50, other: 0.45 },
  tag:            { vocals: 0.78, drums: 0.55, bass: 0.60, keys: 0.60, guitars: 0.55, other: 0.45 },
  vamp:           { vocals: 0.72, drums: 0.60, bass: 0.65, keys: 0.62, guitars: 0.58, other: 0.48 },
};

// ── Energy curve keyed by canonical name ────────────────────────────────────
export const SECTION_ENERGY = {
  intro: 0.28, verse: 0.52, 'pre-chorus': 0.68,
  chorus: 0.92, bridge: 0.72, outro: 0.22, tag: 0.45, vamp: 0.58,
};

// ── AI flow suggestion (bilingual-aware) ────────────────────────────────────
export function getAISectionSuggestion(currentSection, history, sections) {
  if (!currentSection || !sections?.length) return null;
  const canon = normSectionLabel(currentSection);

  let repeatCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (normSectionLabel(history[i]) === canon) repeatCount++;
    else break;
  }

  const find = (type) => sections.find((s) => normSectionLabel(s) === type);

  if (canon === 'chorus' && repeatCount >= 2) {
    const next = find('bridge') || find('outro');
    return next ? { section: next, reason: 'Chorus fatigue' } : null;
  }
  if (canon === 'bridge') {
    const c = find('chorus');
    return c ? { section: c, reason: 'Post-bridge energy' } : null;
  }
  if (canon === 'verse') {
    const c = find('chorus');
    return c ? { section: c, reason: 'Verse → Chorus' } : null;
  }
  if (canon === 'intro') {
    const v = find('verse');
    return v ? { section: v, reason: 'Intro complete' } : null;
  }
  return null;
}
