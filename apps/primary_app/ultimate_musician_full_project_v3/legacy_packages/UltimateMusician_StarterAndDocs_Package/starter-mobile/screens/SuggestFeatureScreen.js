import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet } from "react-native";

export default function SuggestFeatureScreen() {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Suggest a Feature</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Short title"
        placeholderTextColor="#6b7280"
      />
      <TextInput
        style={[styles.input, { minHeight: 80 }]}
        multiline
        value={desc}
        onChangeText={setDesc}
        placeholder="Describe what you need and why..."
        placeholderTextColor="#6b7280"
      />
      <Button title="Submit (TODO)" onPress={() => {}} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617", padding: 20 },
  title: { fontSize: 22, fontWeight: "700", color: "#e5e7eb", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    padding: 10,
    color: "#e5e7eb",
    marginBottom: 12,
  },
});
