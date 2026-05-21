/**
 * Unified Sync API Client
 * Thin wrapper around the sync backend with consistent error handling,
 * request timeouts, and query-string encoding. Uses syncConfig headers;
 * optional per-user token support for future migration.
 *
 * Screens can adopt this incrementally; inline fetch() calls are not
 * required to migrate immediately.
 */

import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

const DEFAULT_TIMEOUT_MS = 30000;

export class SyncAPIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'SyncAPIError';
    this.status = status;
    this.data = data;
  }
}

async function request(endpoint, options = {}) {
  const url = `${SYNC_URL}${endpoint}`;
  const { timeout = DEFAULT_TIMEOUT_MS, query, ...rest } = options;

  let fullUrl = url;
  if (query && typeof query === 'object') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }
    const qs = params.toString();
    if (qs) fullUrl += `?${qs}`;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId;
  if (controller) {
    timeoutId = setTimeout(() => controller.abort(), timeout);
  }

  try {
    const response = await fetch(fullUrl, {
      ...rest,
      headers: {
        ...syncHeaders(),
        ...(rest.headers || {}),
      },
      ...(controller ? { signal: controller.signal } : {}),
    });

    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    } else if (response.status !== 204) {
      data = await response.text().catch(() => null);
    }

    if (!response.ok) {
      throw new SyncAPIError(
        data?.error || `Request failed (${response.status})`,
        response.status,
        data,
      );
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new SyncAPIError('Request timed out', 0, null);
    }
    if (error instanceof SyncAPIError) throw error;
    throw new SyncAPIError(error.message || 'Network error', 0, null);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// HTTP verb wrappers
export function get(endpoint, options = {}) {
  return request(endpoint, { method: 'GET', ...options });
}

export function post(endpoint, body, options = {}) {
  return request(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });
}

export function put(endpoint, body, options = {}) {
  return request(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });
}

export function del(endpoint, options = {}) {
  return request(endpoint, { method: 'DELETE', ...options });
}

// Domain-specific helpers (adopted incrementally by screens)
export const getServices = () => get('/sync/services');
export const getAssignments = (email, name) =>
  get('/sync/assignments', { query: { email, ...(name && { name }) } });
export const respondToAssignment = (body) => post('/sync/assignment/respond', body);
export const getMessages = (email) => get('/sync/messages', { query: { email } });
export const getMessageReplies = (email) =>
  get('/sync/messages/replies', { query: { email } });
export const getSetlist = (serviceId) => get('/sync/setlist', { query: { serviceId } });
export const getLiveStatus = () => get('/sync/live-status');
export const sendHeartbeat = (body) => post('/sync/heartbeat', body);
export const getOrgPlan = () => get('/sync/org-plan');
export const getStems = (songId) => get('/sync/stems', { query: { songId } });
export const getAiRecommendations = (body) => post('/sync/ai/recommend', body);

export { request };
