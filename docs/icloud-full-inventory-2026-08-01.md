# iCloud Full Inventory - 2026-08-01

## Purpose

This is the full iCloud and Obsidian inventory pass requested after the product-focused scan. The goal is to avoid losing ideas, old app work, worship resources, charts, audio assets, mixer presets, Graphify output, or old code that can still inform Ultimate Musician, Ultimate Playback, CineStage, and the wider ecosystem.

This document does not commit the full raw manifest because the manifest has more than 1.7 million iCloud files. Instead it records the complete scan counts, the largest folders, the useful categories, and the recommended action for each bucket. The repeatable full scan script can regenerate the raw manifests when needed.

## Full Scan Counts

Scan roots:

- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs`
- `/Users/studio/Documents/ObsidianVault`

Raw counts:

- iCloud directories: 269,232
- iCloud files: 1,736,766
- Obsidian files: 13,975
- Total inventory entries counted: 2,019,973

Important derived counts:

- iCloud document-like files: 188,153
- iCloud music/audio/preset/chart-like files: 37,805
- iCloud planning/spec/report-like documents: 39,832
- iCloud build/dependency/noise files: 1,638,184

The most important finding is that most iCloud file volume is generated code, dependencies, build output, native build folders, or restored package archives. The valuable product ideas and music assets are present, but they are buried inside a very large amount of generated material.

## Largest Top-Level iCloud Folders

| Top-level folder | Files | What it appears to contain | What to do |
| --- | ---: | --- | --- |
| `Ultimate Ecosystem ` | 1,436,583 | Main ecosystem archive, Ultimate Playback, monorepo copies, Ultimate Mixer, dev app, sync work, generated builds | Treat as the main historical source. Extract docs, decisions, and reusable modules. Do not move or delete until indexed. |
| `Desktop` | 286,035 | UltimateMusician consolidated archive, Live Pianos, other desktop-synced material | Extract product specs and music assets. Mark duplicate code packages as archive. |
| `react-native` | 4,301 | Dependency/source package | Noise for product planning. Keep only if needed for old build reconstruction. |
| `Documents` | 1,422 | Kontakt library and other synced docs | Index music libraries and readable docs. |
| `SCENE:PRESETS` | 1,069 | Worship presets, X32/Waves/SQ/X-Air scenes, Ableton/livestream templates | High-value asset library for future CineStage/Ultimate Mixer indexing. |
| `Headers` | 994 | Native build headers | Build noise. Exclude from idea scans. |
| `react-native-web` | 880 | Dependency/source package | Build/dependency noise. |
| `quickbooks backup` | 829 | Business backup material | Not app product material unless business/accounting work is requested. |
| `metro` | 457 | Dependency/source package | Build/dependency noise. |
| `Cifras` | 279 | Likely charts/chord resources | Index as song/chart source candidates. |
| `Downloads` | 57 | General downloads | Review only when filenames match product/music keywords. |
| `Pictures` | 19 | General images | Review only for logos/screenshots/brand assets. |

Many other top-level folders are npm or React Native package names such as `uuid`, `xlsx`, `semver`, `nanoid`, `expo-file-system`, `expo-font`, and `metro-*`. These are not lost app ideas; they are dependency artifacts that should be ignored in product scans.

## File-Type Findings

High-volume file types:

- `js`: 562,439
- `ts`: 166,420
- `map`: 155,245
- `h`: 138,801
- `json`: 116,136
- no extension: 84,588
- `py`: 72,845
- `md`: 61,127
- `kt`: 37,087
- `flow`: 36,383
- `pyc`: 25,102
- `cpp`: 19,500
- `java`: 12,718
- `svg`: 12,685
- `mjs`: 12,398

Music and worship-relevant types:

- `scl`: 11,796
- `aif`: 9,184
- `abc`: 3,438
- `mxl`: 1,600
- `wav`: 567
- `nki`: 823
- `chn`: 400
- `asd`: 9,261
- `pdf`: 351
- `rtf`: 2,168
- `txt`: 8,162

What this means:

- There are enough music/chart/audio/preset files to justify a real local asset indexer.
- There are enough Markdown/spec/report files to justify a real idea and blueprint vault.
- There are enough generated dependency/build files that future scans must separate "source of truth" from generated artifacts.

## What Was Found And What We Can Do With It

### 1. Ultimate Ecosystem Archive

Found:

- Ultimate Playback app copies.
- UltimatePlatform monorepo copies.
- Ultimate Workspace and sync server material.
- Ultimate Dev app material.
- Pool/other business ecosystem material mixed into the same archive.
- Graphify outputs and generated app/build folders.

What we can do:

- Mark one current GitHub repo as source of truth for each app.
- Extract useful docs and decisions into `docs/`.
- Compare old app copies against current app only when a feature is missing.
- Stop treating every old copy as active code.
- Create an "Archive Index" so the app knows where old material lives without copying the whole archive into GitHub.

### 2. Ultimate Musician Consolidated Archive

Found:

- Master blueprints.
- Dev diagnostics docs.
- AI feature assistant TODO.
- Blueprint storage idea.
- Feature request system idea.
- Product vision docs.
- Service plan, cue engine, song pipeline, library/cloud, network/sync, security/roles, device role docs.
- CineStage update package.
- Backend/mobile snapshots and legacy projects.

What we can do:

- Promote Blueprint/Idea Vault into a real Admin feature.
- Use the old master docs as seed content for the in-app blueprint system.
- Keep Admin/Worship Leader approval gates as the rule for publishing.
- Preserve old code as reference, not active production, unless a gap is confirmed.

### 3. Ultimate Playback Historical App

Found:

- Architecture docs.
- YouTube integration docs.
- Auth integration docs.
- V2 completion and integration docs.
- Rehearsal/live mode planning.
- Graphify output for that app.

What we can do:

- Keep Playback focused on musician workflows: assignments, setlist, messages, rehearsal, charts, stems, and live mode.
- Add member-facing "suggest feature" capture later.
- Reuse YouTube/import ideas only through a secure backend or approved pipeline.
- Preserve offline/cache behavior as a product requirement.

### 4. Ultimate Mixer Controller

Found:

- Intelligent workflow API.
- Mixer protocol ideas for X32/M32, Wing, SQ, and GLD.
- Feedback detection and suppression.
- Metering.
- Personal monitor systems.
- Male/female vocal settings.
- Scene analysis.
- Rehearsal guides.
- Ableton channel strips and mix mode docs.
- Tauri/macOS/iOS app experiments.

What we can do:

- Treat Ultimate Mixer as a future engineer/Admin surface, not a Playback feature.
- Build a mixer asset/protocol index before trying live control.
- Preserve feedback detection as a future CineStage Live Ops feature.
- Link mixer scenes and presets to services only after the service worksheet is stable.

### 5. SCENE:PRESETS

Found:

- Worship tech complete collection.
- X32 channel strips by instrument: vocals, drums, bass, acoustic guitar, keys, electric guitar.
- X32/Waves preset packs and guides.
- Livestream templates.
- Ableton, Reaper, Studio One, Pro Tools, Logic, Cubase sessions.
- Hybrid mix templates for QU, SQ, X-Air, and StudioLive.
- Drum samples and trigger presets.
- Gospel templates.

What we can do:

- Build a read-only "Preset Library Index" for CineStage/Ultimate Mixer.
- Tag presets by role: vocals, drums, keys, guitar, bass, livestream, altar, prayer, broadcast.
- Let Admin/Engineer attach a preset recommendation to a service or singer later.
- Do not commit binary presets/audio/session files to GitHub.

### 6. Stems And Audio Assets

Found:

- `/stems`
- `/stems/upgrade`
- AIF/WAV/audio files across presets and sessions.
- Ableton analysis files (`.asd`).
- Kontakt instruments and stage piano/organ/synth libraries.

What we can do:

- Create an asset metadata index with paths, names, type, tags, owner, and readiness.
- Let CineStage suggest assets, but keep actual binaries in iCloud/local storage.
- Add checksum/last-seen metadata later to detect moved or changed files.
- Avoid moving, renaming, or deleting audio libraries from automation.

### 7. Cifras, Charts, And Music Notation

Found:

- `Cifras`
- PDF/TXT/RTF docs.
- `abc`, `mxl`, and other chart/notation-like files.

What we can do:

- Create a song/chart import candidate list.
- Allow Admin/Worship Leader approval before a chart enters the shared library.
- Use chart files as source material for lyrics/chord proposals.
- Avoid direct bulk import until duplicates, copyright/source, and formatting are reviewed.

### 8. Obsidian And Graphify

Found:

- 13,975 Obsidian files.
- `Graphify/Ultimate Musician - Setlist Approval Workflow.md`.
- `Graphify/Ultimate Musician - iCloud Idea Inventory.md`.
- Many generated Graphify node files from other projects.

What we can do:

- Keep durable human-written notes in `docs/obsidian/` and the Obsidian vault.
- Keep generated Graphify output regenerable.
- Add every major idea, decision, and workflow to Markdown before or during implementation.
- Use Graphify as the searchable map, not as the only source of truth.

### 9. Dependency And Build Noise

Found:

- More than 1.6 million files that match build/dependency/noise patterns.
- Root-level package folders in iCloud such as React Native, Metro, Expo modules, UUID, XLSX, Semver, and many npm packages.
- Native build artifacts: headers, pods, maps, object files, compiled cache files, venvs, targets.

What we can do:

- Exclude these from idea scans by default.
- Do not commit them to GitHub.
- Consider moving accidental root-level dependency folders out of iCloud later, but only after confirming no active project relies on them.
- Keep full raw manifests available through the scan script when a forensic pass is needed.

### 10. Business And Non-Music Ecosystem Material

Found:

- Pool/Ultimate Labs material.
- QuickBooks backup.
- DNL pool website/social docs.
- Other business operations docs.

What we can do:

- Do not mix these into Ultimate Musician unless they contain reusable patterns.
- Reusable patterns include: live ops dashboards, route/status workflows, audit templates, feature flags, Graphify/Obsidian discipline, and support workflows.
- Keep separate product boundaries so worship app work does not inherit unrelated business complexity.

## Recommended Product Roadmap From This Scan

### Immediate

- Add an Admin-side Idea/Blueprint Vault to prevent lost ideas.
- Add source path fields to every captured idea.
- Add status fields: `new`, `reviewing`, `planned`, `building`, `done`, `rejected`, `archive`.
- Add owner fields: Ultimate Musician, Ultimate Playback, CineStage, Ultimate Mixer, Sync Worker, Docs/Graphify.
- Add "suggest feature" for team members, separate from "suggest song."

### Next

- Add a local Asset Indexer for iCloud music resources.
- Index but do not move: stems, presets, Ableton sessions, Kontakt libraries, Cifras, PDFs, MusicXML, ABC charts, and mixer scenes.
- Add Admin review before any imported song/chart/preset becomes shared app content.
- Add service worksheet blocks: song, talk, prayer, altar, transition, media, livestream.

### Later

- Build CineStage assistant commands across apps.
- Add YouTube/audio import pipeline through a secure backend.
- Add BPM/key/section/stem readiness jobs.
- Add Ultimate Mixer/CineStage Live Ops for engineer workflows.
- Add venue memory, feedback tracking, scene recommendations, and service-template automation.

## Inventory Manifests

Raw manifests were generated during this pass at:

- `/tmp/icloud_all_dirs_full.txt`
- `/tmp/icloud_all_files_full.txt`
- `/tmp/obsidian_all_files_full.txt`
- `/tmp/icloud_top_file_counts.txt`
- `/tmp/icloud_top_dir_counts.txt`
- `/tmp/icloud_ext_counts.txt`
- `/tmp/icloud_doc_like_files_full.txt`
- `/tmp/icloud_music_asset_files_full.txt`
- `/tmp/icloud_planning_docs_full.txt`

These `/tmp` files are not durable. Regenerate them with:

```bash
scripts/icloud-full-inventory.sh
```

## Rule Going Forward

Nothing important should live only in iCloud, only in chat, or only in generated Graphify output.

Every serious idea should have:

- a Markdown note,
- a source path,
- a product owner,
- a status,
- a priority,
- and a next action.

