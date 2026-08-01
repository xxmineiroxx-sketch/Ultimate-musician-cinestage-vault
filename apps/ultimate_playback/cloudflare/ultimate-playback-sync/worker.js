const STORE_KEY = 'ultimate-playback-sync:v2';
const WORKER_VERSION = '2.0.5-auth-support-repair';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-org-id,x-secret-key',
};

const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function nowIso() {
  return new Date().toISOString();
}

function defaultStore() {
  return {
    users: {},
    sessions: {},
    services: [],
    plans: {},
    people: [],
    messages: [],
    grants: {},
    proposals: [],
    pendingSongs: [],
    pendingSetlists: [],
    blockouts: [],
    assignmentResponses: {},
    assignmentHistory: [],
    songLibrary: {},
  };
}

async function getStore(env = {}) {
  if (env.SYNC_STORE) {
    const stored = await env.SYNC_STORE.get(STORE_KEY, 'json');
    return { ...defaultStore(), ...(stored || {}) };
  }

  globalThis.__ultimatePlaybackSyncStore ||= defaultStore();
  return globalThis.__ultimatePlaybackSyncStore;
}

async function saveStore(env = {}, store) {
  if (env.SYNC_STORE) {
    await env.SYNC_STORE.put(STORE_KEY, JSON.stringify(store));
    return;
  }

  globalThis.__ultimatePlaybackSyncStore = store;
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || '').trim();
}

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function personRoleKeys(person = {}) {
  const values = [
    person.role,
    person.orgRole,
    person.grantedRole,
    person.roleAssignments,
    ...(Array.isArray(person.roles) ? person.roles : []),
  ];
  return values
    .flatMap((value) => String(value || '').split(/[,/|]/g))
    .map(normalizeRole)
    .filter(Boolean);
}

function monthKeyFromDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

function leadSingerAssignedForService(store, submitter = {}, serviceId = '', plan = {}) {
  const email = normalizeIdentifier(submitter.email || submitter.identifier);
  const person = findPerson(store, { email, identifier: email }) || {};
  const targetPlan = plan?.team ? plan : (store.plans?.[serviceId] || {});
  const leadRoles = new Set(['lead_singer', 'lead_vocal', 'vocal_lead']);
  return (targetPlan.team || []).some((member) => (
    leadRoles.has(normalizeRole(member.role)) &&
    (
      (email && normalizeIdentifier(member.email) === email) ||
      (person.id && member.personId === person.id)
    )
  ));
}

function canCreateSetlist(store, submitter = {}, serviceId = '', plan = {}) {
  const email = normalizeIdentifier(submitter.email || submitter.identifier);
  const grant = email ? store.grants?.[email] : null;
  const grantPermissions = Array.isArray(grant?.permissions) ? grant.permissions : [];
  const roleKeys = new Set([
    ...personRoleKeys(submitter),
    ...personRoleKeys(grant || {}),
    ...personRoleKeys(findPerson(store, { email, identifier: email }) || {}),
  ]);
  const isLeadSingerOnly = ['lead_singer', 'lead_vocal', 'vocal_lead'].some((role) => roleKeys.has(role));

  if (
    !isLeadSingerOnly &&
    (
      grant?.canCreateSetlists ||
      grantPermissions.map(normalizeRole).includes('create_setlist')
    )
  ) {
    return true;
  }

  return [
    'admin',
    'central_admin',
    'md',
    'music_director',
    'worship_leader',
    'leader',
    'setlist_creator',
    'service_planner',
  ].some((role) => roleKeys.has(role)) || leadSingerAssignedForService(store, submitter, serviceId, plan);
}

function lookupKey(identifier) {
  return normalizeIdentifier(identifier);
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(prefix = 'tok') {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${prefix}_${base64Url(bytes)}`;
}

async function stableId(prefix, value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || prefix)));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
  return `${prefix}_${hex}`;
}

async function hashPassword(password) {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = base64Url(saltBytes);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${salt}:${password}`),
  );
  return `sha256:${salt}:${base64Url(new Uint8Array(digest))}`;
}

function constantTimeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split(':');
  const [scheme] = parts;
  if (scheme !== 'sha256') return false;
  const [, salt, expected] = parts;
  if (!salt || !expected) return false;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${salt}:${password}`),
  );
  const actual = base64Url(new Uint8Array(digest));
  return constantTimeEqual(actual, expected);
}

function userPublicPayload(user) {
  return {
    id: user.id,
    identifier: user.identifier,
    email: user.email || '',
    phone: user.phone || '',
    name: user.name || user.email || user.phone || user.identifier,
  };
}

function profilePayload(user, profile = {}) {
  return {
    id: profile.id || user.personId,
    name: profile.name || user.name || '',
    email: profile.email || user.email || '',
    phone: profile.phone || user.phone || '',
    playbackRegistered: true,
    playbackRegisteredAt: profile.playbackRegisteredAt || user.createdAt,
    roleAssignments: profile.roleAssignments || '',
    roles: Array.isArray(profile.roles) ? profile.roles : [],
  };
}

function authResponse(user, token, profile) {
  return {
    ok: true,
    token,
    identifier: user.identifier,
    email: user.email || '',
    phone: user.phone || '',
    name: user.name || user.email || user.phone || user.identifier,
    role: user.role || null,
    grantedRole: user.grantedRole || null,
    orgRole: user.orgRole || null,
    orgName: user.orgName || 'Ultimate Musician',
    roleAssignments: profile?.roleAssignments || '',
    user: userPublicPayload(user),
    profile: profilePayload(user, profile),
  };
}

function supportAuthorized(request, env = {}) {
  const expected = String(env.SUPPORT_REPAIR_KEY || '').trim();
  const actual = String(request.headers.get('x-support-key') || '').trim();
  return Boolean(expected && actual && constantTimeEqual(actual, expected));
}

function findPerson(store, { id = '', email = '', phone = '', identifier = '' } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedEmail = normalizeIdentifier(email || identifier);
  const normalizedPhone = normalizePhone(phone);

  return (store.people || []).find((person) => {
    const personId = String(person?.id || '').trim();
    const personEmail = normalizeIdentifier(person?.email);
    const personPhone = normalizePhone(person?.phone);
    return (
      (normalizedId && personId === normalizedId) ||
      (normalizedEmail && personEmail === normalizedEmail) ||
      (normalizedPhone && personPhone === normalizedPhone)
    );
  }) || null;
}

function upsertPerson(store, profile) {
  const person = { ...profile };
  const idx = (store.people || []).findIndex((candidate) => (
    (person.id && candidate.id === person.id) ||
    (person.email && normalizeIdentifier(candidate.email) === normalizeIdentifier(person.email)) ||
    (person.phone && normalizePhone(candidate.phone) === normalizePhone(person.phone))
  ));

  if (idx >= 0) store.people[idx] = { ...store.people[idx], ...person };
  else store.people.push(person);
}

function upsertService(store, service = {}) {
  if (!service?.id) return;
  const idx = (store.services || []).findIndex((existing) => existing.id === service.id);
  if (idx >= 0) store.services[idx] = { ...store.services[idx], ...service };
  else store.services.push(service);
}

function normalizeTeamMemberForHistory(member = {}, people = []) {
  const personId = String(member.personId || member.id || '').trim();
  const person = people.find((candidate) => candidate.id === personId) || {};
  return {
    personId,
    email: normalizeIdentifier(member.email || person.email),
    name: String(member.name || person.name || '').trim(),
    role: String(member.role || '').trim(),
  };
}

function recordAssignmentHistory(store, {
  serviceId = '',
  serviceName = '',
  serviceDate = '',
  approvedBy = null,
  source = 'publish',
  team = [],
} = {}) {
  const id = String(serviceId || '').trim();
  if (!id || !Array.isArray(team)) return [];

  store.assignmentHistory ||= [];
  const recordedAt = nowIso();
  const month = monthKeyFromDate(serviceDate);
  const entries = team
    .map((member) => normalizeTeamMemberForHistory(member, store.people || []))
    .filter((member) => member.personId || member.email || member.name)
    .map((member) => ({
      id: `${id}_${member.personId || member.email || member.name}_${normalizeRole(member.role || 'member')}`,
      serviceId: id,
      serviceName,
      serviceDate,
      month,
      personId: member.personId,
      email: member.email,
      name: member.name,
      role: member.role,
      source,
      approvedBy,
      recordedAt,
    }));

  for (const entry of entries) {
    const idx = store.assignmentHistory.findIndex((existing) => existing.id === entry.id);
    if (idx >= 0) store.assignmentHistory[idx] = { ...store.assignmentHistory[idx], ...entry };
    else store.assignmentHistory.push(entry);
  }

  return entries;
}

function assignmentStatsFor(store, { month = '', personId = '', email = '' } = {}) {
  const targetMonth = month || monthKeyFromDate();
  const targetPersonId = String(personId || '').trim();
  const targetEmail = normalizeIdentifier(email);
  const entries = (store.assignmentHistory || []).filter((entry) => {
    if (targetMonth && entry.month !== targetMonth) return false;
    if (targetPersonId && entry.personId !== targetPersonId) return false;
    if (targetEmail && normalizeIdentifier(entry.email) !== targetEmail) return false;
    return true;
  });

  const byPerson = {};
  for (const entry of entries) {
    const key = entry.personId || entry.email || entry.name || 'unknown';
    byPerson[key] ||= {
      personId: entry.personId,
      email: entry.email,
      name: entry.name,
      month: targetMonth,
      total: 0,
      byRole: {},
      services: [],
    };
    byPerson[key].total += 1;
    const role = entry.role || 'Member';
    byPerson[key].byRole[role] = (byPerson[key].byRole[role] || 0) + 1;
    byPerson[key].services.push({
      serviceId: entry.serviceId,
      serviceName: entry.serviceName,
      serviceDate: entry.serviceDate,
      role,
    });
  }

  return { month: targetMonth, entries, byPerson };
}

function teamMessageRecipients(team = []) {
  return [...new Set((Array.isArray(team) ? team : [])
    .map((member) => normalizeIdentifier(member.email))
    .filter(Boolean))];
}

function addSystemMessage(store, {
  from_email = 'system@ultimate-musician.local',
  from_name = 'Ultimate Musician',
  subject = '(no subject)',
  message = '',
  to = 'admin',
  recipients = [],
  metadata = {},
} = {}) {
  store.messages ||= [];
  const entry = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from_email: normalizeIdentifier(from_email),
    from_name: String(from_name || 'Ultimate Musician').trim(),
    subject: String(subject || '(no subject)').trim(),
    message: String(message || '').trim(),
    to,
    recipients: teamMessageRecipients(recipients.map((email) => ({ email }))),
    metadata,
    timestamp: nowIso(),
    read: false,
    replies: [],
  };
  store.messages.unshift(entry);
  return entry;
}

async function createSession(store, user, deviceId = '') {
  const token = randomToken('ups');
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
  store.sessions[token] = {
    userId: user.id,
    identifier: user.identifier,
    deviceId: String(deviceId || ''),
    createdAt: nowIso(),
    expiresAt,
  };
  return token;
}

function tokenFromRequest(request, body = {}) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  return String(body.token || bearer || '').trim();
}

async function handleLogout(request, env, store) {
  const body = await readJson(request);
  const token = tokenFromRequest(request, body);
  if (token && store.sessions?.[token]) {
    delete store.sessions[token];
    await saveStore(env, store);
  }
  return json({ ok: true });
}

async function handleRegister(request, env, store) {
  const body = await readJson(request);
  const identifier = normalizeIdentifier(body.identifier || body.email || body.phone);
  const password = String(body.password || '');
  const name = String(body.name || identifier || 'Playback User').trim();

  if (!identifier) return json({ ok: false, error: 'Email or phone is required.' }, 400);
  if (password.length < 6) {
    return json({ ok: false, error: 'Password must be at least 6 characters.' }, 400);
  }

  const key = lookupKey(identifier);
  if (store.users[key]) {
    return json({ ok: false, error: 'Account already exists. Please sign in.' }, 409);
  }

  const email = identifier.includes('@') ? identifier : '';
  const phone = email ? normalizePhone(body.phone) : normalizePhone(body.phone || body.identifier);
  const createdAt = nowIso();
  const user = {
    id: await stableId('auth', identifier),
    personId: await stableId('person', identifier),
    identifier,
    email,
    phone,
    name,
    passwordHash: await hashPassword(password),
    role: null,
    grantedRole: null,
    orgRole: null,
    orgName: 'Ultimate Musician',
    createdAt,
    updatedAt: createdAt,
  };

  const profile = profilePayload(user, {
    id: user.personId,
    name,
    email,
    phone,
    playbackRegisteredAt: createdAt,
  });

  store.users[key] = user;
  upsertPerson(store, profile);
  const token = await createSession(store, user, body.deviceId);
  await saveStore(env, store);

  return json(authResponse(user, token, profile));
}

async function handleLogin(request, env, store) {
  const body = await readJson(request);
  const identifier = normalizeIdentifier(body.identifier || body.email || body.phone);
  const password = String(body.password || '');

  if (!identifier || !password) {
    return json({ ok: false, error: 'Email or phone, plus password, are required.' }, 400);
  }

  let user = store.users[lookupKey(identifier)];
  if (!user) {
    const existingPerson = findPerson(store, {
      email: identifier.includes('@') ? identifier : '',
      phone: identifier.includes('@') ? '' : identifier,
      identifier,
    });
    if (!existingPerson) {
      return json({ ok: false, error: 'Invalid email/phone or password.' }, 401);
    }

    const createdAt = nowIso();
    const email = identifier.includes('@') ? identifier : normalizeIdentifier(existingPerson.email);
    const phone = email ? normalizePhone(existingPerson.phone) : normalizePhone(identifier);
    user = {
      id: await stableId('auth', identifier),
      personId: existingPerson.id || await stableId('person', identifier),
      identifier,
      email,
      phone,
      name: existingPerson.name || email || phone || identifier,
      passwordHash: await hashPassword(password),
      passwordMigratedAt: createdAt,
      role: null,
      grantedRole: null,
      orgRole: null,
      orgName: 'Ultimate Musician',
      createdAt,
      updatedAt: createdAt,
    };
    store.users[lookupKey(identifier)] = user;
  }

  if (!user.passwordHash) {
    user.passwordHash = await hashPassword(password);
    user.passwordMigratedAt = nowIso();
  } else if (!(await verifyPassword(password, user.passwordHash))) {
    return json({ ok: false, error: 'Invalid email/phone or password.' }, 401);
  }

  user.lastLoginAt = nowIso();
  user.updatedAt = user.lastLoginAt;
  const profile = findPerson(store, {
    id: user.personId,
    email: user.email,
    phone: user.phone,
    identifier,
  }) || profilePayload(user);
  const token = await createSession(store, user, body.deviceId);
  await saveStore(env, store);

  return json(authResponse(user, token, profile));
}

async function handleForgotPassword(request, env, store) {
  const body = await readJson(request);
  const identifier = normalizeIdentifier(body.identifier || body.email || body.phone);
  const user = store.users[lookupKey(identifier)];
  let resetCode = '';

  if (user) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    resetCode = code;
    user.reset = {
      code,
      expiresAt: Date.now() + 15 * 60 * 1000,
      createdAt: nowIso(),
    };
    await saveStore(env, store);
  }

  return json({
    ok: true,
    sent: Boolean(user),
    resetCode,
    betaRecovery: Boolean(resetCode),
  });
}

async function handleResetPassword(request, env, store) {
  const body = await readJson(request);
  const identifier = normalizeIdentifier(body.identifier || body.email || body.phone);
  const code = String(body.code || '').trim();
  const newPassword = String(body.newPassword || body.password || '');
  const user = store.users[lookupKey(identifier)];

  if (!user || !user.reset || user.reset.code !== code || user.reset.expiresAt < Date.now()) {
    return json({ ok: false, error: 'Invalid or expired reset code.' }, 401);
  }

  if (newPassword.length < 6) {
    return json({ ok: false, error: 'Password must be at least 6 characters.' }, 400);
  }

  user.passwordHash = await hashPassword(newPassword);
  user.reset = null;
  user.updatedAt = nowIso();
  await saveStore(env, store);
  return json({ ok: true });
}

async function handleChangePassword(request, env, store) {
  const body = await readJson(request);
  const identifier = normalizeIdentifier(body.identifier || body.email || body.phone);
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  const user = store.users[lookupKey(identifier)];

  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return json({ ok: false, error: 'Current password is incorrect.' }, 401);
  }

  if (newPassword.length < 6) {
    return json({ ok: false, error: 'Password must be at least 6 characters.' }, 400);
  }

  user.passwordHash = await hashPassword(newPassword);
  user.updatedAt = nowIso();
  await saveStore(env, store);
  return json({ ok: true });
}

async function handleSupportAuthLookup(request, env, store) {
  if (!supportAuthorized(request, env)) return json({ ok: false, error: 'forbidden' }, 403);

  const body = await readJson(request);
  const identifier = normalizeIdentifier(body.identifier || body.email || body.phone);
  if (!identifier) return json({ ok: false, error: 'identifier is required' }, 400);

  const user = store.users?.[lookupKey(identifier)] || null;
  const person = findPerson(store, {
    email: identifier.includes('@') ? identifier : '',
    phone: identifier.includes('@') ? '' : identifier,
    identifier,
  });

  return json({
    ok: true,
    identifier,
    userExists: Boolean(user),
    personExists: Boolean(person),
    hasPasswordHash: Boolean(user?.passwordHash),
    hasReset: Boolean(user?.reset),
    email: user?.email || person?.email || '',
    phone: user?.phone || person?.phone || '',
    personId: user?.personId || person?.id || '',
    updatedAt: user?.updatedAt || '',
    lastLoginAt: user?.lastLoginAt || '',
  });
}

async function handleSupportAuthRepair(request, env, store) {
  if (!supportAuthorized(request, env)) return json({ ok: false, error: 'forbidden' }, 403);

  const body = await readJson(request);
  const identifier = normalizeIdentifier(body.identifier || body.email || body.phone);
  if (!identifier) return json({ ok: false, error: 'identifier is required' }, 400);

  let user = store.users?.[lookupKey(identifier)] || null;
  const person = findPerson(store, {
    email: identifier.includes('@') ? identifier : '',
    phone: identifier.includes('@') ? '' : identifier,
    identifier,
  });
  if (!user && !person) {
    return json({ ok: false, error: 'No auth user or team profile found for that identifier.' }, 404);
  }

  const tempPassword = `UP-${randomToken('tmp').slice(4, 14)}!7`;
  const now = nowIso();
  if (!user) {
    const email = identifier.includes('@') ? identifier : normalizeIdentifier(person.email);
    const phone = email ? normalizePhone(person.phone) : normalizePhone(identifier);
    user = {
      id: await stableId('auth', identifier),
      personId: person.id || await stableId('person', identifier),
      identifier,
      email,
      phone,
      name: person.name || email || phone || identifier,
      role: null,
      grantedRole: null,
      orgRole: null,
      orgName: 'Ultimate Musician',
      createdAt: now,
    };
    store.users[lookupKey(identifier)] = user;
  }

  user.passwordHash = await hashPassword(tempPassword);
  user.reset = null;
  user.repairedAt = now;
  user.updatedAt = now;
  await saveStore(env, store);

  return json({
    ok: true,
    identifier,
    tempPassword,
    userExists: true,
    personExists: Boolean(person),
  });
}

function serviceMapFromStore(store) {
  const map = {};
  for (const service of store.services || []) map[service.id] = service;
  for (const planId of Object.keys(store.plans || {})) {
    if (!map[planId]) map[planId] = { id: planId, name: 'Service', date: '', time: '' };
  }
  return map;
}

function assignmentsFor(store, email) {
  const person = findPerson(store, { email, identifier: email });
  if (!person) return [];

  const assignments = [];
  const services = serviceMapFromStore(store);
  for (const service of Object.values(services)) {
    const plan = store.plans?.[service.id] || {};
    const matches = (plan.team || []).filter((member) => member.personId === person.id);
    if (matches.length === 0) continue;

    assignments.push({
      id: `${service.id}_${person.id}`,
      service_id: service.id,
      service_name: service.name || service.title || 'Service',
      service_date: service.date || '',
      service_time: service.time || '',
      service_type: service.serviceType || 'standard',
      role: matches[0].role,
      roles: matches.map((member) => member.role),
      notes: plan.notes || '',
      status: 'pending',
      readiness: {
        stems_downloaded: false,
        parts_reviewed: false,
        ready_for_rehearsal: false,
      },
    });
  }
  return assignments;
}

function setlistFor(store, serviceId) {
  const plan = store.plans?.[serviceId] || { songs: [] };
  return (plan.songs || []).map((song, index) => ({
    id: song.id || `song_${index}`,
    order: index + 1,
    title: song.title || song.songTitle || 'Unknown',
    artist: song.artist || '',
    key: song.key || song.originalKey || '',
    tempo: song.tempo || song.bpm || '',
    duration: song.duration || '',
    lyrics: song.lyrics || '',
    chordChart: song.chordChart || song.chordSheet || '',
    audioUrl: song.audioUrl || song.mediaUrl || song.referenceUrl || '',
    mediaUrl: song.mediaUrl || song.audioUrl || song.youtubeUrl || '',
    stemsUrl: song.stemsUrl || '',
    assets: song.assets || {},
    waveformPeaks: song.waveformPeaks || null,
    cueMarkers: song.cueMarkers || song.markers || [],
    roleCues: song.roleCues || {},
    instrumentNotes: song.instrumentNotes || {},
    notes: song.notes || song.hint || '',
    hasLyrics: Boolean(song.lyrics),
    hasChordChart: Boolean(song.chordChart || song.chordSheet),
  }));
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const next = String(value || '').trim();
    if (next) return next;
  }
  return '';
}

function getSongPatchIds(body = {}) {
  return {
    rawSongId: pickFirstNonEmpty(body.id, body.songId),
    planItemId: pickFirstNonEmpty(body.planItemId, body.serviceItemId),
    librarySongId: pickFirstNonEmpty(body.librarySongId, body.songLibraryId),
  };
}

function findPlanSongForSync(planSongs = [], ids = {}) {
  const { rawSongId = '', planItemId = '', librarySongId = '' } = ids;
  if (!Array.isArray(planSongs) || planSongs.length === 0) return null;
  return planSongs.find((song) => {
    const songId = String(song?.id || '').trim();
    const linkedLibraryId = String(song?.songId || '').trim();
    return (
      (planItemId && songId === planItemId) ||
      (librarySongId && linkedLibraryId === librarySongId) ||
      (rawSongId && (songId === rawSongId || linkedLibraryId === rawSongId))
    );
  }) || null;
}

function buildLibrarySongSeed(id, { title = '', artist = '', planSong = null } = {}) {
  return {
    id,
    title: title || planSong?.title || '',
    artist: artist || planSong?.artist || '',
    key: planSong?.key || '',
    bpm: planSong?.bpm || planSong?.tempo || 0,
    lyrics: planSong?.lyrics || '',
    chordChart: planSong?.chordChart || planSong?.chordSheet || '',
    chordSheet: planSong?.chordSheet || planSong?.chordChart || '',
    instrumentNotes: { ...(planSong?.instrumentNotes || {}) },
    updatedAt: nowIso(),
  };
}

function applyChartToSong(song, { field, value, instrument, keyboardRigs = [], isPrivileged = false } = {}) {
  if (!song) return;
  const noteKey = instrument === 'Synth/Pad' ? 'Keys' : instrument;
  const content = String(value || '');
  if (field === 'instrumentNotes' && noteKey) {
    song.instrumentNotes ||= {};
    song.instrumentNotes[noteKey] = content;
    if (Array.isArray(keyboardRigs) && keyboardRigs.length) {
      const existing = Array.isArray(song.keyboardRigs) ? song.keyboardRigs : [];
      song.keyboardRigs = [...new Set([...existing, ...keyboardRigs])];
    }
    if (isPrivileged || !song.chordChart) {
      song.chordChart = content;
      song.chordSheet = content;
    }
  } else if (field === 'lyrics') {
    song.lyrics = content;
    song.hasLyrics = Boolean(content.trim());
  } else {
    song.chordChart = content;
    song.chordSheet = content;
  }
  song.updatedAt = nowIso();
}

function normalizePendingSong(body = {}) {
  return {
    id: body.id || `song_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: String(body.title || body.songTitle || '').trim(),
    artist: String(body.artist || body.songArtist || '').trim(),
    key: String(body.key || '').trim(),
    bpm: Number(body.bpm || 0) || 0,
    notes: String(body.notes || '').trim(),
    from_email: normalizeIdentifier(body.from_email || body.email),
    from_name: String(body.from_name || body.name || 'Team Member').trim(),
    status: 'pending_approval',
    createdAt: nowIso(),
  };
}

