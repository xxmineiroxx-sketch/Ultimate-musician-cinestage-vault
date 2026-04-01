
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * One global waveform-style timeline, like Multitracks:
 * - Single horizontal bar representing the whole song
 * - Section markers as labeled segments
 * This is purely visual; actual audio waveform rendering can be added later.
 */
export default function WaveformTimeline({ sections = [], lengthSeconds = 0, currentSection }) {
  const total = lengthSeconds || 1;
  const sorted = [...sections].sort((a, b) => (a.positionSeconds || 0) - (b.positionSeconds || 0));

  // Build segments from section start times
  const segments = [];
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const next = sorted[i + 1];
    const start = s.positionSeconds || 0;
    const end = next ? next.positionSeconds || total : total;
    const widthPct = Math.max(8, ((end - start) / total) * 100);
    segments.push({
      label: s.label || 'SECTION',
      width: widthPct,
      active: currentSection === s.label,
    });
  }

  if (!segments.length) {
    segments.push({ label: 'INTRO', width: 100, active: true });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.caption}>Song Timeline</Text>
      <View style={styles.waveBar}>
        {segments.map((seg, idx) => (
          <View
            key={seg.label + idx}
            style={[
              styles.segment,
              { flexBasis: seg.width + '%' },
              seg.active && styles.segmentActive,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.segmentLabel, seg.active && styles.segmentLabelActive]}
            >
              {seg.label.replace('_', ' ')}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.lengthText}>
        {Math.round(total)}s total
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    marginBottom: 12,
  },
  caption: {
    color: '#9CA3AF',
    fontSize: 11,
    marginBottom: 4,
  },
  waveBar: {
    flexDirection: 'row',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#111827',
    minHeight: 32,
  },
  segment: {
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#111827',
    backgroundColor: '#0B1120',
  },
  segmentActive: {
    backgroundColor: '#4F46E5',
  },
  segmentLabel: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  segmentLabelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  lengthText: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 4,
  },
});
