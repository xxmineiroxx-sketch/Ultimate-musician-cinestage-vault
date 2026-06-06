const SYNC_ORIGIN = 'https://ultimate-playback-sync.studio-cinestage.workers.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/sync/')) {
      const target = new URL(`${url.pathname}${url.search}`, SYNC_ORIGIN);
      const headers = new Headers(request.headers);

      if (env.SYNC_ORG_ID) {
        headers.set('x-org-id', env.SYNC_ORG_ID);
      }

      if (env.SYNC_SECRET_KEY) {
        headers.set('x-secret-key', env.SYNC_SECRET_KEY);
      }

      const proxyRequest = new Request(target, {
        body: request.body,
        headers,
        method: request.method,
        redirect: request.redirect,
      });
      return fetch(proxyRequest);
    }

    return env.ASSETS.fetch(request);
  },
};
