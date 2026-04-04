import React, { useRef, useMemo, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Animated, Easing } from "react-native";

import {
  normalizePeaksRange,
  smoothPeaks,
} from "../services/wavePipelineEngine";

/** Strip trailing numbers/spaces so "Verse 1", "Bridge8" → "verse", "bridge". */
function normLabel(label) {
  return (label || "")
    .toLowerCase()
    .replace(/[\s]*\d+\s*$/, "")
    .trim();
}

/** Strip leading type prefixes like "SECTION ", "MARKER ", "CUE " from stored labels. */
function cleanLabel(label) {
  return (
    (label || "").replace(/^(section|marker|cue|part)\s+/i, "").trim() ||
    label ||
    "Section"
  );
}

/** Cycling color palette for sections that don't match known SECTION_COLORS. */
const PALETTE = [
  "#6366F1",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#38BDF8",
  "#F97316",
  "#8B5CF6",
  "#EF4444",
  "#14B8A6",
  "#A3E635",
  "#F472B6",
  "#FB923C",
];

/** Deterministic pseudo-random from a string seed. */
function makeRng(seed) {
  let h = 0;
  for (let i = 0; i < (seed || "").length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return (h >>> 0) / 0xffffffff;
  };
}

const SECTION_COLORS = {
  intro: "#6B7280",
  verse: "#6366F1",
  "pre-chorus": "#8B5CF6",
  chorus: "#EC4899",
  bridge: "#F59E0B",
  outro: "#10B981",
  tag: "#0EA5E9",
};

// High-frequency zone colors (top portion of each bar — cooler/lighter)
const HIGH_FREQ_COLORS = {
  intro: "#9CA3AF",
  verse: "#818CF8",
  "pre-chorus": "#C4B5FD",
  chorus: "#F9A8D4",
  bridge: "#FDE68A",
  outro: "#6EE7B7",
  tag: "#7DD3FC",
};

const ROLE_COLORS = {
  worship_leader: "#F59E0B",
  lead_vocal: "#EC4899",
  bgv_1: "#C026D3",
  bgv_2: "#9333EA",
  bgv_3: "#7C3AED",
  keyboard: "#6366F1",
  piano: "#6366F1",
  synth: "#818CF8",
  electric_guitar: "#F97316",
  rhythm_guitar: "#FB923C",
  acoustic_guitar: "#EAB308",
  bass: "#10B981",
  drums: "#EF4444",
  percussion: "#DC2626",
  strings: "#A78BFA",
  brass: "#FBBF24",
  music_director: "#0EA5E9",
  foh_engineer: "#64748B",
  monitor_engineer: "#94A3B8",
  stream_engineer: "#38BDF8",
  lighting: "#FB923C",
  media_tech: "#A3E635",
};

const ROLE_EMOJIS = {
  worship_leader: "🎸",
  lead_vocal: "🎤",
  bgv_1: "🎤",
  bgv_2: "🎤",
  bgv_3: "🎤",
  keyboard: "🎹",
  piano: "🎹",
  synth: "🎛️",
  electric_guitar: "🎸",
  rhythm_guitar: "🎸",
  acoustic_guitar: "🎸",
  bass: "🎸",
  drums: "🥁",
  percussion: "🪘",
  strings: "🎻",
  brass: "🎺",
  music_director: "🎼",
  foh_engineer: "🎚️",
  monitor_engineer: "🎚️",
  stream_engineer: "📡",
  lighting: "💡",
  media_tech: "🖥️",
};
const DEFAULT_SECTIONS_PCT = [
  { label: "Intro", s: 0.0, e: 0.08 },
  { label: "Verse", s: 0.08, e: 0.29 },
  { label: "Chorus", s: 0.29, e: 0.48 },
  { label: "Verse", s: 0.48, e: 0.65 },
  { label: "Bridge", s: 0.65, e: 0.82 },
  { label: "Outro", s: 0.82, e: 1.0 },
];

const BAR_COUNT = 480;

/**
 * Pro waveform timeline with section marker pins.
 *
 * sectionMarkers: { label, timeSec, endTimeSec, color }[]
 *   - 1 tap → seek to section + select it
 *   - 2 taps on same → loop mode (🔁)
 *   - tap different → exit loop, seek to new section
 */
