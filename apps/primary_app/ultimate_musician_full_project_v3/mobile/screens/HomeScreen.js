import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState, useCallback } from "react";
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { SYNC_URL, syncHeaders } from "./config";
import { useAuth } from "../context/AuthContext";
import { useResponsive } from "../utils/responsive";

const SYNC_SERVER = SYNC_URL;

// All AsyncStorage keys used by the app
const SONGS_KEY = "um.songs.v2";
const PEOPLE_KEY = "um.people.v1";
const SERVICES_KEY = "um/services/v1";
const PLANS_KEY = "um/service_plans/v2";
const BLOCKOUTS_KEY = "um/blockouts/v1";
const DELETED_SERVICES_KEY = "um/services/deleted/v1";

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizePlanRecord(serviceId, plan) {
  const base = plan && typeof plan === "object" ? plan : {};
  return {
    ...base,
    serviceId: String(base.serviceId || serviceId || "").trim(),
    songs: Array.isArray(base.songs) ? base.songs : [],
    team: Array.isArray(base.team) ? base.team : [],
    notes: typeof base.notes === "string" ? base.notes : "",
  };
}

function normalizePlansMap(rawPlans) {
  if (!rawPlans || typeof rawPlans !== "object" || Array.isArray(rawPlans)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawPlans).map(([serviceId, plan]) => [
      serviceId,
      normalizePlanRecord(serviceId, plan),
    ]),
  );
}

async function pushLibraryToServer() {
  const [songsRaw, peopleRaw, servicesRaw, plansRaw, blockoutsRaw, deletedServicesRaw] =
    await Promise.all([
      AsyncStorage.getItem(SONGS_KEY),
      AsyncStorage.getItem(PEOPLE_KEY),
      AsyncStorage.getItem(SERVICES_KEY),
      AsyncStorage.getItem(PLANS_KEY),
      AsyncStorage.getItem(BLOCKOUTS_KEY),
      AsyncStorage.getItem(DELETED_SERVICES_KEY),
    ]);
  // Collect all vocal assignment keys (um/vocals/v1/{serviceId})
  const allKeys = await AsyncStorage.getAllKeys();
  const vocalKeys = allKeys.filter((k) => k.startsWith("um/vocals/v1/"));
  const vocalPairs =
    vocalKeys.length > 0 ? await AsyncStorage.multiGet(vocalKeys) : [];
  const vocalAssignments = {};
  for (const [key, val] of vocalPairs) {
    const serviceId = key.replace("um/vocals/v1/", "");
    vocalAssignments[serviceId] = safeParse(val, {});
  }
  const res = await fetch(`${SYNC_SERVER}/sync/library-push`, {
    method: "POST",
    headers: syncHeaders(),
    body: JSON.stringify({
      songs: safeParse(songsRaw, []),
      people: safeParse(peopleRaw, []),
      services: safeParse(servicesRaw, []),
      plans: normalizePlansMap(safeParse(plansRaw, {})),
      vocalAssignments,
      blockouts: safeParse(blockoutsRaw, []),
      deletedServices: safeParse(deletedServicesRaw, []),
    }),
  });
  const data = await res.json();
  if (res.ok) {
    await AsyncStorage.setItem(DELETED_SERVICES_KEY, JSON.stringify([]));
  }
  return data;
}

