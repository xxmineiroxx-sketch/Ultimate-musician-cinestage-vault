/**
 * WaveformBar — role-aware song waveform for the Setlist / Runner screens.
 *
 * Sections are derived from real chord chart text ([Intro], [Refrão], etc.)
 * Waveform bar heights are derived from chord density per line segment.
 * Falls back to generic Intro/Verse/Chorus/Bridge/Outro only when no chart text exists.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import UltimateWaveform from './UltimateWaveform';

// ── Constants ─────────────────────────────────────────────────────────────────
const BAR_COUNT  = 60;
const BAR_MAX_H  = 38;

// ── Section color rules — English + Portuguese ────────────────────────────────
const SECTION_COLOR_RULES = [
  [/(intro|abertura|opening)/i,                                    '#6B7280'],
  [/(pre.?chorus|pre.?refr)/i,                                     '#8B5CF6'],
  [/(chorus|refr[aã]o)/i,                                          '#EC4899'],
  [/(verse|verso|parte|primeira|segunda|terceira|quarta|quinta)/i,  '#6366F1'],
  [/(bridge|ponte)/i,                                              '#F59E0B'],
  [/(outro|coda|final|ending)/i,                                   '#10B981'],
  [/(tag|vamp|hook|turnaround)/i,                                  '#F97316'],
  [/(instrumental|break|solo|channel)/i,                           '#0EA5E9'],
];

function getSectionColor(name = '') {
  for (const [re, color] of SECTION_COLOR_RULES) {
    if (re.test(name)) return color;
  }
  return '#6B7280';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDuration(dur) {
  if (!dur) return 3 * 60 * 1000;
  const parts = String(dur).split(':').map(Number);
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 3 * 60 * 1000;
}

function fmt(ms) {
  const t = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function toTitleCase(str) {
  return str.trim().replace(/\s+/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Parse [Section] headers from chord chart text.
 * Returns equal-proportion sections or null if fewer than 2 found.
 */
function parseSectionsFromText(text, durationMs) {
  if (!text || typeof text !== 'string') return null;
  const lines = text.split('\n');
  const found = [];
  lines.forEach((line, i) => {
    // Bracket format: [Section Name] — always accepted
    const bracket = line.trim().match(/^\[([^\]]+)\]$/);
    if (bracket) {
      found.push({ name: bracket[1].trim(), lineIndex: i });
      return;
    }
    // Bare section keyword line (English)
    const BARE_RE = /^(intro|verse|chorus|bridge|outro|pre[\s-]?chorus|vamp|tag|hook|refrain|coda|ending|repeat|instrumental|solo|break|interlude)/i;
    const trimmed = line.trim();
    if (trimmed && trimmed.length < 50 && BARE_RE.test(trimmed) && !/^\|/.test(trimmed)) {
      found.push({ name: trimmed, lineIndex: i });
    }
  });
  if (found.length < 2) return null;
  const total = lines.length || 1;
  return found.map((sec, idx) => ({
    label:    toTitleCase(sec.name),
    startPct: sec.lineIndex / total,
    endPct:   idx < found.length - 1 ? found[idx + 1].lineIndex / total : 1,
    startMs:  (sec.lineIndex / total) * durationMs,
  }));
}