function songFromPendingSong(song = {}) {
  return {
    id: song.librarySongId || `song_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: song.title || 'Untitled Song',
    artist: song.artist || '',
    key: song.key || '',
    bpm: song.bpm || 0,
    notes: song.notes || '',
    lyrics: '',
    chordChart: '',
    chordSheet: '',
    instrumentNotes: {},
    source: 'team_suggestion',
    suggestedBy: {
      email: song.from_email || '',
      name: song.from_name || '',
    },
    approvedAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function librarySongsFor(store, setlist = []) {
  const library = store.songLibrary || {};
  const allSongs = Array.isArray(library) ? library : Object.values(library);
  if (!Array.isArray(allSongs) || allSongs.length === 0) return [];

  const wanted = new Set(
    setlist
      .flatMap((song) => [
        song?.id,
        song?.songId,
        song?.librarySongId,
        song?.title,
      ])
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase()),
  );

  return allSongs.filter((song) => (
    wanted.has(String(song?.id || '').trim().toLowerCase()) ||
    wanted.has(String(song?.songId || '').trim().toLowerCase()) ||
    wanted.has(String(song?.librarySongId || '').trim().toLowerCase()) ||
    wanted.has(String(song?.title || '').trim().toLowerCase())
  ));
}

function buildServicePreflight({ assignmentGroup = [], setlist = [], librarySongs = [] } = {}) {
  const roles = [...new Set(assignmentGroup.map((item) => item?.role).filter(Boolean))];
  const missingCharts = setlist.filter((song) => !song?.chordChart && !song?.lyrics).length;
  const songsWithAudio = setlist.filter((song) => (
    song?.audioUrl ||
    song?.mediaUrl ||
    song?.stemsUrl ||
    song?.assets?.full_mix ||
    song?.assets?.fullSong ||
    song?.assets?.stems ||
    librarySongs.some((candidate) => (
      String(candidate?.id || candidate?.songId || candidate?.librarySongId || '').trim().toLowerCase() ===
      String(song?.id || song?.songId || song?.librarySongId || '').trim().toLowerCase()
    ))
  )).length;

  return {
    songCount: setlist.length,
    roleCount: roles.length,
    roles,
    missingCharts,
    songsWithAudio,
    hasSetlist: setlist.length > 0,
    hasAssignments: assignmentGroup.length > 0,
    assetsReady: setlist.length > 0 && songsWithAudio >= setlist.length,
    chartsReady: setlist.length > 0 && missingCharts === 0,
    ready:
      setlist.length > 0 &&
      missingCharts === 0 &&
      assignmentGroup.some((item) => item?.status === 'accepted'),
    checkedAt: nowIso(),
  };
}

function serviceBundleFor(store, { serviceId = '', email = '' } = {}) {
  const id = String(serviceId || '').trim();
  if (!id) return null;

  const services = serviceMapFromStore(store);
  const service = services[id] || null;
  const plan = store.plans?.[id] || {};
  const allAssignments = email ? assignmentsFor(store, email) : [];
  const assignmentGroup = allAssignments.filter((assignment) => assignment.service_id === id);
  const setlist = setlistFor(store, id);
  const librarySongs = librarySongsFor(store, setlist);
  const vocalAssignments =
    plan.vocalAssignments ||
    plan.vocals ||
    store.vocalAssignments?.[id] ||
    {};
  const people = store.people || [];
  const messages = email
    ? (store.messages || []).filter((message) => (
      normalizeIdentifier(message.from_email) === normalizeIdentifier(email) ||
      message.to === 'all_team'
    ))
    : [];

  return {
    ok: true,
    version: 'service-bundle-v1',
    serviceId: id,
    service,
    plan: {
      id,
      notes: plan.notes || '',
      title: plan.title || service?.name || service?.title || 'Service',
      updatedAt: plan.updatedAt || plan.modifiedAt || '',
    },
    assignmentGroup,
    setlist,
    librarySongs,
    vocalAssignments,
    people,
    messages,
    preflight: buildServicePreflight({ assignmentGroup, setlist, librarySongs }),
    generatedAt: nowIso(),
  };
}

async function handlePublish(request, env, store) {
  const body = await readJson(request);
  const serviceId = String(body.serviceId || body.service?.id || '').trim();

  if (body.service?.id) upsertService(store, body.service);

  for (const service of body.services || []) {
    upsertService(store, service);
  }

  for (const person of body.people || []) upsertPerson(store, person);
  if (serviceId && body.plan) {
    store.plans[serviceId] = {
      ...(store.plans?.[serviceId] || {}),
      ...body.plan,
      status: body.plan.status || 'published',
      publishedAt: nowIso(),
    };
  }
  if (body.plans) store.plans = { ...store.plans, ...body.plans };

  const planForHistory = serviceId ? store.plans?.[serviceId] : null;
  const serviceForHistory = serviceId
    ? serviceMapFromStore(store)[serviceId]
    : null;
  if (serviceId && planForHistory?.team?.length) {
    recordAssignmentHistory(store, {
      serviceId,
      serviceName: serviceForHistory?.name || serviceForHistory?.title || body.service?.name || 'Service',
      serviceDate: serviceForHistory?.date || body.service?.date || '',
      approvedBy: body.approvedBy || body.publishedBy || null,
      source: body.source || 'direct_publish',
      team: planForHistory.team,
    });
  }

  await saveStore(env, store);
  return json({ ok: true, services: store.services.length, people: store.people.length });
}

async function handleSubmitSetlist(request, env, store) {
  const body = await readJson(request);
  const serviceId = String(body.serviceId || body.service?.id || '').trim();
  const plan = body.plan || {};
  const songs = Array.isArray(plan.songs) ? plan.songs : [];
  const submitter = body.submittedBy || body.submitter || {};

  if (!serviceId) return json({ ok: false, error: 'serviceId is required' }, 400);
  if (songs.length === 0) return json({ ok: false, error: 'setlist must include at least one song' }, 400);
  if (!canCreateSetlist(store, submitter, serviceId, plan)) {
    return json({
      ok: false,
      error: 'submitter is not allowed to create setlists',
      requiredPermission: 'create_setlist',
    }, 403);
  }

  store.pendingSetlists ||= [];
  const existingIdx = store.pendingSetlists.findIndex((entry) => (
    entry.serviceId === serviceId && entry.status === 'pending'
  ));
  const entry = {
    id: existingIdx >= 0
      ? store.pendingSetlists[existingIdx].id
      : `setlist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    serviceId,
    serviceName: String(body.serviceName || body.service?.name || body.service?.title || 'Service').trim(),
    serviceDate: String(body.serviceDate || body.service?.date || '').trim(),
    serviceTime: String(body.serviceTime || body.service?.time || '').trim(),
    plan: {
      ...plan,
      status: 'pending_approval',
      submittedAt: nowIso(),
    },
    submittedBy: {
      email: normalizeIdentifier(submitter.email),
      name: String(submitter.name || submitter.email || 'Lead Singer').trim(),
    },
    songCount: songs.length,
    teamCount: Array.isArray(plan.team) ? plan.team.length : 0,
    status: 'pending',
    submittedAt: nowIso(),
  };

  if (body.people) {
    for (const person of body.people || []) upsertPerson(store, person);
  }

  if (existingIdx >= 0) store.pendingSetlists[existingIdx] = entry;
  else store.pendingSetlists.unshift(entry);

  const songTitles = songs.map((song) => song?.title || song).filter(Boolean).join(', ');
  addSystemMessage(store, {
    from_email: entry.submittedBy.email,
    from_name: entry.submittedBy.name || 'Lead Singer',
    subject: `Setlist ready for approval: ${entry.serviceName}`,
    message: [
      `${entry.submittedBy.name || 'Lead Singer'} submitted a setlist for ${entry.serviceName}.`,
      `Songs: ${songTitles || songs.length}`,
      `Assigned team members: ${entry.teamCount}`,
      'Inspect it in the Admin Panel before it is sent to the team.',
    ].join('\n'),
    to: 'admin',
    metadata: {
      type: 'setlist_submitted',
      setlistId: entry.id,
      serviceId,
      serviceName: entry.serviceName,
      status: 'pending',
    },
  });

  await saveStore(env, store);
  return json({ ok: true, id: entry.id, entry });
}

