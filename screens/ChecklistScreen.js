import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getServicePlan, getSongs } from '../data/storage';
import { getServices } from '../data/storage';

// ── Storage ───────────────────────────────────────────────────────────────────
const KEY = 'um/checklist/v1';

// ── Base checklist items (always present) ─────────────────────────────────────
const BASE_ITEMS = [
  { id: 'songs',  label: 'Songs added to Service Plan', base: true },
  { id: 'cues',   label: 'Cue stacks reviewed (Intro / Verse / Chorus…)', base: true },
  { id: 'roles',  label: 'Roles assigned (musicians + techs)', base: true },
  { id: 'click',  label: 'Click / Guide tested in Rehearsal', base: true },
  { id: 'pp',     label: 'ProPresenter target set (if enabled)', base: true },
  { id: 'lights', label: 'Lighting target set (if enabled)', base: true },
  { id: 'lock',   label: 'Service locked before going Live', base: true },
];

// ── Theme → suggested checklist item ─────────────────────────────────────────
const THEME_MAP = {
  communion:  { id: 'th_communion',  label: 'Communion elements ready (bread & cup set up)' },
  eucharist:  { id: 'th_communion',  label: 'Communion elements ready (bread & cup set up)' },
  easter:     { id: 'th_easter',     label: 'Easter staging / visual elements confirmed' },
  christmas:  { id: 'th_christmas',  label: 'Christmas staging / visual elements confirmed' },
  baptism:    { id: 'th_baptism',    label: 'Baptism area / pool prepared' },
  healing:    { id: 'th_healing',    label: 'Prayer team briefed and in position' },
  prayer:     { id: 'th_prayer',     label: 'Prayer team briefed and in position' },
  memorial:   { id: 'th_memorial',   label: 'Memorial service materials confirmed' },
  conference: { id: 'th_conference', label: 'Conference schedule / speaker slots confirmed' },
  youth:      { id: 'th_youth',      label: 'Youth setup confirmed (stage, seating, AV)' },
  gospel:     { id: 'th_gospel',     label: 'Salvation / gospel presentation prepared' },
  worship:    { id: 'th_worship',    label: 'Worship flow order confirmed with the band' },
  dedication: { id: 'th_dedication', label: 'Baby / building dedication elements prepared' },
  outreach:   { id: 'th_outreach',   label: 'Outreach materials / guest welcome confirmed' },
};

// ── Service-type suggestions ──────────────────────────────────────────────────
const SERVICE_TYPE_MAP = {
  communion:  'th_communion',
  easter:     'th_easter',
  christmas:  'th_christmas',
  conference: 'th_conference',
  youth:      'th_youth',
  rehearsal:  { id: 'th_rehearsal', label: 'All musicians have received chord charts' },
};

