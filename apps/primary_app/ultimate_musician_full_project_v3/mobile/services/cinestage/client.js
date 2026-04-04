import { CINESTAGE_API_BASE_URL } from "./config";

async function http(path, init) {
  const res = await fetch(`${CINESTAGE_API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`CineStage API ${res.status}`);
  return await res.json();
}

// ── Jobs / Stems ──────────────────────────────────────────────────────────────

export const createJob = (payload) =>
  http("/jobs", { method: "POST", body: JSON.stringify(payload) });

export const getJob = (jobId) => http(`/jobs/${encodeURIComponent(jobId)}`);

export async function pollJob(jobId, intervalMs = 750, timeoutMs = 60000) {
  const start = Date.now();
  while (true) {
    const job = await getJob(jobId);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) return job;
    if (Date.now() - start > timeoutMs)
      throw new Error("CineStage poll timed out");
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

// ── Mix / EQ / Compression ────────────────────────────────────────────────────

/**
 * EQ analysis for a track.
 * payload: { track_name, genre?, instrumentation?, mix_context? }
 */
export const analyzeEQ = (payload) =>
  http("/ai/music/analyze-eq", { method: "POST", body: JSON.stringify(payload) });

/**
 * Compression suggestions.
 * payload: { track_name, genre?, role?, dynamic_range? }
 */
export const suggestCompression = (payload) =>
  http("/ai/music/suggest-compression", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Full mix recommendations across all stems/channels.
 * payload: { song_title, genre?, stems?, channel_names? }
 */
export const getMixRecommendations = (payload) =>
  http("/ai/music/mix-recommendations", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Apply mixer settings to a channel (returns recommended parameter values).
 * payload: { channel, settings: { eq, compression, fx, ... } }
 */
export const applyMixerSettings = (payload) =>
  http("/ai/music/mixer/apply-settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });

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
  http("/ai/midi-presets/quick-setup", {
    method: "POST",
    body: JSON.stringify(payload),
  });

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
