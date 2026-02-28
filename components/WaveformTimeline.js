import React from "react";
import { View, Text, StyleSheet } from "react-native";

/**
 * One global waveform-style timeline, like Multitracks:
 * - Single horizontal bar representing the whole song
 * - Section markers as labeled segments
 * This is purely visual; actual audio waveform rendering can be added later.
 */
export default function WaveformTimeline({
  sections = [],
  markers = [],
  lengthSeconds = 0,
  currentSection,
  playheadPct = null,
  waveformPeaks = null,
}) {
  const total = lengthSeconds || 1;
  const sorted = [...sections].sort(
    (a, b) => (a.positionSeconds || 0) - (b.positionSeconds || 0),
  );
  const markerList = [...markers].sort(
    (a, b) => (a.start || 0) - (b.start || 0),
  );

  // Build segments from section start times
  const segments = [];
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const next = sorted[i + 1];
    const start = s.positionSeconds || 0;
    const end = next ? next.positionSeconds || total : total;
    const widthPct = Math.max(8, ((end - start) / total) * 100);
    segments.push({
      label: s.label || "SECTION",
      width: widthPct,
      active: currentSection === s.label,
    });
  }

  if (!segments.length) {
    segments.push({ label: "INTRO", width: 100, active: true });
  }

  const showMarkers = markerList.length > 0;
  const clampedPlayhead =
    typeof playheadPct === "number"
      ? Math.min(1, Math.max(0, playheadPct))
      : null;
  const peakValues = Array.isArray(waveformPeaks?.peaks)
    ? waveformPeaks.peaks
    : Array.isArray(waveformPeaks)
      ? waveformPeaks
      : null;
  const peakCount = peakValues ? peakValues.length : 0;
  const maxBars = 420;
  const barStride = peakCount > maxBars ? Math.ceil(peakCount / maxBars) : 1;
  const bars = peakValues
    ? peakValues.filter((_, idx) => idx % barStride === 0)
    : [];

  return (
    <View style={styles.container}>
      <Text style={styles.caption}>Song Timeline</Text>
      <View style={styles.waveBar}>
        {bars.length > 0 && (
          <View style={styles.peaksRow} pointerEvents="none">
            {bars.map((v, idx) => (
              <View
                key={`p_${idx}`}
                style={[styles.peakBar, { height: `${Math.max(8, v * 100)}%` }]}
              />
            ))}
          </View>
        )}
        {showMarkers
          ? markerList.map((m, idx) => {
              const left = ((m.start || 0) / total) * 100;
              const width = Math.max(
                0.8,
                (((m.end || 0) - (m.start || 0)) / total) * 100,
              );
              return (
                <View
                  key={m.id || `${m.label}-${idx}`}
                  style={[
                    styles.markerBlock,
                    {
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: m.color || m.colorHex || "#4F46E5",
                    },
                  ]}
                />
              );
            })
          : segments.map((seg, idx) => (
              <View
                key={seg.label + idx}
                style={[
                  styles.segment,
                  { flexBasis: seg.width + "%" },
                  seg.active && styles.segmentActive,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.segmentLabel,
                    seg.active && styles.segmentLabelActive,
                  ]}
                >
                  {seg.label.replace("_", " ")}
                </Text>
              </View>
            ))}
        {clampedPlayhead != null && (
          <View
            style={[styles.playhead, { left: `${clampedPlayhead * 100}%` }]}
          />
        )}
      </View>
      <Text style={styles.lengthText}>{Math.round(total)}s total</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    marginBottom: 12,
  },
  caption: {
    color: "#9CA3AF",
    fontSize: 11,
    marginBottom: 4,
  },
  waveBar: {
    flexDirection: "row",
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#111827",
    minHeight: 32,
    position: "relative",
  },
  peaksRow: {
    position: "absolute",
    left: 6,
    right: 6,
    top: 4,
    bottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    opacity: 0.55,
  },
  peakBar: {
    flex: 1,
    backgroundColor: "#334155",
    borderRadius: 999,
  },
  markerBlock: {
    position: "absolute",
    top: 2,
    bottom: 2,
    borderRadius: 999,
    opacity: 0.85,
  },
  segment: {
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: "#111827",
    backgroundColor: "#0B1120",
  },
  segmentActive: {
    backgroundColor: "#4F46E5",
  },
  segmentLabel: {
    color: "#9CA3AF",
    fontSize: 11,
  },
  segmentLabelActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  playhead: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#E5E7EB",
  },
  lengthText: {
    color: "#6B7280",
    fontSize: 11,
    marginTop: 4,
  },
});
