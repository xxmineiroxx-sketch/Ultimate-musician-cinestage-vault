'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { separateStems } = require('../ipc/registerStemHandlers');
const {
  defaultHubDir,
  defaultIndexPath,
  ensureSongWorkspace,
  findLibraryMatch,
  loadIndex,
} = require('../stemHub/libraryOrganizer');

const AUDIO_EXTENSIONS = new Set(['.aac', '.aif', '.aiff', '.caf', '.flac', '.m4a', '.mp3', '.mp4', '.ogg', '.opus', '.wav']);
const DEFAULT_SYNC_URL = 'https://ultimate-playback-sync.studio-cinestage.workers.dev';
const DEFAULT_MODEL = 'htdemucs_6s';
const DEFAULT_POLL_INTERVAL_MS = 60000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 60000;

function cleanUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function safeName(value, fallback = 'song') {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || fallback;
}

function isYouTubeUrl(value) {
  return /(?:youtube\.com|youtu\.be)/i.test(String(value || ''));
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function fileUrlToPath(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('file://')) return raw;
  try {
    return decodeURIComponent(new URL(raw).pathname);
  } catch {
    return raw.replace(/^file:\/\//, '');
  }
}

function cacheKeyFor(job = {}) {
  const stable = [
    normalizeIdentifier(job.ownerEmail),
    job.librarySongId || job.songId || '',
    job.sourceUrl || '',
    job.title || '',
    job.artist || '',
  ].join('|');
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 20);
}

