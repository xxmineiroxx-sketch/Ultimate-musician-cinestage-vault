/**
 * TimingEngine.js
 * Beat/bar counter that fires EventBus events.
 * Call onBeat() on every incoming beat tick (from MIDI clock or a JS timer).
 *
 * Events emitted:
 *   "beat"  { beat: number }     — every beat
 *   "bar"   { bar: number }      — every downbeat (beat % beatsPerBar === 0)
 */

import EventBus from './EventBus';

class TimingEngine {
  constructor() {
    this.beat = 0;
    this.bar = 0;
    this.beatsPerBar = 4;
  }

  setBeatsPerBar(n) {
    this.beatsPerBar = n > 0 ? n : 4;
  }

  onBeat() {
    this.beat++;
    EventBus.emit('beat', { beat: this.beat });

    if (this.beat % this.beatsPerBar === 0) {
      this.bar++;
      EventBus.emit('bar', { bar: this.bar });
    }
  }

  reset() {
    this.beat = 0;
    this.bar = 0;
  }
}

export default new TimingEngine();
