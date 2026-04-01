/**
 * Key Change Screen - Ultimate Playback
 * Transpose song to different keys with auto-update of chord charts
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
import { autoTransposeSong, resetToOriginalKey, calculateSemitoneShift } from '../src/utils/transpose';

const KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Db', 'Eb', 'Gb', 'Ab', 'Bb',
];

export default function KeyChangeScreen({ route, navigation }) {
  const { songId } = route.params;
  const [song, setSong] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
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
      setSelectedKey(songData.current_key || songData.original_key);
    } catch (error) {
      console.error('Error loading song:', error);
      Alert.alert('Error', 'Failed to load song');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyChange = async () => {
    if (!selectedKey || selectedKey === song.current_key) {
      Alert.alert('Info', 'Key is already set to ' + selectedKey);
      return;
    }

    try {
      // Transpose song
      const transposedSong = autoTransposeSong(song, selectedKey);

      // Save
      await addOrUpdateSong(transposedSong);

      const semitones = calculateSemitoneShift(
        song.original_key,
        selectedKey
      );

      Alert.alert(
        'Key Changed',
        `Song transposed from ${song.original_key} to ${selectedKey}\n\n` +
          `Semitone shift: ${semitones > 0 ? '+' : ''}${semitones}\n\n` +
          `Chord charts have been automatically updated!`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error changing key:', error);
      Alert.alert('Error', 'Failed to change key');
    }
  };

  const handleResetKey = async () => {
    Alert.alert(
      'Reset to Original Key',
      `Reset song from ${song.current_key} back to ${song.original_key}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              const resetSong = resetToOriginalKey(song);
              await addOrUpdateSong(resetSong);

              Alert.alert('Success', 'Song reset to original key', [
                {
                  text: 'OK',
                  onPress: () => navigation.goBack(),
                },
              ]);
            } catch (error) {
              console.error('Error resetting key:', error);
              Alert.alert('Error', 'Failed to reset key');
            }
          },
        },
      ]
    );
  };

  const getSemitoneShift = (targetKey) => {
    if (!song || !targetKey) return 0;
    return calculateSemitoneShift(song.original_key, targetKey);
  };

  const isCurrentKey = (key) => {
    return key === (song?.current_key || song?.original_key);
  };

  const isOriginalKey = (key) => {
    return key === song?.original_key;
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
        <Text style={styles.title}>Change Key</Text>
        <Text style={styles.subtitle}>{song.title}</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Original Key:</Text>
        <Text style={styles.infoValue}>{song.original_key || 'Not set'}</Text>

        <Text style={[styles.infoLabel, { marginTop: 12 }]}>Current Key:</Text>
        <Text style={styles.infoValue}>{song.current_key || song.original_key}</Text>

        {song.current_key && song.current_key !== song.original_key && (
          <>
            <Text style={[styles.infoLabel, { marginTop: 12 }]}>Transposed:</Text>
            <Text style={styles.infoValue}>
              {calculateSemitoneShift(song.original_key, song.current_key)} semitones
            </Text>
          </>
        )}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 How It Works:</Text>
        <Text style={styles.infoText}>
          • Select a new key below
        </Text>
        <Text style={styles.infoText}>
          • Chord charts will automatically transpose
        </Text>
        <Text style={styles.infoText}>
          • MIDI data will be shifted by semitones
        </Text>
        <Text style={styles.infoText}>
          • Device presets remain the same
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Select New Key:</Text>

      <View style={styles.keyGrid}>
        {KEYS.filter((k) => !k.includes('b')).map((key) => {
          const shift = getSemitoneShift(key);
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.keyButton,
                isCurrentKey(key) && styles.keyButtonCurrent,
                selectedKey === key && styles.keyButtonSelected,
              ]}
              onPress={() => setSelectedKey(key)}
            >
              <Text
                style={[
                  styles.keyButtonText,
                  (isCurrentKey(key) || selectedKey === key) &&
                    styles.keyButtonTextActive,
                ]}
              >
                {key}
              </Text>
              {shift !== 0 && (
                <Text style={styles.keyButtonShift}>
                  {shift > 0 ? '+' : ''}
                  {shift}
                </Text>
              )}
              {isOriginalKey(key) && (
                <Text style={styles.keyButtonBadge}>Original</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Flat Keys:</Text>

      <View style={styles.keyGrid}>
        {KEYS.filter((k) => k.includes('b')).map((key) => {
          const shift = getSemitoneShift(key);
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.keyButton,
                isCurrentKey(key) && styles.keyButtonCurrent,
                selectedKey === key && styles.keyButtonSelected,
              ]}
              onPress={() => setSelectedKey(key)}
            >
              <Text
                style={[
                  styles.keyButtonText,
                  (isCurrentKey(key) || selectedKey === key) &&
                    styles.keyButtonTextActive,
                ]}
              >
                {key}
              </Text>
              {shift !== 0 && (
                <Text style={styles.keyButtonShift}>
                  {shift > 0 ? '+' : ''}
                  {shift}
                </Text>
              )}
              {isOriginalKey(key) && (
                <Text style={styles.keyButtonBadge}>Original</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.actions}>
        {song.current_key && song.current_key !== song.original_key && (
          <TouchableOpacity
            style={[styles.button, styles.resetButton]}
            onPress={handleResetKey}
          >
            <Text style={styles.resetButtonText}>Reset to Original</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.changeButton]}
          onPress={handleKeyChange}
          disabled={!selectedKey || selectedKey === (song.current_key || song.original_key)}
        >
          <Text style={styles.changeButtonText}>
            {selectedKey === (song.current_key || song.original_key)
              ? 'Current Key'
              : `Change to ${selectedKey}`}
          </Text>
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
  infoCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
  },
  infoLabel: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  infoValue: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
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
  sectionTitle: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  keyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keyButton: {
    width: 70,
    height: 70,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  keyButtonCurrent: {
    borderColor: '#10B981',
    borderWidth: 2,
  },
  keyButtonSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
    borderWidth: 2,
  },
  keyButtonText: {
    color: '#E5E7EB',
    fontSize: 20,
    fontWeight: '700',
  },
  keyButtonTextActive: {
    color: '#F9FAFB',
  },
  keyButtonShift: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 2,
  },
  keyButtonBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    fontSize: 8,
    color: '#10B981',
    fontWeight: '600',
  },
  actions: {
    marginTop: 24,
    gap: 12,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
  },
  resetButtonText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
  },
  changeButton: {
    backgroundColor: '#4F46E5',
  },
  changeButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
});
