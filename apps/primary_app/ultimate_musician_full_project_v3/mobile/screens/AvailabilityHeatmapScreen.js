/**
 * AvailabilityHeatmapScreen.js
 * Team availability overview for worship leaders.
 * Shows a month-view heatmap of team coverage + per-person availability dots.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPeople } from "../data/storage";
import {
  getBlockouts,
  addBlockout,
  removeBlockout,
} from "../data/blockoutsStore";
import { SYNC_URL, syncHeaders } from "./config";

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

function getNextSunday() {
  const today = new Date();
  const day = today.getDay();
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const sunday = new Date(today);
  sunday.setDate(today.getDate() + daysUntilSunday);
  return toDateStr(sunday);
}

function getUpcomingDaysInMonth(year, month, count = 14) {
  const today = todayStr();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = toDateStr(new Date(year, month, d));
    if (ds >= today) days.push(ds);
    if (days.length >= count) break;
  }
  return days;
}

/**
 * Compute coverage ratio for a date given people list and blockout map.
 * Returns a float 0–1 (1 = everyone available).
 */
function coverageForDate(dateStr, people, blockoutsByDate) {
  if (!people.length) return null;
  const blocked = blockoutsByDate[dateStr] || [];
  const blockedIds = new Set(blocked.map((b) => b.userId || b.email));
  const blockedCount = people.filter((p) => {
    const email = String(p.email || "").trim().toLowerCase();
    const id = String(p.id || p._sharedId || "").trim();
    return blockedIds.has(email) || blockedIds.has(id);
  }).length;
  return 1 - blockedCount / people.length;
}

/**
 * Color for coverage value (null = no data = gray).
 * Green ≥ 0.8, Amber 0.5–0.79, Red < 0.5.
 */
function heatColor(coverage) {
  if (coverage === null) return "#1E293B"; // gray: no data
  if (coverage >= 0.8) return "#10B981";  // green
  if (coverage >= 0.5) return "#F59E0B";  // amber
  return "#EF4444";                        // red
}

function heatColorBg(coverage) {
  if (coverage === null) return "#0B1120";
  if (coverage >= 0.8) return "#052e16";
  if (coverage >= 0.5) return "#451a03";
  return "#450a0a";
}

/**
 * Per-person dot for a given date:
 * green = available (not blocked), red = blocked, gray = unknown (no data)
 */
function personDotColor(person, dateStr, blockoutsByDate, hasAnyBlockoutData) {
  if (!hasAnyBlockoutData) return "#334155"; // gray — no data at all
  const blocked = blockoutsByDate[dateStr] || [];
  const email = String(person.email || "").trim().toLowerCase();
  const id = String(person.id || person._sharedId || "").trim();
  const isBlocked = blocked.some(
    (b) => (email && b.email === email) || (id && (b.userId === id || b.email === id))
  );
  return isBlocked ? "#EF4444" : "#10B981";
}

