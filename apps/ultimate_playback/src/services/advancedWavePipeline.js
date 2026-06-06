'use strict';

export const GRID_MODES = ['FREE', 'BEAT', 'BAR'];
export const LAUNCH_QUANTIZATION_MODES = ['IMMEDIATE', 'BEAT', 'BAR'];
export const TRANSITION_MODES = ['CUT', 'CROSSFADE', 'OVERLAP'];

const SECTION_COLOR_RULES = [
  [/intro|abertura/i, '#64748B'],
  [/verse|verso|parte|primeira|segunda|terceira|quarta|quinta/i, '#6366F1'],
  [/pre.?chorus|pre.?refr/i, '#8B5CF6'],
  [/chorus|refr[aã]o/i, '#EC4899'],
  [/bridge|ponte/i, '#F59E0B'],
  [/outro|ending|final|coda/i, '#10B981'],
  [/vamp|tag|hook|turnaround|fill/i, '#F97316'],
  [/instrumental|interlude|solo|break/i, '#0EA5E9'],
];

const SECTION_HEADER_RE = /^\[([^\]]+)\]$/;
const LABEL_RE = /^(intro|verse|chorus|bridge|outro|pre[\s-]?chorus|channel|vamp|tag|hook|interlude|break|instrumental|solo|refrain|coda|ending|repeat|fill|part\s*\d|primeira|segunda|terceira|quarta|quinta|refr[aã]o|ponte|abertura|final|parte|verso)/i;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

export function normalizeWaveformPeaks(input) {
  if (Array.isArray(input?.peaks)) return input.peaks;
  if (Array.isArray(input)) return input;
  return [];
}

export function normalizePeaksRange(peaks, floor = 0.06) {
  const arr = normalizeWaveformPeaks(peaks)
    .map((value) => clamp(value, 0, 1))
    .filter((value) => Number.isFinite(value));
  if (arr.length === 0) return [];
  const max = Math.max(...arr, 0.001);
  return arr.map((value) => Math.max(floor, Math.min(1, (value / max) * 0.98)));
}

export function smoothPeaks(peaks, radius = 2) {
  const arr = normalizePeaksRange(peaks, 0);
  if (arr.length === 0) return [];
  const r = Math.max(1, Math.floor(radius));
  return arr.map((_, index) => {
    const start = Math.max(0, index - r);
    const end = Math.min(arr.length - 1, index + r);
    let sum = 0;
    let count = 0;
    for (let i = start; i <= end; i += 1) {
      sum += arr[i] * arr[i];
      count += 1;
    }
    return Math.sqrt(sum / Math.max(1, count));
  });
}

export function downsamplePeaks(peaks, targetCount = 240) {
  const arr = normalizeWaveformPeaks(peaks);
  const target = Math.max(32, Math.floor(Number(targetCount || 240)));
  if (arr.length === 0 || arr.length === target) return arr;
  if (arr.length < target) {
    return Array.from({ length: target }, (_, index) => {
      const sourceIndex = Math.min(arr.length - 1, Math.floor((index / target) * arr.length));
      return arr[sourceIndex] || 0;
    });
  }
  const ratio = arr.length / target;
  return Array.from({ length: target }, (_, index) => {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let max = 0;
    for (let i = start; i < end && i < arr.length; i += 1) {
      max = Math.max(max, Number(arr[i] || 0));
    }
    return max;
  });
}

export function processPeaksForDisplay(input, targetCount = 240) {
  return downsamplePeaks(smoothPeaks(normalizePeaksRange(input), 2), targetCount);
}

export function buildPeakPyramid(input, maxLevels = 6) {
  const base = normalizePeaksRange(input);
  const levels = [base];
  while (levels.length < maxLevels && levels[levels.length - 1].length > 16) {
    const prev = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(Math.max(prev[i] || 0, prev[i + 1] || 0));
    }
    levels.push(next);
  }
  return levels;
}

function colorFor(label) {
  const text = String(label || '');
  const match = SECTION_COLOR_RULES.find(([regex]) => regex.test(text));
  return match ? match[1] : '#6366F1';
}

