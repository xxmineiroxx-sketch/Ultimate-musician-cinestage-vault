/**
 * WaveformBar — role-aware song waveform for the Setlist screen.
 *
 * Shows:
 *  • Color-coded section pills (Intro / Verse / Chorus / Bridge / Outro)
 *  • Synthetic waveform bars — shape is deterministic per song title
 *  • Live playhead that the user can drag to seek
 *  • Role-specific cue badge (from song.role_content)
 *  • Start / end time
 *
 * Interactions:
 *  • Tap a section pill  → onSectionPress(startMs, label)
 *  • Tap / drag waveform → onSeek(positionMs)
 */

import React, { useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  PanResponder,
  StyleSheet,
} from 'react-native';

// ── Constants ─────────────────────────────────────────────────────────────────
const BAR_COUNT  = 60;
const BAR_MAX_H  = 38;   // px — tallest possible bar

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministic pseudo-random from a string seed. */
function makeRng(seed) {
  let h = 0;
  for (let i = 0; i < (seed || '').length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return (h >>> 0) / 0xffffffff;
  };
}

/** Parse "3:45" or "3:45:00" duration string → milliseconds. */
function parseDuration(dur) {
  if (!dur) return 3 * 60 * 1000;
  const parts = String(dur).split(':').map(Number);
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 3 * 60 * 1000;
}

