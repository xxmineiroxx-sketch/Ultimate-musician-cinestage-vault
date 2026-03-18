/**
 * Ultimate Playback V2 - Data Models
 * Team Member App - Assignment-based workflow
 */

export const ROLES = {
  // Musical Roles
  MUSIC_DIRECTOR: 'music_director',
  WORSHIP_LEADER: 'worship_leader',
  LEAD_VOCAL: 'lead_vocal',
  BGV_1: 'bgv_1',
  BGV_2: 'bgv_2',
  BGV_3: 'bgv_3',
  KEYBOARD: 'keyboard',
  PIANO: 'piano',
  SYNTH: 'synth',
  ELECTRIC_GUITAR: 'electric_guitar',
  ACOUSTIC_GUITAR: 'acoustic_guitar',
  RHYTHM_GUITAR: 'rhythm_guitar',
  BASS: 'bass',
  DRUMS: 'drums',
  PERCUSSION: 'percussion',
  STRINGS: 'strings',
  BRASS: 'brass',

  // Technical Roles
  SOUND_TECH: 'sound_tech',
  FOH_ENGINEER: 'foh_engineer',
  MONITOR_ENGINEER: 'monitor_engineer',
  STREAM_ENGINEER: 'stream_engineer',
  MEDIA_TECH: 'media_tech',
  PROPRESENTER: 'propresenter',
  LIGHTING: 'lighting',
  STAGE_MANAGER: 'stage_manager',
};

export const ROLE_LABELS = {
  [ROLES.MUSIC_DIRECTOR]: 'Music Director',
  [ROLES.WORSHIP_LEADER]: 'Worship Leader',
  [ROLES.LEAD_VOCAL]: 'Lead Vocal',
  [ROLES.BGV_1]: 'Background Vocal 1',
  [ROLES.BGV_2]: 'Background Vocal 2',
  [ROLES.BGV_3]: 'Background Vocal 3',
  [ROLES.KEYBOARD]: 'Keyboard',
  [ROLES.PIANO]: 'Piano',
  [ROLES.SYNTH]: 'Synth',
  [ROLES.ELECTRIC_GUITAR]: 'Electric Guitar',
  [ROLES.ACOUSTIC_GUITAR]: 'Acoustic Guitar',
  [ROLES.RHYTHM_GUITAR]: 'Rhythm Guitar',
  [ROLES.BASS]: 'Bass',
  [ROLES.DRUMS]: 'Drums',
  [ROLES.PERCUSSION]: 'Percussion',
  [ROLES.STRINGS]: 'Strings',
  [ROLES.BRASS]: 'Brass',
  [ROLES.SOUND_TECH]: 'Sound Tech',
  [ROLES.FOH_ENGINEER]: 'FOH Engineer',
  [ROLES.MONITOR_ENGINEER]: 'Monitor Engineer',
  [ROLES.STREAM_ENGINEER]: 'Stream Engineer',
  [ROLES.MEDIA_TECH]: 'Media Tech',
  [ROLES.PROPRESENTER]: 'ProPresenter',
  [ROLES.LIGHTING]: 'Lighting',
  [ROLES.STAGE_MANAGER]: 'Stage Manager',
  sound: 'Sound Tech',
  Sound: 'Sound Tech',
  sound_tech: 'Sound Tech',
  'sound tech': 'Sound Tech',
  'Sound Tech': 'Sound Tech',
  'sound technician': 'Sound Tech',
  'sound engineer': 'Sound Tech',
};

export const PROFILE_ROLE_ALIASES = {
  leader: 'Leader',
  'worship leader': 'Leader',
  md: 'Music Director',
  'music director': 'Music Director',
  'vocal lead': 'Vocal Lead',
  'lead vocal': 'Vocal Lead',
  'lead vocals': 'Vocal Lead',
  vocalist: 'Vocal Lead',
  'back vocal': 'Vocal BGV',
  'back vocals': 'Vocal BGV',
  'background vocal': 'Vocal BGV',
  'background vocals': 'Vocal BGV',
  'vocal bgv': 'Vocal BGV',
  bgv: 'Vocal BGV',
  'bgv 1': 'Vocal BGV',
  'bgv 2': 'Vocal BGV',
  'bgv 3': 'Vocal BGV',
  drums: 'Drums',
  drummer: 'Drums',
  bass: 'Bass',
  bassist: 'Bass',
  guitar: 'Electric Guitar',
  guitarist: 'Electric Guitar',
  'electric guitar': 'Electric Guitar',
  'electric guitarist': 'Electric Guitar',
  'e guitar': 'Electric Guitar',
  'e. guitar': 'Electric Guitar',
  eguitar: 'Electric Guitar',
  acoustic: 'Acoustic Guitar',
  'acoustic guitar': 'Acoustic Guitar',
  'acoustic guitarist': 'Acoustic Guitar',
  'a guitar': 'Acoustic Guitar',
  'a. guitar': 'Acoustic Guitar',
  aguitar: 'Acoustic Guitar',
  keys: 'Keys',
  key: 'Keys',
  keyboard: 'Keys',
  keyboardist: 'Keys',
  piano: 'Keys',
  synth: 'Synth/Pad',
  pad: 'Synth/Pad',
  'synth/pad': 'Synth/Pad',
  'synth pad': 'Synth/Pad',
  track: 'Tracks',
  tracks: 'Tracks',
  sound: 'Sound Tech',
  'sound tech': 'Sound Tech',
  'sound technician': 'Sound Tech',
  'sound engineer': 'Sound Tech',
  'foh engineer': 'Sound Tech',
  'front of house': 'Sound Tech',
  'monitor engineer': 'Sound Tech',
  'stream engineer': 'Sound Tech',
  media: 'Media',
  'media tech': 'Media',
  propresenter: 'Media',
};

