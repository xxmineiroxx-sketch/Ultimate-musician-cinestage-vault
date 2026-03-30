/**
 * StudioScreen — X32-inspired professional multi-track workspace.
 * Desktop (Electron/web) only. iOS/Android shows redirect message.
 *
 * Layout:
 *   TransportBar (top)
 *   ├─ TracksArea (left, flex:1)
 *   │  ├─ Toolbar (add/record)
 *   │  ├─ TrackLane[] (scrollable)
 *   │  └─ FxPanel (selected track, 6 tabs: EQ|GATE|COMP|DELAY|REVERB|SCENE)
 *   └─ RightPanel (240px)
 *      ├─ Mixer channels
 *      └─ Hardware Mixer Bridge card
 */
import Slider from "@react-native-community/slider";
import React, { useEffect, useReducer, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  StyleSheet,
  Platform,
} from "react-native";

import * as SA from "../services/studioAudio";
import { CINESTAGE_URL } from "./config";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _idCtr = 0;
function newId() {
  return `trk_${++_idCtr}_${Date.now()}`;
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, "0")}.${ms}`;
}

function openFilePicker(cb) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "audio/*";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    document.body.removeChild(input);
    if (file) cb(file);
  });
  input.addEventListener("cancel", () => {
    document.body.removeChild(input);
  });
  input.click();
}

// ─── State ────────────────────────────────────────────────────────────────────

const INIT = {
  tracks: [],
  isPlaying: false,
  isRecording: false,
  recordingTrackId: null,
  position: 0,
  selectedId: null,
  bpm: 120,
  fxTab: "EQ",
  scenes: [],
  sceneName: "",
  hwIp: "192.168.1.100",
  hwPort: "10023",
  hwStatus: "",
};

function reducer(state, action) {
  switch (action.type) {
    case "ENGINE":
      return {
        ...state,
        tracks: action.tracks,
        isPlaying: action.isPlaying,
        isRecording: action.isRecording,
        recordingTrackId: action.recordingTrackId,
      };
    case "POSITION":
      return { ...state, position: action.position };
    case "SELECT":
      return { ...state, selectedId: action.id };
    case "FX_TAB":
      return { ...state, fxTab: action.tab };
    case "SCENES":
      return { ...state, scenes: action.scenes };
    case "SCENE_NAME":
      return { ...state, sceneName: action.value };
    case "BPM":
      return { ...state, bpm: action.bpm };
    case "HW_IP":
      return { ...state, hwIp: action.value };
    case "HW_PORT":
      return { ...state, hwPort: action.value };
    case "HW_STATUS":
      return { ...state, hwStatus: action.value };
    default:
      return state;
  }
}

// ─── WaveformCanvas ───────────────────────────────────────────────────────────

function WaveformCanvas({ buffer, progressRatio, color }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx2 = canvas.getContext("2d");
    const W = canvas.width,
      H = canvas.height;
    ctx2.clearRect(0, 0, W, H);
    ctx2.fillStyle = "#020617";
    ctx2.fillRect(0, 0, W, H);

    if (!buffer) {
      ctx2.fillStyle = "#1E293B";
      ctx2.fillRect(0, H / 2 - 1, W, 2);
      return;
    }

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / W);
    const mid = H / 2;

    for (let x = 0; x < W; x++) {
      let min = 1,
        max = -1;
      for (let i = 0; i < step; i++) {
        const v = data[x * step + i] || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const played = progressRatio != null && x / W < progressRatio;
      ctx2.fillStyle = played ? color || "#4F46E5" : "rgba(255,255,255,0.2)";
      ctx2.fillRect(
        x,
        mid + min * mid * 0.9,
        1,
        Math.max(1, (max - min) * mid * 0.9),
      );
    }

    if (progressRatio != null) {
      const px = progressRatio * W;
      ctx2.fillStyle = "#22C55E";
      ctx2.fillRect(px - 1, 0, 2, H);
    }
  }, [buffer, progressRatio, color]);

  return React.createElement("canvas", {
    ref,
    width: 500,
    height: 52,
    style: { width: "100%", height: 52, display: "block", borderRadius: 4 },
  });
}

// ─── LevelMeter ───────────────────────────────────────────────────────────────

function LevelMeter({ analyser }) {
  const ref = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!analyser) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx2 = canvas.getContext("2d");
    const W = canvas.width,
      H = canvas.height;
    const buf = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length / 255;
      ctx2.clearRect(0, 0, W, H);
      ctx2.fillStyle = "#0B1220";
      ctx2.fillRect(0, 0, W, H);
      const barH = avg * H;
      const grad = ctx2.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0, "#22C55E");
      grad.addColorStop(0.65, "#EAB308");
      grad.addColorStop(1, "#EF4444");
      ctx2.fillStyle = grad;
      ctx2.fillRect(0, H - barH, W, barH);
    }
    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser]);

  return React.createElement("canvas", {
    ref,
    width: 10,
    height: 80,
    style: { width: 10, height: 80, display: "block" },
  });
}

// ─── GR Meter (gain reduction) ────────────────────────────────────────────────

function GRMeter({ compNode }) {
  const ref = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!compNode) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx2 = canvas.getContext("2d");
    const W = canvas.width,
      H = canvas.height;

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      const gr = Math.min(1, Math.abs(compNode.reduction || 0) / 24);
      ctx2.clearRect(0, 0, W, H);
      ctx2.fillStyle = "#0B1220";
      ctx2.fillRect(0, 0, W, H);
      ctx2.fillStyle = "#F59E0B";
      ctx2.fillRect(0, 0, gr * W, H);
    }
    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [compNode]);

  return React.createElement("canvas", {
    ref,
    width: 140,
    height: 8,
    style: {
      width: 140,
      height: 8,
      display: "block",
      borderRadius: 2,
      marginTop: 4,
    },
  });
}

// ─── TransportBar ─────────────────────────────────────────────────────────────

function TransportBar({ state, dispatch }) {
  const dur = SA.getDuration();
  return (
    <View style={ts.bar}>
      <TouchableOpacity
        style={ts.btn}
        onPress={() => {
          SA.stop();
          SA.seek(0);
        }}
      >
        <Text style={ts.btnTxt}>⏮</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[ts.btn, state.isPlaying && ts.btnActive]}
        onPress={() => (state.isPlaying ? SA.pause() : SA.play())}
      >
        <Text style={ts.btnTxt}>{state.isPlaying ? "⏸" : "▶"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={ts.btn} onPress={SA.stop}>
        <Text style={ts.btnTxt}>⏹</Text>
      </TouchableOpacity>

      <View style={ts.posBlock}>
        <Text style={ts.posText}>{fmtTime(state.position)}</Text>
        {state.isRecording && <View style={ts.recDot} />}
      </View>

      {dur > 0 && (
        <View style={ts.scrubWrap}>
          <Slider
            style={{ flex: 1, height: 20 }}
            minimumValue={0}
            maximumValue={1}
            value={dur > 0 ? state.position / dur : 0}
            minimumTrackTintColor="#4F46E5"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#E5E7EB"
            onSlidingComplete={(v) => SA.seek(v * dur)}
          />
        </View>
      )}

      <View style={ts.bpmWrap}>
        <Text style={ts.bpmLabel}>BPM</Text>
        <TextInput
          style={ts.bpmInput}
          value={String(state.bpm)}
          onChangeText={(v) =>
            dispatch({ type: "BPM", bpm: parseInt(v) || 120 })
          }
          keyboardType="number-pad"
          selectTextOnFocus
        />
      </View>
    </View>
  );
}

const ts = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#080E1A",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
  },
  btnActive: { backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  btnTxt: { color: "#E5E7EB", fontSize: 16 },
  posBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 80,
  },
  posText: {
    color: "#E5E7EB",
    fontFamily: "monospace",
    fontSize: 15,
    fontWeight: "600",
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },
  scrubWrap: { flex: 1, marginHorizontal: 4 },
  bpmWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  bpmLabel: { color: "#6B7280", fontSize: 11 },
  bpmInput: {
    color: "#E5E7EB",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 52,
    textAlign: "center",
    fontSize: 14,
  },
});

// ─── TrackLane ────────────────────────────────────────────────────────────────

function TrackLane({
  track,
  selected,
  onSelect,
  position,
  duration,
  isRecording,
}) {
  const prog = duration > 0 ? position / duration : null;
  return (
    <TouchableOpacity
      style={[ll.lane, selected && ll.laneSelected]}
      onPress={() => onSelect(track.id)}
      activeOpacity={0.85}
    >
      <View style={ll.topRow}>
        <View style={[ll.dot, { backgroundColor: track.color }]} />
        <TextInput
          style={ll.nameInput}
          value={track.name}
          onChangeText={(v) => SA.setTrackName(track.id, v)}
          selectTextOnFocus
        />
        {isRecording && <View style={ll.recIndicator} />}
        <TouchableOpacity
          style={[ll.muteBtn, track.muted && ll.muteBtnActive]}
          onPress={() => SA.setTrackMute(track.id, !track.muted)}
        >
          <Text style={ll.muteTxt}>M</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ll.soloBtn, track.soloed && ll.soloBtnActive]}
          onPress={() => SA.setTrackSolo(track.id, !track.soloed)}
        >
          <Text style={ll.soloTxt}>S</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={ll.removeBtn}
          onPress={() => SA.removeTrack(track.id)}
        >
          <Text style={ll.removeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={ll.sliderRow}>
        <Text style={ll.sliderLabel}>Vol</Text>
        <Slider
          style={ll.slider}
          minimumValue={0}
          maximumValue={1.5}
          value={track.volume}
          minimumTrackTintColor={track.color}
          maximumTrackTintColor="#1E293B"
          thumbTintColor="#E5E7EB"
          onValueChange={(v) => SA.setTrackVolume(track.id, v)}
        />
        <Text style={ll.sliderLabel}>Pan</Text>
        <Slider
          style={ll.sliderShort}
          minimumValue={-1}
          maximumValue={1}
          value={track.pan}
          minimumTrackTintColor="#0E7490"
          maximumTrackTintColor="#1E293B"
          thumbTintColor="#E5E7EB"
          onValueChange={(v) => SA.setTrackPan(track.id, v)}
        />
      </View>

      <WaveformCanvas
        buffer={track.buffer}
        progressRatio={prog}
        color={track.color}
      />
    </TouchableOpacity>
  );
}

const ll = StyleSheet.create({
  lane: {
    backgroundColor: "#0B1220",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  laneSelected: { borderColor: "#4F46E5", borderWidth: 1.5 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  nameInput: {
    flex: 1,
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "600",
    backgroundColor: "transparent",
    padding: 0,
  },
  recIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  muteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  muteBtnActive: { backgroundColor: "#F59E0B", borderColor: "#F59E0B" },
  muteTxt: { color: "#9CA3AF", fontSize: 11, fontWeight: "700" },
  soloBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  soloBtnActive: { backgroundColor: "#22C55E", borderColor: "#22C55E" },
  soloTxt: { color: "#9CA3AF", fontSize: 11, fontWeight: "700" },
  removeBtn: { paddingHorizontal: 6, paddingVertical: 3 },
  removeTxt: { color: "#6B7280", fontSize: 12 },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  slider: { flex: 1, height: 20 },
  sliderShort: { width: 80, height: 20 },
  sliderLabel: { color: "#6B7280", fontSize: 10, minWidth: 20 },
});

// ─── EQ Tab (4-band parametric) ───────────────────────────────────────────────

const EQ_BANDS = [
  {
    key: "hp",
    label: "HPF",
    color: "#6366F1",
    hasGain: false,
    freqMin: 20,
    freqMax: 500,
    hasQ: false,
  },
  {
    key: "lmf",
    label: "LMF",
    color: "#0EA5E9",
    hasGain: true,
    freqMin: 80,
    freqMax: 2000,
    hasQ: true,
  },
  {
    key: "hmf",
    label: "HMF",
    color: "#10B981",
    hasGain: true,
    freqMin: 500,
    freqMax: 12000,
    hasQ: true,
  },
  {
    key: "hf",
    label: "HF",
    color: "#F59E0B",
    hasGain: true,
    freqMin: 2000,
    freqMax: 20000,
    hasQ: false,
  },
];

function EQTab({ track }) {
  if (!track) return <Text style={fx.empty}>Select a track to edit EQ</Text>;
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 10, gap: 10 }}
    >
      {EQ_BANDS.map((band) => {
        const st = track.eq[band.key];
        return (
          <View key={band.key} style={fx.bandRow}>
            <View style={fx.bandHeader}>
              <View style={[fx.bandDot, { backgroundColor: band.color }]} />
              <Text style={fx.bandLabel}>{band.label}</Text>
              {band.key === "hp" && (
                <Switch
                  value={st.enabled || false}
                  onValueChange={(v) =>
                    SA.setEQBand(track.id, "hp", { enabled: v })
                  }
                  trackColor={{ false: "#1E293B", true: band.color }}
                  thumbColor="#E5E7EB"
                  style={{ transform: [{ scale: 0.75 }] }}
                />
              )}
            </View>
            <View style={fx.paramRow}>
              <Text style={fx.paramLabel}>Freq {Math.round(st.freq)}Hz</Text>
              <Slider
                style={fx.paramSlider}
                minimumValue={band.freqMin}
                maximumValue={band.freqMax}
                value={st.freq}
                minimumTrackTintColor={band.color}
                maximumTrackTintColor="#1E293B"
                thumbTintColor={band.color}
                onValueChange={(v) =>
                  SA.setEQBand(track.id, band.key, { freq: v })
                }
              />
            </View>
            {band.hasGain && (
              <View style={fx.paramRow}>
                <Text style={fx.paramLabel}>
                  Gain {(st.gain || 0) >= 0 ? "+" : ""}
                  {(st.gain || 0).toFixed(1)}dB
                </Text>
                <Slider
                  style={fx.paramSlider}
                  minimumValue={-18}
                  maximumValue={18}
                  value={st.gain || 0}
                  minimumTrackTintColor="#1E293B"
                  maximumTrackTintColor="#1E293B"
                  thumbTintColor={band.color}
                  onValueChange={(v) =>
                    SA.setEQBand(track.id, band.key, { gain: v })
                  }
                />
              </View>
            )}
            {band.hasQ && (
              <View style={fx.paramRow}>
                <Text style={fx.paramLabel}>Q {(st.q || 1).toFixed(1)}</Text>
                <Slider
                  style={fx.paramSlider}
                  minimumValue={0.1}
                  maximumValue={10}
                  value={st.q || 1}
                  minimumTrackTintColor="#334155"
                  maximumTrackTintColor="#1E293B"
                  thumbTintColor="#6B7280"
                  onValueChange={(v) =>
                    SA.setEQBand(track.id, band.key, { q: v })
                  }
                />
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Gate Tab ─────────────────────────────────────────────────────────────────

function GateTab({ track }) {
  if (!track) return <Text style={fx.empty}>Select a track to edit Gate</Text>;
  const g = track.gate;
  return (
    <View style={{ padding: 12, gap: 12 }}>
      <View style={fx.row}>
        <Text style={fx.label}>Noise Gate</Text>
        <Switch
          value={g.enabled}
          onValueChange={(v) => SA.setGate(track.id, v)}
          trackColor={{ false: "#1E293B", true: "#22C55E" }}
          thumbColor="#E5E7EB"
        />
        <View
          style={[
            fx.led,
            { backgroundColor: g.enabled ? "#22C55E" : "#374151" },
          ]}
        />
      </View>
      {g.enabled && (
        <>
          <View style={fx.paramRow}>
            <Text style={fx.paramLabel}>
              Threshold {g.threshold.toFixed(0)}dB
            </Text>
            <Slider
              style={fx.paramSlider}
              minimumValue={-80}
              maximumValue={0}
              value={g.threshold}
              minimumTrackTintColor="#22C55E"
              maximumTrackTintColor="#1E293B"
              thumbTintColor="#22C55E"
              onValueChange={(v) => SA.setGate(track.id, g.enabled, v)}
            />
          </View>
          <View style={fx.paramRow}>
            <Text style={fx.paramLabel}>
              Release {(g.release * 1000).toFixed(0)}ms
            </Text>
            <Slider
              style={fx.paramSlider}
              minimumValue={0.01}
              maximumValue={1}
              value={g.release}
              minimumTrackTintColor="#22C55E"
              maximumTrackTintColor="#1E293B"
              thumbTintColor="#22C55E"
              onValueChange={(v) =>
                SA.setGate(track.id, g.enabled, g.threshold, v)
              }
            />
          </View>
        </>
      )}
    </View>
  );
}

// ─── Comp Tab ─────────────────────────────────────────────────────────────────

function CompTab({ track }) {
  if (!track)
    return <Text style={fx.empty}>Select a track to edit Compressor</Text>;
  const c = track.comp;
  const compNode = track.chain && track.chain.comp;
  return (
    <View style={{ padding: 12, gap: 10 }}>
      <View style={fx.row}>
        <Text style={fx.label}>Compressor</Text>
        <Switch
          value={c.enabled}
          onValueChange={(v) => SA.setCompFull(track.id, { enabled: v })}
          trackColor={{ false: "#1E293B", true: "#F59E0B" }}
          thumbColor="#E5E7EB"
        />
      </View>
      {c.enabled && (
        <>
          <View style={fx.paramRow}>
            <Text style={fx.paramLabel}>
              Threshold {c.threshold.toFixed(0)}dB
            </Text>
            <Slider
              style={fx.paramSlider}
              minimumValue={-60}
              maximumValue={0}
              value={c.threshold}
              minimumTrackTintColor="#F59E0B"
              maximumTrackTintColor="#1E293B"
              thumbTintColor="#F59E0B"
              onValueChange={(v) => SA.setCompFull(track.id, { threshold: v })}
            />
          </View>
          <View style={fx.paramRow}>
            <Text style={fx.paramLabel}>Ratio {c.ratio.toFixed(1)}:1</Text>
            <Slider
              style={fx.paramSlider}
              minimumValue={1}
              maximumValue={20}
              value={c.ratio}
              minimumTrackTintColor="#F59E0B"
              maximumTrackTintColor="#1E293B"
              thumbTintColor="#F59E0B"
              onValueChange={(v) => SA.setCompFull(track.id, { ratio: v })}
            />
          </View>
          <View style={fx.paramRow}>
            <Text style={fx.paramLabel}>
              Attack {(c.attack * 1000).toFixed(1)}ms
            </Text>
            <Slider
              style={fx.paramSlider}
              minimumValue={0.0001}
              maximumValue={0.1}
              value={c.attack}
              minimumTrackTintColor="#EAB308"
              maximumTrackTintColor="#1E293B"
              thumbTintColor="#EAB308"
              onValueChange={(v) => SA.setCompFull(track.id, { attack: v })}
            />
          </View>
          <View style={fx.paramRow}>
            <Text style={fx.paramLabel}>
              Release {(c.release * 1000).toFixed(0)}ms
            </Text>
            <Slider
              style={fx.paramSlider}
              minimumValue={0.01}
              maximumValue={0.5}
              value={c.release}
              minimumTrackTintColor="#EAB308"
              maximumTrackTintColor="#1E293B"
              thumbTintColor="#EAB308"
              onValueChange={(v) => SA.setCompFull(track.id, { release: v })}
            />
          </View>
          <View>
            <Text style={fx.paramLabel}>GR (gain reduction)</Text>
            <GRMeter compNode={compNode} />
          </View>
        </>
      )}
    </View>
  );
}

// ─── Delay Tab ────────────────────────────────────────────────────────────────

function DelayTab({ track }) {
  if (!track) return <Text style={fx.empty}>Select a track to edit Delay</Text>;
  const d = track.delay;
  return (
    <View style={{ padding: 12, gap: 10 }}>
      <View style={fx.row}>
        <Text style={fx.label}>Delay</Text>
        <Switch
          value={d.enabled}
          onValueChange={(v) => SA.setDelay(track.id, v)}
          trackColor={{ false: "#1E293B", true: "#0EA5E9" }}
          thumbColor="#E5E7EB"
        />
      </View>
      <View style={fx.paramRow}>
        <Text style={fx.paramLabel}>Time {Math.round(d.time * 1000)}ms</Text>
        <Slider
          style={fx.paramSlider}
          minimumValue={0}
          maximumValue={2}
          value={d.time}
          minimumTrackTintColor="#0EA5E9"
          maximumTrackTintColor="#1E293B"
          thumbTintColor="#0EA5E9"
          onValueChange={(v) => SA.setDelay(track.id, d.enabled, v)}
        />
      </View>
      <View style={fx.paramRow}>
        <Text style={fx.paramLabel}>Wet {Math.round(d.wet * 100)}%</Text>
        <Slider
          style={fx.paramSlider}
          minimumValue={0}
          maximumValue={1}
          value={d.wet}
          minimumTrackTintColor="#0EA5E9"
          maximumTrackTintColor="#1E293B"
          thumbTintColor="#0EA5E9"
          onValueChange={(v) => SA.setDelay(track.id, d.enabled, d.time, v)}
        />
      </View>
    </View>
  );
}

// ─── Reverb Tab ───────────────────────────────────────────────────────────────

function ReverbTab({ track }) {
  if (!track)
    return <Text style={fx.empty}>Select a track to edit Reverb</Text>;
  return (
    <View style={{ padding: 12, gap: 10 }}>
      <Text style={fx.label}>Reverb Send (Room 0.8s)</Text>
      <View style={fx.paramRow}>
        <Text style={fx.paramLabel}>
          Send {Math.round(track.reverbSend * 100)}%
        </Text>
        <Slider
          style={fx.paramSlider}
          minimumValue={0}
          maximumValue={1}
          value={track.reverbSend}
          minimumTrackTintColor="#7C3AED"
          maximumTrackTintColor="#1E293B"
          thumbTintColor="#7C3AED"
          onValueChange={(v) => SA.setReverbSend(track.id, v)}
        />
      </View>
      <Text style={fx.hint}>
        Synthetic room reverb bus. All tracks share one convolver return.
      </Text>
    </View>
  );
}

// ─── Scene Tab ────────────────────────────────────────────────────────────────

function SceneTab({ state, dispatch }) {
  const handleSave = () => {
    const name = state.sceneName.trim() || `Scene ${state.scenes.length + 1}`;
    SA.saveScene(name);
    dispatch({ type: "SCENES", scenes: SA.getScenes() });
    dispatch({ type: "SCENE_NAME", value: "" });
  };
  return (
    <View style={{ flex: 1, padding: 12, gap: 10 }}>
      <View style={fx.row}>
        <TextInput
          style={fx.sceneInput}
          value={state.sceneName}
          onChangeText={(v) => dispatch({ type: "SCENE_NAME", value: v })}
          placeholder="Scene name…"
          placeholderTextColor="#4B5563"
        />
        <TouchableOpacity style={fx.saveBtn} onPress={handleSave}>
          <Text style={fx.saveBtnTxt}>💾 Save</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }}>
        {state.scenes.length === 0 && (
          <Text style={fx.hint}>No scenes saved yet.</Text>
        )}
        {state.scenes.map((sc) => (
          <View key={sc.id} style={fx.sceneRow}>
            <View style={{ flex: 1 }}>
              <Text style={fx.sceneNameTxt}>{sc.name}</Text>
              <Text style={fx.sceneTs}>
                {new Date(sc.ts).toLocaleTimeString()}
              </Text>
            </View>
            <TouchableOpacity
              style={fx.loadBtn}
              onPress={() => {
                SA.loadScene(sc.id);
                dispatch({ type: "SCENES", scenes: SA.getScenes() });
              }}
            >
              <Text style={fx.loadBtnTxt}>Load</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fx.delBtn}
              onPress={() => {
                SA.deleteScene(sc.id);
                dispatch({ type: "SCENES", scenes: SA.getScenes() });
              }}
            >
              <Text style={fx.delBtnTxt}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const fx = StyleSheet.create({
  empty: { color: "#4B5563", padding: 16, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { color: "#9CA3AF", fontSize: 12, flex: 1 },
  hint: { color: "#4B5563", fontSize: 11 },
  bandRow: {
    backgroundColor: "#080E1A",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    gap: 6,
  },
  bandHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  bandDot: { width: 8, height: 8, borderRadius: 4 },
  bandLabel: { color: "#E5E7EB", fontSize: 12, fontWeight: "600", flex: 1 },
  paramRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  paramLabel: { color: "#6B7280", fontSize: 10, minWidth: 110 },
  paramSlider: { flex: 1, height: 20 },
  led: { width: 10, height: 10, borderRadius: 5 },
  sceneInput: {
    flex: 1,
    color: "#E5E7EB",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  saveBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  saveBtnTxt: { color: "#FFF", fontSize: 12, fontWeight: "600" },
  sceneRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#080E1A",
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  sceneNameTxt: { color: "#E5E7EB", fontSize: 12 },
  sceneTs: { color: "#4B5563", fontSize: 10 },
  loadBtn: {
    backgroundColor: "#047857",
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginHorizontal: 4,
  },
  loadBtnTxt: { color: "#FFF", fontSize: 11, fontWeight: "600" },
  delBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  delBtnTxt: { color: "#6B7280", fontSize: 12 },
});

// ─── FxPanel (6 tabs) ─────────────────────────────────────────────────────────

const FX_TABS = ["EQ", "GATE", "COMP", "DELAY", "REVERB", "SCENE"];

function FxPanel({ state, dispatch }) {
  const track = state.tracks.find((t) => t.id === state.selectedId) || null;
  return (
    <View style={fp.panel}>
      <View style={fp.tabBar}>
        {FX_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[fp.tab, state.fxTab === tab && fp.tabActive]}
            onPress={() => dispatch({ type: "FX_TAB", tab })}
          >
            <Text style={[fp.tabTxt, state.fxTab === tab && fp.tabTxtActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
        {track && (
          <View style={fp.trackBadge}>
            <View style={[fp.trackDot, { backgroundColor: track.color }]} />
            <Text style={fp.trackBadgeName} numberOfLines={1}>
              {track.name}
            </Text>
          </View>
        )}
      </View>
      <View style={fp.content}>
        {state.fxTab === "EQ" && <EQTab track={track} />}
        {state.fxTab === "GATE" && <GateTab track={track} />}
        {state.fxTab === "COMP" && <CompTab track={track} />}
        {state.fxTab === "DELAY" && <DelayTab track={track} />}
        {state.fxTab === "REVERB" && <ReverbTab track={track} />}
        {state.fxTab === "SCENE" && (
          <SceneTab state={state} dispatch={dispatch} />
        )}
      </View>
    </View>
  );
}

const fp = StyleSheet.create({
  panel: {
    backgroundColor: "#080E1A",
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    height: 220,
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  tab: { paddingHorizontal: 12, paddingVertical: 7 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#4F46E5" },
  tabTxt: { color: "#6B7280", fontSize: 11, fontWeight: "600" },
  tabTxtActive: { color: "#E5E7EB" },
  trackBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
    paddingRight: 8,
  },
  trackDot: { width: 8, height: 8, borderRadius: 4 },
  trackBadgeName: { color: "#9CA3AF", fontSize: 11, maxWidth: 120 },
  content: { flex: 1, overflow: "hidden" },
});

// ─── MixerChannel ─────────────────────────────────────────────────────────────

function MixerChannel({ track, analyser, onSelect, selected }) {
  const isMaster = !track;
  const label = isMaster ? "MSTR" : track.name;
  const color = isMaster ? "#4F46E5" : track.color;
  const vol = isMaster ? 0.9 : track.volume;

  return (
    <TouchableOpacity
      style={[mc.ch, selected && mc.chSelected]}
      onPress={track ? () => onSelect(track.id) : undefined}
      activeOpacity={track ? 0.75 : 1}
    >
      <View style={[mc.colorBar, { backgroundColor: color }]} />
      <Text style={mc.name} numberOfLines={1}>
        {label}
      </Text>
      <LevelMeter analyser={analyser} />
      <Slider
        style={{ height: 80, width: 10, marginTop: 4 }}
        minimumValue={0}
        maximumValue={1.5}
        value={vol}
        minimumTrackTintColor={color}
        maximumTrackTintColor="#1E293B"
        thumbTintColor="#E5E7EB"
        vertical
        onValueChange={(v) =>
          isMaster ? SA.setMasterVolume(v) : SA.setTrackVolume(track.id, v)
        }
      />
      <Text style={mc.volLabel}>{Math.round(vol * 100)}%</Text>
    </TouchableOpacity>
  );
}

const mc = StyleSheet.create({
  ch: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
    marginRight: 4,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chSelected: { borderColor: "#4F46E5" },
  colorBar: { width: 24, height: 3, borderRadius: 99, marginBottom: 4 },
  name: {
    color: "#6B7280",
    fontSize: 9,
    width: 40,
    textAlign: "center",
    marginBottom: 4,
  },
  volLabel: { color: "#4B5563", fontSize: 9, marginTop: 2 },
});

// ─── Hardware Mixer Bridge ─────────────────────────────────────────────────────

async function syncToHardware(tracks, ip, port) {
  const p = parseInt(port) || 10023;
  for (let i = 0; i < Math.min(tracks.length, 32); i++) {
    const ch = String(i + 1).padStart(2, "0");
    const t = tracks[i];
    await fetch("/api/osc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ip,
        port: p,
        path: `/ch/${ch}/mix/fader`,
        args: [t.volume],
      }),
    }).catch(() => {});
    await fetch("/api/osc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ip,
        port: p,
        path: `/ch/${ch}/mix/on`,
        args: [t.muted ? 0 : 1],
      }),
    }).catch(() => {});
  }
}

function HardwareBridgeCard({ state, dispatch }) {
  const handleSync = async () => {
    dispatch({ type: "HW_STATUS", value: "Syncing…" });
    try {
      await syncToHardware(state.tracks, state.hwIp, state.hwPort);
      dispatch({
        type: "HW_STATUS",
        value: `✓ ${state.tracks.length}ch → ${state.hwIp}`,
      });
    } catch {
      dispatch({ type: "HW_STATUS", value: "✗ Sync failed" });
    }
  };

  const handleLaunch = async () => {
    try {
      await fetch("/api/launch-app", { method: "POST" });
      dispatch({ type: "HW_STATUS", value: "Ultimate Mixer launched" });
    } catch {
      dispatch({ type: "HW_STATUS", value: "Launch failed" });
    }
  };

  return (
    <View style={hw.card}>
      <Text style={hw.title}>🔌 Hardware Mixer Bridge</Text>
      <View style={hw.row}>
        <TextInput
          style={hw.input}
          value={state.hwIp}
          onChangeText={(v) => dispatch({ type: "HW_IP", value: v })}
          placeholder="IP"
          placeholderTextColor="#4B5563"
        />
        <TextInput
          style={[hw.input, { width: 56 }]}
          value={state.hwPort}
          onChangeText={(v) => dispatch({ type: "HW_PORT", value: v })}
          placeholder="Port"
          placeholderTextColor="#4B5563"
          keyboardType="number-pad"
        />
      </View>
      <TouchableOpacity style={hw.syncBtn} onPress={handleSync}>
        <Text style={hw.syncTxt}>Sync Channels to Hardware →</Text>
      </TouchableOpacity>
      <TouchableOpacity style={hw.launchBtn} onPress={handleLaunch}>
        <Text style={hw.launchTxt}>Launch Ultimate Mixer</Text>
      </TouchableOpacity>
      {!!state.hwStatus && <Text style={hw.status}>{state.hwStatus}</Text>}
    </View>
  );
}

const hw = StyleSheet.create({
  card: {
    backgroundColor: "#0B1220",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  title: { color: "#9CA3AF", fontSize: 11, fontWeight: "600", marginBottom: 8 },
  row: { flexDirection: "row", gap: 6, marginBottom: 6 },
  input: {
    flex: 1,
    color: "#E5E7EB",
    backgroundColor: "#080E1A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
    fontSize: 12,
  },
  syncBtn: {
    backgroundColor: "#0E7490",
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
    marginBottom: 5,
  },
  syncTxt: { color: "#FFF", fontSize: 11, fontWeight: "600" },
  launchBtn: {
    backgroundColor: "#1E293B",
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  launchTxt: { color: "#9CA3AF", fontSize: 11 },
  status: { color: "#6B7280", fontSize: 10, marginTop: 6, textAlign: "center" },
});

// ─── Main StudioScreen ────────────────────────────────────────────────────────

function StudioScreenNative() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#020617",
      }}
    >
      <Text style={{ fontSize: 40, marginBottom: 16 }}>🖥️</Text>
      <Text style={{ color: "#E5E7EB", fontSize: 18, fontWeight: "600" }}>
        Studio Workspace
      </Text>
      <Text
        style={{
          color: "#6B7280",
          fontSize: 14,
          marginTop: 8,
          textAlign: "center",
          maxWidth: 280,
        }}
      >
        Open Ultimate Musician on macOS to access the multi-track studio.
      </Text>
    </View>
  );
}

function StudioScreenWeb() {
  const [state, dispatch] = useReducer(reducer, INIT);
  const [aiTemplateLoading, setAiTemplateLoading] = React.useState(false);
  const [aiTemplateTracks, setAiTemplateTracks] = React.useState(null);
  const [aiPluginData, setAiPluginData] = React.useState(null);

  async function handleAITemplate() {
    setAiTemplateLoading(true);
    setAiTemplateTracks(null);
    try {
      const [res, pluginsRes] = await Promise.all([
        fetch(`${CINESTAGE_URL}/ai/templates/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ genre: 'worship', style: 'contemporary', tracks: 8, daw: 'generic' }),
        }),
        fetch(`${CINESTAGE_URL}/ai/templates/plugins`).catch(() => null),
      ]);
      if (!res.ok) throw new Error(`Template API ${res.status}`);
      const data = await res.json();
      const tracks = data.tracks || data.template?.tracks || [];
      setAiTemplateTracks(tracks);
      if (pluginsRes?.ok) {
        const pd = await pluginsRes.json();
        setAiPluginData(pd);
      }
      // Auto-create tracks from AI template
      if (Array.isArray(tracks) && tracks.length > 0) {
        tracks.forEach((t, i) => {
          const id = newId();
          SA.createTrack(id);
          dispatch({ type: 'RENAME', id, name: t.name || t.instrument || `Track ${i+1}` });
        });
      }
    } catch (e) {
      console.warn('AI Template:', e.message);
    } finally {
      setAiTemplateLoading(false);
    }
  }

  useEffect(() => {
    const unsub = SA.subscribe((s) => dispatch({ type: "ENGINE", ...s }));
    dispatch({ type: "SCENES", scenes: SA.getScenes() });
    return unsub;
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      dispatch({ type: "POSITION", position: SA.getPosition() });
    }, 80);
    return () => clearInterval(id);
  }, []);

  const handleAddTrack = useCallback(() => {
    openFilePicker(async (file) => {
      const id = newId();
      SA.createTrack(id);
      await SA.loadFileToTrack(id, file);
      dispatch({ type: "SELECT", id });
    });
  }, []);

  const handleRecordNewTrack = useCallback(async () => {
    if (state.isRecording) {
      SA.stopRecording();
    } else {
      const id = newId();
      SA.createTrack(id, "Recording");
      try {
        await SA.startRecording(id);
        dispatch({ type: "SELECT", id });
      } catch {
        SA.removeTrack(id);
      }
    }
  }, [state.isRecording]);

  const analyser = SA.getMasterAnalyser();
  const duration = SA.getDuration();

  return (
    <View style={s.root}>
      <TransportBar state={state} dispatch={dispatch} />

      <View style={s.body}>
        {/* ── Tracks + FX ────────────────────────────────── */}
        <View style={s.left}>
          <View style={s.toolbar}>
            <TouchableOpacity style={s.toolBtn} onPress={handleAddTrack}>
              <Text style={s.toolBtnTxt}>＋ Add Track</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toolBtn, state.isRecording && s.toolBtnRec]}
              onPress={handleRecordNewTrack}
            >
              <Text style={s.toolBtnTxt}>
                {state.isRecording ? "⏹ Stop Rec" : "⏺ Record Track"}
              </Text>
            </TouchableOpacity>
            <Text style={s.trackCount}>
              {state.tracks.length} track{state.tracks.length !== 1 ? "s" : ""}
              {duration > 0 ? `  •  ${fmtTime(duration)}` : ""}
            </Text>
            <TouchableOpacity
              onPress={handleAITemplate}
              disabled={aiTemplateLoading}
              style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#1e1b4b', borderRadius: 6, borderWidth: 1, borderColor: '#6366f1' }}
            >
              <Text style={{ color: '#818cf8', fontSize: 11, fontWeight: '600' }}>
                {aiTemplateLoading ? '⏳' : '🤖 AI Template'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.trackScroll}
            contentContainerStyle={{ padding: 10 }}
          >
            {state.tracks.length === 0 && (
              <View style={s.emptyState}>
                <Text style={s.emptyIcon}>🎚️</Text>
                <Text style={s.emptyTitle}>No tracks yet</Text>
                <Text style={s.emptySub}>
                  Click "＋ Add Track" to import audio, or "⏺ Record Track" to
                  record from mic.
                </Text>
              </View>
            )}
            {aiPluginData?.manufacturers && (
              <View style={{ marginTop: 8, backgroundColor: '#0d1117', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#1e293b', marginBottom: 8 }}>
                <Text style={{ color: '#818cf8', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>🔌 Plugin Recommendations</Text>
                {Object.entries(aiPluginData.manufacturers).slice(0, 4).map(([brand, plugins]) => (
                  <View key={brand} style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 3, gap: 4, alignItems: 'center' }}>
                    <Text style={{ color: '#64748b', fontSize: 10, width: 90 }}>{brand}</Text>
                    {plugins.slice(0, 3).map((p) => (
                      <View key={p} style={{ backgroundColor: '#1e293b', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: '#94a3b8', fontSize: 9 }}>{p}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
            {state.tracks.map((t) => (
              <TrackLane
                key={t.id}
                track={t}
                selected={state.selectedId === t.id}
                onSelect={(id) => dispatch({ type: "SELECT", id })}
                position={state.position}
                duration={duration}
                isRecording={
                  state.isRecording && state.recordingTrackId === t.id
                }
              />
            ))}
          </ScrollView>

          <FxPanel state={state} dispatch={dispatch} />
        </View>

        {/* ── Mixer + Hardware Bridge ─────────────────────── */}
        <View style={s.right}>
          <Text style={s.mixerTitle}>MIXER</Text>
          <ScrollView
            horizontal
            style={s.mixerScroll}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {state.tracks.map((t) => (
              <MixerChannel
                key={t.id}
                track={t}
                analyser={analyser}
                onSelect={(id) => dispatch({ type: "SELECT", id })}
                selected={state.selectedId === t.id}
              />
            ))}
            <MixerChannel
              track={null}
              analyser={analyser}
              onSelect={() => {}}
              selected={false}
            />
          </ScrollView>

          <HardwareBridgeCard state={state} dispatch={dispatch} />
        </View>
      </View>
    </View>
  );
}

export default function StudioScreen() {
  return Platform.OS === "web" ? <StudioScreenWeb /> : <StudioScreenNative />;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  body: { flex: 1, flexDirection: "row" },
  left: { flex: 1, flexDirection: "column" },
  right: {
    width: 240,
    backgroundColor: "#080E1A",
    borderLeftWidth: 1,
    borderLeftColor: "#1E293B",
    padding: 8,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  toolBtn: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toolBtnRec: { backgroundColor: "#7F1D1D", borderColor: "#EF4444" },
  toolBtnTxt: { color: "#E5E7EB", fontSize: 12, fontWeight: "600" },
  trackCount: { color: "#4B5563", fontSize: 11, marginLeft: "auto" },
  trackScroll: { flex: 1 },
  mixerTitle: {
    color: "#4B5563",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 6,
    textAlign: "center",
  },
  mixerScroll: { maxHeight: 180 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: {
    color: "#E5E7EB",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  emptySub: {
    color: "#4B5563",
    fontSize: 13,
    textAlign: "center",
    maxWidth: 300,
  },
});
