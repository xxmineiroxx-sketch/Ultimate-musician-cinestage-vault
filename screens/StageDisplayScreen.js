import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { subscribeSync, send, getSyncStatus } from '../services/syncClient';
import { MarkerColors } from '../songMap/model';
import { useTheme } from '../context/ThemeContext';

function colorHex(key) {
  return MarkerColors.find(c => c.key === key)?.hex ?? "#60A5FA";
}

export default function StageDisplayScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [state, setState] = useState({ status: 'idle', songTitle: '—', section: null, next: null, bpm: 120, positionSec: 0, loop: false });

  useEffect(() => {
    const unsub = subscribeSync((evt) => {
      if (evt.type === 'SYNC_MESSAGE') {
        const msg = evt.message;
        if (msg.type === 'HOST_STATE') setState(msg.state);
      }
    });
    // request current state
    send({ type: 'REQUEST_STATE', ts: Date.now() });
    return () => unsub();
  }, []);

  const sectionColor = state.section?.colorKey ? colorHex(state.section.colorKey) : '#4F46E5';

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.song}>{state.songTitle || '—'}</Text>
        <Text style={styles.meta}>BPM {state.bpm} • {state.status?.toUpperCase?.() || 'IDLE'} • {state.loop ? 'LOOP' : '—'}</Text>
      </View>

      <View style={[styles.bigCard, { borderColor: sectionColor }]}>
        <Text style={styles.bigLabel}>NOW</Text>
        <Text style={styles.bigSection}>{state.section ? `${state.section.type}: ${state.section.name}` : '—'}</Text>
      </View>

      <View style={styles.nextCard}>
        <Text style={styles.nextLabel}>NEXT</Text>
        <Text style={styles.nextText}>{state.next ? `${state.next.type}: ${state.next.name}` : '—'}</Text>
      </View>

<View style={styles.noteCard}>
  <Text style={styles.nextLabel}>NOTES</Text>
  <Text style={styles.noteText}>{state.section?.notes || state.sectionNotes || '—'}</Text>
</View>

<View style={styles.countCard}>
  <Text style={styles.nextLabel}>NEXT IN</Text>
  <Text style={styles.countText}>{state.barsToNext != null ? `${state.barsToNext.toFixed(1)} bars` : '—'}</Text>
</View>


      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.pill} onPress={() => send({ type: 'REQUEST_LOOP', sectionId: state.section?.id, ts: Date.now() })}>
          <Text style={styles.pillText}>Request Loop</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pillAlt} onPress={() => navigation.goBack()}>
          <Text style={styles.pillAltText}>Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>Stage Display follows HOST in real-time. Connect in Device Role & Sync.</Text>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 18, justifyContent: 'center' },
  top: { alignItems: 'center', marginBottom: 18 },
  song: { color: colors.text, fontWeight: '900', fontSize: 22, textAlign: 'center' },
  meta: { color: colors.subtle, marginTop: 8, fontWeight: '900' },

  bigCard: { borderWidth: 3, borderRadius: 24, padding: 20, backgroundColor: colors.card },
  bigLabel: { color: colors.subtle, fontWeight: '900', letterSpacing: 2 },
  bigSection: { color: colors.text, fontWeight: '900', fontSize: 34, marginTop: 10, textAlign: 'center' },

  noteCard: { marginTop: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, backgroundColor: colors.card },
  noteText: { color: colors.text, fontWeight: '800', fontSize: 14, marginTop: 6, textAlign: 'center' },
  countCard: { marginTop: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, backgroundColor: colors.card },
  countText: { color: '#FBBF24', fontWeight: '900', fontSize: 18, marginTop: 6, textAlign: 'center' },

  nextCard: { marginTop: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, backgroundColor: colors.card },
  nextLabel: { color: colors.subtle, fontWeight: '900', letterSpacing: 2 },
  nextText: { color: colors.text, fontWeight: '900', fontSize: 18, marginTop: 6, textAlign: 'center' },

  bottomRow: { flexDirection: 'row', gap: 10, marginTop: 18, justifyContent: 'center' },
  pill: { backgroundColor: colors.pillActive, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 999 },
  pillText: { color: 'white', fontWeight: '900' },
  pillAlt: { borderWidth: 1, borderColor: colors.borderAlt, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 999 },
  pillAltText: { color: colors.text, fontWeight: '900' },

  hint: { marginTop: 16, textAlign: 'center', color: colors.subtle, fontWeight: '800' },
});
