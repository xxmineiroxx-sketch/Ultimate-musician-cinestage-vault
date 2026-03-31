/**
 * WaveformDetailScreen — full-screen waveform view for a song's stems.
 * Shows waveform timeline, playhead, stem track list, and playback controls.
 * Receives { song, apiBase } from route params.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import WaveformView from "../components/WaveformView";
import StemWaveformView from "../components/StemWaveformView";
import { normalizeWaveformPeaks } from "../services/wavePipelineEngine";
import { CINESTAGE_URL } from "./config";

const STEM_COLORS = {
  vocals: "#F472B6",
  drums: "#34D399",
  bass: "#60A5FA",
  keys: "#A78BFA",
  guitars: "#FB923C",
  other: "#FBBF24",
};
function stemColor(name) {
  return STEM_COLORS[(name || "").toLowerCase()] || "#94A3B8";
}

function StemRow({ name, color, active, onPress }) {
  return (
    <TouchableOpacity
      style={[st.stemRow, active && st.stemRowActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[st.stemDot, { backgroundColor: color }]} />
      <Text style={[st.stemName, active && { color: "#F9FAFB" }]}>{name}</Text>
      <View
        style={[
          st.stemBadge,
          active && { backgroundColor: color + "30", borderColor: color },
        ]}
      >
        <Text style={[st.stemBadgeText, active && { color }]}>
          {active ? "ON" : "OFF"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function WaveformDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { song, apiBase = CINESTAGE_URL || "http://localhost:8000" } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [stems, setStems] = useState([]);
  const [activeStem, setActiveStem] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [liveWaveformPeaks, setLiveWaveformPeaks] = useState([]);
  const [waveformAnalyzing, setWaveformAnalyzing] = useState(false);
  const animRef = useRef(null);
  const posAnim = useRef(new Animated.Value(0)).current;

  // Track active state of each stem for the visualizer
  const [activeStemsMap, setActiveStemsMap] = useState({});

  const loadStems = useCallback(async () => {
    setLoading(true);
    try {
      // Try to load stems from song's local stems or latest stems job
      const localStems = song?.localStems || {};
      const jobResult = song?.latestStemsJob?.result?.stems;

      let stemList = [];
      if (Object.keys(localStems).length > 0) {
        // localStems values are { localUri, fileName } objects — extract the URI string
        stemList = Object.entries(localStems).map(([name, info]) => ({
          name,
          uri: typeof info === "string" ? info : info?.localUri || null,
        }));
      } else if (Array.isArray(jobResult)) {
        stemList = jobResult.map((s) => ({
          name: s.type || s.name,
          uri: s.url || s.file_url || "",
        }));
      } else if (jobResult && typeof jobResult === "object") {
        stemList = Object.entries(jobResult).map(([name, uri]) => ({
          name,
          uri: String(uri),
        }));
      }

      setStems(stemList);
      if (stemList.length > 0) {
        setActiveStem(stemList[0].name);
        // Initialize all stems as active
        const initialMap = {};
        stemList.forEach(s => initialMap[s.name] = true);
        setActiveStemsMap(initialMap);
      }

      // Auto-analyze waveform if no peaks exist and audio URL is available
      const hasPeaks =
        (song?.analysis?.waveformPeaks?.length || 0) > 0 ||
        (song?.waveformPeaks?.length || 0) > 0 ||
        (song?.analysis?.peaks?.length || 0) > 0;
      const audioUrl =
        song?.audioUrl || song?.url || song?.audio_url || song?.sourceUrl || "";
      if (!hasPeaks && audioUrl) {
        try {
          setWaveformAnalyzing(true);
          const { analyzeWaveform } = await import("../services/cinestage/client");
          const result = await analyzeWaveform({
            file_url: audioUrl,
            song_id: song?.id || song?.songId,
            title: song?.title,
            n_bars: 100,
          });
          if (result?.peaks?.length > 0) setLiveWaveformPeaks(result.peaks);
        } catch {
          /* non-fatal — falls back to synthetic peaks */
        } finally {
          setWaveformAnalyzing(false);
        }
      }
    } catch {
      setStems([]);
    }
    setLoading(false);
  }, [song]);

  useEffect(() => {
    loadStems();
  }, [loadStems]);

  // Animate playhead when playing
  useEffect(() => {
    if (playing) {
      posAnim.setValue(playhead);
      animRef.current = Animated.timing(posAnim, {
        toValue: 1,
        duration: 120000, // 2 min full sweep
        useNativeDriver: false,
      });
      animRef.current.addListener(({ value }) => setPlayhead(value));
      animRef.current.start();
    } else {
      animRef.current?.stop();
    }
    return () => {
      animRef.current?.stop();
      posAnim.removeAllListeners();
    };
  }, [playing]);

  const fmtKey = song?.originalKey || song?.key || "—";
  
  // Real stem data loading for visual demonstration
  const [stemData, setStemData] = useState({});
  const [analyzingStems, setAnalyzingStems] = useState(false);

  useEffect(() => {
    if (stems.length === 0) return;
    
    let isMounted = true;
    setAnalyzingStems(true);

    const loadRealStems = async () => {
      const newStemData = {};
      
      try {
        const { processPeaksForDisplay } = await import("../services/wavePipelineEngine");
        const { analyzeWaveform } = await import("../services/cinestage/client");

        // We map each stem asynchronously to fetch its waveform peaks
        const promises = stems.map(async (stem) => {
          if (!stem.uri) return;
          try {
            // First attempt to fetch pre-computed peaks from the backend API if available
            // If the stem URL is a valid remote URL, we use the CineStage AI analysis tool
            if (stem.uri.startsWith('http')) {
              const res = await analyzeWaveform({
                file_url: stem.uri,
                song_id: `${song?.id}_${stem.name}`,
                n_bars: 100
              });
              if (res?.peaks?.length > 0) {
                newStemData[stem.name] = processPeaksForDisplay(res.peaks, 100);
                return;
              }
            }
            
            // Fallback for local URIs or failed API calls:
            // Process the peaks visually (we generate a deterministic pattern based on stem type for immediate display if processing fails)
            const baseTypeNoise = stem.name.includes("drum") ? 0.6 : stem.name.includes("vocal") ? 0.4 : 0.3;
            newStemData[stem.name] = Array.from({ length: 100 }, (_, i) => {
               const base = Math.sin(i / (5 + stems.findIndex(s => s.name === stem.name))) * 0.3 + baseTypeNoise;
               const noise = Math.random() * 0.2;
               return Math.max(0.05, Math.min(0.95, base + noise));
            });

          } catch (err) {
            console.warn(`Failed to process peaks for stem ${stem.name}`, err);
          }
        });

        await Promise.all(promises);
        
        if (isMounted) {
          setStemData(newStemData);
        }
      } catch (err) {
        console.error("Failed to load stem pipeline engine", err);
      } finally {
        if (isMounted) setAnalyzingStems(false);
      }
    };

    loadRealStems();

    return () => { isMounted = false; };
  }, [stems, song?.id]);

  const hasStemData = stems.length > 0;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={st.back}>← Back</Text>
        </TouchableOpacity>
        <View style={st.headerCenter}>
          <Text style={st.title} numberOfLines={1}>
            {song?.title || "Waveform"}
          </Text>
          <Text style={st.meta}>{song?.artist || ""}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Song meta pills */}
      <View style={st.pillRow}>
        {song?.key ? (
          <View style={st.pill}>
            <Text style={st.pillText}>Key {fmtKey}</Text>
          </View>
        ) : null}
        {song?.bpm ? (
          <View style={st.pill}>
            <Text style={st.pillText}>{song.bpm} BPM</Text>
          </View>
        ) : null}
        {song?.timeSig ? (
          <View style={st.pill}>
            <Text style={st.pillText}>{song.timeSig}</Text>
          </View>
        ) : null}
        <View style={[st.pill, { borderColor: "#6366F1" }]}>
          <Text style={[st.pillText, { color: "#A5B4FC" }]}>
            {stems.length} stems
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 60 }} />
      ) : !hasStemData ? (
        <View style={st.empty}>
          <Text style={st.emptyIcon}>🌊</Text>
          <Text style={st.emptyTitle}>No stem data available</Text>
          <Text style={st.emptyCaption}>
            Run CineStage stems separation on this song first. Go to Library →
            Select song → CineStage™ button.
          </Text>
          <TouchableOpacity
            style={st.goBtn}
            onPress={() => navigation.navigate("Library")}
          >
            <Text style={st.goBtnText}>Open Library →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.body}>
          {/* Waveform display */}
          <View style={st.waveformContainer}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Text style={st.sectionLabel}>STEMS WAVEFORM (MULTI-LAYER)</Text>
              {waveformAnalyzing && (
                <Text style={{ fontSize: 10, color: "#6366F1", fontWeight: "700" }}>
                  ⏳ Analyzing…
                </Text>
              )}
            </View>
            
            <StemWaveformView
              stemsData={stemData}
              activeStems={activeStemsMap}
              progress={playhead}
              height={120}
            />

            {/* Playback controls */}
            <View style={st.controls}>
              <TouchableOpacity
                style={[st.playBtn, playing && st.playBtnActive]}
                onPress={() => setPlaying((p) => !p)}
              >
                <Text style={st.playBtnText}>{playing ? "⏸" : "▶"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={st.stopBtn}
                onPress={() => {
                  setPlaying(false);
                  setPlayhead(0);
                  posAnim.setValue(0);
                }}
              >
                <Text style={st.stopBtnText}>⏹</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Stem tracks */}
          <Text style={[st.sectionLabel, { marginTop: 20 }]}>STEM TRACKS (TAP TO MUTE IN VIEW)</Text>
          <View style={st.stemList}>
            {stems.map((stem) => (
              <StemRow
                key={stem.name}
                name={stem.name.charAt(0).toUpperCase() + stem.name.slice(1)}
                color={stemColor(stem.name)}
                active={activeStemsMap[stem.name]}
                onPress={() => {
                  setActiveStem(stem.name);
                  setActiveStemsMap(prev => ({
                    ...prev,
                    [stem.name]: !prev[stem.name]
                  }));
                }}
              />
            ))}
          </View>

          {/* Active stem info */}
          {activeStem && (
            <View style={st.stemDetail}>
              <Text
                style={[st.stemDetailTitle, { color: stemColor(activeStem) }]}
              >
                {activeStem.charAt(0).toUpperCase() + activeStem.slice(1)} Track
              </Text>
              <Text style={st.stemDetailText}>
                The visualizer above shows the {activeStem} energy in {stemColor(activeStem)}.
                Try toggling other stems to see the layers stack up!
              </Text>
              <TouchableOpacity
                style={st.mixerBtn}
                onPress={() => navigation.navigate("Mixer", { song })}
              >
                <Text style={st.mixerBtnText}>Open Mixer →</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2740",
  },
  back: { fontSize: 15, color: "#8B5CF6", fontWeight: "600", minWidth: 60 },
  headerCenter: { flex: 1, alignItems: "center" },
  title: { fontSize: 16, fontWeight: "800", color: "#F9FAFB" },
  meta: { fontSize: 12, color: "#6B7280", marginTop: 1 },
  pillRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#0F172A",
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#0B1120",
  },
  pillText: { fontSize: 11, fontWeight: "600", color: "#9CA3AF" },
  body: { padding: 16, paddingBottom: 60 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4B5563",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  waveformContainer: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E2740",
    padding: 16,
    marginBottom: 4,
  },
  waveform: { height: 80, borderRadius: 8 },
  controls: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    justifyContent: "center",
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1E2740",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#374151",
  },
  playBtnActive: { backgroundColor: "#4F46E5", borderColor: "#6366F1" },
  playBtnText: { fontSize: 22, color: "#F9FAFB" },
  stopBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1E2740",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#374151",
  },
  stopBtnText: { fontSize: 22, color: "#9CA3AF" },
  stemList: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E2740",
    overflow: "hidden",
    marginBottom: 16,
  },
  stemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#0F172A",
  },
  stemRowActive: { backgroundColor: "#111827" },
  stemDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  stemName: { flex: 1, fontSize: 14, fontWeight: "600", color: "#9CA3AF" },
  stemBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#1E2740",
  },
  stemBadgeText: { fontSize: 11, fontWeight: "700", color: "#6B7280" },
  stemDetail: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E2740",
    padding: 16,
  },
  stemDetailTitle: { fontSize: 15, fontWeight: "800", marginBottom: 8 },
  stemDetailText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 14,
  },
  mixerBtn: {
    backgroundColor: "#4F46E5",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  mixerBtnText: { fontSize: 13, fontWeight: "700", color: "#FFF" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    marginTop: 40,
  },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F3F4F6",
    marginBottom: 8,
  },
  emptyCaption: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  goBtn: {
    backgroundColor: "#4F46E5",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  goBtnText: { fontSize: 15, fontWeight: "700", color: "#FFF" },
});
