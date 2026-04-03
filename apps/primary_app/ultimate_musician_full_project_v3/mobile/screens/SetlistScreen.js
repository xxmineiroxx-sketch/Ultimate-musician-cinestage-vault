/**
 * SetlistScreen — view and manage the ordered song list for a service.
 * Accessed from ServicePlanScreen; receives { serviceId, serviceName }.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getPlanForService } from "../data/servicePlanStore";
import {
  getActiveServiceId,
  getServices,
  updateService,
} from "../data/servicesStore";
import {
  analyzeWorshipSession,
  broadcastWorshipFreelyEvent,
  connectWorshipFlowSocket,
} from "../services/worshipFlowService";

const KEY_COLORS = {
  C: "#6366F1",
  D: "#8B5CF6",
  E: "#EC4899",
  F: "#F59E0B",
  G: "#10B981",
  A: "#3B82F6",
  B: "#EF4444",
};
const WORSHIP_FLOW_VIEWER_ROLES = new Set([
  "admin",
  "org_owner",
  "worship_leader",
  "md",
  "music_director",
  "sound_tech",
  "sound",
]);
const WORSHIP_FLOW_TRIGGER_ROLES = new Set([
  "admin",
  "org_owner",
  "worship_leader",
  "md",
  "music_director",
]);

function keyColor(key) {
  const root = (key || "C").charAt(0).toUpperCase();
  return KEY_COLORS[root] || "#6B7280";
}

function normalizeRoleKey(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function canViewWorshipFlow(role) {
  return WORSHIP_FLOW_VIEWER_ROLES.has(normalizeRoleKey(role));
}

function canTriggerWorshipFlow(role) {
  return WORSHIP_FLOW_TRIGGER_ROLES.has(normalizeRoleKey(role));
}

function buildTeamRoles(plan) {
  return Array.from(
    new Set(
      (plan?.team || [])
        .map((member) => String(member?.role || "").trim())
        .filter(Boolean),
    ),
  );
}

function buildServiceContext(service) {
  if (!service) return "Sunday worship service";
  return [service.title || service.name, service.date, service.time]
    .filter(Boolean)
    .join(" • ");
}

export default function SetlistScreen({ navigation, route }) {
  const { serviceId: paramServiceId, serviceName: paramServiceName } =
    route.params || {};
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolvedServiceName, setResolvedServiceName] = useState(
    paramServiceName || "",
  );
  const [resolvedServiceId, setResolvedServiceId] = useState(
    paramServiceId || null,
  );
  const [plan, setPlan] = useState(null);
  const [service, setService] = useState(null);
  const [library, setLibrary] = useState([]);
  const [viewerRole, setViewerRole] = useState("");
  const [viewerName, setViewerName] = useState("Worship Leader");
  const [sessionInsights, setSessionInsights] = useState(null);
  const [sessionAnalyzing, setSessionAnalyzing] = useState(false);
  const [worshipFreelyEvent, setWorshipFreelyEvent] = useState(null);
  const titleTapRef = useRef({ songId: null, count: 0, time: 0 });
  const pulse = useRef(new Animated.Value(1)).current;

  const loadSongs = useCallback(async () => {
    setLoading(true);
    try {
      let id = paramServiceId;
      if (!id) id = await getActiveServiceId();
      if (!id) {
        const svcs = await getServices();
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = svcs
          .filter((entry) => (entry.date || "") >= today)
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        id = upcoming[0]?.id || svcs[svcs.length - 1]?.id || null;
      }
      if (!id) {
        setSongs([]);
        setLoading(false);
        return;
      }

      setResolvedServiceId(id);

      const svcs = await getServices();
      const svc = svcs.find((entry) => entry.id === id) || null;
      setService(svc);
      setSessionInsights(svc?.worshipFlowSessionInsights || null);
      if (!paramServiceName) {
        setResolvedServiceName(svc?.title || svc?.name || "Setlist");
      }

      const [nextPlan, libRaw] = await Promise.all([
        getPlanForService(id),
        AsyncStorage.getItem("um.songs.v2"),
      ]);
      const lib = libRaw ? JSON.parse(libRaw) : [];
      setPlan(nextPlan);
      setLibrary(lib);
      setSongs(nextPlan?.songs || []);
    } catch {
      setSongs([]);
    }
    setLoading(false);
  }, [paramServiceId, paramServiceName]);

  useEffect(() => {
    (async () => {
      const [[, storedRole], [, storedName]] = await AsyncStorage.multiGet([
        "@user_role",
        "@user_name",
      ]);
      if (storedRole) setViewerRole(storedRole);
      if (storedName) setViewerName(storedName);
    })();
  }, []);

  useEffect(() => {
    const ws = connectWorshipFlowSocket({
      onEvent: (payload) => {
        if (payload?.mode === "exit") {
          setWorshipFreelyEvent(null);
          return;
        }
        setWorshipFreelyEvent(payload);
      },
    });

    return () => {
      try {
        ws?.close();
      } catch {
        // ignore close failures
      }
    };
  }, []);

  useEffect(() => {
    if (!worshipFreelyEvent) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.72,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();

    return () => {
      animation.stop();
      pulse.setValue(1);
    };
  }, [pulse, worshipFreelyEvent]);

  function handleSongPress(item, index) {
    if (!plan || !resolvedServiceId) return;

    const setlist = (plan.songs || []).map((songItem) => {
      const libSong = library.find((entry) => entry.id === songItem.songId);
      return libSong
        ? { ...libSong, ...songItem, id: songItem.songId }
        : { id: songItem.songId || songItem.id, title: songItem.title || "Song" };
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

  async function handleAnalyzeSession() {
    if (!songs.length) return;

    setSessionAnalyzing(true);
    try {
      const payload = {
        songs: songs.map((songItem) => ({
          title: songItem?.title || "Untitled",
          artist: songItem?.artist || "",
          key: songItem?.transposedKey || songItem?.key || "",
          bpm: songItem?.bpm || null,
        })),
        serviceContext: buildServiceContext(service),
        teamRoles: buildTeamRoles(plan),
      };

      const data = await analyzeWorshipSession(payload);
      const insights = data?.sessionInsights || data || null;
      setSessionInsights(insights);

      if (resolvedServiceId) {
        const updated = await updateService(resolvedServiceId, {
          worshipFlowSessionInsights: insights,
        });
        setService(updated);
      }
    } catch {
      // Keep the screen responsive even if the AI request fails.
    } finally {
      setSessionAnalyzing(false);
    }
  }

  async function handleSongTitleTap(item) {
    if (!canTriggerWorshipFlow(viewerRole) || !item?.title) {
      return;
    }

    const now = Date.now();
    const prev = titleTapRef.current;
    const sameSong = prev.songId === item.id;
    const count = sameSong && now - prev.time < 600 ? prev.count + 1 : 1;
    titleTapRef.current = {
      songId: item.id,
      count,
      time: now,
    };

    if (count < 3) {
      return;
    }

    titleTapRef.current = { songId: null, count: 0, time: 0 };
    const payload = {
      type: "worship_freely",
      mode: "enter",
      songTitle: item.title,
      triggeredBy: viewerName || "Worship Leader",
      timestamp: new Date().toISOString(),
    };
    setWorshipFreelyEvent(payload);
    broadcastWorshipFreelyEvent({
      songTitle: item.title,
      triggeredBy: viewerName || "Worship Leader",
      mode: "enter",
    }).catch(() => {});
  }

  function handleDismissWorshipFreely() {
    const songTitle = worshipFreelyEvent?.songTitle || songs[0]?.title || "";
    setWorshipFreelyEvent(null);
    broadcastWorshipFreelyEvent({
      songTitle,
      triggeredBy: viewerName || "Worship Leader",
      mode: "exit",
    }).catch(() => {});
  }

  useFocusEffect(
    useCallback(() => {
      loadSongs();
    }, [loadSongs]),
  );

  const totalDuration = songs.reduce((acc, songItem) => {
    const [m, sec] = (songItem.duration || "0:00").split(":").map(Number);
    return acc + (m * 60 + (sec || 0));
  }, 0);
  const fmtTotal = `${Math.floor(totalDuration / 60)}m ${totalDuration % 60}s`;
  const showWorshipFlowCard = canViewWorshipFlow(viewerRole);

  return (
    <View style={s.root}>
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

      {showWorshipFlowCard ? (
        <View style={s.workflowWrap}>
          {worshipFreelyEvent ? (
            <Animated.View style={[s.freelyBanner, { opacity: pulse }]}>
              <TouchableOpacity
                style={s.freelyBannerInner}
                onPress={handleDismissWorshipFreely}
                activeOpacity={0.85}
              >
                <Text style={s.freelyBannerKicker}>Worship Freely</Text>
                <Text style={s.freelyBannerTitle}>
                  {worshipFreelyEvent.songTitle || "Live flow open"}
                </Text>
                <Text style={s.freelyBannerMeta}>
                  Triggered by {worshipFreelyEvent.triggeredBy || "Worship Leader"} • Tap to exit
                </Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          <View style={s.flowCard}>
            <View style={s.flowHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.flowLabel}>Worship Flow AI</Text>
                <Text style={s.flowTitle}>Pre-analyze this service setlist</Text>
              </View>
              <TouchableOpacity
                style={[
                  s.flowAnalyzeBtn,
                  (!songs.length || sessionAnalyzing) && s.flowAnalyzeBtnDim,
                ]}
                onPress={handleAnalyzeSession}
                disabled={!songs.length || sessionAnalyzing}
                activeOpacity={0.8}
              >
                <Text style={s.flowAnalyzeText}>
                  {sessionAnalyzing ? "Analyzing..." : "✦ Analyze"}
                </Text>
              </TouchableOpacity>
            </View>

            {sessionInsights ? (
              <>
                <View style={s.flowSummaryRow}>
                  <View style={s.flowSummaryPill}>
                    <Text style={s.flowSummaryLabel}>Flow Score</Text>
                    <Text style={s.flowSummaryValue}>
                      {sessionInsights.flowScoreLabel || "Good"}
                    </Text>
                  </View>
                  {sessionInsights.worshipFreelyCandidate ? (
                    <View style={s.flowSummaryPill}>
                      <Text style={s.flowSummaryLabel}>Best Free-Flow Song</Text>
                      <Text style={s.flowSummaryValue}>
                        {sessionInsights.worshipFreelyCandidate}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {Array.isArray(sessionInsights.energyMap) &&
                sessionInsights.energyMap.length > 0 ? (
                  <View style={s.flowEnergyRow}>
                    {sessionInsights.energyMap.map((entry, index) => {
                      const energy = String(entry?.energy || "medium").toLowerCase();
                      const color =
                        energy === "peak"
                          ? "#EC4899"
                          : energy === "high"
                            ? "#8B5CF6"
                            : energy === "low"
                              ? "#38BDF8"
                              : "#A855F7";
                      return (
                        <View key={`${entry?.title || "song"}_${index}`} style={s.flowEnergyItem}>
                          <View style={[s.flowEnergyDot, { backgroundColor: color }]} />
                          <Text style={s.flowEnergyText} numberOfLines={1}>
                            {entry?.title || `Song ${index + 1}`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {sessionInsights.bandBriefing ? (
                  <View style={s.flowBriefingBox}>
                    <Text style={s.flowBriefingLabel}>Band Briefing</Text>
                    <Text style={s.flowBriefingText}>
                      {sessionInsights.bandBriefing}
                    </Text>
                  </View>
                ) : null}

                {Array.isArray(sessionInsights.keyJumps) &&
                sessionInsights.keyJumps.length > 0 ? (
                  <View style={{ gap: 4 }}>
                    <Text style={s.flowInlineLabel}>Key Jump Warnings</Text>
                    {sessionInsights.keyJumps.slice(0, 3).map((jump, index) => (
                      <Text key={`jump_${index}`} style={s.flowInlineText}>
                        • {jump}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {Array.isArray(sessionInsights.transitionNotes) &&
                sessionInsights.transitionNotes.length > 0 ? (
                  <View style={{ gap: 4 }}>
                    <Text style={s.flowInlineLabel}>Transition Notes</Text>
                    {sessionInsights.transitionNotes.slice(0, 3).map((note, index) => (
                      <Text key={`transition_${index}`} style={s.flowInlineText}>
                        • {note}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={s.flowEmptyText}>
                Analyze the full service to score the set flow, flag key jumps,
                identify the best Worship Freely candidate, and prep the band
                briefing before rehearsal.
              </Text>
            )}
          </View>
        </View>
      ) : null}

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
              <View style={s.posNum}>
                <Text style={s.posText}>{index + 1}</Text>
              </View>

              <View style={s.cardBody}>
                <TouchableOpacity
                  onPress={() => handleSongTitleTap(item)}
                  disabled={!canTriggerWorshipFlow(viewerRole)}
                  activeOpacity={0.85}
                >
                  <Text style={s.songTitle} numberOfLines={1}>
                    {item.title || "Untitled"}
                  </Text>
                </TouchableOpacity>
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
                  onPress={() => handleSongTitleTap(item)}
                  disabled={!canTriggerWorshipFlow(viewerRole)}
                  activeOpacity={0.85}
                  style={s.freelyTrigger}
                >
                  <Text
                    style={[
                      s.freelyTriggerText,
                      canTriggerWorshipFlow(viewerRole) &&
                        s.freelyTriggerTextActive,
                    ]}
                  >
                    {canTriggerWorshipFlow(viewerRole)
                      ? "Triple-tap title"
                      : "Open"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.studioBtn}
                  onPress={() => {
                    const libSong = library.find((entry) => entry.id === item.songId);
                    const merged = libSong
                      ? { ...libSong, ...item, id: item.songId }
                      : item;
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
  workflowWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  freelyBanner: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#A855F7",
    backgroundColor: "#2D1457",
  },
  freelyBannerInner: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  freelyBannerKicker: {
    color: "#D8B4FE",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  freelyBannerTitle: {
    color: "#F5F3FF",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 4,
  },
  freelyBannerMeta: {
    color: "#E9D5FF",
    fontSize: 12,
    marginTop: 4,
  },
  flowCard: {
    backgroundColor: "#120A24",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#6D28D9",
    padding: 14,
    gap: 10,
  },
  flowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  flowLabel: {
    color: "#C4B5FD",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  flowTitle: {
    color: "#F5F3FF",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 3,
  },
  flowAnalyzeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#3B1B71",
    borderWidth: 1,
    borderColor: "#8B5CF6",
  },
  flowAnalyzeBtnDim: {
    opacity: 0.6,
  },
  flowAnalyzeText: {
    color: "#F5F3FF",
    fontSize: 12,
    fontWeight: "800",
  },
  flowSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  flowSummaryPill: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "#1B1235",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4C1D95",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  flowSummaryLabel: {
    color: "#A78BFA",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  flowSummaryValue: {
    color: "#F5F3FF",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
  flowEnergyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  flowEnergyItem: {
    minWidth: 110,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#1B1235",
    borderWidth: 1,
    borderColor: "#4C1D95",
  },
  flowEnergyDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  flowEnergyText: {
    color: "#E9D5FF",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  flowBriefingBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4C1D95",
    backgroundColor: "#1B1235",
    padding: 10,
  },
  flowBriefingLabel: {
    color: "#A78BFA",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  flowBriefingText: {
    color: "#F5F3FF",
    fontSize: 12,
    lineHeight: 18,
  },
  flowInlineLabel: {
    color: "#A78BFA",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  flowInlineText: {
    color: "#E9D5FF",
    fontSize: 12,
    lineHeight: 18,
  },
  flowEmptyText: {
    color: "#C4B5FD",
    fontSize: 12,
    lineHeight: 18,
  },
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
  freelyTrigger: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#312E81",
    backgroundColor: "#0F172A",
  },
  freelyTriggerText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
  },
  freelyTriggerTextActive: {
    color: "#A5B4FC",
  },
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
