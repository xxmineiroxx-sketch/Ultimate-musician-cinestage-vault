import React from "react";
import { View, StyleSheet } from "react-native";

export default function MeterBar({ level = 0, color = "#34D399" }) {
  const pct = Math.max(0, Math.min(1, level));
  return (
    <View style={styles.outer}>
      <View
        style={[
          styles.inner,
          { width: `${pct * 100}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#0A1020",
    borderWidth: 1,
    borderColor: "#1F2937",
    overflow: "hidden",
  },
  inner: { height: 8, borderRadius: 999 },
});