async function pullLibraryFromServer() {
  const res = await fetch(`${SYNC_SERVER}/sync/library-pull`, {
    headers: syncHeaders(),
  });
  const {
    songs = [],
    people = [],
    services = [],
    plans = {},
    vocalAssignments = {},
    blockouts = [],
  } = await res.json();

  const writes = [];

  // Songs — merge by id
  if (songs.length > 0) {
    const existing = safeParse(await AsyncStorage.getItem(SONGS_KEY), []);
    const map = Object.fromEntries(existing.map((s) => [s.id, s]));
    for (const s of songs) {
      if (s?.id) map[s.id] = s;
    }
    writes.push([SONGS_KEY, JSON.stringify(Object.values(map))]);
  }
  // People — merge by id
  if (people.length > 0) {
    const existing = safeParse(await AsyncStorage.getItem(PEOPLE_KEY), []);
    const map = Object.fromEntries(existing.map((p) => [p.id, p]));
    for (const p of people) {
      if (p?.id) map[p.id] = p;
    }
    writes.push([PEOPLE_KEY, JSON.stringify(Object.values(map))]);
  }
  const normalizedServices = Array.isArray(services)
    ? services.filter((service) => service?.id)
    : [];
  const serviceIds = new Set(normalizedServices.map((service) => service.id));

  // Services — authoritative replace so remote deletions remove stale local rows.
  writes.push([SERVICES_KEY, JSON.stringify(normalizedServices)]);

  // Service plans — merge with server payload, then prune plans for deleted services.
  {
    const existing = normalizePlansMap(
      safeParse(await AsyncStorage.getItem(PLANS_KEY), {}),
    );
    const remotePlans = normalizePlansMap(plans);
    const nextPlans = {};
    const mergedPlans = { ...existing, ...remotePlans };
    for (const [serviceId, plan] of Object.entries(mergedPlans)) {
      if (serviceIds.has(serviceId)) nextPlans[serviceId] = plan;
    }
    writes.push([PLANS_KEY, JSON.stringify(nextPlans)]);
  }
  // Vocal assignments — each serviceId is its own key
  for (const [serviceId, data] of Object.entries(vocalAssignments)) {
    if (data && Object.keys(data).length > 0) {
      writes.push([`um/vocals/v1/${serviceId}`, JSON.stringify(data)]);
    }
  }
  // Blockouts — merge by email+date
  if (blockouts.length > 0) {
    const existing = safeParse(await AsyncStorage.getItem(BLOCKOUTS_KEY), []);
    const seen = new Set(existing.map((b) => `${b.email}|${b.date}`));
    const merged = [...existing];
    for (const b of blockouts) {
      if (b?.email && b?.date && !seen.has(`${b.email}|${b.date}`))
        merged.push(b);
    }
    writes.push([BLOCKOUTS_KEY, JSON.stringify(merged)]);
  }

  if (writes.length > 0) await AsyncStorage.multiSet(writes);
  return {
    songs: songs.length,
    people: people.length,
    services: services.length,
    plans: Object.keys(plans).length,
  };
}

// Silent background sync on every app open — no alerts, server-offline safe
async function backgroundSync() {
  try {
    await pushLibraryToServer();
    await pullLibraryFromServer();
  } catch (_) {
    // Server offline — skip silently
  }
}

// ── Demo song with generated waveform peaks for Rehearsal pipeline testing ──
function _makeDemoPeaks(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env =
      t < 0.08
        ? (t / 0.08) * 0.55
        : t < 0.2
          ? 0.45 + 0.22 * Math.sin(t * Math.PI * 30)
          : t < 0.48
            ? 0.62 + 0.28 * Math.sin(t * Math.PI * 26)
            : t < 0.62
              ? 0.78 + 0.18 * Math.sin(t * Math.PI * 38)
              : t < 0.88
                ? 0.55 + 0.3 * Math.sin(t * Math.PI * 22)
                : ((1 - t) / 0.12) * 0.4;
    const grain = Math.sin(i * 7.3) * 0.12 + Math.sin(i * 17.1) * 0.06;
    out.push(Math.max(0.04, Math.min(1.0, env + grain)));
  }
  return out;
}

const _DEMO_SONG = {
  id: "demo_rehearsal",
  title: "Way Maker (Demo)",
  artist: "Sinach",
  bpm: 84,
  durationSec: 216,
  sections: [
    { label: "Intro", positionSeconds: 0 },
    { label: "Verse 1", positionSeconds: 14 },
    { label: "Chorus", positionSeconds: 42 },
    { label: "Verse 2", positionSeconds: 72 },
    { label: "Chorus", positionSeconds: 100 },
    { label: "Bridge", positionSeconds: 136 },
    { label: "Chorus", positionSeconds: 164 },
    { label: "Outro", positionSeconds: 196 },
  ],
  analysis: { waveformPeaks: _makeDemoPeaks(300) },
};