export default function WaveformTimeline({
  sections = [],
  markers = [],
  automationEvents = [],
  lengthSeconds = 0,
  currentSection,
  playheadPct = null,
  waveformPeaks = null,
  onSeek = null,
  bpm = 0,
  songTitle = "",
  // Section marker pin props
  sectionMarkers = [],
  activeSectionLabel = null,
  sectionLoopActive = false,
  sectionEditMode = false,
  onSectionTap = null, // (sec, tapCount: 1|2|3) — caller handles loop/worship
  onWorshipLoop = null, // shortcut for 3-tap worship loop
  onSectionMarkerDrag = null, // (sec, nextTimeSec, isFinal) — drag cue marker left/right
  onSectionMenu = null, // (sec) — long-press → rename/delete menu
  // Marker add / tap
  onAddMarker = null,
  onMarkerTap = null,
  onMarkerDrag = null,
  compactSectionMarkers = false,
  // Responsive height override
  height: heightProp = null,
  // Role-aware coloring
  userRole = null,
  roleCue = null,
  // Worship Free / Flow state
  worshipFreeActive = false,
}) {
  const total = lengthSeconds || 1;
  const widthRef = useRef(300);
  const containerRef = useRef(null);
  const containerPageXRef = useRef(0);

  // ── iPad Optimization: Adaptive UI ──────────────────────────────────────
  const [isIpad, setIsIpad] = useState(false);
  useEffect(() => {
    // iPad Mini A17 Pro has high DPI and specific aspect ratio. 
    // We increase touch targets and density for this form factor.
    const { width, height } = require('react-native').Dimensions.get('window');
    const aspectRatio = height / width;
    if (width > 700 || height > 700) {
      setIsIpad(true);
    }
  }, []);

  const ADAPTIVE_BAR_COUNT = isIpad ? 640 : 480; 

  // ── Worship Free Pulse ──────────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (worshipFreeActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [worshipFreeActive, pulseAnim]);

  // ── Per-marker tap counting (1=jump, 2=loop, 3=worship loop) ─────────────
  const tapCountRef = useRef({}); // { [label]: count }
  const tapTimerRef = useRef({}); // { [label]: timeoutId }
  const [tapVisual, setTapVisual] = React.useState({}); // { [label]: 1|2|3 } for UI

  function handleMarkerPress(sec) {
    if (sectionEditMode && typeof onSectionMenu === "function") {
      onSectionMenu(sec);
      return;
    }
    const key = String(sec?.markerId || sec?.id || sec?.label);
    const prev = tapCountRef.current[key] || 0;
    const count = prev + 1;

    // Clear existing reset timer for this marker
    if (tapTimerRef.current[key]) clearTimeout(tapTimerRef.current[key]);

    // Fire the appropriate callback
    if (count >= 3) {
      tapCountRef.current[key] = 0;
      delete tapTimerRef.current[key];
      setTapVisual((v) => {
        const n = { ...v };
        delete n[key];
        return n;
      });
      onWorshipLoop?.(sec);
      onSectionTap?.(sec, 3);
    } else {
      tapCountRef.current[key] = count;
      setTapVisual((v) => ({ ...v, [key]: count }));
      // Auto-reset after 700ms inactivity
      tapTimerRef.current[key] = setTimeout(() => {
        tapCountRef.current[key] = 0;
        setTapVisual((v) => {
          const n = { ...v };
          delete n[key];
          return n;
        });
      }, 700);
      onSectionTap?.(sec, count);
    }
  }

  const dragStateRef = useRef({
    key: null,
    mode: "move",
    offsetSec: 0,
    startX: 0,
    moved: false,
  });
  const sectionDragStateRef = useRef({
    id: null,
    offsetSec: 0,
    startX: 0,
    moved: false,
  });
  const secLongPressRef = useRef(null); // timer for long-press → menu

  // ── Sort song-structure sections ─────────────────────────────────────────
  const sorted = useMemo(() => {
    const source =
      Array.isArray(sections) && sections.length > 0
        ? sections
        : sectionMarkers;

    return [...source]
      .map((section, index) => {
        const rawTime = Number(
          section?.timeSec ??
            section?.positionSeconds ??
            section?.startSeconds ??
            section?.startSec ??
            section?.start ??
            0,
        );
        const timeSec = Number.isFinite(rawTime) ? rawTime : 0;
        const label = cleanLabel(section?.label || `Section ${index + 1}`);
        const color =
          section?.color ||
          SECTION_COLORS[normLabel(label)] ||
          PALETTE[index % PALETTE.length];
        return {
          ...section,
          label,
          timeSec,
          positionSeconds: timeSec,
          color,
        };
      })
      .filter((section) => Number.isFinite(section.positionSeconds))
      .sort((a, b) => a.positionSeconds - b.positionSeconds);
  }, [sections, sectionMarkers]);
  const markerList = [...markers].sort(
    (a, b) =>
      Number(a.start ?? a.timeSec ?? 0) - Number(b.start ?? b.timeSec ?? 0),
  );
  const automationList = [...automationEvents].sort(
    (a, b) => (a.timeSec || 0) - (b.timeSec || 0),
  );

  // ── Segment widths (for color strip + bar coloring) ────────────────────
  const segments = useMemo(() => {
    const segs = [];
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const next = sorted[i + 1];
      const start = s.positionSeconds || 0;
      const end = next ? next.positionSeconds || total : total;
      segs.push({
        label: s.label || "SECTION",
        color: s.color || null, // carry explicit color from sectionJumpList
        width: Math.max(2, ((end - start) / total) * 100),
      });
    }
    // Fall back to default layout when <= 2 sections (no meaningful color contrast)
    if (segs.length <= 2) {
      return DEFAULT_SECTIONS_PCT.map((d) => ({
        label: d.label,
        color: null,
        width: (d.e - d.s) * 100,
      }));
    }
    return segs;
  }, [sorted, total]);

  // ── Synthetic or real waveform bars ────────────────────────────────────
  const bars = useMemo(() => {
    const peakValues = Array.isArray(waveformPeaks?.peaks)
      ? waveformPeaks.peaks
      : Array.isArray(waveformPeaks)
        ? waveformPeaks
        : null;
    if (peakValues && peakValues.length > 0) {
      // Normalize + smooth for consistent visual quality regardless of source gain
      const processed = smoothPeaks(normalizePeaksRange(peakValues), 2);
      const stride =
        processed.length > ADAPTIVE_BAR_COUNT
          ? Math.ceil(processed.length / ADAPTIVE_BAR_COUNT)
          : 1;
      return processed.filter((_, i) => i % stride === 0).slice(0, ADAPTIVE_BAR_COUNT);
    }
    const rng = makeRng(songTitle || "song");
    const totalW = segments.reduce((s, g) => s + g.width, 0) || 100;
    let cum = 0;
    const bounds = segments.map((seg) => {
      const st = cum / totalW;
      cum += seg.width;
      return { label: seg.label, start: st, end: cum / totalW };
    });
    return Array.from({ length: ADAPTIVE_BAR_COUNT }, (_, i) => {
      const pct = i / ADAPTIVE_BAR_COUNT;
      const sec = bounds.find((b) => pct >= b.start && pct < b.end);
      const lbl = normLabel(sec?.label || "");
      const amp =
        lbl === "chorus"
          ? 0.72
          : lbl === "bridge"
            ? 0.62
            : lbl === "intro"
              ? 0.25
              : lbl === "outro"
                ? 0.22
                : 0.48;
      return Math.min(1, amp + rng() * 0.36);
    });
  }, [waveformPeaks, songTitle, segments]);

  const clampedPlayhead =
    typeof playheadPct === "number"
      ? Math.min(1, Math.max(0, playheadPct))
      : null;

  // ── Role color ────────────────────────────────────────────────────────
  const roleKey = userRole
    ? String(userRole).toLowerCase().replace(/[\s-]/g, "_")
    : null;
  const roleColor = roleKey ? ROLE_COLORS[roleKey] || "#4F46E5" : null;
  const roleEmoji = roleKey ? ROLE_EMOJIS[roleKey] || "🎵" : null;

  // ── BPM grid ──────────────────────────────────────────────────────────
  const beatCount = bpm > 0 && total > 0 ? Math.floor((total * bpm) / 60) : 0;
  const beatTicks =
    beatCount > 0 && beatCount < 512
      ? Array.from({ length: beatCount }, (_, i) => {
          const t = ((i + 1) * 60) / bpm;
          if (t >= total) return null;
          return { key: i, pct: (t / total) * 100, isBar: (i + 1) % 4 === 0 };
        }).filter(Boolean)
      : [];

  // ── Time Ticks (DAW-style) ─────────────────────────────────────────────
  const timeTicks = useMemo(() => {
    if (total <= 0) return [];
    // Show a tick every 30s or 60s depending on length
    const interval = total > 600 ? 60 : 30;
    const count = Math.floor(total / interval);
    return Array.from({ length: count }, (_, i) => {
      const s = (i + 1) * interval;
      return {
        key: `t-${s}`,
        label: fmtSec(s),
        pct: (s / total) * 100,
      };
    });
  }, [total]);

  function updateContainerMetrics() {
    if (!containerRef.current?.measureInWindow) return;
    containerRef.current.measureInWindow((x) => {
      containerPageXRef.current = x;
    });
  }

  function timeFromPageX(pageX) {
    const width = widthRef.current || 1;
    const localX = pageX - (containerPageXRef.current || 0);
    const frac = Math.max(0, Math.min(1, localX / width));
    return frac * total;
  }

  // ── Seek on tap (background waveform area) ───────────────────────────
  function handleSeekPress(e) {
    if (!onSeek) return;
    const frac = Math.max(
      0,
      Math.min(1, e.nativeEvent.locationX / (widthRef.current || 1)),
    );
    onSeek(frac * total);
  }

  // ── Long press → add marker at that position ─────────────────────────
  function handleLongPress(e) {
    if (!onAddMarker) return;
    const frac = Math.max(
      0,
      Math.min(1, e.nativeEvent.locationX / (widthRef.current || 1)),
    );
    onAddMarker(frac * total);
  }

  // ── Active section (used for bar focus + loop region) ────────────────
  const activeSection = sectionMarkers.find(
    (s) => s.label === activeSectionLabel,
  );
  // Pre-computed for bar rendering — null if no active section
  const activeSec = activeSection || null;
  const loopRegionPct = activeSection
    ? {
        left: `${(activeSection.timeSec / total) * 100}%`,
        width: `${((activeSection.endTimeSec - activeSection.timeSec) / total) * 100}%`,
        color: activeSection.color,
      }
    : null;

  // ── Format time helper ────────────────────────────────────────────────
  function fmtSec(s) {
    const t = Math.max(0, Math.floor(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  }

  return (
    <View style={styles.container}>
      {/* ── Main waveform area ──────────────────────────────────────────── */}
      <TouchableOpacity
        ref={containerRef}
        activeOpacity={1}
        onPress={handleSeekPress}
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={[styles.waveBar, heightProp && { height: heightProp }]}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          updateContainerMetrics();
        }}
      >
        {/* Section color strip — bottom */}
        <View style={styles.sectionStrip} pointerEvents="none">
          {segments.map((seg, idx) => {
            const c =
              seg.color || SECTION_COLORS[normLabel(seg.label)] || "#4F46E5";
            return (
              <View
                key={seg.label + idx}
                style={[
                  styles.sectionSegment,
                  { flex: seg.width, backgroundColor: c },
                ]}
              />
            );
          })}
        </View>

        {/* Loop region highlight */}
        {loopRegionPct && (
          <View
            pointerEvents="none"
            style={[
              styles.loopRegion,
              {
                left: loopRegionPct.left,
                width: loopRegionPct.width,
                backgroundColor:
                  loopRegionPct.color + (sectionLoopActive ? "28" : "16"),
                borderColor:
                  loopRegionPct.color + (sectionLoopActive ? "80" : "40"),
              },
            ]}
          />
        )}

        {/* Section boundary lines — subtle vertical dividers at each section start */}
        {sorted.length > 1 &&
          sorted.slice(1).map((sec, i) => {
            const posLeft = ((sec.positionSeconds || 0) / total) * 100;
            const secColor =
              sec.color ||
              SECTION_COLORS[normLabel(sec.label || "")] ||
              "#6366F1";
            return (
              <View
                key={`secbound-${i}`}
                pointerEvents="none"
                style={[
                  styles.sectionBoundaryLine,
                  {
                    left: `${posLeft}%`,
                    backgroundColor: secColor + "55",
                  },
                ]}
              />
            );
          })}

        {/* Waveform bars — two-tone frequency simulation (bass zone + high zone) */}
        <View style={[styles.peaksRow, isIpad && { top: 52, bottom: 12, left: 6, right: 6 }]} pointerEvents="none">
          {bars.map((v, idx) => {
            const pct = idx / bars.length;
            const isPast = clampedPlayhead != null && pct < clampedPlayhead;
            // find section segment for this bar
            let cumW = 0;
            const seg = segments.find((s) => {
              const st = cumW / 100;
              cumW += s.width;
              return pct * 100 >= st * 100 && pct * 100 < cumW;
            });
            const segKey = normLabel(seg?.label || "");
            const sectionColor =
              seg?.color || SECTION_COLORS[segKey] || "#6366F1";
            const highColor = HIGH_FREQ_COLORS[segKey] || sectionColor;
            const baseColor = sectionColor;

            // Active section focus: playing section = bright, others = very dim
            const barTimeSec = pct * total;
            const inActiveSec = activeSec
              ? barTimeSec >= (activeSec.timeSec || 0) &&
                barTimeSec < (activeSec.endTimeSec || total)
              : false;
            const isIdle = clampedPlayhead == null || clampedPlayhead === 0;
            // alpha: idle=full, played=full, active-future=55%, inactive=13%
            const barAlpha = isIdle
              ? 1.0
              : isPast
                ? 0.95
                : inActiveSec
                  ? 0.8
                  : 0.3;

            return (
              <View
                key={`b${idx}`}
                style={[styles.peakBar, { height: `${Math.max(5, v * 100)}%` }]}
              >
                {/* Simulated high-frequency zone (lighter top) */}
                <View
                  style={[
                    styles.barHighFreq,
                    isIpad && { height: "25%" },
                    { backgroundColor: highColor, opacity: barAlpha },
                  ]}
                />
                <View
                  style={[
                    styles.barSolid,
                    { backgroundColor: baseColor, opacity: barAlpha },
                  ]}
                />
              </View>
            );
          })}
        </View>

        {/* Time Scale — subtle markers across bottom */}
        {timeTicks.map((tick) => (
          <View
            key={tick.key}
            pointerEvents="none"
            style={[styles.timeTickLine, { left: `${tick.pct}%` }]}
          >
            <Text style={styles.timeTickLabel}>{tick.label}</Text>
          </View>
        ))}

        {/* Played region shading */}
        {clampedPlayhead != null && clampedPlayhead > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.playedRegion,
              {
                width: `${clampedPlayhead * 100}%`,
                backgroundColor: roleColor
                  ? roleColor + "1A"
                  : "rgba(99,102,241,0.14)",
              },
            ]}
          />
        )}

        {/* BPM beat grid */}
        {beatTicks.map((tick) => (
          <View
            key={`bt${tick.key}`}
            pointerEvents="none"
            style={[
              tick.isBar ? styles.barTick : styles.beatTick,
              { left: `${tick.pct}%` },
            ]}
          />
        ))}

        {/* User marker blocks — tappable, show label */}
        {markerList.map((m, idx) => {
          const markerStart = Number(m.start ?? m.timeSec ?? 0);
          const markerEnd = Number(m.end ?? m.timeSec ?? markerStart);
          const pointMarker =
            m.resizable === false || Math.abs(markerEnd - markerStart) < 0.12;
          const left = ((markerStart || 0) / total) * 100;
          const width = pointMarker
            ? 0
            : Math.max(
                1.5,
                (((markerEnd || 0) - (markerStart || 0)) / total) * 100,
              );
          const col = m.color || "#4F46E5";
          const markerId = String(m.id || `${m.label}-${idx}`);
          const typeTag = m.type ? String(m.type).toUpperCase() : "";
          const isDraggable = typeof onMarkerDrag === "function";
          const bodyKey = `${markerId}:move`;
          const leftKey = `${markerId}:resize-left`;
          const rightKey = `${markerId}:resize-right`;

          const startDrag = (key, mode, pageX) => {
            updateContainerMetrics();
            dragStateRef.current = {
              key,
              mode,
              offsetSec:
                mode === "move" ? timeFromPageX(pageX) - markerStart : 0,
              startX: pageX,
              moved: false,
            };
          };

          const computeNextValue = (mode, pageX) => {
            const normalized = Math.max(
              0,
              Math.min(total, timeFromPageX(pageX)),
            );
            if (mode === "move") {
              return Math.max(
                0,
                Math.min(total, normalized - dragStateRef.current.offsetSec),
              );
            }
            return normalized;
          };

          const handleDragMove = (key, mode) => (e, gestureState) => {
            if (!isDraggable && mode !== "move") return;
            if (dragStateRef.current.key !== key) return;
            const pageX = gestureState?.moveX || e?.nativeEvent?.pageX || 0;
            const moved = Math.abs(pageX - dragStateRef.current.startX) > 3;
            if (moved) dragStateRef.current.moved = true;
            const nextValue = computeNextValue(mode, pageX);
            onMarkerDrag?.(m, nextValue, false, mode);
          };

          const handleDragEnd = (key, mode) => (e, gestureState) => {
            if (!isDraggable && mode !== "move") {
              if (mode === "move") onMarkerTap?.(m);
              return;
            }
            if (dragStateRef.current.key !== key) {
              if (mode === "move") onMarkerTap?.(m);
              return;
            }
            const pageX = gestureState?.moveX || e?.nativeEvent?.pageX || 0;
            const nextValue = computeNextValue(mode, pageX);
            const moved =
              dragStateRef.current.moved ||
              Math.abs(pageX - dragStateRef.current.startX) > 3;
            if (moved) {
              onMarkerDrag?.(m, nextValue, true, mode);
            } else if (mode === "move") {
              onMarkerTap?.(m);
            }
            dragStateRef.current = {
              key: null,
              mode: "move",
              offsetSec: 0,
              startX: 0,
              moved: false,
            };
          };

          const handleBodyStart = (e, gestureState) => {
            if (!isDraggable) return;
            const pageX = gestureState?.x0 || e?.nativeEvent?.pageX || 0;
            startDrag(bodyKey, "move", pageX);
          };

          const handleLeftStart = (e, gestureState) => {
            if (!isDraggable) return;
            const pageX = gestureState?.x0 || e?.nativeEvent?.pageX || 0;
            startDrag(leftKey, "resize-left", pageX);
          };

          const handleRightStart = (e, gestureState) => {
            if (!isDraggable) return;
            const pageX = gestureState?.x0 || e?.nativeEvent?.pageX || 0;
            startDrag(rightKey, "resize-right", pageX);
          };

          const rightPct = Math.min(100, left + width);

          return (
            <React.Fragment key={m.id || `${m.label}-${idx}`}>
              {/* Prominent vertical marker line */}
              <View
                pointerEvents="none"
                style={[
                  styles.userMarkerLine,
                  { left: `${left}%`, backgroundColor: col },
                ]}
              />
              {/* Label flag at top (drag handle) */}
              <View
                style={[
                  styles.userMarkerFlag,
                  pointMarker && styles.userMarkerFlagPoint,
                  {
                    left: `${left}%`,
                    backgroundColor: "rgba(10, 15, 30, 0.75)",
                    borderColor: col + "60",
                    borderWidth: 1,
                  },
                ]}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onStartShouldSetResponderCapture={() => isDraggable}
                onResponderGrant={handleBodyStart}
                onResponderMove={handleDragMove(bodyKey, "move")}
                onResponderRelease={handleDragEnd(bodyKey, "move")}
                onResponderTerminate={handleDragEnd(bodyKey, "move")}
                onResponderTerminationRequest={() => false}
              >
                {typeTag ? (
                  <Text style={styles.userMarkerTag} numberOfLines={1}>
                    {typeTag}
                  </Text>
                ) : null}
                <Text
                  style={[
                    styles.userMarkerFlagText,
                    { color: col },
                    pointMarker && { fontSize: 10 },
                  ]}
                  numberOfLines={1}
                >
                  {m.label}
                </Text>
              </View>
              {!pointMarker && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.markerBlock,
                    {
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: col + "33",
                      borderLeftColor: col,
                      borderLeftWidth: 2,
                    },
                  ]}
                />
              )}
              {isDraggable && !pointMarker && (
                <>
                  <View
                    pointerEvents="auto"
                    style={[
                      styles.markerHandle,
                      { left: `${left}%`, backgroundColor: col + "33" },
                    ]}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={handleLeftStart}
                    onResponderMove={handleDragMove(leftKey, "resize-left")}
                    onResponderRelease={handleDragEnd(leftKey, "resize-left")}
                    onResponderTerminate={handleDragEnd(leftKey, "resize-left")}
                    onResponderTerminationRequest={() => false}
                  >
                    <View
                      style={[
                        styles.markerHandleGrip,
                        { backgroundColor: col + "EE" },
                      ]}
                    />
                  </View>
                  <View
                    pointerEvents="auto"
                    style={[
                      styles.markerHandle,
                      { left: `${rightPct}%`, backgroundColor: col + "33" },
                    ]}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={handleRightStart}
                    onResponderMove={handleDragMove(rightKey, "resize-right")}
                    onResponderRelease={handleDragEnd(rightKey, "resize-right")}
                    onResponderTerminate={handleDragEnd(
                      rightKey,
                      "resize-right",
                    )}
                    onResponderTerminationRequest={() => false}
                  >
                    <View
                      style={[
                        styles.markerHandleGrip,
                        { backgroundColor: col + "EE" },
                      ]}
                    />
                  </View>
                </>
              )}
            </React.Fragment>
          );
        })}

        {/* ── Section marker pins ─────────────────────────────────────── */}
        {sectionMarkers.map((sec, secIdx) => {
          const displayLabel = cleanLabel(sec.label);
          const leftPct = (sec.timeSec / total) * 100;
          const isActive =
            activeSectionLabel === sec.label ||
            activeSectionLabel === displayLabel;
          const secKey = String(
            sec?.markerId || sec?.id || `${sec.label}-${secIdx}`,
          );
          const tapCount = tapVisual[secKey] || 0;
          const isLoop = (isActive && sectionLoopActive) || tapCount === 2;
          const isWorship = tapCount === 3;
          const color = sec.color;
          const canDragSection = typeof onSectionMarkerDrag === "function";
          const showEditAccent = sectionEditMode && typeof onSectionMenu === "function";
          // Oversized touch targets for iPad mini / Stage use
          const pinHeight = isIpad ? 44 : 32; 
          const pinMinWidth = isIpad ? 84 : 64;
          const pinPaddingHorizontal = isIpad ? 16 : 12;
          const pinPaddingVertical = isIpad ? 14 : 10;
          const pinMarginLeft = -4;
          const pinRadius = isIpad ? 10 : 8;
          const pinGap = isIpad ? 8 : 6;
          const lineTop = 0;

          // Pin icon based on tap state
          let pinIcon = null;
          if (isWorship) pinIcon = "🙏";
          else if (isLoop) pinIcon = "🔁";
          else if (tapCount === 1) pinIcon = "▶";

          const handlePinDragStart = (e, gestureState) => {
            updateContainerMetrics();
            const pageX = gestureState?.x0 || e?.nativeEvent?.pageX || 0;
            sectionDragStateRef.current = {
              id: secKey,
              offsetSec: timeFromPageX(pageX) - Number(sec.timeSec || 0),
              startX: pageX,
              moved: false,
            };
            // Long-press timer → open menu
            if (secLongPressRef.current) clearTimeout(secLongPressRef.current);
            secLongPressRef.current = setTimeout(() => {
              if (
                !sectionDragStateRef.current?.moved &&
                sectionDragStateRef.current?.id === secKey
              ) {
                sectionDragStateRef.current = {
                  id: null,
                  offsetSec: 0,
                  startX: 0,
                  moved: false,
                };
                onSectionMenu?.(sec);
              }
            }, 500);
          };

          const handlePinDragMove = (e, gestureState) => {
            if (sectionDragStateRef.current.id !== secKey) return;
            const pageX = gestureState?.moveX || e?.nativeEvent?.pageX || 0;
            const moved =
              Math.abs(pageX - sectionDragStateRef.current.startX) > 5;
            if (moved) {
              sectionDragStateRef.current.moved = true;
              if (secLongPressRef.current) {
                clearTimeout(secLongPressRef.current);
                secLongPressRef.current = null;
              }
            }
            if (canDragSection && moved) {
              const nextTimeSec = Math.max(
                0,
                Math.min(
                  total,
                  timeFromPageX(pageX) - sectionDragStateRef.current.offsetSec,
                ),
              );
              onSectionMarkerDrag?.(sec, nextTimeSec, false);
            }
          };

          const handlePinDragEnd = (e, gestureState) => {
            if (secLongPressRef.current) {
              clearTimeout(secLongPressRef.current);
              secLongPressRef.current = null;
            }
            const pageX = gestureState?.moveX || e?.nativeEvent?.pageX || 0;
            const moved =
              sectionDragStateRef.current.moved ||
              Math.abs(pageX - sectionDragStateRef.current.startX) > 5;
            const nextTimeSec = Math.max(
              0,
              Math.min(
                total,
                timeFromPageX(pageX) - sectionDragStateRef.current.offsetSec,
              ),
            );
            if (canDragSection && sectionDragStateRef.current.id === secKey) {
              if (moved) {
                onSectionMarkerDrag?.(sec, nextTimeSec, true);
              } else {
                handleMarkerPress(sec);
              }
            } else if (!canDragSection) {
              handleMarkerPress(sec);
            }
            sectionDragStateRef.current = {
              id: null,
              offsetSec: 0,
              startX: 0,
              moved: false,
            };
          };

          return (
            <React.Fragment key={secKey}>
              {/* Full-height vertical line — DAW region boundary */}
              <View
                pointerEvents="none"
                style={[
                  styles.markerLine,
                  {
                    top: lineTop,
                    left: `${leftPct}%`,
                    width: isActive ? 2 : 1,
                    backgroundColor: isActive ? color : color + "77",
                  },
                ]}
              />
              {/* DAW-style label flag at top — drag handle */}
              <View
                style={[
                  styles.markerPin,
                  {
                    left: `${leftPct}%`,
                    height: pinHeight,
                    minWidth: pinMinWidth,
                    paddingHorizontal: pinPaddingHorizontal,
                    paddingVertical: pinPaddingVertical,
                    marginLeft: 2,
                    borderRadius: pinRadius,
                    gap: pinGap,
                    borderColor: showEditAccent
                      ? "#FCD34D"
                      : isActive
                        ? "#FFF"
                        : color + "60",
                    backgroundColor: showEditAccent
                      ? "rgba(245, 158, 11, 0.15)"
                      : isActive
                        ? color
                        : "rgba(10, 15, 30, 0.85)",
                    borderWidth: isActive ? 2 : 1,
                    shadowColor: color,
                    shadowOpacity: isActive ? 0.6 : 0,
                    shadowRadius: 10,
                  },
                ]}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onStartShouldSetResponderCapture={() => canDragSection}
                onResponderGrant={handlePinDragStart}
                onResponderMove={handlePinDragMove}
                onResponderRelease={handlePinDragEnd}
                onResponderTerminate={handlePinDragEnd}
                onResponderTerminationRequest={() => false}
              >
                {pinIcon ? (
                  <Text style={[styles.markerPinIcon, { fontSize: isIpad ? 14 : 10, color: isActive ? "#FFF" : color }]}>
                    {pinIcon}
                  </Text>
                ) : null}
                <Text
                  style={[
                    styles.markerPinText,
                    {
                      fontSize: isIpad ? 13 : 10,
                      fontWeight: "800",
                      color: showEditAccent
                        ? "#FCD34D"
                        : isActive
                          ? "#FFF"
                          : color,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {displayLabel}
                </Text>
                {tapCount > 0 && (
                  <View style={[styles.tapDot, { backgroundColor: isActive ? "#FFF" : color, width: isIpad ? 20 : 16, height: isIpad ? 20 : 16, borderRadius: isIpad ? 10 : 8 }]}>
                    <Text style={[styles.tapDotText, { color: "#000", fontSize: isIpad ? 10 : 8 }]}>
                      {tapCount}
                    </Text>
                  </View>
                )}
              </View>
            </React.Fragment>
          );
        })}

        {/* Playhead — glow halo + sharp line + diamond head */}
        {clampedPlayhead != null && (
          <View
            pointerEvents="none"
            style={[styles.playheadWrap, { left: `${clampedPlayhead * 100}%` }]}
          >
            {/* Soft glow halo */}
            <View style={styles.playheadGlow} />
            {/* Sharp playhead line */}
            <View style={styles.playheadLine} />
            {/* Diamond head at top */}
            <View style={styles.playheadDiamond} />
          </View>
        )}

        {/* Worship Free / Flow State Overlay */}
        {worshipFreeActive && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.worshipFreeOverlay,
              {
                opacity: pulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.05, 0.25],
                }),
              },
            ]}
          >
            <View style={styles.worshipFreeBadge}>
              <Text style={styles.worshipFreeBadgeText}>🙏 AMBIENT FLOW ACTIVE</Text>
            </View>
          </Animated.View>
        )}
      </TouchableOpacity>

      {/* ── Automation lane ─────────────────────────────────────────────── */}
      {automationList.length > 0 && (
        <View style={styles.automationLane}>
          {automationList.map((ev, idx) => {
            const left = `${Math.min(100, Math.max(0, ((ev.timeSec || 0) / total) * 100))}%`;
            const color =
              ev.type === "MIDI"
                ? "#22D3EE"
                : ev.type === "LIGHTS"
                  ? "#F59E0B"
                  : "#A78BFA";
            return (
              <View
                key={ev.id || `${ev.type}_${idx}`}
                style={[styles.automationDot, { left, backgroundColor: color }]}
              />
            );
          })}
        </View>
      )}

      {/* ── Role cue ────────────────────────────────────────────────────── */}
      {!!roleCue && !!roleColor && (
        <View style={styles.roleCueRow}>
          <Text
            style={[styles.roleCueText, { color: roleColor }]}
            numberOfLines={2}
          >
            {roleEmoji}
            {"  "}
            {roleCue}
          </Text>
        </View>
      )}
    </View>
  );
}

