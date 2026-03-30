import { Audio } from 'expo-av';
import { Platform } from 'react-native';

const SOUND_SOURCES = {
  message: require('../../assets/sounds/message-notification.wav'),
  assignment: require('../../assets/sounds/assignment-notification.wav'),
  verse: require('../../assets/sounds/verse-notification.wav'),
};

const SOUND_THROTTLES = {
  message: 1200,
  assignment: 1400,
  verse: 5000,
};

const SOUND_VOLUMES = {
  message: 0.88,
  assignment: 0.94,
  verse: 1,
};

let audioModeReady = false;
let playChain = Promise.resolve();
const lastPlayAtByType = {};

async function ensureAudioMode() {
  if (Platform.OS === 'web' || audioModeReady) return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
  });
  audioModeReady = true;
}

async function playSoundNow(type) {
  if (Platform.OS === 'web') return;

  const source = SOUND_SOURCES[type];
  if (!source) return;

  const now = Date.now();
  const throttleMs = SOUND_THROTTLES[type] || 0;
  if (now - (lastPlayAtByType[type] || 0) < throttleMs) return;
  lastPlayAtByType[type] = now;

  await ensureAudioMode();

  let sound = null;
  try {
    const created = await Audio.Sound.createAsync(source, {
      shouldPlay: false,
      volume: SOUND_VOLUMES[type] ?? 0.9,
    });
    sound = created.sound;

    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        sound?.unloadAsync().catch(() => {});
        resolve();
      };

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status?.didJustFinish || status?.error) finish();
      });

      sound.playAsync().catch(finish);
      setTimeout(finish, 1800);
    });
  } catch (_) {
    if (sound) {
      sound.unloadAsync().catch(() => {});
    }
  }
}

export function playNotificationSound(type) {
  playChain = playChain.then(() => playSoundNow(type)).catch(() => {});
  return playChain;
}

export function playNotificationSequence(types = []) {
  const queue = Array.isArray(types) ? types.filter(Boolean) : [];
  if (queue.length === 0) return Promise.resolve();
  playChain = playChain
    .then(async () => {
      for (const type of queue) {
        await playSoundNow(type);
      }
    })
    .catch(() => {});
  return playChain;
}
