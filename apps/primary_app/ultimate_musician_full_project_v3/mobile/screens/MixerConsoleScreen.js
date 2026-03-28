/**
 * MixerConsoleScreen.js
 * Professional horizontal-strip mixer console for iPad.
 * Each channel is a full-width row with a horizontal fader.
 * All 16 channels visible at once — no horizontal scrolling.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CINESTAGE_URL } from "./config";

// ─── Constants ────────────────────────────────────────────────────────────────
const SCENES_KEY = "um/mixer/scenes/v1";
const FADER_THUMB_W = 28;
const FADER_WRAP_H = 34;
const FADER_TRACK_T = 15; // top of 4px track within wrap
const FADER_THUMB_T = 4; // top of 26px thumb within wrap

const CH_COLORS = [
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#06B6D4",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
];

const DEFAULT_NAMES = [
  "Kick",
  "Snare",
  "OH",
  "Bass Gtr",
  "Keys L",
  "Keys R",
  "Guitar",
  "Lead Vox",
  "BGV 1",
  "BGV 2",
  "BGV 3",
  "Vox 4",
  "DI",
  "Click",
  "PB L",
  "Aux",
  "Vox 5",
  "Vox 6",
  "Lead Gtr R",
  "Lead Gtr L",
  "Rhythm Gtr",
  "Keys A",
  "Keys B",
  "Pad",
  "Synth",
  "Strings",
  "Brass",
  "Perc 1",
  "Perc 2",
  "FX",
  "Ambience",
  "Bus 1",
  "Bus 2",
];

const PROTOCOLS = [
  { label: "X32 / M32", port: 10023 },
  { label: "X-Air / MR18", port: 10024 },
  { label: "SQ (A&H)", port: 51325 },
  { label: "Yamaha CL/QL", port: 49000 },
  { label: "DiGiCo SD", port: 8000 },
  { label: "Custom", port: null },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function faderTodB(v) {
  if (v <= 0) return "-∞";
  if (v >= 1) return "+10";
  if (v < 0.25) return String(Math.round(-60 + (v / 0.25) * 30));
  if (v < 0.75) return String(Math.round(-30 + ((v - 0.25) / 0.5) * 30));
  return String(Math.round(((v - 0.75) / 0.25) * 10));
}

function makeId() {
  return "s" + Date.now().toString(36);
}

function makeChannel(idx) {
  return {
    id: `ch${String(idx + 1).padStart(2, "0")}`,
    name: DEFAULT_NAMES[idx] || `Ch ${idx + 1}`,
    color: CH_COLORS[idx % CH_COLORS.length],
    fader: 0.75,
    mute: false,
    solo: false,
    gate: { enabled: false, threshold: -40 },
    comp: { enabled: false, threshold: -24, ratio: 4 },
    eq: {
      hpf: { enabled: false, freq: 80 },
      lmf: { gain: 0, freq: 250, q: 1.0 },
      hmf: { gain: 0, freq: 2500, q: 1.0 },
      hf: { gain: 0, freq: 8000 },
    },
  };
}

const INIT_MASTER = { fader: 0.75, mute: false };
const V_FADER_THUMB_H = 28;
const V_CHANNEL_WIDTH = 72;
const BANK_SPACING = 18;

// ─── Vertical channel layout ───────────────────────────────────────────────
function VChannelStrip({ ch, isSelected, onSelect, onChangeField, onRename }) {
  const chRef = useRef(ch);
  chRef.current = ch;
  const onChangeRef = useRef(onChangeField);
  onChangeRef.current = onChangeField;
  const startFader = useRef(ch.fader);
  const trackHeightRef = useRef(220);
  const [trackHeight, setTrackHeight] = useState(220);

  const pr = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startFader.current = chRef.current.fader;
      },
      onPanResponderMove: (_, g) => {
        const travel = Math.max(1, trackHeightRef.current - V_FADER_THUMB_H);
        const nv = clamp(startFader.current - g.dy / travel, 0, 1);
        onChangeRef.current(chRef.current.id, "fader", nv);
      },
    }),
  ).current;

  function handleLayout(e) {
    const h = e.nativeEvent.layout.height;
    trackHeightRef.current = h;
    setTrackHeight(h);
  }

  const travel = Math.max(0, trackHeight - V_FADER_THUMB_H);
  const thumbTop = (1 - ch.fader) * travel;
  const dB = faderTodB(ch.fader);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onSelect(ch.id)}
      onLongPress={() => onRename?.(ch.id, ch.name)}
      style={[S.vChannel, isSelected && S.vChannelSelected]}
    >
      <View style={[S.vColor, { backgroundColor: ch.color }]} />
      <Text style={S.vNum}>{ch.id.replace("ch", "")}</Text>
      <Text style={S.vName} numberOfLines={1}>
        {ch.name}
      </Text>
      <View style={S.vMeter}>
        <View
          style={[
            S.vMeterFill,
            { height: `${Math.max(6, ch.fader * 100)}%`, backgroundColor: ch.color },
          ]}
        />
      </View>
      <View style={S.vFaderWrap} onLayout={handleLayout} {...pr.panHandlers}>
        <View style={[S.vFaderTrack, isSelected && S.vFaderTrackActive]}>
          <View style={S.vTrackCapTop} />
          <View style={S.vTrackLine} />
          <View
            style={[S.vTrackLine, { top: 110, opacity: 0.18, width: 4 }]}
          />
          <View style={S.vTrackCapBottom} />
        </View>
        <View
          style={[
            S.vFaderThumb,
            {
              top: thumbTop,
              backgroundColor: ch.mute ? "#3E2F28" : ch.color,
            },
          ]}
        />
      </View>
      <Text style={S.vDbLabel}>{dB === "-∞" ? "-∞" : `${dB}dB`}</Text>
      <View style={S.vBtnRow}>
        <TouchableOpacity
          style={[S.vBtn, ch.mute && S.vBtnOn]}
          onPress={() => onChangeRef.current(ch.id, "mute", !ch.mute)}
        >
          <Text style={[S.vBtnTxt, ch.mute && S.vBtnTxtOn]}>M</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.vBtn, ch.solo && S.vBtnOn]}
          onPress={() => onChangeRef.current(ch.id, "solo", !ch.solo)}
        >
          <Text style={[S.vBtnTxt, ch.solo && S.vBtnTxtOn]}>S</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function VMasterStrip({ master, onFaderChange, onMuteChange }) {
  const masterRef = useRef(master);
  masterRef.current = master;
  const onFaderRef = useRef(onFaderChange);
  onFaderRef.current = onFaderChange;
  const startFader = useRef(master.fader);
  const trackHeightRef = useRef(220);
  const [trackHeight, setTrackHeight] = useState(220);

  const pr = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startFader.current = masterRef.current.fader;
      },
      onPanResponderMove: (_, g) => {
        const travel = Math.max(1, trackHeightRef.current - V_FADER_THUMB_H);
        const nv = clamp(startFader.current - g.dy / travel, 0, 1);
        onFaderRef.current(nv);
      },
    }),
  ).current;

  function handleLayout(e) {
    const h = e.nativeEvent.layout.height;
    trackHeightRef.current = h;
    setTrackHeight(h);
  }

  const travel = Math.max(0, trackHeight - V_FADER_THUMB_H);
  const thumbTop = (1 - master.fader) * travel;
  const dB = faderTodB(master.fader);

  return (
    <View style={S.masterColumn}>
      <Text style={[S.bankLabel, { color: "#A5B4FC" }]}>MASTER</Text>
      <View style={S.vFaderWrap} onLayout={handleLayout} {...pr.panHandlers}>
        <View style={[S.vFaderTrack, S.masterTrack]}>
          <View style={S.vTrackDecor} />
        </View>
        <View
          style={[
            S.vFaderThumb,
            {
              top: thumbTop,
              backgroundColor: "#A5B4FC",
              borderColor: "rgba(165,180,252,0.4)",
            },
          ]}
        />
      </View>
      <Text style={[S.vDbLabel, { color: "#A5B4FC" }]}>
        {dB === "-∞" ? "-∞" : `${dB}dB`}
      </Text>
      <TouchableOpacity
        style={[S.vBtn, master.mute && S.vBtnOn]}
        onPress={() => onMuteChange(!master.mute)}
      >
        <Text style={[S.vBtnTxt, master.mute && S.vBtnTxtOn]}>M</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── EqPanel ──────────────────────────────────────────────────────────────────
function EqPanel({ ch, onChange }) {
  if (!ch) return null;
  const { eq, gate, comp } = ch;

  const setEq = (band, key, val) =>
    onChange(ch.id, "eq", { ...eq, [band]: { ...eq[band], [key]: val } });
  const setGate = (key, val) =>
    onChange(ch.id, "gate", { ...gate, [key]: val });
  const setComp = (key, val) =>
    onChange(ch.id, "comp", { ...comp, [key]: val });

  return (
    <View style={S.eqPanel}>
      <Text style={S.eqTitle}>EQ / DYNAMICS — {ch.name}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 20 }}
      >
        <View style={S.eqBand}>
          <Text style={S.eqBandLabel}>HPF</Text>
          <TouchableOpacity
            style={[S.eqToggle, eq.hpf.enabled && S.eqToggleOn]}
            onPress={() => setEq("hpf", "enabled", !eq.hpf.enabled)}
          >
            <Text style={S.eqToggleTxt}>{eq.hpf.enabled ? "ON" : "OFF"}</Text>
          </TouchableOpacity>
          <Text style={S.eqParam}>Freq: {Math.round(eq.hpf.freq)} Hz</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={20}
            maximumValue={500}
            value={eq.hpf.freq}
            onValueChange={(v) => setEq("hpf", "freq", v)}
            minimumTrackTintColor="#6366F1"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#A5B4FC"
          />
        </View>

        <View style={S.eqBand}>
          <Text style={S.eqBandLabel}>LMF</Text>
          <Text style={S.eqParam}>Gain: {eq.lmf.gain.toFixed(1)} dB</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={-18}
            maximumValue={18}
            value={eq.lmf.gain}
            onValueChange={(v) => setEq("lmf", "gain", v)}
            minimumTrackTintColor="#0EA5E9"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#7DD3FC"
          />
          <Text style={S.eqParam}>Freq: {Math.round(eq.lmf.freq)} Hz</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={80}
            maximumValue={2000}
            value={eq.lmf.freq}
            onValueChange={(v) => setEq("lmf", "freq", v)}
            minimumTrackTintColor="#0EA5E9"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#7DD3FC"
          />
          <Text style={S.eqParam}>Q: {eq.lmf.q.toFixed(1)}</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={0.1}
            maximumValue={10}
            value={eq.lmf.q}
            onValueChange={(v) => setEq("lmf", "q", v)}
            minimumTrackTintColor="#0EA5E9"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#7DD3FC"
          />
        </View>

        <View style={S.eqBand}>
          <Text style={S.eqBandLabel}>HMF</Text>
          <Text style={S.eqParam}>Gain: {eq.hmf.gain.toFixed(1)} dB</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={-18}
            maximumValue={18}
            value={eq.hmf.gain}
            onValueChange={(v) => setEq("hmf", "gain", v)}
            minimumTrackTintColor="#10B981"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#6EE7B7"
          />
          <Text style={S.eqParam}>Freq: {Math.round(eq.hmf.freq)} Hz</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={500}
            maximumValue={12000}
            value={eq.hmf.freq}
            onValueChange={(v) => setEq("hmf", "freq", v)}
            minimumTrackTintColor="#10B981"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#6EE7B7"
          />
          <Text style={S.eqParam}>Q: {eq.hmf.q.toFixed(1)}</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={0.1}
            maximumValue={10}
            value={eq.hmf.q}
            onValueChange={(v) => setEq("hmf", "q", v)}
            minimumTrackTintColor="#10B981"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#6EE7B7"
          />
        </View>

        <View style={S.eqBand}>
          <Text style={S.eqBandLabel}>HF Shelf</Text>
          <Text style={S.eqParam}>Gain: {eq.hf.gain.toFixed(1)} dB</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={-18}
            maximumValue={18}
            value={eq.hf.gain}
            onValueChange={(v) => setEq("hf", "gain", v)}
            minimumTrackTintColor="#F59E0B"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#FCD34D"
          />
          <Text style={S.eqParam}>Freq: {Math.round(eq.hf.freq)} Hz</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={2000}
            maximumValue={20000}
            value={eq.hf.freq}
            onValueChange={(v) => setEq("hf", "freq", v)}
            minimumTrackTintColor="#F59E0B"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#FCD34D"
          />
        </View>

        <View style={S.eqBand}>
          <Text style={S.eqBandLabel}>GATE</Text>
          <TouchableOpacity
            style={[S.eqToggle, gate.enabled && S.eqToggleOn]}
            onPress={() => setGate("enabled", !gate.enabled)}
          >
            <Text style={S.eqToggleTxt}>{gate.enabled ? "ON" : "OFF"}</Text>
          </TouchableOpacity>
          <Text style={S.eqParam}>Threshold: {gate.threshold} dB</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={-80}
            maximumValue={0}
            value={gate.threshold}
            onValueChange={(v) => setGate("threshold", Math.round(v))}
            minimumTrackTintColor="#EF4444"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#FCA5A5"
          />
        </View>

        <View style={S.eqBand}>
          <Text style={S.eqBandLabel}>COMP</Text>
          <TouchableOpacity
            style={[S.eqToggle, comp.enabled && S.eqToggleOn]}
            onPress={() => setComp("enabled", !comp.enabled)}
          >
            <Text style={S.eqToggleTxt}>{comp.enabled ? "ON" : "OFF"}</Text>
          </TouchableOpacity>
          <Text style={S.eqParam}>Threshold: {comp.threshold} dB</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={-60}
            maximumValue={0}
            value={comp.threshold}
            onValueChange={(v) => setComp("threshold", Math.round(v))}
            minimumTrackTintColor="#8B5CF6"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#C4B5FD"
          />
          <Text style={S.eqParam}>Ratio: {comp.ratio}:1</Text>
          <Slider
            style={S.eqSlider}
            minimumValue={1}
            maximumValue={20}
            value={comp.ratio}
            onValueChange={(v) => setComp("ratio", Math.round(v))}
            minimumTrackTintColor="#8B5CF6"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#C4B5FD"
          />
        </View>
      </ScrollView>
    </View>
  );
}

// ─── SceneBar ─────────────────────────────────────────────────────────────────
function SceneBar({ scenes, activeId, onSave, onLoad, onDelete }) {
  const [newName, setNewName] = useState("");

  return (
    <View style={S.sceneBar}>
      <Text style={S.sceneBarLabel}>SCENES</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {scenes.map((sc) => (
          <View
            key={sc.id}
            style={[S.sceneChip, sc.id === activeId && S.sceneChipActive]}
          >
            <TouchableOpacity onPress={() => onLoad(sc.id)}>
              <Text
                style={[
                  S.sceneChipTxt,
                  sc.id === activeId && S.sceneChipTxtActive,
                ]}
                numberOfLines={1}
              >
                {sc.name}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDelete(sc.id)}
              style={S.sceneDelBtn}
            >
              <Text style={S.sceneDelTxt}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
      <View style={S.sceneSaveRow}>
        <TextInput
          style={S.sceneNameInput}
          value={newName}
          onChangeText={setNewName}
          placeholder="Scene name…"
          placeholderTextColor="#4B5563"
        />
        <TouchableOpacity
          style={S.sceneSaveBtn}
          onPress={() => {
            if (newName.trim()) {
              onSave(newName.trim());
              setNewName("");
            }
          }}
        >
          <Text style={S.sceneSaveTxt}>💾 Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── HardwareModal ────────────────────────────────────────────────────────────
function HardwareModal({ visible, onClose, onSync }) {
  const [bridgeUrl, setBridgeUrl] = useState("https://ultimatelabs.pages.dev");
  const [mixerIp, setMixerIp] = useState("192.168.1.100");
  const [port, setPort] = useState("10023");
  const [proto, setProto] = useState(0);
  const [syncing, setSyncing] = useState(false);

  function selectProto(i) {
    setProto(i);
    if (PROTOCOLS[i].port) setPort(String(PROTOCOLS[i].port));
  }

  async function doSync() {
    setSyncing(true);
    try {
      await onSync(bridgeUrl, mixerIp, parseInt(port, 10));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={S.modalOverlay}>
        <View style={S.modalCard}>
          <Text style={S.modalTitle}>🔌 Hardware Mixer Bridge</Text>

          <Text style={S.modalLabel}>Protocol</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
          >
            {PROTOCOLS.map((p, i) => (
              <TouchableOpacity
                key={p.label}
                style={[S.protoChip, i === proto && S.protoChipActive]}
                onPress={() => selectProto(i)}
              >
                <Text style={[S.protoTxt, i === proto && S.protoTxtActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={S.modalLabel}>Bridge URL (Electron Desktop)</Text>
          <TextInput
            style={S.modalInput}
            value={bridgeUrl}
            onChangeText={setBridgeUrl}
            placeholder="https://ultimatelabs.pages.dev"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
          />

          <Text style={S.modalLabel}>Mixer IP Address</Text>
          <TextInput
            style={S.modalInput}
            value={mixerIp}
            onChangeText={setMixerIp}
            placeholder="192.168.1.100"
            placeholderTextColor="#4B5563"
            keyboardType="numbers-and-punctuation"
          />

          <Text style={S.modalLabel}>UDP Port</Text>
          <TextInput
            style={S.modalInput}
            value={port}
            onChangeText={setPort}
            placeholder="10023"
            placeholderTextColor="#4B5563"
            keyboardType="numeric"
          />

          <View style={S.modalActions}>
            <TouchableOpacity style={S.modalCancelBtn} onPress={onClose}>
              <Text style={S.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={S.modalSyncBtn}
              onPress={doSync}
              disabled={syncing}
            >
              <Text style={S.modalSyncTxt}>
                {syncing ? "Syncing…" : "📡 Sync All Channels"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MixerConsoleScreen() {
  const insets = useSafeAreaInsets();

  const [channels, setChannels] = useState(() =>
    Array.from({ length: 32 }, (_, i) => makeChannel(i)),
  );
  const [master, setMaster] = useState(INIT_MASTER);
  const [selectedId, setSelectedId] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [activeScene, setActiveScene] = useState(null);
  const [hwModal, setHwModal] = useState(false);
  const [renameCandidate, setRenameCandidate] = useState(null);
  const [renameText, setRenameText] = useState("");
  const [aiEqLoading, setAiEqLoading] = useState(false);
  const [aiEqResult, setAiEqResult]   = useState(null);

  async function handleAIEqAnalysis() {
    setAiEqLoading(true);
    setAiEqResult(null);
    try {
      const channelData = channels.map(c => ({
        name: c.name,
        fader: Math.round(c.fader * 100),
        muted: !!c.mute,
        eq: c.eq,
      }));
      const res = await fetch(`${CINESTAGE_URL}/ai/music/analyze-eq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: channelData, genre: 'worship', mix_style: 'live' }),
      });
      if (!res.ok) throw new Error(`AI EQ ${res.status}`);
      const data = await res.json();
      setAiEqResult(data.recommendations || data.analysis || data.content || JSON.stringify(data));
    } catch (e) {
      Alert.alert('AI EQ Error', e.message);
    } finally {
      setAiEqLoading(false);
    }
  }

  const selectedChannel = channels.find((c) => c.id === selectedId) || null;
  const bankSize = 16;
  const banks = useMemo(() => {
    const list = [];
    const count = Math.ceil(channels.length / bankSize);
    for (let i = 0; i < count; i += 1) {
      list.push(channels.slice(i * bankSize, (i + 1) * bankSize));
    }
    return list;
  }, [channels]);

  useEffect(() => {
    AsyncStorage.getItem(SCENES_KEY).then((raw) => {
      if (raw)
        try {
          setScenes(JSON.parse(raw));
        } catch {}
    });
  }, []);

  async function persistScenes(next) {
    setScenes(next);
    await AsyncStorage.setItem(SCENES_KEY, JSON.stringify(next));
  }

  function changeChannel(id, field, value) {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  }

  function startRename(id, currentName) {
    setRenameCandidate(id);
    setRenameText(currentName);
  }

  function applyRename() {
    if (!renameCandidate) return;
    const label = (renameText || "").trim() || "Channel";
    changeChannel(renameCandidate, "name", label);
    setRenameCandidate(null);
    setRenameText("");
  }

  function cancelRename() {
    setRenameCandidate(null);
    setRenameText("");
  }

  function saveScene(name) {
    const scene = {
      id: makeId(),
      name,
      ts: Date.now(),
      channels: JSON.parse(JSON.stringify(channels)),
      master: { ...master },
    };
    const next = [...scenes, scene];
    persistScenes(next);
    setActiveScene(scene.id);
  }

  function loadScene(id) {
    const sc = scenes.find((s) => s.id === id);
    if (!sc) return;
    setChannels(sc.channels);
    setMaster(sc.master);
    setActiveScene(id);
  }

  function deleteScene(id) {
    Alert.alert("Delete Scene", "Remove this scene?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          persistScenes(scenes.filter((s) => s.id !== id));
          if (activeScene === id) setActiveScene(null);
        },
      },
    ]);
  }

  async function syncToHardware(bridgeUrl, mixerIp, port) {
    let errors = 0;
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const chNum = String(i + 1).padStart(2, "0");
      try {
        await fetch(`${bridgeUrl}/api/osc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ip: mixerIp,
            port,
            path: `/ch/${chNum}/mix/fader`,
            args: [ch.fader],
          }),
        });
        await fetch(`${bridgeUrl}/api/osc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ip: mixerIp,
            port,
            path: `/ch/${chNum}/mix/on`,
            args: [ch.mute ? 0 : 1],
          }),
        });
      } catch {
        errors++;
      }
    }
    setHwModal(false);
    Alert.alert(
      errors === 0 ? "✅ Sync Complete" : "⚠️ Partial Sync",
      errors === 0
        ? "All 32 channels sent."
        : `${errors} channel(s) failed. Check bridge.`,
    );
  }

  function confirmReset() {
    Alert.alert("Reset All", "Reset all channels to default levels?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          setChannels(Array.from({ length: 32 }, (_, i) => makeChannel(i)));
          setMaster(INIT_MASTER);
          setActiveScene(null);
        },
      },
    ]);
  }

  return (
    <View style={[S.root, { paddingBottom: insets.bottom }]}>
      <View style={S.textureLayer} />
      <View style={S.rootContent}>
      {/* AI EQ Analysis bar */}
      <View style={S.panelSurface}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, gap: 10 }}>
        <TouchableOpacity
          onPress={handleAIEqAnalysis}
          disabled={aiEqLoading}
          style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#1e1b4b', borderRadius: 6, borderWidth: 1, borderColor: '#6366f1' }}
        >
          <Text style={{ color: '#818cf8', fontSize: 12, fontWeight: '600' }}>
            {aiEqLoading ? '⏳ Analyzing…' : '🤖 AI EQ Suggestions'}
          </Text>
        </TouchableOpacity>
        {aiEqResult && (
          <TouchableOpacity onPress={() => setAiEqResult(null)}>
            <Text style={{ color: '#475569', fontSize: 11 }}>✕ dismiss</Text>
          </TouchableOpacity>
        )}
      </View>
      {aiEqResult && (
        <View style={[S.panelSurface, { marginTop: 4, padding: 10 }]}>
          <Text style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 16 }}>
            {typeof aiEqResult === 'string' ? aiEqResult : JSON.stringify(aiEqResult, null, 2)}
          </Text>
        </View>
      )}

      </View>

      {/* Scene bar */}
      <SceneBar
        scenes={scenes}
        activeId={activeScene}
        onSave={saveScene}
        onLoad={loadScene}
        onDelete={deleteScene}
      />

      {/* Vertical mixer banks */}
      <View style={S.mixerArea}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.mixerScroll}
        >
          {banks.map((bank, idx) => (
            <View key={`bank_${idx}`} style={S.bankSection}>
              <Text style={S.bankLabel}>BANK {idx + 1}</Text>
              <View style={S.bankRow}>
                {bank.map((ch) => (
                  <VChannelStrip
                    key={ch.id}
                    ch={ch}
                    isSelected={ch.id === selectedId}
                    onSelect={(id) =>
                      setSelectedId((prev) => (prev === id ? null : id))
                    }
                    onChangeField={changeChannel}
                    onRename={startRename}
                  />
                ))}
              </View>
            </View>
          ))}
          <View style={[S.bankSection, S.masterWrapper]}>
            <VMasterStrip
              master={master}
              onFaderChange={(v) => setMaster((m) => ({ ...m, fader: v }))}
              onMuteChange={(v) => setMaster((m) => ({ ...m, mute: v }))}
            />
          </View>
        </ScrollView>
      </View>

      {/* EQ / Dynamics panel (selected channel) */}
      {selectedChannel && (
        <EqPanel ch={selectedChannel} onChange={changeChannel} />
      )}

      {/* Toolbar */}
      <View style={[S.toolbar, { paddingBottom: Math.max(insets.bottom, 4) }]}>
        <TouchableOpacity style={S.toolBtn} onPress={() => setHwModal(true)}>
          <Text style={S.toolBtnTxt}>🔌 Hardware Bridge</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.toolBtn} onPress={confirmReset}>
          <Text style={S.toolBtnTxt}>↺ Reset All</Text>
        </TouchableOpacity>
        {selectedChannel && (
          <TouchableOpacity
            style={[S.toolBtn, S.toolBtnAccent]}
            onPress={() => setSelectedId(null)}
          >
            <Text style={[S.toolBtnTxt, { color: "#A5B4FC" }]}>✕ Close EQ</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <Text style={S.toolHint}>
          {selectedChannel
            ? `Editing: ${selectedChannel.name}`
            : "Tap a channel to open EQ"}
        </Text>
      </View>

      <HardwareModal
        visible={hwModal}
        onClose={() => setHwModal(false)}
        onSync={syncToHardware}
      />
      <Modal
        visible={!!renameCandidate}
        transparent
        animationType="fade"
        onRequestClose={cancelRename}
      >
        <TouchableOpacity
          onPressOut={cancelRename}
          activeOpacity={1}
          style={S.renameOverlay}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={S.renameCard}
          >
            <Text style={S.renameTitle}>Rename Channel</Text>
            <TextInput
              style={S.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Channel name"
              placeholderTextColor="#a0988f"
              maxLength={28}
              returnKeyType="done"
              onSubmitEditing={applyRename}
            />
            <View style={S.renameActions}>
              <TouchableOpacity style={S.renameBtn} onPress={cancelRename}>
                <Text style={S.renameBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.renameBtn, S.renameBtnPrimary]}
                onPress={applyRename}
              >
                <Text style={[S.renameBtnText, S.renameBtnTextPrimary]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#120902",
  },
  rootContent: {
    flex: 1,
    position: "relative",
  },
  textureLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1b1207",
    opacity: 0.6,
  },
  panelSurface: {
    backgroundColor: "rgba(20,10,4,0.85)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3c2b1c",
    marginHorizontal: 10,
    marginBottom: 4,
    padding: 8,
  },

  // ── Scene bar
  sceneBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#080E1A",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    paddingHorizontal: 12,
    paddingVertical: 6,
    height: 52,
    gap: 8,
  },
  sceneBarLabel: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  sceneChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    maxWidth: 140,
  },
  sceneChipActive: { borderColor: "#4F46E5", backgroundColor: "#1E1B4B" },
  sceneChipTxt: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 100,
  },
  sceneChipTxtActive: { color: "#A5B4FC" },
  sceneDelBtn: { marginLeft: 8, width: 16, alignItems: "center" },
  sceneDelTxt: { color: "#475569", fontSize: 16, lineHeight: 18 },
  sceneSaveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sceneNameInput: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    color: "#E2E8F0",
    fontSize: 12,
    width: 130,
  },
  sceneSaveBtn: {
    backgroundColor: "#1E1B4B",
    borderWidth: 1,
    borderColor: "#4F46E5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  sceneSaveTxt: { color: "#A5B4FC", fontSize: 12, fontWeight: "700" },

  // ── Column headers
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#050B14",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#0F172A",
  },
  colHdrTxt: {
    color: "#334155",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    textAlign: "center",
  },

  mixerArea: {
    flex: 1,
    marginTop: 6,
  },
  mixerScroll: {
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bankSection: {
    marginRight: BANK_SPACING,
    alignItems: "center",
    backgroundColor: "#0d0602",
    borderWidth: 1,
    borderColor: "#2f1a0f",
    borderRadius: 18,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  bankLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  bankRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  vChannel: {
    width: V_CHANNEL_WIDTH,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginHorizontal: 4,
    backgroundColor: "#040B1A",
  },
  vChannelSelected: {
    borderColor: "#4F46E5",
    backgroundColor: "#060F1F",
  },
  vColor: {
    width: 28,
    height: 4,
    borderRadius: 2,
    marginBottom: 6,
  },
  vNum: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  vName: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "600",
    marginVertical: 4,
  },
  vMeter: {
    width: 42,
    height: 70,
    borderRadius: 12,
    backgroundColor: "#050A16",
    overflow: "hidden",
    marginBottom: 10,
  },
  vMeterFill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  vFaderWrap: {
    width: 44,
    height: 210,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  vFaderTrack: {
    position: "absolute",
    left: "50%",
    marginLeft: -3,
    top: 16,
    bottom: 16,
    width: 6,
    borderRadius: 3,
    backgroundColor: "#080b11",
    overflow: "visible",
  },
  vFaderTrackActive: {
    backgroundColor: "#1f1410",
  },
  vTrackDecor: {
    position: "absolute",
    left: 1,
    right: 1,
    top: 8,
    borderRadius: 3,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    opacity: 0.3,
  },
  vTrackLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 30,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  vTrackCapTop: {
    position: "absolute",
    left: -2,
    right: -2,
    top: -4,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1f1410",
    borderWidth: 1,
    borderColor: "#2b1b10",
  },
  vTrackCapBottom: {
    position: "absolute",
    left: -2,
    right: -2,
    bottom: -4,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1f1410",
    borderWidth: 1,
    borderColor: "#2b1b10",
  },
  vFaderThumb: {
    position: "absolute",
    left: 7,
    width: 26,
    height: V_FADER_THUMB_H,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 1.5,
    elevation: 2,
  },
  vDbLabel: {
    marginBottom: 6,
    color: "#475569",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  vBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  vBtn: {
    width: 28,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0F1624",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 2,
  },
  vBtnOn: {
    backgroundColor: "#7C3AED",
    borderColor: "#A855F7",
  },
  vBtnTxt: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
  },
  vBtnTxtOn: {
    color: "#FCFCFC",
  },
  masterColumn: {
    width: V_CHANNEL_WIDTH + 12,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  masterTrack: {
    backgroundColor: "#1E293B",
  },
  masterWrapper: {
    marginTop: 12,
    marginRight: 18,
    alignItems: "center",
  },

  // ── Channel row
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    backgroundColor: "#070D1A",
    borderBottomWidth: 1,
    borderBottomColor: "#0D1626",
    paddingHorizontal: 8,
    gap: 0,
  },
  rowSelected: {
    backgroundColor: "#0A1528",
    borderBottomColor: "#4F46E5",
    borderBottomWidth: 1,
    borderLeftWidth: 2,
    borderLeftColor: "#4F46E5",
  },
  rowColor: {
    width: 4,
    height: 28,
    borderRadius: 2,
    marginRight: 8,
  },
  rowNum: {
    width: 22,
    color: "#334155",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
    marginRight: 8,
  },
  rowName: {
    width: 84,
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    marginRight: 8,
  },
  rowChips: {
    width: 62,
    flexDirection: "row",
    gap: 3,
    marginRight: 8,
  },
  chip: {
    width: 17,
    height: 17,
    borderRadius: 4,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: "#14532D", borderColor: "#22C55E" },
  chipHpf: { backgroundColor: "#1E1B4B", borderColor: "#6366F1" },
  chipTxt: { color: "#475569", fontSize: 7, fontWeight: "900" },

  // ── Horizontal fader
  faderWrap: {
    flex: 1,
    height: FADER_WRAP_H,
    position: "relative",
    marginHorizontal: 4,
  },
  faderTrack: {
    position: "absolute",
    top: FADER_TRACK_T,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#1E293B",
    borderRadius: 2,
  },
  zeroTick: {
    position: "absolute",
    top: 10,
    width: 2,
    height: 14,
    backgroundColor: "#4F46E5",
  },
  faderThumb: {
    position: "absolute",
    top: FADER_THUMB_T,
    width: FADER_THUMB_W,
    height: 26,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  // ── Labels
  dbLabel: {
    width: 44,
    color: "#475569",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    marginHorizontal: 4,
  },
  dbZero: { color: "#818CF8" },

  // ── Mute / Solo
  muteBtn: {
    width: 28,
    height: 24,
    borderRadius: 4,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  muteBtnOn: { backgroundColor: "#7F1D1D", borderColor: "#EF4444" },
  soloBtn: {
    width: 28,
    height: 24,
    borderRadius: 4,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  soloBtnOn: { backgroundColor: "#78350F", borderColor: "#F59E0B" },
  btnTxt: { color: "#475569", fontSize: 9, fontWeight: "900" },
  muteTxtOn: { color: "#FCA5A5" },
  soloTxtOn: { color: "#FDE68A" },

  // ── Master row
  masterRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: "#060D1B",
    borderTopWidth: 2,
    borderTopColor: "#1E293B",
    paddingHorizontal: 8,
    marginTop: 4,
  },

  // ── EQ panel
  eqPanel: {
    backgroundColor: "#080E1A",
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 4,
    maxHeight: 210,
  },
  eqTitle: {
    color: "#818CF8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  eqBand: { width: 160, marginRight: 14 },
  eqBandLabel: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  eqToggle: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  eqToggleOn: { backgroundColor: "#14532D", borderColor: "#22C55E" },
  eqToggleTxt: { color: "#64748B", fontSize: 10, fontWeight: "700" },
  eqParam: { color: "#475569", fontSize: 9, marginTop: 3, marginBottom: 1 },
  eqSlider: { width: 150, height: 28 },

  // ── Toolbar
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#050B14",
    borderTopWidth: 1,
    borderTopColor: "#0F172A",
    paddingHorizontal: 12,
    paddingTop: 6,
    gap: 8,
  },
  toolBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 8,
  },
  toolBtnAccent: { borderColor: "#4F46E5", backgroundColor: "#1E1B4B" },
  toolBtnTxt: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  toolHint: { color: "#334155", fontSize: 11, fontStyle: "italic" },

  // ── Hardware modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: "#080E1A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 16,
    padding: 24,
    width: 420,
    maxWidth: "92%",
  },
  modalTitle: {
    color: "#E2E8F0",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 14,
  },
  modalLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#E2E8F0",
    fontSize: 13,
  },
  protoChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 8,
    marginRight: 8,
  },
  protoChipActive: { backgroundColor: "#1E1B4B", borderColor: "#4F46E5" },
  protoTxt: { color: "#475569", fontSize: 12, fontWeight: "600" },
  protoTxtActive: { color: "#A5B4FC" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 8,
  },
  modalCancelTxt: { color: "#64748B", fontSize: 13, fontWeight: "600" },
  modalSyncBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#1E1B4B",
    borderWidth: 1,
    borderColor: "#4F46E5",
    borderRadius: 8,
  },
  modalSyncTxt: { color: "#A5B4FC", fontSize: 13, fontWeight: "700" },
  renameOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,4,4,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  renameCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 16,
    padding: 18,
    backgroundColor: "#0b0402",
    borderWidth: 1,
    borderColor: "#2c1a13",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 6,
  },
  renameTitle: {
    color: "#f4f1ec",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  renameInput: {
    backgroundColor: "#120907",
    borderColor: "#3d2b23",
    borderWidth: 1,
    borderRadius: 10,
    color: "#f8f5f0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 12,
  },
  renameActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  renameBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2d1c13",
  },
  renameBtnText: {
    color: "#c4b7a7",
    fontSize: 13,
    fontWeight: "600",
  },
  renameBtnPrimary: {
    backgroundColor: "#a855f7",
    borderColor: "#6d28d9",
  },
  renameBtnTextPrimary: {
    color: "#fff",
  },
});
