/**
 * Setlist Screen - Ultimate Playback
 * Live setlist from sync server — role-aware, with lyrics for vocalists
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile, getAssignments } from '../services/storage';

import { ROLE_LABELS } from '../models_v2/models';
// WaveformBar removed — audio handled in PersonalPractice screen

import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

function normalizeRoleKey(role) {
  const raw = String(role || '').trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  const aliases = {
    leader: 'worship_leader',
    'worship leader': 'worship_leader',
    'music director': 'music_director',
    'vocal lead': 'lead_vocal',
    'lead vocal': 'lead_vocal',
    'lead vocals': 'lead_vocal',
    'vocal bgv': 'bgv_1',
    'bgv 1': 'bgv_1',
    'bgv 2': 'bgv_2',
    'bgv 3': 'bgv_3',
    keys: 'keyboard',
    keyboardist: 'keyboard',
    'synth/pad': 'synth',
    'electric guitar': 'electric_guitar',
    guitarist: 'electric_guitar',
    'acoustic guitar': 'acoustic_guitar',
    'acoustic guitarist': 'acoustic_guitar',
    bassist: 'bass',
    drummer: 'drums',
    vocalist: 'lead_vocal',
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
    lighting: 'media_tech',
  };

  return aliases[lower] || lower.replace(/\s+/g, '_');
}

// Roles that get lyrics / vocal part access.
const VOCAL_ROLES = new Set([
  'worship_leader', 'lead_vocal', 'bgv_1', 'bgv_2', 'bgv_3', 'music_director',
]);

// Roles that get the Vocal Lineup view (who sings what — for mixing)
const SOUND_TECH_ROLES = new Set([
  'sound_tech', 'foh_engineer', 'monitor_engineer', 'stream_engineer',
]);

// Roles that get lyrics + light cues (no practice mix)
const MEDIA_TECH_ROLES = new Set([
  'media_tech',
]);

// All vocal part keys used in UM's SATB + Voice parts assignment UI
const PART_LABELS = {
  // Playback legacy keys
  lead: 'Lead Vocal', lead_vocal: 'Lead Vocal',
  bgv1: 'BGV 1', bgv_1: 'BGV 1',
  bgv2: 'BGV 2', bgv_2: 'BGV 2',
  bgv3: 'BGV 3', bgv_3: 'BGV 3',
  bgv: 'BGV', harmony: 'Harmony',
  // UM SATB parts
  soprano: 'Soprano', mezzo: 'Mezzo-Soprano', alto: 'Alto',
  tenor: 'Tenor', baritone: 'Baritone', bass: 'Bass Part',
  // UM voice parts
  voice1: '1st Voice', voice2: '2nd Voice', voice3: '3rd Voice',
  voice4: '4th Voice', voice5: '5th Voice',
};

// Maps role → instrument name (key in song.instrumentNotes).
// Accepts both Playback snake_case IDs and UM display labels.
const ROLE_TO_INSTRUMENT = {
  // snake_case
  keyboard: 'Keys', piano: 'Keys', synth: 'Synth/Pad',
  electric_guitar: 'Electric Guitar', rhythm_guitar: 'Electric Guitar',
  acoustic_guitar: 'Acoustic Guitar', bass: 'Bass',
  drums: 'Drums', percussion: 'Drums',
  strings: 'Keys', brass: 'Keys',
  worship_leader: 'Acoustic Guitar', music_director: 'Keys',
  // UM display labels
  'Keys': 'Keys', 'Synth/Pad': 'Synth/Pad',
  'Electric Guitar': 'Electric Guitar', 'Acoustic Guitar': 'Acoustic Guitar',
  'Bass': 'Bass', 'Drums': 'Drums', 'Tracks': 'Synth/Pad',
};

// Display order for the instrument picker
const CHART_INSTRUMENTS = ['Keys', 'Acoustic Guitar', 'Electric Guitar', 'Bass', 'Synth/Pad', 'Drums'];

// Emoji per instrument for the picker
const INSTRUMENT_ICON = {
  'Keys': '🎹',
  'Acoustic Guitar': '🎸',
  'Electric Guitar': '🎸',
  'Bass': '🎸',
  'Synth/Pad': '🎛',
  'Drums': '🥁',
};

function normalizeLookupText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeLookupCompact(value) {
  return normalizeLookupText(value).replace(/[^a-z0-9]/g, '');
}

function normalizeLookupEmail(value) {
  const normalized = normalizeLookupText(value);
  return normalized.includes('@') ? normalized : '';
}

function normalizeLookupPhone(value) {
  return String(value || '').replace(/\D+/g, '');
}

function buildDisplayName(name, lastName = '') {
  return [name, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function addNameVariants(target, name, lastName = '') {
  const fullName = buildDisplayName(name, lastName);
  if (!fullName) return;
  const normalized = normalizeLookupText(fullName);
  if (normalized) target.add(normalized);
  const compact = normalizeLookupCompact(fullName);
  if (compact) target.add(compact);
}

function buildPeopleById(people = []) {
  return people.reduce((acc, person) => {
    if (person?.id) acc[person.id] = person;
    return acc;
  }, {});
}

function buildProfileLookup(profile) {
  const emails = new Set();
  const phones = new Set();
  const names = new Set();

  [profile?.email, profile?.authIdentifier].forEach((value) => {
    const email = normalizeLookupEmail(value);
    if (email) emails.add(email);
    const phone = normalizeLookupPhone(value);
    if (phone.length >= 7) phones.add(phone);
  });

  const directPhone = normalizeLookupPhone(profile?.phone);
  if (directPhone.length >= 7) phones.add(directPhone);

  addNameVariants(names, profile?.name, profile?.lastName);
  addNameVariants(names, profile?.name);

  return {
    id: String(profile?.id || '').trim(),
    emails,
    phones,
    names,
  };
}

function buildAssignmentLookup(data, peopleById = {}) {
  const person = peopleById?.[data?.personId] || null;
  const emails = new Set();
  const phones = new Set();
  const names = new Set();

  [data?.email, person?.email].forEach((value) => {
    const email = normalizeLookupEmail(value);
    if (email) emails.add(email);
  });

  [data?.phone, person?.phone].forEach((value) => {
    const phone = normalizeLookupPhone(value);
    if (phone.length >= 7) phones.add(phone);
  });

  addNameVariants(names, data?.name, data?.lastName);
  addNameVariants(names, person?.name, person?.lastName);
  addNameVariants(names, person?.name);

  return { person, emails, phones, names };
}

function hasSharedLookupValue(left, right) {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function findMatchingVocalPart(songId, vocalAssignments, profile, peopleById = {}) {
  if (!profile || !songId) return null;
  const parts = vocalAssignments[songId];
  if (!parts) return null;

  const profileLookup = buildProfileLookup(profile);
  for (const [partKey, data] of Object.entries(parts)) {
    if (!data) continue;

    const assignmentLookup = buildAssignmentLookup(data, peopleById);
    if (
      profileLookup.id &&
      data.personId &&
      String(data.personId).trim() === profileLookup.id
    ) {
      return {
        partKey,
        ...(assignmentLookup.person || {}),
        ...data,
        name: data.name || assignmentLookup.person?.name || '',
      };
    }
    if (hasSharedLookupValue(profileLookup.emails, assignmentLookup.emails)) {
      return {
        partKey,
        ...(assignmentLookup.person || {}),
        ...data,
        name: data.name || assignmentLookup.person?.name || '',
      };
    }
    if (hasSharedLookupValue(profileLookup.phones, assignmentLookup.phones)) {
      return {
        partKey,
        ...(assignmentLookup.person || {}),
        ...data,
        name: data.name || assignmentLookup.person?.name || '',
      };
    }
    if (hasSharedLookupValue(profileLookup.names, assignmentLookup.names)) {
      return {
        partKey,
        ...(assignmentLookup.person || {}),
        ...data,
        name: data.name || assignmentLookup.person?.name || '',
      };
    }
  }

  return null;
}

function getAssignmentPriority(assignment) {
  const normalizedRole = normalizeRoleKey(assignment?.role);
  if (normalizedRole === 'lead_vocal') return 0;
  if (VOCAL_ROLES.has(normalizedRole)) return 1;
  if (ROLE_TO_INSTRUMENT[normalizedRole]) return 2;
  if (SOUND_TECH_ROLES.has(normalizedRole) || MEDIA_TECH_ROLES.has(normalizedRole)) return 3;
  return 4;
}

function pickPreferredAssignment(assignments = []) {
  if (!Array.isArray(assignments) || assignments.length === 0) return null;

  return assignments.reduce((best, current) => {
    if (!best) return current;
    return getAssignmentPriority(current) < getAssignmentPriority(best)
      ? current
      : best;
  }, null);
}

const SETLIST_HIDE_AFTER_SERVICE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Chord transposition & capo engine (ported from UM's chordTranspose.js) ──
const NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_KEY_SET = new Set(['F','Bb','Eb','Ab','Db','Gb']);

function noteIdx(n) {
  const s = NOTES_SHARP.indexOf(n); return s >= 0 ? s : NOTES_FLAT.indexOf(n);
}
function idxToNote(i, flats) {
  const n = ((i % 12) + 12) % 12; return flats ? NOTES_FLAT[n] : NOTES_SHARP[n];
}
function useFlatsForKey(key) { return FLAT_KEY_SET.has((key || '').replace(/m$/, '').trim()); }

// Inline chord match (for substitution in chord lines)
const CHORD_IN_LINE_RE = /[A-G][#b]?(m|M|maj|min|dim|aug|sus[24]?|add|dom)?[0-9]?(\/[A-G][#b]?)?/g;
// Full-token chord match (for detecting chord-only lines)
const CHORD_TOKEN_RE = /^[A-G][#b]?(m|M|maj|min|dim|aug|sus[24]?|add|dom)?[0-9]?(\/[A-G][#b]?)?$/;

function isChordLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (t.split('|').length > 2) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  const n = tokens.filter(tok => CHORD_TOKEN_RE.test(tok)).length;
  return n > 0 && n / tokens.length > 0.5;
}

function transposeToken(chord, semitones, flats) {
  if (semitones === 0) return chord;
  const m = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return chord;
  const [, root, rest] = m;
  const slashM = rest.match(/^(.*?)\/([A-G][#b]?)$/);
  if (slashM) {
    const [, mod, bass] = slashM;
    return idxToNote(noteIdx(root) + semitones, flats) + mod + '/' +
           idxToNote(noteIdx(bass) + semitones, flats);
  }
  return idxToNote(noteIdx(root) + semitones, flats) + rest;
}

/**
 * Transposes every chord line in a chart by `semitones` (negative = down).
 * Lyric lines and section labels are left untouched.
 */
