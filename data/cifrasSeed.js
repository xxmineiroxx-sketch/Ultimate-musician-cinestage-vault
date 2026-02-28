/**
 * cifrasSeed.js
 * Seeds the app library with 681 worship songs from the INCC Cifras collection.
 * Songs include chord charts in Portuguese with keys, artists, and BPMs.
 * Only runs once per install (guarded by um.cifras.seeded.v1).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import cifrasData from './cifras-seed.json';

const SONGS_KEY      = 'um.songs.v2';
const CIFRAS_SEEDED  = 'um.cifras.seeded.v1';

const safeJsonParse = (val, fallback) => {
  try { return val ? JSON.parse(val) : fallback; } catch { return fallback; }
};

/**
 * Merges the Cifras INCC library into the song library.
 * Existing songs (matched by id) are not overwritten.
 * Uses a single bulk write for performance.
 */
export const ensureCifrasSeeded = async () => {
  try {
    const already = await AsyncStorage.getItem(CIFRAS_SEEDED);
    if (already === 'true') return { status: 'already_seeded' };

    const raw      = await AsyncStorage.getItem(SONGS_KEY);
    const existing = safeJsonParse(raw, []);
    const existIds  = new Set(existing.map(s => s.id));

    // Only add songs that aren't already in the library
    const toAdd = cifrasData.filter(s => !existIds.has(s.id));
    const merged = [...existing, ...toAdd];

    await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(merged));
    await AsyncStorage.setItem(CIFRAS_SEEDED, 'true');

    return { status: 'seeded', count: toAdd.length };
  } catch (e) {
    console.warn('cifrasSeed error:', e);
    return { status: 'error', error: e.message };
  }
};

/**
 * Remove all Cifras songs from the library (for reset purposes).
 */
export const removeCifrasSongs = async () => {
  try {
    const raw      = await AsyncStorage.getItem(SONGS_KEY);
    const existing = safeJsonParse(raw, []);
    const filtered = existing.filter(s => s.source !== 'cifras-incc');
    await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(filtered));
    await AsyncStorage.removeItem(CIFRAS_SEEDED);
    return { removed: existing.length - filtered.length };
  } catch (e) {
    return { error: e.message };
  }
};

export const getCifrasCount = () => cifrasData.length;
