import React, { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  ROUTING_TRACKS,
  OUTPUT_COLORS,
  getOutputOptions,
  makeDefaultSettings,
  LYRIC_SOFTWARE_OPTIONS,
} from "../data/models";
import {
  ensureSeeded,
  getSettings,
  saveSettings,
  resetAll,
} from "../data/storage";
import { getPCOCredentials } from "../services/planningCenterService";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function outputColor(val) {
  return OUTPUT_COLORS[val] || "#6B7280";
}

// ─── Components ───────────────────────────────────────────────────────────────
function Toggle({ title, value, onToggle }) {
  return (
    <Pressable onPress={onToggle} style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      <View style={[styles.togglePill, value && styles.togglePillOn]}>
        <Text style={[styles.toggleText, value && styles.toggleTextOn]}>
          {value ? "ON" : "OFF"}
        </Text>
      </View>
    </Pressable>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// Output selector for routing — shows a modal picker
function RoutingPicker({ label, value, options, onChange, isOverride }) {
  const [open, setOpen] = useState(false);
  const color = outputColor(value);
  return (
    <>
      <TouchableOpacity
        style={styles.routingRow}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.routingRowLabel}>{label}</Text>
        <View
          style={[
            styles.routingValueBadge,
            { borderColor: color + "66", backgroundColor: color + "15" },
          ]}
        >
          <Text style={[styles.routingValueText, { color }]}>{value}</Text>
          <Text style={[styles.routingChevron, { color }]}>▾</Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{label}</Text>
            {options.map((opt) => {
              const c = outputColor(opt);
              const active = value === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.pickerOption,
                    active && {
                      backgroundColor: c + "20",
                      borderColor: c + "55",
                    },
                  ]}
                  onPress={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  <View
                    style={[
                      styles.pickerDot,
                      { backgroundColor: active ? c : "#374151" },
                    ]}
                  />
                  <Text
                    style={[
                      styles.pickerOptionText,
                      active && { color: c, fontWeight: "800" },
                    ]}
                  >
                    {opt}
                  </Text>
                  {active && (
                    <Text style={[styles.pickerCheck, { color: c }]}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SettingsScreen({ navigation }) {
  const [s, setS] = useState(null);
  const { isDark, setDarkMode } = useTheme();
  const { userRole, userId, enable2FA, disable2FA } = useAuth();
  const [pcoCreds, setPcoCreds] = useState(null);

  // ── 2FA state ─────────────────────────────────────────────────────────────
  const isAdmin = userRole === "admin" || userRole === "central_admin";
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaQrModal, setTwoFaQrModal] = useState(false);
  const [twoFaSetupData, setTwoFaSetupData] = useState(null); // { qrUrl, secret, backupCode }

  async function handleToggle2FA() {
    if (!userId) {
      Alert.alert("Not signed in", "Sign in as an admin to manage 2FA.");
      return;
    }
    setTwoFaLoading(true);
    try {
      if (twoFaEnabled) {
        await disable2FA(userId);
        setTwoFaEnabled(false);
        Alert.alert("2FA Disabled", "Two-factor authentication has been turned off.");
      } else {
        const data = await enable2FA(userId);
        setTwoFaSetupData(data);
        setTwoFaEnabled(true);
        setTwoFaQrModal(true);
      }
    } catch (err) {
      Alert.alert("Error", String(err.message || err));
    } finally {
      setTwoFaLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await ensureSeeded();
      const loaded = await getSettings();
      const savedPcoCreds = await getPCOCredentials().catch(() => null);
      const defaults = makeDefaultSettings();
      setS({
        ...loaded,
        routing: {
          interfaceChannels:
            loaded.routing?.interfaceChannels ??
            defaults.routing.interfaceChannels,
          global: {
            ...defaults.routing.global,
            ...(loaded.routing?.global || {}),
          },
        },
      });
      setPcoCreds(savedPcoCreds);
    })();
  }, []);

  if (!s) {
    return (
      <View style={{ flex: 1, backgroundColor: "#020617", padding: 20 }}>
        <Text style={{ color: "#fff" }}>Loading settings…</Text>
      </View>
    );
  }

  async function update(next) {
    setS(next);
    await saveSettings(next);
  }

  function updateRoutingGlobal(trackKey, value) {
    update({
      ...s,
      routing: {
        ...s.routing,
        global: { ...s.routing.global, [trackKey]: value },
      },
    });
  }

  const outputOpts = getOutputOptions(8);

  // Group routing tracks by category
  const groups = ["Timing", "Instruments", "Mix"];

  return (
    <View style={{ flex: 1, backgroundColor: "#020617" }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Settings</Text>

        {/* ── Audio Routing ─────────────────────────────────── */}
        <Section title="Audio Routing">
          <Text style={styles.routingNote}>
            Map each track type to an output on your audio interface. Set global
            defaults here; override per song in Song Detail.
          </Text>

          {/* Global defaults grouped */}
          <Text style={styles.routingGroupLabel}>Global Defaults</Text>
          <View style={styles.routingCard}>
            {groups.map((group, gi) => {
              const tracksInGroup = ROUTING_TRACKS.filter(
                (t) => t.group === group,
              );
              return (
                <View key={group}>
                  {gi > 0 && <View style={styles.routingDivider} />}
                  <Text style={styles.routingGroupName}>{group}</Text>
                  {tracksInGroup.map((track) => (
                    <RoutingPicker
                      key={track.key}
                      label={track.label}
                      value={s.routing.global[track.key] || "Main L/R"}
                      options={outputOpts}
                      onChange={(v) => updateRoutingGlobal(track.key, v)}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        </Section>

        {/* ── Lighting ──────────────────────────────────────── */}
        <Section title="Lighting">
          <Toggle
            title="Lighting Cues Enabled"
            value={s.lighting?.enabled ?? false}
            onToggle={() =>
              update({
                ...s,
                lighting: { ...s.lighting, enabled: !s.lighting?.enabled },
              })
            }
          />
          <Text style={styles.fieldLabel}>Target (MIDI/OSC):</Text>
          <TextInput
            value={s.lighting?.target ?? ""}
            onChangeText={(v) =>
              update({ ...s, lighting: { ...s.lighting, target: v } })
            }
            placeholder="e.g. midi://IAC Driver or osc://10.0.0.5:8000"
            placeholderTextColor="#4B5563"
            style={styles.input}
          />
        </Section>

        {/* ── Lyric Software ────────────────────────────────── */}
        <Section title="Lyric Software">
          {(() => {
            const pp = s.proPresenter || {};
            const selectedId = pp.software || "propresenter7";
            const selectedSw =
              LYRIC_SOFTWARE_OPTIONS.find((o) => o.id === selectedId) ||
              LYRIC_SOFTWARE_OPTIONS[0];
            const isCustomOsc = selectedId === "custom_osc";
            const isCustomMidi = selectedId === "custom_midi";
            const isMidi = selectedSw.protocol === "MIDI";

            function updatePP(changes) {
              update({ ...s, proPresenter: { ...pp, ...changes } });
            }

            return (
              <>
                <Toggle
                  title="Cue Sync Enabled"
                  value={pp.enabled ?? false}
                  onToggle={() => updatePP({ enabled: !pp.enabled })}
                />

                {/* Custom OSC path */}
                {isCustomOsc && (
                  <>
                    <Text style={styles.fieldLabel}>OSC Path Template</Text>
                    <TextInput
                      value={pp.oscPath ?? ""}
                      onChangeText={(v) => updatePP({ oscPath: v })}
                      placeholder="/slide/{index}  or  /cue/{name}"
                      placeholderTextColor="#4B5563"
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Text style={styles.swSubNote}>
                      Use {"{index}"} for 0-based index, {"{name}"} for section
                      name
                    </Text>
                  </>
                )}

                {/* MIDI channel */}
                {isMidi && (
                  <>
                    <Text style={styles.fieldLabel}>MIDI Channel (1–16)</Text>
                    <TextInput
                      value={String(pp.midiChannel ?? 1)}
                      onChangeText={(v) =>
                        updatePP({
                          midiChannel: Math.max(
                            1,
                            Math.min(16, Number(v.replace(/\D/g, "")) || 1),
                          ),
                        })
                      }
                      placeholder="1"
                      placeholderTextColor="#4B5563"
                      style={[styles.input, { width: 80 }]}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </>
                )}

                {/* Target host */}
                <Text style={styles.fieldLabel}>
                  {isMidi ? "MIDI Interface / Host" : "Host IP or URL"}
                </Text>
                <TextInput
                  value={pp.target ?? ""}
                  onChangeText={(v) => updatePP({ target: v })}
                  placeholder={
                    isMidi
                      ? "e.g. IAC Driver Bus 1  or  10.0.0.9"
                      : selectedId === "openlp"
                        ? "http://10.0.0.9:4316"
                        : "10.0.0.9"
                  }
                  placeholderTextColor="#4B5563"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            );
          })()}
        </Section>

        {/* ── Sync ──────────────────────────────────────────── */}
        <Section title="Sync">
          <Text style={styles.fieldLabel}>WebSocket URL:</Text>
          <TextInput
            value={s.sync?.wsUrl ?? ""}
            onChangeText={(v) =>
              update({ ...s, sync: { ...s.sync, wsUrl: v } })
            }
            placeholder="ws://10.x.x.x:8000/ws"
            placeholderTextColor="#4B5563"
            style={styles.input}
          />
          <Toggle
            title="Debug Sync Logs"
            value={s.sync?.debug ?? false}
            onToggle={() =>
              update({ ...s, sync: { ...s.sync, debug: !s.sync?.debug } })
            }
          />
        </Section>

        {/* ── Planning Center Online ───────────────────────── */}
        <Section title="Planning Center Online">
          <Text style={styles.routingNote}>
            Connect Planning Center Online and import upcoming setlists into
            your song library from the Integrations area.
          </Text>
          <Pressable
            style={styles.integrationCard}
            onPress={() => navigation?.navigate("PCOImport")}
          >
            <View style={styles.integrationCardHeader}>
              <Text style={styles.integrationCardTitle}>Import from PCO</Text>
              <View
                style={[
                  styles.integrationStatusBadge,
                  pcoCreds
                    ? styles.integrationStatusConnected
                    : styles.integrationStatusDisconnected,
                ]}
              >
                <Text
                  style={[
                    styles.integrationStatusText,
                    pcoCreds
                      ? styles.integrationStatusTextConnected
                      : styles.integrationStatusTextDisconnected,
                  ]}
                >
                  {pcoCreds ? "Connected" : "Not Connected"}
                </Text>
              </View>
            </View>
            <Text style={styles.integrationCardSub}>
              {pcoCreds
                ? "Manage credentials, browse upcoming plans, and import songs from Planning Center Online."
                : "Connect your PCO App ID and Secret, then pull upcoming setlists into Ultimate Musician."}
            </Text>
            <Text style={styles.integrationCardCta}>
              {pcoCreds ? "Open PCO Import →" : "Connect PCO →"}
            </Text>
          </Pressable>
        </Section>

        {/* ── Security (Admin only) ─────────────────────────── */}
        {isAdmin && (
          <Section title="Security">
            <Text style={styles.routingNote}>
              Two-factor authentication adds an extra layer of security for admin sign-ins.
              When enabled, a 6-digit code will be required every time you log in.
            </Text>
            <Pressable
              onPress={twoFaLoading ? undefined : handleToggle2FA}
              style={styles.row}
            >
              <Text style={styles.rowTitle}>Two-Factor Authentication</Text>
              {twoFaLoading ? (
                <ActivityIndicator color="#818CF8" size="small" />
              ) : (
                <View style={[styles.togglePill, twoFaEnabled && styles.togglePillOn]}>
                  <Text style={[styles.toggleText, twoFaEnabled && styles.toggleTextOn]}>
                    {twoFaEnabled ? "ON" : "OFF"}
                  </Text>
                </View>
              )}
            </Pressable>
          </Section>
        )}

        {/* ── General ───────────────────────────────────────── */}
        <Section title="General">
          <View style={styles.row}>
            <Text style={styles.rowTitle}>Theme</Text>
            <View style={styles.themeSeg}>
              <Pressable
                style={[styles.themeSegBtn, isDark && styles.themeSegBtnActive]}
                onPress={() => setDarkMode(true)}
              >
                <Text style={[styles.themeSegText, isDark && styles.themeSegTextActive]}>
                  DARK
                </Text>
              </Pressable>
              <Pressable
                style={[styles.themeSegBtn, !isDark && styles.themeSegBtnActiveLight]}
                onPress={() => setDarkMode(false)}
              >
                <Text style={[styles.themeSegText, !isDark && styles.themeSegTextActiveLight]}>
                  LIGHT
                </Text>
              </Pressable>
            </View>
          </View>
          <Pressable
            onPress={async () => {
              await resetAll();
              setS(await getSettings());
            }}
            style={styles.resetBtn}
          >
            <Text style={styles.resetBtnText}>Reset Demo Data</Text>
          </Pressable>
        </Section>

        <Section label="Web Portals">
          <TouchableOpacity
            style={styles.portalRow}
            onPress={() => Linking.openURL('https://musician.ultimatelabs.co/portal')}
          >
            <View style={styles.portalInfo}>
              <Text style={styles.portalTitle}>Ultimate Musician</Text>
              <Text style={styles.portalUrl}>musician.ultimatelabs.co</Text>
            </View>
            <Text style={styles.portalArrow}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.portalRow, { marginTop: 10 }]}
            onPress={() => Linking.openURL('https://playback.ultimatelabs.co')}
          >
            <View style={styles.portalInfo}>
              <Text style={styles.portalTitle}>Ultimate Playback</Text>
              <Text style={styles.portalUrl}>playback.ultimatelabs.co</Text>
            </View>
            <Text style={styles.portalArrow}>→</Text>
          </TouchableOpacity>
        </Section>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── 2FA Setup Modal ─────────────────────────────────── */}
      <Modal
        visible={twoFaQrModal}
        transparent
        animationType="slide"
        onRequestClose={() => setTwoFaQrModal(false)}
      >
        <View style={styles2fa.overlay}>
          <View style={styles2fa.card}>
            <Text style={styles2fa.title}>2FA Enabled</Text>
            <Text style={styles2fa.subtitle}>
              Scan this QR code with an authenticator app (e.g. Google Authenticator or Authy).
            </Text>
            {twoFaSetupData?.qrUrl ? (
              <Image
                source={{ uri: twoFaSetupData.qrUrl }}
                style={styles2fa.qr}
                resizeMode="contain"
              />
            ) : null}
            {twoFaSetupData?.secret ? (
              <View style={styles2fa.secretRow}>
                <Text style={styles2fa.secretLabel}>Manual key</Text>
                <Text style={styles2fa.secretValue} selectable>
                  {twoFaSetupData.secret}
                </Text>
              </View>
            ) : null}
            {twoFaSetupData?.backupCode ? (
              <View style={styles2fa.secretRow}>
                <Text style={styles2fa.secretLabel}>Backup code (save this!)</Text>
                <Text style={styles2fa.secretValue} selectable>
                  {twoFaSetupData.backupCode}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles2fa.doneBtn}
              onPress={() => setTwoFaQrModal(false)}
            >
              <Text style={styles2fa.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  heading: {
    color: "#F9FAFB",
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 4,
  },

  section: { marginTop: 24 },
  sectionTitle: {
    color: "#F9FAFB",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0B1220",
    marginBottom: 8,
  },
  rowTitle: { color: "#E5E7EB", fontWeight: "700", fontSize: 14 },
  rowValue: { color: "#9CA3AF", fontSize: 14 },

  togglePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "transparent",
  },
  togglePillOn: { backgroundColor: "#14532D", borderColor: "#16A34A" },
  toggleText: { color: "#6B7280", fontWeight: "800", fontSize: 12 },
  toggleTextOn: { color: "#4ADE80" },

  fieldLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    color: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#0B1220",
    marginBottom: 8,
  },

  // Audio Routing
  routingNote: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  routingGroupLabel: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  routingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0B1220",
    overflow: "hidden",
  },
  routingDivider: { height: 1, backgroundColor: "#1F2937" },
  routingGroupName: {
    color: "#4B5563",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  routingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "#0F1829",
  },
  routingRowLabel: { color: "#E5E7EB", fontWeight: "700", fontSize: 14 },
  routingValueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  routingValueText: { fontWeight: "800", fontSize: 12 },
  routingChevron: { fontSize: 10 },

  // Picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerCard: {
    width: 260,
    backgroundColor: "#0F172A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 16,
  },
  pickerTitle: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  pickerOption: {
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
  pickerDot: { width: 8, height: 8, borderRadius: 4 },
  pickerOptionText: { color: "#9CA3AF", fontSize: 14, flex: 1 },
  pickerCheck: { fontWeight: "800", fontSize: 14 },

  // Lyric Software picker
  swChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "transparent",
  },
  swChipActive: { backgroundColor: "#0F2822", borderColor: "#059669" },
  swChipText: { color: "#9CA3AF", fontWeight: "700", fontSize: 13 },
  swChipTextActive: { color: "#34D399" },
  swHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#060D1A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 10,
    marginBottom: 14,
  },
  swHintProtocol: {
    color: "#6B7280",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    backgroundColor: "#1F2937",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  swHintPath: {
    color: "#4B5563",
    fontSize: 11,
    fontFamily: "monospace",
    flex: 1,
  },
  swSubNote: {
    color: "#4B5563",
    fontSize: 11,
    marginTop: -4,
    marginBottom: 12,
    lineHeight: 16,
  },

  // Theme segmented control
  themeSeg: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#060D1A",
    overflow: "hidden",
  },
  themeSegBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  themeSegBtnActive: {
    backgroundColor: "#1E1B4B",
    borderWidth: 1,
    borderColor: "#4F46E5",
    borderRadius: 9,
    margin: 2,
  },
  themeSegBtnActiveLight: {
    backgroundColor: "#FEF9C3",
    borderWidth: 1,
    borderColor: "#CA8A04",
    borderRadius: 9,
    margin: 2,
  },
  themeSegText: {
    color: "#4B5563",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  themeSegTextActive: {
    color: "#818CF8",
  },
  themeSegTextActiveLight: {
    color: "#854D0E",
  },

  // Reset
  resetBtn: {
    marginTop: 8,
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#3F0A0A",
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  resetBtnText: { color: "#FCA5A5", fontWeight: "900", textAlign: "center" },

  portalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  portalInfo: { flex: 1 },
  portalTitle: { color: '#E5E7EB', fontSize: 14, fontWeight: '700' },
  portalUrl: { color: '#818CF8', fontSize: 12, fontWeight: '600', marginTop: 3 },
  portalArrow: { color: '#818CF8', fontSize: 18, fontWeight: '700', marginLeft: 12 },

  integrationCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0B1220",
    gap: 10,
  },
  integrationCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  integrationCardTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "800",
    flex: 1,
  },
  integrationCardSub: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
  },
  integrationCardCta: {
    color: "#F59E0B",
    fontSize: 13,
    fontWeight: "800",
  },
  integrationStatusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  integrationStatusConnected: {
    borderColor: "#059669",
    backgroundColor: "#052E16",
  },
  integrationStatusDisconnected: {
    borderColor: "#B45309",
    backgroundColor: "#1C1207",
  },
  integrationStatusText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  integrationStatusTextConnected: {
    color: "#34D399",
  },
  integrationStatusTextDisconnected: {
    color: "#F59E0B",
  },
});

const styles2fa = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#0B1120",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 24,
    alignItems: "center",
  },
  title: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },
  subtitle: {
    color: "#6B7280",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginBottom: 20,
  },
  qr: {
    width: 180,
    height: 180,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  secretRow: {
    width: "100%",
    backgroundColor: "#060D1A",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 12,
    marginBottom: 10,
  },
  secretLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  secretValue: {
    color: "#F9FAFB",
    fontSize: 13,
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  doneBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 40,
    marginTop: 8,
  },
  doneBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
});
