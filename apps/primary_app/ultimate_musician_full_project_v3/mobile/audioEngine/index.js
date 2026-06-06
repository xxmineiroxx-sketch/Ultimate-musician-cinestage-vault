/**
 * audioEngine/index.js
 * Shared orchestrator for multitrack playback, pipeline-aware jumps, and preload swaps.
 */

import { Platform } from "react-native";
import * as Loader from "./modules/Loader";
import Conductor from "./modules/Conductor";
import TimingEngine from "./TimingEngine";
import { normalizeBackendStemEntries } from "../utils/stemPayload";
import {
  applyLatencyCompensationSec,
  getAdjacentSection,
  getCurrentSection,
  quantizedJumpTarget,
} from "../services/wavePipelineEngine";

let Audio = null;
if (Platform.OS !== "web") {
  try { Audio = require("expo-av").Audio; } catch {}
}

let audioModeReady = false;
async function ensureAudioMode() {
  if (audioModeReady || !Audio) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    audioModeReady = true;
    console.log("[audioEngine] audio mode set");
  } catch (e) {
    console.log("[audioEngine] setAudioModeAsync failed:", e?.message || e);
  }
}

let pipelineConfig = null;
let preloadedBundle = null;
let activeBundleMeta = {
  source: null,
  tracks: [],
  loadedAt: null,
};

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

// Stems uploaded before the custom-domain cutover have absolute URLs pointing at
// cinestage.studio-cinestage.workers.dev, which no longer serves /storage/*.
// Rewrite to the live custom domain so legacy library data keeps playing.
function rewriteLegacyHost(url) {
  return String(url).replace(
    /^https:\/\/cinestage\.studio-cinestage\.workers\.dev\//i,
    "https://cinestage.ultimatelabs.co/",
  );
}

function resolveAudioUrl(value, baseUrl = "") {
  const raw = typeof value === "string"
    ? value
    : value?.url || value?.uri || value?.localUri || value?.file_url || value?.fileUrl || null;
  if (!raw) return null;
  if (isRemoteUrl(raw)) return rewriteLegacyHost(raw);
  if (/^file:|^asset:|^content:/i.test(raw)) return raw;
  if (!baseUrl) return raw;
  const base = String(baseUrl).replace(/\/+$/, "");
  const path = String(raw).startsWith("/") ? String(raw) : `/${raw}`;
  return rewriteLegacyHost(`${base}${path}`);
}

async function unloadSounds(sounds = []) {
  await Promise.all(
    sounds
      .filter(Boolean)
      .map((sound) => sound.unloadAsync?.().catch(() => {})),
  );
}

function currentAuxSounds() {
  return Conductor.auxSounds || { click: null, guide: null, pad: null };
}

async function loadTrackBundle(tracks = [], baseUrl = "") {
  console.log('[audioEngine] loadTrackBundle: track count=', tracks.length, 'baseUrl=', baseUrl);
  // Serial load — iOS Simulator's AVFoundation fails (-11800) when too many
  // AVPlayerItem instances are constructed concurrently. Real devices tolerate
  // parallel loads, but serial here is safe and only adds ~0.5-1s per track.
  const loadResults = [];
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    const url = resolveAudioUrl(track, baseUrl);
    console.log(`[audioEngine] track[${index}] id=${track.id} url=`, url);
    let sound = null;
    try {
      sound = url ? await Loader.loadSound(url) : null;
      console.log(`[audioEngine] track[${index}] loaded:`, Boolean(sound));
    } catch (e) {
      console.log(`[audioEngine] track[${index}] LOAD ERROR:`, String(e?.message || e));
    }
    loadResults.push({
      id: String(track.id || track.type || track.label || `track_${index}`),
      label: String(track.label || track.type || track.id || `Track ${index + 1}`),
      sound,
    });
  }

  const trackSounds = new Map();
  loadResults.forEach(({ id, sound }) => {
    if (sound) trackSounds.set(id, sound);
  });

  return {
    trackSounds,
    tracks: loadResults.map(({ id, label }) => ({ id, label })),
  };
}

async function loadAuxBundle(result = {}, baseUrl = "") {
  const [click, guide, pad] = await Promise.all([
    Loader.loadSound(resolveAudioUrl(result.click_track ?? result.clickTrack, baseUrl)).catch(() => null),
    Loader.loadSound(resolveAudioUrl(result.voice_guide ?? result.voiceGuide, baseUrl)).catch(() => null),
    Loader.loadSound(resolveAudioUrl(result.pad_track ?? result.padTrack, baseUrl)).catch(() => null),
  ]);
  return { click, guide, pad };
}

