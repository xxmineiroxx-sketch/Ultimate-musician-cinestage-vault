const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-org-id,x-secret-key',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders,
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || '').trim();
}

async function stableId(prefix, value) {
  const data = new TextEncoder().encode(String(value || prefix));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
  return `${prefix}_${hex}`;
}

async function authPayload(body = {}) {
  const identifier = normalizeIdentifier(
    body.identifier || body.email || body.phone || 'playback-user',
  );
  const email = identifier.includes('@') ? identifier : '';
  const phone = email ? '' : normalizePhone(body.phone || body.identifier);
  const name = String(body.name || email || phone || identifier || 'Playback User').trim();
  const userId = await stableId('auth', identifier);
  const personId = await stableId('person', identifier);
  const now = new Date().toISOString();

  return {
    ok: true,
    token: null,
    identifier,
    email,
    phone,
    name,
    role: null,
    grantedRole: null,
    orgRole: null,
    orgName: 'Ultimate Musician',
    roleAssignments: '',
    user: {
      id: userId,
      identifier,
      email,
      phone,
      name,
    },
    profile: {
      id: personId,
      name,
      email,
      phone,
      playbackRegistered: true,
      playbackRegisteredAt: now,
      roleAssignments: '',
      roles: [],
    },
  };
}

function emptyGetResponse(path) {
  if (path === '/sync/status' || path === '/health') {
    return json({
      ok: true,
      service: 'ultimate-playback-sync',
      version: '1.0.0',
      people: 0,
      services: 0,
      plans: 0,
      source: 'cloudflare-worker',
    });
  }

  if (
    path.includes('/messages') ||
    path.includes('/assignments') ||
    path.includes('/blockouts') ||
    path.includes('/proposals') ||
    path.includes('/song-library') ||
    path.includes('/library-pull') ||
    path.includes('/people') ||
    path.includes('/grants') ||
    path.includes('/roles')
  ) {
    return json([]);
  }

  if (
    path.includes('/role') ||
    path.includes('/org/profile') ||
    path.includes('/team-pulse') ||
    path.includes('/setlist') ||
    path.includes('/debug') ||
    path.includes('/playback-trigger')
  ) {
    return json({});
  }

  return json({ ok: true });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return json({});

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET') {
      return emptyGetResponse(path);
    }

    if (request.method === 'POST' && path.startsWith('/sync/auth/')) {
      const body = await readJson(request);
      if (path.endsWith('/forgot-password') || path.endsWith('/resend')) {
        return json({ ok: true, sent: true });
      }
      if (path.endsWith('/reset-password') || path.endsWith('/change-password')) {
        return json({ ok: true });
      }

      const identifier = normalizeIdentifier(body.identifier || body.email || body.phone);
      const password = String(body.password || body.code || body.identityToken || '');
      if (!identifier && !path.endsWith('/apple')) {
        return json({ error: 'Email or phone is required.' }, 400);
      }
      if (path.endsWith('/login') && !password) {
        return json({ error: 'Email or phone, plus password, are required.' }, 400);
      }
      return json(await authPayload(body));
    }

    if (request.method === 'POST') {
      return json({ ok: true, id: `sync_${Date.now()}` });
    }

    if (request.method === 'DELETE') {
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  },
};
