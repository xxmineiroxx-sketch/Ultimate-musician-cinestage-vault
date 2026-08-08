# Ultimate Musician - CineStage Desktop Stem Hub

Desktop Hub concept for CineStage stem processing.

Implemented in `apps/ultimate_daw`:

- `CineStage Hub` desktop screen.
- Worker identity, sync URL, and account settings.
- Account desktop, backup laptop, and library server modes.
- External drive/shared folder stem library scanning.
- Flat Ableton-style `MultiTracks`, `Imported`, and `stems` folders are grouped as one song/project.
- VS/multitrack naming is recognized for guide, vocal, guitar, keys, click, and BPM/key signals.
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

Desktop live/setlist repair, August 8, 2026:

- Desktop sync now points to `ultimate-playback-sync.studio-cinestage.workers.dev`.
- `/sync/live-status` is now a real Worker route for Live Performance.
- Setlist Runner publishes current song state to Live Performance.
- Setlist and Setlist Runner handle Worker setlist arrays, pending assignment rows, `service_id`, and service discovery fallback.
- Worker exposes service list/proposal routes needed by Admin and Leader dashboard service workflows.

App-to-desktop linkage, August 8, 2026:

- Desktop Hub auto-starts its background stem worker when the desktop app launches.
- Heartbeats now include account identity, worker mode, and backup-worker permission.
- Cloudflare routing chooses exact account desktop first, then backup/library workers, then fallback.
- Verified a Playback-style stem job from `xxmineiroxx@gmail.com` selected `desktop_MacBook-Pro` instead of Cloudflare fallback.

Local recovery note:

- Recovered VS assets live at `/Users/studio/Downloads/VS`.
- Use `/Users/studio/Downloads/VS` as a Hub root instead of scanning all of `/Users/studio/Downloads` to avoid duplicate records and non-music files.
- Latest local scan: `282` files, `9` song projects, `82` stem types.
- Useful projects: `Eu Me Rendo Renaser`, `MT - Te louvarei`, `MULTITRACKS - UM NOVO DIA _151BPM`, `Sara Oliveira - Caia Fogo - Bb - Bpm136`, `Sued Silva - O Nome Dele Jesus`, and `Julliany Souza - Quem e Esse - F# - Bpm124`.