function getAllActiveSounds() {
  return Conductor.getAllSounds ? Conductor.getAllSounds() : [];
}

async function setActiveBundle(bundle, options = {}) {
  const oldSounds = getAllActiveSounds();
  const auxSounds = options.preserveAuxTracks
    ? currentAuxSounds()
    : bundle.auxSounds || { click: null, guide: null, pad: null };
  Conductor.setTracks(bundle.trackSounds || new Map(), auxSounds);
  activeBundleMeta = {
    source: bundle.source || "unknown",
    tracks: bundle.tracks || [],
    loadedAt: Date.now(),
  };

  if (options.unloadPrevious !== false) {
    const retained = new Set(getAllActiveSounds());
    await unloadSounds(oldSounds.filter((sound) => !retained.has(sound)));
  }
}

async function getMasterStatus() {
  const master = Conductor.getMasterSound?.();
  if (!master) return null;
  return master.getStatusAsync?.().catch(() => null);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function initEngine() {
  await ensureAudioMode();
  if (TimingEngine?.reset) TimingEngine.reset();
}

export async function loadFromBackend(result = {}, baseUrl = "") {
  const stems = normalizeBackendStemEntries(result);
  const { trackSounds, tracks } = await loadTrackBundle(stems, baseUrl);
  const auxSounds = await loadAuxBundle(result, baseUrl);

  await setActiveBundle({
    source: "backend",
    trackSounds,
    auxSounds,
    tracks,
  });

  TimingEngine.setBpm?.(result.bpm);
  return activeBundleMeta;
}

export async function preloadFromBackend(result = {}, baseUrl = "") {
  if (preloadedBundle) {
    await unloadSounds([
      ...Array.from(preloadedBundle.trackSounds?.values?.() || []),
      preloadedBundle.auxSounds?.click,
      preloadedBundle.auxSounds?.guide,
      preloadedBundle.auxSounds?.pad,
    ]);
  }

  const stems = normalizeBackendStemEntries(result);
  const { trackSounds, tracks } = await loadTrackBundle(stems, baseUrl);
  const auxSounds = await loadAuxBundle(result, baseUrl);
  preloadedBundle = {
    source: "preloaded-backend",
    result,
    baseUrl,
    trackSounds,
    auxSounds,
    tracks,
    loadedAt: Date.now(),
  };
  return preloadedBundle;
}

export function hasPreloadedSong() {
  return Boolean(preloadedBundle && preloadedBundle.trackSounds?.size > 0);
}

export async function activatePreloaded(mode = "CUT", fadeMs = 0) {
  if (!preloadedBundle) return false;
  const wasPlaying = Conductor.state?.mode === "playing";
  const next = preloadedBundle;
  preloadedBundle = null;

  if (mode === "CROSSFADE" && fadeMs > 0) {
    await pause().catch(() => {});
  }
  await setActiveBundle(next);
  if (next.result?.bpm) TimingEngine.setBpm?.(next.result.bpm);
  if (wasPlaying) await play();
  return true;
}

export async function replaceWithTracks(tracks = [], options = {}) {
  const { trackSounds, tracks: loadedTracks } = await loadTrackBundle(tracks);
  await setActiveBundle({
    source: "local-tracks",
    trackSounds,
    auxSounds: options.preserveAuxTracks ? currentAuxSounds() : { click: null, guide: null, pad: null },
    tracks: loadedTracks,
  }, {
    preserveAuxTracks: Boolean(options.preserveAuxTracks),
  });
  return activeBundleMeta;
}

export const loadCustomTracks = replaceWithTracks;

export async function play() {
  await Conductor.play();
}

export async function pause() {
  await Conductor.pause();
}

export async function stop() {
  await Conductor.stop();
}

export async function getPosition() {
  const status = await getMasterStatus();
  if (status?.isLoaded && Number.isFinite(status.positionMillis)) {
    Conductor.state.positionMs = status.positionMillis;
    return status.positionMillis / 1000;
  }
  return Math.max(0, Number(Conductor.state?.positionMs || 0)) / 1000;
}

export async function getDuration() {
  const status = await getMasterStatus();
  if (status?.isLoaded && Number.isFinite(status.durationMillis)) {
    return Math.max(0, status.durationMillis / 1000);
  }
  return 0;
}

export async function hasLoadedAudio() {
  const sounds = getAllActiveSounds();
  if (sounds.length === 0) return false;
  const statuses = await Promise.all(
    sounds.map((sound) => sound.getStatusAsync?.().catch(() => null)),
  );
  return statuses.some((status) => status?.isLoaded);
}

export function hasStemTracks() {
  return Conductor.trackSounds?.size > 0;
}

export async function seek(positionSec) {
  await Conductor.jumpTo(Math.max(0, Number(positionSec) || 0) * 1000);
}

export async function jumpToTime(targetSec, options = {}) {
  const bpm = options.bpm || pipelineConfig?.bpm || 120;
  const mode = options.launchQuantization
    || pipelineConfig?.performancePolicy?.launchQuantization
    || "IMMEDIATE";
  const quantized = quantizedJumpTarget(targetSec, mode, bpm);
  const compensated = applyLatencyCompensationSec(
    quantized,
    options.latencyCalibration || pipelineConfig?.latencyCalibration,
  );
  await seek(compensated);
  return {
    targetSec: Math.max(0, Number(targetSec || 0)),
    quantizedTargetSec: quantized,
    compensatedSec: compensated,
  };
}

export async function jumpToMarker(marker, options = {}) {
  if (!marker) return null;
  return jumpToTime(marker.start ?? marker.timeSec ?? marker.startSec ?? 0, options);
}

export function scheduleJumpToMarker(marker, options = {}) {
  const rawDelayMs = options.delayMs ?? Number(options.waitSec || 0) * 1000;
  const delayMs = Math.max(0, Number(rawDelayMs || 0));
  const timer = setTimeout(() => {
    jumpToMarker(marker, options).catch(() => {});
  }, delayMs);
  return () => clearTimeout(timer);
}

export function setPipelineConfig(config = null) {
  pipelineConfig = config ? { ...config } : null;
  if (config?.bpm) TimingEngine.setBpm?.(config.bpm);
  return pipelineConfig;
}

export async function getPipelineState(positionSec = null) {
  const pos = positionSec === null ? await getPosition() : Math.max(0, Number(positionSec || 0));
  const sections = pipelineConfig?.sectionMarkers || pipelineConfig?.sections || [];
  return {
    positionSec: pos,
    durationSec: pipelineConfig?.durationSec || await getDuration(),
    currentSection: getCurrentSection(sections, pos),
    nextSection: getAdjacentSection(sections, pos, 1),
    previousSection: getAdjacentSection(sections, pos, -1),
    pipelineVersion: pipelineConfig?.pipelineVersion || null,
  };
}

export async function setMixerState(tracks = []) {
  const hasSolo = tracks.some((track) => track.solo && !track.mute);
  await Promise.all(
    tracks.map(async (track) => {
      const sound = Conductor.trackSounds.get(track.id);
      if (!sound) return;
      const audible = !track.mute && (!hasSolo || track.solo);
      const volume = audible ? Math.max(0, Math.min(1, Number(track.volume ?? 1))) : 0;
      await sound.setVolumeAsync?.(volume).catch(() => {});
    }),
  );
}

export async function setPan(trackId, panValue = 0) {
  const sound = Conductor.trackSounds.get(trackId);
  if (!sound?.setVolumeAsync) return;
  const pan = Math.max(-1, Math.min(1, Number(panValue || 0)));
  await sound.setVolumeAsync(1, pan).catch(() => {});
}

export async function setPadVolume(volume = 1) {
  const pad = currentAuxSounds().pad;
  await pad?.setVolumeAsync?.(Math.max(0, Math.min(1, Number(volume || 0)))).catch(() => {});
}

export async function setPadEnabled(enabled = true) {
  const pad = currentAuxSounds().pad;
  if (!pad) return;
  if (enabled) await pad.playAsync?.().catch(() => {});
  else await pad.pauseAsync?.().catch(() => {});
}

export async function setPadPitch() {
  // Expo AV does not expose reliable real-time pitch shifting for this bundle.
}

export function setLoopRegion(startSec, endSec, label = null) {
  Conductor.state.loopRegion = {
    startSec: Math.max(0, Number(startSec || 0)),
    endSec: Math.max(0, Number(endSec || 0)),
    label,
  };
}

export function clearLoopRegion() {
  Conductor.state.loopRegion = null;
}

export async function applyConductorCommand(command = {}) {
  if (command.type === "LOOP_SECTION") {
    setLoopRegion(command.startSec, command.endSec, command.label);
    if (command.seek) await seek(command.startSec || 0);
    return true;
  }
  if (command.type === "CLEAR_LOOP") {
    clearLoopRegion();
    return true;
  }
  if (command.type === "JUMP_TO" || command.type === "SEEK") {
    await jumpToTime(command.timeSec ?? command.positionSec ?? command.startSec ?? 0, command);
    return true;
  }
  return false;
}

export async function emergencyClear() {
  clearLoopRegion();
  preloadedBundle = null;
  await stop().catch(() => {});
}

// ─── Direct Access for legacy support ────────────────────────────────────────
export { Loader, Conductor, TimingEngine };
