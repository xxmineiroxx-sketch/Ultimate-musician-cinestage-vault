import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile } from '../services/storage';
import { submitManualFeedback } from '../services/feedback';

export default function FeedbackScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [subject, setSubject] = useState(route?.params?.subject || '');
  const [message, setMessage] = useState(route?.params?.message || '');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getUserProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  const handleSubmit = async () => {
    if (!message.trim()) {
      Alert.alert('Missing details', 'Describe what happened so the team can investigate it.');
      return;
    }

    setSending(true);
    try {
      await submitManualFeedback({
        subject: subject.trim() || 'Playback problem report',
        message: message.trim(),
        metadata: {
          source: route?.params?.source || 'manual_screen',
        },
        reporter: {
          name: profile?.name || '',
          lastName: profile?.lastName || '',
          email: profile?.email || '',
          phone: profile?.phone || '',
          roleAssignments:
            profile?.roleAssignments ||
            (Array.isArray(profile?.roles) ? profile.roles.join(', ') : ''),
        },
      });
      Alert.alert('Report sent', 'Your report was delivered to the team.', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      const fallbackMessage = error?.queued
        ? 'The report was saved on this device and will retry automatically next time the app opens.'
        : error?.message || 'Failed to send the report.';
      Alert.alert('Saved for retry', fallbackMessage, [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top + 16, 32) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.badge}>CineStage™</Text>
          <Text style={styles.title}>Report a Problem</Text>
          <Text style={styles.subtitle}>
            Send a bug report or describe what went wrong. If delivery fails, the app
            will retry automatically later.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Subject</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="Short summary"
            placeholderTextColor="#4B5563"
          />

          <Text style={styles.label}>What happened?</Text>
          <TextInput
            style={styles.textArea}
            value={message}
            onChangeText={setMessage}
            placeholder="What were you doing when the issue happened? What did you expect to see?"
            placeholderTextColor="#4B5563"
            multiline
            textAlignVertical="top"
          />

          <View style={styles.reporterCard}>
            <Text style={styles.reporterTitle}>Reporter</Text>
            <Text style={styles.reporterText}>
              {profile?.name || 'Unknown'} {profile?.lastName || ''}
            </Text>
            {!!profile?.email && (
              <Text style={styles.reporterMeta}>{profile.email}</Text>
            )}
            {!!profile?.phone && (
              <Text style={styles.reporterMeta}>{profile.phone}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, sending && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#F9FAFB" />
            ) : (
              <Text style={styles.primaryButtonText}>Send Report</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#020617',
  },
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    flexGrow: 1,
  },
  header: {
    marginBottom: 28,
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
    marginBottom: 10,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#0B1120',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 20,
  },
  label: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#F9FAFB',
    fontSize: 15,
    marginBottom: 18,
  },
  textArea: {
    minHeight: 170,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#F9FAFB',
    fontSize: 15,
    marginBottom: 18,
  },
  reporterCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
    marginBottom: 18,
  },
  reporterTitle: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  reporterText: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  reporterMeta: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontSize: 15,
    fontWeight: '700',
  },
});
