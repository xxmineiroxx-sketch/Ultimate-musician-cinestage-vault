
import { Audio } from 'expo-av';

let initialized = false;
let stemPlayers = [];
let clickPlayer = null;
let guidePlayer = null;
let padPlayer = null;
let currentPosition = 0;
let baseUrl = '';

const defaultVolume = 0.8;

async function unloadAll() {
  for (const p of stemPlayers) {
    try {
      await p.unloadAsync();
    } catch (e) {
      // ignore unload errors
    }
  }
  stemPlayers = [];
  for (const p of [clickPlayer, guidePlayer, padPlayer]) {
    if (p) {
      try {
        await p.unloadAsync();
      } catch (e) {}
    }
  }
  clickPlayer = null;
  guidePlayer = null;
  padPlayer = null;
}

export async function initEngine() {
  if (initialized) return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: false,
  });
  initialized = true;
}

async function loadSound(url, volume = defaultVolume) {
  if (!url) return null;
  const finalUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  const sound = new Audio.Sound();
  await sound.loadAsync({ uri: finalUrl }, { volume, shouldPlay: false, progressUpdateIntervalMillis: 500 });
  return sound;
}

export function setBaseUrl(next) {
  baseUrl = next || '';
}

export async function loadFromBackend(result) {
  await unloadAll();
  if (!result) return;

  const stems = result.stems || [];
  for (const stem of stems) {
    if (!stem.url) continue;
    const player = await loadSound(stem.url);
    if (player) {
      stemPlayers.push({ id: stem.type || stem.name, sound: player, volume: defaultVolume, mute: false });
    }
  }

  clickPlayer = await loadSound(result.click_track, 0.4);
  guidePlayer = await loadSound(result.voice_guide, 0.5);
  padPlayer = await loadSound(result.pad_track, 0.6);
}

export async function setMixerState(tracksState) {
  // Update volumes/mutes to mirror mixer toggles
  for (const track of tracksState) {
    const player = stemPlayers.find((p) => p.id === track.id);
    if (player && player.sound) {
      try {
        await player.sound.setIsMutedAsync(!!track.mute);
        await player.sound.setVolumeAsync(track.volume ?? defaultVolume);
      } catch (e) {
        // ignore volume errors in stub
      }
    }
  }
}

export async function setClickEnabled(on) {
  if (clickPlayer) {
    try {
      await clickPlayer.setIsMutedAsync(!on);
    } catch {}
  }
}
export async function setGuideEnabled(on) {
  if (guidePlayer) {
    try {
      await guidePlayer.setIsMutedAsync(!on);
    } catch {}
  }
}
export async function setPadEnabled(on) {
  if (padPlayer) {
    try {
      await padPlayer.setIsMutedAsync(!on);
    } catch {}
  }
}

export async function play() {
  currentPosition = 0;
  const all = [
    ...stemPlayers.map((p) => p.sound),
    clickPlayer,
    guidePlayer,
    padPlayer,
  ].filter(Boolean);
  for (const s of all) {
    try {
      await s.setPositionAsync(currentPosition);
      await s.playAsync();
    } catch (e) {
      // continue other sounds
    }
  }
}

export async function pause() {
  const all = [
    ...stemPlayers.map((p) => p.sound),
    clickPlayer,
    guidePlayer,
    padPlayer,
  ].filter(Boolean);
  for (const s of all) {
    try {
      await s.pauseAsync();
      const status = await s.getStatusAsync();
      currentPosition = status.positionMillis || currentPosition;
    } catch {}
  }
}

export async function seek(seconds) {
  currentPosition = Math.max(0, seconds * 1000);
  const all = [
    ...stemPlayers.map((p) => p.sound),
    clickPlayer,
    guidePlayer,
    padPlayer,
  ].filter(Boolean);
  for (const s of all) {
    try {
      await s.setPositionAsync(currentPosition);
    } catch {}
  }
}

export async function getPosition() {
  // Return seconds
  if (stemPlayers.length && stemPlayers[0].sound) {
    try {
      const status = await stemPlayers[0].sound.getStatusAsync();
      if (status?.positionMillis != null) {
        return status.positionMillis / 1000;
      }
    } catch {}
  }
  return currentPosition / 1000;
}
