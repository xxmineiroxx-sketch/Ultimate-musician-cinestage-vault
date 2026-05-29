/**
 * cifrasSeed.js
 * Seeds the app library with 681 worship songs from the INCC Cifras collection.
 * Songs include chord charts in Portuguese with keys, artists, and BPMs.
 * Only runs once per install (guarded by um.cifras.seeded.v1).
 */
import cifrasData from "./cifras-seed.json";
import { getScopedItem, removeScopedItem, setScopedItem } from "./orgScopedStorage";

const SONGS_KEY = "um.songs.v2";
const CIFRAS_SEEDED = "um.cifras.seeded.v1";

const safeJsonParse = (val, fallback) => {
  try {
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Merges the Cifras INCC library into the song library.
 * Existing songs (matched by id) are not overwritten.
 * Uses a single bulk write for performance.
 */
export const ensureCifrasSeeded = async () => {
  try {
    const already = await getScopedItem(CIFRAS_SEEDED);
    if (already === "true") return { status: "already_seeded" };

    const raw = await getScopedItem(SONGS_KEY);
    const existing = safeJsonParse(raw, []);
    const existIds = new Set(existing.map((s) => s.id));

    // Only add songs that aren't already in the library
    const toAdd = cifrasData.filter((s) => !existIds.has(s.id));
    const merged = [...existing, ...toAdd];

    await setScopedItem(SONGS_KEY, JSON.stringify(merged));
    await setScopedItem(CIFRAS_SEEDED, "true");

    return { status: "seeded", count: toAdd.length };
  } catch (e) {
    console.warn("cifrasSeed error:", e);
    return { status: "error", error: e.message };
  }
};

/**
 * Remove all Cifras songs from the library (for reset purposes).
 */
export const removeCifrasSongs = async () => {
  try {
    const raw = await getScopedItem(SONGS_KEY);
    const existing = safeJsonParse(raw, []);
    const filtered = existing.filter((s) => s.source !== "cifras-incc");
    await setScopedItem(SONGS_KEY, JSON.stringify(filtered));
    await removeScopedItem(CIFRAS_SEEDED);
    return { removed: existing.length - filtered.length };
  } catch (e) {
    return { error: e.message };
  }
};

export const getCifrasCount = () => cifrasData.length;
