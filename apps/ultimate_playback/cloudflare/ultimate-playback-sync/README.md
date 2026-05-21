# Ultimate Playback Sync Worker

Temporary real-device recovery Worker for the Ultimate Playback app.

It provides the `/sync/status` and `/sync/auth/*` endpoints needed by the
installed iOS app when the full sync backend is not reachable from a real
device. It returns stable JSON shapes so sign-in and app boot do not fail on
HTML 404 responses from the marketing site.

Deploy:

```bash
npx wrangler deploy --config apps/ultimate_playback/cloudflare/ultimate-playback-sync/wrangler.toml
```

Current production endpoint:

```text
https://ultimate-playback-sync.studio-cinestage.workers.dev
```
