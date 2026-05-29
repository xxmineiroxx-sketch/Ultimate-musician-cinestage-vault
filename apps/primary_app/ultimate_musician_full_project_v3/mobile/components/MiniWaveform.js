/**
 * MiniWaveform.js
 * Compact waveform display for song list rows and cards.
 * Shows a miniature version of the audio peaks.
 */
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { getWaveformPeaks } from '../services/waveformService';

const DEFAULT_COLOR = '#6366f1';
const PLAYHEAD_COLOR = '#f59e0b';

export default function MiniWaveform({
  songId,
  audioUrl = null,
  width = 120,
  height = 32,
  color = DEFAULT_COLOR,
  backgroundColor = 'transparent',
  playheadPosition = null,  // 0.0 – 1.0, null = hidden
  showLoadingBar = true,
  style,
}) {
  const [peaks, setPeaks] = useState(null);
  const [loading, setLoading] = useState(false);
  const loadingAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!songId) return;
    let cancelled = false;
    setLoading(true);

    // Start shimmer animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(loadingAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(loadingAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    getWaveformPeaks(songId, audioUrl).then(data => {
      if (!cancelled) {
        setPeaks(data?.peaks || null);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [songId, audioUrl]);

  const numBars = Math.floor(width / 3);
  const barWidth = 2;
  const barGap = 1;

  function downsample(rawPeaks, targetCount) {
    if (!rawPeaks || rawPeaks.length === 0) return [];
    if (rawPeaks.length <= targetCount) return rawPeaks;
    const step = rawPeaks.length / targetCount;
    return Array.from({ length: targetCount }, (_, i) => {
      const start = Math.floor(i * step);
      const end = Math.min(rawPeaks.length, Math.floor((i + 1) * step));
      let max = 0;
      for (let j = start; j < end; j++) max = Math.max(max, Math.abs(rawPeaks[j]));
      return max;
    });
  }

  const displayPeaks = peaks ? downsample(peaks, numBars) : [];
  const maxPeak = displayPeaks.length > 0 ? Math.max(...displayPeaks, 0.01) : 1;
  const centerY = height / 2;

  if (!peaks && !loading) {
    // Placeholder flat line
    return (
      <View style={[styles.container, { width, height }, style]}>
        <Svg width={width} height={height}>
          <Line x1={0} y1={centerY} x2={width} y2={centerY} stroke={color} strokeWidth={1} strokeOpacity={0.3} />
        </Svg>
      </View>
    );
  }

  if (loading && showLoadingBar) {
    return (
      <View style={[styles.container, { width, height }, style]}>
        <Animated.View style={{ opacity: loadingAnim, width, height: 2, backgroundColor: color, borderRadius: 1, marginTop: (height - 2) / 2 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width, height, backgroundColor }, style]}>
      <Svg width={width} height={height}>
        {displayPeaks.map((peak, i) => {
          const normalized = peak / maxPeak;
          const barH = Math.max(2, normalized * height * 0.85);
          const x = i * (barWidth + barGap);
          return (
            <Rect
              key={i}
              x={x}
              y={centerY - barH / 2}
              width={barWidth}
              height={barH}
              rx={1}
              fill={color}
              fillOpacity={0.85}
            />
          );
        })}
        {playheadPosition !== null && (
          <Line
            x1={playheadPosition * width}
            y1={0}
            x2={playheadPosition * width}
            y2={height}
            stroke={PLAYHEAD_COLOR}
            strokeWidth={1.5}
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
