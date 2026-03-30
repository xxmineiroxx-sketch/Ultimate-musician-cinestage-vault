/**
 * audioGuide.js
 * Maps section / cue labels → real audio file URLs served from Cloudflare R2
 * and plays them via expo-av.
 *
 * Files live in R2 bucket cinestage-stems under audio/ prefix,
 * served via https://ultimatelabs.pages.dev/sync/audio/*
 */

import { Audio } from "expo-av";

const BASE = "https://ultimatelabs.pages.dev/sync/audio";
const SECTIONS_BASE = `${BASE}/guides/Portugese%20Guides%20-%202018/Song%20Sections`;
const DYNAMIC_BASE = `${BASE}/guides/Portugese%20Guides%20-%202018/Dynamic%20Cues`;
const CONTAGEM_BASE = `${BASE}/guides/Contagem`;

// ── Section label → WAV filename (no extension, no prefix) ───────────────────
const SECTION_MAP = {
  intro: "Intro",
  verse: "Verse",
  "verse 1": "Verse 1",
  "verse 2": "Verse 2",
  "verse 3": "Verse 3",
  "verse 4": "Verse 4",
  "verse 5": "Verse 5",
  "verse 6": "Verse 6",
  chorus: "Chorus",
  "chorus 1": "Chorus 1",
  "chorus 2": "Chorus 2",
  "chorus 3": "Chorus 3",
  "chorus 4": "Chorus 4",
  "pre-chorus": "Pre Chorus",
  "pre chorus": "Pre Chorus",
  "pre-chorus 1": "Pre Chorus 1",
  "pre chorus 1": "Pre Chorus 1",
  "pre-chorus 2": "Pre Chorus 2",
  "pre chorus 2": "Pre Chorus 2",
  "pre-chorus 3": "Pre Chorus 3",
  "pre chorus 3": "Pre Chorus 3",
  "pre-chorus 4": "Pre Chorus 4",
  "pre chorus 4": "Pre Chorus 4",
  "post chorus": "Post Chorus",
  "post-chorus": "Post Chorus",
  bridge: "Bridge",
  "bridge 1": "Bridge 1",
  "bridge 2": "Bridge 2",
  "bridge 3": "Bridge 3",
  "bridge 4": "Bridge 4",
  breakdown: "Breakdown",
  outro: "Outro",
  tag: "Tag",
  vamp: "Vamp",
  turnaround: "Turnaround",
  interlude: "Interlude",
  instrumental: "Instrumental",
  solo: "Solo",
  ending: "Ending",
  acapella: "Acapella",
  "a cappella": "Acapella",
  rap: "Rap",
  refrain: "Refrain",
  exhortation: "Exhortation",
};

// ── Dynamic cue label → WAV filename ─────────────────────────────────────────
const DYNAMIC_MAP = {
  "all in": "All In",
  bass: "Bass",
  "big ending": "Big Ending",
  break: "Break",
  build: "Build",
  channel: "Channel",
  click: "Click",
  "drums in": "Drums In",
  drums: "Drums",
  guitar: "Guitar",
  hits: "Hits",
  hold: "Hold",
  "key change up": "Key Change Up",
  "key change down": "Key Change Down",
  keys: "Keys",
  "last time": "Last Time",
  pad: "Pad",
  "slowly build": "Slowly Build",
  softly: "Softly",
  swell: "Swell",
};

// URL-encode a file name component (handles spaces and #)
function enc(name) {
  return encodeURIComponent(name);
}

/**
 * Resolve a section/cue label to its audio file URL.
 * Returns null if no match.
 */
export function resolveGuideUrl(label) {
  const key = (label || "").toLowerCase().trim();

  const sec = SECTION_MAP[key];
  if (sec) return `${SECTIONS_BASE}/Portugese%20-%20${enc(sec)}.wav`;

  const dyn = DYNAMIC_MAP[key];
  if (dyn) return `${DYNAMIC_BASE}/Portugese%20-%20${enc(dyn)}.wav`;

  return null;
}

/**
 * Count-in beat URL  (1–6, PT or EN)
 */
export function resolveCountUrl(beat, lang = "PT") {
  return `${CONTAGEM_BASE}/${beat}%20${lang}.mp3`;
}

/**
 * Pad URL for a given note and kit volume (1 | 2 | 3)
 */
export function resolvePadUrl(note, vol = 2) {
  const n = (note || "C").replace("#", "%23");
  if (vol === 1)
    return `${BASE}/pads/MONTION%20PADS%20-%20ABEL%20MENDONZA/Motion%20Pads%20Vol%201/${n}-PAD.mp3`;
  if (vol === 3)
    return `${BASE}/pads/Motion%20Pads%20Vol%203%20MP3/${n}%20Pad.mp3`;
  return `${BASE}/pads/Motion%20Pads%20Vol%202%20MP3/${n}%20Pad.mp3`;
}

// ── Playback ─────────────────────────────────────────────────────────────────
let _guideSound = null;

/** Play a single guide audio file (non-looping). Stops any previous. */
export async function playGuideFile(url, volume = 0.85) {
  if (!url) return;
  try {
    if (_guideSound) {
      await _guideSound.stopAsync().catch(() => {});
      await _guideSound.unloadAsync().catch(() => {});
      _guideSound = null;
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { volume, shouldPlay: true },
    );
    _guideSound = sound;
    sound.setOnPlaybackStatusUpdate((s) => {
      if (s.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (_guideSound === sound) _guideSound = null;
      }
    });
  } catch (e) {
    console.warn("[AudioGuide]", url, e?.message);
  }
}

export async function stopGuide() {
  if (_guideSound) {
    await _guideSound.stopAsync().catch(() => {});
    await _guideSound.unloadAsync().catch(() => {});
    _guideSound = null;
  }
}
