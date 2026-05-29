import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';
import { store } from '../services/store';
import { useAuth } from '../App';

// ── Chromatic transposition ──────────────────────────────────────────────────
const NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_KEY_SET = new Set(['F','Bb','Eb','Ab','Db','Gb']);

function noteIdx(n) {
  const s = NOTES_SHARP.indexOf(n);
  return s >= 0 ? s : NOTES_FLAT.indexOf(n);
}
function idxToNote(i, flats) {
  const n = ((i % 12) + 12) % 12;
  return flats ? NOTES_FLAT[n] : NOTES_SHARP[n];
}
function useFlatsForKey(key) {
  return FLAT_KEY_SET.has((key || '').replace(/m$/, '').trim());
}
const CHORD_IN_LINE_RE = /[A-G][#b]?(m|M|maj|min|dim|aug|sus[24]?|add|dom)?[0-9]?(\/[A-G][#b]?)?/g;
const CHORD_TOKEN_RE   = /^[A-G][#b]?(m|M|maj|min|dim|aug|sus[24]?|add|dom)?[0-9]?(\/[A-G][#b]?)?$/;

function isChordLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (t.split('|').length > 2) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  const n = tokens.filter(tok => CHORD_TOKEN_RE.test(tok)).length;
  return n > 0 && n / tokens.length > 0.5;
}

function transposeToken(chord, semitones, flats) {
  if (semitones === 0) return chord;
  const m = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return chord;
  const [, root, rest] = m;
  const slashM = rest.match(/^(.*?)\/([A-G][#b]?)$/);
  if (slashM) {
    const [, mod, bass] = slashM;
    return idxToNote(noteIdx(root) + semitones, flats) + mod + '/' +
           idxToNote(noteIdx(bass) + semitones, flats);
  }
  return idxToNote(noteIdx(root) + semitones, flats) + rest;
}

function transposeChart(chart, semitones, targetKey) {
  if (!chart || semitones === 0) return chart;
  const flats = useFlatsForKey(targetKey);
  return chart.split('\n').map(line =>
    isChordLine(line)
      ? line.replace(CHORD_IN_LINE_RE, tok => transposeToken(tok, semitones, flats))
      : line
  ).join('\n');
}

function shiftKey(baseKey, semitones) {
  if (!baseKey || semitones === 0) return baseKey || '';
  const flats = FLAT_KEY_SET.has(baseKey.replace(/m$/, '').trim());
  const arr = flats ? NOTES_FLAT : NOTES_SHARP;
  let idx = arr.indexOf(baseKey);
  if (idx === -1) {
    const alt = flats ? NOTES_SHARP : NOTES_FLAT;
    idx = alt.indexOf(baseKey);
    if (idx === -1) return baseKey;
  }
  return arr[((idx + semitones) % 12 + 12) % 12];
}

// ── Guitar capo ──────────────────────────────────────────────────────────────
const GUITAR_CAPO_OPTIONS = [0, 1, 2, 3, 4, 5, 7];
const GUITAR_ROLES = new Set(['Guitar', 'Bass']);

function capoShapesKey(concertKey, capoFret) {
  if (!concertKey || capoFret === 0) return concertKey || '';
  const idx = noteIdx(concertKey.trim());
  if (idx < 0) return concertKey;
  return NOTES_SHARP[((idx - capoFret) % 12 + 12) % 12];
}

// ── YouTube helpers ──────────────────────────────────────────────────────────
function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function getSongYouTubeUrl(song) {
  return song?.youtubeLink || song?.youtubeUrl || song?.youtube_url || song?.youtube || null;
}

// ── Lyrics / section parsing ─────────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function Spinner({ size = 5 }) {
  return (
    <svg className={`animate-spin h-${size} w-${size} text-indigo-400`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function SongTypeBadge({ type }) {
  const colors = {
    worship: 'bg-indigo-900/60 text-indigo-300 border border-indigo-700',
    contemporary: 'bg-emerald-900/60 text-emerald-300 border border-emerald-700',
    hymn: 'bg-amber-900/60 text-amber-300 border border-amber-700',
  };
  const key = (type || '').toLowerCase();
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${colors[key] || 'bg-slate-700 text-slate-300 border border-slate-600'}`}>
      {type || 'song'}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SetlistRunnerScreen() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { profile } = useAuth() || {};

  const [songs, setSongs]           = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Transport
  const [isPlaying, setIsPlaying]   = useState(false);
  const [repeat, setRepeat]         = useState(false);
  const [continuous, setContinuous] = useState(false);

  // Media mode (YouTube)
  const [mediaModeEnabled, setMediaModeEnabled] = useState(false);

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Guitar capo
  const isGuitarist = (profile?.roles || []).some(r => GUITAR_ROLES.has(r));
  const [guitarCapo, setGuitarCapo] = useState(0);

  // Chords / transposition
  const [transposeStep, setTransposeStep] = useState(0);

  // Active section tracking (scroll)
  const lyricsRef      = useRef(null);
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);

  // ── Load setlist ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        // Prefer data passed via navigation state
        if (location.state?.setlistData?.songs?.length) {
          setSongs(location.state.setlistData.songs);
          setLoading(false);
          return;
        }

        // Otherwise resolve service ID and fetch
        let serviceId = location.state?.serviceId;
        if (!serviceId) {
          let cached = await store.getAssignments();
          const list = Array.isArray(cached) ? cached : (cached?.assignments || []);
          // Prefer first upcoming accepted service
          const now = Date.now();
          const accepted = list.filter(a => {
            const status = (a.status || '').toLowerCase();
            const accepted = !status || status === 'accepted' || status === 'confirmed';
            const date = a.serviceDate || a.date;
            const upcoming = !date || new Date(date).getTime() >= now - 86400000;
            return accepted && upcoming;
          });
          const first = accepted[0] || list[0];
          serviceId = first?.serviceId || first?.id || first?.service_id;
        }

        if (!serviceId) {
          setError('No service selected. Please go back and select a service.');
          setLoading(false);
          return;
        }

        const res = await fetch(`${SYNC_URL}/sync/setlist?serviceId=${encodeURIComponent(serviceId)}`, {
          headers: syncHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = data.songs || data.setlist || [];
        if (!list.length) {
          setError('This setlist has no songs.');
        } else {
          setSongs(list);
        }
      } catch (err) {
        setError(err.message || 'Failed to load setlist.');
      } finally {
        setLoading(false);
      }
    })();
  }, [location.state]);

  const currentSong = songs[currentIndex] || null;

  // Reset transpose and capo when song changes
  useEffect(() => {
    setTransposeStep(0);
    setGuitarCapo(0);
    setActiveSectionIdx(0);
    if (lyricsRef.current) lyricsRef.current.scrollTop = 0;
  }, [currentIndex]);

  const baseKey = (currentSong?.key || currentSong?.songKey || '').trim();
  const displayKey = baseKey ? shiftKey(baseKey, transposeStep) : '';

  const rawLyrics = currentSong?.lyrics || currentSong?.lyricsText || currentSong?.lyricsRaw || '';
  const rawChords = currentSong?.chordChart || currentSong?.chords || '';

  const sections = useMemo(() => parseLyrics(rawLyrics), [rawLyrics]);
  const chordSections = useMemo(() => parseLyrics(rawChords), [rawChords]);

  const videoId = mediaModeEnabled
    ? extractYouTubeId(getSongYouTubeUrl(currentSong))
    : null;

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goTo = useCallback((idx) => {
    const clamped = Math.max(0, Math.min(songs.length - 1, idx));
    setCurrentIndex(clamped);
    setIsPlaying(false);
  }, [songs.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) goTo(currentIndex - 1);
    else if (repeat) goTo(songs.length - 1);
  }, [currentIndex, goTo, repeat, songs.length]);

  const handleNext = useCallback(() => {
    if (currentIndex < songs.length - 1) goTo(currentIndex + 1);
    else if (repeat) goTo(0);
  }, [currentIndex, goTo, repeat, songs.length]);

  // Auto-advance (continuous mode) — advance when isPlaying and user is at last section
  useEffect(() => {
    if (!continuous || !isPlaying) return;
    // Continuously advance after 30s on current song (simplified desktop-friendly behaviour)
    const timer = setTimeout(() => {
      if (currentIndex < songs.length - 1) {
        goTo(currentIndex + 1);
        setIsPlaying(true);
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, [continuous, isPlaying, currentIndex, songs.length, goTo]);

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  const enterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } catch (_) {}
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      setIsFullscreen(false);
    } catch (_) {}
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsPlaying(v => !v);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          setMediaModeEnabled(v => !v);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          if (isFullscreen) exitFullscreen();
          else enterFullscreen();
          break;
        case 'Escape':
          if (isFullscreen) exitFullscreen();
          else navigate(-1);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlePrev, handleNext, isFullscreen, navigate]);

  // ── Active section tracking via scroll ──────────────────────────────────────
  const handleLyricsScroll = useCallback(() => {
    const el = lyricsRef.current;
    if (!el || sections.length === 0) return;
    const sectionEls = el.querySelectorAll('[data-section-idx]');
    let active = 0;
    for (let i = 0; i < sectionEls.length; i++) {
      if (sectionEls[i].getBoundingClientRect().top <= el.getBoundingClientRect().top + 80) {
        active = i;
      }
    }
    setActiveSectionIdx(active);
  }, [sections.length]);

  // ── Loading / Error states ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full bg-[#020617] flex flex-col items-center justify-center gap-6">
        <Spinner size={8} />
        <p className="text-slate-400">Loading setlist…</p>
      </div>
    );
  }

  if (error || songs.length === 0) {
    return (
      <div className="h-full bg-[#020617] flex flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.924-.833-2.694 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div>
          <p className="text-white text-lg font-semibold">Could not load setlist</p>
          <p className="text-slate-400 text-sm mt-1">{error || 'No songs found.'}</p>
        </div>
        <button onClick={() => navigate(-1)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
          Go Back
        </button>
      </div>
    );
  }

  // ── Rendered transposed lyrics ────────────────────────────────────────────
  const transposedSections = sections.map(sec => ({
    ...sec,
    lines: sec.lines.map(line =>
      transposeStep !== 0 && isChordLine(line)
        ? line.replace(CHORD_IN_LINE_RE, tok => transposeToken(tok, transposeStep, useFlatsForKey(displayKey)))
        : line
    ),
  }));

  const hasChords = rawChords.trim().length > 0;

  return (
    <div className="h-full flex flex-col bg-[#020617] overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-[#0f172a] border-b border-[#1e293b] px-4 py-2.5 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-400 hover:text-white transition flex items-center gap-1 text-sm flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="flex-1 text-slate-300 text-sm font-semibold text-center">
          Song <span className="text-white">{currentIndex + 1}</span>
          <span className="text-slate-500"> of {songs.length}</span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Media mode toggle */}
          <button
            onClick={() => setMediaModeEnabled(v => !v)}
            title="Toggle YouTube (M)"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              mediaModeEnabled
                ? 'bg-red-700/80 text-white'
                : 'bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            {mediaModeEnabled ? 'Video On' : 'Video Off'}
          </button>

          {/* Repeat toggle */}
          <button
            onClick={() => setRepeat(v => !v)}
            title="Repeat loop"
            className={`p-1.5 rounded-lg transition ${repeat ? 'text-indigo-400 bg-indigo-900/30' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Continuous toggle */}
          <button
            onClick={() => setContinuous(v => !v)}
            title="Auto-advance to next song"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              continuous
                ? 'bg-indigo-700/60 text-indigo-200'
                : 'bg-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            Auto
          </button>

          {/* Fullscreen */}
          <button
            onClick={isFullscreen ? exitFullscreen : enterFullscreen}
            title="Fullscreen (F)"
            className="p-1.5 text-slate-500 hover:text-slate-300 transition rounded-lg"
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Song strip ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-[#0f172a]/60 border-b border-[#1e293b] overflow-x-auto">
        <div className="flex gap-0">
          {songs.map((s, i) => (
            <button
              key={s.id || i}
              onClick={() => goTo(i)}
              className={`flex-shrink-0 px-4 py-2 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                i === currentIndex
                  ? 'border-indigo-500 text-indigo-400 bg-indigo-900/20'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
              }`}
            >
              <span className="text-slate-600 mr-1">{i + 1}.</span>
              {s.title || 'Untitled'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main scrollable content ──────────────────────────────────────────── */}
      <div
        ref={lyricsRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleLyricsScroll}
      >
        {currentSong && (
          <div className="flex flex-col max-w-3xl mx-auto w-full px-6 pb-10">

            {/* Song header */}
            <div className="pt-5 pb-4 border-b border-[#1e293b]">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  {/* Song number / title */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-slate-500 text-sm font-mono">{currentIndex + 1}/{songs.length}</span>
                    <h2 className="text-white font-bold text-2xl leading-tight">{currentSong.title || 'Untitled'}</h2>
                  </div>
                  <p className="text-slate-400 text-sm">{currentSong.artist || currentSong.artistName || ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <SongTypeBadge type={currentSong.songType || currentSong.song_type} />
                  {displayKey && (
                    <div className="flex items-center gap-1 bg-indigo-900/40 border border-indigo-700/40 rounded-lg px-3 py-1">
                      <span className="text-indigo-400 text-xs">Key</span>
                      <span className="text-white font-bold text-sm">{displayKey}</span>
                      {transposeStep !== 0 && (
                        <span className="text-indigo-300 text-xs font-mono">
                          ({transposeStep > 0 ? '+' : ''}{transposeStep})
                        </span>
                      )}
                    </div>
                  )}
                  {(currentSong.tempo || currentSong.bpm) && (
                    <div className="flex items-center gap-1 bg-slate-800 border border-[#1e293b] rounded-lg px-3 py-1">
                      <span className="text-slate-400 text-xs font-mono">{currentSong.tempo || currentSong.bpm} BPM</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* YouTube embed */}
            {videoId && (
              <div className="mt-4">
                <div className="relative w-full" style={{ height: '220px' }}>
                  <iframe
                    className="w-full h-full rounded-xl"
                    src={`https://www.youtube.com/embed/${videoId}?autoplay=0&playsinline=1&controls=1&rel=0&modestbranding=1`}
                    title={currentSong.title}
                    frameBorder="0"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                  />
                </div>
              </div>
            )}

            {/* Key transposer — shown when song has a key */}
            {baseKey && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-slate-500 text-xs">Key</span>
                <button
                  onClick={() => setTransposeStep(s => s - 1)}
                  className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold transition flex items-center justify-center"
                  title="Transpose down"
                >−</button>
                <button
                  onClick={() => setTransposeStep(0)}
                  className="px-3 py-1 rounded-lg bg-indigo-900/50 border border-indigo-700/40 text-indigo-300 text-sm font-bold min-w-[60px] text-center"
                  title="Reset key (click)"
                >
                  {displayKey || baseKey}
                </button>
                <button
                  onClick={() => setTransposeStep(s => s + 1)}
                  className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold transition flex items-center justify-center"
                  title="Transpose up"
                >+</button>
                {transposeStep !== 0 && (
                  <button
                    onClick={() => setTransposeStep(0)}
                    className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs transition hover:bg-slate-600"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}

            {/* Guitar capo selector — only shown for guitarists when song has a key */}
            {isGuitarist && baseKey && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-slate-500 text-xs">Capo</span>
                <div className="flex gap-1">
                  {GUITAR_CAPO_OPTIONS.map(fret => (
                    <button
                      key={fret}
                      onClick={() => setGuitarCapo(fret)}
                      className={`w-8 h-7 rounded-lg text-xs font-bold transition ${
                        guitarCapo === fret
                          ? 'bg-amber-600/60 border border-amber-500/60 text-amber-200'
                          : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fret === 0 ? '—' : fret}
                    </button>
                  ))}
                </div>
                {guitarCapo > 0 && (
                  <span className="text-amber-400 text-xs font-mono">
                    Capo {guitarCapo} → play shapes in <strong>{capoShapesKey(displayKey || baseKey, guitarCapo)}</strong>
                  </span>
                )}
              </div>
            )}

            {/* Lyrics sections */}
            {transposedSections.length > 0 ? (
              <div className="mt-5 space-y-6">
                {transposedSections.map((section, si) => (
                  <div
                    key={si}
                    data-section-idx={si}
                    className={`rounded-xl p-4 transition-colors ${
                      si === activeSectionIdx
                        ? 'bg-indigo-950/50 border border-indigo-700/30'
                        : 'bg-transparent'
                    }`}
                  >
                    {section.label && (
                      <div className="mb-2">
                        <span className={`text-xs font-semibold uppercase tracking-[0.15em] border rounded-full px-3 py-0.5 ${
                          si === activeSectionIdx
                            ? 'text-indigo-300 border-indigo-500/60 bg-indigo-900/30'
                            : 'text-slate-400 border-slate-600/40'
                        }`}>
                          {section.label}
                        </span>
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {section.lines.map((line, li) => (
                        <p
                          key={li}
                          className={`font-mono leading-relaxed whitespace-pre-wrap text-base ${
                            isChordLine(line) ? 'text-indigo-300' : 'text-slate-200'
                          }`}
                        >
                          {line || '\u00A0'}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : rawLyrics ? (
              <p className="mt-5 text-slate-200 text-base leading-7 whitespace-pre-line font-mono">
                {rawLyrics}
              </p>
            ) : (
              <p className="mt-5 text-slate-500 italic text-sm">No lyrics available for this song.</p>
            )}

            {/* Chord chart — shown when song has chords and key is present */}
            {hasChords && chordSections.length > 0 && (
              <div className="mt-8 border-t border-[#1e293b] pt-5">
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Chord Chart</h3>
                  {guitarCapo > 0 && (
                    <span className="text-amber-400 text-xs font-mono">
                      Capo {guitarCapo} shapes ({capoShapesKey(displayKey || baseKey, guitarCapo)})
                    </span>
                  )}
                </div>
                <div className="space-y-5">
                  {chordSections.map((sec, si) => {
                    const chordSemitones = transposeStep - guitarCapo;
                    const chordKey = guitarCapo > 0
                      ? capoShapesKey(displayKey || baseKey, guitarCapo)
                      : (displayKey || baseKey);
                    return (
                      <div key={si}>
                        {sec.label && (
                          <div className="mb-2">
                            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider border border-slate-700 rounded-full px-2 py-0.5">
                              {sec.label}
                            </span>
                          </div>
                        )}
                        <div className="space-y-0.5">
                          {sec.lines.map((line, li) => {
                            const transposedLine = chordSemitones !== 0 && isChordLine(line)
                              ? line.replace(CHORD_IN_LINE_RE, tok => transposeToken(tok, chordSemitones, useFlatsForKey(chordKey)))
                              : line;
                            return (
                              <p key={li} className={`font-mono text-sm leading-relaxed whitespace-pre-wrap ${
                                isChordLine(line) ? 'text-emerald-400' : 'text-slate-300'
                              }`}>
                                {transposedLine || '\u00A0'}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom transport bar ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-[#0f172a] border-t border-[#1e293b] px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Prev */}
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0 && !repeat}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </button>

          {/* Center */}
          <div className="flex items-center gap-3">
            {/* Play / Pause */}
            <button
              onClick={() => setIsPlaying(v => !v)}
              className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition shadow-lg ${
                isPlaying ? 'bg-indigo-500 hover:bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
              title="Space to toggle"
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            <span className="text-slate-400 text-sm font-medium tabular-nums">
              {currentIndex + 1} / {songs.length}
            </span>
          </div>

          {/* Next */}
          <button
            onClick={handleNext}
            disabled={currentIndex === songs.length - 1 && !repeat}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm"
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <p className="text-center text-slate-600 text-xs mt-2">
          Space = play/pause · ← → = prev/next · M = video · F = fullscreen · ESC = back
        </p>
      </div>
    </div>
  );
}
