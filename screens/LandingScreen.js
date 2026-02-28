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
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LandingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { login, continueAsGuest, userId, ready } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // If already authenticated, skip straight to Home
  useEffect(() => {
    if (ready && userId) {
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  }, [ready, userId]);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (err) {
      Alert.alert('Sign In Failed', String(err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    try {
      await continueAsGuest();
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
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
          <Text style={styles.title}>Ultimate Musician</Text>
          <Text style={styles.subtitle}>
            Plan. Rehearse. Perform. All in one place.
          </Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

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
            style={styles.registerLink}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.registerLinkText}>Create an account</Text>
          </TouchableOpacity>
        </View>

        {/* Guest */}
        <TouchableOpacity
          style={[styles.guestBtn, loading && { opacity: 0.6 }]}
          onPress={handleGuest}
          disabled={loading}
        >
          <Text style={styles.guestBtnText}>Continue as Guest</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Guest mode saves locally on this device only.
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
    marginTop: 14,
    alignItems: 'center',
  },
  registerLinkText: {
    color: '#818CF8',
    fontSize: 14,
    fontWeight: '600',
  },
  guestBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  guestBtnText: {
    color: '#9CA3AF',
    fontWeight: '700',
    fontSize: 15,
  },
  footerNote: {
    color: '#374151',
    fontSize: 12,
    textAlign: 'center',
  },
});
