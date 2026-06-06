/**
 * CineStageBrainLogo - Animated brain logo for CineStage Brain Online
 *
 * Features:
 *  - 3 staggered pulse rings emanating from center
 *  - 4 orbiting neural nodes rotating around core
 *  - Breathing core glow (indigo/violet)
 *  - Live online/offline status with pulsing dot
 *  - Connects to CineStage backend via bootstrapBrain()
 *
 * Pure React Native Animated — no SVG dependency.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Animated, StyleSheet, Text, Easing } from "react-native";

import { bootstrapBrain, isBrainOnline as resolveBrainOnline } from "../services/cinestage";

const SIZES = { small: 44, medium: 64, large: 88 };

// Orbital node positions (unit circle, 4 nodes at 45° intervals offset by 22.5°)
const ORBIT_ANGLES_DEG = [22.5, 112.5, 202.5, 292.5];
const ORBIT_COLORS = ["#818CF8", "#34D399", "#F472B6", "#60A5FA"];

export default function CineStageBrainLogo({
  showStatusText = true,
  size = "medium",
  mode = "live",
  statusOverride = null,
}) {
  const isProcessingMode = mode === "processing";
  const hasStatusOverride = !!statusOverride;
  const [localIsOnline, setLocalIsOnline] = useState(false);
  const [localLoading, setLocalLoading] = useState(true);
  const [localBrainData, setLocalBrainData] = useState(null);

  // Animation values
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const coreGlow = useRef(new Animated.Value(0.7)).current;
  const orbitAngle = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(1)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // ── Status fetch ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasStatusOverride) {
      return undefined;
    }

    if (isProcessingMode) {
      setLocalIsOnline(true);
      setLocalLoading(false);
      setLocalBrainData(null);
      return undefined;
    }

    let mounted = true;

    async function fetchStatus() {
      try {
        const data = await bootstrapBrain();
        if (!mounted) return;
        setLocalIsOnline(resolveBrainOnline(data?.brain));
        setLocalBrainData(data?.brain ?? null);
      } catch {
        if (mounted) setLocalIsOnline(false);
      } finally {
        if (mounted) setLocalLoading(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [hasStatusOverride, isProcessingMode]);

  // ── Animations ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // Fade in on mount
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const isOnline = hasStatusOverride ? !!statusOverride?.isOnline : localIsOnline;
  const loading = hasStatusOverride ? !!statusOverride?.loading : localLoading;
  const brainData = hasStatusOverride ? statusOverride?.brain ?? null : localBrainData;

  useEffect(() => {
    const shouldAnimate = isProcessingMode || isOnline;

    if (loading && !isProcessingMode) return;

    if (!shouldAnimate) {
      // Stop / reset
      ring1.setValue(0);
      ring2.setValue(0);
      ring3.setValue(0);
      orbitAngle.stopAnimation();
      dotOpacity.stopAnimation();
      dotOpacity.setValue(1);
      return;
    }

    // Staggered expanding rings
    function makeRingLoop(anim, delay) {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
    }

    const r1 = makeRingLoop(ring1, 0);
    const r2 = makeRingLoop(ring2, 700);
    const r3 = makeRingLoop(ring3, 1400);

    // Core breathe
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(coreGlow, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(coreGlow, {
          toValue: 0.65,
          duration: 1600,
          useNativeDriver: true,
        }),
      ]),
    );

    // Orbit rotation (continuous)
    orbitAngle.setValue(0);
    const orbit = Animated.loop(
      Animated.timing(orbitAngle, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    // Status dot pulse
    const dot = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, {
          toValue: 0.25,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(dotOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );

    r1.start();
    r2.start();
    r3.start();
    glow.start();
    orbit.start();
    dot.start();

    return () => {
      r1.stop();
      r2.stop();
      r3.stop();
      glow.stop();
      orbit.stop();
      dot.stop();
    };
  }, [isOnline, loading, isProcessingMode]);

  // ── Derived sizes ────────────────────────────────────────────────────────────
  const d = SIZES[size] ?? 64;
  const orbitR = d * 0.92; // orbit radius
  const ringBase = d * 1.1; // ring start size
  const isActive = isProcessingMode || isOnline;

  const statusConfig = isProcessingMode
    ? {
        dotColor: "#A78BFA",
        textColor: "#C7D2FE",
        text: "Processing",
      }
    : loading
      ? {
          dotColor: "#F59E0B",
          textColor: "#F59E0B",
          text: "Connecting…",
        }
      : isOnline
        ? {
            dotColor: "#10B981",
            textColor: "#10B981",
            text: "Brain Online",
          }
        : {
            dotColor: "#6B7280",
            textColor: "#6B7280",
            text: "Offline",
          };

  // ── Ring animation style ────────────────────────────────────────────────────
  function ringStyle(anim) {
    const scale = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, (d * 2.6) / ringBase],
    });
    const op = anim.interpolate({
      inputRange: [0, 0.4, 1],
      outputRange: [0.55, 0.25, 0],
    });
    return {
      position: "absolute",
      borderWidth: 1.5,
      borderColor: "#6366F1",
      borderRadius: ringBase / 2,
      opacity: op,
      width: ringBase,
      height: ringBase,
      transform: [{ scale }],
    };
  }

  // ── Orbit node positions ─────────────────────────────────────────────────────
  const rotation = orbitAngle.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const containerSz = orbitR * 2 + 12; // orbit container size

  const orbitNodes = ORBIT_ANGLES_DEG.map((deg, i) => {
    const rad = (deg * Math.PI) / 180;
    const cx = orbitR;
    const x = cx + Math.cos(rad) * orbitR - 5;
    const y = cx + Math.sin(rad) * orbitR - 5;
    return (
      <View
        key={i}
        style={{
          position: "absolute",
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: ORBIT_COLORS[i],
          left: x,
          top: y,
          shadowColor: ORBIT_COLORS[i],
          shadowOpacity: 0.8,
          shadowRadius: 4,
          elevation: 4,
        }}
      />
    );
  });

  // ── Core glow opacity ────────────────────────────────────────────────────────
  const coreBorderColor = isActive ? "#6366F1" : "#374151";
  const coreBg = isActive ? "#1E1B4B" : "#111827";

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn }]}>
      {/* Pulse rings */}
      {isActive && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Animated.View style={ringStyle(ring1)} />
            <Animated.View style={ringStyle(ring2)} />
            <Animated.View style={ringStyle(ring3)} />
          </View>
        </View>
      )}

      {/* Orbit container — rotates as a whole */}
      {isActive && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: containerSz,
            height: containerSz,
            left: -(containerSz - d) / 2,
            top: -(containerSz - d) / 2,
            transform: [{ rotate: rotation }],
          }}
        >
          {orbitNodes}
        </Animated.View>
      )}

      {/* Core */}
      <Animated.View
        style={[
          styles.core,
          {
            width: d,
            height: d,
            borderRadius: d / 2,
            backgroundColor: coreBg,
            borderColor: coreBorderColor,
            opacity: coreGlow,
            shadowColor: isActive ? "#6366F1" : "transparent",
            shadowOpacity: 0.6,
            shadowRadius: isActive ? 16 : 0,
            elevation: isActive ? 8 : 0,
          },
        ]}
      >
        <Text
          style={{ fontSize: d * 0.44, textAlign: "center", lineHeight: d }}
        >
          🧠
        </Text>
      </Animated.View>

      {/* Status label */}
      {showStatusText && (
        <View style={styles.statusRow}>
          <Animated.View
            style={[
              styles.statusDot,
              {
                backgroundColor: statusConfig.dotColor,
                opacity: isActive ? dotOpacity : 1,
              },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              {
                color: statusConfig.textColor,
              },
            ]}
          >
            {statusConfig.text}
          </Text>
        </View>
      )}

      {/* Metrics row */}
      {showStatusText && !isProcessingMode && isOnline && brainData && (
        <View style={styles.metricsRow}>
          <Text style={styles.metric}>
            {brainData.summary?.feature_group_count ?? 0} groups
          </Text>
          <Text style={styles.metricDot}>·</Text>
          <Text style={styles.metric}>
            {brainData.summary?.internal_agent_count ?? 0} agents
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  metric: {
    color: "#9CA3AF",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  metricDot: {
    color: "#4B5563",
    fontSize: 10,
  },
});
