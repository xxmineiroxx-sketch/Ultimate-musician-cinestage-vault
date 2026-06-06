import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  useAnimatedGestureHandler,
  runOnJS,
  withSpring
} from 'react-native-reanimated';

const TRACK_HEIGHT = 200;
const FADER_KNOB_SIZE = 40;

const ProTrackFader = ({ track, onChange }) => {
  // Volume shared value (0 to 1)
  const volume = useSharedValue(track.volume || 0.8);
  
  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, ctx) => {
      ctx.startVolume = volume.value;
    },
    onActive: (event, ctx) => {
      // Calculate new volume based on vertical drag
      const delta = -event.translationY / TRACK_HEIGHT;
      let nextVolume = ctx.startVolume + delta;
      
      // Clamp between 0 and 1
      if (nextVolume > 1) nextVolume = 1;
      if (nextVolume < 0) nextVolume = 0;
      
      volume.value = nextVolume;
      
      // Update the actual audio engine via JS thread
      runOnJS(onChange)({ ...track, volume: nextVolume });
    },
    onEnd: () => {
      // Snap to smooth value
      volume.value = withSpring(volume.value);
    }
  });

  const animatedFaderStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: (1 - volume.value) * (TRACK_HEIGHT - FADER_KNOB_SIZE) }
      ],
    };
  });

  const animatedLevelStyle = useAnimatedStyle(() => {
    return {
      height: volume.value * TRACK_HEIGHT,
      backgroundColor: volume.value > 0.8 ? '#F43F5E' : '#00FF99',
    };
  });

  return (
    <View style={styles.container}>
      <Text style={styles.trackName}>{track.name.toUpperCase()}</Text>
      
      <View style={styles.faderTrack}>
        {/* Background Level Fill */}
        <Animated.View style={[styles.levelFill, animatedLevelStyle]} />
        
        {/* The Pan Gesture Handler for the Fader */}
        <PanGestureHandler onGestureEvent={gestureHandler}>
          <Animated.View style={[styles.faderKnob, animatedFaderStyle]}>
            <View style={styles.knobLine} />
          </Animated.View>
        </PanGestureHandler>
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

// Placeholder for Touchables since I can't import them in a single block easily without standard structure
const TouchableOpacity = ({ children, style, onPress }) => (
  <View onTouchStart={onPress} style={style}>{children}</View>
);

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
