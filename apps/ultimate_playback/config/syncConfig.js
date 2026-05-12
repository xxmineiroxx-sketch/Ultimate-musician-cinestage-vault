/**
 * Ultimate Playback — Sync Server Configuration
 *
 * PRODUCTION: https://ultimatelabs.pages.dev  (Cloudflare Pages + Functions)
 *              Requires Functions to be deployed via `wrangler pages deploy`
 * LOCAL MIDI:  http://localhost:8099           (local only — for MIDI bridge)
 *
 * ⚠️  SECURITY: All secrets are loaded from environment variables.
 *     Do NOT hardcode credentials here. Use .env (gitignored).
 *     See .env.example for required variables.
 */

export const SYNC_URL        = process.env.EXPO_PUBLIC_SYNC_URL        || 'https://ultimatelabs.pages.dev';
export const CINESTAGE_URL   = process.env.EXPO_PUBLIC_CINESTAGE_URL   || 'https://cinestage.ultimatelabs.co';
export const SYNC_ORG_ID     = process.env.EXPO_PUBLIC_SYNC_ORG_ID     || '';
export const SYNC_SECRET_KEY = process.env.EXPO_PUBLIC_SYNC_SECRET_KEY || '';

export const syncHeaders = () => ({
  'Content-Type': 'application/json',
  'x-org-id': SYNC_ORG_ID,
  'x-secret-key': SYNC_SECRET_KEY,
});

/**
 * Validate that required sync credentials are configured.
 * Call this early in app startup to fail fast with a clear message.
 */
export const validateSyncConfig = () => {
  const missing = [];
  if (!SYNC_ORG_ID)     missing.push('EXPO_PUBLIC_SYNC_ORG_ID');
  if (!SYNC_SECRET_KEY) missing.push('EXPO_PUBLIC_SYNC_SECRET_KEY');
  if (!SYNC_URL)        missing.push('EXPO_PUBLIC_SYNC_URL');

  if (missing.length > 0) {
    console.warn(
      `[syncConfig] Missing environment variables: ${missing.join(', ')}.\n` +
      `Please copy .env.example to .env and fill in your credentials.`
    );
    return false;
  }
  return true;
};
