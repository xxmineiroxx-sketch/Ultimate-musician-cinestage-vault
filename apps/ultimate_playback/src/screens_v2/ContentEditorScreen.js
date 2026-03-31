/**
 * Content Editor Screen - Ultimate Playback
 * Submit chord chart / lyrics / keyboard rigs as proposals to Musician.
 * MD/Admin users apply directly. Others submit for approval.
 *
 * Instrument filter: if instrumentParam is passed, the picker is locked
 * to that instrument only — no other instrument tabs appear.
 *
 * Keys/Synth: supports @[RigName] inline color tags (Nord, MODX, VS, etc.)
 * Preview tab renders each rig annotation in its assigned color.
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile } from '../services/storage';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';
import ChartReferencePanel from '../components/ChartReferencePanel';

// All known instrument parts
const ALL_INSTRUMENTS = [
  { label: 'Vocals',          icon: '🎤' },
  { label: 'Keys',            icon: '🎹' },
  { label: 'Acoustic Guitar', icon: '🎸' },
  { label: 'Electric Guitar', icon: '⚡' },
  { label: 'Bass',            icon: '🎸' },
  { label: 'Synth/Pad',       icon: '🎛' },
  { label: 'Drums',           icon: '🥁' },
];

// Keyboard rigs — colors match the actual rig color coding (Nord=red, MODX=green)
const DEFAULT_RIGS = ['Nord', 'MODX', 'VS', 'Kontakt', 'Ableton'];
const RIG_COLORS = {
  Nord:    '#EF4444',  // Red
  MODX:    '#10B981',  // Green
  VS:      '#EAB308',  // Yellow
  Kontakt: '#F97316',  // Orange
  Ableton: '#3B82F6',  // Blue
};

// ── Inline rig tag parser ──────────────────────────────────────────────────────
// Splits a line like "@[MODX] fa fa, @[Nord] la sol" into colored segments.
function parseInlineRigs(line) {
  const RE = /@\[([^\]]+)\]/g;
  const parts = [];
  let lastIndex = 0;
  let lastRig = null;
  let m;
  while ((m = RE.exec(line)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ rig: lastRig, text: line.slice(lastIndex, m.index) });
    }
    lastRig = m[1];
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < line.length) {
    parts.push({ rig: lastRig, text: line.slice(lastIndex) });
  }
  return parts.filter(p => p.text);
}

function classifyLine(line) {
  const t = line.trim();
  if (!t) return 'empty';
  if ((t.startsWith('[') && t.endsWith(']')) ||
      /^(intro|verse|pre-?chorus|chorus|bridge|outro|solo|final|tag|vamp|ponte|refrão|pre-refrão|instrumental)\s*[\d:.]*\s*$/i.test(t)) {
    return 'section';
  }
  if (/@\[/.test(t)) return 'rig';
  return 'lyric';
}

// ── Chart preview component ────────────────────────────────────────────────────
function ChartPreview({ text, allRigColors }) {
  const lines = (text || '').split('\n');
  const colors = { ...RIG_COLORS, ...allRigColors };
  return (
    <View>
      {lines.map((line, i) => {
        const type = classifyLine(line);
        if (type === 'empty') return <View key={i} style={{ height: 6 }} />;

        if (type === 'section') {
          return (
            <Text key={i} style={pv.section}>{line}</Text>
          );
        }

        if (type === 'rig') {
          const segments = parseInlineRigs(line);
          return (
            <View key={i} style={pv.rigLine}>
              {segments.map((seg, j) => {
                const col = seg.rig ? (colors[seg.rig] || '#A78BFA') : '#6B7280';
                return (
                  <Text key={j} style={[
                    pv.rigSeg,
                    seg.rig ? { color: col, backgroundColor: col + '18', fontWeight: '700' } : { color: '#6B7280' },
                  ]}>
                    {seg.text}
                  </Text>
                );
              })}
            </View>
          );
        }

        return <Text key={i} style={pv.lyric}>{line}</Text>;
      })}
    </View>
  );
}

const pv = StyleSheet.create({
  section: { fontSize: 11, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 2, fontFamily: 'Courier' },
  rigLine: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 3 },
  rigSeg:  { fontSize: 14, fontFamily: 'Courier', lineHeight: 22, paddingHorizontal: 2, borderRadius: 3 },
  lyric:   { color: '#F9FAFB', fontSize: 14, lineHeight: 22, fontFamily: 'Courier' },
});

// ── Fetch helper ───────────────────────────────────────────────────────────────
async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(tid); }
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function ContentEditorScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const {
    song,
    serviceId,
    type             = 'lyrics',
    existing         = '',
    isAdmin          = false,
    instrument: instrumentParam = '',
    userRole         = '',
  } = route.params || {};

  const isLyrics = type === 'lyrics';
  const isLocked = !isLyrics && !!instrumentParam;

  const [instrument, setInstrument] = useState(
    isLyrics ? 'Vocals' : (instrumentParam || '')
  );
  const [content,  setContent]  = useState(existing || '');
  const [sending,  setSending]  = useState(false);
  const [submitted,setSubmitted]= useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Cursor position for rig tag insertion
  const editorRef = useRef(null);
  const [cursor, setCursor] = useState(0);

  // Keyboard rigs state
  const [selRigs,    setSelRigs]    = useState([]);
  const [customRig,  setCustomRig]  = useState('');
  const [addingRig,  setAddingRig]  = useState(false);
  const [customRigs, setCustomRigs] = useState([]);

  const isKeys     = instrument === 'Keys' || instrument === 'Synth/Pad';
  const instrEntry = ALL_INSTRUMENTS.find(i => i.label === instrument);
  const instrIcon  = instrEntry?.icon || (isLyrics ? '🎤' : '🎼');
  const screenTitle = isLyrics
    ? 'Edit Lyrics'
    : (instrument ? `${instrIcon} ${instrument} Part` : 'Edit Chord Chart');

  const visibleInstruments = isLocked
    ? ALL_INSTRUMENTS.filter(i => i.label === instrumentParam)
    : ALL_INSTRUMENTS.filter(i => i.label !== 'Vocals');

  const allRigs = [...DEFAULT_RIGS, ...customRigs];
  const allRigColors = Object.fromEntries(
    allRigs.map((r, idx) => [r, RIG_COLORS[r] || ['#A78BFA','#EC4899','#06B6D4','#84CC16'][idx % 4]])
  );

  function toggleRig(rig) {
    setSelRigs(prev => prev.includes(rig) ? prev.filter(r => r !== rig) : [...prev, rig]);
  }

  function addCustomRig() {
    const name = customRig.trim();
    if (!name) return;
    setCustomRigs(prev => [...prev, name]);
    setSelRigs(prev => [...prev, name]);
    setCustomRig('');
    setAddingRig(false);
  }

  // Insert @[Rig] tag at current cursor position
  function insertRigTag(rig) {
    const tag = `@[${rig}] `;
    setContent(c => {
      const pos = Math.min(cursor, c.length);
      return c.slice(0, pos) + tag + c.slice(pos);
    });
    setCursor(cur => cur + tag.length);
    setSelRigs(prev => prev.includes(rig) ? prev : [...prev, rig]);
  }

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert('Empty', `Please enter the ${isLyrics ? 'lyrics' : 'chart'} before submitting.`);
      return;
    }
    if (!isLyrics && !instrument) {
      Alert.alert('Select Instrument', 'Please select which instrument this chart is for.');
      return;
    }
    setSending(true);
    try {
      const profile = await getUserProfile();
      const hdrs = { ...syncHeaders(), 'Content-Type': 'application/json' };

      // Worship Leader role also gets direct-apply access (same as admin)
      const wpRole = userRole || profile?.assignmentRole || '';
      const isWL = wpRole === 'worship_leader' || wpRole === 'Worship Leader';
      const isPrivileged = isAdmin || isWL;
      const senderRole = profile?.grantedRole || wpRole || '';

      if (isPrivileged) {
        const field = isLyrics ? 'lyrics' : instrument ? 'instrumentNotes' : 'chordChart';
        const res = await fetchJson(`${SYNC_URL}/sync/song/patch`, {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({
            serviceId:    serviceId || '',
            songId:       song?.id  || '',
            field,
            value:        content.trim(),
            instrument:   instrument || undefined,
            keyboardRigs: isKeys && selRigs.length ? selRigs : undefined,
            senderRole,
          }),
        });
        // Show auto-detected metadata if any
        const parts = [];
        if (res?.detected?.key)     parts.push(`Key ${res.detected.key}`);
        if (res?.detected?.bpm)     parts.push(`${res.detected.bpm} BPM`);
        if (res?.detected?.timeSig) parts.push(res.detected.timeSig);
        const detectedText = parts.length ? `\n🔍 Auto-detected: ${parts.join(' · ')}` : '';
        Alert.alert('Applied ✓', `Content updated and live.${detectedText}`, [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        await fetchJson(`${SYNC_URL}/sync/proposal`, {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({
            songId:       song?.id     || '',
            serviceId:    serviceId    || '',
            type,
            instrument:   isLyrics ? 'Vocals' : instrument,
            content:      content.trim(),
            keyboardRigs: isKeys && selRigs.length ? selRigs : undefined,
            from_email:   profile?.email || '',
            from_name:    `${profile?.name || ''} ${profile?.lastName || ''}`.trim() || profile?.email || 'Team Member',
            songTitle:    song?.title  || '',
            songArtist:   song?.artist || '',
          }),
        });
        setSubmitted(true);
      }
    } catch (e) {
      Alert.alert('Error', `Could not submit: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  // ── Submitted screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <View style={[s.container, { backgroundColor: '#020617' }]}>
        <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.cancelText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle} numberOfLines={1}>{song?.title}</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 72, marginBottom: 20 }}>📬</Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#F9FAFB', marginBottom: 12 }}>Submitted for Review</Text>
          <Text style={{ fontSize: 15, color: '#9CA3AF', textAlign: 'center', lineHeight: 24, marginBottom: 20 }}>
            Your {isLyrics ? 'lyrics' : `${instrument} part`} for "{song?.title}" has been sent to the admin.{'\n'}
            It will go live once approved.
          </Text>
          {instrument && !isLyrics && (
            <View style={{ paddingHorizontal: 18, paddingVertical: 8, backgroundColor: '#4F46E520', borderRadius: 20, borderWidth: 1, borderColor: '#4F46E5', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#818CF8' }}>{instrIcon} {instrument}</Text>
            </View>
          )}
          {isKeys && selRigs.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
              {selRigs.map(r => {
                const col = allRigColors[r] || '#6B7280';
                return (
                  <View key={r} style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: col + '20', borderRadius: 12, borderWidth: 1, borderColor: col }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: col }}>{r}</Text>
                  </View>
                );
              })}
            </View>
          )}
          <TouchableOpacity style={{ paddingHorizontal: 48, paddingVertical: 16, backgroundColor: '#8B5CF6', borderRadius: 12 }} onPress={() => navigation.goBack()}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFF' }}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Editor screen ─────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} disabled={sending}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={s.topBarTitle} numberOfLines={1}>{screenTitle}</Text>
        <TouchableOpacity onPress={handleSubmit} disabled={sending}>
          {sending
            ? <ActivityIndicator size="small" color="#8B5CF6" />
            : <Text style={s.submitText}>{isAdmin ? 'Apply' : 'Submit'}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
        {/* Song info */}
        <View style={{ marginBottom: 14 }}>
          <Text style={s.songTitle}>{song?.title}</Text>
          {song?.artist ? <Text style={s.songArtist}>{song.artist}</Text> : null}
        </View>

        {/* Instrument picker */}
        {!isLyrics && (
          <View style={s.instrSection}>
            <Text style={s.instrLabel}>
              {isLocked ? 'YOUR INSTRUMENT' : 'WHICH INSTRUMENT IS THIS FOR?'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.instrRow}>
                {visibleInstruments.map(instr => (
                  <TouchableOpacity
                    key={instr.label}
                    style={[s.instrChip, instrument === instr.label && s.instrChipActive]}
                    onPress={() => !isLocked && setInstrument(instr.label)}
                    activeOpacity={isLocked ? 1 : 0.7}
                  >
                    <Text style={[s.instrChipText, instrument === instr.label && s.instrChipTextActive]}>
                      {instr.icon} {instr.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {instrument ? (
              <View style={s.instrHintBox}>
                <Text style={s.instrHintText}>
                  💡 This will only update the <Text style={{ fontWeight: '700', color: '#A78BFA' }}>{instrument}</Text> part.{' '}
                  Other instruments keep their own separate chart.
                </Text>
              </View>
            ) : (
              <Text style={s.instrRequired}>⚠️ Select an instrument to continue</Text>
            )}
          </View>
        )}

        {/* ── Keyboard Rigs (Keys / Synth/Pad only) ── */}
        {isKeys && (
          <View style={s.rigsSection}>
            <Text style={s.instrLabel}>KEYBOARD RIGS — TAP TO INSERT AT CURSOR</Text>
            <Text style={s.rigsHint}>
              Tap "Insert" to add @[Rig] at your cursor position. Mix multiple rigs on the same line.
            </Text>

            {/* Rig list with Mark + Insert */}
            <View style={s.rigsList}>
              {allRigs.map(rig => {
                const color = allRigColors[rig];
                const active = selRigs.includes(rig);
                return (
                  <View key={rig} style={[s.rigRow, active && { borderColor: color + '60' }]}>
                    <View style={[s.rigDot, { backgroundColor: color }]} />
                    <Text style={[s.rigName, active && { color: '#F9FAFB' }]}>{rig}</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      style={[s.rigToggle, active && { backgroundColor: color + '20', borderColor: color }]}
                      onPress={() => toggleRig(rig)}
                    >
                      <Text style={[s.rigToggleText, active && { color }]}>
                        {active ? '✓' : 'Mark'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.rigInsert, { borderColor: color + '60' }]}
                      onPress={() => insertRigTag(rig)}
                    >
                      <Text style={[s.rigInsertText, { color }]}>@Insert</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* Add custom rig */}
              {addingRig ? (
                <View style={s.rigAddRow}>
                  <TextInput
                    style={s.rigInput}
                    value={customRig}
                    onChangeText={setCustomRig}
                    placeholder="New rig name…"
                    placeholderTextColor="#374151"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={addCustomRig}
                  />
                  <TouchableOpacity style={s.rigAddBtn} onPress={addCustomRig}>
                    <Text style={s.rigAddBtnText}>+ Add</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setAddingRig(false); setCustomRig(''); }}>
                    <Text style={{ color: '#6B7280', marginLeft: 8 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.rigNewBtn} onPress={() => setAddingRig(true)}>
                  <Text style={s.rigNewBtnText}>+ New rig</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Mode indicator */}
        <View style={[s.modeBanner, isAdmin && s.modeBannerAdmin]}>
          <Text style={s.modeText}>
            {isAdmin ? '👑 Admin Mode — changes publish directly' : '📝 Submit for admin approval before going live'}
          </Text>
        </View>

        {/* Edit / Preview toggle (Keys only) */}
        {isKeys && (
          <View style={s.editPreviewBar}>
            <TouchableOpacity
              style={[s.editPreviewBtn, !showPreview && s.editPreviewBtnActive]}
              onPress={() => setShowPreview(false)}
            >
              <Text style={[s.editPreviewBtnText, !showPreview && s.editPreviewBtnTextActive]}>✏️ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.editPreviewBtn, showPreview && s.editPreviewBtnActive]}
              onPress={() => setShowPreview(true)}
            >
              <Text style={[s.editPreviewBtnText, showPreview && s.editPreviewBtnTextActive]}>🎨 Preview Colors</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Hint */}
        {!showPreview && (
          <Text style={s.hint}>
            {isLyrics
              ? 'Enter lyrics line by line. Use blank lines between sections.'
              : isKeys
                ? 'Type your chart. Tap a rig button above to insert @[Rig] at your cursor. Mix rigs on the same line.'
                : instrument
                  ? `Enter the ${instrument} chart/notes.`
                  : 'Select an instrument above, then enter the chart.'}
          </Text>
        )}

        {/* Editor (hidden in preview mode) */}
        {!showPreview && (
          <TextInput
            ref={editorRef}
            style={[s.editor, !isLyrics && s.editorMono]}
            value={content}
            onChangeText={setContent}
            onSelectionChange={e => setCursor(e.nativeEvent.selection.start)}
            multiline
            textAlignVertical="top"
            placeholder={
              isLyrics
                ? 'Verse 1\nYour lyrics here...\n\nChorus\nMore lyrics...'
                : isKeys
                  ? '[Intro] C       C7M        F7M\n@[Nord] do sol,  do sol,  fa mi, fa mi\n\nC                  C7M\n  Eu tenho um Deus...\n\n[Refrão]\nF7M                    Dm7\n@[MODX] fa fa fa mi, @[Nord] la sol la mi'
                  : `Intro: ${song?.key || 'C'}  G  Am  F\n\nVerse:\n${song?.key || 'C'}        G\nYour ${instrument || 'chord'} chart...`
            }
            placeholderTextColor="#374151"
            autoCorrect={isLyrics}
            autoCapitalize={isLyrics ? 'sentences' : 'none'}
            spellCheck={isLyrics}
          />
        )}

        {/* Live fingering / reference panel — bass & guitar only */}
        {!isLyrics && (
          <ChartReferencePanel
            role={instrument}
            songKey={song?.key || song?.originalKey || ''}
            timeSig={song?.timeSig || song?.timeSignature || '4/4'}
            chordText={content}
          />
        )}

        {/* Color preview (Keys only) */}
        {isKeys && showPreview && (
          <View style={s.previewBox}>
            {/* Rig legend */}
            <View style={s.previewLegend}>
              {allRigs.filter(r => selRigs.includes(r) || content.includes(`@[${r}]`)).map(r => {
                const col = allRigColors[r];
                return (
                  <View key={r} style={[s.legendChip, { borderColor: col, backgroundColor: col + '20' }]}>
                    <View style={[s.legendDot, { backgroundColor: col }]} />
                    <Text style={[s.legendText, { color: col }]}>{r}</Text>
                  </View>
                );
              })}
            </View>
            {content.trim()
              ? <ChartPreview text={content} allRigColors={allRigColors} />
              : <Text style={{ color: '#4B5563', fontSize: 13, fontStyle: 'italic' }}>Switch to Edit and type your chart to see the preview.</Text>
            }
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1F2937', backgroundColor: '#0A0A0A',
  },
  topBarTitle: { fontSize: 16, fontWeight: '700', color: '#F9FAFB', flex: 1, textAlign: 'center' },
  cancelText:  { fontSize: 15, color: '#8B5CF6', fontWeight: '600', minWidth: 60 },
  submitText:  { fontSize: 15, color: '#8B5CF6', fontWeight: '700', minWidth: 60, textAlign: 'right' },
  body: { flex: 1, padding: 16 },

  songTitle:  { fontSize: 20, fontWeight: '800', color: '#F9FAFB', marginBottom: 2 },
  songArtist: { fontSize: 13, color: '#9CA3AF' },

  instrSection:    { marginBottom: 14 },
  instrLabel:      { fontSize: 11, fontWeight: '700', color: '#6B7280', marginBottom: 8, letterSpacing: 0.8 },
  instrRow:        { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  instrChip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#374151' },
  instrChipActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  instrChipText:       { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  instrChipTextActive: { color: '#FFF' },
  instrHintBox:   { marginTop: 10, padding: 10, backgroundColor: '#1E1B4B', borderRadius: 8, borderWidth: 1, borderColor: '#4F46E5' },
  instrHintText:  { fontSize: 12, color: '#9CA3AF', lineHeight: 18 },
  instrRequired:  { marginTop: 8, fontSize: 12, color: '#F59E0B', fontWeight: '600' },

  // Keyboard rigs
  rigsSection:  { marginBottom: 16, backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#1E293B', padding: 14 },
  rigsHint:     { fontSize: 11, color: '#4B5563', marginBottom: 10, lineHeight: 16 },

  // Quick insert row
  rigQuickRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  rigQuickBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  rigQuickDot:  { width: 8, height: 8, borderRadius: 4 },
  rigQuickText: { fontSize: 13, fontWeight: '700' },

  rigsList:    { gap: 6 },
  rigRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 10, borderWidth: 1, borderColor: '#1F2937', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  rigDot:      { width: 10, height: 10, borderRadius: 5 },
  rigName:     { fontSize: 14, fontWeight: '600', color: '#9CA3AF', width: 70 },
  rigToggle:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#374151' },
  rigToggleText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  rigInsert:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#1E293B', borderWidth: 1 },
  rigInsertText: { fontSize: 11, fontWeight: '700' },
  rigAddRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rigInput:    { flex: 1, backgroundColor: '#1E293B', borderRadius: 8, borderWidth: 1, borderColor: '#374151', paddingHorizontal: 12, paddingVertical: 8, color: '#F9FAFB', fontSize: 14 },
  rigAddBtn:   { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#4F46E5', borderRadius: 8 },
  rigAddBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  rigNewBtn:   { alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#374151', borderStyle: 'dashed' },
  rigNewBtnText: { fontSize: 13, color: '#6366F1', fontWeight: '600' },

  modeBanner:      { padding: 10, backgroundColor: '#1E3A2F', borderRadius: 8, borderWidth: 1, borderColor: '#059669', marginBottom: 12 },
  modeBannerAdmin: { backgroundColor: '#2D1C00', borderColor: '#F59E0B' },
  modeText:        { fontSize: 12, color: '#D1FAE5' },

  // Edit / Preview toggle bar
  editPreviewBar: { flexDirection: 'row', backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', padding: 3, marginBottom: 12, gap: 3 },
  editPreviewBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  editPreviewBtnActive: { backgroundColor: '#1E293B' },
  editPreviewBtnText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  editPreviewBtnTextActive: { color: '#F9FAFB' },

  hint: { fontSize: 12, color: '#4B5563', lineHeight: 18, marginBottom: 12 },

  editor: {
    backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#374151',
    borderRadius: 10, padding: 16, fontSize: 16, color: '#F3F4F6',
    lineHeight: 28, minHeight: 400, textAlignVertical: 'top',
  },
  editorMono: { fontFamily: 'Courier', fontSize: 14, lineHeight: 24 },

  // Color preview
  previewBox:    { backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', padding: 16, minHeight: 300 },
  previewLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  legendChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  legendDot:     { width: 8, height: 8, borderRadius: 4 },
  legendText:    { fontSize: 12, fontWeight: '700' },
});
