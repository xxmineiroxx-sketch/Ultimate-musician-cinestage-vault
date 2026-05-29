/**
 * Auto-Transpose Utilities - Ultimate Playback
 * Transpose chord charts, MIDI data, and musical content
 */

/**
 * Musical note representation
 */
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 * Common chord suffixes
 */
const CHORD_SUFFIXES = [
  "maj7",
  "min7",
  "m7",
  "maj",
  "min",
  "m",
  "7",
  "9",
  "11",
  "13",
  "sus2",
  "sus4",
  "sus",
  "add9",
  "add11",
  "dim",
  "aug",
  "+",
  "°",
  "6",
  "5",
  "2",
  "4",
];

/**
 * Calculate semitone shift between two keys
 * @param {string} fromKey - Original key (e.g., "G", "Eb")
 * @param {string} toKey - Target key
 * @returns {number} Semitone shift (-11 to +11)
 */
export const calculateSemitoneShift = (fromKey, toKey) => {
  if (!fromKey || !toKey) return 0;

  const normalizeKey = (key) => {
    // Handle flats
    if (key.includes("b")) {
      return FLATS.indexOf(key);
    }
    // Handle sharps
    return NOTES.indexOf(key.replace("♯", "#"));
  };

  const fromIndex = normalizeKey(fromKey);
  const toIndex = normalizeKey(toKey);

  if (fromIndex === -1 || toIndex === -1) return 0;

  // Calculate shift (prefer shortest path)
  let shift = toIndex - fromIndex;
  if (shift > 6) shift -= 12;
  if (shift < -6) shift += 12;

  return shift;
};

/**
 * Transpose a single note by semitones
 * @param {string} note - Note to transpose (e.g., "C", "D#", "Eb")
 * @param {number} semitones - Number of semitones to shift
 * @param {boolean} preferFlats - Prefer flat notation over sharps
 * @returns {string} Transposed note
 */
export const transposeNote = (note, semitones, preferFlats = false) => {
  if (!note || semitones === 0) return note;

  const noteArray = preferFlats ? FLATS : NOTES;

  // Normalize input note
  const normalizedNote = note.replace("♯", "#").replace("♭", "b");

  // Find note index
  let noteIndex = noteArray.indexOf(normalizedNote);

  // Try opposite notation if not found
  if (noteIndex === -1) {
    const altArray = preferFlats ? NOTES : FLATS;
    noteIndex = altArray.indexOf(normalizedNote);
    if (noteIndex !== -1) {
      // Convert to preferred notation
      const newIndex = (noteIndex + semitones + 12) % 12;
      return noteArray[newIndex];
    }
  }

  if (noteIndex === -1) return note;

  // Calculate new index
  const newIndex = (noteIndex + semitones + 12) % 12;
  return noteArray[newIndex];
};

/**
 * Parse a chord into root note and suffix
 * @param {string} chord - Chord to parse (e.g., "Cmaj7", "F#m", "Bb7")
 * @returns {Object} { root, suffix }
 */
export const parseChord = (chord) => {
  if (!chord || typeof chord !== "string") {
    return { root: "", suffix: "" };
  }

  // Try to match chord with suffix
  for (const suffix of CHORD_SUFFIXES) {
    // Check for sharp note with suffix
    if (chord.match(new RegExp(`^([A-G][#♯])${suffix}$`, "i"))) {
      return {
        root: chord.substring(0, 2),
        suffix: chord.substring(2),
      };
    }

    // Check for flat note with suffix
    if (chord.match(new RegExp(`^([A-G][b♭])${suffix}$`, "i"))) {
      return {
        root: chord.substring(0, 2),
        suffix: chord.substring(2),
      };
    }

    // Check for natural note with suffix
    if (chord.match(new RegExp(`^([A-G])${suffix}$`, "i"))) {
      return {
        root: chord.substring(0, 1),
        suffix: chord.substring(1),
      };
    }
  }

  // No suffix found, check for accidental
  if (
    chord.length >= 2 &&
    (chord[1] === "#" ||
      chord[1] === "♯" ||
      chord[1] === "b" ||
      chord[1] === "♭")
  ) {
    return {
      root: chord.substring(0, 2),
      suffix: chord.substring(2),
    };
  }

  // Just a natural note
  return {
    root: chord.substring(0, 1),
    suffix: chord.substring(1),
  };
};

