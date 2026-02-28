import { buildAuthHeaders } from './telemetryClient';

export async function fetchJobArtifact(apiBase, auth, jobId) {
  if (!apiBase || !jobId) return null;
  const res = await fetch(`${apiBase}/jobs/${jobId}/artifact`, {
    headers: buildAuthHeaders(auth),
  });
  if (!res.ok) {
    return null;
  }
  return res.json();
}

export async function fetchWaveformPeaks(url) {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

const STEM_ORDER = ["vocals", "drums", "bass", "keys", "other"];
const STEM_LABELS = {
  vocals: "Vocals",
  drums: "Drums",
  bass: "Bass",
  keys: "Keys",
  other: "Other",
};
const STEM_COLORS = {
  vocals: "#F472B6",
  drums: "#34D399",
  bass: "#60A5FA",
  keys: "#A78BFA",
  other: "#FBBF24",
};

export function buildStemsFromArtifact(artifact, fallback = []) {
  const stems = artifact?.artifacts?.stems;
  if (!stems || typeof stems !== "object") return fallback;
  return STEM_ORDER
    .filter((key) => stems[key])
    .map((key) => ({
      id: `stem_${key}`,
      name: STEM_LABELS[key] || key,
      color: STEM_COLORS[key] || "#94A3B8",
      uri: stems[key],
      volume: 1,
      pan: 0,
      mute: false,
      solo: false,
    }));
}
