# Deep App Feature Inventory - 2026-08-01

## Purpose

This document inventories the current Ultimate Playback, Ultimate Musician, and CineStage Desktop code against older repo backups, iCloud folders, and previously captured idea docs. The goal is to show what already exists, what exists only as a prototype or archived idea, and what should be improved before building more features.

This is intentionally implementation-focused. It avoids relisting every file and instead groups source-backed capabilities into product areas.

## Scope Checked

### Current repo source

- `apps/ultimate_playback`
- `apps/primary_app/ultimate_musician_full_project_v3/mobile`
- `apps/ultimate_daw`
- `apps/ultimate_playback/cloudflare/ultimate-playback-sync/worker.js`
- repo docs under `docs/`

### Older repo backups checked

- `apps/primary_app/ultimate_musician_full_project_v3/mobile_before_restore_2026-02-13`
- `apps/primary_app/ultimate_musician_full_project_v3/mobile_backup_before_consolidated_restore_2026-02-21`
- `apps/primary_app/ultimate_musician_full_project_v3/mobile_sdk55_canary_backup_2026-02-21`

### iCloud / external sources referenced from prior scans

- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Desktop/ultimate_playback`
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Utimate Musician app`
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Desktop/UltimateMusician_CONSOLIDATED`
- `/Users/studio/cinestage-main-clean`

## Source Size Snapshot

Source files checked in the focused current app scan:

- Ultimate Musician mobile source area: about 202 files.
- Ultimate Playback source area: about 85 files.
- CineStage/Ultimate DAW desktop source area: about 50 files.
- Cloudflare sync worker: 1 main Worker file.
- Total focused app source files scanned: 338.

The wider repo and Graphify scan are much larger because they include generated files, native folders, dependency trees, caches, and historical output. Those should not drive product decisions directly.

## High-Level Product Map

### Ultimate Musician

Role: admin, worship leader, music director, planning, approval, rehearsal/live authoring, integrations, advanced CineStage control.

Current app routes include:

- Auth and profile: Landing, Login, Register, Verify, Profile, Settings.
- Library: Library, NewSong, SongDetail.
- Planning: Planning, PlanningCenter, PCOImport, PCOIntegration, NewService, ServicePlan, ServiceFeedback, SongPlanDetail, Setlist, Calendar, Checklist, BlockoutCalendar, Proposals, AvailabilityHeatmap, PlanTeam, LiveService.
- People and org: PeopleRoles, PersonProfile, RoleSelect, Permissions, Organization, MessageCenter.
- Audio/live/stems: Mixer, MixerConsole, Live, LiveMode, Rehearsal, Performance, StemsCenter, StemMixer, Studio, WaveformDetail, StageDisplay, DronePad, KeyChange, PartSheet, SectionMapping, SongMap.
- Presets and gear: Presets, FatChannelPresets, PresetEditor, PresetLibraryBrowser.
- CineStage: CineStage, CineStageDashboard, BridgeSetup, ExternalSync, CueGrid, MusicDirectorRemote.
- Admin system: DeviceRole, DeviceSetup, BranchManager, BranchSetup, CentralAdmin, AnalyticsDashboard, SystemMap, Diagnostics, TestMode, SuggestFeature, Billing, NotificationPrefs, Webhooks.

Judgment: this app already contains most of the admin/music-director vision, but the UX needs consolidation into fewer command-center flows.

### Ultimate Playback

Role: musician-facing assignments, rehearsal, setlist, messages, practice, and limited leadership actions when role-granted.

Current routes include:

- Auth: Login, Register, Verify, ResetPassword.
- Main musician tabs: Profile, Home, Setlist, Assignments, Messages, Practice.
- Supporting screens: ProfileSetup, BlockoutCalendar, LivePerformance, LyricsView, SetlistRunner, Feedback.
- Leadership surfaces: AdminDashboard, LeaderDashboard, ContentEditor.
- CineStage: CineStageBrain.

Judgment: Playback has the right base for musicians. It should not absorb the full admin app. It should expose only the leadership features needed for Admin/Worship Leader/Lead Singer roles.

### CineStage Desktop / Ultimate DAW

Role: desktop processing node, local cache, DAW/stems workspace, CineStage brain, and future heavy-processing hub.

Current routes include:

- Auth/profile: Login, Register, Verify, ResetPassword, Profile.
- Musician parity: Home, Assignments, Blockout, Setlist, Messages, Practice, Lyrics, Setlist Runner, Live Performance.
- Leadership: Admin, Leader, Content Editor, Feedback.
- CineStage/Desktop: CineStage Brain, DAW workspace.
- Main process: Electron main/preload, audio handlers, file handlers, store handlers, stem handlers, background stem worker.

Judgment: this is the right source of truth for desktop. Older desktop apps are reference material, not primary code.

## Already Have

### Role and approval workflow

- Admin/Worship Leader can review submitted setlists.
- Lead Singer/setlist creator grants exist in the Worker.
- Setlist submission exists through `/sync/setlist/submit`.
- Approval exists through `/sync/setlist/approve`.
- Rejection with notes exists through `/sync/setlist/reject`.
- Approved setlists can be published to assigned team members.
- Worker exposes `/sync/grant`, `/sync/setlist/creator`, `/sync/grants`, and `/sync/setlist/creators`.

Improve:

- Make the service-specific Lead Singer assignment visually explicit.
- Show a review timeline: Draft -> Submitted -> Needs Changes/Approved -> Published.
- Add notifications around each status change.

### Team assignments and fairness tracking

- Playback has Assignments and accept/decline flows.
- Playback has BlockoutCalendar.
- Worker exposes `/sync/assignments` and `/sync/assignment-stats`.
- Musician has PlanTeam with Planning Center team status and blockout lookup.
- Musician has AvailabilityHeatmap.

Improve:

- Build a monthly assignment load view into AdminDashboard/LeaderDashboard.
- Show role-specific load, not only person totals.
- Flag overused, unavailable, declined, and not-yet-confirmed members before publish.

### Song suggestions and content proposals

- Playback ContentEditor lets privileged users patch content directly.
- Non-privileged users submit proposals through `/sync/proposal`.
- Worker supports proposal approve/reject.
- Musician ProposalsScreen reviews lyrics, chord charts, instrument parts, and keyboard rigs.
- Worker supports pending song suggestions through `/sync/library/song-propose`, `/sync/library/pending-songs`, approve, and reject.

Improve:

- Rename this workflow in the UI as "Suggestions & Fixes" so regular musicians understand it.
- Add status visibility for the person who submitted the suggestion.
- Add side-by-side review for old chart versus proposed chart.

### Setlists and charts

- Playback SetlistScreen pulls and caches service bundles.
- Playback merges setlist with library data.
- Playback has transpose utilities, capo handling, chord display, lyrics/charts, and role-specific parts.
- Musician has Setlist, ServicePlan, SongPlanDetail, PartSheet, SongMap, SectionMapping.
- Older preset integration docs describe key-change, section mappings, device setup, and test mode.

Improve:

- Create one shared ChartKit for Playback, Musician, and Desktop.
- Add Nashville/Number chart mode.
- Add PDF import/export.
- Add annotation mode.
- Add chord diagrams later if it does not clutter Playback.

### Rehearsal, stems, and live playback

- Musician has Rehearsal, Performance, StemMixer, StemsCenter, Studio, WaveformDetail, Live, LivePerformance, and LiveService.
- Musician docs define rehearsal-to-live waveform pipeline, role-based stem visibility, practice mode, marker editing, loop regions, and live read-only restrictions.
- Musician docs define predictive jump engine, quantized intent queue, latency calibration, marker AI assist, automation lane dots, diff history, and rollback.
- Playback has PersonalPractice, LivePerformance, SetlistRunner, lyrics view, and setlist practice entry points.
- Desktop has PersonalPractice, SetlistRunner, LivePerformance, DAWWorkspace, and stem worker.

Improve:

- Build a simple Playback Rehearsal Workspace from existing pieces.
- Keep advanced authoring in Musician/iPad/Desktop.
- Make musician practice packet obvious: chart, part, stem, loop/section, notes.
- Require approval before AI/audio-derived stems or cues reach the team.

### Desktop-primary stem processing

- Worker supports desktop heartbeat, desktop listing, stem job creation, job claim leases, update, approve, publish, cleanup, reject, source upload/download, and asset upload/download.
- Desktop worker exists at `apps/ultimate_daw/src/main/workers/stemJobWorker.js`.
- Desktop worker sends heartbeat, polls queued jobs, claims work, runs Demucs, uploads R2 assets when configured, writes local cache, and updates Worker status.
- Repo docs define temporary retention and two-hour post-service cleanup.

Improve:

- Configure Cloudflare R2 binding `STEM_ASSETS` for production downloads.
- Add visible queue/retry/failure states to CineStage Cloud UI.
- Port Docker-era Demucs hardening from `/Users/studio/cinestage-main-clean`.
- Keep YouTube downloading disabled by default unless a compliant source flow is implemented.

### Planning Center and external integrations

- Musician has PCOIntegrationScreen.
- planningCenterService handles service types, upcoming plans, plan items, people, song library, scheduling, statuses, blockouts.
- PCOImport/PlanningCenter/PlanTeam screens exist.
- PCO song import stores data like title, author, themes, CCLI number.

Improve:

- Make PCO the first polished external integration.
- Decide whether Playback gets direct PCO visibility or only published service bundles.
- Add SongSelect/CCLI as phase two.
- Add ProPresenter/MIDI export after the readiness workflow is stable.

### Notifications, watch, widgets

- Playback has push notification service, notification sounds, MessageNotificationWatcher, PushNotificationManager, widgetDataWriter, watchBridge.
- Apple Notes inventory captured message tones, assignment tones, 3-day and 1-day service reminders, service-day reminders, Watch, and widgets.
- Notification preferences exist in Playback and Musician.

Improve:

- Verify notification behavior on real TestFlight installs.
- Keep Watch/widget as phase two after mobile notifications are reliable.
- Add service-status notifications: assigned Lead Singer, setlist submitted, approved, needs changes, published.

### Mixer, presets, MIDI, and live cues

- Musician has Mixer, MixerConsole, Presets, FatChannelPresets, PresetEditor, PresetLibraryBrowser, DeviceSetup, KeyChange, TestMode, CueGrid, ExternalSync, MusicDirectorRemote.
- Services exist for cueDispatcher, cueMapper, cueSync, MIDI clock, ProPresenter MIDI map, controller map, fat-channel presets.
- Older preset integration docs describe Nord, MODX, Kemper, Helix, Axe-FX, Strymon, Ableton, Pro Tools, MainStage, section-triggered presets, and auto-transpose.
- iCloud mixer docs contain intelligent mixer workflow, feedback detection, personal monitors, metering, scene analysis, vocal settings, and mix-mode presets.

Improve:

- Start with read-only mixer discovery and scene snapshot.
- Add approval before any live mixer write action.
- Create a SongCueTimeline model for approved per-song cues.
- Keep full mixer automation out of Playback until it is stable.

### CineStage brain and assistant layer

- Playback has CineStageBrain screen and status.
- Musician has CineStage and CineStageDashboard.
- Desktop has CineStageBrainScreen and BrainPanel.
- Apple Notes describe `csai`, `csai-ui`, and local `localhost:8008` command bridge.
- Doctrine says AI assists, humans publish.

Improve:

- Build commands around existing workflows first: prepare service, check missing confirmations, process stems, inspect readiness, draft setlist.
- Require role checks and approval for publish, message, chart, cue, mixer, and stem actions.
- Store assistant outputs as reviewable drafts, not automatic changes.

## Partial Or Prototype

- AI setlist composer: concept exists, but no finished Playback workflow found.
- AI theology/song health/gap analysis: competitor-level concept exists from research, but not productized.
- Full ChartBuilder/OnSong-level chart tools: transpose exists, but annotations/PDF/Nashville/foot-pedal polish is missing.
- Full multitrack live competitor parity: advanced Musician prototype exists, but Playback release flow is not yet finished.
- Voice/Siri-like app control: concept and desktop command layer exist, but no production role-gated app assistant found.
- SongSelect/CCLI: CCLI number data appears in PCO import, but full reporting/import is not a finished flow.
- ProPresenter/lights export: cue/MIDI groundwork exists, but product workflow needs definition.
- Mixer automation: lots of ideas and screens exist, but live-safe write automation should wait.

## Older Ideas Worth Recovering

### From old Playback iCloud app

- YouTube player screens and docs describe iPhone-specific media player UX, worship markers, haptics, PiP, search, playlists, and cache.
- This should not become a public YouTube-downloader feature. It should become an input to the desktop/local source-prep and rehearsal marker workflow.

Recommended recovery:

- Reuse worship marker UX ideas.
- Reuse YouTube search/import as metadata and source request flow.
- Avoid storing API keys in source.

### From old Musician backups

- Early app focused on NewSong -> stems job, MixerScreen faders, LiveScreen global waveform, section buttons, Click/Guide/Pad toggles, and expo-av playback.
- SDK 55 canary added device setup, preset management, section mappings, preset library, key change, test mode, and device status.

Recommended recovery:

- Treat the backups as proof of intent, not source of truth.
- Keep current app source as canonical because it already absorbed most of these ideas.
- Review old `DeviceStatusBar` and preset integration only if the current live screen lacks a clear device status view.

### From Docker-era CineStage

- Demucs safeguards: GPU/CPU preference, CPU fallback, segment retry, subprocess isolation, model cache, memory cleanup.
- Redis/Celery/FastAPI local processing pattern for future mini PC/Mac server.
- Song pipeline: waveform, tempo, key, structure, chords, cues, click, performance graph.
- MIDI preset and instrument-chart generation workflows.

Recommended recovery:

- Port Demucs hardening into Electron desktop worker first.
- Keep FastAPI/Celery as optional future local server mode.
- Reuse song analysis and MIDI/chart generation only behind review/approval.

### From iCloud mixer and asset folders

- Scene/preset libraries, X32/Wing/Allen & Heath references, Kontakt/Live Pianos/Ableton assets, vocal settings, monitor systems, feedback detection.

Recommended recovery:

- Build an Asset Index first.
- Make it read-only at first.
- Let CineStage recommend presets/scenes/cues after indexing.
- Do not move, delete, or rewrite user asset folders without explicit approval.

## Structural Risks Found

### Duplicate " 2.js" files

The current source includes many files named like `Something 2.js`.

Many are byte-identical backups. Some are different:

- Playback divergent duplicates:
  - `AuthContext 2.js`
  - `roleUtils 2.js`
  - `CineStageBrainScreen 2.js`
  - `UltimateWaveform 2.js`
- Musician divergent duplicates:
  - `audioEngine/modules/Loader 2.js`
  - `components/CineStageBrainStatus 2.js`
  - `components/ProTrackFader 2.js`
  - `components/ProMixerConsole 2.js`
  - `services/waveformService 2.js`
- Desktop duplicates are currently identical for `main 2.js`, `preload 2.js`, and backend audio index.

Risk:

- Metro, Graphify, search, and future engineers see duplicated surfaces.
- Divergent duplicates can hide older logic that should either be merged or archived.

Recommendation:

- Create a cleanup branch.
- Compare divergent files one-by-one.
- Move true backups to `docs/archive/code-recovery/` or delete after commit history confirms they are not needed.
- Do not delete until each divergent file is reviewed.

### Localhost and secret handling

Findings:

- `apps/ultimate_daw/src/main/workers/stemJobWorker.js` defaults to `http://127.0.0.1:8099`.
- Older mobile source has `apiBase: "http://localhost:8000"`.
- Docs note Apple Notes contained live-looking credentials and tokens. Values were not copied into repo docs.
- Desktop renderer config uses sync secret headers.

