/**
 * Storage module for Ultimate Playback
 * Handles local storage of song presets
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

const SONGS_KEY = 'ultimate_playback.songs.v1';
const SONGS_SYNC_OUTBOX_KEY = 'ultimate_playback.songs.sync_outbox.v1';
const SETTINGS_KEY = 'ultimate_playback.settings.v1';
const SONG_SYNC_FLUSH_DELAY_MS = 750;

let songSyncFlushTimer = null;
let songSyncFlushPromise = null;

const safeJsonParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const nowIso = () => new Date().toISOString();

const normalizeSongSyncId = (song) => String(
  song?.songId ||
  song?.librarySongId ||
  song?.sourceSongId ||
  (!(song?.planItemId || song?.serviceItemId) ? song?.id : '') ||
  ''
).trim();

const normalizeSongForSync = (song) => {
  const id = normalizeSongSyncId(song);
  if (!id) return null;

  const {
    planItemId,
    serviceItemId,
    assignmentId,
    serviceId,
    order,
    ...rest
  } = song || {};

  const updatedAt = rest.updatedAt || rest.updated_at || nowIso();
  const createdAt = rest.createdAt || rest.created_at || updatedAt;

  return {
    ...rest,
    id,
    songId: id,
    librarySongId: id,
    updatedAt,
    updated_at: updatedAt,
    createdAt,
    created_at: createdAt,
  };
};

const getSongsSyncOutbox = async () => {
  const raw = await AsyncStorage.getItem(SONGS_SYNC_OUTBOX_KEY);
  return safeJsonParse(raw, {});
};

const saveSongsSyncOutbox = async (outbox) => {
  if (!outbox || Object.keys(outbox).length === 0) {
    await AsyncStorage.removeItem(SONGS_SYNC_OUTBOX_KEY);
    return;
  }
  await AsyncStorage.setItem(SONGS_SYNC_OUTBOX_KEY, JSON.stringify(outbox));
};

const queueSongsForAutoSync = async (songs) => {
  const nextSongs = Array.isArray(songs) ? songs : [songs];
  const outbox = await getSongsSyncOutbox();
  let queued = false;

  for (const song of nextSongs) {
    const normalized = normalizeSongForSync(song);
    if (!normalized) continue;

    outbox[normalized.id] = {
      ...(outbox[normalized.id] || {}),
      ...normalized,
      queuedAt: nowIso(),
    };
    queued = true;
  }

  if (queued) {
    await saveSongsSyncOutbox(outbox);
  }

  return queued;
};

const flushSongsSyncOutbox = async () => {
  if (songSyncFlushPromise) {
    return songSyncFlushPromise;
  }

  songSyncFlushPromise = (async () => {
    const outbox = await getSongsSyncOutbox();
    const songs = Object.values(outbox || {}).filter(Boolean);

    if (!songs.length) {
      return { ok: true, count: 0 };
    }

    try {
      const response = await fetch(`${SYNC_URL}/sync/library-push`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({ songs }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const latestOutbox = await getSongsSyncOutbox();
      for (const song of songs) {
        const queued = latestOutbox[song.id];
        if (!queued) continue;

        const queuedVersion = queued.updatedAt || queued.updated_at || queued.queuedAt || '';
        const sentVersion = song.updatedAt || song.updated_at || song.queuedAt || '';
        if (queuedVersion === sentVersion) {
          delete latestOutbox[song.id];
        }
      }
      await saveSongsSyncOutbox(latestOutbox);

      return { ok: true, count: songs.length };
    } catch (error) {
      console.warn('[song-sync] auto-sync failed:', error?.message || String(error));
      return { ok: false, error };
    } finally {
      songSyncFlushPromise = null;
    }
  })();

  return songSyncFlushPromise;
};

const scheduleSongsSyncFlush = () => {
  if (songSyncFlushTimer) {
    clearTimeout(songSyncFlushTimer);
  }

  songSyncFlushTimer = setTimeout(() => {
    songSyncFlushTimer = null;
    flushSongsSyncOutbox();
  }, SONG_SYNC_FLUSH_DELAY_MS);
};

/**
 * Settings
 */
export const getSettings = async () => {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return safeJsonParse(raw, {
    apiBase: 'https://cinestage.ultimatelabs.co',
    defaultUserId: 'keyboardist-001',
    instrumentRole: 'Keyboardist',
  });
};

export const saveSettings = async (settings) => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

/**
 * Songs
 */
export const getSongs = async () => {
  const raw = await AsyncStorage.getItem(SONGS_KEY);
  scheduleSongsSyncFlush();
  return safeJsonParse(raw, []);
};

export const saveSongs = async (songs, options = {}) => {
  const {
    sync = true,
    syncSongs = songs,
  } = options;

  await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(songs));

  if (sync) {
    const queued = await queueSongsForAutoSync(syncSongs);
    if (queued) {
      scheduleSongsSyncFlush();
    }
  }
};

export const addOrUpdateSong = async (song) => {
  const songs = await getSongs();
  const index = songs.findIndex(s => s.id === song.id);

  const next = {
    ...song,
    updated_at: nowIso(),
    created_at: song.created_at || nowIso(),
  };

  if (index >= 0) {
    songs[index] = next;
  } else {
    songs.unshift(next);
  }

  await saveSongs(songs, { syncSongs: [next] });
  return next;
};

export const deleteSong = async (songId) => {
  const songs = await getSongs();
  const next = songs.filter(s => s.id !== songId);
  await saveSongs(next, { sync: false });
  return next;
};

export const getSongById = async (songId) => {
  const songs = await getSongs();
  return songs.find(s => s.id === songId);
};

export const flushPendingSongAutoSync = async () => flushSongsSyncOutbox();