function transposeChart(chart, semitones, targetKey) {
  if (!chart || semitones === 0) return chart;
  const flats = useFlatsForKey(targetKey);
  return chart.split('\n').map(line => {
    if (!isChordLine(line)) return line;
    return line.replace(CHORD_IN_LINE_RE, tok => transposeToken(tok, semitones, flats));
  }).join('\n');
}

/**
 * Given a concert key and capo fret, returns the key of shapes the guitarist reads.
 * e.g. concert G + capo 2 → shapes in F
 */
function capoShapesKey(concertKey, capoFret) {
  if (!concertKey || capoFret === 0) return concertKey || '';
  const idx = noteIdx(concertKey.trim());
  if (idx < 0) return concertKey;
  // Guitarists prefer sharps (E, A, D, G, C shapes) — use NOTES_SHARP
  return NOTES_SHARP[((idx - capoFret) % 12 + 12) % 12];
}

const GUITAR_CAPO_OPTIONS = [0, 1, 2, 3, 4, 5, 7];
const GUITAR_INSTRUMENTS  = new Set(['Acoustic Guitar', 'Electric Guitar']);

// ── Chord-stripping for vocal view ──────────────────────────────────────────
const isChordToken = t => CHORD_TOKEN_RE.test(t.trim());
const isChordOnlyLine = line => {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every(isChordToken);
};

