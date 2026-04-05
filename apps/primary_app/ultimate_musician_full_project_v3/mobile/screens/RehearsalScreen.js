import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import Slider from "@react-native-community/slider";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { SYNC_URL, CINESTAGE_URL, syncHeaders } from "./config";
import * as audioEngine from "../audioEngine";
import CineStageProcessingOverlay from "../components/CineStageProcessingOverlay";
import StemChannelStrip from "../components/StemChannelStrip";
import WaveformTimeline from "../components/WaveformTimeline";
import { resolvePadUrl } from "../services/audioGuide";
import {
  startSequence,
  stopSequence,
  stopSequencePad,
  startSequencePad,
  scheduleCuesFromPosition,
} from "../services/liveSequencer";
import {
  mergeSuggestedMarkers,
  suggestAiMarkers,
} from "../services/markerAiAssist";
import {
  buildMarkersFromSections,
  diffArmedPipelines,
  getArmedPipelineHistory,
  GRID_MODES,
  markerTemplate,
  quantizeTime,
  saveArmedPipeline,
  updateMarkerRange,
} from "../services/rehearsalPipelineStore";
import { resolveRoleFilteredTracks } from "../services/roleStemRouter";
import { broadcastWorshipFreelyEvent } from "../services/worshipFlowService";
import {
  buildJumpTargets,
  buildTransientMarkers,
  LAUNCH_QUANTIZATION_MODES,
  downsamplePeaks,
  normalizeWaveformPeaks,
  processPeaksForDisplay,
  TRANSITION_MODES,
} from "../services/wavePipelineEngine";
import { useResponsive } from "../utils/responsive";
import { addOrUpdateSong, getSongs } from "../data/storage";
import { speak } from "../services/voiceGuide";
import { parseSectionsForWaveform } from "../utils/parseSectionsForWaveform";
import {
  hasBackendStemEntries,
  normalizeBackendStemEntries,
} from "../utils/stemPayload";

// ── Chromatic notes ───────────────────────────────────────────────────────────
const CHROMATIC_NOTES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const NOTE_FREQS = {
  C: 261.63,
  "C#": 277.18,
  D: 293.66,
  "D#": 311.13,
  E: 329.63,
  F: 349.23,
  "F#": 369.99,
  G: 392.0,
  "G#": 415.3,
  A: 440.0,
  "A#": 466.16,
  B: 493.88,
};

const MARKER_TYPES = [
  { id: "section", label: "Section", color: "#6366F1" },
  { id: "cue", label: "Cue", color: "#F59E0B" },
  { id: "jump", label: "Jump", color: "#22D3EE" },
  { id: "loop", label: "Loop", color: "#10B981" },
];
const DEFAULT_MARKER_TYPE = "cue";

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes) {
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (b1 << 16) | (b2 << 8) | b3;
    output += BASE64_CHARS[(triplet >> 18) & 63];
    output += BASE64_CHARS[(triplet >> 12) & 63];
    output += i + 1 < bytes.length ? BASE64_CHARS[(triplet >> 6) & 63] : "=";
    output += i + 2 < bytes.length ? BASE64_CHARS[triplet & 63] : "=";
  }
  return output;
}

// Generate a 1.5s sine wave as a base64 WAV data URI
function makeSineWavBase64(freq) {
  const sr = 22050;
  const dur = 1.5;
  const n = Math.floor(sr * dur);
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  function wr(o, s) {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  }
  function u32(o, v) {
    view.setUint32(o, v, true);
  }
  function u16(o, v) {
    view.setUint16(o, v, true);
  }
  wr(0, "RIFF");
  u32(4, 36 + n * 2);
  wr(8, "WAVEfmt ");
  u32(16, 16);
  u16(20, 1);
  u16(22, 1);
  u32(24, sr);
  u32(28, sr * 2);
  u16(32, 2);
  u16(34, 16);
  wr(36, "data");
  u32(40, n * 2);
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < n; i++) {
    let s = Math.sin((2 * Math.PI * freq * i) / sr);
    if (i < fade) s *= i / fade;
    if (i > n - fade) s *= (n - i) / fade;
    view.setInt16(44 + i * 2, Math.round(s * 28000), true);
  }
  const bytes = new Uint8Array(buf);
  return "data:audio/wav;base64," + bytesToBase64(bytes);
}

async function safeGetAvailableInputsAsync() {
  // expo-av does not expose input selection APIs in all builds
  // eslint-disable-next-line import/namespace
  const fn = Audio.getAvailableInputsAsync;
  if (typeof fn !== "function") return [];
  try {
    const inputs = await fn();
    return inputs || [];
  } catch {
    return [];
  }
}

async function safeSetPreferredInputAsync(input) {
  // expo-av does not expose input selection APIs in all builds
  // eslint-disable-next-line import/namespace
  const fn = Audio.setPreferredInputAsync;
  if (typeof fn !== "function") return;
  try {
    await fn(input);
  } catch {}
}

function getMarkerTypeMeta(typeId) {
  return MARKER_TYPES.find((t) => t.id === typeId) || null;
}

function coerceMarkerType(typeId) {
  const id = String(typeId || "").toLowerCase();
  return MARKER_TYPES.some((t) => t.id === id) ? id : DEFAULT_MARKER_TYPE;
}

function applyMarkerType(marker, typeId) {
  const type = coerceMarkerType(typeId || marker?.type);
  const meta = getMarkerTypeMeta(type);
  return {
    ...marker,
    type,
    color: marker?.color || meta?.color || "#4F46E5",
  };
}

function normalizeMarkersForStorage(list) {
  return (list || [])
    .map((m, idx) => {
      const start = Math.max(0, Number(m?.start || 0));
      const end = Math.max(start + 0.2, Number(m?.end || start));
      const typed = applyMarkerType(m, m?.type);
      return {
        ...typed,
        id: String(m?.id || `mk_${idx}`),
        label: String(m?.label || "Marker"),
        start,
        end,
      };
    })
    .sort((a, b) => a.start - b.start);
}

function normalizeSectionsForStorage(list) {
  if (list === null) return null;
  return (Array.isArray(list) ? list : [])
    .map((sec, idx) => ({
      id: String(sec?.sectionRef || sec?.id || `sec_${idx}`),
      label: String(sec?.label || `Section ${idx + 1}`),
      timeSec: Math.max(0, Number(sec?.timeSec ?? sec?.positionSeconds ?? 0)),
      color: sec?.color || "#6366F1",
    }))
    .sort((a, b) => a.timeSec - b.timeSec);
}

function readCueMarkerTimeSec(cue = {}) {
  const direct = Number(
    cue?.timeSec ??
      cue?.positionSeconds ??
      cue?.time ??
      cue?.start ??
      cue?.startSec,
  );
  if (Number.isFinite(direct) && direct >= 0) return direct;

  const msValue = Number(cue?.time_ms ?? cue?.start_ms);
  if (Number.isFinite(msValue) && msValue >= 0) return msValue / 1000;

  return null;
}

function readCueMarkerEndSec(cue = {}) {
  const direct = Number(
    cue?.endTimeSec ??
      cue?.end ??
      cue?.endSec,
  );
  if (Number.isFinite(direct) && direct >= 0) return direct;

  const msValue = Number(cue?.end_ms);
  if (Number.isFinite(msValue) && msValue >= 0) return msValue / 1000;

  return null;
}

function buildMarkersFromAnalysisCues(cues = [], durationSec = 0) {
  const total = Math.max(Number(durationSec || 0), 1);
  const sorted = (Array.isArray(cues) ? cues : [])
    .map((cue) => ({
      ...cue,
      timeSec:
        readCueMarkerTimeSec(cue) ??
        Number(cue?.positionSeconds || 0),
      endSec: readCueMarkerEndSec(cue),
    }))
    .filter((cue) => Number.isFinite(cue.timeSec))
    .sort((a, b) => a.timeSec - b.timeSec);

  return sorted.map((cue, index) => {
    const nextCue = sorted[index + 1];
    const type = coerceMarkerType(cue?.type || "cue");
    const fallbackEnd = nextCue?.timeSec ?? cue.timeSec + 4;
    const end = Math.min(
      total,
      Math.max(cue.timeSec + 0.5, cue.endSec ?? fallbackEnd),
    );
    return applyMarkerType(
      {
        ...markerTemplate(
          cue?.label || `Cue ${index + 1}`,
          cue.timeSec,
          end,
          cue?.color,
        ),
        id: String(cue?.id || `mk_ai_${index}`),
        sectionRef: cue?.sectionRef || cue?.section_id || null,
      },
      type,
    );
  });
}

const LOAD_STEPS = ["Initializing audio", "Loading stems", "Ready"];
const AUTOMATION_EVENT_TYPES = ["MIDI", "LIGHTS", "LYRICS"];
const SAFETY_MODES = ["strict", "guided", "tech"];
const SONG_TRANSITION_MODES = [
  { key: "wait", label: "Stop & Wait" },
  { key: "smooth", label: "Smooth Crossfade" },
];
const TIME_SIGS = ["4/4", "3/4", "6/8", "2/4", "12/8", "5/4", "7/8"];

const STEM_TRACK_TYPES = [
  { id: "vocal", label: "Vocal", icon: "🎤", color: "#EC4899" },
  { id: "guitar", label: "Guitar", icon: "🎸", color: "#F59E0B" },
  { id: "keys", label: "Keys", icon: "🎹", color: "#6366F1" },
  { id: "drums", label: "Drums", icon: "🥁", color: "#10B981" },
  { id: "bass", label: "Bass", icon: "🎛", color: "#0EA5E9" },
  { id: "brass", label: "Brass", icon: "🎺", color: "#F97316" },
  { id: "strings", label: "Strings", icon: "🎻", color: "#A78BFA" },
  { id: "other", label: "Other", icon: "🎵", color: "#6B7280" },
];

// Role type detection
const VOCAL_ROLES = new Set([
  "worship_leader",
  "lead_vocal",
  "bgv_1",
  "bgv_2",
  "bgv_3",
  "soprano",
  "contralto",
  "tenor",
  "vocals",
  "lead vocal",
  "background vocal",
  "bgv",
]);
const MUSICIAN_ROLES = new Set([
  "keyboard",
  "piano",
  "synth",
  "electric_guitar",
  "rhythm_guitar",
  "acoustic_guitar",
  "bass",
  "drums",
  "percussion",
  "strings",
  "brass",
  "guitar",
  "keys",
  "music_director",
]);
const WORSHIP_FLOW_BROADCAST_ROLES = new Set([
  "admin",
  "org_owner",
  "worship_leader",
  "md",
  "music_director",
]);
const ROLE_DISPLAY_NAME = {
  worship_leader: "Worship Leader",
  lead_vocal: "Lead Vocal",
  bgv_1: "BGV 1",
  bgv_2: "BGV 2",
  bgv_3: "BGV 3",
  soprano: "Soprano",
  contralto: "Contralto",
  tenor: "Tenor",
  keyboard: "Keyboard",
  piano: "Piano",
  synth: "Synth",
  electric_guitar: "Electric Guitar",
  rhythm_guitar: "Rhythm Guitar",
  acoustic_guitar: "Acoustic Guitar",
  bass: "Bass",
  drums: "Drums",
  percussion: "Percussion",
  strings: "Strings",
  brass: "Brass",
  keys: "Keys",
  guitar: "Guitar",
  music_director: "Music Director",
};

function canBroadcastWorshipFlow(role) {
  return WORSHIP_FLOW_BROADCAST_ROLES.has(
    String(role || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_"),
  );
}

const VOCAL_PART_LABELS = {
  lead: "Lead Vocal",
  soprano: "Soprano",
  mezzo: "Mezzo",
  alto: "Alto",
  tenor: "Tenor",
  baritone: "Baritone",
  bass: "Bass",
  voice1: "1st Voice",
  voice2: "2nd Voice",
  voice3: "3rd Voice",
  voice4: "4th Voice",
  voice5: "5th Voice",
};
const VOCAL_PART_COLORS = {
  lead: "#F59E0B",
  soprano: "#EC4899",
  mezzo: "#C026D3",
  alto: "#9333EA",
  tenor: "#6366F1",
  baritone: "#3B82F6",
  bass: "#0EA5E9",
  voice1: "#EC4899",
  voice2: "#C026D3",
  voice3: "#9333EA",
  voice4: "#6366F1",
  voice5: "#0EA5E9",
};

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

function buildTracks(result, localStems) {
  const backendTracks = normalizeBackendStemEntries(result);
  if (backendTracks.length > 0) {
    return backendTracks.map((track) => ({
      id: track.id,
      type: track.type,
      label: track.label,
      mute: false,
      solo: false,
      armed: false,
      volume: 1,
    }));
  }

  // Fallback: build tracks from localStems (multitrack import)
  if (localStems && Object.keys(localStems).length > 0) {
    return Object.entries(localStems).map(([slotName, info]) => ({
      id: slotName,
      type: slotName.toLowerCase().replace(/\s+/g, "_"),
      label: slotName.charAt(0).toUpperCase() + slotName.slice(1),
      uri: typeof info === "string" ? info : info?.localUri || null,
      mute: false,
      solo: false,
      armed: false,
      volume: 1,
    }));
  }

  return [];
}

// ── DAW Channel Strip — Ableton-style ─────────────────────────────────────────
const DAW_STEM_COLORS = {
  vocals: "#F472B6", drums: "#34D399", bass: "#60A5FA", keys: "#A78BFA",
  guitars: "#FB923C", strings: "#FCD34D", click: "#94A3B8", other: "#FBBF24",
  pad: "#C084FC", synth: "#818CF8", piano: "#60A5FA", organ: "#34D399",
  loop: "#FBBF24", arpej: "#A78BFA", pluck: "#A78BFA",
};
function dawStemColor(id) {
  const k = (id || "").toLowerCase().split(/[\s_]/)[0];
  return DAW_STEM_COLORS[k] || "#6366F1";
}
function volToDb(v) {
  if (v <= 0) return "-∞";
  const db = Math.round(20 * Math.log10(Math.max(v, 0.001)));
  return `${db > 0 ? "+" : ""}${db}`;
}

// Layout constants — strip is 76px wide, 242px tall
const DAW_STRIP_W = 80;
const DAW_STRIP_H = 242;
const DAW_NAME_W = 24;      // width of the vertical name column
const DAW_NUM_LEDS = 9;     // VU meter LED count
const VF_H = 118;           // fader track height in px
const VF_KNOB_H = 20;       // fader knob height
const VF_RAIL_W = 3;        // fader rail width

function formatVerticalTrackLabel(label) {
  const cleaned = String(label || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  return cleaned
    .split('')
    .map((char) => (char === ' ' ? '·' : char))
    .join('\n');
}

// ── Marker Timeline Ruler ─────────────────────────────────────────────────────
function MarkerRuler({ markers, duration, position, selectedId, onSelect, onMove }) {
  const [railW, setRailW] = useState(320);
  const railWRef   = useRef(320);
  const durationRef = useRef(duration);
  const markersRef  = useRef(markers);
  durationRef.current = duration;
  markersRef.current  = markers;
  const draggingIdRef = useRef(null);
  const dragBaseRef   = useRef(0);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (evt) => {
      const x   = evt.nativeEvent.locationX;
      const rw  = railWRef.current;
      const dur = durationRef.current;
      if (dur <= 0) return;
      const touchSec = (x / rw) * dur;
      const threshold = dur * 0.06;
      let closest = null, closestDist = Infinity;
      for (const m of markersRef.current) {
        const dist = Math.abs(m.start - touchSec);
        if (dist < threshold && dist < closestDist) { closest = m; closestDist = dist; }
      }
      if (closest) {
        draggingIdRef.current = closest.id;
        dragBaseRef.current   = closest.start;
        onSelect(closest.id);
      }
    },
    onPanResponderMove: (_, gs) => {
      const id = draggingIdRef.current; if (!id) return;
      const rw  = railWRef.current;
      const dur = durationRef.current;
      const sec = Math.max(0, Math.min(dur, dragBaseRef.current + (gs.dx / rw) * dur));
      onMove(id, sec, false);
    },
    onPanResponderRelease: (_, gs) => {
      const id = draggingIdRef.current; if (!id) return;
      const rw  = railWRef.current;
      const dur = durationRef.current;
      const sec = Math.max(0, Math.min(dur, dragBaseRef.current + (gs.dx / rw) * dur));
      onMove(id, sec, true);
      draggingIdRef.current = null;
    },
  })).current;

  const pct = (sec) => (duration > 0 ? Math.max(0, Math.min(1, sec / duration)) : 0);

  return (
    <View
      style={mrSt.rail}
      onLayout={(e) => { const w = e.nativeEvent.layout.width; setRailW(w); railWRef.current = w; }}
      {...pan.panHandlers}
    >
      {/* time tick marks every ~10% */}
      {[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9].map((p) => (
        <View key={p} style={[mrSt.tick, { left: p * railW }]} />
      ))}

      {/* marker flags */}
      {[...markers].sort((a, b) => a.start - b.start).map((m) => {
        const color    = m.color || '#6366F1';
        const selected = m.id === selectedId;
        const left     = pct(m.start) * railW;
        return (
          <View key={m.id} style={[mrSt.pinWrap, { left }]} pointerEvents="none">
            <View style={[mrSt.flag, {
              backgroundColor: selected ? color : color + '55',
              borderColor: color,
            }]}>
              <Text style={mrSt.flagTxt} numberOfLines={1}>{m.label}</Text>
            </View>
            <View style={[mrSt.pin, { backgroundColor: color, opacity: selected ? 1 : 0.55 }]} />
          </View>
        );
      })}

      {/* playhead */}
      <View style={[mrSt.playhead, { left: pct(position) * railW }]} pointerEvents="none" />
    </View>
  );
}

const mrSt = StyleSheet.create({
  rail: {
    height: 70,
    backgroundColor: '#060D18',
    borderRadius: 6,
    marginHorizontal: 10,
    marginBottom: 6,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#111827',
  },
  pinWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    width: 64,
    marginLeft: -32,
  },
  flag: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 3,
    maxWidth: 62,
    alignSelf: 'center',
    marginTop: 5,
  },
  flagTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
  },
  pin: {
    width: 2,
    flex: 1,
    marginTop: 2,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#F59E0B',
  },
});

// ── Custom vertical fader with PanResponder ───────────────────────────────────
function VerticalFader({ value = 1, color = "#6366F1", muted = false, onChange, onDone, aiLevel = null }) {
  const [thumbY, setThumbY] = useState(
    () => Math.round((1 - Math.min(1, Math.max(0, value))) * (VF_H - VF_KNOB_H))
  );
  const volRef = useRef(value);

  useEffect(() => {
    const y = Math.round((1 - Math.min(1, Math.max(0, value))) * (VF_H - VF_KNOB_H));
    setThumbY(y);
    volRef.current = value;
  }, [value]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const y = Math.min(VF_H - VF_KNOB_H, Math.max(0, evt.nativeEvent.locationY - VF_KNOB_H / 2));
        const v = 1 - y / (VF_H - VF_KNOB_H);
        volRef.current = v;
        setThumbY(Math.round(y));
        onChange?.(v);
      },
      onPanResponderMove: (evt) => {
        const y = Math.min(VF_H - VF_KNOB_H, Math.max(0, evt.nativeEvent.locationY - VF_KNOB_H / 2));
        const v = 1 - y / (VF_H - VF_KNOB_H);
        volRef.current = v;
        setThumbY(Math.round(y));
        onChange?.(v);
      },
      onPanResponderRelease: () => { onDone?.(volRef.current); },
    })
  ).current;

  const DB_TICKS = [
    { v: 1.0, label: "0" },
    { v: 0.71, label: "-3" },
    { v: 0.5,  label: "-6" },
    { v: 0.25, label: "-12" },
    { v: 0.06, label: "-24" },
  ];

  return (
    <View style={{ width: 48, height: VF_H }} {...pan.panHandlers}>
      {/* dB scale on left */}
      {DB_TICKS.map(({ v, label }) => {
        const ty = Math.round((1 - v) * (VF_H - VF_KNOB_H) + VF_KNOB_H / 2);
        return (
          <Text
            key={label}
            style={{
              position: "absolute",
              left: 0,
              top: ty - 5,
              width: 16,
              fontSize: 7,
              fontWeight: "700",
              color: "#374151",
              textAlign: "right",
            }}
          >
            {label}
          </Text>
        );
      })}
      {/* Fader rail */}
      <View
        style={{
          position: "absolute",
          left: 22,
          top: VF_KNOB_H / 2,
          width: VF_RAIL_W,
          height: VF_H - VF_KNOB_H,
          backgroundColor: "#0F172A",
          borderRadius: 2,
        }}
      />
      {/* Filled rail — from knob bottom to rail bottom */}
      <View
        style={{
          position: "absolute",
          left: 22,
          top: thumbY + VF_KNOB_H,
          width: VF_RAIL_W,
          height: Math.max(0, VF_H - VF_KNOB_H - thumbY),
          backgroundColor: muted ? "#1E293B" : color + "55",
          borderRadius: 2,
        }}
      />
      {/* Tick marks */}
      {DB_TICKS.map(({ v, label }) => {
        const ty = Math.round((1 - v) * (VF_H - VF_KNOB_H) + VF_KNOB_H / 2);
        return (
          <View
            key={"tick_" + label}
            style={{
              position: "absolute",
              left: 18,
              top: ty,
              width: 9,
              height: 1,
              backgroundColor: "#1E2740",
            }}
          />
        );
      })}
      {/* Knob */}
      <View
        style={{
          position: "absolute",
          left: 17,
          top: thumbY,
          width: 14,
          height: VF_KNOB_H,
          backgroundColor: muted ? "#1A2233" : "#1E293B",
          borderRadius: 3,
          borderWidth: 1.5,
          borderColor: muted ? "#374151" : color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Center grip line on knob */}
        <View
          style={{
            width: "65%",
            height: 1.5,
            backgroundColor: muted ? "#4B5563" : color,
            borderRadius: 1,
          }}
        />
      </View>
      {/* AI suggested level tick */}
      {aiLevel != null && (() => {
        const aiY = Math.round((1 - Math.min(1, Math.max(0, aiLevel))) * (VF_H - VF_KNOB_H) + VF_KNOB_H / 2);
        return (
          <View pointerEvents="none" style={{ position: 'absolute', left: 14, right: 0, top: aiY - 1 }}>
            <View style={{ height: 2, backgroundColor: color, opacity: 0.7, borderRadius: 1 }} />
            <Text style={{ position: 'absolute', right: 2, top: -6, fontSize: 6, color, fontWeight: '900', opacity: 0.8 }}>AI</Text>
          </View>
        );
      })()}
    </View>
  );
}

