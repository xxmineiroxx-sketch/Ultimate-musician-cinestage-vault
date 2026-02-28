import { makeDefaultSettings, makeEmptyServicePlan } from "./models";

// Instrument sheet starter templates (from Official SongPartSheet spec)
const keysTemplate = (key) =>
  `# Keys Part Sheet\nConcert Key: ${key}\nMain Patch / Rig: MainStage / Ableton\n\n## Verse 1\n- Patch: \n- Voicing/Register: \n- Riff/Run: \n- Cues: \n\n## Chorus\n- Patch: \n- Voicing/Register: \n- Riff/Run: \n- Cues: \n\n## Bridge\n- Patch: \n- Build: \n`;

const guitarTemplate = (key) =>
  `# Guitar Part Sheet\nConcert Key: ${key}  Capo: —  Tuning: Standard\n\n## Verse 1\n- Voicings: \n- Picking/Strum: \n- Riff/Lick: \n- Cues: \n\n## Chorus\n- Voicings: \n- Cues: \n\n## Bridge\n- Build: \n- Lead line / scale ref: \n`;

const bassTemplate = (key) =>
  `# Bass Part Sheet\nConcert Key: ${key}\n\n## Verse 1\n- Pattern: \n- Moves: \n- Cues: \n\n## Chorus\n- Pattern: \n- Cues: \n`;

const drumsTemplate = () =>
  `# Drums Part Sheet\nFeel: straight\n\n## Verse 1\n- Groove: \n- Fill idea: \n- Cues: \n\n## Chorus\n- Groove: \n- Build: \n- Cues: \n`;

