import {
  getWaveformAnalysis,
  normalizeWaveformAnalysis,
} from "./waveformService";
import {
  normalizeWaveformPeaks,
  processPeaksForDisplay,
} from "./wavePipelineEngine";
import { parseSectionsForWaveform } from "../utils/parseSectionsForWaveform";

function pickFirstResolvedUrl(...values) {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function firstNonEmptyArray(...candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  }
  return [];
}

function asNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeSectionWindows(sectionList = [], durationSec = 0) {
  const safeDurationSec = Math.max(0, Number(durationSec || 0));
  const sorted = (Array.isArray(sectionList) ? sectionList : [])
    .map((section, index) => {
      const timeSec =
        asNumber(section?.timeSec) ??
        asNumber(section?.positionSeconds) ??
        (asNumber(section?.start_ms) != null ? asNumber(section?.start_ms, 0) / 1000 : null) ??
        (asNumber(section?.position_ms) != null ? asNumber(section?.position_ms, 0) / 1000 : null) ??
        0;
      const explicitEnd =
        asNumber(section?.endTimeSec) ??
        asNumber(section?.endSeconds) ??
        (asNumber(section?.end_ms) != null ? asNumber(section?.end_ms, 0) / 1000 : null);

      return {
        id: String(section?.id || section?.markerId || `sec_${index}`),
        label: String(section?.label || section?.section || section?.name || `Section ${index + 1}`),
        color: section?.color || "#6366F1",
        timeSec: Math.max(0, timeSec),
        explicitEnd,
      };
    })
    .sort((left, right) => left.timeSec - right.timeSec);

  return sorted.map((section, index) => {
    const nextStart = sorted[index + 1]?.timeSec;
    const fallbackEnd =
      nextStart != null
        ? nextStart
        : safeDurationSec > 0
          ? safeDurationSec
          : section.timeSec;

    const endTimeSec = Math.max(
      section.timeSec,
      section.explicitEnd != null ? section.explicitEnd : fallbackEnd,
    );

    return {
      id: section.id,
      label: section.label,
      color: section.color,
      timeSec: section.timeSec,
      positionSeconds: section.timeSec,
      endTimeSec,
    };
  });
}

function buildFallbackSections(song, durationSec = 0) {
  const chart =
    song?.lyricsChordChart ||
    song?.chordChart ||
    song?.chordSheet ||
    song?.lyrics ||
    "";
  const parsed = parseSectionsForWaveform(chart, durationSec);
  if (parsed.length > 0) return normalizeSectionWindows(parsed, durationSec);

  const existing = firstNonEmptyArray(
    song?.sections,
    song?.analysis?.sections,
    song?.latestStemsJob?.result?.sections,
  );
  return normalizeSectionWindows(existing, durationSec);
}

function resolveDurationMs(song, normalized = null) {
  return (
    asNumber(normalized?.duration_ms) ??
    asNumber(song?.analysis?.duration_ms) ??
    asNumber(song?.latestStemsJob?.result?.duration_ms) ??
    null
  );
}

export function resolveSongWaveformSourceUrl(song = null) {
  return pickFirstResolvedUrl(
    song?.sourceUrl,
    song?.audioUrl,
    song?.url,
    song?.audio_url,
    song?.file_url,
    song?.latestStemsJob?.input?.fileUrl,
    song?.latestStemsJob?.input?.sourceUrl,
    song?.latestStemsJob?.sourceUrl,
    song?.latestStemsJob?.result?.sourceUrl,
  );
}

export async function loadSongWavePipeline(
  song = null,
  {
    audioUrl = null,
    title = null,
    waveformPoints = 1280,
    displayPoints = 640,
    includeCues = true,
    includeRuntime = false,
    force = false,
  } = {},
) {
  const sourceUrl = audioUrl || resolveSongWaveformSourceUrl(song);

  let normalized = normalizeWaveformAnalysis(
    song?.analysis || song?.latestStemsJob?.result || {},
    {
      audioUrl: sourceUrl || null,
      waveformPoints,
    },
  );

  if ((force || normalized.peaks.length === 0) && sourceUrl) {
    const remote = await getWaveformAnalysis(
      song?.id || song?.songId || null,
      sourceUrl,
      {
        title: title || song?.title || "Untitled Song",
        waveformPoints,
        nSections: 6,
        includeCues,
        includeRuntime,
        force,
      },
    );
    if (remote) {
      normalized = normalizeWaveformAnalysis(remote, {
        audioUrl: sourceUrl,
        waveformPoints,
      });
    }
  }

  const waveformPeaks = normalizeWaveformPeaks(
    normalized.waveformPeaks ||
      normalized.peaks ||
      song?.analysis?.waveformPeaks ||
      song?.analysis?.peaks ||
      null,
  );
  const durationMs = resolveDurationMs(song, normalized);
  const durationSec = durationMs ? durationMs / 1000 : 0;
  const sections = normalizeSectionWindows(
    firstNonEmptyArray(normalized.sections, normalized.waveformSections),
    durationSec,
  );
  const fallbackSections = sections.length > 0 ? sections : buildFallbackSections(song, durationSec);

  return {
    sourceUrl,
    waveformPointCount: waveformPoints,
    analysis: normalized,
    waveformPeaks,
    displayPeaks: processPeaksForDisplay(waveformPeaks, displayPoints),
    durationMs,
    durationSec,
    bpm:
      asNumber(normalized?.bpm) ??
      asNumber(song?.bpm) ??
      asNumber(song?.analysis?.bpm) ??
      null,
    key:
      normalized?.key ||
      song?.key ||
      song?.originalKey ||
      song?.analysis?.key ||
      null,
    sections: fallbackSections,
    sectionLabels: fallbackSections.map((section) => section.label),
    cues: Array.isArray(normalized?.cues) ? normalized.cues : [],
    worship_intelligence:
      normalized?.worship_intelligence ||
      song?.analysis?.worship_intelligence ||
      null,
    runtime: normalized?.runtime || null,
  };
}

export function buildSongWaveAnalysisPatch(song = null, pipeline = null, extra = {}) {
  const existing = song?.analysis || {};
  const waveformPeaks =
    pipeline?.waveformPeaks ||
    existing?.waveformPeaks ||
    existing?.peaks ||
    null;

  return {
    ...existing,
    ...extra,
    sections:
      firstNonEmptyArray(
        extra.sections,
        pipeline?.sections,
        existing?.sections,
      ) || [],
    cues:
      firstNonEmptyArray(
        extra.cues,
        pipeline?.cues,
        existing?.cues,
      ) || [],
    worship_intelligence:
      extra.worship_intelligence ??
      pipeline?.worship_intelligence ??
      existing?.worship_intelligence ??
      null,
    duration_ms:
      extra.duration_ms ??
      pipeline?.durationMs ??
      existing?.duration_ms ??
      null,
    waveformPeaks,
    peaks: waveformPeaks,
    waveformSourceUrl:
      extra.waveformSourceUrl ||
      pipeline?.sourceUrl ||
      existing?.waveformSourceUrl ||
      null,
    waveformPointCount:
      extra.waveformPointCount ??
      pipeline?.waveformPointCount ??
      existing?.waveformPointCount ??
      null,
    analyzedAt:
      extra.analyzedAt ||
      existing?.analyzedAt ||
      new Date().toISOString(),
  };
}
