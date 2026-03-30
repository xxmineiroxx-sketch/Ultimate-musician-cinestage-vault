/**
 * Song Creation Screen - Ultimate Playback
 * Create new song with basic info
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { createSongPreset } from '../data/models';
import { addOrUpdateSong } from '../data/storage';

export default function SongCreationScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [originalKey, setOriginalKey] = useState('');
  const [tempo, setTempo] = useState('');
  const [timeSignature, setTimeSignature] = useState('4/4');

  const handleSave = async () => {
    // Validation
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a song title');
      return;
    }

    try {
      // Create song preset
      const song = createSongPreset();
      song.title = title.trim();
      song.artist = artist.trim();
      song.original_key = originalKey.trim();
      song.current_key = originalKey.trim(); // Start with original key
      song.tempo = tempo ? parseInt(tempo) : null;
      song.time_signature = timeSignature;

      // Save to storage
      const savedSong = await addOrUpdateSong(song);

      Alert.alert(
        'Success',
        'Song created! Now set up your devices.',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.replace('DeviceSetup', { songId: savedSong.id });
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error saving song:', error);
      Alert.alert('Error', 'Failed to save song');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create New Song</Text>
      <Text style={styles.subtitle}>
        Enter basic song information, then set up your devices
      </Text>

      <View style={styles.form}>
        <Text style={styles.label}>Song Title *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Acende outra vez"
          placeholderTextColor="#6B7280"
        />

        <Text style={styles.label}>Artist</Text>
        <TextInput
          style={styles.input}
          value={artist}
          onChangeText={setArtist}
          placeholder="e.g., Jefferson e Suellen"
          placeholderTextColor="#6B7280"
        />

        <Text style={styles.label}>Key</Text>
        <TextInput
          style={styles.input}
          value={originalKey}
          onChangeText={setOriginalKey}
          placeholder="e.g., G, C#, Eb"
          placeholderTextColor="#6B7280"
          autoCapitalize="characters"
        />

        <View style={styles.row}>
          <View style={styles.halfWidth}>
            <Text style={styles.label}>Tempo (BPM)</Text>
            <TextInput
              style={styles.input}
              value={tempo}
              onChangeText={setTempo}
              placeholder="120"
              placeholderTextColor="#6B7280"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.halfWidth}>
            <Text style={styles.label}>Time Signature</Text>
            <View style={styles.timeSignatureRow}>
              <TouchableOpacity
                style={[
                  styles.timeButton,
                  timeSignature === '4/4' && styles.timeButtonActive,
                ]}
                onPress={() => setTimeSignature('4/4')}
              >
                <Text
                  style={[
                    styles.timeButtonText,
                    timeSignature === '4/4' && styles.timeButtonTextActive,
                  ]}
                >
                  4/4
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.timeButton,
                  timeSignature === '3/4' && styles.timeButtonActive,
                ]}
                onPress={() => setTimeSignature('3/4')}
              >
                <Text
                  style={[
                    styles.timeButtonText,
                    timeSignature === '3/4' && styles.timeButtonTextActive,
                  ]}
                >
                  3/4
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.timeButton,
                  timeSignature === '6/8' && styles.timeButtonActive,
                ]}
                onPress={() => setTimeSignature('6/8')}
              >
                <Text
                  style={[
                    styles.timeButtonText,
                    timeSignature === '6/8' && styles.timeButtonTextActive,
                  ]}
                >
                  6/8
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>📝 Next Steps:</Text>
          <Text style={styles.infoText}>
            1. Click "Save & Continue" below
          </Text>
          <Text style={styles.infoText}>
            2. Choose which devices you use (Nord Stage, MODX, etc.)
          </Text>
          <Text style={styles.infoText}>
            3. Define your presets for each device
          </Text>
          <Text style={styles.infoText}>
            4. Test your preset!
          </Text>
        </View>
      </View>

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
          <Text style={styles.saveButtonText}>Save & Continue</Text>
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
  title: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 24,
  },
  form: {
    marginBottom: 24,
  },
  label: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#F9FAFB',
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  timeSignatureRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  timeButtonActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  timeButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  timeButtonTextActive: {
    color: '#F9FAFB',
    fontWeight: '600',
  },
  infoBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
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
