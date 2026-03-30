/**
 * AudioAdapter.js
 * Thin JS wrapper around the native AudioEngineBridge (Swift / AVAudioEngine).
 *
 * Falls back to a no-op stub when the native module is not available
 * (e.g. running in Expo Go without a custom dev client).
 *
 * Usage:
 *   import AudioAdapter from '../audioEngine/AudioAdapter';
 *
 *   await AudioAdapter.load('file:///path/to/audio.mp3');
 *   AudioAdapter.play();
 *   AudioAdapter.fadeIn(800);   // 800 ms
 *   AudioAdapter.fadeOut(600);
 *   AudioAdapter.fadeTo(0.5, 400);
 *   AudioAdapter.stop();
 */

import { NativeModules, Platform } from 'react-native';

const Native = NativeModules.AudioEngineBridge;
const isAvailable = Platform.OS === 'ios' && !!Native;

if (!isAvailable && Platform.OS === 'ios') {
  console.warn(
    '[AudioAdapter] AudioEngineBridge native module not found. ' +
    'Run `npx expo run:ios` (not Expo Go) to use native audio.'
  );
}

/** Stub used when the native module is not loaded (Expo Go, Android, web). */
const Stub = {
  load: (_uri) => {},
  play: () => {},
  stop: () => {},
  fadeIn: (_ms) => {},
  fadeOut: (_ms) => {},
  fadeTo: (_vol, _ms) => {},
  getVolume: (cb) => cb(null, 1.0),
};

const AudioAdapter = {
  /**
   * Load a local audio file. Call this before play().
   * @param {string} uri - file:// URI (e.g. from expo-file-system)
   */
  load(uri) {
    if (!isAvailable) return Stub.load(uri);
    Native.load(uri);
  },

  /** Begin playback of the loaded file. */
  play() {
    if (!isAvailable) return Stub.play();
    Native.play();
  },

  /** Stop playback immediately. */
  stop() {
    if (!isAvailable) return Stub.stop();
    Native.stop();
  },

  /**
   * Fade in to full volume (1.0).
   * @param {number} durationMs - fade duration in milliseconds (default 600)
   */
  fadeIn(durationMs = 600) {
    if (!isAvailable) return Stub.fadeIn(durationMs);
    Native.fadeIn(durationMs);
  },

  /**
   * Fade out to silence (0.0).
   * @param {number} durationMs - fade duration in milliseconds (default 600)
   */
  fadeOut(durationMs = 600) {
    if (!isAvailable) return Stub.fadeOut(durationMs);
    Native.fadeOut(durationMs);
  },

  /**
   * Fade to an arbitrary volume level.
   * @param {number} volume    - target volume 0.0–1.0
   * @param {number} durationMs
   */
  fadeTo(volume, durationMs = 400) {
    if (!isAvailable) return Stub.fadeTo(volume, durationMs);
    Native.fadeTo(volume, durationMs);
  },

  /**
   * Get the current output volume (0.0–1.0) via callback.
   * @param {function} callback - (error, volume) => void
   */
  getVolume(callback) {
    if (!isAvailable) return Stub.getVolume(callback);
    Native.getVolume(callback);
  },

  /** True if the native module is loaded and ready. */
  get isNative() { return isAvailable; },
};

export default AudioAdapter;
