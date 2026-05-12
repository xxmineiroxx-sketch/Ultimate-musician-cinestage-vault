import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import useNetworkStatus from '../hooks/useNetworkStatus';
import { addQueueListener } from '../services/apiQueue';
import { useEffect, useState } from 'react';

/**
 * OfflineIndicator — Network status banner + pending sync badge
 *
 * Shows:
 *   - "Offline — changes will sync when you're back online" when disconnected
 *   - Pending sync count badge when there are queued requests
 *
 * Usage:
 *   <OfflineIndicator />
 *
 * Or with custom positioning:
 *   <OfflineIndicator style={{ position: 'absolute', top: 0 }} />
 */

export default function OfflineIndicator({ style = {} }) {
  const { isOffline, isOnline } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const unsub = addQueueListener((event, payload) => {
      if (event === 'pendingCountChanged') {
        setPendingCount(payload);
      }
    });
    return unsub;
  }, []);

  if (!isOffline && pendingCount === 0) {
    return null;
  }

  const showOffline = isOffline === true;
  const showPending = !showOffline && pendingCount > 0;

  return (
    <View style={[styles.container, showOffline ? styles.offline : styles.pending, style]}>
      {showOffline && (
        <Text style={styles.text}>
          ⚠️ Offline — {pendingCount > 0 ? `${pendingCount} change${pendingCount > 1 ? 's' : ''} queued` : "changes will sync when you're back online"}
        </Text>
      )}
      {showPending && (
        <Text style={styles.text}>
          ⏳ {pendingCount} pending change{pendingCount > 1 ? 's' : ''} syncing…
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offline: {
    backgroundColor: '#FF9500',
  },
  pending: {
    backgroundColor: '#007AFF',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
