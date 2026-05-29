/**
 * Lyrics View Screen - Ultimate Playback
 * Fullscreen lyrics display for vocal team members
 * Supports manual scroll and auto-scroll toggle
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROLE_LABELS } from '../models_v2/models';
import ChartReferencePanel from '../components/ChartReferencePanel';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';
import { transposeChordChart, transposeNote } from '../utils/transpose';

// Chromatic scale used for display-key calculation
const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS   = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']);

/** Return the display key after shifting `baseKey` by `semitones`. */
function shiftKey(baseKey, semitones) {
  if (!baseKey || semitones === 0) return baseKey || '';
  const arr = FLAT_KEYS.has(baseKey) ? NOTES_FLAT : NOTES_SHARP;
  let idx = arr.indexOf(baseKey);
  if (idx === -1) {
    // Try the other array
    const alt = arr === NOTES_FLAT ? NOTES_SHARP : NOTES_FLAT;
    idx = alt.indexOf(baseKey);
    if (idx === -1) return baseKey;
  }
  return arr[((idx + semitones) % 12 + 12) % 12];
}

// ── Chord / Lyric Renderer ──────────────────────────────────────────────────
// Matches common chord tokens: C, Cm, C7, Cmaj7, C/E, C#m, Db7sus4, etc.
const CHORD_TOKEN_RE = /^[A-G][#b]?(m|M|maj|min|dim|aug|sus|add|no)?[2-9]?(\/[A-G][#b]?)?$/;
const isChordToken = (tok) => CHORD_TOKEN_RE.test(tok.replace(/[|()\-]/g, ''));

function classifyLine(line) {
  const t = line.trim();
  if (!t) return 'empty';
  if (
    (t.startsWith('[') && t.endsWith(']')) ||
    /^(intro|verse|pre-?chorus|chorus|bridge|outro|solo|final|tag|vamp|turnaround|instrumental)\s*[\d:.]*\s*:?$/i.test(t)
  ) return 'section';
  if (/@\[/.test(t)) return 'rig';
  // ≥55% of non-space tokens look like chords → chord line
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 1) {
    const chordCount = tokens.filter(isChordToken).length;
    if (chordCount / tokens.length >= 0.55) return 'chord';
  }
  return 'lyric';
}

// Inline rig color map (matches ContentEditorScreen defaults)
const RIG_COLORS = {
  Nord: '#EF4444', MODX: '#3B82F6', VS: '#10B981',
  Vintage: '#F59E0B', Synth: '#8B5CF6', Pad: '#EC4899',
};

function renderRigLine(line, fontSize) {
  // Split on @[RigName] tags
  const parts = line.split(/(@\[[^\]]+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^@\[([^\]]+)\]$/);
    if (m) {
      const color = RIG_COLORS[m[1]] || '#A78BFA';
      return (
        <Text key={i} style={{ color, fontWeight: '700' }}>{m[1]}</Text>
      );
    }
    return <Text key={i} style={{ color: '#D1D5DB' }}>{part}</Text>;
  });
}

function renderChartLines(text, fontSize, isVocal) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    const type = isVocal ? 'lyric' : classifyLine(line);
    if (type === 'empty') return <View key={i} style={{ height: Math.round(fontSize * 0.5) }} />;
    if (type === 'section') {
      return (
        <Text key={i} style={[styles.sectionLine, { fontSize: Math.round(fontSize * 0.8) }]}>
          {line.trim().replace(/^\[|\]$/g, '').toUpperCase()}
        </Text>
      );
    }
    if (type === 'chord') {
      return (
        <Text key={i} style={[styles.chordLine, { fontSize }]}>{line}</Text>
      );
    }
    if (type === 'rig') {
      return (
        <Text key={i} style={{ fontSize, lineHeight: fontSize * 1.6 }}>
          {renderRigLine(line, fontSize)}
        </Text>
      );
    }
    // lyric
    return <Text key={i} style={[styles.lyricLine, { fontSize }]}>{line}</Text>;
  });
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const AUTO_SCROLL_INTERVAL = 80; // ms between scroll steps
const AUTO_SCROLL_STEP = 1;      // px per step

