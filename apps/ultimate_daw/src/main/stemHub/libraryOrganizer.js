'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AUDIO_EXTENSIONS = new Set(['.aac', '.aif', '.aiff', '.caf', '.flac', '.m4a', '.mp3', '.mp4', '.ogg', '.opus', '.wav']);
const CHART_EXTENSIONS = new Set(['.cho', '.chordpro', '.crd', '.docx', '.md', '.pdf', '.rtf', '.txt']);
const TEXT_CHART_EXTENSIONS = new Set(['.cho', '.chordpro', '.crd', '.md', '.rtf', '.txt']);
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
    ['bgv', /bgv|background[_-]?vocal|backing[_-]?vocal|backing|choir|soprano|contralto|tenor|vozes/],
    ['vocals', /vocal|voice|voz|guia[_-]?voz/],
    ['electric_guitar', /electric|egtr|e[_-]?gtr|eg[0-9]?|gtr|lead[_-]?guitar/],
    ['acoustic_guitar', /acoustic|agtr|a[_-]?gtr|acg|ag|violao|viola_o|viol/],
    ['guitar', /guitar|gtr|guitarra/],
    ['keys', /keys|keyboard|teclas|synth|pad|organ|piano[_-]?nord|strings|cordas|cordass|bells|arpejador|pluck/],
    ['piano', /piano/],
    ['drums', /drum|kick|snare|toms|overhead|perc|percussao|percuss_o/],
    ['bass', /bass/],
    ['click', /click|metronome|bit[_-]?[0-9]?/],
    ['guide', /guide|guia|cue|talkback/],
    ['other', /other|misc|loop|fx/],
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

function readTextChart(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_CHART_EXTENSIONS.has(ext)) return '';
  if (isIcloudDocumentPath(filePath)) return '';
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024) return '';
    const buffer = fs.readFileSync(filePath);
    let text = buffer.toString(buffer[0] === 0xff && buffer[1] === 0xfe ? 'utf16le' : 'utf8');
    if (ext === '.rtf') text = rtfToText(text);
    return text;
  } catch {
    return '';
  }
}

function isIcloudDocumentPath(filePath) {
  return String(filePath || '').includes(`${path.sep}Library${path.sep}Mobile Documents${path.sep}`);
}

