/**
 * LivePerformanceScreen — real audio engine wired, full waveform pipeline.
 * Replaces the former mock/prototype version.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as audioEngine from '../audioEngine';
import WaveformTimeline from '../components/WaveformTimeline';
import {
  processPeaksForDisplay,
  quantizedJumpTarget,
} from '../services/wavePipelineEngine';
import { evaluateJumpSafety } from '../services/livePerformancePolicy';
import {
  loadSongWavePipeline,
  resolveSongWaveformSourceUrl,
} from '../services/songWavePipeline';
import { CINESTAGE_URL, syncHeaders } from './config';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Section colour map (matches WaveformTimeline) ────────────────────────────
const SECTION_COLORS = {
  intro:       '#6B7280',
  verse:       '#6366F1',
  'pre-chorus':'#8B5CF6',
  prechorus:   '#8B5CF6',
  chorus:      '#EC4899',
  bridge:      '#F59E0B',
  outro:       '#10B981',
  tag:         '#0EA5E9',
  vamp:        '#0EA5E9',
  instrumental:'#F97316',
};
function sectionColor(label) {
  const key = (label || '').toLowerCase().replace(/\s*\d+\s*$/, '').trim();
  return SECTION_COLORS[key] || '#6366F1';
}

// ── Bar countdown helper ─────────────────────────────────────────────────────
function barsToSection(positionSec, targetSec, bpm) {
  const safeBpm = bpm > 0 ? bpm : 120;
  const remaining = Math.max(0, targetSec - positionSec);
  const beatsPerSec = safeBpm / 60;
  const bars = Math.ceil((remaining * beatsPerSec) / 4);
  return bars;
}

// ── Detect which section is active at positionSec ────────────────────────────
function resolveActiveSection(sections, positionSec) {
  if (!sections?.length) return null;
  let active = sections[0];
  for (const s of sections) {
    if (s.timeSec <= positionSec) active = s;
    else break;
  }
  return active;
}

function resolveNextSection(sections, positionSec) {
  if (!sections?.length) return null;
  return sections.find((s) => s.timeSec > positionSec) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LivePerformanceScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { song } = route.params || {};

  // ── Playback state ──────────────────────────────────────────────────────
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [position,    setPosition]    = useState(0);
  const [duration,    setDuration]    = useState(0);

  // ── Waveform / analysis ─────────────────────────────────────────────────
  const [waveformPeaks, setWaveformPeaks] = useState([]);
  const [sections,      setSections]      = useState([]);

  // ── Derived display ─────────────────────────────────────────────────────
  const [currentSection, setCurrentSection] = useState(null);
  const [nextSection,    setNextSection]    = useState(null);
  const [barsToNext,     setBarsToNext]     = useState(null);

  // ── Loading / error ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // ── Jump / safety controls ──────────────────────────────────────────────
  const [jumpMode,    setJumpMode]    = useState('BEAT');  // IMMEDIATE | BEAT | BAR
  const [safetyMode,  setSafetyMode]  = useState('guided'); // guided | strict | tech

  const pollRef = useRef(null);
  const bpm = song?.bpm || 120;

  // ── Load waveform analysis ──────────────────────────────────────────────
  useEffect(() => {
    if (!song?.id) { setLoading(false); return; }

    (async () => {
      try {
        const pipeline = await loadSongWavePipeline(song, {
          audioUrl: resolveSongWaveformSourceUrl(song),
          waveformPoints: 1280,
          displayPoints: 200,
          includeCues: true,
        });

        setWaveformPeaks(processPeaksForDisplay(pipeline?.waveformPeaks || [], 200));
        setSections(
          (pipeline?.sections || []).map((section, index) => ({
            id: section.id || `s${index}`,
            label: section.label || 'Section',
            timeSec: section.timeSec || 0,
            endTimeSec: section.endTimeSec || pipeline?.durationSec || 0,
            color: section.color || sectionColor(section.label),
          })),
        );

        if (pipeline?.durationSec) setDuration(pipeline.durationSec);
      } catch (e) {
        setError('Could not load waveform analysis.');
      }
    })();
  }, [song?.id]);

  // ── Load stems via audioEngine ──────────────────────────────────────────
  useEffect(() => {
    if (!song) return;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        await audioEngine.initEngine();

        // Try CineStage stems first
        const stemsUrl = `${CINESTAGE_URL}/api/songs/${encodeURIComponent(song.id)}/stems`;
        const res = await fetch(stemsUrl, { headers: syncHeaders() }).catch(() => null);
        if (res?.ok) {
          const stemsData = await res.json();
          await audioEngine.loadFromBackend(stemsData);
        }

        const eng = await audioEngine.getDuration().catch(() => 0);
        if (eng > 0) setDuration(eng);
      } catch (e) {
        // Non-fatal — waveform still shows even without stems
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      audioEngine.stop().catch(() => {});
      stopPolling();
    };
  }, [song?.id]);

  // ── Position polling ────────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const pos = await audioEngine.getPosition();
        const dur = await audioEngine.getDuration();
        setPosition(pos);
        if (dur > 0) setDuration(dur);
      } catch { /* engine not ready */ }
    }, 250);
  }, []);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  // ── Derive current/next section + bars countdown ────────────────────────
  useEffect(() => {
    const cur  = resolveActiveSection(sections, position);
    const next = resolveNextSection(sections, position);
    setCurrentSection(cur);
    setNextSection(next);
    if (next) setBarsToNext(barsToSection(position, next.timeSec, bpm));
    else      setBarsToNext(null);
  }, [position, sections, bpm]);

  // ── Transport ───────────────────────────────────────────────────────────
  async function handlePlayPause() {
    try {
      if (isPlaying) {
        await audioEngine.pause();
        stopPolling();
        setIsPlaying(false);
      } else {
        await audioEngine.play();
        startPolling();
        setIsPlaying(true);
      }
    } catch (e) {
      Alert.alert('Playback error', e.message);
    }
  }

  async function handleSeek(pct) {
    const rawSec = pct * (duration || 1);
    const safeBpm = bpm > 0 ? bpm : 120;
    const quantized = quantizedJumpTarget(rawSec, jumpMode, safeBpm);
    const safety = evaluateJumpSafety(
      { safetyPolicy: { mode: safetyMode } },
      position,
      quantized,
    );
    if (!safety.ok) {
      Alert.alert('Jump Blocked', safety.reason);
      return;
    }
    const target = safety.correctedTargetSec ?? quantized;
    await audioEngine.seek(target);
    setPosition(target);
  }

  async function handlePrev() {
    const prev = sections.slice().reverse().find((s) => s.timeSec < position - 1);
    if (prev) { await audioEngine.seek(prev.timeSec); setPosition(prev.timeSec); }
    else       { await audioEngine.seek(0);            setPosition(0); }
  }

  async function handleNext() {
    const next = resolveNextSection(sections, position);
    if (next) { await audioEngine.seek(next.timeSec); setPosition(next.timeSec); }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const playheadPct = duration > 0 ? position / duration : 0;
  const curLabel  = currentSection?.label  || '—';
  const nextLabel = nextSection?.label     || '—';
  const curColor  = currentSection?.color  || '#38BDF8';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => { audioEngine.stop().catch(() => {}); navigation.goBack(); }}>
          <Text style={s.exitBtn}>← EXIT</Text>
        </TouchableOpacity>

        <View style={s.metaRow}>
          <Text style={s.metaText}>{song?.title || 'Live'}</Text>
          <Text style={s.metaDot}>·</Text>
          <Text style={s.metaText}>{bpm} BPM</Text>
          <Text style={s.metaDot}>·</Text>
          <Text style={s.metaText}>{song?.key || '—'}</Text>
        </View>

        {/* Jump mode pills */}
        <View style={s.pillRow}>
          {['IMMEDIATE','BEAT','BAR'].map((m) => (
            <TouchableOpacity
              key={m}
              style={[s.pill, jumpMode === m && s.pillActive]}
              onPress={() => setJumpMode(m)}
            >
              <Text style={[s.pillText, jumpMode === m && s.pillTextActive]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {/* ── Current / Next section cards ──────────────────────────────── */}
        <View style={s.focusRow}>
          <View style={[s.curCard, { borderColor: curColor }]}>
            <Text style={[s.curLabel, { color: curColor }]}>NOW</Text>
            <Text style={s.curTitle} numberOfLines={1}>{curLabel}</Text>
          </View>

          <View style={s.nextCard}>
            <Text style={s.nextLabel}>UP NEXT</Text>
            <Text style={s.nextTitle} numberOfLines={1}>{nextLabel}</Text>
            {barsToNext !== null && (
              <View style={s.countRow}>
                <Text style={s.countNum}>{barsToNext}</Text>
                <Text style={s.countUnit}>bars</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Waveform timeline ─────────────────────────────────────────── */}
        <View style={s.waveCard}>
          {loading && <Text style={s.loadingText}>Loading audio…</Text>}
          {error   && <Text style={s.errorText}>{error}</Text>}
          {!loading && (
            <WaveformTimeline
              waveformPeaks={waveformPeaks}
              sections={sections}
              sectionMarkers={sections}
              lengthSeconds={duration}
              playheadPct={playheadPct}
              bpm={bpm}
              jumpMode={jumpMode}
              onSeek={handleSeek}
              height={110}
            />
          )}

          {/* ── Time display ──────────────────────────────────────────── */}
          <View style={s.timeRow}>
            <Text style={s.timeText}>{fmtSec(position)}</Text>
            <Text style={s.timeSep}>/</Text>
            <Text style={s.timeTextDim}>{fmtSec(duration)}</Text>
          </View>
        </View>

        {/* ── Section jump strip ────────────────────────────────────────── */}
        {sections.length > 0 && (
          <View style={s.sectionStrip}>
            <Text style={s.sectionStripLabel}>JUMP TO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {sections.map((sec) => {
                const isActive = currentSection?.id === sec.id;
                return (
                  <TouchableOpacity
                    key={sec.id}
                    style={[s.secBtn, { borderColor: sec.color }, isActive && { backgroundColor: sec.color + '33' }]}
                    onPress={() => handleSeek(sec.timeSec / (duration || 1))}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.secBtnText, { color: sec.color }]}>{sec.label}</Text>
                    <Text style={s.secBtnTime}>{fmtSec(sec.timeSec)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Safety mode ───────────────────────────────────────────────── */}
        <View style={s.safetyRow}>
          <Text style={s.safetyLabel}>SAFETY</Text>
          {['guided','strict','tech'].map((m) => (
            <TouchableOpacity
              key={m}
              style={[s.pill, safetyMode === m && s.pillActive]}
              onPress={() => setSafetyMode(m)}
            >
              <Text style={[s.pillText, safetyMode === m && s.pillTextActive]}>{m.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 160 }} />
      </ScrollView>

      {/* ── Transport controls (floating) ────────────────────────────────── */}
      <View style={[s.transport, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={s.sideBtn} onPress={handlePrev} activeOpacity={0.75}>
          <Text style={s.sideBtnText}>⏮</Text>
          <Text style={s.sideBtnSub}>PREV</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.playBtn, isPlaying && s.playBtnActive]}
          onPress={handlePlayPause}
          activeOpacity={0.8}
        >
          <Text style={s.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.sideBtn} onPress={handleNext} activeOpacity={0.75}>
          <Text style={s.sideBtnText}>⏭</Text>
          <Text style={s.sideBtnSub}>NEXT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function fmtSec(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#020617' },
  header:        { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  exitBtn:       { color: '#475569', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText:      { color: '#E2E8F0', fontSize: 14, fontWeight: '700' },
  metaDot:       { color: '#475569', fontSize: 14 },
  pillRow:       { flexDirection: 'row', gap: 6 },
  pill:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  pillActive:    { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  pillText:      { color: '#64748B', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  pillTextActive:{ color: '#fff' },

  scroll:        { paddingHorizontal: 16 },

  focusRow:      { flexDirection: 'row', gap: 12, marginBottom: 16 },
  curCard:       { flex: 1.6, backgroundColor: '#0F172A', borderRadius: 18, padding: 18, borderWidth: 2 },
  curLabel:      { fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 4 },
  curTitle:      { color: '#F8FAFC', fontSize: 36, fontWeight: '900', lineHeight: 40 },
  nextCard:      { flex: 1, backgroundColor: '#0B1120', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center', justifyContent: 'center' },
  nextLabel:     { color: '#475569', fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  nextTitle:     { color: '#94A3B8', fontSize: 16, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  countRow:      { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  countNum:      { color: '#F8FAFC', fontSize: 42, fontWeight: '900' },
  countUnit:     { color: '#475569', fontSize: 12, fontWeight: '700' },

  waveCard:      { backgroundColor: '#0B1120', borderRadius: 18, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#1E293B' },
  loadingText:   { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  errorText:     { color: '#EF4444', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  timeRow:       { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginTop: 8, gap: 4 },
  timeText:      { color: '#E2E8F0', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timeSep:       { color: '#475569', fontSize: 14 },
  timeTextDim:   { color: '#475569', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },

  sectionStrip:  { backgroundColor: '#0B1120', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#1E293B' },
  sectionStripLabel: { color: '#334155', fontSize: 9, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  secBtn:        { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginRight: 8, minWidth: 72, alignItems: 'center' },
  secBtnText:    { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  secBtnTime:    { color: '#475569', fontSize: 10, marginTop: 2 },

  safetyRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  safetyLabel:   { color: '#334155', fontSize: 9, fontWeight: '900', letterSpacing: 2 },

  transport:     { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#020617', borderTopWidth: 1, borderTopColor: '#1E293B', paddingHorizontal: 32, paddingTop: 16 },
  playBtn:       { width: 84, height: 84, borderRadius: 42, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12 },
  playBtnActive: { backgroundColor: '#4F46E5' },
  playIcon:      { fontSize: 34, color: '#fff', marginLeft: 3 },
  sideBtn:       { alignItems: 'center', gap: 4, width: 64 },
  sideBtnText:   { color: '#94A3B8', fontSize: 28 },
  sideBtnSub:    { color: '#334155', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
});
