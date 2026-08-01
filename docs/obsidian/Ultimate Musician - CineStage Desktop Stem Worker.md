# Ultimate Musician - CineStage Desktop Stem Worker

Date: 2026-08-01

Decision: CineStage stem processing should be desktop-primary for each account holder. The desktop app does the heavy work; iPad/Admin creates and approves jobs; Playback receives approved practice parts; Cloudflare coordinates metadata and fallback.

Storage rule: stems are temporary service delivery packages, not website inventory. Assigned apps can download them for rehearsal/service use, then temporary delivery should expire two hours after the service ends. The account holder can keep a reusable local copy on desktop, mini PC/Mac, or external drive so future use of the same song can be recognized and sent faster.

Implemented sync surface:
- `POST /sync/cinestage/desktop-heartbeat`
- `GET /sync/cinestage/desktops`
- `POST /sync/stem-jobs`
- `GET /sync/stem-jobs`
- `GET /sync/stem-job?id=...`
- `POST /sync/stem-job/update?id=...`
- `POST /sync/stem-job/approve?id=...`
- `POST /sync/stem-job/publish?id=...`
- `POST /sync/stem-jobs/cleanup`
- `POST /sync/stem-job/reject?id=...`

Flow:
- Admin adds YouTube/audio link.
- Sync Worker creates a desktop-primary stem job.
- If the account desktop is online, the desktop worker receives the job.
- If no desktop is online, the job waits or becomes fallback eligible.
- Desktop separates stems, analyzes key/BPM/sections/cues, and updates the job.
- Admin/Worship Leader approves.
- Approved output publishes to the service/song library.
- Assigned Playback users receive their practice parts by role.
- Two hours after the service ends, temporary delivery expires and apps should delete downloaded tracks.
- Desktop may keep local cache metadata for future faster reuse.

Product rule:
- Cloudflare is coordinator/fallback, not the default heavy processor.
- Playback receives only approved outputs.
- Large audio binaries stay outside GitHub and outside a public website catalog for now; repo stores code, docs, and metadata.

Repo detail:
- Full spec: `docs/cinestage-desktop-stem-worker.md`

Desktop worker implementation added:
- Repo path: `apps/ultimate_daw/src/main/workers/stemJobWorker.js`
- Run command: `cd apps/ultimate_daw && UM_SYNC_URL="https://your-sync-worker.example" UM_ACCOUNT_EMAIL="account@example.com" npm run worker:stems`
- Single pass command: `cd apps/ultimate_daw && UM_STEM_RUN_ONCE=true UM_SYNC_URL="https://your-sync-worker.example" UM_ACCOUNT_EMAIL="account@example.com" npm run worker:stems:once`

Current limitation:
- The desktop worker can separate stems locally and submit review-ready metadata.
- When Cloudflare R2 binding `STEM_ASSETS` is configured, desktop uploads processed stems and Playback/iPad can download them from `/sync/stem-assets/download`.
- Without R2, worker stems are marked `local_cache_only` and `downloadable: false`.
- YouTube-only requests without a compliant source-prep step move to `waiting_for_source`.

Desktop source decision:
- Use repo `apps/ultimate_daw` as the source of truth.
- iCloud `UltimateMusicianDesktop` is a useful reference for local stem cache, waveform cache, and settings bridge.
- iCloud `UltimateMusicianDAW` is older than the repo DAW for this workflow.
