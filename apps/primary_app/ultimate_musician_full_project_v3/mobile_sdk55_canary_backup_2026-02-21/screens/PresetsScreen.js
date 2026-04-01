/**
 * Presets Screen - Ultimate Musician
 * Hub for device setup and preset management (Ultimate Playback functionality)
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
import { getAllSongs } from '../src/data/storage';

export default function PresetsScreen({ navigation }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSongs();
  }, []);

  const loadSongs = async () => {
    try {
      const allSongs = await getAllSongs();
      setSongs(allSongs);
    } catch (error) {
      console.error('Error loading songs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceSetup = (song) => {
    navigation.navigate('DeviceSetup', { songId: song.id });
  };

  const handlePresetLibrary = () => {
    navigation.navigate('PresetLibraryBrowser');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Preset Management</Text>
        <Text style={styles.subtitle}>
          Configure devices and manage presets for your songs
        </Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={handlePresetLibrary}
        >
          <Text style={styles.actionIcon}>📚</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Preset Library</Text>
            <Text style={styles.actionDescription}>
              Browse and search device presets
            </Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Songs with Devices */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Songs</Text>
        <Text style={styles.sectionSubtitle}>
          Configure device setups for your songs
        </Text>

        {loading ? (
          <Text style={styles.loadingText}>Loading songs...</Text>
        ) : songs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🎵</Text>
            <Text style={styles.emptyStateTitle}>No Songs Yet</Text>
            <Text style={styles.emptyStateText}>
              Create songs in the Library tab to set up device presets
            </Text>
          </View>
        ) : (
          songs.map((song) => {
            const deviceCount = Object.keys(song.device_setups || {}).reduce(
              (count, role) => {
                return count + Object.keys(song.device_setups[role] || {}).length;
              },
              0
            );

            return (
              <TouchableOpacity
                key={song.id}
                style={styles.songCard}
                onPress={() => handleDeviceSetup(song)}
              >
                <View style={styles.songHeader}>
                  <Text style={styles.songTitle}>{song.title}</Text>
                  {song.artist && (
                    <Text style={styles.songArtist}>{song.artist}</Text>
                  )}
                </View>

                <View style={styles.songMeta}>
                  {song.original_key && (
                    <View style={styles.songTag}>
                      <Text style={styles.songTagText}>Key: {song.original_key}</Text>
                    </View>
                  )}
                  {song.tempo && (
                    <View style={styles.songTag}>
                      <Text style={styles.songTagText}>{song.tempo} BPM</Text>
                    </View>
                  )}
                </View>

                <View style={styles.songFooter}>
                  <Text style={styles.deviceCount}>
                    {deviceCount > 0
                      ? `${deviceCount} device${deviceCount === 1 ? '' : 's'} configured`
                      : 'No devices configured'}
                  </Text>
                  <Text style={styles.songArrow}>›</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Features */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Available Features</Text>

        <View style={styles.featureGrid}>
          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🎹</Text>
            <Text style={styles.featureTitle}>Device Setup</Text>
            <Text style={styles.featureText}>
              Configure Nord Stage, MODX, and more
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🎯</Text>
            <Text style={styles.featureTitle}>Section Mapping</Text>
            <Text style={styles.featureText}>
              Map presets to song sections
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🎸</Text>
            <Text style={styles.featureTitle}>Guitar Rigs</Text>
            <Text style={styles.featureText}>
              Kemper, Helix, Axe-FX support
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🎼</Text>
            <Text style={styles.featureTitle}>Auto-Transpose</Text>
            <Text style={styles.featureText}>
              Change keys automatically
            </Text>
          </View>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    padding: 20,
    paddingTop: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    lineHeight: 22,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginTop: 12,
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
  actionDescription: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  actionArrow: {
    fontSize: 24,
    color: '#6B7280',
    fontWeight: '300',
  },
  loadingText: {
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  songCard: {
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 12,
  },
  songHeader: {
    marginBottom: 8,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  songArtist: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  songMeta: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  songTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1F2937',
    borderRadius: 6,
  },
  songTagText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  songFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  deviceCount: {
    fontSize: 13,
    color: '#6B7280',
  },
  songArrow: {
    fontSize: 20,
    color: '#6B7280',
    fontWeight: '300',
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  featureCard: {
    width: '48%',
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  featureIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 4,
  },
  featureText: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
  },
});
