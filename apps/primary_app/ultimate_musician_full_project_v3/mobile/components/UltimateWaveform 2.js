/**
 * UltimateWaveform.js
 *
 * Premium audio waveform component.
 *
 * Architecture inspired by:
 *   - SoundCloud: 1800-sample peaks, 3 visual states, GPU masking
 *   - BBC Peaks.js: min/max fill per chunk (eliminates aliasing)
 *   - WaveSurfer.js: gradient fill, rounded caps, retina handling
 *   - DSWaveformImage (Apple): logarithmic dB amplitude scaling
 *
 * Rendering: react-native-svg (SVG, compatible with Expo Go SDK 54)
 * Scrubbing:  PanResponder (reliable, no bridge jank for waveform)
 * Playhead:   Animated.Value overlay (60fps, zero SVG redraw)
 * Sections:   Colored band overlays from parseSectionsForWaveform
 * Beat grid:  BPM-driven vertical lines (bar lines every 4 beats)
 */

'use strict';

import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Line,
  Text as SvgText,
  ClipPath,
  Circle,
  Path,
} from 'react-native-svg';

// ─── Rendering constants ─────────────────────────────────────────────────────
const BAR_COUNT = 120;      // bars on screen (2.5px bar + 1px gap ≈ fits 360px)
const CORNER_RADIUS = 1.5;  // rounded bar caps (Ableton / WaveSurfer style)
const MIN_BAR_H = 2;        // floor height so silent sections still visible

// ─── Amplitude scaling ────────────────────────────────────────────────────────
// Power curve 0.4 ≈ perceptual dB without expensive log math.
// Maps linear RMS 0→1 to visual height 0→1.
function dBScale(linear) {
  if (!linear || linear <= 0) return 0;
  return Math.pow(Math.min(linear, 1), 0.4);
}

// ─── Downsample to BAR_COUNT using max-per-chunk ──────────────────────────────
function downsampleToBarCount(peaks, target) {
  if (!peaks || peaks.length === 0) return Array(target).fill(0.3);
  if (peaks.length <= target) {
    const result = [];
    const ratio = target / peaks.length;
    for (let i = 0; i < target; i++) {
      result.push(peaks[Math.floor(i / ratio)] || 0);
    }
    return result;
  }
  const ratio = peaks.length / target;
  const result = [];
  for (let i = 0; i < target; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let maxVal = 0;
    for (let j = start; j < end && j < peaks.length; j++) {
      if (peaks[j] > maxVal) maxVal = peaks[j];
    }
    result.push(maxVal);
  }
  return result;
}

// ─── Normalize peaks to 0→1 ──────────────────────────────────────────────────
function normalizePeaks(peaks) {
  if (!peaks || peaks.length === 0) return [];
  const maxVal = Math.max(...peaks, 0.001);
  return peaks.map(p => p / maxVal);
}

// ─── Main Component ───────────────────────────────────────────────────────────
/**
 * @param {Object} props
 * @param {number[]} props.peaks        - Normalized 0→1 float array (1800 from server, or fewer)
 * @param {number}   props.duration     - Total track duration in seconds
 * @param {number}   props.currentTime  - Current playback position in seconds
 * @param {Function} props.onSeek       - Called with (timeSeconds) on scrub
 * @param {Array}    props.sections     - [{label, positionSeconds, timeSec, color}] from parseSectionsForWaveform
 * @param {number}   props.bpm          - BPM for beat grid (0 = hidden)
 * @param {number}   props.height       - Component height in logical pixels (default 72)
 * @param {number|null} props.loopStartPct - Loop region start 0→1 (null = no loop)
 * @param {number|null} props.loopEndPct   - Loop region end 0→1 (null = no loop)
 * @param {string}   props.accentColor  - Primary color for played region (#6366F1)
 * @param {Object}   props.style        - Additional container styles
 */
