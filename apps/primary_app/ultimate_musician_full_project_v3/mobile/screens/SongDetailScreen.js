import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

import {
  CINESTAGE_URL,
  SYNC_URL,
  syncHeaders,
} from "./config";
import CineStageProcessingOverlay from "../components/CineStageProcessingOverlay";
import { fetchWithRetry } from "../utils/fetchRetry";
import {
  formatStemJobFailure,
  hasStemJobResult,
  pollStemJob,
  submitStemJob,
} from "../services/stemJobService";
import { analyzeWorshipSong } from "../services/worshipFlowService";
import {
  CHORD_CHART_INSTRUMENTS,
  makeId,
  ROUTING_TRACKS,
  OUTPUT_COLORS,
  getOutputOptions,
  makeDefaultSettings,
} from "../data/models";
import { addOrUpdateSong, getSettings, getSongs } from "../data/storage";
import { transposeChordChart } from "../data/chordTranspose";
import { parseSectionsForWaveform } from "../utils/parseSectionsForWaveform";

const CINESTAGE_STEPS = [
  "Collecting song info",
  "Separating stems",
  "Preparing tracks",
  "Job done!",
];

const TIME_SIGS = ["4/4", "3/4", "6/8", "2/4", "5/4", "12/8"];

const ROLES = [
  "Vocals",
  "Keys",
  "Electric Guitar",
  "Acoustic Guitar",
  "Bass",
  "Drums",
  "Synth/Pad",
  "Other",
];
const AI_CHART_INSTRUMENTS = [
  "Keys",
  "Electric Guitar",
  "Acoustic Guitar",
  "Bass",
  "Drums",
  "Vocals",
  "Synth/Pad",
];
const ROLE_COLORS = {
  Vocals: "#F472B6",
  Keys: "#A78BFA",
  "Electric Guitar": "#FB923C",
  "Acoustic Guitar": "#F59E0B",
  Bass: "#60A5FA",
  Drums: "#34D399",
  "Synth/Pad": "#22C55E",
  Other: "#FBBF24",
};
const WORSHIP_FLOW_VIEWER_ROLES = new Set([
  "admin",
  "org_owner",
  "worship_leader",
  "md",
  "music_director",
  "sound_tech",
  "sound",
]);

// ── Keyboard Rigs ─────────────────────────────────────────────────────────────
const DEFAULT_KEYS_RIGS = [
  { id: "nord", name: "Nord", color: "#EF4444" },
  { id: "modx", name: "MODX", color: "#10B981" },
  { id: "vs", name: "VS", color: "#3B82F6" },
  { id: "kontakt", name: "Kontakt", color: "#F59E0B" },
  { id: "ableton", name: "Ableton", color: "#8B5CF6" },
];
const RIG_COLOR_PALETTE = [
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#9CA3AF",
];

// ── Chord detection ──────────────────────────────────────────────────────────
const CHORD_RE =
  /^[A-G][b#]?(?:m(?:aj)?|min|aug|dim|sus[24]?|add\d+)?(?:\d+)?(?:\/[A-G][b#]?)?$/;

function isChord(token) {
  return CHORD_RE.test(token.trim());
}

function classifyLine(line) {
  const t = line.trim();
  if (!t) return "empty";
  if (
    (t.startsWith("[") && t.endsWith("]")) ||
    /^(intro|verse|pre-?chorus|chorus|bridge|outro|tag|vamp|hook|interlude|breakdown|refrain|ending|turn)\s*[\d:.]*\s*$/i.test(
      t,
    )
  ) {
    return "section";
  }
  const tokens = t.split(/\s+/).filter(Boolean);
  const chordCount = tokens.filter(isChord).length;
  if (tokens.length > 0 && chordCount / tokens.length >= 0.55) return "chords";
  return "lyric";
}

// Inline chord chart renderer used inside each section card
function ChordChartView({ text }) {
  const lines = (text || "").split("\n");
  return (
    <View>
      {lines.map((line, i) => {
        const type = classifyLine(line);
        if (type === "empty") return <View key={i} style={{ height: 8 }} />;
        if (type === "chords") {
          return (
            <View key={i} style={ccStyles.chordRow}>
              {line
                .trim()
                .split(/(\s+)/)
                .map((part, j) =>
                  /^\s+$/.test(part) ? (
                    <Text key={j} style={ccStyles.space}>
                      {part}
                    </Text>
                  ) : (
                    <Text
                      key={j}
                      style={isChord(part) ? ccStyles.chord : ccStyles.other}
                    >
                      {part}
                    </Text>
                  ),
                )}
            </View>
          );
        }
        return (
          <Text key={i} style={ccStyles.lyric}>
            {line}
          </Text>
        );
      })}
    </View>
  );
}

const ccStyles = StyleSheet.create({
  chordRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
    marginBottom: 1,
  },
  chord: {
    color: "#FBBF24",
    fontWeight: "700",
    fontSize: 14,
    fontFamily: "monospace",
  },
  other: { color: "#9CA3AF", fontSize: 14, fontFamily: "monospace" },
  space: { color: "transparent", fontSize: 14 },
  lyric: { color: "#E5E7EB", fontSize: 14, lineHeight: 22 },
});

// ── Keyboard Rig-annotated part renderer ─────────────────────────────────────
// Supports both start-of-line @[Nord] and inline mixed @[MODX] fa, @[Nord] la
function parseInlineRigSegments(line, allRigs) {
  const RE = /@\[([^\]]+)\]/g;
  const parts = [];
  let lastIndex = 0;
  let lastRig = null;
  let m;
  while ((m = RE.exec(line)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ rig: lastRig, text: line.slice(lastIndex, m.index) });
    }
    lastRig = m[1];
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < line.length) {
    parts.push({ rig: lastRig, text: line.slice(lastIndex) });
  }
  return parts.filter((p) => p.text).map((p) => {
    const rigObj = p.rig
      ? allRigs.find((r) => r.name.toLowerCase() === p.rig.toLowerCase())
      : null;
    return { ...p, color: rigObj?.color || (p.rig ? "#A78BFA" : "#9CA3AF") };
  });
}

function KeysPartView({ text, rigs }) {
  if (!text?.trim()) return null;
  const allRigs = rigs?.length ? rigs : DEFAULT_KEYS_RIGS;
  return (
    <View style={{ marginTop: 8 }}>
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <View key={i} style={{ height: 5 }} />;

        // Any line containing @[Rig] gets inline color rendering
        if (/@\[/.test(line)) {
          const segments = parseInlineRigSegments(line, allRigs);
          return (
            <View
              key={i}
              style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 4 }}
            >
              {segments.map((seg, j) => (
                <Text
                  key={j}
                  style={{
                    color: seg.color,
                    fontSize: 13,
                    fontFamily: "monospace",
                    lineHeight: 20,
                    fontWeight: seg.rig ? "700" : "400",
                    backgroundColor: seg.rig ? seg.color + "18" : "transparent",
                    paddingHorizontal: seg.rig ? 2 : 0,
                    borderRadius: 3,
                  }}
                >
                  {seg.text}
                </Text>
              ))}
            </View>
          );
        }

        return (
          <Text
            key={i}
            style={{ color: "#9CA3AF", fontSize: 13, lineHeight: 20, marginBottom: 2 }}
          >
            {line}
          </Text>
        );
      })}
    </View>
  );
}

// ── Auto-recognize: split pasted text into named sections ────────────────────
const SECTION_HEADER_RE =
  /^(intro|verse\s*\d*|pre-?chorus|chorus|bridge|outro|tag|vamp|hook|interlude|breakdown|refrain|ending|turn)\s*[\d:.]*\s*$/i;

