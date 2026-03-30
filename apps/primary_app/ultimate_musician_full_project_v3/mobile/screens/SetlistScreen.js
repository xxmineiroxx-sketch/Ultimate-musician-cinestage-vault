/**
 * SetlistScreen — view and manage the ordered song list for a service.
 * Accessed from ServicePlanScreen; receives { serviceId, serviceName }.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getPlanForService } from "../data/servicePlanStore";
import { getActiveServiceId, getServices } from "../data/servicesStore";

const KEY_COLORS = {
  C: "#6366F1",
  D: "#8B5CF6",
  E: "#EC4899",
  F: "#F59E0B",
  G: "#10B981",
  A: "#3B82F6",
  B: "#EF4444",
};
function keyColor(key) {
  const root = (key || "C").charAt(0).toUpperCase();
  return KEY_COLORS[root] || "#6B7280";
}

export default function SetlistScreen({ navigation, route }) {
  const { serviceId: paramServiceId, serviceName: paramServiceName } = route.params || {};
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolvedServiceName, setResolvedServiceName] = useState(paramServiceName || "");
  const [resolvedServiceId, setResolvedServiceId] = useState(paramServiceId || null);
  const [plan, setPlan] = useState(null);
  const [service, setService] = useState(null);
  const [library, setLibrary] = useState([]);

  const loadSongs = useCallback(async () => {
    setLoading(true);
    try {
      // Resolve service ID: prefer route param, then active service, then next upcoming
      let id = paramServiceId;
      if (!id) id = await getActiveServiceId();
      if (!id) {
        const svcs = await getServices();
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = svcs
          .filter((s) => (s.date || "") >= today)
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        id = upcoming[0]?.id || svcs[svcs.length - 1]?.id || null;
      }
      if (!id) { setSongs([]); setLoading(false); return; }

      setResolvedServiceId(id);

      // Load service object + name
      const svcs = await getServices();
      const svc = svcs.find((s) => s.id === id) || null;
      setService(svc);
      if (!paramServiceName) {
        setResolvedServiceName(svc?.title || svc?.name || "Setlist");
      }

      // Load plan and library in parallel
      const [p, libRaw] = await Promise.all([
        getPlanForService(id),
        AsyncStorage.getItem("um.songs.v2"),
      ]);
      const lib = libRaw ? JSON.parse(libRaw) : [];
      setPlan(p);
      setLibrary(lib);
      setSongs(p?.songs || []);
    } catch {
      setSongs([]);
    }
    setLoading(false);
  }, [paramServiceId, paramServiceName]);

  function handleSongPress(item, index) {
    if (!plan || !resolvedServiceId) return;
    // Merge plan items with full library data (same logic as "Arm & Open Rehearsal")
    const setlist = (plan.songs || []).map((si) => {
      const libSong = library.find((l) => l.id === si.songId);
      return libSong
        ? { ...libSong, ...si, id: si.songId }
        : { id: si.songId || si.id, title: si.title || "Song" };
    });
    navigation.navigate("Rehearsal", {
      song: setlist[index] || setlist[0],
      setlist,
      setlistIndex: index,
      serviceId: resolvedServiceId,
      service,
      plan,
      isAdmin: true,
      hideVocalSection: true,
      nextSong: setlist[index + 1] || null,
    });
  }

  useFocusEffect(
    useCallback(() => {
      loadSongs();
    }, [loadSongs]),
  );

  const totalDuration = songs.reduce((acc, s) => {
    const [m, sec] = (s.duration || "0:00").split(":").map(Number);
    return acc + (m * 60 + (sec || 0));
  }, 0);
  const fmtTotal = `${Math.floor(totalDuration / 60)}m ${totalDuration % 60}s`;

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title}>{resolvedServiceName || "Setlist"}</Text>
          <Text style={s.meta}>
            {songs.length} songs · ~{fmtTotal}
          </Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 60 }} />
      ) : songs.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🎵</Text>
          <Text style={s.emptyTitle}>No songs in setlist</Text>
          <Text style={s.emptyCaption}>
            Add songs from the Service Plan screen.
          </Text>
        </View>
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(item, i) => item.id || String(i)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => handleSongPress(item, index)}
              activeOpacity={0.8}
            >
              {/* Position number */}
              <View style={s.posNum}>
                <Text style={s.posText}>{index + 1}</Text>
              </View>

              {/* Song info */}
              <View style={s.cardBody}>
                <Text style={s.songTitle} numberOfLines={1}>
                  {item.title || "Untitled"}
                </Text>
                <Text style={s.songArtist} numberOfLines={1}>
                  {item.artist || "—"}
                </Text>
                <View style={s.pillRow}>
                  {item.key ? (
                    <View
                      style={[
                        s.pill,
                        {
                          backgroundColor: keyColor(item.key) + "30",
                          borderColor: keyColor(item.key),
                        },
                      ]}
                    >
                      <Text style={[s.pillText, { color: keyColor(item.key) }]}>
                        Key {item.key}
                      </Text>
                    </View>
                  ) : null}
                  {item.bpm ? (
                    <View style={s.pill}>
                      <Text style={s.pillText}>{item.bpm} BPM</Text>
                    </View>
                  ) : null}
                  {item.timeSig ? (
                    <View style={s.pill}>
                      <Text style={s.pillText}>{item.timeSig}</Text>
                    </View>
                  ) : null}
                  {item.chordChart ? (
                    <View style={[s.pill, s.pillGreen]}>
                      <Text style={[s.pillText, { color: "#34D399" }]}>
                        Chords
                      </Text>
                    </View>
                  ) : null}
                  {item.lyrics ? (
                    <View style={[s.pill, s.pillBlue]}>
                      <Text style={[s.pillText, { color: "#60A5FA" }]}>
                        Lyrics
                      </Text>
                    </View>
                  ) : null}
                  {item.latestStemsJob?.result?.stems || item.localStems ? (
                    <View
                      style={[
                        s.pill,
                        {
                          borderColor: "#8B5CF6",
                          backgroundColor: "#1E1B4B40",
                        },
                      ]}
                    >
                      <Text style={[s.pillText, { color: "#A78BFA" }]}>
                        Stems
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={s.cardRight}>
                <TouchableOpacity
                  style={s.studioBtn}
                  onPress={() => {
                    const libSong = library.find((l) => l.id === item.songId);
                    const merged = libSong ? { ...libSong, ...item, id: item.songId } : item;
                    navigation.navigate("Studio", { song: merged });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.studioBtnText}>🎛</Text>
                </TouchableOpacity>
                <Text style={s.arrow}>›</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2740",
  },
  back: { fontSize: 15, color: "#8B5CF6", fontWeight: "600", minWidth: 60 },
  headerCenter: { flex: 1, alignItems: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#F9FAFB" },
  meta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F3F4F6",
    marginBottom: 8,
  },
  emptyCaption: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E2740",
    marginTop: 10,
    padding: 14,
  },
  posNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1E2740",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  posText: { fontSize: 13, fontWeight: "700", color: "#9CA3AF" },
  cardBody: { flex: 1 },
  songTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F9FAFB",
    marginBottom: 2,
  },
  songArtist: { fontSize: 12, color: "#6B7280", marginBottom: 6 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#1E2740",
    borderWidth: 1,
    borderColor: "#374151",
  },
  pillGreen: { borderColor: "#34D399", backgroundColor: "#034D2640" },
  pillBlue: { borderColor: "#60A5FA", backgroundColor: "#1E3A5F40" },
  pillText: { fontSize: 11, fontWeight: "600", color: "#9CA3AF" },
  arrow: { fontSize: 20, color: "#374151", marginLeft: 4 },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  studioBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#1E1B4B",
    borderWidth: 1,
    borderColor: "#4F46E5",
    alignItems: "center",
    justifyContent: "center",
  },
  studioBtnText: { fontSize: 14 },
});
