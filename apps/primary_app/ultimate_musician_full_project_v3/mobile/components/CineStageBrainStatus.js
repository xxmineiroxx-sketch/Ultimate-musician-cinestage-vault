/**
 * CineStageBrainStatus - live status indicator backed by brain bootstrap data.
 */

import React, { useEffect, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Platform } from "react-native";

import { useTheme } from "../context/ThemeContext";
import {
  CINESTAGE_API_BASE_URL,
  getStemProcessingRoute,
  loadBrainSnapshot,
  summarizeDesktopWorkers,
} from "../services/cinestage";
import CineStageBrainLogo from "./CineStageBrainLogo";


function hostLabel(url) {
  const fallback = String(CINESTAGE_API_BASE_URL || "").replace(/^https?:\/\//, "");
  try {
    return new URL(url || CINESTAGE_API_BASE_URL).host || fallback;
  } catch {
    return String(url || fallback).replace(/^https?:\/\//, "");
  }
}


function formatCheckedAt(value) {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return "Unknown";
  }
}


export default function CineStageBrainStatus({
  onPress,
  compact = false,
  showDetails = true,
}) {
  const { colors } = useTheme();
  const [snapshot, setSnapshot] = useState({
    loading: true,
    isOnline: false,
    brain: null,
    latencyMs: null,
    checkedAt: null,
    error: "",
  });
  const [stemRoute, setStemRoute] = useState(summarizeDesktopWorkers([]));

  useEffect(() => {
    let cancelled = false;

    async function refreshStatus(force = true) {
      try {
        const [next, route] = await Promise.all([
          loadBrainSnapshot(force),
          getStemProcessingRoute(),
        ]);
        if (cancelled) return;
        setSnapshot({
          loading: false,
          isOnline: next.isOnline,
          brain: next.brain,
          latencyMs: next.latencyMs,
          checkedAt: next.checkedAt,
          error: "",
        });
        setStemRoute(route);
      } catch (error) {
        if (cancelled) return;
        setSnapshot({
          loading: false,
          isOnline: false,
          brain: null,
          latencyMs: null,
          checkedAt: Date.now(),
          error: error?.message || "CineStage cloud is unavailable.",
        });
        setStemRoute(summarizeDesktopWorkers([]));
      }
    }

    refreshStatus(true);
    const interval = setInterval(() => refreshStatus(true), 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handlePress = () => {
    if (onPress) onPress();
  };

  const { loading, isOnline, brain, latencyMs, checkedAt, error } = snapshot;
  const statusText = loading ? "Checking" : isOnline ? "Online" : "Offline";
  const badgeText = loading ? "Checking" : isOnline ? "Connected" : "Offline";
  const badgeColor = loading ? "#F59E0B" : isOnline ? "#10B981" : "#6B7280";
  const summary = brain?.summary || brain?.capabilities?.summary || null;
  const secondaryMetric = loading
    ? "Pending"
    : isOnline
      ? `v${brain?.version || "—"}`
      : "Unavailable";
  const secondaryLabel = isOnline ? "Brain version" : "Status";
  const server = hostLabel(brain?.api_base_url);
  const summaryText = isOnline
    ? `${summary?.feature_group_count ?? 0} groups · ${summary?.internal_agent_count ?? 0} agents`
    : (error || "No bootstrap response");

  if (compact) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
        <View style={styles.compactContainer}>
          <CineStageBrainLogo
            size="small"
            showStatusText={false}
            statusOverride={{ loading, isOnline, brain }}
          />
          <View style={styles.compactText}>
            <Text style={[styles.brainName, { color: colors.text }]}>
              CineStage Brain
            </Text>
            <Text style={[styles.onlineStatus, { color: colors.subtle }]}>
              {statusText}
              {latencyMs != null ? ` • ${latencyMs}ms` : ""}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      style={[styles.container, { backgroundColor: colors.card }]}
    >
      <View style={styles.logoSection}>
        <CineStageBrainLogo
          size={showDetails ? "large" : "medium"}
          showStatusText={showDetails}
          statusOverride={{ loading, isOnline, brain }}
        />
      </View>

      {showDetails && (
        <View style={styles.detailsSection}>
          <View style={styles.connectionRow}>
            <Text style={[styles.label, { color: colors.subtle }]}>
              Cloudflare Server
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: badgeColor }]}>
              <Text style={styles.statusBadgeText}>{badgeText}</Text>
            </View>
          </View>

          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                {latencyMs != null ? latencyMs : "—"}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.subtle }]}>
                ms latency
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                {secondaryMetric}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.subtle }]}>
                {secondaryLabel}
              </Text>
            </View>
          </View>

          <View style={styles.serverInfo}>
            <View style={styles.stemRouteRow}>
              <View
                style={[
                  styles.stemRouteDot,
                  { backgroundColor: stemRoute.desktopOnline ? "#10B981" : "#F59E0B" },
                ]}
              />
              <View style={styles.stemRouteCopy}>
                <Text style={[styles.stemRouteTitle, { color: colors.text }]}>
                  {stemRoute.statusLabel}
                </Text>
                <Text style={[styles.stemRouteText, { color: colors.subtle }]}>
                  Stems route: {stemRoute.routeLabel}
                </Text>
              </View>
            </View>
            <Text style={[styles.serverUrl, { color: colors.subtle }]}>
              Server: {server}
            </Text>
            <Text style={[styles.lastPing, { color: colors.subtle }]}>
              Last ping: {formatCheckedAt(checkedAt)}
            </Text>
            <Text
              style={[
                styles.summary,
                { color: isOnline ? colors.subtle : "#FCA5A5" },
              ]}
              numberOfLines={2}
            >
              {summaryText}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  compactText: {
    marginLeft: 12,
  },
  brainName: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  onlineStatus: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  logoSection: {
    marginBottom: 16,
  },
  detailsSection: {
    width: "100%",
    paddingHorizontal: 8,
  },
  connectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  metric: {
    alignItems: "center",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "900",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    marginTop: 4,
    letterSpacing: 0.5,
  },
  serverInfo: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  stemRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  stemRouteDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    marginRight: 8,
  },
  stemRouteCopy: {
    flex: 1,
  },
  stemRouteTitle: {
    fontSize: 11,
    fontWeight: "900",
  },
  stemRouteText: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  serverUrl: {
    fontSize: 10,
    fontFamily: "Courier",
    marginBottom: 4,
  },
  lastPing: {
    fontSize: 10,
    fontWeight: "600",
  },
  summary: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
  },
});
