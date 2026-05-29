/**
 * CineStage API Client
 * Communicates with CineStage backend for preset triggering
 */

import { getSettings } from '../data/storage';
import { CINESTAGE_URL } from '../../config/syncConfig';
import { setCineStageStatus } from '../services/cinestageStatus';

export class CineStageAPI {
  static _brainBootstrap = null;
  static _brainBootstrapAt = 0;
  static brainCacheTtlMs = 5 * 60 * 1000;
  static defaultStemJobUserId = 'ultimate-playback';

  static buildBootstrapPayload(brain, apiBase) {
    return {
      status: 'ok',
      brain,
      recommended: {
        api_base_url: brain?.api_base_url || apiBase || null,
        ws_url: brain?.ws_url || null,
        sync_url: brain?.sync_url || null,
      },
    };
  }

  static isBrainOnline(brain) {
    if (!brain) return false;
    const status = String(brain?.status || '').trim().toLowerCase();
    if (!status) return true;
    return !['offline', 'error', 'unavailable', 'degraded'].includes(status);
  }

  static normalizeBaseUrl(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  static buildBrainBases(apiBase) {
    return [...new Set([
      this.normalizeBaseUrl(apiBase),
      this.normalizeBaseUrl(CINESTAGE_URL),
    ].filter(Boolean))];
  }

  static normalizeScanResult(result) {
    const devicePayload =
      result?.devices && typeof result.devices === 'object'
        ? result.devices
        : null;

    const inputs = Array.isArray(result?.inputs)
      ? result.inputs
      : Array.isArray(devicePayload?.inputs)
        ? devicePayload.inputs
        : [];

    const outputs = Array.isArray(result?.outputs)
      ? result.outputs
      : Array.isArray(devicePayload?.outputs)
        ? devicePayload.outputs
        : Object.keys(result?.detected_devices || {});

    const detectedDevices =
      result?.detected_devices && typeof result.detected_devices === 'object'
        ? result.detected_devices
        : Object.fromEntries([...inputs, ...outputs].map((name) => [name, { name }]));

    return {
      ...result,
      inputs,
      outputs,
      detected_devices: detectedDevices,
    };
  }

  static isYouTubeUrl(value) {
    return /(?:youtube\.com|youtu\.be)/i.test(String(value || ''));
  }

  static isMissingMidiRuntime(error) {
    return /no module named ['"]?(rtmidi|mido)['"]?/i.test(String(error?.message || error || ''));
  }

  static buildSafeScanResult(message) {
    return this.normalizeScanResult({
      status: 'degraded',
      inputs: [],
      outputs: [],
      detected_devices: {},
      message,
      capabilities: {
        server_scan: false,
        electron_midi: true,
        protocols: ['USB-MIDI', 'Bluetooth LE MIDI', 'RTP-MIDI'],
      },
    });
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

  static sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static normalizeJobStatus(status) {
    return String(status || '').trim().toUpperCase();
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

    const apiBase = await this.getApiBase();
    let lastError = null;

    for (const base of this.buildBrainBases(apiBase)) {
      try {
        const response = await fetch(`${base}/api/brain/capabilities`, {
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`CineStage capabilities ${response.status}`);
        }

        const brain = await response.json();
        this._brainBootstrap = this.buildBootstrapPayload(brain, base);
        this._brainBootstrapAt = Date.now();
        return brain;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      const bootstrap = await this.bootstrapBrain(force);
      return bootstrap.brain;
    }

    throw new Error('CineStage capabilities unavailable.');
  }

  static async bootstrapBrain(force = false) {
    if (
      !force &&
      this._brainBootstrap &&
      Date.now() - this._brainBootstrapAt < this.brainCacheTtlMs
    ) {
      return this._brainBootstrap;
    }

    const apiBase = await this.getApiBase();
    try {
      let payload = null;
      let lastError = null;

      for (const base of this.buildBrainBases(apiBase)) {
        try {
          const response = await fetch(`${base}/api/brain/bootstrap`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
          });

          if (!response.ok) {
            const fallback = await fetch(`${base}/api/brain/capabilities`, {
              headers: { 'Content-Type': 'application/json' },
              cache: 'no-store',
            });
            if (!fallback.ok) {
              throw new Error(`CineStage bootstrap ${response.status}`);
            }
            const brain = await fallback.json();
            payload = this.buildBootstrapPayload(brain, base);
          } else {
            payload = await response.json();
          }

          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!payload) {
        throw lastError || new Error('CineStage bootstrap unavailable.');
      }

      this._brainBootstrap = payload;
      this._brainBootstrapAt = Date.now();
      
      if (this.isBrainOnline(payload?.brain)) {
        setCineStageStatus({ isOnline: true, brain: payload.brain });
      } else {
        setCineStageStatus({ isOnline: false, brain: payload?.brain || null });
      }
      return payload;
    } catch (error) {
      setCineStageStatus({ isOnline: false, brain: null });
      throw error;
    }
  }

  static async loadBrainSnapshot(force = false) {
    const startedAt = Date.now();
    const payload = await this.bootstrapBrain(force);
    const finishedAt = Date.now();
    return {
      brain: payload?.brain ?? null,
      isOnline: this.isBrainOnline(payload?.brain),
      latencyMs: finishedAt - startedAt,
      checkedAt: finishedAt,
      payload,
    };
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
        if (this.isMissingMidiRuntime(error)) {
          return this.buildSafeScanResult(
            'CineStage MIDI scan is not installed on this backend runtime. Use Ultimate Musician desktop for live hardware scanning.'
          );
        }
        lastError = error;
      }
    }

    return this.buildSafeScanResult(
      lastError?.message || 'CineStage device scan is unavailable on this connection.'
    );
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
    const sourceUrl =
      payload?.audioUrl
      || payload?.audio_url
      || payload?.file_url
      || payload?.fileUrl
      || payload?.sourceUrl
      || '';

    if (!sourceUrl) {
      throw new Error('CineStage waveform analysis needs a source URL.');
    }

    const songId = payload?.songId || payload?.song_id || null;
    const title = payload?.title || payload?.song_title || 'Untitled Song';
    const nSections = Number(payload?.n_sections || payload?.nSections || 6) || 6;
    const nBars = Math.max(
      128,
      Math.min(
        1800,
        Number(
          payload?.nBars
          || payload?.waveform_points
          || payload?.waveformPoints
          || payload?.n_bars
          || 1800
        ) || 1800
      )
    );

    const attempts = [];

    if (this.isYouTubeUrl(sourceUrl)) {
      attempts.push(() => this.fetchJson('/cinestage/analyze', {
        method: 'POST',
        body: JSON.stringify({
          file_url: sourceUrl,
          title,
          song_id: songId,
          n_sections: nSections,
        }),
      }));
    }

    attempts.push(() => this.fetchJson('/api/waveform/analyze', {
      method: 'POST',
      body: JSON.stringify({
        audioUrl: sourceUrl,
        songId,
        nBars,
      }),
    }));

    attempts.push(() => this.fetchJson('/api/waveform/analyze', {
      method: 'POST',
      body: JSON.stringify({
        songId,
        song_id: songId,
        file_url: sourceUrl,
        title,
        waveform_points: nBars,
        n_sections: nSections,
        n_bars: nBars,
        refresh: true,
      }),
    }));

    let lastError = null;
    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('CineStage waveform analysis failed.');
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
    const body = {
      user_id: payload?.user_id || payload?.userId || this.defaultStemJobUserId,
      title: payload?.title || payload?.song_title || 'Untitled Song',
      file_url: payload?.file_url || payload?.fileUrl || payload?.sourceUrl || payload?.audioUrl || '',
      enhance_instrument_stems:
        payload?.enhance_instrument_stems
        ?? payload?.enhanceInstrumentStems
        ?? true,
    };

    if (!body.file_url) {
      throw new Error('CineStage stem jobs require a source audio URL.');
    }

    return this.fetchJson('/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  static async getJob(jobId) {
    return this.fetchJson(`/jobs/${encodeURIComponent(jobId)}`);
  }

  static async pollJob(jobId, intervalMs = 750, timeoutMs = 60000) {
    const start = Date.now();

    while (true) {
      const job = await this.getJob(jobId);
      const status = this.normalizeJobStatus(job?.status);
      if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'COMPLETED'].includes(status)) {
        return job;
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error('CineStage poll timed out');
      }
      await this.sleep(intervalMs);
    }
  }
}
