/**
 * Proposals Screen - Ultimate Musician
 * Review lyrics / chord chart / instrument part edits submitted by team members.
 * Approve to publish immediately and sync to local song library.
 * Reject with an optional reason.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ScrollView,
  TextInput, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { getSongs, addOrUpdateSong } from '../data/storage';

const SYNC_URL = 'http://10.0.0.34:8099';

const INSTR_ICON = {
  Vocals: '🎤', Keys: '🎹', 'Acoustic Guitar': '🎸',
  'Electric Guitar': '⚡', Bass: '🎸', 'Synth/Pad': '🎛', Drums: '🥁',
};

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(tid); }
}

// After approval: pull updated song from server library and merge into local Musician storage
async function syncApprovedSongToLibrary(songId, songTitle) {
  try {
    const libData = await fetchJson(`${SYNC_URL}/sync/song-library?songId=${encodeURIComponent(songId)}`);
    if (!libData || libData.length === 0) return;
    const serverSong = libData[0];

    const localSongs = await getSongs();
    const existing   = localSongs.find(s =>
      s.id === serverSong.id ||
      (s.title?.toLowerCase().trim() === (serverSong.title || songTitle || '').toLowerCase().trim() &&
       s.artist?.toLowerCase().trim() === (serverSong.artist || '').toLowerCase().trim())
    );

    if (existing) {
      await addOrUpdateSong({
        ...existing,
        lyrics:         serverSong.lyrics      ?? existing.lyrics,
        chordChart:     serverSong.chordChart  ?? existing.chordChart,
        chordSheet:     serverSong.chordChart  ?? existing.chordSheet,
        instrumentNotes: {
          ...(existing.instrumentNotes || {}),
          ...(serverSong.instrumentNotes || {}),
        },
      });
      console.log(`[ProposalsScreen] synced "${serverSong.title}" to local library`);
    }
  } catch (e) {
    console.log('[ProposalsScreen] library sync error:', e.message);
  }
}

export default function ProposalsScreen() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [selected, setSelected]   = useState(null);
  const [filter, setFilter]       = useState('pending');
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing]       = useState(false);
  const [error, setError]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson(`${SYNC_URL}/sync/proposals`);
      setProposals(Array.isArray(data) ? data : []);
    } catch (e) {
      setError('Cannot reach sync server.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, []);

  const handleApprove = async (proposal) => {
    setActing(true);
    try {
      await fetchJson(
        `${SYNC_URL}/sync/proposal/approve?id=${encodeURIComponent(proposal.id)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      );

      const instrLabel = proposal.instrument
        ? `${INSTR_ICON[proposal.instrument] || '🎼'} ${proposal.instrument} part`
        : proposal.type === 'lyrics' ? 'lyrics' : 'chord chart';

      Alert.alert(
        'Approved ✓',
        `"${proposal.songTitle}" ${instrLabel} is now live and synced to library.`
      );

      // Sync the updated song back to Musician's local library
      await syncApprovedSongToLibrary(proposal.songId, proposal.songTitle);

      setSelected(null);
      load();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setActing(false);
    }
  };

  const handleReject = async (proposal) => {
    if (!rejectReason.trim()) {
      Alert.alert('Add Reason', 'Please type a reason before rejecting.');
      return;
    }
    setActing(true);
    try {
      await fetchJson(
        `${SYNC_URL}/sync/proposal/reject?id=${encodeURIComponent(proposal.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: rejectReason.trim() }),
        }
      );
      setRejectReason('');
      setSelected(null);
      load();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setActing(false);
    }
  };

  const filtered     = proposals.filter(p => filter === 'all' || p.status === filter);
  const pendingCount = proposals.filter(p => p.status === 'pending').length;

  // ── Detail view ─────────────────────────────────────────────────────────

  if (selected) {
    const instrIcon  = INSTR_ICON[selected.instrument] || '';
    const instrLabel = selected.instrument
      ? `${instrIcon} ${selected.instrument}`
      : (selected.type === 'lyrics' ? '🎤 Lyrics' : '🎸 Master Chart');

    return (
      <View style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => { setSelected(null); setRejectReason(''); }}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle} numberOfLines={1}>{selected.songTitle || 'Song'}</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={s.detailBody} keyboardShouldPersistTaps="handled">
          {/* Meta row */}
          <View style={s.metaRow}>
            <View style={[s.typeBadge,
              selected.type === 'lyrics' ? s.lyricsBadge :
              selected.instrument        ? s.instrBadge  : s.chordBadge
            ]}>
              <Text style={s.typeBadgeText}>{instrLabel}</Text>
            </View>
            <Text style={s.metaFrom}>from {selected.from_name}</Text>
            <Text style={s.metaTime}>{timeAgo(selected.createdAt)}</Text>
          </View>

          {/* If instrument-specific, show a note */}
          {selected.instrument && selected.instrument !== 'Vocals' && (
            <View style={s.instrNoteBanner}>
              <Text style={s.instrNoteText}>
                {instrIcon} This is a <Text style={{ fontWeight: '700', color: '#A78BFA' }}>{selected.instrument}</Text>-specific part.
                Approving will only update the {selected.instrument} notes for this song — other instruments are unaffected.
              </Text>
            </View>
          )}

          <Text style={s.contentLabel}>PROPOSED CONTENT</Text>
          <View style={s.contentBox}>
            <Text style={[s.contentText, selected.type === 'chord_chart' && s.contentMono]}>
              {selected.content || '(empty)'}
            </Text>
          </View>

          {selected.status === 'pending' ? (
            <View style={s.actionBox}>
              <TouchableOpacity
                style={[s.approveBtn, acting && s.btnDisabled]}
                onPress={() => handleApprove(selected)}
                disabled={acting}
              >
                {acting
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={s.approveBtnText}>✓ Approve — Publish & Sync to Library</Text>}
              </TouchableOpacity>

              <Text style={s.rejectLabel}>Reject with reason:</Text>
              <TextInput
                style={s.rejectInput}
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="e.g. Incorrect key, please revise..."
                placeholderTextColor="#6B7280"
                multiline
              />
              <TouchableOpacity
                style={[s.rejectBtn, acting && s.btnDisabled]}
                onPress={() => handleReject(selected)}
                disabled={acting}
              >
                <Text style={s.rejectBtnText}>✕ Reject</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.resolvedBox}>
              <Text style={[s.resolvedText, selected.status === 'approved' ? s.approvedText : s.rejectedText]}>
                {selected.status === 'approved' ? '✓ Approved & Synced' : '✕ Rejected'}
              </Text>
              {selected.rejectReason ? (
                <Text style={s.rejectReasonText}>Reason: {selected.rejectReason}</Text>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Content Proposals</Text>
        {pendingCount > 0 && (
          <View style={s.badge}><Text style={s.badgeText}>{pendingCount} pending</Text></View>
        )}
      </View>

      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={load}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
        </View>
      )}

      {/* Filter tabs */}
      <View style={s.filters}>
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterBtn, filter === f && s.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterBtnText, filter === f && s.filterBtnTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#8B5CF6" />}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const instrIcon  = item.instrument ? (INSTR_ICON[item.instrument] || '🎼') : '';
          const instrLabel = item.instrument
            ? `${instrIcon} ${item.instrument}`
            : (item.type === 'lyrics' ? '🎤 Lyrics' : '🎸 Chords');
          return (
            <TouchableOpacity
              style={[s.card, item.status === 'pending' && s.cardPending]}
              onPress={() => setSelected(item)}
            >
              <View style={s.cardHeader}>
                <View style={[s.typeBadge,
                  item.type === 'lyrics' ? s.lyricsBadge :
                  item.instrument        ? s.instrBadge  : s.chordBadge
                ]}>
                  <Text style={s.typeBadgeText}>{instrLabel}</Text>
                </View>
                <Text style={s.cardTime}>{timeAgo(item.createdAt)}</Text>
              </View>
              <Text style={s.cardSong}>{item.songTitle || 'Unknown song'}</Text>
              <Text style={s.cardFrom}>from {item.from_name}</Text>
              <Text style={s.cardPreview} numberOfLines={2}>{item.content}</Text>
              <View style={s.cardFooter}>
                <View style={[s.statusDot,
                  item.status === 'approved' ? s.dotApproved :
                  item.status === 'rejected' ? s.dotRejected : s.dotPending
                ]} />
                <Text style={s.cardStatus}>{item.status}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !loading && (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📝</Text>
              <Text style={s.emptyTitle}>
                {filter === 'pending' ? 'No Pending Proposals' : 'No Proposals'}
              </Text>
              <Text style={s.emptyText}>
                {filter === 'pending'
                  ? 'Team members can submit lyrics, chord charts, and instrument-specific parts from Ultimate Playback.'
                  : 'Switch to "Pending" to see proposals awaiting review.'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'Just now';
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  title: { fontSize: 24, fontWeight: '700', color: '#F9FAFB' },
  badge: { backgroundColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  errorBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: 16, padding: 12, backgroundColor: '#7C2D1220', borderRadius: 8, borderWidth: 1, borderColor: '#F97316' },
  errorText: { fontSize: 13, color: '#F97316', flex: 1 },
  retryText:  { fontSize: 13, color: '#F97316', fontWeight: '700' },
  filters: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#374151' },
  filterBtnActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  filterBtnText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  filterBtnTextActive: { color: '#FFF' },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  card: { padding: 14, backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', marginBottom: 10 },
  cardPending: { borderColor: '#8B5CF6' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  lyricsBadge: { backgroundColor: '#4F46E520', borderWidth: 1, borderColor: '#4F46E5' },
  chordBadge:  { backgroundColor: '#05966920', borderWidth: 1, borderColor: '#059669' },
  instrBadge:  { backgroundColor: '#7C3AED20', borderWidth: 1, borderColor: '#7C3AED' },
  typeBadgeText: { fontSize: 12, fontWeight: '700', color: '#E5E7EB' },
  cardTime:    { fontSize: 11, color: '#6B7280' },
  cardSong:    { fontSize: 16, fontWeight: '700', color: '#F9FAFB', marginBottom: 2 },
  cardFrom:    { fontSize: 12, color: '#9CA3AF', marginBottom: 6 },
  cardPreview: { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 8 },
  cardFooter:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot:   { width: 8, height: 8, borderRadius: 4 },
  dotPending:  { backgroundColor: '#F59E0B' },
  dotApproved: { backgroundColor: '#22C55E' },
  dotRejected: { backgroundColor: '#EF4444' },
  cardStatus:  { fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: '600' },

  // Detail
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1F2937', backgroundColor: '#0A0A1A' },
  topBarTitle: { fontSize: 16, fontWeight: '700', color: '#F9FAFB', flex: 1, textAlign: 'center' },
  backText:    { fontSize: 15, color: '#8B5CF6', fontWeight: '600', minWidth: 60 },
  detailBody:  { flex: 1, padding: 16 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  metaFrom:    { fontSize: 13, color: '#9CA3AF', flex: 1 },
  metaTime:    { fontSize: 11, color: '#6B7280' },
  instrNoteBanner: { padding: 12, backgroundColor: '#1E1B4B', borderRadius: 8, borderWidth: 1, borderColor: '#4F46E5', marginBottom: 12 },
  instrNoteText:   { fontSize: 12, color: '#9CA3AF', lineHeight: 18 },
  contentLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  contentBox:   { backgroundColor: '#0B1120', borderRadius: 10, borderWidth: 1, borderColor: '#374151', padding: 16, marginBottom: 20 },
  contentText:  { fontSize: 15, color: '#E5E7EB', lineHeight: 26 },
  contentMono:  { fontFamily: 'Courier', fontSize: 14 },
  actionBox:    { gap: 10, marginBottom: 40 },
  approveBtn:     { backgroundColor: '#059669', padding: 16, borderRadius: 12, alignItems: 'center' },
  approveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  rejectLabel: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', marginTop: 6 },
  rejectInput: { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#374151', borderRadius: 8, padding: 12, fontSize: 14, color: '#F9FAFB', minHeight: 80, textAlignVertical: 'top' },
  rejectBtn:     { backgroundColor: '#7F1D1D', borderWidth: 1, borderColor: '#EF4444', padding: 14, borderRadius: 12, alignItems: 'center' },
  rejectBtnText: { fontSize: 15, fontWeight: '700', color: '#FCA5A5' },
  btnDisabled:  { opacity: 0.5 },
  resolvedBox:  { padding: 16, backgroundColor: '#0B1120', borderRadius: 12, borderWidth: 1, borderColor: '#374151', alignItems: 'center' },
  resolvedText: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  approvedText: { color: '#22C55E' },
  rejectedText: { color: '#EF4444' },
  rejectReasonText: { fontSize: 13, color: '#9CA3AF' },

  empty:      { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#F9FAFB', marginBottom: 6 },
  emptyText:  { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20, paddingHorizontal: 30 },
});
