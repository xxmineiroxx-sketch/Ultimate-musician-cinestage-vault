import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';

/**
 * PreparationHub — Real-data readiness widget for regular team members.
 * Shows actual assignment response rate, upcoming services, roles, and next service countdown.
 */
export default function PreparationHub({ assignments = [], upcomingServices = [], profile, onNavigate }) {
  // ── Compute real metrics ─────────────────────────────────────────────
  const metrics = useMemo(() => {
    const upcoming = assignments.filter(a => {
      if (a.status === 'declined') return false;
      const d = new Date(String(a.service_date || '').includes('T') ? a.service_date : (a.service_date || '') + 'T00:00:00');
      return d >= new Date(new Date().setHours(0, 0, 0, 0));
    });

    const total    = upcoming.length;
    const accepted = upcoming.filter(a => a.status === 'accepted').length;
    const pending  = upcoming.filter(a => a.status === 'pending').length;
    const score    = total > 0 ? Math.round((accepted / total) * 100) : 0;

    // Unique roles
    const roles = [...new Set(upcoming.map(a => a.role).filter(Boolean))];

    // Next service
    const sorted = [...upcomingServices].sort((g1, g2) =>
      new Date(g1[0]?.service_date) - new Date(g2[0]?.service_date)
    );
    const nextGroup = sorted[0] || null;
    const nextSvc   = nextGroup?.[0] || null;

    // Days until next service
    let daysUntil = null;
    if (nextSvc?.service_date) {
      const svcDate = new Date(String(nextSvc.service_date).includes('T') ? nextSvc.service_date : nextSvc.service_date + 'T00:00:00');
      svcDate.setHours(0, 0, 0, 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      daysUntil = Math.round((svcDate - today) / 86400000);
    }

    // Total songs across upcoming setlists (if songs are attached to assignments)
    const songs = [...new Set(
      upcoming.flatMap(a => (a.songs || []).map(s => s.id || s.title)).filter(Boolean)
    )];

    return { total, accepted, pending, score, roles, nextSvc, daysUntil, songCount: songs.length };
  }, [assignments, upcomingServices]);

  // ── Animations ───────────────────────────────────────────────────────
  const scoreAnim  = useRef(new Animated.Value(0)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scoreAnim, {
        toValue: metrics.score,
        duration: 1400,
        easing: Easing.out(Easing.exp),
        useNativeDriver: false,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    if (metrics.pending > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [metrics.score]);

  // ── Score ring color ─────────────────────────────────────────────────
  const ringColor = metrics.score >= 80 ? '#10B981'
    : metrics.score >= 50 ? '#F59E0B'
    : metrics.score > 0   ? '#EF4444'
    : '#374151';

  // ── Day label ────────────────────────────────────────────────────────
  const dayLabel = metrics.daysUntil === 0 ? 'TODAY'
    : metrics.daysUntil === 1 ? 'TOMORROW'
    : metrics.daysUntil != null ? `IN ${metrics.daysUntil} DAYS`
    : null;

  // ── Status label ────────────────────────────────────────────────────
  const statusLabel = metrics.total === 0 ? { text: 'NO UPCOMING SERVICES', color: '#6B7280' }
    : metrics.pending > 0     ? { text: `${metrics.pending} RESPONSE${metrics.pending > 1 ? 'S' : ''} NEEDED`, color: '#F59E0B' }
    : metrics.score === 100   ? { text: 'ALL SET ✓', color: '#10B981' }
    : { text: 'IN PROGRESS', color: '#38BDF8' };

  if (metrics.total === 0) {
    // Empty state — no assignments
    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Preparation Hub</Text>
          <View style={[styles.statusBadge, { borderColor: '#374151' }]}>
            <Text style={[styles.statusText, { color: '#6B7280' }]}>NO SERVICES</Text>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎵</Text>
          <Text style={styles.emptyTitle}>No upcoming assignments</Text>
          <Text style={styles.emptySubtitle}>Your worship leader will assign you to a service soon.</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Preparation Hub</Text>
        <Animated.View style={[styles.statusBadge, { borderColor: statusLabel.color + '50', transform: metrics.pending > 0 ? [{ scale: pulseAnim }] : [] }]}>
          <View style={[styles.statusDot, { backgroundColor: statusLabel.color }]} />
          <Text style={[styles.statusText, { color: statusLabel.color }]}>{statusLabel.text}</Text>
        </Animated.View>
      </View>

      {/* ── Main row: score ring + stats ── */}
      <View style={styles.mainRow}>
        {/* Score ring */}
        <View style={styles.ringWrap}>
          <View style={[styles.ringOuter, { borderColor: ringColor + '30' }]}>
            <View style={[styles.ringInner, { borderColor: ringColor }]}>
              <Animated.Text style={[styles.scoreNum, { color: ringColor }]}>
                {scoreAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', `${metrics.score}%`] })}
              </Animated.Text>
              <Text style={styles.scoreLabel}>READINESS</Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsCol}>
          <StatRow icon="📅" label="Services" value={`${metrics.total}`} />
          <StatRow icon="✅" label="Accepted" value={`${metrics.accepted}/${metrics.total}`} color={metrics.accepted === metrics.total ? '#10B981' : '#F9FAFB'} />
          {metrics.pending > 0 && (
            <StatRow icon="⏳" label="Pending" value={`${metrics.pending}`} color="#F59E0B" />
          )}
          {metrics.roles.length > 0 && (
            <StatRow icon="🎸" label="Your Role" value={metrics.roles.slice(0, 2).join(', ')} />
          )}
          {metrics.songCount > 0 && (
            <StatRow icon="🎵" label="Songs" value={`${metrics.songCount}`} />
          )}
        </View>
      </View>

      {/* ── Response progress bar ── */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Response Progress</Text>
          <Text style={styles.progressFraction}>{metrics.accepted}/{metrics.total}</Text>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, {
            width: scoreAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            backgroundColor: ringColor,
          }]} />
        </View>
      </View>

      {/* ── Next service countdown ── */}
      {metrics.nextSvc && dayLabel && (
        <View style={styles.nextServiceRow}>
          <View style={styles.nextServiceBadge}>
            <Text style={styles.nextServiceDay}>{dayLabel}</Text>
          </View>
          <Text style={styles.nextServiceName} numberOfLines={1}>
            {metrics.nextSvc.service_name || 'Service'}
          </Text>
          {metrics.nextSvc.service_time ? (
            <Text style={styles.nextServiceTime}>{metrics.nextSvc.service_time}</Text>
          ) : null}
        </View>
      )}

      {/* ── CTA if pending ── */}
      {metrics.pending > 0 && onNavigate && (
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => onNavigate('Assignments')}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaBtnTxt}>Respond to {metrics.pending} Assignment{metrics.pending > 1 ? 's' : ''} →</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

function StatRow({ icon, label, value, color = '#F9FAFB' }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#080F1E',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E2A40',
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 16,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    backgroundColor: '#0B1120',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNum: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  scoreLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  statsCol: {
    flex: 1,
    gap: 7,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statIcon: {
    fontSize: 12,
    width: 18,
    textAlign: 'center',
  },
  statLabel: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F9FAFB',
  },
  progressSection: {
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  progressFraction: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
  },
  progressTrack: {
    height: 5,
    backgroundColor: '#1F2937',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  nextServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0D1426',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E2A40',
    padding: 10,
    marginBottom: 10,
  },
  nextServiceBadge: {
    backgroundColor: '#1E1B4B',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nextServiceDay: {
    fontSize: 9,
    fontWeight: '900',
    color: '#818CF8',
    letterSpacing: 0.5,
  },
  nextServiceName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#E0E7FF',
  },
  nextServiceTime: {
    fontSize: 11,
    color: '#6B7280',
  },
  ctaBtn: {
    backgroundColor: '#1E1B4B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4F46E5',
    paddingVertical: 11,
    alignItems: 'center',
  },
  ctaBtnTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#818CF8',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 18,
  },
});
