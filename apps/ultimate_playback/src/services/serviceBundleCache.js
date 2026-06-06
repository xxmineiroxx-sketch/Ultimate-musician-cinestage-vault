import AsyncStorage from '@react-native-async-storage/async-storage';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

const SERVICE_BUNDLES_KEY = 'up/cache/serviceBundles/v1';

function serviceIdFor(value) {
  return String(value?.service_id || value?.serviceId || value?.id || '').trim();
}

function groupAssignments(assignments = []) {
  const groups = {};
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    const serviceId = serviceIdFor(assignment);
    if (!serviceId) continue;
    groups[serviceId] ||= [];
    groups[serviceId].push(assignment);
  }
  return groups;
}

function summarizeBundle(bundle = {}) {
  const songs = Array.isArray(bundle.setlist) ? bundle.setlist : [];
  const assignments = Array.isArray(bundle.assignmentGroup) ? bundle.assignmentGroup : [];
  const missingCharts = songs.filter((song) => !song?.chordChart && !song?.lyrics).length;
  const songsWithAudio = songs.filter((song) => (
    song?.audioUrl ||
    song?.mediaUrl ||
    song?.stemsUrl ||
    song?.assets?.full_mix ||
    song?.assets?.fullSong ||
    song?.assets?.stems
  )).length;
  const roles = [...new Set(assignments.map((item) => item?.role).filter(Boolean))];

  return {
    serviceId: bundle.serviceId || '',
    serviceName:
      bundle.serviceName ||
      assignments[0]?.service_name ||
      assignments[0]?.service_id ||
      'Service',
    serviceDate: bundle.serviceDate || assignments[0]?.service_date || '',
    songCount: songs.length,
    roleCount: roles.length,
    roles,
    hasSetlist: songs.length > 0,
    missingCharts,
    songsWithAudio,
    assetsReady: songs.length > 0 && songsWithAudio >= songs.length,
    chartsReady: songs.length > 0 && missingCharts === 0,
    ready:
      songs.length > 0 &&
      missingCharts === 0 &&
      assignments.some((item) => item?.status === 'accepted'),
    lastSyncedAt: bundle.lastSyncedAt || '',
  };
}

async function readBundles() {
  try {
    const raw = await AsyncStorage.getItem(SERVICE_BUNDLES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeBundles(bundles) {
  await AsyncStorage.setItem(SERVICE_BUNDLES_KEY, JSON.stringify(bundles || {}));
}

export async function getServiceBundle(serviceId) {
  const bundles = await readBundles();
  return bundles[String(serviceId || '').trim()] || null;
}

export async function getAllServiceBundles() {
  return readBundles();
}

export async function cacheAssignmentBundles(profile, assignments = []) {
  const bundles = await readBundles();
  const grouped = groupAssignments(assignments);
  const timestamp = new Date().toISOString();

  for (const [serviceId, assignmentGroup] of Object.entries(grouped)) {
    const current = bundles[serviceId] || {};
    bundles[serviceId] = {
      ...current,
      serviceId,
      serviceName: assignmentGroup[0]?.service_name || current.serviceName || 'Service',
      serviceDate: assignmentGroup[0]?.service_date || current.serviceDate || '',
      assignmentGroup,
      profile: profile || current.profile || null,
      lastAssignmentSyncAt: timestamp,
      lastSyncedAt: current.lastSyncedAt || timestamp,
    };
    bundles[serviceId].preflight = summarizeBundle(bundles[serviceId]);
  }

  await writeBundles(bundles);
  return bundles;
}

export async function cacheSetlistBundle({
  serviceId,
  service = null,
  plan = null,
  profile = null,
  assignmentGroup = [],
  songs = [],
  librarySongs = [],
  vocalAssignments = {},
  people = [],
  messages = [],
  remotePreflight = null,
} = {}) {
  const id = String(serviceId || '').trim();
  if (!id) return null;

  const bundles = await readBundles();
  const current = bundles[id] || {};
  const timestamp = new Date().toISOString();
  const next = {
    ...current,
    serviceId: id,
    service: service || current.service || null,
    plan: plan || current.plan || null,
    serviceName: assignmentGroup[0]?.service_name || current.serviceName || 'Service',
    serviceDate: assignmentGroup[0]?.service_date || current.serviceDate || '',
    profile: profile || current.profile || null,
    assignmentGroup:
      assignmentGroup.length > 0 ? assignmentGroup : current.assignmentGroup || [],
    setlist: Array.isArray(songs) ? songs : [],
    librarySongs: Array.isArray(librarySongs) ? librarySongs : [],
    vocalAssignments: vocalAssignments || {},
    people: Array.isArray(people) ? people : [],
    messages: Array.isArray(messages) ? messages : current.messages || [],
    lastSetlistSyncAt: timestamp,
    lastSyncedAt: timestamp,
  };
  next.preflight = remotePreflight || summarizeBundle(next);
  bundles[id] = next;
  await writeBundles(bundles);
  return next;
}

export async function cacheRemoteServiceBundle(remote = {}, profile = null) {
  const serviceId = String(remote.serviceId || remote.service?.id || '').trim();
  if (!serviceId) return null;

  return cacheSetlistBundle({
    serviceId,
    service: remote.service || null,
    plan: remote.plan || null,
    profile,
    assignmentGroup: remote.assignmentGroup || [],
    songs: remote.setlist || [],
    librarySongs: remote.librarySongs || [],
    vocalAssignments: remote.vocalAssignments || {},
    people: remote.people || [],
    messages: remote.messages || [],
    remotePreflight: {
      ...(remote.preflight || {}),
      serviceId,
      serviceName:
        remote.service?.name ||
        remote.service?.title ||
        remote.plan?.title ||
        remote.assignmentGroup?.[0]?.service_name ||
        'Service',
      serviceDate:
        remote.service?.date ||
        remote.assignmentGroup?.[0]?.service_date ||
        '',
      lastSyncedAt: remote.generatedAt || new Date().toISOString(),
    },
  });
}

export async function fetchAndCacheServiceBundle({
  serviceId,
  email = '',
  profile = null,
  timeoutMs = 8000,
} = {}) {
  const id = String(serviceId || '').trim();
  if (!id) throw new Error('serviceId is required');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({ serviceId: id });
    if (email) params.set('email', String(email).trim());
    const res = await fetch(`${SYNC_URL}/sync/service-bundle?${params.toString()}`, {
      headers: syncHeaders(),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return cacheRemoteServiceBundle(data, profile);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getCachedSetlistBundle(serviceId) {
  const bundle = await getServiceBundle(serviceId);
  if (!bundle) return null;
  return {
    ...bundle,
    preflight: bundle.preflight || summarizeBundle(bundle),
  };
}

export function summarizeServiceBundle(bundle) {
  return summarizeBundle(bundle);
}
