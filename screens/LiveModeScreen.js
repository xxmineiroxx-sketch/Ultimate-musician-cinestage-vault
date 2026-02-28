import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function LiveModeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>LiveMode</Text>
      <Text style={styles.subtitle}>Screen placeholder</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0b1020",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#e5e7eb",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#94a3b8",
  },
});
