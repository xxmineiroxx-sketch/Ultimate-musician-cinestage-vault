/**
 * Shared Preset Storage - Ultimate Musician
 * Reads presets created in Ultimate Playback
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ultimate_playback_songs';

/**
 * Get all songs from Ultimate Playback
 */
export const getSharedSongs = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading shared songs:', error);
    return [];
  }
};

/**
 * Find song preset by title (fuzzy match)
 */
export const findSongPresetByTitle = async (title) => {
  try {
    const songs = await getSharedSongs();
    if (!songs.length) return null;

    // Normalize title for comparison
    const normalizeTitle = (str) =>
      str.toLowerCase().trim().replace(/[^\w\s]/g, '');

    const normalizedSearchTitle = normalizeTitle(title);

    // Try exact match first
    let match = songs.find(
      (s) => normalizeTitle(s.title) === normalizedSearchTitle
    );

    // Try partial match if no exact match
    if (!match) {
      match = songs.find((s) =>
        normalizeTitle(s.title).includes(normalizedSearchTitle)
      );
    }

    return match || null;
  } catch (error) {
    console.error('Error finding song preset:', error);
    return null;
  }
};

/**
 * Find song preset by ID
 */
export const getSongPresetById = async (songId) => {
  try {
    const songs = await getSharedSongs();
    return songs.find((s) => s.id === songId) || null;
  } catch (error) {
    console.error('Error getting song preset:', error);
    return null;
  }
};

/**
 * Check if song has device setups
 */
export const songHasDeviceSetups = (songPreset) => {
  if (!songPreset || !songPreset.device_setups) return false;

  const setups = songPreset.device_setups;
  let hasSetups = false;

  Object.values(setups).forEach((roleDevices) => {
    Object.values(roleDevices).forEach((deviceSetup) => {
      if (deviceSetup) hasSetups = true;
    });
  });

  return hasSetups;
};

/**
 * Get device count for a song preset
 */
export const getDeviceCount = (songPreset) => {
  if (!songPreset || !songPreset.device_setups) return 0;

  let count = 0;
  const setups = songPreset.device_setups;

  Object.values(setups).forEach((roleDevices) => {
    Object.keys(roleDevices).forEach((device) => {
      if (roleDevices[device]) count++;
    });
  });

  return count;
};
