import React, { useMemo } from "react";
import { View, StyleSheet, Dimensions } from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;

/**
 * StemWaveformView - A multi-layered, color-coded waveform visualizer.
 * Built using standard Views for maximum compatibility without SVG dependencies.
 */
export default function StemWaveformView({
  stemsData = {},
  activeStems = {},
  progress = 0,
  height = 80,
  width = SCREEN_WIDTH - 40,
}) {
  const stemColors = {
    vocals: "#F472B6",
    drums: "#34D399",
    bass: "#60A5FA",
    keys: "#A78BFA",
    guitars: "#FB923C",
    guitar: "#FB923C",
    other: "#94A3B8",
  };

  const renderStemLayer = (name, peaks, isActive) => {
    if (!peaks || peaks.length === 0) return null;
    
    const color = stemColors[name.toLowerCase()] || stemColors.other;
    const opacity = isActive ? 0.6 : 0.05;
    const barWidth = width / peaks.length;
    
    return (
      <View key={name} style={[StyleSheet.absoluteFill, { flexDirection: 'row', alignItems: 'center', opacity }]}>
        {peaks.map((peak, i) => {
          const barHeight = Math.max(2, peak * height);
          return (
            <View 
              key={i} 
              style={{
                width: barWidth * 0.7,
                height: barHeight,
                backgroundColor: color,
                marginRight: barWidth * 0.3,
                borderRadius: 1,
              }} 
            />
          );
        })}
      </View>
    );
  };

  const playheadX = progress * width;

  return (
    <View style={[styles.container, { width, height }]}>
      {Object.entries(stemsData).map(([name, peaks]) => 
        renderStemLayer(name, peaks, activeStems[name] !== false)
      )}
      
      {/* Playhead */}
      <View 
        style={[
          styles.playhead, 
          { left: playheadX, height }
        ]}
      />
      {/* Playhead Glow */}
      <View 
        style={[
          styles.playheadGlow, 
          { left: playheadX - 2, height }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    position: 'relative',
  },
  playhead: {
    position: 'absolute',
    width: 2,
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  playheadGlow: {
    position: 'absolute',
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 9,
  }
});
