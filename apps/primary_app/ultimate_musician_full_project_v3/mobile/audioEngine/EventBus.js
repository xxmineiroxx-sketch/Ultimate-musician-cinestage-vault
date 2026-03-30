/**
 * EventBus.js
 * Lightweight event bus for React Native (no Node.js dependencies).
 * Drop-in replacement for the original Node EventEmitter version.
 */

const listeners = {};

const EventBus = {
  on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
    // Return an unsubscribe function for convenience
    return () => this.off(event, cb);
  },

  off(event, cb) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(fn => fn !== cb);
  },

  emit(event, data) {
    (listeners[event] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.warn('[EventBus]', event, e); }
    });
  },

  removeAllListeners(event) {
    if (event) {
      delete listeners[event];
    } else {
      Object.keys(listeners).forEach(k => delete listeners[k]);
    }
  },
};

export default EventBus;
