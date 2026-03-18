import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { register } from '../services/authAPI';
import { parseRoleAssignments } from '../models_v2/models';

const ROLES = ['Keys', 'Drums', 'Bass', 'Electric Guitar', 'Acoustic Guitar',
  'Lead Vocals', 'BG Vocals', 'Music Director', 'Sound Tech', 'Other'];

export default function RegistrationScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const prefillEmail = route?.params?.email || '';

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: prefillEmail,
    password: '', confirmPassword: '', phone: '', role: '',
  });
  const [loading, setLoading] = useState(false);
  const [showRoles, setShowRoles] = useState(false);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleRegister = async () => {
    const { firstName, lastName, email, password, confirmPassword, phone, role } = form;
    if (!firstName.trim() || !lastName.trim()) return Alert.alert('Required', 'First and last name are required.');
    if (!email.trim()) return Alert.alert('Required', 'Email is required.');
    if (!password) return Alert.alert('Required', 'Password is required.');
    if (password.length < 6) return Alert.alert('Too short', 'Password must be at least 6 characters.');
    if (password !== confirmPassword) return Alert.alert('Mismatch', 'Passwords do not match.');

    setLoading(true);
    try {
      const result = await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        roleAssignments: parseRoleAssignments(role ? [role] : []),
      });
      if (result?.needsVerification) {
        navigation.replace('Verify', {
          identifier: result.email || email.trim(),
          email: result.email || email.trim(),
          purpose: result.verificationPurpose || 'signup',
        });
        return;
      }
      navigation.replace('Main', { screen: 'HomeTab' });
    } catch (err) {
      Alert.alert('Registration Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: Math.max(insets.top + 16, 60) }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <View style={styles.brandBlock}>
          <Text style={styles.badge}>CineStage™</Text>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join your worship team on Ultimate Playback</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Name row */}
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>First Name *</Text>
              <TextInput style={styles.input} value={form.firstName} onChangeText={v => update('firstName', v)} placeholder="First" placeholderTextColor="#4B5563" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Last Name *</Text>
              <TextInput style={styles.input} value={form.lastName} onChangeText={v => update('lastName', v)} placeholder="Last" placeholderTextColor="#4B5563" />
            </View>
          </View>

          <Text style={styles.label}>Email *</Text>
          <TextInput style={styles.input} value={form.email} onChangeText={v => update('email', v)} placeholder="you@example.com" placeholderTextColor="#4B5563" autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />

          <Text style={styles.label}>Password *</Text>
          <TextInput style={styles.input} value={form.password} onChangeText={v => update('password', v)} placeholder="Min. 6 characters" placeholderTextColor="#4B5563" secureTextEntry />

          <Text style={styles.label}>Confirm Password *</Text>
          <TextInput style={styles.input} value={form.confirmPassword} onChangeText={v => update('confirmPassword', v)} placeholder="Repeat password" placeholderTextColor="#4B5563" secureTextEntry />

          <Text style={styles.label}>Phone Number</Text>
          <TextInput style={styles.input} value={form.phone} onChangeText={v => update('phone', v)} placeholder="(555) 123-4567" placeholderTextColor="#4B5563" keyboardType="phone-pad" />
          <Text style={styles.helperText}>
            Save a phone number here to enable text sign-in on synced devices.
          </Text>

          <Text style={styles.label}>Role / Instrument</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowRoles(!showRoles)}>
            <Text style={form.role ? styles.roleSelected : styles.rolePlaceholder}>
              {form.role || 'Select your primary role'}
            </Text>
          </TouchableOpacity>

          {showRoles && (
            <View style={styles.rolesList}>
              {ROLES.map(r => (
                <TouchableOpacity key={r} style={[styles.roleItem, form.role === r && styles.roleItemActive]} onPress={() => { update('role', r); setShowRoles(false); }}>
                  <Text style={[styles.roleItemText, form.role === r && styles.roleItemTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, loading && { opacity: 0.6 }]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Account</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#020617', paddingHorizontal: 24, paddingBottom: 48 },
  brandBlock: { alignItems: 'center', marginBottom: 32 },
  badge: { color: '#818CF8', fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  title: { color: '#F9FAFB', fontSize: 28, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#6B7280', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  card: { backgroundColor: '#0B1120', borderRadius: 20, borderWidth: 1, borderColor: '#1F2937', padding: 20, marginBottom: 16 },
  row: { flexDirection: 'row', marginBottom: 0 },
  label: { color: '#6B7280', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 },
  input: { backgroundColor: '#020617', borderRadius: 12, borderWidth: 1, borderColor: '#1F2937', paddingHorizontal: 14, paddingVertical: 12, color: '#F9FAFB', fontSize: 15, marginBottom: 4 },
  helperText: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginBottom: 4 },
  roleSelected: { color: '#F9FAFB', fontSize: 15 },
  rolePlaceholder: { color: '#4B5563', fontSize: 15 },
  rolesList: { backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#1F2937', marginBottom: 8, overflow: 'hidden' },
  roleItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  roleItemActive: { backgroundColor: '#1E1B4B' },
  roleItemText: { color: '#9CA3AF', fontSize: 14 },
  roleItemTextActive: { color: '#818CF8', fontWeight: '700' },
  btn: { backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  backLink: { alignItems: 'center', marginTop: 8 },
  backLinkText: { color: '#818CF8', fontSize: 14, fontWeight: '600' },
});
