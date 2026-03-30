import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getSongs } from "../data/storage";
import { CINESTAGE_API_BASE_URL, getJob } from "../services/cinestage";
import { getEntitlements, PlanTiers } from "../services/planEntitlements";
import { loadSession } from "../services/sessionStore";

const STATUS_COLOR = {
  QUEUED: "#F59E0B",
  RUNNING: "#6366F1",
  SUCCEEDED: "#10B981",
  FAILED: "#EF4444",
  CANCELLED: "#6B7280",
};

const STATUS_ICON = {
  QUEUED: "⏳",
  RUNNING: "⚙️",
  SUCCEEDED: "✅",
  FAILED: "❌",
  CANCELLED: "🚫",
};

const JOB_TYPE_ICON = {
  ANALYZE: "🔍",
  STEM_SEPARATION: "🎚️",
  ROLE_ASSIGN: "🎭",
  SCENE_BUILD: "🎬",
  EXPORT: "📦",
};

export default function CineStageDashboardScreen({ navigation }) {
  const [planTier, setPlanTier] = useState(PlanTiers.PRO);
  const [recentJobs, setRecentJobs] = useState([]);
  const [songCount, setSongCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const entitlements = getEntitlements(planTier);

  const loadData = useCallback(async () => {
    const session = await loadSession();
    if (session?.planTier) setPlanTier(session.planTier);

    const songs = await getSongs();
    setSongCount(songs.length);

    // Refresh status on any stored job IDs
    const storedJobIds = session?.cinestageJobIds || [];
    if (storedJobIds.length > 0 && entitlements.cineStage) {
      setLoadingJobs(true);
      const updated = await Promise.allSettled(
        storedJobIds
          .slice(-10)
          .map((id) => getJob(id).catch(() => ({ id, status: "UNKNOWN" }))),
      );
      setRecentJobs(
        updated
          .map((r) => (r.status === "fulfilled" ? r.value : null))
          .filter(Boolean)
          .reverse(),
      );
      setLoadingJobs(false);
    }
  }, [entitlements.cineStage]);

  useEffect(() => {
    loadData();
    const unsub = navigation?.addListener?.("focus", loadData);
    return unsub;
  }, [navigation, loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  if (!entitlements.cineStage) {
    return (
      <View style={styles.gateWrap}>
        <Text style={styles.gateIcon}>🔒</Text>
        <Text style={styles.gateTitle}>CineStage™ requires Pro</Text>
        <Text style={styles.gateSub}>
          Upgrade to Pro or Enterprise to access AI stem separation, scene
          building, and analysis.
        </Text>
        <TouchableOpacity
          style={styles.gateBtn}
          onPress={() => navigation.navigate("Settings")}
        >
          <Text style={styles.gateBtnText}>View Plans</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#6366F1"
        />
      }
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.badge}>CineStage™</Text>
          <Text style={styles.heading}>AI Dashboard</Text>
        </View>
        <View
          style={[
            styles.tierPill,
            planTier === PlanTiers.ENTERPRISE && styles.tierPillEnt,
          ]}
        >
          <Text style={styles.tierText}>{planTier}</Text>
        </View>
      </View>

      {/* API endpoint */}
      <View style={styles.endpointCard}>
        <Text style={styles.endpointLabel}>Connected endpoint</Text>
        <Text style={styles.endpointUrl}>{CINESTAGE_API_BASE_URL}</Text>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{songCount}</Text>
          <Text style={styles.statLabel}>Songs</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{recentJobs.length}</Text>
          <Text style={styles.statLabel}>Recent Jobs</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>
            {recentJobs.filter((j) => j.status === "SUCCEEDED").length}
          </Text>
          <Text style={styles.statLabel}>Succeeded</Text>
        </View>
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionLabel}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        {[
          { label: "Run Job", icon: "▶", route: "CineStage" },
          { label: "Stems", icon: "🎚️", route: "StemsCenter" },
          { label: "Library", icon: "📚", route: "Library" },
        ].map((a) => (
          <TouchableOpacity
            key={a.label}
            style={styles.actionBtn}
            onPress={() => navigation.navigate(a.route)}
            activeOpacity={0.75}
          >
            <Text style={styles.actionIcon}>{a.icon}</Text>
            <Text style={styles.actionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent jobs */}
      <Text style={styles.sectionLabel}>Recent Jobs</Text>

      {loadingJobs && (
        <ActivityIndicator color="#6366F1" style={{ marginVertical: 20 }} />
      )}

      {!loadingJobs && recentJobs.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🎛️</Text>
          <Text style={styles.emptyTitle}>No jobs yet</Text>
          <Text style={styles.emptyCaption}>
            Run your first CineStage job from the{" "}
            <Text
              style={styles.emptyLink}
              onPress={() => navigation.navigate("CineStage")}
            >
              CineStage screen
            </Text>{" "}
            or the{" "}
            <Text
              style={styles.emptyLink}
              onPress={() => navigation.navigate("StemsCenter")}
            >
              Stems Center
            </Text>
            .
          </Text>
        </View>
      )}

      {recentJobs.map((job) => (
        <TouchableOpacity
          key={job.id}
          style={styles.jobCard}
          activeOpacity={0.8}
          onPress={() =>
            Alert.alert(
              `Job ${job.id.slice(0, 8)}…`,
              JSON.stringify(job, null, 2),
              [{ text: "Close" }],
            )
          }
        >
          <View style={styles.jobLeft}>
            <Text style={styles.jobTypeIcon}>
              {JOB_TYPE_ICON[job.jobType] || "📋"}
            </Text>
            <View style={styles.jobMeta}>
              <Text style={styles.jobType}>{job.jobType || "JOB"}</Text>
              <Text style={styles.jobId} numberOfLines={1}>
                {job.id}
              </Text>
              {job.input?.sourceUrl ? (
                <Text style={styles.jobSrc} numberOfLines={1}>
                  {job.input.sourceUrl}
                </Text>
              ) : null}
            </View>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: (STATUS_COLOR[job.status] || "#6B7280") + "22",
                borderColor: STATUS_COLOR[job.status] || "#6B7280",
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: STATUS_COLOR[job.status] || "#6B7280" },
              ]}
            >
              {STATUS_ICON[job.status] || "❓"} {job.status}
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      <Text style={styles.footer}>
        Pull to refresh • Tap a job row to inspect the full payload
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 20, paddingBottom: 48 },

  // Entitlement gate
  gateWrap: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  gateIcon: { fontSize: 48, marginBottom: 16 },
  gateTitle: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
  },
  gateSub: {
    color: "#6B7280",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  gateBtn: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
  },
  gateBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  badge: {
    color: "#818CF8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  heading: { color: "#F9FAFB", fontSize: 26, fontWeight: "900" },
  tierPill: {
    backgroundColor: "#4F46E522",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#4F46E5",
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
  },
  tierPillEnt: { backgroundColor: "#92400022", borderColor: "#D97706" },
  tierText: { color: "#A5B4FC", fontSize: 11, fontWeight: "700" },

  // Endpoint
  endpointCard: {
    backgroundColor: "#0B1120",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 12,
    marginBottom: 16,
  },
  endpointLabel: {
    color: "#4B5563",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  endpointUrl: { color: "#6366F1", fontSize: 12, fontFamily: "Courier" },

  // Stats
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 14,
    alignItems: "center",
  },
  statNum: { color: "#6366F1", fontSize: 28, fontWeight: "800" },
  statLabel: {
    color: "#6B7280",
    fontSize: 11,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  // Section label
  sectionLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },

  // Quick actions
  actionsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  actionBtn: {
    flex: 1,
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    paddingVertical: 16,
    alignItems: "center",
  },
  actionIcon: { fontSize: 22, marginBottom: 6 },
  actionLabel: { color: "#E5E7EB", fontSize: 12, fontWeight: "700" },

  // Job cards
  jobCard: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  jobLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  jobTypeIcon: { fontSize: 22, marginRight: 12 },
  jobMeta: { flex: 1 },
  jobType: { color: "#F9FAFB", fontSize: 13, fontWeight: "700" },
  jobId: {
    color: "#4B5563",
    fontSize: 10,
    fontFamily: "Courier",
    marginTop: 2,
  },
  jobSrc: { color: "#374151", fontSize: 10, marginTop: 2 },
  statusBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: "700" },

  // Empty
  emptyCard: {
    backgroundColor: "#0B1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 32,
    alignItems: "center",
    marginBottom: 20,
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyCaption: {
    color: "#6B7280",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyLink: { color: "#6366F1", fontWeight: "600" },

  footer: {
    color: "#374151",
    fontSize: 11,
    textAlign: "center",
    marginTop: 12,
  },
});
