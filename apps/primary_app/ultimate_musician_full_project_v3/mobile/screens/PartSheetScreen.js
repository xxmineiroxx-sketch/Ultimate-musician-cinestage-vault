/**
 * PartSheetScreen — Role-specific part sheets for a service setlist.
 * Each song shows lyrics (vocals) or chord chart (instruments).
 * AI Enhance button calls CineStage to generate instrument-specific notes.
 */
import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Alert,
  Clipboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CINESTAGE_URL } from "./config";
import { formatRoleLabel } from "../data/models";
import ChartReferencePanel from "../components/ChartReferencePanel";
import { connectSync, disconnectSync, subscribeSync } from "../services/syncClient";
import { SYNC_URL } from "./config";

// Map role key → instrument name accepted by /ai/instrument-charts/generate-text
const ROLE_TO_INSTRUMENT = {
  vocals: "Vocals", vocal_bgv: "Vocals", bgv: "Vocals",
  worship_leader: "Vocals", lead_vocal: "Vocals", singer: "Vocals",
  soprano: "Vocals", alto: "Vocals", tenor: "Vocals",
  keys: "Keys", piano: "Keys", synth: "Keys",
  electric_guitar: "Guitar", rhythm_guitar: "Guitar",
  acoustic_guitar: "Acoustic Guitar",
  bass: "Bass",
  drums: "Drums", percussion: "Drums",
  strings: "Strings", brass: "Brass",
};

const ROLE_ICON = {
  vocals: "🎤", vocal_bgv: "🎤", bgv: "🎤",
  lead_vocal: "🎤", worship_leader: "🎤", leader: "🎤",
  soprano: "🎤", alto: "🎤", tenor: "🎤", baritone: "🎤",
  keys: "🎹", piano: "🎹", synth: "🎛",
  electric_guitar: "🎸", acoustic_guitar: "🎸",
  bass: "🎸",
  drums: "🥁", percussion: "🥁",
  strings: "🎻", brass: "🎺",
  sound: "🎚", sound_tech: "🎚",
  media: "📺", media_tech: "📺",
};

function isVocalRole(role) {
  if (!role) return false;
  const r = role.toLowerCase();
  return (
    r.includes("vocal") ||
    r.includes("worship") ||
    r.includes("leader") ||
    r.includes("bgv") ||
    r.includes("singer") ||
    r.includes("choir")
  );
}

function getIcon(role) {
  const r = (role || "").toLowerCase().replace(/\s+/g, "_");
  return ROLE_ICON[r] || "🎵";
}