async function handleApproveSetlist(request, env, store, url) {
  const id = String(url.searchParams.get('id') || '').trim();
  const body = await readJson(request);
  store.pendingSetlists ||= [];
  const entry = store.pendingSetlists.find((item) => item.id === id);
  if (!entry) return json({ ok: false, error: 'setlist submission not found' }, 404);

  const service = {
    id: entry.serviceId,
    name: entry.serviceName,
    title: entry.serviceName,
    date: entry.serviceDate,
    time: entry.serviceTime,
    serviceType: body.serviceType || 'standard',
    status: 'published',
    approvedAt: nowIso(),
  };
  upsertService(store, service);

  const approvedPlan = {
    ...(entry.plan || {}),
    status: 'published',
    approvedAt: nowIso(),
    approvedBy: body.approvedBy || null,
  };
  store.plans[entry.serviceId] = approvedPlan;

  entry.status = 'approved';
  entry.approvedAt = nowIso();
  entry.approvedBy = body.approvedBy || null;

  const recordedAssignments = recordAssignmentHistory(store, {
    serviceId: entry.serviceId,
    serviceName: entry.serviceName,
    serviceDate: entry.serviceDate,
    approvedBy: body.approvedBy || null,
    source: 'setlist_approval',
    team: approvedPlan.team || [],
  });

  const recipients = teamMessageRecipients(approvedPlan.team || []);
  addSystemMessage(store, {
    subject: `Approved setlist: ${entry.serviceName}`,
    message: [
      `${entry.serviceName} has been approved and published.`,
      'Open your Assignments to see your songs, role, charts, and vocal parts.',
    ].join('\n'),
    to: 'assigned_team',
    recipients,
    metadata: {
      type: 'setlist_approved',
      setlistId: entry.id,
      serviceId: entry.serviceId,
      serviceName: entry.serviceName,
      recipientCount: recipients.length,
    },
  });

  await saveStore(env, store);
  return json({
    ok: true,
    serviceId: entry.serviceId,
    published: true,
    assignedMembers: recordedAssignments.length,
  });
}

