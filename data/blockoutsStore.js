/**
 * Blockouts Store — shared between Ultimate Musician (admin) and Ultimate Playback (musicians).
 * Both apps read/write to the same AsyncStorage key so blockout dates are visible to both sides.
 *
 * Key: 'um/blockouts/v1'
 * Schema: Array<{ id, userId, name, date (YYYY-MM-DD), reason, createdAt }>
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'um/blockouts/v1';

async function getJSON(fallback) {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function setJSON(value) {
  await AsyncStorage.setItem(KEY, JSON.stringify(value));
}

/** Get all blockout entries across all team members */
export async function getBlockouts() {
  return getJSON([]);
}

/** Get blockouts for a specific date string (YYYY-MM-DD) */
export async function getBlockoutsForDate(dateStr) {
  const all = await getBlockouts();
  return all.filter((b) => b.date === dateStr);
}

/** Get all blockout dates for a specific userId */
export async function getBlockoutsForUser(userId) {
  const all = await getBlockouts();
  return all.filter((b) => b.userId === userId);
}

/**
 * Add a blockout date (called by musician in Ultimate Playback).
 * @param {{ userId, name, date, reason }} entry
 */
export async function addBlockout({ userId, name, date, reason = 'Not available' }) {
  const all = await getBlockouts();

  // Prevent duplicates for same user + date
  const exists = all.find((b) => b.userId === userId && b.date === date);
  if (exists) return exists;

  const entry = {
    id: `blockout_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId,
    name: name || 'Team Member',
    date,
    reason,
    createdAt: new Date().toISOString(),
  };

  await setJSON([...all, entry]);
  return entry;
}

/** Remove a blockout entry by id */
export async function removeBlockout(id) {
  const all = await getBlockouts();
  await setJSON(all.filter((b) => b.id !== id));
}

/**
 * Returns a Set of date strings that have at least one blockout.
 * Used by the calendar to highlight unavailable dates.
 */
export async function getBlockedDateSet() {
  const all = await getBlockouts();
  return new Set(all.map((b) => b.date));
}

/**
 * Check if a person (userId) is blocked on a specific date.
 * Admin uses this before assigning a team member to a service.
 */
export async function isPersonBlockedOnDate(userId, dateStr) {
  const all = await getBlockouts();
  return all.some((b) => b.userId === userId && b.date === dateStr);
}
