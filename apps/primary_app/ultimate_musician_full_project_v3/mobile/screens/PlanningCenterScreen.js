import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from "react-native";

import {
  getActiveServiceId,
  getServices,
  humanStatus,
} from "../data/servicesStore";
import { getCacheInfo, relativeTime, cacheInvalidateAll, markSynced } from "../services/offlineCache";
import { getPCOCredentials } from "../services/planningCenterService";
import { SYNC_URL, syncHeaders } from "./config";
import { getScopedItem, setScopedItem } from "../data/orgScopedStorage";
import CineStageBrainStatus from "../components/CineStageBrainStatus";

const CINESTAGE_MANAGER_ROLES = new Set([
  "admin",
  "owner",
  "org_owner",
  "manager",
  "worship_leader",
  "leader",
  "md",
  "music_director",
]);

function normalizeRoleKey(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function canOpenCineStage(role) {
  return CINESTAGE_MANAGER_ROLES.has(normalizeRoleKey(role));
}

function SettingRow({ title, subtitle, onPress, accent, icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingRow,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.settingIconWrap, { backgroundColor: accent + '18', borderColor: accent + '44' }]}>
        <Text style={styles.settingIcon}>{icon}</Text>
      </View>
      <View style={styles.settingTextWrap}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSub} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Text style={[styles.settingArrow, { color: accent }]}>›</Text>
    </Pressable>
  );
}

function Tile({ title, subtitle, onPress, accent, icon, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.tile,
        accent && { borderColor: accent + "55" },
        disabled && styles.tileDisabled,
        pressed && !disabled && { opacity: 0.8, transform: [{ scale: 0.98 }] }
      ]}
    >
      <View style={[styles.tileIconWrap, accent && { backgroundColor: accent + "22", borderColor: accent + "66" }, disabled && styles.tileIconWrapDisabled]}>
        <Text style={[styles.tileIcon, disabled && styles.tileIconDisabled]}>{icon}</Text>
      </View>
      <View style={styles.tileTextWrap}>
        <Text style={[styles.tileTitle, disabled && styles.tileTitleDisabled]}>{title}</Text>
        <Text style={[styles.tileSub, disabled && styles.tileSubDisabled]}>{subtitle}</Text>
      </View>
      <View style={styles.tileArrowWrap}>
        <Text style={[styles.tileArrow, accent && !disabled && { color: accent }, disabled && styles.tileArrowDisabled]}>›</Text>
      </View>
    </Pressable>
  );
}

