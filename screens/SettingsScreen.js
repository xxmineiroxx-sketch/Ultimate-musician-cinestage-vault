import React, { useEffect, useState } from "react";
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { ensureSeeded, getSettings, saveSettings, resetAll } from "../data/storage";
import {
  ROUTING_TRACKS, OUTPUT_COLORS, getOutputOptions, makeDefaultSettings, LYRIC_SOFTWARE_OPTIONS,
} from "../data/models";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function outputColor(val) {
  return OUTPUT_COLORS[val] || '#6B7280';
}

// ─── Components ───────────────────────────────────────────────────────────────
function Toggle({ title, value, onToggle }) {
  return (
    <Pressable onPress={onToggle} style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      <View style={[styles.togglePill, value && styles.togglePillOn]}>
        <Text style={[styles.toggleText, value && styles.toggleTextOn]}>
          {value ? 'ON' : 'OFF'}
        </Text>
      </View>
    </Pressable>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// Output selector for routing — shows a modal picker
function RoutingPicker({ label, value, options, onChange, isOverride }) {
  const [open, setOpen] = useState(false);
  const color = outputColor(value);
  return (
    <>
      <TouchableOpacity style={styles.routingRow} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={styles.routingRowLabel}>{label}</Text>
        <View style={[styles.routingValueBadge, { borderColor: color + '66', backgroundColor: color + '15' }]}>
          <Text style={[styles.routingValueText, { color }]}>{value}</Text>
          <Text style={[styles.routingChevron, { color }]}>▾</Text>
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{label}</Text>
            {options.map((opt) => {
              const c = outputColor(opt);
              const active = value === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.pickerOption, active && { backgroundColor: c + '20', borderColor: c + '55' }]}
                  onPress={() => { onChange(opt); setOpen(false); }}
                >
                  <View style={[styles.pickerDot, { backgroundColor: active ? c : '#374151' }]} />
                  <Text style={[styles.pickerOptionText, active && { color: c, fontWeight: '800' }]}>
                    {opt}
                  </Text>
                  {active && <Text style={[styles.pickerCheck, { color: c }]}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const [s, setS] = useState(null);

  useEffect(() => {
    (async () => {
      await ensureSeeded();
      const loaded = await getSettings();
      // Ensure routing defaults are present
      const defaults = makeDefaultSettings();
      setS({
        ...loaded,
        routing: {
          interfaceChannels: loaded.routing?.interfaceChannels ?? defaults.routing.interfaceChannels,
          global: { ...defaults.routing.global, ...(loaded.routing?.global || {}) },
        },
      });
    })();
  }, []);

  if (!s) {
    return (
      <View style={{ flex: 1, backgroundColor: '#020617', padding: 20 }}>
        <Text style={{ color: '#fff' }}>Loading settings…</Text>
      </View>
    );
  }

  async function update(next) {
    setS(next);
    await saveSettings(next);
  }

  function updateRouting(changes) {
    update({ ...s, routing: { ...s.routing, ...changes } });
  }

  function updateRoutingGlobal(trackKey, value) {
    update({
      ...s,
      routing: {
        ...s.routing,
        global: { ...s.routing.global, [trackKey]: value },
      },
    });
  }

  const channels = s.routing.interfaceChannels;
  const outputOpts = getOutputOptions(channels);

  // Group routing tracks by category
  const groups = ['Timing', 'Instruments', 'Mix'];

  return (
    <View style={{ flex: 1, backgroundColor: '#020617' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Settings</Text>

        {/* ── Audio ─────────────────────────────────────────── */}
        <Section title="Audio">
          <Toggle
            title="Click Enabled"
            value={s.audio?.clickEnabled ?? true}
            onToggle={() => update({ ...s, audio: { ...s.audio, clickEnabled: !s.audio?.clickEnabled } })}
          />
          <Toggle
            title="Guide Enabled"
            value={s.audio?.guideEnabled ?? true}
            onToggle={() => update({ ...s, audio: { ...s.audio, guideEnabled: !s.audio?.guideEnabled } })}
          />
          <Pressable
            style={styles.row}
            onPress={() => update({ ...s, audio: { ...s.audio, countInBars: (s.audio?.countInBars ?? 1) === 1 ? 2 : 1 } })}
          >
            <Text style={styles.rowTitle}>Count-in Bars</Text>
            <Text style={styles.rowValue}>{s.audio?.countInBars ?? 1}</Text>
          </Pressable>
        </Section>

        {/* ── Audio Routing ─────────────────────────────────── */}
        <Section title="Audio Routing">
          <Text style={styles.routingNote}>
            Map each track type to an output on your audio interface. Set global defaults here; override per song in Song Detail.
          </Text>

          {/* Interface channel count */}
          <Text style={styles.routingGroupLabel}>Interface Channels</Text>
          <View style={styles.chipsRow}>
            {[2, 4, 6, 8].map((ch) => (
              <TouchableOpacity
                key={ch}
                style={[styles.chChip, channels === ch && styles.chChipActive]}
                onPress={() => updateRouting({ interfaceChannels: ch })}
              >
                <Text style={[styles.chChipText, channels === ch && styles.chChipTextActive]}>
                  {ch}ch
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Global defaults grouped */}
          <Text style={styles.routingGroupLabel}>Global Defaults</Text>
          <View style={styles.routingCard}>
            {groups.map((group, gi) => {
              const tracksInGroup = ROUTING_TRACKS.filter((t) => t.group === group);
              return (
                <View key={group}>
                  {gi > 0 && <View style={styles.routingDivider} />}
                  <Text style={styles.routingGroupName}>{group}</Text>
                  {tracksInGroup.map((track) => (
                    <RoutingPicker
                      key={track.key}
                      label={track.label}
                      value={s.routing.global[track.key] || 'Main L/R'}
                      options={outputOpts}
                      onChange={(v) => updateRoutingGlobal(track.key, v)}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        </Section>

        {/* ── Lighting ──────────────────────────────────────── */}
        <Section title="Lighting">
          <Toggle
            title="Lighting Cues Enabled"
            value={s.lighting?.enabled ?? false}
            onToggle={() => update({ ...s, lighting: { ...s.lighting, enabled: !s.lighting?.enabled } })}
          />
          <Text style={styles.fieldLabel}>Target (MIDI/OSC):</Text>
          <TextInput
            value={s.lighting?.target ?? ''}
            onChangeText={(v) => update({ ...s, lighting: { ...s.lighting, target: v } })}
            placeholder="e.g. midi://IAC Driver or osc://10.0.0.5:8000"
            placeholderTextColor="#4B5563"
            style={styles.input}
          />
        </Section>

        {/* ── Lyric Software ────────────────────────────────── */}
        <Section title="Lyric Software">
          {(() => {
            const pp = s.proPresenter || {};
            const selectedId = pp.software || 'propresenter7';
            const selectedSw = LYRIC_SOFTWARE_OPTIONS.find((o) => o.id === selectedId) || LYRIC_SOFTWARE_OPTIONS[0];
            const isCustomOsc = selectedId === 'custom_osc';
            const isCustomMidi = selectedId === 'custom_midi';
            const isMidi = selectedSw.protocol === 'MIDI';

            function updatePP(changes) {
              update({ ...s, proPresenter: { ...pp, ...changes } });
            }

            return (
              <>
                <Toggle
                  title="Cue Sync Enabled"
                  value={pp.enabled ?? false}
                  onToggle={() => updatePP({ enabled: !pp.enabled })}
                />

                <Text style={styles.fieldLabel}>Software</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 14 }}
                  contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                >
                  {LYRIC_SOFTWARE_OPTIONS.map((opt) => {
                    const active = selectedId === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.swChip, active && styles.swChipActive]}
                        onPress={() => updatePP({ software: opt.id })}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.swChipText, active && styles.swChipTextActive]}>
                          {opt.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Protocol hint */}
                <View style={styles.swHintRow}>
                  <Text style={styles.swHintProtocol}>{selectedSw.protocol}</Text>
                  <Text style={styles.swHintPath}>{selectedSw.hint}</Text>
                </View>

                {/* Custom OSC path */}
                {isCustomOsc && (
                  <>
                    <Text style={styles.fieldLabel}>OSC Path Template</Text>
                    <TextInput
                      value={pp.oscPath ?? ''}
                      onChangeText={(v) => updatePP({ oscPath: v })}
                      placeholder="/slide/{index}  or  /cue/{name}"
                      placeholderTextColor="#4B5563"
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Text style={styles.swSubNote}>Use {'{index}'} for 0-based index, {'{name}'} for section name</Text>
                  </>
                )}

                {/* MIDI channel */}
                {isMidi && (
                  <>
                    <Text style={styles.fieldLabel}>MIDI Channel (1–16)</Text>
                    <TextInput
                      value={String(pp.midiChannel ?? 1)}
                      onChangeText={(v) => updatePP({ midiChannel: Math.max(1, Math.min(16, Number(v.replace(/\D/g, '')) || 1)) })}
                      placeholder="1"
                      placeholderTextColor="#4B5563"
                      style={[styles.input, { width: 80 }]}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </>
                )}

                {/* Target host */}
                <Text style={styles.fieldLabel}>
                  {isMidi ? 'MIDI Interface / Host' : 'Host IP or URL'}
                </Text>
                <TextInput
                  value={pp.target ?? ''}
                  onChangeText={(v) => updatePP({ target: v })}
                  placeholder={
                    isMidi
                      ? 'e.g. IAC Driver Bus 1  or  10.0.0.9'
                      : selectedId === 'openlp'
                      ? 'http://10.0.0.9:4316'
                      : '10.0.0.9'
                  }
                  placeholderTextColor="#4B5563"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            );
          })()}
        </Section>

        {/* ── Sync ──────────────────────────────────────────── */}
        <Section title="Sync">
          <Text style={styles.fieldLabel}>WebSocket URL:</Text>
          <TextInput
            value={s.sync?.wsUrl ?? ''}
            onChangeText={(v) => update({ ...s, sync: { ...s.sync, wsUrl: v } })}
            placeholder="ws://10.x.x.x:8000/ws"
            placeholderTextColor="#4B5563"
            style={styles.input}
          />
          <Toggle
            title="Debug Sync Logs"
            value={s.sync?.debug ?? false}
            onToggle={() => update({ ...s, sync: { ...s.sync, debug: !s.sync?.debug } })}
          />
        </Section>

        {/* ── General ───────────────────────────────────────── */}
        <Section title="General">
          <Pressable
            style={styles.row}
            onPress={() => update({ ...s, general: { ...s.general, language: (s.general?.language ?? 'en') === 'en' ? 'pt' : 'en' } })}
          >
            <Text style={styles.rowTitle}>Language</Text>
            <Text style={styles.rowValue}>{s.general?.language ?? 'en'}</Text>
          </Pressable>
          <Pressable
            style={styles.row}
            onPress={() => update({ ...s, general: { ...s.general, theme: (s.general?.theme ?? 'dark') === 'dark' ? 'light' : 'dark' } })}
          >
            <Text style={styles.rowTitle}>Theme</Text>
            <Text style={styles.rowValue}>{s.general?.theme ?? 'dark'}</Text>
          </Pressable>
          <Pressable
            onPress={async () => { await resetAll(); setS(await getSettings()); }}
            style={styles.resetBtn}
          >
            <Text style={styles.resetBtnText}>Reset Demo Data</Text>
          </Pressable>
        </Section>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  heading: { color: '#F9FAFB', fontSize: 26, fontWeight: '900', marginBottom: 4 },

  section: { marginTop: 24 },
  sectionTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '900', marginBottom: 12 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#1F2937',
    backgroundColor: '#0B1220', marginBottom: 8,
  },
  rowTitle: { color: '#E5E7EB', fontWeight: '700', fontSize: 14 },
  rowValue: { color: '#9CA3AF', fontSize: 14 },

  togglePill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1, borderColor: '#374151', backgroundColor: 'transparent',
  },
  togglePillOn: { backgroundColor: '#14532D', borderColor: '#16A34A' },
  toggleText: { color: '#6B7280', fontWeight: '800', fontSize: 12 },
  toggleTextOn: { color: '#4ADE80' },

  fieldLabel: { color: '#6B7280', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 8 },
  input: {
    color: '#F9FAFB', borderWidth: 1, borderColor: '#1F2937', borderRadius: 12,
    padding: 12, backgroundColor: '#0B1220', marginBottom: 8,
  },

  // Audio Routing
  routingNote: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginBottom: 14 },
  routingGroupLabel: { color: '#9CA3AF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  chChip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12,
    borderWidth: 1, borderColor: '#374151', backgroundColor: 'transparent',
  },
  chChipActive: { backgroundColor: '#312E81', borderColor: '#4F46E5' },
  chChipText: { color: '#9CA3AF', fontWeight: '800', fontSize: 14 },
  chChipTextActive: { color: '#A5B4FC' },

  routingCard: {
    borderRadius: 14, borderWidth: 1, borderColor: '#1F2937',
    backgroundColor: '#0B1220', overflow: 'hidden',
  },
  routingDivider: { height: 1, backgroundColor: '#1F2937' },
  routingGroupName: {
    color: '#4B5563', fontSize: 10, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
  },
  routingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: '#0F1829',
  },
  routingRowLabel: { color: '#E5E7EB', fontWeight: '700', fontSize: 14 },
  routingValueBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  routingValueText: { fontWeight: '800', fontSize: 12 },
  routingChevron: { fontSize: 10 },

  // Picker modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
  },
  pickerCard: {
    width: 260, backgroundColor: '#0F172A', borderRadius: 18,
    borderWidth: 1, borderColor: '#1F2937', padding: 16,
  },
  pickerTitle: { color: '#9CA3AF', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10,
    borderWidth: 1, borderColor: 'transparent', marginBottom: 4,
  },
  pickerDot: { width: 8, height: 8, borderRadius: 4 },
  pickerOptionText: { color: '#9CA3AF', fontSize: 14, flex: 1 },
  pickerCheck: { fontWeight: '800', fontSize: 14 },

  // Lyric Software picker
  swChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#374151', backgroundColor: 'transparent',
  },
  swChipActive: { backgroundColor: '#0F2822', borderColor: '#059669' },
  swChipText: { color: '#9CA3AF', fontWeight: '700', fontSize: 13 },
  swChipTextActive: { color: '#34D399' },
  swHintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#060D1A', borderRadius: 8,
    borderWidth: 1, borderColor: '#1F2937',
    padding: 10, marginBottom: 14,
  },
  swHintProtocol: {
    color: '#6B7280', fontSize: 10, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 1,
    backgroundColor: '#1F2937', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  swHintPath: { color: '#4B5563', fontSize: 11, fontFamily: 'monospace', flex: 1 },
  swSubNote: { color: '#4B5563', fontSize: 11, marginTop: -4, marginBottom: 12, lineHeight: 16 },

  // Reset
  resetBtn: {
    marginTop: 8, padding: 13, borderRadius: 12,
    backgroundColor: '#3F0A0A', borderWidth: 1, borderColor: '#EF4444',
  },
  resetBtnText: { color: '#FCA5A5', fontWeight: '900', textAlign: 'center' },
});
