import React, { useRef, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  PanResponder,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

const SECTION_COLORS = {
  Intro:       '#6B7280',
  Verse:       '#6366F1',
  'Pre-Chorus':'#8B5CF6',
  Chorus:      '#EC4899',
  Bridge:      '#F59E0B',
  Outro:       '#10B981',
  Tag:         '#0EA5E9',
};

const STEM_COLORS = {
  vocals: "#F472B6",
  drums: "#34D399",
  bass: "#60A5FA",
  keys: "#A78BFA",
  guitars: "#FB923C",
  guitar: "#FB923C",
  other: "#94A3B8",
};

export default function MasterpieceWaveform({ 
  song, 
  userRole, 
  onSeek, 
  onSectionPress, 
  positionMs, 
  durationMs,
  stemsData = {},
  activeStems = {},
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [waveWidth, setWaveWidth]   = useState(SCREEN_WIDTH - 40);
  const waveWidthRef                = useRef(SCREEN_WIDTH - 40);

  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  // Build sections from song structure
  const sections = useMemo(() => {
    const raw = song?.structure;
    if (Array.isArray(raw) && raw.length > 0 && raw[0].start_ms != null) {
      const dur = durationMs || 1;
      return raw.map((s) => ({
        label:    s.section || s.name || 'Section',
        startPct: s.start_ms / dur,
        endPct:   s.end_ms   / dur,
        startMs:  s.start_ms,
      }));
    }
    return [
      { label: 'Intro',  startPct: 0.00, endPct: 0.10, startMs: 0 },
      { label: 'Verse',  startPct: 0.10, endPct: 0.35, startMs: durationMs * 0.1 },
      { label: 'Chorus', startPct: 0.35, endPct: 0.60, startMs: durationMs * 0.35 },
      { label: 'Bridge', startPct: 0.60, endPct: 0.85, startMs: durationMs * 0.6 },
      { label: 'Outro',  startPct: 0.85, endPct: 1.00, startMs: durationMs * 0.85 },
    ];
  }, [song?.structure, durationMs]);

  const panRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        const pct = Math.max(0, Math.min(1, evt.nativeEvent.locationX / waveWidthRef.current));
        onSeek?.(Math.floor(pct * durationMs));
      },
      onPanResponderMove: (evt) => {
        const pct = Math.max(0, Math.min(1, evt.nativeEvent.locationX / waveWidthRef.current));
        onSeek?.(Math.floor(pct * durationMs));
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
      },
    })
  ).current;

  const renderStemLayer = (name, peaks, isActive, height) => {
    if (!peaks || peaks.length === 0) return null;
    const color = STEM_COLORS[name.toLowerCase()] || STEM_COLORS.other;
    const opacity = isActive ? 0.6 : 0.05;
    const barWidth = waveWidth / peaks.length;
    
    return (
      <View key={name} style={[StyleSheet.absoluteFill, { flexDirection: 'row', alignItems: 'center', opacity }]}>
        {peaks.map((peak, i) => (
          <View 
            key={i} 
            style={{
              width: barWidth * 0.7,
              height: Math.max(2, peak * height),
              backgroundColor: color,
              marginRight: barWidth * 0.3,
              borderRadius: 1,
            }} 
          />
        ))}
      </View>
    );
  };

  const playheadX = progress * waveWidth;

  return (
    <View style={styles.root}>
      {/* ── Section Pills ── */}
      <View style={styles.sectionsRow}>
        {sections.map((sec, i) => {
          const flex  = Math.max(0.05, sec.endPct - sec.startPct);
          const color = SECTION_COLORS[sec.label] || '#6B7280';
          const isActiveSection = progress >= sec.startPct && progress < sec.endPct;
          
          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.pill, 
                { 
                  flex, 
                  borderColor: color, 
                  backgroundColor: isActiveSection ? color : color + '20' 
                }
              ]}
              onPress={() => onSectionPress?.(sec.startMs, sec.label)}
            >
              <Text 
                style={[
                  styles.pillText, 
                  { color: isActiveSection ? '#FFF' : color }
                ]} 
                numberOfLines={1}
              >
                {sec.label.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── The Masterpiece Waveform Area ── */}
      <View 
        {...panRef.panHandlers}
        style={styles.waveArea}
        onLayout={(e) => {
          waveWidthRef.current = e.nativeEvent.layout.width;
          setWaveWidth(e.nativeEvent.layout.width);
        }}
      >
        {/* Render stacked layers */}
        {Object.entries(stemsData).map(([name, peaks]) => 
          renderStemLayer(name, peaks, activeStems[name] !== false, 100)
        )}

        {/* Playhead */}
        <View style={[styles.playhead, { left: playheadX }]} />
        <View style={[styles.playheadGlow, { left: playheadX - 4 }]} />
      </View>

      {/* ── Time Row ── */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{fmt(positionMs)}</Text>
        <Text style={styles.timeText}>{fmt(durationMs)}</Text>
      </View>
    </View>
  );
}

function fmt(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sectionsRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 15,
  },
  pill: {
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  waveArea: {
    height: 100,
    position: 'relative',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  playhead: {
    position: 'absolute',
    width: 2,
    height: '100%',
    backgroundColor: '#FFF',
    zIndex: 20,
  },
  playheadGlow: {
    position: 'absolute',
    width: 10,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 19,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  timeText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
});
