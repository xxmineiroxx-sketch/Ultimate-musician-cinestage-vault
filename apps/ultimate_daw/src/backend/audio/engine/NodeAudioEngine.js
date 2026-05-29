'use strict';

const { EventEmitter } = require('events');
const { PlaybackEngine } = require('./PlaybackEngine');
const { createDemoSession } = require('../session/createDemoSession');

const TICK_INTERVAL_MS = 100; // ~10 FPS state-push cadence when playing

/**
 * NodeAudioEngine
 *
 * Electron main-process audio engine. Wraps PlaybackEngine and exposes
 * the EventEmitter API so main.js can subscribe with:
 *   audioEngine.on('state', broadcastEngineState)
 *
 * Emits: 'state' with payload { snapshot } on every meaningful state change.
 */
class NodeAudioEngine extends EventEmitter {
  constructor(session) {
    super();
    const resolvedSession = session ?? createDemoSession();
    this._engine = new PlaybackEngine({ session: resolvedSession });
    this._tickTimer = null;
    this._startTicker();
  }

  // ---------------------------------------------------------------------------
  // Internal tick — advances playback while playing
  // ---------------------------------------------------------------------------

  _startTicker() {
    this._tickTimer = setInterval(() => {
      if (!this._engine.transport.playing) return;
      const snapshot = this._engine.renderBlock();
      this.emit('state', { snapshot });
    }, TICK_INTERVAL_MS);
  }

  _emitSnapshot(snapshot) {
    this.emit('state', { snapshot });
  }

  // ---------------------------------------------------------------------------
  // Public API (delegating to PlaybackEngine)
  // ---------------------------------------------------------------------------

  getSnapshot() {
    return this._engine.getSnapshot();
  }

  play() {
    const snapshot = this._engine.play();
    this._emitSnapshot(snapshot);
    return snapshot;
  }

  stop() {
    const snapshot = this._engine.stop();
    this._emitSnapshot(snapshot);
    return snapshot;
  }

  togglePlayback() {
    const snapshot = this._engine.togglePlayback();
    this._emitSnapshot(snapshot);
    return snapshot;
  }

  seekToBar(bar) {
    const snapshot = this._engine.seekToBar(bar);
    this._emitSnapshot(snapshot);
    return snapshot;
  }

  setBpm(bpm) {
    const snapshot = this._engine.setBpm(bpm);
    this._emitSnapshot(snapshot);
    return snapshot;
  }

  launchClip(trackId, slotId) {
    const snapshot = this._engine.launchClip(trackId, slotId);
    this._emitSnapshot(snapshot);
    return snapshot;
  }

  stopAllClips() {
    const snapshot = this._engine.stopAllClips();
    this._emitSnapshot(snapshot);
    return snapshot;
  }

  setTrackVolume(trackId, volume) {
    const snapshot = this._engine.setTrackVolume(trackId, volume);
    this._emitSnapshot(snapshot);
    return snapshot;
  }

  setTrackMute(trackId, mute) {
    const snapshot = this._engine.setTrackMute(trackId, mute);
    this._emitSnapshot(snapshot);
    return snapshot;
  }

  setTrackPan(trackId, pan) {
    const snapshot = this._engine.setTrackPan(trackId, pan);
    this._emitSnapshot(snapshot);
    return snapshot;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown() {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
    this.removeAllListeners();
  }
}

module.exports = { NodeAudioEngine };
