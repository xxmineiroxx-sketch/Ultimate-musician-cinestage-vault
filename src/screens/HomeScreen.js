/**
 * Home Screen - Ultimate Playback
 * Main dashboard for musicians
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
import { getSettings, getSongs } from '../data/storage';
import { CineStageAPI } from '../api/cinestage';

export default function HomeScreen({ navigation }) {
  const [settings, setSettings] = useState(null);
  const [songCount, setSongCount] = useState(0);
  const [devices, setDevices] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsData, songs] = await Promise.all([
        getSettings(),
        getSongs(),
      ]);
      setSettings(settingsData);
      setSongCount(songs.length);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScanDevices = async () => {
    try {
      setLoading(true);
      const result = await CineStageAPI.scanDevices();
      setDevices(result);
      Alert.alert(
        'Devices Scanned',
        `Found ${result.outputs?.length || 0} MIDI outputs`
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to scan devices. Is CineStage backend running?');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ultimate Playback</Text>
        <Text style={styles.subtitle}>
          {settings?.instrumentRole || 'Musician'}'s Workspace
        </Text>
      </View>

      <View style={styles.statsBox}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{songCount}</Text>
          <Text style={styles.statLabel}>Songs</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {devices ? devices.outputs?.length || 0 : '?'}
          </Text>
          <Text style={styles.statLabel}>Devices</Text>
        </View>
      </View>

      <View style={styles.actionsBox}>
        <TouchableOpacity
          style={[styles.actionButton, styles.primaryButton]}
          onPress={() => navigation.navigate('SongList')}
        >
          <Text style={styles.actionButtonText}>📚 My Songs</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => navigation.navigate('SongCreation')}
        >
          <Text style={styles.actionButtonText}>➕ Create New Song</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={handleScanDevices}
        >
          <Text style={styles.actionButtonText}>
            🔍 Scan MIDI Devices
          </Text>
        </TouchableOpacity>
      </View>

      {devices && (
        <View style={styles.devicesBox}>
          <Text style={styles.devicesTitle}>Connected Devices:</Text>
          {devices.outputs && devices.outputs.length > 0 ? (
            devices.outputs.map((device, idx) => (
              <Text key={idx} style={styles.deviceItem}>
                ✅ {device}
              </Text>
            ))
          ) : (
            <Text style={styles.deviceItem}>No MIDI devices found</Text>
          )}
        </View>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>🎹 What is Ultimate Playback?</Text>
        <Text style={styles.infoText}>
          Ultimate Playback is your personal workspace for creating song
          presets with your exact keyboard, guitar, and effects setups.
        </Text>
        <Text style={styles.infoText}>
          When you trigger a song, all your devices automatically recall the
          correct patches - no more scrolling through presets!
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Phase 1 MVP - v0.1.0</Text>
        <Text style={styles.footerText}>
          CineStage API: {settings?.apiBase || 'Not configured'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#020617',
    minHeight: '100%',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 4,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  statsBox: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#111827',
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    color: '#4F46E5',
    fontSize: 36,
    fontWeight: '700',
  },
  statLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 4,
  },
  actionsBox: {
    marginBottom: 24,
  },
  actionButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#4F46E5',
  },
  secondaryButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
  },
  actionButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
  devicesBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#111827',
    marginBottom: 24,
  },
  devicesTitle: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  deviceItem: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 6,
  },
  infoBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 24,
  },
  infoTitle: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  footerText: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 4,
  },
});
