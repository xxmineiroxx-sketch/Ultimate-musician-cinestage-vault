/**
 * CineStage API Client
 * Communicates with CineStage backend for preset triggering
 */

import { getSettings } from '../data/storage';
import { CINESTAGE_URL } from '../../config/syncConfig';

export class CineStageAPI {
  static _brainBootstrap = null;
  static _brainBootstrapAt = 0;
  static brainCacheTtlMs = 5 * 60 * 1000;

  static normalizeScanResult(result) {
    const outputs = Array.isArray(result?.outputs)
      ? result.outputs
      : Object.keys(result?.detected_devices || {});

    const detectedDevices =
      result?.detected_devices && typeof result.detected_devices === 'object'
        ? result.detected_devices
        : Object.fromEntries(outputs.map((name) => [name, { name }]));

    return {
      ...result,
      outputs,
      detected_devices: detectedDevices,
    };
  }

  static async getApiBase() {
    const settings = await getSettings();
    return settings?.apiBase || CINESTAGE_URL;
  }

  static async fetchJson(path, init = {}, explicitBase = null) {
    const apiBase = explicitBase || await this.getApiBase();
    const response = await fetch(`${apiBase}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
      ...init,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || `CineStage request failed (${response.status})`);
    }
    return payload;
  }

  static async getHealth() {
    return this.fetchJson('/health');
  }

  static async getCapabilities(force = false) {
    if (
      !force &&
      this._brainBootstrap?.brain?.capabilities &&
      Date.now() - this._brainBootstrapAt < this.brainCacheTtlMs
    ) {
      return this._brainBootstrap.brain;
    }

    return this.fetchJson('/api/brain/capabilities');
  }

  static async bootstrapBrain(force = false) {
    if (
      !force &&
      this._brainBootstrap &&
      Date.now() - this._brainBootstrapAt < this.brainCacheTtlMs
    ) {
      return this._brainBootstrap;
    }

    const payload = await this.fetchJson('/api/brain/bootstrap');
    this._brainBootstrap = payload;
    this._brainBootstrapAt = Date.now();
    return payload;
  }

  /**
   * Scan for connected MIDI devices
   */
  static async scanDevices() {
    const endpoints = [
      '/api/devices/scan',
      '/ai/midi-presets/midi-devices',
    ];

    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const payload = await this.fetchJson(endpoint);
        return this.normalizeScanResult(payload);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('CineStage device scan failed');
  }

  /**
   * Trigger a song preset (all devices)
   */
  static async triggerPreset(songPreset, section = null) {
    return this.fetchJson('/api/presets/trigger', {
      method: 'POST',
      body: JSON.stringify({
        song_preset: songPreset,
        section: section,
      }),
    });
  }

  /**
   * Test a specific device recall
   */
  static async testDeviceRecall(deviceType, deviceConfig) {
    return this.fetchJson('/api/devices/test', {
      method: 'POST',
      body: JSON.stringify({
        device_type: deviceType,
        config: deviceConfig,
      }),
    });
  }

  /**
   * Send MIDI program change (manual test)
   */
  static async sendProgramChange(keyboard, program, channel = 1) {
    return this.fetchJson('/ai/midi-presets/program-change', {
      method: 'POST',
      body: JSON.stringify({
        keyboard: keyboard,
        program: program,
        channel: channel,
      }),
    });
  }

  static async analyzeWaveform(payload) {
    return this.fetchJson('/api/waveform/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async analyzeSongArrangement(payload) {
    return this.fetchJson('/ai/song-arrangement/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async generateInstrumentChartText(payload) {
    return this.fetchJson('/ai/instrument-charts/generate-text', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async createMidiPreset(payload) {
    return this.fetchJson('/ai/midi-presets/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async getMixRecommendations(payload) {
    return this.fetchJson('/ai/music/mix-recommendations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async analyzeWorshipFlow(payload) {
    return this.fetchJson('/worship-flow/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async createStemJob(payload) {
    return this.fetchJson('/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async getJob(jobId) {
    return this.fetchJson(`/jobs/${encodeURIComponent(jobId)}`);
  }

  static async pollJob(jobId, intervalMs = 750, timeoutMs = 60000) {
    const start = Date.now();

    while (true) {
      const job = await this.getJob(jobId);
      if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'COMPLETED'].includes(job?.status)) {
        return job;
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error('CineStage poll timed out');
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
