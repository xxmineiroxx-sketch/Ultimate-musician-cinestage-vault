/**
 * CineStage API Client - Ultimate Musician
 * Communicates with CineStage backend for MIDI device control
 */

import { CINESTAGE_URL } from '../screens/config';
import {
  analyzeWaveform as analyzeWaveformClient,
  getABStatus as getABStatusClient,
  getCineStageHealth,
  getWaveformCues as getWaveformCuesClient,
  scanDevices as scanDevicesClient,
} from '../services/cinestage/client';
const API_BASE_URL = CINESTAGE_URL || 'http://localhost:8000';

/**
 * Scan for connected MIDI devices (USB + Bluetooth)
 */
export const scanDevices = async () => {
  try {
    return await scanDevicesClient();
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
    await getCineStageHealth();
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Analyze waveform sections, cues, tempo for a song
 */
export const analyzeWaveform = async (songId, resolution = 100) => {
  try {
    return await analyzeWaveformClient({
      song_id: songId,
      songId,
      waveform_points: resolution,
      waveformPoints: resolution,
      n_bars: resolution,
      nBars: resolution,
    });
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
    return await getABStatusClient();
  } catch (error) {
    return { activeRig: 'A', rigs: { A: { healthy: true, active: true }, B: { healthy: true, active: false } } };
  }
};

/**
 * Get cue markers for a song
 */
export const getWaveformCues = async (songId) => {
  try {
    return await getWaveformCuesClient(songId);
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
