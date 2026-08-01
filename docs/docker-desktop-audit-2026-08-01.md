# Docker Desktop Audit - 2026-08-01

## Summary

Docker Desktop is installed and running on this machine. The active Docker context is `desktop-linux`.

The currently running container is only:

- `upt_db`: `postgis/postgis:15-3.4`, mapped to local PostgreSQL port `5432`.

The saved `upt-backend` and `upt-worker` images are about two months old and are tied to the old `upt`/Pool Tech compose project. Their original compose source path was `/Users/studio/Desktop/pool_ultimatelabs_co_handoff`, but that folder is no longer present on disk. Those images should be treated as historical reference only, not as the latest Ultimate Musician or Ultimate Playback app build.

## Relevant CineStage Source Found

The useful Docker-era CineStage source that still exists is:

`/Users/studio/cinestage-main-clean`

That folder includes a complete local Docker stack:

- `docker-compose.yml`: Redis, FastAPI API, Celery worker, shared app storage.
- `Dockerfile`: Python 3.11, ffmpeg, Torch/Torchaudio CPU wheels, app runtime.
- `Dockerfile.worker`: worker-specific image setup.
- `app/services/demucs_service.py`: GPU/CPU-aware Demucs execution with subprocess isolation, memory cleanup, segment fallback, and model caching.
- `cinestage/workers/tasks.py`: Celery job that runs Demucs, uploads stems, updates job status, and removes temporary local output.
- `cinestage/services/job_service.py`: Redis-backed job status store with memory fallback and TTL.
- `cinestage/services/storage.py`: local storage or S3/R2-compatible upload/download abstraction.
- `cinestage/api/jobs.py`: file upload, audio validation through ffprobe, job creation, and job status routes.
- `cinestage/api/song_pipeline.py`: waveform, tempo, key, structure, chords, cues, click, and performance graph pipeline.
- `cinestage/agents/waveform_intelligence_agent.py`: worship-focused waveform intelligence.
- `app/routers/midi_preset_routes.py` and `app/ai/midi_preset_manager.py`: keyboard patch and MIDI preset workflow.
- `app/routers/instrument_chart_routes.py` and `app/ai/instrument_chart_generator.py`: instrument-specific chart generation.

## What Can Be Used In The Current Build

These pieces should influence CineStage/Ultimate Musician going forward:

- Keep the current Electron desktop worker as the account holder's primary processing node.
- Port the Docker-era Demucs safeguards into the Electron worker where possible:
  - GPU/CPU preference resolution.
  - CPU fallback.
  - smaller segment retry after memory/shape errors.
  - subprocess isolation for large audio jobs.
  - clear processing metadata: model, device, mode, seconds, sample rate, segment, overlap.
- Preserve the Redis/Celery/FastAPI stack as a future optional local processing server for mini PC/Mac or studio desktop installs.
- Reuse the song analysis pipeline ideas for BPM, key, sections, chords, cue markers, click track, and performance graph output.
- Reuse the MIDI preset and instrument chart ideas in the approved Admin/Worship Leader review flow.
- Keep storage temporary by default: R2/local delivery only, cleanup two hours after service, account-holder local cache optional.

## What Not To Treat As Current

- The `upt-backend` and `upt-worker` Docker images are not the latest Ultimate Musician/Playback implementation.
- The missing `/Users/studio/Desktop/pool_ultimatelabs_co_handoff` folder means the images cannot be used as a reliable source of current code.
- The existing simulator installs are older than the repo updates made on 2026-08-01 and need rebuild/reinstall or EAS Update before testing the new flows on device.

## Recommended Next Build Step

The current repo already has a Node/Electron desktop stem worker and Cloudflare R2 delivery bridge. The next useful code step is to harden that desktop worker with the best Docker-era ideas:

1. Add structured Demucs processing options: model, stems, device, segment seconds, overlap, shifts.
2. Persist detailed processing metadata back to `/sync/stem-job/update`.
3. Add retry/fallback status messages so Admin/iPad can see when a job is retrying CPU or smaller segments.
4. Add optional local worker mode documentation for the FastAPI/Celery stack if the account holder wants a mini PC/Mac processing server later.

