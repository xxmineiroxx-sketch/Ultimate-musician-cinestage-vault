import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Alert,
  StatusBar,
} from 'react-native';

import {
  getPlanTeamMembers,
  getPCOPeople,
  schedulePerson,
  updateTeamMemberStatus,
  unschedulePerson,
  getPersonBlockouts,
  isBlockedOut,
} from '../services/planningCenterService';
import { getCacheInfo, relativeTime } from '../services/offlineCache';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  C: '#34D399', // Confirmed
  D: '#EF4444', // Declined
  U: '#F59E0B', // Unconfirmed
  P: '#94A3B8', // Pending / default
};

const STATUS_LABELS = {
  C: '✓ Confirmed',
  D: '✗ Declined',
  U: '? Unconfirmed',
  P: 'Pending',
};

function statusKey(raw) {
  if (!raw) return 'P';
  const r = String(raw).toLowerCase();
  if (r === 'confirmed' || r === 'c') return 'C';
  if (r === 'declined' || r === 'd') return 'D';
  if (r === 'unconfirmed' || r === 'u') return 'U';
  return 'P';
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#3B82F6', '#EF4444', '#14B8A6',
];

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ name, size = 36 }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(name) }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{getInitials(name)}</Text>
    </View>
  );
}

// ─── Availability Dot ────────────────────────────────────────────────────────