// ── Section parsing (shared with SetlistRunnerScreen) ─────────────────────────
const SECTION_RE = /^(verse|chorus|bridge|pre.?chorus|intro|outro|tag|vamp|refrain|hook|interlude|breakdown|turn|ending)\b/i;
function parseSections(text) {
  if (!text) return [];
  const sections = [];
  const lines = text.split('\n');
  let charOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim().replace(/^\[|\]$/g, '');
    if (SECTION_RE.test(trimmed)) {
      sections.push({ name: trimmed, charOffset, lineIndex: i });
    }
    charOffset += lines[i].length + 1;
  }
  return sections;
}

export default function LyricsViewScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { song, userRole, capo = 0, concertKey, myPart } = route.params || {};
  const [autoScroll, setAutoScroll] = useState(false);
  const [fontSize, setFontSize] = useState(20);
  // Semitone shift applied on top of whatever key the chart arrived in
  const [transposeStep, setTransposeStep] = useState(0);
  const [activeLiveCueLabel, setActiveLiveCueLabel] = useState(null);
  const scrollRef = useRef(null);
  const scrollPos = useRef(0);
  const contentH = useRef(0);
  const intervalRef = useRef(null);
  const liveCueTimer = useRef(null);
  const lastCueTs = useRef(0);

  // ── Live section cue — scroll to section by label ─────────────────────────
  const scrollToSectionByLabel = (label) => {
    if (!label || !song) return;
    const text = song.lyrics || '';
    const secs = parseSections(text);
    const idx = secs.findIndex(s => s.name.toLowerCase().startsWith(label.toLowerCase()));
    if (idx < 0) return;
    const totalLen = text.length || 1;
    const targetY = Math.max(0, (secs[idx].charOffset / totalLen) * contentH.current - 40);
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
    scrollPos.current = targetY;
  };

  // ── Poll for live section cues from the leader ─────────────────────────────
  useEffect(() => {
    if (!song?.id) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${SYNC_URL}/sync/live-cue`, { headers: syncHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (
          data?.type === 'SECTION_CUE' &&
          data?.sectionLabel &&
          data?.timestamp &&
          data.timestamp > lastCueTs.current
        ) {
          lastCueTs.current = data.timestamp;
          scrollToSectionByLabel(data.sectionLabel);
          setActiveLiveCueLabel(data.sectionLabel);
          clearTimeout(liveCueTimer.current);
          liveCueTimer.current = setTimeout(() => setActiveLiveCueLabel(null), 5000);
        }
      } catch { /* network errors are expected when offline */ }
    }, 4000);
    return () => {
      clearInterval(poll);
      clearTimeout(liveCueTimer.current);
    };
  }, [song?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll) {
      intervalRef.current = setInterval(() => {
        scrollPos.current += AUTO_SCROLL_STEP;
        scrollRef.current?.scrollTo({ y: scrollPos.current, animated: false });
      }, AUTO_SCROLL_INTERVAL);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoScroll]);

  if (!song) {
    return (
      <View style={styles.container}>
        <View style={styles.noDataState}>
          <Text style={styles.noDataText}>No lyrics available.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backLink}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isInstrumentChart = !ROLE_LABELS[userRole] && !!userRole;
  const isVocal = !isInstrumentChart;
  const isBassRole = (userRole || '').toLowerCase() === 'bass';
  const roleLabel = ROLE_LABELS[userRole] || userRole || 'Vocalist';
  const rolePillIcon = isInstrumentChart ? '🎼' : '🎤';

  // ── Transpose derived values ──────────────────────────────────────────────
  const baseKey = (song.key || '').trim();         // key as delivered by SetlistScreen
  const hasKey  = !!baseKey;

  // The key currently displayed (after user's ± steps)
  const displayKey = hasKey ? shiftKey(baseKey, transposeStep) : '';

  // When capo is in play the chart uses capo shapes — the "concert" (sounding) key
  // comes from the concertKey param; we also shift it by transposeStep.
  const baseConcertKey = (concertKey || '').trim();
  const displayConcertKey = baseConcertKey && capo > 0
    ? shiftKey(baseConcertKey, transposeStep)
    : '';

  // Determine if new key should prefer flats
  const preferFlats = FLAT_KEYS.has(displayKey);

  // Apply transposition to the raw lyrics/chart text
  const rawLyrics = song.lyrics || '';
  const lyrics = useMemo(() => {
    if (!transposeStep || isVocal) return rawLyrics;
    return transposeChordChart(rawLyrics, transposeStep, preferFlats);
  }, [rawLyrics, transposeStep, isVocal, preferFlats]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Top Bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <Text style={styles.topTitle} numberOfLines={1}>{song.title}</Text>
          {song.artist ? (
            <Text style={styles.topArtist} numberOfLines={1}>{song.artist}</Text>
          ) : null}
        </View>

        <View style={styles.topRight}>
          {capo > 0 ? (
            <View style={[styles.keyBadge, styles.capoBadge]}>
              <Text style={styles.capoBadgeText}>Capo {capo}</Text>
              {displayKey ? (
                <Text style={styles.capoShapesText}>
                  {displayKey} shapes{transposeStep !== 0 ? ` (${transposeStep > 0 ? '+' : ''}${transposeStep})` : ''}
                </Text>
              ) : null}
            </View>
          ) : displayKey ? (
            <View style={styles.keyBadge}>
              <Text style={styles.keyBadgeText}>
                {displayKey}{transposeStep !== 0 ? ` (${transposeStep > 0 ? '+' : ''}${transposeStep})` : ''}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Role + Controls Bar */}
      <View style={styles.controlsBar}>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>{rolePillIcon} {roleLabel}</Text>
        </View>

        <View style={styles.controlsRight}>
          {/* Font size controls */}
          <TouchableOpacity
            style={styles.sizeBtn}
            onPress={() => setFontSize((s) => Math.max(14, s - 2))}
          >
            <Text style={styles.sizeBtnText}>A−</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sizeBtn}
            onPress={() => setFontSize((s) => Math.min(32, s + 2))}
          >
            <Text style={styles.sizeBtnText}>A+</Text>
          </TouchableOpacity>

          {/* Auto-scroll toggle */}
          <TouchableOpacity
            style={[styles.scrollBtn, autoScroll && styles.scrollBtnActive]}
            onPress={() => setAutoScroll((v) => !v)}
          >
            <Text style={[styles.scrollBtnText, autoScroll && styles.scrollBtnTextActive]}>
              {autoScroll ? '⏸ Scroll' : '▶ Scroll'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Transpose control — shown only when song has a known key */}
      {hasKey ? (
        <View style={styles.transposeBar}>
          <TouchableOpacity
            style={styles.transposeBtn}
            onPress={() => setTransposeStep((s) => s - 1)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.transposeBtnText}>−</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.transposeKeyPill}
            onLongPress={() => setTransposeStep(0)}
            activeOpacity={0.8}
          >
            <Text style={styles.transposeKeyText}>
              {displayKey || baseKey}
            </Text>
            {transposeStep !== 0 ? (
              <Text style={styles.transposeStepBadge}>
                {transposeStep > 0 ? '+' : ''}{transposeStep}
              </Text>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.transposeBtn}
            onPress={() => setTransposeStep((s) => s + 1)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.transposeBtnText}>+</Text>
          </TouchableOpacity>

          {displayConcertKey ? (
            <Text style={styles.transposeConcertKey}>
              Concert: {displayConcertKey}
            </Text>
          ) : null}

          {transposeStep !== 0 ? (
            <TouchableOpacity
              style={styles.transposeResetBtn}
              onPress={() => setTransposeStep(0)}
            >
              <Text style={styles.transposeResetText}>Reset</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Your Part badge — shown for vocalists when admin has assigned parts */}
      {myPart && isVocal ? (
        <View style={styles.partBanner}>
          <Text style={styles.partBannerLabel}>YOUR PART  </Text>
          <Text style={styles.partBannerValue}>
            {myPart.partKey === 'lead' || myPart.partKey === 'lead_vocal' ? 'Lead Vocal'
              : myPart.partKey === 'soprano' ? 'Soprano'
              : myPart.partKey === 'mezzo' ? 'Mezzo-Soprano'
              : myPart.partKey === 'alto' ? 'Alto'
              : myPart.partKey === 'tenor' ? 'Tenor'
              : myPart.partKey === 'baritone' ? 'Baritone'
              : myPart.partKey === 'bass' ? 'Bass'
              : myPart.partKey?.startsWith('bgv') ? myPart.partKey.toUpperCase().replace('BGV', 'BGV ')
              : myPart.partKey?.startsWith('voice') ? `${myPart.partKey.replace('voice', '')}${['st','nd','rd'][Number(myPart.partKey.replace('voice',''))-1]||'th'} Voice`
              : myPart.partKey}
            {myPart.key ? `  ·  Key ${myPart.key}` : ''}
          </Text>
          {myPart.notes ? <Text style={styles.partBannerNotes} numberOfLines={2}>{myPart.notes}</Text> : null}
        </View>
      ) : null}

      {/* Live section cue indicator */}
      {activeLiveCueLabel ? (
        <View style={styles.liveCuePill}>
          <Text style={styles.liveCuePillText}>
            {'\uD83C\uDFAF'} {activeLiveCueLabel.charAt(0).toUpperCase() + activeLiveCueLabel.slice(1)}
          </Text>
        </View>
      ) : null}

      {/* Lyrics */}
      <ScrollView
        ref={scrollRef}
        style={styles.lyricsScroll}
        contentContainerStyle={styles.lyricsContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          scrollPos.current = e.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={(_, h) => { contentH.current = h; }}
        scrollEventThrottle={16}
      >
        {renderChartLines(lyrics, fontSize, isVocal)}

        {/* Charts & Sheets reference panel — guitar & bass roles only */}
        {!isVocal && (
          <ChartReferencePanel
            role={userRole}
            songKey={concertKey || song.key || ''}
            timeSig={song.timeSig || song.timeSignature || '4/4'}
            chordText={lyrics}
          />
        )}
        {/* Extra space at bottom so last lines can scroll to center */}
        <View style={{ height: SCREEN_HEIGHT * 0.5 }} />
      </ScrollView>

      {/* Song info footer */}
      {(song.tempo || song.notes) ? (
        <View style={styles.footer}>
          {song.tempo ? (
            <Text style={styles.footerItem}>♩ {song.tempo} BPM</Text>
          ) : null}
          {song.notes ? (
            <Text style={styles.footerItem} numberOfLines={2}>💬 {song.notes}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 12,
    minWidth: 70,
  },
  backBtnText: {
    fontSize: 15,
    color: '#7C3AED',
    fontWeight: '600',
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F9FAFB',
    textAlign: 'center',
  },
  topArtist: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 2,
  },
  topRight: {
    minWidth: 70,
    alignItems: 'flex-end',
  },
  keyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#7C3AED',
    borderRadius: 6,
  },
  keyBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  capoBadge: {
    backgroundColor: '#16A34A',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  capoBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  capoShapesText: {
    fontSize: 10,
    color: '#BBF7D0',
    fontWeight: '600',
    marginTop: 1,
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0F0F0F',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  rolePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#7C3AED20',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#7C3AED',
  },
  rolePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A78BFA',
  },
  controlsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sizeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1F2937',
    borderRadius: 6,
  },
  sizeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  scrollBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1F2937',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#374151',
  },
  scrollBtnActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  scrollBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  scrollBtnTextActive: {
    color: '#FFFFFF',
  },
  lyricsScroll: {
    flex: 1,
  },
  lyricsContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  lyricsText: {
    color: '#F9FAFB',
    lineHeight: 36,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  sectionLine: {
    color: '#6B7280',
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 20,
    marginBottom: 4,
  },
  chordLine: {
    color: '#FBBF24',
    fontWeight: '600',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  lyricLine: {
    color: '#F9FAFB',
    fontWeight: '400',
    letterSpacing: 0.3,
    lineHeight: 28,
  },
  partBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1E1B4B',
    borderBottomWidth: 1,
    borderBottomColor: '#4F46E5',
    flexDirection: 'column',
  },
  partBannerLabel: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  partBannerValue: { color: '#A5B4FC', fontSize: 14, fontWeight: '800', marginTop: 1 },
  partBannerNotes: { color: '#818CF8', fontSize: 11, marginTop: 4, lineHeight: 16 },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  footerItem: {
    fontSize: 12,
    color: '#6B7280',
    flexShrink: 1,
  },
  noDataState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  noDataText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  backLink: {
    fontSize: 15,
    color: '#7C3AED',
    fontWeight: '600',
  },

  // ── Transpose control bar ────────────────────────────────────────────────
  transposeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0C0C0C',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    gap: 8,
  },
  transposeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  transposeBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E5E7EB',
    lineHeight: 24,
  },
  transposeKeyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 6,
    backgroundColor: '#1E1B4B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4F46E5',
    gap: 6,
    minWidth: 72,
    justifyContent: 'center',
  },
  transposeKeyText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#C4B5FD',
    letterSpacing: 0.5,
  },
  transposeStepBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  transposeConcertKey: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    marginLeft: 4,
  },
  transposeResetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  transposeResetText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },

  // Live section cue indicator
  liveCuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: '#2E1065',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#7C3AED',
  },
  liveCuePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DDD6FE',
    letterSpacing: 0.3,
  },
});
