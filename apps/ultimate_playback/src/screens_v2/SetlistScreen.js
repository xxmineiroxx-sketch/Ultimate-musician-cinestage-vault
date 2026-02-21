/**
 * Setlist Screen - Ultimate Playback
 * View role-filtered setlist content for accepted assignments
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { getUserProfile, getAssignments } from '../services/storage';
import { ROLE_LABELS } from '../models_v2/models';

export default function SetlistScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [setlist, setSetlist] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const userProfile = await getUserProfile();
    const userAssignments = await getAssignments();

    setProfile(userProfile);

    // Only show accepted assignments
    const accepted = userAssignments.filter((a) => a.status === 'accepted');
    setAssignments(accepted);

    if (accepted.length > 0) {
      setSelectedAssignment(accepted[0]);
      loadSetlist(accepted[0]);
    }
  };

  const loadSetlist = async (assignment) => {
    // Mock setlist data - in production, this would come from backend
    const mockSetlist = [
      {
        id: 'song1',
        title: 'Great Are You Lord',
        artist: 'All Sons & Daughters',
        key: 'G',
        tempo: 68,
        role_content: {
          keyboard: {
            patches: ['Piano', 'Pad'],
            notes: 'Intro: Piano only. Verse 1: Add pad on beat 3. Chorus: Full sound.',
            dynamics: 'Start soft, build to chorus',
          },
          lead_vocal: {
            lyrics: 'You give life, You are love...',
            cues: 'Enter on verse 1',
            harmonies: 'Upper harmony on chorus',
          },
          foh_engineer: {
            mix_notes: 'Piano prominence on intro. Gradual build.',
            eq_settings: 'Cut lows on pad to avoid muddiness',
          },
        },
      },
      {
        id: 'song2',
        title: 'Goodness of God',
        artist: 'Jenn Johnson',
        key: 'C',
        tempo: 123,
        role_content: {
          keyboard: {
            patches: ['EP', 'Strings'],
            notes: 'EP throughout. Add strings on bridge.',
            dynamics: 'Steady energy, lift on bridge',
          },
          lead_vocal: {
            lyrics: 'I love You Lord...',
            cues: 'Strong entrance',
            harmonies: 'Lower harmony on verses',
          },
          foh_engineer: {
            mix_notes: 'Keep EP bright and present',
            eq_settings: 'Boost presence on vocals 3-5kHz',
          },
        },
      },
    ];

    setSetlist(mockSetlist);
  };

  const getRoleContent = (song) => {
    if (!profile || !profile.roles || profile.roles.length === 0) {
      return null;
    }

    // Get content for the first role (or primary role in assignment)
    const primaryRole = selectedAssignment?.role || profile.roles[0];
    return song.role_content[primaryRole];
  };

  const renderSong = (song) => {
    const content = getRoleContent(song);

    return (
      <View key={song.id} style={styles.songCard}>
        <View style={styles.songHeader}>
          <View style={styles.songInfo}>
            <Text style={styles.songTitle}>{song.title}</Text>
            <Text style={styles.songArtist}>{song.artist}</Text>
          </View>
          <View style={styles.songMeta}>
            <Text style={styles.songKey}>Key: {song.key}</Text>
            <Text style={styles.songTempo}>{song.tempo} BPM</Text>
          </View>
        </View>

        {content && (
          <View style={styles.roleContent}>
            <Text style={styles.roleContentTitle}>
              Your Role: {ROLE_LABELS[selectedAssignment?.role || profile.roles[0]]}
            </Text>

            {content.patches && (
              <View style={styles.contentSection}>
                <Text style={styles.contentLabel}>Patches/Sounds:</Text>
                <Text style={styles.contentText}>{content.patches.join(', ')}</Text>
              </View>
            )}

            {content.notes && (
              <View style={styles.contentSection}>
                <Text style={styles.contentLabel}>Notes:</Text>
                <Text style={styles.contentText}>{content.notes}</Text>
              </View>
            )}

            {content.dynamics && (
              <View style={styles.contentSection}>
                <Text style={styles.contentLabel}>Dynamics:</Text>
                <Text style={styles.contentText}>{content.dynamics}</Text>
              </View>
            )}

            {content.lyrics && (
              <View style={styles.contentSection}>
                <Text style={styles.contentLabel}>Lyrics Preview:</Text>
                <Text style={styles.contentText}>{content.lyrics}</Text>
              </View>
            )}

            {content.cues && (
              <View style={styles.contentSection}>
                <Text style={styles.contentLabel}>Cues:</Text>
                <Text style={styles.contentText}>{content.cues}</Text>
              </View>
            )}

            {content.harmonies && (
              <View style={styles.contentSection}>
                <Text style={styles.contentLabel}>Harmonies:</Text>
                <Text style={styles.contentText}>{content.harmonies}</Text>
              </View>
            )}

            {content.mix_notes && (
              <View style={styles.contentSection}>
                <Text style={styles.contentLabel}>Mix Notes:</Text>
                <Text style={styles.contentText}>{content.mix_notes}</Text>
              </View>
            )}

            {content.eq_settings && (
              <View style={styles.contentSection}>
                <Text style={styles.contentLabel}>EQ Settings:</Text>
                <Text style={styles.contentText}>{content.eq_settings}</Text>
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          style={styles.performButton}
          onPress={() =>
            navigation.navigate('LivePerformance', {
              songId: song.id,
              assignmentId: selectedAssignment?.id,
            })
          }
        >
          <Text style={styles.performButtonText}>Go to Performance Mode</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (!selectedAssignment) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No Accepted Assignments</Text>
          <Text style={styles.emptyText}>
            Accept a service assignment to view the setlist.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => navigation.navigate('Assignments')}
          >
            <Text style={styles.emptyButtonText}>View Assignments</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
    >
      <View style={styles.header}>
        <Text style={styles.headerIcon}>📋</Text>
        <Text style={styles.title}>Setlist</Text>
        <Text style={styles.subtitle}>{selectedAssignment.service_name}</Text>
      </View>

      {assignments.length > 1 && (
        <View style={styles.assignmentSelector}>
          <Text style={styles.selectorLabel}>Select Service:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {assignments.map((assignment) => (
              <TouchableOpacity
                key={assignment.id}
                style={[
                  styles.assignmentPill,
                  selectedAssignment?.id === assignment.id &&
                    styles.assignmentPillActive,
                ]}
                onPress={() => {
                  setSelectedAssignment(assignment);
                  loadSetlist(assignment);
                }}
              >
                <Text
                  style={[
                    styles.assignmentPillText,
                    selectedAssignment?.id === assignment.id &&
                      styles.assignmentPillTextActive,
                  ]}
                >
                  {assignment.service_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.serviceInfo}>
        <Text style={styles.serviceDate}>
          📅 {new Date(selectedAssignment.service_date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
        <Text style={styles.serviceRole}>
          Your Role: {ROLE_LABELS[selectedAssignment.role]}
        </Text>
      </View>

      <View style={styles.setlistSection}>
        <Text style={styles.sectionTitle}>Songs ({setlist.length})</Text>
        {setlist.map((song) => renderSong(song))}
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
  assignmentSelector: {
    marginBottom: 24,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  assignmentPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0B1120',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    marginRight: 8,
  },
  assignmentPillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  assignmentPillText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  assignmentPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  serviceInfo: {
    padding: 16,
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4F46E5',
    marginBottom: 24,
  },
  serviceDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  serviceRole: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  setlistSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 16,
  },
  songCard: {
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
  },
  songHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  songArtist: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  songMeta: {
    alignItems: 'flex-end',
  },
  songKey: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 4,
  },
  songTempo: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  roleContent: {
    marginBottom: 16,
  },
  roleContentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 12,
  },
  contentSection: {
    marginBottom: 12,
  },
  contentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contentText: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  performButton: {
    backgroundColor: '#4F46E5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  performButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
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
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
