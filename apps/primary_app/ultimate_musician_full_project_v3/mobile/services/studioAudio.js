/**
 * Studio Audio Engine v2 — Web Audio API
 * X32-inspired professional channel strip. Desktop/web only (no expo-av).
 *
 * Audio chain per track:
 *   BufferSource
 *     → gate   (DynamicsCompressor as expander, ratio=20 when enabled)
 *     → hp     (highpass BiquadFilter ~80Hz, kills rumble)
 *     → lmf    (peaking BiquadFilter ~250Hz, Q adj.)
 *     → hmf    (peaking BiquadFilter ~2500Hz, Q adj.)
 *     → hf     (highshelf BiquadFilter ~8kHz)
 *     → comp   (DynamicsCompressor, attack/release adjustable)
 *     → delayNode (DelayNode) / delayWet+delayDry GainNodes
 *     → reverbSend (GainNode → global _reverbBus → masterGain)
 *     → panner (StereoPanner)
 *     → gain   (track volume → masterGain → masterAnalyser → destination)
 */

let _ctx = null;
let _masterGain = null;
let _masterAnalyser = null;
let _reverbConvolver = null;
let _reverbReturn = null;
let _playStartTime = 0;
let _playOffset = 0;
let _isPlaying = false;
let _isRecording = false;
let _recordingTrackId = null;
let _mediaRecorder = null;
let _recordingChunks = [];

const _tracks = new Map();
const _listeners = new Set();

// ─── AudioContext + global reverb bus ─────────────────────────────────────────

function _makeImpulse(ctx, dur = 0.8) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
  }
  return buf;
}

function _getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 0.9;
    _masterAnalyser = _ctx.createAnalyser();
    _masterAnalyser.fftSize = 1024;
    _masterGain.connect(_masterAnalyser);
    _masterAnalyser.connect(_ctx.destination);

    // Global reverb bus
    _reverbConvolver = _ctx.createConvolver();
    _reverbConvolver.buffer = _makeImpulse(_ctx);
    _reverbReturn = _ctx.createGain();
    _reverbReturn.gain.value = 0.7;
    _reverbConvolver.connect(_reverbReturn);
    _reverbReturn.connect(_masterGain);
  }
  return _ctx;
}

// ─── Track chain factory ───────────────────────────────────────────────────────

function _makeChain(ctx) {
  // Gate (DynamicsCompressor used as downward expander)
  const gate = ctx.createDynamicsCompressor();
  gate.threshold.value = -100; // disabled = very low threshold, ratio=1
  gate.knee.value = 0;
  gate.ratio.value = 1;
  gate.attack.value = 0.001;
  gate.release.value = 0.1;

  // 4-band parametric EQ
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 80;
  hp.Q.value = 0.7;

  const lmf = ctx.createBiquadFilter();
  lmf.type = "peaking";
  lmf.frequency.value = 250;
  lmf.Q.value = 1;
  lmf.gain.value = 0;

  const hmf = ctx.createBiquadFilter();
  hmf.type = "peaking";
  hmf.frequency.value = 2500;
  hmf.Q.value = 1;
  hmf.gain.value = 0;

  const hf = ctx.createBiquadFilter();
  hf.type = "highshelf";
  hf.frequency.value = 8000;
  hf.gain.value = 0;

  // Compressor (full params)
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = 0; // disabled default
  comp.knee.value = 10;
  comp.ratio.value = 1;
  comp.attack.value = 0.003;
  comp.release.value = 0.1;

  // Delay
  const delayNode = ctx.createDelay(5.0);
  delayNode.delayTime.value = 0.25;
  const delayDry = ctx.createGain();
  delayDry.gain.value = 1;
  const delayWet = ctx.createGain();
  delayWet.gain.value = 0; // disabled by default

  // Reverb send
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0;

  // Pan + volume
  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;
  const gain = ctx.createGain();
  gain.gain.value = 1;

  // Wire: gate → hp → lmf → hmf → hf → comp
  gate.connect(hp);
  hp.connect(lmf);
  lmf.connect(hmf);
  hmf.connect(hf);
  hf.connect(comp);

  // comp → dry path (delayDry bypasses delay) + delay wet path
  comp.connect(delayDry);
  comp.connect(delayNode);
  delayNode.connect(delayWet);

  // Both dry+wet → panner → gain → master
  delayDry.connect(panner);
  delayWet.connect(panner);

  // Reverb send taps off comp (pre-delay for natural sound)
  comp.connect(reverbSend);
  reverbSend.connect(_reverbConvolver);

  panner.connect(gain);

  return {
    gate,
    hp,
    lmf,
    hmf,
    hf,
    comp,
    delayNode,
    delayDry,
    delayWet,
    reverbSend,
    panner,
    gain,
  };
}

// ─── Track CRUD ───────────────────────────────────────────────────────────────

