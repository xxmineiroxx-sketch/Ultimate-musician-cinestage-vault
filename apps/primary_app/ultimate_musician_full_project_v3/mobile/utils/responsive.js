/**
 * responsive.js — Adaptive layout utility
 *
 * Breakpoints (logical points, not pixels):
 *   phone       : width < 600    (all phones, iPhone SE → Pro Max)
 *   smallTablet : 600–767        (iPad mini, small Android tablets)
 *   tablet      : 768–1023       (iPad regular, iPad Air, Android tablets)
 *   largeTablet : ≥ 1024         (iPad Pro 11", 12.9", 13")
 *
 * Usage:
 *   const R = useResponsive();
 *   <View style={{ padding: R.spacing(16) }}>
 *   <Text style={{ fontSize: R.font(14) }}>
 *   {R.isTablet && <SidePanel />}
 *   <View style={{ flexDirection: R.row }}>   // 'row' on tablet, 'column' on phone
 */

import { useWindowDimensions } from "react-native";

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isPhone = width < 600;
  const isSmallTablet = width >= 600 && width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isLargeTablet = width >= 1024;
  const isAnyTablet = width >= 600;

  // Scale factor relative to a 390px phone baseline
  const scale = Math.min(width / 390, 2.2);

  // Fluid font: scales gently between phone and tablet
  function font(base) {
    if (isPhone) return base;
    if (isSmallTablet) return Math.round(base * 1.1);
    if (isTablet) return Math.round(base * 1.18);
    return Math.round(base * 1.26); // large tablet
  }

  // Fluid spacing: scales more aggressively
  function spacing(base) {
    if (isPhone) return base;
    if (isSmallTablet) return Math.round(base * 1.15);
    if (isTablet) return Math.round(base * 1.25);
    return Math.round(base * 1.35);
  }

  // Container max-width: centered on large tablets
  const contentMaxWidth = isLargeTablet ? 1100 : undefined;
  const containerPadH = isPhone ? 16 : isSmallTablet ? 20 : isTablet ? 28 : 36;

  // Waveform height
  const waveformHeight = isPhone
    ? 170
    : isSmallTablet
      ? 220
      : isTablet
        ? 260
        : 300;

  // Transport bar: single row on any tablet
  const transportWrap = isPhone ? "wrap" : "nowrap";

  // Two-column layout threshold (side-by-side cards)
  const twoCol = isTablet || isLargeTablet;
  const twoColLandscape = isLandscape && isAnyTablet;

  // Row direction: horizontal on tablet landscape, vertical otherwise
  const row = twoColLandscape ? "row" : "column";

  // Home screen mode tiles columns
  const modeCols = isAnyTablet ? 2 : 1;

  // Touch target minimum
  const minTouch = isPhone ? 38 : 44;

  return {
    width,
    height,
    isLandscape,
    isPhone,
    isSmallTablet,
    isTablet,
    isLargeTablet,
    isAnyTablet,
    scale,
    font,
    spacing,
    contentMaxWidth,
    containerPadH,
    waveformHeight,
    transportWrap,
    twoCol,
    twoColLandscape,
    row,
    modeCols,
    minTouch,
  };
}

export default useResponsive;
