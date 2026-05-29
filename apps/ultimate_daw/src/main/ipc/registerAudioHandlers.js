'use strict';

/**
 * registerAudioHandlers
 * IPC handlers for the audio engine.
 * @param {{ ipcMain: Electron.IpcMain, audioEngine: object, sendToRenderers: Function }} opts
 * @returns {Function} cleanup – removes all handlers
 */
function registerAudioHandlers({ ipcMain, audioEngine, sendToRenderers }) {
  function broadcastSnapshot() {
    sendToRenderers({ snapshot: audioEngine.getSnapshot() });
  }

  const handlers = {
    'engine:get-snapshot': async () => {
      return audioEngine.getSnapshot();
    },

    'engine:play': async () => {
      audioEngine.play();
      broadcastSnapshot();
    },

    'engine:stop': async () => {
      audioEngine.stop();
      broadcastSnapshot();
    },

    'engine:toggle-playback': async () => {
      audioEngine.togglePlayback();
      broadcastSnapshot();
    },

    'engine:launch-clip': async (_event, payload) => {
      audioEngine.launchClip(payload.trackId, payload.slotId);
      broadcastSnapshot();
    },

    'engine:stop-all-clips': async () => {
      audioEngine.stopAllClips();
      broadcastSnapshot();
    },

    'engine:set-track-volume': async (_event, payload) => {
      audioEngine.setTrackVolume(payload.trackId, payload.volume);
      broadcastSnapshot();
    },

    'engine:set-track-mute': async (_event, payload) => {
      audioEngine.setTrackMute(payload.trackId, payload.mute);
      broadcastSnapshot();
    },

    'engine:set-track-pan': async (_event, payload) => {
      audioEngine.setTrackPan(payload.trackId, payload.pan);
      broadcastSnapshot();
    },

    'engine:seek-to-bar': async (_event, payload) => {
      audioEngine.seekToBar(payload.bar);
      broadcastSnapshot();
    },

    'engine:set-bpm': async (_event, payload) => {
      audioEngine.setBpm(payload.bpm);
      broadcastSnapshot();
    },
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }

  return function cleanup() {
    for (const channel of Object.keys(handlers)) {
      ipcMain.removeHandler(channel);
    }
  };
}

module.exports = { registerAudioHandlers };
