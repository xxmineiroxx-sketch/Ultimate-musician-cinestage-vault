const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme } = require('electron');
const path = require('path');
const { createAudioEngine } = require('../backend/audio');
const { registerAudioHandlers } = require('./ipc/registerAudioHandlers');
const { registerStoreHandlers } = require('./ipc/registerStoreHandlers');
const { registerStemHandlers } = require('./ipc/registerStemHandlers');
const { registerFileHandlers } = require('./ipc/registerFileHandlers');

nativeTheme.themeSource = 'dark';

const DEV_SERVER_URL = process.env.UM_DEV_SERVER_URL;
const RENDERER_INDEX = path.join(__dirname, '../../dist/index.html');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');

let audioEngine;
let mainWindow;

function broadcastEngineState(snapshot) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send('engine:state', snapshot);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1050,
    minWidth: 1280,
    minHeight: 780,
    backgroundColor: '#020617',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: PRELOAD_PATH,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (audioEngine) broadcastEngineState(audioEngine.getSnapshot());
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(RENDERER_INDEX);
  }

  return mainWindow;
}

// CineStage API proxy — Node.js has no CORS restrictions, so all brain requests
// route through here instead of being made directly from the renderer.
ipcMain.handle('cinestage:fetch', async (_event, { url, method = 'GET', body }) => {
  try {
    const init = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(url, init);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err.message };
  }
});

app.whenReady().then(() => {
  audioEngine = createAudioEngine();
  audioEngine.on('state', broadcastEngineState);

  registerAudioHandlers({ ipcMain, audioEngine, sendToRenderers: broadcastEngineState });
  registerStoreHandlers({ ipcMain });
  registerStemHandlers({ ipcMain });
  registerFileHandlers({ ipcMain, dialog });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (audioEngine) audioEngine.shutdown();
});
