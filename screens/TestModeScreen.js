/**
 * Test Mode Screen - Ultimate Playback
 * Test preset recall on connected devices
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { getSongById } from '../src/data/storage';
import { CineStageAPI } from '../api/cinestage';

export default function TestModeScreen({ route, navigation }) {
  const { songId } = route.params;
  const [song, setSong] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState([]);
  const [devices, setDevices] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [songData, devicesData] = await Promise.all([
        getSongById(songId),
        scanDevices(),
      ]);

      if (!songData) {
        Alert.alert('Error', 'Song not found');
        navigation.goBack();
        return;
      }

      setSong(songData);
      setDevices(devicesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const scanDevices = async () => {
    try {
      const result = await CineStageAPI.scanDevices();
      return result;
    } catch (error) {
      console.error('Error scanning devices:', error);
      return { detected_devices: {} };
    }
  };

  const testPreset = async () => {
    setTesting(true);
    setTestResults([]);

    try {
      const result = await CineStageAPI.triggerPreset(song, null);

      if (result.status === 'success' || result.status === 'partial_success') {
        setTestResults(result.triggered_devices || []);

        if (result.errors && result.errors.length > 0) {
          Alert.alert(
            'Partial Success',
            `${result.triggered_devices.length} device(s) triggered, ${result.errors.length} error(s).\n\nErrors:\n${result.errors.map(e => `• ${e.device}: ${e.error}`).join('\n')}`
          );
        } else {
          Alert.alert('Success', `${result.triggered_devices.length} device(s) triggered!`);
        }
      } else {
        Alert.alert('Error', result.message || 'Failed to trigger preset');
      }
    } catch (error) {
      console.error('Error testing preset:', error);
      Alert.alert(
        'Error',
        'Failed to trigger preset. Make sure CineStage backend is running.'
      );
    } finally {
      setTesting(false);
    }
  };

  const testIndividualDevice = async (deviceType, config) => {
    setTesting(true);

    try {
      const result = await CineStageAPI.testDeviceRecall(deviceType, config);

      if (result.status === 'success') {
        Alert.alert('Success', result.message);
      } else {
        Alert.alert('Error', result.message || 'Failed to trigger device');
      }
    } catch (error) {
      console.error('Error testing device:', error);
      Alert.alert('Error', 'Failed to trigger device');
    } finally {
      setTesting(false);
    }
  };

  const getDeviceCount = () => {
    let count = 0;
    const setups = song?.device_setups || {};

    Object.values(setups).forEach(roleDevices => {
      Object.keys(roleDevices).forEach(device => {
        if (roleDevices[device]) count++;
      });
    });

    return count;
  };

  const renderDeviceSetup = (role, deviceType, deviceSetup) => {
    let presets = [];
    let deviceName = '';
    let presetType = '';

    if (deviceType === 'nord_stage_4') {
      deviceName = 'Nord Stage 4';
      presetType = 'Program';
      presets = deviceSetup.programs || [];
    } else if (deviceType === 'modx') {
      deviceName = 'Yamaha MODX';
      presetType = 'Performance';
      presets = deviceSetup.performances || [];
    }

    const isConnected = devices?.detected_devices?.[deviceType.replace('_4', '')] != null;

    return (
      <View key={`${role}-${deviceType}`} style={styles.deviceCard}>
        <View style={styles.deviceHeader}>
          <View>
            <Text style={styles.deviceName}>{deviceName}</Text>
            <Text style={styles.deviceRole}>{role}</Text>
          </View>
          <View style={[
            styles.statusBadge,
            isConnected ? styles.statusConnected : styles.statusDisconnected,
          ]}>
            <Text style={styles.statusText}>
              {isConnected ? '✅ Connected' : '⚠️ Not Found'}
            </Text>
          </View>
        </View>

        {presets.map((preset, idx) => (
          <View key={idx} style={styles.presetItem}>
            <View style={styles.presetInfo}>
              <Text style={styles.presetNumber}>
                {presetType} {
                  deviceType === 'nord_stage_4'
                    ? preset.program_number
                    : preset.performance_number
                }
              </Text>
              {preset.name && (
                <Text style={styles.presetName}>{preset.name}</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.testButton}
              onPress={() => {
                const config = deviceType === 'nord_stage_4'
                  ? { program_number: preset.program_number }
                  : { performance_number: preset.performance_number };
                testIndividualDevice(deviceType, config);
              }}
              disabled={testing || !isConnected}
            >
              <Text style={styles.testButtonText}>Test</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  if (loading || !song) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const deviceSetups = song.device_setups || {};
  const hasDevices = getDeviceCount() > 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{song.title}</Text>
        {song.artist && (
          <Text style={styles.subtitle}>{song.artist}</Text>
        )}
      </View>

      {!hasDevices ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>No Devices Configured</Text>
          <Text style={styles.emptyText}>
            Add devices to this song before testing
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() =>
              navigation.navigate('DeviceSetup', { songId: song.id })
            }
          >
            <Text style={styles.emptyButtonText}>Set Up Devices</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {Object.entries(deviceSetups).map(([role, roleDevices]) =>
            Object.entries(roleDevices).map(([deviceType, deviceSetup]) =>
              deviceSetup ? renderDeviceSetup(role, deviceType, deviceSetup) : null
            )
          )}

          <TouchableOpacity
            style={[styles.triggerButton, testing && styles.triggerButtonDisabled]}
            onPress={testPreset}
            disabled={testing}
          >
            {testing ? (
              <ActivityIndicator size="small" color="#F9FAFB" />
            ) : (
              <Text style={styles.triggerButtonText}>
                🎹 Trigger All Devices
              </Text>
            )}
          </TouchableOpacity>

          {testResults.length > 0 && (
            <View style={styles.resultsBox}>
              <Text style={styles.resultsTitle}>✅ Test Results:</Text>
              {testResults.map((result, idx) => (
                <Text key={idx} style={styles.resultItem}>
                  • {result.device}: {result.action}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>💡 Testing Tips:</Text>
            <Text style={styles.infoText}>
              1. Make sure CineStage backend is running
            </Text>
            <Text style={styles.infoText}>
              2. Connect keyboards via USB or WIDI
            </Text>
            <Text style={styles.infoText}>
              3. Click "Test" on individual presets first
            </Text>
            <Text style={styles.infoText}>
              4. Then try "Trigger All Devices"
            </Text>
          </View>
        </>
      )}
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
    marginTop: 16,
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
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#E5E7EB',
    fontSize: 18,
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
  deviceCard: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceName: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceRole: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusConnected: {
    backgroundColor: '#064E3B',
  },
  statusDisconnected: {
    backgroundColor: '#7C2D12',
  },
  statusText: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '500',
  },
  presetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  presetInfo: {
    flex: 1,
  },
  presetNumber: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '600',
  },
  presetName: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  testButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#374151',
  },
  testButtonText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '500',
  },
  triggerButton: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    marginBottom: 16,
  },
  triggerButtonDisabled: {
    backgroundColor: '#374151',
  },
  triggerButtonText: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '600',
  },
  resultsBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#064E3B',
    borderWidth: 1,
    borderColor: '#059669',
    marginBottom: 16,
  },
  resultsTitle: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  resultItem: {
    color: '#D1FAE5',
    fontSize: 14,
    marginBottom: 4,
  },
  infoBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1E1B4B',
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  infoTitle: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 4,
  },
});
