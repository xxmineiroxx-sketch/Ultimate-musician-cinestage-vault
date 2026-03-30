/**
 * Plan Entitlements — Ultimate Musician
 *
 * FREE      → basic playback, lyrics, chord charts (10 song library)
 * PREMIUM   → vocal harmony separation + AI parts, unlimited songs
 * PRO       → full CineStage: stem separation, EQ, MIDI, all AI tools
 * ENTERPRISE → everything + rehearsal mode, 5 device slots, lighting sync
 */

export const PlanTiers = {
  FREE: "FREE",
  LITE: "LITE", // legacy alias — treated as FREE
  PREMIUM: "PREMIUM",
  PRO: "PRO",
  ENTERPRISE: "ENTERPRISE",
};

export function getEntitlements(tier) {
  switch (tier) {
    // ── ENTERPRISE ──────────────────────────────────────────────────────────
    case PlanTiers.ENTERPRISE:
      return {
        // Library
        maxSongs: Infinity,
        maxStems: Infinity,
        chordCharts: true,
        lyrics: true,
        assignments: true,
        servicePlan: true,
        deviceRoles: true,
        deviceSlots: 5,
        // AI / CineStage
        cineStage: true,
        stemSeparation: true, // Demucs real stems (Pro+)
        vocalHarmony: true, // soprano/alto/tenor/bass audio (Premium+)
        aiParts: true, // AI text harmony guidance (Premium+)
        eqAnalysis: true,
        compressionAI: true,
        midiGeneration: true,
        instrumentCharts: true,
        // Hardware
        controllerMapping: true,
        lightingSync: true,
        // Exclusive to Enterprise
        rehearsalMode: true,
      };

    // ── PRO ─────────────────────────────────────────────────────────────────
    case PlanTiers.PRO:
      return {
        maxSongs: Infinity,
        maxStems: Infinity,
        chordCharts: true,
        lyrics: true,
        assignments: true,
        servicePlan: true,
        deviceRoles: true,
        deviceSlots: 1,
        // AI / CineStage
        cineStage: true,
        stemSeparation: true,
        vocalHarmony: true,
        aiParts: true,
        eqAnalysis: true,
        compressionAI: true,
        midiGeneration: true,
        instrumentCharts: true,
        // Hardware
        controllerMapping: true,
        lightingSync: true,
        rehearsalMode: false,
      };

    // ── PREMIUM ─────────────────────────────────────────────────────────────
    case PlanTiers.PREMIUM:
      return {
        maxSongs: Infinity,
        maxStems: 4,
        chordCharts: true,
        lyrics: true,
        assignments: true,
        servicePlan: true,
        deviceRoles: true,
        deviceSlots: 1,
        // AI — vocal features unlocked, full CineStage locked
        cineStage: false,
        stemSeparation: false,
        vocalHarmony: true, // ⭐ vocal separation into voice parts
        aiParts: true, // ⭐ AI harmony text guidance
        eqAnalysis: false,
        compressionAI: false,
        midiGeneration: false,
        instrumentCharts: true,
        // Hardware
        controllerMapping: false,
        lightingSync: false,
        rehearsalMode: false,
      };

    // ── FREE / LITE (default) ────────────────────────────────────────────────
    case PlanTiers.FREE:
    case PlanTiers.LITE:
    default:
      return {
        maxSongs: 10,
        maxStems: 0,
        chordCharts: true,
        lyrics: true,
        assignments: true,
        servicePlan: false,
        deviceRoles: false,
        deviceSlots: 1,
        // All AI locked
        cineStage: false,
        stemSeparation: false,
        vocalHarmony: false,
        aiParts: false,
        eqAnalysis: false,
        compressionAI: false,
        midiGeneration: false,
        instrumentCharts: false,
        controllerMapping: false,
        lightingSync: false,
        rehearsalMode: false,
      };
  }
}

/** Human-readable labels for upgrade prompts */
export const FEATURE_LABELS = {
  stemSeparation: "Stem Separation (Demucs)",
  vocalHarmony: "Vocal Harmony Separation",
  aiParts: "AI Harmony Part Generator",
  cineStage: "CineStage™ Full Suite",
  eqAnalysis: "AI EQ Analysis",
  compressionAI: "AI Compression Suggestions",
  midiGeneration: "MIDI Generation",
  instrumentCharts: "Instrument-Specific Charts",
  controllerMapping: "Hardware Controller Mapping",
  lightingSync: "Lighting Sync",
  rehearsalMode: "Rehearsal Mode (Enterprise)",
  servicePlan: "Service Planning",
};

/** Minimum tier required for each feature */
export const FEATURE_MIN_TIER = {
  vocalHarmony: "PREMIUM",
  aiParts: "PREMIUM",
  instrumentCharts: "PREMIUM",
  servicePlan: "PREMIUM",
  stemSeparation: "PRO",
  cineStage: "PRO",
  eqAnalysis: "PRO",
  compressionAI: "PRO",
  midiGeneration: "PRO",
  controllerMapping: "PRO",
  lightingSync: "PRO",
  rehearsalMode: "ENTERPRISE",
};
