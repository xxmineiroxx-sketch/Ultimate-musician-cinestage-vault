'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AUDIO_EXTENSIONS = new Set(['.aac', '.aif', '.aiff', '.caf', '.flac', '.m4a', '.mp3', '.mp4', '.ogg', '.opus', '.wav']);
const CHART_EXTENSIONS = new Set(['.cho', '.chordpro', '.crd', '.docx', '.md', '.pdf', '.txt']);
const STEM_TYPES = [
  'drums',
  'bass',
  'vocals',
  'lead_vocal',
  'bgv',
  'guitar',
  'electric_guitar',
  'acoustic_guitar',
  'keys',
  'piano',
  'click',
  'guide',
  'other',
];

function nowIso() {
  return new Date().toISOString();
}

function defaultHubDir() {
  return path.join(os.homedir(), 'Music', 'CineStage Stem Library');
}

function defaultIndexPath() {
  return path.join(os.homedir(), 'Library', 'Application Support', 'Ultimate Musician', 'cinestage-stem-index.json');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function safeSegment(value, fallback = 'Unknown') {
  const clean = String(value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .slice(0, 96);
  return clean || fallback;
}

function songKey({ title, artist, album, sourceId, durationSec } = {}) {
  const stable = [
    normalizeText(sourceId),
    normalizeText(artist),
    normalizeText(album),
    normalizeText(title),
    durationSec ? Math.round(Number(durationSec)) : '',
  ].join('|');
  return crypto.createHash('sha1').update(stable).digest('hex').slice(0, 16);
}

function getSongFolder(root, song = {}) {
  const artist = safeSegment(song.artist || song.band || 'Unknown Artist');
  const album = safeSegment(song.album || song.collection || 'Singles');
  const title = safeSegment(song.title || song.name || 'Untitled Song');
  return path.join(root || defaultHubDir(), artist, album, title);
}

function ensureSongWorkspace(root, song = {}) {
  const songDir = getSongFolder(root, song);
  const dirs = {
    songDir,
    originalDir: path.join(songDir, 'original'),
    stemsDir: path.join(songDir, 'stems'),
    chartsDir: path.join(songDir, 'charts'),
    metadataDir: path.join(songDir, 'metadata'),
    exportsDir: path.join(songDir, 'exports'),
  };
  Object.values(dirs).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
  return dirs;
}

function detectStemType(filePath) {
  const name = normalizeText(path.basename(filePath, path.extname(filePath))).replace(/\s+/g, '_');
  const tests = [
    ['lead_vocal', /lead[_-]?vocal|main[_-]?vocal/],
    ['bgv', /bgv|background[_-]?vocal|backing[_-]?vocal|choir/],
    ['vocals', /vocal|voice/],
    ['electric_guitar', /electric|egtr|e[_-]?gtr|lead[_-]?guitar/],
    ['acoustic_guitar', /acoustic|agtr|a[_-]?gtr/],
    ['guitar', /guitar|gtr/],
    ['keys', /keys|keyboard|synth|pad|organ/],
    ['piano', /piano/],
    ['drums', /drum|kick|snare|toms|overhead/],
    ['bass', /bass/],
    ['click', /click|metronome/],
    ['guide', /guide|cue|talkback/],
    ['other', /other|misc/],
  ];
  return tests.find(([, pattern]) => pattern.test(name))?.[0] || '';
}

function classifyFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (AUDIO_EXTENSIONS.has(ext)) {
    const stemType = detectStemType(filePath);
    return stemType ? { kind: 'stem', stemType } : { kind: 'source' };
  }
  if (CHART_EXTENSIONS.has(ext)) return { kind: 'chart' };
  if (ext === '.json') return { kind: 'metadata' };
  return { kind: 'other' };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function walkFiles(root, options = {}) {
  const maxFiles = Number(options.maxFiles || 20000);
  const maxDepth = Number(options.maxDepth || 8);
  const files = [];

  function walk(dir, depth) {
    if (files.length >= maxFiles || depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext) || CHART_EXTENSIONS.has(ext) || ext === '.json') files.push(fullPath);
      }
    }
  }

  walk(root, 0);
  return files;
}

