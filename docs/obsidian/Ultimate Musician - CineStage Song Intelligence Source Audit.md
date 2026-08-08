# Ultimate Musician - CineStage Song Intelligence Source Audit

Date: 2026-08-08

## Finding

The older CineStage song intelligence work exists in iCloud. It is not fully migrated into the current deployed Cloudflare Worker or the current desktop Hub.

Primary source:

`/Users/studio/Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Cinestage`

## Reusable Existing Work

- `cinestage/api/song_pipeline.py`
  - BPM, key, duration, sections, chords, cues, beats, performance graph.
- `cinestage/api/intelligence.py`
  - `/cinestage/intelligence` combined song and mix intelligence route.
- `cinestage/services/intelligence_layer.py`
  - BPM stability, section summaries, smart mixing, loudness, headroom, frequency balance, recommendations.
- `app/ai/stem_separator.py`
  - Demucs stem separation with CPU/CUDA/MPS support and quality metrics.
- `app/ai/instrument_chart_generator.py`
  - Keyboard, guitar, bass, acoustic guitar chart generation with capo/CAGED/fingering logic.
- `app/routers/instrument_chart_routes.py`
  - Chart generation API routes.
- `app/routers/partsheet_routes.py`
  - Single-instrument and team partsheet generation.
- `app/services/partsheet_renderer.py`
  - PDF/HTML partsheet rendering.
- `app/routers/worship_memory.py`
  - Worship memory API concept.
- `cinestage/pipeline/*.py`
  - Tempo, key, chord, waveform, structure, cue, marker, quantize, and song analyzer modules.
- `cinestage/models/song_model.py` and `cinestage/models/stem_role.py`
  - Song/stem role model foundations.

## Data Check

`cinestage_memory.db` exists, but it is mostly empty:

- `conversations`: 16 rows
- `context`: 0 rows
- `projects`: 0 rows
- `learning`: 0 rows

Top-level `storage/stems` and `storage/charts` were empty. `CineStage_Music_AI/storage/charts` contains test/generated chart files including keyboard, guitar, bass PDFs and `.cho` chart files.

## Current Production Gap

The live Cloudflare Worker has `GET /sync/cinestage/brain` and owns routing/approval/status, but it does not yet persist a full `SongIntelligenceRecord`.

## Migration Direction

Create a canonical `SongIntelligenceRecord` owned by CineStage Brain:

- song identity
- source links/files
- key, BPM, time signature
- sections, chords, cues, waveform
- stems and role-stem map
- charts and partsheets
- local cache/external drive references
- confidence and approval status
- service/team publish state

Desktop workers should run the heavy Python intelligence pipeline. Cloudflare should coordinate and persist metadata. Ultimate Musician should review/approve. Ultimate Playback should consume approved role-specific output.
