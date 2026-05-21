# Ultimate Ecosystem - Universal Template Application

Date: 2026-05-21
Reference: Universal Project Build Template + ADAPTA operating layer
Scope: Ultimate Musician admin app, Ultimate Playback team app, sync API, CineStage integration

## Project Identity

Project name: Ultimate Ecosystem

Project type: Mobile app platform + AI music operations system + live performance tool

Core purpose: Plan services, manage worship teams, prepare songs/stems, synchronize assignments, and guide live playback from one connected admin and musician workflow.

Target users:

- Music directors and worship leaders using Ultimate Musician
- Musicians, singers, MDs, and team members using Ultimate Playback
- Production leaders using CineStage, MIDI, stems, and live cue tooling

Core problem:

Church music teams lose time because planning, people, service schedules, charts, stems, blockouts, messages, and live playback are split across unrelated tools. The system should make the service plan the source of truth and keep the team synchronized before rehearsal and during performance.

Product philosophy:

- Fast: 1 to 2 tap access to today's service, assignments, charts, and playback
- Intelligent: AI-assisted song prep, stem analysis, chart generation, and cue guidance
- Automated: sync assignments, blockouts, proposals, messages, and role access without manual duplicate entry
- Simple UX: admin depth in Ultimate Musician, focused execution in Ultimate Playback
- Scalable: multi-team, multi-service, branch/org-ready architecture with reproducible deploys

## Success Criteria

- Real iOS builds never depend on localhost, LAN IPs, or temporary tunnels for sign-in.
- Admin and Playback apps agree on the same service, people, roles, assignments, messages, proposals, and song library data.
- Every production endpoint is documented as stable, temporary recovery, or local-only.
- Every cross-app feature has a clear fallback state when sync is unavailable.
- Secrets stay in `.env`, EAS/GitHub Secrets, or runtime storage; no source files or docs should contain real org secrets.
- The app can be validated with smoke checks before a TestFlight or OTA release.

## Current Architecture

Mobile:

- Ultimate Musician: Expo SDK 54, React Native 0.81.5, React Navigation v7
- Ultimate Playback: Expo SDK 54, React Native 0.81.5, React Navigation v6

Sync and backend:

- Local development sync server: `sync-server.js` on port `8099`
- Ultimate Playback real-device recovery sync: `https://ultimate-playback-sync.studio-cinestage.workers.dev`
- Ultimate Musician production sync default: `https://ultimatelabs.pages.dev`
- CineStage API: `https://cinestage.ultimatelabs.co`

Storage:

- Local app data: AsyncStorage
- Local sync data: `sync-data.json` (ignored)
- Cloud sync: Cloudflare Pages/Workers and CineStage services

CI/CD:

- GitHub Actions for Playback EAS builds
- GitHub Actions for Musician EAS builds
- Secrets scan workflow blocks committed `.env` files and known hardcoded credentials

## Module Review

### Core Functionality

Done:

- Service planning, people, roles, assignments, messages, proposals, blockouts, song library, setlists, stems, live performance screens, and sync server routes.

Needs improvement:

- One canonical service-plan API contract shared by both apps.
- First-class offline event queue for Playback assignment responses, blockouts, messages, and proposals.
- Cleaner ownership boundary between local sync server, Cloudflare Worker recovery, and the full production sync backend.

### UX/UI

Done:

- Ultimate Musician has broad admin controls.
- Ultimate Playback has team dashboard, assignments, messages, setlists, performance mode, and MD/admin mode.

Needs improvement:

- Playback should prioritize today's service, my assignment, charts, rehearsal prep, and live mode above admin-style controls.
- Musician should show a command-center view: today's services, missing responses, blockouts, open proposals, unsent messages, and sync health.
- Empty/error states should tell users exactly what to do next: refresh, sign in, ask admin for role, retry sync, or switch to offline mode.

### Automation

Done:

- Role grants, proposal approval, assignment responses, messages, and blockouts sync through shared routes.

Needs improvement:

