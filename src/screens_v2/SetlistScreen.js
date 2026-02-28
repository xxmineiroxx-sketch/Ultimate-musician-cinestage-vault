/**
 * Setlist Screen - Ultimate Playback
 * Live setlist from sync server — role-aware, with lyrics for vocalists
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile, getAssignments } from '../services/storage';
import { ROLE_LABELS } from '../models_v2/models';

const SYNC_URL = 'http://10.0.0.34:8099';

// Roles that get lyrics access
const VOCAL_ROLES = new Set([
  'worship_leader',
  'lead_vocal',
  'bgv_1',
  'bgv_2',
  'bgv_3',
  'music_director',
]);

// Maps Playback role IDs → Musician instrument names (keys in instrumentNotes)
const ROLE_TO_INSTRUMENT = {
  keyboard: 'Keys',
  piano: 'Keys',
  synth: 'Synth/Pad',
  electric_guitar: 'Electric Guitar',
  rhythm_guitar: 'Electric Guitar',
  acoustic_guitar: 'Acoustic Guitar',
  bass: 'Bass',
  drums: 'Drums',
  percussion: 'Drums',
  strings: 'Keys',
  brass: 'Keys',
  worship_leader: 'Acoustic Guitar',
  music_director: 'Keys',
};

// Display order for the instrument picker
const CHART_INSTRUMENTS = ['Keys', 'Acoustic Guitar', 'Electric Guitar', 'Bass', 'Synth/Pad', 'Drums'];

// Emoji per instrument for the picker
const INSTRUMENT_ICON = {
  'Keys': '🎹',
  'Acoustic Guitar': '🎸',
  'Electric Guitar': '🎸',
  'Bass': '🎸',
  'Synth/Pad': '🎛',
  'Drums': '🥁',
};

export default function SetlistScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [setlist, setSetlist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedInstrument, setSelectedInstrument] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  // Reload when screen comes into focus (e.g. after accepting an assignment)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [navigation]);

  const loadData = async () => {
    const userProfile = await getUserProfile();
    const userAssignments = await getAssignments();

    setProfile(userProfile);

    const accepted = userAssignments.filter((a) => a.status === 'accepted');
    setAssignments(accepted);

    // Check if navigated with a specific serviceId (from Assignments screen)
    const incomingServiceId = route?.params?.serviceId;
    const target = incomingServiceId
      ? accepted.find((a) => a.service_id === incomingServiceId) || accepted[0]
      : accepted[0];

    if (target) {
      setSelectedAssignment(target);
      fetchSetlist(target.service_id);
      // Auto-select instrument based on user's role
      const mapped = ROLE_TO_INSTRUMENT[target.role] || null;
      setSelectedInstrument(mapped);
    }
  };

  const fetchSetlist = useCallback(async (serviceId) => {
    if (!serviceId) return;
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 6000);
      let res;
      try {
        res = await fetch(
          `${SYNC_URL}/sync/setlist?serviceId=${encodeURIComponent(serviceId)}`,
          { signal: controller.signal }
        );
      } finally {
        clearTimeout(tid);
      }
      if (!res.ok) throw new Error('Server error');
      const songs = await res.json();
      setSetlist(songs);
    } catch (e) {
      setError('Could not load setlist.\nMake sure the sync server is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectAssignment = (assignment) => {
    setSelectedAssignment(assignment);
    fetchSetlist(assignment.service_id);
    const mapped = ROLE_TO_INSTRUMENT[assignment.role] || null;
    setSelectedInstrument(mapped);
  };

  const renderSong = (song) => {
    const userRole = selectedAssignment?.role;
    const isVocal = VOCAL_ROLES.has(userRole);
    // Resolve the chart to show: instrument-specific first, then master
    const instrChart = selectedInstrument ? (song.instrumentNotes?.[selectedInstrument] || '') : '';
    const masterChart = song.chordChart || '';
    const chartToShow = instrChart || masterChart;

    return (
      <TouchableOpacity
        key={song.id}
        style={styles.songCard}
        onPress={() =>
          navigation.navigate('SetlistRunner', {
            songs: setlist,
            startIndex: song.order - 1,
            userRole: selectedAssignment.role,
            userRoles: selectedAssignment.roles || [selectedAssignment.role],
          })
        }
        activeOpacity={0.8}
      >
        {/* Order number badge */}
        <View style={styles.orderBadge}>
          <Text style={styles.orderText}>{song.order}</Text>
        </View>

        <View style={styles.songBody}>
          {/* Title + key/tempo row */}
          <View style={styles.songHeader}>
            <View style={styles.songInfo}>
              <Text style={styles.songTitle}>{song.title}</Text>
              {song.artist ? (
                <Text style={styles.songArtist}>{song.artist}</Text>
              ) : null}
            </View>
            <View style={styles.songMeta}>
              {song.key ? (
                <View style={styles.keyChip}>
                  <Text style={styles.keyChipText}>{song.key}</Text>
                </View>
              ) : null}
              {song.tempo ? (
                <Text style={styles.tempoText}>{song.tempo} BPM</Text>
              ) : null}
              {song.duration ? (
                <Text style={styles.durationText}>{song.duration}</Text>
              ) : null}
            </View>
          </View>

          {/* Song notes */}
          {song.notes ? (
            <View style={styles.notesRow}>
              <Text style={styles.notesText}>💬 {song.notes}</Text>
            </View>
          ) : null}

          {/* Lyrics button for vocal roles */}
          {isVocal && song.hasLyrics ? (
            <TouchableOpacity
              style={styles.lyricsButton}
              onPress={() =>
                navigation.navigate('LyricsView', {
                  song,
                  userRole,
                  assignmentId: selectedAssignment?.id,
                })
              }
            >
              <Text style={styles.lyricsButtonText}>🎤  View Lyrics</Text>
            </TouchableOpacity>
          ) : null}

          {/* If vocal but no lyrics yet */}
          {isVocal && !song.hasLyrics ? (
            <View style={styles.noLyricsRow}>
              <Text style={styles.noLyricsText}>🎤 Lyrics not available for this song</Text>
            </View>
          ) : null}

          {/* Instrument chart button for non-vocal roles */}
          {!isVocal && chartToShow ? (
            <TouchableOpacity
              style={styles.chartButton}
              onPress={() =>
                navigation.navigate('LyricsView', {
                  song: { ...song, lyrics: chartToShow },
                  userRole: selectedInstrument || 'Chart',
                })
              }
            >
              <Text style={styles.chartButtonText}>
                {INSTRUMENT_ICON[selectedInstrument] || '🎼'}{'  '}
                View {instrChart ? `${selectedInstrument} Chart` : 'Chord Chart'}
              </Text>
            </TouchableOpacity>
          ) : !isVocal && !chartToShow ? (
            <View style={styles.noLyricsRow}>
              <Text style={styles.noLyricsText}>🎵 No chart available for this song</Text>
            </View>
          ) : null}

          {/* Edit lyrics / chord chart */}
          <TouchableOpacity
            style={styles.editContentBtn}
            onPress={() =>
              navigation.navigate('ContentEditor', {
                song,
                serviceId: selectedAssignment?.service_id || '',
                type: isVocal ? 'lyrics' : 'chord_chart',
                existing: isVocal ? (song.lyrics || '') : (chartToShow || ''),
                instrument: isVocal ? 'Vocals' : (selectedInstrument || ''),
                isAdmin: profile?.grantedRole === 'md' || profile?.grantedRole === 'admin',
              })
            }
          >
            <Text style={styles.editContentBtnText}>
              ✏️{'  '}{isVocal ? (song.hasLyrics ? 'Edit Lyrics' : 'Add Lyrics') : (chartToShow ? `Edit ${selectedInstrument ? selectedInstrument + ' ' : ''}Chart` : 'Add Chart')}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // Empty state — no accepted assignments
  if (!selectedAssignment) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No Accepted Assignments</Text>
          <Text style={styles.emptyText}>
            Accept a service assignment to view its setlist.
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
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => fetchSetlist(selectedAssignment.service_id)}
          tintColor="#4F46E5"
        />
      }
    >
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerIcon}>📋</Text>
        <Text style={styles.title}>Setlist</Text>
        <Text style={styles.subtitle}>{selectedAssignment.service_name}</Text>
      </View>

      {/* Service selector pills (multiple accepted assignments) */}
      {assignments.length > 1 && (
        <View style={styles.selectorWrapper}>
          <Text style={styles.selectorLabel}>Service:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {assignments.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[
                  styles.pill,
                  selectedAssignment?.id === a.id && styles.pillActive,
                ]}
                onPress={() => selectAssignment(a)}
              >
                <Text
                  style={[
                    styles.pillText,
                    selectedAssignment?.id === a.id && styles.pillTextActive,
                  ]}
                >
                  {a.service_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Service info card */}
      <View style={styles.serviceCard}>
        <Text style={styles.serviceDate}>
          📅{' '}
          {new Date(selectedAssignment.service_date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            🎵 {ROLE_LABELS[selectedAssignment.role] || selectedAssignment.role}
          </Text>
        </View>
        {selectedAssignment.notes ? (
          <Text style={styles.serviceNotes}>
            {selectedAssignment.notes}
          </Text>
        ) : null}
      </View>

      {/* Instrument chart picker — shown when any song has instrumentNotes */}
      {(() => {
        const available = CHART_INSTRUMENTS.filter(instr =>
          setlist.some(s => s.instrumentNotes?.[instr])
        );
        if (!available.length) return null;
        return (
          <View style={styles.instrumentPickerCard}>
            <Text style={styles.instrumentPickerLabel}>🎸 Chart for instrument:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.instrumentPickerRow}>
              {available.map(instr => (
                <TouchableOpacity
                  key={instr}
                  style={[styles.instrumentPill, selectedInstrument === instr && styles.instrumentPillActive]}
                  onPress={() => setSelectedInstrument(instr)}
                >
                  <Text style={[styles.instrumentPillText, selectedInstrument === instr && styles.instrumentPillTextActive]}>
                    {INSTRUMENT_ICON[instr] || '🎵'}{'  '}{instr}
                  </Text>
                </TouchableOpacity>
              ))}
              {/* "All / Master" option */}
              <TouchableOpacity
                style={[styles.instrumentPill, selectedInstrument === null && styles.instrumentPillActive]}
                onPress={() => setSelectedInstrument(null)}
              >
                <Text style={[styles.instrumentPillText, selectedInstrument === null && styles.instrumentPillTextActive]}>
                  🎼  Master Chart
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        );
      })()}

      {/* Play Setlist button — always visible once songs load */}
      {!loading && !error && setlist.length > 0 && (
        <TouchableOpacity
          style={styles.playButton}
          onPress={() =>
            navigation.navigate('SetlistRunner', {
              songs: setlist,
              startIndex: 0,
              userRole: selectedAssignment.role,
              userRoles: selectedAssignment.roles || [selectedAssignment.role],
            })
          }
        >
          <Text style={styles.playButtonText}>▶  Play Setlist</Text>
        </TouchableOpacity>
      )}

      {/* Song list */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading setlist…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorState}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchSetlist(selectedAssignment.service_id)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : setlist.length === 0 ? (
        <View style={styles.noSongsState}>
          <Text style={styles.noSongsIcon}>🎵</Text>
          <Text style={styles.noSongsText}>
            No songs in this service yet.{'\n'}Pull down to refresh.
          </Text>
        </View>
      ) : (
        <View style={styles.setlistSection}>
          <Text style={styles.sectionTitle}>Songs ({setlist.length})</Text>
          {setlist.map(renderSong)}
        </View>
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
    fontSize: 56,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  selectorWrapper: {
    marginBottom: 20,
  },
  selectorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0B1120',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  pillText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  serviceCard: {
    padding: 16,
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4F46E5',
    marginBottom: 24,
  },
  serviceDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 10,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#4F46E520',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#818CF8',
  },
  serviceNotes: {
    marginTop: 10,
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  loadingState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#9CA3AF',
  },
  errorState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  noSongsState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  noSongsIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  noSongsText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
  },
  playButton: {
    marginBottom: 20,
    paddingVertical: 16,
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  playButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  setlistSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 16,
  },
  songCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12,
  },
  orderBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 2,
    flexShrink: 0,
  },
  orderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  songBody: {
    flex: 1,
  },
  songHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  songInfo: {
    flex: 1,
    marginRight: 12,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 3,
  },
  songArtist: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  songMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  keyChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#4F46E520',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  keyChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#818CF8',
  },
  tempoText: {
    fontSize: 11,
    color: '#6B7280',
  },
  durationText: {
    fontSize: 11,
    color: '#6B7280',
  },
  notesRow: {
    marginTop: 4,
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  notesText: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  lyricsButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    alignItems: 'center',
  },
  lyricsButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  noLyricsRow: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
  },
  noLyricsText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  editContentBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#0B1120',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    alignSelf: 'flex-start',
  },
  editContentBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  chartButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1E1B4B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4F46E5',
    alignItems: 'center',
  },
  chartButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#818CF8',
  },
  instrumentPickerCard: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  instrumentPickerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  instrumentPickerRow: { flexDirection: 'row' },
  instrumentPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#020617',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    marginRight: 8,
  },
  instrumentPillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  instrumentPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  instrumentPillTextActive: {
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
    lineHeight: 22,
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
