const STORE_KEY = 'ultimate-playback-sync:v2';
const WORKER_VERSION = '2.4.9-assignment-tracking';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const STEM_JOB_CLAIM_TTL_MS = 10 * 60 * 1000;
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
    pendingServices: [],
    pendingSongs: [],
    pendingSetlists: [],
    blockouts: [],
    assignmentResponses: {},
    assignmentEvents: {},
    assignmentHistory: [],
    songLibrary: {},
    sourceUploads: {},
    stemJobs: [],
    desktopWorkers: {},
    liveStatus: null,
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

function shouldRequireLoginVerification(body = {}) {
  const client = normalizeRole(body.client || body.app || body.source || '');
  return Boolean(
    body.requireVerification ||
    body.requireLoginVerification ||
    client === 'ultimate_daw_desktop' ||
    client === 'ultimate_daw' ||
    client === 'desktop'
  );
}

function normalizeGrantRole(value) {
  const normalized = normalizeRole(value);
  const aliases = {
    owner: 'org_owner',
    orgowner: 'org_owner',
    administrator: 'admin',
    worshipleader: 'manager',
    worship_leader: 'manager',
    music_director: 'md',
    musicdirector: 'md',
    service_planner: 'leader',
    planner: 'leader',
    lead_vocal: 'lead_singer',
    vocal_lead: 'lead_singer',
  };
  return aliases[normalized] || normalized;
}

function isAdminGrantRole(value) {
  return ['org_owner', 'admin'].includes(normalizeGrantRole(value));
}

function isElevatedGrantRole(value) {
  return ['org_owner', 'admin', 'manager', 'md'].includes(normalizeGrantRole(value));
}

function isDesktopAccessGrantRole(value) {
  return ['org_owner', 'admin', 'manager'].includes(normalizeGrantRole(value));
}

