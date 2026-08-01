# Ultimate Musician - CineStage Desktop Stem Worker

Date: 2026-08-01

Decision: CineStage stem processing should be desktop-primary for each account holder. The desktop app does the heavy work; iPad/Admin creates and approves jobs; Playback receives approved practice parts; Cloudflare coordinates metadata and fallback.

Implemented sync surface:
- `POST /sync/cinestage/desktop-heartbeat`
- `GET /sync/cinestage/desktops`
- `POST /sync/stem-jobs`
- `GET /sync/stem-jobs`
- `GET /sync/stem-job?id=...`
- `POST /sync/stem-job/update?id=...`
- `POST /sync/stem-job/approve?id=...`
- `POST /sync/stem-job/publish?id=...`
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

Product rule:
- Cloudflare is coordinator/fallback, not the default heavy processor.
- Playback receives only approved outputs.
- Large audio binaries stay outside GitHub; repo stores code, docs, and metadata.

Repo detail:
- Full spec: `docs/cinestage-desktop-stem-worker.md`

