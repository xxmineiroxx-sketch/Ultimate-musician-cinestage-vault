/**
 * Live Performance Screen - Ultimate Playback Phase 3
 * Main performance interface with stems playback, scene control, and emergency features
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
  RefreshControl,
} from 'react-native';
import audioEngine from '../services/audioEngine';
import sceneManager from '../services/sceneManager';
import { getSongById } from '../services/storage';

const { width } = Dimensions.get('window');

function formatStemName(value) {
  return String(value || 'Track')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function sectionKey(section, index = 0) {
  return String(
    section?.id
    || section?.sectionId
    || section?.markerId
    || section?.section
    || `section_${index}`
  );
}

function normalizeStructure(structure = [], fallbackDuration = 0) {
  const raw = Array.isArray(structure) ? structure : [];
  const mapped = raw
    .map((section, index) => {
      const startMs = Number(
        section?.start_ms
        ?? section?.startMillis
        ?? (section?.startSec != null ? Number(section.startSec) * 1000 : null)
        ?? (section?.timeSec != null ? Number(section.timeSec) * 1000 : null)
        ?? 0
      );
      const endMsValue = Number(
        section?.end_ms
        ?? section?.endMillis
        ?? (section?.endSec != null ? Number(section.endSec) * 1000 : null)
      );
      return {
        ...section,
        id: sectionKey(section, index),
        section: section?.section || section?.label || `Section ${index + 1}`,
        start_ms: Number.isFinite(startMs) ? Math.max(0, startMs) : 0,
        end_ms: Number.isFinite(endMsValue) ? Math.max(0, endMsValue) : null,
      };
    })
    .sort((left, right) => left.start_ms - right.start_ms);

  return mapped.map((section, index) => ({
    ...section,
    end_ms: section.end_ms ?? mapped[index + 1]?.start_ms ?? fallbackDuration ?? section.start_ms,
  }));
}

function extractStemEntries(source, seen) {
  if (!source) return [];
  const rawEntries = Array.isArray(source)
    ? source
    : Object.entries(source).map(([id, value]) => (
      typeof value === 'string'
        ? { id, name: id, uri: value, type: id }
        : {
            id: value?.id || value?.type || id,
            name: value?.name || value?.label || id,
            uri: value?.uri || value?.url || value?.localUri || value?.fileUrl || value?.downloadUrl || null,
            type: value?.type || id,
          }
    ));

  return rawEntries.reduce((list, item, index) => {
    const rawId = String(item?.id || item?.type || item?.name || `track_${index}`).trim();
    const uri = String(item?.uri || '').trim();
    if (!rawId || !uri) return list;
    const key = rawId.toLowerCase();
    if (seen.has(key)) return list;
    seen.add(key);
    list.push({
      id: rawId,
      name: formatStemName(item?.name || item?.label || rawId),
      uri,
      type: item?.type || rawId,
    });
    return list;
  }, []);
}

function getSongStemEntries(songData) {
  const seen = new Set();
  return [
    ...extractStemEntries(songData?.latestStemsJob?.result?.stems, seen),
    ...extractStemEntries(songData?.latestStemsJob?.stems, seen),
    ...extractStemEntries(songData?.stems, seen),
    ...extractStemEntries(songData?.localStems, seen),
  ];
}

export default function LivePerformanceScreen({ route, navigation }) {
  const { songId, assignmentId } = route.params;

  const [song, setSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentScene, setCurrentScene] = useState(null);
  const [stems, setStems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [emergencyMode, setEmergencyMode] = useState(null); // null, 'click_only', 'stopped'
  const [refreshing, setRefreshing] = useState(false);
  const [loopSectionKey, setLoopSectionKey] = useState(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSong();
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadSong();
    initializeAudio();

    return () => {
      cleanup();
    };
  }, []);

  const loadSong = async () => {
    try {
      const songData = await getSongById(songId);
      if (!songData) {
        Alert.alert('Error', 'Song not found');
        navigation.goBack();
        return;
      }

      const structure = normalizeStructure(
        songData.structure,
        Number(songData?.duration_ms || songData?.durationMs || 0),
      );
      const liveStems = getSongStemEntries(songData);

      setSong({ ...songData, structure });
      setStems(liveStems);
      setLoopSectionKey(null);

      // Create scenes from song structure
      if (structure.length > 0) {
        sceneManager.createScenesFromStructure(structure, liveStems);
      }
    } catch (error) {
      console.error('Error loading song:', error);
      Alert.alert('Error', 'Failed to load song');
    }
  };

  const initializeAudio = async () => {
    try {
      await audioEngine.initialize();

      // Set up callbacks
      audioEngine.onProgressUpdate = ({ position: pos, duration: dur }) => {
        setPosition(pos);
        setDuration(dur);
      };

      audioEngine.onPlaybackStatusChange = ({ isPlaying: playing }) => {
        setIsPlaying(playing);
      };

      setIsLoading(false);
    } catch (error) {
      console.error('Error initializing audio:', error);
      Alert.alert('Error', 'Failed to initialize audio engine');
    }
  };

  const loadStems = async () => {
    try {
      setIsLoading(true);

      // Load all stems
      const loadPromises = stems.map((stem) =>
        audioEngine.loadStem(stem.id, stem.uri)
      );

      // Load click and guide if available
      if (song.assets?.click_track) {
        loadPromises.push(audioEngine.loadClickTrack(song.assets.click_track));
      }

      if (song.assets?.guide_track) {
        loadPromises.push(audioEngine.loadGuideTrack(song.assets.guide_track));
      }

      await Promise.all(loadPromises);

      Alert.alert('Success', 'All tracks loaded!');
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading stems:', error);
      Alert.alert('Error', 'Failed to load some tracks');
      setIsLoading(false);
    }
  };

  const handlePlay = async () => {
    try {
      if (isPlaying) {
        await audioEngine.applyConductorCommand('PAUSE');
      } else {
        await audioEngine.applyConductorCommand('PLAY');

        // Start auto scene transitions
        sceneManager.startAutoTransition();
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
      Alert.alert('Error', 'Playback error');
    }
  };

  const handleStop = async () => {
    try {
      await audioEngine.applyConductorCommand('STOP');
      audioEngine.clearLoopRegion();
      setPosition(0);
      setEmergencyMode(null);
      setLoopSectionKey(null);
    } catch (error) {
      console.error('Error stopping:', error);
    }
  };

  const handleSeek = async (targetSection, options = {}) => {
    const section = typeof targetSection === 'number'
      ? song?.structure?.[targetSection]
      : targetSection;
    if (!section) return;

    try {
      await audioEngine.applyConductorCommand({
        type: 'SEEK_SECTION',
        section,
      });
      if (options.keepLoop !== true) {
        audioEngine.clearLoopRegion();
        setLoopSectionKey(null);
      }

      // Apply scene for this section
      await sceneManager.applySceneBySection(section.section);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  const toggleSectionLoop = async (section, index) => {
    if (!section) return;
    const key = sectionKey(section, index);

    try {
      if (loopSectionKey === key) {
        audioEngine.clearLoopRegion();
        setLoopSectionKey(null);
        return;
      }

      await audioEngine.applyConductorCommand({
        type: 'LOOP_SECTION',
        section,
        seek: true,
        label: section.section,
      });
      await sceneManager.applySceneBySection(section.section);
      setLoopSectionKey(key);
    } catch (error) {
      console.error('Error toggling section loop:', error);
      Alert.alert('Loop Error', 'Unable to loop this section');
    }
  };

  const handleLoopCurrentSection = async () => {
    const currentIndex = song?.structure?.findIndex((section) => (
      position >= section.start_ms && position < section.end_ms
    )) ?? -1;
    const section = currentIndex >= 0 ? song?.structure?.[currentIndex] : song?.structure?.[0];
    if (!section) return;
    await toggleSectionLoop(section, currentIndex >= 0 ? currentIndex : 0);
  };

  const handlePanicStop = () => {
    Alert.alert(
      'Emergency Stop',
      'Fade out and stop all tracks?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'STOP',
          style: 'destructive',
          onPress: async () => {
            await audioEngine.panicStop(1000);
            setEmergencyMode('stopped');
          },
        },
      ]
    );
  };

  const handleClickOnly = async () => {
    try {
      await audioEngine.clickOnlyMode();
      setEmergencyMode('click_only');
      Alert.alert('Click-Only Mode', 'Only click track is audible');
    } catch (error) {
      console.error('Error activating click-only:', error);
    }
  };

  const handleRestoreTracks = async () => {
    try {
      await audioEngine.restoreAllTracks();
      setEmergencyMode(null);
      Alert.alert('Restored', 'All tracks restored');
    } catch (error) {
      console.error('Error restoring tracks:', error);
    }
  };

  const cleanup = async () => {
    try {
      audioEngine.clearLoopRegion();
      await audioEngine.stop();
      await audioEngine.unloadAll();
      sceneManager.clear();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  };

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  if (isLoading || !song) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{song.title}</Text>
          <Text style={styles.subtitle}>
            {song.artist} • {song.key} • {song.bpm} BPM
          </Text>
        </View>
      </View>

      {/* Emergency Mode Banner */}
      {emergencyMode && (
        <View style={styles.emergencyBanner}>
          <Text style={styles.emergencyText}>
            {emergencyMode === 'click_only' ? '⚠️ CLICK-ONLY MODE' : '🛑 STOPPED'}
          </Text>
          {emergencyMode === 'click_only' && (
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestoreTracks}
            >
              <Text style={styles.restoreButtonText}>Restore All</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* Section Pills */}
      {song.structure && song.structure.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sectionsScroll}
          contentContainerStyle={styles.sectionsContent}
        >
          {song.structure.map((section, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.sectionPill,
                loopSectionKey === sectionKey(section, index) &&
                  styles.sectionPillLooping,
                position >= section.start_ms &&
                  position < section.end_ms &&
                  styles.sectionPillActive,
              ]}
              onPress={() => handleSeek(section)}
              onLongPress={() => toggleSectionLoop(section, index)}
            >
              <Text
                style={[
                  styles.sectionPillText,
                  position >= section.start_ms &&
                    position < section.end_ms &&
                    styles.sectionPillTextActive,
                ]}
              >
                {section.section}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Playback Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={handleStop}>
          <Text style={styles.controlButtonText}>⏹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.playButton]}
          onPress={handlePlay}
        >
          <Text style={styles.playButtonText}>{isPlaying ? '⏸' : '▶️'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            loopSectionKey && styles.loopButtonActive,
          ]}
          onPress={handleLoopCurrentSection}
        >
          <Text style={styles.controlButtonText}>🔁</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlButton} onPress={loadStems}>
          <Text style={styles.controlButtonText}>📥</Text>
        </TouchableOpacity>
      </View>

      {/* Stems List */}
      <ScrollView
        style={styles.stemsList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        <Text style={styles.stemsTitle}>Active Tracks</Text>
        {stems.map((stem) => (
          <View key={stem.id} style={styles.stemRow}>
            <Text style={styles.stemName}>{stem.name}</Text>
            <View style={styles.stemControls}>
              <TouchableOpacity
                style={styles.stemButton}
                onPress={() => audioEngine.setTrackMute(stem.id, false)}
              >
                <Text style={styles.stemButtonText}>🔊</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stemButton}
                onPress={() => audioEngine.setTrackMute(stem.id, true)}
              >
                <Text style={styles.stemButtonText}>🔇</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Click & Guide */}
        <View style={styles.stemRow}>
          <Text style={styles.stemName}>Click</Text>
          <TouchableOpacity
            style={styles.stemButton}
            onPress={() => audioEngine.setTrackMute('click', false)}
          >
            <Text style={styles.stemButtonText}>ON</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.stemRow}>
          <Text style={styles.stemName}>Guide</Text>
          <TouchableOpacity
            style={styles.stemButton}
            onPress={() => audioEngine.setTrackMute('guide', false)}
          >
            <Text style={styles.stemButtonText}>ON</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Emergency Controls */}
      <View style={styles.emergency}>
        <Text style={styles.emergencyTitle}>Emergency</Text>
        <View style={styles.emergencyButtons}>
          <TouchableOpacity
            style={[styles.emergencyButton, styles.panicButton]}
            onPress={handlePanicStop}
          >
            <Text style={styles.emergencyButtonText}>🛑 Panic Stop</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.emergencyButton, styles.clickButton]}
            onPress={handleClickOnly}
          >
            <Text style={styles.emergencyButtonText}>⏱️ Click Only</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  backBtn: {
    paddingRight: 12,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#9CA3AF',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
    marginTop: -2,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  emergencyBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#7C2D12',
    borderBottomWidth: 1,
    borderBottomColor: '#EA580C',
  },
  emergencyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  restoreButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#10B981',
    borderRadius: 8,
  },
  restoreButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  progressContainer: {
    padding: 20,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#1F2937',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#8B5CF6',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  sectionsScroll: {
    maxHeight: 60,
  },
  sectionsContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  sectionPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0B1120',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  sectionPillActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  sectionPillLooping: {
    borderColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.24,
    shadowRadius: 8,
  },
  sectionPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  sectionPillTextActive: {
    color: '#FFF',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    padding: 20,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  loopButtonActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#351908',
  },
  controlButtonText: {
    fontSize: 24,
  },
  playButtonText: {
    fontSize: 32,
  },
  stemsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stemsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 12,
  },
  stemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0B1120',
    borderRadius: 8,
    marginBottom: 8,
  },
  stemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F9FAFB',
  },
  stemControls: {
    flexDirection: 'row',
    gap: 8,
  },
  stemButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1F2937',
    borderRadius: 6,
  },
  stemButtonText: {
    fontSize: 12,
    color: '#E5E7EB',
  },
  emergency: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  emergencyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
  },
  emergencyButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  emergencyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  panicButton: {
    backgroundColor: '#DC2626',
  },
  clickButton: {
    backgroundColor: '#F59E0B',
  },
  emergencyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
});
