export const ROLE_OPTIONS = [
  'Leader',
  'Music Director',
  'Vocal Lead',
  'Vocal BGV',
  'Drums',
  'Bass',
  'Electric Guitar',
  'Acoustic Guitar',
  'Keys',
  'Synth/Pad',
  'Tracks',
  'Sound',
  'Media',
];

export const INSTRUMENT_SHEETS = [
  'Vocal',
  'Drums',
  'Bass',
  'Electric Guitar',
  'Acoustic Guitar',
  'Keys',
  'Synth/Pad',
];

// Instruments that receive the chord chart when distributing
// (Drums and Vocal are excluded — Drums has its own groove notes; Vocal gets lyrics-only)
export const CHORD_CHART_INSTRUMENTS = ['Keys', 'Acoustic Guitar', 'Electric Guitar', 'Bass', 'Synth/Pad'];

// Classical voice parts used for vocal assignment & reference audio distribution
export const VOICE_PARTS = ['Soprano', 'Mezzo-Soprano', 'Alto', 'Tenor', 'Baritone', 'Bass'];

export const STEM_TYPES = ['vocals', 'drums', 'bass', 'keys', 'guitars', 'other'];

export const makeId = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;

export const StorageKeys = {
  SEEDED: 'um.seeded.v1',
  SONGS: 'um.songs.v2',
  ROLES: 'um.roles.v1',
  SETTINGS: 'um.settings.v1',
  SERVICE_PLAN: 'um.service_plan.v1',
};

export const ROUTING_TRACKS = [
  { key: 'click',      label: 'Click',       group: 'Timing' },
  { key: 'voiceGuide', label: 'Voice Guide', group: 'Timing' },
  { key: 'pad',        label: 'Pad',         group: 'Instruments' },
  { key: 'drums',      label: 'Drums',       group: 'Instruments' },
  { key: 'bass',       label: 'Bass',        group: 'Instruments' },
  { key: 'guitars',    label: 'Guitars',     group: 'Instruments' },
  { key: 'keys',       label: 'Keys',        group: 'Instruments' },
  { key: 'vocals',     label: 'Vocals',      group: 'Mix' },
  { key: 'tracks',     label: 'Tracks',      group: 'Mix' },
];

export function getOutputOptions(interfaceChannels) {
  const opts = ['Main L/R'];
  if (interfaceChannels >= 4) opts.push('Out 3-4');
  if (interfaceChannels >= 6) opts.push('Out 5-6');
  if (interfaceChannels >= 8) opts.push('Out 7-8');
  opts.push('Mute');
  return opts;
}

export const OUTPUT_COLORS = {
  'Main L/R': '#818CF8',
  'Out 3-4':  '#34D399',
  'Out 5-6':  '#FBBF24',
  'Out 7-8':  '#F87171',
  'Mute':     '#4B5563',
  'Use Global': '#6B7280',
};

// Supported lyric / presentation software targets
export const LYRIC_SOFTWARE_OPTIONS = [
  { id: 'propresenter7', name: 'ProPresenter 7', protocol: 'OSC',  hint: '/presentation/slide/{index}' },
  { id: 'propresenter6', name: 'ProPresenter 6', protocol: 'OSC',  hint: '/presentation/{name}/go' },
  { id: 'openlp',        name: 'OpenLP',         protocol: 'HTTP', hint: '/api/v2/controller/show' },
  { id: 'easyworship',   name: 'EasyWorship',    protocol: 'MIDI', hint: 'MIDI Program Change' },
  { id: 'mediashout',    name: 'MediaShout',     protocol: 'MIDI', hint: 'MIDI Program Change' },
  { id: 'proclaim',      name: 'Proclaim',       protocol: 'MIDI', hint: 'MIDI Program Change' },
  { id: 'songshow',      name: 'SongShow Plus',  protocol: 'MIDI', hint: 'MIDI Program Change' },
  { id: 'videopsalm',    name: 'VideoPsalm',     protocol: 'MIDI', hint: 'MIDI Program Change' },
  { id: 'custom_osc',    name: 'Custom OSC',     protocol: 'OSC',  hint: 'Define your own OSC path' },
  { id: 'custom_midi',   name: 'Custom MIDI',    protocol: 'MIDI', hint: 'Any MIDI-controllable software' },
];

export const makeDefaultSettings = () => ({
  audio: {
    clickEnabled: true,
    guideEnabled: true,
    clickVolume: 0.7,
    guideVolume: 0.6,
    countInBars: 1,
    outputMode: 'device',
  },
  routing: {
    interfaceChannels: 2,
    global: {
      click: 'Main L/R',
      voiceGuide: 'Main L/R',
      pad: 'Main L/R',
      drums: 'Main L/R',
      bass: 'Main L/R',
      guitars: 'Main L/R',
      keys: 'Main L/R',
      vocals: 'Main L/R',
      tracks: 'Main L/R',
    },
  },
  lighting: {
    enabled: false,
    protocol: 'midi',
    target: '',
  },
  proPresenter: {
    enabled: false,
    software: 'propresenter7',
    target: '',
    oscPath: '',   // custom OSC path override (used when software = custom_osc)
    midiChannel: 1,
  },
  sync: {
    wsUrl: 'ws://localhost:8000/ws',
    debug: false,
  },
  general: {
    language: 'en',
    theme: 'dark',
  },
});

export const makeEmptyServicePlan = () => ({
  id: 'service_local',
  title: 'This Week',
  locked: false,
  items: [],
  updatedAt: Date.now(),
});
