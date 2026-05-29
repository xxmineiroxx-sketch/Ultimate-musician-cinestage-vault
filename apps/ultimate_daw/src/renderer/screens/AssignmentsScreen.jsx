/**
 * AssignmentsScreen (Desktop DAW)
 * Full feature-parity with mobile AssignmentsScreen.
 * - Fetch + smart merge with local store
 * - Local response persistence (playback_local_responses)
 * - Conflict detection on accept (client-side)
 * - Accept / Decline with reason (inline modal)
 * - Guest invite support (invite_type === 'guest')
 * - Deep link support via location.state
 * - Assignment grouping by service_id + group merge by name+date
 * - Group status aggregation
 * - Filter tabs: All / Pending / Accepted / Declined
 * - Service expiration: hide >7 days past service date
 * - Refresh on mount (React Router remount = focus equivalent)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';
import { store } from '../services/store';

// ─── Constants ───────────────────────────────────────────────────────────────

const LOCAL_RESPONSES_KEY = 'playback_local_responses';
const FILTER_TABS = ['All', 'Pending', 'Accepted', 'Declined'];

const ROLE_LABELS = {
  vocals: 'Vocals',
  lead_vocals: 'Lead Vocals',
  background_vocals: 'Background Vocals',
  bgv: 'Background Vocals',
  acoustic_guitar: 'Acoustic Guitar',
  electric_guitar: 'Electric Guitar',
  guitar: 'Guitar',
  bass: 'Bass Guitar',
  bass_guitar: 'Bass Guitar',
  drums: 'Drums',
  keys: 'Keys',
  keyboard: 'Keyboard',
  piano: 'Piano',
  violin: 'Violin',
  cello: 'Cello',
  trumpet: 'Trumpet',
  saxophone: 'Saxophone',
  sound_tech: 'Sound Tech',
  media_tech: 'Media Tech',
  lighting: 'Lighting',
  camera: 'Camera',
  host: 'Host',
  preacher: 'Preacher',
  pastor: 'Pastor',
  leader: 'Worship Leader',
  worship_leader: 'Worship Leader',
  team_member: 'Team Member',
};

const normalizeRoleKey = (r) => {
  const s = String(r || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  const map = {
    sound: 'sound_tech', sound_tech: 'sound_tech', soundtech: 'sound_tech',
    audio_tech: 'sound_tech', foh: 'sound_tech', monitor: 'sound_tech',
    iem: 'sound_tech', monitors: 'sound_tech',
    media: 'media_tech', media_tech: 'media_tech', propresenter: 'media_tech',
    slides: 'media_tech', lighting: 'media_tech', lights: 'media_tech',
    media_technician: 'media_tech',
  };
  return map[s] || s;
};

const TECH_ROLES = new Set(['sound_tech', 'media_tech']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  const s = String(dateStr);
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const parts = String(timeStr).split(':');
  const hour = parseInt(parts[0], 10);
  const min = parts[1] || '00';
  if (isNaN(hour)) return timeStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${min} ${ampm}`;
}

function formatConflictDate(dateStr) {
  if (!dateStr) return 'that date';
  const s = String(dateStr);
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function getRoleLabel(role) {
  const key = String(role || '').trim().toLowerCase();
  return ROLE_LABELS[key] || ROLE_LABELS[normalizeRoleKey(key)] || role || 'Team Member';
}

function getOrgLabel(a) {
  const name = a?.org_name || a?.organization_name || a?.church_name || '';
  const city = a?.branch_city || '';
  return city ? `${name} — ${city}` : name;
}

/** Hide services more than 7 days past their service date */
function isExpiredService(dateStr) {
  if (!dateStr) return false;
  const s = String(dateStr);
  const svc = new Date(s.includes('T') ? s : s + 'T00:00:00');
  if (isNaN(svc.getTime())) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  cutoff.setHours(0, 0, 0, 0);
  return svc < cutoff;
}

