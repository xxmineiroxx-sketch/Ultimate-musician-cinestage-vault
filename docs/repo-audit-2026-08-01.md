# Repo Audit - 2026-08-01

## Scope

Audited the current Ultimate Musician / Ultimate Playback vault after adding:
- Service-specific Lead Singer setlist approval.
- Admin/Worship Leader inspection before publishing.
- Assigned-team-only approval messages.
- Monthly assignment tracking.
- Team song suggestions.
- Musician lyrics, chord chart, and instrument-note proposals.

Primary code surfaces reviewed:
- Root Playback app: `src/`, `config/`, root Expo package.
- Nested Playback app: `apps/ultimate_playback/src/`, nested Expo package.
- Production sync Worker: `apps/ultimate_playback/cloudflare/ultimate-playback-sync/worker.js`.
- Standalone iCloud sync server mirror: `UltimateSyncServer/server.js`.
- GitHub Actions workflows.
- README, Obsidian workflow note, and Graphify output.

## Verification Passed

- Installed dependencies with `npm ci` in root and `apps/ultimate_playback`.
- Fixed Expo SDK 54 patch drift with `npx expo install --fix`.
- Added root `expo-font@~14.0.12` to resolve duplicate native module detection.
- `npx expo-doctor` passed `18/18` in root.
- `npx expo-doctor` passed `18/18` in `apps/ultimate_playback`.
- Parsed 135 root/nested JS/JSX files successfully with Babel parser.
- `node --check` passed for the Cloudflare sync Worker.
- `node --check` passed for the standalone sync server.
- `npx expo export --platform web` passed for root.
- `npx expo export --platform web` passed for `apps/ultimate_playback`.
- `git diff --check` passed for the vault repo.
- `git diff --check -- server.js SETLIST_APPROVAL_WORKFLOW.md` passed for the standalone sync server.
- `graphify update` rebuilt the code graph: 3,257 nodes, 6,446 edges, 242 communities.

## Gaps Fixed

- Root sync config no longer defaults to `https://ultimatelabs.pages.dev`; it now defaults to `https://ultimate-playback-sync.studio-cinestage.workers.dev`.
- README no longer presents the old LAN IP sync server as the production path.
- Cloudflare Worker now supports the same song/chart proposal endpoints the app calls:
  - `POST /sync/song/patch`
  - `POST /sync/proposal`
  - `POST /sync/proposal/approve`
  - `POST /sync/proposal/reject`
  - `POST /sync/library/song-propose`
  - `GET /sync/library/pending-songs`
  - `POST /sync/library/song-approve`
  - `POST /sync/library/song-reject`
- Standalone sync server now mirrors pending song suggestion approval.
- Playback Home now gives regular members a Suggest Song action.
- Root and nested app packages were updated to Expo SDK 54-compatible patch versions.
- Graphify cache is ignored so GitHub can keep useful graph artifacts without committing cache noise.

## Remaining Risks

- `npm audit` still reports 15 vulnerabilities in both root and nested dependency trees: 13 moderate and 2 high.
- The remaining audit fixes are tied to transitive Expo tooling (`postcss`, `uuid`, `brace-expansion`) and npm suggests `npm audit fix --force`, which would install Expo 57. That should be handled as a planned SDK upgrade, not forced into the SDK 54 release line.
- Mobile native builds were not run locally in this pass. Web export passed, but iOS/Android confidence still requires EAS or local native build validation.
- The standalone iCloud sync server repo has a git metadata issue: `git status` fails with `fatal: cannot use .git/info/exclude as an exclude file`. File-level syntax and diff checks still passed.

## Product Rules Confirmed

- Lead Singer access is service-specific for setlist submission.
- Lead Singer can prepare but cannot publish directly to the whole team.
- Admin/Worship Leader approval gates setlist publishing.
- Any team member can suggest songs, but approval is required before the song enters the library.
- Musicians can add/edit lyrics, chord charts, and instrument-specific parts as proposals; approval applies the content live.
- Assignment history is recorded for monthly rotation/fairness tracking.

## Graphify / Obsidian

- Graphify artifacts are in `graphify-out/`:
  - `GRAPH_REPORT.md`
  - `graph.json`
  - `graph.html`
- Cache files under `graphify-out/cache/` are ignored.
- The Obsidian workflow note has a repo copy at `docs/obsidian/Ultimate Musician - Setlist Approval Workflow.md`.

