import { Audio } from "expo-av";

let _loaded = false;
const _state = {
  stems: [],
  trackSounds: new Map(),
  trackFx: new Map(),
  customTrackIds: new Set(),
  customTrackMeta: new Map(),
  clickSound: null,
  guideSound: null,
  padSound: null,
  clickEnabled: true,
  guideEnabled: true,
  padEnabled: true,
  padPitchSemitones: 0,
  padVolume: 1,
  baseUrl: null,
  positionMs: 0,
  fxTimeouts: [],
};

async function disposeSound(sound) {
  if (!sound) return;
  try {
    await sound.unloadAsync();
  } catch (err) {
    console.warn("Failed to unload sound", err);
  }
}

async function loadSound(url) {
  if (!url) return null;
  const sound = new Audio.Sound();
  try {
    await Promise.race([
      sound.loadAsync({ uri: url }, { shouldPlay: false, volume: 1.0 }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('load timeout')), 20000)
      ),
    ]);
    return sound;
  } catch (err) {
    console.warn('[audioEngine] loadSound failed:', url, err?.message || err);
    try { await sound.unloadAsync(); } catch { /* ignore */ }
    return null;
  }
}

async function disposeTrackSound(sound) {
  if (!sound) return;
  try {
    await sound.unloadAsync();
  } catch {
    // ignore unload errors
  }
}

function clearFxTimeouts() {
  _state.fxTimeouts.forEach((t) => clearTimeout(t));
  _state.fxTimeouts = [];
}

async function disposeFxList(fxList) {
  if (!fxList?.length) return;
  await Promise.all(fxList.map((fx) => disposeTrackSound(fx.sound)));
}

function collectFxSounds() {
  const all = [];
  for (const fxList of _state.trackFx.values()) {
    for (const fx of fxList) {
      if (fx?.sound) all.push(fx);
    }
  }
  return all;
}

async function unloadCustomTrack(id) {
  const sound = _state.trackSounds.get(id);
  await disposeTrackSound(sound);
  _state.trackSounds.delete(id);
  await disposeFxList(_state.trackFx.get(id));
  _state.trackFx.delete(id);
  _state.customTrackIds.delete(id);
  _state.customTrackMeta.delete(id);
}

async function buildFxSounds(track) {
  if (!track?.uri) return [];
  const fx = track.fx || {};
  const fxList = [];

  if ((fx.delay ?? 0) > 0) {
    const delaySound = await loadSound(track.uri);
    if (delaySound) {
      fxList.push({
        sound: delaySound,
        type: "delay",
        offsetMs: fx.delayMs ?? 220,
        baseMix: 0.6,
      });
    }
  }

  if ((fx.reverb ?? 0) > 0) {
    const reverbOffsets = [
      { offsetMs: 60, baseMix: 0.35 },
      { offsetMs: 120, baseMix: 0.2 },
    ];
    for (const cfg of reverbOffsets) {
      const reverbSound = await loadSound(track.uri);
      if (reverbSound) {
        fxList.push({
          sound: reverbSound,
          type: "reverb",
          offsetMs: cfg.offsetMs,
          baseMix: cfg.baseMix,
        });
      }
    }
  }

  return fxList;
}

export async function initEngine() {
  if (_loaded) return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });
  _loaded = true;
}

