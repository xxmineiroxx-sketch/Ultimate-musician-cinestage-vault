import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { register } from '../services/authAPI';
import { parseRoleAssignments } from '../models_v2/models';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

const ROLES = ['Keys', 'Drums', 'Bass', 'Electric Guitar', 'Acoustic Guitar',
  'Lead Vocals', 'BG Vocals', 'Music Director', 'Sound Tech', 'Other'];

function splitInviteName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

export default function RegistrationScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const inviteParams = route?.params || {};
  const inviteNameParts = useMemo(
    () => splitInviteName(inviteParams.name),
    [inviteParams.name],
  );
  const prefillEmail = inviteParams.email || '';
  const prefillPhone = inviteParams.phone || '';
  const prefillOrgName = inviteParams.orgName || '';
  const inviteContactHint = [prefillEmail, prefillPhone].filter(Boolean).join(' or ');
  const inviteToken = inviteParams.token || '';
  const isInviteFlow = Boolean(
    inviteToken
      || prefillEmail
      || prefillPhone
      || prefillOrgName
      || inviteParams.name,
  );

  const [form, setForm] = useState({
    firstName: inviteNameParts.firstName,
    lastName: inviteNameParts.lastName,
    email: prefillEmail,
    password: '',
    confirmPassword: '',
    phone: prefillPhone,
    role: '',
  });
  const [loading, setLoading] = useState(false);
  const [showRoles, setShowRoles] = useState(false);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  useEffect(() => {
    setForm((current) => ({
      ...current,
      firstName: inviteNameParts.firstName || current.firstName,
      lastName: inviteNameParts.lastName || current.lastName,
      email: prefillEmail || current.email,
      phone: prefillPhone || current.phone,
    }));
  }, [inviteNameParts.firstName, inviteNameParts.lastName, prefillEmail, prefillPhone]);

  const pushRoleToCloud = (firstName, lastName, email, phone, role) => {
    if (!role && !email) return;
    const name = `${firstName} ${lastName}`.trim();
    const roles = role ? [role] : [];
    fetch(`${SYNC_URL}/sync/people`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify({
        person: {
          email: email.trim(),
          phone: phone.trim(),
          name,
          roles,
          roleAssignments: roles.join(', '),
          roleSyncSource: 'playback_profile',
          roleSyncUpdatedAt: new Date().toISOString(),
          playbackRegistered: true,
          inviteToken,
        },
      }),
    }).catch(() => {});
  };

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
      pushRoleToCloud(firstName.trim(), lastName.trim(), email.trim(), phone.trim(), role);
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
          <Text style={styles.subtitle}>
            {prefillOrgName
              ? `Join ${prefillOrgName} on Ultimate Playback`
              : 'Join your worship team on Ultimate Playback'}
          </Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {isInviteFlow && (
            <View style={styles.inviteCard}>
              <Text style={styles.inviteEyebrow}>Team Invitation</Text>
              <Text style={styles.inviteTitle}>
                {prefillOrgName ? `You were invited to join ${prefillOrgName}` : 'Your invitation is ready'}
              </Text>
              <Text style={styles.inviteBody}>
                Create your account with the invited contact info below. After the 6-digit email confirmation,
                your member profile will appear in Ultimate Playback and Ultimate Musician automatically.
              </Text>
              {inviteContactHint ? (
                <Text style={styles.inviteSecondaryBody}>
                  Register with {inviteContactHint} so this invitation links to the right team member record.
                </Text>
              ) : null}
              <View style={styles.inviteMetaRow}>
                {prefillEmail ? (
                  <View style={styles.inviteMetaChip}>
                    <Text style={styles.inviteMetaChipText}>{prefillEmail}</Text>
                  </View>
                ) : null}
                {prefillPhone ? (
                  <View style={styles.inviteMetaChip}>
                    <Text style={styles.inviteMetaChipText}>{prefillPhone}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}

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
          {isInviteFlow ? (
            <Text style={styles.helperText}>
              Use the invited contact info so your account links back to this team in both apps.
            </Text>
          ) : null}

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

        <TouchableOpacity
          style={styles.backLink}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
              return;
            }
            navigation.replace('Login');
          }}
        >
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
  inviteCard: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#312E81', padding: 16, marginBottom: 10 },
  inviteEyebrow: { color: '#A5B4FC', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  inviteTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '800', lineHeight: 24 },
  inviteBody: { color: '#CBD5E1', fontSize: 13, lineHeight: 20, marginTop: 8 },
  inviteSecondaryBody: { color: '#A5B4FC', fontSize: 12, lineHeight: 18, marginTop: 10 },
  inviteMetaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  inviteMetaChip: { backgroundColor: '#1E1B4B', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, marginBottom: 8 },
  inviteMetaChipText: { color: '#C7D2FE', fontSize: 12, fontWeight: '700' },
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
