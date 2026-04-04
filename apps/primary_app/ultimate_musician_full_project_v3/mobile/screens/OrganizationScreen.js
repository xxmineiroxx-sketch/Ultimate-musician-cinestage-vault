import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Modal, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import BranchManagerScreen from "./BranchManagerScreen";
import {
  SYNC_URL, syncHeaders, SYNC_ORG_ID, hasBranchConfig, getActiveOrgId,
} from "./config";

const PIN_KEY = "org.owner.pin";

function normalizeOrgRole(role) {
  if (role === "owner" || role === "org_owner") return "org_owner";
  return role || null;
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export default function OrganizationScreen({ navigation }) {
  const isWeb    = Platform.OS === "web";
  const insets   = useSafeAreaInsets();

  const [loading, setLoading]     = useState(true);
  const [saving,  setSaving]      = useState(false);

  // Org data
  const [orgName,   setOrgName]   = useState("");
  const [editName,  setEditName]  = useState("");
  const [orgId,     setOrgId]     = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [members,   setMembers]   = useState([]);

  // Role / owner
  const [viewerRole,  setViewerRole]  = useState(null);  // own grant role
  const [viewerName,  setViewerName]  = useState("");    // own display name
  const [ownerName,   setOwnerName]   = useState("");    // org_owner's name
  const [branchLabel, setBranchLabel] = useState("");    // branch name if applicable

  // Org-name lock (org_owner only)
  const [nameLocked,       setNameLocked]       = useState(true);
  const [showUnlockModal,  setShowUnlockModal]  = useState(false);
  const [showSetPinModal,  setShowSetPinModal]  = useState(false);
  const [pinInput,         setPinInput]         = useState("");
  const [pinConfirm,       setPinConfirm]       = useState("");
  const [storedPin,        setStoredPin]        = useState(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settingsRaw = await AsyncStorage.getItem("settings.v1").catch(() => null);
      const settings    = settingsRaw ? JSON.parse(settingsRaw) : {};
      const myEmail     = (settings.email || "").toLowerCase();

      const pin = await AsyncStorage.getItem(PIN_KEY).catch(() => null);
      setStoredPin(pin);

      const [profile, library, rolesMap, roleInfo] = await Promise.all([
        fetchJson(`${SYNC_URL}/sync/org/profile`,  { headers: syncHeaders() }),
        fetchJson(`${SYNC_URL}/sync/library-pull`, { headers: syncHeaders() }),
        fetchJson(`${SYNC_URL}/sync/roles`,        { headers: syncHeaders() }),
        myEmail
          ? fetchJson(`${SYNC_URL}/sync/role?email=${encodeURIComponent(myEmail)}`, { headers: syncHeaders() })
          : Promise.resolve({ role: null }),
      ]);

      const name = profile.name || "";
      setOrgName(name);
      setEditName(name);
      setOrgId(profile.orgId || SYNC_ORG_ID || "");
      setCreatedAt(profile.createdAt || "");

      const people = library.people || [];
      setMembers(people);

      const normalizedRoles = {};
      Object.entries(rolesMap || {}).forEach(([email, role]) => {
        normalizedRoles[email.toLowerCase()] = normalizeOrgRole(role);
      });

      // Viewer's own role
      const myRole = normalizeOrgRole(roleInfo?.role || normalizedRoles[myEmail] || null);
      setViewerRole(myRole);

      // Viewer's own display name
      const mePerson = people.find((p) => (p.email || "").toLowerCase() === myEmail);
      const meName = mePerson
        ? [mePerson.name, mePerson.lastName].filter(Boolean).join(" ")
        : settings.name || "";
      setViewerName(meName);

      // Find org_owner for display
      const ownerPerson =
        people.find((p) => normalizeOrgRole(normalizedRoles[(p.email || "").toLowerCase()] || p.role) === "org_owner")
        || null;
      if (ownerPerson) {
        setOwnerName([ownerPerson.name, ownerPerson.lastName].filter(Boolean).join(" "));
      } else if (profile.adminName) {
        setOwnerName(profile.adminName);
      } else {
        setOwnerName("");
      }

      // Branch label
      if (hasBranchConfig && hasBranchConfig()) {
        const bid = getActiveOrgId ? getActiveOrgId() : "";
        setBranchLabel(bid ? `Branch ${bid.slice(0, 8)}…` : "Branch");
      } else {
        setBranchLabel("Main");
      }
    } catch {
      Alert.alert("Error", "Could not load organization data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!isWeb) load(); }, [load, isWeb]);

  if (isWeb) return <BranchManagerScreen navigation={navigation} />;

  // ── Save org name (only after unlock) ─────────────────────────────────────
  async function saveName() {
    const trimmed = editName.trim();
    if (!trimmed) { Alert.alert("Name required"); return; }
    setSaving(true);
    try {
      await fetch(`${SYNC_URL}/sync/org/profile`, {
        method: "PUT",
        headers: syncHeaders(),
        body: JSON.stringify({ name: trimmed }),
      });
      setOrgName(trimmed);
      setNameLocked(true);
      Alert.alert("Saved", `Organization name updated to "${trimmed}"`);
    } catch {
      Alert.alert("Error", "Could not save. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  // ── PIN unlock flow ────────────────────────────────────────────────────────
  function handleEditPress() {
    if (!storedPin) {
      // First time — ask to set a PIN
      setPinInput(""); setPinConfirm("");
      setShowSetPinModal(true);
    } else {
      setPinInput("");
      setShowUnlockModal(true);
    }
  }

  async function handleSetPin() {
    if (pinInput.length < 4) {
      Alert.alert("Too short", "PIN must be at least 4 characters."); return;
    }
    if (pinInput !== pinConfirm) {
      Alert.alert("Mismatch", "PINs do not match."); return;
    }
    await AsyncStorage.setItem(PIN_KEY, pinInput);
    setStoredPin(pinInput);
    setShowSetPinModal(false);
    setNameLocked(false); // unlocked after setting PIN
  }

  function handleUnlock() {
    if (pinInput === storedPin) {
      setShowUnlockModal(false);
      setNameLocked(false);
    } else {
      Alert.alert("Wrong PIN", "Incorrect PIN. Try again.");
      setPinInput("");
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const since = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  const ROLE_LABEL = {
    worship_leader: "Worship Leader", md: "Music Director",
    admin: "Admin", org_owner: "Org Owner",
  };
  const ROLE_COLOR = {
    worship_leader: "#10B981", md: "#8B5CF6",
    admin: "#F59E0B", org_owner: "#EF4444",
  };
  const ROLE_ICON = { worship_leader: "🎵", md: "🎛", admin: "👑", org_owner: "🏛" };

  const isOwner = viewerRole === "org_owner";
  const canManagePermissions = viewerRole === "org_owner" || viewerRole === "admin";
  const permissionsTitle = isOwner ? "Organization Leadership Permissions" : "Branch Leadership Permissions";
  const permissionsSubtitle = isOwner
    ? "Grant organization admins and worship leaders. Branch pastors/admins manage worship leaders inside their branch."
    : "Branch admins can safely grant Worship Leader access for this branch only.";

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#4F46E5" size="large" />
        <Text style={s.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}>

      {/* ── Set PIN modal ── */}
      <Modal visible={showSetPinModal} transparent animationType="fade" onRequestClose={() => setShowSetPinModal(false)}>
        <View style={s.overlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Set Protection PIN</Text>
            <Text style={s.modalSub}>Create a PIN to protect the organization name from accidental changes.</Text>
            <TextInput
              style={s.pinInput} placeholder="New PIN (min 4 chars)"
              placeholderTextColor="#4B5563" secureTextEntry value={pinInput}
              onChangeText={setPinInput}
            />
            <TextInput
              style={s.pinInput} placeholder="Confirm PIN"
              placeholderTextColor="#4B5563" secureTextEntry value={pinConfirm}
              onChangeText={setPinConfirm}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnSecondary} onPress={() => setShowSetPinModal(false)}>
                <Text style={s.modalBtnSecondaryTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnPrimary} onPress={handleSetPin}>
                <Text style={s.modalBtnPrimaryTxt}>Set PIN & Unlock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Unlock modal ── */}
      <Modal visible={showUnlockModal} transparent animationType="fade" onRequestClose={() => setShowUnlockModal(false)}>
        <View style={s.overlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>🔒 Enter PIN</Text>
            <Text style={s.modalSub}>Enter your PIN to edit the organization name.</Text>
            <TextInput
              style={s.pinInput} placeholder="Your PIN"
              placeholderTextColor="#4B5563" secureTextEntry value={pinInput}
              onChangeText={setPinInput} onSubmitEditing={handleUnlock}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnSecondary} onPress={() => setShowUnlockModal(false)}>
                <Text style={s.modalBtnSecondaryTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnPrimary} onPress={handleUnlock}>
                <Text style={s.modalBtnPrimaryTxt}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Org header ── */}
      <View style={s.headerRow}>
        <Text style={s.headerIcon}>🏛</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{orgName || "Your Organization"}</Text>
          {since ? <Text style={s.headerSub}>Active since {since}</Text> : null}
          {viewerRole && (
            <View style={[s.myRoleBadge, { borderColor: ROLE_COLOR[viewerRole] }]}>
              <Text style={[s.myRoleTxt, { color: ROLE_COLOR[viewerRole] }]}>
                {ROLE_ICON[viewerRole]}  {ROLE_LABEL[viewerRole]}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── ORG OWNER SECTION ─────────────────────────────────────────────── */}
      {isOwner && (
        <>
          {/* Manage Branches */}
          <TouchableOpacity style={s.manageBranchesBtn} onPress={() => navigation?.navigate("BranchManager")}>
            <View style={s.manageBranchesBtnLeft}>
              <Text style={s.manageBranchesBtnIcon}>🏛</Text>
              <View>
                <Text style={s.manageBranchesBtnTitle}>Manage Church Branches</Text>
                <Text style={s.manageBranchesBtnSub}>Create branches, assign Pastors & Admins</Text>
              </View>
            </View>
            <Text style={s.manageBranchesBtnArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.changeBranchBtn} onPress={() => navigation?.navigate("BranchSetup")}>
            <Text style={s.changeBranchBtnText}>🔗 Change Branch Connection</Text>
          </TouchableOpacity>

          {canManagePermissions && (
            <TouchableOpacity style={s.permissionsBtn} onPress={() => navigation?.navigate("Permissions")}>
              <View style={s.permissionsBtnLeft}>
                <Text style={s.permissionsBtnIcon}>🔐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.permissionsBtnTitle}>{permissionsTitle}</Text>
                  <Text style={s.permissionsBtnSub}>{permissionsSubtitle}</Text>
                </View>
              </View>
              <Text style={s.permissionsBtnArrow}>›</Text>
            </TouchableOpacity>
          )}

          {/* Org Name — locked by default */}
          <View style={s.card}>
            <View style={s.cardLabelRow}>
              <Text style={s.cardLabel}>Organization Name</Text>
              <Text style={s.lockIcon}>{nameLocked ? "🔒" : "🔓"}</Text>
            </View>

            {nameLocked ? (
              <>
                <View style={s.lockedNameRow}>
                  <Text style={s.lockedNameText}>{orgName}</Text>
                </View>
                <TouchableOpacity style={s.unlockBtn} onPress={handleEditPress}>
                  <Text style={s.unlockBtnText}>🔓 Edit Name</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TextInput
                  style={s.input} value={editName} onChangeText={setEditName}
                  placeholder="e.g. Grace Community Church" placeholderTextColor="#4B5563"
                  returnKeyType="done" onSubmitEditing={saveName}
                />
                <View style={s.nameActionRow}>
                  <TouchableOpacity style={s.cancelEditBtn} onPress={() => { setEditName(orgName); setNameLocked(true); }}>
                    <Text style={s.cancelEditTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.saveBtn, saving && s.saveBtnDisabled]}
                    onPress={saveName} disabled={saving}
                  >
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>💾 Save</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {/* Org ID */}
          <View style={s.card}>
            <Text style={s.cardLabel}>Organization ID</Text>
            <Text style={s.orgIdText} selectable>{orgId}</Text>
            <Text style={s.orgIdNote}>Share this ID with admins to configure their devices.</Text>
          </View>

          {/* Members */}
          <View style={s.card}>
            <Text style={s.cardLabel}>Team Members ({members.length})</Text>
            {members.length === 0 ? (
              <Text style={s.emptyText}>No members yet. Publish a service plan to sync your team.</Text>
            ) : (
              members.map((p, i) => (
                <View key={p.id || i} style={s.memberRow}>
                  <View style={s.memberAvatar}>
                    <Text style={s.memberAvatarText}>{(p.name || "?").charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>{[p.name, p.lastName].filter(Boolean).join(" ") || "Unknown"}</Text>
                    {p.email ? <Text style={s.memberEmail}>{p.email}</Text> : null}
                  </View>
                  {(p.roles || [p.role]).filter(Boolean).slice(0, 2).map((r, ri) => (
                    <View key={ri} style={s.roleChip}><Text style={s.roleChipText}>{r}</Text></View>
                  ))}
                </View>
              ))
            )}
          </View>
        </>
      )}

      {/* ── ADMIN / BRANCH VIEW ───────────────────────────────────────────── */}
      {!isOwner && (
        <>
          {/* Info cards */}
          <View style={s.infoGrid}>
            <View style={s.infoCard}>
              <Text style={s.infoCardIcon}>🏛</Text>
              <Text style={s.infoCardLabel}>Organization</Text>
              <Text style={s.infoCardValue}>{orgName || "—"}</Text>
            </View>

            {ownerName ? (
              <View style={s.infoCard}>
                <Text style={s.infoCardIcon}>👤</Text>
                <Text style={s.infoCardLabel}>Organization Owner</Text>
                <Text style={s.infoCardValue}>{ownerName}</Text>
              </View>
            ) : null}

            <View style={s.infoCard}>
              <Text style={s.infoCardIcon}>🔗</Text>
              <Text style={s.infoCardLabel}>Your Branch</Text>
              <Text style={s.infoCardValue}>{branchLabel || "Main"}</Text>
            </View>

            {viewerName ? (
              <View style={s.infoCard}>
                <Text style={s.infoCardIcon}>{ROLE_ICON[viewerRole] || "👤"}</Text>
                <Text style={s.infoCardLabel}>Your Role</Text>
                <Text style={[s.infoCardValue, { color: ROLE_COLOR[viewerRole] || "#F9FAFB" }]}>
                  {viewerName}{"\n"}
                  <Text style={[s.infoCardRoleSub, { color: ROLE_COLOR[viewerRole] || "#9CA3AF" }]}>
                    {ROLE_LABEL[viewerRole] || "Member"}
                  </Text>
                </Text>
              </View>
            ) : null}
          </View>

          {/* Org ID (read-only) */}
          <View style={s.card}>
            <Text style={s.cardLabel}>Organization ID</Text>
            <Text style={s.orgIdText} selectable>{orgId}</Text>
            <Text style={s.orgIdNote}>Use this ID to connect other devices to this organization.</Text>
          </View>

          {/* Branch connection */}
          <TouchableOpacity style={s.changeBranchBtn} onPress={() => navigation?.navigate("BranchSetup")}>
            <Text style={s.changeBranchBtnText}>🔗 Change Branch Connection</Text>
          </TouchableOpacity>

          {canManagePermissions && (
            <TouchableOpacity style={s.permissionsBtn} onPress={() => navigation?.navigate("Permissions")}>
              <View style={s.permissionsBtnLeft}>
                <Text style={s.permissionsBtnIcon}>🔐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.permissionsBtnTitle}>{permissionsTitle}</Text>
                  <Text style={s.permissionsBtnSub}>{permissionsSubtitle}</Text>
                </View>
              </View>
              <Text style={s.permissionsBtnArrow}>›</Text>
            </TouchableOpacity>
          )}
        </>
      )}

    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  content:   { padding: 20 },
  center:    { flex: 1, backgroundColor: "#020617", alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#6B7280", marginTop: 12, fontSize: 14 },

  // ── Modal ──
  overlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "center", alignItems: "center" },
  modalBox: {
    width: "85%", maxWidth: 400,
    backgroundColor: "#0F172A", borderRadius: 16,
    borderWidth: 1, borderColor: "#374151", padding: 24,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#F9FAFB", marginBottom: 6 },
  modalSub:   { fontSize: 13, color: "#9CA3AF", marginBottom: 18, lineHeight: 19 },
  pinInput: {
    backgroundColor: "#1E293B", color: "#F9FAFB",
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: "#374151",
  },
  modalBtns:          { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtnPrimary:    { flex: 1, backgroundColor: "#4F46E5", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  modalBtnPrimaryTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  modalBtnSecondary:    { flex: 1, backgroundColor: "#1E293B", borderRadius: 8, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#374151" },
  modalBtnSecondaryTxt: { color: "#9CA3AF", fontWeight: "600", fontSize: 14 },

  // ── Header ──
  headerRow:  { flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 12 },
  headerIcon: { fontSize: 40 },
  headerTitle: { color: "#F9FAFB", fontSize: 22, fontWeight: "700" },
  headerSub:   { color: "#6B7280", fontSize: 13, marginTop: 2 },
  myRoleBadge: {
    marginTop: 6, alignSelf: "flex-start",
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, backgroundColor: "#0F172A",
  },
  myRoleTxt: { fontSize: 12, fontWeight: "700" },

  // ── Buttons ──
  manageBranchesBtn: {
    backgroundColor: "#1E1B4B", borderRadius: 12,
    borderWidth: 1, borderColor: "#4F46E5",
    padding: 16, marginBottom: 12,
    flexDirection: "row", alignItems: "center",
  },
  manageBranchesBtnLeft:  { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  manageBranchesBtnIcon:  { fontSize: 28 },
  manageBranchesBtnTitle: { color: "#E0E7FF", fontSize: 15, fontWeight: "700" },
  manageBranchesBtnSub:   { color: "#818CF8", fontSize: 12, marginTop: 2 },
  manageBranchesBtnArrow: { color: "#4F46E5", fontSize: 28, fontWeight: "300" },
  permissionsBtn: {
    backgroundColor: "#131A2F", borderRadius: 12,
    borderWidth: 1, borderColor: "#334155",
    padding: 16, marginBottom: 12,
    flexDirection: "row", alignItems: "center",
  },
  permissionsBtnLeft:  { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  permissionsBtnIcon:  { fontSize: 28 },
  permissionsBtnTitle: { color: "#E2E8F0", fontSize: 15, fontWeight: "700" },
  permissionsBtnSub:   { color: "#94A3B8", fontSize: 12, marginTop: 2, lineHeight: 16 },
  permissionsBtnArrow: { color: "#64748B", fontSize: 28, fontWeight: "300" },
  changeBranchBtn: {
    backgroundColor: "#1E293B", borderRadius: 8,
    paddingVertical: 12, alignItems: "center",
    marginBottom: 16, borderWidth: 1, borderColor: "#374151",
  },
  changeBranchBtnText: { color: "#818CF8", fontSize: 14, fontWeight: "600" },

  // ── Card ──
  card: {
    backgroundColor: "#0F172A", borderRadius: 12,
    borderWidth: 1, borderColor: "#1E293B",
    padding: 16, marginBottom: 16,
  },
  cardLabel: {
    color: "#9CA3AF", fontSize: 12, fontWeight: "600",
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
  },
  cardLabelRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  lockIcon:       { fontSize: 16 },

  // Org name lock
  lockedNameRow:  { backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  lockedNameText: { color: "#9CA3AF", fontSize: 16 },
  unlockBtn:      { backgroundColor: "#1E293B", borderRadius: 8, paddingVertical: 11, alignItems: "center", borderWidth: 1, borderColor: "#374151" },
  unlockBtnText:  { color: "#818CF8", fontSize: 14, fontWeight: "600" },

  input: {
    backgroundColor: "#1E293B", color: "#F9FAFB",
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 16, marginBottom: 12,
  },
  nameActionRow:   { flexDirection: "row", gap: 10 },
  cancelEditBtn:   { flex: 1, backgroundColor: "#1E293B", borderRadius: 8, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#374151" },
  cancelEditTxt:   { color: "#9CA3AF", fontSize: 14, fontWeight: "600" },
  saveBtn:         { flex: 2, backgroundColor: "#4F46E5", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { color: "#fff", fontSize: 15, fontWeight: "600" },

  orgIdText: { color: "#818CF8", fontFamily: "monospace", fontSize: 14, letterSpacing: 0.5, marginBottom: 6 },
  orgIdNote: { color: "#4B5563", fontSize: 12 },

  // ── Members ──
  emptyText: { color: "#4B5563", fontSize: 14, textAlign: "center", paddingVertical: 12 },
  memberRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#1E293B", gap: 10,
  },
  memberAvatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1E1B4B", alignItems: "center", justifyContent: "center" },
  memberAvatarText: { color: "#818CF8", fontWeight: "700", fontSize: 16 },
  memberName:       { color: "#F9FAFB", fontSize: 14, fontWeight: "600" },
  memberEmail:      { color: "#6B7280", fontSize: 12 },
  roleChip:         { backgroundColor: "#1E293B", borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  roleChipText:     { color: "#9CA3AF", fontSize: 11, fontWeight: "500" },

  // ── Admin info grid ──
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  infoCard: {
    flex: 1, minWidth: "45%",
    backgroundColor: "#0F172A", borderRadius: 12,
    borderWidth: 1, borderColor: "#1E293B",
    padding: 16,
  },
  infoCardIcon:    { fontSize: 24, marginBottom: 8 },
  infoCardLabel:   { color: "#6B7280", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  infoCardValue:   { color: "#F9FAFB", fontSize: 15, fontWeight: "700" },
  infoCardRoleSub: { fontSize: 12, fontWeight: "600" },
});