async function handleRejectSetlist(request, env, store, url) {
  const id = String(url.searchParams.get('id') || '').trim();
  const body = await readJson(request);
  store.pendingSetlists ||= [];
  const entry = store.pendingSetlists.find((item) => item.id === id);
  if (!entry) return json({ ok: false, error: 'setlist submission not found' }, 404);

  entry.status = 'rejected';
  entry.rejectedAt = nowIso();
  entry.reviewNote = String(body.note || body.reason || '').trim();
  entry.rejectedBy = body.rejectedBy || null;

  await saveStore(env, store);
  return json({ ok: true });
}

async function handlePost(request, env, store, path, url) {
  if (path === '/sync/auth/register') return handleRegister(request, env, store);
  if (path === '/sync/auth/login') return handleLogin(request, env, store);
  if (path === '/sync/auth/logout') return handleLogout(request, env, store);
  if (path === '/sync/auth/forgot-password' || path === '/sync/auth/resend') {
    return handleForgotPassword(request, env, store);
  }
  if (path === '/sync/auth/reset-password') return handleResetPassword(request, env, store);
  if (path === '/sync/auth/change-password') return handleChangePassword(request, env, store);
  if (path === '/sync/auth/verify') return json({ ok: true });
  if (path === '/sync/auth/apple') {
    return json({ ok: false, error: 'Apple Sign In is not enabled on this sync Worker.' }, 501);
  }
  if (path === '/sync/support/auth-lookup') return handleSupportAuthLookup(request, env, store);
  if (path === '/sync/support/auth-repair') return handleSupportAuthRepair(request, env, store);
  if (path.startsWith('/sync/auth/')) {
    return json({ ok: false, error: 'Auth route not found.' }, 404);
  }

  if (path === '/sync/publish') return handlePublish(request, env, store);
  if (path === '/sync/setlist/submit') return handleSubmitSetlist(request, env, store);
  if (path === '/sync/setlist/approve') return handleApproveSetlist(request, env, store, url);
  if (path === '/sync/setlist/reject') return handleRejectSetlist(request, env, store, url);
  if (path === '/sync/grant' || path === '/sync/setlist/creator') {
    const body = await readJson(request);
    const email = normalizeIdentifier(body.email);
    if (!email) return json({ ok: false, error: 'email is required' }, 400);
    store.grants ||= {};
    const existing = store.grants[email] || {};
    const hasRole = Object.prototype.hasOwnProperty.call(body, 'role');
    const nextRole = hasRole ? body.role : (existing.role || 'lead_singer');
    const hasCreateSetlistFlag = Object.prototype.hasOwnProperty.call(body, 'canCreateSetlists');
    const canCreateSetlists = hasCreateSetlistFlag
      ? body.canCreateSetlists === true
      : ['lead_singer', 'lead_vocal', 'vocal_lead', 'setlist_creator'].includes(normalizeRole(nextRole)) || path === '/sync/setlist/creator';
    const permissions = new Set(
      Array.isArray(existing.permissions) ? existing.permissions : [],
    );
    if (canCreateSetlists) permissions.add('create_setlist');
    else permissions.delete('create_setlist');
    store.grants[email] = {
      ...existing,
      name: String(body.name || existing.name || email).trim(),
      role: nextRole,
      canCreateSetlists,
      permissions: [...permissions],
      grantedAt: existing.grantedAt || nowIso(),
      updatedAt: nowIso(),
    };
    await saveStore(env, store);
    return json({ ok: true, grant: { email, ...store.grants[email] } });
  }

  if (path === '/sync/song/patch') {
    const body = await readJson(request);
    const serviceId = String(body.serviceId || '').trim();
    const field = String(body.field || '').trim();
    if (!field) return json({ ok: false, error: 'field is required' }, 400);
    const plan = serviceId ? store.plans?.[serviceId] : null;
    const ids = getSongPatchIds(body);
    const planSong = findPlanSongForSync(plan?.songs || [], ids);
    const resolvedLibrarySongId = pickFirstNonEmpty(
      planSong?.songId,
      ids.librarySongId,
      ids.rawSongId,
    );
    if (!resolvedLibrarySongId && !planSong) {
      return json({ ok: false, error: 'songId or librarySongId is required' }, 400);
    }

    store.songLibrary ||= {};
    const librarySong = resolvedLibrarySongId
      ? (store.songLibrary[resolvedLibrarySongId] || (
        store.songLibrary[resolvedLibrarySongId] = buildLibrarySongSeed(resolvedLibrarySongId, {
          title: body.songTitle || '',
          artist: body.songArtist || '',
          planSong,
        })
      ))
      : null;
    if (planSong && resolvedLibrarySongId && !planSong.songId) planSong.songId = resolvedLibrarySongId;
    const senderRole = normalizeRole(body.senderRole || '');
    const isPrivileged = !senderRole || ['admin', 'md', 'music_director', 'org_owner', 'worship_leader'].includes(senderRole);
    const patch = {
      field,
      value: body.value,
      instrument: body.instrument || '',
      keyboardRigs: Array.isArray(body.keyboardRigs) ? body.keyboardRigs : [],
      isPrivileged,
    };
    applyChartToSong(planSong, patch);
    applyChartToSong(librarySong, patch);
    await saveStore(env, store);
    return json({
      ok: true,
      songId: resolvedLibrarySongId,
      planItemId: planSong?.id || ids.planItemId || '',
    });
  }

  if (path === '/sync/proposal') {
    const body = await readJson(request);
    const ids = getSongPatchIds(body);
    const proposal = {
      id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      songId: pickFirstNonEmpty(ids.librarySongId, ids.rawSongId),
      librarySongId: pickFirstNonEmpty(ids.librarySongId, ids.rawSongId),
      planItemId: ids.planItemId,
      serviceId: String(body.serviceId || '').trim(),
      type: body.type === 'chord_chart' ? 'chord_chart' : 'lyrics',
      instrument: String(body.instrument || '').trim(),
      content: String(body.content || '').trim(),
      keyboardRigs: Array.isArray(body.keyboardRigs) ? body.keyboardRigs : [],
      from_email: normalizeIdentifier(body.from_email),
      from_name: String(body.from_name || 'Team Member').trim(),
      songTitle: String(body.songTitle || '').trim(),
      songArtist: String(body.songArtist || '').trim(),
      status: 'pending',
      createdAt: nowIso(),
    };
    store.proposals ||= [];
    store.proposals.unshift(proposal);
    addSystemMessage(store, {
      from_email: proposal.from_email,
      from_name: proposal.from_name,
      subject: `Chart proposal: ${proposal.songTitle || 'Song'}`,
      message: `${proposal.from_name} submitted ${proposal.instrument || proposal.type} content for approval.`,
      to: 'admin',
      metadata: { type: 'chart_proposal', proposalId: proposal.id, serviceId: proposal.serviceId },
    });
    await saveStore(env, store);
    return json({ ok: true, id: proposal.id });
  }

  if (path === '/sync/proposal/approve') {
    const id = String(url.searchParams.get('id') || '').trim();
    const proposal = (store.proposals || []).find((item) => item.id === id);
    if (!proposal) return json({ ok: false, error: 'proposal not found' }, 404);
    proposal.status = 'approved';
    proposal.approvedAt = nowIso();
    const plan = store.plans?.[proposal.serviceId];
    const planSong = findPlanSongForSync(plan?.songs || [], {
      rawSongId: proposal.songId || '',
      planItemId: proposal.planItemId || '',
      librarySongId: proposal.librarySongId || '',
    });
    const resolvedLibrarySongId = pickFirstNonEmpty(planSong?.songId, proposal.librarySongId, proposal.songId);
    store.songLibrary ||= {};
    if (resolvedLibrarySongId && !store.songLibrary[resolvedLibrarySongId]) {
      store.songLibrary[resolvedLibrarySongId] = buildLibrarySongSeed(resolvedLibrarySongId, {
        title: proposal.songTitle || '',
        artist: proposal.songArtist || '',
        planSong,
      });
    }
    const librarySong = resolvedLibrarySongId ? store.songLibrary[resolvedLibrarySongId] : null;
    if (planSong && resolvedLibrarySongId && !planSong.songId) planSong.songId = resolvedLibrarySongId;
    const field = proposal.type === 'lyrics'
      ? 'lyrics'
      : (proposal.instrument ? 'instrumentNotes' : 'chordChart');
    const patch = {
      field,
      value: proposal.content,
      instrument: proposal.type === 'lyrics' ? '' : proposal.instrument,
      keyboardRigs: proposal.keyboardRigs,
      isPrivileged: true,
    };
    applyChartToSong(planSong, patch);
    applyChartToSong(librarySong, patch);
    await saveStore(env, store);
    return json({ ok: true });
  }

  if (path === '/sync/proposal/reject') {
    const id = String(url.searchParams.get('id') || '').trim();
    const body = await readJson(request);
    const proposal = (store.proposals || []).find((item) => item.id === id);
    if (!proposal) return json({ ok: false, error: 'proposal not found' }, 404);
    proposal.status = 'rejected';
    proposal.rejectedAt = nowIso();
    proposal.rejectReason = String(body.reason || '').trim();
    await saveStore(env, store);
    return json({ ok: true });
  }

  if (path === '/sync/library/song-propose') {
    const body = await readJson(request);
    const song = normalizePendingSong(body);
    if (!song.title) return json({ ok: false, error: 'title is required' }, 400);
    store.pendingSongs ||= [];
    store.pendingSongs.unshift(song);
    addSystemMessage(store, {
      from_email: song.from_email,
      from_name: song.from_name,
      subject: `Song suggestion: ${song.title}`,
      message: `${song.from_name} suggested "${song.title}"${song.artist ? ` by ${song.artist}` : ''} for the song library.`,
      to: 'admin',
      metadata: { type: 'song_suggested', songId: song.id, status: 'pending_approval' },
    });
    await saveStore(env, store);
    return json({ ok: true, id: song.id });
  }

  if (path === '/sync/library/song-approve') {
    const id = String(url.searchParams.get('id') || '').trim();
    const song = (store.pendingSongs || []).find((item) => item.id === id);
    if (!song) return json({ ok: false, error: 'pending song not found' }, 404);
    store.songLibrary ||= {};
    const librarySong = songFromPendingSong(song);
    store.songLibrary[librarySong.id] = librarySong;
    song.status = 'approved';
    song.approvedAt = nowIso();
    song.librarySongId = librarySong.id;
    await saveStore(env, store);
    return json({ ok: true, song: librarySong });
  }

  if (path === '/sync/library/song-reject') {
    const id = String(url.searchParams.get('id') || '').trim();
    const body = await readJson(request);
    const song = (store.pendingSongs || []).find((item) => item.id === id);
    if (!song) return json({ ok: false, error: 'pending song not found' }, 404);
    song.status = 'rejected';
    song.rejectedAt = nowIso();
    song.rejectReason = String(body.reason || '').trim();
    await saveStore(env, store);
    return json({ ok: true });
  }

  if (path === '/sync/message') {
    const body = await readJson(request);
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from_email: normalizeIdentifier(body.from_email),
      from_name: String(body.from_name || 'Team Member').trim(),
      subject: String(body.subject || '(no subject)').trim(),
      message: String(body.message || '').trim(),
      to: ['all_team', 'assigned_team'].includes(body.to) ? body.to : 'admin',
      recipients: teamMessageRecipients(Array.isArray(body.recipients) ? body.recipients.map((email) => ({ email })) : []),
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      timestamp: nowIso(),
      read: false,
      replies: [],
    };
    store.messages.unshift(message);
    await saveStore(env, store);
    return json({ ok: true, id: message.id });
  }

  if (path === '/sync/message/reply') {
    const body = await readJson(request);
    const messageId = url.searchParams.get('messageId') || '';
    const message = store.messages.find((item) => item.id === messageId);
    if (!message) return json({ ok: false, error: 'message not found' }, 404);
    message.read = true;
    message.replies ||= [];
    message.replies.push({
      id: `reply_${Date.now()}`,
      from: String(body.admin_name || 'Admin').trim(),
      message: String(body.reply_text || '').trim(),
      timestamp: nowIso(),
    });
    await saveStore(env, store);
    return json({ ok: true });
  }

  return json({ ok: true, id: `sync_${Date.now()}` });
}