function collectionItems(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function stemJobItems(store = {}) {
  return collectionItems(store.stemJobs).filter((job) => job && typeof job === 'object');
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

function assignmentIdentityKey(value = {}) {
  return normalizeIdentifier(value.email || value.identifier || value.personId || value.name || '');
}

function assignmentResponseMapFor(store, serviceId = '') {
  const id = String(serviceId || '').trim();
  const scoped = id ? store.assignmentResponses?.[id] : null;
  return scoped && typeof scoped === 'object' ? scoped : {};
}

function assignmentEventMapFor(store, serviceId = '') {
  const id = String(serviceId || '').trim();
  const scoped = id ? store.assignmentEvents?.[id] : null;
  return scoped && typeof scoped === 'object' ? scoped : {};
}

function findAssignmentResponseForMember(responseMap = {}, member = {}) {
  const candidates = [member.email, member.personId, member.id, member.name]
    .map((value) => normalizeIdentifier(value))
    .filter(Boolean);
  for (const key of candidates) {
    if (responseMap[key]) return responseMap[key];
  }
  return null;
}

function findAssignmentEventsForMember(eventMap = {}, member = {}) {
  const candidates = [member.email, member.personId, member.id, member.name]
    .map((value) => normalizeIdentifier(value))
    .filter(Boolean);
  for (const key of candidates) {
    if (eventMap[key]) return eventMap[key];
  }
  return null;
}

function assignmentTrackingFor(store, { serviceId = '' } = {}) {
  const id = String(serviceId || '').trim();
  const plan = store.plans?.[id] || {};
  const team = Array.isArray(plan.team) ? plan.team : [];
  const responseMap = assignmentResponseMapFor(store, id);
  const eventMap = assignmentEventMapFor(store, id);

  const members = team.map((member) => {
    const person = findPerson(store, {
      id: member.personId,
      email: member.email,
      identifier: member.email,
    }) || {};
    const merged = {
      ...member,
      personId: member.personId || person.id || '',
      email: normalizeIdentifier(member.email || person.email),
      name: member.name || person.name || '',
    };
    const response = findAssignmentResponseForMember(responseMap, merged);
    const events = findAssignmentEventsForMember(eventMap, merged) || {};
    const status = normalizeRole(response?.status || response?.response || merged.status || 'pending') || 'pending';
    const viewedAt = events.setlistViewedAt || '';
    const listenedAt = events.setlistListenedAt || '';
    return {
      personId: merged.personId,
      email: merged.email,
      name: merged.name,
      role: merged.role || '',
      status,
      declineReason: response?.declineReason || response?.reason || '',
      respondedAt: response?.respondedAt || response?.updatedAt || '',
      setlistViewed: Boolean(viewedAt),
      setlistViewedAt: viewedAt,
      setlistListened: Boolean(listenedAt),
      setlistListenedAt: listenedAt,
      lastSetlistEventAt: events.lastEventAt || listenedAt || viewedAt || '',
      listenSeconds: Number(events.listenSeconds || 0),
      listenCount: Number(events.listenCount || 0),
      viewCount: Number(events.viewCount || 0),
    };
  });

  const accepted = members.filter((member) => ['accepted', 'confirmed', 'registered'].includes(member.status)).length;
  const declined = members.filter((member) => member.status === 'declined').length;
  const viewed = members.filter((member) => member.setlistViewed).length;
  const listened = members.filter((member) => member.setlistListened).length;

  return {
    ok: true,
    serviceId: id,
    counts: {
      assigned: members.length,
      accepted,
      declined,
      pending: Math.max(0, members.length - accepted - declined),
      setlistViewed: viewed,
      setlistNotViewed: Math.max(0, members.length - viewed),
      setlistListened: listened,
      setlistNotListened: Math.max(0, members.length - listened),
    },
    members,
    generatedAt: nowIso(),
  };
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

  if (shouldRequireLoginVerification(body)) {
    const challenge = createAuthChallenge(user, 'login');
    user.lastLoginChallengeAt = nowIso();
    user.updatedAt = user.lastLoginChallengeAt;
    await saveStore(env, store);
    return json({
      ok: true,
      requiresVerification: true,
      needsVerification: true,
      verificationPurpose: 'login',
      email: user.email || identifier,
      identifier,
      user: {
        id: user.id,
        personId: user.personId,
        email: user.email || '',
        phone: user.phone || '',
        identifier,
        name: user.name || '',
        status: 'pending_verification',
      },
      verificationCode: challenge.code,
      betaVerification: true,
      expiresAt: challenge.expiresAt,
    });
  }

  const token = await createSession(store, user, body.deviceId);
  await saveStore(env, store);

  return json(authResponse(user, token, profile));
}

function authChallengeForPurpose(user = {}, purpose = '') {
  const normalizedPurpose = normalizeRole(purpose || '');
  const candidates = [
    user.verification,
    user.verificationCode,
    user.pendingVerification,
    user.loginVerification,
    user.loginChallenge,
    user.authChallenge,
    normalizedPurpose === 'signup' ? user.signupVerification : null,
    normalizedPurpose === 'login' ? user.loginVerification : null,
    normalizedPurpose === 'login' ? user.reset : null,
    normalizedPurpose === 'reset' ? user.reset : null,
  ];
  return candidates.find((challenge) => {
    if (!challenge) return false;
    if (typeof challenge === 'string' || typeof challenge === 'number') return true;
    if (typeof challenge !== 'object') return false;
    if (challenge.purpose && normalizedPurpose && normalizeRole(challenge.purpose) !== normalizedPurpose) {
      return false;
    }
    return Boolean(challenge.code || challenge.token || challenge.value);
  }) || null;
}

function authChallengeCode(challenge) {
  if (typeof challenge === 'string' || typeof challenge === 'number') return String(challenge).trim();
  if (!challenge || typeof challenge !== 'object') return '';
  return String(challenge.code || challenge.token || challenge.value || '').trim();
}

function createAuthChallenge(user = {}, purpose = 'login') {
  const normalizedPurpose = normalizeRole(purpose || 'login');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const challenge = {
    code,
    purpose: normalizedPurpose,
    expiresAt: Date.now() + 15 * 60 * 1000,
    createdAt: nowIso(),
  };

  if (normalizedPurpose === 'login') {
    user.loginVerification = challenge;
    user.loginChallenge = challenge;
  } else if (normalizedPurpose === 'signup') {
    user.signupVerification = challenge;
  } else {
    user.authChallenge = challenge;
  }

  return challenge;
}

function authChallengeExpired(challenge) {
  if (!challenge || typeof challenge !== 'object') return false;
  const expiresAt = Number(challenge.expiresAt || 0) || Date.parse(challenge.expiresAt || '');
  return Boolean(expiresAt && expiresAt < Date.now());
}

function clearAuthChallenge(user = {}, purpose = '') {
  const normalizedPurpose = normalizeRole(purpose || '');
  user.verification = null;
  user.verificationCode = null;
  user.pendingVerification = null;
  user.authChallenge = null;
  if (normalizedPurpose === 'signup') user.signupVerification = null;
  if (normalizedPurpose === 'login') {
    user.loginVerification = null;
    user.loginChallenge = null;
    user.reset = null;
  }
}

async function handleVerifyAuth(request, env, store) {
  const body = await readJson(request);
  const identifier = normalizeIdentifier(body.identifier || body.email || body.phone);
  const code = String(body.code || '').trim();
  const purpose = normalizeRole(body.purpose || 'login');

  if (!identifier || !code) {
    return json({ ok: false, error: 'Email or phone, plus verification code, are required.' }, 400);
  }

  const user = store.users[lookupKey(identifier)];
  if (!user) return json({ ok: false, error: 'Account not found.' }, 404);

  const challenge = authChallengeForPurpose(user, purpose) || authChallengeForPurpose(user, '');
  if (!challenge || authChallengeCode(challenge) !== code || authChallengeExpired(challenge)) {
    return json({ ok: false, error: 'Invalid or expired verification code.' }, 401);
  }

  clearAuthChallenge(user, purpose);
  user.verifiedAt ||= nowIso();
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

async function handleResendVerification(request, env, store) {
  const body = await readJson(request);
  const identifier = normalizeIdentifier(body.identifier || body.email || body.phone);
  const purpose = normalizeRole(body.purpose || 'login');

  if (!identifier) {
    return json({ ok: false, error: 'Email or phone is required.' }, 400);
  }

  const user = store.users[lookupKey(identifier)];
  if (!user) return json({ ok: false, error: 'Account not found.' }, 404);

  const challenge = createAuthChallenge(user, purpose);
  user.updatedAt = nowIso();
  await saveStore(env, store);

  return json({
    ok: true,
    sent: true,
    requiresVerification: true,
    verificationPurpose: purpose,
    email: user.email || identifier,
    identifier,
    verificationCode: challenge.code,
    betaVerification: true,
    expiresAt: challenge.expiresAt,
  });
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

function normalizeServiceProposal(body = {}) {
  const submittedBy = body.submittedBy || body.submitter || {};
  const id = String(body.id || body.serviceId || `svc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`).trim();
  const name = String(body.name || body.title || body.serviceName || 'Service').trim();
  return {
    id,
    name,
    title: name,
    date: String(body.date || body.serviceDate || '').trim(),
    time: String(body.time || body.serviceTime || '').trim(),
    type: String(body.type || body.serviceType || 'standard').trim(),
    serviceType: String(body.type || body.serviceType || 'standard').trim(),
    notes: String(body.notes || '').trim(),
    status: body.status || 'pending_approval',
    created_by_email: normalizeIdentifier(body.created_by_email || submittedBy.email),
    submitted_by: normalizeIdentifier(body.submitted_by || submittedBy.email),
    submittedBy: {
      email: normalizeIdentifier(submittedBy.email || body.created_by_email || body.submitted_by),
      name: String(submittedBy.name || body.created_by_name || 'Service Planner').trim(),
    },
    createdAt: body.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

async function handleProposeService(request, env, store) {
  const body = await readJson(request);
  const service = normalizeServiceProposal(body);
  if (!service.name || !service.date) {
    return json({ ok: false, error: 'service name and date are required' }, 400);
  }
  store.pendingServices ||= [];
  const idx = store.pendingServices.findIndex((item) => item.id === service.id);
  if (idx >= 0) store.pendingServices[idx] = { ...store.pendingServices[idx], ...service };
  else store.pendingServices.unshift(service);
  addSystemMessage(store, {
    from_email: service.submittedBy.email,
    from_name: service.submittedBy.name,
    subject: `Service proposal: ${service.name}`,
    message: `${service.submittedBy.name || 'Service Planner'} proposed ${service.name} for ${service.date}.`,
    to: 'admin',
    metadata: { type: 'service_proposed', serviceId: service.id, status: service.status },
  });
  await saveStore(env, store);
  return json({ ok: true, service });
}

async function handleApproveService(request, env, store, url) {
  const id = String(url.searchParams.get('id') || '').trim();
  const body = await readJson(request);
  store.pendingServices ||= [];
  const idx = store.pendingServices.findIndex((item) => item.id === id);
  if (idx < 0) return json({ ok: false, error: 'pending service not found' }, 404);
  const service = {
    ...store.pendingServices[idx],
    status: 'approved',
    approvedAt: nowIso(),
    approvedBy: body.approvedBy || null,
    updatedAt: nowIso(),
  };
  upsertService(store, service);
  store.pendingServices.splice(idx, 1);
  await saveStore(env, store);
  return json({ ok: true, service });
}

async function handleRejectService(request, env, store, url) {
  const id = String(url.searchParams.get('id') || '').trim();
  const body = await readJson(request);
  store.pendingServices ||= [];
  const service = store.pendingServices.find((item) => item.id === id);
  if (!service) return json({ ok: false, error: 'pending service not found' }, 404);
  service.status = 'rejected';
  service.rejectedAt = nowIso();
  service.rejectReason = String(body.reason || body.note || '').trim();
  service.updatedAt = nowIso();
  await saveStore(env, store);
  return json({ ok: true, service });
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
    const responseMap = assignmentResponseMapFor(store, service.id);
    const eventMap = assignmentEventMapFor(store, service.id);
    const response = findAssignmentResponseForMember(responseMap, {
      personId: person.id,
      email: person.email || email,
      name: person.name,
    });
    const events = findAssignmentEventsForMember(eventMap, {
      personId: person.id,
      email: person.email || email,
      name: person.name,
    }) || {};

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
      status: response?.status || response?.response || matches[0].status || 'pending',
      respondedAt: response?.respondedAt || '',
      setlistViewed: Boolean(events.setlistViewedAt),
      setlistViewedAt: events.setlistViewedAt || '',
      setlistListened: Boolean(events.setlistListenedAt),
      setlistListenedAt: events.setlistListenedAt || '',
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

function parseLiveSections(song = {}, body = {}) {
  if (Array.isArray(body.sections)) return body.sections;
  if (Array.isArray(song.sections)) return song.sections;
  const raw = body.lyrics || song.lyrics || '';
  if (!raw) return [];
  const sections = [];
  let current = null;
  for (const line of String(raw).split('\n')) {
    const match = line.match(/^\[(.+?)\]$/);
    if (match) {
      if (current) sections.push(current);
      current = { label: match[1], text: '' };
    } else {
      if (!current) current = { label: '', text: '' };
      current.text = current.text ? `${current.text}\n${line}` : line;
    }
  }
  if (current) sections.push(current);
  return sections.filter((section) => section.label || String(section.text || '').trim());
}

function liveStatusPayload(store, body = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const explicit = (...keys) => {
    for (const key of keys) {
      if (has(key)) return body[key];
    }
    return undefined;
  };
  const explicitServiceId = explicit('serviceId', 'service_id');
  const explicitSongId = explicit('songId', 'song_id', 'id');
  const serviceId = String(explicitServiceId ?? '').trim();
  const songId = String(explicitSongId ?? '').trim();
  const service = serviceId ? serviceMapFromStore(store)[serviceId] || null : null;
  const setlist = serviceId ? setlistFor(store, serviceId) : [];
  const song = songId
    ? setlist.find((item) => String(item.id) === songId) || null
    : (setlist[Number(body.songIndex || body.index || 0)] || null);
  const previous = store.liveStatus || {};
  const title = explicit('title', 'songTitle') ?? song?.title ?? previous.title ?? previous.songTitle ?? 'Service';
  const artist = explicit('artist') ?? song?.artist ?? previous.artist ?? '';
  return {
    ok: true,
    isLive: has('isLive') ? Boolean(body.isLive) : Boolean(previous.isLive),
    serviceId: explicitServiceId !== undefined ? serviceId : (previous.serviceId || ''),
    serviceName: explicit('serviceName') ?? service?.name ?? service?.title ?? previous.serviceName ?? '',
    songId: explicitSongId !== undefined ? songId : (song?.id || previous.songId || ''),
    songIndex: Number.isFinite(Number(body.songIndex || body.index))
      ? Number(body.songIndex || body.index)
      : Number(previous.songIndex || 0),
    title,
    songTitle: title,
    artist,
    key: explicit('key') ?? song?.key ?? previous.key ?? '',
    bpm: explicit('bpm', 'tempo') ?? song?.tempo ?? previous.bpm ?? '',
    tempo: explicit('tempo', 'bpm') ?? song?.tempo ?? previous.tempo ?? '',
    youtubeUrl: explicit('youtubeUrl', 'youtube_url') ?? song?.mediaUrl ?? song?.audioUrl ?? previous.youtubeUrl ?? '',
    sections: parseLiveSections(song || {}, body),
    updatedAt: nowIso(),
  };
}

async function handleLiveStatus(request, env, store) {
  const body = await readJson(request);
  store.liveStatus = liveStatusPayload(store, body);
  await saveStore(env, store);
  return json(store.liveStatus);
}

async function handleAssignmentResponse(request, env, store) {
  const body = await readJson(request);
  const serviceId = String(body.serviceId || body.service_id || '').trim();
  const email = normalizeIdentifier(body.email || body.identifier);
  const personId = String(body.personId || '').trim();
  const name = String(body.name || '').trim();
  const role = String(body.role || '').trim();
  const status = normalizeRole(body.status || body.decision || body.response || '');

  if (!serviceId) return json({ ok: false, error: 'serviceId is required' }, 400);
  if (!email && !personId && !name) return json({ ok: false, error: 'email, personId, or name is required' }, 400);
  if (!['accepted', 'declined', 'pending'].includes(status)) {
    return json({ ok: false, error: 'status must be accepted, declined, or pending' }, 400);
  }

  const key = assignmentIdentityKey({ email, personId, name });
  store.assignmentResponses ||= {};
  store.assignmentResponses[serviceId] ||= {};
  const respondedAt = nowIso();
  const response = {
    email,
    personId,
    name,
    role,
    status,
    response: status,
    declineReason: String(body.reason || body.declineReason || '').trim(),
    respondedAt,
    updatedAt: respondedAt,
  };
  store.assignmentResponses[serviceId][key] = response;
  if (email) store.assignmentResponses[serviceId][email] = response;
  if (personId) store.assignmentResponses[serviceId][personId] = response;

  const plan = store.plans?.[serviceId];
  if (plan && Array.isArray(plan.team)) {
    plan.team = plan.team.map((member) => {
      const memberEmail = normalizeIdentifier(member.email);
      const memberPersonId = String(member.personId || '').trim();
      const memberName = normalizeIdentifier(member.name);
      const roleMatches = !role || normalizeRole(member.role) === normalizeRole(role);
      const identityMatches =
        (email && memberEmail === email) ||
        (personId && memberPersonId === personId) ||
        (name && memberName === normalizeIdentifier(name));
      if (!identityMatches || !roleMatches) return member;
      return {
        ...member,
        status,
        response: status,
        declineReason: response.declineReason,
        respondedAt,
      };
    });
    plan.updatedAt = respondedAt;
  }

  await saveStore(env, store);
  return json({ ok: true, response });
}

async function handleAssignmentEvent(request, env, store) {
  const body = await readJson(request);
  const serviceId = String(body.serviceId || body.service_id || '').trim();
  const email = normalizeIdentifier(body.email || body.identifier);
  const personId = String(body.personId || '').trim();
  const name = String(body.name || '').trim();
  const role = String(body.role || '').trim();
  const type = normalizeRole(body.type || body.event || body.action || '');

  if (!serviceId) return json({ ok: false, error: 'serviceId is required' }, 400);
  if (!email && !personId && !name) return json({ ok: false, error: 'email, personId, or name is required' }, 400);
  if (!['setlist_viewed', 'setlist_opened', 'setlist_listened', 'listened'].includes(type)) {
    return json({ ok: false, error: 'unsupported assignment event type' }, 400);
  }

  const key = assignmentIdentityKey({ email, personId, name });
  store.assignmentEvents ||= {};
  store.assignmentEvents[serviceId] ||= {};
  const previous = store.assignmentEvents[serviceId][key] || {};
  const eventAt = nowIso();
  const isListened = type === 'setlist_listened' || type === 'listened';
  const listenSeconds = Math.max(0, Number(body.listenSeconds || body.durationSec || body.seconds || 0) || 0);
  const next = {
    ...previous,
    email: email || previous.email || '',
    personId: personId || previous.personId || '',
    name: name || previous.name || '',
    role: role || previous.role || '',
    lastEventAt: eventAt,
    viewCount: Number(previous.viewCount || 0) + 1,
    setlistViewedAt: previous.setlistViewedAt || eventAt,
    listenCount: Number(previous.listenCount || 0) + (isListened ? 1 : 0),
    listenSeconds: Number(previous.listenSeconds || 0) + listenSeconds,
    setlistListenedAt: isListened ? eventAt : (previous.setlistListenedAt || ''),
  };
  store.assignmentEvents[serviceId][key] = next;
  if (email) store.assignmentEvents[serviceId][email] = next;
  if (personId) store.assignmentEvents[serviceId][personId] = next;

  await saveStore(env, store);
  return json({ ok: true, event: next, tracking: assignmentTrackingFor(store, { serviceId }) });
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

function normalizeStemMap(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, stem]) => {
        const normalizedKey = normalizeRole(key);
        if (!normalizedKey) return null;
        if (typeof stem === 'string') {
          return [normalizedKey, { url: stem, type: normalizedKey }];
        }
        if (stem && typeof stem === 'object') {
          return [normalizedKey, {
            ...stem,
            type: stem.type || normalizedKey,
            url: stem.url || stem.fileUrl || stem.file_url || stem.path || '',
          }];
        }
        return null;
      })
      .filter(Boolean)
      .filter(([, stem]) => stem.url),
  );
}

function safeAssetName(value, fallback = 'stem.wav') {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 140) || fallback;
}

function contentTypeForFilename(filename = '') {
  const ext = String(filename).toLowerCase().split('?')[0].split('#')[0].split('.').pop();
  switch (ext) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    case 'aif':
    case 'aiff':
      return 'audio/aiff';
    default:
      return 'application/octet-stream';
  }
}

function stemAssetDownloadUrl(origin, jobId, type) {
  return `${origin}/sync/stem-assets/download?id=${encodeURIComponent(jobId)}&type=${encodeURIComponent(type)}`;
}

function stemAssetCanDownload(job = {}) {
  const expired = job.retention?.expiresAt ? Date.parse(job.retention.expiresAt) < Date.now() : false;
  if (expired) return false;
  return ['ready_for_review', 'completed', 'approved', 'published'].includes(job.status);
}

async function handleUploadStemAsset(request, env, store, url) {
  if (!env.STEM_ASSETS) {
    return json({
      ok: false,
      error: 'STEM_ASSETS R2 binding is not configured for this Worker.',
    }, 501);
  }

  const job = findStemJob(store, url);
  if (!job) return json({ ok: false, error: 'stem job not found' }, 404);

  const type = normalizeRole(url.searchParams.get('type') || url.searchParams.get('stem') || '');
  if (!type) return json({ ok: false, error: 'stem type is required' }, 400);

  const filename = safeAssetName(url.searchParams.get('filename') || `${type}.wav`);
  const objectKey = `stem-jobs/${job.id}/${type}/${Date.now()}-${filename}`;
  const body = await request.arrayBuffer();
  if (!body || body.byteLength === 0) {
    return json({ ok: false, error: 'empty stem upload' }, 400);
  }

  await env.STEM_ASSETS.put(objectKey, body, {
    httpMetadata: {
      contentType: request.headers.get('content-type') || contentTypeForFilename(filename),
    },
    customMetadata: {
      stemJobId: job.id,
      stemType: type,
      uploadedAt: nowIso(),
    },
  });

  job.stems ||= {};
  const origin = new URL(request.url).origin;
  job.stems[type] = {
    type,
    name: filename,
    url: stemAssetDownloadUrl(origin, job.id, type),
    objectKey,
    bytes: body.byteLength,
    delivery: 'cloudflare_r2',
    downloadable: true,
    uploadedAt: nowIso(),
  };
  job.stemsUrl = '';
  job.updatedAt = nowIso();
  job.readiness = {
    ...(job.readiness || {}),
    separated: Object.keys(job.stems || {}).length > 0,
  };

  await saveStore(env, store);
  return json({ ok: true, stem: job.stems[type], job: stemJobPublicPayload(job) });
}

async function handleUploadStemSource(request, env, store, url) {
  if (!env.STEM_ASSETS) {
    return json({
      ok: false,
      error: 'STEM_ASSETS R2 binding is not configured for this Worker.',
    }, 501);
  }

  const uploadId = safeAssetName(url.searchParams.get('uploadId') || `source_${Date.now()}`);
  const filename = safeAssetName(url.searchParams.get('filename') || 'source-audio');
  const objectKey = `stem-sources/${uploadId}/${Date.now()}-${filename}`;
  const body = await request.arrayBuffer();
  if (!body || body.byteLength === 0) {
    return json({ ok: false, error: 'empty source upload' }, 400);
  }

  await env.STEM_ASSETS.put(objectKey, body, {
    httpMetadata: {
      contentType: request.headers.get('content-type') || contentTypeForFilename(filename),
    },
    customMetadata: {
      uploadId,
      uploadedAt: nowIso(),
    },
  });

  store.sourceUploads ||= {};
  store.sourceUploads[uploadId] = {
    id: uploadId,
    filename,
    objectKey,
    bytes: body.byteLength,
    uploadedAt: nowIso(),
  };
  await saveStore(env, store);

  const origin = new URL(request.url).origin;
  return json({
    ok: true,
    uploadId,
    fileUrl: `${origin}/sync/stem-sources/download?uploadId=${encodeURIComponent(uploadId)}`,
    bytes: body.byteLength,
  });
}

async function handleDownloadStemAsset(env, store, url) {
  if (!env.STEM_ASSETS) {
    return json({
      ok: false,
      error: 'STEM_ASSETS R2 binding is not configured for this Worker.',
    }, 501);
  }

  const job = findStemJob(store, url);
  if (!job) return json({ ok: false, error: 'stem job not found' }, 404);
  if (!stemAssetCanDownload(job)) {
    return json({ ok: false, error: 'stem asset is not available for download' }, 403);
  }

  const type = normalizeRole(url.searchParams.get('type') || url.searchParams.get('stem') || '');
  const stem = job.stems?.[type];
  if (!type || !stem?.objectKey) return json({ ok: false, error: 'stem asset not found' }, 404);

  const object = await env.STEM_ASSETS.get(stem.objectKey);
  if (!object) return json({ ok: false, error: 'stem asset missing from storage' }, 404);

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || contentTypeForFilename(stem.name),
      'content-length': String(object.size || stem.bytes || ''),
      'content-disposition': `attachment; filename="${safeAssetName(stem.name || `${type}.wav`)}"`,
      'cache-control': 'private, max-age=300',
      'access-control-allow-origin': '*',
    },
  });
}