function splitPathList(value) {
  return String(value || '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultRoleStemMap(stems = {}) {
  const keys = new Set(Object.keys(stems || {}).map(normalizeIdentifier));
  const map = {
    lead_vocal: ['vocals'],
    vocal: ['vocals'],
    soprano: ['vocals'],
    alto: ['vocals'],
    tenor: ['vocals'],
    acoustic_guitar: ['guitar', 'other'],
    electric_guitar: ['guitar', 'other'],
    keys: ['piano', 'other'],
    piano: ['piano'],
    bass: ['bass'],
    drums: ['drums'],
    drummer: ['drums'],
  };

  return Object.fromEntries(
    Object.entries(map)
      .map(([role, roleStems]) => [role, roleStems.filter((stem) => keys.has(stem))])
      .filter(([, roleStems]) => roleStems.length),
  );
}

function stemFilePayload(stems = {}, jobOutputDir) {
  return Object.fromEntries(
    Object.entries(stems)
      .filter(([, filePath]) => filePath && fs.existsSync(filePath))
      .map(([type, filePath]) => {
        const stat = fs.statSync(filePath);
        return [type, {
          type,
          url: `file://${filePath}`,
          path: filePath,
          name: path.basename(filePath),
          bytes: stat.size,
          delivery: 'local_cache_only',
          downloadable: false,
          preparedAt: nowIso(),
        }];
      }),
  );
}

function contentTypeForFile(filePath = '') {
  switch (path.extname(filePath).toLowerCase()) {
    case '.wav':
      return 'audio/wav';
    case '.mp3':
      return 'audio/mpeg';
    case '.m4a':
    case '.mp4':
      return 'audio/mp4';
    case '.aac':
      return 'audio/aac';
    case '.flac':
      return 'audio/flac';
    case '.ogg':
    case '.opus':
      return 'audio/ogg';
    case '.aif':
    case '.aiff':
      return 'audio/aiff';
    default:
      return 'application/octet-stream';
  }
}

function readManifest(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeManifest(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function downloadAudio(url, outputDir, title) {
  const parsed = new URL(url);
  const ext = AUDIO_EXTENSIONS.has(path.extname(parsed.pathname).toLowerCase())
    ? path.extname(parsed.pathname).toLowerCase()
    : '.mp3';
  const audioPath = path.join(outputDir, `${safeName(title, 'source')}${ext}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download source audio (${response.status})`);
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(audioPath));
  return audioPath;
}

async function resolveSourceAudio(job, outputDir, options = {}) {
  const sourceUrl = String(job.sourceUrl || job.fileUrl || job.audioUrl || '').trim();
  if (!sourceUrl) throw new Error('Stem job has no sourceUrl');

  if (isYouTubeUrl(sourceUrl) && !options.allowYouTubeDownload) {
    const error = [
      'YouTube source preparation is not configured on this desktop worker.',
      'Attach a licensed local audio file or enable a compliant downloader before processing this job.',
    ].join(' ');
    const blocker = new Error(error);
    blocker.code = 'SOURCE_PREP_REQUIRED';
    throw blocker;
  }

  if (isHttpUrl(sourceUrl)) {
    return downloadAudio(sourceUrl, outputDir, job.title);
  }

  const localPath = fileUrlToPath(sourceUrl);
  if (!fs.existsSync(localPath)) {
    const error = new Error(`Local source audio not found: ${localPath}`);
    error.code = 'SOURCE_MISSING';
    throw error;
  }
  return localPath;
}

class DesktopStemJobWorker {
  constructor(options = {}) {
    this.syncUrl = cleanUrl(options.syncUrl || process.env.UM_SYNC_URL || process.env.SYNC_URL || DEFAULT_SYNC_URL);
    this.accountEmail = normalizeIdentifier(options.accountEmail || process.env.UM_ACCOUNT_EMAIL || process.env.ACCOUNT_EMAIL);
    this.accountId = String(options.accountId || process.env.UM_ACCOUNT_ID || '').trim();
    this.desktopId = String(options.desktopId || process.env.UM_DESKTOP_ID || `desktop_${os.hostname()}`).trim();
    this.desktopName = String(options.desktopName || process.env.UM_DESKTOP_NAME || `CineStage Desktop ${os.hostname()}`).trim();
    this.cacheDir = path.resolve(options.cacheDir || process.env.UM_STEM_CACHE_DIR || path.join(os.homedir(), 'Music', 'Ultimate Musician', 'Stem Cache'));
    this.libraryRoots = options.libraryRoots || splitPathList(process.env.UM_STEM_LIBRARY_ROOTS);
    if (!this.libraryRoots.length) this.libraryRoots = [defaultHubDir()];
    this.indexPath = path.resolve(options.indexPath || process.env.UM_STEM_INDEX_PATH || defaultIndexPath());
    this.searchLibrary = options.searchLibrary ?? process.env.UM_STEM_SEARCH_LIBRARY !== 'false';
    this.workerMode = String(options.workerMode || process.env.UM_STEM_WORKER_MODE || 'account_desktop').trim();
    this.model = String(options.model || process.env.UM_STEM_MODEL || DEFAULT_MODEL).trim();
    this.pollIntervalMs = Number(options.pollIntervalMs || process.env.UM_STEM_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS);
    this.heartbeatIntervalMs = Number(options.heartbeatIntervalMs || process.env.UM_STEM_HEARTBEAT_INTERVAL_MS || DEFAULT_HEARTBEAT_INTERVAL_MS);
    this.allowYouTubeDownload = options.allowYouTubeDownload ?? process.env.UM_STEM_ALLOW_YOUTUBE_DOWNLOAD === 'true';
    this.lastHeartbeatAt = 0;
    this.processing = false;
    this.activeJobId = '';
    this.lastQueueDepth = 0;
  }

  async fetchSync(endpoint, { method = 'GET', body } = {}) {
    if (!this.syncUrl) throw new Error('UM_SYNC_URL is required');
    const response = await fetch(`${this.syncUrl}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error || `Sync request failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async heartbeat(status = 'online') {
    this.lastHeartbeatAt = Date.now();
    return this.fetchSync('/sync/cinestage/desktop-heartbeat', {
      method: 'POST',
      body: {
        id: this.desktopId,
        desktopName: this.desktopName,
        accountEmail: this.accountEmail,
        accountId: this.accountId,
        status,
        appVersion: 'ultimate_daw_worker_v2',
        activeJobId: this.activeJobId,
        queueDepth: this.lastQueueDepth,
        cacheDir: this.cacheDir,
        storage: {
          cacheDir: this.cacheDir,
          libraryRoots: this.libraryRoots,
          externalDrive: this.libraryRoots.some((root) => root !== this.cacheDir),
        },
        capabilities: {
          stems: true,
          demucs: true,
          localStemLibrary: Boolean(this.searchLibrary),
          organizeStemFolders: true,
          workerMode: this.workerMode,
          youtubeDownload: Boolean(this.allowYouTubeDownload),
          waveform: false,
          roleStemMap: true,
        },
      },
    });
  }

  async claimJob(job) {
    return this.fetchSync(`/sync/stem-job/claim?id=${encodeURIComponent(job.id)}`, {
      method: 'POST',
      body: {
        desktopWorkerId: this.desktopId,
        accountEmail: this.accountEmail,
        accountId: this.accountId,
        leaseMs: Math.max(this.heartbeatIntervalMs * 3, 5 * 60 * 1000),
      },
    });
  }

  async updateJob(jobId, payload) {
    return this.fetchSync(`/sync/stem-job/update?id=${encodeURIComponent(jobId)}`, {
      method: 'POST',
      body: {
        processor: 'desktop',
        desktopWorkerId: this.desktopId,
        ...payload,
      },
    });
  }

  async uploadStemAsset(jobId, type, stem) {
    const filePath = stem?.path || stem?.url?.replace(/^file:\/\//, '');
    if (!filePath || !fs.existsSync(filePath)) return null;

    const params = new URLSearchParams({
      id: jobId,
      type,
      filename: path.basename(filePath),
    });
    const response = await fetch(`${this.syncUrl}/sync/stem-assets/upload?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': contentTypeForFile(filePath) },
      body: fs.readFileSync(filePath),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const err = new Error(data?.error || `Stem upload failed (${response.status})`);
      err.status = response.status;
      throw err;
    }
    return data?.stem || null;
  }

  async uploadStemAssets(jobId, stems = {}) {
    const uploaded = {};
    for (const [type, stem] of Object.entries(stems)) {
      const result = await this.uploadStemAsset(jobId, type, stem);
      if (result) uploaded[type] = result;
    }
    return uploaded;
  }

  async listQueuedJobs() {
    const queuedParams = new URLSearchParams({
      processor: 'desktop',
      status: 'queued_for_desktop',
    });
    if (this.accountEmail) queuedParams.set('ownerEmail', this.accountEmail);
    const queued = await this.fetchSync(`/sync/stem-jobs?${queuedParams.toString()}`);
    const queuedJobs = Array.isArray(queued) ? queued : queued?.jobs || [];
    if (queuedJobs.length) return queuedJobs;

    const staleParams = new URLSearchParams({
      processor: 'desktop',
      status: 'processing',
    });
    if (this.accountEmail) staleParams.set('ownerEmail', this.accountEmail);
    const processing = await this.fetchSync(`/sync/stem-jobs?${staleParams.toString()}`);
    const processingJobs = Array.isArray(processing) ? processing : processing?.jobs || [];
    return processingJobs.filter((job) => job.claimExpired);
  }

  async cleanupExpiredJobs(dryRun = false) {
    return this.fetchSync('/sync/stem-jobs/cleanup', {
      method: 'POST',
      body: { dryRun },
    });
  }

  async processNextJob() {
    if (this.processing) return null;
    this.processing = true;
    try {
      const jobs = await this.listQueuedJobs();
      const queued = Array.isArray(jobs) ? jobs : jobs?.jobs || [];
      this.lastQueueDepth = queued.length;
      const job = queued[0];
      if (!job) return null;

      const claimed = await this.claimJob(job).catch((err) => {
        if (err?.status === 409 || (err?.message && /claimed/i.test(err.message))) return null;
        throw err;
      });
      const claimedJob = claimed?.job;
      if (!claimedJob) return null;

      this.activeJobId = claimedJob.id;
      await this.heartbeat('online').catch(() => null);
      await this.processJob(claimedJob);
      return claimedJob;
    } finally {
      this.activeJobId = '';
      this.processing = false;
    }
  }

  async processJob(job) {
    const key = job.localCache?.cacheKey || cacheKeyFor(job);
    const workspace = ensureSongWorkspace(this.libraryRoots[0] || this.cacheDir, {
      title: job.title,
      artist: job.artist,
      album: job.album || job.collection || 'Singles',
    });
    const jobDir = workspace.songDir || path.join(this.cacheDir, key);
    const outputDir = path.join(workspace.stemsDir || jobDir, 'demucs');
    const manifestPath = path.join(jobDir, 'manifest.json');
    const existing = readManifest(manifestPath);

    if (this.searchLibrary) {
      const index = loadIndex(this.indexPath);
      const match = findLibraryMatch(index, job, 60);
      if (match?.song?.stems && Object.keys(match.song.stems).length) {
        const localStems = stemFilePayload(match.song.stems, match.song.songDir || jobDir);
        await this.updateJob(job.id, this.readyPayload(job, localStems, match.song.songDir || jobDir, key, {
          cacheHit: true,
          deliveryMode: 'local_library',
          sourceAudioPath: match.song.sourceFiles?.[0] || '',
          externalDrive: true,
          libraryMatch: {
            id: match.song.id,
            title: match.song.title,
            artist: match.song.artist,
            album: match.song.album,
            score: match.score,
            missing: match.song.missing || [],
          },
        }));
        return;
      }
    }

    const cachedStems = existing?.deliveryStems || existing?.stems || existing?.localStems;
    if (cachedStems && Object.keys(cachedStems).length) {
      await this.updateJob(job.id, this.readyPayload(job, cachedStems, jobDir, key, {
        cacheHit: true,
        deliveryMode: existing.deliveryMode || 'local_cache_only',
        sourceAudioPath: existing.sourceAudioPath || '',
      }));
      return;
    }

    await this.updateJob(job.id, {
      status: 'processing',
      progress: 5,
      readiness: { downloaded: false, separated: false, analyzed: false, mappedToRoles: false },
    });

    try {
      const sourceAudioPath = await resolveSourceAudio(job, jobDir, {
        allowYouTubeDownload: this.allowYouTubeDownload,
      });
      await this.updateJob(job.id, {
        status: 'processing',
        progress: 20,
        readiness: { downloaded: true },
        localCache: { status: 'preparing', cacheKey: key, localPath: jobDir },
      });

      const result = await separateStems({
        audioPath: sourceAudioPath,
        outputDir,
        model: this.model,
        onProgress: (line) => {
          if (/100%|\[00:00</.test(line)) {
            this.updateJob(job.id, { status: 'processing', progress: 75 }).catch(() => {});
          }
        },
      });
      const localStems = stemFilePayload(result.stems || {}, jobDir);
      let stems = localStems;
      let deliveryMode = 'local_cache_only';
      try {
        const uploaded = await this.uploadStemAssets(job.id, localStems);
        if (Object.keys(uploaded).length) {
          stems = uploaded;
          deliveryMode = 'cloudflare_r2';
        }
      } catch (uploadErr) {
        if (![404, 501].includes(uploadErr.status)) throw uploadErr;
      }
      const manifest = {
        jobId: job.id,
        title: job.title,
        artist: job.artist,
        sourceUrl: job.sourceUrl,
        sourceAudioPath,
        model: this.model,
        cacheKey: key,
        localStems,
        deliveryStems: stems,
        deliveryMode,
        preparedAt: nowIso(),
      };
      writeManifest(manifestPath, manifest);
      writeManifest(path.join(workspace.metadataDir || path.dirname(manifestPath), 'song.json'), {
        title: job.title,
        artist: job.artist,
        album: job.album || job.collection || 'Singles',
        bpm: job.bpm || job.tempo || job.analysis?.bpm || job.analysis?.tempo || null,
        key: job.key || job.analysis?.key || null,
        sourceUrl: job.sourceUrl,
        sourceType: job.sourceType,
        model: this.model,
        cacheKey: key,
        updatedAt: nowIso(),
      });

      await this.updateJob(job.id, this.readyPayload(job, stems, jobDir, key, {
        sourceAudioPath,
        deliveryMode,
      }));
    } catch (err) {
      const waitingForSource = err.code === 'SOURCE_PREP_REQUIRED' || err.code === 'SOURCE_MISSING';
      await this.updateJob(job.id, {
        status: waitingForSource ? 'waiting_for_source' : 'failed',
        progress: waitingForSource ? 0 : 100,
        error: err.message,
        readiness: { downloaded: false, separated: false, analyzed: false, mappedToRoles: false },
        localCache: { status: 'missing', cacheKey: key, localPath: jobDir },
      });
    }
  }

  readyPayload(job, stems, jobDir, cacheKey, extra = {}) {
    const roleStemMap = Object.keys(job.roleStemMap || {}).length
      ? job.roleStemMap
      : defaultRoleStemMap(stems);
    return {
      status: 'ready_for_review',
      progress: 100,
      stems,
      roleStemMap,
      analysis: {
        ...(job.analysis || {}),
        sourceType: job.sourceType,
        model: this.model,
        cacheHit: Boolean(extra.cacheHit),
        deliveryMode: extra.deliveryMode || 'local_cache_only',
        sourceAudioPath: extra.sourceAudioPath || '',
        analyzedAt: nowIso(),
      },
      readiness: {
        downloaded: true,
        separated: Object.keys(stems || {}).length > 0,
        analyzed: true,
        mappedToRoles: Object.keys(roleStemMap || {}).length > 0,
      },
      localCache: {
        status: 'saved',
        desktopWorkerId: this.desktopId,
        cacheKey,
        localPath: jobDir,
        externalDrive: Boolean(extra.externalDrive),
        libraryMatch: extra.libraryMatch || null,
        savedAt: nowIso(),
      },
    };
  }

  async tick() {
    if (Date.now() - this.lastHeartbeatAt >= this.heartbeatIntervalMs) {
      await this.heartbeat('online');
    }
    await this.processNextJob();
    await this.cleanupExpiredJobs(false).catch(() => null);
  }

  async run({ once = false } = {}) {
    fs.mkdirSync(this.cacheDir, { recursive: true });
    await this.heartbeat('online');
    do {
      await this.tick();
      if (!once) await sleep(this.pollIntervalMs);
    } while (!once);
  }
}

if (require.main === module) {
  const worker = new DesktopStemJobWorker();
  worker.run({ once: process.env.UM_STEM_RUN_ONCE === 'true' })
    .catch(async (err) => {
      console.error(`[stem-worker] ${err.stack || err.message}`);
      await worker.heartbeat('offline').catch(() => {});
      process.exitCode = 1;
    });

  process.on('SIGINT', () => {
    worker.heartbeat('offline').finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    worker.heartbeat('offline').finally(() => process.exit(0));
  });
}

module.exports = {
  DesktopStemJobWorker,
  cacheKeyFor,
  defaultRoleStemMap,
  resolveSourceAudio,
  contentTypeForFile,
  stemFilePayload,
};
