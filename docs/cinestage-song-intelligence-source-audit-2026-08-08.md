# CineStage Song Intelligence Source Audit - 2026-08-08

## Finding

The older CineStage song intelligence work exists in iCloud. It is not fully migrated into the current deployed Cloudflare Worker or the current desktop Hub.

The current production Worker (`ultimate-playback-sync`) is the coordinator/source-of-truth for routing, approvals, service metadata, team notifications, and temporary stem delivery. The older iCloud CineStage backend contains the deeper music intelligence engines for stems, charts, chords, waveform analysis, arrangement, partsheets, worship flow, and memory.

## Current Production State

- Live Worker: `https://ultimate-playback-sync.studio-cinestage.workers.dev`
- Current Worker version: `2.4.4-brain-authority`
- Canonical Brain endpoint: `GET /sync/cinestage/brain`
- Live Brain route check for `ultimatemusician@ultimatelabs.co` selected `desktop_MacBook-Pro` as the stem processor.
- Live Cloudflare stem job data currently contains only recent rejected smoke-test jobs.
- Live Cloudflare library endpoint did not expose an existing migrated song intelligence catalog in this check.

## iCloud Sources Found

Primary folder:

`/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Cinestage`

High-value subfolders/files:

- `app/main.py`
  - FastAPI app with routers for music AI, jobs, vocal parts, MIDI presets, song pipeline, data API, realtime sync, worship flow, worship memory, setlist flow, waveform, partsheets, brain API, song recommendations, devices, and system guardian.
- `cinestage/api/song_pipeline.py`
  - Full audio pipeline returning `bpm`, `key`, `duration_ms`, `sections`, `chords`, `cues`, `beats_ms`, and `performance_graph`.
- `cinestage/api/intelligence.py`
  - `/cinestage/intelligence` route combining song pipeline output with mix intelligence.
- `cinestage/services/intelligence_layer.py`
  - Builds BPM stability, section summaries, smart mix recommendations, loudness, headroom, frequency balance, and issue/recommendation lists.
- `app/ai/stem_separator.py`
  - Demucs-based stem separation agent with CPU/CUDA/MPS detection, quality metrics, 4-stem/6-stem support, and WAV export.
- `app/ai/advanced_stem_separator.py`
  - Advanced stem separation work for richer instrument output.
- `app/ai/instrument_chart_generator.py`
  - Instrument-specific PDF chart generation for keyboard, guitar, bass, acoustic guitar, capo/CAGED/bass fingering logic, and ReportLab output.
- `app/routers/instrument_chart_routes.py`
  - API routes for chart generation, quick generation, instruments, capo calculator, CAGED reference, strumming patterns, and bass fingering.
- `app/routers/partsheet_routes.py`
  - Partsheets from stems for single instruments and full worship team bundles.
- `app/services/partsheet_renderer.py`
  - Renderer/orchestrator for PDF/HTML partsheets.
- `app/routers/song_arrangement.py`
  - Multi-role song organization endpoint.
- `app/routers/vocal_parts.py` and `app/routers/vocal_harmony_routes.py`
  - Vocal guidance and harmony-related endpoints.
- `app/routers/worship_memory.py`
  - Historical worship memory routes.
- `cinestage/pipeline/*.py`
  - Tempo, key, chord, waveform, structure, cue, marker, quantize, and song analyzer modules.
- `cinestage/models/song_model.py`
  - Older dataclass model for song structure.
- `cinestage/models/stem_role.py`
  - Stem role mapping model.
- `CineStage_Music_AI/storage/charts`
  - Contains test chart outputs and `.cho` chart files.
- `cinestage_memory.db`
  - SQLite memory database.

## Data Check

`cinestage_memory.db` tables:

- `conversations`: 16 rows
- `context`: 0 rows
- `projects`: 0 rows
- `learning`: 0 rows

This means the memory database structure exists, but there is not yet a populated song intelligence memory catalog in that database.

Storage check:

- Top-level `storage/stems` was empty in this audit.
- Top-level `storage/charts` was empty in this audit.
- `CineStage_Music_AI/storage/charts` contains generated/test charts:
  - `Gloria_keyboard.pdf`
  - `Wonderful Tonight_guitar.pdf`
  - `Come Together_bass.pdf`
  - several `chart.cho` files
- `CineStage_Music_AI/storage/stems` appeared empty in this audit.

## What Can Be Reused

Reusable now:

- Song pipeline concepts and payload shape.
- Chord/key/BPM/section/cue/performance graph model.
- Demucs stem separation agent logic, with adaptation to the desktop Hub worker.
- Instrument chart generator logic.
- Partsheets data model and team partsheet flow.
- Worship memory schema idea, but not its data contents.
- Mix intelligence/loudness/headroom/frequency recommendations.

Needs adaptation before production:

- Older routes reference older sync URLs and older job update endpoints.
- Some backend modules depend on heavy Python libraries and should run on desktop/local workers, not in Cloudflare Workers.
- Some code imports between `app.*` and `cinestage.*` packages need consolidation before direct reuse.
- AI-generated charts/cues need approval/confidence gates before publishing to services.

## Recommended Migration

1. Add a canonical `SongIntelligenceRecord` to the current Worker/store:
   - song identity, source URLs, key, BPM, time signature, sections, chords, cues, waveform, stems, role stem map, charts, partsheets, memory, approvals, and versions.
2. Update the desktop Hub worker to run the old Python song pipeline after stem separation:
   - detect BPM/key/sections/chords/cues/waveform
   - attach results to the stem job update payload
3. Add chart/partsheet generation as a desktop-local stage:
   - generate instrument charts from song intelligence and stems
   - submit charts to Brain as `ready_for_review`
4. Add Worker endpoints:
   - `GET /sync/song-intelligence?id=...`
   - `POST /sync/song-intelligence/upsert`
   - `POST /sync/song-intelligence/review`
   - `POST /sync/song-intelligence/publish`
5. Make Ultimate Musician read/edit/review the record.
6. Make Ultimate Playback consume only approved per-role parts, stems, charts, and cues from the record.

## Product Rule

CineStage Brain should own the record and decision state. Desktop workers should do heavy processing. Ultimate Musician should review and approve. Ultimate Playback should consume the approved result.