function normalizeSection(section, index, durationSec) {
  const label = section?.label || section?.labelEn || section?.section || section?.type || `Marker ${index + 1}`;
  const startSec = Number(
    section?.timeSec
      ?? section?.positionSeconds
      ?? section?.startSec
      ?? section?.start
      ?? section?.startTimeSec
      ?? 0,
  );
  const endSec = Number(
    section?.endTimeSec
      ?? section?.endSec
      ?? section?.end
      ?? section?.end_time
      ?? 0,
  );
  const safeDuration = Math.max(0, Number(durationSec || 0));
  return {
    id: section?.id || `section_${index}_${String(label).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    type: 'section',
    label: String(label || `Marker ${index + 1}`).trim(),
    color: section?.color || colorFor(label),
    timeSec: safeDuration > 0 ? clamp(startSec, 0, safeDuration) : Math.max(0, startSec),
    endTimeSec: safeDuration > 0 && endSec > 0 ? clamp(endSec, 0, safeDuration) : null,
    confidence: Number(section?.confidence ?? 0.75),
    source: section?.source || 'section',
    freely: Boolean(section?.freely),
    raw: section,
  };
}

function cueTimeSec(cue) {
  const value =
    cue?.timeSec
    ?? cue?.positionSeconds
    ?? cue?.startSec
    ?? cue?.start
    ?? cue?.time
    ?? cue?.at;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
}

function normalizeCueMarker(cue, index, durationSec, source = 'cue') {
  const timeSec = cueTimeSec(cue);
  if (timeSec == null) return null;
  const label = String(
    cue?.label
    || cue?.title
    || cue?.name
    || cue?.cue
    || cue?.text
    || `Cue ${index + 1}`,
  ).trim();
  const safeDuration = Math.max(0, Number(durationSec || 0));
  return {
    id: cue?.id || `${source}_${index}_${String(label).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    type: 'cue',
    label,
    color: cue?.color || (source === 'role-cue' ? '#38BDF8' : '#A78BFA'),
    timeSec: safeDuration > 0 ? clamp(timeSec, 0, safeDuration) : timeSec,
    endTimeSec: null,
    positionSeconds: safeDuration > 0 ? clamp(timeSec, 0, safeDuration) : timeSec,
    confidence: Number(cue?.confidence ?? 0.7),
    source,
    raw: cue,
  };
}

function normalizeRoleKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function normalizeCueMarkers(song, durationSec = 0, options = {}) {
  const roleKey = normalizeRoleKey(options.userRole || options.role);
  const general = [
    song?.cueMarkers,
    song?.markers,
    song?.performanceCues,
    song?.mediaCues,
  ].filter(Array.isArray).flat();

  const roleCueSource = song?.roleCues || song?.instrumentCues || {};
  const roleCues = roleKey && roleCueSource && typeof roleCueSource === 'object'
    ? (roleCueSource[roleKey] || roleCueSource[options.userRole] || roleCueSource[options.role])
    : null;
  const normalizedRoleCues = Array.isArray(roleCues)
    ? roleCues
    : Array.isArray(roleCues?.cues)
      ? roleCues.cues
      : [];

  return [
    ...general.map((cue, index) => normalizeCueMarker(cue, index, durationSec, 'cue')),
    ...normalizedRoleCues.map((cue, index) => normalizeCueMarker(cue, index, durationSec, 'role-cue')),
  ]
    .filter(Boolean)
    .sort((a, b) => a.timeSec - b.timeSec);
}

function parseTextSections(song, durationSec) {
  const text = song?.lyricsChordChart || song?.lyrics || song?.chordChart || song?.content || '';
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const total = Math.max(1, lines.length);
  return lines
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > 80) return null;
      const bracket = trimmed.match(SECTION_HEADER_RE);
      const rawLabel = bracket?.[1] || (LABEL_RE.test(trimmed) && trimmed.length < 50 ? trimmed : null);
      if (!rawLabel) return null;
      return normalizeSection({
        label: rawLabel,
        timeSec: (index / total) * Math.max(0, durationSec || 0),
        confidence: 0.45,
        source: 'chart',
      }, index, durationSec);
    })
    .filter(Boolean)
    .filter((section, index, arr) => index === 0 || section.label !== arr[index - 1].label);
}

