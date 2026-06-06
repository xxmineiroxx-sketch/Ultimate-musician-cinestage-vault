/**
 * platformAudio.js
 * Platform-aware audio shim.
 *
 * Native (Expo Go / expo run:ios): returns null from createStemPlayer().
 * Web / Electron: WebStemPlayer with real Web Audio API DSP.
 *
 * DSP chain per stem:
 *   source → stemGain → lowEQ → midEQ → highEQ → panner → compressor
 *                                                              ├─ dryGain ──────────────────────┐
 *                                                              └─ reverbSend → [convolver bus] ─┘
 *                                                                                               ↓
 *                                                                                         masterGain → destination
 */
import { Platform } from 'react-native';

let _Audio = null;
if (Platform.OS !== 'web') {
  try { _Audio = require('expo-av').Audio; } catch {}
}

export const NativeAudio = _Audio;

// ─── Impulse Response Generator ───────────────────────────────────────────────
function createImpulseResponse(ctx, duration = 1.5, decay = 2.5) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const buf = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

const REVERB_PRESETS = {
  room:  { duration: 0.8,  decay: 3.0 },
  hall:  { duration: 2.5,  decay: 1.5 },
  plate: { duration: 1.5,  decay: 2.0 },
};

// ─── EQ helper: 0–1 → −12..+12 dB ────────────────────────────────────────────
function toDb(v) { return (v - 0.5) * 24; }

