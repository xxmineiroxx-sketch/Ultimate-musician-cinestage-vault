/**
 * Storage module for Ultimate Playback
 * Handles local storage of song presets
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SONGS_KEY = 'ultimate_playback.songs.v1';
const SETTINGS_KEY = 'ultimate_playback.settings.v1';

const safeJsonParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const nowIso = () => new Date().toISOString();

const stableSongContentHash = (song = {}) => {
  const payload = JSON.stringify({
    title: song.title || '',
    artist: song.artist || '',
    key: song.key || '',
    bpm: song.bpm || song.tempo || '',
    timeSig: song.timeSig || '',
    lyrics: song.lyrics || '',
    chordChart: song.chordChart || '',
    chordSheet: song.chordSheet || '',
    instrumentNotes: song.instrumentNotes || {},
    keyboardRigs: song.keyboardRigs || [],
    midiPresets: song.midiPresets || {},
    sectionMapping: song.sectionMapping || song.sections || [],
    deviceConfigs: song.deviceConfigs || {},
  });
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const withSongRevision = (song = {}, previous = null) => {
  const merged = { ...(previous || {}), ...song };
  const contentHash = stableSongContentHash(merged);
  const changed = previous ? previous.contentHash !== contentHash : true;
  const stamp = nowIso();
  const revision = Math.max(0, Number(previous?.revision || previous?.songRevision || song.revision || 0) || 0) + (changed ? 1 : 0);
  return {
    ...merged,
    contentHash,
    revision,
    songRevision: revision,
    updated_at: stamp,
    updatedAt: stamp,
    lastEditedAt: stamp,
    created_at: previous?.created_at || song.created_at || stamp,
  };
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
  return safeJsonParse(raw, []);
};

export const saveSongs = async (songs) => {
  await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(songs));
};

export const addOrUpdateSong = async (song) => {
  const songs = await getSongs();
  const index = songs.findIndex(s => s.id === song.id);
  const next = withSongRevision(song, index >= 0 ? songs[index] : null);

  if (index >= 0) {
    songs[index] = next;
  } else {
    songs.unshift(next);
  }

  await saveSongs(songs);
  return next;
};

export const deleteSong = async (songId) => {
  const songs = await getSongs();
  const next = songs.filter(s => s.id !== songId);
  await saveSongs(next);
  return next;
};

export const getSongById = async (songId) => {
  const songs = await getSongs();
  return songs.find(s => s.id === songId);
};
