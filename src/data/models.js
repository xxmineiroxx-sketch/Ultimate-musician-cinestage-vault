/**
 * Data Models for Ultimate Playback
 * Phase 1: Basic preset structure for Nord Stage & MODX
 */

export const DEVICE_TYPES = {
  NORD_STAGE_3: 'nord_stage_3',
  NORD_STAGE_4: 'nord_stage_4',
  MODX: 'modx',
  KEMPER: 'kemper',
  HELIX: 'helix',
  AXEFX: 'axe_fx_3',
  STRYMON_TIMELINE: 'strymon_timeline',
  STRYMON_BIGSKY: 'strymon_bigsky',
  DARKGLASS: 'darkglass_x7',
  ABLETON: 'ableton_live',
  PROTOOLS: 'pro_tools',
  MAINSTAGE: 'mainstage',
};

export const INSTRUMENT_ROLES = [
  'Keyboardist',
  'Guitarist',
  'Bassist',
  'Acoustic Guitarist',
  'Drummer',
  'Vocalist',
];

export const SONG_SECTIONS = [
  'Intro',
  'Verse',
  'Pre-Chorus',
  'Chorus',
  'Bridge',
  'Solo',
  'Outro',
  'All',
];

/**
 * Create a new song preset
 */
export const createSongPreset = () => ({
  id: generateId('song'),
  title: '',
  artist: '',
  original_key: '',
  current_key: '',
  tempo: null,
  time_signature: '4/4',

  // Device setups by instrument role
  device_setups: {
    keyboardist: {
      nord_stage_4: null,
      modx: null,
      ableton_live: null,
    },
    guitarist: {
      kemper: null, // { rigs: [KemperRig, ...] }
      helix: null, // { presets: [HelixPreset, ...] }
      axe_fx_3: null, // { presets: [AxeFXPreset, ...] }
      effects: [], // Strymon, etc.
    },
    bassist: {
      kemper: null,
      helix: null,
      axe_fx_3: null,
      darkglass: null,
      effects: [],
    },
  },

  // Section mappings (which devices/programs to use per section)
  section_mappings: {},

  // Musician notes
  musician_notes: {},

  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  created_by: null,
  shared_with_ultimate_musician: false,
});

/**
 * Nord Stage 4 Program Definition
 */
export const createNordProgram = (programNumber = 1) => ({
  program_number: programNumber,
  name: `Program ${programNumber}`,

  // Nord Stage 4 has: 2 Piano slots, 3 Synth slots, 2 Organ slots
  piano_1: {
    enabled: false,
    patch_name: '',
    patch_location: '', // "Factory:Acoustic:001"
    volume: 100,
    octave_shift: 0,
  },
  piano_2: {
    enabled: false,
    patch_name: '',
    patch_location: '',
    volume: 100,
    octave_shift: 0,
  },
  synth_1: {
    enabled: false,
    patch_name: '',
    patch_location: '',
    volume: 100,
    octave_shift: 0,
  },
  synth_2: {
    enabled: false,
    patch_name: '',
    patch_location: '',
    volume: 100,
    octave_shift: 0,
  },
  synth_3: {
    enabled: false,
    patch_name: '',
    patch_location: '',
    volume: 100,
    octave_shift: 0,
  },
  organ_1: {
    enabled: false,
    drawbars: '888000000',
    volume: 100,
  },
  organ_2: {
    enabled: false,
    drawbars: '888000000',
    volume: 100,
  },

  split_point: 'C3',
  layer_mode: 'full', // 'full', 'split', 'dual'

  // Which sections use this program
  sections: [],
});

/**
 * MODX Performance Definition
 */
export const createMODXPerformance = (performanceNumber = 1) => ({
  performance_number: performanceNumber,
  name: `Performance ${performanceNumber}`,

  // MODX can have up to 8 parts per performance
  parts: [
    {
      part_number: 1,
      enabled: false,
      patch_name: '',
      patch_location: '', // "Preset:001(A01)" or "User:088(B88)"
      bank_msb: 63,
      bank_lsb: 0,
      program: 0,
      volume: 100,
      pan: 64,
      note_shift: 0,
    },
  ],

  mode: 'layer', // 'layer', 'split', 'arp'
  split_point: null,

  // Which sections use this performance
  sections: [],
});

/**
 * Kemper Rig Definition
 */
export const createKemperRig = (rigNumber = 1) => ({
  rig_number: rigNumber, // 1-125 (25 banks × 5 rigs)
  rig_name: `Rig ${rigNumber}`,
  rig_location: '', // "Bank 0 Position A" or "User:Worship:005"
  bank: Math.floor((rigNumber - 1) / 5), // 0-24
  position: ['A', 'B', 'C', 'D', 'E'][(rigNumber - 1) % 5], // A-E
  effects: {
    slot_a: true,
    slot_b: true,
    slot_c: true,
    slot_d: true,
    slot_x: true,
    mod: true,
    delay: true,
    reverb: true,
  },
  sections: [],
});

