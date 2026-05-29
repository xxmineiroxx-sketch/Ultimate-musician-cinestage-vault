/**
 * WebhooksScreen — Manage outbound webhook integrations.
 *
 * Features:
 *   - List existing webhooks with status badge (green/red) + event count
 *   - Add webhook via modal (Name, URL, Events multi-select, optional Secret)
 *   - Pre-built templates: Slack, Discord
 *   - Swipe-to-delete (long-press delete button) or trash icon per row
 *   - "Test" button fires a synthetic ping and shows result toast
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Switch,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CINESTAGE_URL, syncHeaders } from "./config";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPPORTED_EVENTS = [
  { key: "service.published",   label: "Service Published",   icon: "📋" },
  { key: "assignment.sent",     label: "Assignment Sent",     icon: "📨" },
  { key: "assignment.accepted", label: "Assignment Accepted", icon: "✅" },
  { key: "assignment.declined", label: "Assignment Declined", icon: "❌" },
  { key: "song.added",          label: "Song Added",          icon: "🎵" },
  { key: "rehearsal.started",   label: "Rehearsal Started",   icon: "🎤" },
  { key: "plan.locked",         label: "Plan Locked",         icon: "🔒" },
];

const TEMPLATES = [
  {
    id: "slack",
    label: "Slack",
    icon: "💬",
    urlHint: "https://hooks.slack.com/services/…",
    defaultEvents: ["service.published", "assignment.sent", "assignment.declined", "plan.locked"],
    color: "#4A154B",
    textColor: "#fff",
  },
  {
    id: "discord",
    label: "Discord",
    icon: "🎮",
    urlHint: "https://discord.com/api/webhooks/…",
    defaultEvents: ["service.published", "assignment.sent", "song.added", "rehearsal.started"],
    color: "#5865F2",
    textColor: "#fff",
  },
  {
    id: "custom",
    label: "Custom",
    icon: "🔗",
    urlHint: "https://your-endpoint.example.com/hook",
    defaultEvents: ["service.published"],
    color: "#374151",
    textColor: "#E5E7EB",
  },
];

function generateSecret() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, success, visible }) {
  if (!visible) return null;
  return (
    <View
      style={[
        styles.toast,
        { backgroundColor: success ? "#065F46" : "#7F1D1D" },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function WebhooksScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userRole } = useAuth();

  // List state
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add modal state
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addEvents, setAddEvents] = useState(["service.published"]);
  const [addSecret, setAddSecret] = useState("");
  const [addTemplate, setAddTemplate] = useState(null);
  const [saving, setSaving] = useState(false);

  // Testing state: { [webhookId]: "loading" | "ok" | "fail" }
  const [testingMap, setTestingMap] = useState({});

  // Toast
  const [toast, setToast] = useState({ visible: false, message: "", success: true });
  const toastTimer = useRef(null);

  function showToast(message, success = true) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, message, success });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }

  // ── API calls ──────────────────────────────────────────────────────────────

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${CINESTAGE_URL}/api/webhooks`, {
        headers: syncHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWebhooks(data.webhooks || []);
    } catch (err) {
      setError("Could not load webhooks. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [fetchWebhooks]);

  async function handleSave() {
    const name   = addName.trim();
    const url    = addUrl.trim();
    const secret = addSecret.trim() || generateSecret();

    if (!name) { Alert.alert("Required", "Please enter a name."); return; }
    if (!url)  { Alert.alert("Required", "Please enter a URL."); return; }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      Alert.alert("Invalid URL", "URL must start with http:// or https://");
      return;
    }
    if (addEvents.length === 0) {
      Alert.alert("Required", "Select at least one event.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${CINESTAGE_URL}/api/webhooks`, {
        method: "POST",
        headers: { ...syncHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, events: addEvents, secret }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setShowAdd(false);
      resetAddForm();
      await fetchWebhooks();
      showToast("Webhook registered successfully.");
    } catch (err) {
      Alert.alert("Error", err.message || "Could not save webhook.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(wh) {
    Alert.alert(
      "Delete Webhook",
      `Remove "${wh.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${CINESTAGE_URL}/api/webhooks/${wh.id}`, {
                method: "DELETE",
                headers: syncHeaders(),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              setWebhooks((prev) => prev.filter((w) => w.id !== wh.id));
              showToast("Webhook deleted.");
            } catch {
              Alert.alert("Error", "Could not delete webhook.");
            }
          },
        },
      ],
    );
  }

  async function handleTest(wh) {
    setTestingMap((prev) => ({ ...prev, [wh.id]: "loading" }));
    try {
      const res = await fetch(`${CINESTAGE_URL}/api/webhooks/${wh.id}/test`, {
        method: "POST",
        headers: syncHeaders(),
      });
      const data = await res.json();
      const state = data.ok ? "ok" : "fail";
      setTestingMap((prev) => ({ ...prev, [wh.id]: state }));
      showToast(
        data.ok
          ? `Test sent! Server responded ${data.status}.`
          : `Test failed (${data.status || "timeout"}).`,
        data.ok,
      );
    } catch {
      setTestingMap((prev) => ({ ...prev, [wh.id]: "fail" }));
      showToast("Could not send test ping.", false);
    } finally {
      // Clear indicator after 4 s
      setTimeout(() => setTestingMap((prev) => {
        const next = { ...prev };
        delete next[wh.id];
        return next;
      }), 4000);
    }
  }

  // ── Form helpers ───────────────────────────────────────────────────────────

  function resetAddForm() {
    setAddName("");
    setAddUrl("");
    setAddEvents(["service.published"]);
    setAddSecret("");
    setAddTemplate(null);
  }

  function applyTemplate(tmpl) {
    setAddTemplate(tmpl.id);
    setAddUrl(tmpl.urlHint);
    setAddEvents([...tmpl.defaultEvents]);
    if (!addName || addName === addTemplate?.label) {
      setAddName(tmpl.label + " Notifications");
    }
  }

  function toggleEvent(eventKey) {
    setAddEvents((prev) =>
      prev.includes(eventKey) ? prev.filter((e) => e !== eventKey) : [...prev, eventKey],
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function truncateUrl(url) {
    if (!url) return "";
    try {
      const u = new URL(url);
      const host = u.hostname;
      const path = u.pathname.length > 20 ? "…" + u.pathname.slice(-16) : u.pathname;
      return host + path;
    } catch {
      return url.length > 40 ? url.slice(0, 37) + "…" : url;
    }
  }

  function statusBadge(wh) {
    const s = wh.lastStatus;
    if (s == null) return { color: "#374151", text: "Never fired" };
    if (s >= 200 && s < 300) return { color: "#065F46", text: `OK ${s}` };
    if (s === 0) return { color: "#7F1D1D", text: "Timeout" };
    return { color: "#7F1D1D", text: `Error ${s}` };
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // Admin access guard — only admins and leaders may view this screen
  if (userRole !== 'admin' && userRole !== 'leader') {
    return (
      <View style={{ flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#94A3B8', fontSize: 16 }}>Admin access required</Text>
        <Text style={{ color: '#64748B', fontSize: 13, marginTop: 8 }}>Contact your organization administrator</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Webhooks & Integrations</Text>
            <Text style={styles.headerSub}>Real-time notifications for your team</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => { resetAddForm(); setShowAdd(true); }}>
          <Text style={styles.addBtnText}>＋ Add Webhook</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#6366F1" size="large" />
          <Text style={styles.loadingText}>Loading webhooks…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchWebhooks}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : webhooks.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🔗</Text>
          <Text style={styles.emptyTitle}>No webhooks yet</Text>
          <Text style={styles.emptyText}>
            Connect Slack, Discord, or any HTTP endpoint to receive
            real-time notifications when events happen in your org.
          </Text>
          <TouchableOpacity style={styles.addBtnEmpty} onPress={() => { resetAddForm(); setShowAdd(true); }}>
            <Text style={styles.addBtnText}>＋ Add Your First Webhook</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {webhooks.map((wh) => {
            const badge   = statusBadge(wh);
            const testing = testingMap[wh.id];
            return (
              <View key={wh.id} style={styles.card}>
                {/* Top row */}
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{wh.name}</Text>
                    <Text style={styles.cardUrl}>{truncateUrl(wh.url)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: badge.color + "44", borderColor: badge.color + "88" }]}>
                    <Text style={[styles.statusBadgeText, { color: badge.color === "#065F46" ? "#6EE7B7" : "#FCA5A5" }]}>
                      {badge.text}
                    </Text>
                  </View>
                </View>

                {/* Events row */}
                <View style={styles.eventsRow}>
                  {(wh.events || []).map((ev) => {
                    const def = SUPPORTED_EVENTS.find((e) => e.key === ev);
                    return (
                      <View key={ev} style={styles.eventChip}>
                        <Text style={styles.eventChipText}>{def ? def.icon + " " + def.label : ev}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Action row */}
                <View style={styles.cardActions}>
                  <Text style={styles.cardMeta}>
                    {(wh.events || []).length} event{(wh.events || []).length !== 1 ? "s" : ""}
                    {wh.lastTriggeredAt
                      ? " · Last: " + new Date(wh.lastTriggeredAt).toLocaleDateString()
                      : " · Never triggered"}
                  </Text>
                  <View style={styles.cardBtns}>
                    <TouchableOpacity
                      style={[styles.testBtn, testing === "loading" && { opacity: 0.6 }]}
                      onPress={() => handleTest(wh)}
                      disabled={testing === "loading"}
                    >
                      {testing === "loading" ? (
                        <ActivityIndicator color="#A5B4FC" size="small" />
                      ) : (
                        <Text style={styles.testBtnText}>
                          {testing === "ok" ? "✓ Sent" : testing === "fail" ? "✗ Failed" : "Test"}
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(wh)}>
                      <Text style={styles.deleteBtnText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* Toast */}
      <Toast message={toast.message} success={toast.success} visible={toast.visible} />

      {/* Add Webhook Modal */}
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Webhook</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Templates */}
              <Text style={styles.sectionLabel}>Quick Templates</Text>
              <View style={styles.templatesRow}>
                {TEMPLATES.map((tmpl) => (
                  <TouchableOpacity
                    key={tmpl.id}
                    style={[
                      styles.templateBtn,
                      { backgroundColor: tmpl.color },
                      addTemplate === tmpl.id && styles.templateBtnActive,
                    ]}
                    onPress={() => applyTemplate(tmpl)}
                  >
                    <Text style={styles.templateBtnIcon}>{tmpl.icon}</Text>
                    <Text style={[styles.templateBtnLabel, { color: tmpl.textColor }]}>{tmpl.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Name */}
              <Text style={styles.modalLabel}>Name *</Text>
              <TextInput
                style={styles.modalInput}
                value={addName}
                onChangeText={setAddName}
                placeholder="e.g. Slack #worship-team"
                placeholderTextColor="#4B5563"
                autoCorrect={false}
              />

              {/* URL */}
              <Text style={styles.modalLabel}>Webhook URL *</Text>
              <TextInput
                style={styles.modalInput}
                value={addUrl}
                onChangeText={setAddUrl}
                placeholder="https://hooks.slack.com/services/…"
                placeholderTextColor="#4B5563"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              {/* Events */}
              <Text style={styles.modalLabel}>Events *</Text>
              {SUPPORTED_EVENTS.map((ev) => {
                const selected = addEvents.includes(ev.key);
                return (
                  <TouchableOpacity
                    key={ev.key}
                    style={[styles.eventRow, selected && styles.eventRowSelected]}
                    onPress={() => toggleEvent(ev.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.eventRowIcon}>{ev.icon}</Text>
                    <Text style={[styles.eventRowLabel, selected && { color: "#A5B4FC" }]}>
                      {ev.label}
                    </Text>
                    <View style={[styles.eventCheck, selected && styles.eventCheckSelected]}>
                      {selected && <Text style={styles.eventCheckMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Secret */}
              <Text style={styles.modalLabel}>Signing Secret (optional)</Text>
              <View style={styles.secretRow}>
                <TextInput
                  style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                  value={addSecret}
                  onChangeText={setAddSecret}
                  placeholder="Auto-generated if blank"
                  placeholderTextColor="#4B5563"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={false}
                />
                <TouchableOpacity
                  style={styles.genSecretBtn}
                  onPress={() => setAddSecret(generateSecret())}
                >
                  <Text style={styles.genSecretBtnText}>Generate</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.secretHint}>
                Used to verify X-Signature on incoming deliveries (HMAC-SHA256).
              </Text>

              {/* Save */}
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Webhook</Text>
                )}
              </TouchableOpacity>

              <View style={{ height: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#020617" },

  // Header
  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1E293B" },
  headerLeft:  { flexDirection: "row", alignItems: "center", flex: 1 },
  backBtn:     { marginRight: 12, padding: 4 },
  backBtnText: { color: "#A5B4FC", fontSize: 28, lineHeight: 30, fontWeight: "300" },
  headerTitle: { color: "#F9FAFB", fontSize: 18, fontWeight: "700" },
  headerSub:   { color: "#6B7280", fontSize: 12, marginTop: 1 },
  addBtn:      { backgroundColor: "#4F46E5", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnEmpty: { backgroundColor: "#4F46E5", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, marginTop: 16 },
  addBtnText:  { color: "#fff", fontWeight: "700", fontSize: 14 },

  // States
  centered:    { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { color: "#6B7280", marginTop: 12, fontSize: 14 },
  errorIcon:   { fontSize: 36, marginBottom: 8 },
  errorText:   { color: "#F87171", textAlign: "center", fontSize: 14 },
  retryBtn:    { marginTop: 12, backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  retryBtnText:{ color: "#A5B4FC", fontWeight: "600" },
  emptyIcon:   { fontSize: 48, marginBottom: 12 },
  emptyTitle:  { color: "#F9FAFB", fontSize: 20, fontWeight: "700", marginBottom: 8 },
  emptyText:   { color: "#6B7280", textAlign: "center", fontSize: 14, lineHeight: 20, maxWidth: 300 },

  // List
  list:        { padding: 16 },

  // Card
  card:        { backgroundColor: "#0F172A", borderRadius: 12, borderWidth: 1, borderColor: "#1E293B", marginBottom: 12, padding: 16 },
  cardTop:     { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  cardName:    { color: "#F9FAFB", fontSize: 16, fontWeight: "700", marginBottom: 2 },
  cardUrl:     { color: "#6366F1", fontSize: 12 },
  statusBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  statusBadgeText: { fontSize: 11, fontWeight: "600" },
  eventsRow:   { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  eventChip:   { backgroundColor: "#1E293B", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  eventChipText:{ color: "#94A3B8", fontSize: 11 },
  cardActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardMeta:    { color: "#4B5563", fontSize: 12 },
  cardBtns:    { flexDirection: "row", gap: 8 },
  testBtn:     { backgroundColor: "#312E81", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, minWidth: 60, alignItems: "center" },
  testBtnText: { color: "#A5B4FC", fontWeight: "600", fontSize: 13 },
  deleteBtn:   { backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  deleteBtnText:{ fontSize: 16 },

  // Toast
  toast:       { position: "absolute", bottom: 40, left: 24, right: 24, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" },
  toastText:   { color: "#fff", fontWeight: "600", fontSize: 14 },

  // Modal
  modalOverlay:{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalBox:    { backgroundColor: "#0F172A", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle:  { color: "#F9FAFB", fontSize: 20, fontWeight: "700" },
  modalCloseBtn:{ padding: 6 },
  modalCloseBtnText:{ color: "#6B7280", fontSize: 20 },
  sectionLabel:{ color: "#6B7280", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  modalLabel:  { color: "#9CA3AF", fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 14 },
  modalInput:  { backgroundColor: "#1E293B", color: "#F9FAFB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: "#374151", marginBottom: 4 },

  // Templates
  templatesRow:{ flexDirection: "row", gap: 10, marginBottom: 4 },
  templateBtn: { flex: 1, borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 2, borderColor: "transparent" },
  templateBtnActive:{ borderColor: "#A5B4FC" },
  templateBtnIcon:{ fontSize: 20, marginBottom: 3 },
  templateBtnLabel:{ fontSize: 12, fontWeight: "600" },

  // Events
  eventRow:    { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4, backgroundColor: "#1E293B" },
  eventRowSelected:{ backgroundColor: "#1E1B4B", borderWidth: 1, borderColor: "#4338CA" },
  eventRowIcon:{ fontSize: 18, marginRight: 10 },
  eventRowLabel:{ flex: 1, color: "#94A3B8", fontSize: 14 },
  eventCheck:  { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#374151", alignItems: "center", justifyContent: "center" },
  eventCheckSelected:{ backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  eventCheckMark:{ color: "#fff", fontSize: 12, fontWeight: "700" },

  // Secret
  secretRow:   { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  genSecretBtn:{ backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  genSecretBtnText:{ color: "#A5B4FC", fontSize: 13, fontWeight: "600" },
  secretHint:  { color: "#4B5563", fontSize: 11, marginBottom: 4 },

  // Save
  saveBtn:     { backgroundColor: "#4F46E5", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
