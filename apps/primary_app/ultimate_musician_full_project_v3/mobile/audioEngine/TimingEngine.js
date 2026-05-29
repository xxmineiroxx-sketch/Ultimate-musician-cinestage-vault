/**
 * TimingEngine.js (v2 - High Performance)
 * Features:
 * - Look-ahead scheduling (4 beats early)
 * - Event-based architecture for MD-AI voice cues and Haptics
 * - High-precision bar/beat tracking
 */

import EventBus from './EventBus';

class TimingEngine {
  constructor() {
    this.beat = 0;
    this.bar = 0;
    this.beatsPerBar = 4;
    this.bpm = 120;
    this.nextSection = null;
    this.lookAheadBeats = 4;
    this.active = false;
  }

  setBpm(bpm) {
    this.bpm = bpm || 120;
  }

  setBeatsPerBar(n) {
    this.beatsPerBar = n > 0 ? n : 4;
  }

  onBeat() {
    if (!this.active) return;
    
    this.beat++;
    const currentBarBeat = ((this.beat - 1) % this.beatsPerBar) + 1;

    // Emit standard beat/bar events
    EventBus.emit('beat', { 
      beat: this.beat, 
      bar: this.bar, 
      currentBarBeat 
    });

    if (currentBarBeat === this.beatsPerBar) {
      this.bar++;
      EventBus.emit('bar', { bar: this.bar });
    }

    // AI Look-Ahead Logic: Trigger cues 4 beats early
    this.handleLookAhead(currentBarBeat);
  }

  handleLookAhead(currentBarBeat) {
    // If we have a pending section transition or bar end
    if (this.nextSection) {
      // Trigger voice countdown exactly 4 beats before change
      // logic: "1, 2, 3, [SECTION]"
      const cueIndex = 4 - (this.lookAheadBeats - (this.beat % this.lookAheadBeats));
      
      if (this.beat % this.lookAheadBeats === 0) {
        EventBus.emit('md-ai-cue', { 
          type: 'section_transition', 
          section: this.nextSection,
          countdown: 0
        });
        this.nextSection = null; // Reset after trigger
      } else {
        EventBus.emit('md-ai-cue', { 
          type: 'countdown', 
          value: 4 - (this.beat % 4) 
        });
      }
    }
  }

  start() { this.active = true; }
  stop() { this.active = false; }
  reset() {
    this.beat = 0;
    this.bar = 0;
    this.active = false;
  }
}

export default new TimingEngine();
