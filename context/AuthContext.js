import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const AuthContext = createContext(null);

const STORAGE_KEYS = {
  token: "um_token",
  userId: "um_user_id",
  apiBase: "um_api_base",
};

const DEFAULT_API_BASE =
  process.env.EXPO_PUBLIC_API_BASE || "http://localhost:8000";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [userId, setUserId] = useState(null);
  const [apiBase, setApiBaseState] = useState(DEFAULT_API_BASE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [storedToken, storedUserId, storedApiBase] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.token),
        AsyncStorage.getItem(STORAGE_KEYS.userId),
        AsyncStorage.getItem(STORAGE_KEYS.apiBase),
      ]);
      if (storedToken) setToken(storedToken);
      if (storedUserId) setUserId(storedUserId);
      if (storedApiBase) setApiBaseState(storedApiBase);
      setReady(true);
    })();
  }, []);

  const persistApiBase = async (value) => {
    setApiBaseState(value);
    await AsyncStorage.setItem(STORAGE_KEYS.apiBase, value);
  };

  const register = async (email, password) => {
    const res = await fetch(`${apiBase}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || "Registration failed");
    setToken(json.token);
    setUserId(json.user_id);
    await AsyncStorage.setItem(STORAGE_KEYS.token, json.token);
    await AsyncStorage.setItem(STORAGE_KEYS.userId, json.user_id);
  };

  const login = async (email, password) => {
    const res = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || "Login failed");
    setToken(json.token);
    setUserId(json.user_id);
    await AsyncStorage.setItem(STORAGE_KEYS.token, json.token);
    await AsyncStorage.setItem(STORAGE_KEYS.userId, json.user_id);
  };

  const continueAsGuest = async () => {
    const guestId = `guest-${Date.now()}`;
    setToken(null);
    setUserId(guestId);
    await AsyncStorage.removeItem(STORAGE_KEYS.token);
    await AsyncStorage.setItem(STORAGE_KEYS.userId, guestId);
  };

  const logout = async () => {
    setToken(null);
    setUserId(null);
    await AsyncStorage.multiRemove([STORAGE_KEYS.token, STORAGE_KEYS.userId]);
  };

  const value = useMemo(
    () => ({
      token,
      userId,
      apiBase,
      ready,
      setApiBase: persistApiBase,
      login,
      register,
      continueAsGuest,
      logout,
    }),
    [token, userId, apiBase, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
