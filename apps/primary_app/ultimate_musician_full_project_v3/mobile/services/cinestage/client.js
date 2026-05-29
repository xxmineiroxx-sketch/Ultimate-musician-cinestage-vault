import {
  CINESTAGE_API_BASE_URL,
  CINESTAGE_REMOTE_API_BASE_URL,
} from "./config";

async function http(path, init) {
  const res = await fetch(`${CINESTAGE_API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      payload?.detail
      || payload?.error
      || payload?.message
      || `CineStage API ${res.status}`,
    );
  }
  return payload;
}

let _brainBootstrap = null;
let _brainBootstrapAt = 0;
const BRAIN_CACHE_TTL_MS = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMusicAiJobId(prefix = "cinestage") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeJobStatus(value) {
  return String(value || "").trim().toLowerCase();
}

async function pollMusicAiJob(basePath, jobId, {
  intervalMs = 900,
  timeoutMs = 60000,
} = {}) {
  const start = Date.now();

  while (true) {
    const result = await http(`${basePath}/${encodeURIComponent(jobId)}`);
    const status = normalizeJobStatus(result?.status);

    if (status === "completed") return result;
    if (status === "failed") {
      throw new Error(result?.error || `CineStage job ${jobId} failed.`);
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error("CineStage music AI job timed out.");
    }

    await sleep(intervalMs);
  }
}

async function runMusicAiJob(submitPath, pollPath, payload, prefix, options) {
  const request = {
    ...payload,
    job_id: payload?.job_id || buildMusicAiJobId(prefix),
  };
  const queued = await http(submitPath, {
    method: "POST",
    body: JSON.stringify(request),
  });
  const jobId = queued?.job_id || request.job_id;

  if (!jobId) return queued;
  return pollMusicAiJob(pollPath, jobId, options);
}

function buildBootstrapPayload(brain) {
  return {
    status: "ok",
    brain,
    recommended: {
      api_base_url: brain?.api_base_url || CINESTAGE_API_BASE_URL,
      ws_url: brain?.ws_url || null,
      sync_url: brain?.sync_url || null,
    },
  };
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function getBrainBaseCandidates() {
  return [...new Set([
    normalizeBaseUrl(CINESTAGE_API_BASE_URL),
    normalizeBaseUrl(CINESTAGE_REMOTE_API_BASE_URL),
  ].filter(Boolean))];
}

async function fetchBrainBootstrapFromBase(apiBase) {
  const res = await fetch(`${apiBase}/api/brain/bootstrap`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (res.ok) {
    return await res.json();
  }

  const fallbackRes = await fetch(`${apiBase}/api/brain/capabilities`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!fallbackRes.ok) {
    throw new Error(`CineStage bootstrap ${res.status}`);
  }

  const brain = await fallbackRes.json();
  return buildBootstrapPayload(brain);
}

async function fetchBrainCapabilitiesFromBase(apiBase) {
  const res = await fetch(`${apiBase}/api/brain/capabilities`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`CineStage capabilities ${res.status}`);
  }

  return await res.json();
}

export const getCineStageHealth = () => http("/health");

export function isBrainOnline(brain) {
  if (!brain) return false;
  const status = String(brain?.status || "").trim().toLowerCase();
  if (!status) return true;
  return !["offline", "error", "unavailable", "degraded"].includes(status);
}


export async function loadBrainSnapshot(force = false) {
  const startedAt = Date.now();
  const payload = await bootstrapBrain(force);
  const finishedAt = Date.now();
  return {
    brain: payload?.brain ?? null,
    isOnline: isBrainOnline(payload?.brain),
    latencyMs: finishedAt - startedAt,
    checkedAt: finishedAt,
    payload,
  };
}

function normalizeScanResult(result) {
  const devicePayload =
    result?.devices && typeof result.devices === "object"
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
    result?.detected_devices && typeof result.detected_devices === "object"
      ? result.detected_devices
      : Object.fromEntries(
          [...inputs, ...outputs].map((name) => [name, { name }]),
        );

  return {
    ...result,
    inputs,
    outputs,
    detected_devices: detectedDevices,
  };
}

function isMissingMidiRuntime(error) {
  return /no module named ['"]?(rtmidi|mido)['"]?/i.test(
    String(error?.message || error || ""),
  );
}

function buildSafeScanResult(message) {
  return normalizeScanResult({
    status: "degraded",
    inputs: [],
    outputs: [],
    detected_devices: {},
    message,
    capabilities: {
      server_scan: false,
      electron_midi: true,
      protocols: ["USB-MIDI", "Bluetooth LE MIDI", "RTP-MIDI"],
    },
  });
}

export async function scanDevices() {
  const endpoints = [
    "/api/devices/scan",
    "/ai/midi-presets/midi-devices",
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const payload = await http(endpoint);
      return normalizeScanResult(payload);
    } catch (error) {
      if (isMissingMidiRuntime(error)) {
        return buildSafeScanResult(
          "CineStage MIDI scan is not installed on this backend runtime. Use Ultimate Musician desktop for live hardware scanning.",
        );
      }
      lastError = error;
    }
  }

  return buildSafeScanResult(
    lastError?.message || "CineStage device scan is unavailable on this connection.",
  );
}

export async function getBrainCapabilities(force = false) {
  if (!force && _brainBootstrap?.brain?.capabilities && Date.now() - _brainBootstrapAt < BRAIN_CACHE_TTL_MS) {
    return _brainBootstrap.brain;
  }

  let lastError = null;
  for (const apiBase of getBrainBaseCandidates()) {
    try {
      const brain = await fetchBrainCapabilitiesFromBase(apiBase);
      _brainBootstrap = buildBootstrapPayload(brain);
      _brainBootstrapAt = Date.now();
      return brain;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    const bootstrap = await bootstrapBrain(force);
    return bootstrap.brain;
  }

  throw new Error("CineStage capabilities unavailable.");
}

export async function bootstrapBrain(force = false) {
  if (!force && _brainBootstrap && Date.now() - _brainBootstrapAt < BRAIN_CACHE_TTL_MS) {
    return _brainBootstrap;
  }

  let lastError = null;
  for (const apiBase of getBrainBaseCandidates()) {
    try {
      _brainBootstrap = await fetchBrainBootstrapFromBase(apiBase);
      _brainBootstrapAt = Date.now();
      return _brainBootstrap;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("CineStage bootstrap unavailable.");
}

// ── Jobs / Stems ──────────────────────────────────────────────────────────────

export const createJob = (payload) =>
  http("/jobs", { method: "POST", body: JSON.stringify(payload) });

export const getJob = (jobId) => http(`/jobs/${encodeURIComponent(jobId)}`);

const _TERMINAL = new Set(["COMPLETED", "SUCCEEDED", "FAILED", "CANCELLED", "ERROR"]);

export async function pollJob(jobId, intervalMs = 1500, timeoutMs = 300000) {
  const start = Date.now();
  while (true) {
    const job = await getJob(jobId);
    if (_TERMINAL.has(job.status)) return job;
    if (Date.now() - start > timeoutMs)
      throw new Error("CineStage stem separation timed out — check job status later");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ── Song Pipeline ─────────────────────────────────────────────────────────────

/**
 * Full audio analysis: BPM, key, sections, cues, beats, performance graph.
 * payload: { file_url, title?, song_id?, n_sections? }
 */
export const analyzeAudio = (payload) =>
  http("/cinestage/analyze", { method: "POST", body: JSON.stringify(payload) });

/**
 * Generate role-specific performance cues from sections.
 * payload: { sections: [{section, start_ms, end_ms}], role?: string }
 */
export const generateCues = (payload) =>
  http("/cinestage/cues", { method: "POST", body: JSON.stringify(payload) });

// ── Vocal Parts ───────────────────────────────────────────────────────────────

/**
 * AI vocal harmony guidance (text — no audio needed).
 * payload: { song_title, key, chord_chart?, parts? }
 */
export const generateVocalParts = (payload) =>
  http("/cinestage/ai/vocal-parts", {
    method: "POST",
    body: JSON.stringify(payload),
  });

// ── Instrument Charts ─────────────────────────────────────────────────────────

/**
 * Generate instrument-specific chart (tab/notation/lead sheet).
 * payload: { instrument, song_title, key, chord_chart?, style? }
 */
export const generateInstrumentChart = (payload) =>
  http("/ai/instrument-charts/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Quick text-based instrument chart (no audio).
 * payload: { instrument, song_title, key, chord_chart? }
 */
export const generateInstrumentChartText = (payload) =>
  http("/ai/instrument-charts/generate-text", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Organize a full song into role charts, lyrics, section cues, and waveform-ready sections.
 * payload: { song_title, artist?, key?, bpm?, time_signature?, chord_chart?, lyrics?, sections? }
 */
export const analyzeSongArrangement = (payload) =>
  http("/ai/song-arrangement/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Capo calculator — find best capo position for a given key/instrument.
 * payload: { key, instrument?, target_key? }
 */
export const getCapoCalculation = (payload) =>
  http("/ai/instrument-charts/capo-calculator", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/** List all supported instruments. */
export const listInstruments = () =>
  http("/ai/instrument-charts/instruments");

// ── Music Theory ──────────────────────────────────────────────────────────────

/**
 * Music theory analysis of a chord chart / progression.
 * payload: { chord_chart, key?, song_title? }
 */
export const analyzeTheory = (payload) =>
  http("/ai/music/analyze-theory", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Generate MIDI from a chord chart / progression.
 * payload: { chord_chart, key?, tempo?, style? }
 */
export const generateMidi = (payload) =>
  http("/ai/music/generate-midi", {
    method: "POST",
    body: JSON.stringify(payload),
  });

// ── DAW Templates ─────────────────────────────────────────────────────────────

/**
 * Generate a DAW session template.
 * payload: { genre, daw, song_title?, instruments? }
 */
export const generateDAWTemplate = (payload) =>
  http("/ai/templates/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Create a DAW template with full AI composition intelligence.
 * payload: { genre, daw, description?, target_mood? }
 */
export const createDAWTemplateWithAI = (payload) =>
  http("/ai/templates/create-with-ai", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/** List supported DAWs. */
export const listDAWs = () => http("/ai/templates/daws");

/** List supported genres for templates. */
export const listTemplateGenres = () => http("/ai/templates/genres");

// ── MIDI Presets ──────────────────────────────────────────────────────────────

/**
 * Create a MIDI preset for an instrument/sound.
 * payload: { preset_name, instrument, channel?, program?, bank?, cc_values? }
 */
export const createMidiPreset = (payload) =>
  http("/ai/midi-presets/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Trigger a saved MIDI preset by name.
 * payload: { preset_name, channel? }
 */
export const triggerMidiPreset = (payload) =>
  http("/ai/midi-presets/trigger", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Send a MIDI program change.
 * payload: { channel, program, bank? }
 */
export const sendProgramChange = (payload) =>
  http("/ai/midi-presets/program-change", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/** List all saved MIDI presets. */
export const listMidiPresets = () => http("/ai/midi-presets/list");

/**
 * Get a specific MIDI preset by name.
 * presetName: string
 */
export const getMidiPreset = (presetName) =>
  http(`/ai/midi-presets/preset/${encodeURIComponent(presetName)}`);

/** List available MIDI devices on the server. */
export const listMidiDevices = () => http("/ai/midi-presets/midi-devices");

/**
 * Quick MIDI setup — AI-assisted preset creation from description.
 * payload: { description, instrument?, genre? }
 */
export const quickMidiSetup = (payload) =>
  http(
    `/ai/midi-presets/quick-setup?${new URLSearchParams(
      Object.entries(payload || {}).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          acc[key] = String(value);
        }
        return acc;
      }, {}),
    ).toString()}`,
    {
      method: "POST",
    },
  );

// ── Vocal Harmony (Audio) ─────────────────────────────────────────────────────

/**
 * Separate vocal harmonies from an audio file.
 * payload: { vocal_stem_url, song_id?, voice_count?, org_id?, secret_key?, sync_url? }
 */
export const separateVocalHarmony = (payload) =>
  http("/ai/vocal-harmony/separate", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Get status / result of a vocal harmony separation job.
 * jobId: string
 */
export const getVocalHarmonyJob = (jobId) =>
  http(`/ai/vocal-harmony/status/${encodeURIComponent(jobId)}`);

/**
 * Get separated voice-part URLs for a completed harmony job.
 * jobId: string
 */
export const getVocalHarmonyVoices = (jobId) =>
  http(`/ai/vocal-harmony/voices/${encodeURIComponent(jobId)}`);

// ── Waveform Visual Engine ────────────────────────────────────────────────────

/**
 * Analyze a track and return waveform peaks + section markers.
 * payload: { file_url, song_id?, title?, n_bars? }
 * Returns: { peaks: number[], sections: [{label, position}], duration_ms }
 */
export const analyzeWaveform = (payload) =>
  http("/api/waveform/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Get cached waveform cues for a song.
 * songId: string
 */
export const getWaveformCues = (songId) =>
  http(`/api/waveform/cues/${encodeURIComponent(songId)}`);

/** A/B touring status — which section/arrangement is currently active. */
export const getABStatus = () => http("/api/waveform/ab/status");

/** Waveform engine health. */
export const waveformHealth = () => http("/api/waveform/health");
