import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { getActiveServiceId, getServices, humanStatus } from "../data/servicesStore";

function Tile({ title, subtitle, onPress, accent }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tile, accent && { borderColor: accent + '55' }]}
    >
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileSub}>{subtitle}</Text>
    </Pressable>
  );
}

function formatServiceDate(dateStr, timeStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(`${dateStr}T${timeStr || '00:00'}:00`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      + (timeStr ? `  ·  ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '');
  } catch { return dateStr; }
}

export default function PlanningCenterScreen({ navigation }) {
  const [activeService, setActiveService] = useState(null);

  async function reload() {
    const id = await getActiveServiceId();
    if (!id) { setActiveService(null); return; }
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
          Build the service plan: Calendar → Service Plan → Library → People & Roles → Run Service.
        </Text>

        <Pressable
          style={[styles.activeCard, activeService && styles.activeCardLive]}
          onPress={() => navigation.navigate("Calendar")}
        >
          <View style={styles.activeCardRow}>
            <Text style={styles.activeLabel}>Active Service</Text>
            {activeService && (
              <Text style={styles.activeStatus}>{humanStatus(activeService.status)}</Text>
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
              {activeService.serviceType && activeService.serviceType !== 'standard' && (
                <Text style={styles.activeType}>
                  {activeService.serviceType.charAt(0).toUpperCase() + activeService.serviceType.slice(1)} service
                </Text>
              )}
              <Text style={styles.activeTap}>Tap to change →</Text>
            </>
          ) : (
            <Text style={styles.activeValue}>No service selected — tap to open Calendar</Text>
          )}
        </Pressable>

        <Text style={styles.sectionLabel}>Planning Tools</Text>

        <Tile
          title="📅 Calendar"
          subtitle="Upcoming services. Special services (Communion, Easter…) appear weeks early."
          onPress={() => navigation.navigate("Calendar")}
        />

        <Tile
          title="🧾 Service Plan"
          subtitle="Songs + cue stacks for the active service."
          onPress={() =>
            navigation.navigate("ServicePlan", serviceId ? { serviceId } : {})
          }
          accent="#818CF8"
        />

        <Tile
          title="📚 Library"
          subtitle="Browse songs, add to the active service plan, run CineStage™ stems."
          onPress={() => navigation.navigate("Library")}
          accent="#34D399"
        />

        <Tile
          title="👥 People & Roles"
          subtitle="Assign musicians and techs for this service."
          onPress={() => navigation.navigate("Roles")}
        />

        <Tile
          title="⚙️ Integrations & Settings"
          subtitle="Audio / Lighting / ProPresenter / Sync targets for this service."
          onPress={() => navigation.navigate("Settings")}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  container: { padding: 20, paddingBottom: 40 },

  heading: { color: '#F9FAFB', fontSize: 26, fontWeight: '900' },
  sub: {
    color: '#6B7280', marginTop: 8, lineHeight: 18, fontSize: 13,
  },

  activeCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
  },
  activeCardLive: {
    borderColor: '#4338CA55',
    backgroundColor: '#0E0B1F',
  },
  activeCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  activeLabel: { color: '#6B7280', fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  activeStatus: { color: '#9CA3AF', fontSize: 12 },
  activeTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '800' },
  activeDate: { color: '#818CF8', fontSize: 13, marginTop: 3 },
  activeType: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  activeTap: { color: '#374151', fontSize: 11, marginTop: 8 },
  activeValue: { color: '#6B7280', marginTop: 4, fontSize: 13 },

  sectionLabel: {
    color: '#F9FAFB', fontSize: 16, fontWeight: '800',
    marginTop: 20, marginBottom: 12,
  },

  tile: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1120',
    marginBottom: 10,
  },
  tileTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '800' },
  tileSub: { color: '#6B7280', marginTop: 5, lineHeight: 18, fontSize: 13 },
});
