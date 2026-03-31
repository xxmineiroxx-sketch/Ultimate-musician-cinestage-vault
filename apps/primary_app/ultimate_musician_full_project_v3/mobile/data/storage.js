import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { CINESTAGE_URL, SYNC_URL, WS_URL, syncHeaders } from "../screens/config";

import { ensureCifrasSeeded } from "./cifrasSeed";
import {
  demoSongs,
  demoRoles,
  demoSettings,
  demoServicePlan,
} from "./demoSeed";
import {
  makeDefaultSettings,
  makeEmptyServicePlan,
  normalizeRoleList,
  rolesToAssignmentString,
} from "./models";

const SONGS_KEY = "um.songs.v2";
const SERVICES_KEY = "um.services.v1";
const PEOPLE_KEY = "um.people.v1";
const SETTINGS_KEY = "um.settings.v1";
const ROLES_KEY = "um.roles.v1";
const SERVICE_PLAN_KEY = "um.service_plan.v1";
const SEEDED_KEY = "um.seeded.v1";
const SHARED_TEAM_MEMBERS_KEY = "@shared_team_members";
const PORTABLE_STEM_DIRS = ["um_stems", "stems"];

const safeJsonParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const nowIso = () => new Date().toISOString();
const trimLeadingSlashes = (value = "") => String(value || "").replace(/^\/+/, "");
const LEGACY_CINESTAGE_HOSTS = [
  "http://localhost:8000",
  "https://localhost:8000",
  "http://127.0.0.1:8000",
  "https://127.0.0.1:8000",
  "https://railway.ultimatemusician",
];

const sanitizeSettings = (settings = {}) => {
  const next = { ...(settings || {}) };
  const rawApiBase = String(next.apiBase || "").trim();
  const normalizedApiBase = rawApiBase.replace(/\/+$/, "");

  if (!normalizedApiBase || LEGACY_CINESTAGE_HOSTS.includes(normalizedApiBase)) {
    next.apiBase = CINESTAGE_URL;
  } else {
    next.apiBase = normalizedApiBase;
  }

  const rawWsUrl = String(next.sync?.wsUrl || "").trim();
  const shouldReplaceWs =
    !rawWsUrl
    || /^ws:\/\/localhost:8000\/ws\/?$/i.test(rawWsUrl)
    || /^wss?:\/\/127\.0\.0\.1:8000\/ws\/?$/i.test(rawWsUrl);

  next.sync = {
    ...(next.sync || {}),
    wsUrl: shouldReplaceWs ? WS_URL : rawWsUrl,
  };

  if (!next.defaultUserId) {
    next.defaultUserId = "demo-user";
  }

  return next;
};

