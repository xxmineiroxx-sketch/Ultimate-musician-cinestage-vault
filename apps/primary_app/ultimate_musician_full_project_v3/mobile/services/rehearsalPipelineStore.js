import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "UM_REHEARSAL_PIPELINE_ARMED_V1";
const HISTORY_KEY = "UM_REHEARSAL_PIPELINE_HISTORY_V1";
const HISTORY_LIMIT = 24;

export const GRID_MODES = ["BAR", "BEAT", "FREE"];

export function quantizeTime(timeSec, gridMode, bpm = 120) {
  const value = Math.max(0, Number(timeSec || 0));
  if (gridMode === "FREE") return value;
  const safeBpm = Math.max(30, Number(bpm || 120));
  const beat = 60 / safeBpm;
  const step = gridMode === "BAR" ? beat * 4 : beat;
  return Math.round(value / step) * step;
}

export function markerTemplate(label, start, end, color) {
  return {
    id: `mk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label,
    start: Math.max(0, Number(start || 0)),
    end: Math.max(0, Number(end || start || 0)),
    color: color || "#4F46E5",
  };
}

export function updateMarkerRange(marker, start, end, maxDurationSec = null) {
  const safeStart = Math.max(0, Number(start || 0));
  const safeEnd = Math.max(safeStart + 0.2, Number(end || safeStart + 0.2));
  const cap =
    maxDurationSec && maxDurationSec > 0 ? Number(maxDurationSec) : null;
  return {
    ...marker,
    start: cap ? Math.min(safeStart, cap) : safeStart,
    end: cap ? Math.min(Math.max(safeEnd, safeStart + 0.2), cap) : safeEnd,
  };
}

export function buildMarkersFromSections(sections, durationSec) {
  const total = Math.max(1, Number(durationSec || 0));
  const sorted = [...(sections || [])].sort(
    (a, b) =>
      Number(a?.positionSeconds || a?.start || 0) -
      Number(b?.positionSeconds || b?.start || 0),
  );

  return sorted.map((section, idx) => {
    const start = Number(section?.positionSeconds || section?.start || 0);
    const next = sorted[idx + 1];
    const nextStart = Number(next?.positionSeconds || next?.start || total);
    return markerTemplate(
      section?.label || section?.name || `Section ${idx + 1}`,
      start,
      Math.max(start + 0.5, nextStart),
      section?.color || "#4F46E5",
    );
  });
}

export async function saveArmedPipeline(payload) {
  const next = {
    ...payload,
    armedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  await pushArmedPipelineHistory(next);
  return next;
}

export async function loadArmedPipeline() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearArmedPipeline() {
  await AsyncStorage.removeItem(KEY);
}

async function pushArmedPipelineHistory(pipeline) {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const current = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(current) ? current : [];
    const next = [pipeline, ...list].slice(0, HISTORY_LIMIT);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [pipeline];
  }
}

export async function getArmedPipelineHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function rollbackArmedPipeline(armedAt) {
  const history = await getArmedPipelineHistory();
  const found = history.find((item) => item?.armedAt === armedAt) || null;
  if (!found) return null;
  await AsyncStorage.setItem(KEY, JSON.stringify(found));
  return found;
}

function normalizeMarkerList(markers) {
  return (markers || [])
    .map((m) => ({
      id: String(m?.id || ""),
      label: String(m?.label || ""),
      start: Number(m?.start || 0),
      end: Number(m?.end || 0),
    }))
    .sort((a, b) => a.start - b.start);
}

export function diffArmedPipelines(current, previous) {
  if (!current && !previous) return { changed: false, summary: "No pipeline." };
  if (current && !previous)
    return {
      changed: true,
      summary: "First armed pipeline snapshot.",
      details: ["No previous snapshot"],
    };
  if (!current && previous)
    return {
      changed: true,
      summary: "Current pipeline missing.",
      details: ["Previous snapshot exists"],
    };

  const out = [];
  if ((current?.songId || null) !== (previous?.songId || null))
    out.push("Song changed");
  if ((current?.role || "") !== (previous?.role || ""))
    out.push("Role changed");
  if ((current?.gridMode || "") !== (previous?.gridMode || ""))
    out.push("Grid mode changed");
  if (
    (current?.performancePolicy?.launchQuantization || "") !==
    (previous?.performancePolicy?.launchQuantization || "")
  ) {
    out.push("Launch quantization changed");
  }
  if (
    (current?.performancePolicy?.transitionMode || "") !==
    (previous?.performancePolicy?.transitionMode || "")
  ) {
    out.push("Transition mode changed");
  }

  const curMarkers = normalizeMarkerList(current?.markers || []);
  const prevMarkers = normalizeMarkerList(previous?.markers || []);
  if (curMarkers.length !== prevMarkers.length)
    out.push(`Marker count ${prevMarkers.length} -> ${curMarkers.length}`);
  const cap = Math.min(curMarkers.length, prevMarkers.length);
  for (let i = 0; i < cap; i += 1) {
    const c = curMarkers[i];
    const p = prevMarkers[i];
    if (
      c.label !== p.label ||
      Math.abs(c.start - p.start) > 0.12 ||
      Math.abs(c.end - p.end) > 0.12
    ) {
      out.push(`Marker edited: ${p.label || p.id}`);
      break;
    }
  }

  const curEvents = (current?.automationLanes?.events || []).length;
  const prevEvents = (previous?.automationLanes?.events || []).length;
  if (curEvents !== prevEvents)
    out.push(`Automation events ${prevEvents} -> ${curEvents}`);

  return {
    changed: out.length > 0,
    summary:
      out.length > 0
        ? `${out.length} changes since last armed snapshot.`
        : "No changes since last armed snapshot.",
    details: out,
  };
}