/** Format milliseconds → "m:ss" */
function fmt(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Data tables ───────────────────────────────────────────────────────────────

const DEFAULT_SECTIONS = [
  { label: 'Intro',  startPct: 0.00, endPct: 0.08 },
  { label: 'Verse',  startPct: 0.08, endPct: 0.29 },
  { label: 'Chorus', startPct: 0.29, endPct: 0.48 },
  { label: 'Verse',  startPct: 0.48, endPct: 0.65 },
  { label: 'Bridge', startPct: 0.65, endPct: 0.82 },
  { label: 'Outro',  startPct: 0.82, endPct: 1.00 },
];

const SECTION_COLORS = {
  Intro:       '#6B7280',
  Verse:       '#6366F1',
  'Pre-Chorus':'#8B5CF6',
  Chorus:      '#EC4899',
  Bridge:      '#F59E0B',
  Outro:       '#10B981',
  Tag:         '#0EA5E9',
};

const ROLE_COLORS = {
  worship_leader:   '#F59E0B',
  lead_vocal:       '#EC4899',
  bgv_1:            '#C026D3',
  bgv_2:            '#9333EA',
  bgv_3:            '#7C3AED',
  keyboard:         '#6366F1',
  piano:            '#6366F1',
  synth:            '#818CF8',
  electric_guitar:  '#F97316',
  rhythm_guitar:    '#FB923C',
  acoustic_guitar:  '#EAB308',
  bass:             '#10B981',
  drums:            '#EF4444',
  percussion:       '#DC2626',
  strings:          '#A78BFA',
  brass:            '#FBBF24',
  music_director:   '#0EA5E9',
  foh_engineer:     '#64748B',
  monitor_engineer: '#94A3B8',
  stream_engineer:  '#38BDF8',
  lighting:         '#FB923C',
  media_tech:       '#A3E635',
};

const ROLE_EMOJIS = {
  worship_leader: '🎸',  lead_vocal: '🎤',
  bgv_1: '🎤', bgv_2: '🎤', bgv_3: '🎤',
  keyboard: '🎹', piano: '🎹', synth: '🎛️',
  electric_guitar: '🎸', rhythm_guitar: '🎸', acoustic_guitar: '🎸',
  bass: '🎸', drums: '🥁', percussion: '🪘', strings: '🎻', brass: '🎺',
  music_director: '🎼', foh_engineer: '🎚️', monitor_engineer: '🎚️',
  stream_engineer: '📡', lighting: '💡', media_tech: '🖥️',
};

const ROLE_CONTENT_KEY = {
  worship_leader: 'guitar', lead_vocal: 'vocals',
  bgv_1: 'vocals', bgv_2: 'vocals', bgv_3: 'vocals',
  keyboard: 'keyboard', piano: 'keyboard', synth: 'keyboard',
  electric_guitar: 'guitar', rhythm_guitar: 'guitar', acoustic_guitar: 'guitar',
  bass: 'bass', drums: 'drums', percussion: 'drums',
  strings: 'keyboard', brass: 'keyboard',
  music_director: 'keyboard',
  foh_engineer: 'foh_engineer', monitor_engineer: 'monitor_engineer',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function WaveformBar({ song, userRole, onSeek, onSectionPress }) {
  const [seekPct, setSeekPct]       = useState(0);
  const [waveWidth, setWaveWidth]   = useState(300);
  const waveWidthRef                = useRef(300);

  const durationMs = parseDuration(song?.duration);

  // Build sections
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
    return DEFAULT_SECTIONS.map((s) => ({
      ...s,
      startMs: Math.floor(s.startPct * durationMs),
    }));
  }, [song?.structure, durationMs]);

  // Build synthetic waveform bars
  const bars = useMemo(() => {
    const rng = makeRng(song?.title || 'song');
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const pct = i / BAR_COUNT;
      const sec = sections.find((s) => pct >= s.startPct && pct < s.endPct);
      const lbl = sec?.label;
      const amp =
        lbl === 'Chorus' ? 0.70 :
        lbl === 'Bridge' ? 0.60 :
        lbl === 'Intro'  ? 0.28 :
        lbl === 'Outro'  ? 0.25 : 0.50;
      return amp + rng() * 0.38;
    });
  }, [song?.title, sections]);

  // Role cue
  const roleCue = useMemo(() => {
    if (!song?.role_content || !userRole) return null;
    const key = ROLE_CONTENT_KEY[userRole];
    if (!key) return null;
    const rc = song.role_content[key];
    if (!rc) return null;
    return rc.cues || rc.notes || rc.technique || null;
  }, [song?.role_content, userRole]);

  const roleColor = ROLE_COLORS[userRole] || '#4F46E5';
  const roleEmoji = ROLE_EMOJIS[userRole] || '🎵';

  // ── PanResponder ────────────────────────────────────────────────────────────
  const panRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (evt) => {
        const pct = clamp01(evt.nativeEvent.locationX / waveWidthRef.current);
        setSeekPct(pct);
      },
      onPanResponderMove: (evt) => {
        const pct = clamp01(evt.nativeEvent.locationX / waveWidthRef.current);
        setSeekPct(pct);
      },
      onPanResponderRelease: (evt) => {
        const pct = clamp01(evt.nativeEvent.locationX / waveWidthRef.current);
        setSeekPct(pct);
        onSeek?.(Math.floor(pct * durationMs));
      },
    })
  ).current;

  function clamp01(v) { return Math.max(0, Math.min(1, v || 0)); }

  const playheadLeft = seekPct * waveWidth;

  return (
    <View style={styles.root}>

      {/* ── Section pills ───────────────────────────────────────────────── */}
      <View style={styles.sectionsRow}>
        {sections.map((sec, i) => {
          const flex  = Math.max(0.02, sec.endPct - sec.startPct);
          const color = SECTION_COLORS[sec.label] || '#6B7280';
          return (
            <TouchableOpacity
              key={i}
              style={[styles.pill, { flex, borderColor: color, backgroundColor: color + '20' }]}
              onPress={() => onSectionPress?.(sec.startMs, sec.label)}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color }]} numberOfLines={1}>
                {sec.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Waveform bars ───────────────────────────────────────────────── */}
      <View
        {...panRef.panHandlers}
        style={styles.waveArea}
        onLayout={(e) => {
          waveWidthRef.current = e.nativeEvent.layout.width;
          setWaveWidth(e.nativeEvent.layout.width);
        }}
      >
        {bars.map((h, i) => {
          const barPct  = i / BAR_COUNT;
          const isPast  = barPct < seekPct;
          const barH    = Math.max(3, h * BAR_MAX_H);
          return (
            <View key={i} style={styles.barWrap}>
              <View
                style={[
                  styles.bar,
                  {
                    height:          barH,
                    backgroundColor: isPast ? roleColor : roleColor + '40',
                  },
                ]}
              />
            </View>
          );
        })}

        {/* Playhead */}
        <View
          style={[styles.playhead, { left: playheadLeft }]}
          pointerEvents="none"
        />
      </View>

      {/* ── Role cue ────────────────────────────────────────────────────── */}
      {!!roleCue && (
        <View style={styles.cueRow}>
          <Text style={[styles.cueText, { color: roleColor }]} numberOfLines={2}>
            {roleEmoji}{'  '}{roleCue}
          </Text>
        </View>
      )}

      {/* ── Time ────────────────────────────────────────────────────────── */}
      <View style={styles.timeRow}>
        <Text style={styles.timeLeft}>{fmt(seekPct * durationMs)}</Text>
        <Text style={styles.timeRight}>{song?.duration || fmt(durationMs)}</Text>
      </View>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    marginTop: 12,
    backgroundColor: '#060D1E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 10,
    overflow: 'hidden',
  },

  // Section pills
  sectionsRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 8,
  },
  pill: {
    borderRadius: 4,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 4,
  },
  pillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // Waveform
  waveArea: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_MAX_H + 4,
    position: 'relative',
    gap: 1,
  },
  barWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_MAX_H + 4,
  },
  bar: {
    width: '80%',
    borderRadius: 2,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
    opacity: 0.85,
  },

  // Role cue
  cueRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cueText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    flex: 1,
  },

  // Time
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  timeLeft:  { color: '#6B7280', fontSize: 10 },
  timeRight: { color: '#374151', fontSize: 10 },
});
