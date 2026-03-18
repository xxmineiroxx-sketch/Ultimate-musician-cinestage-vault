/**
 * Assignments Screen - Phase 2
 * View and respond to service assignments
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAssignments, saveAssignments, updateAssignment, getUserProfile } from '../services/storage';
import { ROLE_LABELS } from '../models_v2/models';

import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

const normalizeRoleKey = (r) => {
  const s = String(r || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  const map = {
    sound: 'sound_tech', sound_tech: 'sound_tech', soundtech: 'sound_tech',
    'audio tech': 'sound_tech', audio_tech: 'sound_tech', foh: 'sound_tech',
    monitor: 'sound_tech', iem: 'sound_tech', monitors: 'sound_tech',
    media: 'media_tech', media_tech: 'media_tech', propresenter: 'media_tech',
    slides: 'media_tech', lighting: 'media_tech', lights: 'media_tech',
    'media technician': 'media_tech',
  };
  return map[s] || s;
};
const TECH_ROLES = new Set(['sound_tech', 'media_tech']);

// Returns true if a service date is strictly before today (end-of-day grace:
// today's service stays visible all day, disappears at midnight).
function isPastService(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0); // start of today (midnight)
  const svc = new Date(String(dateStr).includes('T') ? dateStr : dateStr + 'T00:00:00');
  svc.setHours(0, 0, 0, 0);
  return svc < today;
}

// Deduplicate by service_id + role (drop id — same service+role is always a dup)
function dedupAssignments(list) {
  const seen = new Set();
  return list.filter(a => {
    const key = `${a.service_id || ''}_${a.role || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Group assignments by service_id.
// Secondary pass: merge groups that share the same name+date (logical duplicates
// that got different IDs, e.g. service was re-created).
function groupByService(list) {
  const map = new Map();
  for (const a of list) {
    const key = a.service_id || a.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  const groups = Array.from(map.values());

  // Merge groups with identical service_name + service_date into one card
  const merged = [];
  const usedIdx = new Set();
  for (let i = 0; i < groups.length; i++) {
    if (usedIdx.has(i)) continue;
    const base = groups[i];
    const nameDate = `${base[0].service_name || ''}_${base[0].service_date || ''}`;
    for (let j = i + 1; j < groups.length; j++) {
      if (usedIdx.has(j)) continue;
      const other = groups[j];
      const nd = `${other[0].service_name || ''}_${other[0].service_date || ''}`;
      if (nameDate && nd && nameDate === nd) {
        base.push(...other);
        usedIdx.add(j);
      }
    }
    usedIdx.add(i);
    merged.push(base);
  }
  return merged;
}

// ── Local response persistence ────────────────────────────────────────────────
// Stores { [service_id]: { status, respondedAt } } in AsyncStorage.
// This key is NEVER overwritten by sync — once a user responds, it sticks.
const LOCAL_RESPONSES_KEY = 'playback_local_responses';

async function saveLocalResponse(serviceId, status) {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_RESPONSES_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    existing[serviceId] = { status, respondedAt: new Date().toISOString() };
    await AsyncStorage.setItem(LOCAL_RESPONSES_KEY, JSON.stringify(existing));
  } catch {}
}

async function getLocalResponses() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_RESPONSES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Extract org name + branch city from an assignment object
function getOrgLabel(a) {
  const name = a?.org_name || a?.organization_name || a?.church_name || '';
  const city = a?.branch_city || '';
  return city ? `${name} — ${city}` : name;
}

// Overall status for a group: pending if any pending, else accepted if any accepted, else declined
function groupStatus(group) {
  if (group.some(a => a.status === 'pending')) return 'pending';
  if (group.some(a => a.status === 'accepted')) return 'accepted';
  return 'declined';
}

export default function AssignmentsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [assignments, setAssignments] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncEmail, setSyncEmail] = useState(null); // email being used for sync
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    loadAssignments();
    syncFromServer();
  }, []);

  const loadAssignments = async () => {
    const data = await getAssignments();
    // Filter out past-day services (end-of-day grace: today's service stays all day)
    const active = dedupAssignments(data).filter(a => !isPastService(a.service_date));
    setAssignments(active);
  };

  const syncFromServer = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const profile = await getUserProfile();
      const email = profile?.email?.trim();
      setSyncEmail(email || null);

      if (!email) {
        setSyncError('no_email');
        setSyncing(false);
        return;
      }

      const fullName = [profile?.name, profile?.lastName].filter(Boolean).join(' ').trim();
      const assignUrl = fullName
        ? `${SYNC_URL}/sync/assignments?email=${encodeURIComponent(email)}&name=${encodeURIComponent(fullName)}`
        : `${SYNC_URL}/sync/assignments?email=${encodeURIComponent(email)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      let res;
      try {
        res = await fetch(assignUrl, {
          headers: syncHeaders(),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const remote = await res.json();

      if (remote.length > 0) {
        // Merge remote with local — preserve local status changes (accepted/declined).
        // Match by id first; fall back to service_id+role compound key for stability.
        const local = await getAssignments();
        const localById = Object.fromEntries(local.map(a => [a.id, a]));
        const localByCompound = Object.fromEntries(
          local.map(a => [`${a.service_id}_${a.role}`, a])
        );
        const localResponses = await getLocalResponses();
        const merged = remote.map(r => {
          // 1. Try persisted local response (always wins — never reset by sync)
          const override = localResponses[r.service_id];
          if (override) return { ...r, status: override.status };
          // 2. Fall back to ID match or compound key match
          const match = localById[r.id] || localByCompound[`${r.service_id}_${r.role}`];
          return match
            ? { ...r, status: match.status, readiness: match.readiness }
            : r;
        });
        // Prune past-service assignments from local storage (end-of-day grace)
        const active = dedupAssignments(merged).filter(a => !isPastService(a.service_date));
        await saveAssignments(active);
        setAssignments(active);
      }
      setLastSync(new Date());
    } catch (e) {
      setSyncError(e?.message || 'Network request failed');
    } finally {
      setSyncing(false);
    }
  }, []);

  const pushResponse = (assignment, status, declineReason = '') => {
    getUserProfile().then(prof => {
      if (!prof?.email) return;
      const fullName = [prof.name, prof.lastName].filter(Boolean).join(' ').trim() || prof.email;
      fetch(`${SYNC_URL}/sync/assignment/respond`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({
          serviceId:     assignment.service_id,
          personId:      prof.email.trim().toLowerCase(),
          name:          fullName,
          response:      status,
          status,
          role:          assignment.role,
          serviceName:   assignment.service_name || assignment.service_id,
          declineReason: declineReason || undefined,
        }),
      }).catch(() => {});
    }).catch(() => {});
  };

  const applyStatusToGroup = (group, status) => {
    const ids = new Set(group.map(a => a.id));
    setAssignments(prev => prev.map(a => ids.has(a.id) ? { ...a, status } : a));
  };

  const handleAcceptGroup = async (group) => {
    applyStatusToGroup(group, 'accepted');
    try {
      await Promise.all(group.map(a => updateAssignment(a.id, { status: 'accepted' })));
      // Persist so sync can never reset this decision
      const serviceIds = [...new Set(group.map(a => a.service_id).filter(Boolean))];
      await Promise.all(serviceIds.map(sid => saveLocalResponse(sid, 'accepted')));
      group.forEach(a => pushResponse(a, 'accepted'));
    } catch {
      applyStatusToGroup(group, 'pending');
      Alert.alert('Error', 'Failed to accept assignment');
    }
  };

  const handleDeclineGroup = (group) => {
    // Show decline modal with optional reason
    Alert.alert(
      'Decline Assignment',
      'Reason for declining (optional):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => promptDeclineReason(group, ''),
        },
        {
          text: 'Add Reason',
          onPress: () => promptDeclineReason(group),
        },
      ]
    );
  };

  const promptDeclineReason = (group, prefilledReason) => {
    if (prefilledReason !== undefined && prefilledReason !== null) {
      // Called with empty string = skip reason prompt
      doDecline(group, prefilledReason);
      return;
    }
    Alert.prompt(
      'Reason for Declining',
      'Optional — will be sent to the admin.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: (reason) => doDecline(group, reason || ''),
        },
      ],
      'plain-text',
      '',
    );
  };

  const doDecline = async (group, declineReason = '') => {
    applyStatusToGroup(group, 'declined');
    try {
      await Promise.all(group.map(a => updateAssignment(a.id, { status: 'declined' })));
      // Persist so sync can never reset this decision
      const serviceIds = [...new Set(group.map(a => a.service_id).filter(Boolean))];
      await Promise.all(serviceIds.map(sid => saveLocalResponse(sid, 'declined')));
      group.forEach(a => pushResponse(a, 'declined', declineReason));
    } catch {
      applyStatusToGroup(group, 'pending');
      Alert.alert('Error', 'Failed to decline assignment');
    }
  };

  const respondToInvite = async (inviteId, status) => {
    try {
      const profile = await getUserProfile();
      const email = profile?.email?.trim().toLowerCase() || '';
      if (!email) { Alert.alert('Error', 'No email in profile'); return; }
      await fetch(`${SYNC_URL}/sync/xinvite/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, inviteId, status }),
      });
      syncFromServer();
    } catch (e) {
      Alert.alert('Error', 'Could not update invitation: ' + e.message);
    }
  };

  const renderGuestInviteCard = (invite) => (
    <View key={invite.id} style={styles.guestInviteCard}>
      <View style={styles.guestInviteBadge}>
        <Text style={styles.guestInviteBadgeText}>🌐 Guest Invite</Text>
      </View>
      <Text style={styles.guestServiceName}>{invite.service_name}</Text>
      {invite.service_date ? (
        <Text style={styles.guestDate}>
          📅 {new Date(String(invite.service_date).includes('T') ? invite.service_date : invite.service_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>
      ) : null}
      <View style={styles.orgBadge}>
        <Text style={styles.orgBadgeText}>🏛 {getOrgLabel(invite)}</Text>
      </View>
      {invite.role ? (
        <View style={[styles.roleChipsRow, { marginTop: 8 }]}>
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>
              {ROLE_LABELS[invite.role] || ROLE_LABELS[String(invite.role || '').trim().toLowerCase()] || invite.role}
            </Text>
          </View>
        </View>
      ) : null}
      {invite.notes ? <Text style={styles.assignmentNotes}>💬 {invite.notes}</Text> : null}
      {invite.invited_by ? <Text style={styles.guestInvitedBy}>Invited by {invite.invited_by}</Text> : null}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={[styles.actionButton, styles.acceptButton]} onPress={() => respondToInvite(invite.invite_id || invite.id, 'accepted')}>
          <Text style={styles.actionButtonText}>✓ Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.declineButton]} onPress={() => respondToInvite(invite.invite_id || invite.id, 'declined')}>
          <Text style={styles.actionButtonText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderServiceGroup = (group) => {
    const first = group[0];
    // Guest invites rendered separately
    if (first.type === 'guest_invite') return renderGuestInviteCard(first);
    const status = groupStatus(group);
    const statusColors = { pending: '#F59E0B', accepted: '#10B981', declined: '#EF4444' };
    const statusLabels = { pending: 'Pending Response', accepted: 'Accepted ✓', declined: 'Declined' };
    const roles = group.map(a => ROLE_LABELS[a.role] || a.role);

    return (
      <View key={first.service_id || first.id} style={styles.assignmentCard}>
        {/* Header */}
        <View style={styles.assignmentHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.serviceName}>{first.service_name}</Text>
            {getOrgLabel(first) ? (
              <View style={styles.orgBadge}>
                <Text style={styles.orgBadgeText}>🏛 {getOrgLabel(first)}</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColors[status] + '20' }]}>
            <Text style={[styles.statusText, { color: statusColors[status] }]}>
              {statusLabels[status]}
            </Text>
          </View>
        </View>

        {/* Date */}
        <Text style={styles.assignmentDate}>
          📅 {new Date(String(first.service_date).includes('T') ? first.service_date : first.service_date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </Text>

        {/* Role chips — all roles in one row */}
        <View style={styles.roleChipsRow}>
          {roles.map((r, i) => (
            <View key={i} style={styles.roleChip}>
              <Text style={styles.roleChipText}>{r}</Text>
            </View>
          ))}
        </View>

        {first.notes && (
          <Text style={styles.assignmentNotes}>💬 {first.notes}</Text>
        )}

        {/* Pending: one Accept/Decline for the whole service */}
        {status === 'pending' && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => handleAcceptGroup(group)}
            >
              <Text style={styles.actionButtonText}>✓ Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.declineButton]}
              onPress={() => handleDeclineGroup(group)}
            >
              <Text style={styles.actionButtonText}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Accepted */}
        {status === 'accepted' && (
          <>
            <TouchableOpacity
              style={styles.setlistButton}
              onPress={() => navigation.navigate('Setlist', { serviceId: first.service_id, assignmentGroup: group })}
            >
              <Text style={styles.setlistButtonText}>📋  View Setlist →</Text>
            </TouchableOpacity>
            {!TECH_ROLES.has(normalizeRoleKey(first.role)) && (
              <TouchableOpacity
                style={styles.practiceButton}
                onPress={() => navigation.navigate('PersonalPractice', { serviceId: first.service_id, userRole: first.role })}
              >
                <Text style={styles.practiceButtonText}>🎧  My Practice Mix →</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.changeResponseBtn}
              onPress={() => handleDeclineGroup(group)}
            >
              <Text style={styles.changeResponseText}>↺ Change to Declined</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Declined */}
        {status === 'declined' && (
          <View style={styles.undoSection}>
            <Text style={styles.undoHint}>Changed your mind?</Text>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton, { flex: 1 }]}
              onPress={() => handleAcceptGroup(group)}
            >
              <Text style={styles.actionButtonText}>✓ Re-accept this Assignment</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const pendingAssignments = assignments.filter((a) => a.status === 'pending');
  const acceptedAssignments = assignments.filter((a) => a.status === 'accepted');
  const declinedAssignments = assignments.filter((a) => a.status === 'declined');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={syncFromServer} tintColor="#10B981" />}
    >
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerIcon}>📬</Text>
        <Text style={styles.title}>Assignments</Text>
        <Text style={styles.subtitle}>Service notifications and responses</Text>
        <TouchableOpacity style={styles.syncBtn} onPress={syncFromServer} disabled={syncing}>
          {syncing
            ? <ActivityIndicator size="small" color="#10B981" />
            : <Text style={styles.syncBtnText}>⟳ Sync</Text>
          }
        </TouchableOpacity>

        {/* Show which email is being used */}
        {syncEmail ? (
          <Text style={styles.syncEmail}>Syncing as: {syncEmail}</Text>
        ) : null}

        {/* Errors */}
        {syncError === 'no_email' && (
          <TouchableOpacity
            style={styles.syncWarning}
            onPress={() => navigation.navigate('ProfileSetup')}
          >
            <Text style={styles.syncWarningText}>
              ⚠️ No email set in your profile — tap here to set it so assignments can sync.
            </Text>
          </TouchableOpacity>
        )}
        {syncError && syncError !== 'no_email' && (
          <View style={styles.syncWarning}>
            <Text style={styles.syncWarningText}>⚠️ Sync error: {syncError}</Text>
          </View>
        )}

        {lastSync && !syncError && (
          <Text style={styles.syncTime}>Last sync: {lastSync.toLocaleTimeString()}</Text>
        )}
      </View>

      {assignments.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>No Assignments Yet</Text>
          <Text style={styles.emptyText}>
            You'll receive notifications here when you're assigned to a service.
          </Text>
        </View>
      ) : (() => {
        const allGroups = groupByService(assignments);
        const pending  = allGroups.filter(g => groupStatus(g) === 'pending');
        const accepted = allGroups.filter(g => groupStatus(g) === 'accepted');
        const declined = allGroups.filter(g => groupStatus(g) === 'declined');
        return (
          <>
            {pending.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Pending ({pending.length})</Text>
                {pending.map(renderServiceGroup)}
              </View>
            )}
            {accepted.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Accepted ({accepted.length})</Text>
                {accepted.map(renderServiceGroup)}
              </View>
            )}
            {declined.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Declined ({declined.length})</Text>
                {declined.map(renderServiceGroup)}
              </View>
            )}
          </>
        );
      })()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 12,
  },
  assignmentCard: {
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12,
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  serviceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  orgBadge: {
    backgroundColor: '#1E1B4B',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  orgBadgeText: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  assignmentDate: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  assignmentRole: {
    fontSize: 14,
    color: '#E5E7EB',
    fontWeight: '500',
    marginBottom: 8,
  },
  roleChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  roleChip: {
    backgroundColor: '#1E1B4B',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  roleChipText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '700',
  },
  assignmentNotes: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#10B981',
  },
  declineButton: {
    backgroundColor: '#EF4444',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  guestInviteCard: { padding: 16, backgroundColor: '#0F172A', borderRadius: 12, borderWidth: 1, borderColor: '#4F46E5', marginBottom: 12 },
  guestInviteBadge: { backgroundColor: '#4F46E520', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 },
  guestInviteBadgeText: { color: '#818CF8', fontSize: 12, fontWeight: '600' },
  guestServiceName: { fontSize: 18, fontWeight: '600', color: '#F9FAFB', marginBottom: 4 },
  guestDate: { fontSize: 14, color: '#9CA3AF', marginBottom: 6 },
  guestInvitedBy: { fontSize: 13, color: '#6B7280', marginBottom: 12, fontStyle: 'italic' },

  readinessSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  readinessTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  readinessItem: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  syncBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#10B981',
    backgroundColor: '#0F3D2E',
    minWidth: 80,
    alignItems: 'center',
  },
  syncBtnText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 14,
  },
  syncEmail: {
    marginTop: 6,
    fontSize: 11,
    color: '#6B7280',
  },
  syncTime: {
    marginTop: 4,
    fontSize: 11,
    color: '#10B981',
  },
  syncWarning: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#7C2D1220',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F97316',
  },
  syncWarningText: {
    fontSize: 12,
    color: '#F97316',
    textAlign: 'center',
    lineHeight: 18,
  },
  setlistButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1E1B4B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4F46E5',
    alignItems: 'center',
  },
  setlistButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#818CF8',
  },
  practiceButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10B981',
    alignItems: 'center',
  },
  practiceButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#34D399',
  },
  changeResponseBtn: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  changeResponseText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  undoSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    gap: 8,
  },
  undoHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
});
