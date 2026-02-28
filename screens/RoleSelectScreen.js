import React from "react";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function RoleButton({ title, subtitle, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#333",
        backgroundColor: "#111",
        marginBottom: 12,
      }}
    >
      <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
        {title}
      </Text>
      <Text style={{ color: "#aaa", marginTop: 6 }}>{subtitle}</Text>
    </Pressable>
  );
}

export default function RoleSelectScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, padding: 20, paddingTop: insets.top + 20, backgroundColor: "#000" }}>
      <Text style={{ color: "white", fontSize: 28, fontWeight: "800" }}>
        CineStage™
      </Text>
      <Text style={{ color: "#aaa", marginTop: 6, marginBottom: 16 }}>
        Choose your role for this device.
      </Text>

      <RoleButton
        title="Organizer"
        subtitle="Build service plan, edit cues, approve + lock."
        onPress={() => navigation.navigate("Organizer")}
      />

      <RoleButton
        title="Stage"
        subtitle="Read-only stage display: current / next cues."
        onPress={() => navigation.navigate("StageDisplay")}
      />

      <RoleButton
        title="Live"
        subtitle="Performance controls: stems, click/guide, sections."
        onPress={() => navigation.navigate("Live")}
      />

      <Text style={{ color: "#555", marginTop: 18, lineHeight: 18 }}>
        Tip: iPad = Organizer or Stage. iPhone = Live.
      </Text>
    </View>
  );
}
