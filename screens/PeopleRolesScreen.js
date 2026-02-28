import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, Modal, KeyboardAvoidingView, Platform,
  Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { addOrUpdatePerson, deletePerson, getPeople } from '../data/storage';
import {
  getSharedTeamMembers, saveSharedTeamMembers, syncProfileToTeamMembers,
} from '../utils/sharedStorage';
import { makeId, ROLE_OPTIONS } from '../data/models';
import Chip from '../components/Chip';

// ─── Merge local (admin-managed) + shared (Ultimate Playback) ─────────────────
// Local people take role priority; shared members supply photo_url.
function mergeRosters(localPeople, sharedMembers) {
  const map = new Map();

  // Seed with local people
  for (const p of localPeople) {
    const key = p.email?.toLowerCase() || `local:${p.id}`;
    map.set(key, { ...p, _source: 'local' });
  }

  // Overlay shared members — add photo_url, mark origin
  for (const m of sharedMembers) {
    const key = m.email?.toLowerCase() || `shared:${m.id}`;
    if (map.has(key)) {
      const existing = map.get(key);
      map.set(key, {
        ...existing,
        photo_url: m.photo_url || existing.photo_url || null,
        _sharedId: m.id,
        _source: 'both',
      });
    } else {
      map.set(key, {
        id: m.id,
        name: m.name + (m.lastName ? ` ${m.lastName}` : ''),
        email: m.email || '',
        phone: m.phone || '',
        roles: m.roles || [],
        photo_url: m.photo_url || null,
        _sharedId: m.id,
        _source: 'playback',
      });
    }
  }

  return Array.from(map.values());
}

// ─── Photo picker helper ──────────────────────────────────────────────────────
async function pickPhoto() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission needed', 'Allow access to your photo library to upload an avatar.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return asset.base64
    ? `data:image/jpeg;base64,${asset.base64}`
    : asset.uri;
}

// ─── Avatar component ─────────────────────────────────────────────────────────
function Avatar({ name, photo_url, size = 44, onPress }) {
  const initials = (name || '?')[0].toUpperCase();
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {photo_url ? (
        <Image
          source={{ uri: photo_url }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initials}</Text>
      )}
      {onPress && (
        <View style={styles.avatarEditBadge}>
          <Text style={styles.avatarEditBadgeText}>📷</Text>
        </View>
      )}
    </Wrapper>
  );
}

// ─── Role picker ──────────────────────────────────────────────────────────────
function RolePicker({ selected, onToggle }) {
  return (
    <View style={styles.chipRow}>
      {ROLE_OPTIONS.map((role) => (
        <Chip
          key={role}
          label={role}
          selected={selected.includes(role)}
          onPress={() => onToggle(role)}
        />
      ))}
    </View>
  );
}

