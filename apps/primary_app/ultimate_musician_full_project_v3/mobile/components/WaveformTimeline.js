import React, { useRef, useMemo, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Animated, Easing, Platform } from "react-native";
import { BlurView } from "expo-blur"; // Fallback to View if not available

import {
  normalizePeaksRange,
  smoothPeaks,
  quantizedJumpTarget,
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
  onSeek = null,
  onSectionTap = null,
  activeSectionLabel = null,
  armedCueLabel = null,
  armedCuePct = null,
  beatsToFire = 0,
  isIpad = false,
  height = 200,
}) {
  const total = lengthSeconds || 1;
  const BAR_COUNT = isIpad ? 800 : 400;
  
  // ── Animations ──────────────────────────────────────────────────────────
  const tensionAnim = useRef(new Animated.Value(0)).current;
  const playheadAnim = useRef(new Animated.Value(0)).current;
  
  // ── Data Extraction ─────────────────────────────────────────────────────
  const peaks             = waveformPeaks?.peaks || [];
  const spectralCentroids = waveformPeaks?.spectral_centroids || [];
  const chromaPeaks       = waveformPeaks?.chroma_peaks || [];
  const tensionMarkers    = worshipIntelligence?.harmonic_tension || [];

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
        onPress={(e) => {
          const frac = e.nativeEvent.locationX / bars.length; // Approximate
          onSeek?.(frac);
        }}
        style={styles.waveContent}
      >
        <View style={styles.barsRow}>
          {bars.map(renderBar)}
        </View>

        {/* ── Armed Jump Laser ── */}
        {armedCuePct !== null && (
          <View style={[styles.jumpLaser, { left: `${armedCuePct * 100}%` }]}>
            <View style={styles.laserBeam} />
            <View style={styles.laserGlow} />
            <Text style={styles.jumpText}>{armedCueLabel}</Text>
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
        {worshipIntelligence?.sections?.map((sec, i) => (
          <View key={i} style={[styles.sectionSegment, { 
            flex: sec.durationSec || 1, 
            backgroundColor: sec.color || "#333" 
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
  barContainer: {
    flex: 1,
    width: 2,
    justifyContent: "flex-end",
    position: "relative",
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
  sectionTape: {
    height: 4,
    flexDirection: "row",
  },
  sectionSegment: {
    height: "100%",
  },
});