// ── Section-aware AI mix presets ─────────────────────────────────────────────
const SECTION_MIX_PRESETS = {
  intro:        { vocals: 0.55, drums: 0.40, bass: 0.50, keys: 0.50, guitars: 0.45, other: 0.45 },
  verse:        { vocals: 0.88, drums: 0.62, bass: 0.70, keys: 0.60, guitars: 0.60, other: 0.50 },
  'pre-chorus': { vocals: 0.85, drums: 0.72, bass: 0.75, keys: 0.68, guitars: 0.68, other: 0.55 },
  chorus:       { vocals: 1.00, drums: 0.90, bass: 0.85, keys: 0.78, guitars: 0.82, other: 0.65 },
  bridge:       { vocals: 0.82, drums: 0.65, bass: 0.62, keys: 0.72, guitars: 0.60, other: 0.55 },
  outro:        { vocals: 0.68, drums: 0.48, bass: 0.52, keys: 0.50, guitars: 0.44, other: 0.40 },
  tag:          { vocals: 0.90, drums: 0.55, bass: 0.60, keys: 0.55, guitars: 0.52, other: 0.50 },
  vamp:         { vocals: 0.80, drums: 0.70, bass: 0.72, keys: 0.65, guitars: 0.65, other: 0.55 },
};

function inferTrackType(track) {
  const key = String(track?.label || track?.type || track?.id || '').toLowerCase();
  if (/vocal|vox|voice|lead|bgv|back/.test(key)) return 'vocals';
  if (/drum|kick|snare|perc/.test(key)) return 'drums';
  if (/bass/.test(key)) return 'bass';
  if (/key|piano|synth|organ|pad/.test(key)) return 'keys';
  if (/guitar|gtr|acous/.test(key)) return 'guitars';
  return 'other';
}

// ── EnergyCurveStrip ──────────────────────────────────────────────────────────
const EC_BAR_N = 60;
const EC_SECTION_ENERGY = {
  intro: 0.28, verse: 0.52, 'pre-chorus': 0.68,
  chorus: 0.92, bridge: 0.72, outro: 0.22, tag: 0.45, vamp: 0.58,
};

function EnergyCurveStrip({ performanceGraph, sections, positionSec, totalDuration }) {
  const bars = React.useMemo(() => {
    const total = Math.max(1, totalDuration);
    const perf = Array.isArray(performanceGraph) && performanceGraph.length > 0 ? performanceGraph : null;

    if (perf) {
      const maxE = Math.max(...perf.map(p => p.energy || p.value || 0), 0.01);
      const buckets = Array.from({ length: EC_BAR_N }, () => ({ sum: 0, count: 0 }));
      perf.forEach(p => {
        const idx = Math.min(EC_BAR_N - 1, Math.floor(((p.time_ms || 0) / 1000 / total) * EC_BAR_N));
        const e = Math.min(1, (p.energy || p.value || 0) / maxE);
        buckets[idx].sum += e;
        buckets[idx].count++;
      });
      return buckets.map(b => (b.count > 0 ? b.sum / b.count : 0));
    }

    const sortedSecs = Array.isArray(sections)
      ? [...sections].sort((a, b) => (a.timeSec || a.positionSeconds || 0) - (b.timeSec || b.positionSeconds || 0))
      : [];

    return Array.from({ length: EC_BAR_N }, (_, i) => {
      const pct = i / EC_BAR_N;
      let sec = null;
      for (const s of sortedSecs) {
        if ((s.timeSec || s.positionSeconds || 0) / total <= pct) sec = s;
        else break;
      }
      const lbl = String(sec?.label || '').toLowerCase().replace(/[\s]*\d+\s*$/, '').trim();
      const base = EC_SECTION_ENERGY[lbl] ?? 0.45;
      return Math.min(1, Math.max(0.06, base + Math.sin(i * 1.7) * 0.06));
    });
  }, [performanceGraph, sections, totalDuration]);

  const playheadPct = totalDuration > 0 ? Math.min(1, (positionSec || 0) / totalDuration) : 0;

  return (
    <View style={ecSt.container}>
      <Text style={ecSt.label}>ENERGY</Text>
      <View style={ecSt.chartArea}>
        {bars.map((e, i) => {
          const isPast = (i / EC_BAR_N) < playheadPct;
          const barColor = e > 0.8 ? '#EC4899' : e > 0.6 ? '#8B5CF6' : e > 0.35 ? '#6366F1' : '#1E3A5F';
          return (
            <View
              key={i}
              style={[ecSt.bar, {
                height: `${Math.max(8, e * 100)}%`,
                backgroundColor: barColor,
                opacity: isPast ? 0.4 : 0.9,
              }]}
            />
          );
        })}
        <View pointerEvents="none" style={[ecSt.playhead, { left: `${playheadPct * 100}%` }]} />
      </View>
    </View>
  );
}

const ecSt = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#030813',
  },
  label: {
    color: '#1E3A5F', fontSize: 7, fontWeight: '800', letterSpacing: 1.2,
    width: 38, textAlign: 'right', marginRight: 6,
  },
  chartArea: {
    flex: 1, height: 30, flexDirection: 'row', alignItems: 'flex-end',
    gap: 1, position: 'relative',
  },
  bar: { flex: 1, borderRadius: 1 },
  playhead: {
    position: 'absolute', top: 0, bottom: 0, width: 1.5,
    backgroundColor: 'rgba(248,250,252,0.5)',
  },
});

