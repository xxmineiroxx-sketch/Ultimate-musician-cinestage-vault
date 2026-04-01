import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import { addOrUpdateSong, deleteSong, findSongDuplicate, getSongs } from '../data/storage';
import { makeId } from '../data/models';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';

export default function LibraryScreen({ navigation }) {
  const [songs, setSongs] = useState([]);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');

  const loadSongs = async () => {
    const next = await getSongs();
    setSongs(next);
  };

  useEffect(() => {
    loadSongs();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return songs;
    return songs.filter((s) =>
      `${s.title || ''} ${s.artist || ''}`.toLowerCase().includes(term)
    );
  }, [songs, search]);

  const handleAdd = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Add a song title first.');
      return;
    }
    const existing = findSongDuplicate(songs, title, artist);
    if (existing) {
      Alert.alert('Duplicate', 'This song already exists in the library.');
      return;
    }
    const next = await addOrUpdateSong({
      id: makeId('song'),
      title: title.trim(),
      artist: artist.trim(),
      originalKey: '',
      maleKey: '',
      femaleKey: '',
      bpm: null,
      timeSig: '',
      lyricsText: '',
      instrumentSheets: {},
    });
    setTitle('');
    setArtist('');
    setSongs((prev) => [next, ...prev]);
  };

  const handleDelete = async (songId) => {
    const next = await deleteSong(songId);
    setSongs(next);
  };

  const handleImportLibrary = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled) return;
    const file = picked.assets?.[0];
    if (!file?.uri) return;
    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const workbook = XLSX.read(base64, { type: 'base64' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const normalized = rows.map((row) => {
      const keys = Object.keys(row).reduce((acc, key) => {
        acc[key.toLowerCase().trim()] = row[key];
        return acc;
      }, {});
      const titleValue = keys['song'] || keys['title'] || keys['name'] || keys['music'] || '';
      const artistValue = keys['artist'] || keys['author'] || keys['band'] || '';
      const originalKey = keys['original key'] || keys['key'] || '';
      const maleKey = keys['male key'] || keys['key (male)'] || keys['male'] || '';
      const femaleKey = keys['female key'] || keys['key (female)'] || keys['female'] || '';
      const youtube = keys['youtube'] || keys['youtube link'] || keys['url'] || '';
      return {
        title: String(titleValue).trim(),
        artist: String(artistValue).trim(),
        originalKey: String(originalKey).trim(),
        maleKey: String(maleKey).trim(),
        femaleKey: String(femaleKey).trim(),
        sourceUrl: String(youtube).trim(),
      };
    }).filter((row) => row.title);

    const current = await getSongs();
    const nextSongs = [...current];

    normalized.forEach((entry) => {
      const dup = findSongDuplicate(nextSongs, entry.title, entry.artist);
      if (dup) return;
      nextSongs.push({
        id: makeId('song'),
        title: entry.title,
        artist: entry.artist,
        originalKey: entry.originalKey,
        maleKey: entry.maleKey,
        femaleKey: entry.femaleKey,
        bpm: null,
        timeSig: '',
        sourceUrl: entry.sourceUrl,
        lyricsText: '',
        instrumentSheets: {},
      });
    });

    // Save all at once
    const { saveSongs } = await import('../data/storage');
    await saveSongs(nextSongs);
    setSongs(nextSongs);
    Alert.alert('Imported', `Imported ${normalized.length} songs.`);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Library</Text>
      <Text style={styles.caption}>Search, edit, and organize your songs.</Text>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search songs"
        placeholderTextColor="#6B7280"
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add Song</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Song title"
          placeholderTextColor="#6B7280"
        />
        <TextInput
          style={styles.input}
          value={artist}
          onChangeText={setArtist}
          placeholder="Artist (optional)"
          placeholderTextColor="#6B7280"
        />
        <PrimaryButton title="Add to Library" onPress={handleAdd} />
        <PrimaryButton title="Import Library" onPress={handleImportLibrary} style={styles.secondary} />
      </View>

      <View style={styles.list}>
        {filtered.map((song) => (
          <View key={song.id} style={styles.row}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => navigation.navigate('SongDetail', { songId: song.id })}
            >
              <Text style={styles.songTitle}>{song.title}</Text>
              <Text style={styles.songMeta}>{song.artist || 'Unknown artist'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(song.id)}>
              <Text style={styles.delete}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))}
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
  heading: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  caption: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 12,
  },
  search: {
    backgroundColor: '#0B1120',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#111827',
    color: '#E5E7EB',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#0B1120',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#111827',
  },
  cardTitle: {
    color: '#E5E7EB',
    fontWeight: '600',
    marginBottom: 8,
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
    marginBottom: 8,
  },
  secondary: {
    marginTop: 8,
    backgroundColor: '#111827',
  },
  list: {
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  songTitle: {
    color: '#F9FAFB',
    fontWeight: '600',
  },
  songMeta: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  delete: {
    color: '#F87171',
    fontSize: 12,
    paddingHorizontal: 8,
  },
});
