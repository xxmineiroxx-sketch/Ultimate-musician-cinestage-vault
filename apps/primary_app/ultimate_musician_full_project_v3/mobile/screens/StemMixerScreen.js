/**
 * StemMixerScreen — Full waveform pipeline with:
 *   • EngineState machine (IDLE / PLAYING / PAUSED / LOOPING / WORSHIP_FREE)
 *   • StemRole detection (PAD / RHYTHM / BASS / LEAD / OTHER)
 *   • Section Navigator: 1× tap = queue, 2× = loop, 3× = Worship Free
 *   • AI Flow Suggestion (chorus fatigue → bridge, verse → chorus, etc.)
 *   • Worship Free mode (PADs up, LEAD low, RHYTHM/BASS fade out)
 *   • Loop Section toggle
 *   • Tap Tempo BPM detection
 *   • Emergency Clear (instant mute all)
 *   • iPad-optimized layout (width ≥ 680pt)
 */
import Slider from "@react-native-community/slider";
import * as FileSystem from "expo-file-system/legacy";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import * as audioEngine from "../audioEngine";
import CineStageProcessingOverlay from "../components/CineStageProcessingOverlay";
import { fetchWithRetry } from "../utils/fetchRetry";
import WaveformView from "../components/WaveformView";
import { normalizeWaveformPeaks } from "../services/wavePipelineEngine";
import { CINESTAGE_URL, syncRoomWsUrl } from "./config";

// ─── Engine State Machine ─────────────────────────────────────────────────────
const ENGINE_STATE = {
  IDLE:         'IDLE',
  PLAYING:      'PLAYING',
  PAUSED:       'PAUSED',
  LOOPING:      'LOOPING',
  WORSHIP_FREE: 'WORSHIP_FREE',
};

const STATE_META = {
  IDLE:         { label: 'IDLE',    color: '#4B5563' },
  PLAYING:      { label: 'PLAYING', color: '#22C55E' },
  PAUSED:       { label: 'PAUSED',  color: '#FBBF24' },
  LOOPING:      { label: 'LOOP',    color: '#60A5FA' },
  WORSHIP_FREE: { label: 'FREE',    color: '#A78BFA' },
};

// ─── Stem Roles (from Kimi engine) ───────────────────────────────────────────
function getStemRole(name) {
  const n = (name || '').toLowerCase();
  if (/pad|synth|atmo|ambient/i.test(n)) return 'PAD';
  if (/drum|perc|kit|beat/i.test(n))     return 'RHYTHM';
  if (/bass/i.test(n))                   return 'BASS';
  if (/vocal|vox|bgv|choir/i.test(n))    return 'LEAD';
  if (/guitar|keys|piano|organ|string|brass/i.test(n)) return 'LEAD';
  return 'OTHER';
}

const ROLE_LABEL = { PAD: 'PAD', RHYTHM: 'RHYTHM', BASS: 'BASS', LEAD: 'LEAD', OTHER: 'FX' };
const ROLE_COLOR = { PAD: '#A78BFA', RHYTHM: '#34D399', BASS: '#60A5FA', LEAD: '#F472B6', OTHER: '#94A3B8' };

// ─── Stem Colors (by name) ────────────────────────────────────────────────────
const STEM_COLORS = {
  vocals: '#F472B6', drums: '#34D399', bass: '#60A5FA',
  keys: '#A78BFA',  guitars: '#FB923C', pads: '#C084FC', other: '#FBBF24',
};
function stemColorFor(n) {
  return STEM_COLORS[(n || '').toLowerCase()] || '#94A3B8';
}

// ─── Section Parsing (from song chord chart / lyrics) ────────────────────────
const DEFAULT_SECTIONS = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'];

function parseSectionsFromSong(song) {
  const text = song?.chordChart || song?.chordSheet || song?.lyrics || '';
  if (!text) return DEFAULT_SECTIONS;
  const seen = new Set();
  const found = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(
      /^(intro|verse\s*\d*|pre-?chorus\s*\d*|chorus\s*\d*|bridge|tag|vamp|outro|interlude)/i,
    );
    if (m) {
      const base = m[1].replace(/\s*\d+$/i, '').trim();
      const cap = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
      if (!seen.has(cap.toLowerCase())) { seen.add(cap.toLowerCase()); found.push(cap); }
    }
  }
  return found.length >= 2 ? found : DEFAULT_SECTIONS;
}

function buildSectionWindows(sectionList = [], totalDuration = 0) {
  const sections = Array.isArray(sectionList) ? sectionList : [];
  if (sections.length === 0) return [];
  const safeDuration = Math.max(Number(totalDuration || 0), sections.length * 4);
  return sections.map((label, index) => {
    const startSec = (safeDuration * index) / sections.length;
    const endSec = index === sections.length - 1
      ? safeDuration
      : (safeDuration * (index + 1)) / sections.length;
    return {
      label,
      startSec,
      endSec,
    };
  });
}

function getSectionWindow(sectionList = [], sectionLabel = '', totalDuration = 0) {
  return buildSectionWindows(sectionList, totalDuration)
    .find((section) => section.label === sectionLabel) || null;
}

