import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Speech from "expo-speech";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import * as audioEngine from "../audioEngine";
import WaveformTimeline from "../components/WaveformTimeline";
import { getSettings, getSongs } from "../data/storage";
import {
  applyLatencyCompensationSeconds,
  getLatencyCalibration,
  getTotalLatencyMs,
  saveLatencyCalibration,
} from "../services/latencyCalibrationStore";
import {
  evaluateJumpSafety,
  isLiveLocked,
  validateArmedPipeline,
} from "../services/livePerformancePolicy";
import {
  cycleNextPadKit,
  getActivePadKit,
  getPadKits,
  importPadKitFromJsonText,
} from "../services/padKitStore";
import {
  createPredictiveState,
  registerJumpIntent,
  suggestNextMarkers,
} from "../services/predictiveJumpEngine";
import {
  listAvailableRecordingInputs,
  startTrackRecording,
  stopTrackRecording,
} from "../services/recordingInputService";
import {
  getArmedPipelineHistory,
  loadArmedPipeline,
  rollbackArmedPipeline,
} from "../services/rehearsalPipelineStore";
import { loadSetlist } from "../services/setlistStore";
import {
  advanceToNextSong,
  buildSetlistWaveState,
  getNextSong,
  markSongLoaded,
  markSongPreloaded,
  shouldAutoPlayNext,
} from "../services/setlistWavePipeline";
import { resolveTransitionWindow } from "../services/wavePipelineEngine";
import { connectSync, disconnectSync, send, subscribeSync, getSyncStatus } from "../services/syncClient";
import { SYNC_URL } from "./config";

const SECTION_COLORS = {
  intro: "#6B7280",
  verse: "#6366F1",
  "pre-chorus": "#8B5CF6",
  chorus: "#EC4899",
  bridge: "#F59E0B",
  outro: "#10B981",
  tag: "#0EA5E9",
};

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

function buildTrackLanes(visibleTrackIds) {
  return (visibleTrackIds || []).map((id) => ({
    id,
    label: String(id),
    mute: false,
    solo: false,
    recordArmed: false,
    active: false,
    recordedUri: null,
  }));
}

function stemsResultFromLocalStems(localStems) {
  const entries = Object.entries(localStems || {});
  if (entries.length === 0) return null;
  return {
    stems: entries
      .filter(([, info]) => info?.localUri)
      .map(([name, info]) => ({
        type: String(name || "").toLowerCase(),
        url: info.localUri,
      })),
  };
}

function queueItemFromSong(song, apiBase, fallbackPipeline) {
  const backendResult = song?.latestStemsJob?.result || null;
  const localResult = stemsResultFromLocalStems(song?.localStems || {});
  const stemsResult = backendResult || localResult;
  if (
    !stemsResult ||
    !Array.isArray(stemsResult.stems) ||
    stemsResult.stems.length === 0
  )
    return null;
  return {
    id: song.id,
    title: song.title || "Untitled Song",
    bpm: Number(song.bpm || fallbackPipeline?.bpm || 120),
    pipeline: {
      ...(fallbackPipeline || {}),
      songId: song.id,
      songTitle: song.title || "Untitled Song",
      artist: song.artist || "",
      bpm: Number(song.bpm || fallbackPipeline?.bpm || 120),
    },
    stemsResult,
    apiBase: apiBase || "",
    preloadStatus: "idle",
  };
}

