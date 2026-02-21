/**
 * Home Screen - Ultimate Playback
 * Dashboard for team members
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { getUserProfile, getAssignments } from '../services/storage';
import { ROLE_LABELS } from '../models_v2/models';

export default function HomeScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [upcomingServices, setUpcomingServices] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    const userProfile = await getUserProfile();
    const userAssignments = await getAssignments();

    setProfile(userProfile);
    setAssignments(userAssignments);

    // Filter upcoming accepted services
    const upcoming = userAssignments
      .filter((a) => a.status === 'accepted')
      .filter((a) => new Date(a.service_date) >= new Date())
      .sort((a, b) => new Date(a.service_date) - new Date(b.service_date));

    setUpcomingServices(upcoming);
  };

  const pendingCount = assignments.filter((a) => a.status === 'pending').length;
  const acceptedCount = assignments.filter((a) => a.status === 'accepted').length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>🎵</Text>
        <Text style={styles.title}>Ultimate Playback</Text>
        <Text style={styles.subtitle}>powered by CineStage</Text>
      </View>

      {profile ? (
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeText}>
            Welcome back, {profile.name} {profile.lastName}!
          </Text>
          <Text style={styles.roleText}>
            {profile.roleAssignments
              ? `Roles: ${profile.roleAssignments}`
              : 'No roles set yet'}
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.setupCard}
          onPress={() => navigation.navigate('ProfileTab')}
        >
          <Text style={styles.setupIcon}>👋</Text>
          <Text style={styles.setupTitle}>Get Started</Text>
          <Text style={styles.setupText}>
            Set up your profile to receive assignments from your team
          </Text>
        </TouchableOpacity>
      )}

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{acceptedCount}</Text>
          <Text style={styles.statLabel}>Accepted</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{profile?.roles?.length || 0}</Text>
          <Text style={styles.statLabel}>Roles</Text>
        </View>
      </View>

      {/* Pending Assignments */}
      {pendingCount > 0 && (
        <TouchableOpacity
          style={styles.alertCard}
          onPress={() => navigation.navigate('Assignments')}
        >
          <View style={styles.alertHeader}>
            <Text style={styles.alertIcon}>📬</Text>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>
                {pendingCount} Pending Assignment{pendingCount > 1 ? 's' : ''}
              </Text>
              <Text style={styles.alertText}>
                You have assignments waiting for your response
              </Text>
            </View>
          </View>
          <Text style={styles.alertAction}>Review →</Text>
        </TouchableOpacity>
      )}

      {/* Upcoming Services */}
      {upcomingServices.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Services</Text>
          {upcomingServices.slice(0, 3).map((service) => (
            <TouchableOpacity
              key={service.id}
              style={styles.serviceCard}
              onPress={() => navigation.navigate('Setlist')}
            >
              <View style={styles.serviceHeader}>
                <Text style={styles.serviceName}>{service.service_name}</Text>
                <View style={styles.serviceBadge}>
                  <Text style={styles.serviceBadgeText}>
                    {ROLE_LABELS[service.role] || service.role}
                  </Text>
                </View>
              </View>
              <Text style={styles.serviceDate}>
                📅 {new Date(service.service_date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
              {service.readiness && (
                <View style={styles.readinessRow}>
                  <View
                    style={[
                      styles.readinessDot,
                      service.readiness.ready_for_rehearsal && styles.readinessDotReady,
                    ]}
                  />
                  <Text style={styles.readinessText}>
                    {service.readiness.ready_for_rehearsal
                      ? 'Ready for rehearsal'
                      : 'Preparation needed'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Setlist')}
        >
          <Text style={styles.actionIcon}>📋</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>View Setlist</Text>
            <Text style={styles.actionDesc}>See role-specific content</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Assignments')}
        >
          <Text style={styles.actionIcon}>📬</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Assignments</Text>
            <Text style={styles.actionDesc}>Manage service assignments</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('BlockoutCalendar')}
        >
          <Text style={styles.actionIcon}>📅</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Blockout Calendar</Text>
            <Text style={styles.actionDesc}>Mark unavailable dates</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Messages')}
        >
          <Text style={styles.actionIcon}>💬</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Messages</Text>
            <Text style={styles.actionDesc}>Team communication</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('ProfileSetup')}
        >
          <Text style={styles.actionIcon}>👤</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Profile & Roles</Text>
            <Text style={styles.actionDesc}>Update your information</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Ultimate Playback • Team Member App
        </Text>
      </View>
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
    marginBottom: 32,
    paddingTop: 20,
  },
  logo: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  welcomeCard: {
    padding: 20,
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4F46E5',
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  roleText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  setupCard: {
    padding: 24,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 24,
  },
  setupIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  setupTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  setupText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4F46E5',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#7C3AED20',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7C3AED',
    marginBottom: 24,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  alertIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  alertText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  alertAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7C3AED',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 16,
  },
  serviceCard: {
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    flex: 1,
  },
  serviceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#4F46E520',
    borderRadius: 4,
  },
  serviceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  serviceDate: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  readinessDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
    marginRight: 8,
  },
  readinessDotReady: {
    backgroundColor: '#10B981',
  },
  readinessText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12,
  },
  actionIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  actionDesc: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