function formatServiceDate(dateStr, timeStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(`${dateStr}T${timeStr || "00:00"}:00`);
    return (
      d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      (timeStr
        ? `  ·  ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
        : "")
    );
  } catch {
    return dateStr;
  }
}

/** Returns true only on the actual local service date. */
function isServiceDay(dateStr) {
  if (!dateStr) return false;
  try {
    const serviceDate = new Date(dateStr + "T00:00:00");
    const today = new Date();
    serviceDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return serviceDate.getTime() === today.getTime();
  } catch {
    return false;
  }
}

export default function PlanningCenterScreen({ navigation }) {
  const { width: _pcWidth } = useWindowDimensions();
  const _pcIsIPad = _pcWidth >= 768;
  const [activeService, setActiveService] = useState(null);
  const [cacheInfo, setCacheInfo] = useState({ entries: 0, lastSync: null, isOnline: true });
  const [syncing, setSyncing] = useState(false);
  const [pcoCreds, setPcoCreds] = useState(null);
  const [viewerRole, setViewerRole] = useState("");

  async function reload() {
    const id = await getActiveServiceId();
    if (!id) {
      setActiveService(null);
    } else {
      const list = await getServices();
      setActiveService(list.find((s) => s.id === id) || null);
    }
    const info = await getCacheInfo();
    setCacheInfo(info);
    const creds = await getPCOCredentials();
    setPcoCreds(creds);
    const storedRole = await AsyncStorage.getItem("@user_role");
    setViewerRole(storedRole || "");
  }

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      reload();
      // Background pull: fetch server services and merge into local storage
      // so UP-created services appear without manual "Sync Now"
      backgroundPullServices().catch(() => {});
    });
    reload();
    backgroundPullServices().catch(() => {});
    return unsub;
  }, [navigation]);

  async function backgroundPullServices() {
    try {
      const res = await fetch(`${SYNC_URL}/sync/library-pull`, {
        headers: syncHeaders(),
      }).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json().catch(() => null);
      if (!data) return;

      const safeParse = (raw, fallback) => { try { return JSON.parse(raw) ?? fallback; } catch { return fallback; } };
      const servicesRaw = await getScopedItem("um/services/v1");
      const localServices = safeParse(servicesRaw, []);

      const serverServices = Array.isArray(data.services) ? data.services : [];
      const serverServiceIds = new Set(serverServices.map(s => s.id).filter(Boolean));
      const localOnlyServices = localServices.filter(s => s.id && !serverServiceIds.has(s.id));
      const mergedServices = [...serverServices, ...localOnlyServices];

      const writes = [];
      if (mergedServices.length)
        writes.push(["um/services/v1", JSON.stringify(mergedServices)]);
      if (data.songs?.length)
        writes.push(["um.songs.v2", JSON.stringify(data.songs)]);
      if (data.people?.length)
        writes.push(["um.people.v1", JSON.stringify(data.people)]);
      if (data.plans && Object.keys(data.plans).length)
        writes.push(["um/service_plans/v2", JSON.stringify(data.plans)]);
      if (writes.length > 0) {
        await Promise.all(writes.map(([k, v]) => setScopedItem(k, v))).catch(() => {});
        await reload();
      }
    } catch {}
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const safeParse = (raw, fallback) => { try { return JSON.parse(raw) ?? fallback; } catch { return fallback; } };

      // ── 1. PULL first — server is authoritative for services ──────────────
      // This ensures services created/deleted in Ultimate Playback are seen
      // before we decide what to push back.
      const pullRes = await fetch(`${SYNC_URL}/sync/library-pull`, {
        headers: syncHeaders(),
      }).catch(() => null);
      const serverData = pullRes?.ok ? await pullRes.json().catch(() => null) : null;

      // ── 2. Read local data ────────────────────────────────────────────────
      const [songsRaw, peopleRaw, servicesRaw, plansRaw] = await Promise.all([
        getScopedItem("um.songs.v2"),
        getScopedItem("um.people.v1"),
        getScopedItem("um/services/v1"),
        getScopedItem("um/service_plans/v2"),
      ]);
      const localSongs    = safeParse(songsRaw,    []);
      const localPeople   = safeParse(peopleRaw,   []);
      const localServices = safeParse(servicesRaw, []);
      const localPlans    = safeParse(plansRaw,    {});

      // ── 3. Merge services: server is the base; add local-only new ones ────
      // Server wins for existing services (prevents resurrections of services
      // deleted in Ultimate Playback via replaceServicesSnapshot).
      // Local-only services (created in UM but not yet pushed) are added.
      const serverServices = Array.isArray(serverData?.services) ? serverData.services : [];
      const serverServiceIds = new Set(serverServices.map(s => s.id).filter(Boolean));
      const localOnlyServices = localServices.filter(s => s.id && !serverServiceIds.has(s.id));
      const mergedServices = [...serverServices, ...localOnlyServices];

      // ── 4. Push merged data back ──────────────────────────────────────────
      // For songs/people/plans: UM is authoritative (push local).
      // For services: push merged so local-only UM services reach the server.
      await fetch(`${SYNC_URL}/sync/library-push`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({
          songs:    localSongs,
          people:   localPeople,
          services: mergedServices,
          plans:    localPlans,
        }),
      }).catch(() => {});

      // ── 5. Save merged state locally ──────────────────────────────────────
      const writes = [];
      if (mergedServices.length)
        writes.push(["um/services/v1",      JSON.stringify(mergedServices)]);
      if (serverData?.songs?.length)
        writes.push(["um.songs.v2",         JSON.stringify(serverData.songs)]);
      if (serverData?.people?.length)
        writes.push(["um.people.v1",        JSON.stringify(serverData.people)]);
      if (serverData?.plans && Object.keys(serverData.plans).length)
        writes.push(["um/service_plans/v2", JSON.stringify(serverData.plans)]);
      if (writes.length > 0) {
        await Promise.all(writes.map(([k, v]) => setScopedItem(k, v))).catch(() => {});
      }

      // Clear PCO cache so next navigation fetches fresh PCO data
      await cacheInvalidateAll();
      await markSynced();
      const info = await getCacheInfo();
      setCacheInfo(info);
      Alert.alert("Synced ✓", "Library synced with server successfully.");
    } catch (e) {
      Alert.alert("Sync failed", "Could not reach sync server. Check your connection.");
    } finally {
      setSyncing(false);
    }
  }

  function handleOpenCineStage() {
    if (canOpenCineStage(viewerRole)) {
      navigation.navigate("CineStage");
      return;
    }

    Alert.alert(
      "CineStage Brain Online",
      "CineStage is connected. Admins, Worship Leaders, and Music Directors can open the CineStage status and System Map from Planning Center.",
    );
  }

  const serviceId = activeService?.id || null;
  const onServiceDay = isServiceDay(activeService?.date);

  // Build tile lists (iPad: 2-col grid; phone: list)
  // We always include the same tiles — just lay them out differently
  const coreTiles = [
    {
      icon: "📅", title: "Calendar",
      subtitle: "Upcoming services. Special services (Communion, Easter…) appear weeks early.",
      onPress: () => navigation.navigate("Calendar"), accent: "#6366F1",
    },
    {
      icon: "🧾", title: "Service Plan",
      subtitle: "Songs + cue stacks for the active service.",
      onPress: () => navigation.navigate("ServicePlan", serviceId ? { serviceId } : {}), accent: "#818CF8",
    },
    {
      icon: "📚", title: "Library",
      subtitle: "Browse songs, add to the active service plan, run CineStage™ stems.",
      onPress: () => navigation.navigate("Library"), accent: "#34D399",
    },
    {
      icon: "👥", title: "People & Roles",
      subtitle: "Assign musicians and techs for this service.",
      onPress: () => navigation.navigate("PeopleRoles"), accent: "#14B8A6",
    },
  ];

  const conditionalTiles = [];

  // Team Schedule — only when there's an active service
  if (activeService) {
    conditionalTiles.push({
      icon: "🎸", title: "Team Schedule",
      subtitle: "Schedule musicians and techs. View confirmations.",
      onPress: () => navigation.navigate("PlanTeam", {
            serviceTypeId: activeService?.pcoServiceTypeId || null,
            planId: activeService?.pcoPlanId || null,
            planTitle: activeService?.name || 'Team Schedule',
            serviceDate: activeService?.date || null,
            creds: pcoCreds,
          }),
      accent: "#F59E0B",
    });
  }

  // Go Live — always shown but greyed out if not service day
  conditionalTiles.push({
    icon: "🔴", title: "Go Live",
    subtitle: onServiceDay
      ? "Live service mode. Track current song, advance setlist."
      : "Available on service day",
    onPress: onServiceDay
      ? () => navigation.navigate("LiveService", activeService ? { service: activeService } : {})
      : null,
    accent: "#EF4444",
    disabled: !onServiceDay,
  });

  const settingsTiles = [
    {
      icon: "☁️", title: "Sync from PCO",
      subtitle: cacheInfo.lastSync
        ? `Last synced ${relativeTime(cacheInfo.lastSync)} · Tap to refresh`
        : "Not yet synced · Tap to import from PCO",
      onPress: () => navigation.navigate("PCOImport"), accent: "#0EA5E9",
    },
    {
      icon: "⚙️", title: "Integrations & Settings",
      subtitle: "Audio / Lighting / ProPresenter / Sync targets plus Planning Center Online import.",
      onPress: () => navigation.navigate("Settings"), accent: "#64748B",
    },
  ];


  function renderTileList(tiles) {
    return tiles.map((t, i) => (
      <Tile
        key={t.title + i}
        icon={t.icon}
        title={t.title}
        subtitle={t.subtitle}
        onPress={t.onPress}
        accent={t.accent}
        disabled={t.disabled}
      />
    ));
  }

  function renderTileGrid(tiles) {
    const rows = [];
    for (let i = 0; i < tiles.length; i += 2) {
      rows.push(
        <View key={i} style={styles.gridRow}>
          <View style={styles.gridCol}>
            <Tile
              icon={tiles[i].icon}
              title={tiles[i].title}
              subtitle={tiles[i].subtitle}
              onPress={tiles[i].onPress}
              accent={tiles[i].accent}
              disabled={tiles[i].disabled}
            />
          </View>
          <View style={styles.gridCol}>
            {tiles[i + 1] ? (
              <Tile
                icon={tiles[i + 1].icon}
                title={tiles[i + 1].title}
                subtitle={tiles[i + 1].subtitle}
                onPress={tiles[i + 1].onPress}
                accent={tiles[i + 1].accent}
                disabled={tiles[i + 1].disabled}
              />
            ) : null}
          </View>
        </View>
      );
    }
    return rows;
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Planning Center</Text>
        <Text style={styles.sub}>
          Build the service plan: Calendar → Service Plan → Library → People &
          Roles → Run Service.
        </Text>

        {/* ── Sync status bar ── */}
        <View style={styles.syncBar}>
          <View style={styles.syncBarLeft}>
            <View style={[styles.syncDot, cacheInfo.isOnline ? styles.syncDotOnline : styles.syncDotOffline]} />
            <Text style={styles.syncBarText}>
              {cacheInfo.isOnline ? "Online" : "Offline"}
              {cacheInfo.lastSync ? `  ·  Synced ${relativeTime(cacheInfo.lastSync)}` : ""}
            </Text>
          </View>
          <Pressable onPress={handleSyncNow} style={({ pressed }) => [styles.syncNowBtn, pressed && { opacity: 0.6 }]}>
            <Text style={styles.syncNowText}>{syncing ? "Syncing…" : "Sync Now"}</Text>
          </Pressable>
        </View>

        {/* ── Active service card ── */}
        <Pressable
          style={[styles.activeCard, activeService && styles.activeCardLive]}
          onPress={() => navigation.navigate("Calendar")}
        >
          <View style={styles.activeCardRow}>
            <Text style={styles.activeLabel}>Active Service</Text>
            {activeService && (
              <Text style={styles.activeStatus}>
                {humanStatus(activeService.status)}
              </Text>
            )}
          </View>
          {activeService ? (
            <>
              <Text style={styles.activeTitle}>{activeService.title}</Text>
              {activeService.date && (
                <Text style={styles.activeDate}>
                  {formatServiceDate(activeService.date, activeService.time)}
                </Text>
              )}
              {activeService.serviceType &&
                activeService.serviceType !== "standard" && (
                  <Text style={styles.activeType}>
                    {activeService.serviceType.charAt(0).toUpperCase() +
                      activeService.serviceType.slice(1)}{" "}
                    service
                  </Text>
                )}
              <Text style={styles.activeTap}>Tap to change →</Text>

              {/* ── Action pills inside active card ── */}
              <View style={styles.pillRow}>
                <Pressable
                  style={({ pressed }) => [styles.actionPill, styles.pillTeam, pressed && { opacity: 0.7 }]}
                  onPress={() => navigation.navigate("PlanTeam", {
            serviceTypeId: activeService?.pcoServiceTypeId || null,
            planId: activeService?.pcoPlanId || null,
            planTitle: activeService?.name || 'Team Schedule',
            serviceDate: activeService?.date || null,
            creds: pcoCreds,
          })}
                >
                  <Text style={styles.actionPillText}>🎸 Team</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionPill,
                    styles.pillLive,
                    !onServiceDay && styles.pillLiveDisabled,
                    pressed && onServiceDay && { opacity: 0.7 },
                  ]}
                  onPress={onServiceDay ? () => navigation.navigate("LiveService", { service: activeService }) : null}
                  disabled={!onServiceDay}
                >
                  <Text style={[styles.actionPillText, !onServiceDay && styles.actionPillTextDisabled]}>
                    🔴 Go Live{!onServiceDay ? " (not today)" : ""}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.activeValue}>
              No service selected — tap to open Calendar
            </Text>
          )}
        </Pressable>

        <Text style={styles.sectionLabel}>Planning Tools</Text>

        {/* Planning tile grid (2-col on iPad, list on phone) */}
        {_pcIsIPad ? (
          <View style={styles.gridContainer}>
            {renderTileGrid([...coreTiles, ...conditionalTiles])}
          </View>
        ) : (
          <View style={styles.listContainer}>
            {renderTileList([...coreTiles, ...conditionalTiles])}
          </View>
        )}

        <Pressable
          onPress={handleOpenCineStage}
          style={({ pressed }) => [
            styles.brainCard,
            pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
          ]}
        >
          <View style={styles.brainCardTextWrap}>
            <View style={styles.brainCardHeader}>
              <Text style={styles.brainEyebrow}>CineStage Brain Online</Text>
              <View style={styles.brainConnectedBadge}>
                <Text style={styles.brainConnectedBadgeText}>Connected</Text>
              </View>
            </View>
            <Text style={styles.brainTitle}>
              Cloud status, latency, and System Map are connected.
            </Text>
            <Text style={styles.brainSub}>
              {canOpenCineStage(viewerRole)
                ? "Open CineStage status and System Map from Planning Center."
                : "Status is visible here. Admins, Worship Leaders, and Music Directors can open CineStage status and System Map."}
            </Text>
          </View>
          <View style={styles.brainCardStatusWrap}>
            <CineStageBrainStatus compact onPress={handleOpenCineStage} />
          </View>
        </Pressable>

        {/* Settings utility strip — compact, distinct from planning tiles */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSmall]}>Settings</Text>
        <View style={styles.settingGroup}>
          {settingsTiles.map((t, i) => (
            <SettingRow key={t.title + i} icon={t.icon} title={t.title} subtitle={t.subtitle} onPress={t.onPress} accent={t.accent} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  container: { padding: 24, paddingBottom: 60, maxWidth: 1024, alignSelf: "center", width: "100%" },

  heading: { color: "#F9FAFB", fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  sub: {
    color: "#94A3B8",
    marginTop: 8,
    lineHeight: 22,
    fontSize: 15,
    fontWeight: "500",
  },

  // ── Sync bar ──────────────────────────────────────────────────────────────
  syncBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  syncBarLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  syncDotOnline: { backgroundColor: "#10B981" },
  syncDotOffline: { backgroundColor: "#6B7280" },
  syncBarText: { color: "#94A3B8", fontSize: 13, fontWeight: "500" },
  syncNowBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: "#1E293B" },
  syncNowText: { color: "#818CF8", fontSize: 13, fontWeight: "700" },

  // ── CineStage status card ────────────────────────────────────────────────
  brainCard: {
    marginTop: 18,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#164E63",
    backgroundColor: "#07131F",
    shadowColor: "#06B6D4",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 5,
  },
  brainCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brainCardTextWrap: {
    gap: 10,
  },
  brainEyebrow: {
    color: "#67E8F9",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  brainConnectedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#0F766E",
    borderWidth: 1,
    borderColor: "#22D3EE55",
  },
  brainConnectedBadgeText: {
    color: "#ECFEFF",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  brainTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  brainSub: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  brainCardStatusWrap: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#0F2540",
    backgroundColor: "#08111D",
    padding: 4,
  },

  // ── Active service card ───────────────────────────────────────────────────
  activeCard: {
    marginTop: 24,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1220",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  activeCardLive: {
    borderColor: "#4F46E5",
    backgroundColor: "#111827",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  activeCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  activeLabel: {
    color: "#10B981",
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  activeStatus: {
    color: "#E2E8F0",
    fontSize: 12,
    backgroundColor: "#1F2937",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
    fontWeight: "700",
  },
  activeTitle: { color: "#F8FAFC", fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  activeDate: { color: "#A5B4FC", fontSize: 15, marginTop: 4, fontWeight: "600" },
  activeType: { color: "#64748B", fontSize: 14, marginTop: 4, fontStyle: "italic" },
  activeTap: { color: "#4F46E5", fontSize: 13, marginTop: 16, fontWeight: "700" },
  activeValue: { color: "#64748B", marginTop: 8, fontSize: 15 },

  // ── Action pills ──────────────────────────────────────────────────────────
  pillRow: { flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" },
  actionPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillTeam: { backgroundColor: "#1C1000", borderColor: "#F59E0B66" },
  pillLive: { backgroundColor: "#1A0000", borderColor: "#EF444466" },
  pillLiveDisabled: { backgroundColor: "#111827", borderColor: "#37415166" },
  actionPillText: { color: "#F9FAFB", fontSize: 13, fontWeight: "700" },
  actionPillTextDisabled: { color: "#4B5563" },

  // ── Section label ─────────────────────────────────────────────────────────
  sectionLabel: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 32,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  sectionLabelSmall: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 28,
    marginBottom: 8,
  },

  // ── Settings utility strip ────────────────────────────────────────────────
  settingGroup: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#080F1C",
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#0F1A2E",
  },
  settingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  settingIcon: { fontSize: 18 },
  settingTextWrap: { flex: 1 },
  settingTitle: { color: "#CBD5E1", fontSize: 14, fontWeight: "700" },
  settingSub: { color: "#475569", fontSize: 12, marginTop: 2 },
  settingArrow: { fontSize: 20, fontWeight: "700", paddingLeft: 8 },

  // ── Grid / list containers ────────────────────────────────────────────────
  gridContainer: { gap: 16 },
  gridRow: { flexDirection: "row", gap: 16 },
  gridCol: { flex: 1 },
  listContainer: { gap: 12 },

  // ── Tile ──────────────────────────────────────────────────────────────────
  tile: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    minHeight: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tileDisabled: { opacity: 0.5 },
  tileIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  tileIconWrapDisabled: { backgroundColor: "#111827", borderColor: "#1F2937" },
  tileIcon: { fontSize: 28 },
  tileIconDisabled: { opacity: 0.4 },
  tileTextWrap: { flex: 1 },
  tileTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  tileTitleDisabled: { color: "#6B7280" },
  tileSub: { color: "#94A3B8", marginTop: 4, lineHeight: 20, fontSize: 13, fontWeight: "500" },
  tileSubDisabled: { color: "#374151" },
  tileArrowWrap: { paddingLeft: 12 },
  tileArrow: { fontSize: 24, color: "#475569", fontWeight: "900" },
  tileArrowDisabled: { color: "#1F2937" },
});
