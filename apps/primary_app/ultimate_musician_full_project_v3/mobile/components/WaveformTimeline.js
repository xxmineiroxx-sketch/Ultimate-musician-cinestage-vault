import React, { useRef, useMemo, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Animated, Easing, Platform } from "react-native";
import { BlurView } from "expo-blur"; // Fallback to View if not available

import {
  normalizePeaksRange,
  smoothPeaks,
} from "../services/wavePipelineEngine";

/** Chroma-to-color mapping: Circle of Fifths inspired */
const CHROMA_PALETTE = [
  "#3B82F6", // C (Blue)
  "#6366F1", // C#
  "#8B5CF6", // D (Purple)
  "#A855F7", // D#
  "#D946EF", // E (Magenta)
  "#EC4899", // F (Pink)
  "#F43F5E", // F#
  "#EF4444", // G (Red)
  "#F97316", // G#
  "#F59E0B", // A (Amber)
  "#EAB308", // A#
  "#84CC16", // B (Lime)
];

const SECTION_COLORS = {
  intro: "#6B7280",
  verse: "#6366F1",
  chorus: "#EC4899",
  bridge: "#F59E0B",
  outro: "#10B981",
  tag: "#0EA5E9",
  freely: "#8B5CF6",
};

/**
 * CineStage Ultra Waveform — The Next-Gen Pipeline UI.
 * Integrates Spectral Centroids, Chroma Heatmaps, and Harmonic Tension.
 */