// ─── Day Detail Modal ─────────────────────────────────────────────────────────
function DayDetailModal({ visible, dateStr, people, blockoutsByDate, onClose, onAddBlockout }) {
  if (!dateStr) return null;
  const blocked = blockoutsByDate[dateStr] || [];
  const blockedSet = new Set(blocked.map((b) => b.email || b.userId));

  const available = people.filter((p) => {
    const key = String(p.email || p.id || "").trim().toLowerCase();
    return !blockedSet.has(key);
  });
  const unavailable = people.filter((p) => {
    const key = String(p.email || p.id || "").trim().toLowerCase();
    return blockedSet.has(key);
  });

  const [y, m, d] = dateStr.split("-");
  const label = `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
  const pct = people.length ? Math.round((available.length / people.length) * 100) : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.coverageSummary}>
            <Text style={styles.coveragePct}>{pct}%</Text>
            <Text style={styles.coverageLabel}>team available</Text>
          </View>

          {unavailable.length > 0 && (
            <>
              <Text style={styles.detailSectionLabel}>Unavailable ({unavailable.length})</Text>
              {unavailable.map((p) => {
                const bk = blocked.find((b) => b.email === p.email || b.userId === p.id);
                return (
                  <View key={p.id || p.email} style={styles.detailRow}>
                    <View style={[styles.detailDot, { backgroundColor: "#EF4444" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailName}>{p.name}</Text>
                      {bk?.reason ? (
                        <Text style={styles.detailReason}>{bk.reason}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {available.length > 0 && (
            <>
              <Text style={[styles.detailSectionLabel, { marginTop: 16 }]}>
                Available ({available.length})
              </Text>
              {available.map((p) => (
                <View key={p.id || p.email} style={styles.detailRow}>
                  <View style={[styles.detailDot, { backgroundColor: "#10B981" }]} />
                  <Text style={styles.detailName}>{p.name}</Text>
                </View>
              ))}
            </>
          )}

          <TouchableOpacity
            style={styles.blockoutBtn}
            onPress={() => onAddBlockout(dateStr)}
            activeOpacity={0.8}
          >
            <Text style={styles.blockoutBtnText}>+ Block Out a Team Member</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Blockout Picker Modal ────────────────────────────────────────────────────
function BlockoutPickerModal({
  visible,
  people,
  prefillDate,
  onClose,
  onSave,
}) {
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(prefillDate || "");
  const [reason, setReason] = useState("Not available");

  useEffect(() => {
    if (visible) {
      setSelectedDate(prefillDate || "");
      setSelectedPersonId(null);
      setReason("Not available");
    }
  }, [visible, prefillDate]);

  // Build a list of next 30 days for date selection
  const today = new Date();
  const dateOptions = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dateOptions.push(toDateStr(d));
  }

  function formatDateOption(ds) {
    const [y, m, day] = ds.split("-");
    const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(day));
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  async function handleSave() {
    if (!selectedPersonId) {
      Alert.alert("Select a person", "Please choose a team member to block out.");
      return;
    }
    if (!selectedDate) {
      Alert.alert("Select a date", "Please choose a date to block out.");
      return;
    }
    const person = people.find((p) => (p.id || p._sharedId) === selectedPersonId);
    if (!person) return;
    onSave({ person, date: selectedDate, reason });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxHeight: "85%" }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Block Out Team Member</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.pickerLabel}>Team Member</Text>
          <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
            {people.map((p) => (
              <TouchableOpacity
                key={p.id || p.email}
                style={[
                  styles.pickerRow,
                  selectedPersonId === (p.id || p._sharedId) && styles.pickerRowSelected,
                ]}
                onPress={() => setSelectedPersonId(p.id || p._sharedId)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerAvatar}>
                  <Text style={styles.pickerAvatarText}>
                    {(p.name || "?")[0].toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.pickerPersonName}>{p.name}</Text>
                  {p.email ? (
                    <Text style={styles.pickerPersonMeta}>{p.email}</Text>
                  ) : null}
                </View>
                {selectedPersonId === (p.id || p._sharedId) && (
                  <Text style={styles.pickerCheckmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.pickerLabel, { marginTop: 16 }]}>Date</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 16 }}
          >
            {dateOptions.map((ds) => (
              <TouchableOpacity
                key={ds}
                style={[
                  styles.dateChip,
                  selectedDate === ds && styles.dateChipSelected,
                ]}
                onPress={() => setSelectedDate(ds)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    selectedDate === ds && styles.dateChipTextSelected,
                  ]}
                >
                  {formatDateOption(ds)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.pickerLabel}>Reason (optional)</Text>
          <View style={styles.reasonOptions}>
            {["Not available", "Vacation", "Sick", "Work", "Other"].map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.reasonChip, reason === r && styles.reasonChipSelected]}
                onPress={() => setReason(r)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.reasonChipText,
                    reason === r && styles.reasonChipTextSelected,
                  ]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.saveBlockoutBtn} onPress={handleSave} activeOpacity={0.8}>
            <Text style={styles.saveBlockoutBtnText}>Save Blockout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AvailabilityHeatmapScreen({ navigation }) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [people, setPeople] = useState([]);
  const [blockouts, setBlockouts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(null);
  const [dayDetailVisible, setDayDetailVisible] = useState(false);
  const [blockoutPickerVisible, setBlockoutPickerVisible] = useState(false);
  const [blockoutPrefillDate, setBlockoutPrefillDate] = useState(null);

  // ── Data loading ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ppl, bks] = await Promise.all([getPeople(), getBlockouts()]);
      setPeople(ppl);
      setBlockouts(bks);
    } catch (err) {
      console.warn("[AvailabilityHeatmap] load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener("focus", loadData);
    loadData();
    return unsub;
  }, [navigation, loadData]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const blockoutsByDate = useMemo(() => {
    const map = {};
    for (const bk of blockouts) {
      if (!map[bk.date]) map[bk.date] = [];
      map[bk.date].push(bk);
    }
    return map;
  }, [blockouts]);

  const hasAnyBlockoutData = blockouts.length > 0;

  const calendarDays = useMemo(
    () => buildCalendarDays(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  const tStr = todayStr();

  // ── Best 3 upcoming dates ────────────────────────────────────────────────────
  const bestDates = useMemo(() => {
    const upcoming = getUpcomingDaysInMonth(currentYear, currentMonth, 31);
    const scored = upcoming
      .map((ds) => ({
        ds,
        coverage: coverageForDate(ds, people, blockoutsByDate) ?? 1,
      }))
      .sort((a, b) => b.coverage - a.coverage);
    return scored.slice(0, 3);
  }, [currentYear, currentMonth, people, blockoutsByDate]);

  // ── Month: next 30 days for person dots ──────────────────────────────────────
  const monthDayStrings = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const result = [];
    for (let d = 1; d <= daysInMonth; d++) {
      result.push(toDateStr(new Date(currentYear, currentMonth, d)));
    }
    return result;
  }, [currentYear, currentMonth]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  // ── Day press ─────────────────────────────────────────────────────────────────
  function handleDayPress(date) {
    const ds = toDateStr(date);
    setSelectedDate(ds);
    setDayDetailVisible(true);
  }

  // ── Blockout save ─────────────────────────────────────────────────────────────
  async function handleSaveBlockout({ person, date, reason }) {
    try {
      const userId = person.email || person.id || person._sharedId || "";
      await addBlockout({
        userId,
        name: person.name,
        date,
        reason,
      });
      await loadData();
    } catch (err) {
      Alert.alert("Error", "Could not save blockout. Try again.");
      console.warn("[AvailabilityHeatmap] blockout save error:", err);
    }
  }

  function openBlockoutPicker(prefillDate = null) {
    setBlockoutPrefillDate(prefillDate);
    setBlockoutPickerVisible(true);
  }

  function formatBestDate(ds) {
    const [y, m, d] = ds.split("-");
    const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading team availability...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Best Dates Pill ────────────────────────────────────────── */}
        {bestDates.length > 0 && (
          <View style={styles.bestDatesCard}>
            <Text style={styles.bestDatesTitle}>Best Dates This Month</Text>
            <View style={styles.bestDatesRow}>
              {bestDates.map(({ ds, coverage }, idx) => (
                <TouchableOpacity
                  key={ds}
                  style={[
                    styles.bestDatePill,
                    { borderColor: heatColor(coverage) },
                  ]}
                  onPress={() => { setSelectedDate(ds); setDayDetailVisible(true); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.bestDateRank, { backgroundColor: heatColor(coverage) }]}>
                    <Text style={styles.bestDateRankText}>{idx + 1}</Text>
                  </View>
                  <View>
                    <Text style={styles.bestDateLabel}>{formatBestDate(ds)}</Text>
                    <Text style={[styles.bestDatePct, { color: heatColor(coverage) }]}>
                      {Math.round(coverage * 100)}% available
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Calendar Heatmap ───────────────────────────────────────── */}
        <View style={styles.calCard}>
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
              const isPast = ds < tStr;
              const coverage = isPast ? null : coverageForDate(ds, people, blockoutsByDate);
              const bg = isPast ? "#0B1120" : heatColorBg(coverage);
              const borderColor = isPast ? "#1E293B" : heatColor(coverage);
              const isSelected = ds === selectedDate;

              return (
                <TouchableOpacity
                  key={ds}
                  style={[
                    styles.dayCell,
                    {
                      backgroundColor: bg,
                      borderColor: isSelected ? "#38BDF8" : borderColor,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  onPress={() => handleDayPress(date)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayNum,
                      isPast && styles.pastNum,
                      ds === tStr && styles.todayNum,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  {!isPast && people.length > 0 && (
                    <View style={[styles.heatBar, { backgroundColor: heatColor(coverage) }]}>
                      <Text style={styles.heatPct}>
                        {coverage !== null
                          ? `${Math.round(coverage * 100)}%`
                          : "—"}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
              <Text style={styles.legendText}>80%+ available</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
              <Text style={styles.legendText}>50–79%</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
              <Text style={styles.legendText}>Under 50%</Text>
            </View>
          </View>
        </View>

        {/* ── Team Availability List ─────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Team Availability
              <Text style={styles.sectionCount}> ({people.length})</Text>
            </Text>
            <TouchableOpacity
              style={styles.addBlockoutBtn}
              onPress={() => openBlockoutPicker(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.addBlockoutBtnText}>+ Block Out</Text>
            </TouchableOpacity>
          </View>

          {people.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No team members yet. Add people in People & Roles.
              </Text>
            </View>
          ) : (
            people.map((person, idx) => {
              // Show dots for up to 14 days in the current month from today
              const visibleDays = monthDayStrings
                .filter((ds) => ds >= tStr)
                .slice(0, 14);

              return (
                <View key={person.id || person.email || idx} style={styles.personRow}>
                  {/* Avatar */}
                  <View style={styles.personAvatar}>
                    <Text style={styles.personAvatarText}>
                      {(person.name || "?")[0].toUpperCase()}
                    </Text>
                  </View>

                  {/* Info */}
                  <View style={styles.personInfo}>
                    <Text style={styles.personName}>{person.name}</Text>
                    {person.roles?.length > 0 && (
                      <View style={styles.roleChip}>
                        <Text style={styles.roleChipText}>
                          {person.roles
                            .slice(0, 2)
                            .map((r) =>
                              r.replace(/_/g, " ")
                                .replace(/\b\w/g, (c) => c.toUpperCase())
                            )
                            .join(", ")}
                        </Text>
                      </View>
                    )}

                    {/* Availability dots for visible days */}
                    {visibleDays.length > 0 && (
                      <View style={styles.dotsRow}>
                        {visibleDays.map((ds) => (
                          <View
                            key={ds}
                            style={[
                              styles.availDot,
                              {
                                backgroundColor: personDotColor(
                                  person,
                                  ds,
                                  blockoutsByDate,
                                  hasAnyBlockoutData
                                ),
                              },
                            ]}
                          />
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Block Out button */}
                  <TouchableOpacity
                    style={styles.personBlockBtn}
                    onPress={() => openBlockoutPicker(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.personBlockBtnText}>Block</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Day Detail Modal ─────────────────────────────────────────── */}
      <DayDetailModal
        visible={dayDetailVisible}
        dateStr={selectedDate}
        people={people}
        blockoutsByDate={blockoutsByDate}
        onClose={() => setDayDetailVisible(false)}
        onAddBlockout={(ds) => {
          setDayDetailVisible(false);
          openBlockoutPicker(ds);
        }}
      />

      {/* ── Blockout Picker Modal ─────────────────────────────────────── */}
      <BlockoutPickerModal
        visible={blockoutPickerVisible}
        people={people}
        prefillDate={blockoutPrefillDate}
        onClose={() => setBlockoutPickerVisible(false)}
        onSave={handleSaveBlockout}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#020617",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "500",
  },
  scroll: {
    padding: 14,
  },

  // ── Best Dates ─────────────────────────────────────────────────────
  bestDatesCard: {
    backgroundColor: "#0B1120",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  bestDatesTitle: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  bestDatesRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  bestDatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#111827",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flex: 1,
    minWidth: 130,
  },
  bestDateRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  bestDateRankText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "900",
  },
  bestDateLabel: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  bestDatePct: {
    fontSize: 12,
    fontWeight: "600",
  },

  // ── Calendar ───────────────────────────────────────────────────────
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
    alignSelf: "center",
    width: "100%",
    maxWidth: 720,
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
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  dayCell: {
    width: "13.5%",
    aspectRatio: 0.85,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    minHeight: 54,
  },
  dayNum: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 3,
  },
  todayNum: { color: "#818CF8", fontWeight: "900" },
  pastNum: { color: "#334155" },
  heatBar: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: "center",
  },
  heatPct: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "800",
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    flexWrap: "wrap",
    gap: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },

  // ── Team List ──────────────────────────────────────────────────────
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  sectionCount: {
    color: "#64748B",
    fontWeight: "600",
    fontSize: 16,
  },
  addBlockoutBtn: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBlockoutBtnText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
    backgroundColor: "#0B1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    borderStyle: "dashed",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0B1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 16,
    marginBottom: 10,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  personAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  personAvatarText: {
    color: "#94A3B8",
    fontSize: 18,
    fontWeight: "800",
  },
  personInfo: {
    flex: 1,
    gap: 6,
  },
  personName: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "700",
  },
  roleChip: {
    alignSelf: "flex-start",
    backgroundColor: "#1E1B4B",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#3730A3",
  },
  roleChipText: {
    color: "#A5B4FC",
    fontSize: 11,
    fontWeight: "700",
  },
  dotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  availDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  personBlockBtn: {
    backgroundColor: "#1F2937",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  personBlockBtnText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },

  // ── Day Detail Modal ───────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtnText: {
    color: "#94A3B8",
    fontSize: 16,
    fontWeight: "700",
  },
  coverageSummary: {
    alignItems: "center",
    marginBottom: 24,
  },
  coveragePct: {
    color: "#10B981",
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: -2,
  },
  coverageLabel: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    marginTop: -4,
  },
  detailSectionLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 12,
  },
  detailDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  detailName: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "600",
  },
  detailReason: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  blockoutBtn: {
    marginTop: 20,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 14,
    alignItems: "center",
  },
  blockoutBtnText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "700",
  },

  // ── Blockout Picker Modal ──────────────────────────────────────────
  pickerLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: "#111827",
  },
  pickerRowSelected: {
    backgroundColor: "#1E1B4B",
    borderWidth: 1,
    borderColor: "#4F46E5",
  },
  pickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerAvatarText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "800",
  },
  pickerPersonName: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "700",
  },
  pickerPersonMeta: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "500",
  },
  pickerCheckmark: {
    color: "#818CF8",
    fontSize: 16,
    fontWeight: "900",
    marginLeft: "auto",
  },
  dateChip: {
    backgroundColor: "#111827",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  dateChipSelected: {
    backgroundColor: "#1E1B4B",
    borderColor: "#4F46E5",
  },
  dateChipText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  dateChipTextSelected: {
    color: "#A5B4FC",
    fontWeight: "700",
  },
  reasonOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  reasonChip: {
    backgroundColor: "#111827",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reasonChipSelected: {
    backgroundColor: "#1E1B4B",
    borderColor: "#4F46E5",
  },
  reasonChipText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  reasonChipTextSelected: {
    color: "#A5B4FC",
    fontWeight: "700",
  },
  saveBlockoutBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  saveBlockoutBtnText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
