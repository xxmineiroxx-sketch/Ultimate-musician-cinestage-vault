import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

/**
 * Full-screen processing overlay.
 *
 * Designed for "CineStage is processing" UX:
 * - Spinner
 * - Animated dots
 * - Step list with current step highlight
 * - Optional progress bar (0..100)
 */
export default function CineStageProcessingOverlay({
  visible,
  title = "CineStage™ is processing",
  subtitle = "Wait — we’ll let you know when it’s done.",
  steps = [
    "Collecting song info",
    "Separating stems",
    "Preparing tracks",
    "Job done!",
  ],
  currentStepIndex = 0,
  progress,
}) {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let count = 0;
    const interval = setInterval(() => {
      count = (count + 1) % 4;
      setDotCount(count);
    }, 300);
    return () => clearInterval(interval);
  }, [visible]);

  const hasProgress = typeof progress === "number" && isFinite(progress);
  const clampedProgress = hasProgress
    ? Math.max(0, Math.min(100, progress))
    : 0;

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <ActivityIndicator />
          <Text style={styles.title}>
            {title}
            <Text> </Text>
            <Text>{dotCount ? ".".repeat(dotCount) : ""}</Text>
          </Text>
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.stepsWrap}>
          {steps.map((s, i) => {
            const active = i === currentStepIndex;
            const done = i < currentStepIndex;
            return (
              <View key={`${s}-${i}`} style={styles.stepRow}>
                <Text
                  style={[
                    styles.bullet,
                    done && styles.bulletDone,
                    active && styles.bulletActive,
                  ]}
                >
                  {done ? "✓" : active ? "•" : "○"}
                </Text>
                <Text
                  style={[
                    styles.stepText,
                    done && styles.stepDone,
                    active && styles.stepActive,
                  ]}
                >
                  {s}
                </Text>
              </View>
            );
          })}
        </View>

        {hasProgress && (
          <View style={styles.progressWrap}>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${clampedProgress}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(clampedProgress)}%
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#0B1220",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#263245",
    padding: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 8,
    color: "#B6C2D1",
    fontSize: 13,
  },
  stepsWrap: {
    marginTop: 14,
    gap: 8,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bullet: {
    width: 18,
    textAlign: "center",
    color: "#90A4B8",
    fontWeight: "700",
  },
  bulletDone: { color: "#34D399" },
  bulletActive: { color: "#FBBF24" },
  stepText: {
    color: "#C7D2FE",
    fontSize: 13,
  },
  stepDone: { color: "#9CA3AF" },
  stepActive: { color: "#F9FAFB", fontWeight: "600" },
  progressWrap: {
    marginTop: 14,
    gap: 8,
  },
  progressBarBg: {
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#4F46E5",
  },
  progressText: {
    alignSelf: "flex-end",
    color: "#B6C2D1",
    fontSize: 12,
  },
});