const MARKER_PIN_TOP = 0;
const MARKER_PIN_HEIGHT = 26;

const styles = StyleSheet.create({
  container: { marginTop: 8, marginBottom: 4 },

  waveBar: {
    borderRadius: 12,
    backgroundColor: "#050C1A",
    borderWidth: 1.2,
    borderColor: "#1E293B",
    height: 240, // Default height for phone
    position: "relative",
    overflow: "hidden",
  },

  // Section color strip
  sectionStrip: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 6,
    flexDirection: "row",
  },
  sectionSegment: { height: 6 },

  // Loop region overlay
  loopRegion: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderWidth: 1,
    borderRadius: 6,
  },

  // Waveform bars
  peaksRow: {
    position: "absolute",
    left: 3,
    right: 3,
    top: MARKER_PIN_HEIGHT + 4,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  // Two-tone bar container
  peakBar: {
    flex: 1,
    borderRadius: 1.5,
    overflow: "hidden",
    flexDirection: "column",
  },
  barHighFreq: { height: "35%", opacity: 0.8 },
  barSolid: { flex: 1 },

  // Section boundary line — full height through entire waveform
  sectionBoundaryLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
  },

  // Time Scale Ticks
  timeTickLine: {
    position: "absolute",
    bottom: 0,
    height: 14,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  timeTickLabel: {
    position: "absolute",
    bottom: 16,
    left: 4,
    fontSize: 9,
    fontWeight: "700",
    color: "rgba(255,255,255,0.4)",
    fontVariant: ["tabular-nums"],
  },

  // Played region
  playedRegion: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(99,102,241,0.14)",
  },

  // BPM grid
  beatTick: {
    position: "absolute",
    top: "35%",
    bottom: "25%",
    width: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  barTick: {
    position: "absolute",
    top: "15%",
    bottom: "10%",
    width: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
  },

  // User markers
  userMarkerLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    opacity: 0.85,
    zIndex: 15,
  },
  userMarkerFlag: {
    position: "absolute",
    top: MARKER_PIN_TOP,
    height: MARKER_PIN_HEIGHT,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 16,
    minWidth: 48,
    marginLeft: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  userMarkerFlagPoint: {
    height: MARKER_PIN_HEIGHT + 4,
    minWidth: 68,
    maxWidth: 148,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  userMarkerTag: {
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    color: "#fff",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  userMarkerFlagText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  markerBlock: {
    position: "absolute",
    top: MARKER_PIN_TOP + MARKER_PIN_HEIGHT + 2,
    bottom: 7,
    borderRadius: 4,
    overflow: "hidden",
  },
  markerBlockLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 0.3 },
  markerHandle: {
    position: "absolute",
    top: MARKER_PIN_TOP,
    height: MARKER_PIN_HEIGHT,
    width: 22,
    marginLeft: -11,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  markerHandleGrip: {
    width: 4,
    height: "65%",
    borderRadius: 2,
    backgroundColor: "#fff",
    opacity: 0.85,
  },

  // Section marker pins — DAW-style
  markerLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    borderRadius: 1,
    zIndex: 18,
  },
  markerPin: {
    position: "absolute",
    top: MARKER_PIN_TOP,
    height: MARKER_PIN_HEIGHT,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    zIndex: 20,
    minWidth: 48,
    marginLeft: -2,
  },
  markerPinIcon: { fontSize: 10 },
  markerPinText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  tapDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  tapDotText: { color: "#000", fontSize: 9, fontWeight: "900" },

  // Playhead — glow + sharp line + diamond
  playheadWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 13,
    marginLeft: -6,
    alignItems: "center",
  },
  playheadGlow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 11,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  playheadLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2.5,
    backgroundColor: "#FFFFFF",
    opacity: 0.95,
  },
  playheadDiamond: {
    position: "absolute",
    top: 3,
    width: 10,
    height: 10,
    backgroundColor: "#FFFFFF",
    transform: [{ rotate: "45deg" }],
  },

  // Worship Free / Flow State
  worshipFreeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#8B5CF6",
    zIndex: 99,
    justifyContent: "center",
    alignItems: "center",
  },
  worshipFreeBadge: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.5)",
  },
  worshipFreeBadgeText: {
    color: "#DDD6FE",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  // Time corner
  timeCorner: { position: "absolute", bottom: 8, right: 8 },
  timeCornerText: {
    color: "#374151",
    fontSize: 10,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },

  // Automation lane
  automationLane: {
    marginTop: 5,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#030712",
    borderWidth: 1,
    borderColor: "#111827",
    position: "relative",
  },
  automationDot: {
    position: "absolute",
    top: 2,
    width: 8,
    height: 8,
    borderRadius: 999,
  },

  // Role cue
  roleCueRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 2,
  },
  roleCueText: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
    flex: 1,
  },
});
