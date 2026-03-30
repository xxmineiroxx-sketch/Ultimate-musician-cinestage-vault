import React from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  createCrashFeedbackDraft,
  deliverFeedbackDraft,
  queueFeedbackDraft,
} from '../services/feedback';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      componentStack: '',
      reportDraft: null,
      sending: false,
      sent: false,
    };
  }

  componentDidCatch(error, info) {
    const reportDraft = createCrashFeedbackDraft(error, {
      componentStack: info?.componentStack || '',
      routeName: this.props.getCurrentRouteName?.() || '',
      source: 'error_boundary',
      isFatal: false,
    });

    queueFeedbackDraft(reportDraft).catch(() => {});

    this.setState({
      error,
      componentStack: info?.componentStack || '',
      reportDraft,
      sent: false,
    });
  }

  handleSendReport = async () => {
    const { reportDraft, sending, sent } = this.state;
    if (!reportDraft || sending || sent) return;

    this.setState({ sending: true });
    try {
      await deliverFeedbackDraft(reportDraft);
      this.setState({ sent: true });
      Alert.alert('Report sent', 'The crash report was sent to the team.');
    } catch (error) {
      Alert.alert(
        'Saved for retry',
        'The crash report could not be sent right now. It was saved and will retry next time the app opens.',
      );
    } finally {
      this.setState({ sending: false });
    }
  };

  handleTryAgain = () => {
    this.setState({
      error: null,
      componentStack: '',
      reportDraft: null,
      sending: false,
      sent: false,
    });
  };

  render() {
    const { error, sending, sent } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.badge}>CineStage™</Text>
          <Text style={styles.title}>Playback hit an error</Text>
          <Text style={styles.subtitle}>
            Send the crash report so the team can fix it. If the app does not recover,
            close it and reopen it after sending the report.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Latest Error</Text>
            <Text style={styles.errorName}>{error.name || 'Error'}</Text>
            <Text style={styles.errorMessage}>{error.message || 'Unknown error'}</Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, sent && styles.primaryButtonDisabled]}
            onPress={this.handleSendReport}
            disabled={sending || sent}
          >
            {sending ? (
              <ActivityIndicator color="#F9FAFB" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {sent ? 'Crash Report Sent' : 'Send Crash Report'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={this.handleTryAgain}>
            <Text style={styles.secondaryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  badge: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  title: {
    color: '#F9FAFB',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#0B1120',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 18,
    marginBottom: 24,
  },
  cardTitle: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  errorName: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  errorMessage: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 22,
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
