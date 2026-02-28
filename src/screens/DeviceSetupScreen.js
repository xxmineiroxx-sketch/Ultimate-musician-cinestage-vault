/**
 * Device Setup Screen - Ultimate Playback
 * Choose which devices to use and configure presets
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
import { getSongById, addOrUpdateSong } from '../data/storage';
import { DEVICE_TYPES } from '../data/models';

export default function DeviceSetupScreen({ route, navigation }) {
  const { songId } = route.params;
  const [song, setSong] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSong();
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
    } catch (error) {
      console.error('Error loading song:', error);
      Alert.alert('Error', 'Failed to load song');
    } finally {
      setLoading(false);
    }
  };

  const enableDevice = async (role, deviceType) => {
    const updatedSong = { ...song };

    if (!updatedSong.device_setups[role]) {
      updatedSong.device_setups[role] = {};
    }

    if (!updatedSong.device_setups[role][deviceType]) {
      // Enable device with default config
      if (deviceType === 'nord_stage_4') {
        updatedSong.device_setups[role][deviceType] = {
          programs: []
        };
      } else if (deviceType === 'modx') {
        updatedSong.device_setups[role][deviceType] = {
          performances: []
        };
      }

      setSong(updatedSong);
      await addOrUpdateSong(updatedSong);

      // Navigate to preset editor
      navigation.navigate('PresetEditor', {
        songId: song.id,
        role: role,
        deviceType: deviceType,
      });
    } else {
      // Already enabled, go to editor
      navigation.navigate('PresetEditor', {
        songId: song.id,
        role: role,
        deviceType: deviceType,
      });
    }
  };

  const isDeviceEnabled = (role, deviceType) => {
    return song?.device_setups?.[role]?.[deviceType] != null;
  };

  if (loading || !song) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{song.title}</Text>
        {song.artist && (
          <Text style={styles.subtitle}>{song.artist}</Text>
        )}
        <Text style={styles.hint}>Choose your devices</Text>
      </View>

      {/* Keyboardist Devices */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎹 Keyboardist Devices</Text>

        <TouchableOpacity
          style={[
            styles.deviceCard,
            isDeviceEnabled('keyboardist', 'nord_stage_4') && styles.deviceCardEnabled,
          ]}
          onPress={() => enableDevice('keyboardist', 'nord_stage_4')}
        >
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>Nord Stage 4</Text>
            <Text style={styles.deviceDescription}>8 programs, multi-slot</Text>
          </View>
          {isDeviceEnabled('keyboardist', 'nord_stage_4') ? (
            <Text style={styles.deviceStatus}>✅ Enabled</Text>
          ) : (
            <Text style={styles.deviceAdd}>+</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.deviceCard,
            isDeviceEnabled('keyboardist', 'modx') && styles.deviceCardEnabled,
          ]}
          onPress={() => enableDevice('keyboardist', 'modx')}
        >
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>Yamaha MODX</Text>
            <Text style={styles.deviceDescription}>640 performances, 8 parts</Text>
          </View>
          {isDeviceEnabled('keyboardist', 'modx') ? (
            <Text style={styles.deviceStatus}>✅ Enabled</Text>
          ) : (
            <Text style={styles.deviceAdd}>+</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Coming Soon */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎸 Coming Soon</Text>
        <View style={styles.comingSoonCard}>
          <Text style={styles.comingSoonText}>• Guitarist (Kemper, Helix, Axe-FX)</Text>
          <Text style={styles.comingSoonText}>• Bassist (Darkglass, etc.)</Text>
          <Text style={styles.comingSoonText}>• DAWs (Ableton, Pro Tools)</Text>
          <Text style={styles.comingSoonHint}>Phase 2 & 3</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.testButton]}
          onPress={() => navigation.navigate('TestMode', { songId: song.id })}
        >
          <Text style={styles.testButtonText}>🧪 Test Preset</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#020617',
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 4,
  },
  hint: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
  },
  deviceCardEnabled: {
    borderColor: '#4F46E5',
    backgroundColor: '#1E1B4B',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  deviceDescription: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  deviceStatus: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '500',
  },
  deviceAdd: {
    color: '#4F46E5',
    fontSize: 24,
    fontWeight: '300',
  },
  comingSoonCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
  },
  comingSoonText: {
    color: '#6B7280',
    fontSize: 14,
    marginBottom: 4,
  },
  comingSoonHint: {
    color: '#4F46E5',
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  actions: {
    marginTop: 16,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  testButton: {
    backgroundColor: '#065F46',
  },
  testButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
});
