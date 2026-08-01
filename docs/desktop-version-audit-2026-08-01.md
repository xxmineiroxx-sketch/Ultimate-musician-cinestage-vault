# Desktop Version Audit - 2026-08-01

## Recommendation

Use `apps/ultimate_daw` in this GitHub repo as the source of truth for the desktop build.

It is the best current base because it already has the Electron/Vite app, the DAW workspace, CineStage Brain screen, and a Demucs stem separator. The older iCloud desktop folders are useful references, but they should not become the primary code path unless a missing feature needs to be recovered.

## Desktop Candidates Found

### Repo source of truth

- `/tmp/Ultimate-musician-cinestage-vault-audit/apps/ultimate_daw`
- Current Electron app named `ultimate-musician-daw`.
- Has `src/main/main.js`, `src/main/preload.js`, renderer screens, DAW controls, CineStage Brain, and `src/main/ipc/registerStemHandlers.js`.
- Before this audit it could separate stems only from the UI IPC handler. It did not have a background queue worker.

### iCloud legacy desktop wrapper

- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Utimate Musician app/Ultimate_Workspace/UltimateMusicianDesktop`
- Older Electron wrapper named `ultimate-musician`.
- Useful ideas found:
  - local stem cache under `~/Music/Ultimate Musician/Stems`
  - settings file with profile, sync URL, API key, and service ID
  - local stem download/list/open-folder IPC handlers
  - waveform cache IPC handlers
  - web app bridge for desktop wrapper use
- It does not contain a separate `stem-upload-worker.js` source file in the inspected folder. Stem/download logic is embedded in `main.js`.

### iCloud DAW copy

- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Utimate Musician app/UltimateMusicianDAW`
- Older DAW skeleton with Electron 28/Vite and project/audio handlers.
- It is not ahead of the repo DAW for the CineStage desktop-primary stem worker.

### Installed app bundles

- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Desktop/Ultimate Musician.app`
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Utimate Musician app/Ultimate_Workspace/Ultimate Musician.app`
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Utimate Musician app/UltimateMusicianDAW/release/mac-arm64/Ultimate Musician.app`
- `/Users/studio/Applications/CineStage Guard.app`

These are built apps or utility apps, not the best place to make source changes.

## Improvements Added To Repo

- Extracted `separateStems()` from the Electron IPC handler so background processes can reuse the same Demucs logic.
- Added a desktop stem queue worker at `apps/ultimate_daw/src/main/workers/stemJobWorker.js`.
- Added npm scripts:
  - `npm run worker:stems`
  - `npm run worker:stems:once`

## Remaining Gaps

- Processed stem delivery to iPad/Playback still needs a real cross-device storage path. The worker currently marks prepared stems as `local_cache_only` with local file URLs so Admin/Worship Leader can inspect what the account desktop produced.
- For team downloads, add one of these delivery layers:
  - Cloudflare R2 temporary signed URLs
  - a Cloudflare Tunnel to the account desktop
  - local LAN transfer for same-building rehearsal devices
- YouTube source preparation is intentionally disabled by default. The app should require licensed/local audio unless a compliant downloader is configured.
- Waveform/BPM/key/section analysis should be wired from `/Users/studio/cinestage-main-clean` after stem delivery is real.
