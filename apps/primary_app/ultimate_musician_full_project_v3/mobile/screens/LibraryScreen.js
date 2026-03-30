import { useFocusEffect } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system"; // kept as fallback only
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import CineStageProcessingOverlay from "../components/CineStageProcessingOverlay";
import { makeId } from "../data/models";
import {
  getSongs,
  getSettings,
  addOrUpdateSong,
  saveSongs,
  findSongDuplicate,
  deleteSong,
} from "../data/storage";
import { ensureTblcSeeded, getTblcCount } from "../data/tblcSeed";
import {
  getCachedCineStageUrl,
  getActiveCineStageUrl,
} from "../services/cinestage/resolver";
import {
  formatStemJobFailure,
  hasStemJobResult,
  pollStemJob,
  submitStemJob,
} from "../services/stemJobService";
import { SYNC_URL, syncHeaders } from "./config";

const CINESTAGE_STEPS = [
  "Collecting song info",
  "Separating stems",
  "Preparing tracks",
  "Job done!",
];

const STEM_COLORS = {
  vocals: "#F472B6",
  drums: "#34D399",
  bass: "#60A5FA",
  keys: "#A78BFA",
  guitars: "#FB923C",
  other: "#FBBF24",
};

function stemDotColor(name) {
  return STEM_COLORS[(name || "").toLowerCase()] || "#94A3B8";
}

function getStemKeys(song) {
  const local = Object.keys(song.localStems || {});
  if (local.length > 0) return local;
  const raw = song.latestStemsJob?.result?.stems;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => s.type || s.name || "");
  if (typeof raw === "object") return Object.keys(raw);
  return [];
}

function StemBadges({ song }) {
  const keys = getStemKeys(song);
  if (!keys.length) return null;
  return (
    <View style={styles.badgeRow}>
      {keys.slice(0, 6).map((k) => (
        <View
          key={k}
          style={[styles.stemDot, { backgroundColor: stemDotColor(k) }]}
        />
      ))}
      <Text style={styles.stemLabel}>
        {keys.length} stem{keys.length !== 1 ? "s" : ""}
      </Text>
    </View>
  );
}

// ── Smart song list parser ────────────────────────────────────────────────────
// Handles: "Title - Artist", "Title, Artist, BPM, Key", numbered lists,
// plain titles, JSON arrays, tab-separated values, and YouTube links inline.
const YT_URL_RE = /https?:\/\/(?:www\.)?(?:youtu\.be|youtube\.com)\/[^\s,\t]*/;

