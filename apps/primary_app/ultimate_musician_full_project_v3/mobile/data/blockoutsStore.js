/**
 * Blockouts Store — synced cache for Ultimate Musician.
 * Reads blockouts from the live sync backend so Playback and Musician
 * stay aligned, while keeping a local cache for offline fallback.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { SYNC_URL, syncHeaders } from "../screens/config";

const KEY = "um/blockouts/v1";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDateKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeBlockout(entry) {
  if (!entry) return null;
  const date = normalizeDateKey(entry.date || entry.start_date || entry.end_date);
  if (!date) return null;
  const email = normalizeEmail(
    entry.email || (String(entry.userId || "").includes("@") ? entry.userId : ""),
  );
  const userId = String(entry.userId || email || "").trim();
  return {
    id: String(entry.id || `blockout_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
    userId,
    email,
    name: String(entry.name || "Team Member").trim(),
    date,
    reason: String(entry.reason || "Not available").trim(),
    createdAt:
      entry.createdAt
      || entry.created_at
      || new Date().toISOString(),
    updatedAt:
      entry.updatedAt
      || entry.updated_at
      || entry.createdAt
      || entry.created_at
      || new Date().toISOString(),
  };
}

function mergeBlockouts(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const rawEntry of Array.isArray(list) ? list : []) {
      const entry = normalizeBlockout(rawEntry);
      if (!entry) continue;
      const identity = entry.email
        ? `${entry.email}:${entry.date}`
        : `${entry.userId}:${entry.date}`;
      const current = merged.get(identity);
      merged.set(identity, {
        ...(current || {}),
        ...entry,
        createdAt: current?.createdAt || entry.createdAt,
      });
    }
  }
  return Array.from(merged.values()).sort((left, right) => {
    return `${left.date}:${left.name}`.localeCompare(`${right.date}:${right.name}`);
  });
}

async function getJSON(fallback) {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? mergeBlockouts(parsed) : fallback;
  } catch {
    return fallback;
  }
}

async function setJSON(value) {
  await AsyncStorage.setItem(KEY, JSON.stringify(mergeBlockouts(value)));
}

async function fetchRemoteBlockouts(params = {}) {
  const query = new URLSearchParams();
  const date = normalizeDateKey(params.date || "");
  const email = normalizeEmail(params.email || "");
  if (date) query.set("date", date);
  if (email) query.set("email", email);
  const qs = query.toString();
  const res = await fetch(`${SYNC_URL}/sync/blockouts${qs ? `?${qs}` : ""}`, {
    headers: syncHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Blockouts sync failed (${res.status}): ${text}`);
  }
  const data = await res.json().catch(() => []);
  return mergeBlockouts(data);
}

async function syncCacheWithRemote(params = {}) {
  const [local, remote] = await Promise.all([
    getJSON([]),
    fetchRemoteBlockouts(params),
  ]);
  const merged = mergeBlockouts(local, remote);
  await setJSON(merged);
  return { local, remote, merged };
}

function matchBlockoutToUser(entry, userId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedEmail = normalizeEmail(userId);
  return (
    (normalizedUserId && entry.userId === normalizedUserId)
    || (normalizedEmail && entry.email === normalizedEmail)
  );
}

/** Get all blockout entries across all team members */
export async function getBlockouts() {
  try {
    const { merged } = await syncCacheWithRemote();
    return merged;
  } catch {
    return getJSON([]);
  }
}

/** Get blockouts for a specific date string (YYYY-MM-DD) */
export async function getBlockoutsForDate(dateStr) {
  const normalizedDate = normalizeDateKey(dateStr);
  if (!normalizedDate) return [];
  try {
    const { local, remote } = await syncCacheWithRemote({ date: normalizedDate });
    return mergeBlockouts(local, remote).filter((entry) => entry.date === normalizedDate);
  } catch {
    const all = await getJSON([]);
    return all.filter((entry) => entry.date === normalizedDate);
  }
}

/** Get all blockout dates for a specific userId or email */
export async function getBlockoutsForUser(userId) {
  const normalizedEmail = normalizeEmail(userId);
  try {
    const { local, remote } = normalizedEmail
      ? await syncCacheWithRemote({ email: normalizedEmail })
      : { local: await getJSON([]), remote: [] };
    return mergeBlockouts(local, remote).filter((entry) => matchBlockoutToUser(entry, userId));
  } catch {
    const all = await getJSON([]);
    return all.filter((entry) => matchBlockoutToUser(entry, userId));
  }
}

/**
 * Add a blockout date.
 * If the userId looks like an email, sync it to the backend as well.
 */
export async function addBlockout({
  userId,
  name,
  date,
  reason = "Not available",
}) {
  const normalizedDate = normalizeDateKey(date);
  const normalizedEmail = normalizeEmail(userId);
  const entry = normalizeBlockout({
    userId,
    email: normalizedEmail,
    name,
    date: normalizedDate,
    reason,
  });
  if (!entry) throw new Error("Invalid blockout date");

  const all = await getJSON([]);
  const merged = mergeBlockouts(all, [entry]);
  await setJSON(merged);

  if (normalizedEmail) {
    try {
      const res = await fetch(`${SYNC_URL}/sync/blockout`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({
          id: entry.id,
          email: normalizedEmail,
          name: entry.name,
          date: entry.date,
          reason: entry.reason,
          userId: entry.userId,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const synced = data?.blockout ? mergeBlockouts(merged, [data.blockout]) : merged;
        await setJSON(synced);
        return synced.find((item) => item.id === entry.id)
          || synced.find((item) => item.email === entry.email && item.date === entry.date)
          || entry;
      }
    } catch {
      // Keep the local cached blockout when offline.
    }
  }

  return entry;
}

/** Remove a blockout entry by id */
export async function removeBlockout(id) {
  const normalizedId = String(id || "").trim();
  const all = await getJSON([]);
  const target = all.find((entry) => entry.id === normalizedId);
  const filtered = all.filter((entry) => entry.id !== normalizedId);
  await setJSON(filtered);

  if (target?.email) {
    try {
      const query = new URLSearchParams({
        id: normalizedId,
        email: target.email,
      }).toString();
      await fetch(`${SYNC_URL}/sync/blockout?${query}`, {
        method: "DELETE",
        headers: syncHeaders(),
      });
    } catch {
      // Keep local delete and let next refresh reconcile.
    }
  }
}

/**
 * Returns a Set of date strings that have at least one blockout.
 * Used by the calendar to highlight unavailable dates.
 */
export async function getBlockedDateSet() {
  const all = await getBlockouts();
  return new Set(all.map((entry) => entry.date));
}

/**
 * Check if a person is blocked on a specific date.
 */
export async function isPersonBlockedOnDate(userId, dateStr) {
  const normalizedDate = normalizeDateKey(dateStr);
  if (!normalizedDate) return false;
  const all = await getBlockouts();
  return all.some((entry) => matchBlockoutToUser(entry, userId) && entry.date === normalizedDate);
}