export function demoSongs() {
  return [
    {
      id: "demo_1",
      title: "Gratitude",
      artist: "Brandon Lake",
      bpm: 72,
      originalKey: "A",
      timeSig: "4/4",
      feel: "Worship",
      cues: ["Intro", "Verse 1", "Chorus", "Verse 2", "Chorus", "Bridge", "Chorus", "Outro"].map(label => ({ label })),
      stems: ["Drums", "Bass", "Keys", "Gtrs", "Vox", "BVs", "Tracks", "Click", "Guide"],
      instrumentSheets: {
        "Keys": `# Keys — Gratitude\nMainStage: Warm Pad + Piano\n- Build on Bridge, drop pad on Chorus 2\n\n## Verse 1\n- Patch: Piano only\n- Voicing/Register: Low register\n- Riff/Run: Pentatonic run into chorus\n- Cues: Keep low register\n\n## Chorus\n- Patch: Piano + Pad\n- Cues: Add pad layer\n`,
        "Electric Guitar": guitarTemplate("A"),
        "Acoustic Guitar": guitarTemplate("A"),
        "Bass": bassTemplate("A"),
        "Drums": drumsTemplate(),
        "Vocal": `# Vocal — Gratitude\nKey: A  Feel: Worship\n\n## Verse 1\n- \n\n## Chorus\n- \n`,
        "Synth/Pad": `# Synth/Pad — Gratitude\n- Warm pad, swell in on verse, full on chorus\n`,
      },
    },
    {
      id: "demo_2",
      title: "Way Maker",
      artist: "Sinach",
      bpm: 84,
      originalKey: "E",
      timeSig: "4/4",
      feel: "Worship",
      cues: ["Intro", "Verse", "Chorus", "Tag", "Bridge", "Chorus", "Outro"].map(label => ({ label })),
      stems: ["Drums", "Bass", "Keys", "Gtrs", "Vox", "BVs", "Tracks", "Click", "Guide"],
      instrumentSheets: {
        "Keys": keysTemplate("E"),
        "Electric Guitar": guitarTemplate("E"),
        "Acoustic Guitar": guitarTemplate("E"),
        "Bass": bassTemplate("E"),
        "Drums": drumsTemplate(),
        "Vocal": `# Vocal — Way Maker\nKey: E\n\n`,
        "Synth/Pad": `# Synth/Pad — Way Maker\n`,
      },
    },
    {
      id: "demo_3",
      title: "Oceans (Where Feet May Fail)",
      artist: "Hillsong United",
      bpm: 65,
      originalKey: "D",
      timeSig: "4/4",
      feel: "Atmospheric",
      cues: ["Intro", "Verse", "Chorus", "Verse 2", "Chorus", "Bridge", "Chorus", "Outro"].map(label => ({ label })),
      stems: ["Drums", "Bass", "Keys", "Gtrs", "Vox", "BVs", "Pads", "Click", "Guide"],
      instrumentSheets: {
        "Keys": keysTemplate("D"),
        "Electric Guitar": guitarTemplate("D"),
        "Acoustic Guitar": guitarTemplate("D"),
        "Bass": bassTemplate("D"),
        "Drums": drumsTemplate(),
        "Vocal": `# Vocal — Oceans\nKey: D\n\n`,
        "Synth/Pad": `# Synth/Pad — Oceans\n- Atmospheric pads throughout\n`,
      },
    },
    {
      id: "demo_4",
      title: "House of the Lord",
      artist: "Phil Wickham",
      bpm: 82,
      originalKey: "A",
      timeSig: "4/4",
      feel: "Anthemic",
      cues: ["Intro", "Verse", "Chorus", "Verse 2", "Chorus", "Bridge", "Chorus", "Outro"].map(label => ({ label })),
      stems: ["Drums", "Bass", "Keys", "Gtrs", "Vox", "BVs", "Tracks", "Click", "Guide"],
      instrumentSheets: {
        "Keys": keysTemplate("A"),
        "Electric Guitar": guitarTemplate("A"),
        "Acoustic Guitar": guitarTemplate("A"),
        "Bass": bassTemplate("A"),
        "Drums": drumsTemplate(),
        "Vocal": `# Vocal — House of the Lord\nKey: A\n\n`,
        "Synth/Pad": `# Synth/Pad — House of the Lord\n`,
      },
    },
    {
      id: "demo_5",
      title: "Build My Life",
      artist: "Pat Barrett",
      bpm: 72,
      originalKey: "C",
      timeSig: "4/4",
      feel: "Worship",
      cues: ["Intro", "Verse", "Chorus", "Verse 2", "Chorus", "Bridge", "Chorus", "Outro"].map(label => ({ label })),
      stems: ["Drums", "Bass", "Keys", "Gtrs", "Vox", "BVs", "Pads", "Click", "Guide"],
      instrumentSheets: {
        "Keys": keysTemplate("C"),
        "Electric Guitar": guitarTemplate("C"),
        "Acoustic Guitar": guitarTemplate("C"),
        "Bass": bassTemplate("C"),
        "Drums": drumsTemplate(),
        "Vocal": `# Vocal — Build My Life\nKey: C\n\n`,
        "Synth/Pad": `# Synth/Pad — Build My Life\n`,
      },
    },
    {
      id: "demo_6",
      title: "Firm Foundation (He Won't)",
      artist: "Cody Carnes",
      bpm: 74,
      originalKey: "Bb",
      timeSig: "4/4",
      feel: "Worship",
      cues: ["Intro", "Verse", "Chorus", "Verse 2", "Chorus", "Bridge", "Chorus", "Outro"].map(label => ({ label })),
      stems: ["Drums", "Bass", "Keys", "Gtrs", "Vox", "BVs", "Tracks", "Click", "Guide"],
      instrumentSheets: {
        "Keys": keysTemplate("Bb"),
        "Electric Guitar": guitarTemplate("Bb"),
        "Acoustic Guitar": guitarTemplate("Bb"),
        "Bass": bassTemplate("Bb"),
        "Drums": drumsTemplate(),
        "Vocal": `# Vocal — Firm Foundation\nKey: Bb\n\n`,
        "Synth/Pad": `# Synth/Pad — Firm Foundation\n`,
      },
    },
  ];
}

export function demoRoles() {
  return [
    { id: "r1", name: "Drummer", role: "Drums" },
    { id: "r2", name: "Bassist", role: "Bass" },
    { id: "r3", name: "Keys", role: "Keys" },
    { id: "r4", name: "Guitar 1", role: "Guitar" },
    { id: "r5", name: "Guitar 2", role: "Guitar" },
    { id: "r6", name: "Lead Vocal", role: "Lead Vocal" },
    { id: "r7", name: "BGV 1", role: "BGV" },
    { id: "r8", name: "MD", role: "Music Director" },
    { id: "r9", name: "FOH", role: "Audio Engineer" },
    { id: "r10", name: "Lights", role: "Lighting" },
  ];
}

export function demoSettings() {
  return makeDefaultSettings();
}

export function demoServicePlan() {
  return makeEmptyServicePlan();
}
