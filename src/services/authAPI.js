import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'http://10.0.0.34:8000';
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

async function request(path, options = {}) {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function register({ firstName, lastName, email, password, phone, role }) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, email, password, phone, role }),
  });
}

export async function verifyCode(email, code) {
  const data = await request('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  await AsyncStorage.setItem(TOKEN_KEY, data.token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  // Keep legacy user_session key for backward compat
  await AsyncStorage.setItem('user_session', JSON.stringify({ email, token: data.token }));
  return data;
}

export async function login(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  await AsyncStorage.setItem(TOKEN_KEY, data.token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  await AsyncStorage.setItem('user_session', JSON.stringify({ email, token: data.token }));
  return data;
}

export async function resendCode(email) {
  return request('/auth/resend', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function getMe() {
  return request('/auth/me');
}

export async function logout() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, 'user_session']);
}

export async function getStoredUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function isLoggedIn() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  return !!token;
}
