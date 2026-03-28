/**
 * Audio Engine - Ultimate Playback Phase 3
 * Multi-track stems playback with sync, routing, and live controls
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

const REMOTE_AUDIO_RE = /^https?:\/\//i;
const AUDIO_CACHE_DIR = `${FileSystem.cacheDirectory || ''}up_practice_audio/`;

class AudioEngine {
  constructor() {
    this.tracks = {}; // { trackId: { sound, isLoaded, volume, isMuted } }
    this.clickTrack = null;
    this.guideTrack = null;
    this.isPlaying = false;
    this.currentPosition = 0;
    this.duration = 0;
    this.activeScene = null;
    this.routing = {
      master: true,
      iem: false,
      foh: true,
      stream: true,
    };
    this.syncInterval = null;
    this.onProgressUpdate = null;
    this.onPlaybackStatusChange = null;
    this.onPlaybackEnded = null;
    this.cachedAudioUris = {};
    this.loopRegion = null;
    this.lastLoopJumpAt = 0;
    this.progressListeners = new Set();
    this.statusListeners = new Set();
    this.endedListeners = new Set();
    this.conductorState = {
      lastCommand: null,
      mode: 'idle',
      updatedAt: 0,
    };
  }

  /**
   * Initialize audio session
   */
  async initialize() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
      console.log('Audio engine initialized');
    } catch (error) {
      console.error('Error initializing audio engine:', error);
      throw error;
    }
  }

  addProgressListener(listener) {
    if (typeof listener !== 'function') return () => {};
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  addStatusListener(listener) {
    if (typeof listener !== 'function') return () => {};
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  addEndedListener(listener) {
    if (typeof listener !== 'function') return () => {};
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  _emitProgress(payload) {
    this.onProgressUpdate?.(payload);
    this.progressListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.warn('Error in audio progress listener:', error);
      }
    });
  }

  _emitStatus(payload) {
    this.onPlaybackStatusChange?.(payload);
    this.statusListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.warn('Error in audio status listener:', error);
      }
    });
  }

  _emitEnded(payload) {
    this.onPlaybackEnded?.(payload);
    this.endedListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.warn('Error in audio ended listener:', error);
      }
    });
  }

  _setConductorState(lastCommand, mode) {
    this.conductorState = {
      lastCommand,
      mode,
      updatedAt: Date.now(),
    };
  }

  /**
   * Load stem track
   */
  async loadStem(trackId, uri, trackType = 'stem') {
    // Guard: never attempt to load a null/empty URI — expo-av throws an unrecoverable AV error
    if (!uri) {
      console.warn(`[AudioEngine] loadStem: skipping "${trackId}" — URI is null/empty`);
      return false;
    }
    try {
      const playableUri = await this._resolvePlayableUri(uri);
      const { sound } = await Audio.Sound.createAsync(
        { uri: playableUri },
        { shouldPlay: false, volume: 1.0 },
        this._onPlaybackStatusUpdate.bind(this)
      );

      this.tracks[trackId] = {
        sound,
        isLoaded: true,
        volume: 1.0,
        isMuted: false,
        type: trackType, // 'stem', 'click', 'guide'
        uri: playableUri,
        sourceUri: uri,
      };

      // Get duration from first loaded track
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.durationMillis) {
        this.duration = status.durationMillis;
      }

      console.log(`Loaded ${trackType}: ${trackId}`);
      return true;
    } catch (error) {
      console.warn(`[AudioEngine] loadStem failed for "${trackId}": ${error?.message || error}`);
      return false;
    }
  }

  /**
   * Load click track
   */
  async loadClickTrack(uri) {
    return this.loadStem('click', uri, 'click');
  }

  /**
   * Load guide track
   */
  async loadGuideTrack(uri) {
    return this.loadStem('guide', uri, 'guide');
  }

  /**
   * Load multiple stems at once — null URIs are silently skipped
   */
  async loadStems(stems) {
    const valid = stems.filter(s => !!s?.uri);
    if (!valid.length) return false;
    const promises = valid.map((stem) =>
      this.loadStem(stem.id, stem.uri, stem.type || 'stem')
    );
    const results = await Promise.all(promises);
    return results.every((r) => r === true);
  }

  /**
   * Play all loaded tracks in sync
   */
  async play() {
    try {
      // Start all tracks simultaneously for sync
      const playPromises = Object.values(this.tracks).map(async (track) => {
        if (track.isLoaded) {
          await track.sound.setStatusAsync({
            shouldPlay: true,
            positionMillis: this.currentPosition || 0,
          });
        }
      });

      await Promise.all(playPromises);
      this.isPlaying = true;
      this._setConductorState('PLAY', this.loopRegion?.enabled ? 'looping' : 'playing');
      this._startSyncMonitor();

      this._emitStatus({
        isPlaying: true,
        position: this.currentPosition,
        duration: this.duration,
        loopRegion: this.getLoopRegion(),
      });
      console.log('Playback started');
    } catch (error) {
      console.error('Error starting playback:', error);
      throw error;
    }
  }

  /**
   * Pause all tracks
   */
  async pause() {
    try {
      const status = await this.getStatus();
      const pausePromises = Object.values(this.tracks).map((track) =>
        track.isLoaded ? track.sound.pauseAsync() : Promise.resolve()
      );

      await Promise.all(pausePromises);
      this.isPlaying = false;
      this.currentPosition = status.position;
      this._setConductorState('PAUSE', 'paused');
      this._stopSyncMonitor();

      this._emitStatus({
        isPlaying: false,
        position: this.currentPosition,
        duration: this.duration,
        loopRegion: this.getLoopRegion(),
      });
      console.log('Playback paused');
    } catch (error) {
      console.error('Error pausing playback:', error);
      throw error;
    }
  }

  /**
   * Stop all tracks
   */
  async stop() {
    try {
      const stopPromises = Object.values(this.tracks).map((track) =>
        track.isLoaded ? track.sound.stopAsync() : Promise.resolve()
      );

      await Promise.all(stopPromises);
      this.isPlaying = false;
      this.currentPosition = 0;
      this.lastLoopJumpAt = 0;
      this._setConductorState('STOP', 'stopped');
      this._stopSyncMonitor();

      this._emitStatus({
        isPlaying: false,
        position: 0,
        duration: this.duration,
        loopRegion: this.getLoopRegion(),
      });
      console.log('Playback stopped');
    } catch (error) {
      console.error('Error stopping playback:', error);
      throw error;
    }
  }

  /**
   * Seek to position (milliseconds)
   */
  async seek(positionMillis) {
    try {
      const nextPosition = await this._setAllTrackPositions(
        positionMillis,
        this.isPlaying,
      );
      this._setConductorState('SEEK', this.loopRegion?.enabled ? 'looping' : (this.isPlaying ? 'playing' : 'paused'));

      this._emitProgress({
        position: nextPosition,
        duration: this.duration,
        loopRegion: this.getLoopRegion(),
      });
      console.log(`Seeked to ${nextPosition}ms`);
    } catch (error) {
      console.error('Error seeking:', error);
      throw error;
    }
  }

  /**
   * Set volume for specific track
   */
  async setTrackVolume(trackId, volume) {
    const track = this.tracks[trackId];
    if (track && track.isLoaded) {
      track.volume = volume;
      await track.sound.setVolumeAsync(track.isMuted ? 0 : volume);
      console.log(`Set ${trackId} volume to ${volume}`);
    }
  }

  /**
   * Mute/unmute track
   */
  async setTrackMute(trackId, isMuted) {
    const track = this.tracks[trackId];
    if (track && track.isLoaded) {
      await track.sound.setVolumeAsync(isMuted ? 0 : track.volume);
      track.isMuted = isMuted;
      console.log(`${isMuted ? 'Muted' : 'Unmuted'} ${trackId}`);
    }
  }

  /**
   * Apply scene (enable/disable specific stems)
   */
  async applyScene(scene) {
    try {
      this.activeScene = scene;

      // Update track states based on scene
      const updatePromises = Object.keys(this.tracks).map(async (trackId) => {
        const shouldBeActive = scene.active_stems.includes(trackId);
        await this.setTrackMute(trackId, !shouldBeActive);
      });

      // Handle click track
      if (this.tracks.click) {
        const clickEnabled = scene.click_enabled ?? true;
        await this.setTrackMute('click', !clickEnabled);
      }

      // Handle guide track
      if (this.tracks.guide) {
        const guideEnabled = scene.guide_enabled ?? true;
        await this.setTrackMute('guide', !guideEnabled);
      }

      await Promise.all(updatePromises);
      console.log(`Applied scene: ${scene.name}`);
    } catch (error) {
      console.error('Error applying scene:', error);
      throw error;
    }
  }

  /**
   * Emergency: Panic stop with fade
   */
  async panicStop(fadeDuration = 1000) {
    try {
      console.log('PANIC STOP initiated');

      // Fade out all tracks
      const fadePromises = Object.values(this.tracks).map(async (track) => {
        if (track.isLoaded) {
          // Fade to zero
          for (let i = 10; i >= 0; i--) {
            await track.sound.setVolumeAsync((i / 10) * track.volume);
            await new Promise((resolve) => setTimeout(resolve, fadeDuration / 10));
          }
          await track.sound.stopAsync();
        }
      });

      await Promise.all(fadePromises);
      this.isPlaying = false;
      this._stopSyncMonitor();

      this.onPlaybackStatusChange?.({ isPlaying: false, emergency: true });
    } catch (error) {
      console.error('Error during panic stop:', error);
    }
  }

  /**
   * Emergency: Click-only mode (mute all except click)
   */
  async clickOnlyMode() {
    try {
      console.log('Click-only mode activated');

      const mutePromises = Object.entries(this.tracks).map(([trackId, track]) => {
        if (trackId !== 'click') {
          return this.setTrackMute(trackId, true);
        }
        return Promise.resolve();
      });

      await Promise.all(mutePromises);

      // Ensure click is unmuted
      if (this.tracks.click) {
        await this.setTrackMute('click', false);
      }
    } catch (error) {
      console.error('Error activating click-only mode:', error);
    }
  }

  /**
   * Restore all tracks from click-only
   */
  async restoreAllTracks() {
    try {
      const unmutePromises = Object.keys(this.tracks).map((trackId) =>
        this.setTrackMute(trackId, false)
      );
      await Promise.all(unmutePromises);
      console.log('All tracks restored');
    } catch (error) {
      console.error('Error restoring tracks:', error);
    }
  }

  setLoopRegion(startMillis, endMillis, metadata = {}) {
    const start = Math.max(0, Math.floor(Number(startMillis) || 0));
    const end = Math.max(start, Math.floor(Number(endMillis) || 0));
    if (end <= start + 50) {
      this.loopRegion = null;
      return null;
    }
    this.loopRegion = {
      enabled: true,
      startMillis: start,
      endMillis: end,
      label: metadata?.label || null,
      metadata: { ...metadata },
    };
    this.lastLoopJumpAt = 0;
    this._setConductorState('SET_LOOP_REGION', 'looping');
    return this.getLoopRegion();
  }

  clearLoopRegion() {
    this.loopRegion = null;
    this.lastLoopJumpAt = 0;
    this._setConductorState(
      'CLEAR_LOOP',
      this.isPlaying ? 'playing' : (this.currentPosition > 0 ? 'paused' : 'ready'),
    );
    return null;
  }

  getLoopRegion() {
    return this.loopRegion ? { ...this.loopRegion } : null;
  }

  getConductorState() {
    return { ...this.conductorState, loopRegion: this.getLoopRegion() };
  }

  async applyConductorCommand(command, context = {}) {
    const payload = typeof command === 'string' ? { type: command } : { ...(command || {}) };
    const type = String(payload.type || '').trim().toUpperCase();
    const sections = Array.isArray(context.sections) ? context.sections : [];
    const resolvedSection = payload.section
      || context.section
      || sections[payload.sectionIndex]
      || null;
    const sectionStart = resolvedSection?.start_ms ?? resolvedSection?.startMillis ?? null;
    const sectionEnd = resolvedSection?.end_ms ?? resolvedSection?.endMillis ?? null;
    const startMillis = payload.startMillis ?? payload.startMs ?? sectionStart
      ?? (payload.startSec != null ? Number(payload.startSec) * 1000 : null);
    const endMillis = payload.endMillis ?? payload.endMs ?? sectionEnd
      ?? (payload.endSec != null ? Number(payload.endSec) * 1000 : null);

    switch (type) {
      case 'PLAY':
        await this.play();
        break;
      case 'PAUSE':
        await this.pause();
        break;
      case 'STOP':
        await this.stop();
        break;
      case 'SEEK':
        await this.seek(payload.positionMillis ?? payload.position ?? payload.positionMs ?? 0);
        break;
      case 'SEEK_SECTION':
        if (startMillis == null) return { ok: false, reason: 'missing-section' };
        await this.seek(startMillis);
        break;
      case 'LOOP_SECTION':
      case 'SET_LOOP_REGION':
        if (startMillis == null || endMillis == null) {
          return { ok: false, reason: 'missing-loop-window' };
        }
        this.setLoopRegion(startMillis, endMillis, {
          label: payload.label || resolvedSection?.section || resolvedSection?.label || null,
        });
        if (payload.seek !== false) {
          await this.seek(startMillis);
        }
        break;
      case 'CLEAR_LOOP':
        this.clearLoopRegion();
        break;
      case 'CLICK_ONLY':
        await this.clickOnlyMode();
        this._setConductorState('CLICK_ONLY', 'click_only');
        break;
      case 'RESTORE_TRACKS':
        await this.restoreAllTracks();
        this._setConductorState('RESTORE_TRACKS', this.isPlaying ? 'playing' : 'paused');
        break;
      case 'PANIC_STOP':
        await this.panicStop(payload.fadeDuration ?? payload.fadeMs ?? 1000);
        this._setConductorState('PANIC_STOP', 'stopped');
        break;
      case 'APPLY_SCENE':
        if (!payload.scene) return { ok: false, reason: 'missing-scene' };
        await this.applyScene(payload.scene);
        this._setConductorState('APPLY_SCENE', this.isPlaying ? 'playing' : 'paused');
        break;
      default:
        return { ok: false, reason: `unsupported-command:${type || 'unknown'}` };
    }

    return {
      ok: true,
      type,
      loopRegion: this.getLoopRegion(),
      conductorState: this.getConductorState(),
    };
  }

  /**
   * Get current playback status
   */
  async getStatus() {
    const firstTrack = this._getReferenceTrack();
    if (firstTrack && firstTrack.isLoaded) {
      const status = await firstTrack.sound.getStatusAsync();
      return {
        isPlaying: status.isPlaying,
        position: status.positionMillis,
        duration: status.durationMillis,
        loopRegion: this.getLoopRegion(),
      };
    }
    return {
      isPlaying: false,
      position: 0,
      duration: 0,
      loopRegion: this.getLoopRegion(),
    };
  }

  /**
   * Set routing (IEM/FOH/Stream)
   */
  setRouting(routingConfig) {
    this.routing = { ...this.routing, ...routingConfig };
    // In real implementation, this would route audio to different outputs
    console.log('Routing updated:', this.routing);
  }

  /**
   * Unload all tracks and clean up
   */
  async unloadAll() {
    try {
      this._stopSyncMonitor();

      const unloadPromises = Object.values(this.tracks).map((track) =>
        track.isLoaded ? track.sound.unloadAsync() : Promise.resolve()
      );

      await Promise.all(unloadPromises);
      this.tracks = {};
      this.isPlaying = false;
      this.currentPosition = 0;
      this.clearLoopRegion();

      console.log('All tracks unloaded');
    } catch (error) {
      console.error('Error unloading tracks:', error);
    }
  }

  /**
   * Private: Monitor sync between tracks
   */
  _startSyncMonitor() {
    this._stopSyncMonitor();

    this.syncInterval = setInterval(async () => {
      const status = await this.getStatus();
      this.currentPosition = status.position;
      const loopRegion = this.loopRegion;

      if (
        status.isPlaying
        && loopRegion?.enabled
        && loopRegion.endMillis > loopRegion.startMillis + 50
        && status.position >= loopRegion.endMillis - 110
      ) {
        const now = Date.now();
        if (now - this.lastLoopJumpAt > 180) {
          this.lastLoopJumpAt = now;
          const loopStart = await this._setAllTrackPositions(loopRegion.startMillis, true);
          this.currentPosition = loopStart;
          this._emitProgress({
            position: loopStart,
            duration: status.duration,
            loopRegion: this.getLoopRegion(),
          });
          return;
        }
      }

      this._emitProgress({
        position: status.position,
        duration: status.duration,
        loopRegion: this.getLoopRegion(),
      });

      // Check if playback finished
      if (!loopRegion?.enabled && status.duration && status.position >= status.duration - 100) {
        await this.stop();
        this._emitEnded({
          position: status.position,
          duration: status.duration,
          loopRegion: this.getLoopRegion(),
        });
      }
    }, 100); // Update every 100ms
  }

  /**
   * Private: Stop sync monitor
   */
  _stopSyncMonitor() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Private: Handle playback status updates
   */
  _onPlaybackStatusUpdate(status) {
    if (status.isLoaded) {
      this._emitStatus({
        isPlaying: status.isPlaying,
        position: status.positionMillis,
        duration: status.durationMillis,
        loopRegion: this.getLoopRegion(),
      });
    }
  }

  _getReferenceTrack() {
    return Object.values(this.tracks).find((track) => track?.isLoaded) || null;
  }

  async _setAllTrackPositions(positionMillis, shouldPlay = this.isPlaying) {
    const nextPosition = Math.max(0, Math.floor(Number(positionMillis) || 0));
    const status = shouldPlay
      ? { shouldPlay: true, positionMillis: nextPosition }
      : { positionMillis: nextPosition };

    await Promise.all(
      Object.values(this.tracks).map((track) => (
        track.isLoaded
          ? track.sound.setStatusAsync(status).catch(() => (
            track.sound.setPositionAsync(nextPosition).catch(() => {})
          ))
          : Promise.resolve()
      )),
    );

    this.currentPosition = nextPosition;
    return nextPosition;
  }

  async _resolvePlayableUri(uri) {
    const trimmed = String(uri || '').trim();
    if (!REMOTE_AUDIO_RE.test(trimmed) || !FileSystem.cacheDirectory) {
      return trimmed;
    }

    if (this.cachedAudioUris[trimmed]) {
      const cachedInfo = await FileSystem.getInfoAsync(this.cachedAudioUris[trimmed]).catch(() => null);
      if (cachedInfo?.exists && cachedInfo.size > 0) {
        return this.cachedAudioUris[trimmed];
      }
    }

    await FileSystem.makeDirectoryAsync(AUDIO_CACHE_DIR, { intermediates: true }).catch(() => {});

    const extensionMatch = trimmed.split('?')[0].match(/\.([a-z0-9]{2,8})$/i);
    const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : '.mp3';
    const cacheKey = encodeURIComponent(trimmed).replace(/%/g, '_');
    const localUri = `${AUDIO_CACHE_DIR}${cacheKey}${extension}`;
    const info = await FileSystem.getInfoAsync(localUri).catch(() => null);
    if (!info?.exists || !info.size) {
      await FileSystem.downloadAsync(trimmed, localUri);
    }

    this.cachedAudioUris[trimmed] = localUri;
    return localUri;
  }
}

// Export singleton instance
export default new AudioEngine();
