import React, { useRef, useMemo, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Animated, Easing, Platform } from "react-native";

/** Chroma-to-color mapping */
const CHROMA_PALETTE = [
  "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899",
  "#F43F5E", "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16",
];

/**
 * CineStage Ultra Waveform — Playback Optimized.
 * A compact, powerful version of the spectral pipeline.
 */
export default function WaveformBar({ 
  song, 
  positionMs, 
  durationMs, 
  onSeek,
  onSectionPress 
}) {
  const height = 60;
  const playheadPct = durationMs > 0 ? positionMs / durationMs : 0;
  
  // Data extraction from song analysis
  const peaks             = song?.analysis?.peaks || [];
  const spectralCentroids = song?.analysis?.spectral_centroids || [];
  const chromaPeaks       = song?.analysis?.chroma_peaks || [];
  const tensionMarkers    = song?.analysis?.worship_intelligence?.harmonic_tension || [];

  const bars = useMemo(() => {
    const BAR_COUNT = 120;
    if (!peaks.length) {
      // Fallback to synthetic
      return Array.from({ length: BAR_COUNT }, (_, i) => ({
        v: 0.3 + Math.random() * 0.4,
        brightness: 0.5,
        harmonic: null
      }));
    }
    
    const stride = Math.ceil(peaks.length / BAR_COUNT);
    return peaks.filter((_, i) => i % stride === 0).map((v, i) => {
      const idx = i * stride;
      return {
        v,
        brightness: spectralCentroids[idx] || 0.5,
        harmonic: chromaPeaks[idx] ?? null
      };
    }).slice(0, BAR_COUNT);
  }, [peaks, spectralCentroids, chromaPeaks]);

  return (
    <View style={[styles.root, { height }]}>
      <TouchableOpacity 
        activeOpacity={1} 
        onPress={(e) => {
          const frac = e.nativeEvent.locationX / 300; // Approximate, but better than nothing
          onSeek?.(Math.floor(frac * durationMs));
        }}
        style={styles.waveContent}
      >
        <View style={styles.barsRow}>
          {bars.map((bar, idx) => {
            const isPast = (idx / bars.length) < playheadPct;
            const barH = Math.max(3, bar.v * (height * 0.8));
            const color = bar.harmonic !== null ? CHROMA_PALETTE[bar.harmonic] : "#6366F1";
            
            return (
              <View key={idx} style={[styles.barContainer, { height: barH }]}>
                <View style={[styles.barSolid, { 
                  backgroundColor: color, 
                  opacity: isPast ? 0.9 : 0.3 
                }]} />
                <View style={[styles.barLiquid, { 
                   height: bar.brightness * barH * 0.5, 
                   backgroundColor: "#FFF", 
                   opacity: isPast ? 0.4 : 0.1 
                }]} />
              </View>
            );
          })}
        </View>

        {/* Playhead */}
        <View style={[styles.playhead, { left: `${playheadPct * 100}%` }]} />
      </TouchableOpacity>

      {/* Tension Glow (Subtle) */}
      {tensionMarkers.length > 0 && (
         <View style={styles.tensionGlow} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "rgba(5, 12, 26, 0.6)",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  waveContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  barContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  barSolid: {
    width: "100%",
    height: "100%",
    borderRadius: 1,
  },
  barLiquid: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  playhead: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#FFF",
    opacity: 0.8,
  },
  tensionGlow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#EF4444",
    opacity: 0.3,
  }
});
