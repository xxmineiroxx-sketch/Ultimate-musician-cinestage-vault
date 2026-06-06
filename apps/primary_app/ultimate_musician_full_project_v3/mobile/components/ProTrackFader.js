import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, Animated } from 'react-native';

const TRACK_HEIGHT = 200;
const FADER_KNOB_SIZE = 40;

const ProTrackFader = ({ track, onChange, compact = false, isMaster = false }) => {
  const [volume, setVolume] = useState(track.volume ?? 0.8);
  const startVolumeRef = useRef(volume);

  const TRACK_H = isMaster ? 240 : 200;
  const FADER_W = compact ? 60 : 80;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startVolumeRef.current = volume;
      },
      onPanResponderMove: (_, gesture) => {
        const delta = -gesture.dy / TRACK_H;
        const next = Math.max(0, Math.min(1, startVolumeRef.current + delta));
        setVolume(next);
        onChange({ ...track, volume: next });
      },
    })
  ).current;

  const knobTop = (1 - volume) * (TRACK_H - FADER_KNOB_SIZE);
  const levelHeight = volume * TRACK_H;
  
  // High-res color gradient for level
  const levelColor = isMaster ? '#F59E0B' : volume > 0.9 ? '#EF4444' : volume > 0.7 ? '#FBBF24' : '#10B981';

  return (
    <View style={[styles.container, { width: FADER_W }]}>
      <Text style={[styles.trackName, isMaster && styles.masterName]}>
        {track.name.toUpperCase()}
      </Text>

      <View style={[styles.faderTrack, { height: TRACK_H }]}>
        {/* Hardware-style Meter Ticks */}
        <View style={styles.ticks}>
           {[0, 20, 40, 60, 80, 100].map(t => (
             <View key={t} style={[styles.tick, { bottom: `${t}%` }]} />
           ))}
        </View>

        <View style={[styles.levelFill, { height: levelHeight, backgroundColor: levelColor, shadowColor: levelColor }]} />

        <View
          {...panResponder.panHandlers}
          style={[styles.faderKnob, { top: knobTop, width: FADER_W - 20, left: -(FADER_W - 20)/2 + 6 }]}
        >
          <View style={styles.knobLine} />
          {isMaster && <View style={styles.masterIndicator} />}
        </View>
      </View>

      {!compact && (
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.btn, track.solo && styles.soloActive]}
            onPress={() => onChange({ ...track, solo: !track.solo })}
          >
            <Text style={styles.btnText}>S</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, track.mute && styles.muteActive]}
            onPress={() => onChange({ ...track, mute: !track.mute })}
          >
            <Text style={styles.btnText}>M</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginHorizontal: 4,
  },
  trackName: {
    color: '#94A3B8',
    fontSize: 8,
    fontWeight: '900',
    marginBottom: 16,
    letterSpacing: 1,
    height: 12,
  },
  masterName: {
    color: '#F59E0B',
    fontSize: 10,
  },
  faderTrack: {
    width: 14,
    backgroundColor: '#0F172A',
    borderRadius: 7,
    justifyContent: 'flex-end',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  ticks: {
    position: 'absolute',
    left: -10,
    right: -10,
    height: '100%',
  },
  tick: {
    position: 'absolute',
    width: 4,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    left: 2,
  },
  levelFill: {
    width: '100%',
    borderRadius: 7,
    position: 'absolute',
    bottom: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  faderKnob: {
    height: FADER_KNOB_SIZE,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#94A3B8',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  knobLine: {
    width: '60%',
    height: 3,
    backgroundColor: '#64748B',
    borderRadius: 1.5,
  },
  masterIndicator: {
    position: 'absolute',
    top: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F59E0B',
  },
  controls: {
    marginTop: 20,
    gap: 8,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  btnText: {
    color: '#F8FAF3',
    fontWeight: '900',
    fontSize: 10,
  },
  soloActive: {
    backgroundColor: '#FBBF24',
    borderColor: '#F59E0B',
  },
  muteActive: {
    backgroundColor: '#EF4444',
    borderColor: '#DC2626',
  }
});

export default ProTrackFader;
