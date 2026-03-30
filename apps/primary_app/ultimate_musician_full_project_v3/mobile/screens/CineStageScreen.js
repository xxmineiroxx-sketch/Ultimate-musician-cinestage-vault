/**
 * CineStageScreen — two-tab pipeline hub
 *
 * Tab 0  ANALYZE   → POST /cinestage/analyze
 *                    Shows: BPM, Key, section timeline, cues, chords, perf graph
 *
 * Tab 1  STEMS     → POST /jobs (stem separation via Demucs + Cloudflare KV)
 *                    Original functionality preserved
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { useTheme } from "../context/ThemeContext";
import {
  analyzeAudio,
  createJob,
  pollJob,
  CINESTAGE_API_BASE_URL,
} from "../services/cinestage";
import { getEntitlements, PlanTiers } from "../services/planEntitlements";
import { loadSession } from "../services/sessionStore";
import { addOrUpdateSong, getSongs } from "../data/storage";
import { makeId } from "../data/models";
import { JobTypes } from "../shared/contracts/cinestage.types";

// ── Section color map ──────────────────────────────────────────────────────
const SECTION_COLORS = {
  Intro:  '#6B7280',
  Verse:  '#6366F1',
  Chorus: '#EC4899',
  Bridge: '#F59E0B',
  Outro:  '#10B981',
  Tag:    '#0EA5E9',
};
const sectionColor = (label) => SECTION_COLORS[label] || '#4F46E5';

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtMs(ms) {
  const t = Math.floor(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function AnalysisResult({ result, colors }) {
  if (!result) return null;
  const sections = result.sections || [];
  const cues     = result.cues    || [];
  const graph    = result.performance_graph || [];
  const chords   = (result.chords || []).slice(0, 12); // first 12 chords

  return (
    <View>
      {/* Key + BPM + Duration */}
      <View style={badgeRow.row}>
        <View style={[badgeRow.badge, { backgroundColor: '#1E1B4B' }]}>
          <Text style={[badgeRow.badgeLabel, { color: '#818CF8' }]}>KEY</Text>
          <Text style={[badgeRow.badgeValue, { color: '#C7D2FE' }]}>{result.key || '—'}</Text>
        </View>
        <View style={[badgeRow.badge, { backgroundColor: '#1C1917' }]}>
          <Text style={[badgeRow.badgeLabel, { color: '#FB923C' }]}>BPM</Text>
          <Text style={[badgeRow.badgeValue, { color: '#FED7AA' }]}>{result.bpm || '—'}</Text>
        </View>
        {!!result.duration_ms && (
          <View style={[badgeRow.badge, { backgroundColor: '#052E16' }]}>
            <Text style={[badgeRow.badgeLabel, { color: '#34D399' }]}>DUR</Text>
            <Text style={[badgeRow.badgeValue, { color: '#6EE7B7' }]}>{fmtMs(result.duration_ms)}</Text>
          </View>
        )}
      </View>

      {/* Section timeline */}
      {sections.length > 0 && (
        <View style={rStyles.block}>
          <Text style={rStyles.blockTitle}>SECTIONS</Text>
          <View style={rStyles.sectionBar}>
            {sections.map((s, i) => {
              const dur  = (result.duration_ms || 1);
              const flex = Math.max(0.03, (s.end_ms - s.start_ms) / dur);
              const c    = sectionColor(s.section);
              return (
                <View
                  key={i}
                  style={[rStyles.sectionSegment, { flex, backgroundColor: c + '30', borderColor: c }]}
                >
                  <Text style={[rStyles.sectionSegLabel, { color: c }]} numberOfLines={1}>
                    {s.section}
                  </Text>
                </View>
              );
            })}
          </View>
          {sections.map((s, i) => (
            <View key={i} style={rStyles.sectionRow}>
              <View style={[rStyles.sectionDot, { backgroundColor: sectionColor(s.section) }]} />
              <Text style={rStyles.sectionLabel}>{s.section}</Text>
              <Text style={rStyles.sectionTime}>{fmtMs(s.start_ms)} → {fmtMs(s.end_ms)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Cues */}
      {cues.length > 0 && (
        <View style={rStyles.block}>
          <Text style={rStyles.blockTitle}>VOICE CUES</Text>
          {cues.map((c, i) => (
            <Text key={i} style={rStyles.cueText}>{c}</Text>
          ))}
        </View>
      )}

      {/* First 12 chords */}
      {chords.length > 0 && (
        <View style={rStyles.block}>
          <Text style={rStyles.blockTitle}>CHORD PROGRESSION</Text>
          <View style={rStyles.chordRow}>
            {chords.map((c, i) => (
              <View key={i} style={rStyles.chordPill}>
                <Text style={rStyles.chordText}>{c.chord}</Text>
                <Text style={rStyles.chordTime}>{fmtMs(c.time_ms)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Performance graph */}
      {graph.length > 0 && (
        <View style={rStyles.block}>
          <Text style={rStyles.blockTitle}>PERFORMANCE GRAPH</Text>
          {graph.map((node, i) => (
            <View key={i} style={rStyles.graphRow}>
              <View style={[rStyles.graphDot, { backgroundColor: sectionColor(node.section) }]} />
              <Text style={rStyles.graphSection}>{node.section}</Text>
              <Text style={rStyles.graphMeta}>{node.bars} bars · {node.bpm} BPM</Text>
              {node.next?.length > 0 && (
                <Text style={rStyles.graphNext}>→ {node.next.join(', ')}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function CineStageScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  const isIPad = screenWidth >= 768;

  const [planTier, setPlanTier]   = useState(PlanTiers.PRO);
  const [activeTab, setActiveTab] = useState(0); // 0=Analyze, 1=Stems

  // ── Analyze tab ──
  const [audioUrl, setAudioUrl]       = useState('');
  const [songTitle, setSongTitle]     = useState('');
  const [analyzing, setAnalyzing]     = useState(false);
  const [analysisResult, setResult]   = useState(null);
  const [savedSongId, setSavedSongId] = useState(null);

  // ── Stems tab ──
  const [projectId, setProjectId] = useState('demo-project');
  const [jobType, setJobType]     = useState('ANALYZE');
  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading]     = useState(false);
  const [jobResult, setJobResult] = useState(null);
  const [jobId, setJobId]         = useState(null);

  const entitlements = getEntitlements(planTier);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      if (session?.planTier) setPlanTier(session.planTier);
    })();
  }, []);

  // ── Run audio analysis ──
  async function runAnalysis() {
    if (!entitlements.cineStage) {
      Alert.alert('Upgrade required', 'CineStage is available on Pro and Enterprise.');
      return;
    }
    if (!audioUrl.trim()) {
      Alert.alert('Missing URL', 'Paste a YouTube or audio URL first.');
      return;
    }
    setAnalyzing(true);
    setResult(null);
    setSavedSongId(null);
    try {
      const res = await analyzeAudio({
        file_url:   audioUrl.trim(),
        title:      songTitle.trim() || 'Untitled',
        n_sections: 6,
      });
      setResult(res);

      // Auto-save analysis to song library
      const allSongs = await getSongs();
      const existing = allSongs.find(
        (s) => s.title?.toLowerCase() === (songTitle.trim() || '').toLowerCase()
      );
      const saved = await addOrUpdateSong({
        id:       existing?.id || makeId('song'),
        ...(existing || {}),
        title:    res.title    || songTitle.trim() || 'Untitled',
        bpm:      res.bpm      || existing?.bpm,
        originalKey: res.key  || existing?.originalKey,
        analysis: {
          sections:          res.sections,
          chords:            res.chords,
          cues:              res.cues,
          beats_ms:          res.beats_ms,
          performance_graph: res.performance_graph,
          duration_ms:       res.duration_ms,
          analyzedAt:        new Date().toISOString(),
        },
      });
      setSavedSongId(saved.id);
    } catch (e) {
      Alert.alert('Analysis error', String(e?.message || e));
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Run stems job ──
  async function runJob() {
    if (!entitlements.cineStage) {
      Alert.alert('Upgrade required', 'CineStage is available on Pro and Enterprise.');
      return;
    }
    setLoading(true);
    setJobResult(null);
    try {
      const job = await createJob({
        projectId,
        jobType,
        input: { source: 'mobile', mode: 'demo', sourceUrl: sourceUrl || undefined },
        options: {},
      });
      setJobId(job.id);
      const finalJob = await pollJob(job.id);
      setJobResult(finalJob);
    } catch (e) {
      Alert.alert('CineStage error', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──
  // iPad: split-panel (input left, results right)
  const InputPanel = (
    <View>
      {/* Upgrade gate */}
      {!entitlements.cineStage && (
        <View style={styles.card}>
          <Text style={styles.label}>Upgrade Required</Text>
          <Text style={styles.bodyText}>
            CineStage is available on Pro and Enterprise plans.
          </Text>
        </View>
      )}

      {/* Tab bar — only on phone */}
      {!isIPad && (
        <View style={styles.tabRow}>
          {['🎛  Analyze', '🎚  Stems'].map((t, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.tabBtn, activeTab === i && styles.tabBtnActive]}
              onPress={() => setActiveTab(i)}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Analyze inputs (always visible on iPad, tab-guarded on phone) ── */}
      {(isIPad || activeTab === 0) && (
        <View style={styles.card}>
          <Text style={styles.label}>Song Title (optional)</Text>
          <TextInput
            value={songTitle}
            onChangeText={setSongTitle}
            style={styles.input}
            placeholder="e.g. Way Maker"
            placeholderTextColor={colors.subtle}
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Audio URL</Text>
          <TextInput
            value={audioUrl}
            onChangeText={setAudioUrl}
            style={styles.input}
            placeholder="YouTube URL or https:// audio link"
            placeholderTextColor={colors.subtle}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.caption}>
            CineStage detects BPM, key, section structure, chords, voice cues, and performance graph.
          </Text>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#4F46E5' }]}
            onPress={runAnalysis}
            disabled={analyzing}
            activeOpacity={0.85}
          >
            {analyzing
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.btnText}>🎛  Analyze Song</Text>
            }
          </TouchableOpacity>

          {!!savedSongId && (
            <View style={styles.savedBanner}>
              <Text style={styles.savedBannerText}>✓ Analysis saved to library</Text>
              <TouchableOpacity
                onPress={() => navigation?.navigate('SongDetail', { songId: savedSongId })}
              >
                <Text style={styles.savedBannerLink}>View →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* On iPad, results live in right panel — on phone, show inline */}
          {!isIPad && <AnalysisResult result={analysisResult} colors={colors} />}
        </View>
      )}

      {/* ── Tab 1: Stems job (phone only — iPad shows both) ── */}
      {(isIPad || activeTab === 1) && (
        <View style={[styles.card, isIPad && { marginTop: 0 }]}>
          <Text style={styles.label}>API Base</Text>
          <Text style={styles.mono}>{CINESTAGE_API_BASE_URL}</Text>

          <Text style={[styles.label, { marginTop: 12 }]}>Project ID</Text>
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
                <Text style={[styles.pillText, jobType === type && styles.pillTextActive]}>
                  {type}
                </Text>
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
            keyboardType="url"
          />

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#6366F1' }]}
            onPress={runJob}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.btnText}>Run Stems Job</Text>
            }
          </TouchableOpacity>

          {jobId && <Text style={styles.meta}>Job ID: {jobId}</Text>}

          {jobResult && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Result</Text>
              <Text style={styles.resultText}>{JSON.stringify(jobResult, null, 2)}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  const ResultPanel = isIPad ? (
    <ScrollView style={{ flex: 1, paddingLeft: 12 }} showsVerticalScrollIndicator={false}>
      <Text style={[styles.label, { marginBottom: 8 }]}>Analysis Results</Text>
      {analysisResult
        ? <AnalysisResult result={analysisResult} colors={colors} />
        : <Text style={styles.caption}>Run an analysis to see results here.</Text>
      }
    </ScrollView>
  ) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={styles.title}>CineStage™</Text>
        <Text style={styles.subtitle}>Audio analysis · Stems · Cues · Performance graph</Text>
        {/* iPad tab bar */}
        {isIPad && (
          <View style={[styles.tabRow, { marginTop: 8, marginBottom: 0 }]}>
            {['🎛  Analyze', '🎚  Stems'].map((t, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.tabBtn, activeTab === i && styles.tabBtnActive]}
                onPress={() => setActiveTab(i)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Split panel on iPad, scroll on phone */}
      {isIPad ? (
        <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 20 }}>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            {InputPanel}
          </ScrollView>
          {ResultPanel}
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {InputPanel}
        </ScrollView>
      )}
    </View>
  );
}

// ── Shared badge row styles ────────────────────────────────────────────────
const badgeRow = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 8, marginBottom: 14 },
  badge:      { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  badgeLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
  badgeValue: { fontSize: 20, fontWeight: '900' },
});

// ── Analysis result styles ─────────────────────────────────────────────────
const rStyles = StyleSheet.create({
  block:       { marginTop: 14 },
  blockTitle:  { color: '#475569', fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  sectionBar:  { flexDirection: 'row', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 8, gap: 1 },
  sectionSegment: { justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 3, minWidth: 4 },
  sectionSegLabel: { fontSize: 8, fontWeight: '800' },
  sectionRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  sectionDot:  { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  sectionLabel:{ color: '#CBD5E1', fontSize: 12, fontWeight: '700', flex: 1 },
  sectionTime: { color: '#475569', fontSize: 11 },
  cueText:     { color: '#94A3B8', fontSize: 12, lineHeight: 20, marginBottom: 3 },
  chordRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chordPill:   { backgroundColor: '#1E293B', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9, alignItems: 'center' },
  chordText:   { color: '#E2E8F0', fontSize: 13, fontWeight: '800' },
  chordTime:   { color: '#475569', fontSize: 9, marginTop: 1 },
  graphRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 7, flexWrap: 'wrap', gap: 6 },
  graphDot:    { width: 8, height: 8, borderRadius: 4 },
  graphSection:{ color: '#CBD5E1', fontSize: 12, fontWeight: '700', minWidth: 60 },
  graphMeta:   { color: '#475569', fontSize: 11, flex: 1 },
  graphNext:   { color: '#6366F1', fontSize: 11 },
});

// ── Screen styles ──────────────────────────────────────────────────────────
const makeStyles = (colors) =>
  StyleSheet.create({
    root:    { flex: 1 },
    content: { padding: 16, paddingBottom: 48 },
    title:   { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
    subtitle:{ color: colors.subtle, fontSize: 12, marginTop: 4, marginBottom: 16 },
    tabRow:  { flexDirection: 'row', gap: 8, marginBottom: 16 },
    tabBtn:  { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
               borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt },
    tabBtnActive: { backgroundColor: '#312E81', borderColor: '#6366F1' },
    tabText:      { color: colors.subtle, fontSize: 12, fontWeight: '700' },
    tabTextActive:{ color: '#C7D2FE', fontSize: 12, fontWeight: '900' },
    card:  { padding: 16, backgroundColor: colors.card, borderRadius: 16,
             borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
    label: { color: colors.text, fontWeight: '800', fontSize: 11, marginBottom: 7,
             letterSpacing: 0.5, textTransform: 'uppercase' },
    caption:{ color: colors.subtle, fontSize: 11, lineHeight: 17, marginTop: 4 },
    bodyText:{ color: colors.text, fontSize: 13 },
    mono:  { color: colors.subtle, fontSize: 11, fontFamily: 'Courier' },
    input: { backgroundColor: colors.cardAlt, borderRadius: 10, borderWidth: 1,
             borderColor: colors.borderAlt, color: colors.text,
             paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
    pillRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    pill:     { borderWidth: 1, borderColor: colors.borderAlt, paddingHorizontal: 10,
                paddingVertical: 6, borderRadius: 999, backgroundColor: colors.cardAlt },
    pillActive:    { backgroundColor: colors.pillActive, borderColor: colors.pillActive },
    pillText:      { color: colors.text, fontSize: 11, fontWeight: '700' },
    pillTextActive:{ color: '#FFFFFF' },
    btn:     { marginTop: 14, paddingVertical: 13, borderRadius: 999, alignItems: 'center' },
    btnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
    meta:    { color: colors.subtle, fontSize: 11, marginTop: 8 },
    resultText: { color: colors.text, fontSize: 10, fontFamily: 'Courier', lineHeight: 16 },
    savedBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                   backgroundColor: '#052E16', borderRadius: 8, borderWidth: 1,
                   borderColor: '#10B981', paddingHorizontal: 12, paddingVertical: 8,
                   marginTop: 10 },
    savedBannerText: { color: '#6EE7B7', fontSize: 12, fontWeight: '600' },
    savedBannerLink: { color: '#34D399', fontSize: 12, fontWeight: '800' },
  });
