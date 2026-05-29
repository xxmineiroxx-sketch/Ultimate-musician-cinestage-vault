/**
 * AdminDashboardScreen.jsx — Desktop (Electron/DAW)
 * Tabs: Team | Services | Songs | Analytics
 *
 * Matches all features from mobile AdminDashboardScreen.js
 * Full access: grant roles, approve/reject services & songs, manage members,
 * create services, create assignments, send announcements.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../App';
import { store } from '../services/store';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = ['Team', 'Services', 'Songs', 'Analytics'];
const SERVICE_TYPES = ['standard', 'communion', 'easter', 'christmas', 'conference', 'youth', 'rehearsal'];
const GRANT_ROLES = [
  { value: 'none', label: 'Remove Access' },
  { value: 'leader', label: 'Worship Leader' },
  { value: 'md', label: 'Music Director' },
  { value: 'admin', label: 'Admin' },
];
const AVATAR_COLORS = ['#4F46E5','#7C3AED','#2563EB','#0891B2','#059669','#D97706','#DC2626','#9333EA'];

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

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 10 }) {
  const idx = (name || '?').charCodeAt(0) % AVATAR_COLORS.length;
  const sz = `w-${size} h-${size}`;
  return (
    <div className={`${sz} rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}
      style={{ backgroundColor: AVATAR_COLORS[idx] }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color}`}>{icon}</div>
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-white text-2xl font-bold mt-0.5">{value ?? '—'}</p>
      </div>
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === 'pending_approval' || status === 'pending') {
    return <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs px-2 py-0.5 rounded-full font-medium">⏳ Pending</span>;
  }
  if (status === 'approved') {
    return <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5 rounded-full font-medium">✓ Approved</span>;
  }
  if (status === 'rejected') {
    return <span className="inline-flex items-center gap-1 bg-red-500/15 text-red-400 border border-red-500/30 text-xs px-2 py-0.5 rounded-full font-medium">✗ Rejected</span>;
  }
  return <span className="inline-flex items-center gap-1 bg-slate-700/40 text-slate-400 border border-slate-600/30 text-xs px-2 py-0.5 rounded-full font-medium">{status || '—'}</span>;
}

// ── RoleBadge ─────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const map = {
    admin: 'bg-red-500/15 text-red-400 border-red-500/30',
    org_owner: 'bg-red-500/15 text-red-400 border-red-500/30',
    md: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    manager: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    leader: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  };
  const labels = {
    admin: 'Admin', org_owner: 'Org Owner', md: 'Music Director', manager: 'Worship Leader', leader: 'Worship Leader',
  };
  const r = (role || '').toLowerCase();
  if (!r || r === 'none') return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[r] || 'bg-slate-700/40 text-slate-400 border-slate-600/30'}`}>
      {labels[r] || role}
    </span>
  );
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
function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className={`bg-slate-900 border border-slate-700 rounded-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-2xl ${wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-800">
          <h2 className="text-white font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl p-6">
        <h3 className="text-white font-bold text-base mb-2">{title}</h3>
        {message && <p className="text-slate-400 text-sm mb-6">{message}</p>}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg px-4 py-2.5 border border-slate-700 transition">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RejectReasonDialog ────────────────────────────────────────────────────────
function RejectReasonDialog({ open, title, onReject, onCancel }) {
  const [reason, setReason] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl p-6">
        <h3 className="text-white font-bold text-base mb-4">{title}</h3>
        <label className="block text-slate-400 text-xs font-medium mb-1.5">Reason (optional)</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="Explain why this is being rejected…"
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-red-500 transition mb-4"
        />
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg px-4 py-2.5 border border-slate-700 transition">Cancel</button>
          <button onClick={() => { onReject(reason.trim()); setReason(''); }} className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition">Reject</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminDashboardScreen() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('Team');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Core data
  const [members, setMembers] = useState([]);
  const [services, setServices] = useState([]);
  const [pendingServices, setPendingServices] = useState([]);
  const [songs, setSongs] = useState([]);
  const [pendingSongs, setPendingSongs] = useState([]);
  const [plans, setPlans] = useState({});
  const [stats, setStats] = useState({});

  // Team tab state
  const [memberSearch, setMemberSearch] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: '' });
  const [savingInvite, setSavingInvite] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [grantingRole, setGrantingRole] = useState({}); // { [email]: true }
  const [confirmDelete, setConfirmDelete] = useState(null); // member to delete
  const [deletingMember, setDeletingMember] = useState(false);

  // Services tab state
  const [showNewService, setShowNewService] = useState(false);
  const [newSvcForm, setNewSvcForm] = useState({ name: '', date: '', time: '', location: '', type: 'standard', theme: '', notes: '' });
  const [savingSvc, setSavingSvc] = useState(false);
  const [svcMsg, setSvcMsg] = useState('');
  const [approvingSvcId, setApprovingSvcId] = useState(null);
  const [rejectSvcTarget, setRejectSvcTarget] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(null); // service
  const [assignForm, setAssignForm] = useState({ memberId: '', role: '' });
  const [savingAssign, setSavingAssign] = useState(false);
  const [assignMsg, setAssignMsg] = useState('');

  // Songs tab state
  const [songSearch, setSongSearch] = useState('');
  const [editSong, setEditSong] = useState(null); // song being edited
  const [savingEditSong, setSavingEditSong] = useState(false);
  const [editSongMsg, setEditSongMsg] = useState('');
  const [approvingSongId, setApprovingSongId] = useState(null);
  const [rejectSongTarget, setRejectSongTarget] = useState(null);
  // Announcement modal
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [announceForm, setAnnounceForm] = useState({ title: '', body: '', audience: 'all' });
  const [savingAnnounce, setSavingAnnounce] = useState(false);
  const [announceMsg, setAnnounceMsg] = useState('');

  const userName = user?.name || user?.displayName || 'Admin';
  const userEmail = user?.email || '';

  const refresh = () => setRefreshKey(k => k + 1);

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [lib, teamRes, statsRes, pSvcs, pSongs] = await Promise.all([
        fetchJson(`${SYNC_URL}/sync/library-pull`),
        fetchJson(`${SYNC_URL}/sync/admin/team-members`).catch(() => null),
        fetchJson(`${SYNC_URL}/sync/admin/stats`).catch(() => ({})),
        fetchJson(`${SYNC_URL}/sync/services/pending`).catch(() => []),
        fetchJson(`${SYNC_URL}/sync/library/pending-songs`).catch(() => []),
      ]);

      // Members: prefer dedicated endpoint, fall back to library people
      const rawMembers = teamRes
        ? (Array.isArray(teamRes) ? teamRes : teamRes.members || teamRes.people || [])
        : (lib.people || []);
      setMembers(rawMembers);

      setServices(lib.services || []);
      setSongs(Array.isArray(lib.songs) ? lib.songs : Object.values(lib.songs || {}));
      setPlans(lib.plans || {});
      setStats(statsRes || {});
      setPendingServices(Array.isArray(pSvcs) ? pSvcs.filter(s => s.status === 'pending_approval' || s.status === 'pending') : []);
      setPendingSongs(Array.isArray(pSongs) ? pSongs.filter(s => s.status === 'pending' || !s.status) : []);
    } catch (e) {
      setError(e.message || 'Server unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll, refreshKey]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const today = todayStr();
  const totalMembers = members.length;
  const activeToday = members.filter(m => m.lastSeen && m.lastSeen.startsWith(today)).length;
  const pendingResponses = members.filter(m => m.assignmentStatus === 'pending').length;
  const onlineNow = members.filter(m => (m.status || '').toLowerCase() === 'online' || (m.heartbeat && Date.now() - new Date(m.heartbeat).getTime() < 5 * 60 * 1000)).length;

  // ── Grant role ─────────────────────────────────────────────────────────────
  const handleGrantRole = async (member, role) => {
    setGrantingRole(prev => ({ ...prev, [member.email]: true }));
    try {
      await fetchJson(`${SYNC_URL}/sync/role/grant`, {
        method: 'POST',
        body: JSON.stringify({ email: member.email, role }),
      });
      setMembers(prev => prev.map(m => m.email === member.email ? { ...m, grantedRole: role } : m));
    } catch (err) {
      // silently update UI — user can retry
    } finally {
      setGrantingRole(prev => ({ ...prev, [member.email]: false }));
    }
  };

  // ── Remove member ──────────────────────────────────────────────────────────
  const handleDeleteMember = async () => {
    if (!confirmDelete) return;
    setDeletingMember(true);
    try {
      await fetchJson(`${SYNC_URL}/sync/admin/team-members/${encodeURIComponent(confirmDelete.id || confirmDelete.email)}`, {
        method: 'DELETE',
      });
      setMembers(prev => prev.filter(m => m.email !== confirmDelete.email && m.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err) {
      // fall back to local removal if endpoint doesn't exist yet
      setMembers(prev => prev.filter(m => m.email !== confirmDelete.email && m.id !== confirmDelete.id));
      setConfirmDelete(null);
    } finally {
      setDeletingMember(false);
    }
  };

  // ── Invite member ──────────────────────────────────────────────────────────
  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
      setInviteMsg('Name and email are required.');
      return;
    }
    setSavingInvite(true);
    setInviteMsg('');
    try {
      await fetchJson(`${SYNC_URL}/sync/invite`, {
        method: 'POST',
        body: JSON.stringify({
          name: inviteForm.name.trim(),
          email: inviteForm.email.trim().toLowerCase(),
          role: inviteForm.role.trim(),
          invitedByName: userName,
          sendEmail: true,
        }),
      });
      setInviteMsg('Invitation sent!');
      setInviteForm({ name: '', email: '', role: '' });
      setShowInviteForm(false);
      refresh();
    } catch (err) {
      setInviteMsg(`Error: ${err.message}`);
    } finally {
      setSavingInvite(false);
    }
  };

  // ── Create service ─────────────────────────────────────────────────────────
  const handleCreateService = async (e) => {
    e.preventDefault();
    if (!newSvcForm.name.trim() || !newSvcForm.date.trim()) {
      setSvcMsg('Service name and date are required.');
      return;
    }
    setSavingSvc(true);
    setSvcMsg('');
    try {
      await fetchJson(`${SYNC_URL}/sync/admin/services`, {
        method: 'POST',
        body: JSON.stringify({
          name: newSvcForm.name.trim(),
          date: newSvcForm.date.trim(),
          time: newSvcForm.time.trim(),
          location: newSvcForm.location.trim(),
          type: newSvcForm.type,
          theme: newSvcForm.theme.trim(),
          notes: newSvcForm.notes.trim(),
        }),
      });
      setSvcMsg('Service created!');
      setNewSvcForm({ name: '', date: '', time: '', location: '', type: 'standard', theme: '', notes: '' });
      setShowNewService(false);
      refresh();
    } catch (err) {
      setSvcMsg(`Error: ${err.message}`);
    } finally {
      setSavingSvc(false);
    }
  };

  // ── Approve/Reject pending service ────────────────────────────────────────
  const handleApproveService = async (svc) => {
    setApprovingSvcId(svc.id);
    try {
      await fetchJson(`${SYNC_URL}/sync/services/approve?id=${encodeURIComponent(svc.id)}`, { method: 'POST' });
      setPendingServices(prev => prev.filter(s => s.id !== svc.id));
      refresh();
    } catch (err) {
      // silently handled
    } finally {
      setApprovingSvcId(null);
    }
  };

  const handleRejectService = async (reason) => {
    if (!rejectSvcTarget) return;
    try {
      await fetchJson(`${SYNC_URL}/sync/services/reject?id=${encodeURIComponent(rejectSvcTarget.id)}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setPendingServices(prev => prev.filter(s => s.id !== rejectSvcTarget.id));
    } catch (err) {
      // silently handled
    } finally {
      setRejectSvcTarget(null);
    }
  };

  // ── Create assignment ──────────────────────────────────────────────────────
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!showAssignModal || !assignForm.memberId || !assignForm.role.trim()) {
      setAssignMsg('Member and role are required.');
      return;
    }
    setSavingAssign(true);
    setAssignMsg('');
    try {
      const member = members.find(m => (m.id || m.email) === assignForm.memberId);
      await fetchJson(`${SYNC_URL}/sync/assignment/create`, {
        method: 'POST',
        body: JSON.stringify({
          serviceId: showAssignModal.id,
          serviceName: showAssignModal.name,
          memberId: assignForm.memberId,
          email: member?.email || '',
          name: member?.name || '',
          role: assignForm.role.trim(),
        }),
      });
      setAssignMsg('Assignment created!');
      setAssignForm({ memberId: '', role: '' });
      refresh();
    } catch (err) {
      setAssignMsg(`Error: ${err.message}`);
    } finally {
      setSavingAssign(false);
    }
  };

  // ── Approve/Reject pending song ───────────────────────────────────────────
  const handleApproveSong = async (song) => {
    setApprovingSongId(song.id);
    try {
      await fetchJson(`${SYNC_URL}/sync/library/song-approve?id=${encodeURIComponent(song.id)}`, { method: 'POST' });
      setPendingSongs(prev => prev.filter(s => s.id !== song.id));
      refresh();
    } catch (err) {
      // silently handled
    } finally {
      setApprovingSongId(null);
    }
  };

  const handleRejectSong = async (reason) => {
    if (!rejectSongTarget) return;
    try {
      await fetchJson(`${SYNC_URL}/sync/library/song-reject?id=${encodeURIComponent(rejectSongTarget.id)}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setPendingSongs(prev => prev.filter(s => s.id !== rejectSongTarget.id));
    } catch (err) {
      // silently handled
    } finally {
      setRejectSongTarget(null);
    }
  };

  // ── Send announcement ──────────────────────────────────────────────────────
  const handleAnnounce = async (e) => {
    e.preventDefault();
    if (!announceForm.title.trim() && !announceForm.body.trim()) {
      setAnnounceMsg('Title or body is required.');
      return;
    }
    setSavingAnnounce(true);
    setAnnounceMsg('');
    try {
      await fetchJson(`${SYNC_URL}/sync/admin/announce`, {
        method: 'POST',
        body: JSON.stringify({
          title: announceForm.title.trim(),
          body: announceForm.body.trim(),
          audience: announceForm.audience,
          sentBy: userEmail,
        }),
      });
      setAnnounceMsg('Announcement sent!');
      setAnnounceForm({ title: '', body: '', audience: 'all' });
      setShowAnnounce(false);
    } catch (err) {
      setAnnounceMsg(`Error: ${err.message}`);
    } finally {
      setSavingAnnounce(false);
    }
  };

  // ── Save edited song ───────────────────────────────────────────────────────
  const handleSaveEditSong = async (e) => {
    e.preventDefault();
    if (!editSong) return;
    setSavingEditSong(true);
    setEditSongMsg('');
    try {
      const lib = await fetchJson(`${SYNC_URL}/sync/library-pull`);
      const songsObj = lib.songs || {};
      const updatedSongs = Array.isArray(songsObj)
        ? songsObj.map(s => (s.id === editSong.id ? editSong : s))
        : { ...songsObj, [editSong.id]: editSong };
      lib.songs = updatedSongs;
      await fetchJson(`${SYNC_URL}/sync/library-push`, { method: 'POST', body: JSON.stringify(lib) });
      setEditSongMsg('Song updated!');
      setSongs(prev => prev.map(s => s.id === editSong.id ? editSong : s));
      setEditSong(null);
    } catch (err) {
      setEditSongMsg(`Error: ${err.message}`);
    } finally {
      setSavingEditSong(false);
    }
  };

  // ── CSS classes ────────────────────────────────────────────────────────────
  const inputCls = 'w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition';
  const labelCls = 'block text-slate-400 text-xs font-medium mb-1.5';
  const btnPrimary = 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition';
  const btnSecondary = 'bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg px-4 py-2.5 border border-slate-700 transition';
  const btnDanger = 'bg-red-900/30 hover:bg-red-900/50 text-red-400 text-xs font-medium rounded-lg px-3 py-1.5 border border-red-800/50 transition';
  const btnApprove = 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs font-semibold rounded-lg px-3 py-1.5 border border-emerald-500/30 transition disabled:opacity-50';
  const btnReject = 'bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs font-semibold rounded-lg px-3 py-1.5 border border-red-500/30 transition';

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filteredMembers = members.filter(m => {
    if (!memberSearch) return true;
    const q = memberSearch.toLowerCase();
    return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
  });
  const filteredSongs = songs.filter(sg => {
    if (!songSearch) return true;
    const q = songSearch.toLowerCase();
    return (sg.title || '').toLowerCase().includes(q) || (sg.artist || '').toLowerCase().includes(q) || (sg.key || '').toLowerCase().includes(q);
  });

  // ── TEAM TAB ──────────────────────────────────────────────────────────────
  const renderTeam = () => (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Members" value={totalMembers} icon="👥" color="bg-indigo-500/10" />
        <StatCard label="Active Today" value={activeToday} icon="📅" color="bg-emerald-500/10" />
        <StatCard label="Pending Responses" value={pendingResponses} icon="📋" color="bg-amber-500/10" />
        <StatCard label="Online Now" value={onlineNow} icon="🟢" color="bg-cyan-500/10" />
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between mb-5">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={memberSearch}
            onChange={e => setMemberSearch(e.target.value)}
            placeholder="Search members…"
            className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} className={btnSecondary}>↻ Refresh</button>
          <button onClick={() => { setShowInviteForm(true); setInviteMsg(''); }} className={btnPrimary}>
            + Invite Member
          </button>
        </div>
      </div>

      {/* Member cards */}
      {filteredMembers.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-500">
          No members found.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMembers.map(m => {
            const lastSeenAgo = timeAgo(m.lastSeen || m.heartbeat);
            const isOnline = (m.status || '').toLowerCase() === 'online'
              || (m.heartbeat && Date.now() - new Date(m.heartbeat).getTime() < 5 * 60 * 1000);
            return (
              <div key={m.id || m.email} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                <Avatar name={m.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-semibold text-sm">{m.name || '—'}</p>
                    {m.role && <span className="text-slate-400 text-xs">· {m.role}</span>}
                    <RoleBadge role={m.grantedRole} />
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5">{m.email || '—'}</p>
                  {m.phone && <p className="text-slate-500 text-xs">{m.phone}</p>}
                </div>
                {/* Heartbeat status */}
                <div className="flex-shrink-0 text-right">
                  {isOnline ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />✓ Ready
                    </span>
                  ) : lastSeenAgo ? (
                    <span className="text-slate-500 text-xs">⏱ Last seen {lastSeenAgo}</span>
                  ) : (
                    <span className="text-slate-600 text-xs">Never seen</span>
                  )}
                </div>
                {/* Grant Role */}
                <div className="flex-shrink-0">
                  <select
                    value={m.grantedRole || 'none'}
                    onChange={e => handleGrantRole(m, e.target.value)}
                    disabled={grantingRole[m.email]}
                    className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 transition disabled:opacity-50"
                  >
                    {GRANT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                {/* Remove */}
                <button
                  onClick={() => setConfirmDelete(m)}
                  className={`${btnDanger} flex-shrink-0`}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── SERVICES TAB ──────────────────────────────────────────────────────────
  const renderServices = () => {
    const upcoming = services.filter(s => !s.date || s.date >= today);
    const past = services.filter(s => s.date && s.date < today);
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold text-lg">Services</h2>
          <button onClick={() => { setShowNewService(true); setSvcMsg(''); }} className={btnPrimary}>
            + Create New Service
          </button>
        </div>

        {/* Pending leader proposals */}
        {pendingServices.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 mb-6">
            <h3 className="text-amber-400 text-sm font-semibold mb-4">
              ⏳ Pending Leader Proposals ({pendingServices.length})
            </h3>
            <div className="space-y-3">
              {pendingServices.map(svc => (
                <div key={svc.id} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-4 py-3 gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">{svc.name}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {svc.date || '?'}{svc.time ? ` · ${svc.time}` : ''} · by {svc.created_by_name || svc.submittedBy?.name || 'Leader'}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApproveService(svc)}
                      disabled={approvingSvcId === svc.id}
                      className={btnApprove}
                    >
                      {approvingSvcId === svc.id ? <Spinner size={3} /> : '✓ Approve'}
                    </button>
                    <button onClick={() => setRejectSvcTarget(svc)} className={btnReject}>✗ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming services */}
        <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Upcoming ({upcoming.length})</h3>
        {upcoming.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-500 mb-4">
            No upcoming services. Create one above.
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Name</th>
                  <th className="text-left px-5 py-3">Date / Time</th>
                  <th className="text-left px-5 py-3">Type</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Team</th>
                  <th className="text-left px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {upcoming.map(svc => {
                  const team = plans[svc.id]?.team || [];
                  return (
                    <tr key={svc.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5 text-white font-medium">{svc.name || '—'}</td>
                      <td className="px-5 py-3.5 text-slate-300">
                        {svc.date || '?'}{svc.time ? ` · ${svc.time}` : ''}
                      </td>
                      <td className="px-5 py-3.5"><TypeBadge type={svc.serviceType || svc.type} /></td>
                      <td className="px-5 py-3.5"><StatusBadge status={svc.status || 'approved'} /></td>
                      <td className="px-5 py-3.5 text-slate-400 text-xs">{team.length} member{team.length !== 1 ? 's' : ''}</td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => { setShowAssignModal(svc); setAssignForm({ memberId: '', role: '' }); setAssignMsg(''); }}
                          className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 text-xs font-semibold rounded-lg px-3 py-1.5 border border-indigo-500/30 transition"
                        >
                          Assign
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Past services */}
        {past.length > 0 && (
          <>
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Past ({past.length})</h3>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden opacity-70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-5 py-3">Date</th>
                    <th className="text-left px-5 py-3">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {past.slice(0, 10).map(svc => (
                    <tr key={svc.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-5 py-3 text-slate-300">{svc.name || '—'}</td>
                      <td className="px-5 py-3 text-slate-400">{svc.date}</td>
                      <td className="px-5 py-3"><TypeBadge type={svc.serviceType || svc.type} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  // ── SONGS TAB ─────────────────────────────────────────────────────────────
  const renderSongs = () => (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-semibold text-lg">Song Library</h2>
        <button onClick={() => { setShowAnnounce(true); setAnnounceMsg(''); }} className={btnSecondary}>
          📢 Send Announcement
        </button>
      </div>

      {/* Pending song proposals */}
      {pendingSongs.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 mb-6">
          <h3 className="text-amber-400 text-sm font-semibold mb-4">
            ⏳ Pending Song Proposals ({pendingSongs.length})
          </h3>
          <div className="space-y-3">
            {pendingSongs.map(song => (
              <div key={song.id} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-4 py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm">{song.title}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {song.artist || 'Unknown'} · {song.key || '?'} · {song.bpm ? `${song.bpm} BPM` : ''} · by {song.from_name || 'Leader'}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleApproveSong(song)}
                    disabled={approvingSongId === song.id}
                    className={btnApprove}
                  >
                    {approvingSongId === song.id ? <Spinner size={3} /> : '✓ Add to Library'}
                  </button>
                  <button onClick={() => setRejectSongTarget(song)} className={btnReject}>✗ Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <input
          type="text"
          value={songSearch}
          onChange={e => setSongSearch(e.target.value)}
          placeholder="Search by title, artist, or key…"
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
      </div>

      <p className="text-slate-500 text-xs mb-3">Showing {filteredSongs.length} of {songs.length} songs</p>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
              <th className="text-left px-5 py-3">Title</th>
              <th className="text-left px-5 py-3">Artist</th>
              <th className="text-left px-5 py-3">Key</th>
              <th className="text-left px-5 py-3">BPM</th>
              <th className="text-left px-5 py-3">Stems</th>
              <th className="text-left px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredSongs.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-500 py-10">No songs found.</td></tr>
            )}
            {filteredSongs.map(sg => (
              <tr key={sg.id || sg.title} className="hover:bg-slate-800/40 transition">
                <td className="px-5 py-3.5 text-white font-medium">{sg.title || '—'}</td>
                <td className="px-5 py-3.5 text-slate-300">{sg.artist || '—'}</td>
                <td className="px-5 py-3.5 text-slate-400">{sg.key || '—'}</td>
                <td className="px-5 py-3.5 text-slate-400">{sg.bpm ? `${sg.bpm} BPM` : '—'}</td>
                <td className="px-5 py-3.5">
                  {(sg.stems || sg.hasStemsAvailable) && (
                    <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">Stems</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <button
                    onClick={() => { setEditSong({ ...sg }); setEditSongMsg(''); }}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded-lg px-3 py-1.5 transition"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── ANALYTICS TAB ─────────────────────────────────────────────────────────
  const renderAnalytics = () => {
    const upcomingCount = services.filter(s => !s.date || s.date >= today).length;
    const uniqueRoles = Array.from(new Set(members.map(m => m.role || m.position || 'Unassigned')));

    // Practice stats from stats endpoint or derive from plans
    const practiceWeeks = stats.practiceSessionsByWeek || [];

    // Assignment acceptance: compute from plans
    const allAssignments = Object.values(plans).flatMap(p => p.team || []);
    const accepted = allAssignments.filter(a => a.status === 'accepted' || a.status === 'confirmed').length;
    const acceptanceRate = allAssignments.length > 0 ? Math.round((accepted / allAssignments.length) * 100) : 0;

    // Most practiced songs
    const practisedSongs = stats.mostPracticed || [];

    return (
      <div className="space-y-6">
        <h2 className="text-white font-semibold text-lg">Analytics</h2>

        {/* Overview cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Members" value={totalMembers} icon="👥" color="bg-indigo-500/10" />
          <StatCard label="Total Services" value={services.length} icon="📅" color="bg-emerald-500/10" />
          <StatCard label="Upcoming" value={upcomingCount} icon="🗓" color="bg-cyan-500/10" />
          <StatCard label="Acceptance Rate" value={`${acceptanceRate}%`} icon="✓" color="bg-amber-500/10" />
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Practice sessions bar chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-slate-300 font-semibold text-sm mb-4">Practice Sessions per Week</h3>
            {practiceWeeks.length === 0 ? (
              <p className="text-slate-500 text-sm">No practice data yet.</p>
            ) : (
              <div className="flex items-end gap-2 h-28">
                {practiceWeeks.map((week, i) => {
                  const max = Math.max(...practiceWeeks.map(w => w.count || w)) || 1;
                  const count = week.count ?? week;
                  const pct = Math.round((count / max) * 100);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-slate-400 text-xs">{count}</span>
                      <div className="w-full bg-slate-800 rounded-t" style={{ height: `${Math.max(4, pct)}%`, minHeight: 4 }}>
                        <div className="w-full h-full bg-indigo-500 rounded-t" />
                      </div>
                      <span className="text-slate-500 text-xs">{week.label || `W${i+1}`}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Role distribution */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-slate-300 font-semibold text-sm mb-4">Role Distribution</h3>
            {uniqueRoles.length === 0 ? (
              <p className="text-slate-500 text-sm">No member data yet.</p>
            ) : (
              <div className="space-y-3">
                {uniqueRoles.map(role => {
                  const count = members.filter(m => (m.role || m.position || 'Unassigned') === role).length;
                  const pct = members.length > 0 ? Math.round((count / members.length) * 100) : 0;
                  return (
                    <div key={role}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300">{role}</span>
                        <span className="text-slate-500">{count} ({pct}%)</span>
                      </div>
                      <div className="bg-slate-800 rounded-full h-2">
                        <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Team activity */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-slate-300 font-semibold text-sm mb-4">Team Activity Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Online Now</span>
                <span className="text-emerald-400 font-semibold">{onlineNow}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Active Today</span>
                <span className="text-white font-semibold">{activeToday}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Pending Responses</span>
                <span className="text-amber-400 font-semibold">{pendingResponses}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Total Assignments</span>
                <span className="text-white font-semibold">{allAssignments.length}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Acceptance Rate</span>
                <span className="text-emerald-400 font-semibold">{acceptanceRate}%</span>
              </div>
            </div>
          </div>

          {/* Most practiced songs */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-slate-300 font-semibold text-sm mb-4">Most Practiced Songs</h3>
            {practisedSongs.length === 0 ? (
              <p className="text-slate-500 text-sm">No practice data yet.</p>
            ) : (
              <div className="space-y-2">
                {practisedSongs.slice(0, 8).map((song, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 font-mono text-xs w-4">{i+1}.</span>
                      <div>
                        <p className="text-white text-sm">{song.title || song.name || '—'}</p>
                        <p className="text-slate-500 text-xs">{song.artist || ''}</p>
                      </div>
                    </div>
                    <span className="text-indigo-400 text-xs font-semibold">{song.sessions || song.count || 0}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
          <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm">Worship Team Management · {userName}</p>
        </div>
        <button onClick={refresh} className="text-slate-400 hover:text-white text-sm font-medium rounded-lg px-3 py-2 hover:bg-slate-800 transition">
          ↻ Refresh
        </button>
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
              {tab === 'Services' && pendingServices.length > 0 && (
                <span className="ml-1.5 bg-amber-500 text-black text-xs rounded-full px-1.5 py-0.5 font-bold">
                  {pendingServices.length}
                </span>
              )}
              {tab === 'Songs' && pendingSongs.length > 0 && (
                <span className="ml-1.5 bg-amber-500 text-black text-xs rounded-full px-1.5 py-0.5 font-bold">
                  {pendingSongs.length}
                </span>
              )}
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
            {activeTab === 'Team' && renderTeam()}
            {activeTab === 'Services' && renderServices()}
            {activeTab === 'Songs' && renderSongs()}
            {activeTab === 'Analytics' && renderAnalytics()}
          </>
        )}
      </div>

      {/* ── Invite Member Modal ───────────────────────────────────────────── */}
      <Modal open={showInviteForm} onClose={() => setShowInviteForm(false)} title="Invite New Member">
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className={labelCls}>Full Name *</label>
            <input type="text" placeholder="John Smith" value={inviteForm.name}
              onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email Address *</label>
            <input type="email" placeholder="john@church.org" value={inviteForm.email}
              onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Role</label>
            <input type="text" placeholder="e.g. Lead Vocal, Keys, Drums" value={inviteForm.role}
              onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))} className={inputCls} />
          </div>
          {inviteMsg && (
            <p className={`text-sm ${inviteMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{inviteMsg}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowInviteForm(false)} className={`${btnSecondary} flex-1`}>Cancel</button>
            <button type="submit" disabled={savingInvite} className={`${btnPrimary} flex-1`}>
              {savingInvite ? 'Sending…' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Create Service Modal ──────────────────────────────────────────── */}
      <Modal open={showNewService} onClose={() => setShowNewService(false)} title="Create New Service" wide>
        <form onSubmit={handleCreateService} className="space-y-4">
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Location</label>
              <input type="text" placeholder="Main Sanctuary" value={newSvcForm.location}
                onChange={e => setNewSvcForm(f => ({ ...f, location: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Theme</label>
              <input type="text" placeholder="e.g. Resurrection Sunday" value={newSvcForm.theme}
                onChange={e => setNewSvcForm(f => ({ ...f, theme: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {SERVICE_TYPES.map(t => (
                <button key={t} type="button"
                  onClick={() => setNewSvcForm(f => ({ ...f, type: t }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition capitalize ${
                    newSvcForm.type === t
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
                  }`}
                >{t}</button>
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
            <button type="submit" disabled={savingSvc} className={`${btnPrimary} flex-1`}>
              {savingSvc ? 'Creating…' : 'Create Service'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Assign Member Modal ───────────────────────────────────────────── */}
      <Modal
        open={!!showAssignModal}
        onClose={() => setShowAssignModal(null)}
        title={`Assign Member — ${showAssignModal?.name || ''}`}
      >
        <form onSubmit={handleCreateAssignment} className="space-y-4">
          <div>
            <label className={labelCls}>Member</label>
            <select value={assignForm.memberId} onChange={e => setAssignForm(f => ({ ...f, memberId: e.target.value }))} className={inputCls}>
              <option value="">Select member…</option>
              {members.map(m => (
                <option key={m.id || m.email} value={m.id || m.email}>{m.name} ({m.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Role</label>
            <input type="text" placeholder="e.g. Lead Vocal, Keys, Drums" value={assignForm.role}
              onChange={e => setAssignForm(f => ({ ...f, role: e.target.value }))} className={inputCls} />
          </div>
          {assignMsg && (
            <p className={`text-sm ${assignMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{assignMsg}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowAssignModal(null)} className={`${btnSecondary} flex-1`}>Cancel</button>
            <button type="submit" disabled={savingAssign} className={`${btnPrimary} flex-1`}>
              {savingAssign ? 'Creating…' : 'Create Assignment'}
            </button>
          </div>
        </form>

        {/* Existing team for this service */}
        {showAssignModal && (plans[showAssignModal.id]?.team || []).length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-800">
            <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Current Team</h4>
            <div className="space-y-2">
              {(plans[showAssignModal.id]?.team || []).map((t, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <Avatar name={t.name} size={7} />
                    <div>
                      <p className="text-white text-sm">{t.name}</p>
                      <p className="text-slate-500 text-xs">{t.role}</p>
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Edit Song Modal ───────────────────────────────────────────────── */}
      <Modal open={!!editSong} onClose={() => setEditSong(null)} title="Edit Song">
        {editSong && (
          <form onSubmit={handleSaveEditSong} className="space-y-4">
            <div>
              <label className={labelCls}>Title</label>
              <input type="text" value={editSong.title || ''} onChange={e => setEditSong(s => ({ ...s, title: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Artist</label>
              <input type="text" value={editSong.artist || ''} onChange={e => setEditSong(s => ({ ...s, artist: e.target.value }))} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Key</label>
                <input type="text" value={editSong.key || ''} onChange={e => setEditSong(s => ({ ...s, key: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>BPM</label>
                <input type="number" value={editSong.bpm || ''} onChange={e => setEditSong(s => ({ ...s, bpm: parseInt(e.target.value,10) || 0 }))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Genre</label>
              <input type="text" value={editSong.genre || ''} onChange={e => setEditSong(s => ({ ...s, genre: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>YouTube URL</label>
              <input type="url" value={editSong.youtubeUrl || editSong.youtube || ''} onChange={e => setEditSong(s => ({ ...s, youtubeUrl: e.target.value }))} className={inputCls} />
            </div>
            {editSongMsg && (
              <p className={`text-sm ${editSongMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{editSongMsg}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEditSong(null)} className={`${btnSecondary} flex-1`}>Cancel</button>
              <button type="submit" disabled={savingEditSong} className={`${btnPrimary} flex-1`}>
                {savingEditSong ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Announcement Modal ────────────────────────────────────────────── */}
      <Modal open={showAnnounce} onClose={() => setShowAnnounce(false)} title="Send Announcement">
        <form onSubmit={handleAnnounce} className="space-y-4">
          <div>
            <label className={labelCls}>Title</label>
            <input type="text" placeholder="Announcement title" value={announceForm.title}
              onChange={e => setAnnounceForm(f => ({ ...f, title: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Body</label>
            <textarea rows={4} placeholder="Message to the team…" value={announceForm.body}
              onChange={e => setAnnounceForm(f => ({ ...f, body: e.target.value }))}
              className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Audience</label>
            <select value={announceForm.audience} onChange={e => setAnnounceForm(f => ({ ...f, audience: e.target.value }))} className={inputCls}>
              <option value="all">Everyone</option>
              <option value="leaders">Worship Leaders only</option>
              <option value="members">Members only</option>
            </select>
          </div>
          {announceMsg && (
            <p className={`text-sm ${announceMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{announceMsg}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowAnnounce(false)} className={`${btnSecondary} flex-1`}>Cancel</button>
            <button type="submit" disabled={savingAnnounce} className={`${btnPrimary} flex-1`}>
              {savingAnnounce ? 'Sending…' : '📢 Send to Team'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Confirm Delete Member ─────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Remove member?"
        message={confirmDelete ? `Remove ${confirmDelete.name} from the team? This cannot be undone.` : ''}
        confirmLabel={deletingMember ? 'Removing…' : 'Remove'}
        danger
        onConfirm={handleDeleteMember}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* ── Reject Service Dialog ─────────────────────────────────────────── */}
      <RejectReasonDialog
        open={!!rejectSvcTarget}
        title={`Reject "${rejectSvcTarget?.name}"?`}
        onReject={handleRejectService}
        onCancel={() => setRejectSvcTarget(null)}
      />

      {/* ── Reject Song Dialog ────────────────────────────────────────────── */}
      <RejectReasonDialog
        open={!!rejectSongTarget}
        title={`Reject "${rejectSongTarget?.title}"?`}
        onReject={handleRejectSong}
        onCancel={() => setRejectSongTarget(null)}
      />
    </div>
  );
}
