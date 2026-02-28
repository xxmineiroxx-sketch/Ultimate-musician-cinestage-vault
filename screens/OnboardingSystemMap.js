import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const slides = [
  {
    title: "Welcome",
    body: "System Map v1 keeps routing consistent—so your church stays stable even when volunteers rotate.",
  },
  {
    title: "Drum Buses",
    body: "Drum Bus A = body (kick/snare/toms). Drum Bus B = cymbals & percussion. Monitors get buses—not raw drum channels.",
  },
  {
    title: "Vocal Policy",
    body: "Lead Vocal is always Slot 8. Slots 9–13 are BGVs only. This prevents confusion every week.",
  },
  {
    title: "Slot 14 = FLEX",
    body: "Slot 14 is optional and may be used for extra Guitar 2 or Keys 2. Leave it empty otherwise. FX returns are never allowed on personal monitor slots.",
  },
  {
    title: "You're Safe",
    body: "Click/Guide are protected on slots 15/16. Guardrails prevent destructive routing changes. Restore Known Good anytime.",
  },
];

export default function OnboardingSystemMap({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [i, setI] = useState(0);
  const s = slides[i];

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>System Map v1</Text>
      <Text style={styles.title}>{s.title}</Text>
      <Text style={styles.body}>{s.body}</Text>

      <View style={styles.dots}>
        {slides.map((_, idx) => (
          <View key={idx} style={[styles.dot, idx === i && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btnAlt, i === 0 && { opacity: 0.5 }]}
          disabled={i === 0}
          onPress={() => setI((x) => Math.max(0, x - 1))}
        >
          <Text style={styles.btnAltText}>Back</Text>
        </TouchableOpacity>

        {i < slides.length - 1 ? (
          <TouchableOpacity style={styles.btn} onPress={() => setI((x) => Math.min(slides.length - 1, x + 1))}>
            <Text style={styles.btnText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={() => navigation.replace('SystemMap', { mixer: 'WING' })}>
            <Text style={styles.btnText}>Start</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.skip} onPress={() => navigation.replace('SystemMap', { mixer: 'WING' })}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 18, justifyContent: 'center' },
  kicker: { color: colors.subtle, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 8 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 10 },
  dots: { flexDirection: 'row', gap: 8, marginTop: 20, alignSelf: 'center' },
  dot: { width: 8, height: 8, borderRadius: 99, backgroundColor: colors.borderAlt },
  dotActive: { backgroundColor: colors.pillActive },
  row: { flexDirection: 'row', gap: 12, marginTop: 28 },
  btn: { flex: 1, backgroundColor: colors.pillActive, paddingVertical: 12, borderRadius: 999, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '900' },
  btnAlt: { flex: 1, borderWidth: 1, borderColor: colors.borderAlt, paddingVertical: 12, borderRadius: 999, alignItems: 'center' },
  btnAltText: { color: colors.text, fontWeight: '900' },
  skip: { marginTop: 16, alignItems: 'center' },
  skipText: { color: colors.subtle, fontWeight: '900' },
});
