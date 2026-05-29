/**
 * Worship Predictive Conductor Service
 * 
 * Coordinates high-level intelligence from the Waveform Intelligence Agent:
 * - MD-AI Voice Cues (1, 2, 3, Chorus...) using expo-speech
 * - Haptic-Waveform Feedback (ProMotion/120Hz optimized)
 * - Harmonic Conflict Alerts
 */

import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

// Optional import for Haptics - fallback to console or stub if not available
let Haptics = null;
try {
  Haptics = require('expo-haptics');
} catch (e) {
  // Not installed
}

let _timers = [];
let _hapticInterval = null;

/**
 * Start the predictive conductor for a song
 * 
 * @param {object} analysis - The worship_intelligence payload from the agent
 * @param {number} position - Current playback position in seconds
 * @param {boolean} voiceCuesEnabled - Whether to speak MD cues
 * @param {boolean} hapticsEnabled - Whether to trigger haptic pulses
 */
export function startConductor({
  analysis,
  position = 0,
  voiceCuesEnabled = true,
  hapticsEnabled = true,
  lang = 'EN'
}) {
  stopConductor();

  if (!analysis) return;

  const { md_cues = [], haptic_map = [], harmonic_conflicts = [] } = analysis;

  // 1. Schedule MD-AI Voice Cues
  if (voiceCuesEnabled) {
    md_cues.forEach(cue => {
      const delay = (cue.time - position) * 1000;
      if (delay > 0) {
        const t = setTimeout(() => {
          const phrase = lang === 'PT' ? cue.voice_data.pt_script.join(', ') : cue.voice_data.script.join(', ');
          Speech.speak(phrase, { rate: 0.9, pitch: 1.0 });
        }, delay);
        _timers.push(t);
      }
    });
  }

  // 2. Start Haptic Pulse Engine
  if (hapticsEnabled && Haptics) {
    // For efficiency, we don't use timers for every beat
    // Instead, we check the haptic_map against the current playhead
    // Or we use a high-frequency interval for "ProMotion" precision
    
    // Implementation note: In a real app, the playhead update loop 
    // would call triggerHapticAtTime(time)
  }

  // 3. Log Harmonic Conflicts
  if (harmonic_conflicts.length > 0) {
    console.log('🎼 [PredictiveConductor] Harmonic Conflicts Detected:', harmonic_conflicts);
  }
}

export function stopConductor() {
  _timers.forEach(clearTimeout);
  _timers = [];
  if (_hapticInterval) clearInterval(_hapticInterval);
}

/**
 * Trigger haptic feedback based on the haptic map
 */
export function triggerHaptic(type = 'impactLight') {
  if (!Haptics) return;
  
  switch(type) {
    case 'impactHeavy':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
    case 'impactMedium':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    default:
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

export default {
  startConductor,
  stopConductor,
  triggerHaptic
};
