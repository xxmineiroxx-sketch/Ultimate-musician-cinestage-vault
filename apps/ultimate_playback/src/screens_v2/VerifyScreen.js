import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { verifyCode, resendCode } from '../services/authAPI';

export default function VerifyScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const email = route?.params?.email || '';
  const identifier = route?.params?.identifier || email;
  const purpose = route?.params?.purpose || 'signup';
  const isLoginChallenge = purpose === 'login';
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputs = useRef([]);

  const handleChange = (val, idx) => {
    const cleaned = val.replace(/[^0-9]/g, '').slice(-1);
    const next = [...code];
    next[idx] = cleaned;
    setCode(next);
    if (cleaned && idx < 5) inputs.current[idx + 1]?.focus();
    if (!cleaned && idx > 0) inputs.current[idx - 1]?.focus();
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length < 6) return Alert.alert('Enter code', 'Please enter all 6 digits.');
    setLoading(true);
    try {
      await verifyCode(identifier, fullCode, { email, purpose });
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'HomeTab' } }] });
    } catch (err) {
      Alert.alert('Invalid Code', err.message);
      setCode(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await resendCode(identifier, { purpose });
      Alert.alert(
        'Code Sent',
        isLoginChallenge
          ? `A new sign-in code was sent to ${email || 'the email on file'}.`
          : `A new verification code was sent to ${email || 'your email'}.`,
      );
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top + 24, 80) }]}>
        {/* Brand */}
        <View style={styles.brandBlock}>
          <Text style={styles.badge}>CineStage™</Text>
          <Text style={styles.title}>
            {isLoginChallenge ? 'Check your email' : 'Verify your account'}
          </Text>
          <Text style={styles.subtitle}>
            {isLoginChallenge
              ? 'We sent a 6-digit sign-in code to'
              : 'We sent a 6-digit verification code to'}
            {'\n'}
            <Text style={styles.emailHighlight}>{email || 'the email on file'}</Text>
          </Text>
        </View>

        {/* Code inputs */}
        <View style={styles.codeRow}>
          {code.map((digit, idx) => (
            <TextInput
              key={idx}
              ref={r => (inputs.current[idx] = r)}
              style={[styles.codeBox, digit ? styles.codeBoxFilled : null]}
              value={digit}
              onChangeText={v => handleChange(v, idx)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.6 }]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>
              {isLoginChallenge ? 'Complete Sign In' : 'Verify Account'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.resendRow} onPress={handleResend} disabled={resending}>
          <Text style={styles.resendText}>
            {resending ? 'Sending...' : "Didn't receive it? Resend code"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>
            {isLoginChallenge ? '← Back to sign in' : '← Change email'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', paddingHorizontal: 24, paddingBottom: 48 },
  brandBlock: { alignItems: 'center', marginBottom: 48 },
  badge: { color: '#818CF8', fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  title: { color: '#F9FAFB', fontSize: 28, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#6B7280', fontSize: 14, textAlign: 'center', marginTop: 12, lineHeight: 22 },
  emailHighlight: { color: '#818CF8', fontWeight: '700' },
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 32 },
  codeBox: {
    width: 48, height: 60, borderRadius: 12, borderWidth: 1.5,
    borderColor: '#1F2937', backgroundColor: '#0B1120',
    textAlign: 'center', fontSize: 24, fontWeight: '800', color: '#F9FAFB',
  },
  codeBoxFilled: { borderColor: '#818CF8', backgroundColor: '#1E1B4B' },
  btn: { backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  resendRow: { alignItems: 'center', marginBottom: 24 },
  resendText: { color: '#818CF8', fontSize: 14, fontWeight: '600' },
  backLink: { alignItems: 'center' },
  backLinkText: { color: '#4B5563', fontSize: 14 },
});
