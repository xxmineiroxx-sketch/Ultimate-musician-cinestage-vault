/**
 * Live Performance Screen - Ultimate Playback Phase 3
 * Main performance interface with stems playback, scene control, and emergency features
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
} from 'react-native';
import audioEngine from '../services/audioEngine';
import sceneManager from '../services/sceneManager';
import { getSongById } from '../services/storage';

const { width } = Dimensions.get('window');

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

      setSong(songData);

      // Load stems info (URLs would come from backend)
      const mockStems = [
        { id: 'drums', name: 'Drums', uri: songData.stems?.drums || null },
        { id: 'bass', name: 'Bass', uri: songData.stems?.bass || null },
        { id: 'guitar', name: 'Guitar', uri: songData.stems?.guitar || null },
        { id: 'keys', name: 'Keys', uri: songData.stems?.keys || null },
        { id: 'vocals', name: 'Vocals', uri: songData.stems?.vocals || null },
        { id: 'bgv', name: 'BGV', uri: songData.stems?.bgv || null },
      ].filter((s) => s.uri); // Only stems with URIs

      setStems(mockStems);

      // Create scenes from song structure
      if (songData.structure && songData.structure.length > 0) {
        sceneManager.createScenesFromStructure(songData.structure, mockStems);
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
        await audioEngine.pause();
      } else {
        await audioEngine.play();

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
      await audioEngine.stop();
      setPosition(0);
      setEmergencyMode(null);
    } catch (error) {
      console.error('Error stopping:', error);
    }
  };

  const handleSeek = async (sectionIndex) => {
    if (!song.structure || !song.structure[sectionIndex]) return;

    try {
      const section = song.structure[sectionIndex];
      await audioEngine.seek(section.start_ms);

      // Apply scene for this section
      await sceneManager.applySceneBySection(section.section);
    } catch (error) {
      console.error('Error seeking:', error);
    }
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
        <Text style={styles.title}>{song.title}</Text>
        <Text style={styles.subtitle}>
          {song.artist} • {song.key} • {song.bpm} BPM
        </Text>
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
                position >= section.start_ms &&
                  position < section.end_ms &&
                  styles.sectionPillActive,
              ]}
              onPress={() => handleSeek(index)}
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

        <TouchableOpacity style={styles.controlButton} onPress={loadStems}>
          <Text style={styles.controlButtonText}>📥</Text>
        </TouchableOpacity>
      </View>

      {/* Stems List */}
      <ScrollView style={styles.stemsList}>
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
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
