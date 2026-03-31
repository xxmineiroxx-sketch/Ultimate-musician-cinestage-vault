export const ROLE_OPTIONS = [
  "Leader",
  "Music Director",
  "Vocal Lead",
  "Vocal BGV",
  "Drums",
  "Bass",
  "Electric Guitar",
  "Acoustic Guitar",
  "Keys",
  "Synth/Pad",
  "Tracks",
  "Sound",
  "Media",
];

const ROLE_ALIAS_MAP = {
  leader: "Leader",
  "worship leader": "Leader",
  worship_leader: "Leader",
  md: "Music Director",
  "music director": "Music Director",
  music_director: "Music Director",
  "vocal lead": "Vocal Lead",
  "lead vocal": "Vocal Lead",
  "lead vocals": "Vocal Lead",
  lead_vocal: "Vocal Lead",
  vocalist: "Vocal Lead",
  "vocal bgv": "Vocal BGV",
  "back vocal": "Vocal BGV",
  "back vocals": "Vocal BGV",
  "background vocal": "Vocal BGV",
  "background vocals": "Vocal BGV",
  bgv: "Vocal BGV",
  bgv_1: "Vocal BGV",
  bgv_2: "Vocal BGV",
  bgv_3: "Vocal BGV",
  "bgv 1": "Vocal BGV",
  "bgv 2": "Vocal BGV",
  "bgv 3": "Vocal BGV",
  drums: "Drums",
  drummer: "Drums",
  bass: "Bass",
  bassist: "Bass",
  guitar: "Electric Guitar",
  guitarist: "Electric Guitar",
  "electric guitar": "Electric Guitar",
  "electric guitarist": "Electric Guitar",
  electric_guitar: "Electric Guitar",
  "e guitar": "Electric Guitar",
  "e. guitar": "Electric Guitar",
  eguitar: "Electric Guitar",
  acoustic: "Acoustic Guitar",
  "acoustic guitar": "Acoustic Guitar",
  "acoustic guitarist": "Acoustic Guitar",
  acoustic_guitar: "Acoustic Guitar",
  "a guitar": "Acoustic Guitar",
  "a. guitar": "Acoustic Guitar",
  aguitar: "Acoustic Guitar",
  keys: "Keys",
  key: "Keys",
  keyboard: "Keys",
  keyboardist: "Keys",
  piano: "Keys",
  synth: "Synth/Pad",
  pad: "Synth/Pad",
  "synth/pad": "Synth/Pad",
  "synth pad": "Synth/Pad",
  track: "Tracks",
  tracks: "Tracks",
  sound: "Sound",
  "sound tech": "Sound",
  sound_tech: "Sound",
  "sound technician": "Sound",
  "sound engineer": "Sound",
  "foh engineer": "Sound",
  foh_engineer: "Sound",
  "front of house": "Sound",
  "monitor engineer": "Sound",
  monitor_engineer: "Sound",
  "stream engineer": "Sound",
  stream_engineer: "Sound",
  media: "Media",
  "media tech": "Media",
  media_tech: "Media",
  propresenter: "Media",
  lighting: "Media",
  "stage manager": "Media",
};

export function normalizeRoleValue(role) {
  const raw = String(role || "").trim();
  if (!raw) return "";

  const directMatch = ROLE_OPTIONS.find(
    (option) => option.toLowerCase() === raw.toLowerCase(),
  );
  if (directMatch) return directMatch;

  const normalized = raw
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return ROLE_ALIAS_MAP[normalized] || raw;
}

export function normalizeRoleList(roles = []) {
  const source = Array.isArray(roles) ? roles : String(roles || "").split(/[,\n;]/);
  const seen = new Set();
  const normalizedRoles = [];

  for (const role of source) {
    const normalizedRole = normalizeRoleValue(role);
    if (!normalizedRole) continue;
    const key = normalizedRole.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedRoles.push(normalizedRole);
  }

  return normalizedRoles;
}

export function formatRoleLabel(role) {
  const normalized = normalizeRoleValue(role);
  if (!normalized) return "";
  if (normalized === "Sound") {
    return "Sound Tech";
  }
  return normalized;
}

export function rolesToAssignmentString(roles = []) {
  return normalizeRoleList(roles)
    .map((role) => formatRoleLabel(role))
    .join(", ");
}

export const INSTRUMENT_SHEETS = [
  "Vocal",
  "Drums",
  "Bass",
  "Electric Guitar",
  "Acoustic Guitar",
  "Keys",
  "Synth/Pad",
];

// Instruments that receive the chord chart when distributing
// (Drums and Vocal are excluded — Drums has its own groove notes; Vocal gets lyrics-only)
export const CHORD_CHART_INSTRUMENTS = [
  "Keys",
  "Acoustic Guitar",
  "Electric Guitar",
  "Bass",
  "Synth/Pad",
];

