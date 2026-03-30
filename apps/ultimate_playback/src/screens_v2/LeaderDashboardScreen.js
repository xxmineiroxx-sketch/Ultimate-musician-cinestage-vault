/**
 * Leader Dashboard Screen - Ultimate Playback
 * For users with grantedRole === 'leader'.
 * Tabs: Calendar | Services | Team | Library
 *
 * Permissions:
 *   - Services: create (pending approval) — no delete
 *   - Team: view all members, add them to a service
 *   - Library: view songs, propose new songs (pending approval)
 *   - Calendar: read-only view of upcoming services + blockout dates
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  TextInput, ActivityIndicator, RefreshControl, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile } from '../services/storage';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

// ── Inline Calendar ──────────────────────────────────────────────────────────
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function InlineCalendar({ selectedDate, onSelect, markedDates = [] }) {
  const initial = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date();
  const [viewYear,  setViewYear]  = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1);
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y + 1)) : setViewMonth(m => m + 1);

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

  const cellKey = (day) =>
    `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

  return (
    <View style={cal.wrapper}>
      <View style={cal.header}>
        <TouchableOpacity style={cal.navBtn} onPress={prevMonth}><Text style={cal.navTxt}>‹</Text></TouchableOpacity>
        <Text style={cal.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity style={cal.navBtn} onPress={nextMonth}><Text style={cal.navTxt}>›</Text></TouchableOpacity>
      </View>
      <View style={cal.row}>
        {DAY_NAMES.map(d => <Text key={d} style={cal.dayName}>{d}</Text>)}
      </View>
      {Array.from({ length: cells.length / 7 }).map((_, ri) => (
        <View key={ri} style={cal.row}>
          {cells.slice(ri * 7, ri * 7 + 7).map((day, ci) => {
            if (!day) return <View key={ci} style={cal.cell} />;
            const key = cellKey(day);
            const isSelected = key === selectedDate;
            const isToday = key === todayStr;
            const isMarked = markedDates.includes(key);
            return (
              <TouchableOpacity key={ci} style={[cal.cell, isSelected && cal.cellSelected, isToday && !isSelected && cal.cellToday]} onPress={() => onSelect(key)} activeOpacity={0.7}>
                <Text style={[cal.cellTxt, isSelected && cal.cellTxtSelected, isToday && !isSelected && cal.cellTxtToday]}>{day}</Text>
                {isMarked && !isSelected && <View style={cal.dot} />}
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
  cellSelected:    { backgroundColor: '#7C3AED' },
  cellToday:       { borderWidth: 1, borderColor: '#7C3AED' },
  cellTxt:         { color: '#9CA3AF', fontSize: 13 },
  cellTxtSelected: { color: '#FFFFFF', fontWeight: '800' },
  cellTxtToday:    { color: '#A78BFA', fontWeight: '700' },
  dot:             { width: 4, height: 4, borderRadius: 2, backgroundColor: '#7C3AED', marginTop: 1 },
});

// ── Helpers ──────────────────────────────────────────────────────────────────
async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(tid); }
}

const SERVICE_TYPES = ['standard', 'communion', 'easter', 'christmas', 'conference', 'youth', 'rehearsal'];

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function LeaderDashboardScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { leaderEmail: paramEmail, leaderName: paramName } = route.params || {};

  const [tab, setTab]         = useState('Calendar');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [error, setError]     = useState(null);

  // Data
  const [allServices, setAllServices]   = useState([]); // approved services from library
  const [pendingServices, setPendingServices] = useState([]); // this leader's pending
  const [people, setPeople]             = useState([]);
  const [songs, setSongs]               = useState([]);
  const [pendingSongs, setPendingSongs] = useState([]); // this leader's pending songs
  const [plans, setPlans]               = useState({});
  const [blockoutDates, setBlockoutDates] = useState([]);

  // Calendar
  const [selectedDate, setSelectedDate] = useState('');

  // Create Service modal
  const [showNewService, setShowNewService]   = useState(false);
  const [newSvcName, setNewSvcName]           = useState('');
  const [newSvcDate, setNewSvcDate]           = useState('');
  const [newSvcTime, setNewSvcTime]           = useState('');
  const [newSvcType, setNewSvcType]           = useState('standard');
  const [newSvcNotes, setNewSvcNotes]         = useState('');
  const [savingSvc, setSavingSvc]             = useState(false);
  const [showDatePicker, setShowDatePicker]   = useState(false);

  // Propose Song modal
  const [showProposeSong, setShowProposeSong] = useState(false);
  const [songTitle, setSongTitle]             = useState('');
  const [songArtist, setSongArtist]           = useState('');
  const [songKey, setSongKey]                 = useState('');
  const [songBpm, setSongBpm]                 = useState('');
  const [songNotes, setSongNotes]             = useState('');
  const [savingSong, setSavingSong]           = useState(false);

  // Add to Service modal
  const [showAddToService, setShowAddToService]   = useState(false);
  const [addTarget, setAddTarget]                 = useState(null); // person to add
  const [addServiceId, setAddServiceId]           = useState('');
  const [addRole, setAddRole]                     = useState('');
  const [savingAdd, setSavingAdd]                 = useState(false);

  // Setlist editor
  const [showSetlist, setShowSetlist]         = useState(false);
  const [setlistSvcId, setSetlistSvcId]       = useState(null);
  const [setlistSongs, setSetlistSongs]       = useState([]);
  const [songPickerQuery, setSongPickerQuery] = useState('');
  const [savingSetlist, setSavingSetlist]     = useState(false);

  // Library search
  const [libQuery, setLibQuery] = useState('');

  React.useEffect(() => { loadAll(); }, []);

  const leaderEmail = () => profile?.email || paramEmail || '';
  const leaderName  = () => profile?.name  || paramName  || 'Leader';

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const hdrs = syncHeaders();
      const [prof, lib, pSvcs, pSongs] = await Promise.all([
        getUserProfile(),
        fetchJson(`${SYNC_URL}/sync/library-pull`, { headers: hdrs }),
        fetchJson(`${SYNC_URL}/sync/services/pending`, { headers: hdrs }).catch(() => []),
        fetchJson(`${SYNC_URL}/sync/library/pending-songs`, { headers: hdrs }).catch(() => []),
      ]);
      setProfile(prof);
      setAllServices(lib.services || []);
      setPeople(lib.people   || []);
      setSongs(lib.songs     || []);
      setPlans(lib.plans     || {});

      const myEmail = (prof?.email || paramEmail || '').toLowerCase();
      // Only show this leader's own pending items
      setPendingServices(Array.isArray(pSvcs) ? pSvcs.filter(s => (s.created_by_email || '').toLowerCase() === myEmail) : []);
      setPendingSongs(Array.isArray(pSongs) ? pSongs.filter(s => (s.from_email || '').toLowerCase() === myEmail) : []);

      // Blockout dots on calendar
      const bDates = (lib.blockouts || []).map(b => b.date).filter(Boolean);
      setBlockoutDates(bDates);
    } catch (e) {
      setError(e.message || 'Server unreachable');
    } finally {
      setLoading(false);
    }
  }, [paramEmail]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ── Create Service ──────────────────────────────────────────────────────
  const handleCreateService = async () => {
    if (!newSvcName.trim() || !newSvcDate.trim()) {
      Alert.alert('Missing fields', 'Service name and date are required.'); return;
    }
    setSavingSvc(true);
    try {
      const hdrs = syncHeaders();
      await fetchJson(`${SYNC_URL}/sync/services/propose`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({
          name: newSvcName.trim(), date: newSvcDate.trim(),
          time: newSvcTime.trim(), type: newSvcType,
          notes: newSvcNotes.trim(),
          created_by_email: leaderEmail(), created_by_name: leaderName(),
        }),
      });
      setShowNewService(false);
      setNewSvcName(''); setNewSvcDate(''); setNewSvcTime(''); setNewSvcType('standard'); setNewSvcNotes('');
      await loadAll();
      Alert.alert('Submitted', 'Your service is pending Admin/Manager approval.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setSavingSvc(false); }
  };

  // ── Propose Song ────────────────────────────────────────────────────────
  const handleProposeSong = async () => {
    if (!songTitle.trim()) { Alert.alert('Missing fields', 'Song title is required.'); return; }
    setSavingSong(true);
    try {
      const hdrs = syncHeaders();
      await fetchJson(`${SYNC_URL}/sync/library/song-propose`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({
          title: songTitle.trim(), artist: songArtist.trim(),
          key: songKey.trim(), bpm: parseInt(songBpm, 10) || 0,
          notes: songNotes.trim(),
          from_email: leaderEmail(), from_name: leaderName(),
        }),
      });
      setShowProposeSong(false);
      setSongTitle(''); setSongArtist(''); setSongKey(''); setSongBpm(''); setSongNotes('');
      await loadAll();
      Alert.alert('Submitted', 'Song is pending Admin/Manager approval.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setSavingSong(false); }
  };

  // ── Add Member to Service ───────────────────────────────────────────────
  const handleAddToService = async () => {
    if (!addServiceId) { Alert.alert('Select a service first.'); return; }
    if (!addRole.trim()) { Alert.alert('Enter a role.'); return; }
    setSavingAdd(true);
    try {
      const hdrs = syncHeaders();
      const lib = await fetchJson(`${SYNC_URL}/sync/library-pull`, { headers: hdrs });
      const plan = lib.plans?.[addServiceId] || { songs: [], team: [], notes: '' };
      const alreadyAdded = (plan.team || []).some(t =>
        (t.email || '').toLowerCase() === (addTarget?.email || '').toLowerCase()
      );
      if (alreadyAdded) { Alert.alert('Already added', 'This person is already on this service.'); return; }
      plan.team = [...(plan.team || []), {
        personId: addTarget?.id || addTarget?.email,
        email: addTarget?.email || '',
        name: addTarget?.name || '',
        role: addRole.trim(), status: 'pending',
      }];
      lib.plans[addServiceId] = plan;
      await fetchJson(`${SYNC_URL}/sync/library-push`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify(lib),
      });
      setShowAddToService(false); setAddTarget(null); setAddServiceId(''); setAddRole('');
      Alert.alert('Added', `${addTarget?.name} added to service.`);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setSavingAdd(false); }
  };

  // ── Save Setlist ─────────────────────────────────────────────────────────
  const handleSaveSetlist = async () => {
    setSavingSetlist(true);
    try {
      const hdrs = syncHeaders();
      const lib = await fetchJson(`${SYNC_URL}/sync/library-pull`, { headers: hdrs });
      if (!lib.plans) lib.plans = {};
      if (!lib.plans[setlistSvcId]) lib.plans[setlistSvcId] = { songs: [], team: [], notes: '' };
      lib.plans[setlistSvcId].songs = setlistSongs;
      await fetchJson(`${SYNC_URL}/sync/library-push`, { method: 'POST', headers: hdrs, body: JSON.stringify(lib) });
      setShowSetlist(false);
      Alert.alert('Saved', 'Setlist updated.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setSavingSetlist(false); }
  };

  const openSetlist = (svcId) => {
    const existingSongs = plans[svcId]?.songs || [];
    setSetlistSvcId(svcId);
    setSetlistSongs(existingSongs);
    setSongPickerQuery('');
    setShowSetlist(true);
  };

  const addSongToSetlist = (song) => {
    const already = setlistSongs.find(s => (s.id || s) === (song.id || song));
    if (!already) setSetlistSongs(prev => [...prev, song]);
  };

  const removeSongFromSetlist = (songId) => {
    setSetlistSongs(prev => prev.filter(s => (s.id || s) !== songId));
  };

  // ── Render Tabs ──────────────────────────────────────────────────────────
  const TABS = ['Calendar', 'Services', 'Team', 'Library'];

  const renderCalendar = () => {
    const markedDates = allServices.map(s => s.date).filter(Boolean);
    const svcOnDate = allServices.filter(s => s.date === selectedDate);
    return (
      <ScrollView contentContainerStyle={s.tabContent}>
        <InlineCalendar selectedDate={selectedDate} onSelect={setSelectedDate} markedDates={[...markedDates, ...blockoutDates]} />
        {selectedDate ? (
          svcOnDate.length > 0
            ? svcOnDate.map(sv => (
                <View key={sv.id} style={s.calSvcCard}>
                  <Text style={s.calSvcName}>{sv.name}</Text>
                  <Text style={s.calSvcMeta}>{sv.time || 'No time set'} · {sv.serviceType || sv.type || 'standard'}</Text>
                </View>
              ))
            : <Text style={s.emptyHint}>No services on {selectedDate}</Text>
        ) : (
          <Text style={s.emptyHint}>Tap a day to see services</Text>
        )}
      </ScrollView>
    );
  };

  const renderServices = () => {
    const allMyServices = [
      ...pendingServices,
      ...allServices.filter(sv => (sv.created_by_email || '').toLowerCase() === (profile?.email || paramEmail || '').toLowerCase()),
    ];
    return (
      <ScrollView contentContainerStyle={s.tabContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A78BFA" />}>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowNewService(true)}>
          <Text style={s.addBtnTxt}>＋ Create Service</Text>
        </TouchableOpacity>

        {allMyServices.length === 0 && <Text style={s.emptyHint}>No services yet. Create one above.</Text>}

        {allMyServices.map(sv => {
          const isPending = sv.status === 'pending_approval';
          const planSongs = plans[sv.id]?.songs || [];
          return (
            <View key={sv.id} style={[s.card, isPending && s.cardPending]}>
              <View style={s.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>{sv.name}</Text>
                  <Text style={s.cardMeta}>{sv.date || 'No date'}{sv.time ? ` · ${sv.time}` : ''}</Text>
                </View>
                {isPending
                  ? <View style={s.pendingBadge}><Text style={s.pendingBadgeTxt}>⏳ Pending</Text></View>
                  : <View style={s.approvedBadge}><Text style={s.approvedBadgeTxt}>✓ Approved</Text></View>
                }
              </View>
              {!isPending && (
                <TouchableOpacity style={s.setlistBtn} onPress={() => openSetlist(sv.id)}>
                  <Text style={s.setlistBtnTxt}>🎵 Edit Setlist ({planSongs.length} songs)</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderTeam = () => {
    const approvedServices = allServices.filter(sv =>
      (sv.created_by_email || '').toLowerCase() === (profile?.email || paramEmail || '').toLowerCase()
    );
    return (
      <ScrollView contentContainerStyle={s.tabContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A78BFA" />}>
        <Text style={s.sectionLabel}>Team Members ({people.length})</Text>
        {people.length === 0 && <Text style={s.emptyHint}>No members in the org yet.</Text>}
        {people.map(person => (
          <View key={person.id || person.email} style={s.memberRow}>
            <View style={s.memberAvatar}>
              <Text style={s.memberAvatarTxt}>{(person.name || '?')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.memberName}>{person.name}</Text>
              <Text style={s.memberEmail}>{person.email}</Text>
              {person.role ? <Text style={s.memberRole}>{person.role}</Text> : null}
            </View>
            <TouchableOpacity style={s.addServiceBtn} onPress={() => {
              if (approvedServices.length === 0) {
                Alert.alert('No approved services', 'You need at least one approved service to add members to.');
                return;
              }
              setAddTarget(person);
              setAddServiceId(approvedServices[0]?.id || '');
              setAddRole('');
              setShowAddToService(true);
            }}>
              <Text style={s.addServiceBtnTxt}>＋ Add</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderLibrary = () => {
    const filteredSongs = songs.filter(sg =>
      !libQuery || (sg.title || '').toLowerCase().includes(libQuery.toLowerCase()) ||
      (sg.artist || '').toLowerCase().includes(libQuery.toLowerCase())
    );
    return (
      <ScrollView contentContainerStyle={s.tabContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A78BFA" />}>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowProposeSong(true)}>
          <Text style={s.addBtnTxt}>＋ Propose Song</Text>
        </TouchableOpacity>

        {pendingSongs.length > 0 && (
          <View style={s.pendingSection}>
            <Text style={s.pendingSectionLabel}>⏳ Your Pending Songs ({pendingSongs.length})</Text>
            {pendingSongs.map(ps => (
              <View key={ps.id} style={s.pendingSongRow}>
                <Text style={s.pendingSongTitle}>{ps.title}</Text>
                <Text style={s.pendingSongMeta}>{ps.artist || 'Unknown artist'} · {ps.key || '?'} · BPM {ps.bpm || '?'}</Text>
                {ps.status === 'rejected' && <Text style={s.rejectedTxt}>✕ Rejected{ps.rejectReason ? `: ${ps.rejectReason}` : ''}</Text>}
              </View>
            ))}
          </View>
        )}

        <TextInput
          style={s.searchInput}
          placeholder="Search library..."
          placeholderTextColor="#4B5563"
          value={libQuery}
          onChangeText={setLibQuery}
        />
        <Text style={s.sectionLabel}>Library ({filteredSongs.length} songs)</Text>
        {filteredSongs.length === 0 && <Text style={s.emptyHint}>No songs found.</Text>}
        {filteredSongs.map(sg => (
          <View key={sg.id} style={s.songRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.songTitle}>{sg.title}</Text>
              <Text style={s.songMeta}>{sg.artist || 'Unknown'}{sg.key ? ` · ${sg.key}` : ''}{sg.bpm ? ` · ${sg.bpm} BPM` : ''}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Leader Dashboard</Text>
          <Text style={s.headerSub}>{profile?.name || paramName || 'Leader'}</Text>
        </View>
        <TouchableOpacity onPress={loadAll} style={s.refreshBtn}>
          <Text style={s.refreshBtnTxt}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabBtnTxt, tab === t && s.tabBtnTxtActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing
        ? <ActivityIndicator size="large" color="#A78BFA" style={{ marginTop: 40 }} />
        : error
          ? (
            <View style={s.errorBox}>
              <Text style={s.errorTxt}>{error}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={loadAll}><Text style={s.retryBtnTxt}>Retry</Text></TouchableOpacity>
            </View>
          )
          : tab === 'Calendar' ? renderCalendar()
          : tab === 'Services' ? renderServices()
          : tab === 'Team'     ? renderTeam()
          :                      renderLibrary()
      }

      {/* ── Create Service Modal ──────────────────────────────────────────── */}
      <Modal visible={showNewService} animationType="slide" transparent onRequestClose={() => setShowNewService(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Create Service</Text>
            <Text style={s.modalNote}>Will be submitted for Admin/Manager approval.</Text>

            <Text style={s.fieldLabel}>Service Name *</Text>
            <TextInput style={s.input} placeholder="e.g. Sunday Service" placeholderTextColor="#4B5563"
              value={newSvcName} onChangeText={setNewSvcName} />

            <Text style={s.fieldLabel}>Date * (YYYY-MM-DD)</Text>
            <TouchableOpacity style={s.input} onPress={() => setShowDatePicker(true)}>
              <Text style={newSvcDate ? s.inputTxt : s.inputPlaceholder}>{newSvcDate || 'Tap to select date'}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <InlineCalendar selectedDate={newSvcDate} onSelect={(d) => { setNewSvcDate(d); setShowDatePicker(false); }} />
            )}

            <Text style={s.fieldLabel}>Time (HH:MM)</Text>
            <TextInput style={s.input} placeholder="e.g. 10:00" placeholderTextColor="#4B5563"
              value={newSvcTime} onChangeText={setNewSvcTime} />

            <Text style={s.fieldLabel}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {SERVICE_TYPES.map(t => (
                <TouchableOpacity key={t} style={[s.typeChip, newSvcType === t && s.typeChipActive]} onPress={() => setNewSvcType(t)}>
                  <Text style={[s.typeChipTxt, newSvcType === t && s.typeChipTxtActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={s.fieldLabel}>Notes</Text>
            <TextInput style={[s.input, { height: 64 }]} placeholder="Optional notes" placeholderTextColor="#4B5563"
              multiline value={newSvcNotes} onChangeText={setNewSvcNotes} />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowNewService(false)}><Text style={s.cancelBtnTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={handleCreateService} disabled={savingSvc}>
                {savingSvc ? <ActivityIndicator color="#FFF" /> : <Text style={s.confirmBtnTxt}>Submit for Approval</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Propose Song Modal ────────────────────────────────────────────── */}
      <Modal visible={showProposeSong} animationType="slide" transparent onRequestClose={() => setShowProposeSong(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Propose Song</Text>
            <Text style={s.modalNote}>Will be submitted for Admin/Manager approval before appearing in the library.</Text>

            <Text style={s.fieldLabel}>Title *</Text>
            <TextInput style={s.input} placeholder="Song title" placeholderTextColor="#4B5563" value={songTitle} onChangeText={setSongTitle} />
            <Text style={s.fieldLabel}>Artist</Text>
            <TextInput style={s.input} placeholder="Artist name" placeholderTextColor="#4B5563" value={songArtist} onChangeText={setSongArtist} />
            <View style={s.rowInputs}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <Text style={s.fieldLabel}>Key</Text>
                <TextInput style={s.input} placeholder="G, Ab..." placeholderTextColor="#4B5563" value={songKey} onChangeText={setSongKey} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>BPM</Text>
                <TextInput style={s.input} placeholder="120" placeholderTextColor="#4B5563" keyboardType="numeric" value={songBpm} onChangeText={setSongBpm} />
              </View>
            </View>
            <Text style={s.fieldLabel}>Notes</Text>
            <TextInput style={[s.input, { height: 56 }]} placeholder="Optional notes" placeholderTextColor="#4B5563" multiline value={songNotes} onChangeText={setSongNotes} />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowProposeSong(false)}><Text style={s.cancelBtnTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={handleProposeSong} disabled={savingSong}>
                {savingSong ? <ActivityIndicator color="#FFF" /> : <Text style={s.confirmBtnTxt}>Submit</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add Member to Service Modal ───────────────────────────────────── */}
      <Modal visible={showAddToService} animationType="slide" transparent onRequestClose={() => setShowAddToService(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Add {addTarget?.name} to Service</Text>

            <Text style={s.fieldLabel}>Service</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {allServices
                .filter(sv => (sv.created_by_email || '').toLowerCase() === (profile?.email || paramEmail || '').toLowerCase())
                .map(sv => (
                  <TouchableOpacity key={sv.id} style={[s.typeChip, addServiceId === sv.id && s.typeChipActive]} onPress={() => setAddServiceId(sv.id)}>
                    <Text style={[s.typeChipTxt, addServiceId === sv.id && s.typeChipTxtActive]}>{sv.name} ({sv.date || '?'})</Text>
                  </TouchableOpacity>
                ))
              }
            </ScrollView>

            <Text style={s.fieldLabel}>Role</Text>
            <TextInput style={s.input} placeholder="e.g. Lead Vocal, Keys, Drums" placeholderTextColor="#4B5563" value={addRole} onChangeText={setAddRole} />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAddToService(false)}><Text style={s.cancelBtnTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={handleAddToService} disabled={savingAdd}>
                {savingAdd ? <ActivityIndicator color="#FFF" /> : <Text style={s.confirmBtnTxt}>Add to Service</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Setlist Editor Modal ──────────────────────────────────────────── */}
      <Modal visible={showSetlist} animationType="slide" transparent onRequestClose={() => setShowSetlist(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '85%' }]}>
            <Text style={s.modalTitle}>Edit Setlist</Text>

            {setlistSongs.length > 0 && (
              <>
                <Text style={s.fieldLabel}>Current Setlist</Text>
                {setlistSongs.map((sg, idx) => (
                  <View key={sg.id || idx} style={s.setlistRow}>
                    <Text style={s.setlistIdx}>{idx + 1}</Text>
                    <Text style={s.setlistSongTitle} numberOfLines={1}>{sg.title || sg}</Text>
                    <TouchableOpacity onPress={() => removeSongFromSetlist(sg.id || sg)}>
                      <Text style={s.setlistRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            <Text style={[s.fieldLabel, { marginTop: 10 }]}>Add Songs from Library</Text>
            <TextInput style={s.input} placeholder="Search songs..." placeholderTextColor="#4B5563" value={songPickerQuery} onChangeText={setSongPickerQuery} />
            <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
              {songs.filter(sg => {
                const q = songPickerQuery.toLowerCase();
                return !q || sg.title?.toLowerCase().includes(q) || sg.artist?.toLowerCase().includes(q);
              }).map(sg => (
                <TouchableOpacity key={sg.id} style={s.songPickerRow} onPress={() => addSongToSetlist(sg)}>
                  <Text style={s.songPickerTitle}>{sg.title}</Text>
                  <Text style={s.songPickerMeta}>{sg.artist || 'Unknown'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowSetlist(false)}><Text style={s.cancelBtnTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={handleSaveSetlist} disabled={savingSetlist}>
                {savingSetlist ? <ActivityIndicator color="#FFF" /> : <Text style={s.confirmBtnTxt}>Save Setlist</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: '#020617' },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E2A40' },
  backBtn:        { padding: 8, marginRight: 4 },
  backTxt:        { color: '#A78BFA', fontSize: 26, fontWeight: '700', lineHeight: 28 },
  headerTitle:    { color: '#E0E7FF', fontSize: 18, fontWeight: '800' },
  headerSub:      { color: '#6B7280', fontSize: 12, fontWeight: '500', marginTop: 1 },
  refreshBtn:     { padding: 8 },
  refreshBtnTxt:  { color: '#A78BFA', fontSize: 22 },

  tabBar:         { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1E2A40', backgroundColor: '#0B1120' },
  tabBtn:         { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive:   { borderBottomWidth: 2, borderBottomColor: '#7C3AED' },
  tabBtnTxt:      { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  tabBtnTxtActive:{ color: '#A78BFA', fontWeight: '800' },

  tabContent:     { padding: 16, paddingBottom: 40 },

  errorBox:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTxt:       { color: '#F87171', textAlign: 'center', marginBottom: 16, fontSize: 14 },
  retryBtn:       { backgroundColor: '#1E2A40', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryBtnTxt:    { color: '#A78BFA', fontWeight: '700' },

  addBtn:         { backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  addBtnTxt:      { color: '#FFF', fontWeight: '800', fontSize: 15 },

  card:           { backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#1E2A40', padding: 14, marginBottom: 10 },
  cardPending:    { borderColor: '#7C3AED33' },
  cardRow:        { flexDirection: 'row', alignItems: 'center' },
  cardTitle:      { color: '#E0E7FF', fontSize: 15, fontWeight: '700' },
  cardMeta:       { color: '#6B7280', fontSize: 12, marginTop: 2 },

  pendingBadge:   { backgroundColor: '#7C3AED22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#7C3AED' },
  pendingBadgeTxt:{ color: '#A78BFA', fontSize: 11, fontWeight: '700' },
  approvedBadge:  { backgroundColor: '#05966933', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#059669' },
  approvedBadgeTxt:{ color: '#34D399', fontSize: 11, fontWeight: '700' },

  setlistBtn:     { marginTop: 10, backgroundColor: '#1E2A40', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  setlistBtnTxt:  { color: '#A78BFA', fontSize: 13, fontWeight: '700' },

  sectionLabel:   { color: '#9CA3AF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  emptyHint:      { color: '#4B5563', fontSize: 13, textAlign: 'center', marginTop: 20 },

  calSvcCard:     { backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#1E2A40', padding: 12, marginBottom: 8 },
  calSvcName:     { color: '#E0E7FF', fontSize: 14, fontWeight: '700' },
  calSvcMeta:     { color: '#6B7280', fontSize: 12, marginTop: 2 },

  memberRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#1E2A40', padding: 10, marginBottom: 8 },
  memberAvatar:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#7C3AED33', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  memberAvatarTxt:{ color: '#A78BFA', fontSize: 15, fontWeight: '800' },
  memberName:     { color: '#E0E7FF', fontSize: 14, fontWeight: '700' },
  memberEmail:    { color: '#6B7280', fontSize: 11, marginTop: 1 },
  memberRole:     { color: '#A78BFA', fontSize: 11, marginTop: 2 },
  addServiceBtn:  { backgroundColor: '#7C3AED22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#7C3AED' },
  addServiceBtnTxt:{ color: '#A78BFA', fontSize: 12, fontWeight: '700' },

  songRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#1E2A40', padding: 12, marginBottom: 8 },
  songTitle:      { color: '#E0E7FF', fontSize: 14, fontWeight: '700' },
  songMeta:       { color: '#6B7280', fontSize: 11, marginTop: 2 },

  searchInput:    { backgroundColor: '#0B1120', borderRadius: 8, borderWidth: 1, borderColor: '#1E2A40', color: '#E0E7FF', paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginBottom: 12 },

  pendingSection:     { backgroundColor: '#7C3AED11', borderRadius: 10, borderWidth: 1, borderColor: '#7C3AED33', padding: 12, marginBottom: 14 },
  pendingSectionLabel:{ color: '#A78BFA', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  pendingSongRow:     { marginBottom: 8 },
  pendingSongTitle:   { color: '#E0E7FF', fontSize: 13, fontWeight: '700' },
  pendingSongMeta:    { color: '#6B7280', fontSize: 11, marginTop: 1 },
  rejectedTxt:        { color: '#F87171', fontSize: 11, marginTop: 2 },

  // Modal
  modalOverlay:   { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
  modalBox:       { backgroundColor: '#0B1120', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#1E2A40', padding: 20, maxHeight: '90%' },
  modalTitle:     { color: '#E0E7FF', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  modalNote:      { color: '#6B7280', fontSize: 12, marginBottom: 14 },
  fieldLabel:     { color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input:          { backgroundColor: '#111827', borderRadius: 8, borderWidth: 1, borderColor: '#1F2937', color: '#E0E7FF', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  inputTxt:       { color: '#E0E7FF', fontSize: 14 },
  inputPlaceholder:{ color: '#4B5563', fontSize: 14 },
  rowInputs:      { flexDirection: 'row' },
  modalBtns:      { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn:      { flex: 1, backgroundColor: '#1F2937', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtnTxt:   { color: '#9CA3AF', fontWeight: '700' },
  confirmBtn:     { flex: 2, backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  confirmBtnTxt:  { color: '#FFF', fontWeight: '800' },
  typeChip:       { backgroundColor: '#1F2937', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, borderWidth: 1, borderColor: '#374151' },
  typeChipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  typeChipTxt:    { color: '#9CA3AF', fontSize: 12, fontWeight: '600' },
  typeChipTxtActive:{ color: '#FFF', fontWeight: '700' },

  // Setlist editor
  setlistRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 8, padding: 8, marginBottom: 6 },
  setlistIdx:     { color: '#6B7280', fontSize: 12, fontWeight: '700', width: 20 },
  setlistSongTitle:{ flex: 1, color: '#E0E7FF', fontSize: 13, fontWeight: '600' },
  setlistRemove:  { color: '#F87171', fontSize: 16, paddingHorizontal: 8 },
  songPickerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  songPickerTitle:{ color: '#E0E7FF', fontSize: 13, fontWeight: '600', flex: 1 },
  songPickerMeta: { color: '#6B7280', fontSize: 11 },
});
