import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as audioEngine from '../audioEngine';
import CineStageProcessingOverlay from '../components/CineStageProcessingOverlay';

const LOAD_STEPS = ['Initializing audio', 'Loading stems', 'Ready'];

const ROLE_COLORS = {
  Vocals: '#F472B6',
  Guitar: '#FB923C',
  Bass: '#60A5FA',
  Drums: '#34D399',
  Keys: '#A78BFA',
  Other: '#FBBF24',
};

const STEM_COLORS = {
  vocals: '#F472B6',
  drums: '#34D399',
  bass: '#60A5FA',
  keys: '#A78BFA',
  guitars: '#FB923C',
  full_mix: '#818CF8',
  other: '#FBBF24',
};

function stemColor(type) {
  return STEM_COLORS[(type || '').toLowerCase()] || '#94A3B8';
}

function stemLabel(type) {
  const map = {
    vocals: 'Vocals', drums: 'Drums', bass: 'Bass',
    keys: 'Keys', guitars: 'Guitars', full_mix: 'Full Mix', other: 'Other',
  };
  return map[(type || '').toLowerCase()] || (type || '').toUpperCase();
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function buildTracks(result) {
  const raw = result?.stems;
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
    ? Object.entries(raw).map(([type, url]) => ({ type, url }))
    : [];
  return arr.map((s) => ({
    id: s.type,
    type: s.type,
    label: stemLabel(s.type),
    color: stemColor(s.type),
    mute: false,
    solo: false,
  }));
}

export default function RehearsalScreen({ route, navigation }) {
  const { song, apiBase } = route.params || {};

  // ── Audio loading ──
  const [loading, setLoading] = useState(true);
  const [loadStep, setLoadStep] = useState(0);
  const [loadProgress, setLoadProgress] = useState(0);

  // ── Playback ──
  const [tracks, setTracks] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const pollRef = useRef(null);

  // ── Parts ──
  const [selectedRole, setSelectedRole] = useState(null);
  const sections = song?.sections || [];
  const roles = Object.keys(ROLE_COLORS);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
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
        setLoadStep(0);
        setLoadProgress(15);
        await audioEngine.initEngine();

        setLoadStep(1);
        setLoadProgress(40);

        const jobResult = song?.latestStemsJob?.result;
        const initialTracks = buildTracks(jobResult);

        if (jobResult?.stems && (Array.isArray(jobResult.stems) ? jobResult.stems.length : Object.keys(jobResult.stems).length) > 0) {
          await audioEngine.loadFromBackend(jobResult, apiBase || 'http://localhost:8000');
        }

        if (cancelled) return;
        setTracks(initialTracks);
        if (initialTracks.length > 0) audioEngine.setMixerState(initialTracks);

        const dur = await audioEngine.getDuration();
        if (!cancelled) setDuration(dur);

        setLoadStep(2);
        setLoadProgress(100);
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.warn('Rehearsal load error', e);
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

  useEffect(() => {
    if (tracks.length > 0) audioEngine.setMixerState(tracks);
  }, [tracks]);

  function toggleTrackMute(id) {
    setTracks((prev) => prev.map((t) => t.id === id ? { ...t, mute: !t.mute } : t));
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
    const dur = await audioEngine.getDuration();
    setDuration(dur);
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <CineStageProcessingOverlay
          visible
          title="Opening Rehearsal"
          subtitle="Loading your stems for playback..."
          steps={LOAD_STEPS}
          currentStepIndex={loadStep}
          progress={loadProgress}
        />
      </View>
    );
  }

  const meta = [
    song?.bpm && `${song.bpm} BPM`,
    (song?.originalKey || song?.key) && `Key of ${song?.originalKey || song?.key}`,
    song?.timeSig && song.timeSig,
  ].filter(Boolean).join('  ·  ');

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

      {/* ── Header ── */}
      <Text style={styles.songTitle}>{song?.title || 'Rehearsal'}</Text>
      {song?.artist ? <Text style={styles.songArtist}>{song.artist}</Text> : null}
      {meta ? <Text style={styles.songMeta}>{meta}</Text> : null}

      {/* ── Transport ── */}
      <View style={styles.transportCard}>
        <View style={styles.timeRow}>
          <Text style={styles.timePos}>{formatTime(position)}</Text>
          <Text style={styles.timeSep}> / </Text>
          <Text style={styles.timeDur}>{formatTime(duration)}</Text>
        </View>
        <View style={styles.transportBtns}>
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.7}>
            <Text style={styles.stopIcon}>⏹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.playBtn} onPress={handlePlayPause} activeOpacity={0.7}>
            <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
        </View>
        {tracks.length === 0 && (
          <Text style={styles.noStemsHint}>No stems loaded — add a YouTube link and run CineStage™ to enable playback.</Text>
        )}
      </View>

      {/* ── Stem track mutes ── */}
      {tracks.length > 0 && (
        <View style={styles.stemSection}>
          <Text style={styles.stemSectionTitle}>Tracks</Text>
          <View style={styles.stemRow}>
            {tracks.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.stemChip, t.mute && styles.stemChipMuted]}
                onPress={() => toggleTrackMute(t.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.stemDot, { backgroundColor: t.color }]} />
                <Text style={[styles.stemChipText, t.mute && styles.stemChipTextMuted]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.stemHint}>Tap a track to mute / unmute</Text>
        </View>
      )}

      {/* ── Role selector ── */}
      {sections.length > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.arrangTitle}>Song Map</Text>
          <Text style={styles.arrangSub}>Select your role to see your part for each section.</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleScroll}>
            <TouchableOpacity
              style={[styles.roleChip, !selectedRole && styles.roleChipActive]}
              onPress={() => setSelectedRole(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.roleChipText, !selectedRole && styles.roleChipTextActive]}>All</Text>
            </TouchableOpacity>
            {roles.map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.roleChip,
                  selectedRole === r && { backgroundColor: ROLE_COLORS[r] + '22', borderColor: ROLE_COLORS[r] },
                ]}
                onPress={() => setSelectedRole(selectedRole === r ? null : r)}
                activeOpacity={0.7}
              >
                <View style={[styles.roleDot, { backgroundColor: ROLE_COLORS[r] }]} />
                <Text style={[styles.roleChipText, selectedRole === r && { color: ROLE_COLORS[r], fontWeight: '700' }]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Sections */}
          {sections.map((sec) => {
            const roleNote = selectedRole ? (sec.parts?.[selectedRole] || '') : null;
            return (
              <View key={sec.id} style={styles.sectionCard}>
                <Text style={styles.sectionName}>{sec.name}</Text>

                {selectedRole ? (
                  <View style={[styles.partBox, { borderColor: ROLE_COLORS[selectedRole] + '55' }]}>
                    <View style={styles.partBoxHeader}>
                      <View style={[styles.roleDot, { backgroundColor: ROLE_COLORS[selectedRole] }]} />
                      <Text style={[styles.partBoxRole, { color: ROLE_COLORS[selectedRole] }]}>{selectedRole}</Text>
                    </View>
                    <Text style={styles.partNote}>{roleNote || '—'}</Text>
                  </View>
                ) : (
                  <View style={styles.allPartsGrid}>
                    {roles.map((r) => {
                      const note = sec.parts?.[r] || '';
                      if (!note) return null;
                      return (
                        <View key={r} style={styles.allPartRow}>
                          <View style={[styles.roleDot, { backgroundColor: ROLE_COLORS[r] }]} />
                          <Text style={styles.allPartRole}>{r}</Text>
                          <Text style={styles.allPartNote} numberOfLines={2}>{note}</Text>
                        </View>
                      );
                    })}
                    {roles.every((r) => !sec.parts?.[r]) && (
                      <Text style={styles.noPartsHint}>No parts added for this section.</Text>
                    )}
                  </View>
                )}

                {sec.content ? (
                  <Text style={styles.sectionChart}>{sec.content}</Text>
                ) : null}
              </View>
            );
          })}
        </>
      )}

      {sections.length === 0 && (
        <View style={styles.emptyArrange}>
          <Text style={styles.emptyArrangeText}>
            No sections yet — open Song Detail and paste the chord chart, then tap Auto Recognize.
          </Text>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  container: { padding: 20, paddingBottom: 60 },

  songTitle: { color: '#F9FAFB', fontSize: 22, fontWeight: '800' },
  songArtist: { color: '#9CA3AF', fontSize: 14, marginTop: 3 },
  songMeta: { color: '#4B5563', fontSize: 12, marginTop: 4 },

  transportCard: {
    backgroundColor: '#0B1120',
    borderRadius: 16,
    padding: 18,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
  },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 14 },
  timePos: { color: '#F9FAFB', fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timeSep: { color: '#374151', fontSize: 22, marginHorizontal: 4 },
  timeDur: { color: '#6B7280', fontSize: 20, fontVariant: ['tabular-nums'] },
  transportBtns: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  stopBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center',
  },
  stopIcon: { fontSize: 18 },
  playBtn: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center',
  },
  playIcon: { fontSize: 28, color: '#FFFFFF' },
  noStemsHint: {
    color: '#4B5563', fontSize: 12, textAlign: 'center',
    marginTop: 14, lineHeight: 18,
  },

  stemSection: { marginTop: 20 },
  stemSectionTitle: { color: '#E5E7EB', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  stemRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stemChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999, backgroundColor: '#0F172A',
    borderWidth: 1, borderColor: '#1F2937',
  },
  stemChipMuted: { opacity: 0.4 },
  stemDot: { width: 9, height: 9, borderRadius: 5 },
  stemChipText: { color: '#E5E7EB', fontSize: 13, fontWeight: '600' },
  stemChipTextMuted: { color: '#6B7280' },
  stemHint: { color: '#374151', fontSize: 11, marginTop: 8 },

  divider: { height: 1, backgroundColor: '#111827', marginVertical: 22 },

  arrangTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  arrangSub: { color: '#6B7280', fontSize: 12, marginBottom: 14, lineHeight: 18 },

  roleScroll: { gap: 8, paddingBottom: 4 },
  roleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, backgroundColor: '#0F172A',
    borderWidth: 1, borderColor: '#1F2937',
  },
  roleChipActive: { backgroundColor: '#1E1B4B', borderColor: '#4338CA' },
  roleChipText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  roleChipTextActive: { color: '#818CF8' },
  roleDot: { width: 8, height: 8, borderRadius: 4 },

  sectionCard: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
    marginTop: 10,
  },
  sectionName: {
    color: '#818CF8', fontSize: 14, fontWeight: '700',
    textTransform: 'capitalize', marginBottom: 8,
  },

  partBox: {
    borderRadius: 8, borderWidth: 1,
    backgroundColor: '#060D1A', padding: 12, marginBottom: 8,
  },
  partBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  partBoxRole: { fontWeight: '700', fontSize: 13 },
  partNote: { color: '#E5E7EB', fontSize: 14, lineHeight: 22 },

  allPartsGrid: { gap: 0 },
  allPartRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#111827',
  },
  allPartRole: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 54, paddingTop: 1 },
  allPartNote: { color: '#D1D5DB', fontSize: 13, flex: 1, lineHeight: 20 },
  noPartsHint: { color: '#374151', fontSize: 12, fontStyle: 'italic', paddingVertical: 4 },

  sectionChart: {
    color: '#4B5563', fontSize: 12, fontFamily: 'monospace',
    lineHeight: 20, marginTop: 10,
    borderTopWidth: 1, borderTopColor: '#111827', paddingTop: 8,
  },

  emptyArrange: { marginTop: 24, padding: 16, borderRadius: 10, backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#1F2937' },
  emptyArrangeText: { color: '#4B5563', fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
