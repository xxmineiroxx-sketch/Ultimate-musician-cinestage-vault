import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import Chip from '../components/Chip';
import { addOrUpdateSong, findSongDuplicate, getSettings, getSongs } from '../data/storage';
import { makeId } from '../data/models';

const STEM_OPTIONS = ['DRUMS', 'BASS', 'GUITARS', 'KEYS', 'VOCALS', 'PAD'];

export default function StemsCenterScreen({ navigation }) {
  const [apiBase, setApiBase] = useState('http://10.0.0.34:8000');
  const [userId, setUserId] = useState('demo-user');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedStems, setSelectedStems] = useState(['DRUMS', 'BASS', 'GUITARS', 'VOCALS']);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      if (settings.apiBase) setApiBase(settings.apiBase);
      if (settings.defaultUserId) setUserId(settings.defaultUserId);
    })();
  }, []);

  const toggleStem = (stem) => {
    setSelectedStems((prev) => (prev.includes(stem) ? prev.filter((s) => s !== stem) : [...prev, stem]));
  };

  const headers = () => {
    const h = { 'Content-Type': 'application/json' };
    if (userId.trim()) h['X-User-Id'] = userId.trim();
    return h;
  };

  const handleCreateAndProcess = async () => {
    if (!apiBase || !sourceUrl) {
      Alert.alert('Missing info', 'Backend URL and source URL are required.');
      return;
    }
    setLoading(true);
    try {
      const resJob = await fetch(`${apiBase}/jobs`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          user_id: userId,
          title: title || 'Imported Stems',
          file_url: sourceUrl,
        }),
      });
      const job = await resJob.json();
      if (!resJob.ok) throw new Error(JSON.stringify(job));

      let current = job;
      let attempts = 0;
      while (current.status === 'PENDING' || current.status === 'RUNNING') {
        await new Promise((r) => setTimeout(r, 1500));
        attempts += 1;
        const poll = await fetch(`${apiBase}/jobs/${job.id}`, { headers: headers() });
        const pollJson = await poll.json();
        if (!poll.ok) throw new Error(JSON.stringify(pollJson));
        current = pollJson;
        if (attempts > 80) break;
      }

      if (current.status !== 'COMPLETED') {
        Alert.alert('Processing error', `Job ended with status: ${current.status}`);
        setLoading(false);
        return;
      }

      const result = current.result || {};
      const songs = await getSongs();
      const existing = findSongDuplicate(songs, result.title || title, result.artist || artist);
      if (existing) {
        Alert.alert('Duplicate', 'This song already exists in the library.');
      }

      const saved = await addOrUpdateSong({
        id: makeId('song'),
        title: result.title || title || 'Imported Stems',
        artist: result.artist || artist || '',
        originalKey: current.key || result.key || '',
        maleKey: '',
        femaleKey: '',
        bpm: current.bpm || result.bpm || null,
        timeSig: result.time_signature || '',
        stems: result.stems || [],
        latestStemsJob: current,
        lyricsText: '',
        instrumentSheets: {},
      });

      setLoading(false);
      navigation.navigate('Mixer', { song: saved, apiBase, userId });
    } catch (e) {
      console.error(e);
      setLoading(false);
      Alert.alert('Error', String(e.message || e));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Stems Center</Text>
      <Text style={styles.caption}>Download stems from URL or upload a ZIP (coming next).</Text>

      <Text style={styles.label}>Backend URL</Text>
      <TextInput
        style={styles.input}
        value={apiBase}
        onChangeText={setApiBase}
        placeholder="http://10.0.0.34:8000"
        placeholderTextColor="#6B7280"
      />

      <Text style={styles.label}>User ID</Text>
      <TextInput
        style={styles.input}
        value={userId}
        onChangeText={setUserId}
        placeholder="demo-user"
        placeholderTextColor="#6B7280"
      />

      <Text style={styles.label}>Song Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Gratitude"
        placeholderTextColor="#6B7280"
      />

      <Text style={styles.label}>Artist (optional)</Text>
      <TextInput
        style={styles.input}
        value={artist}
        onChangeText={setArtist}
        placeholder="Brandon Lake"
        placeholderTextColor="#6B7280"
      />

      <Text style={styles.label}>Source URL</Text>
      <TextInput
        style={styles.input}
        value={sourceUrl}
        onChangeText={setSourceUrl}
        placeholder="https://youtube.com/watch?v=..."
        placeholderTextColor="#6B7280"
      />

      <Text style={styles.label}>Stems to Generate</Text>
      <View style={styles.stemsRow}>
        {STEM_OPTIONS.map((stem) => (
          <Chip
            key={stem}
            label={stem}
            selected={selectedStems.includes(stem)}
            onPress={() => toggleStem(stem)}
          />
        ))}
      </View>

      <PrimaryButton
        title={loading ? 'Processing...' : 'Download Stems (URL)'}
        onPress={handleCreateAndProcess}
        disabled={loading}
      />
      <PrimaryButton
        title="Upload ZIP (Local)"
        onPress={() => Alert.alert('Coming soon', 'ZIP upload will be wired next.')}
        style={styles.secondary}
      />

      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.overlayText}>CineStage is processing...</Text>
        </View>
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
  heading: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  caption: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 16,
  },
  label: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 4,
    marginTop: 10,
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
  stemsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    marginBottom: 8,
  },
  secondary: {
    marginTop: 10,
    backgroundColor: '#111827',
  },
  overlay: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  overlayText: {
    color: '#E5E7EB',
    fontSize: 12,
    marginLeft: 10,
  },
});
