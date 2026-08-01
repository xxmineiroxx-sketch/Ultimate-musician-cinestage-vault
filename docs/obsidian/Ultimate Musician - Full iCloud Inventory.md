# Ultimate Musician - Full iCloud Inventory

Date: 2026-08-01

Decision: The full iCloud scan should be treated as a preservation layer. The useful ideas and assets are real, but they are buried inside more than 1.7 million files, most of which are generated dependencies, build artifacts, or old restored code folders.

Counts:
- iCloud directories: 269,232
- iCloud files: 1,736,766
- Obsidian files: 13,975
- iCloud document-like files: 188,153
- iCloud music/audio/preset/chart-like files: 37,805
- iCloud planning/spec/report-like documents: 39,832
- iCloud build/dependency/noise files: 1,638,184

Main buckets found:
- Ultimate Ecosystem archive: old app workspaces, monorepos, Playback, sync, mixer, dev apps, Graphify exports.
- Ultimate Musician consolidated archive: blueprints, diagnostics, AI feature assistant, roadmap, CineStage update, legacy app packages.
- Ultimate Playback historical app: architecture, YouTube import, auth, rehearsal/live mode, integration docs.
- Ultimate Mixer Controller: intelligent workflow, feedback detection, personal monitors, mixer protocols, metering, scene analysis.
- SCENE:PRESETS: X32/Waves/SQ/X-Air/StudioLive presets, channel strips, livestream templates, Ableton/Reaper/Logic/Pro Tools/Cubase sessions.
- Stems/audio assets: stems, AIF/WAV files, Ableton analysis files, Kontakt/stage keyboard libraries.
- Cifras/charts: chart and notation candidates for future song import.
- Obsidian/Graphify: durable notes plus generated graph exports.
- Dependency/build noise: React Native, Metro, Expo packages, Pods, Headers, build/dist/cache/target/venv folders.
- Non-music business material: Pool/Ultimate Labs, QuickBooks, DNL pool docs.

What to do:
- Build Admin-side Idea/Blueprint Vault.
- Add member-facing feature suggestion capture.
- Add local Asset Indexer for iCloud music resources.
- Index binaries by metadata only; do not commit audio/session/library assets to GitHub.
- Keep one GitHub source of truth per app.
- Preserve old code as archive/reference unless a gap is confirmed.
- Keep Obsidian and Graphify updated after decisions and implementation.

Repo detail:
- Full inventory note: `docs/icloud-full-inventory-2026-08-01.md`
- Product idea inventory: `docs/icloud-idea-inventory-2026-08-01.md`
- Full scan script: `scripts/icloud-full-inventory.sh`
- Product-focused scan script: `scripts/icloud-idea-scan.sh`

