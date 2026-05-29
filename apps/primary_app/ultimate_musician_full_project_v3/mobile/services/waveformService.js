/**
 * waveformService.js
 * Unified Ultimate Musician waveform pipeline on top of CineStage.
 *
 * This service normalizes all waveform payloads into one shape so Song Details,
 * Rehearsal, Library previews, and Waveform Detail all consume the same data.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { CINESTAGE_API_BASE_URL } from "./cinestage/config";
import {
  analyzeWaveform as analyzeWaveformRequest,
  getABStatus as getABStatusRequest,
  getWaveformCues as getWaveformCuesRequest,
  waveformHealth as waveformHealthRequest,
} from "./cinestage/client";

const CACHE_PREFIX = "um.waveform.v1.";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cacheKey(songId, resolutionKey = "") {
  return resolutionKey
    ? `${CACHE_PREFIX}${songId}:${resolutionKey}`
    : `${CACHE_PREFIX}${songId}`;
}

function resolutionKey(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "";
}

function asNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstNonEmptyArray(...candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  }
  return [];
}

function normalizeWaveformSection(section, index = 0) {
  const startMsFromSeconds =
    asNumber(section?.positionSeconds) != null
      ? Math.round(asNumber(section?.positionSeconds, 0) * 1000)
      : asNumber(section?.timeSec) != null
        ? Math.round(asNumber(section?.timeSec, 0) * 1000)
        : asNumber(section?.time_sec) != null
          ? Math.round(asNumber(section?.time_sec, 0) * 1000)
          : null;

  const startMs =
    asNumber(section?.start_ms) ??
    asNumber(section?.position_ms) ??
    startMsFromSeconds ??
    asNumber(section?.position, null);

  return {
    id:
      section?.id ||
      `${String(section?.label || section?.section || section?.name || "section")
        .toLowerCase()
        .replace(/\s+/g, "_")}_${index}`,
    label: section?.label || section?.section || section?.name || "Section",
    section: section?.section || section?.label || section?.name || "Section",
    start_ms: startMs ?? 0,
    end_ms: asNumber(section?.end_ms) ?? null,
    position: asNumber(section?.position) ?? (startMs ?? 0),
    positionSeconds:
      asNumber(section?.positionSeconds) ??
      asNumber(section?.timeSec) ??
      (startMs != null ? startMs / 1000 : null),
  };
}

function normalizeWaveformCues(cues = []) {
  return toArray(cues)
    .map((cue, index) => {
      if (typeof cue === "string") {
        return {
          id: `cue_${index}`,
          text: cue,
          label: cue,
        };
      }
      return {
        id: cue?.id || `cue_${index}`,
        text: cue?.text || cue?.label || cue?.cue || "",
        label: cue?.label || cue?.text || cue?.cue || "Cue",
        section: cue?.section || cue?.targetSection || null,
        time_ms:
          asNumber(cue?.time_ms) ??
          asNumber(cue?.position_ms) ??
          null,
      };
    })
    .filter((cue) => cue.text || cue.label);
}

async function maybeBackfillWorshipIntelligence(
  data,
  {
    songId,
    audioUrl,
    title,
    waveformPoints,
    nSections,
    includeCues,
    includeRuntime,
    resKey,
  } = {},
) {
  if (!data || data.worship_intelligence || !audioUrl) return data;

  try {
    const raw = await analyzeWaveformRequest({
      audioUrl,
      audio_url: audioUrl,
      file_url: audioUrl,
      fileUrl: audioUrl,
      songId: songId || undefined,
      song_id: songId || undefined,
      title,
      waveform_points: waveformPoints,
      waveformPoints,
      n_bars: waveformPoints,
      nBars: waveformPoints,
      n_sections: nSections,
      nSections,
      force: true,
      refresh: true,
    });

    const normalized = normalizeWaveformAnalysis(raw, {
      audioUrl,
      waveformPoints,
    });

    if (songId && normalized.peaks.length > 0) {
      await cacheWaveform(songId, normalized, resKey);
    }

    return await enrichWaveform(normalized, songId, {
      includeCues,
      includeRuntime,
    });
  } catch {
    return data;
  }
}

function cueSectionsToMarkers(sections = []) {
  return toArray(sections).map((section, index) => ({
    id:
      section?.id ||
      `${String(section?.type || section?.label || "section")
        .toLowerCase()
        .replace(/\s+/g, "_")}_${index}`,
    text:
      section?.label ||
      section?.labelEn ||
      section?.labelPt ||
      section?.section ||
      "Section",
    label:
      section?.label ||
      section?.labelEn ||
      section?.labelPt ||
      section?.section ||
      "Section",
    section: section?.type || section?.section || section?.label || "section",
    time_ms:
      asNumber(section?.time_ms) ??
      asNumber(section?.position_ms) ??
      (asNumber(section?.timeSec) != null
        ? Math.round(asNumber(section?.timeSec, 0) * 1000)
        : null) ??
      (asNumber(section?.positionSeconds) != null
        ? Math.round(asNumber(section?.positionSeconds, 0) * 1000)
        : null),
  }));
}

export function normalizeWaveformAnalysis(raw, fallback = {}) {
  const analysis =
    raw?.analysis && typeof raw.analysis === "object" ? raw.analysis : {};

  const peaks = firstNonEmptyArray(
    analysis.waveformPeaks,
    analysis.peaks,
    raw?.waveformPeaks,
    raw?.waveform_peaks,
    raw?.peaks,
    fallback.waveformPeaks,
    fallback.peaks,
  );

  const sections = toArray(
    firstNonEmptyArray(
      analysis.sections,
      raw?.sections,
      raw?.waveformSections,
      fallback.sections,
      fallback.waveformSections,
    ),
  ).map(normalizeWaveformSection);

  const cues = normalizeWaveformCues(
    firstNonEmptyArray(
      analysis.cues,
      raw?.cues,
      fallback.cues,
    ),
  );

  const durationMs =
    asNumber(analysis.duration_ms) ??
    asNumber(analysis.durationMs) ??
    asNumber(raw?.duration_ms) ??
    asNumber(raw?.durationMs) ??
    (asNumber(raw?.duration_sec) != null
      ? Math.round(asNumber(raw?.duration_sec, 0) * 1000)
      : null) ??
    (asNumber(raw?.durationSec) != null
      ? Math.round(asNumber(raw?.durationSec, 0) * 1000)
      : null) ??
    asNumber(fallback.duration_ms) ??
    null;

  return {
    raw,
    analysis,
    peaks,
    waveformPeaks: peaks,
    sections,
    waveformSections: sections,
    cues,
    duration_ms: durationMs,
    bpm:
      asNumber(analysis.bpm) ??
      asNumber(raw?.bpm) ??
      asNumber(fallback.bpm) ??
      null,
    key: analysis.key || raw?.key || fallback.key || null,
    waveformSourceUrl:
      fallback.audioUrl ||
      fallback.file_url ||
      raw?.file_url ||
      raw?.audio_url ||
      raw?.audioUrl ||
      null,
    worship_intelligence: analysis.worship_intelligence || raw?.worship_intelligence || null,
    waveformPointCount:
      peaks.length ||
      asNumber(fallback.waveformPoints) ||
      asNumber(fallback.waveform_points) ||
      null,
    cached: Boolean(raw?.cached || fallback.cached),
    runtime: fallback.runtime || null,
  };
}

async function readCached(songId, resolutionValue = "") {
  if (!songId) return null;
  const keys = [
    cacheKey(songId, resolutionValue),
    cacheKey(songId),
  ].filter(Boolean);

  for (const key of keys) {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (!cached) continue;
      const entry = JSON.parse(cached);
      if (Date.now() - entry.cachedAt < CACHE_TTL_MS) {
        return entry.data;
      }
    } catch {
      // Ignore invalid cache entries and keep searching.
    }
  }

  return null;
}

async function cacheWaveform(songId, data, resolutionValue = "") {
  if (!songId) return;
  try {
    await AsyncStorage.setItem(
      cacheKey(songId, resolutionValue),
      JSON.stringify({ data, cachedAt: Date.now() }),
    );
  } catch {
    // Non-fatal cache failure.
  }
}

async function fetchServerWaveform(songId) {
  if (!songId) return null;
  try {
    const response = await fetch(
      `${CINESTAGE_API_BASE_URL}/api/waveform/${encodeURIComponent(songId)}`,
      { signal: AbortSignal.timeout?.(8000) },
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function enrichWaveform(data, songId, { includeCues = false, includeRuntime = false } = {}) {
  let next = { ...data };

  if (includeCues && songId) {
    try {
      const cuePayload = await getWaveformCuesRequest(songId);
      const cueSections = toArray(cuePayload?.sections);

      if (cueSections.length > 0) {
        const normalizedSections = cueSections.map(normalizeWaveformSection);
        if (!Array.isArray(next.sections) || next.sections.length === 0) {
          next.sections = normalizedSections;
          next.waveformSections = normalizedSections;
        }
        next.cues = normalizeWaveformCues([
          ...toArray(cuePayload?.cues),
          ...cueSectionsToMarkers(cueSections),
        ]);
      } else {
        next.cues = normalizeWaveformCues(cuePayload?.cues || cuePayload);
      }
    } catch {
      // Keep the cues already present in the analysis payload.
    }
  }

  if (includeRuntime) {
    const [healthResult, abResult] = await Promise.allSettled([
      waveformHealthRequest(),
      getABStatusRequest(),
    ]);

    next.runtime = {
      health: healthResult.status === "fulfilled" ? healthResult.value : null,
      abStatus: abResult.status === "fulfilled" ? abResult.value : null,
    };
  }

  return next;
}

export async function getWaveformAnalysis(songId, audioUrl = null, options = {}) {
  const {
    title = "Untitled Song",
    waveformPoints = options.waveform_points || options.nBars || options.n_bars || 1280,
    nSections = options.n_sections || options.nSections || 6,
    force = false,
    includeCues = false,
    includeRuntime = false,
  } = options;

  const resKey = resolutionKey(waveformPoints);

  if (!force) {
    const cached = await readCached(songId, resKey);
    if (cached) {
      const enriched = await enrichWaveform(
        normalizeWaveformAnalysis(cached, {
          audioUrl,
          waveformPoints,
          cached: true,
        }),
        songId,
        { includeCues, includeRuntime },
      );
      return await maybeBackfillWorshipIntelligence(enriched, {
        songId,
        audioUrl,
        title,
        waveformPoints,
        nSections,
        includeCues,
        includeRuntime,
        resKey,
      });
    }
  }

  if (!force && songId) {
    const serverWaveform = await fetchServerWaveform(songId);
    const normalizedServerWaveform = normalizeWaveformAnalysis(serverWaveform, {
      audioUrl,
      waveformPoints,
    });
    if (normalizedServerWaveform.peaks.length > 0) {
      await cacheWaveform(songId, normalizedServerWaveform, resKey);
      const enriched = await enrichWaveform(
        normalizedServerWaveform,
        songId,
        { includeCues, includeRuntime },
      );
      return await maybeBackfillWorshipIntelligence(enriched, {
        songId,
        audioUrl,
        title,
        waveformPoints,
        nSections,
        includeCues,
        includeRuntime,
        resKey,
      });
    }
  }

  if (!audioUrl) return null;

  const raw = await analyzeWaveformRequest({
    file_url: audioUrl,
    fileUrl: audioUrl,
    audio_url: audioUrl,
    audioUrl: audioUrl,
    song_id: songId || undefined,
    songId: songId || undefined,
    title,
    song_title: title,
    waveform_points: waveformPoints,
    waveformPoints,
    n_bars: waveformPoints,
    nBars: waveformPoints,
    n_sections: nSections,
    nSections,
  });

  const normalized = normalizeWaveformAnalysis(raw, {
    audioUrl,
    waveformPoints,
  });

  if (songId && normalized.peaks.length > 0) {
    await cacheWaveform(songId, normalized, resKey);
  }

  const enriched = await enrichWaveform(
    normalized,
    songId,
    { includeCues, includeRuntime },
  );
  return await maybeBackfillWorshipIntelligence(enriched, {
    songId,
    audioUrl,
    title,
    waveformPoints,
    nSections,
    includeCues,
    includeRuntime,
    resKey,
  });
}

export async function getWaveformPipelineStatus(songId = null) {
  const [healthResult, abResult, cuesResult] = await Promise.allSettled([
    waveformHealthRequest(),
    getABStatusRequest(),
    songId ? getWaveformCuesRequest(songId) : Promise.resolve(null),
  ]);

  return {
    health: healthResult.status === "fulfilled" ? healthResult.value : null,
    abStatus: abResult.status === "fulfilled" ? abResult.value : null,
    cues:
      cuesResult.status === "fulfilled"
        ? normalizeWaveformCues(cuesResult.value?.cues || cuesResult.value)
        : [],
  };
}

export async function getWaveformPeaks(songId, audioUrl = null, options = {}) {
  const data = await getWaveformAnalysis(songId, audioUrl, options);
  if (!data) return null;
  return {
    peaks: data.peaks,
    waveformPeaks: data.waveformPeaks,
    sections: data.sections,
    cues: data.cues,
    duration_ms: data.duration_ms,
  };
}

export async function prefetchWaveforms(songs, getAudioUrl) {
  const batch = 3;
  for (let i = 0; i < songs.length; i += batch) {
    const chunk = songs.slice(i, i + batch);
    await Promise.allSettled(
      chunk.map((song) =>
        getWaveformAnalysis(
          song?.id || song?.songId || null,
          getAudioUrl ? getAudioUrl(song) : null,
          {
            title: song?.title || "Untitled Song",
            waveformPoints: 320,
          },
        ),
      ),
    );
  }
}

export async function invalidateWaveformCache(songId) {
  if (!songId) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const waveformKeys = keys.filter(
      (key) => key === cacheKey(songId) || key.startsWith(`${cacheKey(songId)}:`),
    );
    if (waveformKeys.length > 0) {
      await AsyncStorage.multiRemove(waveformKeys);
    }
  } catch {
    // Ignore cache invalidation issues.
  }
}

export async function clearAllWaveformCaches() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const waveformKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
    await AsyncStorage.multiRemove(waveformKeys);
  } catch {
    // Ignore cache clear issues.
  }
}

export async function getWaveformCacheStats() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const waveformKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
    return { count: waveformKeys.length, keys: waveformKeys };
  } catch {
    return { count: 0, keys: [] };
  }
}
