
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import TrackFader from '../components/TrackFader';
import CineStageProcessingOverlay from '../components/CineStageProcessingOverlay';
import * as audioEngine from '../audioEngine';
import { useTheme } from '../context/ThemeContext';

export default function MixerScreen({ route, navigation }) {
  const { song, apiBase, userId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const stems = song.latest_stems_job?.result?.stems || [];

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

  const [processingVisible, setProcessingVisible] = useState(true);
  const [processingStep, setProcessingStep] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(undefined);

  useEffect(() => {
    (async () => {
      setProcessingVisible(true);
      setProcessingStep(0);
      setProcessingProgress(10);
      try {
        // Step 0: reading scene (aka: getting stem/session payload)
        setProcessingStep(0);
        setProcessingProgress(15);

        // Step 1: initializing engine
        setProcessingStep(1);
        setProcessingProgress(30);
        await audioEngine.initEngine();

        // Step 2: applying routing/state (loading stems/session)
        setProcessingStep(2);
        setProcessingProgress(60);
        const result = song.latestStemsJob?.result || song.latest_stems_job?.result || {};
        await audioEngine.loadFromBackend(result, apiBase);

        // Step 3: saving system map (placeholder for Ultimate Mixer Controller)
        setProcessingStep(3);
        setProcessingProgress(90);
      } catch (e) {
        console.warn('Audio engine init error', e);
      }
      setProcessingProgress(100);
      setTimeout(() => setProcessingVisible(false), 250);
    })();
  }, []);

  useEffect(() => {
    audioEngine.setMixerState(tracksState);
  }, [tracksState]);

  return (
    <View style={styles.container}>
      <CineStageProcessingOverlay
        visible={processingVisible}
        title="CineStage™ is processing"
        subtitle="Wait — we'll let you know when it's done."
        steps={['Initializing audio engine', 'Loading stem tracks', 'Calibrating mixer', 'Ready']}
        currentStepIndex={processingStep}
        progress={processingProgress}
      />
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

const makeStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  soloBanner: {
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.borderAlt,
  },
  soloText: {
    color: '#FBBF24',
    fontSize: 12,
  },
  button: {
    marginTop: 16,
    backgroundColor: colors.pillActive,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
