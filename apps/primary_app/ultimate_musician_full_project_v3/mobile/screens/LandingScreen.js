import * as AppleAuthentication from "expo-apple-authentication";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  loadBranchConfig,
  SYNC_URL,
  getActiveOrgId,
  getActiveSecretKey,
} from "./config";
import { useAuth } from "../context/AuthContext";
import { sendLoginNotification } from "../services/loginNotification";

async function registerExpoPushToken() {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      "94e824e3-8029-4138-b5d1-67b82b89b2db";
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!tokenData?.data) return;
    const orgId = getActiveOrgId();
    const secretKey = getActiveSecretKey();
    await fetch(`${SYNC_URL}/sync/push/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-org-id": orgId,
        "x-secret-key": secretKey,
      },
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
  const {
    login,
    loginWithApple,
    pendingVerification,
    userId,
    ready,
    resetRequestCode,
    resetVerify,
    resetPassword,
    verifyTwoFa,
  } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAppleLoginAvailable, setIsAppleLoginAvailable] = useState(false);

  // ── Password Reset modal state ──────────────────────────────────────────────
  const [resetVisible, setResetVisible] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1=email, 2=code, 3=new password
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetNewPw, setResetNewPw] = useState("");
  const [resetConfirmPw, setResetConfirmPw] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // ── 2FA modal state ─────────────────────────────────────────────────────────
  const [twoFaVisible, setTwoFaVisible] = useState(false);
  const [twoFaTempToken, setTwoFaTempToken] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  // Keep a ref to the identifier used during login for session persistence
  const twoFaIdentifierRef = useRef("");

  function openResetModal() {
    setResetStep(1);
    setResetEmail(identifier.trim() || "");
    setResetCode("");
    setResetToken("");
    setResetNewPw("");
    setResetConfirmPw("");
    setResetSuccess(false);
    setResetVisible(true);
  }

  async function handleResetSendCode() {
    if (!resetEmail.trim()) {
      Alert.alert("Email required", "Enter your email address.");
      return;
    }
    setResetLoading(true);
    try {
      await resetRequestCode(resetEmail.trim());
      setResetStep(2);
    } catch (err) {
      Alert.alert("Error", String(err.message || err));
    } finally {
      setResetLoading(false);
    }
  }

  async function handleResetVerifyCode() {
    if (resetCode.length !== 6) {
      Alert.alert("Invalid code", "Enter the 6-digit code.");
      return;
    }
    setResetLoading(true);
    try {
      const data = await resetVerify(resetEmail.trim(), resetCode.trim());
      setResetToken(data.resetToken);
      setResetStep(3);
    } catch (err) {
      Alert.alert("Error", String(err.message || err));
    } finally {
      setResetLoading(false);
    }
  }

  async function handleResetSetPassword() {
    if (resetNewPw.length < 8) {
      Alert.alert("Too short", "Password must be at least 8 characters.");
      return;
    }
    if (resetNewPw !== resetConfirmPw) {
      Alert.alert("Mismatch", "Passwords do not match.");
      return;
    }
    setResetLoading(true);
    try {
      await resetPassword(resetToken, resetNewPw);
      setResetSuccess(true);
    } catch (err) {
      Alert.alert("Error", String(err.message || err));
    } finally {
      setResetLoading(false);
    }
  }

  async function handleTwoFaVerify() {
    if (twoFaCode.length !== 6) {
      Alert.alert("Invalid code", "Enter the 6-digit code.");
      return;
    }
    setTwoFaLoading(true);
    try {
      await verifyTwoFa(twoFaTempToken, twoFaCode.trim(), twoFaIdentifierRef.current);
      sendLoginNotification(twoFaIdentifierRef.current);
      setTwoFaVisible(false);
      setTwoFaCode("");
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
    } catch (err) {
      Alert.alert("2FA Failed", String(err.message || err));
    } finally {
      setTwoFaLoading(false);
    }
  }

  // Load branch credentials from AsyncStorage on first mount
  useEffect(() => {
    loadBranchConfig();
    AppleAuthentication.isAvailableAsync().then(setIsAppleLoginAvailable);
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

      // Admin 2FA gate
      if (data.needsTwoFa) {
        twoFaIdentifierRef.current = identifier.trim();
        setTwoFaTempToken(data.tempToken);
        setTwoFaCode("");
        setTwoFaVisible(true);
        return;
      }

      if (!data.needsVerification) {
        registerExpoPushToken(); // fire-and-forget, best-effort
        sendLoginNotification(identifier.trim());
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

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      // Try to log in to our backend using the Apple identityToken
      const data = await loginWithApple(credential.identityToken, {
        email: credential.email,
        fullName: credential.fullName
          ? `${credential.fullName.givenName || ""} ${credential.fullName.familyName || ""}`.trim()
          : undefined,
      });

      if (data.needsVerification) {
        navigation.reset({
          index: 0,
          routes: [{ name: "Verify" }],
        });
      } else {
        registerExpoPushToken();
        sendLoginNotification(credential.email || data?.email || '');
        navigation.reset({
          index: 0,
          routes: [{ name: "Home" }],
        });
      }
    } catch (e) {
      if (e.code === "ERR_REQUEST_CANCELED") {
        // User canceled
      } else {
        Alert.alert("Sign In Failed", String(e.message || e));
      }
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
            style={styles.forgotLink}
            onPress={openResetModal}
          >
            <Text style={styles.forgotLinkText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => navigation.navigate("Register")}
          >
            <Text style={styles.registerLinkText}>Create an account</Text>
          </TouchableOpacity>
        </View>

        {/* ── Password Reset Modal ──────────────────────────────── */}
        <Modal
          visible={resetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setResetVisible(false)}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Reset Password</Text>

                {resetSuccess ? (
                  <>
                    <Text style={styles.modalSuccessText}>
                      Password updated successfully. You can now sign in.
                    </Text>
                    <TouchableOpacity
                      style={styles.modalPrimaryBtn}
                      onPress={() => setResetVisible(false)}
                    >
                      <Text style={styles.modalPrimaryBtnText}>Done</Text>
                    </TouchableOpacity>
                  </>
                ) : resetStep === 1 ? (
                  <>
                    <Text style={styles.modalSubtitle}>
                      Enter your account email and we will send a verification code.
                    </Text>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      style={styles.input}
                      value={resetEmail}
                      onChangeText={setResetEmail}
                      placeholder="email@example.com"
                      placeholderTextColor="#4B5563"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={[styles.modalPrimaryBtn, resetLoading && { opacity: 0.6 }]}
                      onPress={handleResetSendCode}
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.modalPrimaryBtnText}>Send Code</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : resetStep === 2 ? (
                  <>
                    <Text style={styles.modalSubtitle}>
                      A 6-digit code was sent to {resetEmail}. Enter it below.
                    </Text>
                    <Text style={styles.label}>6-Digit Code</Text>
                    <TextInput
                      style={[styles.input, styles.codeInput]}
                      value={resetCode}
                      onChangeText={(v) => setResetCode(v.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      placeholderTextColor="#4B5563"
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                    <TouchableOpacity
                      style={[styles.modalPrimaryBtn, resetLoading && { opacity: 0.6 }]}
                      onPress={handleResetVerifyCode}
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.modalPrimaryBtnText}>Verify Code</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalSecondaryBtn}
                      onPress={() => setResetStep(1)}
                    >
                      <Text style={styles.modalSecondaryBtnText}>Back</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.modalSubtitle}>
                      Choose a new password (minimum 8 characters).
                    </Text>
                    <Text style={styles.label}>New Password</Text>
                    <TextInput
                      style={styles.input}
                      value={resetNewPw}
                      onChangeText={setResetNewPw}
                      placeholder="••••••••"
                      placeholderTextColor="#4B5563"
                      secureTextEntry
                    />
                    <Text style={styles.label}>Confirm Password</Text>
                    <TextInput
                      style={styles.input}
                      value={resetConfirmPw}
                      onChangeText={setResetConfirmPw}
                      placeholder="••••••••"
                      placeholderTextColor="#4B5563"
                      secureTextEntry
                    />
                    <TouchableOpacity
                      style={[styles.modalPrimaryBtn, resetLoading && { opacity: 0.6 }]}
                      onPress={handleResetSetPassword}
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.modalPrimaryBtnText}>Reset Password</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalSecondaryBtn}
                      onPress={() => setResetStep(2)}
                    >
                      <Text style={styles.modalSecondaryBtnText}>Back</Text>
                    </TouchableOpacity>
                  </>
                )}

                {!resetSuccess && (
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setResetVisible(false)}
                  >
                    <Text style={styles.modalCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── 2FA Verification Modal ───────────────────────────── */}
        <Modal
          visible={twoFaVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {}}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Two-Factor Auth</Text>
                <Text style={styles.modalSubtitle}>
                  Your account requires 2FA. Enter the 6-digit code sent to your device.
                </Text>
                <Text style={styles.label}>Authentication Code</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={twoFaCode}
                  onChangeText={(v) => setTwoFaCode(v.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor="#4B5563"
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <TouchableOpacity
                  style={[styles.modalPrimaryBtn, twoFaLoading && { opacity: 0.6 }]}
                  onPress={handleTwoFaVerify}
                  disabled={twoFaLoading}
                >
                  {twoFaLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalPrimaryBtnText}>Verify</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setTwoFaVisible(false);
                    setTwoFaCode("");
                  }}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {isAppleLoginAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            buttonStyle={
              AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={12}
            style={styles.appleBtn}
            onPress={handleAppleSignIn}
          />
        )}
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
  forgotLink: {
    marginTop: 10,
    alignItems: "center",
  },
  forgotLinkText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
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
  appleBtn: {
    width: "100%",
    height: 50,
    marginBottom: 12,
  },

  // ── Modal shared styles ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#0B1120",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 24,
  },
  modalTitle: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },
  modalSubtitle: {
    color: "#6B7280",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
  },
  modalSuccessText: {
    color: "#4ADE80",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  modalPrimaryBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  modalPrimaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  modalSecondaryBtn: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  modalSecondaryBtnText: {
    color: "#818CF8",
    fontSize: 14,
    fontWeight: "600",
  },
  modalCancelBtn: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  modalCancelBtnText: {
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "600",
  },
  codeInput: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 8,
  },
});

