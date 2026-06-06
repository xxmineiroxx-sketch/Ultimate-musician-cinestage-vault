import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, Animated } from 'react-native';

const TRACK_HEIGHT = 200;
const FADER_KNOB_SIZE = 40;

const ProTrackFader = ({ track, onChange }) => {
  const [volume, setVolume] = useState(track.volume ?? 0.8);
  const startVolumeRef = useRef(volume);

  const clamp = (v) => Math.max(0, Math.min(1, v));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startVolumeRef.current = volume;
      },
      onPanResponderMove: (_, gesture) => {
        const delta = -gesture.dy / TRACK_HEIGHT;
        const next = clamp(startVolumeRef.current + delta);
        setVolume(next);
        onChange({ ...track, volume: next });
      },
    })
  ).current;

  const knobTop = (1 - volume) * (TRACK_HEIGHT - FADER_KNOB_SIZE);
  const levelHeight = volume * TRACK_HEIGHT;
  const levelColor = volume > 0.8 ? '#F43F5E' : '#00FF99';

  return (
    <View style={styles.container}>
      <Text style={styles.trackName}>{track.name.toUpperCase()}</Text>

      <View style={styles.faderTrack}>
        <View style={[styles.levelFill, { height: levelHeight, backgroundColor: levelColor }]} />

        <View
          {...panResponder.panHandlers}
          style={[styles.faderKnob, { top: knobTop }]}
        >
          <View style={styles.knobLine} />
        </View>
      </View>

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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 80,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  trackName: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 12,
    letterSpacing: 1,
  },
  faderTrack: {
    width: 12,
    height: TRACK_HEIGHT,
    backgroundColor: '#1E293B',
    borderRadius: 6,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  levelFill: {
    width: '100%',
    borderRadius: 6,
    position: 'absolute',
    bottom: 0,
  },
  faderKnob: {
    width: 44,
    height: FADER_KNOB_SIZE,
    backgroundColor: '#F8FAF3',
    borderRadius: 8,
    position: 'absolute',
    left: -16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  knobLine: {
    width: 20,
    height: 2,
    backgroundColor: '#94A3B8',
  },
  controls: {
    marginTop: 20,
    gap: 8,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  btnText: {
    color: '#F8FAF3',
    fontWeight: '900',
  },
  soloActive: {
    backgroundColor: '#FBBF24',
    borderColor: '#F59E0B',
  },
  muteActive: {
    backgroundColor: '#F43F5E',
    borderColor: '#E11D48',
  }
});

export default ProTrackFader;
