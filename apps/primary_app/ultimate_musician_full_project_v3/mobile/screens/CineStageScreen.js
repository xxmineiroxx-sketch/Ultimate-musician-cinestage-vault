import React, { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useTheme } from "../context/ThemeContext";
import CineStageBrainStatus from "../components/CineStageBrainStatus";

export default function CineStageScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>CineStage™</Text>
        <Text style={styles.subtitle}>
          Cloudflare server status, ms latency, real-time identification, and
          System Map.
        </Text>

        <View style={styles.statusShell}>
          <CineStageBrainStatus
            onPress={() => navigation?.navigate("SystemMap")}
            showDetails
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>System Map</Text>
          <Text style={styles.body}>
            Open the live system topology for Sync Server, CineStage AI, stage
            output, and connected playback devices.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation?.navigate("SystemMap")}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Open System Map</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 16,
      paddingBottom: 48,
    },
    title: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.5,
    },
    subtitle: {
      color: colors.subtle,
      fontSize: 12,
      marginTop: 4,
      marginBottom: 16,
    },
    statusShell: {
      marginBottom: 12,
    },
    card: {
      padding: 16,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: {
      color: colors.text,
      fontWeight: "800",
      fontSize: 11,
      marginBottom: 8,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    body: {
      color: colors.subtle,
      fontSize: 13,
      lineHeight: 20,
    },
    primaryButton: {
      marginTop: 14,
      backgroundColor: "#312E81",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#6366F1",
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: {
      color: "#E0E7FF",
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 0.2,
    },
  });
