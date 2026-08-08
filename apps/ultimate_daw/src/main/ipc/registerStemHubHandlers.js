'use strict';

const Store = require('electron-store');
const { fork } = require('child_process');
const path = require('path');
const {
  defaultHubDir,
  defaultIndexPath,
  ensureSongWorkspace,
  findLibraryMatch,
  getSongFolder,
  loadIndex,
  safeSegment,
  saveIndex,
  scanLibraryRoots,
} = require('../stemHub/libraryOrganizer');

const store = new Store({
  name: 'ultimate-musician',
  encryptionKey: 'um-desktop-2026',
});

const CONFIG_KEY = 'cinestage_stem_hub_config';
let workerProcess = null;
let workerLastExit = null;

function defaultConfig() {
  return {
    syncUrl: 'https://ultimate-playback-sync.studio-cinestage.workers.dev',
    accountEmail: '',
    accountId: '',
    desktopName: '',
    workerMode: 'account_desktop',
    libraryRoots: [defaultHubDir()],
    indexPath: defaultIndexPath(),
    folderFormat: 'artist_album_song',
    autoOrganize: true,
    searchBeforeSeparate: true,
    allowBackupWorker: false,
    allowYouTubeDownload: false,
    keepMasterStems: true,
    serviceExportTtlHours: 2,
  };
}

function readConfig() {
  return { ...defaultConfig(), ...(store.get(CONFIG_KEY) || {}) };
}

function writeConfig(nextConfig) {
  const merged = { ...readConfig(), ...(nextConfig || {}) };
  store.set(CONFIG_KEY, merged);
  return merged;
}

function workerEnvFromConfig(config) {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    UM_SYNC_URL: config.syncUrl,
    UM_ACCOUNT_EMAIL: config.accountEmail,
    UM_ACCOUNT_ID: config.accountId,
    UM_DESKTOP_NAME: config.desktopName,
    UM_STEM_LIBRARY_ROOTS: (config.libraryRoots || []).join(path.delimiter),
    UM_STEM_INDEX_PATH: config.indexPath,
    UM_STEM_ALLOW_YOUTUBE_DOWNLOAD: String(Boolean(config.allowYouTubeDownload)),
    UM_STEM_SEARCH_LIBRARY: String(config.searchBeforeSeparate !== false),
    UM_STEM_WORKER_MODE: config.workerMode,
  };
}

function workerStatus() {
  return {
    running: Boolean(workerProcess && !workerProcess.killed && workerProcess.exitCode === null),
    pid: workerProcess?.pid || null,
    lastExit: workerLastExit,
  };
}

function registerStemHubHandlers({ ipcMain, dialog }) {
  ipcMain.handle('stemHub:get-config', () => readConfig());

  ipcMain.handle('stemHub:save-config', (_event, config) => writeConfig(config));

  ipcMain.handle('stemHub:choose-library-roots', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose CineStage Stem Library Folders',
      properties: ['openDirectory', 'multiSelections', 'createDirectory'],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  ipcMain.handle('stemHub:preview-song-folder', (_event, { root, song } = {}) => {
    return {
      path: getSongFolder(root || readConfig().libraryRoots?.[0] || defaultHubDir(), song || {}),
      artist: safeSegment(song?.artist || song?.band || 'Unknown Artist'),
      album: safeSegment(song?.album || song?.collection || 'Singles'),
      title: safeSegment(song?.title || song?.name || 'Untitled Song'),
    };
  });

  ipcMain.handle('stemHub:create-song-workspace', (_event, { root, song } = {}) => {
    return ensureSongWorkspace(root || readConfig().libraryRoots?.[0] || defaultHubDir(), song || {});
  });

  ipcMain.handle('stemHub:scan-libraries', (_event, options = {}) => {
    const config = readConfig();
    const roots = options.libraryRoots || config.libraryRoots || [];
    const indexPath = options.indexPath || config.indexPath || defaultIndexPath();
    const index = scanLibraryRoots(roots, {
      maxFiles: options.maxFiles || 20000,
      maxDepth: options.maxDepth || 8,
    });
    saveIndex(indexPath, index);
    writeConfig({ libraryRoots: index.roots, indexPath });
    return index;
  });

  ipcMain.handle('stemHub:get-index', (_event, indexPath) => {
    return loadIndex(indexPath || readConfig().indexPath || defaultIndexPath());
  });

  ipcMain.handle('stemHub:find-match', (_event, query = {}) => {
    const config = readConfig();
    const index = loadIndex(config.indexPath || defaultIndexPath());
    return findLibraryMatch(index, query, query.minScore || 60);
  });

  ipcMain.handle('stemHub:worker-env', () => {
    const config = readConfig();
    const env = workerEnvFromConfig(config);
    return Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('UM_')));
  });

  ipcMain.handle('stemHub:worker-status', () => workerStatus());

  ipcMain.handle('stemHub:start-worker', () => {
    if (workerStatus().running) return workerStatus();
    const config = readConfig();
    const workerPath = path.join(__dirname, '../workers/stemJobWorker.js');
    workerProcess = fork(workerPath, [], {
      env: workerEnvFromConfig(config),
      silent: true,
    });
    workerLastExit = null;
    workerProcess.stdout?.on('data', (chunk) => {
      process.stdout.write(`[stem-hub-worker] ${chunk}`);
    });
    workerProcess.stderr?.on('data', (chunk) => {
      process.stderr.write(`[stem-hub-worker] ${chunk}`);
    });
    workerProcess.on('exit', (code, signal) => {
      workerLastExit = { code, signal, at: new Date().toISOString() };
      workerProcess = null;
    });
    return workerStatus();
  });

  ipcMain.handle('stemHub:stop-worker', () => {
    if (!workerStatus().running) return workerStatus();
    workerProcess.kill('SIGTERM');
    return workerStatus();
  });
}

module.exports = {
  CONFIG_KEY,
  defaultConfig,
  readConfig,
  registerStemHubHandlers,
  writeConfig,
};