Risk:

- Production builds must not silently point to localhost.
- Secrets must stay in provider secret stores, EAS secrets, Cloudflare secrets, Keychain, or ignored `.env` files.

Recommendation:

- Add a release check that fails when production builds contain localhost fallback.
- Rotate secrets found in Apple Notes.
- Document required env vars per app.

### Test and release confidence

Known from prior repo audit:

- Expo doctor passed for root and nested Playback at the time of the prior audit.
- Web export passed at that time.
- Native simulator was later blocked by CoreSimulator/simdiskimaged issues on this machine.
- Dependency audit reported vulnerabilities tied to transitive Expo tooling, and forced audit fix would jump SDK versions.

Recommendation:

- Keep SDK upgrades planned, not forced.
- Add a real-device/TestFlight smoke checklist for auth, assignments, setlist approval, proposals, notifications, and stems.
- Add Worker endpoint tests for role escalation, setlist approval, assignment stats, stem job claims, and cleanup.

## Priority Improvement List

### P0 - Must do before adding more large features

1. Build Service Readiness Dashboard. Implemented in first Playback/Worker slice on 2026-08-01 with `/sync/service-readiness` and Playback Admin Readiness tab.
2. Continue normalizing service packet data between Musician, Playback, Desktop, and Worker.
3. Clean or archive duplicate ` 2.js` files after review.
4. Add release env validation for localhost/secrets.
5. Add Worker smoke tests for approval and stem-job state transitions.

