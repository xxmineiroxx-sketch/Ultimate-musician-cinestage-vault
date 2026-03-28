import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { loadBranchConfig, SYNC_URL, getActiveOrgId, getActiveSecretKey } from "./config";
import { useAuth } from "../context/AuthContext";

async function registerExpoPushToken() {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || '94e824e3-8029-4138-b5d1-67b82b89b2db';
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!tokenData?.data) return;
    const orgId = getActiveOrgId();
    const secretKey = getActiveSecretKey();
    await fetch(`${SYNC_URL}/sync/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-org-id': orgId, 'x-secret-key': secretKey },
      body: JSON.stringify({
        token: tokenData.data,
        platform: Platform.OS,
        preferences: { assignments: true, messages: true, reminders: true },
      }),
    });
  } catch {
    // Push registration is best-effort — never block login
  }
}

export default function LandingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { login, continueAsGuest, pendingVerification, userId, ready } =
    useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Load branch credentials from AsyncStorage on first mount
  useEffect(() => {
    loadBranchConfig();
  }, []);

  // Restore any pending verification step before sending the user into the app.
  useEffect(() => {
    if (!ready) return;

    if (pendingVerification) {
      navigation.reset({ index: 0, routes: [{ name: "Verify" }] });
      return;
    }

    if (userId) {
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
    }
  }, [navigation, pendingVerification, ready, userId]);

  const handleSignIn = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert("Missing info", "Email/phone and password are required.");
      return;
    }
    setLoading(true);
    try {
      const data = await login(identifier.trim(), password);
      if (!data.needsVerification) {
        registerExpoPushToken(); // fire-and-forget, best-effort
      }
      navigation.reset({
        index: 0,
        routes: [{ name: data.needsVerification ? "Verify" : "Home" }],
      });
    } catch (err) {
      Alert.alert("Sign In Failed", String(err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    try {
      await continueAsGuest();
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#818CF8" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: Math.max(insets.top + 16, 80) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <View style={styles.brandBlock}>
          <Text style={styles.badge}>CineStage™</Text>
          <Text style={styles.title}>Ultimate Musician</Text>
          <Text style={styles.subtitle}>
            Plan. Rehearse. Perform. All in one place.
          </Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>
          <Text style={styles.cardCopy}>
            Sign in with the email or phone on your organization profile. New
            devices may require an email verification code.
          </Text>

          <Text style={styles.label}>Email or Phone Number</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="email@example.com or +1 555 000 0000"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#4B5563"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.signInBtn, loading && { opacity: 0.6 }]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.signInBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => navigation.navigate("Register")}
          >
            <Text style={styles.registerLinkText}>Create an account</Text>
          </TouchableOpacity>
        </View>

        {/* Guest */}
        <TouchableOpacity
          style={[styles.guestBtn, loading && { opacity: 0.6 }]}
          onPress={handleGuest}
          disabled={loading}
        >
          <Text style={styles.guestBtnText}>Continue as Guest</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Guest mode saves locally on this device only.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flexGrow: 1,
    backgroundColor: "#020617",
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
    justifyContent: "center",
  },
  brandBlock: {
    alignItems: "center",
    marginBottom: 40,
  },
  badge: {
    color: "#818CF8",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  title: {
    color: "#F9FAFB",
    fontSize: 32,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#0B1120",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    color: "#E5E7EB",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  cardCopy: {
    color: "#6B7280",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
  },
  label: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#020617",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#F9FAFB",
    fontSize: 15,
    marginBottom: 16,
  },
  signInBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  signInBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
  registerLink: {
    marginTop: 14,
    alignItems: "center",
  },
  registerLinkText: {
    color: "#818CF8",
    fontSize: 14,
    fontWeight: "600",
  },
  guestBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  guestBtnText: {
    color: "#9CA3AF",
    fontWeight: "700",
    fontSize: 15,
  },
  footerNote: {
    color: "#374151",
    fontSize: 12,
    textAlign: "center",
  },
});
