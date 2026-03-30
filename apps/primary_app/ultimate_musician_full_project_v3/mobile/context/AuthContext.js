import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

import { SYNC_URL, syncHeaders } from "../screens/config";

const AuthContext = createContext(null);

const STORAGE_KEYS = {
  token: "um_token",
  userId: "um_user_id",
  userEmail: "@user_email",
  userName: "@user_name",
  userRole: "@user_role",
  deviceId: "um_device_id",
  pendingVerification: "um_pending_verification",
};

function isGuestUserId(value) {
  return String(value || "")
    .trim()
    .startsWith("guest-");
}

function makeDeviceId() {
  return `um_mobile_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function normalizePendingVerification(value) {
  const identifier = String(value?.identifier || "").trim();
  if (!identifier) return null;
  return {
    identifier,
    purpose: value?.purpose === "signup" ? "signup" : "login",
    email: String(value?.email || identifier)
      .trim()
      .toLowerCase(),
  };
}

function parsePendingVerification(raw) {
  if (!raw) return null;
  try {
    return normalizePendingVerification(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userName, setUserName] = useState(null);
  const [pendingVerification, setPendingVerification] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [
        storedToken,
        storedUserId,
        storedEmail,
        storedName,
        storedRole,
        storedPendingVerification,
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.token),
        AsyncStorage.getItem(STORAGE_KEYS.userId),
        AsyncStorage.getItem(STORAGE_KEYS.userEmail),
        AsyncStorage.getItem(STORAGE_KEYS.userName),
        AsyncStorage.getItem(STORAGE_KEYS.userRole),
        AsyncStorage.getItem(STORAGE_KEYS.pendingVerification),
      ]);

      const resolvedUserId = storedEmail || storedUserId || null;
      const parsedPendingVerification = parsePendingVerification(
        storedPendingVerification,
      );

      if (resolvedUserId) setUserId(resolvedUserId);
      if (storedToken) setToken(storedToken);
      if (storedName) setUserName(storedName);
      if (storedRole) setUserRole(storedRole);

      if (resolvedUserId && parsedPendingVerification) {
        await AsyncStorage.removeItem(STORAGE_KEYS.pendingVerification);
      } else if (parsedPendingVerification) {
        setPendingVerification(parsedPendingVerification);
      }

      setReady(true);
    })();
  }, []);

  const getOrCreateDeviceId = async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.deviceId);
    if (stored) return stored;
    const next = makeDeviceId();
    await AsyncStorage.setItem(STORAGE_KEYS.deviceId, next);
    return next;
  };

  const persistPendingVerification = async (value) => {
    const next = normalizePendingVerification(value);
    setPendingVerification(next);

    if (!next) {
      await AsyncStorage.removeItem(STORAGE_KEYS.pendingVerification);
      return null;
    }

    await AsyncStorage.setItem(
      STORAGE_KEYS.pendingVerification,
      JSON.stringify(next),
    );
    return next;
  };

  const persistSession = async (data, fallbackIdentifier = "") => {
    const resolvedUserId = String(data?.email || fallbackIdentifier || "")
      .trim()
      .toLowerCase();
    const resolvedName = String(
      data?.name || resolvedUserId || fallbackIdentifier || "",
    ).trim();
    const resolvedRole = String(data?.role || "").trim();

    await AsyncStorage.multiSet([
      [STORAGE_KEYS.userEmail, resolvedUserId],
      [STORAGE_KEYS.userName, resolvedName],
      [STORAGE_KEYS.userRole, resolvedRole],
      [STORAGE_KEYS.userId, resolvedUserId],
    ]);
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.token,
      STORAGE_KEYS.pendingVerification,
    ]);

    setToken(null);
    setUserId(resolvedUserId || null);
    setUserName(resolvedName || null);
    setUserRole(resolvedRole || null);
    setPendingVerification(null);
  };

  const register = async (identifier, password, name = "") => {
    const raw = identifier.trim();
    const deviceId = await getOrCreateDeviceId();
    const res = await fetch(`${SYNC_URL}/sync/auth/register`, {
      method: "POST",
      headers: syncHeaders(),
      body: JSON.stringify({
        identifier: raw,
        password,
        name,
        deviceId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Registration failed");

    if (data.needsVerification) {
      const verification = await persistPendingVerification({
        identifier: raw,
        purpose: data.verificationPurpose,
        email: data.email || raw,
      });
      return { ...data, pendingVerification: verification };
    }

    await persistSession(data, raw);
    return data;
  };

  const login = async (identifier, password) => {
    const raw = identifier.trim();
    const deviceId = await getOrCreateDeviceId();
    const res = await fetch(`${SYNC_URL}/sync/auth/login`, {
      method: "POST",
      headers: syncHeaders(),
      body: JSON.stringify({
        identifier: raw,
        password,
        deviceId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Login failed");

    if (data.needsVerification) {
      const verification = await persistPendingVerification({
        identifier: raw,
        purpose: data.verificationPurpose,
        email: data.email || raw,
      });
      return { ...data, pendingVerification: verification };
    }

    await persistSession(data, raw);
    return data;
  };

  const loginWithApple = async (identityToken, user) => {
    const deviceId = await getOrCreateDeviceId();
    const res = await fetch(`${SYNC_URL}/sync/auth/apple`, {
      method: "POST",
      headers: syncHeaders(),
      body: JSON.stringify({
        identityToken,
        user, // Only available on first login, contains email and fullName
        deviceId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Apple Sign-In failed");

    await persistSession(data, data.email || "Apple User");
    return data;
  };

  const verifyCode = async (identifier, code, purpose) => {
    const verification = normalizePendingVerification({
      identifier: identifier || pendingVerification?.identifier,
      purpose: purpose || pendingVerification?.purpose,
      email: pendingVerification?.email || identifier,
    });

    if (!verification?.identifier) {
      throw new Error("No verification request is waiting on this device.");
    }

    const deviceId = await getOrCreateDeviceId();
    const res = await fetch(`${SYNC_URL}/sync/auth/verify`, {
      method: "POST",
      headers: syncHeaders(),
      body: JSON.stringify({
        identifier: verification.identifier,
        code: String(code || "").trim(),
        purpose: verification.purpose,
        deviceId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Verification failed");

    await persistSession(data, verification.email || verification.identifier);
    return data;
  };

  const resendVerification = async (identifier, purpose) => {
    const verification = normalizePendingVerification({
      identifier: identifier || pendingVerification?.identifier,
      purpose: purpose || pendingVerification?.purpose,
      email: pendingVerification?.email || identifier,
    });

    if (!verification?.identifier) {
      throw new Error("No verification request is waiting on this device.");
    }

    const deviceId = await getOrCreateDeviceId();
    const res = await fetch(`${SYNC_URL}/sync/auth/resend`, {
      method: "POST",
      headers: syncHeaders(),
      body: JSON.stringify({
        identifier: verification.identifier,
        purpose: verification.purpose,
        deviceId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not resend code");

    if (data.alreadyVerified) {
      await persistPendingVerification(null);
      return data;
    }

    const refreshed = await persistPendingVerification({
      ...verification,
      email: data.email || verification.email,
    });
    return { ...data, pendingVerification: refreshed };
  };

  const clearPendingVerification = async () => {
    await persistPendingVerification(null);
  };

  const continueAsGuest = async () => {
    const guestId = `guest-${Date.now()}`;
    setToken(null);
    setUserId(guestId);
    setUserRole(null);
    setUserName(null);
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.token,
      STORAGE_KEYS.userEmail,
      STORAGE_KEYS.userName,
      STORAGE_KEYS.userRole,
      STORAGE_KEYS.pendingVerification,
    ]);
    await AsyncStorage.setItem(STORAGE_KEYS.userId, guestId);
  };

  const logout = async () => {
    setToken(null);
    setUserId(null);
    setUserRole(null);
    setUserName(null);
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.token,
      STORAGE_KEYS.userId,
      STORAGE_KEYS.userEmail,
      STORAGE_KEYS.userName,
      STORAGE_KEYS.userRole,
      STORAGE_KEYS.pendingVerification,
    ]);
  };

  const isGuest = Boolean(userId && isGuestUserId(userId));
  const isAuthenticated = Boolean(userId && !isGuest);

  const value = {
    token,
    userId,
    userRole,
    userName,
    pendingVerification,
    ready,
    isGuest,
    isAuthenticated,
    // Kept for backward compat
    apiBase: SYNC_URL,
    setApiBase: () => {},
    login,
    loginWithApple,
    register,
    verifyCode,
    resendVerification,
    clearPendingVerification,
    continueAsGuest,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
