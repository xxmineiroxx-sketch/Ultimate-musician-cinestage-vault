import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { SYNC_URL, syncHeaders } from '../../config/syncConfig';
import { getUserProfile, saveUserProfile } from '../services/storage';
import { normalizeGrantRole } from '../utils/roleUtils';

async function fetchRemoteGrantRole(email) {
  if (!email) return '';
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(
      `${SYNC_URL}/sync/role?email=${encodeURIComponent(email)}`,
      { headers: syncHeaders(), signal: ctrl.signal },
    );
    if (!res.ok) return '';
    const data = await res.json();
    return normalizeGrantRole(data?.grantedRole || data?.role || '');
  } catch {
    return '';
  } finally {
    clearTimeout(tid);
  }
}

export default function RoleGate({
  navigation,
  route,
  allowedRoles,
  children,
  fallbackTitle = 'Access Restricted',
  fallbackBody = 'This area is only available to your team leaders.',
}) {
  const [state, setState] = useState({
    loading: true,
    allowed: false,
    role: '',
    profile: null,
  });

  const loadAccess = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    const profile = await getUserProfile().catch(() => null);
    const localRole = normalizeGrantRole(profile?.grantedRole || profile?.role || '');
    const remoteRole = await fetchRemoteGrantRole(profile?.email);
    const role = remoteRole || localRole;
    if (remoteRole && remoteRole !== localRole) {
      await saveUserProfile({ ...(profile || {}), grantedRole: remoteRole }).catch(() => {});
    }
    setState({
      loading: false,
      allowed: allowedRoles.has(role),
      role,
      profile,
    });
  }, [allowedRoles]);

  useFocusEffect(
    useCallback(() => {
      loadAccess();
    }, [loadAccess]),
  );

  if (state.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#818CF8" />
      </View>
    );
  }

  if (!state.allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>{fallbackTitle}</Text>
        <Text style={styles.body}>{fallbackBody}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Main')}
        >
          <Text style={styles.buttonText}>Back to Playback</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return children({ role: state.role, profile: state.profile, navigation, route });
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  icon: {
    fontSize: 44,
    marginBottom: 14,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    color: '#9CA3AF',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
