import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { addOrUpdateSong, findSongDuplicate, getSettings, getSongs } from '../data/storage';
import { makeId } from '../data/models';
import CineStageProcessingOverlay from '../components/CineStageProcessingOverlay';

const CINESTAGE_STEPS = [
  'Collecting song info',
  'Separating stems',
  'Preparing tracks',
  'Job done!',
];

const STEM_SLOTS = ['Vocals', 'Drums', 'Bass', 'Keys', 'Guitars', 'Other'];

const STEM_COLORS = {
  vocals: '#F472B6',
  drums: '#34D399',
  bass: '#60A5FA',
  keys: '#A78BFA',
  guitars: '#FB923C',
  other: '#FBBF24',
};

const STEMS_DIR = FileSystem.documentDirectory + 'um_stems/';

function stemKey(name) {
  return (name || '').toLowerCase();
}

function dotColorFor(name) {
  return STEM_COLORS[stemKey(name)] || '#94A3B8';
}

function normaliseStemsToKeys(stems) {
  if (!stems) return [];
  if (Array.isArray(stems)) return stems.map((s) => s.type || s.name || '');
  if (typeof stems === 'object') return Object.keys(stems);
  return [];
}

function hasMixableStems(song) {
  const hasLocal = song.localStems && Object.keys(song.localStems).length > 0;
  const hasBackend = normaliseStemsToKeys(song.latestStemsJob?.result?.stems).length > 0;
  return hasLocal || hasBackend;
}

function StemDots({ song }) {
  const localKeys = Object.keys(song.localStems || {});
  const backendKeys = normaliseStemsToKeys(song.latestStemsJob?.result?.stems);
  const names = localKeys.length > 0 ? localKeys : backendKeys;
  if (!names.length) return null;
  return (
    <View style={styles.dotsRow}>
      {names.slice(0, 6).map((n) => (
        <View key={n} style={[styles.stemDot, { backgroundColor: dotColorFor(n) }]} />
      ))}
      {names.length > 0 && (
        <Text style={styles.dotLabel}>{names.length} stem{names.length !== 1 ? 's' : ''}</Text>
      )}
    </View>
  );
}

