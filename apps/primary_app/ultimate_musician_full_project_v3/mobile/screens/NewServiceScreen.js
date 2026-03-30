import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  TouchableOpacity,
} from "react-native";

import { SERVICE_TYPES, defaultServiceTypeId } from "../data/serviceTemplates";
import { createService } from "../data/servicesStore";
import { getSettings } from "../data/storage";

const CUSTOM_TYPES_KEY = "um/custom_service_types/v1";

// Parse flexible time input → "HH:mm" (24h) or null
// Accepts: "8pm","8 PM","8:30pm","8:30 PM","20:30","9:00","09:00","8am","10 am"
function parseTimeInput(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  // Already HH:mm 24h
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = parseInt(hhmm[1], 10);
    const m = parseInt(hhmm[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  // h:mmam/pm or hampm
  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2] || "0", 10);
    const period = ampm[3];
    if (period === "am") {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return null;
}

// MM/DD/YYYY → YYYY-MM-DD
function toISO(display) {
  if (!display) return "";
  const [m, d, y] = display.split("/");
  return `${y}-${m}-${d}`;
}

// YYYY-MM-DD → MM/DD/YYYY
function toDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export default function NewServiceScreen({ navigation, route }) {
  const prefillDate = route?.params?.prefillDate || "";
  const [title, setTitle] = useState("Sunday Service");
  const [date, setDate] = useState(toDisplay(prefillDate));
  const [time, setTime] = useState("09:00");
  const [serviceType, setServiceType] = useState(defaultServiceTypeId());
  const [customTypes, setCustomTypes] = useState([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [newCustomName, setNewCustomName] = useState("");

  // Load saved custom types on mount
  useEffect(() => {
    AsyncStorage.getItem(CUSTOM_TYPES_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCustomTypes(parsed);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const allTypes = useMemo(
    () => [...SERVICE_TYPES, ...customTypes],
    [customTypes],
  );

  const typeMeta = useMemo(
    () => allTypes.find((t) => t.id === serviceType) || SERVICE_TYPES[0],
    [allTypes, serviceType],
  );

  function selectType(t) {
    setServiceType(t.id);
    setTitle(t.name); // auto-fill title when a type is selected
  }

  async function saveCustomTypes(updated) {
    setCustomTypes(updated);
    await AsyncStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(updated));
  }

  async function handleAddCustomType() {
    const name = newCustomName.trim();
    if (!name) return;
    // Don't duplicate existing type names
    if (allTypes.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert("Already exists", `"${name}" is already in the list.`);
      return;
    }
    const newType = {
      id: `custom_${Date.now()}`,
      name,
      leadDays: 21,
      custom: true,
    };
    const updated = [...customTypes, newType];
    await saveCustomTypes(updated);
    setNewCustomName("");
    setAddingCustom(false);
    // Select the new type and fill title
    selectType(newType);
  }

  async function handleDeleteCustomType(id) {
    Alert.alert(
      "Delete type?",
      "Remove this custom service type from the list?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const updated = customTypes.filter((t) => t.id !== id);
            await saveCustomTypes(updated);
            // If the deleted type was selected, reset to standard
            if (serviceType === id) {
              setServiceType(defaultServiceTypeId());
              setTitle(SERVICE_TYPES[0].name);
            }
          },
        },
      ],
    );
  }

  async function onCreate() {
    const d = (date || "").trim();
    const t = parseTimeInput((time || "").trim());
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
      Alert.alert("Invalid date", "Date must be MM/DD/YYYY (e.g., 03/09/2026)");
      return;
    }
    if (!t) {
      Alert.alert(
        "Invalid time",
        'Enter time like "8pm", "8:30 PM", "8:30am", or "20:30"',
      );
      return;
    }

    const finalTitle = (title || "").trim() || typeMeta.name || "Service";

    // Auto-save as a custom type if it doesn't match any existing type
    const allNames = allTypes.map((tt) => tt.name.toLowerCase());
    if (!allNames.includes(finalTitle.toLowerCase())) {
      const newCustom = {
        id: `custom_${Date.now()}`,
        name: finalTitle,
        leadDays: 21,
        custom: true,
      };
      await saveCustomTypes([...customTypes, newCustom]);
    }

    const settings = await getSettings().catch(() => ({}));
    await createService({
      title: finalTitle,
      date: toISO(d),
      time: t,
      serviceType,
      created_by_name: settings?.adminName || settings?.name || "Admin",
      created_by_email: settings?.adminEmail || settings?.email || "",
    });
    navigation.goBack();
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <ScrollView
        contentContainerStyle={{ padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: "#fff", fontSize: 26, fontWeight: "900" }}>
          New Service
        </Text>
        <Text style={{ color: "#9ca3af", marginTop: 6 }}>
          Choose a type — the title fills automatically. Tap ✕ to delete custom
          types.
        </Text>

        <Text style={{ color: "#9ca3af", marginTop: 16, marginBottom: 6 }}>
          Service Type
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 6 }}
        >
          {allTypes.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => selectType(t)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: serviceType === t.id ? "#22c55e" : "#334155",
                backgroundColor:
                  serviceType === t.id ? "#052e16" : "transparent",
                marginRight: 8,
                marginBottom: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>{t.name}</Text>
              {t.custom && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleDeleteCustomType(t.id);
                  }}
                  hitSlop={6}
                >
                  <Text
                    style={{
                      color: "#EF4444",
                      fontWeight: "800",
                      fontSize: 12,
                    }}
                  >
                    ✕
                  </Text>
                </TouchableOpacity>
              )}
            </Pressable>
          ))}

          {/* Add custom type pill */}
          {!addingCustom && (
            <Pressable
              onPress={() => setAddingCustom(true)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#4338CA",
                backgroundColor: "transparent",
                marginRight: 8,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: "#818CF8", fontWeight: "800" }}>
                ＋ Custom
              </Text>
            </Pressable>
          )}
        </ScrollView>

        {/* Inline custom type input */}
        {addingCustom && (
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <TextInput
              value={newCustomName}
              onChangeText={setNewCustomName}
              placeholder="Type name (e.g. Anniversary Service)"
              placeholderTextColor="#4B5563"
              autoFocus
              style={{
                flex: 1,
                color: "#fff",
                borderWidth: 1,
                borderColor: "#4338CA",
                borderRadius: 12,
                padding: 10,
                backgroundColor: "#0b1220",
              }}
            />
            <Pressable
              onPress={handleAddCustomType}
              style={{
                backgroundColor: "#4338CA",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Add</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setAddingCustom(false);
                setNewCustomName("");
              }}
              style={{
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: "#374151",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#6B7280", fontWeight: "800" }}>✕</Text>
            </Pressable>
          </View>
        )}

        <Text style={{ color: "#64748b", marginBottom: 10 }}>
          Selected: {typeMeta.name} · Lead window: {typeMeta.leadDays} days
        </Text>

        <Text style={{ color: "#9ca3af", marginTop: 6, marginBottom: 6 }}>
          Title
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Sunday Service"
          placeholderTextColor="#555"
          style={{
            color: "#fff",
            borderWidth: 1,
            borderColor: "#1f2937",
            borderRadius: 12,
            padding: 12,
            backgroundColor: "#0b1220",
          }}
        />

        <Text style={{ color: "#9ca3af", marginTop: 16, marginBottom: 6 }}>
          Date (MM/DD/YYYY)
        </Text>
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder="02/01/2026"
          placeholderTextColor="#555"
          autoCapitalize="none"
          style={{
            color: "#fff",
            borderWidth: 1,
            borderColor: "#1f2937",
            borderRadius: 12,
            padding: 12,
            backgroundColor: "#0b1220",
          }}
        />

        <Text style={{ color: "#9ca3af", marginTop: 16, marginBottom: 6 }}>
          Time (e.g. 8pm, 8:30 PM, 09:00)
        </Text>
        <TextInput
          value={time}
          onChangeText={setTime}
          placeholder="8pm or 09:00"
          placeholderTextColor="#555"
          autoCapitalize="none"
          style={{
            color: "#fff",
            borderWidth: 1,
            borderColor: "#1f2937",
            borderRadius: 12,
            padding: 12,
            backgroundColor: "#0b1220",
          }}
        />

        <Pressable
          onPress={onCreate}
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 12,
            backgroundColor: "#16a34a",
          }}
        >
          <Text
            style={{ color: "#fff", fontWeight: "900", textAlign: "center" }}
          >
            Create Service
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.goBack()}
          style={{
            marginTop: 10,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#334155",
          }}
        >
          <Text
            style={{ color: "#fff", fontWeight: "900", textAlign: "center" }}
          >
            Cancel
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