async function handleDownloadStemSource(env, store, url) {
  if (!env.STEM_ASSETS) {
    return json({
      ok: false,
      error: 'STEM_ASSETS R2 binding is not configured for this Worker.',
    }, 501);
  }

  const uploadId = safeAssetName(url.searchParams.get('uploadId') || '');
  const source = uploadId ? store.sourceUploads?.[uploadId] : null;
  if (!source?.objectKey) return json({ ok: false, error: 'source upload not found' }, 404);

  const object = await env.STEM_ASSETS.get(source.objectKey);
  if (!object) return json({ ok: false, error: 'source upload missing from storage' }, 404);

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || contentTypeForFilename(source.filename),
      'content-length': String(object.size || source.bytes || ''),
      'content-disposition': `attachment; filename="${safeAssetName(source.filename || 'source-audio')}"`,
      'cache-control': 'private, max-age=300',
      'access-control-allow-origin': '*',
    },
  });
}

function normalizeRoleStemMap(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      lead_vocal: ['vocals'],
      vocal: ['vocals'],
      soprano: ['vocals'],
      alto: ['vocals'],
      tenor: ['vocals'],
      keys: ['piano', 'other'],
      piano: ['piano'],
      synth_pad: ['other'],
      guitar: ['guitar', 'other'],
      electric_guitar: ['guitar', 'other'],
      acoustic_guitar: ['guitar', 'other'],
      bass: ['bass'],
      drums: ['drums'],
    };
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([role, stems]) => [
        normalizeRole(role),
        Array.isArray(stems) ? stems.map(normalizeRole).filter(Boolean) : [normalizeRole(stems)].filter(Boolean),
      ])
      .filter(([role, stems]) => role && stems.length),
  );
}

