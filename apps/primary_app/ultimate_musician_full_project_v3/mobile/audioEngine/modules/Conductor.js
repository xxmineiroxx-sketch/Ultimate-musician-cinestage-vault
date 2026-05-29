import EventBus from '../EventBus';
import TimingEngine from '../TimingEngine';

class Conductor {
  constructor() {
    this.state = {
      mode: 'idle', // idle, playing, paused, looping
      positionMs: 0,
      loopRegion: null,
      syncInFlight: false,
    };
    this.masterTrackId = null;
    this.trackSounds = new Map();
    this.auxSounds = { click: null, guide: null, pad: null };
  }

  setTracks(trackSounds, auxSounds) {
    this.trackSounds = trackSounds;
    this.auxSounds = auxSounds;
    this.refreshMasterTrackId();
  }

  refreshMasterTrackId() {
    if (this.auxSounds.click) this.masterTrackId = "__click__";
    else if (this.auxSounds.guide) this.masterTrackId = "__guide__";
    else if (this.trackSounds.size > 0) this.masterTrackId = this.trackSounds.keys().next().value;
    else this.masterTrackId = null;
  }

  getMasterSound() {
    if (this.masterTrackId === "__click__") return this.auxSounds.click;
    if (this.masterTrackId === "__guide__") return this.auxSounds.guide;
    return this.trackSounds.get(this.masterTrackId);
  }

  async play() {
    const allSounds = this.getAllSounds();
    await Promise.all(allSounds.map(s => s.playAsync().catch(() => {})));
    this.state.mode = 'playing';
    TimingEngine.start();
    EventBus.emit('transport-state', { mode: 'playing' });
  }

  async pause() {
    const allSounds = this.getAllSounds();
    await Promise.all(allSounds.map(s => s.pauseAsync().catch(() => {})));
    this.state.mode = 'paused';
    TimingEngine.stop();
    EventBus.emit('transport-state', { mode: 'paused' });
  }

  async stop() {
    const allSounds = this.getAllSounds();
    await Promise.all(allSounds.map(s => s.stopAsync().catch(() => {})));
    await Promise.all(allSounds.map(s => s.setPositionAsync(0).catch(() => {})));
    this.state.mode = 'idle';
    this.state.positionMs = 0;
    TimingEngine.reset();
    EventBus.emit('transport-state', { mode: 'idle', positionMs: 0 });
  }

  async jumpTo(positionMs) {
    const allSounds = this.getAllSounds();
    await Promise.all(allSounds.map(s => s.setPositionAsync(positionMs).catch(() => {})));
    this.state.positionMs = positionMs;
    EventBus.emit('transport-jump', { positionMs });
  }

  getAllSounds() {
    return [
      ...Array.from(this.trackSounds.values()),
      this.auxSounds.click,
      this.auxSounds.guide,
      this.auxSounds.pad
    ].filter(Boolean);
  }

  // Jitter-free sync logic
  async syncTracks() {
    if (this.state.syncInFlight || this.state.mode !== 'playing') return;
    this.state.syncInFlight = true;
    
    try {
      const master = this.getMasterSound();
      if (!master) return;
      
      const status = await master.getStatusAsync().catch(() => null);
      if (!status?.isLoaded) return;

      const masterPos = status.positionMillis;
      const otherTracks = this.getAllSounds().filter(s => s !== master);

      await Promise.all(otherTracks.map(async (sound) => {
        const sStatus = await sound.getStatusAsync().catch(() => null);
        if (!sStatus?.isLoaded) return;
        
        const drift = Math.abs(sStatus.positionMillis - masterPos);
        if (drift > 150) { // audibility threshold
          await sound.setPositionAsync(masterPos).catch(() => {});
        }
      }));
    } finally {
      this.state.syncInFlight = false;
    }
  }
}

export default new Conductor();
