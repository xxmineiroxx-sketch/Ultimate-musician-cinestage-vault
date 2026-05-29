/**
 * stemSyncService.js
 * Cross-device stem job sync service.
 * Fetches stem separation results from CineStage backend.
 * Used by both mobile (AsyncStorage cache) and desktop (via desktopBridge).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CINESTAGE_URL } from '../screens/config';
import { isDesktop, fetchStemPeaksViaDesktop } from '../utils/desktopBridge';

const STEM_CACHE_PREFIX = 'um.stemjob.v1.';
const STEM_PEAKS_PREFIX = 'um.stempeaks.v1.';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ── Stem Job Result ───────────────────────────────────────────────────────────

/**
 * Get the latest stem job result for a song from CineStage.
 * Caches in AsyncStorage (24h TTL).
 * @param {string} songId
 * @returns {Promise<{stems, vocalHarmonies, bpm, key}|null>}
 */
export async function getStemResult(songId) {
  const key = STEM_CACHE_PREFIX + songId;

  // 1. Check local cache
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const entry = JSON.parse(raw);
      if (Date.now() - entry.cachedAt < CACHE_TTL_MS) return entry.data;
    }
  } catch {}

  // 2. Fetch from CineStage
  try {
    const resp = await fetch(`${CINESTAGE_URL}/api/stems/${songId}`, {
      signal: AbortSignal.timeout?.(10000),
    });
    if (resp.ok) {
      const json = await resp.json();
      const data = json.result || json;
      await AsyncStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now() }));
      return data;
    }
  } catch {}

  return null;
}

/**
 * Invalidate cached stem result (call after new job completes).
 */
export async function invalidateStemCache(songId) {
  await AsyncStorage.removeItem(STEM_CACHE_PREFIX + songId);
  await AsyncStorage.removeItem(STEM_PEAKS_PREFIX + songId);
}

// ── Stem Waveform Peaks ───────────────────────────────────────────────────────

/**
 * Get per-stem waveform peak arrays.
 * Flow: local cache → GET /api/waveform/stems/{songId} → POST /api/waveform/stems-analyze
 * Returns { vocals: [], drums: [], bass: [], other: [] } or null.
 */
export async function getStemPeaks(songId, stemUrls = null) {
  const key = STEM_PEAKS_PREFIX + songId;

  // 1. Local cache
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const entry = JSON.parse(raw);
      // Stem peaks have 30-day TTL (they don't change once computed)
      if (Date.now() - entry.cachedAt < 30 * 24 * 60 * 60 * 1000) return entry.data;
    }
  } catch {}

  // 2. On desktop, use Electron bridge (avoids CORS)
  if (isDesktop && stemUrls) {
    try {
      const result = await fetchStemPeaksViaDesktop(songId, stemUrls);
      if (result?.stemPeaks) {
        await AsyncStorage.setItem(key, JSON.stringify({ data: result.stemPeaks, cachedAt: Date.now() }));
        return result.stemPeaks;
      }
    } catch {}
  }

  // 3. GET cached peaks from CineStage
  try {
    const resp = await fetch(`${CINESTAGE_URL}/api/waveform/stems/${songId}`, {
      signal: AbortSignal.timeout?.(8000),
    });
    if (resp.ok) {
      const json = await resp.json();
      if (json.stemPeaks) {
        await AsyncStorage.setItem(key, JSON.stringify({ data: json.stemPeaks, cachedAt: Date.now() }));
        return json.stemPeaks;
      }
    }
  } catch {}

  // 4. Request analysis if stem URLs provided
  if (stemUrls && Object.keys(stemUrls).length > 0) {
    try {
      const resp = await fetch(`${CINESTAGE_URL}/api/waveform/stems-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId, stems: stemUrls, nBars: 1800 }),
        signal: AbortSignal.timeout?.(60000),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.stemPeaks) {
          await AsyncStorage.setItem(key, JSON.stringify({ data: json.stemPeaks, cachedAt: Date.now() }));
          return json.stemPeaks;
        }
      }
    } catch {}
  }

  return null;
}

// ── Desktop sync ──────────────────────────────────────────────────────────────

/**
 * After stem separation completes, persist the result to CineStage DB
 * so other devices can discover it.
 */
export async function persistStemResult(jobId, songId, title, resultData) {
  try {
    await fetch(`${CINESTAGE_URL}/api/stems/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        songId,
        title,
        status: 'DONE',
        resultData,
      }),
    });
  } catch {
    // Non-fatal — mobile already has the result in KV
  }
}
