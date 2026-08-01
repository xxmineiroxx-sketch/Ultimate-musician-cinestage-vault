# Apple Notes Idea Inventory - 2026-08-01

## Purpose

This captures product-relevant ideas found in Apple Notes after explicit permission to inspect notes. The scan focused on Ultimate Musician, Ultimate Playback, CineStage, setlists, worship workflows, stems, waveform, mixer, and Planning Center references.

Sensitive note contents were not copied here. Credentials, API tokens, passwords, customer/payment details, and unrelated personal notes are intentionally excluded.

## Relevant Notes Found

- `Ultimate Musician - Admin Login`
- `Service screen`
- `Ultimate Musician Desktop Blueprint (Mac-first)`
- `The CineStage Waveform Visual Engine.`
- `Waveform pipeline`
- `Verification`
- `Details to be fix.`
- `Rules to that I want CineStage to work with`
- `Re-install Cinestage -terminal CLI.`
- Several coding-agent / product-architect prompt notes that mention Ultimate Musician, CineStage, Planning Center, or app build workflows.

## Security Finding

One Apple Note contains live-looking service credentials and API tokens. Do not copy those values into source, Obsidian, Graphify, screenshots, or chat summaries.

Recommended action:

- Rotate all keys found in Apple Notes.
- Move secrets into provider secret stores, `.env` files ignored by git, Apple Keychain, or a password manager.
- Add a repo checklist item: "No secrets in notes/docs/source before release."
- Use EAS secrets, Cloudflare secrets, and local ignored `.env` files for runtime config.

## Product Ideas Captured

### 1. Service Review Workflow

The Service screen note reinforces the current role workflow:

- Every service should record who created it.
- New or edited services should show as pending for Admin/Worship Leader review.
- Admin/Worship Leader should inspect before publishing.
- Once approved, assigned team members receive the message/assignment.
- The Admin dashboard should surface pending services in both Ultimate Musician and, for leaders, Ultimate Playback.

Implementation implication:

- Add `createdBy`, `createdByRole`, `reviewStatus`, `reviewedBy`, `reviewedAt`, and `publishedAt` fields to service records.
- Keep Lead Singer setlist drafting separate from final publish authority.
- Admin/Worship Leader dashboards should prioritize pending review, missing confirmations, blocked members, open proposals, stale sync, and stem readiness.

### 2. Notifications, Reminders, Watch, And Widgets

The notes define a musician notification layer:

- Playback should play a notification tone when a message arrives.
- Assigned team members should receive reminders 3 days before and 1 day before service.
- Apple Watch should eventually show assignment/service notifications and simple playback controls.
- Phone widget should show verse of the day, upcoming services, and assigned/requested roles.

Implementation implication:

- Implemented in Ultimate Playback on 2026-08-01: message notification tone support already exists; service reminders now schedule 3-day and 1-day reminders, and accepted assignments also schedule a service-day reminder.
- Implemented in Ultimate Playback on 2026-08-01: scheduled reminder IDs are persisted so app restarts do not stack duplicate service reminders.
- Implemented in Ultimate Playback on 2026-08-01: Profile now includes musician-controlled notification preferences for message tones, assignment tones, and service reminders.
- Keep Watch/widget integration as a second phase after mobile notification reliability is proven.

### 3. Desktop Organizer Console

The desktop note defines the Mac app as the heavy-duty organizer console:

- Desktop manages songs, setlists, media sources, stems, projects, jobs, exports, and backups.
- iPad stays Host/Live focused.
- iPhone/Playback stays musician focused.
- Desktop should run even when backend is unavailable, with cached library browsing and a clear backend status banner.
- Preferred long-term stack is Tauri + React + TypeScript.

Implementation implication:

- Desktop should become the main local stem processor and live-pack generator.
- Shared logic should move into packages for types, API client, core setlist logic, and reusable UI where practical.
- Desktop exports Live Packs containing setlist, songs, stems, cues, and manifests for iPad/Playback consumption.

### 4. YouTube-To-Stems And Local Heavy Processing

The notes align with the current vision:

- Account holder desktop receives stem-processing requests from iPad/mobile.
- Desktop does heavy work: YouTube/audio import, stem separation, BPM/key/section detection, waveform, cues, and practice parts.
- Cloudflare is fallback only when no desktop worker is available.
- Stems are distributed to assigned users for practice and deleted after the service window unless the account holder chooses local retention.

Implementation implication:

