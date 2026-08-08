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
- Optional analyzer for BPM, key, waveform, and coarse section metadata.

iCloud versions checked:

- `Ultimate_Workspace/UltimateMusicianDesktop`: older Electron desktop shell and Cloudflare API notes.
- `Utimate Musician app/UltimateMusicianDAW`: Python DAW/backend prototype for future DAW ideas.
- `Cinestage/pipeline`: tempo, key, chord, waveform, and structure detector prototypes; first analyzer was adapted from here.
- `Cinestage/CineStage_Music_AI`: larger music AI service with Demucs, vocal harmony, charts, MIDI presets, mix intelligence, and device adapters.
- `Cinestage`: multiple terminal/server builds, Modal Demucs experiments, R2 notes, waveform plans, and assistant architecture references.

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
