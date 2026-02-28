import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { createJob, pollJob, CINESTAGE_API_BASE_URL } from '../services/cinestage';
import { JobTypes } from '../shared/contracts/cinestage.types';
import { loadSession } from '../services/sessionStore';
import { getEntitlements, PlanTiers } from '../services/planEntitlements';
import { useTheme } from '../context/ThemeContext';

export default function CineStageScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [planTier, setPlanTier] = useState(PlanTiers.PRO);
  const [projectId, setProjectId] = useState('demo-project');
  const [jobType, setJobType] = useState('ANALYZE');
  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState(null);
  const entitlements = getEntitlements(planTier);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      if (session?.planTier) setPlanTier(session.planTier);
    })();
  }, []);

  const runJob = async () => {
    if (!entitlements.cineStage) {
      Alert.alert('Upgrade required', 'CineStage is available on Pro and Enterprise.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const job = await createJob({
        projectId,
        jobType,
        input: { source: 'mobile', mode: 'demo', sourceUrl: sourceUrl || undefined },
        options: {},
      });
      setJobId(job.id);
      const finalJob = await pollJob(job.id);
      setResult(finalJob);
    } catch (error) {
      Alert.alert('CineStage error', String(error.message || error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={styles.title}>CineStage</Text>
      <Text style={styles.subtitle}>Brain services for analysis, stems, roles, and scenes.</Text>
      {!entitlements.cineStage && (
        <View style={styles.card}>
          <Text style={styles.label}>Upgrade Required</Text>
          <Text style={styles.resultText}>CineStage is available on Pro and Enterprise.</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>API Base</Text>
        <Text style={styles.mono}>{CINESTAGE_API_BASE_URL}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Project ID</Text>
        <TextInput
          value={projectId}
          onChangeText={setProjectId}
          style={styles.input}
          placeholder="project-id"
          placeholderTextColor={colors.subtle}
          autoCapitalize="none"
        />

        <Text style={[styles.label, { marginTop: 12 }]}>Job Type</Text>
        <View style={styles.pillRow}>
          {JobTypes.map((type) => (
            <TouchableOpacity
              key={type}
              onPress={() => setJobType(type)}
              style={[styles.pill, jobType === type && styles.pillActive]}
            >
              <Text style={[styles.pillText, jobType === type && styles.pillTextActive]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.label, { marginTop: 12 }]}>Source URL (optional)</Text>
        <TextInput
          value={sourceUrl}
          onChangeText={setSourceUrl}
          style={styles.input}
          placeholder="https://... or file:///..."
          placeholderTextColor={colors.subtle}
          autoCapitalize="none"
        />

        <TouchableOpacity style={styles.btn} onPress={runJob} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>Run CineStage Job</Text>}
        </TouchableOpacity>
        {jobId ? <Text style={styles.meta}>Job ID: {jobId}</Text> : null}
      </View>

      {result ? (
        <View style={styles.card}>
          <Text style={styles.label}>Result</Text>
          <Text style={styles.resultText}>{JSON.stringify(result, null, 2)}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  subtitle: { color: colors.subtle, fontSize: 12, marginTop: 6, marginBottom: 16 },
  card: { marginBottom: 12, padding: 14, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.text, fontWeight: '800', fontSize: 12, marginBottom: 8 },
  mono: { color: colors.subtle, fontSize: 11, fontFamily: 'Courier' },
  input: { backgroundColor: colors.cardAlt, borderRadius: 10, borderWidth: 1, borderColor: colors.borderAlt, color: colors.text, paddingHorizontal: 10, paddingVertical: 8 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderColor: colors.borderAlt, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.cardAlt },
  pillActive: { backgroundColor: colors.pillActive, borderColor: colors.pillActive },
  pillText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  pillTextActive: { color: '#FFFFFF' },
  btn: { marginTop: 16, backgroundColor: colors.pillActive, paddingVertical: 12, borderRadius: 999, alignItems: 'center' },
  btnText: { color: '#FFFFFF', fontWeight: '900' },
  meta: { color: colors.subtle, fontSize: 11, marginTop: 8 },
  resultText: { color: colors.text, fontSize: 11, fontFamily: 'Courier' },
});
