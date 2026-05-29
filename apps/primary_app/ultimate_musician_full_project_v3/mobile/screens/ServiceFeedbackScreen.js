/**
 * ServiceFeedbackScreen.js
 * Admin/worship-leader view of aggregated post-service feedback.
 * Navigate to it with:  navigation.navigate("ServiceFeedback", { serviceId, serviceName })
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";

import { API_URL, syncHeaders } from "./config";
import { useAuth } from "../context/AuthContext";

// ── Helpers ───────────────────────────────────────────────────────────────────
function StarDisplay({ value, size = 18 }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Text
          key={n}
          style={{ fontSize: size, color: n <= Math.round(value) ? "#F59E0B" : "#1E3A5F" }}
        >
          {n <= Math.round(value) ? "★" : "☆"}
        </Text>
      ))}
    </View>
  );
}

function AverageCard({ label, value, max = 5 }) {
  const pct = max > 0 ? value / max : 0;
  const barColor =
    pct >= 0.8 ? "#22C55E" : pct >= 0.6 ? "#F59E0B" : "#EF4444";

  return (
    <View style={s.avgCard}>
      <Text style={s.avgLabel}>{label}</Text>
      <Text style={[s.avgNumber, { color: barColor }]}>
        {value > 0 ? value.toFixed(1) : "—"}
      </Text>
      <StarDisplay value={value} size={16} />
      {/* Bar */}
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct * 100}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