function rtfToText(value) {
  return String(value || '')
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\line/g, '\n')
    .replace(/\\tab/g, ' ')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function lineHasChord(line) {
  return /(^|\s)([A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?[0-9]*(?:\/[A-G](?:#|b)?)?)(\s|$|[|)\]])/.test(line);
}

function extractChartInfo(filePath) {
  const text = readTextChart(filePath);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const chordLines = lines.filter(lineHasChord);
  const lyricLines = lines.filter((line) => !lineHasChord(line) && !/^\[.*\]$/.test(line));
  const keyMatch = text.match(/(?:^|\n)\s*(?:key|tom|tone)\s*[:=-]\s*([A-G](?:#|b)?m?)\b/i);
  const bpmMatch = text.match(/(?:^|\n)\s*(?:bpm|tempo)\s*[:=-]\s*(\d{2,3})\b/i);
  return {
    filePath,
    readable: Boolean(text),
    hasChords: chordLines.length > 0,
    hasLyrics: lyricLines.length > 2,
    detectedKey: keyMatch?.[1] || '',
    detectedBpm: bpmMatch ? Number(bpmMatch[1]) : null,
    chordLineCount: chordLines.length,
    lyricLineCount: lyricLines.length,
    preview: text ? text.slice(0, 1600) : '',
  };
}

function parseFilenameMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const rawBase = path.basename(filePath, ext)
    .replace(/\s+\d+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const parenthetical = Array.from(rawBase.matchAll(/\(([^)]*)\)/g)).map((match) => match[1].trim()).filter(Boolean);
  const parentheticalKey = parenthetical.find((value) => /^[A-G](?:#|b)?m?$/i.test(value));
  const parentheticalArtist = parenthetical.find((value) => !/^[A-G](?:#|b)?m?$/i.test(value) && !/^\d+$/.test(value));
  const baseWithoutParens = rawBase.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const rawParts = baseWithoutParens.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const noise = /^(?:base|chord chart|chart|lyrics|letra|cifra|2 column|1 column|two column|one column|pdf)$/i;
  let key = parentheticalKey || '';
  const parts = [];
  for (const part of rawParts) {
    const keyOnly = part.match(/^([A-G](?:#|b)?m?)$/i);
    const baseKey = part.match(/^base\s+([A-G](?:#|b)?m?)$/i);
    if (keyOnly) {
      key = key || keyOnly[1];
      continue;
    }
    if (baseKey) {
      key = key || baseKey[1];
      continue;
    }
    if (noise.test(part)) continue;
    parts.push(part.replace(/\s+\d+$/g, '').trim());
  }
  const title = parts[0] || rawBase;
  const artist = parts.length > 1 ? parts[1] : parentheticalArtist || 'Unknown Artist';
  return {
    artist: safeSegment(artist),
    album: 'Cifras',
    title: safeSegment(title, 'Untitled Song'),
    key,
  };
}

function bestChartForSong(song = {}) {
  const charts = Array.isArray(song.charts) ? song.charts : [];
  const ranked = charts
    .map((filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const name = normalizeText(path.basename(filePath));
      let score = 0;
      if (TEXT_CHART_EXTENSIONS.has(ext)) score += 20;
      if (name.includes('chord') || name.includes('cifra') || name.includes('chart')) score += 15;
      if (name.includes('lyrics') || name.includes('letra')) score += 10;
      if (ext === '.cho' || ext === '.chordpro') score += 12;
      return { filePath, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.filePath || charts[0] || '';
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
  const ext = path.extname(filePath).toLowerCase();
  if (parts.length <= 1 && CHART_EXTENSIONS.has(ext)) return parseFilenameMetadata(filePath);
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
  existing.key = existing.key || fileMeta.key;
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
  const charts = Array.from(new Set(record.charts || [])).filter((filePath) => fs.existsSync(filePath));
  const bestChart = bestChartForSong({ ...record, charts });
  const chartInfo = bestChart ? extractChartInfo(bestChart) : null;
  const missing = [];
  if (!record.bpm) missing.push('bpm');
  if (!record.key) missing.push('key');
  if (!Object.keys(stems).length) missing.push('stems');
  if (!charts.length) missing.push('chart');
  return {
    ...record,
    roots: Array.from(record.roots || []),
    sourceFiles: Array.from(new Set(record.sourceFiles || [])),
    stems,
    charts,
    bestChart,
    hasChart: charts.length > 0,
    hasLyrics: Boolean(chartInfo?.hasLyrics),
    hasChords: Boolean(chartInfo?.hasChords),
    detectedKey: chartInfo?.detectedKey || '',
    detectedBpm: chartInfo?.detectedBpm || null,
    chartPreview: chartInfo?.preview || '',
    metadataFiles: Array.from(new Set(record.metadataFiles || [])),
    missing,
  };
}

function hasMusicContent(record) {
  return Object.keys(record.stems || {}).length > 0 || (record.sourceFiles || []).length > 0 || (record.charts || []).length > 0;
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

  const songs = Array.from(records.values()).filter(hasMusicContent).map(finalizeRecord);
  return {
    version: 1,
    generatedAt: nowIso(),
    startedAt,
    roots: uniqueRoots,
    filesScanned,
    songCount: songs.length,
    stemCount: songs.reduce((sum, song) => sum + Object.keys(song.stems || {}).length, 0),
    chartCount: songs.reduce((sum, song) => sum + (song.charts || []).length, 0),
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
    chartCount: 0,
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
  if ((song.charts || []).length) score += 10;
  if (song.hasChords) score += 4;
  if (song.hasLyrics) score += 4;
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

function analyzeChartRequest(index, query = {}) {
  const match = findLibraryMatch(index, query, query.minScore || 35);
  const song = match?.song || null;
  const bestChart = song ? bestChartForSong(song) : '';
  const chartInfo = bestChart ? extractChartInfo(bestChart) : null;
  const detectedKey = query.key || song?.key || chartInfo?.detectedKey || '';
  const detectedBpm = query.bpm || song?.bpm || chartInfo?.detectedBpm || null;
  const missing = [];
  if (!song) missing.push('library_match');
  if (!bestChart) missing.push('chart');
  if (!detectedKey) missing.push('key');
  if (!detectedBpm) missing.push('bpm');
  if (!chartInfo?.hasChords) missing.push('chords');
  if (!chartInfo?.hasLyrics) missing.push('lyrics');

  return {
    query,
    match,
    sourcePath: bestChart,
    analysis: {
      title: song?.title || query.title || query.name || '',
      artist: song?.artist || query.artist || query.band || '',
      album: song?.album || query.album || query.collection || 'Singles',
      key: detectedKey,
      bpm: detectedBpm,
      hasChart: Boolean(bestChart),
      hasChords: Boolean(chartInfo?.hasChords),
      hasLyrics: Boolean(chartInfo?.hasLyrics),
      chordLineCount: chartInfo?.chordLineCount || 0,
      lyricLineCount: chartInfo?.lyricLineCount || 0,
      missing,
      needsReview: missing.length > 0,
      confidence: match ? Math.min(99, match.score + (chartInfo?.hasChords ? 5 : 0) + (chartInfo?.hasLyrics ? 5 : 0)) : 0,
      preview: chartInfo?.preview || '',
    },
  };
}

function prepareChartWorkspace(root, index, query = {}) {
  const result = analyzeChartRequest(index, query);
  const workspace = ensureSongWorkspace(root || defaultHubDir(), result.analysis);
  let copiedChart = '';
  if (result.sourcePath && fs.existsSync(result.sourcePath)) {
    const ext = path.extname(result.sourcePath) || '.txt';
    const base = safeSegment(path.basename(result.sourcePath, ext), 'chart');
    copiedChart = path.join(workspace.chartsDir, `${base}${ext}`);
    if (path.resolve(copiedChart) !== path.resolve(result.sourcePath)) {
      fs.copyFileSync(result.sourcePath, copiedChart);
    }
  }
  const manifest = {
    ...result.analysis,
    sourcePath: result.sourcePath,
    copiedChart,
    preparedAt: nowIso(),
  };
  writeJson(path.join(workspace.metadataDir, 'chart-analysis.json'), manifest);
  return { ...result, workspace, copiedChart, manifest };
}

module.exports = {
  AUDIO_EXTENSIONS,
  STEM_TYPES,
  analyzeChartRequest,
  bestChartForSong,
  defaultHubDir,
  defaultIndexPath,
  detectStemType,
  ensureSongWorkspace,
  extractChartInfo,
  findLibraryMatch,
  getSongFolder,
  loadIndex,
  normalizeText,
  prepareChartWorkspace,
  safeSegment,
  saveIndex,
  scanLibraryRoots,
  scoreSongMatch,
  songKey,
};
