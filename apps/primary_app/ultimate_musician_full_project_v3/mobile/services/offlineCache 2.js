/**
 * Offline cache — AsyncStorage TTL cache for PCO API responses.
 *
 * Keys: um.pco.cache.{namespace}.{key}
 * Value: { data: any, cachedAt: ISO string, ttlMs: number }
 *
 * Usage:
 *   await cacheSet('plan_items', planId, data, 60 * 60 * 1000) // 1h TTL
 *   const hit = await cacheGet('plan_items', planId)           // null if expired
 *   await cacheInvalidate('plan_items', planId)
 *   await cacheInvalidateAll()
 *   const info = await getCacheInfo()  // { entries: number, lastSync: ISO }
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "um.pco.cache.";
const LAST_SYNC_KEY = "um.pco.cache.meta.lastSync";

// ── Default TTLs ──────────────────────────────────────────────────────────────

export const TTL_PLAN     = 24 * 60 * 60 * 1000; // 24 hours
export const TTL_TEAM     =  1 * 60 * 60 * 1000; //  1 hour
export const TTL_PEOPLE   =  6 * 60 * 60 * 1000; //  6 hours
export const TTL_SONGS    = 48 * 60 * 60 * 1000; // 48 hours
export const TTL_BLOCKOUT = 12 * 60 * 60 * 1000; // 12 hours

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildStorageKey(namespace, key) {
  return `${PREFIX}${namespace}.${key}`;
}

function isExpired(cachedAt, ttlMs) {
  if (!cachedAt || !ttlMs) return true;
  const age = Date.now() - new Date(cachedAt).getTime();
  return age > ttlMs;
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Store data in the cache under a namespace + key with a TTL.
 *
 * @param {string} namespace  - e.g. "plan_items"
 * @param {string} key        - unique identifier within namespace
 * @param {*}      data       - any JSON-serialisable value
 * @param {number} ttlMs      - time-to-live in milliseconds
 */
export async function cacheSet(namespace, key, data, ttlMs) {
  const storageKey = buildStorageKey(namespace, key);
  const entry = {
    data,
    cachedAt: new Date().toISOString(),
    ttlMs,
  };
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(entry));
  } catch (err) {
    // Storage quota or serialisation error — swallow so callers don't crash
    console.warn("[offlineCache] cacheSet error:", err?.message);
  }
}

/**
 * Retrieve cached data. Returns null on miss or expiry.
 *
 * @param {string} namespace
 * @param {string} key
 * @returns {Promise<*|null>}
 */
export async function cacheGet(namespace, key) {
  const storageKey = buildStorageKey(namespace, key);
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (!entry || typeof entry !== "object") return null;

    if (isExpired(entry.cachedAt, entry.ttlMs)) {
      // Expired — clean up in background, return null
      AsyncStorage.removeItem(storageKey).catch(() => {});
      return null;
    }

    return entry.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Remove a specific cache entry.
 *
 * @param {string} namespace
 * @param {string} key
 */
export async function cacheInvalidate(namespace, key) {
  const storageKey = buildStorageKey(namespace, key);
  try {
    await AsyncStorage.removeItem(storageKey);
  } catch (err) {
    console.warn("[offlineCache] cacheInvalidate error:", err?.message);
  }
}

/**
 * Remove ALL cache entries (keys starting with PREFIX) plus lastSync metadata.
 */
export async function cacheInvalidateAll() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = (allKeys || []).filter((k) => k.startsWith(PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch (err) {
    console.warn("[offlineCache] cacheInvalidateAll error:", err?.message);
  }
}

/**
 * Returns metadata about the current cache state.
 * @returns {Promise<{ entries: number, lastSync: string|null, isOnline: boolean }>}
 */
export async function getCacheInfo() {
  try {
    const [allKeys, lastSyncRaw] = await Promise.all([
      AsyncStorage.getAllKeys(),
      AsyncStorage.getItem(LAST_SYNC_KEY),
    ]);

    const cacheKeys = (allKeys || []).filter(
      (k) => k.startsWith(PREFIX) && !k.includes(".meta.")
    );

    let lastSync = null;
    if (lastSyncRaw) {
      try {
        lastSync = JSON.parse(lastSyncRaw)?.timestamp || null;
      } catch {
        lastSync = lastSyncRaw; // stored as plain string in older versions
      }
    }

    // Optimistic online check — no network request needed; callers can refine
    let isOnline = true;
    try {
      // React Native's NetInfo isn't always available without extra package;
      // use a lightweight heuristic instead
      isOnline = typeof navigator !== "undefined" ? navigator.onLine !== false : true;
    } catch {
      isOnline = true;
    }

    return {
      entries: cacheKeys.length,
      lastSync,
      isOnline,
    };
  } catch {
    return { entries: 0, lastSync: null, isOnline: true };
  }
}

/**
 * Save the current timestamp as the lastSync marker.
 */
export async function markSynced() {
  try {
    const value = JSON.stringify({ timestamp: new Date().toISOString() });
    await AsyncStorage.setItem(LAST_SYNC_KEY, value);
  } catch (err) {
    console.warn("[offlineCache] markSynced error:", err?.message);
  }
}

/**
 * Convert an ISO timestamp to a human-readable relative time string.
 *
 * @param {string|null} isoStr
 * @returns {string}  e.g. "just now", "5 minutes ago", "2 hours ago", "3 days ago"
 */
export function relativeTime(isoStr) {
  if (!isoStr) return "never";

  let date;
  try {
    date = new Date(isoStr);
    if (isNaN(date.getTime())) return "unknown";
  } catch {
    return "unknown";
  }

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 0) return "just now"; // clock skew guard

  if (diffSec < 60) {
    return "just now";
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return diffMin === 1 ? "1 minute ago" : `${diffMin} minutes ago`;
  }

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return diffHr === 1 ? "1 hour ago" : `${diffHr} hours ago`;
  }

  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) {
    return diffWeeks === 1 ? "1 week ago" : `${diffWeeks} weeks ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
}
