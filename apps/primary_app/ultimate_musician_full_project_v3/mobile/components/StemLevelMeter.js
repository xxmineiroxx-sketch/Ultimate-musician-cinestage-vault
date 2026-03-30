import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

/**
 * Animated VU-style level meter for a stem track.
 * Animates realistically when isPlaying=true, decays when false.
 * Color: green → amber → red at high levels.
 */
export default function StemLevelMeter({
  isPlaying = false,
  color = "#10B981",
  width = 4,
  height = 28,
}) {
  const level = useRef(new Animated.Value(0.08)).current;
  const intervalRef = useRef(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!isPlaying) {
      Animated.timing(level, {
        toValue: 0.04,
        duration: 350,
        useNativeDriver: false,
      }).start();
      return;
    }
    // Kick off with a fast rise
    Animated.timing(level, {
      toValue: 0.55 + Math.random() * 0.35,
      duration: 60,
      useNativeDriver: false,
    }).start();
    // Then keep animating
    intervalRef.current = setInterval(() => {
      const target = 0.2 + Math.random() * 0.72;
      Animated.timing(level, {
        toValue: target,
        duration: 90,
        useNativeDriver: false,
      }).start();
    }, 110);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  const barHeight = level.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const barColor = level.interpolate({
    inputRange: [0, 0.55, 0.8, 1],
    outputRange: [color, color, "#F59E0B", "#EF4444"],
  });

  return (
    <View
      style={{
        width,
        height,
        backgroundColor: "#0F172A",
        borderRadius: 2,
        overflow: "hidden",
        justifyContent: "flex-end",
      }}
    >
      <Animated.View
        style={{
          width,
          height: barHeight,
          backgroundColor: barColor,
          borderRadius: 2,
        }}
      />
    </View>
  );
}
