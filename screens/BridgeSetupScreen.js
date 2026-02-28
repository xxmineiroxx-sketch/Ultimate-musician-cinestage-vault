import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../context/ThemeContext';

export default function BridgeSetupScreen({ navigation }) {
  const [host, setHost] = useState('192.168.1.100');
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bridgeUrl = useMemo(() => `ws://${host}:7070`, [host]);
  const syncUrl = useMemo(() => `ws://${host}:7071`, [host]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Bridge Setup</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Step 1 — Run the Bridge</Text>
        <Text style={styles.p}>
          On a laptop connected to your MIDI/lighting rig, run the bridge scripts located in
          `tools/ultimate-bridge`.
        </Text>
        <View style={styles.codeBlock}>
          <Text style={styles.codeText}>npm i ws easymidi osc</Text>
          <Text style={styles.codeText}>node server.js</Text>
          <Text style={styles.codeText}>node sync-server.js</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Step 2 — Enter Bridge Host</Text>
        <Text style={styles.p}>
          Enter the local IP of the computer running the bridge. This appears on the same Wi‑Fi
          network as your devices.
        </Text>
        <TextInput
          style={styles.input}
          value={host}
          onChangeText={setHost}
          placeholder="192.168.1.100"
          placeholderTextColor={colors.subtle}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Step 3 — Scan & Share</Text>
        <Text style={styles.p}>Scan these QR codes with other devices to configure quickly.</Text>
        <View style={styles.qrRow}>
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>Bridge (MIDI/OSC)</Text>
            <QRCode value={bridgeUrl} size={140} color="#0F172A" backgroundColor="#F8FAFC" />
            <Text style={styles.qrText}>{bridgeUrl}</Text>
          </View>
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>Sync (Multi‑Device)</Text>
            <QRCode value={syncUrl} size={140} color="#0F172A" backgroundColor="#F8FAFC" />
            <Text style={styles.qrText}>{syncUrl}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Step 4 — Connect in App</Text>
        <Text style={styles.p}>
          Use External Sync to connect MIDI Clock, lighting cues, and lyric slides.
        </Text>
        <TouchableOpacity style={styles.pill} onPress={() => navigation.navigate('ExternalSync')}>
          <Text style={styles.pillText}>Open External Sync</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Quick Tips</Text>
        <Text style={styles.p}>• Keep the bridge laptop on the same Wi‑Fi network.</Text>
        <Text style={styles.p}>• If sync feels delayed, use wired Ethernet on the host.</Text>
        <Text style={styles.p}>• When in doubt, restart the bridge scripts before service.</Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  link: { color: colors.link, fontWeight: '900' },
  card: {
    margin: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
  },
  h2: { color: colors.text, fontWeight: '900', fontSize: 14 },
  p: { color: colors.muted, marginTop: 8, fontSize: 12, lineHeight: 16 },
  input: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderAlt,
    color: colors.text,
  },
  codeBlock: {
    marginTop: 12,
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderAlt,
  },
  codeText: { color: colors.text, fontFamily: 'Courier', fontSize: 12, marginBottom: 6 },
  qrRow: { marginTop: 12, gap: 12, flexDirection: 'row', flexWrap: 'wrap' },
  qrCard: {
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderAlt,
    alignItems: 'center',
  },
  qrTitle: { color: colors.text, fontWeight: '900', marginBottom: 8 },
  qrText: { color: colors.subtle, fontSize: 11, marginTop: 8 },
  pill: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.pillActive,
  },
  pillText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
});
