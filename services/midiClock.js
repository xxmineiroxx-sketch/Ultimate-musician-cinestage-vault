/**
 * MIDI Clock Out v1 (Hybrid)
 *
 * - For mobile (Expo), sends clock ticks to Bridge via WebSocket.
 * - For web builds (browser), uses Web MIDI if available.
 *
 * MIDI Clock spec: 24 pulses per quarter note (PPQN = 24).
 */

import { sendBridge } from './bridgeClient';

let timer = null;
let bpm = 120;
let running = false;
let midiOutput = null;

const PPQN = 24;

export async function initWebMIDI() {
  try {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) return false;
    const access = await navigator.requestMIDIAccess();
    // pick first output for now
    const outputs = Array.from(access.outputs.values());
    midiOutput = outputs[0] || null;
    return !!midiOutput;
  } catch {
    return false;
  }
}

export function setBpm(nextBpm) {
  bpm = Math.max(20, Math.min(300, Number(nextBpm) || 120));
  if (running) restart();
}

export function startClock() {
  if (running) return;
  running = true;

  // send MIDI Start
  sendRaw([0xFA]);

  // tick interval ms
  const msPerQuarter = 60000 / bpm;
  const interval = msPerQuarter / PPQN;

  timer = setInterval(() => {
    // Clock tick
    sendRaw([0xF8]);
  }, interval);

  // also notify bridge
  sendBridge({ type: 'MIDI_CLOCK', action: 'start', bpm });
}

export function stopClock() {
  if (!running) return;
  running = false;
  if (timer) clearInterval(timer);
  timer = null;
  // MIDI Stop
  sendRaw([0xFC]);
  sendBridge({ type: 'MIDI_CLOCK', action: 'stop', bpm });
}

export function continueClock() {
  // MIDI Continue
  sendRaw([0xFB]);
  sendBridge({ type: 'MIDI_CLOCK', action: 'continue', bpm });
}

export function restart() {
  if (!running) return;
  stopClock();
  startClock();
}

function sendRaw(bytes) {
  // Web MIDI
  try {
    if (midiOutput) midiOutput.send(bytes);
  } catch {}
  // Bridge
  try {
    sendBridge({ type: 'MIDI_RAW', bytes });
  } catch {}
}