export function normalizeProfileRole(role) {
  const raw = String(role || '').trim();
  if (!raw) return '';

  const directMatch = Object.values(PROFILE_ROLE_ALIASES).find(
    (value) => value.toLowerCase() === raw.toLowerCase(),
  );
  if (directMatch) return directMatch;

  const normalized = raw
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return PROFILE_ROLE_ALIASES[normalized] || raw;
}

export function parseRoleAssignments(value) {
  const roles = Array.isArray(value)
    ? value
    : String(value || '').split(/[,\n;]/);
  const seen = new Set();
  const normalizedRoles = [];

  for (const role of roles) {
    const normalizedRole = normalizeProfileRole(role);
    if (!normalizedRole) continue;
    const key = normalizedRole.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedRoles.push(normalizedRole);
  }

  return normalizedRoles;
}

/**
 * User Profile (Team Member)
 */
export const createUserProfile = () => ({
  id: generateId('user'),
  phone: '',
  email: '',
  name: '',
  photo_url: null,
  roles: [], // Array of ROLES values
  blockout_dates: [], // Array of { start_date, end_date, reason }
  notification_preferences: {
    assignments: true,
    messages: true,
    reminders: true,
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

/**
 * Blockout Date
 */
export const createBlockoutDate = (startDate, endDate, reason = '') => ({
  id: generateId('blockout'),
  start_date: startDate,
  end_date: endDate,
  reason,
  created_at: new Date().toISOString(),
});

/**
 * Assignment (from Admin to Team Member)
 */
export const createAssignment = (serviceId, serviceName, serviceDate, role) => ({
  id: generateId('assignment'),
  service_id: serviceId,
  service_name: serviceName,
  service_date: serviceDate,
  role, // ROLES value
  status: 'pending', // pending, accepted, declined
  assigned_at: new Date().toISOString(),
  responded_at: null,
  response_note: '',
  setlist_id: null, // Set when accepted
  readiness: {
    stems_downloaded: false,
    parts_reviewed: false,
    ready_for_rehearsal: false,
    notes: '',
  },
});

/**
 * Service (simplified view for team members)
 */
export const createService = (name, date, type = 'regular') => ({
  id: generateId('service'),
  name,
  date,
  type, // regular, communion, special, holiday
  setlist_id: null,
  notes: '',
  assignments: [], // Array of { user_id, role, status }
  created_at: new Date().toISOString(),
});

/**
 * Setlist (role-filtered view)
 */
export const createSetlist = (serviceId) => ({
  id: generateId('setlist'),
  service_id: serviceId,
  songs: [], // Array of song IDs
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

/**
 * Song (with role-specific content)
 */
export const createSong = () => ({
  id: generateId('song'),
  title: '',
  artist: '',
  key: '',
  bpm: null,
  time_signature: '4/4',
  structure: [], // Array of { section, start_ms, end_ms }

  // Role-specific content
  role_content: {
    // Musical roles get their parts
    keyboard: {
      patches: [],
      notes: '',
      stems: [],
    },
    bass: {
      notes: '',
      technique: '',
      stems: [],
    },
    drums: {
      pattern: '',
      fills: '',
      stems: [],
    },
    vocals: {
      lyrics: '',
      harmonies: '',
      cues: '',
      stems: [],
    },
    guitar: {
      chords: '',
      tabs: '',
      tone: '',
      stems: [],
    },

    // Technical roles get their info
    foh_engineer: {
      mix_notes: '',
      eq_settings: '',
      effects: '',
    },
    monitor_engineer: {
      iem_mixes: '',
      monitor_levels: '',
    },
    lighting: {
      cues: [],
      scenes: [],
      colors: '',
    },
    media_tech: {
      lyrics: '',
      background: '',
      timing_cues: '',
    },
  },

  // Shared assets
  assets: {
    click_track: null,
    guide_track: null,
    chart_pdf: null,
  },

  created_at: new Date().toISOString(),
});

/**
 * Message
 */
export const createMessage = (fromUserId, toUserId, content, serviceId = null) => ({
  id: generateId('message'),
  from_user_id: fromUserId,
  to_user_id: toUserId, // null for group messages
  content,
  service_id: serviceId,
  read: false,
  created_at: new Date().toISOString(),
});

/**
 * Conversation
 */
export const createConversation = (participantIds, serviceId = null) => ({
  id: generateId('conversation'),
  participant_ids: participantIds,
  service_id: serviceId,
  last_message: null,
  last_message_at: null,
  created_at: new Date().toISOString(),
});

/**
 * Helper: Generate unique ID
 */
function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default {
  ROLES,
  ROLE_LABELS,
  createUserProfile,
  createBlockoutDate,
  createAssignment,
  createService,
  createSetlist,
  createSong,
  createMessage,
  createConversation,
};
