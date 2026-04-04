/**
 * Permissions Screen - Ultimate Musician
 * Secure leadership assignment area for the current organization/branch.
 * Org Owners can grant Admin + Worship Leader.
 * Branch Admins can grant Worship Leader inside their branch only.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { SYNC_URL, syncHeaders } from "./config";

const ROLE_OPTIONS = [
  { key: "worship_leader", label: "Worship Leader", icon: "🎵", color: "#10B981",
    desc: "Can lead worship, review service plans, and manage the setlist flow for this branch." },
  { key: "admin",          label: "Admin",           icon: "👑", color: "#F59E0B",
    desc: "Can manage branch leadership and secure organization settings." },
];

const ROLE_COLOR = {
  worship_leader: "#10B981", admin: "#F59E0B", org_owner: "#EF4444",
};
const ROLE_ICON  = { worship_leader: "🎵", admin: "👑", org_owner: "🏛" };
const ROLE_LABEL = {
  worship_leader: "Worship Leader",
  admin: "Admin", org_owner: "Org Owner",
};

function normalizeOrgRole(role) {
  if (role === "owner" || role === "org_owner") return "org_owner";
  return role || null;
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

export default function PermissionsScreen({ navigation }) {
  const [people, setPeople]   = useState([]);
  const [roles, setRoles]     = useState({});       // email → role
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(null);
  const [error, setError]     = useState(null);
  const [viewerRole, setViewerRole] = useState(null);
  const [scopeName, setScopeName] = useState("");
  const [isBranchScope, setIsBranchScope] = useState(false);

  // Role picker modal
  const [pickerTarget, setPickerTarget] = useState(null); // person object

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settingsRaw  = await AsyncStorage.getItem("settings.v1").catch(() => null);
      const settings     = settingsRaw ? JSON.parse(settingsRaw) : {};
      const viewerEmail  = (settings.email || "").toLowerCase();

      const [peopleData, rolesMapRaw, roleInfo, profile] = await Promise.all([
        fetchJson(`${SYNC_URL}/sync/people`,  { headers: syncHeaders() }),
        fetchJson(`${SYNC_URL}/sync/roles`,   { headers: syncHeaders() }),
        viewerEmail
          ? fetchJson(`${SYNC_URL}/sync/role?email=${encodeURIComponent(viewerEmail)}`, { headers: syncHeaders() })
          : Promise.resolve({ role: null, orgName: "" }),
        fetchJson(`${SYNC_URL}/sync/org/profile`, { headers: syncHeaders() }),
      ]);

      setPeople(Array.isArray(peopleData) ? peopleData : []);

      const nextRoles = {};
      Object.entries(rolesMapRaw || {}).forEach(([email, role]) => {
        nextRoles[email.toLowerCase()] = normalizeOrgRole(role);
      });
      setRoles(nextRoles);
      setViewerRole(normalizeOrgRole(roleInfo?.role || nextRoles[viewerEmail] || null));
      setScopeName(roleInfo?.orgName || profile?.name || "");
      setIsBranchScope(Boolean(profile?.parentOrgId));
    } catch {
      setError("Cannot reach sync server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const canAssignRole = (roleKey) => {
    if (viewerRole === "org_owner") return roleKey === "admin" || roleKey === "worship_leader";
    if (viewerRole === "admin")     return roleKey === "worship_leader";
    return false;
  };

  const handleSetRole = async (person, newRole) => {
    const email = (person.email || "").toLowerCase();
    if (!email) {
      Alert.alert("No Email", `${person.name} has no email — cannot grant a role.`);
      return;
    }
    setPickerTarget(null);
    setSaving(email);
    try {
      await fetchJson(`${SYNC_URL}/sync/role/set`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({ email, role: newRole }),
      });
      setRoles((prev) => {
        const next = { ...prev };
        if (newRole === null) delete next[email];
        else next[email] = normalizeOrgRole(newRole);
        return next;
      });
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(null);
    }
  };

  const grantedCount = people.filter((person) => {
    const email = (person.email || "").toLowerCase();
    const role = normalizeOrgRole(roles[email] || person.role);
    return role === "org_owner" || role === "admin" || role === "worship_leader";
  }).length;
  const canManagePermissions = viewerRole === "org_owner" || viewerRole === "admin";
  const scopeLabel = isBranchScope ? "Current Branch" : "Current Organization";
  const headerTitle = isBranchScope ? "Branch Team Permissions" : "Organization Team Permissions";
  const headerSub = isBranchScope
    ? "Branch admins can safely grant Worship Leader access for this branch only."
    : "Organization Owners can grant admins. Admins can grant Worship Leaders.";

  if (!loading && !canManagePermissions) {
    return (
      <View style={s.lockedWrap}>
        <Text style={s.lockedIcon}>🔐</Text>
        <Text style={s.lockedTitle}>Restricted Area</Text>
        <Text style={s.lockedText}>
          Team permissions now live inside Organization & Branch controls. Only the
          Organization Owner or a Branch Admin can manage this area.
        </Text>
        <Pressable style={s.lockedBtn} onPress={() => navigation?.navigate("Organization")}>
          <Text style={s.lockedBtnText}>Open Organization</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.container}>

      {/* Role picker modal */}
      <Modal visible={!!pickerTarget} transparent animationType="fade" onRequestClose={() => setPickerTarget(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPickerTarget(null)}>
          <View style={s.picker}>
            <Text style={s.pickerName}>{pickerTarget?.name}</Text>
            <Text style={s.pickerSub}>Select a role</Text>

            {ROLE_OPTIONS.map((r) => {
              const allowed  = canAssignRole(r.key);
              const currentRole = normalizeOrgRole(
                roles[(pickerTarget?.email || "").toLowerCase()] || pickerTarget?.role,
              );
              const isCurrent = currentRole === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[s.roleOption, isCurrent && s.roleOptionActive, !allowed && s.roleOptionDisabled]}
                  disabled={!allowed}
                  onPress={() => handleSetRole(pickerTarget, r.key)}
                >
                  <Text style={s.roleOptionIcon}>{r.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.roleOptionLabel, { color: allowed ? r.color : "#4B5563" }]}>
                      {r.label}{isCurrent ? "  ✓" : ""}
                    </Text>
                    <Text style={s.roleOptionDesc}>{r.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Remove role option */}
            {normalizeOrgRole(roles[(pickerTarget?.email || "").toLowerCase()] || pickerTarget?.role) &&
              normalizeOrgRole(roles[(pickerTarget?.email || "").toLowerCase()] || pickerTarget?.role) !== "org_owner" && (
              <TouchableOpacity style={s.removeBtn} onPress={() => handleSetRole(pickerTarget, null)}>
                <Text style={s.removeBtnText}>✕  Remove Role</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>{headerTitle}</Text>
        <Text style={s.headerSub}>{headerSub}</Text>
        {viewerRole && (
          <View style={[s.myRoleBadge, { borderColor: ROLE_COLOR[viewerRole] }]}>
            <Text style={[s.myRoleTxt, { color: ROLE_COLOR[viewerRole] }]}>
              {ROLE_ICON[viewerRole]}  You: {ROLE_LABEL[viewerRole]}
            </Text>
          </View>
        )}
        {!!scopeName && (
          <View style={s.scopeCard}>
            <Text style={s.scopeLabel}>{scopeLabel}</Text>
            <Text style={s.scopeValue}>{scopeName}</Text>
          </View>
        )}
      </View>

      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={load}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
        </View>
      )}

      {grantedCount > 0 && (
        <View style={s.summaryRow}>
          <Text style={s.summaryText}>
            {grantedCount} member{grantedCount > 1 ? "s" : ""} with elevated access
          </Text>
        </View>
      )}

      <FlatList
        data={people}
        keyExtractor={(item) => item.id || item.email || item.name}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#8B5CF6" />}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const email     = (item.email || "").toLowerCase();
          const role      = normalizeOrgRole(roles[email] || item.role);
          const isSaving  = saving === email;
          const isOwner   = role === "org_owner";
          const canEdit   = viewerRole === "org_owner"
            ? !isOwner
            : viewerRole === "admin"
              ? role !== "org_owner" && role !== "admin"
              : false;

          return (
            <TouchableOpacity
              style={[s.card, role && s.cardGranted, role === "admin" && s.cardAdmin, isOwner && s.cardOwner]}
              onPress={() => {
                if (!canEdit) {
                  Alert.alert(
                    "Restricted",
                    isOwner
                      ? "The Organization Owner role cannot be changed here."
                      : "Only the Organization Owner can change admin roles. Branch admins can grant Worship Leader only.",
                  );
                  return;
                }
                setPickerTarget(item);
              }}
              disabled={!!saving || !canEdit}
            >
              <View style={[s.avatar, role && { backgroundColor: ROLE_COLOR[role] + "33" }]}>
                <Text style={s.avatarText}>{(item.name || "?")[0].toUpperCase()}</Text>
              </View>
              <View style={s.cardBody}>
                <Text style={s.cardName}>{item.name}</Text>
                <Text style={s.cardEmail}>{item.email || "(no email)"}</Text>
              </View>
              <View style={s.cardRight}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#8B5CF6" />
                ) : role ? (
                  <View style={[s.roleBadge, { backgroundColor: ROLE_COLOR[role] + "22", borderColor: ROLE_COLOR[role] }]}>
                    <Text style={[s.roleBadgeText, { color: ROLE_COLOR[role] }]}>
                      {ROLE_ICON[role]} {ROLE_LABEL[role]}
                    </Text>
                  </View>
                ) : (
                  <View style={s.noBadge}>
                    <Text style={s.noBadgeText}>{canEdit ? "Tap to assign" : "No access"}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={!loading && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>👥</Text>
            <Text style={s.emptyTitle}>No Team Members</Text>
            <Text style={s.emptyText}>Publish your team from a Service Plan to manage leadership roles here.</Text>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },

  overlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "center", alignItems: "center" },
  picker: {
    width: "85%", maxWidth: 420,
    backgroundColor: "#0F172A", borderRadius: 16,
    borderWidth: 1, borderColor: "#374151",
    padding: 20,
  },
  pickerName:  { fontSize: 17, fontWeight: "700", color: "#F9FAFB", marginBottom: 2 },
  pickerSub:   { fontSize: 12, color: "#6B7280", marginBottom: 16 },
  roleOption:  {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    padding: 12, borderRadius: 10, marginBottom: 8,
    backgroundColor: "#1E293B",
  },
  roleOptionActive:   { borderWidth: 1, borderColor: "#8B5CF6" },
  roleOptionDisabled: { opacity: 0.35 },
  roleOptionIcon:     { fontSize: 20, marginTop: 1 },
  roleOptionLabel:    { fontSize: 14, fontWeight: "700" },
  roleOptionDesc:     { fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 15 },
  removeBtn:   { marginTop: 6, padding: 12, borderRadius: 10, backgroundColor: "#1F0A0A", borderWidth: 1, borderColor: "#7F1D1D", alignItems: "center" },
  removeBtnText: { fontSize: 13, color: "#F87171", fontWeight: "700" },

  header: { paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#F9FAFB" },
  headerSub:   { fontSize: 13, color: "#6B7280", marginTop: 2 },
  myRoleBadge: { marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, backgroundColor: "#0F172A" },
  myRoleTxt:   { fontSize: 12, fontWeight: "700" },
  scopeCard: {
    marginTop: 10,
    backgroundColor: "#0F172A",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 12,
  },
  scopeLabel: { fontSize: 11, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 },
  scopeValue: { fontSize: 14, color: "#E2E8F0", fontWeight: "700", marginTop: 4 },

  errorBanner: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    margin: 16, marginTop: 0, padding: 12,
    backgroundColor: "#7C2D1220", borderRadius: 8, borderWidth: 1, borderColor: "#F97316",
  },
  errorText:  { fontSize: 13, color: "#F97316", flex: 1 },
  retryText:  { fontSize: 13, color: "#F97316", fontWeight: "700", marginLeft: 10 },

  summaryRow: { paddingHorizontal: 16, paddingBottom: 8 },
  summaryText: { fontSize: 12, color: "#8B5CF6", fontWeight: "600" },

  list: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    flexDirection: "row", alignItems: "center",
    padding: 14, backgroundColor: "#0B1120",
    borderRadius: 12, borderWidth: 1, borderColor: "#374151", marginBottom: 10,
  },
  cardGranted: { borderColor: "#8B5CF6", backgroundColor: "#1E1B4B" },
  cardAdmin:   { borderColor: "#F59E0B", backgroundColor: "#1C1200" },
  cardOwner:   { borderColor: "#EF4444", backgroundColor: "#1A0505", opacity: 0.8 },

  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#374151", alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: "700", color: "#F9FAFB" },
  cardBody:   { flex: 1 },
  cardName:   { fontSize: 15, fontWeight: "700", color: "#F9FAFB" },
  cardEmail:  { fontSize: 12, color: "#6B7280", marginTop: 2 },
  cardRight:  { minWidth: 120, alignItems: "flex-end" },
  roleBadge:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  roleBadgeText: { fontSize: 12, fontWeight: "700" },
  noBadge:    { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#1F2937", borderRadius: 10 },
  noBadgeText: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },

  empty: { alignItems: "center", paddingVertical: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#F9FAFB", marginBottom: 6 },
  emptyText:  { fontSize: 13, color: "#9CA3AF", textAlign: "center", lineHeight: 20, paddingHorizontal: 30 },

  lockedWrap: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  lockedIcon: { fontSize: 48, marginBottom: 14 },
  lockedTitle: { color: "#F8FAFC", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  lockedText: { color: "#94A3B8", fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 18 },
  lockedBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  lockedBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
});
