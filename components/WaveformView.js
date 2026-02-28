import React, { useMemo } from "react";
import { View } from "react-native";
import Svg, { Rect, Line } from "react-native-svg";

/**
 * peaks: array of 0..1 floats
 * progress: 0..1 playhead position
 */
export default function WaveformView({
  peaks = [],
  width = 360,
  height = 110,
  progress = 0,
}) {
  const bars = useMemo(() => {
    if (!peaks?.length) return [];
    const n = peaks.length;
    const barW = Math.max(1, Math.floor(width / n));
    return peaks.map((p, i) => {
      const h = Math.max(1, Math.floor(p * height));
      return {
        x: i * barW,
        y: Math.floor((height - h) / 2),
        w: barW,
        h,
      };
    });
  }, [peaks, width, height]);

  const playX = Math.max(0, Math.min(width, Math.floor(progress * width)));

  return (
    <View style={{ width, height, borderRadius: 12, overflow: "hidden" }}>
      <Svg width={width} height={height}>
        {bars.map((b, idx) => (
          <Rect
            key={idx}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill="rgba(255,255,255,0.55)"
          />
        ))}
        <Line
          x1={playX}
          y1={0}
          x2={playX}
          y2={height}
          stroke="rgba(34,197,94,1)"
          strokeWidth="2"
        />
      </Svg>
    </View>
  );
}