export default function PerformanceScreen() {
  const [pipeline, setPipeline] = useState(null);
  const [activePadKit, setActivePadKit] = useState(null);
  const [kitsCount, setKitsCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [policyError, setPolicyError] = useState(null);
  const [blockedTrackIds, setBlockedTrackIds] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [jumpStatus, setJumpStatus] = useState("No jump scheduled.");
  const [latencyCalibration, setLatencyCalibration] = useState(null);
  const [predictiveState, setPredictiveState] = useState(
    createPredictiveState([]),
  );
  const [suggestedJumps, setSuggestedJumps] = useState([]);
  const [history, setHistory] = useState([]);
  const [setlistState, setSetlistState] = useState(null);
  const [trackLanes, setTrackLanes] = useState([]);
  const [recordingInputs, setRecordingInputs] = useState([]);
  const [selectedInputUid, setSelectedInputUid] = useState(null);
  const [recordingSession, setRecordingSession] = useState(null);
  const [recordedClips, setRecordedClips] = useState([]);
  const [demoLogs, setDemoLogs] = useState([]);
  const [safetyMode, setSafetyMode] = useState("guided"); // 'strict' | 'guided' | 'tech'
  const [liveLock, setLiveLock] = useState(true);
  const pollRef = useRef(null);
  const jumpTimerRef = useRef(null);
  const preloadTimerRef = useRef(null);
  const endedLatchRef = useRef(false);
  const demoTimerRef = useRef(null);
  const setlistStateRef = useRef(null);
  const sectionLoopActiveRef = useRef(false);
  const loopStartRef = useRef(null);
  const loopEndRef = useRef(null);
  const loopSeekLockRef = useRef(false);
  const lastSectionTapRef = useRef({ label: null, time: 0 });
  const announcedSectionRef = useRef("");
  const voiceGuideEnabledRef = useRef(true);
  const sectionJumpListRef = useRef([]);
  const pipelineRef = useRef(null);
  const currentSectionRef = useRef(null);
  const [autoDemoRunning, setAutoDemoRunning] = useState(false);
  const [activeSectionLabel, setActiveSectionLabel] = useState(null);
  const [sectionLoopActive, setSectionLoopActive] = useState(false);
  const [queuedSectionLabel, setQueuedSectionLabel] = useState(null);
  const [voiceGuideEnabled, setVoiceGuideEnabled] = useState(true);
  
  // Real-time MD Sync
  const [syncRole, setSyncRole] = useState("OFF"); // 'HOST', 'FOLLOWER', 'OFF'
  const [syncStatus, setSyncStatus] = useState("disconnected");
  const isHost = syncRole === "HOST";
  const isFollower = syncRole === "FOLLOWER";

  const appendDemoLog = useCallback((message) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const stamp = `${hh}:${mm}:${ss}`;
    setDemoLogs((prev) => [`${stamp} ${message}`, ...prev].slice(0, 40));
  }, []);

  const loadRealSongsFromStemCenter = useCallback(
    async (armed, existingSetlist = null) => {
      const settings = await getSettings();
      const librarySongs = await getSongs();
      const fromLibrary = (librarySongs || [])
        .map((song) => queueItemFromSong(song, settings?.apiBase || "", armed))
        .filter(Boolean);

      if (fromLibrary.length === 0) {
        appendDemoLog("No real Stem Center songs with stems found in library.");
        return buildSetlistWaveState(existingSetlist || { songs: [] }, armed);
      }

      const queue = fromLibrary.map((item, idx) => ({
        ...item,
        preloadStatus: idx === 0 ? "loaded" : "idle",
      }));
      appendDemoLog(
        `Loaded ${queue.length} real songs from Stem Center library.`,
      );
      return {
        queue,
        activeIndex: 0,
        preloadNext: true,
        autoPlayNext: false,
        transitionGapSec: 0,
      };
    },
    [appendDemoLog],
  );

  const stopPolling = useCallback(() => {
    if (!pollRef.current) return;
    clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const clearJumpTimer = useCallback(() => {
    if (!jumpTimerRef.current) return;
    clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = null;
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const pos = await audioEngine.getPosition();
      const dur = await audioEngine.getDuration();
      setPosition(pos);
      setDuration(dur);

      // ── Section loop enforcement ──────────────────────────────────────────
      if (
        sectionLoopActiveRef.current &&
        loopEndRef.current !== null &&
        !loopSeekLockRef.current
      ) {
        if (pos >= loopEndRef.current - 0.08) {
          loopSeekLockRef.current = true;
          const loopStart = loopStartRef.current || 0;
          audioEngine.seek(loopStart);
          setPosition(loopStart);
          announcedSectionRef.current = "";
          setTimeout(() => {
            loopSeekLockRef.current = false;
          }, 200);
        }
      }

      // ── Auto-detect current section (when not in loop) ────────────────────
      if (!sectionLoopActiveRef.current) {
        const secs = sectionJumpListRef.current;
        for (let i = 0; i < secs.length; i++) {
          const sec = secs[i];
          const nextSec = secs[i + 1];
          if (pos >= sec.timeSec && (!nextSec || pos < nextSec.timeSec)) {
            if (currentSectionRef.current !== sec.label) {
              currentSectionRef.current = sec.label;
              setActiveSectionLabel(sec.label);
            }
            break;
          }
        }
      }

      // ── Voice guide: announce section name 1 bar before arrival ───────────
      if (voiceGuideEnabledRef.current) {
        const bpm = Math.max(30, Number(pipelineRef.current?.bpm || 120));
        const oneBar = (4 * 60) / bpm;
        const secs = sectionJumpListRef.current;
        for (const sec of secs) {
          const dist = sec.timeSec - pos;
          if (dist > 0 && dist <= oneBar) {
            if (announcedSectionRef.current !== sec.label) {
              announcedSectionRef.current = sec.label;
              Speech.speak(sec.label, { rate: 0.9, pitch: 1.05 });
            }
            break;
          }
        }
      }

      // ── Song end detection (skip if in loop) ─────────────────────────────
      if (
        dur > 0 &&
        pos >= dur - 0.25 &&
        isPlaying &&
        !endedLatchRef.current &&
        !sectionLoopActiveRef.current
      ) {
        endedLatchRef.current = true;
        setIsPlaying(false);
        stopPolling();
        if (shouldAutoPlayNext(setlistState)) {
          await handleNextSong(true);
        }
      }
      if (dur > 0 && pos < dur - 1) endedLatchRef.current = false;
    }, 80);
  }, [isPlaying, setlistState, stopPolling]);

  useEffect(() => {
    (async () => {
      const armed = await loadArmedPipeline();
      setPipeline(armed);
      if (armed?.safetyPolicy?.mode) setSafetyMode(armed.safetyPolicy.mode);
      setLiveLock(armed?.restrictions?.liveLock !== false);
      const validation = validateArmedPipeline(armed);
      setPolicyError(validation.ok ? null : validation.reason);
      const allTracks = armed?.restrictions?.allTrackIds || [];
      const visibleTracks = new Set(armed?.restrictions?.visibleTrackIds || []);
      setBlockedTrackIds(allTracks.filter((id) => !visibleTracks.has(id)));
      setTrackLanes(
        buildTrackLanes(armed?.restrictions?.visibleTrackIds || []),
      );
      const kits = await getPadKits();
      setKitsCount(kits.length);
      const active = await getActivePadKit();
      setActivePadKit(active);
      setDuration(await audioEngine.getDuration());
      setPosition(await audioEngine.getPosition());
      const calibration = await getLatencyCalibration();
      setLatencyCalibration(calibration);
      const historyRows = await getArmedPipelineHistory();
      setHistory(historyRows);
      const seeded = createPredictiveState(armed?.markers || []);
      setPredictiveState(seeded);
      setSuggestedJumps(suggestNextMarkers(seeded, null, 3));
      const setlist = await loadSetlist();
      const baseWaveState = buildSetlistWaveState(setlist, armed);
      if ((baseWaveState?.queue || []).length <= 1) {
        const enriched = await loadRealSongsFromStemCenter(armed, setlist);
        setSetlistState(enriched);
      } else {
        setSetlistState(baseWaveState);
      }
      const inputs = await listAvailableRecordingInputs().catch(() => []);
      setRecordingInputs(inputs);
      setSelectedInputUid(inputs?.[0]?.uid || null);
    })();
    return () => {
      stopPolling();
      clearJumpTimer();
      if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current);
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    };
  }, [clearJumpTimer, loadRealSongsFromStemCenter, stopPolling]);

  useEffect(() => {
    setlistStateRef.current = setlistState;
  }, [setlistState]);

  useEffect(() => {
    if (!setlistState?.preloadNext) return;
    const nextSong = getNextSong(setlistState);
    if (!nextSong || nextSong.preloadStatus !== "idle") return;
    if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current);
    preloadTimerRef.current = setTimeout(async () => {
      try {
        if (nextSong.stemsResult) {
          await audioEngine.preloadFromBackend(
            nextSong.stemsResult,
            nextSong.apiBase || "",
          );
          appendDemoLog(`Preloaded next song audio: ${nextSong.title}`);
        }
        setSetlistState((prev) => markSongPreloaded(prev, nextSong.id));
        setJumpStatus(`Preloaded next song: ${nextSong.title}`);
      } catch (error) {
        setJumpStatus(`Preload failed: ${String(error?.message || error)}`);
        appendDemoLog(
          `Preload failed for ${nextSong.title}: ${String(error?.message || error)}`,
        );
      }
    }, 700);
  }, [appendDemoLog, setlistState]);

  useEffect(() => {
    setTrackLanes((prev) => {
      const hasSolo = prev.some((t) => t.solo && !t.mute);
      return prev.map((lane) => ({
        ...lane,
        active: isPlaying && !lane.mute && (hasSolo ? lane.solo : true),
      }));
    });
  }, [isPlaying]);

  useEffect(() => {
    if (!trackLanes.length) return;
    audioEngine.setMixerState(
      trackLanes.map((lane) => ({
        id: lane.id,
        mute: Boolean(lane.mute),
        solo: Boolean(lane.solo),
        volume: 1,
      })),
    );
  }, [trackLanes]);

  const loopLabel = useMemo(() => {
    if (!pipeline?.loop?.enabled) return "Loop OFF";
    const start = formatTime(pipeline?.loop?.start || 0);
    const end = formatTime(pipeline?.loop?.end || 0);
    return `Loop ${start} - ${end}`;
  }, [pipeline]);

  const transitionPreview = useMemo(() => {
    const markers = pipeline?.markers || [];
    const mode = pipeline?.performancePolicy?.transitionMode || "CUT";
    if (markers.length < 2) return [];
    return markers
      .slice(0, 6)
      .map((marker, idx) => {
        const next = markers[idx + 1];
        if (!next) return null;
        return {
          id: `${marker.id}_${next.id}`,
          from: marker.label,
          to: next.label,
          window: resolveTransitionWindow(marker.end, next.start, mode, 1.0),
        };
      })
      .filter(Boolean);
  }, [pipeline]);

  const jumpTargets = useMemo(() => {
    const fromPolicy = pipeline?.performancePolicy?.jumpTargets || [];
    if (fromPolicy.length > 0) return fromPolicy;
    return (pipeline?.markers || []).map((m) => ({
      markerId: m.id,
      label: m.label,
      targetSec: Number(m.start || 0),
      quantizedTargetSec: Number(m.start || 0),
    }));
  }, [pipeline]);

  const totalLatencyMs = useMemo(
    () => getTotalLatencyMs(latencyCalibration),
    [latencyCalibration],
  );

  const sectionJumpList = useMemo(() => {
    const eff = duration || pipeline?.durationSec || 0;
    const markers = pipeline?.markers || [];
    let raw = [];
    if (markers.length > 0) {
      raw = markers.map((m) => ({
        label: m.label || "Section",
        timeSec: Number(m.start || 0),
        color: SECTION_COLORS[(m.label || "").toLowerCase()] || "#6366F1",
      }));
    } else if (eff > 0) {
      raw = [
        { label: "Intro", timeSec: 0, color: SECTION_COLORS.intro },
        { label: "Verse", timeSec: eff * 0.08, color: SECTION_COLORS.verse },
        { label: "Chorus", timeSec: eff * 0.29, color: SECTION_COLORS.chorus },
        { label: "Verse 2", timeSec: eff * 0.48, color: SECTION_COLORS.verse },
        { label: "Bridge", timeSec: eff * 0.65, color: SECTION_COLORS.bridge },
        { label: "Outro", timeSec: eff * 0.82, color: SECTION_COLORS.outro },
      ];
    }
    return raw.map((sec, i) => ({
      ...sec,
      endTimeSec: raw[i + 1] ? raw[i + 1].timeSec : eff,
    }));
  }, [pipeline?.markers, pipeline?.durationSec, duration]);

  useEffect(() => {
    sectionJumpListRef.current = sectionJumpList;
  }, [sectionJumpList]);
  useEffect(() => {
    pipelineRef.current = pipeline;
  }, [pipeline]);
  useEffect(() => {
    voiceGuideEnabledRef.current = voiceGuideEnabled;
  }, [voiceGuideEnabled]);

  const scheduleWaitSec = useCallback(async () => {
    const mode = pipeline?.performancePolicy?.launchQuantization || "BAR";
    if (!isPlaying || mode === "IMMEDIATE") return 0;
    const bpm = Math.max(30, Number(pipeline?.bpm || 120));
    const beat = 60 / bpm;
    const step = mode === "BAR" ? beat * 4 : beat;
    const now = await audioEngine.getPosition();
    const remainder = step - (now % step);
    if (remainder < 0.05 || remainder >= step - 0.05) return 0;
    return remainder;
  }, [isPlaying, pipeline]);

  async function executeJump(targetSec, label) {
    clearJumpTimer();
    const currentSec = await audioEngine.getPosition();
    const safety = evaluateJumpSafety(pipeline, currentSec, targetSec);
    if (!safety.ok) {
      setJumpStatus(`Blocked: ${safety.reason}`);
      return;
    }
    const compensatedTarget = applyLatencyCompensationSeconds(
      safety.correctedTargetSec,
      latencyCalibration,
    );
    const safeTarget = Math.max(0, Number(compensatedTarget || 0));
    const waitSec = await scheduleWaitSec();
    if (waitSec <= 0) {
      audioEngine.seek(safeTarget);
      setPosition(safeTarget);
      setJumpStatus(`Jumped to ${label} at ${formatTime(safeTarget)}.`);
      appendDemoLog(`Jump immediate: ${label} -> ${formatTime(safeTarget)}`);
      broadcastPlayback(isPlaying, safeTarget);
      const target = jumpTargets.find(
        (jt) => jt.label === label || jt.quantizedTargetSec === targetSec,
      );
      const nextState = registerJumpIntent(
        predictiveState,
        target?.markerId || label,
      );
      setPredictiveState(nextState);
      setSuggestedJumps(
        suggestNextMarkers(nextState, target?.markerId || label, 3),
      );
      return;
    }
    setJumpStatus(`Queued ${label} in ${waitSec.toFixed(2)}s.`);
    appendDemoLog(`Jump queued: ${label} in ${waitSec.toFixed(2)}s`);
    jumpTimerRef.current = setTimeout(() => {
      audioEngine.seek(safeTarget);
      setPosition(safeTarget);
      setJumpStatus(`Jumped to ${label} at ${formatTime(safeTarget)}.`);
      appendDemoLog(`Jump executed: ${label} -> ${formatTime(safeTarget)}`);
      broadcastPlayback(isPlaying, safeTarget);
      const target = jumpTargets.find(
        (jt) => jt.label === label || jt.quantizedTargetSec === targetSec,
      );
      const nextState = registerJumpIntent(
        predictiveState,
        target?.markerId || label,
      );
      setPredictiveState(nextState);
      setSuggestedJumps(
        suggestNextMarkers(nextState, target?.markerId || label, 3),
      );
      jumpTimerRef.current = null;
    }, waitSec * 1000);
  }

  async function quantizedJumpTo(targetSec, label, { announce = true } = {}) {
    clearJumpTimer();
    if (announce && voiceGuideEnabledRef.current) {
      Speech.speak(label, { rate: 0.95, pitch: 1.1 });
    }
    const compensatedTarget = applyLatencyCompensationSeconds(
      targetSec,
      latencyCalibration,
    );
    const safeTarget = Math.max(0, Number(compensatedTarget || 0));
    const waitSec = await scheduleWaitSec();
    setQueuedSectionLabel(label);
    if (waitSec <= 0) {
      audioEngine.seek(safeTarget);
      setPosition(safeTarget);
      setActiveSectionLabel(label);
      currentSectionRef.current = label;
      announcedSectionRef.current = label;
      setQueuedSectionLabel(null);
      setJumpStatus(`→ ${label}`);
      broadcastPlayback(isPlaying, safeTarget);
      const jt = jumpTargets.find((t) => t.label === label);
      if (jt) {
        const ns = registerJumpIntent(predictiveState, jt.markerId || label);
        setPredictiveState(ns);
        setSuggestedJumps(suggestNextMarkers(ns, jt.markerId || label, 3));
      }
      return;
    }
    setJumpStatus(`Queued: ${label} in ${waitSec.toFixed(1)}s`);
    jumpTimerRef.current = setTimeout(() => {
      audioEngine.seek(safeTarget);
      setPosition(safeTarget);
      setActiveSectionLabel(label);
      currentSectionRef.current = label;
      announcedSectionRef.current = label;
      setQueuedSectionLabel(null);
      setJumpStatus(`→ ${label}`);
      broadcastPlayback(isPlaying, safeTarget);
      const jt = jumpTargets.find((t) => t.label === label);
      if (jt) {
        const ns = registerJumpIntent(predictiveState, jt.markerId || label);
        setPredictiveState(ns);
        setSuggestedJumps(suggestNextMarkers(ns, jt.markerId || label, 3));
      }
      jumpTimerRef.current = null;
    }, waitSec * 1000);
  }

  function handleSectionTap(sec) {
    const now = Date.now();
    const DOUBLE_TAP_MS = 500;

    // Tap active looping section → exit loop
    if (sectionLoopActiveRef.current && activeSectionLabel === sec.label) {
      setSectionLoopActive(false);
      sectionLoopActiveRef.current = false;
      loopStartRef.current = null;
      loopEndRef.current = null;
      setJumpStatus("Loop off");
      return;
    }

    // Double-tap same section → activate loop
    const last = lastSectionTapRef.current;
    if (last.label === sec.label && now - last.time < DOUBLE_TAP_MS) {
      clearJumpTimer();
      setSectionLoopActive(true);
      sectionLoopActiveRef.current = true;
      loopStartRef.current = sec.timeSec;
      loopEndRef.current = sec.endTimeSec;
      setActiveSectionLabel(sec.label);
      currentSectionRef.current = sec.label;
      setQueuedSectionLabel(null);
      setJumpStatus(`🔁 Looping: ${sec.label}`);
      lastSectionTapRef.current = { label: null, time: 0 };
      return;
    }

    // Single tap → record tap, exit any active loop, quantized jump
    lastSectionTapRef.current = { label: sec.label, time: now };
    if (sectionLoopActiveRef.current) {
      setSectionLoopActive(false);
      sectionLoopActiveRef.current = false;
      loopStartRef.current = null;
      loopEndRef.current = null;
    }
    quantizedJumpTo(sec.timeSec, sec.label, { announce: true });
  }

  async function adjustLatencyOffset(deltaMs) {
    const current = latencyCalibration || {};
    const next = await saveLatencyCalibration({
      ...current,
      manualOffsetMs: Math.max(
        -250,
        Math.min(
          250,
          Number(current.manualOffsetMs || 0) + Number(deltaMs || 0),
        ),
      ),
    });
    setLatencyCalibration(next);
    setJumpStatus(`Latency offset: ${next.manualOffsetMs}ms`);
    appendDemoLog(`Latency offset set to ${next.manualOffsetMs}ms`);
  }

  async function rollbackToPreviousArm() {
    if (!history[1]?.armedAt) {
      setJumpStatus("Rollback unavailable.");
      return;
    }
    const restored = await rollbackArmedPipeline(history[1].armedAt);
    if (!restored) {
      setJumpStatus("Rollback failed.");
      return;
    }
    setPipeline(restored);
    setTrackLanes(
      buildTrackLanes(restored?.restrictions?.visibleTrackIds || []),
    );
    const historyRows = await getArmedPipelineHistory();
    setHistory(historyRows);
    setJumpStatus(`Rollback done: ${restored.armedAt}`);
    appendDemoLog(`Rollback to arm snapshot ${restored.armedAt}`);
  }

  // Real-time MD Sync Setup
  useEffect(() => {
    if (syncRole === "OFF") {
      disconnectSync();
      setSyncStatus("disconnected");
      return;
    }
    
    // Connect to Sync Server
    connectSync(SYNC_URL, { role: syncRole, roomId: "main-stage", deviceId: `ipad-${Date.now()}` });
    
    const unsubscribe = subscribeSync((evt) => {
      if (evt.type === "SYNC_STATUS") {
        setSyncStatus(evt.status);
      } else if (evt.type === "SYNC_MESSAGE" && syncRole === "FOLLOWER") {
        const msg = evt.message;
        if (msg.type === "MD_PLAYBACK") {
          if (msg.isPlaying && !isPlaying) {
            audioEngine.play();
            setIsPlaying(true);
            startPolling();
          } else if (!msg.isPlaying && isPlaying) {
            audioEngine.pause();
            setIsPlaying(false);
            stopPolling();
          }
          if (msg.position !== undefined) {
            const drift = Math.abs(msg.position - position);
            // Only force seek if follower drifts more than 0.5s from MD
            if (drift > 0.5) {
              audioEngine.seek(msg.position);
              setPosition(msg.position);
            }
          }
        }
      }
    });
    
    return () => {
      unsubscribe();
      disconnectSync();
    };
  }, [syncRole, isPlaying, position]); // intentionally omit startPolling/stopPolling to avoid loops

  const broadcastPlayback = useCallback((playingState, pos) => {
    if (syncRole === "HOST") {
      send({
        type: "MD_PLAYBACK",
        isPlaying: playingState,
        position: pos !== undefined ? pos : position,
        timestamp: Date.now()
      });
    }
  }, [syncRole, position]);

  async function handlePlayPause() {
    if (isPlaying) {
      await audioEngine.pause();
      setIsPlaying(false);
      stopPolling();
      appendDemoLog("Playback paused");
      broadcastPlayback(false);
      return;
    }
    audioEngine.play();
    setIsPlaying(true);
    startPolling();
    appendDemoLog("Playback started");
    broadcastPlayback(true);
  }

  async function handleStop() {
    clearJumpTimer();
    await audioEngine.stop();
    setIsPlaying(false);
    stopPolling();
    setPosition(0);
    endedLatchRef.current = false;
    setJumpStatus("Stopped.");
    appendDemoLog("Playback stopped");
    broadcastPlayback(false, 0);
  }

  function handleSeek(seconds) {
    audioEngine.seek(seconds);
    setPosition(seconds);
    announcedSectionRef.current = "";
    broadcastPlayback(isPlaying, seconds);
  }

  async function handleNextSong(autoplay = false) {
    const currentSetlist = setlistStateRef.current || setlistState;
    const nextSong = getNextSong(currentSetlist);
    if (!nextSong) {
      setJumpStatus("No next song in queue.");
      return;
    }
    const advanced = markSongLoaded(
      advanceToNextSong(currentSetlist),
      nextSong.id,
    );
    setSetlistState(advanced);
    setlistStateRef.current = advanced;
    try {
      if (nextSong.stemsResult && audioEngine.hasPreloadedSong()) {
        const mode = pipeline?.performancePolicy?.transitionMode || "CUT";
        await audioEngine.activatePreloaded(mode, 1300);
        appendDemoLog(
          `Transition (${mode}) using preloaded audio -> ${nextSong.title}`,
        );
      } else if (nextSong.stemsResult) {
        await audioEngine.loadFromBackend(
          nextSong.stemsResult,
          nextSong.apiBase || "",
        );
        appendDemoLog(`Loaded next song on demand -> ${nextSong.title}`);
      }
    } catch (error) {
      setJumpStatus(`Transition failed: ${String(error?.message || error)}`);
      appendDemoLog(
        `Transition failed -> ${nextSong.title}: ${String(error?.message || error)}`,
      );
    }
    if (nextSong.pipeline || nextSong.stemsResult) {
      const nextPipeline = nextSong.pipeline || {
        ...pipeline,
        songTitle: nextSong.title,
        bpm: nextSong.bpm,
      };
      setPipeline(nextPipeline);
      setTrackLanes(
        buildTrackLanes(nextPipeline?.restrictions?.visibleTrackIds || []),
      );
    }
    setPosition(0);
    setJumpStatus(
      `${autoplay ? "Auto" : "Manual"} switched to: ${nextSong.title}`,
    );
    appendDemoLog(
      `${autoplay ? "Auto" : "Manual"} switch complete -> ${nextSong.title}`,
    );
    if (autoplay || shouldAutoPlayNext(advanced)) {
      audioEngine.play();
      setIsPlaying(true);
      startPolling();
      appendDemoLog(`Playback started for ${nextSong.title}`);
    }
  }

  function stopAutoDemo() {
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    setAutoDemoRunning(false);
    setJumpStatus("Auto demo stopped.");
    appendDemoLog("Auto demo stopped by user");
  }

  function buildDemoQueue() {
    const source =
      setlistState?.queue?.[setlistState?.activeIndex || 0] ||
      setlistState?.queue?.[0] ||
      null;
    const seedPipeline = source?.pipeline || pipeline;
    const seedResult = source?.stemsResult || null;
    const seedBase = source?.apiBase || "";
    return [1, 2, 3, 4].map((n) => ({
      id: `demo_${n}`,
      title: `Demo Song ${n}`,
      bpm: Number(seedPipeline?.bpm || 120),
      pipeline: {
        ...seedPipeline,
        songTitle: `Demo Song ${n}`,
      },
      stemsResult: seedResult,
      apiBase: seedBase,
      preloadStatus: n === 1 ? "loaded" : "idle",
    }));
  }

  function startAutoDemo() {
    if (autoDemoRunning) return;
    const demoQueue = buildDemoQueue();
    const nextSetlist = {
      ...(setlistStateRef.current || {}),
      queue: demoQueue,
      activeIndex: 0,
      preloadNext: true,
      autoPlayNext: true,
    };
    setSetlistState(nextSetlist);
    setlistStateRef.current = nextSetlist;
    setPipeline(demoQueue[0].pipeline || pipeline);
    setAutoDemoRunning(true);
    setJumpStatus("Auto demo started (4-song queue).");
    appendDemoLog("Auto demo started with 4-song queue");

    const modes = ["CUT", "CROSSFADE", "OVERLAP"];
    let step = 0;
    const runStep = async () => {
      if (step >= 3) {
        setAutoDemoRunning(false);
        setJumpStatus("Auto demo complete.");
        demoTimerRef.current = null;
        return;
      }
      const nextMode = modes[step % modes.length];
      appendDemoLog(`Demo transition mode set -> ${nextMode}`);
      setPipeline((prev) => ({
        ...prev,
        performancePolicy: {
          ...(prev?.performancePolicy || {}),
          transitionMode: nextMode,
        },
      }));
      await handleNextSong(false);
      step += 1;
      demoTimerRef.current = setTimeout(runStep, 7000);
    };
    demoTimerRef.current = setTimeout(runStep, 2000);
  }

  async function handleLoadRealSongs() {
    const setlist = await loadSetlist();
    const realState = await loadRealSongsFromStemCenter(pipeline, setlist);
    setSetlistState(realState);
    setlistStateRef.current = realState;
    if (realState?.queue?.[0]?.pipeline) {
      setPipeline(realState.queue[0].pipeline);
      setTrackLanes(
        buildTrackLanes(
          realState.queue[0].pipeline?.restrictions?.visibleTrackIds || [],
        ),
      );
    }
    setJumpStatus(
      `Loaded ${realState?.queue?.length || 0} real songs from Stem Center.`,
    );
  }

  function toggleLane(field, trackId) {
    setTrackLanes((prev) =>
      prev.map((lane) =>
        lane.id === trackId ? { ...lane, [field]: !lane[field] } : lane,
      ),
    );
    appendDemoLog(`Lane ${trackId}: toggled ${field}`);
  }

  function addManualTrackLane() {
    const nextId = `custom_track_${trackLanes.length + 1}`;
    setTrackLanes((prev) => [
      ...prev,
      {
        id: nextId,
        label: `Custom ${prev.length + 1}`,
        mute: false,
        solo: false,
        recordArmed: false,
        active: false,
        recordedUri: null,
      },
    ]);
    appendDemoLog(`Added manual track lane ${nextId}`);
  }

  async function toggleRecordTrack(trackId) {
    try {
      if (recordingSession?.trackId === trackId) {
        const clip = await stopTrackRecording(recordingSession);
        setRecordingSession(null);
        if (clip?.uri) {
          setRecordedClips((prev) => [clip, ...prev]);
          setTrackLanes((prev) =>
            prev.map((lane) =>
              lane.id === trackId ? { ...lane, recordedUri: clip.uri } : lane,
            ),
          );
          setJumpStatus(`Recorded clip saved for ${trackId}.`);
          appendDemoLog(`Recording saved for ${trackId}: ${clip.uri}`);
        }
        return;
      }
      if (recordingSession) {
        setJumpStatus(
          `Stop current recording on ${recordingSession.trackId} first.`,
        );
        return;
      }
      const session = await startTrackRecording(trackId, selectedInputUid);
      setRecordingSession(session);
      setJumpStatus(`Recording started on ${trackId}.`);
      appendDemoLog(
        `Recording started on ${trackId}${selectedInputUid ? ` via ${selectedInputUid}` : ""}`,
      );
    } catch (error) {
      setJumpStatus(`Record error: ${String(error?.message || error)}`);
      appendDemoLog(
        `Recording error on ${trackId}: ${String(error?.message || error)}`,
      );
    }
  }

  const handleNextKit = async () => {
    const next = await cycleNextPadKit(activePadKit?.id);
    setActivePadKit(next);
  };

  const handleImportKit = async () => {
    try {
      setImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/json"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const kit = await importPadKitFromJsonText(raw);
      setActivePadKit(kit);
      setKitsCount((c) => c + 1);
    } catch (error) {
      setPolicyError(`Kit import failed: ${String(error?.message || error)}`);
    } finally {
      setImporting(false);
    }
  };

  if (!pipeline) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>Live Performance</Text>
        <Text style={styles.sub}>No pipeline armed yet.</Text>
        <Text style={styles.subtle}>
          Go to Rehearsal → ARM → LIVE PERFORMANCE to load a session.
        </Text>
      </View>
    );
  }

  const currentSong = setlistState?.queue?.[setlistState?.activeIndex || 0];
  const nextSongItem = setlistState ? getNextSong(setlistState) : null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* ── SONG HEADER ─────────────────────────────────────────────────────── */}
      <View style={styles.songHeader}>
        <View style={styles.songHeaderLeft}>
          <Text style={styles.title} numberOfLines={1}>
            {pipeline.songTitle || "Live Performance"}
          </Text>
          {pipeline.artist ? (
            <Text style={styles.sub}>{pipeline.artist}</Text>
          ) : null}
          <View style={styles.badgeRow}>
            {pipeline.bpm ? (
              <View style={styles.bpmBadge}>
                <Text style={styles.bpmBadgeText}>♩ {pipeline.bpm} BPM</Text>
              </View>
            ) : null}
            {pipeline.gridMode ? (
              <View style={styles.gridBadge}>
                <Text style={styles.gridBadgeText}>{pipeline.gridMode}</Text>
              </View>
            ) : null}
            {pipeline.loop?.enabled ? (
              <View style={styles.loopBadge}>
                <Text style={styles.loopBadgeText}>🔁 {loopLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.songHeaderRight}>
          <Text style={styles.positionText}>{formatTime(position)}</Text>
          <Text style={styles.durationText}>
            {formatTime(duration || pipeline.durationSec || 0)}
          </Text>
        </View>
      </View>

      {/* ── TRANSPORT ───────────────────────────────────────────────────────── */}
      <View style={styles.transportRow}>
        <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
          <Text style={styles.stopBtnText}>■</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.playBtn} onPress={handlePlayPause}>
          <Text style={styles.playBtnText}>{isPlaying ? "⏸" : "▶"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextBtn, !nextSongItem && { opacity: 0.3 }]}
          onPress={() => handleNextSong(false)}
          disabled={!nextSongItem}
        >
          <Text style={styles.nextBtnText}>Next ▶▶</Text>
        </TouchableOpacity>
      </View>

      {/* ── WAVEFORM PIPELINE ───────────────────────────────────────────────── */}
      <View style={styles.card}>
        {/* Header: title + voice guide toggle + live status */}
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Live Pipeline</Text>
          <View style={styles.pipelineHeaderRight}>
            {/* Sync Toggle */}
            <TouchableOpacity
              style={[
                styles.vgToggle, 
                syncRole !== "OFF" && { borderColor: "#4F46E5", backgroundColor: "#1E1B4B" }
              ]}
              onPress={() => {
                const nextRole = syncRole === "OFF" ? "FOLLOWER" : syncRole === "FOLLOWER" ? "HOST" : "OFF";
                setSyncRole(nextRole);
              }}
            >
              <Text style={[
                  styles.vgToggleText, 
                  syncRole !== "OFF" && { color: "#A5B4FC" }
                ]}
              >
                {syncRole === "OFF" ? "SYNC OFF" : syncRole === "HOST" ? "MD HOST" : "FOLLOWER"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.vgToggle, voiceGuideEnabled && styles.vgToggleOn]}
              onPress={() => {
                const next = !voiceGuideEnabled;
                setVoiceGuideEnabled(next);
                voiceGuideEnabledRef.current = next;
              }}
            >
              <Text
                style={[
                  styles.vgToggleText,
                  voiceGuideEnabled && styles.vgToggleTextOn,
                ]}
              >
                🔊 VG
              </Text>
            </TouchableOpacity>
            <Text style={[styles.cardMeta, isPlaying && styles.cardMetaLive]}>
              {isPlaying ? "▶ LIVE" : "⏸ PAUSED"}
            </Text>
          </View>
        </View>

        {/* Tempo / time-sig / quantization info bar */}
        <View style={styles.tempoBar}>
          {pipeline.bpm ? (
            <View style={styles.tempoBadge}>
              <Text style={styles.tempoLabel}>BPM</Text>
              <Text style={styles.tempoValue}>{pipeline.bpm}</Text>
            </View>
          ) : null}
          <View style={styles.tempoBadge}>
            <Text style={styles.tempoLabel}>TIME SIG</Text>
            <Text style={styles.tempoValue}>
              {pipeline.timeSignature || "4 / 4"}
            </Text>
          </View>
          <View style={[styles.tempoBadge, styles.tempoBadgeQuant]}>
            <Text style={styles.tempoLabel}>QUANT</Text>
            <Text style={[styles.tempoValue, styles.tempoValueQuant]}>
              {pipeline?.performancePolicy?.launchQuantization || "BAR"}
            </Text>
          </View>
          {activeSectionLabel ? (
            <View
              style={[
                styles.tempoBadge,
                styles.tempoBadgeSection,
                sectionLoopActive && styles.tempoBadgeSectionLoop,
              ]}
            >
              <Text style={[styles.tempoValue, styles.tempoValueSection]}>
                {sectionLoopActive
                  ? `🔁 ${activeSectionLabel}`
                  : `▶ ${activeSectionLabel}`}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Waveform timeline with section marker pins */}
        <WaveformTimeline
          sections={[]}
          markers={pipeline.markers || []}
          automationEvents={pipeline.automationLanes?.events || []}
          lengthSeconds={duration || pipeline.durationSec || 0}
          playheadPct={
            (duration || pipeline.durationSec || 0) > 0
              ? position / (duration || pipeline.durationSec || 1)
              : 0
          }
          waveformPeaks={pipeline.waveformPeaks || null}
          onSeek={(s) => {
            handleSeek(s);
            announcedSectionRef.current = "";
          }}
          bpm={pipeline.bpm || 0}
          songTitle={pipeline.songTitle || ""}
          sectionMarkers={sectionJumpList}
          activeSectionLabel={activeSectionLabel}
          sectionLoopActive={sectionLoopActive}
          onSectionTap={handleSectionTap}
        />

        {/* Queued jump banner */}
        {queuedSectionLabel ? (
          <View style={styles.queuedBanner}>
            <Text style={styles.queuedBannerText}>
              ⏳ Waiting for bar boundary → {queuedSectionLabel}
            </Text>
          </View>
        ) : null}

        {/* Jump status line (only when no queued banner) */}
        {!queuedSectionLabel &&
        jumpStatus !== "No jump scheduled." &&
        jumpStatus !== "Stopped." ? (
          <Text style={styles.jumpStatusText}>{jumpStatus}</Text>
        ) : null}

        {/* ── Live Lock Tiers ─────────────────────────────────── */}
        <View style={styles.lockTierPanel}>
          <View style={styles.lockTierRow}>
            <Text style={styles.lockTierLabel}>Safety</Text>
            <View style={styles.lockTierPills}>
              {["strict", "guided", "tech"].map((m) => {
                const TIER_COLORS = {
                  strict: "#EF4444",
                  guided: "#6366F1",
                  tech: "#10B981",
                };
                const active = safetyMode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.lockTierPill,
                      active && {
                        borderColor: TIER_COLORS[m],
                        backgroundColor: TIER_COLORS[m] + "18",
                      },
                    ]}
                    onPress={() => setSafetyMode(m)}
                  >
                    <Text
                      style={[
                        styles.lockTierPillText,
                        active && { color: TIER_COLORS[m] },
                      ]}
                    >
                      {m === "strict"
                        ? "🔒 Strict"
                        : m === "guided"
                          ? "🛡 Guided"
                          : "⚡ Tech"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.liveLockBtn, !liveLock && styles.liveLockBtnOff]}
            onPress={() => setLiveLock((v) => !v)}
          >
            <Text
              style={[
                styles.liveLockBtnText,
                !liveLock && styles.liveLockBtnTextOff,
              ]}
            >
              {liveLock ? "🔒 Live Lock ON" : "🔓 Live Lock OFF"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SETLIST STRIP ───────────────────────────────────────────────────── */}
      {(setlistState?.queue?.length || 0) > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.setlistScroll}
          contentContainerStyle={styles.setlistScrollContent}
        >
          {setlistState.queue.map((song, idx) => {
            const isActive = idx === setlistState.activeIndex;
            const isNext = idx === (setlistState.activeIndex || 0) + 1;
            return (
              <View
                key={song.id}
                style={[
                  styles.setlistChip,
                  isActive && styles.setlistChipActive,
                  isNext && styles.setlistChipNext,
                ]}
              >
                <Text
                  style={[
                    styles.setlistChipNum,
                    isActive && styles.setlistChipNumActive,
                  ]}
                >
                  {idx + 1}
                </Text>
                <Text
                  style={[
                    styles.setlistChipTitle,
                    isActive && styles.setlistChipTitleActive,
                  ]}
                  numberOfLines={1}
                >
                  {song.title}
                </Text>
                {isNext && song.preloadStatus === "preloaded" && (
                  <View style={styles.setlistReadyDot} />
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── 12-NOTE PAD ─────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.padHeaderRow}>
          <Text style={styles.cardTitle}>Pad</Text>
          <View style={styles.padActions}>
            <TouchableOpacity style={styles.kitBtn} onPress={handleNextKit}>
              <Text style={styles.kitBtnText}>Next Kit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.kitBtn, styles.importBtn]}
              onPress={handleImportKit}
              disabled={importing}
            >
              <Text style={styles.kitBtnText}>
                {importing ? "Importing..." : "Import Kit"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {activePadKit?.name ? (
          <Text style={styles.kitName}>{activePadKit.name}</Text>
        ) : null}

        <View style={styles.padGrid}>
          {(activePadKit?.pads || []).slice(0, 12).map((pad) => (
            <TouchableOpacity
              key={pad.slot}
              style={styles.pad}
              activeOpacity={0.7}
              disabled={liveLock}
            >
              <Text style={styles.padNote}>{pad.note}</Text>
              <Text style={styles.padLabel} numberOfLines={1}>
                {pad.label}
              </Text>
            </TouchableOpacity>
          ))}
          {/* Empty pad slots if no kit loaded */}
          {(activePadKit?.pads || []).length === 0 &&
            Array.from({ length: 12 }, (_, i) => (
              <View key={`empty_${i}`} style={[styles.pad, styles.padEmpty]}>
                <Text style={styles.padEmptyText}>—</Text>
              </View>
            ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  container: { padding: 16, paddingBottom: 56 },

  // ── Empty state
  emptyWrap: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    color: "#F8FAFC",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 10,
  },
  sub: { color: "#6B7280", fontSize: 13, marginTop: 4 },
  subtle: {
    color: "#374151",
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
    textAlign: "center",
  },

  // ── Song header
  songHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  songHeaderLeft: { flex: 1, marginRight: 12 },
  title: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  songHeaderRight: { alignItems: "flex-end" },
  positionText: {
    color: "#F9FAFB",
    fontSize: 24,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  durationText: {
    color: "#374151",
    fontSize: 13,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },

  badgeRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  bpmBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#92400E22",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  bpmBadgeText: { color: "#FCD34D", fontSize: 12, fontWeight: "800" },
  gridBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#1E293B",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#334155",
  },
  gridBadgeText: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  loopBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#052E1C",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#10B981",
  },
  loopBadgeText: { color: "#34D399", fontSize: 12, fontWeight: "700" },

  // ── Transport
  transportRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
    alignItems: "center",
  },
  stopBtn: {
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#EF4444",
    backgroundColor: "#7F1D1D30",
  },
  stopBtnText: { color: "#FCA5A5", fontWeight: "900", fontSize: 28 },
  playBtn: {
    flex: 1,
    paddingVertical: 24,
    borderRadius: 16,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 10,
  },
  playBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 32 },
  nextBtn: {
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#10B981",
    backgroundColor: "#064E3B",
    alignItems: "center",
  },
  nextBtnText: { color: "#A7F3D0", fontWeight: "900", fontSize: 20 },

  // ── Cards
  card: {
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#080E1A",
    padding: 14,
    overflow: "hidden",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardTitle: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cardMeta: { color: "#4B5563", fontSize: 12, fontWeight: "600" },

  // ── Jump status
  jumpStatusText: {
    color: "#6366F1",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },

  // ── Live Lock Tier panel
  lockTierPanel: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#0F172A",
  },
  lockTierRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  lockTierLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    width: 54,
  },
  lockTierPills: { flexDirection: "row", gap: 6 },
  lockTierPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#080E1A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  lockTierPillText: { fontSize: 11, fontWeight: "700", color: "#374151" },
  liveLockBtn: {
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#1A0A0A",
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  liveLockBtnOff: { backgroundColor: "#0A1A0A", borderColor: "#374151" },
  liveLockBtnText: { fontSize: 12, fontWeight: "800", color: "#F87171" },
  liveLockBtnTextOff: { color: "#6B7280" },

  // ── Pipeline header enhancements
  pipelineHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardMetaLive: { color: "#EF4444" },
  vgToggle: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#080E1A",
  },
  vgToggleOn: { borderColor: "#10B981", backgroundColor: "#052E1C" },
  vgToggleText: { color: "#374151", fontSize: 10, fontWeight: "800" },
  vgToggleTextOn: { color: "#34D399" },

  // ── Tempo / time sig bar
  tempoBar: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 8 },
  tempoBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    alignItems: "center",
    minWidth: 52,
  },
  tempoBadgeQuant: { borderColor: "#4338CA", backgroundColor: "#1E1B4B22" },
  tempoBadgeSection: { borderColor: "#6366F1", backgroundColor: "#1E1B4B" },
  tempoBadgeSectionLoop: { borderColor: "#F59E0B", backgroundColor: "#1A0F00" },
  tempoLabel: {
    color: "#374151",
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tempoValue: { color: "#94A3B8", fontSize: 13, fontWeight: "900" },
  tempoValueQuant: { color: "#818CF8" },
  tempoValueSection: { color: "#A5B4FC", fontSize: 12 },

  // ── Queued jump banner
  queuedBanner: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "#1A0F00",
    alignItems: "center",
  },
  queuedBannerText: { color: "#FCD34D", fontSize: 12, fontWeight: "800" },

  // ── Setlist strip
  setlistScroll: { marginBottom: 12 },
  setlistScrollContent: { flexDirection: "row", gap: 8, paddingRight: 8 },
  setlistChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#080E1A",
    minWidth: 110,
    maxWidth: 160,
  },
  setlistChipActive: { borderColor: "#4F46E5", backgroundColor: "#1E1B4B" },
  setlistChipNext: { borderColor: "#1E3A5F", backgroundColor: "#020E1F" },
  setlistChipNum: {
    color: "#374151",
    fontSize: 11,
    fontWeight: "800",
    minWidth: 14,
  },
  setlistChipNumActive: { color: "#A5B4FC" },
  setlistChipTitle: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  setlistChipTitleActive: { color: "#E2E8F0" },
  setlistReadyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },

  // ── Pad
  padHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  padActions: { flexDirection: "row", gap: 8 },
  kitBtn: {
    borderWidth: 1,
    borderColor: "#4338CA",
    backgroundColor: "#1E1B4B",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  importBtn: { borderColor: "#0369A1", backgroundColor: "#082F49" },
  kitBtnText: { color: "#A5B4FC", fontSize: 11, fontWeight: "800" },
  kitName: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginBottom: 10,
  },

  padGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pad: {
    width: "31%",
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#060D1E",
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  padEmpty: { borderColor: "#0F172A", backgroundColor: "#030A14" },
  padNote: { color: "#E2E8F0", fontSize: 20, fontWeight: "900" },
  padLabel: {
    color: "#4B5563",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  padEmptyText: { color: "#1E293B", fontSize: 20, fontWeight: "900" },
});
