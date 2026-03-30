import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

import { useAuth } from '../context/AuthContext';
import { SYNC_URL, syncHeaders } from '../screens/config';

const POLL_INTERVAL_MS = 15000;
const PLAY_THROTTLE_MS = 1500;
const SOUND_FILENAME = 'um-message-alert.wav';
const SOUND_BASE64 =
  'UklGRsQFAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAFAACAgYODf3t4en1/goiNjYNxY2V6laSchG1kanR9hpGeoIxoSUltn761j2ZUW2x6hpapr5lpOzNcnszKnWhLT2N2hZasuKRwOidMlM7Vqm9LSl5zgpOpuKp7QihDhsTUsnpSTF1xgI6hsaqFUzVFerHHsINfVWFxfoiWo6KKZUxRdJywpYdtZGp1fYOLk5OIdWdndoqUkIV6dnh8f4CBgoKAgH9/gICAgICAgICAgICAgICAgH9/gICAgICAgICAgICAgICAgIB/f4CAgICAgICAgICAgICAgIB/f4CAgICAgICAgICAgICAgIB/f4CAgICAgICAgICAgICAgIB/f4CAgICAgICAgICAgICAgIB/f4CAgICAgICAgICAgICAgICAf4CAgICAgICAgICAgICAgICAf4CAgICAgICAgICAgICAgICAf3+AgICAgICAgICAgICAgICAf3+AgICAgICAgICAgICAgICAgH+AgICAgICAgICAgICAgICAgH+AgICAgICAgICAgICAgICAgH+AgICAgICAgICAgICAgICAgH+AgICAgICAgICAgICAgICAgH+AgICAgICAgICAgICAgICAgIB/gICAgICAgICAgICAgICAgIB/gICAgICAgICAgICAgICAgIB/gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=';

let soundFilePromise = null;
let lastPlayAt = 0;

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function createAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

async function fetchJson(url) {
  const { signal, clear } = createAbortSignal(6000);
  try {
    const response = await fetch(url, { headers: syncHeaders(), signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clear();
  }
}

function buildAdminEventKeys(threads) {
  return (Array.isArray(threads) ? threads : [])
    .map((thread) => thread?.id)
    .filter(Boolean)
    .sort();
}

function buildNetworkEventKeys(threads, email) {
  const normalizedEmail = normalize(email);
  const keys = [];
  for (const thread of Array.isArray(threads) ? threads : []) {
    const isIncomingThread =
      Boolean(normalize(thread?.fromEmail)) &&
      normalize(thread.fromEmail) !== normalizedEmail;

    if (isIncomingThread && thread?.id) {
      keys.push(`thread:${thread.id}`);
    }

    for (const [index, reply] of (thread?.replies || []).entries()) {
      const replyAuthorEmail = normalize(reply?.fromEmail || reply?.email);
      if (replyAuthorEmail && replyAuthorEmail === normalizedEmail) continue;
      const replyKey = reply?.id || reply?.timestamp || `${thread?.id || 'thread'}:${index}`;
      keys.push(`reply:${thread?.id || 'thread'}:${replyKey}`);
    }
  }
  return keys.sort();
}

function hasNewKeys(previousKeys, nextKeys) {
  if (!Array.isArray(previousKeys) || previousKeys.length === 0) return false;
  const previous = new Set(previousKeys);
  return nextKeys.some((key) => !previous.has(key));
}

async function ensureSoundFile() {
  if (Platform.OS === 'web') return null;
  if (!soundFilePromise) {
    soundFilePromise = (async () => {
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!baseDir) return null;
      const fileUri = `${baseDir}${SOUND_FILENAME}`;
      const info = await FileSystem.getInfoAsync(fileUri).catch(() => ({ exists: false }));
      if (!info?.exists) {
        await FileSystem.writeAsStringAsync(fileUri, SOUND_BASE64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      return fileUri;
    })();
  }
  return soundFilePromise;
}

async function playMessageChime() {
  if (Platform.OS === 'web') return;
  const now = Date.now();
  if (now - lastPlayAt < PLAY_THROTTLE_MS) return;
  lastPlayAt = now;

  try {
    const fileUri = await ensureSoundFile();
    if (!fileUri) return;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    const { sound } = await Audio.Sound.createAsync(
      { uri: fileUri },
      { shouldPlay: false, volume: 0.9 }
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status?.didJustFinish || status?.error) {
        sound.unloadAsync().catch(() => {});
      }
    });
    await sound.playAsync();
  } catch (_) {
    // Ignore notification-sound failures so message polling keeps running.
  }
}

async function fetchAdminKeys() {
  const data = await fetchJson(`${SYNC_URL}/sync/messages/admin`);
  return buildAdminEventKeys(data);
}

async function fetchNetworkKeys(email) {
  if (!email) return [];
  const data = await fetchJson(`${SYNC_URL}/sync/xmessages?email=${encodeURIComponent(email)}`);
  return buildNetworkEventKeys(data, email);
}

export default function MessageNotificationWatcher() {
  const { isGuest, ready, userId, userRole } = useAuth();
  const appStateRef = useRef(AppState.currentState || 'active');
  const pollingRef = useRef(false);
  const identityRef = useRef('');
  const previousKeysRef = useRef({
    inbox: null,
    network: null,
  });

  useEffect(() => {
    let mounted = true;
    let intervalId = null;

    const pollMessages = async () => {
      if (!mounted || !ready || !userId || isGuest || appStateRef.current !== 'active' || pollingRef.current) {
        return;
      }
      pollingRef.current = true;

      try {
        const storedEmail = normalize(await AsyncStorage.getItem('@user_email'));
        const identity = `${normalize(userId)}|${normalize(userRole)}`;

        if (identityRef.current !== identity) {
          identityRef.current = identity;
          previousKeysRef.current = { inbox: null, network: null };
        }

        const [adminKeys, networkKeys] = await Promise.all([
          fetchAdminKeys().catch(() => null),
          fetchNetworkKeys(storedEmail).catch(() => null),
        ]);

        let shouldPlay = false;

        if (Array.isArray(adminKeys)) {
          shouldPlay = shouldPlay || hasNewKeys(previousKeysRef.current.inbox, adminKeys);
          previousKeysRef.current.inbox = adminKeys;
        }

        if (Array.isArray(networkKeys)) {
          shouldPlay = shouldPlay || hasNewKeys(previousKeysRef.current.network, networkKeys);
          previousKeysRef.current.network = networkKeys;
        }

        if (shouldPlay) {
          await playMessageChime();
        }
      } finally {
        pollingRef.current = false;
      }
    };

    const handleAppStateChange = (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        void pollMessages();
      }
    };

    void pollMessages();
    intervalId = setInterval(() => {
      void pollMessages();
    }, POLL_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
      subscription.remove();
    };
  }, [isGuest, ready, userId, userRole]);

  return null;
}
