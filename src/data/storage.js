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

/**
 * Settings
 */
export const getSettings = async () => {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return safeJsonParse(raw, {
    apiBase: 'http://localhost:8000',
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

export const getAllSongs = getSongs;
