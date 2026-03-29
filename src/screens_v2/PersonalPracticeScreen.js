/**
 * Personal Practice Screen - Ultimate Playback
 * Each member gets their own personalized practice experience based on role:
 *   - Vocalists   → Instrument bed + their harmony part
 *   - Instruments → Full Mix track    + their isolated stem
 *   - Non-performers (sound/media/tech) → single playback reference track
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  RefreshControl,
  Linking,
} from 'react-native';
import audioEngine from '../services/audioEngine';
import { getUserProfile, getAssignments } from '../services/storage';
import { SYNC_URL, SYNC_ORG_ID, SYNC_SECRET_KEY } from '../../config/syncConfig';
import WaveformBar from '../components_v2/WaveformBar';
import {
  getDirectSongMediaUrl,
  getPlayableMediaUrl,
  getSongLookupId,
  getSongMediaReferenceUrl,
  isYouTubeUrl,
  mergeSetlistWithLibrary,
} from '../utils/songMedia';

const { width } = Dimensions.get('window');

// ─── Role classification ────────────────────────────────────────────────────

const VOCAL_ROLES = new Set([
  'worship_leader', 'lead_vocal', 'bgv_1', 'bgv_2', 'bgv_3', 'music_director',
]);

const SOUND_TECH_ROLES = new Set([
  'sound_tech', 'foh_engineer', 'monitor_engineer', 'stream_engineer',
]);

const PLAYBACK_ONLY_ROLES = new Set([
  ...SOUND_TECH_ROLES,
  'media_tech', 'propresenter', 'lighting', 'stage_manager',
]);

const INSTRUMENT_STEM_MAP = {
  keyboard: 'keys', piano: 'keys', synth: 'keys',
  electric_guitar: 'guitar', acoustic_guitar: 'guitar', rhythm_guitar: 'guitar',
  bass: 'bass',
  drums: 'drums', percussion: 'drums',
  strings: 'other', brass: 'other',
};

// Preferred harmony key candidates for each vocal role (try in order)
const HARMONY_CANDIDATES = {
  bgv_1:          ['voice1', 'soprano', 'bgv1'],
  bgv_2:          ['voice2', 'alto',    'bgv2'],
  bgv_3:          ['voice3', 'tenor',   'bgv3'],
  worship_leader: ['lead_vocal', 'voice1', 'soprano'],
  lead_vocal:     ['lead_vocal', 'voice1', 'soprano'],
  music_director: ['voice1', 'soprano'],
};

const ROLE_DISPLAY = {
  worship_leader: 'Worship Leader', lead_vocal: 'Lead Vocal',
  bgv_1: 'BG Vocal 1', bgv_2: 'BG Vocal 2', bgv_3: 'BG Vocal 3',
  music_director: 'Music Director',
  keyboard: 'Keys', piano: 'Piano', synth: 'Synth',
  electric_guitar: 'Electric Guitar', acoustic_guitar: 'Acoustic Guitar', rhythm_guitar: 'Rhythm Guitar',
  bass: 'Bass', drums: 'Drums', percussion: 'Percussion',
  strings: 'Strings', brass: 'Brass',
  sound_tech: 'Sound Tech',
  foh_engineer: 'FOH Engineer',
  monitor_engineer: 'Monitor Engineer',
  stream_engineer: 'Stream Engineer',
  media_tech: 'Media',
  propresenter: 'Media',
  lighting: 'Lighting',
  stage_manager: 'Stage Manager',
};

const STEM_ALIAS_MAP = {
  keys: ['keys', 'keyboard', 'piano', 'synth', 'teclas'],
  guitar: ['guitar', 'guitars', 'electric_guitar', 'acoustic_guitar', 'rhythm_guitar', 'violao', 'gtr'],
  bass: ['bass', 'baixo'],
  drums: ['drums', 'drum', 'percussion', 'bateria'],
  vocals: ['vocals', 'vocal', 'lead_vocal', 'lead', 'voz'],
  lead_vocal: ['lead_vocal', 'lead', 'vocals', 'vocal_lead'],
  voice1: ['voice1', 'soprano', 'bgv1'],
  voice2: ['voice2', 'alto', 'contralto', 'bgv2'],
  voice3: ['voice3', 'tenor', 'bgv3'],
  soprano: ['soprano', 'voice1', 'bgv1'],
  alto: ['alto', 'contralto', 'voice2', 'bgv2'],
  tenor: ['tenor', 'voice3', 'bgv3'],
  other: ['other', 'instrumental', 'band'],
};

const NON_PRACTICE_STEM_KEYS = new Set([
  'mix',
  'full_mix',
  'full_song',
  'click',
  'guide',
  'pad',
]);

// Maps UM title-case role strings → internal snake_case keys
const ROLE_NORMALIZE_MAP = {
  leader: 'worship_leader',
  'worship leader': 'worship_leader',
  'music director': 'music_director',
  'vocal lead': 'lead_vocal',
  'lead vocal': 'lead_vocal',
  'vocal bgv': 'bgv_1',
  drums: 'drums',
  bass: 'bass',
  'electric guitar': 'electric_guitar',
  'acoustic guitar': 'acoustic_guitar',
  keys: 'keyboard',
  'synth/pad': 'synth',
  tracks: 'music_director',
  sound: 'sound_tech',
  'sound tech': 'sound_tech',
  'sound technician': 'sound_tech',
  'sound engineer': 'sound_tech',
  'foh engineer': 'foh_engineer',
  'front of house': 'foh_engineer',
  'monitor engineer': 'monitor_engineer',
  'stream engineer': 'stream_engineer',
  media: 'media_tech',
  'media tech': 'media_tech',
  'media technician': 'media_tech',
  propresenter: 'media_tech',
  'pro presenter': 'media_tech',
  slides: 'media_tech',
  lighting: 'lighting',
  lights: 'lighting',
  'stage manager': 'stage_manager',
  // INSTRUMENT_ROLES variants
  keyboardist: 'keyboard',
  guitarist: 'electric_guitar',
  bassist: 'bass',
  'acoustic guitarist': 'acoustic_guitar',
  drummer: 'drums',
  vocalist: 'lead_vocal',
};

function normalizeRole(role) {
  if (!role) return role;
  const trimmed = String(role).trim();
  const lower = trimmed.toLowerCase();
  return ROLE_NORMALIZE_MAP[lower] || trimmed;
}

const INSTRUMENT_ROLES = new Set(Object.keys(INSTRUMENT_STEM_MAP));

function normalizeStemToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function extractPlayableStemUri(value) {
  if (!value) return null;
  if (typeof value === 'string') return getPlayableMediaUrl(value);
  if (typeof value !== 'object') return null;
  return getPlayableMediaUrl(
    value.url ||
    value.uri ||
    value.localUri ||
    value.file_url ||
    value.fileUrl ||
    value.downloadUrl ||
    value.streamUrl ||
    null
  );
}

function collectPracticeStemEntries(stems = {}, harmonies = {}) {
  const entries = [];
  const seenUris = new Set();

  const pushEntry = (kind, key, value) => {
    const uri = extractPlayableStemUri(value);
    if (!uri || seenUris.has(uri)) return;

    const normalizedKey = normalizeStemToken(key);
    const normalizedType = normalizeStemToken(value?.type || key);
    if (NON_PRACTICE_STEM_KEYS.has(normalizedKey) || NON_PRACTICE_STEM_KEYS.has(normalizedType)) {
      return;
    }

    seenUris.add(uri);
    entries.push({
      id: `${kind}:${normalizedKey || normalizedType || entries.length}`,
      key: normalizedKey,
      type: normalizedType,
      label: String(value?.label || key || '').trim(),
      uri,
      kind,
    });
  };

  Object.entries(stems || {}).forEach(([key, value]) => pushEntry('stem', key, value));
  Object.entries(harmonies || {}).forEach(([key, value]) => pushEntry('harmony', key, value));

  return entries;
}

function getStemEntryAliases(entry) {
  const tokens = new Set();
  [entry?.key, entry?.type, entry?.label]
    .map(normalizeStemToken)
    .filter(Boolean)
    .forEach((token) => tokens.add(token));
  return tokens;
}

function entryMatchesStem(entry, canonical) {
  const aliases = STEM_ALIAS_MAP[canonical] || [canonical];
  const tokens = getStemEntryAliases(entry);
  return aliases.map(normalizeStemToken).some((alias) => tokens.has(alias));
}

function findStemEntry(entries, candidates = []) {
  for (const candidate of candidates) {
    const match = entries.find((entry) => entryMatchesStem(entry, candidate));
    if (match) return match;
  }
  return null;
}

function isVocalEntry(entry) {
  if (!entry) return false;
  if (entry.kind === 'harmony') return true;
  return ['vocals', 'lead_vocal', 'voice1', 'voice2', 'voice3', 'soprano', 'alto', 'tenor']
    .some((candidate) => entryMatchesStem(entry, candidate));
}

function buildTrackSources(trackId, entries = []) {
  const seenUris = new Set();
  return (entries || [])
    .filter(Boolean)
    .map((entry, index) => {
      if (!entry?.uri || seenUris.has(entry.uri)) return null;
      seenUris.add(entry.uri);
      const suffix = normalizeStemToken(entry.id || entry.key || entry.type || entry.label || `source_${index}`) || `source_${index}`;
      return {
        id: `${trackId}:${suffix}`,
        uri: entry.uri,
        label: entry.label,
        type: entry.type,
      };
    })
    .filter(Boolean);
}

function makeTrackDef({ id, label, sublabel, entries = [], externalUrl = null, color, icon }) {
  const sources = buildTrackSources(id, entries);
  return {
    id,
    label,
    sublabel,
    uri: sources[0]?.uri || null,
    sources,
    externalUrl,
    color,
    icon,
  };
}

function getTrackSources(def) {
  if (!def) return [];
  if (Array.isArray(def.sources) && def.sources.length > 0) return def.sources;
  return def.uri ? [{ id: def.id, uri: def.uri }] : [];
}

function isPlaybackOnlyRole(role) {
  if (!role) return false;
  return PLAYBACK_ONLY_ROLES.has(role) || (!VOCAL_ROLES.has(role) && !INSTRUMENT_ROLES.has(role));
}

function resolveReferenceAudioUri(song, stems = {}, harmonies = {}, excludedUri = null) {
  const candidates = [
    getDirectSongMediaUrl(song),
    getPlayableMediaUrl(stems.mix),
    getPlayableMediaUrl(stems.full_mix),
    getPlayableMediaUrl(stems.other),
    getPlayableMediaUrl(stems.vocals),
    getPlayableMediaUrl(harmonies.lead_vocal),
    getPlayableMediaUrl(harmonies.lead),
    getPlayableMediaUrl(harmonies.voice1),
    getPlayableMediaUrl(harmonies.soprano),
  ].filter(Boolean);

  return candidates.find((uri) => uri !== excludedUri) || null;
}

function resolveVocalBedUri(song, stems = {}, harmonies = {}, excludedUri = null) {
  const candidates = [
    getPlayableMediaUrl(stems.other),
    getDirectSongMediaUrl(song),
    getPlayableMediaUrl(stems.mix),
    getPlayableMediaUrl(stems.full_mix),
    getPlayableMediaUrl(stems.drums),
    getPlayableMediaUrl(stems.bass),
    getPlayableMediaUrl(harmonies.lead_vocal),
    getPlayableMediaUrl(harmonies.lead),
  ].filter(Boolean);

  return candidates.find((uri) => uri !== excludedUri) || null;
}

function resolveHarmonyTrack(role, harmonies = {}) {
  for (const key of (HARMONY_CANDIDATES[role] || ['voice1'])) {
    const uri = getPlayableMediaUrl(harmonies[key]);
    if (uri) {
      return {
        uri,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
      };
    }
  }

  return {
    uri: null,
    label: 'Your Harmony',
  };
}

function detectPrimaryRole(roles = []) {
  const normalizedRoles = roles.map(normalizeRole).filter(Boolean);
  // Return first musical role found
  const order = [
    'lead_vocal', 'worship_leader', 'bgv_1', 'bgv_2', 'bgv_3', 'music_director',
    'keyboard', 'piano', 'synth', 'electric_guitar', 'acoustic_guitar', 'rhythm_guitar',
    'bass', 'drums', 'percussion', 'strings', 'brass',
  ];
  for (const r of order) {
    if (normalizedRoles.includes(r)) return r;
  }
  return normalizedRoles[0] || 'lead_vocal';
}

function buildPersonalTracks(role, song) {
  const stems = song?.stems || {};
  const harmonies = song?.harmonies || {};
  const mediaUrl = getSongMediaReferenceUrl(song, stems, harmonies);
  const stemEntries = collectPracticeStemEntries(stems, harmonies);

  if (isPlaybackOnlyRole(role)) {
    const roleLabel = ROLE_DISPLAY[role] || 'Playback';
    const referenceUri = resolveReferenceAudioUri(song, stems, harmonies);
    const trackA = makeTrackDef({
      id: 'playback',
      label: referenceUri ? 'Playback' : 'Song Media',
      sublabel: referenceUri ? `${roleLabel} reference mix` : 'Open media below',
      entries: referenceUri
        ? [{ key: 'playback', type: 'reference', label: 'Playback', uri: referenceUri }]
        : [],
      externalUrl: referenceUri ? null : mediaUrl,
      color: '#3B82F6',
      icon: '🎧',
    });
    return [trackA, null];
  }

  if (VOCAL_ROLES.has(role)) {
    const harmonyEntry = findStemEntry(
      stemEntries,
      HARMONY_CANDIDATES[role] || ['voice1']
    );
    const harmonyTrack = harmonyEntry || resolveHarmonyTrack(role, harmonies);
    const instrumentalEntries = stemEntries.filter((entry) => !isVocalEntry(entry));
    const instrumentalUri = resolveVocalBedUri(song, stems, harmonies, harmonyTrack.uri);
    const trackA = makeTrackDef({
      id: 'instrument_bed',
      label: instrumentalEntries.length > 0 || instrumentalUri ? 'Full Instruments' : 'Song Media',
      sublabel: instrumentalEntries.length > 0 || instrumentalUri ? 'Band bed for vocal practice' : 'Open media below',
      entries: instrumentalEntries.length > 0
        ? instrumentalEntries
        : (
          instrumentalUri
            ? [{ key: 'instrument_bed', type: 'reference', label: 'Full Instruments', uri: instrumentalUri }]
            : []
        ),
      externalUrl: instrumentalEntries.length > 0 || instrumentalUri ? null : mediaUrl,
      color: '#3B82F6',
      icon: '🎧',
    });
    const trackB = makeTrackDef({
      id: 'my_harmony',
      label: harmonyTrack.label || 'Your Harmony',
      sublabel: harmonyTrack.uri ? 'Your part' : 'Not available yet',
      entries: harmonyTrack.uri
        ? [{ key: harmonyTrack.label || 'my_harmony', type: 'harmony', label: harmonyTrack.label || 'Your Harmony', uri: harmonyTrack.uri }]
        : [],
      color: '#10B981',
      icon: '🎵',
    });
    return [trackA, trackB];
  }

  const canonicalStem = INSTRUMENT_STEM_MAP[role] || 'other';
  const myStemEntry = findStemEntry(stemEntries, [canonicalStem]);
  const stemLabel = ROLE_DISPLAY[role] || myStemEntry?.label || 'Your Part';
  const accompanimentEntries = stemEntries.filter((entry) =>
    myStemEntry ? entry.uri !== myStemEntry.uri : true
  );
  const referenceUri = resolveReferenceAudioUri(
    song,
    stems,
    harmonies,
    myStemEntry?.uri || null
  );

  const trackA = makeTrackDef({
    id: 'full_mix',
    label: accompanimentEntries.length > 0 || referenceUri ? 'Full Song' : 'Song Media',
    sublabel: accompanimentEntries.length > 0 || referenceUri
      ? `Everyone except ${stemLabel}`
      : 'Open media below',
    entries: accompanimentEntries.length > 0
      ? accompanimentEntries
      : (
        referenceUri
          ? [{ key: 'reference', type: 'reference', label: 'Full Song', uri: referenceUri }]
          : []
      ),
    externalUrl: accompanimentEntries.length > 0 || referenceUri ? null : mediaUrl,
    color: '#3B82F6',
    icon: '🎸',
  });
  const trackB = makeTrackDef({
    id: 'my_stem',
    label: stemLabel,
    sublabel: myStemEntry?.uri ? 'Your isolated track' : 'Not available yet',
    entries: myStemEntry?.uri
      ? [{ key: myStemEntry.key || canonicalStem, type: myStemEntry.type || canonicalStem, label: stemLabel, uri: myStemEntry.uri }]
      : [],
    color: '#F59E0B',
    icon: canonicalStem === 'bass' ? '🎸' : canonicalStem === 'drums' ? '🥁' : canonicalStem === 'keys' ? '🎹' : '🎵',
  });
  return [trackA, trackB];
}

function isSamePracticeSong(a, b) {
  if (!a || !b) return false;
  const keysA = [
    a.serviceItemId,
    a.id,
    a.songId,
    a.librarySongId,
    getSongLookupId(a),
  ].filter(Boolean);
  const keysB = new Set([
    b.serviceItemId,
    b.id,
    b.songId,
    b.librarySongId,
    getSongLookupId(b),
  ].filter(Boolean));
  return keysA.some((value) => keysB.has(value));
}

function findSongIndex(list = [], song) {
  return (list || []).findIndex((candidate) => isSamePracticeSong(candidate, song));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PersonalPracticeScreen({ route, navigation }) {
  // Read params fresh on every render (focus re-navigation updates them)
  const paramsRef = useRef(route?.params || {});
  paramsRef.current = route?.params || {};

  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [songs, setSongs] = useState([]);
  const [selectedSong, setSelectedSong] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true);
  const [repeatCurrentSong, setRepeatCurrentSong] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await initScreen();
    setRefreshing(false);
  }, []);
  const [loadingStems, setLoadingStems] = useState(false);
  const [stemsReady, setStemsReady] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  // Per-track mute state
  const [muteA, setMuteA] = useState(false);
  const [muteB, setMuteB] = useState(false);

  // Derived tracks definition for the selected song + role
  const [trackDefs, setTrackDefs] = useState([null, null]);

  const roleRef = useRef(null);
  const songsRef = useRef([]);
  const selectedSongRef = useRef(null);
  const trackDefsRef = useRef([null, null]);
  const handleSongFinishedRef = useRef(null);
  const queueAdvanceLockRef = useRef(false);

  // ── Audio engine init (once) ──────────────────────────────────────────────

  useEffect(() => {
    audioEngine.initialize().catch(() => {});
    audioEngine.onProgressUpdate = ({ position: pos, duration: dur }) => {
      setPosition(pos || 0);
      if (dur) setDuration(dur);
    };
    audioEngine.onPlaybackStatusChange = ({ isPlaying: p }) => setIsPlaying(!!p);
    audioEngine.onPlaybackEnded = () => {
      handleSongFinishedRef.current?.();
    };
    return () => {
      audioEngine.stop().catch(() => {});
      audioEngine.unloadAll().catch(() => {});
      audioEngine.onProgressUpdate = null;
      audioEngine.onPlaybackStatusChange = null;
      audioEngine.onPlaybackEnded = null;
    };
  }, []);

  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  useEffect(() => {
    selectedSongRef.current = selectedSong;
  }, [selectedSong]);

  useEffect(() => {
    trackDefsRef.current = trackDefs;
  }, [trackDefs]);

  // ── Reload on focus (handles tab tap + navigate-with-new-params) ──────────

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      initScreen();
    });
    return unsub;
  }, [navigation]);

  async function initScreen() {
    setPageLoading(true);
    try {
      const p = await getUserProfile();
      setProfile(p);
      // Prefer the server-assigned role for this service over the profile's stored roles
      const paramRole = normalizeRole(paramsRef.current.userRole);
      const r = paramRole || detectPrimaryRole(p?.roles || []);
      setRole(r);
      roleRef.current = r;

      // Resolve serviceId + role: use params, else fall back to nearest accepted assignment
      let resolvedServiceId = paramsRef.current.serviceId;
      let resolvedAssignmentRole = paramRole;
      if (!resolvedServiceId) {
        const assignments = await getAssignments();
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const accepted = assignments.filter((a) => {
          if (a.status !== 'accepted') return false;
          const d = new Date(String(a.service_date || a.date || '').includes('T')
            ? (a.service_date || a.date) : (a.service_date || a.date || '') + 'T00:00:00');
          return d >= today; // only upcoming/today
        });
        if (accepted.length > 0) {
          accepted.sort((a, b) => {
            const da = new Date(a.service_date || a.date || 0).getTime();
            const db = new Date(b.service_date || b.date || 0).getTime();
            return da - db; // nearest first
          });
          resolvedServiceId = accepted[0].service_id;
          // Use the assignment's role if no explicit role was passed
          if (!paramRole && accepted[0].role) {
            resolvedAssignmentRole = normalizeRole(accepted[0].role);
          }
        }
      }
      const r2 = resolvedAssignmentRole || detectPrimaryRole(p?.roles || []);
      setRole(r2);
      roleRef.current = r2;

      const fetchedSongs = await fetchSetlist(resolvedServiceId);
      setSongs(fetchedSongs);
      songsRef.current = fetchedSongs;

      // Auto-select: prefer initSongId param, else first song
      const initSongId = paramsRef.current.songId;
      const init = initSongId
        ? fetchedSongs.find((s) => s.id === initSongId || s.songId === initSongId) || fetchedSongs[0]
        : fetchedSongs[0];
      if (init) await selectSong(init, r2);
    } catch (e) {
      console.warn('PersonalPractice init error:', e);
    } finally {
      setPageLoading(false);
    }
  }

  async function fetchSetlist(svcId) {
    try {
      const headers = { 'x-org-id': SYNC_ORG_ID, 'x-secret-key': SYNC_SECRET_KEY };

      // Get library songs (basic metadata)
      const res = await fetch(`${SYNC_URL}/sync/library-pull`, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      const library = data?.songs || data?.library || [];

      let songList = library;

      if (svcId) {
        // Get the service-specific setlist order
        const sres = await fetch(`${SYNC_URL}/sync/setlist?serviceId=${svcId}`, { headers });
        if (sres.ok) {
          const sdata = await sres.json();
          // Endpoint returns plain array (not {songs:[...]})
          const setlistSongs = Array.isArray(sdata) ? sdata : (sdata?.songs || []);
          if (setlistSongs.length > 0) {
            songList = mergeSetlistWithLibrary(setlistSongs, library);
          } else {
            // No setlist found for this service — show nothing, not the whole library
            songList = [];
          }
        }
      } else {
        songList = []; // No serviceId = no songs to show
      }

      return songList;
    } catch (e) {
      console.warn('fetchSetlist error:', e);
      return [];
    }
  }

  // Fetch stems separately — library-pull doesn't include them
  async function fetchSongStems(song) {
    const lookupId = typeof song === 'string' ? song : getSongLookupId(song);
    if (!lookupId) return {};
    try {
      const headers = { 'x-org-id': SYNC_ORG_ID, 'x-secret-key': SYNC_SECRET_KEY };
      const res = await fetch(`${SYNC_URL}/sync/stems-result?songId=${encodeURIComponent(lookupId)}`, { headers });
      if (!res.ok) return {};
      const data = await res.json();
      return {
        stems: data?.stems || {},
        harmonies: data?.harmonies || {},
      };
    } catch (e) {
      return {};
    }
  }

  function applySongSelection(song, defs) {
    selectedSongRef.current = song;
    trackDefsRef.current = defs;
    setSelectedSong(song);
    setTrackDefs(defs);
  }

  function getSongPlaybackState(song, defs) {
    const [trackA, trackB] = defs || [null, null];
    const mediaReferenceUrl = getSongMediaReferenceUrl(song, song?.stems, song?.harmonies);
    const hasDirectPracticeAudio =
      getTrackSources(trackA).length > 0 || getTrackSources(trackB).length > 0;
    return {
      mediaReferenceUrl,
      hasDirectPracticeAudio,
      hasExternalMediaOnly: !!mediaReferenceUrl && !hasDirectPracticeAudio,
    };
  }

  async function loadPracticeAudio(song, defs, options = {}) {
    const {
      openExternalOnMissing = false,
      suppressMissingAlert = false,
      resetTransport = true,
    } = options;

    const [trackA, trackB] = defs || [null, null];
    const playbackOnlyMode = isPlaybackOnlyRole(roleRef.current || role);
    const { mediaReferenceUrl } = getSongPlaybackState(song, defs);

    if (!trackA?.uri && !trackB?.uri) {
      if (openExternalOnMissing && mediaReferenceUrl) {
        await openMediaReference(mediaReferenceUrl);
        return { loaded: false, openedExternal: true };
      }
      if (!suppressMissingAlert) {
        Alert.alert(
          playbackOnlyMode ? 'No Playback Available' : 'No Stems Available',
          playbackOnlyMode
            ? 'This song does not have playback audio available yet. Ask your admin to upload or publish the song audio.'
            : 'This song has no playable role stems or audio reference yet.',
          [{ text: 'OK' }]
        );
      }
      return { loaded: false };
    }

    setLoadingStems(true);
    try {
      await audioEngine.stop().catch(() => {});
      await audioEngine.unloadAll();
      let loaded = 0;
      for (const source of getTrackSources(trackA)) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await audioEngine.loadStem(source.id, source.uri);
        if (ok) loaded++;
      }
      for (const source of getTrackSources(trackB)) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await audioEngine.loadStem(source.id, source.uri);
        if (ok) loaded++;
      }
      setStemsReady(loaded > 0);
      setMuteA(false);
      setMuteB(false);
      if (resetTransport) {
        setPosition(0);
        setDuration(0);
      }
      return { loaded: loaded > 0 };
    } catch (e) {
      if (!suppressMissingAlert) {
        Alert.alert('Load Error', 'Could not load audio tracks. Check your connection.');
      }
      console.error('loadPracticeAudio error:', e);
      return { loaded: false, error: e };
    } finally {
      setLoadingStems(false);
    }
  }

  // ── song selection ────────────────────────────────────────────────────────

  async function selectSong(song, currentRole, options = {}) {
    const {
      autoLoad = false,
      autoPlay = false,
      openExternalOnMissing = false,
      suppressMissingAlert = false,
    } = options;

    setStemsReady(false);
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
    setMuteA(false);
    setMuteB(false);
    audioEngine.stop().catch(() => {});
    audioEngine.unloadAll().catch(() => {});

    const r = currentRole || roleRef.current || role;

    // First pass — use whatever metadata the song already has
    let enriched = song;
    let defs = buildPersonalTracks(r, enriched);
    applySongSelection(enriched, defs);

    // Second pass — fetch stems from KV (library-pull doesn't include them)
    const lookupId = getSongLookupId(song);
    if (lookupId) {
      const { stems, harmonies } = await fetchSongStems(song);
      if (Object.keys(stems).length > 0 || Object.keys(harmonies).length > 0) {
        enriched = { ...song, stems, harmonies };
        defs = buildPersonalTracks(r, enriched);
        applySongSelection(enriched, defs);
      }
    }

    if (autoLoad || autoPlay) {
      const loadResult = await loadPracticeAudio(enriched, defs, {
        openExternalOnMissing,
        suppressMissingAlert,
      });
      if (loadResult.loaded && autoPlay) {
        await audioEngine.play();
      }
      return { song: enriched, defs, ...loadResult };
    }

    return { song: enriched, defs, loaded: false };
  }

  const openMediaReference = useCallback(async (url) => {
    if (!url) {
      Alert.alert('No Media Link', 'This song does not have a media reference link yet.');
      return;
    }

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('unsupported');
      await Linking.openURL(url);
    } catch {
      Alert.alert('Open Media Failed', 'Could not open the song media link on this device.');
    }
  }, []);

  // ── stem loading ──────────────────────────────────────────────────────────

  async function handleLoadStems() {
    if (!selectedSong) return;
    await loadPracticeAudio(selectedSongRef.current, trackDefsRef.current, {
      openExternalOnMissing: true,
    });
  }

  // ── playback ──────────────────────────────────────────────────────────────

  async function handlePlayPause() {
    if (!stemsReady) {
      const result = await loadPracticeAudio(selectedSongRef.current, trackDefsRef.current, {
        openExternalOnMissing: true,
      });
      if (result.loaded) {
        await audioEngine.play();
      }
      return;
    }
    try {
      if (isPlaying) {
        await audioEngine.pause();
      } else {
        await audioEngine.play();
      }
    } catch (e) {
      console.error('playPause error:', e);
    }
  }

  async function handleRestart() {
    try {
      await audioEngine.seek(0);
      setPosition(0);
    } catch (e) {}
  }

  async function handleSkip(deltaMs) {
    try {
      const newPos = Math.max(0, Math.min(position + deltaMs, duration));
      await audioEngine.seek(newPos);
    } catch (e) {}
  }

  async function handleSeekBar(pct) {
    if (!duration) return;
    const ms = pct * duration;
    try {
      await audioEngine.seek(ms);
      setPosition(ms);
    } catch (e) {}
  }

  async function jumpSong(delta) {
    const currentIndex = findSongIndex(songsRef.current, selectedSongRef.current);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= songsRef.current.length) return;

    await selectSong(songsRef.current[nextIndex], roleRef.current || role, {
      autoPlay: isPlaying,
      suppressMissingAlert: !isPlaying,
    });
  }

  function toggleAutoAdvance() {
    setAutoAdvanceEnabled((prev) => {
      const next = !prev;
      if (next) setRepeatCurrentSong(false);
      return next;
    });
  }

  function toggleRepeatCurrentSong() {
    setRepeatCurrentSong((prev) => {
      const next = !prev;
      if (next) setAutoAdvanceEnabled(false);
      return next;
    });
  }

  async function toggleMuteA() {
    const next = !muteA;
    setMuteA(next);
    if (stemsReady) {
      for (const source of getTrackSources(trackDefs[0])) {
        // eslint-disable-next-line no-await-in-loop
        await audioEngine.setTrackMute(source.id, next);
      }
    }
  }

  async function toggleMuteB() {
    const next = !muteB;
    setMuteB(next);
    if (stemsReady) {
      for (const source of getTrackSources(trackDefs[1])) {
        // eslint-disable-next-line no-await-in-loop
        await audioEngine.setTrackMute(source.id, next);
      }
    }
  }

  handleSongFinishedRef.current = async () => {
    if (queueAdvanceLockRef.current) return;
    queueAdvanceLockRef.current = true;
    try {
      if (repeatCurrentSong && selectedSongRef.current) {
        const result = await loadPracticeAudio(selectedSongRef.current, trackDefsRef.current, {
          suppressMissingAlert: true,
        });
        if (result.loaded) {
          await audioEngine.play();
        }
        return;
      }

      if (!autoAdvanceEnabled) return;
      const currentIndex = findSongIndex(songsRef.current, selectedSongRef.current);
      if (currentIndex < 0 || currentIndex >= songsRef.current.length - 1) return;
      for (let idx = currentIndex + 1; idx < songsRef.current.length; idx += 1) {
        // eslint-disable-next-line no-await-in-loop
        const result = await selectSong(songsRef.current[idx], roleRef.current || role, {
          autoPlay: true,
          suppressMissingAlert: true,
        });
        if (result?.loaded) return;
      }
    } catch (error) {
      console.warn('practice queue advance error:', error);
    } finally {
      queueAdvanceLockRef.current = false;
    }
  };

  // ── helpers ───────────────────────────────────────────────────────────────

  const formatTime = (ms) => {
    const s = Math.floor((ms || 0) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const progressPct = duration > 0 ? (position / duration) * 100 : 0;
  const [defA, defB] = trackDefs;
  const playbackOnlyMode = isPlaybackOnlyRole(role);
  const {
    mediaReferenceUrl,
    hasDirectPracticeAudio,
    hasExternalMediaOnly,
  } = selectedSong
    ? getSongPlaybackState(selectedSong, trackDefs)
    : { mediaReferenceUrl: null, hasDirectPracticeAudio: false, hasExternalMediaOnly: false };
  const selectedSongIndex = findSongIndex(songs, selectedSong);
  const hasPrevSong = selectedSongIndex > 0;
  const hasNextSong = selectedSongIndex >= 0 && selectedSongIndex < songs.length - 1;

  // ── render ────────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#8B5CF6" size="large" />
        <Text style={styles.loadingText}>Loading your practice session…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenTitle}>My Practice</Text>
          {role ? (
            <View style={styles.roleRow}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{ROLE_DISPLAY[role] || role}</Text>
              </View>
              {selectedSong?.key ? (
                <Text style={styles.metaChip}>Key: {selectedSong.key}</Text>
              ) : null}
              {selectedSong?.bpm ? (
                <Text style={styles.metaChip}>{selectedSong.bpm} BPM</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Song picker ── */}
      {songs.length > 0 && (
        <View style={styles.songPickerWrap}>
          <Text style={styles.sectionLabel}>SONGS</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.songPickerRow}
          >
            {songs.map((song, i) => {
              const active = selectedSong?.id === song.id || selectedSong?.songId === song.id;
              return (
                <TouchableOpacity
                  key={song.id || i}
                  style={[styles.songPill, active && styles.songPillActive]}
                  onPress={() => selectSong(song, role)}
                >
                  <Text style={[styles.songPillText, active && styles.songPillTextActive]} numberOfLines={1}>
                    {song.title || 'Untitled'}
                  </Text>
                  {song.key ? (
                    <Text style={[styles.songPillKey, active && styles.songPillKeyActive]}>
                      {song.key}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Main body ── */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >

        {/* Song title */}
        {selectedSong ? (
          <Text style={styles.songTitle}>{selectedSong.title || 'Untitled'}</Text>
        ) : (
          <Text style={styles.emptyText}>No songs found for this service.</Text>
        )}

        {/* ── Always-visible waveform pipeline ── */}
        {selectedSong && (
          <>
            {/* Waveform — always shown so the song structure is visible */}
            <WaveformBar
              song={selectedSong}
              userRole={role}
              positionMs={position}
              durationMs={duration || undefined}
              onSeek={(ms) => {
                if (!stemsReady) return;
                audioEngine.seek(ms).catch(() => {});
                setPosition(ms);
              }}
              onSectionPress={(startMs) => {
                if (!stemsReady) return;
                audioEngine.seek(startMs).catch(() => {});
                setPosition(startMs);
              }}
            />

            {/* 2-Track Mixer — always shown; mute buttons disabled until loaded */}
            <View style={styles.mixerCard}>
              <Text style={styles.mixerTitle}>{playbackOnlyMode ? 'PLAYBACK' : 'YOUR PERSONAL MIX'}</Text>

              <TrackStrip
                def={defA}
                muted={muteA}
                onMuteToggle={toggleMuteA}
                isLoaded={stemsReady}
                isPlaying={isPlaying && !muteA}
              />

              {defB ? (
                <TrackStrip
                  def={defB}
                  muted={muteB}
                  onMuteToggle={toggleMuteB}
                  isLoaded={stemsReady}
                  isPlaying={isPlaying && !muteB}
                  isMine
                />
              ) : null}

              {/* Stems status inline */}
              {!hasDirectPracticeAudio && !mediaReferenceUrl ? (
                <View style={styles.noStemsInline}>
                  <Text style={styles.noStemsInlineText}>
                    {playbackOnlyMode
                      ? '🎧 Playback audio is not available for this song yet — ask your admin to upload or publish the song audio.'
                      : '🔬 Stems not processed yet — ask your admin to run CineStage on this song.'}
                  </Text>
                </View>
              ) : !stemsReady && hasDirectPracticeAudio ? (
                <TouchableOpacity style={styles.loadBigBtn} onPress={handleLoadStems} disabled={loadingStems}>
                  {loadingStems
                    ? <ActivityIndicator color="#FFF" />
                    : <Text style={styles.loadBigBtnText}>{playbackOnlyMode ? '📥 Load Playback' : '📥 Load My Tracks'}</Text>}
                </TouchableOpacity>
              ) : hasExternalMediaOnly ? (
                <TouchableOpacity style={styles.loadBigBtn} onPress={() => openMediaReference(mediaReferenceUrl)}>
                  <Text style={styles.loadBigBtnText}>
                    {isYouTubeUrl(mediaReferenceUrl) ? '▶ Open Song Media' : '▶ Play Song Audio'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {playbackOnlyMode ? (
                <View style={styles.tipBox}>
                  <Text style={styles.tipText}>
                    {hasExternalMediaOnly
                      ? '🎧 Playback-only mode. Open the song media while stems are being repaired.'
                      : '🎧 Playback-only mode for non-performing roles.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.tipBox}>
                  <Text style={styles.tipText}>
                    {hasExternalMediaOnly
                      ? '💡 Use the song media as a temporary reference until the role stems are fixed.'
                      : '💡 Mute your track to practice along with the rest of the band.'}
                  </Text>
                </View>
              )}
            </View>

            {/* Transport */}
            <View style={styles.transport}>
              <TouchableOpacity style={styles.transpBtn} onPress={() => jumpSong(-1)} disabled={!hasPrevSong || loadingStems}>
                <Text style={[styles.transpBtnText, (!hasPrevSong || loadingStems) && styles.transpDisabled]}>⏮︎♫</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.transpBtn} onPress={handleRestart} disabled={!stemsReady}>
                <Text style={[styles.transpBtnText, !stemsReady && styles.transpDisabled]}>⏮</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.transpBtn} onPress={() => handleSkip(-15000)} disabled={!stemsReady}>
                <Text style={[styles.transpSkipText, !stemsReady && styles.transpDisabled]}>-15</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.playBtn, isPlaying && styles.playBtnActive, !stemsReady && !loadingStems && styles.playBtnLoad]}
                onPress={handlePlayPause}
              >
                {loadingStems
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Text style={styles.playBtnText}>{isPlaying ? '⏸' : '▶'}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.transpBtn} onPress={() => handleSkip(15000)} disabled={!stemsReady}>
                <Text style={[styles.transpSkipText, !stemsReady && styles.transpDisabled]}>+15</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.transpBtn, stemsReady && styles.transpBtnDone]}
                onPress={hasDirectPracticeAudio ? handleLoadStems : () => openMediaReference(mediaReferenceUrl)}
                disabled={loadingStems || (!hasDirectPracticeAudio && !mediaReferenceUrl)}
              >
                {loadingStems
                  ? <ActivityIndicator color="#8B5CF6" size="small" />
                  : <Text style={styles.transpBtnText}>
                      {stemsReady ? '✓' : hasExternalMediaOnly ? '🌐' : '📥'}
                    </Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.transpBtn} onPress={() => jumpSong(1)} disabled={!hasNextSong || loadingStems}>
                <Text style={[styles.transpBtnText, (!hasNextSong || loadingStems) && styles.transpDisabled]}>♫⏭︎</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeChip, autoAdvanceEnabled && styles.modeChipActive]}
                onPress={toggleAutoAdvance}
              >
                <Text style={[styles.modeChipText, autoAdvanceEnabled && styles.modeChipTextActive]}>
                  {autoAdvanceEnabled ? 'Auto Next On' : 'Auto Next Off'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeChip, repeatCurrentSong && styles.modeChipActive]}
                onPress={toggleRepeatCurrentSong}
              >
                <Text style={[styles.modeChipText, repeatCurrentSong && styles.modeChipTextActive]}>
                  {repeatCurrentSong ? 'Repeat Song On' : 'Repeat Song Off'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modeHint}>
              {repeatCurrentSong
                ? 'The current song will restart automatically when it ends.'
                : autoAdvanceEnabled
                  ? 'The next playable song in this setlist will start automatically when the current song finishes.'
                  : 'Manual song selection mode.'}
              {hasExternalMediaOnly ? ' External media links still open outside the app.' : ''}
            </Text>
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function TrackStrip({ def, muted, onMuteToggle, isLoaded, isPlaying, isMine }) {
  if (!def) return null;
  const hasUri = !!def.uri;
  const hasSource = hasUri || !!def.externalUrl;

  return (
    <View style={[styles.trackStrip, isMine && styles.trackStripMine]}>
      {/* Color bar */}
      <View style={[styles.trackColorBar, { backgroundColor: def.color }]} />

      {/* Icon + labels */}
      <View style={styles.trackInfo}>
        <Text style={styles.trackIcon}>{def.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.trackLabel}>{def.label}</Text>
          <Text style={styles.trackSublabel}>
            {!hasSource ? 'Not available' : !hasUri && def.externalUrl ? 'Open media below' : isLoaded ? (isPlaying ? '▶ Playing' : '⏸ Paused') : def.sublabel}
          </Text>
        </View>
        {isMine && (
          <View style={styles.myBadge}><Text style={styles.myBadgeText}>MINE</Text></View>
        )}
      </View>

      {/* Mute button */}
      <TouchableOpacity
        style={[styles.muteBtn, muted && styles.muteBtnActive, !hasUri && styles.muteBtnDisabled]}
        onPress={hasUri ? onMuteToggle : undefined}
        activeOpacity={hasUri ? 0.7 : 1}
      >
        <Text style={styles.muteBtnText}>{muted ? '🔇' : '🔊'}</Text>
      </TouchableOpacity>
    </View>
  );
}


// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#020617' },
  center:        { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },
  loadingText:   { color: '#9CA3AF', marginTop: 12, fontSize: 14 },

  // Top bar
  topBar: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  screenTitle: { fontSize: 22, fontWeight: '700', color: '#F1F5F9', marginBottom: 6 },
  roleRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  roleBadge: {
    backgroundColor: '#4F46E5', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  roleBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  metaChip: {
    color: '#94A3B8', fontSize: 12, fontWeight: '500',
    backgroundColor: '#0F172A', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
  },

  // Song picker
  songPickerWrap: {
    paddingTop: 12, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  sectionLabel: {
    color: '#64748B', fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, marginLeft: 20, marginBottom: 8,
  },
  songPickerRow:  { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  songPill: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#0F172A', borderRadius: 20,
    borderWidth: 1, borderColor: '#334155',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    maxWidth: 180,
  },
  songPillActive: { backgroundColor: '#4F46E5', borderColor: '#6366F1' },
  songPillText: { color: '#94A3B8', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  songPillTextActive: { color: '#FFF' },
  songPillKey: { color: '#64748B', fontSize: 11 },
  songPillKeyActive: { color: '#C4B5FD' },

  // Body
  body:        { flex: 1 },
  bodyContent: { padding: 20, gap: 16, paddingBottom: 40 },

  songTitle: {
    fontSize: 26, fontWeight: '800', color: '#F8FAFC', textAlign: 'center',
  },
  emptyText: { color: '#64748B', textAlign: 'center', fontSize: 15, marginTop: 40 },

  // Mixer card
  mixerCard: {
    backgroundColor: '#080E1A', borderRadius: 16,
    borderWidth: 1, borderColor: '#1E293B',
    overflow: 'hidden',
  },
  mixerTitle: {
    color: '#64748B', fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, margin: 14, marginBottom: 8,
  },

  // Track strip
  trackStrip: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 10,
    backgroundColor: '#0F172A', borderRadius: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: '#1E293B',
  },
  trackStripMine: { borderColor: '#4F46E5' },
  trackColorBar: { width: 4, alignSelf: 'stretch' },
  trackInfo: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12, gap: 10,
  },
  trackIcon:     { fontSize: 22 },
  trackLabel:    { color: '#E2E8F0', fontSize: 14, fontWeight: '600' },
  trackSublabel: { color: '#64748B', fontSize: 11, marginTop: 2 },
  myBadge: {
    backgroundColor: '#312E81', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  myBadgeText: { color: '#A5B4FC', fontSize: 10, fontWeight: '700' },
  muteBtn: {
    width: 44, height: 44, justifyContent: 'center', alignItems: 'center',
    marginRight: 8,
  },
  muteBtnActive: { opacity: 0.5 },
  muteBtnDisabled: { opacity: 0.25 },
  muteBtnText: { fontSize: 20 },

  tipBox: {
    margin: 12, marginTop: 4, padding: 10,
    backgroundColor: '#0A1628', borderRadius: 8,
    borderLeftWidth: 3, borderLeftColor: '#4F46E5',
  },
  tipText: { color: '#94A3B8', fontSize: 12, lineHeight: 18 },
  tipBold: { color: '#C4B5FD', fontWeight: '700' },


  // Transport
  transport: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: width < 390 ? 2 : 6,
  },
  transpBtn: {
    width: width < 390 ? 42 : 48,
    height: width < 390 ? 42 : 48,
    borderRadius: width < 390 ? 21 : 24,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155',
    justifyContent: 'center', alignItems: 'center',
  },
  transpBtnDone: { borderColor: '#10B981' },
  transpBtnText: { fontSize: width < 390 ? 17 : 20 },
  transpSkipText: { color: '#94A3B8', fontSize: width < 390 ? 11 : 12, fontWeight: '700' },
  playBtn: {
    width: width < 390 ? 62 : 72,
    height: width < 390 ? 62 : 72,
    borderRadius: width < 390 ? 31 : 36,
    backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center',
  },
  playBtnActive: { backgroundColor: '#7C3AED' },
  playBtnText:   { fontSize: width < 390 ? 24 : 28, color: '#FFF' },

  // No stems inline (inside mixer card)
  noStemsInline: {
    marginHorizontal: 12, marginBottom: 10,
    padding: 12, borderRadius: 10,
    backgroundColor: '#0A0F1E',
    borderWidth: 1, borderColor: '#1E293B',
  },
  noStemsInlineText: {
    color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center',
  },
  transpDisabled: { opacity: 0.25 },
  playBtnLoad: { backgroundColor: '#374151' },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    rowGap: 10,
    columnGap: 10,
    marginTop: 14,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0F172A',
    minWidth: width < 390 ? 142 : 156,
    alignItems: 'center',
    flexShrink: 1,
  },
  modeChipActive: {
    backgroundColor: '#312E81',
    borderColor: '#6366F1',
  },
  modeChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  modeChipTextActive: {
    color: '#EDE9FE',
  },
  modeHint: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 12,
  },

  // No stems
  noStemsBox: {
    alignItems: 'center', padding: 24,
    backgroundColor: '#0A0F1E', borderRadius: 16,
    borderWidth: 1, borderColor: '#1E293B',
  },
  noStemsIcon:  { fontSize: 36, marginBottom: 8 },
  noStemsTitle: { color: '#E2E8F0', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  noStemsText:  { color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Load button
  loadBigBtn: {
    backgroundColor: '#4F46E5', borderRadius: 14, padding: 16, alignItems: 'center',
  },
  loadBigBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
