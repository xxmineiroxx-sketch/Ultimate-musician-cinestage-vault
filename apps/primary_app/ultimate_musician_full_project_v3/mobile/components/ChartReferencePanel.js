/**
 * ChartReferencePanel
 * Role-aware reference panel shown below chord charts / lyrics.
 *
 * Guitar roles → CAGED positions + Capo calculator + Strumming patterns
 * Bass role    → Bass fingering reference (per chord root)
 * Other roles  → null (nothing rendered)
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// ── Static reference data ────────────────────────────────────────────────────

const CHROMATIC   = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_TO_SHARP = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' };
const OPEN_KEYS   = ['C','D','E','G','A'];

const CAGED_SHAPES = {
  C:   { C:0,  A:3,  G:5,  E:8,  D:10 },
  'C#':{ C:1,  A:4,  G:6,  E:9,  D:11 },
  D:   { C:2,  A:5,  G:7,  E:10, D:0  },
  'D#':{ C:3,  A:6,  G:8,  E:11, D:1  },
  E:   { C:4,  A:7,  G:9,  E:0,  D:2  },
  F:   { C:5,  A:8,  G:10, E:1,  D:3  },
  'F#':{ C:6,  A:9,  G:11, E:2,  D:4  },
  G:   { C:7,  A:10, G:0,  E:3,  D:5  },
  'G#':{ C:8,  A:11, G:1,  E:4,  D:6  },
  A:   { C:9,  A:0,  G:2,  E:5,  D:7  },
  'A#':{ C:10, A:1,  G:3,  E:6,  D:8  },
  B:   { C:11, A:2,  G:4,  E:7,  D:9  },
};

const BASS_FRETBOARD = {
  C:   [{ s:'A', f:3  }, { s:'D', f:10 }, { s:'G', f:5  }],
  'C#':[{ s:'A', f:4  }, { s:'D', f:11 }, { s:'G', f:6  }],
  D:   [{ s:'A', f:5  }, { s:'D', f:0  }, { s:'G', f:7  }],
  'D#':[{ s:'A', f:6  }, { s:'D', f:1  }, { s:'G', f:8  }],
  E:   [{ s:'E', f:0  }, { s:'A', f:7  }, { s:'D', f:2  }],
  F:   [{ s:'E', f:1  }, { s:'A', f:8  }, { s:'D', f:3  }],
  'F#':[{ s:'E', f:2  }, { s:'A', f:9  }, { s:'D', f:4  }],
  G:   [{ s:'E', f:3  }, { s:'A', f:10 }, { s:'D', f:5  }, { s:'G', f:0 }],
  'G#':[{ s:'E', f:4  }, { s:'A', f:11 }, { s:'D', f:6  }, { s:'G', f:1 }],
  A:   [{ s:'E', f:5  }, { s:'A', f:0  }, { s:'D', f:7  }],
  'A#':[{ s:'E', f:6  }, { s:'A', f:1  }, { s:'D', f:8  }, { s:'G', f:3 }],
  B:   [{ s:'E', f:7  }, { s:'A', f:2  }, { s:'D', f:9  }, { s:'G', f:4 }],
};

const STRUMMING = {
  '4/4': [
    { name: 'Basic',    pattern: '↓ – ↓↑ – ↑ – ↑↓', level: 'Beginner'     },
    { name: 'Folk',     pattern: '↓ ↓ ↑↑ ↓↑',       level: 'Intermediate' },
    { name: 'Calypso',  pattern: '↓ – ↑ ↓ – ↑ ↓↑',  level: 'Advanced'     },
  ],
  '3/4': [
    { name: 'Waltz',    pattern: '↓ ↓ ↑',            level: 'Beginner'     },
    { name: 'Flow',     pattern: '↓ – ↓ ↑ ↓ ↑',     level: 'Intermediate' },
  ],
  '6/8': [
    { name: 'Basic',    pattern: '↓ – – ↓ ↑ –',      level: 'Beginner'     },
    { name: 'Compound', pattern: '↓ – ↑ ↓ – ↑',      level: 'Intermediate' },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeRoot(str) {
  const s = (str || '').trim();
  if (!s) return 'C';
  const raw = s[0].toUpperCase() + (s[1] === '#' || s[1] === 'b' ? s[1] : '');
  return FLAT_TO_SHARP[raw] || raw;
}

function extractChordRoots(text) {
  if (!text) return [];
  const seen = new Set();
  const roots = [];
  const tokens = text.match(/[A-G][#b]?(?:m(?:aj)?|dim|aug|sus|add|\d)?/g) || [];
  for (const tok of tokens) {
    const root = normalizeRoot(tok);
    if (BASS_FRETBOARD[root] && !seen.has(root)) {
      seen.add(root);
      roots.push(root);
    }
  }
  return roots;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ChartReferencePanel({ role, songKey, timeSig, chordText }) {
  const rk = (role || '').toLowerCase().replace(/\s+/g, '_');
  const isGuitar   = ['electric_guitar','rhythm_guitar','acoustic_guitar','guitar'].some(g => rk === g || rk.includes(g));
  const isAcoustic = rk.includes('acoustic') || rk === 'rhythm_guitar';
  const isBass     = rk === 'bass';

  if (!isGuitar && !isBass) return null;

  const root = normalizeRoot(songKey);
  const ts   = (timeSig || '4/4').trim();

  // ── Guitar panel ──────────────────────────────────────────────────────────
  if (isGuitar) {
    const shapes = CAGED_SHAPES[root] || CAGED_SHAPES.C;
    const targetIdx = Math.max(0, CHROMATIC.indexOf(root));
    const capoOptions = OPEN_KEYS.map(ok => {
      const origIdx = CHROMATIC.indexOf(ok);
      const capo = ((targetIdx - origIdx) % 12 + 12) % 12;
      return capo <= 7 ? { openKey: ok, capo } : null;
    }).filter(Boolean);
    const strumPatterns = STRUMMING[ts] || STRUMMING['4/4'];

    return (
      <View style={st.panel}>
        <Text style={st.panelTitle}>🎸 Guitar Reference — Key of {songKey || 'C'}</Text>

        {/* CAGED */}
        <Text style={st.sectionLabel}>CAGED POSITIONS</Text>
        <View style={st.row}>
          {Object.entries(shapes).map(([shape, fret]) => (
            <View key={shape} style={st.cagedCard}>
              <Text style={st.cagedShape}>{shape}</Text>
              <Text style={st.cagedFret}>{fret === 0 ? 'open' : `fret ${fret}`}</Text>
            </View>
          ))}
        </View>
        <Text style={st.tip}>💡 Move between shapes for full-neck fluency.</Text>

        {/* Capo calculator */}
        <Text style={[st.sectionLabel, { marginTop: 14 }]}>CAPO CALCULATOR</Text>
        {capoOptions.map(({ openKey, capo }) => (
          <View key={openKey} style={st.capoRow}>
            <Text style={st.capoKey}>{openKey} shapes</Text>
            <Text style={st.capoFret}>{capo === 0 ? 'No capo' : `Capo ${capo}`}</Text>
            <Text style={st.capoSounds}>→ sounds like {root}</Text>
          </View>
        ))}

        {/* Strumming patterns — rhythm & acoustic */}
        {isAcoustic && (
          <>
            <Text style={[st.sectionLabel, { marginTop: 14 }]}>STRUMMING PATTERNS — {ts}</Text>
            {strumPatterns.map(p => (
              <View key={p.name} style={st.strumRow}>
                <Text style={st.strumName}>{p.name}</Text>
                <Text style={st.strumPattern}>{p.pattern}</Text>
                <Text style={st.strumLevel}>{p.level}</Text>
              </View>
            ))}
            <Text style={st.tip}>↓ = down strum  ↑ = up strum  – = rest</Text>
          </>
        )}
      </View>
    );
  }

  // ── Bass panel ────────────────────────────────────────────────────────────
  const roots = extractChordRoots(chordText);
  if (roots.length === 0) return null;

  return (
    <View style={st.panel}>
      <Text style={st.panelTitle}>🎸 Bass Fingering Reference</Text>
      <Text style={st.panelSub}>Standard tuning E · A · D · G — recommended + alternates</Text>
      <View style={st.row}>
        {roots.map(r => {
          const positions = BASS_FRETBOARD[r];
          if (!positions) return null;
          const rec = positions[0];
          return (
            <View key={r} style={st.bassCard}>
              <Text style={st.bassNote}>{r}</Text>
              <Text style={st.bassRec}>{rec.s} · {rec.f === 0 ? 'open' : `fret ${rec.f}`}</Text>
              {positions.slice(1).map((p, i) => (
                <Text key={i} style={st.bassAlt}>{p.s}·{p.f === 0 ? '0' : p.f}</Text>
              ))}
            </View>
          );
        })}
      </View>
      <Text style={st.tip}>💡 Stay frets 0–5 for fuller low-end tone.</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  panel: {
    marginTop: 20,
    padding: 14,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E3A5F',
  },
  panelTitle: { fontSize: 14, fontWeight: '700', color: '#60A5FA', marginBottom: 2 },
  panelSub:   { fontSize: 12, color: '#4B5563', marginBottom: 10 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: '#4B5563',
    letterSpacing: 1, marginBottom: 8,
  },
  tip: { fontSize: 11, color: '#374151', marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  // CAGED
  cagedCard: {
    backgroundColor: '#0F172A', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    alignItems: 'center', minWidth: 52,
    borderWidth: 1, borderColor: '#1F2937',
  },
  cagedShape: { fontSize: 18, fontWeight: '800', color: '#8B5CF6' },
  cagedFret:  { fontSize: 11, color: '#6B7280', marginTop: 2 },

  // Capo
  capoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#1F2937',
  },
  capoKey:    { width: 72, fontSize: 13, fontWeight: '700', color: '#60A5FA' },
  capoFret:   { width: 72, fontSize: 13, fontWeight: '600', color: '#E5E7EB' },
  capoSounds: { flex: 1, fontSize: 11, color: '#4B5563' },

  // Strumming
  strumRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  strumName:    { width: 64, fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  strumPattern: { flex: 1, fontSize: 14, color: '#E5E7EB', fontFamily: 'Courier', letterSpacing: 1 },
  strumLevel:   { fontSize: 10, color: '#4B5563' },

  // Bass
  bassCard: {
    backgroundColor: '#0F172A', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    minWidth: 64, borderWidth: 1, borderColor: '#1F2937',
  },
  bassNote: { fontSize: 20, fontWeight: '800', color: '#14B8A6' },
  bassRec:  { fontSize: 12, fontWeight: '600', color: '#E5E7EB', marginTop: 4 },
  bassAlt:  { fontSize: 10, color: '#4B5563', marginTop: 2 },
});
