import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import CineStageProcessingOverlay from "../components/CineStageProcessingOverlay";
import { useAuth } from "../context/AuthContext";
import { makeId } from "../data/models";
import {
  addOrUpdateSong,
  findSongDuplicate,
  getSongs,
} from "../data/storage";
import {
  buildStemsFromArtifact,
  fetchWaveformPeaks,
} from "../services/artifactClient";
import { analyzeAudio } from "../services/cinestage";
import {
  defaultSession,
  loadSession,
  saveSession,
} from "../services/sessionStore";
import {
  formatStemJobFailure,
  hasStemJobResult,
  pollStemJob,
  submitStemJob,
} from "../services/stemJobService";

export default function NewSongScreen({ navigation }) {
  const { logout, userId } = useAuth();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(undefined);

  const applyStemResultToSession = async (result) => {
    const peaksUrl =
      result?.waveform_peaks ||
      result?.artifacts?.waveform_peaks ||
      result?.waveformPeaks ||
      null;
    const peaks = await fetchWaveformPeaks(peaksUrl);
    const current = (await loadSession()) || defaultSession();
    const stems = buildStemsFromArtifact(result, current.stems);
    const next = {
      ...current,
      bpm: result?.bpm || result?.tempo || current.bpm,
      stems: stems.length > 0 ? stems : current.stems,
      waveformPeaks:
        peaks || result?.waveformPeaks || current.waveformPeaks || null,
      padTrackUrl:
        result?.pad_track ||
        result?.click_track ||
        result?.voice_guide ||
        current.padTrackUrl ||
        null,
      lastUpdated: new Date().toISOString(),
    };
    await saveSession(next);
  };

  const handleCreateAndProcess = async () => {
    const trimmedTitle = title.trim();
    const trimmedArtist = artist.trim();
    const trimmedSourceUrl = sourceUrl.trim();

    if (!trimmedTitle || !trimmedSourceUrl) {
      Alert.alert(
        "Missing info",
        "Song title and source URL are required.",
      );
      return;
    }

    setLoading(true);
    setProcessingStep(0);
    setProcessingProgress(5);

    const songId = makeId("song");

    try {
      const { job, fileUrl: resolvedSourceUrl } = await submitStemJob({
        sourceUrl: trimmedSourceUrl,
        title: trimmedTitle,
        songId,
        separateHarmonies: true,
        voiceCount: 4,
      });

      setProcessingProgress(20);
      const current = await pollStemJob(job.id, {
        initialJob: job,
        onUpdate: (nextJob, { polls, previousStatus }) => {
          if (nextJob.status === "PENDING") {
            setProcessingStep(0);
            setProcessingProgress(Math.min(28, 20 + polls * 2));
          } else if (nextJob.status === "PROCESSING") {
            if (previousStatus !== "PROCESSING") {
              setProcessingStep(1);
              setProcessingProgress(30);
            } else {
              setProcessingProgress((prev) => Math.min(88, (prev || 30) + 0.2));
            }
          }
        },
      });

      if (!hasStemJobResult(current)) {
        Alert.alert("Processing error", formatStemJobFailure(current));
        return;
      }

      const result = current.result || {};

      setProcessingStep(2);
      setProcessingProgress(90);

      await applyStemResultToSession({
        ...result,
        bpm: current.bpm || result.bpm || result.tempo || null,
      });

      const allSongs = await getSongs();
      const existing = findSongDuplicate(
        allSongs,
        result.title || trimmedTitle,
        result.artist || trimmedArtist,
      );

      let saved = await addOrUpdateSong({
        id: existing?.id || songId,
        ...(existing || {}),
        title: result.title || trimmedTitle,
        artist: result.artist || trimmedArtist,
        sourceUrl: resolvedSourceUrl,
        originalKey:
          current.key ||
          result.key ||
          result.original_key ||
          existing?.originalKey ||
          "",
        bpm:
          current.bpm ||
          result.bpm ||
          result.tempo ||
          existing?.bpm ||
          null,
        latestStemsJob: current,
        vocalHarmonies: result.harmonies || existing?.vocalHarmonies || {},
        cinestageJobId: current.id,
      });

      try {
        const analysis = await analyzeAudio({
          file_url: resolvedSourceUrl,
          title: saved.title,
          song_id: saved.id,
          n_sections: 6,
        });
        saved = await addOrUpdateSong({
          ...saved,
          bpm: analysis.bpm || saved.bpm,
          originalKey: analysis.key || saved.originalKey,
          analysis: {
            sections: analysis.sections,
            chords: analysis.chords,
            cues: analysis.cues,
            beats_ms: analysis.beats_ms,
            performance_graph: analysis.performance_graph,
            duration_ms: analysis.duration_ms,
            analyzedAt: new Date().toISOString(),
          },
        });
      } catch {
        // Analysis is best-effort and should not block stem separation.
      }

      setProcessingStep(3);
      setProcessingProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 900));

      navigation.navigate("Rehearsal", {
        song: saved,
        userId,
        autoPlay: true,
      });
    } catch (e) {
      console.error(e);
      Alert.alert("Error", String(e.message || e));
    } finally {
      setLoading(false);
      setProcessingProgress(undefined);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>New Song</Text>
        <Text style={styles.caption}>
          Enter a YouTube or audio URL. We will separate stems, save the song
          to your library, and open rehearsal when the job finishes.
        </Text>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate("StemsCenter")}
        >
          <Text style={styles.linkButtonText}>Open Stem Separator Center</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate("Library")}
        >
          <Text style={styles.linkButtonText}>Open Project Library</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkButton} onPress={logout}>
          <Text style={styles.linkButtonText}>Sign out</Text>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>CineStage Flow</Text>
          <Text style={styles.infoText}>
            Standard stems are generated automatically. Use Stem Separator
            Center for local audio files, ZIP multitracks, and manual stem
            attachment.
          </Text>
        </View>

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
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

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
              onPress={() => navigation.navigate("Live")}
            >
              <Text style={styles.toolButtonText}>Live Performance</Text>
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
              onPress={() => navigation.navigate("Live")}
            >
              <Text style={styles.toolButtonText}>Stem Mixer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.toolButton}
              onPress={() =>
                navigation.navigate("SystemMap", { mixer: "WING" })
              }
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
  infoCard: {
    backgroundColor: "#0B1220",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    marginBottom: 8,
    padding: 12,
  },
  infoTitle: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  infoText: {
    color: "#9CA3AF",
    fontSize: 12,
    lineHeight: 18,
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
