const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('umDesktop', {
  engine: {
    getSnapshot: () => ipcRenderer.invoke('engine:get-snapshot'),
    play: () => ipcRenderer.invoke('engine:play'),
    stop: () => ipcRenderer.invoke('engine:stop'),
    togglePlayback: () => ipcRenderer.invoke('engine:toggle-playback'),
    launchClip: (trackId, slotId) => ipcRenderer.invoke('engine:launch-clip', { trackId, slotId }),
    stopAllClips: () => ipcRenderer.invoke('engine:stop-all-clips'),
    setTrackVolume: (trackId, volume) => ipcRenderer.invoke('engine:set-track-volume', { trackId, volume }),
    setTrackMute: (trackId, mute) => ipcRenderer.invoke('engine:set-track-mute', { trackId, mute }),
    setTrackPan: (trackId, pan) => ipcRenderer.invoke('engine:set-track-pan', { trackId, pan }),
    seekToBar: (bar) => ipcRenderer.invoke('engine:seek-to-bar', { bar }),
    setBpm: (bpm) => ipcRenderer.invoke('engine:set-bpm', { bpm }),
    subscribe: (listener) => {
      const wrapped = (_e, snap) => listener(snap);
      ipcRenderer.on('engine:state', wrapped);
      return () => ipcRenderer.removeListener('engine:state', wrapped);
    },
  },
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    delete: (key) => ipcRenderer.invoke('store:delete', key),
    clear: () => ipcRenderer.invoke('store:clear'),
  },
  stems: {
    separate: (audioPath, outputDir, model) =>
      ipcRenderer.invoke('stems:separate', { audioPath, outputDir, model }),
    onProgress: (listener) => {
      const wrapped = (_e, data) => listener(data);
      ipcRenderer.on('stems:progress', wrapped);
      return () => ipcRenderer.removeListener('stems:progress', wrapped);
    },
  },
  file: {
    openAudio: () => ipcRenderer.invoke('file:open-audio'),
    openImage: () => ipcRenderer.invoke('file:open-image'),
    readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
    getAppDataPath: () => ipcRenderer.invoke('file:app-data-path'),
  },
  cinestage: {
    fetch: (opts) => ipcRenderer.invoke('cinestage:fetch', opts),
  },
});
