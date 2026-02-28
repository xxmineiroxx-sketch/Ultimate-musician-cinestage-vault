import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getServices, updateService, deleteService, humanStatus, getActiveServiceId,
} from '../data/servicesStore';
import { getSongs, getPeople } from '../data/storage';
import {
  getPlanForService, addSongToService, removeSongFromService,
  assignTeamMember, removeTeamAssignment, updateServiceNotes, updateSongItem,
  distributeChordChart,
} from '../data/servicePlanStore';
import { getBlockoutsForDate } from '../data/blockoutsStore';
import { ROLE_OPTIONS } from '../data/models';
import { SERVICE_TYPES } from '../data/serviceTemplates';

// ─── Readiness helpers ────────────────────────────────────────────────────────
const THEME_MAP = {
  communion:  { id: 'th_communion',  label: 'Communion elements ready (bread & cup set up)' },
  eucharist:  { id: 'th_communion',  label: 'Communion elements ready (bread & cup set up)' },
  easter:     { id: 'th_easter',     label: 'Easter staging / visual elements confirmed' },
  christmas:  { id: 'th_christmas',  label: 'Christmas staging / visual elements confirmed' },
  baptism:    { id: 'th_baptism',    label: 'Baptism area / pool prepared' },
  healing:    { id: 'th_healing',    label: 'Prayer team briefed and in position' },
  prayer:     { id: 'th_prayer',     label: 'Prayer team briefed and in position' },
  memorial:   { id: 'th_memorial',   label: 'Memorial service materials confirmed' },
  conference: { id: 'th_conference', label: 'Conference schedule / speaker slots confirmed' },
  youth:      { id: 'th_youth',      label: 'Youth setup confirmed (stage, seating, AV)' },
  gospel:     { id: 'th_gospel',     label: 'Salvation / gospel presentation prepared' },
  worship:    { id: 'th_worship',    label: 'Worship flow order confirmed with the band' },
  dedication: { id: 'th_dedication', label: 'Baby / building dedication elements prepared' },
  outreach:   { id: 'th_outreach',   label: 'Outreach materials / guest welcome confirmed' },
};
const SERVICE_TYPE_READINESS_MAP = {
  communion:  'th_communion',
  easter:     'th_easter',
  christmas:  'th_christmas',
  conference: 'th_conference',
  youth:      'th_youth',
  rehearsal:  { id: 'th_rehearsal', label: 'All musicians have received chord charts' },
};
const READINESS_BASE = [
  { id: 'r_songs',  label: 'Songs finalized in setlist', base: true },
  { id: 'r_cues',   label: 'Cue stacks reviewed (Intro / Verse / Chorus…)', base: true },
  { id: 'r_team',   label: 'All team roles assigned', base: true },
  { id: 'r_click',  label: 'Click / Guide tested in Rehearsal', base: true },
  { id: 'r_pp',     label: 'ProPresenter / Lyrics target set', base: true },
  { id: 'r_lights', label: 'Lighting target confirmed', base: true },
];
function buildReadinessSuggestions(serviceType, songTagsList) {
  const seen = new Set();
  const results = [];
  function add(item) {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    results.push({ ...item, suggested: true, done: false });
  }
  const stEntry = SERVICE_TYPE_READINESS_MAP[serviceType];
  if (stEntry) {
    if (typeof stEntry === 'string') add(Object.values(THEME_MAP).find((v) => v.id === stEntry));
    else add(stEntry);
  }
  for (const rawTags of songTagsList) {
    const tags = (rawTags || '').toLowerCase().split(/[,;/\s]+/).map((t) => t.trim()).filter(Boolean);
    for (const tag of tags) {
      if (THEME_MAP[tag]) add(THEME_MAP[tag]);
    }
  }
  return results;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}
function toISO(display) {
  if (!display) return '';
  const [m, d, y] = display.split('/');
  return y && m && d ? `${y}-${m}-${d}` : display;
}

// ─── Status cycle ─────────────────────────────────────────────────────────────
const STATUS_CYCLE = ['draft', 'ready', 'locked'];
const STATUS_COLORS = { draft: '#D97706', ready: '#16A34A', locked: '#4F46E5' };
const STATUS_LABELS = { draft: '🟡 Draft', ready: '🟢 Ready', locked: '🔒 Locked' };