const TRACK_COLORS = [
  "#4F46E5",
  "#0E7490",
  "#047857",
  "#B45309",
  "#7C3AED",
  "#DB2777",
  "#DC2626",
  "#D97706",
];
let _colorIdx = 0;

export function createTrack(id, name) {
  const ctx = _getCtx();
  const chain = _makeChain(ctx);
  chain.gain.connect(_masterGain);

  const track = {
    id,
    name: name || `Track ${_tracks.size + 1}`,
    buffer: null,
    source: null,
    muted: false,
    soloed: false,
    volume: 1,
    pan: 0,
    // Gate
    gate: { enabled: false, threshold: -40, release: 0.1 },
    // 4-band EQ
    eq: {
      hp: { enabled: false, freq: 80 },
      lmf: { gain: 0, freq: 250, q: 1 },
      hmf: { gain: 0, freq: 2500, q: 1 },
      hf: { gain: 0, freq: 8000 },
    },
    // Compressor
    comp: {
      enabled: false,
      threshold: -24,
      ratio: 4,
      attack: 0.003,
      release: 0.1,
    },
    // Delay
    delay: { enabled: false, time: 0.25, wet: 0.3 },
    // Reverb
    reverbSend: 0,
    color: TRACK_COLORS[_colorIdx++ % TRACK_COLORS.length],
    chain,
  };

  _tracks.set(id, track);
  _notify();
  return track;
}

export function removeTrack(id) {
  const track = _tracks.get(id);
  if (!track) return;
  if (track.source) {
    try {
      track.source.stop();
    } catch (_) {}
  }
  track.chain.gain.disconnect();
  _tracks.delete(id);
  _notify();
}

export function getTrack(id) {
  return _tracks.get(id) || null;
}
export function getTracks() {
  return Array.from(_tracks.values());
}

// ─── File loading ──────────────────────────────────────────────────────────────

export async function loadFileToTrack(id, file) {
  const ctx = _getCtx();
  const track = _tracks.get(id);
  if (!track) throw new Error("Track not found: " + id);
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  track.buffer = audioBuffer;
  track.name = file.name.replace(/\.[^/.]+$/, "");
  _notify();
  return audioBuffer;
}

export async function loadUrlToTrack(id, url, name) {
  const ctx = _getCtx();
  const track = _tracks.get(id);
  if (!track) throw new Error("Track not found: " + id);
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  track.buffer = audioBuffer;
  if (name) track.name = name;
  _notify();
  return audioBuffer;
}

// ─── Playback ─────────────────────────────────────────────────────────────────

function _startSource(track, offsetSecs) {
  if (!track.buffer) return;
  const ctx = _getCtx();
  const source = ctx.createBufferSource();
  source.buffer = track.buffer;
  source.connect(track.chain.gate);
  source.start(0, Math.max(0, offsetSecs));
  source.onended = () => {
    if (track.source === source) track.source = null;
  };
  track.source = source;
}

export function play() {
  if (_isPlaying) return;
  const ctx = _getCtx();
  if (ctx.state === "suspended") ctx.resume();
  const offset = _playOffset;
  _playStartTime = ctx.currentTime - offset;
  _isPlaying = true;
  const soloExists = Array.from(_tracks.values()).some((t) => t.soloed);
  _tracks.forEach((track) => {
    const mute = track.muted || (soloExists && !track.soloed);
    track.chain.gain.gain.setValueAtTime(
      mute ? 0 : track.volume,
      ctx.currentTime,
    );
    _startSource(track, offset);
  });
  _notify();
}

export function pause() {
  if (!_isPlaying) return;
  const ctx = _getCtx();
  _playOffset = ctx.currentTime - _playStartTime;
  _isPlaying = false;
  _tracks.forEach((track) => {
    if (track.source) {
      try {
        track.source.stop();
      } catch (_) {}
      track.source = null;
    }
  });
  _notify();
}

export function stop() {
  _isPlaying = false;
  _playOffset = 0;
  _tracks.forEach((track) => {
    if (track.source) {
      try {
        track.source.stop();
      } catch (_) {}
      track.source = null;
    }
  });
  _notify();
}

export function seek(seconds) {
  const wasPlaying = _isPlaying;
  if (wasPlaying) pause();
  _playOffset = Math.max(0, seconds);
  if (wasPlaying) play();
  _notify();
}

export function getPosition() {
  if (!_ctx) return 0;
  if (!_isPlaying) return _playOffset;
  return Math.max(0, _ctx.currentTime - _playStartTime);
}

export function getDuration() {
  let max = 0;
  _tracks.forEach((t) => {
    if (t.buffer && t.buffer.duration > max) max = t.buffer.duration;
  });
  return max;
}

export function isPlaying() {
  return _isPlaying;
}
export function isRecording() {
  return _isRecording;
}