function metadataFromFolder(root, filePath) {
  const relative = path.relative(root, filePath);
  const parts = relative.split(path.sep).filter(Boolean);
  const fileBase = safeSegment(path.basename(filePath, path.extname(filePath)), 'Untitled Song');
  return {
    artist: safeSegment(parts[0] || 'Unknown Artist'),
    album: safeSegment(parts[1] || 'Singles'),
    title: safeSegment(parts[2] && !['original', 'stems', 'charts', 'metadata', 'exports'].includes(parts[2].toLowerCase()) ? parts[2] : fileBase),
  };
}

function metadataFromProjectFolder(root, folderPath) {
  const relative = path.relative(root, folderPath);
  const parts = relative.split(path.sep).filter(Boolean);
  const folderName = safeSegment(path.basename(folderPath), 'Untitled Song');
  const parentName = safeSegment(path.basename(path.dirname(folderPath)), folderName);
  const grandparentName = safeSegment(path.basename(path.dirname(path.dirname(folderPath))), parentName);
  const rootName = safeSegment(path.basename(root), 'Local Library');
  const libraryFolderNames = new Set(['multitracks', 'stems', 'stem', 'imported', 'samples', 'tracks']);
  const folderKey = normalizeText(folderName).replace(/\s+/g, '');
  const parentKey = normalizeText(parentName).replace(/\s+/g, '');
  const title = folderKey === 'imported' && parentKey === 'samples'
    ? grandparentName
    : libraryFolderNames.has(folderKey) ? parentName : folderName;
  const album = parts.length > 1 ? safeSegment(parts[parts.length - 2], rootName) : rootName;
  return {
    artist: libraryFolderNames.has(folderKey) ? 'Local Library' : rootName,
    album,
    title,
  };
}

function mergeSongRecord(records, root, filePath) {
  const fileMeta = metadataFromFolder(root, filePath);
  const key = songKey(fileMeta);
  const existing = records.get(key) || {
    id: key,
    ...fileMeta,
    aliases: [],
    roots: new Set(),
    songDir: path.dirname(filePath),
    sourceFiles: [],
    stems: {},
    charts: [],
    metadataFiles: [],
    missing: [],
    updatedAt: nowIso(),
  };
  existing.roots.add(root);
  const classification = classifyFile(filePath);
  if (classification.kind === 'stem') {
    existing.stems[classification.stemType] = filePath;
  } else if (classification.kind === 'source') {
    existing.sourceFiles.push(filePath);
  } else if (classification.kind === 'chart') {
    existing.charts.push(filePath);
  } else if (classification.kind === 'metadata') {
    existing.metadataFiles.push(filePath);
    const metadata = readJson(filePath);
    if (metadata && typeof metadata === 'object') {
      existing.bpm = existing.bpm || metadata.bpm || metadata.tempo;
      existing.key = existing.key || metadata.key;
      existing.ccli = existing.ccli || metadata.ccli;
      existing.sourceId = existing.sourceId || metadata.sourceId || metadata.youtubeId;
    }
  }
  records.set(key, existing);
}

function mergeProjectFolderRecord(records, root, folderPath, files) {
  const fileMeta = metadataFromProjectFolder(root, folderPath);
  const key = songKey(fileMeta);
  const existing = records.get(key) || {
    id: key,
    ...fileMeta,
    aliases: [],
    roots: new Set(),
    songDir: folderPath,
    sourceFiles: [],
    stems: {},
    charts: [],
    metadataFiles: [],
    missing: [],
    updatedAt: nowIso(),
  };
  existing.roots.add(root);
  existing.songDir = folderPath;
  for (const filePath of files) {
    const classification = classifyFile(filePath);
    if (classification.kind === 'stem') {
      existing.stems[classification.stemType] = filePath;
    } else if (classification.kind === 'source') {
      existing.sourceFiles.push(filePath);
    } else if (classification.kind === 'chart') {
      existing.charts.push(filePath);
    } else if (classification.kind === 'metadata') {
      existing.metadataFiles.push(filePath);
      const metadata = readJson(filePath);
      if (metadata && typeof metadata === 'object') {
        existing.bpm = existing.bpm || metadata.bpm || metadata.tempo;
        existing.key = existing.key || metadata.key;
        existing.ccli = existing.ccli || metadata.ccli;
        existing.sourceId = existing.sourceId || metadata.sourceId || metadata.youtubeId;
      }
    }
  }
  records.set(key, existing);
}