export default function PartSheetScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const {
    songs = [],
    serviceName = "Service",
    role = "",
    teamMembers = [],
  } = route.params || {};

  const [songIndex, setSongIndex] = useState(0);
  const [activeRole, setActiveRole] = useState(role || "vocals");
  const [aiNotes, setAiNotes] = useState({}); // songId → notes string
  const [loadingAi, setLoadingAi] = useState({}); // songId → bool
  const [bassChart, setBassChart] = useState({}); // songId → AI bass chart text
  const [loadingBass, setLoadingBass] = useState({}); // songId → bool
  const flatRef = useRef(null);
  const scrollRef = useRef(null);
  const scrollHeightRef = useRef(1000);
  const viewportHeightRef = useRef(600);
  const [isPlaying, setIsPlaying] = useState(false);
  const [syncPos, setSyncPos] = useState(0);

  // Connect to Sync Client to get MD playback updates
  React.useEffect(() => {
    connectSync(SYNC_URL, { role: "FOLLOWER", roomId: "main-stage", deviceId: `partsheet-${Date.now()}` });
    const unsub = subscribeSync((evt) => {
      if (evt.type === "SYNC_MESSAGE" && evt.message.type === "MD_PLAYBACK") {
        const { isPlaying: playing, position } = evt.message;
        setIsPlaying(playing);
        if (position !== undefined) setSyncPos(position);
      }
    });
    return () => {
      unsub();
      disconnectSync();
    };
  }, []);

  // Map MD position to scroll position automatically
  React.useEffect(() => {
    if (!song || !scrollRef.current) return;
    // Estimate total song length via BPM + Key or default 300s
    const bpm = Number(song.bpm || 120);
    const estDuration = song.durationSec || 300; 
    
    if (syncPos > 0 && isPlaying) {
      const pct = Math.min(1, Math.max(0, syncPos / estDuration));
      const maxScroll = Math.max(0, scrollHeightRef.current - viewportHeightRef.current);
      const targetY = pct * maxScroll;
      scrollRef.current.scrollTo({ y: targetY, animated: true });
    }
  }, [syncPos, isPlaying, song]);

  const song = songs[songIndex] || null;
  const vocal = isVocalRole(activeRole);
  const isBassRole = (activeRole || '').toLowerCase().replace(/\s+/g, '_') === 'bass';

  // Distinct roles from the team
  const allRoles = teamMembers.length
    ? [...new Set(teamMembers.map((m) => m.role).filter(Boolean))]
    : role
      ? [role]
      : ["vocals", "keys", "electric_guitar", "bass", "drums"];

  const getContent = (s) => {
    if (!s) return "";
    if (vocal) return s.lyrics || "";
    const instrKey = activeRole.toLowerCase().replace(/\s+/g, "_");
    const instrMap = {
      keys: "Keys",
      piano: "Keys",
      synth: "Synth/Pad",
      electric_guitar: "Electric Guitar",
      rhythm_guitar: "Electric Guitar",
      acoustic_guitar: "Acoustic Guitar",
      bass: "Bass",
      drums: "Drums",
      percussion: "Drums",
    };
    const instrName = instrMap[instrKey];
    const isDrums = instrName === "Drums";
    if (isDrums) {
      const drumNotes = s.instrumentNotes?.["Drums"] || s.instrumentSheets?.["Drums"] || "";
      const lyrics    = s.lyrics || "";
      if (drumNotes && lyrics)
        return `${drumNotes}\n\n─────────────────────\n🎤  LYRICS  (REFERENCE)\n─────────────────────\n${lyrics}`;
      return drumNotes || lyrics;
    }
    if (instrName) {
      const specific = s.instrumentNotes?.[instrName] || s.instrumentSheets?.[instrName] || "";
      if (specific) return specific;
    }
    return s.chordChart || "";
  };

  const handleBassChart = useCallback(async () => {
    if (!song) return;
    const sid = song.id || song.title;
    setLoadingBass((p) => ({ ...p, [sid]: true }));
    try {
      const res = await fetch(
        `${CINESTAGE_URL}/ai/instrument-charts/generate-text`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            song_title: song.title || song.name || "",
            key:        song.key || song.originalKey || "",
            time_sig:   song.timeSig || song.timeSignature || "4/4",
            chord_chart: song.chordChart || song.chordSheet || "",
            lyrics:     song.lyrics || "",
            instrument: "Bass",
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.chart_text || data.notes || data.content || "";
        setBassChart((p) => ({ ...p, [sid]: text }));
      } else {
        Alert.alert("CineStage Error", `HTTP ${res.status}`);
      }
    } catch {
      Alert.alert("CineStage", "Could not reach CineStage. Check your connection.");
    } finally {
      setLoadingBass((p) => ({ ...p, [sid]: false }));
    }
  }, [song]);

  const handleAiEnhance = useCallback(async () => {
    if (!song) return;
    const sid = song.id || song.title;
    setLoadingAi((p) => ({ ...p, [sid]: true }));
    const roleKey = activeRole.toLowerCase().replace(/\s+/g, "_");
    const instrument = ROLE_TO_INSTRUMENT[roleKey] || activeRole;
    try {
      const res = await fetch(
        `${CINESTAGE_URL}/ai/instrument-charts/generate-text`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            song_title: song.title || song.name || "",
            key: song.key || song.originalKey || "",
            time_sig: song.timeSig || song.timeSignature || "4/4",
            chord_chart: song.chordChart || song.chordSheet || "",
            lyrics: song.lyrics || song.lyricsText || "",
            instrument,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const notes = data.chart_text || data.notes || data.content || JSON.stringify(data);
        setAiNotes((p) => ({ ...p, [sid]: notes }));
      } else {
        const err = await res.text().catch(() => `HTTP ${res.status}`);
        Alert.alert("AI Error", err || "Could not generate notes.");
      }
    } catch (e) {
      Alert.alert("AI not available", "Could not reach CineStage. Check your connection.");
    } finally {
      setLoadingAi((p) => ({ ...p, [sid]: false }));
    }
  }, [song, activeRole]);

  const handleCopy = useCallback(() => {
    if (!song) return;
    const content = getContent(song);
    const notes = aiNotes[song.id || song.title] || "";
    const text = [
      `${song.title}${song.key ? ` — Key: ${song.key}` : ""}${song.tempo ? ` • ${song.tempo} BPM` : ""}`,
      `Role: ${activeRole}`,
      content,
      notes ? `\n--- AI Notes ---\n${notes}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    Clipboard.setString(text);
    Alert.alert("Copied", "Part sheet copied to clipboard.");
  }, [song, activeRole, aiNotes]);

  const goTo = (idx) => {
    setSongIndex(idx);
    flatRef.current?.scrollToIndex({ index: idx, animated: true });
  };

  if (!songs.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No songs in this service.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Text style={styles.backBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {serviceName}
          </Text>
          <Text style={styles.headerSub}>Part Sheets</Text>
        </View>
        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
          <Text style={styles.copyBtnText}>📋</Text>
        </TouchableOpacity>
      </View>

      {/* Role tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.roleTabs}
        contentContainerStyle={styles.roleTabsInner}
      >
        {allRoles.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.roleTab, activeRole === r && styles.roleTabActive]}
            onPress={() => setActiveRole(r)}
          >
            <Text
              style={[
                styles.roleTabText,
                activeRole === r && styles.roleTabTextActive,
              ]}
            >
              {getIcon(r)} {formatRoleLabel(r)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Song nav dots */}
      <View style={styles.songNav}>
        <TouchableOpacity
          onPress={() => songIndex > 0 && goTo(songIndex - 1)}
          style={styles.navArrow}
        >
          <Text
            style={[
              styles.navArrowText,
              songIndex === 0 && styles.navArrowDisabled,
            ]}
          >
            ‹
          </Text>
        </TouchableOpacity>
        <View style={styles.dotsRow}>
          {songs.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goTo(i)}>
              <View style={[styles.dot, i === songIndex && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          onPress={() => songIndex < songs.length - 1 && goTo(songIndex + 1)}
          style={styles.navArrow}
        >
          <Text
            style={[
              styles.navArrowText,
              songIndex === songs.length - 1 && styles.navArrowDisabled,
            ]}
          >
            ›
          </Text>
        </TouchableOpacity>
      </View>

      {/* Song content */}
      {song ? (
        <ScrollView
          ref={scrollRef}
          style={styles.contentScroll}
          contentContainerStyle={styles.contentInner}
          key={`${song.id}-${activeRole}`}
          onContentSizeChange={(w, h) => scrollHeightRef.current = h}
          onLayout={(e) => viewportHeightRef.current = e.nativeEvent.layout.height}
        >
          {/* Song title row */}
          <View style={styles.songTitleRow}>
            <Text style={styles.songTitle}>{song.title}</Text>
            <View style={styles.badges}>
              {song.key ? (
                <View style={styles.keyBadge}>
                  <Text style={styles.keyBadgeText}>{song.key}</Text>
                </View>
              ) : null}
              {song.tempo ? (
                <View style={styles.tempoBadge}>
                  <Text style={styles.tempoBadgeText}>{song.tempo} BPM</Text>
                </View>
              ) : null}
            </View>
          </View>
          {song.artist ? (
            <Text style={styles.artistText}>{song.artist}</Text>
          ) : null}

          {/* Content type badge */}
          {(() => {
            const rk = activeRole.toLowerCase().replace(/\s+/g, "_");
            const isDrums = rk === "drums" || rk === "percussion";
            const label = vocal ? "LYRICS" : isDrums ? "DRUM PART SHEET" : "CHORD CHART";
            return (
              <View style={styles.contentTypeBadge}>
                <Text style={styles.contentTypeBadgeText}>
                  {getIcon(activeRole)} {label} —{" "}
                  {formatRoleLabel(activeRole).toUpperCase().replace(/_/g, " ")}
                </Text>
              </View>
            );
          })()}

          {/* Main content */}
          {(() => {
            const rk = activeRole.toLowerCase().replace(/\s+/g, "_");
            const isDrums = rk === "drums" || rk === "percussion";
            const text = getContent(song);
            if (text) {
              return (
                <Text style={vocal ? styles.lyricsText : styles.chordText}>
                  {text}
                </Text>
              );
            }
            return (
              <View style={styles.noContent}>
                <Text style={styles.noContentText}>
                  {vocal
                    ? "🎤 No lyrics available."
                    : isDrums
                      ? "🥁 No drum part sheet available."
                      : "🎼 No chart available for this instrument."}
                </Text>
                <Text style={styles.noContentSub}>
                  {isDrums
                    ? "Add a drum part sheet in the song editor and republish."
                    : `Add ${vocal ? "lyrics" : "a chord chart"} in the song editor and republish.`}
                </Text>
              </View>
            );
          })()}

          {/* Charts & Sheets reference panel */}
          {!vocal && (
            <ChartReferencePanel
              role={activeRole}
              songKey={song.key || song.originalKey || ''}
              timeSig={song.timeSig || song.timeSignature || '4/4'}
              chordText={song.chordChart || song.chordSheet || ''}
            />
          )}

          {/* Bass: CineStage AI conversion */}
          {isBassRole && (
            <View style={styles.bassAiSection}>
              <TouchableOpacity
                style={[styles.bassAiBtn, loadingBass[song.id || song.title] && { opacity: 0.6 }]}
                onPress={handleBassChart}
                disabled={!!loadingBass[song.id || song.title]}
              >
                {loadingBass[song.id || song.title] ? (
                  <ActivityIndicator size="small" color="#14B8A6" />
                ) : (
                  <Text style={styles.bassAiBtnText}>
                    {bassChart[song.id || song.title] ? '↻ Regenerate Bass Chart' : '✦ Convert to Bass Chart'}
                  </Text>
                )}
              </TouchableOpacity>
              {bassChart[song.id || song.title] ? (
                <View style={styles.bassAiResult}>
                  <Text style={styles.bassAiLabel}>🎸 CINESTAGE™ BASS CHART</Text>
                  <Text style={styles.bassAiText}>{bassChart[song.id || song.title]}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* AI Notes (if generated) */}
          {aiNotes[song.id || song.title] ? (
            <View style={styles.aiNotesCard}>
              <Text style={styles.aiNotesLabel}>✨ AI INSTRUMENT NOTES</Text>
              <Text style={styles.aiNotesText}>
                {aiNotes[song.id || song.title]}
              </Text>
            </View>
          ) : null}

          {/* AI Enhance button */}
          <TouchableOpacity
            style={[
              styles.aiBtn,
              loadingAi[song.id || song.title] && { opacity: 0.6 },
            ]}
            onPress={handleAiEnhance}
            disabled={!!loadingAi[song.id || song.title]}
          >
            {loadingAi[song.id || song.title] ? (
              <ActivityIndicator color="#818CF8" size="small" />
            ) : (
              <Text style={styles.aiBtnText}>
                ✨ Generate AI Notes for {formatRoleLabel(activeRole)}
              </Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : null}

      {/* Bottom song counter */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 6 }]}>
        <Text style={styles.bottomCounter}>
          {songIndex + 1} of {songs.length}
        </Text>
        <Text style={styles.bottomSongTitle} numberOfLines={1}>
          {song?.title || ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#020617",
  },
  emptyText: { color: "#9CA3AF", fontSize: 16, marginBottom: 16 },
  backLink: { color: "#818CF8", fontSize: 15, fontWeight: "600" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#0A0A0A",
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: { fontSize: 13, color: "#9CA3AF", fontWeight: "700" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 15, fontWeight: "700", color: "#E5E7EB" },
  headerSub: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "600",
    marginTop: 2,
  },
  copyBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  copyBtnText: { fontSize: 18 },

  roleTabs: { maxHeight: 44, backgroundColor: "#050F1E" },
  roleTabsInner: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    flexDirection: "row",
  },
  roleTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#0F172A",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
  },
  roleTabActive: { backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  roleTabText: { fontSize: 13, fontWeight: "600", color: "#9CA3AF" },
  roleTabTextActive: { color: "#FFF" },

  songNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#050F1E",
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  navArrow: { width: 32, alignItems: "center" },
  navArrowText: { fontSize: 26, color: "#8B5CF6", fontWeight: "300" },
  navArrowDisabled: { color: "#1F2937" },
  dotsRow: {
    flexDirection: "row",
    gap: 5,
    flexWrap: "wrap",
    justifyContent: "center",
    flex: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#374151" },
  dotActive: { width: 16, borderRadius: 3, backgroundColor: "#8B5CF6" },

  contentScroll: { flex: 1 },
  contentInner: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },

  songTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  songTitle: {
    flex: 1,
    fontSize: 26,
    fontWeight: "800",
    color: "#F9FAFB",
    marginRight: 10,
  },
  badges: { alignItems: "flex-end", gap: 4, marginTop: 4 },
  keyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#8B5CF6",
    borderRadius: 6,
    alignItems: "center",
  },
  keyBadgeText: { fontSize: 14, fontWeight: "800", color: "#FFF" },
  tempoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#1F2937",
    borderRadius: 5,
    alignItems: "center",
  },
  tempoBadgeText: { fontSize: 10, color: "#9CA3AF", fontWeight: "600" },
  artistText: { fontSize: 13, color: "#9CA3AF", marginBottom: 12 },

  contentTypeBadge: {
    alignSelf: "flex-start",
    marginBottom: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#0F172A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
  },
  contentTypeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 0.5,
  },

  lyricsText: {
    fontSize: 20,
    color: "#F3F4F6",
    lineHeight: 38,
    fontWeight: "400",
  },
  chordText: {
    fontSize: 15,
    color: "#E5E7EB",
    lineHeight: 26,
    fontFamily: "Courier",
    letterSpacing: 0.3,
  },

  noContent: { alignItems: "center", paddingVertical: 40 },
  noContentText: {
    fontSize: 16,
    color: "#9CA3AF",
    marginBottom: 8,
    textAlign: "center",
  },
  noContentSub: {
    fontSize: 13,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 18,
  },

  aiNotesCard: {
    marginTop: 20,
    padding: 14,
    backgroundColor: "#0B0B2E",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4F46E5",
  },
  aiNotesLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#818CF8",
    letterSpacing: 1,
    marginBottom: 8,
  },
  aiNotesText: { fontSize: 14, color: "#C7D2FE", lineHeight: 22 },

  aiBtn: {
    marginTop: 20,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
  },
  aiBtnText: { fontSize: 14, fontWeight: "600", color: "#818CF8" },

  // Bass AI chart
  bassAiSection: { marginTop: 20 },
  bassAiBtn: {
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#0B1F1F",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#14B8A6",
  },
  bassAiBtnText: { fontSize: 14, fontWeight: "600", color: "#14B8A6" },
  bassAiResult: {
    marginTop: 12,
    padding: 14,
    backgroundColor: "#061212",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0D9488",
  },
  bassAiLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#14B8A6",
    letterSpacing: 1,
    marginBottom: 8,
  },
  bassAiText: { fontSize: 14, color: "#99F6E4", lineHeight: 22, fontFamily: "Courier" },

  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: "#0A0A0A",
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
  },
  bottomCounter: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    minWidth: 50,
  },
  bottomSongTitle: {
    flex: 1,
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
});