export default function UltimateWaveform({
  peaks = [],
  duration = 0,
  currentTime = 0,
  onSeek,
  sections = [],
  bpm = 0,
  height = 72,
  loopStartPct = null,
  loopEndPct = null,
  accentColor = '#6366F1',
  style,
}) {
  const [containerWidth, setContainerWidth] = useState(360);
  const isDragging = useRef(false);
  const playheadAnim = useRef(new Animated.Value(0)).current;

  // ── Progress ──────────────────────────────────────────────────────────────
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const playheadX = progress * containerWidth;

  // Animate playhead smoothly during playback (only when not dragging)
  useEffect(() => {
    if (!isDragging.current) {
      Animated.timing(playheadAnim, {
        toValue: playheadX,
        duration: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [playheadX]);

  // ── Computed bar geometry ─────────────────────────────────────────────────
  const bars = useMemo(() => {
    if (containerWidth <= 10) return [];

    const rawPeaks = peaks && peaks.length > 0 ? peaks : [];
    const normalized = normalizePeaks(downsampleToBarCount(rawPeaks, BAR_COUNT));

    const barUnit = containerWidth / BAR_COUNT;
    const barW = Math.max(1, Math.round(barUnit * 0.72));
    const gap = barUnit - barW;

    return normalized.map((peak, i) => {
      const scaledH = dBScale(peak);
      const barH = Math.max(MIN_BAR_H, scaledH * (height - 4));
      const x = Math.round(i * barUnit + gap / 2);
      const y = height - barH; // bars rise from bottom
      const pct = i / BAR_COUNT;
      return { x, y: Math.round(y), w: barW, h: Math.round(barH), pct };
    });
  }, [peaks, containerWidth, height]);

  // ── Section color bands ───────────────────────────────────────────────────
  const sectionBands = useMemo(() => {
    if (!sections || sections.length === 0 || duration <= 0 || containerWidth <= 10) return [];
    return sections.map((sec, i) => {
      const nextSec = sections[i + 1];
      // Support both positionSeconds (UltimateWaveform) and timeSec (parseSectionsForWaveform)
      const posSec = sec.positionSeconds != null ? sec.positionSeconds : (sec.timeSec || 0);
      const nextPosSec = nextSec
        ? (nextSec.positionSeconds != null ? nextSec.positionSeconds : (nextSec.timeSec || 0))
        : duration;
      const startPct = posSec / duration;
      const endPct = nextPosSec / duration;
      const x = Math.round(startPct * containerWidth);
      const w = Math.round((endPct - startPct) * containerWidth);
      return { x, w: Math.max(w, 1), color: sec.color || '#6366F1', label: sec.label };
    }).filter(b => b.w > 0);
  }, [sections, duration, containerWidth]);

  // ── Beat grid ─────────────────────────────────────────────────────────────
  const beatLines = useMemo(() => {
    if (bpm <= 0 || duration <= 0 || containerWidth <= 10) return [];
    const beatSec = 60 / bpm;
    const totalBeats = Math.floor(duration / beatSec);
    const lines = [];
    for (let i = 1; i < totalBeats && i < 2000; i++) {
      const pct = (i * beatSec) / duration;
      if (pct >= 1) break;
      lines.push({
        x: Math.round(pct * containerWidth),
        isBarLine: i % 4 === 0,
      });
    }
    return lines;
  }, [bpm, duration, containerWidth]);

  // ── Loop region ─────────────────────────────────────────────────────────────
  const loopRect = useMemo(() => {
    if (loopStartPct == null || loopEndPct == null) return null;
    const lx = Math.round(loopStartPct * containerWidth);
    const lw = Math.round((loopEndPct - loopStartPct) * containerWidth);
    return { x: lx, w: Math.max(2, lw) };
  }, [loopStartPct, loopEndPct, containerWidth]);

  // ── Playhead position (for SVG rendering) ─────────────────────────────────
  const playheadXRounded = Math.round(playheadX);

  // ── PanResponder scrubbing ────────────────────────────────────────────────
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,

    onPanResponderGrant: (e) => {
      isDragging.current = true;
      const x = e.nativeEvent.locationX;
      const pct = Math.max(0, Math.min(1, x / containerWidth));
      playheadAnim.setValue(pct * containerWidth);
      onSeek && onSeek(pct * duration);
    },

    onPanResponderMove: (e) => {
      const x = e.nativeEvent.locationX;
      const pct = Math.max(0, Math.min(1, x / containerWidth));
      playheadAnim.setValue(pct * containerWidth);
      onSeek && onSeek(pct * duration);
    },

    onPanResponderRelease: () => {
      isDragging.current = false;
    },

    onPanResponderTerminate: () => {
      isDragging.current = false;
    },
  }), [containerWidth, duration, onSeek]);

  const onLayout = useCallback((e) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View
      style={[styles.container, { height }, style]}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      <Svg width={containerWidth} height={height}>
        <Defs>
          <LinearGradient id="playedGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accentColor} stopOpacity="1" />
            <Stop offset="1" stopColor={accentColor} stopOpacity="0.55" />
          </LinearGradient>
        </Defs>

        {/* 1. Section color bands (behind everything) */}
        {sectionBands.map((band, i) => (
          <Rect
            key={`sb${i}`}
            x={band.x}
            y={0}
            width={band.w}
            height={height}
            fill={band.color + '22'}
          />
        ))}

        {/* 2. Beat grid lines */}
        {beatLines.map((beat, i) => (
          <Line
            key={`bl${i}`}
            x1={beat.x} y1={0} x2={beat.x} y2={height}
            stroke={beat.isBarLine ? '#334155' : '#1E293B'}
            strokeWidth={1}
          />
        ))}

        {/* 3. Waveform bars — unplayed portion */}
        {bars.map((bar, i) =>
          bar.pct > progress ? (
            <Rect
              key={`u${i}`}
              x={bar.x}
              y={bar.y}
              width={bar.w}
              height={bar.h}
              fill="#1E293B"
              rx={CORNER_RADIUS}
            />
          ) : null
        )}

        {/* 4. Waveform bars — played portion (accent gradient) */}
        {bars.map((bar, i) =>
          bar.pct <= progress ? (
            <Rect
              key={`p${i}`}
              x={bar.x}
              y={bar.y}
              width={bar.w}
              height={bar.h}
              fill="url(#playedGrad)"
              rx={CORNER_RADIUS}
            />
          ) : null
        )}

        {/* 5. Loop region overlay */}
        {loopRect && (
          <>
            <Rect
              x={loopRect.x}
              y={0}
              width={loopRect.w}
              height={height}
              fill={accentColor + '2E'}
            />
            <Line
              x1={loopRect.x} y1={0} x2={loopRect.x} y2={height}
              stroke={accentColor} strokeWidth={1.5} opacity={0.6}
            />
            <Line
              x1={loopRect.x + loopRect.w} y1={0}
              x2={loopRect.x + loopRect.w} y2={height}
              stroke={accentColor} strokeWidth={1.5} opacity={0.6}
            />
          </>
        )}

        {/* 6. Section label ticks */}
        {sectionBands.map((band, i) => (
          <React.Fragment key={`sl${i}`}>
            <Line
              x1={band.x} y1={0} x2={band.x} y2={height - 14}
              stroke={band.color}
              strokeWidth={1.5}
              strokeDasharray="3,3"
              opacity={0.7}
            />
            {band.label ? (
              <SvgText
                x={band.x + 3}
                y={height - 3}
                fontSize={9}
                fontWeight="700"
                fill={band.color}
                opacity={0.85}
              >
                {band.label}
              </SvgText>
            ) : null}
          </React.Fragment>
        ))}

        {/* 7. Playhead glow + line */}
        {playheadXRounded > 0 && (
          <>
            <Rect
              x={playheadXRounded - 5}
              y={0}
              width={12}
              height={height}
              fill="rgba(255,255,255,0.06)"
            />
            <Line
              x1={playheadXRounded} y1={0} x2={playheadXRounded} y2={height}
              stroke="#FFFFFF"
              strokeWidth={1.5}
              opacity={0.9}
            />
          </>
        )}
      </Svg>

      {/* Animated playhead dot overlay — runs at 60fps via Animated.Value */}
      <Animated.View
        style={[
          styles.playheadTrack,
          { height, transform: [{ translateX: playheadAnim }] },
        ]}
        pointerEvents="none"
      >
        <View style={styles.playheadDot} />
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  playheadTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 2,
    alignItems: 'center',
  },
  playheadDot: {
    position: 'absolute',
    top: -1,
    left: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