// ─── Sub-components ───────────────────────────────────────────────────────────
function TabBar({ active, onChange }) {
  const tabs = [
    { key: 'setlist', label: 'Setlist' },
    { key: 'team', label: 'Team' },
    { key: 'details', label: 'Details' },
  ];
  return (
    <View style={tb.row}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t.key}
          style={[tb.tab, active === t.key && tb.tabActive]}
          onPress={() => onChange(t.key)}
        >
          <Text style={[tb.tabText, active === t.key && tb.tabTextActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const tb = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: '#0B1120',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10,
  },
  tabActive: { backgroundColor: '#4F46E5' },
  tabText: { color: '#6B7280', fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#fff' },
});

// ─── Song row ─────────────────────────────────────────────────────────────────
function SongRow({ item, index, onRemove, onKeyEdit, onPress }) {
  const [editing, setEditing] = useState(false);
  const [transposedKey, setTransposedKey] = useState(item.transposedKey || '');

  const hasVocals = (item.vocalAssignments || []).length > 0;
  const hasLyrics = !!(item.chordChart || item.lyrics || '').trim();
  const hasNotes = Object.values(item.instrumentNotes || {}).some((v) => (v || '').trim());

  function save() {
    onKeyEdit(item.id, transposedKey.trim());
    setEditing(false);
  }

  return (
    <TouchableOpacity style={styles.songRow} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.songIndex}>
        <Text style={styles.songIndexText}>{index + 1}</Text>
      </View>
      <View style={styles.songInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={styles.songTitle}>{item.title}</Text>
          {hasVocals && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🎤 {item.vocalAssignments.length}</Text>
            </View>
          )}
          {hasLyrics && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>📝</Text>
            </View>
          )}
          {hasNotes && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🎸</Text>
            </View>
          )}
        </View>
        <Text style={styles.songMeta}>
          {item.artist ? `${item.artist} · ` : ''}
          Key: {item.transposedKey ? `${item.transposedKey} (orig ${item.key})` : (item.key || '—')}
          {item.bpm ? ` · ${item.bpm} BPM` : ''}
        </Text>
        {editing ? (
          <View style={styles.keyEditRow}>
            <TextInput
              style={styles.keyInput}
              value={transposedKey}
              onChangeText={setTransposedKey}
              placeholder="Transposed key (e.g. G)"
              placeholderTextColor="#4B5563"
              autoCapitalize="characters"
              maxLength={4}
            />
            <TouchableOpacity style={styles.keyEditSave} onPress={save}>
              <Text style={styles.keyEditSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.keyEditLink}>
              {item.transposedKey ? 'Edit key' : '+ Set transposed key'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
        <Text style={styles.removeBtnText}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Team row ─────────────────────────────────────────────────────────────────
function TeamRow({ assignment, isBlocked, onRemove }) {
  return (
    <View style={[styles.teamRow, isBlocked && styles.teamRowBlocked]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.teamRole}>{assignment.role}</Text>
        <View style={styles.teamPersonRow}>
          <Text style={styles.teamName}>{assignment.name}</Text>
          {isBlocked && (
            <View style={styles.blockedBadge}>
              <Text style={styles.blockedBadgeText}>⚠️ Unavailable</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
        <Text style={styles.removeBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ServicePlanScreen({ route, navigation }) {
  const paramServiceId = route?.params?.serviceId;

  const [loading, setLoading] = useState(true);
  const [resolvedServiceId, setResolvedServiceId] = useState(paramServiceId || null);
  const [service, setService] = useState(null);
  const [plan, setPlan] = useState({ songs: [], team: [], notes: '' });
  const [people, setPeople] = useState([]);
  const [library, setLibrary] = useState([]);
  const [blockedNames, setBlockedNames] = useState(new Set());
  const [tab, setTab] = useState('setlist');

  // Details edit state
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editType, setEditType] = useState('standard');
  const [saving, setSaving] = useState(false);

  // Song picker modal
  const [songModal, setSongModal] = useState(false);
  const [songSearch, setSongSearch] = useState('');

  // Team assign modal
  const [teamModal, setTeamModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [personSearch, setPersonSearch] = useState('');

  // Notes modal
  const [notesModal, setNotesModal] = useState(false);
  const [editNotes, setEditNotes] = useState('');

  // Readiness hints (auto-suggested from song themes — hidden until relevant)
  const [readinessHints, setReadinessHints] = useState([]);
  const [hintsExpanded, setHintsExpanded] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // Resolve service ID: prefer route param, fall back to active service
      const id = paramServiceId || await getActiveServiceId();
      if (!id) { setLoading(false); return; }

      setResolvedServiceId(id);

      const [svcs, peeps, songs, pl] = await Promise.all([
        getServices(),
        getPeople(),
        getSongs(),
        getPlanForService(id),
      ]);
      const svc = svcs.find((s) => s.id === id);
      if (!svc) { setLoading(false); return; }

      setService(svc);
      setPlan(pl);
      setPeople(peeps);
      setLibrary(songs);
      setEditTitle(svc.title || '');
      setEditDate(toDisplay(svc.date || ''));
      setEditTime(svc.time || '09:00');
      setEditType(svc.serviceType || 'standard');

      const blockouts = await getBlockoutsForDate(svc.date);
      setBlockedNames(new Set(blockouts.map((b) => (b.name || '').toLowerCase())));

      // Init readiness hints
      try {
        const tagsList = (pl.songs || []).map((s) => songs.find((l) => l.id === s.songId)?.tags || '');
        const initialSuggestions = buildReadinessSuggestions(svc.serviceType, tagsList);
        let hintsDoneMap = {};
        const raw = await AsyncStorage.getItem(`um/hints/v1/${id}`);
        if (raw) {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved)) hintsDoneMap = Object.fromEntries(saved.map((i) => [i.id, i.done]));
        }
        setReadinessHints(initialSuggestions.map((s) => ({ ...s, done: hintsDoneMap[s.id] ?? false })));
        if (initialSuggestions.length > 0) setHintsExpanded(true);
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  }, [paramServiceId]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', refresh);
    refresh();
    return unsub;
  }, [navigation, refresh]);

  // Songs already in the plan
  const planSongIds = useMemo(() => new Set(plan.songs.map((s) => s.songId)), [plan.songs]);

  // Filtered library for song picker
  const filteredLibrary = useMemo(() => {
    const q = songSearch.toLowerCase();
    return library.filter(
      (s) =>
        !planSongIds.has(s.id) &&
        (s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q))
    );
  }, [library, planSongIds, songSearch]);

  // Filtered people for team picker
  const filteredPeople = useMemo(() => {
    const q = personSearch.toLowerCase();
    return people.filter((p) => {
      // Name search
      if (q && !p.name?.toLowerCase().includes(q)) return false;
      // Role filter — when a role is selected, only show people who have it
      if (selectedRole && !(p.roles || []).includes(selectedRole)) return false;
      return true;
    });
  }, [people, personSearch, selectedRole]);

  // Group team by role
  const teamByRole = useMemo(() => {
    const map = {};
    for (const t of plan.team) {
      if (!map[t.role]) map[t.role] = [];
      map[t.role].push(t);
    }
    return map;
  }, [plan.team]);

  // Detected themes (used in hints UI)
  const detectedThemes = useMemo(() => {
    if (!service) return [];
    const names = [];
    if (service.serviceType && SERVICE_TYPE_READINESS_MAP[service.serviceType]) names.push(service.serviceType);
    for (const s of plan.songs) {
      const libSong = library.find((l) => l.id === s.songId);
      (libSong?.tags || '').toLowerCase().split(/[,;/\s]+/).forEach((t) => {
        const tt = t.trim();
        if (THEME_MAP[tt] && !names.includes(tt)) names.push(tt);
      });
    }
    return names;
  }, [plan.songs, library, service?.serviceType]);

  // Persist hints to AsyncStorage whenever they change
  useEffect(() => {
    if (resolvedServiceId) {
      AsyncStorage.setItem(`um/hints/v1/${resolvedServiceId}`, JSON.stringify(readinessHints));
    }
  }, [readinessHints, resolvedServiceId]);

  // Rebuild hints when song list changes (preserves existing done states)
  function rebuildHints(planSongs, svcType) {
    const tagsList = (planSongs || []).map((s) => library.find((l) => l.id === s.songId)?.tags || '');
    const newSuggestions = buildReadinessSuggestions(svcType || service?.serviceType, tagsList);
    setReadinessHints((prev) => {
      const doneMap = Object.fromEntries(prev.map((i) => [i.id, i.done]));
      return newSuggestions.map((s) => ({ ...s, done: doneMap[s.id] ?? false }));
    });
    if (newSuggestions.length > 0) setHintsExpanded(true);
  }

  function toggleHint(id) {
    setReadinessHints((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  // Handlers
  async function handleAddSong(song) {
    const next = await addSongToService(resolvedServiceId, song);
    setPlan(next);
    rebuildHints(next.songs);
  }

  async function handleRemoveSong(itemId) {
    Alert.alert('Remove song?', 'Remove this song from the setlist?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const next = await removeSongFromService(resolvedServiceId, itemId);
          setPlan(next);
          rebuildHints(next.songs);
        },
      },
    ]);
  }

  async function handleKeyEdit(itemId, key) {
    const next = await updateSongItem(resolvedServiceId, itemId, { transposedKey: key });
    setPlan(next);
    // Auto-redistribute chord chart in new key for all harmonic instruments
    const updatedItem = next.songs.find((s) => s.id === itemId);
    if (updatedItem?.chordChart) {
      const redistributed = await distributeChordChart(resolvedServiceId, itemId);
      setPlan(redistributed);
    }
  }

  async function handleAssignPerson(person) {
    if (!selectedRole) {
      Alert.alert('Pick a role first', 'Select a role above before choosing a person.');
      return;
    }
    const next = await assignTeamMember(resolvedServiceId, {
      role: selectedRole,
      personId: person.id,
      name: person.name,
    });
    setPlan(next);
    setTeamModal(false);
    setSelectedRole('');
    setPersonSearch('');
  }

  async function handleRemoveAssignment(assignmentId) {
    const next = await removeTeamAssignment(resolvedServiceId, assignmentId);
    setPlan(next);
  }

  async function handleSaveNotes() {
    const next = await updateServiceNotes(resolvedServiceId, editNotes);
    setPlan(next);
    setNotesModal(false);
  }

  async function handleStatusChange(newStatus) {
    if (newStatus === 'locked') {
      Alert.alert(
        'Lock service?',
        'Locking prevents further edits. You can unlock it later.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Lock', onPress: () => applyStatus('locked') },
        ]
      );
    } else {
      applyStatus(newStatus);
    }
  }

  async function applyStatus(status) {
    const svc = await updateService(resolvedServiceId, { status });
    setService(svc);
  }

  async function handleSaveDetails() {
    const isoDate = toISO(editDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      Alert.alert('Invalid date', 'Use MM/DD/YYYY format (e.g. 02/01/2026).');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(editTime)) {
      Alert.alert('Invalid time', 'Use HH:mm format (e.g. 09:00).');
      return;
    }
    setSaving(true);
    try {
      const svc = await updateService(resolvedServiceId, {
        title: editTitle.trim() || service.title,
        date: isoDate,
        time: editTime,
        serviceType: editType,
      });
      setService(svc);
      // Reload blockouts for potentially new date
      const blockouts = await getBlockoutsForDate(isoDate);
      setBlockedNames(new Set(blockouts.map((b) => (b.name || '').toLowerCase())));
      // Rebuild hints for new service type
      rebuildHints(plan.songs, editType);
      Alert.alert('Saved', 'Service details updated.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishToTeam() {
    if (plan.team.length === 0) {
      Alert.alert('No Team Assigned', 'Assign team members first before publishing.');
      return;
    }
    try {
      const people = await getPeople();
      const payload = {
        services: [{ ...service, id: resolvedServiceId }],
        people,
        plans: { [resolvedServiceId]: plan },
      };
      const res = await fetch('http://10.0.0.34:8099/sync/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        Alert.alert(
          '✅ Published!',
          `Assignment sent to ${plan.team.length} team member(s).\nThey can now sync in the Playback app.`
        );
      } else {
        Alert.alert('Publish Failed', JSON.stringify(data));
      }
    } catch (e) {
      Alert.alert('Sync Error', 'Could not reach sync server.\nMake sure it is running on port 8099.');
    }
  }

  async function handleDeleteService() {
    Alert.alert(
      'Delete service?',
      `"${service?.title}" will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await deleteService(resolvedServiceId);
            navigation.goBack();
          },
        },
      ]
    );
  }

  // ── Loading / not found ────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#818CF8" size="large" />
      </View>
    );
  }

  if (!service) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>No service selected.</Text>
        <Text style={[styles.notFoundText, { fontSize: 13, color: '#4B5563', marginTop: 8, marginBottom: 20 }]}>
          Open the Calendar, tap a service date, then tap "Open" to load a service plan.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Calendar')}
          style={[styles.backBtn, { backgroundColor: '#4F46E5', borderRadius: 12, marginBottom: 10 }]}
        >
          <Text style={[styles.backBtnText, { color: '#fff' }]}>Open Calendar →</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isLocked = service.status === 'locked';
  const statusColor = STATUS_COLORS[service.status] || STATUS_COLORS.draft;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── Service Header ─────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{service.title}</Text>
            <Text style={styles.headerMeta}>
              {toDisplay(service.date)} · {service.time} · {service.serviceType}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {STATUS_LABELS[service.status] || '🟡 Draft'}
            </Text>
          </View>
        </View>

        {/* Status quick-change (only when not locked, or allow unlock) */}
        <View style={styles.statusRow}>
          <Text style={styles.statusRowLabel}>Status:</Text>
          {STATUS_CYCLE.map((s) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.statusPill,
                service.status === s && { backgroundColor: STATUS_COLORS[s], borderColor: STATUS_COLORS[s] },
              ]}
              onPress={() => handleStatusChange(s)}
            >
              <Text style={[
                styles.statusPillText,
                service.status === s && { color: '#fff' },
              ]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Tab Bar ────────────────────────────────────────────── */}
      <TabBar active={tab} onChange={setTab} />

      {/* ── Tab Content ────────────────────────────────────────── */}
      {tab === 'setlist' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Setlist <Text style={styles.count}>({plan.songs.length})</Text>
            </Text>
            {!isLocked && (
              <TouchableOpacity style={styles.addBtn} onPress={() => { setSongSearch(''); setSongModal(true); }}>
                <Text style={styles.addBtnText}>+ Add Song</Text>
              </TouchableOpacity>
            )}
          </View>

          {plan.songs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No songs yet. Tap "+ Add Song" to build the setlist.</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Library')} style={styles.emptyLink}>
                <Text style={styles.emptyLinkText}>Go to Library →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            plan.songs.map((item, idx) => (
              <SongRow
                key={item.id}
                item={item}
                index={idx}
                onRemove={() => handleRemoveSong(item.id)}
                onKeyEdit={handleKeyEdit}
                onPress={() => navigation.navigate('SongPlanDetail', { serviceId: resolvedServiceId, itemId: item.id })}
              />
            ))
          )}

          {/* Readiness hints — auto-surfaces when song themes are detected */}
          {readinessHints.length > 0 && (
            <View style={styles.hintsCard}>
              <TouchableOpacity
                style={styles.hintsHeader}
                onPress={() => setHintsExpanded((e) => !e)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.hintsHeaderIcon}>✦</Text>
                  <Text style={styles.hintsHeaderTitle}>Readiness Hints</Text>
                  {readinessHints.every((i) => i.done) && (
                    <View style={styles.hintsDoneBadge}>
                      <Text style={styles.hintsDoneBadgeText}>✓ All set</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.hintsChevron}>{hintsExpanded ? '∧' : '∨'}</Text>
              </TouchableOpacity>

              {hintsExpanded && (
                <View style={styles.hintsBody}>
                  {detectedThemes.length > 0 && (
                    <Text style={styles.hintsThemeText}>
                      Based on:{' '}
                      <Text style={styles.hintsThemeHighlight}>
                        {detectedThemes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')}
                      </Text>
                    </Text>
                  )}
                  {readinessHints.map((hint) => (
                    <TouchableOpacity
                      key={hint.id}
                      style={[styles.hintItem, hint.done && styles.hintItemDone]}
                      onPress={() => toggleHint(hint.id)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.hintItemCheck}>{hint.done ? '✅' : '◇'}</Text>
                      <Text style={[styles.hintItemLabel, hint.done && styles.hintItemLabelDone]}>
                        {hint.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Notes */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => { setEditNotes(plan.notes || ''); setNotesModal(true); }}>
              <Text style={styles.addBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.notesBox}>
            <Text style={styles.notesText}>
              {plan.notes ? plan.notes : 'No notes. Tap Edit to add service notes.'}
            </Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {tab === 'team' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Team <Text style={styles.count}>({plan.team.length})</Text>
            </Text>
            {!isLocked && (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => { setSelectedRole(''); setPersonSearch(''); setTeamModal(true); }}
              >
                <Text style={styles.addBtnText}>+ Assign</Text>
              </TouchableOpacity>
            )}
          </View>

          {blockedNames.size > 0 && (
            <View style={styles.conflictBanner}>
              <Text style={styles.conflictBannerText}>
                ⚠️ {blockedNames.size} team member(s) marked unavailable on {toDisplay(service.date)}.
                Assignments with ⚠️ are potentially conflicted.
              </Text>
            </View>
          )}

          {plan.team.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No team assigned. Tap "+ Assign" to add members.</Text>
              <TouchableOpacity onPress={() => navigation.navigate('People & Roles')} style={styles.emptyLink}>
                <Text style={styles.emptyLinkText}>Manage People & Roles →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            ROLE_OPTIONS.filter((role) => teamByRole[role]).map((role) => (
              <View key={role} style={styles.roleGroup}>
                <Text style={styles.roleGroupLabel}>{role}</Text>
                {teamByRole[role].map((a) => (
                  <TeamRow
                    key={a.id}
                    assignment={a}
                    isBlocked={blockedNames.has(a.name.toLowerCase())}
                    onRemove={() => handleRemoveAssignment(a.id)}
                  />
                ))}
              </View>
            ))
          )}

          {plan.team.length > 0 && (
            <TouchableOpacity
              style={styles.publishBtn}
              onPress={handlePublishToTeam}
            >
              <Text style={styles.publishBtnText}>📡 Publish to Team</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {tab === 'details' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Edit Service</Text>

          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            style={styles.fieldInput}
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Service title"
            placeholderTextColor="#4B5563"
            editable={!isLocked}
          />

          <Text style={styles.fieldLabel}>Date (MM/DD/YYYY)</Text>
          <TextInput
            style={styles.fieldInput}
            value={editDate}
            onChangeText={setEditDate}
            placeholder="02/01/2026"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            editable={!isLocked}
          />

          <Text style={styles.fieldLabel}>Time (HH:mm)</Text>
          <TextInput
            style={styles.fieldInput}
            value={editTime}
            onChangeText={setEditTime}
            placeholder="09:00"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            editable={!isLocked}
          />

          <Text style={styles.fieldLabel}>Service Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {SERVICE_TYPES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.typePill, editType === t.id && styles.typePillActive]}
                onPress={() => !isLocked && setEditType(t.id)}
              >
                <Text style={[styles.typePillText, editType === t.id && styles.typePillTextActive]}>
                  {t.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {!isLocked && (
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSaveDetails}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
            </TouchableOpacity>
          )}

          {isLocked && (
            <TouchableOpacity
              style={styles.unlockBtn}
              onPress={() => handleStatusChange('draft')}
            >
              <Text style={styles.unlockBtnText}>🔓 Unlock Service</Text>
            </TouchableOpacity>
          )}

          <View style={styles.divider} />

          <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteService}>
            <Text style={styles.deleteBtnText}>Delete Service</Text>
          </TouchableOpacity>
          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      {/* ── Song Picker Modal ───────────────────────────────────── */}
      <Modal visible={songModal} transparent animationType="slide" onRequestClose={() => setSongModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Song</Text>
              <TouchableOpacity onPress={() => setSongModal(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              value={songSearch}
              onChangeText={setSongSearch}
              placeholder="Search songs..."
              placeholderTextColor="#4B5563"
              autoCapitalize="none"
            />
            <ScrollView showsVerticalScrollIndicator={false}>
              {filteredLibrary.length === 0 ? (
                <Text style={styles.emptyText}>
                  {library.length === 0
                    ? 'No songs in library. Go to Library to add songs.'
                    : 'All library songs already added to this setlist.'}
                </Text>
              ) : (
                filteredLibrary.map((song) => (
                  <TouchableOpacity
                    key={song.id}
                    style={styles.pickRow}
                    onPress={() => handleAddSong(song)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickRowTitle}>{song.title}</Text>
                      <Text style={styles.pickRowMeta}>
                        {song.artist ? `${song.artist} · ` : ''}
                        {song.originalKey || song.key || '—'} · {song.bpm || '—'} BPM
                      </Text>
                    </View>
                    <Text style={styles.pickRowAdd}>+ Add</Text>
                  </TouchableOpacity>
                ))
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Team Assign Modal ───────────────────────────────────── */}
      <Modal visible={teamModal} transparent animationType="slide" onRequestClose={() => setTeamModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, justifyContent: 'flex-end' }}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Assign Team Member</Text>
                <TouchableOpacity onPress={() => setTeamModal(false)}>
                  <Text style={styles.modalClose}>Done</Text>
                </TouchableOpacity>
              </View>

              {/* Step 1: Pick a role */}
              <Text style={styles.modalSectionLabel}>1. Select Role</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {ROLE_OPTIONS.map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[styles.rolePill, selectedRole === role && styles.rolePillActive]}
                    onPress={() => setSelectedRole(role)}
                  >
                    <Text style={[styles.rolePillText, selectedRole === role && styles.rolePillTextActive]}>
                      {role}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Step 2: Pick a person */}
              <Text style={styles.modalSectionLabel}>2. Select Person</Text>
              <TextInput
                style={styles.searchInput}
                value={personSearch}
                onChangeText={setPersonSearch}
                placeholder="Search people..."
                placeholderTextColor="#4B5563"
              />
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                {filteredPeople.length === 0 ? (
                  <View>
                    <Text style={styles.emptyText}>
                      {selectedRole
                        ? `No members have "${selectedRole}" assigned to their profile.`
                        : 'No members found.'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => { setTeamModal(false); navigation.navigate('People & Roles'); }}
                      style={{ marginTop: 8 }}
                    >
                      <Text style={[styles.emptyText, { color: '#818CF8' }]}>
                        Edit roles in People & Roles →
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  filteredPeople.map((person) => {
                    const isBlocked = blockedNames.has(person.name.toLowerCase());
                    return (
                      <TouchableOpacity
                        key={person.id}
                        style={styles.pickRow}
                        onPress={() => handleAssignPerson(person)}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.pickRowTitle}>{person.name}</Text>
                            {isBlocked && (
                              <View style={styles.blockedBadge}>
                                <Text style={styles.blockedBadgeText}>⚠️ Unavailable</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.pickRowMeta}>
                            {(person.roles || []).join(', ') || 'No roles set'}
                          </Text>
                        </View>
                        <Text style={styles.pickRowAdd}>Assign</Text>
                      </TouchableOpacity>
                    );
                  })
                )}
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Notes Modal ─────────────────────────────────────────── */}
      <Modal visible={notesModal} transparent animationType="slide" onRequestClose={() => setNotesModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Service Notes</Text>
              <TouchableOpacity onPress={() => setNotesModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.fieldInput, { height: 140, textAlignVertical: 'top' }]}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Add notes for this service..."
              placeholderTextColor="#4B5563"
              multiline
              autoFocus
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveNotes}>
              <Text style={styles.saveBtnText}>Save Notes</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617' },
  scroll: { padding: 16, paddingTop: 12 },

  // Header
  header: {
    backgroundColor: '#0B1120',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    padding: 16,
    paddingBottom: 12,
    marginBottom: 10,
  },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  headerTitle: { color: '#F9FAFB', fontSize: 20, fontWeight: '900' },
  headerMeta: { color: '#6B7280', fontSize: 12, marginTop: 3 },
  statusBadge: {
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusRowLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  statusPill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: '#374151', backgroundColor: 'transparent',
  },
  statusPillText: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },

  // Section
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  sectionTitle: { color: '#E5E7EB', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  count: { color: '#6B7280', fontWeight: '400', fontSize: 13 },

  addBtn: {
    backgroundColor: '#1E3A5F', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#2563EB',
  },
  addBtnText: { color: '#60A5FA', fontWeight: '800', fontSize: 12 },
  publishBtn: {
    backgroundColor: '#0F3D2E', borderRadius: 12, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#10B981', marginTop: 20,
  },
  publishBtnText: { color: '#10B981', fontWeight: '700', fontSize: 15 },

  // Song row
  songRow: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#0B1120',
    borderRadius: 14, borderWidth: 1, borderColor: '#1F2937',
    padding: 12, marginBottom: 8, gap: 10,
  },
  songIndex: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: '#1F2937',
    alignItems: 'center', justifyContent: 'center',
  },
  songIndexText: { color: '#9CA3AF', fontSize: 13, fontWeight: '700' },
  songInfo: { flex: 1 },
  songTitle: { color: '#F9FAFB', fontSize: 15, fontWeight: '800' },
  songMeta: { color: '#6B7280', fontSize: 12, marginTop: 3 },
  keyEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  keyInput: {
    flex: 1, backgroundColor: '#1F2937', borderRadius: 8, borderWidth: 1,
    borderColor: '#374151', color: '#F9FAFB', fontSize: 13, paddingHorizontal: 8, paddingVertical: 4,
  },
  keyEditSave: { backgroundColor: '#4F46E5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  keyEditSaveText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  keyEditLink: { color: '#818CF8', fontSize: 12, marginTop: 5, fontWeight: '600' },

  // Song detail badges
  badge: {
    backgroundColor: '#1E1B4B', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    marginLeft: 6, marginTop: 1,
  },
  badgeText: { color: '#A5B4FC', fontSize: 11, fontWeight: '700' },

  // Team row
  teamRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B1120',
    borderRadius: 14, borderWidth: 1, borderColor: '#1F2937',
    padding: 12, marginBottom: 6, gap: 10,
  },
  teamRowBlocked: { borderColor: '#7F1D1D', backgroundColor: '#0D0202' },
  teamRole: { color: '#818CF8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  teamPersonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  teamName: { color: '#F9FAFB', fontSize: 15, fontWeight: '700' },

  blockedBadge: {
    backgroundColor: '#7F1D1D', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  blockedBadgeText: { color: '#FCA5A5', fontSize: 10, fontWeight: '700' },

  roleGroup: { marginBottom: 12 },
  roleGroupLabel: {
    color: '#6B7280', fontSize: 11, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 6,
  },

  conflictBanner: {
    backgroundColor: '#431407', borderRadius: 10, borderWidth: 1,
    borderColor: '#92400E', padding: 10, marginBottom: 12,
  },
  conflictBannerText: { color: '#FDE68A', fontSize: 12, lineHeight: 17 },

  // Details tab
  fieldLabel: { color: '#6B7280', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 14 },
  fieldInput: {
    backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1,
    borderColor: '#1F2937', color: '#F9FAFB', fontSize: 14,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  typePill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#374151', marginRight: 8,
  },
  typePillActive: { backgroundColor: '#312E81', borderColor: '#4F46E5' },
  typePillText: { color: '#9CA3AF', fontWeight: '700', fontSize: 13 },
  typePillTextActive: { color: '#A5B4FC' },
  saveBtn: {
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  unlockBtn: {
    backgroundColor: '#1F2937', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#374151',
  },
  unlockBtnText: { color: '#E5E7EB', fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#1F2937', marginVertical: 20 },
  deleteBtn: {
    borderWidth: 1, borderColor: '#7F1D1D', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  deleteBtnText: { color: '#EF4444', fontWeight: '800' },

  // Notes
  notesBox: {
    backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1,
    borderColor: '#1F2937', padding: 12, minHeight: 60,
  },
  notesText: { color: '#6B7280', fontSize: 13, lineHeight: 19 },

  // Empty state
  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { color: '#4B5563', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyLink: { marginTop: 10 },
  emptyLinkText: { color: '#818CF8', fontSize: 13, fontWeight: '700' },

  // Not found
  notFoundText: { color: '#6B7280', fontSize: 16, marginBottom: 16 },
  backBtn: { backgroundColor: '#1F2937', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnText: { color: '#E5E7EB', fontWeight: '700' },

  // Remove button (shared)
  removeBtn: {
    backgroundColor: '#1F2937', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6, alignSelf: 'flex-start',
  },
  removeBtnText: { color: '#EF4444', fontWeight: '800', fontSize: 12 },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: '#1F2937', padding: 20, maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '900' },
  modalClose: { color: '#818CF8', fontWeight: '700', fontSize: 14 },
  modalSectionLabel: { color: '#6B7280', fontSize: 12, fontWeight: '700', marginBottom: 8 },

  searchInput: {
    backgroundColor: '#1F2937', borderRadius: 10, borderWidth: 1, borderColor: '#374151',
    color: '#F9FAFB', fontSize: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
  },

  pickRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1F2937', gap: 10,
  },
  pickRowTitle: { color: '#F9FAFB', fontSize: 14, fontWeight: '700' },
  pickRowMeta: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  pickRowAdd: { color: '#4ADE80', fontWeight: '800', fontSize: 13 },

  // Readiness hints panel
  hintsCard: {
    marginBottom: 16, borderRadius: 14, borderWidth: 1,
    borderColor: '#4338CA33', backgroundColor: '#0D0B1C', overflow: 'hidden',
  },
  hintsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12,
  },
  hintsHeaderIcon: { color: '#818CF8', fontSize: 13 },
  hintsHeaderTitle: { color: '#A5B4FC', fontWeight: '800', fontSize: 13 },
  hintsChevron: { color: '#4B5563', fontSize: 14 },
  hintsDoneBadge: {
    backgroundColor: '#052E16', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#166534',
  },
  hintsDoneBadgeText: { color: '#4ADE80', fontSize: 10, fontWeight: '800' },
  hintsBody: { paddingHorizontal: 12, paddingBottom: 12 },
  hintsThemeText: { color: '#4B5563', fontSize: 11, marginBottom: 8, lineHeight: 16 },
  hintsThemeHighlight: { color: '#818CF8', fontWeight: '700' },
  hintItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#1F2937',
  },
  hintItemDone: {},
  hintItemCheck: { fontSize: 14, marginTop: 1 },
  hintItemLabel: { color: '#C4B5FD', fontSize: 13, flex: 1, lineHeight: 18 },
  hintItemLabelDone: { color: '#4B5563', textDecorationLine: 'line-through' },

  // Role picker chips in team modal
  rolePill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: '#374151', marginRight: 8,
  },
  rolePillActive: { backgroundColor: '#312E81', borderColor: '#818CF8' },
  rolePillText: { color: '#9CA3AF', fontWeight: '700', fontSize: 12 },
  rolePillTextActive: { color: '#A5B4FC' },
});
