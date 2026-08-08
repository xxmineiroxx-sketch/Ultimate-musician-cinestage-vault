'use strict';

const Store = require('electron-store');
const { fork } = require('child_process');
const path = require('path');
const {
  findBrainInstallation,
  inspectBrainRoot,
} = require('../stemHub/brainInstallation');
const {
  analyzeChartRequest,
  defaultHubDir,
  defaultIndexPath,
  ensureSongWorkspace,
  findLibraryMatch,
  getSongFolder,
  loadIndex,
  prepareChartWorkspace,
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

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function savedIdentity() {
  const user = store.get('auth_user') || {};
  const profile = store.get('user_profile') || {};
  const email = normalizeIdentifier(
    profile.email ||
    user.email ||
    user.identifier,
  );
  const accountId = String(
    profile.accountId ||
    profile.orgId ||
    user.accountId ||
    user.orgId ||
    '',
  ).trim();
  const name = String(
    profile.desktopName ||
    profile.name ||
    user.name ||
    '',
  ).trim();
  return { email, accountId, name };
}

function defaultConfig() {
  const identity = savedIdentity();
  const brain = findBrainInstallation();
  return {
    syncUrl: 'https://ultimate-playback-sync.studio-cinestage.workers.dev',
    accountEmail: identity.email,
    accountId: identity.accountId,
    desktopName: identity.name ? `${identity.name} Desktop` : '',
    workerMode: 'account_desktop',
    libraryRoots: [defaultHubDir()],
    indexPath: defaultIndexPath(),
    folderFormat: 'artist_album_song',
    autoOrganize: true,
    searchBeforeSeparate: true,
    autoStartWorker: true,
    allowBackupWorker: false,
    allowYouTubeDownload: false,
    keepMasterStems: true,
    brainEnabled: Boolean(brain.selected?.installed),
    brainPath: brain.selected?.installed ? brain.selected.path : '',
    serviceExportTtlHours: 2,
  };
}

function readConfig() {
  const identity = savedIdentity();
  const saved = store.get(CONFIG_KEY) || {};
  const detectedBrain = findBrainInstallation(saved.brainPath ? [saved.brainPath] : []);
  const merged = { ...defaultConfig(), ...saved };
  const brainPath = String(merged.brainPath || detectedBrain.selected?.path || '').trim();
  const brainInstalled = brainPath ? inspectBrainRoot(brainPath).installed : false;
  return {
    ...merged,
    accountEmail: normalizeIdentifier(merged.accountEmail || identity.email),
    accountId: String(merged.accountId || identity.accountId || '').trim(),
    desktopName: String(merged.desktopName || (identity.name ? `${identity.name} Desktop` : '')).trim(),
    brainPath: brainInstalled ? brainPath : '',
    brainEnabled: saved.brainEnabled === false ? false : Boolean(brainInstalled),
  };
}

function writeConfig(nextConfig) {
  const merged = { ...readConfig(), ...(nextConfig || {}) };
  store.set(CONFIG_KEY, merged);
  return merged;
}

function workerEnvFromConfig(config) {
  const brain = config.brainPath
    ? inspectBrainRoot(config.brainPath)
    : findBrainInstallation().selected;
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
    UM_STEM_ALLOW_BACKUP_WORKER: String(Boolean(config.allowBackupWorker)),
    UM_CINESTAGE_BRAIN_ENABLED: String(Boolean(config.brainEnabled && brain?.installed)),
    UM_CINESTAGE_BRAIN_PATH: config.brainEnabled && brain?.installed ? brain.path : '',
  };
}

function workerStatus() {
  return {
    running: Boolean(workerProcess && !workerProcess.killed && workerProcess.exitCode === null),
    pid: workerProcess?.pid || null,
    lastExit: workerLastExit,
  };
}

function startStemHubWorker() {
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
}

function stopStemHubWorker() {
  if (!workerStatus().running) return workerStatus();
  workerProcess.kill('SIGTERM');
  return workerStatus();
}

function registerStemHubHandlers({ ipcMain, dialog }) {
  ipcMain.handle('stemHub:get-config', () => readConfig());

  ipcMain.handle('stemHub:save-config', (_event, config) => writeConfig(config));

  ipcMain.handle('stemHub:choose-library-roots', async (_event, options = {}) => {
    const result = await dialog.showOpenDialog({
      title: options.title || 'Choose CineStage Library Folder',
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

  ipcMain.handle('stemHub:analyze-chart-request', (_event, query = {}) => {
    const config = readConfig();
    const index = loadIndex(config.indexPath || defaultIndexPath());
    return analyzeChartRequest(index, query);
  });

  ipcMain.handle('stemHub:prepare-chart-workspace', (_event, query = {}) => {
    const config = readConfig();
    const index = loadIndex(config.indexPath || defaultIndexPath());
    return prepareChartWorkspace(config.libraryRoots?.[0] || defaultHubDir(), index, query);
  });

  ipcMain.handle('stemHub:worker-env', () => {
    const config = readConfig();
    const env = workerEnvFromConfig(config);
    return Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('UM_')));
  });

  ipcMain.handle('stemHub:worker-status', () => workerStatus());

  ipcMain.handle('stemHub:brain-status', () => {
    const config = readConfig();
    return findBrainInstallation(config.brainPath ? [config.brainPath] : []);
  });

  ipcMain.handle('stemHub:choose-brain-path', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose CineStage Brain Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) return readConfig();
    const brain = inspectBrainRoot(result.filePaths[0]);
    const saved = writeConfig({
      brainPath: brain.installed ? brain.path : result.filePaths[0],
      brainEnabled: Boolean(brain.installed),
    });
    return { config: saved, brain };
  });

  ipcMain.handle('stemHub:start-worker', () => startStemHubWorker());

  ipcMain.handle('stemHub:stop-worker', () => stopStemHubWorker());
}

module.exports = {
  CONFIG_KEY,
  defaultConfig,
  readConfig,
  registerStemHubHandlers,
  startStemHubWorker,
  stopStemHubWorker,
  writeConfig,
};
