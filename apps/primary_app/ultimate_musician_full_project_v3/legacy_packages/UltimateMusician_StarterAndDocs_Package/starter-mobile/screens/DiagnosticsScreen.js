import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet } from "react-native";

export default function DiagnosticsScreen() {
  const [notes, setNotes] = useState("");

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Support & Diagnostics</Text>
      <TextInput
        style={styles.input}
        multiline
        value={notes}
        onChangeText={setNotes}
        placeholder="Describe the problem..."
        placeholderTextColor="#6b7280"
      />
      <Button title="Send Diagnostics (TODO)" onPress={() => {}} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617", padding: 20 },
  title: { fontSize: 22, fontWeight: "700", color: "#e5e7eb", marginBottom: 12 },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    padding: 10,
    color: "#e5e7eb",
    marginBottom: 16,
  },
});
