/**
 * cloudSyncService.js
 * Syncs UM mobile projects, service plans, and waveforms with CineStage cloud.
 * Uses the /api/sync/projects/* endpoints on the CineStage backend.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CINESTAGE_URL } from '../screens/config';

const DEVICE_ID = 'ipad-ultimate-musician';
const SYNC_KEY = 'um.cloud.sync.meta';

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getSyncMeta() {
  try {
    const raw = await AsyncStorage.getItem(SYNC_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveSyncMeta(meta) {
  await AsyncStorage.setItem(SYNC_KEY, JSON.stringify(meta));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Push a service plan to the cloud.
 *
 * @param {string} serviceId
 * @param {object} plan — full plan object
 * @returns {Promise<{ok: boolean, project_id?: string, version?: number, conflict?: boolean, error?: string}>}
 */
export async function syncServicePlan(serviceId, plan) {
  try {
    const meta = await getSyncMeta();
    const existing = meta[`service_${serviceId}`] || {};

    const body = {
      project_id: existing.cloudId || null,
      name: `Service Plan: ${plan.name || serviceId}`,
      data: { type: 'service_plan', serviceId, plan },
      device_id: DEVICE_ID,
      version: existing.version || 0,
    };

    const res = await fetch(`${CINESTAGE_URL}/api/sync/projects/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.conflict) {
      return { ok: false, conflict: true, message: json.message, version: json.server_version };
    }

    meta[`service_${serviceId}`] = {
      cloudId: json.project_id,
      version: json.version,
      syncedAt: Date.now(),
    };
    await saveSyncMeta(meta);
    return { ok: true, project_id: json.project_id, version: json.version };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Pull all cloud projects, optionally filtered by type.
 *
 * @param {'service_plan'|'waveform'|null} type — pass null to list everything
 * @returns {Promise<{ok: boolean, projects: object[], error?: string}>}
 */
export async function listCloudProjects(type = null) {
  try {
    const res = await fetch(`${CINESTAGE_URL}/api/sync/projects/list`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    let projects = json.projects || [];
    if (type === 'service_plan') {
      projects = projects.filter((p) => p.name.startsWith('Service Plan:'));
    } else if (type === 'waveform') {
      projects = projects.filter((p) => p.name.startsWith('Waveform:'));
    }
    return { ok: true, projects };
  } catch (e) {
    return { ok: false, error: e.message, projects: [] };
  }
}

/**
 * Pull a specific project from the cloud by ID.
 *
 * @param {string} projectId
 * @returns {Promise<{ok: boolean, data?: any, version?: number, error?: string}>}
 */
export async function pullCloudProject(projectId) {
  try {
    const res = await fetch(`${CINESTAGE_URL}/api/sync/projects/${projectId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return { ok: true, data: json.data, version: json.version };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Sync a waveform analysis result to the cloud, keyed by song ID.
 *
 * @param {string} songId
 * @param {string} songUrl — original audio URL (stored for reference)
 * @param {object} waveformData — peaks array or analysis object
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function syncWaveform(songId, songUrl, waveformData) {
  try {
    const meta = await getSyncMeta();
    const existing = meta[`waveform_${songId}`] || {};

    const body = {
      project_id: existing.cloudId || null,
      name: `Waveform: ${songId}`,
      data: { type: 'waveform', songId, songUrl, waveformData },
      device_id: DEVICE_ID,
      version: existing.version || 0,
    };

    const res = await fetch(`${CINESTAGE_URL}/api/sync/projects/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json();

    if (!json.conflict) {
      meta[`waveform_${songId}`] = {
        cloudId: json.project_id,
        version: json.version,
        syncedAt: Date.now(),
      };
      await saveSyncMeta(meta);
    }
    return { ok: !json.conflict };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Delete a cloud project by ID.
 *
 * @param {string} projectId
 * @returns {Promise<boolean>}
 */
export async function deleteCloudProject(projectId) {
  try {
    const res = await fetch(`${CINESTAGE_URL}/api/sync/projects/${projectId}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Return sync status for all locally tracked items.
 * Useful for a settings/debug screen.
 *
 * @returns {Promise<Array<{key: string, cloudId: string, version: number, syncedAt: number, age: number}>>}
 */
export async function getSyncStatus() {
  const meta = await getSyncMeta();
  return Object.entries(meta).map(([key, value]) => ({
    key,
    ...value,
    age: Date.now() - (value.syncedAt || 0),
  }));
}