function AvailDot({ blocked, known }) {
  const color = !known ? '#475569' : blocked ? '#EF4444' : '#34D399';
  return <View style={[styles.availDot, { backgroundColor: color }]} />;
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ raw }) {
  const k = statusKey(raw);
  return (
    <View style={[styles.badge, { borderColor: STATUS_COLORS[k] }]}>
      <Text style={[styles.badgeText, { color: STATUS_COLORS[k] }]}>{STATUS_LABELS[k]}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function PlanTeamScreen({ navigation, route }) {
  const { serviceTypeId, planId, planTitle, serviceDate, creds } = route.params || {};

  // ── State ──────────────────────────────────────────────────────────────────
  const [teamMembers, setTeamMembers] = useState([]);
  const [people, setPeople] = useState([]);
  const [blockouts, setBlockouts] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [cacheInfo, setCacheInfo] = useState(null);

  // Modals
  const [selectedPosition, setSelectedPosition] = useState(null); // { teamPositionId, teamName, positionName }
  const [selectedMember, setSelectedMember] = useState(null);     // { teamMemberId, personName, status, ... }
  const [searchQuery, setSearchQuery] = useState('');
  const [schedulingPersonId, setSchedulingPersonId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Load Data ──────────────────────────────────────────────────────────────
  const loadTeam = useCallback(async (isRefresh = false) => {
    if (!creds) {
      setError('Planning Center not connected. Go to Settings → Integrations to add your PCO credentials.');
      setLoading(false);
      return;
    }
    if (!serviceTypeId || !planId) {
      setError('No PCO plan linked to this service. Import the service from Planning Center first (Planning Center → Sync from PCO).');
      setLoading(false);
      return;
    }
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const members = await getPlanTeamMembers(serviceTypeId, planId, creds);
      setTeamMembers(members || []);

      const info = await getCacheInfo();
      setCacheInfo(info);
    } catch (err) {
      setError(err.message || 'Failed to load team.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serviceTypeId, planId, creds]);

  const loadPeople = useCallback(async () => {
    try {
      const list = await getPCOPeople(creds);
      setPeople(list || []);
    } catch {
      // non-fatal
    }
  }, [creds]);

  useEffect(() => {
    loadTeam();
    loadPeople();
  }, [loadTeam, loadPeople]);

  // ── Blockout lazy loader ───────────────────────────────────────────────────
  const fetchBlockout = useCallback(async (personId) => {
    if (!personId || blockouts.has(personId)) return;
    try {
      const data = await getPersonBlockouts(personId, creds);
      setBlockouts(prev => new Map(prev).set(personId, data || []));
    } catch {
      setBlockouts(prev => new Map(prev).set(personId, []));
    }
  }, [blockouts, creds]);

  // ── Grouping ───────────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map();
    for (const m of teamMembers) {
      const key = m.teamName || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return Array.from(map.entries()).map(([name, members]) => ({ name, members }));
  }, [teamMembers]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let confirmed = 0, pending = 0, declined = 0;
    for (const m of teamMembers) {
      const k = statusKey(m.status);
      if (k === 'C') confirmed++;
      else if (k === 'D') declined++;
      else pending++;
    }
    return { total: teamMembers.length, confirmed, pending, declined };
  }, [teamMembers]);

  // ── Action Sheet handlers ──────────────────────────────────────────────────
  const handleMemberTap = (member) => {
    setSelectedMember(member);
    fetchBlockout(member.personId);
  };

  const handleStatusUpdate = async (newStatus) => {
    if (!selectedMember) return;
    setActionLoading(true);
    try {
      await updateTeamMemberStatus(selectedMember.teamMemberId, newStatus, creds);
      setTeamMembers(prev =>
        prev.map(m =>
          m.teamMemberId === selectedMember.teamMemberId
            ? { ...m, status: newStatus }
            : m
        )
      );
      setSelectedMember(null);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnschedule = async () => {
    if (!selectedMember) return;
    Alert.alert(
      'Remove from Schedule',
      `Remove ${selectedMember.personName} from this position?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await unschedulePerson(selectedMember.teamMemberId, creds);
              setTeamMembers(prev =>
                prev.filter(m => m.teamMemberId !== selectedMember.teamMemberId)
              );
              setSelectedMember(null);
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not remove person.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // ── Person Picker ──────────────────────────────────────────────────────────
  const handleOpenPicker = (position) => {
    setSelectedPosition(position);
    setSearchQuery('');
  };

  const handleSchedule = async (person) => {
    if (!selectedPosition || schedulingPersonId) return;
    setSchedulingPersonId(person.id);
    try {
      const newMember = await schedulePerson(
        serviceTypeId,
        planId,
        selectedPosition.teamPositionId,
        person.id,
        creds
      );
      setTeamMembers(prev => [
        ...prev,
        {
          teamMemberId: newMember?.id || `tmp-${Date.now()}`,
          personId: person.id,
          personName: person.fullName || person.name,
          positionName: selectedPosition.positionName,
          teamName: selectedPosition.teamName,
          status: 'U',
          teamPositionId: selectedPosition.teamPositionId,
        },
      ]);
      setSelectedPosition(null);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not schedule person.');
    } finally {
      setSchedulingPersonId(null);
    }
  };

  const filteredPeople = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return people;
    return people.filter(p =>
      (p.fullName || p.name || '').toLowerCase().includes(q)
    );
  }, [people, searchQuery]);

  // ── Formatted date ─────────────────────────────────────────────────────────
  const formattedDate = useMemo(() => {
    if (!serviceDate) return '';
    try {
      return new Date(serviceDate).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      });
    } catch {
      return serviceDate;
    }
  }, [serviceDate]);

  const syncLabel = useMemo(() => {
    if (!cacheInfo?.lastSync) return 'Not synced';
    return `Synced ${relativeTime(cacheInfo.lastSync)}`;
  }, [cacheInfo]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Team Schedule</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {planTitle}{formattedDate ? `  ·  ${formattedDate}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.syncBtn}
          onPress={() => loadTeam(true)}
          disabled={refreshing}
        >
          <Text style={styles.syncBtnText}>{refreshing ? '…' : 'Sync'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Online badge + last synced ── */}
      <View style={styles.syncBar}>
        <View style={[styles.onlineBadge, { backgroundColor: cacheInfo?.isOnline === false ? '#7F1D1D' : '#14532D' }]}>
          <View style={[styles.onlineDot, { backgroundColor: cacheInfo?.isOnline === false ? '#EF4444' : '#34D399' }]} />
          <Text style={styles.onlineBadgeText}>{cacheInfo?.isOnline === false ? 'Offline' : 'Online'}</Text>
        </View>
        <Text style={styles.syncLabel}>{syncLabel}</Text>
      </View>

      {/* ── Body ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#818CF8" />
          <Text style={styles.loadingText}>Loading team…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { textAlign: 'center', paddingHorizontal: 24 }]}>{error}</Text>
          {!creds ? (
            <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.navigate('Settings')}>
              <Text style={styles.retryText}>Go to Settings →</Text>
            </TouchableOpacity>
          ) : !serviceTypeId || !planId ? (
            <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.navigate('PCOImport')}>
              <Text style={styles.retryText}>Import from PCO →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadTeam()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadTeam(true)}
              tintColor="#818CF8"
            />
          }
        >
          {grouped.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No team members found for this plan.</Text>
            </View>
          )}

          {grouped.map(({ name: teamName, members }) => (
            <View key={teamName} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{teamName}</Text>
                <Text style={styles.sectionCount}>{members.length}</Text>
              </View>

              {members.map((member) => {
                const bouts = blockouts.get(member.personId);
                const blocked = bouts !== undefined ? isBlockedOut(bouts, serviceDate) : false;
                const knownAvail = bouts !== undefined;

                return (
                  <TouchableOpacity
                    key={member.teamMemberId}
                    style={styles.memberRow}
                    onPress={() => handleMemberTap(member)}
                    activeOpacity={0.75}
                  >
                    {member.personId ? (
                      <Avatar name={member.personName} size={40} />
                    ) : (
                      <View style={[styles.avatar, styles.emptySlot]}>
                        <Text style={styles.emptySlotPlus}>+</Text>
                      </View>
                    )}

                    <View style={styles.memberInfo}>
                      <Text style={styles.positionName}>{member.positionName}</Text>
                      {member.personName ? (
                        <Text style={styles.personName}>{member.personName}</Text>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleOpenPicker({
                            teamPositionId: member.teamPositionId,
                            teamName,
                            positionName: member.positionName,
                          })}
                        >
                          <Text style={styles.emptySlotText}>Tap to assign →</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.memberRight}>
                      {member.personName && <StatusBadge raw={member.status} />}
                      {member.personId && (
                        <AvailDot blocked={blocked} known={knownAvail} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* Spacer for stats bar */}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* ── Stats Bar ── */}
      {!loading && !error && (
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{stats.total}</Text>
            <Text style={styles.statLabel}>Scheduled</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: STATUS_COLORS.C }]}>{stats.confirmed}</Text>
            <Text style={styles.statLabel}>Confirmed</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: STATUS_COLORS.U }]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: STATUS_COLORS.D }]}>{stats.declined}</Text>
            <Text style={styles.statLabel}>Declined</Text>
          </View>
        </View>
      )}

      {/* ── Action Sheet Modal ── */}
      <Modal
        visible={!!selectedMember}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMember(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => !actionLoading && setSelectedMember(null)}
        >
          <View style={styles.actionSheet}>
            {selectedMember && (
              <>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHeader}>
                  <Avatar name={selectedMember.personName} size={44} />
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.sheetName}>{selectedMember.personName}</Text>
                    <Text style={styles.sheetPosition}>{selectedMember.positionName}</Text>
                  </View>
                </View>

                {actionLoading ? (
                  <ActivityIndicator color="#818CF8" style={{ marginVertical: 24 }} />
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.actionRow, { borderColor: STATUS_COLORS.C }]}
                      onPress={() => handleStatusUpdate('confirmed')}
                    >
                      <Text style={[styles.actionText, { color: STATUS_COLORS.C }]}>Mark Confirmed</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionRow, { borderColor: STATUS_COLORS.D }]}
                      onPress={() => handleStatusUpdate('declined')}
                    >
                      <Text style={[styles.actionText, { color: STATUS_COLORS.D }]}>Mark Declined</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionRow, styles.actionRowDanger]}
                      onPress={handleUnschedule}
                    >
                      <Text style={[styles.actionText, { color: '#EF4444' }]}>Remove from Schedule</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionRowCancel}
                      onPress={() => setSelectedMember(null)}
                    >
                      <Text style={styles.actionCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Person Picker Modal ── */}
      <Modal
        visible={!!selectedPosition}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPosition(null)}
      >
        <View style={styles.pickerModal}>
          <SafeAreaView style={styles.pickerInner}>
            {/* Picker header */}
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={() => setSelectedPosition(null)}>
                <Text style={styles.pickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.pickerTitle} numberOfLines={1}>
                Assign: {selectedPosition?.positionName}
              </Text>
              <View style={{ width: 60 }} />
            </View>

            {/* Search */}
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search people…"
                placeholderTextColor="#475569"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearSearch}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* People list */}
            {people.length === 0 ? (
              <View style={styles.center}>
                <ActivityIndicator color="#818CF8" />
                <Text style={styles.loadingText}>Loading people…</Text>
              </View>
            ) : (
              <FlatList
                data={filteredPeople}
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const name = item.fullName || item.name || 'Unknown';
                  const bouts = blockouts.get(item.id);
                  const blocked = bouts !== undefined ? isBlockedOut(bouts, serviceDate) : false;
                  const known = bouts !== undefined;
                  const isScheduling = schedulingPersonId === item.id;

                  return (
                    <TouchableOpacity
                      style={styles.personRow}
                      onPress={() => handleSchedule(item)}
                      disabled={!!schedulingPersonId}
                      activeOpacity={0.75}
                    >
                      <Avatar name={name} size={38} />
                      <View style={styles.personInfo}>
                        <Text style={styles.personRowName}>{name}</Text>
                        {item.role && <Text style={styles.personRole}>{item.role}</Text>}
                      </View>
                      <View style={styles.personRowRight}>
                        <AvailDot blocked={blocked} known={known} />
                        {isScheduling
                          ? <ActivityIndicator size="small" color="#818CF8" style={{ marginLeft: 10 }} />
                          : <Text style={styles.assignArrow}>›</Text>
                        }
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No people match "{searchQuery}"</Text>
                }
                contentContainerStyle={{ paddingBottom: 40 }}
              />
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#020617',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#020617',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    color: '#818CF8',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 1,
  },
  syncBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#818CF8',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  syncBtnText: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Sync bar ────────────────────────────────────────────────────────────────
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#0B1220',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 8,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onlineBadgeText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  syncLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },

  // ── Section ─────────────────────────────────────────────────────────────────
  section: {
    marginBottom: 20,
    backgroundColor: '#0B1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  sectionTitle: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionCount: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },

  // ── Member row ──────────────────────────────────────────────────────────────
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  positionName: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  personName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  emptySlotText: {
    color: '#818CF8',
    fontSize: 13,
    fontStyle: 'italic',
  },
  memberRight: {
    alignItems: 'flex-end',
    gap: 6,
  },

  // ── Avatar ──────────────────────────────────────────────────────────────────
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
  },
  emptySlot: {
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#818CF8',
    borderStyle: 'dashed',
  },
  emptySlotPlus: {
    color: '#818CF8',
    fontSize: 20,
    fontWeight: '300',
  },

  // ── Badge ───────────────────────────────────────────────────────────────────
  badge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Availability dot ────────────────────────────────────────────────────────
  availDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 2,
  },

  // ── Stats bar ────────────────────────────────────────────────────────────────
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1220',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#1E293B',
  },

  // ── Action Sheet ─────────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#0B1220',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#1E293B',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  sheetName: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
  },
  sheetPosition: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  actionRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#111827',
  },
  actionRowDanger: {
    borderColor: '#7F1D1D',
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  actionRowCancel: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  actionCancelText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '500',
  },

  // ── Person Picker ────────────────────────────────────────────────────────────
  pickerModal: {
    flex: 1,
    backgroundColor: '#020617',
    marginTop: 60,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  pickerInner: {
    flex: 1,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0B1220',
  },
  pickerCancel: {
    color: '#818CF8',
    fontSize: 15,
    fontWeight: '500',
    width: 60,
  },
  pickerTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    backgroundColor: '#0B1220',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearch: {
    color: '#475569',
    fontSize: 14,
    paddingLeft: 8,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  personInfo: {
    flex: 1,
    marginLeft: 12,
  },
  personRowName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  personRole: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  personRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assignArrow: {
    color: '#818CF8',
    fontSize: 22,
    fontWeight: '300',
  },
  separator: {
    height: 1,
    backgroundColor: '#1E293B',
    marginLeft: 70,
  },

  // ── Generic ──────────────────────────────────────────────────────────────────
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 32,
  },
  retryBtn: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: {
    color: '#818CF8',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#475569',
    fontSize: 14,
    textAlign: 'center',
  },
});
