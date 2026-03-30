import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DeviceStatusHub from '../components/DeviceStatusHub';
import StemWaveformView from '../components/StemWaveformView';
import VirtualRigView from '../components/VirtualRigView';

const { width } = Dimensions.get('window');

export default function LivePerformanceScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { song } = route.params || {};

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSection, setCurrentSection] = useState('INTRO');
  const [nextSection, setNextSection] = useState('VERSE 1');
  const [countdown, setCountdown] = useState(8);
  
  // Mock device status
  const [devices] = useState({
    nord: 'ready',
    modx: 'ready',
    ableton: 'connected'
  });

  // Mock Nord data
  const [nordData] = useState({
    program_number: 42,
    piano_1: { enabled: true, patch_name: 'Bright Grand', volume: 85 },
    synth_1: { enabled: true, patch_name: 'Warm Pad', volume: 60 },
    synth_2: { enabled: false, patch_name: 'Lead', volume: 0 },
    organ_1: { enabled: false, volume: 0 },
  });

  // Mock MODX data
  const [modxData] = useState({
    performance_number: 12,
    parts: [
      { part_number: 1, enabled: true, patch_name: 'CFX Concert', volume: 90 },
      { part_number: 2, enabled: true, patch_name: 'FM Soft Pad', volume: 70 },
      { part_number: 3, enabled: false, patch_name: 'Strings', volume: 0 },
    ]
  });

  // Mock stem data
  const [stemData] = useState({
    drums: Array.from({ length: 60 }, () => Math.random() * 0.8 + 0.1),
    bass: Array.from({ length: 60 }, () => Math.random() * 0.6 + 0.2),
    keys: Array.from({ length: 60 }, () => Math.random() * 0.7 + 0.1),
    vocals: Array.from({ length: 60 }, () => Math.random() * 0.5 + 0.3),
  });

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (playing) {
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 30000, // 30s for demo
        useNativeDriver: false,
      }).start();

      const listener = progressAnim.addListener(({ value }) => {
        setProgress(value);
      });

      return () => {
        progressAnim.stopAnimation();
        progressAnim.removeListener(listener);
      };
    }
  }, [playing]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header with Device Health */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← EXIT PERFORMANCE</Text>
        </TouchableOpacity>
        <DeviceStatusHub devices={devices} />
      </View>

      {/* Main Focus: Current & Next Section */}
      <View style={styles.focusArea}>
        <View style={styles.currentSectionBox}>
          <Text style={styles.sectionLabel}>CURRENT</Text>
          <Text style={styles.sectionTitle}>{currentSection}</Text>
        </View>
        
        <View style={styles.nextSectionBox}>
          <Text style={styles.nextLabel}>UP NEXT: {nextSection}</Text>
          <View style={styles.countdownContainer}>
            <Text style={styles.countdownText}>{countdown}</Text>
            <Text style={styles.barsLabel}>BARS</Text>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {/* Large Multi-Layer Waveform */}
        <View style={styles.waveformWrapper}>
          <StemWaveformView 
            stemsData={stemData}
            progress={progress}
            height={140}
            width={width - 40}
          />
        </View>

        {/* Virtual Rig Visualizers */}
        <Text style={styles.rigGroupLabel}>VIRTUAL RIG STATUS</Text>
        <VirtualRigView type="nord" deviceData={nordData} />
        <VirtualRigView type="modx" deviceData={modxData} />
        
        <View style={{ height: 120 }} /> 
      </ScrollView>

      {/* Big-Target Controls (Floating) */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.sideBtn}>
          <Text style={styles.sideBtnText}>PREV</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.mainPlayBtn, playing && styles.activePlayBtn]}
          onPress={() => setPlaying(!playing)}
        >
          <Text style={styles.playIcon}>{playing ? '⏸' : '▶'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.sideBtn}>
          <Text style={styles.sideBtnText}>NEXT</Text>
        </TouchableOpacity>
      </View>

      {/* Song Meta Footer */}
      <View style={styles.footer}>
        <Text style={styles.songTitle}>{song?.title || 'SONG TITLE'}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{song?.bpm || 120} BPM</Text>
          <Text style={styles.metaText}>•</Text>
          <Text style={styles.metaText}>{song?.key || 'C#m'}</Text>
          <Text style={styles.metaText}>•</Text>
          <Text style={styles.metaText}>4/4</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617', // Deep professional navy-black
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  focusArea: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 25,
  },
  currentSectionBox: {
    flex: 1.5,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 20,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#38BDF8',
  },
  sectionLabel: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 5,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 42,
    fontWeight: '900',
  },
  nextSectionBox: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 8,
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  countdownText: {
    color: '#F8FAFC',
    fontSize: 48,
    fontWeight: '900',
  },
  barsLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  waveformWrapper: {
    marginVertical: 10,
  },
  rigGroupLabel: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 20,
    marginBottom: 5,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
  },
  mainPlayBtn: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  activePlayBtn: {
    backgroundColor: '#0EA5E9',
  },
  playIcon: {
    fontSize: 40,
    color: '#020617',
    marginLeft: 4, // Visual centering for the triangle
  },
  sideBtn: {
    width: 80,
    height: 60,
    borderRadius: 15,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  sideBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  footer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  songTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metaText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
});
