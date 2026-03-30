/**
 * CineStage API Client - Ultimate Musician
 * Communicates with CineStage backend for MIDI device control
 */

import { CINESTAGE_URL } from '../screens/config';
const API_BASE_URL = CINESTAGE_URL || 'http://localhost:8000';

/**
 * Scan for connected MIDI devices (USB + Bluetooth)
 */
export const scanDevices = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/devices/scan`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error scanning devices:', error);
    return {
      status: 'error',
      message: error.message,
      detected_devices: {},
    };
  }
};

/**
 * Trigger preset for a song
 * @param {Object} songPreset - Song preset from Ultimate Playback
 * @param {string|null} sectionLabel - Optional section label to trigger
 */
export const triggerPreset = async (songPreset, sectionLabel = null) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/presets/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        song: songPreset,
        section: sectionLabel,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error triggering preset:', error);
    return {
      status: 'error',
      message: error.message,
      triggered_devices: [],
      errors: [{ device: 'unknown', error: error.message }],
    };
  }
};

/**
 * Test individual device recall
 */
export const testDeviceRecall = async (deviceType, config) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/devices/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_type: deviceType,
        config: config,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error testing device:', error);
    return {
      status: 'error',
      message: error.message,
    };
  }
};

/**
 * Check if backend is running
 */
export const checkBackendHealth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch (error) {
    return false;
  }
};

/**
 * Analyze waveform sections, cues, tempo for a song
 */
export const analyzeWaveform = async (songId, resolution = 100) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/waveform/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId, resolution }),
    });
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error analyzing waveform:', error);
    return { status: 'error', message: error.message };
  }
};

/**
 * Get A/B rig redundancy status
 */
export const getABStatus = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/waveform/ab/status`);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    return await response.json();
  } catch (error) {
    return { activeRig: 'A', rigs: { A: { healthy: true, active: true }, B: { healthy: true, active: false } } };
  }
};

/**
 * Get cue markers for a song
 */
export const getWaveformCues = async (songId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/waveform/cues/${encodeURIComponent(songId)}`);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    return await response.json();
  } catch (error) {
    return { songId, cues: [] };
  }
};

export default {
  scanDevices,
  triggerPreset,
  testDeviceRecall,
  checkBackendHealth,
  analyzeWaveform,
  getABStatus,
  getWaveformCues,
};