// Strip chord lines — keep only lyrics + blank lines (for Vocals part)
function stripChordsFromSection(text) {
  return (text || "")
    .split("\n")
    .filter((line) => {
      const t = classifyLine(line);
      return t === "lyric" || t === "empty";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeRoleKey(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeSectionRole(role) {
  const key = normalizeRoleKey(role).replace(/_/g, " ");
  const aliasMap = {
    vocal: "Vocals",
    vocals: "Vocals",
    "lead vocal": "Vocals",
    keys: "Keys",
    keyboard: "Keys",
    piano: "Keys",
    "electric guitar": "Electric Guitar",
    guitar: "Electric Guitar",
    "acoustic guitar": "Acoustic Guitar",
    acoustic: "Acoustic Guitar",
    bass: "Bass",
    drums: "Drums",
    drum: "Drums",
    "synth pad": "Synth/Pad",
    synth: "Synth/Pad",
    pad: "Synth/Pad",
    other: "Other",
  };
  return aliasMap[key] || role;
}

function canViewWorshipFlow(role) {
  return WORSHIP_FLOW_VIEWER_ROLES.has(normalizeRoleKey(role));
}

function defaultSectionParts(name, content) {
  const lyrics = stripChordsFromSection(content);
  return {
    Vocals: lyrics,
    Keys: content,
    "Electric Guitar": content,
    "Acoustic Guitar": content,
    Bass: content,
    Drums: `[${name}] Keep the groove locked and support the vocal flow.`,
    "Synth/Pad": `[${name}] Add texture only where the section needs lift or space.`,
    Other: content,
  };
}

function normalizeSectionDraft(section, index = 0) {
  const content = section?.content || "";
  const name = String(section?.name || `Section ${index + 1}`).trim();
  const fallback = defaultSectionParts(name, content);
  const mergedParts = { ...fallback };
  Object.entries(section?.parts || {}).forEach(([role, value]) => {
    const canonical = normalizeSectionRole(role);
    if (ROLES.includes(canonical)) {
      mergedParts[canonical] = String(value || "");
    }
  });
  if (!mergedParts.Vocals) {
    mergedParts.Vocals = stripChordsFromSection(content);
  }
  return {
    id: section?.id || makeId("sec"),
    name,
    content,
    expanded: section?.expanded ?? true,
    cue: section?.cue || "",
    energy: section?.energy || "",
    parts: mergedParts,
  };
}

function ensureSmartSections(sectionList = []) {
  return (sectionList || []).map((section, index) =>
    normalizeSectionDraft(section, index),
  );
}

function buildSectionColor(label = "", index = 0) {
  const key = String(label || "").toLowerCase();
  if (key.includes("intro")) return "#6B7280";
  if (key.includes("pre") && key.includes("chorus")) return "#8B5CF6";
  if (key.includes("chorus") || key.includes("refrain")) return "#EC4899";
  if (key.includes("bridge")) return "#F59E0B";
  if (key.includes("outro") || key.includes("ending")) return "#10B981";
  if (key.includes("verse")) return "#6366F1";
  if (key.includes("tag") || key.includes("vamp") || key.includes("hook")) return "#F97316";
  const palette = ["#6366F1", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#0EA5E9"];
  return palette[index % palette.length];
}

function estimateArrangementDurationMs(sectionList = [], bpmValue) {
  const tempo = Math.max(Number(bpmValue) || 72, 40);
  const beatSeconds = 60 / tempo;
  const totalBeats = (sectionList || []).reduce((sum, section) => {
    const lineCount = String(section?.content || "")
      .split("\n")
      .filter((line) => line.trim())
      .length;
    return sum + Math.max(16, lineCount * 8);
  }, 0);
  return Math.max(Math.round(totalBeats * beatSeconds * 1000), 90000);
}

function buildFallbackWaveformSections(sectionList = [], durationMs = 0) {
  if (!sectionList.length) return [];
  const durationSec = Math.max(durationMs / 1000, sectionList.length * 15, 60);
  const weights = sectionList.map((section) =>
    Math.max(
      2,
      String(section?.content || "")
        .split("\n")
        .filter((line) => line.trim()).length,
    ),
  );
  const total = Math.max(weights.reduce((sum, value) => sum + value, 0), 1);
  let elapsed = 0;

  return sectionList.map((section, index) => {
    const startRatio = elapsed / total;
    const startSec = durationSec * startRatio;
    elapsed += weights[index];
    const endSec = durationSec * (elapsed / total);
    return {
      id: section.id || `sec_${index}`,
      label: section.name,
      name: section.name,
      color: buildSectionColor(section.name, index),
      type: normalizeRoleKey(section.name),
      timeSec: startSec,
      positionSeconds: startSec,
      start_ms: Math.round(startSec * 1000),
      end_ms: Math.round(endSec * 1000),
    };
  });
}

function buildFallbackWaveformCues(sectionList = [], waveformSections = []) {
  return waveformSections.map((marker, index) => ({
    id: `smart_cue_${index}`,
    label: marker.label || sectionList[index]?.name || `Section ${index + 1}`,
    type: "section",
    time: Number(marker.timeSec || marker.positionSeconds || 0),
    timeSec: Number(marker.timeSec || marker.positionSeconds || 0),
    positionSeconds: Number(marker.positionSeconds || marker.timeSec || 0),
    start_ms: marker.start_ms || 0,
    end_ms: marker.end_ms || marker.start_ms || 0,
    color: marker.color || buildSectionColor(marker.label, index),
    cue: sectionList[index]?.cue || "",
    energy: sectionList[index]?.energy || "",
  }));
}

function normalizeCueMatchKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function readCueTimeSec(cue = {}) {
  const directValue = Number(
    cue?.timeSec ??
      cue?.positionSeconds ??
      cue?.time ??
      cue?.time_sec ??
      cue?.start ??
      cue?.startSec ??
      cue?.start_sec,
  );
  if (Number.isFinite(directValue) && directValue >= 0) return directValue;

  const msValue = Number(cue?.time_ms ?? cue?.start_ms);
  if (Number.isFinite(msValue) && msValue >= 0) return msValue / 1000;

  return null;
}

function readCueEndSec(cue = {}) {
  const directValue = Number(
    cue?.endTimeSec ??
      cue?.end ??
      cue?.endSec ??
      cue?.end_sec,
  );
  if (Number.isFinite(directValue) && directValue >= 0) return directValue;

  const msValue = Number(cue?.end_ms);
  if (Number.isFinite(msValue) && msValue >= 0) return msValue / 1000;

  return null;
}

function buildAlignedWaveformCues(rawCues = [], waveformSections = [], sectionList = []) {
  const normalizedSections = (waveformSections || []).map((section, index) => {
    const timeSec = Number(
      section?.timeSec ??
        section?.positionSeconds ??
        ((section?.start_ms ?? 0) / 1000),
    );
    const endSec = Number(
      section?.endTimeSec ??
        section?.endSec ??
        ((section?.end_ms ?? 0) / 1000),
    );
    const label =
      section?.label ||
      section?.name ||
      sectionList[index]?.name ||
      `Section ${index + 1}`;
    return {
      ...section,
      label,
      timeSec: Number.isFinite(timeSec) ? timeSec : 0,
      endSec: Number.isFinite(endSec) && endSec > timeSec ? endSec : null,
      matchKey: normalizeCueMatchKey(label),
    };
  });

  const sectionById = new Map(
    normalizedSections.map((section) => [String(section?.id || ""), section]),
  );
  const sectionByLabel = new Map();
  normalizedSections.forEach((section) => {
    if (!section.matchKey) return;
    if (!sectionByLabel.has(section.matchKey)) {
      sectionByLabel.set(section.matchKey, section);
    }
  });

  const baseCues =
    Array.isArray(rawCues) && rawCues.length > 0
      ? rawCues
      : buildFallbackWaveformCues(sectionList, waveformSections);

  const aligned = baseCues.map((cue, index) => {
    const cueLabel =
      cue?.label ||
      cue?.name ||
      cue?.cue ||
      sectionList[index]?.name ||
      normalizedSections[index]?.label ||
      `Cue ${index + 1}`;
    const explicitStart = readCueTimeSec(cue);
    const explicitEnd = readCueEndSec(cue);
    const matchedSection =
      sectionById.get(String(cue?.sectionRef || cue?.section_id || cue?.sectionId || "")) ||
      sectionByLabel.get(normalizeCueMatchKey(cueLabel)) ||
      normalizedSections[index] ||
      null;
    const startSec =
      explicitStart ??
      matchedSection?.timeSec ??
      Number(cue?.positionSeconds || 0);
    const sectionEndSec =
      matchedSection?.endSec ??
      (Number.isFinite(matchedSection?.end_ms)
        ? Number(matchedSection.end_ms) / 1000
        : null);
    return {
      id: String(cue?.id || `smart_cue_${index}`),
      label: cueLabel,
      type: String(cue?.type || "cue").toLowerCase(),
      time: startSec,
      timeSec: startSec,
      positionSeconds: startSec,
      start_ms: Math.round(startSec * 1000),
      end_ms: Math.round(
        Math.max(startSec, explicitEnd ?? sectionEndSec ?? startSec) * 1000,
      ),
      color:
        cue?.color ||
        matchedSection?.color ||
        buildSectionColor(cueLabel, index),
      cue: cue?.cue || sectionList[index]?.cue || "",
      energy: cue?.energy || sectionList[index]?.energy || "",
      sectionRef: matchedSection?.id || cue?.sectionRef || null,
    };
  });

  const sorted = aligned
    .filter((cue) => Number.isFinite(cue.timeSec))
    .sort((a, b) => a.timeSec - b.timeSec);

  return sorted.map((cue, index) => {
    const nextCue = sorted[index + 1];
    const fallbackEnd = nextCue?.timeSec ?? cue.timeSec + 4;
    const storedEnd = Number(cue?.end_ms || 0) / 1000;
    const endSec =
      Number.isFinite(storedEnd) && storedEnd > cue.timeSec
        ? storedEnd
        : fallbackEnd;
    return {
      ...cue,
      end_ms: Math.round(Math.max(cue.timeSec + 0.5, endSec) * 1000),
    };
  });
}

function buildAnalysisMarkersFromCues(cues = [], durationMs = 0) {
  const totalSec = Math.max(Number(durationMs || 0) / 1000, 1);
  const sorted = (cues || [])
    .map((cue) => ({
      ...cue,
      timeSec: readCueTimeSec(cue) ?? Number(cue?.positionSeconds || 0),
      endSec:
        readCueEndSec(cue) ??
        (Number.isFinite(cue?.end_ms) ? Number(cue.end_ms) / 1000 : null),
    }))
    .filter((cue) => Number.isFinite(cue.timeSec))
    .sort((a, b) => a.timeSec - b.timeSec);

  return sorted.map((cue, index) => {
    const nextCue = sorted[index + 1];
    const type = normalizeRoleKey(cue?.type || "cue");
    const endSec = Math.min(
      totalSec,
      Math.max(
        cue.timeSec + 0.5,
        cue.endSec ??
          nextCue?.timeSec ??
          cue.timeSec + 4,
      ),
    );
    return {
      id: String(cue?.id || `mk_ai_${index}`),
      label: String(cue?.label || `Cue ${index + 1}`),
      start: cue.timeSec,
      end: endSec,
      type: ["section", "jump", "loop"].includes(type) ? type : "cue",
      color: cue?.color || buildSectionColor(cue?.label, index),
      sectionRef: cue?.sectionRef || null,
    };
  });
}

function mergeArrangedSections(baseSections = [], arrangedSections = []) {
  const baseById = new Map(baseSections.map((section) => [String(section.id || ""), section]));
  const baseByName = new Map(
    baseSections.map((section) => [String(section.name || "").trim().toLowerCase(), section]),
  );
  const source = Array.isArray(arrangedSections) && arrangedSections.length ? arrangedSections : baseSections;

  return source.map((section, index) => {
    const existing =
      baseById.get(String(section?.id || "")) ||
      baseByName.get(String(section?.name || "").trim().toLowerCase()) ||
      baseSections[index] ||
      {};
    const merged = normalizeSectionDraft(
      {
        ...existing,
        ...section,
        content: section?.content ?? existing?.content ?? "",
        parts: {
          ...(existing?.parts || {}),
          ...(section?.parts || {}),
        },
      },
      index,
    );
    if (section?.cue) merged.cue = String(section.cue);
    if (section?.energy) merged.energy = String(section.energy);
    return merged;
  });
}

function buildInstrumentNotesFromSections(sectionList = []) {
  const notes = {};
  CHORD_CHART_INSTRUMENTS.concat(["Drums"]).forEach((role) => {
    const text = sectionList
      .map((section) => {
        const content = String(section?.parts?.[role] || "").trim();
        return content ? `[${section.name}]\n${content}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
    if (text) notes[role] = text;
  });

  const synthText = sectionList
    .map((section) => {
      const content = String(section?.parts?.["Synth/Pad"] || "").trim();
      return content ? `[${section.name}]\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  if (synthText) notes["Synth/Pad"] = synthText;

  return notes;
}

function getPreviewChartForInstrument(roleCharts = {}, instrument = "") {
  const canonical = normalizeSectionRole(instrument);
  return (
    roleCharts?.[canonical] ||
    roleCharts?.[instrument] ||
    ""
  );
}

async function postCineStageJson(path, payload, bases = []) {
  let lastError = null;
  let lastStatus = null;
  for (const base of bases) {
    try {
      const res = await fetchWithRetry(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return await res.json();
      lastStatus = res.status;
      lastError = new Error(`CineStage API ${res.status}`);
      if (res.status !== 404 || base === bases[bases.length - 1]) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`CineStage API ${lastStatus || "request failed"}`);
}

function buildLyricsExcerpt(chartText, sectionList) {
  const chartLyrics = stripChordsFromSection(chartText || "");
  if (chartLyrics) return chartLyrics.slice(0, 1200);

  const sectionLyrics = (sectionList || [])
    .map((section) => {
      const vocals =
        section?.parts?.Vocals ||
        section?.parts?.vocals ||
        section?.content ||
        "";
      return stripChordsFromSection(vocals);
    })
    .filter(Boolean)
    .join("\n\n");

  return sectionLyrics.slice(0, 1200);
}

// ── Parse BPM / Key / TimeSig from raw chart header text ─────────────────────
function extractMetaFromChart(text) {
  const meta = { key: null, bpm: null, timeSig: null };
  if (!text) return meta;

  // BPM — e.g. "134 BPM", "BPM: 90", "Tempo: 120"
  const bpmMatch = text.match(
    /\b(\d{2,3})\s*(?:BPM|bpm)\b|(?:BPM|Tempo)[:\s]+(\d{2,3})/i,
  );
  if (bpmMatch) meta.bpm = parseInt(bpmMatch[1] || bpmMatch[2], 10);

  // Key — e.g. "Tom: C", "Key: F#", "Tom: A#/Bb", "Tonalidade: G"
  const keyMatch = text.match(
    /(?:Tom|Key|Tonalidade|Chave)[:\s]+([A-G][#b]?(?:\/[A-G][#b]?)?(?:\s*m(?:in)?)?)/i,
  );
  if (keyMatch)
    meta.key = keyMatch[1]
      .split("/")[0]
      .trim()
      .replace(/\s*min$/i, "m");

  // Time sig — e.g. "4/4", "3/4", "6/8"
  const tsMatch = text.match(/\b([2-9]\/[2-9](?:6?8?)?)\b/);
  if (tsMatch && TIME_SIGS.includes(tsMatch[1])) meta.timeSig = tsMatch[1];

  return meta;
}

function autoRecognizeSections(text) {
  const lines = text.split("\n");
  const result = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const isBracket = trimmed.startsWith("[") && trimmed.endsWith("]");
    const isNamedSection = SECTION_HEADER_RE.test(trimmed);

    if (trimmed && (isBracket || isNamedSection)) {
      if (current) {
        result.push({ ...current, content: current.lines.join("\n").trim() });
      }
      const name = isBracket ? trimmed.slice(1, -1).trim() : trimmed;
      current = {
        id: makeId("sec"),
        name,
        lines: [],
        expanded: true,
        parts: {},
      };
    } else {
      if (!current) {
        current = {
          id: makeId("sec"),
          name: "Intro",
          lines: [],
          expanded: true,
          parts: {},
        };
      }
      current.lines.push(line);
    }
  }

  if (current) {
    const content = current.lines.join("\n").trim();
    if (content || result.length === 0) {
      result.push({ ...current, content });
    }
  }

  return result.filter((s) => s.name || s.content);
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function SongDetailScreen({ route, navigation }) {
  const incomingSong = route?.params?.song || null;
  // Optional: service-context playing key passed when opening from a service plan
  const serviceTransposedKey = route?.params?.transposedKey || '';
  const isNew = !incomingSong?.id;

  const [songId] = useState(incomingSong?.id || makeId("song"));
  const [title, setTitle] = useState(incomingSong?.title || "");
  const [artist, setArtist] = useState(incomingSong?.artist || "");
  const [key, setKey] = useState(
    incomingSong?.originalKey || incomingSong?.key || "",
  );
  const [bpm, setBpm] = useState(
    incomingSong?.bpm ? String(incomingSong.bpm) : "",
  );
  const [timeSig, setTimeSig] = useState(incomingSong?.timeSig || "4/4");
  const [youtubeLink, setYoutubeLink] = useState(
    incomingSong?.youtubeLink || "",
  );
  const [tags, setTags] = useState(Array.isArray(incomingSong?.tags) ? incomingSong.tags.join(', ') : (incomingSong?.tags || ""));
  const [routing, setRouting] = useState(incomingSong?.routing || {});
  const [routingExpanded, setRoutingExpanded] = useState(false);
  const [cueSync, setCueSync] = useState(
    incomingSong?.cueSync || { enabled: false },
  );
  const [routingPicker, setRoutingPicker] = useState({
    open: false,
    key: null,
  });
  const [settingsRouting, setSettingsRouting] = useState({
    interfaceChannels: 2,
    global: {},
  });
  const [dirty, setDirty] = useState(isNew);
  const [viewerRole, setViewerRole] = useState("");
  const [worshipFlowLoading, setWorshipFlowLoading] = useState(false);
  const [worshipFlowInsights, setWorshipFlowInsights] = useState(
    incomingSong?.worshipFlowInsights || null,
  );

  // Transposed key view (service context)
  const [showTransposedView, setShowTransposedView] = useState(false);

  // Arrangement Editor
  const [rawChart, setRawChart] = useState(
    incomingSong?.lyricsChordChart || "",
  );
  const [sections, setSections] = useState(incomingSong?.sections || []);
  const [addSectionName, setAddSectionName] = useState("");
  const [addSectionVisible, setAddSectionVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null); // null = All

  // Keyboard Rigs
  const [keysRigs, setKeysRigs] = useState(() => {
    if (incomingSong?.keysRigs?.length) return incomingSong.keysRigs;
    // Convert string array from proposal keyboardRigs to rig objects
    if (incomingSong?.keyboardRigs?.length) {
      return incomingSong.keyboardRigs.map((name) => {
        const found = DEFAULT_KEYS_RIGS.find(
          (r) => r.name.toLowerCase() === name.toLowerCase(),
        );
        return found || { id: name.toLowerCase(), name, color: "#8B5CF6" };
      });
    }
    return DEFAULT_KEYS_RIGS;
  });
  const [keysRigsExpanded, setKeysRigsExpanded] = useState(false);

  // AI Instrument Chart
  const [aiChartLoading, setAiChartLoading] = useState(false);
  const [aiChartResult, setAiChartResult] = useState(null); // { instrument, chart_text }
  const [aiChartInstrument, setAiChartInstrument] = useState("Keys");

  // Keys Preset AI
  const [keysPresetExpanded, setKeysPresetExpanded] = useState(false);
  const [keysPresetType, setKeysPresetType]         = useState('Worship Keys');
  const [keysPresetLoading, setKeysPresetLoading]   = useState(false);
  const [keysPresetResult, setKeysPresetResult]     = useState(null);

  // CAGED reference / strumming patterns / bass fingering
  const [cagedData, setCagedData] = useState(null);
  const [strummingData, setStrummingData] = useState(null);
  const [bassFingering, setBassFingering] = useState(null);
  const [aiRecommendations, setAiRecommendations] = useState(null);
  const [aiRecommendLoading, setAiRecommendLoading] = useState(false);

  useEffect(() => {
    const rootKey = (key || '').replace(/m$|maj.*|min.*/i, '').split('/')[0].trim();
    if (!rootKey) { setCagedData(null); setStrummingData(null); setBassFingering(null); return; }

    if (aiChartInstrument === 'Electric Guitar' || aiChartInstrument === 'Acoustic Guitar') {
      fetch(`${CINESTAGE_URL}/ai/instrument-charts/caged-reference/${encodeURIComponent(rootKey)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setCagedData(d))
        .catch(() => {});
      if (aiChartInstrument === 'Acoustic Guitar') {
        const ts = encodeURIComponent(timeSig || '4/4');
        fetch(`${CINESTAGE_URL}/ai/instrument-charts/strumming-patterns/${ts}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => setStrummingData(d))
          .catch(() => {});
      } else {
        setStrummingData(null);
      }
      setBassFingering(null);
    } else if (aiChartInstrument === 'Bass') {
      fetch(`${CINESTAGE_URL}/ai/instrument-charts/bass-fingering/${encodeURIComponent(rootKey)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setBassFingering(d))
        .catch(() => {});
      setCagedData(null);
      setStrummingData(null);
    } else {
      setCagedData(null);
      setStrummingData(null);
      setBassFingering(null);
    }
  }, [aiChartInstrument, key]);

  const [keysSelections, setKeysSelections] = useState({}); // { [secId]: {start,end} }
  const [newRigName, setNewRigName] = useState("");
  const [newRigColor, setNewRigColor] = useState(RIG_COLOR_PALETTE[0]);

  // ── Local stems (uploaded from device) ────────────────────────────────────
  const [localStemsState, setLocalStemsState] = useState(
    incomingSong?.localStems || {},
  );

  // CineStage processing
  const [apiBase, setApiBase] = useState(CINESTAGE_URL);
  const [userId, setUserId] = useState("demo-user");
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);

  const [currentSong, setCurrentSong] = useState(incomingSong);
  const hasStemsDone =
    Object.keys(currentSong?.localStems || {}).length > 0 ||
    (() => {
      const raw = currentSong?.latestStemsJob?.result?.stems;
      if (!raw) return false;
      if (Array.isArray(raw)) return raw.length > 0;
      if (typeof raw === "object") return Object.keys(raw).length > 0;
      return false;
    })();

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      const storedRole = await AsyncStorage.getItem("@user_role");
      if (settings.apiBase) setApiBase(settings.apiBase);
      if (settings.defaultUserId) setUserId(settings.defaultUserId);
      if (storedRole) setViewerRole(storedRole);
      const defaults = makeDefaultSettings();
      setSettingsRouting({
        interfaceChannels:
          settings.routing?.interfaceChannels ??
          defaults.routing.interfaceChannels,
        global: {
          ...defaults.routing.global,
          ...(settings.routing?.global || {}),
        },
      });
    })();
  }, []);

  function markDirty() {
    setDirty(true);
  }

  function buildSongObject() {
    return {
      ...(currentSong || {}),
      id: songId,
      title: title.trim() || "Untitled",
      artist: artist.trim(),
      key,            // canonical field — read by Playback
      originalKey: key,
      bpm: bpm ? Number(bpm) : null,
      timeSig,
      youtubeLink: youtubeLink.trim(),
      tags: (tags || '').trim(),
      routing,
      chordChart: rawChart,        // canonical field — read by Playback
      lyricsChordChart: rawChart,
      sections,
      cueSync,
      keysRigs,
      keyboardRigs: keysRigs.map((r) => r.name),
      worshipFlowInsights:
        worshipFlowInsights || currentSong?.worshipFlowInsights || undefined,
      localStems: Object.keys(localStemsState).length > 0 ? localStemsState : undefined,
    };
  }

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert(
        "Song name required",
        "Please enter a song name before saving.",
      );
      return;
    }
    try {
      const saved = await addOrUpdateSong(buildSongObject());
      setCurrentSong(saved);
      setDirty(false);
      if (isNew) navigation.setParams({ song: saved });
      Alert.alert("Saved", `"${saved.title}" has been saved.`);
    } catch (e) {
      Alert.alert("Error", String(e.message || e));
    }
  }

  // ── Stem file upload helpers ────────────────────────────────────────────────
  const STEM_KEYWORDS = {
    DRUMS:   /drum/i,
    BASS:    /bass/i,
    GUITARS: /guitar/i,
    KEYS:    /key|piano|synth/i,
    VOCALS:  /vocal|voice|vox|lead|bgv|harmony/i,
    PAD:     /pad|atmo|ambient|strings/i,
  };

  function guessSlot(filename) {
    const name = filename.replace(/\.[^/.]+$/, ''); // strip extension
    for (const [slot, re] of Object.entries(STEM_KEYWORDS)) {
      if (re.test(name)) return slot;
    }
    return name.toUpperCase().slice(0, 12);
  }

  async function handlePickStemFiles() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const destDir = `${FileSystem.documentDirectory}stems/${songId}/`;
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });

      const next = { ...localStemsState };
      for (const asset of result.assets) {
        const slot = guessSlot(asset.name || asset.uri.split('/').pop());
        const ext  = (asset.name || 'audio.mp3').split('.').pop();
        const dest = `${destDir}${slot}.${ext}`;
        await FileSystem.copyAsync({ from: asset.uri, to: dest });
        next[slot] = { localUri: dest, label: slot, name: asset.name };
      }
      setLocalStemsState(next);
      markDirty();
      Alert.alert('Stems added', `${result.assets.length} file(s) imported.`);
    } catch (e) {
      Alert.alert('Error', String(e.message || e));
    }
  }

  async function handleRemoveStem(slot) {
    const info = localStemsState[slot];
    if (info?.localUri) {
      FileSystem.deleteAsync(info.localUri, { idempotent: true }).catch(() => {});
    }
    const next = { ...localStemsState };
    delete next[slot];
    setLocalStemsState(next);
    markDirty();
  }

  async function handleAiRecommend() {
    if (!title.trim()) {
      Alert.alert('Song needed', 'Save the song first, then tap to get AI recommendations.');
      return;
    }
    setAiRecommendLoading(true);
    setAiRecommendations(null);
    try {
      const librarySongs = await getSongs();
      const setlistSource =
        route?.params?.setlistContext ||
        route?.params?.service?.songs ||
        route?.params?.service?.setlist ||
        route?.params?.plan?.songs ||
        [];
      const setlistContext = Array.isArray(setlistSource)
        ? setlistSource
            .map((item) => {
              const song = item?.song || item || {};
              return {
                title: song?.title || item?.title || '',
                key: song?.key || song?.originalKey || item?.key || '',
                bpm: Number.isFinite(Number(song?.bpm || item?.bpm))
                  ? Number(song?.bpm || item?.bpm)
                  : null,
              };
            })
            .filter((song) => song.title)
        : [];
      const songPool = Array.isArray(librarySongs)
        ? librarySongs
            .map((song) => ({
              title: song?.title || '',
              artist: song?.artist || '',
              key: song?.key || song?.originalKey || '',
              bpm: Number.isFinite(Number(song?.bpm)) ? Number(song.bpm) : null,
              tags: Array.isArray(song?.tags) ? song.tags : [],
            }))
            .filter((song) => song.title)
            .slice(0, 60)
        : [];

      const res = await fetchWithRetry(`${SYNC_URL}/sync/ai/recommend`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({
          currentSong: {
            title,
            artist,
            key,
            bpm: bpm ? parseInt(bpm, 10) : null,
          },
          setlistContext,
          songPool,
        }),
      });
      if (!res.ok) {
        throw new Error(`AI recommendation ${res.status}`);
      }
      const data = await res.json();
      if (data.recommendations?.length > 0) {
        setAiRecommendations(data.recommendations);
      } else {
        Alert.alert(
          'No results',
          data?.candidateCount === 0
            ? 'No other songs were available in the library to compare against.'
            : 'AI could not find recommendations. Try again.',
        );
      }
    } catch (err) {
      Alert.alert('Error', String(err?.message || 'Could not reach AI service. Check your connection.'));
    } finally {
      setAiRecommendLoading(false);
    }
  }

  async function handleSmartAnalyze() {
    const chartText =
      rawChart ||
      currentSong?.lyricsChordChart ||
      currentSong?.chordChart ||
      "";

    if (!chartText.trim() && !title.trim()) {
      Alert.alert("Nothing to analyze", "Add a title or paste your chord chart first.");
      return;
    }

    const meta = extractMetaFromChart(chartText);
    const effectiveKey = meta.key || key || currentSong?.key || "";
    const effectiveBpm = meta.bpm || (bpm ? Number(bpm) : currentSong?.bpm || null);
    const effectiveTimeSig = meta.timeSig || timeSig || currentSong?.timeSig || "4/4";
    const effectiveTitle = title.trim() || currentSong?.title || "Untitled";
    const effectiveArtist = artist.trim() || currentSong?.artist || "";

    if (meta.key) setKey(meta.key);
    if (meta.bpm) setBpm(String(meta.bpm));
    if (meta.timeSig) setTimeSig(meta.timeSig);

    const parsedSections = chartText.trim()
      ? autoRecognizeSections(chartText)
      : [];
    const baseSections = ensureSmartSections(
      parsedSections.length
        ? parsedSections
        : sections.length
          ? sections
          : [{ id: makeId("sec"), name: "Song", content: chartText, expanded: true, parts: {} }],
    );
    setSections(baseSections);

    setAiChartLoading(true);
    setAiChartResult(null);
    try {
      const bases = Array.from(
        new Set(
          [apiBase, CINESTAGE_URL]
            .map((value) => String(value || "").trim().replace(/\/+$/, ""))
            .filter(Boolean),
        ),
      );
      const arrangement = await postCineStageJson(
        "/ai/song-arrangement/analyze",
        {
          song_title: effectiveTitle,
          artist: effectiveArtist,
          key: effectiveKey,
          bpm: effectiveBpm,
          time_signature: effectiveTimeSig,
          chord_chart: chartText,
          lyrics: buildLyricsExcerpt(chartText, baseSections),
          sections: baseSections.map((section) => ({
            id: section.id,
            name: section.name,
            content: section.content,
          })),
        },
        bases,
      );

      const mergedSections = mergeArrangedSections(baseSections, arrangement.sections || []);
      const instrumentNotes =
        arrangement.instrumentNotes ||
        arrangement.instrument_notes ||
        buildInstrumentNotesFromSections(mergedSections);
      const lyrics =
        String(arrangement.lyrics || "").trim() ||
        buildLyricsExcerpt(chartText, mergedSections);

      let waveformData = null;
      const sourceUrl =
        youtubeLink.trim() ||
        currentSong?.youtubeLink ||
        currentSong?.audioUrl ||
        currentSong?.sourceUrl ||
        "";
      if (sourceUrl) {
        try {
          waveformData = await postCineStageJson(
            "/api/waveform/analyze",
            {
              file_url: sourceUrl,
              song_id: songId,
              title: effectiveTitle,
              waveform_points: 1280,
              n_sections: Math.max(mergedSections.length, 6),
            },
            bases,
          );
        } catch {
          waveformData = null;
        }
      }

      const durationMs =
        waveformData?.analysis?.duration_ms ||
        waveformData?.duration_ms ||
        arrangement.estimatedDurationMs ||
        arrangement.estimated_duration_ms ||
        estimateArrangementDurationMs(mergedSections, effectiveBpm);
      const rawWaveformSections =
        waveformData?.analysis?.sections ||
        arrangement.waveformSections ||
        arrangement.waveform_sections ||
        buildFallbackWaveformSections(mergedSections, durationMs);
      const waveformSections = (rawWaveformSections || []).map((section, index) => {
        const timeSec = Number(
          section?.timeSec ??
          section?.positionSeconds ??
          ((section?.start_ms ?? 0) / 1000),
        );
        const label =
          section?.label ||
          section?.name ||
          mergedSections[index]?.name ||
          `Section ${index + 1}`;
        const startMs =
          Number.isFinite(section?.start_ms) && section?.start_ms >= 0
            ? Number(section.start_ms)
            : Math.round(timeSec * 1000);
        const endMs =
          Number.isFinite(section?.end_ms) && section?.end_ms >= startMs
            ? Number(section.end_ms)
            : startMs;
        return {
          id: section?.id || mergedSections[index]?.id || `wf_${index}`,
          label,
          name: label,
          type: section?.type || normalizeRoleKey(label),
          color: section?.color || buildSectionColor(label, index),
          timeSec,
          positionSeconds: Number(section?.positionSeconds ?? timeSec),
          start_ms: startMs,
          end_ms: endMs,
        };
      });
      const cueSource =
        waveformData?.analysis?.cues ||
        arrangement.cues ||
        null;
      const cues = cueSource
        ? buildAlignedWaveformCues(cueSource, waveformSections, mergedSections)
        : buildFallbackWaveformCues(mergedSections, waveformSections);
      const waveformPeaks =
        waveformData?.analysis?.waveformPeaks ||
        waveformData?.analysis?.peaks ||
        waveformData?.waveformPeaks ||
        waveformData?.peaks ||
        currentSong?.analysis?.waveformPeaks ||
        currentSong?.analysis?.peaks;
      const performanceGraph =
        waveformData?.analysis?.performance_graph ||
        waveformSections.map((section, index) => ({
          section: section.label,
          energy: mergedSections[index]?.energy || "medium",
          cue: mergedSections[index]?.cue || "",
        }));
      const analysisMarkers = cueSource
        ? buildAnalysisMarkersFromCues(cues, durationMs)
        : currentSong?.analysis?.markers || [];
      const roleCharts = arrangement.roleCharts || arrangement.role_charts || {};
      const previewChart = getPreviewChartForInstrument(roleCharts, aiChartInstrument);

      const saved = await addOrUpdateSong({
        ...buildSongObject(),
        title: effectiveTitle,
        artist: effectiveArtist,
        key: effectiveKey,
        originalKey: effectiveKey,
        bpm: effectiveBpm,
        timeSig: effectiveTimeSig,
        sections: mergedSections,
        instrumentNotes,
        lyrics,
        cues,
        analysis: {
          ...(currentSong?.analysis || {}),
          sections: waveformSections,
          cues,
          markers: analysisMarkers,
          duration_ms: durationMs,
          waveformPeaks,
          peaks: waveformPeaks,
          performance_graph: performanceGraph,
          analyzedAt: new Date().toISOString(),
        },
        smartArrangement: arrangement,
      });

      setCurrentSong(saved);
      setSections(saved.sections || mergedSections);
      setDirty(false);
      if (previewChart) {
        setAiChartResult({ instrument: aiChartInstrument, text: previewChart });
      }
      if (isNew) navigation.setParams({ song: saved });
      const warningText = Array.isArray(arrangement.warnings) && arrangement.warnings.length
        ? `\n\nNotes:\n• ${arrangement.warnings.join("\n• ")}`
        : "";
      Alert.alert(
        "Smart Analyze complete",
        `Saved role charts, vocal lyrics, and waveform cues for "${effectiveTitle}".${warningText}`,
      );
    } catch (e) {
      Alert.alert("AI Chart Error", e.message);
    } finally {
      setAiChartLoading(false);
    }
  }

  async function handleGenerateKeysPreset() {
    setKeysPresetLoading(true);
    setKeysPresetResult(null);
    try {
      const res = await fetchWithRetry(`${CINESTAGE_URL}/ai/midi-presets/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrument_type: keysPresetType,
          song_title: title || '',
          genre: 'worship',
          style: keysPresetType.toLowerCase().replace(/\s+/g, '_'),
        }),
      });
      if (!res.ok) throw new Error(`AI Preset ${res.status}`);
      setKeysPresetResult(await res.json());
    } catch (e) {
      Alert.alert('Preset Error', e.message);
    } finally {
      setKeysPresetLoading(false);
    }
  }

  async function handleAnalyzeWorshipFlow() {
    if (!title.trim() && !rawChart.trim()) {
      Alert.alert(
        "Song needed",
        "Add the song title or paste the chart before running Worship Flow AI.",
      );
      return;
    }

    setWorshipFlowLoading(true);
    try {
      const payload = {
        title: title.trim() || currentSong?.title || "Untitled",
        artist: artist.trim() || currentSong?.artist || "",
        key: serviceTransposedKey || key || currentSong?.originalKey || "",
        bpm: bpm ? Number(bpm) : currentSong?.bpm || null,
        lyrics: buildLyricsExcerpt(rawChart, sections),
        chordChart: (rawChart || "").slice(0, 2000),
        teamRoles: (route?.params?.teamRoles || []).filter(Boolean),
        serviceContext:
          route?.params?.serviceContext ||
          route?.params?.serviceName ||
          route?.params?.service?.title ||
          "Worship service",
      };

      const data = await analyzeWorshipSong(payload);
      const insights = data?.insights || data || null;
      setWorshipFlowInsights(insights);

      if (title.trim()) {
        const saved = await addOrUpdateSong({
          ...buildSongObject(),
          worshipFlowInsights: insights,
        });
        setCurrentSong(saved);
        if (isNew) navigation.setParams({ song: saved });
      }
    } catch (e) {
      Alert.alert("Worship Flow Error", String(e?.message || e));
    } finally {
      setWorshipFlowLoading(false);
    }
  }

  function toggleSection(id) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, expanded: !s.expanded } : s)),
    );
  }

  function removeSection(id) {
    setSections((prev) => prev.filter((s) => s.id !== id));
    markDirty();
  }

  function handleAddSection() {
    const name = addSectionName.trim();
    if (!name) return;
    setSections((prev) => [
      ...prev,
      { id: makeId("sec"), name, content: "", expanded: true, parts: {} },
    ]);
    setAddSectionName("");
    setAddSectionVisible(false);
    markDirty();
  }

  function updateSectionPart(sectionId, role, value) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, parts: { ...(s.parts || {}), [role]: value } }
          : s,
      ),
    );
    markDirty();
  }

  async function handleRunCineStage() {
    const link = youtubeLink.trim();
    if (!link) {
      Alert.alert(
        "YouTube link required",
        "Add a YouTube link so CineStage can separate the stems.",
      );
      return;
    }

    let songToProcess = currentSong;
    if (dirty || isNew) {
      try {
        songToProcess = await addOrUpdateSong(buildSongObject());
        setCurrentSong(songToProcess);
        setDirty(false);
      } catch {
        /* proceed anyway */
      }
    }

    setProcessingStep(0);
    setProcessingProgress(5);
    setProcessing(true);

    try {
      const { job, fileUrl: resolvedSourceUrl } = await submitStemJob({
        sourceUrl: link,
        title: songToProcess.title,
        songId: songToProcess.id,
        separateHarmonies: true,
        voiceCount: 3,
      });

      setProcessingProgress(20);
      const current = await pollStemJob(job.id, {
        initialJob: job,
        onUpdate: (nextJob, { polls, previousStatus }) => {
          if (nextJob.status === "PENDING") {
            setProcessingStep(0);
            setProcessingProgress(Math.min(28, 20 + polls * 2));
          } else if (nextJob.status === "PROCESSING") {
            if (previousStatus !== "PROCESSING") {
              setProcessingStep(1);
              setProcessingProgress(30);
            } else {
              setProcessingProgress((p) => Math.min(88, p + 0.2));
            }
          }
        },
      });

      if (!hasStemJobResult(current)) {
        setProcessing(false);
        Alert.alert("Processing error", formatStemJobFailure(current));
        return;
      }

      setProcessingStep(2);
      setProcessingProgress(90);

      const result = current.result || {};

      // Detected values from CineStage — fall back to chart text if server returns null
      const chartMeta = extractMetaFromChart(rawChart);
      const detectedKey =
        current.key || result.key || result.original_key || chartMeta.key || "";
      const detectedBpm =
        current.bpm || result.bpm || result.tempo || chartMeta.bpm || null;
      const detectedTimeSig =
        current.timeSig ||
        result.timeSig ||
        result.time_signature ||
        chartMeta.timeSig ||
        "";

      // Embed chart-parsed sections if server didn't return any
      const serverSections = result.sections || current.sections || [];
      const dur = result.duration_sec || result.durationSec || 0;
      const chartSectionsForSong =
        serverSections.length > 0 || !rawChart.trim()
          ? serverSections
          : parseSectionsForWaveform(rawChart, dur);

      const updated = await addOrUpdateSong({
        ...songToProcess,
        sourceUrl: resolvedSourceUrl,
        originalKey: detectedKey || songToProcess.originalKey || "",
        bpm: detectedBpm || songToProcess.bpm || null,
        timeSig: detectedTimeSig || songToProcess.timeSig || "4/4",
        latestStemsJob: current,
        ...(chartSectionsForSong.length > 0 ? { sections: chartSectionsForSong } : {}),
      });
      setCurrentSong(updated);

      // Store stems in Cloudflare KV so Ultimate Playback can access them
      if (result.stems && Object.keys(result.stems).length > 0) {
        fetch(`${SYNC_URL}/sync/stems-store`, {
          method: "POST",
          headers: syncHeaders(),
          body: JSON.stringify({
            songId: songToProcess.id,
            title: songToProcess.title,
            stems: result.stems,
            harmonies: result.harmonies || {},
            key: detectedKey,
            bpm: detectedBpm,
            jobId: current.id || current.job_id || "",
          }),
        }).catch(() => {});
      }

      // Update form fields
      if (detectedKey) setKey(detectedKey);
      if (detectedBpm) setBpm(String(Math.round(detectedBpm)));
      if (detectedTimeSig) setTimeSig(detectedTimeSig);
      setDirty(false);

      setProcessingStep(3);
      setProcessingProgress(100);
      await new Promise((r) => setTimeout(r, 900));
      setProcessing(false);

      // Open Rehearsal with the fully populated song
      navigation.navigate("Rehearsal", { song: updated, apiBase });
    } catch (e) {
      setProcessing(false);
      Alert.alert("Error", String(e.message || e));
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Song Details ── */}
        <Text style={styles.sectionTitle}>Song Details</Text>
        <Text style={styles.sectionSub}>
          Only the fields below are required for planning and rehearsal.
        </Text>

        {/* Title */}
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            markDirty();
          }}
          placeholder="Song name"
          placeholderTextColor="#4B5563"
          returnKeyType="next"
        />

        {/* Artist */}
        <TextInput
          style={[styles.input, styles.mt8]}
          value={artist}
          onChangeText={(v) => {
            setArtist(v);
            markDirty();
          }}
          placeholder="Artist"
          placeholderTextColor="#4B5563"
          returnKeyType="next"
        />

        {/* Key + BPM row */}
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex1]}
            value={key}
            onChangeText={(v) => {
              setKey(v);
              markDirty();
            }}
            placeholder="Key  (e.g. C, F#)"
            placeholderTextColor="#4B5563"
            autoCapitalize="characters"
            maxLength={3}
            returnKeyType="next"
          />
          <TextInput
            style={[styles.input, styles.flex1]}
            value={bpm}
            onChangeText={(v) => {
              setBpm(v.replace(/[^0-9]/g, ""));
              markDirty();
            }}
            placeholder="BPM"
            placeholderTextColor="#4B5563"
            keyboardType="number-pad"
            maxLength={3}
            returnKeyType="done"
          />
        </View>

        {/* Time sig + YouTube row */}
        <View style={styles.row}>
          <View style={[styles.flex1]}>
            <View style={styles.timeSigRow}>
              {TIME_SIGS.map((ts) => (
                <TouchableOpacity
                  key={ts}
                  style={[styles.tsChip, timeSig === ts && styles.tsChipActive]}
                  onPress={() => {
                    setTimeSig(ts);
                    markDirty();
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.tsChipText,
                      timeSig === ts && styles.tsChipTextActive,
                    ]}
                  >
                    {ts}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TextInput
            style={[styles.input, styles.flex1]}
            value={youtubeLink}
            onChangeText={(v) => {
              setYoutubeLink(v);
              markDirty();
            }}
            placeholder="YouTube Link"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />
        </View>

        {/* ── Local Stems Upload ── */}
        <View style={styles.stemUploadSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.stemUploadTitle}>Local Stems</Text>
            <TouchableOpacity style={styles.stemPickBtn} onPress={handlePickStemFiles}>
              <Text style={styles.stemPickBtnText}>＋ Add Files</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.stemUploadHint}>
            Pick audio files from Files / iCloud. Name them with the stem type (e.g. drums.mp3, vocals.wav) — they'll be auto-labelled.
          </Text>
          {Object.keys(localStemsState).length === 0 ? (
            <Text style={styles.stemEmptyText}>No local stems yet</Text>
          ) : (
            Object.entries(localStemsState).map(([slot, info]) => (
              <View key={slot} style={styles.stemRow}>
                <View style={styles.stemRowBadge}>
                  <Text style={styles.stemRowBadgeText}>{slot}</Text>
                </View>
                <Text style={styles.stemRowName} numberOfLines={1}>
                  {info?.name || info?.localUri?.split('/').pop() || slot}
                </Text>
                <TouchableOpacity onPress={() => handleRemoveStem(slot)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.stemRowRemove}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Tags */}
        <TextInput
          style={[styles.input, styles.mt8]}
          value={tags}
          onChangeText={(v) => {
            setTags(v);
            markDirty();
          }}
          placeholder="Theme / Tags (comma separated)"
          placeholderTextColor="#4B5563"
          returnKeyType="done"
          autoCorrect={false}
        />

        {/* Audio Routing per-song overrides */}
        {(() => {
          const overrideCount = ROUTING_TRACKS.filter(
            (t) => routing[t.key],
          ).length;
          const outputOptions = [
            "Use Global",
            ...getOutputOptions(settingsRouting.interfaceChannels),
          ];
          const pickerTrack = ROUTING_TRACKS.find(
            (t) => t.key === routingPicker.key,
          );

          return (
            <>
              <TouchableOpacity
                style={styles.routingToggleRow}
                onPress={() => setRoutingExpanded((e) => !e)}
                activeOpacity={0.7}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Text style={styles.routingToggleLabel}>
                    🔊 Audio Routing
                  </Text>
                  {overrideCount > 0 && (
                    <View style={styles.routingOverrideBadge}>
                      <Text style={styles.routingOverrideBadgeText}>
                        {overrideCount} override{overrideCount !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: "#4B5563", fontSize: 14 }}>
                  {routingExpanded ? "∧" : "∨"}
                </Text>
              </TouchableOpacity>

              {routingExpanded && (
                <View style={styles.routingCard}>
                  {["Timing", "Instruments", "Mix"].map((group, gi) => {
                    const tracks = ROUTING_TRACKS.filter(
                      (t) => t.group === group,
                    );
                    return (
                      <View key={group}>
                        {gi > 0 && <View style={styles.routingCardDivider} />}
                        <Text style={styles.routingGroupName}>{group}</Text>
                        {tracks.map((track) => {
                          const override = routing[track.key];
                          const globalVal =
                            settingsRouting.global[track.key] || "Main L/R";
                          const color = override
                            ? OUTPUT_COLORS[override] || "#818CF8"
                            : "#374151";
                          return (
                            <TouchableOpacity
                              key={track.key}
                              style={styles.songRoutingRow}
                              onPress={() =>
                                setRoutingPicker({ open: true, key: track.key })
                              }
                              activeOpacity={0.7}
                            >
                              <Text style={styles.songRoutingLabel}>
                                {track.label}
                              </Text>
                              <View
                                style={[
                                  styles.songRoutingBadge,
                                  override && {
                                    borderColor: color + "55",
                                    backgroundColor: color + "15",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.songRoutingValue,
                                    { color: override ? color : "#4B5563" },
                                  ]}
                                >
                                  {override || `Global · ${globalVal}`}
                                </Text>
                                <Text
                                  style={{ color: "#374151", fontSize: 10 }}
                                >
                                  ▾
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Routing picker modal */}
              <Modal
                visible={routingPicker.open}
                transparent
                animationType="fade"
                onRequestClose={() =>
                  setRoutingPicker({ open: false, key: null })
                }
              >
                <Pressable
                  style={styles.routingModalOverlay}
                  onPress={() => setRoutingPicker({ open: false, key: null })}
                >
                  <View style={styles.routingPickerCard}>
                    <Text style={styles.routingPickerTitle}>
                      {pickerTrack?.label || ""}
                    </Text>
                    {outputOptions.map((opt) => {
                      const trackKey = routingPicker.key;
                      const currentVal = trackKey
                        ? routing[trackKey] || "Use Global"
                        : "Use Global";
                      const isActive = currentVal === opt;
                      const c =
                        opt === "Use Global"
                          ? "#6B7280"
                          : OUTPUT_COLORS[opt] || "#818CF8";
                      const globalVal = trackKey
                        ? settingsRouting.global[trackKey] || "Main L/R"
                        : "";
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[
                            styles.routingPickerOption,
                            isActive && {
                              backgroundColor: c + "20",
                              borderColor: c + "44",
                            },
                          ]}
                          onPress={() => {
                            if (trackKey) {
                              setRouting((prev) => ({
                                ...prev,
                                [trackKey]: opt === "Use Global" ? null : opt,
                              }));
                              markDirty();
                            }
                            setRoutingPicker({ open: false, key: null });
                          }}
                        >
                          <View
                            style={[
                              styles.routingPickerDot,
                              { backgroundColor: isActive ? c : "#1F2937" },
                            ]}
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.routingPickerOptText,
                                isActive && { color: c, fontWeight: "800" },
                              ]}
                            >
                              {opt}
                            </Text>
                            {opt === "Use Global" && (
                              <Text
                                style={{
                                  color: "#374151",
                                  fontSize: 11,
                                  marginTop: 1,
                                }}
                              >
                                → {globalVal}
                              </Text>
                            )}
                          </View>
                          {isActive && (
                            <Text
                              style={{
                                color: c,
                                fontWeight: "800",
                                fontSize: 14,
                              }}
                            >
                              ✓
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </Pressable>
              </Modal>
            </>
          );
        })()}

        {/* Cue Sync toggle */}
        <TouchableOpacity
          style={styles.cueSyncRow}
          onPress={() => {
            setCueSync((prev) => ({ ...prev, enabled: !prev.enabled }));
            markDirty();
          }}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cueSyncLabel}>🎬 Lyric Cue Sync</Text>
            <Text style={styles.cueSyncSub}>
              {cueSync.enabled
                ? "Cues fire to ProPresenter / lyric software when sections are tapped"
                : "Off — tap to enable cue sending via Bridge"}
            </Text>
          </View>
          <View
            style={[
              styles.cueSyncPill,
              cueSync.enabled && styles.cueSyncPillOn,
            ]}
          >
            <Text
              style={[
                styles.cueSyncPillText,
                cueSync.enabled && styles.cueSyncPillTextOn,
              ]}
            >
              {cueSync.enabled ? "ON" : "OFF"}
            </Text>
          </View>
        </TouchableOpacity>

        {/* ── Keyboard Rigs ── */}
        <TouchableOpacity
          style={styles.routingToggleRow}
          onPress={() => setKeysRigsExpanded((e) => !e)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.routingToggleLabel}>🎹 Keyboard Rigs</Text>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {keysRigs.map((r) => (
                <View
                  key={r.id}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: r.color,
                  }}
                />
              ))}
            </View>
          </View>
          <Text style={{ color: "#4B5563", fontSize: 14 }}>
            {keysRigsExpanded ? "∧" : "∨"}
          </Text>
        </TouchableOpacity>

        {keysRigsExpanded && (
          <View style={styles.rigManagerCard}>
            <Text style={styles.rigManagerHint}>
              In the Keys part sheet, type [RigName] at the start of a line — or
              tap a rig button to insert it.
            </Text>
            {keysRigs.map((rig) => (
              <View key={rig.id} style={styles.rigRow}>
                <View
                  style={[styles.rigColorDot, { backgroundColor: rig.color }]}
                />
                <TextInput
                  style={styles.rigNameInput}
                  value={rig.name}
                  onChangeText={(v) => {
                    setKeysRigs((prev) =>
                      prev.map((r) =>
                        r.id === rig.id ? { ...r, name: v } : r,
                      ),
                    );
                    markDirty();
                  }}
                  placeholderTextColor="#4B5563"
                  autoCorrect={false}
                  autoCapitalize="words"
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ flex: 1 }}
                >
                  <View style={{ flexDirection: "row", gap: 5 }}>
                    {RIG_COLOR_PALETTE.map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={[
                          styles.rigColorSwatch,
                          { backgroundColor: c },
                          rig.color === c && styles.rigColorSwatchActive,
                        ]}
                        onPress={() => {
                          setKeysRigs((prev) =>
                            prev.map((r) =>
                              r.id === rig.id ? { ...r, color: c } : r,
                            ),
                          );
                          markDirty();
                        }}
                      />
                    ))}
                  </View>
                </ScrollView>
                <TouchableOpacity
                  onPress={() => {
                    setKeysRigs((prev) => prev.filter((r) => r.id !== rig.id));
                    markDirty();
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ color: "#4B5563", fontSize: 14 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {/* Add new rig */}
            <View style={styles.rigAddRow}>
              <TextInput
                style={styles.rigAddInput}
                value={newRigName}
                onChangeText={setNewRigName}
                placeholder="New rig name..."
                placeholderTextColor="#4B5563"
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="done"
              />
              <View
                style={[styles.rigColorDot, { backgroundColor: newRigColor }]}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
              >
                <View style={{ flexDirection: "row", gap: 5 }}>
                  {RIG_COLOR_PALETTE.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.rigColorSwatch,
                        { backgroundColor: c },
                        newRigColor === c && styles.rigColorSwatchActive,
                      ]}
                      onPress={() => setNewRigColor(c)}
                    />
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity
                style={styles.rigAddBtn}
                onPress={() => {
                  const name = newRigName.trim();
                  if (!name) return;
                  setKeysRigs((prev) => [
                    ...prev,
                    { id: `rig_${Date.now()}`, name, color: newRigColor },
                  ]);
                  setNewRigName("");
                  markDirty();
                }}
              >
                <Text style={styles.rigAddBtnText}>+ Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.saveBtn, !dirty && styles.saveBtnDim]}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>
              {isNew ? "+ Add Song" : "Save Song"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cineBtn, !youtubeLink.trim() && styles.cineBtnDim]}
            onPress={handleRunCineStage}
            activeOpacity={0.8}
          >
            <Text style={styles.cineBtnText}>Run CineStage™</Text>
          </TouchableOpacity>
        </View>

        {canViewWorshipFlow(viewerRole) && (
          <View
            style={{
              marginTop: 12,
              backgroundColor: "#120A24",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#6D28D9",
              padding: 14,
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: "#C4B5FD",
                    fontSize: 11,
                    fontWeight: "800",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  Worship Flow AI
                </Text>
                <Text
                  style={{
                    color: "#EDE9FE",
                    fontSize: 15,
                    fontWeight: "800",
                    marginTop: 2,
                  }}
                >
                  Live flow, arrangement, and FOH guidance
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#8B5CF6",
                  backgroundColor: worshipFlowLoading ? "#2E1065" : "#3B1B71",
                  opacity: worshipFlowLoading ? 0.75 : 1,
                }}
                onPress={handleAnalyzeWorshipFlow}
                disabled={worshipFlowLoading}
                activeOpacity={0.8}
              >
                <Text
                  style={{ color: "#F5F3FF", fontSize: 12, fontWeight: "800" }}
                >
                  {worshipFlowLoading ? "Analyzing..." : "✦ Analyze"}
                </Text>
              </TouchableOpacity>
            </View>

            {worshipFlowInsights ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: "#A78BFA",
                        fontSize: 11,
                        fontWeight: "700",
                        marginBottom: 6,
                      }}
                    >
                      Worship Freely Likelihood
                    </Text>
                    <View
                      style={{
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: "#2E1065",
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          height: "100%",
                          width: `${Math.round(
                            Math.max(
                              0,
                              Math.min(
                                1,
                                Number(
                                  worshipFlowInsights.worshipFreelyLikelihood || 0,
                                ),
                              ),
                            ) * 100,
                          )}%`,
                          borderRadius: 999,
                          backgroundColor: "#A855F7",
                        }}
                      />
                    </View>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: "#2E1065",
                      borderWidth: 1,
                      borderColor: "#8B5CF6",
                    }}
                  >
                    <Text
                      style={{
                        color: "#F5F3FF",
                        fontSize: 12,
                        fontWeight: "800",
                      }}
                    >
                      {Math.round(
                        Math.max(
                          0,
                          Math.min(
                            1,
                            Number(
                              worshipFlowInsights.worshipFreelyLikelihood || 0,
                            ),
                          ),
                        ) * 100,
                      )}
                      %
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {worshipFlowInsights.tempoFeel ? (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: "#1E1B4B",
                        borderWidth: 1,
                        borderColor: "#6366F1",
                      }}
                    >
                      <Text
                        style={{
                          color: "#A5B4FC",
                          fontSize: 11,
                          fontWeight: "800",
                        }}
                      >
                        {String(worshipFlowInsights.tempoFeel).toUpperCase()}
                      </Text>
                    </View>
                  ) : null}
                  {worshipFlowInsights.worshipFreelyMoment ? (
                    <View
                      style={{
                        flex: 1,
                        minWidth: 180,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 12,
                        backgroundColor: "#1B1235",
                        borderWidth: 1,
                        borderColor: "#4C1D95",
                      }}
                    >
                      <Text
                        style={{
                          color: "#C4B5FD",
                          fontSize: 10,
                          fontWeight: "800",
                          textTransform: "uppercase",
                          marginBottom: 3,
                        }}
                      >
                        Let It Flow
                      </Text>
                      <Text
                        style={{
                          color: "#F5F3FF",
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        {worshipFlowInsights.worshipFreelyMoment}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {Array.isArray(worshipFlowInsights.energyFlow) &&
                worshipFlowInsights.energyFlow.length > 0 ? (
                  <View>
                    <Text
                      style={{
                        color: "#A78BFA",
                        fontSize: 11,
                        fontWeight: "800",
                        marginBottom: 6,
                        textTransform: "uppercase",
                      }}
                    >
                      Section Energy
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {worshipFlowInsights.energyFlow.map((entry, index) => {
                        const energy = String(entry?.energy || "medium").toLowerCase();
                        const dotColor =
                          energy === "peak"
                            ? "#EC4899"
                            : energy === "high"
                              ? "#8B5CF6"
                              : energy === "low"
                                ? "#38BDF8"
                                : "#A855F7";
                        return (
                          <View
                            key={`${entry?.section || "section"}_${index}`}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              borderRadius: 12,
                              backgroundColor: "#1B1235",
                              borderWidth: 1,
                              borderColor: "#4C1D95",
                              minWidth: 110,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <View
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 999,
                                  backgroundColor: dotColor,
                                }}
                              />
                              <Text
                                style={{
                                  color: "#F5F3FF",
                                  fontSize: 12,
                                  fontWeight: "800",
                                }}
                              >
                                {entry?.section || `Section ${index + 1}`}
                              </Text>
                            </View>
                            {entry?.note ? (
                              <Text
                                style={{
                                  color: "#C4B5FD",
                                  fontSize: 11,
                                  marginTop: 5,
                                  lineHeight: 16,
                                }}
                              >
                                {entry.note}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {Array.isArray(worshipFlowInsights.mixingTips) &&
                worshipFlowInsights.mixingTips.length > 0 ? (
                  <View>
                    <Text
                      style={{
                        color: "#A78BFA",
                        fontSize: 11,
                        fontWeight: "800",
                        marginBottom: 6,
                        textTransform: "uppercase",
                      }}
                    >
                      FOH Mixing Tips
                    </Text>
                    {worshipFlowInsights.mixingTips.slice(0, 5).map((tip, index) => (
                      <Text
                        key={`mix_tip_${index}`}
                        style={{ color: "#E9D5FF", fontSize: 12, lineHeight: 18 }}
                      >
                        • {tip}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {Array.isArray(worshipFlowInsights.arrangementTips) &&
                worshipFlowInsights.arrangementTips.length > 0 ? (
                  <View>
                    <Text
                      style={{
                        color: "#A78BFA",
                        fontSize: 11,
                        fontWeight: "800",
                        marginBottom: 6,
                        textTransform: "uppercase",
                      }}
                    >
                      Arrangement Tips
                    </Text>
                    {worshipFlowInsights.arrangementTips.slice(0, 4).map((tip, index) => (
                      <Text
                        key={`arrangement_tip_${index}`}
                        style={{ color: "#E9D5FF", fontSize: 12, lineHeight: 18 }}
                      >
                        • {tip}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {worshipFlowInsights.transitionTip ? (
                  <View
                    style={{
                      backgroundColor: "#1B1235",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#4C1D95",
                      padding: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: "#A78BFA",
                        fontSize: 11,
                        fontWeight: "800",
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      Transition Advice
                    </Text>
                    <Text
                      style={{ color: "#F5F3FF", fontSize: 12, lineHeight: 18 }}
                    >
                      {worshipFlowInsights.transitionTip}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text
                style={{
                  color: "#C4B5FD",
                  fontSize: 12,
                  lineHeight: 18,
                }}
              >
                Analyze this song to get Worship Freely probability, section energy,
                FOH tips, arrangement advice, and transition guidance.
              </Text>
            )}
          </View>
        )}

        {/* ── AI Song Recommendations ── */}
        <TouchableOpacity
          style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8,
            backgroundColor:'#312e81', borderRadius:14, paddingVertical:10, marginTop:10,
            opacity: aiRecommendLoading ? 0.6 : 1 }}
          onPress={handleAiRecommend}
          activeOpacity={0.8}
          disabled={aiRecommendLoading}
        >
          <Text style={{ color:'#c7d2fe', fontWeight:'700', fontSize:14 }}>
            {aiRecommendLoading ? '⏳ Getting recommendations…' : '✨ AI: What plays well next?'}
          </Text>
        </TouchableOpacity>
        {Array.isArray(aiRecommendations) && aiRecommendations.length > 0 && (
          <View style={{ backgroundColor:'#0f172a', borderRadius:16, padding:14, marginTop:8, gap:10,
            borderWidth:1, borderColor:'#1e293b' }}>
            <Text style={{ color:'#818cf8', fontWeight:'700', fontSize:12, letterSpacing:1, textTransform:'uppercase' }}>
              AI Recommendations
            </Text>
            {aiRecommendations.map((r, i) => (
              <View key={i} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor:'#1e293b', paddingTop: i > 0 ? 8 : 0 }}>
                <Text style={{ color:'#f1f5f9', fontWeight:'700', fontSize:14 }}>{r.title}</Text>
                <Text style={{ color:'#94a3b8', fontSize:12 }}>{r.artist}{r.suggestedKey ? `  •  Key: ${r.suggestedKey}` : ''}</Text>
                {r.reason ? <Text style={{ color:'#64748b', fontSize:12, marginTop:2 }}>{r.reason}</Text> : null}
              </View>
            ))}
            <TouchableOpacity onPress={() => setAiRecommendations(null)}>
              <Text style={{ color:'#475569', fontSize:12, textAlign:'center', marginTop:4 }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Arrangement Editor ── */}
        <View style={styles.arrangeDivider} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.sectionTitle}>Arrangement Editor</Text>
          {/* Service key badge — shown when opened from a service plan with a transposed key */}
          {serviceTransposedKey && serviceTransposedKey !== key && (
            <TouchableOpacity
              onPress={() => setShowTransposedView((v) => !v)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 10, paddingVertical: 4,
                backgroundColor: showTransposedView ? '#14532D' : '#0A1628',
                borderRadius: 10, borderWidth: 1,
                borderColor: showTransposedView ? '#16A34A' : '#1E3A5F',
              }}
            >
              <Text style={{ fontSize: 11, color: '#6B7280' }}>Orig</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#9CA3AF' }}>{key}</Text>
              <Text style={{ fontSize: 11, color: '#4B5563' }}>→</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#34D399' }}>{serviceTransposedKey}</Text>
              <Text style={{ fontSize: 10, color: showTransposedView ? '#34D399' : '#4B5563' }}>
                {showTransposedView ? '✓' : '👁'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Key info row — shows when a service playing key is set */}
        {serviceTransposedKey && serviceTransposedKey !== key && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: '#050F20', borderRadius: 8,
            borderWidth: 1, borderColor: '#1E3A5F',
            paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>ORIGINAL KEY (CineStage)</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#F9FAFB' }}>{key || '—'}</Text>
            </View>
            <Text style={{ fontSize: 20, color: '#4B5563' }}>→</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: '#34D399', marginBottom: 2 }}>PLAYING THIS SERVICE</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#34D399' }}>{serviceTransposedKey}</Text>
            </View>
          </View>
        )}

        <Text style={styles.mediaSub}>
          Paste the full song map to auto-recognize sections, or add sections
          manually.
        </Text>

        {/* Paste area */}
        <TextInput
          style={styles.chartInput}
          value={rawChart}
          onChangeText={(v) => {
            setRawChart(v);
            markDirty();
          }}
          multiline
          placeholder={
            "Paste lyrics / chord map here...\n\n[Verse 1]\nAm    G    C    F\nAmazing grace how sweet the sound\n\n[Chorus]\nC    G    Am    F\nHow great is our God..."
          }
          placeholderTextColor="#374151"
          textAlignVertical="top"
          scrollEnabled={false}
          autoCorrect={false}
          autoCapitalize="none"
        />

        {/* Chart action button — single smart action */}
        <TouchableOpacity
          style={[styles.autoRecognizeBtn, { marginTop: 10, opacity: aiChartLoading ? 0.6 : 1 }]}
          onPress={handleSmartAnalyze}
          disabled={aiChartLoading}
          activeOpacity={0.8}
        >
          <Text style={styles.autoRecognizeText}>
            {aiChartLoading ? '⏳ Analyzing…' : '✦ Smart Analyze'}
          </Text>
        </TouchableOpacity>

        {/* AI instrument picker + result */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {AI_CHART_INSTRUMENTS.map((inst) => (
            <TouchableOpacity
              key={inst}
              onPress={() => setAiChartInstrument(inst)}
              style={{
                paddingHorizontal: 10, paddingVertical: 4,
                borderRadius: 12,
                backgroundColor: aiChartInstrument === inst ? '#312e81' : '#1e293b',
                borderWidth: 1,
                borderColor: aiChartInstrument === inst ? '#6366f1' : '#334155',
              }}
            >
              <Text style={{ color: aiChartInstrument === inst ? '#a5b4fc' : '#94a3b8', fontSize: 12 }}>{inst}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {aiChartResult && (
          <View style={{ marginTop: 10, backgroundColor: '#0f172a', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#4f46e5' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ color: '#818cf8', fontSize: 13, fontWeight: '600' }}>🤖 AI Chart — {aiChartResult.instrument}</Text>
              <TouchableOpacity onPress={() => { setRawChart(aiChartResult.text); setAiChartResult(null); markDirty(); }}>
                <Text style={{ color: '#34d399', fontSize: 12 }}>Use this ↑</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: '#cbd5e1', fontSize: 12, fontFamily: 'monospace' }}>{aiChartResult.text}</Text>
          </View>
        )}

        {/* ── CAGED Reference (Guitar + Acoustic only) ──────────────────── */}
        {(aiChartInstrument === 'Electric Guitar' || aiChartInstrument === 'Acoustic Guitar') && cagedData && (
          <View style={{ marginTop: 8, backgroundColor: '#0B1324', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#FB923C33' }}>
            <Text style={{ color: '#FB923C', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
              🎸 CAGED — Key of {cagedData.key}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(cagedData.caged_positions || {}).map(([shape, fret]) => (
                <View key={shape} style={{ backgroundColor: '#1e293b', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#334155' }}>
                  <Text style={{ color: '#94a3b8', fontSize: 9 }}>{shape.replace('_shape', '-shape')}</Text>
                  <Text style={{ color: '#e2e8f0', fontSize: 13, fontWeight: '700' }}>{fret}</Text>
                </View>
              ))}
            </View>
            <Text style={{ color: '#475569', fontSize: 10, marginTop: 6 }}>{cagedData.tip}</Text>
          </View>
        )}

        {/* ── Strumming Patterns (Acoustic only) ─────────────────────────── */}
        {aiChartInstrument === 'Acoustic Guitar' && strummingData && (
          <View style={{ marginTop: 6, backgroundColor: '#0B1324', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#34D39933' }}>
            <Text style={{ color: '#34D399', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
              🎵 Strumming Patterns — {strummingData.time_signature}
            </Text>
            {(strummingData.patterns || []).map((p, i) => (
              <View key={i} style={{ marginBottom: 5 }}>
                <Text style={{ color: '#64748b', fontSize: 10 }}>{p.name} · {p.difficulty} · {p.style}</Text>
                <Text style={{ color: '#e2e8f0', fontSize: 14, fontFamily: 'monospace', letterSpacing: 2, marginTop: 1 }}>{p.pattern}</Text>
              </View>
            ))}
            <Text style={{ color: '#475569', fontSize: 10, marginTop: 4 }}>{strummingData.tip}</Text>
          </View>
        )}

        {/* ── Bass Fingering ──────────────────────────────────────────────── */}
        {aiChartInstrument === 'Bass' && bassFingering && (
          <View style={{ marginTop: 8, backgroundColor: '#0B1324', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#60A5FA33' }}>
            <Text style={{ color: '#60A5FA', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
              🎸 Bass Root: {bassFingering.note}
            </Text>
            {(bassFingering.positions || []).slice(0, 4).map((p, i) => (
              <Text key={i} style={{ color: i === 0 ? '#93c5fd' : '#64748b', fontSize: 11, marginBottom: 2 }}>
                {i === 0 ? '★ ' : '  '}{p.string} string — {p.position}
              </Text>
            ))}
            <Text style={{ color: '#475569', fontSize: 10, marginTop: 4 }}>{bassFingering.tip}</Text>
          </View>
        )}

        {/* ── Role / Parts selector ── */}
        {sections.length > 0 && (
          <View style={styles.roleBar}>
            <Text style={styles.roleBarLabel}>View as:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.roleScroll}
            >
              <TouchableOpacity
                style={[styles.roleChip, !selectedRole && styles.roleChipAll]}
                onPress={() => setSelectedRole(null)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    !selectedRole && styles.roleChipTextAll,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.roleChip,
                    selectedRole === r && {
                      backgroundColor: ROLE_COLORS[r] + "22",
                      borderColor: ROLE_COLORS[r],
                    },
                  ]}
                  onPress={() => setSelectedRole(selectedRole === r ? null : r)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.roleDot,
                      { backgroundColor: ROLE_COLORS[r] },
                    ]}
                  />
                  <Text
                    style={[
                      styles.roleChipText,
                      selectedRole === r && {
                        color: ROLE_COLORS[r],
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Transposed chart preview — shown when a service playing key is active */}
        {showTransposedView && serviceTransposedKey && serviceTransposedKey !== key && rawChart.trim() && (
          <View style={{
            backgroundColor: '#040B16', borderRadius: 10,
            borderWidth: 1, borderColor: '#1E3A5F',
            padding: 14, marginBottom: 14,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#34D399', letterSpacing: 0.5 }}>
                🔑 TRANSPOSED TO {serviceTransposedKey}
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#1E3A5F' }} />
              <Text style={{ fontSize: 10, color: '#4B5563' }}>read-only</Text>
            </View>
            <ChordChartView text={transposeChordChart(rawChart, key, serviceTransposedKey)} />
          </View>
        )}

        {/* Sections list */}
        {sections.length === 0 ? (
          <Text style={styles.noSections}>No media yet.</Text>
        ) : (
          sections.map((sec) => (
            <View key={sec.id} style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.sectionCardHeader}
                onPress={() => toggleSection(sec.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.sectionCardName}>{sec.name}</Text>
                <View style={styles.sectionCardRight}>
                  {/* Role dots — show which roles have notes */}
                  {!selectedRole && (
                    <View style={styles.partDots}>
                      {ROLES.filter((r) => sec.parts?.[r]?.trim()).map((r) => (
                        <View
                          key={r}
                          style={[
                            styles.partDotSmall,
                            { backgroundColor: ROLE_COLORS[r] },
                          ]}
                        />
                      ))}
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => removeSection(sec.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.removeBtn}>✕</Text>
                  </TouchableOpacity>
                  <Text style={styles.chevron}>{sec.expanded ? "▲" : "▼"}</Text>
                </View>
              </TouchableOpacity>

              {sec.expanded && (
                <View style={styles.sectionContent}>
                  {/* Chord chart — hidden for Drums (they don't use chord charts) */}
                  {selectedRole !== 'Drums' && (
                    sec.content ? (
                      <ChordChartView
                        text={showTransposedView && serviceTransposedKey && serviceTransposedKey !== key
                          ? transposeChordChart(sec.content, key, serviceTransposedKey)
                          : sec.content}
                      />
                    ) : (
                      <Text style={styles.sectionEmpty}>No chart content</Text>
                    )
                  )}

                  {/* ── Parts area ── */}
                  {selectedRole ? (
                    // Single-role focused view
                    <View
                      style={[
                        styles.partBox,
                        { borderColor: ROLE_COLORS[selectedRole] + "55" },
                      ]}
                    >
                      <View style={styles.partBoxHeader}>
                        <View
                          style={[
                            styles.roleDot,
                            { backgroundColor: ROLE_COLORS[selectedRole] },
                          ]}
                        />
                        <Text
                          style={[
                            styles.partBoxRole,
                            { color: ROLE_COLORS[selectedRole] },
                          ]}
                        >
                          {selectedRole}
                        </Text>
                      </View>

                      {/* Drums-specific: feel + pattern quick-insert chips */}
                      {selectedRole === "Drums" && (
                        <View style={{ marginBottom: 10 }}>
                          <Text style={{ color: '#374151', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                            Quick Insert
                          </Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              {[
                                { label: 'Driving', text: 'Driving 4-on-floor — K on 1&3, S on 2&4, HH 8ths' },
                                { label: 'Half-time', text: 'Half-time feel — K on 1, S on 3, slow HH' },
                                { label: 'Ballad', text: 'Ballad — light brush/rim, sparse kick, soft swells' },
                                { label: 'Build', text: '▲ Build — increase intensity, open HH → ride bell' },
                                { label: 'Rim click', text: 'Rim click only — no full snare' },
                                { label: 'Wash', text: 'Cymbal wash — swell into section' },
                                { label: '🔇 Rest', text: '(rest — tacet this section)' },
                              ].map(({ label, text }) => (
                                <TouchableOpacity
                                  key={label}
                                  style={[styles.rigInsertChip, { backgroundColor: '#34D39915', borderColor: '#34D39940' }]}
                                  onPress={() => {
                                    const cur = sec.parts?.['Drums'] || '';
                                    const appended = cur ? `${cur}\n${text}` : text;
                                    updateSectionPart(sec.id, 'Drums', appended);
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Text style={{ color: '#34D399', fontSize: 11, fontWeight: '700' }}>{label}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                      )}

                      {/* Keys-specific: rig insert chips */}
                      {selectedRole === "Keys" && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={{ marginBottom: 8 }}
                        >
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            {keysRigs.map((rig) => (
                              <TouchableOpacity
                                key={rig.id}
                                style={[
                                  styles.rigInsertChip,
                                  {
                                    backgroundColor: rig.color + "28",
                                    borderColor: rig.color + "66",
                                  },
                                ]}
                                onPress={() => {
                                  const cur =
                                    sec.parts?.[sec.id] ||
                                    sec.parts?.["Keys"] ||
                                    "";
                                  const val = cur;
                                  const sel = keysSelections[sec.id] || {
                                    start: val.length,
                                    end: val.length,
                                  };
                                  const before = val.slice(0, sel.start);
                                  const after = val.slice(sel.end);
                                  const prefix =
                                    before.length > 0 && !before.endsWith("\n")
                                      ? "\n"
                                      : "";
                                  const newText =
                                    before + `${prefix}[${rig.name}] ` + after;
                                  updateSectionPart(sec.id, "Keys", newText);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={{
                                    color: rig.color,
                                    fontSize: 11,
                                    fontWeight: "800",
                                  }}
                                >
                                  {rig.name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      )}

                      <TextInput
                        style={[
                          styles.partBoxInput,
                          selectedRole === 'Drums' && { fontFamily: 'monospace', lineHeight: 20 },
                        ]}
                        value={sec.parts?.[selectedRole] || ""}
                        onChangeText={(v) =>
                          updateSectionPart(sec.id, selectedRole, v)
                        }
                        onSelectionChange={
                          selectedRole === "Keys"
                            ? (e) =>
                                setKeysSelections((prev) => ({
                                  ...prev,
                                  [sec.id]: e.nativeEvent.selection,
                                }))
                            : undefined
                        }
                        placeholder={
                          selectedRole === 'Drums'
                            ? 'Groove, feel notes, pattern cues...\ne.g. Driving — K on 1&3, S on 2&4, 8th HH'
                            : `Add ${selectedRole} notes for this section...`
                        }
                        placeholderTextColor="#374151"
                        multiline
                        textAlignVertical="top"
                        scrollEnabled={false}
                        autoCorrect={false}
                      />

                      {/* Keys live preview with colored rig chips */}
                      {selectedRole === "Keys" &&
                        sec.parts?.["Keys"]?.includes("[") && (
                          <View
                            style={{
                              marginTop: 10,
                              paddingTop: 10,
                              borderTopWidth: 1,
                              borderTopColor: "#1F2937",
                            }}
                          >
                            <Text
                              style={{
                                color: "#374151",
                                fontSize: 10,
                                fontWeight: "800",
                                textTransform: "uppercase",
                                letterSpacing: 1,
                                marginBottom: 4,
                              }}
                            >
                              Preview
                            </Text>
                            <KeysPartView
                              text={sec.parts["Keys"]}
                              rigs={keysRigs}
                            />
                          </View>
                        )}

                      {/* ── Keys Preset AI ─────────────────────── */}
                      {selectedRole === 'Keys' && (
                        <View>
                          <TouchableOpacity
                            style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                                     marginTop:10, paddingVertical:8, borderTopWidth:1, borderColor:'#1f2937' }}
                            onPress={() => setKeysPresetExpanded(v => !v)}
                            activeOpacity={0.7}
                          >
                            <Text style={{ color:'#818cf8', fontSize:12, fontWeight:'700' }}>🎹 CineStage Preset AI</Text>
                            <Text style={{ color:'#4b5563', fontSize:16 }}>{keysPresetExpanded ? '▲' : '▼'}</Text>
                          </TouchableOpacity>
                          {keysPresetExpanded && (
                            <View style={{ marginTop:6 }}>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:8 }}>
                                <View style={{ flexDirection:'row', gap:6 }}>
                                  {['Worship Keys','Ambient Pad','Strings','Organ B3','Synth Lead'].map(pt => (
                                    <TouchableOpacity key={pt} onPress={() => setKeysPresetType(pt)}
                                      style={{ paddingHorizontal:10, paddingVertical:4, borderRadius:20,
                                               backgroundColor: keysPresetType===pt ? '#312e81' : '#1e293b',
                                               borderWidth:1, borderColor: keysPresetType===pt ? '#6366f1' : '#334155' }}>
                                      <Text style={{ color: keysPresetType===pt ? '#a5b4fc' : '#94a3b8', fontSize:11 }}>{pt}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </ScrollView>
                              <TouchableOpacity
                                style={{ backgroundColor:'#4f46e5', borderRadius:8, padding:10, alignItems:'center',
                                         opacity: keysPresetLoading ? 0.6 : 1 }}
                                onPress={handleGenerateKeysPreset} disabled={keysPresetLoading} activeOpacity={0.8}>
                                <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>
                                  {keysPresetLoading ? '⏳ Generating…' : '🎹 Generate Preset'}
                                </Text>
                              </TouchableOpacity>
                              {keysPresetResult && (
                                <View style={{ marginTop:8, backgroundColor:'#0f172a', borderRadius:8, padding:10,
                                               borderWidth:1, borderColor:'#1e3a5f' }}>
                                  <Text style={{ color:'#34d399', fontSize:12, fontWeight:'700', marginBottom:2 }}>
                                    ✓ {keysPresetResult.preset_name || keysPresetResult.name || keysPresetType}
                                  </Text>
                                  {keysPresetResult.program_number !== undefined && (
                                    <Text style={{ color:'#94a3b8', fontSize:11 }}>
                                      Program: {keysPresetResult.program_number} · Bank: {keysPresetResult.bank || 0}
                                    </Text>
                                  )}
                                  {(keysPresetResult.description || keysPresetResult.content) && (
                                    <Text style={{ color:'#94a3b8', fontSize:11, marginTop:4 }}>
                                      {keysPresetResult.description || keysPresetResult.content}
                                    </Text>
                                  )}
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  ) : (
                    // All-roles summary: show every role that has notes + empty ones collapsed
                    <View style={styles.allPartsGrid}>
                      {ROLES.map((r) => {
                        const note = sec.parts?.[r] || "";
                        return (
                          <TouchableOpacity
                            key={r}
                            style={styles.allPartRow}
                            onPress={() => setSelectedRole(r)}
                            activeOpacity={0.7}
                          >
                            <View
                              style={[
                                styles.roleDot,
                                { backgroundColor: ROLE_COLORS[r] },
                              ]}
                            />
                            <Text style={styles.allPartRole}>{r}</Text>
                            {r === "Keys" && note.includes("[") ? (
                              <View style={{ flex: 1 }}>
                                <KeysPartView
                                  text={note.split("\n").slice(0, 2).join("\n")}
                                  rigs={keysRigs}
                                />
                              </View>
                            ) : (
                              <Text
                                style={styles.allPartNote}
                                numberOfLines={1}
                              >
                                {note || "—"}
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          ))
        )}

        {/* Add Section */}
        {addSectionVisible ? (
          <View style={styles.addSecRow}>
            <TextInput
              style={[styles.input, styles.flex1]}
              value={addSectionName}
              onChangeText={setAddSectionName}
              placeholder="Section name (e.g. Verse 2)"
              placeholderTextColor="#4B5563"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddSection}
            />
            <TouchableOpacity
              style={styles.addSecConfirm}
              onPress={handleAddSection}
              activeOpacity={0.8}
            >
              <Text style={styles.addSecConfirmText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addSecCancel}
              onPress={() => setAddSectionVisible(false)}
            >
              <Text style={styles.addSecCancelText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addSectionBtn}
            onPress={() => setAddSectionVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.addSectionBtnText}>+ Add Section</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <CineStageProcessingOverlay
        visible={processing}
        title="CineStage™ is processing"
        subtitle="Wait — we'll let you know when it's done."
        steps={CINESTAGE_STEPS}
        currentStepIndex={processingStep}
        progress={processingProgress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  container: { padding: 20, paddingBottom: 80 },

  sectionTitle: {
    color: "#F9FAFB",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  sectionSub: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  mediaSub: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },

  input: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#F9FAFB",
    fontSize: 14,
  },
  mt8: { marginTop: 8 },

  stemUploadSection: {
    marginTop: 12,
    backgroundColor: '#070E1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E3A5F',
    padding: 12,
  },
  stemUploadTitle: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  stemPickBtn: {
    backgroundColor: '#1E3A5F',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  stemPickBtnText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
  },
  stemUploadHint: {
    color: '#4B5563',
    fontSize: 11,
    marginBottom: 10,
    lineHeight: 16,
  },
  stemEmptyText: {
    color: '#374151',
    fontSize: 12,
    fontStyle: 'italic',
  },
  stemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    backgroundColor: '#0B1728',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  stemRowBadge: {
    backgroundColor: '#1E3A5F',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  stemRowBadgeText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '800',
  },
  stemRowName: {
    flex: 1,
    color: '#9CA3AF',
    fontSize: 12,
  },
  stemRowRemove: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '700',
  },
  flex1: { flex: 1 },

  row: { flexDirection: "row", gap: 8, marginTop: 8 },

  timeSigRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tsChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  tsChipActive: { backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  tsChipText: { color: "#6B7280", fontSize: 12, fontWeight: "600" },
  tsChipTextActive: { color: "#FFFFFF" },

  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    flexWrap: "wrap",
  },
  saveBtn: {
    backgroundColor: "#166534",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  saveBtnDim: { opacity: 0.5 },
  saveBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },

  cineBtn: {
    backgroundColor: "#1E1B4B",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "#4338CA",
  },
  cineBtnDim: { opacity: 0.4 },
  cineBtnText: { color: "#818CF8", fontWeight: "700", fontSize: 13 },

  arrangeDivider: {
    height: 1,
    backgroundColor: "#111827",
    marginVertical: 24,
  },

  chartInput: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 8,
    padding: 12,
    color: "#E5E7EB",
    fontSize: 13,
    lineHeight: 21,
    fontFamily: "monospace",
    minHeight: 160,
    textAlignVertical: "top",
  },

  autoRecognizeBtn: {
    marginTop: 10,
    backgroundColor: "#166534",
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 20,
    alignSelf: "flex-start",
  },
  autoRecognizeText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },

  parseChartBtn: {
    backgroundColor: "#1C1A00",
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#854D0E",
  },
  parseChartBtnText: { color: "#FDE047", fontWeight: "700", fontSize: 14 },

  noSections: {
    color: "#374151",
    fontSize: 13,
    marginTop: 16,
    fontStyle: "italic",
  },

  sectionCard: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1F2937",
    marginTop: 10,
    overflow: "hidden",
  },
  sectionCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  sectionCardName: {
    color: "#818CF8",
    fontWeight: "700",
    fontSize: 14,
    textTransform: "capitalize",
    flex: 1,
  },
  sectionCardRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  removeBtn: { color: "#4B5563", fontSize: 13 },
  chevron: { color: "#4B5563", fontSize: 11 },

  sectionContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderColor: "#111827",
    paddingTop: 10,
  },
  sectionEmpty: { color: "#374151", fontSize: 13, fontStyle: "italic" },

  addSecRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    alignItems: "center",
  },
  addSecConfirm: {
    backgroundColor: "#166534",
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  addSecConfirmText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  addSecCancel: {
    backgroundColor: "#1F2937",
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  addSecCancelText: { color: "#9CA3AF", fontSize: 13 },

  addSectionBtn: {
    marginTop: 12,
    backgroundColor: "#0F172A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1F2937",
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignSelf: "flex-start",
  },
  addSectionBtnText: { color: "#9CA3AF", fontSize: 13, fontWeight: "600" },

  // Role selector
  roleBar: { marginTop: 14, marginBottom: 2 },
  roleBarLabel: { color: "#6B7280", fontSize: 11, marginBottom: 6 },
  roleScroll: { gap: 6 },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  roleChipAll: { backgroundColor: "#1E1B4B", borderColor: "#4338CA" },
  roleChipText: { color: "#6B7280", fontSize: 12, fontWeight: "600" },
  roleChipTextAll: { color: "#818CF8" },
  roleDot: { width: 8, height: 8, borderRadius: 4 },

  // Section parts
  partDots: { flexDirection: "row", gap: 4, marginRight: 4 },
  partDotSmall: { width: 7, height: 7, borderRadius: 4 },

  partBox: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#060D1A",
    padding: 12,
  },
  partBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  partBoxRole: { fontWeight: "700", fontSize: 13 },
  partBoxInput: {
    color: "#E5E7EB",
    fontSize: 13,
    lineHeight: 20,
    minHeight: 60,
    textAlignVertical: "top",
  },

  allPartsGrid: { marginTop: 12, gap: 0 },
  allPartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#0F172A",
  },
  allPartRole: { color: "#6B7280", fontSize: 12, fontWeight: "600", width: 52 },
  allPartNote: { color: "#9CA3AF", fontSize: 12, flex: 1 },

  // Audio Routing
  routingToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 2,
  },
  routingToggleLabel: { color: "#9CA3AF", fontWeight: "700", fontSize: 13 },
  routingOverrideBadge: {
    backgroundColor: "#1E1B4B",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#4338CA",
  },
  routingOverrideBadgeText: {
    color: "#818CF8",
    fontSize: 10,
    fontWeight: "800",
  },
  routingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0B1120",
    marginBottom: 12,
    overflow: "hidden",
  },
  routingCardDivider: { height: 1, backgroundColor: "#1F2937" },
  routingGroupName: {
    color: "#374151",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 3,
  },
  songRoutingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "#0F172A",
  },
  songRoutingLabel: { color: "#D1D5DB", fontWeight: "700", fontSize: 13 },
  songRoutingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  songRoutingValue: { fontSize: 11, fontWeight: "700" },

  // Routing picker modal
  routingModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  routingPickerCard: {
    width: 270,
    backgroundColor: "#0F172A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 16,
  },
  routingPickerTitle: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  routingPickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 4,
  },
  routingPickerDot: { width: 8, height: 8, borderRadius: 4 },
  routingPickerOptText: { color: "#9CA3AF", fontSize: 14 },

  // Cue Sync toggle
  cueSyncRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 2,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0B1120",
  },
  cueSyncLabel: { color: "#E5E7EB", fontWeight: "700", fontSize: 13 },
  cueSyncSub: { color: "#4B5563", fontSize: 11, marginTop: 2, lineHeight: 16 },
  cueSyncPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
  },
  cueSyncPillOn: { backgroundColor: "#0F2822", borderColor: "#059669" },
  cueSyncPillText: { color: "#6B7280", fontWeight: "800", fontSize: 12 },
  cueSyncPillTextOn: { color: "#34D399" },

  // Keyboard Rigs manager
  rigManagerCard: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  rigManagerHint: {
    color: "#4B5563",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 4,
  },
  rigRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rigColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    flexShrink: 0,
  },
  rigNameInput: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "#0F172A",
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#1F2937",
    width: 80,
  },
  rigColorSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    opacity: 0.7,
  },
  rigColorSwatchActive: {
    opacity: 1,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  rigAddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
    paddingTop: 10,
  },
  rigAddInput: {
    color: "#F9FAFB",
    fontSize: 13,
    backgroundColor: "#0F172A",
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#1F2937",
    width: 100,
  },
  rigAddBtn: {
    backgroundColor: "#1E1B4B",
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#4338CA",
  },
  rigAddBtnText: { color: "#818CF8", fontWeight: "700", fontSize: 12 },

  // Rig insert chips (in Keys part editor)
  rigInsertChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
});
