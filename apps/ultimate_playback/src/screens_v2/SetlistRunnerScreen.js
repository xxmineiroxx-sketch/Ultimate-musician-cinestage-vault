/**
 * Setlist Runner - Ultimate Playback
 * Rehearsal view: vocalists see lyrics, instrumentalists see chord charts.
 * Simple transport controls for live/rehearsal use.
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROLE_LABELS } from '../models_v2/models';
import { SYNC_URL, CINESTAGE_URL, SYNC_ORG_ID, SYNC_SECRET_KEY, syncHeaders } from '../../config/syncConfig';
import { sendPlaybackState, onWatchCommand, IS_WATCH_SUPPORTED } from '../services/watchBridge';
import { getSongLookupId } from '../utils/songMedia';
import { normalizeRoleKey } from '../utils/roleUtils';
import {
  startHapticClock,
  stopHapticClock,
  HAPTIC_MODES,
} from '../services/hapticClickTrack';
import {
  startEnergyDetection,
  stopEnergyDetection,
} from '../services/congregationEnergy';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SWIPE_THRESHOLD   = 60;
const SCROLL_INTERVAL   = 70;     // ms per tick
const AUTO_ADVANCE_DELAY = 3000;  // ms after reaching song end

// ── Instrument mapping ────────────────────────────────────────────────────────

// Synth/Pad shares the same chord chart slot as Keys
const CHART_SLOT = { 'Synth/Pad': 'Keys' };
function chartKey(instr) { return CHART_SLOT[instr] || instr; }

const ROLE_TO_INSTRUMENT = {
  keyboard:        'Keys',
  piano:           'Keys',
  synth:           'Synth/Pad',
  electric_guitar: 'Electric Guitar',
  rhythm_guitar:   'Electric Guitar',
  acoustic_guitar: 'Acoustic Guitar',
  bass:            'Bass',
  drums:           'Drums',
  percussion:      'Drums',
  strings:         'Keys',
  brass:           'Keys',
  worship_leader:  'Acoustic Guitar',
  music_director:  'Keys',
};

const CHART_INSTRUMENTS = ['Keys', 'Acoustic Guitar', 'Electric Guitar', 'Bass', 'Synth/Pad', 'Drums'];

const SOUND_TECH_ROLES = new Set(['sound_tech', 'foh_engineer', 'monitor_engineer', 'stream_engineer']);
const MEDIA_ROLES = new Set(['media', 'media_tech', 'slides', 'slide_operator', 'projection', 'screen_operator', 'visual', 'graphics']);
const LEADER_ROLES = new Set(['worship_leader', 'music_director', 'md', 'admin', 'leader']);

const DRUM_PATTERNS = [
  { label: 'Driving',   text: 'Driving — K on 1&3, S on 2&4, HH 8ths' },
  { label: 'Half-time', text: 'Half-time — K on 1, S on 3, slow HH' },
  { label: 'Ballad',    text: 'Ballad — light brush/rim, sparse kick' },
  { label: 'Build',     text: '▲ Build — open HH → ride bell, crescendo' },
  { label: 'Rim click', text: 'Rim click only — no full snare' },
  { label: 'Wash',      text: 'Cymbal wash — swell into section' },
  { label: '🔇 Tacet',  text: '(tacet — rest this section)' },
];

const PART_LABELS = {
  lead: 'Lead', lead_vocal: 'Lead',
  bgv1: 'BGV 1', bgv_1: 'BGV 1',
  bgv2: 'BGV 2', bgv_2: 'BGV 2',
  bgv3: 'BGV 3', bgv_3: 'BGV 3',
  bgv: 'BGV', harmony: 'Harmony',
  soprano: 'Soprano', mezzo: 'Mezzo-Soprano',
  alto: 'Alto', tenor: 'Tenor',
  baritone: 'Baritone', bass: 'Bass',
  voice1: '1st Voice', voice2: '2nd Voice', voice3: '3rd Voice',
  voice4: '4th Voice', voice5: '5th Voice',
};

function getMyPartForSong(songId, va, profile) {
  if (!va || !songId || !profile) return null;
  const parts = va[songId];
  if (!parts) return null;
  const pid = profile.id || '';
  const fullName = [profile.name, profile.lastName].filter(Boolean).join(' ').trim().toLowerCase();
  for (const [partKey, data] of Object.entries(parts)) {
    if (!data) continue;
    if (pid && data.personId === pid) return { partKey, ...data };
    if (fullName && data.name && data.name.trim().toLowerCase() === fullName) return { partKey, ...data };
  }
  return null;
}

function getSongVocalLineup(songId, va) {
  if (!va || !songId) return [];
  const parts = va[songId] || {};
  const order = [
    'lead_vocal', 'lead', 'voice1', 'soprano',
    'voice2', 'alto', 'bgv_1', 'bgv1',
    'voice3', 'tenor', 'bgv_2', 'bgv2',
    'voice4', 'baritone', 'bgv_3', 'bgv3',
    'voice5', 'bass',
  ];
  const sortRank = new Map(order.map((key, index) => [key, index]));

  return Object.entries(parts)
    .map(([partKey, data]) => {
      if (!data?.name) return null;
      return { partKey, ...data };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftRank = sortRank.get(left.partKey) ?? 999;
      const rightRank = sortRank.get(right.partKey) ?? 999;
      return leftRank - rightRank;
    });
}

const INSTRUMENT_ICON = {
  'Keys':            '🎹',
  'Acoustic Guitar': '🎸',
  'Electric Guitar': '🎸',
  'Bass':            '🎸',
  'Synth/Pad':       '🎛',
  'Drums':           '🥁',
};

// ── Role helpers ──────────────────────────────────────────────────────────────

function detectRoleType(role) {
  const r = normalizeRoleKey(role);
  if (!r) return 'general';
  if (SOUND_TECH_ROLES.has(r)) return 'sound_tech';
  if (MEDIA_ROLES.has(r) || r.includes('media') || r.includes('slide') || r.includes('projection') || r.includes('visual') || r.includes('screen') || r.includes('graphic')) return 'media';
  if (
    r.includes('vocal') || r.includes('leader') || r.includes('worship') ||
    r.includes('director') || r.includes('singer') || r.includes('bgv') ||
    r.includes('lead')
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
  const r = normalizeRoleKey(role);
  if (!r) return '🎵';
  if (SOUND_TECH_ROLES.has(r)) return '🎚';
  if (r.includes('drum') || r.includes('perc')) return '🥁';
  if (r.includes('bass')) return '🎸';
  if (r.includes('guitar')) return '🎸';
  if (r.includes('key') || r.includes('piano') || r.includes('synth')) return '🎹';
  if (r.includes('string') || r.includes('violin') || r.includes('viola') || r.includes('cello')) return '🎻';
  if (r.includes('brass') || r.includes('horn') || r.includes('trumpet') || r.includes('trombone')) return '🎺';
  if (r.includes('vocal') || r.includes('leader') || r.includes('worship') || r.includes('bgv')) return '🎤';
  return '🎵';
}

function getRoleLabel(role) {
  const normalized = normalizeRoleKey(role);
  return ROLE_LABELS[role] || ROLE_LABELS[normalized] || role;
}

// ── Section detection (for MIDI section-jump) ─────────────────────────────────
// Matches common section headers in lyrics / chord charts
const SECTION_RE = /^(verse|chorus|bridge|pre.?chorus|intro|outro|tag|vamp|refrain|hook|interlude|breakdown|turn|ending)\b/i;

function parseSections(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const sections = [];
  let charOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (SECTION_RE.test(trimmed)) {
      sections.push({ name: trimmed, charOffset, lineIndex: i });
    }
    charOffset += lines[i].length + 1; // +1 for \n
  }
  return sections;
}

// ── Compute active section label from scroll position ────────────────────────
// Uses line-index proportion (not char offset) — all lines have equal pixel
// height in a Text block, so this is far more accurate than char counting.
function getActiveSectionFromScroll(text, scrollTop, totalContentH) {
  if (!text || totalContentH <= 0) return null;
  const sections = parseSections(text);
  if (!sections.length) return null;
  const totalLines = text.split('\n').length || 1;
  let active = sections[0].name;
  for (let i = 0; i < sections.length; i++) {
    const sectionY = (sections[i].lineIndex / totalLines) * totalContentH;
    if (scrollTop + 60 >= sectionY) {
      active = sections[i].name;
    } else {
      break;
    }
  }
  return active;
}

// ── Chord transposition & capo engine ────────────────────────────────────────
const NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_KEY_SET = new Set(['F','Bb','Eb','Ab','Db','Gb']);
function noteIdx(n) {
  const s = NOTES_SHARP.indexOf(n); return s >= 0 ? s : NOTES_FLAT.indexOf(n);
}
function idxToNote(i, flats) {
  const n = ((i % 12) + 12) % 12; return flats ? NOTES_FLAT[n] : NOTES_SHARP[n];
}
function useFlatsForKey(key) { return FLAT_KEY_SET.has((key || '').replace(/m$/, '').trim()); }
const CHORD_IN_LINE_RE = /[A-G][#b]?(m|M|maj|min|dim|aug|sus[24]?|add|dom)?[0-9]?(\/[A-G][#b]?)?/g;
const CHORD_TOKEN_RE = /^[A-G][#b]?(m|M|maj|min|dim|aug|sus[24]?|add|dom)?[0-9]?(\/[A-G][#b]?)?$/;
function isChordLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (t.split('|').length > 2) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  const n = tokens.filter(tok => CHORD_TOKEN_RE.test(tok)).length;
  return n > 0 && n / tokens.length > 0.5;
}
function transposeToken(chord, semitones, flats) {
  if (semitones === 0) return chord;
  const m = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return chord;
  const [, root, rest] = m;
  const slashM = rest.match(/^(.*?)\/([A-G][#b]?)$/);
  if (slashM) {
    const [, mod, bass] = slashM;
    return idxToNote(noteIdx(root) + semitones, flats) + mod + '/' +
           idxToNote(noteIdx(bass) + semitones, flats);
  }
  return idxToNote(noteIdx(root) + semitones, flats) + rest;
}
function transposeChart(chart, semitones, targetKey) {
  if (!chart || semitones === 0) return chart;
  const flats = useFlatsForKey(targetKey);
  return chart.split('\n').map(line =>
    isChordLine(line) ? line.replace(CHORD_IN_LINE_RE, tok => transposeToken(tok, semitones, flats)) : line
  ).join('\n');
}
function capoShapesKey(concertKey, capoFret) {
  if (!concertKey || capoFret === 0) return concertKey || '';
  const idx = noteIdx(concertKey.trim());
  if (idx < 0) return concertKey;
  return NOTES_SHARP[((idx - capoFret) % 12 + 12) % 12];
}
const GUITAR_INSTRUMENTS = new Set(['Acoustic Guitar', 'Electric Guitar']);
const GUITAR_CAPO_OPTIONS = [0, 1, 2, 3, 4, 5, 7];

// ── Convert http:// SYNC_URL to ws:// for WebSocket ──────────────────────────
const WS_MIDI_URL = SYNC_URL.replace(/^http/, 'ws') + '/midi/ws';

// ── Main Component ────────────────────────────────────────────────────────────

export default function SetlistRunnerScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const {
    songs = [],
    startIndex = 0,
    serviceId = null,
    userRole,
    userRoles,
    vocalAssignments = {},
    userProfile = null,
  } = route.params || {};

  // Deduplicate and prepare role list
  const allRoles = userRoles?.length
    ? [...new Set(userRoles)]
    : userRole ? [userRole] : [];

  const [currentIndex, setCurrentIndex]     = useState(startIndex);
  const [activeRole, setActiveRole]         = useState(allRoles[0] || null);
  const [selectedInstrument, setSelectedInstrument] = useState(
    () => ROLE_TO_INSTRUMENT[normalizeRoleKey(allRoles[0] || '')] || null
  );
  const [autoScroll, setAutoScroll]   = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1);
  const [reachedEnd, setReachedEnd]   = useState(false);
  const [transitionMode, setTransitionMode] = useState('cut'); // 'cut' | 'crossfade'
  const [activeSectionLabel, setActiveSectionLabel] = useState(null);
  const [guitarCapo, setGuitarCapo] = useState({}); // songId → capo fret
  const transitionModeRef = useRef('cut');

  // ── Practice tracking ─────────────────────────────────────────────────────
  const [readySongs, setReadySongs] = useState(new Set());
  const readySongsRef   = useRef(new Set());
  const songStartTime   = useRef(Date.now());
  const prevSongIdxRef  = useRef(startIndex);

  // ── Beat countdown state ──────────────────────────────────────────────────
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownBeat, setCountdownBeat]     = useState(4);
  const pendingNextIndex  = useRef(null);
  const countdownInterval = useRef(null);
  const countdownScale    = useRef(new Animated.Value(1)).current;

  // ── Haptic click track ───────────────────────────────────────────────────
  const [hapticMode, setHapticMode] = useState(HAPTIC_MODES.OFF);
  const hapticClockRef = useRef(null);

  // ── Congregation energy (leader only) ────────────────────────────────────
  const [energyLevel, setEnergyLevel] = useState(null);
  const [energyTrend, setEnergyTrend] = useState(null);
  const [energySuggestion, setEnergySuggestion] = useState(null);
  const energyStopRef = useRef(null);

  // ── MIDI controller state ─────────────────────────────────────────────────
  const [midiConnected, setMidiConnected] = useState(false);
  const [midiDevice,    setMidiDevice]    = useState(''); // 'APC' | 'NANO' | ''
  const loopSectionRef  = useRef(null); // { sectionIdx } or null — active loop section
  const lastMidiPress   = useRef({ key: '', time: 0 });
  const midiWsRef       = useRef(null);

  // ── Live Performance Sync ──────────────────────────────────────────────────
  const [isLiveSession, setIsLiveSession] = useState(false);
  const perfWsRef = useRef(null);

  // ── "We're Live" — Go Live broadcast ──────────────────────────────────────
  const [goLiveToast, setGoLiveToast] = useState(false);
  const goLiveToastTimer = useRef(null);

  const handleGoLive = useCallback(async () => {
    const currentSong = songs[currentIndexRef.current];
    const title = currentSong?.title || 'Service';
    try {
      await fetch(`${SYNC_URL}/sync/live-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLive: true, title }),
      });
      setGoLiveToast(true);
      clearTimeout(goLiveToastTimer.current);
      goLiveToastTimer.current = setTimeout(() => setGoLiveToast(false), 3000);
    } catch (_) {
      setGoLiveToast(true);
      clearTimeout(goLiveToastTimer.current);
      goLiveToastTimer.current = setTimeout(() => setGoLiveToast(false), 3000);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollRef     = useRef(null);
  const scrollY       = useRef(0);
  const contentH      = useRef(0);
  const viewH         = useRef(0);
  const intervalRef   = useRef(null);
  const lastManualScrollRef = useRef(0); // timestamp of last manual scroll
  const autoAdvanceTimer = useRef(null);
  const nextPulse      = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const currentIndexRef = useRef(startIndex);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { transitionModeRef.current = transitionMode; }, [transitionMode]);

  const song           = songs[currentIndex] || null;
  const activeRoleType = detectRoleType(activeRole);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const goTo = useCallback((index) => {
    clearTimeout(autoAdvanceTimer.current);
    clearInterval(intervalRef.current);
    setAutoScroll(false);
    setReachedEnd(false);
    setActiveSectionLabel(null);
    if (transitionModeRef.current === 'crossfade') {
      Animated.timing(contentOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setCurrentIndex(index);
        scrollY.current = 0;
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        Animated.timing(contentOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    } else {
      setCurrentIndex(index);
      scrollY.current = 0;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [contentOpacity]);

  // ── Haptic clock — BPM-derived beats, starts/stops with autoScroll ───────
  useEffect(() => {
    if (hapticMode === HAPTIC_MODES.OFF || !song) {
      if (hapticClockRef.current) { hapticClockRef.current.stop(); hapticClockRef.current = null; }
      return;
    }
    const bpm = song?.bpm || song?.tempo || 0;
    if (!bpm) return;
    const durationSec = song?.duration || 300;
    const beatIntervalMs = 60000 / bpm;
    const beats_ms = Array.from(
      { length: Math.floor((durationSec * 1000) / beatIntervalMs) },
      (_, i) => Math.round(i * beatIntervalMs),
    );
    if (autoScroll) {
      hapticClockRef.current = startHapticClock({ beats_ms, bpm, mode: hapticMode });
    } else if (hapticClockRef.current) {
      hapticClockRef.current.stop();
      hapticClockRef.current = null;
    }
    return () => { if (hapticClockRef.current) { hapticClockRef.current.stop(); hapticClockRef.current = null; } };
  }, [autoScroll, hapticMode, song?.id, song?.bpm]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Congregation energy — leader role only, runs while playing ────────────
  useEffect(() => {
    if (!isLeaderRole || !autoScroll) {
      if (energyStopRef.current) { energyStopRef.current(); energyStopRef.current = null; setEnergyLevel(null); setEnergyTrend(null); }
      return;
    }
    let alive = true;
    startEnergyDetection({
      sensitivity: 'medium',
      onEnergyUpdate: ({ level, trend }) => { if (!alive) return; setEnergyLevel(level); setEnergyTrend(trend); },
      onSuggestion: (s) => {
        if (!alive) return;
        setEnergySuggestion(s);
        setTimeout(() => setEnergySuggestion(null), 8000);
      },
    }).then((handle) => {
      if (!alive) { handle?.stop(); return; }
      energyStopRef.current = handle?.stop;
    }).catch(() => {});
    return () => {
      alive = false;
      if (energyStopRef.current) { energyStopRef.current(); energyStopRef.current = null; }
    };
  }, [isLeaderRole, autoScroll]);

  // ── Countdown helpers ────────────────────────────────────────────────────

  const cancelCountdown = useCallback(() => {
    clearInterval(countdownInterval.current);
    countdownInterval.current = null;
    pendingNextIndex.current = null;
    setCountdownActive(false);
    setCountdownBeat(4);
    countdownScale.setValue(1);
  }, [countdownScale]);

  const startCountdown = useCallback((targetIndex) => {
    const targetSong = songs[targetIndex];
    const bpm = targetSong?.bpm || targetSong?.tempo;
    // Skip countdown when bpm is missing or zero
    if (!bpm) { goTo(targetIndex); return; }

    pendingNextIndex.current = targetIndex;
    const beatMs = Math.round(60000 / bpm);
    let beat = 4;
    setCountdownBeat(beat);
    setCountdownActive(true);

    // Initial pulse
    countdownScale.setValue(1);
    Animated.spring(countdownScale, { toValue: 1.15, useNativeDriver: true, speed: 40, bounciness: 6 }).start(() => {
      Animated.spring(countdownScale, { toValue: 1.0, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
    });

    countdownInterval.current = setInterval(() => {
      beat -= 1;
      if (beat <= 0) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
        setCountdownActive(false);
        setCountdownBeat(4);
        countdownScale.setValue(1);
        const idx = pendingNextIndex.current;
        pendingNextIndex.current = null;
        goTo(idx);
      } else {
        setCountdownBeat(beat);
        // Pulse animation on each beat
        countdownScale.setValue(1);
        Animated.spring(countdownScale, { toValue: 1.15, useNativeDriver: true, speed: 40, bounciness: 6 }).start(() => {
          Animated.spring(countdownScale, { toValue: 1.0, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
        });
      }
    }, beatMs);
  }, [songs, goTo, countdownScale]); // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = useCallback(() => {
    if (currentIndex >= songs.length - 1) return;
    const nextIdx = currentIndex + 1;
    if (countdownActive) {
      // Second press while counting down → skip immediately
      cancelCountdown();
      goTo(nextIdx);
      return;
    }
    startCountdown(nextIdx);
  }, [currentIndex, songs.length, goTo, countdownActive, cancelCountdown, startCountdown]);

  const goPrev = useCallback(() => {
    if (countdownActive) cancelCountdown();
    if (currentIndex > 0) goTo(currentIndex - 1);
  }, [currentIndex, goTo, countdownActive, cancelCountdown]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(countdownInterval.current);
      clearTimeout(autoAdvanceTimer.current);
      clearTimeout(goLiveToastTimer.current);
      midiWsRef.current?.close();
    };
  }, []);

  // ── Load persisted ready-songs on mount ────────────────────────────────────
  useEffect(() => {
    if (!serviceId) return;
    AsyncStorage.getItem(`practice_ready/${serviceId}`)
      .then(raw => {
        if (!raw) return;
        const arr = JSON.parse(raw);
        const s = new Set(arr);
        setReadySongs(s);
        readySongsRef.current = s;
      })
      .catch(() => {});
  }, [serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Report practice time when moving between songs ─────────────────────────
  useEffect(() => {
    const prevIdx = prevSongIdxRef.current;
    if (prevIdx === currentIndex) return;

    const prevSong   = songs[prevIdx];
    const durationSec = Math.round((Date.now() - songStartTime.current) / 1000);

    if (durationSec > 5 && prevSong && serviceId && userProfile) {
      const songId = getSongLookupId(prevSong) || prevSong.id || `song_${prevIdx}`;
      fetch(`${SYNC_URL}/sync/practice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          personId:   userProfile.id || userProfile.email || '',
          personName: [userProfile.name, userProfile.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
          personRole: activeRole || '',
          songId,
          songTitle:  prevSong.title || `Song ${prevIdx + 1}`,
          durationSec,
          markedReady: readySongsRef.current.has(prevIdx),
        }),
      }).catch(() => {});
    }

    prevSongIdxRef.current = currentIndex;
    songStartTime.current  = Date.now();
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apple Watch sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!IS_WATCH_SUPPORTED) return;
    const s = songs[currentIndex];
    if (!s) return;
    // Derive current section label from scroll position
    const text = s.lyrics || s.chordChart || '';
    const secs = parseSections(text);
    const sectionLabel = secs.length ? secs[0].name : '';
    sendPlaybackState({
      isPlaying:    autoScroll,
      songTitle:    s.title || s.name || '',
      artist:       s.artist || '',
      songIndex:    currentIndex,
      totalSongs:   songs.length,
      sectionLabel,
      bpm:          s.bpm ?? null,
      key:          s.key || null,
    });
  }, [autoScroll, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle commands arriving FROM the Apple Watch (PLAY/PAUSE/NEXT/PREV)
  useEffect(() => {
    const unsub = onWatchCommand((msg) => {
      const cmd = (msg?.cmd || '').toUpperCase();
      if (cmd === 'PLAY')  setAutoScroll(true);
      if (cmd === 'PAUSE') setAutoScroll(false);
      if (cmd === 'NEXT')  goNext();
      if (cmd === 'PREV')  goPrev();
    });
    return unsub;
  }, [goNext, goPrev]);

  // ── Scroll to a section (0-indexed) in the current song ─────────────────────
  // Uses refs only → stable callback, no stale closure issues
  const scrollToSection = useCallback((sectionIdx) => {
    const curSong = songs[currentIndexRef.current];
    if (!curSong) return;
    const text    = curSong.lyrics || curSong.chordChart || '';
    const secs    = parseSections(text);
    if (!secs.length || sectionIdx >= secs.length) return;
    const sec      = secs[sectionIdx];
    const totalLen = text.length || 1;
    const targetY  = (sec.charOffset / totalLen) * contentH.current;
    scrollY.current = Math.max(0, targetY - 40);
    scrollRef.current?.scrollTo({ y: scrollY.current, animated: true });
  }, []); // stable — only refs + route-level songs

  // ── Performance sync — scroll to a section by label ───────────────────────
  function scrollToSectionByLabel(label) {
    if (!label) return;
    const curSong = songs[currentIndexRef.current];
    if (!curSong) return;
    const text = curSong.lyrics || curSong.chordChart || '';
    const secs = parseSections(text);
    const idx = secs.findIndex(s => s.name.toLowerCase().startsWith(label.toLowerCase()));
    if (idx >= 0) scrollToSection(idx);
  }

  // ── Live section cue — push to all musicians in real-time ────────────────
  const sendLiveSectionCue = async (sectionLabel, songId) => {
    try {
      await fetch(`${SYNC_URL}/sync/live-cue`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({
          type: 'SECTION_CUE',
          sectionLabel,
          songId: songId || (songs[currentIndexRef.current]
            ? (getSongLookupId(songs[currentIndexRef.current]) || songs[currentIndexRef.current].id)
            : ''),
          timestamp: Date.now(),
        }),
      });
    } catch (e) { /* fire and forget */ }
  };

  // ── Performance sync — handle PERF events from UM ─────────────────────────
  const handlePerfEvent = useCallback((event) => {
    const { type, song: songData, sectionLabel } = event;
    switch (type) {
      case 'PERF_START': {
        setIsLiveSession(true);
        if (songData?.title) {
          const idx = songs.findIndex(s =>
            s.id === songData.id ||
            (s.title && songData.title && s.title.toLowerCase() === songData.title.toLowerCase())
          );
          if (idx >= 0) goTo(idx);
        }
        break;
      }
      case 'PERF_SONG': {
        if (songData?.title) {
          const idx = songs.findIndex(s =>
            s.id === songData.id ||
            (s.title && songData.title && s.title.toLowerCase() === songData.title.toLowerCase())
          );
          if (idx >= 0) goTo(idx);
        }
        break;
      }
      case 'PERF_SECTION':
        scrollToSectionByLabel(sectionLabel);
        break;
      case 'PERF_PLAY':
        setAutoScroll(true);
        break;
      case 'PERF_PAUSE':
        setAutoScroll(false);
        break;
      case 'PERF_STOP':
        setIsLiveSession(false);
        setAutoScroll(false);
        break;
      default:
        break;
    }
  }, [goTo, scrollToSection, songs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Performance sync — CineStage WebSocket (cloud path) ───────────────────
  useEffect(() => {
    const wsBase = CINESTAGE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/ws/sync?orgId=${SYNC_ORG_ID}&secretKey=${SYNC_SECRET_KEY}`);
    perfWsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const inner = msg.type === 'broadcast' ? msg.data : msg;
        if (inner.type && inner.type.startsWith('PERF_')) handlePerfEvent(inner);
      } catch {}
    };
    ws.onerror = () => {};
    ws.onclose = () => { perfWsRef.current = null; };
    return () => { ws.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── MIDI WebSocket — connect to sync server bridge ──────────────────────────
  useEffect(() => {
    let ws;
    let reconnectTimer;

    const connect = () => {
      try {
        ws = new WebSocket(WS_MIDI_URL);
        midiWsRef.current = ws;

        ws.onopen = () => setMidiConnected(true);
        ws.onclose = () => {
          setMidiConnected(false);
          // Auto-reconnect every 5s
          reconnectTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => { ws.close(); };

        ws.onmessage = (e) => {
          try {
            const cmd = JSON.parse(e.data);
            handleMidiCommand(cmd);
          } catch {}
        };
      } catch {}
    };

    connect();
    return () => { clearTimeout(reconnectTimer); ws?.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── MIDI command handler ─────────────────────────────────────────────────────
  // No reference to derived 'content' or 'canAutoScroll' — uses setters + refs
  const handleMidiCommand = useCallback((cmd) => {
    switch (cmd.type) {
      case 'MIDI_NEXT':
        goNext();
        break;
      case 'MIDI_PREV':
        goPrev();
        break;
      case 'MIDI_PLAY':
      case 'MIDI_CYCLE':
        setReachedEnd(false);
        clearTimeout(autoAdvanceTimer.current);
        nextPulse.stopAnimation();
        nextPulse.setValue(1);
        setAutoScroll(v => !v);
        break;
      case 'MIDI_STOP':
        setAutoScroll(false);
        setReachedEnd(false);
        clearTimeout(autoAdvanceTimer.current);
        break;
      case 'MIDI_GOTO_SONG':
        if (typeof cmd.index === 'number' && cmd.index >= 0 && cmd.index < songs.length) {
          goTo(cmd.index);
        }
        break;
      case 'MIDI_SECTION':
        scrollToSection(cmd.sectionIdx || 0);
        break;
      case 'MIDI_LOOP_SECTION':
        loopSectionRef.current = cmd.active ? { sectionIdx: cmd.sectionIdx } : null;
        break;
      case 'MIDI_SPEED_UP':
        setScrollSpeed(s => Math.min(3, s + 1));
        break;
      case 'MIDI_SPEED_DOWN':
        setScrollSpeed(s => Math.max(1, s - 1));
        break;
      case 'PERF_START':
      case 'PERF_SONG':
      case 'PERF_SECTION':
      case 'PERF_PLAY':
      case 'PERF_PAUSE':
      case 'PERF_STOP':
        handlePerfEvent(cmd);
        break;
      default:
        break;
    }
  }, [goNext, goPrev, goTo, scrollToSection, handlePerfEvent, songs.length]);

  // ── Broadcast song position → desktop updates APC Mini grid LEDs ─────────────
  useEffect(() => {
    if (!midiConnected) return;
    fetch(`${SYNC_URL}/midi/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type:          'MIDI_SONG_POSITION',
        currentIndex:  currentIndex,
        songCount:     songs.length,
        sectionCounts: songs.map(s => parseSections(s.lyrics || s.chordChart || '').length),
      }),
    }).catch(() => {});
  }, [currentIndex, midiConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ─────────────────────────────────────────────────────────────

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (autoScroll) {
      const step = scrollSpeed;
      intervalRef.current = setInterval(() => {
        const next = scrollY.current + step;
        scrollRef.current?.scrollTo({ y: next, animated: false });
        scrollY.current = next;

        // Update active section label during auto-scroll
        const curSong = songs[currentIndexRef.current];
        if (curSong) {
          const text = curSong.lyrics || curSong.chordChart || '';
          const label = getActiveSectionFromScroll(text, next, contentH.current);
          setActiveSectionLabel(prev => (prev !== label ? label : prev));
        }

        const remaining = contentH.current - (next + viewH.current);
        if (remaining < 80 && contentH.current > 0 && !reachedEnd) {
          setReachedEnd(true);
          clearInterval(intervalRef.current);

          // Pulse Next button
          Animated.loop(
            Animated.sequence([
              Animated.timing(nextPulse, { toValue: 1.06, duration: 400, useNativeDriver: true }),
              Animated.timing(nextPulse, { toValue: 1,    duration: 400, useNativeDriver: true }),
            ])
          ).start();

          // Auto-advance — keep autoScroll=true for continuous playback
          if (currentIndexRef.current < songs.length - 1) {
            autoAdvanceTimer.current = setTimeout(() => {
              nextPulse.stopAnimation();
              nextPulse.setValue(1);
              const doAdvance = () => {
                setCurrentIndex(prev => prev + 1);
                setReachedEnd(false);
                scrollY.current = 0;
                scrollRef.current?.scrollTo({ y: 0, animated: false });
              };
              if (transitionModeRef.current === 'crossfade') {
                Animated.timing(contentOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
                  doAdvance();
                  Animated.timing(contentOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
                });
              } else {
                doAdvance();
              }
            }, AUTO_ADVANCE_DELAY);
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

  // ── Mark current song as practiced ─────────────────────────────────────────
  const handleSongReady = useCallback(() => {
    const durationSec = Math.round((Date.now() - songStartTime.current) / 1000);

    setReadySongs(prev => {
      const next = new Set(prev);
      next.add(currentIndex);
      readySongsRef.current = next;
      if (serviceId) {
        AsyncStorage.setItem(`practice_ready/${serviceId}`, JSON.stringify([...next])).catch(() => {});
      }
      return next;
    });

    const curSong = songs[currentIndex];
    if (serviceId && userProfile && curSong) {
      const songId = getSongLookupId(curSong) || curSong.id || `song_${currentIndex}`;
      fetch(`${SYNC_URL}/sync/practice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          personId:   userProfile.id || userProfile.email || '',
          personName: [userProfile.name, userProfile.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
          personRole: activeRole || '',
          songId,
          songTitle:  curSong.title || `Song ${currentIndex + 1}`,
          durationSec,
          markedReady: true,
        }),
      }).catch(() => {});
    }
  }, [currentIndex, songs, serviceId, userProfile, activeRole]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Determine content to show ───────────────────────────────────────────────

  const getContent = () => {
    if (!song) return { type: 'none', text: '' };

    if (activeRoleType === 'vocal') {
      const lyricText = (song.lyrics || '').trim();
      if (lyricText) return { type: 'lyrics', text: lyricText };
      return { type: 'no_content', label: '🎤 No lyrics available for this song.' };
    }

    if (activeRoleType === 'sound_tech') {
      if (song.notes) return { type: 'notes', text: song.notes };
      return { type: 'no_content', label: '🎚️ Vocal lineup shown above for this song.' };
    }

    if (activeRoleType === 'media') {
      const lyricText = (song.lyrics || '').trim();
      const mediaNotes = song.mediaNotes || song.notes || '';
      if (lyricText || mediaNotes) {
        return {
          type: 'media_lyrics',
          lyrics: lyricText,
          cues: mediaNotes,
        };
      }
      return { type: 'no_content', label: '📺 No lyrics or media cues available for this song.' };
    }

    if (activeRoleType === 'instrument') {
      const instrKey   = chartKey(selectedInstrument || '');
      const instrChart = selectedInstrument
        ? (song.instrumentNotes?.[instrKey] || song.instrumentSheets?.[instrKey] || '')
        : '';
      const isDrums    = selectedInstrument === 'Drums';

      if (isDrums) {
        // Drums see lyrics as reference to write patterns against, plus their own notes
        return { type: 'drum_notes', text: instrChart || '', lyrics: song.lyrics || '' };
      }

      const masterChart  = song.chordChart || song.lyricsChordChart || '';
      const baseChart    = instrChart || masterChart;
      if (baseChart) {
        const isGuitar    = GUITAR_INSTRUMENTS.has(selectedInstrument);
        const capoFret    = isGuitar ? (guitarCapo[song.id] ?? 0) : 0;
        const concertKey  = (song.transposedKey || song.key || '').trim();
        const shapesKey   = isGuitar && capoFret > 0 ? capoShapesKey(concertKey, capoFret) : concertKey;
        const chartText   = isGuitar && capoFret > 0
          ? transposeChart(baseChart, -capoFret, shapesKey)
          : baseChart;
        return {
          type: 'chord_chart',
          text: chartText,
          isInstrumentSpecific: !!instrChart,
          instrumentName: selectedInstrument,
          isGuitar,
          capoFret,
          concertKey,
          shapesKey,
        };
      }
      if (song.notes) return { type: 'notes', text: song.notes };
      return { type: 'no_content', label: '🎵 No chart available for this song.' };
    }

    // General
    if (song.notes) return { type: 'notes', text: song.notes };
    return { type: 'no_content', label: '🎵 No content for this song.' };
  };

  const normalizedActiveRole = normalizeRoleKey(activeRole);
  const content        = song ? getContent() : { type: 'none', text: '' };
  const canAutoScroll  = content.type === 'lyrics' || content.type === 'media_lyrics' || content.type === 'chord_chart' || content.type === 'drum_notes';
  const songLookupId   = song ? (getSongLookupId(song) || song.id) : '';
  const isSoundTech    = SOUND_TECH_ROLES.has(normalizedActiveRole);
  const isMediaTech    = activeRoleType === 'media';
  const isLeaderRole   = LEADER_ROLES.has(normalizedActiveRole);
  const myPart         = song && activeRoleType === 'vocal' ? getMyPartForSong(songLookupId, vocalAssignments, userProfile) : null;
  const vocalLineup    = song && (isSoundTech || isMediaTech) ? getSongVocalLineup(songLookupId, vocalAssignments) : [];
  const songSections   = song ? parseSections(song.lyrics || song.chordChart || '') : [];

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
                <View style={[
                  styles.dot,
                  readySongs.has(i) && styles.dotReady,
                  i === currentIndex && styles.dotActive,
                ]} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Transition mode toggle */}
        <TouchableOpacity
          style={[styles.transitionPill, transitionMode === 'crossfade' && styles.transitionPillActive]}
          onPress={() => setTransitionMode(m => m === 'cut' ? 'crossfade' : 'cut')}
        >
          <Text style={[styles.transitionPillLabel, transitionMode === 'crossfade' && styles.transitionPillLabelActive]}>
            {transitionMode === 'cut' ? '✂ CUT' : '◈ FADE'}
          </Text>
        </TouchableOpacity>

        {/* LIVE session indicator */}
        {isLiveSession && (
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>🔴 LIVE</Text>
          </View>
        )}

        {/* Go Live button — leaders only */}
        {isLeaderRole && (
          <TouchableOpacity style={styles.goLiveBtn} onPress={handleGoLive} activeOpacity={0.75}>
            <Text style={styles.goLiveBtnText}>🔴 Go Live</Text>
          </TouchableOpacity>
        )}

        {/* MIDI connection indicator */}
        <View style={[styles.midiIndicator, midiConnected && styles.midiIndicatorOn]}>
          <Text style={[styles.midiIndicatorIcon]}>{getRoleIcon(activeRole)}</Text>
          {midiConnected && (
            <View style={styles.midiDot} />
          )}
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
              <View style={styles.tempoBadge}><Text style={styles.tempoBadgeText}>{song.tempo} BPM</Text></View>
            ) : null}
          </View>
        </View>
        {song.artist ? <Text style={styles.artistText}>{song.artist}</Text> : null}

        {/* Your Part badge — vocalists & instrumentalists with a BGV part */}
        {myPart && !isSoundTech ? (
          <View style={styles.runnerPartBadge}>
            <Text style={styles.runnerPartLabel}>YOUR PART  </Text>
            <Text style={styles.runnerPartValue}>
              {PART_LABELS[myPart.partKey] || myPart.partKey}
              {myPart.key ? `  ·  ${myPart.key}` : ''}
            </Text>
          </View>
        ) : null}

        {(isSoundTech || isMediaTech) && (
          <View style={styles.runnerLineupCard}>
            <Text style={styles.runnerLineupLabel}>VOCAL LINEUP</Text>
            {vocalLineup.length > 0 ? (
              vocalLineup.map((entry) => (
                <View key={`${songLookupId}_${entry.partKey}_${entry.name}`} style={styles.runnerLineupRow}>
                  <Text style={styles.runnerLineupPart}>{PART_LABELS[entry.partKey] || entry.partKey}</Text>
                  <Text style={styles.runnerLineupName}>{entry.name}</Text>
                  {entry.key ? <Text style={styles.runnerLineupKey}>{entry.key}</Text> : null}
                </View>
              ))
            ) : (
              <Text style={styles.runnerLineupEmpty}>No vocal assignments for this song yet</Text>
            )}
          </View>
        )}

        {/* Role tabs — shown when person has multiple roles */}
        {allRoles.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleTabs}>
            {allRoles.map((role) => (
              <TouchableOpacity
                key={role}
                style={[styles.roleTab, activeRole === role && styles.roleTabActive]}
                onPress={() => {
                  setActiveRole(role);
                  const mapped = ROLE_TO_INSTRUMENT[normalizeRoleKey(role)] || null;
                  setSelectedInstrument(mapped);
                  setAutoScroll(false);
                  setReachedEnd(false);
                  scrollY.current = 0;
                  scrollRef.current?.scrollTo({ y: 0, animated: false });
                }}
              >
                <Text style={[styles.roleTabText, activeRole === role && styles.roleTabTextActive]}>
                  {getRoleIcon(role)} {getRoleLabel(role)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : allRoles.length === 1 ? (
          <View style={styles.singleRole}>
            <Text style={styles.singleRoleText}>
              {getRoleIcon(allRoles[0])} {getRoleLabel(allRoles[0])}
            </Text>
          </View>
        ) : null}

        {/* Instrument chart switcher */}
        {activeRoleType === 'instrument' && song && (() => {
          // Only show the current player's instrument — no switching to other parts
          const available = CHART_INSTRUMENTS.filter(instr =>
            song.instrumentNotes?.[chartKey(instr)] &&
            (!selectedInstrument || chartKey(instr) === chartKey(selectedInstrument))
          );
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

        {/* ── Section pills strip ── */}
        {(() => {
          const text = song.lyrics || song.chordChart || '';
          const secs = parseSections(text);
          if (!secs.length) return null;
          return (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 8 }}
              contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 2, paddingBottom: 2 }}
            >
              {secs.map((sec, idx) => {
                const isActive = activeSectionLabel === sec.name;
                return (
                  <TouchableOpacity
                    key={`${sec.name}_${idx}`}
                    style={[
                      styles.sectionPill,
                      isActive && styles.sectionPillActive,
                    ]}
                    onPress={() => {
                      lastManualScrollRef.current = Date.now();
                      scrollToSection(idx);
                    }}
                  >
                    <Text style={[styles.sectionPillText, isActive && styles.sectionPillTextActive]}>
                      {sec.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          );
        })()}

        {/* ── Song Ready button ── */}
        <TouchableOpacity
          style={[
            styles.songReadyBtn,
            readySongs.has(currentIndex) && styles.songReadyBtnDone,
          ]}
          onPress={readySongs.has(currentIndex) ? null : handleSongReady}
          activeOpacity={readySongs.has(currentIndex) ? 1 : 0.7}
        >
          <Text style={[
            styles.songReadyBtnText,
            readySongs.has(currentIndex) && styles.songReadyBtnTextDone,
          ]}>
            {readySongs.has(currentIndex) ? '✓ Song Ready' : '◯ Mark as Ready'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Content Area ─────────────────────── */}
      <Animated.View style={{ flex: 1, opacity: contentOpacity }}>
      <ScrollView
        ref={scrollRef}
        style={styles.contentScroll}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={true}
        scrollIndicatorInsets={{ right: 1 }}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          scrollY.current = y;
          // Track manual scrolls (distinguish from auto-scroll ticks via isTracking)
          if (!autoScroll) {
            lastManualScrollRef.current = Date.now();
          }
          // Update active section
          const curSong = songs[currentIndexRef.current];
          if (curSong) {
            const text = curSong.lyrics || curSong.chordChart || '';
            const label = getActiveSectionFromScroll(text, y, contentH.current);
            setActiveSectionLabel(prev => (prev !== label ? label : prev));
          }
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
            <View style={styles.instrBadgeRow}>
              <View style={styles.instrBadge}>
                <Text style={styles.instrBadgeText}>🎤 Vocals</Text>
              </View>
            </View>
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
            {content.instrumentName ? (
              <View style={styles.instrBadgeRow}>
                <View style={styles.instrBadge}>
                  <Text style={styles.instrBadgeText}>
                    {INSTRUMENT_ICON[content.instrumentName] || '🎼'} {content.instrumentName}
                  </Text>
                </View>
                {content.concertKey ? (
                  <View style={styles.keyBadge}>
                    <Text style={styles.keyBadgeText}>
                      {content.capoFret > 0 ? content.shapesKey : content.concertKey}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Guitar capo picker */}
            {content.isGuitar ? (
              <View style={styles.capoRow}>
                <Text style={styles.capoLabel}>🎸 Capo:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {GUITAR_CAPO_OPTIONS.map(fret => {
                      const active = content.capoFret === fret;
                      const sKey = fret > 0 && content.concertKey ? capoShapesKey(content.concertKey, fret) : null;
                      return (
                        <TouchableOpacity
                          key={fret}
                          style={[styles.capoPill, active && styles.capoPillActive]}
                          onPress={() => setGuitarCapo(prev => ({ ...prev, [song.id]: fret }))}
                        >
                          <Text style={[styles.capoPillText, active && styles.capoPillTextActive]}>
                            {fret === 0 ? 'Open' : `${fret}`}
                          </Text>
                          {sKey && active ? (
                            <Text style={styles.capoPillKey}>{sKey}</Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
                {content.capoFret > 0 && content.concertKey ? (
                  <Text style={styles.capoHint}>
                    Play {content.shapesKey} shapes · sounds {content.concertKey}
                  </Text>
                ) : null}
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
              <Text style={styles.editBtnText}>
                ✏️ Edit {content.instrumentName ? content.instrumentName + ' ' : ''}Chart
              </Text>
            </TouchableOpacity>
            <Text style={styles.chordChartText}>{content.text}</Text>
          </View>
        ) : null}

        {/* ── DRUM NOTES ── */}
        {content.type === 'drum_notes' ? (
          <View>
            {/* Badge row */}
            <View style={styles.instrBadgeRow}>
              <View style={[styles.instrBadge, { backgroundColor: '#34D39920', borderColor: '#34D39950' }]}>
                <Text style={[styles.instrBadgeText, { color: '#34D399' }]}>🥁 Drums</Text>
              </View>
              {song.key ? <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>{song.key}</Text></View> : null}
              {song.tempo ? <View style={styles.tempoBadge}><Text style={styles.tempoBadgeText}>{song.tempo} BPM</Text></View> : null}
            </View>

            {/* Pattern feel chips — read-only reference */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10, marginTop: 2 }}>
              <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 2 }}>
                {DRUM_PATTERNS.map(({ label }) => (
                  <View key={label} style={{ backgroundColor: '#34D39915', borderRadius: 8, borderWidth: 1, borderColor: '#34D39940', paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: '#34D399', fontSize: 11, fontWeight: '700' }}>{label}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* Lyrics reference — so drummer can map patterns to song structure */}
            {content.lyrics ? (
              <View style={{ marginBottom: 14, backgroundColor: '#0A0F1A', borderRadius: 8, borderWidth: 1, borderColor: '#1E293B', padding: 12 }}>
                <Text style={{ color: '#374151', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  🎤 Lyrics Reference
                </Text>
                <Text style={[styles.lyricsText, { color: '#4B5563', fontSize: 13 }]}>{content.lyrics}</Text>
              </View>
            ) : null}

            {/* Drum notes — editable */}
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate('ContentEditor', {
                song,
                serviceId: '',
                type: 'chord_chart',
                existing: content.text,
                instrument: 'Drums',
                isAdmin: false,
              })}
            >
              <Text style={styles.editBtnText}>✏️ {content.text ? 'Edit' : 'Add'} Drum Notes</Text>
            </TouchableOpacity>

            {content.text ? (
              <Text style={[styles.chordChartText, { fontFamily: 'monospace' }]}>{content.text}</Text>
            ) : (
              <Text style={[styles.noContentHint, { textAlign: 'center', marginTop: 12 }]}>
                Tap ✏️ above to add your groove and pattern cues.
              </Text>
            )}
          </View>
        ) : null}

        {/* ── MEDIA LYRICS + CUES ── */}
        {content.type === 'media_lyrics' ? (
          <View>
            <View style={styles.instrBadgeRow}>
              <View style={[styles.instrBadge, { backgroundColor: '#1E1B4B', borderColor: '#6366F150' }]}>
                <Text style={[styles.instrBadgeText, { color: '#A5B4FC' }]}>📺 Media / Slides</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate('ContentEditor', {
                song,
                serviceId: '',
                type: 'lyrics',
                existing: content.lyrics || '',
                instrument: 'Media',
                isAdmin: false,
              })}
            >
              <Text style={styles.editBtnText}>✏️ Edit Lyrics</Text>
            </TouchableOpacity>
            {content.lyrics ? (
              <Text style={styles.lyricsText}>{content.lyrics}</Text>
            ) : (
              <Text style={[styles.noContentHint, { textAlign: 'center', marginTop: 12 }]}>
                No lyrics available for this song yet.
              </Text>
            )}

            <View style={[styles.notesCard, { marginTop: 14 }]}>
              <Text style={[styles.notesLabel, { color: '#818CF8' }]}>📺 MEDIA / SLIDES</Text>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => navigation.navigate('ContentEditor', {
                  song,
                  serviceId: '',
                  type: 'notes',
                  existing: content.cues || '',
                  instrument: 'Media',
                  isAdmin: false,
                })}
              >
                <Text style={styles.editBtnText}>✏️ Edit Slide Cues</Text>
              </TouchableOpacity>
              {content.cues ? (
                <Text style={styles.notesText}>{content.cues}</Text>
              ) : (
                <Text style={[styles.noContentHint, { textAlign: 'center' }]}>
                  No slide cues for this song yet. Tap ✏️ to add media/projection notes.
                </Text>
              )}
            </View>
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
              {activeRoleType === 'vocal' ? '🎤' : activeRoleType === 'instrument' ? '🎼' : activeRoleType === 'sound_tech' ? '🎚' : activeRoleType === 'media' ? '📺' : '🎵'}
            </Text>
            <Text style={styles.noContentTitle}>{song.title}</Text>
            {song.key ? (
              <Text style={styles.noContentSub}>
                Key of {song.key}{song.tempo ? ` • ${song.tempo} BPM` : ''}
              </Text>
            ) : null}
            <Text style={styles.noContentHint}>{content.label}</Text>
            {activeRoleType !== 'sound_tech' && activeRoleType !== 'media' ? (
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => navigation.navigate('ContentEditor', {
                  song,
                  serviceId: '',
                  type: activeRoleType === 'vocal' ? 'lyrics' : 'chord_chart',
                  existing: '',
                  instrument: activeRoleType === 'vocal' ? 'Vocals' : (selectedInstrument || ''),
                  isAdmin: false,
                })}
              >
                <Text style={styles.editBtnText}>
                  ✏️ Add {activeRoleType === 'vocal' ? 'Lyrics' : (selectedInstrument ? selectedInstrument + ' Chart' : 'Chart')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* End-of-song → next song prompt */}
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
      </Animated.View>

      {/* ── Leader Section Cue Pills ─────────── */}
      {isLeaderRole && songSections.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sectionCueBar}
          contentContainerStyle={styles.sectionCueBarContent}
        >
          {songSections.map((sec, idx) => (
            <TouchableOpacity
              key={`${sec.name}_${idx}`}
              style={[
                styles.sectionCuePill,
                activeSectionLabel?.toLowerCase() === sec.name.toLowerCase() && styles.sectionCuePillActive,
              ]}
              onPress={() => {
                scrollToSection(idx);
                setActiveSectionLabel(sec.name);
                sendLiveSectionCue(sec.name, songLookupId);
              }}
            >
              <Text style={[
                styles.sectionCuePillText,
                activeSectionLabel?.toLowerCase() === sec.name.toLowerCase() && styles.sectionCuePillTextActive,
              ]}>
                {sec.name.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {/* ── Bottom Transport ─────────────────── */}
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom + 6 }]}>
        {/* Back */}
        <TouchableOpacity
          style={[styles.transportBtn, currentIndex === 0 && styles.transportBtnDisabled]}
          onPress={goPrev}
          disabled={currentIndex === 0}
        >
          <Text style={[styles.transportIcon, currentIndex === 0 && styles.transportIconDisabled]}>⏮</Text>
          <Text style={[styles.transportLabel, currentIndex === 0 && styles.transportLabelDisabled]}>Back</Text>
        </TouchableOpacity>

        {/* Play / Stop */}
        <TouchableOpacity
          style={[
            styles.transportPlayBtn,
            autoScroll && styles.transportPlayBtnActive,
            !canAutoScroll && styles.transportPlayBtnDisabled,
          ]}
          onPress={() => {
            if (!canAutoScroll) return;
            setReachedEnd(false);
            clearTimeout(autoAdvanceTimer.current);
            nextPulse.stopAnimation();
            nextPulse.setValue(1);
            setAutoScroll((v) => !v);
          }}
        >
          <Text style={styles.transportPlayIcon}>{autoScroll ? '⏸' : '▶'}</Text>
          <Text style={styles.transportPlayLabel}>{autoScroll ? 'Stop' : 'Play'}</Text>
        </TouchableOpacity>

        {/* Next */}
        <TouchableOpacity
          style={[
            styles.transportBtn,
            currentIndex === songs.length - 1 && styles.transportBtnDisabled,
          ]}
          onPress={goNext}
          disabled={currentIndex === songs.length - 1}
        >
          <Text style={[
            styles.transportIcon,
            currentIndex === songs.length - 1 && styles.transportIconDisabled,
          ]}>⏭</Text>
          <Text style={[
            styles.transportLabel,
            currentIndex === songs.length - 1 && styles.transportLabelDisabled,
          ]}>Next</Text>
        </TouchableOpacity>
      </View>

      {/* ── Haptic click track toggle ──── */}
      <View style={styles.hapticRow}>
        <Text style={styles.hapticRowLabel}>Click</Text>
        {[HAPTIC_MODES.OFF, HAPTIC_MODES.DOWNBEAT_ONLY, HAPTIC_MODES.CLICK].map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.hapticBtn, hapticMode === mode && styles.hapticBtnActive]}
            onPress={() => setHapticMode(mode)}
          >
            <Text style={[styles.hapticBtnText, hapticMode === mode && styles.hapticBtnTextActive]}>
              {mode === HAPTIC_MODES.OFF ? 'Off' : mode === HAPTIC_MODES.DOWNBEAT_ONLY ? '1 only' : 'All'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Congregation energy (leader only) ─── */}
      {isLeaderRole && energyLevel != null && (
        <View style={styles.energyRow}>
          <View style={[styles.energyFill, {
            width: `${energyLevel}%`,
            backgroundColor: energyLevel > 70 ? '#EC4899' : energyLevel > 40 ? '#F59E0B' : '#6366F1',
          }]} />
          <Text style={styles.energyText}>
            Room {energyLevel}%{energyTrend === 'rising' ? ' ↑' : energyTrend === 'falling' ? ' ↓' : ''}
          </Text>
        </View>
      )}
      {isLeaderRole && energySuggestion && (
        <View style={styles.energySuggestion}>
          <Text style={styles.energySuggestionText}>{energySuggestion.message}</Text>
        </View>
      )}

      {/* ── "We're Live" Go Live toast ─── */}
      {goLiveToast ? (
        <View style={styles.goLiveToast} pointerEvents="none">
          <Text style={styles.goLiveToastText}>✅ Team notified — We're live!</Text>
        </View>
      ) : null}

      {/* ── Beat Countdown Overlay ──────── */}
      {countdownActive ? (
        <View style={styles.countdownOverlay} pointerEvents="box-none">
          <Animated.View style={[styles.countdownCircle, { transform: [{ scale: countdownScale }] }]}>
            <Text style={styles.countdownNumber}>{countdownBeat}</Text>
          </Animated.View>
          {songs[pendingNextIndex.current] ? (
            <Text style={styles.countdownNextLabel}>
              next: {songs[pendingNextIndex.current].title}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Top bar
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
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: '#374151' },
  dotActive: { width: 16, borderRadius: 3, backgroundColor: '#8B5CF6' },
  dotReady:  { backgroundColor: '#10B981' },

  // Transition mode pill
  transitionPill: {
    height: 34, paddingHorizontal: 8, borderRadius: 10, marginRight: 6,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  transitionPillActive: { borderColor: '#7C3AED', backgroundColor: '#1E1B4B' },
  transitionPillLabel:  { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 },
  transitionPillLabelActive: { color: '#A78BFA' },

  // Go Live button
  goLiveBtn: {
    height: 30, paddingHorizontal: 10, borderRadius: 8, marginLeft: 4,
    backgroundColor: '#7F1D1D', borderWidth: 1, borderColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
  },
  goLiveBtnText: { fontSize: 11, fontWeight: '800', color: '#FCA5A5', letterSpacing: 0.3 },

  // Go Live toast — bottom-center overlay
  goLiveToast: {
    position: 'absolute', bottom: 90, left: 20, right: 20,
    backgroundColor: '#065F46', borderRadius: 12, borderWidth: 1, borderColor: '#34D399',
    paddingVertical: 12, paddingHorizontal: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
    elevation: 10,
  },
  goLiveToastText: { color: '#ECFDF5', fontSize: 15, fontWeight: '700' },

  // MIDI indicator (top right) — shows role icon + green dot when connected
  liveBadge: {
    backgroundColor: '#EF4444', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginRight: 6,
  },
  liveBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  midiIndicator: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  midiIndicatorOn: { borderColor: '#10B981' },
  midiIndicatorIcon: { fontSize: 16 },
  midiDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#10B981',
    borderWidth: 1, borderColor: '#000',
  },

  // Song header
  songHeader: {
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12,
    backgroundColor: '#05101F',
    borderBottomWidth: 1, borderBottomColor: '#1F2937',
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 4,
  },
  songTitle: {
    flex: 1, fontSize: 24, fontWeight: '800',
    color: '#F9FAFB', lineHeight: 30, marginRight: 10,
  },
  badgesCol: { alignItems: 'flex-end', gap: 4, marginTop: 2 },
  keyBadge: {
    paddingHorizontal: 9, paddingVertical: 4,
    backgroundColor: '#8B5CF6', borderRadius: 6,
    minWidth: 34, alignItems: 'center',
  },
  keyBadgeText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  tempoBadge: {
    paddingHorizontal: 7, paddingVertical: 3,
    backgroundColor: '#1F2937', borderRadius: 5, alignItems: 'center',
  },
  tempoBadgeText: { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },
  artistText: { fontSize: 13, color: '#9CA3AF', marginBottom: 10 },

  // Capo picker
  capoRow: { marginTop: 8, marginBottom: 4 },
  capoLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  capoPill: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#1F2937', borderRadius: 10,
    borderWidth: 1, borderColor: '#374151', alignItems: 'center', minWidth: 44,
  },
  capoPillActive: { backgroundColor: '#4F46E520', borderColor: '#4F46E5' },
  capoPillText: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  capoPillTextActive: { color: '#4F46E5' },
  capoPillKey: { fontSize: 10, color: '#4F46E5', fontWeight: '600', marginTop: 1 },
  capoHint: { fontSize: 11, color: '#6B7280', marginTop: 6, fontStyle: 'italic' },

  // Role tabs
  roleTabs: { marginTop: 6 },
  roleTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: '#0F172A', borderRadius: 20,
    borderWidth: 1, borderColor: '#374151', marginRight: 8,
  },
  roleTabActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  roleTabText:       { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  roleTabTextActive: { color: '#FFF' },
  singleRole: {
    alignSelf: 'flex-start', marginTop: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: '#0F172A', borderRadius: 12,
    borderWidth: 1, borderColor: '#374151',
  },
  singleRoleText: { fontSize: 12, fontWeight: '600', color: '#818CF8' },

  // Instrument switcher
  instrSwitcherWrap: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  instrSwitcherLabel: {
    fontSize: 11, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  instrPill: {
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: '#0F172A', borderRadius: 16,
    borderWidth: 1, borderColor: '#374151', marginRight: 6,
  },
  instrPillActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  instrPillText:       { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  instrPillTextActive: { color: '#FFF' },

  // Content scroll
  contentScroll: { flex: 1 },
  contentInner:  { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },

  // Speed control
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  speedLabel: { fontSize: 11, color: '#6B7280', fontWeight: '700', textTransform: 'uppercase' },
  speedBtn:       { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#1F2937', borderRadius: 6 },
  speedBtnActive: { backgroundColor: '#7C3AED' },
  speedBtnText:       { fontSize: 11, color: '#9CA3AF', fontWeight: '700' },
  speedBtnTextActive: { color: '#FFF' },

  // Edit button
  editBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#0F172A', borderRadius: 8,
    borderWidth: 1, borderColor: '#374151', marginBottom: 12,
  },
  editBtnText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },

  // Lyrics
  lyricsText: {
    fontSize: 20, color: '#F3F4F6', lineHeight: 38,
    fontWeight: '400', letterSpacing: 0.2,
  },

  // Chord chart
  chordChartText: {
    fontSize: 15, color: '#E5E7EB', lineHeight: 26,
    fontFamily: 'Courier', letterSpacing: 0.3,
  },

  // Instrument badge in content
  instrBadgeRow: { marginBottom: 10 },
  instrBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: '#1E1B4B', borderRadius: 10,
    borderWidth: 1, borderColor: '#4F46E5',
  },
  instrBadgeText: { fontSize: 12, fontWeight: '700', color: '#818CF8' },

  // Notes
  notesCard: {
    padding: 16, backgroundColor: '#0B1120',
    borderRadius: 10, borderWidth: 1, borderColor: '#374151',
  },
  notesLabel: {
    fontSize: 10, fontWeight: '700', color: '#6B7280',
    letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase',
  },
  notesText: { fontSize: 15, color: '#E5E7EB', lineHeight: 24 },

  // No content
  noContentState:  { alignItems: 'center', paddingVertical: 48 },
  noContentIcon:   { fontSize: 56, marginBottom: 16 },
  noContentTitle:  { fontSize: 22, fontWeight: '800', color: '#F9FAFB', marginBottom: 6, textAlign: 'center' },
  noContentSub:    { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  noContentHint:   { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginBottom: 8 },
  noContentHintSm: { fontSize: 12, color: '#4B5563', textAlign: 'center', lineHeight: 18 },

  // End-of-song → next prompt
  nextSongPrompt: {
    marginTop: 32, padding: 20,
    backgroundColor: '#0F172A', borderRadius: 14,
    borderWidth: 1, borderColor: '#8B5CF6', alignItems: 'center',
  },
  nextSongPromptLabel:   { fontSize: 10, fontWeight: '700', color: '#8B5CF6', letterSpacing: 1.5, marginBottom: 6 },
  nextSongPromptTitle:   { fontSize: 18, fontWeight: '700', color: '#F9FAFB', marginBottom: 14, textAlign: 'center' },
  nextSongPromptBtn:     { paddingHorizontal: 28, paddingVertical: 12, backgroundColor: '#8B5CF6', borderRadius: 10 },
  nextSongPromptBtnText: { fontSize: 15, fontWeight: '800', color: '#FFF' },

  endOfSetlist:     { alignItems: 'center', paddingVertical: 40 },
  endOfSetlistIcon: { fontSize: 48, marginBottom: 12 },
  endOfSetlistText: { fontSize: 18, fontWeight: '700', color: '#6B7280' },

  // Bottom transport
  bottomNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingHorizontal: 20, paddingTop: 10,
    backgroundColor: '#0A0A0A', borderTopWidth: 1, borderTopColor: '#1F2937',
  },
  transportBtn: {
    width: 72, height: 64, borderRadius: 14,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  transportBtnDisabled: { backgroundColor: '#050A12', borderColor: '#1A2030' },
  transportIcon:         { fontSize: 22, color: '#8B5CF6' },
  transportIconDisabled: { color: '#2D3748' },
  transportLabel:         { fontSize: 10, color: '#9CA3AF', marginTop: 3, fontWeight: '600' },
  transportLabelDisabled: { color: '#374151' },
  transportPlayBtn: {
    width: 90, height: 72, borderRadius: 18,
    backgroundColor: '#4F46E5',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  transportPlayBtnActive:   { backgroundColor: '#7C3AED', shadowColor: '#7C3AED' },
  transportPlayBtnDisabled: { backgroundColor: '#1F2937', shadowOpacity: 0 },
  transportPlayIcon: { fontSize: 26, color: '#FFF' },
  transportPlayLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2, fontWeight: '700' },

  // Leader section cue pills
  sectionCueBar: {
    backgroundColor: '#050D1A',
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    maxHeight: 46,
  },
  sectionCueBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 8,
  },
  sectionCuePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#374151',
  },
  sectionCuePillActive: {
    backgroundColor: '#4C1D95',
    borderColor: '#7C3AED',
  },
  sectionCuePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  sectionCuePillTextActive: {
    color: '#DDD6FE',
  },

  // Song Ready button
  songReadyBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
  },
  songReadyBtnDone: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.35)',
  },
  songReadyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#818CF8',
    letterSpacing: 0.4,
  },
  songReadyBtnTextDone: {
    color: '#10B981',
  },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText:  { fontSize: 16, color: '#9CA3AF' },
  backLink:   { fontSize: 15, color: '#7C3AED', fontWeight: '600' },

  // Your Part badge in runner header
  runnerPartBadge: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 6, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: '#0B2233', borderRadius: 8,
    borderWidth: 1, borderColor: '#0EA5E9',
  },
  runnerPartLabel: { fontSize: 10, fontWeight: '800', color: '#38BDF8', letterSpacing: 0.7 },
  runnerPartValue: { fontSize: 12, fontWeight: '700', color: '#E0F2FE' },

  // Sound tech lead reference in runner header
  runnerLeadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#1A0F2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6D28D9',
  },
  runnerLeadLabel: { fontSize: 10, fontWeight: '800', color: '#A78BFA', letterSpacing: 0.7 },
  runnerLeadName: { fontSize: 12, fontWeight: '700', color: '#F3F4F6' },
  runnerLeadKey: { fontSize: 11, fontWeight: '700', color: '#DDD6FE' },
  runnerLineupCard: {
    alignSelf: 'stretch',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1A0F2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6D28D9',
    gap: 6,
  },
  runnerLineupLabel: { fontSize: 10, fontWeight: '800', color: '#A78BFA', letterSpacing: 0.7 },
  runnerLineupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  runnerLineupPart: { minWidth: 88, fontSize: 11, fontWeight: '700', color: '#C4B5FD' },
  runnerLineupName: { flex: 1, fontSize: 12, fontWeight: '700', color: '#F3F4F6' },
  runnerLineupKey: { fontSize: 11, fontWeight: '700', color: '#DDD6FE' },
  runnerLineupEmpty: { fontSize: 12, color: '#C4B5FD' },

  // Section pills strip
  sectionPill: {
    paddingHorizontal: 11, paddingVertical: 4,
    backgroundColor: '#0F172A', borderRadius: 12,
    borderWidth: 1, borderColor: '#374151',
  },
  sectionPillActive: {
    backgroundColor: '#7C3AED', borderColor: '#7C3AED',
  },
  sectionPillText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  sectionPillTextActive: { color: '#FFF', fontWeight: '700' },

  // Haptic click track
  hapticRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  hapticRowLabel: { color: '#6B7280', fontSize: 11, fontWeight: '500', marginRight: 2 },
  hapticBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#1C2432', borderWidth: 1, borderColor: '#2D3748' },
  hapticBtnActive: { backgroundColor: '#4F46E5', borderColor: '#6366F1' },
  hapticBtnText: { color: '#6B7280', fontSize: 11 },
  hapticBtnTextActive: { color: '#FFF', fontWeight: '600' },

  // Congregation energy
  energyRow: { marginHorizontal: 12, marginBottom: 4, height: 20, backgroundColor: '#1C2432', borderRadius: 4, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  energyFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, opacity: 0.5 },
  energyText: { color: '#E2E8F0', fontSize: 11, fontWeight: '600', paddingHorizontal: 8, zIndex: 1 },
  energySuggestion: { marginHorizontal: 12, marginBottom: 6, backgroundColor: '#1a2744', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderLeftWidth: 3, borderLeftColor: '#6366F1' },
  energySuggestionText: { color: '#C7D2FE', fontSize: 12, fontWeight: '500' },

  // Beat countdown overlay
  countdownOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center',
  },
  countdownCircle: {
    width: 180, height: 180, borderRadius: 90,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  countdownNumber: {
    fontSize: 120, fontWeight: '900',
    color: '#FFFFFF', lineHeight: 130,
    textAlign: 'center',
  },
  countdownNextLabel: {
    marginTop: 24, fontSize: 15, fontWeight: '600',
    color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 32,
  },
});