function ResponseCard({ response, index }) {
  const [expanded, setExpanded] = useState(false);

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  return (
    <View style={s.responseCard}>
      <TouchableOpacity
        style={s.responseHeader}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.7}
      >
        <Text style={s.responseIndex}>Response {index + 1}</Text>
        <View style={s.responseRatings}>
          <Text style={s.responseRatingChip}>⭐ {response.overallRating}</Text>
          <Text style={s.responseRatingChip}>🌊 {response.flowRating}</Text>
          <Text style={s.responseRatingChip}>👥 {response.teamReadiness}</Text>
        </View>
        <Text style={s.responseChevron}>{expanded ? "∧" : "∨"}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={s.responseBody}>
          <View style={s.responseDetailRow}>
            <Text style={s.responseDetailLabel}>Overall</Text>
            <StarDisplay value={response.overallRating} size={14} />
          </View>
          <View style={s.responseDetailRow}>
            <Text style={s.responseDetailLabel}>Service Flow</Text>
            <StarDisplay value={response.flowRating} size={14} />
          </View>
          <View style={s.responseDetailRow}>
            <Text style={s.responseDetailLabel}>Team Readiness</Text>
            <StarDisplay value={response.teamReadiness} size={14} />
          </View>
          {response.notes ? (
            <View style={s.responseNotes}>
              <Text style={s.responseNotesLabel}>Notes</Text>
              <Text style={s.responseNotesText}>{response.notes}</Text>
            </View>
          ) : null}
          {response.submittedAt ? (
            <Text style={s.responseDate}>{formatDate(response.submittedAt)}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ServiceFeedbackScreen({ route, navigation }) {
  const { serviceId, serviceName = "Service" } = route?.params || {};
  const auth = useAuth();

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!serviceId) {
      setError("No service ID provided.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const role = auth?.userRole || "";
      const res = await fetch(`${API_URL}/api/services/${serviceId}/feedback/summary`, {
        headers: {
          ...syncHeaders(),
          "x-person-role": role,
        },
      });
      if (res.status === 403) {
        setError("Only admins and worship leaders can view feedback.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to load feedback");
      }
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      setError(err.message || "Could not load feedback summary.");
    } finally {
      setLoading(false);
    }
  }, [serviceId, auth?.userRole]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Render states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color="#818CF8" size="large" />
        <Text style={s.loadingText}>Loading feedback…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.centered}>
        <Text style={s.errorIcon}>⚠️</Text>
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={s.retryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!summary || summary.count === 0) {
    return (
      <View style={s.centered}>
        <Text style={s.emptyIcon}>📭</Text>
        <Text style={s.emptyTitle}>No Feedback Yet</Text>
        <Text style={s.emptyText}>
          Team members haven't submitted feedback for this service yet.
        </Text>
        <TouchableOpacity style={s.retryBtn} onPress={load}>
          <Text style={s.retryBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { avgOverall, avgFlow, avgReadiness, count, responses } = summary;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Hero banner */}
      <View style={s.heroBanner}>
        <Text style={s.heroTitle}>{serviceName}</Text>
        <Text style={s.heroSubtitle}>Post-Service Feedback</Text>
        <View style={s.heroCountBadge}>
          <Text style={s.heroCountText}>{count} {count === 1 ? "response" : "responses"}</Text>
        </View>
      </View>

      {/* Average scores */}
      <View style={s.avgRow}>
        <AverageCard label="Overall" value={avgOverall} />
        <AverageCard label="Service Flow" value={avgFlow} />
        <AverageCard label="Team Readiness" value={avgReadiness} />
      </View>

      {/* Grand average */}
      <View style={s.grandAvgCard}>
        <Text style={s.grandAvgLabel}>Team Average</Text>
        <Text style={s.grandAvgValue}>
          {((avgOverall + avgFlow + avgReadiness) / 3).toFixed(1)}
        </Text>
        <StarDisplay value={(avgOverall + avgFlow + avgReadiness) / 3} size={22} />
        <Text style={s.grandAvgSub}>across {count} {count === 1 ? "response" : "responses"}</Text>
      </View>

      {/* Individual responses */}
      <Text style={s.sectionTitle}>Individual Responses</Text>
      <Text style={s.sectionSub}>Responses are anonymous — ratings + notes only.</Text>
      {responses.map((r, i) => (
        <ResponseCard key={i} response={r} index={i} />
      ))}

      {/* Refresh */}
      <TouchableOpacity style={s.refreshBtn} onPress={load}>
        <Text style={s.refreshBtnText}>Refresh</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  scroll: { padding: 20, paddingTop: 16 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#020617",
    padding: 32,
    gap: 12,
  },
  loadingText: { color: "#64748B", fontSize: 14, marginTop: 8 },
  errorIcon: { fontSize: 40 },
  errorText: { color: "#F87171", fontSize: 15, textAlign: "center", lineHeight: 22 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: "#F9FAFB", fontSize: 20, fontWeight: "800" },
  emptyText: { color: "#64748B", fontSize: 14, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    marginTop: 8,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: "#334155",
  },
  retryBtnText: { color: "#94A3B8", fontSize: 15, fontWeight: "700" },

  // Hero banner
  heroBanner: {
    backgroundColor: "#0B1120",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  heroTitle: {
    color: "#F9FAFB",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  heroSubtitle: { color: "#64748B", fontSize: 13, marginTop: 4, fontStyle: "italic" },
  heroCountBadge: {
    marginTop: 12,
    backgroundColor: "#1E3A5F",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  heroCountText: { color: "#93C5FD", fontSize: 13, fontWeight: "700" },

  // Average cards row
  avgRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  avgCard: {
    flex: 1,
    backgroundColor: "#0B1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  avgLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  avgNumber: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 36,
  },
  barTrack: {
    width: "100%",
    height: 4,
    backgroundColor: "#1E293B",
    borderRadius: 2,
    marginTop: 6,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
  },

  // Grand average
  grandAvgCard: {
    backgroundColor: "#1E1B4B",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#4F46E5",
    padding: 24,
    alignItems: "center",
    marginBottom: 28,
    gap: 8,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  grandAvgLabel: {
    color: "#A5B4FC",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  grandAvgValue: {
    color: "#F9FAFB",
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: -2,
    lineHeight: 60,
  },
  grandAvgSub: { color: "#6366F1", fontSize: 12, marginTop: 4 },

  // Individual responses
  sectionTitle: {
    color: "#F9FAFB",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  sectionSub: { color: "#475569", fontSize: 12, marginBottom: 14 },

  responseCard: {
    backgroundColor: "#0B1120",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    marginBottom: 10,
    overflow: "hidden",
  },
  responseHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 10,
  },
  responseIndex: { color: "#64748B", fontSize: 13, fontWeight: "600", flex: 1 },
  responseRatings: { flexDirection: "row", gap: 6 },
  responseRatingChip: {
    backgroundColor: "#1E293B",
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
  },
  responseChevron: { color: "#475569", fontSize: 14, fontWeight: "700", width: 16, textAlign: "center" },

  responseBody: {
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    padding: 16,
    gap: 10,
  },
  responseDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  responseDetailLabel: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },

  responseNotes: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  responseNotesLabel: { color: "#64748B", fontSize: 11, fontWeight: "700", marginBottom: 4 },
  responseNotesText: { color: "#CBD5E1", fontSize: 14, lineHeight: 20 },

  responseDate: { color: "#374151", fontSize: 11, textAlign: "right", marginTop: 4 },

  // Refresh
  refreshBtn: {
    marginTop: 20,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  refreshBtnText: { color: "#64748B", fontSize: 14, fontWeight: "700" },
});