/**
 * Takes a raw chord+lyric lead sheet and returns a vocals-only version:
 * - Keeps section cues: [Intro], [Verse 1], [Chorus], [Bridge], [Outro] etc.
 * - Removes chord-only lines (A  E/G#  Bm ...)
 * - Strips inline [Chord] annotations from lyric lines
 * - Removes song metadata header lines (Song:, Key:, Tempo: etc.)
 */
function stripChordsForVocals(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip metadata header rows
    if (/^(Song|Artist|Key|Tempo|Time\s*sig|Capo)\s*:/i.test(trimmed)) continue;

    // Section label line: [Intro], [Verse 1], [Chorus], [Primeira Parte] etc.
    if (/^\[/.test(trimmed)) {
      const m = trimmed.match(/^\[([^\]]+)\]/);
      if (m) {
        const inner = m[1].trim();
        // If the bracket contains a single chord (e.g. [G]) skip the whole line
        if (isChordToken(inner)) continue;
        out.push(`[${inner}]`); // keep only the section label, drop any trailing chords
      }
      continue;
    }

    // Chord-only line — skip
    if (isChordOnlyLine(trimmed)) continue;

    // Lyric line — strip inline [Chord] annotations like [G], [Am], [F#m/C]
    const stripped = line
      .replace(/\[[A-G][#b]?[^\]]*\]/g, '') // remove [Chord] tokens
      .replace(/[ \t]{2,}/g, ' ');           // collapse multiple spaces left by removed chords
    out.push(stripped);
  }

  // Collapse 3+ consecutive blank lines into a single blank line
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseServiceEndMs(assignment) {
  const explicitEnd = assignment?.service_end_at || assignment?.end_at || assignment?.completed_at || assignment?.serviceDateTime;
  if (explicitEnd) {
    const endMs = new Date(explicitEnd).getTime();
    if (Number.isFinite(endMs)) return endMs;
  }

  const serviceDate = assignment?.service_date || assignment?.date;
  if (!serviceDate) return null;

  // If service_date already has time (ISO), use it directly.
  if (String(serviceDate).includes('T')) {
    const withTimeMs = new Date(serviceDate).getTime();
    if (Number.isFinite(withTimeMs)) return withTimeMs;
  }

  const timeRaw = assignment?.service_time || assignment?.time || '';
  const m = String(timeRaw).match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const hh = Math.max(0, Math.min(23, Number(m[1] || 0)));
    const mm = Math.max(0, Math.min(59, Number(m[2] || 0)));
    const dt = new Date(serviceDate);
    if (Number.isFinite(dt.getTime())) {
      dt.setHours(hh, mm, 0, 0);
      return dt.getTime();
    }
  }

  // Safe fallback: if no time exists, treat service end as end-of-day local.
  const dt = new Date(serviceDate);
  if (!Number.isFinite(dt.getTime())) return null;
  dt.setHours(23, 59, 59, 999);
  return dt.getTime();
}

function isSetlistExpired(assignment, nowMs = Date.now()) {
  const endMs = parseServiceEndMs(assignment);
  if (!endMs) return false;
  return nowMs > endMs + SETLIST_HIDE_AFTER_SERVICE_MS;
}

export default function SetlistScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [setlist, setSetlist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [expiredCount, setExpiredCount] = useState(0);
  const [vocalAssignments, setVocalAssignments] = useState({});
  const [peopleById, setPeopleById] = useState({});
  // All accepted assignments for the currently selected service (a person may have 2+ roles)
  const [serviceAssignments, setServiceAssignments] = useState([]);
  // guitarCapo[songId] = capo fret chosen for that song (guitar roles only)
  const [guitarCapo, setGuitarCapo] = useState({});
  // stems status per songId: null=unchecked, 'available'=processed, 'none'=not processed
  const [stemsStatus, setStemsStatus] = useState({});
  const [stemsSubmitting, setStemsSubmitting] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  // Reload when screen comes into focus (e.g. after accepting an assignment)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [navigation]);

  // When UM sends a playback trigger, params.serviceId changes — load that setlist directly
  useEffect(() => {
    const serviceId = route?.params?.serviceId;
    if (serviceId) fetchSetlist(serviceId);
  }, [route?.params?.serviceId, fetchSetlist]);

  const loadData = async () => {
    const userProfile = await getUserProfile();
    const userAssignments = await getAssignments();

    setProfile(userProfile);

    const accepted = userAssignments.filter((a) => a.status === 'accepted');
    const nowMs = Date.now();
    const activeAccepted = accepted.filter((a) => !isSetlistExpired(a, nowMs));
    const expiredAccepted = accepted.length - activeAccepted.length;
    setAssignments(activeAccepted);
    setExpiredCount(expiredAccepted);

    // AssignmentsScreen can pass the full group directly — most reliable source
    const passedGroup = route?.params?.assignmentGroup;
    if (passedGroup && passedGroup.length > 0) {
      const focusRole = route?.params?.focusRole;
      const focused = focusRole ? passedGroup.find(a => a.role === focusRole) : null;
      const primary = focused || pickPreferredAssignment(passedGroup) || passedGroup[0];
      setSelectedAssignment(primary);
      setServiceAssignments(passedGroup);
      fetchSetlist(primary.service_id);
      const instrAsn = focused
        ? (ROLE_TO_INSTRUMENT[normalizeRoleKey(focused.role)] ? focused : passedGroup.find(a => ROLE_TO_INSTRUMENT[normalizeRoleKey(a.role)]))
        : passedGroup.find(a => ROLE_TO_INSTRUMENT[normalizeRoleKey(a.role)]);
      const mapped = ROLE_TO_INSTRUMENT[normalizeRoleKey(instrAsn?.role || primary.role)] || null;
      setSelectedInstrument(mapped);
      return;
    }

    // Check if navigated with a specific serviceId (from Assignments screen)
    const incomingServiceId = route?.params?.serviceId;
    const target = incomingServiceId
      ? activeAccepted.find((a) => a.service_id === incomingServiceId) ||
        pickPreferredAssignment(activeAccepted) ||
        activeAccepted[0]
      : pickPreferredAssignment(activeAccepted) || activeAccepted[0];

    if (target) {
      const sid = incomingServiceId || target.service_id;
      const svcAsns = activeAccepted.filter(a => a.service_id === sid);
      // focusRole param lets the role picker pre-select a specific role
      const focusRole = route?.params?.focusRole;
      const focused = focusRole ? svcAsns.find(a => a.role === focusRole) : null;
      const primary = focused || pickPreferredAssignment(svcAsns) || target;
      setSelectedAssignment(primary);
      setServiceAssignments(svcAsns);
      fetchSetlist(sid);
      // Set instrument from focusRole if provided, else first instrument in group
      const instrAsn = focused
        ? (ROLE_TO_INSTRUMENT[normalizeRoleKey(focused.role)] ? focused : svcAsns.find(a => ROLE_TO_INSTRUMENT[normalizeRoleKey(a.role)]))
        : svcAsns.find(a => ROLE_TO_INSTRUMENT[normalizeRoleKey(a.role)]);
      const mapped = ROLE_TO_INSTRUMENT[normalizeRoleKey(instrAsn?.role || primary.role)] || null;
      setSelectedInstrument(mapped);
    }
  };

  const fetchSetlist = useCallback(async (serviceId) => {
    if (!serviceId) return;
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 8000);
      try {
        const [songsRes, pullRes] = await Promise.all([
          fetch(
            `${SYNC_URL}/sync/setlist?serviceId=${encodeURIComponent(serviceId)}`,
            { signal: controller.signal, headers: syncHeaders() }
          ),
          fetch(
            `${SYNC_URL}/sync/library-pull`,
            { signal: controller.signal, headers: syncHeaders() }
          ),
        ]);
        if (!songsRes.ok) throw new Error('Server error');
        const songs = await songsRes.json();
        setSetlist(songs);
        if (pullRes.ok) {
          const lib = await pullRes.json();
          setVocalAssignments(lib.vocalAssignments?.[serviceId] || {});
          setPeopleById(buildPeopleById(lib.people || []));
        } else {
          setPeopleById({});
        }
      } finally {
        clearTimeout(tid);
      }
    } catch (e) {
      setPeopleById({});
      setError('Could not load setlist.\nMake sure the sync server is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectAssignment = (assignment) => {
    const svcAsns = assignments.filter(a => a.service_id === assignment.service_id);
    setSelectedAssignment(assignment);
    setServiceAssignments(svcAsns);
    fetchSetlist(assignment.service_id);
    const instrAsn = svcAsns.find(a => ROLE_TO_INSTRUMENT[normalizeRoleKey(a.role)]);
    const mapped = ROLE_TO_INSTRUMENT[normalizeRoleKey(instrAsn?.role || assignment.role)] || null;
    setSelectedInstrument(mapped);
  };

  const getMyVocalPart = useCallback((songId) => {
    return findMatchingVocalPart(songId, vocalAssignments, profile, peopleById);
  }, [vocalAssignments, profile, peopleById]);

  const getSongLeadVocal = useCallback((songId) => {
    const parts = vocalAssignments[songId];
    if (!parts) return null;

    const preferredKeys = ['lead_vocal', 'lead', 'voice1', 'soprano'];
    for (const key of preferredKeys) {
      const part = parts[key];
      if (!part) continue;
      const person = peopleById[part.personId] || null;
      if (part.name || person?.name) {
        return {
          partKey: key,
          ...(person || {}),
          ...part,
          name: part.name || person?.name || '',
        };
      }
    }
    return null;
  }, [vocalAssignments, peopleById]);

  const checkStemsStatus = useCallback(async (songId) => {
    if (!songId || stemsStatus[songId]) return;
    try {
      const res = await fetch(`${SYNC_URL}/sync/stems-result?songId=${songId}`, { headers: syncHeaders() });
      if (res.ok) {
        const data = await res.json();
        const has = data?.stems && Object.keys(data.stems).length > 0;
        setStemsStatus(prev => ({ ...prev, [songId]: has ? 'available' : 'none' }));
      } else {
        setStemsStatus(prev => ({ ...prev, [songId]: 'none' }));
      }
    } catch {
      setStemsStatus(prev => ({ ...prev, [songId]: 'none' }));
    }
  }, [stemsStatus]);

  const submitStemsJob = useCallback(async (song, urlOverride) => {
    const sourceUrl = urlOverride || song.youtubeLink || song.youtubeUrl || song.youtube || song.sourceUrl || '';
    if (!sourceUrl) {
      // Prompt for a URL
      Alert.prompt(
        '🎚️ Request Stems',
        `Paste a YouTube or audio URL for "${song.title || 'this song'}":`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Submit',
            onPress: (url) => {
              const trimmed = (url || '').trim();
              if (!trimmed) return;
              submitStemsJob(song, trimmed);
            },
          },
        ],
        'plain-text',
        '',
        'url'
      );
      return;
    }
    setStemsSubmitting(prev => ({ ...prev, [song.id]: true }));
    try {
      const res = await fetch(`${SYNC_URL}/sync/stems/submit`, {
        method: 'POST',
        headers: { ...syncHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: sourceUrl, title: song.title || 'Song', songId: song.id }),
      });
      if (res.ok) {
        setStemsStatus(prev => ({ ...prev, [song.id]: 'processing' }));
        Alert.alert('✅ Submitted', 'Stem separation started. Pull to refresh in a few minutes.');
      } else {
        Alert.alert('Submit Failed', 'Could not submit stems job. Try again later.');
      }
    } catch {
      Alert.alert('Error', 'Network error submitting stems.');
    } finally {
      setStemsSubmitting(prev => ({ ...prev, [song.id]: false }));
    }
  }, []);

  const renderSong = (song) => {
    const userRole = selectedAssignment?.role;
    const normalizedRole = normalizeRoleKey(userRole);
    // Always use the ACTIVE chip (selectedAssignment) to decide what to show —
    // tapping a role chip switches the whole view to that role's content.
    const isVocal        = VOCAL_ROLES.has(normalizedRole);
    const isSoundTech    = SOUND_TECH_ROLES.has(normalizedRole);
    const isMediaTech    = MEDIA_TECH_ROLES.has(normalizedRole);
    const primaryInstrument = isSoundTech
      ? null
      : (ROLE_TO_INSTRUMENT[normalizedRole] || selectedInstrument || null);
    const isGuitar = GUITAR_INSTRUMENTS.has(primaryInstrument);
    const myPart = !isSoundTech ? getMyVocalPart(song.id) : null;
    const leadVocal = isSoundTech ? getSongLeadVocal(song.id) : null;

    // Resolve base chart: instrument-specific first, then master
    const instrChart = primaryInstrument ? (song.instrumentNotes?.[primaryInstrument] || '') : '';
    const masterChart = song.chordChart || song.lyricsChordChart || '';

    // Capo transposition for guitar roles
    const capoFret = isGuitar ? (guitarCapo[song.id] ?? 0) : 0;
    const concertKey = (song.transposedKey || song.key || '').trim();
    const shapesKey  = isGuitar && capoFret > 0 ? capoShapesKey(concertKey, capoFret) : concertKey;

    // For guitars: always use the master chart as base (the keyboard has its own),
    // then transpose down by capoFret so the guitarist reads the correct shapes.
    const baseChart  = isGuitar ? (masterChart || instrChart) : (instrChart || masterChart);
    const chartToShow = isGuitar && capoFret > 0
      ? transposeChart(baseChart, -capoFret, shapesKey)
      : baseChart;

    return (
      <View
        key={song.id}
        style={styles.songCard}
      >
        {/* Order number badge */}
        <View style={styles.orderBadge}>
          <Text style={styles.orderText}>{song.order}</Text>
        </View>

        <View style={styles.songBody}>
          {/* Title + key/tempo row */}
          <View style={styles.songHeader}>
            <View style={styles.songInfo}>
              <Text style={styles.songTitle}>{song.title}</Text>
              {song.artist ? (
                <Text style={styles.songArtist}>{song.artist}</Text>
              ) : null}
            </View>
            <View style={styles.songMeta}>
              {song.key ? (
                <View style={styles.keyChip}>
                  <Text style={styles.keyChipText}>{song.key}</Text>
                </View>
              ) : null}
              {song.tempo ? (
                <Text style={styles.tempoText}>{song.tempo} BPM</Text>
              ) : null}
              {song.duration ? (
                <Text style={styles.durationText}>{song.duration}</Text>
              ) : null}
            </View>
          </View>

          {/* Song notes */}
          {song.notes ? (
            <View style={styles.notesRow}>
              <Text style={styles.notesText}>💬 {song.notes}</Text>
            </View>
          ) : null}

          {/* Lyrics button for vocal roles — chords stripped, section cues kept */}
          {(() => {
            if (!isVocal) return null;
            // Dedicated lyrics first; fall back to chord chart (strip chords for vocals)
            const rawContent = (song.lyrics || '').trim() || (song.chordChart || song.lyricsChordChart || '').trim();
            if (!rawContent) {
              return (
                <View style={styles.noLyricsRow}>
                  <Text style={styles.noLyricsText}>🎤 No lyrics available for this song</Text>
                </View>
              );
            }
            // If content comes from chordChart, strip all chord symbols — show only lyrics + cues
            const vocalLyrics = song.lyrics ? rawContent : stripChordsForVocals(rawContent);
            return (
              <TouchableOpacity
                style={styles.lyricsButton}
                onPress={() =>
                  navigation.navigate('LyricsView', {
                    song: { ...song, lyrics: vocalLyrics },
                    userRole,
                    assignmentId: selectedAssignment?.id,
                    myPart,
                  })
                }
              >
                <Text style={styles.lyricsButtonText}>🎤  View Lyrics</Text>
              </TouchableOpacity>
            );
          })()}

          {/* Guitar capo picker */}
          {!!primaryInstrument && isGuitar ? (
            <View style={styles.capoRow}>
              <Text style={styles.capoLabel}>🎸 Capo:</Text>
              <View style={styles.capoPills}>
                {GUITAR_CAPO_OPTIONS.map(fret => {
                  const active = capoFret === fret;
                  const sKey = fret > 0 && concertKey ? capoShapesKey(concertKey, fret) : null;
                  return (
                    <TouchableOpacity
                      key={fret}
                      style={[styles.capoPill, active && styles.capoPillActive]}
                      onPress={() => setGuitarCapo(prev => ({ ...prev, [song.id]: fret }))}
                    >
                      <Text style={[styles.capoPillText, active && styles.capoPillTextActive]}>
                        {fret === 0 ? 'Open' : `${fret}`}
                      </Text>
                      {sKey && active ? (
                        <Text style={styles.capoPillKey}>{sKey}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {capoFret > 0 && concertKey ? (
                <Text style={styles.capoHint}>
                  Play {shapesKey} shapes · sounds {concertKey}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Instrument chart button — shown for instrument roles (even alongside vocal) */}
          {!!primaryInstrument && chartToShow ? (
            <TouchableOpacity
              style={styles.chartButton}
              onPress={() =>
                navigation.navigate('LyricsView', {
                  song: { ...song, lyrics: chartToShow, key: shapesKey || song.key },
                  userRole: primaryInstrument || 'Chart',
                  capo: capoFret,
                  concertKey,
                })
              }
            >
              <Text style={styles.chartButtonText}>
                {INSTRUMENT_ICON[primaryInstrument] || '🎼'}{'  '}
                {isGuitar && capoFret > 0
                  ? `View Chart (Capo ${capoFret} · ${shapesKey} shapes)`
                  : `View ${instrChart && !isGuitar ? `${primaryInstrument} ` : ''}Chart`}
              </Text>
            </TouchableOpacity>
          ) : !!primaryInstrument && !chartToShow ? (
            <View style={styles.noLyricsRow}>
              <Text style={styles.noLyricsText}>🎵 No chart available for this song</Text>
            </View>
          ) : null}

          {/* Edit buttons — one per assigned role (vocal + instrument shown together) */}
          {isVocal && (
            <TouchableOpacity
              style={styles.editContentBtn}
              onPress={() =>
                navigation.navigate('ContentEditor', {
                  song,
                  serviceId: selectedAssignment?.service_id || '',
                  type: 'lyrics',
                  existing: song.lyrics || '',
                  instrument: 'Vocals',
                  isAdmin: profile?.grantedRole === 'md' || profile?.grantedRole === 'admin',
                  userRole: selectedAssignment?.role || '',
                })
              }
            >
              <Text style={styles.editContentBtnText}>
                ✏️{'  '}{song.hasLyrics ? 'Edit Lyrics' : 'Add Lyrics'}
              </Text>
            </TouchableOpacity>
          )}
          {!!primaryInstrument && (
            <TouchableOpacity
              style={[styles.editContentBtn, isVocal && { marginTop: 6 }]}
              onPress={() =>
                navigation.navigate('ContentEditor', {
                  song,
                  serviceId: selectedAssignment?.service_id || '',
                  type: 'chord_chart',
                  existing: chartToShow || '',
                  instrument: primaryInstrument,
                  isAdmin: profile?.grantedRole === 'md' || profile?.grantedRole === 'admin',
                  userRole: selectedAssignment?.role || '',
                })
              }
            >
              <Text style={styles.editContentBtnText}>
                ✏️{'  '}{chartToShow ? `Edit ${primaryInstrument} Chart` : `Add ${primaryInstrument} Chart`}
              </Text>
            </TouchableOpacity>
          )}
          {!isVocal && !primaryInstrument && !isSoundTech && (
            <TouchableOpacity
              style={styles.editContentBtn}
              onPress={() =>
                navigation.navigate('ContentEditor', {
                  song,
                  serviceId: selectedAssignment?.service_id || '',
                  type: 'chord_chart',
                  existing: chartToShow || '',
                  instrument: '',
                  isAdmin: profile?.grantedRole === 'md' || profile?.grantedRole === 'admin',
                  userRole: selectedAssignment?.role || '',
                })
              }
            >
              <Text style={styles.editContentBtnText}>
                ✏️{'  '}{chartToShow ? 'Edit Chart' : 'Add Chart'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Your Part — for vocalists / instrumentalists with a BGV assignment */}
          {myPart ? (
            <View style={styles.myPartRow}>
              <Text style={styles.myPartLabel}>YOUR PART</Text>
              <Text style={styles.myPartValue}>
                {PART_LABELS[myPart.partKey] || myPart.partKey}
                {myPart.key ? `  ·  Key of ${myPart.key}` : ''}
              </Text>
              {myPart.notes ? <Text style={styles.myPartNotes}>{myPart.notes}</Text> : null}
            </View>
          ) : null}

          {/* Lead vocalist — for sound techs */}
          {isSoundTech && leadVocal ? (
            <View style={styles.lineupCard}>
              <Text style={styles.lineupTitle}>🎤 LEAD VOCAL</Text>
              <View style={styles.lineupRow}>
                <Text style={styles.lineupPart}>Lead</Text>
                <Text style={styles.lineupName}>{leadVocal.name}</Text>
                {leadVocal.key ? (
                  <View style={styles.lineupKeyChip}>
                    <Text style={styles.lineupKeyText}>{leadVocal.key}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {isSoundTech && !leadVocal ? (
            <View style={styles.noLyricsRow}>
              <Text style={styles.noLyricsText}>🎚️ No lead vocal assigned for this song</Text>
            </View>
          ) : null}

          {/* ── Stems row ── */}
          {(() => {
            if (isSoundTech) return null;
            const status = stemsStatus[song.id];
            // Trigger check on first render of this song
            if (!status) checkStemsStatus(song.id);
            if (status === 'available') {
              return (
                <View style={styles.stemsRow}>
                  <Text style={styles.stemsAvailableText}>🎚️ Stems ready</Text>
                </View>
              );
            }
            if (status === 'processing') {
              return (
                <View style={styles.stemsRow}>
                  <Text style={styles.stemsProcessingText}>⏳ Processing stems…</Text>
                </View>
              );
            }
            if (status === 'none') {
              return (
                <TouchableOpacity
                  style={styles.stemsSubmitBtn}
                  onPress={() => submitStemsJob(song)}
                  disabled={!!stemsSubmitting[song.id]}
                >
                  <Text style={styles.stemsSubmitText}>
                    {stemsSubmitting[song.id] ? '⏳ Submitting…' : '🎚️ Request Stems'}
                  </Text>
                </TouchableOpacity>
              );
            }
            return null;
          })()}

          {/* ── Media Tech: lyrics + light cues ── */}
          {isMediaTech && (() => {
            const rawLyrics = (song.lyrics || song.chordChart || song.lyricsChordChart || '').trim();
            const lightCueText = song.lightCues || song.roleCues?.media_tech?.cues || song.roleCues?.media?.cues || null;
            return (
              <>
                {rawLyrics ? (
                  <TouchableOpacity
                    style={styles.lyricsButton}
                    onPress={() => navigation.navigate('LyricsView', {
                      song: { ...song, lyrics: rawLyrics },
                      userRole,
                      assignmentId: selectedAssignment?.id,
                    })}
                  >
                    <Text style={styles.lyricsButtonText}>📄  View Lyrics / Slides</Text>
                  </TouchableOpacity>
                ) : null}
                {lightCueText ? (
                  <View style={styles.lightCueCard}>
                    <Text style={styles.lightCueTitle}>💡 LIGHT CUES</Text>
                    <Text style={styles.lightCueText}>{lightCueText}</Text>
                  </View>
                ) : null}
              </>
            );
          })()}

          {/* ── Practice button (hidden for tech roles) ── */}
          {!isSoundTech && !isMediaTech && (
            <TouchableOpacity
              style={styles.practiceBtn}
              onPress={() =>
                navigation.navigate('PersonalPractice', {
                  serviceId: selectedAssignment?.service_id,
                  songId: song.id,
                  userRole: selectedAssignment?.role,
                })
              }
              activeOpacity={0.8}
            >
              <Text style={styles.practiceBtnText}>🎧  Practice This Song</Text>
            </TouchableOpacity>
          )}

          {/* ── Play Setlist button (Sound Tech + Media only) ── */}
          {(isSoundTech || isMediaTech) && (() => {
            const ytUrl = song.youtubeLink || song.youtubeUrl || song.youtube || song.sourceUrl || null;
            return (
              <TouchableOpacity
                style={[styles.practiceBtn, { backgroundColor: '#1e3a5f', borderColor: '#3b82f6' }]}
                onPress={() => navigation.navigate('SetlistRunner', {
                  serviceId: selectedAssignment?.service_id,
                  songId: song.id,
                  userRole: selectedAssignment?.role,
                  userProfile: profile,
                  vocalAssignments,
                  youtubeUrl: ytUrl,
                })}
                activeOpacity={0.8}
              >
                <Text style={[styles.practiceBtnText, { color: '#93c5fd' }]}>
                  {ytUrl ? '▶  Play Song (YouTube)' : '▶  Play Setlist'}
                </Text>
              </TouchableOpacity>
            );
          })()}
        </View>
      </View>
    );
  };

  // Empty state — no accepted assignments
  if (!selectedAssignment) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No Accepted Assignments</Text>
          <Text style={styles.emptyText}>
            Accept a service assignment to view its setlist.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => navigation.navigate('Assignments')}
          >
            <Text style={styles.emptyButtonText}>View Assignments</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => fetchSetlist(selectedAssignment.service_id)}
          tintColor="#4F46E5"
        />
      }
    >
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerIcon}>📋</Text>
        <Text style={styles.title}>Setlist</Text>
        <Text style={styles.subtitle}>{selectedAssignment.service_name}</Text>
      </View>

      {/* Service selector pills — one per unique service_id */}
      {(() => {
        const seen = new Set();
        const uniqueServices = assignments.filter(a => {
          if (seen.has(a.service_id)) return false;
          seen.add(a.service_id);
          return true;
        });
        if (uniqueServices.length <= 1) return null;
        return (
          <View style={styles.selectorWrapper}>
            <Text style={styles.selectorLabel}>Service:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {uniqueServices.map((a) => (
                <TouchableOpacity
                  key={a.service_id}
                  style={[
                    styles.pill,
                    selectedAssignment?.service_id === a.service_id && styles.pillActive,
                  ]}
                  onPress={() => selectAssignment(a)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      selectedAssignment?.service_id === a.service_id && styles.pillTextActive,
                    ]}
                  >
                    {a.service_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );
      })()}

      {expiredCount > 0 ? (
        <View style={styles.expiredNotice}>
          <Text style={styles.expiredNoticeText}>
            ℹ️ {expiredCount} past service setlist{expiredCount > 1 ? 's were' : ' was'} hidden automatically (2h after service end).
          </Text>
        </View>
      ) : null}

      {/* Service info card — tappable role chips switch the active view */}
      <View style={styles.serviceCard}>
        <Text style={styles.serviceDate}>
          📅{' '}
          {new Date(String(selectedAssignment.service_date).includes('T') ? selectedAssignment.service_date : selectedAssignment.service_date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>

        {/* Role chips: one per assigned role, tapping switches content */}
        <View style={styles.roleChipsRow}>
          {(serviceAssignments.length > 0 ? serviceAssignments : [selectedAssignment]).map((a) => {
            const label = ROLE_LABELS[a.role] || a.role;
            const isActive = a.id === selectedAssignment?.id || a.role === selectedAssignment?.role;
            return (
              <TouchableOpacity
                key={a.id || a.role}
                style={[styles.roleChip, isActive && styles.roleChipActive]}
                onPress={() => {
                  setSelectedAssignment(a);
                  const instr = ROLE_TO_INSTRUMENT[normalizeRoleKey(a.role)] || null;
                  setSelectedInstrument(instr);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.roleChipText, isActive && styles.roleChipTextActive]}>
                  🎵 {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {serviceAssignments.length > 1 && (
          <Text style={styles.roleSwitchHint}>Tap a role to switch content</Text>
        )}

        {selectedAssignment.notes ? (
          <Text style={styles.serviceNotes}>
            {selectedAssignment.notes}
          </Text>
        ) : null}
      </View>

      {/* Instrument chart picker — based on active chip (selectedAssignment) */}
      {(() => {
        const normalizedRole = normalizeRoleKey(selectedAssignment?.role);
        if (SOUND_TECH_ROLES.has(normalizedRole) || MEDIA_TECH_ROLES.has(normalizedRole)) return null;
        // Use only the active role chip to decide which instrument to show
        const activeInstr = ROLE_TO_INSTRUMENT[normalizedRole] || null;
        const myInstrs = activeInstr ? [activeInstr] : [];
        const vocalOnly = VOCAL_ROLES.has(normalizedRole);

        // Pure vocalist with no instrument — no picker needed
        if (vocalOnly && myInstrs.length === 0) return null;

        // If user has assigned instrument(s), show static pill(s) — no picker needed
        if (myInstrs.length > 0) {
          const hasPart = myInstrs.some(instr => setlist.some(s => s.instrumentNotes?.[instr]));
          if (!hasPart) return null;
          return (
            <View style={styles.instrumentPickerCard}>
              <Text style={styles.instrumentPickerLabel}>🎸 Chart for instrument:</Text>
              <View style={styles.instrumentPickerRow}>
                {myInstrs.map(instr => (
                  <View key={instr} style={[styles.instrumentPill, styles.instrumentPillActive]}>
                    <Text style={[styles.instrumentPillText, styles.instrumentPillTextActive]}>
                      {INSTRUMENT_ICON[instr] || '🎵'}{'  '}{instr}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          );
        }

        const myInstr = null; // fall through to full picker below

        // Admin / sound tech / unassigned — show all available instruments + master
        const available = CHART_INSTRUMENTS.filter(instr =>
          setlist.some(s => s.instrumentNotes?.[instr])
        );
        if (!available.length) return null;
        return (
          <View style={styles.instrumentPickerCard}>
            <Text style={styles.instrumentPickerLabel}>🎸 Chart for instrument:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.instrumentPickerRow}>
              {available.map(instr => (
                <TouchableOpacity
                  key={instr}
                  style={[styles.instrumentPill, selectedInstrument === instr && styles.instrumentPillActive]}
                  onPress={() => setSelectedInstrument(instr)}
                >
                  <Text style={[styles.instrumentPillText, selectedInstrument === instr && styles.instrumentPillTextActive]}>
                    {INSTRUMENT_ICON[instr] || '🎵'}{'  '}{instr}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.instrumentPill, selectedInstrument === null && styles.instrumentPillActive]}
                onPress={() => setSelectedInstrument(null)}
              >
                <Text style={[styles.instrumentPillText, selectedInstrument === null && styles.instrumentPillTextActive]}>
                  🎼  Master Chart
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        );
      })()}

      {/* Practice Session button */}
      {!loading && !error && setlist.length > 0 && (
        <TouchableOpacity
          style={styles.playButton}
          onPress={() =>
            navigation.navigate('PersonalPractice', {
              serviceId: selectedAssignment?.service_id,
              userRole: selectedAssignment?.role,
            })
          }
        >
          <Text style={styles.playButtonText}>🎧  Practice Session</Text>
        </TouchableOpacity>
      )}

      {/* Song list */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading setlist…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorState}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchSetlist(selectedAssignment.service_id)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : setlist.length === 0 ? (
        <View style={styles.noSongsState}>
          <Text style={styles.noSongsIcon}>🎵</Text>
          <Text style={styles.noSongsText}>
            No songs in this service yet.{'\n'}Pull down to refresh.
          </Text>
        </View>
      ) : (
        <View style={styles.setlistSection}>
          <Text style={styles.sectionTitle}>Songs ({setlist.length})</Text>
          {setlist.map(renderSong)}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    fontSize: 56,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  selectorWrapper: {
    marginBottom: 20,
  },
  selectorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0B1120',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  pillText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  serviceCard: {
    padding: 16,
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4F46E5',
    marginBottom: 24,
  },
  serviceDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 10,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#4F46E520',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#818CF8',
  },
  roleChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  roleChipActive: {
    backgroundColor: '#4F46E520',
    borderColor: '#6366F1',
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  roleChipTextActive: {
    color: '#818CF8',
    fontWeight: '700',
  },
  roleSwitchHint: {
    fontSize: 11,
    color: '#374151',
    marginTop: 6,
    letterSpacing: 0.3,
  },
  serviceNotes: {
    marginTop: 10,
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  expiredNotice: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0B1120',
  },
  expiredNoticeText: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
  },
  loadingState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#9CA3AF',
  },
  errorState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  noSongsState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  noSongsIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  noSongsText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
  },
  playButton: {
    marginBottom: 20,
    paddingVertical: 16,
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  playButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  setlistSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 16,
  },
  songCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12,
  },
  stemsRow: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  stemsAvailableText: { color: '#34D399', fontSize: 12, fontWeight: '600' },
  stemsProcessingText: { color: '#FBBF24', fontSize: 12, fontWeight: '600' },
  stemsNoneText: { color: '#475569', fontSize: 12 },
  stemsSubmitBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  stemsSubmitText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  practiceBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1E1B4B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4F46E5',
    alignItems: 'center',
  },
  practiceBtnText: {
    color: '#A5B4FC',
    fontSize: 13,
    fontWeight: '700',
  },
  lightCueCard: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E3A5F',
  },
  lightCueTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#60A5FA',
    letterSpacing: 1,
    marginBottom: 6,
  },
  lightCueText: {
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 20,
  },
  orderBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 2,
    flexShrink: 0,
  },
  orderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  songBody: {
    flex: 1,
  },
  songHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  songInfo: {
    flex: 1,
    marginRight: 12,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 3,
  },
  songArtist: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  songMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  keyChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#4F46E520',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  keyChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#818CF8',
  },
  tempoText: {
    fontSize: 11,
    color: '#6B7280',
  },
  durationText: {
    fontSize: 11,
    color: '#6B7280',
  },
  notesRow: {
    marginTop: 4,
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  notesText: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  lyricsButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    alignItems: 'center',
  },
  lyricsButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  noLyricsRow: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
  },
  noLyricsText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  editContentBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#0B1120',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    alignSelf: 'flex-start',
  },
  editContentBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  // ── Capo picker ────────────────────────────────────────────────────────────
  capoRow: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#0B1A10',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#166534',
  },
  capoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4ADE80',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  capoPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  capoPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#052E16',
    borderWidth: 1,
    borderColor: '#166534',
    alignItems: 'center',
    minWidth: 44,
  },
  capoPillActive: {
    backgroundColor: '#16A34A',
    borderColor: '#22C55E',
  },
  capoPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4ADE80',
  },
  capoPillTextActive: {
    color: '#FFFFFF',
  },
  capoPillKey: {
    fontSize: 10,
    color: '#BBF7D0',
    fontWeight: '600',
    marginTop: 1,
  },
  capoHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#86EFAC',
    fontStyle: 'italic',
  },
  // ── Chart button ───────────────────────────────────────────────────────────
  chartButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1E1B4B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4F46E5',
    alignItems: 'center',
  },
  chartButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#818CF8',
  },
  instrumentPickerCard: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  instrumentPickerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  instrumentPickerRow: { flexDirection: 'row' },
  instrumentPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#020617',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    marginRight: 8,
  },
  instrumentPillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  instrumentPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  instrumentPillTextActive: {
    color: '#FFFFFF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  emptyButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Your Part — vocal/instrument assignment per song
  myPartRow: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#0B2233',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0EA5E9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  myPartLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0EA5E9',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  myPartValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E0F2FE',
    flex: 1,
  },
  myPartNotes: {
    width: '100%',
    fontSize: 11,
    color: '#7DD3FC',
    fontStyle: 'italic',
    marginTop: 2,
  },
  // Vocal Lineup — sound tech view
  lineupCard: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1A0F2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7C3AED',
  },
  lineupTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A78BFA',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  lineupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#2D1B4E',
    gap: 8,
  },
  lineupPart: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C4B5FD',
    width: 76,
  },
  lineupName: {
    fontSize: 13,
    color: '#F3F4F6',
    flex: 1,
    fontWeight: '600',
  },
  lineupKeyChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: '#4C1D95',
    borderRadius: 4,
  },
  lineupKeyText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DDD6FE',
  },
});