const MODES = [
  {
    route: "PlanningCenter",
    icon: "📅",
    title: "Planning Service",
    subtitle: "Build your setlist, assign roles, and prep the service.",
    accent: "#4F46E5",
    border: "#1E1B4B",
  },
  {
    route: "Setlist",
    icon: "🎵",
    title: "Rehearsal",
    subtitle: "Open your service setlist and rehearse each song.",
    accent: "#047857",
    border: "#064E3B",
  },
  {
    route: "Live",
    icon: "🎭",
    title: "Live Performance",
    subtitle: "Waveform pipeline · Cue markers · Section queue · Worship Free mode.",
    accent: "#6366F1",
    border: "#1E1B4B",
    params: { song: {}, mixerState: [] },
  },
  ...(Platform.OS === "web"
    ? [
        {
          route: "Studio",
          icon: "🎛️",
          title: "Studio Workspace",
          subtitle: "Multi-track recording, mixing, EQ, and waveform pipeline.",
          accent: "#0E7490",
          border: "#0C4A6E",
        },
      ]
    : []),
  ...(Platform.OS !== "web"
    ? [
        {
          route: "MixerConsole",
          icon: "🎚️",
          title: "Mixer Console",
          subtitle:
            "X32-style channel strips, scene recall, and hardware OSC bridge.",
          accent: "#0E7490",
          border: "#0C4A6E",
        },
      ]
    : []),
];

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const R = useResponsive();
  const { isGuest, logout, userName } = useAuth();
  const displayName = userName || (isGuest ? "Guest" : "Team Member");
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState("admin"); // default to admin until fetched
  const [pendingProposals, setPendingProposals] = useState(0);

  async function fetchPendingProposals() {
    try {
      const res = await fetch(
        `${SYNC_SERVER}/sync/proposals?status=pending`,
        { headers: syncHeaders() },
      );
      if (res.ok) {
        const data = await res.json();
        setPendingProposals(Array.isArray(data) ? data.length : 0);
      }
    } catch {
      /* silent */
    }
  }

  // Auto-sync on every app open — silent, no alerts
  useEffect(() => {
    backgroundSync();
    // Fetch this user's org-hierarchy role (admin / worship_leader / member)
    (async () => {
      try {
        const email = await AsyncStorage.getItem("@user_email");
        if (!email) return;
        const res = await fetch(
          `${SYNC_SERVER}/sync/role?email=${encodeURIComponent(email)}`,
          { headers: syncHeaders() },
        );
        if (res.ok) {
          const data = await res.json();
          if (data.role) setUserRole(data.role);
        }
      } catch {
        /* keep default */
      }
    })();
    fetchPendingProposals();
  }, []);

  // Refresh count whenever screen comes back into focus (e.g. after approving proposals)
  useFocusEffect(
    useCallback(() => {
      fetchPendingProposals();
    }, []),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([backgroundSync(), fetchPendingProposals()]);
    setRefreshing(false);
  }

  const padH = R.containerPadH;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 16, paddingHorizontal: padH },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#4F46E5"
        />
      }
    >
      {/* Header */}
      <View style={[styles.header, R.isAnyTablet && styles.headerTablet]}>
        <View>
          <Text
            style={[
              styles.badge,
              R.isAnyTablet && { fontSize: R.font(13), letterSpacing: 1.5 },
            ]}
          >
            CineStage™
          </Text>
          <Text
            style={[styles.title, R.isAnyTablet && { fontSize: R.font(36) }]}
          >
            Ultimate Musician
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.userPill, R.isAnyTablet && styles.userPillTablet]}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text
            style={[
              styles.userPillText,
              R.isAnyTablet && { fontSize: R.font(14) },
            ]}
          >
            {displayName}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mode tiles */}
      <Text
        style={[
          styles.sectionLabel,
          R.isAnyTablet && { fontSize: R.font(12), marginBottom: 16 },
        ]}
      >
        Choose a Mode
      </Text>

      {/* Two-column grid on tablets — vertical cards */}
      <View style={R.modeCols === 2 ? styles.tileGrid : null}>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.route}
            style={[
              styles.modeCard,
              { borderColor: m.border },
              R.modeCols === 2 && styles.modeCardHalf,
              R.isAnyTablet && styles.modeCardTablet,
            ]}
            activeOpacity={0.75}
            onPress={() => navigation.navigate(m.route, m.params || {})}
          >
            {R.isAnyTablet ? (
              /* Tablet: vertical layout — big icon top, text below, arrow bottom-right */
              <>
                <View
                  style={[
                    styles.modeIconWrapTablet,
                    { backgroundColor: m.accent + "28" },
                  ]}
                >
                  <Text style={styles.modeIconTablet}>{m.icon}</Text>
                </View>
                <Text style={styles.modeTitleTablet}>{m.title}</Text>
                <Text style={styles.modeSubTablet}>{m.subtitle}</Text>
                <View style={styles.modeArrowRowTablet}>
                  <View
                    style={[
                      styles.modeArrowTablet,
                      { backgroundColor: m.accent },
                    ]}
                  >
                    <Text style={styles.modeArrowText}>›</Text>
                  </View>
                </View>
              </>
            ) : (
              /* Phone: original horizontal layout */
              <>
                <View
                  style={[
                    styles.modeIconWrap,
                    { backgroundColor: m.accent + "22" },
                  ]}
                >
                  <Text style={styles.modeIcon}>{m.icon}</Text>
                </View>
                <View style={styles.modeText}>
                  <Text style={styles.modeTitle}>{m.title}</Text>
                  <Text style={styles.modeSub}>{m.subtitle}</Text>
                </View>
                <View style={[styles.modeArrow, { backgroundColor: m.accent }]}>
                  <Text style={styles.modeArrowText}>›</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick tools */}
      <Text
        style={[
          styles.sectionLabel,
          R.isAnyTablet && {
            fontSize: R.font(12),
            marginTop: 8,
            marginBottom: 14,
          },
        ]}
      >
        Quick Access
      </Text>
      <View style={[styles.quickRow, R.isAnyTablet && styles.quickRowTablet]}>
        {[
          { label: "Library", icon: "📚", route: "Library" },
          { label: "Setlist", icon: "🎵", route: "Setlist" },
          { label: "Stems", icon: "🎚️", route: "StemsCenter" },
          { label: "Bridge", icon: "🌉", route: "BridgeSetup" },
          ...(userRole !== "worship_leader"
            ? [{ label: "Organization", icon: "🏢", route: "Organization" }]
            : []),
          { label: "Messages", icon: "✉️", route: "MessageCenter" },
          { label: "Permissions", icon: "🔑", route: "Permissions" },
          { label: "Proposals", icon: "📝", route: "Proposals", badge: pendingProposals },
          { label: "My Availability", icon: "📅", route: "BlockoutCalendar" },
          { label: "Settings", icon: "⚙️", route: "Settings" },
          {
            label: "Sign Out",
            icon: "🚪",
            onPress: async () => {
              await logout();
              navigation.reset({ index: 0, routes: [{ name: "Landing" }] });
            },
          },
        ].map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.quickPill, R.isAnyTablet && styles.quickPillTablet]}
            onPress={item.onPress || (() => navigation.navigate(item.route))}
          >
            {R.isAnyTablet && (
              <Text style={styles.quickPillIcon}>{item.icon}</Text>
            )}
            <Text
              style={[
                styles.quickPillText,
                R.isAnyTablet && { fontSize: R.font(14) },
                item.label === "Sign Out" && { color: "#EF4444" },
              ]}
            >
              {item.label}
            </Text>
            {item.badge > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {item.badge > 99 ? "99+" : item.badge}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    backgroundColor: "#020617",
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  headerTablet: { marginBottom: 40, alignItems: "center" },
  badge: {
    color: "#818CF8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    color: "#F9FAFB",
    fontSize: 26,
    fontWeight: "900",
  },
  userPill: {
    backgroundColor: "#0B1120",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1F2937",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
  },
  userPillTablet: { paddingHorizontal: 20, paddingVertical: 10, marginTop: 12 },
  userPillText: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
  },
  sectionLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  syncCard: {
    marginBottom: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#080E1A",
    padding: 14,
  },
  syncCardTitle: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 4,
  },
  syncCardSub: {
    color: "#4B5563",
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 17,
  },
  syncRow: { flexDirection: "row", gap: 10 },
  syncBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1E1B4B",
    borderWidth: 1,
    borderColor: "#4F46E5",
    alignItems: "center",
  },
  syncBtnPull: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#052E1C",
    borderWidth: 1,
    borderColor: "#10B981",
    alignItems: "center",
  },
  syncBtnText: { color: "#E2E8F0", fontSize: 13, fontWeight: "800" },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  modeCardHalf: { flex: 1, minWidth: "45%" },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0B1120",
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  // Tablet: vertical card, no row direction
  modeCardTablet: {
    flexDirection: "column",
    alignItems: "flex-start",
    padding: 24,
    marginBottom: 0,
    borderRadius: 22,
    minHeight: 200,
    gap: 0,
  },
  modeIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  modeIconWrapTablet: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modeIcon: { fontSize: 26 },
  modeIconTablet: { fontSize: 38 },
  modeText: { flex: 1 },
  modeTitle: {
    color: "#F9FAFB",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 4,
  },
  modeTitleTablet: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 6,
  },
  modeSub: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 17,
  },
  modeSubTablet: {
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  modeArrowRowTablet: { flexDirection: "row", justifyContent: "flex-end" },
  modeArrow: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  modeArrowTablet: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  modeArrowText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28,
    marginTop: -2,
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickRowTablet: { gap: 10 },
  quickPill: {
    backgroundColor: "#0B1120",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1F2937",
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  notifBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 13,
  },
  quickPillTablet: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  quickPillIcon: { fontSize: 16 },
  quickPillText: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "600",
  },
});