// ── Derive suggestions from service + song tags ───────────────────────────────
function buildSuggestions(serviceType, songTagsList) {
  const seen = new Set();
  const results = [];

  function add(item) {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    results.push({ ...item, suggested: true, done: false });
  }

  // From service type
  const stEntry = SERVICE_TYPE_MAP[serviceType];
  if (stEntry) {
    if (typeof stEntry === 'string') {
      add(Object.values(THEME_MAP).find((v) => v.id === stEntry));
    } else {
      add(stEntry);
    }
  }

  // From each song's tags
  for (const rawTags of songTagsList) {
    const tags = (rawTags || '')
      .toLowerCase()
      .split(/[,;/\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    for (const tag of tags) {
      if (THEME_MAP[tag]) add(THEME_MAP[tag]);
    }
  }

  return results;
}

// ── Load + merge persisted state with suggestions ─────────────────────────────
async function loadChecklist() {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

async function saveChecklist(items) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function ChecklistScreen({ route }) {
  const { serviceId } = route?.params || {};

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [detectedThemes, setDetectedThemes] = useState([]);

  useEffect(() => {
    (async () => {
      // 1. Load persisted checklist
      const persisted = await loadChecklist(); // array of { id, label, done, suggested? }

      // 2. Pull active service type
      let serviceType = null;
      const songTagsList = [];
      try {
        const services = await getServices();
        const svc = serviceId
          ? services.find((s) => s.id === serviceId)
          : services[0] || null;
        if (svc) serviceType = svc.serviceType || null;
      } catch { /* ignore */ }

      // 3. Pull songs from current service plan and get their tags
      try {
        const plan = await getServicePlan();
        const planItems = plan?.items || [];
        if (planItems.length > 0) {
          const allSongs = await getSongs();
          for (const item of planItems) {
            const song = allSongs.find((s) => s.id === item.songId);
            if (song?.tags) songTagsList.push(song.tags);
          }
        }
      } catch { /* ignore */ }

      // 4. Build suggestions
      const suggestions = buildSuggestions(serviceType, songTagsList);
      const themeLabels = suggestions.map((s) => s.label.split(' ')[0].replace(/[^a-zA-Z]/g, ''));
      // Collect human-readable theme names from what was matched
      const detectedNames = [];
      if (serviceType && SERVICE_TYPE_MAP[serviceType]) detectedNames.push(serviceType);
      for (const tags of songTagsList) {
        (tags || '').toLowerCase().split(/[,;/\s]+/).forEach((t) => {
          const tt = t.trim();
          if (THEME_MAP[tt] && !detectedNames.includes(tt)) detectedNames.push(tt);
        });
      }
      setDetectedThemes(detectedNames);

      // 5. Merge: start with suggestions, then base items, preserving persisted done states
      const persistedMap = {};
      if (persisted) {
        for (const p of persisted) persistedMap[p.id] = p.done;
      }

      const merged = [
        ...suggestions.map((s) => ({ ...s, done: persistedMap[s.id] ?? false })),
        ...BASE_ITEMS.map((b) => ({ ...b, done: persistedMap[b.id] ?? false })),
      ];

      setItems(merged);
      // Save merged back so new suggestions are persisted
      await saveChecklist(merged);
      setLoading(false);
    })();
  }, [serviceId]);

  async function toggle(id) {
    const next = items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
    setItems(next);
    await saveChecklist(next);
  }

  async function resetAll() {
    const next = items.map((i) => ({ ...i, done: false }));
    setItems(next);
    await saveChecklist(next);
  }

  const doneCount = items.filter((i) => i.done).length;
  const suggested = items.filter((i) => i.suggested);
  const standard = items.filter((i) => !i.suggested);
  const allDone = doneCount === items.length && items.length > 0;

  if (loading) {
    return (
      <View style={styles.root}>
        <ActivityIndicator color="#818CF8" style={{ marginTop: 60 }} />
        <Text style={styles.loadingText}>Building your checklist…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Pre‑Live Checklist</Text>

        {/* Progress bar */}
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${items.length > 0 ? (doneCount / items.length) * 100 : 0}%` },
                allDone && { backgroundColor: '#4ADE80' },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {doneCount}/{items.length}{allDone ? '  ✓ Ready' : ''}
          </Text>
        </View>

        {/* Theme context badge */}
        {detectedThemes.length > 0 && (
          <View style={styles.themesBadge}>
            <Text style={styles.themesIcon}>✦</Text>
            <Text style={styles.themesText}>
              Auto-suggested for:{' '}
              <Text style={styles.themesHighlight}>
                {detectedThemes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')}
              </Text>
            </Text>
          </View>
        )}

        {/* ── Suggested items ── */}
        {suggested.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>✦ Suggested for this service</Text>
            {suggested.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => toggle(item.id)}
                style={[styles.item, item.done ? styles.itemDoneSuggested : styles.itemSuggested]}
              >
                <Text style={styles.itemCheck}>{item.done ? '✅' : '◇'}</Text>
                <Text style={[styles.itemLabel, item.done && styles.itemLabelDone]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </>
        )}

        {/* ── Standard checklist ── */}
        <Text style={[styles.sectionLabel, { marginTop: suggested.length > 0 ? 18 : 4 }]}>
          Standard Checklist
        </Text>
        {standard.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => toggle(item.id)}
            style={[styles.item, item.done ? styles.itemDone : styles.itemDefault]}
          >
            <Text style={styles.itemCheck}>{item.done ? '✅' : '⬜️'}</Text>
            <Text style={[styles.itemLabel, item.done && styles.itemLabelDone]}>
              {item.label}
            </Text>
          </Pressable>
        ))}

        {/* Reset */}
        <Pressable style={styles.resetBtn} onPress={resetAll}>
          <Text style={styles.resetText}>Reset all</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  container: { padding: 20, paddingBottom: 50 },

  heading: { color: '#F9FAFB', fontSize: 26, fontWeight: '900', marginBottom: 14 },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  progressTrack: {
    flex: 1, height: 6, borderRadius: 3, backgroundColor: '#1F2937', overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#818CF8' },
  progressLabel: { color: '#9CA3AF', fontSize: 13, fontWeight: '700', minWidth: 70 },

  themesBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#1E1B4B',
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  themesIcon: { color: '#818CF8', fontSize: 14, marginTop: 1 },
  themesText: { color: '#9CA3AF', fontSize: 13, flex: 1, lineHeight: 20 },
  themesHighlight: { color: '#C4B5FD', fontWeight: '700' },

  sectionLabel: {
    color: '#6B7280', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemDefault:  { backgroundColor: '#0B1220', borderColor: '#1F2937' },
  itemDone:     { backgroundColor: '#052E16', borderColor: '#166534' },
  itemSuggested:  { backgroundColor: '#1C1030', borderColor: '#4338CA55' },
  itemDoneSuggested: { backgroundColor: '#052E16', borderColor: '#166534' },

  itemCheck: { fontSize: 16, marginTop: 1 },
  itemLabel: { color: '#E5E7EB', fontWeight: '600', fontSize: 14, flex: 1, lineHeight: 20 },
  itemLabelDone: { color: '#6B7280', textDecorationLine: 'line-through' },

  resetBtn: {
    marginTop: 24, alignSelf: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1, borderColor: '#374151',
  },
  resetText: { color: '#6B7280', fontSize: 13 },

  loadingText: { color: '#6B7280', textAlign: 'center', marginTop: 12, fontSize: 13 },
});
