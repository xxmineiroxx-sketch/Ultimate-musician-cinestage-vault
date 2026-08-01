# Ultimate Musician - Desktop Version Audit 2026-08-01

Decision: use repo `apps/ultimate_daw` as the desktop source of truth.

Found candidates:
- Repo `apps/ultimate_daw`: current Electron DAW, CineStage Brain, and Demucs stem separator. Best source to build on.
- iCloud `Ultimate_Workspace/UltimateMusicianDesktop`: older Electron wrapper with useful local stem download/cache, waveform cache, settings, and sync bridge logic.
- iCloud `UltimateMusicianDAW`: older DAW skeleton and release app. Not ahead of the repo DAW for the desktop stem-worker build.
- Built app bundles: useful for testing/reference, not for source edits.

Improvement added:
- `apps/ultimate_daw/src/main/ipc/registerStemHandlers.js` now exports reusable `separateStems()`.
- `apps/ultimate_daw/src/main/workers/stemJobWorker.js` now polls Cloudflare sync jobs, sends desktop heartbeat, runs Demucs for local/direct audio, saves local cache, and updates jobs to `ready_for_review`.
- `apps/ultimate_daw/package.json` now includes `worker:stems` and `worker:stems:once`.

Open product gap:
- Processed stems still need a real cross-device delivery layer before Playback/iPad can download desktop-generated output.
- Preferred next options: Cloudflare R2 signed temporary URLs, Cloudflare Tunnel to desktop, or LAN delivery.
- YouTube links should stay source-prep blocked unless a compliant downloader is configured.

Related repo docs:
- `docs/desktop-version-audit-2026-08-01.md`
- `docs/cinestage-desktop-stem-worker.md`
