/**
 * Chord chart transposition and parsing utilities.
 * Used by servicePlanStore and SongPlanDetailScreen.
 */

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Keys whose accidentals are spelled as flats
const FLAT_KEY_ROOTS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']);

function noteIndex(note) {
  const si = SHARPS.indexOf(note);
  return si >= 0 ? si : FLATS.indexOf(note);
}

function indexToNote(idx, useFlats) {
  const n = ((idx % 12) + 12) % 12;
  return useFlats ? FLATS[n] : SHARPS[n];
}

function semitonesBetween(fromKey, toKey) {
  const f = noteIndex(fromKey.trim());
  const t = noteIndex(toKey.trim());
  if (f < 0 || t < 0) return 0;
  return ((t - f) % 12 + 12) % 12;
}

function useFlatsForKey(key) {
  const root = key.replace(/m$/, '').trim();
  return FLAT_KEY_ROOTS.has(root);
}

/**
 * Transposes a single chord token, preserving all modifiers.
 * e.g. "Am7" → "Em7"  |  "G/B" → "D/F#"  |  "Fsus4" → "Csus4"
 */
function transposeChordToken(chord, semitones, useFlats) {
  if (semitones === 0) return chord;
  const m = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return chord;
  const [, root, rest] = m;
  // Slash chord: rest ends with /Note
  const slashM = rest.match(/^(.*?)\/([A-G][#b]?)$/);
  if (slashM) {
    const [, mod, bass] = slashM;
    return (
      indexToNote(noteIndex(root) + semitones, useFlats) +
      mod + '/' +
      indexToNote(noteIndex(bass) + semitones, useFlats)
    );
  }
  return indexToNote(noteIndex(root) + semitones, useFlats) + rest;
}

// Matches a chord token (anchored, for token-level checks)
const CHORD_TOKEN_PAT = /^[A-G][#b]?(m|M|maj|min|dim|aug|sus|add|dom)?[0-9]?(\/[A-G][#b]?)?$/;

// Matches chord tokens anywhere in a string (for substitution in chord lines)
const CHORD_IN_LINE_PAT = /[A-G][#b]?(m|M|maj|min|dim|aug|sus|add|dom)?[0-9]?(\/[A-G][#b]?)?/g;

/**
 * Returns true if the line contains only chord symbols (and spacing/bars).
 * e.g. "   Am   G   F   " or "| C | C | Am | G |"
 */
export function isChordLine(line) {
  const t = line.trim();
  if (!t) return false;
  // Vamp lines: multiple | separators
  if (t.split('|').length > 2) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const n = tokens.filter((tok) => CHORD_TOKEN_PAT.test(tok)).length;
  return n > 0 && n / tokens.length > 0.5;
}

/**
 * Strips chord lines from a chart to produce a vocals-only / lyrics-only version.
 */
export function stripChordsForVocals(chart) {
  if (!chart) return '';
  return chart
    .split('\n')
    .filter((line) => !isChordLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Transposes every chord line in a full chord chart from one key to another.
 * Lyric lines, section labels, and blank lines are left untouched.
 *
 * @param {string} chart   - The full chord chart text.
 * @param {string} fromKey - Original key (e.g. "C").
 * @param {string} toKey   - Target key (e.g. "G").
 * @returns {string} Transposed chart.
 */
export function transposeChordChart(chart, fromKey, toKey) {
  if (!chart) return '';
  if (!fromKey || !toKey || fromKey.trim() === toKey.trim()) return chart;
  const semitones = semitonesBetween(fromKey, toKey);
  if (semitones === 0) return chart;
  const flats = useFlatsForKey(toKey.trim());
  return chart
    .split('\n')
    .map((line) => {
      if (!isChordLine(line)) return line;
      return line.replace(CHORD_IN_LINE_PAT, (tok) => transposeChordToken(tok, semitones, flats));
    })
    .join('\n');
}
