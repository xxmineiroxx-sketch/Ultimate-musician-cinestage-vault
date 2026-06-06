/**
 * MasterpieceWaveform.js — Premium waveform for PersonalPracticeScreen.
 *
 * Rendering upgraded to @shopify/react-native-skia via UltimateWaveform.
 * Keeps the same prop API and section parsing. Adds BPM beat grid.
 *
 * Architecture:
 *   - UltimateWaveform handles rendering (GPU thread, 120fps)
 *   - This component handles: section parsing, peaks generation,
 *     section pill UI, stem layer toggle bar
 */
'use strict';

import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import UltimateWaveform from './UltimateWaveform';

// ─── Section parsing (same regex as before) ──────────────────────────────────
const CHORD_RE = /\b[A-G][#b]?(m|maj|min|sus|aug|dim|add|M)?[0-9]*(\/[A-G][#b]?)?\b/g;

const SECTION_HEADER_RE = /^\[([^\]]+)\]$/;
const LABEL_RE = /^(intro|verse|chorus|bridge|outro|pre[\s-]?chorus|channel|vamp|tag|hook|interlude|break|instrumental|solo|refrain|coda|ending|repeat|fill|part\s*\d|primeira|segunda|terceira|quarta|quinta|refr[aã]o|ponte|abertura|final|parte|verso)/i;

const COLOR_MAP = [
  [/intro|abertura/i,                     '#6B7280'],
  [/verse|verso|primeira|segunda|terceira|quarta|quinta|parte/i, '#6366F1'],
  [/pre.?chorus|pre.?refr/i,              '#8B5CF6'],
  [/chorus|refr[aã]o/i,                   '#EC4899'],
  [/bridge|ponte/i,                       '#F59E0B'],
  [/outro|coda|ending|final/i,            '#10B981'],
  [/channel|interlude/i,                  '#0EA5E9'],
  [/vamp|tag|hook|fill/i,                 '#F97316'],
  [/instrumental|break|solo/i,            '#6B7280'],
  [/repeat/i,                             '#EC4899'],
];

function colorFor(label) {
  for (const [re, color] of COLOR_MAP) {
    if (re.test(label)) return color;
  }
  return '#6366F1';
}

function parseSectionsFromText(text, durationMs = 0) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const total = lines.length || 1;
  const results = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 80) return;

    let rawLabel = null;
    const bracketMatch = trimmed.match(SECTION_HEADER_RE);
    if (bracketMatch) {
      rawLabel = bracketMatch[1];
    } else if (LABEL_RE.test(trimmed) && trimmed.length < 50 && !/^\|/.test(trimmed)) {
      rawLabel = trimmed;
    }
    if (!rawLabel) return;

    const positionSeconds = (idx / total) * (durationMs / 1000);
    const startPct = idx / total;
    const color = colorFor(rawLabel);
    const label = rawLabel.trim();
    results.push({ label, positionSeconds, startPct, color });
  });

  // Deduplicate consecutive same labels
  return results.filter((s, i) => i === 0 || s.label !== results[i - 1].label);
}

