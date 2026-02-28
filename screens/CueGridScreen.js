import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { loadSession, saveSession, defaultSession } from '../services/sessionStore';
import { sortMarkers } from '../songMap/model';
import { autoAssignLyricsCues, autoAssignLightingCues } from '../services/cueMapper';
import { useTheme } from '../context/ThemeContext';

export default function CueGridScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [session, setSession] = useState(defaultSession());

  useEffect(() => {
    (async () => {
      const s = (await loadSession()) || defaultSession();
      setSession(s);
    })();
  }, []);

  const markers = useMemo(() => sortMarkers(session.markers || []), [session]);

  async function persistMarkers(nextMarkers) {
    const next = { ...session, markers: nextMarkers, lastUpdated: new Date().toISOString() };
    setSession(next);
    await saveSession(next);
  }

  function updateMarker(id, patch) {
    const next = markers.map(m => m.id === id ? { ...m, ...patch } : m);
    persistMarkers(next);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Cue Grid</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.link}>Back</Text></TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Fast Cue Editing</Text>
        <Text style={styles.p}>Edit lyricsCue + lightingCue + lightingColor in one place. Great for producers.</Text>
<View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
  <TouchableOpacity style={styles.btn} onPress={() => persistMarkers(autoAssignLyricsCues(markers, 1, 1))}>
    <Text style={styles.btnText}>Auto-map Lyrics</Text>
  </TouchableOpacity>
  <TouchableOpacity style={styles.btnAlt} onPress={() => persistMarkers(autoAssignLightingCues(markers, 1, 1))}>
    <Text style={styles.btnAltText}>Auto-map Lights</Text>
  </TouchableOpacity>
</View>


      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <View style={styles.gridHead}>
          <Text style={[styles.col, { flex: 2 }]}>Section</Text>
          <Text style={[styles.col, { flex: 1 }]}>Lyrics</Text>
          <Text style={[styles.col, { flex: 1 }]}>Light</Text>
          <Text style={[styles.col, { flex: 1 }]}>Color</Text>
        </View>

        {markers.map((m) => (
          <View key={m.id} style={styles.gridRow}>
            <View style={{ flex: 2 }}>
              <Text style={styles.rowTitle}>{m.type}: {m.name}</Text>
              <Text style={styles.rowSub}>{m.start.toFixed(2)}s → {m.end.toFixed(2)}s</Text>
            </View>

            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={m.lyricsCue == null ? '' : String(m.lyricsCue)}
              onChangeText={(t) => updateMarker(m.id, { lyricsCue: t === '' ? null : Number(t) })}
              keyboardType="numeric"
              placeholder="—"
              placeholderTextColor={colors.subtle}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={m.lightingCue == null ? '' : String(m.lightingCue)}
              onChangeText={(t) => updateMarker(m.id, { lightingCue: t === '' ? null : Number(t) })}
              keyboardType="numeric"
              placeholder="—"
              placeholderTextColor={colors.subtle}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={m.lightingColor || ''}
              onChangeText={(t) => updateMarker(m.id, { lightingColor: t })}
              placeholder="#RRGGBB"
              placeholderTextColor={colors.subtle}
              autoCapitalize="none"
            />
          </View>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>
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
  p: { color: colors.muted, marginTop: 8, fontSize: 12, lineHeight: 16 },

  gridHead: { flexDirection: 'row', gap: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  col: { color: colors.subtle, fontWeight: '900', fontSize: 11 },
  gridRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
  rowTitle: { color: colors.text, fontWeight: '900', fontSize: 12 },
  rowSub: { color: colors.subtle, fontSize: 11, marginTop: 2 },

  btn: { flex: 1, backgroundColor: colors.pillActive, paddingVertical: 10, borderRadius: 999, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '900', fontSize: 12 },
  btnAlt: { flex: 1, borderWidth: 1, borderColor: colors.borderAlt, paddingVertical: 10, borderRadius: 999, alignItems: 'center' },
  btnAltText: { color: colors.text, fontWeight: '900', fontSize: 12 },

  input: { borderWidth: 1, borderColor: colors.borderAlt, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, color: colors.text, backgroundColor: colors.card },
});