// Deduplicate by service_id + role compound key
function dedupAssignments(list) {
  const seen = new Set();
  return list.filter(a => {
    const key = `${a.service_id || ''}_${a.role || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickPreferredStatus(current, next) {
  const normalize = v => String(v || '').trim().toLowerCase();
  const rank = { '': 0, pending: 1, accepted: 2, declined: 2 };
  const c = normalize(current);
  const n = normalize(next);
  const cr = rank[c] ?? 0;
  const nr = rank[n] ?? 0;
  if (nr > cr) return n;
  if (cr > nr) return c;
  if (n && n !== c && n !== 'pending') return n;
  return c || n || 'pending';
}

// Group by service_id, then merge groups with identical service_name + service_date
function groupByService(list) {
  const map = new Map();
  for (const a of list) {
    const key = a.service_id || a.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  const groups = Array.from(map.values());

  const merged = [];
  const used = new Set();
  for (let i = 0; i < groups.length; i++) {
    if (used.has(i)) continue;
    const base = groups[i];
    const nd = `${base[0].service_name || ''}_${base[0].service_date || ''}`;
    for (let j = i + 1; j < groups.length; j++) {
      if (used.has(j)) continue;
      const other = groups[j];
      const nd2 = `${other[0].service_name || ''}_${other[0].service_date || ''}`;
      if (nd && nd2 && nd === nd2) {
        base.push(...other);
        used.add(j);
      }
    }
    used.add(i);
    merged.push(base);
  }
  return merged;
}

function groupStatus(group) {
  const statuses = group.map(a => (a.status || 'pending').toLowerCase());
  if (statuses.some(s => s === 'pending')) return 'pending';
  if (statuses.every(s => s === 'accepted')) return 'accepted';
  if (statuses.every(s => s === 'declined')) return 'declined';
  return 'mixed';
}

function sortGroupsByTarget(groups, targetServiceId) {
  const target = String(targetServiceId || '').trim();
  if (!target) return groups;
  return [...groups].sort((l, r) => {
    const lm = String(l?.[0]?.service_id || l?.[0]?.id || '').trim() === target;
    const rm = String(r?.[0]?.service_id || r?.[0]?.id || '').trim() === target;
    if (lm === rm) return 0;
    return lm ? -1 : 1;
  });
}

// ─── Local response persistence ───────────────────────────────────────────────

async function saveLocalResponse(serviceId, status) {
  try {
    const raw = await store.get(LOCAL_RESPONSES_KEY);
    const existing = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    existing[serviceId] = { status, respondedAt: new Date().toISOString() };
    await store.set(LOCAL_RESPONSES_KEY, existing);
  } catch { /* silent */ }
}

async function getLocalResponses() {
  try {
    const raw = await store.get(LOCAL_RESPONSES_KEY);
    if (!raw) return {};
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

// ─── StatusBadge component ────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    accepted: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    declined: 'bg-red-500/20 text-red-400 border border-red-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    mixed: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  };
  const labels = {
    accepted: 'Accepted ✓',
    declined: 'Declined',
    pending: 'Pending Response',
    mixed: 'Mixed',
  };
  const key = (status || 'pending').toLowerCase();
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[key] || styles.pending}`}>
      {labels[key] || labels.pending}
    </span>
  );
}

// ─── DeclineModal component ───────────────────────────────────────────────────

