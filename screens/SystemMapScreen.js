/**
 * SystemMapScreen — shows all connected devices and their roles.
 * Pulls device config from settings + bridge connection status.
 */
import React, { useEffect, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSettings } from '../data/storage';

const DEVICE_ICONS = {
  'keys':          '🎹',
  'guitar':        '🎸',
  'bass':          '🎸',
  'drums':         '🥁',
  'vocals':        '🎤',
  'mixer':         '🎚',
  'daw':           '💻',
  'projector':     '📽',
  'stage display': '🖥',
  'ipad':          '📱',
  'iphone':        '📱',
  'default':       '📡',
};

function deviceIcon(name) {
  const lower = (name || '').toLowerCase();
  for (const key of Object.keys(DEVICE_ICONS)) {
    if (lower.includes(key)) return DEVICE_ICONS[key];
  }
  return DEVICE_ICONS.default;
}

const DEFAULT_DEVICES = [
  { id: 'd1', name: 'Sync Server',      role: 'Team Data Hub',     host: '10.0.0.34:8099', type: 'server',   status: 'active' },
  { id: 'd2', name: 'CineStage AI',     role: 'Stems / Analysis',  host: '10.0.0.34:8000', type: 'daw',      status: 'idle' },
  { id: 'd3', name: 'Ultimate Mixer',   role: 'Stage Output',      host: '10.0.0.34:7071', type: 'mixer',    status: 'idle' },
  { id: 'd4', name: 'Stage Display',    role: 'Lyrics / Chords',   host: '—',              type: 'stage display', status: 'idle' },
  { id: 'd5', name: 'Keys iPad',        role: 'Playback App',      host: '—',              type: 'keys',     status: 'idle' },
  { id: 'd6', name: 'Drums Monitor',    role: 'In-Ear Mix',        host: '—',              type: 'drums',    status: 'idle' },
];

const STATUS_COLOR = { active: '#22C55E', idle: '#F59E0B', offline: '#EF4444' };

export default function SystemMapScreen({ navigation }) {
  const insets    = useSafeAreaInsets();
  const [devices, setDevices]   = useState(DEFAULT_DEVICES);
  const [settings, setSettings] = useState({});
  const [pinging, setPinging]   = useState(false);

  useEffect(() => {
    getSettings().then(s => {
      setSettings(s);
      // Update sync server host if configured
      if (s.syncServerHost) {
        setDevices(prev => prev.map(d =>
          d.id === 'd1' ? { ...d, host: s.syncServerHost } : d
        ));
      }
    });
  }, []);

  const pingAll = async () => {
    setPinging(true);
    const SYNC_URL = `http://${settings.syncServerHost || '10.0.0.34:8099'}`;
    const CINE_URL = `http://${settings.cinestageHost || '10.0.0.34:8000'}`;

    const checks = await Promise.allSettled([
      fetch(`${SYNC_URL}/sync/debug`, { signal: AbortSignal.timeout(3000) }),
      fetch(`${CINE_URL}/health`,     { signal: AbortSignal.timeout(3000) }),
    ]);

    setDevices(prev => prev.map((d, i) => {
      if (d.id === 'd1') return { ...d, status: checks[0].status === 'fulfilled' ? 'active' : 'offline' };
      if (d.id === 'd2') return { ...d, status: checks[1].status === 'fulfilled' ? 'active' : 'offline' };
      return d;
    }));
    setPinging(false);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>System Map</Text>
        <TouchableOpacity onPress={pingAll} disabled={pinging} style={s.pingBtn}>
          {pinging
            ? <ActivityIndicator size="small" color="#8B5CF6" />
            : <Text style={s.pingText}>Ping All</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {/* Network info */}
        <View style={s.netBanner}>
          <Text style={s.netText}>📡  Local Network: 10.0.0.x  |  Sync port: 8099  |  CineStage port: 8000</Text>
        </View>

        {/* Device cards */}
        {devices.map(device => (
          <View key={device.id} style={s.card}>
            <Text style={s.cardIcon}>{deviceIcon(device.name)}</Text>
            <View style={s.cardBody}>
              <Text style={s.cardName}>{device.name}</Text>
              <Text style={s.cardRole}>{device.role}</Text>
              <Text style={s.cardHost}>{device.host}</Text>
            </View>
            <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[device.status] || '#6B7280' }]} />
          </View>
        ))}

        {/* Legend */}
        <View style={s.legend}>
          <View style={s.legendRow}>
            <View style={[s.dot, { backgroundColor: STATUS_COLOR.active }]} />
            <Text style={s.legendText}>Online / Reachable</Text>
          </View>
          <View style={s.legendRow}>
            <View style={[s.dot, { backgroundColor: STATUS_COLOR.idle }]} />
            <Text style={s.legendText}>Not yet pinged</Text>
          </View>
          <View style={s.legendRow}>
            <View style={[s.dot, { backgroundColor: STATUS_COLOR.offline }]} />
            <Text style={s.legendText}>Offline / Unreachable</Text>
          </View>
        </View>

        {/* Tip */}
        <View style={s.tip}>
          <Text style={s.tipText}>
            💡 Tap "Ping All" to check live status of Sync Server and CineStage AI. All devices must be on the same Wi-Fi network.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#020617' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1E2740' },
  back:       { fontSize: 15, color: '#8B5CF6', fontWeight: '600', minWidth: 60 },
  title:      { fontSize: 17, fontWeight: '800', color: '#F9FAFB' },
  pingBtn:    { minWidth: 60, alignItems: 'flex-end' },
  pingText:   { fontSize: 14, color: '#8B5CF6', fontWeight: '700' },
  body:       { padding: 16, paddingBottom: 60 },
  netBanner:  { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#1E2740', borderRadius: 10, padding: 12, marginBottom: 16 },
  netText:    { fontSize: 12, color: '#6B7280', textAlign: 'center' },
  card:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#1E2740', borderRadius: 12, padding: 14, marginBottom: 10 },
  cardIcon:   { fontSize: 28, marginRight: 14 },
  cardBody:   { flex: 1 },
  cardName:   { fontSize: 15, fontWeight: '700', color: '#F9FAFB' },
  cardRole:   { fontSize: 12, color: '#6B7280', marginTop: 2 },
  cardHost:   { fontSize: 11, color: '#374151', marginTop: 3, fontFamily: 'Courier' },
  statusDot:  { width: 12, height: 12, borderRadius: 6, marginLeft: 10 },
  legend:     { marginTop: 24, padding: 14, backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#1E2740' },
  legendRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dot:        { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  legendText: { fontSize: 13, color: '#9CA3AF' },
  tip:        { marginTop: 14, padding: 12, backgroundColor: '#1E3A2F', borderRadius: 10, borderWidth: 1, borderColor: '#059669' },
  tipText:    { fontSize: 12, color: '#6EE7B7', lineHeight: 18 },
});
