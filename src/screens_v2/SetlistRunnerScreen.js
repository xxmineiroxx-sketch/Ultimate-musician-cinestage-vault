/**
 * Setlist Runner - Ultimate Playback
 * Live performance view: songs advance one after the other.
 * Vocalists see lyrics + cues. Instrumentalists see chord charts + notes.
 * Multiple roles supported via tabs.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Dimensions,
  PanResponder,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROLE_LABELS } from '../models_v2/models';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SWIPE_THRESHOLD = 60;
const SCROLL_INTERVAL = 70;    // ms per tick
const AUTO_ADVANCE_DELAY = 3000; // ms after reaching song end

// ── Instrument mapping ───────────────────────────────────────────────────────

const ROLE_TO_INSTRUMENT = {
  keyboard: 'Keys',
  piano: 'Keys',
  synth: 'Synth/Pad',
  electric_guitar: 'Electric Guitar',
  rhythm_guitar: 'Electric Guitar',
  acoustic_guitar: 'Acoustic Guitar',
  bass: 'Bass',
  drums: 'Drums',
  percussion: 'Drums',
  strings: 'Keys',
  brass: 'Keys',
  worship_leader: 'Acoustic Guitar',
  music_director: 'Keys',
};

const CHART_INSTRUMENTS = ['Keys', 'Acoustic Guitar', 'Electric Guitar', 'Bass', 'Synth/Pad', 'Drums'];

const INSTRUMENT_ICON = {
  'Keys': '🎹',
  'Acoustic Guitar': '🎸',
  'Electric Guitar': '🎸',
  'Bass': '🎸',
  'Synth/Pad': '🎛',
  'Drums': '🥁',
};

// ── Role helpers ────────────────────────────────────────────────────────────

function detectRoleType(role) {
  if (!role) return 'general';
  const r = role.toLowerCase();
  if (
    r.includes('vocal') || r.includes('leader') || r.includes('worship') ||
    r.includes('director') || r.includes('singer') || r.includes('bgv') ||
    r.includes('bgv') || r.includes('lead')
  ) return 'vocal';
  if (
    r.includes('key') || r.includes('piano') || r.includes('synth') ||
    r.includes('guitar') || r.includes('bass') || r.includes('drum') ||
    r.includes('string') || r.includes('brass') || r.includes('horn') ||
    r.includes('perc') || r.includes('violin') || r.includes('cello') ||
    r.includes('viola') || r.includes('trumpet') || r.includes('trombone')
  ) return 'instrument';
  return 'general';
}

function getRoleIcon(role) {
  if (!role) return '🎵';
  const r = role.toLowerCase();
  if (r.includes('drum') || r.includes('perc')) return '🥁';
  if (r.includes('bass')) return '🎸';
  if (r.includes('guitar')) return '🎸';
  if (r.includes('key') || r.includes('piano') || r.includes('synth')) return '🎹';
  if (r.includes('string') || r.includes('violin') || r.includes('viola') || r.includes('cello')) return '🎻';
  if (r.includes('brass') || r.includes('horn') || r.includes('trumpet') || r.includes('trombone')) return '🎺';
  if (r.includes('vocal') || r.includes('leader') || r.includes('worship') || r.includes('bgv')) return '🎤';
  return '🎵';
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function SetlistRunnerScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const {
    songs = [],
    startIndex = 0,
    userRole,          // primary role (string, backward compat)
    userRoles,         // all roles (string[])
  } = route.params || {};

  // Deduplicate and prepare role list
  const allRoles = userRoles?.length
    ? [...new Set(userRoles)]
    : userRole ? [userRole] : [];

  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [activeRole, setActiveRole] = useState(allRoles[0] || null);
  const [selectedInstrument, setSelectedInstrument] = useState(
    () => ROLE_TO_INSTRUMENT[allRoles[0] || ''] || null
  );
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1); // 1-3
  const [reachedEnd, setReachedEnd] = useState(false);

  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const contentH = useRef(0);
  const viewH = useRef(0);
  const intervalRef = useRef(null);
  const autoAdvanceTimer = useRef(null);
  const nextPulse = useRef(new Animated.Value(1)).current;

  const song = songs[currentIndex] || null;
  const activeRoleType = detectRoleType(activeRole);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const goTo = useCallback((index) => {
    clearTimeout(autoAdvanceTimer.current);
    clearInterval(intervalRef.current);
    setCurrentIndex(index);
    setAutoScroll(false);
    setReachedEnd(false);
    scrollY.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const goNext = useCallback(() => {
    if (currentIndex < songs.length - 1) goTo(currentIndex + 1);
  }, [currentIndex, songs.length, goTo]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) goTo(currentIndex - 1);
  }, [currentIndex, goTo]);

  // ── Reset on song change ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(autoAdvanceTimer.current);
    };
  }, []);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (autoScroll) {
      const step = scrollSpeed;
      intervalRef.current = setInterval(() => {
        const next = scrollY.current + step;
        scrollRef.current?.scrollTo({ y: next, animated: false });
        scrollY.current = next;

        // Detect end of content
        const remaining = contentH.current - (next + viewH.current);
        if (remaining < 80 && contentH.current > 0 && !reachedEnd) {
          setReachedEnd(true);
          clearInterval(intervalRef.current);

          // Pulse Next button
          Animated.loop(
            Animated.sequence([
              Animated.timing(nextPulse, { toValue: 1.06, duration: 400, useNativeDriver: true }),
              Animated.timing(nextPulse, { toValue: 1, duration: 400, useNativeDriver: true }),
            ])
          ).start();

          // Auto-advance to next song after delay
          if (currentIndex < songs.length - 1) {
            autoAdvanceTimer.current = setTimeout(() => goNext(), AUTO_ADVANCE_DELAY);
          }
        }
      }, SCROLL_INTERVAL);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoScroll, scrollSpeed, reachedEnd]);

  // ── Swipe gesture ───────────────────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD) goNext();
        else if (g.dx > SWIPE_THRESHOLD) goPrev();
      },
    })
  ).current;

  // ── Determine content to show ───────────────────────────────────────────────

  const getContent = () => {
    if (!song) return { type: 'none', text: '' };

    if (activeRoleType === 'vocal') {
      if (song.hasLyrics && song.lyrics) return { type: 'lyrics', text: song.lyrics };
      return { type: 'no_content', label: '🎤 No lyrics available for this song.' };
    }

    if (activeRoleType === 'instrument') {
      // Use instrument-specific chart first, fall back to master chart
      const instrChart = selectedInstrument ? (song.instrumentNotes?.[selectedInstrument] || '') : '';
      const masterChart = song.chordChart || '';
      const chartText = instrChart || masterChart;

      if (chartText) {
        return {
          type: 'chord_chart',
          text: chartText,
          isInstrumentSpecific: !!instrChart,
          instrumentName: selectedInstrument,
        };
      }
      if (song.notes) return { type: 'notes', text: song.notes };
      return { type: 'no_content', label: '🎵 No chart available for this song.' };
    }

    // General
    if (song.notes) return { type: 'notes', text: song.notes };
    return { type: 'no_content', label: '🎵 No content for this song.' };
  };

  const content = song ? getContent() : { type: 'none', text: '' };
  const canAutoScroll = content.type === 'lyrics' || content.type === 'chord_chart';

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (!song) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No songs in this setlist.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backLink}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Top Bar ─────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <Text style={styles.songCounter}>{currentIndex + 1} / {songs.length}</Text>
          <View style={styles.dotsRow}>
            {songs.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => goTo(i)}>
                <View style={[styles.dot, i === currentIndex && styles.dotActive]} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Auto-scroll toggle — only when content supports it */}
        <View style={styles.topRight}>
          {canAutoScroll ? (
            <TouchableOpacity
              style={[styles.scrollToggle, autoScroll && styles.scrollToggleOn]}
              onPress={() => {
                setReachedEnd(false);
                clearTimeout(autoAdvanceTimer.current);
                nextPulse.stopAnimation();
                nextPulse.setValue(1);
                setAutoScroll((v) => !v);
              }}
            >
              <Text style={[styles.scrollToggleText, autoScroll && styles.scrollToggleTextOn]}>
                {autoScroll ? '⏸' : '▶'}
              </Text>
            </TouchableOpacity>
          ) : <View style={{ width: 36 }} />}
        </View>
      </View>

      {/* ── Song Header ─────────────────────── */}
      <View style={styles.songHeader}>
        <View style={styles.titleRow}>
          <Text style={styles.songTitle} numberOfLines={2}>{song.title}</Text>
          <View style={styles.badgesCol}>
            {song.key ? (
              <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>{song.key}</Text></View>
            ) : null}
            {song.tempo ? (
              <View style={styles.tempoBadge}><Text style={styles.tempoBadgeText}>{song.tempo}</Text></View>
            ) : null}
          </View>
        </View>
        {song.artist ? <Text style={styles.artistText}>{song.artist}</Text> : null}

        {/* Role tabs — shown when person has multiple roles */}
        {allRoles.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleTabs}>
            {allRoles.map((role) => (
              <TouchableOpacity
                key={role}
                style={[styles.roleTab, activeRole === role && styles.roleTabActive]}
                onPress={() => {
                  setActiveRole(role);
                  const mapped = ROLE_TO_INSTRUMENT[role] || null;
                  setSelectedInstrument(mapped);
                  setAutoScroll(false);
                  setReachedEnd(false);
                  scrollY.current = 0;
                  scrollRef.current?.scrollTo({ y: 0, animated: false });
                }}
              >
                <Text style={[styles.roleTabText, activeRole === role && styles.roleTabTextActive]}>
                  {getRoleIcon(role)} {role}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : allRoles.length === 1 ? (
          <View style={styles.singleRole}>
            <Text style={styles.singleRoleText}>
              {getRoleIcon(allRoles[0])} {allRoles[0]}
            </Text>
          </View>
        ) : null}

        {/* Instrument chart switcher — shown for instrument roles when song has per-instrument charts */}
        {activeRoleType === 'instrument' && song && (() => {
          const available = CHART_INSTRUMENTS.filter(instr => song.instrumentNotes?.[instr]);
          if (!available.length) return null;
          return (
            <View style={styles.instrSwitcherWrap}>
              <Text style={styles.instrSwitcherLabel}>Chart:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {available.map(instr => (
                  <TouchableOpacity
                    key={instr}
                    style={[styles.instrPill, selectedInstrument === instr && styles.instrPillActive]}
                    onPress={() => {
                      setSelectedInstrument(instr);
                      scrollY.current = 0;
                      scrollRef.current?.scrollTo({ y: 0, animated: false });
                    }}
                  >
                    <Text style={[styles.instrPillText, selectedInstrument === instr && styles.instrPillTextActive]}>
                      {INSTRUMENT_ICON[instr] || '🎵'} {instr}
                    </Text>
                  </TouchableOpacity>
                ))}
                {/* Master chart option */}
                <TouchableOpacity
                  style={[styles.instrPill, selectedInstrument === null && styles.instrPillActive]}
                  onPress={() => {
                    setSelectedInstrument(null);
                    scrollY.current = 0;
                    scrollRef.current?.scrollTo({ y: 0, animated: false });
                  }}
                >
                  <Text style={[styles.instrPillText, selectedInstrument === null && styles.instrPillTextActive]}>
                    🎼 Master
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          );
        })()}
      </View>

      {/* ── Content Area ─────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={styles.contentScroll}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={true}
        scrollIndicatorInsets={{ right: 1 }}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={(_, h) => { contentH.current = h; }}
        onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; }}
      >
        {/* Speed control strip */}
        {autoScroll && canAutoScroll ? (
          <View style={styles.speedRow}>
            <Text style={styles.speedLabel}>Speed</Text>
            {[1, 2, 3].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.speedBtn, scrollSpeed === s && styles.speedBtnActive]}
                onPress={() => setScrollSpeed(s)}
              >
                <Text style={[styles.speedBtnText, scrollSpeed === s && styles.speedBtnTextActive]}>
                  {'▶'.repeat(s)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* ── LYRICS ── */}
        {content.type === 'lyrics' ? (
          <>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate('ContentEditor', {
                song,
                serviceId: '',
                type: 'lyrics',
                existing: content.text,
                instrument: 'Vocals',
                isAdmin: false,
              })}
            >
              <Text style={styles.editBtnText}>✏️ Edit Lyrics</Text>
            </TouchableOpacity>
            <Text style={styles.lyricsText}>{content.text}</Text>
          </>
        ) : null}

        {/* ── CHORD CHART ── */}
        {content.type === 'chord_chart' ? (
          <View>
            {/* Instrument label badge */}
            {content.instrumentName ? (
              <View style={styles.instrBadgeRow}>
                <View style={styles.instrBadge}>
                  <Text style={styles.instrBadgeText}>
                    {INSTRUMENT_ICON[content.instrumentName] || '🎼'} {content.instrumentName}
                    {content.isInstrumentSpecific ? ' — Custom Part' : ' — Master Chart'}
                  </Text>
                </View>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate('ContentEditor', {
                song,
                serviceId: '',
                type: 'chord_chart',
                existing: content.text,
                instrument: content.instrumentName || selectedInstrument || '',
                isAdmin: false,
              })}
            >
              <Text style={styles.editBtnText}>✏️ Edit {content.instrumentName ? content.instrumentName + ' ' : ''}Chart</Text>
            </TouchableOpacity>
            <Text style={styles.chordChartText}>{content.text}</Text>
          </View>
        ) : null}

        {/* ── NOTES (fallback) ── */}
        {content.type === 'notes' ? (
          <View style={styles.notesCard}>
            <Text style={styles.notesLabel}>SONG NOTES</Text>
            <Text style={styles.notesText}>{content.text}</Text>
          </View>
        ) : null}

        {/* ── NO CONTENT ── */}
        {content.type === 'no_content' ? (
          <View style={styles.noContentState}>
            <Text style={styles.noContentIcon}>
              {activeRoleType === 'vocal' ? '🎤' : activeRoleType === 'instrument' ? '🎼' : '🎵'}
            </Text>
            <Text style={styles.noContentTitle}>{song.title}</Text>
            {song.key ? <Text style={styles.noContentSub}>Key of {song.key}{song.tempo ? ` • ${song.tempo} BPM` : ''}</Text> : null}
            <Text style={styles.noContentHint}>{content.label}</Text>
            <Text style={styles.noContentHintSm}>
              Add {activeRoleType === 'vocal' ? 'lyrics' : 'chord chart'} in Ultimate Musician and republish.
            </Text>
          </View>
        ) : null}

        {/* End-of-content Next Song prompt */}
        {reachedEnd && currentIndex < songs.length - 1 ? (
          <Animated.View style={[styles.nextSongPrompt, { transform: [{ scale: nextPulse }] }]}>
            <Text style={styles.nextSongPromptLabel}>UP NEXT</Text>
            <Text style={styles.nextSongPromptTitle}>{songs[currentIndex + 1]?.title}</Text>
            <TouchableOpacity style={styles.nextSongPromptBtn} onPress={goNext}>
              <Text style={styles.nextSongPromptBtnText}>Next Song →</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}

        {reachedEnd && currentIndex === songs.length - 1 ? (
          <View style={styles.endOfSetlist}>
            <Text style={styles.endOfSetlistIcon}>🏁</Text>
            <Text style={styles.endOfSetlistText}>End of Setlist</Text>
          </View>
        ) : null}

        <View style={{ height: SCREEN_H * 0.35 }} />
      </ScrollView>

      {/* ── Bottom Navigation ─────────────────── */}
      <View style={styles.bottomNav}>
        {/* Prev */}
        <TouchableOpacity
          style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
          onPress={goPrev}
          disabled={currentIndex === 0}
        >
          <Text style={[styles.navArrow, currentIndex === 0 && styles.navArrowDisabled]}>◀</Text>
          <Text style={[styles.navLabel, currentIndex === 0 && styles.navLabelDisabled]} numberOfLines={1}>
            {currentIndex > 0 ? songs[currentIndex - 1]?.title : 'Start'}
          </Text>
        </TouchableOpacity>

        {/* Center: current position */}
        <View style={styles.navCenter}>
          <Text style={styles.navNum}>{currentIndex + 1}</Text>
          <Text style={styles.navOf}>of {songs.length}</Text>
        </View>

        {/* Next */}
        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnRight, currentIndex === songs.length - 1 && styles.navBtnDisabled]}
          onPress={goNext}
          disabled={currentIndex === songs.length - 1}
        >
          <Text style={[styles.navArrow, currentIndex === songs.length - 1 && styles.navArrowDisabled]}>▶</Text>
          <Text style={[styles.navLabel, styles.navLabelRight, currentIndex === songs.length - 1 && styles.navLabelDisabled]} numberOfLines={1}>
            {currentIndex < songs.length - 1 ? songs[currentIndex + 1]?.title : 'End'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1F2937',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: '#9CA3AF', fontWeight: '700' },
  topCenter: { flex: 1, alignItems: 'center' },
  songCounter: { fontSize: 13, fontWeight: '700', color: '#E5E7EB', marginBottom: 5 },
  dotsRow: {
    flexDirection: 'row', gap: 5, flexWrap: 'wrap',
    justifyContent: 'center', maxWidth: SCREEN_W * 0.55,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#374151' },
  dotActive: { width: 16, borderRadius: 3, backgroundColor: '#8B5CF6' },
  topRight: { width: 36, alignItems: 'flex-end' },
  scrollToggle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1F2937',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#374151',
  },
  scrollToggleOn: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  scrollToggleText: { fontSize: 13, color: '#9CA3AF' },
  scrollToggleTextOn: { color: '#FFF' },

  // Song header
  songHeader: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#05101F',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  songTitle: { flex: 1, fontSize: 24, fontWeight: '800', color: '#F9FAFB', lineHeight: 30, marginRight: 10 },
  badgesCol: { alignItems: 'flex-end', gap: 4, marginTop: 2 },
  keyBadge: {
    paddingHorizontal: 9, paddingVertical: 4,
    backgroundColor: '#8B5CF6', borderRadius: 6, minWidth: 34, alignItems: 'center',
  },
  keyBadgeText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  tempoBadge: {
    paddingHorizontal: 7, paddingVertical: 3,
    backgroundColor: '#1F2937', borderRadius: 5, alignItems: 'center',
  },
  tempoBadgeText: { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },
  artistText: { fontSize: 13, color: '#9CA3AF', marginBottom: 10 },

  // Role tabs
  roleTabs: { marginTop: 6 },
  roleTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: '#0F172A', borderRadius: 20,
    borderWidth: 1, borderColor: '#374151', marginRight: 8,
  },
  roleTabActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  roleTabText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  roleTabTextActive: { color: '#FFF' },
  singleRole: {
    alignSelf: 'flex-start', marginTop: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: '#0F172A', borderRadius: 12,
    borderWidth: 1, borderColor: '#374151',
  },
  singleRoleText: { fontSize: 12, fontWeight: '600', color: '#818CF8' },

  // Content scroll
  contentScroll: { flex: 1 },
  contentInner: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },

  // Speed
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  speedLabel: { fontSize: 11, color: '#6B7280', fontWeight: '700', textTransform: 'uppercase' },
  speedBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#1F2937', borderRadius: 6 },
  speedBtnActive: { backgroundColor: '#7C3AED' },
  speedBtnText: { fontSize: 11, color: '#9CA3AF', fontWeight: '700' },
  speedBtnTextActive: { color: '#FFF' },

  // Instrument switcher (in song header)
  instrSwitcherWrap: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  instrSwitcherLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  instrPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    marginRight: 6,
  },
  instrPillActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  instrPillText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  instrPillTextActive: { color: '#FFF' },

  // Instrument badge in content area
  instrBadgeRow: { marginBottom: 10 },
  instrBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#1E1B4B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  instrBadgeText: { fontSize: 12, fontWeight: '700', color: '#818CF8' },

  // Edit button
  editBtn: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#0F172A', borderRadius: 8, borderWidth: 1, borderColor: '#374151', marginBottom: 12 },
  editBtnText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },

  // Lyrics
  lyricsText: { fontSize: 20, color: '#F3F4F6', lineHeight: 38, fontWeight: '400', letterSpacing: 0.2 },

  // Chord chart
  chordChartText: {
    fontSize: 15, color: '#E5E7EB', lineHeight: 26,
    fontFamily: 'Courier', letterSpacing: 0.3,
  },
  instrNotesCard: {
    padding: 12, backgroundColor: '#0B1120',
    borderRadius: 8, borderWidth: 1, borderColor: '#374151', marginBottom: 16,
  },
  instrNotesLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 1, marginBottom: 6 },
  instrNotesText: { fontSize: 14, color: '#E5E7EB', lineHeight: 22 },

  // Notes
  notesCard: {
    padding: 16, backgroundColor: '#0B1120',
    borderRadius: 10, borderWidth: 1, borderColor: '#374151',
  },
  notesLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  notesText: { fontSize: 15, color: '#E5E7EB', lineHeight: 24 },

  // No content
  noContentState: { alignItems: 'center', paddingVertical: 48 },
  noContentIcon: { fontSize: 56, marginBottom: 16 },
  noContentTitle: { fontSize: 22, fontWeight: '800', color: '#F9FAFB', marginBottom: 6, textAlign: 'center' },
  noContentSub: { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  noContentHint: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginBottom: 8 },
  noContentHintSm: { fontSize: 12, color: '#4B5563', textAlign: 'center', lineHeight: 18 },

  // End-of-song next prompt
  nextSongPrompt: {
    marginTop: 32,
    padding: 20,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#8B5CF6',
    alignItems: 'center',
  },
  nextSongPromptLabel: { fontSize: 10, fontWeight: '700', color: '#8B5CF6', letterSpacing: 1.5, marginBottom: 6 },
  nextSongPromptTitle: { fontSize: 18, fontWeight: '700', color: '#F9FAFB', marginBottom: 14, textAlign: 'center' },
  nextSongPromptBtn: {
    paddingHorizontal: 28, paddingVertical: 12,
    backgroundColor: '#8B5CF6', borderRadius: 10,
  },
  nextSongPromptBtnText: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  endOfSetlist: { alignItems: 'center', paddingVertical: 40 },
  endOfSetlistIcon: { fontSize: 48, marginBottom: 12 },
  endOfSetlistText: { fontSize: 18, fontWeight: '700', color: '#6B7280' },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 10,
    backgroundColor: '#0A0A0A', borderTopWidth: 1, borderTopColor: '#1F2937',
  },
  navBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 10,
    backgroundColor: '#0F172A', borderRadius: 10,
    borderWidth: 1, borderColor: '#374151', minHeight: 54,
    justifyContent: 'center',
  },
  navBtnRight: { alignItems: 'flex-end' },
  navBtnDisabled: { borderColor: '#1A2030', backgroundColor: '#050A12' },
  navArrow: { fontSize: 16, fontWeight: '700', color: '#8B5CF6' },
  navArrowDisabled: { color: '#2D3748' },
  navLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 2, maxWidth: 110 },
  navLabelRight: { textAlign: 'right' },
  navLabelDisabled: { color: '#374151' },
  navCenter: { width: 60, alignItems: 'center' },
  navNum: { fontSize: 26, fontWeight: '800', color: '#F9FAFB', lineHeight: 30 },
  navOf: { fontSize: 10, color: '#6B7280' },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText: { fontSize: 16, color: '#9CA3AF' },
  backLink: { fontSize: 15, color: '#7C3AED', fontWeight: '600' },
});