async function handleGet(env, store, path, url) {
  if (path === '/sync/status' || path === '/health') {
    return json({
      ok: true,
      service: 'ultimate-playback-sync',
      version: WORKER_VERSION,
      storage: env.SYNC_STORE ? 'kv' : 'memory',
      people: Array.isArray(store.people) ? store.people.length : 0,
      services: Array.isArray(store.services) ? store.services.length : 0,
      plans: store.plans && typeof store.plans === 'object' ? Object.keys(store.plans).length : 0,
      source: 'cloudflare-worker',
    });
  }

  if (path === '/sync/people') return json(store.people);
  if (path === '/sync/grants') {
    return json(Object.entries(store.grants || {}).map(([email, grant]) => ({ email, ...grant })));
  }
  if (path === '/sync/setlist/creators') {
    const creators = (store.people || []).filter((person) => canCreateSetlist(store, person));
    return json(creators.map((person) => ({
      id: person.id || '',
      name: person.name || '',
      email: person.email || '',
      roles: person.roles || [],
      roleAssignments: person.roleAssignments || '',
      canCreateSetlists: true,
    })));
  }
  if (path === '/sync/setlist/pending') {
    const status = String(url.searchParams.get('status') || 'pending').trim();
    return json((store.pendingSetlists || []).filter((entry) => (
      status === 'all' ? true : entry.status === status
    )));
  }
  if (path === '/sync/library/pending-songs') {
    const status = String(url.searchParams.get('status') || 'pending_approval').trim();
    return json((store.pendingSongs || []).filter((song) => (
      status === 'all' ? true : song.status === status
    )));
  }
  if (path === '/sync/assignment-stats' || path === '/sync/assignments/stats') {
    return json(assignmentStatsFor(store, {
      month: url.searchParams.get('month') || '',
      personId: url.searchParams.get('personId') || '',
      email: url.searchParams.get('email') || '',
    }));
  }
  if (path === '/sync/messages/admin') return json(store.messages);
  if (path === '/sync/messages/replies') {
    const email = normalizeIdentifier(url.searchParams.get('email') || '');
    return json(store.messages.filter((message) => (
      normalizeIdentifier(message.from_email) === email ||
      message.to === 'all_team' ||
      (Array.isArray(message.recipients) && message.recipients.map(normalizeIdentifier).includes(email))
    )));
  }
  if (path === '/sync/assignments') {
    return json(assignmentsFor(store, url.searchParams.get('email') || ''));
  }
  if (path === '/sync/service-bundle') {
    const bundle = serviceBundleFor(store, {
      serviceId: url.searchParams.get('serviceId') || '',
      email: url.searchParams.get('email') || '',
    });
    if (!bundle) return json({ ok: false, error: 'serviceId is required' }, 400);
    return json(bundle);
  }
  if (path === '/sync/setlist') return json(setlistFor(store, url.searchParams.get('serviceId') || ''));
  if (path.includes('/blockouts')) return json(store.blockouts || []);
  if (path.includes('/proposals')) return json(store.proposals || []);
  if (path.includes('/song-library') || path.includes('/library-pull')) {
    return json(Object.values(store.songLibrary || {}));
  }

  return json({ ok: true });
}

export default {
  async fetch(request, env = {}) {
    if (request.method === 'OPTIONS') return json({});

    const url = new URL(request.url);
    const path = url.pathname;
    const store = await getStore(env);

    if (request.method === 'GET') return handleGet(env, store, path, url);
    if (request.method === 'POST') return handlePost(request, env, store, path, url);
    if (request.method === 'DELETE') return json({ ok: true });

    return json({ ok: false, error: 'not found' }, 404);
  },
};