function findProjectFolders(files) {
  const byDir = new Map();
  for (const filePath of files) {
    const dir = path.dirname(filePath);
    const group = byDir.get(dir) || [];
    group.push(filePath);
    byDir.set(dir, group);
  }

  const projectDirs = new Set();
  for (const [dir, group] of byDir.entries()) {
    const audioFiles = group.filter((filePath) => AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
    const stemTypes = new Set(audioFiles.map(detectStemType).filter(Boolean));
    const folderKey = normalizeText(path.basename(dir)).replace(/\s+/g, '');
    const looksLikeStemFolder = ['multitracks', 'stems', 'stem', 'imported', 'tracks'].includes(folderKey);
    if (audioFiles.length >= 4 && (stemTypes.size >= 2 || looksLikeStemFolder)) {
      projectDirs.add(dir);
    }
  }
  return projectDirs;
}

function finalizeRecord(record) {
  const stems = Object.fromEntries(Object.entries(record.stems).filter(([, filePath]) => fs.existsSync(filePath)));
  const missing = [];
  if (!record.bpm) missing.push('bpm');
  if (!record.key) missing.push('key');
  if (!Object.keys(stems).length) missing.push('stems');
  return {
    ...record,
    roots: Array.from(record.roots || []),
    sourceFiles: Array.from(new Set(record.sourceFiles || [])),
    stems,
    charts: Array.from(new Set(record.charts || [])),
    metadataFiles: Array.from(new Set(record.metadataFiles || [])),
    missing,
  };
}

function scanLibraryRoots(roots = [], options = {}) {
  const uniqueRoots = Array.from(new Set((roots || []).map((root) => path.resolve(String(root || ''))).filter((root) => root && fs.existsSync(root))));
  const records = new Map();
  const startedAt = nowIso();
  let filesScanned = 0;

  for (const root of uniqueRoots) {
    const files = walkFiles(root, options);
    filesScanned += files.length;
    const projectDirs = findProjectFolders(files);
    for (const projectDir of projectDirs) {
      mergeProjectFolderRecord(records, root, projectDir, files.filter((filePath) => path.dirname(filePath) === projectDir));
    }
    files
      .filter((filePath) => !projectDirs.has(path.dirname(filePath)))
      .forEach((filePath) => mergeSongRecord(records, root, filePath));
  }

  const songs = Array.from(records.values()).map(finalizeRecord);
  return {
    version: 1,
    generatedAt: nowIso(),
    startedAt,
    roots: uniqueRoots,
    filesScanned,
    songCount: songs.length,
    stemCount: songs.reduce((sum, song) => sum + Object.keys(song.stems || {}).length, 0),
    songs,
  };
}

function loadIndex(indexPath = defaultIndexPath()) {
  return readJson(indexPath) || {
    version: 1,
    generatedAt: null,
    roots: [],
    filesScanned: 0,
    songCount: 0,
    stemCount: 0,
    songs: [],
  };
}

function saveIndex(indexPath = defaultIndexPath(), index) {
  writeJson(indexPath, index);
  return index;
}

function scoreSongMatch(song, query = {}) {
  const title = normalizeText(query.title || query.name);
  const artist = normalizeText(query.artist || query.band);
  const sourceId = normalizeText(query.sourceId || query.youtubeId || query.librarySongId || query.songId);
  const songTitle = normalizeText(song.title);
  const songArtist = normalizeText(song.artist);
  const songSource = normalizeText(song.sourceId);
  let score = 0;
  if (sourceId && songSource && sourceId === songSource) score += 100;
  if (title && songTitle === title) score += 70;
  else if (title && (songTitle.includes(title) || title.includes(songTitle))) score += 40;
  if (artist && songArtist === artist) score += 30;
  else if (artist && (songArtist.includes(artist) || artist.includes(songArtist))) score += 15;
  if (Object.keys(song.stems || {}).length) score += 10;
  if (song.bpm) score += 4;
  if (song.key) score += 4;
  return score;
}

function findLibraryMatch(index, query = {}, minScore = 60) {
  const songs = Array.isArray(index?.songs) ? index.songs : [];
  const ranked = songs
    .map((song) => ({ song, score: scoreSongMatch(song, query) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return ranked[0] || null;
}

module.exports = {
  AUDIO_EXTENSIONS,
  STEM_TYPES,
  defaultHubDir,
  defaultIndexPath,
  detectStemType,
  ensureSongWorkspace,
  findLibraryMatch,
  getSongFolder,
  loadIndex,
  normalizeText,
  safeSegment,
  saveIndex,
  scanLibraryRoots,
  scoreSongMatch,
  songKey,
};
