import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const DeviceItem = ({ name, status, color }) => {
  const isActive = status === 'connected' || status === 'ready' || status === 'ok';
  const isWarning = status === 'warning' || status === 'syncing';
  const isError = status === 'error' || status === 'disconnected';

  let statusColor = '#475569'; // Default gray
  if (isActive) statusColor = '#22C55E'; // Green
  if (isWarning) statusColor = '#EAB308'; // Yellow
  if (isError) statusColor = '#EF4444'; // Red

  return (
    <View style={styles.deviceItem}>
      <View style={[styles.statusDot, { backgroundColor: statusColor, shadowColor: statusColor }]} />
      <View>
        <Text style={styles.deviceName}>{name}</Text>
        <Text style={[styles.statusText, { color: statusColor }]}>{status.toUpperCase()}</Text>
      </View>
    </View>
  );
};

export default function DeviceStatusHub({ devices = {} }) {
  // devices: { nord: 'ready', modx: 'ready', ableton: 'connected' }
  return (
    <View style={styles.container}>
      <DeviceItem name="NORD STAGE" status={devices.nord || 'disconnected'} />
      <View style={styles.separator} />
      <DeviceItem name="YAMAHA MODX" status={devices.modx || 'disconnected'} />
      <View style={styles.separator} />
      <DeviceItem name="ABLETON" status={devices.ableton || 'disconnected'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 8,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  deviceName: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '900',
    marginTop: 1,
  },
  separator: {
    width: 1,
    height: 20,
    backgroundColor: '#1E293B',
  },
});