### P1 - Highest product value

1. Polish Lead Singer assignment flow.
2. Add monthly assignment load/fairness view.
3. Build Playback Rehearsal Workspace from existing setlist/practice/stem/chart pieces.
4. Productize CineStage Desktop online/cloud fallback job queue.
5. Configure R2 temporary stem delivery for production.

### P2 - Differentiators

1. Port Docker-era Demucs hardening.
2. Build shared ChartKit.
3. Add AI draft setlist/rehearsal assistant with approval.
4. Build read-only asset index for stems, presets, scenes, and keyboard libraries.
5. Add SongCueTimeline for approved cues, MIDI, lyrics, lights, and FOH notes.

### P3 - Later roadmap

1. SongSelect/CCLI integration and reporting.
2. ProPresenter export/sync.
3. Watch and widgets.
4. Mixer write automation.
5. Public catalog or MultiTracks-style marketplace.

## Best Next Build

Build the Service Readiness Dashboard first.

This is the best next step because it uses existing code instead of creating a new feature island. It connects:

- Lead Singer assignment.
- Setlist drafts and approvals.
- Team assignments and monthly rotation counts.
- Song/content proposals.
- Missing charts/lyrics/parts.
- Stem processing route and job state.
- Publish readiness.
- Playback member practice packet state.

The dashboard should become the bridge between Ultimate Musician, Ultimate Playback, CineStage Desktop, and Cloudflare.

## Suggested Implementation Shape

### Worker

- Added one `/sync/service-readiness?serviceId=...` endpoint.
- Response should include service meta, review status, team status, assignment stats, proposals, chart completeness, stem jobs, desktop route, and publish status.

### Playback

- Added a compact readiness tab in AdminDashboard/LeaderDashboard.
- For normal members, show only "My Readiness" on Home/Practice.

### Musician

- Add full readiness command center in ServicePlan or Planning.
- Keep deep admin controls here, not in normal Playback.

### Desktop

- Add processing queue and local cache panel in CineStage/DAW.
- Show whether jobs are desktop, waiting for desktop, cloud fallback, processing, ready for review, approved, published, expired, failed, or rejected.

## Product Decision

Do not rebuild what already exists. The next phase should be integration, cleanup, and productization:

- Connect the workflows.
- Simplify Playback.
- Make Musician the command center.
- Make Desktop the processor.
- Make Cloudflare the coordinator/fallback.
- Make Graphify/Obsidian the durable memory.
