/**
 * CineStage API Client
 * Communicates with CineStage backend for preset triggering
 */

import { getSettings } from '../data/storage';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

export class CineStageAPI {
  static normalizeBaseUrl(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  static async getApiBase() {
    const settings = await getSettings();
    return settings.apiBase;
  }

  static async fetchSyncJson(path, init = {}) {
    const { headers: initHeaders = {}, ...rest } = init;
    const response = await fetch(`${this.normalizeBaseUrl(SYNC_URL)}${path}`, {
      ...rest,
      headers: { ...syncHeaders(), ...initHeaders },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || payload?.detail || `Sync request failed (${response.status})`);
    }
    return payload;
  }

  /**
   * Scan for connected MIDI devices
   */
  static async scanDevices() {
    const apiBase = await this.getApiBase();
    const response = await fetch(`${apiBase}/ai/midi-presets/midi-devices`);
    return await response.json();
  }

  /**
   * Trigger a song preset (all devices)
   */
  static async triggerPreset(songPreset, section = null) {
    const apiBase = await this.getApiBase();
    const response = await fetch(`${apiBase}/api/presets/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        song_preset: songPreset,
        section: section,
      }),
    });
    return await response.json();
  }

  /**
   * Test a specific device recall
   */
  static async testDeviceRecall(deviceType, deviceConfig) {
    const apiBase = await this.getApiBase();
    const response = await fetch(`${apiBase}/api/devices/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_type: deviceType,
        config: deviceConfig,
      }),
    });
    return await response.json();
  }

  /**
   * Send MIDI program change (manual test)
   */
  static async sendProgramChange(keyboard, program, channel = 1) {
    const apiBase = await this.getApiBase();
    const response = await fetch(`${apiBase}/ai/midi-presets/program-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyboard: keyboard,
        program: program,
        channel: channel,
      }),
    });
    return await response.json();
  }

  static async createDesktopStemJob(payload) {
    return this.fetchSyncJson('/sync/stem-jobs', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        processingMode: payload?.processingMode || 'desktop_primary',
        fallbackEligible: payload?.fallbackEligible !== false,
      }),
    });
  }

  static async listDesktopStemJobs(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim()) {
        params.set(key, String(value));
      }
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.fetchSyncJson(`/sync/stem-jobs${suffix}`);
  }

  static async updateDesktopStemJob(jobId, payload = {}) {
    return this.fetchSyncJson(`/sync/stem-job/update?id=${encodeURIComponent(jobId)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async approveDesktopStemJob(jobId, payload = {}) {
    return this.fetchSyncJson(`/sync/stem-job/approve?id=${encodeURIComponent(jobId)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async publishDesktopStemJob(jobId, payload = {}) {
    return this.fetchSyncJson(`/sync/stem-job/publish?id=${encodeURIComponent(jobId)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async rejectDesktopStemJob(jobId, payload = {}) {
    return this.fetchSyncJson(`/sync/stem-job/reject?id=${encodeURIComponent(jobId)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async cleanupExpiredStemJobs(payload = {}) {
    return this.fetchSyncJson('/sync/stem-jobs/cleanup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async sendDesktopHeartbeat(payload = {}) {
    return this.fetchSyncJson('/sync/cinestage/desktop-heartbeat', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async listCineStageDesktops(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim()) {
        params.set(key, String(value));
      }
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.fetchSyncJson(`/sync/cinestage/desktops${suffix}`);
  }

  static async checkCineStageSource(payload = {}) {
    return this.fetchSyncJson('/sync/cinestage/source-check', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async registerCineStageSource(payload = {}) {
    return this.fetchSyncJson('/sync/cinestage/source-registry', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}
