/**
 * SongMapScreen — visual song structure map showing sections
 * (Intro, Verse, Chorus, Bridge, Outro) with chords and timing.
 * Receives { song } from route params.
 */
import React, { useMemo } from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SECTION_COLORS = {
  'intro':   { bg: '#1E3A5F', border: '#3B82F6', label: '#93C5FD' },
  'verse':   { bg: '#1A2E1A', border: '#22C55E', label: '#86EFAC' },
  'chorus':  { bg: '#2D1B4E', border: '#8B5CF6', label: '#C4B5FD' },
  'bridge':  { bg: '#3D1A00', border: '#F59E0B', label: '#FCD34D' },
  'pre':     { bg: '#1A2A3D', border: '#06B6D4', label: '#67E8F9' },
  'tag':     { bg: '#1E1A2E', border: '#A78BFA', label: '#DDD6FE' },
  'outro':   { bg: '#1A1A2E', border: '#6366F1', label: '#A5B4FC' },
  'channel': { bg: '#2A1A1A', border: '#EF4444', label: '#FCA5A5' },
  'default': { bg: '#111827', border: '#374151', label: '#9CA3AF' },
};

function getSectionColor(sectionName) {
  const lower = (sectionName || '').toLowerCase();
  for (const key of Object.keys(SECTION_COLORS)) {
    if (lower.includes(key)) return SECTION_COLORS[key];
  }
  return SECTION_COLORS.default;
}

function parseSections(chordChart) {
  if (!chordChart) return [];
  const lines  = chordChart.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) { current.lines.push(''); }
      continue;
    }
    // Detect section headers (ALL CAPS words, or common section keywords)
    const isHeader =
      /^(Intro|Verse|Chorus|Bridge|Outro|Pre-Chorus|Tag|Channel|Refr|Coro|Estrofe|Ponte|Alt Chorus)/i.test(trimmed) ||
      /^[A-Z\s\d]+$/.test(trimmed) && trimmed.length < 30;

    if (isHeader) {
      if (current) sections.push(current);
      current = { name: trimmed, lines: [] };
    } else if (current) {
      current.lines.push(trimmed);
    } else {
      current = { name: 'Intro', lines: [trimmed] };
    }
  }
  if (current) sections.push(current);
  return sections.filter(s => s.lines.some(l => l.trim()));
}

export default function SongMapScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { song } = route.params || {};

  const sections = useMemo(
    () => parseSections(song?.chordChart || song?.lyrics || ''),
    [song]
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title} numberOfLines={1}>{song?.title || 'Song Map'}</Text>
          <Text style={s.meta}>{song?.artist || ''}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Key / BPM / Sig row */}
      <View style={s.infoRow}>
        {song?.key   ? <View style={s.badge}><Text style={s.badgeText}>Key {song.key}</Text></View>   : null}
        {song?.bpm   ? <View style={s.badge}><Text style={s.badgeText}>{song.bpm} BPM</Text></View>   : null}
        {song?.timeSig ? <View style={s.badge}><Text style={s.badgeText}>{song.timeSig}</Text></View> : null}
        <View style={[s.badge, { borderColor: '#6366F1' }]}>
          <Text style={[s.badgeText, { color: '#A5B4FC' }]}>{sections.length} sections</Text>
        </View>
      </View>

      {sections.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🗺</Text>
          <Text style={s.emptyTitle}>No chord chart available</Text>
          <Text style={s.emptyCaption}>Add a chord chart to this song to see the map.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.mapContainer}>
          {/* Flow diagram */}
          <View style={s.flowRow}>
            {sections.map((sec, i) => {
              const col = getSectionColor(sec.name);
              return (
                <React.Fragment key={i}>
                  <View style={[s.sectionBlock, { backgroundColor: col.bg, borderColor: col.border }]}>
                    <Text style={[s.sectionLabel, { color: col.label }]}>{sec.name}</Text>
                    <Text style={s.sectionLineCount}>{sec.lines.filter(l => l.trim()).length} lines</Text>
                  </View>
                  {i < sections.length - 1 && (
                    <Text style={s.arrow}>→</Text>
                  )}
                </React.Fragment>
              );
            })}
          </View>

          {/* Detail cards */}
          {sections.map((sec, i) => {
            const col = getSectionColor(sec.name);
            const content = sec.lines.filter(l => l.trim()).join('\n');
            return (
              <View key={i} style={[s.detailCard, { borderColor: col.border }]}>
                <View style={[s.detailHeader, { backgroundColor: col.bg }]}>
                  <Text style={[s.detailTitle, { color: col.label }]}>{sec.name}</Text>
                </View>
                <Text style={s.detailContent} selectable>{content}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#020617' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1E2740' },
  back:         { fontSize: 15, color: '#8B5CF6', fontWeight: '600', minWidth: 60 },
  headerCenter: { flex: 1, alignItems: 'center' },
  title:        { fontSize: 16, fontWeight: '800', color: '#F9FAFB' },
  meta:         { fontSize: 12, color: '#6B7280', marginTop: 1 },
  infoRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#0F172A' },
  badge:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#374151', backgroundColor: '#0B1120' },
  badgeText:    { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon:    { fontSize: 56, marginBottom: 16 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: '#F3F4F6', marginBottom: 8 },
  emptyCaption: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  mapContainer: { padding: 16, paddingBottom: 60 },
  flowRow:      { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 24, padding: 12, backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#1E2740' },
  sectionBlock: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  sectionLabel: { fontSize: 12, fontWeight: '700' },
  sectionLineCount: { fontSize: 10, color: '#6B7280', marginTop: 2 },
  arrow:        { fontSize: 14, color: '#374151', marginHorizontal: 2 },
  detailCard:   { borderWidth: 1, borderRadius: 10, marginBottom: 12, overflow: 'hidden' },
  detailHeader: { paddingHorizontal: 14, paddingVertical: 8 },
  detailTitle:  { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailContent:{ padding: 14, fontFamily: 'Courier', fontSize: 13, color: '#D1D5DB', lineHeight: 20, backgroundColor: '#050B18' },
});