// ─── AI Flow Suggestion (from Kimi engine — chorus fatigue, bridge rules) ─────
function getAISuggestion(currentSection, history, sections) {
  if (!currentSection || !sections?.length) return null;
  let repeatCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] === currentSection) repeatCount++;
    else break;
  }
  const sec = currentSection.toLowerCase();
  if (sec.includes('chorus') && repeatCount >= 2) {
    const next = sections.find(s => s.toLowerCase().includes('bridge'))
               || sections.find(s => s.toLowerCase().includes('outro'));
    return next ? { section: next, reason: 'Chorus fatigue' } : null;
  }
  if (sec.includes('bridge')) {
    const chorus = sections.find(s => s.toLowerCase().includes('chorus'));
    return chorus ? { section: chorus, reason: 'Post-bridge energy' } : null;
  }
  if (sec.includes('verse')) {
    const chorus = sections.find(s => s.toLowerCase().includes('chorus'));
    return chorus ? { section: chorus, reason: 'Verse → Chorus' } : null;
  }
  if (sec.includes('intro')) {
    const verse = sections.find(s => s.toLowerCase().includes('verse'));
    return verse ? { section: verse, reason: 'Intro complete' } : null;
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const LOAD_STEPS = [
  'Initializing audio engine',
  'Loading stem tracks',
  'Calibrating mixer',
  'Ready',
];

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function buildTracksFromBackend(result) {
  const rawStems = result?.stems;
  const arr = Array.isArray(rawStems)
    ? rawStems
    : rawStems && typeof rawStems === 'object'
      ? Object.entries(rawStems).map(([type, url]) => ({ type, url }))
      : [];
  return arr.map((stem) => ({
    id: stem.type,
    name: stem.name || stem.type,
    color: stemColorFor(stem.type),
    role: getStemRole(stem.type),
    uri: stem.url,
    volume: 1,
    mute: false,
    solo: false,
  }));
}

function buildTracksFromLocal(localStems) {
  return Object.entries(localStems || {}).map(([name, info]) => ({
    id: `local_${name.toLowerCase()}`,
    name,
    color: stemColorFor(name),
    role: getStemRole(name),
    uri: info.localUri,
    volume: 1,
    mute: false,
    solo: false,
  }));
}

// ─── Track Channel Card ───────────────────────────────────────────────────────
function TrackCard({ item, onUpdate, isWorship, isIPad }) {
  const role = item.role || getStemRole(item.name);
  const roleColor = ROLE_COLOR[role] || '#94A3B8';
  const isPad       = role === 'PAD';
  const worshipGlow = isWorship && isPad;
  const worshipDim  = isWorship && !isPad;

  return (
    <View style={[
      st.trackCard,
      isIPad && st.trackCardIPad,
      worshipGlow && st.trackCardWorshipGlow,
      worshipDim  && st.trackCardWorshipDim,
    ]}>
      <View style={st.trackRow}>
        <View style={[st.colorBar, { backgroundColor: item.color }]} />
        <Text
          style={[st.trackName, isIPad && st.trackNameIPad, worshipDim && st.trackNameDim]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <View style={[st.roleBadge, {
          borderColor: roleColor + '55',
          backgroundColor: roleColor + '18',
        }]}>
          <Text style={[st.roleText, { color: roleColor }]}>{ROLE_LABEL[role]}</Text>
        </View>
        <View style={st.smBtns}>
          <TouchableOpacity
            style={[st.smBtn, item.solo && st.smBtnSolo, isIPad && st.smBtnIPad]}
            onPress={() => onUpdate({ ...item, solo: !item.solo })}
          >
            <Text style={[st.smLabel, item.solo && st.smLabelActive]}>S</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.smBtn, item.mute && st.smBtnMute, isIPad && st.smBtnIPad]}
            onPress={() => onUpdate({ ...item, mute: !item.mute })}
          >
            <Text style={[st.smLabel, item.mute && st.smLabelActive]}>M</Text>
          </TouchableOpacity>
        </View>
        <Text style={[st.volPct, worshipDim && { color: '#374151' }]}>
          {Math.round(item.volume * 100)}%
        </Text>
      </View>

      <Slider
        style={[st.volSlider, isIPad && st.volSliderIPad]}
        minimumValue={0}
        maximumValue={1}
        value={item.volume}
        minimumTrackTintColor={worshipGlow ? '#C084FC' : item.color}
        maximumTrackTintColor={worshipDim  ? '#0F172A' : '#1F2937'}
        thumbTintColor={worshipGlow ? '#E879F9' : '#E5E7EB'}
        onValueChange={(v) => onUpdate({ ...item, volume: v })}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function StemMixerScreen({ route, navigation }) {
  const { song, apiBase } = route.params || {};
  const { width: screenWidth } = useWindowDimensions();
  const isIPad = screenWidth >= 680;

  const [tracks,       setTracks]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadStep,     setLoadStep]     = useState(0);
  const [loadProgress, setLoadProgress] = useState(0);

  // Engine state
  const [engineState,  setEngineState]  = useState(ENGINE_STATE.IDLE);
  const [position,     setPosition]     = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [isSeeking,    setIsSeeking]    = useState(false);
  const [seekValue,    setSeekValue]    = useState(0);

  // AI Mix Recommendations
  const [aiMixLoading, setAiMixLoading] = useState(false);
  const [aiMixTips,    setAiMixTips]    = useState(null);

  async function handleAIMixAdvice() {
    if (!tracks.length) return;
    setAiMixLoading(true);
    setAiMixTips(null);
    try {
      const stemInfo = tracks.map(t => ({
        name: t.name,
        role: getStemRole(t.name),
        volume: Math.round(t.volume * 100),
        muted: !!t.mute,
      }));
      const res = await fetchWithRetry(`${apiBase || CINESTAGE_URL}/ai/music/mix-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stems: stemInfo,
          genre: 'worship',
          song_title: song?.title || '',
          bpm: song?.bpm || null,
        }),
      });
      if (!res.ok) throw new Error(`AI Mix ${res.status}`);
      const data = await res.json();
      setAiMixTips(data.recommendations || data.tips || data.content || JSON.stringify(data));
    } catch (e) {
      Alert.alert('AI Mix Error', e.message);
    } finally {
      setAiMixLoading(false);
    }
  }

  // Section + AI
  const sections           = parseSectionsFromSong(song);
  const [activeSection,    setActiveSection]   = useState(null);
  const sectionHistoryRef  = useRef([]);
  const [aiSuggestion,     setAiSuggestion]    = useState(null);

  // Tap tempo
  const tapTimesRef        = useRef([]);
  const [detectedBpm,      setDetectedBpm]     = useState(null);

  // Remember pre-pause state so we can restore it on resume
  const preStateRef = useRef(ENGINE_STATE.PLAYING);

  const pollRef = useRef(null);
  const fadeIntervalRef       = useRef(null);
  const midiWsRef             = useRef(null);
  const midiCommandHandlerRef = useRef(null);

  const [midiConnected, setMidiConnected] = useState(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const pos = await audioEngine.getPosition();
      setPosition(pos);
      const dur = await audioEngine.getDuration();
      if (dur > 0 && pos >= dur - 0.3) {
        stopPolling();
        await audioEngine.stop();
        setEngineState(ENGINE_STATE.IDLE);
        setPosition(0);
      }
    }, 500);
  }, [stopPolling]);

  // ── Load stems on mount ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadStep(0); setLoadProgress(10);
        await audioEngine.initEngine();

        setLoadStep(1); setLoadProgress(35);
        const localStems = song?.localStems;
        const hasLocal   = localStems && Object.keys(localStems).length > 0;
        const jobResult  = song?.latestStemsJob?.result;
        const rawStems   = jobResult?.stems;
        const hasBackend = Array.isArray(rawStems)
          ? rawStems.length > 0
          : rawStems && typeof rawStems === 'object'
            ? Object.keys(rawStems).length > 0
            : false;

        let initialTracks = [];

        if (hasLocal) {
          const allTracks   = buildTracksFromLocal(localStems);
          const validTracks = [];
          const missingNames = [];
          for (const t of allTracks) {
            if (t.uri) {
              const info = await FileSystem.getInfoAsync(t.uri);
              if (info.exists) validTracks.push(t);
              else { missingNames.push(t.name); console.warn('[StemMixer] missing:', t.uri); }
            } else missingNames.push(t.name);
          }
          if (missingNames.length > 0 && validTracks.length === 0) {
            Alert.alert(
              'Stems Not Found',
              `Audio files missing (${missingNames.join(', ')}). Please re-import.`,
              [{ text: 'OK' }],
            );
          }
          initialTracks = validTracks;
          if (initialTracks.length > 0) {
            await audioEngine.loadCustomTracks(initialTracks.map(t => ({ id: t.id, uri: t.uri })));
          }
        } else if (hasBackend) {
          initialTracks = buildTracksFromBackend(jobResult);
          await audioEngine.loadFromBackend(jobResult, apiBase || '');
        }

        setLoadStep(2); setLoadProgress(75);
        if (cancelled) return;
        setTracks(initialTracks);
        audioEngine.setMixerState(initialTracks);
        const dur = await audioEngine.getDuration();
        if (!cancelled) setDuration(dur);

        setLoadStep(3); setLoadProgress(100);
        await new Promise(r => setTimeout(r, 600));
      } catch (e) {
        console.warn('StemMixer load error', e);
        if (!cancelled) Alert.alert('Load Error', String(e.message || e));
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      stopPolling();
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      audioEngine.stop().catch(() => {});
    };
  }, []);

  // Sync mixer engine whenever tracks change
  useEffect(() => {
    if (tracks.length > 0) audioEngine.setMixerState(tracks);
  }, [tracks]);

  // ── MIDI WebSocket — Cloudflare DO sync room, auto-reconnects ───────────────
  useEffect(() => {
    // Room ID: use song id so each song has its own isolated sync room
    const roomId = song?.id || 'stem_mixer_default';
    let ws = null;
    let reconnectTimer = null;

    function connect() {
      try { ws = new WebSocket(syncRoomWsUrl(roomId)); } catch { return; }
      midiWsRef.current = ws;
      ws.onopen  = () => setMidiConnected(true);
      ws.onclose = () => {
        setMidiConnected(false);
        midiWsRef.current = null;
        reconnectTimer = setTimeout(connect, 5000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        try { midiCommandHandlerRef.current?.(JSON.parse(ev.data)); } catch {}
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [song?.id]);

  function updateTrack(updated) {
    setTracks(prev => prev.map(t => t.id === updated.id ? updated : t));
  }

  // ── Transport ──────────────────────────────────────────────────────────────
  const isActive  = engineState === ENGINE_STATE.PLAYING
                 || engineState === ENGINE_STATE.LOOPING
                 || engineState === ENGINE_STATE.WORSHIP_FREE;
  const isWorship = engineState === ENGINE_STATE.WORSHIP_FREE;

  async function handlePlayPause() {
    if (isActive) {
      await audioEngine.pause();
      stopPolling();
      preStateRef.current = engineState;
      setEngineState(ENGINE_STATE.PAUSED);
    } else {
      audioEngine.play();
      setEngineState(preStateRef.current);
      startPolling();
    }
  }

  async function handleStop() {
    await audioEngine.stop();
    audioEngine.clearLoopRegion?.();
    stopPolling();
    setEngineState(ENGINE_STATE.IDLE);
    setPosition(0); setSeekValue(0);
    const dur = await audioEngine.getDuration();
    setDuration(dur);
  }

  // ── Tap Tempo (from Kimi engine: averaged intervals, smoothed BPM) ─────────
  function handleTapTempo() {
    const now   = Date.now();
    const times = tapTimesRef.current;
    times.push(now);
    if (times.length > 5) times.splice(0, times.length - 5);
    if (times.length >= 2) {
      const intervals = [];
      for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avg);
      if (bpm >= 40 && bpm <= 220) setDetectedBpm(bpm);
    }
  }

  // ── Section tap tracker (1× queue, 2× loop, 3× worship free) ────────────────
  const sectionTapRef = useRef({ section: null, count: 0, timer: null });

  // Shared activation used by button AND triple-tap — smooth exponential fade ~600 ms
  function activateWorshipFree() {
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    preStateRef.current = ENGINE_STATE.WORSHIP_FREE;
    setEngineState(ENGINE_STATE.WORSHIP_FREE);
    let ticks = 0;
    fadeIntervalRef.current = setInterval(() => {
      ticks++;
      setTracks(prev => {
        let allSettled = true;
        const next = prev.map(t => {
          const role   = t.role || getStemRole(t.name);
          const target = role === 'PAD' ? 1.0 : role === 'LEAD' ? 0.25 : 0.0;
          const diff   = target - t.volume;
          if (Math.abs(diff) < 0.015) return { ...t, volume: target, mute: target < 0.01 };
          allSettled = false;
          return { ...t, volume: t.volume + diff * 0.28, mute: false };
        });
        if (allSettled || ticks >= 22) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
        }
        return next;
      });
    }, 32);
  }

  // ── Section Navigator: tap gesture system ────────────────────────────────
  // 1× tap   → queue / select section
  // 2× taps  → loop that section  (LOOPING state)
  // 3× taps  → activate Worship Free
  function handleSectionPress(section) {
    const tap = sectionTapRef.current;
    if (tap.timer) { clearTimeout(tap.timer); tap.timer = null; }

    tap.count  = tap.section === section ? tap.count + 1 : 1;
    tap.section = section;
    setActiveSection(section);

    if (tap.count === 1) {
      // Queue section — exit loop/free if active
      sectionHistoryRef.current.push(section);
      if (engineState === ENGINE_STATE.LOOPING || engineState === ENGINE_STATE.WORSHIP_FREE) {
        setEngineState(position > 0 ? ENGINE_STATE.PLAYING : ENGINE_STATE.IDLE);
      }
      audioEngine.clearLoopRegion?.();
      const suggestion = getAISuggestion(section, sectionHistoryRef.current, sections);
      setAiSuggestion(suggestion?.section ? suggestion : null);
    } else if (tap.count === 2) {
      // Loop section
      const sectionWindow = getSectionWindow(sections, section, duration);
      if (sectionWindow) {
        audioEngine.applyConductorCommand?.({
          type: 'LOOP_SECTION',
          startSec: sectionWindow.startSec,
          endSec: sectionWindow.endSec,
          label: sectionWindow.label,
          seek: true,
        }).catch(() => {});
        setPosition(sectionWindow.startSec);
      }
      preStateRef.current = ENGINE_STATE.LOOPING;
      setEngineState(ENGINE_STATE.LOOPING);
      setAiSuggestion(null);
    } else if (tap.count >= 3) {
      // Worship Free
      tap.count = 0;
      activateWorshipFree();
      setAiSuggestion(null);
      return; // already reset, skip timer
    }

    // Reset tap count 600 ms after last tap
    tap.timer = setTimeout(() => { tap.count = 0; tap.section = null; }, 600);
  }

  // ── Loop Section button ────────────────────────────────────────────────────
  function handleLoopSection() {
    if (engineState === ENGINE_STATE.LOOPING) {
      audioEngine.clearLoopRegion?.();
      setEngineState(position > 0 ? ENGINE_STATE.PLAYING : ENGINE_STATE.IDLE);
    } else {
      const sectionWindow = getSectionWindow(sections, activeSection, duration);
      if (sectionWindow) {
        audioEngine.applyConductorCommand?.({
          type: 'LOOP_SECTION',
          startSec: sectionWindow.startSec,
          endSec: sectionWindow.endSec,
          label: sectionWindow.label,
          seek: false,
        }).catch(() => {});
      }
      preStateRef.current = ENGINE_STATE.LOOPING;
      setEngineState(ENGINE_STATE.LOOPING);
    }
  }

  // ── Worship Free button ────────────────────────────────────────────────────
  function handleWorshipFree() {
    if (isWorship) {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      let ticks = 0;
      fadeIntervalRef.current = setInterval(() => {
        ticks++;
        setTracks(prev => {
          let allSettled = true;
          const next = prev.map(t => {
            const diff = 1.0 - t.volume;
            if (Math.abs(diff) < 0.015) return { ...t, volume: 1.0, mute: false };
            allSettled = false;
            return { ...t, volume: t.volume + diff * 0.28, mute: false };
          });
          if (allSettled || ticks >= 22) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          }
          return next;
        });
      }, 32);
      setEngineState(position > 0 ? ENGINE_STATE.PLAYING : ENGINE_STATE.IDLE);
      preStateRef.current = ENGINE_STATE.PLAYING;
      return;
    }
    audioEngine.clearLoopRegion?.();
    activateWorshipFree();
  }

  // ── Emergency Clear (from Kimi engine: instant zero all) ──────────────────
  function handleEmergencyClear() {
    Alert.alert(
      '🚨 Emergency Clear',
      'Mute all stems instantly?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            audioEngine.emergencyClear();
            audioEngine.clearLoopRegion?.();
            setTracks(prev => prev.map(t => ({ ...t, volume: 0, mute: true })));
            stopPolling();
            setEngineState(ENGINE_STATE.IDLE);
            setPosition(0);
          },
        },
      ],
    );
  }

  // ── MIDI command handler — bound via ref so WebSocket never has stale closures
  function handleMidiCommand(cmd) {
    switch (cmd.type) {
      case 'MIDI_PLAY':
        handlePlayPause();
        break;
      case 'MIDI_STOP':
        handleStop();
        break;
      case 'MIDI_SECTION': {
        const sec = sections[cmd.sectionIdx ?? 0];
        if (sec) handleSectionPress(sec); // uses same 3-tap logic as touch UI
        break;
      }
      case 'MIDI_LOOP_SECTION':
        handleLoopSection();
        break;
      case 'MIDI_WORSHIP_FREE':
        handleWorshipFree();
        break;
      case 'MIDI_EMERGENCY_CLEAR':
        audioEngine.emergencyClear();
        audioEngine.clearLoopRegion?.();
        setTracks(prev => prev.map(t => ({ ...t, volume: 0, mute: true })));
        stopPolling();
        setEngineState(ENGINE_STATE.IDLE);
        setPosition(0);
        break;
      case 'MIDI_FADER': {
        const ch = cmd.ch ?? 0;
        setTracks(prev =>
          prev.map((t, i) =>
            i === ch ? { ...t, volume: Math.max(0, Math.min(1, cmd.value ?? 0)) } : t,
          ),
        );
        break;
      }
      default: break;
    }
  }
  // Reassign every render so onmessage always calls the latest closure
  midiCommandHandlerRef.current = handleMidiCommand;

  // ── Derived values ─────────────────────────────────────────────────────────
  const anySolo        = tracks.some(t => t.solo);
  const displayPos     = isSeeking ? seekValue : position;
  const waveformPeaks  = normalizeWaveformPeaks(
    song?.analysis?.waveformPeaks || song?.waveformPeaks || null,
  );
  const waveformProgress = duration > 0 ? Math.min(1, displayPos / duration) : 0;
  const waveformWidth    = Math.max(200, screenWidth - 32);
  const stateMeta        = STATE_META[engineState];
  const displayBpm       = detectedBpm || song?.bpm;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={st.container}>
        <CineStageProcessingOverlay
          visible
          title="CineStage™ is processing"
          subtitle="Wait — we'll let you know when it's done."
          steps={LOAD_STEPS}
          currentStepIndex={loadStep}
          progress={loadProgress}
        />
      </View>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (tracks.length === 0) {
    return (
      <View style={st.center}>
        <Text style={st.emptyTitle}>No stems loaded</Text>
        <Text style={st.emptyCaption}>
          Add local stem files from the Stems Center, or import stems from a URL.
        </Text>
        <TouchableOpacity style={st.backBtn} onPress={() => navigation.goBack()}>
          <Text style={st.backBtnText}>← Back to Stems Center</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={st.container}
      contentContainerStyle={[st.scroll, isIPad && st.scrollIPad]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header: song info + engine state badge ─────────────── */}
      <View style={st.header}>
        <View style={st.headerLeft}>
          <Text style={[st.songTitle, isIPad && st.songTitleIPad]} numberOfLines={1}>
            {song?.title || 'Untitled'}
          </Text>
          <Text style={st.songMeta}>
            {[
              song?.artist,
              song?.bpm && `${song.bpm} BPM`,
              song?.originalKey && `Key of ${song.originalKey}`,
            ].filter(Boolean).join('  ·  ')}
          </Text>
        </View>
        <View style={st.headerRight}>
          {midiConnected && (
            <View style={st.midiPill}>
              <View style={st.midiDot} />
              <Text style={st.midiLabel}>MIDI</Text>
            </View>
          )}
          <View style={[st.stateBadge, {
            backgroundColor: stateMeta.color + '1A',
            borderColor:     stateMeta.color + '55',
          }]}>
            <View style={[st.stateDot, { backgroundColor: stateMeta.color }]} />
            <Text style={[st.stateLabel, { color: stateMeta.color }]}>
              {stateMeta.label}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Waveform ────────────────────────────────────────────── */}
      <View style={[st.waveformCard, isWorship && st.waveformCardWorship]}>
        <WaveformView
          peaks={
            waveformPeaks.length > 0
              ? waveformPeaks
              : Array.from({ length: 80 }, (_, i) =>
                  0.2 + 0.6 * Math.abs(Math.sin(i * 0.35 + 0.5)))
          }
          width={waveformWidth}
          height={isIPad ? 104 : 76}
          progress={waveformProgress}
        />
      </View>

      {/* ── Transport ────────────────────────────────────────────── */}
      <View style={[st.transportCard, isIPad && st.transportCardIPad]}>
        {/* Time + BPM */}
        <View style={st.timeRow}>
          <Text style={[st.timePos, isIPad && st.timePosIPad]}>{formatTime(displayPos)}</Text>
          <Text style={st.timeSep}>/</Text>
          <Text style={[st.timeDur, isIPad && { fontSize: 22 }]}>{formatTime(duration)}</Text>
          {displayBpm ? (
            <View style={st.bpmBadge}>
              <Text style={st.bpmText}>{displayBpm} BPM</Text>
            </View>
          ) : null}
        </View>

        {/* Seek slider */}
        <Slider
          style={st.seekSlider}
          minimumValue={0}
          maximumValue={Math.max(duration, 1)}
          value={displayPos}
          minimumTrackTintColor={isWorship ? '#A78BFA' : '#6366F1'}
          maximumTrackTintColor="#1F2937"
          thumbTintColor="#E5E7EB"
          onSlidingStart={v => { setIsSeeking(true); setSeekValue(v); }}
          onValueChange={v => setSeekValue(v)}
          onSlidingComplete={v => { setIsSeeking(false); setPosition(v); audioEngine.seek(v); }}
        />

        {/* Buttons: stop | play/pause | tap tempo */}
        <View style={st.transportBtns}>
          <TouchableOpacity style={st.stopBtn} onPress={handleStop} activeOpacity={0.7}>
            <Text style={st.stopIcon}>⏹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.playBtn, isWorship && st.playBtnWorship, isIPad && st.playBtnIPad]}
            onPress={handlePlayPause}
            activeOpacity={0.7}
          >
            <Text style={[st.playIcon, isIPad && { fontSize: 30 }]}>
              {isActive ? '⏸' : '▶'}
            </Text>
          </TouchableOpacity>

          {/* Tap Tempo button */}
          <TouchableOpacity
            style={[st.tapBtn, isIPad && st.tapBtnIPad]}
            onPress={handleTapTempo}
            activeOpacity={0.7}
          >
            <Text style={st.tapBtnLabel}>TAP</Text>
            {detectedBpm
              ? <Text style={st.tapBpmDetected}>{detectedBpm}</Text>
              : <Text style={st.tapBpmHint}>tempo</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Section Navigator ─────────────────────────────────────── */}
      <View style={[st.sectionCard, isIPad && st.sectionCardIPad]}>
        <Text style={st.sectionCardLabel}>SECTIONS</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.sectionPills}
        >
          {sections.map(sec => {
            const isSec = activeSection === sec;
            return (
              <TouchableOpacity
                key={sec}
                style={[
                  st.sectionPill,
                  isSec && st.sectionPillActive,
                  isIPad && st.sectionPillIPad,
                ]}
                onPress={() => handleSectionPress(sec)}
                activeOpacity={0.7}
              >
                <Text style={[
                  st.sectionPillText,
                  isSec && st.sectionPillTextActive,
                  isIPad && { fontSize: 14 },
                ]}>
                  {sec}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={st.sectionHintRow}>
          <Text style={st.sectionHint}>1× queue  ·  2× loop  ·  3× free</Text>
          {activeSection && (
            <Text style={st.sectionActiveLabel}>{activeSection}</Text>
          )}
        </View>
      </View>

      {/* ── AI Flow Suggestion (from Kimi engine) ─────────────────── */}
      {aiSuggestion && (
        <View style={[st.aiCard, isIPad && st.aiCardIPad]}>
          <Text style={st.aiIconText}>🤖</Text>
          <View style={st.aiBody}>
            <Text style={st.aiReason}>{aiSuggestion.reason}</Text>
            <Text style={st.aiSuggest}>
              Try{' '}
              <Text style={st.aiSuggestSection}>{aiSuggestion.section}</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={st.aiAcceptBtn}
            onPress={() => {
              handleSectionPress(aiSuggestion.section);
              setAiSuggestion(null);
            }}
          >
            <Text style={st.aiAcceptText}>Accept →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAiSuggestion(null)} hitSlop={10}>
            <Text style={st.aiDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Worship Controls row ──────────────────────────────────── */}
      <View style={[st.controlsRow, isIPad && st.controlsRowIPad]}>
        {/* Loop Section */}
        <TouchableOpacity
          style={[
            st.ctrlBtn,
            engineState === ENGINE_STATE.LOOPING && st.ctrlBtnLoopActive,
            isIPad && st.ctrlBtnIPad,
          ]}
          onPress={handleLoopSection}
          activeOpacity={0.7}
        >
          <Text style={st.ctrlBtnIcon}>🔁</Text>
          <Text style={[
            st.ctrlBtnLabel,
            engineState === ENGINE_STATE.LOOPING && { color: '#60A5FA' },
          ]}>
            {engineState === ENGINE_STATE.LOOPING ? 'LOOPING' : 'LOOP'}
          </Text>
        </TouchableOpacity>

        {/* Worship Loop */}
        <TouchableOpacity
          style={[
            st.ctrlBtn,
            isWorship && st.ctrlBtnWorshipActive,
            isIPad && st.ctrlBtnIPad,
          ]}
          onPress={handleWorshipFree}
          activeOpacity={0.7}
        >
          <Text style={st.ctrlBtnIcon}>{isWorship ? '✨' : '🎶'}</Text>
          <Text style={[st.ctrlBtnLabel, isWorship && { color: '#A78BFA' }]}>
            {isWorship ? 'FREE ON' : 'FREE'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Emergency Clear (from Kimi engine) ───────────────────── */}
      <TouchableOpacity
        style={[st.emergencyBtn, isIPad && st.emergencyBtnIPad]}
        onPress={handleEmergencyClear}
        activeOpacity={0.8}
      >
        <Text style={st.emergencyIcon}>🚨</Text>
        <View>
          <Text style={st.emergencyLabel}>EMERGENCY CLEAR</Text>
          <Text style={st.emergencySub}>Mute all stems instantly</Text>
        </View>
      </TouchableOpacity>

      {/* ── AI Mix Recommendations ────────────────────────────── */}
      <TouchableOpacity
        style={[st.emergencyBtn, { backgroundColor: '#1e1b4b', borderColor: '#6366f1' }, isIPad && st.emergencyBtnIPad]}
        onPress={handleAIMixAdvice}
        disabled={aiMixLoading}
        activeOpacity={0.8}
      >
        <Text style={st.emergencyIcon}>{aiMixLoading ? '⏳' : '🤖'}</Text>
        <View>
          <Text style={[st.emergencyLabel, { color: '#818cf8' }]}>AI MIX ADVICE</Text>
          <Text style={[st.emergencySub, { color: '#4f46e5' }]}>CineStage mix recommendations</Text>
        </View>
      </TouchableOpacity>

      {aiMixTips && (
        <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: '#0f172a', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#4f46e5' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: '#818cf8', fontSize: 12, fontWeight: '600' }}>🎛 Mix Recommendations</Text>
            <TouchableOpacity onPress={() => setAiMixTips(null)}>
              <Text style={{ color: '#475569', fontSize: 12 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 18 }}>
            {typeof aiMixTips === 'string' ? aiMixTips : JSON.stringify(aiMixTips, null, 2)}
          </Text>
        </View>
      )}

      {/* ── Solo banner ───────────────────────────────────────────── */}
      {anySolo && (
        <View style={st.soloBanner}>
          <Text style={st.soloText}>Solo active — only soloed tracks are audible</Text>
        </View>
      )}

      {/* ── Stem Mixer ────────────────────────────────────────────── */}
      <View style={st.mixerHeader}>
        <Text style={st.mixerTitle}>STEM MIXER</Text>
        <Text style={st.mixerCount}>{tracks.length} channels</Text>
      </View>

      {isWorship && (
        <View style={st.worshipBanner}>
          <Text style={st.worshipBannerText}>
            ✨  Worship Free — PADs up · LEAD soft · RHYTHM faded
          </Text>
        </View>
      )}

      {tracks.map(item => (
        <TrackCard
          key={item.id}
          item={item}
          onUpdate={updateTrack}
          isWorship={isWorship}
          isIPad={isIPad}
        />
      ))}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  scroll:    { padding: 16, paddingTop: 14 },
  scrollIPad:{ padding: 20, paddingTop: 16 },

  center: {
    flex: 1, backgroundColor: '#020617',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  emptyTitle:   { color: '#F9FAFB', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyCaption: { color: '#6B7280', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  backBtn:     { marginTop: 24, backgroundColor: '#1F2937', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 11 },
  backBtnText: { color: '#E5E7EB', fontSize: 14 },

  // ── Header
  header:         { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  headerLeft:     { flex: 1, marginRight: 12 },
  songTitle:      { color: '#F9FAFB', fontSize: 20, fontWeight: '800' },
  songTitleIPad:  { fontSize: 26 },
  songMeta:       { color: '#6B7280', fontSize: 12, marginTop: 3 },
  headerRight:    { alignItems: 'flex-end', gap: 6 },
  midiPill:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: '#052E16', borderWidth: 1, borderColor: '#166534' },
  midiDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  midiLabel:      { fontSize: 9, fontWeight: '800', color: '#4ADE80', letterSpacing: 0.5 },
  stateBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  stateDot:       { width: 8, height: 8, borderRadius: 4 },
  stateLabel:     { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },

  // ── Waveform
  waveformCard:        { backgroundColor: '#0B1120', borderRadius: 14, borderWidth: 1, borderColor: '#1F2937', padding: 10, alignItems: 'center', overflow: 'hidden', marginBottom: 12 },
  waveformCardWorship: { borderColor: '#7C3AED55', backgroundColor: '#0D0720' },

  // ── Transport
  transportCard:     { backgroundColor: '#0B1120', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#1F2937', marginBottom: 12 },
  transportCardIPad: { padding: 22 },
  timeRow:    { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 2 },
  timePos:    { color: '#F9FAFB', fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timePosIPad:{ fontSize: 40 },
  timeSep:    { color: '#374151', fontSize: 24 },
  timeDur:    { color: '#6B7280', fontSize: 20, fontVariant: ['tabular-nums'] },
  bpmBadge:   { marginLeft: 8, backgroundColor: '#1F2937', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  bpmText:    { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },
  seekSlider: { height: 42, marginHorizontal: -6, marginTop: 4 },
  transportBtns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 16 },
  stopBtn:    { width: 50, height: 50, borderRadius: 25, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' },
  stopIcon:   { fontSize: 20, color: '#9CA3AF' },
  playBtn:    { width: 70, height: 70, borderRadius: 35, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  playBtnWorship: { backgroundColor: '#7C3AED' },
  playBtnIPad:{ width: 82, height: 82, borderRadius: 41 },
  playIcon:   { fontSize: 28, color: '#FFF' },
  tapBtn:     { backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', minWidth: 68, borderWidth: 1, borderColor: '#1F2937' },
  tapBtnIPad: { minWidth: 84, paddingVertical: 13 },
  tapBtnLabel:    { color: '#6366F1', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  tapBpmDetected: { color: '#A5B4FC', fontSize: 18, fontWeight: '700', marginTop: 2 },
  tapBpmHint:     { color: '#374151', fontSize: 11, marginTop: 2 },

  // ── Section Navigator
  sectionCard:     { backgroundColor: '#0B1120', borderRadius: 14, borderWidth: 1, borderColor: '#1F2937', padding: 14, marginBottom: 10 },
  sectionCardIPad: { padding: 16 },
  sectionCardLabel:{ color: '#4B5563', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  sectionPills:    { flexDirection: 'row', gap: 8, paddingRight: 8 },
  sectionPill:     { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151' },
  sectionPillActive:{ backgroundColor: '#1E1B4B', borderColor: '#6366F1' },
  sectionPillIPad: { paddingHorizontal: 22, paddingVertical: 11 },
  sectionPillText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  sectionPillTextActive: { color: '#A5B4FC', fontWeight: '800' },
  sectionHintRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  sectionHint:       { color: '#374151', fontSize: 10, letterSpacing: 0.3 },
  sectionActiveLabel:{ color: '#6B7280', fontSize: 10, fontWeight: '600' },

  // ── AI Suggestion
  aiCard:     { backgroundColor: '#0F0818', borderRadius: 14, borderWidth: 1, borderColor: '#4C1D9555', padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiCardIPad: { padding: 18 },
  aiIconText: { fontSize: 24 },
  aiBody:     { flex: 1 },
  aiReason:   { color: '#6B7280', fontSize: 11, marginBottom: 2 },
  aiSuggest:  { color: '#D1D5DB', fontSize: 15, fontWeight: '600' },
  aiSuggestSection: { color: '#A78BFA', fontWeight: '800' },
  aiAcceptBtn:  { backgroundColor: '#3B0764', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#7C3AED55' },
  aiAcceptText: { color: '#C4B5FD', fontWeight: '700', fontSize: 13 },
  aiDismiss:    { color: '#374151', fontSize: 18, paddingHorizontal: 4 },

  // ── Controls row (Loop + Worship)
  controlsRow:          { flexDirection: 'row', gap: 10, marginBottom: 10 },
  controlsRowIPad:      { gap: 16, marginBottom: 14 },
  ctrlBtn:              { flex: 1, backgroundColor: '#0B1120', borderRadius: 14, borderWidth: 1, borderColor: '#1F2937', paddingVertical: 16, alignItems: 'center', gap: 6 },
  ctrlBtnIPad:          { paddingVertical: 20 },
  ctrlBtnLoopActive:    { backgroundColor: '#0D1E3D', borderColor: '#3B82F660' },
  ctrlBtnWorshipActive: { backgroundColor: '#120720', borderColor: '#7C3AED60' },
  ctrlBtnIcon:  { fontSize: 24 },
  ctrlBtnLabel: { color: '#6B7280', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  // ── Emergency Clear
  emergencyBtn:     { backgroundColor: '#1C0505', borderRadius: 14, borderWidth: 1, borderColor: '#EF444440', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 18 },
  emergencyBtnIPad: { padding: 20, borderRadius: 16 },
  emergencyIcon:    { fontSize: 26 },
  emergencyLabel:   { color: '#EF4444', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  emergencySub:     { color: '#7F1D1D', fontSize: 11, marginTop: 1 },

  // ── Solo banner
  soloBanner: { backgroundColor: '#1C1917', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#FBBF2440', marginBottom: 12 },
  soloText:   { color: '#FBBF24', fontSize: 12, textAlign: 'center', fontWeight: '600' },

  // ── Mixer section header
  mixerHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  mixerTitle:  { color: '#4B5563', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  mixerCount:  { color: '#374151', fontSize: 11 },

  // ── Worship mode banner (above stems)
  worshipBanner:     { backgroundColor: '#120720', borderRadius: 10, borderWidth: 1, borderColor: '#7C3AED40', padding: 10, marginBottom: 10, alignItems: 'center' },
  worshipBannerText: { color: '#A78BFA', fontSize: 12, fontWeight: '600' },

  // ── Track Channel Card
  trackCard:             { backgroundColor: '#0B1120', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#111827' },
  trackCardIPad:         { padding: 18, borderRadius: 16 },
  trackCardWorshipGlow:  { backgroundColor: '#130A22', borderColor: '#7C3AED55' },
  trackCardWorshipDim:   { backgroundColor: '#080C14', borderColor: '#0F172A', opacity: 0.55 },
  trackRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorBar:    { width: 4, height: 38, borderRadius: 2, marginRight: 4 },
  trackName:   { flex: 1, color: '#F9FAFB', fontWeight: '700', fontSize: 15 },
  trackNameIPad:{ fontSize: 17 },
  trackNameDim: { color: '#4B5563' },
  roleBadge:   { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, marginRight: 4 },
  roleText:    { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  smBtns:      { flexDirection: 'row', gap: 6 },
  smBtn:       { width: 36, height: 36, borderRadius: 8, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' },
  smBtnIPad:   { width: 42, height: 42, borderRadius: 10 },
  smBtnSolo:   { backgroundColor: '#FBBF24' },
  smBtnMute:   { backgroundColor: '#EF4444' },
  smLabel:     { color: '#9CA3AF', fontWeight: '800', fontSize: 12 },
  smLabelActive:{ color: '#000' },
  volPct:      { width: 46, color: '#6B7280', fontSize: 12, textAlign: 'right', fontVariant: ['tabular-nums'] },
  volSlider:   { height: 42, marginTop: 8, marginHorizontal: -4 },
  volSliderIPad:{ height: 52 },
});
