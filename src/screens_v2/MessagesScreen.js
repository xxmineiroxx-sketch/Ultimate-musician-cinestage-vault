/**
 * Messages Screen - Ultimate Playback
 * Team member → Admin messaging, via sync server.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  FlatList, TextInput, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile } from '../services/storage';

const SYNC_URL = 'http://10.0.0.34:8099';

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

export default function MessagesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile]     = useState(null);
  const [threads, setThreads]     = useState([]);
  const [selected, setSelected]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [sending, setSending]     = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false); // MD/Admin sees all messages

  const [subject, setSubject]   = useState('');
  const [body, setBody]         = useState('');
  const [replyText, setReplyText] = useState('');
  const [to, setTo]             = useState('admin'); // 'admin' | 'all_team'

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const p = await getUserProfile();
    setProfile(p);
    // Check for admin role grant
    const granted = p?.grantedRole;
    if (granted === 'md' || granted === 'admin') {
      setIsAdminMode(true);
      refreshInboxAdmin();
    } else if (p?.email) {
      refreshInbox(p.email);
    }
  };

  // Admin inbox: all team messages
  const refreshInboxAdmin = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson(`${SYNC_URL}/sync/messages/admin`);
      setThreads(Array.isArray(data) ? data : []);
    } catch (_) {
      // server unreachable
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshInbox = useCallback(async (email) => {
    if (!email) return;
    setLoading(true);
    try {
      const data = await fetchJson(
        `${SYNC_URL}/sync/messages/replies?email=${encodeURIComponent(email)}`
      );
      setThreads(data);
    } catch (_) {
      // server unreachable — keep existing
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Compose & send ──────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      Alert.alert('Required', 'Please enter both subject and message.');
      return;
    }
    if (!profile?.email) {
      Alert.alert('No Profile', 'Set your email in Profile first.');
      navigation.navigate('ProfileSetup');
      return;
    }

    setSending(true);
    try {
      await fetchJson(`${SYNC_URL}/sync/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_email: profile.email,
          from_name: `${profile.name || ''} ${profile.lastName || ''}`.trim() || profile.email,
          subject: subject.trim(),
          message: body.trim(),
          to,
        }),
      });
      setSubject('');
      setBody('');
      setTo('admin');
      setShowCompose(false);
      Alert.alert(
        'Sent ✓',
        to === 'all_team'
          ? 'Your message was broadcast to all team members.'
          : 'Your message was delivered to the admin.'
      );
      refreshInbox(profile.email);
    } catch (e) {
      Alert.alert('Error', `Could not send: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  // ── Reply to admin reply (future: team chat) ────────────────────────────
  // For now just show the thread — replying goes back to compose

  const unreadReplies = threads.reduce((n, t) => n + (t.replies?.length > 0 ? 1 : 0), 0);

  // ── Compose view ─────────────────────────────────────────────────────────

  if (showCompose) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={() => setShowCompose(false)}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle}>New Message</Text>
          <TouchableOpacity onPress={handleSend} disabled={sending}>
            {sending
              ? <ActivityIndicator size="small" color="#8B5CF6" />
              : <Text style={s.sendText}>Send</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView style={s.composeBody} keyboardShouldPersistTaps="handled">
          <View style={s.toRow}>
            <Text style={s.toLabel}>To:</Text>
            <TouchableOpacity
              style={[s.toChip, to === 'admin' && s.toChipActive]}
              onPress={() => setTo('admin')}
            >
              <Text style={[s.toChipText, to === 'admin' && s.toChipTextActive]}>
                👤 Admin / Manager
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toChip, to === 'all_team' && s.toChipAllActive]}
              onPress={() => setTo('all_team')}
            >
              <Text style={[s.toChipText, to === 'all_team' && s.toChipAllTextActive]}>
                👥 All Team
              </Text>
            </TouchableOpacity>
          </View>

          {profile?.email ? (
            <View style={s.fromRow}>
              <Text style={s.fromLabel}>From:</Text>
              <Text style={s.fromValue}>{profile.email}</Text>
            </View>
          ) : (
            <TouchableOpacity style={s.noEmailWarning} onPress={() => navigation.navigate('ProfileSetup')}>
              <Text style={s.noEmailWarningText}>⚠️ Set your email in Profile first</Text>
            </TouchableOpacity>
          )}

          <TextInput
            style={s.subjectInput}
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            placeholderTextColor="#6B7280"
          />

          <TextInput
            style={s.bodyInput}
            value={body}
            onChangeText={setBody}
            placeholder="Write your message..."
            placeholderTextColor="#6B7280"
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
      </View>
    );
  }

  // ── Thread view ─────────────────────────────────────────────────────────

  if (selected) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={() => setSelected(null)}>
            <Text style={s.cancelText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle} numberOfLines={1}>{selected.subject}</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={s.threadBody}>
          {/* Original message */}
          <View style={s.bubble}>
            <View style={s.bubbleHeader}>
              <Text style={s.bubbleName}>You</Text>
              <Text style={s.bubbleTime}>{formatTime(selected.timestamp)}</Text>
            </View>
            <Text style={s.bubbleText}>{selected.message}</Text>
          </View>

          {/* Admin replies */}
          {(selected.replies || []).length === 0 ? (
            <View style={s.noReplies}>
              <Text style={s.noRepliesText}>Waiting for admin reply…</Text>
            </View>
          ) : (
            (selected.replies || []).map((r) => (
              <View key={r.id} style={[s.bubble, s.adminBubble]}>
                <View style={s.bubbleHeader}>
                  <Text style={[s.bubbleName, s.adminName]}>👤 {r.from}</Text>
                  <Text style={s.bubbleTime}>{formatTime(r.timestamp)}</Text>
                </View>
                <Text style={s.bubbleText}>{r.message}</Text>
              </View>
            ))
          )}
        </ScrollView>

        <View style={s.threadFooter}>
          {isAdminMode ? (
            // Admin: reply directly in thread
            <View>
              <TextInput
                style={s.inlineReplyInput}
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Type reply..."
                placeholderTextColor="#6B7280"
                multiline
              />
              <TouchableOpacity
                style={[s.replyBtn, sending && { opacity: 0.6 }]}
                onPress={async () => {
                  if (!replyText.trim()) return;
                  setSending(true);
                  try {
                    await fetchJson(
                      `${SYNC_URL}/sync/message/reply?messageId=${encodeURIComponent(selected.id)}`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reply_text: replyText.trim(), admin_name: profile?.name || 'Admin' }),
                      }
                    );
                    setReplyText('');
                    Alert.alert('Sent ✓', 'Reply delivered.');
                    setSelected(null);
                    refreshInboxAdmin();
                  } catch (e) { Alert.alert('Error', e.message); }
                  finally { setSending(false); }
                }}
                disabled={sending}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={s.replyBtnText}>↩ Send Reply</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={s.replyBtn}
              onPress={() => {
                setSelected(null);
                setSubject(`Re: ${selected.subject}`);
                setShowCompose(true);
              }}
            >
              <Text style={s.replyBtnText}>↩ Send Follow-up</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── Inbox list ───────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 24 }]}>
        <Text style={s.headerIcon}>💬</Text>
        <Text style={s.title}>Messages</Text>
        {isAdminMode && (
          <View style={s.adminModeBadge}>
            <Text style={s.adminModeBadgeText}>🎛 Admin Inbox — All Team Messages</Text>
          </View>
        )}
        <Text style={s.subtitle}>
          {profile?.email
            ? `Inbox: ${profile.email}`
            : 'Set your email in Profile to send messages'}
        </Text>
      </View>

      <TouchableOpacity style={s.composeBtn} onPress={() => setShowCompose(true)}>
        <Text style={s.composeBtnText}>✉️  New Message to Admin</Text>
      </TouchableOpacity>

      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => isAdminMode ? refreshInboxAdmin() : refreshInbox(profile?.email)}
            tintColor="#8B5CF6"
          />
        }
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const hasReply = item.replies?.length > 0;
          const lastReply = hasReply ? item.replies[item.replies.length - 1] : null;
          return (
            <TouchableOpacity
              style={[s.threadCard, hasReply && s.threadCardWithReply]}
              onPress={() => setSelected(item)}
            >
              <View style={s.threadCardHeader}>
                <Text style={s.threadSubject}>{item.subject}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {item.to === 'all_team' && (
                    <View style={s.broadcastBadge}>
                      <Text style={s.broadcastBadgeText}>👥 Team</Text>
                    </View>
                  )}
                  <Text style={s.threadTime}>{formatTime(item.timestamp)}</Text>
                </View>
              </View>
              <Text style={s.threadPreview} numberOfLines={2}>{item.message}</Text>
              {hasReply ? (
                <View style={s.replyBadge}>
                  <Text style={s.replyBadgeText}>
                    💬 {item.replies.length} reply{item.replies.length > 1 ? 's' : ''} from Admin
                  </Text>
                </View>
              ) : (
                <View style={s.pendingBadge}>
                  <Text style={s.pendingBadgeText}>⏳ Awaiting reply</Text>
                </View>
              )}
              {lastReply ? (
                <Text style={s.lastReply} numberOfLines={1}>
                  👤 {lastReply.from}: {lastReply.message}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📭</Text>
            <Text style={s.emptyTitle}>No Messages Yet</Text>
            <Text style={s.emptyText}>
              Send a message to your admin or manager.{'\n'}Pull down to refresh.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffH = Math.floor((now - d) / 3600000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },

  // Header
  adminModeBadge: { paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#7C3AED20', borderRadius: 12, borderWidth: 1, borderColor: '#7C3AED', marginBottom: 6 },
  adminModeBadgeText: { fontSize: 12, fontWeight: '700', color: '#A78BFA' },
  inlineReplyInput: { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#374151', borderRadius: 8, padding: 12, fontSize: 14, color: '#F9FAFB', minHeight: 70, textAlignVertical: 'top', marginBottom: 8 },
  header: { alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  headerIcon: { fontSize: 48, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#F9FAFB', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 20 },

  // Compose button
  composeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#8B5CF6', margin: 16, padding: 14, borderRadius: 12,
  },
  composeBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // Inbox list
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  threadCard: {
    padding: 16, backgroundColor: '#0B1120',
    borderRadius: 12, borderWidth: 1, borderColor: '#374151', marginBottom: 12,
  },
  threadCardWithReply: { borderColor: '#8B5CF6' },
  threadCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  threadSubject: { fontSize: 15, fontWeight: '700', color: '#F9FAFB', flex: 1, marginRight: 8 },
  threadTime: { fontSize: 11, color: '#6B7280' },
  threadPreview: { fontSize: 13, color: '#9CA3AF', lineHeight: 20, marginBottom: 10 },
  replyBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#8B5CF620', borderRadius: 12, borderWidth: 1, borderColor: '#8B5CF6',
    marginBottom: 8,
  },
  replyBadgeText: { fontSize: 12, fontWeight: '600', color: '#A78BFA' },
  pendingBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#1F2937', borderRadius: 12, marginBottom: 8,
  },
  pendingBadgeText: { fontSize: 12, color: '#6B7280' },
  lastReply: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },
  broadcastBadge: { paddingHorizontal: 7, paddingVertical: 2, backgroundColor: '#064E3B', borderRadius: 8, borderWidth: 1, borderColor: '#10B981' },
  broadcastBadgeText: { fontSize: 10, fontWeight: '700', color: '#34D399' },

  // Top bar (compose / thread)
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#1F2937',
    backgroundColor: '#0A0A1A',
  },
  topBarTitle: { fontSize: 16, fontWeight: '700', color: '#F9FAFB', flex: 1, textAlign: 'center' },
  cancelText: { fontSize: 15, color: '#8B5CF6', fontWeight: '600', minWidth: 60 },
  sendText: { fontSize: 15, color: '#8B5CF6', fontWeight: '700', minWidth: 60, textAlign: 'right' },

  // Compose body
  composeBody: { flex: 1, padding: 16 },
  toRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  toLabel: { fontSize: 14, color: '#9CA3AF', fontWeight: '600', width: 40 },
  toChip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#1F2937', borderRadius: 20, borderWidth: 1, borderColor: '#374151' },
  toChipActive: { backgroundColor: '#1E1B4B', borderColor: '#4F46E5' },
  toChipAllActive: { backgroundColor: '#064E3B', borderColor: '#10B981' },
  toChipText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  toChipTextActive: { color: '#818CF8' },
  toChipAllTextActive: { color: '#34D399' },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  fromLabel: { fontSize: 14, color: '#9CA3AF', fontWeight: '600', width: 40 },
  fromValue: { fontSize: 14, color: '#6B7280' },
  noEmailWarning: {
    padding: 12, backgroundColor: '#7C2D1220', borderRadius: 8,
    borderWidth: 1, borderColor: '#F97316', marginBottom: 12,
  },
  noEmailWarningText: { fontSize: 13, color: '#F97316' },
  subjectInput: {
    backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#374151',
    borderRadius: 8, padding: 14, fontSize: 16, color: '#F9FAFB', marginBottom: 12,
  },
  bodyInput: {
    backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#374151',
    borderRadius: 8, padding: 14, fontSize: 15, color: '#F9FAFB',
    minHeight: 220, textAlignVertical: 'top',
  },

  // Thread view
  threadBody: { flex: 1, padding: 16 },
  bubble: {
    padding: 14, backgroundColor: '#0B1120',
    borderRadius: 12, borderWidth: 1, borderColor: '#374151', marginBottom: 12,
  },
  adminBubble: { backgroundColor: '#1E1B4B', borderColor: '#4F46E5' },
  bubbleHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  bubbleName: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  adminName: { color: '#818CF8' },
  bubbleTime: { fontSize: 11, color: '#6B7280' },
  bubbleText: { fontSize: 15, color: '#E5E7EB', lineHeight: 24 },
  noReplies: { alignItems: 'center', paddingVertical: 24 },
  noRepliesText: { fontSize: 14, color: '#6B7280', fontStyle: 'italic' },
  threadFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#1F2937' },
  replyBtn: {
    backgroundColor: '#8B5CF6', padding: 14, borderRadius: 10, alignItems: 'center',
  },
  replyBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#F9FAFB', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 22 },
});