// ─── Mixer controls ───────────────────────────────────────────────────────────

export function setTrackVolume(id, volume) {
  const t = _tracks.get(id);
  if (!t) return;
  t.volume = volume;
  if (!t.muted) t.chain.gain.gain.value = volume;
  _notify();
}

export function setTrackPan(id, pan) {
  const t = _tracks.get(id);
  if (!t) return;
  t.pan = pan;
  t.chain.panner.pan.value = pan;
  _notify();
}

export function setTrackMute(id, muted) {
  const t = _tracks.get(id);
  if (!t) return;
  t.muted = muted;
  t.chain.gain.gain.value = muted ? 0 : t.volume;
  _notify();
}

export function setTrackSolo(id, soloed) {
  const t = _tracks.get(id);
  if (!t) return;
  t.soloed = soloed;
  const soloExists = Array.from(_tracks.values()).some((tr) => tr.soloed);
  _tracks.forEach((tr) => {
    const mute = tr.muted || (soloExists && !tr.soloed);
    tr.chain.gain.gain.value = mute ? 0 : tr.volume;
  });
  _notify();
}

export function setTrackName(id, name) {
  const t = _tracks.get(id);
  if (!t) return;
  t.name = name;
  _notify();
}

export function setMasterVolume(vol) {
  if (_masterGain) _masterGain.gain.value = Math.max(0, Math.min(1.5, vol));
}

export function getMasterAnalyser() {
  _getCtx();
  return _masterAnalyser;
}

// ─── Gate ─────────────────────────────────────────────────────────────────────

export function setGate(id, enabled, threshold, release) {
  const t = _tracks.get(id);
  if (!t) return;
  if (enabled !== undefined) t.gate.enabled = enabled;
  if (threshold != null) t.gate.threshold = threshold;
  if (release != null) t.gate.release = release;
  const g = t.chain.gate;
  if (t.gate.enabled) {
    // Expander: high ratio, threshold = gate open point
    g.threshold.value = t.gate.threshold;
    g.ratio.value = 20;
    g.release.value = t.gate.release;
    g.knee.value = 0;
  } else {
    g.threshold.value = -100;
    g.ratio.value = 1;
  }
  _notify();
}

// ─── 4-Band Parametric EQ ─────────────────────────────────────────────────────

/**
 * setEQBand(id, band, params)
 * band: 'hp' | 'lmf' | 'hmf' | 'hf'
 * params: { gain?, freq?, q?, enabled? }
 */
export function setEQBand(id, band, params) {
  const t = _tracks.get(id);
  if (!t) return;
  const state = t.eq[band];
  if (!state) return;
  Object.assign(state, params);

  const node = t.chain[band];
  if (!node) return;

  if (band === "hp") {
    node.frequency.value = state.freq;
    // HPF "enabled" = bypass via very low cutoff
    node.frequency.value = state.enabled ? state.freq : 10;
  } else {
    if (state.freq != null) node.frequency.value = state.freq;
    if (state.gain != null) node.gain.value = state.gain;
    if (state.q != null) node.Q.value = state.q;
  }
  _notify();
}

/** Legacy alias — maps to lmf/hmf/hf */
export function setEQ(id, band, gainDb) {
  const bandMap = { low: "hf", mid: "hmf", high: "hf" };
  // Actually map sensibly: low→lmf, mid→hmf, high→hf
  const map = { low: "lmf", mid: "hmf", high: "hf" };
  setEQBand(id, map[band] || band, { gain: gainDb });
}

// ─── Compressor (full params) ──────────────────────────────────────────────────

export function setCompFull(id, params) {
  const t = _tracks.get(id);
  if (!t) return;
  Object.assign(t.comp, params);
  const c = t.chain.comp;
  if (t.comp.enabled) {
    c.threshold.value = t.comp.threshold;
    c.ratio.value = t.comp.ratio;
    c.attack.value = t.comp.attack;
    c.release.value = t.comp.release;
  } else {
    c.threshold.value = 0;
    c.ratio.value = 1;
  }
  _notify();
}

/** Legacy alias */
export function setCompressor(id, enabled, threshold, ratio) {
  setCompFull(id, {
    enabled,
    ...(threshold != null ? { threshold } : {}),
    ...(ratio != null ? { ratio } : {}),
  });
}

/** Read gain reduction (dB, negative) for a track's compressor */
export function getGainReduction(id) {
  const t = _tracks.get(id);
  if (!t || !t.comp.enabled) return 0;
  return t.chain.comp.reduction || 0;
}

// ─── Delay ────────────────────────────────────────────────────────────────────

