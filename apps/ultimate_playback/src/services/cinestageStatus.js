/**
 * CineStage Status Service - Ultimate Playback
 * Manages real-time status updates for CineStage services
 */

let _status = {
  isOnline: false,
  lastChecked: null,
  brain: null,
};

const _listeners = new Set();

export const getCineStageStatus = () => ({ ..._status });

export const setCineStageStatus = (updates) => {
  _status = { ..._status, ...updates, lastChecked: Date.now() };
  _notify();
};

export const clearCineStageStatus = () => {
  _status = { isOnline: false, lastChecked: null, brain: null };
  _notify();
};

export const subscribeToCineStageStatus = (callback) => {
  if (typeof callback !== 'function') return () => {};
  _listeners.add(callback);
  callback({ ..._status });
  return () => _listeners.delete(callback);
};

const _notify = () => {
  const currentStatus = { ..._status };
  _listeners.forEach((l) => {
    try {
      l(currentStatus);
    } catch (e) {
      console.error('Error in cinestage status listener:', e);
    }
  });
};

export default {
  getCineStageStatus,
  setCineStageStatus,
  clearCineStageStatus,
  subscribeToCineStageStatus,
};