function activeDesktopWorkerFor(store, account = {}) {
  const accountEmail = normalizeIdentifier(account.email || account.accountEmail || account.ownerEmail || account.identifier);
  const accountId = String(account.id || account.accountId || '').trim();
  const workers = Object.values(store.desktopWorkers || {});
  const cutoff = Date.now() - (5 * 60 * 1000);
  const capableOnline = workers.filter((worker) => {
    const updated = Date.parse(worker.lastSeenAt || worker.updatedAt || '');
    if (!updated || updated < cutoff) return false;
    if (worker.capabilities?.stems === false) return false;
    return worker.status === 'online';
  });

  if (!accountEmail && !accountId) return capableOnline[0] || null;

  const exact = capableOnline.find((worker) => (
    (accountEmail && normalizeIdentifier(worker.accountEmail) === accountEmail) ||
    (accountId && String(worker.accountId || '').trim() === accountId)
  ));
  if (exact) return exact;

  return capableOnline.find((worker) => {
    const mode = normalizeRole(worker.workerMode || worker.capabilities?.workerMode);
    return (
      ['backup_laptop', 'library_server', 'shared_processor'].includes(mode) ||
      worker.allowBackupWorker === true ||
      worker.capabilities?.allowBackupWorker === true
    );
  }) || null;
}

function buildBrainSnapshot(store = {}, account = {}) {
  const workers = collectionItems(store.desktopWorkers);
  const selectedDesktop = activeDesktopWorkerFor(store, account);
  const now = Date.now();
  const cutoff = now - (5 * 60 * 1000);
  const onlineWorkers = workers.filter((worker) => {
    const updated = Date.parse(worker.lastSeenAt || worker.updatedAt || '');
    if (!updated || updated < cutoff) return false;
    if (worker.capabilities?.stems === false) return false;
    return worker.status === 'online';
  });
  const selectedRoute = selectedDesktop ? 'desktop' : 'cloudflare_fallback';
  const localBrain = selectedDesktop?.brain || null;
  const localBrainCapabilities = localBrain?.capabilities || {};

  return {
    ok: true,
    sourceOfTruth: 'cinestage_brain',
    service: 'ultimate-playback-sync',
    version: WORKER_VERSION,
    checkedAt: nowIso(),
    account: {
      email: normalizeIdentifier(account.email || account.accountEmail || account.ownerEmail || account.identifier),
      accountId: String(account.id || account.accountId || '').trim(),
    },
    brain: {
      id: 'cinestage_brain',
      name: 'CineStage Brain',
      status: 'online',
      syncUrl: 'https://ultimate-playback-sync.studio-cinestage.workers.dev',
      authority: {
        presence: true,
        stemRouting: true,
        serviceReadiness: true,
        setlistApproval: true,
        teamNotifications: true,
        localSongIntelligence: Boolean(localBrainCapabilities.songIntelligence || localBrainCapabilities.songPipeline),
        localChartGeneration: Boolean(localBrainCapabilities.instrumentCharts),
        localPartsheets: Boolean(localBrainCapabilities.partsheets),
        localWorshipMemory: Boolean(localBrainCapabilities.worshipMemory),
      },
      localInstallation: localBrain,
    },
    stemProcessingRoute: {
      preferred: 'desktop',
      selected: selectedRoute,
      desktopOnline: Boolean(selectedDesktop),
      desktopWorkerId: selectedDesktop?.id || '',
      fallbackEligible: true,
      fallbackReason: selectedDesktop ? '' : 'no_capable_desktop_online',
      routeLabel: selectedDesktop ? 'Desktop processing' : 'Cloudflare fallback',
      statusLabel: selectedDesktop ? 'Desktop processor online' : 'Desktop offline',
      detail: selectedDesktop
        ? `${selectedDesktop.name || 'CineStage Desktop'} is ready for stems`
        : 'CineStage Brain will use the next available fallback lane',
      queueDepth: selectedDesktop?.queueDepth ?? null,
      activeJobId: selectedDesktop?.activeJobId || '',
      lastSeenAt: selectedDesktop?.lastSeenAt || selectedDesktop?.updatedAt || '',
    },
    desktop: selectedDesktop || null,
    desktops: workers,
    onlineDesktops: onlineWorkers,
    counts: {
      desktops: workers.length,
      onlineDesktops: onlineWorkers.length,
      queuedStemJobs: stemJobItems(store).filter((job) => job.status === 'queued_for_desktop').length,
      activeStemJobs: stemJobItems(store).filter((job) => ['queued_for_desktop', 'processing'].includes(job.status)).length,
    },
  };
}

function summarizeBrainQuery(snapshot = {}, prompt = '', context = {}) {
  const route = snapshot.stemProcessingRoute || {};
  const install = snapshot.brain?.localInstallation || {};
  const caps = install.capabilities || {};
  const enabledCaps = Object.entries(caps)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([name]) => name);
  const screen = String(context?.screen || '').trim();
  const service = context?.service?.name || context?.serviceName || '';
  const songs = Array.isArray(context?.songs) ? context.songs : [];
  const team = Array.isArray(context?.team) ? context.team : [];

  return [
    'CineStage Brain is online.',
    route.desktopOnline
      ? `${String(route.detail || 'The desktop processor is ready.').replace(/[.!?]*$/, '.') } Stem requests are routed to desktop first.`
      : 'No account desktop is online, so stem requests will use the fallback lane.',
    install.status
      ? `Local Brain install: ${install.status}${install.path ? ` at ${install.path}` : ''}.`
      : 'No local Brain install is attached to the selected desktop yet.',
    enabledCaps.length > 0
      ? `Detected engines: ${enabledCaps.slice(0, 8).join(', ')}${enabledCaps.length > 8 ? `, +${enabledCaps.length - 8} more` : ''}.`
      : 'No local song-intelligence engines were reported in the last heartbeat.',
    service ? `Current service context: ${service}.` : '',
    songs.length > 0 ? `Setlist context includes ${songs.length} song${songs.length === 1 ? '' : 's'}.` : '',
    team.length > 0 ? `Team context includes ${team.length} member${team.length === 1 ? '' : 's'}.` : '',
    prompt ? `Request received: "${prompt}".` : '',
  ].filter(Boolean).join('\n');
}

async function handleBrainQuery(request, env, store) {
  const body = await readJson(request);
  const prompt = String(body.query || body.prompt || body.message || '').trim();
  const context = body.context && typeof body.context === 'object' ? body.context : {};
  const account = {
    email: body.accountEmail || body.email || context.accountEmail || context.email || '',
    id: body.accountId || context.accountId || '',
  };
  const snapshot = buildBrainSnapshot(store, account);
  const response = summarizeBrainQuery(snapshot, prompt, context);
  return json({
    ok: true,
    sourceOfTruth: 'cinestage_brain',
    response,
    answer: response,
    message: response,
    intent: prompt,
    brain: snapshot.brain,
    stemProcessingRoute: snapshot.stemProcessingRoute,
    checkedAt: snapshot.checkedAt,
  });
}

function desktopAccessFor(store, identifier = '') {
  const email = normalizeIdentifier(identifier);
  const person = findPerson(store, { email, identifier: email }) || {};
  const user = email ? store.users?.[lookupKey(email)] || {} : {};
  const hasGrantRecord = Boolean(email && store.grants && Object.prototype.hasOwnProperty.call(store.grants, email));
  const grant = hasGrantRecord ? store.grants[email] || {} : {};
  const role = normalizeGrantRole(
    hasGrantRecord
      ? (grant.grantedRole || grant.role || '')
      : (user.grantedRole || user.role || person.grantedRole || person.role || '')
  );
  const canAccessDesktop = isDesktopAccessGrantRole(role);
  return {
    ok: true,
    email,
    role,
    desktopRole: role,
    canAccessDesktop,
    reason: canAccessDesktop ? 'allowed_desktop_role' : 'desktop_role_required',
    allowedRoles: ['org_owner', 'admin', 'manager'],
  };
}

async function handleDesktopAccess(request, store, url) {
  if (request.method === 'POST') {
    const body = await readJson(request);
    return json(desktopAccessFor(store, body.email || body.identifier || body.phone || ''));
  }
  return json(desktopAccessFor(store, url.searchParams.get('email') || url.searchParams.get('identifier') || ''));
}

function serviceEndDateForStemJob(job = {}, store = {}) {
  const service = job.serviceId ? serviceMapFromStore(store)[job.serviceId] : null;
  const date = String(job.serviceDate || service?.date || '').trim();
  const time = String(job.serviceEndTime || job.serviceTime || service?.endTime || service?.time || '').trim();
  const parsed = Date.parse(`${date}T${time || '23:59'}`);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  const serviceDate = Date.parse(date);
  if (!Number.isNaN(serviceDate)) {
    return new Date(serviceDate + (23 * 60 + 59) * 60 * 1000);
  }
  return new Date(Date.now() + 2 * 60 * 60 * 1000);
}

function stemRetentionPolicy(body = {}, store = {}) {
  const retention = body.retention || body.storagePolicy || {};
  const deleteAfterHours = Math.max(
    0.25,
    Number(
      retention.deleteAfterServiceHours ??
      body.deleteAfterServiceHours ??
      2,
    ) || 2,
  );
  return {
    mode: String(retention.mode || body.storageMode || 'ephemeral_delivery').trim(),
    deleteAfterServiceHours: deleteAfterHours,
    cloudStorageAllowed: retention.cloudStorageAllowed === true || body.cloudStorageAllowed === true,
    accountHolderLocalCacheAllowed: retention.accountHolderLocalCacheAllowed !== false && body.localCacheAllowed !== false,
    cacheRecognitionEnabled: retention.cacheRecognitionEnabled !== false,
    externalDriveRecommended: true,
    websiteCatalogEligible: false,
    cleanupStatus: 'not_published',
    expiresAt: '',
    cleanupInstructions: [
      'Delete temporary delivery links and downloadable app cache after expiration.',
      'Keep only metadata in the sync Worker.',
      'Keep reusable stems only on the account holder desktop, mini PC/Mac, or external drive when explicitly saved.',
    ],
  };
}

