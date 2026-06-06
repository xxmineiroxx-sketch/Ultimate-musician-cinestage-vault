export const TRANSITION_MODES = ["CUT", "CROSSFADE", "OVERLAP"];
export const LAUNCH_QUANTIZATION_MODES = ["IMMEDIATE", "BEAT", "BAR"];
export const GRID_MODES = ["BAR", "BEAT", "FREE"];

const DEFAULT_BPM = 120;

function asSeconds(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function resolveDurationSec(song = {}, fallback = 0) {
  return asSeconds(
    song.durationSec
      ?? song.lengthSeconds
      ?? song.duration
      ?? song.duration_seconds
      ?? song.audioDurationSec,
    fallback,
  );
}

function resolveMarkerStart(marker = {}) {
  return asSeconds(marker.start ?? marker.timeSec ?? marker.time ?? marker.startSec);
}

function resolveMarkerEnd(marker = {}, fallback = 0) {
  return asSeconds(marker.end ?? marker.endTimeSec ?? marker.endSec, fallback);
}

function stableId(prefix, index, label, startSec) {
  const raw = String(label || `${prefix}_${index}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
  return `${prefix}_${index}_${raw || "item"}_${Math.round(startSec * 1000)}`;
}

export function normalizeWaveformPeaks(input) {
  if (!input) return [];
  const source = Array.isArray(input?.peaks) ? input.peaks : input;
  if (!Array.isArray(source)) return [];
  return source
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.abs(value));
}

export function downsamplePeaks(input, targetCount = 200) {
  const peaks = normalizeWaveformPeaks(input);
  const safeTarget = Math.max(32, Math.floor(Number(targetCount || 200)));
  if (peaks.length <= safeTarget) return peaks;

  const bucketSize = peaks.length / safeTarget;
  const buckets = [];
  for (let bucket = 0; bucket < safeTarget; bucket += 1) {
    const start = Math.floor(bucket * bucketSize);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * bucketSize));
    let max = 0;
    for (let i = start; i < end && i < peaks.length; i += 1) {
      max = Math.max(max, peaks[i] || 0);
    }
    buckets.push(max);
  }
  return buckets;
}

/**
 * Stretch peak values so the loudest sample = 1.0 and the floor is lifted.
 * This ensures the waveform fills its full visual height regardless of source gain.
 */
export function normalizePeaksRange(peaks, floor = 0.08) {
  const arr = normalizeWaveformPeaks(peaks);
  if (arr.length === 0) return arr;
  const max = Math.max(...arr);
  if (max <= 0) return arr.map(() => floor);
  return arr.map((v) => Math.max(floor, Math.min(1, (v / max) * 0.98)));
}

/**
 * Sliding-window RMS smoothing to reduce visual noise in the waveform.
 */
export function smoothPeaks(peaks, windowSize = 3) {
  const arr = normalizeWaveformPeaks(peaks);
  if (arr.length === 0) return arr;
  const half = Math.max(1, Math.floor(windowSize));
  return arr.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(arr.length - 1, i + half);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j += 1) {
      const value = arr[j] || 0;
      sum += value * value;
      count += 1;
    }
    return Math.sqrt(sum / Math.max(1, count));
  });
}

/**
 * Full pipeline: normalize -> smooth -> max-preserving downsample.
 */
export function processPeaksForDisplay(input, targetCount = 200) {
  const raw = normalizeWaveformPeaks(input);
  if (raw.length === 0) return raw;
  return downsamplePeaks(smoothPeaks(normalizePeaksRange(raw), 2), targetCount);
}

export function selectPyramidLevel(pyramid, targetBars = 200) {
  if (!Array.isArray(pyramid) || pyramid.length === 0) return [];
  for (let i = 0; i < pyramid.length; i += 1) {
    if (pyramid[i].length <= targetBars * 2) return pyramid[i];
  }
  return pyramid[pyramid.length - 1];
}

export function buildPeakPyramid(peaks, maxLevels = 6) {
  const base = normalizePeaksRange(peaks, 0);
  const levels = [base];
  while (levels.length < maxLevels && levels[levels.length - 1].length > 8) {
    const prev = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(Math.max(prev[i] || 0, prev[i + 1] || 0));
    }
    levels.push(next);
  }
  return levels;
}

export function detectTransientCandidates(peaks, threshold = 0.75) {
  const arr = normalizeWaveformPeaks(peaks);
  const out = [];
  for (let i = 1; i < arr.length - 1; i += 1) {
    const prev = arr[i - 1] || 0;
    const cur = arr[i] || 0;
    const next = arr[i + 1] || 0;
    if (cur >= threshold && cur > prev && cur > next) out.push(i);
  }
  return out;
}

export function buildTransientMarkers(peaks, durationSec, options = {}) {
  const normalized = normalizePeaksRange(peaks, 0);
  const threshold = Number(options.threshold ?? 0.75);
  const maxMarkers = Math.max(1, Number(options.maxMarkers || 24));
  const minSpacingSec = Math.max(0.1, Number(options.minSpacingSec || 0.8));
  const markerSpanSec = Math.max(0.25, Number(options.markerSpanSec || 1.0));
  const total = asSeconds(durationSec);
  if (normalized.length < 3 || total <= 0) return [];

  const idxToSec = (idx) => (idx / Math.max(1, normalized.length - 1)) * total;
  const candidates = detectTransientCandidates(normalized, threshold).map((idx) => ({
    idx,
    t: idxToSec(idx),
    amp: Number(normalized[idx] || 0),
  }));

  candidates.sort((a, b) => b.amp - a.amp);
  const accepted = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const item = candidates[i];
    const tooClose = accepted.some((cur) => Math.abs(cur.t - item.t) < minSpacingSec);
    if (!tooClose) accepted.push(item);
    if (accepted.length >= maxMarkers) break;
  }
  accepted.sort((a, b) => a.t - b.t);

  return accepted.map((item, index) => ({
    id: `tr_${index}_${item.idx}`,
    label: `Hit ${index + 1}`,
    start: item.t,
    timeSec: item.t,
    end: Math.min(total, item.t + markerSpanSec),
    color: "#F59E0B",
    source: "transient",
    confidence: item.amp,
  }));
}

export function getBeatDurationSec(bpm = DEFAULT_BPM) {
  return 60 / Math.max(30, Number(bpm || DEFAULT_BPM));
}

export function quantizedJumpTarget(targetSec, mode = "IMMEDIATE", bpm = DEFAULT_BPM) {
  const t = asSeconds(targetSec);
  if (mode === "IMMEDIATE" || mode === "FREE") return t;
  const beat = getBeatDurationSec(bpm);
  const step = mode === "BAR" ? beat * 4 : beat;
  return Math.max(0, Math.round(t / step) * step);
}

export function applyLatencyCompensationSec(targetSec, calibration = {}) {
  const latencyMs = Number(
    calibration.totalLatencyMs
      ?? calibration.outputLatencyMs
      ?? calibration.latencyMs
      ?? calibration.offsetMs
      ?? 0,
  );
  return Math.max(0, asSeconds(targetSec) - latencyMs / 1000);
}

export const applyLatencyCompensationSeconds = applyLatencyCompensationSec;

export function normalizeSections(input = [], durationSec = 0) {
  const total = asSeconds(durationSec);
  const raw = Array.isArray(input) ? input : [];
  const normalized = raw
    .map((section, index) => {
      const start = asSeconds(
        section.startSec
          ?? section.start
          ?? section.timeSec
          ?? section.time,
      );
      const endFallback = raw[index + 1]
        ? asSeconds(
            raw[index + 1].startSec
              ?? raw[index + 1].start
              ?? raw[index + 1].timeSec
              ?? raw[index + 1].time,
            total,
          )
        : total;
      const end = asSeconds(
        section.endSec
          ?? section.end
          ?? section.endTimeSec
          ?? section.stopSec,
        endFallback,
      );
      const label = String(section.label || section.name || `Section ${index + 1}`);
      return {
        ...section,
        id: section.id || stableId("sec", index, label, start),
        label,
        startSec: start,
        timeSec: start,
        endSec: Math.max(start, end || total || start),
        durationSec: Math.max(0, (end || total || start) - start),
      };
    })
    .sort((a, b) => a.startSec - b.startSec);

  return normalized.map((section, index) => {
    const next = normalized[index + 1];
    const endSec = next ? Math.max(section.startSec, next.startSec) : section.endSec;
    return {
      ...section,
      endSec,
      endTimeSec: endSec,
      durationSec: Math.max(0, endSec - section.startSec),
    };
  });
}

export function normalizeMarkers(input = [], durationSec = 0) {
  const total = asSeconds(durationSec);
  const markers = Array.isArray(input) ? input : [];
  return markers
    .map((marker, index) => {
      const start = resolveMarkerStart(marker);
      const end = resolveMarkerEnd(marker, Math.min(total || start, start + 4));
      const label = String(marker.label || marker.name || `Marker ${index + 1}`);
      return {
        ...marker,
        id: marker.id || stableId("mk", index, label, start),
        label,
        start,
        timeSec: start,
        end: Math.max(start, end),
        endTimeSec: Math.max(start, end),
      };
    })
    .sort((a, b) => resolveMarkerStart(a) - resolveMarkerStart(b));
}

export function buildJumpTargets(markers, modeOrSettings = "BAR", bpm = DEFAULT_BPM) {
  const settings = typeof modeOrSettings === "object" && modeOrSettings !== null
    ? modeOrSettings
    : { launchQuantization: modeOrSettings, bpm };
  const mode = settings.launchQuantization || settings.mode || "BAR";
  const safeBpm = settings.bpm || bpm || DEFAULT_BPM;
  const latency = settings.latencyCalibration || settings.calibration || {};

  return (markers || []).map((marker) => {
    const targetSec = resolveMarkerStart(marker);
    const quantizedTargetSec = quantizedJumpTarget(targetSec, mode, safeBpm);
    return {
      markerId: marker.id,
      label: marker.label,
      targetSec,
      quantizedTargetSec,
      compensatedSec: applyLatencyCompensationSec(quantizedTargetSec, latency),
      color: marker.color,
      source: marker.source,
      marker,
    };
  });
}

export function resolveTransitionWindow(currentEndSec, nextStartSec, mode = "CUT", fadeSec = 1.0) {
  const currentEnd = asSeconds(currentEndSec);
  const nextStart = asSeconds(nextStartSec);
  const span = Math.max(0.1, Number(fadeSec || 1.0));
  let from = currentEnd;
  let to = currentEnd;
  let resolvedMode = mode;

  if (mode === "OVERLAP") {
    from = Math.max(0, currentEnd - span);
    to = nextStart + span;
  } else if (mode === "CROSSFADE") {
    from = Math.max(0, currentEnd - span);
    to = currentEnd + span;
  } else {
    resolvedMode = "CUT";
  }

  return {
    from,
    to,
    fromSec: from,
    toSec: to,
    fadeSec: span,
    mode: resolvedMode,
  };
}

export function getCurrentSection(sections = [], positionSec = 0) {
  const pos = asSeconds(positionSec);
  return (sections || []).find((section) => {
    const start = asSeconds(section.startSec ?? section.timeSec ?? section.start);
    const end = asSeconds(section.endSec ?? section.endTimeSec ?? section.end, start);
    return pos >= start && (end <= start || pos < end);
  }) || null;
}

export function getAdjacentSection(sections = [], positionSec = 0, direction = 1) {
  const pos = asSeconds(positionSec);
  const normalized = normalizeSections(sections, sections?.[sections.length - 1]?.endSec || 0);
  if (direction < 0) {
    return [...normalized].reverse().find((section) => section.startSec < pos - 0.05) || null;
  }
  return normalized.find((section) => section.startSec > pos + 0.05) || null;
}

export function buildAdvancedWavePipeline(song = {}, options = {}) {
  const durationSec = resolveDurationSec(options, resolveDurationSec(song));
  const bpm = Math.max(30, Number(options.bpm ?? song.bpm ?? DEFAULT_BPM));
  const rawPeaks = normalizeWaveformPeaks(
    options.peaks
      ?? options.waveformPeaks
      ?? song.waveformPeaks
      ?? song.waveform
      ?? song.peaks,
  );
  const normalizedPeaks = normalizePeaksRange(rawPeaks);
  const displayTarget = options.displayTarget || options.targetBars || 420;
  const displayPeaks = processPeaksForDisplay(normalizedPeaks, displayTarget);
  const sections = normalizeSections(
    options.sections
      ?? options.sectionMarkers
      ?? song.sections
      ?? song.sectionMarkers
      ?? song.worshipIntelligence?.sections
      ?? [],
    durationSec,
  );
  const explicitMarkers = normalizeMarkers(options.markers ?? song.markers ?? [], durationSec);
  const transientMarkers = options.includeTransients === false
    ? []
    : buildTransientMarkers(normalizedPeaks, durationSec, {
        threshold: options.transientThreshold,
        maxMarkers: options.maxTransientMarkers,
      });
  const markers = explicitMarkers.length > 0 ? explicitMarkers : transientMarkers;
  const launchQuantization = options.launchQuantization
    ?? song.performancePolicy?.launchQuantization
    ?? "BAR";
  const jumpTargets = buildJumpTargets(markers, {
    launchQuantization,
    bpm,
    latencyCalibration: options.latencyCalibration,
  });

  return {
    ...song,
    bpm,
    durationSec,
    waveformPeaks: {
      ...(typeof song.waveformPeaks === "object" && !Array.isArray(song.waveformPeaks)
        ? song.waveformPeaks
        : {}),
      peaks: displayPeaks,
      rawPeaks,
      pyramid: buildPeakPyramid(normalizedPeaks),
    },
    sections,
    sectionMarkers: sections,
    markers,
    transientMarkers,
    jumpTargets,
    grid: {
      mode: options.gridMode || song.grid?.mode || "BAR",
      beatDurationSec: getBeatDurationSec(bpm),
      barDurationSec: getBeatDurationSec(bpm) * 4,
    },
    performancePolicy: {
      ...(song.performancePolicy || {}),
      launchQuantization,
      transitionMode: song.performancePolicy?.transitionMode || options.transitionMode || "CUT",
    },
    pipelineVersion: "advanced-waveform-v2",
  };
}