const stemRelativePathFromUri = (value) => {
  const normalized = String(value || "")
    .replace(/^file:\/\//i, "")
    .replace(/\\/g, "/");

  for (const dir of PORTABLE_STEM_DIRS) {
    const marker = `/${dir}/`;
    const idx = normalized.indexOf(marker);
    if (idx >= 0) {
      return trimLeadingSlashes(normalized.slice(idx + 1));
    }
  }

  return null;
};

const currentStemUriFromRelativePath = (relativePath) => {
  if (!relativePath || !FileSystem.documentDirectory) return null;
  return `${FileSystem.documentDirectory}${trimLeadingSlashes(relativePath)}`;
};

const normalizeLocalStemEntry = (slotName, info) => {
  if (!info) return { nextInfo: info, changed: false };

  const isObject = typeof info === "object" && !Array.isArray(info);
  const rawUri = isObject
    ? String(info.localUri || info.uri || "").trim()
    : String(info || "").trim();
  const relativePath =
    (isObject ? String(info.relativePath || "").trim() : "")
    || stemRelativePathFromUri(rawUri);
  const nextUri = currentStemUriFromRelativePath(relativePath) || rawUri;

  if (!isObject) {
    if (!relativePath) return { nextInfo: info, changed: false };
    return {
      nextInfo: {
        localUri: nextUri,
        relativePath,
        label: slotName,
        name: rawUri.split("/").pop() || slotName,
      },
      changed: true,
    };
  }

  const nextInfo = {
    ...info,
    ...(nextUri ? { localUri: nextUri } : {}),
    ...(relativePath ? { relativePath } : {}),
  };

  return {
    nextInfo,
    changed:
      nextInfo.localUri !== info.localUri
      || nextInfo.relativePath !== info.relativePath,
  };
};

const normalizeSongLocalStems = (song) => {
  if (!song?.localStems || typeof song.localStems !== "object") {
    return { nextSong: song, changed: false };
  }

  let changed = false;
  const nextLocalStems = {};

  for (const [slotName, info] of Object.entries(song.localStems)) {
    const { nextInfo, changed: entryChanged } = normalizeLocalStemEntry(slotName, info);
    nextLocalStems[slotName] = nextInfo;
    changed = changed || entryChanged;
  }

  return {
    nextSong: changed ? { ...song, localStems: nextLocalStems } : song,
    changed,
  };
};

const normalizeSongsSnapshot = (songs) => {
  let changed = false;
  const nextSongs = (Array.isArray(songs) ? songs : []).map((song) => {
    const normalized = normalizeSongLocalStems(song);
    changed = changed || normalized.changed;
    return normalized.nextSong;
  });

  return { nextSongs, changed };
};
const normalizeLookupPhone = (value) =>
  String(value || "").replace(/\D+/g, "");

const INVITE_STATUS_ORDER = {
  "": 0,
  ready: 1,
  pending: 2,
  accepted: 3,
  registered: 4,
};

const normalizeInviteStatus = (value) =>
  String(value || "").trim().toLowerCase();

const isPortablePhotoUrl = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    normalized.startsWith("data:image/")
    || normalized.startsWith("http://")
    || normalized.startsWith("https://")
  );
};

const pickPreferredPhotoUrl = (...values) => {
  for (const value of values) {
    if (isPortablePhotoUrl(value)) return String(value || "").trim();
  }
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return null;
};

const getEffectiveInviteStatus = (person = {}) => {
  const baseStatus = normalizeInviteStatus(person?.inviteStatus);
  const isRegistered =
    person?.playbackRegistered === true
    || Boolean(person?.playbackRegisteredAt)
    || Boolean(person?.inviteRegisteredAt);

  if (isRegistered || baseStatus === "registered") return "registered";
  if (person?.inviteAcceptedAt) {
    return INVITE_STATUS_ORDER[baseStatus] >= INVITE_STATUS_ORDER.accepted
      ? baseStatus
      : "accepted";
  }
  return baseStatus;
};

const pickHighestInviteStatus = (...records) => {
  let bestStatus = "";
  let bestRank = -1;

  for (const record of records) {
    const status = getEffectiveInviteStatus(record);
    const rank = INVITE_STATUS_ORDER[status] ?? 0;
    if (rank >= bestRank) {
      bestStatus = status;
      bestRank = rank;
    }
  }

  return bestStatus;
};

const getPersonIdentityTokens = (person) => {
  const tokens = [];
  const email = String(person?.email || "").trim().toLowerCase();
  const phone = normalizeLookupPhone(person?.phone);
  const sharedId = String(person?._sharedId || "").trim();
  const id = String(person?.id || "").trim();

  if (sharedId) tokens.push(`shared:${sharedId}`);
  if (id) tokens.push(`id:${id}`);
  if (email) tokens.push(`email:${email}`);
  if (phone) tokens.push(`phone:${phone}`);

  return Array.from(new Set(tokens));
};

const pickPreferredText = (left, right) => {
  const leftText = String(left || "").trim();
  const rightText = String(right || "").trim();

  if (!leftText) return rightText;
  if (!rightText) return leftText;
  return rightText.length > leftText.length ? rightText : leftText;
};

const mergeBlockoutDates = (left, right) =>
  Array.from(
    new Set([
      ...(Array.isArray(left) ? left : []),
      ...(Array.isArray(right) ? right : []),
    ]),
  );