export function setDelay(id, enabled, time, wet) {
  const t = _tracks.get(id);
  if (!t) return;
  if (enabled !== undefined) t.delay.enabled = enabled;
  if (time != null) t.delay.time = time;
  if (wet != null) t.delay.wet = wet;
  t.chain.delayNode.delayTime.value = t.delay.time;
  const w = t.delay.enabled ? t.delay.wet : 0;
  t.chain.delayWet.gain.value = w;
  t.chain.delayDry.gain.value = 1; // dry always on
  _notify();
}

// ─── Reverb send ──────────────────────────────────────────────────────────────

export function setReverbSend(id, level) {
  const t = _tracks.get(id);
  if (!t) return;
  t.reverbSend = Math.max(0, Math.min(1, level));
  t.chain.reverbSend.gain.value = t.reverbSend;
  _notify();
}

// ─── Scene save / recall ──────────────────────────────────────────────────────

const SCENES_KEY = "studio_scenes_v1";

function _getSceneStore() {
  try {
    return JSON.parse(localStorage.getItem(SCENES_KEY) || "{}");
  } catch {
    return {};
  }
}

function _saveSceneStore(store) {
  try {
    localStorage.setItem(SCENES_KEY, JSON.stringify(store));
  } catch {}
}

export function saveScene(name) {
  const store = _getSceneStore();
  const id = `sc_${Date.now()}`;
  const snapshot = Array.from(_tracks.values()).map((t) => ({
    id: t.id,
    name: t.name,
    volume: t.volume,
    pan: t.pan,
    muted: t.muted,
    gate: { ...t.gate },
    eq: {
      hp: { ...t.eq.hp },
      lmf: { ...t.eq.lmf },
      hmf: { ...t.eq.hmf },
      hf: { ...t.eq.hf },
    },
    comp: { ...t.comp },
    delay: { ...t.delay },
    reverbSend: t.reverbSend,
  }));
  store[id] = { id, name, ts: Date.now(), snapshot };
  _saveSceneStore(store);
  return id;
}

export function getScenes() {
  const store = _getSceneStore();
  return Object.values(store).sort((a, b) => b.ts - a.ts);
}

export function deleteScene(id) {
  const store = _getSceneStore();
  delete store[id];
  _saveSceneStore(store);
}

export function loadScene(sceneId) {
  const store = _getSceneStore();
  const scene = store[sceneId];
  if (!scene) return;
  scene.snapshot.forEach((snap) => {
    const t = _tracks.get(snap.id);
    if (!t) return;
    setTrackVolume(snap.id, snap.volume);
    setTrackPan(snap.id, snap.pan);
    setTrackMute(snap.id, snap.muted);
    setGate(snap.id, snap.gate.enabled, snap.gate.threshold, snap.gate.release);
    setEQBand(snap.id, "hp", snap.eq.hp);
    setEQBand(snap.id, "lmf", snap.eq.lmf);
    setEQBand(snap.id, "hmf", snap.eq.hmf);
    setEQBand(snap.id, "hf", snap.eq.hf);
    setCompFull(snap.id, snap.comp);
    setDelay(snap.id, snap.delay.enabled, snap.delay.time, snap.delay.wet);
    setReverbSend(snap.id, snap.reverbSend);
  });
  _notify();
}

// ─── Recording ────────────────────────────────────────────────────────────────

export async function startRecording(trackId) {
  if (_isRecording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    _recordingChunks = [];
    _recordingTrackId = trackId;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    _mediaRecorder = new MediaRecorder(stream, { mimeType });

    _mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) _recordingChunks.push(e.data);
    };

    _mediaRecorder.onstop = async () => {
      const blob = new Blob(_recordingChunks, { type: "audio/webm" });
      stream.getTracks().forEach((t) => t.stop());
      _isRecording = false;
      _recordingTrackId = null;
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const ctx = _getCtx();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const track = _tracks.get(trackId);
        if (track) {
          track.buffer = audioBuffer;
          const now = new Date();
          track.name = `Rec ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
        }
      } catch (e) {
        console.warn("[studioAudio] Failed to decode recording:", e);
      }
      _notify();
    };

    _mediaRecorder.start(100);
    _isRecording = true;
    _notify();
  } catch (e) {
    console.warn("[studioAudio] Mic access failed:", e);
    throw e;
  }
}

export function stopRecording() {
  if (!_isRecording || !_mediaRecorder) return;
  try {
    _mediaRecorder.stop();
  } catch (_) {}
}

// ─── Pub/sub ──────────────────────────────────────────────────────────────────

function _notify() {
  const state = {
    tracks: Array.from(_tracks.values()),
    isPlaying: _isPlaying,
    isRecording: _isRecording,
    recordingTrackId: _recordingTrackId,
  };
  _listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getState() {
  return {
    tracks: Array.from(_tracks.values()),
    isPlaying: _isPlaying,
    isRecording: _isRecording,
    recordingTrackId: _recordingTrackId,
  };
}