function parseSongList(text) {
  if (!text || !text.trim()) return [];

  // Try JSON first
  try {
    const json = JSON.parse(text.trim());
    if (Array.isArray(json)) {
      return json
        .map((item) => {
          if (typeof item === "string")
            return { title: item.trim(), artist: "" };
          if (item && (item.title || item.name)) {
            return {
              title: String(item.title || item.name || "").trim(),
              artist: String(item.artist || item.author || "").trim(),
              bpm: item.bpm ? Number(item.bpm) || null : null,
              originalKey: item.key || item.originalKey || null,
              timeSig: item.timeSig || item.time_sig || null,
              youtubeLink:
                item.youtubeLink || item.youtube_link || item.youtube || null,
            };
          }
          return null;
        })
        .filter((s) => s && s.title);
    }
  } catch {
    // Not JSON — continue with text parsing
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const songs = [];

  for (const raw of lines) {
    // Skip obvious header rows
    if (/^(title|song|name|artist|#)/i.test(raw) && raw.split(",").length > 1)
      continue;

    // Extract YouTube URL anywhere on the line, then remove it before further parsing
    const ytMatch = raw.match(YT_URL_RE);
    const youtubeLink = ytMatch ? ytMatch[0] : null;
    const cleanRaw = youtubeLink
      ? raw
          .replace(YT_URL_RE, "")
          .replace(/\s{2,}/g, " ")
          .replace(/,\s*,/g, ",")
          .trim()
      : raw;

    // Strip leading numbers: "1. ", "1) ", "01 - "
    const line = cleanRaw.replace(/^\d+[\.\)\-]\s*/, "").trim();
    if (!line) continue;

    // Tab-separated (Excel copy-paste): Title\tArtist\tBPM\tKey[\tTimeSig[\tYTLink]]
    if (line.includes("\t")) {
      const parts = line.split("\t").map((s) => s.trim());
      // Any tab column might itself be a YouTube URL (e.g. exported from spreadsheet)
      const ytCol = parts.find((p) => YT_URL_RE.test(p));
      songs.push({
        title: parts[0] || "",
        artist: parts[1] || "",
        bpm: parts[2] ? Number(parts[2]) || null : null,
        originalKey: parts[3] || null,
        timeSig: parts[4] || null,
        youtubeLink: youtubeLink || ytCol || null,
      });
      continue;
    }

    // Em-dash or hyphen separator: "Way Maker - Sinach" or "Way Maker – Sinach"
    const dashSeps = [" – ", " — ", " - "];
    let matched = false;
    for (const sep of dashSeps) {
      const idx = line.indexOf(sep);
      if (idx > 0) {
        const title = line.slice(0, idx).trim();
        const rest = line.slice(idx + sep.length).trim();
        // rest may be "Artist, BPM, Key" or just "Artist"
        const restParts = rest.split(",").map((s) => s.trim());
        songs.push({
          title,
          artist: restParts[0] || "",
          bpm: restParts[1] ? Number(restParts[1]) || null : null,
          originalKey: restParts[2] || null,
          youtubeLink,
        });
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // CSV: "Title, Artist, BPM, Key, TimeSig[, YouTubeLink]"
    if (line.includes(",")) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts[0]) {
        const ytCol = parts.find((p) => YT_URL_RE.test(p));
        songs.push({
          title: parts[0],
          artist: parts[1] || "",
          bpm: parts[2] ? Number(parts[2]) || null : null,
          originalKey: parts[3] || null,
          timeSig: parts[4] || null,
          youtubeLink: youtubeLink || ytCol || null,
        });
        continue;
      }
    }

    // Pipe separator: "Title | Artist"
    if (line.includes("|")) {
      const parts = line.split("|").map((s) => s.trim());
      songs.push({
        title: parts[0] || line,
        artist: parts[1] || "",
        youtubeLink,
      });
      continue;
    }

    // Plain title only
    songs.push({ title: line, artist: "", youtubeLink });
  }

  return songs.filter((s) => s.title && s.title.length > 0);
}

export default function LibraryScreen({ navigation }) {
  const { width: _libWidth } = useWindowDimensions();
  const _libIsIPad = _libWidth >= 768;
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // API settings
  const [apiBase, setApiBase] = useState(getCachedCineStageUrl());
  const [userId, setUserId] = useState("demo-user");

  // URL input modal (CineStage)
  const [urlModalSong, setUrlModalSong] = useState(null);
  const [sourceUrl, setSourceUrl] = useState("");

  // CineStage processing
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);

  // TBLC library seed
  const [tblcLoading, setTblcLoading] = useState(false);
  const [tblcDone, setTblcDone] = useState(false);

  async function handleImportTblc() {
    Alert.alert(
      "Import ARCERVO Louvor TBLC",
      `This will replace your current library with all ${getTblcCount()} songs from the TBLC spreadsheet, including YouTube links, keys, and BPM.\n\nYour existing songs will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import All",
          style: "destructive",
          onPress: async () => {
            setTblcLoading(true);
            const result = await ensureTblcSeeded();
            setTblcLoading(false);
            if (result.status === "seeded") {
              setTblcDone(true);
              await loadSongs();
              Alert.alert(
                "Done!",
                `${result.count} songs imported from ARCERVO Louvor TBLC.\n206 songs have YouTube links ready for CineStage™.`,
              );
            } else {
              Alert.alert("Error", result.error || "Could not import.");
            }
          },
        },
      ],
    );
  }

  // Import modal
  const [importModal, setImportModal] = useState(false);
  const [importTab, setImportTab] = useState("paste"); // 'paste' | 'file'
  const [pasteText, setPasteText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState([]);

  const loadSongs = useCallback(async () => {
    setLoading(true);
    try {
      const localSongs = await getSongs();
      const localMap = {};
      for (const song of localSongs) {
        if (song?.id) localMap[song.id] = song;
      }

      try {
        const response = await fetch(`${SYNC_URL}/sync/library-pull`, {
          headers: syncHeaders(),
        });
        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          const remoteSongs = Array.isArray(payload?.songs)
            ? payload.songs
            : Object.values(payload?.songs || {});

          for (const remoteSong of remoteSongs) {
            if (!remoteSong?.id) continue;
            const localSong = localMap[remoteSong.id];
            localMap[remoteSong.id] = localSong
              ? {
                  ...localSong,
                  ...remoteSong,
                  localStems: localSong.localStems || remoteSong.localStems,
                }
              : remoteSong;
          }
        }
      } catch {
        /* cloud pull is best-effort here */
      }

      const mergedSongs = Object.values(localMap);
      await saveSongs(mergedSongs);
      setSongs(mergedSongs);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      if (settings.apiBase) {
        setApiBase(settings.apiBase);
      } else {
        const resolved = await getActiveCineStageUrl();
        setApiBase(resolved);
      }
      if (settings.defaultUserId) setUserId(settings.defaultUserId);
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSongs();
    }, [loadSongs]),
  );

  const filtered = query.trim()
    ? songs.filter(
        (s) =>
          (s.title || "").toLowerCase().includes(query.toLowerCase()) ||
          (s.artist || "").toLowerCase().includes(query.toLowerCase()),
      )
    : songs;

  // ── CineStage modal ───────────────────────────────────────────────────────
  function openCineStageModal(song) {
    setUrlModalSong(song);
    setSourceUrl(song.youtubeLink || "");
  }
  function closeCineStageModal() {
    setUrlModalSong(null);
    setSourceUrl("");
  }

  // If the song already has a stored YouTube link, skip the modal and go straight to processing.
  function handleRunCineStage(song) {
    if (song.youtubeLink) {
      runCineStageJob(song, song.youtubeLink);
    } else {
      openCineStageModal(song);
    }
  }

  // Called from modal "Start Processing" button — uses modal state
  function startProcessing() {
    if (!sourceUrl.trim()) {
      Alert.alert(
        "Source URL required",
        "Paste a YouTube or audio URL to separate stems.",
      );
      return;
    }
    const song = urlModalSong;
    closeCineStageModal();
    runCineStageJob(song, sourceUrl.trim());
  }

  async function runCineStageJob(song, url) {
    setProcessingStep(0);
    setProcessingProgress(5);
    setProcessing(true);
    try {
      const songIdForJob = song.id || makeId("song");
      const { job, fileUrl: resolvedSourceUrl } = await submitStemJob({
        sourceUrl: url,
        title: song.title || "Imported Stems",
        songId: songIdForJob,
        separateHarmonies: true,
        voiceCount: 3,
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
              setProcessingProgress((prev) => Math.min(88, prev + 0.2));
            }
          }
        },
      });
      if (!hasStemJobResult(current)) {
        setProcessing(false);
        Alert.alert("Processing error", formatStemJobFailure(current));
        return;
      }
      setProcessingStep(2);
      setProcessingProgress(90);
      const result = current.result || {};
      const allSongs = await getSongs();
      const existing = findSongDuplicate(
        allSongs,
        result.title || song.title,
        result.artist || song.artist,
      );
      const saved = await addOrUpdateSong({
        id: existing?.id || song.id || makeId("song"),
        ...(existing || song),
        sourceUrl: resolvedSourceUrl,
        originalKey: current.key || result.key || song.originalKey || "",
        bpm: current.bpm || result.bpm || song.bpm || null,
        latestStemsJob: current,
      });
      setProcessingStep(3);
      setProcessingProgress(100);
      await loadSongs();
      await new Promise((r) => setTimeout(r, 1000));
      setProcessing(false);
      navigation.push("Rehearsal", { song: saved, apiBase });
    } catch (e) {
      setProcessing(false);
      const msg = String(e.message || e);
      const isNetwork =
        msg.toLowerCase().includes("network") ||
        msg.toLowerCase().includes("failed to fetch") ||
        msg.toLowerCase().includes("connection");
      if (isNetwork) {
        Alert.alert(
          "CineStage Server Offline",
          `Could not reach the CineStage backend at:\n${apiBase}\n\nMake sure the server is running, then try again.\n\nThe YouTube link is saved — you can retry anytime.`,
          [{ text: "OK" }],
        );
      } else {
        Alert.alert("CineStage Error", msg);
      }
    }
  }

  // ── Import helpers ────────────────────────────────────────────────────────
  function openImportModal() {
    setPasteText("");
    setImportPreview([]);
    setImportTab("paste");
    setImportModal(true);
  }

  function closeImportModal() {
    setImportModal(false);
    setPasteText("");
    setImportPreview([]);
  }

  function handlePasteChange(text) {
    setPasteText(text);
    const parsed = parseSongList(text);
    setImportPreview(parsed.slice(0, 8)); // preview first 8
  }

  async function handleFileImport() {
    try {
      setImportBusy(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "text/csv", "application/json", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) {
        setImportBusy(false);
        return;
      }
      const { uri, name } = res.assets[0];

      // xlsx / xls are binary ZIP archives — can't be read as text
      const ext = (name || "").split(".").pop().toLowerCase();
      if (ext === "xlsx" || ext === "xls") {
        setImportBusy(false);
        Alert.alert(
          "Export as CSV first",
          'Excel files (.xlsx) must be exported as CSV before importing here.\n\nIn Excel or Numbers:\n  1. File → Export / Save As\n  2. Choose CSV (.csv)\n  3. Pick that CSV file here\n\nOr copy the cells in Excel and paste them in the "Paste / Type" tab — it reads comma and tab-separated text automatically.',
          [{ text: "Got it" }],
        );
        return;
      }

      // Read using fetch() — works with iCloud URIs in Expo Go
      let raw = "";
      try {
        const response = await fetch(uri);
        raw = await response.text();
      } catch {
        // Fallback: try FileSystem if available
        if (FileSystem && typeof FileSystem.readAsStringAsync === "function") {
          raw = await FileSystem.readAsStringAsync(uri, { encoding: "utf8" });
        } else {
          throw new Error(
            'Could not read this file. Try copying the content and pasting it in the "Paste / Type" tab instead.',
          );
        }
      }

      setPasteText(raw);
      const parsed = parseSongList(raw);
      setImportPreview(parsed.slice(0, 8));
      setImportTab("paste");
      setImportBusy(false);

      if (parsed.length === 0) {
        Alert.alert(
          "Nothing found",
          `Could not detect songs in "${name}".\n\nMake sure the file has one song per line, e.g.:\n  Way Maker - Sinach\n  Gratitude, Brandon Lake, 72, A`,
        );
      }
    } catch (e) {
      setImportBusy(false);
      Alert.alert("File error", String(e.message || e));
    }
  }

  async function handleImportSongs() {
    const parsed = parseSongList(pasteText);
    if (parsed.length === 0) {
      Alert.alert("Nothing to import", "Add some songs above first.");
      return;
    }
    setImportBusy(true);
    try {
      const allSongs = await getSongs();
      let added = 0;
      let updated = 0;
      for (const s of parsed) {
        const dup = findSongDuplicate(allSongs, s.title, s.artist);
        if (dup) {
          // Song already exists — update any fields the import provides that the existing record lacks
          const patch = {};
          if (s.youtubeLink && !dup.youtubeLink)
            patch.youtubeLink = s.youtubeLink;
          if (s.originalKey && !dup.originalKey)
            patch.originalKey = s.originalKey;
          if (s.bpm && !dup.bpm) patch.bpm = s.bpm;
          if (s.timeSig && !dup.timeSig) patch.timeSig = s.timeSig;
          if (s.artist && !dup.artist) patch.artist = s.artist;
          if (Object.keys(patch).length > 0) {
            await addOrUpdateSong({ ...dup, ...patch });
            updated++;
          }
          continue;
        }
        await addOrUpdateSong({
          id: makeId("song"),
          title: s.title,
          artist: s.artist || "",
          bpm: s.bpm || null,
          originalKey: s.originalKey || null,
          timeSig: s.timeSig || null,
          youtubeLink: s.youtubeLink || null,
        });
        added++;
      }
      await loadSongs();
      setImportBusy(false);
      closeImportModal();
      const parts = [];
      if (added > 0) parts.push(`${added} song${added !== 1 ? "s" : ""} added`);
      if (updated > 0)
        parts.push(`${updated} song${updated !== 1 ? "s" : ""} updated`);
      Alert.alert(
        "Import complete",
        parts.length > 0 ? parts.join("\n") : "No new data found.",
      );
    } catch (e) {
      setImportBusy(false);
      Alert.alert("Import error", String(e.message || e));
    }
  }

  // ── Delete song ───────────────────────────────────────────────────────────
  function handleDeleteSong(song) {
    Alert.alert(
      `Delete "${song.title}"?`,
      'This will permanently remove the song from your library.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSong(song.id);
            await loadSongs();
          },
        },
      ],
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.navLink}>Planning Center</Text>
        </TouchableOpacity>
        <Text style={styles.navSep}>›</Text>
        <Text style={styles.navActive}>Library</Text>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>Library</Text>
        <View style={styles.titleActions}>
          <TouchableOpacity
            style={styles.importBtn}
            onPress={openImportModal}
            activeOpacity={0.8}
          >
            <Text style={styles.importBtnText}>↓ Import</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addSongBtn}
            onPress={() => navigation.navigate("SongDetail", { song: null })}
            activeOpacity={0.8}
          >
            <Text style={styles.addSongBtnText}>＋ Add Song</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.subtitle}>
        Tap a song to view. Run CineStage™ to separate stems.
      </Text>

      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Search songs or artists"
        placeholderTextColor="#4B5563"
        returnKeyType="search"
      />

      {loading ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={[styles.list, _libIsIPad && { paddingHorizontal: 4 }]}
          numColumns={_libIsIPad ? 2 : 1}
          key={_libIsIPad ? 'grid' : 'list'}
          columnWrapperStyle={_libIsIPad ? { gap: 8 } : undefined}
          refreshing={loading}
          onRefresh={loadSongs}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {query ? "No matches found" : "No songs yet"}
              </Text>
              <Text style={styles.emptyCaption}>
                {query
                  ? "Try a different search term."
                  : 'Tap "Import" to bring in songs from Excel, Notes, or any text file — or tap "+ Add Song" to add one manually.'}
              </Text>
              {!query && (
                <TouchableOpacity
                  style={styles.emptyImportBtn}
                  onPress={openImportModal}
                >
                  <Text style={styles.emptyImportText}>↓ Import Songs</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const hasStemsDone = getStemKeys(item).length > 0;
            const meta = [
              item.bpm && `BPM ${item.bpm}`,
              (item.originalKey || item.key) &&
                `Key ${item.originalKey || item.key}`,
              item.timeSig && item.timeSig,
            ]
              .filter(Boolean)
              .join("  ·  ");
            return (
              <TouchableOpacity
                style={[styles.card, _libIsIPad && { flex: 1, minWidth: 0 }]}
                onPress={() =>
                  navigation.navigate("SongDetail", { song: item })
                }
                activeOpacity={0.85}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.artist ? (
                      <Text style={styles.cardArtist} numberOfLines={1}>
                        {item.artist}
                      </Text>
                    ) : null}
                    {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}
                    <StemBadges song={item} />
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    {hasStemsDone && (
                      <View style={styles.stemsReadyBadge}>
                        <Text style={styles.stemsReadyText}>Stems ✓</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => handleDeleteSong(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.deleteBtn}
                    >
                      <Text style={styles.deleteBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  {hasStemsDone ? (
                    <TouchableOpacity
                      style={styles.rehearsalBtn}
                      onPress={() =>
                        navigation.push("Rehearsal", { song: item, apiBase })
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.rehearsalBtnText}>▶ Rehearsal</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.cineBtn}
                      onPress={() => handleRunCineStage(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cineBtnText}>✦ Run CineStage™</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── CineStage URL modal ───────────────────────────────────────────── */}
      <Modal
        visible={!!urlModalSong}
        animationType="slide"
        transparent
        onRequestClose={closeCineStageModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Run CineStage™</Text>
            {urlModalSong && (
              <Text style={styles.modalSong}>{urlModalSong.title}</Text>
            )}
            <Text style={styles.modalLabel}>Source URL</Text>
            <TextInput
              style={styles.modalInput}
              value={sourceUrl}
              onChangeText={setSourceUrl}
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor="#4B5563"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <Text style={styles.modalHint}>
              CineStage™ will separate vocals, drums, bass, keys, and more from
              this source.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={closeCineStageModal}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.startBtn,
                  !sourceUrl.trim() && styles.startBtnDisabled,
                ]}
                onPress={startProcessing}
                disabled={!sourceUrl.trim()}
                activeOpacity={0.8}
              >
                <Text style={styles.startBtnText}>Start Processing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Import modal ──────────────────────────────────────────────────── */}
      <Modal
        visible={importModal}
        animationType="slide"
        transparent
        onRequestClose={closeImportModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.importModalCard]}>
            <Text style={styles.modalTitle}>Import Songs</Text>
            <Text style={styles.importModalSub}>
              Paste from Notes, WhatsApp, or any app — or pick a CSV / text file
              from Excel, Numbers, or Google Sheets.
            </Text>

            {/* Tab bar */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, importTab === "paste" && styles.tabActive]}
                onPress={() => setImportTab("paste")}
              >
                <Text
                  style={[
                    styles.tabText,
                    importTab === "paste" && styles.tabTextActive,
                  ]}
                >
                  Paste / Type
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, importTab === "file" && styles.tabActive]}
                onPress={() => setImportTab("file")}
              >
                <Text
                  style={[
                    styles.tabText,
                    importTab === "file" && styles.tabTextActive,
                  ]}
                >
                  From File
                </Text>
              </TouchableOpacity>
            </View>

            {importTab === "paste" ? (
              <>
                <Text style={styles.importHint}>
                  One song per line. Supported formats:{"\n"}
                  {"  "}Song Title - Artist{"\n"}
                  {"  "}Song Title, Artist, BPM, Key{"\n"}
                  {"  "}Song Title (title only){"\n"}
                  {"  "}CSV / tab from Excel, Numbers, Google Sheets{"\n"}
                  {"  "}JSON array from any tool{"\n"}
                  YouTube links in the text are saved automatically.
                </Text>
                <TextInput
                  style={styles.pasteInput}
                  value={pasteText}
                  onChangeText={handlePasteChange}
                  placeholder={`Way Maker - Sinach\nGratitude - Brandon Lake\nOceans - Hillsong United\n...`}
                  placeholderTextColor="#374151"
                  multiline
                  autoCorrect={false}
                  autoCapitalize="sentences"
                />
                {importPreview.length > 0 && (
                  <View style={styles.previewBox}>
                    <Text style={styles.previewHeader}>
                      Preview — {parseSongList(pasteText).length} song
                      {parseSongList(pasteText).length !== 1 ? "s" : ""} found:
                    </Text>
                    {importPreview.map((s, i) => (
                      <Text key={i} style={styles.previewRow} numberOfLines={1}>
                        {s.title}
                        {s.artist ? ` · ${s.artist}` : ""}
                        {s.bpm ? ` · BPM ${s.bpm}` : ""}
                        {s.youtubeLink ? " · ▶ YT" : ""}
                      </Text>
                    ))}
                    {parseSongList(pasteText).length > 8 && (
                      <Text style={styles.previewMore}>
                        + {parseSongList(pasteText).length - 8} more…
                      </Text>
                    )}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.fileTab}>
                <Text style={styles.fileTabDesc}>
                  Pick a file exported from:{"\n"}
                  {"  "}- Excel / Numbers / Google Sheets → Save as CSV{"\n"}
                  {"  "}- Apple Notes / Reminders → Share as text{"\n"}
                  {"  "}- Any plain text (.txt) or JSON list
                </Text>
                <TouchableOpacity
                  style={styles.filePickBtn}
                  onPress={handleFileImport}
                  disabled={importBusy}
                  activeOpacity={0.8}
                >
                  {importBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.filePickBtnText}>
                      Choose File (CSV / TXT / JSON)
                    </Text>
                  )}
                </TouchableOpacity>
                {pasteText.length > 0 && importPreview.length > 0 && (
                  <View style={styles.previewBox}>
                    <Text style={styles.previewHeader}>
                      {parseSongList(pasteText).length} song
                      {parseSongList(pasteText).length !== 1 ? "s" : ""} found
                      in file:
                    </Text>
                    {importPreview.map((s, i) => (
                      <Text key={i} style={styles.previewRow} numberOfLines={1}>
                        {s.title}
                        {s.artist ? ` · ${s.artist}` : ""}
                        {s.bpm ? ` · BPM ${s.bpm}` : ""}
                        {s.youtubeLink ? " · ▶ YT" : ""}
                      </Text>
                    ))}
                    {parseSongList(pasteText).length > 8 && (
                      <Text style={styles.previewMore}>
                        + {parseSongList(pasteText).length - 8} more…
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={closeImportModal}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.startBtn,
                  (!pasteText.trim() || importBusy) && styles.startBtnDisabled,
                ]}
                onPress={handleImportSongs}
                disabled={!pasteText.trim() || importBusy}
                activeOpacity={0.8}
              >
                {importBusy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.startBtnText}>
                    Import{" "}
                    {parseSongList(pasteText).length > 0
                      ? `${parseSongList(pasteText).length} Songs`
                      : "Songs"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── CineStage processing overlay ──────────────────────────────────── */}
      <CineStageProcessingOverlay
        visible={processing}
        title="CineStage™ is processing"
        subtitle="Wait — we'll let you know when it's done."
        steps={CINESTAGE_STEPS}
        currentStepIndex={processingStep}
        progress={processingProgress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617", paddingTop: 8 },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 6,
    gap: 6,
  },
  navLink: { color: "#6B7280", fontSize: 12 },
  navSep: { color: "#374151", fontSize: 12 },
  navActive: { color: "#E5E7EB", fontSize: 12, fontWeight: "600" },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  title: { color: "#F9FAFB", fontSize: 24, fontWeight: "800" },
  titleActions: { flexDirection: "row", gap: 8 },

  importBtn: {
    backgroundColor: "#0C2540",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#1D4ED8",
  },
  importBtnText: { color: "#60A5FA", fontSize: 13, fontWeight: "700" },

  addSongBtn: {
    backgroundColor: "#1E1B4B",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#4338CA",
  },
  addSongBtnText: { color: "#818CF8", fontSize: 13, fontWeight: "700" },

  subtitle: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tblcBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#1A0E30",
    borderWidth: 1,
    borderColor: "#7C3AED",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 2,
  },
  tblcBannerTitle: { color: "#C4B5FD", fontSize: 14, fontWeight: "800" },
  tblcBannerSub: { color: "#6D28D9", fontSize: 12 },

  searchInput: {
    marginHorizontal: 16,
    backgroundColor: "#0B1120",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1F2937",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#E5E7EB",
    fontSize: 14,
    marginBottom: 8,
  },

  list: { padding: 16, paddingTop: 4, paddingBottom: 60 },

  card: {
    backgroundColor: "#0B1120",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#111827",
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start" },
  cardInfo: { flex: 1 },
  cardTitle: { color: "#F9FAFB", fontSize: 16, fontWeight: "700" },
  cardArtist: { color: "#9CA3AF", fontSize: 13, marginTop: 2 },
  cardMeta: { color: "#4B5563", fontSize: 11, marginTop: 4 },

  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 4,
  },
  stemDot: { width: 8, height: 8, borderRadius: 4 },
  stemLabel: { color: "#4B5563", fontSize: 10, marginLeft: 2 },

  stemsReadyBadge: {
    backgroundColor: "#14532D",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
    alignSelf: "flex-start",
  },
  stemsReadyText: { color: "#34D399", fontSize: 10, fontWeight: "700" },

  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1F1014',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 13 },

  cardActions: { flexDirection: "row", gap: 8, marginTop: 12 },

  cineBtn: {
    flex: 1,
    backgroundColor: "#1E1B4B",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4338CA",
  },
  cineBtnText: { color: "#818CF8", fontSize: 13, fontWeight: "700" },

  rehearsalBtn: {
    flex: 1,
    backgroundColor: "#14532D",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#16A34A",
  },
  rehearsalBtnText: { color: "#4ADE80", fontSize: 13, fontWeight: "700" },

  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: { color: "#F9FAFB", fontSize: 18, fontWeight: "700" },
  emptyCaption: {
    color: "#6B7280",
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyImportBtn: {
    marginTop: 20,
    backgroundColor: "#0C2540",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#1D4ED8",
  },
  emptyImportText: { color: "#60A5FA", fontSize: 14, fontWeight: "700" },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "#00000099",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#0B1120",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: "#1F2937",
  },
  importModalCard: { maxHeight: "92%" },
  modalTitle: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  modalSong: {
    color: "#818CF8",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 16,
  },
  modalLabel: { color: "#9CA3AF", fontSize: 12, marginBottom: 6 },
  modalInput: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#E5E7EB",
    fontSize: 14,
  },
  modalHint: { color: "#4B5563", fontSize: 12, marginTop: 8, lineHeight: 18 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#1F2937",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  cancelText: { color: "#9CA3AF", fontWeight: "600" },
  startBtn: {
    flex: 2,
    backgroundColor: "#4338CA",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },

  // Import modal specifics
  importModalSub: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 19,
  },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  tabActive: { backgroundColor: "#1E3A5F", borderColor: "#2563EB" },
  tabText: { color: "#6B7280", fontSize: 13, fontWeight: "700" },
  tabTextActive: { color: "#93C5FD" },

  importHint: {
    color: "#4B5563",
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 18,
  },
  pasteInput: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#E5E7EB",
    fontSize: 13,
    minHeight: 120,
    textAlignVertical: "top",
    maxHeight: 180,
  },
  previewBox: {
    marginTop: 10,
    backgroundColor: "#020617",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 10,
  },
  previewHeader: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  previewRow: { color: "#94A3B8", fontSize: 12, marginBottom: 3 },
  previewMore: { color: "#4B5563", fontSize: 11, marginTop: 4 },

  fileTab: { gap: 14 },
  fileTabDesc: { color: "#6B7280", fontSize: 13, lineHeight: 21 },
  filePickBtn: {
    backgroundColor: "#1E3A5F",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2563EB",
  },
  filePickBtnText: { color: "#93C5FD", fontSize: 14, fontWeight: "700" },
});
