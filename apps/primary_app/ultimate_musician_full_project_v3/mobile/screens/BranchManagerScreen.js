/**
 * BranchManagerScreen — Org Owner dashboard (web/desktop only)
 * Lists all branches with stats, allows creating new branches,
 * and drills into each branch's people/songs/services (read-only).
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SYNC_URL, syncHeaders, SYNC_ORG_ID, SYNC_SECRET_KEY } from "./config";

const LANGUAGES = [
  "English",
  "Spanish",
  "Portuguese",
  "Haitian Creole",
  "Other",
];

const LANG_COLORS = {
  English: "#3B82F6",
  Spanish: "#EF4444",
  Portuguese: "#10B981",
  "Haitian Creole": "#F59E0B",
  Other: "#8B5CF6",
};

export default function BranchManagerScreen() {
  const insets = useSafeAreaInsets();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState(null); // { branch, data }
  const [loadingDetail, setLoadingDetail] = useState(false);

  // New branch form state
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newLang, setNewLang] = useState("English");
  const [newPastorName, setNewPastorName] = useState("");
  const [newPastorEmail, setNewPastorEmail] = useState("");
  const [newPastorRole, setNewPastorRole] = useState("Pastor"); // 'Pastor' | 'Admin'
  const [creating, setCreating] = useState(false);
  const [newCreds, setNewCreds] = useState(null); // { orgId, secretKey, name, city, pastorName, pastorRole } — shown once

  const loadBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SYNC_URL}/sync/branches`, {
        headers: syncHeaders(),
      });
      const data = await res.json();
      setBranches(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert(
        "Error",
        "Could not load branches. Make sure this account is a parent organization.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  async function handleCreateBranch() {
    const name = newName.trim();
    const city = newCity.trim();
    if (!name) {
      Alert.alert("Required", "Branch name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${SYNC_URL}/sync/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          city,
          language: newLang,
          adminName: newPastorName.trim() || undefined,
          adminEmail: newPastorEmail.trim() || undefined,
          adminRole: newPastorRole,
          parentOrgId: SYNC_ORG_ID,
          parentSecretKey: SYNC_SECRET_KEY,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error("Failed");

      setNewCreds({
        orgId: data.orgId,
        secretKey: data.secretKey,
        name: data.name,
        city: data.city,
        pastorName: newPastorName.trim(),
        pastorEmail: newPastorEmail.trim(),
        pastorRole: newPastorRole,
      });
      setShowAdd(false);
      setNewName("");
      setNewCity("");
      setNewLang("English");
      setNewPastorName("");
      setNewPastorEmail("");
      setNewPastorRole("Pastor");
      loadBranches();
    } catch {
      Alert.alert("Error", "Could not create branch. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleViewBranch(branch) {
    setLoadingDetail(true);
    setDetail({ branch, data: null });
    try {
      const res = await fetch(
        `${SYNC_URL}/sync/branch/${branch.branchId}/overview`,
        { headers: syncHeaders() },
      );
      const data = await res.json();
      setDetail({ branch, data });
    } catch {
      setDetail({ branch, data: { error: true } });
    } finally {
      setLoadingDetail(false);
    }
  }

  // ── Credentials modal (shown ONCE after branch creation) ──
  if (newCreds) {
    return (
      <View style={styles.credModal}>
        <View style={styles.credBox}>
          <Text style={styles.credTitle}>🔑 Branch Created!</Text>
          <Text style={styles.credWarning}>
            Save these credentials now — the Secret Key will NEVER be shown
            again.
          </Text>
          <View style={styles.credRow}>
            <Text style={styles.credLabel}>Branch Name</Text>
            <Text style={styles.credValue}>
              {newCreds.name}
              {newCreds.city ? ` — ${newCreds.city}` : ""}
            </Text>
          </View>
          {newCreds.pastorName ? (
            <View style={styles.credRow}>
              <Text style={styles.credLabel}>{newCreds.pastorRole || "Pastor"}</Text>
              <Text style={styles.credValue}>
                {newCreds.pastorName}
                {newCreds.pastorEmail ? ` · ${newCreds.pastorEmail}` : ""}
              </Text>
            </View>
          ) : null}
          <View style={styles.credRow}>
            <Text style={styles.credLabel}>Branch ID</Text>
            <Text style={[styles.credValue, styles.mono]} selectable>
              {newCreds.orgId}
            </Text>
          </View>
          <View style={styles.credRow}>
            <Text style={styles.credLabel}>Secret Key</Text>
            <Text style={[styles.credValue, styles.mono]} selectable>
              {newCreds.secretKey}
            </Text>
          </View>
          <Text style={styles.credNote}>
            Give these to the branch Pastor/Admin. They enter them in the iPad's
            Ultimate Musician app under Organization → Connect to Branch.
          </Text>
          <TouchableOpacity
            style={styles.credDone}
            onPress={() => setNewCreds(null)}
          >
            <Text style={styles.credDoneText}>
              ✓ I've Saved These Credentials
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Branch detail drill-in ──
  if (detail) {
    const { branch, data } = detail;
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      >
        <TouchableOpacity
          onPress={() => setDetail(null)}
          style={styles.backBtn}
        >
          <Text style={styles.backBtnText}>← Back to Branches</Text>
        </TouchableOpacity>

        <Text style={styles.detailTitle}>{branch.name}</Text>
        {branch.city && <Text style={styles.detailCity}>📍 {branch.city}</Text>}
        {branch.language && (
          <View
            style={[
              styles.langBadge,
              {
                backgroundColor:
                  (LANG_COLORS[branch.language] || "#8B5CF6") + "30",
              },
            ]}
          >
            <Text
              style={[
                styles.langBadgeText,
                { color: LANG_COLORS[branch.language] || "#8B5CF6" },
              ]}
            >
              {branch.language}
            </Text>
          </View>
        )}

        {loadingDetail && (
          <ActivityIndicator color="#4F46E5" style={{ marginTop: 32 }} />
        )}

        {data && !data.error && (
          <>
            {/* Stats */}
            <View style={styles.statsRow}>
              {[
                {
                  label: "Members",
                  value: (data.people || []).length,
                  icon: "👥",
                },
                {
                  label: "Songs",
                  value: (data.songs || []).length,
                  icon: "🎵",
                },
                {
                  label: "Services",
                  value: (data.services || []).length,
                  icon: "📅",
                },
              ].map((s) => (
                <View key={s.label} style={styles.statCard}>
                  <Text style={styles.statIcon}>{s.icon}</Text>
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Members */}
            <Text style={styles.sectionTitle}>Team Members</Text>
            {(data.people || []).length === 0 ? (
              <Text style={styles.emptyText}>No members yet</Text>
            ) : (
              (data.people || []).map((p, i) => (
                <View key={p.id || i} style={styles.memberRow}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>
                      {(p.name || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{p.name || "Unknown"}</Text>
                    {p.email ? (
                      <Text style={styles.memberEmail}>{p.email}</Text>
                    ) : null}
                  </View>
                  {(p.roles || []).slice(0, 2).map((r, ri) => (
                    <View key={ri} style={styles.roleChip}>
                      <Text style={styles.roleChipText}>{r}</Text>
                    </View>
                  ))}
                </View>
              ))
            )}

            {/* Recent services */}
            <Text style={styles.sectionTitle}>Recent Services</Text>
            {(data.services || []).length === 0 ? (
              <Text style={styles.emptyText}>No services yet</Text>
            ) : (
              (data.services || [])
                .slice(-5)
                .reverse()
                .map((s, i) => (
                  <View key={s.id || i} style={styles.serviceRow}>
                    <Text style={styles.serviceDate}>
                      {s.date
                        ? new Date(
                            String(s.date).includes("T")
                              ? s.date
                              : s.date + "T00:00:00",
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </Text>
                    <Text style={styles.serviceName}>
                      {s.name || s.title || "Service"}
                    </Text>
                  </View>
                ))
            )}
          </>
        )}
        {data?.error && (
          <Text style={styles.emptyText}>Could not load branch details.</Text>
        )}
      </ScrollView>
    );
  }

  // ── Main branches list ──
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 40 }}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🏛 Branches</Text>
          <Text style={styles.headerSub}>
            All churches in your organization
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAdd(true)}
        >
          <Text style={styles.addBtnText}>+ Add Branch</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator color="#4F46E5" style={{ marginTop: 48 }} />
      )}

      {!loading && branches.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏗</Text>
          <Text style={styles.emptyStateTitle}>No branches yet</Text>
          <Text style={styles.emptyStateText}>
            Tap "Add Branch" to create your first church branch. Each branch
            gets its own isolated library, members, and services.
          </Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowAdd(true)}
          >
            <Text style={styles.addBtnText}>+ Add First Branch</Text>
          </TouchableOpacity>
        </View>
      )}

      {branches.map((b) => (
        <TouchableOpacity
          key={b.branchId}
          style={styles.branchCard}
          onPress={() => handleViewBranch(b)}
        >
          <View style={styles.branchCardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.branchName}>{b.name}</Text>
              {b.city && <Text style={styles.branchCity}>📍 {b.city}</Text>}
            </View>
            {b.language && (
              <View
                style={[
                  styles.langBadge,
                  {
                    backgroundColor:
                      (LANG_COLORS[b.language] || "#8B5CF6") + "30",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.langBadgeText,
                    { color: LANG_COLORS[b.language] || "#8B5CF6" },
                  ]}
                >
                  {b.language}
                </Text>
              </View>
            )}
          </View>
          {b.adminName ? (
            <Text style={styles.branchPastor}>
              {b.adminRole === 'Admin' ? '👑' : '✝️'} {b.adminRole || 'Pastor'}: {b.adminName}
              {b.adminEmail ? ` · ${b.adminEmail}` : ''}
            </Text>
          ) : null}
          <View style={styles.branchStats}>
            <Text style={styles.branchStat}>
              👥 {b.memberCount || 0} members
            </Text>
            <Text style={styles.branchStat}>🎵 {b.songCount || 0} songs</Text>
            <Text style={styles.branchStat}>
              📅 {b.serviceCount || 0} services
            </Text>
          </View>
          <Text style={styles.branchArrow}>View details →</Text>
        </TouchableOpacity>
      ))}

      {/* Add Branch Modal */}
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Branch</Text>

            <Text style={styles.modalLabel}>Branch Name *</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Faith Church Wellington"
              placeholderTextColor="#4B5563"
            />

            <Text style={styles.modalLabel}>City</Text>
            <TextInput
              style={styles.modalInput}
              value={newCity}
              onChangeText={setNewCity}
              placeholder="e.g. Wellington, FL"
              placeholderTextColor="#4B5563"
            />

            <Text style={styles.modalLabel}>Pastor / Admin Name</Text>
            <TextInput
              style={styles.modalInput}
              value={newPastorName}
              onChangeText={setNewPastorName}
              placeholder="e.g. Pastor John Smith"
              placeholderTextColor="#4B5563"
            />

            <Text style={styles.modalLabel}>Pastor / Admin Email</Text>
            <TextInput
              style={styles.modalInput}
              value={newPastorEmail}
              onChangeText={setNewPastorEmail}
              placeholder="pastor@church.com"
              placeholderTextColor="#4B5563"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.modalLabel}>Role</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
              {["Pastor", "Admin"].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.langOption, newPastorRole === r && { backgroundColor: "#1E1B4B", borderColor: "#4F46E5" }]}
                  onPress={() => setNewPastorRole(r)}
                >
                  <Text style={[styles.langOptionText, newPastorRole === r && { color: "#818CF8" }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Primary Language</Text>
            <View style={styles.langPicker}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang}
                  style={[
                    styles.langOption,
                    newLang === lang && {
                      backgroundColor: (LANG_COLORS[lang] || "#8B5CF6") + "30",
                      borderColor: LANG_COLORS[lang] || "#8B5CF6",
                    },
                  ]}
                  onPress={() => setNewLang(lang)}
                >
                  <Text
                    style={[
                      styles.langOptionText,
                      newLang === lang && {
                        color: LANG_COLORS[lang] || "#8B5CF6",
                      },
                    ]}
                  >
                    {lang}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowAdd(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCreate, creating && { opacity: 0.6 }]}
                onPress={handleCreateBranch}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalCreateText}>Create Branch</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  headerTitle: { color: "#F9FAFB", fontSize: 24, fontWeight: "700" },
  headerSub: { color: "#6B7280", fontSize: 13, marginTop: 2 },

  addBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyStateTitle: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyStateText: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },

  branchCard: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 18,
    marginBottom: 14,
  },
  branchCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  branchName: { color: "#F9FAFB", fontSize: 18, fontWeight: "700" },
  branchCity: { color: "#9CA3AF", fontSize: 13, marginTop: 2 },
  branchPastor: { color: "#A78BFA", fontSize: 13, marginBottom: 8, fontWeight: "500" },
  branchStats: { flexDirection: "row", gap: 16, marginBottom: 8 },
  branchStat: { color: "#6B7280", fontSize: 13 },
  branchArrow: { color: "#4F46E5", fontSize: 13, fontWeight: "600" },

  langBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "transparent",
  },
  langBadgeText: { fontSize: 12, fontWeight: "700" },

  // Detail view
  backBtn: { marginBottom: 20 },
  backBtnText: { color: "#818CF8", fontSize: 15, fontWeight: "600" },
  detailTitle: {
    color: "#F9FAFB",
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 4,
  },
  detailCity: { color: "#9CA3AF", fontSize: 15, marginBottom: 8 },
  statsRow: { flexDirection: "row", gap: 12, marginVertical: 20 },
  statCard: {
    flex: 1,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  statIcon: { fontSize: 24, marginBottom: 4 },
  statValue: { color: "#F9FAFB", fontSize: 22, fontWeight: "700" },
  statLabel: { color: "#6B7280", fontSize: 12, marginTop: 2 },

  sectionTitle: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
    marginTop: 8,
  },
  emptyText: { color: "#4B5563", fontSize: 14, paddingVertical: 12 },

  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    gap: 10,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1E1B4B",
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: { color: "#818CF8", fontWeight: "700", fontSize: 16 },
  memberName: { color: "#F9FAFB", fontSize: 14, fontWeight: "600" },
  memberEmail: { color: "#6B7280", fontSize: 12 },
  roleChip: {
    backgroundColor: "#1E293B",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  roleChipText: { color: "#9CA3AF", fontSize: 11 },

  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    gap: 12,
  },
  serviceDate: { color: "#6B7280", fontSize: 13, width: 100 },
  serviceName: { color: "#F9FAFB", fontSize: 14, fontWeight: "500", flex: 1 },

  // Credentials modal
  credModal: {
    flex: 1,
    backgroundColor: "#000000CC",
    justifyContent: "center",
    padding: 24,
  },
  credBox: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  credTitle: {
    color: "#F59E0B",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  credWarning: {
    color: "#9CA3AF",
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  credRow: { marginBottom: 14 },
  credLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  credValue: { color: "#F9FAFB", fontSize: 15 },
  mono: {
    fontFamily: "monospace",
    fontSize: 13,
    color: "#818CF8",
    letterSpacing: 0.5,
  },
  credNote: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 20,
  },
  credDone: {
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  credDoneText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // Add branch modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "#000000BB",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 20,
  },
  modalLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 14,
  },
  modalInput: {
    backgroundColor: "#1E293B",
    color: "#F9FAFB",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  langPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  langOption: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#374151",
  },
  langOptionText: { color: "#9CA3AF", fontSize: 13, fontWeight: "600" },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 24 },
  modalCancel: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCancelText: { color: "#9CA3AF", fontWeight: "600", fontSize: 15 },
  modalCreate: {
    flex: 1,
    backgroundColor: "#4F46E5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCreateText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
