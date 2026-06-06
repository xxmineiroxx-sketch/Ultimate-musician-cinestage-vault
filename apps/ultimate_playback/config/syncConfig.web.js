/**
 * Ultimate Playback web sync configuration.
 *
 * Browser builds call the same origin, and Cloudflare Pages injects private
 * sync headers while proxying /sync/* to the production Worker.
 */

const getWebOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'https://playback.ultimatelabs.co';
};

export const SYNC_URL = getWebOrigin();
export const CINESTAGE_URL = process.env.EXPO_PUBLIC_CINESTAGE_URL || 'https://cinestage.ultimatelabs.co';
export const CINESTAGE_WS_URL = CINESTAGE_URL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
export const CINESTAGE_BRAIN_URL = `${CINESTAGE_URL}/api/brain/capabilities`;
export const CINESTAGE_BOOTSTRAP_URL = `${CINESTAGE_URL}/api/brain/bootstrap`;

export const SYNC_ORG_ID = '';
export const SYNC_SECRET_KEY = '';

export const syncHeaders = () => ({
  'Content-Type': 'application/json',
});