- Implemented on 2026-08-01: desktop worker registry tracks online/offline status, capabilities, queue depth, active job, storage path, and heartbeat timestamps.
- Implemented on 2026-08-01: desktop workers claim stem jobs with a lease before processing; wrong-worker updates are rejected and stale claims can be reclaimed.
- Mobile submits jobs to sync; desktop claims and processes jobs.
- Store only job metadata and short-lived signed download links in cloud.
- Add local cache recognition so repeated songs can publish faster.

### 5. Mixer Scene Intelligence

The mixer notes describe CineStage as a setup assistant and live sound brain:

- Auto-detect mixer IP.
- Load mixer-specific UI/skin/protocol.
- Start from a baseline scene.
- Ask structured setup questions for drums, tom count/sizes, guitars, stereo keys, vocals, monitors, broadcast bus, IEMs, subs, and routing.
- Keep routing stable and avoid forcing destructive scene rewrites.
- Support X32/M32 Ultranet, Wing StageCONNECT, and comparable personal monitor systems from other mixers.

Implementation implication:

- Add a mixer profile model before trying full automation.
- Start read-only: detect mixer, map channels/buses, capture scene snapshot, and recommend changes.
- Require engineer/Admin approval before applying gain, EQ, routing, or scene changes.

### 6. Per-Song Mixer Automation And Cues

The notes define a high-value feature:

- Track names must be editable per service/song.
- Mixer scenes and adjustments should tie to a service and song.
- Users should save per-song automation: volume moves, solo moments, instrument emphasis, FOH notes, lighting/lyrics/sound cues.
- Rehearsal mode can record/prep automation; Live Performance should execute approved cues, not expose record controls.
- Rehearsal and Live Performance should be landscape-oriented.

Implementation implication:

- Add a `SongCueTimeline` model with time, section, target, action, value, owner, approval status, and execution mode.
- Separate rehearsal authoring controls from live execution controls.
- Make FOH notes part of the service publish packet.

### 7. Waveform Pipeline

The notes repeatedly call for a best-in-class waveform pipeline:

- Waveform should be a core differentiator, not a decoration.
- Top waveform toolbar should hold the main live/rehearsal options.
- Stems should appear vertically under the waveform with mute/solo and role-relevant controls.
- Tempo can be tapped or typed manually.

Implementation implication:

- Treat waveform, stems, cues, section markers, tempo, and rehearsal notes as one shared rehearsal/live model.
- Keep Playback musician controls simple.
- Keep Ultimate Musician/iPad controls richer for planning and live direction.

### 8. Role, Branch, And Guest Verification

The verification note describes expected behavior:

- Admin roles require org-owner authority.
- Worship Leader role can be assigned by the proper authority.
- Parent org can manage branch Admin roles.
- Branch Admins cannot remove other branch Admins without proper authority.
- Cross-branch messages should appear in recipient inboxes.
- Guest musician invites should appear in Playback with accept/decline.

Implementation implication:

- Preserve branch-aware role checks in Worker and app UI.
- Add automated tests for role escalation and cross-branch messaging.
- Treat guest invites as assignment records with external-member status.

### 9. CineStage Terminal / Siri-Like Command Layer

The CLI note points to CineStage Terminal as an assistant layer:

- `csai` should execute commands.
- `csai-ui` should expose a local dashboard.
- Local server runs around `localhost:8008`.
- This can become the local "brain" bridge between desktop, code tools, and app ecosystem.

Implementation implication:

- Keep the user-facing app assistant constrained by role permissions.
- Desktop/CineStage can expose commands such as "prepare service", "process stems", "check missing confirmations", and "publish approved setlist".
- Commands that affect people, services, charts, cues, or mixer state must require approval.

## What Can Be Implemented Now

Highest-value next implementation targets:

1. Service review metadata and dashboard filtering.
2. Scheduled service reminders and notification tone preferences.
3. Song cue timeline model for per-song mixer/FOH/live cues.
4. Read-only mixer profile discovery model.
5. Idea Vault / Blueprint Vault inside Admin so notes become structured product memory.
6. Role and branch verification tests.

Implemented on 2026-08-01: shared service time parsing and normalization for `8am`, `8:00am`, `8 pm`, `8:30 PM`, and `20:30` across service creation, reminders, conflict detection, setlist expiry, and widget handoff.
Implemented on 2026-08-01: desktop stem worker registry plus claim/heartbeat leases for single-desktop processing and stale claim recovery.

## Immediate Product Decision

The notes reinforce the existing architecture:

- Ultimate Musician: Admin/Music Director planning and approval.
- Ultimate Playback: Musician assignment, rehearsal, communication, and live-use app.
- CineStage Desktop: local heavy processing, asset intelligence, mixer/waveform/stem brain.
- Cloudflare: always-on sync and fallback processing, not the default expensive stem processor when desktop is online.
