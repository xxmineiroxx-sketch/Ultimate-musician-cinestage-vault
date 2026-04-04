/**
 * Admin Dashboard Screen - Ultimate Playback
 * MD role: manage services, team, library — cannot delete members or grant roles.
 * Admin role: full access including member deletion.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  TextInput, ActivityIndicator, RefreshControl, Alert, Modal,
  Keyboard, Platform, Share,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

// ── Inline Calendar (pure RN, no external package) ──────────────────────────
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function InlineCalendar({ selectedDate, onSelect }) {
  const initial = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date();
  const [viewYear,  setViewYear]  = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  })();

  function cellKey(day) {
    return `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  return (
    <View style={cal.wrapper}>
      {/* Header */}
      <View style={cal.header}>
        <TouchableOpacity style={cal.navBtn} onPress={prevMonth}>
          <Text style={cal.navTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={cal.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity style={cal.navBtn} onPress={nextMonth}>
          <Text style={cal.navTxt}>›</Text>
        </TouchableOpacity>
      </View>
      {/* Day names */}
      <View style={cal.row}>
        {DAY_NAMES.map(d => (
          <Text key={d} style={cal.dayName}>{d}</Text>
        ))}
      </View>
      {/* Day cells */}
      {Array.from({ length: cells.length / 7 }).map((_, ri) => (
        <View key={ri} style={cal.row}>
          {cells.slice(ri * 7, ri * 7 + 7).map((day, ci) => {
            if (!day) return <View key={ci} style={cal.cell} />;
            const key = cellKey(day);
            const isSelected = key === selectedDate;
            const isToday    = key === todayStr;
            return (
              <TouchableOpacity
                key={ci}
                style={[cal.cell, isSelected && cal.cellSelected, isToday && !isSelected && cal.cellToday]}
                onPress={() => onSelect(key)}
                activeOpacity={0.7}
              >
                <Text style={[cal.cellTxt, isSelected && cal.cellTxtSelected, isToday && !isSelected && cal.cellTxtToday]}>
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const cal = StyleSheet.create({
  wrapper:         { backgroundColor: '#0B1120', borderRadius: 14, borderWidth: 1, borderColor: '#1E2A40', padding: 10, marginBottom: 12 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn:          { padding: 6 },
  navTxt:          { color: '#818CF8', fontSize: 22, fontWeight: '700', lineHeight: 24 },
  monthLabel:      { color: '#E0E7FF', fontSize: 14, fontWeight: '800' },
  row:             { flexDirection: 'row' },
  dayName:         { flex: 1, textAlign: 'center', color: '#4B5563', fontSize: 11, fontWeight: '700', paddingVertical: 4 },
  cell:            { flex: 1, alignItems: 'center', justifyContent: 'center', aspectRatio: 1, borderRadius: 8, margin: 1 },
  cellSelected:    { backgroundColor: '#4F46E5' },
  cellToday:       { borderWidth: 1, borderColor: '#6366F1' },
  cellTxt:         { color: '#9CA3AF', fontSize: 13 },
  cellTxtSelected: { color: '#FFFFFF', fontWeight: '800' },
  cellTxtToday:    { color: '#818CF8', fontWeight: '700' },
});
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserProfile } from '../services/storage';

import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

const ADMIN_LIBRARY_CACHE_KEY = '@up_admin_library_cache_v1';
const TABS = ['Messages', 'Calendar', 'Services', 'Team', 'Library', 'Proposals'];

const ROLE_CHIPS = [
  'Worship Leader', 'Music Director', 'Vocal Lead', 'Vocal BGV',
  'Drums', 'Bass', 'Electric Guitar', 'Acoustic Guitar',
  'Keys', 'Synth/Pad', 'Tracks', 'Sound', 'Media',
];

const VOCAL_PARTS = [
  { key: 'lead',     label: 'Lead Vocal',   color: '#7C3AED' },
  { key: 'soprano',  label: 'Soprano',      color: '#EC4899' },
  { key: 'mezzo',    label: 'Mezzo',        color: '#F472B6' },
  { key: 'alto',     label: 'Alto',         color: '#8B5CF6' },
  { key: 'tenor',    label: 'Tenor',        color: '#3B82F6' },
  { key: 'baritone', label: 'Baritone',     color: '#06B6D4' },
  { key: 'bass_v',   label: 'Bass',         color: '#10B981' },
  { key: 'bgv1',     label: 'BGV 1',        color: '#6366F1' },
  { key: 'bgv2',     label: 'BGV 2',        color: '#818CF8' },
  { key: 'bgv3',     label: 'BGV 3',        color: '#A5B4FC' },
];

const VOCAL_TEAM_ROLES = new Set([
  'Worship Leader', 'Vocal Lead', 'Vocal BGV', 'Vocals', 'BGV',
  'worship_leader', 'lead_vocal', 'lead_vocals', 'vocals', 'vocalist',
  'bgv', 'background_vocal', 'soprano', 'alto', 'tenor', 'baritone',
]);

const AVATAR_COLORS = [
  '#4F46E5', '#7C3AED', '#2563EB', '#0891B2',
  '#059669', '#D97706', '#DC2626', '#DB2777',
  '#9333EA', '#0284C7', '#16A34A', '#CA8A04',
];

const TEAM_STATUS_ORDER = {
  pending: 0,
  declined: 1,
  accepted: 2,
  registered: 3,
};

const ASSIGNMENT_STATUS_ORDER = {
  pending: 0,
  declined: 2,
  accepted: 2,
};

function normalizeTeamStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'registered') return 'registered';
  if (normalized === 'accepted') return 'accepted';
  if (normalized === 'declined') return 'declined';
  return 'pending';
}

function normalizeAssignmentStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'accepted') return 'accepted';
  if (normalized === 'declined') return 'declined';
  return 'pending';
}

function getEffectiveInviteTeamStatus(person) {
  const inviteStatus = normalizeTeamStatus(person?.inviteStatus);
  const isRegistered =
    person?.playbackRegistered === true
    || Boolean(person?.playbackRegisteredAt)
    || Boolean(person?.inviteRegisteredAt);

  if (isRegistered || inviteStatus === 'registered') return 'registered';
  if (person?.inviteAcceptedAt) {
    return TEAM_STATUS_ORDER[inviteStatus] >= TEAM_STATUS_ORDER.accepted
      ? inviteStatus
      : 'accepted';
  }
  return inviteStatus;
}

function findAssignedPerson(people, assignment) {
  const personId = String(assignment?.personId || '').trim();
  const email = String(assignment?.email || '').trim().toLowerCase();
  const name = String(assignment?.name || '').trim().toLowerCase();

  return (
    (Array.isArray(people) ? people : []).find((person) => {
      const id = String(person?.id || '').trim();
      const sharedId = String(person?._sharedId || '').trim();
      const personEmail = String(person?.email || '').trim().toLowerCase();
      const personName = String(person?.name || '').trim().toLowerCase();
      return (
        (personId && (id === personId || sharedId === personId))
        || (email && personEmail === email)
        || (name && personName === name)
      );
    }) || null
  );
}

function resolveServiceTeamResponse(svcId, assignment, person, responseMap) {
  const keys = [
    person?.id,
    person?._sharedId,
    assignment?.personId,
    person?.email,
    assignment?.email,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  let bestStatus = normalizeTeamStatus(assignment?.status);
  let bestRank = TEAM_STATUS_ORDER[bestStatus] ?? 0;

  for (const key of keys) {
    const response = responseMap?.[`${svcId}_${key}`];
    if (!response) continue;
    const status = normalizeTeamStatus(response.status || response.response);
    const rank = TEAM_STATUS_ORDER[status] ?? 0;
    if (rank >= bestRank) {
      bestStatus = status;
      bestRank = rank;
    }
  }

  const personStatus = getEffectiveInviteTeamStatus(person);
  const personRank = TEAM_STATUS_ORDER[personStatus] ?? 0;
  if (personRank >= bestRank) {
    bestStatus = personStatus;
  }

  return bestStatus;
}

function responseTimestampValue(entry) {
  const raw =
    entry?.respondedAt
    || entry?.responded_at
    || entry?.timestamp
    || null;
  const parsed = Date.parse(raw || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldPreferAssignmentEntry(currentEntry, nextEntry) {
  const currentStatus = normalizeAssignmentStatus(currentEntry?.status || currentEntry?.response);
  const nextStatus = normalizeAssignmentStatus(nextEntry?.status || nextEntry?.response);
  const currentRank = ASSIGNMENT_STATUS_ORDER[currentStatus] ?? 0;
  const nextRank = ASSIGNMENT_STATUS_ORDER[nextStatus] ?? 0;

  if (nextRank !== currentRank) return nextRank > currentRank;

  const currentTs = responseTimestampValue(currentEntry);
  const nextTs = responseTimestampValue(nextEntry);
  if (nextTs !== currentTs) return nextTs > currentTs;

  return Boolean(nextEntry?.respondedAt || nextEntry?.responded_at)
    && !Boolean(currentEntry?.respondedAt || currentEntry?.responded_at);
}

function resolveServiceTeamAssignmentResponse(svcId, assignment, person, responseMap) {
  const keys = [
    person?.id,
    person?._sharedId,
    assignment?.personId,
    person?.email,
    assignment?.email,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  let bestEntry = {
    status: normalizeAssignmentStatus(assignment?.status),
    declineReason: String(assignment?.declineReason || '').trim(),
    respondedAt: assignment?.responded_at || assignment?.respondedAt || null,
  };

  for (const key of keys) {
    const response = responseMap?.[`${svcId}_${key}`];
    if (!response) continue;
    const nextEntry = {
      status: normalizeAssignmentStatus(response.status || response.response),
      declineReason: String(response.declineReason || '').trim(),
      respondedAt: response.respondedAt || response.responded_at || response.timestamp || null,
    };
    if (shouldPreferAssignmentEntry(bestEntry, nextEntry)) {
      bestEntry = nextEntry;
    }
  }

  return bestEntry;
}

function formatDateTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function membershipStatusLabel(status) {
  if (status === 'registered') return 'Registered';
  if (status === 'accepted') return 'Invite Accepted';
  return 'Invite Pending';
}

function assignmentStatusLabel(status) {
  if (status === 'accepted') return 'Accepted';
  if (status === 'declined') return 'Declined';
  return 'Pending';
}

function assignmentResponseMetaText(response) {
  const status = normalizeAssignmentStatus(response?.status || response?.response);
  const stamp = formatDateTime(response?.respondedAt || response?.responded_at || response?.timestamp);
  if (!stamp || status === 'pending') return '';
  return `${status === 'declined' ? 'Declined' : 'Accepted'} ${stamp}`;
}

function assignmentMessageMetaText(message) {
  if (message?.messageType !== 'assignment_response') return '';
  const status = normalizeAssignmentStatus(message?.metadata?.status);
  const statusLabel = assignmentStatusLabel(status);
  const serviceName = String(message?.metadata?.serviceName || '').trim();
  const stamp = formatDateTime(message?.metadata?.respondedAt || message?.timestamp);
  return [statusLabel, serviceName, stamp].filter(Boolean).join(' • ');
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(tid); }
}

function monthLabel(dateStr) {
  if (!dateStr) return 'Undated';
  const [year, month, day] = String(dateStr).split('T')[0].split('-').map(Number);
  const d = year && month && day ? new Date(year, month - 1, day) : new Date(dateStr);
  if (isNaN(d)) return 'Undated';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dayNum(dateStr) {
  if (!dateStr) return '?';
  const [year, month, day] = String(dateStr).split('T')[0].split('-').map(Number);
  const d = year && month && day ? new Date(year, month - 1, day) : new Date(dateStr);
  return isNaN(d) ? '?' : d.getDate();
}

function dayShortMonth(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = String(dateStr).split('T')[0].split('-').map(Number);
  const d = year && month && day ? new Date(year, month - 1, day) : new Date(dateStr);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short' });
}

function formatServiceDate(dateStr) {
  if (!dateStr) return '?';
  const [year, month, day] = String(dateStr).split('T')[0].split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

function todayDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function serviceSortKey(svc) {
  return `${svc?.date || '0000-00-00'}T${svc?.time || '00:00'}`;
}

function isPastService(svc, today = todayDateStr()) {
  return !!svc?.date && svc.date < today;
}

export default function AdminDashboardScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { mdRole } = route.params || {};
  // org_owner and admin have full access; manager can approve but not delete/grant; md is legacy
  const isOrgOwner = mdRole === 'org_owner';
  const isAdmin    = mdRole === 'admin' || isOrgOwner;
  // Worship Leader ('manager') and Music Director ('md') share the same access level
  const isManager  = mdRole === 'manager' || mdRole === 'md';
  // canApprove = org_owner, admin, worship_leader, md
  const canApprove = isAdmin || isManager;
  // add/edit members, add songs, create services — available to all elevated roles
  const canManageMembers = isAdmin || isManager;
  // Only Org Owner and Admin can delete services
  const canDeleteServices = isAdmin;

  const [tab, setTab]         = useState('Calendar');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [error, setError]     = useState(null);

  // Server data
  const [messages, setMessages] = useState([]);
  const [services, setServices] = useState([]);
  const [people, setPeople]     = useState([]);
  const [plans, setPlans]       = useState({});

  // Messages
  const [selectedMsg, setSelectedMsg]   = useState(null);
  const [replyText, setReplyText]       = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState(false);

  // Services — create form
  const [showNewService, setShowNewService] = useState(false);
  const [newSvcName, setNewSvcName]         = useState('');
  const [newSvcDate, setNewSvcDate]         = useState('');
  const [newSvcTime, setNewSvcTime]         = useState('');
  const [savingSvc, setSavingSvc]           = useState(false);
  const [showArchivedServices, setShowArchivedServices] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [deletingServiceId, setDeletingServiceId] = useState(null);
  const serviceSwipeRefs = useRef({});
  const openServiceSwipeIdRef = useRef(null);

  // Expanded service plan (both Calendar + Services tabs share this)
  const [expandedSvc, setExpandedSvc] = useState(null);

  // Song picker
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [songQuery, setSongQuery]           = useState('');
  const [svcForSong, setSvcForSong]         = useState(null); // which service to add to

  // Team assign modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget]       = useState(null);
  const [chipRole, setChipRole]               = useState('');
  const [saving, setSaving]                   = useState(false);
  // Blockouts grouped by date: { 'YYYY-MM-DD': ['email1', 'email2'] }
  const [allBlockouts, setAllBlockouts]       = useState({});
  // Assignment responses: { assignmentId: { email, status, updatedAt } }
  const [assignmentResponses, setAssignmentResponses] = useState({});

  // Team — add member (MD + Admin)
  const [showAddMember, setShowAddMember]   = useState(false);
  const [newMemberName, setNewMemberName]   = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole]   = useState('');
  const [savingMember, setSavingMember]     = useState(false);

  // Library search
  const [libQuery, setLibQuery] = useState('');
  const [songs, setSongs] = useState([]); // full song library from KV

  // Vocal assignments { [svcId]: { [songId]: { [partKey]: { personId, name, role } } } }
  const [vocalAssignments, setVocalAssignments]   = useState({});
  const [expandedVocalSong, setExpandedVocalSong] = useState(null); // { svcId, songId }
  const [vocalPartPicker, setVocalPartPicker]     = useState(null); // { svcId, songId, partKey, partLabel }
  const [savingVocals, setSavingVocals]           = useState(false);

  // Proposals
  const [proposals, setProposals] = useState([]);
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);

  // Pending services & songs (from Leaders)
  const [pendingServices, setPendingServices] = useState([]);
  const [pendingSongs, setPendingSongs]       = useState([]);
  const [approvingSvcId, setApprovingSvcId]   = useState(null);
  const [approvingSongId, setApprovingSongId] = useState(null);

  // Role grant modal
  const [showGrantRole, setShowGrantRole]   = useState(null); // person object
  const [grantingRole, setGrantingRole]     = useState('');
  const [savingGrant, setSavingGrant]       = useState(false);

  // Edit member modal
  const [showEditMember, setShowEditMember] = useState(null);
  const [editName, setEditName]             = useState('');
  const [editEmail, setEditEmail]           = useState('');
  const [editRole, setEditRole]             = useState('');
  const [savingEdit, setSavingEdit]         = useState(false);
  const [editMemberKeyboardHeight, setEditMemberKeyboardHeight] = useState(0);
  const editNameInputRef = useRef(null);
  const editEmailInputRef = useRef(null);

  // Add song to library
  const [showAddSong, setShowAddSong]         = useState(false);
  const [newSongTitle, setNewSongTitle]       = useState('');
  const [newSongArtist, setNewSongArtist]     = useState('');
  const [newSongKey, setNewSongKey]           = useState('');
  const [newSongBpm, setNewSongBpm]           = useState('');
  const [newSongYouTube, setNewSongYouTube]   = useState('');
  const [newSongLyrics, setNewSongLyrics]     = useState('');
  const [newSongChords, setNewSongChords]     = useState('');
  const [addSongTab, setAddSongTab]           = useState('info'); // 'info' | 'lyrics' | 'chords'
  const [savingNewSong, setSavingNewSong]     = useState(false);

  // Compose message (outbound from admin/manager)
  const [showCompose, setShowCompose]       = useState(false);
  const [composeTo, setComposeTo]           = useState('all_team');
  const [composeToName, setComposeToName]   = useState('All Team');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody]       = useState('');
  const [sendingCompose, setSendingCompose] = useState(false);
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  React.useEffect(() => { loadAll(); }, []);

  React.useEffect(() => {
    if (!showEditMember) {
      setEditMemberKeyboardHeight(0);
      return undefined;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const changeEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : null;
    const handleShow = (event) => {
      const nextHeight = Math.max(
        0,
        Number(event?.endCoordinates?.height || 0) - Math.max(insets.bottom, 0),
      );
      setEditMemberKeyboardHeight(nextHeight);
    };
    const handleHide = () => setEditMemberKeyboardHeight(0);
    const showSub = Keyboard.addListener(showEvent, handleShow);
    const hideSub = Keyboard.addListener(hideEvent, handleHide);
    const changeSub = changeEvent ? Keyboard.addListener(changeEvent, handleShow) : null;
    return () => {
      showSub.remove();
      hideSub.remove();
      changeSub?.remove();
    };
  }, [showEditMember, insets.bottom]);

  React.useEffect(() => {
    if (!showEditMember) return undefined;
    const focusTimer = setTimeout(() => {
      editNameInputRef.current?.focus?.();
    }, 250);
    return () => clearTimeout(focusTimer);
  }, [showEditMember]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Restore from local cache first so UI shows instantly on Metro reload
    try {
      const cached = await AsyncStorage.getItem(ADMIN_LIBRARY_CACHE_KEY);
      if (cached) {
        const lib = JSON.parse(cached);
        if (lib.services?.length || lib.people?.length || lib.songs?.length) {
          setServices(lib.services || []);
          setPlans(lib.plans     || {});
          setSongs(lib.songs     || []);
          setVocalAssignments(lib.vocalAssignments || {});
          // Include orphaned team members (assigned in plans but not in people[])
          const cacheEmails = new Set((lib.people||[]).map(p=>(p.email||'').toLowerCase()).filter(Boolean));
          const cacheNames  = new Set((lib.people||[]).map(p=>(p.name||'').toLowerCase().trim()).filter(Boolean));
          const cacheOrphans = [];
          Object.values(lib.plans||{}).forEach(plan=>{
            (plan.team||[]).forEach(tm=>{
              const em=(tm.email||'').toLowerCase(), nm=(tm.name||'').toLowerCase().trim();
              if(!nm) return;
              if((em&&cacheEmails.has(em))||cacheNames.has(nm)) return;
              cacheOrphans.push({id:tm.personId||`orphan_${nm.replace(/\s/g,'_')}`,name:tm.name||'',email:tm.email||'',roles:tm.role?[tm.role]:[],inviteStatus:'plan_only'});
              if(em) cacheEmails.add(em); cacheNames.add(nm);
            });
          });
          setPeople([...(lib.people||[]), ...cacheOrphans]);
        }
      }
    } catch (_) {}

    try {
      const hdrs = syncHeaders();
      const [prof, msgs, lib, props, pSvcs, pSongs] = await Promise.all([
        getUserProfile(),
        fetchJson(`${SYNC_URL}/sync/messages/admin`, { headers: hdrs }).catch(() => []),
        fetchJson(`${SYNC_URL}/sync/library-pull`,   { headers: hdrs }).catch(() => ({})),
        fetchJson(`${SYNC_URL}/sync/proposals`,       { headers: hdrs }).catch(() => []),
        fetchJson(`${SYNC_URL}/sync/services/pending`,        { headers: hdrs }).catch(() => []),
        fetchJson(`${SYNC_URL}/sync/library/pending-songs`,   { headers: hdrs }).catch(() => []),
      ]);
      setProfile(prof);
      setMessages(Array.isArray(msgs) ? msgs : []);

      // Only update state + cache if server returned real data (non-empty arrays).
      // An empty server response (e.g. network error → catch → {}) must never
      // override the local cache we already restored above.
      const serverHasData =
        (lib.people?.length > 0) ||
        (lib.services?.length > 0) ||
        (lib.songs?.length > 0);
      if (serverHasData) {
        setServices(lib.services || []);
        setPlans(lib.plans     || {});
        setSongs(lib.songs     || []);
        setVocalAssignments(lib.vocalAssignments || {});

        // Surface team members who appear in plan.team but not in people[] —
        // they were assigned from UM without being added to the people list.
        const knownEmails = new Set(
          (lib.people || []).map(p => (p.email || '').toLowerCase()).filter(Boolean)
        );
        const knownNames = new Set(
          (lib.people || []).map(p => (p.name || '').toLowerCase().trim()).filter(Boolean)
        );
        const orphans = [];
        Object.values(lib.plans || {}).forEach(plan => {
          (plan.team || []).forEach(tm => {
            const email = (tm.email || '').toLowerCase();
            const name  = (tm.name  || '').toLowerCase().trim();
            if (!name) return;
            if ((email && knownEmails.has(email)) || knownNames.has(name)) return;
            orphans.push({
              id: tm.personId || `orphan_${name.replace(/\s/g,'_')}`,
              name: tm.name || '',
              email: tm.email || '',
              roles: tm.role ? [tm.role] : [],
              inviteStatus: 'plan_only',
            });
            if (email) knownEmails.add(email);
            knownNames.add(name);
          });
        });
        setPeople([...(lib.people || []), ...orphans]);

        AsyncStorage.setItem(ADMIN_LIBRARY_CACHE_KEY, JSON.stringify(lib)).catch(() => {});
      }

      setProposals(Array.isArray(props) ? props : []);
      setPendingServices(Array.isArray(pSvcs) ? pSvcs.filter(s => s.status === 'pending_approval') : []);
      setPendingSongs(Array.isArray(pSongs) ? pSongs.filter(s => s.status === 'pending_approval') : []);

      // Build blockouts dict: { 'YYYY-MM-DD': ['email1', ...] }
      const bDict = {};
      for (const b of (lib.blockouts || [])) {
        if (!bDict[b.date]) bDict[b.date] = [];
        bDict[b.date].push((b.email || '').toLowerCase());
      }
      setAllBlockouts(bDict);

      // Build assignment responses — merge plan team statuses + server responses endpoint
      const rDict = {};

      // Source 1: plan.team[].status — stored by UUID and email (if present)
      Object.entries(lib.plans || {}).forEach(([svcId, plan]) => {
        (plan.team || []).forEach(tm => {
          if (tm.status && tm.status !== 'pending') {
            const obj = {
              status: tm.status,
              declineReason: tm.declineReason || '',
              respondedAt: tm.responded_at || tm.respondedAt || null,
            };
            if (tm.personId) rDict[`${svcId}_${tm.personId}`] = obj;
            if (tm.email) rDict[`${svcId}_${tm.email.toLowerCase()}`] = obj;
          }
        });
      });

      // Source 2: /sync/assignment/responses — server-authoritative, stored by BOTH UUID and email
      // so the render can find it regardless of which key (personId vs email) the team entry uses.
      try {
        const hdrs = syncHeaders();
        const emailToPid = {};
        (lib.people || []).forEach(p => {
          if (p.email) emailToPid[p.email.toLowerCase()] = p.id;
        });
        const svcIds = Object.keys(lib.plans || {});
        await Promise.all(svcIds.map(async svcId => {
          const res = await fetchJson(`${SYNC_URL}/sync/assignment/responses?serviceId=${svcId}`, { headers: hdrs }).catch(() => null);
          if (!res || typeof res !== 'object') return;
          // Server returns { email: { status, declineReason } }
          const entries = Array.isArray(res) ? res.map(r => [r.email || '', r]) : Object.entries(res);
          entries.forEach(([emailKey, val]) => {
            const statusObj = {
              status: val.status || val.response || 'pending',
              declineReason: val.declineReason || '',
              respondedAt: val.responded_at || val.respondedAt || val.timestamp || null,
            };
            const pid = emailToPid[emailKey.toLowerCase()];
            if (pid) rDict[`${svcId}_${pid}`] = statusObj;         // match by UUID (tm.personId)
            rDict[`${svcId}_${emailKey.toLowerCase()}`] = statusObj; // match by email (tm.email)
          });
        }));
      } catch (_) {}

      setAssignmentResponses(rDict);
    } catch (e) {
      setError(e.message || 'Server unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Publish helper ──────────────────────────────────────────────────────
  const publishUpdate = async (updatedPlans, updatedServices, updatedPeople) => {
    const hdrs = syncHeaders();
    const lib = await fetchJson(`${SYNC_URL}/sync/library-pull`, { headers: hdrs });
    const payload = {
      services: updatedServices || lib.services,
      people:   updatedPeople   || lib.people,
      plans:    updatedPlans    || lib.plans,
      songs:    lib.songs       || [],
    };
    await fetchJson(`${SYNC_URL}/sync/library-push`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify(payload),
    });
    // Cache locally so Metro reloads don't lose data
    AsyncStorage.setItem(ADMIN_LIBRARY_CACHE_KEY, JSON.stringify(payload)).catch(() => {});
  };

  const closeServiceSwipe = useCallback((serviceId) => {
    if (!serviceId) return;
    serviceSwipeRefs.current[serviceId]?.close?.();
    if (openServiceSwipeIdRef.current === serviceId) {
      openServiceSwipeIdRef.current = null;
    }
  }, []);

  const handleServiceSwipeOpen = useCallback((serviceId) => {
    const previousId = openServiceSwipeIdRef.current;
    if (previousId && previousId !== serviceId) {
      serviceSwipeRefs.current[previousId]?.close?.();
    }
    openServiceSwipeIdRef.current = serviceId;
  }, []);

  // ── Reply to message ────────────────────────────────────────────────────
  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      await fetchJson(
        `${SYNC_URL}/sync/message/reply?messageId=${encodeURIComponent(selectedMsg.id)}`,
        { method: 'POST', headers: syncHeaders(),
          body: JSON.stringify({ reply_text: replyText.trim(), admin_name: profile?.name || (isAdmin ? 'Admin' : 'Manager') }) }
      );
      setReplyText('');
      Alert.alert('Sent ✓', 'Reply delivered.');
      loadAll(); setSelectedMsg(null);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSendingReply(false); }
  };

  const deleteSelectedMessage = useCallback(async () => {
    if (!selectedMsg?.id) return;
    setDeletingMessage(true);
    try {
      await fetchJson(
        `${SYNC_URL}/sync/message?messageId=${encodeURIComponent(selectedMsg.id)}&scope=global`,
        {
          method: 'DELETE',
          headers: syncHeaders(),
        }
      );
      setSelectedMsg(null);
      await loadAll();
    } catch (e) {
      Alert.alert('Error', `Could not delete message: ${e.message}`);
    } finally {
      setDeletingMessage(false);
    }
  }, [loadAll, selectedMsg]);

  const confirmDeleteSelectedMessage = useCallback(() => {
    if (!selectedMsg?.id) return;
    Alert.alert(
      'Delete message thread?',
      'This removes the thread from the shared admin inbox in Ultimate Playback and Ultimate Musician.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteSelectedMessage();
          },
        },
      ]
    );
  }, [deleteSelectedMessage, selectedMsg]);

  const deleteInboxMessage = useCallback(async (message) => {
    if (!message?.id) return;
    setDeletingMessage(true);
    try {
      await fetchJson(
        `${SYNC_URL}/sync/message?messageId=${encodeURIComponent(message.id)}&scope=global`,
        {
          method: 'DELETE',
          headers: syncHeaders(),
        }
      );
      if (selectedMsg?.id === message.id) setSelectedMsg(null);
      await loadAll();
    } catch (e) {
      Alert.alert('Error', `Could not delete message: ${e.message}`);
    } finally {
      setDeletingMessage(false);
    }
  }, [loadAll, selectedMsg?.id]);

  const confirmDeleteInboxMessage = useCallback((message) => {
    if (!message?.id) return;
    Alert.alert(
      'Delete message thread?',
      'This removes the thread from the shared admin inbox in Ultimate Playback and Ultimate Musician.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteInboxMessage(message);
          },
        },
      ]
    );
  }, [deleteInboxMessage]);

  // ── Create service ──────────────────────────────────────────────────────
  const handleCreateService = async () => {
    if (!newSvcName.trim()) { Alert.alert('Required', 'Service name is required.'); return; }
    if (!newSvcDate.trim()) { Alert.alert('Required', 'Date is required (YYYY-MM-DD).'); return; }
    setSavingSvc(true);
    try {
      const newSvc = {
        id: `svc_${Date.now()}`, name: newSvcName.trim(), title: newSvcName.trim(),
        date: newSvcDate.trim(), time: newSvcTime.trim(), serviceType: 'standard', status: 'draft',
        created_by_name:  profile?.name  || (isAdmin ? 'Admin' : 'Worship Leader'),
        created_by_email: profile?.email || '',
        created_by_at:    new Date().toISOString(),
      };
      await publishUpdate(plans, [...services, newSvc], null);
      setNewSvcName(''); setNewSvcDate(''); setNewSvcTime('');
      setShowNewService(false);
      Alert.alert('Created ✓', `Service "${newSvc.name}" added.`);
      loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSavingSvc(false); }
  };

  const handleDeleteService = useCallback(async (svc) => {
    if (!svc?.id) return;
    setDeletingServiceId(svc.id);
    try {
      await fetchJson(`${SYNC_URL}/sync/service/delete`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({ serviceId: svc.id }),
      });
      setExpandedSvc((current) => (current?.id === svc.id ? null : current));
      setServices((current) => current.filter((service) => service?.id !== svc.id));
      setPlans((current) => {
        const next = { ...current };
        delete next[svc.id];
        return next;
      });
      setVocalAssignments((current) => {
        const next = { ...current };
        delete next[svc.id];
        return next;
      });
      closeServiceSwipe(svc.id);
      await loadAll();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setDeletingServiceId(null);
    }
  }, [closeServiceSwipe, loadAll]);

  const confirmDeleteService = useCallback((svc) => {
    if (!svc?.id) return;
    closeServiceSwipe(svc.id);
    Alert.alert(
      'Delete service?',
      `Delete "${svc.name || svc.title || 'this service'}"? This removes the service plan and team assignments from Ultimate Playback.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void handleDeleteService(svc);
          },
        },
      ],
    );
  }, [closeServiceSwipe, handleDeleteService]);

  // ── Add song to service ─────────────────────────────────────────────────
  const handleAddSong = async (song) => {
    const target = svcForSong || expandedSvc;
    if (!target) return;
    try {
      const plan = { ...(plans[target.id] || { songs: [], team: [], notes: '' }) };
      if ((plan.songs || []).some(s => s.id === song.id || (s.title === song.title && s.artist === song.artist))) {
        Alert.alert('Already added', `"${song.title}" is already in this setlist.`); return;
      }
      plan.songs = [...(plan.songs || []), { ...song, id: song.id || `song_${Date.now()}` }];
      await publishUpdate({ ...plans, [target.id]: plan }, null, null);
      setShowSongPicker(false); setSongQuery(''); setSvcForSong(null);
      Alert.alert('Added ✓', `"${song.title}" added.`);
      loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
  };

  // ── Remove song ─────────────────────────────────────────────────────────
  const handleRemoveSong = async (svcId, songId) => {
    try {
      const plan = { ...(plans[svcId] || { songs: [], team: [], notes: '' }) };
      plan.songs = (plan.songs || []).filter(s => s.id !== songId);
      await publishUpdate({ ...plans, [svcId]: plan }, null, null); loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
  };

  // ── Assign team member ──────────────────────────────────────────────────
  const handleAssign = async (person) => {
    if (!chipRole.trim()) { Alert.alert('Select Role', 'Tap a role chip first.'); return; }
    setSaving(true);
    try {
      const svcId = assignTarget.id;
      const plan = { ...(plans[svcId] || { songs: [], team: [], notes: '' }) };
      plan.team = (plan.team || []).filter(t => !(t.personId === person.id && t.role === chipRole));
      plan.team = [...plan.team, { id: `ta_${Date.now()}`, personId: person.id, email: (person.email || '').toLowerCase(), name: person.name, role: chipRole }];
      await publishUpdate({ ...plans, [svcId]: plan }, null, null);
      setShowAssignModal(false); setChipRole('');
      Alert.alert('Assigned ✓', `${person.name} → ${chipRole}`); loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  // ── Remove team member from service ────────────────────────────────────
  const handleRemoveFromService = async (svcId, personId, role) => {
    try {
      const plan = { ...(plans[svcId] || { songs: [], team: [], notes: '' }) };
      plan.team = (plan.team || []).filter(t => !(t.personId === personId && t.role === role));
      await publishUpdate({ ...plans, [svcId]: plan }, null, null); loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
  };

  // ── Add member to people list (MD + Admin) ──────────────────────────────
  const handleAddMember = async () => {
    if (!newMemberName.trim()) { Alert.alert('Required', 'Name is required.'); return; }
    setSavingMember(true);
    try {
      const newPerson = {
        id: `person_${Date.now()}`, name: newMemberName.trim(),
        email: newMemberEmail.trim(), roles: newMemberRole ? [newMemberRole] : [],
      };
      await publishUpdate(plans, services, [...people, newPerson]);
      setNewMemberName(''); setNewMemberEmail(''); setNewMemberRole('');
      setShowAddMember(false); loadAll();

      // Send invitation email automatically for new members with an email
      const email = newPerson.email.trim().toLowerCase();
      if (email) {
        try {
          await fetchJson(`${SYNC_URL}/sync/invite/create`, {
            method: 'POST',
            headers: syncHeaders(),
            body: JSON.stringify({
              name: newPerson.name,
              email,
              sendEmail: true,
              invitedByName: profile?.name || 'Admin',
            }),
          });
          Alert.alert('Added & Invited ✓', `${newPerson.name} was added and an invitation email was sent to ${email}.`);
        } catch (_) {
          Alert.alert('Added ✓', `${newPerson.name} added to team.\n⚠️ Invitation email could not be sent — check Resend config.`);
        }
      } else {
        Alert.alert('Added ✓', `${newPerson.name} added.\nNo email provided — invitation not sent.`);
      }
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSavingMember(false); }
  };

  // ── Publish service to team ─────────────────────────────────────────────
  const [publishingId, setPublishingId] = useState(null);

  const handlePublish = async (svc) => {
    const plan = plans[svc.id] || {};
    const team = plan.team || [];
    if (team.length === 0) {
      Alert.alert('No Team', 'Assign at least one team member before publishing.');
      return;
    }
    setPublishingId(svc.id);
    try {
      await fetchJson(`${SYNC_URL}/sync/publish`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({
          serviceId: svc.id,
          plan,
          vocalAssignments: vocalAssignments[svc.id] || {},
        }),
      });
      Alert.alert(
        '📤 Published ✓',
        `"${svc.name || svc.title}" sent to ${team.length} team member${team.length > 1 ? 's' : ''}.\nThey'll see it in their Assignments.`
      );
      loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setPublishingId(null); }
  };

  // ── Assign vocal part to person ─────────────────────────────────────────
  const handleAssignVocalPart = async (svcId, songId, partKey, person) => {
    setSavingVocals(true);
    try {
      const svcVocals = { ...(vocalAssignments[svcId] || {}) };
      if (!svcVocals[songId]) svcVocals[songId] = {};
      if (person) {
        svcVocals[songId] = {
          ...svcVocals[songId],
          [partKey]: { personId: person.id, name: person.name, role: (person.roles || [])[0] || '' },
        };
      } else {
        const updated = { ...svcVocals[songId] };
        delete updated[partKey];
        svcVocals[songId] = updated;
      }
      const updatedAll = { ...vocalAssignments, [svcId]: svcVocals };
      setVocalAssignments(updatedAll);
      setVocalPartPicker(null);
      await fetchJson(`${SYNC_URL}/sync/publish`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({ serviceId: svcId, plan: plans[svcId] || {}, vocalAssignments: svcVocals }),
      });
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSavingVocals(false); }
  };

  // ── Delete member (Admin only) ──────────────────────────────────────────
  const handleDeleteMember = (person) => {
    Alert.alert('Remove member?', `Remove ${person.name} from the team?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const pid   = (person.id    || '').toLowerCase();
        const pem   = (person.email || '').toLowerCase();
        const pname = (person.name  || '').toLowerCase().trim();

        // Remove from people[]
        const updatedPeople = people.filter(p => {
          if (pid && (p.id || '').toLowerCase() === pid) return false;
          if (pem && (p.email || '').toLowerCase() === pem) return false;
          if (pname && (p.name || '').toLowerCase().trim() === pname) return false;
          return true;
        });

        // Also strip from every plan.team so the orphan logic can't re-add them
        const updatedPlans = {};
        Object.entries(plans).forEach(([svcId, plan]) => {
          updatedPlans[svcId] = {
            ...plan,
            team: (plan.team || []).filter(tm => {
              if (pid && (tm.personId || '').toLowerCase() === pid) return false;
              if (pem && (tm.email   || '').toLowerCase() === pem) return false;
              if (pname && (tm.name  || '').toLowerCase().trim() === pname) return false;
              return true;
            }),
          };
        });

        // Optimistic UI update
        setPeople(updatedPeople);
        setPlans(updatedPlans);

        try {
          const payload = { services, people: updatedPeople, plans: updatedPlans, songs: [] };
          await fetchJson(`${SYNC_URL}/sync/library-push`, {
            method: 'POST',
            headers: syncHeaders(),
            body: JSON.stringify(payload),
          });
          AsyncStorage.setItem(ADMIN_LIBRARY_CACHE_KEY, JSON.stringify(payload)).catch(() => {});
        } catch (e) {
          // Revert on failure
          setPeople(people);
          setPlans(plans);
          Alert.alert('Error', e.message);
        }
      }},
    ]);
  };

  // ── Approve proposal ──────────────────────────────────────────────────
  const handleApproveProposal = async (proposal) => {
    setApprovingId(proposal.id);
    try {
      await fetchJson(`${SYNC_URL}/sync/proposal/approve?id=${encodeURIComponent(proposal.id)}`, {
        method: 'POST', headers: syncHeaders(),
      });
      Alert.alert('Approved ✓', `"${proposal.songTitle}" ${proposal.instrument || proposal.type} chart is now live.`);
      loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setApprovingId(null); }
  };

  // ── Reject proposal ────────────────────────────────────────────────────
  const handleRejectProposal = async (proposal) => {
    Alert.alert('Reject proposal?', `Remove this ${proposal.instrument || proposal.type} submission from ${proposal.from_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        setRejectingId(proposal.id);
        try {
          await fetchJson(`${SYNC_URL}/sync/proposal/reject?id=${encodeURIComponent(proposal.id)}`, {
            method: 'POST', headers: syncHeaders(),
          });
          setProposals(prev => prev.filter(p => p.id !== proposal.id));
        } catch (e) { Alert.alert('Error', e.message); }
        finally { setRejectingId(null); }
      }},
    ]);
  };

  // ── Approve/reject pending service (from Leader) ────────────────────────
  const handleApprovePendingService = async (svc) => {
    setApprovingSvcId(svc.id);
    try {
      await fetchJson(`${SYNC_URL}/sync/services/approve?id=${encodeURIComponent(svc.id)}`, { method: 'POST', headers: syncHeaders() });
      setPendingServices(prev => prev.filter(s => s.id !== svc.id));
      Alert.alert('Approved ✓', `"${svc.name}" is now live.`);
      loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setApprovingSvcId(null); }
  };

  const handleRejectPendingService = (svc) => {
    Alert.alert('Reject service?', `Reject "${svc.name}" submitted by ${svc.created_by_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        try {
          await fetchJson(`${SYNC_URL}/sync/services/reject?id=${encodeURIComponent(svc.id)}`, { method: 'POST', headers: syncHeaders(), body: JSON.stringify({}) });
          setPendingServices(prev => prev.filter(s => s.id !== svc.id));
        } catch (e) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  // ── Approve/reject pending song (from Leader) ────────────────────────────
  const handleApprovePendingSong = async (song) => {
    setApprovingSongId(song.id);
    try {
      await fetchJson(`${SYNC_URL}/sync/library/song-approve?id=${encodeURIComponent(song.id)}`, { method: 'POST', headers: syncHeaders() });
      setPendingSongs(prev => prev.filter(s => s.id !== song.id));
      Alert.alert('Approved ✓', `"${song.title}" added to library.`);
      loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setApprovingSongId(null); }
  };

  const handleRejectPendingSong = (song) => {
    Alert.alert('Reject song?', `Reject "${song.title}" proposed by ${song.from_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        try {
          await fetchJson(`${SYNC_URL}/sync/library/song-reject?id=${encodeURIComponent(song.id)}`, { method: 'POST', headers: syncHeaders(), body: JSON.stringify({}) });
          setPendingSongs(prev => prev.filter(s => s.id !== song.id));
        } catch (e) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  // ── Grant app role (Admin only) ─────────────────────────────────────────
  const handleGrantRole = async () => {
    if (!showGrantRole || !grantingRole) return;
    setSavingGrant(true);
    try {
      // 'none' = revoke grant (send null)
      const roleValue = grantingRole === 'none' ? null : grantingRole;
      await fetchJson(`${SYNC_URL}/sync/grant`, {
        method: 'POST', headers: syncHeaders(),
        body: JSON.stringify({ email: showGrantRole.email, name: showGrantRole.name, role: roleValue }),
      });
      setShowGrantRole(null); setGrantingRole('');
      Alert.alert('Role granted ✓', `${showGrantRole.name} is now ${grantingRole}.`);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSavingGrant(false); }
  };

  // ── Edit member (Admin + Manager) ──────────────────────────────────────
  const handleEditMember = async () => {
    if (!showEditMember || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const updated = people.map(p =>
        p.id === showEditMember.id
          ? { ...p, name: editName.trim(), email: editEmail.trim(), roles: editRole ? [editRole] : (p.roles || []) }
          : p
      );
      await publishUpdate(plans, services, updated);
      setShowEditMember(null);
      loadAll();
      Alert.alert('Saved ✓', 'Member updated.');
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSavingEdit(false); }
  };

  // ── Add song to library (Admin + Manager) ───────────────────────────────
  const handleAddSongToLibrary = async () => {
    if (!newSongTitle.trim()) { Alert.alert('Required', 'Song title is required.'); return; }
    setSavingNewSong(true);
    try {
      const hdrs = syncHeaders();
      const lib = await fetchJson(`${SYNC_URL}/sync/library-pull`, { headers: hdrs });
      const newSong = {
        id: `song_${Date.now()}`,
        title: newSongTitle.trim(),
        artist: newSongArtist.trim(),
        key: newSongKey.trim(),
        bpm: newSongBpm ? parseInt(newSongBpm, 10) : undefined,
        youtubeUrl: newSongYouTube.trim() || undefined,
        lyrics: newSongLyrics.trim() || undefined,
        chordChart: newSongChords.trim() || undefined,
      };
      await fetchJson(`${SYNC_URL}/sync/library-push`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ ...lib, songs: [...(lib.songs || []), newSong] }),
      });
      setNewSongTitle(''); setNewSongArtist(''); setNewSongKey(''); setNewSongBpm('');
      setNewSongYouTube(''); setNewSongLyrics(''); setNewSongChords(''); setAddSongTab('info');
      setShowAddSong(false);
      Alert.alert('Added ✓', `"${newSong.title}" added to library.`);
      loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSavingNewSong(false); }
  };

  // ── Compose message (Admin + Manager outbound) ──────────────────────────
  const handleCompose = async () => {
    if (!composeSubject.trim() || !composeBody.trim()) {
      Alert.alert('Required', 'Subject and message are required.'); return;
    }
    const toTarget = String(composeTo || '').trim().toLowerCase();
    if (!toTarget) {
      Alert.alert('Required', 'Choose a recipient.'); return;
    }
    setSendingCompose(true);
    try {
      await fetchJson(`${SYNC_URL}/sync/message`, {
        method: 'POST', headers: syncHeaders(),
        body: JSON.stringify({
          fromEmail: profile?.email || '',
          fromName: profile?.name || (isAdmin ? 'Admin' : 'Manager'),
          subject: composeSubject.trim(),
          message: composeBody.trim(),
          to: toTarget,
        }),
      });
      setComposeSubject('');
      setComposeBody('');
      setComposeTo('all_team');
      setComposeToName('All Team');
      setPickerSearch('');
      setShowRecipientPicker(false);
      setShowCompose(false);
      Alert.alert('Sent ✓', composeTo === 'all_team' ? 'Message sent to all team.' : `Sent to ${toTarget}.`);
      loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSendingCompose(false); }
  };

  // ── Library: full song library from KV ──────────────────────────────────
  // Enrich each song with which services it appears in
  const libraryAll = songs.map(song => {
    const inServices = [];
    Object.entries(plans).forEach(([svcId, plan]) => {
      if ((plan.songs || []).some(ps => ps.id === song.id || ps.title === song.title)) {
        const svc = services.find(sv => sv.id === svcId);
        inServices.push(svc?.name || svc?.title || svcId);
      }
    });
    return { ...song, _services: inServices };
  });
  const libraryFiltered = libQuery.trim()
    ? libraryAll.filter(s =>
        s.title?.toLowerCase().includes(libQuery.toLowerCase()) ||
        s.artist?.toLowerCase().includes(libQuery.toLowerCase()))
    : libraryAll;

  // ── New Service form (shared between Calendar + Services) ───────────────
  const renderNewServiceForm = () => showNewService ? (
    <View style={s.formCard}>
      <Text style={s.formLabel}>Service Name</Text>
      <TextInput style={s.formInput} value={newSvcName} onChangeText={setNewSvcName}
        placeholder="Sunday Morning Service" placeholderTextColor="#6B7280" />
      <Text style={s.formLabel}>Date</Text>
      <TouchableOpacity
        style={[s.formInput, s.datePickerBtn]}
        onPress={() => setShowDatePicker(v => !v)}
        activeOpacity={0.7}
      >
        <Text style={newSvcDate ? s.datePickerVal : s.datePickerPlaceholder}>
          {newSvcDate || 'Tap to pick a date'}
        </Text>
        <Text style={s.datePickerIcon}>{showDatePicker ? '▲' : '📅'}</Text>
      </TouchableOpacity>
      {showDatePicker && (
        <InlineCalendar
          selectedDate={newSvcDate}
          onSelect={(dateStr) => { setNewSvcDate(dateStr); setShowDatePicker(false); }}
        />
      )}
      <Text style={s.formLabel}>Time (optional)</Text>
      <TextInput style={s.formInput} value={newSvcTime} onChangeText={setNewSvcTime}
        placeholder="09:00 AM" placeholderTextColor="#6B7280" />
      <TouchableOpacity style={[s.saveBtn, savingSvc && s.saveBtnDisabled]}
        onPress={handleCreateService} disabled={savingSvc}>
        {savingSvc ? <ActivityIndicator size="small" color="#FFF" />
          : <Text style={s.saveBtnText}>Create Service</Text>}
      </TouchableOpacity>
    </View>
  ) : null;

  // ── Plan section (used by both Calendar and Services) ───────────────────
  const renderPlanSection = (svc) => {
    const plan  = plans[svc.id] || {};
    const songs = plan.songs || [];
    const team  = plan.team  || [];
    return (
      <View style={s.planSection}>
        {/* Songs */}
        <View style={s.planSubHeader}>
          <Text style={s.planSubTitle}>🎵 Setlist</Text>
          <TouchableOpacity style={s.planAddBtn} onPress={() => {
            setSvcForSong(svc); setSongQuery(''); setShowSongPicker(true);
          }}>
            <Text style={s.planAddBtnText}>+ Add Song</Text>
          </TouchableOpacity>
        </View>
        {songs.length === 0
          ? <Text style={s.planEmpty}>No songs yet — tap "+ Add Song"</Text>
          : songs.map((song, i) => {
            const songVA = (vocalAssignments[svc.id] || {})[song.id] || {};
            const hasVocals = Object.keys(songVA).length > 0;
            const isVocalExpanded = expandedVocalSong?.svcId === svc.id && expandedVocalSong?.songId === song.id;
            return (
              <View key={song.id || i}>
                <View style={s.planSongRow}>
                  <Text style={s.planSongNum}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planSongTitle}>{song.title}</Text>
                    {song.artist ? <Text style={s.planSongArtist}>{song.artist}</Text> : null}
                  </View>
                  {song.key ? <View style={s.keyChip}><Text style={s.keyChipText}>{song.key}</Text></View> : null}
                  <TouchableOpacity
                    style={[s.vocalToggleBtn, hasVocals && s.vocalToggleBtnActive, isVocalExpanded && s.vocalToggleBtnOpen]}
                    onPress={() => setExpandedVocalSong(isVocalExpanded ? null : { svcId: svc.id, songId: song.id })}
                  >
                    <Text style={s.vocalToggleTxt}>🎤{hasVocals ? ' ✓' : ''}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.removeBtn} onPress={() => handleRemoveSong(svc.id, song.id)}>
                    <Text style={s.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
                {isVocalExpanded && (
                  <View style={s.vocalPanel}>
                    <Text style={s.vocalPanelTitle}>Vocal Assignments — {song.title}</Text>
                    {VOCAL_PARTS.map(part => {
                      const assigned = songVA[part.key];
                      return (
                        <TouchableOpacity
                          key={part.key}
                          style={s.vocalPartRow}
                          onPress={() => setVocalPartPicker({ svcId: svc.id, songId: song.id, partKey: part.key, partLabel: part.label })}
                        >
                          <View style={[s.vocalPartDot, { backgroundColor: part.color + '40', borderColor: part.color }]} />
                          <Text style={s.vocalPartLabel}>{part.label}</Text>
                          <View style={{ flex: 1 }} />
                          {assigned ? (
                            <>
                              <Text style={s.vocalAssignedName} numberOfLines={1}>{assigned.name}</Text>
                              <TouchableOpacity
                                onPress={() => handleAssignVocalPart(svc.id, song.id, part.key, null)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Text style={s.vocalClearBtn}>✕</Text>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <Text style={s.vocalUnassigned}>— Tap to assign —</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}

        {/* Team */}
        <View style={[s.planSubHeader, { marginTop: 16 }]}>
          <Text style={s.planSubTitle}>👥 Team</Text>
          <TouchableOpacity style={[s.planAddBtn, { borderColor: '#10B981' }]}
            onPress={() => { setAssignTarget(svc); setChipRole(''); setShowAssignModal(true); }}>
            <Text style={[s.planAddBtnText, { color: '#10B981' }]}>+ Assign</Text>
          </TouchableOpacity>
        </View>
        {team.length === 0
          ? <Text style={s.planEmpty}>No team assigned yet</Text>
          : team.map((tm, i) => {
            const person = findAssignedPerson(people, tm);
            const memberStatus = getEffectiveInviteTeamStatus(person);
            const assignmentResponse = resolveServiceTeamAssignmentResponse(
              svc.id,
              tm,
              person,
              assignmentResponses,
            );
            const respStatus = assignmentResponse.status;
            const assignmentMeta = assignmentResponseMetaText(assignmentResponse);
            return (
              <View key={`${tm.personId}_${i}`} style={s.planTeamRow}>
                <View style={[s.planTeamAvatar, respStatus === 'accepted' && s.avatarAccepted, respStatus === 'declined' && s.avatarDeclined]}>
                  <Text style={s.planTeamAvatarText}>{(tm.name || '?')[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.planTeamName}>{tm.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <View style={s.roleChipSmall}><Text style={s.roleChipSmallText}>{tm.role}</Text></View>
                    <View style={[s.respBadge,
                      memberStatus === 'registered' && s.memberBadgeRegistered,
                      memberStatus === 'accepted' && s.memberBadgeAccepted,
                      memberStatus === 'pending' && s.memberBadgePending,
                    ]}>
                      <Text style={[s.respBadgeText,
                        memberStatus === 'registered' && s.memberTextRegistered,
                        memberStatus === 'accepted' && s.memberTextAccepted,
                        memberStatus === 'pending' && s.memberTextPending,
                      ]}>
                        {membershipStatusLabel(memberStatus)}
                      </Text>
                    </View>
                    <View style={[s.respBadge,
                      respStatus === 'accepted' && s.respBadgeAccepted,
                      respStatus === 'declined' && s.respBadgeDeclined,
                    ]}>
                      <Text style={[s.respBadgeText,
                        respStatus === 'accepted' && s.respTextAccepted,
                        respStatus === 'declined' && s.respTextDeclined,
                      ]}>
                        {assignmentStatusLabel(respStatus)}
                      </Text>
                    </View>
                  </View>
                  {assignmentMeta ? (
                    <Text style={s.planTeamMeta}>{assignmentMeta}</Text>
                  ) : null}
                  {respStatus === 'declined' && assignmentResponse.declineReason ? (
                    <Text style={s.planTeamMetaMuted}>Reason: {assignmentResponse.declineReason}</Text>
                  ) : null}
                </View>
                <TouchableOpacity style={s.removeBtn}
                  onPress={() => handleRemoveFromService(svc.id, tm.personId, tm.role)}>
                  <Text style={s.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}

        {/* ── Publish to Team ─────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.publishBtn, publishingId === svc.id && s.publishBtnDisabled]}
          onPress={() => handlePublish(svc)}
          disabled={publishingId === svc.id}
          activeOpacity={0.8}
        >
          {publishingId === svc.id
            ? <ActivityIndicator size="small" color="#FFF" />
            : <>
                <Text style={s.publishBtnText}>📤 Publish to Team</Text>
                {svc.publishedAt && (
                  <Text style={s.publishedAt}>
                    Last: {new Date(svc.publishedAt).toLocaleDateString()}
                  </Text>
                )}
              </>
          }
        </TouchableOpacity>
      </View>
    );
  };

  // ── Render: Calendar ────────────────────────────────────────────────────
  const renderCalendar = () => {
    // Show only upcoming/today services, sorted chronologically
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sorted = [...services]
      .filter(svc => {
        if (!svc.date) return true;
        const d = new Date(svc.date.includes('T') ? svc.date : svc.date + 'T00:00:00');
        return d >= today;
      })
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
      });
    const byMonth = {};
    for (const svc of sorted) {
      const mk = monthLabel(svc.date);
      if (!byMonth[mk]) byMonth[mk] = [];
      byMonth[mk].push(svc);
    }

    return (
      <ScrollView
        contentContainerStyle={s.tabContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor="#8B5CF6" />}
      >
        <TouchableOpacity style={s.addBtn} onPress={() => setShowNewService(v => !v)}>
          <Text style={s.addBtnText}>{showNewService ? '✕ Cancel' : '+ New Service'}</Text>
        </TouchableOpacity>
        {renderNewServiceForm()}

        {sorted.length === 0 && !loading && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📅</Text>
            <Text style={s.emptyText}>No upcoming services{'\n'}Tap "+ New Service" to create one</Text>
          </View>
        )}

        {Object.entries(byMonth).map(([month, svcs]) => (
          <View key={month}>
            <Text style={s.calMonthHeader}>{month}</Text>
            {svcs.map(svc => {
              const isOpen = expandedSvc?.id === svc.id;
              const plan   = plans[svc.id] || {};
              const card = (
                <View style={[s.calCard, isOpen && s.calCardOpen]}>
                  <TouchableOpacity
                    style={s.calCardTap}
                    onPress={() => setExpandedSvc(isOpen ? null : svc)}
                    onLongPress={canDeleteServices ? () => confirmDeleteService(svc) : undefined}
                    delayLongPress={450}
                  >
                    <View style={s.calDayBadge}>
                      <Text style={s.calDayNum}>{dayNum(svc.date)}</Text>
                      <Text style={s.calDayMon}>{dayShortMonth(svc.date)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.svcName}>{svc.name || svc.title}</Text>
                      {svc.time ? <Text style={s.svcTime}>🕐 {svc.time}</Text> : null}
                      <Text style={s.svcMeta}>
                        🎵 {(plan.songs || []).length} songs  ·  👥 {(plan.team || []).length} members
                      </Text>
                      {svc.created_by_name ? (
                        <Text style={s.svcCreatedBy}>👤 {svc.created_by_name}</Text>
                      ) : null}
                      {canDeleteServices ? (
                        <Text style={s.svcDeleteHint}>↤ Swipe left to delete</Text>
                      ) : null}
                    </View>
                    <Text style={[s.svcExpandHint, isOpen && { color: '#E5E7EB' }]}>
                      {isOpen ? '▲' : '▶'}
                    </Text>
                  </TouchableOpacity>
                  {isOpen && renderPlanSection(svc)}
                </View>
              );
              if (!canDeleteServices) return <View key={svc.id}>{card}</View>;
              return (
                <Swipeable
                  key={svc.id}
                  ref={(ref) => {
                    if (ref) serviceSwipeRefs.current[svc.id] = ref;
                    else delete serviceSwipeRefs.current[svc.id];
                  }}
                  overshootRight={false}
                  friction={2}
                  rightThreshold={40}
                  onSwipeableOpen={() => handleServiceSwipeOpen(svc.id)}
                  onSwipeableClose={() => {
                    if (openServiceSwipeIdRef.current === svc.id) {
                      openServiceSwipeIdRef.current = null;
                    }
                  }}
                  renderRightActions={() => (
                    <TouchableOpacity
                      style={[
                        s.serviceDeleteAction,
                        deletingServiceId === svc.id && s.serviceDeleteActionDisabled,
                      ]}
                      activeOpacity={0.9}
                      disabled={deletingServiceId === svc.id}
                      onPress={() => confirmDeleteService(svc)}
                    >
                      {deletingServiceId === svc.id ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <>
                          <Text style={s.serviceDeleteActionIcon}>🗑</Text>
                          <Text style={s.serviceDeleteActionText}>Delete</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                >
                  {card}
                </Swipeable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    );
  };

  // ── Render: Services (flat list) ────────────────────────────────────────
  const renderServices = () => {
    const today = todayDateStr();
    const allSvcs = [...services].sort((a, b) => serviceSortKey(a).localeCompare(serviceSortKey(b)));
    const upcomingSvcs = allSvcs.filter((svc) => !isPastService(svc, today));
    const archivedSvcs = [...allSvcs]
      .filter((svc) => isPastService(svc, today))
      .sort((a, b) => serviceSortKey(b).localeCompare(serviceSortKey(a)));

    const STATUS_CONFIG = {
      accepted:  { color: '#10B981', bg: '#052E16', label: 'Accepted',  dot: '●' },
      declined:  { color: '#EF4444', bg: '#1F0A0A', label: 'Declined',  dot: '●' },
      pending:   { color: '#F59E0B', bg: '#1C1207', label: 'Pending',   dot: '●' },
    };

    const getMemberStatus = (svcId, tm) =>
      assignmentResponses[`${svcId}_${tm.personId}`]?.status ||
      assignmentResponses[`${svcId}_${(tm.email||'').toLowerCase()}`]?.status ||
      tm.status || 'pending';

    const renderSvcCard = (svc) => {
      const plan  = plans[svc.id] || {};
      const team  = plan.team || [];
      const songs = plan.songs || [];
      const cfg   = STATUS_CONFIG;

      return (
        <View key={svc.id} style={s.svc2Card}>
          {/* ── Header ── */}
          <View style={s.svc2Header}>
            <View style={{ flex: 1 }}>
              <Text style={s.svc2Name}>{svc.name || svc.title || 'Service'}</Text>
              <Text style={s.svc2Date}>
                {formatServiceDate(svc.date)}{svc.time ? `  ·  ${svc.time}` : ''}
                {songs.length > 0 ? `  ·  ${songs.length} songs` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[s.svc2PublishBtn, publishingId === svc.id && { opacity: 0.5 }]}
              onPress={() => handlePublish(svc)}
              disabled={publishingId === svc.id}
            >
              {publishingId === svc.id
                ? <ActivityIndicator size="small" color="#A78BFA" />
                : <Text style={s.svc2PublishTxt}>📤 Publish</Text>}
            </TouchableOpacity>
          </View>

          {/* ── Team roster ── */}
          {team.length > 0 ? (
            <View style={s.svc2Roster}>
              {team.map((tm, idx) => {
                const st   = getMemberStatus(svc.id, tm);
                const conf = cfg[st] || cfg.pending;
                return (
                  <View key={tm.id || idx} style={[s.svc2Row, idx < team.length - 1 && s.svc2RowBorder]}>
                    {/* Avatar */}
                    <View style={[s.svc2Avatar, { backgroundColor: AVATAR_COLORS[(tm.name||'?').charCodeAt(0) % AVATAR_COLORS.length] }]}>
                      <Text style={s.svc2AvatarTxt}>{(tm.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    {/* Name + role */}
                    <View style={{ flex: 1 }}>
                      <Text style={s.svc2MemberName}>{tm.name || 'Unknown'}</Text>
                      <View style={s.svc2RoleChip}>
                        <Text style={s.svc2RoleChipTxt}>{tm.role || '—'}</Text>
                      </View>
                    </View>
                    {/* Status badge */}
                    <View style={[s.svc2StatusBadge, { backgroundColor: conf.bg, borderColor: conf.color }]}>
                      <Text style={[s.svc2StatusDot, { color: conf.color }]}>{conf.dot}</Text>
                      <Text style={[s.svc2StatusTxt, { color: conf.color }]}>{conf.label}</Text>
                    </View>
                    {/* Remove from service */}
                    {canManageMembers && (
                      <TouchableOpacity
                        style={s.svc2RemoveBtn}
                        onPress={() => Alert.alert(
                          'Remove from Service',
                          `Remove ${tm.name || 'this member'} from this service?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => handleRemoveFromService(svc.id, tm.personId, tm.role) },
                          ]
                        )}
                      >
                        <Text style={s.svc2RemoveBtnTxt}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={s.svc2EmptyTeam}>
              <Text style={s.svc2EmptyTeamTxt}>No team assigned — use Calendar to build the plan.</Text>
            </View>
          )}
        </View>
      );
    };

    return (
      <ScrollView
        contentContainerStyle={s.tabContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor="#8B5CF6" />}
      >
        {/* Pending approvals */}
        {canApprove && pendingServices.length > 0 && (
          <View style={s.pendingApprovalSection}>
            <Text style={s.pendingApprovalHeader}>⏳ Pending Approval ({pendingServices.length})</Text>
            {pendingServices.map(svc => (
              <View key={svc.id} style={s.pendingApprovalCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.pendingApprovalTitle}>{svc.name}</Text>
                  <Text style={s.pendingApprovalMeta}>{formatServiceDate(svc.date)}{svc.time ? ` · ${svc.time}` : ''} · by {svc.created_by_name || 'Leader'}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={s.approveBtn} onPress={() => handleApprovePendingService(svc)} disabled={approvingSvcId === svc.id}>
                    {approvingSvcId === svc.id ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.approveBtnTxt}>✓ Approve</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.rejectBtn} onPress={() => handleRejectPendingService(svc)}>
                    <Text style={s.rejectBtnTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {allSvcs.length === 0 && !loading ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🗓</Text>
            <Text style={s.emptyText}>No services yet.{'\n'}Create one from the Calendar tab.</Text>
          </View>
        ) : (
          <View>
            {upcomingSvcs.length === 0 && (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🗓</Text>
                <Text style={s.emptyText}>No upcoming services.</Text>
              </View>
            )}
            {upcomingSvcs.map(renderSvcCard)}

            {archivedSvcs.length > 0 && (
              <View style={s.archiveSection}>
                <TouchableOpacity
                  style={[s.archiveCard, showArchivedServices && s.archiveCardOpen]}
                  onPress={() => setShowArchivedServices(v => !v)}
                  activeOpacity={0.85}
                >
                  <View style={s.archiveHeaderRow}>
                    <Text style={s.archiveTitle}>🗂 Past Services</Text>
                    <View style={s.archiveCountBadge}><Text style={s.archiveCountText}>{archivedSvcs.length}</Text></View>
                  </View>
                  <Text style={s.svcExpandHint}>{showArchivedServices ? '▲ Hide' : '▼ Show'}</Text>
                </TouchableOpacity>
                {showArchivedServices && archivedSvcs.map(renderSvcCard)}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    );
  };

  // ── Render: Team ────────────────────────────────────────────────────────
  const renderTeam = () => {
    const MEMBER_STATUS = {
      registered: { label: 'Registered',     color: '#60A5FA', bg: '#1D3557', dot: '●' },
      accepted:   { label: 'Invite Accepted', color: '#A78BFA', bg: '#2D1B6B', dot: '●' },
      pending:    { label: 'Pending Invite',  color: '#FBBF24', bg: '#3D2A00', dot: '○' },
      plan_only:  { label: 'Not Registered',  color: '#F97316', bg: '#3B1306', dot: '○' },
    };

    const getMemberStatusKey = (person) => {
      if (person.inviteStatus === 'plan_only') return 'plan_only';
      const eff = getEffectiveInviteTeamStatus(person);
      if (eff === 'registered') return 'registered';
      if (eff === 'accepted') return 'accepted';
      return 'pending';
    };

    const avatarColor = (name) =>
      AVATAR_COLORS[(name || '?').charCodeAt(0) % AVATAR_COLORS.length];

    const joinLink = `${SYNC_URL}/join`;

    return (
      <ScrollView
        contentContainerStyle={s.tabContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor="#8B5CF6" />}
      >
        {/* ── Register / Invite Card ── */}
        <View style={s.teamRegisterCard}>
          <View style={s.teamRegisterTop}>
            <View style={s.teamRegisterIconWrap}>
              <Text style={s.teamRegisterIcon}>🔗</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.teamRegisterTitle}>Invite Members</Text>
              <Text style={s.teamRegisterSub}>Share the link or add manually below</Text>
            </View>
          </View>
          <View style={s.teamRegisterLinkRow}>
            <Text style={s.teamRegisterLink} numberOfLines={1}>{joinLink}</Text>
            <TouchableOpacity
              style={s.teamRegisterShareBtn}
              onPress={() => Share.share({ message: `Join our team on Ultimate Playback: ${joinLink}` })}
            >
              <Text style={s.teamRegisterShareTxt}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Add Member form ── */}
        <TouchableOpacity style={s.teamAddBtn} onPress={() => setShowAddMember(v => !v)}>
          <Text style={s.teamAddBtnTxt}>{showAddMember ? '✕  Cancel' : '+  Add Member'}</Text>
        </TouchableOpacity>

        {showAddMember && (
          <View style={s.formCard}>
            <Text style={s.formLabel}>Name *</Text>
            <TextInput style={s.formInput} value={newMemberName} onChangeText={setNewMemberName}
              placeholder="Full name" placeholderTextColor="#6B7280" />
            <Text style={s.formLabel}>Email</Text>
            <TextInput style={s.formInput} value={newMemberEmail} onChangeText={setNewMemberEmail}
              placeholder="email@example.com" placeholderTextColor="#6B7280"
              keyboardType="email-address" autoCapitalize="none" />
            <Text style={s.formLabel}>Role (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={s.chipRow}>
                {ROLE_CHIPS.map(r => (
                  <TouchableOpacity key={r}
                    style={[s.roleChipBtn, newMemberRole === r && s.roleChipBtnActive]}
                    onPress={() => setNewMemberRole(newMemberRole === r ? '' : r)}>
                    <Text style={[s.roleChipBtnText, newMemberRole === r && s.roleChipBtnTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity style={[s.saveBtn, savingMember && s.saveBtnDisabled]}
              onPress={handleAddMember} disabled={savingMember}>
              {savingMember ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={s.saveBtnText}>Add & Send Invite</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Permission notice ── */}
        {isManager && !isAdmin && (
          <View style={s.mdNoticeBanner}>
            <Text style={s.mdNoticeText}>
              🛡 Manager: You can add, edit & assign members. Only Admins can delete or grant Admin roles.
            </Text>
          </View>
        )}

        {/* ── Member count ── */}
        {people.length > 0 && (
          <Text style={s.teamCountLabel}>{people.length} MEMBER{people.length !== 1 ? 'S' : ''}</Text>
        )}

        {people.length === 0 && !loading && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>👥</Text>
            <Text style={s.emptyText}>No team members yet{'\n'}Add one above or publish from Musician</Text>
          </View>
        )}

        {/* ── Member Cards ── */}
        {people.map((person, idx) => {
          const stKey  = getMemberStatusKey(person);
          const stConf = MEMBER_STATUS[stKey] || MEMBER_STATUS.pending;
          const initials = (person.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
          const roles = person.roles || (person.role ? [person.role] : []);

          return (
            <View key={person.id || person.name || idx} style={s.tmCard}>
              {/* Avatar + info */}
              <View style={s.tmCardBody}>
                <View style={[s.tmAvatar, { backgroundColor: avatarColor(person.name) }]}>
                  <Text style={s.tmAvatarTxt}>{initials || '?'}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.tmNameRow}>
                    <Text style={s.tmName} numberOfLines={1}>{person.name || 'Unknown'}</Text>
                    <View style={[s.tmStatusBadge, { backgroundColor: stConf.bg, borderColor: stConf.color }]}>
                      <Text style={[s.tmStatusDot, { color: stConf.color }]}>{stConf.dot}</Text>
                      <Text style={[s.tmStatusTxt, { color: stConf.color }]}>{stConf.label}</Text>
                    </View>
                  </View>
                  {person.email ? (
                    <Text style={s.tmEmail} numberOfLines={1}>{person.email}</Text>
                  ) : null}
                  {roles.length > 0 && (
                    <View style={s.tmRoleRow}>
                      {roles.slice(0, 3).map((r, i) => (
                        <View key={i} style={s.tmRoleChip}>
                          <Text style={s.tmRoleChipTxt}>{r}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
              {/* Actions */}
              <View style={s.tmActions}>
                {canManageMembers && (
                  <TouchableOpacity style={s.tmActionBtn} onPress={() => {
                    setShowEditMember(person);
                    setEditName(person.name || '');
                    setEditEmail(person.email || '');
                    setEditRole((person.roles || [])[0] || '');
                  }}>
                    <Text style={s.tmActionBtnTxt}>✏️</Text>
                  </TouchableOpacity>
                )}
                {canManageMembers && (
                  <TouchableOpacity style={[s.tmActionBtn, s.tmActionBtnPurple]} onPress={() => { setShowGrantRole(person); setGrantingRole(''); }}>
                    <Text style={s.tmActionBtnTxt}>🔑</Text>
                  </TouchableOpacity>
                )}
                {isAdmin && (
                  <TouchableOpacity style={[s.tmActionBtn, s.tmActionBtnRed]} onPress={() => handleDeleteMember(person)}>
                    <Text style={[s.tmActionBtnTxt, { color: '#F87171' }]}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  // ── Render: Library ─────────────────────────────────────────────────────
  const renderLibrary = () => (
    <View style={{ flex: 1 }}>
      {/* ── Pending Songs from Leaders ── */}
      {canApprove && pendingSongs.length > 0 && (
        <View style={[s.pendingApprovalSection, { margin: 12, marginBottom: 0 }]}>
          <Text style={s.pendingApprovalHeader}>⏳ Pending Songs ({pendingSongs.length})</Text>
          {pendingSongs.map(song => (
            <View key={song.id} style={s.pendingApprovalCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.pendingApprovalTitle}>{song.title}</Text>
                <Text style={s.pendingApprovalMeta}>{song.artist || 'Unknown'} · {song.key || '?'} · {song.bpm || '?'} BPM · by {song.from_name || 'Leader'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={s.approveBtn} onPress={() => handleApprovePendingSong(song)} disabled={approvingSongId === song.id}>
                  {approvingSongId === song.id ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.approveBtnTxt}>✓ Add</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.rejectBtn} onPress={() => handleRejectPendingSong(song)}>
                  <Text style={s.rejectBtnTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Add Song to Library — Admin + Manager */}
      {canManageMembers && (
        <>
          <TouchableOpacity
            style={[s.addBtn, { margin: 12, marginBottom: showAddSong ? 0 : 4 }]}
            onPress={() => setShowAddSong(v => !v)}>
            <Text style={s.addBtnText}>{showAddSong ? '✕ Cancel' : '+ Add Song to Library'}</Text>
          </TouchableOpacity>
          {showAddSong && (
            <View style={[s.formCard, { margin: 12, marginTop: 8 }]}>
              {/* Mini tab switcher */}
              <View style={s.addSongTabs}>
                {[
                  { id: 'info',   label: 'ℹ️ Info' },
                  { id: 'lyrics', label: '🎤 Lyrics' },
                  { id: 'chords', label: '🎸 Chords' },
                ].map(t => (
                  <TouchableOpacity key={t.id}
                    style={[s.addSongTab, addSongTab === t.id && s.addSongTabActive]}
                    onPress={() => setAddSongTab(t.id)}>
                    <Text style={[s.addSongTabText, addSongTab === t.id && s.addSongTabTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {addSongTab === 'info' && (
                <>
                  <Text style={s.formLabel}>Title *</Text>
                  <TextInput style={s.formInput} value={newSongTitle} onChangeText={setNewSongTitle}
                    placeholder="Song Title" placeholderTextColor="#6B7280" />
                  <Text style={s.formLabel}>Artist</Text>
                  <TextInput style={s.formInput} value={newSongArtist} onChangeText={setNewSongArtist}
                    placeholder="Artist Name" placeholderTextColor="#6B7280" />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.formLabel}>Key</Text>
                      <TextInput style={s.formInput} value={newSongKey} onChangeText={setNewSongKey}
                        placeholder="G, A, Bb..." placeholderTextColor="#6B7280" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.formLabel}>BPM</Text>
                      <TextInput style={s.formInput} value={newSongBpm} onChangeText={setNewSongBpm}
                        placeholder="120" placeholderTextColor="#6B7280" keyboardType="number-pad" />
                    </View>
                  </View>
                  <Text style={s.formLabel}>YouTube Link (optional)</Text>
                  <TextInput style={s.formInput} value={newSongYouTube} onChangeText={setNewSongYouTube}
                    placeholder="https://youtube.com/watch?v=..." placeholderTextColor="#6B7280"
                    autoCapitalize="none" keyboardType="url" />
                </>
              )}

              {addSongTab === 'lyrics' && (
                <>
                  <Text style={s.formLabel}>Lyrics</Text>
                  <TextInput
                    style={[s.formInput, s.multilineInput]}
                    value={newSongLyrics}
                    onChangeText={setNewSongLyrics}
                    placeholder={'Verse 1:\n...\n\nChorus:\n...'}
                    placeholderTextColor="#6B7280"
                    multiline
                    textAlignVertical="top"
                  />
                </>
              )}

              {addSongTab === 'chords' && (
                <>
                  <Text style={s.formLabel}>Chord Chart</Text>
                  <TextInput
                    style={[s.formInput, s.multilineInput, s.monoInput]}
                    value={newSongChords}
                    onChangeText={setNewSongChords}
                    placeholder={'[Verse]\nG     D     Em    C\nAmazing grace...'}
                    placeholderTextColor="#6B7280"
                    multiline
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              )}

              <TouchableOpacity style={[s.saveBtn, { marginTop: 4 }, savingNewSong && s.saveBtnDisabled]}
                onPress={handleAddSongToLibrary} disabled={savingNewSong}>
                {savingNewSong ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={s.saveBtnText}>Add to Library</Text>}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <View style={s.searchBar}>
        <TextInput style={s.searchInput} value={libQuery} onChangeText={setLibQuery}
          placeholder="🔍  Search songs..." placeholderTextColor="#6B7280" />
      </View>
      <FlatList
        data={libraryFiltered}
        keyExtractor={(item, i) => `${item.title}_${i}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor="#8B5CF6" />}
        contentContainerStyle={[s.tabContent, { paddingTop: 8 }]}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.songCard} onPress={() => {
            const svcId = Object.keys(plans).find(sid =>
              (plans[sid].songs || []).some(ss => ss.id === item.id || ss.title === item.title)
            ) || '';
            navigation.navigate('ContentEditor', {
              song: item, serviceId: svcId, type: 'lyrics',
              existing: item.lyrics || '', isAdmin: true,
            });
          }}>
            <View style={s.songHeader}>
              <Text style={s.songTitle}>{item.title}</Text>
              {item.key ? <View style={s.keyBadge}><Text style={s.keyBadgeText}>{item.key}</Text></View> : null}
            </View>
            {item.artist ? <Text style={s.songArtist}>{item.artist}</Text> : null}
            <View style={s.songFlags}>
              <Text style={[s.songFlag, item.lyrics ? s.flagHas : s.flagMissing]}>
                {item.lyrics ? '🎤 Lyrics ✓' : '🎤 No lyrics'}
              </Text>
              <Text style={[s.songFlag, item.chordChart ? s.flagHas : s.flagMissing]}>
                {item.chordChart ? '🎸 Chords ✓' : '🎸 No chords'}
              </Text>
            </View>
            {item._services?.length > 0 && (
              <Text style={s.songServices}>📋 {item._services.join(' · ')}</Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🎵</Text>
            <Text style={s.emptyText}>
              {libQuery ? 'No songs match your search' : 'No songs in library yet'}
            </Text>
          </View>
        }
      />
    </View>
  );

  // ── Render: Proposals ───────────────────────────────────────────────────
  const renderProposals = () => {
    const pending  = proposals.filter(p => p.status === 'pending');
    const reviewed = proposals.filter(p => p.status !== 'pending');
    return (
      <ScrollView
        contentContainerStyle={s.tabContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor="#8B5CF6" />}
      >
        {pending.length === 0 && reviewed.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📬</Text>
            <Text style={s.emptyText}>No proposals yet</Text>
            <Text style={s.emptyCaption}>
              When team members submit chord charts or lyrics for approval, they'll appear here.
            </Text>
          </View>
        )}

        {pending.length > 0 && (
          <>
            <Text style={s.sectionHeader}>⏳ Pending Approval ({pending.length})</Text>
            {pending.map(p => (
              <View key={p.id} style={s.proposalCard}>
                <View style={s.proposalHeader}>
                  <Text style={s.proposalSong} numberOfLines={1}>{p.songTitle || 'Unknown Song'}</Text>
                  <View style={s.proposalTypeBadge}>
                    <Text style={s.proposalTypeBadgeText}>
                      {p.instrument || (p.type === 'lyrics' ? '🎤 Lyrics' : '🎸 Chords')}
                    </Text>
                  </View>
                </View>
                <Text style={s.proposalFrom}>From: {p.from_name || p.from_email}</Text>
                <Text style={s.proposalPreview} numberOfLines={4}>{p.content}</Text>
                <View style={s.proposalActions}>
                  <TouchableOpacity
                    style={[s.proposalApproveBtn, approvingId === p.id && { opacity: 0.5 }]}
                    onPress={() => handleApproveProposal(p)}
                    disabled={approvingId === p.id || rejectingId === p.id}
                  >
                    {approvingId === p.id
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Text style={s.proposalApproveBtnText}>✓ Approve & Apply</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.proposalRejectBtn, rejectingId === p.id && { opacity: 0.5 }]}
                    onPress={() => handleRejectProposal(p)}
                    disabled={approvingId === p.id || rejectingId === p.id}
                  >
                    <Text style={s.proposalRejectBtnText}>✕ Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {reviewed.length > 0 && (
          <>
            <Text style={[s.sectionHeader, { marginTop: 24 }]}>✓ Reviewed</Text>
            {reviewed.slice(0, 10).map(p => (
              <View key={p.id} style={[s.proposalCard, { opacity: 0.6 }]}>
                <View style={s.proposalHeader}>
                  <Text style={s.proposalSong} numberOfLines={1}>{p.songTitle || 'Unknown Song'}</Text>
                  <View style={[s.proposalTypeBadge, p.status === 'approved' ? { backgroundColor: '#05291A', borderColor: '#059669' } : { backgroundColor: '#1F1005', borderColor: '#B45309' }]}>
                    <Text style={[s.proposalTypeBadgeText, { color: p.status === 'approved' ? '#34D399' : '#F59E0B' }]}>
                      {p.status === 'approved' ? '✓ Approved' : '✕ Rejected'}
                    </Text>
                  </View>
                </View>
                <Text style={s.proposalFrom}>{p.instrument || p.type} · {p.from_name}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    );
  };

  // ── Render: Messages ────────────────────────────────────────────────────
  const renderMessages = () => {
    const filteredPeople = people.filter((person) => {
      if (!pickerSearch.trim()) return true;
      const query = pickerSearch.trim().toLowerCase();
      return (
        String(person?.name || '').toLowerCase().includes(query)
        || String(person?.email || '').toLowerCase().includes(query)
      );
    });

    if (showRecipientPicker) {
      return (
        <View style={s.composeScreen}>
          <View style={s.composeHeader}>
            <TouchableOpacity onPress={() => setShowRecipientPicker(false)}>
              <Text style={s.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={s.topBarTitle}>Choose Recipient</Text>
            <View style={s.composeHeaderSpacer} />
          </View>
          <TextInput
            style={s.pickerSearch}
            value={pickerSearch}
            onChangeText={setPickerSearch}
            placeholder="Search team..."
            placeholderTextColor="#6B7280"
            autoFocus
          />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.pickerList}>
            <TouchableOpacity
              style={[s.pickerItem, composeTo === 'all_team' && s.pickerItemActive]}
              onPress={() => {
                setComposeTo('all_team');
                setComposeToName('All Team');
                setShowRecipientPicker(false);
              }}
            >
              <Text style={s.pickerItemIcon}>👥</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.pickerItemName}>All Team</Text>
                <Text style={s.pickerItemSub}>Broadcast to everyone</Text>
              </View>
              {composeTo === 'all_team' && <Text style={s.checkmark}>✓</Text>}
            </TouchableOpacity>

            {filteredPeople.map((person) => {
              const targetEmail = String(person?.email || '').trim().toLowerCase();
              const disabled = !targetEmail;
              const isSelected = !disabled && composeTo === targetEmail;
              return (
                <TouchableOpacity
                  key={person.id || `${person.name}_${targetEmail}`}
                  style={[
                    s.pickerItem,
                    isSelected && s.pickerItemActive,
                    disabled && s.pickerItemDisabled,
                  ]}
                  disabled={disabled}
                  onPress={() => {
                    setComposeTo(targetEmail);
                    setComposeToName(person?.name || targetEmail);
                    setShowRecipientPicker(false);
                  }}
                >
                  <View style={s.pickerAvatar}>
                    <Text style={s.pickerAvatarText}>
                      {(person?.name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.pickerItemName, disabled && s.pickerItemNameDisabled]}>
                      {person?.name || 'Unknown member'}
                    </Text>
                    <Text style={s.pickerItemSub}>
                      {targetEmail || 'Add email on the member profile first'}
                    </Text>
                  </View>
                  {isSelected && <Text style={s.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            })}

            {filteredPeople.length === 0 && (
              <Text style={s.pickerEmpty}>No team members found.</Text>
            )}
          </ScrollView>
        </View>
      );
    }

    if (showCompose) {
      return (
        <View style={s.composeScreen}>
          <View style={s.composeHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowCompose(false);
                setShowRecipientPicker(false);
                setPickerSearch('');
              }}
            >
              <Text style={s.backText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.topBarTitle}>New Message</Text>
            <TouchableOpacity onPress={handleCompose} disabled={sendingCompose}>
              {sendingCompose
                ? <ActivityIndicator size="small" color="#8B5CF6" />
                : <Text style={s.composeSendText}>Send</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.composeBodyWrap}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity style={s.toRow} onPress={() => setShowRecipientPicker(true)}>
              <Text style={s.toLabel}>To:</Text>
              <View style={[s.toChip, { flex: 1 }]}>
                <Text style={s.toChipText}>
                  {composeTo === 'all_team' ? '👥 All Team' : `👤 ${composeToName}`}
                </Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>

            <TextInput
              style={s.composeInput}
              value={composeSubject}
              onChangeText={setComposeSubject}
              placeholder="Subject"
              placeholderTextColor="#6B7280"
              autoFocus
            />
            <TextInput
              style={s.composeBodyInput}
              value={composeBody}
              onChangeText={setComposeBody}
              placeholder="Write your message..."
              placeholderTextColor="#6B7280"
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        {canManageMembers && (
          <TouchableOpacity
            style={[s.addBtn, { margin: 12, marginBottom: 4 }]}
            onPress={() => {
              setShowCompose(true);
              setShowRecipientPicker(false);
              setPickerSearch('');
            }}
          >
            <Text style={s.addBtnText}>✉️ Compose Message</Text>
          </TouchableOpacity>
        )}
        <FlatList
          data={messages}
          keyExtractor={m => m.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor="#8B5CF6" />}
          contentContainerStyle={s.tabContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.msgCard, !item.read && s.msgCardUnread]}
              onPress={() => setSelectedMsg(item)}
              onLongPress={() => confirmDeleteInboxMessage(item)}
              delayLongPress={250}
            >
              <View style={s.msgHeader}>
                {!item.read && <View style={s.unreadDot} />}
                <Text style={s.msgFrom}>{item.fromName || item.from_name || item.fromEmail || item.from_email}</Text>
                <Text style={s.msgTime}>
                  {item.messageType === 'assignment_response'
                    ? formatDateTime(item.metadata?.respondedAt || item.timestamp)
                    : timeAgo(item.timestamp)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Text style={s.msgSubject}>{item.subject}</Text>
                {item.to === 'all_team' && (
                  <View style={s.broadcastBadge}><Text style={s.broadcastBadgeText}>👥 Team</Text></View>
                )}
              </View>
              <Text style={s.msgPreview} numberOfLines={2}>{item.message}</Text>
              {assignmentMessageMetaText(item) ? (
                <Text style={s.msgMeta}>{assignmentMessageMetaText(item)}</Text>
              ) : null}
              {(item.replies || []).length > 0 && (
                <Text style={s.repliedBadge}>✓ {item.replies.length} repl{item.replies.length > 1 ? 'ies' : 'y'} sent</Text>
              )}
              <Text style={s.msgHint}>Long press to delete</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📭</Text>
              <Text style={s.emptyText}>No team messages yet</Text>
            </View>
          }
        />
      </View>
    );
  };

  // ── Message thread ──────────────────────────────────────────────────────
  if (selectedMsg) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => { setSelectedMsg(null); setReplyText(''); }}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitleFull} numberOfLines={1}>{selectedMsg.subject}</Text>
          <TouchableOpacity onPress={confirmDeleteSelectedMessage} disabled={deletingMessage}>
            {deletingMessage
              ? <ActivityIndicator size="small" color="#EF4444" />
              : <Text style={s.deleteThreadText}>Delete</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={s.threadFrom}>
            {selectedMsg.fromName || selectedMsg.from_name || selectedMsg.fromEmail || selectedMsg.from_email}
            {' · '}
            {selectedMsg.messageType === 'assignment_response'
              ? formatDateTime(selectedMsg.metadata?.respondedAt || selectedMsg.timestamp)
              : timeAgo(selectedMsg.timestamp)}
          </Text>
          {assignmentMessageMetaText(selectedMsg) ? (
            <Text style={s.threadMeta}>{assignmentMessageMetaText(selectedMsg)}</Text>
          ) : null}
          <View style={s.threadBubble}><Text style={s.threadText}>{selectedMsg.message}</Text></View>
          {(selectedMsg.replies || []).map(r => (
            <View key={r.id} style={s.adminBubble}>
              <Text style={s.adminBubbleFrom}>{r.from} · {timeAgo(r.timestamp)}</Text>
              <Text style={s.adminBubbleText}>{r.message}</Text>
            </View>
          ))}
          <Text style={s.replyLabel}>Reply as {isOrgOwner ? 'Org Owner' : isAdmin ? 'Admin' : isManager ? 'Manager' : 'Music Director'}</Text>
          <TextInput style={s.replyInput} value={replyText} onChangeText={setReplyText}
            placeholder="Type reply..." placeholderTextColor="#6B7280" multiline textAlignVertical="top" />
          <TouchableOpacity style={[s.replyBtn, sendingReply && s.replyBtnDisabled]}
            onPress={handleReply} disabled={sendingReply}>
            {sendingReply ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={s.replyBtnText}>↩ Send Reply</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Main dashboard ──────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.backText}>✕</Text>
        </TouchableOpacity>
        <View style={s.topCenter}>
          <View style={[s.mdBadge, isAdmin && s.adminBadgeStyle]}>
            <Text style={s.mdBadgeText}>
              {isOrgOwner ? '🏛 Org Owner' : isAdmin ? '👑 Admin' : mdRole === 'md' ? '🎼 Music Director' : isManager ? '🛡 Worship Leader' : '🎛 Panel'}
            </Text>
          </View>
          <Text style={s.topBarTitle}>Admin Dashboard</Text>
        </View>
        <TouchableOpacity onPress={loadAll}>
          <Text style={s.refreshText}>⟳</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={loadAll}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
        </View>
      )}

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {TABS.map(t => {
          const pendingCount = t === 'Proposals' ? proposals.filter(p => p.status === 'pending').length : 0;
          return (
            <TouchableOpacity key={t}
              style={[s.tabBtn, tab === t && s.tabBtnActive]}
              onPress={() => setTab(t)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>{t}</Text>
                {pendingCount > 0 && (
                  <View style={s.tabBadge}>
                    <Text style={s.tabBadgeText}>{pendingCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={{ flex: 1 }}>
        {tab === 'Messages'   && renderMessages()}
        {tab === 'Calendar'   && renderCalendar()}
        {tab === 'Services'   && renderServices()}
        {tab === 'Team'       && renderTeam()}
        {tab === 'Library'    && renderLibrary()}
        {tab === 'Proposals'  && renderProposals()}
      </View>

      {/* ── Song Picker Modal ─────────────────────────────────────── */}
      <Modal visible={showSongPicker} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalTitleRow}>
              <Text style={s.modalTitle}>
                Add Song {svcForSong ? `to "${svcForSong.name || svcForSong.title}"` : ''}
              </Text>
              <TouchableOpacity onPress={() => { setShowSongPicker(false); setSvcForSong(null); }}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={s.modalSearch} value={songQuery} onChangeText={setSongQuery}
              placeholder="🔍  Search songs..." placeholderTextColor="#6B7280" />
            <FlatList
              data={songQuery
                ? libraryAll.filter(s =>
                    s.title?.toLowerCase().includes(songQuery.toLowerCase()) ||
                    s.artist?.toLowerCase().includes(songQuery.toLowerCase()))
                : libraryAll}
              keyExtractor={(item, i) => `picker_${item.title}_${i}`}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.modalSongRow} onPress={() => handleAddSong(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.modalSongTitle}>{item.title}</Text>
                    {item.artist ? <Text style={s.modalSongArtist}>{item.artist}</Text> : null}
                  </View>
                  {item.key ? <View style={s.keyBadge}><Text style={s.keyBadgeText}>{item.key}</Text></View> : null}
                  <Text style={s.modalSongAdd}>+ Add</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={[s.planEmpty, { padding: 16 }]}>No songs in library yet.</Text>}
            />
          </View>
        </View>
      </Modal>

      {/* ── Team Assign Modal ─────────────────────────────────────── */}
      <Modal visible={showAssignModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalTitleRow}>
              <Text style={s.modalTitle}>Assign to {assignTarget?.name || assignTarget?.title}</Text>
              <TouchableOpacity onPress={() => { setShowAssignModal(false); setChipRole(''); }}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.modalLabel}>Select Role</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={s.chipRow}>
                {ROLE_CHIPS.map(r => (
                  <TouchableOpacity key={r}
                    style={[s.roleChipBtn, chipRole === r && s.roleChipBtnActive]}
                    onPress={() => setChipRole(r)}>
                    <Text style={[s.roleChipBtnText, chipRole === r && s.roleChipBtnTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={s.modalLabel}>Select Team Member</Text>
            <FlatList
              data={chipRole
                ? people.filter(p => (p.roles || []).some(r => r.toLowerCase() === chipRole.toLowerCase()))
                : people}
              keyExtractor={p => p.id || p.name}
              style={{ maxHeight: 240 }}
              ListEmptyComponent={chipRole ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <Text style={{ color: '#6B7280', fontSize: 13 }}>No team members with "{chipRole}" role</Text>
                </View>
              ) : null}
              renderItem={({ item }) => {
                const emailLower    = (item.email || '').trim().toLowerCase();
                const dateBlockouts = allBlockouts[assignTarget?.date] || [];
                const isBlocked     = emailLower && dateBlockouts.includes(emailLower);
                return (
                  <TouchableOpacity
                    style={[s.modalPerson, isBlocked && s.modalPersonBlocked, saving && { opacity: 0.5 }]}
                    onPress={() => {
                      if (isBlocked) {
                        Alert.alert(
                          '🚫 Member Unavailable',
                          `${item.name} has marked this date as blocked.\n\nYou can still assign them, but they may not be available.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Assign Anyway', style: 'destructive', onPress: () => handleAssign(item) },
                          ]
                        );
                      } else {
                        handleAssign(item);
                      }
                    }}
                    disabled={saving}
                  >
                    <View style={[s.personAvatar, isBlocked && s.personAvatarBlocked]}>
                      <Text style={s.personAvatarText}>{isBlocked ? '🚫' : (item.name || '?')[0]}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[s.modalPersonName, isBlocked && s.blockedPersonName]}>{item.name}</Text>
                      <Text style={s.modalPersonEmail}>{item.email || ''}</Text>
                      {isBlocked && (
                        <Text style={s.blockedLabel}>Blocked on this date</Text>
                      )}
                    </View>
                    {saving
                      ? <ActivityIndicator size="small" color="#8B5CF6" />
                      : <Text style={[s.modalPersonAdd, chipRole && !isBlocked && { color: '#8B5CF6' }, chipRole && isBlocked && { color: '#EF4444' }]}>
                          {chipRole ? (isBlocked ? '⚠️ Assign' : `→ ${chipRole}`) : 'Select role'}
                        </Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Edit Member Modal (Admin + Manager) ────────────────────── */}
      <Modal
        visible={!!showEditMember}
        animationType="slide"
        transparent
        onShow={() => {
          setTimeout(() => {
            editNameInputRef.current?.focus?.();
          }, 80);
        }}
        onRequestClose={() => setShowEditMember(null)}
      >
        <View
          style={[
            s.modalOverlay,
            {
              justifyContent: 'flex-start',
              paddingTop: Math.max(insets.top, 16) + 12,
              paddingHorizontal: 12,
              paddingBottom: Math.max(insets.bottom, 12) + editMemberKeyboardHeight,
            },
          ]}
        >
          <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: '#0B1120', borderRadius: 20, borderWidth: 1, borderColor: '#1E2A40', paddingHorizontal: 20, paddingTop: 20, maxHeight: '72%' }}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
            >
              <Text style={{ color: '#E0E7FF', fontSize: 17, fontWeight: '800', marginBottom: 4 }}>Edit Member</Text>
              <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Update {showEditMember?.name}</Text>
              <Text style={s.formLabel}>Name *</Text>
              <TextInput ref={editNameInputRef} style={s.formInput} value={editName} onChangeText={setEditName}
                autoFocus={true}
                showSoftInputOnFocus={true}
                returnKeyType="next"
                onSubmitEditing={() => editEmailInputRef.current?.focus?.()}
                placeholder="Full name" placeholderTextColor="#6B7280" />
              <Text style={s.formLabel}>Email</Text>
              <TextInput ref={editEmailInputRef} style={s.formInput} value={editEmail} onChangeText={setEditEmail}
                showSoftInputOnFocus={true}
                placeholder="email@example.com" placeholderTextColor="#6B7280"
                keyboardType="email-address" autoCapitalize="none"
                returnKeyType="done" />
              <Text style={s.formLabel}>Primary Role</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} keyboardShouldPersistTaps="always">
                <View style={s.chipRow}>
                  {ROLE_CHIPS.map(r => (
                    <TouchableOpacity key={r}
                      style={[s.roleChipBtn, editRole === r && s.roleChipBtnActive]}
                      onPress={() => setEditRole(editRole === r ? '' : r)}>
                      <Text style={[s.roleChipBtnText, editRole === r && s.roleChipBtnTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 4 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#1F2937', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={() => setShowEditMember(null)}>
                  <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 2, backgroundColor: '#4F46E5', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: (savingEdit || !editName.trim()) ? 0.5 : 1 }}
                  onPress={handleEditMember} disabled={savingEdit || !editName.trim()}>
                  {savingEdit ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800' }}>Save Changes</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Vocal Part Picker Modal ───────────────────────────────── */}
      <Modal visible={!!vocalPartPicker} animationType="slide" transparent onRequestClose={() => setVocalPartPicker(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalTitleRow}>
              <View>
                <Text style={s.modalTitle}>🎤 {vocalPartPicker?.partLabel}</Text>
                <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Assign vocalist to this part</Text>
              </View>
              <TouchableOpacity onPress={() => setVocalPartPicker(null)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* Clear option */}
            <TouchableOpacity
              style={s.vocalUnassignRow}
              onPress={() => vocalPartPicker && handleAssignVocalPart(vocalPartPicker.svcId, vocalPartPicker.songId, vocalPartPicker.partKey, null)}
            >
              <Text style={s.vocalUnassignText}>— Clear / Unassign —</Text>
            </TouchableOpacity>
            <FlatList
              data={(() => {
                const svcTeam = plans[vocalPartPicker?.svcId || '']?.team || [];
                const teamIds = new Set(svcTeam.map(t => t.personId));
                const vocalInTeam = [], otherInTeam = [], notInTeam = [];
                for (const p of people) {
                  const isInTeam = teamIds.has(p.id);
                  const isVocal  = (p.roles || []).some(r => VOCAL_TEAM_ROLES.has(r));
                  if (isInTeam && isVocal) vocalInTeam.push(p);
                  else if (isInTeam)       otherInTeam.push(p);
                  else                     notInTeam.push(p);
                }
                return [...vocalInTeam, ...otherInTeam, ...notInTeam];
              })()}
              keyExtractor={p => p.id || p.name}
              style={{ maxHeight: 340 }}
              renderItem={({ item }) => {
                const svcTeam = plans[vocalPartPicker?.svcId || '']?.team || [];
                const inTeam  = svcTeam.some(t => t.personId === item.id);
                const isVocal = (item.roles || []).some(r => VOCAL_TEAM_ROLES.has(r));
                return (
                  <TouchableOpacity
                    style={[s.modalPerson, savingVocals && { opacity: 0.5 }]}
                    onPress={() => vocalPartPicker && handleAssignVocalPart(vocalPartPicker.svcId, vocalPartPicker.songId, vocalPartPicker.partKey, item)}
                    disabled={savingVocals}
                  >
                    <View style={s.personAvatar}>
                      <Text style={s.personAvatarText}>{(item.name || '?')[0]}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.modalPersonName}>{item.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                        {inTeam  && <View style={s.roleChipSmall}><Text style={s.roleChipSmallText}>In team</Text></View>}
                        {isVocal && <View style={[s.roleChipSmall, { borderColor: '#EC4899' }]}><Text style={[s.roleChipSmallText, { color: '#F472B6' }]}>Vocal</Text></View>}
                      </View>
                    </View>
                    {savingVocals
                      ? <ActivityIndicator size="small" color="#8B5CF6" />
                      : <Text style={s.modalPersonAdd}>→ Assign</Text>}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={[s.planEmpty, { padding: 16 }]}>No team members added yet.</Text>}
            />
          </View>
        </View>
      </Modal>

      {/* ── Grant Role Modal (Admin + Manager) ─────────────────────── */}
      <Modal visible={!!showGrantRole} animationType="slide" transparent onRequestClose={() => setShowGrantRole(null)}>
        <View style={{ flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#0B1120', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#1E2A40', padding: 20 }}>
            <Text style={{ color: '#E0E7FF', fontSize: 17, fontWeight: '800', marginBottom: 4 }}>Grant Role</Text>
            <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
              Set role for {showGrantRole?.name}
              {isManager && !isAdmin ? '\n🎼 Worship Leader / MD: can only grant Leader role' : ''}
              {isAdmin && !isOrgOwner ? '\n👑 Admin: can grant Worship Leader, Music Director, or Leader' : ''}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {(
                isOrgOwner ? ['org_owner', 'admin', 'manager', 'md', 'leader', 'none']
                : isAdmin  ? ['manager', 'md', 'leader', 'none']
                :             ['leader', 'none']
              ).map(r => {
                const label =
                  r === 'org_owner' ? 'Org Owner'
                  : r === 'admin'   ? 'Admin'
                  : r === 'manager' ? 'Worship Leader'
                  : r === 'md'      ? 'Music Director'
                  : r === 'leader'  ? 'Leader'
                  : 'Remove Role';
                return (
                  <TouchableOpacity key={r}
                    style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
                      backgroundColor: grantingRole === r ? '#7C3AED' : '#1F2937',
                      borderColor: grantingRole === r ? '#7C3AED' : '#374151' }}
                    onPress={() => setGrantingRole(r)}>
                    <Text style={{ color: grantingRole === r ? '#FFF' : '#9CA3AF', fontWeight: '700' }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: '#1F2937', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={() => setShowGrantRole(null)}>
                <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 2, backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={handleGrantRole} disabled={savingGrant || !grantingRole}>
                {savingGrant ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800' }}>Grant Role</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'Just now';
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#1F2937', backgroundColor: '#0A0A1A' },
  topCenter: { flex: 1, alignItems: 'center' },
  mdBadge: { paddingHorizontal: 10, paddingVertical: 3, backgroundColor: '#7C3AED20', borderRadius: 10, borderWidth: 1, borderColor: '#7C3AED', marginBottom: 2 },
  adminBadgeStyle: { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' },
  mdBadgeText: { fontSize: 11, fontWeight: '700', color: '#A78BFA' },
  topBarTitle: { fontSize: 15, fontWeight: '700', color: '#F9FAFB' },
  topBarTitleFull: { fontSize: 16, fontWeight: '700', color: '#F9FAFB', flex: 1, textAlign: 'center' },
  backText: { fontSize: 15, color: '#8B5CF6', fontWeight: '600', minWidth: 40 },
  refreshText: { fontSize: 20, color: '#8B5CF6', minWidth: 30, textAlign: 'right' },
  deleteThreadText: { fontSize: 14, color: '#F87171', fontWeight: '700', minWidth: 52, textAlign: 'right' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', margin: 12, padding: 10, backgroundColor: '#7C2D1220', borderRadius: 8, borderWidth: 1, borderColor: '#F97316' },
  errorText: { fontSize: 12, color: '#F97316', flex: 1 },
  retryText: { fontSize: 12, color: '#F97316', fontWeight: '700' },

  // Tab bar
  tabBar: { borderBottomWidth: 1, borderBottomColor: '#1F2937', flexGrow: 0 },
  tabBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#374151' },
  tabBtnActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  tabBtnTextActive: { color: '#FFF' },
  tabBadge: { backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFF' },
  tabContent: { padding: 16, paddingBottom: 40 },

  // Calendar
  calMonthHeader: { fontSize: 13, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 8 },
  calCard: { backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', marginBottom: 10, overflow: 'hidden' },
  calCardOpen: { borderColor: '#8B5CF6' },
  calCardTap: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  calDayBadge: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#1E1B4B', borderWidth: 1, borderColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  calDayNum: { fontSize: 18, fontWeight: '900', color: '#818CF8', lineHeight: 20 },
  calDayMon: { fontSize: 9, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase' },
  svcTime: { fontSize: 11, color: '#6B7280', marginBottom: 2 },

  // Services / shared
  svcCard: { backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', marginBottom: 12, overflow: 'hidden' },
  svcCardOpen: { borderColor: '#8B5CF6' },
  svcCardTap: { padding: 14 },
  svcHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  svcName: { fontSize: 15, fontWeight: '700', color: '#F9FAFB', flex: 1 },
  svcDate: { fontSize: 12, color: '#6B7280', marginLeft: 8 },
  svcMeta: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  svcDeleteHint: { fontSize: 10, color: '#FCA5A5', fontWeight: '700', marginBottom: 4 },
  svcExpandHint: { fontSize: 11, color: '#8B5CF6', fontWeight: '600' },
  svcCreatedBy: { fontSize: 11, color: '#4B5563', fontStyle: 'italic', marginTop: 2 },
  serviceDeleteAction: {
    width: 104,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#991B1B',
    borderWidth: 1,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  serviceDeleteActionDisabled: { opacity: 0.7 },
  serviceDeleteActionIcon: { fontSize: 18 },
  serviceDeleteActionText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  archiveSection: { marginTop: 4 },
  archiveCard: {
    backgroundColor: '#0A0F1F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243047',
    marginBottom: 12,
    padding: 14,
  },
  archiveCardOpen: { borderColor: '#8B5CF6' },
  archiveHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  archiveTitle: { fontSize: 15, fontWeight: '800', color: '#E5E7EB' },
  archiveSubtitle: { fontSize: 12, color: '#94A3B8', marginBottom: 4 },
  archiveCountBadge: {
    minWidth: 28,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: '#312E81',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  archiveCountText: { fontSize: 11, fontWeight: '800', color: '#C7D2FE' },

  // Plan section
  planSection: { padding: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1F2937' },
  planSubHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  planSubTitle: { fontSize: 13, fontWeight: '700', color: '#E5E7EB' },
  planAddBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#8B5CF6' },
  planAddBtnText: { fontSize: 12, fontWeight: '700', color: '#8B5CF6' },
  planEmpty: { fontSize: 12, color: '#4B5563', fontStyle: 'italic', marginBottom: 8, paddingLeft: 4 },
  publishBtn: { marginTop: 16, backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  publishBtnDisabled: { opacity: 0.5 },
  publishBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  publishedAt: { fontSize: 11, color: '#C4B5FD', marginTop: 2 },
  planSongRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  // Vocal assignment
  vocalToggleBtn: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151' },
  vocalToggleBtnActive: { backgroundColor: '#4C1D9530', borderColor: '#7C3AED' },
  vocalToggleBtnOpen: { backgroundColor: '#7C3AED40', borderColor: '#A78BFA' },
  vocalToggleTxt: { fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
  vocalPanel: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6, backgroundColor: '#07091A', borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  vocalPanelTitle: { fontSize: 10, fontWeight: '700', color: '#4B5563', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  vocalPartRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#ffffff06' },
  vocalPartDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  vocalPartLabel: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', width: 90 },
  vocalAssignedName: { fontSize: 12, fontWeight: '700', color: '#A5B4FC', maxWidth: 140 },
  vocalClearBtn: { fontSize: 13, color: '#EF444450', fontWeight: '700', paddingLeft: 6 },
  vocalUnassigned: { fontSize: 11, color: '#374151', fontStyle: 'italic' },
  vocalUnassignRow: { backgroundColor: '#1F293730', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: '#374151' },
  vocalUnassignText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  planSongNum: { fontSize: 11, color: '#6B7280', width: 18, textAlign: 'center' },
  planSongTitle: { fontSize: 13, fontWeight: '700', color: '#F9FAFB' },
  planSongArtist: { fontSize: 11, color: '#6B7280' },
  planTeamRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  planTeamAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  avatarAccepted: { backgroundColor: '#065F46' },
  avatarDeclined: { backgroundColor: '#7F1D1D' },
  planTeamAvatarText: { fontSize: 12, fontWeight: '700', color: '#F9FAFB' },
  planTeamName: { fontSize: 13, fontWeight: '600', color: '#F9FAFB', marginBottom: 2 },
  respBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: '#1F293780', borderWidth: 1, borderColor: '#374151' },
  respBadgeAccepted: { backgroundColor: '#065F4620', borderColor: '#10B981' },
  respBadgeDeclined: { backgroundColor: '#7F1D1D20', borderColor: '#EF4444' },
  respBadgeText: { fontSize: 9, fontWeight: '700', color: '#6B7280' },
  memberBadgeRegistered: { backgroundColor: '#1D4ED820', borderColor: '#60A5FA' },
  memberBadgeAccepted: { backgroundColor: '#5B21B620', borderColor: '#A78BFA' },
  memberBadgePending: { backgroundColor: '#78350F20', borderColor: '#F59E0B' },
  respTextAccepted: { color: '#10B981' },
  respTextDeclined: { color: '#EF4444' },
  memberTextRegistered: { color: '#60A5FA' },
  memberTextAccepted: { color: '#C4B5FD' },
  memberTextPending: { color: '#FBBF24' },
  planTeamMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  planTeamMetaMuted: { fontSize: 11, color: '#6B7280', marginTop: 2, fontStyle: 'italic' },
  roleChipSmall: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, backgroundColor: '#8B5CF620', borderRadius: 6, borderWidth: 1, borderColor: '#8B5CF6' },
  roleChipSmallText: { fontSize: 10, fontWeight: '700', color: '#A78BFA' },
  removeBtn: { padding: 6 },
  removeBtnText: { fontSize: 14, color: '#EF444460', fontWeight: '700' },
  keyChip: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#8B5CF6', borderRadius: 5 },
  keyChipText: { fontSize: 10, fontWeight: '700', color: '#FFF' },

  // Team
  mdNoticeBanner: { padding: 12, backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#374151', marginBottom: 14 },
  mdNoticeText: { fontSize: 12, color: '#9CA3AF', lineHeight: 18 },
  personCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#374151', marginBottom: 8 },
  personAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  personAvatarText: { fontSize: 16, fontWeight: '700', color: '#F9FAFB' },
  personBody: { flex: 1 },
  personName: { fontSize: 15, fontWeight: '600', color: '#F9FAFB' },
  personEmail: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  personRoles: { fontSize: 11, color: '#818CF8', marginTop: 2 },
  deleteMemberBtn: { padding: 8 },
  deleteMemberBtnText: { fontSize: 16, color: '#EF444460', fontWeight: '700' },

  // Buttons / forms
  addBtn: { backgroundColor: '#1E1B4B', borderWidth: 1, borderColor: '#4F46E5', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 14 },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#818CF8' },
  formCard: { backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', padding: 16, marginBottom: 16 },
  formLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginBottom: 6, textTransform: 'uppercase' },
  formInput: { backgroundColor: '#020617', borderWidth: 1, borderColor: '#374151', borderRadius: 8, padding: 12, fontSize: 15, color: '#F9FAFB', marginBottom: 12 },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePickerVal: { fontSize: 15, color: '#F9FAFB', flex: 1 },
  datePickerPlaceholder: { fontSize: 15, color: '#6B7280', flex: 1 },
  datePickerIcon: { fontSize: 18 },
  calendarInline: { marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  saveBtn: { backgroundColor: '#4F46E5', padding: 14, borderRadius: 10, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // Library
  searchBar: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  searchInput: { backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#374151', paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#F9FAFB' },
  songCard: { padding: 14, backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', marginBottom: 10 },
  songHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  songTitle: { fontSize: 15, fontWeight: '700', color: '#F9FAFB', flex: 1 },
  keyBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#8B5CF6', borderRadius: 6 },
  keyBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  songArtist: { fontSize: 12, color: '#9CA3AF', marginBottom: 8 },
  songFlags: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  songFlag: { fontSize: 12, fontWeight: '600' },
  flagHas: { color: '#22C55E' },
  flagMissing: { color: '#4B5563' },
  songServices: { fontSize: 11, color: '#6B7280', marginTop: 4 },

  // Messages
  composeScreen: { flex: 1 },
  composeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  composeHeaderSpacer: { width: 52 },
  composeSendText: { fontSize: 15, color: '#8B5CF6', fontWeight: '700', minWidth: 40, textAlign: 'right' },
  composeBodyWrap: { padding: 16, paddingBottom: 40 },
  toRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  toLabel: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', width: 26 },
  toChip: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: '#0B1120',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 12,
  },
  toChipText: { fontSize: 14, fontWeight: '600', color: '#E5E7EB' },
  chevron: { fontSize: 22, lineHeight: 22, color: '#4B5563' },
  composeInput: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#F9FAFB',
    marginBottom: 12,
  },
  composeBodyInput: {
    minHeight: 180,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#F9FAFB',
  },
  pickerSearch: {
    backgroundColor: '#0B1120',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#F9FAFB',
    margin: 16,
    marginBottom: 10,
  },
  pickerList: { paddingHorizontal: 16, paddingBottom: 28 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  pickerItemActive: {
    borderColor: '#8B5CF6',
    backgroundColor: '#141127',
  },
  pickerItemDisabled: {
    opacity: 0.55,
  },
  pickerItemIcon: { fontSize: 20 },
  pickerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#4338CA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerAvatarText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  pickerItemName: { fontSize: 14, fontWeight: '700', color: '#F9FAFB' },
  pickerItemNameDisabled: { color: '#9CA3AF' },
  pickerItemSub: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  checkmark: { fontSize: 18, fontWeight: '800', color: '#8B5CF6' },
  pickerEmpty: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 24,
  },
  msgCard: { padding: 14, backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', marginBottom: 10 },
  msgCardUnread: { borderColor: '#8B5CF6', backgroundColor: '#0D0B1E' },
  msgHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B5CF6' },
  msgFrom: { fontSize: 14, fontWeight: '700', color: '#E5E7EB', flex: 1 },
  msgTime: { fontSize: 11, color: '#6B7280' },
  msgSubject: { fontSize: 15, fontWeight: '700', color: '#F9FAFB', marginBottom: 4 },
  msgPreview: { fontSize: 13, color: '#9CA3AF', lineHeight: 18, marginBottom: 6 },
  msgMeta: { fontSize: 11, color: '#A5B4FC', fontWeight: '600', marginBottom: 6 },
  repliedBadge: { fontSize: 11, color: '#22C55E', fontWeight: '600' },
  msgHint: { fontSize: 11, color: '#4B5563', marginTop: 8 },
  broadcastBadge: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#064E3B', borderRadius: 6, borderWidth: 1, borderColor: '#10B981' },
  broadcastBadgeText: { fontSize: 9, fontWeight: '700', color: '#34D399' },

  // Thread
  threadFrom: { fontSize: 12, color: '#9CA3AF', marginBottom: 8 },
  threadMeta: { fontSize: 12, color: '#A5B4FC', marginBottom: 8, fontWeight: '600' },
  threadBubble: { backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#374151', padding: 14, marginBottom: 16 },
  threadText: { fontSize: 15, color: '#E5E7EB', lineHeight: 24 },
  adminBubble: { backgroundColor: '#1E1B4B', borderRadius: 10, borderWidth: 1, borderColor: '#4F46E5', padding: 12, marginBottom: 10 },
  adminBubbleFrom: { fontSize: 11, color: '#818CF8', marginBottom: 4 },
  adminBubbleText: { fontSize: 14, color: '#E5E7EB', lineHeight: 22 },
  replyLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  replyInput: { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#374151', borderRadius: 8, padding: 12, fontSize: 14, color: '#F9FAFB', minHeight: 80, textAlignVertical: 'top', marginBottom: 10 },
  replyBtn: { backgroundColor: '#8B5CF6', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 40 },
  replyBtnDisabled: { opacity: 0.6 },
  replyBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#0B1120', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderTopWidth: 1, borderColor: '#374151', maxHeight: '85%' },
  modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#F9FAFB', flex: 1 },
  modalClose: { fontSize: 18, color: '#6B7280', fontWeight: '700', paddingLeft: 10 },
  modalLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginBottom: 8, textTransform: 'uppercase' },
  modalSearch: { backgroundColor: '#020617', borderWidth: 1, borderColor: '#374151', borderRadius: 8, padding: 10, fontSize: 14, color: '#F9FAFB', marginBottom: 12 },
  modalSongRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: '#020617', borderWidth: 1, borderColor: '#374151', marginBottom: 8 },
  modalSongTitle: { fontSize: 14, fontWeight: '600', color: '#F9FAFB' },
  modalSongArtist: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  modalSongAdd: { fontSize: 13, fontWeight: '700', color: '#4B5563', marginLeft: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  roleChipBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151' },
  roleChipBtnActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  roleChipBtnText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  roleChipBtnTextActive: { color: '#FFF' },
  modalPerson: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: '#020617', borderWidth: 1, borderColor: '#374151', marginBottom: 8 },
  modalPersonBlocked: { borderColor: '#EF444450', backgroundColor: '#1A0A0A' },
  modalPersonName: { fontSize: 14, fontWeight: '600', color: '#F9FAFB' },
  blockedPersonName: { color: '#EF4444' },
  modalPersonEmail: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  modalPersonAdd: { fontSize: 11, color: '#4B5563', fontWeight: '600', marginLeft: 8, textAlign: 'right', maxWidth: 110 },
  personAvatarBlocked: { backgroundColor: '#EF444420' },
  blockedLabel: { fontSize: 10, color: '#EF4444', fontWeight: '700', marginTop: 2 },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  emptyCaption: { fontSize: 12, color: '#4B5563', textAlign: 'center', marginTop: 6, lineHeight: 18, paddingHorizontal: 24 },

  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  // Proposals
  proposalCard: { backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#1E3A2F', padding: 14, marginBottom: 10 },
  proposalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  proposalSong: { fontSize: 15, fontWeight: '700', color: '#F9FAFB', flex: 1 },
  proposalTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#1E293B', borderRadius: 8, borderWidth: 1, borderColor: '#374151', marginLeft: 8 },
  proposalTypeBadgeText: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  proposalFrom: { fontSize: 12, color: '#6B7280', marginBottom: 8 },
  proposalPreview: { fontSize: 13, color: '#D1D5DB', fontFamily: 'Courier', backgroundColor: '#060F1E', borderRadius: 8, padding: 10, marginBottom: 12, lineHeight: 20 },
  proposalActions: { flexDirection: 'row', gap: 10 },
  proposalApproveBtn: { flex: 1, backgroundColor: '#059669', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  proposalApproveBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  proposalRejectBtn: { paddingHorizontal: 20, borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#374151', alignItems: 'center' },
  proposalRejectBtnText: { fontSize: 13, fontWeight: '600', color: '#EF4444' },

  // Pending Approvals (from Leaders)
  pendingApprovalSection: { backgroundColor: '#7C3AED11', borderRadius: 12, borderWidth: 1, borderColor: '#7C3AED33', padding: 12, marginBottom: 14 },
  pendingApprovalHeader:  { color: '#A78BFA', fontSize: 12, fontWeight: '800', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  pendingApprovalCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#1E2A40', padding: 10, marginBottom: 8 },
  pendingApprovalTitle:   { color: '#E0E7FF', fontSize: 14, fontWeight: '700' },
  pendingApprovalMeta:    { color: '#6B7280', fontSize: 11, marginTop: 2 },
  approveBtn:             { backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  approveBtnTxt:          { color: '#FFF', fontSize: 12, fontWeight: '800' },
  rejectBtn:              { backgroundColor: '#7F1D1D22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#EF4444' },
  rejectBtnTxt:           { color: '#EF4444', fontSize: 12, fontWeight: '700' },

  // Grant Role button
  grantRoleBtn:    { backgroundColor: '#7C3AED22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: '#7C3AED' },
  grantRoleBtnTxt: { color: '#A78BFA', fontSize: 13 },

  // Edit member button
  editMemberBtn:    { backgroundColor: '#1E2A4020', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: '#374151' },
  editMemberBtnTxt: { color: '#9CA3AF', fontSize: 14 },

  // Add Song tabs
  addSongTabs:         { flexDirection: 'row', gap: 6, marginBottom: 16 },
  addSongTab:          { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151', alignItems: 'center' },
  addSongTabActive:    { backgroundColor: '#4F46E520', borderColor: '#4F46E5' },
  addSongTabText:      { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  addSongTabTextActive:{ color: '#818CF8', fontWeight: '700' },
  multilineInput:      { minHeight: 220, textAlignVertical: 'top' },
  monoInput:           { fontFamily: 'Courier', fontSize: 13, lineHeight: 20 },

  // Services v2 (roster view)
  svc2Card:          { backgroundColor: '#0B1120', borderRadius: 14, borderWidth: 1, borderColor: '#1E2A40', marginBottom: 14, overflow: 'hidden' },
  svc2Header:        { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#1E2A40' },
  svc2Name:          { fontSize: 15, fontWeight: '800', color: '#F0F4FF' },
  svc2Date:          { fontSize: 11, color: '#6B7280', marginTop: 3 },
  svc2PublishBtn:    { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#4C1D9530', borderRadius: 10, borderWidth: 1, borderColor: '#7C3AED', marginLeft: 10 },
  svc2PublishTxt:    { fontSize: 12, fontWeight: '700', color: '#A78BFA' },
  svc2Roster:        { paddingHorizontal: 14, paddingBottom: 8, paddingTop: 4 },
  svc2Row:           { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  svc2RowBorder:     { borderBottomWidth: 1, borderBottomColor: '#111827' },
  svc2Avatar:        { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  svc2AvatarTxt:     { fontSize: 13, fontWeight: '800', color: '#FFF' },
  svc2MemberName:    { fontSize: 13, fontWeight: '700', color: '#E5E7EB' },
  svc2RoleChip:      { alignSelf: 'flex-start', backgroundColor: '#1F2937', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 },
  svc2RoleChipTxt:   { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },
  svc2StatusBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  svc2StatusDot:     { fontSize: 8, lineHeight: 10 },
  svc2StatusTxt:     { fontSize: 11, fontWeight: '700' },
  svc2EmptyTeam:     { padding: 14, paddingTop: 10 },
  svc2EmptyTeamTxt:  { fontSize: 12, color: '#4B5563', fontStyle: 'italic' },
  svc2RemoveBtn:     { width: 28, height: 28, borderRadius: 7, backgroundColor: '#1F0A0A', borderWidth: 1, borderColor: '#EF444440', alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  svc2RemoveBtnTxt:  { fontSize: 13, fontWeight: '700', color: '#F87171' },

  // Team v2 (professional member cards)
  teamRegisterCard:      { backgroundColor: '#0D1426', borderRadius: 14, borderWidth: 1, borderColor: '#2D3B58', marginBottom: 14, padding: 14 },
  teamRegisterTop:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  teamRegisterIconWrap:  { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E1B4B', borderWidth: 1, borderColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  teamRegisterIcon:      { fontSize: 18 },
  teamRegisterTitle:     { fontSize: 15, fontWeight: '800', color: '#E0E7FF' },
  teamRegisterSub:       { fontSize: 12, color: '#6B7280', marginTop: 2 },
  teamRegisterLinkRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#060C1A', borderRadius: 10, borderWidth: 1, borderColor: '#1E2A40', paddingHorizontal: 12, paddingVertical: 8 },
  teamRegisterLink:      { flex: 1, fontSize: 12, color: '#818CF8', fontFamily: 'Courier' },
  teamRegisterShareBtn:  { backgroundColor: '#4F46E5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  teamRegisterShareTxt:  { fontSize: 12, fontWeight: '700', color: '#FFF' },
  teamAddBtn:            { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151', borderRadius: 12, paddingVertical: 13, marginBottom: 10 },
  teamAddBtnTxt:         { fontSize: 14, fontWeight: '700', color: '#818CF8' },
  teamCountLabel:        { fontSize: 10, fontWeight: '800', color: '#4B5563', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, marginTop: 4 },
  tmCard:                { backgroundColor: '#0B1120', borderRadius: 14, borderWidth: 1, borderColor: '#1E2A40', marginBottom: 10, padding: 14 },
  tmCardBody:            { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  tmAvatar:              { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tmAvatarTxt:           { fontSize: 17, fontWeight: '800', color: '#FFF' },
  tmNameRow:             { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 3 },
  tmName:                { fontSize: 15, fontWeight: '700', color: '#F0F4FF', flexShrink: 1 },
  tmEmail:               { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  tmRoleRow:             { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  tmRoleChip:            { backgroundColor: '#1A1F36', borderRadius: 6, borderWidth: 1, borderColor: '#2D3B58', paddingHorizontal: 8, paddingVertical: 3 },
  tmRoleChipTxt:         { fontSize: 11, fontWeight: '600', color: '#818CF8' },
  tmStatusBadge:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  tmStatusDot:           { fontSize: 8, lineHeight: 10 },
  tmStatusTxt:           { fontSize: 10, fontWeight: '700' },
  tmActions:             { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  tmActionBtn:           { width: 36, height: 36, borderRadius: 9, backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  tmActionBtnPurple:     { backgroundColor: '#2D1B6B20', borderColor: '#7C3AED' },
  tmActionBtnRed:        { backgroundColor: '#1F0A0A', borderColor: '#EF444440' },
  tmActionBtnTxt:        { fontSize: 15 },
});
