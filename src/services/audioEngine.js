/**
 * Audio Engine - Ultimate Playback Phase 3
 * Multi-track stems playback with sync, routing, and live controls
 */

import { Audio } from 'expo-av';

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

  /**
   * Load stem track
   */
  async loadStem(trackId, uri, trackType = 'stem') {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false, volume: 1.0 },
        this._onPlaybackStatusUpdate.bind(this)
      );

      this.tracks[trackId] = {
        sound,
        isLoaded: true,
        volume: 1.0,
        isMuted: false,
        type: trackType, // 'stem', 'click', 'guide'
        uri,
      };

      // Get duration from first loaded track
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.durationMillis) {
        this.duration = status.durationMillis;
      }

      console.log(`Loaded ${trackType}: ${trackId}`);
      return true;
    } catch (error) {
      console.error(`Error loading stem ${trackId}:`, error);
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
   * Load multiple stems at once
   */
  async loadStems(stems) {
    const promises = stems.map((stem) =>
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
        if (track.isLoaded && !track.isMuted) {
          await track.sound.playAsync();
        }
      });

      await Promise.all(playPromises);
      this.isPlaying = true;
      this._startSyncMonitor();

      this.onPlaybackStatusChange?.({ isPlaying: true });
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
      const pausePromises = Object.values(this.tracks).map((track) =>
        track.isLoaded ? track.sound.pauseAsync() : Promise.resolve()
      );

      await Promise.all(pausePromises);
      this.isPlaying = false;
      this._stopSyncMonitor();

      this.onPlaybackStatusChange?.({ isPlaying: false });
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
      this._stopSyncMonitor();

      this.onPlaybackStatusChange?.({ isPlaying: false, position: 0 });
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
      const seekPromises = Object.values(this.tracks).map((track) =>
        track.isLoaded
          ? track.sound.setPositionAsync(positionMillis)
          : Promise.resolve()
      );

      await Promise.all(seekPromises);
      this.currentPosition = positionMillis;

      this.onProgressUpdate?.({
        position: positionMillis,
        duration: this.duration,
      });
      console.log(`Seeked to ${positionMillis}ms`);
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
      await track.sound.setVolumeAsync(volume);
      track.volume = volume;
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

  /**
   * Get current playback status
   */
  async getStatus() {
    const firstTrack = Object.values(this.tracks)[0];
    if (firstTrack && firstTrack.isLoaded) {
      const status = await firstTrack.sound.getStatusAsync();
      return {
        isPlaying: status.isPlaying,
        position: status.positionMillis,
        duration: status.durationMillis,
      };
    }
    return {
      isPlaying: false,
      position: 0,
      duration: 0,
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

      this.onProgressUpdate?.({
        position: status.position,
        duration: status.duration,
      });

      // Check if playback finished
      if (status.position >= status.duration - 100) {
        await this.stop();
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
      this.onPlaybackStatusChange?.({
        isPlaying: status.isPlaying,
        position: status.positionMillis,
        duration: status.durationMillis,
      });
    }
  }
}

// Export singleton instance
export default new AudioEngine();
