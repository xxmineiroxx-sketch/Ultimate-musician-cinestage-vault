import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';
import { useAuth } from '../App';

// ── Constants ────────────────────────────────────────────────────────────────
const SONG_TYPES = ['worship', 'contemporary', 'hymn', 'gospel'];
const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/2', '5/4', '7/8'];
const MUSICAL_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'];
const SECTION_TAGS = ['[Verse 1]', '[Verse 2]', '[Verse 3]', '[Pre-Chorus]', '[Chorus]', '[Bridge]', '[Outro]', '[Intro]'];

const ALL_INSTRUMENTS = ['Vocals', 'Keys', 'Acoustic Guitar', 'Electric Guitar', 'Bass', 'Synth/Pad', 'Drums'];
const DEFAULT_RIGS = ['Nord', 'MODX', 'VS', 'Kontakt', 'Ableton'];
const RIG_COLORS = { Nord: '#EF4444', MODX: '#10B981', VS: '#EAB308', Kontakt: '#F97316', Ableton: '#3B82F6' };

const EMPTY_SONG = {
  title: '', artist: '', year: '', key: '', tempo: '', timeSignature: '4/4',
  type: 'worship', lyrics: '', chordKey: '', chordProgression: '', youtubeUrl: '', audioPath: '',
};
const EMPTY_ANNOUNCE = { title: '', body: '' };

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseInlineRigs(line) {
  const parts = [];
  const regex = /@\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push({ text: line.slice(lastIndex, match.index), rig: null });
    parts.push({ text: match[0], rig: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) parts.push({ text: line.slice(lastIndex), rig: null });
  return parts.length > 0 ? parts : [{ text: line, rig: null }];
}

function resolveSongSyncIds(song) {
  return {
    librarySongId: song.librarySongId || song.library_song_id || song.libraryId || null,
    planItemId: song.planItemId || song.plan_item_id || null,
    songId: song.id || song._id || null,
  };
}

function getSongChart(song, instrument) {
  if (!song) return '';
  if (song.chordCharts && typeof song.chordCharts === 'object') return song.chordCharts[instrument] || '';
  return song.chordChart || '';
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function ChartPreview({ content }) {
  if (!content.trim()) {
    return <p className="text-slate-500 text-sm italic py-8 text-center">Nothing to preview yet.</p>;
  }
  return (
    <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
      {content.split('\n').map((line, i) => {
        if (/^\[.+\]$/.test(line.trim())) {
          return <div key={i} className="text-indigo-400 font-bold mt-4 first:mt-0">{line}</div>;
        }
        if (!line.trim()) return <div key={i} className="h-2" />;
        const parts = parseInlineRigs(line);
        return (
          <div key={i}>
            {parts.map((part, j) =>
              part.rig ? (
                <span key={j} style={{ color: RIG_COLORS[part.rig] || '#a78bfa', fontWeight: 600 }}>{part.text}</span>
              ) : (
                <span key={j} className="text-slate-200">{part.text}</span>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ContentEditorScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();

  // Detect chart mode when navigated from SetlistScreen with a song
  const routeSong = location.state?.song || null;
  const routeServiceId = location.state?.serviceId || null;
  const routeIsAdmin = location.state?.isAdmin || false;
  const routeUserRole = location.state?.userRole || profile?.grantedRole || '';
  const isChartMode = !!routeSong;

  const isPrivileged =
    routeIsAdmin ||
    ['worship_leader', 'admin', 'music_director'].includes((routeUserRole || '').toLowerCase());

  // ── Chart editor state ────────────────────────────────────────────────────
  const [chartInstrument, setChartInstrument] = useState(location.state?.instrument || '');
  const [chartContent, setChartContent] = useState(() =>
    location.state?.instrument ? getSongChart(routeSong, location.state.instrument) : ''
  );
  const [chartRigs, setChartRigs] = useState(
    () => routeSong?.keyboardRigs || routeSong?.keyboard_rigs || []
  );
  const [chartPreview, setChartPreview] = useState(false);
  const [chartSubmitting, setChartSubmitting] = useState(false);
  const [chartError, setChartError] = useState('');
  const [chartSuccess, setChartSuccess] = useState(false);
  const chartTextareaRef = useRef(null);

  const handleSelectInstrument = (inst) => {
    setChartInstrument(inst);
    setChartContent(getSongChart(routeSong, inst));
    setChartPreview(false);
  };

  function toggleRig(rig) {
    setChartRigs((prev) => prev.includes(rig) ? prev.filter((r) => r !== rig) : [...prev, rig]);
  }

  function insertRigTag(rig) {
    const el = chartTextareaRef.current;
    const tag = `@[${rig}] `;
    if (!el) { setChartContent((c) => c + tag); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = chartContent.slice(0, start) + tag + chartContent.slice(end);
    setChartContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  }

  async function handleChartSubmit() {
    if (!chartInstrument) { setChartError('Please select an instrument.'); return; }
    if (!chartContent.trim()) { setChartError('Chart content cannot be empty.'); return; }
    setChartSubmitting(true);
    setChartError('');
    try {
      const { librarySongId, planItemId, songId } = resolveSongSyncIds(routeSong);
      const keyboardRigs = chartInstrument === 'Keys' ? chartRigs : [];

      if (isPrivileged) {
        const res = await fetch(`${SYNC_URL}/sync/song/patch`, {
          method: 'POST',
          headers: syncHeaders(),
          body: JSON.stringify({
            field: 'chordChart', value: chartContent, instrument: chartInstrument,
            keyboardRigs, senderRole: routeUserRole,
            songTitle: routeSong.title, songArtist: routeSong.artist,
            serviceId: routeServiceId, songId, planItemId, librarySongId,
          }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `HTTP ${res.status}`); }
      } else {
        const res = await fetch(`${SYNC_URL}/sync/proposal`, {
          method: 'POST',
          headers: syncHeaders(),
          body: JSON.stringify({
            songId, planItemId, librarySongId, serviceId: routeServiceId,
            type: 'chordChart', instrument: chartInstrument, content: chartContent,
            keyboardRigs,
            from_email: profile?.email || '',
            from_name: `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
            songTitle: routeSong.title, songArtist: routeSong.artist,
          }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `HTTP ${res.status}`); }
      }
      setChartSuccess(true);
    } catch (err) {
      setChartError(err.message);
    } finally {
      setChartSubmitting(false);
    }
  }

  // ── Library mode state ────────────────────────────────────────────────────
  const [mode, setMode] = useState('song');
  const [songs, setSongs] = useState([]);
  const [songsLoading, setSongsLoading] = useState(false);
  const [selectedSongId, setSelectedSongId] = useState(null);
  const [songForm, setSongForm] = useState({ ...EMPTY_SONG });
  const [songSaving, setSongSaving] = useState(false);
  const [songMsg, setSongMsg] = useState('');
  const [announceForm, setAnnounceForm] = useState({ ...EMPTY_ANNOUNCE });
  const [announceSaving, setAnnounceSaving] = useState(false);
  const [announceMsg, setAnnounceMsg] = useState('');
  const [search, setSearch] = useState('');

  const fetchSongs = useCallback(async () => {
    setSongsLoading(true);
    try {
      const res = await fetch(`${SYNC_URL}/sync/library-pull`, { headers: syncHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSongs(Array.isArray(data) ? data : (Array.isArray(data.songs) ? data.songs : []));
    } catch { setSongs([]); } finally { setSongsLoading(false); }
  }, []);

  useEffect(() => { if (!isChartMode) fetchSongs(); }, [fetchSongs, isChartMode]);

  const selectSong = (song) => {
    setSelectedSongId(song.id || song._id);
    setSongForm({
      title: song.title || '', artist: song.artist || '',
      year: song.year ? String(song.year) : '', key: song.key || '',
      tempo: song.tempo ? String(song.tempo) : '', timeSignature: song.timeSignature || '4/4',
      type: song.type || 'worship', lyrics: song.lyrics || '',
      chordKey: song.chordKey || song.key || '', chordProgression: song.chordProgression || '',
      youtubeUrl: song.youtubeUrl || '', audioPath: song.audioPath || '',
    });
    setSongMsg('');
  };

  const newSong = () => { setSelectedSongId(null); setSongForm({ ...EMPTY_SONG }); setSongMsg(''); };

  const handleOpenAudio = async () => {
    try {
      const filePath = await window.umDesktop.file.openAudio();
      if (filePath) setSongForm((f) => ({ ...f, audioPath: filePath }));
    } catch (err) { setSongMsg(`Error opening audio: ${err.message}`); }
  };

  const insertSectionTag = (tag) => {
    setSongForm((f) => ({ ...f, lyrics: f.lyrics ? `${f.lyrics}\n\n${tag}\n` : `${tag}\n` }));
  };

  const handleSaveSong = async () => {
    if (!songForm.title.trim()) { setSongMsg('Error: Title is required.'); return; }
    setSongSaving(true); setSongMsg('');
    try {
      const payload = {
        ...songForm,
        tempo: songForm.tempo ? Number(songForm.tempo) : undefined,
        year: songForm.year ? Number(songForm.year) : undefined,
        ...(selectedSongId ? { id: selectedSongId } : {}),
      };
      const res = await fetch(`${SYNC_URL}/sync/admin/songs`, {
        method: 'POST', headers: syncHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `HTTP ${res.status}`); }
      const saved = await res.json();
      const savedSong = saved.song || saved;
      setSongMsg('Song saved successfully!');
      setSongs((prev) => {
        const idx = prev.findIndex((s) => (s.id || s._id) === (savedSong.id || savedSong._id));
        if (idx >= 0) { const next = [...prev]; next[idx] = savedSong; return next; }
        return [...prev, savedSong];
      });
      setSelectedSongId(savedSong.id || savedSong._id);
    } catch (err) { setSongMsg(`Error: ${err.message}`); } finally { setSongSaving(false); }
  };

  const handleSaveAnnouncement = async () => {
    if (!announceForm.title.trim() || !announceForm.body.trim()) {
      setAnnounceMsg('Error: Title and body are required.'); return;
    }
    setAnnounceSaving(true); setAnnounceMsg('');
    try {
      const res = await fetch(`${SYNC_URL}/sync/admin/announce`, {
        method: 'POST', headers: syncHeaders(),
        body: JSON.stringify({ title: announceForm.title.trim(), message: announceForm.body.trim() }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `HTTP ${res.status}`); }
      setAnnounceMsg('Announcement published!');
      setAnnounceForm({ ...EMPTY_ANNOUNCE });
    } catch (err) { setAnnounceMsg(`Error: ${err.message}`); } finally { setAnnounceSaving(false); }
  };

  const inputCls = 'w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition';
  const labelCls = 'block text-slate-400 text-xs font-medium mb-1.5';
  const btnPrimary = 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition';
  const btnGhost = 'bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg px-4 py-2.5 border border-slate-700 transition';
  const filteredSongs = (Array.isArray(songs) ? songs : []).filter((s) =>
    search.trim() === '' ||
    (s.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.artist || '').toLowerCase().includes(search.toLowerCase())
  );

  // ══════════════════════════════════════════════════════════════════════════
  // CHART EDITOR MODE
  // ══════════════════════════════════════════════════════════════════════════
  if (isChartMode) {
    if (chartSuccess) {
      return (
        <div className="min-h-screen bg-[#020617] text-white flex items-center justify-center">
          <div className="max-w-md w-full mx-auto px-6 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {isPrivileged ? 'Chart Applied!' : 'Submitted for Review'}
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                {isPrivileged
                  ? 'Your chart has been saved to the song.'
                  : 'Your chart proposal has been sent to the leader for approval.'}
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-left space-y-3">
              <p className="text-white font-semibold">{routeSong?.title}</p>
              {routeSong?.artist && <p className="text-slate-400 text-sm">{routeSong.artist}</p>}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-600/30 border border-indigo-500/40 text-indigo-300">
                  {chartInstrument}
                </span>
                {chartInstrument === 'Keys' && chartRigs.map((rig) => (
                  <span
                    key={rig}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border"
                    style={{ color: RIG_COLORS[rig] || '#a78bfa', borderColor: (RIG_COLORS[rig] || '#a78bfa') + '40', backgroundColor: (RIG_COLORS[rig] || '#a78bfa') + '15' }}
                  >
                    {rig}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => navigate(-1)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg px-4 py-3 text-sm transition"
            >
              Back to Setlist
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#020617] text-white flex flex-col">
        <div className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Edit Chart</h1>
            <p className="text-slate-400 text-xs">
              {routeSong?.title}{routeSong?.artist ? ` · ${routeSong.artist}` : ''}
            </p>
          </div>
          {!isPrivileged && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-400">
              Proposal Mode
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-5">
            {chartError && (
              <div className="text-sm rounded-lg px-4 py-3 bg-red-900/30 text-red-300 border border-red-800">
                {chartError}
              </div>
            )}

            {/* Instrument Picker */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Instrument</h3>
              <div className="flex flex-wrap gap-2">
                {ALL_INSTRUMENTS.map((inst) => (
                  <button
                    key={inst}
                    onClick={() => handleSelectInstrument(inst)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      chartInstrument === inst
                        ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                        : 'bg-transparent border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {inst}
                  </button>
                ))}
              </div>
            </div>

            {/* Keyboard Rigs (Keys only) */}
            {chartInstrument === 'Keys' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Keyboard Rigs</h3>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_RIGS.map((rig) => {
                    const active = chartRigs.includes(rig);
                    const color = RIG_COLORS[rig];
                    return (
                      <button
                        key={rig}
                        onClick={() => toggleRig(rig)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                        style={{
                          color: active ? color : '#94a3b8',
                          borderColor: active ? color + '60' : '#334155',
                          backgroundColor: active ? color + '18' : 'transparent',
                        }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: active ? color : '#475569' }} />
                        {rig}
                      </button>
                    );
                  })}
                </div>
                {chartRigs.length > 0 && (
                  <p className="text-slate-500 text-xs">
                    Active: {chartRigs.join(', ')} — use @[Rig] tags to mark transitions
                  </p>
                )}
              </div>
            )}

            {/* Chart Content */}
            {chartInstrument && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Chart Content</h3>
                  {chartInstrument === 'Keys' && (
                    <div className="flex rounded-lg overflow-hidden border border-slate-700">
                      <button
                        onClick={() => setChartPreview(false)}
                        className={`px-3 py-1 text-xs font-medium transition ${!chartPreview ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setChartPreview(true)}
                        className={`px-3 py-1 text-xs font-medium transition ${chartPreview ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        Preview
                      </button>
                    </div>
                  )}
                </div>

                {chartInstrument === 'Keys' && !chartPreview && chartRigs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-500 text-xs">Insert rig tag:</span>
                    {chartRigs.map((rig) => (
                      <button
                        key={rig}
                        onClick={() => insertRigTag(rig)}
                        className="px-2.5 py-1 rounded text-xs font-semibold border transition-all hover:opacity-80"
                        style={{
                          color: RIG_COLORS[rig] || '#a78bfa',
                          borderColor: (RIG_COLORS[rig] || '#a78bfa') + '40',
                          backgroundColor: (RIG_COLORS[rig] || '#a78bfa') + '15',
                        }}
                      >
                        @[{rig}]
                      </button>
                    ))}
                  </div>
                )}

                {chartPreview ? (
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 min-h-[300px]">
                    <ChartPreview content={chartContent} />
                  </div>
                ) : (
                  <textarea
                    ref={chartTextareaRef}
                    value={chartContent}
                    onChange={(e) => setChartContent(e.target.value)}
                    placeholder={
                      chartInstrument === 'Keys'
                        ? `[Verse 1]\n@[Nord] Cmaj7  Fmaj7\n@[MODX] Am  G\n\n[Chorus]\n@[Nord] F  C  G  Am`
                        : `[Verse 1]\nChords or chart content here…\n\n[Chorus]\n…`
                    }
                    rows={16}
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition"
                  />
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-4 pb-6">
              <button onClick={() => navigate(-1)} className={btnGhost}>Cancel</button>
              <button
                onClick={handleChartSubmit}
                disabled={chartSubmitting || !chartInstrument}
                className={btnPrimary}
              >
                {chartSubmitting ? (
                  <span className="flex items-center gap-2"><Spinner />{isPrivileged ? 'Applying…' : 'Submitting…'}</span>
                ) : (
                  isPrivileged ? 'Apply Chart' : 'Submit for Review'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIBRARY EDITOR MODE
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col">
      <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Content Editor</h1>
          <p className="text-slate-400 text-sm">Songs &amp; Announcements</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('song')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'song' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'}`}
          >
            Song Editor
          </button>
          <button
            onClick={() => setMode('announcement')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'announcement' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'}`}
          >
            Announcement
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {mode === 'song' && (
          <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
            <div className="p-4 border-b border-slate-800">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search songs…"
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <div className="p-3 border-b border-slate-800">
              <button onClick={newSong} className={`${btnPrimary} w-full`}>+ New Song</button>
            </div>
            {songsLoading ? (
              <div className="flex items-center justify-center py-8"><Spinner /></div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {filteredSongs.length === 0 ? (
                  <p className="text-slate-500 text-xs text-center py-8">No songs found.</p>
                ) : (
                  filteredSongs.map((s) => {
                    const id = s.id || s._id;
                    const active = id === selectedSongId;
                    return (
                      <button
                        key={id}
                        onClick={() => selectSong(s)}
                        className={`w-full text-left px-4 py-3 border-b border-slate-800/50 transition ${active ? 'bg-indigo-600/20 border-l-2 border-l-indigo-500' : 'hover:bg-slate-800/50'}`}
                      >
                        <p className={`text-sm font-medium truncate ${active ? 'text-white' : 'text-slate-300'}`}>{s.title || 'Untitled'}</p>
                        <p className="text-slate-500 text-xs truncate">{s.artist || '—'}</p>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {mode === 'song' && (
            <div className="max-w-3xl mx-auto space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {selectedSongId ? `Editing: ${songForm.title || 'Song'}` : 'New Song'}
                </h2>
                <button onClick={handleSaveSong} disabled={songSaving} className={btnPrimary}>
                  {songSaving ? <span className="flex items-center gap-2"><Spinner />Saving…</span> : 'Save Song'}
                </button>
              </div>

              {songMsg && (
                <div className={`text-sm rounded-lg px-4 py-3 ${songMsg.startsWith('Error') ? 'bg-red-900/30 text-red-300 border border-red-800' : 'bg-emerald-900/30 text-emerald-300 border border-emerald-800'}`}>
                  {songMsg}
                </div>
              )}

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Song Info</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Title *</label>
                    <input type="text" value={songForm.title} onChange={(e) => setSongForm((f) => ({ ...f, title: e.target.value }))} placeholder="Song title" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Artist</label>
                    <input type="text" value={songForm.artist} onChange={(e) => setSongForm((f) => ({ ...f, artist: e.target.value }))} placeholder="Artist name" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Year</label>
                    <input type="number" value={songForm.year} onChange={(e) => setSongForm((f) => ({ ...f, year: e.target.value }))} placeholder="2024" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Key</label>
                    <select value={songForm.key} onChange={(e) => setSongForm((f) => ({ ...f, key: e.target.value }))} className={inputCls}>
                      <option value="">Select key…</option>
                      {MUSICAL_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Tempo (BPM)</label>
                    <input type="number" value={songForm.tempo} onChange={(e) => setSongForm((f) => ({ ...f, tempo: e.target.value }))} placeholder="120" min="40" max="240" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Time Signature</label>
                    <select value={songForm.timeSignature} onChange={(e) => setSongForm((f) => ({ ...f, timeSignature: e.target.value }))} className={inputCls}>
                      {TIME_SIGNATURES.map((ts) => <option key={ts} value={ts}>{ts}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Song Type</label>
                    <div className="flex gap-2">
                      {SONG_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSongForm((f) => ({ ...f, type: t }))}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${songForm.type === t ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'}`}
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Lyrics</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {SECTION_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertSectionTag(tag)}
                        className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded px-2 py-1 transition"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={songForm.lyrics}
                  onChange={(e) => setSongForm((f) => ({ ...f, lyrics: e.target.value }))}
                  placeholder={`[Verse 1]\nVerse lyrics here…\n\n[Chorus]\nChorus lyrics here…`}
                  rows={14}
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition"
                />
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Chord Chart</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Chart Key</label>
                    <select value={songForm.chordKey} onChange={(e) => setSongForm((f) => ({ ...f, chordKey: e.target.value }))} className={inputCls}>
                      <option value="">Select key…</option>
                      {MUSICAL_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Chord Progression</label>
                    <input type="text" value={songForm.chordProgression} onChange={(e) => setSongForm((f) => ({ ...f, chordProgression: e.target.value }))} placeholder="e.g. I - IV - vi - V" className={inputCls} />
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Media</h3>
                <div>
                  <label className={labelCls}>YouTube URL</label>
                  <input type="url" value={songForm.youtubeUrl} onChange={(e) => setSongForm((f) => ({ ...f, youtubeUrl: e.target.value }))} placeholder="https://youtube.com/watch?v=…" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Audio File</label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={handleOpenAudio} className={btnGhost}>Browse Audio…</button>
                    {songForm.audioPath && (
                      <span className="text-slate-400 text-xs truncate max-w-xs" title={songForm.audioPath}>
                        {songForm.audioPath.split('/').pop() || songForm.audioPath}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'announcement' && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">New Announcement</h2>
                <button onClick={handleSaveAnnouncement} disabled={announceSaving} className={btnPrimary}>
                  {announceSaving ? <span className="flex items-center gap-2"><Spinner />Publishing…</span> : 'Publish Announcement'}
                </button>
              </div>

              {announceMsg && (
                <div className={`text-sm rounded-lg px-4 py-3 ${announceMsg.startsWith('Error') ? 'bg-red-900/30 text-red-300 border border-red-800' : 'bg-emerald-900/30 text-emerald-300 border border-emerald-800'}`}>
                  {announceMsg}
                </div>
              )}

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <div>
                  <label className={labelCls}>Title *</label>
                  <input
                    type="text"
                    value={announceForm.title}
                    onChange={(e) => setAnnounceForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Announcement title…"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Body *</label>
                  <textarea
                    value={announceForm.body}
                    onChange={(e) => setAnnounceForm((f) => ({ ...f, body: e.target.value }))}
                    placeholder="Write your announcement here…"
                    rows={12}
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
