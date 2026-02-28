/**
 * PersonProfileScreen - Ultimate Musician
 * Full profile view for a team member with permissions management.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { addOrUpdatePerson, deletePerson } from '../data/storage';
import {
  getSharedTeamMembers, saveSharedTeamMembers, syncProfileToTeamMembers,
} from '../utils/sharedStorage';
import { ROLE_OPTIONS } from '../data/models';
import Chip from '../components/Chip';

const SYNC_URL = 'http://10.0.0.34:8099';
const ROLE_CYCLE = [null, 'md', 'admin'];
const ROLE_LABEL = { md: 'Music Director', admin: 'Admin' };
const ROLE_COLOR = { md: '#8B5CF6', admin: '#F59E0B' };
const ROLE_ICON  = { md: '🎛', admin: '👑' };

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(tid); }
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, photo_url, size = 80, onPress }) {
  const initials = (name || '?')[0].toUpperCase();
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress}
      style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {photo_url ? (
        <Image source={{ uri: photo_url }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover" />
      ) : (
        <Text style={[s.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
      )}
      {onPress && (
        <View style={s.avatarEditBadge}>
          <Text style={s.avatarEditBadgeText}>📷</Text>
        </View>
      )}
    </Wrapper>
  );
}

// ── Role picker (edit modal) ──────────────────────────────────────────────────
function RolePicker({ selected, onToggle }) {
  return (
    <View style={s.chipRow}>
      {ROLE_OPTIONS.map((role) => (
        <Chip key={role} label={role}
          selected={selected.includes(role)} onPress={() => onToggle(role)} />
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function PersonProfileScreen({ navigation, route }) {
  const { person: initialPerson } = route.params || {};
  const [person, setPerson]       = useState(initialPerson || null);

  // Grant state
  const [grant, setGrant]           = useState(null);
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantSaving, setGrantSaving]   = useState(false);
  const [grantError, setGrantError]     = useState(null);

  // Edit modal state
  const [editModal, setEditModal]   = useState(false);
  const [editName, setEditName]     = useState('');
  const [editEmail, setEditEmail]   = useState('');
  const [editPhone, setEditPhone]   = useState('');
  const [editRoles, setEditRoles]   = useState([]);
  const [editPhoto, setEditPhoto]   = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  // ── Load grant from sync server ───────────────────────────────────────────
  const loadGrant = useCallback(async () => {
    if (!person?.email) return;
    setGrantLoading(true);
    setGrantError(null);
    try {
      const data = await fetchJson(
        `${SYNC_URL}/sync/role?email=${encodeURIComponent(person.email.toLowerCase())}`
      );
      setGrant(data.role || null);
    } catch (_) {
      setGrantError('Cannot reach sync server');
    } finally {
      setGrantLoading(false);
    }
  }, [person?.email]);

  useEffect(() => { loadGrant(); }, [loadGrant]);

  if (!person) {
    return (
      <View style={s.root}>
        <Text style={{ color: '#9CA3AF', textAlign: 'center', marginTop: 80 }}>
          No member selected.
        </Text>
      </View>
    );
  }

  // ── Grant cycling ─────────────────────────────────────────────────────────
  const cycleGrant = async () => {
    const email = (person.email || '').toLowerCase();
    if (!email) {
      Alert.alert('No Email', `${person.name} has no email — add one to grant permissions.`);
      return;
    }
    const nextIdx  = (ROLE_CYCLE.indexOf(grant) + 1) % ROLE_CYCLE.length;
    const nextRole = ROLE_CYCLE[nextIdx];
    setGrantSaving(true);
    try {
      if (nextRole === null) {
        await fetchJson(
          `${SYNC_URL}/sync/grant?email=${encodeURIComponent(email)}`,
          { method: 'DELETE' }
        );
      } else {
        await fetchJson(`${SYNC_URL}/sync/grant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: person.name, role: nextRole }),
        });
      }
      setGrant(nextRole);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setGrantSaving(false);
    }
  };

  // ── Edit handlers ─────────────────────────────────────────────────────────
  function openEdit() {
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

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true,
      aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setEditPhoto(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri);
  }

  async function handleSaveEdit() {
    if (!editName.trim()) {
      Alert.alert('Name required', 'Name cannot be empty.');
      return;
    }
    setEditSaving(true);
    try {
      const updated = {
        ...person,
        name:      editName.trim(),
        email:     editEmail.trim(),
        phone:     editPhone.trim(),
        roles:     editRoles,
        photo_url: editPhoto || null,
      };
      await addOrUpdatePerson(updated);
      await syncProfileToTeamMembers({
        id:        updated._sharedId || updated.id,
        name:      updated.name,
        email:     updated.email,
        phone:     updated.phone,
        roles:     updated.roles,
        photo_url: updated.photo_url || null,
      });
      setPerson(updated);
      setEditModal(false);
    } catch (e) {
      Alert.alert('Error saving', e.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      'Remove member?',
      `Remove ${person.name} from the team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await deletePerson(person.id);
              if (person._sharedId || person._source === 'playback') {
                const members = await getSharedTeamMembers();
                const sharedId = person._sharedId || person.id;
                await saveSharedTeamMembers(members.filter((m) => m.id !== sharedId));
              }
              navigation.goBack();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  }

  const isFromPlayback = person._source === 'playback' || person._source === 'both';
  const roleList = (person.roles || []).join(' · ') || 'No roles assigned';

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Profile Card ───────────────────────────────────────── */}
        <View style={s.profileCard}>
          <Avatar name={person.name} photo_url={person.photo_url} size={96} />

          <Text style={s.profileName}>{person.name}</Text>

          {/* Badges */}
          <View style={s.badgeRow}>
            {isFromPlayback && (
              <View style={s.upBadge}>
                <Text style={s.upBadgeText}>Playback</Text>
              </View>
            )}
            {grant && (
              <View style={[s.grantBadge, {
                backgroundColor: ROLE_COLOR[grant] + '22',
                borderColor: ROLE_COLOR[grant],
              }]}>
                <Text style={[s.grantBadgeText, { color: ROLE_COLOR[grant] }]}>
                  {ROLE_ICON[grant]}  {ROLE_LABEL[grant]}
                </Text>
              </View>
            )}
          </View>

          {/* Contact info */}
          {person.email ? (
            <View style={s.infoRow}>
              <Text style={s.infoIcon}>✉️</Text>
              <Text style={s.infoValue}>{person.email}</Text>
            </View>
          ) : null}
          {person.phone ? (
            <View style={s.infoRow}>
              <Text style={s.infoIcon}>📱</Text>
              <Text style={s.infoValue}>{person.phone}</Text>
            </View>
          ) : null}

          {/* Roles */}
          <Text style={s.roleList}>{roleList}</Text>

          <TouchableOpacity style={s.editBtn} onPress={openEdit}>
            <Text style={s.editBtnText}>✏️  Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* ── Permissions Section ───────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🔐 App Permissions</Text>
          <Text style={s.sectionDesc}>
            Grant elevated access in Ultimate Playback.
            Tap the card below to cycle: None → Music Director → Admin → None
          </Text>

          {!person.email ? (
            <View style={s.warningRow}>
              <Text style={s.warningText}>
                ⚠️ No email set — add an email to grant permissions.
              </Text>
            </View>
          ) : grantLoading ? (
            <ActivityIndicator color="#8B5CF6" style={{ marginVertical: 20 }} />
          ) : grantError ? (
            <View style={s.errorRow}>
              <Text style={s.errorText}>⚠️ {grantError}</Text>
              <TouchableOpacity onPress={loadGrant}>
                <Text style={s.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                s.grantCycleCard,
                grant && { borderColor: ROLE_COLOR[grant], backgroundColor: ROLE_COLOR[grant] + '12' },
              ]}
              onPress={cycleGrant}
              disabled={grantSaving}
            >
              {grantSaving ? (
                <ActivityIndicator color="#8B5CF6" />
              ) : (
                <View style={s.grantCycleInner}>
                  <Text style={s.grantCycleIcon}>
                    {grant ? ROLE_ICON[grant] : '🚫'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.grantCycleName, grant && { color: ROLE_COLOR[grant] }]}>
                      {grant ? ROLE_LABEL[grant] : 'No Special Role'}
                    </Text>
                    <Text style={s.grantCycleHint}>
                      {grant === null
                        ? 'Tap to assign Music Director'
                        : grant === 'md'
                        ? 'Tap to promote to Admin'
                        : 'Tap to remove role'}
                    </Text>
                  </View>
                  <Text style={[s.grantCycleArrow, grant && { color: ROLE_COLOR[grant] }]}>
                    ⟳
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Legend */}
          <View style={s.legendRow}>
            <View style={s.legendItem}>
              <Text style={s.legendIcon}>🎛</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.legendLabel}>Music Director</Text>
                <Text style={s.legendDesc}>
                  Receives all team messages, can manage services, team & songs in Playback
                </Text>
              </View>
            </View>
            <View style={s.legendItem}>
              <Text style={s.legendIcon}>👑</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.legendLabel}>Admin</Text>
                <Text style={s.legendDesc}>
                  Full MD access + can approve content edits from the team
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Remove button ──────────────────────────────────────── */}
        <TouchableOpacity style={s.removeBtn} onPress={handleDelete}>
          <Text style={s.removeBtnText}>Remove from Team</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Edit Profile Modal ──────────────────────────────────── */}
      <Modal
        visible={editModal}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalOverlay}
        >
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModal(false)}>
                <Text style={s.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Photo */}
              <View style={s.photoRow}>
                <Avatar
                  name={editName || '?'} photo_url={editPhoto}
                  size={72} onPress={handlePickPhoto}
                />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={s.photoHint}>Tap photo to change avatar</Text>
                  {editPhoto && (
                    <TouchableOpacity onPress={() => setEditPhoto(null)}>
                      <Text style={s.removePhotoLink}>Remove photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <Text style={s.fieldLabel}>Name *</Text>
              <TextInput style={s.input} value={editName} onChangeText={setEditName}
                placeholder="Full name" placeholderTextColor="#4B5563" />

              <Text style={s.fieldLabel}>Email</Text>
              <TextInput style={s.input} value={editEmail} onChangeText={setEditEmail}
                placeholder="email@example.com" placeholderTextColor="#4B5563"
                keyboardType="email-address" autoCapitalize="none" />

              <Text style={s.fieldLabel}>Phone</Text>
              <TextInput style={s.input} value={editPhone} onChangeText={setEditPhone}
                placeholder="+1 555 000 0000" placeholderTextColor="#4B5563"
                keyboardType="phone-pad" />

              <Text style={s.fieldLabel}>Roles</Text>
              <RolePicker selected={editRoles} onToggle={toggleEditRole} />

              <View style={{ marginTop: 20, gap: 10 }}>
                <TouchableOpacity
                  style={[s.saveBtn, editSaving && { opacity: 0.6 }]}
                  onPress={handleSaveEdit}
                  disabled={editSaving}
                >
                  {editSaving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.saveBtnText}>Save Changes</Text>}
                </TouchableOpacity>
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#020617' },
  scroll: { padding: 16, paddingBottom: 40 },

  // Profile card
  profileCard: {
    backgroundColor: '#0B1120', borderRadius: 20,
    borderWidth: 1, borderColor: '#1F2937',
    padding: 24, alignItems: 'center', marginBottom: 16,
  },
  profileName: {
    color: '#F9FAFB', fontSize: 22, fontWeight: '900',
    marginTop: 14, marginBottom: 8, textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row', gap: 8, flexWrap: 'wrap',
    justifyContent: 'center', marginBottom: 12,
  },
  upBadge: {
    backgroundColor: '#1E3A5F', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#2563EB',
  },
  upBadgeText: { color: '#60A5FA', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  grantBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1,
  },
  grantBadgeText: { fontSize: 13, fontWeight: '700' },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    width: '100%', marginBottom: 6,
  },
  infoIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  infoValue: { color: '#9CA3AF', fontSize: 14, flex: 1 },

  roleList: {
    color: '#818CF8', fontSize: 12, fontWeight: '600',
    textAlign: 'center', marginTop: 8, marginBottom: 16,
    lineHeight: 18,
  },

  editBtn: {
    backgroundColor: '#1E3A5F', borderRadius: 10,
    borderWidth: 1, borderColor: '#2563EB',
    paddingHorizontal: 20, paddingVertical: 10, marginTop: 4,
  },
  editBtnText: { color: '#60A5FA', fontWeight: '700', fontSize: 14 },

  // Section
  section: {
    backgroundColor: '#0B1120', borderRadius: 16,
    borderWidth: 1, borderColor: '#1F2937',
    padding: 16, marginBottom: 16,
  },
  sectionTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '800', marginBottom: 6 },
  sectionDesc:  { color: '#6B7280', fontSize: 12, lineHeight: 18, marginBottom: 16 },

  warningRow: {
    padding: 12, backgroundColor: '#7C2D1220',
    borderRadius: 8, borderWidth: 1, borderColor: '#F97316',
    marginBottom: 12,
  },
  warningText: { color: '#F97316', fontSize: 13 },

  errorRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 12,
    backgroundColor: '#7C2D1220', borderRadius: 8,
    borderWidth: 1, borderColor: '#F97316', marginBottom: 12,
  },
  errorText:  { color: '#F97316', fontSize: 13, flex: 1 },
  retryText:  { color: '#F97316', fontSize: 13, fontWeight: '700', marginLeft: 10 },

  // Grant cycle card
  grantCycleCard: {
    backgroundColor: '#1F2937', borderRadius: 12,
    borderWidth: 1, borderColor: '#374151',
    padding: 14, marginBottom: 16,
  },
  grantCycleInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grantCycleIcon:  { fontSize: 28 },
  grantCycleName:  { color: '#E5E7EB', fontSize: 15, fontWeight: '800', marginBottom: 2 },
  grantCycleHint:  { color: '#6B7280', fontSize: 11 },
  grantCycleArrow: { fontSize: 20, color: '#4B5563', fontWeight: '700' },

  // Legend
  legendRow: { gap: 10 },
  legendItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  legendIcon:  { fontSize: 18, marginTop: 2 },
  legendLabel: { color: '#E5E7EB', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  legendDesc:  { color: '#6B7280', fontSize: 11, lineHeight: 16 },

  // Remove
  removeBtn: {
    borderWidth: 1, borderColor: '#7F1D1D',
    borderRadius: 12, paddingVertical: 14,
    alignItems: 'center',
  },
  removeBtnText: { color: '#EF4444', fontWeight: '800', fontSize: 15 },

  // Avatar
  avatar: {
    backgroundColor: '#312E81', alignItems: 'center',
    justifyContent: 'center', overflow: 'hidden',
  },
  avatarText:      { color: '#A5B4FC', fontWeight: '900' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#1E3A5F', borderRadius: 8,
    width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadgeText: { fontSize: 11 },

  // Edit modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: '#1F2937',
    padding: 20, maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '900' },
  modalClose: { color: '#6B7280', fontWeight: '700', fontSize: 14 },

  photoRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  photoHint:      { color: '#6B7280', fontSize: 12 },
  removePhotoLink:{ color: '#EF4444', fontSize: 12, marginTop: 4, fontWeight: '600' },

  fieldLabel: {
    color: '#6B7280', fontSize: 12, fontWeight: '700',
    marginBottom: 6, marginTop: 12,
  },
  input: {
    backgroundColor: '#020617', borderRadius: 10,
    borderWidth: 1, borderColor: '#1F2937',
    paddingHorizontal: 12, paddingVertical: 10,
    color: '#E5E7EB', fontSize: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },

  saveBtn: {
    backgroundColor: '#16A34A', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
