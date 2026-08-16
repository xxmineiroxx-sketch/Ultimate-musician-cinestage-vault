# Ultimate Musician - CineStage Desktop Stem Worker

Date: 2026-08-01

Decision: CineStage stem processing should be desktop-primary for each account holder. The desktop app does the heavy work; iPad/Admin creates and approves jobs; Playback receives approved practice parts; Cloudflare coordinates metadata and fallback.

Storage rule: stems are temporary service delivery packages, not website inventory. Assigned apps can download them for rehearsal/service use, then temporary delivery should expire two hours after the service ends. The account holder can keep a reusable local copy on desktop, mini PC/Mac, or external drive so future use of the same song can be recognized and sent faster.

Implemented sync surface:
- `POST /sync/cinestage/desktop-heartbeat`
- `GET /sync/cinestage/desktops`
- `POST /sync/cinestage/source-check`
- `GET /sync/cinestage/source-registry`
- `POST /sync/cinestage/source-registry`
- `POST /sync/stem-jobs`
- `GET /sync/stem-jobs`
- `GET /sync/stem-job?id=...`
- `POST /sync/stem-job/claim?id=...`
- `POST /sync/stem-job/update?id=...`
- `POST /sync/stem-job/approve?id=...`
- `POST /sync/stem-job/publish?id=...`
- `POST /sync/stem-jobs/cleanup`
- `POST /sync/stem-job/reject?id=...`
- `POST /sync/stem-assets/upload?id=...&type=...&filename=...`

Source routing order:
- `source_registry`: use the known stems/charts/analysis from the account library.
- `desktop`: route to the online Ultimate DAW Desktop for heavy work.
- `cloudflare_fallback`: use cloud fallback when the desktop is offline and the request is eligible.
- `waiting_for_desktop`: hold until the account desktop or backup processing machine is online.

Desktop worker implementation:
- Repo path: `apps/ultimate_daw/src/main/workers/stemJobWorker.js`
- Run command: `cd apps/ultimate_daw && UM_SYNC_URL="https://your-sync-worker.example" UM_ACCOUNT_EMAIL="account@example.com" npm run worker:stems`
- Single pass command: `cd apps/ultimate_daw && UM_STEM_RUN_ONCE=true UM_SYNC_URL="https://your-sync-worker.example" UM_ACCOUNT_EMAIL="account@example.com" npm run worker:stems:once`

Flow:
- Admin adds YouTube/audio link.
- Sync Worker checks the CineStage source registry before creating new work.
- If the account already has the song, the job becomes review-ready from known stems/charts.
- If the account desktop is online, the desktop worker receives the job.
- If no desktop is online, the job waits or becomes Cloudflare fallback eligible.
- Desktop separates stems, saves local cache, and updates the job.
- Admin/Worship Leader approves.
- Approved output publishes to the service/song library.
- Assigned Playback users receive their practice parts by role after a real delivery layer is added.
- Two hours after the service ends, temporary delivery expires and apps should delete downloaded tracks.

Current limitation:
- The desktop worker can separate stems locally, search the organized library, and submit review-ready metadata.
- The Node sync server can accept local stem uploads at `/sync/stem-assets/upload` and expose them under `/uploads/stem-assets/...`.
- Cloudflare R2 should preserve the same response shape when the delivery layer is moved from local uploads to R2.
- YouTube-only requests without a compliant source-prep step move to `waiting_for_source`.

Product rule:
- Cloudflare is coordinator/fallback, not the default heavy processor.
- Playback receives only approved outputs.
- Large audio binaries stay outside GitHub and outside a public website catalog for now; repo stores code, docs, and metadata.
