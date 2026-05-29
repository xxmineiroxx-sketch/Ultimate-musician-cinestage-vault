import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';
import { store } from '../services/store';
import { useAuth } from '../App';

// ── Chromatic transposition ──────────────────────────────────────────────────
const CHROMATIC_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const CHROMATIC_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_KEY_SET    = new Set(['F','Bb','Eb','Ab','Db','Gb']);
const ENHARMONIC      = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' };

function normalizeRoot(root) {
  return ENHARMONIC[root] || root;
}

function shiftKey(baseKey, semitones) {
  if (!baseKey || semitones === 0) return baseKey || '';
  const useFlats = FLAT_KEY_SET.has(baseKey.replace(/m$/, '').trim());
  const arr = useFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP;
  let idx = arr.indexOf(baseKey);
  if (idx === -1) {
    const alt = useFlats ? CHROMATIC_SHARP : CHROMATIC_FLAT;
    idx = alt.indexOf(baseKey);
    if (idx === -1) return baseKey;
  }
  return arr[((idx + semitones) % 12 + 12) % 12];
}

// Token-level chord transposition (matches mobile approach)
const CHORD_IN_LINE_RE = /\b([A-G][b#]?(?:maj|min|m|M|dim|aug|sus[24]?|add|dom|no)?[0-9]*(?:\/[A-G][b#]?)?)\b/g;
const CHORD_TOKEN_RE   = /^[A-G][#b]?(m|M|maj|min|dim|aug|sus[24]?|add|dom|no)?[0-9]?(\/[A-G][#b]?)?$/;

function transposeChord(chord, semitones, useFlats) {
  const rootMatch = chord.match(/^([A-G][b#]?)(.*)/);
  if (!rootMatch) return chord;
  const [, root, rest] = rootMatch;
  const normalized = normalizeRoot(root);
  const baseArr = useFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP;
  const altArr  = useFlats ? CHROMATIC_SHARP : CHROMATIC_FLAT;
  let idx = baseArr.indexOf(normalized);
  if (idx === -1) idx = altArr.indexOf(normalized);
  if (idx === -1) return chord;

  const slashM = rest.match(/^(.*?)\/([A-G][b#]?)$/);
  if (slashM) {
    const [, mod, bass] = slashM;
    const normBass = normalizeRoot(bass);
    let bassIdx = baseArr.indexOf(normBass);
    if (bassIdx === -1) bassIdx = altArr.indexOf(normBass);
    const newBass = bassIdx === -1 ? bass : baseArr[((bassIdx + semitones) % 12 + 12) % 12];
    return baseArr[((idx + semitones) % 12 + 12) % 12] + mod + '/' + newBass;
  }
  return baseArr[((idx + semitones) % 12 + 12) % 12] + rest;
}

function transposeLine(line, semitones, useFlats) {
  if (semitones === 0) return line;
  return line.replace(CHORD_IN_LINE_RE, (match) => transposeChord(match, semitones, useFlats));
}

// ── Line classification ───────────────────────────────────────────────────────
function isChordLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (t.split('|').length > 2) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  const n = tokens.filter(tok => CHORD_TOKEN_RE.test(tok)).length;
  return n > 0 && n / tokens.length > 0.5;
}

// ── Rig tag helpers (keyboard preset markers e.g. @[Nord], @[MODX]) ──────────
const RIG_COLORS = {
  Nord: '#EF4444', MODX: '#3B82F6', VS: '#10B981',
  Vintage: '#F59E0B', Synth: '#8B5CF6', Pad: '#EC4899',
};

function renderRigLine(line, fs, ls) {
  const parts = line.split(/(@\[[^\]]+\])/g);
  return (
    <p className="font-mono whitespace-pre-wrap" style={{ fontSize: `${fs}px`, lineHeight: ls }}>
      {parts.map((part, i) => {
        const m = part.match(/^@\[([^\]]+)\]$/);
        if (m) {
          const color = RIG_COLORS[m[1]] || '#A78BFA';
          return <span key={i} style={{ color, fontWeight: 700 }}>{m[1]}</span>;
        }
        return <span key={i} className="text-slate-300">{part}</span>;
      })}
    </p>
  );
}

function classifyLine(line) {
  const t = line.trim();
  if (!t) return 'empty';
  if (t.startsWith('[') && t.endsWith(']')) return 'section';
  if (/^(intro|verse|pre-?chorus|chorus|bridge|outro|solo|final|tag|vamp|turnaround|instrumental)\s*[\d:.]*\s*:?$/i.test(t)) return 'section';
  if (/@\[/.test(t)) return 'rig';
  if (isChordLine(t)) return 'chord';
  return 'lyric';
}

// ── Lyrics parser ─────────────────────────────────────────────────────────────
function parseLyrics(raw) {
  if (!raw) return [];
  const lines = raw.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^\[(.+?)\]$/);
    if (m) {
      if (current) sections.push(current);
      current = { label: m[1], lines: [] };
    } else {
      if (!current) current = { label: '', lines: [] };
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections.filter(s => s.label || s.lines.some(l => l.trim()));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LyricsViewScreen() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { profile } = useAuth() || {};

  // Song state
  const [song, setSong]       = useState(location.state?.song || null);
  const [library, setLibrary] = useState([]);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(false);
  const [libLoading, setLibLoading] = useState(true);
  const [error, setError]     = useState('');

  // Display controls
  const [fontSize, setFontSize]         = useState(18);         // 12–48 px
  const [lineSpacing, setLineSpacing]   = useState(1.8);        // line-height multiplier
  const [transpose, setTranspose]       = useState(0);
  const [autoScroll, setAutoScroll]     = useState(false);
  const [scrollSpeed, setScrollSpeed]   = useState(1);          // px per tick multiplier
  // Display mode: 'lyrics' | 'chords-lyrics' | 'chords'
  const [displayMode, setDisplayMode]   = useState('lyrics');

  const scrollRef    = useRef(null);
  const autoScrollRef = useRef(null);

  // ── Load library ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLibLoading(true);
      try {
        let songs = await store.getSongs();
        if (!songs || (Array.isArray(songs) && songs.length === 0)) {
          const res = await fetch(`${SYNC_URL}/sync/library-pull`, { headers: syncHeaders() });
          if (res.ok) {
            const data = await res.json();
            songs = Array.isArray(data) ? data : (data.songs || data.library || []);
            await store.setSongs(songs);
          }
        }
        setLibrary(Array.isArray(songs) ? songs : []);
      } catch (_) {
        // non-fatal
      } finally {
        setLibLoading(false);
      }
    })();
  }, []);

  // ── Fetch lyrics if missing ──────────────────────────────────────────────
  useEffect(() => {
    if (!song) return;
    const hasLyrics = song.lyrics || song.lyricsText || song.lyricsRaw;
    if (hasLyrics) return;
    const songId = song.id || song.songId;
    if (!songId) return;

    setLoading(true);
    setError('');
    fetch(`${SYNC_URL}/sync/lyrics?songId=${encodeURIComponent(songId)}`, { headers: syncHeaders() })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => setSong(prev => ({ ...prev, ...data })))
      .catch(() => setError('Could not load lyrics for this song.'))
      .finally(() => setLoading(false));
  }, [song?.id, song?.songId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll) {
      autoScrollRef.current = setInterval(() => {
        const el = scrollRef.current;
        if (el) {
          el.scrollTop += scrollSpeed;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
            setAutoScroll(false);
          }
        }
      }, 40);
    } else {
      clearInterval(autoScrollRef.current);
    }
    return () => clearInterval(autoScrollRef.current);
  }, [autoScroll, scrollSpeed]);

  const handleSelectSong = useCallback((s) => {
    setSong(s);
    setTranspose(0);
    setAutoScroll(false);
    setError('');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const rawLyrics  = song?.lyrics || song?.lyricsText || song?.lyricsRaw || '';
  const rawChords  = song?.chordChart || song?.chords || '';
  const originalKey = (song?.key || song?.songKey || '').trim();
  const displayKey  = originalKey ? shiftKey(originalKey, transpose) : '';
  const useFlats    = FLAT_KEY_SET.has((displayKey || originalKey).replace(/m$/, '').trim());

  const sections = useMemo(() => parseLyrics(rawLyrics), [rawLyrics]);
  const chordSections = useMemo(() => parseLyrics(rawChords), [rawChords]);

  // Apply transposition to section lines
  const transposedSections = useMemo(() => sections.map(sec => ({
    ...sec,
    lines: sec.lines.map(line => transposeLine(line, transpose, useFlats)),
  })), [sections, transpose, useFlats]);

  const transposedChordSections = useMemo(() => chordSections.map(sec => ({
    ...sec,
    lines: sec.lines.map(line => transposeLine(line, transpose, useFlats)),
  })), [chordSections, transpose, useFlats]);

  // Filtered library for sidebar search
  const filteredLibrary = useMemo(() => {
    if (!search.trim()) return library;
    const q = search.toLowerCase();
    return library.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.artist || s.artistName || '').toLowerCase().includes(q)
    );
  }, [library, search]);

  // ── Render a section's lines according to display mode ────────────────────
  const renderSectionLines = (sec, isChordSec = false) => {
    return sec.lines.map((line, li) => {
      const type = isChordSec ? (isChordLine(line) ? 'chord' : 'lyric') : classifyLine(line);

      if (type === 'empty') {
        return <div key={li} style={{ height: `${Math.round(fontSize * 0.5)}px` }} />;
      }

      if (type === 'chord') {
        if (displayMode === 'lyrics') return null; // hide chords in lyrics-only mode
        return (
          <p
            key={li}
            className="font-mono text-indigo-300 whitespace-pre-wrap print:text-gray-600"
            style={{ fontSize: `${fontSize}px`, lineHeight: lineSpacing }}
          >
            {line || '\u00A0'}
          </p>
        );
      }

      if (type === 'rig') {
        return <div key={li}>{renderRigLine(line, fontSize, lineSpacing)}</div>;
      }

      if (type === 'lyric') {
        if (displayMode === 'chords') return null; // hide lyrics in chords-only mode
        return (
          <p
            key={li}
            className="font-mono text-slate-200 whitespace-pre-wrap print:text-black"
            style={{ fontSize: `${fontSize}px`, lineHeight: lineSpacing }}
          >
            {line || '\u00A0'}
          </p>
        );
      }

      return null;
    });
  };

  // ── Print ────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ── Display mode labels ──────────────────────────────────────────────────
  const DISPLAY_MODES = [
    { id: 'lyrics',        label: 'Lyrics' },
    { id: 'chords-lyrics', label: 'Chords + Lyrics' },
    { id: 'chords',        label: 'Chords Only' },
  ];

  return (
    <div className="h-full flex bg-[#020617] overflow-hidden print:bg-white">

      {/* ── Left sidebar — song selector ──────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 bg-[#0a1020] border-r border-[#1e293b] flex flex-col print:hidden">
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-[#1e293b] flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => navigate(-1)}
              className="text-slate-400 hover:text-white transition"
              title="Back"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-white font-semibold text-sm">Songs</h2>
          </div>
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search songs…"
              className="w-full bg-slate-800 border border-[#1e293b] text-white text-xs rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
            />
          </div>
        </div>

        {/* Song list */}
        <div className="flex-1 overflow-y-auto">
          {libLoading && (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          )}
          {!libLoading && filteredLibrary.length === 0 && (
            <p className="text-slate-500 text-xs text-center py-8 px-4">
              {search ? 'No songs match your search.' : 'No songs in library.'}
            </p>
          )}
          {filteredLibrary.map(s => {
            const id = s.id || s.songId;
            const currentId = song?.id || song?.songId;
            const isActive = String(id) === String(currentId);
            return (
              <button
                key={id}
                onClick={() => handleSelectSong(s)}
                className={`w-full text-left px-4 py-3 border-b border-[#1e293b]/40 transition ${
                  isActive
                    ? 'bg-indigo-900/30 border-l-2 border-l-indigo-500'
                    : 'hover:bg-slate-800/50 border-l-2 border-l-transparent'
                }`}
              >
                <p className={`text-sm font-medium truncate ${isActive ? 'text-indigo-300' : 'text-slate-200'}`}>
                  {s.title || 'Untitled'}
                </p>
                {(s.artist || s.artistName) && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">{s.artist || s.artistName}</p>
                )}
                {(s.key || s.songKey) && (
                  <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-indigo-900/40 text-indigo-400 border border-indigo-800/40">
                    {s.key || s.songKey}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right content area ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top control bar */}
        <div className="flex-shrink-0 bg-[#0f172a] border-b border-[#1e293b] px-6 py-3 print:hidden">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Song title + artist */}
            <div className="min-w-0">
              <h1 className="text-white font-bold text-lg leading-tight truncate">
                {song?.title || 'Lyrics Viewer'}
              </h1>
              {song?.artist && (
                <p className="text-slate-400 text-xs mt-0.5 truncate">{song.artist}</p>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap">

              {/* Display mode toggle */}
              <div className="flex items-center bg-slate-800 border border-[#1e293b] rounded-lg overflow-hidden">
                {DISPLAY_MODES.map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setDisplayMode(mode.id)}
                    className={`px-2.5 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                      displayMode === mode.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* Font size */}
              <div className="flex items-center bg-slate-800 border border-[#1e293b] rounded-lg overflow-hidden">
                <button
                  onClick={() => setFontSize(f => Math.max(12, f - 2))}
                  className="px-2.5 py-2 text-slate-400 hover:text-white hover:bg-slate-700 transition text-sm font-mono"
                  title="Decrease font size"
                >A−</button>
                <span className="px-2 text-slate-300 text-xs font-mono tabular-nums">{fontSize}px</span>
                <button
                  onClick={() => setFontSize(f => Math.min(48, f + 2))}
                  className="px-2.5 py-2 text-slate-400 hover:text-white hover:bg-slate-700 transition text-sm font-mono"
                  title="Increase font size"
                >A+</button>
              </div>

              {/* Line spacing slider */}
              <div className="flex items-center gap-2 bg-slate-800 border border-[#1e293b] rounded-lg px-3 py-1.5">
                <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <input
                  type="range"
                  min={1.2}
                  max={3.0}
                  step={0.1}
                  value={lineSpacing}
                  onChange={e => setLineSpacing(parseFloat(e.target.value))}
                  className="w-20 accent-indigo-500 h-1"
                  title={`Line spacing: ${lineSpacing.toFixed(1)}`}
                />
                <span className="text-slate-400 text-xs tabular-nums">{lineSpacing.toFixed(1)}</span>
              </div>

              {/* Transpose */}
              {originalKey && (
                <div className="flex items-center gap-1 bg-slate-800 border border-[#1e293b] rounded-lg overflow-hidden">
                  <button
                    onClick={() => setTranspose(t => t - 1)}
                    className="px-2.5 py-2 text-slate-400 hover:text-white hover:bg-slate-700 transition text-sm"
                    title="Transpose down"
                  >−</button>
                  <div className="flex items-center gap-1 px-2">
                    <span className="text-slate-500 text-xs">Key</span>
                    <span className="text-white text-xs font-semibold min-w-[48px] text-center">
                      {displayKey || (transpose === 0 ? 'orig' : `${transpose > 0 ? '+' : ''}${transpose}`)}
                    </span>
                  </div>
                  <button
                    onClick={() => setTranspose(t => t + 1)}
                    className="px-2.5 py-2 text-slate-400 hover:text-white hover:bg-slate-700 transition text-sm"
                    title="Transpose up"
                  >+</button>
                  {transpose !== 0 && (
                    <button
                      onClick={() => setTranspose(0)}
                      className="px-2 py-2 text-indigo-400 hover:text-indigo-300 transition text-xs"
                      title="Reset to original key"
                    >↺</button>
                  )}
                </div>
              )}

              {/* Auto-scroll */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setAutoScroll(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    autoScroll
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 border border-[#1e293b] text-slate-300 hover:text-white'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  {autoScroll ? 'Scrolling' : 'Auto-scroll'}
                </button>
                {autoScroll && (
                  <input
                    type="range"
                    min={0.5}
                    max={4}
                    step={0.5}
                    value={scrollSpeed}
                    onChange={e => setScrollSpeed(parseFloat(e.target.value))}
                    className="w-16 accent-indigo-500 h-1"
                    title={`Scroll speed: ${scrollSpeed}×`}
                  />
                )}
              </div>

              {/* Print */}
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-[#1e293b] text-slate-300 hover:text-white text-xs font-semibold transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print
              </button>
            </div>
          </div>
        </div>

        {/* Lyrics content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-8 py-6 scroll-smooth"
        >
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20 gap-3">
              <Spinner />
              <span className="text-slate-400 text-sm">Loading lyrics…</span>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {/* No song */}
          {!song && !loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-slate-300 font-medium">No song selected</p>
                <p className="text-slate-500 text-sm mt-1">Choose a song from the list on the left.</p>
              </div>
            </div>
          )}

          {/* Song content */}
          {song && !loading && (
            <div className="max-w-3xl mx-auto">
              {/* Song header (visible in print too) */}
              <div className="mb-8 print:mb-6">
                <h1 className="text-white print:text-black text-3xl font-bold">{song.title}</h1>
                {song.artist && (
                  <p className="text-slate-400 print:text-gray-600 text-base mt-1">{song.artist}</p>
                )}
                <div className="flex flex-wrap gap-4 mt-3">
                  {displayKey && (
                    <p className="text-indigo-400 print:text-gray-700 text-sm font-semibold">
                      Key: {displayKey}
                      {transpose !== 0 && (
                        <span className="ml-2 text-slate-500 text-xs font-normal">
                          (transposed {transpose > 0 ? '+' : ''}{transpose})
                        </span>
                      )}
                    </p>
                  )}
                  {(song.tempo || song.bpm) && (
                    <p className="text-slate-400 print:text-gray-600 text-sm">
                      {song.tempo || song.bpm} BPM
                    </p>
                  )}
                </div>
              </div>

              {/* Lyrics sections */}
              {transposedSections.length > 0 ? (
                <div className="space-y-8">
                  {transposedSections.map((section, si) => (
                    <div key={si}>
                      {section.label && (
                        <div className="mb-3">
                          <span className="text-indigo-400 print:text-gray-600 text-xs font-semibold uppercase tracking-[0.15em] border border-indigo-500/40 print:border-gray-400 rounded-full px-3 py-0.5">
                            {section.label}
                          </span>
                        </div>
                      )}
                      <div>
                        {renderSectionLines(section)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : rawLyrics.trim() ? (
                <p
                  className="text-slate-200 font-mono whitespace-pre-line"
                  style={{ fontSize: `${fontSize}px`, lineHeight: lineSpacing }}
                >
                  {rawLyrics}
                </p>
              ) : (
                <p className="text-slate-500 italic text-sm">No lyrics available for this song.</p>
              )}

              {/* Chord chart — shown in chords-lyrics or chords-only mode when no chords are embedded in lyrics */}
              {rawChords.trim() && transposedSections.length === 0 && displayMode !== 'lyrics' && (
                <div className="mt-10 border-t border-[#1e293b] pt-6 print:border-gray-300">
                  <h2 className="text-slate-400 print:text-gray-600 text-xs font-semibold uppercase tracking-widest mb-4">
                    Chord Chart
                  </h2>
                  <div className="space-y-6">
                    {transposedChordSections.map((sec, si) => (
                      <div key={si}>
                        {sec.label && (
                          <div className="mb-2">
                            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider border border-slate-700 rounded-full px-2 py-0.5">
                              {sec.label}
                            </span>
                          </div>
                        )}
                        <div>{renderSectionLines(sec, true)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:text-black { color: black !important; }
          .print\\:text-gray-600 { color: #4B5563 !important; }
          .print\\:border-gray-400 { border-color: #9CA3AF !important; }
          .print\\:bg-white { background: white !important; }
        }
      `}</style>
    </div>
  );
}
