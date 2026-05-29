'use strict';

const { TransportClock } = require('./TransportClock');
const { RoutingGraph } = require('../graph/RoutingGraph');
const { TrackProcessor } = require('../graph/TrackProcessor');
const { createRenderContext } = require('../core/RenderContext');

const DEFAULT_CONFIG = {
  sampleRate: 44100,
  blockSize: 256,
  channelCount: 2,
  timeSignature: [4, 4],
};

/**
 * PlaybackEngine
 *
 * Pure-JS (no Web Audio) audio simulation engine.
 * Maintains transport state, session data, and per-block rendering.
 * Returns a snapshot object that mirrors the shape expected by the renderer.
 */
class PlaybackEngine {
  constructor({ session, config = {} }) {
    this.session = session;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.transport = new TransportClock({
      bpm: session.transport?.bpm ?? 120,
      sampleRate: this.config.sampleRate,
      blockSize: this.config.blockSize,
      timeSignature: this.config.timeSignature,
    });

    this._graph = new RoutingGraph({
      tracks: session.tracks,
      config: this.config,
    });

    // One TrackProcessor per track
    this._processors = new Map();
    for (const track of session.tracks) {
      this._processors.set(track.id, new TrackProcessor(track));
    }

    this._blockIndex = 0;
    this._cpuLoad = 0;
    this._masterPeak = 0;
    this._previewWaveform = [];
  }

  // ---------------------------------------------------------------------------
  // Transport controls
  // ---------------------------------------------------------------------------

  play() {
    this.transport.start();
    return this.renderBlock();
  }

  stop() {
    this.transport.stop();
    this.transport.seekToBar(1);
    return this.renderBlock();
  }

  togglePlayback() {
    this.transport.togglePlayback();
    return this.renderBlock();
  }

  seekToBar(bar) {
    this.transport.seekToBar(bar);
    return this.renderBlock();
  }

  setBpm(bpm) {
    this.transport.setBpm(bpm);
    return this.renderBlock();
  }

  // ---------------------------------------------------------------------------
  // Clip control
  // ---------------------------------------------------------------------------

  launchClip(trackId, slotId) {
    const track = this.session.tracks.find(t => t.id === trackId);
    if (!track) return this.getSnapshot();

    // Deactivate all clips on this track, then activate the requested one
    for (const clip of track.clips ?? []) {
      clip.active = false;
    }
    const target = (track.clips ?? []).find(c => c.slotId === slotId);
    if (target && target.name) {
      target.active = true;
      track.activeClipId = target.name;
    }

    return this.renderBlock();
  }

  stopAllClips() {
    for (const track of this.session.tracks) {
      for (const clip of track.clips ?? []) {
        clip.active = false;
      }
      track.activeClipId = null;
    }
    return this.renderBlock();
  }

  // ---------------------------------------------------------------------------
  // Mixer controls
  // ---------------------------------------------------------------------------

  setTrackVolume(trackId, volume) {
    const track = this.session.tracks.find(t => t.id === trackId);
    if (!track) return this.getSnapshot();
    track.volume = Number(Math.max(0, Math.min(1, volume)).toFixed(2));
    return this.renderBlock();
  }

  setTrackMute(trackId, mute) {
    const track = this.session.tracks.find(t => t.id === trackId);
    if (!track) return this.getSnapshot();
    track.mute = Boolean(mute);
    return this.renderBlock();
  }

  setTrackPan(trackId, pan) {
    const track = this.session.tracks.find(t => t.id === trackId);
    if (!track) return this.getSnapshot();
    track.pan = Number(Math.max(-1, Math.min(1, pan)).toFixed(2));
    return this.renderBlock();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /**
   * Run one render block: advance transport, synthesize all tracks,
   * route them through the graph, and update statistics.
   * @returns {object} snapshot
   */
  renderBlock() {
    const startMs = Date.now();

    const ctx = createRenderContext({
      config: this.config,
      transport: this.transport,
      blockIndex: this._blockIndex,
    });

    this._graph.beginBlock();

    for (const track of this.session.tracks) {
      const bus = this._graph.getTrackBuffer(track.id);
      if (!bus) continue;
      const processor = this._processors.get(track.id);
      if (processor) processor.render(bus, ctx);
      this._graph.routeTrackOutput(track.id, track.volume ?? 0.8, track.pan ?? 0, track.mute ?? false);
    }

    const { masterPeak } = this._graph.finalize();
    this._masterPeak = masterPeak;
    this._previewWaveform = this._graph.getMasterPreview(32);
    this.transport.advance(this.config.blockSize);
    this._blockIndex += 1;

    // Simulate CPU load: ratio of render time to block duration
    const blockDurationMs = (this.config.blockSize / this.config.sampleRate) * 1000;
    const renderMs = Date.now() - startMs;
    this._cpuLoad = Math.min(1, renderMs / blockDurationMs);

    return this.getSnapshot();
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  getSnapshot() {
    const transportStatus = this.transport.getStatus();
    const busPeakMap = this._graph.getBusPeakMap();
    const trackPeakMap = this._graph.getTrackPeakMap();

    return {
      projectName: this.session.projectName ?? 'Untitled Project',
      transport: {
        playing: transportStatus.playing,
        bpm: transportStatus.bpm,
        bar: transportStatus.bar,
        beat: transportStatus.beat,
        sixteenth: transportStatus.sixteenth,
        currentTimeSeconds: transportStatus.currentTimeSeconds,
      },
      config: {
        sampleRate: this.config.sampleRate,
        blockSize: this.config.blockSize,
        channelCount: this.config.channelCount,
        timeSignature: this.config.timeSignature,
      },
      stats: {
        cpuLoad: Number(this._cpuLoad.toFixed(3)),
        activeVoices: this._countActiveVoices(),
        masterPeak: Number(this._masterPeak.toFixed(4)),
        previewWaveform: this._previewWaveform,
      },
      scenes: this.session.scenes,
      buses: [
        { id: 'b1', name: 'Master', peak: Number((busPeakMap.b1 ?? 0).toFixed(4)) },
        { id: 'b2', name: 'FX',     peak: Number((busPeakMap.b2 ?? 0).toFixed(4)) },
      ],
      tracks: this.session.tracks.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        color: t.color,
        volume: t.volume ?? 0.8,
        pan: t.pan ?? 0,
        mute: t.mute ?? false,
        meter: Number((trackPeakMap.get(t.id) ?? 0).toFixed(4)),
        outputBus: t.outputBus ?? 'Master',
        activeClipId: t.activeClipId ?? null,
        clips: (t.clips ?? []).map(c => ({ ...c })),
        arrangementClips: (t.arrangementClips ?? []).map(c => ({ ...c })),
      })),
    };
  }

  _countActiveVoices() {
    let count = 0;
    for (const track of this.session.tracks) {
      if (!track.mute && (track.clips ?? []).some(c => c.active && c.name)) count += 1;
    }
    return count;
  }
}

module.exports = { PlaybackEngine };
