import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { addOrUpdateSong, getSettings } from '../data/storage';
import { makeId, ROUTING_TRACKS, OUTPUT_COLORS, getOutputOptions, makeDefaultSettings } from '../data/models';
import CineStageProcessingOverlay from '../components/CineStageProcessingOverlay';

const CINESTAGE_STEPS = [
  'Collecting song info',
  'Separating stems',
  'Preparing tracks',
  'Job done!',
];

const TIME_SIGS = ['4/4', '3/4', '6/8', '2/4', '5/4', '12/8'];

const ROLES = ['Vocals', 'Guitar', 'Bass', 'Drums', 'Keys', 'Other'];
const ROLE_COLORS = {
  Vocals: '#F472B6',
  Guitar: '#FB923C',
  Bass: '#60A5FA',
  Drums: '#34D399',
  Keys: '#A78BFA',
  Other: '#FBBF24',
};

// ── Chord detection ──────────────────────────────────────────────────────────
const CHORD_RE = /^[A-G][b#]?(?:m(?:aj)?|min|aug|dim|sus[24]?|add\d+)?(?:\d+)?(?:\/[A-G][b#]?)?$/;

function isChord(token) {
  return CHORD_RE.test(token.trim());
}

function classifyLine(line) {
  const t = line.trim();
  if (!t) return 'empty';
  if ((t.startsWith('[') && t.endsWith(']')) ||
      /^(intro|verse|pre-?chorus|chorus|bridge|outro|tag|vamp|hook|interlude|breakdown|refrain|ending|turn)\s*[\d:.]*\s*$/i.test(t)) {
    return 'section';
  }
  const tokens = t.split(/\s+/).filter(Boolean);
  const chordCount = tokens.filter(isChord).length;
  if (tokens.length > 0 && chordCount / tokens.length >= 0.55) return 'chords';
  return 'lyric';
}

// Inline chord chart renderer used inside each section card
function ChordChartView({ text }) {
  const lines = (text || '').split('\n');
  return (
    <View>
      {lines.map((line, i) => {
        const type = classifyLine(line);
        if (type === 'empty') return <View key={i} style={{ height: 8 }} />;
        if (type === 'chords') {
          return (
            <View key={i} style={ccStyles.chordRow}>
              {line.trim().split(/(\s+)/).map((part, j) =>
                /^\s+$/.test(part) ? (
                  <Text key={j} style={ccStyles.space}>{part}</Text>
                ) : (
                  <Text key={j} style={isChord(part) ? ccStyles.chord : ccStyles.other}>
                    {part}
                  </Text>
                )
              )}
            </View>
          );
        }
        return <Text key={i} style={ccStyles.lyric}>{line}</Text>;
      })}
    </View>
  );
}

const ccStyles = StyleSheet.create({
  chordRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, marginBottom: 1 },
  chord: { color: '#FBBF24', fontWeight: '700', fontSize: 14, fontFamily: 'monospace' },
  other: { color: '#9CA3AF', fontSize: 14, fontFamily: 'monospace' },
  space: { color: 'transparent', fontSize: 14 },
  lyric: { color: '#E5E7EB', fontSize: 14, lineHeight: 22 },
});

// ── Auto-recognize: split pasted text into named sections ────────────────────
const SECTION_HEADER_RE = /^(intro|verse\s*\d*|pre-?chorus|chorus|bridge|outro|tag|vamp|hook|interlude|breakdown|refrain|ending|turn)\s*[\d:.]*\s*$/i;

