/**
 * Registration Screen - Phase 1
 * Phone + Email signup for team members
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { saveUserProfile } from '../services/storage';
import { createUserProfile } from '../models_v2/models';

export default function RegistrationScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const handleRegister = async () => {
    if (!phone || !email || !name) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      const profile = createUserProfile(
        `user_${Date.now()}`,
        phone,
        email,
        name,
        null
      );

      await saveUserProfile(profile);

      Alert.alert(
        'Success',
        'Registration complete! Now set up your profile.',
        [{ text: 'OK', onPress: () => navigation.replace('ProfileSetup') }]
      );
    } catch (error) {
      Alert.alert('Error', 'Registration failed. Please try again.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
    >
      <View style={styles.header}>
        <Text style={styles.headerIcon}>📝</Text>
        <Text style={styles.title}>Team Member Registration</Text>
        <Text style={styles.subtitle}>Join your worship team</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Enter your full name"
          placeholderTextColor="#6B7280"
        />

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+1 (555) 123-4567"
          placeholderTextColor="#6B7280"
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#6B7280"
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <TouchableOpacity style={styles.registerButton} onPress={handleRegister}>
        <Text style={styles.registerButtonText}>Register</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backButtonText}>Back to Home</Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          After registration, you'll be able to:
        </Text>
        <Text style={styles.featureText}>• Select your musical roles</Text>
        <Text style={styles.featureText}>• Receive service assignments</Text>
        <Text style={styles.featureText}>• Access role-specific content</Text>
        <Text style={styles.featureText}>• Communicate with your team</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    padding: 20,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 20,
  },
  headerIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#F9FAFB',
  },
  registerButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  registerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  backButton: {
    padding: 16,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  infoBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  infoText: {
    fontSize: 14,
    color: '#E5E7EB',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 6,
  },
});
