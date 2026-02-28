/**
 * Section Mapping Screen - Ultimate Playback
 * Map song sections to specific device presets
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
import { getSongById, addOrUpdateSong } from '../src/data/storage';
import {
  SONG_SECTIONS,
  getSectionMapping,
  setSectionMapping,
  removeSectionMapping,
} from '../src/data/models';

export default function SectionMappingScreen({ route, navigation }) {
  const { songId, role, deviceType } = route.params;
  const [song, setSong] = useState(null);
  const [presets, setPresets] = useState([]);
  const [mappings, setMappings] = useState({});
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

      // Load device presets
      const deviceSetup = songData.device_setups?.[role]?.[deviceType];
      let devicePresets = [];

      if (deviceType === 'nord_stage_4') {
        devicePresets = deviceSetup?.programs || [];
      } else if (deviceType === 'modx') {
        devicePresets = deviceSetup?.performances || [];
      }

      // Load existing mappings
      const existingMappings = {};
      SONG_SECTIONS.forEach((section) => {
        const mapping = getSectionMapping(songData, section, role, deviceType);
        if (mapping !== null) {
          existingMappings[section] = mapping;
        }
      });

      setSong(songData);
      setPresets(devicePresets);
      setMappings(existingMappings);
    } catch (error) {
      console.error('Error loading song:', error);
      Alert.alert('Error', 'Failed to load song');
    } finally {
      setLoading(false);
    }
  };

  const handleSetMapping = (section, presetIndex) => {
    const updatedMappings = { ...mappings };

    if (presetIndex === null) {
      // Remove mapping
      delete updatedMappings[section];
    } else {
      // Set mapping
      updatedMappings[section] = presetIndex;
    }

    setMappings(updatedMappings);
  };

  const handleSave = async () => {
    try {
      let updatedSong = { ...song };

      // Apply all mappings
      Object.entries(mappings).forEach(([section, presetIndex]) => {
        updatedSong = setSectionMapping(
          updatedSong,
          section,
          role,
          deviceType,
          presetIndex
        );
      });

      // Remove mappings that were deleted
      SONG_SECTIONS.forEach((section) => {
        if (!mappings[section]) {
          updatedSong = removeSectionMapping(updatedSong, section, role, deviceType);
        }
      });

      await addOrUpdateSong(updatedSong);

      Alert.alert('Success', 'Section mappings saved!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Error saving mappings:', error);
      Alert.alert('Error', 'Failed to save mappings');
    }
  };

  const getDeviceName = () => {
    if (deviceType === 'nord_stage_4') return 'Nord Stage 4';
    if (deviceType === 'modx') return 'Yamaha MODX';
    return deviceType;
  };

  const getPresetLabel = (preset, index) => {
    if (deviceType === 'nord_stage_4') {
      return preset.name || `Program ${preset.program_number}`;
    } else if (deviceType === 'modx') {
      return preset.name || `Performance ${preset.performance_number}`;
    }
    return `Preset ${index + 1}`;
  };

  if (loading || !song) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (presets.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>No Presets Available</Text>
          <Text style={styles.emptyText}>
            Add presets to this device before mapping sections
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.emptyButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Section Mappings</Text>
        <Text style={styles.subtitle}>
          {getDeviceName()} - {song.title}
        </Text>
        <Text style={styles.hint}>
          Choose which preset to use for each song section
        </Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 How It Works:</Text>
        <Text style={styles.infoText}>
          • Map sections to specific presets
        </Text>
        <Text style={styles.infoText}>
          • When you jump to a section in LiveScreen, the mapped preset triggers
        </Text>
        <Text style={styles.infoText}>
          • If no mapping, uses the first preset by default
        </Text>
      </View>

      {SONG_SECTIONS.filter((s) => s !== 'All').map((section) => (
        <View key={section} style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>{section}</Text>

          <View style={styles.presetSelector}>
            <TouchableOpacity
              style={[
                styles.presetOption,
                mappings[section] === undefined && styles.presetOptionActive,
              ]}
              onPress={() => handleSetMapping(section, null)}
            >
              <Text
                style={[
                  styles.presetOptionText,
                  mappings[section] === undefined && styles.presetOptionTextActive,
                ]}
              >
                Default (First)
              </Text>
            </TouchableOpacity>

            {presets.map((preset, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.presetOption,
                  mappings[section] === index && styles.presetOptionActive,
                ]}
                onPress={() => handleSetMapping(section, index)}
              >
                <Text
                  style={[
                    styles.presetOptionText,
                    mappings[section] === index && styles.presetOptionTextActive,
                  ]}
                >
                  {getPresetLabel(preset, index)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mappings[section] !== undefined && (
            <View style={styles.mappedBadge}>
              <Text style={styles.mappedBadgeText}>
                ✓ Mapped to {getPresetLabel(presets[mappings[section]], mappings[section])}
              </Text>
            </View>
          )}
        </View>
      ))}

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
          <Text style={styles.saveButtonText}>Save Mappings</Text>
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
    fontSize: 13,
    marginTop: 8,
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
  sectionCard: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
  },
  sectionLabel: {
    color: '#4F46E5',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  presetSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#374151',
  },
  presetOptionActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  presetOptionText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  presetOptionTextActive: {
    color: '#F9FAFB',
    fontWeight: '600',
  },
  mappedBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#064E3B',
    alignSelf: 'flex-start',
  },
  mappedBadgeText: {
    color: '#D1FAE5',
    fontSize: 12,
    fontWeight: '500',
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
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
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
