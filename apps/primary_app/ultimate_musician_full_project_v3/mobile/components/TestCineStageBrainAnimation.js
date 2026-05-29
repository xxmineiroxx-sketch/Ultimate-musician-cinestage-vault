/**
 * TestCineStageBrainAnimation - Test screen for CineStage Brain animation
 * 
 * This test screen can be used to verify the animation works properly
 * on iPhone 17 Pro Max simulator
 */

import React from 'react';
import { View, StyleSheet, ScrollView, Text, Platform } from 'react-native';
import CineStageBrainStatus from './CineStageBrainStatus';
import CineStageBrainLogo from './CineStageBrainLogo';

export default function TestCineStageBrainAnimation() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CineStage Brain Logo</Text>
        <Text style={styles.sectionDesc}>Animated brain logo with real-time connection</Text>
        <View style={styles.exampleContainer}>
          <CineStageBrainLogo size="large" showStatusText={true} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Compact Status</Text>
        <Text style={styles.sectionDesc}>Small indicator for headers</Text>
        <View style={styles.exampleContainer}>
          <CineStageBrainStatus compact={true} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Full Status Panel</Text>
        <Text style={styles.sectionDesc}>Complete status with connection metrics</Text>
        <View style={styles.exampleContainer}>
          <CineStageBrainStatus compact={false} showDetails={true} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Technical Info</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>📱 Platform: {Platform.OS}</Text>
          <Text style={styles.infoText}>🧠 CineStage Brain: Cloudflare Workers</Text>
          <Text style={styles.infoText}>🌐 Endpoint: prod.cinestage.workers.dev</Text>
          <Text style={styles.infoText}>⚡ Animations: Native driver optimized</Text>
          <Text style={styles.infoText}>🔄 Real-time: 5-second refresh interval</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E5E7EB',
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  exampleContainer: {
    backgroundColor: '#1E293B',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  infoBox: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
  },
  infoText: {
    color: '#D1D5DB',
    fontSize: 13,
    marginBottom: 12,
    fontWeight: '600',
  },
});

// Quick test if running standalone
if (typeof module !== 'undefined' && !module.parent) {
  console.log('✅ CineStage Brain Animation test component loaded');
  console.log('- Animation duration: 2s pulse, 15s rotation');
  console.log('- Real-time updates: 5s interval');
  console.log('- Connects to: Cloudflare Workers');
}
