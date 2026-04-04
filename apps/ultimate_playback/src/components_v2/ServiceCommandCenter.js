/**
 * ServiceCommandCenter.js
 *
 * Worship Leader / Admin exclusive home screen widget.
 * Merges three original intelligence layers into one unified card:
 *
 *   1. TEAM HEARTBEAT  — live check-in status for every assigned member
 *   2. SERVICE ARC     — visual energy / key / tempo timeline of the service
 *   3. THE BRIEF       — AI-style smart alerts: transitions, key jumps, gaps
 *
 * No other worship app has this combination. Zero new dependencies.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  TouchableOpacity,
} from 'react-native';
import ModernDashboardCard from './ModernDashboardCard';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';

// ── Energy helpers ────────────────────────────────────────────────────────────

const ENERGY_MAP = [
  { minBpm: 130, level: 'high',    label: 'HIGH',   heightPct: 1.0, color: '#EF4444' },
  { minBpm: 108, level: 'medHigh', label: 'UPBEAT', heightPct: 0.75, color: '#F97316' },
  { minBpm: 84,  level: 'med',     label: 'MID',    heightPct: 0.52, color: '#38BDF8' },
  { minBpm: 0,   level: 'low',     label: 'SLOW',   heightPct: 0.28, color: '#10B981' },
];

function songEnergy(song, fallbackIndex, total) {
  const bpm = Number(song?.tempo || song?.bpm || 0);
  if (bpm > 0) {
    return ENERGY_MAP.find(e => bpm >= e.minBpm) || ENERGY_MAP[ENERGY_MAP.length - 1];
  }
  // No BPM — shape a gentle arc: low → peak at 60% → resolve low
  const pos = total > 1 ? fallbackIndex / (total - 1) : 0;
  const arc = Math.sin(pos * Math.PI);
  const idx = arc > 0.65 ? 0 : arc > 0.4 ? 1 : arc > 0.2 ? 2 : 3;
  return ENERGY_MAP[idx];
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

function memberStatus(lastSeen) {
  if (!lastSeen) return 'offline';
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 30 * 60 * 1000)      return 'active';   // last 30 min  — green
  if (diff < 24 * 60 * 60 * 1000) return 'synced';   // last 24 h    — amber
  return 'offline';                                    // older / none — slate
}

const STATUS_COLOR = { active: '#10B981', synced: '#F59E0B', offline: '#475569' };
const STATUS_BG    = { active: 'rgba(16,185,129,0.1)', synced: 'rgba(245,158,11,0.1)', offline: 'rgba(71,85,105,0.12)' };

function serviceCountdown(service) {
  const rawDate = service?.service_date || '';
  const rawTime = service?.service_time || '09:00';
  if (!rawDate) return null;
  const localStr = rawDate.includes('T') ? rawDate : `${rawDate}T${rawTime}:00`;
  const diff = new Date(localStr).getTime() - Date.now();
  if (diff <= 0) return null;
  const hrs  = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs >= 48) return `${Math.floor(hrs / 24)}d away`;
  if (hrs >= 1)  return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ServiceCommandCenter({ nextServiceGroup, userProfile, onNavigate }) {
  const [songs, setSongs]         = useState([]);
  const [teamPulse, setTeamPulse] = useState([]);
  const [expanded, setExpanded]   = useState(true);
  const barAnims = useRef([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const nextService = nextServiceGroup?.[0];
  const serviceId   = nextService?.service_id || nextService?.id;

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!serviceId) return;
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 5000);
      const [setlistRes, pulseRes] = await Promise.all([
        fetch(`${SYNC_URL}/sync/setlist?serviceId=${encodeURIComponent(serviceId)}`,
              { headers: syncHeaders(), signal: ctrl.signal }),
        fetch(`${SYNC_URL}/sync/team-pulse?serviceId=${encodeURIComponent(serviceId)}`,
              { headers: syncHeaders(), signal: ctrl.signal }),
      ]).finally(() => clearTimeout(tid));

      if (setlistRes.ok) {
        const data = await setlistRes.json();
        if (Array.isArray(data)) setSongs(data);
      }
      if (pulseRes.ok) {
        const data = await pulseRes.json();
        if (Array.isArray(data)) setTeamPulse(data);
      }
    } catch (_) {}
  }, [serviceId]);

  useEffect(() => { load(); }, [load]);

  // Fade-in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 500, useNativeDriver: true,
    }).start();
  }, []);

  // Animate arc bars when songs arrive
  useEffect(() => {
    if (!songs.length) return;
    barAnims.current = songs.map(() => new Animated.Value(0));
    songs.forEach((_, i) => {
      Animated.timing(barAnims.current[i], {
        toValue: 1,
        duration: 500 + i * 60,
        delay: 120 + i * 50,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: false,
      }).start();
    });
  }, [songs]);

  // ── Brief intelligence computation ─────────────────────────────────────────
  const briefs = [];

  const offlineMembers = teamPulse.filter(m => memberStatus(m.lastSeen) === 'offline');
  if (offlineMembers.length > 0) {
    const names = offlineMembers.slice(0, 2).map(m => m.name?.split(' ')[0]).join(', ');
    const extra = offlineMembers.length > 2 ? ` +${offlineMembers.length - 2}` : '';
    briefs.push({
      icon: '⚠',
      color: '#F59E0B',
      bg: 'rgba(245,158,11,0.08)',
      text: `${names}${extra} not synced yet`,
    });
  }

  if (songs.length >= 2) {
    for (let i = 0; i < songs.length - 1 && briefs.length < 4; i++) {
      const a = songs[i], b = songs[i + 1];
      const bpmA = Number(a?.tempo || a?.bpm || 0);
      const bpmB = Number(b?.tempo || b?.bpm || 0);
      const keyA = a?.key, keyB = b?.key;

      // Sharp tempo transition
      if (bpmA > 0 && bpmB > 0 && Math.abs(bpmA - bpmB) >= 35) {
        const dir = bpmB > bpmA ? '▲' : '▼';
        briefs.push({
          icon: '⚡',
          color: '#38BDF8',
          bg: 'rgba(56,189,248,0.08)',
          text: `S${i + 1}→S${i + 2}: ${bpmA}→${bpmB} BPM ${dir}  sharp tempo shift`,
        });
      }
      // Key change
      if (keyA && keyB && keyA !== keyB) {
        briefs.push({
          icon: '🎵',
          color: '#A78BFA',
          bg: 'rgba(167,139,250,0.08)',
          text: `S${i + 1}→S${i + 2}: ${keyA}→${keyB}  key change — vocals heads up`,
        });
      }
    }
    // Back-to-back peak energy
    for (let i = 0; i < songs.length - 1 && briefs.length < 4; i++) {
      const ea = songEnergy(songs[i], i, songs.length);
      const eb = songEnergy(songs[i + 1], i + 1, songs.length);
      if (ea.level === 'high' && eb.level === 'high') {
        briefs.push({
          icon: '🔥',
          color: '#EF4444',
          bg: 'rgba(239,68,68,0.08)',
          text: `S${i + 1} + S${i + 2}: back-to-back high energy — plan transition`,
        });
        break;
      }
    }
  }

  if (briefs.length === 0) {
    briefs.push({
      icon: '✓',
      color: '#10B981',
      bg: 'rgba(16,185,129,0.08)',
      text: 'All transitions look smooth — you\'re ready',
    });
  }

  // ── Render helpers ──────────────────────────────────────────────────────────
  const countdown    = serviceCountdown(nextService);
  const arcBarMaxH   = 60;
  const readyCount   = teamPulse.filter(m => memberStatus(m.lastSeen) !== 'offline').length;
  const totalMembers = teamPulse.length;

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <ModernDashboardCard variant="default" style={styles.card}>

        {/* ── HEADER ── */}
        <TouchableOpacity
          onPress={() => setExpanded(v => !v)}
          activeOpacity={0.8}
          style={styles.headerRow}
        >
          <View style={styles.headerLeft}>
            <View style={styles.commandBadge}>
              <Text style={styles.commandBadgeText}>SERVICE COMMAND</Text>
            </View>
            <Text style={styles.serviceName} numberOfLines={1}>
              {nextService?.service_name || nextService?.org_name || 'No upcoming service'}
            </Text>
          </View>
          <View style={styles.headerRight}>
            {countdown ? (
              <View style={styles.countdownPill}>
                <Text style={styles.countdownText}>⏱ {countdown}</Text>
              </View>
            ) : null}
            {totalMembers > 0 && (
              <View style={styles.readinessPill}>
                <Text style={styles.readinessText}>{readyCount}/{totalMembers}</Text>
              </View>
            )}
            <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
          </View>
        </TouchableOpacity>

        {expanded && (
          <>
            {/* ── SECTION 1: TEAM HEARTBEAT ── */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>TEAM HEARTBEAT</Text>
              <View style={styles.sectionLine} />
            </View>

            {teamPulse.length === 0 ? (
              <Text style={styles.emptyHint}>
                Members appear here as they open the app today
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.heartbeatScroll}
                contentContainerStyle={styles.heartbeatContent}
              >
                {teamPulse.map((member, i) => {
                  const status = memberStatus(member.lastSeen);
                  const color  = STATUS_COLOR[status];
                  const bg     = STATUS_BG[status];
                  const ago    = member.lastSeen ? timeAgo(member.lastSeen) : 'not seen';
                  return (
                    <View key={i} style={[styles.memberChip, { backgroundColor: bg, borderColor: color + '55' }]}>
                      <View style={[styles.memberDot, { backgroundColor: color }]} />
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{member.name?.split(' ')[0] || '—'}</Text>
                        <Text style={[styles.memberRole, { color }]}>{member.role || '—'}</Text>
                      </View>
                      <Text style={styles.memberTime}>{ago}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* ── SECTION 2: SERVICE ENERGY ARC ── */}
            {songs.length > 0 && (
              <>
                <View style={[styles.sectionHeader, { marginTop: 18 }]}>
                  <Text style={styles.sectionLabel}>SERVICE ENERGY ARC</Text>
                  <View style={styles.sectionLine} />
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.arcWrapper}
                >
                  <View style={styles.arcBarsRow}>
                    {songs.map((song, i) => {
                      const energy  = songEnergy(song, i, songs.length);
                      const targetH = arcBarMaxH * energy.heightPct;
                      const animH   = barAnims.current[i]
                        ? barAnims.current[i].interpolate({
                            inputRange: [0, 1],
                            outputRange: [2, targetH],
                          })
                        : targetH;

                      // Detect sharp transition to next song
                      const nextSong = songs[i + 1];
                      const nextEnergy = nextSong ? songEnergy(nextSong, i + 1, songs.length) : null;
                      const hasJump = nextEnergy && Math.abs(
                        ENERGY_MAP.findIndex(e => e.level === energy.level) -
                        ENERGY_MAP.findIndex(e => e.level === nextEnergy.level)
                      ) >= 2;

                      return (
                        <View key={i} style={styles.arcBarSlot}>
                          {/* Bar */}
                          <View style={[styles.arcBarTrack, { height: arcBarMaxH }]}>
                            <Animated.View
                              style={[
                                styles.arcBar,
                                { height: animH, backgroundColor: energy.color },
                              ]}
                            />
                          </View>
                          {/* Song number */}
                          <Text style={styles.arcBarNum}>S{i + 1}</Text>
                          {/* Key below */}
                          {song.key ? (
                            <Text style={[styles.arcBarKey, { color: energy.color }]}>
                              {song.key}
                            </Text>
                          ) : null}
                          {/* Jump warning between bars */}
                          {hasJump && (
                            <View style={styles.jumpDot} />
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* Legend */}
                  <View style={styles.arcLegend}>
                    {ENERGY_MAP.slice(0, 3).map(e => (
                      <View key={e.level} style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: e.color }]} />
                        <Text style={styles.legendLabel}>{e.label}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>

                {/* Song titles strip */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.titlesStrip}
                >
                  {songs.map((song, i) => (
                    <View key={i} style={styles.titleItem}>
                      <Text style={styles.titleText} numberOfLines={1}>
                        {song.title || `Song ${i + 1}`}
                      </Text>
                      {song.tempo || song.bpm ? (
                        <Text style={styles.bpmText}>
                          {song.tempo || song.bpm} BPM
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

            {/* ── SECTION 3: THE BRIEF ── */}
            <View style={[styles.sectionHeader, { marginTop: 18 }]}>
              <Text style={styles.sectionLabel}>THE BRIEF</Text>
              <View style={styles.sectionLine} />
            </View>

            {briefs.map((brief, i) => (
              <View key={i} style={[styles.briefCard, { backgroundColor: brief.bg, borderLeftColor: brief.color }]}>
                <Text style={styles.briefIcon}>{brief.icon}</Text>
                <Text style={[styles.briefText, { color: brief.color === '#10B981' ? '#10B981' : '#CBD5E1' }]}>
                  {brief.text}
                </Text>
              </View>
            ))}

            {/* ── Footer quick-action ── */}
            {onNavigate && (
              <TouchableOpacity
                style={styles.footerAction}
                onPress={() => onNavigate('Setlist')}
                activeOpacity={0.75}
              >
                <Text style={styles.footerActionText}>Open Setlist  →</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ModernDashboardCard>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    paddingBottom: 20,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  headerLeft: { flex: 1, marginRight: 8 },
  commandBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 6,
  },
  commandBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#38BDF8',
    letterSpacing: 1.2,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F1F5F9',
    letterSpacing: 0.2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  countdownPill: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countdownText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10B981',
  },
  readinessPill: {
    backgroundColor: 'rgba(56,189,248,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.2)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  readinessText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
  },
  chevron: {
    fontSize: 10,
    color: '#475569',
    marginLeft: 2,
  },

  // Section labels
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 1.4,
    marginRight: 8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(71,85,105,0.3)',
  },
  emptyHint: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
    paddingVertical: 4,
  },

  // Team heartbeat
  heartbeatScroll: { marginHorizontal: -4 },
  heartbeatContent: { paddingHorizontal: 4, gap: 8 },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
    minWidth: 140,
  },
  memberDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  memberInfo: { flex: 1 },
  memberName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  memberRole: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  memberTime: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
  },

  // Service arc
  arcWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 4,
    gap: 12,
  },
  arcBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  arcBarSlot: {
    width: 36,
    alignItems: 'center',
    position: 'relative',
  },
  arcBarTrack: {
    width: 20,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(30,41,59,0.6)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  arcBar: {
    width: '100%',
    borderRadius: 4,
  },
  arcBarNum: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 4,
  },
  arcBarKey: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  jumpDot: {
    position: 'absolute',
    right: -4,
    top: '30%',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  arcLegend: {
    gap: 6,
    justifyContent: 'center',
    paddingLeft: 8,
    paddingBottom: 16,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
  },
  titlesStrip: {
    paddingTop: 2,
    gap: 6,
  },
  titleItem: {
    width: 36,
    alignItems: 'center',
  },
  titleText: {
    fontSize: 8,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
    width: 42,
  },
  bpmText: {
    fontSize: 7,
    color: '#334155',
    marginTop: 1,
    textAlign: 'center',
  },

  // Brief
  briefCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    gap: 8,
  },
  briefIcon: {
    fontSize: 14,
    lineHeight: 18,
  },
  briefText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },

  // Footer
  footerAction: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(56,189,248,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.2)',
  },
  footerActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
  },
});
