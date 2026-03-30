/**
 * MusicDirectorRemoteScreen.js
 * Waveform pipeline controller — plays song audio via audioEngine,
 * shows WaveformTimeline with section markers, and controls stem channels.
 * Receives `song` + optional `stems` via route.params; falls back to armStore.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WaveformTimeline from "../components/WaveformTimeline";
import * as audioEngine from "../audioEngine";
import { loadArmSnapshot } from "../services/armStore";

// ── Constants ──────────────────────────────────────────────────────────────

const STEM_ICONS = {
  vocals: "🎤", drums: "🥁", bass: "🎸", other: "🎹",
  guitar: "🎸", piano: "🎹", strings: "🎻", synth: "🎛️", click: "🥁",
};
const STEM_COLORS = {
  vocals: "#EC4899", drums: "#EF4444", bass: "#10B981",
  other: "#6366F1", guitar: "#F97316", piano: "#A78BFA",
  strings: "#8B5CF6", synth: "#818CF8", click: "#64748B",
};

function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function MusicDirectorRemoteScreen({ route }) {
  const insets = useSafeAreaInsets();

  // Song data
  const [song, setSong] = useState(route?.params?.song || null);
  const [stems, setStems] = useState(
    Array.isArray(route?.params?.stems) ? route.params.stems : []
  );

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const pollRef = useRef(null);

  // Stem mixer state — keyed by stem.type
  const [stemVolumes, setStemVolumes] = useState({});
  const [stemMutes, setStemMutes] = useState({});
  const [stemSolos, setStemSolos] = useState({});

  // Active section
  const [activeSectionLabel, setActiveSectionLabel] = useState(null);

  // ── Load song from armStore if not passed via params ─────────────────────
  useEffect(() => {
    if (song) return;
    (async () => {
      const snap = await loadArmSnapshot();
      if (snap?.song) {
        setSong(snap.song);
        if (Array.isArray(snap.stems)) setStems(snap.stems);
      }
    })();
  }, []);

  // ── Initialize stem volumes from stems list ───────────────────────────────
  useEffect(() => {
    if (!stems.length) return;
    const vols = {};
    const mutes = {};
    const solos = {};
    stems.forEach((s) => {
      vols[s.type] = 1.0;
      mutes[s.type] = false;
      solos[s.type] = false;
    });
    setStemVolumes(vols);
    setStemMutes(mutes);
    setStemSolos(solos);
  }, [stems]);

  // ── Position polling ──────────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const pos = await audioEngine.getPosition();
      const dur = await audioEngine.getDuration();
      setPositionSec(pos);
      if (dur > 0) setDurationSec(dur);
      // Determine active section from song.sections
      if (song?.sections?.length) {
        const sorted = [...song.sections].sort(
          (a, b) => (a.positionSeconds || 0) - (b.positionSeconds || 0)
        );
        let active = sorted[0]?.label || null;
        for (const sec of sorted) {
          if (pos >= (sec.positionSeconds || 0)) active = sec.label;
        }
        setActiveSectionLabel(active);
      }
    }, 200);
  }, [song]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    startPolling();
    return stopPolling;
  }, [startPolling, stopPolling]);

  // ── Transport ─────────────────────────────────────────────────────────────
  async function handlePlay() {
    audioEngine.play();
    setIsPlaying(true);
  }

  async function handlePause() {
    await audioEngine.pause();
    setIsPlaying(false);
  }

  async function handleStop() {
    await audioEngine.stop();
    setIsPlaying(false);
    setPositionSec(0);
  }

  function handleSeek(pct) {
    const target = pct * (durationSec || 0);
    audioEngine.seek(target);
    setPositionSec(target);
  }

  async function handleEmergencyClear() {
    audioEngine.emergencyClear();
    setIsPlaying(false);
  }

  // ── Stems mixer ───────────────────────────────────────────────────────────
  function applyStemMixer(volumes, mutes, solos) {
    const anySolo = Object.values(solos).some(Boolean);
    audioEngine.setMixerState(
      stems.map((stem) => ({
        id: stem.type,
        volume: volumes[stem.type] ?? 1,
        mute: mutes[stem.type] ?? false,
        solo: anySolo ? (solos[stem.type] ?? false) : false,
        fx: {},
      }))
    );
  }

  function onStemVolume(type, val) {
    const next = { ...stemVolumes, [type]: val };
    setStemVolumes(next);
    applyStemMixer(next, stemMutes, stemSolos);
  }

  function onStemMute(type) {
    const next = { ...stemMutes, [type]: !stemMutes[type] };
    setStemMutes(next);
    applyStemMixer(stemVolumes, next, stemSolos);
  }

  function onStemSolo(type) {
    const next = { ...stemSolos, [type]: !stemSolos[type] };
    setStemSolos(next);
    applyStemMixer(stemVolumes, stemMutes, next);
  }

  // ── Section jump ──────────────────────────────────────────────────────────
  function handleSectionTap(marker) {
    audioEngine.seek(marker.timeSec || 0);
    setPositionSec(marker.timeSec || 0);
    setActiveSectionLabel(marker.label);
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const playheadPct = durationSec > 0 ? positionSec / durationSec : 0;

  const sectionMarkers = (song?.sections || []).map((s) => ({
    label: s.label,
    timeSec: s.positionSeconds || 0,
    endTimeSec: s.endPositionSeconds || null,
  }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingBottom: Math.max(16, insets.bottom) }]}>
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

        {/* Song header */}
        <View style={s.header}>
          <Text style={s.songTitle} numberOfLines={1}>
            {song?.title || "No song loaded"}
          </Text>
          {song?.artist ? (
            <Text style={s.songArtist} numberOfLines={1}>{song.artist}</Text>
          ) : null}
          <View style={s.metaRow}>
            {song?.key ? <View style={s.metaPill}><Text style={s.metaText}>Key {song.key}</Text></View> : null}
            {song?.bpm ? <View style={s.metaPill}><Text style={s.metaText}>{song.bpm} BPM</Text></View> : null}
            {song?.timeSig ? <View style={s.metaPill}><Text style={s.metaText}>{song.timeSig}</Text></View> : null}
            {activeSectionLabel ? (
              <View style={[s.metaPill, { borderColor: "#6366F1" }]}>
                <Text style={[s.metaText, { color: "#818CF8" }]}>{activeSectionLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Waveform */}
        <View style={s.waveformCard}>
          <WaveformTimeline
            sections={song?.sections || []}
            lengthSeconds={durationSec || song?.duration || 0}
            waveformPeaks={song?.peaks || null}
            bpm={song?.bpm || 0}
            songTitle={song?.title || ""}
            playheadPct={playheadPct}
            activeSectionLabel={activeSectionLabel}
            sectionMarkers={sectionMarkers}
            onSeek={handleSeek}
            onSectionTap={handleSectionTap}
            height={140}
          />
          {/* Progress bar */}
          <View style={s.progressRow}>
            <Text style={s.timeText}>{fmt(positionSec)}</Text>
            <View style={s.progressTrack}>
              <View
                style={[s.progressFill, { width: `${Math.min(100, playheadPct * 100)}%` }]}
              />
            </View>
            <Text style={s.timeText}>{fmt(durationSec)}</Text>
          </View>
        </View>

        {/* Transport */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Transport</Text>
          <View style={s.transportRow}>
            <TouchableOpacity style={[s.tBtn, s.tBtnGhost]} onPress={handleStop}>
              <Text style={s.tBtnIcon}>⏹</Text>
              <Text style={s.tBtnLabel}>Stop</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tBtn, isPlaying ? s.tBtnWarn : s.tBtnPrimary]}
              onPress={isPlaying ? handlePause : handlePlay}
            >
              <Text style={s.tBtnIcon}>{isPlaying ? "⏸" : "▶"}</Text>
              <Text style={s.tBtnLabel}>{isPlaying ? "Pause" : "Play"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tBtn, s.tBtnDanger]}
              onPress={handleEmergencyClear}
            >
              <Text style={s.tBtnIcon}>🚨</Text>
              <Text style={s.tBtnLabel}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sections */}
        {sectionMarkers.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Sections</Text>
            <View style={s.chipWrap}>
              {sectionMarkers.map((m, i) => (
                <TouchableOpacity
                  key={`${m.label}_${i}`}
                  style={[
                    s.chip,
                    activeSectionLabel === m.label && s.chipActive,
                  ]}
                  onPress={() => handleSectionTap(m)}
                >
                  <Text style={[
                    s.chipText,
                    activeSectionLabel === m.label && s.chipTextActive,
                  ]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Stems */}
        {stems.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Stems</Text>
            {stems.map((stem) => {
              const type = stem.type;
              const vol = stemVolumes[type] ?? 1;
              const muted = stemMutes[type] ?? false;
              const soloed = stemSolos[type] ?? false;
              const trackColor = STEM_COLORS[type] || "#6366F1";
              return (
                <View key={type} style={s.stemRow}>
                  <View style={s.stemHeader}>
                    <Text style={s.stemIcon}>{STEM_ICONS[type] || "🎵"}</Text>
                    <Text style={s.stemName}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
                    <Text style={s.stemVol}>{Math.round(vol * 100)}%</Text>
                    <TouchableOpacity
                      style={[s.stemBtn, soloed && s.stemBtnSolo]}
                      onPress={() => onStemSolo(type)}
                    >
                      <Text style={s.stemBtnText}>S</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.stemBtn, muted && s.stemBtnMute]}
                      onPress={() => onStemMute(type)}
                    >
                      <Text style={s.stemBtnText}>M</Text>
                    </TouchableOpacity>
                  </View>
                  <Slider
                    style={s.stemSlider}
                    value={vol}
                    minimumValue={0}
                    maximumValue={1.5}
                    onValueChange={(v) => onStemVolume(type, v)}
                    minimumTrackTintColor={muted ? "#374151" : trackColor}
                    maximumTrackTintColor="#1F2937"
                    thumbTintColor={muted ? "#374151" : "#E5E7EB"}
                  />
                </View>
              );
            })}
          </View>
        )}

        {/* Empty state */}
        {!song && (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🎛️</Text>
            <Text style={s.emptyTitle}>No Song Loaded</Text>
            <Text style={s.emptySub}>
              Open a song in Live Performance and arm it to see the waveform pipeline here.
            </Text>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  body: { paddingTop: 12, paddingHorizontal: 14 },

  // Header
  header: { marginBottom: 12 },
  songTitle: { fontSize: 22, fontWeight: "900", color: "#F9FAFB", lineHeight: 28 },
  songArtist: { fontSize: 14, color: "#9CA3AF", marginTop: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  metaPill: {
    borderWidth: 1, borderColor: "#1F2937", backgroundColor: "#060D1A",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  metaText: { color: "#CBD5E1", fontWeight: "700", fontSize: 12 },

  // Waveform card
  waveformCard: {
    backgroundColor: "#0B1120", borderWidth: 1, borderColor: "#1E2740",
    borderRadius: 14, overflow: "hidden", marginBottom: 12,
  },
  progressRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4,
  },
  timeText: { color: "#6B7280", fontSize: 11, fontFamily: "monospace", width: 34 },
  progressTrack: {
    flex: 1, height: 3, backgroundColor: "#1F2937", borderRadius: 2, overflow: "hidden",
  },
  progressFill: { height: 3, backgroundColor: "#6366F1", borderRadius: 2 },

  // Card
  card: {
    marginBottom: 12, backgroundColor: "#0B1120", borderWidth: 1,
    borderColor: "#1E2740", borderRadius: 14, padding: 14,
  },
  cardTitle: {
    color: "#A5B4FC", fontWeight: "900", fontSize: 11, letterSpacing: 0.8,
    textTransform: "uppercase", marginBottom: 12,
  },

  // Transport
  transportRow: { flexDirection: "row", gap: 10 },
  tBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1,
    borderColor: "#1F2937", alignItems: "center", justifyContent: "center", gap: 4,
  },
  tBtnGhost: { backgroundColor: "transparent", borderColor: "#334155" },
  tBtnPrimary: { backgroundColor: "#4F46E5", borderColor: "#6366F1" },
  tBtnWarn: { backgroundColor: "#3A2A06", borderColor: "#F59E0B" },
  tBtnDanger: { backgroundColor: "#3F0A0A", borderColor: "#EF4444" },
  tBtnIcon: { fontSize: 20 },
  tBtnLabel: { color: "#F9FAFB", fontWeight: "900", fontSize: 11 },

  // Sections
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1, borderColor: "#334155", paddingHorizontal: 12,
    paddingVertical: 8, borderRadius: 999, backgroundColor: "#060D1A",
  },
  chipActive: { borderColor: "#6366F1", backgroundColor: "#1E1B4B" },
  chipText: { color: "#E5E7EB", fontWeight: "800", fontSize: 12 },
  chipTextActive: { color: "#818CF8" },

  // Stems
  stemRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#0F172A" },
  stemHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  stemIcon: { fontSize: 16, marginRight: 8 },
  stemName: { flex: 1, color: "#E5E7EB", fontWeight: "800", fontSize: 13 },
  stemVol: { color: "#6B7280", fontSize: 12, fontFamily: "monospace", marginRight: 8, width: 34, textAlign: "right" },
  stemSlider: { height: 32 },
  stemBtn: {
    width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: "#334155",
    alignItems: "center", justifyContent: "center", marginLeft: 6,
    backgroundColor: "transparent",
  },
  stemBtnMute: { backgroundColor: "#3F0A0A", borderColor: "#EF4444" },
  stemBtnSolo: { backgroundColor: "#3A2A06", borderColor: "#F59E0B" },
  stemBtnText: { color: "#F9FAFB", fontWeight: "900", fontSize: 11 },

  // Empty state
  emptyCard: {
    marginTop: 40, alignItems: "center", paddingHorizontal: 24,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: "#F9FAFB", marginBottom: 8 },
  emptySub: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20 },
});