// ── DawChannelStrip ───────────────────────────────────────────────────────────
function DawChannelStrip({ track, isPlaying, onMute, onSolo, onVolumeChange, aiLevel }) {
  const [vol, setVol] = useState(track.volume ?? 1);
  const [vuLevel, setVuLevel] = useState(0);

  useEffect(() => { setVol(track.volume ?? 1); }, [track.volume]);

  useEffect(() => {
    if (!isPlaying || track.mute) { setVuLevel(0); return; }
    const id = setInterval(() => {
      const base = (track.volume ?? 1) * 0.65;
      setVuLevel(Math.min(1, base + Math.random() * 0.3));
    }, 110);
    return () => clearInterval(id);
  }, [isPlaying, track.mute, track.volume]);

  const color = dawStemColor(track.id);
  const isMuted = track.mute;
  const isSolo = track.solo;
  const litLeds = Math.round(Math.min(vuLevel, 1) * DAW_NUM_LEDS);

  return (
    <View style={dawSt.strip}>
      {/* ── LEFT: vertical name column ───────────────────────────────── */}
      <View
        style={[
          dawSt.nameCol,
          { backgroundColor: isMuted ? "#080E1A" : color + "18" },
        ]}
      >
        {/* Correct rotation: text width = strip height, positioned so it fills the column */}
        <Text
          style={[
            dawSt.nameTxt,
            {
              color: isMuted ? "#374151" : color,
            },
          ]}
        >
          {formatVerticalTrackLabel(track.label || track.id || "")}
        </Text>
      </View>

      {/* ── RIGHT: controls ──────────────────────────────────────────── */}
      <View style={dawSt.rightCol}>
        {/* Color bar */}
        <View
          style={[
            dawSt.colorBar,
            { backgroundColor: isMuted ? "#374151" : color },
          ]}
        />

        {/* dB readout */}
        <Text style={[dawSt.dbReadout, isMuted && { color: "#374151" }]}>
          {volToDb(vol)} dB
        </Text>

        {/* Fader + VU side by side */}
        <View style={dawSt.faderVuRow}>
          {/* VU meter — thin LED column */}
          <View style={dawSt.vuCol}>
            {Array.from({ length: DAW_NUM_LEDS }).map((_, i) => {
              const idx = DAW_NUM_LEDS - 1 - i; // top = highest
              const lit = !isMuted && idx < litLeds;
              const ledColor =
                idx >= DAW_NUM_LEDS - 1
                  ? "#EF4444"
                  : idx >= DAW_NUM_LEDS - 3
                    ? "#F59E0B"
                    : "#22C55E";
              return (
                <View
                  key={i}
                  style={[
                    dawSt.vuLed,
                    { backgroundColor: lit ? ledColor : "#0F1A0F" },
                  ]}
                />
              );
            })}
          </View>

          {/* Custom vertical fader */}
          <VerticalFader
            value={vol}
            color={color}
            muted={isMuted}
            aiLevel={aiLevel}
            onChange={setVol}
            onDone={(v) => { setVol(v); onVolumeChange?.(v); }}
          />
        </View>

        {/* S / M buttons */}
        <View style={dawSt.btnRow}>
          <TouchableOpacity
            style={[dawSt.btn, isSolo && dawSt.btnSolo]}
            onPress={onSolo}
            activeOpacity={0.7}
          >
            <Text style={[dawSt.btnTxt, isSolo && { color: "#F59E0B" }]}>S</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[dawSt.btn, isMuted && dawSt.btnMute]}
            onPress={onMute}
            activeOpacity={0.7}
          >
            <Text style={[dawSt.btnTxt, isMuted && { color: "#818CF8" }]}>M</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const dawSt = StyleSheet.create({
  strip: {
    width: DAW_STRIP_W,
    height: DAW_STRIP_H,
    flexDirection: "row",
    backgroundColor: "#060D1E",
    borderWidth: 1,
    borderColor: "#1E2740",
    borderRadius: 6,
    overflow: "hidden",
    marginRight: 4,
  },
  // Left name column — full strip height, name rotated vertically
  nameCol: {
    width: DAW_NAME_W,
    overflow: "hidden",
    borderRightWidth: 1,
    borderRightColor: "#0F172A",
  },
  nameTxt: {
    flex: 1,
    width: "100%",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
    lineHeight: 10,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    paddingVertical: 6,
  },
  // Right controls column
  rightCol: { flex: 1, flexDirection: "column" },
  colorBar: { height: 7, width: "100%" },
  dbReadout: {
    fontSize: 9,
    fontWeight: "700",
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 3,
    letterSpacing: 0.3,
  },
  faderVuRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  vuCol: {
    width: 8,
    height: VF_H,
    justifyContent: "flex-end",
    gap: 2,
    marginRight: 2,
  },
  vuLed: { height: 7, width: "100%", borderRadius: 1 },
  btnRow: {
    height: 28,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#0F172A",
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#0F172A",
    backgroundColor: "#0B1120",
  },
  btnSolo: { backgroundColor: "#1A0F00" },
  btnMute: { backgroundColor: "#0E0E2A" },
  btnTxt: { fontSize: 10, fontWeight: "900", color: "#334155" },
});

export default function RehearsalScreen({ route, navigation }) {
  const R = useResponsive();
  const {
    song: songParam,
    apiBase,
    userRole: routeRole,
    nextSong,
    afterNextSong,
    serviceId,
    personId,
    isAdmin,
    vocalAssignmentsParam,
    service: serviceParam,
    plan: planParam,
    setlist: setlistParam = [],
    setlistIndex: setlistIndexParam = 0,
    hideVocalSection = false,
    autoPlay = false,
  } = route.params || {};

  // ── Always load the full/fresh song from storage so analysis data is present ─
  const [song, setSong] = useState(songParam);
  useEffect(() => {
    if (!songParam?.id) return;
    getSongs().then((all) => {
      const fresh = all.find((s) => s.id === songParam.id);
      if (fresh) {
        // Merge: fresh storage record wins on analysis/content fields;
        // keep any live route params (key, role, etc.) that aren't in storage
        setSong((prev) => ({ ...songParam, ...fresh }));
      }
    }).catch(() => {});
  }, [songParam?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Full setlist — if passed, use it; otherwise fall back to just current song
  const setlist =
    setlistParam.length > 0 ? setlistParam : [song].filter(Boolean);
  const setlistIndex = setlistIndexParam;
  const setlistNextSong = setlist[setlistIndex + 1] || nextSong || null;

  const [loading, setLoading] = useState(true);
  const [loadStep, setLoadStep] = useState(0);
  const [loadProgress, setLoadProgress] = useState(0);

  const [tracks, setTracks] = useState([]);
  const [customTracks, setCustomTracks] = useState([]);
  const [addTrackVisible, setAddTrackVisible] = useState(false);
  const [newTrackName, setNewTrackName] = useState("");
  const [newTrackType, setNewTrackType] = useState(null);
  const [availableInputs, setAvailableInputs] = useState([]);
  const [selectedInput, setSelectedInput] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(1);
  // Live sequencer state
  const [countInActive, setCountInActive] = useState(false);
  const [countBeat, setCountBeat] = useState(0);
  const [activeCueLabel, setActiveCueLabel] = useState("");
  const [padActive, setPadActive] = useState(false);
  // Transport bar enhancements
  const [bpmInput, setBpmInput] = useState(String(song?.bpm || ""));
  const [localTimeSig, setLocalTimeSig] = useState(song?.timeSig || "4/4");
  // Transpose / active key (initialized from song metadata — editable live)
  const [transposedKey, setTransposedKey] = useState(
    song?.originalKey || song?.key || "C",
  );
  const [keyPickerOpen, setKeyPickerOpen] = useState(false);
  const [lightCues, setLightCues] = useState([]);
  const [lightPanelOpen, setLightPanelOpen] = useState(false);
  const [newLightLabel, setNewLightLabel] = useState("");
  const [markersPanelOpen, setMarkersPanelOpen] = useState(false);
  const [newMarkerLabel, setNewMarkerLabel] = useState("");
  // Sections parsed from chord chart (used as sectionJumpList fallback)
  const [chartSections, setChartSections] = useState([]);
  // User-edited sections — null = use auto-computed, array = user has customized
  const [userSections, setUserSections] = useState(null);
  const [setlistPanelOpen, setSetlistPanelOpen] = useState(false);
  const [showMixer, setShowMixer] = useState(false); // Collapsible mixer for iPad mini layout
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioLoaded, setAudioLoaded] = useState(false); // true when at least one sound loaded
  const pollRef = useRef(null);
  const loopSeekLockRef = useRef(false);

  const [selectedRole, setSelectedRole] = useState("Other");
  const [gridMode, setGridMode] = useState("BAR");

  // ── Section marker pin state ─────────────────────────────────────────────
  const [activeSectionLabel, setActiveSectionLabel] = useState(null);
  const [sectionLoopActive, setSectionLoopActive] = useState(false);
  const lastSectionTapRef = useRef({ label: null, time: 0 });

  // ── Worship Loop (triple-tap) ────────────────────────────────────────────
  const [worshipLoopActive, setWorshipLoopActive] = useState(false);
  const sectionTapCountRef = useRef({ label: null, count: 0, time: 0 });

  // ── Predictive Flow AI ───────────────────────────────────────────────────
  const sectionRepeatCountRef = useRef({ label: null, count: 0 });
  const [aiSuggestion, setAiSuggestion] = useState(null); // { section, reason }

  // ── CineStage Pipeline Analysis ─────────────────────────────────────────
  const [csAnalysis, setCsAnalysis]       = useState(null);   // full pipeline result
  const [csAnalyzing, setCsAnalyzing]     = useState(false);
  const [cueGenerating, setCueGenerating] = useState(false);

  const runCineStageAnalysis = useCallback(async () => {
    const audioUrl = song?.audioUrl || song?.url || song?.audio_url || song?.sourceUrl || song?.youtubeLink;
    if (!audioUrl) {
      Alert.alert('CineStage™', 'No audio URL found for this song.\nAttach an audio file first.');
      return;
    }
    try {
      setCsAnalyzing(true);
      const { analyzeAudio, analyzeWaveform } = await import('../services/cinestage/client');
      const result = await analyzeAudio({
        file_url:   audioUrl,
        title:      song?.title || 'Untitled',
        song_id:    song?.id   || song?.songId || undefined,
        n_sections: 6,
      });
      setCsAnalysis(result);
      if (result.bpm) setAdaptedBpm(result.bpm);

      // Fetch real waveform peaks from visual engine if not included in analysis
      let waveformPeaks = result.waveformPeaks || result.peaks || null;
      if (!waveformPeaks && (song?.id || audioUrl)) {
        try {
          const waveResult = await analyzeWaveform({
            file_url:      audioUrl,
            song_id:       song?.id || song?.songId || undefined,
            title:         song?.title || 'Untitled',
            waveform_points: R.isAnyTablet ? 1280 : 480,
          });
          waveformPeaks = waveResult?.analysis?.waveformPeaks || waveResult?.peaks || waveResult?.waveformPeaks || null;
        } catch { /* non-fatal — waveform is visual only */ }
      }

      // Persist full analysis (including peaks) so waveform survives screen navigation
      if (song?.id || song?.songId) {
        try {
          await addOrUpdateSong({
            ...song,
            id: song.id || song.songId,
            bpm: result.bpm || song?.bpm,
            originalKey: result.key || song?.originalKey,
            analysis: {
              sections:          result.sections,
              chords:            result.chords,
              cues:              result.cues,
              beats_ms:          result.beats_ms,
              performance_graph: result.performance_graph,
              duration_ms:       result.duration_ms,
              waveformPeaks:     waveformPeaks,
              peaks:             waveformPeaks,
              analyzedAt:        new Date().toISOString(),
            },
          });
          // Merge peaks into live csAnalysis state so waveform renders immediately
          if (waveformPeaks) {
            setCsAnalysis(prev => ({ ...result, ...prev, waveformPeaks, peaks: waveformPeaks }));
          }
        } catch { /* non-fatal */ }
      }
    } catch (e) {
      Alert.alert('CineStage™ Error', String(e?.message || e));
    } finally {
      setCsAnalyzing(false);
    }
  }, [song, R.isAnyTablet]);

  const autoAnalysisSongRef = useRef(null);
  useEffect(() => {
    if (!song?.id) return;
    if (autoAnalysisSongRef.current === song.id) return;

    const alreadyAnalyzed =
      Array.isArray(song?.analysis?.sections) &&
      song.analysis.sections.length > 0;
    // Auto-analysis disabled — user must trigger CineStage manually to avoid
    // offline network errors and unexpected alerts on song load.
    autoAnalysisSongRef.current = song.id;
  }, [song, runCineStageAnalysis]);

  // ── CineStage Role Cues ──────────────────────────────────────────────────
  const handleGenerateRoleCues = useCallback(async () => {
    if (!userRole) {
      Alert.alert('CineStage™', 'No role assigned — ask your music director to assign you a role first.');
      return;
    }
    const sections =
      song?.analysis?.sections ||
      csAnalysis?.sections ||
      [];
    setCueGenerating(true);
    try {
      const { generateCues } = await import('../services/cinestage/client');
      const result = await generateCues({ sections, role: userRole });
      const cueText =
        result?.cues || result?.text || result?.content ||
        (typeof result === 'string' ? result : JSON.stringify(result));
      const rk = (userRole || '').toLowerCase().replace(/[\s-]/g, '_');
      await addOrUpdateSong({
        ...song,
        id: song?.id || song?.songId,
        role_content: {
          ...song?.role_content,
          [rk]: {
            ...song?.role_content?.[rk],
            cues: cueText,
          },
        },
      });
    } catch (e) {
      Alert.alert('CineStage™ Error', String(e?.message || e));
    } finally {
      setCueGenerating(false);
    }
  }, [song, userRole, csAnalysis]);

  const handleGenerateRehearsalPreset = useCallback(async () => {
    setRehearsalPresetLoading(true);
    setRehearsalPresetResult(null);
    try {
      const res = await fetch(`${CINESTAGE_URL}/ai/midi-presets/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrument_type: rehearsalPresetType,
          song_title: song?.title || '',
          genre: 'worship',
          style: rehearsalPresetType.toLowerCase().replace(/\s+/g, '_'),
        }),
      });
      if (!res.ok) throw new Error(`AI Preset ${res.status}`);
      setRehearsalPresetResult(await res.json());
    } catch (e) {
      Alert.alert('Preset Error', e.message);
    } finally {
      setRehearsalPresetLoading(false);
    }
  }, [rehearsalPresetType, song]);

  // ── Adaptive Band Sync BPM ───────────────────────────────────────────────
  const [adaptedBpm, setAdaptedBpm] = useState(Number(song?.bpm || 120));

  // ── Song transition & role ───────────────────────────────────────────────
  const [songTransitionMode, setSongTransitionMode] = useState("wait");
  const [songEnded, setSongEnded] = useState(false);
  const [userRole] = useState(routeRole || null);
  const [markers, setMarkers] = useState([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [selectedMarkerIds, setSelectedMarkerIds] = useState([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [newMarkerType, setNewMarkerType] = useState(DEFAULT_MARKER_TYPE);
  const [bulkRenameLabel, setBulkRenameLabel] = useState("");
  const [loopMarkerId, setLoopMarkerId] = useState(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [markersReady, setMarkersReady] = useState(false);
  const markersSaveTimerRef = useRef(null);
  const lastSavedMarkersRef = useRef(null);
  const [practiceMuteOwn, setPracticeMuteOwn] = useState(false);
  const [launchQuantization, setLaunchQuantization] = useState("BAR");
  const [transitionMode, setTransitionMode] = useState("CROSSFADE");
  const [transientThreshold, setTransientThreshold] = useState(0.72);
  const [automationEvents, setAutomationEvents] = useState([]);
  const [safetyMode, setSafetyMode] = useState("guided");
  const [pipelineExpanded, setPipelineExpanded] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [sectionEditorVisible, setSectionEditorVisible] = useState(false);
  const [sectionEditMode, setSectionEditMode] = useState(false);
  const [rehearsalPresetType, setRehearsalPresetType]       = useState('Worship Keys');
  const [rehearsalPresetLoading, setRehearsalPresetLoading] = useState(false);
  const [rehearsalPresetResult, setRehearsalPresetResult]   = useState(null);
  const [lastDiffSummary, setLastDiffSummary] = useState(
    "No snapshot loaded yet.",
  );
  const [arming, setArming] = useState(false);

  // ── Next song pre-load ───────────────────────────────────────────────────
  const [nextSongReady, setNextSongReady] = useState(false);
  const [nextSongLoadPct, setNextSongLoadPct] = useState(0);

  // ── Tap Tempo ────────────────────────────────────────────────────────────
  const tapTimesRef = useRef([]);
  const [tapBpm, setTapBpm] = useState(null);

  // ── Drone Pad ────────────────────────────────────────────────────────────
  const [dronePickerVisible, setDronePickerVisible] = useState(false);
  const [droneNote, setDroneNote] = useState(null);

  // ── Recording ────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [armedTrackId, setArmedTrackId] = useState(null); // which track is armed for record
  const recordingRef = useRef(null);
  const sectionsSaveTimerRef = useRef(null);

  // ── Vocal assignments (loaded from params or AsyncStorage) ───────────────
  const [vocalAssignments, setVocalAssignments] = useState(
    vocalAssignmentsParam || {},
  );

  // Parse "3:45" or "3:45:00" duration string → seconds
  const parsedDurationSec = (() => {
    const dur = song?.duration;
    if (!dur) return 0;
    const parts = String(dur).split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  })();
  // Prefer stored song duration over audio engine value (engine defaults to 1s with no stems)
  const effectiveDuration = Math.min(3600, // cap at 60 min — guard against ms-stored-as-sec bugs
    (csAnalysis?.duration_ms ? csAnalysis.duration_ms / 1000 : null) ||
    (duration > 1 ? duration : 0) ||  // real engine duration takes priority over stored values
    parsedDurationSec ||
    (song?.durationSec && song.durationSec < 3600 ? song.durationSec : 0) ||
    (song?.analysis?.duration_ms ? song.analysis.duration_ms / 1000 : null) || 240
  );
  const sections =
    csAnalysis?.sections ||
    song?.sections ||
    song?.analysis?.sections ||
    song?.latestStemsJob?.result?.sections ||
    [];
  const waveformPeaksRaw =
    csAnalysis?.waveformPeaks ||
    csAnalysis?.peaks ||
    song?.analysis?.waveformPeaks ||
    song?.waveformPeaks ||
    song?.analysis?.peaks ||
    song?.latestStemsJob?.result?.waveformPeaks ||
    song?.latestStemsJob?.result?.waveform_peaks ||
    null;
  const waveformPeaks = processPeaksForDisplay(
    waveformPeaksRaw,
    R.isAnyTablet ? 1280 : 480,
  );

  // Role cue for waveform display
  const waveRoleCue = (() => {
    if (!song?.role_content || !userRole) return null;
    const ROLE_KEY = {
      worship_leader: 'guitar', lead_vocal: 'vocals',
      bgv_1: 'vocals', bgv_2: 'vocals', bgv_3: 'vocals',
      keyboard: 'keyboard', piano: 'keyboard', synth: 'keyboard',
      electric_guitar: 'guitar', rhythm_guitar: 'guitar', acoustic_guitar: 'guitar',
      bass: 'bass', drums: 'drums', percussion: 'drums',
      strings: 'keyboard', brass: 'keyboard',
      music_director: 'keyboard',
    };
    const key = ROLE_KEY[userRole];
    if (!key) return null;
    const rc = song.role_content[key];
    if (!rc) return null;
    return rc.cues || rc.notes || rc.technique || null;
  })();

  const markerSelectionIds = multiSelectMode
    ? selectedMarkerIds
    : selectedMarkerId
      ? [selectedMarkerId]
      : [];
  const markerSelectionCount = markerSelectionIds.length;
  const markerSelectionType = (() => {
    if (markerSelectionIds.length === 0) return null;
    const map = new Map(markers.map((m) => [m.id, m]));
    const types = markerSelectionIds
      .map((id) => map.get(id)?.type)
      .filter(Boolean);
    if (types.length === 0) return null;
    return types.every((t) => t === types[0]) ? types[0] : null;
  })();

  // ── Role-aware computed values ───────────────────────────────────────────
  const roleKey = (userRole || "").toLowerCase().replace(/[\s-]/g, "_");
  const isVocalRole =
    VOCAL_ROLES.has(roleKey) || VOCAL_ROLES.has(userRole?.toLowerCase() || "");
  const isMusicianRole =
    MUSICIAN_ROLES.has(roleKey) ||
    MUSICIAN_ROLES.has(userRole?.toLowerCase() || "");
  const roleDisplayName = ROLE_DISPLAY_NAME[roleKey] || userRole || null;
  const roleEmoji = isVocalRole ? "🎤" : isMusicianRole ? "🎸" : "🎵";

  // Stem matching for this role
  const ownStemId = (() => {
    if (roleKey.includes("drum") || roleKey.includes("percus")) return "drums";
    if (roleKey.includes("bass")) return "bass";
    if (
      roleKey.includes("key") ||
      roleKey.includes("piano") ||
      roleKey.includes("synth")
    )
      return "keys";
    if (roleKey.includes("guitar")) return "guitars";
    if (isVocalRole) return "vocals";
    return null;
  })();
  const ownTrackId = ownStemId;
  const { filteredTracks } = resolveRoleFilteredTracks(tracks, selectedRole);

  // Content for this role
  const songLyrics = song?.lyrics || song?.latestStemsJob?.result?.lyrics || "";
  const songChart =
    song?.chordChart || song?.latestStemsJob?.result?.chordChart || "";
  const roleCues =
    song?.role_content?.[roleKey]?.cues ||
    song?.role_content?.[roleKey]?.notes ||
    song?.role_content?.[roleKey]?.technique ||
    "";

  // ── My vocal assignment for this song ────────────────────────────────────
  const songVocalAssignments =
    vocalAssignments[song?.id] || vocalAssignments[song?.songId] || {};
  const myVocalEntry = personId
    ? Object.entries(songVocalAssignments).find(
        ([, a]) => a.personId === personId,
      ) || null
    : null;
  const myPartKey = myVocalEntry ? myVocalEntry[0] : null;
  const myVocalData = myVocalEntry ? myVocalEntry[1] : null;
  const myPartLabel = myPartKey
    ? VOCAL_PART_LABELS[myPartKey] || myPartKey
    : null;
  const myPartColor = myPartKey
    ? VOCAL_PART_COLORS[myPartKey] || "#6366F1"
    : null;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const pos = await audioEngine.getPosition();
      setPosition(pos);
      const dur = await audioEngine.getDuration();

      if (loopEnabled && loopMarkerId) {
        const loopMarker = markers.find((marker) => marker.id === loopMarkerId);
        if (
          loopMarker &&
          pos >= loopMarker.end - 0.03 &&
          !loopSeekLockRef.current
        ) {
          loopSeekLockRef.current = true;
          await audioEngine.seek(loopMarker.start);
          setPosition(loopMarker.start);
          setTimeout(() => {
            loopSeekLockRef.current = false;
          }, 120);
          return;
        }
      }

      if (dur > 0 && pos >= dur - 0.3) {
        stopPolling();
        await audioEngine.stop();
        setIsPlaying(false);
        setPosition(0);
        setSongEnded(true);
        if (songTransitionMode === "smooth" && nextSong) {
          // Smooth crossfade: navigate immediately to next song
          navigation.replace("Rehearsal", {
            song: nextSong,
            apiBase,
            userRole,
            nextSong: afterNextSong || null,
          });
        }
      }
    }, 80);
  }, [stopPolling, loopEnabled, loopMarkerId, markers]);

  useEffect(() => {
    stopPolling();
    stopSequence();
    audioEngine.stop().catch(() => {});

    if (markersSaveTimerRef.current) {
      clearTimeout(markersSaveTimerRef.current);
      markersSaveTimerRef.current = null;
    }
    if (sectionsSaveTimerRef.current) {
      clearTimeout(sectionsSaveTimerRef.current);
      sectionsSaveTimerRef.current = null;
    }

    setLoading(true);
    setLoadStep(0);
    setLoadProgress(0);
    setTracks([]);
    setCustomTracks([]);
    setCountInActive(false);
    setCountBeat(0);
    setPadActive(false);
    setActiveCueLabel("");
    setChartSections([]);
    setUserSections(null);
    setSectionEditorVisible(false);
    setSetlistPanelOpen(false);
    setMarkersPanelOpen(false);
    setLightPanelOpen(false);
    setKeyPickerOpen(false);
    setDronePickerVisible(false);
    setDroneNote(null);
    setPosition(0);
    setDuration(0);
    setIsPlaying(false);
    setSongEnded(false);
    setMarkersReady(false);
    setMarkers([]);
    setSelectedMarkerId(null);
    setSelectedMarkerIds([]);
    setMultiSelectMode(false);
    setLoopMarkerId(null);
    setLoopEnabled(false);
    setTapBpm(null);
    tapTimesRef.current = [];
    sectionRepeatCountRef.current = { label: null, count: 0 };
    setAiSuggestion(null);

    const nextSongBpm = Number(song?.bpm || song?.analysis?.bpm || 120);
    setBpmInput(
      song?.bpm || song?.analysis?.bpm
        ? String(Math.round(nextSongBpm))
        : "",
    );
    setAdaptedBpm(nextSongBpm);
    setLocalTimeSig(song?.timeSig || "4/4");
    setTransposedKey(song?.originalKey || song?.key || "C");
  }, [song?.id, stopPolling]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoadStep(0);
        setLoadProgress(15);
        await audioEngine.initEngine();

        setLoadStep(1);
        setLoadProgress(40);

        const jobResult = song?.latestStemsJob?.result;
        const localStems = song?.localStems;
        const hasBackendStems = hasBackendStemEntries(jobResult);
        const hasLocalStems = localStems && Object.keys(localStems).length > 0;

        const initialTracks = buildTracks(jobResult, localStems);

        if (hasBackendStems) {
          await audioEngine.loadFromBackend(
            jobResult,
            apiBase || CINESTAGE_URL,
          );
        } else if (hasLocalStems) {
          // Replace the active engine bundle with the local multitrack set so
          // stale backend/custom tracks from a prior song cannot shadow this load.
          const localTrackData = Object.entries(localStems).map(([slotName, info]) => ({
            id: slotName,
            label: slotName,
            uri: typeof info === "string" ? info : info?.localUri || null,
            volume: 1,
            mute: false,
            solo: false,
            armed: false,
          }));
          await audioEngine.replaceWithTracks(localTrackData);
        }

        if (cancelled) return;
        setTracks(initialTracks);
        if (initialTracks.length > 0) audioEngine.setMixerState(initialTracks);
        const engineDuration = await audioEngine.getDuration();
        const hasLoadedAudio = await audioEngine.hasLoadedAudio();
        setDuration(engineDuration);
        // Remote stems can report duration late on first load, so treat a
        // successfully loaded sound as valid audio even if duration is still 0.
        const hasAudio = hasLoadedAudio || engineDuration > 0;
        setAudioLoaded(hasAudio);
        if (!hasAudio && initialTracks.length > 0) {
          const usedBackendStems = Boolean(hasBackendStems);
          Alert.alert(
            'No Audio Loaded',
            usedBackendStems
              ? 'The stem files for this song were found, but they could not be loaded from the cloud.\n\nTry reopening the song. If it still fails, run CineStage again on this song.'
              : 'The stem files for this song could not be found on this device.\n\nTo hear audio:\n• Re-import the stems from this device\n• Or run CineStage stem separation on this song',
            [{ text: 'OK' }]
          );
        }

        setLoadStep(2);
        setLoadProgress(100);
        await new Promise((r) => setTimeout(r, 400));

        // Auto-play: skip count-in when navigated from CineStage import
        if (autoPlay && !cancelled && initialTracks.length > 0) {
          audioEngine.play().catch(() => {});
          setIsPlaying(true);
          startPolling();
        }
      } catch (e) {
        if (!cancelled) Alert.alert("Load Error", String(e?.message || e));
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      stopPolling();
      audioEngine.stop().catch(() => {});
    };
  }, [apiBase, song, stopPolling]);

  useEffect(() => {
    if (tracks.length > 0) audioEngine.setMixerState(tracks);
  }, [tracks]);

  useEffect(() => {
    if (!markersReady) return;
    if (effectiveDuration <= 0 || sections.length === 0 || markers.length > 0)
      return;
    const seeded = buildMarkersFromSections(
      sections,
      effectiveDuration,
    ).map((m) => applyMarkerType(m, "section"));
    setMarkers(seeded);
    if (seeded[0]) setLoopMarkerId(seeded[0].id);
  }, [effectiveDuration, sections, markers.length, markersReady]);

  // ── Persist rehearsal markers to song library ──────────────────────────
  useEffect(() => {
    if (!markersReady || !song?.id) return;
    const normalized = normalizeMarkersForStorage(markers);
    const normalizedSections = normalizeSectionsForStorage(userSections);
    const serialized = JSON.stringify({
      markers: normalized,
      loopMarkerId: loopMarkerId || null,
      loopEnabled: !!loopEnabled,
      sections: normalizedSections,
    });
    if (serialized === lastSavedMarkersRef.current) return;
    lastSavedMarkersRef.current = serialized;

    if (markersSaveTimerRef.current) {
      clearTimeout(markersSaveTimerRef.current);
    }
    if (sectionsSaveTimerRef.current) {
      clearTimeout(sectionsSaveTimerRef.current);
    }
    const saveFn = () => {
      addOrUpdateSong({
        ...song,
        rehearsalMarkers: normalized,
        rehearsalLoopMarkerId: loopMarkerId || null,
        rehearsalLoopEnabled: !!loopEnabled,
        rehearsalSections: normalizedSections,
      }).catch(() => {});
    };
    markersSaveTimerRef.current = setTimeout(saveFn, 600);
    sectionsSaveTimerRef.current = markersSaveTimerRef.current;
    return () => {
      if (markersSaveTimerRef.current) {
        clearTimeout(markersSaveTimerRef.current);
      }
      if (sectionsSaveTimerRef.current) {
        clearTimeout(sectionsSaveTimerRef.current);
      }
    };
  }, [markers, loopMarkerId, loopEnabled, markersReady, song, userSections]);

  // ── Keep marker selections valid ───────────────────────────────────────
  useEffect(() => {
    setSelectedMarkerIds((prev) =>
      prev.filter((id) => markers.some((m) => m.id === id)),
    );
    if (
      selectedMarkerId &&
      !markers.some((m) => m.id === selectedMarkerId)
    ) {
      setSelectedMarkerId(null);
    }
  }, [markers, selectedMarkerId]);

  useEffect(() => {
    if (!ownTrackId || !practiceMuteOwn) return;
    setTracks((prev) =>
      prev.map((track) =>
        track.id === ownTrackId ? { ...track, mute: true } : track,
      ),
    );
  }, [practiceMuteOwn, ownTrackId]);

  // Start simulated background pre-load for next song once current song is loaded
  useEffect(() => {
    if (!nextSong || loading) return;
    setNextSongReady(false);
    setNextSongLoadPct(0);
    let pct = 0;
    const id = setInterval(() => {
      pct = Math.min(100, pct + Math.random() * 18 + 7);
      setNextSongLoadPct(Math.round(pct));
      if (pct >= 100) {
        setNextSongReady(true);
        clearInterval(id);
      }
    }, 350);
    return () => clearInterval(id);
  }, [nextSong?.id, loading]);

  // Load vocal assignments from AsyncStorage if not passed via params
  useEffect(() => {
    if (!serviceId || vocalAssignmentsParam) return;
    AsyncStorage.getItem(`um/vocals/v1/${serviceId}`)
      .then((raw) => {
        if (raw) setVocalAssignments(JSON.parse(raw));
      })
      .catch(() => {});
  }, [serviceId]);

  // ── Load persisted rehearsal markers for this song ─────────────────────
  useEffect(() => {
    if (!song?.id) {
      setUserSections(null);
      lastSavedMarkersRef.current = JSON.stringify({
        markers: [],
        loopMarkerId: null,
        loopEnabled: false,
        sections: null,
      });
      setMarkersReady(true);
      return;
    }
    const derivedAnalysisMarkers = buildMarkersFromAnalysisCues(
      song?.analysis?.cues || [],
      effectiveDuration,
    );
    const stored = normalizeMarkersForStorage(
      song?.rehearsalMarkers ||
        song?.markers ||
        song?.analysis?.markers ||
        derivedAnalysisMarkers ||
        [],
    );
    const storedSections = normalizeSectionsForStorage(
      song?.rehearsalSections ??
      song?.customSections ??
      null,
    );
    setMarkers(stored);
    setUserSections(storedSections);
    setSelectedMarkerId(null);
    setSelectedMarkerIds([]);
    setMultiSelectMode(false);

    if (
      song?.rehearsalLoopMarkerId &&
      stored.some((m) => m.id === song.rehearsalLoopMarkerId)
    ) {
      setLoopMarkerId(song.rehearsalLoopMarkerId);
      setLoopEnabled(!!song.rehearsalLoopEnabled);
    } else {
      setLoopMarkerId(null);
      setLoopEnabled(false);
    }

    lastSavedMarkersRef.current = JSON.stringify({
      markers: stored,
      loopMarkerId:
        song?.rehearsalLoopMarkerId &&
        stored.some((m) => m.id === song.rehearsalLoopMarkerId)
          ? song.rehearsalLoopMarkerId
          : null,
      loopEnabled:
        !!(
          song?.rehearsalLoopMarkerId &&
          stored.some((m) => m.id === song.rehearsalLoopMarkerId) &&
          song?.rehearsalLoopEnabled
        ),
      sections: storedSections,
    });
    setMarkersReady(true);
  }, [
    effectiveDuration,
    song?.analysis?.cues,
    song?.analysis?.markers,
    song?.customSections,
    song?.id,
    song?.markers,
    song?.rehearsalLoopEnabled,
    song?.rehearsalLoopMarkerId,
    song?.rehearsalMarkers,
    song?.rehearsalSections,
  ]);

  useEffect(() => {
    (async () => {
      const history = await getArmedPipelineHistory();
      if (history[0]?.armedAt)
        setLastDiffSummary(`Last armed: ${history[0].armedAt}`);
    })();
  }, []);

  // ── Sync bpmInput when tap tempo fires ───────────────────────────────────
  useEffect(() => {
    if (tapBpm) setBpmInput(String(tapBpm));
  }, [tapBpm]);

  // ── Populate BPM from song metadata if input is empty on mount ────────────
  useEffect(() => {
    const songBpm = song?.bpm || song?.analysis?.bpm || adaptedBpm;
    if (!bpmInput && songBpm) setBpmInput(String(Math.round(songBpm)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-parse chord chart for section headers → chartSections ─────────────
  useEffect(() => {
    const chart = song?.lyricsChordChart || song?.chordChart || song?.chordSheet || song?.lyrics || '';
    if (!chart || !effectiveDuration || sections.length > 0) return;
    const parsed = parseSectionsForWaveform(chart, effectiveDuration);
    if (parsed.length >= 2) setChartSections(parsed);
  }, [song?.lyricsChordChart, song?.chordChart, song?.chordSheet, song?.lyrics, effectiveDuration, sections.length]);

  // ── Load light cues for this song ────────────────────────────────────────
  useEffect(() => {
    if (!song?.id) return;
    AsyncStorage.getItem(`um/lightcues/${song.id}`)
      .then((raw) => {
        if (raw)
          try {
            setLightCues(JSON.parse(raw));
          } catch {}
      })
      .catch(() => {});
  }, [song?.id]);

  // ── Fetch available audio inputs when Add Track modal opens ──────────────
  useEffect(() => {
    if (!addTrackVisible) return;
    safeGetAvailableInputsAsync()
      .then((list) => {
        setAvailableInputs(list);
        if (list.length > 0) setSelectedInput((prev) => prev || list[0]);
      })
      .catch(() => setAvailableInputs([]));
  }, [addTrackVisible]);

  function toggleTrackMute(id) {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, mute: !t.mute } : t)),
    );
  }

  function toggleSolo(id) {
    setTracks((prev) => {
      const alreadySoloed = prev.find((t) => t.id === id)?.solo;
      // solo one track at a time; second tap clears all solos
      return prev.map((t) => ({
        ...t,
        solo: alreadySoloed ? false : t.id === id,
      }));
    });
  }

  function toggleArmed(id) {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, armed: !t.armed } : t)),
    );
  }

  function setTrackVolume(id, vol) {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, volume: Math.max(0, Math.min(vol, 1)) } : t,
      ),
    );
  }

  function addMarkerAtPlayhead(label) {
    const snapped = quantizeTime(position, gridMode, song?.bpm);
    const start = Math.max(0, Math.min(snapped, duration || snapped + 1));
    const end = Math.min(duration || start + 8, start + 8);
    const typeId = label === "Loop" ? "loop" : newMarkerType;
    const meta = getMarkerTypeMeta(typeId);
    const marker = {
      ...markerTemplate(
        label,
        start,
        Math.max(end, start + 0.5),
        meta?.color || "#4F46E5",
      ),
      type: typeId,
      color: meta?.color || "#4F46E5",
    };
    setMarkers((prev) => [...prev, marker].sort((a, b) => a.start - b.start));
    setSelectedMarkerId(marker.id);
    if (label === "Loop") {
      setLoopMarkerId(marker.id);
      setLoopEnabled(true);
    }
  }

  function adjustSelectedMarker(deltaStartSec, deltaEndSec) {
    if (!selectedMarkerId) return;
    setMarkers((prev) =>
      prev.map((marker) => {
        if (marker.id !== selectedMarkerId) return marker;
        const nextStart = quantizeTime(
          marker.start + deltaStartSec,
          gridMode,
          song?.bpm,
        );
        const nextEnd = quantizeTime(
          marker.end + deltaEndSec,
          gridMode,
          song?.bpm,
        );
        return updateMarkerRange(marker, nextStart, nextEnd, duration || null);
      }),
    );
  }

  function deleteSelectedMarker() {
    if (!selectedMarkerId) return;
    setMarkers((prev) => prev.filter((m) => m.id !== selectedMarkerId));
    if (loopMarkerId === selectedMarkerId) {
      setLoopMarkerId(null);
      setLoopEnabled(false);
    }
    setSelectedMarkerId(null);
  }

  function addTransientMarkers() {
    if (!waveformPeaks || waveformPeaks.length < 4 || duration <= 0) {
      Alert.alert(
        "No waveform data",
        "This song does not have enough waveform data for transient suggestions yet.",
      );
      return;
    }
    const suggestions = buildTransientMarkers(waveformPeaks, duration, {
      threshold: transientThreshold,
      maxMarkers: 24,
      minSpacingSec: 1.2,
      markerSpanSec: 1.0,
    });
    if (suggestions.length === 0) {
      Alert.alert(
        "No hits detected",
        "Try lowering threshold and detect again.",
      );
      return;
    }

    setMarkers((prev) => {
      const typedSuggestions = suggestions.map((m) =>
        applyMarkerType(m, "cue"),
      );
      const existingAtHalfSecond = new Set(
        prev.map((m) => Math.round(Number(m.start || 0) * 2)),
      );
      const merged = [...prev];
      typedSuggestions.forEach((item) => {
        const secKey = Math.round(Number(item.start || 0) * 2);
        if (existingAtHalfSecond.has(secKey)) return;
        merged.push(item);
      });
      return merged.sort((a, b) => a.start - b.start);
    });
  }

  function runAiMarkerAssist() {
    const suggestions = suggestAiMarkers({
      waveformPeaks,
      durationSec: duration,
      bpm: song?.bpm,
    });
    if (suggestions.length === 0) {
      Alert.alert("AI assist", "No suggestions generated for this song.");
      return;
    }
    const typedSuggestions = suggestions.map((m) =>
      applyMarkerType(m, "jump"),
    );
    setMarkers((prev) => mergeSuggestedMarkers(prev, typedSuggestions, 0.8));
    Alert.alert("AI assist", `${suggestions.length} marker suggestions added.`);
  }

  function addAutomationEvent(type) {
    const t = quantizeTime(position, gridMode, song?.bpm);
    setAutomationEvents((prev) =>
      [
        ...prev,
        {
          id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type,
          timeSec: t,
          label: `${type} @ ${formatTime(t)}`,
        },
      ].sort((a, b) => a.timeSec - b.timeSec),
    );
  }

  async function handleSeek(seconds) {
    await audioEngine.seek(seconds);
    setPosition(seconds);
  }

  async function handlePlayPause() {
    if (isPlaying) {
      await audioEngine.pause();
      stopSequence();
      stopPolling();
      setIsPlaying(false);
    } else {
      const safeBpm = Number(bpmInput) || song?.bpm || 120;
      const songKey = transposedKey || song?.key || song?.originalKey || "C";
      const enginePosition = await audioEngine.getPosition().catch(() => 0);
      const startPosition = Number.isFinite(enginePosition)
        ? Math.max(0, enginePosition)
        : Math.max(0, position);
      setPosition(startPosition);

      if (startPosition < 0.5) {
        // ── Fresh start: count-in → pad → stems ────────────────────────────
        setCountInActive(true);
        setCountBeat(0);
        setPadActive(false);
        startSequence({
          bpm: safeBpm,
          timeSig: localTimeSig,
          songKey,
          padVol: 2,
          markers,
          position: 0,
          padVolume: 0.6,
          guideVolume: 0.85,
          lang: "PT",
          skipPad: true, // pad only starts when user explicitly picks a key via ♩ DRONE
          skipAudioCues: audioEngine.hasStemTracks(), // suppress voice cues when stems are playing
          onCountBeat: (b) => setCountBeat(b),
          onPadStart: () => setPadActive(true),
          onCueFire: (label) => {
            setActiveCueLabel(label);
            setTimeout(() => setActiveCueLabel(""), 4000);
          },
          onPlayStart: () => {
            audioEngine.play();
            setIsPlaying(true);
            startPolling();
            setCountInActive(false);
          },
        });
      } else {
        // ── Resume from middle: no count-in, schedule remaining cues ───────
        audioEngine.play();
        setIsPlaying(true);
        startPolling();
        scheduleCuesFromPosition({
          markers,
          position: startPosition,
          bpm: safeBpm,
          timeSig: localTimeSig,
          guideVolume: 0.85,
          onCueFire: (label) => {
            setActiveCueLabel(label);
            setTimeout(() => setActiveCueLabel(""), 4000);
          },
        });
      }
    }
  }

  async function handleStop() {
    stopSequence();
    await audioEngine.stop();
    stopPolling();
    setIsPlaying(false);
    setCountInActive(false);
    setCountBeat(0);
    setPadActive(false);
    setActiveCueLabel("");
    setPosition(0);
    setDuration(await audioEngine.getDuration());
  }

  async function armForLivePerformance() {
    try {
      setArming(true);
      const activeLoop = markers.find((m) => m.id === loopMarkerId);
      const history = await getArmedPipelineHistory();
      const previous = history[0] || null;
      const draftPayload = {
        songId: song?.id || null,
        songTitle: song?.title || "Unknown Song",
        artist: song?.artist || "",
        role: selectedRole,
        gridMode,
        bpm: Number(song?.bpm || 120),
        durationSec: duration,
        waveformPeaks: downsamplePeaks(waveformPeaks, 200),
        markers,
        loop: {
          enabled: loopEnabled,
          markerId: loopMarkerId,
          start: activeLoop?.start ?? null,
          end: activeLoop?.end ?? null,
        },
        performancePolicy: {
          launchQuantization,
          transitionMode,
          transientThreshold,
          jumpTargets: buildJumpTargets(markers, launchQuantization, song?.bpm),
        },
        automationLanes: {
          version: 1,
          events: automationEvents,
        },
        safetyPolicy: {
          mode: safetyMode,
        },
        restrictions: {
          allTrackIds: tracks.map((track) => track.id),
          visibleTrackIds: filteredTracks.map((track) => track.id),
          ownTrackId: ownTrackId || null,
          practiceMuteOwn,
          liveLock: true,
        },
      };
      const diff = diffArmedPipelines(draftPayload, previous);
      setLastDiffSummary(diff.summary);
      await saveArmedPipeline({
        ...draftPayload,
      });
      Alert.alert("Armed for Live", `Pipeline transferred.\n${diff.summary}`);
      navigation.navigate("Live", {
        song,
        userRole,
        mixerState: tracks,
        sections,
        waveformPeaks: downsamplePeaks(waveformPeaks, 200),
        bpm: adaptedBpm || song?.bpm || 120,
        markers,
        nextSong,
        serviceId: serviceId,
      });
    } catch (error) {
      Alert.alert("Arm failed", String(error?.message || error));
    } finally {
      setArming(false);
    }
  }

  // ── Tap Tempo ─────────────────────────────────────────────────────────────
  function handleTapTempo() {
    const now = Date.now();
    const taps = tapTimesRef.current;
    // Reset if last tap > 3 seconds ago
    if (taps.length > 0 && now - taps[taps.length - 1] > 3000) {
      tapTimesRef.current = [];
    }
    tapTimesRef.current.push(now);
    if (tapTimesRef.current.length > 8) tapTimesRef.current.shift();
    if (tapTimesRef.current.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const detected = Math.round(60000 / avg);
      setTapBpm(detected);
      setBpmInput(String(detected));
      // Adaptive Band Sync: smooth 10% approach toward detected BPM
      setAdaptedBpm(prev => {
        const next = prev + (detected - prev) * 0.1;
        return Math.round(next);
      });
      // Persist once 4+ taps give a stable reading
      if (tapTimesRef.current.length >= 4) {
        addOrUpdateSong({ ...song, bpm: detected }).catch(() => {});
      }
    }
  }

  // ── Drone Pad ─────────────────────────────────────────────────────────────
  // Routes through liveSequencer so only one pad ever plays at a time.
  async function playDrone(note) {
    if (note === droneNote) {
      // Tapping active note = stop the pad completely (never auto-restores)
      setDroneNote(null);
      stopSequencePad();
      return;
    }
    // Crossfade to the new key
    await startSequencePad(note, 2);
    setDroneNote(note);
    setDronePickerVisible(false);
  }

  async function stopDrone() {
    setDroneNote(null);
    setDronePickerVisible(false);
    stopSequencePad(); // just silence it — user must re-pick a key to restart
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  function toggleArmTrack(trackId) {
    if (armedTrackId === trackId) {
      setArmedTrackId(null); // disarm
    } else {
      setArmedTrackId(trackId);
    }
  }

  async function handleRecord() {
    if (isRecording) {
      // Stop recording
      try {
        await recordingRef.current?.stopAndUnloadAsync();
        const uri = recordingRef.current?.getURI();
        recordingRef.current = null;
        setIsRecording(false);
        const armedTrack = tracks.find((t) => t.id === armedTrackId);
        Alert.alert(
          "⏹ Recording Stopped",
          `Recorded ${armedTrack ? armedTrack.label : "audio"} saved.\nFile: ${uri || "n/a"}`,
        );
      } catch (e) {
        setIsRecording(false);
        Alert.alert("Record Error", String(e?.message || e));
      }
      return;
    }

    if (!armedTrackId) {
      Alert.alert(
        "No Track Armed",
        "Tap the ⏺ button on a stem track below to arm it for recording first.",
      );
      return;
    }

    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      // Also start playback if not already playing
      if (!isPlaying) {
        audioEngine.play();
        setIsPlaying(true);
        startPolling();
      }
    } catch (e) {
      Alert.alert(
        "Record Error",
        "Could not start recording: " + String(e?.message || e),
      );
    }
  }

  // ── Add marker at a specific waveform time (long press) ─────────────────
  function handleAddMarkerAtTime(seconds) {
    Alert.prompt(
      "📍 Add Marker",
      `At ${formatTime(seconds)} — type a label:`,
      (text) => {
        if (text === null || text === undefined) return;
        const label = text.trim() || "Marker";
        const labelNorm = label
          .toLowerCase()
          .replace(/[\s]*\d+\s*$/, "")
          .trim();
        const labelKey = labelNorm.replace(/\s+/g, "-");
        const start = Math.max(0, Math.min(seconds, duration || seconds + 1));
        const end = Math.min(duration || start + 8, start + 8);
        const SECTION_COLORS = {
          intro: "#6B7280",
          verse: "#6366F1",
          "pre-chorus": "#8B5CF6",
          prechorus: "#8B5CF6",
          chorus: "#EC4899",
          bridge: "#F59E0B",
          outro: "#10B981",
          tag: "#0EA5E9",
          vamp: "#0EA5E9",
          hook: "#EC4899",
        };
        const isSection = Object.prototype.hasOwnProperty.call(
          SECTION_COLORS,
          labelKey,
        );
        const typeId = isSection ? "section" : newMarkerType;
        const meta = getMarkerTypeMeta(typeId);
        const color =
          (isSection ? SECTION_COLORS[labelKey] : null) ||
          meta?.color ||
          "#4F46E5";
        const marker = {
          ...markerTemplate(
            label,
            start,
            Math.max(end, start + 0.5),
            color,
          ),
          type: typeId,
          color,
        };
        setMarkers((prev) =>
          [...prev, marker].sort((a, b) => a.start - b.start),
        );
        setSelectedMarkerId(marker.id);
      },
      "plain-text",
      "",
      undefined,
      { cancelable: true },
    );
  }

  // ── Tap an existing marker on the waveform → edit / delete ──────────────
  function handleWaveformMarkerTap(marker) {
    Alert.alert(`📍 ${marker.label}`, `Position: ${formatTime(marker.start)}`, [
      {
        text: "Rename",
        onPress: () =>
          Alert.prompt(
            "Rename Marker",
            "",
            (text) => {
              if (text?.trim())
                setMarkers((prev) =>
                  prev.map((m) =>
                    m.id === marker.id ? { ...m, label: text.trim() } : m,
                  ),
                );
            },
            "plain-text",
            marker.label,
          ),
      },
      {
        text: "Seek Here",
        onPress: () => handleSeek(marker.start),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setMarkers((prev) => prev.filter((m) => m.id !== marker.id));
          if (loopMarkerId === marker.id) {
            setLoopMarkerId(null);
            setLoopEnabled(false);
          }
          if (selectedMarkerId === marker.id) setSelectedMarkerId(null);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  // ── Drag marker directly on waveform ───────────────────────────────────
  function handleMarkerDrag(
    marker,
    nextValueSec,
    isFinal,
    mode = "move",
  ) {
    const quantizedValue =
      gridMode === "FREE"
        ? nextValueSec
        : quantizeTime(nextValueSec, gridMode, song?.bpm);
    const totalLen = effectiveDuration || null;
    setMarkers((prev) => {
      const updated = prev.map((m) => {
        if (m.id !== marker.id) return m;
        const safeDuration = Math.max(
          0.2,
          Number(m.end || 0) - Number(m.start || 0),
        );
        const currentStart = Number(m.start || 0);
        const currentEnd = Number(m.end || currentStart + safeDuration);
        if (mode === "resize-left") {
          const nextStart = Math.max(
            0,
            Math.min(totalLen || currentEnd - 0.2, quantizedValue),
          );
          return updateMarkerRange(
            m,
            nextStart,
            Math.max(nextStart + 0.2, currentEnd),
            totalLen,
          );
        }
        if (mode === "resize-right") {
          const nextEnd = Math.max(
            currentStart + 0.2,
            Math.min(totalLen || currentStart + safeDuration + 0.2, quantizedValue),
          );
          return updateMarkerRange(
            m,
            currentStart,
            nextEnd,
            totalLen,
          );
        }
        const nextStart = Math.max(
          0,
          Math.min(
            totalLen || Number.MAX_SAFE_INTEGER,
            quantizedValue,
          ),
        );
        return updateMarkerRange(
          m,
          nextStart,
          nextStart + safeDuration,
          totalLen,
        );
      });
      return updated.sort((a, b) => a.start - b.start);
    });
    if (isFinal) setSelectedMarkerId(marker.id);
  }

  // ── Drag section cue pins (top marker pills) left/right ────────────────
  function handleSectionMarkerDrag(sec, nextTimeSec, isFinal) {
    const total = Number(effectiveDuration || 0);
    if (!total || total <= 0) return;

    const snapped =
      gridMode === "FREE"
        ? nextTimeSec
        : quantizeTime(nextTimeSec, gridMode, song?.bpm);

    // Clamp between neighbor cue pins so sections can't overlap.
    const MIN_GAP = 0.2;
    const idx = (() => {
      const id = sec?.markerId || sec?.id || null;
      if (id) {
        const byId = sectionJumpList.findIndex(
          (s) => s?.markerId === id || s?.id === id,
        );
        if (byId >= 0) return byId;
      }
      const label = String(sec?.label || "").toLowerCase();
      let best = -1;
      let bestDist = Infinity;
      sectionJumpList.forEach((s, i) => {
        if (String(s?.label || "").toLowerCase() !== label) return;
        const d = Math.abs(Number(s?.timeSec || 0) - Number(sec?.timeSec || 0));
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      return best;
    })();

    const prevT = idx > 0 ? Number(sectionJumpList[idx - 1]?.timeSec || 0) : 0;
    const nextT =
      idx >= 0 && idx < sectionJumpList.length - 1
        ? Number(sectionJumpList[idx + 1]?.timeSec || total)
        : total;

    const maxStart = Math.max(0, total - MIN_GAP);
    let clamped = Math.max(0, Math.min(Number(snapped || 0), maxStart));
    if (idx >= 0) {
      clamped = Math.max(prevT + MIN_GAP, Math.min(nextT - MIN_GAP, clamped));
    }

    setMarkers((prev) => {
      const next = [...prev];
      const meta = getMarkerTypeMeta("section");
      const targetId = sec?.markerId ? String(sec.markerId) : null;
      let targetIdx = targetId
        ? next.findIndex((m) => String(m?.id || "") === targetId)
        : -1;

      if (targetIdx < 0) {
        // Fall back to label+time matching for legacy / base sections.
        const labelLower = String(sec?.label || "").toLowerCase();
        const time = Number(sec?.timeSec || 0);
        targetIdx = next.findIndex((m) => {
          if (coerceMarkerType(m?.type) !== "section") return false;
          const sameLabel =
            String(m?.label || "").toLowerCase() === labelLower;
          const nearTime = Math.abs(Number(m?.start || 0) - time) <= 1.0;
          return sameLabel && nearTime;
        });
      }

      if (targetIdx < 0) {
        // Create a new editable section marker so the cue becomes draggable/persistent.
        const start = Math.max(0, Math.min(Number(sec?.timeSec || 0), total));
        const end = Math.max(
          start + 0.5,
          Math.min(total, Number(sec?.endTimeSec || start + 8)),
        );
        const m = {
          ...markerTemplate(
            sec?.label || "Section",
            start,
            end,
            sec?.color || meta?.color || "#6366F1",
          ),
          type: "section",
          color: sec?.color || meta?.color || "#6366F1",
          sectionRef: sec?.id || null,
        };
        next.push(m);
        targetIdx = next.length - 1;
      }

      const target = next[targetIdx];
      const desiredEnd = Math.max(clamped + MIN_GAP, Math.min(nextT, total));
      next[targetIdx] = updateMarkerRange(
        {
          ...target,
          label: sec?.label || target.label,
          type: "section",
          color:
            target?.color || sec?.color || meta?.color || "#6366F1",
          sectionRef: target?.sectionRef || sec?.id || null,
        },
        clamped,
        desiredEnd,
        total,
      );

      // Best-effort: keep previous section marker region ending at this boundary.
      if (isFinal && idx > 0) {
        const prevPin = sectionJumpList[idx - 1];
        const prevId = prevPin?.markerId ? String(prevPin.markerId) : null;
        let prevIdx = prevId
          ? next.findIndex((m) => String(m?.id || "") === prevId)
          : -1;
        if (prevIdx < 0) {
          const labelLower = String(prevPin?.label || "").toLowerCase();
          const time = Number(prevPin?.timeSec || 0);
          prevIdx = next.findIndex((m) => {
            if (coerceMarkerType(m?.type) !== "section") return false;
            const sameLabel =
              String(m?.label || "").toLowerCase() === labelLower;
            const nearTime = Math.abs(Number(m?.start || 0) - time) <= 1.0;
            return sameLabel && nearTime;
          });
        }
        if (prevIdx >= 0) {
          const pm = next[prevIdx];
          next[prevIdx] = updateMarkerRange(
            { ...pm, type: "section", color: pm?.color || meta?.color || "#6366F1" },
            pm.start,
            clamped,
            total,
          );
        }
      }

      return next.sort((a, b) => a.start - b.start);
    });
  }

  function snapshotEditableSections(list = sectionJumpList) {
    return normalizeSectionsForStorage(
      list.map((s) => ({
        id: s.sectionRef || s.id,
        label: s.label,
        timeSec: s.timeSec,
        color: s.color,
      })),
    );
  }

  function renameSection(sec, nextLabel) {
    const trimmed = String(nextLabel || "").trim();
    if (!trimmed) return;
    const nextSections = snapshotEditableSections(
      sectionJumpList.map((s) => {
        const sameId = String(s?.id || "") === String(sec?.id || "");
        const sameMarker =
          sec?.markerId &&
          String(s?.markerId || "") === String(sec?.markerId || "");
        return sameId || sameMarker ? { ...s, label: trimmed } : s;
      }),
    );
    setUserSections(nextSections);
    if (activeSectionLabel === sec?.label) {
      setActiveSectionLabel(trimmed);
    }
    if (sec?.markerId) {
      setMarkers((prev) =>
        prev.map((m) =>
          String(m?.id || "") === String(sec.markerId)
            ? { ...m, label: trimmed }
            : m,
        ),
      );
    }
  }

  function deleteSection(sec) {
    const nextSections = snapshotEditableSections(
      sectionJumpList.filter((s) => {
        const sameId = String(s?.id || "") === String(sec?.id || "");
        const sameMarker =
          sec?.markerId &&
          String(s?.markerId || "") === String(sec?.markerId || "");
        return !(sameId || sameMarker);
      }),
    );
    setUserSections(nextSections);
    if (activeSectionLabel === sec?.label) {
      setActiveSectionLabel(null);
      setSectionLoopActive(false);
      setLoopEnabled(false);
    }
    if (loopMarkerId && String(loopMarkerId) === String(sec?.markerId || "")) {
      setLoopMarkerId(null);
    }
    if (selectedMarkerId && String(selectedMarkerId) === String(sec?.markerId || "")) {
      setSelectedMarkerId(null);
    }
    if (sec?.markerId) {
      setMarkers((prev) =>
        prev.filter((m) => String(m?.id || "") !== String(sec.markerId)),
      );
    }
  }

  function splitSection(sec) {
    const start = Number(sec?.timeSec ?? 0);
    const end = Number(sec?.endTimeSec ?? effectiveDuration ?? 0);
    const span = end - start;
    if (!Number.isFinite(span) || span < 8) {
      Alert.alert(
        "Split Section",
        "This section is too short to split cleanly.",
      );
      return;
    }
    const midpoint = Number((start + span / 2).toFixed(2));
    const leftLabel = /\sA$/i.test(sec?.label || "")
      ? sec.label
      : `${sec?.label || "Section"} A`;
    const rightLabel = /\sA$/i.test(sec?.label || "")
      ? String(sec.label).replace(/\sA$/i, " B")
      : `${sec?.label || "Section"} B`;

    const nextSections = [];
    sectionJumpList.forEach((item) => {
      const sameId = String(item?.id || "") === String(sec?.id || "");
      const sameMarker =
        sec?.markerId &&
        String(item?.markerId || "") === String(sec?.markerId || "");
      if (sameId || sameMarker) {
        nextSections.push({
          ...item,
          label: leftLabel,
          timeSec: start,
        });
        nextSections.push({
          id: `split_${Date.now()}_${Math.round(midpoint * 1000)}`,
          label: rightLabel,
          timeSec: midpoint,
          color: item?.color || "#6366F1",
        });
      } else {
        nextSections.push(item);
      }
    });

    setUserSections(snapshotEditableSections(nextSections));
    if (sec?.markerId) {
      setMarkers((prev) =>
        prev.map((m) =>
          String(m?.id || "") === String(sec.markerId)
            ? { ...m, label: leftLabel }
            : m,
        ),
      );
    }
  }

  function promptRenameSection(sec) {
    if (Platform.OS === "ios" && typeof Alert.prompt === "function") {
      Alert.prompt(
        "Rename Section",
        "",
        (newLabel) => renameSection(sec, newLabel),
        "plain-text",
        sec?.label || "",
      );
      return;
    }
    Alert.alert("Rename Section", "Section renaming is currently available on iPad/iPhone.");
  }

  // ── Long-press on a section pin → rename or delete ─────────────────────
  function handleSectionMenu(sec) {
    Alert.alert(`📍 ${sec.label}`, formatTime(sec.timeSec ?? 0), [
      {
        text: "Rename",
        onPress: () => promptRenameSection(sec),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            "Delete Section",
            `Remove "${sec.label}" from this song in rehearsal?`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => deleteSection(sec),
              },
            ],
          ),
      },
      {
        text: "Split",
        onPress: () => splitSection(sec),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function toggleMarkerSelection(markerId) {
    if (multiSelectMode) {
      setSelectedMarkerIds((prev) =>
        prev.includes(markerId)
          ? prev.filter((id) => id !== markerId)
          : [...prev, markerId],
      );
      return;
    }
    setSelectedMarkerId(markerId);
  }

  function applyTypeToSelection(typeId) {
    const ids = multiSelectMode
      ? selectedMarkerIds
      : selectedMarkerId
        ? [selectedMarkerId]
        : [];
    if (ids.length === 0) {
      setNewMarkerType(typeId);
      return;
    }
    setMarkers((prev) =>
      prev.map((m) => (ids.includes(m.id) ? applyMarkerType(m, typeId) : m)),
    );
  }

  function applyRenameToSelection() {
    const base = bulkRenameLabel.trim();
    if (!base) return;
    const ids = multiSelectMode
      ? selectedMarkerIds
      : selectedMarkerId
        ? [selectedMarkerId]
        : [];
    if (ids.length === 0) return;
    let idx = 1;
    setMarkers((prev) =>
      prev.map((m) => {
        if (!ids.includes(m.id)) return m;
        const label = ids.length > 1 ? `${base} ${idx++}` : base;
        return { ...m, label };
      }),
    );
    setBulkRenameLabel("");
  }

  // ── Section marker pin: tap=seek, double-tap=loop, triple-tap=worship loop ──
  function handleSectionTap(sec) {
    if (sectionEditMode) {
      handleSectionMenu(sec);
      return;
    }
    const now = Date.now();
    const last = lastSectionTapRef.current;
    const tc = sectionTapCountRef.current;
    const sameSection = last.label === sec.label;
    const doubleTap = sameSection && now - last.time < 450;

    // Triple-tap counter
    if (sameSection && now - tc.time < 600) {
      tc.count += 1;
    } else {
      tc.count = 1;
      tc.label = sec.label;
    }
    tc.time = now;
    lastSectionTapRef.current = { label: sec.label, time: now };

    // ── TRIPLE TAP → WORSHIP LOOP ────────────────────────────────────────
    if (tc.count >= 3) {
      tc.count = 0;
      setWorshipLoopActive(true);
      setSectionLoopActive(false);
      setLoopEnabled(false);
      setActiveSectionLabel(null);
      setAiSuggestion(null);
      // Fade all stems except pads to 0
      setTracks((prev) => prev.map((t) => {
        const isPad = /pad/i.test(t.label || t.id || '');
        return isPad
          ? { ...t, mute: false, volume: 1 }
          : { ...t, mute: true };
      }));
      speak('Free worship');
      setActiveCueLabel('✨  FREE WORSHIP');
      setTimeout(() => setActiveCueLabel(''), 4000);
      if (canBroadcastWorshipFlow(userRole)) {
        const roleKey = String(userRole || "")
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_");
        broadcastWorshipFreelyEvent({
          songTitle: song?.title || sec.label || "Worship Flow",
          triggeredBy:
            ROLE_DISPLAY_NAME[roleKey] || userRole || "Worship Leader",
          mode: "enter",
        }).catch(() => {});
      }
      return;
    }

    // ── DOUBLE TAP → LOOP SECTION ────────────────────────────────────────
    if (
      doubleTap ||
      (sameSection && activeSectionLabel === sec.label && !sectionLoopActive)
    ) {
      const end = sec.endTimeSec || effectiveDuration;
      const existing =
        (sec?.markerId
          ? markers.find((m) => String(m?.id || "") === String(sec.markerId))
          : null) ||
        markers.find((m) => {
          if (coerceMarkerType(m?.type) !== "section") return false;
          const sameLabel =
            String(m?.label || "").toLowerCase() ===
            String(sec?.label || "").toLowerCase();
          const nearTime = Math.abs(Number(m?.start || 0) - Number(sec?.timeSec || 0)) <= 1.0;
          return sameLabel && nearTime;
        }) ||
        markers.find((m) => m.label === sec.label);
      if (existing) {
        setMarkers((prev) =>
          prev.map((m) =>
            m.id === existing.id
              ? updateMarkerRange(
                  applyMarkerType(m, "section"),
                  sec.timeSec,
                  end,
                  effectiveDuration || null,
                )
              : m,
          ),
        );
        setLoopMarkerId(existing.id);
        setSelectedMarkerId(existing.id);
      } else {
        const meta = getMarkerTypeMeta("section");
        const m = {
          ...markerTemplate(
            sec.label,
            sec.timeSec,
            end,
            sec.color || meta?.color || "#4F46E5",
          ),
          type: "section",
          color: sec.color || meta?.color || "#4F46E5",
        };
        setMarkers((prev) => [...prev, m].sort((a, b) => a.start - b.start));
        setLoopMarkerId(m.id);
        setSelectedMarkerId(m.id);
      }
      setLoopEnabled(true);
      setSectionLoopActive(true);
      setActiveSectionLabel(sec.label);
      setWorshipLoopActive(false);
      handleSeek(sec.timeSec);
      if (!isPlaying) {
        audioEngine.play();
        setIsPlaying(true);
        startPolling();
      }
      speak(sec.label);
      // Predictive: count repeats for this section
      const rc = sectionRepeatCountRef.current;
      if (rc.label === sec.label) {
        rc.count += 1;
      } else {
        rc.label = sec.label;
        rc.count = 1;
      }
      _checkPredictiveFlow(sec.label, rc.count);
      return;
    }

    if (sameSection && sectionLoopActive) {
      // Tap active looping section → exit loop
      setLoopEnabled(false);
      setSectionLoopActive(false);
      setActiveSectionLabel(null);
      return;
    }

    // ── SINGLE TAP → SEEK + CONTINUE / START PLAYING ─────────────────────
    // If coming from worship loop, restore all stems first
    if (worshipLoopActive) {
      exitWorshipLoop({ silent: true });
    }
    setLoopEnabled(false);
    setSectionLoopActive(false);
    setWorshipLoopActive(false);
    setActiveSectionLabel(sec.label);
    handleSeek(sec.timeSec);

    // If not already playing, start playback from this section
    if (!isPlaying) {
      audioEngine.play();
      setIsPlaying(true);
      startPolling();
    }

    const specialCue = _sectionVoiceCue(sec.label);
    speak(specialCue || sec.label);
    setActiveCueLabel(specialCue ? `${sec.label} — ${specialCue}` : sec.label);
    setTimeout(() => setActiveCueLabel(''), 3000);
  }

  useEffect(() => {
    setSectionEditMode(false);
    setSectionEditorVisible(false);
  }, [song?.id]);

  /** Special voice cues per section (from voice_cues.json spec) */
  function _sectionVoiceCue(label) {
    const l = (label || '').toLowerCase();
    if (l === 'bridge') return 'Pads only';
    if (l === 'intro') return 'Band in';
    if (l === 'outro') return 'Outro';
    return null;
  }

  /** Predictive Flow AI: after 3+ repeats of a section, suggest next */
  function _checkPredictiveFlow(label, count) {
    if (count < 3) return;
    const l = (label || '').toLowerCase();
    let next = null;
    if (l === 'chorus') next = 'Bridge';
    else if (l === 'verse') next = 'Chorus';
    else if (l === 'bridge') next = 'Chorus';
    if (next) setAiSuggestion({ section: next, reason: `${count}× ${label} — suggest ${next}` });
  }

  /** Accept AI suggestion → jump to that section */
  function handleAcceptAiSuggestion() {
    if (!aiSuggestion) return;
    const sec = sectionJumpList.find(
      s => s.label.toLowerCase() === aiSuggestion.section.toLowerCase()
    );
    if (sec) {
      handleSeek(sec.timeSec);
      setActiveSectionLabel(sec.label);
      speak(sec.label);
    }
    sectionRepeatCountRef.current = { label: null, count: 0 };
    setAiSuggestion(null);
  }

  /** Exit Worship Loop — restore all stems */
  function exitWorshipLoop({ silent = false } = {}) {
    setWorshipLoopActive(false);
    setTracks((prev) => prev.map((t) => ({ ...t, mute: false })));
    if (!silent) {
      speak('Band in');
      setActiveCueLabel('Band in');
      setTimeout(() => setActiveCueLabel(''), 3000);
    }
    if (canBroadcastWorshipFlow(userRole)) {
      const roleKey = String(userRole || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
      broadcastWorshipFreelyEvent({
        songTitle: song?.title || activeSectionLabel || "",
        triggeredBy:
          ROLE_DISPLAY_NAME[roleKey] || userRole || "Worship Leader",
        mode: "exit",
      }).catch(() => {});
    }
  }

  function jumpToSetlistSong(idx) {
    const target = setlist[idx];
    if (!target) return;
    stopSequence();
    audioEngine.stop().catch(() => {});
    stopPolling();
    navigation.replace("Rehearsal", {
      song: target,
      setlist,
      setlistIndex: idx,
      apiBase,
      userRole,
      serviceId,
      service: serviceParam,
      plan: planParam,
      isAdmin,
      hideVocalSection,
      nextSong: setlist[idx + 1] || null,
    });
  }

  async function handleSendToAll() {
    if (!planParam || !serviceParam) {
      Alert.alert(
        "No Plan Data",
        'Return to Service Plan and use "ARM & Open Rehearsal" to enable Send to All.',
      );
      return;
    }
    try {
      const payload = {
        services: [serviceParam],
        people: (planParam.team || []).map((m) => ({
          id: m.personId,
          name: m.name,
          role: m.role,
        })),
        plans: { [serviceId]: planParam },
        vocalAssignments: { [serviceId]: vocalAssignments },
      };
      const res = await fetch(`${SYNC_URL}/sync/publish`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        Alert.alert(
          "📡 Sent!",
          `Plan + vocal assignments sent to ${(planParam.team || []).length} member(s). They can now sync in the Playback app.`,
        );
      } else {
        Alert.alert("Send Failed", JSON.stringify(data));
      }
    } catch (e) {
      Alert.alert(
        "Sync Error",
        "Could not reach sync server. Check your internet connection.",
      );
    }
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <CineStageProcessingOverlay
          visible
          title="Opening Rehearsal"
          subtitle="Loading your stems for playback..."
          steps={LOAD_STEPS}
          currentStepIndex={loadStep}
          progress={loadProgress}
        />
      </View>
    );
  }

  // ── Section jump list (new — not in data, derived from structure or defaults) ──
  const sectionJumpList = (() => {
    const COLORS = {
      intro: "#6B7280",
      verse: "#6366F1",
      "pre-chorus": "#8B5CF6",
      prechorus: "#8B5CF6",
      chorus: "#EC4899",
      bridge: "#F59E0B",
      outro: "#10B981",
      tag: "#0EA5E9",
    };
    const colorFor = (label, fallback) => {
      const key = String(label || "")
        .toLowerCase()
        .replace(/[\s]*\d+\s*$/, "")
        .trim()
        .replace(/\s+/g, "-");
      return fallback || COLORS[key] || "#6366F1";
    };
    let raw = [];
    if (userSections !== null) {
      // User-edited cues — highest priority, including intentional empty lists
      raw = userSections.map((s, i) => ({
        label: s.label,
        timeSec: s.timeSec ?? s.positionSeconds ?? 0,
        color: colorFor(s.label, s.color),
        id: s.id || `user_${i}`,
      }));
    } else if (sections.length > 0) {
      raw = sections.map((s, i) => ({
        label: s.label,
        timeSec: s.positionSeconds || 0,
        color: colorFor(s.label, s.color),
        id: `base_${i}_${Math.round((s.positionSeconds || 0) * 1000)}`,
      }));
    } else if (chartSections.length >= 2) {
      raw = chartSections.map((s, i) => ({
        label: s.label,
        timeSec: s.positionSeconds || 0,
        color: colorFor(s.label, s.color),
        id: `chart_${i}_${Math.round((s.positionSeconds || 0) * 1000)}`,
      }));
    } else if (effectiveDuration > 0) {
      raw = [
        { label: "Intro", timeSec: 0, color: COLORS.intro, id: "default_intro" },
        {
          label: "Verse",
          timeSec: effectiveDuration * 0.08,
          color: COLORS.verse,
          id: "default_verse",
        },
        {
          label: "Chorus",
          timeSec: effectiveDuration * 0.29,
          color: COLORS.chorus,
          id: "default_chorus",
        },
        {
          label: "Bridge",
          timeSec: effectiveDuration * 0.65,
          color: COLORS.bridge,
          id: "default_bridge",
        },
        {
          label: "Outro",
          timeSec: effectiveDuration * 0.82,
          color: COLORS.outro,
          id: "default_outro",
        },
      ];
    }

    // Merge in user-editable section markers (type=section) so cues can be added/dragged.
    const markerPins = markers
      .filter((m) => coerceMarkerType(m?.type) === "section")
      .map((m) => ({
        id: `mkpin_${m.id}`,
        markerId: m.id,
        sectionRef: m.sectionRef || null,
        label: m.label,
        timeSec: Number(m.start || 0),
        color: colorFor(m.label, m.color),
      }));

    const merged = [...raw];
    markerPins.forEach((mp) => {
      let matchIdx = -1;
      if (mp.sectionRef) {
        matchIdx = merged.findIndex(
          (b) => String(b?.id || "") === String(mp.sectionRef),
        );
      }
      if (matchIdx < 0) {
        matchIdx = merged.findIndex((b) => {
          const sameLabel =
            String(b?.label || "").toLowerCase() ===
            String(mp?.label || "").toLowerCase();
          const nearTime =
            Math.abs(Number(b?.timeSec || 0) - Number(mp?.timeSec || 0)) <=
            1.0;
          return sameLabel && nearTime;
        });
      }
      if (matchIdx >= 0) merged[matchIdx] = { ...merged[matchIdx], ...mp };
      else merged.push(mp);
    });

    const sorted = merged
      .filter((s) => s && Number.isFinite(Number(s.timeSec)))
      .sort((a, b) => Number(a.timeSec) - Number(b.timeSec));

    // Attach endTimeSec = next section's start (or effectiveDuration for last)
    return sorted.map((sec, i) => ({
      ...sec,
      endTimeSec: sorted[i + 1] ? sorted[i + 1].timeSec : effectiveDuration,
    }));
  })();

  const currentSectionLabel = (() => {
    if (!sectionJumpList.length || effectiveDuration <= 0) return null;
    for (let i = sectionJumpList.length - 1; i >= 0; i--) {
      if (position >= sectionJumpList[i].timeSec)
        return sectionJumpList[i].label;
    }
    return sectionJumpList[0].label;
  })();

  // ── Time sig cycle ────────────────────────────────────────────────────────
  function cycleSig() {
    setLocalTimeSig((prev) => {
      const idx = TIME_SIGS.indexOf(prev);
      return TIME_SIGS[(idx + 1) % TIME_SIGS.length];
    });
  }

  // ── Light cues CRUD ───────────────────────────────────────────────────────
  function addLightCue() {
    if (!newLightLabel.trim()) return;
    const cue = {
      id: String(Date.now()),
      time: position,
      label: newLightLabel.trim(),
    };
    const next = [...lightCues, cue].sort((a, b) => a.time - b.time);
    setLightCues(next);
    if (song?.id)
      AsyncStorage.setItem(
        `um/lightcues/${song.id}`,
        JSON.stringify(next),
      ).catch(() => {});
    setNewLightLabel("");
  }
  function deleteLightCue(id) {
    const next = lightCues.filter((c) => c.id !== id);
    setLightCues(next);
    if (song?.id)
      AsyncStorage.setItem(
        `um/lightcues/${song.id}`,
        JSON.stringify(next),
      ).catch(() => {});
  }

  // ── Add stem track (recording track) ────────────────────────────────────
  function handleAddCustomTrack() {
    if (!newTrackType) {
      Alert.alert("Select a track type first.");
      return;
    }
    const name = newTrackName.trim() || newTrackType.label;
    const track = {
      id: "rec_" + Date.now(),
      type: newTrackType.id,
      label: name,
      name,
      uri: null,
      volume: 1,
      mute: false,
      solo: false,
      armed: true,
      isRecordTrack: true,
      inputUid: selectedInput?.uid || null,
      inputName: selectedInput?.name || null,
      inputChannel: selectedChannel,
    };
    // Route recording to the selected interface input
    if (selectedInput) {
      safeSetPreferredInputAsync(selectedInput);
    }
    setCustomTracks((prev) => [...prev, track]);
    setTracks((prev) => [...prev, track]);
    setArmedTrackId(track.id);
    setAddTrackVisible(false);
    setNewTrackName("");
    setNewTrackType(null);
    setSelectedChannel(1);
  }

  // Responsive dynamic values
  const padH = R.containerPadH;
  // Full-width mode: when YOUR PART is hidden, waveform gets extra height
  const isFullWidthMode = hideVocalSection;
  const waveH = isFullWidthMode
    ? Math.round(R.height * 0.40)
    : R.waveformHeight;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.container,
        { paddingHorizontal: padH, alignItems: "stretch" },
        R.contentMaxWidth
          ? { maxWidth: R.contentMaxWidth, alignSelf: "center", width: "100%" }
          : null,
      ]}
    >
      {/* ── ADD STEM TRACK MODAL ──────────────────────────────────────────── */}
      <Modal
        visible={addTrackVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setAddTrackVisible(false);
          setNewTrackType(null);
          setNewTrackName("");
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <TouchableOpacity
            style={styles.modalBg}
            activeOpacity={1}
            onPress={() => {
              setAddTrackVisible(false);
              setNewTrackType(null);
              setNewTrackName("");
            }}
          >
            <View
              style={styles.addTrackPanel}
              onStartShouldSetResponder={() => true}
            >
              <Text style={styles.addTrackTitle}>+ New Stem Track</Text>
              <Text style={styles.addTrackSubtitle}>
                Select instrument to record
              </Text>

              {/* Type grid */}
              <View style={styles.stemTypeGrid}>
                {STEM_TRACK_TYPES.map((t) => {
                  const selected = newTrackType?.id === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.stemTypeBtn,
                        selected && {
                          borderColor: t.color,
                          backgroundColor: t.color + "22",
                        },
                      ]}
                      onPress={() => {
                        setNewTrackType(t);
                        if (!newTrackName) setNewTrackName(t.label);
                      }}
                    >
                      <Text style={styles.stemTypeIcon}>{t.icon}</Text>
                      <Text
                        style={[
                          styles.stemTypeLabel,
                          selected && { color: t.color },
                        ]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Custom name (auto-filled from type, editable) */}
              {newTrackType && (
                <TextInput
                  style={[
                    styles.addTrackInput,
                    { marginTop: 12, borderColor: newTrackType.color + "80" },
                  ]}
                  value={newTrackName}
                  onChangeText={setNewTrackName}
                  placeholder={`Name (e.g. Lead ${newTrackType.label})`}
                  placeholderTextColor="#4B5563"
                  returnKeyType="done"
                />
              )}

              {/* ── Input source (audio interface) ──────────────────────── */}
              <Text style={styles.addTrackSectionLabel}>Input Source</Text>
              {availableInputs.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 4 }}
                >
                  {availableInputs.map((inp) => {
                    const active = selectedInput?.uid === inp.uid;
                    const icon =
                      inp.type === "bluetooth"
                        ? "🎧"
                        : inp.type === "usbAudio"
                          ? "🔌"
                          : inp.type === "headphones"
                            ? "🎧"
                            : "🎙";
                    return (
                      <TouchableOpacity
                        key={inp.uid}
                        style={[
                          styles.inputDeviceBtn,
                          active && styles.inputDeviceBtnActive,
                        ]}
                        onPress={() => setSelectedInput(inp)}
                      >
                        <Text style={styles.inputDeviceIcon}>{icon}</Text>
                        <Text
                          style={[
                            styles.inputDeviceName,
                            active && { color: "#A5B4FC" },
                          ]}
                          numberOfLines={2}
                        >
                          {inp.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={styles.inputDeviceNone}>
                  No external interface detected — using built-in mic
                </Text>
              )}

              {/* ── Channel selector ────────────────────────────────────── */}
              <Text style={styles.addTrackSectionLabel}>Channel</Text>
              <View style={styles.channelRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
                  const active = selectedChannel === ch;
                  const col = newTrackType?.color || "#6366F1";
                  return (
                    <TouchableOpacity
                      key={ch}
                      style={[
                        styles.channelBtn,
                        active && {
                          borderColor: col,
                          backgroundColor: col + "22",
                        },
                      ]}
                      onPress={() => setSelectedChannel(ch)}
                    >
                      <Text
                        style={[
                          styles.channelBtnText,
                          active && { color: col },
                        ]}
                      >
                        {ch}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.addTrackBtnRow}>
                <TouchableOpacity
                  style={styles.addTrackCancel}
                  onPress={() => {
                    setAddTrackVisible(false);
                    setNewTrackType(null);
                    setNewTrackName("");
                  }}
                >
                  <Text style={styles.addTrackCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.addTrackConfirm,
                    !newTrackType && { opacity: 0.4 },
                  ]}
                  onPress={handleAddCustomTrack}
                  disabled={!newTrackType}
                >
                  <Text style={styles.addTrackConfirmText}>⏺ Add & Arm</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.addTrackHint}>
                Track will be armed — tap ⏺ REC to start recording
              </Text>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── COMPACT TRANSPORT BAR ─────────────────────────────────────────── */}
      <View style={styles.transportBar}>
        {/* Count-in overlay */}
        {countInActive && (
          <View style={styles.countInOverlay}>
            <Text style={styles.countInBeat}>{countBeat || "..."}</Text>
            <Text style={styles.countInLabel}>count in</Text>
          </View>
        )}
        {/* Voice cue flash */}
        {!!activeCueLabel && !countInActive && (
          <View style={styles.cueFlyover}>
            <Text style={styles.cueFlyoverText}>
              {activeCueLabel.toUpperCase()}
            </Text>
            {padActive && <Text style={styles.padActiveDot}>● PAD</Text>}
          </View>
        )}
        {/* Row 1: Song name + timer (Clean borderless header) */}
        <View style={styles.transportBarTop}>
          <TouchableOpacity
            style={styles.setlistPill}
            onPress={() => setlist.length > 1 && setSetlistPanelOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.backBtnText}>‹</Text>
            </TouchableOpacity>

            <Text style={styles.transportSongName} numberOfLines={1}>
              {song?.title || "Rehearsal"}
            </Text>
            {setlist.length > 1 && (
              <Text style={styles.setlistPillArrow}>
                {setlistPanelOpen ? "▲" : "▼"}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.transportTimer}>
            <Text style={styles.transportPos}>{formatTime(position)}</Text>
            <Text style={styles.transportDur}> / {formatTime(effectiveDuration)}</Text>
          </Text>
        </View>

        {/* Setlist dropdown */}
        {setlistPanelOpen && setlist.length > 1 && (
          <View style={styles.setlistDropdown}>
            {setlist.map((s, idx) => {
              const isCurrent = idx === setlistIndex;
              return (
                <TouchableOpacity
                  key={s.id || idx}
                  style={[
                    styles.setlistDropdownRow,
                    isCurrent && styles.setlistDropdownRowActive,
                  ]}
                  onPress={() => {
                    setSetlistPanelOpen(false);
                    if (!isCurrent) jumpToSetlistSong(idx);
                  }}
                >
                  <Text
                    style={[
                      styles.setlistDropdownNum,
                      isCurrent && { color: "#6366F1" },
                    ]}
                  >
                    {idx + 1}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.setlistDropdownTitle,
                        isCurrent && { color: "#E0E7FF" },
                      ]}
                      numberOfLines={1}
                    >
                      {s.title || "Song"}
                    </Text>
                    {s.key || s.bpm ? (
                      <Text style={styles.setlistDropdownMeta}>
                        {[s.key && `Key: ${s.key}`, s.bpm && `${s.bpm} BPM`]
                          .filter(Boolean)
                          .join("  ·  ")}
                      </Text>
                    ) : null}
                  </View>
                  {isCurrent && (
                    <Text style={styles.setlistDropdownCurrent}>▶ Now</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Transport Controls & Pills Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tbRow3Scroll}
          contentContainerStyle={styles.tbRow3Content}
        >
          {/* Playback Controls Group */}
          <View style={styles.tbPlaybackGroup}>
            <TouchableOpacity style={styles.tbBtn} disabled>
              <Text style={[styles.tbBtnText, { opacity: 0.3 }]}>⏮</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tbBtn} onPress={handleStop}>
              <Text style={[styles.tbBtnText, { color: "#F87171", fontSize: 10, marginTop: 2 }]}>■</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tbPlayBtn, !audioLoaded && tracks.length > 0 && { borderColor: '#EF4444' }]} onPress={handlePlayPause}>
              <Text style={styles.tbPlayBtnText}>{isPlaying ? "⏸" : "▶"}</Text>
              {!audioLoaded && tracks.length > 0 && (
                <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 7, fontWeight: '900' }}>NO AUDIO</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tbBtn, !setlistNextSong && { opacity: 0.3 }]}
              disabled={!setlistNextSong}
              onPress={() => setlistNextSong && jumpToSetlistSong(setlistIndex + 1)}
            >
              <Text style={styles.tbBtnText}>⏭</Text>
            </TouchableOpacity>
          </View>

          {/* BPM */}
          <View style={styles.tbMenuPill}>
            <Text style={styles.tbMenuPillLabel}>BPM</Text>
            <TextInput
              style={styles.tbMenuBpmInput}
              value={bpmInput}
              onChangeText={setBpmInput}
              onSubmitEditing={() => {
                const n = Number(bpmInput);
                if (n >= 40 && n <= 240) {
                  setAdaptedBpm(n);
                  addOrUpdateSong({ ...song, bpm: n }).catch(() => {});
                }
              }}
              onBlur={() => {
                const n = Number(bpmInput);
                if (n >= 40 && n <= 240) {
                  setAdaptedBpm(n);
                  addOrUpdateSong({ ...song, bpm: n }).catch(() => {});
                }
              }}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={3}
              selectTextOnFocus
            />
          </View>

          {/* TAP */}
          <TouchableOpacity style={styles.tbMenuBtn} onPress={handleTapTempo}>
            <Text style={styles.tbMenuBtnText}>TAP</Text>
          </TouchableOpacity>

          {/* Time Sig */}
          <TouchableOpacity
            style={[styles.tbMenuBtn, { borderColor: "#14B8A6", backgroundColor: "#0F766E22" }]}
            onPress={cycleSig}
          >
            <Text style={[styles.tbMenuBtnText, { color: "#5EEAD4" }]}>
              {localTimeSig}
            </Text>
          </TouchableOpacity>

          {/* Key / Pad (merged key picker + drone) */}
          <TouchableOpacity
            style={[
              styles.tbMenuBtn,
              droneNote
                ? { borderColor: "#F59E0B", backgroundColor: "#1A100A" }
                : { borderColor: "#6366F1", backgroundColor: "#4F46E520" },
              keyPickerOpen && !droneNote && { backgroundColor: "#1A1A3A" },
            ]}
            onPress={() => { setKeyPickerOpen((v) => !v); setDronePickerVisible(false); }}
          >
            {droneNote ? (
              <View style={{ alignItems: "center", gap: 1 }}>
                <Text style={{ color: "#FCD34D", fontSize: 13, fontWeight: "900" }}>{droneNote}</Text>
                <Text style={{ color: "#F59E0B", fontSize: 8, fontWeight: "700" }}>♩ PAD</Text>
              </View>
            ) : (
              <Text style={[styles.tbMenuBtnText, { color: "#A5B4FC" }]}>♪ {transposedKey}</Text>
            )}
          </TouchableOpacity>

          {/* Markers */}
          <TouchableOpacity
            style={[
              styles.tbMenuBtn,
              markersPanelOpen && styles.tbMenuBtnActive,
              markers.length > 0 && !markersPanelOpen && { borderColor: '#F59E0B', backgroundColor: '#92400E22' },
            ]}
            onPress={() => {
              setMarkersPanelOpen((v) => !v);
              setLightPanelOpen(false);
              setKeyPickerOpen(false);
            }}
          >
            <Text style={[styles.tbMenuBtnText, (markersPanelOpen || markers.length > 0) && { color: '#FCD34D' }]}>
              📍 MARKS{markers.length > 0 ? ` (${markers.length})` : ''}
            </Text>
          </TouchableOpacity>

          {/* REC */}
          <TouchableOpacity
            style={[styles.tbMenuBtn, isRecording && { borderColor: '#EF4444', backgroundColor: '#3A0A0A' }]}
            onPress={handleRecord}
          >
            <View style={styles.tbRecordRow}>
              <View style={[styles.tbRecordDot, isRecording && styles.tbRecordDotActive]} />
              <Text style={[styles.tbMenuBtnText, isRecording && { color: '#FCA5A5' }]}>
                {isRecording ? 'REC' : armedTrackId ? 'ARMED' : 'REC'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Lights */}
          <TouchableOpacity
            style={[styles.tbMenuBtn, lightPanelOpen && { borderColor: '#FCD34D', backgroundColor: '#1A1500' }]}
            onPress={() => { setLightPanelOpen((v) => !v); setMarkersPanelOpen(false); }}
          >
            <Text style={[styles.tbMenuBtnText, lightPanelOpen && { color: '#FCD34D' }]}>💡 LIC</Text>
          </TouchableOpacity>

          {/* + Track */}
          <TouchableOpacity style={styles.tbMenuBtn} onPress={() => setAddTrackVisible(true)}>
            <Text style={styles.tbMenuBtnText}>+ TRACK</Text>
          </TouchableOpacity>

          {/* Studio */}
          <TouchableOpacity style={[styles.tbMenuBtn, { borderColor: '#4F46E5', backgroundColor: '#4F46E510' }]} onPress={() => navigation.navigate('Studio', { song })}>
            <Text style={[styles.tbMenuBtnText, { color: '#A5B4FC' }]}>🎛 STUDIO</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tbMenuBtn,
              sectionEditMode
                ? styles.tbMenuBtnActive
                : { borderColor: "#F59E0B", backgroundColor: "#1A1208" },
            ]}
            onPress={() => {
              setSectionEditorVisible(false);
              setSectionEditMode((prev) => !prev);
            }}
            onLongPress={() => {
              setSectionEditMode(false);
              setSectionEditorVisible(true);
            }}
          >
            <Text style={[styles.tbMenuBtnText, { color: "#FCD34D" }]}>
              {sectionEditMode ? "✂ DONE" : "✂ SECTIONS"}
            </Text>
          </TouchableOpacity>

          {/* Settings */}
          <TouchableOpacity style={styles.tbMenuBtn} onPress={() => setSettingsModalVisible(true)}>
            <Text style={styles.tbMenuBtnText}>⚙ SETTINGS</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ── Waveform Pipeline ────────────────────────────────────────────── */}
        <View style={styles.rehWaveCard}>
          {sectionEditMode ? (
            <View style={styles.sectionEditBanner}>
              <Text style={styles.sectionEditBannerText}>
                Section edit mode is on. Tap a section on the waveform to rename, split, or delete it.
              </Text>
            </View>
          ) : null}
          <WaveformTimeline
            sections={sectionJumpList}
            markers={markers}
            automationEvents={[]}
            lengthSeconds={effectiveDuration}
            playheadPct={effectiveDuration > 0 ? position / effectiveDuration : 0}
            waveformPeaks={waveformPeaks}
            onSeek={(pct) => handleSeek(pct * effectiveDuration)}
            bpm={adaptedBpm}
            songTitle={song?.title || ''}
            sectionMarkers={sectionJumpList}
            activeSectionLabel={activeSectionLabel}
            sectionLoopActive={sectionLoopActive}
            sectionEditMode={sectionEditMode}
            onSectionTap={(sec) => handleSectionTap(sec)}
            onSectionMenu={handleSectionMenu}
            onSectionMarkerDrag={handleSectionMarkerDrag}
            onMarkerTap={handleWaveformMarkerTap}
            onMarkerDrag={(marker, nextSec, isFinal) => handleMarkerDrag(marker, nextSec, isFinal)}
            height={R.waveformHeight}
            worshipFreeActive={worshipLoopActive}
          />

          <EnergyCurveStrip
            performanceGraph={csAnalysis?.performance_graph || song?.analysis?.performance_graph}
            sections={sectionJumpList}
            positionSec={position}
            totalDuration={effectiveDuration}
          />
        </View>

        {/* ── Worship Flow AI compact insights ─────────────────────────────── */}
        {(() => {
          const wfi = song?.worshipFlowInsights;
          if (!wfi) return null;
          const likelihood = Number(wfi.worshipFreelyLikelihood || 0);
          const ENERGY_COLOR = { low: '#6B7280', medium: '#F59E0B', high: '#EC4899', peak: '#EF4444' };
          return (
            <View style={styles.wfCompact}>
              <View style={styles.wfCompactHeader}>
                <Text style={styles.wfCompactTitle}>✦ Worship Flow</Text>
                {wfi.tempoFeel ? (
                  <View style={styles.wfTempoChip}>
                    <Text style={styles.wfTempoChipText}>{String(wfi.tempoFeel).toUpperCase()}</Text>
                  </View>
                ) : null}
                {likelihood > 0 && (
                  <View style={styles.wfFreelyPill}>
                    <Text style={styles.wfFreelyPillText}>
                      🙏 {Math.round(likelihood * 100)}% freely
                    </Text>
                  </View>
                )}
              </View>
              {Array.isArray(wfi.energyFlow) && wfi.energyFlow.length > 0 && (
                <View style={styles.wfEnergyRow}>
                  {wfi.energyFlow.slice(0, 6).map((e, i) => (
                    <View key={i} style={[styles.wfEnergyDot, { backgroundColor: ENERGY_COLOR[e.energy] || '#6366F1' }]}>
                      <Text style={styles.wfEnergyDotLabel} numberOfLines={1}>{e.section}</Text>
                    </View>
                  ))}
                </View>
              )}
              {Array.isArray(wfi.mixingTips) && wfi.mixingTips[0] ? (
                <Text style={styles.wfMixTip} numberOfLines={2}>🎚 {wfi.mixingTips[0]}</Text>
              ) : null}
              {wfi.worshipFreelyMoment ? (
                <Text style={styles.wfFreelyMoment} numberOfLines={1}>🙏 {wfi.worshipFreelyMoment}</Text>
              ) : null}
            </View>
          );
        })()}

        {/* ── Stem Mixer ────────────────────────────────────────────────────── */}
        {filteredTracks.length > 0 && (() => {
          const activeNorm = String(activeSectionLabel || '').toLowerCase().replace(/[\s]*\d+\s*$/, '').trim();
          const mixPreset = SECTION_MIX_PRESETS[activeNorm] || null;
          return (
          <View style={styles.rehStemDeck}>
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => setShowMixer(prev => !prev)}
              style={styles.rehStemDeckHeader}
            >
              <Text style={styles.rehStemDeckTitle}>Stem Mix {showMixer ? "▾" : "▸"}</Text>
              <Text style={styles.rehStemDeckCount}>{filteredTracks.length} tracks</Text>
            </TouchableOpacity>            
            {showMixer && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rehStemDeckRow}
              >
                {filteredTracks.map((track) => (
                  <DawChannelStrip
                    key={track.id}
                    track={track}
                    isPlaying={isPlaying}
                    aiLevel={mixPreset ? (mixPreset[inferTrackType(track)] ?? null) : null}
                    onMute={() => {
                      setTracks((prev) =>
                        prev.map((t) =>
                          t.id === track.id ? { ...t, mute: !t.mute } : t,
                        ),
                      );
                    }}
                    onSolo={() => {
                      setTracks((prev) => {
                        const anySolo = prev.some((t) => t.id !== track.id && t.solo);
                        return prev.map((t) =>
                          t.id === track.id
                            ? { ...t, solo: !t.solo }
                            : anySolo
                            ? t
                            : { ...t, solo: false },
                        );
                      });
                    }}
                    onVolumeChange={(v) => {
                      setTracks((prev) =>
                        prev.map((t) =>
                          t.id === track.id ? { ...t, volume: v } : t,
                        ),
                      );
                    }}
                  />
                ))}
              </ScrollView>
            )}
          </View>
          );
        })()}

        {/* ── Key / Pad picker (merged key + drone) ─────────────────── */}
        {keyPickerOpen && (
          <View style={styles.dronePickerContainer}>
            {/* Section label */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 4, gap: 8 }}>
              <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>KEY / PAD</Text>
              {droneNote && (
                <TouchableOpacity style={styles.droneStopInline} onPress={() => { stopDrone(); }}>
                  <Text style={styles.droneStopInlineText}>■ Stop Pad</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={[styles.droneInlineRow, { flexWrap: "wrap" }]}>
              {CHROMATIC_NOTES.map((note) => {
                const isDrone = droneNote === note;
                const isKey   = transposedKey === note;
                const isSharp = note.includes("#");
                return (
                  <TouchableOpacity
                    key={note}
                    style={[
                      styles.droneInlineNote,
                      isDrone && { borderColor: "#F59E0B", backgroundColor: "#1A100A" },
                      !isDrone && isKey && { borderColor: "#6366F1", backgroundColor: "#1A1A3A" },
                      isSharp && styles.droneInlineNoteSharp,
                    ]}
                    onPress={() => {
                      setTransposedKey(note);
                      // Toggle drone: if this note is already the drone, stop it; otherwise start it
                      if (isDrone) {
                        stopDrone();
                      } else {
                        playDrone(note);
                      }
                      setKeyPickerOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.droneInlineNoteText,
                        isDrone && { color: "#FCD34D", fontSize: 15 },
                        !isDrone && isKey && { color: "#A5B4FC", fontSize: 15 },
                      ]}
                    >
                      {note}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Hint */}
            <Text style={{ color: '#374151', fontSize: 10, paddingHorizontal: 8, paddingTop: 4 }}>
              Tap a note to set key + play pad · tap active note to stop pad
            </Text>
          </View>
        )}

        {/* Light Cues panel */}
        {lightPanelOpen && (
          <View style={styles.cuePanelBox}>
            <View style={styles.cuePanelHeader}>
              <Text style={styles.cuePanelTitle}>💡 Light Cues</Text>
              <Text style={styles.cuePanelSub}>{formatTime(position)}</Text>
            </View>
            <View style={styles.cueAddRow}>
              <TextInput
                style={styles.cueInput}
                value={newLightLabel}
                onChangeText={setNewLightLabel}
                placeholder="Cue label (e.g. Chorus - Red wash)..."
                placeholderTextColor="#4B5563"
                returnKeyType="done"
                onSubmitEditing={addLightCue}
              />
              <TouchableOpacity style={styles.cueAddBtn} onPress={addLightCue}>
                <Text style={styles.cueAddBtnText}>+ Add</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.cueList} nestedScrollEnabled>
              {lightCues.length === 0 ? (
                <Text style={styles.cueEmptyText}>
                  No cues yet — press + Add at any position.
                </Text>
              ) : (
                lightCues.map((cue) => (
                  <View key={cue.id} style={styles.cueRow}>
                    <Text style={styles.cueTime}>{formatTime(cue.time)}</Text>
                    <Text style={styles.cueLabel} numberOfLines={1}>
                      {cue.label}
                    </Text>
                    <TouchableOpacity onPress={() => deleteLightCue(cue.id)}>
                      <Text style={styles.cueDelete}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}

      </View>
      {/* ── Section Editor Modal ─────────────────────────────────────────── */}
      <Modal
        visible={sectionEditorVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSectionEditorVisible(false)}
      >
        <TouchableOpacity
          style={styles.settingsOverlay}
          activeOpacity={1}
          onPress={() => setSectionEditorVisible(false)}
        />
        <View style={styles.settingsSheet}>
          <View style={styles.settingsSheetHandle} />
          <Text style={styles.settingsSheetTitle}>✂ Edit Song Sections</Text>
          <Text style={styles.sectionEditorHint}>
            Remove or split the sections you do not want to use in rehearsal. To move a
            section in time, drag its pin on the waveform. Long-press the ✂ button to
            reopen this full list.
          </Text>

          <ScrollView
            style={styles.sectionEditorList}
            contentContainerStyle={styles.sectionEditorListContent}
            showsVerticalScrollIndicator={false}
          >
            {sectionJumpList.length === 0 ? (
              <View style={styles.sectionEditorEmpty}>
                <Text style={styles.sectionEditorEmptyText}>
                  No sections available for this song right now.
                </Text>
              </View>
            ) : (
              sectionJumpList.map((sec) => (
                <View
                  key={`${sec.id}_${Math.round(Number(sec.timeSec || 0) * 1000)}`}
                  style={styles.sectionEditorRow}
                >
                  <View style={styles.sectionEditorInfo}>
                    <View
                      style={[
                        styles.sectionEditorSwatch,
                        { backgroundColor: sec.color || "#6366F1" },
                      ]}
                    />
                    <View style={styles.sectionEditorMeta}>
                      <Text style={styles.sectionEditorTitle}>{sec.label}</Text>
                      <Text style={styles.sectionEditorTime}>
                        Starts at {formatTime(sec.timeSec ?? 0)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.sectionEditorActions}>
                    <TouchableOpacity
                      style={styles.sectionEditorActionBtn}
                      onPress={() => promptRenameSection(sec)}
                    >
                      <Text style={styles.sectionEditorActionText}>Rename</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.sectionEditorActionBtn}
                      onPress={() => splitSection(sec)}
                    >
                      <Text style={styles.sectionEditorActionText}>Split</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sectionEditorActionBtn, styles.sectionEditorDeleteBtn]}
                      onPress={() =>
                        Alert.alert(
                          "Delete Section",
                          `Remove "${sec.label}" from this song in rehearsal?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () => deleteSection(sec),
                            },
                          ],
                        )
                      }
                    >
                      <Text style={[styles.sectionEditorActionText, styles.sectionEditorDeleteText]}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.settingsActionsRow}>
            <TouchableOpacity
              style={styles.settingsActionBtn}
              onPress={() => setUserSections(null)}
            >
              <Text style={styles.settingsActionText}>↺ Restore Auto Sections</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.settingsCloseBtn}
            onPress={() => setSectionEditorVisible(false)}
          >
            <Text style={styles.settingsCloseBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Settings Modal ────────────────────────────────────────────────── */}
      <Modal
        visible={settingsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.settingsOverlay}
          activeOpacity={1}
          onPress={() => setSettingsModalVisible(false)}
        />
        <View style={styles.settingsSheet}>
          <View style={styles.settingsSheetHandle} />
          <Text style={styles.settingsSheetTitle}>⚙  Settings</Text>

          {/* Pipeline Settings */}
          <Text style={styles.settingsSectionLabel}>PIPELINE</Text>

          <View style={styles.pipelineRow}>
            <Text style={styles.pipelineRowLabel}>Grid</Text>
            <View style={styles.pipelinePills}>
              {GRID_MODES.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.pipelinePill, gridMode === m && styles.pipelinePillActive]}
                  onPress={() => setGridMode(m)}
                >
                  <Text style={[styles.pipelinePillText, gridMode === m && styles.pipelinePillTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.pipelineRow}>
            <Text style={styles.pipelineRowLabel}>Launch</Text>
            <View style={styles.pipelinePills}>
              {LAUNCH_QUANTIZATION_MODES.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.pipelinePill, launchQuantization === m && styles.pipelinePillActive]}
                  onPress={() => setLaunchQuantization(m)}
                >
                  <Text style={[styles.pipelinePillText, launchQuantization === m && styles.pipelinePillTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.pipelineRow}>
            <Text style={styles.pipelineRowLabel}>Transition</Text>
            <View style={styles.pipelinePills}>
              {SONG_TRANSITION_MODES.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.pipelinePill, songTransitionMode === m.key && styles.pipelinePillActive]}
                  onPress={() => setSongTransitionMode(m.key)}
                >
                  <Text style={[styles.pipelinePillText, songTransitionMode === m.key && styles.pipelinePillTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.pipelineRow}>
            <Text style={styles.pipelineRowLabel}>Safety</Text>
            <View style={styles.pipelinePills}>
              {SAFETY_MODES.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.pipelinePill, safetyMode === m && styles.pipelinePillActive]}
                  onPress={() => setSafetyMode(m)}
                >
                  <Text style={[styles.pipelinePillText, safetyMode === m && styles.pipelinePillTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Actions */}
          <View style={styles.settingsDivider} />
          <Text style={styles.settingsSectionLabel}>ACTIONS</Text>

          <View style={styles.settingsActionsRow}>
            <TouchableOpacity
              style={[styles.settingsActionBtn, isRecording && { borderColor: '#EF4444', backgroundColor: '#3A0A0A' }]}
              onPress={() => { setSettingsModalVisible(false); handleRecord(); }}
            >
              <View style={[styles.tbRecordDot, isRecording && styles.tbRecordDotActive]} />
              <Text style={[styles.settingsActionText, isRecording && { color: '#FCA5A5' }]}>
                {isRecording ? 'REC' : armedTrackId ? 'ARMED' : 'REC'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsActionBtn, lightPanelOpen && { borderColor: '#FCD34D', backgroundColor: '#1A1500' }]}
              onPress={() => { setSettingsModalVisible(false); setLightPanelOpen((v) => !v); setMarkersPanelOpen(false); }}
            >
              <Text style={[styles.settingsActionText, lightPanelOpen && { color: '#FCD34D' }]}>💡 LIGHTS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsActionBtn}
              onPress={() => { setSettingsModalVisible(false); setAddTrackVisible(true); }}
            >
              <Text style={styles.settingsActionText}>+ TRACK</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsActionBtn, { borderColor: '#4F46E5' }]}
              onPress={() => { setSettingsModalVisible(false); navigation.navigate('Studio', { song }); }}
            >
              <Text style={[styles.settingsActionText, { color: '#A5B4FC' }]}>🎛 STUDIO</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsActionBtn, { borderColor: "#F59E0B", backgroundColor: "#1A1208" }]}
              onPress={() => { setSettingsModalVisible(false); setSectionEditorVisible(true); }}
            >
              <Text style={[styles.settingsActionText, { color: "#FCD34D" }]}>✂ SECTIONS</Text>
            </TouchableOpacity>
          </View>

          {/* ── Keys Preset AI ── */}
          {(['keyboard','keys','piano','synth'].some(k => roleKey.includes(k))) && (
            <>
              <View style={styles.settingsDivider} />
              <Text style={styles.settingsSectionLabel}>KEYS PRESET AI</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:8 }}>
                <View style={{ flexDirection:'row', gap:6 }}>
                  {['Worship Keys','Ambient Pad','Strings','Organ B3','Synth Lead'].map(pt => (
                    <TouchableOpacity key={pt} onPress={() => setRehearsalPresetType(pt)}
                      style={[styles.pipelinePill, rehearsalPresetType===pt && styles.pipelinePillActive]}>
                      <Text style={[styles.pipelinePillText, rehearsalPresetType===pt && styles.pipelinePillTextActive]}>{pt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity
                style={[styles.settingsActionBtn, { flex:1, borderColor:'#6366f1', backgroundColor:'#1e1b4b' }]}
                onPress={handleGenerateRehearsalPreset} disabled={rehearsalPresetLoading}>
                <Text style={[styles.settingsActionText, { color:'#a5b4fc' }]}>
                  {rehearsalPresetLoading ? '⏳ Generating…' : '🎹 Generate Keys Preset'}
                </Text>
              </TouchableOpacity>
              {rehearsalPresetResult && (
                <View style={{ marginTop:8, backgroundColor:'#0f172a', borderRadius:8, padding:10,
                               borderWidth:1, borderColor:'#1e3a5f' }}>
                  <Text style={{ color:'#34d399', fontSize:12, fontWeight:'700', marginBottom:2 }}>
                    ✓ {rehearsalPresetResult.preset_name || rehearsalPresetResult.name || rehearsalPresetType}
                  </Text>
                  {rehearsalPresetResult.program_number !== undefined && (
                    <Text style={{ color:'#94a3b8', fontSize:11 }}>
                      Program: {rehearsalPresetResult.program_number} · Bank: {rehearsalPresetResult.bank || 0}
                    </Text>
                  )}
                  {(rehearsalPresetResult.description || rehearsalPresetResult.content) && (
                    <Text style={{ color:'#94a3b8', fontSize:11, marginTop:4 }}>
                      {rehearsalPresetResult.description || rehearsalPresetResult.content}
                    </Text>
                  )}
                </View>
              )}
            </>
          )}

          <TouchableOpacity
            style={styles.settingsCloseBtn}
            onPress={() => setSettingsModalVisible(false)}
          >
            <Text style={styles.settingsCloseBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  container: { padding: 16, paddingBottom: 56 },

  // ── Two-column layout (tablet landscape)
  twoColRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  twoColLeft: { flex: 1.4 },
  twoColRight: { flex: 1, minWidth: 0 },

  // ── Song header
  songHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  songHeaderLeft: { flex: 1, marginRight: 12 },
  songTitle: {
    color: "#F8FAFC",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  songArtist: { color: "#6B7280", fontSize: 13, marginTop: 3 },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  keyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#4F46E520",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#6366F1",
  },
  keyBadgeText: { color: "#A5B4FC", fontSize: 12, fontWeight: "800" },
  bpmBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#92400E22",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  bpmBadgeText: { color: "#FCD34D", fontSize: 12, fontWeight: "800" },
  timeSigBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#0F766E22",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#14B8A6",
  },
  timeSigBadgeText: { color: "#5EEAD4", fontSize: 12, fontWeight: "800" },
  songHeaderRight: { alignItems: "flex-end" },
  positionText: {
    color: "#F9FAFB",
    fontSize: 22,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  durationText: {
    color: "#374151",
    fontSize: 13,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },

  // ── Compact Transport Bar
  transportBar: {
    marginBottom: 16,
    backgroundColor: "transparent",
  },
  transportBarTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backBtn: {
    paddingRight: 10,
    paddingVertical: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  backBtnText: {
    color: "#9CA3AF",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 30,
    marginTop: -2,
  },
  setlistPill: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
    marginRight: 10,
  },
  setlistPillIdx: {
    color: "#6366F1",
    fontSize: 11,
    fontWeight: "900",
    backgroundColor: "#1E1B4B",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  setlistPillArrow: { color: "#4B5563", fontSize: 10, marginLeft: 2 },
  setlistDropdown: {
    backgroundColor: "#060D1E",
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    paddingVertical: 4,
  },
  setlistDropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  setlistDropdownRowActive: { backgroundColor: "#0F172A" },
  setlistDropdownNum: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "900",
    width: 20,
    textAlign: "center",
  },
  setlistDropdownTitle: { color: "#9CA3AF", fontSize: 14, fontWeight: "700" },
  setlistDropdownMeta: { color: "#4B5563", fontSize: 11, marginTop: 1 },
  setlistDropdownCurrent: { color: "#6366F1", fontSize: 11, fontWeight: "800" },
  transportSongName: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "900",
    flex: 1,
  },
  transportTimer: { flexDirection: "row" },
  transportPos: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  transportDur: {
    color: "#374151",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  transportBarControls: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    flexWrap: "wrap",
  },
  tbBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B1120",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  tbBtnText: { color: "#CBD5E1", fontWeight: "900", fontSize: 17 },
  tbPlayBtn: {
    width: 52,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4F46E5",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
  tbPlayBtnText: { color: "#fff", fontWeight: "900", fontSize: 19 },
  tbDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#1E293B",
    marginHorizontal: 2,
  },
  tbPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0B1120",
    alignItems: "center",
    minWidth: 48,
  },
  tbPillLabel: {
    color: "#374151",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tbPillValue: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 1,
  },

  // ── Drone Pad Modal
  droneOverlay: {
    flex: 1,
    backgroundColor: "#000000BB",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dronePanel: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 20,
    backgroundColor: "#080E1A",
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 20,
  },
  dronePanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  dronePanelTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "900" },
  droneStopBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F87171",
    backgroundColor: "#3A0A0A",
  },
  droneStopBtnText: { color: "#F87171", fontWeight: "900", fontSize: 13 },
  droneNoteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  droneNoteBtn: {
    width: 62,
    height: 62,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    alignItems: "center",
    justifyContent: "center",
  },
  droneNoteBtnSharp: { backgroundColor: "#040A14", borderColor: "#1E293B" },
  droneNoteBtnActive: { borderColor: "#F59E0B", backgroundColor: "#1A100A" },
  droneNoteBtnText: { color: "#94A3B8", fontSize: 17, fontWeight: "900" },
  droneNoteBtnTextActive: { color: "#FCD34D" },
  droneActiveRing: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F59E0B",
    top: 6,
    right: 6,
  },

  // ── Count-in overlay & cue flyover ───────────────────────────────────────
  countInOverlay: {
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3A5F",
  },
  countInBeat: {
    color: "#60A5FA",
    fontSize: 52,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  countInLabel: {
    color: "#374151",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: -4,
  },
  cueFlyover: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3A5F",
    backgroundColor: "#080E1A",
  },
  cueFlyoverText: {
    color: "#A5B4FC",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1,
  },
  padActiveDot: { color: "#34D399", fontSize: 11, fontWeight: "800" },
  // ── Transport bar enhancements
  tbRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
    flexWrap: "wrap",
  },
  tbRow3Scroll: { flexShrink: 0 },
  tbRow3Content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  tbMenuBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    alignItems: "center",
    justifyContent: "center",
  },
  tbMenuBtnActive: { borderColor: "#F59E0B", backgroundColor: "#1A100A" },
  tbMenuBtnText: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  tbMenuPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0B1120",
    gap: 4,
  },
  tbMenuPillLabel: {
    color: "#374151",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  tbMenuBpmInput: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    padding: 0,
    minWidth: 32,
    fontVariant: ["tabular-nums"],
  },
  bpmPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0B1120",
    alignItems: "center",
    minWidth: 52,
  },
  bpmTextInput: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    padding: 0,
    minWidth: 36,
    fontVariant: ["tabular-nums"],
  },
  tapBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0B1120",
  },
  tapBtnText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  tbCueBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#0B1120",
  },
  tbCueBtnActive: { borderColor: "#F59E0B", backgroundColor: "#1A100A" },
  tbCueBtnText: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  // Inline drone row
  dronePickerContainer: {
    borderTopWidth: 1,
    borderTopColor: "#0F172A",
    backgroundColor: "#060D1E",
  },
  droneKeyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#0F172A",
  },
  droneActiveKeyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0B1120",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  droneActiveKeyPillOn: {
    borderColor: "#F59E0B",
    backgroundColor: "#1A100A",
  },
  droneActiveKeyName: {
    color: "#4B5563",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1,
    minWidth: 36,
    textAlign: "center",
  },
  droneActiveKeyStatus: {
    color: "#374151",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  droneInlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  droneInlineNote: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    minWidth: 34,
    alignItems: "center",
  },
  droneInlineNoteSharp: { backgroundColor: "#040A14" },
  droneInlineNoteActive: { borderColor: "#F59E0B", backgroundColor: "#1A100A" },
  droneInlineNoteText: { color: "#94A3B8", fontSize: 13, fontWeight: "800" },
  droneStopInline: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F87171",
    backgroundColor: "#3A0A0A",
  },
  droneStopInlineText: { color: "#F87171", fontSize: 12, fontWeight: "800" },
  // Cue panels
  cuePanelBox: {
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
  },
  cuePanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cuePanelTitle: { color: "#E2E8F0", fontSize: 13, fontWeight: "800" },
  cuePanelSub: {
    color: "#4B5563",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  cueAddRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  cueInput: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    color: "#F1F5F9",
    paddingHorizontal: 10,
    fontSize: 13,
  },
  cueAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#4F46E5",
  },
  cueAddBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  cueList: { maxHeight: 120 },
  cueEmptyText: { color: "#4B5563", fontSize: 12, paddingVertical: 8 },
  cueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#0F172A",
  },
  cueTime: {
    color: "#6366F1",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 40,
  },
  cueLabel: { flex: 1, color: "#E2E8F0", fontSize: 12 },
  cueDelete: { color: "#4B5563", fontSize: 14, paddingHorizontal: 4 },
  lyricsScroll: { maxHeight: 150 },
  lyricsText: { color: "#CBD5E1", fontSize: 13, lineHeight: 20 },
  // Add track modal
  modalBg: {
    flex: 1,
    backgroundColor: "#000000BB",
    justifyContent: "flex-end",
  },
  addTrackPanel: {
    backgroundColor: "#080E1A",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  addTrackTitle: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 2,
  },
  addTrackSubtitle: { color: "#6B7280", fontSize: 12, marginBottom: 14 },
  addTrackInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    color: "#F1F5F9",
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 10,
  },
  addTrackBtnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  addTrackCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    alignItems: "center",
  },
  addTrackCancelText: { color: "#9CA3AF", fontWeight: "700" },
  addTrackConfirm: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#4F46E5",
    alignItems: "center",
  },
  addTrackConfirmText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  addTrackHint: {
    color: "#4B5563",
    fontSize: 11,
    textAlign: "center",
    marginTop: 10,
  },
  addTrackSectionLabel: {
    color: "#4B5563",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 6,
  },
  stemTypeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stemTypeBtn: {
    width: "22%",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    alignItems: "center",
    gap: 4,
  },
  stemTypeIcon: { fontSize: 22 },
  stemTypeLabel: { color: "#9CA3AF", fontSize: 10, fontWeight: "700" },
  inputDeviceBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    marginRight: 8,
    alignItems: "center",
    minWidth: 90,
    maxWidth: 130,
  },
  inputDeviceBtnActive: { borderColor: "#6366F1", backgroundColor: "#1E1B4B" },
  inputDeviceIcon: { fontSize: 20, marginBottom: 3 },
  inputDeviceName: {
    color: "#6B7280",
    fontSize: 9,
    fontWeight: "600",
    textAlign: "center",
  },
  inputDeviceNone: {
    color: "#374151",
    fontSize: 11,
    fontStyle: "italic",
    marginBottom: 4,
  },
  channelRow: { flexDirection: "row", gap: 6 },
  channelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    alignItems: "center",
  },
  channelBtnText: { color: "#374151", fontWeight: "800", fontSize: 13 },
  // ARM quick row
  armQuickRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 4 },
  armQuickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#0B1120",
    alignItems: "center",
  },
  armQuickBtnText: { color: "#9CA3AF", fontSize: 13, fontWeight: "700" },

  // ── Old transport (kept for reference, unused)
  transportRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
    alignItems: "center",
  },
  stopBtn: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#0B1120",
  },
  stopBtnText: { color: "#F87171", fontWeight: "900", fontSize: 16 },
  playBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  playBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 20 },
  playNextTransportBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#10B981",
    backgroundColor: "#052E1C",
    alignItems: "center",
  },
  playNextTransportBtnText: {
    color: "#34D399",
    fontWeight: "800",
    fontSize: 13,
  },

  // ── Cards
  card: {
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#080E1A",
    padding: 14,
    overflow: "hidden",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardTitle: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cardMeta: { color: "#4B5563", fontSize: 12, fontWeight: "600" },

  divider: { height: 1, backgroundColor: "#1E293B", marginVertical: 12 },

  // ── Section jump pills

  // ── Control groups
  controlGroup: { marginTop: 10 },
  controlGroupLabel: {
    color: "#4B5563",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
  },
  chipActive: { backgroundColor: "#1E1B4B", borderColor: "#6366F1" },
  chipText: { color: "#64748B", fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#A5B4FC" },

  // ── Markers
  addMarkerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#0F172A",
  },
  addMarkerBtnText: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  loopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  loopToggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
  },
  loopToggleOn: { backgroundColor: "#052E1C", borderColor: "#10B981" },
  loopToggleText: { color: "#6B7280", fontWeight: "800", fontSize: 12 },
  loopToggleTextOn: { color: "#34D399" },
  markerLaneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 6,
  },
  markerLaneMeta: { color: "#64748B", fontSize: 11, fontWeight: "700" },
  markerLaneActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  multiSelectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0B1120",
  },
  multiSelectBtnActive: { borderColor: "#F59E0B", backgroundColor: "#1A100A" },
  multiSelectBtnText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  multiSelectBtnTextActive: { color: "#FCD34D" },
  deleteSelectionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#7F1D1D",
    backgroundColor: "#300A0A",
  },
  deleteSelectionText: { color: "#FCA5A5", fontSize: 11, fontWeight: "800" },
  clearSelectionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0B1120",
  },
  clearSelectionText: { color: "#94A3B8", fontSize: 11, fontWeight: "700" },
  markerScroll: { flexDirection: "row", gap: 8, paddingVertical: 10 },
  markerChip: {
    backgroundColor: "#0B1120",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 100,
  },
  markerChipLoop: { borderColor: "#10B981", backgroundColor: "#052E1C" },
  markerChipSelected: { borderColor: "#F59E0B" },
  markerChipLabel: { color: "#E5E7EB", fontSize: 12, fontWeight: "700" },
  markerChipMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  markerTypePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: "#0B1120",
  },
  markerTypePillText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  markerChipTime: {
    color: "#6B7280",
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  markerTypeRow: {
    marginTop: 4,
  },
  markerTypeLabel: {
    color: "#6B7280",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  markerTypeChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  markerTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "#0B1120",
  },
  markerTypeChipActive: { backgroundColor: "#1A100A" },
  markerTypeChipText: { color: "#CBD5E1", fontSize: 11, fontWeight: "700" },
  markerTypeDot: { width: 8, height: 8, borderRadius: 999 },
  markerTypeHint: {
    color: "#475569",
    fontSize: 10,
    marginTop: 6,
  },
  markerRenameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  markerQuantRow: {
    marginTop: 10,
  },
  markerQuantLabel: {
    color: "#6B7280",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  markerEditor: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
  },
  markerEditorBtns: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  // ── New marker editor panel ──
  // ── Cue bar (below waveform) ──────────────────────────────────
  cueBarWrap: {
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  addCueButton: {
    alignSelf: "flex-end",
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#0EA5E9",
    backgroundColor: "rgba(14,165,233,0.12)",
  },
  addCueButtonLabel: {
    color: "#0EA5E9",
    fontSize: 12,
    fontWeight: "700",
  },
  addCueButtonMeta: {
    color: "#94A3B8",
    fontSize: 10,
  },
  cueBarExisting: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  cueBarDot: { width: 6, height: 6, borderRadius: 3 },
  cueBarLabel: { fontSize: 11, fontWeight: '700', maxWidth: 80 },
  cueBarTime: { fontSize: 10, color: '#64748B' },
  cueBarHint: { marginBottom: 4 },
  cueBarHintTxt: {
    fontSize: 10, color: '#374151', fontStyle: 'italic',
  },
  cueBarAddBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1,
    backgroundColor: '#060D18',
  },
  cueBarAddTxt: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  mkEditorBox: {
    marginHorizontal: 10,
    marginBottom: 6,
    backgroundColor: '#0C1628',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 10,
  },
  mkEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  mkEditorDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  mkEditorName: {
    flex: 1, fontSize: 14, fontWeight: '700',
  },
  mkEditorTime: {
    fontSize: 12, color: '#64748B', marginRight: 6,
  },
  mkDeleteBtn: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, backgroundColor: '#3B1515',
    borderWidth: 1, borderColor: '#7F1D1D',
  },
  mkDeleteTxt: {
    fontSize: 11, color: '#FCA5A5', fontWeight: '600',
  },
  mkRenameRow: {
    flexDirection: 'row', gap: 6, marginBottom: 8,
  },
  mkRenameInput: {
    flex: 1, height: 34,
    backgroundColor: '#111827', borderRadius: 6,
    borderWidth: 1, borderColor: '#374151',
    color: '#E5E7EB', fontSize: 13, paddingHorizontal: 10,
  },
  mkRenameBtn: {
    paddingHorizontal: 12, justifyContent: 'center',
    backgroundColor: '#4338CA', borderRadius: 6,
  },
  mkRenameBtnTxt: {
    color: '#FFF', fontSize: 12, fontWeight: '700',
  },
  mkTypeRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  mkTypeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1,
    backgroundColor: '#0A1220',
  },
  mkTypeDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  mkTypeChipTxt: {
    fontSize: 11, color: '#94A3B8', fontWeight: '600',
  },
  mkListDot: {
    width: 7, height: 7, borderRadius: 3.5, marginRight: 4,
  },
  editorBtn: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
  },
  editorBtnDelete: { borderColor: "#7F1D1D", backgroundColor: "#300A0A" },
  editorBtnText: { color: "#CBD5E1", fontSize: 12, fontWeight: "700" },

  // ── Analysis
  analysisRow: { marginTop: 4 },
  analysisControls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
    alignItems: "center",
  },
  nudgeBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F172A",
  },
  nudgeBtnText: {
    color: "#CBD5E1",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnDetect: { borderColor: "#B45309", backgroundColor: "#451A03" },
  actionBtnAi: { borderColor: "#0891B2", backgroundColor: "#082F49" },
  actionBtnText: { color: "#E2E8F0", fontSize: 12, fontWeight: "700" },
  automationBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6D28D9",
    backgroundColor: "#1E0A3C",
  },
  automationBtnUndo: { borderColor: "#374151", backgroundColor: "#0F172A" },
  automationBtnText: { color: "#C4B5FD", fontSize: 12, fontWeight: "700" },

  // ── Stems channel-strip mixer
  stemsMixerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  soloActiveLabel: {
    color: "#F59E0B",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  dawChannelList: {
    marginTop: 6,
    height: 256,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E2740",
    backgroundColor: "#060D1E",
  },
  stemsScroll: { marginTop: 8 },
  stemsScrollContent: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 4,
    paddingRight: 8,
  },
  stemWithArm: { alignItems: "center", gap: 4 },
  stemArmBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#374151",
    backgroundColor: "#0B1120",
    alignItems: "center",
    justifyContent: "center",
  },
  stemArmBtnActive: { borderColor: "#EF4444", backgroundColor: "#3A0A0A" },
  stemArmDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#374151",
  },
  stemArmDotActive: { backgroundColor: "#EF4444" },

  // ── Record button in transport bar
  tbRecordBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#0B1120",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  tbRecordBtnActive: { borderColor: "#EF4444", backgroundColor: "#3A0A0A" },
  tbRecordBtnArmed: { borderColor: "#EF4444", backgroundColor: "#200606" },
  tbRecordRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tbRecordDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#374151",
  },
  tbRecordDotActive: { backgroundColor: "#EF4444" },
  tbRecordLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  // ── Next song pre-load bar
  nextSongBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E2A3A",
    backgroundColor: "#030A14",
  },
  nextSongBarLeft: { flex: 1, marginRight: 12 },
  nextSongBarLabel: {
    color: "#1E3A5F",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  nextSongBarTitle: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  nextSongBarArtist: { color: "#374151", fontSize: 11, marginTop: 1 },
  nextSongReadyBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  nextSongReadyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  nextSongReadyText: { color: "#10B981", fontSize: 12, fontWeight: "800" },
  nextSongLoadingCol: { alignItems: "flex-end", gap: 5 },
  nextSongLoadingText: { color: "#374151", fontSize: 11, fontWeight: "700" },
  nextSongProgressTrack: {
    width: 72,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#1E293B",
  },
  nextSongProgressFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#4F46E5",
  },

  // ── Tracks
  tracksGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  trackTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
  },
  trackTileMuted: { opacity: 0.4 },
  trackTileLabel: { color: "#CBD5E1", fontSize: 12, fontWeight: "700" },
  trackTileMuteIcon: {
    color: "#10B981",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 2,
  },
  practiceBtn: {
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    alignItems: "center",
  },
  practiceBtnActive: { borderColor: "#10B981", backgroundColor: "#052E1C" },
  practiceBtnText: { color: "#94A3B8", fontSize: 13, fontWeight: "700" },
  noTracksBlock: {
    marginTop: 8,
    gap: 10,
  },
  noTracksText: {
    color: "#374151",
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
  },
  csAnalyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  csAnalyzeBtnText: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
  },
  csResultRow: {
    backgroundColor: '#052E16',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10B981',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  csResultText: {
    color: '#6EE7B7',
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Next Up / Song done panel
  nextUpPanel: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#020E1F",
  },
  nextUpLabel: {
    color: "#4B5563",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  nextUpTitle: { color: "#F8FAFC", fontSize: 17, fontWeight: "900" },
  nextUpArtist: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  nextUpRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  playNextBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#10B981",
    alignItems: "center",
  },
  playNextBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  replayBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0B1120",
    alignItems: "center",
  },
  replayBtnText: { color: "#94A3B8", fontSize: 14, fontWeight: "700" },
  songDoneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  songDoneText: { color: "#34D399", fontSize: 14, fontWeight: "800" },

  // ── Role header
  roleHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#1E1B4B",
    borderWidth: 1,
    borderColor: "#6366F1",
  },
  rolePillText: { color: "#A5B4FC", fontSize: 11, fontWeight: "800" },

  // ── Own stem highlight
  trackTileOwn: { borderColor: "#F59E0B", backgroundColor: "#1A100A" },
  trackTileLabelOwn: { color: "#FCD34D" },

  // ── Mute indicator inside tile
  muteBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B1120",
  },
  muteBtnActive: { borderColor: "#EF4444", backgroundColor: "#3A0A0A" },
  muteBtnText: { color: "#94A3B8", fontSize: 9, fontWeight: "900" },

  // ── Content buttons (Lyrics / Chord Chart)
  contentBtn: {
    marginTop: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#020E1F",
    alignItems: "center",
  },
  contentBtnText: { color: "#60A5FA", fontSize: 13, fontWeight: "700" },
  noContentRow: {
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
  },
  noContentText: {
    color: "#374151",
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 17,
  },

  // ── Cue / notes box
  cueBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#6D28D9",
    backgroundColor: "#1E0A3C",
  },
  cueBoxLabel: {
    color: "#7C3AED",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  cueBoxText: { color: "#C4B5FD", fontSize: 13, lineHeight: 19 },

  // ── Admin vocal assignments panel (in Your Part card)
  adminVocalPanel: { marginTop: 10, gap: 8 },
  adminVocalPanelTitle: {
    color: "#4B5563",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  adminVocalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  adminVocalPartPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  adminVocalPartText: { fontSize: 11, fontWeight: "900" },
  adminVocalName: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  adminVocalKey: { color: "#818CF8", fontSize: 11, fontWeight: "800" },

  // ── Musician vocal assignment card (shows assigned part + key)
  vocalAssignmentCard: { marginTop: 4, marginBottom: 6, gap: 6 },
  vocalAssignedPartPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 2,
  },
  vocalAssignedPartLabel: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  vocalAssignedPartKey: { fontSize: 14, fontWeight: "700" },

  // ── Send to All (admin only)
  sendToAllBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#10B981",
    backgroundColor: "#052E1C",
    alignItems: "center",
  },
  sendToAllBtnText: {
    color: "#34D399",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  // ── Settings Modal
  settingsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  settingsSheet: {
    backgroundColor: '#0B1120',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: '#1E293B',
    padding: 20,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  settingsSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginBottom: 14,
  },
  settingsSheetTitle: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 16,
  },
  settingsSectionLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 14,
  },
  settingsActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  settingsActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#060D1E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  settingsActionText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  settingsCloseBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    marginTop: 4,
  },
  settingsCloseBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionEditorHint: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: -6,
    marginBottom: 14,
  },
  sectionEditBanner: {
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "#1A1208",
  },
  sectionEditBannerText: {
    color: "#FCD34D",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  sectionEditorList: {
    maxHeight: 360,
    marginBottom: 12,
  },
  sectionEditorListContent: {
    gap: 10,
  },
  sectionEditorEmpty: {
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    backgroundColor: "#060D1E",
  },
  sectionEditorEmptyText: {
    color: "#64748B",
    fontSize: 12,
  },
  sectionEditorRow: {
    backgroundColor: "#060D1E",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  sectionEditorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionEditorSwatch: {
    width: 12,
    height: 36,
    borderRadius: 999,
  },
  sectionEditorMeta: {
    flex: 1,
    minWidth: 0,
  },
  sectionEditorTitle: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "800",
  },
  sectionEditorTime: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 3,
  },
  sectionEditorActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sectionEditorActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0B1120",
  },
  sectionEditorDeleteBtn: {
    borderColor: "#7F1D1D",
    backgroundColor: "#220A0A",
  },
  sectionEditorActionText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionEditorDeleteText: {
    color: "#FCA5A5",
  },

  // ── Pipeline Settings panel (used inside modal)
  pipelineSettings: {
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: "#060D1A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 14,
  },
  pipelineSettingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pipelineSettingsChevron: {
    color: '#475569',
    fontSize: 10,
  },
  pipelineSettingsTitle: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 0,
  },
  pipelineRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  pipelineRowLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    width: 64,
  },
  pipelinePills: { flexDirection: "row", gap: 6, flex: 1, flexWrap: "wrap" },
  pipelinePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#0B1120",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  pipelinePillActive: { backgroundColor: "#1E1B4B", borderColor: "#6366F1" },
  pipelinePillText: { fontSize: 11, fontWeight: "700", color: "#475569" },
  pipelinePillTextActive: { color: "#A5B4FC" },

  // ── ARM section
  armSection: { marginTop: 4, gap: 10 },
  armBtn: {
    paddingVertical: 17,
    borderRadius: 14,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 10,
  },
  armBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },
  openLiveBtn: {
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
  },
  openLiveBtnText: { color: "#6B7280", fontSize: 13, fontWeight: "700" },
  diffText: {
    color: "#374151",
    fontSize: 10,
    marginTop: 8,
    textAlign: "center",
  },

  // ── Worship Loop banner
  worshipLoopBanner: {
    backgroundColor: '#2D1A4A',
    borderWidth: 1.5,
    borderColor: '#A855F7',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  worshipLoopText: {
    color: '#E9D5FF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // ── AI Suggestion row
  aiSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#6366F1',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  aiSuggestionText: {
    color: '#A5B4FC',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  aiAcceptBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  aiAcceptText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  aiDismissBtn: { padding: 4 },
  aiDismissText: { color: '#6B7280', fontSize: 13 },

  // ── Rehearsal waveform pipeline ──────────────────────────────────────────
  rehWaveCard: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: 0,
  },
  rehCuePadRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  rehCuePad: {
    minWidth: 96,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: '#08111F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rehCuePadText: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  rehCuePadLoopBadge: {
    fontSize: 10,
    marginTop: 3,
    textAlign: 'center',
  },
  rehWaveFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  rehWaveFooterTime: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    minWidth: 40,
    textAlign: 'center',
  },
  rehWaveFooterTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#16233B',
  },
  rehWaveFooterProgress: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#38BDF8',
  },
  // ── Stem mixer deck ─────────────────────────────────────────────────────
  rehStemDeck: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E2740',
    backgroundColor: '#060D1E',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
  },
  rehStemDeckHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  rehStemDeckTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '900',
  },
  rehStemDeckCount: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  rehStemDeckRow: {
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 4,
  },

  // ── Worship Flow compact card ────────────────────────────────────────────
  wfCompact: {
    backgroundColor: '#0D1B2F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8B5CF620',
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  wfCompactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  wfCompactTitle: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  wfTempoChip: {
    backgroundColor: '#1E1040',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#8B5CF640',
  },
  wfTempoChipText: {
    color: '#A78BFA',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  wfFreelyPill: {
    backgroundColor: '#0F2A1C',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#10B98140',
  },
  wfFreelyPillText: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '700',
  },
  wfEnergyRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  wfEnergyDot: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    opacity: 0.85,
  },
  wfEnergyDotLabel: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  wfMixTip: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
  },
  wfFreelyMoment: {
    color: '#4ADE80',
    fontSize: 11,
    fontWeight: '600',
  },
});