export default function WaveformTimeline({
  lengthSeconds = 0,
  playheadPct = 0,
  waveformPeaks = null,
  worshipIntelligence = null,
  markers = [],
  sections = [],
  sectionMarkers = [],
  automationEvents = [],
  bpm = 0,
  onSeek = null,
  onSectionTap = null,
  activeSectionLabel = null,
  armedCueLabel = null,
  armedCuePct = null,
  beatsToFire = 0,
  sectionLoopActive = false,
  isIpad = false,
  height = 200,
}) {
  const total = lengthSeconds || 1;
  const BAR_COUNT = isIpad ? 800 : 400;
  const [contentWidth, setContentWidth] = useState(1);
  
  // ── Animations ──────────────────────────────────────────────────────────
  const tensionAnim = useRef(new Animated.Value(0)).current;
  const playheadAnim = useRef(new Animated.Value(0)).current;
  
  // ── Data Extraction ─────────────────────────────────────────────────────
  const peaks             = waveformPeaks?.peaks || [];
  const spectralCentroids = waveformPeaks?.spectral_centroids || [];
  const chromaPeaks       = waveformPeaks?.chroma_peaks || [];
  const tensionMarkers    = worshipIntelligence?.harmonic_tension || [];
  const timelineSections = useMemo(() => {
    const source = sectionMarkers?.length
      ? sectionMarkers
      : sections?.length
        ? sections
        : worshipIntelligence?.sections || [];

    return source
      .map((sec, index) => {
        const startSec = Number(sec.startSec ?? sec.timeSec ?? sec.start ?? sec.time ?? 0);
        const endFallback = source[index + 1]
          ? Number(source[index + 1].startSec ?? source[index + 1].timeSec ?? source[index + 1].start ?? total)
          : total;
        const endSec = Number(sec.endSec ?? sec.endTimeSec ?? sec.end ?? endFallback);
        const label = String(sec.label || sec.name || `S${index + 1}`);
        return {
          ...sec,
          label,
          startSec: Math.max(0, startSec),
          endSec: Math.max(startSec, endSec),
          pct: Math.max(0, Math.min(1, startSec / total)),
          widthPct: Math.max(0.01, Math.min(1, (Math.max(startSec, endSec) - startSec) / total)),
        };
      })
      .filter((sec) => Number.isFinite(sec.startSec));
  }, [sectionMarkers, sections, worshipIntelligence, total]);

  const markerTicks = useMemo(() => (
    (markers || [])
      .map((marker, index) => {
        const timeSec = Number(marker.start ?? marker.timeSec ?? marker.startSec ?? marker.time ?? 0);
        return {
          ...marker,
          id: marker.id || `${marker.label || "marker"}_${index}_${Math.round(timeSec * 1000)}`,
          label: marker.label || `M${index + 1}`,
          pct: Math.max(0, Math.min(1, timeSec / total)),
        };
      })
      .filter((marker) => Number.isFinite(marker.pct))
  ), [markers, total]);

  const automationDots = useMemo(() => (
    (automationEvents || [])
      .map((event, index) => {
        const timeSec = Number(event.timeSec ?? event.startSec ?? event.time ?? event.at ?? 0);
        return {
          ...event,
          id: event.id || `auto_${index}_${Math.round(timeSec * 1000)}`,
          pct: Math.max(0, Math.min(1, timeSec / total)),
        };
      })
      .filter((event) => Number.isFinite(event.pct))
      .slice(0, 80)
  ), [automationEvents, total]);

  const gridLines = useMemo(() => {
    const safeBpm = Number(bpm || 0);
    if (!safeBpm || total <= 0) return [];
    const beat = 60 / Math.max(30, safeBpm);
    const bar = beat * 4;
    const step = bar > 0 ? bar : 2;
    const count = Math.min(96, Math.floor(total / step));
    return Array.from({ length: count + 1 }, (_, index) => ({
      id: `grid_${index}`,
      pct: Math.max(0, Math.min(1, (index * step) / total)),
      strong: index % 4 === 0,
    }));
  }, [bpm, total]);

  // Sync internal playhead animation for smooth movement
  useEffect(() => {
    Animated.timing(playheadAnim, {
      toValue: playheadPct || 0,
      duration: 100,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [playheadPct]);

  // Pulse tension glow if high tension detected
  useEffect(() => {
    const hasHighTension = tensionMarkers.some(t => t.score > 7.0);
    if (hasHighTension) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(tensionAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
          Animated.timing(tensionAnim, { toValue: 0.3, duration: 800, useNativeDriver: false }),
        ])
      ).start();
    } else {
      tensionAnim.setValue(0);
    }
  }, [tensionMarkers]);

  // ── Waveform Processing ────────────────────────────────────────────────
  const bars = useMemo(() => {
    if (!peaks.length) return [];
    
    // Smooth and downsample to adaptive count
    const processed = smoothPeaks(normalizePeaksRange(peaks), 2);
    const stride = Math.ceil(processed.length / BAR_COUNT);
    
    return processed.filter((_, i) => i % stride === 0).map((v, i) => {
      const idx = i * stride;
      return {
        v,
        brightness: spectralCentroids[idx] || 0.5,
        harmonic: chromaPeaks[idx] ?? null,
        time: (idx / processed.length) * total
      };
    }).slice(0, BAR_COUNT);
  }, [peaks, BAR_COUNT, total]);

  // ── Render Helpers ─────────────────────────────────────────────────────
  const renderBar = (bar, idx) => {
    const isPast = (idx / bars.length) < playheadPct;
    const barHeight = Math.max(4, bar.v * (height * 0.8));
    
    // Spectral "Liquid" height (top layer)
    const liquidHeight = bar.brightness * barHeight * 0.6;
    
    // Chroma coloring
    const baseColor = bar.harmonic !== null ? CHROMA_PALETTE[bar.harmonic] : "#4F46E5";
    
    // Tension overlay
    const isTension = tensionMarkers.some(t => Math.abs((t.time || 0) - bar.time) < 0.5);

    return (
      <View key={idx} style={[styles.barContainer, { height: barHeight }]}>
        {/* Main Solid Dynamic Layer */}
        <View style={[styles.barSolid, { 
          backgroundColor: baseColor, 
          opacity: isPast ? 0.9 : 0.4,
          shadowColor: baseColor,
          shadowRadius: isPast ? 4 : 0,
          shadowOpacity: isPast ? 0.5 : 0
        }]} />
        
        {/* Liquid Spectral Layer (Top) */}
        <View style={[styles.barLiquid, { 
          height: liquidHeight, 
          backgroundColor: "#FFF", 
          opacity: isPast ? 0.6 : 0.2,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2
        }]} />

        {/* Harmonic Tension Pulse */}
        {isTension && (
          <Animated.View style={[styles.tensionPulse, { 
            opacity: tensionAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) 
          }]} />
        )}
      </View>
    );
  };

  return (
    <View style={[styles.root, { height }]}>
      {/* ── Background Glass ── */}
      <View style={StyleSheet.absoluteFill}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5, 12, 26, 0.8)' }]} />
        )}
      </View>

      {/* ── Tension Heatmap Background ── */}
      <Animated.View style={[styles.heatmapLayer, {
        opacity: tensionAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.15] })
      }]} />

      {/* ── Main Waveform Interaction Area ── */}
      <TouchableOpacity 
        activeOpacity={1} 
        onLayout={(e) => setContentWidth(Math.max(1, e.nativeEvent.layout.width))}
        onPress={(e) => {
          const frac = Math.max(0, Math.min(1, e.nativeEvent.locationX / contentWidth));
          onSeek?.(frac);
        }}
        style={styles.waveContent}
      >
        <View pointerEvents="none" style={styles.gridLayer}>
          {gridLines.map((line) => (
            <View
              key={line.id}
              style={[
                styles.gridLine,
                line.strong && styles.gridLineStrong,
                { left: `${line.pct * 100}%` },
              ]}
            />
          ))}
        </View>

        <View style={styles.barsRow}>
          {bars.map(renderBar)}
        </View>

        <View pointerEvents="none" style={styles.markerLayer}>
          {markerTicks.map((marker) => (
            <View key={marker.id} style={[styles.markerTick, { left: `${marker.pct * 100}%` }]}>
              <View
                style={[
                  styles.markerLine,
                  marker.source === "transient" && styles.transientMarkerLine,
                  marker.color ? { backgroundColor: marker.color } : null,
                ]}
              />
              <Text numberOfLines={1} style={styles.markerLabel}>{marker.label}</Text>
            </View>
          ))}
        </View>

        <View pointerEvents="box-none" style={styles.sectionPinsLayer}>
          {timelineSections.map((sec, index) => {
            const isActive = activeSectionLabel && sec.label === activeSectionLabel;
            const colorKey = String(sec.label || "").toLowerCase();
            const color = sec.color || SECTION_COLORS[colorKey] || "#38BDF8";
            return (
              <TouchableOpacity
                key={sec.id || `${sec.label}_${index}`}
                activeOpacity={0.86}
                onPress={() => onSectionTap?.(sec)}
                style={[
                  styles.sectionPin,
                  isActive && styles.sectionPinActive,
                  sectionLoopActive && isActive && styles.sectionPinLooping,
                  { left: `${sec.pct * 100}%`, borderColor: color },
                ]}
              >
                <View style={[styles.sectionPinDot, { backgroundColor: color }]} />
                <Text numberOfLines={1} style={styles.sectionPinText}>{sec.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View pointerEvents="none" style={styles.automationLayer}>
          {automationDots.map((event) => (
            <View
              key={event.id}
              style={[
                styles.automationDot,
                { left: `${event.pct * 100}%` },
              ]}
            />
          ))}
        </View>

        {/* ── Armed Jump Laser ── */}
        {armedCuePct !== null && (
          <View style={[styles.jumpLaser, { left: `${armedCuePct * 100}%` }]}>
            <View style={styles.laserBeam} />
            <View style={styles.laserGlow} />
            <Text style={styles.jumpText}>{armedCueLabel}</Text>
            {beatsToFire > 0 ? (
              <Text style={styles.beatCountdown}>{Math.ceil(beatsToFire)}</Text>
            ) : null}
          </View>
        )}

        {/* ── Playhead ── */}
        <Animated.View style={[styles.playhead, { 
          left: playheadAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) 
        }]}>
          <View style={styles.playheadLine} />
          <View style={styles.playheadCap} />
        </Animated.View>
      </TouchableOpacity>

      {/* ── Bottom Section Tape ── */}
      <View style={styles.sectionTape}>
        {timelineSections.map((sec, i) => (
          <View key={`${sec.label}_${i}`} style={[styles.sectionSegment, {
            flex: sec.durationSec || Math.max(1, (sec.endSec || total) - sec.startSec),
            backgroundColor: sec.color || SECTION_COLORS[String(sec.label || "").toLowerCase()] || "#333"
          }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginVertical: 10,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#050C1A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  heatmapLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#EF4444",
  },
  waveContent: {
    flex: 1,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1.5,
  },
  gridLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  gridLine: {
    position: "absolute",
    top: 12,
    bottom: 18,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  gridLineStrong: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  barContainer: {
    flex: 1,
    width: 2,
    justifyContent: "flex-end",
    position: "relative",
    zIndex: 2,
  },
  barSolid: {
    width: "100%",
    height: "100%",
    borderRadius: 2,
  },
  barLiquid: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  tensionPulse: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#F97316",
    borderRadius: 2,
  },
  markerLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
  markerTick: {
    position: "absolute",
    top: 18,
    bottom: 20,
    width: 1,
    alignItems: "center",
  },
  markerLine: {
    flex: 1,
    width: 2,
    borderRadius: 1,
    backgroundColor: "#38BDF8",
    opacity: 0.88,
  },
  transientMarkerLine: {
    backgroundColor: "#F59E0B",
  },
  markerLabel: {
    position: "absolute",
    top: -14,
    maxWidth: 58,
    color: "rgba(255,255,255,0.78)",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
  sectionPinsLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 7,
  },
  sectionPin: {
    position: "absolute",
    top: 8,
    minWidth: 54,
    maxWidth: 92,
    minHeight: 24,
    marginLeft: -8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    backgroundColor: "rgba(5,12,26,0.76)",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sectionPinActive: {
    backgroundColor: "rgba(15,23,42,0.94)",
    borderWidth: 2,
  },
  sectionPinLooping: {
    shadowColor: "#F59E0B",
    shadowOpacity: 0.7,
    shadowRadius: 8,
  },
  sectionPinDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  sectionPinText: {
    flexShrink: 1,
    color: "#F8FAFC",
    fontSize: 10,
    fontWeight: "900",
  },
  automationLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 9,
    height: 12,
    zIndex: 6,
  },
  automationDot: {
    position: "absolute",
    width: 6,
    height: 6,
    marginLeft: -3,
    borderRadius: 3,
    backgroundColor: "#22D3EE",
    opacity: 0.86,
  },
  playhead: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    zIndex: 10,
    alignItems: "center",
  },
  playheadLine: {
    flex: 1,
    width: 2,
    backgroundColor: "#FFF",
    shadowColor: "#FFF",
    shadowRadius: 10,
    shadowOpacity: 1,
  },
  playheadCap: {
    width: 10,
    height: 10,
    backgroundColor: "#FFF",
    borderRadius: 5,
    marginTop: -5,
  },
  jumpLaser: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: 5,
    alignItems: "center",
  },
  laserBeam: {
    flex: 1,
    width: 3,
    backgroundColor: "#F59E0B",
  },
  laserGlow: {
    position: "absolute",
    width: 20,
    height: "100%",
    backgroundColor: "rgba(245, 158, 11, 0.2)",
  },
  jumpText: {
    position: "absolute",
    top: 10,
    color: "#F59E0B",
    fontSize: 10,
    fontWeight: "900",
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  beatCountdown: {
    position: "absolute",
    bottom: 10,
    minWidth: 24,
    textAlign: "center",
    color: "#020617",
    fontSize: 12,
    fontWeight: "900",
    backgroundColor: "#F59E0B",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  sectionTape: {
    height: 4,
    flexDirection: "row",
  },
  sectionSegment: {
    height: "100%",
  },
});
