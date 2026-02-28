import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import {
  getServices,
  createService,
  deleteService,
  setActiveServiceId,
  humanStatus,
} from '../data/servicesStore';
import { getBlockedDateSet, getBlockoutsForDate } from '../data/blockoutsStore';

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

// ─── Upcoming Service Card ───────────────────────────────────────────────────
function ServiceRow({ svc, onOpen, onDelete }) {
  const isPast = svc.date < todayStr();
  return (
    <View style={[styles.serviceRow, isPast && { opacity: 0.5 }]}>
      <View style={styles.serviceRowLeft}>
        <View style={[styles.serviceTypeDot, { backgroundColor: svc.isSpecial ? '#F59E0B' : '#4F46E5' }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.serviceRowTitle}>{svc.title}</Text>
          <Text style={styles.serviceRowSub}>
            {formatDisplayDate(svc.date)} · {svc.time} · {humanStatus(svc.status)}
          </Text>
          {svc.isSpecial && (
            <Text style={styles.serviceRowSpecial}>{svc.serviceType}</Text>
          )}
        </View>
      </View>
      <View style={styles.serviceRowActions}>
        <TouchableOpacity style={styles.openBtn} onPress={onOpen}>
          <Text style={styles.openBtnText}>Open</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function CalendarScreen({ navigation }) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [allServices, setAllServices] = useState([]);
  const [blockedDates, setBlockedDates] = useState(new Set());

  const refresh = useCallback(async () => {
    const [svcs, blocked] = await Promise.all([
      getServices(),
      getBlockedDateSet(),
    ]);
    setAllServices(svcs);
    setBlockedDates(blocked);
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', refresh);
    refresh();
    return unsub;
  }, [navigation, refresh]);

  // Map dateStr → services[]
  const servicesByDate = useMemo(() => {
    const map = {};
    for (const svc of allServices) {
      if (!map[svc.date]) map[svc.date] = [];
      map[svc.date].push(svc);
    }
    return map;
  }, [allServices]);

  // Upcoming services (today onward, sorted)
  const upcomingServices = useMemo(() => {
    const t = todayStr();
    return [...allServices]
      .filter((s) => s.date >= t)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [allServices]);

  // Past services
  const pastServices = useMemo(() => {
    const t = todayStr();
    return [...allServices]
      .filter((s) => s.date < t)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [allServices]);

  const calendarDays = useMemo(
    () => buildCalendarDays(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDate(null);
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDate(null);
  }

  async function handleDayPress(date) {
    const dateStr = toDateStr(date);
    setSelectedDate(dateStr);

    const dayServices = servicesByDate[dateStr] || [];
    const blockouts = await getBlockoutsForDate(dateStr);

    if (dayServices.length > 0) {
      // Show options for existing service
      const svcTitles = dayServices.map((s) => s.title).join(', ');
      const blockoutInfo = blockouts.length > 0
        ? `\n⚠️ ${blockouts.length} team member(s) unavailable: ${blockouts.map((b) => b.name).join(', ')}`
        : '';

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: formatDisplayDate(dateStr),
            message: `Services: ${svcTitles}${blockoutInfo}`,
            options: [
              ...dayServices.map((s) => `Open: ${s.title}`),
              '+ Add Another Service',
              'Cancel',
            ],
            cancelButtonIndex: dayServices.length + 1,
            destructiveButtonIndex: -1,
          },
          (idx) => {
            if (idx < dayServices.length) {
              openServicePlan(dayServices[idx]);
            } else if (idx === dayServices.length) {
              goToNewService(dateStr);
            }
          }
        );
      } else {
        Alert.alert(
          formatDisplayDate(dateStr),
          `Services: ${svcTitles}${blockoutInfo}`,
          [
            ...dayServices.map((s) => ({
              text: `Open: ${s.title}`,
              onPress: () => openServicePlan(s),
            })),
            { text: '+ Add Another Service', onPress: () => goToNewService(dateStr) },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
    } else {
      // Empty date — go straight to new service
      const blockoutInfo = blockouts.length > 0
        ? `\n⚠️ ${blockouts.map((b) => `${b.name}: ${b.reason}`).join('\n')}`
        : '';

      if (blockouts.length > 0) {
        Alert.alert(
          'Team Conflicts',
          `${blockouts.length} member(s) unavailable on ${formatDisplayDate(dateStr)}:${blockoutInfo}\n\nCreate a service anyway?`,
          [
            { text: 'Create Service', onPress: () => goToNewService(dateStr) },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        goToNewService(dateStr);
      }
    }
  }

  function goToNewService(dateStr) {
    navigation.navigate('NewService', { prefillDate: dateStr });
  }

  async function openServicePlan(svc) {
    await setActiveServiceId(svc.id);
    navigation.navigate('ServicePlan', { serviceId: svc.id, servicePlanId: svc.servicePlanId });
  }

  async function confirmDelete(svc) {
    Alert.alert(
      'Delete service?',
      `${svc.title} on ${formatDisplayDate(svc.date)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteService(svc.id);
            refresh();
          },
        },
      ]
    );
  }

  const tStr = todayStr();
  const selectedServices = selectedDate ? (servicesByDate[selectedDate] || []) : [];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

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
              const isSelected = ds === selectedDate;
              const hasService = !!(servicesByDate[ds]?.length);
              const isBlocked = blockedDates.has(ds);
              const isPast = ds < tStr;

              return (
                <TouchableOpacity
                  key={ds}
                  style={[
                    styles.dayCell,
                    isToday && styles.todayCell,
                    isSelected && styles.selectedCell,
                    isPast && styles.pastCell,
                  ]}
                  onPress={() => handleDayPress(date)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.dayNum,
                    isToday && styles.todayNum,
                    isSelected && styles.selectedNum,
                    isPast && styles.pastNum,
                  ]}>
                    {date.getDate()}
                  </Text>

                  {/* Dot row: service (indigo) + blockout (red) */}
                  <View style={styles.dotRow}>
                    {hasService && <View style={styles.dotService} />}
                    {isBlocked && <View style={styles.dotBlockout} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4F46E5' }]} />
              <Text style={styles.legendText}>Service</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.legendText}>Team Conflict</Text>
            </View>
            <TouchableOpacity
              style={styles.newServiceBtn}
              onPress={() => goToNewService(selectedDate || '')}
            >
              <Text style={styles.newServiceBtnText}>+ New Service</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Selected date detail ──────────────────────────────── */}
        {selectedDate && selectedServices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {formatDisplayDate(selectedDate)}
            </Text>
            {selectedServices.map((svc) => (
              <ServiceRow
                key={svc.id}
                svc={svc}
                onOpen={() => openServicePlan(svc)}
                onDelete={() => confirmDelete(svc)}
              />
            ))}
          </View>
        )}

        {/* ── Upcoming Services ─────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Upcoming Services
            <Text style={styles.sectionCount}> ({upcomingServices.length})</Text>
          </Text>

          {upcomingServices.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No upcoming services. Tap a date to create one.</Text>
            </View>
          ) : (
            upcomingServices.map((svc) => (
              <ServiceRow
                key={svc.id}
                svc={svc}
                onOpen={() => openServicePlan(svc)}
                onDelete={() => confirmDelete(svc)}
              />
            ))
          )}
        </View>

        {/* ── Past Services ─────────────────────────────────────── */}
        {pastServices.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: '#4B5563' }]}>
              Past Services
              <Text style={styles.sectionCount}> ({pastServices.length})</Text>
            </Text>
            {pastServices.map((svc) => (
              <ServiceRow
                key={svc.id}
                svc={svc}
                onOpen={() => openServicePlan(svc)}
                onDelete={() => confirmDelete(svc)}
              />
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
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
  selectedCell: {
    backgroundColor: '#4F46E5',
  },
  pastCell: {
    opacity: 0.35,
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
  selectedNum: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  pastNum: {
    color: '#6B7280',
  },
  dotRow: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 2,
    height: 5,
    alignItems: 'center',
  },
  dotService: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#818CF8',
  },
  dotBlockout: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },

  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    gap: 12,
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
  newServiceBtn: {
    marginLeft: 'auto',
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newServiceBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
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

  // Service row
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  serviceRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  serviceTypeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 2,
    flexShrink: 0,
  },
  serviceRowTitle: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '800',
  },
  serviceRowSub: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  serviceRowSpecial: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  serviceRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  openBtn: {
    backgroundColor: '#166534',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  openBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  deleteBtn: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  deleteBtnText: {
    color: '#EF4444',
    fontWeight: '800',
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
  },
});
