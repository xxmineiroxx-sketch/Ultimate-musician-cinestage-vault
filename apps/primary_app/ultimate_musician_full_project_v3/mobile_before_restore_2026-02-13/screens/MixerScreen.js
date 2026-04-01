
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import TrackFader from '../components/TrackFader';
import * as audioEngine from '../audioEngine';

export default function MixerScreen({ route, navigation }) {
  const { song, apiBase, userId } = route.params;
  const latestJob = song.latestStemsJob || song.latest_stems_job || null;
  const stems = latestJob?.result?.stems || song.stems || [];

  const [tracksState, setTracksState] = useState(() =>
    stems.map((stem) => ({
      id: stem.type,
      name: stem.name || stem.type,
      volume: 0.8,
      mute: false,
      solo: false,
    }))
  );

  const updateTrack = (updated) => {
    setTracksState((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t))
    );
  };

  const anySolo = tracksState.some((t) => t.solo);

  useEffect(() => {
    (async () => {
      try {
        await audioEngine.initEngine();
        audioEngine.setBaseUrl(apiBase || '');
        const result = latestJob?.result || {};
        await audioEngine.loadFromBackend(result);
      } catch (e) {
        console.warn('Audio engine init error', e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      await audioEngine.setMixerState(tracksState);
    })();
  }, [tracksState]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{song.title}</Text>
      <Text style={styles.subtitle}>
        {song.artist || ''} {song.bpm ? `• ${song.bpm} BPM` : ''}{' '}
        {song.key ? `• Key ${song.key}` : ''}
      </Text>

      {anySolo && (
        <View style={styles.soloBanner}>
          <Text style={styles.soloText}>Solo mode active: only S tracks are heard.</Text>
        </View>
      )}

      <FlatList
        data={tracksState}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TrackFader track={item} onChange={updateTrack} />
        )}
        style={{ marginTop: 12 }}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          navigation.navigate('Live', {
            song,
            apiBase,
            userId,
            mixerState: tracksState,
          })
        }
      >
        <Text style={styles.buttonText}>Open Live View</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    padding: 16,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  soloBanner: {
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  soloText: {
    color: '#FBBF24',
    fontSize: 12,
  },
  button: {
    marginTop: 16,
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
