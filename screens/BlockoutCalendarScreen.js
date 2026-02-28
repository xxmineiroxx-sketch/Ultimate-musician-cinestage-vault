/**
 * BlockoutCalendarScreen — Musician side
 * Lets a musician view the calendar and tap dates to mark themselves
 * as unavailable. Writes to the shared 'um/blockouts/v1' AsyncStorage key
 * so the admin/organizer can see team conflicts in CalendarScreen.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  getBlockoutsForUser,
  addBlockout,
  removeBlockout,
} from '../data/blockoutsStore';
import { useAuth } from '../context/AuthContext';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

// ─── Blockout Row ─────────────────────────────────────────────────────────────
function BlockoutRow({ blockout, onRemove }) {
  return (
    <View style={styles.blockoutRow}>
      <View style={styles.blockoutLeft}>
        <View style={styles.blockoutDot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.blockoutDate}>{formatDisplayDate(blockout.date)}</Text>
          <Text style={styles.blockoutReason}>{blockout.reason}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
        <Text style={styles.removeBtnText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function BlockoutCalendarScreen({ navigation }) {
  const { userId, token } = useAuth();
  const displayName = userId ? (token ? `User-${userId.slice(-4)}` : 'Guest') : 'Team Member';
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [myBlockouts, setMyBlockouts] = useState([]);

  // Modal state for adding a blockout
  const [modalVisible, setModalVisible] = useState(false);
  const [pendingDate, setPendingDate] = useState('');
  const [reason, setReason] = useState('Not available');

  const refresh = useCallback(async () => {
    if (!userId) return;
    const blockouts = await getBlockoutsForUser(userId);
    setMyBlockouts(blockouts);
  }, [userId]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', refresh);
    refresh();
    return unsub;
  }, [navigation, refresh]);

  // Set of my blocked date strings
  const myBlockedSet = useMemo(() => new Set(myBlockouts.map((b) => b.date)), [myBlockouts]);

  const calendarDays = useMemo(
    () => buildCalendarDays(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  // Upcoming & past blockouts
  const upcomingBlockouts = useMemo(() => {
    const t = todayStr();
    return [...myBlockouts].filter((b) => b.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  }, [myBlockouts]);

  const pastBlockouts = useMemo(() => {
    const t = todayStr();
    return [...myBlockouts].filter((b) => b.date < t).sort((a, b) => b.date.localeCompare(a.date));
  }, [myBlockouts]);

  function prevMonth() {
    if (currentMonth === 0) { setCurrentYear((y) => y - 1); setCurrentMonth(11); }
    else setCurrentMonth((m) => m - 1);
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentYear((y) => y + 1); setCurrentMonth(0); }
    else setCurrentMonth((m) => m + 1);
  }

  async function handleDayPress(date) {
    const dateStr = toDateStr(date);
    const isPast = dateStr < todayStr();

    if (isPast) {
      Alert.alert('Past date', 'You can only block out future dates.');
      return;
    }

    if (myBlockedSet.has(dateStr)) {
      // Already blocked — offer to remove
      const existing = myBlockouts.find((b) => b.date === dateStr);
      Alert.alert(
        'Remove blockout?',
        `${formatDisplayDate(dateStr)}\nReason: ${existing?.reason || 'Not available'}`,
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              if (existing) await removeBlockout(existing.id);
              refresh();
            },
          },
        ]
      );
    } else {
      // Open modal to add blockout
      setPendingDate(dateStr);
      setReason('Not available');
      setModalVisible(true);
    }
  }

  async function confirmAdd() {
    if (!userId) {
      Alert.alert('Not signed in', 'You must be signed in to add blockouts.');
      return;
    }
    await addBlockout({
      userId,
      name: displayName || 'Team Member',
      date: pendingDate,
      reason: reason.trim() || 'Not available',
    });
    setModalVisible(false);
    refresh();
  }

  async function handleRemove(blockout) {
    Alert.alert(
      'Remove blockout?',
      formatDisplayDate(blockout.date),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeBlockout(blockout.id);
            refresh();
          },
        },
      ]
    );
  }

  const tStr = todayStr();

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Info banner ───────────────────────────────────────── */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoText}>
            Tap a date to mark yourself as unavailable. Your admin will see blocked dates when scheduling services.
          </Text>
        </View>

        {/* ── Calendar ─────────────────────────────────────────── */}
        <View style={styles.calCard}>
          {/* Month Navigation */}
          <View style={styles.monthNav}>
            <TouchableOpacity style={styles.navBtn} onPress={prevMonth}>
              <Text style={styles.navBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {MONTHS[currentMonth]} {currentYear}
            </Text>
            <TouchableOpacity style={styles.navBtn} onPress={nextMonth}>
              <Text style={styles.navBtnText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={styles.weekRow}>
            {DAYS.map((d) => (
              <View key={d} style={styles.dayHeaderCell}>
                <Text style={styles.dayHeaderText}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.daysGrid}>
            {calendarDays.map((date, idx) => {
              if (!date) return <View key={`e${idx}`} style={styles.dayCell} />;

              const ds = toDateStr(date);
              const isToday = ds === tStr;
              const isBlocked = myBlockedSet.has(ds);
              const isPast = ds < tStr;

              return (
                <TouchableOpacity
                  key={ds}
                  style={[
                    styles.dayCell,
                    isToday && styles.todayCell,
                    isBlocked && styles.blockedCell,
                    isPast && styles.pastCell,
                  ]}
                  onPress={() => handleDayPress(date)}
                  activeOpacity={0.7}
                  disabled={isPast}
                >
                  <Text style={[
                    styles.dayNum,
                    isToday && styles.todayNum,
                    isBlocked && styles.blockedNum,
                    isPast && styles.pastNum,
                  ]}>
                    {date.getDate()}
                  </Text>
                  {isBlocked && <View style={styles.blockedDot} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.legendText}>My blockout</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4F46E5', borderWidth: 1, borderColor: '#818CF8' }]} />
              <Text style={styles.legendText}>Today</Text>
            </View>
          </View>
        </View>

        {/* ── My upcoming blockouts ─────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            My Unavailable Dates
            <Text style={styles.sectionCount}> ({upcomingBlockouts.length})</Text>
          </Text>

          {upcomingBlockouts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No upcoming blockouts. Tap a date above to mark yourself as unavailable.</Text>
            </View>
          ) : (
            upcomingBlockouts.map((b) => (
              <BlockoutRow key={b.id} blockout={b} onRemove={() => handleRemove(b)} />
            ))
          )}
        </View>

        {/* ── Past blockouts ────────────────────────────────────── */}
        {pastBlockouts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: '#4B5563' }]}>
              Past Blockouts
              <Text style={styles.sectionCount}> ({pastBlockouts.length})</Text>
            </Text>
            {pastBlockouts.map((b) => (
              <BlockoutRow key={b.id} blockout={b} onRemove={() => handleRemove(b)} />
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Add Blockout Modal ────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Block Out Date</Text>
            <Text style={styles.modalDate}>{formatDisplayDate(pendingDate)}</Text>

            <Text style={styles.modalLabel}>Reason (optional)</Text>
            <TextInput
              style={styles.modalInput}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Vacation, Sick, Family event"
              placeholderTextColor="#4B5563"
              autoCapitalize="sentences"
              maxLength={80}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={confirmAdd}
              >
                <Text style={styles.modalBtnConfirmText}>Mark Unavailable</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020617',
  },
  scroll: {
    padding: 16,
  },

  infoBanner: {
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3730A3',
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    color: '#A5B4FC',
    fontSize: 13,
    lineHeight: 18,
  },

  // Calendar card
  calCard: {
    backgroundColor: '#0B1120',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 16,
    marginBottom: 20,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navBtn: {
    width: 36,
    height: 36,
    backgroundColor: '#1F2937',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    color: '#E5E7EB',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  monthLabel: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '800',
  },

  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayHeaderText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    padding: 2,
  },
  todayCell: {
    backgroundColor: '#1E1B4B',
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  blockedCell: {
    backgroundColor: '#450A0A',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  pastCell: {
    opacity: 0.3,
  },
  dayNum: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
  },
  todayNum: {
    color: '#818CF8',
    fontWeight: '800',
  },
  blockedNum: {
    color: '#FCA5A5',
    fontWeight: '800',
  },
  pastNum: {
    color: '#6B7280',
  },
  blockedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#EF4444',
    marginTop: 2,
  },

  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#6B7280',
    fontSize: 11,
  },

  // Sections
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  sectionCount: {
    color: '#6B7280',
    fontWeight: '400',
    fontSize: 13,
  },

  // Blockout row
  blockoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7F1D1D',
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  blockoutLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  blockoutDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    flexShrink: 0,
    marginTop: 2,
  },
  blockoutDate: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '700',
  },
  blockoutReason: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  removeBtn: {
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  removeBtnText: {
    color: '#FCA5A5',
    fontWeight: '700',
    fontSize: 12,
  },

  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#4B5563',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  modalDate: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 20,
  },
  modalLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    color: '#F9FAFB',
    fontSize: 14,
    padding: 12,
    marginBottom: 20,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: '#1F2937',
  },
  modalBtnCancelText: {
    color: '#9CA3AF',
    fontWeight: '700',
  },
  modalBtnConfirm: {
    backgroundColor: '#991B1B',
  },
  modalBtnConfirmText: {
    color: '#FCA5A5',
    fontWeight: '800',
  },
});
