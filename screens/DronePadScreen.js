import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { loadSession, saveSession, defaultSession } from '../services/sessionStore';
import { sendPitchShift } from '../services/cueDispatcher';
import * as audioEngine from '../audioEngine';
import { useTheme } from '../context/ThemeContext';

const NOTES = [
  { label: 'C', semitones: 0 },
  { label: 'C#', semitones: 1 },
  { label: 'D', semitones: 2 },
  { label: 'D#', semitones: 3 },
  { label: 'E', semitones: 4 },
  { label: 'F', semitones: 5 },
  { label: 'F#', semitones: 6 },
  { label: 'G', semitones: 7 },
  { label: 'G#', semitones: 8 },
  { label: 'A', semitones: 9 },
  { label: 'A#', semitones: 10 },
  { label: 'B', semitones: 11 },
];

export default function DronePadScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [session, setSession] = useState(() => defaultSession());
  const [padOn, setPadOn] = useState(true);
  const [padVolume, setPadVolume] = useState(0.7);

  useEffect(() => {
    (async () => {
      const saved = await loadSession();
      if (saved) {
        const next = { ...defaultSession(), ...saved };
        setSession(next);
        setPadOn(next.padEnabled !== false);
        if (typeof next.padVolume === 'number') {
          setPadVolume(next.padVolume);
          audioEngine.setPadVolume(next.padVolume);
        }
      }
    })();
  }, []);

  const activeSemitones = typeof session.pitchShiftSemitones === 'number'
    ? session.pitchShiftSemitones
    : 0;

  const activeNote = useMemo(() => {
    const match = NOTES.find((n) => n.semitones === ((activeSemitones % 12) + 12) % 12);
    return match?.label || 'C';
  }, [activeSemitones]);

  const applyPitch = async (semitones) => {
    const next = { ...session, pitchShiftSemitones: semitones, pitchShiftMode: 'BRIDGE_HQ' };
    setSession(next);
    await saveSession({ ...next, lastUpdated: new Date().toISOString() });
    try {
      sendPitchShift({ semitones, mode: next.pitchShiftMode || 'BRIDGE_HQ' });
    } catch {}
    audioEngine.setPadPitch(semitones);
  };

  const togglePad = (value) => {
    setPadOn(value);
    audioEngine.setPadEnabled(value);
    saveSession({ ...session, padEnabled: value, lastUpdated: new Date().toISOString() }).catch(() => {});
  };

  const updatePadVolume = async (value) => {
    const nextVol = Math.max(0, Math.min(1, value));
    setPadVolume(nextVol);
    audioEngine.setPadVolume(nextVol);
    const next = { ...session, padVolume: nextVol, lastUpdated: new Date().toISOString() };
    setSession(next);
    await saveSession(next);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Drone Pad</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Pad Control</Text>
        <View style={styles.row}>
          <Text style={styles.p}>Pad Enabled</Text>
          <Switch value={padOn} onValueChange={togglePad} />
        </View>
        <View style={styles.row}>
          <Text style={styles.p}>Pad Volume</Text>
          <View style={styles.rowInline}>
            <TouchableOpacity style={styles.pill} onPress={() => updatePadVolume(padVolume - 0.1)}>
              <Text style={styles.pillText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.volumeText}>{Math.round(padVolume * 100)}%</Text>
            <TouchableOpacity style={styles.pill} onPress={() => updatePadVolume(padVolume + 0.1)}>
              <Text style={styles.pillText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.subtle}>Current key: {activeNote} ({activeSemitones} semitones)</Text>
        <Text style={styles.noteHint}>
          Pad key selection is sent to Bridge HQ for real-time pitch shift. Local pad playback uses the
          generated pad track.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Select Key</Text>
        <View style={styles.grid}>
          {NOTES.map((n) => (
            <TouchableOpacity
              key={n.label}
              style={[styles.key, activeNote === n.label && styles.keyActive]}
              onPress={() => applyPitch(n.semitones)}
            >
              <Text style={[styles.keyText, activeNote === n.label && styles.keyTextActive]}>{n.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  link: { color: colors.link, fontWeight: '900' },

  card: { margin: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14 },
  h2: { color: colors.text, fontWeight: '900', fontSize: 14 },
  p: { color: colors.text, fontWeight: '800' },
  subtle: { color: colors.subtle, fontSize: 12, marginTop: 8 },
  noteHint: { color: colors.muted, fontSize: 11, marginTop: 6, lineHeight: 16 },
  row: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  volumeText: { color: colors.text, fontWeight: '900' },
  pill: { borderWidth: 1, borderColor: colors.borderAlt, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  pillText: { color: colors.text, fontWeight: '900' },

  grid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  key: { borderWidth: 1, borderColor: colors.borderAlt, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, minWidth: 58, alignItems: 'center' },
  keyActive: { backgroundColor: colors.pillActive, borderColor: colors.pillActive },
  keyText: { color: colors.text, fontWeight: '900' },
  keyTextActive: { color: 'white' },
});