const mergePersonSource = (leftSource, rightSource) => {
  if (leftSource === "both" || rightSource === "both") return "both";
  if (leftSource && rightSource && leftSource !== rightSource) return "both";
  return rightSource || leftSource || "local";
};

const getLocalPeople = async () => {
  try {
    const raw = await AsyncStorage.getItem(PEOPLE_KEY);
    return safeJsonParse(raw, []);
  } catch {
    return [];
  }
};

// Pull people from Cloudflare KV and refresh the local AsyncStorage snapshot.
// Called once per getPeople() — fire-and-forget with a short timeout so it
// never blocks the UI. Returns the fresh list (or the cached list on failure).
const syncPeopleFromCloud = async () => {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${SYNC_URL}/sync/people`, {
      headers: syncHeaders(),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const remote = await res.json();
    if (Array.isArray(remote) && remote.length > 0) {
      await AsyncStorage.setItem(SHARED_TEAM_MEMBERS_KEY, JSON.stringify(remote));
      return remote;
    }
    return null;
  } catch {
    return null;
  }
};

const getSharedTeamMembersSnapshot = async () => {
  // Always try to refresh from Cloudflare first; fall back to cached snapshot
  const fresh = await syncPeopleFromCloud();
  if (fresh) return fresh;
  try {
    const raw = await AsyncStorage.getItem(SHARED_TEAM_MEMBERS_KEY);
    return safeJsonParse(raw, []);
  } catch {
    return [];
  }
};

const getPersonLookupKey = (person, prefix) => {
  const email = String(person?.email || "").trim().toLowerCase();
  if (email) return email;
  const id = person?._sharedId || person?.id || "unknown";
  return `${prefix}:${id}`;
};

const normalizePersonRoles = (person) => {
  if (Array.isArray(person?.roles) && person.roles.length > 0) {
    return normalizeRoleList(person.roles);
  }
  return normalizeRoleList(person?.roleAssignments || []);
};

const buildRoleAssignments = (person, roles) =>
  person?.roleAssignments || rolesToAssignmentString(roles);

const mergeCanonicalPersonRecord = (left = {}, right = {}) => {
  const leftSource = left?._source || "";
  const rightSource = right?._source || "";
  const leftIsLocalBacked = leftSource === "local" || leftSource === "both";
  const rightIsLocalBacked = rightSource === "local" || rightSource === "both";
  const sharedId =
    right?._sharedId ||
    left?._sharedId ||
    (!rightIsLocalBacked ? right?.id : "") ||
    (!leftIsLocalBacked ? left?.id : "");
  const localId = leftIsLocalBacked ? left?.id : rightIsLocalBacked ? right?.id : "";
  const roles = normalizeRoleList([...(left?.roles || []), ...(right?.roles || [])]);
  const inviteStatus = pickHighestInviteStatus(left, right);
  const playbackRegistered =
    left?.playbackRegistered === true
    || right?.playbackRegistered === true
    || Boolean(left?.playbackRegisteredAt)
    || Boolean(right?.playbackRegisteredAt)
    || Boolean(left?.inviteRegisteredAt)
    || Boolean(right?.inviteRegisteredAt);

  return {
    ...left,
    ...right,
    id: localId || left?.id || right?.id || sharedId || `person_${Date.now()}`,
    name: pickPreferredText(left?.name, right?.name),
    lastName: pickPreferredText(left?.lastName, right?.lastName),
    email: String(right?.email || left?.email || "").trim(),
    phone: String(right?.phone || left?.phone || "").trim(),
    dateOfBirth: String(right?.dateOfBirth || left?.dateOfBirth || "").trim(),
    photo_url: pickPreferredPhotoUrl(right?.photo_url, left?.photo_url),
    blockout_dates: mergeBlockoutDates(left?.blockout_dates, right?.blockout_dates),
    roles,
    roleAssignments:
      roles.length > 0
        ? rolesToAssignmentString(roles)
        : right?.roleAssignments || left?.roleAssignments || "",
    _sharedId: sharedId || "",
    _source: mergePersonSource(leftSource, rightSource),
    roleSyncSource:
      String(right?.roleSyncSource || left?.roleSyncSource || "").trim().toLowerCase(),
    roleSyncUpdatedAt: right?.roleSyncUpdatedAt || left?.roleSyncUpdatedAt || null,
    inviteStatus,
    inviteToken: String(right?.inviteToken || left?.inviteToken || "").trim(),
    inviteCreatedAt: right?.inviteCreatedAt || left?.inviteCreatedAt || null,
    inviteSentAt: right?.inviteSentAt || left?.inviteSentAt || null,
    inviteAcceptedAt: right?.inviteAcceptedAt || left?.inviteAcceptedAt || null,
    inviteRegisteredAt: right?.inviteRegisteredAt || left?.inviteRegisteredAt || null,
    playbackRegistered,
    playbackRegisteredAt:
      right?.playbackRegisteredAt
      || left?.playbackRegisteredAt
      || right?.inviteRegisteredAt
      || left?.inviteRegisteredAt
      || null,
    createdAt: left?.createdAt || right?.createdAt || nowIso(),
    updatedAt: right?.updatedAt || left?.updatedAt || nowIso(),
  };
};

const dedupePeopleRecords = (people) => {
  const deduped = [];
  const indexByIdentity = new Map();

  for (const person of people) {
    const identities = getPersonIdentityTokens(person);
    let existingIndex = -1;

    for (const identity of identities) {
      if (indexByIdentity.has(identity)) {
        existingIndex = indexByIdentity.get(identity);
        break;
      }
    }

    if (existingIndex === -1) {
      const nextIndex = deduped.push(mergeCanonicalPersonRecord({}, person)) - 1;
      for (const identity of getPersonIdentityTokens(deduped[nextIndex])) {
        indexByIdentity.set(identity, nextIndex);
      }
      continue;
    }

    deduped[existingIndex] = mergeCanonicalPersonRecord(deduped[existingIndex], person);
    for (const identity of getPersonIdentityTokens(deduped[existingIndex])) {
      indexByIdentity.set(identity, existingIndex);
    }
  }

  return deduped;
};

const mergePeopleRecords = (localPeople, sharedMembers) => {
  const peopleMap = new Map();

  for (const person of localPeople) {
    const roles = normalizePersonRoles(person);
    peopleMap.set(getPersonLookupKey(person, "local"), {
      ...person,
      roles,
      roleAssignments: buildRoleAssignments(person, roles),
      _source: person._source || "local",
    });
  }

  for (const member of sharedMembers) {
    const key = getPersonLookupKey(member, "shared");
    const existing = peopleMap.get(key);
    const sharedRoles = normalizePersonRoles(member);
    const mergedRoles = sharedRoles.length > 0 ? sharedRoles : existing?.roles || [];
    const baseSharedName = String(member?.name || "").trim();
    const baseSharedLastName = String(member?.lastName || "").trim();
    const sharedName =
      (baseSharedName &&
      baseSharedLastName &&
      baseSharedName.toLowerCase().endsWith(baseSharedLastName.toLowerCase())
        ? baseSharedName
        : [baseSharedName, baseSharedLastName].filter(Boolean).join(" ").trim()) ||
      baseSharedName ||
      existing?.name ||
      "";

    if (existing) {
      const nextInviteStatus = pickHighestInviteStatus(existing, member);
      const nextPlaybackRegistered =
        member?.playbackRegistered === true
        || existing?.playbackRegistered === true
        || Boolean(member?.playbackRegisteredAt)
        || Boolean(existing?.playbackRegisteredAt)
        || Boolean(member?.inviteRegisteredAt)
        || Boolean(existing?.inviteRegisteredAt);
      peopleMap.set(key, {
        ...existing,
        name: sharedName,
        lastName: member?.lastName ?? existing?.lastName,
        email: member?.email || existing?.email || "",
        phone: member?.phone || existing?.phone || "",
        dateOfBirth: member?.dateOfBirth ?? existing?.dateOfBirth,
        photo_url: pickPreferredPhotoUrl(member?.photo_url, existing?.photo_url),
        blockout_dates:
          member?.blockout_dates ?? existing?.blockout_dates ?? [],
        roles: mergedRoles,
        roleAssignments:
          buildRoleAssignments(member, mergedRoles) ||
          buildRoleAssignments(existing, mergedRoles),
        roleSyncSource: String(member?.roleSyncSource || existing?.roleSyncSource || "")
          .trim()
          .toLowerCase(),
        roleSyncUpdatedAt:
          member?.roleSyncUpdatedAt || existing?.roleSyncUpdatedAt || null,
        inviteStatus: nextInviteStatus,
        inviteToken: String(member?.inviteToken || existing?.inviteToken || "").trim(),
        inviteCreatedAt: member?.inviteCreatedAt || existing?.inviteCreatedAt || null,
        inviteSentAt: member?.inviteSentAt || existing?.inviteSentAt || null,
        inviteAcceptedAt: member?.inviteAcceptedAt || existing?.inviteAcceptedAt || null,
        inviteRegisteredAt: member?.inviteRegisteredAt || existing?.inviteRegisteredAt || null,
        playbackRegistered: nextPlaybackRegistered,
        playbackRegisteredAt:
          member?.playbackRegisteredAt
          || existing?.playbackRegisteredAt
          || member?.inviteRegisteredAt
          || existing?.inviteRegisteredAt
          || null,
        _sharedId: member?.id,
        _source: "both",
      });
      continue;
    }

    peopleMap.set(key, {
      id: member?.id,
      name: sharedName,
      lastName: member?.lastName || "",
      email: member?.email || "",
      phone: member?.phone || "",
      dateOfBirth: member?.dateOfBirth || "",
      photo_url: pickPreferredPhotoUrl(member?.photo_url),
      blockout_dates: member?.blockout_dates || [],
      roles: mergedRoles,
      roleAssignments: buildRoleAssignments(member, mergedRoles),
      roleSyncSource: String(member?.roleSyncSource || "").trim().toLowerCase(),
      roleSyncUpdatedAt: member?.roleSyncUpdatedAt || null,
      inviteStatus: getEffectiveInviteStatus(member),
      inviteToken: String(member?.inviteToken || "").trim(),
      inviteCreatedAt: member?.inviteCreatedAt || null,
      inviteSentAt: member?.inviteSentAt || null,
      inviteAcceptedAt: member?.inviteAcceptedAt || null,
      inviteRegisteredAt: member?.inviteRegisteredAt || null,
      playbackRegistered:
        member?.playbackRegistered === true
        || Boolean(member?.playbackRegisteredAt)
        || Boolean(member?.inviteRegisteredAt),
      playbackRegisteredAt:
        member?.playbackRegisteredAt || member?.inviteRegisteredAt || null,
      _sharedId: member?.id,
      _source: "playback",
      createdAt: member?.createdAt || nowIso(),
      updatedAt: member?.updatedAt || nowIso(),
    });
  }

  return dedupePeopleRecords(Array.from(peopleMap.values()));
};

export const getSettings = async () => {
  const fallback = sanitizeSettings({
    apiBase: CINESTAGE_URL,
    defaultUserId: "demo-user",
  });
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const parsed = safeJsonParse(raw, fallback);
    const next = sanitizeSettings(parsed);
    if (JSON.stringify(next) !== JSON.stringify(parsed)) {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    }
    return next;
  } catch {
    return fallback;
  }
};

export const saveSettings = async (next) => {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(next)));
  } catch (err) {
    console.warn("[storage] saveSettings failed:", err);
  }
};

export const getSongs = async () => {
  try {
    const raw = await AsyncStorage.getItem(SONGS_KEY);
    const parsed = safeJsonParse(raw, []);
    const { nextSongs, changed } = normalizeSongsSnapshot(parsed);
    if (changed) {
      await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(nextSongs));
    }
    return nextSongs;
  } catch {
    return [];
  }
};

export const saveSongs = async (songs) => {
  try {
    const { nextSongs } = normalizeSongsSnapshot(songs);
    await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(nextSongs));
  } catch (err) {
    console.warn("[storage] saveSongs failed:", err);
  }
};

export const addOrUpdateSong = async (song) => {
  const songs = await getSongs();
  const index = songs.findIndex((s) => s.id === song.id);
  const normalizedSong = normalizeSongLocalStems(song).nextSong;
  const next = {
    ...normalizedSong,
    updatedAt: nowIso(),
    createdAt: normalizedSong.createdAt || nowIso(),
  };
  if (index >= 0) {
    songs[index] = next;
  } else {
    songs.unshift(next);
  }
  await saveSongs(songs);
  return next;
};

export const deleteSong = async (songId) => {
  const songs = await getSongs();
  const next = songs.filter((s) => s.id !== songId);
  await saveSongs(next);
  return next;
};

export const clearSongs = async () => {
  await saveSongs([]);
};

export const findSongDuplicate = (songs, title, artist) => {
  const key = `${(title || "").trim().toLowerCase()}::${(artist || "").trim().toLowerCase()}`;
  return songs.find(
    (s) =>
      `${(s.title || "").trim().toLowerCase()}::${(s.artist || "").trim().toLowerCase()}` ===
      key,
  );
};

export const getServices = async () => {
  try {
    const raw = await AsyncStorage.getItem(SERVICES_KEY);
    return safeJsonParse(raw, []);
  } catch {
    return [];
  }
};

export const saveServices = async (services) => {
  try {
    await AsyncStorage.setItem(SERVICES_KEY, JSON.stringify(services));
  } catch (err) {
    console.warn("[storage] saveServices failed:", err);
  }
};

export const addOrUpdateService = async (service) => {
  const services = await getServices();
  const index = services.findIndex((s) => s.id === service.id);
  const next = {
    ...service,
    updatedAt: nowIso(),
    createdAt: service.createdAt || nowIso(),
  };
  if (index >= 0) {
    services[index] = next;
  } else {
    services.unshift(next);
  }
  await saveServices(services);
  return next;
};

export const getPeople = async () => {
  try {
    const [localPeople, sharedMembers] = await Promise.all([
      getLocalPeople(),
      getSharedTeamMembersSnapshot(),
    ]);
    return mergePeopleRecords(localPeople, sharedMembers);
  } catch {
    return [];
  }
};

const buildCloudPersonPayload = (person) => {
  const roles = normalizePersonRoles(person);
  return {
    id: person?._sharedId || person?.id || "",
    name: String(person?.name || "").trim(),
    lastName: String(person?.lastName || "").trim(),
    email: String(person?.email || "").trim().toLowerCase(),
    phone: String(person?.phone || "").trim(),
    dateOfBirth: String(person?.dateOfBirth || "").trim(),
    photo_url: pickPreferredPhotoUrl(person?.photo_url),
    roles,
    roleAssignments: buildRoleAssignments(person, roles),
    roleSyncSource: String(person?.roleSyncSource || "").trim().toLowerCase(),
    roleSyncUpdatedAt: person?.roleSyncUpdatedAt || null,
    blockout_dates: Array.isArray(person?.blockout_dates)
      ? person.blockout_dates
      : [],
    inviteStatus: getEffectiveInviteStatus(person),
    inviteToken: String(person?.inviteToken || "").trim(),
    inviteCreatedAt: person?.inviteCreatedAt || null,
    inviteSentAt: person?.inviteSentAt || null,
    inviteAcceptedAt: person?.inviteAcceptedAt || null,
    inviteRegisteredAt: person?.inviteRegisteredAt || null,
    playbackRegistered:
      person?.playbackRegistered === true
      || Boolean(person?.playbackRegisteredAt)
      || Boolean(person?.inviteRegisteredAt),
    playbackRegisteredAt:
      person?.playbackRegisteredAt || person?.inviteRegisteredAt || null,
    createdAt: person?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
};

export const syncPersonToCloud = async (person) => {
  const payload = buildCloudPersonPayload(person);
  const res = await fetch(`${SYNC_URL}/sync/people`, {
    method: "POST",
    headers: syncHeaders(),
    body: JSON.stringify({ person: payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Could not sync this team member to the server.");
  }
  return data;
};

export const deletePersonFromCloud = async (person) => {
  const payload = {
    personId: person?._sharedId || person?.id || "",
    email: String(person?.email || "").trim().toLowerCase(),
    phone: String(person?.phone || "").trim(),
  };
  const res = await fetch(`${SYNC_URL}/sync/people`, {
    method: "DELETE",
    headers: syncHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Could not remove this team member from the server.");
  }
  return data;
};

export const savePeople = async (people) => {
  try {
    await AsyncStorage.setItem(PEOPLE_KEY, JSON.stringify(people));
  } catch (err) {
    console.warn("[storage] savePeople failed:", err);
  }
};

export const addOrUpdatePerson = async (person) => {
  const people = await getLocalPeople();
  const index = people.findIndex((p) => p.id === person.id);
  const next = {
    ...person,
    updatedAt: nowIso(),
    createdAt: person.createdAt || nowIso(),
  };
  if (index >= 0) {
    people[index] = next;
  } else {
    people.unshift(next);
  }
  await savePeople(people);
  return next;
};

export const deletePerson = async (personId) => {
  const people = await getLocalPeople();
  const next = people.filter((p) => p.id !== personId);
  await savePeople(next);
  return next;
};

// ROLES
export const getRoles = async () => {
  try {
    const raw = await AsyncStorage.getItem(ROLES_KEY);
    return safeJsonParse(raw, []);
  } catch {
    return [];
  }
};

export const saveRoles = async (roles) => {
  try {
    await AsyncStorage.setItem(ROLES_KEY, JSON.stringify(roles));
  } catch (err) {
    console.warn("[storage] saveRoles failed:", err);
  }
};

// SERVICE PLAN
export const getServicePlan = async () => {
  try {
    const raw = await AsyncStorage.getItem(SERVICE_PLAN_KEY);
    return safeJsonParse(raw, makeEmptyServicePlan());
  } catch {
    return makeEmptyServicePlan();
  }
};

export const saveServicePlan = async (plan) => {
  try {
    await AsyncStorage.setItem(SERVICE_PLAN_KEY, JSON.stringify(plan));
  } catch (err) {
    console.warn("[storage] saveServicePlan failed:", err);
  }
};

export const addSongToServicePlan = async (song) => {
  const plan = await getServicePlan();
  const item = {
    id: `item_${Date.now()}`,
    songId: song.id,
    title: song.title,
    bpm: song.bpm,
    key: song.originalKey || song.key,
    cues: song.cues || [],
  };
  plan.items = [...(plan.items || []), item];
  plan.updatedAt = Date.now();
  await saveServicePlan(plan);
  return plan;
};

export const toggleServiceLock = async (locked) => {
  const plan = await getServicePlan();
  plan.locked = !!locked;
  plan.updatedAt = Date.now();
  await saveServicePlan(plan);
  return plan;
};

// SEEDING
export const ensureSeeded = async () => {
  const seeded = await AsyncStorage.getItem(SEEDED_KEY);
  if (seeded === "true") {
    // Still seed Cifras in background on every cold start (no-op if already done)
    ensureCifrasSeeded().catch(() => {});
    return;
  }
  await saveSongs(demoSongs());
  await saveRoles(demoRoles());
  await AsyncStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify(demoSettings() || makeDefaultSettings()),
  );
  await saveServicePlan(demoServicePlan() || makeEmptyServicePlan());
  await AsyncStorage.setItem(SEEDED_KEY, "true");
  // Seed Cifras church library in background after demo seed completes
  ensureCifrasSeeded().catch(() => {});
};

export const resetAll = async () => {
  await AsyncStorage.multiRemove([
    SEEDED_KEY,
    SONGS_KEY,
    ROLES_KEY,
    SETTINGS_KEY,
    SERVICE_PLAN_KEY,
  ]);
  await ensureSeeded();
};
