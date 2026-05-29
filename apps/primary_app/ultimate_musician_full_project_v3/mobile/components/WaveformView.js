/**
 * WaveformView.js — Thin wrapper around UltimateWaveform.
 *
 * Drop-in replacement for the old SVG-based waveform.
 * Props are compatible with both old and new callers.
 */
'use strict';

import React from 'react';
import UltimateWaveform from './UltimateWaveform';

/**
 * @param {Object} props
 * @param {number[]} props.peaks         - Peak array (0–1 floats)
 * @param {number}   props.playProgress  - 0–1 playback progress (old prop name)
 * @param {number}   props.progress      - 0–1 playback progress (alternate legacy prop)
 * @param {number}   props.currentTime   - seconds (new prop name, preferred)
 * @param {number}   props.duration      - total seconds
 * @param {Function} props.onSeek        - (timeSeconds) => void
 * @param {Array}    props.sections      - from parseSectionsForWaveform
 * @param {number}   props.bpm           - for beat grid
 * @param {number}   props.height        - component height (default 72)
 * @param {number}   props.width         - ignored (UltimateWaveform fills its container)
 * @param {string}   props.accentColor   - played region color
 * @param {number|null} props.loopStartPct
 * @param {number|null} props.loopEndPct
 * @param {Object}   props.style
 */
export default function WaveformView({
  peaks = [],
  playProgress = 0,   // legacy prop (0–1)
  progress,           // alternate legacy prop (0–1)
  currentTime,        // preferred (seconds)
  duration = 0,
  onSeek,
  sections = [],
  bpm = 0,
  height = 72,
  width,              // accepted but ignored — UltimateWaveform fills its container
  accentColor = '#6366F1',
  loopStartPct = null,
  loopEndPct = null,
  style,
}) {
  // Resolve currentTime from new prop, then legacy playProgress, then legacy progress
  const legacyPct = progress != null ? progress : playProgress;
  const resolvedTime =
    currentTime != null
      ? currentTime
      : duration > 0
      ? legacyPct * duration
      : 0;

  return (
    <UltimateWaveform
      peaks={peaks}
      duration={duration}
      currentTime={resolvedTime}
      onSeek={onSeek}
      sections={sections}
      bpm={bpm}
      height={height}
      accentColor={accentColor}
      loopStartPct={loopStartPct}
      loopEndPct={loopEndPct}
      style={style}
    />
  );
}
