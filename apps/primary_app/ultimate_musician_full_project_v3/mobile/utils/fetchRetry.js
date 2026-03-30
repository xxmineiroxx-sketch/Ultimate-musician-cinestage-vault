/**
 * fetchWithRetry — wraps fetch() with automatic retry on Railway cold-start (502/503).
 *
 * Usage:
 *   import { fetchWithRetry } from '../utils/fetchRetry';
 *   const res = await fetchWithRetry(url, options);   // same API as fetch()
 *
 * Behaviour:
 *   - On 502 or 503: waits `retryDelay` ms then retries up to `maxRetries` times.
 *   - All other errors / status codes pass through unchanged.
 */
export async function fetchWithRetry(url, options = {}, { maxRetries = 2, retryDelay = 3000 } = {}) {
  let lastRes;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if ((res.status === 502 || res.status === 503) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelay));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelay));
        continue;
      }
      throw err;
    }
  }
  return lastRes; // unreachable but satisfies linter
}
