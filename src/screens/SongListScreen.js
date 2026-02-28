/**
 * Song List Screen - Ultimate Playback
 * Shows all saved song presets
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
import { getSongs, deleteSong } from '../data/storage';

export default function SongListScreen({ navigation }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSongs();

    // Reload when screen comes into focus
    const unsubscribe = navigation.addListener('focus', loadSongs);
    return unsubscribe;
  }, [navigation]);

  const loadSongs = async () => {
    try {
      const songsData = await getSongs();
      setSongs(songsData);
    } catch (error) {
      console.error('Error loading songs:', error);
      Alert.alert('Error', 'Failed to load songs');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSong = async (songId, songTitle) => {
    Alert.alert(
      'Delete Song',
      `Are you sure you want to delete "${songTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSong(songId);
              await loadSongs();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete song');
            }
          },
        },
      ]
    );
  };

  const getDeviceCount = (song) => {
    let count = 0;
    const setups = song.device_setups || {};

    Object.values(setups).forEach(roleDevices => {
      Object.keys(roleDevices).forEach(device => {
        if (roleDevices[device]) count++;
      });
    });

    return count;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading songs...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Songs</Text>
        <Text style={styles.headerSubtitle}>{songs.length} presets</Text>
      </View>

      <TouchableOpacity
        style={styles.createButton}
        onPress={() => navigation.navigate('SongCreation')}
      >
        <Text style={styles.createButtonText}>➕ Create New Song</Text>
      </TouchableOpacity>

      {songs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎹</Text>
          <Text style={styles.emptyTitle}>No Songs Yet</Text>
          <Text style={styles.emptyText}>
            Create your first song preset to get started!
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => navigation.navigate('SongCreation')}
          >
            <Text style={styles.emptyButtonText}>Create First Song</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContainer}>
          {songs.map((song) => (
            <TouchableOpacity
              key={song.id}
              style={styles.songCard}
              onPress={() =>
                navigation.navigate('DeviceSetup', { songId: song.id })
              }
            >
              <View style={styles.songHeader}>
                <View style={styles.songInfo}>
                  <Text style={styles.songTitle}>{song.title || 'Untitled'}</Text>
                  {song.artist && (
                    <Text style={styles.songArtist}>{song.artist}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteSong(song.id, song.title)}
                >
                  <Text style={styles.deleteButtonText}>🗑️</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.songMeta}>
                {song.current_key && (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Key:</Text>
                    <Text style={styles.metaValue}>{song.current_key}</Text>
                  </View>
                )}
                {song.tempo && (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Tempo:</Text>
                    <Text style={styles.metaValue}>{song.tempo} BPM</Text>
                  </View>
                )}
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Devices:</Text>
                  <Text style={styles.metaValue}>{getDeviceCount(song)}</Text>
                </View>
              </View>

              <View style={styles.songActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() =>
                    navigation.navigate('DeviceSetup', { songId: song.id })
                  }
                >
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.testButton]}
                  onPress={() =>
                    navigation.navigate('TestMode', { songId: song.id })
                  }
                >
                  <Text style={styles.actionButtonText}>Test</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 4,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  createButton: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  createButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#E5E7EB',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#4F46E5',
  },
  emptyButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  songCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#111827',
  },
  songHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  songArtist: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  deleteButton: {
    padding: 8,
  },
  deleteButtonText: {
    fontSize: 20,
  },
  songMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    marginRight: 16,
    marginBottom: 4,
  },
  metaLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginRight: 4,
  },
  metaValue: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '500',
  },
  songActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  testButton: {
    backgroundColor: '#065F46',
    borderColor: '#059669',
  },
  actionButtonText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '500',
  },
});
