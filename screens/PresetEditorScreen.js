/**
 * Preset Editor Screen - Ultimate Playback
 * Edit Nord Stage or MODX presets
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { getSongById, addOrUpdateSong } from '../src/data/storage';
import { createNordProgram, createMODXPerformance } from '../src/data/models';

export default function PresetEditorScreen({ route, navigation }) {
  const { songId, role, deviceType } = route.params;
  const [song, setSong] = useState(null);
  const [presets, setPresets] = useState([]);
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

      // Load existing presets
      const deviceSetup = songData.device_setups?.[role]?.[deviceType];
      let existingPresets = [];

      if (deviceType === 'nord_stage_4') {
        existingPresets = deviceSetup?.programs || [];
      } else if (deviceType === 'modx') {
        existingPresets = deviceSetup?.performances || [];
      }

      setSong(songData);
      setPresets(existingPresets);
    } catch (error) {
      console.error('Error loading song:', error);
      Alert.alert('Error', 'Failed to load song');
    } finally {
      setLoading(false);
    }
  };

  const addPreset = () => {
    if (deviceType === 'nord_stage_4') {
      const newProgram = createNordProgram(presets.length + 1);
      setPresets([...presets, newProgram]);
    } else if (deviceType === 'modx') {
      const newPerformance = createMODXPerformance(presets.length + 1);
      setPresets([...presets, newPerformance]);
    }
  };

  const updatePreset = (index, field, value) => {
    const updated = [...presets];
    updated[index] = { ...updated[index], [field]: value };
    setPresets(updated);
  };

  const removePreset = (index) => {
    const updated = presets.filter((_, i) => i !== index);
    setPresets(updated);
  };

  const handleSave = async () => {
    if (presets.length === 0) {
      Alert.alert('Error', 'Please add at least one preset');
      return;
    }

    try {
      const updatedSong = { ...song };

      if (deviceType === 'nord_stage_4') {
        updatedSong.device_setups[role][deviceType] = {
          programs: presets,
        };
      } else if (deviceType === 'modx') {
        updatedSong.device_setups[role][deviceType] = {
          performances: presets,
        };
      }

      await addOrUpdateSong(updatedSong);

      Alert.alert('Success', 'Presets saved!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Error saving presets:', error);
      Alert.alert('Error', 'Failed to save presets');
    }
  };

  const getDeviceName = () => {
    if (deviceType === 'nord_stage_4') return 'Nord Stage 4';
    if (deviceType === 'modx') return 'Yamaha MODX';
    return deviceType;
  };

  const getPresetLabel = () => {
    if (deviceType === 'nord_stage_4') return 'Program';
    if (deviceType === 'modx') return 'Performance';
    return 'Preset';
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
        <Text style={styles.title}>{getDeviceName()}</Text>
        <Text style={styles.subtitle}>{song.title}</Text>
      </View>

      {presets.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎹</Text>
          <Text style={styles.emptyTitle}>No {getPresetLabel()}s Yet</Text>
          <Text style={styles.emptyText}>
            Add your first {getPresetLabel().toLowerCase()} to get started
          </Text>
        </View>
      ) : (
        <View style={styles.presetsList}>
          {presets.map((preset, index) => (
            <View key={index} style={styles.presetCard}>
              <View style={styles.presetHeader}>
                <Text style={styles.presetNumber}>
                  {getPresetLabel()} {deviceType === 'nord_stage_4' ? preset.program_number : preset.performance_number}
                </Text>
                <TouchableOpacity
                  onPress={() => removePreset(index)}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeButtonText}>🗑️</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>
                {getPresetLabel()} Number *
              </Text>
              <TextInput
                style={styles.input}
                value={String(
                  deviceType === 'nord_stage_4'
                    ? preset.program_number
                    : preset.performance_number
                )}
                onChangeText={(value) => {
                  const field =
                    deviceType === 'nord_stage_4'
                      ? 'program_number'
                      : 'performance_number';
                  updatePreset(index, field, parseInt(value) || 1);
                }}
                keyboardType="numeric"
                placeholder={deviceType === 'nord_stage_4' ? '1-8' : '1-640'}
                placeholderTextColor="#6B7280"
              />

              <Text style={styles.label}>Name (optional)</Text>
              <TextInput
                style={styles.input}
                value={preset.name || ''}
                onChangeText={(value) => updatePreset(index, 'name', value)}
                placeholder="e.g., Intro/Verse Setup"
                placeholderTextColor="#6B7280"
              />

              <Text style={styles.hint}>
                💡 Tip: Use an existing {getPresetLabel().toLowerCase()} number from your keyboard
              </Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.addButton} onPress={addPreset}>
        <Text style={styles.addButtonText}>
          ➕ Add {getPresetLabel()}
        </Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>📝 Phase 1 Note:</Text>
        <Text style={styles.infoText}>
          In Phase 1, we recall existing {getPresetLabel().toLowerCase()}s on your keyboard.
        </Text>
        <Text style={styles.infoText}>
          Phase 2 will add: browse keyboard library, create new {getPresetLabel().toLowerCase()}s, and more!
        </Text>
      </View>

      {presets.length > 0 && (
        <TouchableOpacity
          style={styles.mapSectionsButton}
          onPress={() =>
            navigation.navigate('SectionMapping', {
              songId: song.id,
              role: role,
              deviceType: deviceType,
            })
          }
        >
          <Text style={styles.mapSectionsButtonText}>
            🎯 Map to Song Sections
          </Text>
          <Text style={styles.mapSectionsHint}>
            Choose which preset to use for each section (Intro, Verse, Chorus...)
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.saveButton]}
          onPress={handleSave}
        >
          <Text style={styles.saveButtonText}>Save</Text>
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
  },
  presetsList: {
    marginBottom: 16,
  },
  presetCard: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
  },
  presetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  presetNumber: {
    color: '#4F46E5',
    fontSize: 16,
    fontWeight: '600',
  },
  removeButton: {
    padding: 4,
  },
  removeButtonText: {
    fontSize: 20,
  },
  label: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#F9FAFB',
    fontSize: 16,
  },
  hint: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  addButton: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#4F46E5',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 16,
  },
  addButtonText: {
    color: '#4F46E5',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1E1B4B',
    borderWidth: 1,
    borderColor: '#4F46E5',
    marginBottom: 24,
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
  mapSectionsButton: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1E1B4B',
    borderWidth: 1,
    borderColor: '#4F46E5',
    marginBottom: 24,
    alignItems: 'center',
  },
  mapSectionsButtonText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  mapSectionsHint: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
  },
  cancelButtonText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#4F46E5',
  },
  saveButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
});
