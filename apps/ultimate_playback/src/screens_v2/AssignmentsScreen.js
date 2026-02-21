/**
 * Assignments Screen - Phase 2
 * View and respond to service assignments
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { getAssignments, updateAssignment } from '../services/storage';
import { ROLE_LABELS } from '../models_v2/models';

export default function AssignmentsScreen({ navigation }) {
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    const data = await getAssignments();
    setAssignments(data);
  };

  const handleAccept = async (assignmentId) => {
    try {
      await updateAssignment(assignmentId, { status: 'accepted' });
      Alert.alert('Success', 'Assignment accepted!');
      loadAssignments();
    } catch (error) {
      Alert.alert('Error', 'Failed to accept assignment');
    }
  };

  const handleDecline = async (assignmentId) => {
    Alert.alert(
      'Decline Assignment',
      'Are you sure you want to decline this assignment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateAssignment(assignmentId, { status: 'declined' });
              Alert.alert('Success', 'Assignment declined');
              loadAssignments();
            } catch (error) {
              Alert.alert('Error', 'Failed to decline assignment');
            }
          },
        },
      ]
    );
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
          <View style={styles.readinessSection}>
            <Text style={styles.readinessTitle}>Readiness Checklist:</Text>
            <Text style={styles.readinessItem}>
              {assignment.readiness.stems_downloaded ? '✓' : '○'} Stems Downloaded
            </Text>
            <Text style={styles.readinessItem}>
              {assignment.readiness.parts_reviewed ? '✓' : '○'} Parts Reviewed
            </Text>
            <Text style={styles.readinessItem}>
              {assignment.readiness.ready_for_rehearsal ? '✓' : '○'} Ready for Rehearsal
            </Text>
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
    >
      <View style={styles.header}>
        <Text style={styles.headerIcon}>📬</Text>
        <Text style={styles.title}>Assignments</Text>
        <Text style={styles.subtitle}>Service notifications and responses</Text>
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
    paddingTop: 20,
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
});
