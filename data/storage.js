import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeDefaultSettings, makeEmptyServicePlan } from './models';
import { demoSongs, demoRoles, demoSettings, demoServicePlan } from './demoSeed';

const SONGS_KEY = 'um.songs.v2';
const SERVICES_KEY = 'um.services.v1';
const PEOPLE_KEY = 'um.people.v1';
const SETTINGS_KEY = 'um.settings.v1';
const ROLES_KEY = 'um.roles.v1';
const SERVICE_PLAN_KEY = 'um.service_plan.v1';
const SEEDED_KEY = 'um.seeded.v1';

const safeJsonParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const nowIso = () => new Date().toISOString();

export const getSettings = async () => {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return safeJsonParse(raw, {
    apiBase: 'http://localhost:8000',
    defaultUserId: 'demo-user',
  });
};

export const saveSettings = async (next) => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
};

export const getSongs = async () => {
  const raw = await AsyncStorage.getItem(SONGS_KEY);
  return safeJsonParse(raw, []);
};

export const saveSongs = async (songs) => {
  await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(songs));
};

export const addOrUpdateSong = async (song) => {
  const songs = await getSongs();
  const index = songs.findIndex((s) => s.id === song.id);
  const next = {
    ...song,
    updatedAt: nowIso(),
    createdAt: song.createdAt || nowIso(),
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

export const findSongDuplicate = (songs, title, artist) => {
  const key = `${(title || '').trim().toLowerCase()}::${(artist || '').trim().toLowerCase()}`;
  return songs.find((s) => `${(s.title || '').trim().toLowerCase()}::${(s.artist || '').trim().toLowerCase()}` === key);
};

export const getServices = async () => {
  const raw = await AsyncStorage.getItem(SERVICES_KEY);
  return safeJsonParse(raw, []);
};

export const saveServices = async (services) => {
  await AsyncStorage.setItem(SERVICES_KEY, JSON.stringify(services));
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
  const raw = await AsyncStorage.getItem(PEOPLE_KEY);
  return safeJsonParse(raw, []);
};

export const savePeople = async (people) => {
  await AsyncStorage.setItem(PEOPLE_KEY, JSON.stringify(people));
};

export const addOrUpdatePerson = async (person) => {
  const people = await getPeople();
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
  const people = await getPeople();
  const next = people.filter((p) => p.id !== personId);
  await savePeople(next);
  return next;
};

// ROLES
export const getRoles = async () => {
  const raw = await AsyncStorage.getItem(ROLES_KEY);
  return safeJsonParse(raw, []);
};

export const saveRoles = async (roles) => {
  await AsyncStorage.setItem(ROLES_KEY, JSON.stringify(roles));
};

// SERVICE PLAN
export const getServicePlan = async () => {
  const raw = await AsyncStorage.getItem(SERVICE_PLAN_KEY);
  return safeJsonParse(raw, makeEmptyServicePlan());
};

export const saveServicePlan = async (plan) => {
  await AsyncStorage.setItem(SERVICE_PLAN_KEY, JSON.stringify(plan));
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
  if (seeded === 'true') return;
  await saveSongs(demoSongs());
  await saveRoles(demoRoles());
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(demoSettings() || makeDefaultSettings()));
  await saveServicePlan(demoServicePlan() || makeEmptyServicePlan());
  await AsyncStorage.setItem(SEEDED_KEY, 'true');
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
