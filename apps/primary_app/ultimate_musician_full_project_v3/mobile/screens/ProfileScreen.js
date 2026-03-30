import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SYNC_URL, syncHeaders } from "./config";

const ROLE_LABELS = {
  owner: "Organization Owner",
  admin: "Admin",
  worship_leader: "Worship Leader",
  musician: "Musician",
  vocalist: "Vocalist",
  tech: "Tech",
};

const ROLE_COLORS = {
  owner: "#EAB308",
  admin: "#F59E0B",
  worship_leader: "#8B5CF6",
  musician: "#3B82F6",
  vocalist: "#10B981",
  tech: "#6B7280",
};

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState({ email: "", name: "", role: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");

  // Change password state
  const [showPwSection, setShowPwSection] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  async function loadUserData() {
    const email = (await AsyncStorage.getItem("@user_email")) || "";
    const name = (await AsyncStorage.getItem("@user_name")) || "";
    const role = (await AsyncStorage.getItem("@user_role")) || "";
    setUser({ email, name: name || email, role });
    setEditName(name);
  }

  async function handleSaveName() {
    const trimmed = editName.trim();
    if (!trimmed) return;
    await AsyncStorage.setItem("@user_name", trimmed);
    setUser((u) => ({ ...u, name: trimmed }));
    setIsEditing(false);
    Alert.alert("Saved", "Display name updated.");
  }

  async function handleChangePassword() {
    if (!newPw || !currentPw) {
      Alert.alert("Error", "Please fill in all password fields.");
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert("Error", "New passwords don't match.");
      return;
    }
    if (newPw.length < 6) {
      Alert.alert("Error", "New password must be at least 6 characters.");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch(`${SYNC_URL}/sync/auth/change-password`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({
          identifier: user.email,
          currentPassword: currentPw,
          newPassword: newPw,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        Alert.alert("Error", data.error || "Could not change password.");
      } else {
        Alert.alert("Success", "Password changed successfully!");
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
        setShowPwSection(false);
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setPwLoading(false);
    }
  }

  function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.multiRemove([
            "@user_logged_in",
            "@user_email",
            "@user_name",
            "@user_role",
            "um_token",
            "um_user_id",
          ]);
          navigation.reset({ index: 0, routes: [{ name: "Landing" }] });
        },
      },
    ]);
  }

  const roleLabel = ROLE_LABELS[user.role] || user.role || "Member";
  const roleColor = ROLE_COLORS[user.role] || "#6B7280";
  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: roleColor + "40" }]}>
          <Text style={[styles.avatarText, { color: roleColor }]}>{initial}</Text>
        </View>

        {isEditing ? (
          <View style={styles.editNameRow}>
            <TextInput
              style={styles.nameInput}
              value={editName}
              onChangeText={setEditName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <TouchableOpacity onPress={handleSaveName} style={styles.saveNameBtn}>
              <Text style={styles.saveNameBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsEditing(false)} style={styles.cancelNameBtn}>
              <Text style={styles.cancelNameBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(true)} activeOpacity={0.8}>
            <Text style={styles.nameText}>{user.name}</Text>
            <Text style={styles.editHint}>Tap to edit name</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.roleBadge, { borderColor: roleColor + "60", backgroundColor: roleColor + "20" }]}>
          <Text style={[styles.roleBadgeText, { color: roleColor }]}>{roleLabel}</Text>
        </View>
      </View>

      {/* ── Account Info ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{user.email || "—"}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Role</Text>
          <Text style={[styles.infoValue, { color: roleColor }]}>{roleLabel}</Text>
        </View>
      </View>

      {/* ── Change Password ── */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setShowPwSection((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.sectionTitle}>🔐 Change Password</Text>
          <Text style={styles.chevron}>{showPwSection ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {showPwSection && (
          <View style={styles.pwForm}>
            <Text style={styles.pwLabel}>Current Password</Text>
            <TextInput
              style={styles.pwInput}
              value={currentPw}
              onChangeText={setCurrentPw}
              secureTextEntry
              placeholder="Enter current password"
              placeholderTextColor="#4B5563"
              autoCapitalize="none"
            />

            <Text style={styles.pwLabel}>New Password</Text>
            <TextInput
              style={styles.pwInput}
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry
              placeholder="At least 6 characters"
              placeholderTextColor="#4B5563"
              autoCapitalize="none"
            />

            <Text style={styles.pwLabel}>Confirm New Password</Text>
            <TextInput
              style={styles.pwInput}
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry
              placeholder="Repeat new password"
              placeholderTextColor="#4B5563"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.pwSaveBtn, pwLoading && styles.pwSaveBtnDisabled]}
              onPress={handleChangePassword}
              disabled={pwLoading}
            >
              {pwLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.pwSaveBtnText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── App Info ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>App Version</Text>
          <Text style={styles.infoValue}>1.0.0</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Platform</Text>
          <Text style={styles.infoValue}>Ultimate Musician</Text>
        </View>
      </View>

      {/* ── Sign Out ── */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },

  /* Header */
  header: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarText: { fontSize: 34, fontWeight: "800" },
  nameText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#F9FAFB",
    textAlign: "center",
    marginBottom: 2,
  },
  editHint: { fontSize: 12, color: "#4B5563", textAlign: "center", marginBottom: 10 },
  editNameRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  nameInput: {
    flex: 1,
    backgroundColor: "#0B1120",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: "#F9FAFB",
  },
  saveNameBtn: {
    backgroundColor: "#8B5CF6",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  saveNameBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  cancelNameBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  cancelNameBtnText: { color: "#6B7280", fontSize: 14 },
  roleBadge: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  roleBadgeText: { fontSize: 13, fontWeight: "600" },

  /* Section */
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#E5E7EB", marginBottom: 12 },
  chevron: { fontSize: 14, color: "#6B7280" },

  /* Info rows */
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: "#0F172A",
  },
  infoLabel: { fontSize: 14, color: "#9CA3AF" },
  infoValue: { fontSize: 14, color: "#F9FAFB", fontWeight: "500", maxWidth: "60%", textAlign: "right" },

  /* Password form */
  pwForm: { paddingBottom: 16 },
  pwLabel: { fontSize: 13, fontWeight: "600", color: "#9CA3AF", marginBottom: 6, marginTop: 12 },
  pwInput: {
    backgroundColor: "#0B1120",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#F9FAFB",
  },
  pwSaveBtn: {
    backgroundColor: "#8B5CF6",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 18,
  },
  pwSaveBtnDisabled: { opacity: 0.6 },
  pwSaveBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },

  /* Logout */
  logoutButton: {
    margin: 20,
    marginTop: 24,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#DC2626",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  logoutButtonText: { fontSize: 15, fontWeight: "600", color: "#EF4444" },
});
