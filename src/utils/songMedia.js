const SONG_LIBRARY_FALLBACK_FIELDS = [
  'title',
  'artist',
  'key',
  'originalKey',
  'keyMale',
  'keyFemale',
  'bpm',
  'tempo',
  'timeSig',
  'time_signature',
  'lyrics',
  'lyricsChordChart',
  'chordChart',
  'instrumentNotes',
  'instrumentSheets',
  'notes',
  'mediaNotes',
  'lightCues',
  'roleCues',
  'sections',
  'tags',
  'theme',
  'hasLyrics',
  'duration',
  'youtubeLink',
  'youtubeUrl',
  'youtube',
  'sourceUrl',
  'audioUrl',
  'mediaUrl',
  'referenceUrl',
  'referenceTrack',
  'assets',
  'latestStemsJob',
  'stems',
  'harmonies',
  'patches',
  'role_content',
  'keyboard',
  'routing',
];

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function normalizeUrl(value) {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

export function cleanMediaUrl(value) {
  return normalizeUrl(value);
}

export function isYouTubeUrl(value) {
  const url = normalizeUrl(value);
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === 'youtu.be' || host.endsWith('youtube.com');
  } catch {
    return /youtu\.be|youtube\.com/i.test(url);
  }
}

export function getPlayableMediaUrl(value) {
  const url = normalizeUrl(value);
  return url && !isYouTubeUrl(url) ? url : null;
}

function getSongMediaCandidates(song, stems = {}, harmonies = {}) {
  return [
    song?.assets?.guide_track,
    song?.audioUrl,
    song?.mediaUrl,
    song?.referenceUrl,
    song?.referenceTrack,
    song?.sourceUrl,
    song?.youtubeLink,
    song?.youtubeUrl,
    song?.youtube,
    song?.latestStemsJob?.result?.sourceUrl,
    song?.latestStemsJob?.input?.sourceUrl,
    stems?.mix,
    stems?.full_mix,
    stems?.other,
    stems?.vocals,
    harmonies?.lead_vocal,
    harmonies?.lead,
    harmonies?.voice1,
    harmonies?.soprano,
  ]
    .map(normalizeUrl)
    .filter(Boolean);
}

export function getSongMediaReferenceUrl(song, stems = {}, harmonies = {}) {
  return getSongMediaCandidates(song, stems, harmonies)[0] || null;
}

export function getDirectSongMediaUrl(song) {
  return [
    song?.assets?.guide_track,
    song?.audioUrl,
    song?.mediaUrl,
    song?.referenceUrl,
    song?.referenceTrack,
    song?.sourceUrl,
    song?.latestStemsJob?.result?.sourceUrl,
    song?.latestStemsJob?.input?.sourceUrl,
    song?.youtubeLink,
    song?.youtubeUrl,
    song?.youtube,
  ]
    .map(getPlayableMediaUrl)
    .find(Boolean) || null;
}

export function getSongLookupId(song) {
  if (!song) return '';
  return String(
    song.songId ||
    song.librarySongId ||
    song.sourceSongId ||
    song.id ||
    ''
  ).trim();
}

export function getSongStatusKey(song) {
  if (!song) return '';
  return String(
    song.serviceItemId ||
    song.id ||
    song.songId ||
    song.librarySongId ||
    ''
  ).trim();
}

export function mergeSongWithLibrary(serviceSong = {}, librarySong = null) {
  const merged = {
    ...(librarySong || {}),
    ...(serviceSong || {}),
  };

  for (const field of SONG_LIBRARY_FALLBACK_FIELDS) {
    if (!hasMeaningfulValue(serviceSong?.[field]) && librarySong && field in librarySong) {
      merged[field] = librarySong[field];
    }
  }

  merged.serviceItemId = serviceSong?.id || merged.serviceItemId || null;
  merged.librarySongId = librarySong?.id || serviceSong?.songId || merged.librarySongId || null;
  merged.songId = serviceSong?.songId || merged.librarySongId || merged.songId || null;
  merged.id = serviceSong?.id || librarySong?.id || merged.id;

  return merged;
}

export function mergeSetlistWithLibrary(setlistSongs = [], librarySongs = []) {
  const libraryById = new Map(
    (Array.isArray(librarySongs) ? librarySongs : []).map((song) => [song?.id, song])
  );

  return (Array.isArray(setlistSongs) ? setlistSongs : []).map((song, index) => {
    const librarySong = libraryById.get(song?.songId) || libraryById.get(song?.id) || null;
    const merged = mergeSongWithLibrary(song, librarySong);
    if (!hasMeaningfulValue(merged.order)) {
      merged.order = index + 1;
    }
    return merged;
  });
}

export function classifySongMediaStatus(song, result = {}) {
  const stems = result?.stems || {};
  const harmonies = result?.harmonies || {};

  const hasPlayableStem = [
    ...Object.values(stems || {}),
    ...Object.values(harmonies || {}),
  ].some((value) => !!getPlayableMediaUrl(value));

  if (hasPlayableStem) return 'available';
  if (getSongMediaReferenceUrl(song, stems, harmonies)) return 'media';
  return 'none';
}
