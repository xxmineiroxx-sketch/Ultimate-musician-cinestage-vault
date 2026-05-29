export const SYNC_URL = 'https://ultimatelabs.pages.dev';
export const CINESTAGE_URL = 'https://cinestage.ultimatelabs.co';
export const CINESTAGE_WS_URL = CINESTAGE_URL.replace(/^https:/, 'wss:');
export const SYNC_ORG_ID = 'zpneef0a5ov732c0';
export const SYNC_SECRET_KEY = 'erflpo0e4pg33h85v58v7cfvpd6eoycv';
export const syncHeaders = () => ({
  'Content-Type': 'application/json',
  'x-org-id': SYNC_ORG_ID,
  'x-secret-key': SYNC_SECRET_KEY,
});
