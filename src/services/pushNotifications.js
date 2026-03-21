import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { getUserProfile } from './storage';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

const appConfig = require('../../app.json');

const PUSH_DEVICE_KEY = '@up_push_device_key_v1';
const PUSH_REGISTRATION_KEY = '@up_push_registration_v1';
const EXPO_PROJECT_ID = appConfig?.expo?.extra?.eas?.projectId || '';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePreferences(preferences = {}) {
  return {
    assignments: preferences?.assignments !== false,
    messages: preferences?.messages !== false,
    reminders: preferences?.reminders !== false,
  };
}

async function getStableDeviceKey() {
  const existing = await AsyncStorage.getItem(PUSH_DEVICE_KEY);
  if (existing) return existing;

  const next = `push_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(PUSH_DEVICE_KEY, next);
  return next;
}

async function postPushRegistration(path, body) {
  const response = await fetch(`${SYNC_URL}/sync/${path}`, {
    method: 'POST',
    headers: syncHeaders(),
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data?.error || `Push sync failed (${response.status})`);
  }
  return data;
}

async function ensureNotificationPermission() {
  let settings = await Notifications.getPermissionsAsync();
  if (settings.status !== 'granted') {
    settings = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: true,
        allowAnnouncements: false,
      },
    });
  }
  return settings.status === 'granted';
}

async function getExpoPushToken() {
  if (Platform.OS === 'web') return '';
  if (!Device.isDevice) return '';
  if (!EXPO_PROJECT_ID) return '';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  const granted = await ensureNotificationPermission();
  if (!granted) return '';

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: EXPO_PROJECT_ID,
  });
  return String(tokenData?.data || '').trim();
}

function buildRegistrationSignature({ email, token, preferences, grantedRole }) {
  return JSON.stringify({
    email: normalize(email),
    token: String(token || '').trim(),
    grantedRole: normalize(grantedRole),
    preferences: normalizePreferences(preferences),
  });
}

export async function syncPushRegistration(force = false) {
  if (Platform.OS === 'web') return { ok: false, reason: 'web' };

  const profile = await getUserProfile();
  const email = normalize(profile?.email);
  if (!email) {
    await unregisterStoredPushToken().catch(() => {});
    return { ok: false, reason: 'no_email' };
  }

  const token = await getExpoPushToken();
  if (!token) return { ok: false, reason: 'token_unavailable' };

  const deviceId = await getStableDeviceKey();
  const preferences = normalizePreferences(profile?.notification_preferences);
  const signature = buildRegistrationSignature({
    email,
    token,
    preferences,
    grantedRole: profile?.grantedRole || profile?.role,
  });

  if (!force) {
    const previousSignature = await AsyncStorage.getItem(PUSH_REGISTRATION_KEY);
    if (previousSignature === signature) {
      return { ok: true, token, cached: true };
    }
  }

  await postPushRegistration('push/register', {
    token,
    email,
    name: [profile?.name, profile?.lastName].filter(Boolean).join(' ').trim(),
    grantedRole: profile?.grantedRole || profile?.role || '',
    platform: Platform.OS,
    deviceId,
    app: 'ultimate_playback',
    preferences,
  });

  await AsyncStorage.setItem(PUSH_REGISTRATION_KEY, signature);
  return { ok: true, token };
}

export async function unregisterStoredPushToken() {
  if (Platform.OS === 'web') return { ok: false, reason: 'web' };

  const [profile, signature] = await Promise.all([
    getUserProfile().catch(() => null),
    AsyncStorage.getItem(PUSH_REGISTRATION_KEY),
  ]);

  if (!signature) return { ok: false, reason: 'not_registered' };

  let parsed = null;
  try {
    parsed = JSON.parse(signature);
  } catch {
    parsed = null;
  }

  const token = String(parsed?.token || '').trim();
  const email = normalize(parsed?.email || profile?.email);
  const deviceId = await AsyncStorage.getItem(PUSH_DEVICE_KEY).catch(() => '');

  if (token || email || deviceId) {
    await postPushRegistration('push/unregister', {
      token,
      email,
      deviceId,
      app: 'ultimate_playback',
    }).catch(() => {});
  }

  await AsyncStorage.removeItem(PUSH_REGISTRATION_KEY);
  return { ok: true };
}

export function handleNotificationResponse(response, navigationRef) {
  if (!response || !navigationRef?.isReady?.()) return;
  const data = response?.notification?.request?.content?.data || {};
  const type = normalize(data?.type || data?.screen);

  if (type === 'assignment' || type === 'assignmentstab' || type === 'assignments') {
    navigationRef.navigate('Main', { screen: 'AssignmentsTab' });
    return;
  }

  if (type === 'message' || type === 'messages' || type === 'messagestab') {
    navigationRef.navigate('Main', { screen: 'MessagesTab' });
    return;
  }

  if (type === 'admindashboard') {
    navigationRef.navigate('AdminDashboard');
  }
}
