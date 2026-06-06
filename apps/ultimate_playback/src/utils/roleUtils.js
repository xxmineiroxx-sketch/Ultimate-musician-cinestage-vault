/**
 * Shared role utilities for Ultimate Playback
 */

export function normalizeRoleKey(role) {
  const raw = String(role || '').trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  const aliases = {
    leader: 'worship_leader',
    'worship leader': 'worship_leader',
    'music director': 'music_director',
    'vocal lead': 'lead_vocal',
    'lead vocal': 'lead_vocal',
    'lead vocals': 'lead_vocal',
    'vocal bgv': 'bgv_1',
    'bgv 1': 'bgv_1',
    'bgv 2': 'bgv_2',
    'bgv 3': 'bgv_3',
    keys: 'keyboard',
    keyboardist: 'keyboard',
    'synth/pad': 'synth',
    'electric guitar': 'electric_guitar',
    guitarist: 'electric_guitar',
    'acoustic guitar': 'acoustic_guitar',
    'acoustic guitarist': 'acoustic_guitar',
    bassist: 'bass',
    drummer: 'drums',
    vocalist: 'lead_vocal',
    sound: 'sound_tech',
    'sound tech': 'sound_tech',
    'sound technician': 'sound_tech',
    'sound engineer': 'sound_tech',
    'foh engineer': 'foh_engineer',
    'front of house': 'foh_engineer',
    'monitor engineer': 'monitor_engineer',
    'stream engineer': 'stream_engineer',
    media: 'media',
    'media tech': 'media_tech',
    'media operator': 'media',
    'slide operator': 'slides',
    'slides operator': 'slides',
    slides: 'slides',
    projection: 'projection',
    'screen operator': 'screen_operator',
    visuals: 'visual',
    graphics: 'graphics',
  };

  return aliases[lower] || lower.replace(/\s+/g, '_');
}

export function normalizeGrantRole(role) {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const aliases = {
    owner: 'org_owner',
    orgowner: 'org_owner',
    org_owner: 'org_owner',
    administrator: 'admin',
    admin: 'admin',
    manager: 'manager',
    worship_leader: 'manager',
    worshipleader: 'manager',
    music_director: 'md',
    musicdirector: 'md',
    md: 'md',
    service_planner: 'leader',
    planner: 'leader',
    leader: 'leader',
  };

  return aliases[normalized] || normalized;
}

export const ADMIN_GRANT_ROLES = new Set(['org_owner', 'admin', 'manager', 'md']);
export const LEADER_GRANT_ROLES = new Set(['leader']);
export const ELEVATED_GRANT_ROLES = new Set([
  ...ADMIN_GRANT_ROLES,
  ...LEADER_GRANT_ROLES,
]);

export function hasGrantRole(role, allowedRoles = ELEVATED_GRANT_ROLES) {
  return allowedRoles.has(normalizeGrantRole(role));
}
