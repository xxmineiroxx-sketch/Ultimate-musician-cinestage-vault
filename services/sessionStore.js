/**
 * Session Store (v1)
 * Persists Song Map markers + settings so Song Map -> Performance View share state.
 *
 * Uses AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = "UM_SONG_SESSION_V1";

export async function saveSession(session) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(session));
    return true;
  } catch (e) {
    console.warn("saveSession failed", e);
    return false;
  }
}

export async function loadSession() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("loadSession failed", e);
    return null;
  }
}

export async function clearSession() {
  try {
    await AsyncStorage.removeItem(KEY);
    return true;
  } catch (e) {
    console.warn("clearSession failed", e);
    return false;
  }
}

export function defaultSession() {
  return {
    bpm: 120,
    voiceCueMode: 'TYPE_COLON_NAME', // NAME_ONLY | TYPE_THEN_NAME | TYPE_COLON_NAME
    quantizeLaunch: 'BAR', // OFF | BEAT | BAR
    liveLock: false,
    tapTempoHistory: [],
    bridgeUrl: '',
    enableMidiClock: true,
    enableLyricsSync: true,
    enableLightingSync: true,
    planTier: 'PRO',
    midiCcLyrics: 21,
    midiCcSection: 20,
    midiCcChannel: 0,
    midiPcChannel: 0,
    lightingOscHost: '127.0.0.1',
    lightingOscPort: 8000,
    lightingMidiChannel: 0,
    lightingMode: 'OSC', // OSC | MIDI | BOTH
    lightingPalette: ['#FFFFFF','#FBBF24','#34D399','#60A5FA','#A78BFA','#F472B6','#F97316'],
    pitchShiftSemitones: 0,
    pitchShiftMode: 'BRIDGE_HQ', // OFF | BRIDGE_HQ
    // v3.0 sync + church profiles
    userId: null,
    churchId: null,
    deviceRole: 'HOST', // HOST | STAGE | REHEARSAL
    syncMode: 'CLOUD_WITH_LOCAL_FALLBACK', // LOCAL_ONLY | CLOUD_WITH_LOCAL_FALLBACK
    syncServerUrl: '',
    syncRoomId: '',
    deviceId: null,
    deviceName: null,
    deviceRoster: [],
    serviceTemplateId: null,
    snap: true,
    grid: "Bar",
    markers: [],
    durationSec: null,
    waveformPeaks: null,
    padTrackUrl: null,
    padEnabled: true,
    padVolume: 0.7,
    stems: [
      // Default 4-stem layout (can expand to unlimited)
      { id: 'stem_vocals', name: 'Vocals', color: '#F472B6', uri: null, volume: 1, pan: 0, mute: false, solo: false },
      { id: 'stem_drums', name: 'Drums', color: '#34D399', uri: null, volume: 1, pan: 0, mute: false, solo: false },
      { id: 'stem_bass', name: 'Bass', color: '#60A5FA', uri: null, volume: 1, pan: 0, mute: false, solo: false },
      { id: 'stem_music', name: 'Music', color: '#A78BFA', uri: null, volume: 1, pan: 0, mute: false, solo: false },
    ],
    lastUpdated: new Date().toISOString(),
  };
}
