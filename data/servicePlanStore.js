/**
 * Service Plan Store — per-service plan data
 * Stores songs (setlist) and team assignments for each service independently.
 *
 * Key: 'um/service_plans/v2'
 * Schema: { [serviceId]: ServicePlan }
 *
 * ServicePlan: {
 *   serviceId: string,
 *   songs: [{ id, songId, title, artist, key, bpm, transposedKey, notes,
 *             instrumentNotes: {[instrument]: string},
 *             lyrics: string,
 *             vocalAssignments: [{id, personId, name, type: 'lead'|'backing'}] }],
 *   team: [{ id, role, personId, name }],
 *   notes: string,
 *   updatedAt: number
 * }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { transposeChordChart, stripChordsForVocals } from './chordTranspose';
import { CHORD_CHART_INSTRUMENTS } from './models';

const KEY = 'um/service_plans/v2';

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function makePlan(serviceId) {
  return { serviceId, songs: [], team: [], notes: '', updatedAt: Date.now() };
}

async function getAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function saveAll(data) {
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

/** Get the plan for a specific service (creates empty if none). */
export async function getPlanForService(serviceId) {
  const all = await getAll();
  return all[serviceId] || makePlan(serviceId);
}

/** Persist any plan shape for a service. */
export async function savePlanForService(serviceId, plan) {
  const all = await getAll();
  all[serviceId] = { ...plan, serviceId, updatedAt: Date.now() };
  await saveAll(all);
  return all[serviceId];
}

/** Add a song from the library to this service's setlist (no duplicates). */
export async function addSongToService(serviceId, song) {
  const plan = await getPlanForService(serviceId);
  if (plan.songs.find((s) => s.songId === song.id)) return plan; // already there
  const item = {
    id: uid('si'),
    songId: song.id,
    title: song.title || 'Untitled',
    artist: song.artist || '',
    key: song.originalKey || song.key || '',
    bpm: song.bpm || 0,
    transposedKey: '',
    notes: '',
    chordChart: '',
    distributedInKey: '',
    instrumentNotes: {},
    lyrics: '',
    vocalAssignments: [],
    voicePartAudio: {},
  };
  return savePlanForService(serviceId, { ...plan, songs: [...plan.songs, item] });
}

/** Remove a song item by its plan item id. */
export async function removeSongFromService(serviceId, itemId) {
  const plan = await getPlanForService(serviceId);
  return savePlanForService(serviceId, {
    ...plan,
    songs: plan.songs.filter((s) => s.id !== itemId),
  });
}

/** Update a song item's transposedKey or notes. */
export async function updateSongItem(serviceId, itemId, patch) {
  const plan = await getPlanForService(serviceId);
  return savePlanForService(serviceId, {
    ...plan,
    songs: plan.songs.map((s) => (s.id === itemId ? { ...s, ...patch } : s)),
  });
}

/** Reorder songs — pass the full new songs array. */
export async function reorderSongs(serviceId, songs) {
  const plan = await getPlanForService(serviceId);
  return savePlanForService(serviceId, { ...plan, songs });
}

/** Assign a team member to a role. Replaces if same role+person already exists. */
export async function assignTeamMember(serviceId, { role, personId, name }) {
  const plan = await getPlanForService(serviceId);
  const filtered = plan.team.filter(
    (t) => !(t.role === role && t.personId === personId)
  );
  const item = { id: uid('ta'), role, personId, name };
  return savePlanForService(serviceId, { ...plan, team: [...filtered, item] });
}

/** Remove a team assignment by its id. */
export async function removeTeamAssignment(serviceId, assignmentId) {
  const plan = await getPlanForService(serviceId);
  return savePlanForService(serviceId, {
    ...plan,
    team: plan.team.filter((t) => t.id !== assignmentId),
  });
}

/** Update the free-text notes for a service. */
export async function updateServiceNotes(serviceId, notes) {
  const plan = await getPlanForService(serviceId);
  return savePlanForService(serviceId, { ...plan, notes });
}

/** Add a vocal assignment to a specific song item. */
export async function addVocalAssignment(serviceId, itemId, { personId, name, type, voicePart }) {
  const plan = await getPlanForService(serviceId);
  return savePlanForService(serviceId, {
    ...plan,
    songs: plan.songs.map((s) => {
      if (s.id !== itemId) return s;
      return {
        ...s,
        vocalAssignments: [
          ...(s.vocalAssignments || []),
          { id: uid('va'), personId, name, type, voicePart: voicePart || '' },
        ],
      };
    }),
  });
}

/** Save or update the reference audio info for a voice part of a song. */
export async function updateVoicePartAudio(serviceId, itemId, voicePart, audioInfo) {
  const plan = await getPlanForService(serviceId);
  return savePlanForService(serviceId, {
    ...plan,
    songs: plan.songs.map((s) => {
      if (s.id !== itemId) return s;
      return {
        ...s,
        voicePartAudio: { ...(s.voicePartAudio || {}), [voicePart]: audioInfo },
      };
    }),
  });
}

/** Remove the reference audio for a voice part (also clears the localUri). */
export async function removeVoicePartAudio(serviceId, itemId, voicePart) {
  const plan = await getPlanForService(serviceId);
  return savePlanForService(serviceId, {
    ...plan,
    songs: plan.songs.map((s) => {
      if (s.id !== itemId) return s;
      const newAudio = { ...(s.voicePartAudio || {}) };
      delete newAudio[voicePart];
      return { ...s, voicePartAudio: newAudio };
    }),
  });
}

/**
 * Distributes the song's chordChart to all harmonic instrument slots,
 * transposing to transposedKey if set, and stores a lyrics-only version for vocalists.
 * Called automatically when a transposedKey changes.
 */
export async function distributeChordChart(serviceId, itemId) {
  const plan = await getPlanForService(serviceId);
  const item = plan.songs.find((s) => s.id === itemId);
  if (!item?.chordChart) return plan;

  const fromKey = item.key || '';
  const toKey = item.transposedKey || item.key || '';
  const transposedChart = transposeChordChart(item.chordChart, fromKey, toKey);
  const lyricsOnly = stripChordsForVocals(item.chordChart); // vocals always get original key lyrics

  const newInstrumentNotes = { ...item.instrumentNotes };
  for (const inst of CHORD_CHART_INSTRUMENTS) {
    newInstrumentNotes[inst] = transposedChart;
  }

  return savePlanForService(serviceId, {
    ...plan,
    songs: plan.songs.map((s) =>
      s.id === itemId
        ? { ...s, instrumentNotes: newInstrumentNotes, lyrics: lyricsOnly, distributedInKey: toKey }
        : s
    ),
  });
}

/** Remove a vocal assignment from a specific song item. */
export async function removeVocalAssignment(serviceId, itemId, assignmentId) {
  const plan = await getPlanForService(serviceId);
  return savePlanForService(serviceId, {
    ...plan,
    songs: plan.songs.map((s) => {
      if (s.id !== itemId) return s;
      return {
        ...s,
        vocalAssignments: (s.vocalAssignments || []).filter((v) => v.id !== assignmentId),
      };
    }),
  });
}
