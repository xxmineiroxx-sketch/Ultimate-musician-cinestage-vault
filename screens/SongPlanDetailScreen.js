import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Platform, ActivityIndicator, Modal,
} from 'react-native';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import {
  getPlanForService, updateSongItem, addVocalAssignment, removeVocalAssignment,
  distributeChordChart, updateVoicePartAudio, removeVoicePartAudio,
} from '../data/servicePlanStore';
import { transposeChordChart, stripChordsForVocals } from '../data/chordTranspose';
import { getSongs, getPeople } from '../data/storage';
import { INSTRUMENT_SHEETS, CHORD_CHART_INSTRUMENTS, VOICE_PARTS } from '../data/models';

const VOICE_DIR = FileSystem.documentDirectory + 'um_voice_parts/';

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ active, onChange }) {
  const tabs = [
    { key: 'chordChart', label: 'Chord Chart' },
    { key: 'instruments', label: 'Instruments' },
    { key: 'vocals', label: 'Vocals' },
  ];
  return (
    <View style={tb.row}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t.key}
          style={[tb.tab, active === t.key && tb.tabActive]}
          onPress={() => onChange(t.key)}
        >
          <Text style={[tb.tabText, active === t.key && tb.tabTextActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const tb = StyleSheet.create({
  row: {
    flexDirection: 'row', backgroundColor: '#0B1120',
    borderRadius: 12, padding: 4, marginHorizontal: 16, marginBottom: 8,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  tabActive: { backgroundColor: '#4F46E5' },
  tabText: { color: '#6B7280', fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#fff' },
});

// ─── Vocal assignment row ─────────────────────────────────────────────────────
function VocalRow({ assignment, onRemove }) {
  return (
    <View style={styles.vocalRow}>
      <View style={styles.personAvatar}>
        <Text style={styles.personAvatarText}>
          {(assignment.name || '?')[0].toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.personName}>{assignment.name}</Text>
        <Text style={styles.vocalType}>
          {assignment.type === 'lead' ? '🎤 Lead / Solo' : '🎵 Backing / BGV'}
        </Text>
      </View>
      <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
        <Text style={styles.removeBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function SongPlanDetailScreen({ route, navigation }) {
  const { serviceId, itemId } = route.params;

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState(null);
  const [people, setPeople] = useState([]);
  const [tab, setTab] = useState('chordChart');

  // Chord chart tab
  const [chordChart, setChordChart] = useState('');
  const [chordChartDirty, setChordChartDirty] = useState(false);
  const [savingChart, setSavingChart] = useState(false);
  const [vocalistPreview, setVocalistPreview] = useState(false);

  // Instruments tab
  const [instrumentNotes, setInstrumentNotes] = useState({});
  const [instrumentDirty, setInstrumentDirty] = useState(false);
  const [savingInstruments, setSavingInstruments] = useState(false);
  const [expandedInstrument, setExpandedInstrument] = useState(null);

  // Vocals tab – audio playback
  const soundRef = useRef(null);
  const [playingPart, setPlayingPart] = useState(null);
  const [playbackPos, setPlaybackPos] = useState(0);
  const [playbackDur, setPlaybackDur] = useState(0);
  const [uploadingPart, setUploadingPart] = useState(null);

  // Vocals tab – assign modal
  const [vocalModal, setVocalModal] = useState(false);
  const [assignVoicePart, setAssignVoicePart] = useState('');
  const [assignType, setAssignType] = useState('lead');
  const [personSearch, setPersonSearch] = useState('');

  // ── Refresh ────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const [plan, songs, peeps] = await Promise.all([
        getPlanForService(serviceId),
        getSongs(),
        getPeople(),
      ]);
      const found = plan.songs.find((s) => s.id === itemId);
      if (!found) { setLoading(false); return; }

      const lib = songs.find((s) => s.id === found.songId) || null;
      setItem(found);
      setPeople(peeps);

      // Chord chart: prefer chordChart field, fall back to old lyrics for compat
      const chart = found.chordChart || found.lyrics || '';
      setChordChart(chart);
      setChordChartDirty(false);

      // Build instrumentNotes
      const initNotes = {};
      for (const inst of INSTRUMENT_SHEETS) {
        if (found.instrumentNotes?.[inst] !== undefined) {
          initNotes[inst] = found.instrumentNotes[inst];
        } else if (lib?.instrumentSheets?.[inst]) {
          initNotes[inst] = lib.instrumentSheets[inst];
        } else {
          initNotes[inst] = '';
        }
      }
      setInstrumentNotes(initNotes);
      setInstrumentDirty(false);
    } finally {
      setLoading(false);
    }
  }, [serviceId, itemId]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', refresh);
    refresh();
    return unsub;
  }, [navigation, refresh]);

  useEffect(() => {
    if (item) navigation.setOptions({ title: item.title });
  }, [item, navigation]);

  // Stop audio on unmount / tab leave
  useEffect(() => {
    return () => stopSound();
  }, []);

  function handleTabChange(newTab) {
    if (newTab !== 'vocals') stopSound();
    setTab(newTab);
  }

  // ── Audio helpers ──────────────────────────────────────────────────────────
  async function stopSound() {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (_) {}
      soundRef.current = null;
    }
    setPlayingPart(null);
    setPlaybackPos(0);
    setPlaybackDur(0);
  }

  async function togglePlayPart(voicePart, localUri) {
    // Pause if same part is already playing
    if (playingPart === voicePart && soundRef.current) {
      await stopSound();
      return;
    }
    // Stop previous
    await stopSound();

    // Verify file exists
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) {
      Alert.alert('File not found', 'Audio file is missing. Please re-upload.');
      return;
    }

    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
      const { sound } = await Audio.Sound.createAsync({ uri: localUri });
      soundRef.current = sound;
      setPlayingPart(voicePart);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setPlaybackPos(status.positionMillis || 0);
          setPlaybackDur(status.durationMillis || 0);
          if (status.didJustFinish) {
            setPlayingPart(null);
            setPlaybackPos(0);
          }
        }
      });
      await sound.playAsync();
    } catch (e) {
      Alert.alert('Playback error', e.message || 'Could not play this file.');
    }
  }

  async function uploadAudioForPart(voicePart) {
    setUploadingPart(voicePart);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      await FileSystem.makeDirectoryAsync(VOICE_DIR, { intermediates: true });
      const ext = (asset.name || 'audio').split('.').pop() || 'm4a';
      const safePartName = voicePart.replace(/[^a-zA-Z0-9]/g, '_');
      const destPath = `${VOICE_DIR}${serviceId}_${itemId}_${safePartName}.${ext}`;

      await FileSystem.copyAsync({ from: asset.uri, to: destPath });

      const next = await updateVoicePartAudio(serviceId, itemId, voicePart, {
        localUri: destPath,
        fileName: asset.name || `${voicePart} reference`,
      });
      setItem(next.songs.find((s) => s.id === itemId));
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Could not import the audio file.');
    } finally {
      setUploadingPart(null);
    }
  }

  async function handleRemoveAudio(voicePart) {
    const audioInfo = item?.voicePartAudio?.[voicePart];
    Alert.alert(`Remove ${voicePart} audio?`, 'This will delete the uploaded reference track.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (playingPart === voicePart) await stopSound();
          if (audioInfo?.localUri) {
            await FileSystem.deleteAsync(audioInfo.localUri, { idempotent: true });
          }
          const next = await removeVoicePartAudio(serviceId, itemId, voicePart);
          setItem(next.songs.find((s) => s.id === itemId));
        },
      },
    ]);
  }

  // ── Vocal assignment ───────────────────────────────────────────────────────
  async function handleAssignVocalist(person) {
    if (!assignVoicePart) {
      Alert.alert('Select voice part', 'Choose a voice part (Soprano, Alto, Tenor…) before assigning.');
      return;
    }
    const next = await addVocalAssignment(serviceId, itemId, {
      personId: person.id,
      name: person.name,
      type: assignType,
      voicePart: assignVoicePart,
    });
    setItem(next.songs.find((s) => s.id === itemId));
    setVocalModal(false);
    setPersonSearch('');
  }

  async function handleRemoveVocal(assignmentId) {
    Alert.alert('Remove vocalist?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const next = await removeVocalAssignment(serviceId, itemId, assignmentId);
          setItem(next.songs.find((s) => s.id === itemId));
        },
      },
    ]);
  }

  // ── Chord chart handlers ───────────────────────────────────────────────────
  async function saveChordChart() {
    setSavingChart(true);
    try {
      const next = await updateSongItem(serviceId, itemId, { chordChart });
      setItem(next.songs.find((s) => s.id === itemId));
      setChordChartDirty(false);
    } finally {
      setSavingChart(false);
    }
  }

  async function handleDistribute() {
    if (!chordChart.trim()) {
      Alert.alert('No chord chart', 'Enter the chord chart first.');
      return;
    }
    const fromKey = item.key || '';
    const toKey = item.transposedKey || item.key || '';
    const keyInfo = toKey && toKey !== fromKey
      ? `Chart will be transposed ${fromKey} → ${toKey}.`
      : `Key: ${fromKey || '—'}`;

    Alert.alert(
      'Share with Musicians?',
      `${keyInfo}\n\nDistributes to: ${CHORD_CHART_INSTRUMENTS.join(', ')}.\n\nVocalists receive lyrics only (chord lines removed automatically).`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share',
          onPress: async () => {
            setSavingChart(true);
            try {
              await updateSongItem(serviceId, itemId, { chordChart });
              const next = await distributeChordChart(serviceId, itemId);
              const found = next.songs.find((s) => s.id === itemId);
              setItem(found);
              const newNotes = {};
              for (const inst of INSTRUMENT_SHEETS) {
                newNotes[inst] = found.instrumentNotes?.[inst] || '';
              }
              setInstrumentNotes(newNotes);
              setChordChartDirty(false);
              Alert.alert('Distributed!', toKey && toKey !== fromKey
                ? `Shared in key of ${toKey}. Vocalists see lyrics only.`
                : 'Chord chart shared. Vocalists see lyrics only.');
            } finally {
              setSavingChart(false);
            }
          },
        },
      ]
    );
  }

  // ── Instruments save ───────────────────────────────────────────────────────
  async function saveInstruments() {
    setSavingInstruments(true);
    try {
      const next = await updateSongItem(serviceId, itemId, { instrumentNotes });
      setItem(next.songs.find((s) => s.id === itemId));
      setInstrumentDirty(false);
      Alert.alert('Saved', 'Instrument notes saved.');
    } finally {
      setSavingInstruments(false);
    }
  }

  // ── Loading / not found ────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#818CF8" size="large" />
      </View>
    );
  }
  if (!item) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>Song not found in this service plan.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const fromKey = item.key || '';
  const toKey = item.transposedKey || '';
  const displayKey = toKey ? `${fromKey} → ${toKey}` : (fromKey || '—');
  const isDistributed = !!item.distributedInKey;
  const keyChanged = isDistributed && item.distributedInKey !== (toKey || fromKey);

  const vocalAssignments = item.vocalAssignments || [];
  const legacyAssignments = vocalAssignments.filter((v) => !v.voicePart);
  const assignedPersonIds = new Set(vocalAssignments.map((v) => v.personId));
  const filteredPeople = people.filter(
    (p) =>
      !assignedPersonIds.has(p.id) &&
      (personSearch === '' || p.name?.toLowerCase().includes(personSearch.toLowerCase()))
  );

  return (
    <View style={styles.root}>
      {/* ── Song header ────────────────────────────────────────────────────── */}
      <View style={styles.songHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.songHeaderTitle}>{item.title}</Text>
          <Text style={styles.songHeaderMeta}>
            {item.artist ? `${item.artist}  ·  ` : ''}
            Key: {displayKey}
            {item.bpm ? `  ·  ${item.bpm} BPM` : ''}
          </Text>
        </View>
        {isDistributed && !keyChanged && (
          <View style={styles.sharedBadge}>
            <Text style={styles.sharedBadgeText}>✓ Shared</Text>
          </View>
        )}
        {keyChanged && (
          <View style={[styles.sharedBadge, styles.sharedBadgeWarn]}>
            <Text style={[styles.sharedBadgeText, { color: '#FCD34D' }]}>⚠ Key changed</Text>
          </View>
        )}
      </View>

      <TabBar active={tab} onChange={handleTabChange} />

      {/* ═══════════════════ CHORD CHART TAB ═══════════════════════════════ */}
      {tab === 'chordChart' && (
        <View style={{ flex: 1 }}>
          <View style={styles.chartBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.chartBarLabel}>
                {CHORD_CHART_INSTRUMENTS.join(' · ')}
              </Text>
              <Text style={styles.chartBarSub}>
                Vocals receive lyrics only (chords auto-stripped)
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {chordChartDirty && (
                <TouchableOpacity style={styles.saveSmall} onPress={saveChordChart} disabled={savingChart}>
                  <Text style={styles.saveSmallText}>{savingChart ? '…' : 'Save'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.previewBtn} onPress={() => setVocalistPreview(true)}>
                <Text style={styles.previewBtnText}>👁 Vocals</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.distributeBtn, (!chordChart.trim() || savingChart) && { opacity: 0.4 }]}
                onPress={handleDistribute}
                disabled={!chordChart.trim() || savingChart}
              >
                <Text style={styles.distributeBtnText}>{savingChart ? '…' : '🎸 Share'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {keyChanged && (
            <View style={styles.keyChangedBanner}>
              <Text style={styles.keyChangedBannerText}>
                ⚠️ Key changed to {toKey}. Tap 🎸 Share to re-distribute transposed charts.
              </Text>
            </View>
          )}

          <TextInput
            style={styles.chordChartInput}
            value={chordChart}
            onChangeText={(val) => { setChordChart(val); setChordChartDirty(true); }}
            placeholder={`Song: ${item.title}\nKey: ${fromKey}${item.bpm ? `  BPM: ${item.bpm}` : ''}\n\nPaste chord chart here...\n\n[Verse 1]\n    C\nLyric line\n    Am\nLyric line`}
            placeholderTextColor="#2D3A4A"
            multiline
            textAlignVertical="top"
          />
        </View>
      )}

      {/* ═══════════════════ INSTRUMENTS TAB ═══════════════════════════════ */}
      {tab === 'instruments' && (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.hint}>
            Tap an instrument to expand. "chord" instruments are pre-filled when you tap 🎸 Share.
          </Text>

          {INSTRUMENT_SHEETS.map((inst) => {
            const isOpen = expandedInstrument === inst;
            const hasContent = (instrumentNotes[inst] || '').trim().length > 0;
            const isChordInst = CHORD_CHART_INSTRUMENTS.includes(inst);
            return (
              <View key={inst} style={styles.accordionCard}>
                <TouchableOpacity
                  style={styles.accordionHeader}
                  onPress={() => setExpandedInstrument(isOpen ? null : inst)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.accordionTitle}>{inst}</Text>
                    {isChordInst && <Text style={styles.accordionTag}>chord</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {hasContent && <View style={[styles.dot, { marginRight: 8 }]} />}
                    <Text style={styles.accordionChevron}>{isOpen ? '▲' : '▼'}</Text>
                  </View>
                </TouchableOpacity>
                {isOpen && (
                  <TextInput
                    style={styles.chordInput}
                    value={instrumentNotes[inst] || ''}
                    onChangeText={(val) => {
                      setInstrumentNotes((prev) => ({ ...prev, [inst]: val }));
                      setInstrumentDirty(true);
                    }}
                    placeholder={`Enter ${inst} notes, cues, additional markings...`}
                    placeholderTextColor="#4B5563"
                    multiline
                    textAlignVertical="top"
                  />
                )}
              </View>
            );
          })}

          {instrumentDirty && (
            <TouchableOpacity
              style={[styles.primaryBtn, savingInstruments && { opacity: 0.6 }]}
              onPress={saveInstruments}
              disabled={savingInstruments}
            >
              <Text style={styles.primaryBtnText}>
                {savingInstruments ? 'Saving…' : 'Save Instrument Notes'}
              </Text>
            </TouchableOpacity>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ═══════════════════ VOCALS TAB ════════════════════════════════════ */}
      {tab === 'vocals' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Assign button */}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              setAssignVoicePart('');
              setAssignType('lead');
              setPersonSearch('');
              setVocalModal(true);
            }}
          >
            <Text style={styles.primaryBtnText}>+ Assign Vocalist</Text>
          </TouchableOpacity>

          <Text style={[styles.hint, { marginTop: 16 }]}>
            Upload a reference audio for each voice part so musicians can hear their specific line.
          </Text>

          {/* ── Voice Part Sections ────────────────────────────────────────── */}
          {VOICE_PARTS.map((part) => {
            const partAssignments = vocalAssignments.filter((v) => v.voicePart === part);
            const audioInfo = item.voicePartAudio?.[part];
            const isUploading = uploadingPart === part;
            const isPlaying = playingPart === part;
            const progress = isPlaying && playbackDur > 0
              ? (playbackPos / playbackDur * 100).toFixed(1)
              : 0;

            return (
              <View key={part} style={styles.voicePartSection}>
                {/* Section header */}
                <View style={styles.voicePartHeader}>
                  <Text style={styles.voicePartLabel}>{part.toUpperCase()}</Text>
                  {partAssignments.length > 0 && (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{partAssignments.length}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.uploadBtn, isUploading && { opacity: 0.5 }]}
                    onPress={() => uploadAudioForPart(part)}
                    disabled={isUploading}
                  >
                    <Text style={styles.uploadBtnText}>
                      {isUploading ? '↑…' : audioInfo ? '↑ Replace' : '+ Audio'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Audio player */}
                {audioInfo && (
                  <TouchableOpacity
                    style={[styles.audioPlayer, isPlaying && styles.audioPlayerActive]}
                    onPress={() => togglePlayPart(part, audioInfo.localUri)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.playBtn, isPlaying && styles.playBtnActive]}>
                      <Text style={styles.playBtnIcon}>{isPlaying ? '⏸' : '▶'}</Text>
                    </View>
                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                      <Text style={styles.audioFileName} numberOfLines={1}>
                        {audioInfo.fileName}
                      </Text>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${progress}%` }]} />
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveAudio(part)}
                      style={{ padding: 6 }}
                    >
                      <Text style={styles.removeAudioText}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}

                {/* Assigned vocalists for this part */}
                {partAssignments.map((v) => (
                  <VocalRow
                    key={v.id}
                    assignment={v}
                    onRemove={() => handleRemoveVocal(v.id)}
                  />
                ))}

                {partAssignments.length === 0 && !audioInfo && (
                  <Text style={styles.voicePartEmpty}>
                    No vocalist or audio yet — tap + Audio to upload a reference track.
                  </Text>
                )}
              </View>
            );
          })}

          {/* Legacy assignments (no voice part) */}
          {legacyAssignments.length > 0 && (
            <View style={styles.voicePartSection}>
              <Text style={styles.voicePartLabel}>UNASSIGNED PART</Text>
              {legacyAssignments.map((v) => (
                <VocalRow key={v.id} assignment={v} onRemove={() => handleRemoveVocal(v.id)} />
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── Vocalist preview modal ──────────────────────────────────────────── */}
      <Modal
        visible={vocalistPreview}
        animationType="slide"
        transparent
        onRequestClose={() => setVocalistPreview(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>👤 Vocalist View — Lyrics Only</Text>
              <TouchableOpacity onPress={() => setVocalistPreview(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.previewNote}>
              Chord lines are removed automatically. This is what vocalists receive.
            </Text>
            <ScrollView>
              <Text style={styles.lyricsPreviewText}>
                {stripChordsForVocals(chordChart) ||
                  '(No lyrics yet — chord lines will be stripped automatically when you Share.)'}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Assign vocalist modal ────────────────────────────────────────────── */}
      <Modal
        visible={vocalModal}
        animationType="slide"
        transparent
        onRequestClose={() => setVocalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Vocalist</Text>
              <TouchableOpacity onPress={() => setVocalModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Voice part chips */}
            <Text style={styles.modalSectionLabel}>Voice Part</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 4 }}
            >
              {VOICE_PARTS.map((vp) => (
                <TouchableOpacity
                  key={vp}
                  style={[styles.vpChip, assignVoicePart === vp && styles.vpChipActive]}
                  onPress={() => setAssignVoicePart(assignVoicePart === vp ? '' : vp)}
                >
                  <Text style={[styles.vpChipText, assignVoicePart === vp && styles.vpChipTextActive]}>
                    {vp}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {!assignVoicePart && (
              <Text style={styles.pickHint}>Select a voice part above</Text>
            )}

            {/* Type chips */}
            <Text style={[styles.modalSectionLabel, { marginTop: 10 }]}>Type</Text>
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              {[
                { key: 'lead', label: '🎤 Lead / Solo' },
                { key: 'backing', label: '🎵 Backing / BGV' },
              ].map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeChip, assignType === t.key && styles.typeChipActive]}
                  onPress={() => setAssignType(t.key)}
                >
                  <Text style={[styles.typeChipText, assignType === t.key && styles.typeChipTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search */}
            <TextInput
              style={styles.modalSearch}
              value={personSearch}
              onChangeText={setPersonSearch}
              placeholder="Search people…"
              placeholderTextColor="#4B5563"
            />

            {/* Person list */}
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 260 }}>
              {filteredPeople.length === 0 ? (
                <Text style={[styles.voicePartEmpty, { paddingTop: 8 }]}>
                  {people.length === 0 ? 'No people in roster yet.' : 'No matches.'}
                </Text>
              ) : (
                filteredPeople.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.personRow}
                    onPress={() => handleAssignVocalist(p)}
                  >
                    <View style={styles.personAvatar}>
                      <Text style={styles.personAvatarText}>
                        {(p.name || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>{p.name}</Text>
                      {(p.roles || []).length > 0 && (
                        <Text style={styles.personRoles}>{p.roles.join(' · ')}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  notFoundText: { color: '#9CA3AF', fontSize: 16, textAlign: 'center' },
  backBtn: { marginTop: 12, padding: 12 },
  backBtnText: { color: '#818CF8', fontSize: 15 },

  // Song header
  songHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#111827',
  },
  songHeaderTitle: { color: '#fff', fontSize: 19, fontWeight: '900' },
  songHeaderMeta: { color: '#6B7280', fontSize: 12, marginTop: 3 },
  sharedBadge: {
    backgroundColor: '#064E3B22', borderRadius: 8, borderWidth: 1,
    borderColor: '#065F46', paddingHorizontal: 8, paddingVertical: 4,
  },
  sharedBadgeWarn: { backgroundColor: '#92400E22', borderColor: '#92400E' },
  sharedBadgeText: { color: '#34D399', fontSize: 11, fontWeight: '700' },

  // Chord chart tab
  chartBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#060D1A', borderBottomWidth: 1, borderBottomColor: '#111827',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  chartBarLabel: { color: '#6B7280', fontSize: 11, fontWeight: '700' },
  chartBarSub: { color: '#374151', fontSize: 10, marginTop: 2 },
  saveSmall: {
    backgroundColor: '#1F2937', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginRight: 6,
  },
  saveSmallText: { color: '#9CA3AF', fontWeight: '700', fontSize: 12 },
  previewBtn: {
    backgroundColor: '#1E1B4B', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginRight: 6,
  },
  previewBtnText: { color: '#A5B4FC', fontWeight: '700', fontSize: 12 },
  distributeBtn: {
    backgroundColor: '#4F46E5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  distributeBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  keyChangedBanner: {
    backgroundColor: '#431407', borderBottomWidth: 1, borderBottomColor: '#92400E',
    paddingHorizontal: 14, paddingVertical: 8,
  },
  keyChangedBannerText: { color: '#FDE68A', fontSize: 12, lineHeight: 17 },
  chordChartInput: {
    flex: 1, color: '#C9D1DB', fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingHorizontal: 16, paddingTop: 14, lineHeight: 21,
    textAlignVertical: 'top', backgroundColor: '#020914',
  },

  // Instruments tab
  scroll: { padding: 16 },
  hint: { color: '#6B7280', fontSize: 12, marginBottom: 12, lineHeight: 17 },
  accordionCard: {
    backgroundColor: '#0B1120', borderRadius: 12,
    borderWidth: 1, borderColor: '#1F2937', marginBottom: 8, overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  accordionTitle: { color: '#E5E7EB', fontSize: 15, fontWeight: '700', marginRight: 6 },
  accordionTag: {
    backgroundColor: '#1E3A5F', borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
    color: '#60A5FA', fontSize: 10, fontWeight: '700',
  },
  accordionChevron: { color: '#6B7280', fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4F46E5' },
  chordInput: {
    color: '#D1D5DB', fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    padding: 14, borderTopWidth: 1, borderTopColor: '#1F2937',
    minHeight: 200, backgroundColor: '#060912', lineHeight: 20,
  },

  // Shared buttons
  primaryBtn: {
    backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Voice part sections
  voicePartSection: {
    backgroundColor: '#0B1120', borderRadius: 14, borderWidth: 1,
    borderColor: '#1F2937', marginBottom: 12, overflow: 'hidden',
  },
  voicePartHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#1F2937',
  },
  voicePartLabel: {
    color: '#818CF8', fontSize: 11, fontWeight: '900',
    letterSpacing: 1.2, flex: 1,
  },
  countBadge: {
    backgroundColor: '#312E81', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2, marginRight: 8,
  },
  countBadgeText: { color: '#A5B4FC', fontSize: 11, fontWeight: '800' },
  uploadBtn: {
    backgroundColor: '#1F2937', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#374151',
  },
  uploadBtnText: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },

  // Audio player
  audioPlayer: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#060D1A',
    borderBottomWidth: 1, borderBottomColor: '#1F2937',
  },
  audioPlayerActive: { backgroundColor: '#0D1A3A' },
  playBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1F2937',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#374151',
  },
  playBtnActive: { backgroundColor: '#4F46E5', borderColor: '#6366F1' },
  playBtnIcon: { color: '#fff', fontSize: 14, fontWeight: '900' },
  audioFileName: { color: '#D1D5DB', fontSize: 12, fontWeight: '600' },
  progressTrack: {
    height: 3, backgroundColor: '#1F2937', borderRadius: 2, marginTop: 6,
  },
  progressFill: {
    height: 3, backgroundColor: '#4F46E5', borderRadius: 2,
  },
  removeAudioText: { color: '#4B5563', fontSize: 16 },

  voicePartEmpty: {
    color: '#374151', fontSize: 12, fontStyle: 'italic',
    paddingHorizontal: 14, paddingVertical: 10,
  },

  // Vocal row (inside voice part section)
  vocalRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#1F2937',
  },
  vocalType: { color: '#6B7280', fontSize: 12, marginTop: 2 },

  // Shared
  removeBtn: { padding: 8 },
  removeBtnText: { color: '#6B7280', fontSize: 15, fontWeight: '700' },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0B1120', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 16, maxHeight: '88%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '900', flex: 1 },
  modalClose: { color: '#9CA3AF', fontSize: 20, padding: 4 },
  modalSectionLabel: {
    color: '#6B7280', fontSize: 11, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  previewNote: { color: '#6B7280', fontSize: 12, marginBottom: 10, lineHeight: 17 },
  lyricsPreviewText: {
    color: '#C9D1DB', fontSize: 13, lineHeight: 21,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    padding: 4,
  },

  // Voice part chips in assign modal
  vpChip: {
    backgroundColor: '#1F2937', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    marginRight: 8, borderWidth: 1, borderColor: '#374151',
  },
  vpChipActive: { backgroundColor: '#312E81', borderColor: '#818CF8' },
  vpChipText: { color: '#9CA3AF', fontWeight: '700', fontSize: 13 },
  vpChipTextActive: { color: '#C7D2FE' },

  // Type chips
  typeChip: {
    flex: 1, marginRight: 8, paddingVertical: 9,
    backgroundColor: '#1F2937', borderRadius: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#374151',
  },
  typeChipActive: { backgroundColor: '#1E3A5F', borderColor: '#3B82F6' },
  typeChipText: { color: '#9CA3AF', fontWeight: '700', fontSize: 13 },
  typeChipTextActive: { color: '#93C5FD' },

  pickHint: { color: '#6B7280', fontSize: 12, fontStyle: 'italic', marginBottom: 8 },
  modalSearch: {
    backgroundColor: '#1F2937', color: '#fff', borderRadius: 10,
    padding: 10, fontSize: 14, marginBottom: 12,
  },
  personRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1F2937',
  },
  personAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#312E81',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  personAvatarText: { color: '#A5B4FC', fontWeight: '700', fontSize: 15 },
  personName: { color: '#E5E7EB', fontSize: 15, fontWeight: '600' },
  personRoles: { color: '#6B7280', fontSize: 12, marginTop: 2 },
});