/**
 * Helix Preset Definition
 */
export const createHelixPreset = (setlist = 1, bank = 1, preset = 1) => ({
  setlist: setlist, // 1-8
  bank: bank, // 1-8 or 'A'-'H'
  preset: preset, // 1-4
  preset_name: `${setlist}${String.fromCharCode(64 + bank)}${preset}`,
  snapshot: 1, // 1-8 (optional, default snapshot to load)
  sections: [],
});

/**
 * Axe-FX Preset Definition
 */
export const createAxeFXPreset = (presetNumber = 0) => ({
  preset_number: presetNumber, // 0-511
  preset_name: `Preset ${presetNumber}`,
  bank: ['A', 'B', 'C', 'D'][Math.floor(presetNumber / 128)], // A-D
  scene: 1, // 1-8 (default scene to load)
  sections: [],
});

/**
 * Effect Pedal Preset
 */
export const createEffectPreset = (deviceType, presetNumber = 0) => ({
  device_type: deviceType, // 'strymon_timeline', 'strymon_bigsky', etc.
  preset_number: presetNumber,
  preset_name: '',
  midi_channel: 1,
  sections: [],
});

/**
 * Generate unique ID
 */
export const generateId = (prefix = 'id') => {
  return `${prefix}_${Math.random().toString(36).substr(2, 9)}_${Date.now().toString(36)}`;
};

/**
 * Transpose note by semitones
 */
export const transposeNote = (note, semitones) => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteIndex = notes.findIndex(n => note.startsWith(n));
  if (noteIndex === -1) return note;

  const newIndex = (noteIndex + semitones + 12) % 12;
  return notes[newIndex];
};

/**
 * Calculate semitone shift between keys
 */
export const calculateSemitoneShift = (fromKey, toKey) => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const fromIndex = notes.findIndex(n => fromKey.startsWith(n));
  const toIndex = notes.findIndex(n => toKey.startsWith(n));

  if (fromIndex === -1 || toIndex === -1) return 0;

  let shift = toIndex - fromIndex;
  if (shift < -6) shift += 12;
  if (shift > 6) shift -= 12;

  return shift;
};

/**
 * Section Mapping Helpers
 */

/**
 * Create section mapping entry
 * Maps a section to specific device presets
 */
export const createSectionMapping = (sectionLabel) => ({
  section: sectionLabel,
  device_overrides: {
    // role: { device_type: preset_index }
    // Example: keyboardist: { nord_stage_4: 0, modx: 1 }
  },
});

/**
 * Set section mapping for a device
 * @param {Object} song - Song preset
 * @param {string} section - Section label (e.g., "VERSE")
 * @param {string} role - Instrument role (e.g., "keyboardist")
 * @param {string} deviceType - Device type (e.g., "nord_stage_4")
 * @param {number} presetIndex - Index in the device's preset array
 */
export const setSectionMapping = (song, section, role, deviceType, presetIndex) => {
  if (!song.section_mappings) {
    song.section_mappings = {};
  }

  if (!song.section_mappings[section]) {
    song.section_mappings[section] = createSectionMapping(section);
  }

  if (!song.section_mappings[section].device_overrides[role]) {
    song.section_mappings[section].device_overrides[role] = {};
  }

  song.section_mappings[section].device_overrides[role][deviceType] = presetIndex;

  return song;
};

/**
 * Get section mapping for a device
 * Returns preset index or null if no mapping
 */
export const getSectionMapping = (song, section, role, deviceType) => {
  if (!song.section_mappings || !song.section_mappings[section]) {
    return null;
  }

  const sectionMap = song.section_mappings[section];
  if (!sectionMap.device_overrides[role]) {
    return null;
  }

  return sectionMap.device_overrides[role][deviceType] ?? null;
};

/**
 * Remove section mapping for a device
 */
export const removeSectionMapping = (song, section, role, deviceType) => {
  if (!song.section_mappings || !song.section_mappings[section]) {
    return song;
  }

  const sectionMap = song.section_mappings[section];
  if (sectionMap.device_overrides[role]) {
    delete sectionMap.device_overrides[role][deviceType];

    // Clean up empty objects
    if (Object.keys(sectionMap.device_overrides[role]).length === 0) {
      delete sectionMap.device_overrides[role];
    }
  }

  if (Object.keys(sectionMap.device_overrides).length === 0) {
    delete song.section_mappings[section];
  }

  return song;
};

/**
 * Get all mapped sections for a device
 * Returns array of section labels
 */
export const getMappedSections = (song, role, deviceType) => {
  if (!song.section_mappings) return [];

  const sections = [];
  Object.keys(song.section_mappings).forEach((section) => {
    const mapping = getSectionMapping(song, section, role, deviceType);
    if (mapping !== null) {
      sections.push(section);
    }
  });

  return sections;
};
