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
import * as AppleAuthentication from 'expo-apple-authentication';
import { login, loginWithApple, isLoggedIn } from '../services/authAPI';

export default function LoginScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState(
    route?.params?.identifier || route?.params?.email || '',
  );
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [isAppleLoginAvailable, setIsAppleLoginAvailable] = useState(false);

  useEffect(() => {
    isLoggedIn().then(loggedIn => {
      if (loggedIn) navigation.replace('Main', { screen: 'HomeTab' });
      else setReady(true);
    }).catch(() => setReady(true));
    AppleAuthentication.isAvailableAsync().then(setIsAppleLoginAvailable);
  }, []);

  useEffect(() => {
    const nextIdentifier = route?.params?.identifier || route?.params?.email || '';
    if (nextIdentifier) {
      setIdentifier(nextIdentifier);
    }
  }, [route?.params?.email, route?.params?.identifier]);

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      
      const result = await loginWithApple(credential.identityToken, {
        email: credential.email,
        fullName: credential.fullName ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim() : undefined,
      });

      if (result?.needsVerification) {
        navigation.navigate('Verify', {
          identifier: result.email || 'apple_user',
          email: result.email || '',
          purpose: result.verificationPurpose || 'login',
        });
        return;
      }
      navigation.replace('Main', { screen: 'HomeTab' });
    } catch (e) {
      if (e.code === 'ERR_REQUEST_CANCELED') {
        // User canceled
      } else {
        Alert.alert('Sign In Failed', String(e.message || e));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert('Missing info', 'Email or phone, plus password, are required.');
      return;
    }
    setLoading(true);
    try {
      const result = await login(identifier.trim(), password);
      if (result?.needsVerification) {
        navigation.navigate('Verify', {
          identifier: result.email || identifier.trim(),
          email: result.email || '',
          purpose: result.verificationPurpose || 'login',
        });
        return;
      }
      navigation.replace('Main', { screen: 'HomeTab' });
    } catch (err) {
      if (err?.needsVerification) {
        navigation.navigate('Verify', {
          identifier: err.email || identifier.trim(),
          email: err.email || '',
          purpose: err.verificationPurpose || 'login',
        });
        return;
      }
      Alert.alert('Sign In Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#818CF8" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: Math.max(insets.top + 16, 80) }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <View style={styles.brandBlock}>
          <Text style={styles.badge}>CineStage™</Text>
          <Text style={styles.title}>Ultimate Playback</Text>
          <Text style={styles.subtitle}>
            Your setlist. Your stems. Perform with confidence.
          </Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>

          <Text style={styles.label}>Email or Phone</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="you@example.com or (555) 123-4567"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.helperText}>
            Use your email, or the phone number saved on your team profile.
          </Text>

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#4B5563"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.signInBtn, loading && { opacity: 0.6 }]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.signInBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resetLink}
            onPress={() =>
              navigation.navigate('ResetPassword', {
                identifier: identifier.trim(),
              })
            }
            disabled={loading}
          >
            <Text style={styles.resetLinkText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.registerLinkText}>Create an account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.supportLink}
            onPress={() =>
              navigation.navigate('Feedback', {
                subject: 'Playback sign-in issue',
                source: 'login_screen',
              })
            }
            disabled={loading}
          >
            <Text style={styles.supportLinkText}>Report a problem</Text>
          </TouchableOpacity>
        </View>

        {isAppleLoginAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleBtn}
            onPress={handleAppleSignIn}
          />
        )}

        <Text style={styles.footerNote}>
          Forgot your password? Use your email or phone to get a reset code by email.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#020617',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
    justifyContent: 'center',
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 40,
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
    fontSize: 32,
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
  cardTitle: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 20,
  },
  label: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  helperText: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 18,
    marginTop: -8,
    marginBottom: 12,
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
    marginBottom: 12,
  },
  signInBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  signInBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  registerLink: {
    marginTop: 10,
    alignItems: 'center',
  },
  registerLinkText: {
    color: '#818CF8',
    fontSize: 14,
    fontWeight: '600',
  },
  supportLink: {
    marginTop: 10,
    alignItems: 'center',
  },
  supportLinkText: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: '700',
  },
  resetLink: {
    marginTop: 14,
    alignItems: 'center',
  },
  resetLinkText: {
    color: '#A5B4FC',
    fontSize: 14,
    fontWeight: '600',
  },
  appleBtn: {
    width: '100%',
    height: 50,
    marginBottom: 16,
  },
  footerNote: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
  },
});
