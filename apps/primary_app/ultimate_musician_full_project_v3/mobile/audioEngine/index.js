/**
 * audioEngine/index.js (v2 - Modular Architecture)
 * Orchestrator for Loader, Conductor, and Timing modules.
 */

import Loader from './modules/Loader';
import Conductor from './modules/Conductor';
import TimingEngine from './TimingEngine';
import { normalizeBackendStemEntries } from "../utils/stemPayload";

// ─── Public API ─────────────────────────────────────────────────────────────

export async function initEngine() {
  // Conductor initialization if needed
}

export async function loadFromBackend(result, baseUrl) {
  const stems = normalizeBackendStemEntries(result);
  
  // 1. Load Stems in parallel
  const loadResults = await Promise.all(
    stems.map(async (stem) => {
      const url = stem.url.startsWith('/') ? `${baseUrl}${stem.url}` : stem.url;
      const sound = await Loader.loadSound(url);
      return { id: stem.type, sound };
    })
  );

  const trackSounds = new Map();
  loadResults.forEach(({ id, sound }) => {
    if (sound) trackSounds.set(id, sound);
  });

  // 2. Load Aux (Click/Guide/Pad)
  const [click, guide, pad] = await Promise.all([
    Loader.loadSound(baseUrl + result.click_track),
    Loader.loadSound(baseUrl + result.voice_guide),
    Loader.loadSound(baseUrl + result.pad_track)
  ]);

  // 3. Register with Conductor
  Conductor.setTracks(trackSounds, { click, guide, pad });
  
  // 4. Set Timing metadata
  TimingEngine.setBpm(result.bpm);
}

export async function play() { await Conductor.play(); }
export async function pause() { await Conductor.pause(); }
export async function stop() { await Conductor.stop(); }
export async function getPosition() { return Conductor.state.positionMs; }
export async function setMixerState(tracks) {
  tracks.forEach(t => {
    const sound = Conductor.trackSounds.get(t.id);
    if (sound) {
      sound.setVolumeAsync(t.mute ? 0 : t.volume).catch(() => {});
    }
  });
}

// ─── Direct Access for legacy support ────────────────────────────────────────
export { Loader, Conductor, TimingEngine };
