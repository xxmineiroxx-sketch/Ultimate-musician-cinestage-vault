import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';
import { store } from '../services/store';
import { useAuth } from '../App';
import { useBrain } from '../context/BrainContext';

// ── Role constants ─────────────────────────────────────────────────────────────
const VOCAL_ROLES = new Set([
  'worship_leader', 'lead_vocal', 'lead_vocals', 'bgv_1', 'bgv_2', 'bgv_3',
  'bgv1', 'bgv2', 'bgv3', 'music_director', 'vocalist', 'vocals',
]);
const SOUND_TECH_ROLES = new Set([
  'sound_tech', 'foh_engineer', 'monitor_engineer', 'stream_engineer', 'audio_tech',
]);
const MEDIA_TECH_ROLES = new Set(['media_tech', 'projection', 'screen_operator']);
const LEADER_ROLES = new Set(['worship_leader', 'music_director', 'md', 'admin', 'leader']);
const CHART_INSTRUMENTS = ['Keys', 'Acoustic Guitar', 'Electric Guitar', 'Bass', 'Synth/Pad', 'Drums'];
const ROLE_TO_INSTRUMENT = {
  keyboard: 'Keys', piano: 'Keys', keys: 'Keys', keys_player: 'Keys',
  electric_guitar: 'Electric Guitar', guitarist: 'Electric Guitar',
  guitar: 'Acoustic Guitar', acoustic_guitar: 'Acoustic Guitar',
  bass: 'Bass', bass_guitar: 'Bass', bassist: 'Bass',
  drums: 'Drums', percussion: 'Drums', drummer: 'Drums',
  synth: 'Synth/Pad', synth_pad: 'Synth/Pad',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function isChordLine(line) {
  const CHORD_TOKEN_RE = /^[A-G][#b]?(m|M|maj|min|dim|aug|sus[24]?|add|dom)?[0-9]?(\/[A-G][#b]?)?$/;
  const t = line.trim();
  if (!t) return false;
  if (t.split('|').length > 2) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  const n = tokens.filter(tok => CHORD_TOKEN_RE.test(tok)).length;
  return n > 0 && n / tokens.length > 0.5;
}

function getChordPreview(song) {
  const raw = song?.chordChart || song?.chords || '';
  if (!raw.trim()) return '';
  const firstChordLine = raw.split('\n').find(l => isChordLine(l));
  return firstChordLine ? firstChordLine.trim() : '';
}

function hasStemsAvailable(song) {
  const stems = song?.stems || song?.stemUrls || song?.stem_urls;
  if (!stems) return false;
  if (typeof stems === 'object') return Object.values(stems).some(v => !!v);
  return false;
}

function estimateDuration(songs) {
  const total = songs.reduce((acc, s) => {
    const d = s.duration || s.durationSec || 240;
    return acc + (typeof d === 'number' ? d : 240);
  }, 0);
  const mins = Math.round(total / 60);
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `~${h}h ${m}m`;
}

function getInstrumentChart(song, instrument) {
  if (!instrument) return '';
  if (song.chordCharts && typeof song.chordCharts === 'object') {
    return song.chordCharts[instrument] || '';
  }
  return song.chordChart || song.chords || '';
}

// ── Sub-components ────────────────────────────────────────────────────────────
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

function VocalLineup({ song }) {
  const raw = song.vocalParts || song.vocalAssignments || song.vocal_parts || song.vocal_assignments;
  if (!raw) return <p className="text-slate-500 text-xs italic">No vocal assignments for this song.</p>;

  if (Array.isArray(raw)) {
    if (raw.length === 0) return <p className="text-slate-500 text-xs italic">No vocal assignments for this song.</p>;
    return (
      <div className="flex flex-col gap-1.5">
        {raw.map((p, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            {p.part && (
              <span className="text-slate-500 uppercase text-xs font-semibold w-14 flex-shrink-0">{p.part}</span>
            )}
            <span className="text-white">{p.name || p.email || String(p)}</span>
            {p.mic && <span className="text-slate-400 text-xs ml-auto">Mic {p.mic}</span>}
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(raw);
  if (entries.length === 0) return <p className="text-slate-500 text-xs italic">No vocal assignments for this song.</p>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.map(([part, person]) => (
        <div key={part} className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 uppercase text-xs font-semibold w-14 flex-shrink-0">{part}</span>
          <span className="text-white truncate">
            {typeof person === 'object' ? (person?.name || person?.email || '—') : (person || '—')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Song Card ─────────────────────────────────────────────────────────────────
function SongCard({ song, index, navigate, selectedServiceId, isLeader, isInstrumentalist, isSoundTech, selectedInstrument, userRole }) {
  const [expanded, setExpanded] = useState(false);
  const [ytExpanded, setYtExpanded] = useState(false);
  const [note, setNote] = useState(song.note || song.notes || '');
  const videoId = extractYouTubeId(song.youtubeUrl || song.youtube_url || song.youtubeLink);
  const chordPreview = getChordPreview(song);
  const hasStems = hasStemsAvailable(song);
  const rawLyrics = song.lyrics || song.lyricsText || song.lyricsRaw || '';
  const rawChords = song.chordChart || song.chords || '';
  const instrumentChart = getInstrumentChart(song, selectedInstrument);
  const showEditChart = (isInstrumentalist || isLeader) && selectedInstrument;

  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden transition-all">
      {/* Card header */}
      <div
        className="p-4 cursor-pointer hover:bg-slate-800/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-9 h-9 bg-indigo-600/20 border border-indigo-600/40 rounded-lg flex items-center justify-center">
            <span className="text-indigo-400 font-bold text-sm">{index + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-white font-semibold text-base leading-tight">{song.title || 'Untitled'}</h3>
              <SongTypeBadge type={song.songType || song.song_type} />
              {hasStems && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-700/50">
                  Stems
                </span>
              )}
            </div>
            <p className="text-slate-400 text-sm mb-2 truncate">{song.artist || song.artistName || 'Unknown Artist'}</p>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400 items-center">
              {(song.key || song.songKey) && (
                <span className="flex items-center gap-1">
                  <span className="text-slate-500">Key</span>
                  <span className="text-white font-medium">{song.key || song.songKey}</span>
                </span>
              )}
              {(song.tempo || song.bpm) && (
                <span className="flex items-center gap-1">
                  <span className="text-slate-500">BPM</span>
                  <span className="text-white font-medium">{song.tempo || song.bpm}</span>
                </span>
              )}
              {chordPreview && (
                <span className="font-mono text-indigo-300 truncate max-w-[200px]" title="Chord progression">
                  {chordPreview}
                </span>
              )}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform mt-1 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-4" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => navigate('/practice', { state: { song, songId: song.id || song.songId, serviceId: selectedServiceId } })}
            className="flex-1 min-w-[90px] bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            Practice
          </button>
          <button
            onClick={() => navigate('/lyrics', { state: { song } })}
            className="flex-1 min-w-[90px] bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Lyrics
          </button>
          {videoId ? (
            <button
              onClick={() => setYtExpanded(v => !v)}
              className="flex-1 min-w-[90px] bg-red-700/80 hover:bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              {ytExpanded ? 'Hide Video' : 'YouTube'}
            </button>
          ) : (song.youtubeUrl || song.youtube_url || song.youtubeLink) ? (
            <a
              href={song.youtubeUrl || song.youtube_url || song.youtubeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-[90px] bg-red-700/80 hover:bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              YouTube
            </a>
          ) : null}
          {showEditChart && (
            <button
              onClick={() => navigate('/content-editor', {
                state: {
                  song,
                  serviceId: selectedServiceId,
                  instrument: selectedInstrument,
                  isAdmin: isLeader,
                  userRole,
                },
              })}
              className="flex-1 min-w-[90px] bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Chart
            </button>
          )}
        </div>
      </div>

      {/* YouTube embed */}
      {videoId && ytExpanded && (
        <div className="border-t border-[#1e293b] bg-black">
          <div className="relative" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=0&playsinline=1&controls=1&rel=0&modestbranding=1`}
              title={song.title}
              frameBorder="0"
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-[#1e293b] px-5 py-4 space-y-4 bg-slate-900/30">

          {/* Instrument-specific chart (for instrumentalists with selected instrument) */}
          {isInstrumentalist && selectedInstrument && instrumentChart.trim() && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
                  Chart — {selectedInstrument}
                </p>
                <button
                  onClick={() => navigate('/content-editor', {
                    state: { song, serviceId: selectedServiceId, instrument: selectedInstrument, isAdmin: isLeader, userRole },
                  })}
                  className="text-indigo-400 hover:text-indigo-300 text-xs font-medium transition"
                >
                  Edit →
                </button>
              </div>
              <pre className="text-indigo-300 text-sm font-mono whitespace-pre-wrap leading-relaxed bg-slate-800/50 rounded-lg p-3">
                {instrumentChart}
              </pre>
            </div>
          )}

          {/* No chart yet message for instrumentalists */}
          {isInstrumentalist && selectedInstrument && !instrumentChart.trim() && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-slate-500 text-sm">No {selectedInstrument} chart yet.</p>
              <button
                onClick={() => navigate('/content-editor', {
                  state: { song, serviceId: selectedServiceId, instrument: selectedInstrument, isAdmin: isLeader, userRole },
                })}
                className="text-indigo-400 hover:text-indigo-300 text-xs font-semibold transition"
              >
                Add Chart →
              </button>
            </div>
          )}

          {/* Vocal lineup (sound tech view) */}
          {isSoundTech && (
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Vocal Lineup</p>
              <VocalLineup song={song} />
            </div>
          )}

          {/* Chord chart (non-instrumentalists or when no specific chart) */}
          {!isInstrumentalist && rawChords.trim() && (
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Chord Chart</p>
              <pre className="text-indigo-300 text-sm font-mono whitespace-pre-wrap leading-relaxed">
                {rawChords}
              </pre>
            </div>
          )}

          {/* Lyrics preview */}
          {rawLyrics.trim() && (
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Lyrics Preview</p>
              <p className="text-slate-300 text-sm font-mono whitespace-pre-line leading-relaxed line-clamp-8">
                {rawLyrics}
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Notes</p>
            {isLeader ? (
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add notes for this song…"
                rows={2}
                className="w-full bg-slate-800 border border-[#1e293b] text-slate-200 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
              />
            ) : (
              <p className="text-slate-400 text-sm">
                {note || <span className="italic text-slate-600">No notes.</span>}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SetlistScreen() {
  const navigate = useNavigate();
  const { profile } = useAuth() || {};
  const { registerScreenContext } = useBrain();

  const userRole = (
    profile?.grantedRole || profile?.role || profile?.primaryRole || ''
  ).toLowerCase().replace(/\s+/g, '_');

  const isLeader = LEADER_ROLES.has(userRole);
  const isVocal = VOCAL_ROLES.has(userRole);
  const isSoundTech = SOUND_TECH_ROLES.has(userRole);
  const isMediaTech = MEDIA_TECH_ROLES.has(userRole);
  const isInstrumentalist = !isVocal && !isSoundTech && !isMediaTech &&
    (!!ROLE_TO_INSTRUMENT[userRole] || CHART_INSTRUMENTS.some(i => i.toLowerCase() === userRole));

  // Derive default instrument from role
  const defaultInstrument = ROLE_TO_INSTRUMENT[userRole] || '';
  const [selectedInstrument, setSelectedInstrument] = useState(defaultInstrument);

  const [assignments, setAssignments]             = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [setlistData, setSetlistData]             = useState(null);
  const [songs, setSongs]                         = useState([]);
  const [loading, setLoading]                     = useState(false);
  const [assLoading, setAssLoading]               = useState(true);
  const [error, setError]                         = useState('');

  // ── Load assignments ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setAssLoading(true);
      try {
        let cached = await store.getAssignments();
        if (!cached) {
          const res = await fetch(`${SYNC_URL}/sync/assignments`, { headers: syncHeaders() });
          if (res.ok) {
            cached = await res.json();
            await store.setAssignments(cached);
          }
        }
        const list = Array.isArray(cached) ? cached : (cached?.assignments || []);

        const now = Date.now();
        const upcoming = list
          .filter(a => {
            const status = (a.status || '').toLowerCase();
            const isAccepted = !status || status === 'accepted' || status === 'confirmed';
            const date = a.serviceDate || a.date;
            const isUpcoming = !date || new Date(date).getTime() >= now - 86400000;
            return isAccepted && isUpcoming;
          })
          .sort((a, b) => {
            const da = new Date(a.serviceDate || a.date || 0).getTime();
            const db = new Date(b.serviceDate || b.date || 0).getTime();
            return da - db;
          });

        setAssignments(list);
        const firstId = (upcoming[0] || list[0])?.serviceId ||
                        (upcoming[0] || list[0])?.id ||
                        (upcoming[0] || list[0])?.service_id;
        if (firstId) setSelectedServiceId(String(firstId));
      } catch (_) {
        setError('Could not load assignments.');
      } finally {
        setAssLoading(false);
      }
    })();
  }, []);

  // ── Register brain context when setlist loads ────────────────────────────
  useEffect(() => {
    if (songs.length === 0) return;
    registerScreenContext({
      screen: 'setlist',
      serviceId: selectedServiceId,
      songs: songs.map(s => ({ title: s.title, key: s.key, tempo: s.tempo || s.bpm, artist: s.artist })),
      userRole,
      instrument: selectedInstrument || null,
    });
  }, [songs, selectedServiceId, userRole, selectedInstrument, registerScreenContext]);

  // ── Fetch setlist ────────────────────────────────────────────────────────
  const fetchSetlist = useCallback(async (serviceId) => {
    if (!serviceId) return;
    setLoading(true);
    setError('');
    setSetlistData(null);
    setSongs([]);
    try {
      const [setlistRes, libraryRes] = await Promise.all([
        fetch(`${SYNC_URL}/sync/setlist?serviceId=${encodeURIComponent(serviceId)}`, { headers: syncHeaders() }),
        fetch(`${SYNC_URL}/sync/library-pull`, { headers: syncHeaders() }),
      ]);

      if (!setlistRes.ok) {
        const body = await setlistRes.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${setlistRes.status}`);
      }

      const data    = await setlistRes.json();
      const rawList = data.songs || data.setlist || [];

      let libraryMap = {};
      if (libraryRes.ok) {
        const libData = await libraryRes.json().catch(() => []);
        const lib = Array.isArray(libData) ? libData
          : Array.isArray(libData.songs) ? libData.songs
          : Array.isArray(libData.library) ? libData.library
          : [];
        libraryMap = lib.reduce((acc, s) => {
          const id = s.id || s.songId;
          if (id) acc[String(id)] = s;
          return acc;
        }, {});
        await store.setSongs(lib);
      }

      const merged = rawList.map(s => {
        const id = String(s.id || s.songId || '');
        const libSong = libraryMap[id] || {};
        return { ...libSong, ...s };
      });

      setSetlistData(data);
      setSongs(merged);
    } catch (err) {
      setError(err.message || 'Failed to load setlist.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedServiceId) fetchSetlist(selectedServiceId);
  }, [selectedServiceId, fetchSetlist]);

  const serviceDate   = setlistData?.serviceDate || setlistData?.date || '';
  const serviceTime   = setlistData?.serviceTime || setlistData?.time || '';
  const theme         = setlistData?.theme || setlistData?.serviceTheme || '';
  const formattedDate = serviceDate
    ? new Date(serviceDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="h-full flex flex-col bg-[#020617] overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-[#0f172a] border-b border-[#1e293b] px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-white font-bold text-xl tracking-tight">Setlist</h1>
            {formattedDate && (
              <p className="text-slate-400 text-sm mt-0.5">
                {formattedDate}
                {serviceTime && <span className="ml-2 text-slate-500">at {serviceTime}</span>}
                {theme && <span className="ml-2 text-indigo-400">· {theme}</span>}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Instrument selector (instrumentalists + leaders) */}
            {(isInstrumentalist || isLeader) && (
              <select
                value={selectedInstrument}
                onChange={e => setSelectedInstrument(e.target.value)}
                className="bg-slate-800 border border-[#1e293b] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">All Instruments</option>
                {CHART_INSTRUMENTS.map(inst => (
                  <option key={inst} value={inst}>{inst}</option>
                ))}
              </select>
            )}

            {/* Service selector */}
            {assLoading ? (
              <Spinner />
            ) : (
              <select
                value={selectedServiceId}
                onChange={e => setSelectedServiceId(e.target.value)}
                className="bg-slate-800 border border-[#1e293b] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 min-w-[220px]"
              >
                {assignments.length === 0 && (
                  <option value="">No services available</option>
                )}
                {assignments.map(a => {
                  const id    = a.serviceId || a.id || a.service_id;
                  const label = a.serviceName || a.serviceTitle || a.title || `Service ${id}`;
                  const date  = (a.serviceDate || a.date)
                    ? new Date(a.serviceDate || a.date).toLocaleDateString()
                    : '';
                  return (
                    <option key={id} value={String(id)}>
                      {date ? `${date} — ${label}` : label}
                    </option>
                  );
                })}
              </select>
            )}

            {/* Launch Runner */}
            <button
              onClick={() => navigate('/setlist-runner', {
                state: { setlistData: { songs, ...setlistData }, serviceId: selectedServiceId },
              })}
              disabled={!setlistData || songs.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Launch Runner
            </button>
          </div>
        </div>

        {/* Role context badge */}
        {(isSoundTech || isMediaTech) && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 border border-slate-700 text-slate-400">
              {isSoundTech ? '🎙 Sound Tech View' : '📽 Media Tech View'}
            </span>
          </div>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {error && (
          <div className="mb-4 bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Spinner size={8} />
            <p className="text-slate-400 text-sm">Loading setlist…</p>
          </div>
        )}

        {/* Metadata bar */}
        {!loading && setlistData && songs.length > 0 && (
          <div className="flex gap-3 mb-5 flex-wrap">
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg px-4 py-2.5 flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span className="text-slate-400 text-sm">{songs.length} song{songs.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg px-4 py-2.5 flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-slate-400 text-sm">{estimateDuration(songs)}</span>
            </div>
            {theme && (
              <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg px-4 py-2.5 flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                <span className="text-slate-400 text-sm">Theme: <span className="text-white">{theme}</span></span>
              </div>
            )}
            {formattedDate && (
              <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg px-4 py-2.5 flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-slate-400 text-sm">
                  {formattedDate}{serviceTime && ` at ${serviceTime}`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && (!setlistData || songs.length === 0) && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <p className="text-slate-300 font-medium">No songs in this setlist</p>
              <p className="text-slate-500 text-sm mt-1">Select a service or check back later.</p>
            </div>
          </div>
        )}

        {/* Song list */}
        {!loading && songs.length > 0 && (
          <div className="flex flex-col gap-3">
            {songs.map((song, i) => (
              <SongCard
                key={song.id || song.songId || i}
                song={song}
                index={i}
                navigate={navigate}
                selectedServiceId={selectedServiceId}
                isLeader={isLeader}
                isInstrumentalist={isInstrumentalist}
                isSoundTech={isSoundTech}
                selectedInstrument={selectedInstrument}
                userRole={userRole}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
