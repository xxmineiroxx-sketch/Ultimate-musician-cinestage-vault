import NetInfo from '@react-native-community/netinfo';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';
import {
  enqueueRequest,
  flushQueue,
  getPendingCount,
  addQueueListener,
  removeQueueListener,
} from './apiQueue';

/**
 * syncAPI — Centralized sync API client with offline-first support
 *
 * Wraps fetch for all Ultimate Sync Server endpoints.
 * Automatically queues mutating requests when offline.
 * Returns optimistic results for UI responsiveness.
 *
 * Usage:
 *   import syncAPI from '../services/syncAPI';
 *
 *   // Online: sends immediately
 *   // Offline: queues, returns optimistic result
 *   const result = await syncAPI.post('/sync/assignment/respond', {
 *     serviceId, email, name, role, response
 *   });
 *
 *   // Query params
 *   const assignments = await syncAPI.get('/sync/assignments', { email, name });
 *
 *   // Listen for pending count changes
 *   syncAPI.onPendingCountChange(count => setBadge(count));
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

class SyncAPI {
  constructor() {
    this.baseUrl = SYNC_URL;
    this.pendingCount = 0;
    this._listeners = new Set();

    // Subscribe to queue events
    this._queueUnsub = addQueueListener((event, payload) => {
      if (event === 'pendingCountChanged') {
        this.pendingCount = payload;
        this._notifyListeners('pendingCountChanged', payload);
      }
      if (event === 'flushed') {
        this._notifyListeners('flushed', payload);
      }
    });

    // Initialize pending count
    getPendingCount().then(count => {
      this.pendingCount = count;
    });
  }

  // ── Event system ────────────────────────────────────────────────────────────

  on(event, listener) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(listener);
    return () => this.off(event, listener);
  }

  off(event, listener) {
    this._listeners.get(event)?.delete(listener);
  }

  _notifyListeners(event, payload) {
    this._listeners.get(event)?.forEach(fn => {
      try { fn(payload); } catch (e) { /* noop */ }
    });
  }

  onPendingCountChange(listener) {
    return this.on('pendingCountChanged', listener);
  }

  // ── Network check ───────────────────────────────────────────────────────────

  async isOnline() {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable !== false;
  }

  // ── Core request method ─────────────────────────────────────────────────────

  async request(method, endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const isMutating = MUTATING_METHODS.has(method.toUpperCase());
    const online = await this.isOnline();

    // For mutating requests when offline: queue and return optimistic result
    if (isMutating && !online) {
      const queuedItem = await enqueueRequest({
        method,
        url,
        headers: { ...syncHeaders(), ...options.headers },
        body: options.body,
      });

      return {
        ok: true,
        queued: true,
        queuedId: queuedItem.id,
        data: options.optimisticData || null,
        status: 202,
      };
    }

    // Online: send immediately
    const controller = new AbortController();
    const timeoutMs = options.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...syncHeaders(),
          ...options.headers,
        },
        body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else if (response.status !== 204) {
        const text = await response.text();
        data = text ? { raw: text } : null;
      }

      if (!response.ok) {
        const error = new Error(data?.error || `HTTP ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return { ok: true, queued: false, data, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);

      // Network error on mutating request: queue for retry
      if (isMutating && (error.name === 'AbortError' || !online || this._isNetworkError(error))) {
        const queuedItem = await enqueueRequest({
          method,
          url,
          headers: { ...syncHeaders(), ...options.headers },
          body: options.body,
        });

        return {
          ok: true,
          queued: true,
          queuedId: queuedItem.id,
          data: options.optimisticData || null,
          status: 202,
        };
      }

      throw error;
    }
  }

  _isNetworkError(error) {
    const msg = String(error.message || '').toLowerCase();
    return msg.includes('network') || msg.includes('fetch') || msg.includes('failed');
  }

  // ── Convenience methods ─────────────────────────────────────────────────────

  get(endpoint, queryParams = {}, options = {}) {
    const qs = new URLSearchParams();
    Object.entries(queryParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const query = qs.toString();
    const path = query ? `${endpoint}?${query}` : endpoint;
    return this.request('GET', path, options);
  }

  post(endpoint, body, options = {}) {
    return this.request('POST', endpoint, { ...options, body });
  }

  put(endpoint, body, options = {}) {
    return this.request('PUT', endpoint, { ...options, body });
  }

  patch(endpoint, body, options = {}) {
    return this.request('PATCH', endpoint, { ...options, body });
  }

  delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, options);
  }

  // ── Queue management ────────────────────────────────────────────────────────

  async flush() {
    return flushQueue();
  }

  async getPendingCount() {
    return getPendingCount();
  }
}

// Singleton instance
const syncAPI = new SyncAPI();
export default syncAPI;
