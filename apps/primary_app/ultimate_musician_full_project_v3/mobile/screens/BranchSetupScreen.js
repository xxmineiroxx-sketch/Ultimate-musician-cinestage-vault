/**
 * BranchSetupScreen — iPad branch configuration
 * Allows a branch admin to connect their iPad to their specific branch org.
 * Shown from OrganizationScreen → "Change Branch" button.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  SYNC_URL,
  saveBranchConfig,
  clearBranchConfig,
  SYNC_ORG_ID,
} from "./config";

export default function BranchSetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [branchId, setBranchId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(null); // { orgName, city }

  async function handleConnect() {
    const id = branchId.trim();
    const key = secretKey.trim();
    if (!id || !key) {
      Alert.alert("Required", "Enter both Branch ID and Secret Key");
      return;
    }

    setLoading(true);
    setVerified(null);
    try {
      const res = await fetch(`${SYNC_URL}/sync/org/profile`, {
        headers: {
          "Content-Type": "application/json",
          "x-org-id": id,
          "x-secret-key": key,
        },
      });
      if (!res.ok) throw new Error("Invalid credentials");
      const data = await res.json();

      // Preview before saving
      setVerified({
        orgName: data.name,
        city: data.city || "",
        orgId: data.orgId,
      });
    } catch {
      Alert.alert(
        "Connection Failed",
        "Could not connect to that branch. Check the Branch ID and Secret Key and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    await saveBranchConfig(branchId.trim(), secretKey.trim());
    Alert.alert(
      "Branch Connected",
      `This iPad is now connected to "${verified.orgName}"${verified.city ? ` (${verified.city})` : ""}.`,
      [{ text: "OK", onPress: () => navigation.goBack() }],
    );
  }

  async function handleUseDefault() {
    Alert.alert(
      "Reset to Default",
      "This will disconnect from any branch and use the root organization. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await clearBranchConfig();
            Alert.alert("Reset", "Using root organization credentials.", [
              { text: "OK", onPress: () => navigation.goBack() },
            ]);
          },
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#020617" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        {/* Header */}
        <Text style={styles.icon}>🔗</Text>
        <Text style={styles.title}>Connect to Branch</Text>
        <Text style={styles.subtitle}>
          Enter the Branch ID and Secret Key provided by your Organization Owner
          to connect this iPad to your church branch.
        </Text>

        {/* Inputs */}
        <View style={styles.card}>
          <Text style={styles.label}>Branch ID</Text>
          <TextInput
            style={styles.input}
            value={branchId}
            onChangeText={(t) => {
              setBranchId(t);
              setVerified(null);
            }}
            placeholder="e.g. abc123def456mnop"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>Secret Key</Text>
          <TextInput
            style={styles.input}
            value={secretKey}
            onChangeText={(t) => {
              setSecretKey(t);
              setVerified(null);
            }}
            placeholder="32-character secret key"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleConnect}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleConnect}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>🔍 Verify Credentials</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Verification result */}
        {verified && (
          <View style={styles.verifiedCard}>
            <Text style={styles.verifiedTitle}>✅ Branch Found</Text>
            <Text style={styles.verifiedName}>{verified.orgName}</Text>
            {verified.city ? (
              <Text style={styles.verifiedCity}>📍 {verified.city}</Text>
            ) : null}
            <Text style={styles.verifiedId}>ID: {verified.orgId}</Text>

            <TouchableOpacity
              style={[styles.btn, styles.confirmBtn]}
              onPress={handleConfirm}
            >
              <Text style={styles.btnText}>✓ Connect This iPad</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reset to default */}
        <TouchableOpacity style={styles.resetBtn} onPress={handleUseDefault}>
          <Text style={styles.resetBtnText}>Reset to Root Organization</Text>
        </TouchableOpacity>

        {/* Help */}
        <View style={styles.helpBox}>
          <Text style={styles.helpTitle}>ℹ️ Where do I get these?</Text>
          <Text style={styles.helpText}>
            The Organization Owner creates branches in the desktop version of
            Ultimate Musician (Organization → Branches → Add Branch). The Branch
            ID and Secret Key are shown once after creation.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, alignItems: "stretch" },
  icon: { fontSize: 56, textAlign: "center", marginBottom: 12 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#F9FAFB",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 20,
  },

  card: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 20,
    marginBottom: 16,
  },
  label: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1E293B",
    color: "#F9FAFB",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "monospace",
  },
  btn: {
    backgroundColor: "#4F46E5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  confirmBtn: { backgroundColor: "#059669", marginTop: 16 },

  verifiedCard: {
    backgroundColor: "#052e16",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#065f46",
    padding: 20,
    marginBottom: 16,
  },
  verifiedTitle: {
    color: "#34D399",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  verifiedName: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  verifiedCity: { color: "#9CA3AF", fontSize: 14, marginBottom: 4 },
  verifiedId: {
    color: "#4B5563",
    fontSize: 12,
    fontFamily: "monospace",
    marginBottom: 4,
  },

  resetBtn: { alignItems: "center", paddingVertical: 14, marginBottom: 24 },
  resetBtnText: { color: "#6B7280", fontSize: 14 },

  helpBox: {
    backgroundColor: "#1E1B4B",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#3730A3",
  },
  helpTitle: {
    color: "#A5B4FC",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  helpText: { color: "#818CF8", fontSize: 13, lineHeight: 19 },

  backBtn: {
    alignSelf: "flex-start",
    marginBottom: 20,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  backBtnText: { color: "#8B5CF6", fontSize: 16, fontWeight: "600" },
});
