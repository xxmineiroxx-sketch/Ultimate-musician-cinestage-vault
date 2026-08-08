# CineStage Brain Query Compatibility Fix

Date: August 8, 2026

## Problem

The Ultimate Musician desktop CineStage Brain chat was posting to:

- `https://cinestage.ultimatelabs.co/api/brain/query`

The live CineStage service exposes Brain bootstrap and capabilities, but this query route returned:

- `{"detail":"Not Found"}`

The desktop UI displayed that JSON as the Brain answer.

## Fix

- The desktop Brain client now treats 404 / `detail: Not Found` / empty sync ids as non-answers.
- It falls back to the live sync authority:
  - `https://ultimate-playback-sync.studio-cinestage.workers.dev/api/brain/query`
- The Electron proxy now forwards optional headers for fallback sync calls.
- The sync Worker now implements `/api/brain/query`, `/sync/cinestage/brain/query`, and `/sync/brain/query`.

## Result

The Brain chat now returns a useful status answer from the current CineStage Brain snapshot, including desktop routing, local Brain installation, detected engines, and context from the current screen.

Live Worker version:

- `2.4.6-brain-query-compat`
