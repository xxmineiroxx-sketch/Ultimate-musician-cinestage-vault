import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';

export default function HomeScreen({ navigation }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Ultimate Musician</Text>
      <Text style={styles.subtitle}>Powered by CineStage</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Modes</Text>
        <PrimaryButton title="Planning Center" onPress={() => navigation.navigate('Planning')} />
        <PrimaryButton title="Rehearsal" onPress={() => navigation.navigate('Rehearsal')} style={styles.secondary} />
        <PrimaryButton title="Live Performance" onPress={() => navigation.navigate('Live', { song: {}, mixerState: [] })} style={styles.secondary} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Library</Text>
        <PrimaryButton title="Open Library" onPress={() => navigation.navigate('Library')} />
        <PrimaryButton title="Stems Center" onPress={() => navigation.navigate('Stems Center')} style={styles.secondary} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Team</Text>
        <PrimaryButton title="People & Roles" onPress={() => navigation.navigate('People & Roles')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#020617',
  },
  title: {
    color: '#F9FAFB',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 18,
  },
  card: {
    marginTop: 16,
    backgroundColor: '#0B1120',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#111827',
  },
  cardTitle: {
    color: '#E5E7EB',
    fontWeight: '600',
    marginBottom: 10,
  },
  secondary: {
    marginTop: 10,
    backgroundColor: '#111827',
  },
});
