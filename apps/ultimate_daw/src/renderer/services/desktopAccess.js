import { SYNC_URL, syncHeaders } from '../config/syncConfig';

export const DESKTOP_ACCESS_ROLES = new Set(['org_owner', 'admin', 'manager']);

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
  };

  return aliases[normalized] || normalized;
}

export function isDesktopAccessRole(role) {
  return DESKTOP_ACCESS_ROLES.has(normalizeGrantRole(role));
}

export function isExplicitDesktopAccessDenial(access = {}) {
  if (access.ok) return false;
  if (access.payload && Object.prototype.hasOwnProperty.call(access.payload, 'canAccessDesktop')) {
    return access.payload.canAccessDesktop === false;
  }
  return [
    'desktop_access_denied',
    'role_not_allowed',
    'not_allowed_desktop_role',
    'removed_desktop_access',
  ].includes(access.reason);
}

function authIdentifier(user = {}) {
  return String(user.email || user.identifier || user.phone || '').trim().toLowerCase();
}

function localRoleFromUser(user = {}) {
  return normalizeGrantRole(
    user.desktopRole ||
    user.grantedRole ||
    user.role ||
    user.orgRole ||
    user.profile?.grantedRole ||
    user.profile?.role ||
    ''
  );
}

export async function resolveDesktopAccess(user = {}) {
  const identifier = authIdentifier(user);
  const fallbackRole = localRoleFromUser(user);

  if (!identifier) {
    return {
      ok: isDesktopAccessRole(fallbackRole),
      role: fallbackRole,
      reason: fallbackRole ? 'local_role_only' : 'missing_identifier',
    };
  }

  const accessUrl = `${SYNC_URL}/sync/desktop/access?email=${encodeURIComponent(identifier)}`;
  const roleUrl = `${SYNC_URL}/sync/role?email=${encodeURIComponent(identifier)}`;
  const endpoints = [accessUrl, roleUrl];
  let lastError = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: syncHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = data?.error || `HTTP ${res.status}`;
        continue;
      }
      const role = normalizeGrantRole(
        data.desktopRole ||
        data.grantedRole ||
        data.role ||
        data.orgRole ||
        fallbackRole
      );
      const ok = Object.prototype.hasOwnProperty.call(data, 'canAccessDesktop')
        ? data.canAccessDesktop === true
        : isDesktopAccessRole(role);
      return {
        ok,
        role,
        reason: data.reason || (ok ? 'allowed_role' : 'role_not_allowed'),
        payload: data,
      };
    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    ok: false,
    role: fallbackRole,
    reason: lastError || 'desktop_access_check_failed',
  };
}

export const DESKTOP_ACCESS_DENIED_MESSAGE =
  'Ultimate DAW Desktop is only available to the Org Owner, Admins, and Worship Leaders. Ask an Admin to restore your desktop access.';