/**
 * Transpose a chord
 * @param {string} chord - Chord to transpose (e.g., "Cmaj7", "F#m")
 * @param {number} semitones - Number of semitones to shift
 * @param {boolean} preferFlats - Prefer flat notation
 * @returns {string} Transposed chord
 */
export const transposeChord = (chord, semitones, preferFlats = false) => {
  if (!chord || semitones === 0) return chord;

  const { root, suffix } = parseChord(chord);

  if (!root) return chord;

  const transposedRoot = transposeNote(root, semitones, preferFlats);
  return transposedRoot + suffix;
};

/**
 * Transpose a chord chart
 * @param {string} chartText - Chord chart text
 * @param {number} semitones - Number of semitones to shift
 * @param {boolean} preferFlats - Prefer flat notation
 * @returns {string} Transposed chart
 */
export const transposeChordChart = (
  chartText,
  semitones,
  preferFlats = false,
) => {
  if (!chartText || semitones === 0) return chartText;

  // Regex to match chords (capital letter + optional accidental + optional suffix)
  const chordRegex =
    /\b([A-G][#b♯♭]?(?:maj7|min7|m7|maj|min|m|7|9|11|13|sus2|sus4|sus|add9|add11|dim|aug|\+|°|6|5|2|4)?)\b/g;

  return chartText.replace(chordRegex, (match) => {
    return transposeChord(match, semitones, preferFlats);
  });
};

/**
 * Detect key from chord chart
 * Uses first chord as likely key
 * @param {string} chartText - Chord chart text
 * @returns {string|null} Detected key
 */
export const detectKey = (chartText) => {
  if (!chartText) return null;

  const chordRegex =
    /\b([A-G][#b♯♭]?)(?:maj7|min7|m7|maj|min|m|7|9|11|13|sus2|sus4|sus|add9|add11|dim|aug|\+|°|6|5|2|4)?\b/;
  const match = chartText.match(chordRegex);

  if (match && match[1]) {
    return match[1];
  }

  return null;
};

/**
 * Auto-transpose song data when key changes
 * Updates chord charts, lyrics with chords, and MIDI data
 * @param {Object} song - Song object
 * @param {string} newKey - New target key
 * @returns {Object} Updated song object
 */
export const autoTransposeSong = (song, newKey) => {
  if (!song || !newKey) return song;

  const originalKey = song.original_key;
  if (!originalKey || originalKey === newKey) return song;

  const semitones = calculateSemitoneShift(originalKey, newKey);
  if (semitones === 0) return song;

  // Determine if we should prefer flats
  const preferFlats = newKey.includes("b") || newKey.includes("♭");

  const updatedSong = { ...song };

  // Update current key
  updatedSong.current_key = newKey;

  // Transpose chord chart if available
  if (song.chart?.chord_chart_text) {
    updatedSong.chart = {
      ...song.chart,
      chord_chart_text: transposeChordChart(
        song.chart.chord_chart_text,
        semitones,
        preferFlats,
      ),
    };
  }

  // Transpose lyrics with chords if available
  if (song.chart?.lyrics_text) {
    updatedSong.chart = {
      ...updatedSong.chart,
      lyrics_text: transposeChordChart(
        song.chart.lyrics_text,
        semitones,
        preferFlats,
      ),
    };
  }

  // Update musician notes with transposition info
  if (!updatedSong.musician_notes) {
    updatedSong.musician_notes = {};
  }

  updatedSong.musician_notes.transposition = {
    original_key: originalKey,
    current_key: newKey,
    semitones,
    last_transposed: new Date().toISOString(),
  };

  return updatedSong;
};

/**
 * Reset song to original key
 * @param {Object} song - Song object
 * @returns {Object} Song in original key
 */
export const resetToOriginalKey = (song) => {
  if (!song || !song.original_key) return song;

  return autoTransposeSong(song, song.original_key);
};

/**
 * Transpose MIDI note number
 * @param {number} midiNote - MIDI note number (0-127)
 * @param {number} semitones - Semitones to shift
 * @returns {number} Transposed MIDI note (clamped to 0-127)
 */
export const transposeMidiNote = (midiNote, semitones) => {
  const transposed = midiNote + semitones;
  return Math.max(0, Math.min(127, transposed));
};

/**
 * getCapoSuggestion(fromKey, toKey)
 *
 * Given a song's original key and a target guitar-friendly key,
 * suggests a capo position so the guitarist can use open chord shapes.
 *
 * Guitar-friendly keys (open shapes): E, A, D, G, C, Em, Am
 *
 * Returns: { capo: number, playKey: string, guitarKey: string }
 * Example: fromKey="Bb", toKey="C" → { capo: 3, playKey: "A", guitarKey: "C" }
 *
 * Logic:
 * 1. Calculate semitones from fromKey to toKey
 * 2. Try capo positions 0-7, for each: effectiveKey = transposeNote(playKey, -capo)
 *    Find the capo where effectiveKey matches toKey
 * 3. Return the smallest capo that works, preferring guitar-friendly playKeys
 */
const GUITAR_FRIENDLY_KEYS = ["E", "A", "D", "G", "C", "Em", "Am"];

export function getCapoSuggestion(fromKey, toKey) {
  if (!fromKey || !toKey) return { capo: 0, playKey: toKey || fromKey, guitarKey: toKey || fromKey };

  // If already the same key, no capo needed
  if (fromKey === toKey) return { capo: 0, playKey: toKey, guitarKey: toKey };

  // Try each guitar-friendly play key and capo 0-7
  // For a given playKey + capo, the sounding key = transposeNote(playKey, -capo)
  // We want: sounding key === toKey
  let bestResult = null;

  for (const playKey of GUITAR_FRIENDLY_KEYS) {
    // Strip minor suffix for transposition purposes
    const playRoot = playKey.replace(/m$/, "");
    for (let capo = 0; capo <= 7; capo++) {
      // The sounding (concert) key when playing playKey with capo at position `capo`
      const soundingKey = transposeNote(playRoot, -capo);
      // Normalize toKey for comparison (handle flats vs sharps)
      const toKeyRoot = toKey.replace(/m$/, "");
      const toKeyIdx = FLATS.indexOf(toKeyRoot) !== -1
        ? FLATS.indexOf(toKeyRoot)
        : NOTES.indexOf(toKeyRoot);
      const soundingIdx = FLATS.indexOf(soundingKey) !== -1
        ? FLATS.indexOf(soundingKey)
        : NOTES.indexOf(soundingKey);

      if (toKeyIdx !== -1 && soundingIdx !== -1 && toKeyIdx === soundingIdx) {
        if (!bestResult || capo < bestResult.capo) {
          bestResult = { capo, playKey, guitarKey: toKey };
        }
        break; // No need to try higher capo for this playKey
      }
    }
  }

  // Fallback: if no guitar-friendly match found, return direct transposition with capo 0
  if (!bestResult) {
    bestResult = { capo: 0, playKey: toKey, guitarKey: toKey };
  }

  return bestResult;
}

/**
 * formatCapoLabel(capoResult)
 * Returns a display string like "Capo 3 → play A shapes"
 * Returns "No capo needed" if capo === 0
 */
export function formatCapoLabel(capoResult) {
  if (!capoResult) return "No capo needed";
  const { capo, playKey } = capoResult;
  if (!capo || capo === 0) return "No capo needed";
  return `Capo ${capo} \u2192 play ${playKey} shapes`;
}

export default {
  calculateSemitoneShift,
  transposeNote,
  transposeChord,
  transposeChordChart,
  parseChord,
  detectKey,
  autoTransposeSong,
  resetToOriginalKey,
  transposeMidiNote,
  getCapoSuggestion,
  formatCapoLabel,
};
