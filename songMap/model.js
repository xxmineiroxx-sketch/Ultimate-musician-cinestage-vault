/**
 * Song Map Model v1.1
 * - Markers with color labels
 * - Unlimited markers
 * - Free placement OR Snap-to-grid (toggle)
 * - Voice cues: lead time, repeat, visual-only option
 */

export const MarkerTypes = [
  "Intro",
  "Verse",
  "Chorus",
  "Bridge",
  "Turnaround",
  "Tag",
  "Vamp",
  "Free",
  "Outro",
  "Custom",
];

export const MarkerColors = [
  { key: "gray", label: "Gray", hex: "#94A3B8" },
  { key: "blue", label: "Blue", hex: "#60A5FA" },
  { key: "green", label: "Green", hex: "#34D399" },
  { key: "purple", label: "Purple", hex: "#A78BFA" },
  { key: "orange", label: "Orange", hex: "#FB923C" },
  { key: "red", label: "Red", hex: "#F87171" },
  { key: "pink", label: "Pink", hex: "#F472B6" },
];

export function defaultMarkerColorByType(type) {
  const map = {
    Intro: "gray",
    Verse: "blue",
    Chorus: "green",
    Bridge: "purple",
    Turnaround: "orange",
    Tag: "orange",
    Vamp: "red",
    Free: "red",
    Outro: "gray",
  };
  return map[type] || "blue";
}

/**
 * cueLeadTime: "NONE" | "0.5s" | "1s" | "2s" | "1BAR"
 * cueRepeat: "ONCE" | "TWICE"
 * cueVisualOnly: boolean
 */
export function makeMarker({
  id,
  name,
  type,
  start,
  end,
  colorKey,
  cueVoice = true,
  countInBars = 0,
  cueLeadTime = "1BAR",
  cueRepeat = "ONCE",
  cueVisualOnly = false,
}) {
  return {
    id,
    name,
    type,
    start, // seconds
    end, // seconds
    colorKey,
    cueVoice,
    countInBars,
    cueLeadTime,
    cueRepeat,
    cueVisualOnly,
  };
}

export function sortMarkers(markers) {
  return [...markers].sort((a, b) => a.start - b.start);
}
