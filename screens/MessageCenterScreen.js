/**
 * Message Center Screen - Ultimate Musician
 * Admin inbox: reads messages from Playback team members via sync server.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  FlatList, TextInput, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';

import { SYNC_URL } from './config';
const DEFAULT_ADMIN_NAME = 'Admin';

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

export default function MessageCenterScreen({ navigation }) {
  const [messages, setMessages]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [selected, setSelected]       = useState(null);
  const [replyText, setReplyText]     = useState('');
  const [sending, setSending]         = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => { loadMessages(); }, []);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setServerError(null);
    try {
      const data = await fetchJson(`${SYNC_URL}/sync/messages/admin`);
      setMessages(Array.isArray(data) ? data : []);
    } catch (e) {
      setServerError(e.message || 'Server unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Reply ────────────────────────────────────────────────────────────────

  const handleReply = async () => {
    if (!replyText.trim()) {
      Alert.alert('Empty', 'Type a reply first.');
      return;
    }
    setSending(true);
    try {
      await fetchJson(
        `${SYNC_URL}/sync/message/reply?messageId=${encodeURIComponent(selected.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reply_text:  replyText.trim(),
            admin_name:  DEFAULT_ADMIN_NAME,
          }),
        }
      );
      setReplyText('');
      Alert.alert('Sent ✓', 'Reply delivered to team member.');
      // Refresh the thread view
      await loadMessages();
      // Re-select the updated thread
      setSelected(prev => {
        const updated = messages.find(m => m.id === prev?.id);
        return updated || prev;
      });
    } catch (e) {
      Alert.alert('Error', `Could not send reply: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  // ── After refresh, re-sync selected thread ───────────────────────────────

  const refreshAndReselect = useCallback(async () => {
    setLoading(true);
    setServerError(null);
    try {
      const data = await fetchJson(`${SYNC_URL}/sync/messages/admin`);
      const arr = Array.isArray(data) ? data : [];
      setMessages(arr);
      if (selected) {
        const refreshed = arr.find(m => m.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    } catch (e) {
      setServerError(e.message || 'Server unreachable');
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const unreadCount = messages.filter(m => !m.read).length;

  // ── Thread / detail view ─────────────────────────────────────────────────

  if (selected) {
    return (
      <View style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => { setSelected(null); setReplyText(''); }}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle} numberOfLines={1}>{selected.subject}</Text>
          <TouchableOpacity onPress={refreshAndReselect}>
            <Text style={s.refreshText}>⟳</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.threadBody} keyboardShouldPersistTaps="handled">
          {/* Original message from team member */}
          <View style={s.senderInfo}>
            <Text style={s.senderName}>👤 {selected.from_name || selected.from_email}</Text>
            <Text style={s.senderEmail}>{selected.from_email}</Text>
            <Text style={s.senderTime}>{getTimeAgo(selected.timestamp)}</Text>
          </View>

          <View style={s.bubble}>
            <Text style={s.bubbleText}>{selected.message}</Text>
          </View>

          {/* Previous admin replies */}
          {(selected.replies || []).length > 0 && (
            <View style={s.repliesSection}>
              <Text style={s.repliesSectionTitle}>Your Replies</Text>
              {selected.replies.map(r => (
                <View key={r.id} style={s.adminBubble}>
                  <View style={s.adminBubbleHeader}>
                    <Text style={s.adminBubbleName}>👤 {r.from}</Text>
                    <Text style={s.adminBubbleTime}>{getTimeAgo(r.timestamp)}</Text>
                  </View>
                  <Text style={s.adminBubbleText}>{r.message}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Reply input */}
          <View style={s.replyBox}>
            <Text style={s.replyBoxLabel}>Reply as Admin</Text>
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
              {sending
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={s.replyBtnText}>↩ Send Reply</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Inbox list ───────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.title}>Inbox</Text>
          <TouchableOpacity onPress={loadMessages} style={s.refreshBtn}>
            <Text style={s.refreshBtnText}>⟳ Refresh</Text>
          </TouchableOpacity>
        </View>
        {unreadCount > 0 && (
          <View style={s.unreadBadge}>
            <Text style={s.unreadBadgeText}>{unreadCount} unread</Text>
          </View>
        )}
        {serverError && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>⚠️ {serverError} — is sync-server.js running?</Text>
          </View>
        )}
      </View>

      <FlatList
        data={messages}
        keyExtractor={item => item.id}
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
          return (
            <TouchableOpacity
              style={[s.card, !item.read && s.cardUnread]}
              onPress={() => setSelected(item)}
            >
              <View style={s.cardHeader}>
                <View style={s.cardFromRow}>
                  {!item.read && <View style={s.unreadDot} />}
                  <Text style={s.cardFrom}>{item.from_name || item.from_email}</Text>
                </View>
                <Text style={s.cardTime}>{getTimeAgo(item.timestamp)}</Text>
              </View>
              <Text style={s.cardSubject}>{item.subject}</Text>
              <Text style={s.cardPreview} numberOfLines={2}>{item.message}</Text>
              {hasReplies ? (
                <View style={s.repliedBadge}>
                  <Text style={s.repliedBadgeText}>
                    ✓ {item.replies.length} repl{item.replies.length > 1 ? 'ies' : 'y'} sent
                  </Text>
                </View>
              ) : (
                <View style={s.awaitingBadge}>
                  <Text style={s.awaitingBadgeText}>💬 Awaiting reply</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>{loading ? '⏳' : '📭'}</Text>
            <Text style={s.emptyTitle}>
              {loading ? 'Loading…' : 'No Team Messages'}
            </Text>
            <Text style={s.emptyText}>
              {loading
                ? 'Fetching messages from sync server…'
                : 'When team members send you a message from Ultimate Playback, it will appear here.\n\nPull down to refresh.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function getTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (days > 0)  return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'Just now';
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },

  // Header
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: '#F9FAFB' },
  refreshBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#1F2937', borderRadius: 8 },
  refreshBtnText: { fontSize: 14, color: '#8B5CF6', fontWeight: '600' },
  unreadBadge: { alignSelf: 'flex-start', backgroundColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 6 },
  unreadBadgeText: { fontSize: 12, fontWeight: '600', color: '#FFF' },
  errorBanner: { backgroundColor: '#7C2D1220', borderWidth: 1, borderColor: '#F97316', borderRadius: 8, padding: 10, marginTop: 4 },
  errorText: { fontSize: 12, color: '#F97316' },

  // List
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  card: { padding: 16, backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', marginBottom: 12 },
  cardUnread: { borderColor: '#8B5CF6', backgroundColor: '#0D0B1E' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardFromRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B5CF6' },
  cardFrom: { fontSize: 14, fontWeight: '600', color: '#E5E7EB' },
  cardTime: { fontSize: 11, color: '#6B7280' },
  cardSubject: { fontSize: 16, fontWeight: '700', color: '#F9FAFB', marginBottom: 4 },
  cardPreview: { fontSize: 13, color: '#9CA3AF', lineHeight: 20, marginBottom: 10 },
  repliedBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#14532D20', borderRadius: 12, borderWidth: 1, borderColor: '#22C55E' },
  repliedBadgeText: { fontSize: 12, fontWeight: '600', color: '#4ADE80' },
  awaitingBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#1F2937', borderRadius: 12 },
  awaitingBadgeText: { fontSize: 12, color: '#6B7280' },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#F9FAFB', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 22, paddingHorizontal: 30 },

  // Top bar (thread)
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1F2937', backgroundColor: '#0A0A1A' },
  topBarTitle: { fontSize: 16, fontWeight: '700', color: '#F9FAFB', flex: 1, textAlign: 'center' },
  backText: { fontSize: 15, color: '#8B5CF6', fontWeight: '600', minWidth: 60 },
  refreshText: { fontSize: 20, color: '#8B5CF6', minWidth: 30, textAlign: 'right' },

  // Thread body
  threadBody: { flex: 1, padding: 16 },
  senderInfo: { marginBottom: 12 },
  senderName: { fontSize: 16, fontWeight: '700', color: '#F9FAFB', marginBottom: 2 },
  senderEmail: { fontSize: 13, color: '#6B7280', marginBottom: 2 },
  senderTime: { fontSize: 12, color: '#4B5563' },
  bubble: { backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', padding: 16, marginBottom: 20 },
  bubbleText: { fontSize: 15, color: '#E5E7EB', lineHeight: 24 },

  // Admin replies in thread
  repliesSection: { marginBottom: 20 },
  repliesSectionTitle: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  adminBubble: { backgroundColor: '#1E1B4B', borderRadius: 12, borderWidth: 1, borderColor: '#4F46E5', padding: 14, marginBottom: 10 },
  adminBubbleHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  adminBubbleName: { fontSize: 13, fontWeight: '700', color: '#818CF8' },
  adminBubbleTime: { fontSize: 11, color: '#6B7280' },
  adminBubbleText: { fontSize: 15, color: '#E5E7EB', lineHeight: 22 },

  // Reply box
  replyBox: { backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', padding: 16, marginBottom: 40 },
  replyBoxLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  replyInput: { backgroundColor: '#020617', borderWidth: 1, borderColor: '#374151', borderRadius: 8, padding: 12, fontSize: 15, color: '#F9FAFB', minHeight: 100, textAlignVertical: 'top', marginBottom: 12 },
  replyBtn: { backgroundColor: '#8B5CF6', padding: 14, borderRadius: 10, alignItems: 'center' },
  replyBtnDisabled: { opacity: 0.6 },
  replyBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
