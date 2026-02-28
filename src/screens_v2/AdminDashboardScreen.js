/**
 * Admin Dashboard Screen - Ultimate Playback
 * MD role: manage services, team, library — cannot delete members or grant roles.
 * Admin role: full access including member deletion.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  TextInput, ActivityIndicator, RefreshControl, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile } from '../services/storage';

const SYNC_URL = 'http://10.0.0.34:8099';
const TABS = ['Messages', 'Calendar', 'Services', 'Team', 'Library'];

const ROLE_CHIPS = [
  'Worship Leader', 'Music Director', 'Vocal Lead', 'Vocal BGV',
  'Drums', 'Bass', 'Electric Guitar', 'Acoustic Guitar',
  'Keys', 'Synth/Pad', 'Tracks', 'Sound', 'Media',
];

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(tid); }
}

function monthLabel(dateStr) {
  if (!dateStr) return 'Undated';
  const d = new Date(dateStr);
  if (isNaN(d)) return 'Undated';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dayNum(dateStr) {
  if (!dateStr) return '?';
  const d = new Date(dateStr);
  return isNaN(d) ? '?' : d.getDate();
}

function dayShortMonth(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short' });
}

export default function AdminDashboardScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { mdRole } = route.params || {};
  // Admin has full access; MD has restricted access (no delete, no role grants)
  const isAdmin = mdRole === 'admin';

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

  // Services — create form
  const [showNewService, setShowNewService] = useState(false);
  const [newSvcName, setNewSvcName]         = useState('');
  const [newSvcDate, setNewSvcDate]         = useState('');
  const [newSvcTime, setNewSvcTime]         = useState('');
  const [savingSvc, setSavingSvc]           = useState(false);

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

  React.useEffect(() => { loadAll(); }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prof, msgs, debug, blockoutsRaw, responsesRaw] = await Promise.all([
        getUserProfile(),
        fetchJson(`${SYNC_URL}/sync/messages/admin`),
        fetchJson(`${SYNC_URL}/sync/debug`),
        fetchJson(`${SYNC_URL}/sync/blockouts`),
        fetchJson(`${SYNC_URL}/sync/assignment/responses`),
      ]);
      setProfile(prof);
      setMessages(Array.isArray(msgs) ? msgs : []);
      setServices(debug.services || []);
      setPeople(debug.people   || []);
      setPlans(debug.plans     || {});

      // Build blockouts dict: { 'YYYY-MM-DD': ['email1', ...] }
      const bDict = {};
      for (const b of (blockoutsRaw || [])) {
        if (!bDict[b.date]) bDict[b.date] = [];
        bDict[b.date].push((b.email || '').toLowerCase());
      }
      setAllBlockouts(bDict);

      // Build responses dict: { assignmentId: { email, status } }
      const rDict = {};
      for (const r of (responsesRaw || [])) {
        rDict[r.assignmentId] = r;
      }
      setAssignmentResponses(rDict);
    } catch (e) {
      setError(e.message || 'Server unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Publish helper ──────────────────────────────────────────────────────
  const publishUpdate = async (updatedPlans, updatedServices, updatedPeople) => {
    const debug = await fetchJson(`${SYNC_URL}/sync/debug`);
    await fetchJson(`${SYNC_URL}/sync/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        services: updatedServices || debug.services,
        people:   updatedPeople   || debug.people,
        plans:    updatedPlans    || debug.plans,
      }),
    });
  };

  // ── Reply to message ────────────────────────────────────────────────────
  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      await fetchJson(
        `${SYNC_URL}/sync/message/reply?messageId=${encodeURIComponent(selectedMsg.id)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reply_text: replyText.trim(), admin_name: profile?.name || 'Admin' }) }
      );
      setReplyText('');
      Alert.alert('Sent ✓', 'Reply delivered.');
      loadAll(); setSelectedMsg(null);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSendingReply(false); }
  };

  // ── Create service ──────────────────────────────────────────────────────
  const handleCreateService = async () => {
    if (!newSvcName.trim()) { Alert.alert('Required', 'Service name is required.'); return; }
    if (!newSvcDate.trim()) { Alert.alert('Required', 'Date is required (YYYY-MM-DD).'); return; }
    setSavingSvc(true);
    try {
      const debug = await fetchJson(`${SYNC_URL}/sync/debug`);
      const newSvc = {
        id: `svc_${Date.now()}`, name: newSvcName.trim(), title: newSvcName.trim(),
        date: newSvcDate.trim(), time: newSvcTime.trim(), serviceType: 'standard', status: 'draft',
      };
      await publishUpdate(debug.plans, [...(debug.services || []), newSvc], null);
      setNewSvcName(''); setNewSvcDate(''); setNewSvcTime('');
      setShowNewService(false);
      Alert.alert('Created ✓', `Service "${newSvc.name}" added.`);
      loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSavingSvc(false); }
  };

  // ── Add song to service ─────────────────────────────────────────────────
  const handleAddSong = async (song) => {
    const target = svcForSong || expandedSvc;
    if (!target) return;
    try {
      const debug = await fetchJson(`${SYNC_URL}/sync/debug`);
      const plan  = debug.plans[target.id] || { songs: [], team: [], notes: '' };
      if ((plan.songs || []).some(s => s.id === song.id || (s.title === song.title && s.artist === song.artist))) {
        Alert.alert('Already added', `"${song.title}" is already in this setlist.`); return;
      }
      plan.songs = [...(plan.songs || []), { ...song, id: song.id || `song_${Date.now()}` }];
      debug.plans[target.id] = plan;
      await publishUpdate(debug.plans, null, null);
      setShowSongPicker(false); setSongQuery(''); setSvcForSong(null);
      Alert.alert('Added ✓', `"${song.title}" added.`);
      loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
  };

  // ── Remove song ─────────────────────────────────────────────────────────
  const handleRemoveSong = async (svcId, songId) => {
    try {
      const debug = await fetchJson(`${SYNC_URL}/sync/debug`);
      const plan = debug.plans[svcId] || { songs: [], team: [], notes: '' };
      plan.songs = (plan.songs || []).filter(s => s.id !== songId);
      debug.plans[svcId] = plan;
      await publishUpdate(debug.plans, null, null); loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
  };

  // ── Assign team member ──────────────────────────────────────────────────
  const handleAssign = async (person) => {
    if (!chipRole.trim()) { Alert.alert('Select Role', 'Tap a role chip first.'); return; }
    setSaving(true);
    try {
      const debug = await fetchJson(`${SYNC_URL}/sync/debug`);
      const svcId = assignTarget.id;
      const plan  = debug.plans[svcId] || { songs: [], team: [], notes: '' };
      plan.team = (plan.team || []).filter(t => !(t.personId === person.id && t.role === chipRole));
      plan.team.push({ id: `ta_${Date.now()}`, personId: person.id, name: person.name, role: chipRole });
      debug.plans[svcId] = plan;
      await publishUpdate(debug.plans, null, null);
      setShowAssignModal(false); setChipRole('');
      Alert.alert('Assigned ✓', `${person.name} → ${chipRole}`); loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  // ── Remove team member from service ────────────────────────────────────
  const handleRemoveFromService = async (svcId, personId, role) => {
    try {
      const debug = await fetchJson(`${SYNC_URL}/sync/debug`);
      const plan = debug.plans[svcId] || { songs: [], team: [], notes: '' };
      plan.team = (plan.team || []).filter(t => !(t.personId === personId && t.role === role));
      debug.plans[svcId] = plan;
      await publishUpdate(debug.plans, null, null); loadAll();
    } catch (e) { Alert.alert('Error', e.message); }
  };

  // ── Add member to people list (MD + Admin) ──────────────────────────────
  const handleAddMember = async () => {
    if (!newMemberName.trim()) { Alert.alert('Required', 'Name is required.'); return; }
    setSavingMember(true);
    try {
      const debug = await fetchJson(`${SYNC_URL}/sync/debug`);
      const newPerson = {
        id: `person_${Date.now()}`, name: newMemberName.trim(),
        email: newMemberEmail.trim(), roles: newMemberRole ? [newMemberRole] : [],
      };
      await publishUpdate(debug.plans, debug.services, [...(debug.people || []), newPerson]);
      setNewMemberName(''); setNewMemberEmail(''); setNewMemberRole('');
      setShowAddMember(false); loadAll();
      Alert.alert('Added ✓', `${newPerson.name} added to team.`);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSavingMember(false); }
  };

  // ── Delete member (Admin only) ──────────────────────────────────────────
  const handleDeleteMember = (person) => {
    Alert.alert('Remove member?', `Remove ${person.name} from the team?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          const debug = await fetchJson(`${SYNC_URL}/sync/debug`);
          await publishUpdate(debug.plans, debug.services,
            (debug.people || []).filter(p => p.id !== person.id));
          loadAll();
        } catch (e) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  // ── Library: de-dup songs across all plans ──────────────────────────────
  const libraryMap = {};
  Object.entries(plans).forEach(([svcId, plan]) => {
    (plan.songs || []).forEach(song => {
      const key = `${song.title}|||${song.artist || ''}`;
      if (!libraryMap[key]) libraryMap[key] = { ...song, _services: [] };
      const svc = services.find(sv => sv.id === svcId);
      libraryMap[key]._services.push(svc?.name || svc?.title || svcId);
    });
  });
  const libraryAll      = Object.values(libraryMap);
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
      <Text style={s.formLabel}>Date (YYYY-MM-DD)</Text>
      <TextInput style={s.formInput} value={newSvcDate} onChangeText={setNewSvcDate}
        placeholder="2026-03-15" placeholderTextColor="#6B7280" keyboardType="numbers-and-punctuation" />
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
          : songs.map((song, i) => (
          <View key={song.id || i} style={s.planSongRow}>
            <Text style={s.planSongNum}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.planSongTitle}>{song.title}</Text>
              {song.artist ? <Text style={s.planSongArtist}>{song.artist}</Text> : null}
            </View>
            {song.key ? <View style={s.keyChip}><Text style={s.keyChipText}>{song.key}</Text></View> : null}
            <TouchableOpacity style={s.removeBtn} onPress={() => handleRemoveSong(svc.id, song.id)}>
              <Text style={s.removeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

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
            const assignId = `${svc.id}_${tm.personId}`;
            const resp     = assignmentResponses[assignId];
            const respStatus = resp?.status || 'pending';
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
                      respStatus === 'accepted' && s.respBadgeAccepted,
                      respStatus === 'declined' && s.respBadgeDeclined,
                    ]}>
                      <Text style={[s.respBadgeText,
                        respStatus === 'accepted' && s.respTextAccepted,
                        respStatus === 'declined' && s.respTextDeclined,
                      ]}>
                        {respStatus === 'accepted' ? '✓ Accepted' : respStatus === 'declined' ? '✗ Declined' : '? Pending'}
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={s.removeBtn}
                  onPress={() => handleRemoveFromService(svc.id, tm.personId, tm.role)}>
                  <Text style={s.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
      </View>
    );
  };

  // ── Render: Calendar ────────────────────────────────────────────────────
  const renderCalendar = () => {
    // Group services by month, sorted chronologically
    const sorted = [...services].sort((a, b) => {
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

        {services.length === 0 && !loading && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📅</Text>
            <Text style={s.emptyText}>No services yet{'\n'}Tap "+ New Service" to create one</Text>
          </View>
        )}

        {Object.entries(byMonth).map(([month, svcs]) => (
          <View key={month}>
            <Text style={s.calMonthHeader}>{month}</Text>
            {svcs.map(svc => {
              const isOpen = expandedSvc?.id === svc.id;
              const plan   = plans[svc.id] || {};
              return (
                <View key={svc.id} style={[s.calCard, isOpen && s.calCardOpen]}>
                  <TouchableOpacity style={s.calCardTap}
                    onPress={() => setExpandedSvc(isOpen ? null : svc)}>
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
                    </View>
                    <Text style={[s.svcExpandHint, isOpen && { color: '#E5E7EB' }]}>
                      {isOpen ? '▲' : '▶'}
                    </Text>
                  </TouchableOpacity>
                  {isOpen && renderPlanSection(svc)}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    );
  };

  // ── Render: Services (flat list) ────────────────────────────────────────
  const renderServices = () => (
    <ScrollView
      contentContainerStyle={s.tabContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor="#8B5CF6" />}
    >
      <TouchableOpacity style={s.addBtn} onPress={() => setShowNewService(v => !v)}>
        <Text style={s.addBtnText}>{showNewService ? '✕ Cancel' : '+ New Service'}</Text>
      </TouchableOpacity>
      {renderNewServiceForm()}

      {services.length === 0 && !loading && (
        <View style={s.empty}><Text style={s.emptyIcon}>🗓</Text><Text style={s.emptyText}>No services yet</Text></View>
      )}

      {services.map(svc => {
        const plan   = plans[svc.id] || {};
        const isOpen = expandedSvc?.id === svc.id;
        return (
          <View key={svc.id} style={[s.svcCard, isOpen && s.svcCardOpen]}>
            <TouchableOpacity style={s.svcCardTap} onPress={() => setExpandedSvc(isOpen ? null : svc)}>
              <View style={s.svcHeaderRow}>
                <Text style={s.svcName}>{svc.name || svc.title}</Text>
                <Text style={s.svcDate}>{svc.date}</Text>
              </View>
              <Text style={s.svcMeta}>
                🎵 {(plan.songs || []).length} songs  ·  👥 {(plan.team || []).length} members
              </Text>
              <Text style={s.svcExpandHint}>{isOpen ? '▲ Close Plan' : '▼ Manage Plan'}</Text>
            </TouchableOpacity>
            {isOpen && renderPlanSection(svc)}
          </View>
        );
      })}
    </ScrollView>
  );

  // ── Render: Team ────────────────────────────────────────────────────────
  const renderTeam = () => (
    <ScrollView
      contentContainerStyle={s.tabContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor="#8B5CF6" />}
    >
      {/* Permission notice for MD */}
      {!isAdmin && (
        <View style={s.mdNoticeBanner}>
          <Text style={s.mdNoticeText}>
            🔐 You can add and assign members. Only Admins can delete members or grant special roles.
          </Text>
        </View>
      )}

      {/* Add Member — available to MD + Admin */}
      <TouchableOpacity style={s.addBtn} onPress={() => setShowAddMember(v => !v)}>
        <Text style={s.addBtnText}>{showAddMember ? '✕ Cancel' : '+ Add Member'}</Text>
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
              : <Text style={s.saveBtnText}>Add to Team</Text>}
          </TouchableOpacity>
        </View>
      )}

      {people.length === 0 && !loading && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>👥</Text>
          <Text style={s.emptyText}>No team members yet{'\n'}Publish from Musician or add one above</Text>
        </View>
      )}

      {people.map(person => (
        <View key={person.id || person.name} style={s.personCard}>
          <View style={s.personAvatar}>
            <Text style={s.personAvatarText}>{(person.name || '?')[0]}</Text>
          </View>
          <View style={s.personBody}>
            <Text style={s.personName}>{person.name}</Text>
            <Text style={s.personEmail}>{person.email || 'no email'}</Text>
            {(person.roles || []).length > 0 && (
              <Text style={s.personRoles}>{person.roles.join(' · ')}</Text>
            )}
          </View>
          {/* Delete — Admin only */}
          {isAdmin && (
            <TouchableOpacity style={s.deleteMemberBtn} onPress={() => handleDeleteMember(person)}>
              <Text style={s.deleteMemberBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </ScrollView>
  );

  // ── Render: Library ─────────────────────────────────────────────────────
  const renderLibrary = () => (
    <View style={{ flex: 1 }}>
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

  // ── Render: Messages ────────────────────────────────────────────────────
  const renderMessages = () => (
    <FlatList
      data={messages}
      keyExtractor={m => m.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor="#8B5CF6" />}
      contentContainerStyle={s.tabContent}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[s.msgCard, !item.read && s.msgCardUnread]}
          onPress={() => setSelectedMsg(item)}
        >
          <View style={s.msgHeader}>
            {!item.read && <View style={s.unreadDot} />}
            <Text style={s.msgFrom}>{item.from_name || item.from_email}</Text>
            <Text style={s.msgTime}>{timeAgo(item.timestamp)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text style={s.msgSubject}>{item.subject}</Text>
            {item.to === 'all_team' && (
              <View style={s.broadcastBadge}><Text style={s.broadcastBadgeText}>👥 Team</Text></View>
            )}
          </View>
          <Text style={s.msgPreview} numberOfLines={2}>{item.message}</Text>
          {(item.replies || []).length > 0 && (
            <Text style={s.repliedBadge}>✓ {item.replies.length} repl{item.replies.length > 1 ? 'ies' : 'y'} sent</Text>
          )}
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📭</Text>
          <Text style={s.emptyText}>No team messages yet</Text>
        </View>
      }
    />
  );

  // ── Message thread ──────────────────────────────────────────────────────
  if (selectedMsg) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => { setSelectedMsg(null); setReplyText(''); }}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitleFull} numberOfLines={1}>{selectedMsg.subject}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={s.threadFrom}>{selectedMsg.from_name} · {timeAgo(selectedMsg.timestamp)}</Text>
          <View style={s.threadBubble}><Text style={s.threadText}>{selectedMsg.message}</Text></View>
          {(selectedMsg.replies || []).map(r => (
            <View key={r.id} style={s.adminBubble}>
              <Text style={s.adminBubbleFrom}>{r.from} · {timeAgo(r.timestamp)}</Text>
              <Text style={s.adminBubbleText}>{r.message}</Text>
            </View>
          ))}
          <Text style={s.replyLabel}>Reply as Admin</Text>
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
            <Text style={s.mdBadgeText}>{isAdmin ? '👑 Admin' : '🎛 Music Director'}</Text>
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
        {TABS.map(t => (
          <TouchableOpacity key={t}
            style={[s.tabBtn, tab === t && s.tabBtnActive]}
            onPress={() => setTab(t)}>
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ flex: 1 }}>
        {tab === 'Messages' && renderMessages()}
        {tab === 'Calendar' && renderCalendar()}
        {tab === 'Services' && renderServices()}
        {tab === 'Team'     && renderTeam()}
        {tab === 'Library'  && renderLibrary()}
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
              data={people}
              keyExtractor={p => p.id || p.name}
              style={{ maxHeight: 240 }}
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
  svcExpandHint: { fontSize: 11, color: '#8B5CF6', fontWeight: '600' },

  // Plan section
  planSection: { padding: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1F2937' },
  planSubHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  planSubTitle: { fontSize: 13, fontWeight: '700', color: '#E5E7EB' },
  planAddBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#8B5CF6' },
  planAddBtnText: { fontSize: 12, fontWeight: '700', color: '#8B5CF6' },
  planEmpty: { fontSize: 12, color: '#4B5563', fontStyle: 'italic', marginBottom: 8, paddingLeft: 4 },
  planSongRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
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
  respTextAccepted: { color: '#10B981' },
  respTextDeclined: { color: '#EF4444' },
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
  msgCard: { padding: 14, backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', marginBottom: 10 },
  msgCardUnread: { borderColor: '#8B5CF6', backgroundColor: '#0D0B1E' },
  msgHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B5CF6' },
  msgFrom: { fontSize: 14, fontWeight: '700', color: '#E5E7EB', flex: 1 },
  msgTime: { fontSize: 11, color: '#6B7280' },
  msgSubject: { fontSize: 15, fontWeight: '700', color: '#F9FAFB', marginBottom: 4 },
  msgPreview: { fontSize: 13, color: '#9CA3AF', lineHeight: 18, marginBottom: 6 },
  repliedBadge: { fontSize: 11, color: '#22C55E', fontWeight: '600' },
  broadcastBadge: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#064E3B', borderRadius: 6, borderWidth: 1, borderColor: '#10B981' },
  broadcastBadgeText: { fontSize: 9, fontWeight: '700', color: '#34D399' },

  // Thread
  threadFrom: { fontSize: 12, color: '#9CA3AF', marginBottom: 8 },
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
});
