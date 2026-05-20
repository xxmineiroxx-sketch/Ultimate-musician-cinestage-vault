/**
 * Ultimate Ecosystem Sync Server v2
 * Persists data to disk — survives restarts
 * Runs on port 8099, accessible by simulators via 10.0.0.34:8099
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'sync-data.json');

// Load persisted data or start fresh
let store = { services: [], plans: {}, people: [], messages: [], grants: {}, proposals: [], blockouts: [], assignmentResponses: {}, songLibrary: {}, authUsers: [] };
try {
  if (fs.existsSync(DATA_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    store = { ...store, ...loaded };
    // Ensure new fields exist on older data files
    if (!store.grants)              store.grants              = {};
    if (!store.proposals)           store.proposals           = [];
    if (!store.blockouts)           store.blockouts           = [];
    if (!store.assignmentResponses) store.assignmentResponses = {};
    if (!store.songLibrary)         store.songLibrary         = {};
    if (!store.authUsers)           store.authUsers           = [];
    console.log(`[boot] Loaded: ${store.services.length} services, ${store.people.length} people`);
  }
} catch (e) { console.log('[boot] Fresh start'); }

function persist() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function json(res, code, data) {
  res.writeHead(code, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type, x-org-id, x-secret-key',
    'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { reject(e); }
    });
  });
}

// Match person by email (exact) or full name or first name from email prefix
function findPerson(email) {
  if (!email) return null;
  const q = email.trim().toLowerCase();
  const namePrefix = q.split('@')[0].replace(/[._]/g, ' ');
  return store.people.find(p => {
    const pe = (p.email || '').toLowerCase();
    const pn = (p.name  || '').toLowerCase();
    return pe === q || pn === q || pn === namePrefix;
  }) || null;
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhoneLookup(value) {
  return String(value || '').replace(/\D+/g, '');
}

function passwordHash(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

function findPersonByIdentifier(identifier) {
  const id = normalizeIdentifier(identifier);
  const phone = normalizePhoneLookup(identifier);
  return (store.people || []).find(p => {
    const email = normalizeIdentifier(p.email);
    const name = normalizeIdentifier(p.name);
    const firstLast = normalizeIdentifier(`${p.name || ''} ${p.lastName || ''}`);
    const personPhone = normalizePhoneLookup(p.phone);
    return (
      (id && (email === id || name === id || firstLast === id)) ||
      (phone && personPhone && personPhone === phone)
    );
  }) || findPerson(id);
}

function findAuthUser(identifier) {
  const id = normalizeIdentifier(identifier);
  const phone = normalizePhoneLookup(identifier);
  return (store.authUsers || []).find(user => {
    const userId = normalizeIdentifier(user.identifier);
    const email = normalizeIdentifier(user.email);
    const userPhone = normalizePhoneLookup(user.phone);
    return (
      (id && (userId === id || email === id)) ||
      (phone && userPhone && userPhone === phone)
    );
  }) || null;
}

function ensurePersonFromAuth({ identifier, name, phone }) {
  let person = findPersonByIdentifier(identifier);
  if (person) return person;

  const email = normalizeIdentifier(identifier).includes('@')
    ? normalizeIdentifier(identifier)
    : '';
  person = {
    id: `person_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || email || phone || identifier || 'Team Member').trim(),
    email,
    phone: String(phone || '').trim(),
    playbackRegistered: true,
    playbackRegisteredAt: new Date().toISOString(),
    roleAssignments: '',
    roles: [],
  };
  store.people.push(person);
  return person;
}

function upsertAuthUser({ identifier, password, person, deviceId }) {
  if (!store.authUsers) store.authUsers = [];
  const normalized = normalizeIdentifier(identifier || person?.email || person?.phone);
  let user = findAuthUser(normalized);
  if (!user) {
    user = {
      id: `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      identifier: normalized,
      email: normalizeIdentifier(person?.email),
      phone: String(person?.phone || '').trim(),
      name: String(person?.name || normalized).trim(),
      passwordHash: passwordHash(password),
      deviceIds: [],
      createdAt: new Date().toISOString(),
    };
    store.authUsers.push(user);
  }
  user.identifier = user.identifier || normalized;
  user.email = normalizeIdentifier(user.email || person?.email);
  user.phone = String(user.phone || person?.phone || '').trim();
  user.name = String(person?.name || user.name || normalized).trim();
  user.passwordHash = user.passwordHash || passwordHash(password);
  user.lastLoginAt = new Date().toISOString();
  if (deviceId && !user.deviceIds.includes(deviceId)) user.deviceIds.push(deviceId);
  return user;
}

function authResponse(user, person) {
  const roles = Array.isArray(person?.roles) ? person.roles : [];
  const roleAssignments = person?.roleAssignments || roles.join(', ');
  return {
    ok: true,
    identifier: user.identifier,
    email: user.email || normalizeIdentifier(person?.email),
    phone: user.phone || person?.phone || '',
    name: user.name || person?.name || user.identifier,
    role: user.role || person?.grantedRole || null,
    grantedRole: user.grantedRole || person?.grantedRole || null,
    orgRole: user.orgRole || person?.orgRole || null,
    orgName: 'Ultimate Musician',
    roleAssignments,
    user: {
      id: user.id,
      identifier: user.identifier,
      email: user.email || normalizeIdentifier(person?.email),
      phone: user.phone || person?.phone || '',
      name: user.name || person?.name || user.identifier,
    },
    profile: person || null,
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { json(res, 200, {}); return; }

  const u    = new URL(req.url, 'http://localhost');
  const path = u.pathname;

  // ── POST /sync/auth/login ─────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/sync/auth/login') {
    try {
      const body = await readBody(req);
      const identifier = normalizeIdentifier(body.identifier);
      const password = String(body.password || '');
      if (!identifier || !password) {
        json(res, 400, { error: 'Email or phone and password are required.' });
        return;
      }

      let user = findAuthUser(identifier);
      let person = findPersonByIdentifier(identifier);

      if (user && user.passwordHash && user.passwordHash !== passwordHash(password)) {
        json(res, 401, { error: 'Invalid credentials' });
        return;
      }

      if (!user) {
        if (!person) {
          person = ensurePersonFromAuth({ identifier, name: identifier });
        }
        user = upsertAuthUser({ identifier, password, person, deviceId: body.deviceId });
      } else {
        if (!person) person = findPersonByIdentifier(user.email || user.phone || user.identifier);
        user.lastLoginAt = new Date().toISOString();
        if (body.deviceId && !user.deviceIds.includes(body.deviceId)) user.deviceIds.push(body.deviceId);
      }

      if (person) {
        person.playbackRegistered = true;
        person.playbackRegisteredAt = person.playbackRegisteredAt || new Date().toISOString();
      }
      persist();
      json(res, 200, authResponse(user, person));
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  // ── POST /sync/auth/register ──────────────────────────────────────────────
  if (req.method === 'POST' && path === '/sync/auth/register') {
    try {
      const body = await readBody(req);
      const identifier = normalizeIdentifier(body.identifier || body.email);
      const password = String(body.password || '');
      if (!identifier || !password) {
        json(res, 400, { error: 'Email and password are required.' });
        return;
      }
      if (findAuthUser(identifier)) {
        json(res, 409, { error: 'Account already exists. Please sign in.' });
        return;
      }
      const person = ensurePersonFromAuth({
        identifier,
        name: body.name,
        phone: body.phone,
      });
      person.playbackRegistered = true;
      person.playbackRegisteredAt = person.playbackRegisteredAt || new Date().toISOString();
      const user = upsertAuthUser({ identifier, password, person, deviceId: body.deviceId });
      persist();
      json(res, 200, authResponse(user, person));
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  // ── POST /sync/auth/verify and /sync/auth/resend ──────────────────────────
  if (req.method === 'POST' && (path === '/sync/auth/verify' || path === '/sync/auth/resend')) {
    try {
      const body = await readBody(req);
      const identifier = normalizeIdentifier(body.identifier);
      const user = findAuthUser(identifier);
      const person = findPersonByIdentifier(identifier);
      if (path.endsWith('/resend')) {
        json(res, 200, { ok: true });
        return;
      }
      if (!user && !person) {
        json(res, 404, { error: 'Account not found' });
        return;
      }
      json(res, 200, authResponse(user || upsertAuthUser({ identifier, password: 'temporary', person, deviceId: body.deviceId }), person));
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  // ── POST /sync/auth/forgot-password ───────────────────────────────────────
  if (req.method === 'POST' && path === '/sync/auth/forgot-password') {
    json(res, 200, { ok: true });
    return;
  }

  // ── POST /sync/auth/reset-password and /sync/auth/change-password ─────────
  if (req.method === 'POST' && (path === '/sync/auth/reset-password' || path === '/sync/auth/change-password')) {
    try {
      const body = await readBody(req);
      const identifier = normalizeIdentifier(body.identifier);
      const newPassword = String(body.newPassword || '');
      const currentPassword = String(body.currentPassword || '');
      const user = findAuthUser(identifier);
      if (!user) {
        json(res, 404, { error: 'Account not found' });
        return;
      }
      if (path.endsWith('/change-password') && user.passwordHash !== passwordHash(currentPassword)) {
        json(res, 401, { error: 'Current password is incorrect' });
        return;
      }
      if (!newPassword) {
        json(res, 400, { error: 'New password is required' });
        return;
      }
      user.passwordHash = passwordHash(newPassword);
      user.passwordUpdatedAt = new Date().toISOString();
      persist();
      json(res, 200, { ok: true });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  // ── POST /sync/publish ─────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/sync/publish') {
    try {
      const body = await readBody(req);
      // Merge services by ID so publishing one service doesn't erase others
      if (body.services) {
        for (const svc of body.services) {
          const idx = store.services.findIndex(s => s.id === svc.id);
          if (idx >= 0) store.services[idx] = svc;
          else store.services.push(svc);
        }
      }
      // Merge people by ID the same way
      if (body.people) {
        for (const person of body.people) {
          const idx = store.people.findIndex(p => p.id === person.id);
          if (idx >= 0) store.people[idx] = person;
          else store.people.push(person);
        }
      }
      if (body.plans)    Object.assign(store.plans, body.plans);
      persist();

      const peopleInfo = store.people.map(p => `${p.name}(${p.email || 'no-email'})`).join(', ');
      console.log(`\n[publish] ${store.services.length} services, ${store.people.length} people`);
      console.log(`[publish] people: ${peopleInfo}`);
      for (const [sid, plan] of Object.entries(store.plans)) {
        const team = (plan.team || []).map(t => `${t.name}/${t.role}`).join(', ');
        const songs = (plan.songs || []).map(s => s.title || s.songTitle || '?').join(', ');
        console.log(`[publish] service[${sid}] team: ${team}`);
        console.log(`[publish] service[${sid}] songs: ${songs}`);
      }
      json(res, 200, { ok: true, services: store.services.length, people: store.people.length });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  // ── GET /sync/assignments?email=xxx ────────────────────────────────────────
  if (req.method === 'GET' && path === '/sync/assignments') {
    const email = u.searchParams.get('email') || '';
    const person = findPerson(email);

    console.log(`\n[assignments] query email="${email}"`);
    console.log(`[assignments] people in store: ${store.people.map(p => p.name + '(' + (p.email||'no-email') + ')').join(', ')}`);
    console.log(`[assignments] matched person: ${person ? person.name : 'NONE'}`);

    const assignments = [];
    if (person) {
      // Build a complete service list: services array + any plan IDs not yet in services
      const serviceMap = {};
      for (const svc of store.services) serviceMap[svc.id] = svc;
      // Include orphaned plans (service published but services list was overwritten by bug)
      for (const planId of Object.keys(store.plans)) {
        if (!serviceMap[planId]) {
          serviceMap[planId] = { id: planId, name: 'Service', date: '', time: '', serviceType: 'standard' };
        }
      }

      for (const svc of Object.values(serviceMap)) {
        const plan    = store.plans[svc.id] || {};
        const team    = plan.team || [];
        // Collect ALL roles this person is assigned to for this service
        const matches = team.filter(t => t.personId === person.id);
        if (matches.length > 0) {
          assignments.push({
            id:           `${svc.id}_${person.id}`, // stable unique ID per person+service
            service_id:   svc.id,
            service_name: svc.name || svc.title || 'Service',
            service_date: svc.date,
            service_time: svc.time || '',
            service_type: svc.serviceType || 'standard',
            role:         matches[0].role,               // primary role (backward compat)
            roles:        matches.map(m => m.role),      // ALL roles for this service
            notes:        plan.notes || '',
            status:       'pending',
            readiness:    { stems_downloaded: false, parts_reviewed: false, ready_for_rehearsal: false },
          });
        }
      }
    }
    console.log(`[assignments] → ${assignments.length} results`);
    json(res, 200, assignments);
    return;
  }

  // ── GET /sync/setlist?serviceId=xxx ───────────────────────────────────────
  if (req.method === 'GET' && path === '/sync/setlist') {
    const serviceId = u.searchParams.get('serviceId') || '';
    const plan = store.plans[serviceId] || { songs: [] };
    const songs = (plan.songs || []).map((s, idx) => ({
      id:              s.id || `song_${idx}`,
      order:           idx + 1,
      title:           s.title || s.songTitle || 'Unknown',
      artist:          s.artist || '',
      key:             s.key || s.originalKey || '',
      tempo:           s.tempo || s.bpm || '',
      duration:        s.duration || '',
      lyrics:          s.lyrics || '',
      chordChart:      s.chordChart || s.chordSheet || '',
      instrumentNotes: s.instrumentNotes || {},
      notes:           s.notes || s.hint || '',
      hasLyrics:       !!(s.lyrics),
      hasChordChart:   !!(s.chordChart || s.chordSheet),
    }));
    json(res, 200, songs);
    return;
  }

  // ── POST /sync/message  (team member → admin) ────────────────────────────
  if (req.method === 'POST' && path === '/sync/message') {
    try {
      const body = await readBody(req);
      const msg = {
        id:         `msg_${Date.now()}_${Math.random().toString(36).substr(2,6)}`,
        from_email: (body.from_email || '').trim(),
        from_name:  (body.from_name  || 'Team Member').trim(),
        subject:    (body.subject    || '(no subject)').trim(),
        message:    (body.message    || '').trim(),
        to:         (body.to === 'all_team') ? 'all_team' : 'admin',
        timestamp:  new Date().toISOString(),
        read:       false,
        replies:    [],
      };
      if (!store.messages) store.messages = [];
      store.messages.unshift(msg);
      persist();
      console.log(`\n[message] from ${msg.from_name} <${msg.from_email}>: ${msg.subject}`);
      json(res, 200, { ok: true, id: msg.id });
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  // ── GET /sync/messages/admin  (Musician polls inbox) ─────────────────────
  if (req.method === 'GET' && path === '/sync/messages/admin') {
    if (!store.messages) store.messages = [];
    json(res, 200, store.messages);
    return;
  }

  // ── POST /sync/message/reply?messageId=xxx  (admin → team member) ────────
  if (req.method === 'POST' && path === '/sync/message/reply') {
    try {
      const messageId = u.searchParams.get('messageId') || '';
      const body = await readBody(req);
      const msg = (store.messages || []).find(m => m.id === messageId);
      if (!msg) { json(res, 404, { error: 'message not found' }); return; }
      const reply = {
        id:         `reply_${Date.now()}`,
        from:       (body.admin_name || 'Admin').trim(),
        message:    (body.reply_text || '').trim(),
        timestamp:  new Date().toISOString(),
      };
      msg.read = true;
      msg.replies.push(reply);
      persist();
      console.log(`\n[reply] admin → ${msg.from_name}: ${reply.message.slice(0,60)}`);
      json(res, 200, { ok: true });
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  // ── GET /sync/messages/replies?email=xxx  (Playback member polls) ─────────
  if (req.method === 'GET' && path === '/sync/messages/replies') {
    const email = (u.searchParams.get('email') || '').trim().toLowerCase();
    if (!store.messages) store.messages = [];
    // Return: messages sent by this user + broadcast messages from all team
    const mine = store.messages.filter(m =>
      (m.from_email||'').toLowerCase() === email || m.to === 'all_team'
    );
    json(res, 200, mine);
    return;
  }

  // ── GET /sync/people ──────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/sync/people') {
    json(res, 200, store.people || []);
    return;
  }

  // ── GET /sync/grants ──────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/sync/grants') {
    if (!store.grants) store.grants = {};
    const list = Object.entries(store.grants).map(([email, g]) => ({ email, ...g }));
    json(res, 200, list);
    return;
  }

  // ── POST /sync/grant  (Musician assigns MD/Admin role) ────────────────────
  if (req.method === 'POST' && path === '/sync/grant') {
    try {
      const body  = await readBody(req);
      const email = (body.email || '').trim().toLowerCase();
      if (!email) { json(res, 400, { error: 'email required' }); return; }
      if (!store.grants) store.grants = {};
      store.grants[email] = {
        name:      (body.name || email).trim(),
        role:      body.role || 'md',
        grantedAt: new Date().toISOString(),
      };
      persist();
      console.log(`\n[grant] ${email} → ${store.grants[email].role}`);
      json(res, 200, { ok: true });
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  // ── DELETE /sync/grant?email=xxx  (revoke role) ───────────────────────────
  if (req.method === 'DELETE' && path === '/sync/grant') {
    const email = (u.searchParams.get('email') || '').trim().toLowerCase();
    if (!store.grants) store.grants = {};
    delete store.grants[email];
    persist();
    console.log(`\n[grant] revoked: ${email}`);
    json(res, 200, { ok: true });
    return;
  }

  // ── GET /sync/role?email=xxx  (Playback checks own role) ─────────────────
  if (req.method === 'GET' && path === '/sync/role') {
    const email = (u.searchParams.get('email') || '').trim().toLowerCase();
    if (!store.grants) store.grants = {};
    const grant = store.grants[email];
    json(res, 200, { role: grant?.role || null, name: grant?.name || null });
    return;
  }

  // ── POST /sync/proposal  (team member proposes content edit) ─────────────
  if (req.method === 'POST' && path === '/sync/proposal') {
    try {
      const body = await readBody(req);
      if (!store.proposals) store.proposals = [];
      const proposal = {
        id:         `prop_${Date.now()}_${Math.random().toString(36).substr(2,6)}`,
        songId:     (body.songId     || '').trim(),
        serviceId:  (body.serviceId  || '').trim(),
        type:       body.type === 'chord_chart' ? 'chord_chart' : 'lyrics',
        instrument: (body.instrument || '').trim(),  // 'Keys' | 'Bass' | 'Vocals' | '' (master)
        content:    (body.content    || '').trim(),
        from_email: (body.from_email || '').trim(),
        from_name:  (body.from_name  || 'Team Member').trim(),
        songTitle:  (body.songTitle  || '').trim(),
        songArtist: (body.songArtist || '').trim(),
        status:     'pending',
        createdAt:  new Date().toISOString(),
      };
      store.proposals.unshift(proposal);
      persist();
      console.log(`\n[proposal] ${proposal.from_name}: ${proposal.type} for "${proposal.songTitle}"`);
      json(res, 200, { ok: true, id: proposal.id });
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  // ── GET /sync/proposals  (Musician reads pending proposals) ──────────────
  if (req.method === 'GET' && path === '/sync/proposals') {
    if (!store.proposals) store.proposals = [];
    const status = u.searchParams.get('status') || '';
    const list = status
      ? store.proposals.filter(p => p.status === status)
      : store.proposals;
    json(res, 200, list);
    return;
  }

  // ── POST /sync/proposal/approve?id=xxx  (Musician approves) ─────────────
  if (req.method === 'POST' && path === '/sync/proposal/approve') {
    try {
      const proposalId = u.searchParams.get('id') || '';
      if (!store.proposals) store.proposals = [];
      const proposal = store.proposals.find(p => p.id === proposalId);
      if (!proposal) { json(res, 404, { error: 'proposal not found' }); return; }
      proposal.status     = 'approved';
      proposal.approvedAt = new Date().toISOString();

      // Apply content to the service plan
      const plan     = store.plans[proposal.serviceId];
      const planSong = plan ? (plan.songs || []).find(s => s.id === proposal.songId) : null;
      if (planSong) {
        if (proposal.instrument) {
          // Instrument-specific part → goes into instrumentNotes
          if (!planSong.instrumentNotes) planSong.instrumentNotes = {};
          planSong.instrumentNotes[proposal.instrument] = proposal.content;
        } else if (proposal.type === 'lyrics') {
          planSong.lyrics = proposal.content;
        } else if (proposal.type === 'chord_chart') {
          planSong.chordChart = proposal.content;
          planSong.chordSheet = proposal.content;
        }
      }

      // Update the global song library so Musician can sync it back
      if (!store.songLibrary) store.songLibrary = {};
      if (!store.songLibrary[proposal.songId]) {
        store.songLibrary[proposal.songId] = {
          id:             proposal.songId,
          title:          proposal.songTitle  || planSong?.title  || '',
          artist:         proposal.songArtist || planSong?.artist || '',
          key:            planSong?.key  || '',
          bpm:            planSong?.bpm  || '',
          lyrics:         planSong?.lyrics     || null,
          chordChart:     planSong?.chordChart || null,
          instrumentNotes: { ...(planSong?.instrumentNotes || {}) },
          updatedAt: new Date().toISOString(),
        };
      }
      const libSong = store.songLibrary[proposal.songId];
      libSong.updatedAt = new Date().toISOString();
      if (proposal.instrument) {
        if (!libSong.instrumentNotes) libSong.instrumentNotes = {};
        libSong.instrumentNotes[proposal.instrument] = proposal.content;
      } else if (proposal.type === 'lyrics') {
        libSong.lyrics = proposal.content;
      } else {
        libSong.chordChart = proposal.content;
        libSong.chordSheet = proposal.content;
      }

      persist();
      console.log(`\n[proposal] approved: ${proposalId} (instrument: ${proposal.instrument || 'master'})`);
      json(res, 200, { ok: true });
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  // ── POST /sync/proposal/reject?id=xxx  (Musician rejects) ────────────────
  if (req.method === 'POST' && path === '/sync/proposal/reject') {
    try {
      const proposalId = u.searchParams.get('id') || '';
      const body = await readBody(req);
      if (!store.proposals) store.proposals = [];
      const proposal = store.proposals.find(p => p.id === proposalId);
      if (!proposal) { json(res, 404, { error: 'proposal not found' }); return; }
      proposal.status       = 'rejected';
      proposal.rejectedAt   = new Date().toISOString();
      proposal.rejectReason = (body.reason || '').trim();
      persist();
      console.log(`\n[proposal] rejected: ${proposalId}`);
      json(res, 200, { ok: true });
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  // ── POST /sync/blockout  (team member marks unavailability) ──────────────
  if (req.method === 'POST' && path === '/sync/blockout') {
    try {
      const body  = await readBody(req);
      const email = (body.email || '').trim().toLowerCase();
      if (!email) { json(res, 400, { error: 'email required' }); return; }
      if (!store.blockouts) store.blockouts = [];
      const entry = {
        id:         body.id || `blk_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
        email,
        name:       (body.name || email).trim(),
        date:       (body.date || '').trim(),
        reason:     (body.reason || 'Not available').trim(),
        created_at: new Date().toISOString(),
      };
      // Remove existing same email+date before adding (no duplicates)
      store.blockouts = store.blockouts.filter(b => !(b.email === email && b.date === entry.date));
      store.blockouts.push(entry);
      persist();
      console.log(`\n[blockout] ${email} blocked: ${entry.date}`);
      json(res, 200, { ok: true, id: entry.id });
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  // ── DELETE /sync/blockout  (remove by id or email+date) ──────────────────
  if (req.method === 'DELETE' && path === '/sync/blockout') {
    if (!store.blockouts) store.blockouts = [];
    const blkId = u.searchParams.get('id')    || '';
    const email = (u.searchParams.get('email') || '').trim().toLowerCase();
    const date  = u.searchParams.get('date')   || '';
    if (blkId) {
      store.blockouts = store.blockouts.filter(b => b.id !== blkId);
    } else if (email && date) {
      store.blockouts = store.blockouts.filter(b => !(b.email === email && b.date === date));
    }
    persist();
    console.log(`\n[blockout] removed: id=${blkId} email=${email} date=${date}`);
    json(res, 200, { ok: true });
    return;
  }

  // ── GET /sync/blockouts  (query blocked members — by date and/or email) ──
  if (req.method === 'GET' && path === '/sync/blockouts') {
    if (!store.blockouts) store.blockouts = [];
    const date  = u.searchParams.get('date')   || '';
    const email = (u.searchParams.get('email') || '').trim().toLowerCase();
    let result  = store.blockouts;
    if (date)  result = result.filter(b => b.date  === date);
    if (email) result = result.filter(b => b.email === email);
    json(res, 200, result);
    return;
  }

  // ── POST /sync/assignment/respond  (Playback pushes accept/decline) ──────
  if (req.method === 'POST' && path === '/sync/assignment/respond') {
    try {
      const body         = await readBody(req);
      const assignmentId = (body.assignmentId || '').trim();
      const email        = (body.email        || '').trim().toLowerCase();
      const status       = (body.status       || 'pending').trim();
      if (!assignmentId || !email) { json(res, 400, { error: 'assignmentId and email required' }); return; }
      if (!store.assignmentResponses) store.assignmentResponses = {};
      store.assignmentResponses[assignmentId] = { email, status, updatedAt: new Date().toISOString() };
      persist();
      console.log(`\n[response] ${email} → ${status} (${assignmentId})`);
      json(res, 200, { ok: true });
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  // ── GET /sync/song-library  (Musician reads approved content updates) ─────
  if (req.method === 'GET' && path === '/sync/song-library') {
    if (!store.songLibrary) store.songLibrary = {};
    const since  = u.searchParams.get('since')  || '';
    const songId = u.searchParams.get('songId') || '';
    let result = Object.values(store.songLibrary);
    if (since)  { const ts = new Date(since).getTime(); result = result.filter(s => new Date(s.updatedAt || 0).getTime() > ts); }
    if (songId) { result = result.filter(s => s.id === songId); }
    json(res, 200, result);
    return;
  }

  // ── GET /sync/assignment/responses  (AdminDashboard reads who responded) ─
  if (req.method === 'GET' && path === '/sync/assignment/responses') {
    if (!store.assignmentResponses) store.assignmentResponses = {};
    const serviceId = u.searchParams.get('serviceId') || '';
    const entries   = Object.entries(store.assignmentResponses)
      .map(([id, r]) => ({ assignmentId: id, ...r }));
    const result = serviceId
      ? entries.filter(r => r.assignmentId.startsWith(serviceId + '_') || r.assignmentId === serviceId)
      : entries;
    json(res, 200, result);
    return;
  }

  // ── GET /sync/status ──────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/sync/status') {
    json(res, 200, { ok: true, services: store.services.length, people: store.people.length, plans: Object.keys(store.plans).length });
    return;
  }

  // ── GET /sync/debug ───────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/sync/debug') {
    // Returns FULL plan data (songs + team + notes) so AdminDashboard can read/write without data loss
    json(res, 200, {
      people:   store.people,
      services: store.services,
      plans:    store.plans,
    });
    return;
  }

  json(res, 404, { error: 'not found' });
});

server.listen(8099, '0.0.0.0', () => {
  console.log('\n🎵 Sync Server → http://0.0.0.0:8099');
  console.log('   POST /sync/publish          Musician pushes data');
  console.log('   POST /sync/message          Team member sends message');
  console.log('   GET  /sync/messages/admin   Musician reads inbox');
  console.log('   POST /sync/message/reply    Admin replies to message');
  console.log('   GET  /sync/messages/replies Playback member reads replies');
  console.log('   GET  /sync/assignments   Playback pulls by email');
  console.log('   GET  /sync/setlist       Playback pulls songs');
  console.log('   GET  /sync/debug         Inspect stored data');
  console.log('   POST /sync/blockout      Team member marks unavailable date');
  console.log('   DELETE /sync/blockout    Remove blockout');
  console.log('   GET  /sync/blockouts     Query blockouts by date or email\n');
});