/** Build waveform bar heights from chord density in text segments. */
const CHORD_RE = /\b[A-G][#b]?(m|maj|min|sus|aug|dim|add|M)?[0-9]*(\/[A-G][#b]?)?\b/g;

function buildBarsFromText(text, numBars, sections) {
  if (!text || typeof text !== 'string') {
    // No text: use section-energy shape
    return Array.from({ length: numBars }, (_, i) => {
      const pct = i / numBars;
      const sec = sections?.find(s => pct >= s.startPct && pct < s.endPct);
      const base = sec?.label?.match(/(chorus|refr[aã]o)/i) ? 0.7
                 : sec?.label?.match(/(bridge|ponte)/i)     ? 0.55
                 : sec?.label?.match(/(intro|outro|final)/i) ? 0.25
                 : 0.45;
      const noise = Math.abs(Math.sin(i * 6.7)) * 0.25;
      return Math.max(0.08, Math.min(1, base + noise));
    });
  }
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return Array(numBars).fill(0.35);
  return Array.from({ length: numBars }, (_, i) => {
    const startLine = Math.floor((i / numBars) * lines.length);
    const endLine   = Math.max(startLine + 1, Math.floor(((i + 1) / numBars) * lines.length));
    const segment   = lines.slice(startLine, endLine).join('\n');
    const chords    = (segment.match(CHORD_RE) || []).length;
    const textLen   = segment.replace(/\s/g, '').length;
    const density   = Math.min(1, chords * 0.18 + textLen * 0.007);
    const noise     = Math.abs(Math.sin(i * 6.7 + startLine * 1.3)) * 0.12;
    return Math.max(0.06, Math.min(1, density + noise));
  });
}

// ── Role tables ───────────────────────────────────────────────────────────────
const ROLE_COLORS = {
  worship_leader: '#F59E0B', lead_vocal: '#EC4899',
  bgv_1: '#C026D3', bgv_2: '#9333EA', bgv_3: '#7C3AED',
  keyboard: '#6366F1', piano: '#6366F1', synth: '#818CF8',
  electric_guitar: '#F97316', rhythm_guitar: '#FB923C', acoustic_guitar: '#EAB308',
  bass: '#10B981', drums: '#EF4444', percussion: '#DC2626',
  strings: '#A78BFA', brass: '#FBBF24',
  music_director: '#0EA5E9', foh_engineer: '#64748B',
  monitor_engineer: '#94A3B8', stream_engineer: '#38BDF8',
  lighting: '#FB923C', media_tech: '#A3E635',
};

const ROLE_EMOJIS = {
  worship_leader: '🎸', lead_vocal: '🎤',
  bgv_1: '🎤', bgv_2: '🎤', bgv_3: '🎤',
  keyboard: '🎹', piano: '🎹', synth: '🎛️',
  electric_guitar: '🎸', rhythm_guitar: '🎸', acoustic_guitar: '🎸',
  bass: '🎸', drums: '🥁', percussion: '🪘', strings: '🎻', brass: '🎺',
  music_director: '🎼', foh_engineer: '🎚️', monitor_engineer: '🎚️',
  stream_engineer: '📡', lighting: '💡', media_tech: '🖥️',
};

const ROLE_CONTENT_KEY = {
  worship_leader: 'guitar', lead_vocal: 'vocals',
  bgv_1: 'vocals', bgv_2: 'vocals', bgv_3: 'vocals',
  keyboard: 'keyboard', piano: 'keyboard', synth: 'keyboard',
  electric_guitar: 'guitar', rhythm_guitar: 'guitar', acoustic_guitar: 'guitar',
  bass: 'bass', drums: 'drums', percussion: 'drums',
  strings: 'keyboard', brass: 'keyboard', music_director: 'keyboard',
  foh_engineer: 'foh_engineer', monitor_engineer: 'monitor_engineer',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function WaveformBar({ song, userRole, onSeek, onSectionPress, positionMs, durationMs: durationMsProp }) {
  const [seekPct, setSeekPct] = useState(0);

  const durationMs = durationMsProp || parseDuration(song?.duration);

  React.useEffect(() => {
    if (durationMs > 0 && positionMs != null) {
      setSeekPct(Math.max(0, Math.min(1, positionMs / durationMs)));
    }
  }, [positionMs, durationMs]);

  const songText = song?.lyricsChordChart || song?.chordChart || song?.chordSheet || song?.lyrics || song?.content || '';

  // ── Sections: real timestamps → text parse → dummy fallback ──────────────
  const sections = useMemo(() => {
    // 1. Real structure with timestamps
    const raw = song?.structure;
    if (Array.isArray(raw) && raw.length > 0 && raw[0]?.start_ms != null) {
      const dur = durationMs || 1;
      return raw.map((s) => ({
        label:    toTitleCase(s.section || s.name || 'Section'),
        startPct: s.start_ms / dur,
        endPct:   s.end_ms   / dur,
        startMs:  s.start_ms,
      }));
    }
    // 2. Parse from chord chart / lyrics text
    const parsed = parseSectionsFromText(songText, durationMs);
    if (parsed) return parsed;
    // 3. Generic fallback
    return [
      { label: 'Intro',  startPct: 0.00, endPct: 0.08, startMs: 0 },
      { label: 'Verse',  startPct: 0.08, endPct: 0.29, startMs: durationMs * 0.08 },
      { label: 'Chorus', startPct: 0.29, endPct: 0.48, startMs: durationMs * 0.29 },
      { label: 'Verse',  startPct: 0.48, endPct: 0.65, startMs: durationMs * 0.48 },
      { label: 'Bridge', startPct: 0.65, endPct: 0.82, startMs: durationMs * 0.65 },
      { label: 'Outro',  startPct: 0.82, endPct: 1.00, startMs: durationMs * 0.82 },
    ];
  }, [song?.structure, songText, durationMs]);

  // ── Waveform bars from chord density ─────────────────────────────────────
  const bars = useMemo(() => buildBarsFromText(songText, BAR_COUNT, sections), [songText, sections]);

  // ── Role cue ──────────────────────────────────────────────────────────────
  const roleCue = useMemo(() => {
    if (!song?.role_content || !userRole) return null;
    const key = ROLE_CONTENT_KEY[userRole];
    if (!key) return null;
    const rc = song.role_content[key];
    if (!rc) return null;
    return rc.cues || rc.notes || rc.technique || null;
  }, [song?.role_content, userRole]);

  const roleColor = ROLE_COLORS[userRole] || '#4F46E5';
  const roleEmoji = ROLE_EMOJIS[userRole] || '🎵';

  return (
    <View style={styles.root}>

      {/* ── Section pills ─────────────────────────────────────────────────── */}
      <View style={styles.sectionsRow}>
        {sections.map((sec, i) => {
          const flex           = Math.max(0.02, sec.endPct - sec.startPct);
          const color          = getSectionColor(sec.label);
          const isActive       = seekPct >= sec.startPct && seekPct < sec.endPct;
          return (
            <TouchableOpacity
              key={i}
              style={[styles.pill, {
                flex,
                borderColor:     color,
                backgroundColor: isActive ? color : color + '22',
              }]}
              onPress={() => onSectionPress?.(sec.startMs, sec.label)}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color: isActive ? '#FFF' : color }]} numberOfLines={1}>
                {sec.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Waveform bars ─────────────────────────────────────────────────── */}
      <UltimateWaveform
        peaks={bars}
        duration={durationMs / 1000}
        currentTime={(seekPct * durationMs) / 1000}
        onSeek={(t) => {
          const pct = Math.max(0, Math.min(1, t / ((durationMs / 1000) || 1)));
          setSeekPct(pct);
          onSeek?.(Math.floor(pct * durationMs));
        }}
        sections={sections.map(s => ({
          label: s.label,
          positionSeconds: s.startPct * (durationMs / 1000),
          color: getSectionColor(s.label),
        }))}
        bpm={0}
        height={BAR_MAX_H + 4}
        accentColor="#6366F1"
        style={{ borderRadius: 6, overflow: 'hidden', backgroundColor: '#0F172A' }}
      />

      {/* ── Role cue ──────────────────────────────────────────────────────── */}
      {!!roleCue && (
        <View style={styles.cueRow}>
          <Text style={[styles.cueText, { color: roleColor }]} numberOfLines={2}>
            {roleEmoji}{'  '}{roleCue}
          </Text>
        </View>
      )}

      {/* ── Time ──────────────────────────────────────────────────────────── */}
      <View style={styles.timeRow}>
        <Text style={styles.timeLeft}>{fmt(seekPct * durationMs)}</Text>
        <Text style={styles.timeRight}>{song?.duration || fmt(durationMs)}</Text>
      </View>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    marginTop: 12,
    backgroundColor: '#060D1E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 10,
    overflow: 'hidden',
  },
  sectionsRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 8,
  },
  pill: {
    borderRadius: 4,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 4,
  },
  pillText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  waveArea: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_MAX_H + 4,
    position: 'relative',
    gap: 1,
  },
  barWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_MAX_H + 4,
  },
  bar: {
    width: '80%',
    borderRadius: 2,
  },
  cuePin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    width: 8,
    marginLeft: -4,
    zIndex: 10,
  },
  cuePinLine: {
    width: 1,
    flex: 1,
    opacity: 0.6,
  },
  cuePinDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: -2,
    opacity: 0.9,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
    opacity: 0.85,
    zIndex: 20,
  },
  cueRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cueText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  timeLeft:  { color: '#6B7280', fontSize: 10 },
  timeRight: { color: '#374151', fontSize: 10 },
});
