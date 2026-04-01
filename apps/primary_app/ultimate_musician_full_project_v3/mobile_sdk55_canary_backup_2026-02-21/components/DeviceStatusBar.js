/**
 * Device Status Bar Component
 * Shows connected MIDI devices and preset status
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, Alert } from 'react-native';
import * as cinestageAPI from '../api/cinestageAPI';

export default function DeviceStatusBar({ songPreset, onPresetsReady }) {
  const [devices, setDevices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);

  useEffect(() => {
    checkBackendAndDevices();
  }, []);

  const checkBackendAndDevices = async () => {
    setLoading(true);

    // Check if backend is running
    const isOnline = await cinestageAPI.checkBackendHealth();
    setBackendOnline(isOnline);

    if (isOnline) {
      // Scan for devices
      const result = await cinestageAPI.scanDevices();
      setDevices(result.detected_devices || {});

      // Notify parent if song has presets and devices are connected
      if (songPreset && result.detected_devices && Object.keys(result.detected_devices).length > 0) {
        onPresetsReady?.(true);
      }
    }

    setLoading(false);
  };

  const handleOpenUltimatePlayback = async () => {
    const deepLinkUrl = songPreset
      ? `ultimateplayback://song/${songPreset.id}/device-setup`
      : 'ultimateplayback://create-song';

    try {
      const { Linking } = require('react-native');
      const canOpen = await Linking.canOpenURL(deepLinkUrl);

      if (canOpen) {
        await Linking.openURL(deepLinkUrl);
      } else {
        Alert.alert(
          'Ultimate Playback Not Found',
          'Please make sure Ultimate Playback app is installed.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error opening Ultimate Playback:', error);
      Alert.alert('Error', 'Could not open Ultimate Playback app.');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#4F46E5" />
        <Text style={styles.loadingText}>Checking devices...</Text>
      </View>
    );
  }

  if (!backendOnline) {
    return (
      <View style={[styles.container, styles.containerError]}>
        <Text style={styles.statusText}>⚠️ CineStage Backend Offline</Text>
        <TouchableOpacity onPress={checkBackendAndDevices}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasDevices = devices && Object.keys(devices).length > 0;
  const hasPresets = songPreset != null;

  return (
    <View style={styles.container}>
      {hasDevices ? (
        <View style={styles.devicesRow}>
          {Object.entries(devices).map(([deviceKey, deviceInfo]) => (
            <View key={deviceKey} style={styles.deviceBadge}>
              <Text style={styles.deviceIcon}>🎹</Text>
              <Text style={styles.deviceName} numberOfLines={1}>
                {deviceInfo.device_type || deviceKey}
              </Text>
              <Text style={styles.deviceStatus}>
                {deviceInfo.connection_type === 'bluetooth' ? '📶' : '🔌'}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noDevicesText}>⚠️ No MIDI devices detected</Text>
      )}

      {hasPresets ? (
        <View style={styles.presetIndicator}>
          <Text style={styles.presetText}>✅ Presets configured</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.configureButton}
          onPress={handleOpenUltimatePlayback}
        >
          <Text style={styles.configureText}>⚙️ Configure Devices</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#111827',
    marginVertical: 12,
  },
  containerError: {
    backgroundColor: '#7C2D12',
    borderColor: '#991B1B',
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 12,
    marginLeft: 8,
  },
  statusText: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '500',
  },
  retryText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  devicesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  deviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#064E3B',
    marginRight: 8,
    marginBottom: 4,
    maxWidth: 120,
  },
  deviceIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  deviceName: {
    color: '#D1FAE5',
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  deviceStatus: {
    fontSize: 12,
    marginLeft: 4,
  },
  noDevicesText: {
    color: '#F59E0B',
    fontSize: 12,
    marginBottom: 8,
  },
  presetIndicator: {
    paddingVertical: 4,
  },
  presetText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '500',
  },
  configureButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#4F46E5',
    alignSelf: 'flex-start',
  },
  configureText: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '600',
  },
});
