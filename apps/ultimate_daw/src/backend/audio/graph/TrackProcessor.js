'use strict';

const TWO_PI = 2 * Math.PI;

/**
 * Deterministic pseudo-noise from a seed integer (LCG).
 * Returns a value in [-1, 1].
 */
function pseudoNoise(seed) {
  const s = (seed * 1664525 + 1013904223) & 0xffffffff;
  return (s / 0x7fffffff) - 1;
}

/**
 * Synthesize a sample for a given waveform type.
 * @param {'kick'|'snare'|'bass'|'keys'|'pad'|'sine'|'square'|'noise'} type
 * @param {number} phase  0..1 normalized phase within the cycle
 * @param {number} t      sample index (used for noise seeding)
 * @param {number} freq   frequency in Hz
 * @param {number} sr     sample rate
 * @returns {number}  sample in [-1, 1]
 */
function sampleWaveform(type, phase, t, freq, sr) {
  switch (type) {
    case 'kick': {
      // Sine with exponential pitch envelope
      const envDecay = Math.exp(-t / (sr * 0.25));
      const pitchFreq = freq * (1 + 8 * envDecay);
      return Math.sin(TWO_PI * pitchFreq * t / sr) * envDecay;
    }
    case 'snare': {
      // Mix of short sine + noise
      const snareEnv = Math.exp(-t / (sr * 0.08));
      const sineComp = Math.sin(TWO_PI * freq * t / sr) * 0.4;
      const noiseComp = pseudoNoise(t * 6364136223846793005 + 1442695040888963407) * 0.6;
      return (sineComp + noiseComp) * snareEnv;
    }
    case 'bass': {
      // Sawtooth wave
      return (phase * 2 - 1) * 0.8;
    }
    case 'keys': {
      // Additive: fundamental + 3rd harmonic
      return (Math.sin(TWO_PI * phase) * 0.7 + Math.sin(TWO_PI * phase * 3) * 0.2) * 0.8;
    }
    case 'pad': {
      // Detuned sine pair
      const p2 = (phase * 1.002) % 1;
      return (Math.sin(TWO_PI * phase) * 0.5 + Math.sin(TWO_PI * p2) * 0.5) * 0.6;
    }
    case 'square': {
      return phase < 0.5 ? 0.7 : -0.7;
    }
    case 'noise': {
      return pseudoNoise(t) * 0.5;
    }
    case 'sine':
    default: {
      return Math.sin(TWO_PI * phase) * 0.8;
    }
  }
}

/**
 * Compute stereo pan gains using equal-power law.
 * @param {number} pan  -1 (full left) .. 1 (full right)
 * @returns {{ gainL: number, gainR: number }}
 */
function getPanGains(pan) {
  const angle = ((pan + 1) / 2) * (Math.PI / 2);
  return { gainL: Math.cos(angle), gainR: Math.sin(angle) };
}

/**
 * Returns true if the given step (0-indexed within 16-step bar) is active
 * for this clip's pattern.  Uses a simple hash of (clipId, step) so every
 * clip gets a unique but reproducible groove pattern.
 * @param {string} clipId
 * @param {number} step   0..15
 * @returns {boolean}
 */
function isStepActive(clipId, step) {
  let hash = 0;
  for (let i = 0; i < clipId.length; i++) {
    hash = (hash * 31 + clipId.charCodeAt(i)) & 0xffffffff;
  }
  hash = (hash ^ step) >>> 0;
  // ~50% density
  return (hash % 3) !== 0;
}

// ---------------------------------------------------------------------------
// TrackProcessor
// ---------------------------------------------------------------------------

/**
 * TrackProcessor
 *
 * Per-track synthesis engine. On each render block it:
 *  1. Determines the active clip and its playback state
 *  2. Generates audio samples using a simple synthesizer
 *  3. Writes stereo output into the provided AudioBufferBus
 */
class TrackProcessor {
  constructor(track) {
    this._track = track;
    this._phase = 0;           // oscillator phase 0..1
    this._sampleInStep = 0;    // position within current 16th-note step
    this._currentStep = 0;     // current step 0..15
    this._voiceDecay = 0;      // per-step voice envelope
  }

  /**
   * Render one block of audio into the provided bus.
   * @param {AudioBufferBus} bus
   * @param {object} ctx  RenderContext
   */
  render(bus, ctx) {
    const track = this._track;

    // Nothing to do if muted
    if (track.mute) {
      bus.clear();
      return;
    }

    // Find the active clip
    const activeClip = track.clips
      ? track.clips.find(c => c.active && c.name)
      : null;

    if (!activeClip) {
      bus.clear();
      return;
    }

    const { blockSize, sampleRate, samplesPerBeat, beatsPerBar } = ctx;

    // 16th-note step duration in samples
    const samplesPerStep = samplesPerBeat / 4;

    // Pick a base frequency from the track name/type
    const baseFreq = this._baseFrequency(track);

    // Pick waveform type
    const waveType = this._waveType(track);

    // Pan gains (routing-level pan for per-voice coloring)
    const { gainL, gainR } = getPanGains(track.pan ?? 0);

    const leftCh = bus.channels[0];
    const rightCh = bus.channels[1] ?? bus.channels[0];

    for (let i = 0; i < blockSize; i++) {
      // Advance step counter
      this._sampleInStep += 1;
      if (this._sampleInStep >= samplesPerStep) {
        this._sampleInStep -= samplesPerStep;
        this._currentStep = (this._currentStep + 1) % 16;
        const stepOn = isStepActive(activeClip.name + '_' + activeClip.slotId, this._currentStep);
        if (stepOn) {
          this._voiceDecay = 1.0;
        }
      }

      // Advance oscillator phase
      const phaseInc = baseFreq / sampleRate;
      this._phase = (this._phase + phaseInc) % 1;

      // Generate raw sample
      const raw = sampleWaveform(waveType, this._phase, i, baseFreq, sampleRate);

      // Apply voice envelope
      const envSample = raw * this._voiceDecay;
      this._voiceDecay *= 0.9998; // gentle release (~0.56 at 256 blockSize)

      // Write to bus with pan
      leftCh[i] = envSample * gainL;
      rightCh[i] = envSample * gainR;
    }
  }

  _baseFrequency(track) {
    // Map track type/name to a musically reasonable base frequency
    const name = (track.name ?? '').toLowerCase();
    if (name.includes('kick'))  return 55;
    if (name.includes('snare')) return 200;
    if (name.includes('bass'))  return 82.41;  // E2
    if (name.includes('keys'))  return 261.63; // C4
    if (name.includes('vox') || name.includes('vocal')) return 440; // A4
    if (name.includes('pad'))   return 220;    // A3
    if (name.includes('drum'))  return 80;
    return 220;
  }

  _waveType(track) {
    const name = (track.name ?? '').toLowerCase();
    if (name.includes('kick'))  return 'kick';
    if (name.includes('snare')) return 'snare';
    if (name.includes('bass'))  return 'bass';
    if (name.includes('keys'))  return 'keys';
    if (name.includes('vox') || name.includes('vocal')) return 'pad';
    if (name.includes('pad'))   return 'pad';
    if (name.includes('drum'))  return 'kick';
    return 'sine';
  }
}

module.exports = { TrackProcessor, TWO_PI, pseudoNoise, sampleWaveform, getPanGains, isStepActive };
