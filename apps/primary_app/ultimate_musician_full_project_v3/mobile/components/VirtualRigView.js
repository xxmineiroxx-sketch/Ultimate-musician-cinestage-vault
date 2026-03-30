import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

const NordSection = ({ title, active, patches = [], color = '#EF4444' }) => {
  return (
    <View style={[styles.rigSection, active && { borderColor: color }]}>
      <View style={[styles.sectionHeader, { backgroundColor: active ? color : '#1E293B' }]}>
        <Text style={[styles.sectionHeaderText, active && { color: '#FFF' }]}>{title.toUpperCase()}</Text>
      </View>
      <View style={styles.sectionBody}>
        {patches.length === 0 ? (
          <Text style={styles.emptyText}>EMPTY</Text>
        ) : (
          patches.map((p, i) => (
            <View key={i} style={styles.patchRow}>
              <View style={[styles.indicator, { backgroundColor: p.enabled ? color : '#334155' }]} />
              <Text style={[styles.patchName, !p.enabled && styles.disabledText]} numberOfLines={1}>
                {p.patch_name || 'No Patch'}
              </Text>
              {p.enabled && <Text style={styles.volText}>{p.volume}%</Text>}
            </View>
          ))
        )}
      </View>
    </View>
  );
};

const MODXPart = ({ part }) => {
  const active = part.enabled;
  const color = '#38BDF8';
  return (
    <View style={[styles.modxPart, active && styles.modxPartActive]}>
      <Text style={styles.partNum}>{part.part_number}</Text>
      <View style={styles.partDetails}>
        <Text style={[styles.partName, !active && styles.disabledText]} numberOfLines={1}>
          {part.patch_name || 'PART ' + part.part_number}
        </Text>
        {active && (
          <View style={styles.partMeta}>
            <View style={styles.levelBarContainer}>
              <View style={[styles.levelBar, { width: `${part.volume}%` }]} />
            </View>
            <Text style={styles.partMetaText}>{part.volume}%</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default function VirtualRigView({ deviceData = {}, type = 'nord' }) {
  if (type === 'nord_stage_4' || type === 'nord') {
    const data = deviceData || {};
    return (
      <View style={styles.container}>
        <View style={styles.rigHeader}>
          <Text style={styles.rigBrand}>NORD</Text>
          <Text style={styles.rigModel}>STAGE 4</Text>
          <View style={styles.programBadge}>
            <Text style={styles.programText}>P.{data.program_number || '1'}</Text>
          </View>
        </View>
        
        <View style={styles.nordGrid}>
          <NordSection 
            title="Piano" 
            active={data.piano_1?.enabled || data.piano_2?.enabled}
            color="#EF4444"
            patches={[
              { ...data.piano_1, label: 'P1' },
              { ...data.piano_2, label: 'P2' }
            ].filter(p => p.patch_name || p.enabled)}
          />
          <NordSection 
            title="Synth" 
            active={data.synth_1?.enabled || data.synth_2?.enabled || data.synth_3?.enabled}
            color="#A855F7"
            patches={[
              { ...data.synth_1, label: 'S1' },
              { ...data.synth_2, label: 'S2' },
              { ...data.synth_3, label: 'S3' }
            ].filter(p => p.patch_name || p.enabled)}
          />
          <NordSection 
            title="Organ" 
            active={data.organ_1?.enabled || data.organ_2?.enabled}
            color="#F97316"
            patches={[
              { ...data.organ_1, patch_name: 'B3 Organ', label: 'O1' },
              { ...data.organ_2, patch_name: 'Vox Organ', label: 'O2' }
            ].filter(p => p.enabled)}
          />
        </View>
      </View>
    );
  }

  if (type === 'modx') {
    const data = deviceData || { parts: [] };
    return (
      <View style={styles.container}>
        <View style={styles.rigHeader}>
          <Text style={[styles.rigBrand, { color: '#38BDF8' }]}>YAMAHA</Text>
          <Text style={styles.rigModel}>MODX</Text>
          <View style={[styles.programBadge, { borderColor: '#38BDF8' }]}>
            <Text style={[styles.programText, { color: '#38BDF8' }]}>PERF.{data.performance_number || '1'}</Text>
          </View>
        </View>

        <View style={styles.modxPartsGrid}>
          {data.parts && data.parts.length > 0 ? (
            data.parts.map((p, i) => <MODXPart key={i} part={p} />)
          ) : (
            <Text style={styles.emptyText}>NO PERFORMANCE DATA</Text>
          )}
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginVertical: 10,
  },
  rigHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 15,
  },
  rigBrand: {
    fontSize: 10,
    fontWeight: '900',
    color: '#EF4444',
    letterSpacing: 1,
  },
  rigModel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  programBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  programText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
  },
  nordGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  rigSection: {
    flex: 1,
    backgroundColor: '#020617',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  sectionHeader: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  sectionHeaderText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
  },
  sectionBody: {
    padding: 8,
    minHeight: 60,
  },
  patchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  patchName: {
    fontSize: 10,
    color: '#F1F5F9',
    fontWeight: '600',
    flex: 1,
  },
  volText: {
    fontSize: 8,
    color: '#94A3B8',
    fontWeight: '700',
  },
  disabledText: {
    color: '#334155',
  },
  emptyText: {
    fontSize: 9,
    color: '#334155',
    textAlign: 'center',
    marginTop: 20,
    fontWeight: '800',
  },
  modxPartsGrid: {
    gap: 8,
  },
  modxPart: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#020617',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 12,
  },
  modxPartActive: {
    borderColor: '#38BDF833',
  },
  partNum: {
    fontSize: 14,
    fontWeight: '900',
    color: '#334155',
  },
  partDetails: {
    flex: 1,
  },
  partName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  partMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  levelBarContainer: {
    flex: 1,
    height: 3,
    backgroundColor: '#1E293B',
    borderRadius: 2,
  },
  levelBar: {
    height: '100%',
    backgroundColor: '#38BDF8',
    borderRadius: 2,
  },
  partMetaText: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
  },
});
