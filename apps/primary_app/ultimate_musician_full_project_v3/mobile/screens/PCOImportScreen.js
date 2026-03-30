/**
 * PCOImportScreen — Import setlists from Planning Center Online.
 *
 * Flow:
 *   1. Enter App ID + Secret (saved to AsyncStorage)
 *   2. Pick a Service Type
 *   3. Pick an upcoming Plan
 *   4. Review songs → Import to app library
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { makeId } from "../data/models";
import { addOrUpdateSong, getSongs } from "../data/storage";
import {
  clearPCOCredentials,
  getPCOCredentials,
  getPlanItems,
  getServiceTypes,
  getUpcomingPlans,
  savePCOCredentials,
} from "../services/planningCenterService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function SectionHeader({ label }) {
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

function Pill({ label, color = "#818CF8" }) {
  return (
    <View style={[styles.pill, { borderColor: color + "66" }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function PCOImportScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isIPad = width >= 768;

  // Credentials
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const [creds, setCreds] = useState(null);
  const [showConnect, setShowConnect] = useState(false);

  // Data
  const [serviceTypes, setServiceTypes] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [items, setItems] = useState([]);

  // State
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState(null);
  const [imported, setImported] = useState(new Set());

  // ── Load saved credentials ────────────────────────────────────────────────

  useEffect(() => {
    getPCOCredentials().then((saved) => {
      if (saved) {
        setCreds(saved);
        setAppId(saved.appId);
        setSecret(saved.secret);
      } else {
        setShowConnect(true);
      }
    });
  }, []);

  // ── Load service types when credentials available ─────────────────────────

  useEffect(() => {
    if (!creds) return;
    setError(null);
    setLoading(true);
    getServiceTypes(creds)
      .then((types) => {
        setServiceTypes(types);
        if (types.length === 1) {
          setSelectedType(types[0]);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [creds]);

  // ── Load plans when service type selected ─────────────────────────────────

  useEffect(() => {
    if (!selectedType || !creds) return;
    setSelectedPlan(null);
    setItems([]);
    setError(null);
    setLoading(true);
    getUpcomingPlans(selectedType.id, creds)
      .then((p) => setPlans(p))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedType, creds]);

  // ── Load items when plan selected ─────────────────────────────────────────

  useEffect(() => {
    if (!selectedPlan || !selectedType || !creds) return;
    setItems([]);
    setError(null);
    setLoadingItems(true);
    getPlanItems(selectedType.id, selectedPlan.id, creds)
      .then((songs) => setItems(songs))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingItems(false));
  }, [selectedPlan, selectedType, creds]);

  // ── Connect handler ───────────────────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    if (!appId.trim() || !secret.trim()) {
      Alert.alert("Missing credentials", "Enter both App ID and Secret.");
      return;
    }
    await savePCOCredentials(appId.trim(), secret.trim());
    const saved = { appId: appId.trim(), secret: secret.trim() };
    setCreds(saved);
    setShowConnect(false);
  }, [appId, secret]);

  const handleDisconnect = useCallback(async () => {
    Alert.alert("Disconnect PCO", "Remove saved PCO credentials?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          await clearPCOCredentials();
          setCreds(null);
          setServiceTypes([]);
          setSelectedType(null);
          setPlans([]);
          setSelectedPlan(null);
          setItems([]);
          setShowConnect(true);
        },
      },
    ]);
  }, []);

  // ── Import songs ──────────────────────────────────────────────────────────

  const importSong = useCallback(
    async (item) => {
      const existing = await getSongs();
      const dup = existing.find(
        (s) =>
          s.title?.toLowerCase() === item.title?.toLowerCase() &&
          s.artist?.toLowerCase() === item.artist?.toLowerCase()
      );
      const song = {
        id: dup?.id || makeId("pco"),
        title: item.title,
        artist: item.artist || "",
        key: item.key || "",
        bpm: null,
        notes: item.notes || "",
        tags: ["from:pco"],
        createdAt: dup?.createdAt || new Date().toISOString(),
      };
      await addOrUpdateSong(song);
      setImported((prev) => new Set([...prev, item.id]));
    },
    []
  );

  const importAll = useCallback(async () => {
    for (const item of items) {
      await importSong(item);
    }
    Alert.alert(
      "Imported!",
      `${items.length} song${items.length !== 1 ? "s" : ""} added to your library.`
    );
  }, [items, importSong]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.container, isIPad && styles.containerIPad]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <Text style={styles.heading}>Planning Center Import</Text>
        <Text style={styles.sub}>
          Connect your PCO account to pull upcoming setlists directly into your library.
        </Text>

        {/* ── Connect / credentials ── */}
        {showConnect || !creds ? (
          <Card style={{ marginTop: 16 }}>
            <Text style={styles.cardTitle}>Connect to Planning Center</Text>
            <Text style={styles.hint}>
              Get your App ID and Secret from{"\n"}
              <Text style={styles.hintLink}>
                api.planningcenteronline.com → Developer → Personal Access Tokens
              </Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="App ID"
              placeholderTextColor="#4B5563"
              value={appId}
              onChangeText={setAppId}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Secret"
              placeholderTextColor="#4B5563"
              value={secret}
              onChangeText={setSecret}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
              <Text style={styles.connectBtnText}>Connect →</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <Card style={[styles.connectedCard, { marginTop: 16 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={styles.connectedLabel}>Connected to PCO</Text>
                <Text style={styles.connectedId}>{creds.appId}</Text>
              </View>
              <Pressable onPress={handleDisconnect}>
                <Text style={styles.disconnectText}>Disconnect</Text>
              </Pressable>
            </View>
          </Card>
        )}

        {/* ── Error ── */}
        {error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => { setError(null); setShowConnect(true); }}>
              <Text style={styles.disconnectText}>Check credentials →</Text>
            </TouchableOpacity>
          </Card>
        ) : null}

        {/* ── Loading ── */}
        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#818CF8" />
            <Text style={styles.loadingText}>Loading from Planning Center…</Text>
          </View>
        )}

        {/* ── Service Types ── */}
        {!loading && serviceTypes.length > 0 && (
          <>
            <SectionHeader label="Service Type" />
            <View style={[styles.chipRow, isIPad && styles.chipRowIPad]}>
              {serviceTypes.map((st) => (
                <Pressable
                  key={st.id}
                  onPress={() => setSelectedType(st)}
                  style={[
                    styles.chip,
                    selectedType?.id === st.id && styles.chipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedType?.id === st.id && styles.chipTextSelected,
                    ]}
                  >
                    {st.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* ── Plans ── */}
        {!loading && selectedType && plans.length > 0 && (
          <>
            <SectionHeader label="Upcoming Plans" />
            {plans.map((plan) => (
              <Pressable
                key={plan.id}
                onPress={() => setSelectedPlan(plan)}
                style={[
                  styles.planCard,
                  selectedPlan?.id === plan.id && styles.planCardSelected,
                ]}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.planTitle}>{plan.title || "Untitled Plan"}</Text>
                  {selectedPlan?.id === plan.id && <Text style={{ color: "#818CF8" }}>✓</Text>}
                </View>
                {plan.dates ? (
                  <Text style={styles.planDate}>{plan.dates}</Text>
                ) : null}
                {plan.totalLength > 0 && (
                  <Text style={styles.planMeta}>{fmtDuration(plan.totalLength)} total</Text>
                )}
              </Pressable>
            ))}
          </>
        )}

        {!loading && selectedType && plans.length === 0 && !error && (
          <Card style={{ marginTop: 12 }}>
            <Text style={styles.emptyText}>No upcoming plans found for this service type.</Text>
          </Card>
        )}

        {/* ── Plan Items / Setlist ── */}
        {loadingItems && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#818CF8" />
            <Text style={styles.loadingText}>Loading setlist…</Text>
          </View>
        )}

        {!loadingItems && items.length > 0 && (
          <>
            <View style={styles.setlistHeader}>
              <SectionHeader label={`Setlist (${items.length} songs)`} />
              <TouchableOpacity onPress={importAll} style={styles.importAllBtn}>
                <Text style={styles.importAllText}>Import All →</Text>
              </TouchableOpacity>
            </View>

            {items.map((item, idx) => {
              const done = imported.has(item.id);
              return (
                <Card key={item.id} style={styles.songCard}>
                  <View style={styles.songRow}>
                    <Text style={styles.songSeq}>{idx + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.songTitle}>{item.title}</Text>
                      {item.artist ? (
                        <Text style={styles.songArtist}>{item.artist}</Text>
                      ) : null}
                      <View style={styles.songMeta}>
                        {item.key ? <Pill label={item.key} color="#34D399" /> : null}
                        {item.length > 0 ? (
                          <Text style={styles.songDur}>{fmtDuration(item.length)}</Text>
                        ) : null}
                      </View>
                      {item.notes ? (
                        <Text style={styles.songNotes} numberOfLines={2}>
                          {item.notes}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => importSong(item)}
                      style={[styles.importBtn, done && styles.importBtnDone]}
                      disabled={done}
                    >
                      <Text style={[styles.importBtnText, done && styles.importBtnTextDone]}>
                        {done ? "✓" : "+ Add"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  container: { padding: 20, paddingBottom: 40 },
  containerIPad: { paddingHorizontal: 40 },

  heading: { color: "#F9FAFB", fontSize: 24, fontWeight: "900" },
  sub: { color: "#6B7280", marginTop: 6, fontSize: 13, lineHeight: 18 },

  sectionHeader: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 10,
  },

  card: {
    backgroundColor: "#0B1220",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 16,
  },
  cardTitle: { color: "#F9FAFB", fontSize: 15, fontWeight: "800", marginBottom: 6 },

  hint: { color: "#6B7280", fontSize: 12, lineHeight: 18, marginBottom: 12 },
  hintLink: { color: "#818CF8" },

  input: {
    backgroundColor: "#111827",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1F2937",
    color: "#F9FAFB",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },

  connectBtn: {
    backgroundColor: "#4338CA",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  connectBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  connectedCard: {
    backgroundColor: "#0D1B0D",
    borderColor: "#14532D55",
  },
  connectedLabel: { color: "#34D399", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  connectedId: { color: "#9CA3AF", fontSize: 13, marginTop: 2 },
  disconnectText: { color: "#EF4444", fontSize: 13, fontWeight: "600" },

  errorCard: { marginTop: 12, borderColor: "#7F1D1D55", backgroundColor: "#0D0505" },
  errorText: { color: "#FCA5A5", fontSize: 13, marginBottom: 8 },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20 },
  loadingText: { color: "#6B7280", fontSize: 13 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipRowIPad: { gap: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#111827",
  },
  chipSelected: { borderColor: "#818CF8", backgroundColor: "#1E1B4B" },
  chipText: { color: "#9CA3AF", fontSize: 13, fontWeight: "600" },
  chipTextSelected: { color: "#A5B4FC" },

  planCard: {
    backgroundColor: "#0B1220",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 14,
    marginBottom: 8,
  },
  planCardSelected: { borderColor: "#818CF8", backgroundColor: "#0E0B1F" },
  planTitle: { color: "#F9FAFB", fontSize: 15, fontWeight: "700" },
  planDate: { color: "#818CF8", fontSize: 12, marginTop: 3 },
  planMeta: { color: "#4B5563", fontSize: 11, marginTop: 2 },

  emptyText: { color: "#6B7280", fontSize: 13 },

  setlistHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  importAllBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#312E81",
    marginTop: 20,
  },
  importAllText: { color: "#A5B4FC", fontSize: 13, fontWeight: "700" },

  songCard: { marginBottom: 8 },
  songRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  songSeq: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "700",
    width: 20,
    textAlign: "right",
    paddingTop: 2,
  },
  songTitle: { color: "#F9FAFB", fontSize: 14, fontWeight: "700" },
  songArtist: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  songMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  songDur: { color: "#4B5563", fontSize: 11 },
  songNotes: { color: "#4B5563", fontSize: 11, marginTop: 4, lineHeight: 16 },

  importBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4338CA",
    backgroundColor: "#1E1B4B",
    minWidth: 60,
    alignItems: "center",
  },
  importBtnDone: { borderColor: "#14532D", backgroundColor: "#0D1B0D" },
  importBtnText: { color: "#A5B4FC", fontSize: 12, fontWeight: "700" },
  importBtnTextDone: { color: "#34D399" },

  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  pillText: { fontSize: 11, fontWeight: "700" },
});
