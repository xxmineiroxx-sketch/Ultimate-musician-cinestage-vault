import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import * as audioEngine from '../audioEngine';
import CineStageProcessingOverlay from '../components/CineStageProcessingOverlay';

const LOAD_STEPS = [
  'Initializing audio engine',
  'Loading stem tracks',
  'Calibrating mixer',
  'Ready',
];

const STEM_COLORS = {
  vocals: '#F472B6',
  drums: '#34D399',
  bass: '#60A5FA',
  keys: '#A78BFA',
  guitars: '#FB923C',
  other: '#FBBF24',
};

const STEM_LABELS = {
  vocals: 'Vocals',
  drums: 'Drums',
  bass: 'Bass',
  keys: 'Keys',
  guitars: 'Guitars',
  other: 'Other',
};

function stemColorFor(nameOrType) {
  const key = (nameOrType || '').toLowerCase();
  return STEM_COLORS[key] || '#94A3B8';
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function buildTracksFromBackend(result) {
  // Normalise stems: backend may return a dict { vocals: url } or array [{ type, url }]
  const rawStems = result?.stems;
  const stemsArray = Array.isArray(rawStems)
    ? rawStems
    : rawStems && typeof rawStems === 'object'
    ? Object.entries(rawStems).map(([type, url]) => ({ type, url }))
    : [];

  return stemsArray.map((stem) => ({
    id: stem.type,
    name: STEM_LABELS[stem.type] || stem.name || stem.type,
    color: stemColorFor(stem.type),
    uri: stem.url,
    volume: 1,
    mute: false,
    solo: false,
  }));
}

function buildTracksFromLocal(localStems) {
  return Object.entries(localStems || {}).map(([name, info]) => ({
    id: `local_${name.toLowerCase()}`,
    name,
    color: stemColorFor(name),
    uri: info.localUri,
    volume: 1,
    mute: false,
    solo: false,
  }));
}

export default function StemMixerScreen({ route, navigation }) {
  const { song, apiBase } = route.params || {};

  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadStep, setLoadStep] = useState(0);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const pos = await audioEngine.getPosition();
      setPosition(pos);
      const dur = await audioEngine.getDuration();
      if (dur > 0 && pos >= dur - 0.3) {
        stopPolling();
        await audioEngine.stop();
        setIsPlaying(false);
        setPosition(0);
      }
    }, 500);
  }, [stopPolling]);

  // Load stems on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Step 0: Initializing audio engine
        setLoadStep(0);
        setLoadProgress(10);
        await audioEngine.initEngine();

        // Step 1: Loading stem tracks
        setLoadStep(1);
        setLoadProgress(35);

        const localStems = song?.localStems;
        const hasLocal = localStems && Object.keys(localStems).length > 0;
        const jobResult = song?.latestStemsJob?.result;
        const rawStems = jobResult?.stems;
        const hasBackend = Array.isArray(rawStems)
          ? rawStems.length > 0
          : rawStems && typeof rawStems === 'object'
          ? Object.keys(rawStems).length > 0
          : false;

        let initialTracks = [];

        if (hasLocal) {
          initialTracks = buildTracksFromLocal(localStems);
          await audioEngine.loadCustomTracks(
            initialTracks.map((t) => ({ id: t.id, uri: t.uri }))
          );
        } else if (hasBackend) {
          initialTracks = buildTracksFromBackend(jobResult);
          await audioEngine.loadFromBackend(jobResult, apiBase || '');
        }

        // Step 2: Calibrating mixer
        setLoadStep(2);
        setLoadProgress(75);

        if (cancelled) return;
        setTracks(initialTracks);
        audioEngine.setMixerState(initialTracks);

        const dur = await audioEngine.getDuration();
        if (!cancelled) setDuration(dur);

        // Step 3: Ready
        setLoadStep(3);
        setLoadProgress(100);
        await new Promise((r) => setTimeout(r, 600));
      } catch (e) {
        console.warn('StemMixer load error', e);
        if (!cancelled) Alert.alert('Load Error', String(e.message || e));
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      stopPolling();
      audioEngine.stop().catch(() => {});
    };
  }, []);

  // Sync mixer engine whenever track state changes
  useEffect(() => {
    if (tracks.length > 0) audioEngine.setMixerState(tracks);
  }, [tracks]);

  function updateTrack(updated) {
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function handlePlayPause() {
    if (isPlaying) {
      await audioEngine.pause();
      stopPolling();
      setIsPlaying(false);
    } else {
      audioEngine.play();
      setIsPlaying(true);
      startPolling();
    }
  }

  async function handleStop() {
    await audioEngine.stop();
    stopPolling();
    setIsPlaying(false);
    setPosition(0);
    setSeekValue(0);
    const dur = await audioEngine.getDuration();
    setDuration(dur);
  }

  const anySolo = tracks.some((t) => t.solo);
  const displayPos = isSeeking ? seekValue : position;

  // ── Loading state — shown as CineStage overlay over blank screen ──
  if (loading) {
    return (
      <View style={styles.container}>
        <CineStageProcessingOverlay
          visible
          title="CineStage™ is processing"
          subtitle="Wait — we'll let you know when it's done."
          steps={LOAD_STEPS}
          currentStepIndex={loadStep}
          progress={loadProgress}
        />
      </View>
    );
  }

  // ── Empty state ──
  if (tracks.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No stems loaded</Text>
        <Text style={styles.emptyCaption}>
          Add local stem files from the Stems Center, or import stems from a URL.
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back to Stems Center</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Song header */}
      <View style={styles.header}>
        <Text style={styles.songTitle} numberOfLines={1}>{song?.title || 'Untitled'}</Text>
        <Text style={styles.songMeta}>
          {[
            song?.artist,
            song?.bpm && `${song.bpm} BPM`,
            song?.originalKey && `Key of ${song.originalKey}`,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
      </View>

      {/* Transport card */}
      <View style={styles.transportCard}>
        {/* Time display */}
        <View style={styles.timeRow}>
          <Text style={styles.timePos}>{formatTime(displayPos)}</Text>
          <Text style={styles.timeSep}> / </Text>
          <Text style={styles.timeDur}>{formatTime(duration)}</Text>
        </View>

        {/* Seek slider */}
        <Slider
          style={styles.seekSlider}
          minimumValue={0}
          maximumValue={Math.max(duration, 1)}
          value={displayPos}
          minimumTrackTintColor="#6366F1"
          maximumTrackTintColor="#1F2937"
          thumbTintColor="#E5E7EB"
          onSlidingStart={(v) => { setIsSeeking(true); setSeekValue(v); }}
          onValueChange={(v) => setSeekValue(v)}
          onSlidingComplete={(v) => {
            setIsSeeking(false);
            setPosition(v);
            audioEngine.seek(v);
          }}
        />

        {/* Control buttons */}
        <View style={styles.transportBtns}>
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.7}>
            <Text style={styles.stopIcon}>⏹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.playBtn} onPress={handlePlayPause} activeOpacity={0.7}>
            <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Solo banner */}
      {anySolo && (
        <View style={styles.soloBanner}>
          <Text style={styles.soloText}>Solo active — only soloed tracks are audible</Text>
        </View>
      )}

      {/* Track list */}
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.trackList}
        renderItem={({ item }) => (
          <View style={styles.trackCard}>
            <View style={styles.trackHeader}>
              <View style={[styles.colorDot, { backgroundColor: item.color }]} />
              <Text style={styles.trackName}>{item.name}</Text>
              <View style={styles.smBtns}>
                <TouchableOpacity
                  style={[styles.smBtn, item.solo && styles.smBtnSolo]}
                  onPress={() => updateTrack({ ...item, solo: !item.solo })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.smLabel, item.solo && styles.smLabelActive]}>S</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smBtn, item.mute && styles.smBtnMute]}
                  onPress={() => updateTrack({ ...item, mute: !item.mute })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.smLabel, item.mute && styles.smLabelActive]}>M</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.volRow}>
              <Text style={styles.volPct}>{Math.round(item.volume * 100)}%</Text>
              <Slider
                style={styles.volSlider}
                minimumValue={0}
                maximumValue={1}
                value={item.volume}
                minimumTrackTintColor={item.color}
                maximumTrackTintColor="#1F2937"
                thumbTintColor="#E5E7EB"
                onValueChange={(v) => updateTrack({ ...item, volume: v })}
              />
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },

  center: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: { color: '#F9FAFB', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyCaption: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  backBtn: {
    marginTop: 24,
    backgroundColor: '#1F2937',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  backBtnText: { color: '#E5E7EB', fontSize: 14 },

  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  songTitle: { color: '#F9FAFB', fontSize: 20, fontWeight: '700' },
  songMeta: { color: '#6B7280', fontSize: 12, marginTop: 3 },

  transportCard: {
    backgroundColor: '#0B1120',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 2,
  },
  timePos: {
    color: '#F9FAFB',
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timeSep: { color: '#4B5563', fontSize: 20, marginHorizontal: 4 },
  timeDur: {
    color: '#6B7280',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  seekSlider: { height: 38, marginHorizontal: -6, marginTop: 4 },
  transportBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 20,
  },
  stopBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: { fontSize: 18 },
  playBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { fontSize: 24, color: '#FFFFFF' },

  soloBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#1C1917',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#FBBF2440',
  },
  soloText: { color: '#FBBF24', fontSize: 12, textAlign: 'center' },

  trackList: { padding: 16, paddingBottom: 40 },
  trackCard: {
    backgroundColor: '#0B1120',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#111827',
  },
  trackHeader: { flexDirection: 'row', alignItems: 'center' },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  trackName: { flex: 1, color: '#F9FAFB', fontWeight: '600', fontSize: 15 },
  smBtns: { flexDirection: 'row', gap: 8 },
  smBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smBtnSolo: { backgroundColor: '#FBBF24' },
  smBtnMute: { backgroundColor: '#EF4444' },
  smLabel: { color: '#9CA3AF', fontWeight: '700', fontSize: 13 },
  smLabelActive: { color: '#000000' },

  volRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  volPct: { width: 42, color: '#6B7280', fontSize: 11, textAlign: 'right', marginRight: 4 },
  volSlider: { flex: 1, height: 36 },
});
