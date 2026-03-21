/**
 * Ultimate Playback — Sync Server Configuration
 *
 * PRODUCTION: https://ultimatelabs.pages.dev  (Cloudflare — global, always-on)
 * LOCAL MIDI:  http://localhost:8099           (local only — for MIDI bridge)
 */
export const SYNC_URL        = 'https://ultimatelabs.pages.dev';
export const CINESTAGE_URL   = 'https://cinestage.studio-cinestage.workers.dev';
export const SYNC_ORG_ID     = 'zpneef0a5ov732c0';
export const SYNC_SECRET_KEY = 'erflpo0e4pg33h85v58v7cfvpd6eoycv';

export const syncHeaders = () => ({
  'Content-Type': 'application/json',
  'x-org-id': SYNC_ORG_ID,
  'x-secret-key': SYNC_SECRET_KEY,
});
