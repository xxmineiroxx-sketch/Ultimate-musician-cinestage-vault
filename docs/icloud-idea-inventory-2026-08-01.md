# iCloud Idea Inventory - 2026-08-01

## Purpose

This inventory captures Ultimate Musician / Ultimate Playback / CineStage ideas and ecosystem assets found in iCloud so they are not lost in old folders, duplicate packages, or generated Graphify exports.

The scan focused on product-relevant material. It avoided deep inspection of unrelated personal folders and treated dependency folders, build artifacts, caches, and regenerated Graphify node dumps as noise unless their parent folder clearly belonged to the music ecosystem.

## Scan Scope

Primary roots checked:

- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs`
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem `
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Desktop/UltimateMusician_CONSOLIDATED`
- `/Users/studio/Documents/ObsidianVault`

Inventory counts from the pruned scan:

- iCloud readable documents: 10,350
- Product-relevant iCloud directories: 540
- Obsidian files: 13,974
- Ultimate Ecosystem readable docs: 1,513
- UltimateMusician consolidated readable docs: 320

Pruned noise examples:

- `node_modules`
- `.git`
- `.expo`
- `Pods`
- `Headers`
- `DerivedData`
- `build`
- `dist`
- `cache`
- generated Graphify node dumps when they were not manually written product docs

## Highest-Value Sources

### Ultimate Musician Consolidated Archive

Source:

`/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Desktop/UltimateMusician_CONSOLIDATED/UltimateMusician_CONSOLIDATED/UltimatePlatform_MERGED_REPO_v1/Ultimate Musician app`

Important subfolders:

- `legacy_packages/UltimateMusician_StarterAndDocs_Package`
- `legacy_packages/UltimateMusician_MasterPackage_v1_UIConceptAdded`
- `legacy_packages/UltimateMusician_CineStage_Update_v1`
- `legacy_packages/ultimate_musician_project/docs`
- `docs/ultimate_musician_specs`
- `docs/ultimate_musician_sources`
- `ultimate_musician/services/musician-api/docs`

Ideas captured:

- Ultimate Musician should be the admin/music-director command app.
- Ultimate Playback should stay the musician-facing app for assignments, setlists, rehearsal, messages, and live mode.
- CineStage should become the intelligent music brain that understands songs, stems, waveforms, cues, sections, service plans, and team readiness.
- The ecosystem needs durable in-app blueprint storage so the app can preserve its own specs, decisions, workflows, and roadmap.
- Feature requests should become structured records with AI summaries, categories, complexity, implementation suggestions, and admin approval/status.
- AI-generated service, chart, cue, and feature-planning outputs must be human-reviewed before publishing.

### Ultimate Playback iCloud App

Source:

`/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Desktop/ultimate_playback`

Important files:

- `ARCHITECTURE.md`
- `README_YOUTUBE.md`
- `YOUTUBE_INTEGRATION_SETUP.md`
- `MINIMAL_YOUTUBE_SETUP.md`
- `ULTIMATE_PLAYBACK_V2_COMPLETE.md`
- `COMPLETE_INTEGRATION.md`

Ideas captured:

- Playback should keep Home, Assignments, Setlist, Messages, and More as the musician core.
- Playback should support cached/offline assignment, service, setlist, message, and preference data.
- Playback should offer rehearsal and live performance modes, with reference, practice, click, and live playback modes.
- YouTube import/search should be treated as an input into worship-specific section markers and rehearsal prep, not just a generic video player.
- Future YouTube work should avoid storing API keys in source and should be wired through secure environment configuration.

### Ultimate Mixer Controller

Source:

`/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Ultimate Mixer controller`

Important files/folders:

- `umixer_v7/INTELLIGENT_WORKFLOW_API.md`
- `umixer_v7/FEEDBACK_DETECTION.md`
- `umixer_v7/PERSONAL_MONITOR_SYSTEMS.md`
- `umixer_v7/METERING_FEATURE.md`
- `umixer_v7/MALE_FEMALE_VOCAL_SETTINGS.md`
- `umixer_v7/SCENE_ANALYSIS_COMPLETE.md`
- `ultimate_mixer_controller_full_v7*/docs/ABLETON_CHANNEL_STRIPS.md`
- `ultimate_mixer_controller_full_v7*/docs/MIX_MODE_SELECTION.md`
- `templates/allen_heath_sq/SQ Hybrid Template/SCENES`

Ideas captured:

- Mixer control should eventually be part of the wider CineStage brain, but not mixed into the musician-facing Playback UI too early.
- There is prior work for an 8-step intelligent mixing workflow: connect/scan, detect instruments, monitor levels, auto gain, auto EQ, balance, bus setup, and broadcast mix.
- Feedback detection/suppression can become a live safety feature with venue memory, channel history, common frequencies, alerts, and optional notch-filter automation.
- Personal monitor systems, metering, scene analysis, male/female vocal settings, and mix-mode presets are useful future integrations for rehearsal/live readiness.
- X32/M32, Wing, Allen & Heath SQ, and GLD support appear in old planning docs and should be treated as supported-protocol candidates, not assumed production-ready.

### Scene, Preset, Stem, and Audio Asset Libraries

Sources:

- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/SCENE:PRESETS`
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/stems`
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Desktop/Live Pianos 4.0`
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Documents/Kontakt Library`

Important asset groups:

- Worship tech complete collection
- WSG Waves presets package
- X32 presets and firmware docs
- Waves live template presets
- Livestream Ableton projects
- Live Pianos 4.0
- Kontakt libraries including stage pianos, organs, synths, and worship-oriented keyboard sounds

Ideas captured:

- CineStage should eventually index local worship assets as reusable service resources: stems, scene presets, keyboard sounds, Ableton templates, mixer presets, and reference guides.
- The app should store metadata for assets before attempting heavy audio analysis: title, type, source folder, compatible mixer/app, tags, service use case, and approval/readiness status.
- Asset import should be read-only at first. Do not move, delete, or rewrite these iCloud libraries from the app without explicit user approval.
- Preset and scene packs can power future suggestions such as "use this vocal preset for this singer," "use this scene for livestream," or "this service needs a broadcast mix profile."

### Obsidian and Graphify

Sources:

- `/Users/studio/Documents/ObsidianVault`
- `/Users/studio/Documents/ObsidianVault/Graphify`
- repo `graphify-out/`

Findings:

- Obsidian is already being used as a Graphify target.
- `Graphify/Ultimate Musician - Setlist Approval Workflow.md` now preserves the setlist approval decision.
- The vault also contains large generated Graphify exports from other projects. Those are useful for search but should not be treated as hand-written product strategy by default.

Decision:

- Keep a repo copy of durable project notes in `docs/obsidian/`.
- Keep generated Graphify artifacts in `graphify-out/`, while ignoring Graphify cache.
- Add future user ideas to durable Markdown first, then let Graphify/Obsidian index them.

## Product Opportunities To Preserve

### 1. CineStage as the Brain

Make CineStage the intelligence layer across the ecosystem:

- Understand songs, keys, BPM, sections, cues, stems, charts, lyrics, and service context.
- Understand team roles, availability, assignment history, readiness, and approvals.
- Understand assets: scenes, presets, templates, stems, keyboard sounds, and mixer configurations.
- Recommend actions but require Admin/Worship Leader approval for publishing.
- Provide assistant-style commands inside apps, similar to Siri, without bypassing role rules.

Recommended first app-facing commands:

- "Prepare this service."
- "Find songs that fit this key and team."
- "Show who has served too many times this month."
- "Draft a setlist for review."
- "Check missing confirmations."
- "Suggest chart cleanup for this song."
- "Prepare rehearsal notes for each musician."

### 2. Living Blueprint / Idea Vault

The older master blueprint clearly describes an in-app knowledge system:

- `BlueprintDoc`: stores specs, decisions, pricing, org rules, audio engine docs, and workflows.
- `FeatureRequest`: stores raw ideas, AI-enriched summaries, complexity, implementation notes, and status.
- Admin panel can review, analyze, approve, reject, or promote feature requests into roadmap work.

This is important because it directly solves the user's problem of losing ideas. It should become a real feature, not just documentation.

Recommended implementation path:

- Add a lightweight idea/blueprint store to the sync Worker first.
- Add Admin Panel views for "Ideas", "Blueprints", and "Decisions".
- Allow Playback members to suggest feature ideas separately from song suggestions.
- Use AI only to summarize and structure ideas; Admin/Worship Leader or owner still approves roadmap status.

### 3. Song Pipeline AI

Older docs describe this pipeline:

- YouTube or uploaded audio input.
- Stem separation.
- BPM/key detection.
- Section detection.
- Click, guide, drone pad, and cue generation.
- Chord/lyrics support with transposition.
- ProPresenter integration later.
- Choir Builder later for soprano/alto/tenor and harmony parts.

Recommended current-product framing:

- Ultimate Musician owns import, analysis jobs, approval, and library publishing.
- CineStage owns analysis and cue intelligence.
- Ultimate Playback consumes approved charts, stems, cues, and rehearsal views.

### 4. Service Worksheet / ProPresenter-Like Planning

Older docs reference a ProPresenter-like service worksheet.

Recommended shape:

- Service plan includes songs, talks, prayer, altar, communion, announcements, transitions, and cues.
- Each block can have owner, time estimate, notes, required media, chart/stem readiness, and publish status.
- Setlist is one part of the service, not the whole service.

This fits the newly implemented Lead Singer workflow: Lead Singer can prepare the music portion, while Admin/Worship Leader approves and publishes the full service plan.

### 5. Automation Presets

Older docs list service block presets:

- Song
- Talk
- Prayer
- Altar

Expand into:

- Song block: key, BPM, arrangement, click, guide, stems, lyrics, chords, cues.
- Talk block: microphone, timer, lower-third, recording/livestream note.
- Prayer block: pad, camera/lights/mix preset, leader, duration.
- Altar block: loop/pad, flexible timing, team notification, soft-transition behavior.

These should start as planning metadata, then later connect to mixer, playback, lights, and ProPresenter.

### 6. Mixer and Live Sound Intelligence

The Ultimate Mixer archive contains a useful future track:

- Mixer protocol discovery.
- Instrument detection.
- Auto gain/EQ/balance.
- Feedback detection and venue memory.
- Broadcast mix and livestream templates.
- Personal monitor support.
- Scene and preset library management.

Recommended product boundary:

- Do not overload Playback with full mixer control.
- Create a separate "CineStage Live Ops" or "Ultimate Mixer" surface for engineers/Admins.
- Playback can receive simple musician-safe signals: "ready", "check your level", "monitor mix available", "feedback alert", "scene changed".

### 7. Asset Indexer

The iCloud scan found many reusable audio/live resources. The next practical step is not to import all binaries into GitHub. It is to index them.

Recommended fields:

- `id`
- `name`
- `assetType`
- `sourcePath`
- `tags`
- `compatibleWith`
- `serviceUseCase`
- `owner`
- `readiness`
- `notes`
- `lastVerifiedAt`

Do not commit large audio libraries, Kontakt libraries, or Ableton projects to the app repo. Commit only metadata, docs, and small fixtures.

## Current Gaps Compared With iCloud Ideas

- The app now supports setlist approval, song suggestions, musician chart proposals, and assignment tracking, but it does not yet have a durable "idea vault" or "blueprint docs" feature.
- CineStage is present as a concept and code surface, but not yet the full cross-app assistant brain.
- YouTube import and audio-to-stems pipeline are documented in old iCloud folders but not production-ready in the current app.
- Mixer intelligence has substantial old planning and prototypes, but should stay a later surface until core sync/release reliability is stable.
- Obsidian and Graphify are updated manually today; there is not yet a formal "every decision becomes a note" app workflow.

## Apple Notes Addendum

Apple Notes were scanned after explicit permission. The sanitized inventory is captured in:

- `docs/apple-notes-idea-inventory-2026-08-01.md`
- `docs/obsidian/Ultimate Musician - Apple Notes Idea Inventory.md`

Additional product ideas found there:

- Service review should include creator tracking and pending approval visibility.
- Playback should support notification tones, 3-day reminders, 1-day reminders, future Apple Watch controls, and a phone widget.
- Desktop should be the Mac-first Organizer Console and local heavy-processing worker.
- YouTube-to-stems should prefer account-holder desktop processing, with Cloudflare fallback only when no desktop worker is available.
- Mixer scene intelligence should start read-only, then apply changes only after Admin/Engineer approval.
- Rehearsal mode can author cue automation, while Live Performance executes approved cues without record controls.
- Waveform, stems, sections, tempo, cues, and rehearsal notes should become a unified model.

Security finding:

- At least one Apple Note contains live-looking credentials and API tokens. Those values were not copied into repo docs. Rotate them and move runtime secrets into proper secret stores before release.

## Recommended Backlog

### Now

- Keep setlist approval workflow as the immediate app behavior.
- Add an "Ideas / Blueprint" doc system to the admin side.
- Add a repeatable iCloud idea scan script so future audits do not rely on memory.
- Keep Graphify and Obsidian updated after workflow or architecture changes.

### Next

- Add feature request capture in Playback and Admin Panel.
- Add Admin Panel review for suggested features, with status and owner.
- Add basic asset index metadata for iCloud stems, scenes, presets, and keyboard libraries.
- Add service worksheet blocks beyond songs: talk, prayer, altar, transitions, and media.

### Later

- Implement YouTube/audio import as a secure, approved pipeline.
- Add CineStage analysis jobs for BPM/key/sections/cues/stems readiness.
- Add mixer/live sound intelligence as an engineer/Admin surface.
- Add venue memory for feedback, scenes, presets, and service templates.
- Add ProPresenter/livestream integration after the service worksheet is stable.

## Durable Capture Rule

When a new idea appears in chat, iCloud, Obsidian, or an app prototype:

1. Capture it in a Markdown note under `docs/` or `docs/obsidian/`.
2. Link the source folder or file path.
3. Classify it as Now, Next, Later, or Archive.
4. State which app owns it: Ultimate Musician, Ultimate Playback, CineStage, Ultimate Mixer, Sync Worker, or Obsidian/Graphify.
5. Run Graphify after meaningful changes.
6. Commit and push the repo copy so GitHub becomes the durable source.