function DeclineModal({ onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4 shadow-2xl">
        <h3 className="text-white font-semibold text-lg">Decline Assignment</h3>
        <p className="text-slate-400 text-sm">Please enter a reason for declining (optional):</p>
        <textarea
          className="w-full bg-[#020617] border border-[#1e293b] rounded-lg p-3 text-slate-200 text-sm resize-none focus:outline-none focus:border-indigo-500 placeholder-slate-600"
          rows={3}
          placeholder="Reason for declining..."
          value={reason}
          onChange={e => setReason(e.target.value)}
          autoFocus
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-[#1e293b] text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            className="flex-1 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 text-sm font-medium transition-colors"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ConflictModal component ──────────────────────────────────────────────────

function ConflictModal({ message, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-amber-500/30 rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4 shadow-2xl">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-xl">⚠️</span>
          <h3 className="text-white font-semibold text-lg">Assignment Conflict</h3>
        </div>
        <p className="text-slate-300 text-sm leading-relaxed">{message}</p>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 text-sm font-medium transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AssignmentsScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();

  // Deep link params from location.state
  const requestedServiceId = String(location.state?.serviceId || '').trim();
  const requestedDecision = String(location.state?.decision || '').trim().toLowerCase();

  const [assignments, setAssignments] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [filter, setFilter] = useState('All');

  // Modal state
  const [declineTarget, setDeclineTarget] = useState(null); // group being declined
  const [conflictMessage, setConflictMessage] = useState(null);
  const [respondingIds, setRespondingIds] = useState(new Set()); // service_ids being actioned

  // Refs for deep-link scroll
  const cardRefs = useRef({});

  // ── Store helpers ───────────────────────────────────────────────────────────

  const loadFromStore = useCallback(async () => {
    try {
      const stored = await store.getAssignments();
      if (Array.isArray(stored) && stored.length > 0) {
        const active = dedupAssignments(stored).filter(a => !isExpiredService(a.service_date));
        setAssignments(active);
      }
    } catch { /* silent */ }
  }, []);

  // ── Server sync ─────────────────────────────────────────────────────────────

  const syncFromServer = useCallback(async () => {
    const email = profile?.email?.trim();
    if (!email) {
      setSyncError('no_email');
      return;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      const fullName = [profile?.name, profile?.lastName].filter(Boolean).join(' ').trim();
      const url = fullName
        ? `${SYNC_URL}/sync/assignments?email=${encodeURIComponent(email)}&name=${encodeURIComponent(fullName)}`
        : `${SYNC_URL}/sync/assignments?email=${encodeURIComponent(email)}`;

      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 8000);
      let res;
      try {
        res = await fetch(url, { headers: syncHeaders(), signal: controller.signal });
      } finally {
        clearTimeout(tid);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const remote = await res.json();
      const remoteList = Array.isArray(remote) ? remote : (remote.assignments || []);

      // Merge remote with local — local persisted responses always win
      const local = await store.getAssignments() || [];
      const localById = Object.fromEntries(local.map(a => [a.id, a]));
      const localByCompound = Object.fromEntries(
        local.map(a => [`${a.service_id}_${a.role}`, a])
      );
      const localResponses = await getLocalResponses();

      const merged = remoteList.map(r => {
        // Persisted local response always wins over server
        const override = localResponses[r.service_id];
        if (override) return { ...r, status: override.status };
        // Fall back to in-store match
        const match = localById[r.id] || localByCompound[`${r.service_id}_${r.role}`];
        return match
          ? { ...r, status: pickPreferredStatus(match.status, r.status) }
          : r;
      });

      const active = dedupAssignments(merged).filter(a => !isExpiredService(a.service_date));
      await store.setAssignments(active);
      setAssignments(active);
      setLastSync(new Date());
    } catch (e) {
      const msg = e?.name === 'AbortError' ? 'Request timed out' : (e?.message || 'Network error');
      setSyncError(msg);
    } finally {
      setSyncing(false);
    }
  }, [profile]);

  // ── Mount / focus equivalent ────────────────────────────────────────────────

  useEffect(() => {
    loadFromStore().then(() => syncFromServer());
  }, [loadFromStore, syncFromServer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Deep-link scroll ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!requestedServiceId || assignments.length === 0) return;
    const ref = cardRefs.current[requestedServiceId];
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [requestedServiceId, assignments]);

  // ── Optimistic state helpers ────────────────────────────────────────────────

  const applyStatusToGroup = (group, status) => {
    const ids = new Set(group.map(a => a.id));
    setAssignments(prev => prev.map(a => ids.has(a.id) ? { ...a, status } : a));
  };

  const revertGroup = async (group) => {
    await loadFromStore();
  };

  // ── Conflict detection (client-side) ───────────────────────────────────────

  function findConflict(group) {
    const targetDates = new Set(
      group.map(a => a.service_date).filter(Boolean).map(d => String(d).split('T')[0])
    );
    const targetTimes = new Set(
      group.map(a => a.service_time).filter(Boolean)
    );
    const targetIds = new Set(group.map(a => a.service_id).filter(Boolean));

    // Check if any OTHER accepted assignment falls on the same date+time
    for (const a of assignments) {
      if (targetIds.has(a.service_id)) continue; // same service
      if ((a.status || '').toLowerCase() !== 'accepted') continue;
      const aDate = a.service_date ? String(a.service_date).split('T')[0] : null;
      if (!aDate || !targetDates.has(aDate)) continue;
      // If we have time info, only conflict if times overlap; otherwise date match is enough
      if (targetTimes.size > 0 && a.service_time && !targetTimes.has(a.service_time)) continue;
      return a; // conflict found
    }
    return null;
  }

  // ── Accept ──────────────────────────────────────────────────────────────────

  const handleAcceptGroup = async (group) => {
    const conflict = findConflict(group);
    if (conflict) {
      const cDate = formatConflictDate(conflict.service_date);
      const cTime = conflict.service_time ? ` at ${formatTime(conflict.service_time)}` : '';
      setConflictMessage(
        `You already accepted "${conflict.service_name || 'another service'}"${cTime} on ${cDate}. Decline one assignment before accepting the other.`
      );
      return;
    }

    const serviceId = group[0]?.service_id;
    setRespondingIds(prev => new Set([...prev, serviceId]));
    applyStatusToGroup(group, 'accepted');

    try {
      const email = profile?.email?.trim();
      const fullName = [profile?.name, profile?.lastName].filter(Boolean).join(' ').trim() || email;

      await Promise.all(group.map(a =>
        fetch(`${SYNC_URL}/sync/assignment/respond`, {
          method: 'POST',
          headers: syncHeaders(),
          body: JSON.stringify({
            email,
            name: fullName,
            serviceId: a.service_id,
            role: a.role,
            decision: 'accepted',
          }),
        }).then(async r => {
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            const err = new Error(d?.error || `HTTP ${r.status}`);
            err.conflict = d?.conflict || null;
            throw err;
          }
        })
      ));

      // Persist locally so sync never resets this
      const serviceIds = [...new Set(group.map(a => a.service_id).filter(Boolean))];
      await Promise.all(serviceIds.map(sid => saveLocalResponse(sid, 'accepted')));
      // Update store
      const updated = assignments.map(a =>
        group.some(g => g.id === a.id) ? { ...a, status: 'accepted' } : a
      );
      await store.setAssignments(updated);
    } catch (err) {
      applyStatusToGroup(group, 'pending');
      await revertGroup(group);
      const conflict = err?.conflict;
      if (conflict) {
        const sn = conflict.serviceName || 'another service';
        const org = conflict.orgName ? ` in ${conflict.orgName}` : '';
        const cd = formatConflictDate(conflict.serviceDate);
        const ct = conflict.serviceTime ? ` at ${formatTime(conflict.serviceTime)}` : '';
        setConflictMessage(`You already accepted "${sn}"${org} on ${cd}${ct}. Decline one assignment before accepting the other.`);
      } else {
        setConflictMessage(err?.message || 'Failed to accept assignment. Please try again.');
      }
    } finally {
      setRespondingIds(prev => {
        const next = new Set(prev);
        next.delete(group[0]?.service_id);
        return next;
      });
    }
  };

  // ── Decline ─────────────────────────────────────────────────────────────────

  const handleDeclineGroup = (group) => {
    setDeclineTarget(group);
  };

  const doDecline = async (group, reason = '') => {
    setDeclineTarget(null);
    const serviceId = group[0]?.service_id;
    setRespondingIds(prev => new Set([...prev, serviceId]));
    applyStatusToGroup(group, 'declined');

    try {
      const email = profile?.email?.trim();
      const fullName = [profile?.name, profile?.lastName].filter(Boolean).join(' ').trim() || email;

      await Promise.all(group.map(a =>
        fetch(`${SYNC_URL}/sync/assignment/respond`, {
          method: 'POST',
          headers: syncHeaders(),
          body: JSON.stringify({
            email,
            name: fullName,
            serviceId: a.service_id,
            role: a.role,
            decision: 'declined',
            ...(reason ? { reason } : {}),
          }),
        }).then(async r => {
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d?.error || `HTTP ${r.status}`);
          }
        })
      ));

      const serviceIds = [...new Set(group.map(a => a.service_id).filter(Boolean))];
      await Promise.all(serviceIds.map(sid => saveLocalResponse(sid, 'declined')));
      const updated = assignments.map(a =>
        group.some(g => g.id === a.id) ? { ...a, status: 'declined' } : a
      );
      await store.setAssignments(updated);
    } catch (err) {
      applyStatusToGroup(group, 'pending');
      await revertGroup(group);
      setSyncError(err?.message || 'Failed to decline assignment. Please try again.');
    } finally {
      setRespondingIds(prev => {
        const next = new Set(prev);
        next.delete(group[0]?.service_id);
        return next;
      });
    }
  };

  // ── Guest invite respond ─────────────────────────────────────────────────────

  const respondToInvite = async (invite, status) => {
    const inviteId = invite.invite_id || invite.id;
    const email = profile?.email?.trim().toLowerCase() || '';
    if (!email) {
      setSyncError('No email in profile. Please set up your profile.');
      return;
    }
    try {
      await fetch(`${SYNC_URL}/sync/xinvite/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, inviteId, status }),
      });
      syncFromServer();
    } catch (e) {
      setSyncError('Could not update invitation: ' + e.message);
    }
  };

  // ── Filtering + grouping ─────────────────────────────────────────────────────

  const tabCounts = {
    All: groupByService(assignments).length,
    Pending: groupByService(assignments).filter(g => groupStatus(g) === 'pending').length,
    Accepted: groupByService(assignments).filter(g => groupStatus(g) === 'accepted').length,
    Declined: groupByService(assignments).filter(g => groupStatus(g) === 'declined').length,
  };

  const allGroups = sortGroupsByTarget(groupByService(assignments), requestedServiceId);

  const visibleGroups = allGroups.filter(g => {
    const st = groupStatus(g);
    if (filter === 'All') return true;
    if (filter === 'Pending') return st === 'pending';
    if (filter === 'Accepted') return st === 'accepted';
    if (filter === 'Declined') return st === 'declined';
    return true;
  });

  // ── Render: Guest Invite Card ───────────────────────────────────────────────

  const renderGuestInviteCard = (invite) => {
    const isTargeted = requestedServiceId &&
      String(invite.service_id || invite.id || '').trim() === requestedServiceId;
    return (
      <div
        key={invite.id}
        ref={el => { if (el && invite.service_id) cardRefs.current[invite.service_id] = el; }}
        className={`rounded-xl bg-[#0f172a] border overflow-hidden transition-all ${
          isTargeted ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-indigo-500/30 hover:border-indigo-500/50'
        }`}
      >
        {isTargeted && (
          <div className="px-5 py-2.5 bg-indigo-500/10 border-b border-indigo-500/20">
            <p className="text-indigo-300 text-xs font-semibold">
              {requestedDecision === 'decline'
                ? 'Opened from email. Review this invitation and tap Decline below.'
                : requestedDecision === 'accept'
                  ? 'Opened from email. Review this invitation and tap Accept below.'
                  : 'Opened from email. Review this invitation below.'}
            </p>
          </div>
        )}

        {/* Guest badge */}
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          <span className="px-2.5 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-indigo-300 text-xs font-semibold">
            Guest Invite
          </span>
        </div>

        {/* Service info */}
        <div className="px-5 pb-3 space-y-1">
          <p className="text-white font-semibold">{invite.service_name}</p>
          {invite.service_date && (
            <p className="text-slate-400 text-sm">{formatDate(invite.service_date)}</p>
          )}
          {getOrgLabel(invite) && (
            <p className="text-indigo-400 text-xs font-medium">{getOrgLabel(invite)}</p>
          )}
          {invite.role && (
            <span className="inline-block mt-1 px-2.5 py-1 bg-indigo-600/20 border border-indigo-500/20 rounded-full text-indigo-300 text-xs font-semibold">
              {getRoleLabel(invite.role)}
            </span>
          )}
          {invite.notes && (
            <p className="text-slate-500 text-sm italic mt-1">{invite.notes}</p>
          )}
          {invite.invited_by && (
            <p className="text-slate-600 text-xs italic">Invited by {invite.invited_by}</p>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-4 flex gap-3">
          <button
            onClick={() => respondToInvite(invite, 'accepted')}
            className="flex-1 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 text-sm font-semibold transition-colors"
          >
            ✓ Accept
          </button>
          <button
            onClick={() => respondToInvite(invite, 'declined')}
            className="flex-1 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 text-sm font-semibold transition-colors"
          >
            Decline
          </button>
        </div>
      </div>
    );
  };

  // ── Render: Service Group Card ──────────────────────────────────────────────

  const renderServiceGroup = (group) => {
    const first = group[0];

    // Guest invites get a different card
    if (first.invite_type === 'guest') return renderGuestInviteCard(first);

    const serviceId = first.service_id || first.id;
    const isTargeted = requestedServiceId &&
      String(serviceId || '').trim() === requestedServiceId;
    const status = groupStatus(group);
    const isResponding = respondingIds.has(serviceId);
    const isTechGroup = group.every(a => TECH_ROLES.has(normalizeRoleKey(a.role)));

    return (
      <div
        key={serviceId}
        ref={el => { if (el && serviceId) cardRefs.current[serviceId] = el; }}
        className={`rounded-xl bg-[#0f172a] border overflow-hidden transition-all ${
          isTargeted
            ? 'border-indigo-500 ring-2 ring-indigo-500/30'
            : 'border-[#1e293b] hover:border-indigo-500/20'
        }`}
      >
        {/* Deep-link inline banner */}
        {isTargeted && (
          <div className="px-5 py-2.5 bg-indigo-500/10 border-b border-indigo-500/20">
            <p className="text-indigo-300 text-xs font-semibold">
              {requestedDecision === 'decline'
                ? 'Opened from email. Review this assignment and tap Decline below.'
                : requestedDecision === 'accept'
                  ? 'Opened from email. Review this assignment and tap Accept below.'
                  : 'Opened from email. Review this assignment below.'}
            </p>
          </div>
        )}

        {/* Service header */}
        <div className="px-5 py-4 border-b border-[#1e293b] flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-white font-semibold text-base leading-snug">
              {first.service_name || 'Service'}
            </p>
            {getOrgLabel(first) && (
              <p className="text-indigo-400 text-xs font-medium">{getOrgLabel(first)}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-slate-400 text-sm">{formatDate(first.service_date)}</p>
              {first.service_time && (
                <p className="text-slate-500 text-xs">{formatTime(first.service_time)}</p>
              )}
            </div>
            {(first.location || first.venue) && (
              <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {first.location || first.venue}
              </div>
            )}
          </div>
          <div className="flex-shrink-0">
            <StatusBadge status={status} />
          </div>
        </div>

        {/* Role rows */}
        <div className="divide-y divide-[#1e293b]">
          {group.map((a, idx) => {
            const aStatus = (a.status || 'pending').toLowerCase();
            return (
              <div key={a.id || idx} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-slate-200 text-sm font-medium">{getRoleLabel(a.role)}</p>
                    <StatusBadge status={aStatus} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Notes */}
        {first.notes && (
          <div className="px-5 py-2.5 border-t border-[#1e293b]">
            <p className="text-slate-500 text-sm italic">{first.notes}</p>
          </div>
        )}

        {/* Actions footer */}
        <div className="px-5 py-4 border-t border-[#1e293b] space-y-2.5">

          {/* Pending: Accept / Decline */}
          {status === 'pending' && (
            <div className="flex gap-3">
              <button
                onClick={() => handleDeclineGroup(group)}
                disabled={isResponding}
                className="flex-1 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isResponding ? (
                  <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin mx-auto" />
                ) : 'Decline'}
              </button>
              <button
                onClick={() => handleAcceptGroup(group)}
                disabled={isResponding}
                className="flex-1 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isResponding ? (
                  <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
                ) : '✓ Accept'}
              </button>
            </div>
          )}

          {/* Accepted: Setlist + Practice + Change to Declined */}
          {status === 'accepted' && (
            <>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/setlist', { state: { serviceId } })}
                  className="flex-1 py-2.5 rounded-lg bg-[#1e293b] hover:bg-slate-700 border border-indigo-500/20 text-indigo-300 hover:text-indigo-200 text-sm font-semibold transition-colors"
                >
                  View Setlist →
                </button>
                {!isTechGroup && (
                  <button
                    onClick={() => navigate('/practice', { state: { serviceId } })}
                    className="flex-1 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-sm font-semibold transition-colors"
                  >
                    Practice →
                  </button>
                )}
              </div>
              <button
                onClick={() => handleDeclineGroup(group)}
                disabled={isResponding}
                className="w-full py-2 text-slate-500 hover:text-slate-300 text-xs font-medium transition-colors"
              >
                ↺ Change to Declined
              </button>
            </>
          )}

          {/* Declined: Re-accept */}
          {status === 'declined' && (
            <div className="space-y-2">
              <p className="text-slate-500 text-xs text-center">Changed your mind?</p>
              <button
                onClick={() => handleAcceptGroup(group)}
                disabled={isResponding}
                className="w-full py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isResponding ? (
                  <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
                ) : '✓ Re-accept this Assignment'}
              </button>
            </div>
          )}

          {/* Mixed status: individual buttons at role level are shown above; just show nav */}
          {status === 'mixed' && (
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/setlist', { state: { serviceId } })}
                className="flex-1 py-2.5 rounded-lg bg-[#1e293b] hover:bg-slate-700 border border-[#334155] text-slate-300 hover:text-white text-sm font-medium transition-colors"
              >
                View Setlist →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Empty state message ─────────────────────────────────────────────────────

  function emptyMessage() {
    if (filter === 'Pending') return { icon: '🎉', title: 'No pending assignments', sub: "You're all caught up!" };
    if (filter === 'Accepted') return { icon: '📋', title: 'No accepted assignments', sub: 'Accept a pending assignment to see it here.' };
    if (filter === 'Declined') return { icon: '📋', title: 'No declined assignments', sub: '' };
    return { icon: '📭', title: 'No assignments yet', sub: "You'll receive notifications here when you're assigned to a service." };
  }

  const empty = emptyMessage();
  const hasDeepLink = Boolean(requestedServiceId);
  const deepLinkFound = hasDeepLink && assignments.some(a =>
    String(a?.service_id || a?.id || '').trim() === requestedServiceId
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Modals */}
      {declineTarget && (
        <DeclineModal
          onConfirm={(reason) => doDecline(declineTarget, reason)}
          onCancel={() => setDeclineTarget(null)}
        />
      )}
      {conflictMessage && (
        <ConflictModal
          message={conflictMessage}
          onClose={() => setConflictMessage(null)}
        />
      )}

      <div className="flex-1 h-full overflow-y-auto bg-[#020617] p-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Assignments</h1>
            <p className="text-slate-400 text-sm mt-0.5">Service notifications and responses</p>
          </div>
          <button
            onClick={syncFromServer}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm font-semibold disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {syncing ? (
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>

        {/* Sync info */}
        {profile?.email && (
          <p className="text-slate-600 text-xs -mt-3">Syncing as: {profile.email}</p>
        )}
        {lastSync && !syncError && (
          <p className="text-emerald-600 text-xs -mt-3">Last sync: {lastSync.toLocaleTimeString()}</p>
        )}

        {/* Deep-link banner */}
        {hasDeepLink && (
          <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <p className="text-indigo-300 text-xs font-semibold leading-relaxed">
              {deepLinkFound
                ? requestedDecision === 'decline'
                  ? 'Opening assignment from email — scroll down to decline this service.'
                  : requestedDecision === 'accept'
                    ? 'Opening assignment from email — scroll down to accept this service.'
                    : 'Opening assignment from email...'
                : 'Opening assignment from email. If not visible, tap Sync to refresh.'}
            </p>
          </div>
        )}

        {/* Error banners */}
        {syncError === 'no_email' && (
          <button
            onClick={() => navigate('/profile')}
            className="w-full p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm text-left hover:bg-orange-500/20 transition-colors"
          >
            ⚠️ No email set in your profile — tap here to set it so assignments can sync.
          </button>
        )}
        {syncError && syncError !== 'no_email' && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
            <span>⚠️ Sync error: {syncError}</span>
            <button onClick={syncFromServer} className="text-xs underline hover:no-underline ml-3">Retry</button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 bg-[#0f172a] rounded-xl border border-[#1e293b]">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                filter === tab
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
              {tabCounts[tab] > 0 && (
                <span className={`ml-1.5 text-xs ${filter === tab ? 'text-indigo-200' : 'text-slate-500'}`}>
                  ({tabCounts[tab]})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {syncing && assignments.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center space-y-3">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-400 text-sm">Loading assignments...</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!syncing && visibleGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <span className="text-5xl">{empty.icon}</span>
            <p className="text-slate-300 font-semibold text-lg">{empty.title}</p>
            {empty.sub && <p className="text-slate-500 text-sm text-center max-w-xs">{empty.sub}</p>}
          </div>
        )}

        {/* Assignment cards */}
        <div className="space-y-4">
          {visibleGroups.map(group => renderServiceGroup(group))}
        </div>

        {/* Bottom refresh hint */}
        {!syncing && assignments.length > 0 && (
          <div className="flex justify-center pt-2 pb-4">
            <button
              onClick={syncFromServer}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-400 text-xs transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh assignments
            </button>
          </div>
        )}
      </div>
    </>
  );
}
