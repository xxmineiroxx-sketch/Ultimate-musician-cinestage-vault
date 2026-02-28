import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import CineStageProcessingOverlay from "../components/CineStageProcessingOverlay";
import {
  buildStemsFromArtifact,
  fetchJobArtifact,
  fetchWaveformPeaks,
} from "../services/artifactClient";
import {
  loadSession,
  saveSession,
  defaultSession,
} from "../services/sessionStore";

const STEM_OPTIONS = ["DRUMS", "BASS", "GUITARS", "KEYS", "VOCALS", "PAD"];

export default function NewSongScreen({ navigation }) {
  const { apiBase, setApiBase, token, userId, logout } = useAuth();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedStems, setSelectedStems] = useState([
    "DRUMS",
    "BASS",
    "GUITARS",
    "VOCALS",
  ]);
  const [loading, setLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(undefined);

  const toggleStem = (stem) => {
    setSelectedStems((prev) =>
      prev.includes(stem) ? prev.filter((s) => s !== stem) : [...prev, stem],
    );
  };

  const headers = () => {
    const h = { "Content-Type": "application/json" };
    if (token) {
      h.Authorization = `Bearer ${token}`;
    } else if (userId) {
      h["X-User-Id"] = userId;
    }
    return h;
  };

  const applyArtifactToSession = async (artifact, padTrackUrl = null) => {
    if (!artifact) return;
    const peaksUrl = artifact?.artifacts?.waveform_peaks;
    const peaks = await fetchWaveformPeaks(peaksUrl);
    const current = (await loadSession()) || defaultSession();
    const stems = buildStemsFromArtifact(artifact, current.stems);
    const next = {
      ...current,
      bpm: artifact.bpm || current.bpm,
      stems,
      waveformPeaks: peaks || current.waveformPeaks || null,
      padTrackUrl: padTrackUrl || current.padTrackUrl || null,
      lastUpdated: new Date().toISOString(),
    };
    await saveSession(next);
  };

  const handleCreateAndProcess = async () => {
    if (!apiBase || !title || !sourceUrl) {
      Alert.alert(
        "Missing info",
        "Backend URL, title and source URL are required.",
      );
      return;
    }
    setLoading(true);
    // Step 0 — Collecting song info
    setProcessingStep(0);
    setProcessingProgress(5);
    try {
      const resSong = await fetch(`${apiBase}/songs`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          title,
          artist: artist || null,
          sourceType: "YOUTUBE",
          sourceUrl,
        }),
      });
      const jsonSong = await resSong.json();
      if (!resSong.ok) throw new Error(JSON.stringify(jsonSong));
      const songId = jsonSong.id;

      const resJob = await fetch(`${apiBase}/songs/${songId}/stems-jobs`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          requested_stems: selectedStems,
          use_cinestage: true,
        }),
      });
      const jsonJob = await resJob.json();
      if (!resJob.ok) throw new Error(JSON.stringify(jsonJob));
      const jobId = jsonJob.id;

      // Step 1 — Separating stems
      setProcessingStep(1);
      setProcessingProgress(30);

      let attempts = 0;
      let job = jsonJob;
      while (job.status === "PENDING" || job.status === "RUNNING" || job.status === "PROCESSING") {
        await new Promise((r) => setTimeout(r, 1500));
        attempts += 1;
        setProcessingProgress((prev) => Math.min((typeof prev === "number" ? prev : 30) + 0.8, 82));
        const resPoll = await fetch(
          `${apiBase}/songs/${songId}/stems-jobs/${jobId}`,
          { headers: headers() },
        );
        const jsonPoll = await resPoll.json();
        if (!resPoll.ok) throw new Error(JSON.stringify(jsonPoll));
        job = jsonPoll;
        if (attempts > 80) break;
      }

      if (job.status !== "COMPLETED" && job.status !== "SUCCEEDED") {
        Alert.alert("Processing error", `Job ended with status: ${job.status}`);
        setLoading(false);
        setProcessingProgress(undefined);
        return;
      }

      // Step 2 — Preparing tracks
      setProcessingStep(2);
      setProcessingProgress(90);

      const artifact =
        job.artifact ||
        (await fetchJobArtifact(apiBase, { token, userId }, jobId));
      await applyArtifactToSession(artifact, job?.result?.pad_track || null);

      const resSongFull = await fetch(`${apiBase}/songs/${songId}`, {
        headers: headers(),
      });
      const songFull = await resSongFull.json();
      if (!resSongFull.ok) throw new Error(JSON.stringify(songFull));

      // Step 3 — Job done!
      setProcessingStep(3);
      setProcessingProgress(100);
      await new Promise((r) => setTimeout(r, 900));

      setLoading(false);
      setProcessingProgress(undefined);
      navigation.navigate("Mixer", { song: songFull, apiBase, userId });
    } catch (e) {
      console.error(e);
      setLoading(false);
      setProcessingProgress(undefined);
      Alert.alert("Error", String(e.message || e));
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>New Song</Text>
      <Text style={styles.caption}>
        Enter a YouTube or audio URL. We will create a song, generate stems, and
        take you to the mixer.
      </Text>
      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => navigation.navigate("Library")}
      >
        <Text style={styles.linkButtonText}>Open Project Library</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkButton} onPress={logout}>
        <Text style={styles.linkButtonText}>Sign out</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Backend URL</Text>
      <TextInput
        style={styles.input}
        value={apiBase}
        onChangeText={setApiBase}
        placeholder="http://localhost:8000"
        placeholderTextColor="#6B7280"
      />

      <Text style={styles.label}>Signed in as</Text>
      <Text style={styles.readonly}>{userId || "Guest"}</Text>

      <Text style={styles.label}>Song Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Gratitude"
        placeholderTextColor="#6B7280"
      />

      <Text style={styles.label}>Artist (optional)</Text>
      <TextInput
        style={styles.input}
        value={artist}
        onChangeText={setArtist}
        placeholder="Brandon Lake"
        placeholderTextColor="#6B7280"
      />

      <Text style={styles.label}>Source URL</Text>
      <TextInput
        style={styles.input}
        value={sourceUrl}
        onChangeText={setSourceUrl}
        placeholder="https://youtube.com/watch?v=..."
        placeholderTextColor="#6B7280"
      />

      <Text style={styles.label}>Stems to Generate</Text>
      <View style={styles.stemsRow}>
        {STEM_OPTIONS.map((stem) => {
          const selected = selectedStems.includes(stem);
          return (
            <TouchableOpacity
              key={stem}
              onPress={() => toggleStem(stem)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {stem}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.5 }]}
        onPress={handleCreateAndProcess}
        disabled={loading}
      >
        <Text style={styles.buttonText}>✦ Run CineStage™</Text>
      </TouchableOpacity>

      <View style={styles.toolsSection}>
        <Text style={styles.toolsTitle}>Live Tools</Text>
        <Text style={styles.toolsCaption}>
          Open the advanced live workflow (Song Map, Performance, Live Mode,
          Setlist).
        </Text>
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("SongMap")}
          >
            <Text style={styles.toolButtonText}>Song Map</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("Performance")}
          >
            <Text style={styles.toolButtonText}>Performance</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("LiveMode")}
          >
            <Text style={styles.toolButtonText}>Live Mode</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("Setlist")}
          >
            <Text style={styles.toolButtonText}>Setlist</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("StemMixer")}
          >
            <Text style={styles.toolButtonText}>Stem Mixer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("SystemMap", { mixer: "WING" })}
          >
            <Text style={styles.toolButtonText}>System Map</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("ServicePlan")}
          >
            <Text style={styles.toolButtonText}>Service Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("CueGrid")}
          >
            <Text style={styles.toolButtonText}>Cue Grid</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("ExternalSync")}
          >
            <Text style={styles.toolButtonText}>External Sync</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("Organizer")}
          >
            <Text style={styles.toolButtonText}>Organizer</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("StageDisplay")}
          >
            <Text style={styles.toolButtonText}>Stage Display</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("DeviceRole")}
          >
            <Text style={styles.toolButtonText}>Device Role</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("Settings")}
          >
            <Text style={styles.toolButtonText}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("FatChannelPresets")}
          >
            <Text style={styles.toolButtonText}>Fat Channel Presets</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("CineStage")}
          >
            <Text style={styles.toolButtonText}>CineStage</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate("OnboardingSystemMap")}
          >
            <Text style={styles.toolButtonText}>System Map Setup</Text>
          </TouchableOpacity>
        </View>
      </View>
      </ScrollView>
      <CineStageProcessingOverlay
        visible={loading}
        title="CineStage™ is processing"
        subtitle="Wait — we'll let you know when it's done."
        steps={[
          "Collecting song info",
          "Separating stems",
          "Preparing tracks",
          "Job done!",
        ]}
        currentStepIndex={processingStep}
        progress={processingProgress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#020617",
  },
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: "#020617",
  },
  heading: {
    color: "#F9FAFB",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 6,
  },
  caption: {
    color: "#9CA3AF",
    fontSize: 13,
    marginBottom: 16,
  },
  linkButton: {
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  linkButtonText: {
    color: "#A5B4FC",
    fontSize: 13,
  },
  label: {
    color: "#9CA3AF",
    fontSize: 12,
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#020617",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1F2937",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#E5E7EB",
    fontSize: 13,
  },
  readonly: {
    backgroundColor: "#0B1220",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1F2937",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#E5E7EB",
    fontSize: 13,
  },
  stemsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5",
  },
  chipText: {
    color: "#E5E7EB",
    fontSize: 12,
  },
  chipTextSelected: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  button: {
    marginTop: 20,
    backgroundColor: "#4F46E5",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  toolsSection: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: "#111827",
  },
  toolsTitle: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "700",
  },
  toolsCaption: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  toolsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  toolButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    backgroundColor: "#1F2937",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  toolButtonText: {
    color: "#E5E7EB",
    fontWeight: "600",
    fontSize: 12,
  },
});
