/**
 * PersonalPracticeScreen — Desktop (Electron / React)
 *
 * Complete port of mobile PersonalPracticeScreen.js feature set:
 *  - Role-based 2-track audio routing (Howler.js multi-Howl per track)
 *  - Vocal roles   → Track A: instrument bed,  Track B: your harmony stem
 *  - Instrument roles → Track A: everyone else,  Track B: your isolated stem
 *  - Playback-only roles → Track A: reference mix, Track B: hidden
 *  - Stem alias normalization (STEM_ALIAS_MAP)
 *  - Service selector from store.get('assignments')
 *  - Fetch setlist → stems → transpose (CineStage)
 *  - Two-press loop section UX
 *  - Playback speed controls (0.5x / 0.75x / 1x / 1.25x)
 *  - Auto-advance / Repeat toggles
 *  - Practice session tracking on unmount (>10s gate, cap 100 entries)
 *  - Animated waveform bars (32 bars)
 *  - 3-panel desktop layout: left 300px setlist + service selector, center waveform + transport, right 280px 2-track mixer
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler';
import { useAuth } from '../App';
import { store } from '../services/store';
import {
  SYNC_URL, SYNC_ORG_ID, SYNC_SECRET_KEY,
  CINESTAGE_URL, syncHeaders,
} from '../config/syncConfig';

// ─── Song media utilities (ported inline — no utils dir in desktop app) ─────

function getPlayableMediaUrl(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.startsWith('http') ? value : null;
  if (typeof value === 'object') {
    const url = value.url || value.uri || value.localUri || value.file_url
      || value.fileUrl || value.downloadUrl || value.streamUrl || null;
    return url && url.startsWith('http') ? url : null;
  }
  return null;
}

function getSongLookupId(song) {
  if (!song) return null;
  return song.songId || song.id || song.librarySongId || song.serviceItemId || null;
}

function mergeSetlistWithLibrary(setlistSongs = [], library = []) {
  const libMap = {};
  for (const s of library) {
    const key = getSongLookupId(s);
    if (key) libMap[key] = s;
  }
  return setlistSongs.map((ss) => {
    const key = getSongLookupId(ss);
    const lib = key ? libMap[key] : null;
    return lib ? { ...lib, ...ss } : ss;
  });
}

// ─── Semitone shift utility (ported inline) ──────────────────────────────────

const NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ENHARMONICS = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };

function normalizeNote(note) {
  const n = String(note || '').trim().replace(/m$/, '').replace(/maj$/, '');
  return ENHARMONICS[n] || n;
}

function calculateSemitoneShift(fromKey, toKey) {
  const from = normalizeNote(fromKey);
  const to = normalizeNote(toKey);
  const fi = NOTE_ORDER.indexOf(from);
  const ti = NOTE_ORDER.indexOf(to);
  if (fi < 0 || ti < 0) return 0;
  let diff = ti - fi;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  return diff;
}

// ─── Role classification ─────────────────────────────────────────────────────

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

const HARMONY_CANDIDATES = {
  bgv_1: ['voice1', 'soprano', 'bgv1'],
  bgv_2: ['voice2', 'alto', 'bgv2'],
  bgv_3: ['voice3', 'tenor', 'bgv3'],
  worship_leader: ['lead_vocal', 'voice1', 'soprano'],
  lead_vocal: ['lead_vocal', 'voice1', 'soprano'],
  music_director: ['voice1', 'soprano'],
};

const ROLE_DISPLAY = {
  worship_leader: 'Worship Leader', lead_vocal: 'Lead Vocal',
  bgv_1: 'BG Vocal 1', bgv_2: 'BG Vocal 2', bgv_3: 'BG Vocal 3',
  music_director: 'Music Director',
  keyboard: 'Keys', piano: 'Piano', synth: 'Synth',
  electric_guitar: 'Electric Guitar', acoustic_guitar: 'Acoustic Guitar',
  rhythm_guitar: 'Rhythm Guitar',
  bass: 'Bass', drums: 'Drums', percussion: 'Percussion',
  strings: 'Strings', brass: 'Brass',
  sound_tech: 'Sound Tech', foh_engineer: 'FOH Engineer',
  monitor_engineer: 'Monitor Engineer', stream_engineer: 'Stream Engineer',
  media_tech: 'Media', propresenter: 'Media', lighting: 'Lighting',
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
  'mix', 'full_mix', 'full_song', 'click', 'guide', 'pad',
]);

const ROLE_NORMALIZE_MAP = {
  leader: 'worship_leader', 'worship leader': 'worship_leader',
  'music director': 'music_director', 'vocal lead': 'lead_vocal',
  'lead vocal': 'lead_vocal', 'vocal bgv': 'bgv_1',
  drums: 'drums', bass: 'bass',
  'electric guitar': 'electric_guitar', 'acoustic guitar': 'acoustic_guitar',
  keys: 'keyboard', 'synth/pad': 'synth', tracks: 'music_director',
  sound: 'sound_tech', 'sound tech': 'sound_tech',
  'sound technician': 'sound_tech', 'sound engineer': 'sound_tech',
  'foh engineer': 'foh_engineer', 'front of house': 'foh_engineer',
  'monitor engineer': 'monitor_engineer', 'stream engineer': 'stream_engineer',
  media: 'media_tech', 'media tech': 'media_tech',
  'media technician': 'media_tech', propresenter: 'media_tech',
  'pro presenter': 'media_tech', slides: 'media_tech',
  lighting: 'lighting', lights: 'lighting',
  'stage manager': 'stage_manager',
  keyboardist: 'keyboard', guitarist: 'electric_guitar',
  bassist: 'bass', 'acoustic guitarist': 'acoustic_guitar',
  drummer: 'drums', vocalist: 'lead_vocal',
};

const INSTRUMENT_ROLES = new Set(Object.keys(INSTRUMENT_STEM_MAP));

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function normalizeRole(role) {
  if (!role) return role;
  const lower = String(role).trim().toLowerCase();
  return ROLE_NORMALIZE_MAP[lower] || String(role).trim();
}

function normalizeStemToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function extractPlayableStemUri(value) {
  return getPlayableMediaUrl(value);
}

function collectPracticeStemEntries(stems = {}, harmonies = {}) {
  const entries = [];
  const seenUris = new Set();

  const pushEntry = (kind, key, value) => {
    const uri = extractPlayableStemUri(value);
    if (!uri || seenUris.has(uri)) return;
    const normalizedKey = normalizeStemToken(key);
    const normalizedType = normalizeStemToken(value?.type || key);
    if (NON_PRACTICE_STEM_KEYS.has(normalizedKey) || NON_PRACTICE_STEM_KEYS.has(normalizedType)) return;
    seenUris.add(uri);
    entries.push({
      id: `${kind}:${normalizedKey || normalizedType || entries.length}`,
      key: normalizedKey, type: normalizedType,
      label: String(value?.label || key || '').trim(),
      uri, kind,
    });
  };

  Object.entries(stems || {}).forEach(([k, v]) => pushEntry('stem', k, v));
  Object.entries(harmonies || {}).forEach(([k, v]) => pushEntry('harmony', k, v));
  return entries;
}

function getStemEntryAliases(entry) {
  const tokens = new Set();
  [entry?.key, entry?.type, entry?.label].map(normalizeStemToken).filter(Boolean).forEach((t) => tokens.add(t));
  return tokens;
}

function entryMatchesStem(entry, canonical) {
  const aliases = STEM_ALIAS_MAP[canonical] || [canonical];
  const tokens = getStemEntryAliases(entry);
  return aliases.map(normalizeStemToken).some((a) => tokens.has(a));
}

function findStemEntry(entries, candidates = []) {
  for (const candidate of candidates) {
    const match = entries.find((e) => entryMatchesStem(e, candidate));
    if (match) return match;
  }
  return null;
}

function isVocalEntry(entry) {
  if (!entry) return false;
  if (entry.kind === 'harmony') return true;
  return ['vocals', 'lead_vocal', 'voice1', 'voice2', 'voice3', 'soprano', 'alto', 'tenor']
    .some((c) => entryMatchesStem(entry, c));
}

function buildTrackSources(trackId, entries = []) {
  const seenUris = new Set();
  return (entries || []).filter(Boolean).map((entry, i) => {
    if (!entry?.uri || seenUris.has(entry.uri)) return null;
    seenUris.add(entry.uri);
    const suffix = normalizeStemToken(entry.id || entry.key || entry.type || entry.label || `source_${i}`) || `source_${i}`;
    return { id: `${trackId}:${suffix}`, uri: entry.uri, label: entry.label, type: entry.type };
  }).filter(Boolean);
}

function makeTrackDef({ id, label, sublabel, entries = [], externalUrl = null, color, icon }) {
  const sources = buildTrackSources(id, entries);
  return { id, label, sublabel, uri: sources[0]?.uri || null, sources, externalUrl, color, icon };
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

function resolveVocalBedUri(song, stems = {}, harmonies = {}, excludedUri = null) {
  const candidates = [
    getPlayableMediaUrl(stems.other),
    getPlayableMediaUrl(stems.drums),
    getPlayableMediaUrl(stems.bass),
    getPlayableMediaUrl(stems.guitar),
    getPlayableMediaUrl(stems.keys),
    getPlayableMediaUrl(stems.piano),
    getPlayableMediaUrl(stems.strings),
  ].filter(Boolean);
  return candidates.find((u) => u !== excludedUri) || null;
}

function resolveHarmonyTrack(role, harmonies = {}) {
  for (const key of (HARMONY_CANDIDATES[role] || ['voice1'])) {
    const uri = getPlayableMediaUrl(harmonies[key]);
    if (uri) {
      return { uri, label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ') };
    }
  }
  return { uri: null, label: 'Your Harmony' };
}

function resolveReferenceAudioUri(song, stems = {}, harmonies = {}) {
  const candidates = [
    // Direct song-level URL first (mirrors mobile's getDirectSongMediaUrl)
    getPlayableMediaUrl(song?.mediaUrl || song?.media_url || song?.audioUrl || song?.audio_url),
    getPlayableMediaUrl(stems.mix),
    getPlayableMediaUrl(stems.full_mix),
    getPlayableMediaUrl(stems.other),
    getPlayableMediaUrl(stems.vocals),
    getPlayableMediaUrl(harmonies.lead_vocal),
    getPlayableMediaUrl(harmonies.lead),
    getPlayableMediaUrl(harmonies.voice1),
    getPlayableMediaUrl(harmonies.soprano),
  ].filter(Boolean);
  return candidates[0] || null;
}

function detectPrimaryRole(roles = []) {
  const normalized = (roles || []).map(normalizeRole).filter(Boolean);
  const order = [
    'lead_vocal', 'worship_leader', 'bgv_1', 'bgv_2', 'bgv_3', 'music_director',
    'keyboard', 'piano', 'synth', 'electric_guitar', 'acoustic_guitar', 'rhythm_guitar',
    'bass', 'drums', 'percussion', 'strings', 'brass',
  ];
  for (const r of order) {
    if (normalized.includes(r)) return r;
  }
  return normalized[0] || 'lead_vocal';
}

function buildPersonalTracks(role, song) {
  const stems = song?.stems || {};
  const harmonies = song?.harmonies || {};
  const stemEntries = collectPracticeStemEntries(stems, harmonies);

  if (isPlaybackOnlyRole(role)) {
    const roleLabel = ROLE_DISPLAY[role] || 'Playback';
    const referenceUri = resolveReferenceAudioUri(song, stems, harmonies);
    const trackA = makeTrackDef({
      id: 'playback', label: 'Playback',
      sublabel: referenceUri ? `${roleLabel} reference mix` : 'Not available yet',
      entries: referenceUri
        ? [{ key: 'playback', type: 'reference', label: 'Playback', uri: referenceUri }]
        : [],
      color: '#3B82F6', icon: '🎧',
    });
    return [trackA, null];
  }

  if (VOCAL_ROLES.has(role)) {
    const harmonyEntry = findStemEntry(stemEntries, HARMONY_CANDIDATES[role] || ['voice1']);
    const harmonyTrack = harmonyEntry || resolveHarmonyTrack(role, harmonies);
    const instrumentalEntries = stemEntries.filter((e) => !isVocalEntry(e));
    const instrumentalBedUri = instrumentalEntries.length === 0
      ? resolveVocalBedUri(song, stems, harmonies, harmonyTrack.uri)
      : null;
    const hasInstrumental = instrumentalEntries.length > 0 || Boolean(instrumentalBedUri);
    const trackA = makeTrackDef({
      id: 'instrument_bed', label: 'Full Instruments',
      sublabel: hasInstrumental ? 'Everyone except your vocal part' : 'Not available yet',
      entries: instrumentalEntries.length > 0
        ? instrumentalEntries
        : (instrumentalBedUri
          ? [{ key: 'instrument_bed', type: 'reference', label: 'Full Instruments', uri: instrumentalBedUri }]
          : []),
      color: '#3B82F6', icon: '🎧',
    });
    const trackB = makeTrackDef({
      id: 'my_harmony',
      label: harmonyTrack.label || 'Your Part',
      sublabel: harmonyTrack.uri ? 'Your vocal part only' : 'Not available yet',
      entries: harmonyTrack.uri
        ? [{ key: harmonyTrack.label || 'my_harmony', type: 'harmony', label: harmonyTrack.label || 'Your Part', uri: harmonyTrack.uri }]
        : [],
      color: '#10B981', icon: '🎤',
    });
    return [trackA, trackB];
  }

  // Instrument role
  const canonicalStem = INSTRUMENT_STEM_MAP[role] || 'other';
  const myStemEntry = findStemEntry(stemEntries, [canonicalStem, 'other']);
  const stemLabel = ROLE_DISPLAY[role] || myStemEntry?.label || 'Your Part';
  const accompanimentEntries = stemEntries.filter((e) => {
    if (myStemEntry && e.uri === myStemEntry.uri) return false;
    if (e.key === 'other') return false;
    return true;
  });
  const iconFor = { bass: '🎸', drums: '🥁', keys: '🎹' };
  const trackA = makeTrackDef({
    id: 'full_mix', label: 'Full Song',
    sublabel: accompanimentEntries.length > 0 ? `Everyone except ${stemLabel}` : 'Not available yet',
    entries: accompanimentEntries, color: '#3B82F6', icon: '🎸',
  });
  const trackB = makeTrackDef({
    id: 'my_stem', label: stemLabel,
    sublabel: myStemEntry?.uri ? 'Your isolated track' : 'Not available yet',
    entries: myStemEntry?.uri
      ? [{ key: myStemEntry.key || canonicalStem, type: myStemEntry.type || canonicalStem, label: stemLabel, uri: myStemEntry.uri }]
      : [],
    color: '#F59E0B', icon: iconFor[canonicalStem] || '🎵',
  });
  return [trackA, trackB];
}

function isSameSong(a, b) {
  if (!a || !b) return false;
  const ka = [a.serviceItemId, a.id, a.songId, a.librarySongId].filter(Boolean);
  const kb = new Set([b.serviceItemId, b.id, b.songId, b.librarySongId].filter(Boolean));
  return ka.some((v) => kb.has(v));
}

function findSongIndex(list = [], song) {
  return (list || []).findIndex((s) => isSameSong(s, song));
}

function formatTime(ms) {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Howler multi-track engine ────────────────────────────────────────────────
// Each track is an array of Howl instances (one per stem source).
// Track A may have multiple sources; Track B is usually one.

function createHowls(sources, onEnd) {
  return sources.map((src, idx) => {
    const h = new Howl({
      src: [src.uri],
      html5: false,
      preload: true,
      volume: 1,
    });
    if (idx === 0 && onEnd) {
      h.on('end', onEnd);
    }
    return h;
  });
}

function stopHowls(howlsRef) {
  for (const h of howlsRef.current.flat()) {
    try { h.stop(); } catch {}
  }
}

function unloadHowls(howlsRef) {
  for (const h of howlsRef.current.flat()) {
    try { h.stop(); h.unload(); } catch {}
  }
  howlsRef.current = [[], []];
}

// ─── WaveformVisualizer ───────────────────────────────────────────────────────

function WaveformVisualizer({ isPlaying, progress, onSeek, loopStart, loopEnd, loopEnabled }) {
  const BAR_COUNT = 32;

  // Generate static random-ish bar heights once (seed based on bar index)
  const bars = React.useMemo(() => {
    const h = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      // Pseudo-random heights that look like a waveform
      const x = Math.sin(i * 2.39996) * 0.5 + 0.5;
      const y = Math.sin(i * 1.61803) * 0.5 + 0.5;
      h.push(0.2 + (x * 0.4 + y * 0.4));
    }
    return h;
  }, []);

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek && onSeek(Math.max(0, Math.min(1, pct)));
  };

  return (
    <div
      className="relative w-full h-20 flex items-end gap-[2px] px-1 cursor-pointer select-none"
      onClick={handleClick}
    >
      {/* Loop region highlight */}
      {loopEnabled && loopStart != null && loopEnd != null && (
        <div
          className="absolute top-0 bottom-0 bg-indigo-500/20 border-x border-indigo-500/60 pointer-events-none"
          style={{ left: `${loopStart * 100}%`, width: `${(loopEnd - loopStart) * 100}%` }}
        />
      )}

      {bars.map((h, i) => {
        const barPct = (i + 0.5) / BAR_COUNT;
        const played = barPct < progress;
        const inLoop = loopEnabled && loopStart != null && loopEnd != null
          && barPct >= loopStart && barPct <= loopEnd;

        return (
          <div
            key={i}
            className={`flex-1 rounded-full transition-colors duration-75 ${
              played
                ? inLoop ? 'bg-indigo-300' : 'bg-indigo-500'
                : inLoop ? 'bg-indigo-800/60' : 'bg-[#334155]'
            } ${isPlaying && played ? 'animate-pulse' : ''}`}
            style={{ height: `${h * 100}%` }}
          />
        );
      })}

      {/* Playhead */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
        style={{ left: `${progress * 100}%` }}
      />
    </div>
  );
}

