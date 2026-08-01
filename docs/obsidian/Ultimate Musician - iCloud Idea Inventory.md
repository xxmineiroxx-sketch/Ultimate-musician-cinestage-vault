# Ultimate Musician - iCloud Idea Inventory

Date: 2026-08-01

Decision: iCloud contains important Ultimate Musician, Ultimate Playback, CineStage, mixer, preset, stem, Graphify, and Obsidian material that should be preserved as a product backlog, not left only in old folders.

Primary sources checked:
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs`
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem `
- `/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Desktop/UltimateMusician_CONSOLIDATED`
- `/Users/studio/Documents/ObsidianVault`

High-value ideas found:
- CineStage should become the assistant brain across songs, services, stems, cues, charts, teams, assets, and approvals.
- The ecosystem needs a living Blueprint / Ideas system so raw ideas become searchable specs, feature requests, decisions, and roadmap items.
- Older docs describe YouTube/audio input, stems, BPM/key/section detection, click, guide, drone pad, chord charts, transposition, ProPresenter, and Choir Builder.
- Older docs describe service worksheets with blocks beyond songs: song, talk, prayer, altar, transitions, and media.
- Ultimate Mixer archives contain future live sound intelligence: mixer protocol support, auto gain/EQ/balance, feedback detection, venue memory, scene analysis, personal monitors, and livestream/broadcast presets.
- iCloud has large local asset libraries for stems, scene presets, Waves/X32/SQ material, Ableton templates, Live Pianos, and Kontakt libraries. These should be indexed as metadata before any app tries to move or import the binaries.

Immediate backlog:
- Keep setlist approval as the current app behavior.
- Add Admin-side Idea / Blueprint storage so ideas are never lost again.
- Add member-facing feature suggestion capture separate from song suggestion capture.
- Add an asset index for local stems, presets, scenes, and keyboard libraries.
- Keep Graphify/Obsidian updated after workflow or architecture changes.

Repo detail:
- Full inventory note: `docs/icloud-idea-inventory-2026-08-01.md`
- Repeatable scan script: `scripts/icloud-idea-scan.sh`

Capture rule:
- Every new idea should become a Markdown note, have a source path, be classified as Now/Next/Later/Archive, be assigned to an app owner, then be indexed by Graphify and pushed to GitHub.

