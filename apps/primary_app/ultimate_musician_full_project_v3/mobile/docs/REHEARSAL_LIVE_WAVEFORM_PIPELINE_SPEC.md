# Rehearsal -> Live Waveform Pipeline Spec

## Product Goal
- Rehearsal is the authoring area for multi-track waveform playback.
- Once armed, the exact pipeline transfers to Live Performance with restrictions.

## Core Behaviors
1. Setlist-driven song/session load.
2. Role-based stem visibility:
- Vocal roles: full vocal layers (soprano/alto/tenor/contralto/etc.) + band stems.
- Musician roles: one vocal guide + instrument stems.
3. Practice mode:
- User can mute own part while keeping reference stems.
4. Waveform pipeline authoring (Rehearsal):
- Grid mode: BAR / BEAT / FREE.
- Launch quantization: IMMEDIATE / BEAT / BAR.
- Transition policy: CUT / CROSSFADE / OVERLAP.
- Marker editing: intro, verse, bridge, chorus, tags, custom markers.
- Auto transient hit detection from waveform peaks.
- Loop region: pick marker and loop it for practice.
- Arm pipeline for live transfer.
5. Live Performance (iPad):
- Receives armed pipeline read-only.
- Enforces role/stem restrictions.
- Setlist wave queue with next-song preload and optional autoplay handoff.
- Track lanes with LED state and controls (solo/mute/record arm/record).
- 12-note pad area.
- Pad kit replacement via imported/builtin kits.

## Data Contracts
- `services/roleStemRouter.js`: role policy + track filtering.
- `services/rehearsalPipelineStore.js`: armed payload persistence.
- `services/wavePipelineEngine.js`: transient detection, quantized jump targets, transition windows.
- `services/setlistWavePipeline.js`: queue, preload, and song-advance behaviors.
- `services/recordingInputService.js`: recording inputs and track overdub capture.
- `services/padKitStore.js`: builtin/imported kits and active kit.
- `services/livePerformancePolicy.js`: lock enforcement and armed payload validation.

## Pad Kit Import Format (JSON)
```json
{
  "id": "kit_creator_name_v1",
  "name": "Creator Name Kit",
  "source": "imported",
  "pads": [
    { "note": "C",  "label": "Kick", "sampleUri": "file:///.../kick.wav", "velocity": 1.0 },
    { "note": "C#", "label": "Snare", "sampleUri": "file:///.../snare.wav", "velocity": 1.0 }
  ]
}
```
- `pads` supports up to 12 slots and maps to notes `C..B`.
- `sampleUri` can point to local files or app-accessible URIs.
- Missing pads are auto-filled with defaults.

## Next Engineering Steps
1. Persist per-song armed versions and history.
2. Add marker drag/resize editor.
3. Tie grid quantization to marker placement and launch.
4. Integrate sample file picker/import for external creator kits.
5. Add native low-latency pad trigger engine for iPad live mode.
