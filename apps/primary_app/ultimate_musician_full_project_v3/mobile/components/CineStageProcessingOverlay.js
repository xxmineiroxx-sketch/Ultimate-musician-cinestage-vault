import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";

import CineStageBrainLogo from "./CineStageBrainLogo";

/**
 * Full-screen processing overlay.
 *
 * Designed for "CineStage is processing" UX:
 * - CineStage Brain animation
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
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>CineStage Brain</Text>
          </View>
          <CineStageBrainLogo mode="processing" size="large" />
        </View>

        <Text style={styles.title}>
          {title}
          {dotCount ? ` ${".".repeat(dotCount)}` : ""}
        </Text>
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
    backgroundColor: "rgba(2,6,23,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#081120",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.28)",
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.14)",
  },
  badge: {
    marginBottom: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(79,70,229,0.18)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.28)",
  },
  badgeText: {
    color: "#C7D2FE",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 18,
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    color: "#B6C2D1",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  stepsWrap: {
    marginTop: 20,
    gap: 10,
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
    marginTop: 18,
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
