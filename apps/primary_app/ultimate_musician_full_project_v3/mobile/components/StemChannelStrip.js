/**
 * StemChannelStrip — vertical DAW-style channel strip.
 * Animated LED VU meter + volume fader + R / S / M buttons.
 * Designed to sit inside a horizontal ScrollView.
 */
import Slider from "@react-native-community/slider";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const LED_COUNT = 22;
const STRIP_W = 68;

/** Return a color for each LED segment. */
function ledColor(idx, lit, isPeak) {
  // idx 0 = bottom (quiet), idx 21 = top (loud/peak)
  if (!lit && !isPeak) return "#0A1020"; // unlit
  if (isPeak) return idx >= 18 ? "#FF3B30" : idx >= 14 ? "#FFD60A" : "#30D158";
  if (idx >= 18) return "#EF4444"; // red zone
  if (idx >= 14) return "#F59E0B"; // yellow zone
  return "#10B981"; // green
}

export default function StemChannelStrip({
  track,
  isPlaying,
  isOwn,
  onMute,
  onSolo,
  onArm,
  onVolumeChange,
}) {
  const levelRef = useRef(0);
  const peakRef = useRef(0);
  const peakHoldRef = useRef(0);
  const [level, setLevel] = useState(0);
  const [peakIdx, setPeakIdx] = useState(-1);

  // Local vol for immediate UI feedback; commits to parent on release
  const [localVol, setLocalVol] = useState(track.volume ?? 1);

  // Sync if track.volume changes externally
  useEffect(() => {
    setLocalVol(track.volume ?? 1);
  }, [track.volume]);

  useEffect(() => {
    const active = isPlaying && !track.mute;
    const baseAmp = isOwn ? 0.62 : 0.38;

    const id = setInterval(() => {
      if (active) {
        const target = Math.min(0.97, baseAmp + (Math.random() - 0.26) * 0.52);
        levelRef.current = levelRef.current * 0.58 + target * 0.42;
        if (levelRef.current > peakRef.current) {
          peakRef.current = levelRef.current;
          peakHoldRef.current = 16;
        } else {
          peakHoldRef.current = Math.max(0, peakHoldRef.current - 1);
          if (peakHoldRef.current <= 0) {
            peakRef.current = Math.max(
              levelRef.current,
              peakRef.current - 0.018,
            );
          }
        }
      } else {
        levelRef.current = Math.max(0, levelRef.current - 0.07);
        peakHoldRef.current = Math.max(0, peakHoldRef.current - 1);
        if (peakHoldRef.current <= 0) {
          peakRef.current = Math.max(0, peakRef.current - 0.04);
        }
      }
      setLevel(levelRef.current);
      setPeakIdx(Math.round(peakRef.current * (LED_COUNT - 1)));
    }, 50);

    return () => clearInterval(id);
  }, [isPlaying, track.mute, isOwn]);

  const litCount = Math.round(level * LED_COUNT);

  return (
    <View
      style={[
        styles.strip,
        isOwn && styles.stripOwn,
        track.solo && styles.stripSolo,
      ]}
    >
      {/* ── Track name ──────────────────────────────────────────── */}
      <Text
        style={[styles.name, isOwn && styles.nameOwn]}
        numberOfLines={2}
        adjustsFontSizeToFit
      >
        {track.label}
      </Text>
      {isOwn && <Text style={styles.star}>★</Text>}

      {/* ── VU Meter ─────────────────────────────────────────────── */}
      <View style={styles.meter}>
        {Array.from({ length: LED_COUNT }, (_, i) => {
          const actualIdx = LED_COUNT - 1 - i;
          const lit = actualIdx < litCount;
          const isPeak = actualIdx === peakIdx && !lit;
          return (
            <View
              key={i}
              style={[
                styles.led,
                { backgroundColor: ledColor(actualIdx, lit, isPeak) },
                isPeak && styles.ledPeakGlow,
              ]}
            />
          );
        })}
      </View>

      {/* ── Volume Fader (vertical) ───────────────────────────────── */}
      <View style={styles.faderWrap}>
        <Slider
          style={styles.fader}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          value={localVol}
          onValueChange={setLocalVol}
          onSlidingComplete={(v) => {
            setLocalVol(v);
            onVolumeChange?.(v);
          }}
          minimumTrackTintColor={track.mute ? "#374151" : "#10B981"}
          maximumTrackTintColor="#1E293B"
          thumbTintColor={track.mute ? "#374151" : "#F9FAFB"}
        />
      </View>
      <Text style={[styles.volPct, track.mute && { color: "#374151" }]}>
        {Math.round(localVol * 100)}
      </Text>

      {/* ── R — Arm / Record ────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.btn, track.armed && styles.btnRActive]}
        onPress={onArm}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnTxt, track.armed && styles.btnTxtR]}>R</Text>
      </TouchableOpacity>

      {/* ── S — Solo ─────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.btn, track.solo && styles.btnSActive]}
        onPress={onSolo}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnTxt, track.solo && styles.btnTxtS]}>S</Text>
      </TouchableOpacity>

      {/* ── M — Mute ─────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.btn, track.mute && styles.btnMActive]}
        onPress={onMute}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnTxt, track.mute && styles.btnTxtM]}>M</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: STRIP_W,
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#060D1E",
    gap: 5,
  },
  stripOwn: { borderColor: "#92400E", backgroundColor: "#0D0800" },
  stripSolo: {
    borderColor: "#F59E0B",
    shadowColor: "#F59E0B",
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 6,
  },

  name: {
    color: "#475569",
    fontSize: 7,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  nameOwn: { color: "#FCD34D" },
  star: { color: "#F59E0B", fontSize: 8, lineHeight: 10 },

  meter: { width: 14, gap: 2, marginVertical: 2 },
  led: { height: 5, width: 14, borderRadius: 1 },
  ledPeakGlow: { opacity: 1 },

  // Vertical fader — rotate a horizontal slider -90deg
  faderWrap: {
    height: 72,
    width: STRIP_W - 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fader: {
    width: 72,
    transform: [{ rotate: "-90deg" }],
  },
  volPct: {
    color: "#4B5563",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginTop: -2,
  },

  btn: {
    width: "100%",
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    alignItems: "center",
  },
  btnRActive: { borderColor: "#EF4444", backgroundColor: "#2A0808" },
  btnSActive: { borderColor: "#F59E0B", backgroundColor: "#1A0F00" },
  btnMActive: { borderColor: "#6366F1", backgroundColor: "#0E0E2A" },

  btnTxt: { color: "#334155", fontSize: 10, fontWeight: "900" },
  btnTxtR: { color: "#EF4444" },
  btnTxtS: { color: "#F59E0B" },
  btnTxtM: { color: "#818CF8" },
});
