import Slider from "@react-native-community/slider";
import React from "react";
import { View, Text, Switch, StyleSheet } from "react-native";

export default function TrackFader({ track, onChange }) {
  const { id, name, volume, mute, solo } = track;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.subtitle}>{id}</Text>
        </View>
        <View style={styles.smRow}>
          <View style={styles.smItem}>
            <Text style={styles.smLabel}>S</Text>
            <Switch
              value={solo}
              onValueChange={(value) => onChange({ ...track, solo: value })}
            />
          </View>
          <View style={styles.smItem}>
            <Text style={styles.smLabel}>M</Text>
            <Switch
              value={mute}
              onValueChange={(value) => onChange({ ...track, mute: value })}
            />
          </View>
        </View>
      </View>
      <View style={styles.sliderRow}>
        <Text style={styles.volLabel}>{Math.round(volume * 100)}%</Text>
        <Slider
          style={{ flex: 1, marginHorizontal: 12 }}
          minimumValue={0}
          maximumValue={1}
          value={volume}
          minimumTrackTintColor="#4F46E5"
          maximumTrackTintColor="#4B5563"
          thumbTintColor="#E5E7EB"
          onValueChange={(value) => onChange({ ...track, volume: value })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#111827",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  smRow: {
    flexDirection: "row",
  },
  smItem: {
    alignItems: "center",
    marginLeft: 12,
  },
  smLabel: {
    color: "#E5E7EB",
    fontWeight: "700",
    marginBottom: 2,
  },
  title: {
    color: "#F9FAFB",
    fontWeight: "600",
  },
  subtitle: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  volLabel: {
    width: 48,
    color: "#E5E7EB",
    fontSize: 12,
  },
});
