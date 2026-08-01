# Ultimate Musician - Deep App Feature Inventory 2026-08-01

Source repo doc: `docs/deep-app-feature-inventory-2026-08-01.md`

## Main Finding

The current ecosystem already includes most of the requested product surface. The next work should be consolidation, cleanup, and productization rather than building another isolated feature.

## Already Have

- Admin/Worship Leader setlist review.
- Lead Singer/setlist creator grants.
- Setlist submit, approve, reject, and publish.
- Team assignments, accept/decline, blockouts, and assignment stats.
- Song suggestions and content proposals for lyrics, chords, instrument notes, and keyboard rigs.
- Playback musician tabs: Home, Setlist, Assignments, Messages, Practice, Profile.
- Musician admin/planning screens: Planning, PCO, services, people, roles, permissions, proposals, analytics, branch management.
- Rehearsal/live/stems/waveform prototypes in Musician.
- Desktop DAW, CineStage Brain, and stem worker.
- Cloudflare sync Worker for auth, assignments, messages, proposals, setlists, desktop heartbeats, stem jobs, stem assets, and cleanup.

## What Needs Improvement

- One Service Readiness Dashboard.
- Clear service-specific Lead Singer assignment flow.
- Monthly assignment load/fairness view.
- Playback Rehearsal Workspace.
- Shared ChartKit.
- CineStage Cloud desktop-online/fallback job queue UX.
- R2 stem delivery production config.
- Duplicate ` 2.js` file cleanup.
- Release checks for localhost and secrets.
- Worker tests for roles, approval, stem job claims, and cleanup.

## Old Ideas To Preserve

- YouTube worship marker UX from old Playback docs.
- Preset/device setup and section-triggered MIDI from SDK 55 canary.
- Docker-era Demucs safeguards and song analysis pipeline.
- Mixer scene/preset/feedback detection ideas from iCloud.
- Asset indexing for stems, scenes, presets, Kontakt sounds, Ableton sessions, and keyboard libraries.

## First Build Slice

Implemented first slice on 2026-08-01: Playback Admin Dashboard Readiness tab backed by a normalized `/sync/service-readiness?serviceId=...` endpoint.

This connects existing features into one clear product workflow instead of scattering more screens.
