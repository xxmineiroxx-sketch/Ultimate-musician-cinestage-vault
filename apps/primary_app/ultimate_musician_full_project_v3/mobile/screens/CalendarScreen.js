import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActionSheetIOS,
  Platform,
} from "react-native";

import { getBlockedDateSet, getBlockoutsForDate } from "../data/blockoutsStore";
import {
  getServices,
  createService,
  deleteService,
  setActiveServiceId,
  humanStatus,
} from "../data/servicesStore";
import { SYNC_URL, syncHeaders } from "./config";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
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
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Upcoming Service Card ───────────────────────────────────────────────────
function ServiceRow({ svc, onOpen, onDelete }) {
  const isPast = svc.date < todayStr();
  return (
    <View style={[styles.serviceRow, isPast && { opacity: 0.6 }]}>
      <View style={styles.serviceRowLeft}>
        <View
          style={[
            styles.serviceTypeDot,
            { backgroundColor: svc.isSpecial ? "#F59E0B" : "#4F46E5", shadowColor: svc.isSpecial ? "#F59E0B" : "#4F46E5" },
          ]}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.serviceRowTitle}>{svc.title}</Text>
          <Text style={styles.serviceRowSub}>
            {formatDisplayDate(svc.date)} · {svc.time} ·{" "}
            <Text style={[styles.serviceRowStatus, { color: svc.status === 'published' ? '#10B981' : '#94A3B8' }]}>
              {humanStatus(svc.status)}
            </Text>
          </Text>
          {svc.isSpecial && (
            <View style={styles.specialBadge}>
              <Text style={styles.serviceRowSpecial}>{svc.serviceType}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.serviceRowActions}>
        <TouchableOpacity style={styles.openBtn} onPress={onOpen} activeOpacity={0.8}>
          <Text style={styles.openBtnText}>Open</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} activeOpacity={0.8}>
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
  const [showArchivedServices, setShowArchivedServices] = useState(false);

  const refresh = useCallback(async () => {
    const [svcs, blocked] = await Promise.all([
      getServices(),
      getBlockedDateSet(),
    ]);
    setAllServices(svcs);
    setBlockedDates(blocked);
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener("focus", refresh);
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

  const pastServices = useMemo(() => {
    const t = todayStr();
    return [...allServices]
      .filter((s) => s.date && s.date < t)
      .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
  }, [allServices]);

  const calendarDays = useMemo(
    () => buildCalendarDays(currentYear, currentMonth),
    [currentYear, currentMonth],
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
      const svcTitles = dayServices.map((s) => s.title).join(", ");
      const blockoutInfo =
        blockouts.length > 0
          ? `\n⚠️ ${blockouts.length} team member(s) unavailable: ${blockouts.map((b) => b.name).join(", ")}`
          : "";

      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: formatDisplayDate(dateStr),
            message: `Services: ${svcTitles}${blockoutInfo}`,
            options: [
              ...dayServices.map((s) => `Open: ${s.title}`),
              "+ Add Another Service",
              "Cancel",
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
          },
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
            {
              text: "+ Add Another Service",
              onPress: () => goToNewService(dateStr),
            },
            { text: "Cancel", style: "cancel" },
          ],
        );
      }
    } else {
      // Empty date — go straight to new service
      const blockoutInfo =
        blockouts.length > 0
          ? `\n⚠️ ${blockouts.map((b) => `${b.name}: ${b.reason}`).join("\n")}`
          : "";

      if (blockouts.length > 0) {
        Alert.alert(
          "Team Conflicts",
          `${blockouts.length} member(s) unavailable on ${formatDisplayDate(dateStr)}:${blockoutInfo}\n\nCreate a service anyway?`,
          [
            { text: "Create Service", onPress: () => goToNewService(dateStr) },
            { text: "Cancel", style: "cancel" },
          ],
        );
      } else {
        goToNewService(dateStr);
      }
    }
  }

  function goToNewService(dateStr) {
    navigation.navigate("NewService", { prefillDate: dateStr });
  }

  async function openServicePlan(svc) {
    await setActiveServiceId(svc.id);
    navigation.navigate("ServicePlan", {
      serviceId: svc.id,
      servicePlanId: svc.servicePlanId,
    });
  }

  async function confirmDelete(svc) {
    Alert.alert(
      "Delete service?",
      `${svc.title} on ${formatDisplayDate(svc.date)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${SYNC_URL}/sync/service/delete`, {
                method: "POST",
                headers: syncHeaders(),
                body: JSON.stringify({ serviceId: svc.id }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
            } catch {
              Alert.alert(
                "Cloud Sync Error",
                "The service was not removed from the shared cloud yet. Try again when the connection is stable.",
              );
              return;
            }
            await deleteService(svc.id);
            refresh();
          },
        },
      ],
    );
  }

  const tStr = todayStr();
  const selectedServices = selectedDate
    ? servicesByDate[selectedDate] || []
    : [];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
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
              const hasService = !!servicesByDate[ds]?.length;
              const isBlocked = blockedDates.has(ds);
              const isPast = ds < tStr;

              return (
                <TouchableOpacity
                  key={ds}
                  style={[styles.dayCell, isPast && styles.pastCell]}
                  onPress={() => handleDayPress(date)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.dayNumWrap,
                      isToday && styles.todayWrap,
                      isSelected && !isToday && styles.selectedWrap,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        isToday && styles.todayNum,
                        isSelected && styles.selectedNum,
                        isPast && !isToday && !isSelected && styles.pastNum,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </View>

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
              <View
                style={[styles.legendDot, { backgroundColor: "#4F46E5" }]}
              />
              <Text style={styles.legendText}>Service</Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: "#EF4444" }]}
              />
              <Text style={styles.legendText}>Team Conflict</Text>
            </View>
            <TouchableOpacity
              style={styles.newServiceBtn}
              onPress={() => goToNewService(selectedDate || "")}
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
            <Text style={styles.sectionCount}>
              {" "}
              ({upcomingServices.length})
            </Text>
          </Text>

          {upcomingServices.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No upcoming services. Tap a date to create one.
              </Text>
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

        {pastServices.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.archiveFolder, showArchivedServices && styles.archiveFolderOpen]}
              onPress={() => setShowArchivedServices((value) => !value)}
              activeOpacity={0.85}
            >
              <View style={styles.archiveFolderHeader}>
                <Text style={styles.archiveFolderTitle}>🗂 Archived Services</Text>
                <View style={styles.archiveFolderCountBadge}>
                  <Text style={styles.archiveFolderCountText}>{pastServices.length}</Text>
                </View>
              </View>
              <Text style={styles.archiveFolderSub}>
                {showArchivedServices ? "Hide previous services" : "Show previous services"}
              </Text>
              <Text style={styles.archiveFolderToggle}>
                {showArchivedServices ? "▲ Collapse Archive" : "▼ Open Archive"}
              </Text>
            </TouchableOpacity>

            {showArchivedServices &&
              pastServices.map((svc) => (
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
    backgroundColor: "#020617",
  },
  scroll: {
    padding: 14,
  },

  // Calendar card
  calCard: {
    backgroundColor: "#0B1120",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 720, // Stretched wider for iPad
  },
  monthNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  monthLabel: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  navBtn: {
    padding: 8,
    backgroundColor: "#1F2937",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 38,
  },
  navBtnText: { color: "#F8FAFC", fontSize: 20, fontWeight: "600", marginTop: -2 },
  weekRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: "center",
  },
  dayHeaderText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1.1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  todayWrap: {
    backgroundColor: "#1E1B4B",
    borderWidth: 1,
    borderColor: "#4F46E5",
  },
  selectedWrap: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#38BDF8",
    shadowColor: "#38BDF8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  dayNum: {
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: "600",
  },
  todayNum: { color: "#818CF8", fontWeight: "900" },
  selectedNum: { color: "#38BDF8", fontWeight: "900" },
  pastNum: { color: "#475569" },
  pastCell: { opacity: 0.8 },
  dotRow: {
    flexDirection: "row",
    marginTop: 2,
    gap: 3,
    height: 5,
    alignItems: "center",
  },
  dotService: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4F46E5",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  dotBlockout: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },

  // Legend
  legend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
  },
  legendText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  newServiceBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#4F46E5",
    borderRadius: 12,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  newServiceBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "800",
  },

  // Sections
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  sectionCount: { color: "#64748B", fontWeight: "600", fontSize: 16 },
  archiveFolder: {
    backgroundColor: "#0B1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 24,
    marginBottom: 16,
  },
  archiveFolderOpen: {
    backgroundColor: "#111827",
    borderColor: "#334155",
  },
  archiveFolderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  archiveFolderTitle: {
    color: "#94A3B8",
    fontSize: 18,
    fontWeight: "800",
  },
  archiveFolderCountBadge: {
    backgroundColor: "#334155",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  archiveFolderCountText: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "800",
  },
  archiveFolderSub: {
    color: "#64748B",
    fontSize: 14,
    marginBottom: 16,
  },
  archiveFolderToggle: {
    color: "#4F46E5",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // Service Row Styles
  serviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  serviceRowLeft: {
    flexDirection: "row",
    flex: 1,
    gap: 16,
  },
  serviceTypeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  serviceRowTitle: {
    color: "#F1F5F9",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  serviceRowSub: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "500",
  },
  serviceRowStatus: {
    fontWeight: "800",
  },
  specialBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#78350F",
    borderWidth: 1,
    borderColor: "#F59E0B",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  serviceRowSpecial: {
    color: "#FDE68A",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  serviceRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  openBtn: {
    backgroundColor: "#3730A3",
    borderWidth: 1,
    borderColor: "#4F46E5",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  openBtnText: {
    color: "#C7D2FE",
    fontSize: 14,
    fontWeight: "800",
  },
  deleteBtn: {
    backgroundColor: "#7F1D1D",
    borderWidth: 1,
    borderColor: "#EF4444",
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnText: {
    color: "#FCA5A5",
    fontSize: 16,
    fontWeight: "900",
  },

  // Empty State
  emptyState: {
    padding: 32,
    alignItems: "center",
    backgroundColor: "#0B1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    borderStyle: "dashed",
  },
  emptyText: { color: "#64748B", fontSize: 15, fontWeight: "500", textAlign: "center" },
});
