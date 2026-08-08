# CineStage Hub - Chart Vault

Date: 2026-08-08
Status: Implemented in Ultimate DAW Desktop

## Product Intent

CineStage Hub should be able to use the account holder's local chart and lyrics folders before asking cloud processing to rebuild song data. The desktop app is the main local brain for this work because it can access external drives, shared folders, backup laptops, and larger local song libraries.

## Flow

1. Org owner, Admin, or Worship Leader opens Ultimate DAW Desktop.
2. They choose local library folders in CineStage Hub. These can be local Downloads folders, external drives, shared network folders, or the always-on backup laptop library.
3. CineStage Hub scans audio, stems, charts, lyrics, and metadata.
4. A requested song can be searched in Chart Vault by artist, song title, key, and BPM.
5. If a local chart exists, CineStage analyzes whether it has chords, lyrics, key, and BPM.
6. The user can create a working area organized as `Artist / Album / Song`.
7. The chart is copied into the song workspace and `metadata/chart-analysis.json` is written for CineStage Brain review.

## Current Implementation

- Chart-only folders are now indexed as songs.
- CineStage Hub can add multiple local library roots without replacing the existing list.
- The desktop UI has separate actions for adding a VS/stems folder and adding a song chords/charts folder, while both feed the same matching index.
- Supported chart metadata formats: `.cho`, `.chordpro`, `.crd`, `.md`, `.rtf`, `.txt`, `.pdf`, `.docx`.
- Text parsing is active for `.cho`, `.chordpro`, `.crd`, `.md`, `.rtf`, and `.txt`.
- Flat Cifras-style filenames such as `Song - Artist - Key.rtf` are parsed into song title, artist, and key.
- PDF and DOCX are indexed by file path/name for now. Full content extraction should be added later with a document parser.
- The Hub UI has a Chart Vault panel with local analysis and working-area creation.

## Next Product Step

Connect the chart-analysis manifest to the mobile song library approval flow, so a leader can inspect corrected key, BPM, lyrics, and chord chart before publishing it to Ultimate Playback members.
