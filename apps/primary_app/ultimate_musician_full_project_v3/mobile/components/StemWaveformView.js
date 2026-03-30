import React, { useMemo } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Svg, { Rect, G, Path, Defs, LinearGradient, Stop } from "react-native-svg";

const SCREEN_WIDTH = Dimensions.get("window").width;

/**
 * StemWaveformView - A multi-layered, color-coded waveform visualizer.
 * 
 * @param {Object} stemsData - Object with keys as stem names and values as peak arrays.
 * @param {Object} activeStems - Object with keys as stem names and values as booleans (mute/unmute).
 * @param {Number} progress - 0..1 playhead position.
 * @param {Number} height - Component height.
 */
export default function StemWaveformView({
  stemsData = {},
  activeStems = {},
  progress = 0,
  height = 120,
  width = SCREEN_WIDTH - 32,
}) {
  const stemColors = {
    vocals: ["#F472B6", "#EC4899"],
    drums: ["#34D399", "#10B981"],
    bass: ["#60A5FA", "#3B82F6"],
    keys: ["#A78BFA", "#8B5CF6"],
    guitars: ["#FB923C", "#F97316"],
    other: ["#94A3B8", "#64748B"],
  };

  const renderStemLayer = (name, peaks, isActive, index) => {
    if (!peaks || peaks.length === 0) return null;
    
    const colors = stemColors[name.toLowerCase()] || stemColors.other;
    const opacity = isActive ? 0.6 : 0.1;
    const barWidth = width / peaks.length;
    
    // We create a path for all peaks to keep it performant (single SVG node)
    let pathData = "";
    peaks.forEach((peak, i) => {
      const h = peak * height;
      const x = i * barWidth;
      const y = (height - h) / 2;
      // Drawing a simple bar path
      pathData += `M${x},${y} L${x + barWidth * 0.8},${y} L${x + barWidth * 0.8},${y + h} L${x},${y + h} Z `;
    });

    return (
      <G key={name} opacity={opacity}>
        <Defs>
          <LinearGradient id={`grad-${name}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors[0]} stopOpacity="1" />
            <Stop offset="1" stopColor={colors[1]} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Path d={pathData} fill={`url(#grad-${name})`} />
      </G>
    );
  };

  const playheadX = progress * width;

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {Object.entries(stemsData).map(([name, peaks], idx) => 
          renderStemLayer(name, peaks, activeStems[name] !== false, idx)
        )}
        
        {/* Playhead */}
        <Path 
          d={`M${playheadX},0 L${playheadX},${height}`}
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          opacity={0.9}
        />
        
        {/* Playhead Glow */}
        <Path 
          d={`M${playheadX},0 L${playheadX},${height}`}
          stroke="#FFFFFF"
          strokeWidth="6"
          strokeLinecap="round"
          opacity={0.2}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 8,
  },
});
