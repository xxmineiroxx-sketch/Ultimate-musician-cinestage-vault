import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  requestPasswordReset,
  resetPasswordWithCode,
} from '../services/authAPI';

export default function ResetPasswordScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState(
    route?.params?.identifier || route?.params?.email || '',
  );
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const nextIdentifier = route?.params?.identifier || route?.params?.email || '';
    if (nextIdentifier) {
      setIdentifier(nextIdentifier);
    }
  }, [route?.params?.email, route?.params?.identifier]);

  const handleSendCode = async () => {
    const normalizedIdentifier = String(identifier || '').trim();

    if (!normalizedIdentifier) {
      Alert.alert('Missing info', 'Enter your email or phone number first.');
      return;
    }

    setSendingCode(true);
    try {
      await requestPasswordReset(normalizedIdentifier);
      setCodeSent(true);
      Alert.alert(
        'Check Your Email',
        'If an account exists for that email or phone number, we sent a 6-digit reset code to the email on file.',
      );
    } catch (error) {
      Alert.alert('Could Not Send Code', error.message);
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async () => {
    const normalizedIdentifier = String(identifier || '').trim();
    const normalizedCode = String(code || '').trim();

    if (!normalizedIdentifier || !normalizedCode || !newPassword || !confirmPassword) {
      Alert.alert('Missing info', 'Fill in your code and both password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Too short', 'New password must be at least 6 characters.');
      return;
    }

    setSaving(true);
    try {
      await resetPasswordWithCode(normalizedIdentifier, normalizedCode, newPassword);
      Alert.alert('Password Updated', 'Your password has been reset.', [
        {
          text: 'Back to Sign In',
          onPress: () =>
            navigation.replace('Login', {
              identifier: normalizedIdentifier,
            }),
        },
      ]);
    } catch (error) {
      Alert.alert('Reset Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: Math.max(insets.top + 16, 64) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.badge}>CineStage™</Text>
          <Text style={styles.title}>Forgot Password</Text>
          <Text style={styles.subtitle}>
            Enter the email or phone number tied to your account. We'll email a
            6-digit reset code to the account email on file.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Email or Phone</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="you@example.com or (555) 123-4567"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!sendingCode && !saving}
          />

          <Text style={styles.helperText}>
            Use the email or phone number you registered with. The reset code is
            always sent to your saved account email.
          </Text>

          <TouchableOpacity
            style={[styles.secondaryPrimaryBtn, (sendingCode || saving) && styles.disabledBtn]}
            onPress={handleSendCode}
            disabled={sendingCode || saving}
          >
            {sendingCode ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.secondaryPrimaryBtnText}>
                {codeSent ? 'Resend Reset Code' : 'Send Reset Code'}
              </Text>
            )}
          </TouchableOpacity>

          {codeSent ? (
            <>
              <Text style={styles.codeHint}>
                Code sent? Enter the 6-digit code from your email, then set a new
                password below.
              </Text>

              <Text style={styles.label}>Reset Code</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor="#4B5563"
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
              />

              <Text style={styles.label}>New Password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                placeholderTextColor="#4B5563"
                secureTextEntry
                editable={!saving}
              />

              <Text style={styles.label}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat new password"
                placeholderTextColor="#4B5563"
                secureTextEntry
                editable={!saving}
              />
            </>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.disabledBtn]}
            onPress={handleSubmit}
            disabled={saving || !codeSent}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>Reset Password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.goBack()}
            disabled={saving}
          >
            <Text style={styles.secondaryBtnText}>Back</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.helpText}>
          If you no longer have access to the email attached to your account, ask
          your admin or manager to update your team profile first.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 24,
    paddingBottom: 48,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  badge: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#0B1120',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 20,
    marginBottom: 16,
  },
  label: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#020617',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F9FAFB',
    fontSize: 15,
    marginBottom: 16,
  },
  helperText: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 18,
    marginTop: -8,
    marginBottom: 12,
  },
  codeHint: {
    color: '#A5B4FC',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryPrimaryBtn: {
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryPrimaryBtnText: {
    color: '#C7D2FE',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryBtnText: {
    color: '#818CF8',
    fontSize: 14,
    fontWeight: '600',
  },
  helpText: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
