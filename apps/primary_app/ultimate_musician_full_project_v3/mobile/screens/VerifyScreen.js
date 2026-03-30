import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";

export default function VerifyScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const {
    clearPendingVerification,
    pendingVerification,
    ready,
    resendVerification,
    userId,
    verifyCode,
  } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (userId) {
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
      return;
    }
    if (!pendingVerification) {
      navigation.reset({ index: 0, routes: [{ name: "Landing" }] });
    }
  }, [navigation, pendingVerification, ready, userId]);

  const isSignup = pendingVerification?.purpose === "signup";

  const handleVerify = async () => {
    if (code.trim().length < 6) {
      Alert.alert("Enter code", "Please enter the 6-digit verification code.");
      return;
    }

    setLoading(true);
    setNote("");
    try {
      await verifyCode(
        pendingVerification?.identifier,
        code.trim(),
        pendingVerification?.purpose,
      );
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
    } catch (err) {
      Alert.alert("Verification failed", String(err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setNote("");
    try {
      const data = await resendVerification(
        pendingVerification?.identifier,
        pendingVerification?.purpose,
      );
      if (data.alreadyVerified) {
        Alert.alert(
          "Already verified",
          "This account is already verified. Sign in again to continue.",
        );
        navigation.reset({ index: 0, routes: [{ name: "Landing" }] });
        return;
      }
      const email =
        data.pendingVerification?.email || pendingVerification?.email || "";
      setNote(`A fresh code was sent to ${email}.`);
    } catch (err) {
      Alert.alert("Resend failed", String(err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleBack = async () => {
    setLoading(true);
    try {
      await clearPendingVerification();
      navigation.reset({ index: 0, routes: [{ name: "Landing" }] });
    } finally {
      setLoading(false);
    }
  };

  if (!ready || !pendingVerification) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#818CF8" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: Math.max(insets.top + 16, 80) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandBlock}>
          <Text style={styles.badge}>Verification</Text>
          <Text style={styles.title}>
            {isSignup ? "Finish Creating Your Account" : "Finish Signing In"}
          </Text>
          <Text style={styles.subtitle}>
            {isSignup
              ? "Enter the code we emailed you. Once verified, your member profile will sync into Ultimate Musician and Ultimate Playback."
              : "Enter the code we emailed you to finish signing in on this device."}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.identityCard}>
            <Text style={styles.identityLabel}>
              {isSignup ? "Creating account for" : "Signing in as"}
            </Text>
            <Text style={styles.identityValue}>{pendingVerification.email}</Text>
          </View>

          <Text style={styles.label}>6-digit Code</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(value) =>
              setCode(value.replace(/\D+/g, "").slice(0, 6))
            }
            placeholder="123456"
            placeholderTextColor="#4B5563"
            keyboardType="number-pad"
            autoFocus
          />

          {note ? <Text style={styles.note}>{note}</Text> : null}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              (loading || code.trim().length < 6) && styles.buttonDisabled,
            ]}
            onPress={handleVerify}
            disabled={loading || code.trim().length < 6}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Verify & Continue</Text>
            )}
          </TouchableOpacity>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={handleResend}
              disabled={loading}
            >
              <Text style={styles.linkButtonText}>Resend code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleBack}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#020617",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flexGrow: 1,
    backgroundColor: "#020617",
    paddingHorizontal: 24,
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
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#0B1120",
    borderColor: "#1F2937",
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  identityCard: {
    backgroundColor: "#111827",
    borderColor: "#1F2937",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
    padding: 14,
  },
  identityLabel: {
    color: "#A5B4FC",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  identityValue: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "700",
  },
  label: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#020617",
    borderColor: "#1F2937",
    borderRadius: 12,
    borderWidth: 1,
    color: "#F9FAFB",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 6,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    textAlign: "center",
  },
  note: {
    backgroundColor: "rgba(79, 70, 229, 0.18)",
    borderRadius: 12,
    color: "#C7D2FE",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#4F46E5",
    borderRadius: 12,
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  linkButton: {
    alignItems: "center",
    borderColor: "#1F2937",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 13,
  },
  linkButtonText: {
    color: "#818CF8",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#1F2937",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "700",
  },
});
