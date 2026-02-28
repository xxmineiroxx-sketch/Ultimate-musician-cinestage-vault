import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getSongs, getSettings, addOrUpdateSong, findSongDuplicate } from '../data/storage';
import { ensureCifrasSeeded, removeCifrasSongs, getCifrasCount } from '../data/cifrasSeed';
import { makeId } from '../data/models';
import CineStageProcessingOverlay from '../components/CineStageProcessingOverlay';

const CINESTAGE_STEPS = [
  'Collecting song info',
  'Separating stems',
  'Preparing tracks',
  'Job done!',
];

const STEM_COLORS = {
  vocals: '#F472B6',
  drums: '#34D399',
  bass: '#60A5FA',
  keys: '#A78BFA',
  guitars: '#FB923C',
  other: '#FBBF24',
};

function stemDotColor(name) {
  return STEM_COLORS[(name || '').toLowerCase()] || '#94A3B8';
}

function getStemKeys(song) {
  const local = Object.keys(song.localStems || {});
  if (local.length > 0) return local;
  const raw = song.latestStemsJob?.result?.stems;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => s.type || s.name || '');
  if (typeof raw === 'object') return Object.keys(raw);
  return [];
}

function StemBadges({ song }) {
  const keys = getStemKeys(song);
  if (!keys.length) return null;
  return (
    <View style={styles.badgeRow}>
      {keys.slice(0, 6).map((k) => (
        <View key={k} style={[styles.stemDot, { backgroundColor: stemDotColor(k) }]} />
      ))}
      <Text style={styles.stemLabel}>{keys.length} stem{keys.length !== 1 ? 's' : ''}</Text>
    </View>
  );
}

