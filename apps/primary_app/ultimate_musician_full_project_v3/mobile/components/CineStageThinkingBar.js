/**
 * CineStageThinkingBar — compact, non-blocking floating activity bar.
 *
 * Slides up from the bottom whenever any AI / async operation is in progress.
 * Driven by the global cinestageStatus module — no props required.
 *
 * Place once inside App.js, overlaid on the NavigationContainer.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { subscribeToCineStageStatus } from "../services/cinestageStatus";

export default function CineStageThinkingBar() {
  const [status, setStatus] = useState({ active: false, message: "" });
  const [dots, setDots] = useState("");
  const slideY = useRef(new Animated.Value(80)).current;

  // Subscribe to global status
  useEffect(() => {
    return subscribeToCineStageStatus(setStatus);
  }, []);

  // Slide in / out
  useEffect(() => {
    Animated.spring(slideY, {
      toValue: status.active ? 0 : 80,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }, [status.active]);

  // Animated dots while active
  useEffect(() => {
    if (!status.active) {
      setDots("");
      return;
    }
    let n = 0;
    const t = setInterval(() => {
      n = (n + 1) % 4;
      setDots(n === 0 ? "" : ".".repeat(n));
    }, 380);
    return () => clearInterval(t);
  }, [status.active]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.bar, { transform: [{ translateY: slideY }] }]}
    >
      <View style={styles.inner}>
        <ActivityIndicator
          size="small"
          color="#818CF8"
          style={styles.spinner}
        />
        <Text style={styles.brand}>CineStage™</Text>
        <Text style={styles.sep}>·</Text>
        <Text style={styles.msg} numberOfLines={1}>
          {status.message}
          {dots}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0B1120",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3730A3",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  spinner: { marginRight: 2 },
  brand: {
    color: "#818CF8",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  sep: {
    color: "#374151",
    fontSize: 13,
  },
  msg: {
    color: "#D1D5DB",
    fontSize: 13,
    flex: 1,
  },
});
