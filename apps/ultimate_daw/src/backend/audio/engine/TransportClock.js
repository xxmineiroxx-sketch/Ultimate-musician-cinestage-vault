'use strict';

class TransportClock {
  constructor({ bpm, sampleRate, blockSize, timeSignature }) {
    this.bpm = bpm;
    this.sampleRate = sampleRate;
    this.blockSize = blockSize;
    this.beatsPerBar = timeSignature[0];
    this.beatUnit = timeSignature[1];
    this.playing = false;
    this.currentSample = 0;
  }

  get samplesPerBeat() {
    return (60 * this.sampleRate) / this.bpm;
  }

  setBpm(bpm) {
    this.bpm = Math.max(20, Math.min(300, bpm));
  }

  start() {
    this.playing = true;
  }

  stop() {
    this.playing = false;
  }

  togglePlayback() {
    this.playing = !this.playing;
    return this.getStatus();
  }

  advance(frameCount) {
    if (this.playing) this.currentSample += frameCount;
    return this.getStatus();
  }

  seekToBar(bar) {
    this.currentSample = Math.round(
      (Math.max(1, Math.floor(bar)) - 1) * this.beatsPerBar * this.samplesPerBeat
    );
    return this.getStatus();
  }

  getPosition() {
    const totalBeats = this.currentSample / this.samplesPerBeat;
    const completedBars = Math.floor(totalBeats / this.beatsPerBar);
    const beatPos = totalBeats - completedBars * this.beatsPerBar;
    const wholeBeat = Math.floor(beatPos);
    return {
      bar: completedBars + 1,
      beat: wholeBeat + 1,
      sixteenth: Math.floor((beatPos - wholeBeat) * 4) + 1,
      currentTimeSeconds: Number((this.currentSample / this.sampleRate).toFixed(3)),
    };
  }

  getStatus() {
    return {
      playing: this.playing,
      bpm: this.bpm,
      currentSample: this.currentSample,
      ...this.getPosition(),
    };
  }
}

module.exports = { TransportClock };
