import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

const MODES = [
  {
    route: 'PlanningCenter',
    icon: '📅',
    title: 'Planning Service',
    subtitle: 'Build your setlist, assign roles, and prep the service.',
    accent: '#4F46E5',
    border: '#1E1B4B',
  },
  {
    route: 'Rehearsal',
    icon: '🎵',
    title: 'Rehearsal',
    subtitle: 'Run through songs with click, guide tracks, and cue stacks.',
    accent: '#047857',
    border: '#064E3B',
  },
  {
    route: 'Live',
    icon: '🎤',
    title: 'Live Performance',
    subtitle: 'Stems, MIDI clock, stage display, and live controls.',
    accent: '#B45309',
    border: '#451A03',
    params: { song: {}, mixerState: [] },
  },
];

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userId, token, logout } = useAuth();
  const isGuest = userId && !token;
  const displayName = isGuest ? 'Guest' : 'Musician';

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.badge}>CineStage™</Text>
          <Text style={styles.title}>Ultimate Musician</Text>
        </View>
        <TouchableOpacity
          style={styles.userPill}
          onPress={() => navigation.navigate('Profile')}
        >
          <Text style={styles.userPillText}>{displayName}</Text>
        </TouchableOpacity>
      </View>

      {/* Mode tiles */}
      <Text style={styles.sectionLabel}>Choose a Mode</Text>

      {MODES.map((m) => (
        <TouchableOpacity
          key={m.route}
          style={[styles.modeCard, { borderColor: m.border }]}
          activeOpacity={0.75}
          onPress={() => navigation.navigate(m.route, m.params || {})}
        >
          <View style={[styles.modeIconWrap, { backgroundColor: m.accent + '22' }]}>
            <Text style={styles.modeIcon}>{m.icon}</Text>
          </View>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>{m.title}</Text>
            <Text style={styles.modeSub}>{m.subtitle}</Text>
          </View>
          <View style={[styles.modeArrow, { backgroundColor: m.accent }]}>
            <Text style={styles.modeArrowText}>›</Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* Quick tools */}
      <Text style={styles.sectionLabel}>Quick Access</Text>
      <View style={styles.quickRow}>
        {[
          { label: 'Library', route: 'Library' },
          { label: 'Setlist', route: 'Setlist' },
          { label: 'Stems', route: 'Stems Center' },
          { label: 'Bridge', route: 'BridgeSetup' },
          { label: 'Presets', route: 'Presets' },
          { label: 'Messages', route: 'MessageCenter' },
          { label: 'Permissions', route: 'Permissions' },
          { label: 'Proposals', route: 'Proposals' },
          { label: 'My Availability', route: 'BlockoutCalendar' },
          { label: 'Settings', route: 'Settings' },
          { label: 'Sign Out', onPress: async () => { await logout(); navigation.reset({ index: 0, routes: [{ name: 'Landing' }] }); } },
        ].map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.quickPill}
            onPress={item.onPress || (() => navigation.navigate(item.route))}
          >
            <Text style={[styles.quickPillText, item.label === 'Sign Out' && { color: '#EF4444' }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    backgroundColor: '#020617',
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  badge: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 26,
    fontWeight: '900',
  },
  userPill: {
    backgroundColor: '#0B1120',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
  },
  userPillText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  modeIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeIcon: {
    fontSize: 26,
  },
  modeText: {
    flex: 1,
  },
  modeTitle: {
    color: '#F9FAFB',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  modeSub: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 17,
  },
  modeArrow: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeArrowText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: -2,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickPill: {
    backgroundColor: '#0B1120',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickPillText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
});
