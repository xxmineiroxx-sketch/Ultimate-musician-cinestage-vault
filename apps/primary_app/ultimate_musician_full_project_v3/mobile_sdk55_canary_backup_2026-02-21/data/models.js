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

export const STEM_TYPES = ['vocals', 'drums', 'bass', 'keys', 'guitars', 'other'];

export const makeId = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
