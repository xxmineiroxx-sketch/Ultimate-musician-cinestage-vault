/**
 * NotificationPrefsScreen.js
 * Per-user notification preference toggles.
 * Storage key: um/prefs/notifications (AsyncStorage JSON)
 * Sync: POST {SYNC_URL}/sync/user/prefs (fire-and-forget)
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SYNC_URL, syncHeaders } from "./config";

// ── Storage ────────────────────────────────────────────────────────────────────
const PREFS_KEY = "um/prefs/notifications";

const DEFAULT_PREFS = {
  // Assignments
  newAssignment: true,
  assignmentDeadline: true,
  assignmentResponse: true,
  // Services
  servicePlanPublished: true,
  servicePlanUpdated: true,
  newSongAdded: true,
  serviceLocked: true,
  // Team
  newTeamMember: true,
  memberOffline: true,
  // System
  weLive: true,
  rehearsalStarted: true,
  appUpdates: true,
};

async function loadPrefs() {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

async function savePrefs(prefs) {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* silent */
  }
}

function syncPrefsToServer(prefs) {
  fetch(`${SYNC_URL}/sync/user/prefs`, {
    method: "POST",
    headers: syncHeaders(),
    body: JSON.stringify({ notificationPrefs: prefs }),
  }).catch(() => {/* fire-and-forget */});
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function SectionHeader({ title }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      <View style={styles.sectionHeaderLine} />
    </View>
  );
}

function PrefRow({ label, value, onChange, isLast }) {
  return (
    <View style={[styles.prefRow, isLast && styles.prefRowLast]}>
      <Text style={styles.prefLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#1E293B", true: "#6366F1" }}
        thumbColor={value ? "#E0E7FF" : "#64748B"}
        ios_backgroundColor="#1E293B"
      />
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function NotificationPrefsScreen() {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadPrefs().then((p) => {
      setPrefs(p);
      setReady(true);
    });
  }, []);

  const toggle = useCallback(
    (key) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        savePrefs(next);
        syncPrefsToServer(next);
        return next;
      });
    },
    [],
  );

  if (!ready) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading preferences…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + 40 },
      ]}
    >
      {/* Assignments */}
      <SectionHeader title="Assignments" />
      <View style={styles.card}>
        <PrefRow
          label="New assignment received"
          value={prefs.newAssignment}
          onChange={() => toggle("newAssignment")}
        />
        <PrefRow
          label="Assignment deadline reminder (3 days before)"
          value={prefs.assignmentDeadline}
          onChange={() => toggle("assignmentDeadline")}
        />
        <PrefRow
          label="Someone accepts / declines your assignment"
          value={prefs.assignmentResponse}
          onChange={() => toggle("assignmentResponse")}
          isLast
        />
      </View>

      {/* Services */}
      <SectionHeader title="Services" />
      <View style={styles.card}>
        <PrefRow
          label="Service plan published"
          value={prefs.servicePlanPublished}
          onChange={() => toggle("servicePlanPublished")}
        />
        <PrefRow
          label="Service plan updated"
          value={prefs.servicePlanUpdated}
          onChange={() => toggle("servicePlanUpdated")}
        />
        <PrefRow
          label="New song added to service"
          value={prefs.newSongAdded}
          onChange={() => toggle("newSongAdded")}
        />
        <PrefRow
          label="Service locked for rehearsal"
          value={prefs.serviceLocked}
          onChange={() => toggle("serviceLocked")}
          isLast
        />
      </View>

      {/* Team */}
      <SectionHeader title="Team" />
      <View style={styles.card}>
        <PrefRow
          label="New team member joins (admins only)"
          value={prefs.newTeamMember}
          onChange={() => toggle("newTeamMember")}
        />
        <PrefRow
          label="Someone goes offline during rehearsal"
          value={prefs.memberOffline}
          onChange={() => toggle("memberOffline")}
          isLast
        />
      </View>

      {/* System */}
      <SectionHeader title="System" />
      <View style={styles.card}>
        <PrefRow
          label="We're Live notification"
          value={prefs.weLive}
          onChange={() => toggle("weLive")}
        />
        <PrefRow
          label="Rehearsal started"
          value={prefs.rehearsalStarted}
          onChange={() => toggle("rehearsalStarted")}
        />
        <PrefRow
          label="App updates available"
          value={prefs.appUpdates}
          onChange={() => toggle("appUpdates")}
          isLast
        />
      </View>

      <Text style={styles.hint}>
        Changes are saved automatically and synced to your account.
      </Text>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#020617",
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#475569",
    fontSize: 14,
  },
  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 28,
    marginBottom: 10,
    gap: 10,
  },
  sectionHeaderText: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    flexShrink: 0,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#1E293B",
  },
  // Card
  card: {
    backgroundColor: "#0B1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    overflow: "hidden",
  },
  // Rows
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    gap: 12,
  },
  prefRowLast: {
    borderBottomWidth: 0,
  },
  prefLabel: {
    flex: 1,
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  // Footer hint
  hint: {
    color: "#374151",
    fontSize: 12,
    textAlign: "center",
    marginTop: 28,
    lineHeight: 18,
  },
});
