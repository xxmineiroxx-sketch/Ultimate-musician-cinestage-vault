/**
 * Ultimate Platform — Sync Server Configuration
 *
 * CLOUD SYNC: https://ultimate-playback-sync.studio-cinestage.workers.dev
 * LOCAL MIDI:  http://localhost:8099           (local only — for MIDI bridge)
 *
 * Credentials are loaded from environment variables (EXPO_PUBLIC_*).
 * Copy .env.example → .env and fill in real values.
 */

const DEFAULT_SYNC_URL = 'https://ultimate-playback-sync.studio-cinestage.workers.dev';

export const SYNC_URL = process.env.EXPO_PUBLIC_SYNC_URL || DEFAULT_SYNC_URL;
export const CINESTAGE_URL = process.env.EXPO_PUBLIC_CINESTAGE_URL || 'https://cinestage.ultimatelabs.co';

export const SYNC_ORG_ID = process.env.EXPO_PUBLIC_SYNC_ORG_ID || '';
export const SYNC_SECRET_KEY = process.env.EXPO_PUBLIC_SYNC_SECRET_KEY || '';

export const syncHeaders = () => ({
  'Content-Type': 'application/json',
  'x-org-id': SYNC_ORG_ID,
  'x-secret-key': SYNC_SECRET_KEY,
});
