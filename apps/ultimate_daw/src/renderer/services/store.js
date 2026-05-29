// Wrapper around window.umDesktop.store (electron-store via IPC).
// Falls back to an in-memory map when running outside Electron (browser / dev).

const isElectron = typeof window !== 'undefined' && window.umDesktop;

const memStore = new Map();

const fallback = {
  get: async (key) => {
    const raw = memStore.get(key);
    return raw !== undefined ? raw : null;
  },
  set: async (key, value) => {
    memStore.set(key, value);
  },
  delete: async (key) => {
    memStore.delete(key);
  },
  clear: async () => {
    memStore.clear();
  },
};

export const store = {
  get: async (key) => {
    if (isElectron) {
      return window.umDesktop.store.get(key);
    }
    return fallback.get(key);
  },

  set: async (key, value) => {
    if (isElectron) {
      return window.umDesktop.store.set(key, value);
    }
    return fallback.set(key, value);
  },

  delete: async (key) => {
    if (isElectron) {
      return window.umDesktop.store.delete(key);
    }
    return fallback.delete(key);
  },

  clear: async () => {
    if (isElectron) {
      return window.umDesktop.store.clear();
    }
    return fallback.clear();
  },

  // ── Typed convenience accessors ───────────────────────────────────────────
  getUser: () => store.get('auth_user'),
  setUser: (user) => store.set('auth_user', user),

  getProfile: () => store.get('user_profile'),
  setProfile: (p) => store.set('user_profile', p),

  getAssignments: () => store.get('assignments'),
  setAssignments: (a) => store.set('assignments', a),

  getMessages: () => store.get('messages'),
  setMessages: (m) => store.set('messages', m),

  getSetlists: () => store.get('setlists'),
  setSetlists: (s) => store.set('setlists', s),

  getSongs: () => store.get('songs'),
  setSongs: (s) => store.set('songs', s),

  clearAll: () => store.clear(),
};
