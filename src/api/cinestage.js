/**
 * CineStage API Client
 * Communicates with CineStage backend for preset triggering
 */

import { getSettings } from '../data/storage';

export class CineStageAPI {
  static async getApiBase() {
    const settings = await getSettings();
    return settings.apiBase;
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
}