export default function StemsCenterScreen({ navigation, route }) {
  const [activeTab, setActiveTab] = useState(0); // 0=Library, 1=Import

  // ── Library ──
  const [songs, setSongs] = useState([]);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [attachSong, setAttachSong] = useState(null);
  const [modalStems, setModalStems] = useState({});
  const [savingStems, setSavingStems] = useState(false);

  // ── Import ──
  const [apiBase, setApiBase] = useState('http://localhost:8000');
  const [userId, setUserId] = useState('demo-user');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);

  const loadSongs = useCallback(async () => {
    setLoadingSongs(true);
    try {
      const all = await getSongs();
      setSongs(all);
    } catch { /* ignore */ }
    setLoadingSongs(false);
  }, []);

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      if (settings.apiBase) setApiBase(settings.apiBase);
      if (settings.defaultUserId) setUserId(settings.defaultUserId);
    })();
    loadSongs();
  }, []);

  // Accept pre-fill params from LibraryScreen "Run CineStage™"
  useEffect(() => {
    if (!route?.params) return;
    const { prefillTitle, prefillArtist, focusImport } = route.params;
    if (prefillTitle) setTitle(prefillTitle);
    if (prefillArtist) setArtist(prefillArtist);
    if (focusImport) setActiveTab(1);
  }, [route?.params]);

  // ── Attach modal ──
  function openAttachModal(song) {
    setAttachSong(song);
    setModalStems(song.localStems ? { ...song.localStems } : {});
  }

  function closeAttachModal() {
    setAttachSong(null);
    setModalStems({});
  }

  async function pickStemFile(slotName) {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];

      // Ensure directory exists
      const dir = `${STEMS_DIR}${attachSong.id}/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

      const ext = (asset.name || 'audio').split('.').pop() || 'mp3';
      const destPath = `${dir}${stemKey(slotName)}.${ext}`;
      await FileSystem.copyAsync({ from: asset.uri, to: destPath });

      setModalStems((prev) => ({
        ...prev,
        [slotName]: { localUri: destPath, fileName: asset.name },
      }));
    } catch (e) {
      Alert.alert('Error', String(e.message || e));
    }
  }

  async function removeStemFile(slotName) {
    const info = modalStems[slotName];
    if (info?.localUri) {
      try {
        await FileSystem.deleteAsync(info.localUri, { idempotent: true });
      } catch { /* ignore */ }
    }
    setModalStems((prev) => {
      const next = { ...prev };
      delete next[slotName];
      return next;
    });
  }

  async function saveLocalStems() {
    if (!attachSong) return;
    setSavingStems(true);
    try {
      const updated = await addOrUpdateSong({ ...attachSong, localStems: modalStems });
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      closeAttachModal();
    } catch (e) {
      Alert.alert('Error', String(e.message || e));
    }
    setSavingStems(false);
  }

  // ── Import from URL ──
  function importHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (userId.trim()) h['X-User-Id'] = userId.trim();
    return h;
  }

  async function handleImport() {
    if (!apiBase.trim() || !sourceUrl.trim()) {
      Alert.alert('Missing info', 'Backend URL and source URL are required.');
      return;
    }

    // ── Step 0: Collecting song info ──
    setProcessingStep(0);
    setProcessingProgress(5);
    setImporting(true);

    try {
      const resJob = await fetch(`${apiBase}/jobs`, {
        method: 'POST',
        headers: importHeaders(),
        body: JSON.stringify({
          user_id: userId,
          title: title || 'Imported Stems',
          file_url: sourceUrl,
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

        const poll = await fetch(`${apiBase}/jobs/${job.id}`, { headers: importHeaders() });
        const pollJson = await poll.json();
        if (!poll.ok) throw new Error(JSON.stringify(pollJson));
        current = pollJson;

        if (current.status === 'PENDING') {
          // Still waiting for worker to pick up
          setProcessingStep(0);
          setProcessingProgress(Math.min(28, 20 + attempts * 2));
        } else if (current.status === 'PROCESSING') {
          if (lastStatus !== 'PROCESSING') {
            // Just transitioned into processing — jump to step 1
            setProcessingStep(1);
            setProcessingProgress(30);
          } else {
            // Slowly advance during separation (30 → 82%)
            setProcessingProgress((prev) => Math.min(82, prev + 0.8));
          }
        }

        lastStatus = current.status;
        if (attempts > 80) break;
      }

      if (current.status !== 'COMPLETED') {
        setImporting(false);
        Alert.alert('Processing error', `Job ended with status: ${current.status}`);
        return;
      }

      // ── Step 2: Preparing tracks ──
      setProcessingStep(2);
      setProcessingProgress(90);

      const result = current.result || {};
      const allSongs = await getSongs();
      const existing = findSongDuplicate(
        allSongs,
        result.title || title,
        result.artist || artist
      );

      const saved = await addOrUpdateSong({
        id: existing?.id || makeId('song'),
        ...(existing || {}),
        title: result.title || title || 'Imported Stems',
        artist: result.artist || artist || '',
        originalKey: current.key || result.key || existing?.originalKey || '',
        bpm: current.bpm || result.bpm || existing?.bpm || null,
        latestStemsJob: current,
      });

      // ── Step 3: Job done! ──
      setProcessingStep(3);
      setProcessingProgress(100);

      await loadSongs();

      // Brief pause so user sees "Job done!" before navigating
      await new Promise((r) => setTimeout(r, 900));

      setImporting(false);
      setActiveTab(0);
      navigation.navigate('Rehearsal', { song: saved, apiBase });
    } catch (e) {
      console.error(e);
      setImporting(false);
      Alert.alert('Error', String(e.message || e));
    }
  }

  // ── Render ──
  return (
    <View style={styles.root}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {['Library', 'Import'].map((label, i) => (
          <TouchableOpacity
            key={label}
            style={[styles.tabBtn, activeTab === i && styles.tabBtnActive]}
            onPress={() => setActiveTab(i)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Library tab ── */}
      {activeTab === 0 && (
        <FlatList
          data={songs}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContainer}
          refreshing={loadingSongs}
          onRefresh={loadSongs}
          ListHeaderComponent={
            <Text style={styles.listHint}>
              Tap ▶ Mix to open the mixer, or ＋ Stems to attach local audio files.
            </Text>
          }
          ListEmptyComponent={
            loadingSongs ? (
              <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No songs in library</Text>
                <Text style={styles.emptyCaption}>
                  Add songs via the Library tab, then come back here to attach stems.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View style={styles.songCard}>
              <View style={styles.songInfo}>
                <Text style={styles.songName} numberOfLines={1}>{item.title}</Text>
                {item.artist ? (
                  <Text style={styles.songArtist} numberOfLines={1}>{item.artist}</Text>
                ) : null}
                <StemDots song={item} />
              </View>
              <View style={styles.songActions}>
                {hasMixableStems(item) && (
                  <TouchableOpacity
                    style={styles.mixBtn}
                    onPress={() => navigation.navigate('Rehearsal', { song: item, apiBase })}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.mixBtnText}>▶ Rehearsal</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => openAttachModal(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addBtnText}>＋ Stems</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* ── Import tab ── */}
      {activeTab === 1 && (
        <ScrollView contentContainerStyle={styles.importContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.importHeading}>Import Stems from URL</Text>
          <Text style={styles.importCaption}>
            Point to a backend that can separate stems (e.g. Demucs service). The processed stems
            will be saved to your library.
          </Text>

          <Text style={styles.fieldLabel}>Backend URL</Text>
          <TextInput
            style={styles.input}
            value={apiBase}
            onChangeText={setApiBase}
            placeholder="http://localhost:8000"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.fieldLabel}>User ID</Text>
          <TextInput
            style={styles.input}
            value={userId}
            onChangeText={setUserId}
            placeholder="demo-user"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Song Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Gratitude"
            placeholderTextColor="#4B5563"
          />

          <Text style={styles.fieldLabel}>Artist (optional)</Text>
          <TextInput
            style={styles.input}
            value={artist}
            onChangeText={setArtist}
            placeholder="Brandon Lake"
            placeholderTextColor="#4B5563"
          />

          <Text style={styles.fieldLabel}>Source URL (YouTube, SoundCloud, etc.)</Text>
          <TextInput
            style={styles.input}
            value={sourceUrl}
            onChangeText={setSourceUrl}
            placeholder="https://youtube.com/watch?v=..."
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.importBtn, importing && styles.importBtnDisabled]}
            onPress={handleImport}
            disabled={importing}
            activeOpacity={0.8}
          >
            <Text style={styles.importBtnText}>Run CineStage™</Text>
          </TouchableOpacity>

          {!importing && (
            <Text style={styles.importingNote}>
              Stem separation typically takes 1–3 minutes depending on song length.
            </Text>
          )}
        </ScrollView>
      )}

      {/* ── Attach stems modal ── */}
      <Modal
        visible={!!attachSong}
        animationType="slide"
        transparent
        onRequestClose={closeAttachModal}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Attach Local Stems</Text>
            {attachSong && (
              <Text style={styles.modalSong}>{attachSong.title}</Text>
            )}

            <ScrollView style={styles.slotList} showsVerticalScrollIndicator={false}>
              {STEM_SLOTS.map((slot) => {
                const info = modalStems[slot];
                return (
                  <View key={slot} style={styles.slotRow}>
                    <View style={[styles.slotDot, { backgroundColor: dotColorFor(slot) }]} />
                    <View style={styles.slotMeta}>
                      <Text style={styles.slotName}>{slot}</Text>
                      {info
                        ? <Text style={styles.slotFile} numberOfLines={1}>{info.fileName}</Text>
                        : <Text style={styles.slotNone}>No file attached</Text>}
                    </View>
                    {info ? (
                      <TouchableOpacity style={styles.removeBtn} onPress={() => removeStemFile(slot)}>
                        <Text style={styles.removeBtnText}>✕</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.pickBtn}
                      onPress={() => pickStemFile(slot)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.pickBtnText}>{info ? 'Replace' : 'Pick'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeAttachModal}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, savingStems && styles.saveBtnDisabled]}
                onPress={saveLocalStems}
                disabled={savingStems}
                activeOpacity={0.8}
              >
                {savingStems
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={styles.saveText}>Save Stems</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* ── CineStage processing overlay ── */}
      <CineStageProcessingOverlay
        visible={importing}
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
  root: { flex: 1, backgroundColor: '#020617' },

  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  tabBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  tabText: { color: '#6B7280', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#FFFFFF' },

  // Library
  listContainer: { padding: 16, paddingBottom: 40 },
  listHint: { color: '#4B5563', fontSize: 11, marginBottom: 12 },

  songCard: {
    backgroundColor: '#0B1120',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
  },
  songInfo: { flex: 1, marginRight: 10 },
  songName: { color: '#F9FAFB', fontSize: 15, fontWeight: '600' },
  songArtist: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  stemDot: { width: 8, height: 8, borderRadius: 4 },
  dotLabel: { color: '#4B5563', fontSize: 10, marginLeft: 4 },

  songActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mixBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  mixBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  addBtn: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '700' },
  emptyCaption: { color: '#6B7280', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 },

  // Import
  importContainer: { padding: 16, paddingBottom: 60 },
  importHeading: { color: '#F9FAFB', fontSize: 20, fontWeight: '700', marginBottom: 6 },
  importCaption: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginBottom: 16 },
  fieldLabel: { color: '#9CA3AF', fontSize: 12, marginBottom: 5, marginTop: 14 },
  input: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#E5E7EB',
    fontSize: 13,
  },
  importBtn: {
    marginTop: 24,
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  importBtnDisabled: { opacity: 0.55 },
  importBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, marginLeft: 8 },
  importingRow: { flexDirection: 'row', alignItems: 'center' },
  importingNote: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: '#00000099',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0B1120',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: '#1F2937',
  },
  modalTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalSong: { color: '#6B7280', fontSize: 13, marginBottom: 14 },
  slotList: { maxHeight: 360 },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    gap: 10,
  },
  slotDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  slotMeta: { flex: 1 },
  slotName: { color: '#F9FAFB', fontSize: 14, fontWeight: '600' },
  slotFile: { color: '#6366F1', fontSize: 11, marginTop: 2 },
  slotNone: { color: '#4B5563', fontSize: 11, marginTop: 2 },
  removeBtn: { padding: 6 },
  removeBtnText: { color: '#EF4444', fontSize: 14 },
  pickBtn: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  pickBtnText: { color: '#E5E7EB', fontSize: 12, fontWeight: '600' },

  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 18 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelText: { color: '#E5E7EB', fontWeight: '600' },
  saveBtn: {
    flex: 2,
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
