/**
 * LiveScreen — The Definitive Live Performance Pipeline
 *
 * Features:
 *  • Large color-coded section chips with 1×queue / 2×loop / 3×worship-free
 *  • Color-coded waveform with beat grid + section boundaries
 *  • Transport bar: ⏮ prev-sec · ⏹ · ▶/⏸ · ⏭ next-sec · 🔁 loop · 🙏 free · 🚨 clear
 *  • Meta bar: TAP BPM · Time Sig · Key + ± Transpose · + Add Marker
 *  • Quick cue buttons: REPEAT · SKIP · EXTEND
 *  • Horizontal stem channel strips
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as audioEngine from '../audioEngine';
import { CINESTAGE_URL, SYNC_ORG_ID, SYNC_SECRET_KEY, SYNC_URL, broadcastToRoom, syncHeaders } from './config';
import WaveformTimeline from '../components/WaveformTimeline';
import { addOrUpdateSong } from '../data/storage';
import { OUTPUT_COLORS } from '../data/models';
import { processPeaksForDisplay } from '../services/wavePipelineEngine';
import { parseSectionsForWaveform } from '../utils/parseSectionsForWaveform';
import { normalizeBackendStemEntries } from '../utils/stemPayload';

const EMPTY_OBJECT = Object.freeze({});
const EMPTY_LIST = Object.freeze([]);

// ── Audio routing helpers ────────────────────────────────────────────────────
function routingOutputColor(val) {
  return OUTPUT_COLORS?.[val] || '#6B7280';
}

function RoutingPicker({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const color = routingOutputColor(value);
  return (
    <>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}
        onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={{ color: '#94A3B8', fontSize: 12 }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
          borderWidth: 1, borderColor: color + '66', backgroundColor: color + '15' }}>
          <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{value}</Text>
          <Text style={{ color, fontSize: 10 }}>▾</Text>
        </View>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setOpen(false)}>
          <View style={{ backgroundColor: '#0F172A', borderRadius: 14, padding: 16, width: 260,
            borderWidth: 1, borderColor: '#1E293B' }}>
            <Text style={{ color: '#F8FAFC', fontWeight: '800', fontSize: 14, marginBottom: 10 }}>{label}</Text>
            {options.map(opt => {
              const c = routingOutputColor(opt);
              const active = value === opt;
              return (
                <TouchableOpacity key={opt}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10,
                    paddingHorizontal: 8, borderRadius: 8,
                    backgroundColor: active ? c + '20' : 'transparent' }}
                  onPress={() => { onChange(opt); setOpen(false); }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4,
                    backgroundColor: active ? c : '#374151' }} />
                  <Text style={{ color: active ? c : '#94A3B8', fontSize: 13,
                    fontWeight: active ? '800' : '400', flex: 1 }}>{opt}</Text>
                  {active && <Text style={{ color: c, fontSize: 13 }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Constants ───────────────────────────────────────────────────────────────────
const SECTION_COLORS = {
  intro: '#6B7280', verse: '#6366F1', 'pre-chorus': '#8B5CF6',
  chorus: '#EC4899', bridge: '#F59E0B', outro: '#10B981',
  tag: '#0EA5E9', vamp: '#F97316', channel: '#0EA5E9',
  repeat: '#EC4899', alt: '#F472B6', hook: '#EC4899',
};

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const TRACK_COLORS = {
  vocals: '#EC4899',
  vocal: '#EC4899',
  drums: '#10B981',
  bass: '#38BDF8',
  keys: '#818CF8',
  piano: '#60A5FA',
  synth: '#A78BFA',
  guitars: '#F97316',
  guitar: '#F97316',
  acoustic: '#F59E0B',
  electric: '#FB7185',
  click: '#94A3B8',
  guide: '#FBBF24',
  pad: '#C084FC',
  pads: '#C084FC',
  other: '#64748B',
};

const NOTE_ALIASES = {
  Cb: 'B',
  Db: 'C#',
  Eb: 'D#',
  Fb: 'E',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
  'E#': 'F',
  'B#': 'C',
};

// ── Engine State ────────────────────────────────────────────────────────────────
const ENGINE_STATE = {
  PLAYING:     'PLAYING',
  PAUSED:      'PAUSED',
  LOOPING:     'LOOPING',
  WORSHIP_FREE:'WORSHIP_FREE',
};

// ── Helpers ─────────────────────────────────────────────────────────────────────
function fmtSec(s) {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function rootFromKey(key) {
  const match = String(key || '').match(/^([A-G][b#]?)(.*)$/);
  if (!match) return { root: null, suffix: '' };
  return {
    root: NOTE_ALIASES[match[1]] || match[1],
    suffix: match[2] || '',
  };
}

function normLabel(label) {
  return (label || '').toLowerCase().replace(/[\s]*\d+\s*$/, '').trim();
}

function transposeKey(key, steps) {
  if (!key || steps === 0) return key;
  const { root, suffix } = rootFromKey(key);
  const idx = NOTE_NAMES.indexOf(root);
  if (idx < 0) return key;
  const newIdx = ((idx + steps) % 12 + 12) % 12;
  return NOTE_NAMES[newIdx] + suffix;
}

function stepsBetweenKeys(fromKey, toKey) {
  const from = NOTE_NAMES.indexOf(rootFromKey(fromKey).root);
  const to = NOTE_NAMES.indexOf(rootFromKey(toKey).root);
  if (from < 0 || to < 0) return 0;
  let diff = to - from;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  return diff;
}

function chipColor(label) {
  const n = normLabel(label);
  return SECTION_COLORS[n] || '#6366F1';
}

function formatRoleLabel(role) {
  return String(role || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim() || 'Live Operator';
}

function formatTrackLabel(track = {}) {
  return String(track.label || track.type || track.id || 'Track')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function getTrackColor(track = {}) {
  const key = String(track.type || track.id || track.label || '').toLowerCase();
  const match = Object.keys(TRACK_COLORS).find((name) => key.includes(name));
  return match ? TRACK_COLORS[match] : '#6366F1';
}

function formatDb(volume = 1, muted = false) {
  if (muted || volume <= 0) return '-∞ dB';
  const db = Math.round(20 * Math.log10(Math.max(0.001, Math.min(volume, 1))));
  return `${db > 0 ? '+' : ''}${db} dB`;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cue';
}

function formatSectionTitle(label, fallback = 'Section') {
  const normalized = String(label || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return fallback;
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function defaultCueName(index) {
  return [
    'Intro',
    'Verse 1',
    'Verse 2',
    'Pre-Chorus',
    'Chorus',
    'Bridge',
    'Vamp',
    'Outro',
    'Ending',
  ][index] || `Cue ${index + 1}`;
}

function inferStemBpm(localStems = {}) {
  const entries = Object.entries(localStems || {});
  for (const [slotName, info] of entries) {
    const text = `${slotName || ''} ${info?.label || ''} ${info?.name || ''}`.toLowerCase();
    if (!/click|metronome|guide|guia|cue|count[\s_-]?in/.test(text)) continue;
    const bpmMatch = text.match(/\b(\d{2,3})\b/);
    if (!bpmMatch) continue;
    const bpm = Number(bpmMatch[1]);
    if (Number.isFinite(bpm) && bpm >= 40 && bpm <= 260) return bpm;
  }
  return 0;
}

function resolveLiveBpm({ persistedBpm = 0, routeBpm = 0, songBpm = 0, backendBpm = 0, stemBpm = 0 }) {
  const normalizedPersisted = Number(persistedBpm || 0);
  const candidates = [routeBpm, songBpm, backendBpm]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  const baseline = candidates[0] || 0;
  const normalizedStem = Number(stemBpm || 0);

  if (normalizedPersisted > 0) {
    if (
      normalizedStem > 0
      && Math.abs(normalizedStem - normalizedPersisted) >= 2
      && candidates.some((value) => Math.abs(value - normalizedPersisted) < 1)
    ) {
      return normalizedStem;
    }
    return normalizedPersisted;
  }

  if (normalizedStem > 0 && (!baseline || Math.abs(normalizedStem - baseline) >= 2)) {
    return normalizedStem;
  }

  return baseline || normalizedStem || 0;
}

function sectionLabelCandidate(section) {
  if (typeof section === 'string' || typeof section === 'number') {
    return String(section);
  }
  return [
    section?.label,
    section?.name,
    section?.section,
    section?.type,
    section?.kind,
    section?.title,
  ].find((value) => String(value || '').trim()) || '';
}

function hasExplicitSectionTime(section) {
  if (typeof section === 'string' || typeof section === 'number') return false;
  return [
    section?.timeSec,
    section?.positionSeconds,
    section?.startSeconds,
    section?.startSec,
    section?.start,
    section?.time,
    section?.start_ms != null ? section.start_ms / 1000 : null,
    section?.positionMs != null ? section.positionMs / 1000 : null,
  ].some((value) => Number.isFinite(Number(value)));
}

function isGenericSectionLabel(label) {
  const normalized = normLabel(label);
  return !normalized || normalized === 'section' || normalized === 'part' || normalized === 'marker';
}

function getSectionTimeSec(section) {
  const candidates = [
    section?.timeSec,
    section?.positionSeconds,
    section?.startSeconds,
    section?.startSec,
    section?.start,
    section?.time,
    section?.start_ms != null ? section.start_ms / 1000 : null,
    section?.positionMs != null ? section.positionMs / 1000 : null,
  ];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function resolveSectionTimeSec(section, chartSection, index, totalCount, effectiveDuration) {
  if (hasExplicitSectionTime(section)) {
    return getSectionTimeSec(section);
  }

  if (chartSection && hasExplicitSectionTime(chartSection)) {
    return getSectionTimeSec(chartSection);
  }

  if (effectiveDuration > 0 && totalCount > 0) {
    return (effectiveDuration * index) / Math.max(totalCount, 1);
  }

  return getSectionTimeSec(section);
}

function numberDuplicateSectionLabels(entries = []) {
  const totals = {};
  entries.forEach((entry, index) => {
    const base = normLabel(entry.label || defaultCueName(index)) || 'section';
    totals[base] = (totals[base] || 0) + 1;
  });

  const seen = {};
  return entries.map((entry, index) => {
    let label = formatSectionTitle(entry.label, defaultCueName(index));
    const base = normLabel(label) || 'section';
    seen[base] = (seen[base] || 0) + 1;
    if (totals[base] > 1 && !/\d+$/.test(label)) {
      label = `${label} ${seen[base]}`;
    }
    return { ...entry, label };
  });
}

function countMeaningfulSectionLabels(sectionList = []) {
  return (Array.isArray(sectionList) ? sectionList : []).reduce((count, section) => {
    const label = sectionLabelCandidate(section);
    return count + (isGenericSectionLabel(label) ? 0 : 1);
  }, 0);
}

function countExplicitSectionTimes(sectionList = []) {
  return (Array.isArray(sectionList) ? sectionList : []).reduce((count, section) => (
    count + (hasExplicitSectionTime(section) ? 1 : 0)
  ), 0);
}

function shouldPreferChartSections(rawSections = [], chartSections = []) {
  if (!Array.isArray(chartSections) || chartSections.length === 0) return false;
  if (!Array.isArray(rawSections) || rawSections.length === 0) return true;

  const rawMeaningful = countMeaningfulSectionLabels(rawSections);
  const chartMeaningful = countMeaningfulSectionLabels(chartSections);
  const rawExplicitTimes = countExplicitSectionTimes(rawSections);

  if (rawSections.length < 2 && chartSections.length >= 2) return true;
  if (rawMeaningful === 0 && chartMeaningful > 0) return true;
  if (rawMeaningful < chartMeaningful && rawExplicitTimes === 0) return true;

  return false;
}

function buildLiveSectionJumpList({ rawSections = [], chartSections = [], effectiveDuration = 0, overrides = {} }) {
  let baseSections = [];
  const preferChartSections = shouldPreferChartSections(rawSections, chartSections);

  if (Array.isArray(rawSections) && rawSections.length > 0 && !preferChartSections) {
    baseSections = rawSections.map((section, index) => {
      const chartFallback = chartSections[index]?.label || defaultCueName(index);
      const rawLabel = sectionLabelCandidate(section);
      const label = isGenericSectionLabel(rawLabel) ? chartFallback : rawLabel;
      const chartSection = chartSections[index] || null;
      return {
        markerId: String(section?.markerId || section?.id || `sec_${index}_${slugify(label || chartFallback)}`),
        label,
        timeSec: resolveSectionTimeSec(
          section,
          chartSection,
          index,
          rawSections.length,
          effectiveDuration,
        ),
        color:
          section?.color
          || chartSection?.color
          || SECTION_COLORS[normLabel(label)] || '#6366F1',
      };
    });
  } else if (Array.isArray(chartSections) && chartSections.length > 0) {
    baseSections = chartSections.map((section, index) => ({
      markerId: String(section?.markerId || section?.id || `sec_${index}_${slugify(section?.label || defaultCueName(index))}`),
      label: section?.label || defaultCueName(index),
      timeSec: resolveSectionTimeSec(
        section,
        null,
        index,
        chartSections.length,
        effectiveDuration,
      ),
      color: section?.color || SECTION_COLORS[normLabel(section?.label)] || '#6366F1',
    }));
  } else if (effectiveDuration > 0) {
    baseSections = [
      { label: 'Intro', timeSec: 0, color: SECTION_COLORS.intro },
      { label: 'Verse 1', timeSec: effectiveDuration * 0.10, color: SECTION_COLORS.verse },
      { label: 'Chorus', timeSec: effectiveDuration * 0.30, color: SECTION_COLORS.chorus },
      { label: 'Verse 2', timeSec: effectiveDuration * 0.52, color: SECTION_COLORS.verse },
      { label: 'Bridge', timeSec: effectiveDuration * 0.72, color: SECTION_COLORS.bridge },
      { label: 'Outro', timeSec: effectiveDuration * 0.88, color: SECTION_COLORS.outro },
    ].map((section, index) => ({
      ...section,
      markerId: `sec_${index}_${slugify(section.label)}`,
    }));
  }

  const sorted = baseSections
    .filter((section) => Number.isFinite(section.timeSec))
    .sort((left, right) => left.timeSec - right.timeSec);

  const labeled = numberDuplicateSectionLabels(sorted)
    .map((section, index) => {
      const timeSec = overrides[section.markerId] ?? section.timeSec;
      return {
        ...section,
        markerId: section.markerId || `sec_${index}_${slugify(section.label)}`,
        timeSec,
        positionSeconds: timeSec,
        color: section.color || SECTION_COLORS[normLabel(section.label)] || '#6366F1',
      };
    })
    .sort((left, right) => left.timeSec - right.timeSec);

  return labeled.map((section, index) => ({
    ...section,
    positionSeconds: section.timeSec,
    endTimeSec: labeled[index + 1]?.timeSec ?? effectiveDuration,
  }));
}

function normalizeCueMarkers(markerList = [], effectiveDuration = 0) {
  const durationCap = Number.isFinite(effectiveDuration) && effectiveDuration > 0
    ? effectiveDuration
    : Number.MAX_SAFE_INTEGER;

  return (Array.isArray(markerList) ? markerList : [])
    .map((marker, index) => {
      const rawTime = Number(marker?.timeSec ?? marker?.start ?? marker?.positionSeconds ?? marker?.time ?? 0);
      const timeSec = Math.max(0, Math.min(durationCap, Number.isFinite(rawTime) ? rawTime : 0));
      return {
        ...marker,
        id: marker?.id || `m_${index}_${slugify(marker?.label || `marker-${index + 1}`)}`,
        sourceIndex: index,
        label: String(marker?.label || `Marker ${fmtSec(timeSec)}`).trim(),
        timeSec,
        positionSeconds: timeSec,
        start: timeSec,
        end: timeSec,
        color: marker?.color || '#F59E0B',
        type: marker?.type || 'cue',
        resizable: false,
      };
    })
    .sort((left, right) => left.timeSec - right.timeSec);
}

function cueIdentity(cue = {}, index = 0) {
  return String(
    cue?.markerId
    || cue?.id
    || cue?.label
    || `cue_${index}`
  );
}

function serializeLiveSections(sectionList = [], effectiveDuration = 0) {
  const durationCap = Number.isFinite(effectiveDuration) && effectiveDuration > 0
    ? effectiveDuration
    : Number.MAX_SAFE_INTEGER;

  const normalized = (Array.isArray(sectionList) ? sectionList : [])
    .map((section, index) => {
      const timeSec = Math.max(
        0,
        Math.min(durationCap, getSectionTimeSec(section)),
      );
      const markerId = String(
        section?.markerId
        || section?.id
        || `sec_${index}_${slugify(section?.label || defaultCueName(index))}`,
      );
      const label = formatSectionTitle(section?.label, defaultCueName(index));
      return {
        ...section,
        id: markerId,
        markerId,
        label,
        timeSec,
        positionSeconds: timeSec,
        startSeconds: timeSec,
        color: section?.color || chipColor(label),
      };
    })
    .sort((left, right) => left.timeSec - right.timeSec);

  return normalized.map((section, index) => ({
    ...section,
    endTimeSec: normalized[index + 1]?.timeSec ?? Math.max(effectiveDuration || 0, section.timeSec),
    endSeconds: normalized[index + 1]?.timeSec ?? Math.max(effectiveDuration || 0, section.timeSec),
  }));
}

function serializeLiveMarkers(markerList = [], effectiveDuration = 0) {
  return normalizeCueMarkers(markerList, effectiveDuration).map((marker) => ({
    id: String(marker?.id),
    label: String(marker?.label || `Marker ${fmtSec(marker?.timeSec || 0)}`).trim(),
    timeSec: marker.timeSec,
    positionSeconds: marker.timeSec,
    start: marker.timeSec,
    end: marker.timeSec,
    color: marker?.color || '#F59E0B',
    type: marker?.type || 'cue',
    resizable: false,
  }));
}

function buildFallbackTrackPreview(stemsResult) {
  const stems = normalizeBackendStemEntries(stemsResult);
  return stems.map((track) => ({
    id: track.id,
    type: track.type,
    label: formatTrackLabel(track),
    volume: 1,
    mute: false,
  }));
}

const SUPPORTED_OUTPUT_OPTIONS = ['Main L/R', 'Main L', 'Main R', 'Mute'];

function cueSideText(track = {}) {
  return `${track?.type || ''} ${track?.label || ''} ${track?.id || ''}`.toLowerCase();
}

function isCueLeftTrack(track = {}) {
  const key = cueSideText(track);
  return /click|metronome|guide|guia|voice[\s_-]?guide|cue|count[\s_-]?in|voz ensaio|ensaio/.test(key);
}

function defaultTrackRouting(track = {}) {
  if (track?.mute) return 'Mute';

  if (typeof track?.pan === 'number') {
    if (track.pan <= -0.5) return 'Main L';
    if (track.pan >= 0.5) return 'Main R';
    return 'Main L/R';
  }

  return isCueLeftTrack(track) ? 'Main L' : 'Main R';
}

function routingValueToPan(value, fallbackPan = 0) {
  switch (value) {
    case 'Main L':
      return -1;
    case 'Main R':
      return 1;
    case 'Main L/R':
      return 0;
    case 'Mute':
      return fallbackPan;
    default:
      return fallbackPan;
  }
}

function normalizeLiveTrack(track = {}, index = 0) {
  const id = String(track?.id || track?.type || `track_${index}`);
  const type = String(track?.type || id);
  const label = String(track?.label || type || `Track ${index + 1}`);
  const routing = defaultTrackRouting(track);
  const pan = typeof track?.pan === 'number'
    ? Math.max(-1, Math.min(1, track.pan))
    : routingValueToPan(routing, isCueLeftTrack({ id, type, label }) ? -1 : 1);

  return {
    ...track,
    id,
    type,
    label,
    url: track?.url || track?.uri || null,
    uri: track?.uri || track?.url || null,
    volume: Number.isFinite(Number(track?.volume))
      ? Math.max(0, Math.min(1, Number(track.volume)))
      : 1,
    mute: Boolean(track?.mute),
    solo: Boolean(track?.solo),
    pan,
    fx: track?.fx || {},
  };
}

function findSectionByAliases(list, aliases = [], useLast = false) {
  const matches = list.filter((section) => {
    const label = normLabel(section?.label || '');
    return aliases.some((alias) => label.includes(alias));
  });
  if (matches.length === 0) return null;
  return useLast ? matches[matches.length - 1] : matches[0];
}

function cloneTrack(track = {}) {
  return {
    ...track,
    fx: track.fx ? { ...track.fx } : track.fx,
  };
}

function isPadTrack(track = {}) {
  const raw = `${track.label || ''} ${track.id || ''} ${track.type || ''}`.toLowerCase();
  return /pad|pads|ambient|drone/.test(raw);
}

function TrackSignalMeter({ active, color, volume = 1 }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    const id = setInterval(() => {
      const target = Math.max(0.12, Math.min(1, volume)) * (0.45 + Math.random() * 0.55);
      setLevel(target);
    }, 130);
    return () => clearInterval(id);
  }, [active, volume]);

  return (
    <View style={s.stripMeterColumn}>
      {Array.from({ length: 12 }).map((_, index) => {
        const litThreshold = (index + 1) / 12;
        const lit = level >= litThreshold;
        const ledColor = index >= 10 ? '#F97316' : color;
        return (
          <View
            key={index}
            style={[
              s.stripMeterLed,
              { opacity: lit ? 1 : 0.16, backgroundColor: lit ? ledColor : '#1E293B' },
            ]}
          />
        );
      })}
    </View>
  );
}

// ── LiveActionsPanel ─────────────────────────────────────────────────────────
const LAP_COLORS = {
  intro: '#6B7280', verse: '#6366F1', 'pre-chorus': '#8B5CF6',
  chorus: '#EC4899', bridge: '#F59E0B', outro: '#10B981',
  tag: '#0EA5E9', vamp: '#F97316',
};

function lapSecColor(label) {
  const n = String(label || '').toLowerCase().replace(/[\s]*\d+\s*$/, '').trim();
  return LAP_COLORS[n] || '#6366F1';
}

function lapFmt(sec) {
  const t = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function LiveActionsPanel({ sectionList, activeSectionLabel }) {
  if (!Array.isArray(sectionList) || sectionList.length === 0) return null;
  const activeIdx = sectionList.findIndex(s => s.label === activeSectionLabel);
  const current = sectionList[Math.max(0, activeIdx)];
  const upcoming = sectionList.slice(Math.max(0, activeIdx) + 1, Math.max(0, activeIdx) + 4);
  if (!current) return null;

  return (
    <View style={lapSt.panel}>
      <Text style={lapSt.title}>UP NEXT</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={lapSt.row}>
        {(() => {
          const c = lapSecColor(current.label);
          return (
            <View style={[lapSt.card, lapSt.cardNow, { borderColor: c + '80' }]}>
              <View style={[lapSt.dot, { backgroundColor: c }]} />
              <Text style={[lapSt.name, { color: c }]} numberOfLines={1}>{current.label}</Text>
              <Text style={lapSt.time}>{lapFmt(current.timeSec)}</Text>
              <View style={[lapSt.badge, { backgroundColor: c + '22' }]}>
                <Text style={[lapSt.badgeTxt, { color: c }]}>NOW</Text>
              </View>
            </View>
          );
        })()}
        {upcoming.map((sec, i) => {
          const c = lapSecColor(sec.label);
          return (
            <View key={`${sec.label}${i}`} style={[lapSt.card, { borderColor: '#1E293B' }]}>
              <View style={[lapSt.dot, { backgroundColor: c + '70' }]} />
              <Text style={[lapSt.name, { color: '#64748B' }]} numberOfLines={1}>{sec.label}</Text>
              <Text style={lapSt.time}>{lapFmt(sec.timeSec)}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const lapSt = StyleSheet.create({
  panel: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  title: { color: '#1E3A5F', fontSize: 7, fontWeight: '800', letterSpacing: 1.5, marginBottom: 5 },
  row: { flexDirection: 'row', gap: 8 },
  card: {
    backgroundColor: '#060D1E', borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 7, minWidth: 88, alignItems: 'center', gap: 3,
  },
  cardNow: { borderWidth: 1.5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  name: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  time: { fontSize: 9, color: '#334155', fontWeight: '600' },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  badgeTxt: { fontSize: 7, fontWeight: '800', letterSpacing: 1 },
});

// ── Component ───────────────────────────────────────────────────────────────────
export default function LiveScreen({ route, navigation }) {
  const insets  = useSafeAreaInsets();
  const routeParams = route?.params || EMPTY_OBJECT;
  const song = routeParams.song || EMPTY_OBJECT;
  const userRole = routeParams.userRole ?? null;
  const initialMixerState = Array.isArray(routeParams.mixerState)
    ? routeParams.mixerState
    : EMPTY_LIST;
  const paramSections = Array.isArray(routeParams.sections)
    ? routeParams.sections
    : EMPTY_LIST;
  const paramCues = Array.isArray(routeParams.cues)
    ? routeParams.cues
    : EMPTY_LIST;
  const paramPeaks = routeParams.waveformPeaks ?? null;
  const paramBpm = Number.isFinite(routeParams.bpm) ? routeParams.bpm : 0;
  const paramMarkers = Array.isArray(routeParams.markers)
    ? routeParams.markers
    : EMPTY_LIST;
  const nextSong = routeParams.nextSong ?? null;
  const persistedLivePipeline = song?.livePipeline || null;
  const resolvedInitialMarkers = useMemo(() => (
    paramMarkers.length > 0
      ? paramMarkers
      : Array.isArray(persistedLivePipeline?.markers) && persistedLivePipeline.markers.length > 0
        ? persistedLivePipeline.markers
        : Array.isArray(song?.markers) ? song.markers : EMPTY_LIST
  ), [paramMarkers, persistedLivePipeline?.markers, song?.markers]);
  const originalSongKey = song?.originalKey || song?.key || song?.transposedKey || '';
  const initialLiveKey = song?.transposedKey || originalSongKey || '';
  const inferredStemBpm = inferStemBpm(song?.localStems);
  const initialBpm = resolveLiveBpm({
    persistedBpm: persistedLivePipeline?.bpm,
    routeBpm: paramBpm,
    songBpm: song?.bpm,
    backendBpm: song?.latestStemsJob?.result?.bpm || song?.latestStemsJob?.bpm,
    stemBpm: inferredStemBpm,
  });

  // ── Playback state ─────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying]             = useState(false);
  const [position, setPosition]               = useState(0);
  const [duration, setDuration]               = useState(0);
  const [tapBpmList, setTapBpmList]           = useState([]);
  const [tappedBpm, setTappedBpm]             = useState(0);
  const [manualBpm, setManualBpm]             = useState(initialBpm);
  const [bpmInput, setBpmInput]               = useState(initialBpm > 0 ? String(initialBpm) : '');
  const [loopActive, setLoopActive]           = useState(false);
  const [activeSectionLabel, setActiveSectionLabel] = useState(null);
  const pollRef = useRef(null);
  const markersRef = useRef(resolvedInitialMarkers);

  // ── Channel routing + transpose ───────────────────────────────────────────
  const [trackPan, setTrackPan] = useState({});     // { [trackId]: -1 | 0 | 1 }
  const [isTransposing, setIsTransposing] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedOriginalKey, setDetectedOriginalKey] = useState(null);

  // ── Live Performance Sync ──────────────────────────────────────────────────
  const perfWsRef      = useRef(null);
  const hasSentStartRef = useRef(false);
  const [followerCount, setFollowerCount] = useState(0);
  const sessionId = routeParams.serviceId || `live_${song?.id || 'session'}`;

  // ── Engine state machine ───────────────────────────────────────────────────
  const [engineState, setEngineState] = useState(ENGINE_STATE.PLAYING);
  const [queueLabel, setQueueLabel]   = useState(null);
  const queuedSectionRef = useRef(null);
  const loopSectionRef   = useRef(null);
  const sectionTapRef    = useRef({ section: null, count: 0, timer: null });
  const fadeIntervalRef  = useRef(null);
  const savedMixerStateRef = useRef([]);
  const suppressCuePressRef = useRef(null);
  const isWorshipFree = engineState === ENGINE_STATE.WORSHIP_FREE;
  const isLooping     = engineState === ENGINE_STATE.LOOPING;

  // ── Meta controls ──────────────────────────────────────────────────────────
  const [transposeSteps, setTransposeSteps] = useState(
    stepsBetweenKeys(originalSongKey, initialLiveKey),
  );
  const [markers, setMarkers]               = useState(resolvedInitialMarkers);
  const [liveTracks, setLiveTracks]         = useState(
    Array.isArray(initialMixerState) ? initialMixerState : [],
  );

  // ── Toolbar state ──────────────────────────────────────────────────────────
  const LIVE_TIME_SIGS = ['4/4', '3/4', '6/8', '2/4', '12/8', '5/4', '7/8'];
  const [localTimeSig, setLocalTimeSig]     = useState(song?.timeSig || '4/4');
  const [keyPickerOpen, setKeyPickerOpen]   = useState(false);
  const [droneNote, setDroneNote]           = useState(null);
  const [renamingMarkerId, setRenamingMarkerId]     = useState(null);
  const [renamingCueKind, setRenamingCueKind]       = useState(null);
  const [renamingLabel, setRenamingLabel]           = useState('');
  const [sectionTimeOverrides, setSectionTimeOverrides] = useState({});
  const [isDraggingMarker, setIsDraggingMarker] = useState(false);
  const [isRecording, setIsRecording]       = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [trackRouting, setTrackRouting] = useState({});

  function cycleSig() {
    setLocalTimeSig(v => {
      const idx = LIVE_TIME_SIGS.indexOf(v);
      return LIVE_TIME_SIGS[(idx + 1) % LIVE_TIME_SIGS.length];
    });
  }
  function handleRecord() { setIsRecording(v => !v); }
  function stopDrone() { setDroneNote(null); }
  async function playDrone(note) { setDroneNote(note); }

  // ── Derived song data ──────────────────────────────────────────────────────
  const stemsResult    = song?.latestStemsJob?.result || song?.latestStemsJob || null;
  const waveformRaw    = paramPeaks || song?.analysis?.waveformPeaks || song?.waveformPeaks || stemsResult?.waveformPeaks || null;
  const waveformPeaks  = processPeaksForDisplay(waveformRaw, 200);
  const sourceSections = useMemo(() => (
    paramSections.length > 0
      ? paramSections
      : paramCues.length > 0
        ? paramCues
      : (
          song?.livePipeline?.sections?.length ? song.livePipeline.sections
          : song?.sections?.length ? song.sections
          : song?.cues?.length ? song.cues
          : song?.analysis?.sections?.length ? song.analysis.sections
          : song?.analysis?.cues?.length ? song.analysis.cues
          : stemsResult?.sections?.length ? stemsResult.sections
          : stemsResult?.cues?.length ? stemsResult.cues
          : []
        )
  ), [paramSections, paramCues, song?.livePipeline?.sections, song?.sections, song?.cues, song?.analysis?.sections, song?.analysis?.cues, stemsResult?.sections, stemsResult?.cues]);
  const [editableSections, setEditableSections] = useState(sourceSections);
  const rawBpm         = manualBpm || tappedBpm || initialBpm || 0;
  const effectiveDuration = duration || song?.durationSec || 0;

  const baseKey    = detectedOriginalKey || originalSongKey;
  const displayKey = transposeKey(baseKey, transposeSteps);

  // ── Parse chart sections as fallback ──────────────────────────────────────
  const chartSections = parseSectionsForWaveform(
    song?.lyricsChordChart || song?.chordChart || song?.lyrics || '',
    effectiveDuration,
  );

  // ── Section jump list ──────────────────────────────────────────────────────
  const sectionJumpList = useMemo(() => buildLiveSectionJumpList({
    rawSections: editableSections,
    chartSections,
    effectiveDuration,
    overrides: sectionTimeOverrides,
  }), [editableSections, chartSections, effectiveDuration, sectionTimeOverrides]);

  const waveMarkers = useMemo(
    () => normalizeCueMarkers(markers, effectiveDuration),
    [markers, effectiveDuration],
  );

  const cuePads = useMemo(() => {
    const markerCues = waveMarkers.map((marker) => ({
      ...marker,
      isUserMarker: true,
      markerId: marker.id,
    }));
    const ordered = [...sectionJumpList, ...markerCues].sort((left, right) => left.timeSec - right.timeSec);
    return ordered.map((cue, index) => ({
      ...cue,
      endTimeSec: cue.endTimeSec ?? ordered[index + 1]?.timeSec ?? effectiveDuration,
    }));
  }, [sectionJumpList, waveMarkers, effectiveDuration]);

  const playheadPct    = effectiveDuration > 0 ? position / effectiveDuration : 0;
  const waveformH      = Math.round(Dimensions.get('window').height * 0.60);

  const persistLivePipelineState = useCallback(async ({
    nextMarkers = markersRef.current,
    nextSectionList = sectionJumpList,
    nextBpm = rawBpm,
  } = {}) => {
    if (!song?.id) return null;

    const normalizedBpm = Number.isFinite(Number(nextBpm))
      ? Number(nextBpm)
      : (song?.bpm || 0);
    const persistedMarkers = serializeLiveMarkers(nextMarkers, effectiveDuration);
    const persistedSections = serializeLiveSections(nextSectionList, effectiveDuration);
    const nextLivePipeline = {
      ...(song?.livePipeline || {}),
      bpm: normalizedBpm,
      markers: persistedMarkers,
      sections: persistedSections,
      updatedAt: new Date().toISOString(),
    };

    const persistedSong = await addOrUpdateSong({
      ...song,
      bpm: normalizedBpm,
      markers: persistedMarkers,
      livePipeline: nextLivePipeline,
    });

    navigation.setParams({
      song: persistedSong,
      bpm: persistedSong?.livePipeline?.bpm ?? persistedSong?.bpm ?? 0,
      markers: persistedSong?.livePipeline?.markers || persistedSong?.markers || [],
      sections: persistedSong?.livePipeline?.sections || persistedSong?.sections || [],
      cues: persistedSong?.livePipeline?.sections || persistedSong?.cues || [],
    });

    fetch(`${SYNC_URL}/sync/library-push`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify({ songs: [persistedSong] }),
    }).catch(() => {});

    return persistedSong;
  }, [song, rawBpm, sectionJumpList, effectiveDuration, navigation]);

  // ── Audio init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const normalizedTracks = (Array.isArray(initialMixerState) ? initialMixerState : [])
          .map((track, index) => normalizeLiveTrack(track, index));
        const hasBackendAuxTracks = Boolean(
          stemsResult?.click_track
          || stemsResult?.voice_guide
          || stemsResult?.pad_track,
        );
        const hasBackendStemBundle = Boolean(stemsResult?.stems);
        const hasLocalStemPackage = Boolean(
          song?.localStems
          && Object.keys(song.localStems).length > 0,
        );
        const hasPlayableCustomTracks = normalizedTracks.some((track) => track.uri || track.url);
        await audioEngine.initEngine();
        await audioEngine.stop().catch(() => {});
        if (hasPlayableCustomTracks && hasLocalStemPackage) {
          await audioEngine.replaceWithTracks(normalizedTracks);
        } else if (hasPlayableCustomTracks && (hasBackendAuxTracks || hasBackendStemBundle)) {
          await audioEngine.loadFromBackend(stemsResult, CINESTAGE_URL);
          await audioEngine.replaceWithTracks(normalizedTracks, { preserveAuxTracks: true });
        } else if (hasPlayableCustomTracks) {
          await audioEngine.replaceWithTracks(normalizedTracks);
        } else if (hasBackendStemBundle) {
          await audioEngine.loadFromBackend(stemsResult, CINESTAGE_URL);
        }
        if (cancelled) return;
        if (normalizedTracks.length > 0) audioEngine.setMixerState(normalizedTracks);
        const dur = await audioEngine.getDuration();
        if (!cancelled && dur > 0) setDuration(dur);
      } catch { /* waveform still renders */ }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, [song?.id, stemsResult, initialMixerState]);

  useEffect(() => {
    const tracks = (Array.isArray(initialMixerState) ? initialMixerState : [])
      .map((track, index) => normalizeLiveTrack(track, index));
    const nextRouting = {};
    const nextPan = {};
    const routedTracks = tracks.map((track) => {
      const routing = defaultTrackRouting(track);
      const pan = routingValueToPan(routing, track.pan ?? 0);
      nextRouting[track.id] = routing;
      nextPan[track.id] = pan;
      return {
        ...track,
        pan,
        mute: routing === 'Mute' ? true : track.mute,
      };
    });
    setLiveTracks(routedTracks);
    savedMixerStateRef.current = routedTracks.map(cloneTrack);
    setTrackRouting(nextRouting);
    setTrackPan(nextPan);
  }, [initialMixerState, song?.id]);

  useEffect(() => {
    if (liveTracks.length > 0) {
      audioEngine.setMixerState(liveTracks);
    }
  }, [liveTracks]);

  useEffect(() => {
    if (!isWorshipFree) {
      savedMixerStateRef.current = liveTracks.map(cloneTrack);
    }
  }, [liveTracks, isWorshipFree]);

  useEffect(() => {
    if (!activeSectionLabel && sectionJumpList[0]?.label) {
      setActiveSectionLabel(sectionJumpList[0].label);
    }
  }, [activeSectionLabel, sectionJumpList]);

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    const nextMarkers = resolvedInitialMarkers;
    markersRef.current = nextMarkers;
    setMarkers(nextMarkers);
    setEditableSections(sourceSections);
    setSectionTimeOverrides({});
    setRenamingMarkerId(null);
    setRenamingCueKind(null);
    setRenamingLabel('');
  }, [song?.id, sourceSections, resolvedInitialMarkers]); // reset when loading a different song

  useEffect(() => {
    setManualBpm(initialBpm);
    setBpmInput(initialBpm > 0 ? String(initialBpm) : '');
  }, [song?.id, initialBpm]);

  useEffect(() => {
    setTransposeSteps(stepsBetweenKeys(originalSongKey, initialLiveKey));
  }, [song?.id, song?.originalKey, song?.key, song?.transposedKey]);

  // Wire transpose steps → drone pad pitch so pad always plays in live key
  useEffect(() => {
    audioEngine.setPadPitch?.(transposeSteps);
  }, [transposeSteps]);

  // ── Performance sync — connect on mount, stop on unmount ──────────────────
  useEffect(() => {
    connectPerfWs();
    return () => {
      broadcastPerf('PERF_STOP', {});
      perfWsRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Position polling ───────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const pos = await audioEngine.getPosition();
      const dur = await audioEngine.getDuration();
      setPosition(pos);
      if (dur > 0) setDuration(dur);

      // Active section detection
      let label = sectionJumpList[0]?.label || null;
      for (const sec of sectionJumpList) {
        if (pos >= (sec.timeSec || 0)) label = sec.label;
      }
      setActiveSectionLabel(label);

      // Queue enforcement — jump at section boundary (no audio cut)
      const queued = queuedSectionRef.current;
      if (queued) {
        const cur      = sectionJumpList.find(s => s.label === label);
        const boundary = cur?.endTimeSec ?? dur ?? 0;
        if (boundary > 0 && pos >= boundary - 0.15) {
          audioEngine.seek(queued.timeSec);
          setActiveSectionLabel(queued.label);
          queuedSectionRef.current = null;
          setQueueLabel(null);
          setEngineState(ENGINE_STATE.PLAYING);
        }
      }

      // Loop enforcement — jump back when section ends
      const loopSec = loopSectionRef.current;
      if (loopSec && pos >= (loopSec.endTimeSec ?? dur ?? 0) - 0.15) {
        audioEngine.seek(loopSec.timeSec);
      }

      // Song end
      if (dur > 0 && pos >= dur - 0.2) {
        stopPolling();
        setIsPlaying(false);
        setPosition(0);
        setEngineState(ENGINE_STATE.PLAYING);
        queuedSectionRef.current = null;
        loopSectionRef.current   = null;
        setQueueLabel(null);
        setLoopActive(false);
      }
    }, 80);
  }, [sectionJumpList, stopPolling]);

  // ── Transport ──────────────────────────────────────────────────────────────
  function handlePlayPause() {
    if (isPlaying) {
      audioEngine.pause();
      stopPolling();
      setIsPlaying(false);
      broadcastPerf('PERF_PAUSE', { position });
    } else {
      audioEngine.play();
      startPolling();
      setIsPlaying(true);
      if (!hasSentStartRef.current) {
        hasSentStartRef.current = true;
        broadcastPerf('PERF_START', {
          song: { id: song?.id, title: song?.title, artist: song?.artist, key: song?.key, bpm: song?.bpm, lyrics: song?.lyrics, chordChart: song?.chordChart, instrumentSheets: song?.instrumentSheets },
        });
      } else {
        broadcastPerf('PERF_PLAY', { position });
      }
    }
  }

  function handleStop() {
    audioEngine.stop(); stopPolling(); setIsPlaying(false); setPosition(0);
    setEngineState(ENGINE_STATE.PLAYING);
    queuedSectionRef.current = null;
    loopSectionRef.current   = null;
    setQueueLabel(null);
    setLoopActive(false);
    broadcastPerf('PERF_STOP', {});
  }

  function handleSeek(pctOrSec) {
    const targetSec = (pctOrSec <= 1 && pctOrSec >= 0 && effectiveDuration > 0)
      ? pctOrSec * effectiveDuration : pctOrSec;
    audioEngine.seek(targetSec);
    setPosition(targetSec);
  }

  function handlePrevSection() {
    const idx = sectionJumpList.findIndex(s => s.label === activeSectionLabel);
    const prev = idx > 0 ? sectionJumpList[idx - 1] : sectionJumpList[0];
    if (!prev) return;
    audioEngine.seek(prev.timeSec);
    setPosition(prev.timeSec);
    setActiveSectionLabel(prev.label);
    queuedSectionRef.current = null;
    loopSectionRef.current   = null;
    setQueueLabel(null);
    setLoopActive(false);
    setEngineState(ENGINE_STATE.PLAYING);
    broadcastPerf('PERF_SECTION', { sectionLabel: prev.label });
  }

  function handleNextSection() {
    const idx  = sectionJumpList.findIndex(s => s.label === activeSectionLabel);
    const next = sectionJumpList[idx + 1];
    if (!next) return;
    audioEngine.seek(next.timeSec);
    setPosition(next.timeSec);
    setActiveSectionLabel(next.label);
    queuedSectionRef.current = null;
    loopSectionRef.current   = null;
    setQueueLabel(null);
    setLoopActive(false);
    setEngineState(ENGINE_STATE.PLAYING);
    broadcastPerf('PERF_SECTION', { sectionLabel: next.label });
  }

  function handleNextSong() {
    if (nextSong) {
      broadcastPerf('PERF_SONG', {
        song: { id: nextSong?.id, title: nextSong?.title, artist: nextSong?.artist, key: nextSong?.key, bpm: nextSong?.bpm, lyrics: nextSong?.lyrics, chordChart: nextSong?.chordChart, instrumentSheets: nextSong?.instrumentSheets },
      });
      navigation.replace('Live', { song: nextSong, userRole });
    }
  }

  function handleEmergencyClear() {
    audioEngine.emergencyClear?.();
    setIsPlaying(false);
    stopPolling();
  }

  function stopMixAnimation() {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  }

  function connectPerfWs() {
    const wsBase = CINESTAGE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/ws/sync?orgId=${SYNC_ORG_ID}&secretKey=${SYNC_SECRET_KEY}`);
    perfWsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'peer_joined') setFollowerCount(c => c + 1);
        if (msg.type === 'peer_left')   setFollowerCount(c => Math.max(0, c - 1));
      } catch {}
    };
    ws.onerror = () => {};
    ws.onclose = () => { perfWsRef.current = null; };
  }

  function broadcastPerf(type, data) {
    const payload = { type, sessionId, ...data };
    const ws = perfWsRef.current;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'broadcast', data: payload }));
    }
    // Broadcast via Cloudflare DO sync room (works globally, not just local WiFi)
    broadcastToRoom(sessionId, payload).catch(() => {});
  }

  function animateMixerState(targetTracks, durationMs = 900, onComplete = null) {
    const startTracks = (liveTracks.length > 0 ? liveTracks : buildFallbackTrackPreview(stemsResult))
      .map(cloneTrack);
    const target = (targetTracks || []).map(cloneTrack);
    if (startTracks.length === 0 || target.length === 0) {
      setLiveTracks(target);
      onComplete?.();
      return;
    }

    const startById = new Map(startTracks.map((track) => [track.id, track]));
    const targetById = new Map(target.map((track) => [track.id, track]));
    const ids = Array.from(new Set([...startById.keys(), ...targetById.keys()]));
    const steps = 10;
    let step = 0;

    stopMixAnimation();
    fadeIntervalRef.current = setInterval(() => {
      step += 1;
      const progress = Math.min(1, step / steps);
      const frame = ids.map((id) => {
        const start = startById.get(id) || targetById.get(id) || { id, volume: 0, mute: true };
        const end = targetById.get(id) || start;
        const startVolume = start.mute ? 0 : Number(start.volume ?? 1);
        const endVolume = end.mute ? 0 : Number(end.volume ?? 1);
        return {
          ...cloneTrack(end),
          volume: startVolume + (endVolume - startVolume) * progress,
          mute: progress >= 1 ? Boolean(end.mute) : false,
        };
      });
      setLiveTracks(frame);
      if (progress >= 1) {
        stopMixAnimation();
        setLiveTracks(target);
        onComplete?.();
      }
    }, Math.max(45, Math.floor(durationMs / steps)));
  }

  async function commitBpmInput() {
    const parsed = Number(bpmInput);
    if (!Number.isFinite(parsed) || parsed < 40 || parsed > 240) {
      setBpmInput(rawBpm > 0 ? String(rawBpm) : '');
      return;
    }
    setTappedBpm(0);
    setManualBpm(parsed);
    setBpmInput(String(parsed));
    if (song?.id) {
      try {
        await persistLivePipelineState({ nextBpm: parsed });
      } catch {
        // Keep live editing responsive even if persistence fails.
      }
    }
  }

  function clearLiveQueueState() {
    queuedSectionRef.current = null;
    loopSectionRef.current = null;
    setQueueLabel(null);
    setLoopActive(false);
    setEngineState(ENGINE_STATE.PLAYING);
  }

  function jumpToSection(section) {
    if (!section) return;
    audioEngine.seek(section.timeSec);
    setPosition(section.timeSec);
    setActiveSectionLabel(section.label);
    clearLiveQueueState();
    broadcastPerf('PERF_SECTION', { sectionLabel: section.label });
  }

  function jumpToSectionAliases(aliases = [], useLast = false) {
    const target = findSectionByAliases(sectionJumpList, aliases, useLast)
      || (useLast ? sectionJumpList[sectionJumpList.length - 1] : sectionJumpList[0]);
    if (!target) return;
    jumpToSection(target);
  }

  function handleBreakCue() {
    if (isPlaying) {
      audioEngine.pause();
      stopPolling();
      setIsPlaying(false);
      return;
    }
    audioEngine.play();
    startPolling();
    setIsPlaying(true);
  }

  // ── Section multi-tap cue system ───────────────────────────────────────────
  function handleSectionTap(sec, explicitTapCount = null) {
    const resolvedSec = cuePads.find((cue) => (
      String(cue.id || cue.markerId || cue.label)
        === String(sec?.id || sec?.markerId || sec?.label)
    )) || sec;

    if (engineState === ENGINE_STATE.WORSHIP_FREE) {
      returnFromWorshipFree(resolvedSec);
      return;
    }
    let tapCount = explicitTapCount;
    if (tapCount == null) {
      const tap = sectionTapRef.current;
      if (tap.timer) { clearTimeout(tap.timer); tap.timer = null; }
      const cueKey = String(resolvedSec?.markerId || resolvedSec?.id || resolvedSec?.label);
      tap.count   = (tap.section === cueKey) ? tap.count + 1 : 1;
      tap.section = cueKey;
      tapCount = tap.count;
      tap.timer = setTimeout(() => { tap.count = 0; tap.section = null; }, 600);
    }

    if (tapCount === 1) {
      // 1× — QUEUE: play to end of current section then jump
      queuedSectionRef.current = resolvedSec;
      setQueueLabel(resolvedSec.label);
      loopSectionRef.current = null;
      setLoopActive(false);
      setEngineState(ENGINE_STATE.PLAYING);
    } else if (tapCount === 2) {
      // 2× — LOOP: seek immediately + loop
      audioEngine.seek(resolvedSec.timeSec);
      setPosition(resolvedSec.timeSec);
      setActiveSectionLabel(resolvedSec.label);
      loopSectionRef.current   = resolvedSec;
      queuedSectionRef.current = null;
      setQueueLabel(null);
      setLoopActive(true);
      setEngineState(ENGINE_STATE.LOOPING);
      broadcastPerf('PERF_SECTION', { sectionLabel: resolvedSec.label });
    } else {
      // 3× — WORSHIP FREE
      sectionTapRef.current.count = 0;
      loopSectionRef.current   = null;
      queuedSectionRef.current = null;
      setQueueLabel(null);
      setLoopActive(false);
      activateWorshipFree();
      return;
    }
  }

  // ── Quick cue actions ──────────────────────────────────────────────────────
  function handleRepeat() {
    // Loop current section immediately
    const cur = sectionJumpList.find(s => s.label === activeSectionLabel);
    if (!cur) return;
    audioEngine.seek(cur.timeSec);
    setPosition(cur.timeSec);
    loopSectionRef.current   = cur;
    queuedSectionRef.current = null;
    setQueueLabel(null);
    setLoopActive(true);
    setEngineState(ENGINE_STATE.LOOPING);
  }

  function handleSkip() {
    // Immediately jump to next section (cuts now)
    handleNextSection();
  }

  function handleExtend() {
    // Queue the current section again (play it one more time after it ends)
    const cur = sectionJumpList.find(s => s.label === activeSectionLabel);
    if (!cur) return;
    queuedSectionRef.current = cur;
    setQueueLabel(cur.label);
    loopSectionRef.current = null;
    setLoopActive(false);
    setEngineState(ENGINE_STATE.PLAYING);
  }

  // ── Worship Free ───────────────────────────────────────────────────────────
  function handleWorshipLoop() {
    if (engineState === ENGINE_STATE.LOOPING) {
      loopSectionRef.current = null;
      setLoopActive(false);
      setEngineState(ENGINE_STATE.PLAYING);
    } else if (engineState === ENGINE_STATE.WORSHIP_FREE) {
      returnFromWorshipFree(null);
    } else {
      const cur = sectionJumpList.find(s => s.label === activeSectionLabel);
      if (cur) {
        loopSectionRef.current = cur;
        setLoopActive(true);
        setEngineState(ENGINE_STATE.LOOPING);
      }
    }
  }

  function activateWorshipFree() {
    stopMixAnimation();
    const baseMix = (liveTracks.length > 0 ? liveTracks : buildFallbackTrackPreview(stemsResult))
      .map(cloneTrack);
    savedMixerStateRef.current = baseMix;
    const worshipMix = baseMix.map((track) => (
      isPadTrack(track)
        ? { ...cloneTrack(track), mute: false, volume: Math.max(0.85, Number(track.volume ?? 1)) }
        : { ...cloneTrack(track), mute: true, volume: 0 }
    ));
    setEngineState(ENGINE_STATE.WORSHIP_FREE);
    animateMixerState(worshipMix, 850);
  }

  function returnFromWorshipFree(sec) {
    stopMixAnimation();
    const restoreMix = savedMixerStateRef.current?.length > 0
      ? savedMixerStateRef.current.map(cloneTrack)
      : (liveTracks.length > 0 ? liveTracks : buildFallbackTrackPreview(stemsResult)).map(cloneTrack);
    setEngineState(ENGINE_STATE.PLAYING);
    animateMixerState(restoreMix, 850, () => {
      if (sec) {
        queuedSectionRef.current = sec;
        setQueueLabel(sec.label);
      }
    });
  }

  // ── Tap BPM ────────────────────────────────────────────────────────────────
  function handleTapBpm() {
    const now     = Date.now();
    const recents = [...tapBpmList, now].filter(t => now - t < 4000).slice(-8);
    setTapBpmList(recents);
    if (recents.length >= 2) {
      const gaps = recents.slice(1).map((t, i) => t - recents[i]);
      setTappedBpm(Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)));
    }
  }

  // ── Add marker at current position ────────────────────────────────────────
  function handleAddMarker(atTimeSec = position) {
    const id = `m_${Date.now()}`;
    const timeSec = Math.max(0, Math.min(effectiveDuration || atTimeSec, atTimeSec));
    const label = `Marker ${fmtSec(timeSec)}`;
    const nextMarkers = [...markersRef.current, {
      id,
      timeSec,
      positionSeconds: timeSec,
      start: timeSec,
      end: timeSec,
      label,
      color: '#F59E0B',
      type: 'cue',
    }];
    markersRef.current = nextMarkers;
    setMarkers(nextMarkers);
    setRenamingMarkerId(id);
    setRenamingCueKind('marker');
    setRenamingLabel(label);
    persistLivePipelineState({ nextMarkers }).catch(() => {});
  }

  function commitRename() {
    if (!renamingMarkerId) return;
    suppressCuePressRef.current = null;
    if (renamingCueKind === 'section') {
      const previousSection = sectionJumpList.find((section, index) => (
        cueIdentity(section, index) === String(renamingMarkerId)
      ));
      if (!previousSection) {
        setRenamingMarkerId(null);
        setRenamingCueKind(null);
        setRenamingLabel('');
        return;
      }
      const nextLabel = renamingLabel.trim() || previousSection.label;
      const nextSectionList = sectionJumpList.map((section, index) => {
        const sectionKey = cueIdentity(section, index);
        if (sectionKey !== String(renamingMarkerId)) return section;
        return {
          ...section,
          label: nextLabel,
          color: section?.color || chipColor(nextLabel),
        };
      });
      setEditableSections(serializeLiveSections(nextSectionList, effectiveDuration));
      if (queueLabel === previousSection.label) setQueueLabel(nextLabel);
      if (activeSectionLabel === previousSection.label) setActiveSectionLabel(nextLabel);
      if (queuedSectionRef.current?.label === previousSection.label) {
        queuedSectionRef.current = { ...queuedSectionRef.current, label: nextLabel };
      }
      if (loopSectionRef.current?.label === previousSection.label) {
        loopSectionRef.current = { ...loopSectionRef.current, label: nextLabel };
      }
      setRenamingMarkerId(null);
      setRenamingCueKind(null);
      setRenamingLabel('');
      persistLivePipelineState({ nextSectionList }).catch(() => {});
      return;
    }

    const sourceIndex = waveMarkers.find((marker) => marker.id === renamingMarkerId)?.sourceIndex;
    let previousLabel = null;
    let nextLabel = null;
    const nextMarkers = markersRef.current.map((marker, index) => {
      const matchesId = marker?.id === renamingMarkerId;
      const matchesSourceIndex = marker?.id == null && sourceIndex === index;
      if (!matchesId && !matchesSourceIndex) return marker;
      previousLabel = marker?.label || null;
      nextLabel = renamingLabel.trim() || marker.label;
      return {
        ...marker,
        id: marker?.id || renamingMarkerId,
        label: nextLabel,
      };
    });
    markersRef.current = nextMarkers;
    setMarkers(nextMarkers);
    if (previousLabel && nextLabel) {
      if (queueLabel === previousLabel) setQueueLabel(nextLabel);
      if (activeSectionLabel === previousLabel) setActiveSectionLabel(nextLabel);
      if (queuedSectionRef.current?.label === previousLabel) {
        queuedSectionRef.current = { ...queuedSectionRef.current, label: nextLabel };
      }
      if (loopSectionRef.current?.label === previousLabel) {
        loopSectionRef.current = { ...loopSectionRef.current, label: nextLabel };
      }
    }
    setRenamingMarkerId(null);
    setRenamingCueKind(null);
    setRenamingLabel('');
    persistLivePipelineState({ nextMarkers }).catch(() => {});
  }

  function handleDeleteMarker(marker) {
    suppressCuePressRef.current = null;
    const nextMarkers = markersRef.current.filter((item, index) => {
      const itemId = item?.id;
      const matchesId = itemId === marker.id;
      const matchesSourceIndex = itemId == null && marker.sourceIndex === index;
      return !(matchesId || matchesSourceIndex);
    });
    markersRef.current = nextMarkers;
    setMarkers(nextMarkers);
    if (renamingMarkerId === marker.id) {
      setRenamingMarkerId(null);
      setRenamingCueKind(null);
      setRenamingLabel('');
    }
    if (queuedSectionRef.current?.label === marker.label) {
      queuedSectionRef.current = null;
      setQueueLabel(null);
    }
    if (loopSectionRef.current?.label === marker.label) {
      loopSectionRef.current = null;
      setLoopActive(false);
      setEngineState(ENGINE_STATE.PLAYING);
    }
    persistLivePipelineState({ nextMarkers }).catch(() => {});
  }

  function handleDeleteCue(cue) {
    suppressCuePressRef.current = null;
    if (cue?.isUserMarker) {
      handleDeleteMarker(cue);
      return;
    }

    const cueKey = cueIdentity(cue);
    const nextSectionList = sectionJumpList.filter((section, index) => (
      cueIdentity(section, index) !== cueKey
    ));

    setEditableSections(serializeLiveSections(nextSectionList, effectiveDuration));
    if (renamingMarkerId === cueKey) {
      setRenamingMarkerId(null);
      setRenamingCueKind(null);
      setRenamingLabel('');
    }
    if (queuedSectionRef.current?.label === cue.label) {
      queuedSectionRef.current = null;
      setQueueLabel(null);
    }
    if (loopSectionRef.current?.label === cue.label) {
      loopSectionRef.current = null;
      setLoopActive(false);
      setEngineState(ENGINE_STATE.PLAYING);
    }
    if (activeSectionLabel === cue.label) {
      setActiveSectionLabel(nextSectionList[0]?.label || null);
    }
    persistLivePipelineState({ nextSectionList }).catch(() => {});
  }

  function handleSectionMarkerDrag(sec, nextTimeSec, isFinal) {
    if (!isDraggingMarker) setIsDraggingMarker(true);
    if (isFinal) setIsDraggingMarker(false);
    const markerKey = sec.markerId || sec.id || sec.label;
    const clampedTimeSec = Math.max(0, Math.min(effectiveDuration || nextTimeSec, nextTimeSec));
    setSectionTimeOverrides((prev) => {
        const nextOverrides = { ...prev, [markerKey]: clampedTimeSec };
        if (isFinal) {
          const nextSectionList = buildLiveSectionJumpList({
            rawSections: editableSections,
            chartSections,
            effectiveDuration,
            overrides: nextOverrides,
          });
          setEditableSections(serializeLiveSections(nextSectionList, effectiveDuration));
          persistLivePipelineState({ nextSectionList }).catch(() => {});
        }
        return nextOverrides;
      });
  }

  function handleWaveMarkerTap(marker) {
    const targetCue = cuePads.find((cue) => cue.isUserMarker && cue.id === marker.id) || {
      ...marker,
      label: marker.label,
      timeSec: marker.timeSec,
      color: marker.color,
      isUserMarker: true,
    };
    handleSectionTap(targetCue);
  }

  function handleWaveMarkerDrag(marker, nextTimeSec, isFinal, mode = 'move') {
    if (!isDraggingMarker) setIsDraggingMarker(true);
    if (isFinal) setIsDraggingMarker(false);
    if (mode !== 'move') return;
    const clampedTimeSec = Math.max(0, Math.min(effectiveDuration || nextTimeSec, nextTimeSec));
    const nextMarkers = markersRef.current.map((item, index) => {
      const itemId = item?.id;
      const matchesId = itemId === marker.id;
      const matchesSourceIndex = itemId == null && marker.sourceIndex === index;
      if (!matchesId && !matchesSourceIndex) return item;
      return {
        ...item,
        id: item?.id || marker.id,
        timeSec: clampedTimeSec,
        positionSeconds: clampedTimeSec,
        start: clampedTimeSec,
        end: clampedTimeSec,
      };
    });
    markersRef.current = nextMarkers;
    setMarkers(nextMarkers);
    if (isFinal) {
      persistLivePipelineState({ nextMarkers }).catch(() => {});
    }
  }

  const updateTrackVolume = useCallback((trackId, nextVolume) => {
    const clamped = Math.max(0, Math.min(1, Number(nextVolume) || 0));
    setLiveTracks(prev => prev.map((track) => (
      track.id === trackId ? { ...track, volume: clamped } : track
    )));
  }, []);

  const toggleTrackMute = useCallback((trackId) => {
    setLiveTracks(prev => prev.map((track) => (
      track.id === trackId ? { ...track, mute: !track.mute } : track
    )));
  }, []);

  const setTrackPanValue = useCallback((trackId, panValue) => {
    setTrackPan((prev) => ({ ...prev, [trackId]: panValue }));
    setTrackRouting((prev) => ({
      ...prev,
      [trackId]: panValue <= -0.5 ? 'Main L' : panValue >= 0.5 ? 'Main R' : 'Main L/R',
    }));
    setLiveTracks((prev) => prev.map((track) => (
      track.id === trackId
        ? { ...track, pan: panValue, mute: false }
        : track
    )));
    audioEngine.setPan(trackId, panValue);
  }, []);

  const handleTrackRoutingChange = useCallback((trackId, routingValue) => {
    const normalizedRouting = SUPPORTED_OUTPUT_OPTIONS.includes(routingValue)
      ? routingValue
      : 'Main R';
    const nextPan = routingValueToPan(normalizedRouting, trackPan[trackId] ?? 0);
    setTrackRouting((prev) => ({ ...prev, [trackId]: normalizedRouting }));
    setTrackPan((prev) => ({ ...prev, [trackId]: nextPan }));
    setLiveTracks((prev) => prev.map((track) => (
      track.id === trackId
        ? {
            ...track,
            pan: nextPan,
            mute: normalizedRouting === 'Mute' ? true : false,
          }
        : track
    )));
    if (normalizedRouting !== 'Mute') {
      audioEngine.setPan(trackId, nextPan);
    }
  }, [trackPan]);

  const updateTrackVolumeFromTouch = useCallback((trackId, locationY) => {
    const railHeight = 156;
    const clampedY = Math.max(0, Math.min(railHeight, Number(locationY) || 0));
    updateTrackVolume(trackId, 1 - (clampedY / railHeight));
  }, [updateTrackVolume]);

  async function handleApplyTranspose() {
    if (transposeSteps === 0 || isTransposing) return;
    const stemsDict = {};
    liveTracks.forEach(t => { if (t.url) stemsDict[t.type || t.id] = t.url; });
    if (Object.keys(stemsDict).length === 0) return;
    setIsTransposing(true);
    try {
      const res = await fetch(`${CINESTAGE_URL}/stems/transpose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stems: stemsDict, semitones: transposeSteps }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { stems: newStems } = await res.json();
      const updated = liveTracks.map(t => {
        const newUrl = newStems[t.type || t.id];
        return newUrl ? { ...t, url: newUrl, uri: newUrl } : t;
      });
      setLiveTracks(updated);
      await audioEngine.replaceWithTracks(updated);
      audioEngine.setMixerState(updated);
    } catch (e) {
      Alert.alert('Transpose Failed', e.message);
    } finally {
      setIsTransposing(false);
    }
  }

  async function handleDetectBpmKey() {
    const audioUrl = stemsResult?.sourceUrl || song?.fileUrl || song?.audioUrl;
    if (!audioUrl || isDetecting) return;
    setIsDetecting(true);
    try {
      const res = await fetch(`${CINESTAGE_URL}/songs/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: audioUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { bpm, key } = await res.json();
      if (bpm > 0) { setManualBpm(bpm); setBpmInput(String(bpm)); }
      if (key) { setDetectedOriginalKey(key); setTransposeSteps(0); }
      Alert.alert('Detected', `BPM: ${bpm}  ·  Key: ${key}`);
    } catch (e) {
      Alert.alert('Detection Failed', e.message);
    } finally {
      setIsDetecting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <View style={s.bgGlowOne} pointerEvents="none" />
      <View style={s.bgGlowTwo} pointerEvents="none" />
      <View style={s.bgGlowThree} pointerEvents="none" />

      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={!isDraggingMarker}
        contentContainerStyle={[
          s.scrollContent,
          { paddingTop: insets.top + 12, paddingBottom: Math.max(34, insets.bottom + 18) },
        ]}
        showsVerticalScrollIndicator={false}
      >

        <View style={s.consoleShell}>
          <View style={s.consoleFrame}>
            <View style={s.consoleHeaderRow}>
              <TouchableOpacity style={s.consoleGhostBtn} onPress={() => navigation.navigate('Home')}>
                <Text style={s.consoleGhostText}>◀ Home</Text>
              </TouchableOpacity>

              <View style={s.consoleHeaderCenter}>
                <Text style={s.consoleSongTitle} numberOfLines={1}>Live Performance</Text>
                {song?.title ? (
                  <Text style={s.consoleSubSongTitle} numberOfLines={1}>{song.title}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Text style={s.consoleSongMeta} numberOfLines={1}>
                    {formatRoleLabel(userRole)} · {displayKey || 'Key N/A'} · {rawBpm || '—'} BPM
                  </Text>
                  {followerCount > 0 && (
                    <Text style={s.followerBadge}>  📡 {followerCount}</Text>
                  )}
                </View>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <TouchableOpacity
                  style={[s.consoleGhostBtn, !nextSong && s.consoleGhostBtnDisabled]}
                  onPress={handleNextSong}
                  disabled={!nextSong}
                >
                  <Text style={s.consoleGhostText}>NEXT ▶</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Toolbar ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={s.tbRow3Scroll} contentContainerStyle={s.tbRow3Content}>
              <TouchableOpacity style={s.tbBtn} onPress={handlePrevSection}>
                <Text style={s.tbBtnText}>⏮</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.tbBtn} onPress={handleStop}>
                <Text style={[s.tbBtnText, { color: '#F87171' }]}>■</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.tbPlayBtn} onPress={handlePlayPause}>
                <Text style={s.tbPlayBtnText}>{isPlaying ? '⏸' : '▶'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.tbBtn} onPress={handleNextSection}>
                <Text style={[s.tbBtnText, { color: '#34D399' }]}>⏭</Text>
              </TouchableOpacity>
              <View style={s.tbDivider} />
              {/* BPM */}
              <View style={s.tbMenuPill}>
                <Text style={s.tbMenuPillLabel}>BPM</Text>
                <TextInput
                  style={s.tbMenuBpmInput}
                  value={bpmInput}
                  onChangeText={setBpmInput}
                  onSubmitEditing={commitBpmInput}
                  onBlur={commitBpmInput}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  maxLength={3}
                  selectTextOnFocus
                />
              </View>
              {/* TAP */}
              <TouchableOpacity style={s.tbMenuBtn} onPress={handleTapBpm}>
                <Text style={s.tbMenuBtnText}>TAP</Text>
              </TouchableOpacity>
              {/* Time Sig */}
              <TouchableOpacity style={[s.tbMenuBtn, { borderColor: '#14B8A6' }]} onPress={cycleSig}>
                <Text style={[s.tbMenuBtnText, { color: '#5EEAD4' }]}>{localTimeSig}</Text>
              </TouchableOpacity>
              {/* Key / Pad */}
              <TouchableOpacity
                style={[s.tbMenuBtn, droneNote
                  ? { borderColor: '#F59E0B', backgroundColor: '#1A100A' }
                  : { borderColor: '#6366F1' },
                  keyPickerOpen && !droneNote && { backgroundColor: '#1A1A3A' }]}
                onPress={() => { setKeyPickerOpen(v => !v); }}
              >
                {droneNote
                  ? <Text style={{ color: '#FCD34D', fontSize: 13, fontWeight: '900' }}>{droneNote} ♩</Text>
                  : <Text style={[s.tbMenuBtnText, { color: '#A5B4FC' }]}>♪ {displayKey || '—'}</Text>}
              </TouchableOpacity>
              {/* Markers */}
              <TouchableOpacity
                style={[s.tbMenuBtn, markers.length > 0 && { borderColor: '#F59E0B' }]}
                onPress={handleAddMarker}
              >
                <Text style={[s.tbMenuBtnText, markers.length > 0 && { color: '#FCD34D' }]}>
                  Markers
                </Text>
              </TouchableOpacity>
              <View style={s.tbDivider} />
              {/* REC */}
              <TouchableOpacity
                style={[s.tbMenuBtn, isRecording && { borderColor: '#EF4444', backgroundColor: '#3A0A0A' }]}
                onPress={handleRecord}
              >
                <View style={s.tbRecordRow}>
                  <View style={[s.tbRecordDot, isRecording && s.tbRecordDotActive]} />
                  <Text style={[s.tbMenuBtnText, isRecording && { color: '#FCA5A5' }]}>REC</Text>
                </View>
              </TouchableOpacity>
              <View style={s.tbDivider} />
              {/* Settings */}
              <TouchableOpacity
                style={[s.tbMenuBtn, { borderColor: '#334155' }]}
                onPress={() => setSettingsModalVisible(true)}
              >
                <Text style={[s.tbMenuBtnText, { color: '#94A3B8' }]}>⚙ SETTINGS</Text>
              </TouchableOpacity>
              <View style={s.tbDivider} />
              {/* Status chip */}
              <View style={[
                s.tbStatusChip,
                isWorshipFree && { backgroundColor: '#78350F', borderColor: '#F59E0B' },
                isLooping && { backgroundColor: '#1E3A5F', borderColor: '#3B82F6' },
                queueLabel && !isWorshipFree && !isLooping && { backgroundColor: '#14532D', borderColor: '#22C55E' },
              ]}>
                <Text style={[
                  s.tbStatusChipText,
                  isWorshipFree && { color: '#FCD34D' },
                  isLooping && { color: '#60A5FA' },
                  queueLabel && !isWorshipFree && !isLooping && { color: '#4ADE80' },
                ]}>
                  {isWorshipFree ? '🙏 WORSHIP' : isLooping ? '🔁 LOOP' : queueLabel ? `▶ ${queueLabel}` : '● READY'}
                </Text>
              </View>
            </ScrollView>

            {/* Key picker dropdown */}
            {keyPickerOpen && (
              <View style={s.tbDropdown}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 4, gap: 8 }}>
                  <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>KEY / PAD</Text>
                  {droneNote && (
                    <TouchableOpacity style={s.tbDropdownStop} onPress={stopDrone}>
                      <Text style={{ color: '#F87171', fontSize: 11, fontWeight: '700' }}>■ Stop Pad</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 8 }}>
                  {NOTE_NAMES.map(note => {
                    const isDrone = droneNote === note;
                    const isKey = displayKey === note;
                    return (
                      <TouchableOpacity key={note}
                        style={[s.tbNoteChip,
                          isDrone && { borderColor: '#F59E0B', backgroundColor: '#1A100A' },
                          !isDrone && isKey && { borderColor: '#6366F1', backgroundColor: '#1A1A3A' }]}
                        onPress={() => {
                          if (isDrone) { stopDrone(); } else { playDrone(note); }
                          setKeyPickerOpen(false);
                        }}
                      >
                        <Text style={[s.tbNoteChipText,
                          isDrone && { color: '#FCD34D' },
                          !isDrone && isKey && { color: '#A5B4FC' }]}>{note}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Live Cue Timeline ── */}
            <View style={s.waveHeroCard}>
              <WaveformTimeline
                sections={sectionJumpList}
                markers={waveMarkers}
                automationEvents={[]}
                lengthSeconds={effectiveDuration}
                playheadPct={playheadPct}
                waveformPeaks={waveformPeaks}
                onSeek={(pct) => handleSeek(pct * effectiveDuration)}
                onAddMarker={handleAddMarker}
                bpm={rawBpm}
                songTitle={song?.title || ''}
                sectionMarkers={sectionJumpList}
                activeSectionLabel={activeSectionLabel}
                sectionLoopActive={loopActive}
                onSectionTap={(sec, tapCount) => handleSectionTap(sec, tapCount)}
                onSectionMarkerDrag={handleSectionMarkerDrag}
                onMarkerTap={handleWaveMarkerTap}
                onMarkerDrag={handleWaveMarkerDrag}
                height={waveformH}
                userRole={userRole}
              />

              <View style={s.waveFooter}>
                <Text style={s.waveFooterTime}>{fmtSec(position)}</Text>
                <View style={s.waveFooterTrack}>
                  <View style={[s.waveFooterProgress, { width: `${Math.min(100, playheadPct * 100)}%` }]} />
                </View>
                <Text style={s.waveFooterTime}>{fmtSec(effectiveDuration)}</Text>
              </View>

              <LiveActionsPanel
                sectionList={sectionJumpList}
                activeSectionLabel={activeSectionLabel}
              />
            </View>


          </View>
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <Modal visible={settingsModalVisible} transparent animationType="slide"
        onRequestClose={() => setSettingsModalVisible(false)}>
        <TouchableOpacity style={s.settingsOverlay} activeOpacity={1}
          onPress={() => setSettingsModalVisible(false)} />
        <View style={[s.settingsPanel, { maxHeight: '80%' }]}>
          <Text style={s.settingsPanelTitle}>Settings</Text>
          <View style={s.settingsDividerLine} />
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Audio Routing — stem tracks only */}
            <Text style={{ color: '#6366F1', fontSize: 11, fontWeight: '800',
              letterSpacing: 1, marginBottom: 8, marginTop: 4 }}>🔊 OUTPUT ROUTING</Text>
            <View style={{ backgroundColor: '#060D1E', borderRadius: 10, padding: 10,
              borderWidth: 1, borderColor: '#1E293B', marginBottom: 12 }}>
              {liveTracks.length === 0 ? (
                <Text style={{ color: '#475569', fontSize: 12, textAlign: 'center', paddingVertical: 8 }}>
                  No stems loaded — load a song with stems to route outputs
                </Text>
              ) : (
                liveTracks.map((track, i) => (
                  <View key={track.id}>
                    {i > 0 && <View style={{ height: 1, backgroundColor: '#1E293B', marginVertical: 2 }} />}
                    <RoutingPicker
                      label={track.label || track.type || `Track ${i + 1}`}
                      value={trackRouting[track.id] || defaultTrackRouting(track)}
                      options={SUPPORTED_OUTPUT_OPTIONS}
                      onChange={(v) => handleTrackRoutingChange(track.id, v)}
                    />
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity style={[s.settingsActionRow, { marginTop: 8, marginBottom: 4 }]}
              onPress={() => setSettingsModalVisible(false)}>
              <Text style={{ color: '#6B7280', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>Done</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050813',
  },
  scrollContent: {
    paddingHorizontal: 22,
  },
  bgGlowOne: {
    position: 'absolute',
    top: 40,
    left: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(99,102,241,0.18)',
  },
  bgGlowTwo: {
    position: 'absolute',
    top: 260,
    right: -70,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(249,115,22,0.16)',
  },
  bgGlowThree: {
    position: 'absolute',
    bottom: 120,
    left: '25%',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(34,211,238,0.10)',
  },
  heroHeader: {
    alignItems: 'center',
    marginBottom: 22,
  },
  brandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2B3550',
    backgroundColor: 'rgba(13,19,34,0.92)',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  brandChipIcon: {
    color: '#38BDF8',
    fontSize: 18,
    fontWeight: '900',
  },
  brandChipText: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '900',
  },
  heroSubtitle: {
    marginTop: 14,
    color: '#F6C67A',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  consoleShell: {
    borderRadius: 34,
    padding: 2,
    backgroundColor: 'rgba(129,140,248,0.18)',
    shadowColor: '#60A5FA',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  consoleFrame: {
    backgroundColor: 'rgba(8,14,28,0.97)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#24304A',
    padding: 18,
  },
  consoleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  consoleHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  consoleSongTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
  },
  consoleSubSongTitle: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  consoleSongMeta: {
    color: '#8FA2C8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  followerBadge: {
    color: '#6EE7B7',
    fontSize: 11,
    fontWeight: '700',
  },
  channelDeck: { marginTop: 10, marginBottom: 6, gap: 5 },
  meterRail: { height: 4, backgroundColor: '#172033', borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  meterFill: { height: '100%', borderRadius: 999 },
  panBtn: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1324' },
  panBtnActive: { backgroundColor: '#1E3A5F', borderColor: '#60A5FA' },
  panBtnText: { color: '#64748B', fontSize: 9, fontWeight: '900' },
  panBtnTextActive: { color: '#93C5FD' },
  applyTransposeBtn: { marginTop: 6, backgroundColor: '#1C1206', borderRadius: 8, borderWidth: 1, borderColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center', alignSelf: 'center' },
  applyTransposeBtnText: { color: '#F59E0B', fontSize: 10, fontWeight: '800' },
  consoleGhostBtn: {
    minWidth: 108,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27324A',
    backgroundColor: '#0B1324',
  },
  consoleGhostBtnDisabled: {
    opacity: 0.35,
  },
  consoleGhostText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  // ── Compact status bar ───────────────────────────────────────────────────
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 10,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0B1324',
  },
  statusChipWorship: {
    borderColor: '#B45309',
    backgroundColor: '#451A03',
  },
  statusChipLoop: {
    borderColor: '#1D4ED8',
    backgroundColor: '#1E1B4B',
  },
  statusChipQueue: {
    borderColor: '#065F46',
    backgroundColor: '#022C22',
  },
  statusChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  statusSection: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  statusSpacer: { flex: 1 },
  statusNextLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusNextSong: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 140,
  },
  statusLoadBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#4F46E5',
    backgroundColor: '#1E1B4B',
  },
  statusLoadBtnText: {
    color: '#A5B4FC',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  editRehearsalBtn: {
    minWidth: 108,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4F46E5',
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
  },
  editRehearsalBtnText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  transportDeck: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 14,
  },
  transportPill: {
    width: 52,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A3550',
    backgroundColor: '#0B1324',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportPlay: {
    width: 76,
    height: 46,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#4F46E5',
    backgroundColor: '#211A48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportPlayActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#35200C',
  },
  transportPlayText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  transportIcon: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '900',
  },
  transportLoopActive: {
    borderColor: '#34D399',
    backgroundColor: '#08271D',
  },
  transportFreeActive: {
    borderColor: '#C084FC',
    backgroundColor: '#24103C',
  },
  transportDanger: {
    borderColor: '#7F1D1D',
    backgroundColor: '#22090C',
  },
  metricRail: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#24304A',
    backgroundColor: '#091120',
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '900',
  },
  metricLabelTop: {
    color: '#F6C67A',
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  metricLabel: {
    color: '#7183A6',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  metricInput: {
    minWidth: 48,
    paddingVertical: 0,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  keyCard: {
    flex: 1.3,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#24304A',
    backgroundColor: '#091120',
    flexDirection: 'row',
    alignItems: 'center',
  },
  keyStepper: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyStepperText: {
    color: '#818CF8',
    fontSize: 15,
    fontWeight: '900',
  },
  keyCardCenter: {
    flex: 1,
    alignItems: 'center',
  },
  stateMetricCard: {
    backgroundColor: '#111626',
  },
  // ── Toolbar styles (from RehearsalScreen) ──────────────────────────────────
  tbRow3Scroll: { backgroundColor: '#0B1120', borderBottomWidth: 1, borderColor: '#111827' },
  tbRow3Content: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  tbBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  tbBtnText: { color: '#9CA3AF', fontSize: 14, fontWeight: '700' },
  tbPlayBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  tbPlayBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  tbDivider: { width: 1, height: 22, backgroundColor: '#1F2937', marginHorizontal: 2 },
  tbStatusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#1F2937' },
  tbStatusChipText: { color: '#34D399', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  tbMenuPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 8, height: 32, gap: 4 },
  tbMenuPillLabel: { color: '#6B7280', fontSize: 10, fontWeight: '700' },
  tbMenuBpmInput: { color: '#F8FAFC', fontSize: 14, fontWeight: '900', minWidth: 28, textAlign: 'center', paddingVertical: 0 },
  tbMenuBtn: { height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#1F2937', backgroundColor: '#0B1120', alignItems: 'center', justifyContent: 'center' },
  tbMenuBtnText: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },
  tbMenuBtnActive: { backgroundColor: '#1A1A3A', borderColor: '#6366F1' },
  tbRecordRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tbRecordDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4B5563' },
  tbRecordDotActive: { backgroundColor: '#EF4444' },
  tbDropdown: { backgroundColor: '#0B1120', borderBottomWidth: 1, borderColor: '#1F2937', padding: 10 },
  tbDropdownStop: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#EF444440', backgroundColor: '#3A0A0A' },
  tbDropdownInput: { backgroundColor: '#111827', borderRadius: 8, borderWidth: 1, borderColor: '#1F2937', color: '#E5E7EB', fontSize: 12, paddingHorizontal: 10, paddingVertical: 6 },
  tbDropdownAddBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#34D39940', backgroundColor: '#0B2B1A' },
  tbNoteChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#1F2937', backgroundColor: '#0B1120' },
  tbNoteChipText: { color: '#9CA3AF', fontSize: 13, fontWeight: '700' },
  settingsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  settingsPanel: { backgroundColor: '#0B1120', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, borderTopWidth: 1, borderColor: '#1F2937' },
  settingsPanelTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '900', marginBottom: 12 },
  settingsDividerLine: { height: 1, backgroundColor: '#1F2937', marginBottom: 12 },
  settingsActionRow: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#111827' },
  settingsActionText: { color: '#E5E7EB', fontSize: 14, fontWeight: '700' },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    backgroundColor: '#091120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#24304A',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ctrlPill: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlPillActive: {
    backgroundColor: '#1e3a5f',
  },
  ctrlIcon: {
    fontSize: 14,
  },
  ctrlDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#1f2937',
    marginHorizontal: 2,
  },
  ctrlCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 40,
  },
  ctrlValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '900',
  },
  ctrlLabel: {
    color: '#7183A6',
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 1,
  },
  ctrlInput: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    minWidth: 36,
    paddingVertical: 0,
  },
  ctrlTranspose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  ctrlStep: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#1e1b4b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlStepText: {
    color: '#818CF8',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  metricStateValue: {
    color: '#F6C67A',
    fontSize: 17,
    fontWeight: '900',
  },
  sectionRail: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 14,
  },
  sectionCueButton: {
    minWidth: 104,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCueButtonActive: {},
  sectionQueued: {
    borderColor: '#FBBF24',
  },
  sectionLooping: {
    borderColor: '#10B981',
  },
  sectionFree: {
    borderColor: '#C084FC',
  },
  sectionCueText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#E2E8F0',
    letterSpacing: 0.6,
  },
  sectionCueTextActive: {
    color: '#FFFFFF',
  },
  waveHeroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2A3350',
    backgroundColor: '#060D1E',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    marginTop: 16,
  },
  cuePadRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  cuePad: {
    minWidth: 112,
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: '#08111F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  cuePadMarker: {
    backgroundColor: '#111827',
    borderColor: '#F59E0B',
  },
  cuePadQueued: {
    backgroundColor: '#101B30',
    borderStyle: 'dashed',
  },
  cuePadText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  cuePadInput: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    minWidth: 96,
    paddingVertical: 0,
  },
  cuePadEditActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  cuePadEditSaveBtn: {
    minWidth: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#14532D',
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  cuePadEditSaveText: {
    color: '#BBF7D0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cuePadDeleteBtn: {
    minWidth: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3F1720',
    borderWidth: 1,
    borderColor: '#F87171',
  },
  cuePadDeleteText: {
    color: '#FECACA',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cuePadQueueBadge: {
    color: '#FBBF24',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 4,
  },
  cuePadLoopBadge: {
    fontSize: 12,
    marginTop: 4,
  },
  waveHeroHeader: {
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  waveHeroTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '900',
  },
  waveHeroMeta: {
    color: '#7E93BA',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  waveFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  waveFooterTime: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    minWidth: 40,
    textAlign: 'center',
  },
  waveFooterTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#16233B',
  },
  waveFooterProgress: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#38BDF8',
  },
  stemDeckSection: {
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#22304A',
    backgroundColor: 'rgba(6,13,30,0.98)',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  stemDeckHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  stemDeckTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '900',
  },
  stemDeckHint: {
    color: '#8FA2C8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  stemDeckCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0F172A',
  },
  stemDeckCountText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  stemDeckRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
    paddingRight: 8,
  },
  stemStripCard: {
    width: 142,
    minHeight: 286,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: '#091120',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  stemStripCardMuted: {
    backgroundColor: '#0B1324',
    opacity: 0.72,
  },
  stemStripAccent: {
    height: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  stemStripHeader: {
    minHeight: 54,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stemStripLabel: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  stemStripDb: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
  },
  stemStripBody: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 12,
    flex: 1,
  },
  stripMeterColumn: {
    width: 14,
    height: 156,
    justifyContent: 'flex-end',
    gap: 4,
    paddingVertical: 4,
  },
  stripMeterLed: {
    width: '100%',
    height: 8,
    borderRadius: 999,
  },
  stemStripFaderCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flex: 1,
  },
  stemStripAdjustBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stemStripAdjustText: {
    color: '#CBD5E1',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  stemStripFaderRail: {
    width: 36,
    height: 156,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#050B18',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingVertical: 8,
  },
  stemStripFaderTrack: {
    position: 'absolute',
    top: 10,
    bottom: 10,
    width: 8,
    borderRadius: 999,
    backgroundColor: '#16233B',
  },
  stemStripFaderFill: {
    position: 'absolute',
    bottom: 10,
    width: 8,
    borderRadius: 999,
    opacity: 0.95,
  },
  stemStripFaderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    shadowColor: '#020617',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  stemStripVolumeText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    minWidth: 42,
    textAlign: 'center',
  },
  stemStripPanRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 10,
  },
  stemStripMuteBtn: {
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stemStripMuteBtnActive: {
    borderColor: '#EF4444',
    backgroundColor: '#2C1113',
  },
  stemStripMuteText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  stemStripMuteTextActive: {
    color: '#FCA5A5',
  },
  queueRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  queueRowStacked: {
    flexDirection: 'column',
  },
  queueCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#27324A',
    backgroundColor: '#0A1120',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  queueCardWide: {
    flex: 1.15,
  },
  queueEyebrow: {
    color: '#F6C67A',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  queueTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 8,
  },
  queueMeta: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 8,
  },
  queueActionBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4F46E5',
    backgroundColor: '#20193E',
  },
  queueActionText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  quickActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginTop: 16,
  },
  quickAction: {
    minWidth: 112,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  quickExtend: { backgroundColor: '#131A34', borderColor: '#818CF8' },
  quickBreak: { backgroundColor: '#111827', borderColor: '#475569' },
  quickRepeat: { backgroundColor: '#12251B', borderColor: '#34D399' },
  quickSkip: { backgroundColor: '#26101C', borderColor: '#EC4899' },
  quickOutro: { backgroundColor: '#22150A', borderColor: '#F59E0B' },
  quickFinal: { backgroundColor: '#24103C', borderColor: '#C084FC' },
  quickActionText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  engineDeck: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'stretch',
    marginTop: 18,
  },
  engineDeckStacked: {
    flexDirection: 'column',
  },
  sidePanel: {
    flex: 1.15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#27324A',
    backgroundColor: 'rgba(10,17,31,0.94)',
    padding: 14,
  },
  sidePanelStacked: {
    width: '100%',
  },
  sidePanelTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 12,
  },
  sidePanelEmpty: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 20,
  },
  trackControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  trackMuteBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  trackMuteBtnActive: {
    borderColor: '#EF4444',
    backgroundColor: '#2C1113',
  },
  trackMuteText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '900',
  },
  trackControlBody: {
    flex: 1,
  },
  trackControlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  trackLabel: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  trackDb: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 8,
  },
  trackBarRail: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#172033',
    overflow: 'hidden',
  },
  trackBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  trackAdjustBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1324',
  },
  trackAdjustText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '900',
  },
  engineCoreColumn: {
    width: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  engineCoreOrb: {
    width: 208,
    height: 208,
    borderRadius: 104,
    padding: 10,
    backgroundColor: 'rgba(16,24,45,0.98)',
    borderWidth: 2,
    borderColor: '#4F46E5',
    shadowColor: '#38BDF8',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    justifyContent: 'center',
    alignItems: 'center',
  },
  engineCoreOrbFree: {
    borderColor: '#C084FC',
    shadowColor: '#C084FC',
  },
  engineCoreInner: {
    width: '100%',
    height: '100%',
    borderRadius: 92,
    borderWidth: 1,
    borderColor: '#5EEAD4',
    backgroundColor: 'rgba(10,19,38,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  engineCoreTitle: {
    color: '#E0F2FE',
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 27,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  engineCoreState: {
    color: '#FCD34D',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  engineCoreCaption: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 8,
  },
  engineHint: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 220,
  },
  cueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#182338',
  },
  cueDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cueLabel: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  cueValue: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  architectureBand: {
    marginTop: 22,
    marginBottom: 16,
    alignSelf: 'center',
    minWidth: 460,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4F46E5',
    backgroundColor: '#11182B',
  },
  architectureBandText: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  architectureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'center',
  },
  archCard: {
    width: '47%',
    minHeight: 132,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#0A1120',
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  archCardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  archCardTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
    marginLeft: 2,
  },
  archCardLine: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginLeft: 2,
  },
});
