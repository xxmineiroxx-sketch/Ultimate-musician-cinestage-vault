# CineStage Brain Query Compatibility Fix

Date: August 8, 2026

Desktop CineStage Brain chat was showing `{"detail":"Not Found"}` because `cinestage.ultimatelabs.co/api/brain/query` is not available even though bootstrap/capabilities are available.

Fix:

- Desktop Brain client now falls back to Ultimate Playback Sync when the CineStage query API returns 404 or no answer.
- Electron proxy now forwards sync headers.
- Ultimate Playback Sync Worker now supports Brain query compatibility routes.

Live Worker version: `2.4.6-brain-query-compat`.

Result: Brain chat can answer from the live CineStage Brain snapshot, including desktop processing route, local Brain install status, and detected song-intelligence engines.