function toAbsolute(url) {
  if (!url || !_state.baseUrl) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${_state.baseUrl}${url}`;
  return url;
}

export async function loadFromBackend(result, baseUrl) {
  _state.baseUrl = baseUrl || _state.baseUrl;

  // Backend returns stems as either:
  //   array: [{ type, url, ... }]
  //   dict:  { vocals: url, drums: url, ... }
  const rawStems = result?.stems;
  const stemsArray = Array.isArray(rawStems)
    ? rawStems
    : rawStems && typeof rawStems === 'object'
    ? Object.entries(rawStems).map(([type, url]) => ({ type, url }))
    : [];

  _state.stems = stemsArray.map((stem) => ({
    ...stem,
    url: toAbsolute(stem.url),
  }));

  const existingSounds = Array.from(_state.trackSounds.values());
  await Promise.all(existingSounds.map((sound) => disposeTrackSound(sound)));
  _state.trackSounds.clear();

  for (const stem of _state.stems) {
    const sound = await loadSound(stem.url);
    if (sound) _state.trackSounds.set(stem.type, sound);
  }

  await disposeSound(_state.clickSound);
  await disposeSound(_state.guideSound);
  await disposeSound(_state.padSound);

  _state.clickSound = await loadSound(toAbsolute(result?.click_track || null));
  _state.guideSound = await loadSound(toAbsolute(result?.voice_guide || null));
  _state.padSound = await loadSound(toAbsolute(result?.pad_track || null));
  await applyPadPitch();
}

export async function loadCustomTracks(tracks) {
  const nextIds = new Set((tracks || []).map((track) => track.id));
  for (const id of Array.from(_state.customTrackIds)) {
    if (!nextIds.has(id)) {
      // eslint-disable-next-line no-await-in-loop
      await unloadCustomTrack(id);
    }
  }

  for (const track of tracks || []) {
    if (!track?.id) continue;
    const existingSound = _state.trackSounds.get(track.id);
    const existingFx = _state.trackFx.get(track.id) || [];
    const meta = _state.customTrackMeta.get(track.id);
    const delayMismatch =
      track.fx?.delayMs &&
      existingFx.some((fx) => fx.type === "delay") &&
      existingFx.some((fx) => fx.offsetMs !== track.fx.delayMs);
    const wantsFx = (track.fx?.delay ?? 0) > 0 || (track.fx?.reverb ?? 0) > 0;
    const hasFx = existingFx.length > 0;
    const shouldReload =
      !existingSound ||
      (track.uri && meta?.uri && meta.uri !== track.uri) ||
      delayMismatch ||
      wantsFx !== hasFx;

    if (shouldReload) {
      // eslint-disable-next-line no-await-in-loop
      await unloadCustomTrack(track.id);
    }

    if (!_state.trackSounds.get(track.id) && track.uri) {
      // eslint-disable-next-line no-await-in-loop
      const sound = await loadSound(track.uri);
      if (sound) _state.trackSounds.set(track.id, sound);
      // eslint-disable-next-line no-await-in-loop
      const fxList = await buildFxSounds(track);
      _state.trackFx.set(track.id, fxList);
      _state.customTrackIds.add(track.id);
      _state.customTrackMeta.set(track.id, {
        uri: track.uri,
        delayMs: track.fx?.delayMs ?? null,
      });
    } else {
      if (wantsFx && existingFx.length === 0) {
        // eslint-disable-next-line no-await-in-loop
        const fxList = await buildFxSounds(track);
        _state.trackFx.set(track.id, fxList);
      } else if (!wantsFx && existingFx.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await disposeFxList(existingFx);
        _state.trackFx.set(track.id, []);
      } else {
        _state.trackFx.set(track.id, existingFx);
      }
      _state.customTrackIds.add(track.id);
      _state.customTrackMeta.set(track.id, {
        uri: track.uri || meta?.uri || null,
        delayMs: track.fx?.delayMs ?? meta?.delayMs ?? null,
      });
    }
  }
}

export function setMixerState(tracksState) {
  const anySolo = tracksState.some((track) => track.solo);
  tracksState.forEach((track, index) => {
    const sound = _state.trackSounds.get(track.id);
    if (!sound) return;
    const shouldMute = track.mute || (anySolo && !track.solo);
    const baseVolume = shouldMute
      ? 0
      : Math.max(0, Math.min(track.volume ?? 1, 1));
    const eq = track.fx?.eq || {};
    const eqGain = ((eq.low ?? 0.5) + (eq.mid ?? 0.5) + (eq.high ?? 0.5)) / 3;
    const eqFactor = 0.6 + 0.8 * eqGain;
    const volume = Math.max(0, Math.min(baseVolume * eqFactor, 1));
    sound.setVolumeAsync(volume).catch(() => {});

    const fxList = _state.trackFx.get(track.id) || [];
    const fx = track.fx || {};
    fxList.forEach((fxItem) => {
      let mix = fxItem.baseMix;
      if (fxItem.type === "delay") {
        mix *= fx.delay ?? 0;
      } else if (fxItem.type === "reverb") {
        mix *= fx.reverb ?? 0;
      }
      const fxVolume = shouldMute ? 0 : volume * mix;
      fxItem.sound.setVolumeAsync(fxVolume).catch(() => {});
    });
  });
}

export function setClickEnabled(on) {
  _state.clickEnabled = on;
  if (_state.clickSound) {
    _state.clickSound.setVolumeAsync(on ? 1 : 0).catch(() => {});
  }
}

export function setGuideEnabled(on) {
  _state.guideEnabled = on;
  if (_state.guideSound) {
    _state.guideSound.setVolumeAsync(on ? 1 : 0).catch(() => {});
  }
}

export function setPadEnabled(on) {
  _state.padEnabled = on;
  if (_state.padSound) {
    _state.padSound.setVolumeAsync(on ? _state.padVolume : 0).catch(() => {});
  }
}

async function applyPadPitch() {
  if (!_state.padSound) return;
  const semitones = _state.padPitchSemitones || 0;
  const rate = Math.pow(2, semitones / 12);
  try {
    await _state.padSound.setRateAsync(rate, true);
  } catch {
    // ignore pitch errors on some devices
  }
}

export async function setPadPitch(semitones) {
  _state.padPitchSemitones = semitones || 0;
  await applyPadPitch();
}

export async function setPadVolume(vol) {
  const clamped = Math.max(0, Math.min(vol ?? 1, 1.5));
  _state.padVolume = clamped;
  if (_state.padSound) {
    _state.padSound
      .setVolumeAsync(_state.padEnabled ? clamped : 0)
      .catch(() => {});
  }
}

export function play() {
  const position = _state.positionMs || 0;
  const sounds = [
    ..._state.trackSounds.values(),
    _state.clickSound,
    _state.guideSound,
    _state.padSound,
  ].filter(Boolean);
  sounds.forEach((sound) => {
    sound.setPositionAsync(position).catch(() => {});
  });
  sounds.forEach((sound) => {
    sound.playAsync().catch(() => {});
  });
  clearFxTimeouts();
  const fxSounds = collectFxSounds();
  fxSounds.forEach((fx) => {
    const offset = fx.offsetMs || 0;
    const delayedPosition = Math.max(0, position - offset);
    fx.sound.setPositionAsync(delayedPosition).catch(() => {});
    const waitMs = Math.max(0, offset - position);
    if (waitMs > 0) {
      const timeoutId = setTimeout(() => {
        fx.sound.playAsync().catch(() => {});
      }, waitMs);
      _state.fxTimeouts.push(timeoutId);
    } else {
      fx.sound.playAsync().catch(() => {});
    }
  });
  setClickEnabled(_state.clickEnabled);
  setGuideEnabled(_state.guideEnabled);
  setPadEnabled(_state.padEnabled);
  applyPadPitch();
}

export async function pause() {
  clearFxTimeouts();
  const sounds = [
    ..._state.trackSounds.values(),
    ...collectFxSounds().map((fx) => fx.sound),
    _state.clickSound,
    _state.guideSound,
    _state.padSound,
  ].filter(Boolean);
  for (const sound of sounds) {
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        _state.positionMs = status.positionMillis;
        await sound.pauseAsync();
      }
    } catch (_err) {
      // ignore
    }
  }
}

export function seek(seconds) {
  const nextPosition = Math.max(0, Math.floor(seconds * 1000));
  _state.positionMs = nextPosition;
  const sounds = [
    ..._state.trackSounds.values(),
    ...collectFxSounds().map((fx) => fx.sound),
    _state.clickSound,
    _state.guideSound,
    _state.padSound,
  ].filter(Boolean);
  sounds.forEach((sound) => {
    sound.setPositionAsync(nextPosition).catch(() => {});
  });
  const fxSounds = collectFxSounds();
  fxSounds.forEach((fx) => {
    const offset = fx.offsetMs || 0;
    const delayedPosition = Math.max(0, nextPosition - offset);
    fx.sound.setPositionAsync(delayedPosition).catch(() => {});
  });
}

export async function getPosition() {
  const sound = _state.trackSounds.values().next().value || _state.clickSound;
  if (!sound) return 0;
  try {
    const status = await sound.getStatusAsync();
    return status.isLoaded ? status.positionMillis / 1000 : 0;
  } catch (_err) {
    return 0;
  }
}

export async function getDuration() {
  const sound = _state.trackSounds.values().next().value || _state.clickSound;
  if (!sound) return 0;
  try {
    const status = await sound.getStatusAsync();
    return status.isLoaded ? (status.durationMillis || 0) / 1000 : 0;
  } catch {
    return 0;
  }
}

export async function stop() {
  clearFxTimeouts();
  _state.positionMs = 0;
  const sounds = [
    ..._state.trackSounds.values(),
    ...collectFxSounds().map((fx) => fx.sound),
    _state.clickSound,
    _state.guideSound,
    _state.padSound,
  ].filter(Boolean);
  for (const sound of sounds) {
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) await sound.stopAsync();
    } catch { /* ignore */ }
  }
}
