import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput,
} from 'react-native';
import {
  connectBridge, disconnectBridge, subscribeBridge, getBridgeUrl,
} from '../services/bridgeClient';
import {
  connectSync, disconnectSync, subscribeSync, getSyncStatus,
} from '../services/syncClient';
import { getSettings } from '../data/storage';
import { sendCue } from '../services/cueSync';
import { LYRIC_SOFTWARE_OPTIONS } from '../data/models';

const STATUS_COLOR = {
  connected: '#34D399',
  disconnected: '#6B7280',
  error: '#F87171',
};

export default function ExternalSyncScreen({ navigation }) {
  const [bridgeHost, setBridgeHost] = useState('192.168.1.100');
  const [syncUrl, setSyncUrl] = useState('ws://192.168.1.100:7071');
  const [ppTarget, setPpTarget] = useState('');
  const [ppSoftware, setPpSoftware] = useState('propresenter7');
  const [ppOscPath, setPpOscPath] = useState('');
  const [ppMidiCh, setPpMidiCh] = useState(1);

  const [bridgeStatus, setBridgeStatus] = useState(getBridgeUrl() ? 'connected' : 'disconnected');
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [log, setLog] = useState([]);

  useEffect(() => {
    getSettings().then((s) => {
      if (s.proPresenter?.target)   setPpTarget(s.proPresenter.target);
      if (s.proPresenter?.software) setPpSoftware(s.proPresenter.software);
      if (s.proPresenter?.oscPath)  setPpOscPath(s.proPresenter.oscPath);
      if (s.proPresenter?.midiChannel) setPpMidiCh(s.proPresenter.midiChannel);
      if (s.sync?.wsUrl) {
        setSyncUrl(s.sync.wsUrl);
        // Derive bridge host from sync URL
        try {
          const raw = s.sync.wsUrl.replace(/^wss?:\/\//, '');
          const host = raw.split(':')[0].split('/')[0];
          if (host) setBridgeHost(host);
        } catch {}
      }
    });

    const unsubBridge = subscribeBridge((evt) => {
      if (evt.type === 'BRIDGE_STATUS') setBridgeStatus(evt.status);
      if (evt.type === 'BRIDGE_MESSAGE') addLog(`← Bridge: ${JSON.stringify(evt.message)}`);
    });
    const unsubSync = subscribeSync((evt) => {
      if (evt.type === 'SYNC_STATUS') setSyncStatus(evt.status);
      if (evt.type === 'SYNC_MESSAGE') addLog(`← Sync: ${JSON.stringify(evt.message)}`);
    });

    return () => { unsubBridge(); unsubSync(); };
  }, []);

  function addLog(msg) {
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...prev].slice(0, 30));
  }

  function handleConnectBridge() {
    const url = `ws://${bridgeHost}:7070`;
    addLog(`Connecting Bridge → ${url}`);
    connectBridge(url);
  }

  function handleDisconnectBridge() {
    disconnectBridge();
    setBridgeStatus('disconnected');
    addLog('Bridge disconnected.');
  }

  function handleConnectSync() {
    addLog(`Connecting Sync → ${syncUrl}`);
    connectSync(syncUrl, { role: 'HOST', roomId: 'service', deviceId: 'conductor' });
  }

  function handleDisconnectSync() {
    disconnectSync();
    addLog('Sync disconnected.');
  }

  function handleTestCue() {
    const ok = sendCue({
      songTitle: 'Test Song',
      sectionName: 'Chorus',
      sectionIndex: 1,
      totalSections: 4,
    });
    addLog(ok ? '→ Test cue sent: Chorus (index 1)' : '✕ Bridge not connected — test cue not sent');
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      <Text style={styles.heading}>External Sync</Text>
      <Text style={styles.sub}>
        Connect to the Ultimate Bridge to send live cues to ProPresenter, lighting, and keep
        multiple devices in sync. Run the bridge scripts on a laptop on the same Wi‑Fi network.
      </Text>

      {/* Bridge (MIDI / OSC / Cues) */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardTitle}>Bridge  ·  MIDI / OSC / Cues</Text>
          <View style={[styles.dot, { backgroundColor: STATUS_COLOR[bridgeStatus] || '#6B7280' }]} />
          <Text style={[styles.statusText, { color: STATUS_COLOR[bridgeStatus] || '#6B7280' }]}>
            {bridgeStatus}
          </Text>
        </View>
        <Text style={styles.cardNote}>Port 7070  ·  Sends section cues, MIDI clock, and OSC to lyric / lighting software</Text>

        <Text style={styles.inputLabel}>Bridge Host IP</Text>
        <TextInput
          style={styles.input}
          value={bridgeHost}
          onChangeText={setBridgeHost}
          placeholder="192.168.1.100"
          placeholderTextColor="#4B5563"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        <Text style={styles.inputSub}>ws://{bridgeHost}:7070</Text>

        <View style={styles.btnRow}>
          {bridgeStatus === 'connected' ? (
            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleDisconnectBridge}>
              <Text style={styles.btnText}>Disconnect</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.btn} onPress={handleConnectBridge}>
              <Text style={styles.btnText}>Connect</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.btn, styles.btnPurple]} onPress={handleTestCue}>
            <Text style={styles.btnText}>Send Test Cue</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Device Sync */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardTitle}>Device Sync  ·  Multi-Device</Text>
          <View style={[styles.dot, { backgroundColor: STATUS_COLOR[syncStatus] || '#6B7280' }]} />
          <Text style={[styles.statusText, { color: STATUS_COLOR[syncStatus] || '#6B7280' }]}>
            {syncStatus}
          </Text>
        </View>
        <Text style={styles.cardNote}>Port 7071  ·  Keeps all musician devices (phones / tablets) in sync</Text>

        <Text style={styles.inputLabel}>Sync WebSocket URL</Text>
        <TextInput
          style={styles.input}
          value={syncUrl}
          onChangeText={setSyncUrl}
          placeholder="ws://192.168.1.100:7071"
          placeholderTextColor="#4B5563"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {syncStatus === 'connected' ? (
          <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleDisconnectSync}>
            <Text style={styles.btnText}>Disconnect</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={handleConnectSync}>
            <Text style={styles.btnText}>Connect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Lyric Software — dynamic based on Settings selection */}
      {(() => {
        const sw = LYRIC_SOFTWARE_OPTIONS.find((o) => o.id === ppSoftware) || LYRIC_SOFTWARE_OPTIONS[0];
        const isMidi = sw.protocol === 'MIDI';
        const isCustomOsc = ppSoftware === 'custom_osc';
        const resolvedPath = isCustomOsc && ppOscPath ? ppOscPath : sw.hint;
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Lyric Software</Text>
            <Text style={styles.cardNote}>
              The bridge translates CUE_CHANGE messages to your lyric software. Select the software in Settings.
            </Text>

            {/* Selected software badge */}
            <View style={styles.swBadgeRow}>
              <View style={styles.swBadge}>
                <Text style={styles.swBadgeName}>{sw.name}</Text>
                <View style={styles.swProtoBadge}>
                  <Text style={styles.swProtoText}>{sw.protocol}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
                <Text style={styles.swChangeBtn}>Change →</Text>
              </TouchableOpacity>
            </View>

            {/* Protocol command */}
            <View style={styles.protoBlock}>
              <Text style={styles.protoBlockLabel}>Command sent by bridge</Text>
              <Text style={styles.protoBlockVal}>
                {isMidi
                  ? `MIDI PC  ch ${ppMidiCh}  value {sectionIndex}`
                  : resolvedPath}
              </Text>
            </View>

            {/* All supported software */}
            <Text style={styles.allSwLabel}>All supported software</Text>
            {LYRIC_SOFTWARE_OPTIONS.map((opt) => (
              <View key={opt.id} style={[styles.swRow, opt.id === ppSoftware && styles.swRowActive]}>
                <Text style={[styles.swRowName, opt.id === ppSoftware && styles.swRowNameActive]}>
                  {opt.name}
                </Text>
                <Text style={styles.swRowHint}>{opt.hint}</Text>
              </View>
            ))}

            {/* Target */}
            {ppTarget ? (
              <View style={styles.ppRow}>
                <Text style={styles.ppLabel}>Target:</Text>
                <Text style={styles.ppValue}>{ppTarget}</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.ppSetupBtn} onPress={() => navigation.navigate('Settings')}>
                <Text style={styles.ppSetupText}>Set target host / IP in Settings →</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })()}

      {/* How to enable per song */}
      <View style={styles.hintCard}>
        <Text style={styles.hintTitle}>Enabling per song</Text>
        <Text style={styles.hintText}>
          Open any song in the Library, scroll to{' '}
          <Text style={styles.hintHighlight}>🎬 Lyric Cue Sync</Text>, and turn it ON.
          When the bridge is connected and you tap a section during live playback, the cue fires
          automatically to your lyric software.
        </Text>
      </View>

      {/* Activity log */}
      {log.length > 0 && (
        <View style={styles.logCard}>
          <View style={styles.logHeader}>
            <Text style={styles.logTitle}>Activity</Text>
            <TouchableOpacity onPress={() => setLog([])}>
              <Text style={styles.logClear}>Clear</Text>
            </TouchableOpacity>
          </View>
          {log.map((line, i) => (
            <Text key={i} style={styles.logLine}>{line}</Text>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.bridgeSetupLink} onPress={() => navigation.navigate('BridgeSetup')}>
        <Text style={styles.bridgeSetupText}>Bridge setup guide & QR codes →</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  container: { padding: 20 },
  heading: { color: '#F9FAFB', fontSize: 26, fontWeight: '900' },
  sub: { color: '#6B7280', fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 20 },

  card: {
    backgroundColor: '#0B1220', borderRadius: 14,
    borderWidth: 1, borderColor: '#1F2937',
    padding: 16, marginBottom: 12,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { color: '#F9FAFB', fontWeight: '800', fontSize: 14, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  cardNote: { color: '#4B5563', fontSize: 12, lineHeight: 17, marginBottom: 12 },

  inputLabel: { color: '#6B7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input: {
    backgroundColor: '#060D1A', borderWidth: 1, borderColor: '#1F2937',
    borderRadius: 10, padding: 11, color: '#F9FAFB',
    fontSize: 13, fontFamily: 'monospace', marginBottom: 4,
  },
  inputSub: { color: '#374151', fontSize: 11, fontFamily: 'monospace', marginBottom: 12 },

  btnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: {
    backgroundColor: '#1E3A5F', borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 16,
  },
  btnDanger: { backgroundColor: '#3F0A0A', borderWidth: 1, borderColor: '#EF4444' },
  btnPurple: { backgroundColor: '#1E1B4B', borderWidth: 1, borderColor: '#4338CA' },
  btnText: { color: '#E5E7EB', fontWeight: '800', fontSize: 13 },

  // Lyric software card
  swBadgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  swBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swBadgeName: { color: '#F9FAFB', fontWeight: '800', fontSize: 14 },
  swProtoBadge: {
    backgroundColor: '#1E3A5F', borderRadius: 5,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  swProtoText: { color: '#93C5FD', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  swChangeBtn: { color: '#6B7280', fontSize: 12 },
  protoBlock: {
    backgroundColor: '#060D1A', borderRadius: 8, borderWidth: 1,
    borderColor: '#1F2937', padding: 10, marginBottom: 12,
  },
  protoBlockLabel: { color: '#4B5563', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  protoBlockVal: { color: '#A5B4FC', fontFamily: 'monospace', fontSize: 12 },
  allSwLabel: { color: '#374151', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  swRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#0A1020',
  },
  swRowActive: { borderBottomColor: '#0F2822' },
  swRowName: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 130 },
  swRowNameActive: { color: '#34D399', fontWeight: '800' },
  swRowHint: { color: '#374151', fontSize: 11, fontFamily: 'monospace', flex: 1, textAlign: 'right' },

  ppRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#060D1A', borderRadius: 8,
    borderWidth: 1, borderColor: '#1F2937', padding: 10,
  },
  ppLabel: { color: '#6B7280', fontSize: 12 },
  ppValue: { color: '#818CF8', fontSize: 12, fontWeight: '700', flex: 1 },
  ppSetupBtn: {
    padding: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#374151',
  },
  ppSetupText: { color: '#6B7280', fontSize: 13 },

  hintCard: {
    backgroundColor: '#080F1A', borderRadius: 12,
    borderWidth: 1, borderColor: '#1F2937',
    padding: 14, marginBottom: 12,
  },
  hintTitle: {
    color: '#9CA3AF', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  hintText: { color: '#4B5563', fontSize: 13, lineHeight: 19 },
  hintHighlight: { color: '#818CF8', fontWeight: '700' },

  logCard: {
    backgroundColor: '#080F1A', borderRadius: 12,
    borderWidth: 1, borderColor: '#1F2937',
    padding: 12, marginBottom: 12,
  },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  logTitle: { color: '#4B5563', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  logClear: { color: '#374151', fontSize: 11, fontWeight: '700' },
  logLine: { color: '#374151', fontSize: 11, fontFamily: 'monospace', marginBottom: 3 },

  bridgeSetupLink: {
    padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#374151',
    alignItems: 'center', marginBottom: 12,
  },
  bridgeSetupText: { color: '#6B7280', fontSize: 13 },
});
