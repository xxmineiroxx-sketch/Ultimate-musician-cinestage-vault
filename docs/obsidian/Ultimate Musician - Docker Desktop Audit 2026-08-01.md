# Ultimate Musician - Docker Desktop Audit 2026-08-01

Related:

- [[Ultimate Musician - CineStage Desktop Stem Worker]]
- [[Ultimate Musician - Desktop Version Audit 2026-08-01]]
- [[Ultimate Musician - Setlist Approval Workflow]]

## Finding

Docker Desktop is available on the machine, but the active containers are not a newer Ultimate Musician or Ultimate Playback app version.

Running:

- `upt_db`: PostGIS database on local port `5432`.

Saved images:

- `upt-backend`
- `upt-worker`
- Pool Tech backend/worker/API images
- Ollama, Redis, Postgres, PostGIS, Node base images

The `upt` backend/worker images came from the old Pool Tech compose project path `/Users/studio/Desktop/pool_ultimatelabs_co_handoff`, but that source folder is no longer on disk. Treat those images as old reference, not current app source.

## Useful Source Still Present

`/Users/studio/cinestage-main-clean` is the important folder.

It includes:

- Docker compose for Redis, FastAPI API, and Celery worker.
- Demucs service with GPU/CPU handling.
- Redis-backed job status TTL.
- S3/R2-compatible storage wrapper.
- Upload/status/download routes.
- Song pipeline for waveform, tempo, key, sections, chords, cues, click, and performance graph.
- Worship waveform intelligence agent.
- MIDI preset system.
- Instrument chart generation.

## What To Reuse

- Keep desktop-primary stem processing.
- Reuse the Docker-era Demucs safeguards in the Electron worker.
- Keep the FastAPI/Celery version as a possible mini PC/Mac processing server later.
- Reuse worship intelligence, MIDI preset, instrument chart, and performance graph ideas after Admin/Worship Leader approval.
- Keep R2 storage temporary and clean stem delivery two hours after the service.

## Current Decision

No app source should be replaced from Docker. The newer current implementation is in the GitHub repo. Docker gives us reference ideas to port, mainly processing resilience and optional local processing server architecture.

