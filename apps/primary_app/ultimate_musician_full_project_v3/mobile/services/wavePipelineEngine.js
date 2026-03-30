export const TRANSITION_MODES = ["CUT", "CROSSFADE", "OVERLAP"];
export const LAUNCH_QUANTIZATION_MODES = ["IMMEDIATE", "BEAT", "BAR"];

export function normalizeWaveformPeaks(input) {
  if (!input) return [];
  if (Array.isArray(input?.peaks)) return input.peaks;
  if (Array.isArray(input)) return input;
  return [];
}

export function downsamplePeaks(input, targetCount = 200) {
  const peaks = normalizeWaveformPeaks(input);
  const safeTarget = Math.max(32, Number(targetCount || 200));
  if (peaks.length <= safeTarget) return peaks;
  const stride = Math.ceil(peaks.length / safeTarget);
  return peaks.filter((_, i) => i % stride === 0).slice(0, safeTarget);
}

/**
 * Stretch peak values so the loudest sample = 1.0 and the floor is lifted.
 * This ensures the waveform fills its full visual height regardless of source gain.
 * floor: minimum value to map to (prevents dead silence looking like a flat line).
 */
export function normalizePeaksRange(peaks, floor = 0.08) {
  const arr = Array.isArray(peaks) ? peaks : [];
  if (arr.length === 0) return arr;
  const max = Math.max(...arr);
  if (max <= 0) return arr.map(() => floor);
  return arr.map((v) => Math.max(floor, Math.min(1, (v / max) * 0.98)));
}

/**
 * Sliding-window RMS smoothing to reduce visual noise in the waveform.
 * windowSize: number of samples on each side to average (default 3 = 7-sample window).
 */
export function smoothPeaks(peaks, windowSize = 3) {
  const arr = Array.isArray(peaks) ? peaks : [];
  if (arr.length === 0) return arr;
  const half = Math.max(1, Math.floor(windowSize));
  return arr.map((_, i) => {
    const start = Math.max(0, i - half);
    const end   = Math.min(arr.length - 1, i + half);
    let sum = 0, count = 0;
    for (let j = start; j <= end; j++) {
      sum += (arr[j] || 0) * (arr[j] || 0); // RMS: sum of squares
      count++;
    }
    return Math.sqrt(sum / count);
  });
}

/**
 * Full pipeline: normalize → smooth → downsample to target bar count.
 * Use this when displaying peaks in the waveform view.
 */
export function processPeaksForDisplay(input, targetCount = 200) {
  const raw = normalizeWaveformPeaks(input);
  if (raw.length === 0) return raw;
  const normalized = normalizePeaksRange(raw);
  const smoothed   = smoothPeaks(normalized, 2);
  return downsamplePeaks(smoothed, targetCount);
}

/**
 * Select the right pyramid level based on the desired bar count.
 * Higher zoom (more bars) = lower pyramid level (higher resolution).
 */
export function selectPyramidLevel(pyramid, targetBars = 200) {
  if (!Array.isArray(pyramid) || pyramid.length === 0) return [];
  // Find the level whose length is closest to (but >= ) targetBars
  for (let i = 0; i < pyramid.length; i++) {
    if (pyramid[i].length <= targetBars * 2) return pyramid[i];
  }
  return pyramid[pyramid.length - 1];
}

export function buildPeakPyramid(peaks, maxLevels = 6) {
  const base = Array.isArray(peaks)
    ? peaks.map((n) => Math.max(0, Math.min(1, Number(n || 0))))
    : [];
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
  const arr = Array.isArray(peaks) ? peaks : [];
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
  const threshold = Number(options.threshold ?? 0.75);
  const maxMarkers = Math.max(1, Number(options.maxMarkers || 24));
  const minSpacingSec = Math.max(0.1, Number(options.minSpacingSec || 0.8));
  const markerSpanSec = Math.max(0.25, Number(options.markerSpanSec || 1.0));
  const arr = Array.isArray(peaks) ? peaks : [];
  const total = Math.max(0, Number(durationSec || 0));
  if (arr.length < 3 || total <= 0) return [];

  const idxToSec = (idx) => (idx / Math.max(1, arr.length - 1)) * total;
  const candidates = detectTransientCandidates(arr, threshold).map((idx) => ({
    idx,
    t: idxToSec(idx),
    amp: Number(arr[idx] || 0),
  }));

  candidates.sort((a, b) => b.amp - a.amp);
  const accepted = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const item = candidates[i];
    const tooClose = accepted.some(
      (cur) => Math.abs(cur.t - item.t) < minSpacingSec,
    );
    if (!tooClose) accepted.push(item);
    if (accepted.length >= maxMarkers) break;
  }
  accepted.sort((a, b) => a.t - b.t);

  return accepted.map((item, index) => ({
    id: `tr_${Date.now()}_${index}_${item.idx}`,
    label: `Hit ${index + 1}`,
    start: item.t,
    end: Math.min(total, item.t + markerSpanSec),
    color: "#F59E0B",
    source: "transient",
    confidence: item.amp,
  }));
}

export function quantizedJumpTarget(targetSec, mode, bpm = 120) {
  const t = Math.max(0, Number(targetSec || 0));
  if (mode === "IMMEDIATE") return t;
  const safeBpm = Math.max(30, Number(bpm || 120));
  const beat = 60 / safeBpm;
  const step = mode === "BAR" ? beat * 4 : beat;
  return Math.round(t / step) * step;
}

export function buildJumpTargets(markers, mode, bpm = 120) {
  return (markers || []).map((marker) => ({
    markerId: marker.id,
    label: marker.label,
    targetSec: Number(marker.start || 0),
    quantizedTargetSec: quantizedJumpTarget(marker.start || 0, mode, bpm),
  }));
}

export function resolveTransitionWindow(
  currentEndSec,
  nextStartSec,
  mode,
  fadeSec = 1.0,
) {
  const currentEnd = Math.max(0, Number(currentEndSec || 0));
  const nextStart = Math.max(0, Number(nextStartSec || 0));
  const span = Math.max(0.1, Number(fadeSec || 1.0));
  if (mode === "CUT") return { from: currentEnd, to: currentEnd, mode };
  if (mode === "OVERLAP")
    return { from: Math.max(0, currentEnd - span), to: nextStart + span, mode };
  return {
    from: Math.max(0, currentEnd - span),
    to: currentEnd + span,
    mode: "CROSSFADE",
  };
}