function normalizeStemJob(body = {}, store = {}) {
  const account = body.account || {};
  const ownerEmail = normalizeIdentifier(
    body.ownerEmail ||
    body.accountEmail ||
    account.email ||
    account.accountEmail ||
    body.requestedBy?.email ||
    body.submittedBy?.email,
  );
  const desktopWorker = activeDesktopWorkerFor(store, {
    email: ownerEmail,
    id: body.accountId || account.id || account.accountId,
  });
  const requestedMode = String(body.processingMode || body.processor || 'desktop_primary').trim();
  const fallbackEligible = body.fallbackEligible !== false;
  const processor = desktopWorker
    ? 'desktop'
    : (requestedMode === 'cloudflare' || requestedMode === 'cloudflare_fallback'
      ? 'cloudflare_fallback'
      : (fallbackEligible ? 'cloudflare_fallback' : 'waiting_for_desktop'));
  const fallbackReason = desktopWorker
    ? ''
    : (processor === 'cloudflare_fallback'
      ? 'no_capable_desktop_online'
      : 'desktop_required_no_worker_online');

  return {
    id: body.id || `stem_job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    songId: String(body.songId || body.librarySongId || '').trim(),
    librarySongId: String(body.librarySongId || body.songId || '').trim(),
    serviceId: String(body.serviceId || '').trim(),
    serviceName: String(body.serviceName || body.service?.name || body.service?.title || '').trim(),
    title: String(body.title || body.songTitle || 'Untitled Song').trim(),
    artist: String(body.artist || body.songArtist || '').trim(),
    sourceUrl: String(body.sourceUrl || body.file_url || body.fileUrl || body.audioUrl || body.youtubeUrl || '').trim(),
    sourceType: /(?:youtube\.com|youtu\.be)/i.test(String(body.sourceUrl || body.file_url || body.fileUrl || body.audioUrl || body.youtubeUrl || ''))
      ? 'youtube'
      : 'audio',
    ownerEmail,
    accountId: String(body.accountId || account.id || account.accountId || '').trim(),
    serviceDate: String(body.serviceDate || body.service?.date || '').trim(),
    serviceTime: String(body.serviceTime || body.service?.time || '').trim(),
    serviceEndTime: String(body.serviceEndTime || body.service?.endTime || '').trim(),
    requestedBy: {
      email: normalizeIdentifier(body.requestedBy?.email || body.submittedBy?.email || ownerEmail),
      name: String(body.requestedBy?.name || body.submittedBy?.name || body.requestedByName || 'Admin').trim(),
    },
    processor,
    processingRoute: {
      preferred: 'desktop',
      selected: processor,
      desktopOnline: Boolean(desktopWorker),
      desktopWorkerId: desktopWorker?.id || '',
      fallbackEligible,
      fallbackReason,
    },
    desktopWorkerId: desktopWorker?.id || '',
    fallbackEligible,
    fallbackReason,
    status: processor === 'desktop' ? 'queued_for_desktop' : processor,
    progress: 0,
    stems: {},
    roleStemMap: normalizeRoleStemMap(body.roleStemMap),
    retention: stemRetentionPolicy(body, store),
    localCache: {
      status: 'unknown',
      desktopWorkerId: desktopWorker?.id || '',
      cacheKey: String(body.cacheKey || '').trim(),
      localPath: '',
      externalDrive: Boolean(body.externalDrive),
      lastMatchedAt: '',
      savedAt: '',
    },
    analysis: {},
    sections: [],
    cueMarkers: [],
    readiness: {
      downloaded: false,
      separated: false,
      analyzed: false,
      mappedToRoles: false,
      approved: false,
      published: false,
    },
    reviewNotes: '',
    error: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function visibleStemJobs(store, url) {
  const status = String(url.searchParams.get('status') || 'all').trim();
  const processor = String(url.searchParams.get('processor') || '').trim();
  const ownerEmail = normalizeIdentifier(url.searchParams.get('ownerEmail') || url.searchParams.get('accountEmail') || '');
  const serviceId = String(url.searchParams.get('serviceId') || '').trim();
  return stemJobItems(store).filter((job) => (
    (status === 'all' || !status || job.status === status) &&
    (!processor || job.processor === processor) &&
    (!ownerEmail || normalizeIdentifier(job.ownerEmail) === ownerEmail) &&
    (!serviceId || job.serviceId === serviceId)
  ));
}

function findStemJob(store, url) {
  const id = String(url.searchParams.get('id') || '').trim();
  if (!id) return null;
  return stemJobItems(store).find((job) => job.id === id) || null;
}

function stemJobClaimExpired(job = {}, now = Date.now()) {
  const expiresAt = Date.parse(job.claimExpiresAt || '');
  return Boolean(job.claimedByDesktopWorkerId || job.claimedBy) && (!expiresAt || expiresAt <= now);
}

function stemJobClaimActive(job = {}, now = Date.now()) {
  return Boolean(job.claimedByDesktopWorkerId || job.claimedBy) && !stemJobClaimExpired(job, now);
}

function clearStemJobClaim(job = {}) {
  job.claimedByDesktopWorkerId = '';
  job.claimedBy = '';
  job.claimToken = '';
  job.claimedAt = '';
  job.claimExpiresAt = '';
  job.claimRenewedAt = '';
}

function stemJobPublicPayload(job = {}) {
  const expired = job.retention?.expiresAt ? Date.parse(job.retention.expiresAt) < Date.now() : false;
  const claimExpired = stemJobClaimExpired(job);
  return {
    ...job,
    expired,
    claimExpired,
    claimActive: stemJobClaimActive(job),
    desktopRequired: job.processor === 'waiting_for_desktop',
    readyForReview: ['completed', 'ready_for_review'].includes(job.status),
    readyForPlayback: ['approved', 'published'].includes(job.status) && !expired,
  };
}

function applyStemJobToSong(song, job) {
  if (!song || !job) return;
  song.songId ||= job.librarySongId || job.songId;
  song.mediaUrl ||= job.sourceUrl;
  song.audioUrl ||= job.sourceUrl;
  song.youtubeUrl ||= job.sourceType === 'youtube' ? job.sourceUrl : song.youtubeUrl;
  song.stemJobId = job.id;
  song.stemStatus = job.status;
  song.stemsUrl = job.stemsUrl || song.stemsUrl || '';
  song.assets ||= {};
  song.assets.stems = normalizeStemMap(job.stems);
  song.analysis = {
    ...(song.analysis || {}),
    ...(job.analysis || {}),
    sections: Array.isArray(job.sections) ? job.sections : (job.analysis?.sections || []),
    cueMarkers: Array.isArray(job.cueMarkers) ? job.cueMarkers : (job.analysis?.cueMarkers || []),
    roleStemMap: job.roleStemMap || {},
    stemJobId: job.id,
  };
  song.waveformPeaks = job.analysis?.waveformPeaks || job.waveformPeaks || song.waveformPeaks || null;
  song.cueMarkers = Array.isArray(job.cueMarkers) ? job.cueMarkers : song.cueMarkers || [];
  song.roleStemMap = job.roleStemMap || song.roleStemMap || {};
  song.stemReadiness = job.readiness || {};
  song.stemRetention = job.retention || {};
  song.localStemCache = job.localCache || {};
  song.updatedAt = nowIso();
}

async function handleDesktopHeartbeat(request, env, store) {
  const body = await readJson(request);
  const id = String(body.id || body.desktopId || body.workerId || '').trim() ||
    `desktop_${normalizeIdentifier(body.accountEmail || body.ownerEmail || 'account') || 'account'}`;
  store.desktopWorkers ||= {};
  store.desktopWorkers[id] = {
    ...(store.desktopWorkers[id] || {}),
    id,
    name: String(body.name || body.desktopName || 'CineStage Desktop').trim(),
    accountEmail: normalizeIdentifier(body.accountEmail || body.ownerEmail || body.email),
    accountId: String(body.accountId || '').trim(),
    status: body.status === 'offline' ? 'offline' : 'online',
    capabilities: {
      stems: body.capabilities?.stems !== false,
      demucs: body.capabilities?.demucs !== false,
      youtubeDownload: body.capabilities?.youtubeDownload !== false,
      waveform: body.capabilities?.waveform !== false,
      roleStemMap: body.capabilities?.roleStemMap !== false,
      workerMode: String(body.capabilities?.workerMode || body.workerMode || '').trim(),
      allowBackupWorker: body.capabilities?.allowBackupWorker === true || body.allowBackupWorker === true,
    },
    workerMode: String(body.workerMode || body.capabilities?.workerMode || '').trim(),
    allowBackupWorker: body.allowBackupWorker === true || body.capabilities?.allowBackupWorker === true,
    queueDepth: Math.max(0, Number(body.queueDepth || 0) || 0),
    activeJobId: String(body.activeJobId || '').trim(),
    storagePath: String(body.storagePath || body.cacheDir || '').trim(),
    brain: body.brain && typeof body.brain === 'object'
      ? {
        status: String(body.brain.status || '').trim(),
        path: String(body.brain.path || '').trim(),
        capabilities: body.brain.capabilities && typeof body.brain.capabilities === 'object'
          ? body.brain.capabilities
          : {},
        storage: body.brain.storage && typeof body.brain.storage === 'object'
          ? body.brain.storage
          : {},
      }
      : null,
    storage: body.storage && typeof body.storage === 'object'
      ? {
        cacheDir: String(body.storage.cacheDir || body.cacheDir || '').trim(),
        externalDrive: Boolean(body.storage.externalDrive),
        freeBytes: Number(body.storage.freeBytes || 0) || 0,
      }
      : {
        cacheDir: String(body.cacheDir || '').trim(),
        externalDrive: Boolean(body.externalDrive),
        freeBytes: Number(body.freeBytes || 0) || 0,
      },
    appVersion: String(body.appVersion || '').trim(),
    lastSeenAt: nowIso(),
    updatedAt: nowIso(),
  };
  await saveStore(env, store);
  return json({ ok: true, desktop: store.desktopWorkers[id] });
}

async function handleCreateStemJob(request, env, store) {
  const body = await readJson(request);
  const job = normalizeStemJob(body, store);
  if (!job.sourceUrl) return json({ ok: false, error: 'sourceUrl or YouTube URL is required' }, 400);
  store.stemJobs = stemJobItems(store);
  store.stemJobs.unshift(job);

  addSystemMessage(store, {
    from_email: job.requestedBy.email || job.ownerEmail,
    from_name: job.requestedBy.name || 'Admin',
    subject: `CineStage stem job: ${job.title}`,
    message: [
      `CineStage received "${job.title}" for stem processing.`,
      job.processor === 'desktop'
        ? 'The account desktop is online and will do the heavy processing.'
        : (job.processor === 'cloudflare_fallback'
          ? 'No capable desktop processor is online, so CineStage moved this job to the fallback lane.'
          : 'No desktop processor is currently online, and this job requires desktop processing.'),
    ].join('\n'),
    to: 'admin',
    metadata: {
      type: 'stem_job_created',
      stemJobId: job.id,
      serviceId: job.serviceId,
      processor: job.processor,
      processingRoute: job.processingRoute,
      status: job.status,
    },
  });

  await saveStore(env, store);
  return json({ ok: true, job: stemJobPublicPayload(job) });
}

async function handleUpdateStemJob(request, env, store, url) {
  const job = findStemJob(store, url);
  if (!job) return json({ ok: false, error: 'stem job not found' }, 404);
  const body = await readJson(request);
  const bodyWorkerId = String(body.desktopWorkerId || body.workerId || '').trim();
  const claimedWorkerId = String(job.claimedByDesktopWorkerId || job.claimedBy || '').trim();
  if (
    bodyWorkerId &&
    claimedWorkerId &&
    bodyWorkerId !== claimedWorkerId &&
    stemJobClaimActive(job)
  ) {
    return json({
      ok: false,
      error: 'stem job is claimed by another desktop worker',
      claimedByDesktopWorkerId: claimedWorkerId,
      claimExpiresAt: job.claimExpiresAt || '',
    }, 409);
  }
  if (stemJobClaimExpired(job)) {
    clearStemJobClaim(job);
  }
  const nextStatus = String(body.status || job.status || '').trim();
  const progress = Number(body.progress ?? job.progress ?? 0);

  Object.assign(job, {
    status: nextStatus || job.status,
    progress: Math.max(0, Math.min(100, progress || 0)),
    processor: body.processor || job.processor,
    desktopWorkerId: body.desktopWorkerId || body.workerId || job.desktopWorkerId,
    stems: Object.keys(body.stems || {}).length ? normalizeStemMap(body.stems) : job.stems,
    stemsUrl: body.stemsUrl || body.stems_url || job.stemsUrl || '',
    roleStemMap: body.roleStemMap ? normalizeRoleStemMap(body.roleStemMap) : job.roleStemMap,
    analysis: body.analysis && typeof body.analysis === 'object' ? body.analysis : job.analysis,
    sections: Array.isArray(body.sections) ? body.sections : job.sections,
    cueMarkers: Array.isArray(body.cueMarkers) ? body.cueMarkers : job.cueMarkers,
    waveformPeaks: body.waveformPeaks || job.waveformPeaks || null,
    localCache: body.localCache && typeof body.localCache === 'object'
      ? {
        ...(job.localCache || {}),
        ...body.localCache,
        desktopWorkerId: body.localCache.desktopWorkerId || body.desktopWorkerId || body.workerId || job.desktopWorkerId,
        status: body.localCache.status || job.localCache?.status || 'saved',
        updatedAt: nowIso(),
      }
      : job.localCache,
    error: String(body.error || '').trim(),
    updatedAt: nowIso(),
  });
  if (bodyWorkerId && ['processing', 'queued_for_desktop'].includes(job.status)) {
    job.claimedByDesktopWorkerId = bodyWorkerId;
    job.claimedBy = bodyWorkerId;
    job.claimRenewedAt = nowIso();
    job.claimExpiresAt = new Date(Date.now() + STEM_JOB_CLAIM_TTL_MS).toISOString();
  }
  if (['ready_for_review', 'completed', 'approved', 'published', 'failed', 'rejected', 'waiting_for_source'].includes(job.status)) {
    clearStemJobClaim(job);
  }
  job.readiness = {
    ...(job.readiness || {}),
    ...(body.readiness || {}),
    downloaded: body.readiness?.downloaded ?? job.readiness?.downloaded ?? progress > 5,
    separated: body.readiness?.separated ?? job.readiness?.separated ?? Object.keys(job.stems || {}).length > 0,
    analyzed: body.readiness?.analyzed ?? job.readiness?.analyzed ?? Boolean(job.analysis && Object.keys(job.analysis).length),
    mappedToRoles: body.readiness?.mappedToRoles ?? job.readiness?.mappedToRoles ?? Boolean(job.roleStemMap && Object.keys(job.roleStemMap).length),
  };

  await saveStore(env, store);
  return json({ ok: true, job: stemJobPublicPayload(job) });
}

async function handleClaimStemJob(request, env, store, url) {
  const body = await readJson(request);
  const job = findStemJob(store, url) || stemJobItems(store).find((candidate) => (
    candidate.status === 'queued_for_desktop' &&
    candidate.processor === 'desktop' &&
    (!body.ownerEmail || normalizeIdentifier(candidate.ownerEmail) === normalizeIdentifier(body.ownerEmail)) &&
    (!body.accountEmail || normalizeIdentifier(candidate.ownerEmail) === normalizeIdentifier(body.accountEmail)) &&
    (!body.accountId || String(candidate.accountId || '').trim() === String(body.accountId || '').trim())
  ));
  if (!job) return json({ ok: false, error: 'no queued desktop stem job found' }, 404);

  const desktopWorkerId = String(body.desktopWorkerId || body.workerId || body.id || '').trim();
  if (!desktopWorkerId) return json({ ok: false, error: 'desktopWorkerId is required' }, 400);

  if (stemJobClaimExpired(job)) {
    clearStemJobClaim(job);
    if (job.status === 'processing') {
      job.status = 'queued_for_desktop';
      job.progress = Math.min(Number(job.progress || 0), 5);
    }
  }

  const claimedWorkerId = String(job.claimedByDesktopWorkerId || job.claimedBy || '').trim();
  if (claimedWorkerId && claimedWorkerId !== desktopWorkerId && stemJobClaimActive(job)) {
    return json({
      ok: false,
      error: 'stem job is already claimed',
      job: stemJobPublicPayload(job),
    }, 409);
  }

  if (!['queued_for_desktop', 'processing'].includes(job.status)) {
    return json({ ok: false, error: `stem job is not claimable from status ${job.status}` }, 409);
  }

  const leaseMs = Math.max(
    60 * 1000,
    Math.min(60 * 60 * 1000, Number(body.leaseMs || STEM_JOB_CLAIM_TTL_MS) || STEM_JOB_CLAIM_TTL_MS),
  );
  job.processor = 'desktop';
  job.status = 'processing';
  job.progress = Math.max(Number(job.progress || 0), 1);
  job.desktopWorkerId = desktopWorkerId;
  job.claimedByDesktopWorkerId = desktopWorkerId;
  job.claimedBy = desktopWorkerId;
  job.claimToken = String(body.claimToken || `claim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`).trim();
  job.claimedAt ||= nowIso();
  job.claimRenewedAt = nowIso();
  job.claimExpiresAt = new Date(Date.now() + leaseMs).toISOString();
  job.updatedAt = nowIso();

  await saveStore(env, store);
  return json({ ok: true, job: stemJobPublicPayload(job) });
}

async function handleApproveStemJob(request, env, store, url) {
  const job = findStemJob(store, url);
  if (!job) return json({ ok: false, error: 'stem job not found' }, 404);
  const body = await readJson(request);
  job.status = 'approved';
  job.progress = 100;
  job.approvedAt = nowIso();
  job.approvedBy = body.approvedBy || null;
  job.reviewNotes = String(body.notes || body.reviewNotes || '').trim();
  job.readiness = {
    ...(job.readiness || {}),
    approved: true,
  };
  await saveStore(env, store);
  return json({ ok: true, job: stemJobPublicPayload(job) });
}

async function handlePublishStemJob(request, env, store, url) {
  const job = findStemJob(store, url);
  if (!job) return json({ ok: false, error: 'stem job not found' }, 404);
  if (!['approved', 'published'].includes(job.status)) {
    return json({ ok: false, error: 'stem job must be approved before publishing' }, 400);
  }

  const plan = job.serviceId ? store.plans?.[job.serviceId] : null;
  const planSong = findPlanSongForSync(plan?.songs || [], {
    rawSongId: job.songId,
    librarySongId: job.librarySongId,
  }) || (plan?.songs || []).find((song) => (
    job.title &&
    String(song?.title || song?.songTitle || '').trim().toLowerCase() === job.title.toLowerCase()
  ));

  const librarySongId = pickFirstNonEmpty(job.librarySongId, job.songId, planSong?.songId, planSong?.id, `song_${job.id}`);
  store.songLibrary ||= {};
  const librarySong = store.songLibrary[librarySongId] || buildLibrarySongSeed(librarySongId, {
    title: job.title,
    artist: job.artist,
    planSong,
  });
  store.songLibrary[librarySongId] = librarySong;

  applyStemJobToSong(librarySong, { ...job, librarySongId });
  applyStemJobToSong(planSong, { ...job, librarySongId });

  job.status = 'published';
  job.publishedAt = nowIso();
  job.librarySongId = librarySongId;
  const serviceEnd = serviceEndDateForStemJob(job, store);
  const deleteAfterHours = Number(job.retention?.deleteAfterServiceHours || 2) || 2;
  job.retention = {
    ...stemRetentionPolicy({ retention: job.retention || {} }, store),
    ...(job.retention || {}),
    cleanupStatus: 'scheduled',
    serviceEndedAt: serviceEnd.toISOString(),
    expiresAt: new Date(serviceEnd.getTime() + deleteAfterHours * 60 * 60 * 1000).toISOString(),
    websiteCatalogEligible: false,
  };
  job.readiness = {
    ...(job.readiness || {}),
    approved: true,
    published: true,
  };

  const recipients = teamMessageRecipients(plan?.team || []);
  if (job.serviceId && recipients.length) {
    addSystemMessage(store, {
      subject: `Practice stems ready: ${job.title}`,
      message: [
        `CineStage stems are ready for "${job.title}".`,
        'Open Playback to practice the part assigned to your role.',
      ].join('\n'),
      to: 'assigned_team',
      recipients,
      metadata: {
        type: 'stem_job_published',
        stemJobId: job.id,
        serviceId: job.serviceId,
        songId: librarySongId,
        recipientCount: recipients.length,
      },
    });
  }

  await saveStore(env, store);
  return json({ ok: true, job: stemJobPublicPayload(job), song: librarySong });
}

async function handleCleanupStemJobs(request, env, store) {
  const body = await readJson(request);
  const dryRun = body.dryRun !== false;
  const now = Date.now();
  const expiredJobs = stemJobItems(store).filter((job) => (
    job.retention?.expiresAt &&
    Date.parse(job.retention.expiresAt) <= now &&
    !['cleaned', 'archived_metadata'].includes(job.retention?.cleanupStatus)
  ));

  const cleaned = expiredJobs.map((job) => ({
    id: job.id,
    title: job.title,
    serviceId: job.serviceId,
    expiresAt: job.retention.expiresAt,
    localCache: job.localCache || {},
  }));

  if (!dryRun) {
    for (const job of expiredJobs) {
      if (env.STEM_ASSETS) {
        const objectKeys = Object.values(job.stems || {})
          .map((stem) => stem?.objectKey)
          .filter(Boolean);
        await Promise.all(objectKeys.map((objectKey) => env.STEM_ASSETS.delete(objectKey).catch(() => null)));
      }
      job.status = job.status === 'published' ? 'expired' : job.status;
      job.stems = {};
      job.stemsUrl = '';
      job.retention = {
        ...(job.retention || {}),
        cleanupStatus: 'cleaned',
        cleanedAt: nowIso(),
      };
      job.readiness = {
        ...(job.readiness || {}),
        published: false,
      };
    }
    await saveStore(env, store);
  }

  return json({ ok: true, dryRun, count: cleaned.length, jobs: cleaned });
}

async function handleRejectStemJob(request, env, store, url) {
  const job = findStemJob(store, url);
  if (!job) return json({ ok: false, error: 'stem job not found' }, 404);
  const body = await readJson(request);
  job.status = 'rejected';
  job.rejectedAt = nowIso();
  job.rejectReason = String(body.reason || body.notes || '').trim();
  await saveStore(env, store);
  return json({ ok: true, job: stemJobPublicPayload(job) });
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

function serviceReadinessFor(store, { serviceId = '', month = '' } = {}) {
  const services = serviceMapFromStore(store);
  const selectedServices = String(serviceId || '').trim()
    ? [services[String(serviceId || '').trim()]].filter(Boolean)
    : Object.values(services);
  const desktops = collectionItems(store.desktopWorkers);
  const onlineDesktopCount = desktops.filter((worker) => {
    const updated = Date.parse(worker.lastSeenAt || worker.updatedAt || '');
    return worker.status === 'online' && updated && updated >= Date.now() - (5 * 60 * 1000);
  }).length;
  const assignmentStatsPacket = assignmentStatsFor(store, { month });
  const assignmentStats = Array.isArray(assignmentStatsPacket.people)
    ? assignmentStatsPacket.people
    : Object.values(assignmentStatsPacket.byPerson || {});

  const readiness = selectedServices.map((service) => {
    const id = String(service?.id || '').trim();
    const plan = store.plans?.[id] || {};
    const songs = setlistFor(store, id);
    const team = Array.isArray(plan.team) ? plan.team : [];
    const pendingSetlist = collectionItems(store.pendingSetlists).find((entry) => (
      entry.serviceId === id && ['pending', 'rejected'].includes(entry.status)
    )) || null;
    const proposals = collectionItems(store.proposals).filter((proposal) => (
      !proposal.serviceId || proposal.serviceId === id
    ));
    const responseMap = assignmentResponseMapFor(store, id);
    const eventMap = assignmentEventMapFor(store, id);
    const pendingProposals = proposals.filter((proposal) => proposal.status === 'pending');
    const stemJobs = collectionItems(store.stemJobs)
      .filter((job) => job.serviceId === id)
      .map(stemJobPublicPayload);
    const missingCharts = songs.filter((song) => !song.hasLyrics && !song.hasChordChart);
    const missingStemSongs = songs.filter((song) => {
      const songId = String(song.id || song.songId || song.librarySongId || '').trim().toLowerCase();
      const matchingJob = stemJobs.find((job) => (
        [job.songId, job.librarySongId, job.title]
          .filter(Boolean)
          .map((value) => String(value).trim().toLowerCase())
          .includes(songId) ||
        String(job.title || '').trim().toLowerCase() === String(song.title || '').trim().toLowerCase()
      ));
      return !song.stemsUrl && !song.assets?.stems && !matchingJob?.readyForPlayback;
    });
    const assignmentRows = team.map((member) => {
      const person = findPerson(store, {
        id: member.personId,
        email: member.email,
        identifier: member.email,
      }) || {};
      const response = findAssignmentResponseForMember(responseMap, member);
      const events = findAssignmentEventsForMember(eventMap, member) || {};
      const status = response?.status || response?.response || member.status || member.response || 'pending';
      const load = assignmentStats.find((entry) => (
        (member.personId && entry.personId === member.personId) ||
        (member.email && normalizeIdentifier(entry.email) === normalizeIdentifier(member.email))
      )) || null;
      return {
        personId: member.personId || person.id || '',
        email: normalizeIdentifier(member.email || person.email),
        name: member.name || person.name || '',
        role: member.role || '',
        status,
        setlistViewed: Boolean(events.setlistViewedAt),
        setlistViewedAt: events.setlistViewedAt || '',
        setlistListened: Boolean(events.setlistListenedAt),
        setlistListenedAt: events.setlistListenedAt || '',
        listenSeconds: Number(events.listenSeconds || 0),
        monthlyAssignments: load?.total || 0,
        byRole: load?.byRole || {},
      };
    });
    const acceptedCount = assignmentRows.filter((member) => (
      ['accepted', 'confirmed', 'registered'].includes(normalizeRole(member.status))
    )).length;
    const declinedCount = assignmentRows.filter((member) => normalizeRole(member.status) === 'declined').length;
    const pendingCount = Math.max(0, assignmentRows.length - acceptedCount - declinedCount);
    const viewedCount = assignmentRows.filter((member) => member.setlistViewed).length;
    const listenedCount = assignmentRows.filter((member) => member.setlistListened).length;
    const statusChecks = {
      setlistSubmitted: Boolean(pendingSetlist) || plan.status === 'pending_approval' || plan.status === 'published',
      setlistApproved: plan.status === 'published' || service.status === 'published',
      teamAssigned: team.length > 0,
      teamConfirmed: team.length > 0 && pendingCount === 0 && declinedCount === 0,
      chartsReady: songs.length > 0 && missingCharts.length === 0,
      stemsReady: songs.length > 0 && missingStemSongs.length === 0,
      proposalsCleared: pendingProposals.length === 0,
      desktopOnline: onlineDesktopCount > 0,
      published: plan.status === 'published' || service.status === 'published',
    };
    const blocking = [];
    if (!statusChecks.teamAssigned) blocking.push('Assign at least one team member.');
    if (songs.length === 0) blocking.push('Add songs to the setlist.');
    if (pendingSetlist?.status === 'pending') blocking.push('Inspect pending setlist submission.');
    if (pendingSetlist?.status === 'rejected') blocking.push('Waiting on requested setlist changes.');
    if (pendingCount > 0) blocking.push(`${pendingCount} assignment${pendingCount === 1 ? '' : 's'} still pending.`);
    if (declinedCount > 0) blocking.push(`${declinedCount} assignment${declinedCount === 1 ? '' : 's'} declined.`);
    if (missingCharts.length > 0) blocking.push(`${missingCharts.length} song${missingCharts.length === 1 ? '' : 's'} missing lyrics/chords.`);
    if (pendingProposals.length > 0) blocking.push(`${pendingProposals.length} content proposal${pendingProposals.length === 1 ? '' : 's'} waiting for review.`);
    if (missingStemSongs.length > 0) blocking.push(`${missingStemSongs.length} song${missingStemSongs.length === 1 ? '' : 's'} missing approved stems.`);

    const scoreWeights = [
      statusChecks.teamAssigned,
      songs.length > 0,
      statusChecks.setlistApproved,
      statusChecks.teamConfirmed,
      statusChecks.chartsReady,
      statusChecks.proposalsCleared,
      statusChecks.stemsReady,
      statusChecks.desktopOnline,
    ];
    const score = Math.round((scoreWeights.filter(Boolean).length / scoreWeights.length) * 100);
    const route = onlineDesktopCount > 0 ? 'desktop' : 'cloudflare_fallback';

    return {
      serviceId: id,
      serviceName: service.name || service.title || 'Service',
      serviceDate: service.date || '',
      serviceTime: service.time || '',
      status: service.status || plan.status || 'draft',
      score,
      route,
      desktopOnline: onlineDesktopCount > 0,
      counts: {
        songs: songs.length,
        team: team.length,
        accepted: acceptedCount,
        pendingAssignments: pendingCount,
        declinedAssignments: declinedCount,
        setlistViewed: viewedCount,
        setlistNotViewed: Math.max(0, assignmentRows.length - viewedCount),
        setlistListened: listenedCount,
        setlistNotListened: Math.max(0, assignmentRows.length - listenedCount),
        missingCharts: missingCharts.length,
        pendingProposals: pendingProposals.length,
        stemJobs: stemJobs.length,
        readyStemJobs: stemJobs.filter((job) => job.readyForPlayback).length,
        missingStems: missingStemSongs.length,
      },
      assignmentTracking: assignmentTrackingFor(store, { serviceId: id }),
      statusChecks,
      blocking,
      team: assignmentRows,
      pendingSetlist,
      pendingProposals: pendingProposals.slice(0, 8),
      stemJobs,
      missingCharts: missingCharts.map((song) => ({ id: song.id, title: song.title })),
      generatedAt: nowIso(),
    };
  }).sort((a, b) => `${a.serviceDate || '9999-99-99'}T${a.serviceTime || '23:59'}`.localeCompare(`${b.serviceDate || '9999-99-99'}T${b.serviceTime || '23:59'}`));

  return {
    ok: true,
    version: 'service-readiness-v1',
    month: month || monthKeyFromDate(),
    desktop: {
      online: onlineDesktopCount > 0,
      onlineCount: onlineDesktopCount,
      totalKnown: desktops.length,
      route: onlineDesktopCount > 0 ? 'desktop' : 'cloudflare_fallback',
    },
    services: readiness,
    generatedAt: nowIso(),
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
  if (path === '/sync/auth/resend-verification') return handleResendVerification(request, env, store);
  if (path === '/sync/auth/reset-password') return handleResetPassword(request, env, store);
  if (path === '/sync/auth/change-password') return handleChangePassword(request, env, store);
  if (path === '/sync/auth/verify') return handleVerifyAuth(request, env, store);
  if (path === '/sync/auth/apple') {
    return json({ ok: false, error: 'Apple Sign In is not enabled on this sync Worker.' }, 501);
  }
  if (path === '/sync/support/auth-lookup') return handleSupportAuthLookup(request, env, store);
  if (path === '/sync/support/auth-repair') return handleSupportAuthRepair(request, env, store);
  if (path.startsWith('/sync/auth/')) {
    return json({ ok: false, error: 'Auth route not found.' }, 404);
  }

  if (path === '/sync/live-status') return handleLiveStatus(request, env, store);
  if (path === '/sync/publish') return handlePublish(request, env, store);
  if (path === '/sync/cinestage/desktop-heartbeat' || path === '/sync/desktop/heartbeat') {
    return handleDesktopHeartbeat(request, env, store);
  }
  if (path === '/sync/desktop/access') return handleDesktopAccess(request, store, url);
  if (path === '/api/brain/query' || path === '/sync/cinestage/brain/query' || path === '/sync/brain/query') {
    return handleBrainQuery(request, env, store);
  }
  if (path === '/sync/stems/upload' || path === '/sync/stem-sources/upload') {
    return handleUploadStemSource(request, env, store, url);
  }
  if (path === '/sync/stem-assets/upload') return handleUploadStemAsset(request, env, store, url);
  if (path === '/sync/stem-jobs') return handleCreateStemJob(request, env, store);
  if (path === '/sync/stem-job/claim' || path === '/sync/stem-jobs/claim') {
    return handleClaimStemJob(request, env, store, url);
  }
  if (path === '/sync/stem-job/update' || path === '/sync/stem-jobs/update') {
    return handleUpdateStemJob(request, env, store, url);
  }
  if (path === '/sync/stem-job/approve' || path === '/sync/stem-jobs/approve') {
    return handleApproveStemJob(request, env, store, url);
  }
  if (path === '/sync/stem-job/publish' || path === '/sync/stem-jobs/publish') {
    return handlePublishStemJob(request, env, store, url);
  }
  if (path === '/sync/stem-jobs/cleanup' || path === '/sync/stem-job/cleanup') {
    return handleCleanupStemJobs(request, env, store);
  }
  if (path === '/sync/stem-job/reject' || path === '/sync/stem-jobs/reject') {
    return handleRejectStemJob(request, env, store, url);
  }
  if (path === '/sync/setlist/submit') return handleSubmitSetlist(request, env, store);
  if (path === '/sync/setlist/approve') return handleApproveSetlist(request, env, store, url);
  if (path === '/sync/setlist/reject') return handleRejectSetlist(request, env, store, url);
  if (path === '/sync/services/propose') return handleProposeService(request, env, store);
  if (path === '/sync/services/approve') return handleApproveService(request, env, store, url);
  if (path === '/sync/services/reject') return handleRejectService(request, env, store, url);
  if (path === '/sync/assignment/respond' || path === '/sync/assignments/respond') {
    return handleAssignmentResponse(request, env, store);
  }
  if (path === '/sync/assignment/event' || path === '/sync/assignments/event') {
    return handleAssignmentEvent(request, env, store);
  }
  if (path === '/sync/grant' || path === '/sync/role/grant' || path === '/sync/setlist/creator') {
    const body = await readJson(request);
    const email = normalizeIdentifier(body.email);
    if (!email) return json({ ok: false, error: 'email is required' }, 400);
    store.grants ||= {};
    const existing = store.grants[email] || {};
    const hasRole = Object.prototype.hasOwnProperty.call(body, 'role');
    const nextRole = hasRole ? body.role : (existing.role || 'lead_singer');
    const actorRole = normalizeGrantRole(body.actorRole || body.grantedByRole || body.requesterRole);
    const nextRoleKey = normalizeGrantRole(nextRole);
    const existingRoleKey = normalizeGrantRole(existing.role);
    const touchesElevatedRole = isElevatedGrantRole(nextRoleKey) || isElevatedGrantRole(existingRoleKey);
    const actorIsAdmin = isAdminGrantRole(actorRole);
    if (touchesElevatedRole && !actorIsAdmin) {
      return json({
        ok: false,
        error: 'Only an Admin can grant or remove Admin, Worship Leader, or Music Director access.',
      }, 403);
    }
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

async function handleGet(request, env, store, path, url) {
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

  if (path === '/sync/cinestage/brain' || path === '/sync/brain') {
    return json(buildBrainSnapshot(store, {
      email: url.searchParams.get('email') || url.searchParams.get('accountEmail') || url.searchParams.get('ownerEmail') || '',
      id: url.searchParams.get('accountId') || '',
    }));
  }
  if (path === '/sync/desktop/access') return handleDesktopAccess(request, store, url);

  if (path === '/sync/people') return json(store.people);
  if (path === '/sync/role') {
    const email = normalizeIdentifier(url.searchParams.get('email') || '');
    const person = findPerson(store, { email, identifier: email }) || {};
    const hasGrantRecord = Boolean(email && store.grants && Object.prototype.hasOwnProperty.call(store.grants, email));
    const grant = hasGrantRecord ? store.grants[email] || {} : {};
    const user = email ? store.users?.[lookupKey(email)] || {} : {};
    const grantedRole = hasGrantRecord
      ? (grant.grantedRole || grant.role || '')
      : (user.grantedRole || person.grantedRole || '');
    const orgRole = user.orgRole || person.orgRole || person.role || '';
    const desktopRole = normalizeGrantRole(grantedRole || orgRole);
    const roles = [
      ...(Array.isArray(person.roles) ? person.roles : []),
      ...(Array.isArray(grant.roles) ? grant.roles : []),
      person.roleAssignments,
      grant.roleAssignments,
      grantedRole,
      orgRole,
    ].flatMap((role) => String(role || '').split(/[,/|]/g))
      .map((role) => role.trim())
      .filter(Boolean);

    return json({
      ok: true,
      email,
      role: grantedRole || orgRole || roles[0] || '',
      grantedRole,
      orgRole,
      roles: [...new Set(roles)],
      roleAssignments: person.roleAssignments || grant.roleAssignments || roles.join(', '),
      canCreateSetlists: Boolean(grant.canCreateSetlists || canCreateSetlist(store, person, '', {})),
      desktopRole,
      canAccessDesktop: isDesktopAccessGrantRole(desktopRole),
    });
  }
  if (path === '/sync/cinestage/desktops' || path === '/sync/desktop/workers') {
    return json(Object.values(store.desktopWorkers || {}));
  }
  if (path === '/sync/live-status') {
    return json(store.liveStatus || {
      ok: true,
      isLive: false,
      title: '',
      songTitle: '',
      sections: [],
      updatedAt: null,
    });
  }
  if (path === '/sync/stem-jobs') {
    return json(visibleStemJobs(store, url).map(stemJobPublicPayload));
  }
  if (path === '/sync/stem-job') {
    const job = findStemJob(store, url);
    if (!job) return json({ ok: false, error: 'stem job not found' }, 404);
    return json(stemJobPublicPayload(job));
  }
  if (path === '/sync/stem-assets/download') return handleDownloadStemAsset(env, store, url);
  if (path === '/sync/stem-sources/download') return handleDownloadStemSource(env, store, url);
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
  if (path === '/sync/services') return json(store.services || []);
  if (path === '/sync/services/pending') {
    const status = String(url.searchParams.get('status') || 'all').trim();
    return json((store.pendingServices || []).filter((service) => (
      status === 'all' ? true : service.status === status
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
  if (path === '/sync/assignment/responses') {
    return json(assignmentResponseMapFor(store, url.searchParams.get('serviceId') || ''));
  }
  if (path === '/sync/assignment/tracking' || path === '/sync/assignments/tracking') {
    return json(assignmentTrackingFor(store, {
      serviceId: url.searchParams.get('serviceId') || '',
    }));
  }
  if (path === '/sync/service-bundle') {
    const bundle = serviceBundleFor(store, {
      serviceId: url.searchParams.get('serviceId') || '',
      email: url.searchParams.get('email') || '',
    });
    if (!bundle) return json({ ok: false, error: 'serviceId is required' }, 400);
    return json(bundle);
  }
  if (path === '/sync/service-readiness' || path === '/sync/readiness') {
    return json(serviceReadinessFor(store, {
      serviceId: url.searchParams.get('serviceId') || '',
      month: url.searchParams.get('month') || '',
    }));
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

    if (request.method === 'GET') return handleGet(request, env, store, path, url);
    if (request.method === 'POST') return handlePost(request, env, store, path, url);
    if (request.method === 'DELETE') return json({ ok: true });

    return json({ ok: false, error: 'not found' }, 404);
  },
};