// ─── WebStemPlayer ─────────────────────────────────────────────────────────────
export class WebStemPlayer {
  constructor() {
    this._tracks = {};     // id → { audio, nodes, volume, muted, reverbType }
    this._ctx = null;
    this._masterGain = null;
    this._convolvers = {}; // type → ConvolverNode (shared reverb buses)
    this._isPlaying = false;
  }

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = 1;
      this._masterGain.connect(this._ctx.destination);
    }
    return this._ctx;
  }

  // Lazy-create shared reverb bus per room type
  _getConvolver(type = 'room') {
    if (!this._convolvers[type]) {
      const ctx = this._getCtx();
      const preset = REVERB_PRESETS[type] || REVERB_PRESETS.room;
      const node = ctx.createConvolver();
      node.buffer = createImpulseResponse(ctx, preset.duration, preset.decay);
      node.connect(this._masterGain);
      this._convolvers[type] = node;
    }
    return this._convolvers[type];
  }

  async loadTrack(id, url, { volume = 1, muted = false } = {}) {
    const ctx = this._getCtx();

    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';

    const source = ctx.createMediaElementSource(audio);

    const stemGain = ctx.createGain();
    stemGain.gain.value = muted ? 0 : volume;

    // 3-band parametric EQ
    const lowEQ = ctx.createBiquadFilter();
    lowEQ.type = 'lowshelf';
    lowEQ.frequency.value = 100;
    lowEQ.gain.value = 0;

    const midEQ = ctx.createBiquadFilter();
    midEQ.type = 'peaking';
    midEQ.frequency.value = 1000;
    midEQ.Q.value = 0.8;
    midEQ.gain.value = 0;

    const highEQ = ctx.createBiquadFilter();
    highEQ.type = 'highshelf';
    highEQ.frequency.value = 8000;
    highEQ.gain.value = 0;

    const panNode = ctx.createStereoPanner();
    panNode.pan.value = 0;

    // Per-stem compressor (glue + peak limiting)
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1;

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0;

    // Wire chain
    source.connect(stemGain);
    stemGain.connect(lowEQ);
    lowEQ.connect(midEQ);
    midEQ.connect(highEQ);
    highEQ.connect(panNode);
    panNode.connect(compressor);
    compressor.connect(dryGain);
    dryGain.connect(this._masterGain);
    compressor.connect(reverbSend);
    // reverbSend → convolver connected lazily in setReverb()

    this._tracks[id] = {
      audio,
      nodes: { stemGain, lowEQ, midEQ, highEQ, panNode, compressor, dryGain, reverbSend },
      volume,
      muted,
      reverbType: null,
    };

    return new Promise((resolve) => {
      audio.oncanplaythrough = resolve;
      audio.onerror = resolve;
    });
  }

  // ─── Per-stem controls ───────────────────────────────────────────────────────

  setVolume(id, volume) {
    const t = this._tracks[id];
    if (!t) return;
    t.volume = Math.max(0, Math.min(2, volume));
    if (!t.muted) t.nodes.stemGain.gain.value = t.volume;
  }

  setMute(id, muted) {
    const t = this._tracks[id];
    if (!t) return;
    t.muted = muted;
    t.nodes.stemGain.gain.value = muted ? 0 : t.volume;
  }

  setPan(id, pan) {
    const t = this._tracks[id];
    if (t) t.nodes.panNode.pan.value = Math.max(-1, Math.min(1, pan ?? 0));
  }

  /**
   * 3-band EQ. Each band is 0–1 (0.5 = flat, 0 = −12 dB, 1 = +12 dB).
   */
  setEQ(id, { low = 0.5, mid = 0.5, high = 0.5 } = {}) {
    const t = this._tracks[id];
    if (!t) return;
    t.nodes.lowEQ.gain.value  = toDb(low);
    t.nodes.midEQ.gain.value  = toDb(mid);
    t.nodes.highEQ.gain.value = toDb(high);
  }

  /**
   * Reverb send. amount 0–1, type: 'room' | 'hall' | 'plate'.
   */
  setReverb(id, { amount = 0, type = 'room' } = {}) {
    const t = this._tracks[id];
    if (!t) return;
    const { reverbSend, dryGain } = t.nodes;

    if (amount > 0 && t.reverbType !== type) {
      try { reverbSend.disconnect(); } catch {}
      reverbSend.connect(this._getConvolver(type));
      t.reverbType = type;
    }

    reverbSend.gain.value = Math.max(0, Math.min(1, amount));
    dryGain.gain.value    = 1 - amount * 0.5; // preserve perceived loudness
  }

  /**
   * Override compressor settings for a stem.
   */
  setCompressor(id, { threshold = -24, knee = 30, ratio = 4, attack = 0.003, release = 0.25 } = {}) {
    const t = this._tracks[id];
    if (!t) return;
    const c = t.nodes.compressor;
    c.threshold.value = threshold;
    c.knee.value      = knee;
    c.ratio.value     = ratio;
    c.attack.value    = attack;
    c.release.value   = release;
  }

  setMasterVolume(v) {
    if (this._masterGain) this._masterGain.gain.value = Math.max(0, Math.min(2, v));
  }

  // ─── Transport ───────────────────────────────────────────────────────────────

  play() {
    const ctx = this._getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    Object.values(this._tracks).forEach(({ audio }) => audio.play().catch(() => {}));
    this._isPlaying = true;
  }

  pause() {
    Object.values(this._tracks).forEach(({ audio }) => audio.pause());
    this._isPlaying = false;
  }

  stop() {
    this.pause();
    Object.values(this._tracks).forEach(({ audio }) => { audio.currentTime = 0; });
  }

  seekTo(seconds) {
    Object.values(this._tracks).forEach(({ audio }) => { audio.currentTime = seconds; });
  }

  getPosition() {
    const first = Object.values(this._tracks)[0];
    return first ? first.audio.currentTime : 0;
  }

  getDuration() {
    const first = Object.values(this._tracks)[0];
    return first ? (first.audio.duration || 0) : 0;
  }

  isPlaying() { return this._isPlaying; }

  unloadAll() {
    Object.values(this._tracks).forEach(({ audio }) => {
      audio.pause();
      audio.src = '';
    });
    this._tracks = {};
  }

  dispose() {
    this.unloadAll();
    if (this._ctx) {
      this._ctx.close();
      this._ctx = null;
      this._masterGain = null;
      this._convolvers = {};
    }
  }
}

/**
 * Returns a WebStemPlayer on web/Electron, null on native Expo Go.
 * Native callers use audioEngine/index.js (expo-av).
 */
export function createStemPlayer() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.AudioContext) {
    return new WebStemPlayer();
  }
  return null;
}
