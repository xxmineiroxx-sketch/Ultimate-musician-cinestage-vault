/**
 * Content Editor Screen - Ultimate Playback
 * Team members edit / add lyrics or chord charts for a song,
 * then submit as a proposal to Musician for approval.
 * Supports instrument-specific parts: each musician (Keys, Guitar, Bass, etc.)
 * submits their own version — all stored under the same song.
 * MD/Admin users can apply changes directly without approval.
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile } from '../services/storage';

const SYNC_URL = 'http://10.0.0.34:8099';

// Instruments matching Musician's INSTRUMENT_SHEETS
const INSTRUMENT_PARTS = [
  { label: 'Vocals',           icon: '🎤' },
  { label: 'Keys',             icon: '🎹' },
  { label: 'Acoustic Guitar',  icon: '🎸' },
  { label: 'Electric Guitar',  icon: '⚡' },
  { label: 'Bass',             icon: '🎸' },
  { label: 'Synth/Pad',        icon: '🎛' },
  { label: 'Drums',            icon: '🥁' },
];

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(tid); }
}

export default function ContentEditorScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const {
    song,
    serviceId,
    type       = 'lyrics',   // 'lyrics' | 'chord_chart'
    existing   = '',
    isAdmin    = false,
    instrument: instrumentParam = '',  // pre-selected instrument from Setlist
  } = route.params || {};

  const isLyrics = type === 'lyrics';

  // For lyrics, instrument is always Vocals. For chords, use what was passed or let user pick.
  const [instrument, setInstrument] = useState(
    isLyrics ? 'Vocals' : (instrumentParam || '')
  );
  const [content, setContent]     = useState(existing || '');
  const [sending, setSending]     = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const instrEntry = INSTRUMENT_PARTS.find(i => i.label === instrument);
  const instrIcon  = instrEntry?.icon || (isLyrics ? '🎤' : '🎼');

  const screenTitle = isLyrics
    ? 'Edit Lyrics'
    : (instrument ? `${instrIcon} ${instrument} Part` : 'Edit Chord Chart');

  const hint = isLyrics
    ? 'Enter lyrics line by line. Use blank lines between sections (Verse, Chorus, Bridge).'
    : instrument
      ? `Enter the ${instrument} chart/notes. Each musician's part is saved separately for the same song.`
      : 'Enter chord chart using standard notation. Select an instrument above to save as an instrument-specific part.';

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

      if (isAdmin) {
        // Admin: apply directly via publish endpoint
        const debug = await fetchJson(`${SYNC_URL}/sync/debug`);
        const { services = [], people = [], plans = {} } = debug;
        const plan      = plans[serviceId] || { songs: [] };
        const songEntry = (plan.songs || []).find(s => s.id === song?.id);
        if (songEntry) {
          if (isLyrics) {
            songEntry.lyrics = content.trim();
          } else if (instrument) {
            if (!songEntry.instrumentNotes) songEntry.instrumentNotes = {};
            songEntry.instrumentNotes[instrument] = content.trim();
          } else {
            songEntry.chordChart = content.trim();
            songEntry.chordSheet = content.trim();
          }
        }
        await fetchJson(`${SYNC_URL}/sync/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ services, people, plans }),
        });
        Alert.alert('Applied ✓', 'Content updated and published.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        // Regular team member: submit as proposal for approval
        await fetchJson(`${SYNC_URL}/sync/proposal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId:     song?.id     || '',
            serviceId:  serviceId   || '',
            type,
            instrument: isLyrics ? 'Vocals' : instrument,
            content:    content.trim(),
            from_email: profile?.email || '',
            from_name:  `${profile?.name || ''} ${profile?.lastName || ''}`.trim() || (profile?.email || 'Team Member'),
            songTitle:  song?.title  || '',
            songArtist: song?.artist || '',
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

  if (submitted) {
    return (
      <View style={[s.container, s.successContainer]}>
        <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.cancelText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle}>{song?.title}</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.successBody}>
          <Text style={s.successIcon}>📬</Text>
          <Text style={s.successTitle}>Submitted for Review</Text>
          <Text style={s.successText}>
            Your {isLyrics ? 'lyrics' : `${instrument} part`} for "{song?.title}" has been sent to the admin.{'\n'}
            It will go live once approved.
          </Text>
          {instrument && !isLyrics && (
            <View style={s.successInstrBadge}>
              <Text style={s.successInstrText}>{instrIcon} {instrument}</Text>
            </View>
          )}
          <TouchableOpacity style={s.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
        <View style={s.songInfo}>
          <Text style={s.songTitle}>{song?.title}</Text>
          {song?.artist ? <Text style={s.songArtist}>{song.artist}</Text> : null}
        </View>

        {/* Instrument picker — shown for chord charts only */}
        {!isLyrics && (
          <View style={s.instrSection}>
            <Text style={s.instrLabel}>Which instrument is this for?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.instrRow}>
                {INSTRUMENT_PARTS.filter(i => i.label !== 'Vocals').map(instr => (
                  <TouchableOpacity
                    key={instr.label}
                    style={[s.instrChip, instrument === instr.label && s.instrChipActive]}
                    onPress={() => setInstrument(instr.label)}
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
                  💡 This will only update the <Text style={{ fontWeight: '700', color: '#A78BFA' }}>{instrument}</Text> part.
                  Other instruments keep their own separate chart.
                </Text>
              </View>
            ) : (
              <Text style={s.instrRequired}>⚠️ Select an instrument to continue</Text>
            )}
          </View>
        )}

        {/* Mode indicator */}
        <View style={[s.modeBanner, isAdmin && s.modeBannerAdmin]}>
          <Text style={s.modeText}>
            {isAdmin
              ? '👑 Admin Mode — changes publish directly'
              : '📝 Submit for admin approval before going live'}
          </Text>
        </View>

        {/* Hint */}
        <Text style={s.hint}>{hint}</Text>

        {/* Editor */}
        <TextInput
          style={[s.editor, !isLyrics && s.editorMono]}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          placeholder={isLyrics
            ? 'Verse 1\nYour lyrics here...\n\nChorus\nMore lyrics...'
            : instrument === 'Drums'
              ? 'Intro: 4-bar groove\n\nVerse:\n- Standard groove, hi-hat 8ths\n- Fill into Chorus\n\nChorus:\n- Open hat on beats 2 & 4'
              : `Intro: ${song?.key || 'C'}  G  Am  F\n\nVerse:\n${song?.key || 'C'}        G\nYour ${instrument || 'chord'} chart...`
          }
          placeholderTextColor="#374151"
          autoCorrect={isLyrics}
          autoCapitalize={isLyrics ? 'sentences' : 'none'}
          spellCheck={isLyrics}
        />
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

  songInfo: { marginBottom: 12 },
  songTitle:  { fontSize: 20, fontWeight: '800', color: '#F9FAFB', marginBottom: 2 },
  songArtist: { fontSize: 13, color: '#9CA3AF' },

  // Instrument picker
  instrSection: { marginBottom: 14 },
  instrLabel:   { fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  instrRow:     { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  instrChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#374151' },
  instrChipActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  instrChipText:       { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  instrChipTextActive: { color: '#FFF' },
  instrHintBox:  { marginTop: 10, padding: 10, backgroundColor: '#1E1B4B', borderRadius: 8, borderWidth: 1, borderColor: '#4F46E5' },
  instrHintText: { fontSize: 12, color: '#9CA3AF', lineHeight: 18 },
  instrRequired: { marginTop: 8, fontSize: 12, color: '#F59E0B', fontWeight: '600' },

  modeBanner:      { padding: 10, backgroundColor: '#1E3A2F', borderRadius: 8, borderWidth: 1, borderColor: '#059669', marginBottom: 12 },
  modeBannerAdmin: { backgroundColor: '#2D1C00', borderColor: '#F59E0B' },
  modeText: { fontSize: 12, color: '#D1FAE5' },
  hint: { fontSize: 12, color: '#4B5563', lineHeight: 18, marginBottom: 12 },

  editor: {
    backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#374151',
    borderRadius: 10, padding: 16, fontSize: 16, color: '#F3F4F6',
    lineHeight: 28, minHeight: 400, textAlignVertical: 'top', marginBottom: 40,
  },
  editorMono: { fontFamily: 'Courier', fontSize: 14, lineHeight: 24 },

  // Success state
  successContainer: { backgroundColor: '#020617' },
  successBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon:  { fontSize: 72, marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: '700', color: '#F9FAFB', marginBottom: 12 },
  successText:  { fontSize: 15, color: '#9CA3AF', textAlign: 'center', lineHeight: 24, marginBottom: 20 },
  successInstrBadge: { paddingHorizontal: 18, paddingVertical: 8, backgroundColor: '#4F46E520', borderRadius: 20, borderWidth: 1, borderColor: '#4F46E5', marginBottom: 24 },
  successInstrText:  { fontSize: 14, fontWeight: '700', color: '#818CF8' },
  doneBtn:     { paddingHorizontal: 48, paddingVertical: 16, backgroundColor: '#8B5CF6', borderRadius: 12 },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
