/**
 * Message Center Screen - Ultimate Musician
 * Admin inbox + compose (send to all team or individual) + Cross-Branch Network messaging.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";

import { SYNC_URL, syncHeaders } from "./config";
const DEFAULT_ADMIN_NAME = "Admin";

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

function getTimeAgo(timestamp) {
  if (!timestamp) return "";
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return "Just now";
}

const ROLE_COLORS = { admin: "#F59E0B", worship_leader: "#8B5CF6" };
const ROLE_LABELS = { admin: "Admin", worship_leader: "Worship Leader" };

export default function MessageCenterScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState("inbox"); // 'inbox' | 'network'

  // ── Inbox tab state ──────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serverError, setServerError] = useState(null);

  // ── Compose (admin → team) state ─────────────────────────────────────────
  const [showCompose, setShowCompose] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeTo, setComposeTo] = useState("all_team"); // 'all_team' | email string
  const [composeToName, setComposeToName] = useState("All Team");
  const [people, setPeople] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // ── Network tab state ────────────────────────────────────────────────────
  const [directory, setDirectory] = useState([]);
  const [xMessages, setXMessages] = useState([]);
  const [xLoading, setXLoading] = useState(false);
  const [selectedXMsg, setSelectedXMsg] = useState(null);
  const [xReply, setXReply] = useState("");
  const [xSending, setXSending] = useState(false);
  const [showXCompose, setShowXCompose] = useState(false);
  const [xComposeTo, setXComposeTo] = useState(null);
  const [xSubject, setXSubject] = useState("");
  const [xBody, setXBody] = useState("");
  const [networkError, setNetworkError] = useState(null);

  useEffect(() => {
    loadMessages();
  }, []);

  // ── Inbox ────────────────────────────────────────────────────────────────

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setServerError(null);
    try {
      const data = await fetchJson(`${SYNC_URL}/sync/messages/admin`, {
        headers: syncHeaders(),
      });
      setMessages(Array.isArray(data) ? data : []);
    } catch (e) {
      setServerError(e.message || "Server unreachable");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleReply = async () => {
    if (!replyText.trim()) {
      Alert.alert("Empty", "Type a reply first.");
      return;
    }
    setSending(true);
    try {
      const email = (await AsyncStorage.getItem("@user_email")) || "";
      const name = (await AsyncStorage.getItem("@user_name")) || DEFAULT_ADMIN_NAME;
      await fetchJson(
        `${SYNC_URL}/sync/message/reply?messageId=${encodeURIComponent(selected.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...syncHeaders() },
          body: JSON.stringify({
            from: name || DEFAULT_ADMIN_NAME,
            message: replyText.trim(),
          }),
        },
      );
      setReplyText("");
      Alert.alert("Sent ✓", "Reply delivered.");
      await loadMessages();
      setSelected((prev) => {
        const updated = messages.find((m) => m.id === prev?.id);
        return updated || prev;
      });
    } catch (e) {
      Alert.alert("Error", `Could not send reply: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const deleteSelectedMessage = useCallback(async () => {
    if (!selected?.id) return;
    setDeleting(true);
    try {
      await fetchJson(
        `${SYNC_URL}/sync/message?messageId=${encodeURIComponent(selected.id)}&scope=global`,
        {
          method: "DELETE",
          headers: syncHeaders(),
        },
      );
      setSelected(null);
      await loadMessages();
    } catch (e) {
      Alert.alert("Error", `Could not delete message: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  }, [loadMessages, selected]);

  const confirmDeleteSelectedMessage = useCallback(() => {
    if (!selected?.id) return;
    Alert.alert(
      "Delete message thread?",
      "This removes the thread from the shared admin inbox in Ultimate Musician and Ultimate Playback.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteSelectedMessage();
          },
        },
      ],
    );
  }, [deleteSelectedMessage, selected]);

  const deleteInboxMessage = useCallback(async (message) => {
    if (!message?.id) return;
    setDeleting(true);
    try {
      await fetchJson(
        `${SYNC_URL}/sync/message?messageId=${encodeURIComponent(message.id)}&scope=global`,
        {
          method: "DELETE",
          headers: syncHeaders(),
        },
      );
      if (selected?.id === message.id) setSelected(null);
      await loadMessages();
    } catch (e) {
      Alert.alert("Error", `Could not delete message: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  }, [loadMessages, selected?.id]);

  const confirmDeleteInboxMessage = useCallback((message) => {
    if (!message?.id) return;
    Alert.alert(
      "Delete message thread?",
      "This removes the thread from the shared admin inbox in Ultimate Musician and Ultimate Playback.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteInboxMessage(message);
          },
        },
      ],
    );
  }, [deleteInboxMessage]);

  const refreshAndReselect = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson(`${SYNC_URL}/sync/messages/admin`, {
        headers: syncHeaders(),
      });
      const arr = Array.isArray(data) ? data : [];
      setMessages(arr);
      if (selected) {
        const r = arr.find((m) => m.id === selected.id);
        if (r) setSelected(r);
      }
    } catch (e) {
      setServerError(e.message || "Server unreachable");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  // ── Compose (admin → team) ────────────────────────────────────────────────

  const loadPeople = useCallback(async () => {
    try {
      const data = await fetchJson(`${SYNC_URL}/sync/library-pull`, { headers: syncHeaders() });
      setPeople(Array.isArray(data?.people) ? data.people : []);
    } catch (_) {}
  }, []);

  const openCompose = useCallback(async () => {
    setComposeSubject("");
    setComposeBody("");
    setComposeTo("all_team");
    setComposeToName("All Team");
    setShowCompose(true);
    loadPeople();
  }, [loadPeople]);

  const handleComposeSend = async () => {
    if (!composeSubject.trim() || !composeBody.trim()) {
      Alert.alert("Required", "Enter both subject and message.");
      return;
    }
    setSending(true);
    try {
      const fromEmail = (await AsyncStorage.getItem("@user_email")) || "";
      const fromName = (await AsyncStorage.getItem("@user_name")) || DEFAULT_ADMIN_NAME;
      await fetchJson(`${SYNC_URL}/sync/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...syncHeaders() },
        body: JSON.stringify({
          fromEmail,
          fromName: fromName || DEFAULT_ADMIN_NAME,
          subject: composeSubject.trim(),
          message: composeBody.trim(),
          to: composeTo,
        }),
      });
      setShowCompose(false);
      Alert.alert(
        "Sent ✓",
        composeTo === "all_team"
          ? `Message broadcast to all team members.`
          : `Message sent to ${composeToName}.`
      );
      loadMessages();
    } catch (e) {
      Alert.alert("Error", `Could not send: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  // ── Network ──────────────────────────────────────────────────────────────

  const loadNetwork = useCallback(async () => {
    setXLoading(true);
    setNetworkError(null);
    try {
      const email = (await AsyncStorage.getItem("@user_email")) || "";
      const [dir, msgs] = await Promise.all([
        fetchJson(`${SYNC_URL}/sync/xdirectory`, { headers: syncHeaders() }),
        email
          ? fetchJson(
              `${SYNC_URL}/sync/xmessages?email=${encodeURIComponent(email)}`,
              { headers: syncHeaders() },
            )
          : Promise.resolve([]),
      ]);
      setDirectory(Array.isArray(dir) ? dir : []);
      setXMessages(Array.isArray(msgs) ? msgs : []);
    } catch (e) {
      setNetworkError(e.message || "Network unavailable");
    } finally {
      setXLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "network") loadNetwork();
  }, [activeTab]);

  const sendXMessage = async () => {
    if (!xSubject.trim() || !xBody.trim()) {
      Alert.alert("Required", "Enter subject and message.");
      return;
    }
    setXSending(true);
    try {
      const email = (await AsyncStorage.getItem("@user_email")) || "";
      const name = (await AsyncStorage.getItem("@user_name")) || email;
      await fetchJson(`${SYNC_URL}/sync/xmessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...syncHeaders() },
        body: JSON.stringify({
          fromEmail: email,
          fromName: name,
          toEmail: xComposeTo.email,
          subject: xSubject.trim(),
          message: xBody.trim(),
        }),
      });
      setShowXCompose(false);
      setXSubject("");
      setXBody("");
      setXComposeTo(null);
      Alert.alert("Sent ✓", `Message sent to ${xComposeTo.name}.`);
      loadNetwork();
    } catch (e) {
      Alert.alert("Error", "Could not send message: " + e.message);
    } finally {
      setXSending(false);
    }
  };

  const sendXReply = async () => {
    if (!xReply.trim()) {
      Alert.alert("Empty", "Type a reply first.");
      return;
    }
    setXSending(true);
    try {
      const email = (await AsyncStorage.getItem("@user_email")) || "";
      const name = (await AsyncStorage.getItem("@user_name")) || email;
      await fetchJson(
        `${SYNC_URL}/sync/xmessage/reply?messageId=${encodeURIComponent(selectedXMsg.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...syncHeaders() },
          body: JSON.stringify({
            fromEmail: email,
            fromName: name,
            message: xReply.trim(),
          }),
        },
      );
      setXReply("");
      loadNetwork();
    } catch (e) {
      Alert.alert("Error", "Could not send reply: " + e.message);
    } finally {
      setXSending(false);
    }
  };

  const unreadCount = messages.filter((m) => !m.read).length;

  // ── Recipient picker ──────────────────────────────────────────────────────

  if (showPicker) {
    const filtered = people.filter(p =>
      !pickerSearch ||
      (p.name || '').toLowerCase().includes(pickerSearch.toLowerCase()) ||
      (p.email || '').toLowerCase().includes(pickerSearch.toLowerCase())
    );
    return (
      <View style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => setShowPicker(false)}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle}>Choose Recipient</Text>
          <View style={{ width: 60 }} />
        </View>
        <TextInput
          style={s.pickerSearch}
          value={pickerSearch}
          onChangeText={setPickerSearch}
          placeholder="Search team..."
          placeholderTextColor="#6B7280"
          autoFocus
        />
        <ScrollView style={{ flex: 1 }}>
          {/* All Team option */}
          <TouchableOpacity
            style={[s.pickerItem, composeTo === 'all_team' && s.pickerItemActive]}
            onPress={() => { setComposeTo('all_team'); setComposeToName('All Team'); setShowPicker(false); }}
          >
            <Text style={s.pickerItemIcon}>👥</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.pickerItemName}>All Team</Text>
              <Text style={s.pickerItemSub}>Broadcast to everyone</Text>
            </View>
            {composeTo === 'all_team' && <Text style={s.checkmark}>✓</Text>}
          </TouchableOpacity>
          {filtered.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[s.pickerItem, composeTo === p.email && s.pickerItemActive]}
              onPress={() => { setComposeTo(p.email || p.id); setComposeToName(p.name); setShowPicker(false); }}
            >
              <View style={s.pickerAvatar}>
                <Text style={s.pickerAvatarText}>{(p.name || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pickerItemName}>{p.name}</Text>
                {p.email ? <Text style={s.pickerItemSub}>{p.email}</Text> : null}
              </View>
              {composeTo === p.email && <Text style={s.checkmark}>✓</Text>}
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && (
            <Text style={s.pickerEmpty}>No team members found.</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Compose view ─────────────────────────────────────────────────────────

  if (showCompose) {
    return (
      <View style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => setShowCompose(false)}>
            <Text style={s.backText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle}>New Message</Text>
          <TouchableOpacity onPress={handleComposeSend} disabled={sending}>
            {sending
              ? <ActivityIndicator size="small" color="#8B5CF6" />
              : <Text style={s.refreshText}>Send</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView style={s.threadBody} keyboardShouldPersistTaps="handled">
          {/* To: row */}
          <TouchableOpacity style={s.toRow} onPress={() => setShowPicker(true)}>
            <Text style={s.toLabel}>To:</Text>
            <View style={[s.toChip, { flex: 1 }]}>
              <Text style={s.toChipText}>
                {composeTo === 'all_team' ? '👥 All Team' : `👤 ${composeToName}`}
              </Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>

          <TextInput
            style={s.composeSubject}
            value={composeSubject}
            onChangeText={setComposeSubject}
            placeholder="Subject"
            placeholderTextColor="#6B7280"
            autoFocus
          />
          <TextInput
            style={s.composeBody}
            value={composeBody}
            onChangeText={setComposeBody}
            placeholder="Write your message..."
            placeholderTextColor="#6B7280"
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
      </View>
    );
  }

  // ── Thread detail (inbox) ────────────────────────────────────────────────

  if (selected && activeTab === "inbox") {
    return (
      <View style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity
            onPress={() => {
              setSelected(null);
              setReplyText("");
            }}
          >
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle} numberOfLines={1}>
            {selected.subject}
          </Text>
          <View style={s.threadActions}>
            <TouchableOpacity onPress={refreshAndReselect}>
              <Text style={s.refreshText}>⟳</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmDeleteSelectedMessage}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Text style={s.deleteActionText}>Delete</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView style={s.threadBody} keyboardShouldPersistTaps="handled">
          <View style={s.senderInfo}>
            <Text style={s.senderName}>
              👤 {selected.fromName || selected.fromEmail || 'Team Member'}
            </Text>
            {selected.fromEmail ? <Text style={s.senderEmail}>{selected.fromEmail}</Text> : null}
            <Text style={s.senderTime}>{getTimeAgo(selected.timestamp)}</Text>
            {selected.to === 'all_team' && (
              <View style={s.broadcastBadge}>
                <Text style={s.broadcastBadgeText}>📣 Broadcast to all team</Text>
              </View>
            )}
            {selected.to && selected.to !== 'admin' && selected.to !== 'all_team' && (
              <View style={s.directBadge}>
                <Text style={s.directBadgeText}>→ Direct message</Text>
              </View>
            )}
          </View>
          <View style={s.bubble}>
            <Text style={s.bubbleText}>{selected.message}</Text>
          </View>
          {(selected.replies || []).length > 0 && (
            <View style={s.repliesSection}>
              <Text style={s.repliesSectionTitle}>Replies</Text>
              {selected.replies.map((r) => (
                <View key={r.id} style={s.adminBubble}>
                  <View style={s.adminBubbleHeader}>
                    <Text style={s.adminBubbleName}>👤 {r.from}</Text>
                    <Text style={s.adminBubbleTime}>
                      {getTimeAgo(r.timestamp)}
                    </Text>
                  </View>
                  <Text style={s.adminBubbleText}>{r.message}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={s.replyBox}>
            <Text style={s.replyBoxLabel}>Reply</Text>
            <TextInput
              style={s.replyInput}
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Type your reply..."
              placeholderTextColor="#6B7280"
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[s.replyBtn, sending && s.replyBtnDisabled]}
              onPress={handleReply}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={s.replyBtnText}>↩ Send Reply</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Cross-branch thread detail ────────────────────────────────────────────

  if (selectedXMsg && activeTab === "network") {
    return (
      <View style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity
            onPress={() => {
              setSelectedXMsg(null);
              setXReply("");
            }}
          >
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle} numberOfLines={1}>
            {selectedXMsg.subject}
          </Text>
          <TouchableOpacity onPress={loadNetwork}>
            <Text style={s.refreshText}>⟳</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={s.threadBody} keyboardShouldPersistTaps="handled">
          <View style={s.senderInfo}>
            <Text style={s.senderName}>
              👤 {selectedXMsg.fromName || selectedXMsg.fromEmail}
            </Text>
            <Text style={s.senderEmail}>{selectedXMsg.fromEmail}</Text>
            <Text style={s.senderTime}>
              {getTimeAgo(selectedXMsg.timestamp)}
            </Text>
          </View>
          <View style={s.bubble}>
            <Text style={s.bubbleText}>{selectedXMsg.message}</Text>
          </View>
          {(selectedXMsg.replies || []).length > 0 && (
            <View style={s.repliesSection}>
              <Text style={s.repliesSectionTitle}>Replies</Text>
              {selectedXMsg.replies.map((r) => (
                <View key={r.id} style={s.adminBubble}>
                  <View style={s.adminBubbleHeader}>
                    <Text style={s.adminBubbleName}>
                      👤 {r.fromName || r.fromEmail}
                    </Text>
                    <Text style={s.adminBubbleTime}>
                      {getTimeAgo(r.timestamp)}
                    </Text>
                  </View>
                  <Text style={s.adminBubbleText}>{r.message}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={s.replyBox}>
            <Text style={s.replyBoxLabel}>Your Reply</Text>
            <TextInput
              style={s.replyInput}
              value={xReply}
              onChangeText={setXReply}
              placeholder="Type your reply..."
              placeholderTextColor="#6B7280"
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[s.replyBtn, xSending && s.replyBtnDisabled]}
              onPress={sendXReply}
              disabled={xSending}
            >
              {xSending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={s.replyBtnText}>↩ Send Reply</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Compose cross-branch message ─────────────────────────────────────────

  if (showXCompose && activeTab === "network") {
    return (
      <View style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity
            onPress={() => {
              setShowXCompose(false);
              setXComposeTo(null);
            }}
          >
            <Text style={s.backText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle}>New Network Message</Text>
          <TouchableOpacity onPress={sendXMessage} disabled={xSending}>
            <Text
              style={[
                s.refreshText,
                { color: xSending ? "#4B5563" : "#4F46E5" },
              ]}
            >
              {xSending ? "…" : "Send"}
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={s.threadBody} keyboardShouldPersistTaps="handled">
          {xComposeTo && (
            <View style={s.composeToRow}>
              <Text style={s.composeToLabel}>To:</Text>
              <View style={s.composeToChip}>
                <Text style={s.composeToName}>{xComposeTo.name}</Text>
                <Text style={s.composeToMeta}>
                  {ROLE_LABELS[xComposeTo.role] || xComposeTo.role} ·{" "}
                  {xComposeTo.branchName}
                  {xComposeTo.branchCity ? ` (${xComposeTo.branchCity})` : ""}
                </Text>
              </View>
            </View>
          )}
          <TextInput
            style={s.composeSubject}
            value={xSubject}
            onChangeText={setXSubject}
            placeholder="Subject"
            placeholderTextColor="#6B7280"
          />
          <TextInput
            style={s.composeBody}
            value={xBody}
            onChangeText={setXBody}
            placeholder="Message…"
            placeholderTextColor="#6B7280"
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
      </View>
    );
  }

  // ── Main screen (tabs) ────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      {/* Tab bar */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tab, activeTab === "inbox" && s.tabActive]}
          onPress={() => setActiveTab("inbox")}
        >
          <Text style={[s.tabText, activeTab === "inbox" && s.tabTextActive]}>
            📥 Inbox{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === "network" && s.tabActive]}
          onPress={() => setActiveTab("network")}
        >
          <Text style={[s.tabText, activeTab === "network" && s.tabTextActive]}>
            🌐 Network
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── INBOX tab ── */}
      {activeTab === "inbox" && (
        <>
          <View style={s.header}>
            <View style={s.headerRow}>
              <Text style={s.title}>Messages</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={loadMessages} style={s.refreshBtn}>
                  <Text style={s.refreshBtnText}>⟳</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={openCompose} style={s.composeBtn}>
                  <Text style={s.composeBtnText}>✉️ New</Text>
                </TouchableOpacity>
              </View>
            </View>
            {serverError && (
              <View style={s.errorBanner}>
                <Text style={s.errorText}>⚠️ {serverError}</Text>
              </View>
            )}
          </View>
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={loadMessages}
                tintColor="#8B5CF6"
              />
            }
            contentContainerStyle={s.list}
            renderItem={({ item }) => {
              const hasReplies = (item.replies || []).length > 0;
              // fromName/fromEmail (CF camelCase) — fix from previous snake_case
              const senderLabel = item.fromName || item.fromEmail || 'Team Member';
              const isBroadcast = item.to === 'all_team';
              const isDirect = item.to && item.to !== 'admin' && item.to !== 'all_team';
              return (
                <TouchableOpacity
                  style={[s.card, !item.read && s.cardUnread]}
                  onPress={() => setSelected(item)}
                  onLongPress={() => confirmDeleteInboxMessage(item)}
                  delayLongPress={250}
                >
                  <View style={s.cardHeader}>
                    <View style={s.cardFromRow}>
                      {!item.read && <View style={s.unreadDot} />}
                      <Text style={s.cardFrom}>{senderLabel}</Text>
                      {isBroadcast && (
                        <View style={s.broadcastPill}>
                          <Text style={s.broadcastPillText}>📣 All</Text>
                        </View>
                      )}
                      {isDirect && (
                        <View style={s.directPill}>
                          <Text style={s.directPillText}>→ Direct</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.cardTime}>{getTimeAgo(item.timestamp)}</Text>
                  </View>
                  <Text style={s.cardSubject}>{item.subject}</Text>
                  <Text style={s.cardPreview} numberOfLines={2}>
                    {item.message}
                  </Text>
                  {hasReplies ? (
                    <View style={s.repliedBadge}>
                      <Text style={s.repliedBadgeText}>
                        ✓ {item.replies.length} repl
                        {item.replies.length > 1 ? "ies" : "y"} sent
                      </Text>
                    </View>
                  ) : (
                    <View style={s.awaitingBadge}>
                      <Text style={s.awaitingBadgeText}>💬 Awaiting reply</Text>
                    </View>
                  )}
                  <Text style={s.cardHint}>Long press to delete</Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyIcon}>{loading ? "⏳" : "📭"}</Text>
                <Text style={s.emptyTitle}>
                  {loading ? "Loading…" : "No Messages"}
                </Text>
                <Text style={s.emptyText}>
                  {loading
                    ? "Fetching messages…"
                    : "When team members send messages from Ultimate Playback, they appear here.\n\nTap ✉️ New to message your team.\nPull down to refresh."}
                </Text>
              </View>
            }
          />
        </>
      )}

      {/* ── NETWORK tab ── */}
      {activeTab === "network" && (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={xLoading}
              onRefresh={loadNetwork}
              tintColor="#4F46E5"
            />
          }
          contentContainerStyle={s.list}
        >
          {/* Section header */}
          <View style={s.networkSectionHeader}>
            <Text style={s.networkSectionTitle}>Network Directory</Text>
            <Text style={s.networkSectionSub}>
              Admins & Worship Leaders across your organization
            </Text>
          </View>

          {networkError && (
            <View style={s.errorBanner}>
              <Text style={s.errorText}>
                ⚠️ {networkError}
              </Text>
            </View>
          )}

          {/* Directory */}
          {directory.length === 0 && !xLoading && !networkError && (
            <View style={[s.empty, { paddingVertical: 24 }]}>
              <Text style={s.emptyIcon}>🌐</Text>
              <Text style={s.emptyTitle}>No Network Contacts</Text>
              <Text style={s.emptyText}>
                This branch is not yet connected to a parent organization, or no
                other branches have admins/worship leaders assigned.
              </Text>
            </View>
          )}

          {directory.map((contact) => (
            <TouchableOpacity
              key={contact.email}
              style={s.contactCard}
              onPress={() => {
                setXComposeTo(contact);
                setShowXCompose(true);
              }}
            >
              <View style={s.contactRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.contactName}>{contact.name}</Text>
                  <Text style={s.contactBranch}>
                    {contact.branchName}
                    {contact.branchCity ? ` · ${contact.branchCity}` : ""}
                  </Text>
                </View>
                <View
                  style={[
                    s.roleBadge,
                    {
                      backgroundColor:
                        (ROLE_COLORS[contact.role] || "#4B5563") + "25",
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.roleBadgeText,
                      { color: ROLE_COLORS[contact.role] || "#9CA3AF" },
                    ]}
                  >
                    {ROLE_LABELS[contact.role] || contact.role}
                  </Text>
                </View>
              </View>
              <Text style={s.contactEmail}>{contact.email}</Text>
              <Text style={s.composeHint}>✉️ Tap to message</Text>
            </TouchableOpacity>
          ))}

          {/* Cross-branch messages */}
          {xMessages.length > 0 && (
            <>
              <View style={[s.networkSectionHeader, { marginTop: 20 }]}>
                <Text style={s.networkSectionTitle}>Messages</Text>
              </View>
              {xMessages.map((msg) => (
                <TouchableOpacity
                  key={msg.id}
                  style={s.card}
                  onPress={() => setSelectedXMsg(msg)}
                >
                  <View style={s.cardHeader}>
                    <Text style={s.cardFrom}>
                      {msg.fromName || msg.fromEmail}
                    </Text>
                    <Text style={s.cardTime}>{getTimeAgo(msg.timestamp)}</Text>
                  </View>
                  <Text style={s.cardSubject}>{msg.subject}</Text>
                  <Text style={s.cardPreview} numberOfLines={2}>
                    {msg.message}
                  </Text>
                  {(msg.replies || []).length > 0 ? (
                    <View style={s.repliedBadge}>
                      <Text style={s.repliedBadgeText}>
                        💬 {msg.replies.length} repl
                        {msg.replies.length > 1 ? "ies" : "y"}
                      </Text>
                    </View>
                  ) : (
                    <View style={s.awaitingBadge}>
                      <Text style={s.awaitingBadgeText}>💬 No replies yet</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },

  // Tabs
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
    backgroundColor: "#020617",
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#8B5CF6" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  tabTextActive: { color: "#8B5CF6" },

  // Header (inbox)
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: "#1F2937" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 28, fontWeight: "700", color: "#F9FAFB" },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#1F2937",
    borderRadius: 8,
  },
  refreshBtnText: { fontSize: 16, color: "#8B5CF6", fontWeight: "600" },
  composeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#7C3AED",
    borderRadius: 8,
  },
  composeBtnText: { fontSize: 14, color: "#FFF", fontWeight: "700" },
  errorBanner: {
    backgroundColor: "#7C2D1220",
    borderWidth: 1,
    borderColor: "#F97316",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  errorText: { fontSize: 12, color: "#F97316" },

  // List
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  card: {
    padding: 16,
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    marginBottom: 12,
  },
  cardUnread: { borderColor: "#8B5CF6", backgroundColor: "#0D0B1E" },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardFromRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#8B5CF6",
  },
  cardFrom: { fontSize: 14, fontWeight: "600", color: "#E5E7EB" },
  cardTime: { fontSize: 11, color: "#6B7280" },
  cardSubject: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F9FAFB",
    marginBottom: 4,
  },
  cardPreview: {
    fontSize: 13,
    color: "#9CA3AF",
    lineHeight: 20,
    marginBottom: 10,
  },
  broadcastPill: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#064E3B', borderRadius: 8, borderWidth: 1, borderColor: '#10B981' },
  broadcastPillText: { fontSize: 10, fontWeight: '700', color: '#34D399' },
  directPill: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#1E1B4B', borderRadius: 8, borderWidth: 1, borderColor: '#4F46E5' },
  directPillText: { fontSize: 10, fontWeight: '700', color: '#818CF8' },
  repliedBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#14532D20",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#22C55E",
  },
  repliedBadgeText: { fontSize: 12, fontWeight: "600", color: "#4ADE80" },
  awaitingBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#1F2937",
    borderRadius: 12,
  },
  awaitingBadgeText: { fontSize: 12, color: "#6B7280" },
  cardHint: { fontSize: 11, color: "#4B5563", marginTop: 8 },

  // Empty
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#F9FAFB",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 30,
  },

  // Top bar (thread/compose)
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
    backgroundColor: "#0A0A1A",
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F9FAFB",
    flex: 1,
    textAlign: "center",
  },
  backText: { fontSize: 15, color: "#8B5CF6", fontWeight: "600", minWidth: 60 },
  threadActions: {
    minWidth: 110,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
  },
  refreshText: {
    fontSize: 15,
    color: "#8B5CF6",
    minWidth: 40,
    textAlign: "right",
    fontWeight: "700",
  },
  deleteActionText: {
    fontSize: 14,
    color: "#F87171",
    fontWeight: "700",
    minWidth: 52,
    textAlign: "right",
  },
  chevron: { fontSize: 20, color: "#6B7280", marginLeft: 8 },

  // Thread body
  threadBody: { flex: 1, padding: 16 },
  senderInfo: { marginBottom: 12 },
  senderName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F9FAFB",
    marginBottom: 2,
  },
  senderEmail: { fontSize: 13, color: "#6B7280", marginBottom: 2 },
  senderTime: { fontSize: 12, color: "#4B5563", marginBottom: 4 },
  broadcastBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#064E3B20', borderRadius: 8, borderWidth: 1, borderColor: '#10B981', marginTop: 4 },
  broadcastBadgeText: { fontSize: 11, color: '#34D399', fontWeight: '600' },
  directBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#1E1B4B', borderRadius: 8, borderWidth: 1, borderColor: '#4F46E5', marginTop: 4 },
  directBadgeText: { fontSize: 11, color: '#818CF8', fontWeight: '600' },
  bubble: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    padding: 16,
    marginBottom: 20,
  },
  bubbleText: { fontSize: 15, color: "#E5E7EB", lineHeight: 24 },

  // Replies
  repliesSection: { marginBottom: 20 },
  repliesSectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  adminBubble: {
    backgroundColor: "#1E1B4B",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4F46E5",
    padding: 14,
    marginBottom: 10,
  },
  adminBubbleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  adminBubbleName: { fontSize: 13, fontWeight: "700", color: "#818CF8" },
  adminBubbleTime: { fontSize: 11, color: "#6B7280" },
  adminBubbleText: { fontSize: 15, color: "#E5E7EB", lineHeight: 22 },

  // Reply box
  replyBox: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    padding: 16,
    marginBottom: 40,
  },
  replyBoxLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  replyInput: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#F9FAFB",
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  replyBtn: {
    backgroundColor: "#8B5CF6",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  replyBtnDisabled: { opacity: 0.6 },
  replyBtnText: { fontSize: 15, fontWeight: "700", color: "#FFF" },

  // Compose (admin → team)
  toRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 14,
    marginBottom: 12,
  },
  toLabel: { fontSize: 14, color: '#9CA3AF', fontWeight: '600', marginRight: 10 },
  toChip: { flex: 1 },
  toChipText: { fontSize: 15, color: '#F9FAFB', fontWeight: '600' },
  composeSubject: {
    backgroundColor: "#0B1120",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 12,
  },
  composeBody: {
    backgroundColor: "#0B1120",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#F9FAFB",
    minHeight: 200,
    textAlignVertical: "top",
  },

  // People picker
  pickerSearch: {
    backgroundColor: '#0B1120',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    padding: 14,
    fontSize: 15,
    color: '#F9FAFB',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    gap: 12,
  },
  pickerItemActive: { backgroundColor: '#1E1B4B' },
  pickerItemIcon: { fontSize: 24 },
  pickerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#4F46E5',
    alignItems: 'center', justifyContent: 'center',
  },
  pickerAvatarText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  pickerItemName: { fontSize: 15, fontWeight: '600', color: '#F9FAFB' },
  pickerItemSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  checkmark: { fontSize: 18, color: '#8B5CF6', fontWeight: '700' },
  pickerEmpty: { textAlign: 'center', color: '#6B7280', padding: 24, fontSize: 14 },

  // Network directory
  networkSectionHeader: { marginBottom: 12 },
  networkSectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F9FAFB",
    marginBottom: 2,
  },
  networkSectionSub: { fontSize: 13, color: "#6B7280" },
  contactCard: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 16,
    marginBottom: 10,
  },
  contactRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  contactName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#F9FAFB",
    marginBottom: 2,
  },
  contactBranch: { fontSize: 13, color: "#9CA3AF" },
  contactEmail: {
    fontSize: 12,
    color: "#4B5563",
    fontFamily: "monospace",
    marginBottom: 6,
  },
  composeHint: { fontSize: 12, color: "#4F46E5" },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  roleBadgeText: { fontSize: 12, fontWeight: "600" },

  // Compose cross-branch
  composeToRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  composeToLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginRight: 8,
    marginTop: 4,
  },
  composeToChip: {
    flex: 1,
    backgroundColor: "#1E1B4B",
    borderRadius: 8,
    padding: 10,
  },
  composeToName: { fontSize: 14, fontWeight: "600", color: "#F9FAFB" },
  composeToMeta: { fontSize: 12, color: "#818CF8", marginTop: 2 },
});