export default function LibraryScreen({ navigation }) {
  const [songs, setSongs]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [query, setQuery]         = useState('');
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);

  // API settings
  const [apiBase, setApiBase] = useState('http://localhost:8000');
  const [userId, setUserId] = useState('demo-user');

  // URL input modal
  const [urlModalSong, setUrlModalSong] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');

  // CineStage processing
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);

  const loadSongs = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getSongs();
      setSongs(all);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      if (settings.apiBase) setApiBase(settings.apiBase);
      if (settings.defaultUserId) setUserId(settings.defaultUserId);
    })();
  }, []);

  // Refresh list whenever this screen comes into focus (e.g. after editing a song)
  useFocusEffect(
    useCallback(() => {
      loadSongs();
    }, [loadSongs])
  );

  const filtered = query.trim()
    ? songs.filter(
        (s) =>
          (s.title || '').toLowerCase().includes(query.toLowerCase()) ||
          (s.artist || '').toLowerCase().includes(query.toLowerCase())
      )
    : songs;

  // ── Import INCC Cifras library ──
  const handleImportCifras = async () => {
    setImporting(true);
    const result = await ensureCifrasSeeded();
    setImporting(false);
    if (result.status === 'already_seeded') {
      Alert.alert('Already Imported', `The INCC church library (${getCifrasCount()} songs) is already in your library.`);
    } else if (result.status === 'seeded') {
      setImportDone(true);
      await loadSongs();
      Alert.alert('Library Imported! 🎉', `Added ${result.count} songs from the INCC Cifras collection to your library.`);
    } else {
      Alert.alert('Error', result.error || 'Could not import library.');
    }
  };

  // ── Open URL input modal ──
  function openCineStageModal(song) {
    setUrlModalSong(song);
    setSourceUrl('');
  }

  function closeCineStageModal() {
    setUrlModalSong(null);
    setSourceUrl('');
  }

  // ── Run CineStage from Library ──
  async function startProcessing() {
    if (!sourceUrl.trim()) {
      Alert.alert('Source URL required', 'Paste a YouTube or audio URL to separate stems.');
      return;
    }

    const song = urlModalSong;
    closeCineStageModal();

    // Step 0 — Collecting song info
    setProcessingStep(0);
    setProcessingProgress(5);
    setProcessing(true);

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(userId.trim() ? { 'X-User-Id': userId.trim() } : {}),
      };

      const resJob = await fetch(`${apiBase}/jobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: userId,
          title: song.title || 'Imported Stems',
          file_url: sourceUrl.trim(),
        }),
      });
      const job = await resJob.json();
      if (!resJob.ok) throw new Error(JSON.stringify(job));

      setProcessingProgress(20);

      let current = job;
      let attempts = 0;
      let lastStatus = current.status;

      while (current.status === 'PENDING' || current.status === 'PROCESSING') {
        await new Promise((r) => setTimeout(r, 1500));
        attempts += 1;

        const poll = await fetch(`${apiBase}/jobs/${job.id}`, { headers });
        const pollJson = await poll.json();
        if (!poll.ok) throw new Error(JSON.stringify(pollJson));
        current = pollJson;

        if (current.status === 'PENDING') {
          setProcessingStep(0);
          setProcessingProgress(Math.min(28, 20 + attempts * 2));
        } else if (current.status === 'PROCESSING') {
          if (lastStatus !== 'PROCESSING') {
            setProcessingStep(1);
            setProcessingProgress(30);
          } else {
            setProcessingProgress((prev) => Math.min(82, prev + 0.8));
          }
        }

        lastStatus = current.status;
        if (attempts > 80) break;
      }

      if (current.status !== 'COMPLETED') {
        setProcessing(false);
        Alert.alert('Processing error', `Job ended with status: ${current.status}`);
        return;
      }

      // Step 2 — Preparing tracks
      setProcessingStep(2);
      setProcessingProgress(90);

      const result = current.result || {};
      const allSongs = await getSongs();
      const existing = findSongDuplicate(
        allSongs,
        result.title || song.title,
        result.artist || song.artist
      );

      const saved = await addOrUpdateSong({
        id: existing?.id || song.id || makeId('song'),
        ...(existing || song),
        originalKey: current.key || result.key || song.originalKey || '',
        bpm: current.bpm || result.bpm || song.bpm || null,
        latestStemsJob: current,
      });

      // Step 3 — Job done!
      setProcessingStep(3);
      setProcessingProgress(100);

      await loadSongs();

      // Let user read "Job done!" for a moment
      await new Promise((r) => setTimeout(r, 1000));

      setProcessing(false);

      navigation.navigate('Rehearsal', { song: saved, apiBase });
    } catch (e) {
      console.error(e);
      setProcessing(false);
      Alert.alert('Error', String(e.message || e));
    }
  }

  // ── Render ──
  return (
    <View style={styles.root}>
      {/* Breadcrumb */}
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.navLink}>Planning Center</Text>
        </TouchableOpacity>
        <Text style={styles.navSep}>›</Text>
        <Text style={styles.navActive}>Library</Text>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>Library</Text>
        <TouchableOpacity
          style={styles.addSongBtn}
          onPress={() => navigation.navigate('SongDetail', { song: null })}
          activeOpacity={0.8}
        >
          <Text style={styles.addSongBtnText}>＋ Add Song</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        Tap a song to view. Run CineStage™ to separate stems.
      </Text>

      {/* INCC Church Library Import Banner */}
      {!importDone && (
        <TouchableOpacity
          style={styles.importBanner}
          onPress={handleImportCifras}
          disabled={importing}
          activeOpacity={0.8}
        >
          {importing ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.importBannerText}>
              ⛪ Import INCC Church Library — {getCifrasCount()} songs
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Search */}
      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Search songs or artists"
        placeholderTextColor="#4B5563"
        returnKeyType="search"
      />

      {/* Song list */}
      {loading ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={loadSongs}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {query ? 'No matches found' : 'No songs in library'}
              </Text>
              <Text style={styles.emptyCaption}>
                {query
                  ? 'Try a different search term.'
                  : 'Add songs via New Song or the Stems Center.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const hasStemsDone = getStemKeys(item).length > 0;
            const meta = [
              item.bpm && `BPM ${item.bpm}`,
              (item.originalKey || item.key) && `Key ${item.originalKey || item.key}`,
              item.timeSig && item.timeSig,
            ]
              .filter(Boolean)
              .join('  ·  ');

            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('SongDetail', { song: item })}
                activeOpacity={0.85}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                    {item.artist ? (
                      <Text style={styles.cardArtist} numberOfLines={1}>{item.artist}</Text>
                    ) : null}
                    {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}
                    <StemBadges song={item} />
                  </View>
                  {hasStemsDone && (
                    <View style={styles.stemsReadyBadge}>
                      <Text style={styles.stemsReadyText}>Stems ✓</Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardActions}>
                  {hasStemsDone ? (
                    <TouchableOpacity
                      style={styles.rehearsalBtn}
                      onPress={() =>
                        navigation.navigate('Rehearsal', { song: item, apiBase })
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.rehearsalBtnText}>▶ Rehearsal</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.cineBtn}
                      onPress={() => openCineStageModal(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cineBtnText}>✦ Run CineStage™</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── Source URL modal ── */}
      <Modal
        visible={!!urlModalSong}
        animationType="slide"
        transparent
        onRequestClose={closeCineStageModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Run CineStage™</Text>
            {urlModalSong && (
              <Text style={styles.modalSong}>{urlModalSong.title}</Text>
            )}
            <Text style={styles.modalLabel}>Source URL</Text>
            <TextInput
              style={styles.modalInput}
              value={sourceUrl}
              onChangeText={setSourceUrl}
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor="#4B5563"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <Text style={styles.modalHint}>
              CineStage™ will separate vocals, drums, bass, keys, and more from this source.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeCineStageModal}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.startBtn, !sourceUrl.trim() && styles.startBtnDisabled]}
                onPress={startProcessing}
                disabled={!sourceUrl.trim()}
                activeOpacity={0.8}
              >
                <Text style={styles.startBtnText}>Start Processing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── CineStage processing overlay ── */}
      <CineStageProcessingOverlay
        visible={processing}
        title="CineStage™ is processing"
        subtitle="Wait — we'll let you know when it's done."
        steps={CINESTAGE_STEPS}
        currentStepIndex={processingStep}
        progress={processingProgress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617', paddingTop: 8 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 6,
    gap: 6,
  },
  navLink: { color: '#6B7280', fontSize: 12 },
  navSep: { color: '#374151', fontSize: 12 },
  navActive: { color: '#E5E7EB', fontSize: 12, fontWeight: '600' },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '800',
  },
  addSongBtn: {
    backgroundColor: '#1E1B4B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  addSongBtnText: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  importBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#1E3A5F',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  importBannerText: {
    color: '#93C5FD',
    fontSize: 14,
    fontWeight: '700',
  },

  searchInput: {
    marginHorizontal: 16,
    backgroundColor: '#0B1120',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#E5E7EB',
    fontSize: 14,
    marginBottom: 8,
  },

  list: { padding: 16, paddingTop: 4, paddingBottom: 60 },

  card: {
    backgroundColor: '#0B1120',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#111827',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardInfo: { flex: 1 },
  cardTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '700' },
  cardArtist: { color: '#9CA3AF', fontSize: 13, marginTop: 2 },
  cardMeta: { color: '#4B5563', fontSize: 11, marginTop: 4 },

  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  stemDot: { width: 8, height: 8, borderRadius: 4 },
  stemLabel: { color: '#4B5563', fontSize: 10, marginLeft: 2 },

  stemsReadyBadge: {
    backgroundColor: '#14532D',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
    alignSelf: 'flex-start',
  },
  stemsReadyText: { color: '#34D399', fontSize: 10, fontWeight: '700' },

  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },

  cineBtn: {
    flex: 1,
    backgroundColor: '#1E1B4B',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  cineBtnText: { color: '#818CF8', fontSize: 13, fontWeight: '700' },

  rehearsalBtn: {
    flex: 1,
    backgroundColor: '#14532D',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#16A34A',
  },
  rehearsalBtnText: { color: '#4ADE80', fontSize: 13, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '700' },
  emptyCaption: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },

  // URL modal
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000099',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0B1120',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: '#1F2937',
  },
  modalTitle: { color: '#F9FAFB', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalSong: { color: '#818CF8', fontSize: 14, fontWeight: '600', marginBottom: 16 },
  modalLabel: { color: '#9CA3AF', fontSize: 12, marginBottom: 6 },
  modalInput: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#E5E7EB',
    fontSize: 14,
  },
  modalHint: {
    color: '#4B5563',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelText: { color: '#9CA3AF', fontWeight: '600' },
  startBtn: {
    flex: 2,
    backgroundColor: '#4338CA',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