export function normalizeSections(song, durationSec = 0) {
  const candidates = [
    song?.analysis?.sections,
    song?.analysis?.worship_intelligence?.bilingual_sections,
    song?.worship_intelligence?.bilingual_sections,
    song?.sections,
    song?.sectionMarkers,
  ].find((value) => Array.isArray(value) && value.length > 0);

  const normalized = candidates
    ? candidates.map((section, index) => normalizeSection(section, index, durationSec))
    : parseTextSections(song, durationSec);

  const sorted = normalized
    .filter((section) => Number.isFinite(section.timeSec))
    .sort((a, b) => a.timeSec - b.timeSec);

  return sorted.map((section, index) => {
    const next = sorted[index + 1];
    const endTimeSec = section.endTimeSec ?? next?.timeSec ?? Math.max(durationSec || 0, section.timeSec);
    return {
      ...section,
      endTimeSec: Math.max(section.timeSec, endTimeSec),
      positionSeconds: section.timeSec,
      startPct: durationSec > 0 ? section.timeSec / durationSec : 0,
      endPct: durationSec > 0 ? Math.max(section.timeSec, endTimeSec) / durationSec : 1,
    };
  });
}

export function detectTransientCandidates(peaks, threshold = 0.74) {
  const arr = normalizePeaksRange(peaks, 0);
  const candidates = [];
  for (let i = 1; i < arr.length - 1; i += 1) {
    const prev = arr[i - 1] || 0;
    const cur = arr[i] || 0;
    const next = arr[i + 1] || 0;
    const attack = cur - prev;
    if (cur >= threshold && attack > 0.08 && cur >= next) {
      candidates.push({ index: i, amp: cur, attack });
    }
  }
  return candidates;
}

export function buildTransientMarkers(peaks, durationSec, options = {}) {
  const total = Math.max(0, Number(durationSec || 0));
  const arr = normalizePeaksRange(peaks, 0);
  if (arr.length < 8 || total <= 0) return [];
  const maxMarkers = Math.max(1, Number(options.maxMarkers || 20));
  const minSpacingSec = Math.max(0.25, Number(options.minSpacingSec || 1.2));
  const threshold = Number(options.threshold ?? 0.74);
  const candidates = detectTransientCandidates(arr, threshold)
    .map((item) => ({
      ...item,
      timeSec: (item.index / Math.max(1, arr.length - 1)) * total,
      score: item.amp + item.attack,
    }))
    .sort((a, b) => b.score - a.score);

  const accepted = [];
  candidates.forEach((item) => {
    if (accepted.length >= maxMarkers) return;
    if (accepted.some((cur) => Math.abs(cur.timeSec - item.timeSec) < minSpacingSec)) return;
    accepted.push(item);
  });

  return accepted
    .sort((a, b) => a.timeSec - b.timeSec)
    .map((item, index) => ({
      id: `hit_${index}_${item.index}`,
      type: 'transient',
      label: `Hit ${index + 1}`,
      timeSec: item.timeSec,
      endTimeSec: Math.min(total, item.timeSec + 0.6),
      positionSeconds: item.timeSec,
      color: '#F59E0B',
      confidence: Number(item.amp.toFixed(3)),
      source: 'transient',
    }));
}

export function getBeatDurationSec(bpm = 120) {
  return 60 / Math.max(30, Number(bpm || 120));
}

export function quantizeTimeSec(targetSec, mode = 'IMMEDIATE', bpm = 120, beatsPerBar = 4) {
  const safeTarget = Math.max(0, Number(targetSec || 0));
  if (mode === 'IMMEDIATE' || mode === 'FREE') return safeTarget;
  const beat = getBeatDurationSec(bpm);
  const step = mode === 'BAR' ? beat * Math.max(1, Number(beatsPerBar || 4)) : beat;
  return Math.max(0, Math.round(safeTarget / step) * step);
}

export function applyLatencyCompensationSec(targetSec, latencyMs = 0) {
  return Math.max(0, Number(targetSec || 0) - Number(latencyMs || 0) / 1000);
}

