'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * registerFileHandlers
 * IPC handlers for file system operations.
 * @param {{ ipcMain: Electron.IpcMain, dialog: Electron.Dialog }} opts
 */
function registerFileHandlers({ ipcMain, dialog }) {
  // Open audio file picker
  ipcMain.handle('file:open-audio', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Audio File',
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'aiff', 'm4a', 'ogg'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // Open image file picker
  ipcMain.handle('file:open-image', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Image File',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // Read file as base64 string
  ipcMain.handle('file:read', (_event, filePath) => {
    const data = fs.readFileSync(filePath);
    return data.toString('base64');
  });

  // Return app userData path
  ipcMain.handle('file:app-data-path', () => {
    return app.getPath('userData');
  });
}

module.exports = { registerFileHandlers };
