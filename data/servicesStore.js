import AsyncStorage from "@react-native-async-storage/async-storage";
import { getServiceTypeMeta } from "./serviceTemplates";

/**
 * Services Calendar v1.1
 * Adds:
 * - serviceType (standard / communion / easter / etc)
 * - leadDays per type (special services show earlier)
 * - helper: getUpcomingServices({lookaheadDays})
 */

const KEYS = {
  SERVICES: "um/services/v1",
  ACTIVE_SERVICE_ID: "um/services/active_id/v1",
};

async function getJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function setJSON(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getServices() {
  const list = await getJSON(KEYS.SERVICES, []);
  return Array.isArray(list) ? list : [];
}

export async function saveServices(services) {
  await setJSON(KEYS.SERVICES, services);
}

export async function getActiveServiceId() {
  return (await AsyncStorage.getItem(KEYS.ACTIVE_SERVICE_ID)) || "";
}

export async function setActiveServiceId(serviceId) {
  await AsyncStorage.setItem(KEYS.ACTIVE_SERVICE_ID, serviceId || "");
}

export function makeServiceId() {
  return `svc_${Date.now()}`;
}

export function makePlanId() {
  return `plan_${Date.now()}`;
}

function toTs(dateStr, timeStr) {
  // date: YYYY-MM-DD, time: HH:mm
  const iso = `${dateStr}T${timeStr || "00:00"}:00`;
  const d = new Date(iso);
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function sortByDateTimeAsc(a, b) {
  return (toTs(a.date, a.time) || 0) - (toTs(b.date, b.time) || 0);
}

export function humanStatus(status) {
  if (status === "locked") return "🔒 Locked";
  if (status === "ready") return "🟢 Ready";
  return "🟡 Draft";
}

export async function createService({
  title,
  date,
  time,
  status = "draft",
  servicePlanId,
  serviceType = "standard",
}) {
  const now = Date.now();
  const meta = getServiceTypeMeta(serviceType);

  const svc = {
    id: makeServiceId(),
    title: title || meta.name || "Service",
    date, // YYYY-MM-DD
    time, // HH:mm
    status, // draft | ready | locked
    servicePlanId: servicePlanId || makePlanId(),
    serviceType, // standard | communion | ...
    isSpecial: !!meta.special,
    leadDays: meta.leadDays ?? 21,
    createdAt: now,
    updatedAt: now,
  };

  const list = await getServices();
  const next = [svc, ...list].sort(sortByDateTimeAsc);
  await saveServices(next);
  return svc;
}

export async function updateService(serviceId, patch) {
  const list = await getServices();
  const next = list.map((s) => {
    if (s.id !== serviceId) return s;
    const serviceType = patch.serviceType ?? s.serviceType ?? "standard";
    const meta = getServiceTypeMeta(serviceType);
    return {
      ...s,
      ...patch,
      serviceType,
      isSpecial: patch.isSpecial ?? !!meta.special,
      leadDays: patch.leadDays ?? meta.leadDays ?? s.leadDays ?? 21,
      updatedAt: Date.now(),
    };
  });

  next.sort(sortByDateTimeAsc);
  await saveServices(next);
  return next.find((s) => s.id === serviceId) || null;
}

export async function deleteService(serviceId) {
  const list = await getServices();
  const next = list.filter((s) => s.id !== serviceId);
  await saveServices(next);
  const active = await getActiveServiceId();
  if (active === serviceId) await setActiveServiceId("");
  return next;
}

/**
 * Upcoming services logic:
 * - Standard services: within lookaheadDays (default 21 days)
 * - Special services: within their leadDays window (default 14 for communion, 30 for easter/christmas)
 */
export async function getUpcomingServices({ lookaheadDays = 21, includePastDays = 1 } = {}) {
  const list = await getServices();
  const now = Date.now();
  const minTs = now - includePastDays * 24 * 60 * 60 * 1000;
  const maxStandardTs = now + lookaheadDays * 24 * 60 * 60 * 1000;

  const upcoming = list.filter((s) => {
    const ts = toTs(s.date, s.time);
    if (!ts) return false;
    if (ts < minTs) return false;

    // Determine window:
    const leadDays = s.leadDays ?? (s.isSpecial ? 14 : lookaheadDays);
    const maxSpecialTs = now + leadDays * 24 * 60 * 60 * 1000;

    if (s.isSpecial) return ts <= maxSpecialTs;
    return ts <= maxStandardTs;
  });

  return upcoming.sort(sortByDateTimeAsc);
}