- Morning service brief for MDs.
- Automatic missing-response reminders.
- Auto-generated rehearsal checklist per service.
- Proposal-to-library merge audit trail.
- Push notifications for assignments, message replies, service changes, and approved proposals.

### AI / Intelligence Layer

Done:

- CineStage and music-director services exist for AI-assisted song and stem workflows.

Needs improvement:

- AI-generated service brief: missing roles, risky songs, key changes, stem readiness, lyric/chord gaps.
- AI chart cleanup with approval before publishing.
- AI rehearsal plan from service length, song complexity, and team availability.
- AI confidence labels on generated charts, cues, stem analysis, and recommendations.

### Data and Database

Done:

- AsyncStorage schemas and sync store cover core entities.

Needs improvement:

- Versioned sync schema with migration rules.
- Conflict resolution for offline edits.
- Durable server-side store beyond local JSON for production.
- Audit trail for role changes, proposal approvals, service publish, and message deletion.

### APIs and Integrations

Done:

- `/sync/*` routes exist for people, grants, roles, messages, blockouts, assignments, proposals, library, setlists, stems, auth, and profile.
- Playback Worker recovery provides reachable auth/status endpoints for real iOS.

Needs improvement:

- Promote the recovery Worker into either a full Playback sync edge API or route Playback back to a full stable sync backend.
- Standardize endpoint capability checks so the app knows when a route is unsupported.
- Add release smoke endpoints for auth, people, assignments, messages, setlist, and library.

### Billing / Payments

Not currently applicable to worship-team use. If monetization is added, keep it separate from service/team workflows:

- Organization subscription
- Seat limits
- Storage/stem-processing limits
- Church billing owner role

### Admin / Dashboard

Done:

- Ultimate Musician includes permissions, people, services, proposals, messages, and branch management surfaces.

Needs improvement:

- Dashboard should be exception-led: missing confirmations, blocked people, open proposals, unsynced devices, stale service plans, and audio/stem readiness.
- Branch/org setup needs a safer guided flow with validation and rollback.

### Notifications and Alerts

Needs improvement:

- Expo push registration and server delivery policy.
- Message reply alerts.
- Assignment response reminders.
- Service changed alerts.
- Proposal approved/rejected alerts.
- Local offline reminders when network sync fails.

### Security and Permissions

Done:

- Role grants and admin/MD access model exist.
- Secrets scan protects JS/TS/JSON source from known credentials.

Needs improvement:

- Remove real secret values from durable docs and screenshots.
- Add session/device list for admin review.
- Add audit log for role grants and admin actions.
- Avoid sending secrets in WebSocket query params for production channels.

## Build Plan

Phase 1 - Reliability:

- Keep real iOS sign-in on a stable HTTPS endpoint.
- Update all docs and examples away from temporary tunnels and LAN-only assumptions.
- Add smoke scripts for auth/status endpoints.
- Keep source, Obsidian, Graphify, and GitHub in sync after deployment changes.

Phase 2 - Core Sync:

- Standardize shared `/sync/*` API contract.
- Add capability/status endpoint for both apps.
- Move production sync storage off local JSON.
- Add offline event queue for Playback.

Phase 3 - Intelligence:

- Add service brief generation.
- Add chart/stem readiness scoring.
- Add AI-generated rehearsal plan and missing-role recommendations.
- Add confidence and approval workflow for AI output.

Phase 4 - Scale:

- Unify navigation versions or explicitly isolate v6/v7 app surfaces.
- Add observability for sync failures, OTA update adoption, and crash reports.
- Add organization/branch onboarding with validation.
- Add regression tests around auth, permissions, sync, proposals, and setlist loading.

## Immediate Gaps To Track

- Ultimate Playback navigation remains on v6 while Musician is v7.
- Playback package still lacks lint/test scripts.
- Root README has been updated away from stale `10.0.0.34` production guidance; keep LAN details local-only.
- Musician's default sync remains `ultimatelabs.pages.dev`; verify every required `/sync/*` route exists there before production releases.
- Playback Worker is currently a recovery API, not a full sync backend.
