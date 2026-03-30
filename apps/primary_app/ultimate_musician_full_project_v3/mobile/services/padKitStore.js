import AsyncStorage from "@react-native-async-storage/async-storage";

const KITS_KEY = "UM_PAD_KITS_V1";
const ACTIVE_KEY = "UM_PAD_KIT_ACTIVE_V1";

const NOTES_12 = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const PAD_BASE = "https://ultimatelabs.pages.dev/sync/audio/pads";
function noteUrl(note) {
  return note.replace("#", "%23");
}

const BUILTIN_KITS = [
  {
    id: "kit_worship_core",
    name: "Worship Core",
    source: "builtin",
    pads: NOTES_12.map((note, i) => ({
      note,
      label: `Pad ${note}`,
      sampleUri: null,
      velocity: 1,
      slot: i + 1,
    })),
  },
  {
    id: "kit_cinematic_air",
    name: "Cinematic Air",
    source: "builtin",
    pads: NOTES_12.map((note, i) => ({
      note,
      label: `Air ${note}`,
      sampleUri: null,
      velocity: 1,
      slot: i + 1,
    })),
  },
  {
    id: "kit_motion_vol1",
    name: "Motion Pads Vol 1",
    source: "builtin",
    pads: NOTES_12.map((note, i) => ({
      note,
      label: `${note} Pad`,
      velocity: 1,
      slot: i + 1,
      sampleUri: `${PAD_BASE}/MONTION%20PADS%20-%20ABEL%20MENDONZA/Motion%20Pads%20Vol%201/${noteUrl(note)}-PAD.mp3`,
    })),
  },
  {
    id: "kit_motion_vol2",
    name: "Motion Pads Vol 2",
    source: "builtin",
    pads: NOTES_12.map((note, i) => ({
      note,
      label: `${note} Pad`,
      velocity: 1,
      slot: i + 1,
      sampleUri: `${PAD_BASE}/Motion%20Pads%20Vol%202%20MP3/${noteUrl(note)}%20Pad.mp3`,
    })),
  },
  {
    id: "kit_motion_vol3",
    name: "Motion Pads Vol 3",
    source: "builtin",
    pads: NOTES_12.map((note, i) => ({
      note,
      label: `${note} Pad`,
      velocity: 1,
      slot: i + 1,
      sampleUri: `${PAD_BASE}/Motion%20Pads%20Vol%203%20MP3/${noteUrl(note)}%20Pad.mp3`,
    })),
  },
];

function normalizeKit(raw) {
  const pads = Array.isArray(raw?.pads) ? raw.pads.slice(0, 12) : [];
  const mapped = NOTES_12.map((note, idx) => {
    const hit = pads[idx] || {};
    return {
      note,
      label: hit.label || `Pad ${note}`,
      sampleUri: hit.sampleUri || null,
      velocity: typeof hit.velocity === "number" ? hit.velocity : 1,
      slot: idx + 1,
    };
  });

  return {
    id: raw?.id || `kit_${Date.now()}`,
    name: raw?.name || "Imported Kit",
    source: raw?.source || "imported",
    pads: mapped,
  };
}

export async function getPadKits() {
  try {
    const raw = await AsyncStorage.getItem(KITS_KEY);
    const imported = raw ? JSON.parse(raw) : [];
    return [
      ...BUILTIN_KITS,
      ...(Array.isArray(imported) ? imported.map(normalizeKit) : []),
    ];
  } catch {
    return [...BUILTIN_KITS];
  }
}

export async function saveImportedPadKit(kit) {
  const normalized = normalizeKit({ ...kit, source: "imported" });
  const raw = await AsyncStorage.getItem(KITS_KEY);
  const current = raw ? JSON.parse(raw) : [];
  const without = (Array.isArray(current) ? current : []).filter(
    (k) => k.id !== normalized.id,
  );
  const next = [...without, normalized];
  await AsyncStorage.setItem(KITS_KEY, JSON.stringify(next));
  return normalized;
}

export function parsePadKitJson(rawText) {
  const parsed = JSON.parse(rawText);
  return normalizeKit({
    ...parsed,
    source: parsed?.source || "imported",
  });
}

export async function importPadKitFromJsonText(rawText) {
  const kit = parsePadKitJson(rawText);
  await saveImportedPadKit(kit);
  await setActivePadKitId(kit.id);
  return kit;
}

export async function getActivePadKitId() {
  return AsyncStorage.getItem(ACTIVE_KEY);
}

export async function setActivePadKitId(id) {
  await AsyncStorage.setItem(ACTIVE_KEY, String(id || ""));
}

export async function getActivePadKit() {
  const kits = await getPadKits();
  const activeId = await getActivePadKitId();
  return kits.find((k) => k.id === activeId) || kits[0] || null;
}

export async function cycleNextPadKit(currentId) {
  const kits = await getPadKits();
  if (kits.length === 0) return null;
  const idx = Math.max(
    0,
    kits.findIndex((k) => k.id === currentId),
  );
  const next = kits[(idx + 1) % kits.length];
  await setActivePadKitId(next.id);
  return next;
}

export { NOTES_12, BUILTIN_KITS };
