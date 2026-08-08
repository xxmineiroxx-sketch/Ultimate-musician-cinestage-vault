# Ultimate Musician - CineStage Desktop Stem Hub

Desktop Hub concept for CineStage stem processing.

Implemented in `apps/ultimate_daw`:

- `CineStage Hub` desktop screen.
- Worker identity, sync URL, and account settings.
- Account desktop, backup laptop, and library server modes.
- External drive/shared folder stem library scanning.
- Artist/Album/Song folder organizer.
- Local index for song/stem/chart/metadata lookup.
- Search-before-separate behavior in the background stem worker.
- Start/stop controls for the worker from the desktop UI.

Folder model:

```text
CineStage Stem Library/
  Artist or Band/
    Album or Collection/
      Song Title/
        original/
        stems/
        charts/
        metadata/
        exports/
```

Priority:

1. Account holder desktop.
2. Backup laptop worker.
3. Existing local/external stem library.
4. New separation only when stems are missing.
5. Future cloud fallback.

Rule: hard drives store media, local index stores searchable catalog data, Cloudflare coordinates jobs and short-lived delivery.
