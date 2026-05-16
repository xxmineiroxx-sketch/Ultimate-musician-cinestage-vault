/**
 * Ultimate Platform — Sync Server Configuration
 *
 * PRODUCTION: https://ultimatelabs.pages.dev  (Cloudflare — global, always-on)
 * LOCAL MIDI:  http://localhost:8099           (local only — for MIDI bridge)
 *
 * Credentials are loaded from environment variables (EXPO_PUBLIC_*).
 * Copy .env.example → .env and fill in real values.
 */

export const SYNC_URL = process.env.EXPO_PUBLIC_SYNC_URL || 'https://ultimatelabs.pages.dev';
export const CINESTAGE_URL = process.env.EXPO_PUBLIC_CINESTAGE_URL || 'https://cinestage.ultimatelabs.co';

export const SYNC_ORG_ID = process.env.EXPO_PUBLIC_SYNC_ORG_ID || '';
export const SYNC_SECRET_KEY = process.env.EXPO_PUBLIC_SYNC_SECRET_KEY || '';

export const syncHeaders = () => ({
  'Content-Type': 'application/json',
  'x-org-id': SYNC_ORG_ID,
  'x-secret-key': SYNC_SECRET_KEY,
});
