/**
 * Lyrics View Screen - Ultimate Playback
 * Fullscreen lyrics display for vocal team members
 * Supports manual scroll and auto-scroll toggle
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROLE_LABELS } from '../models_v2/models';

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

export default function LyricsViewScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { song, userRole, capo = 0, concertKey, myPart } = route.params || {};
  const [autoScroll, setAutoScroll] = useState(false);
  const [fontSize, setFontSize] = useState(20);
  const scrollRef = useRef(null);
  const scrollPos = useRef(0);
  const intervalRef = useRef(null);

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

  const lyrics = song.lyrics || '';
  const isInstrumentChart = !ROLE_LABELS[userRole] && !!userRole;
  const isVocal = !isInstrumentChart;
  const roleLabel = ROLE_LABELS[userRole] || userRole || 'Vocalist';
  const rolePillIcon = isInstrumentChart ? '🎼' : '🎤';

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
              {song.key ? <Text style={styles.capoShapesText}>{song.key} shapes</Text> : null}
            </View>
          ) : song.key ? (
            <View style={styles.keyBadge}>
              <Text style={styles.keyBadgeText}>{song.key}</Text>
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

      {/* Lyrics */}
      <ScrollView
        ref={scrollRef}
        style={styles.lyricsScroll}
        contentContainerStyle={styles.lyricsContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          scrollPos.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {renderChartLines(lyrics, fontSize, isVocal)}
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
});
