import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from "react-native";

import {
  getActiveServiceId,
  getServices,
  humanStatus,
} from "../data/servicesStore";

function Tile({ title, subtitle, onPress, accent, icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        accent && { borderColor: accent + "55" },
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }
      ]}
    >
      <View style={[styles.tileIconWrap, accent && { backgroundColor: accent + "22", borderColor: accent + "66" }]}>
        <Text style={styles.tileIcon}>{icon}</Text>
      </View>
      <View style={styles.tileTextWrap}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileSub}>{subtitle}</Text>
      </View>
      <View style={styles.tileArrowWrap}>
        <Text style={[styles.tileArrow, accent && { color: accent }]}>›</Text>
      </View>
    </Pressable>
  );
}

function formatServiceDate(dateStr, timeStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(`${dateStr}T${timeStr || "00:00"}:00`);
    return (
      d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      (timeStr
        ? `  ·  ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
        : "")
    );
  } catch {
    return dateStr;
  }
}

export default function PlanningCenterScreen({ navigation }) {
  const { width: _pcWidth } = useWindowDimensions();
  const _pcIsIPad = _pcWidth >= 768;
  const [activeService, setActiveService] = useState(null);

  async function reload() {
    const id = await getActiveServiceId();
    if (!id) {
      setActiveService(null);
      return;
    }
    const list = await getServices();
    setActiveService(list.find((s) => s.id === id) || null);
  }

  useEffect(() => {
    const unsub = navigation.addListener("focus", reload);
    reload();
    return unsub;
  }, [navigation]);

  const serviceId = activeService?.id || null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Planning Center</Text>
        <Text style={styles.sub}>
          Build the service plan: Calendar → Service Plan → Library → People &
          Roles → Run Service.
        </Text>

        <Pressable
          style={[styles.activeCard, activeService && styles.activeCardLive]}
          onPress={() => navigation.navigate("Calendar")}
        >
          <View style={styles.activeCardRow}>
            <Text style={styles.activeLabel}>Active Service</Text>
            {activeService && (
              <Text style={styles.activeStatus}>
                {humanStatus(activeService.status)}
              </Text>
            )}
          </View>
          {activeService ? (
            <>
              <Text style={styles.activeTitle}>{activeService.title}</Text>
              {activeService.date && (
                <Text style={styles.activeDate}>
                  {formatServiceDate(activeService.date, activeService.time)}
                </Text>
              )}
              {activeService.serviceType &&
                activeService.serviceType !== "standard" && (
                  <Text style={styles.activeType}>
                    {activeService.serviceType.charAt(0).toUpperCase() +
                      activeService.serviceType.slice(1)}{" "}
                    service
                  </Text>
                )}
              <Text style={styles.activeTap}>Tap to change →</Text>
            </>
          ) : (
            <Text style={styles.activeValue}>
              No service selected — tap to open Calendar
            </Text>
          )}
        </Pressable>

        <Text style={styles.sectionLabel}>Planning Tools</Text>

        {/* On iPad: 2-column tile grid */}
        {_pcIsIPad ? (
          <View style={styles.gridContainer}>
            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Tile icon="📅" title="Calendar" subtitle="Upcoming services. Special services (Communion, Easter…) appear weeks early." onPress={() => navigation.navigate("Calendar")} accent="#6366F1" />
              </View>
              <View style={styles.gridCol}>
                <Tile icon="🧾" title="Service Plan" subtitle="Songs + cue stacks for the active service." onPress={() => navigation.navigate("ServicePlan", serviceId ? { serviceId } : {})} accent="#818CF8" />
              </View>
            </View>
            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Tile icon="📚" title="Library" subtitle="Browse songs, add to the active service plan, run CineStage™ stems." onPress={() => navigation.navigate("Library")} accent="#34D399" />
              </View>
              <View style={styles.gridCol}>
                <Tile icon="👥" title="People & Roles" subtitle="Assign musicians and techs for this service." onPress={() => navigation.navigate("PeopleRoles")} accent="#14B8A6" />
              </View>
            </View>
            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Tile icon="⚙️" title="Integrations & Settings" subtitle="Audio / Lighting / ProPresenter / Sync targets plus Planning Center Online import." onPress={() => navigation.navigate("Settings")} accent="#64748B" />
              </View>
              <View style={styles.gridCol} />
            </View>
          </View>
        ) : (
          <View style={styles.listContainer}>
            <Tile icon="📅" title="Calendar" subtitle="Upcoming services. Special services appear weeks early." onPress={() => navigation.navigate("Calendar")} accent="#6366F1" />
            <Tile icon="🧾" title="Service Plan" subtitle="Songs + cue stacks for the active service." onPress={() => navigation.navigate("ServicePlan", serviceId ? { serviceId } : {})} accent="#818CF8" />
            <Tile icon="📚" title="Library" subtitle="Browse songs, add to the active service plan, run CineStage™ stems." onPress={() => navigation.navigate("Library")} accent="#34D399" />
            <Tile icon="👥" title="People & Roles" subtitle="Assign musicians and techs for this service." onPress={() => navigation.navigate("PeopleRoles")} accent="#14B8A6" />
            <Tile icon="⚙️" title="Integrations & Settings" subtitle="Audio / Lighting / ProPresenter / Sync targets plus Planning Center Online import." onPress={() => navigation.navigate("Settings")} accent="#64748B" />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  container: { padding: 24, paddingBottom: 60, maxWidth: 1024, alignSelf: 'center', width: '100%' },

  heading: { color: "#F9FAFB", fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  sub: {
    color: "#94A3B8",
    marginTop: 8,
    lineHeight: 22,
    fontSize: 15,
    fontWeight: "500"
  },

  activeCard: {
    marginTop: 24,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1220",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  activeCardLive: {
    borderColor: "#4F46E5",
    backgroundColor: "#111827",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  activeCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  activeLabel: {
    color: "#10B981",
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  activeStatus: { 
    color: "#E2E8F0", 
    fontSize: 12,
    backgroundColor: "#1F2937",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
    fontWeight: "700"
  },
  activeTitle: { color: "#F8FAFC", fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  activeDate: { color: "#A5B4FC", fontSize: 15, marginTop: 4, fontWeight: "600" },
  activeType: { color: "#64748B", fontSize: 14, marginTop: 4, fontStyle: "italic" },
  activeTap: { color: "#4F46E5", fontSize: 13, marginTop: 16, fontWeight: "700" },
  activeValue: { color: "#64748B", marginTop: 8, fontSize: 15 },

  sectionLabel: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 32,
    marginBottom: 16,
    letterSpacing: -0.5,
  },

  gridContainer: {
    gap: 16,
  },
  gridRow: {
    flexDirection: "row",
    gap: 16,
  },
  gridCol: {
    flex: 1,
  },
  listContainer: {
    gap: 12,
  },

  tile: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
    minHeight: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tileIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  tileIcon: {
    fontSize: 28,
  },
  tileTextWrap: {
    flex: 1,
  },
  tileTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  tileSub: { color: "#94A3B8", marginTop: 4, lineHeight: 20, fontSize: 13, fontWeight: "500" },
  tileArrowWrap: {
    paddingLeft: 12,
  },
  tileArrow: {
    fontSize: 24,
    color: "#475569",
    fontWeight: "900",
  },
});