// ─── TrackStrip ───────────────────────────────────────────────────────────────

function TrackStrip({ def, muted, onMuteToggle, isLoaded, isPlaying, isMine }) {
  if (!def) return null;
  const hasUri = !!def.uri;

  return (
    <div className={`flex items-center rounded-xl border overflow-hidden ${isMine ? 'border-indigo-500' : 'border-[#1E293B]'} bg-[#0F172A]`}>
      {/* Color bar */}
      <div className="w-1 self-stretch flex-shrink-0" style={{ backgroundColor: def.color }} />

      {/* Icon + labels */}
      <div className="flex-1 flex items-center gap-3 px-3 py-3 min-w-0">
        <span className="text-xl flex-shrink-0">{def.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#E2E8F0] truncate">{def.label}</p>
            {isMine && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-[#312E81] text-[10px] font-bold text-[#A5B4FC]">
                MINE
              </span>
            )}
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            {!hasUri
              ? 'Not available'
              : isLoaded
                ? (isPlaying && !muted ? '▶ Playing' : muted ? '🔇 Muted' : '⏸ Paused')
                : def.sublabel}
          </p>
        </div>
      </div>

      {/* Mute button */}
      <button
        onClick={hasUri ? onMuteToggle : undefined}
        className={`w-11 h-11 flex items-center justify-center mr-2 rounded-lg transition-colors flex-shrink-0 ${
          !hasUri
            ? 'opacity-25 cursor-default'
            : muted
              ? 'bg-[#1E293B] opacity-60'
              : 'hover:bg-[#1E293B]'
        }`}
      >
        <span className="text-lg">{muted ? '🔇' : '🔊'}</span>
      </button>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PersonalPracticeScreen() {
  const { user, profile } = useAuth();

  // Role derived from profile or user
  const [role, setRole] = useState(null);
  const roleRef = useRef(null);

  // Service & songs
  const [services, setServices] = useState([]); // upcoming accepted assignments
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [songs, setSongs] = useState([]);
  const songsRef = useRef([]);
  const [selectedSong, setSelectedSong] = useState(null);
  const selectedSongRef = useRef(null);
  const [search, setSearch] = useState('');
  const [pageLoading, setPageLoading] = useState(true);

  // Track definitions
  const [trackDefs, setTrackDefs] = useState([null, null]);
  const trackDefsRef = useRef([null, null]);

  // Stems / loading
  const [loadingStems, setLoadingStems] = useState(false);
  const [stemsReady, setStemsReady] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0); // ms
  const [duration, setDuration] = useState(0); // ms
  const [speed, setSpeed] = useState(1);

  // Per-track mute
  const [muteA, setMuteA] = useState(false);
  const [muteB, setMuteB] = useState(false);
  const muteARef = useRef(false);
  const muteBRef = useRef(false);

  // Loop section — two-press UX
  // loopPressCount: 0=idle, 1=start marked, 2=both marked
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopPressCount, setLoopPressCount] = useState(0);
  const [loopStart, setLoopStart] = useState(null); // fraction 0-1
  const [loopEnd, setLoopEnd] = useState(null);     // fraction 0-1
  const loopEnabledRef = useRef(false);
  const loopStartRef = useRef(null);
  const loopEndRef = useRef(null);

  // Auto-advance / repeat
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [repeatSong, setRepeatSong] = useState(false);

  // Howls — indexed [trackIdx][sourceIdx]
  const howlsRef = useRef([[], []]);

  // rAF progress polling
  const rafRef = useRef(null);
  const isPlayingRef = useRef(false);
  const speedRef = useRef(1);

  // Song-finished handler (stable ref)
  const handleSongFinishedRef = useRef(null);
  const queueLockRef = useRef(false);

  // Practice session timer
  const practiceEnterTimeRef = useRef(Date.now());

  // ── Sync refs ─────────────────────────────────────────────────────────────

  useEffect(() => { songsRef.current = songs; }, [songs]);
  useEffect(() => { selectedSongRef.current = selectedSong; }, [selectedSong]);
  useEffect(() => { trackDefsRef.current = trackDefs; }, [trackDefs]);

  // ── Practice session tracking ─────────────────────────────────────────────

  useEffect(() => {
    practiceEnterTimeRef.current = Date.now();
    return () => {
      const durationMs = Date.now() - practiceEnterTimeRef.current;
      if (durationMs < 10000) return;
      const song = selectedSongRef.current;
      const r = roleRef.current;
      const entry = {
        songId: song?.id || song?.songId || null,
        title: song?.title || null,
        role: r || null,
        practiceDate: new Date().toISOString(),
        durationMs,
      };
      // Fire-and-forget, capped at 100 entries
      store.get('practice_history').then((raw) => {
        const history = Array.isArray(raw) ? raw : [];
        history.push(entry);
        if (history.length > 100) history.splice(0, history.length - 100);
        return store.set('practice_history', history);
      }).catch(() => {});
    };
  }, []);

  // ── rAF progress polling ──────────────────────────────────────────────────

  const startProgressPolling = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const poll = () => {
      if (!isPlayingRef.current) return;
      // Use first Howl of Track A (or Track B) as master
      const masterHowl = howlsRef.current[0]?.[0] || howlsRef.current[1]?.[0];
      if (masterHowl) {
        const pos = (masterHowl.seek() || 0) * 1000;
        const dur = (masterHowl.duration() || 0) * 1000;
        setPosition(pos);
        if (dur > 0) setDuration(dur);

        // Loop check
        if (loopEnabledRef.current && loopStartRef.current != null && loopEndRef.current != null && dur > 0) {
          const pct = pos / dur;
          if (pct >= loopEndRef.current) {
            const seekSec = loopStartRef.current * (dur / 1000);
            for (const h of howlsRef.current.flat()) {
              try { h.seek(seekSec); } catch {}
            }
            setPosition(loopStartRef.current * dur);
          }
        }
      }
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
  }, []);

  const stopProgressPolling = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  // ── Unload all Howls on unmount ───────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopProgressPolling();
      unloadHowls(howlsRef);
    };
  }, [stopProgressPolling]);

  // ── Init: load role + services + initial setlist ──────────────────────────

  useEffect(() => {
    initScreen();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function initScreen() {
    setPageLoading(true);
    try {
      // Resolve role
      const profileRoles = profile?.roles || (profile?.role ? [profile.role] : []);
      const userRoleRaw = user?.role;
      const r = normalizeRole(userRoleRaw) || detectPrimaryRole(profileRoles);
      setRole(r);
      roleRef.current = r;

      // Load upcoming accepted assignments as service options
      const assignments = await store.getAssignments() || [];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const accepted = (Array.isArray(assignments) ? assignments : []).filter((a) => {
        if (a.status !== 'accepted') return false;
        const raw = a.service_date || a.date || '';
        const d = new Date(String(raw).includes('T') ? raw : raw + 'T00:00:00');
        return d >= today;
      });
      accepted.sort((a, b) => {
        const da = new Date(a.service_date || a.date || 0).getTime();
        const db = new Date(b.service_date || b.date || 0).getTime();
        return da - db;
      });
      setServices(accepted);

      // Auto-pick first service
      const firstSvcId = accepted[0]?.service_id || null;

      // Use assignment role if available
      if (accepted[0]?.role) {
        const ar = normalizeRole(accepted[0].role) || r;
        setRole(ar);
        roleRef.current = ar;
      }

      setSelectedServiceId(firstSvcId);
      const fetchedSongs = await fetchSetlist(firstSvcId);
      setSongs(fetchedSongs);
      songsRef.current = fetchedSongs;

      if (fetchedSongs.length > 0) {
        await selectSong(fetchedSongs[0], roleRef.current);
      }
    } catch (e) {
      console.warn('[PersonalPractice] init error:', e);
    } finally {
      setPageLoading(false);
    }
  }

  async function handleServiceChange(svcId) {
    setSelectedServiceId(svcId);
    stopProgressPolling();
    unloadHowls(howlsRef);
    setIsPlaying(false);
    isPlayingRef.current = false;
    setStemsReady(false);
    setPosition(0);
    setDuration(0);
    setSelectedSong(null);
    selectedSongRef.current = null;
    setSongs([]);
    songsRef.current = [];

    // Use role from matching assignment if available
    const match = services.find((a) => a.service_id === svcId);
    if (match?.role) {
      const ar = normalizeRole(match.role) || roleRef.current;
      setRole(ar);
      roleRef.current = ar;
    }

    const fetchedSongs = await fetchSetlist(svcId);
    setSongs(fetchedSongs);
    songsRef.current = fetchedSongs;
    if (fetchedSongs.length > 0) {
      await selectSong(fetchedSongs[0], roleRef.current);
    }
  }

  // ── API: Setlist ──────────────────────────────────────────────────────────

  async function fetchSetlist(svcId) {
    try {
      const headers = { 'x-org-id': SYNC_ORG_ID, 'x-secret-key': SYNC_SECRET_KEY };
      const res = await fetch(`${SYNC_URL}/sync/library-pull`, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      const library = data?.songs || data?.library || [];

      if (!svcId) return [];

      const sres = await fetch(`${SYNC_URL}/sync/setlist?serviceId=${svcId}`, { headers });
      if (!sres.ok) return [];
      const sdata = await sres.json();
      const setlistSongs = Array.isArray(sdata) ? sdata : (sdata?.songs || []);
      if (setlistSongs.length === 0) return [];
      return mergeSetlistWithLibrary(setlistSongs, library);
    } catch (e) {
      console.warn('[PersonalPractice] fetchSetlist error:', e);
      return [];
    }
  }

  // ── API: Stems ────────────────────────────────────────────────────────────

  async function fetchSongStems(song) {
    const lookupId = typeof song === 'string' ? song : getSongLookupId(song);
    if (!lookupId) return {};
    try {
      const headers = { 'x-org-id': SYNC_ORG_ID, 'x-secret-key': SYNC_SECRET_KEY };
      const res = await fetch(`${SYNC_URL}/sync/stems-result?songId=${encodeURIComponent(lookupId)}`, { headers });
      if (!res.ok) return {};
      const data = await res.json();
      return { stems: data?.stems || {}, harmonies: data?.harmonies || {} };
    } catch {
      return {};
    }
  }

  // ── API: Transpose ────────────────────────────────────────────────────────

  async function fetchTransposedStems(song, stems, harmonies) {
    const originalKey = song?.key || '';
    const serviceKey = song?.transposedKey || '';
    if (!serviceKey || !originalKey || serviceKey === originalKey) return { stems, harmonies };
    const semitones = calculateSemitoneShift(originalKey, serviceKey);
    if (!semitones) return { stems, harmonies };

    const toShift = {};
    for (const [k, v] of Object.entries(stems)) {
      if (typeof v === 'string' && v.startsWith('http')) toShift[k] = v;
    }
    const harmoniesToShift = {};
    for (const [k, v] of Object.entries(harmonies)) {
      const url = typeof v === 'string' ? v : v?.url;
      if (url && url.startsWith('http')) harmoniesToShift[k] = url;
    }
    const allToShift = { ...toShift, ...harmoniesToShift };
    if (Object.keys(allToShift).length === 0) return { stems, harmonies };

    try {
      const res = await fetch(`${CINESTAGE_URL}/stems/transpose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stems: allToShift, semitones }),
      });
      if (!res.ok) return { stems, harmonies };
      const data = await res.json();
      const shifted = data?.stems || {};
      const newStems = { ...stems };
      const newHarmonies = { ...harmonies };
      for (const [k, url] of Object.entries(shifted)) {
        if (k in stems) newStems[k] = url;
        if (k in harmoniesToShift) {
          newHarmonies[k] = typeof harmonies[k] === 'object' ? { ...harmonies[k], url } : url;
        }
      }
      return { stems: newStems, harmonies: newHarmonies };
    } catch (e) {
      console.warn('[PersonalPractice] transpose failed:', e?.message);
      return { stems, harmonies };
    }
  }

  // ── Song selection ────────────────────────────────────────────────────────

  function applySongSelection(song, defs) {
    selectedSongRef.current = song;
    trackDefsRef.current = defs;
    setSelectedSong(song);
    setTrackDefs(defs);
  }

  async function selectSong(song, currentRole, options = {}) {
    const { autoPlay = false } = options;

    stopProgressPolling();
    unloadHowls(howlsRef);
    setIsPlaying(false);
    isPlayingRef.current = false;
    setStemsReady(false);
    setPosition(0);
    setDuration(0);
    setMuteA(false); muteARef.current = false;
    setMuteB(false); muteBRef.current = false;
    setLoopPressCount(0);
    setLoopStart(null); setLoopEnd(null);
    loopStartRef.current = null; loopEndRef.current = null;

    const r = currentRole || roleRef.current || role;

    // First pass with existing metadata
    let enriched = song;
    let defs = buildPersonalTracks(r, enriched);
    applySongSelection(enriched, defs);

    // Second pass — fetch stems
    const lookupId = getSongLookupId(song);
    if (lookupId) {
      let { stems, harmonies } = await fetchSongStems(song);
      if (Object.keys(stems).length > 0 || Object.keys(harmonies).length > 0) {
        ({ stems, harmonies } = await fetchTransposedStems(song, stems, harmonies));
        enriched = { ...song, stems, harmonies };
        defs = buildPersonalTracks(r, enriched);
        applySongSelection(enriched, defs);
      }
    }

    if (autoPlay) {
      await loadAndPlay(enriched, defs, true);
    }

    return { song: enriched, defs };
  }

  // ── Audio loading ─────────────────────────────────────────────────────────

  async function loadPracticeAudio(song, defs) {
    const [defA, defB] = defs || [null, null];
    const sourcesA = getTrackSources(defA);
    const sourcesB = getTrackSources(defB);

    if (sourcesA.length === 0 && sourcesB.length === 0) return false;

    setLoadingStems(true);
    unloadHowls(howlsRef);

    try {
      await new Promise((resolve, reject) => {
        let totalExpected = sourcesA.length + sourcesB.length;
        let totalLoaded = 0;
        if (totalExpected === 0) { resolve(); return; }

        const onLoad = () => {
          totalLoaded++;
          if (totalLoaded >= totalExpected) resolve();
        };
        const onError = () => {
          totalLoaded++;
          if (totalLoaded >= totalExpected) resolve(); // fail open
        };

        const makeHowl = (src) => {
          const h = new Howl({ src: [src.uri], html5: false, preload: true, volume: 1, rate: speedRef.current });
          h.once('load', onLoad);
          h.once('loaderror', onError);
          return h;
        };

        const howlsA = sourcesA.map(makeHowl);
        const howlsB = sourcesB.map(makeHowl);

        // Song-finished fires when Track A master ends (or Track B if no A)
        const master = howlsA[0] || howlsB[0];
        if (master) {
          master.on('end', () => { handleSongFinishedRef.current?.(); });
        }

        howlsRef.current = [howlsA, howlsB];

        // Safety timeout
        setTimeout(() => resolve(), 15000);
      });

      // Apply mute state
      if (muteARef.current) {
        for (const h of howlsRef.current[0]) h.volume(0);
      }
      if (muteBRef.current) {
        for (const h of howlsRef.current[1]) h.volume(0);
      }

      setStemsReady(true);
      return true;
    } catch (e) {
      console.error('[PersonalPractice] loadPracticeAudio error:', e);
      return false;
    } finally {
      setLoadingStems(false);
    }
  }

  async function loadAndPlay(song, defs, play = false) {
    const loaded = await loadPracticeAudio(song, defs);
    if (loaded && play) {
      for (const h of howlsRef.current.flat()) {
        try { h.rate(speedRef.current); h.play(); } catch {}
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      startProgressPolling();
    }
    return loaded;
  }

  // ── Playback controls ─────────────────────────────────────────────────────

  async function handlePlayPause() {
    if (!stemsReady) {
      const loaded = await loadPracticeAudio(selectedSongRef.current, trackDefsRef.current);
      if (loaded) {
        for (const h of howlsRef.current.flat()) {
          try { h.rate(speedRef.current); h.play(); } catch {}
        }
        setIsPlaying(true);
        isPlayingRef.current = true;
        startProgressPolling();
      }
      return;
    }
    if (isPlaying) {
      stopProgressPolling();
      for (const h of howlsRef.current.flat()) { try { h.pause(); } catch {} }
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      for (const h of howlsRef.current.flat()) {
        try { h.rate(speedRef.current); h.play(); } catch {}
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      startProgressPolling();
    }
  }

  async function handleRestart() {
    for (const h of howlsRef.current.flat()) { try { h.seek(0); } catch {} }
    setPosition(0);
  }

  async function handleSkip(deltaMs) {
    const masterHowl = howlsRef.current[0]?.[0] || howlsRef.current[1]?.[0];
    if (!masterHowl) return;
    const currentSec = masterHowl.seek() || 0;
    const durSec = masterHowl.duration() || 0;
    const newSec = Math.max(0, Math.min(currentSec + deltaMs / 1000, durSec));
    for (const h of howlsRef.current.flat()) { try { h.seek(newSec); } catch {} }
    setPosition(newSec * 1000);
  }

  async function handleSeek(pct) {
    if (!duration) return;
    const sec = (pct * duration) / 1000;
    for (const h of howlsRef.current.flat()) { try { h.seek(sec); } catch {} }
    setPosition(pct * duration);
  }

  async function handleSpeedChange(s) {
    setSpeed(s);
    speedRef.current = s;
    for (const h of howlsRef.current.flat()) { try { h.rate(s); } catch {} }
  }

  // ── Loop two-press UX ─────────────────────────────────────────────────────

  function handleSetLoop() {
    if (!stemsReady || duration === 0) return;
    const masterHowl = howlsRef.current[0]?.[0] || howlsRef.current[1]?.[0];
    const currentSec = masterHowl ? (masterHowl.seek() || 0) : 0;
    const currentPct = duration > 0 ? (currentSec * 1000) / duration : 0;

    if (loopPressCount === 0) {
      // First press: mark start
      setLoopStart(currentPct);
      setLoopEnd(null);
      loopStartRef.current = currentPct;
      loopEndRef.current = null;
      setLoopPressCount(1);
      setLoopEnabled(false);
      loopEnabledRef.current = false;
    } else {
      // Second press: mark end (ensure end > start)
      let endPct = currentPct;
      if (endPct <= loopStartRef.current) endPct = Math.min(loopStartRef.current + 0.05, 1);
      setLoopEnd(endPct);
      loopEndRef.current = endPct;
      setLoopPressCount(2);
      setLoopEnabled(true);
      loopEnabledRef.current = true;
    }
  }

  function handleClearLoop() {
    setLoopEnabled(false); loopEnabledRef.current = false;
    setLoopStart(null); setLoopEnd(null);
    loopStartRef.current = null; loopEndRef.current = null;
    setLoopPressCount(0);
  }

  // ── Mute ─────────────────────────────────────────────────────────────────

  function toggleMuteA() {
    const next = !muteA;
    setMuteA(next); muteARef.current = next;
    for (const h of howlsRef.current[0]) { try { h.volume(next ? 0 : 1); } catch {} }
  }

  function toggleMuteB() {
    const next = !muteB;
    setMuteB(next); muteBRef.current = next;
    for (const h of howlsRef.current[1]) { try { h.volume(next ? 0 : 1); } catch {} }
  }

  // ── Queue advance ─────────────────────────────────────────────────────────

  async function jumpSong(delta) {
    const idx = findSongIndex(songsRef.current, selectedSongRef.current);
    if (idx < 0) return;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= songsRef.current.length) return;
    await selectSong(songsRef.current[nextIdx], roleRef.current, { autoPlay: isPlaying });
  }

  handleSongFinishedRef.current = async () => {
    if (queueLockRef.current) return;
    queueLockRef.current = true;
    try {
      stopProgressPolling();
      setIsPlaying(false);
      isPlayingRef.current = false;

      if (repeatSong && selectedSongRef.current) {
        const loaded = await loadPracticeAudio(selectedSongRef.current, trackDefsRef.current);
        if (loaded) {
          for (const h of howlsRef.current.flat()) { try { h.rate(speedRef.current); h.play(); } catch {} }
          setIsPlaying(true);
          isPlayingRef.current = true;
          startProgressPolling();
        }
        return;
      }

      if (!autoAdvance) return;
      const idx = findSongIndex(songsRef.current, selectedSongRef.current);
      if (idx < 0 || idx >= songsRef.current.length - 1) return;

      for (let i = idx + 1; i < songsRef.current.length; i++) {
        const result = await selectSong(songsRef.current[i], roleRef.current, { autoPlay: true });
        if (result) return;
      }
    } catch (e) {
      console.warn('[PersonalPractice] queue advance error:', e);
    } finally {
      queueLockRef.current = false;
    }
  };

  // ── Toggle helpers ────────────────────────────────────────────────────────

  function toggleAutoAdvance() {
    setAutoAdvance((prev) => { if (!prev) setRepeatSong(false); return !prev; });
  }

  function toggleRepeatSong() {
    setRepeatSong((prev) => { if (!prev) setAutoAdvance(false); return !prev; });
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const progress = duration > 0 ? position / duration : 0;
  const [defA, defB] = trackDefs;
  const playbackOnlyMode = role ? isPlaybackOnlyRole(role) : false;
  const hasDirectAudio = getTrackSources(defA).length > 0 || getTrackSources(defB).length > 0;
  const selectedIdx = findSongIndex(songs, selectedSong);
  const hasPrev = selectedIdx > 0;
  const hasNext = selectedIdx >= 0 && selectedIdx < songs.length - 1;
  const filteredSongs = search.trim()
    ? songs.filter((s) => (s.title || '').toLowerCase().includes(search.toLowerCase()))
    : songs;

  const loopBtnLabel = loopPressCount === 0
    ? 'Set Loop'
    : loopPressCount === 1
      ? 'Set End'
      : 'Loop On';

  // ── Service display name helper ───────────────────────────────────────────
  function svcLabel(svc) {
    const date = svc.service_date || svc.date || '';
    const d = date ? new Date(String(date).includes('T') ? date : date + 'T00:00:00') : null;
    const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    return [dateStr, svc.service_name || svc.name || ''].filter(Boolean).join(' · ') || 'Service';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#020617]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#9CA3AF] text-sm">Loading your practice session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#020617] text-white overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-[#1E293B]">
        <div>
          <h1 className="text-lg font-bold text-[#F1F5F9]">My Practice</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {role && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-700 text-white">
                {ROLE_DISPLAY[role] || role}
              </span>
            )}
            {selectedSong?.key && (
              <span className="text-xs text-[#94A3B8] bg-[#0F172A] rounded-lg px-2 py-0.5">
                Key: {selectedSong.key}
              </span>
            )}
            {selectedSong?.bpm && (
              <span className="text-xs text-[#94A3B8] bg-[#0F172A] rounded-lg px-2 py-0.5">
                {selectedSong.bpm} BPM
              </span>
            )}
          </div>
        </div>
        {/* Speed controls */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-[#64748B] mr-1">Speed:</span>
          {PLAYBACK_SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => handleSpeedChange(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                speed === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-[#0F172A] text-[#94A3B8] border border-[#334155] hover:border-indigo-500'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* ── 3-panel body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT PANEL: Service selector + song list ── */}
        <div className="w-[300px] flex-shrink-0 flex flex-col border-r border-[#1E293B] overflow-hidden">

          {/* Service selector */}
          {services.length > 0 && (
            <div className="flex-shrink-0 p-3 border-b border-[#1E293B]">
              <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1.5">Service</p>
              <select
                value={selectedServiceId || ''}
                onChange={(e) => handleServiceChange(e.target.value || null)}
                className="w-full bg-[#0F172A] border border-[#334155] text-[#E2E8F0] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                {services.map((svc) => (
                  <option key={svc.service_id || svc.id} value={svc.service_id || svc.id}>
                    {svcLabel(svc)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search */}
          <div className="flex-shrink-0 px-3 pt-3 pb-2">
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1.5">Songs</p>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search songs…"
              className="w-full bg-[#0F172A] border border-[#334155] text-[#E2E8F0] text-xs rounded-lg px-3 py-2 placeholder-[#64748B] focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Song list */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
            {filteredSongs.length === 0 && (
              <p className="text-xs text-[#64748B] text-center pt-8">
                {songs.length === 0 ? 'No songs for this service.' : 'No results.'}
              </p>
            )}
            {filteredSongs.map((song, i) => {
              const active = isSameSong(song, selectedSong);
              return (
                <button
                  key={song.id || song.songId || i}
                  onClick={() => selectSong(song, roleRef.current)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                    active
                      ? 'bg-indigo-700 border-indigo-500 text-white'
                      : 'bg-[#0F172A] border-[#1E293B] text-[#94A3B8] hover:border-[#334155] hover:text-white'
                  }`}
                >
                  <p className="text-xs font-semibold truncate">{song.title || 'Untitled'}</p>
                  {song.key && (
                    <p className={`text-[10px] mt-0.5 ${active ? 'text-indigo-200' : 'text-[#64748B]'}`}>
                      {song.key}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CENTER PANEL: Waveform + transport ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col justify-center px-8 py-6 space-y-6">

            {/* Song title */}
            <div className="text-center">
              {selectedSong ? (
                <h2 className="text-2xl font-extrabold text-[#F8FAFC]">
                  {selectedSong.title || 'Untitled'}
                </h2>
              ) : (
                <p className="text-[#64748B] text-base">Select a song from the list</p>
              )}
            </div>

            {selectedSong && (
              <>
                {/* Waveform */}
                <div className="bg-[#0F172A] rounded-2xl border border-[#1E293B] p-4">
                  <WaveformVisualizer
                    isPlaying={isPlaying}
                    progress={progress}
                    onSeek={stemsReady ? handleSeek : undefined}
                    loopStart={loopStart}
                    loopEnd={loopEnd}
                    loopEnabled={loopEnabled}
                  />
                  {/* Time display */}
                  <div className="flex justify-between mt-2 text-xs text-[#64748B]">
                    <span>{formatTime(position)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Loop section info */}
                {loopPressCount === 1 && (
                  <div className="flex justify-center">
                    <span className="px-3 py-1.5 rounded-full bg-[#1E1B4B] border border-indigo-600 text-xs font-bold text-[#A5B4FC]">
                      Loop start marked — click "Set End" to close the loop
                    </span>
                  </div>
                )}
                {loopEnabled && loopStart != null && loopEnd != null && (
                  <div className="flex justify-center">
                    <span className="px-3 py-1.5 rounded-full bg-[#1E1B4B] border border-indigo-500 text-xs font-bold text-[#A5B4FC]">
                      ↻ Loop: {Math.round(loopStart * 100)}% – {Math.round(loopEnd * 100)}%
                    </span>
                  </div>
                )}

                {/* Transport row */}
                <div className="flex items-center justify-center gap-3">
                  {/* Prev song */}
                  <button
                    onClick={() => jumpSong(-1)}
                    disabled={!hasPrev || loadingStems}
                    className="w-10 h-10 rounded-full bg-[#0F172A] border border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-white disabled:opacity-30 transition-colors text-lg"
                  >
                    ⏮
                  </button>

                  {/* Restart */}
                  <button
                    onClick={handleRestart}
                    disabled={!stemsReady}
                    className="w-10 h-10 rounded-full bg-[#0F172A] border border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-white disabled:opacity-30 transition-colors text-lg"
                  >
                    ↺
                  </button>

                  {/* -15s */}
                  <button
                    onClick={() => handleSkip(-15000)}
                    disabled={!stemsReady}
                    className="w-10 h-10 rounded-full bg-[#0F172A] border border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-white disabled:opacity-30 transition-colors text-xs font-bold"
                  >
                    -15
                  </button>

                  {/* Play/Pause */}
                  <button
                    onClick={handlePlayPause}
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl text-white transition-colors ${
                      loadingStems
                        ? 'bg-[#374151]'
                        : isPlaying
                          ? 'bg-violet-700'
                          : 'bg-indigo-600 hover:bg-indigo-500'
                    }`}
                  >
                    {loadingStems ? (
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : isPlaying ? '■' : '▶'}
                  </button>

                  {/* +15s */}
                  <button
                    onClick={() => handleSkip(15000)}
                    disabled={!stemsReady}
                    className="w-10 h-10 rounded-full bg-[#0F172A] border border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-white disabled:opacity-30 transition-colors text-xs font-bold"
                  >
                    +15
                  </button>

                  {/* Set/Clear Loop */}
                  <button
                    onClick={loopPressCount === 2 ? handleClearLoop : handleSetLoop}
                    disabled={!stemsReady}
                    className={`w-10 h-10 rounded-full border flex items-center justify-center text-xs font-bold disabled:opacity-30 transition-colors ${
                      loopEnabled
                        ? 'bg-[#312E81] border-indigo-500 text-[#A5B4FC]'
                        : loopPressCount === 1
                          ? 'bg-[#1E1B4B] border-indigo-700 text-[#C4B5FD]'
                          : 'bg-[#0F172A] border-[#334155] text-[#94A3B8] hover:text-white'
                    }`}
                    title={loopPressCount === 2 ? 'Clear Loop' : loopBtnLabel}
                  >
                    ⇄
                  </button>

                  {/* Next song */}
                  <button
                    onClick={() => jumpSong(1)}
                    disabled={!hasNext || loadingStems}
                    className="w-10 h-10 rounded-full bg-[#0F172A] border border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-white disabled:opacity-30 transition-colors text-lg"
                  >
                    ⏭
                  </button>
                </div>

                {/* Loop button label */}
                <div className="flex justify-center">
                  <span className="text-xs text-[#64748B]">
                    Loop: <span className="font-semibold text-[#94A3B8]">
                      {loopPressCount === 0 ? 'Off — click ⇄ to set start' : loopPressCount === 1 ? 'Start marked — click ⇄ again to set end' : 'Active — click ⇄ to clear'}
                    </span>
                  </span>
                </div>

                {/* Mode toggles */}
                <div className="flex justify-center gap-3">
                  <button
                    onClick={toggleAutoAdvance}
                    className={`px-4 py-2 rounded-full border text-xs font-bold transition-colors ${
                      autoAdvance
                        ? 'bg-[#312E81] border-indigo-500 text-[#EDE9FE]'
                        : 'bg-[#0F172A] border-[#334155] text-[#94A3B8] hover:border-[#6B7280]'
                    }`}
                  >
                    {autoAdvance ? 'Auto Next: On' : 'Auto Next: Off'}
                  </button>
                  <button
                    onClick={toggleRepeatSong}
                    className={`px-4 py-2 rounded-full border text-xs font-bold transition-colors ${
                      repeatSong
                        ? 'bg-[#312E81] border-indigo-500 text-[#EDE9FE]'
                        : 'bg-[#0F172A] border-[#334155] text-[#94A3B8] hover:border-[#6B7280]'
                    }`}
                  >
                    {repeatSong ? 'Repeat Song: On' : 'Repeat Song: Off'}
                  </button>
                </div>

                {/* Mode hint */}
                <p className="text-center text-xs text-[#64748B] leading-relaxed">
                  {repeatSong
                    ? 'The current song will restart automatically when it ends.'
                    : autoAdvance
                      ? 'The next song in this setlist will start automatically.'
                      : 'Manual song selection mode.'}
                </p>
              </>
            )}

            {/* No service selected */}
            {!selectedSong && songs.length === 0 && (
              <p className="text-center text-[#64748B] text-sm mt-8">
                {services.length === 0
                  ? 'No upcoming accepted services. Accept an assignment to see your setlist.'
                  : 'No songs for this service yet.'}
              </p>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: 2-track mixer ── */}
        <div className="w-[280px] flex-shrink-0 flex flex-col border-l border-[#1E293B] overflow-hidden">
          <div className="flex-shrink-0 px-4 py-3 border-b border-[#1E293B]">
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
              {playbackOnlyMode ? 'Playback' : 'Your Personal Mix'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {selectedSong ? (
              <>
                {/* Track A */}
                {defA && (
                  <TrackStrip
                    def={defA}
                    muted={muteA}
                    onMuteToggle={toggleMuteA}
                    isLoaded={stemsReady}
                    isPlaying={isPlaying && !muteA}
                    isMine={false}
                  />
                )}

                {/* Track B */}
                {defB && (
                  <TrackStrip
                    def={defB}
                    muted={muteB}
                    onMuteToggle={toggleMuteB}
                    isLoaded={stemsReady}
                    isPlaying={isPlaying && !muteB}
                    isMine
                  />
                )}

                {/* Load button */}
                {!stemsReady && hasDirectAudio && !loadingStems && (
                  <button
                    onClick={() => loadPracticeAudio(selectedSong, trackDefs)}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors mt-2"
                  >
                    {playbackOnlyMode ? 'Load Playback' : 'Load My Tracks'}
                  </button>
                )}

                {loadingStems && (
                  <div className="flex items-center justify-center gap-2 py-3 text-xs text-[#64748B]">
                    <span className="w-4 h-4 border border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    Loading tracks…
                  </div>
                )}

                {/* No stems message */}
                {!hasDirectAudio && (
                  <div className="p-3 bg-[#0A0F1E] border border-[#1E293B] rounded-xl mt-2">
                    <p className="text-xs text-[#64748B] text-center leading-relaxed">
                      {playbackOnlyMode
                        ? 'Playback audio not available yet — ask your admin to upload the song audio.'
                        : 'Stems not processed yet — ask your admin to run CineStage on this song.'}
                    </p>
                  </div>
                )}

                {/* Tip */}
                <div className="p-3 bg-[#0A1628] border-l-2 border-indigo-600 rounded-r-xl rounded-l mt-2">
                  <p className="text-xs text-[#94A3B8] leading-relaxed">
                    {playbackOnlyMode
                      ? 'Playback-only mode for non-performing roles.'
                      : 'Mute your track to practice along with the rest of the band.'}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#64748B] text-center pt-6">
                Select a song to see your tracks.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
