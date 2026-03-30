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
    <View style={[styles.serviceRow, isPast && { opacity: 0.5 }]}>
      <View style={styles.serviceRowLeft}>
        <View
          style={[
            styles.serviceTypeDot,
            { backgroundColor: svc.isSpecial ? "#F59E0B" : "#4F46E5" },
          ]}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.serviceRowTitle}>{svc.title}</Text>
          <Text style={styles.serviceRowSub}>
            {formatDisplayDate(svc.date)} · {svc.time} ·{" "}
            {humanStatus(svc.status)}
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 12,
    marginBottom: 16,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  navBtn: {
    width: 30,
    height: 30,
    backgroundColor: "#1F2937",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnText: {
    color: "#9CA3AF",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },
  monthLabel: {
    color: "#F9FAFB",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  weekRow: {
    flexDirection: "row",
    marginBottom: 0,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#161F30",
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 2,
  },
  dayHeaderText: {
    color: "#4B5563",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  dayCell: {
    width: "14.28%",
    height: 40,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 3,
  },
  pastCell: {
    opacity: 0.32,
  },
  dayNumWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  todayWrap: {
    backgroundColor: "#4F46E5",
  },
  selectedWrap: {
    backgroundColor: "#312E81",
    borderWidth: 1,
    borderColor: "#6366F1",
  },
  dayNum: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "500",
  },
  todayNum: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  selectedNum: {
    color: "#A5B4FC",
    fontWeight: "700",
  },
  pastNum: {
    color: "#374151",
  },
  dotRow: {
    flexDirection: "row",
    marginTop: 1,
    gap: 2,
    height: 4,
    alignItems: "center",
  },
  dotService: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#818CF8",
  },
  dotBlockout: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#EF4444",
  },

  legend: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#161F30",
    gap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    color: "#4B5563",
    fontSize: 10,
  },
  newServiceBtn: {
    marginLeft: "auto",
    backgroundColor: "#4F46E5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  newServiceBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },

  // Sections
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#D1D5DB",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sectionCount: {
    color: "#4B5563",
    fontWeight: "500",
    fontSize: 12,
    textTransform: "none",
  },
  archiveFolder: {
    backgroundColor: "#0B1120",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#243047",
    padding: 14,
    marginBottom: 10,
  },
  archiveFolderOpen: {
    borderColor: "#6366F1",
  },
  archiveFolderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  archiveFolderTitle: {
    color: "#E5E7EB",
    fontSize: 15,
    fontWeight: "800",
  },
  archiveFolderSub: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 4,
  },
  archiveFolderToggle: {
    color: "#818CF8",
    fontSize: 11,
    fontWeight: "700",
  },
  archiveFolderCountBadge: {
    minWidth: 28,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: "#312E81",
    borderWidth: 1,
    borderColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },
  archiveFolderCountText: {
    color: "#C7D2FE",
    fontSize: 11,
    fontWeight: "800",
  },

  // Service row
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 10,
    marginBottom: 6,
    gap: 10,
  },
  serviceRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
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
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "800",
  },
  serviceRowSub: {
    color: "#6B7280",
    fontSize: 11,
    marginTop: 2,
  },
  serviceRowSpecial: {
    color: "#F59E0B",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase",
  },
  serviceRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  openBtn: {
    backgroundColor: "#166534",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  openBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  deleteBtn: {
    backgroundColor: "#1F2937",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  deleteBtnText: {
    color: "#EF4444",
    fontWeight: "800",
    fontSize: 12,
  },

  emptyState: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    color: "#4B5563",
    fontSize: 13,
    textAlign: "center",
  },
});
