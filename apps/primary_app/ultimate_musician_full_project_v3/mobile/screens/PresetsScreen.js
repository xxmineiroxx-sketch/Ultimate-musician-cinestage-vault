import React, { useState, useEffect } from "react";
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from "react-native";

import { getSongs } from "../data/storage";
import { CINESTAGE_URL } from "./config";
import { fetchWithRetry } from "../utils/fetchRetry";

const PRESET_TYPES = ["Worship Keys", "Ambient Pad", "Strings", "Organ B3", "Synth Lead"];

export default function PresetsScreen({ navigation }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);

  // AI MIDI Preset
  const [presetSongTitle, setPresetSongTitle] = useState("");
  const [presetType, setPresetType] = useState("Worship Keys");
  const [presetLoading, setPresetLoading] = useState(false);
  const [presetResult, setPresetResult] = useState(null);

  async function handleGeneratePreset() {
    setPresetLoading(true);
    setPresetResult(null);
    try {
      const res = await fetchWithRetry(`${CINESTAGE_URL}/ai/midi-presets/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument_type: presetType,
          song_title: presetSongTitle.trim() || undefined,
          genre: "worship",
          style: presetType.toLowerCase().replace(/\s+/g, "_"),
        }),
      });
      if (!res.ok) throw new Error(`MIDI Preset API ${res.status}`);
      const data = await res.json();
      setPresetResult(data);
    } catch (e) {
      Alert.alert("AI Preset Error", e.message);
    } finally {
      setPresetLoading(false);
    }
  }

  useEffect(() => {
    getSongs().then((s) => {
      setSongs(s || []);
      setLoading(false);
    });
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      <Text style={styles.heading}>Presets</Text>
      <Text style={styles.sub}>
        Song key and tempo reference for your library.
      </Text>

      {/* AI MIDI Preset Generator */}
      <Text style={styles.sectionLabel}>AI MIDI Preset Generator</Text>
      <View style={{ backgroundColor: '#0f172a', borderRadius: 12, borderWidth: 1, borderColor: '#4f46e5', padding: 14, marginBottom: 16 }}>
        <Text style={{ color: '#818cf8', fontSize: 13, fontWeight: '700', marginBottom: 10 }}>🤖 CineStage Preset AI</Text>
        <TextInput
          style={{ backgroundColor: '#1e293b', color: '#f1f5f9', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 10, borderWidth: 1, borderColor: '#334155' }}
          placeholder="Song title (optional)…"
          placeholderTextColor="#475569"
          value={presetSongTitle}
          onChangeText={setPresetSongTitle}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PRESET_TYPES.map(pt => (
              <TouchableOpacity
                key={pt}
                onPress={() => setPresetType(pt)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor: presetType === pt ? '#312e81' : '#1e293b',
                  borderWidth: 1, borderColor: presetType === pt ? '#6366f1' : '#334155',
                }}
              >
                <Text style={{ color: presetType === pt ? '#a5b4fc' : '#94a3b8', fontSize: 12 }}>{pt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <TouchableOpacity
          style={{ backgroundColor: '#4f46e5', borderRadius: 8, padding: 12, alignItems: 'center' }}
          onPress={handleGeneratePreset}
          disabled={presetLoading}
          activeOpacity={0.8}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
            {presetLoading ? '⏳ Generating Preset…' : '🎹 Generate MIDI Preset'}
          </Text>
        </TouchableOpacity>
        {presetResult && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: '#34d399', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>✓ Preset Generated</Text>
            <Text style={{ color: '#94a3b8', fontSize: 11 }}>
              {presetResult.preset_name || presetResult.name || presetType}
            </Text>
            {presetResult.program_number !== undefined && (
              <Text style={{ color: '#94a3b8', fontSize: 11 }}>Program: {presetResult.program_number} · Bank: {presetResult.bank || 0}</Text>
            )}
            {(presetResult.description || presetResult.content) && (
              <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>{presetResult.description || presetResult.content}</Text>
            )}
          </View>
        )}
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionLabel}>Quick Actions</Text>
      <TouchableOpacity
        style={styles.actionCard}
        onPress={() => navigation.navigate("Settings")}
      >
        <Text style={styles.actionIcon}>🔊</Text>
        <View style={styles.actionContent}>
          <Text style={styles.actionTitle}>Audio Routing</Text>
          <Text style={styles.actionDesc}>
            Set global output routing for click, stems, and mix tracks
          </Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionCard}
        onPress={() => navigation.navigate("Library")}
      >
        <Text style={styles.actionIcon}>📚</Text>
        <View style={styles.actionContent}>
          <Text style={styles.actionTitle}>Song Library</Text>
          <Text style={styles.actionDesc}>
            Browse songs, edit keys, manage stems and charts
          </Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      {/* Song list */}
      <Text style={styles.sectionLabel}>Library</Text>
      {loading ? (
        <Text style={styles.dimText}>Loading…</Text>
      ) : songs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎵</Text>
          <Text style={styles.emptyTitle}>No Songs Yet</Text>
          <Text style={styles.emptyText}>
            Add songs in the Library tab to see them here.
          </Text>
        </View>
      ) : (
        songs.map((song) => (
          <TouchableOpacity
            key={song.id}
            style={styles.songCard}
            onPress={() => navigation.navigate("SongDetail", { song })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.songTitle}>{song.title}</Text>
              {song.artist ? (
                <Text style={styles.songArtist}>{song.artist}</Text>
              ) : null}
            </View>
            <View style={styles.songMeta}>
              {song.key ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>Key: {song.key}</Text>
                </View>
              ) : null}
              {song.tempo ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{song.tempo} BPM</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  heading: { color: "#F9FAFB", fontSize: 26, fontWeight: "900" },
  sub: { color: "#6B7280", marginTop: 6, marginBottom: 20, fontSize: 13 },

  sectionLabel: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
    marginTop: 4,
  },

  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#0B1120",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    marginBottom: 10,
  },
  actionIcon: { fontSize: 28, marginRight: 14 },
  actionContent: { flex: 1 },
  actionTitle: { color: "#F9FAFB", fontWeight: "800", fontSize: 15 },
  actionDesc: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  arrow: { color: "#4B5563", fontSize: 22, fontWeight: "300" },

  dimText: { color: "#6B7280", marginTop: 12 },

  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: {
    color: "#E5E7EB",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyText: { color: "#6B7280", fontSize: 13, textAlign: "center" },

  songCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    marginBottom: 8,
  },
  songTitle: { color: "#F9FAFB", fontWeight: "700", fontSize: 14 },
  songArtist: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  songMeta: { flexDirection: "row", gap: 6, marginHorizontal: 10 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#1F2937",
    borderRadius: 6,
  },
  tagText: { color: "#9CA3AF", fontSize: 11, fontWeight: "600" },
});
