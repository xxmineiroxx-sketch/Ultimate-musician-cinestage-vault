'use strict';

const Store = require('electron-store');

const store = new Store({
  name: 'ultimate-musician',
  encryptionKey: 'um-desktop-2026',
});

/**
 * registerStoreHandlers
 * IPC handlers for persistent key-value store via electron-store.
 * @param {{ ipcMain: Electron.IpcMain }} opts
 */
function registerStoreHandlers({ ipcMain }) {
  ipcMain.handle('store:get', (_event, key) => {
    return store.get(key);
  });

  ipcMain.handle('store:set', (_event, key, value) => {
    store.set(key, value);
  });

  ipcMain.handle('store:delete', (_event, key) => {
    store.delete(key);
  });

  ipcMain.handle('store:clear', () => {
    store.clear();
  });
}

module.exports = { registerStoreHandlers };
