import { SYNC_URL, CINESTAGE_URL, syncHeaders } from '../config/syncConfig';

async function handleResponse(res) {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
    } catch (_) {
      // ignore parse errors
    }
    throw new Error(message);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  login: (identifier, password) =>
    fetch(`${SYNC_URL}/sync/auth/login`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify({ identifier, password }),
    }).then(handleResponse),

  register: (data) =>
    fetch(`${SYNC_URL}/sync/auth/register`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  verifyCode: (email, code) =>
    fetch(`${SYNC_URL}/sync/auth/verify`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify({ email, code }),
    }).then(handleResponse),

  resendVerification: (email) =>
    fetch(`${SYNC_URL}/sync/auth/resend-verification`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify({ email }),
    }).then(handleResponse),

  resetPassword: (email) =>
    fetch(`${SYNC_URL}/sync/auth/reset-password`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify({ email }),
    }).then(handleResponse),

  // ── Profile ───────────────────────────────────────────────────────────────
  getProfile: () =>
    fetch(`${SYNC_URL}/sync/profile`, {
      headers: syncHeaders(),
    }).then(handleResponse),

  saveProfile: (data) =>
    fetch(`${SYNC_URL}/sync/profile`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  // ── Assignments ───────────────────────────────────────────────────────────
  getAssignments: () =>
    fetch(`${SYNC_URL}/sync/assignments`, {
      headers: syncHeaders(),
    }).then(handleResponse),

  respondToAssignment: (serviceId, role, decision) =>
    fetch(`${SYNC_URL}/sync/assignments/respond`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify({ serviceId, role, decision }),
    }).then(handleResponse),

  // ── Setlist ───────────────────────────────────────────────────────────────
  getSetlist: (serviceId) =>
    fetch(`${SYNC_URL}/sync/setlist?serviceId=${encodeURIComponent(serviceId)}`, {
      headers: syncHeaders(),
    }).then(handleResponse),

  // ── Library ───────────────────────────────────────────────────────────────
  getLibrary: () =>
    fetch(`${SYNC_URL}/sync/library-pull`, {
      headers: syncHeaders(),
    }).then(handleResponse),

  // ── Messages ──────────────────────────────────────────────────────────────
  getMessages: () =>
    fetch(`${SYNC_URL}/sync/messages`, {
      headers: syncHeaders(),
    }).then(handleResponse),

  getReplies: (messageId) =>
    fetch(`${SYNC_URL}/sync/messages/replies?messageId=${encodeURIComponent(messageId)}`, {
      headers: syncHeaders(),
    }).then(handleResponse),

  sendMessage: (data) =>
    fetch(`${SYNC_URL}/sync/messages`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  sendReply: (data) =>
    fetch(`${SYNC_URL}/sync/messages/reply`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deleteMessage: (messageId) =>
    fetch(`${SYNC_URL}/sync/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      headers: syncHeaders(),
    }).then(handleResponse),

  // ── Stems ─────────────────────────────────────────────────────────────────
  getStems: (songId) =>
    fetch(`${SYNC_URL}/sync/stems-result?songId=${encodeURIComponent(songId)}`, {
      headers: syncHeaders(),
    }).then(handleResponse),

  // ── Admin ─────────────────────────────────────────────────────────────────
  getAdminDashboard: () =>
    fetch(`${SYNC_URL}/sync/admin/dashboard`, {
      headers: syncHeaders(),
    }).then(handleResponse),

  getTeamMembers: () =>
    fetch(`${SYNC_URL}/sync/admin/team-members`, {
      headers: syncHeaders(),
    }).then(handleResponse),

  // ── CineStage ─────────────────────────────────────────────────────────────
  bootstrapBrain: () =>
    fetch(`${CINESTAGE_URL}/api/brain/bootstrap`, {
      headers: syncHeaders(),
    }).then(handleResponse),

  getBrainStatus: () =>
    fetch(`${CINESTAGE_URL}/api/brain/capabilities`, {
      headers: syncHeaders(),
    }).then(handleResponse),
};