function autoRecognizeSections(text) {
  const lines = text.split('\n');
  const result = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const isBracket = trimmed.startsWith('[') && trimmed.endsWith(']');
    const isNamedSection = SECTION_HEADER_RE.test(trimmed);

    if (trimmed && (isBracket || isNamedSection)) {
      if (current) {
        result.push({ ...current, content: current.lines.join('\n').trim() });
      }
      const name = isBracket ? trimmed.slice(1, -1).trim() : trimmed;
      current = { id: makeId('sec'), name, lines: [], expanded: true, parts: {} };
    } else {
      if (!current) {
        current = { id: makeId('sec'), name: 'Intro', lines: [], expanded: true, parts: {} };
      }
      current.lines.push(line);
    }
  }

  if (current) {
    const content = current.lines.join('\n').trim();
    if (content || result.length === 0) {
      result.push({ ...current, content });
    }
  }

  return result.filter((s) => s.name || s.content);
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function SongDetailScreen({ route, navigation }) {
  const incomingSong = route?.params?.song || null;
  const isNew = !incomingSong?.id;

  const [songId] = useState(incomingSong?.id || makeId('song'));
  const [title, setTitle] = useState(incomingSong?.title || '');
  const [artist, setArtist] = useState(incomingSong?.artist || '');
  const [key, setKey] = useState(incomingSong?.originalKey || incomingSong?.key || '');
  const [bpm, setBpm] = useState(incomingSong?.bpm ? String(incomingSong.bpm) : '');
  const [timeSig, setTimeSig] = useState(incomingSong?.timeSig || '4/4');
  const [youtubeLink, setYoutubeLink] = useState(incomingSong?.youtubeLink || '');
  const [tags, setTags] = useState(incomingSong?.tags || '');
  const [routing, setRouting] = useState(incomingSong?.routing || {});
  const [routingExpanded, setRoutingExpanded] = useState(false);
  const [cueSync, setCueSync] = useState(incomingSong?.cueSync || { enabled: false });
  const [routingPicker, setRoutingPicker] = useState({ open: false, key: null });
  const [settingsRouting, setSettingsRouting] = useState({ interfaceChannels: 2, global: {} });
  const [dirty, setDirty] = useState(isNew);

  // Arrangement Editor
  const [rawChart, setRawChart] = useState(incomingSong?.lyricsChordChart || '');
  const [sections, setSections] = useState(incomingSong?.sections || []);
  const [addSectionName, setAddSectionName] = useState('');
  const [addSectionVisible, setAddSectionVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null); // null = All

  // CineStage processing
  const [apiBase, setApiBase] = useState('http://localhost:8000');
  const [userId, setUserId] = useState('demo-user');
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);

  const [currentSong, setCurrentSong] = useState(incomingSong);
  const hasStemsDone =
    Object.keys(currentSong?.localStems || {}).length > 0 ||
    (() => {
      const raw = currentSong?.latestStemsJob?.result?.stems;
      if (!raw) return false;
      if (Array.isArray(raw)) return raw.length > 0;
      if (typeof raw === 'object') return Object.keys(raw).length > 0;
      return false;
    })();

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      if (settings.apiBase) setApiBase(settings.apiBase);
      if (settings.defaultUserId) setUserId(settings.defaultUserId);
      const defaults = makeDefaultSettings();
      setSettingsRouting({
        interfaceChannels: settings.routing?.interfaceChannels ?? defaults.routing.interfaceChannels,
        global: { ...defaults.routing.global, ...(settings.routing?.global || {}) },
      });
    })();
  }, []);

  function markDirty() { setDirty(true); }

  function buildSongObject() {
    return {
      ...(currentSong || {}),
      id: songId,
      title: title.trim() || 'Untitled',
      artist: artist.trim(),
      originalKey: key,
      bpm: bpm ? Number(bpm) : null,
      timeSig,
      youtubeLink: youtubeLink.trim(),
      tags: tags.trim(),
      routing,
      lyricsChordChart: rawChart,
      sections,
      cueSync,
    };
  }

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Song name required', 'Please enter a song name before saving.');
      return;
    }
    try {
      const saved = await addOrUpdateSong(buildSongObject());
      setCurrentSong(saved);
      setDirty(false);
      if (isNew) navigation.setParams({ song: saved });
      Alert.alert('Saved', `"${saved.title}" has been saved.`);
    } catch (e) {
      Alert.alert('Error', String(e.message || e));
    }
  }

  function handleAutoRecognize() {
    if (!rawChart.trim()) {
      Alert.alert('Nothing to recognize', 'Paste your lyrics and chord chart first.');
      return;
    }
    const parsed = autoRecognizeSections(rawChart);
    if (!parsed.length) {
      Alert.alert('No sections found', 'Make sure section names are on their own line, e.g.\n[Verse 1] or Chorus');
      return;
    }
    setSections(parsed);
    markDirty();
  }

  function toggleSection(id) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, expanded: !s.expanded } : s))
    );
  }

  function removeSection(id) {
    setSections((prev) => prev.filter((s) => s.id !== id));
    markDirty();
  }

  function handleAddSection() {
    const name = addSectionName.trim();
    if (!name) return;
    setSections((prev) => [...prev, { id: makeId('sec'), name, content: '', expanded: true, parts: {} }]);
    setAddSectionName('');
    setAddSectionVisible(false);
    markDirty();
  }

  function updateSectionPart(sectionId, role, value) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, parts: { ...(s.parts || {}), [role]: value } }
          : s
      )
    );
    markDirty();
  }

  async function handleRunCineStage() {
    const link = youtubeLink.trim();
    if (!link) {
      Alert.alert('YouTube link required', 'Add a YouTube link so CineStage can separate the stems.');
      return;
    }

    let songToProcess = currentSong;
    if (dirty || isNew) {
      try {
        songToProcess = await addOrUpdateSong(buildSongObject());
        setCurrentSong(songToProcess);
        setDirty(false);
      } catch { /* proceed anyway */ }
    }

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
        body: JSON.stringify({ user_id: userId, title: songToProcess.title, file_url: link }),
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
          if (lastStatus !== 'PROCESSING') { setProcessingStep(1); setProcessingProgress(30); }
          else setProcessingProgress((p) => Math.min(82, p + 0.8));
        }
        lastStatus = current.status;
        if (attempts > 80) break;
      }

      if (current.status !== 'COMPLETED') {
        setProcessing(false);
        Alert.alert('Processing error', `Job ended with status: ${current.status}`);
        return;
      }

      setProcessingStep(2);
      setProcessingProgress(90);

      const result = current.result || {};
      const updated = await addOrUpdateSong({
        ...songToProcess,
        originalKey: current.key || result.key || songToProcess.originalKey || '',
        bpm: current.bpm || result.bpm || songToProcess.bpm || null,
        latestStemsJob: current,
      });
      setCurrentSong(updated);

      setProcessingStep(3);
      setProcessingProgress(100);
      await new Promise((r) => setTimeout(r, 900));
      setProcessing(false);

      navigation.navigate('Rehearsal', { song: updated, apiBase });
    } catch (e) {
      setProcessing(false);
      Alert.alert('Error', String(e.message || e));
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* ── Song Details ── */}
        <Text style={styles.sectionTitle}>Song Details</Text>
        <Text style={styles.sectionSub}>
          Only the fields below are required for planning and rehearsal.
        </Text>

        {/* Title */}
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={(v) => { setTitle(v); markDirty(); }}
          placeholder="Song name"
          placeholderTextColor="#4B5563"
          returnKeyType="next"
        />

        {/* Artist */}
        <TextInput
          style={[styles.input, styles.mt8]}
          value={artist}
          onChangeText={(v) => { setArtist(v); markDirty(); }}
          placeholder="Artist"
          placeholderTextColor="#4B5563"
          returnKeyType="next"
        />

        {/* Key + BPM row */}
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex1]}
            value={key}
            onChangeText={(v) => { setKey(v); markDirty(); }}
            placeholder="Key  (e.g. C, F#)"
            placeholderTextColor="#4B5563"
            autoCapitalize="characters"
            maxLength={3}
            returnKeyType="next"
          />
          <TextInput
            style={[styles.input, styles.flex1]}
            value={bpm}
            onChangeText={(v) => { setBpm(v.replace(/[^0-9]/g, '')); markDirty(); }}
            placeholder="BPM"
            placeholderTextColor="#4B5563"
            keyboardType="number-pad"
            maxLength={3}
            returnKeyType="done"
          />
        </View>

        {/* Time sig + YouTube row */}
        <View style={styles.row}>
          <View style={[styles.flex1]}>
            <View style={styles.timeSigRow}>
              {TIME_SIGS.map((ts) => (
                <TouchableOpacity
                  key={ts}
                  style={[styles.tsChip, timeSig === ts && styles.tsChipActive]}
                  onPress={() => { setTimeSig(ts); markDirty(); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tsChipText, timeSig === ts && styles.tsChipTextActive]}>{ts}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TextInput
            style={[styles.input, styles.flex1]}
            value={youtubeLink}
            onChangeText={(v) => { setYoutubeLink(v); markDirty(); }}
            placeholder="YouTube Link"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />
        </View>

        {/* Tags */}
        <TextInput
          style={[styles.input, styles.mt8]}
          value={tags}
          onChangeText={(v) => { setTags(v); markDirty(); }}
          placeholder="Theme / Tags (comma separated)"
          placeholderTextColor="#4B5563"
          returnKeyType="done"
          autoCorrect={false}
        />

        {/* Audio Routing per-song overrides */}
        {(() => {
          const overrideCount = ROUTING_TRACKS.filter((t) => routing[t.key]).length;
          const outputOptions = ['Use Global', ...getOutputOptions(settingsRouting.interfaceChannels)];
          const pickerTrack = ROUTING_TRACKS.find((t) => t.key === routingPicker.key);

          return (
            <>
              <TouchableOpacity
                style={styles.routingToggleRow}
                onPress={() => setRoutingExpanded((e) => !e)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.routingToggleLabel}>🔊 Audio Routing</Text>
                  {overrideCount > 0 && (
                    <View style={styles.routingOverrideBadge}>
                      <Text style={styles.routingOverrideBadgeText}>{overrideCount} override{overrideCount !== 1 ? 's' : ''}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: '#4B5563', fontSize: 14 }}>{routingExpanded ? '∧' : '∨'}</Text>
              </TouchableOpacity>

              {routingExpanded && (
                <View style={styles.routingCard}>
                  {['Timing', 'Instruments', 'Mix'].map((group, gi) => {
                    const tracks = ROUTING_TRACKS.filter((t) => t.group === group);
                    return (
                      <View key={group}>
                        {gi > 0 && <View style={styles.routingCardDivider} />}
                        <Text style={styles.routingGroupName}>{group}</Text>
                        {tracks.map((track) => {
                          const override = routing[track.key];
                          const globalVal = settingsRouting.global[track.key] || 'Main L/R';
                          const color = override ? (OUTPUT_COLORS[override] || '#818CF8') : '#374151';
                          return (
                            <TouchableOpacity
                              key={track.key}
                              style={styles.songRoutingRow}
                              onPress={() => setRoutingPicker({ open: true, key: track.key })}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.songRoutingLabel}>{track.label}</Text>
                              <View style={[
                                styles.songRoutingBadge,
                                override && { borderColor: color + '55', backgroundColor: color + '15' },
                              ]}>
                                <Text style={[styles.songRoutingValue, { color: override ? color : '#4B5563' }]}>
                                  {override || `Global · ${globalVal}`}
                                </Text>
                                <Text style={{ color: '#374151', fontSize: 10 }}>▾</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Routing picker modal */}
              <Modal
                visible={routingPicker.open}
                transparent
                animationType="fade"
                onRequestClose={() => setRoutingPicker({ open: false, key: null })}
              >
                <Pressable
                  style={styles.routingModalOverlay}
                  onPress={() => setRoutingPicker({ open: false, key: null })}
                >
                  <View style={styles.routingPickerCard}>
                    <Text style={styles.routingPickerTitle}>{pickerTrack?.label || ''}</Text>
                    {outputOptions.map((opt) => {
                      const trackKey = routingPicker.key;
                      const currentVal = trackKey ? (routing[trackKey] || 'Use Global') : 'Use Global';
                      const isActive = currentVal === opt;
                      const c = opt === 'Use Global' ? '#6B7280' : (OUTPUT_COLORS[opt] || '#818CF8');
                      const globalVal = trackKey ? (settingsRouting.global[trackKey] || 'Main L/R') : '';
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.routingPickerOption, isActive && { backgroundColor: c + '20', borderColor: c + '44' }]}
                          onPress={() => {
                            if (trackKey) {
                              setRouting((prev) => ({ ...prev, [trackKey]: opt === 'Use Global' ? null : opt }));
                              markDirty();
                            }
                            setRoutingPicker({ open: false, key: null });
                          }}
                        >
                          <View style={[styles.routingPickerDot, { backgroundColor: isActive ? c : '#1F2937' }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.routingPickerOptText, isActive && { color: c, fontWeight: '800' }]}>
                              {opt}
                            </Text>
                            {opt === 'Use Global' && (
                              <Text style={{ color: '#374151', fontSize: 11, marginTop: 1 }}>→ {globalVal}</Text>
                            )}
                          </View>
                          {isActive && <Text style={{ color: c, fontWeight: '800', fontSize: 14 }}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </Pressable>
              </Modal>
            </>
          );
        })()}

        {/* Cue Sync toggle */}
        <TouchableOpacity
          style={styles.cueSyncRow}
          onPress={() => { setCueSync((prev) => ({ ...prev, enabled: !prev.enabled })); markDirty(); }}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cueSyncLabel}>🎬 Lyric Cue Sync</Text>
            <Text style={styles.cueSyncSub}>
              {cueSync.enabled
                ? 'Cues fire to ProPresenter / lyric software when sections are tapped'
                : 'Off — tap to enable cue sending via Bridge'}
            </Text>
          </View>
          <View style={[styles.cueSyncPill, cueSync.enabled && styles.cueSyncPillOn]}>
            <Text style={[styles.cueSyncPillText, cueSync.enabled && styles.cueSyncPillTextOn]}>
              {cueSync.enabled ? 'ON' : 'OFF'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.saveBtn, !dirty && styles.saveBtnDim]}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>{isNew ? '+ Add Song' : 'Save Song'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cineBtn, !youtubeLink.trim() && styles.cineBtnDim]}
            onPress={handleRunCineStage}
            activeOpacity={0.8}
          >
            <Text style={styles.cineBtnText}>Run CineStage™</Text>
          </TouchableOpacity>
        </View>

        {/* ── Arrangement Editor ── */}
        <View style={styles.arrangeDivider} />
        <Text style={styles.sectionTitle}>Arrangement Editor</Text>

        <Text style={styles.mediaSub}>
          Paste the full song map to auto-recognize sections, or add sections manually.
        </Text>

        {/* Paste area */}
        <TextInput
          style={styles.chartInput}
          value={rawChart}
          onChangeText={(v) => { setRawChart(v); markDirty(); }}
          multiline
          placeholder={'Paste lyrics / chord map here...\n\n[Verse 1]\nAm    G    C    F\nAmazing grace how sweet the sound\n\n[Chorus]\nC    G    Am    F\nHow great is our God...'}
          placeholderTextColor="#374151"
          textAlignVertical="top"
          scrollEnabled={false}
          autoCorrect={false}
          autoCapitalize="none"
        />

        {/* Auto Recognize button */}
        <TouchableOpacity
          style={styles.autoRecognizeBtn}
          onPress={handleAutoRecognize}
          activeOpacity={0.8}
        >
          <Text style={styles.autoRecognizeText}>Auto Recognize</Text>
        </TouchableOpacity>

        {/* ── Role / Parts selector ── */}
        {sections.length > 0 && (
          <View style={styles.roleBar}>
            <Text style={styles.roleBarLabel}>View as:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleScroll}>
              <TouchableOpacity
                style={[styles.roleChip, !selectedRole && styles.roleChipAll]}
                onPress={() => setSelectedRole(null)}
                activeOpacity={0.7}
              >
                <Text style={[styles.roleChipText, !selectedRole && styles.roleChipTextAll]}>All</Text>
              </TouchableOpacity>
              {ROLES.map((r) => (
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
          </View>
        )}

        {/* Sections list */}
        {sections.length === 0 ? (
          <Text style={styles.noSections}>No media yet.</Text>
        ) : (
          sections.map((sec) => (
            <View key={sec.id} style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.sectionCardHeader}
                onPress={() => toggleSection(sec.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.sectionCardName}>{sec.name}</Text>
                <View style={styles.sectionCardRight}>
                  {/* Role dots — show which roles have notes */}
                  {!selectedRole && (
                    <View style={styles.partDots}>
                      {ROLES.filter((r) => sec.parts?.[r]?.trim()).map((r) => (
                        <View key={r} style={[styles.partDotSmall, { backgroundColor: ROLE_COLORS[r] }]} />
                      ))}
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => removeSection(sec.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.removeBtn}>✕</Text>
                  </TouchableOpacity>
                  <Text style={styles.chevron}>{sec.expanded ? '▲' : '▼'}</Text>
                </View>
              </TouchableOpacity>

              {sec.expanded && (
                <View style={styles.sectionContent}>
                  {/* Chord chart */}
                  {sec.content ? (
                    <ChordChartView text={sec.content} />
                  ) : (
                    <Text style={styles.sectionEmpty}>No chart content</Text>
                  )}

                  {/* ── Parts area ── */}
                  {selectedRole ? (
                    // Single-role focused view
                    <View style={[styles.partBox, { borderColor: ROLE_COLORS[selectedRole] + '55' }]}>
                      <View style={styles.partBoxHeader}>
                        <View style={[styles.roleDot, { backgroundColor: ROLE_COLORS[selectedRole] }]} />
                        <Text style={[styles.partBoxRole, { color: ROLE_COLORS[selectedRole] }]}>
                          {selectedRole}
                        </Text>
                      </View>
                      <TextInput
                        style={styles.partBoxInput}
                        value={sec.parts?.[selectedRole] || ''}
                        onChangeText={(v) => updateSectionPart(sec.id, selectedRole, v)}
                        placeholder={`Add ${selectedRole} notes for this section...`}
                        placeholderTextColor="#374151"
                        multiline
                        textAlignVertical="top"
                        scrollEnabled={false}
                        autoCorrect={false}
                      />
                    </View>
                  ) : (
                    // All-roles summary: show every role that has notes + empty ones collapsed
                    <View style={styles.allPartsGrid}>
                      {ROLES.map((r) => {
                        const note = sec.parts?.[r] || '';
                        return (
                          <TouchableOpacity
                            key={r}
                            style={styles.allPartRow}
                            onPress={() => setSelectedRole(r)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.roleDot, { backgroundColor: ROLE_COLORS[r] }]} />
                            <Text style={styles.allPartRole}>{r}</Text>
                            <Text style={styles.allPartNote} numberOfLines={1}>
                              {note || '—'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          ))
        )}

        {/* Add Section */}
        {addSectionVisible ? (
          <View style={styles.addSecRow}>
            <TextInput
              style={[styles.input, styles.flex1]}
              value={addSectionName}
              onChangeText={setAddSectionName}
              placeholder="Section name (e.g. Verse 2)"
              placeholderTextColor="#4B5563"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddSection}
            />
            <TouchableOpacity style={styles.addSecConfirm} onPress={handleAddSection} activeOpacity={0.8}>
              <Text style={styles.addSecConfirmText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addSecCancel} onPress={() => setAddSectionVisible(false)}>
              <Text style={styles.addSecCancelText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addSectionBtn}
            onPress={() => setAddSectionVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.addSectionBtnText}>+ Add Section</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

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
  root: { flex: 1, backgroundColor: '#020617' },
  container: { padding: 20, paddingBottom: 80 },

  sectionTitle: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionSub: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  mediaSub: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },

  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#F9FAFB',
    fontSize: 14,
  },
  mt8: { marginTop: 8 },
  flex1: { flex: 1 },

  row: { flexDirection: 'row', gap: 8, marginTop: 8 },

  timeSigRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tsChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  tsChipActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  tsChipText: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  tsChipTextActive: { color: '#FFFFFF' },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  saveBtn: {
    backgroundColor: '#166534',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  saveBtnDim: { opacity: 0.5 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  cineBtn: {
    backgroundColor: '#1E1B4B',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  cineBtnDim: { opacity: 0.4 },
  cineBtnText: { color: '#818CF8', fontWeight: '700', fontSize: 13 },


  arrangeDivider: {
    height: 1,
    backgroundColor: '#111827',
    marginVertical: 24,
  },

  chartInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 8,
    padding: 12,
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 21,
    fontFamily: 'monospace',
    minHeight: 160,
    textAlignVertical: 'top',
  },

  autoRecognizeBtn: {
    marginTop: 10,
    backgroundColor: '#166534',
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  autoRecognizeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  noSections: {
    color: '#374151',
    fontSize: 13,
    marginTop: 16,
    fontStyle: 'italic',
  },

  sectionCard: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginTop: 10,
    overflow: 'hidden',
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  sectionCardName: {
    color: '#818CF8',
    fontWeight: '700',
    fontSize: 14,
    textTransform: 'capitalize',
    flex: 1,
  },
  sectionCardRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  removeBtn: { color: '#4B5563', fontSize: 13 },
  chevron: { color: '#4B5563', fontSize: 11 },

  sectionContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderColor: '#111827',
    paddingTop: 10,
  },
  sectionEmpty: { color: '#374151', fontSize: 13, fontStyle: 'italic' },

  addSecRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  addSecConfirm: {
    backgroundColor: '#166534',
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  addSecConfirmText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  addSecCancel: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  addSecCancelText: { color: '#9CA3AF', fontSize: 13 },

  addSectionBtn: {
    marginTop: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
  },
  addSectionBtnText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },

  // Role selector
  roleBar: { marginTop: 14, marginBottom: 2 },
  roleBarLabel: { color: '#6B7280', fontSize: 11, marginBottom: 6 },
  roleScroll: { gap: 6 },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  roleChipAll: { backgroundColor: '#1E1B4B', borderColor: '#4338CA' },
  roleChipText: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  roleChipTextAll: { color: '#818CF8' },
  roleDot: { width: 8, height: 8, borderRadius: 4 },

  // Section parts
  partDots: { flexDirection: 'row', gap: 4, marginRight: 4 },
  partDotSmall: { width: 7, height: 7, borderRadius: 4 },

  partBox: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#060D1A',
    padding: 12,
  },
  partBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  partBoxRole: { fontWeight: '700', fontSize: 13 },
  partBoxInput: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 20,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  allPartsGrid: { marginTop: 12, gap: 0 },
  allPartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#0F172A',
  },
  allPartRole: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 52 },
  allPartNote: { color: '#9CA3AF', fontSize: 12, flex: 1 },

  // Audio Routing
  routingToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, marginTop: 4, marginBottom: 2,
  },
  routingToggleLabel: { color: '#9CA3AF', fontWeight: '700', fontSize: 13 },
  routingOverrideBadge: {
    backgroundColor: '#1E1B4B', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#4338CA',
  },
  routingOverrideBadgeText: { color: '#818CF8', fontSize: 10, fontWeight: '800' },
  routingCard: {
    borderRadius: 14, borderWidth: 1, borderColor: '#1F2937',
    backgroundColor: '#0B1120', marginBottom: 12, overflow: 'hidden',
  },
  routingCardDivider: { height: 1, backgroundColor: '#1F2937' },
  routingGroupName: {
    color: '#374151', fontSize: 10, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 3,
  },
  songRoutingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: '#0F172A',
  },
  songRoutingLabel: { color: '#D1D5DB', fontWeight: '700', fontSize: 13 },
  songRoutingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    borderWidth: 1, borderColor: '#1F2937',
  },
  songRoutingValue: { fontSize: 11, fontWeight: '700' },

  // Routing picker modal
  routingModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center',
  },
  routingPickerCard: {
    width: 270, backgroundColor: '#0F172A', borderRadius: 18,
    borderWidth: 1, borderColor: '#1F2937', padding: 16,
  },
  routingPickerTitle: {
    color: '#9CA3AF', fontSize: 11, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 12,
  },
  routingPickerOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 10, borderWidth: 1, borderColor: 'transparent', marginBottom: 4,
  },
  routingPickerDot: { width: 8, height: 8, borderRadius: 4 },
  routingPickerOptText: { color: '#9CA3AF', fontSize: 14 },

  // Cue Sync toggle
  cueSyncRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 10, marginBottom: 2,
    padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#1F2937',
    backgroundColor: '#0B1120',
  },
  cueSyncLabel: { color: '#E5E7EB', fontWeight: '700', fontSize: 13 },
  cueSyncSub: { color: '#4B5563', fontSize: 11, marginTop: 2, lineHeight: 16 },
  cueSyncPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1, borderColor: '#374151',
  },
  cueSyncPillOn: { backgroundColor: '#0F2822', borderColor: '#059669' },
  cueSyncPillText: { color: '#6B7280', fontWeight: '800', fontSize: 12 },
  cueSyncPillTextOn: { color: '#34D399' },
});