function buildPeaksFromText(text, numBars = 120) {
  if (!text) return Array(numBars).fill(0.3);
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return Array(numBars).fill(0.3);

  return Array.from({ length: numBars }, (_, i) => {
    const startLine = Math.floor((i / numBars) * lines.length);
    const endLine = Math.max(startLine + 1, Math.floor(((i + 1) / numBars) * lines.length));
    const segment = lines.slice(startLine, endLine).join('\n');
    const chords = (segment.match(CHORD_RE) || []).length;
    const textLen = segment.replace(/\s/g, '').length;
    const density = Math.min(1, chords * 0.18 + textLen * 0.008);
    const noise = Math.abs(Math.sin(i * 6.7 + startLine * 1.3)) * 0.12;
    return Math.max(0.06, Math.min(1, density + noise));
  });
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function MasterpieceWaveform({
  song,
  peaks: peaksProp = null,      // real peaks from server (1800 pts) — preferred
  progress = 0,                 // 0–1 playback progress
  duration = 0,                 // seconds
  onSeek,                       // (pct: 0–1) => void
  onSectionPress,               // (label, startPct, startMs, endPct) => void
  sectionMarkers = null,        // advanced pipeline sections
  cueMarkers = [],              // transient/cue markers
  activeStems = {},             // stem visibility map
  loopEnabled = false,
  loopSection = null,           // { label, startPct, endPct }
  style,
}) {
  const songText = song?.lyricsChordChart || song?.lyrics || song?.chordChart || song?.content || '';
  const bpm = song?.bpm || 0;

  // Use real server peaks if available, otherwise derive from text
  const peaks = useMemo(() => {
    if (peaksProp && peaksProp.length > 0) return peaksProp;
    if (song?.waveformPeaks?.peaks?.length > 0) return song.waveformPeaks.peaks;
    if (song?.waveformPeaks?.length > 0) return song.waveformPeaks;
    return buildPeaksFromText(songText, 120);
  }, [peaksProp, song?.waveformPeaks, songText]);

  const durationMs = duration * 1000;
  const sections = useMemo(
    () => (
      Array.isArray(sectionMarkers) && sectionMarkers.length > 0
        ? sectionMarkers.map((section, index) => ({
            ...section,
            label: section.label || section.section || `Section ${index + 1}`,
            positionSeconds: section.positionSeconds ?? section.timeSec ?? 0,
            startPct: section.startPct ?? ((section.timeSec || 0) / Math.max(1, duration)),
            color: section.color || colorFor(section.label || section.section),
          }))
        : parseSectionsFromText(songText, durationMs)
    ),
    [sectionMarkers, songText, durationMs, duration]
  );

  const currentTime = duration > 0 ? progress * duration : 0;

  // Loop region as 0–1 percentages
  const loopStartPct = loopEnabled && loopSection ? loopSection.startPct : null;
  const loopEndPct   = loopEnabled && loopSection ? loopSection.endPct   : null;

  // Adapt onSeek: MasterpieceWaveform callers expect pct (0–1)
  const handleSeek = useCallback((timeSeconds) => {
    if (!onSeek || duration <= 0) return;
    onSeek(timeSeconds / duration);
  }, [onSeek, duration]);

  // Section pill press
  const handleSectionPill = useCallback((sec, i) => {
    if (!onSectionPress) return;
    const nextSec = sections[i + 1];
    const endPct = nextSec ? nextSec.startPct : 1;
    const startMs = sec.startPct * durationMs;
    onSectionPress(sec.label, sec.startPct, startMs, endPct);
  }, [sections, durationMs, onSectionPress]);

  return (
    <View style={[styles.wrapper, style]}>
      {/* Section pill strip */}
      {sections.length >= 2 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}
          contentContainerStyle={styles.pillRow}
        >
          {sections.map((sec, i) => {
            const isActive =
              progress >= sec.startPct &&
              (i === sections.length - 1 || progress < sections[i + 1].startPct);
            return (
              <TouchableOpacity
                key={`pill-${i}`}
                onPress={() => handleSectionPill(sec, i)}
                style={[
                  styles.pill,
                  { borderColor: sec.color },
                  isActive && { backgroundColor: sec.color + '33' },
                ]}
              >
                <Text style={[styles.pillText, { color: sec.color }]}>
                  {sec.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Premium Skia waveform */}
      <UltimateWaveform
        peaks={peaks}
        duration={duration}
        currentTime={currentTime}
        onSeek={handleSeek}
        sections={sections}
        markers={cueMarkers}
        bpm={bpm}
        height={80}
        loopStartPct={loopStartPct}
        loopEndPct={loopEndPct}
        accentColor="#6366F1"
        style={styles.waveform}
      />

      {/* Time display */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

function formatTime(secs) {
  if (!secs || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  pillScroll: {
    marginBottom: 6,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6366F1',
  },
  waveform: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  timeText: {
    fontSize: 10,
    color: '#64748B',
    fontVariant: ['tabular-nums'],
  },
});
