# One Of A Kind Wavepipeline Stack

## Implemented core in app
- Predictive Jump Engine (`services/predictiveJumpEngine.js`)
- Quantized Intent Queue + scheduled jumps (`screens/PerformanceScreen.js`)
- Latency calibration and compensation (`services/latencyCalibrationStore.js`)
- Marker AI assist bootstrap (`services/markerAiAssist.js`)
- Safety-gated live jump policy (`services/livePerformancePolicy.js`)
- Dual timeline with automation lane dots (`components/WaveformTimeline.js`)
- Rehearsal -> Live diff history + rollback (`services/rehearsalPipelineStore.js`, `screens/PerformanceScreen.js`)

## Rehearsal authoring
- Grid: BAR/BEAT/FREE
- Launch quantization: IMMEDIATE/BEAT/BAR
- Transition modes: CUT/CROSSFADE/OVERLAP
- Marker creation + transient detect + AI marker suggestions
- Automation events for MIDI/LIGHTS/LYRICS lanes
- Safety policy mode: strict/guided/tech

## Live execution
- Quantized cue target jump buttons
- Predictive next-jump suggestions
- Latency offset controls (-/+ ms)
- Safety policy blocks unsafe jumps in live mode
- Rollback to previous armed snapshot

## Market references used
- Loop Community Prime: https://loopcommunity.com/en-US/prime
- MultiTracks Playback: https://www.multitracks.com/products/playback/
- Playback feature docs: https://helpcenter.multitracks.com/en/articles/4944485-playback-user-guide
