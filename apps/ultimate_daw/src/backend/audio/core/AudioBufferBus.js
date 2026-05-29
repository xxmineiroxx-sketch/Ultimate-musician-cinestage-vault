'use strict';

class AudioBufferBus {
  constructor({ name, channelCount, frameCount }) {
    this.name = name;
    this.channelCount = channelCount;
    this.frameCount = frameCount;
    this.channels = Array.from({ length: channelCount }, () => new Float32Array(frameCount));
  }

  resize(frameCount) {
    this.frameCount = frameCount;
    this.channels = Array.from({ length: this.channelCount }, () => new Float32Array(frameCount));
  }

  clear() {
    this.channels.forEach(ch => ch.fill(0));
  }

  addFrom(other, gain = 1) {
    const len = Math.min(this.frameCount, other.frameCount);
    for (let c = 0; c < Math.min(this.channelCount, other.channelCount); c++) {
      for (let i = 0; i < len; i++) this.channels[c][i] += other.channels[c][i] * gain;
    }
  }

  measurePeak() {
    let peak = 0;
    for (const ch of this.channels) {
      for (const s of ch) {
        const a = Math.abs(s);
        if (a > peak) peak = a;
      }
    }
    return peak;
  }

  getPreview(bands) {
    const ch = this.channels[0] ?? new Float32Array(this.frameCount);
    const step = Math.max(1, Math.floor(ch.length / bands));
    const out = [];
    for (let i = 0; i < bands; i++) {
      let peak = 0;
      for (let j = i * step; j < Math.min((i + 1) * step, ch.length); j++) {
        const a = Math.abs(ch[j]);
        if (a > peak) peak = a;
      }
      out.push(Number(peak.toFixed(3)));
    }
    return out;
  }
}

module.exports = { AudioBufferBus };
