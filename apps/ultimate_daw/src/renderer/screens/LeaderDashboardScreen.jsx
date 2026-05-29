/**
 * LeaderDashboardScreen.jsx — Desktop (Electron/DAW)
 * For users with grantedRole === 'leader' (service planner).
 * Tabs: Calendar | Services | Team | Library
 *
 * Matches all features from mobile LeaderDashboardScreen.js
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { store } from '../services/store';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = ['Calendar', 'Services', 'Team', 'Library'];
const SERVICE_TYPES = ['standard', 'communion', 'easter', 'christmas', 'conference', 'youth', 'rehearsal'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { ...syncHeaders(), ...(opts.headers || {}) } });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ size = 5 }) {
  return (
    <svg className={`animate-spin h-${size} w-${size} text-indigo-400`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === 'pending_approval' || status === 'pending') {
    return <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs px-2 py-0.5 rounded-full font-medium">⏳ Pending Approval</span>;
  }
  if (status === 'approved') {
    return <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5 rounded-full font-medium">✓ Approved</span>;
  }
  if (status === 'rejected') {
    return <span className="inline-flex items-center gap-1 bg-red-500/15 text-red-400 border border-red-500/30 text-xs px-2 py-0.5 rounded-full font-medium">✗ Rejected</span>;
  }
  return <span className="inline-flex items-center gap-1 bg-slate-700/40 text-slate-400 border border-slate-600/30 text-xs px-2 py-0.5 rounded-full font-medium">{status || '—'}</span>;
}

// ── TypeBadge ─────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const colors = {
    standard: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    communion: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    easter: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    christmas: 'bg-red-500/10 text-red-400 border-red-500/20',
    conference: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    youth: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    rehearsal: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  const t = (type || 'standard').toLowerCase();
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[t] || colors.standard} font-medium capitalize`}>{t}</span>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-800">
          <h2 className="text-white font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── InlineCalendar ────────────────────────────────────────────────────────────
function InlineCalendar({ selectedDate, onSelect, serviceDates = [], blockoutDates = [] }) {
  const init = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date();
  const [viewYear, setViewYear] = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth());

  const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1);
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y + 1)) : setViewMonth(m => m + 1);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = todayStr();
  const cellKey = (d) => `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  const serviceSet = new Set(serviceDates);
  const blockoutSet = new Set(blockoutDates);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="text-indigo-400 hover:text-indigo-300 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 transition">‹</button>
        <span className="text-white font-semibold text-sm">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} className="text-indigo-400 hover:text-indigo-300 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 transition">›</button>
      </div>
      {/* Day names */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-slate-500 text-xs font-semibold py-1">{d}</div>
        ))}
      </div>
      {/* Cells */}
      {Array.from({ length: cells.length / 7 }).map((_, ri) => (
        <div key={ri} className="grid grid-cols-7">
          {cells.slice(ri * 7, ri * 7 + 7).map((day, ci) => {
            if (!day) return <div key={ci} className="aspect-square" />;
            const key = cellKey(day);
            const isSelected = key === selectedDate;
            const isToday = key === today;
            const isService = serviceSet.has(key);
            const isBlockout = blockoutSet.has(key);
            let cellCls = 'aspect-square flex flex-col items-center justify-center rounded-lg text-xs cursor-pointer transition m-0.5 ';
            if (isSelected) cellCls += 'bg-indigo-600 text-white font-bold';
            else if (isToday) cellCls += 'border border-indigo-500 text-indigo-400 font-semibold hover:bg-slate-800';
            else cellCls += 'text-slate-400 hover:bg-slate-800';
            return (
              <button key={ci} className={cellCls} onClick={() => onSelect(key)}>
                <span>{day}</span>
                {!isSelected && (isService || isBlockout) && (
                  <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isBlockout ? 'bg-red-400' : 'bg-emerald-400'}`} />
                )}
              </button>
            );
          })}
        </div>
      ))}
      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-800">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />Today
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Service
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Blockout
        </div>
      </div>
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#4F46E5','#7C3AED','#2563EB','#0891B2','#059669','#D97706','#DC2626','#9333EA'];
function Avatar({ name, size = 9 }) {
  const idx = (name || '?').charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <div
      className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}
      style={{ backgroundColor: AVATAR_COLORS[idx] }}
    >
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LeaderDashboardScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('Calendar');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Data
  const [allServices, setAllServices] = useState([]);
  const [pendingServices, setPendingServices] = useState([]);
  const [people, setPeople] = useState([]);
  const [songs, setSongs] = useState([]);
  const [pendingSongs, setPendingSongs] = useState([]);
  const [plans, setPlans] = useState({});
  const [blockoutDates, setBlockoutDates] = useState([]);
  const [pendingSetlists, setPendingSetlists] = useState([]);

  // Calendar
  const [selectedDate, setSelectedDate] = useState('');

  // Services tab
  const [showNewService, setShowNewService] = useState(false);
  const [newSvcForm, setNewSvcForm] = useState({ name: '', date: '', time: '', type: 'standard', notes: '' });
  const [savingSvc, setSavingSvc] = useState(false);
  const [svcMsg, setSvcMsg] = useState('');

  // Setlist editor modal
  const [setlistModal, setSetlistModal] = useState(null); // { svc, songs }
  const [setlistQuery, setSetlistQuery] = useState('');
  const [savingSetlist, setSavingSetlist] = useState(false);
  const [setlistMsg, setSetlistMsg] = useState('');

  // Team tab — add to service modal
  const [addToServiceModal, setAddToServiceModal] = useState(null); // { person }
  const [addServiceId, setAddServiceId] = useState('');
  const [addRole, setAddRole] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);

  // Library tab
  const [libQuery, setLibQuery] = useState('');
  const [showProposeSong, setShowProposeSong] = useState(false);
  const [songForm, setSongForm] = useState({ title: '', artist: '', year: '', key: '', bpm: '', genre: '', youtube: '', notes: '' });
  const [savingSong, setSavingSong] = useState(false);
  const [songMsg, setSongMsg] = useState('');

  const userEmail = user?.email || '';
  const userName = user?.name || user?.displayName || 'Service Planner';

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [lib, pSvcs, pSongs, pSetlists] = await Promise.all([
        fetchJson(`${SYNC_URL}/sync/library-pull`),
        fetchJson(`${SYNC_URL}/sync/services/pending`).catch(() => []),
        fetchJson(`${SYNC_URL}/sync/library/pending-songs`).catch(() => []),
        fetchJson(`${SYNC_URL}/sync/setlist/pending`).catch(() => []),
      ]);

      setAllServices(lib.services || []);
      setPeople(lib.people || []);
      setSongs(Array.isArray(lib.songs) ? lib.songs : Object.values(lib.songs || {}));
      setPlans(lib.plans || {});
      setBlockoutDates((lib.blockouts || []).map(b => b.date).filter(Boolean));

      const myEmail = userEmail.toLowerCase();
      setPendingServices(Array.isArray(pSvcs) ? pSvcs.filter(s => (s.created_by_email || '').toLowerCase() === myEmail) : []);
      setPendingSongs(Array.isArray(pSongs) ? pSongs.filter(s => (s.from_email || '').toLowerCase() === myEmail) : []);
      setPendingSetlists(Array.isArray(pSetlists) ? pSetlists.filter(s => (s?.submittedBy?.email || '').toLowerCase() === myEmail) : []);
    } catch (e) {
      setError(e.message || 'Server unreachable');
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => { loadAll(); }, [loadAll, refreshKey]);

  const refresh = () => setRefreshKey(k => k + 1);

  // ── My services (pending + approved) ──────────────────────────────────────
  const myEmail = userEmail.toLowerCase();
  const myApprovedServices = allServices.filter(sv => (sv.created_by_email || sv.submitted_by || '').toLowerCase() === myEmail);
  const allMyServices = [...pendingServices, ...myApprovedServices];

  // ── Propose Service ────────────────────────────────────────────────────────
  const handleProposeService = async (e) => {
    e.preventDefault();
    if (!newSvcForm.name.trim() || !newSvcForm.date.trim()) {
      setSvcMsg('Service name and date are required.');
      return;
    }
    setSavingSvc(true);
    setSvcMsg('');
    try {
      await fetchJson(`${SYNC_URL}/sync/services/propose`, {
        method: 'POST',
        body: JSON.stringify({
          name: newSvcForm.name.trim(),
          date: newSvcForm.date.trim(),
          time: newSvcForm.time.trim(),
          type: newSvcForm.type,
          notes: newSvcForm.notes.trim(),
          submittedBy: { email: userEmail, name: userName },
          created_by_email: userEmail,
          created_by_name: userName,
        }),
      });
      setSvcMsg('Service submitted for approval!');
      setNewSvcForm({ name: '', date: '', time: '', type: 'standard', notes: '' });
      setShowNewService(false);
      refresh();
    } catch (err) {
      setSvcMsg(`Error: ${err.message}`);
    } finally {
      setSavingSvc(false);
    }
  };

  // ── Setlist editor ─────────────────────────────────────────────────────────
  const openSetlist = (svc) => {
    const existing = plans[svc.id]?.songs || [];
    setSetlistModal({ svc, songs: existing.map(s => (typeof s === 'string' ? { id: s, title: s } : s)) });
    setSetlistQuery('');
    setSetlistMsg('');
  };

  const addToSetlist = (song) => {
    setSetlistModal(prev => {
      if (!prev) return prev;
      const already = prev.songs.find(s => (s.id || s.title) === (song.id || song.title));
      if (already) return prev;
      return { ...prev, songs: [...prev.songs, song] };
    });
  };

  const removeFromSetlist = (songId) => {
    setSetlistModal(prev => prev ? { ...prev, songs: prev.songs.filter(s => (s.id || s.title) !== songId) } : prev);
  };

  const moveSetlistSong = (idx, dir) => {
    setSetlistModal(prev => {
      if (!prev) return prev;
      const arr = [...prev.songs];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= arr.length) return prev;
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      return { ...prev, songs: arr };
    });
  };

  const handleSaveSetlist = async () => {
    if (!setlistModal) return;
    setSavingSetlist(true);
    setSetlistMsg('');
    try {
      const lib = await fetchJson(`${SYNC_URL}/sync/library-pull`);
      if (!lib.plans) lib.plans = {};
      if (!lib.plans[setlistModal.svc.id]) lib.plans[setlistModal.svc.id] = { songs: [], team: [], notes: '' };
      lib.plans[setlistModal.svc.id].songs = setlistModal.songs;
      await fetchJson(`${SYNC_URL}/sync/library-push`, { method: 'POST', body: JSON.stringify(lib) });
      setSetlistMsg('Setlist draft saved!');
      refresh();
    } catch (err) {
      setSetlistMsg(`Error: ${err.message}`);
    } finally {
      setSavingSetlist(false);
    }
  };

  const handleSubmitSetlist = async () => {
    if (!setlistModal) return;
    const { svc, songs: sl } = setlistModal;
    if (sl.length === 0) { setSetlistMsg('Add at least one song before submitting.'); return; }
    setSavingSetlist(true);
    setSetlistMsg('');
    try {
      await fetchJson(`${SYNC_URL}/sync/setlist/submit`, {
        method: 'POST',
        body: JSON.stringify({
          serviceId: svc.id,
          serviceName: svc.name || '',
          serviceDate: svc.date || '',
          serviceTime: svc.time || '',
          songs: sl,
          submittedBy: { email: userEmail, name: userName },
        }),
      });
      setSetlistMsg('Submitted for approval!');
      setSetlistModal(null);
      refresh();
    } catch (err) {
      setSetlistMsg(`Error: ${err.message}`);
    } finally {
      setSavingSetlist(false);
    }
  };

  // ── Add member to service ──────────────────────────────────────────────────
  const handleAddToService = async (e) => {
    e.preventDefault();
    if (!addServiceId || !addRole.trim()) { return; }
    setSavingAdd(true);
    try {
      const lib = await fetchJson(`${SYNC_URL}/sync/library-pull`);
      const plan = lib.plans?.[addServiceId] || { songs: [], team: [], notes: '' };
      const person = addToServiceModal;
      const already = (plan.team || []).some(t => (t.email || '').toLowerCase() === (person.email || '').toLowerCase());
      if (!already) {
        plan.team = [...(plan.team || []), {
          personId: person.id || person.email,
          email: person.email || '',
          name: person.name || '',
          role: addRole.trim(),
          status: 'pending',
        }];
      }
      lib.plans = { ...(lib.plans || {}), [addServiceId]: plan };
      await fetchJson(`${SYNC_URL}/sync/library-push`, { method: 'POST', body: JSON.stringify(lib) });
      setAddToServiceModal(null);
      setAddServiceId('');
      setAddRole('');
    } catch (err) {
      // silently handled — user can retry
    } finally {
      setSavingAdd(false);
    }
  };

  // ── Propose song ───────────────────────────────────────────────────────────
  const handleProposeSong = async (e) => {
    e.preventDefault();
    if (!songForm.title.trim()) { setSongMsg('Song title is required.'); return; }
    setSavingSong(true);
    setSongMsg('');
    try {
      await fetchJson(`${SYNC_URL}/sync/library/song-propose`, {
        method: 'POST',
        body: JSON.stringify({
          title: songForm.title.trim(),
          artist: songForm.artist.trim(),
          year: songForm.year.trim(),
          key: songForm.key.trim(),
          bpm: parseInt(songForm.bpm, 10) || 0,
          genre: songForm.genre.trim(),
          youtubeUrl: songForm.youtube.trim(),
          notes: songForm.notes.trim(),
          from_email: userEmail,
          from_name: userName,
        }),
      });
      setSongMsg('Song proposal submitted!');
      setSongForm({ title: '', artist: '', year: '', key: '', bpm: '', genre: '', youtube: '', notes: '' });
      setShowProposeSong(false);
      refresh();
    } catch (err) {
      setSongMsg(`Error: ${err.message}`);
    } finally {
      setSavingSong(false);
    }
  };

  // ── CSS classes ────────────────────────────────────────────────────────────
  const inputCls = 'w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition';
  const labelCls = 'block text-slate-400 text-xs font-medium mb-1.5';
  const btnPrimary = 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition';
  const btnSecondary = 'bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg px-4 py-2.5 border border-slate-700 transition';
  const btnGhost = 'text-slate-400 hover:text-white text-sm font-medium rounded-lg px-3 py-2 hover:bg-slate-800 transition';

  // ── Filtered setlist picker songs ──────────────────────────────────────────
  const setlistPickerSongs = songs.filter(sg => {
    if (!setlistQuery) return true;
    const q = setlistQuery.toLowerCase();
    return (sg.title || '').toLowerCase().includes(q) || (sg.artist || '').toLowerCase().includes(q);
  });

  // ── Calendar tab ──────────────────────────────────────────────────────────
  const renderCalendar = () => {
    const serviceDates = allServices.map(s => s.date).filter(Boolean);
    const svcOnDate = allServices.filter(s => s.date === selectedDate);
    return (
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <InlineCalendar
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            serviceDates={serviceDates}
            blockoutDates={blockoutDates}
          />
        </div>
        <div>
          <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
            {selectedDate ? `Services on ${selectedDate}` : 'Select a date'}
          </h3>
          {selectedDate ? (
            svcOnDate.length === 0 ? (
              <p className="text-slate-500 text-sm">No services on this date.</p>
            ) : (
              <div className="space-y-3">
                {svcOnDate.map(sv => (
                  <div key={sv.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <p className="text-white font-semibold text-sm">{sv.name}</p>
                    <p className="text-slate-400 text-xs mt-1">{sv.time || 'No time'} · {sv.serviceType || sv.type || 'standard'}</p>
                    <div className="mt-2"><TypeBadge type={sv.serviceType || sv.type} /></div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="text-slate-500 text-sm">Tap a date on the calendar to see services.</p>
          )}

          <div className="mt-6">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Upcoming Services</h3>
            <div className="space-y-2">
              {allServices.slice(0, 5).map(sv => (
                <div key={sv.id} className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-indigo-400 font-bold text-sm leading-none">{sv.date ? new Date(sv.date + 'T12:00').getDate() : '?'}</span>
                    <span className="text-indigo-300 text-xs">{sv.date ? new Date(sv.date + 'T12:00').toLocaleDateString('en', { month: 'short' }) : ''}</span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{sv.name}</p>
                    <p className="text-slate-500 text-xs">{sv.time || ''}</p>
                  </div>
                </div>
              ))}
              {allServices.length === 0 && <p className="text-slate-500 text-sm">No upcoming services.</p>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Services tab ──────────────────────────────────────────────────────────
  const renderServices = () => {
    const pendingSetlistMap = new Map(pendingSetlists.map(e => [e.serviceId, e]));
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold text-lg">My Services</h2>
          <button onClick={() => { setShowNewService(true); setSvcMsg(''); }} className={btnPrimary}>
            + Propose New Service
          </button>
        </div>

        {allMyServices.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-500">
            No services yet. Propose one above.
          </div>
        )}

        <div className="space-y-4">
          {allMyServices.map(sv => {
            const isPending = sv.status === 'pending_approval' || sv.status === 'pending';
            const isRejected = sv.status === 'rejected';
            const planSongs = plans[sv.id]?.songs || [];
            const pendingSetlist = pendingSetlistMap.get(sv.id);
            return (
              <div key={sv.id} className={`bg-slate-900 border rounded-xl p-5 ${isRejected ? 'border-red-800/50' : isPending ? 'border-amber-800/30' : 'border-slate-800'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-semibold">{sv.name}</h3>
                      <TypeBadge type={sv.serviceType || sv.type} />
                    </div>
                    <p className="text-slate-400 text-sm mt-1">
                      {sv.date || 'No date'}{sv.time ? ` · ${sv.time}` : ''}
                    </p>
                    {isRejected && sv.rejectReason && (
                      <p className="text-red-400 text-xs mt-1">✗ Rejected: {sv.rejectReason}</p>
                    )}
                  </div>
                  <StatusBadge status={sv.status || (isPending ? 'pending' : 'approved')} />
                </div>

                {!isPending && (
                  <div className="mt-4 space-y-2">
                    {pendingSetlist && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
                        <p className="text-amber-400 text-xs font-semibold">⏳ Awaiting approval</p>
                        <p className="text-slate-400 text-xs mt-0.5">
                          Submitted {pendingSetlist.submittedAt ? new Date(pendingSetlist.submittedAt).toLocaleString() : 'just now'}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => openSetlist(sv)}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg py-2.5 transition border border-slate-700"
                      >
                        Edit Setlist ({planSongs.length} songs)
                      </button>
                      <button
                        onClick={() => { setSetlistModal({ svc: sv, songs: (plans[sv.id]?.songs || []).map(s => typeof s === 'string' ? { id: s, title: s } : s) }); handleSubmitSetlist(); }}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg py-2.5 transition"
                      >
                        {pendingSetlist ? '↻ Re-submit' : 'Submit for Approval'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Team tab ──────────────────────────────────────────────────────────────
  const renderTeam = () => {
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold text-lg">Team Members ({people.length})</h2>
          <button onClick={refresh} className={btnSecondary}>↻ Refresh</button>
        </div>

        {people.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-500">
            No team members found.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {people.map(person => {
            // Check if already in any of my services
            const inAService = myApprovedServices.some(sv =>
              (plans[sv.id]?.team || []).some(t => (t.email || '').toLowerCase() === (person.email || '').toLowerCase())
            );
            return (
              <div key={person.id || person.email} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                <Avatar name={person.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium text-sm truncate">{person.name}</p>
                    {inAService && <span className="text-emerald-400 text-xs">✓</span>}
                  </div>
                  <p className="text-slate-500 text-xs truncate">{person.email}</p>
                  {person.role && <p className="text-indigo-400 text-xs mt-0.5">{person.role}</p>}
                </div>
                <button
                  onClick={() => {
                    setAddToServiceModal(person);
                    setAddServiceId(myApprovedServices[0]?.id || '');
                    setAddRole('');
                  }}
                  className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 text-xs font-semibold rounded-lg px-3 py-1.5 border border-indigo-500/30 transition flex-shrink-0"
                >
                  + Add
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Library tab ───────────────────────────────────────────────────────────
  const renderLibrary = () => {
    const filtered = songs.filter(sg => {
      if (!libQuery) return true;
      const q = libQuery.toLowerCase();
      return (sg.title || '').toLowerCase().includes(q) || (sg.artist || '').toLowerCase().includes(q);
    });
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold text-lg">Song Library</h2>
          <button onClick={() => { setShowProposeSong(true); setSongMsg(''); }} className={btnPrimary}>
            + Propose New Song
          </button>
        </div>

        {/* Pending proposals */}
        {pendingSongs.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-5">
            <h3 className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">
              ⏳ Your Pending Proposals ({pendingSongs.length})
            </h3>
            <div className="space-y-2">
              {pendingSongs.map(ps => (
                <div key={ps.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <div>
                    <p className="text-white text-sm font-medium">{ps.title}</p>
                    <p className="text-slate-400 text-xs">{ps.artist || 'Unknown'} · {ps.key || '?'} · {ps.bpm ? `${ps.bpm} BPM` : ''}</p>
                    {ps.status === 'rejected' && (
                      <p className="text-red-400 text-xs mt-0.5">✗ Rejected{ps.rejectReason ? `: ${ps.rejectReason}` : ''}</p>
                    )}
                  </div>
                  <span className="text-amber-400 text-xs font-medium">⏳ Awaiting Approval</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <input
            type="text"
            value={libQuery}
            onChange={e => setLibQuery(e.target.value)}
            placeholder="Search by title or artist…"
            className={inputCls}
          />
        </div>

        <p className="text-slate-500 text-xs mb-3">Showing {filtered.length} songs</p>

        {/* Song cards */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                <th className="text-left px-5 py-3">Title</th>
                <th className="text-left px-5 py-3">Artist</th>
                <th className="text-left px-5 py-3">Key</th>
                <th className="text-left px-5 py-3">BPM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="text-center text-slate-500 py-10">No songs found.</td></tr>
              )}
              {filtered.map(sg => (
                <tr
                  key={sg.id || sg.title}
                  className="hover:bg-slate-800/40 transition cursor-pointer"
                  onClick={() => navigate('/lyrics', { state: { song: sg } })}
                  title="Open song"
                >
                  <td className="px-5 py-3.5 text-white font-medium">{sg.title || '—'}</td>
                  <td className="px-5 py-3.5 text-slate-300">{sg.artist || '—'}</td>
                  <td className="px-5 py-3.5 text-slate-400">{sg.key || '—'}</td>
                  <td className="px-5 py-3.5 text-slate-400">{sg.bpm ? `${sg.bpm} BPM` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Services Workspace</h1>
          <p className="text-slate-400 text-sm">{userName}</p>
        </div>
        <button onClick={refresh} className={btnGhost} title="Refresh">↻ Refresh</button>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-slate-800 px-6 flex-shrink-0">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-6 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner size={8} /></div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={refresh} className={btnSecondary}>Retry</button>
          </div>
        ) : (
          <>
            {activeTab === 'Calendar' && renderCalendar()}
            {activeTab === 'Services' && renderServices()}
            {activeTab === 'Team' && renderTeam()}
            {activeTab === 'Library' && renderLibrary()}
          </>
        )}
      </div>

      {/* ── Propose Service Modal ─────────────────────────────────────────── */}
      <Modal open={showNewService} onClose={() => setShowNewService(false)} title="Propose New Service">
        <p className="text-slate-400 text-sm mb-5">Will be submitted for Admin / Worship Leader approval.</p>
        <form onSubmit={handleProposeService} className="space-y-4">
          <div>
            <label className={labelCls}>Service Name *</label>
            <input type="text" placeholder="e.g. Sunday Morning Service" value={newSvcForm.name}
              onChange={e => setNewSvcForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" value={newSvcForm.date}
                onChange={e => setNewSvcForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Time</label>
              <input type="time" value={newSvcForm.time}
                onChange={e => setNewSvcForm(f => ({ ...f, time: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {SERVICE_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewSvcForm(f => ({ ...f, type: t }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition capitalize ${
                    newSvcForm.type === t
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea rows={3} placeholder="Optional notes…" value={newSvcForm.notes}
              onChange={e => setNewSvcForm(f => ({ ...f, notes: e.target.value }))}
              className={`${inputCls} resize-none`} />
          </div>
          {svcMsg && (
            <p className={`text-sm ${svcMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{svcMsg}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowNewService(false)} className={`${btnSecondary} flex-1`}>Cancel</button>
            <button type="submit" disabled={savingSvc} className={`${btnPrimary} flex-2 flex-1`}>
              {savingSvc ? 'Submitting…' : 'Send for Approval'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Setlist Editor Modal ──────────────────────────────────────────── */}
      <Modal
        open={!!setlistModal}
        onClose={() => setSetlistModal(null)}
        title={`Setlist — ${setlistModal?.svc?.name || ''}`}
      >
        {setlistModal && (
          <div className="space-y-4">
            {/* Current setlist */}
            {setlistModal.songs.length > 0 && (
              <div>
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Current Setlist</h3>
                <div className="space-y-1">
                  {setlistModal.songs.map((sg, idx) => (
                    <div key={sg.id || idx} className="flex items-center gap-3 bg-slate-800 rounded-lg px-3 py-2.5">
                      <span className="text-slate-500 text-xs font-mono w-5">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{sg.title || sg}</p>
                        {sg.artist && <p className="text-slate-400 text-xs">{sg.artist}</p>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => moveSetlistSong(idx, -1)} disabled={idx === 0}
                          className="text-slate-400 hover:text-white disabled:opacity-30 text-xs px-1.5 py-1 rounded transition">▲</button>
                        <button onClick={() => moveSetlistSong(idx, 1)} disabled={idx === setlistModal.songs.length - 1}
                          className="text-slate-400 hover:text-white disabled:opacity-30 text-xs px-1.5 py-1 rounded transition">▼</button>
                        <button onClick={() => removeFromSetlist(sg.id || sg.title)}
                          className="text-red-400 hover:text-red-300 text-xs px-1.5 py-1 rounded transition">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Song picker */}
            <div>
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Add Songs from Library</h3>
              <input
                type="text"
                placeholder="Search songs…"
                value={setlistQuery}
                onChange={e => setSetlistQuery(e.target.value)}
                className={inputCls}
              />
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {setlistPickerSongs.map(sg => (
                  <button
                    key={sg.id || sg.title}
                    onClick={() => addToSetlist(sg)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition text-left"
                  >
                    <div>
                      <p className="text-white text-sm">{sg.title}</p>
                      <p className="text-slate-400 text-xs">{sg.artist || 'Unknown'}</p>
                    </div>
                    <span className="text-indigo-400 text-xs">+ Add</span>
                  </button>
                ))}
              </div>
            </div>

            {setlistMsg && (
              <p className={`text-sm ${setlistMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{setlistMsg}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setSetlistModal(null)} className={`${btnSecondary} flex-1`}>Cancel</button>
              <button onClick={handleSaveSetlist} disabled={savingSetlist} className={`${btnSecondary} flex-1`}>
                {savingSetlist ? 'Saving…' : 'Save Draft'}
              </button>
              <button onClick={handleSubmitSetlist} disabled={savingSetlist} className={`${btnPrimary} flex-1`}>
                {savingSetlist ? 'Submitting…' : 'Submit for Approval'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Add to Service Modal ──────────────────────────────────────────── */}
      <Modal
        open={!!addToServiceModal}
        onClose={() => setAddToServiceModal(null)}
        title={`Add ${addToServiceModal?.name || ''} to Service`}
      >
        <form onSubmit={handleAddToService} className="space-y-4">
          <div>
            <label className={labelCls}>Service</label>
            <select value={addServiceId} onChange={e => setAddServiceId(e.target.value)} className={inputCls}>
              <option value="">Select service…</option>
              {myApprovedServices.map(sv => (
                <option key={sv.id} value={sv.id}>{sv.name} ({sv.date || '?'})</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Role</label>
            <input type="text" placeholder="e.g. Lead Vocal, Keys, Drums" value={addRole}
              onChange={e => setAddRole(e.target.value)} className={inputCls} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setAddToServiceModal(null)} className={`${btnSecondary} flex-1`}>Cancel</button>
            <button type="submit" disabled={savingAdd || !addServiceId || !addRole.trim()} className={`${btnPrimary} flex-1`}>
              {savingAdd ? 'Adding…' : 'Add to Service'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Propose Song Modal ────────────────────────────────────────────── */}
      <Modal open={showProposeSong} onClose={() => setShowProposeSong(false)} title="Propose New Song">
        <p className="text-slate-400 text-sm mb-5">Will be submitted for Admin / Worship Leader approval before appearing in the library.</p>
        <form onSubmit={handleProposeSong} className="space-y-4">
          <div>
            <label className={labelCls}>Title *</label>
            <input type="text" placeholder="Song title" value={songForm.title}
              onChange={e => setSongForm(f => ({ ...f, title: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Artist</label>
              <input type="text" placeholder="Artist name" value={songForm.artist}
                onChange={e => setSongForm(f => ({ ...f, artist: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Year</label>
              <input type="text" placeholder="e.g. 2022" value={songForm.year}
                onChange={e => setSongForm(f => ({ ...f, year: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Key</label>
              <input type="text" placeholder="G, Ab…" value={songForm.key}
                onChange={e => setSongForm(f => ({ ...f, key: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>BPM</label>
              <input type="number" placeholder="120" value={songForm.bpm}
                onChange={e => setSongForm(f => ({ ...f, bpm: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Genre</label>
              <input type="text" placeholder="Worship…" value={songForm.genre}
                onChange={e => setSongForm(f => ({ ...f, genre: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>YouTube URL</label>
            <input type="url" placeholder="https://youtube.com/…" value={songForm.youtube}
              onChange={e => setSongForm(f => ({ ...f, youtube: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea rows={2} placeholder="Optional notes…" value={songForm.notes}
              onChange={e => setSongForm(f => ({ ...f, notes: e.target.value }))}
              className={`${inputCls} resize-none`} />
          </div>
          {songMsg && (
            <p className={`text-sm ${songMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{songMsg}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowProposeSong(false)} className={`${btnSecondary} flex-1`}>Cancel</button>
            <button type="submit" disabled={savingSong} className={`${btnPrimary} flex-1`}>
              {savingSong ? 'Submitting…' : 'Submit Proposal'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
