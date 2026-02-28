export const SECTION_CC = 20;
export const SLIDE_CC = 21;

export const SectionValueMap = {
  INTRO: 1,
  VERSE: 2,
  CHORUS: 3,
  BRIDGE: 4,
  TURNAROUND: 5,
  TAG: 6,
  OUTRO: 7,
  VAMP: 100,
  HOLD: 100,
  END: 127,
  CLEAR: 127,
};

export function normalizeType(type) {
  return String(type || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

export function buildProPresenterMidi({ songIndex = 0, marker, midiConfig = {} }) {
  const typeKey = normalizeType(marker?.type);
  const sectionValue =
    SectionValueMap[typeKey] ??
    (typeKey.includes('VAMP') ? SectionValueMap.VAMP : null) ??
    (typeKey.includes('HOLD') ? SectionValueMap.HOLD : null) ??
    (typeKey.includes('END') ? SectionValueMap.END : null) ??
    (typeKey.includes('CLEAR') ? SectionValueMap.CLEAR : null) ??
    0;
  const channel = Number.isFinite(midiConfig.channel) ? midiConfig.channel : 0;
  const program = Number.isFinite(midiConfig.program) ? midiConfig.program : songIndex + 1;
  const ccSection = Number.isFinite(midiConfig.ccSection) ? midiConfig.ccSection : SECTION_CC;
  const ccSlide = Number.isFinite(midiConfig.ccSlide) ? midiConfig.ccSlide : SLIDE_CC;

  return {
    channel,
    program,
    ccSection: { cc: ccSection, value: sectionValue },
    ccSlide: marker?.lyricsCue != null ? { cc: ccSlide, value: Number(marker.lyricsCue) } : null,
  };
}
