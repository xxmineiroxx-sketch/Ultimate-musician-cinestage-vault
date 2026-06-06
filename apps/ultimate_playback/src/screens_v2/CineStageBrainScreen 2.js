import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { CineStageAPI } from "../api/cinestage";
import CineStageBrainStatus from "../components_v2/CineStageBrainStatus";

function formatFeatureName(name) {
  return String(name || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCheckedAt(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function CineStageBrainScreen({ route }) {
  const [brainStatus, setBrainStatus] = useState(route?.params?.brainStatus || null);
  const [loading, setLoading] = useState(!route?.params?.brainStatus);
  const [refreshing, setRefreshing] = useState(false);
  const [lastError, setLastError] = useState("");
  const [checkedAt, setCheckedAt] = useState(Date.now());

  const loadStatus = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      const payload = await CineStageAPI.bootstrapBrain(force);
      setBrainStatus(payload?.brain || null);
      setLastError("");
      setCheckedAt(Date.now());
    } catch (error) {
      setLastError(error?.message || "CineStage cloud is unavailable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStatus(false);
  }, [loadStatus]);

  const isConnected = Boolean(brainStatus);
  const apps = Array.isArray(brainStatus?.apps) ? brainStatus.apps : [];
  const featureGroups = Object.entries(brainStatus?.capabilities || {});
  const connections = [
    { label: "API", value: brainStatus?.api_base_url || null },
    { label: "Sync", value: brainStatus?.sync_url || null },
    { label: "Realtime", value: brainStatus?.ws_url || null },
  ].filter((item) => item.value);

  const summaryMetrics = useMemo(
    () => [
      {
        label: "Status",
        value: isConnected ? "Online" : "Offline",
      },
      {
        label: "Version",
        value: brainStatus?.version || "—",
      },
      {
        label: "Feature Groups",
        value: String(brainStatus?.summary?.feature_group_count || featureGroups.length || 0),
      },
      {
        label: "Agents",
        value: String(brainStatus?.summary?.internal_agent_count || 0),
      },
    ],
    [brainStatus, featureGroups.length, isConnected],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadStatus(true)}
          tintColor="#818CF8"
        />
      }
    >
      <CineStageBrainStatus 
        showDetails={true}
        onPress={() => loadStatus(true)}
      />

      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroTitleWrap}>
            <Text style={styles.heroTitle}>CineStage Cloud</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.refreshButton}
            onPress={() => loadStatus(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator color="#E0E7FF" size="small" />
            ) : (
              <Text style={styles.refreshButtonText}>Refresh</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.heroSubtitle}>
          {isConnected
            ? "Ultimate Playback is connected to the CineStage cloud system. Real-time identification is active."
            : "Ultimate Playback cannot reach the CineStage cloud right now."}
        </Text>

        <Text style={styles.checkedAtText}>
          Last sync: {formatCheckedAt(checkedAt)}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#818CF8" />
          <Text style={styles.loadingText}>Checking CineStage cloud status…</Text>
        </View>
      ) : null}

      {lastError ? (
        <View style={styles.errorCard}>
          <Text style={styles.cardTitle}>Connection Error</Text>
          <Text style={styles.errorText}>{lastError}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connected Apps</Text>
        <Text style={styles.cardSub}>
          These apps are currently registered with CineStage cloud.
        </Text>
        <View style={styles.badgeWrap}>
          {apps.length > 0 ? (
            apps.map((app) => (
              <View key={app} style={styles.badge}>
                <Text style={styles.badgeText}>{app}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No connected apps reported yet.</Text>
          )}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cloud Summary</Text>
        <View style={styles.metricGrid}>
          {summaryMetrics.map((metric) => (
            <View key={metric.label} style={styles.metricCard}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricValue}>{metric.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cloud Connections</Text>
        <Text style={styles.cardSub}>
          Endpoints currently exposed by CineStage cloud.
        </Text>
        {connections.length > 0 ? (
          connections.map((connection) => (
            <View key={connection.label} style={styles.connectionRow}>
              <View style={styles.connectionLabelWrap}>
                <View style={styles.connectionDot} />
                <Text style={styles.connectionLabel}>{connection.label}</Text>
              </View>
              <Text style={styles.connectionValue} numberOfLines={2}>
                {connection.value}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No connection endpoints reported.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Feature Groups</Text>
        <Text style={styles.cardSub}>
          Playback shows which CineStage cloud systems are online, but does not run tools from here.
        </Text>
        <View style={styles.badgeWrap}>
          {featureGroups.length > 0 ? (
            featureGroups.map(([name, value]) => (
              <View key={name} style={styles.featureBadge}>
                <Text style={styles.featureName}>{formatFeatureName(name)}</Text>
                <Text style={styles.featureMeta}>
                  {value && typeof value === "object"
                    ? `${Object.keys(value).length} items`
                    : "Online"}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No feature groups reported.</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#020617",
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1220",
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 6,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  statusLight: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  statusLightOnline: {
    backgroundColor: "#22C55E",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  statusLightOffline: {
    backgroundColor: "#EF4444",
  },
  heroTitle: {
    color: "#F8FAFC",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    marginTop: 14,
    color: "#CBD5E1",
    fontSize: 15,
    lineHeight: 22,
  },
  statusRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#162033",
  },
  statusLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statusValue: {
    fontSize: 13,
    fontWeight: "800",
  },
  checkedAtText: {
    marginTop: 10,
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
  refreshButton: {
    minWidth: 84,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#312E81",
    borderWidth: 1,
    borderColor: "#4F46E5",
  },
  refreshButtonText: {
    color: "#E0E7FF",
    fontSize: 13,
    fontWeight: "800",
  },
  loadingCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#08111C",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "600",
  },
  errorCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#7F1D1D",
    backgroundColor: "#1F0A0A",
    padding: 18,
  },
  errorText: {
    marginTop: 8,
    color: "#FECACA",
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1220",
    padding: 18,
  },
  cardTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  cardSub: {
    marginTop: 6,
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
  },
  badgeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#131C2D",
    borderWidth: 1,
    borderColor: "#25344D",
  },
  badgeText: {
    color: "#C7D2FE",
    fontSize: 12,
    fontWeight: "800",
  },
  featureBadge: {
    minWidth: 132,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#213048",
  },
  featureName: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "800",
  },
  featureMeta: {
    marginTop: 4,
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 14,
  },
  metricCard: {
    minWidth: 132,
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#213048",
    backgroundColor: "#101827",
    padding: 14,
  },
  metricLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metricValue: {
    marginTop: 8,
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "900",
  },
  connectionRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#162033",
    gap: 8,
  },
  connectionLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#38BDF8",
  },
  connectionLabel: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "800",
  },
  connectionValue: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
  },
  emptyText: {
    marginTop: 14,
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
  },
});
