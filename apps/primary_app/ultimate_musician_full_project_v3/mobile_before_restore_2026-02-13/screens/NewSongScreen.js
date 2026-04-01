
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';

const STEM_OPTIONS = ['DRUMS', 'BASS', 'GUITARS', 'KEYS', 'VOCALS', 'PAD'];
const API_BASE_DEFAULT = 'http://localhost:8000';

export default function NewSongScreen({ navigation }) {
  const [apiBase, setApiBase] = useState(API_BASE_DEFAULT);
  const [userId, setUserId] = useState('demo-user');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedStems, setSelectedStems] = useState(['DRUMS', 'BASS', 'GUITARS', 'VOCALS']);
  const [loading, setLoading] = useState(false);

  const toggleStem = (stem) => {
    setSelectedStems((prev) =>
      prev.includes(stem) ? prev.filter((s) => s !== stem) : [...prev, stem]
    );
  };

  const headers = () => {
    const h = { 'Content-Type': 'application/json' };
    if (userId.trim()) h['X-User-Id'] = userId.trim();
    return h;
  };

  const handleCreateAndProcess = async () => {
    if (!apiBase || !title || !sourceUrl) {
      Alert.alert('Missing info', 'Backend URL, title and source URL are required.');
      return;
    }
    setLoading(true);
    try {
      const resSong = await fetch(`${apiBase}/songs`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          title,
          artist: artist || null,
          sourceType: 'YOUTUBE',
          sourceUrl,
        }),
      });
      const jsonSong = await resSong.json();
      if (!resSong.ok) throw new Error(JSON.stringify(jsonSong));
      const songId = jsonSong.id;

      const resJob = await fetch(`${apiBase}/songs/${songId}/stems-jobs`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          requested_stems: selectedStems,
        }),
      });
      const jsonJob = await resJob.json();
      if (!resJob.ok) throw new Error(JSON.stringify(jsonJob));
      const jobId = jsonJob.id;

      let attempts = 0;
      let job = jsonJob;
      while (job.status === 'PENDING' || job.status === 'RUNNING') {
        await new Promise((r) => setTimeout(r, 1500));
        attempts += 1;
        const resPoll = await fetch(
          `${apiBase}/songs/${songId}/stems-jobs/${jobId}`,
          { headers: headers() }
        );
        const jsonPoll = await resPoll.json();
        if (!resPoll.ok) throw new Error(JSON.stringify(jsonPoll));
        job = jsonPoll;
        if (attempts > 40) break;
      }

      if (job.status !== 'COMPLETED') {
        Alert.alert('Processing error', `Job ended with status: ${job.status}`);
        setLoading(false);
        return;
      }

      const resSongFull = await fetch(`${apiBase}/songs/${songId}`, {
        headers: headers(),
      });
      const songFull = await resSongFull.json();
      if (!resSongFull.ok) throw new Error(JSON.stringify(songFull));

      setLoading(false);
      navigation.navigate('Mixer', { song: songFull, apiBase, userId });
    } catch (e) {
      console.error(e);
      setLoading(false);
      Alert.alert('Error', String(e.message || e));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>New Song</Text>
      <Text style={styles.caption}>
        Enter a YouTube or audio URL. We will create a song, generate stems, and take you to the mixer.
      </Text>

      <Text style={styles.label}>Backend URL</Text>
      <TextInput
        style={styles.input}
        value={apiBase}
        onChangeText={setApiBase}
        placeholder="http://localhost:8000"
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
        {STEM_OPTIONS.map((stem) => {
          const selected = selectedStems.includes(stem);
          return (
            <TouchableOpacity
              key={stem}
              onPress={() => toggleStem(stem)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {stem}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.6 }]}
        onPress={handleCreateAndProcess}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Create & Generate Stems</Text>
        )}
      </TouchableOpacity>
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
    fontSize: 13,
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
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  chipText: {
    color: '#E5E7EB',
    fontSize: 12,
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#4F46E5',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
