import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import { addOrUpdateSong, getSongs } from '../data/storage';
import { INSTRUMENT_SHEETS } from '../data/models';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { parseSections } from '../data/lyrics';

export default function SongDetailScreen({ route }) {
  const { songId } = route.params;
  const [song, setSong] = useState(null);

  useEffect(() => {
    (async () => {
      const songs = await getSongs();
      const current = songs.find((s) => s.id === songId);
      setSong(current || null);
    })();
  }, [songId]);

  if (!song) {
    return (
      <View style={styles.container}>
        <Text style={styles.caption}>Song not found.</Text>
      </View>
    );
  }

  const updateField = (key, value) => {
    setSong((prev) => ({ ...prev, [key]: value }));
  };

  const updateSheet = (instrument, value) => {
    setSong((prev) => ({
      ...prev,
      instrumentSheets: {
        ...(prev.instrumentSheets || {}),
        [instrument]: value,
      },
    }));
  };

  const updateSectionNote = (sectionLabel, instrument, value) => {
    setSong((prev) => ({
      ...prev,
      sectionNotes: {
        ...(prev.sectionNotes || {}),
        [sectionLabel]: {
          ...((prev.sectionNotes || {})[sectionLabel] || {}),
          [instrument]: value,
        },
      },
    }));
  };

  const handleSave = async () => {
    await addOrUpdateSong(song);
  };

  const handleImportLyrics = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/plain', 'application/pdf', 'text/rtf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled) return;
    const file = picked.assets?.[0];
    if (!file?.uri) return;
    const content = await FileSystem.readAsStringAsync(file.uri);
    updateField('lyricsText', content);
  };

  const handleExportNotes = async () => {
    const filename = `${song.title || 'song'}_notes.txt`.replace(/\\s+/g, '_');
    const uri = FileSystem.documentDirectory + filename;
    const payload = song.lyricsText || '';
    await FileSystem.writeAsStringAsync(uri, payload);
    Alert.alert('Exported', `Saved to: ${uri}`);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Song Details</Text>

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={song.title || ''} onChangeText={(v) => updateField('title', v)} />

      <Text style={styles.label}>Artist</Text>
      <TextInput style={styles.input} value={song.artist || ''} onChangeText={(v) => updateField('artist', v)} />

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.label}>Original Key</Text>
          <TextInput style={styles.input} value={song.originalKey || ''} onChangeText={(v) => updateField('originalKey', v)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>BPM</Text>
          <TextInput style={styles.input} value={song.bpm ? String(song.bpm) : ''} onChangeText={(v) => updateField('bpm', v)} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.label}>Male Key</Text>
          <TextInput style={styles.input} value={song.maleKey || ''} onChangeText={(v) => updateField('maleKey', v)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Female Key</Text>
          <TextInput style={styles.input} value={song.femaleKey || ''} onChangeText={(v) => updateField('femaleKey', v)} />
        </View>
      </View>

      <Text style={styles.label}>Time Signature</Text>
      <TextInput style={styles.input} value={song.timeSig || ''} onChangeText={(v) => updateField('timeSig', v)} />

      <Text style={styles.sectionTitle}>Lyrics + Chords (Master)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={song.lyricsText || ''}
        onChangeText={(v) => updateField('lyricsText', v)}
        multiline
      />
      <View style={styles.rowButtons}>
        <PrimaryButton title="Import Lyrics File" onPress={handleImportLyrics} style={styles.secondaryButton} />
        <PrimaryButton title="Export Notes" onPress={handleExportNotes} style={styles.secondaryButton} />
      </View>

      {INSTRUMENT_SHEETS.map((instrument) => (
        <View key={instrument} style={{ marginTop: 12 }}>
          <Text style={styles.sectionTitle}>{instrument} Sheet</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={(song.instrumentSheets || {})[instrument] || ''}
            onChangeText={(v) => updateSheet(instrument, v)}
            multiline
          />
        </View>
      ))}

      {parseSections(song.lyricsText || '').length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.sectionTitle}>Per‑Section Notes</Text>
          {parseSections(song.lyricsText || '').map((section) => (
            <View key={section.label} style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              {INSTRUMENT_SHEETS.map((instrument) => (
                <View key={`${section.label}-${instrument}`} style={{ marginTop: 8 }}>
                  <Text style={styles.label}>{instrument} Notes</Text>
                  <TextInput
                    style={[styles.input, styles.textAreaSmall]}
                    value={((song.sectionNotes || {})[section.label] || {})[instrument] || ''}
                    onChangeText={(v) => updateSectionNote(section.label, instrument, v)}
                    multiline
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      <PrimaryButton title="Save Song Details" onPress={handleSave} style={{ marginTop: 16 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#020617',
  },
  heading: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  label: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#020617',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#E5E7EB',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
  },
  sectionTitle: {
    color: '#E5E7EB',
    fontWeight: '600',
    marginBottom: 6,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  textAreaSmall: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionBlock: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#111827',
    backgroundColor: '#0B1120',
  },
  sectionLabel: {
    color: '#E5E7EB',
    fontWeight: '600',
    marginBottom: 6,
  },
  rowButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  secondaryButton: {
    backgroundColor: '#111827',
    marginRight: 8,
    marginTop: 8,
  },
  caption: {
    color: '#9CA3AF',
  },
});
