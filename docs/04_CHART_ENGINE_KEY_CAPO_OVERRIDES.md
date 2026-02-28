# Chart Engine — Key Change + Capo + Overrides

## Must-have behavior
When planned key changes, regenerate charts for:
- acoustic (auto capo + shapes)
- electric (toggle shapes on/off)
- keys/bass (transpose harmonics/roots)

## Rendering pipeline
master → transpose → musician overrides → instrument rules → render

## Overrides
Per musician + per instrument:
- chord replacements per line/section
- simplifications
- notes/tags

## Instrument charts (minimum)
- Guitar (Acoustic): capo + shapes + Nashville option later
- Guitar (Electric): real chords or shapes toggle
- Bass: root chart, optional slash follow, rhythm hints
- Keys: chord symbols + voicing notes
- Drums: groove map (intro/verse/chorus fills), cues
- Vocals: lyrics + notes + harmony parts (BGV1/BGV2)