// Classical voice parts used for vocal assignment & reference audio distribution
export const VOICE_PARTS = [
  "Soprano",
  "Mezzo-Soprano",
  "Alto",
  "Tenor",
  "Baritone",
  "Bass",
];

export const STEM_TYPES = [
  "vocals",
  "drums",
  "bass",
  "keys",
  "guitars",
  "other",
];

export const makeId = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;

export const StorageKeys = {
  SEEDED: "um.seeded.v1",
  SONGS: "um.songs.v2",
  ROLES: "um.roles.v1",
  SETTINGS: "um.settings.v1",
  SERVICE_PLAN: "um.service_plan.v1",
};

export const ROUTING_TRACKS = [
  { key: "click", label: "Click", group: "Timing" },
  { key: "voiceGuide", label: "Voice Guide", group: "Timing" },
  { key: "pad", label: "Pad", group: "Instruments" },
  { key: "drums", label: "Drums", group: "Instruments" },
  { key: "bass", label: "Bass", group: "Instruments" },
  { key: "guitars", label: "Guitars", group: "Instruments" },
  { key: "keys", label: "Keys", group: "Instruments" },
  { key: "vocals", label: "Vocals", group: "Mix" },
  { key: "tracks", label: "Tracks", group: "Mix" },
];

export function getOutputOptions(interfaceChannels) {
  const opts = ["Main L/R", "Main L", "Main R"];
  if (interfaceChannels >= 4) opts.push("Out 3-4");
  if (interfaceChannels >= 6) opts.push("Out 5-6");
  if (interfaceChannels >= 8) opts.push("Out 7-8");
  opts.push("Mute");
  return opts;
}

export const OUTPUT_COLORS = {
  "Main L/R": "#818CF8", // indigo  — both channels together
  "Main L": "#38BDF8", // sky     — left channel only
  "Main R": "#FB923C", // orange  — right channel only
  "Out 3-4": "#34D399",
  "Out 5-6": "#FBBF24",
  "Out 7-8": "#F87171",
  Mute: "#4B5563",
  "Use Global": "#6B7280",
};

// Supported lyric / presentation software targets
export const LYRIC_SOFTWARE_OPTIONS = [
  {
    id: "propresenter7",
    name: "ProPresenter 7",
    protocol: "OSC",
    hint: "/presentation/slide/{index}",
  },
  {
    id: "propresenter6",
    name: "ProPresenter 6",
    protocol: "OSC",
    hint: "/presentation/{name}/go",
  },
  {
    id: "openlp",
    name: "OpenLP",
    protocol: "HTTP",
    hint: "/api/v2/controller/show",
  },
  {
    id: "easyworship",
    name: "EasyWorship",
    protocol: "MIDI",
    hint: "MIDI Program Change",
  },
  {
    id: "mediashout",
    name: "MediaShout",
    protocol: "MIDI",
    hint: "MIDI Program Change",
  },
  {
    id: "proclaim",
    name: "Proclaim",
    protocol: "MIDI",
    hint: "MIDI Program Change",
  },
  {
    id: "songshow",
    name: "SongShow Plus",
    protocol: "MIDI",
    hint: "MIDI Program Change",
  },
  {
    id: "videopsalm",
    name: "VideoPsalm",
    protocol: "MIDI",
    hint: "MIDI Program Change",
  },
  {
    id: "custom_osc",
    name: "Custom OSC",
    protocol: "OSC",
    hint: "Define your own OSC path",
  },
  {
    id: "custom_midi",
    name: "Custom MIDI",
    protocol: "MIDI",
    hint: "Any MIDI-controllable software",
  },
];

import { CINESTAGE_URL, WS_URL } from "../screens/config";

export const makeDefaultSettings = () => ({
  apiBase: CINESTAGE_URL,
  defaultUserId: "demo-user",
  audio: {
    clickEnabled: true,
    guideEnabled: true,
    clickVolume: 0.7,
    guideVolume: 0.6,
    countInBars: 1,
    outputMode: "device",
  },
  routing: {
    interfaceChannels: 2,
    global: {
      click: "Main L/R",
      voiceGuide: "Main L/R",
      pad: "Main L/R",
      drums: "Main L/R",
      bass: "Main L/R",
      guitars: "Main L/R",
      keys: "Main L/R",
      vocals: "Main L/R",
      tracks: "Main L/R",
    },
  },
  lighting: {
    enabled: false,
    protocol: "midi",
    target: "",
  },
  proPresenter: {
    enabled: false,
    software: "propresenter7",
    target: "",
    oscPath: "", // custom OSC path override (used when software = custom_osc)
    midiChannel: 1,
  },
  sync: {
    wsUrl: WS_URL,
    debug: false,
  },
  general: {
    language: "en",
    theme: "dark",
  },
});

export const makeEmptyServicePlan = () => ({
  id: "service_local",
  title: "This Week",
  locked: false,
  items: [],
  updatedAt: Date.now(),
});