// ─── Person card ──────────────────────────────────────────────────────────────
function PersonCard({ person, onEdit, onViewProfile }) {
  const isFromPlayback = person._source === 'playback';
  const roleList = (person.roles || []).join(', ') || 'No roles assigned';
  return (
    <TouchableOpacity style={styles.card} onPress={() => onViewProfile(person)} activeOpacity={0.75}>
      <Avatar name={person.name} photo_url={person.photo_url} size={48} />
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <Text style={styles.personName}>{person.name}</Text>
          {isFromPlayback && (
            <View style={styles.upBadge}>
              <Text style={styles.upBadgeText}>Playback</Text>
            </View>
          )}
        </View>
        {(person.email || person.phone) ? (
          <Text style={styles.personMeta}>{person.email || person.phone}</Text>
        ) : null}
        <Text style={styles.rolesText}>{roleList}</Text>
      </View>
      <Text style={styles.editHint}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PeopleRolesScreen({ navigation }) {
  const [people, setPeople] = useState([]);

  // Add form
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addRoles, setAddRoles] = useState([]);
  const [addPhoto, setAddPhoto] = useState(null);

  // Edit modal
  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRoles, setEditRoles] = useState([]);
  const [editPhoto, setEditPhoto] = useState(null);

  // ── Load & merge ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [local, shared] = await Promise.all([getPeople(), getSharedTeamMembers()]);
    setPeople(mergeRosters(local, shared));
  }, []);

  useEffect(() => {
    const unsub = navigation?.addListener?.('focus', load);
    load();
    return unsub;
  }, [navigation, load]);

  // ── Shared sync helper ──────────────────────────────────────────────────────
  async function syncToShared(person) {
    await syncProfileToTeamMembers({
      id: person._sharedId || person.id,
      name: person.name,
      email: person.email,
      phone: person.phone,
      roles: person.roles,
      photo_url: person.photo_url || null,
    });
  }

  // ── Add handlers ────────────────────────────────────────────────────────────
  function toggleAddRole(r) {
    setAddRoles((p) => p.includes(r) ? p.filter((x) => x !== r) : [...p, r]);
  }

  async function handlePickAddPhoto() {
    const uri = await pickPhoto();
    if (uri) setAddPhoto(uri);
  }

  async function handleAdd() {
    if (!addName.trim()) {
      Alert.alert('Name required', 'Enter the team member\'s name.');
      return;
    }
    const person = {
      id: makeId('person'),
      name: addName.trim(),
      email: addEmail.trim(),
      phone: addPhone.trim(),
      roles: addRoles,
      photo_url: addPhoto || null,
    };
    const saved = await addOrUpdatePerson(person);
    await syncToShared(saved);
    setAddName(''); setAddEmail(''); setAddPhone('');
    setAddRoles([]); setAddPhoto(null);
    setAddFormOpen(false);
    load();
  }

  // ── Edit handlers ───────────────────────────────────────────────────────────
  function openEdit(person) {
    setEditTarget(person);
    setEditName(person.name || '');
    setEditEmail(person.email || '');
    setEditPhone(person.phone || '');
    setEditRoles(person.roles || []);
    setEditPhoto(person.photo_url || null);
    setEditModal(true);
  }

  function toggleEditRole(r) {
    setEditRoles((p) => p.includes(r) ? p.filter((x) => x !== r) : [...p, r]);
  }

  async function handlePickEditPhoto() {
    const uri = await pickPhoto();
    if (uri) setEditPhoto(uri);
  }

  async function handleSaveEdit() {
    if (!editName.trim()) {
      Alert.alert('Name required', 'Name cannot be empty.');
      return;
    }
    const updated = {
      ...editTarget,
      name: editName.trim(),
      email: editEmail.trim(),
      phone: editPhone.trim(),
      roles: editRoles,
      photo_url: editPhoto || null,
    };

    // Playback-only members don't exist in local storage — add them there too
    await addOrUpdatePerson(updated);
    await syncToShared(updated);
    setEditModal(false);
    load();
  }

  async function handleDeletePerson() {
    Alert.alert(
      'Remove member?',
      `Remove ${editTarget?.name} from the team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            // Remove from local storage
            await deletePerson(editTarget.id);
            // Remove from shared storage
            if (editTarget._sharedId || editTarget._source === 'playback') {
              const members = await getSharedTeamMembers();
              const sharedId = editTarget._sharedId || editTarget.id;
              await saveSharedTeamMembers(members.filter((m) => m.id !== sharedId));
            }
            setEditModal(false);
            load();
          },
        },
      ]
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const playbackCount = people.filter((p) => p._source === 'playback').length;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.heading}>People & Roles</Text>
            <Text style={styles.caption}>
              {people.length} member{people.length !== 1 ? 's' : ''}
              {playbackCount > 0 ? ` · ${playbackCount} from Playback` : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addMemberBtn}
            onPress={() => setAddFormOpen((v) => !v)}
          >
            <Text style={styles.addMemberBtnText}>
              {addFormOpen ? '✕ Cancel' : '+ Add Member'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Add form ──────────────────────────────────────────── */}
        {addFormOpen && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Team Member</Text>

            {/* Photo picker */}
            <View style={styles.photoRow}>
              <Avatar name={addName || '?'} photo_url={addPhoto} size={64} onPress={handlePickAddPhoto} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.photoHint}>Tap photo to upload an avatar</Text>
                {addPhoto && (
                  <TouchableOpacity onPress={() => setAddPhoto(null)}>
                    <Text style={styles.removePhotoLink}>Remove photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput style={styles.input} value={addName} onChangeText={setAddName}
              placeholder="Full name" placeholderTextColor="#4B5563" />

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput style={styles.input} value={addEmail} onChangeText={setAddEmail}
              placeholder="email@example.com" placeholderTextColor="#4B5563"
              keyboardType="email-address" autoCapitalize="none" />

            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput style={styles.input} value={addPhone} onChangeText={setAddPhone}
              placeholder="+1 555 000 0000" placeholderTextColor="#4B5563" keyboardType="phone-pad" />

            <Text style={styles.fieldLabel}>Roles</Text>
            <RolePicker selected={addRoles} onToggle={toggleAddRole} />
            {addRoles.length === 0 && (
              <Text style={styles.roleHint}>Tap a role above to select it.</Text>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
              <Text style={styles.saveBtnText}>Add Team Member</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── People list ───────────────────────────────────────── */}
        {people.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No team members yet.</Text>
            <Text style={styles.emptySubText}>Tap "+ Add Member" to get started.</Text>
          </View>
        ) : (
          people.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              onEdit={openEdit}
              onViewProfile={(p) => navigation.navigate('PersonProfile', { person: p })}
            />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Edit Member Modal ────────────────────────────────────── */}
      <Modal visible={editModal} transparent animationType="slide"
        onRequestClose={() => setEditModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Member</Text>
              <TouchableOpacity onPress={() => setEditModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Photo picker */}
              <View style={styles.photoRow}>
                <Avatar name={editName || '?'} photo_url={editPhoto} size={72} onPress={handlePickEditPhoto} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.photoHint}>Tap photo to change avatar</Text>
                  {editPhoto && (
                    <TouchableOpacity onPress={() => setEditPhoto(null)}>
                      <Text style={styles.removePhotoLink}>Remove photo</Text>
                    </TouchableOpacity>
                  )}
                  {editTarget?._source === 'playback' && (
                    <View style={[styles.upBadge, { marginTop: 6, alignSelf: 'flex-start' }]}>
                      <Text style={styles.upBadgeText}>Synced from Playback</Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput style={styles.input} value={editName} onChangeText={setEditName}
                placeholder="Full name" placeholderTextColor="#4B5563" />

              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput style={styles.input} value={editEmail} onChangeText={setEditEmail}
                placeholder="email@example.com" placeholderTextColor="#4B5563"
                keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput style={styles.input} value={editPhone} onChangeText={setEditPhone}
                placeholder="+1 555 000 0000" placeholderTextColor="#4B5563" keyboardType="phone-pad" />

              <Text style={styles.fieldLabel}>Roles</Text>
              <RolePicker selected={editRoles} onToggle={toggleEditRole} />
              {editRoles.length === 0 && (
                <Text style={styles.roleHint}>Tap a role above to select it.</Text>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDeletePerson}>
                  <Text style={styles.deleteBtnText}>Remove Member</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  scroll: { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 16,
  },
  heading: { color: '#F9FAFB', fontSize: 22, fontWeight: '900' },
  caption: { color: '#6B7280', fontSize: 12, marginTop: 3 },

  addMemberBtn: {
    backgroundColor: '#1E3A5F', borderRadius: 20,
    borderWidth: 1, borderColor: '#2563EB',
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addMemberBtnText: { color: '#60A5FA', fontWeight: '800', fontSize: 13 },

  // Add form
  formCard: {
    backgroundColor: '#0B1120', borderRadius: 16,
    borderWidth: 1, borderColor: '#1F2937',
    padding: 16, marginBottom: 16,
  },
  formTitle: { color: '#E5E7EB', fontSize: 16, fontWeight: '800', marginBottom: 16 },

  photoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  photoHint: { color: '#6B7280', fontSize: 12 },
  removePhotoLink: { color: '#EF4444', fontSize: 12, marginTop: 4, fontWeight: '600' },

  fieldLabel: { color: '#6B7280', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#020617', borderRadius: 10,
    borderWidth: 1, borderColor: '#1F2937',
    paddingHorizontal: 12, paddingVertical: 10,
    color: '#E5E7EB', fontSize: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  roleHint: { color: '#4B5563', fontSize: 11, marginTop: 4, marginBottom: 4 },

  saveBtn: {
    backgroundColor: '#16A34A', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', marginTop: 16,
  },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },

  // Person card
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0B1120', borderRadius: 14,
    borderWidth: 1, borderColor: '#1F2937',
    padding: 14, marginBottom: 10, gap: 12,
  },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personName: { color: '#F9FAFB', fontSize: 15, fontWeight: '800' },
  personMeta: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  rolesText: { color: '#818CF8', fontSize: 11, marginTop: 4, fontWeight: '600' },
  editHint: { color: '#374151', fontSize: 20, fontWeight: '700' },

  // Avatar
  avatar: {
    backgroundColor: '#312E81', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { color: '#A5B4FC', fontWeight: '900' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#1E3A5F', borderRadius: 8,
    width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadgeText: { fontSize: 10 },

  // Badges
  upBadge: {
    backgroundColor: '#1E3A5F', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#2563EB',
  },
  upBadgeText: { color: '#60A5FA', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },

  // Empty
  emptyState: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { color: '#4B5563', fontSize: 16, fontWeight: '700' },
  emptySubText: { color: '#374151', fontSize: 13, marginTop: 6 },

  // Edit modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: '#1F2937',
    padding: 20, maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '900' },
  modalClose: { color: '#6B7280', fontWeight: '700', fontSize: 14 },

  modalActions: { gap: 10, marginTop: 4 },
  deleteBtn: {
    borderWidth: 1, borderColor: '#7F1D1D', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  deleteBtnText: { color: '#EF4444', fontWeight: '800' },
});
