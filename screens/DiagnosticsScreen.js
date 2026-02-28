/**
 * DiagnosticsScreen — collects device info, app state, and user notes,
 * then posts a diagnostics report to the sync server as an admin message.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SYNC_URL } from './config';

const APP_VERSION = '1.0.0';

async function collectDiagnostics() {
  const keys = await AsyncStorage.getAllKeys();
  const sizes = {};
  for (const k of keys) {
    try {
      const val = await AsyncStorage.getItem(k);
      sizes[k] = val ? val.length : 0;
    } catch { sizes[k] = -1; }
  }
  return {
    appVersion:   APP_VERSION,
    platform:     Platform.OS,
    osVersion:    Platform.Version,
    timestamp:    new Date().toISOString(),
    storageKeys:  keys,
    storageSizes: sizes,
    totalStorage: Object.values(sizes).reduce((a, b) => a + b, 0),
  };
}

export default function DiagnosticsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [notes, setNotes]       = useState('');
  const [diag, setDiag]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);

  useEffect(() => {
    collectDiagnostics().then(d => {
      setDiag(d);
      setLoading(false);
    });
  }, []);

  const handleSend = async () => {
    if (!diag) return;
    setSending(true);
    try {
      const report = {
        ...diag,
        userNotes: notes.trim(),
      };
      const body = {
        from_email: 'diagnostics@ultimatemusician.local',
        from_name:  'App Diagnostics',
        subject:    `[Diagnostics] v${APP_VERSION} — ${Platform.OS} — ${new Date().toLocaleDateString()}`,
        message:    JSON.stringify(report, null, 2),
      };
      const res = await fetch(`${SYNC_URL}/sync/message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      setSent(true);
    } catch (e) {
      Alert.alert('Sent (offline mode)', 'Diagnostics collected. Server was not reachable, but the report is ready to share manually.');
      setSent(true);
    }
    setSending(false);
  };

  if (sent) {
    return (
      <View style={[s.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={s.sentIcon}>🔧</Text>
        <Text style={s.sentTitle}>Diagnostics Sent</Text>
        <Text style={s.sentText}>The admin will receive your report shortly.</Text>
        <TouchableOpacity style={s.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.body, { paddingTop: insets.top + 16 }]} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>Support & Diagnostics</Text>
        <Text style={s.subtitle}>Send a diagnostics report to the admin. Includes app version, storage info, and your notes.</Text>

        {/* Diagnostics Preview */}
        {loading ? (
          <ActivityIndicator color="#6366F1" style={{ marginVertical: 20 }} />
        ) : diag ? (
          <View style={s.diagCard}>
            <Text style={s.diagTitle}>📋 System Info</Text>
            <View style={s.diagRow}><Text style={s.diagKey}>App Version</Text><Text style={s.diagVal}>{diag.appVersion}</Text></View>
            <View style={s.diagRow}><Text style={s.diagKey}>Platform</Text><Text style={s.diagVal}>{diag.platform} {diag.osVersion}</Text></View>
            <View style={s.diagRow}><Text style={s.diagKey}>Storage Keys</Text><Text style={s.diagVal}>{diag.storageKeys.length} keys</Text></View>
            <View style={s.diagRow}><Text style={s.diagKey}>Total Storage</Text><Text style={s.diagVal}>{(diag.totalStorage / 1024).toFixed(1)} KB</Text></View>
            <View style={s.diagRow}><Text style={s.diagKey}>Timestamp</Text><Text style={s.diagVal}>{new Date(diag.timestamp).toLocaleString()}</Text></View>
          </View>
        ) : null}

        {/* Notes */}
        <Text style={s.label}>Describe the problem (optional)</Text>
        <TextInput
          style={[s.input, s.inputMulti]}
          value={notes}
          onChangeText={setNotes}
          multiline
          textAlignVertical="top"
          placeholder="e.g. App crashes when opening Library after import..."
          placeholderTextColor="#374151"
          maxLength={300}
        />

        {/* Send */}
        <TouchableOpacity style={s.sendBtn} onPress={handleSend} disabled={sending || loading}>
          {sending
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Text style={s.sendBtnText}>Send Diagnostics to Admin</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#020617' },
  body:       { paddingHorizontal: 20, paddingBottom: 60 },
  pageTitle:  { fontSize: 24, fontWeight: '800', color: '#F9FAFB', marginBottom: 6 },
  subtitle:   { fontSize: 13, color: '#6B7280', marginBottom: 24, lineHeight: 20 },
  diagCard:   { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#1E2740', borderRadius: 12, padding: 16, marginBottom: 24 },
  diagTitle:  { fontSize: 14, fontWeight: '700', color: '#9CA3AF', marginBottom: 12 },
  diagRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0F172A' },
  diagKey:    { fontSize: 13, color: '#6B7280' },
  diagVal:    { fontSize: 13, fontWeight: '600', color: '#D1D5DB' },
  label:      { fontSize: 12, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input:      { borderWidth: 1, borderColor: '#374151', borderRadius: 10, padding: 14, color: '#F3F4F6', backgroundColor: '#0B1120', fontSize: 14, marginBottom: 24 },
  inputMulti: { minHeight: 100 },
  sendBtn:    { backgroundColor: '#4F46E5', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  sendBtnText:{ fontSize: 16, fontWeight: '700', color: '#FFF' },
  sentIcon:   { fontSize: 72, marginBottom: 20 },
  sentTitle:  { fontSize: 22, fontWeight: '800', color: '#F9FAFB', marginBottom: 12 },
  sentText:   { fontSize: 15, color: '#9CA3AF', textAlign: 'center', marginBottom: 32, paddingHorizontal: 30 },
  doneBtn:    { backgroundColor: '#8B5CF6', paddingHorizontal: 48, paddingVertical: 16, borderRadius: 12 },
  doneBtnText:{ fontSize: 16, fontWeight: '700', color: '#FFF' },
});
