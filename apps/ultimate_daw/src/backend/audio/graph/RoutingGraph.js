'use strict';

const { AudioBufferBus } = require('../core/AudioBufferBus');

/**
 * RoutingGraph
 *
 * Manages the per-block bus topology:
 *  - One summing bus per track
 *  - One master bus that all tracks route into
 *  - One FX bus for effects sends
 *
 * Usage (per render block):
 *  1. graph.beginBlock()           — clear all buses
 *  2. graph.getTrackBuffer(id)     — get a track's write buffer
 *  3. graph.routeTrackOutput(id, vol, pan, mute) — mix track into master
 *  4. graph.finalize()             — returns master peak + per-bus peaks
 *  5. graph.getBusPeakMap()        — {busId → peak}
 */
class RoutingGraph {
  constructor({ tracks, config }) {
    const { blockSize, channelCount } = config;
    this._blockSize = blockSize;
    this._channelCount = channelCount;

    // Per-track buses
    this._trackBuses = new Map();
    for (const track of tracks) {
      this._trackBuses.set(
        track.id,
        new AudioBufferBus({ name: track.id, channelCount, frameCount: blockSize })
      );
    }

    // Master summing bus
    this._masterBus = new AudioBufferBus({ name: 'Master', channelCount, frameCount: blockSize });

    // FX bus (parallel send bus)
    this._fxBus = new AudioBufferBus({ name: 'FX', channelCount, frameCount: blockSize });

    // Peak snapshots (set by finalize)
    this._busPeakMap = { b1: 0, b2: 0 };
    this._trackPeakMap = new Map();
    for (const track of tracks) this._trackPeakMap.set(track.id, 0);
  }

  /** Clear all buses at the start of a render block. */
  beginBlock() {
    this._masterBus.clear();
    this._fxBus.clear();
    for (const bus of this._trackBuses.values()) bus.clear();
  }

  /**
   * Get the track's write buffer (TrackProcessor writes into this).
   * @param {string} trackId
   * @returns {AudioBufferBus}
   */
  getTrackBuffer(trackId) {
    return this._trackBuses.get(trackId) ?? null;
  }

  /**
   * Route a track's output into the master bus.
   * Applies volume, stereo pan (equal-power), and mute.
   * @param {string} trackId
   * @param {number} volume  0..1
   * @param {number} pan     -1..1
   * @param {boolean} mute
   */
  routeTrackOutput(trackId, volume, pan, mute) {
    if (mute) {
      this._trackPeakMap.set(trackId, 0);
      return;
    }

    const trackBus = this._trackBuses.get(trackId);
    if (!trackBus) return;

    // Capture pre-fader peak for track meter
    const trackPeak = trackBus.measurePeak();
    this._trackPeakMap.set(trackId, trackPeak);

    // Equal-power pan
    const panAngle = ((pan + 1) / 2) * (Math.PI / 2); // 0..π/2
    const gainL = Math.cos(panAngle) * volume;
    const gainR = Math.sin(panAngle) * volume;

    const blockSize = this._blockSize;
    const masterChs = this._masterBus.channels;
    const trackChs = trackBus.channels;

    const leftCh = trackChs[0] ?? new Float32Array(blockSize);
    const rightCh = trackChs[1] ?? trackChs[0] ?? new Float32Array(blockSize);

    for (let i = 0; i < blockSize; i++) {
      masterChs[0][i] += leftCh[i] * gainL;
      if (masterChs[1]) masterChs[1][i] += rightCh[i] * gainR;
    }

    // Low-level FX send (flat 10% pre-fader send — placeholder for actual send level)
    const fxGain = 0.1 * volume;
    this._fxBus.addFrom(trackBus, fxGain);
  }

  /**
   * Finalize the block: measure peaks and build the bus peak map.
   * @returns {{ masterPeak: number }}
   */
  finalize() {
    const masterPeak = this._masterBus.measurePeak();
    const fxPeak = this._fxBus.measurePeak();
    this._busPeakMap = { b1: masterPeak, b2: fxPeak };
    return { masterPeak };
  }

  /**
   * Returns a map of busId → peak value for serialization into the snapshot.
   * @returns {{ b1: number, b2: number }}
   */
  getBusPeakMap() {
    return { ...this._busPeakMap };
  }

  /**
   * Returns a map of trackId → meter peak for serialization into the snapshot.
   * @returns {Map<string, number>}
   */
  getTrackPeakMap() {
    return new Map(this._trackPeakMap);
  }

  /**
   * Get a preview waveform from the master bus.
   * @param {number} bands
   * @returns {number[]}
   */
  getMasterPreview(bands) {
    return this._masterBus.getPreview(bands);
  }
}

module.exports = { RoutingGraph };