export function resolveTransitionWindow(currentSec, targetSec, mode = 'CUT', fadeSec = 0.8) {
  const current = Math.max(0, Number(currentSec || 0));
  const target = Math.max(0, Number(targetSec || 0));
  const span = Math.max(0.05, Number(fadeSec || 0.8));
  if (mode === 'OVERLAP') {
    return { mode, fromSec: Math.max(0, current - span), toSec: target + span, fadeSec: span };
  }
  if (mode === 'CROSSFADE') {
    return { mode, fromSec: Math.max(0, current - span), toSec: current + span, fadeSec: span };
  }
  return { mode: 'CUT', fromSec: current, toSec: target, fadeSec: 0 };
}

export function buildJumpTargets(markers, settings = {}) {
  const bpm = Number(settings.bpm || 120);
  const beatsPerBar = Number(settings.beatsPerBar || 4);
  const mode = settings.launchQuantization || 'IMMEDIATE';
  const latencyMs = Number(settings.latencyOffsetMs || 0);
  return (markers || []).map((marker) => {
    const quantizedSec = quantizeTimeSec(marker.timeSec, mode, bpm, beatsPerBar);
    return {
      markerId: marker.id,
      label: marker.label,
      source: marker.source,
      targetSec: marker.timeSec,
      quantizedSec,
      compensatedSec: applyLatencyCompensationSec(quantizedSec, latencyMs),
      marker,
    };
  });
}

export function getCurrentSection(sections, positionSec) {
  const pos = Math.max(0, Number(positionSec || 0));
  let current = null;
  (sections || []).forEach((section) => {
    if (section.timeSec <= pos) current = section;
  });
  return current;
}

export function getAdjacentSection(sections, positionSec, direction = 1) {
  const pos = Math.max(0, Number(positionSec || 0));
  const sorted = [...(sections || [])].sort((a, b) => a.timeSec - b.timeSec);
  if (direction >= 0) {
    return sorted.find((section) => section.timeSec > pos + 0.35) || null;
  }
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i].timeSec < pos - 0.35) return sorted[i];
  }
  return null;
}

export function buildAdvancedWavePipeline(song, options = {}) {
  const durationSec = Math.max(0, Number(options.durationSec || song?.durationSec || song?.duration || 0));
  const bpm = Number(options.bpm || song?.bpm || 120);
  const beatsPerBar = Number(options.beatsPerBar || song?.beatsPerBar || 4);
  const rawPeaks = normalizeWaveformPeaks(options.peaks || song?.waveformPeaks);
  const displayPeaks = processPeaksForDisplay(rawPeaks.length ? rawPeaks : options.fallbackPeaks, options.targetPeakCount || 240);
  const peakPyramid = buildPeakPyramid(rawPeaks.length ? rawPeaks : displayPeaks);
  const sections = normalizeSections(song, durationSec);
  const cueMarkers = normalizeCueMarkers(song, durationSec, options);
  const transientMarkers = buildTransientMarkers(rawPeaks.length ? rawPeaks : displayPeaks, durationSec, {
    maxMarkers: options.maxTransientMarkers || 20,
  });
  const markers = [...sections, ...cueMarkers, ...transientMarkers].sort((a, b) => a.timeSec - b.timeSec);
  const settings = {
    gridMode: options.gridMode || 'BAR',
    launchQuantization: options.launchQuantization || 'BAR',
    transitionMode: options.transitionMode || 'CROSSFADE',
    latencyOffsetMs: Number(options.latencyOffsetMs || 0),
    bpm,
    beatsPerBar,
  };

  return {
    version: 'playback-advanced-wavepipeline-v1',
    songId: song?.id || song?.songId || song?.librarySongId || null,
    durationSec,
    bpm,
    beatsPerBar,
    settings,
    rawPeaks,
    displayPeaks,
    peakPyramid,
    sections,
    cueMarkers,
    transientMarkers,
    markers,
    jumpTargets: buildJumpTargets(markers, settings),
    hasRealPeaks: rawPeaks.length > 0,
    generatedAt: new Date().toISOString(),
  };
}
