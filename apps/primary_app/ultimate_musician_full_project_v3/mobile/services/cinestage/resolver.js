/**
 * CineStage URL Resolver
 * Probes Railway server with a 3s timeout; falls back to local server.
 * Results are cached for 5 minutes so repeated calls are instant.
 */

import { CINESTAGE_URL } from "../../screens/config";

const LOCAL_URL = "http://localhost:8000";
const PROBE_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

let _resolved = null;
let _resolvedAt = 0;

/** Synchronous — returns last resolved URL or Railway default. Safe for useState init. */
export function getCachedCineStageUrl() {
  return _resolved || CINESTAGE_URL;
}

/**
 * Async — probes Railway, falls back to localhost:8000.
 * Returns the best available server URL.
 */
export async function getActiveCineStageUrl() {
  const now = Date.now();
  if (_resolved && now - _resolvedAt < CACHE_TTL_MS) {
    return _resolved;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`${CINESTAGE_URL}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    // Any non-5xx response means the server is reachable
    if (res.status < 500) {
      _resolved = CINESTAGE_URL;
      _resolvedAt = now;
      return _resolved;
    }
  } catch {
    // timeout or network error — fall through to local
  }

  // Try local server
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${LOCAL_URL}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status < 500) {
      _resolved = LOCAL_URL;
      _resolvedAt = now;
      return _resolved;
    }
  } catch {
    // local also unreachable
  }

  // Both unreachable — return Railway anyway (jobs will fail gracefully)
  _resolved = CINESTAGE_URL;
  _resolvedAt = now;
  return _resolved;
}

/** Force a fresh probe on next call (e.g. after user changes network). */
export function invalidateCineStageUrlCache() {
  _resolved = null;
  _resolvedAt = 0;
}
