/**
 * Permissions Screen - Ultimate Musician
 * Assign MD / Admin roles to team members.
 * Grants are stored on the sync server and checked by Ultimate Playback.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';

const SYNC_URL = 'http://10.0.0.34:8099';

const ROLE_CYCLE = [null, 'md', 'admin']; // null = no grant
const ROLE_LABEL = { md: 'Music Director', admin: 'Admin' };
const ROLE_COLOR = { md: '#8B5CF6', admin: '#F59E0B' };
const ROLE_ICON  = { md: '🎛', admin: '👑' };

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(tid); }
}

export default function PermissionsScreen() {
  const [people, setPeople]       = useState([]);
  const [grants, setGrants]       = useState({}); // email → { role, name, grantedAt }
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(null); // email being saved
  const [error, setError]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [peopleData, grantsList] = await Promise.all([
        fetchJson(`${SYNC_URL}/sync/people`),
        fetchJson(`${SYNC_URL}/sync/grants`),
      ]);
      setPeople(Array.isArray(peopleData) ? peopleData : []);
      // Convert grants list to map
      const map = {};
      (grantsList || []).forEach(g => { map[g.email] = g; });
      setGrants(map);
    } catch (e) {
      setError('Cannot reach sync server. Is it running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const cycleRole = async (person) => {
    const email = (person.email || '').toLowerCase();
    if (!email) {
      Alert.alert('No Email', `${person.name} has no email set — cannot grant a role.`);
      return;
    }
    const current = grants[email]?.role || null;
    const nextIdx = (ROLE_CYCLE.indexOf(current) + 1) % ROLE_CYCLE.length;
    const nextRole = ROLE_CYCLE[nextIdx];

    setSaving(email);
    try {
      if (nextRole === null) {
        await fetchJson(`${SYNC_URL}/sync/grant?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
        setGrants(prev => { const g = { ...prev }; delete g[email]; return g; });
      } else {
        await fetchJson(`${SYNC_URL}/sync/grant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: person.name, role: nextRole }),
        });
        setGrants(prev => ({ ...prev, [email]: { role: nextRole, name: person.name } }));
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(null);
    }
  };

  const grantedCount = Object.keys(grants).length;

  return (
    <View style={s.container}>
      {/* Info banner */}
      <View style={s.infoBanner}>
        <Text style={s.infoTitle}>Team Permissions</Text>
        <Text style={s.infoText}>
          Grant a team member elevated access in Ultimate Playback.{'\n'}
          Tap a person to cycle their role: None → MD → Admin → None
        </Text>
        <View style={s.legendRow}>
          <View style={s.legendItem}>
            <Text style={s.legendIcon}>🎛</Text>
            <View>
              <Text style={s.legendLabel}>Music Director (MD)</Text>
              <Text style={s.legendDesc}>Receive all messages, manage services, team & songs</Text>
            </View>
          </View>
          <View style={s.legendItem}>
            <Text style={s.legendIcon}>👑</Text>
            <View>
              <Text style={s.legendLabel}>Admin</Text>
              <Text style={s.legendDesc}>Full access — same as MD plus can approve content edits</Text>
            </View>
          </View>
        </View>
      </View>

      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={load}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {grantedCount > 0 && (
        <View style={s.summaryRow}>
          <Text style={s.summaryText}>
            {grantedCount} member{grantedCount > 1 ? 's' : ''} with elevated access
          </Text>
        </View>
      )}

      <FlatList
        data={people}
        keyExtractor={item => item.id || item.email || item.name}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor="#8B5CF6" />
        }
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const email = (item.email || '').toLowerCase();
          const grant = grants[email];
          const role  = grant?.role || null;
          const isSaving = saving === email;

          return (
            <TouchableOpacity
              style={[s.card, role && s.cardGranted, role === 'admin' && s.cardAdmin]}
              onPress={() => cycleRole(item)}
              disabled={!!saving}
            >
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={s.cardBody}>
                <Text style={s.cardName}>{item.name}</Text>
                <Text style={s.cardEmail}>{item.email || '(no email)'}</Text>
              </View>
              <View style={s.cardRight}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#8B5CF6" />
                ) : role ? (
                  <View style={[s.roleBadge, { backgroundColor: ROLE_COLOR[role] + '22', borderColor: ROLE_COLOR[role] }]}>
                    <Text style={[s.roleBadgeText, { color: ROLE_COLOR[role] }]}>
                      {ROLE_ICON[role]} {ROLE_LABEL[role]}
                    </Text>
                  </View>
                ) : (
                  <View style={s.noBadge}>
                    <Text style={s.noBadgeText}>No Role</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !loading && (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>👥</Text>
              <Text style={s.emptyTitle}>No Team Members</Text>
              <Text style={s.emptyText}>
                Publish your team from a Service Plan to see members here.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  infoBanner: { margin: 16, padding: 16, backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151' },
  infoTitle: { fontSize: 16, fontWeight: '700', color: '#F9FAFB', marginBottom: 6 },
  infoText: { fontSize: 13, color: '#9CA3AF', lineHeight: 20, marginBottom: 12 },
  legendRow: { gap: 10 },
  legendItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  legendIcon: { fontSize: 20, marginTop: 2 },
  legendLabel: { fontSize: 13, fontWeight: '700', color: '#E5E7EB' },
  legendDesc: { fontSize: 11, color: '#6B7280', lineHeight: 16 },

  errorBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: 16, marginTop: 0, padding: 12, backgroundColor: '#7C2D1220', borderRadius: 8, borderWidth: 1, borderColor: '#F97316' },
  errorText: { fontSize: 13, color: '#F97316', flex: 1 },
  retryText: { fontSize: 13, color: '#F97316', fontWeight: '700', marginLeft: 10 },

  summaryRow: { paddingHorizontal: 16, paddingBottom: 8 },
  summaryText: { fontSize: 12, color: '#8B5CF6', fontWeight: '600' },

  list: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', marginBottom: 10 },
  cardGranted: { borderColor: '#8B5CF6', backgroundColor: '#1E1B4B' },
  cardAdmin: { borderColor: '#F59E0B', backgroundColor: '#1C1200' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#F9FAFB' },
  cardBody: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#F9FAFB' },
  cardEmail: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  cardRight: { minWidth: 110, alignItems: 'flex-end' },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },
  noBadge: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#1F2937', borderRadius: 10 },
  noBadgeText: { fontSize: 12, color: '#4B5563', fontWeight: '600' },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#F9FAFB', marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20, paddingHorizontal: 30 },
});
