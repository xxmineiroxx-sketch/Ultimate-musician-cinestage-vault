import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { normalizeBackendStemEntries } from "../utils/stemPayload";

let _loaded = false;
const PORTABLE_LOCAL_STEM_DIRS = ["um_stems", "stems"];
const AUDIO_CACHE_DIR = FileSystem.cacheDirectory
  ? `${FileSystem.cacheDirectory}um_audio_cache/`
  : null;
const _state = {
  stems: [],
  trackSounds: new Map(),
  trackFx: new Map(),
  customTrackIds: new Set(),
  customTrackMeta: new Map(),
  masterTrackId: null,
  syncTimer: null,
  syncInFlight: false,
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
  loopRegion: null,
  lastLoopJumpAt: 0,
  conductorState: {
    lastCommand: null,
    mode: "idle",
    updatedAt: 0,
  },
  fxTimeouts: [],
  preloaded: null,
};

async function disposeSound(sound) {
  if (!sound) return;
  try {
    await sound.unloadAsync();
  } catch (err) {
    console.warn("Failed to unload sound", err);
  }
}

function looksLikeRemoteAudioUrl(url) {
  return /^https?:\/\//i.test(String(url || "").trim());
}

function fileExtensionFromUrl(url) {
  try {
    const pathname = new URL(String(url || "")).pathname || "";
    const match = pathname.match(/(\.[a-z0-9]{2,5})$/i);
    return match ? match[1].toLowerCase() : ".audio";
  } catch {
    const match = String(url || "").match(/(\.[a-z0-9]{2,5})(?:[?#].*)?$/i);
    return match ? match[1].toLowerCase() : ".audio";
  }
}

function stableHash(value) {
  let hash = 2166136261;
  const input = String(value || "");
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function ensureAudioCacheDir() {
  if (!AUDIO_CACHE_DIR) return null;
  const info = await FileSystem.getInfoAsync(AUDIO_CACHE_DIR).catch(() => null);
  if (!info?.exists) {
    await FileSystem.makeDirectoryAsync(AUDIO_CACHE_DIR, {
      intermediates: true,
    }).catch(() => {});
  }
  return AUDIO_CACHE_DIR;
}

async function cacheRemoteAudioUrl(url) {
  if (!looksLikeRemoteAudioUrl(url)) return null;
  const dir = await ensureAudioCacheDir();
  if (!dir) return null;

  const targetUri = `${dir}${stableHash(url)}${fileExtensionFromUrl(url)}`;
  const existing = await FileSystem.getInfoAsync(targetUri).catch(() => null);
  if (existing?.exists && Number(existing.size || 0) > 0) {
    return targetUri;
  }

  const download = await FileSystem.downloadAsync(url, targetUri).catch(() => null);
  const nextUri = download?.uri || targetUri;
  const downloaded = await FileSystem.getInfoAsync(nextUri).catch(() => null);
  return downloaded?.exists && Number(downloaded.size || 0) > 0
    ? nextUri
    : null;
}

async function loadSoundFromUri(uri, timeoutMs = 12000) {
  const sound = new Audio.Sound();
  try {
    await Promise.race([
      sound.loadAsync({ uri }, { shouldPlay: false, volume: 1.0 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("load timeout")), timeoutMs)),
    ]);
    return sound;
  } catch (err) {
    await disposeTrackSound(sound);
    throw err;
  }
}

async function loadSound(url) {
  if (!url) return null;
  if (typeof url !== "string") return null;
  if (url === "null" || url === "undefined") return null;
  // YouTube page URLs cannot be streamed as audio — skip them gracefully
  if (/youtube\.com|youtu\.be/i.test(url)) return null;

  try {
    return await loadSoundFromUri(url, 12000);
  } catch (err) {
    console.warn("[audioEngine] direct load failed:", url, err?.message);
  }

  if (!looksLikeRemoteAudioUrl(url)) return null;

  try {
    const cachedUri = await cacheRemoteAudioUrl(url);
    if (!cachedUri) {
      console.warn("[audioEngine] cache download failed:", url);
      return null;
    }
    return await loadSoundFromUri(cachedUri, 12000);
  } catch (err) {
    console.warn("[audioEngine] cached load failed:", url, err?.message);
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

function setConductorState(lastCommand, mode) {
  _state.conductorState = {
    lastCommand,
    mode,
    updatedAt: Date.now(),
  };
}

function getLoopRegionSnapshot() {
  return _state.loopRegion
    ? {
        ..._state.loopRegion,
        metadata: { ...(_state.loopRegion.metadata || {}) },
      }
    : null;
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

function collectMainSounds() {
  return [
    ..._state.trackSounds.values(),
    _state.clickSound,
    _state.guideSound,
    _state.padSound,
  ].filter(Boolean);
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

function resolvePortableLocalFileUri(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed.startsWith("file://") || !FileSystem.documentDirectory) return trimmed;

  const normalized = trimmed
    .replace(/^file:\/\//i, "")
    .replace(/\\/g, "/");

  for (const dir of PORTABLE_LOCAL_STEM_DIRS) {
    const marker = `/${dir}/`;
    const idx = normalized.indexOf(marker);
    if (idx >= 0) {
      const relativePath = normalized.slice(idx + 1).replace(/^\/+/, "");
      return `${FileSystem.documentDirectory}${relativePath}`;
    }
  }

  return trimmed;
}

function trackUriValue(track) {
  if (typeof track === "string") {
    const trimmed = String(track || "").trim();
    return trimmed ? resolvePortableLocalFileUri(trimmed) : null;
  }
  return resolvePortableLocalFileUri(
    track?.uri
    || track?.url
    || track?.localUri
    || track?.file_url
    || track?.fileUrl
    || track?.downloadUrl
    || track?.streamUrl
    || null,
  );
}

function cueMasterRank(text = "") {
  const key = String(text || "").toLowerCase();
  if (/click|metronome/.test(key)) return 4;
  if (/guide|guia|voice[\s_-]?guide|voz ensaio|ensaio/.test(key)) return 3;
  if (/cue|count[\s_-]?in/.test(key)) return 2;
  if (/pad|drone|ambient/.test(key)) return 1;
  return 0;
}

function stopSyncLoop() {
  if (_state.syncTimer) {
    clearInterval(_state.syncTimer);
    _state.syncTimer = null;
  }
}

function getMasterSound() {
  switch (_state.masterTrackId) {
    case "__click__":
      return _state.clickSound;
    case "__guide__":
      return _state.guideSound;
    case "__pad__":
      return _state.padSound;
    default:
      return (
        _state.trackSounds.get(_state.masterTrackId)
        || _state.trackSounds.get(String(_state.masterTrackId || "").toLowerCase())
        || _state.clickSound
        || _state.guideSound
        || _state.trackSounds.values().next().value
        || null
      );
  }
}

function refreshMasterTrackId() {
  if (_state.clickSound) {
    _state.masterTrackId = "__click__";
    return _state.masterTrackId;
  }
  if (_state.guideSound) {
    _state.masterTrackId = "__guide__";
    return _state.masterTrackId;
  }

  let best = null;
  let bestRank = -1;
  for (const [id] of _state.trackSounds.entries()) {
    const meta = _state.customTrackMeta.get(id) || {};
    const rank = cueMasterRank(`${id} ${meta.label || ""} ${meta.type || ""}`);
    if (rank > bestRank) {
      best = id;
      bestRank = rank;
    }
  }

  _state.masterTrackId = best || null;
  return _state.masterTrackId;
}

async function getMasterTimelineState() {
  const masterSound = getMasterSound();
  const status = await masterSound?.getStatusAsync?.().catch(() => null);
  return {
    position: Number(status?.positionMillis ?? _state.positionMs ?? 0),
    playing: Boolean(status?.shouldPlay || status?.isPlaying),
  };
}

async function syncTracksToMaster() {
  if (_state.syncInFlight) return;
  _state.syncInFlight = true;
  try {
    const masterSound = getMasterSound();
    if (!masterSound || typeof masterSound.getStatusAsync !== "function") return;

    const masterStatus = await masterSound.getStatusAsync().catch(() => null);
    if (!masterStatus?.isLoaded) return;

    const masterPos = Number(masterStatus.positionMillis || 0);
    const masterPlaying = Boolean(masterStatus.shouldPlay || masterStatus.isPlaying);
    const loopRegion = _state.loopRegion;

    if (
      masterPlaying
      && loopRegion?.enabled
      && loopRegion.endMs > loopRegion.startMs + 50
      && masterPos >= loopRegion.endMs - 120
    ) {
      const now = Date.now();
      if (now - _state.lastLoopJumpAt > 180) {
        _state.lastLoopJumpAt = now;
        await setTimelinePositionMs(loopRegion.startMs, true);
      }
      return;
    }

    const mainEntries = [
      ...Array.from(_state.trackSounds.entries()).map(([id, sound]) => ({ id, sound, targetPos: masterPos })),
      { id: "__click__", sound: _state.clickSound, targetPos: masterPos },
      { id: "__guide__", sound: _state.guideSound, targetPos: masterPos },
      { id: "__pad__", sound: _state.padSound, targetPos: masterPos },
    ].filter((entry) => entry.sound);

    await Promise.all(
      mainEntries.map(async ({ id, sound, targetPos }) => {
        if (!sound || id === _state.masterTrackId) return;
        const status = await sound.getStatusAsync().catch(() => null);
        if (!status?.isLoaded) return;
        const drift = Math.abs(Number(status.positionMillis || 0) - targetPos);
        // 180ms threshold: smaller drifts are inaudible; seeking while playing
        // causes an audible glitch (the "cutting" artifact on voice stems).
        // Only force-seek when the track is stalled (not playing) or severely drifted.
        const trackIsPlaying = Boolean(status.isPlaying || status.shouldPlay);
        if (drift < 180) return;
        if (trackIsPlaying && drift < 500) return;

        const nextStatus = masterPlaying
          ? { shouldPlay: true, positionMillis: targetPos }
          : { positionMillis: targetPos };
        await sound.setStatusAsync(nextStatus).catch(() => {});
      }),
    );

    const fxEntries = collectFxSounds();
    await Promise.all(
      fxEntries.map(async (fx) => {
        const targetPos = Math.max(0, masterPos - (fx.offsetMs || 0));
        const status = await fx.sound.getStatusAsync().catch(() => null);
        if (!status?.isLoaded) return;
        const drift = Math.abs(Number(status.positionMillis || 0) - targetPos);
        const trackIsPlaying = Boolean(status.isPlaying || status.shouldPlay);
        if (drift < 180) return;
        if (trackIsPlaying && drift < 500) return;
        const nextStatus = masterPlaying
          ? { shouldPlay: true, positionMillis: targetPos }
          : { positionMillis: targetPos };
        await fx.sound.setStatusAsync(nextStatus).catch(() => {});
      }),
    );
  } finally {
    _state.syncInFlight = false;
  }
}

function startSyncLoop() {
  stopSyncLoop();
  _state.syncTimer = setInterval(() => {
    syncTracksToMaster().catch(() => {});
  }, 350);
}

function clampPan(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-1, Math.min(1, parsed));
}

function applySoundMix(sound, volume, pan = 0) {
  if (!sound || typeof sound.setVolumeAsync !== "function") return;
  const safeVolume = Math.max(0, Math.min(Number(volume ?? 1), 1));
  const safePan = clampPan(pan);

  // Expo AV guarantees setVolumeAsync(volume, audioPan?) and setStatusAsync().
  // Some builds do not expose setPanAsync on Sound objects, so guard it.
  if (typeof sound.setPanAsync === "function") {
    sound.setVolumeAsync(safeVolume).catch(() => {});
    sound.setPanAsync(safePan).catch(() => {});
    return;
  }

  sound.setVolumeAsync(safeVolume, safePan).catch(() => {});
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

async function createBundleFromResult(result, baseUrl) {
  const toAbs = (url) => {
    if (!url) return null;
    if (typeof url !== "string") return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("/")) return `${baseUrl || ""}${url}`;
    return url;
  };

  const stems = normalizeBackendStemEntries(result).map((stem) => ({
    ...stem,
    url: toAbs(trackUriValue(stem)),
  }));

  // ── Load ALL stems in parallel so they finish buffering at the same time ──
  // Sequential loading causes the first stem to buffer much earlier than the
  // last, creating startup jitter when play() fires them simultaneously.
  const loadResults = await Promise.all(
    stems.map(async (stem) => {
      const sound = await loadSound(stem.url);
      return { id: stem.id || stem.type, sound };
    }),
  );

  const trackSounds = new Map();
  for (const { id, sound } of loadResults) {
    if (sound) trackSounds.set(id, sound);
  }

  // Load click/guide/pad in parallel as well
  const [clickSound, guideSound, padSound] = await Promise.all([
    loadSound(toAbs(result?.click_track || null)),
    loadSound(toAbs(result?.voice_guide || null)),
    loadSound(toAbs(result?.pad_track || null)),
  ]);

  // ── Sync prime: seek all loaded sounds to position 0 ──────────────────────
  // This forces iOS to pre-buffer the audio start for each track so the first
  // play() call fires from a uniform buffered state → tighter sync.
  const allSounds = [
    ...[...trackSounds.values()],
    clickSound,
    guideSound,
    padSound,
  ].filter(Boolean);
  await primeSoundsAtPosition(allSounds, 0);

  return {
    stems,
    trackSounds,
    trackFx: new Map(),
    clickSound,
    guideSound,
    padSound,
  };
}

function collectBundleSounds(bundle) {
  if (!bundle) return [];
  const fx = [];
  for (const fxList of bundle.trackFx?.values?.() || []) {
    for (const item of fxList || []) {
      if (item?.sound) fx.push(item.sound);
    }
  }
  return [
    ...(bundle.trackSounds?.values?.() || []),
    ...fx,
    bundle.clickSound,
    bundle.guideSound,
    bundle.padSound,
  ].filter(Boolean);
}

async function primeSoundsAtPosition(sounds, positionMillis = 0) {
  const nextPosition = Math.max(0, Math.floor(positionMillis || 0));
  await Promise.all(
    (sounds || [])
      .filter(Boolean)
      .map((sound) =>
        sound.setStatusAsync({ shouldPlay: false, positionMillis: nextPosition }).catch(() => {}),
      ),
  );
}

async function unloadBundle(bundle) {
  if (!bundle) return;
  const sounds = collectBundleSounds(bundle);
  for (const sound of sounds) {
    // eslint-disable-next-line no-await-in-loop
    await disposeTrackSound(sound);
  }
}

function activeBundleSnapshot() {
  return {
    stems: _state.stems,
    trackSounds: _state.trackSounds,
    trackFx: _state.trackFx,
    masterTrackId: _state.masterTrackId,
    clickSound: _state.clickSound,
    guideSound: _state.guideSound,
    padSound: _state.padSound,
  };
}

function setActiveBundle(bundle) {
  stopSyncLoop();
  _state.stems = bundle?.stems || [];
  _state.trackSounds = bundle?.trackSounds || new Map();
  _state.trackFx = bundle?.trackFx || new Map();
  _state.masterTrackId = bundle?.masterTrackId || null;
  _state.clickSound = bundle?.clickSound || null;
  _state.guideSound = bundle?.guideSound || null;
  _state.padSound = bundle?.padSound || null;
  refreshMasterTrackId();
}

export async function loadFromBackend(result, baseUrl) {
  _state.baseUrl = baseUrl || _state.baseUrl;
  const next = await createBundleFromResult(result, _state.baseUrl);
  const previous = activeBundleSnapshot();
  setActiveBundle(next);
  await unloadBundle(previous);
  if (_state.preloaded) {
    await unloadBundle(_state.preloaded);
    _state.preloaded = null;
  }
  await applyPadPitch();
  // When stems are loaded, silence the voice guide — it would otherwise mix
  // with the vocal stem and create a comb-filter "robotic" artifact.
  if (_state.trackSounds.size > 0 && _state.guideSound) {
    setGuideEnabled(false);
    _state.guideSound.setPositionAsync(0).catch(() => {});
  }
}

export async function preloadFromBackend(result, baseUrl) {
  _state.baseUrl = baseUrl || _state.baseUrl;
  const bundle = await createBundleFromResult(result, _state.baseUrl);
  if (_state.preloaded) await unloadBundle(_state.preloaded);
  _state.preloaded = bundle;
  return true;
}

async function fadeVolumes(oldSounds, newSounds, durationMs = 1200) {
  const steps = 12;
  const stepMs = Math.max(16, Math.floor(durationMs / steps));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const oldGain = Math.max(0, 1 - t);
    const newGain = Math.max(0, t);
    oldSounds.forEach((sound) => sound.setVolumeAsync(oldGain).catch(() => {}));
    newSounds.forEach((sound) => sound.setVolumeAsync(newGain).catch(() => {}));
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

export async function activatePreloaded(transitionMode = "CUT", transitionMs = 1200) {
  if (!_state.preloaded) return false;
  const previous = activeBundleSnapshot();
  const next = _state.preloaded;
  _state.preloaded = null;

  if (transitionMode === "CUT") {
    setActiveBundle(next);
    await stop();
    _state.positionMs = 0;
    await unloadBundle(previous);
    await applyPadPitch();
    return true;
  }

  const oldSounds = collectBundleSounds(previous);
  const newSounds = collectBundleSounds(next);
  newSounds.forEach((sound) => {
    sound.setPositionAsync(0).catch(() => {});
    sound.setVolumeAsync(0).catch(() => {});
    sound.playAsync().catch(() => {});
  });

  if (transitionMode === "OVERLAP") {
    await fadeVolumes(oldSounds, newSounds, Math.max(400, transitionMs));
  } else {
    await fadeVolumes(oldSounds, newSounds, Math.max(300, transitionMs));
  }

  oldSounds.forEach((sound) => sound.pauseAsync().catch(() => {}));
  await unloadBundle(previous);
  setActiveBundle(next);
  _state.positionMs = 0;
  await applyPadPitch();
  setClickEnabled(_state.clickEnabled);
  setGuideEnabled(_state.guideEnabled);
  setPadEnabled(_state.padEnabled);
  return true;
}

export function hasPreloadedSong() {
  return Boolean(_state.preloaded);
}

/** True when stem tracks (from CineStage) are loaded — guide cues should be suppressed. */
export function hasStemTracks() {
  return _state.trackSounds.size > 0;
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
    const existingFx = _state.trackFx.get(track.id) || [];
    const meta = _state.customTrackMeta.get(track.id);
    const nextUri = trackUriValue(track);
    const delayMismatch =
      track.fx?.delayMs &&
      existingFx.some((fx) => fx.type === "delay") &&
      existingFx.some((fx) => fx.offsetMs !== track.fx.delayMs);
    const wantsFx = (track.fx?.delay ?? 0) > 0 || (track.fx?.reverb ?? 0) > 0;
    const hasFx = existingFx.length > 0;
    const shouldReload =
      !_state.trackSounds.get(track.id) ||
      (nextUri && (!meta?.uri || meta.uri !== nextUri)) ||
      delayMismatch ||
      wantsFx !== hasFx;

    if (shouldReload) {
      // eslint-disable-next-line no-await-in-loop
      await unloadCustomTrack(track.id);
    } else {
      if (wantsFx && existingFx.length === 0) {
        // eslint-disable-next-line no-await-in-loop
        const fxList = await buildFxSounds({ ...track, uri: nextUri || trackUriValue(track) });
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
        uri: nextUri || meta?.uri || null,
        delayMs: track.fx?.delayMs ?? meta?.delayMs ?? null,
        label: track.label || meta?.label || track.id,
        type: track.type || meta?.type || null,
      });
    }
  }

  const tracksToLoad = (tracks || []).filter((track) => {
    if (!track?.id) return false;
    if (_state.trackSounds.get(track.id)) return false;
    return Boolean(trackUriValue(track));
  });

  const loadedTracks = await Promise.all(
    tracksToLoad.map(async (track) => {
      const nextUri = trackUriValue(track);
      const [sound, fxList] = await Promise.all([
        loadSound(nextUri),
        buildFxSounds({ ...track, uri: nextUri }),
      ]);

      return {
        id: track.id,
        uri: nextUri,
        delayMs: track.fx?.delayMs ?? null,
        sound,
        fxList,
      };
    }),
  );

  loadedTracks.forEach(({ id, uri, delayMs, sound, fxList }) => {
    if (sound) _state.trackSounds.set(id, sound);
    _state.trackFx.set(id, fxList);
    _state.customTrackIds.add(id);
    const track = tracksToLoad.find((item) => item.id === id) || {};
    _state.customTrackMeta.set(id, {
      uri,
      delayMs,
      label: track.label || id,
      type: track.type || null,
    });
  });

  refreshMasterTrackId();

  await primeSoundsAtPosition(
    [
      ..._state.trackSounds.values(),
      ...collectFxSounds().map((fx) => fx.sound),
    ],
    _state.positionMs || 0,
  );
}

export async function replaceWithTracks(tracks, options = {}) {
  const preserveAuxTracks = options?.preserveAuxTracks === true;
  clearFxTimeouts();
  stopSyncLoop();
  _state.positionMs = 0;
  const previous = activeBundleSnapshot();
  setActiveBundle({
    stems: [],
    trackSounds: new Map(),
    trackFx: new Map(),
    clickSound: preserveAuxTracks ? previous.clickSound : null,
    guideSound: preserveAuxTracks ? previous.guideSound : null,
    padSound: preserveAuxTracks ? previous.padSound : null,
  });
  await unloadBundle({
    stems: previous.stems,
    trackSounds: previous.trackSounds,
    trackFx: previous.trackFx,
    clickSound: preserveAuxTracks ? null : previous.clickSound,
    guideSound: preserveAuxTracks ? null : previous.guideSound,
    padSound: preserveAuxTracks ? null : previous.padSound,
  });
  if (_state.preloaded) {
    await unloadBundle(_state.preloaded);
    _state.preloaded = null;
  }
  _state.customTrackIds.clear();
  _state.customTrackMeta.clear();
  await loadCustomTracks(
    (tracks || []).map((track) => ({
      ...track,
      uri: trackUriValue(track),
    })),
  );
  await primeSoundsAtPosition(
    [
      ..._state.trackSounds.values(),
      ...collectFxSounds().map((fx) => fx.sound),
      _state.clickSound,
      _state.guideSound,
      _state.padSound,
    ],
    0,
  );
  setClickEnabled(_state.clickEnabled);
  setGuideEnabled(_state.guideEnabled);
  setPadEnabled(_state.padEnabled);
  await applyPadPitch();
}

export function setMixerState(tracksState) {
  const anySolo = tracksState.some((track) => track.solo);
  tracksState.forEach((track, index) => {
    const sound = _state.trackSounds.get(track.id) || _state.trackSounds.get(track.type);
    if (!sound) return;
    const shouldMute = track.mute || (anySolo && !track.solo);
    const baseVolume = shouldMute
      ? 0
      : Math.max(0, Math.min(track.volume ?? 1, 1));
    const eq = track.fx?.eq || {};
    const eqGain = ((eq.low ?? 0.5) + (eq.mid ?? 0.5) + (eq.high ?? 0.5)) / 3;
    const eqFactor = 0.6 + 0.8 * eqGain;
    const volume = Math.max(0, Math.min(baseVolume * eqFactor, 1));
    applySoundMix(sound, volume, track.pan ?? 0);

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

export async function setPan(trackId, panValue) {
  const clamped = Math.max(-1, Math.min(1, panValue));
  const sound = _state.trackSounds.get(trackId) || _state.trackSounds.get(String(trackId || "").toLowerCase());
  if (sound) {
    try {
      if (typeof sound.setPanAsync === "function") {
        await sound.setPanAsync(clamped);
      } else if (typeof sound.getStatusAsync === "function" && typeof sound.setVolumeAsync === "function") {
        const status = await sound.getStatusAsync().catch(() => null);
        const volume = Number(status?.volume ?? 1);
        await sound.setVolumeAsync(Math.max(0, Math.min(volume, 1)), clamped);
      }
    } catch {}
  }
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

async function setTimelinePositionMs(nextPositionMs, forceShouldPlay = null) {
  const nextPosition = Math.max(0, Math.floor(Number(nextPositionMs) || 0));
  _state.positionMs = nextPosition;
  const { playing } = forceShouldPlay == null
    ? await getMasterTimelineState()
    : { playing: Boolean(forceShouldPlay) };

  clearFxTimeouts();
  const mainSounds = collectMainSounds();
  const mainStatus = playing
    ? { shouldPlay: true, positionMillis: nextPosition }
    : { positionMillis: nextPosition };

  await Promise.all(
    mainSounds.map((sound) =>
      sound.setStatusAsync(mainStatus).catch(() => {}),
    ),
  );

  const fxSounds = collectFxSounds();
  fxSounds.forEach((fx) => {
    const offset = fx.offsetMs || 0;
    const delayedPosition = Math.max(0, nextPosition - offset);
    if (!playing) {
      fx.sound
        .setStatusAsync({ shouldPlay: false, positionMillis: delayedPosition })
        .catch(() => {});
      return;
    }

    if (nextPosition < offset) {
      fx.sound
        .setStatusAsync({ shouldPlay: false, positionMillis: 0 })
        .catch(() => {});
      const timeoutId = setTimeout(() => {
        fx.sound.playAsync().catch(() => {});
      }, offset - nextPosition);
      _state.fxTimeouts.push(timeoutId);
      return;
    }

    fx.sound
      .setStatusAsync({ shouldPlay: true, positionMillis: delayedPosition })
      .catch(() => {});
  });

  return nextPosition;
}

export function setLoopRegion(startSec, endSec, metadata = {}) {
  const startMs = Math.max(0, Math.floor(Number(startSec || 0) * 1000));
  const endMs = Math.max(startMs, Math.floor(Number(endSec || 0) * 1000));

  if (endMs <= startMs + 50) {
    _state.loopRegion = null;
    return null;
  }

  _state.loopRegion = {
    enabled: true,
    startSec: startMs / 1000,
    endSec: endMs / 1000,
    startMs,
    endMs,
    label: metadata?.label || null,
    metadata: { ...metadata },
  };
  _state.lastLoopJumpAt = 0;
  setConductorState("SET_LOOP_REGION", "looping");
  return getLoopRegionSnapshot();
}

export function clearLoopRegion() {
  _state.loopRegion = null;
  _state.lastLoopJumpAt = 0;
  setConductorState(
    "CLEAR_LOOP",
    _state.syncTimer ? "playing" : (_state.positionMs > 0 ? "paused" : "ready"),
  );
  return null;
}

export function getLoopRegion() {
  return getLoopRegionSnapshot();
}

export function getConductorState() {
  return {
    ..._state.conductorState,
    loopRegion: getLoopRegionSnapshot(),
  };
}

export async function play() {
  refreshMasterTrackId();
  const position = _state.positionMs || 0;
  await setTimelinePositionMs(position, true);
  setClickEnabled(_state.clickEnabled);
  setGuideEnabled(_state.guideEnabled);
  setPadEnabled(_state.padEnabled);
  applyPadPitch();
  setConductorState("PLAY", _state.loopRegion?.enabled ? "looping" : "playing");
  syncTracksToMaster().catch(() => {});
  startSyncLoop();
}

export async function pause() {
  clearFxTimeouts();
  stopSyncLoop();
  const sounds = [
    ...collectMainSounds(),
    ...collectFxSounds().map((fx) => fx.sound),
  ].filter(Boolean);
  const { position } = await getMasterTimelineState();
  _state.positionMs = position;
  setConductorState("PAUSE", "paused");
  await Promise.all(sounds.map((sound) => sound.pauseAsync().catch(() => {})));
}

export async function seek(seconds) {
  await setTimelinePositionMs(Number(seconds || 0) * 1000);
  setConductorState("SEEK", _state.loopRegion?.enabled ? "looping" : "ready");
  syncTracksToMaster().catch(() => {});
}

export async function getPosition() {
  const sound = getMasterSound();
  if (!sound) return 0;
  try {
    const status = await sound.getStatusAsync();
    return status.isLoaded ? status.positionMillis / 1000 : 0;
  } catch (_err) {
    return 0;
  }
}

export async function getDuration() {
  const sounds = [getMasterSound(), ...collectMainSounds()].filter(Boolean);
  if (!sounds.length) return 0;

  let maxDurationMillis = 0;
  await Promise.all(
    sounds.map(async (sound) => {
      const status = await sound?.getStatusAsync?.().catch(() => null);
      if (!status?.isLoaded) return;
      maxDurationMillis = Math.max(
        maxDurationMillis,
        Number(status.durationMillis || 0),
      );
    }),
  );

  return maxDurationMillis / 1000;
}

export async function hasLoadedAudio() {
  const sounds = collectMainSounds();
  if (!sounds.length) return false;
  const statuses = await Promise.all(
    sounds.map((sound) => sound?.getStatusAsync?.().catch(() => null)),
  );
  return statuses.some((status) => Boolean(status?.isLoaded));
}

export async function stop() {
  clearFxTimeouts();
  stopSyncLoop();
  _state.positionMs = 0;
  _state.lastLoopJumpAt = 0;
  setConductorState("STOP", "stopped");
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
        await sound.stopAsync();
      }
    } catch {
      // ignore stop errors
    }
  }
}

// Instantly zero all active sounds — for emergency mute in live settings
export function emergencyClear() {
  const sounds = [
    ..._state.trackSounds.values(),
    ...collectFxSounds().map((fx) => fx.sound),
    _state.clickSound,
    _state.guideSound,
    _state.padSound,
  ].filter(Boolean);
  sounds.forEach((sound) => sound.setVolumeAsync(0).catch(() => {}));
  setConductorState("EMERGENCY_CLEAR", "cleared");
}

export async function applyConductorCommand(command) {
  const payload = typeof command === "string" ? { type: command } : { ...(command || {}) };
  const type = String(payload.type || "").trim().toUpperCase();

  switch (type) {
    case "PLAY":
      await play();
      break;
    case "PAUSE":
      await pause();
      break;
    case "STOP":
      await stop();
      break;
    case "SEEK":
      await seek(payload.positionSec ?? payload.position ?? 0);
      break;
    case "SEEK_MS":
      await setTimelinePositionMs(payload.positionMs ?? payload.positionMillis ?? 0);
      setConductorState("SEEK_MS", _state.loopRegion?.enabled ? "looping" : "ready");
      break;
    case "LOOP_SECTION":
    case "SET_LOOP_REGION": {
      const startSec = Number(
        payload.startSec
        ?? payload.section?.timeSec
        ?? payload.section?.positionSeconds
        ?? payload.section?.startSeconds
        ?? payload.section?.startSec
        ?? 0
      );
      const endSec = Number(
        payload.endSec
        ?? payload.section?.endTimeSec
        ?? payload.section?.endSeconds
        ?? payload.section?.endSec
        ?? startSec
      );
      if (!(endSec > startSec)) {
        return { ok: false, reason: "missing-loop-window" };
      }
      setLoopRegion(startSec, endSec, {
        label: payload.label || payload.section?.label || null,
      });
      if (payload.seek !== false) {
        await seek(startSec);
      }
      break;
    }
    case "CLEAR_LOOP":
      clearLoopRegion();
      break;
    case "EMERGENCY_CLEAR":
      emergencyClear();
      break;
    default:
      return { ok: false, reason: `unsupported-command:${type || "unknown"}` };
  }

  return {
    ok: true,
    type,
    conductorState: getConductorState(),
  };
}
