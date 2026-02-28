/**
 * Assignments Screen - Phase 2
 * View and respond to service assignments
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAssignments, saveAssignments, updateAssignment, getUserProfile } from '../services/storage';
import { ROLE_LABELS } from '../models_v2/models';

const SYNC_URL = 'http://10.0.0.34:8099';

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
    setAssignments(data);
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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      let res;
      try {
        res = await fetch(`${SYNC_URL}/sync/assignments?email=${encodeURIComponent(email)}`, {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const remote = await res.json();

      if (remote.length > 0) {
        // Merge remote with local — preserve local status changes (accepted/declined)
        const local = await getAssignments();
        const localMap = Object.fromEntries(local.map(a => [a.id, a]));
        const merged = remote.map(r => localMap[r.id]
          ? { ...r, status: localMap[r.id].status, readiness: localMap[r.id].readiness }
          : r
        );
        await saveAssignments(merged);
        setAssignments(merged);
      }
      setLastSync(new Date());
    } catch (e) {
      setSyncError(e?.message || 'Network request failed');
    } finally {
      setSyncing(false);
    }
  }, []);

  const pushResponse = (assignmentId, status) => {
    // Fire-and-forget: push accept/decline to server so admin sees it immediately
    getUserProfile().then(prof => {
      if (!prof?.email) return;
      fetch(`${SYNC_URL}/sync/assignment/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, email: prof.email.trim().toLowerCase(), status }),
      }).catch(() => {});
    }).catch(() => {});
  };

  const handleAccept = async (assignmentId) => {
    try {
      await updateAssignment(assignmentId, { status: 'accepted' });
      pushResponse(assignmentId, 'accepted');
      Alert.alert('Success', 'Assignment accepted!');
      loadAssignments();
    } catch (error) {
      Alert.alert('Error', 'Failed to accept assignment');
    }
  };

  const handleDecline = async (assignmentId) => {
    try {
      await updateAssignment(assignmentId, { status: 'declined' });
      pushResponse(assignmentId, 'declined');
      loadAssignments();
    } catch (error) {
      Alert.alert('Error', 'Failed to update assignment');
    }
  };

  const renderAssignment = (assignment) => {
    const statusColors = {
      pending: '#F59E0B',
      accepted: '#10B981',
      declined: '#EF4444',
    };

    const statusLabels = {
      pending: 'Pending Response',
      accepted: 'Accepted ✓',
      declined: 'Declined',
    };

    return (
      <View key={assignment.id} style={styles.assignmentCard}>
        <View style={styles.assignmentHeader}>
          <Text style={styles.serviceName}>{assignment.service_name}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColors[assignment.status] + '20' },
            ]}
          >
            <Text
              style={[styles.statusText, { color: statusColors[assignment.status] }]}
            >
              {statusLabels[assignment.status]}
            </Text>
          </View>
        </View>

        <Text style={styles.assignmentDate}>
          📅 {new Date(assignment.service_date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>

        <Text style={styles.assignmentRole}>
          Role: {ROLE_LABELS[assignment.role] || assignment.role}
        </Text>

        {assignment.notes && (
          <Text style={styles.assignmentNotes}>
            💬 {assignment.notes}
          </Text>
        )}

        {/* Action buttons — shown for pending, or always as change-response */}
        {assignment.status === 'pending' && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => handleAccept(assignment.id)}
            >
              <Text style={styles.actionButtonText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.declineButton]}
              onPress={() => handleDecline(assignment.id)}
            >
              <Text style={styles.actionButtonText}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}

        {assignment.status === 'accepted' && (
          <>
            <View style={styles.readinessSection}>
              <Text style={styles.readinessTitle}>Readiness Checklist:</Text>
              <Text style={styles.readinessItem}>
                {assignment.readiness?.stems_downloaded ? '✓' : '○'} Stems Downloaded
              </Text>
              <Text style={styles.readinessItem}>
                {assignment.readiness?.parts_reviewed ? '✓' : '○'} Parts Reviewed
              </Text>
              <Text style={styles.readinessItem}>
                {assignment.readiness?.ready_for_rehearsal ? '✓' : '○'} Ready for Rehearsal
              </Text>
            </View>
            <TouchableOpacity
              style={styles.setlistButton}
              onPress={() => navigation.navigate('Setlist', { serviceId: assignment.service_id })}
            >
              <Text style={styles.setlistButtonText}>📋  View Setlist →</Text>
            </TouchableOpacity>
            {/* Allow undoing accept */}
            <TouchableOpacity
              style={styles.changeResponseBtn}
              onPress={() => handleDecline(assignment.id)}
            >
              <Text style={styles.changeResponseText}>↺ Change to Declined</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Declined: show undo / re-accept option */}
        {assignment.status === 'declined' && (
          <View style={styles.undoSection}>
            <Text style={styles.undoHint}>Changed your mind?</Text>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton, { flex: 1 }]}
              onPress={() => handleAccept(assignment.id)}
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
      ) : (
        <>
          {pendingAssignments.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Pending ({pendingAssignments.length})
              </Text>
              {pendingAssignments.map(renderAssignment)}
            </View>
          )}

          {acceptedAssignments.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Accepted ({acceptedAssignments.length})
              </Text>
              {acceptedAssignments.map(renderAssignment)}
            </View>
          )}

          {declinedAssignments.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Declined ({declinedAssignments.length})
              </Text>
              {declinedAssignments.map(renderAssignment)}
            </View>
          )}
        </>
      )}
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
    flex: 1,
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
