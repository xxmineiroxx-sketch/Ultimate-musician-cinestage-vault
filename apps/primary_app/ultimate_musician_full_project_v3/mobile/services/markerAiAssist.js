import { buildTransientMarkers, normalizeWaveformPeaks } from "./wavePipelineEngine";

const SECTION_LABELS = ["Intro", "Verse", "Chorus", "Bridge", "Tag", "Outro"];

export function suggestAiMarkers({ waveformPeaks, durationSec, bpm }) {
  const peaks = normalizeWaveformPeaks(waveformPeaks);
  const duration = Math.max(0, Number(durationSec || 0));
  if (peaks.length < 4 || duration <= 0) return [];

  const transient = buildTransientMarkers(peaks, duration, {
    threshold: 0.68,
    maxMarkers: 18,
    minSpacingSec: 2.5,
    markerSpanSec: 2.0,
  });

  return transient.map((m, idx) => {
    const barAwareLabel = SECTION_LABELS[idx % SECTION_LABELS.length];
    return {
      ...m,
      label: `${barAwareLabel} ${idx + 1}`,
      source: "ai-assist",
      bpmHint: Number(bpm || 120),
      color: "#06B6D4",
    };
  });
}

export function mergeSuggestedMarkers(
  existingMarkers,
  suggestions,
  toleranceSec = 0.8,
) {
  const existing = Array.isArray(existingMarkers) ? existingMarkers : [];
  const incoming = Array.isArray(suggestions) ? suggestions : [];
  if (incoming.length === 0) return existing;

  const merged = [...existing];
  incoming.forEach((marker) => {
    const duplicate = merged.some((m) => {
      const sameTime =
        Math.abs(Number(m.start || 0) - Number(marker.start || 0)) <=
        toleranceSec;
      const sameLabel =
        String(m.label || "").toLowerCase() ===
        String(marker.label || "").toLowerCase();
      return sameTime || sameLabel;
    });
    if (!duplicate) merged.push(marker);
  });
  return merged.sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
}
