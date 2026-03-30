import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { unzip } from "fflate";
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
} from "react-native";

import {
  SYNC_URL,
  syncHeaders,
} from "./config";
import CineStageProcessingOverlay from "../components/CineStageProcessingOverlay";
import { makeId } from "../data/models";
import {
  addOrUpdateSong,
  findSongDuplicate,
  getSettings,
  getSongs,
} from "../data/storage";
import { analyzeAudioFile } from "../services/audioTagReader";
import {
  getCachedCineStageUrl,
  getActiveCineStageUrl,
  analyzeAudio,
} from "../services/cinestage";
import {
  formatStemJobFailure,
  hasStemJobResult,
  isLocalSourceUrl,
  pollStemJob,
  submitStemJob,
} from "../services/stemJobService";
import {
  setCineStageStatus,
  clearCineStageStatus,
} from "../services/cinestageStatus";
import {
  getEntitlements,
  PlanTiers,
  FEATURE_LABELS,
  FEATURE_MIN_TIER,
} from "../services/planEntitlements";
import { loadSession } from "../services/sessionStore";

const CINESTAGE_STEPS = [
  "Collecting song info",
  "Separating stems",
  "Separating vocal harmonies",
  "Preparing tracks",
  "Job done!",
];

const STEM_SLOTS = ["Vocals", "Drums", "Bass", "Keys", "Guitars", "Other"];

const STEM_COLORS = {
  vocals: "#F472B6",
  drums: "#34D399",
  bass: "#60A5FA",
  keys: "#A78BFA",
  guitars: "#FB923C",
  other: "#FBBF24",
};

const STEMS_DIR = FileSystem.documentDirectory + "um_stems/";

function stemKey(name) {
  return (name || "").toLowerCase();
}

function dotColorFor(name) {
  return STEM_COLORS[stemKey(name)] || "#94A3B8";
}

function normaliseStemsToKeys(stems) {
  if (!stems) return [];
  if (Array.isArray(stems)) return stems.map((s) => s.type || s.name || "");
  if (typeof stems === "object") return Object.keys(stems);
  return [];
}

function hasMixableStems(song) {
  const hasLocal = song.localStems && Object.keys(song.localStems).length > 0;
  const hasBackend =
    normaliseStemsToKeys(song.latestStemsJob?.result?.stems).length > 0;
  return hasLocal || hasBackend;
}

function isYouTubeUrl(url) {
  return url && /youtube\.com|youtu\.be/i.test(url);
}

function StemDots({ song }) {
  const localKeys = Object.keys(song.localStems || {});
  const backendKeys = normaliseStemsToKeys(song.latestStemsJob?.result?.stems);
  const names = localKeys.length > 0 ? localKeys : backendKeys;
  const sourceUrl =
    song.latestStemsJob?.input?.sourceUrl || song.sourceUrl || "";
  const hasYouTube = isYouTubeUrl(sourceUrl);
  if (!names.length) return null;
  return (
    <View style={styles.dotsRow}>
      {names.slice(0, 6).map((n) => (
        <View
          key={n}
          style={[styles.stemDot, { backgroundColor: dotColorFor(n) }]}
        />
      ))}
      <Text style={styles.dotLabel}>
        {names.length} stem{names.length !== 1 ? "s" : ""}
      </Text>
      {hasYouTube && <Text style={styles.ytBadge}>▶ YT</Text>}
    </View>
  );
}

export default function StemsCenterScreen({ navigation, route }) {
  const [planTier, setPlanTier] = useState(PlanTiers.PRO);
  const [activeTab, setActiveTab] = useState(0); // 0=Library, 1=Import

  // ── Library ──
  const [songs, setSongs] = useState([]);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [attachSong, setAttachSong] = useState(null);
  const [modalStems, setModalStems] = useState({});
  const [savingStems, setSavingStems] = useState(false);

  // ── Import ──
  // apiBase kept for display only; actual submit/poll goes through Cloudflare KV
  const [apiBase, setApiBase] = useState(getCachedCineStageUrl());
  const [serverStatus, setServerStatus] = useState("railway"); // always show railway
  const [analyzing, setAnalyzing] = useState(false);
  const [userId, setUserId] = useState("demo-user");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);

  // ── Multitrack / ZIP import ──
  const [importMode, setImportMode] = useState("url"); // 'url' | 'multitrack'
  const [mtTitle, setMtTitle] = useState("");
  const [mtArtist, setMtArtist] = useState("");
  const [detectedStems, setDetectedStems] = useState({}); // slotName → { localUri, fileName }
  const [pickingMt, setPickingMt] = useState(false);
  const [savingMt, setSavingMt] = useState(false);
  const [fromZipHint, setFromZipHint] = useState(false); // show hint after zip picker
  const [mtBpm, setMtBpm] = useState("");
  const [mtKey, setMtKey] = useState("");
  const [mtTimeSig, setMtTimeSig] = useState("");
  const [scanningMt, setScanningMt] = useState(false);
  const [scanStep, setScanStep] = useState("");

  const entitlements = getEntitlements(planTier);

  const loadSongs = useCallback(async () => {
    setLoadingSongs(true);
    try {
      // Load local songs from AsyncStorage
      const localSongs = await getSongs();
      const localMap = {};
      for (const s of localSongs) if (s.id) localMap[s.id] = s;

      // Also pull songs from Cloudflare library (the source of truth for web/portal songs)
      try {
        const res = await fetch(`${SYNC_URL}/sync/library-pull`, { headers: syncHeaders() });
        if (res.ok) {
          const lib = await res.json();
          const cfSongs = Array.isArray(lib.songs)
            ? lib.songs
            : Object.values(lib.songs || {});
          for (const s of cfSongs) {
            if (!s.id) continue;
            if (localMap[s.id]) {
              // Merge: keep localStems/localUri from local, everything else from CF
              localMap[s.id] = { ...s, ...localMap[s.id] };
            } else {
              localMap[s.id] = s;
            }
          }
        }
      } catch { /* CF unavailable — fall back to local only */ }

      setSongs(Object.values(localMap));
    } catch {
      /* ignore */
    }
    setLoadingSongs(false);
  }, []);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      if (session?.planTier) setPlanTier(session.planTier);
      const settings = await getSettings();
      if (settings.defaultUserId) setUserId(settings.defaultUserId);
      // If user has manually set an apiBase in settings, use it directly
      if (settings.apiBase) {
        setApiBase(settings.apiBase);
        setServerStatus(
          settings.apiBase.includes("localhost") ? "local" : "railway",
        );
      } else {
        // Auto-detect best available CineStage server
        const resolved = await getActiveCineStageUrl();
        setApiBase(resolved);
        setServerStatus(resolved.includes("localhost") ? "local" : "railway");
      }
    })();
    loadSongs();
  }, []);

  // Accept pre-fill params from LibraryScreen "Run CineStage™"
  useEffect(() => {
    if (!route?.params) return;
    const { prefillTitle, prefillArtist, focusImport } = route.params;
    if (prefillTitle) setTitle(prefillTitle);
    if (prefillArtist) setArtist(prefillArtist);
    if (focusImport) setActiveTab(1);
  }, [route?.params]);

  // ── Attach modal ──
  function openAttachModal(song) {
    setAttachSong(song);
    setModalStems(song.localStems ? { ...song.localStems } : {});
  }

  function closeAttachModal() {
    setAttachSong(null);
    setModalStems({});
  }

  // ── Local file import with ID3 auto-fill ──
  async function handlePickLocalAudio() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setSourceUrl(asset.uri);
      // Auto-fill title from filename if empty
      if (!title) {
        const nameNoExt = (asset.name || "").replace(/\.[^.]+$/, "");
        if (nameNoExt) setTitle(nameNoExt);
      }
      // Read ID3 tags
      setAnalyzing(true);
      setCineStageStatus("Analyzing audio");
      try {
        const tags = await analyzeAudioFile(asset.uri);
        if (!title && tags.title) setTitle(tags.title);
        if (!artist && tags.artist) setArtist(tags.artist);
      } catch {
        /* ignore — fields stay as-is */
      }
      setAnalyzing(false);
      clearCineStageStatus();
    } catch (e) {
      setAnalyzing(false);
      Alert.alert("Error", String(e.message || e));
    }
  }

  async function pickStemFile(slotName) {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];

      // Ensure directory exists
      const dir = `${STEMS_DIR}${attachSong.id}/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

      const ext = (asset.name || "audio").split(".").pop() || "mp3";
      const destPath = `${dir}${stemKey(slotName)}.${ext}`;
      await FileSystem.copyAsync({ from: asset.uri, to: destPath });

      setModalStems((prev) => ({
        ...prev,
        [slotName]: { localUri: destPath, fileName: asset.name },
      }));
    } catch (e) {
      Alert.alert("Error", String(e.message || e));
    }
  }

  async function removeStemFile(slotName) {
    const info = modalStems[slotName];
    if (info?.localUri) {
      try {
        await FileSystem.deleteAsync(info.localUri, { idempotent: true });
      } catch {
        /* ignore */
      }
    }
    setModalStems((prev) => {
      const next = { ...prev };
      delete next[slotName];
      return next;
    });
  }

  async function saveLocalStems() {
    if (!attachSong) return;
    setSavingStems(true);
    try {
      const updated = await addOrUpdateSong({
        ...attachSong,
        localStems: modalStems,
      });
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      closeAttachModal();
    } catch (e) {
      Alert.alert("Error", String(e.message || e));
    }
    setSavingStems(false);
  }

  // ── Smart stem slot detection from filename ──
  // ── Metadata parsing ──────────────────────────────────────────────────────

  /** Parse title, artist, key, BPM, timeSig from folder/ZIP/filename.
   *  Handles patterns like:
   *  "Artist - Title - F# - Bpm124 - 4p4 (Pack)"
   *  "Artist - Title", "Title (Artist)" */
  function parseMetaFromName(str) {
    const s = (str || "").replace(/\.zip$/i, "").replace(/[_]+/g, " ").trim();
    const result = { title: "", artist: "", key: "", bpm: null, timeSig: "" };

    // Extract BPM: "Bpm124", "124bpm", "124 BPM"
    const bpmM = s.match(/\bBpm\s*(\d{2,3})\b|\b(\d{2,3})\s*[Bb][Pp][Mm]\b/i);
    if (bpmM) result.bpm = parseInt(bpmM[1] || bpmM[2], 10);

    // Extract key: "F#", "Bb", "C major", "Am" — isolated segment
    const keyM = s.match(/\b([A-G][#b]?(?:\s*(?:major|minor|maj|min|m))?)(?:\s*-|\s*\(|\s*$)/);
    if (keyM) result.key = keyM[1].trim();

    // Extract time sig: "4p4", "3p4", "6p8", or "4/4"
    const tsM = s.match(/\b(\d)p(\d)\b|\b(\d\/\d)\b/i);
    if (tsM) result.timeSig = tsM[3] || `${tsM[1]}/${tsM[2]}`;

    // Strip metadata tokens to get clean "Artist - Title" part
    let clean = s
      .replace(/\bBpm\s*\d{2,3}\b/gi, "")
      .replace(/\b\d{2,3}\s*[Bb][Pp][Mm]\b/g, "")
      .replace(/\b[A-G][#b]?\s*(?:major|minor|maj|min|m)?\b/g, "")
      .replace(/\b\d+p\d+\b/gi, "")
      .replace(/\([^)]*\)/g, "") // remove (Pack) / (Elite) etc.
      .replace(/\s*-\s*-\s*/g, " - ") // collapse double dashes
      .replace(/^\s*-\s*|\s*-\s*$/g, "") // trim leading/trailing dashes
      .replace(/\s{2,}/g, " ").trim();

    // Now parse "Artist - Title" from cleaned string
    const dash = clean.match(/^(.+?)\s+-\s+(.+)$/);
    if (dash) {
      result.artist = dash[1].trim();
      result.title = dash[2].trim();
    } else {
      const paren = clean.match(/^(.+?)\s*\((.+?)\)\s*$/);
      if (paren) { result.title = paren[1].trim(); result.artist = paren[2].trim(); }
      else { result.title = clean; }
    }
    return result;
  }

  /** Encode Uint8Array → base64 string for FileSystem.writeAsStringAsync */
  function uint8ToBase64(bytes) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i], b1 = bytes[i + 1] ?? 0, b2 = bytes[i + 2] ?? 0;
      result +=
        chars[b0 >> 2] +
        chars[((b0 & 3) << 4) | (b1 >> 4)] +
        (i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : "=") +
        (i + 2 < bytes.length ? chars[b2 & 63] : "=");
    }
    return result;
  }

  /** Decode base64 → Uint8Array (for reading ZIP file bytes) */
  function base64ToBytes(b64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lookup = new Uint8Array(256).fill(255);
    for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
    let len = Math.floor(b64.length * 0.75);
    if (b64.endsWith("==")) len -= 2;
    else if (b64.endsWith("=")) len -= 1;
    const out = new Uint8Array(len);
    let p = 0;
    for (let i = 0; i < b64.length; i += 4) {
      const e1 = lookup[b64.charCodeAt(i)], e2 = lookup[b64.charCodeAt(i + 1)];
      const e3 = lookup[b64.charCodeAt(i + 2)], e4 = lookup[b64.charCodeAt(i + 3)];
      out[p++] = (e1 << 2) | (e2 >> 4);
      if (b64[i + 2] !== "=") out[p++] = ((e2 & 15) << 4) | (e3 >> 2);
      if (b64[i + 3] !== "=") out[p++] = ((e3 & 3) << 6) | e4;
    }
    return out;
  }

  function autoDetectSlot(filename) {
    // Skip non-audio sidecar files (.asd = Ableton Set Data, etc.)
    if (/\.(asd|als|alp|logicx|ptx|rpp|cpr|ses)$/i.test(filename || "")) return "__SKIP__";
    const n = (filename || "").toLowerCase().replace(/[_\-\s\.]/g, " ");
    // Vocals — includes Portuguese vocal parts
    if (/\bvoc|vocal|vox|lead voc|bgv|harmony|backing|contralto|soprano|tenor|voice|voz/.test(n)) return "Vocals";
    // Drums — includes Portuguese percussion
    if (/\bdrum|kick|snare|hi.?hat|overhead|perc|beat|percuss/.test(n)) return "Drums";
    // Bass — careful not to match "synth bass" as Bass (also catch "synth bass")
    if (/\bsynth.?bass|s\.?bass/.test(n)) return "Keys";
    if (/\bbass\b/.test(n)) return "Bass";
    // Guitars — includes Portuguese "violão/violao" + all GTR variants
    if (/\bguitar|gtr|eg\d?|acg|acoustic|electric|viol[aã]o|viol[ao]/.test(n)) return "Guitars";
    // Keys / Pads — synth, pad, arpejador, pluck, organ, loop, strings section
    if (/\bkey|piano|organ|synth|pad\b|arpej|pluck|nord|loop\b|teclad/.test(n)) return "Keys";
    // Strings / Orchestral
    if (/\bstring|orch|brass|wind|cord[as]|violin|cello|viola\b/.test(n)) return "Strings";
    // Click / Guide
    if (/\bclick|metronome|guia|guide|bip\b|cue\b/.test(n)) return "Click";
    return null;
  }

  // ── Pick multiple stem files (multi-track import) ──
  async function handlePickMultipleStems() {
    setPickingMt(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;

      const detected = {};
      const unmatched = [];
      for (const asset of res.assets) {
        const slot = autoDetectSlot(asset.name);
        if (slot === "__SKIP__") continue; // skip .asd / sidecar files
        if (slot) {
          // Multiple files same slot → keep original filename as key suffix
          const key = detected[slot]
            ? (asset.name || "").replace(/\.[^.]+$/, "").trim() || `${slot} ${Object.keys(detected).filter(k => k.startsWith(slot)).length + 1}`
            : slot;
          detected[key] = { localUri: asset.uri, fileName: asset.name };
        } else {
          unmatched.push(asset);
        }
      }
      // Unmatched files → add with filename (no extension) as key
      for (const asset of unmatched) {
        const base = (asset.name || "").replace(/\.[^.]+$/, "").replace(/_bip_\d+$/, "").trim();
        detected[base || `Track ${Object.keys(detected).length + 1}`] = { localUri: asset.uri, fileName: asset.name };
      }

      setDetectedStems(detected);
      setFromZipHint(false);

      // Auto-fill metadata from filenames then ID3 tags (all files, parallel)
      {
        // 1. Try parsing from first filename (folder paths sometimes come through as name)
        const first = res.assets[0]?.name || "";
        const noExt = first.replace(/\.[^.]+$/, "").replace(/_bip_\d+$/, "").trim();
        const parsed = parseMetaFromName(noExt);
        // Expanded list — includes instrument abbreviations so filenames like "GTR SMALL" don't become song titles
        const stemWords = ["vocals","drums","bass","keys","guitars","other","click","strings",
          "gtr","guitar","vox","vocal","pad","synth","loop","arpej","pluck","soprano","tenor",
          "contralto","violao","violão","cordas","percuss","guia","nord","piano","organ","keys2","keys3"];
        const titleLooksLikeStem = stemWords.some(s => parsed.title.toLowerCase().includes(s));
        if (!mtTitle && !titleLooksLikeStem && parsed.title.length > 2) setMtTitle(parsed.title);
        if (!mtArtist && parsed.artist) setMtArtist(parsed.artist);
        if (!mtKey && parsed.key) setMtKey(parsed.key);
        if (!mtBpm && parsed.bpm) setMtBpm(String(parsed.bpm));
        if (!mtTimeSig && parsed.timeSig) setMtTimeSig(parsed.timeSig);

        // 2. Read ID3 tags from ALL files in parallel (non-blocking)
        Promise.allSettled(res.assets.map(a => analyzeAudioFile(a.uri))).then(results => {
          let bestTitle = "", bestArtist = "", bestBpm = "", bestKey = "", bestTimeSig = "";
          for (const r of results) {
            if (r.status !== "fulfilled") continue;
            const t = r.value;
            if (!bestTitle && t.title) bestTitle = t.title;
            if (!bestArtist && t.artist) bestArtist = t.artist;
            if (!bestBpm && t.bpm) bestBpm = String(t.bpm);
            if (!bestKey && t.key) bestKey = t.key;
            if (!bestTimeSig && t.timeSig) bestTimeSig = t.timeSig;
          }
          if (bestTitle) setMtTitle(prev => prev || bestTitle);
          if (bestArtist) setMtArtist(prev => prev || bestArtist);
          if (bestBpm) setMtBpm(prev => prev || bestBpm);
          if (bestKey) setMtKey(prev => prev || bestKey);
          if (bestTimeSig) setMtTimeSig(prev => prev || bestTimeSig);
        }).catch(() => {});
      }
    } catch (e) {
      Alert.alert("Error", String(e.message || e));
    }
    setPickingMt(false);
  }

  // ── Pick ZIP → extract with fflate ──
  async function handlePickZip() {
    setPickingMt(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/x-zip-compressed", "application/octet-stream", "public.zip-archive"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) { setPickingMt(false); return; }
      const asset = res.assets[0];
      const zipName = asset.name.replace(/\.zip$/i, "").trim();

      // Check file size — large ZIPs can't be held in JS memory
      const SIZE_LIMIT = 60 * 1024 * 1024; // 60 MB
      const info = await FileSystem.getInfoAsync(asset.uri, { size: true }).catch(() => ({}));
      if (info.size && info.size > SIZE_LIMIT) {
        const mb = Math.round(info.size / 1024 / 1024);
        const meta = parseMetaFromName(zipName);
        if (!mtTitle) setMtTitle(meta.title || zipName);
        if (!mtArtist && meta.artist) setMtArtist(meta.artist);
        if (!mtKey && meta.key) setMtKey(meta.key);
        if (!mtBpm && meta.bpm) setMtBpm(String(meta.bpm));
        if (!mtTimeSig && meta.timeSig) setMtTimeSig(meta.timeSig);
        setImportMode("multitrack");
        setFromZipHint(true);
        setPickingMt(false);
        Alert.alert(
          `📦 ZIP is ${mb} MB — too large to extract here`,
          `Extract it in the Files app first:\n\n1. Open the Files app\n2. Long-press the ZIP → Extract\n3. Tap "Pick Multiple Files" here to select the stems\n\nTap "Pick Files Now" to open the picker right away.`,
          [
            { text: "Pick Files Now", onPress: () => handlePickMultipleStems() },
            { text: "OK" },
          ],
        );
        return;
      }

      // Read ZIP as base64 and decode to bytes
      let zipBytes;
      try {
        const b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        zipBytes = base64ToBytes(b64);
      } catch (readErr) {
        // String-length error on unexpectedly large file → graceful fallback
        if (!mtTitle) setMtTitle(parseMetaFromName(zipName).title || zipName);
        setImportMode("multitrack");
        setFromZipHint(true);
        Alert.alert(
          "ZIP too large",
          `Could not read "${asset.name}" into memory.\n\nExtract it in the Files app first, then tap "Pick Multiple Files".`,
        );
        setPickingMt(false);
        return;
      }

      // Extract with fflate (async)
      await new Promise((resolve, reject) => {
        unzip(zipBytes, async (err, files) => {
          if (err) { reject(new Error(err.message || String(err))); return; }
          try {
            const audioExts = /\.(wav|mp3|aiff?|flac|m4a|ogg|opus|caf)$/i;
            const audioEntries = Object.entries(files).filter(([path]) => {
              const name = path.split("/").pop() || "";
              return audioExts.test(name) && !name.startsWith(".");
            });

            if (!audioEntries.length) {
              Alert.alert("No audio found", "No audio files found in this ZIP. Make sure it contains .wav, .mp3, .aiff, or similar stems.");
              resolve(); return;
            }

            // Detect ZIP's internal folder name for metadata
            const firstDir = Object.keys(files)
              .map((p) => p.split("/")[0])
              .find((p) => p && p !== "__MACOSX" && !audioExts.test(p));
            const meta = parseMetaFromName(firstDir || zipName);

            // Write extracted audio to permanent stems dir
            const tempDir = `${STEMS_DIR}zip_${Date.now()}/`;
            await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });

            const detected = {};
            for (const [path, data] of audioEntries) {
              const filename = path.split("/").pop();
              const slot = autoDetectSlot(filename);
              if (slot === "__SKIP__") continue; // skip .asd / sidecar files
              const rawKey = slot || filename.replace(/\.[^.]+$/, "").replace(/_bip_\d+$/, "").trim();
              const key = detected[rawKey]
                ? filename.replace(/\.[^.]+$/, "").trim()  // use original filename as key
                : rawKey;
              const ext = (filename.split(".").pop() || "wav").toLowerCase();
              const safeKey = key.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
              const destPath = `${tempDir}${safeKey}.${ext}`;
              await FileSystem.writeAsStringAsync(destPath, uint8ToBase64(data), {
                encoding: FileSystem.EncodingType.Base64,
              });
              detected[key] = { localUri: destPath, fileName: filename };
            }

            setDetectedStems(detected);
            setImportMode("multitrack");
            setFromZipHint(false);
            if (!mtTitle) setMtTitle(meta.title || zipName);
            if (!mtArtist && meta.artist) setMtArtist(meta.artist);
            if (!mtKey && meta.key) setMtKey(meta.key);
            if (!mtBpm && meta.bpm) setMtBpm(String(meta.bpm));
            if (!mtTimeSig && meta.timeSig) setMtTimeSig(meta.timeSig);

            // Try ID3 tags from ALL extracted files in parallel (non-blocking)
            const uris = Object.values(detected).map(d => d.localUri).filter(Boolean);
            if (uris.length) {
              Promise.allSettled(uris.map(u => analyzeAudioFile(u))).then(results => {
                let bestTitle = "", bestArtist = "", bestBpm = "", bestKey = "", bestTimeSig = "";
                for (const r of results) {
                  if (r.status !== "fulfilled") continue;
                  const t = r.value;
                  if (!bestTitle && t.title) bestTitle = t.title;
                  if (!bestArtist && t.artist) bestArtist = t.artist;
                  if (!bestBpm && t.bpm) bestBpm = String(t.bpm);
                  if (!bestKey && t.key) bestKey = t.key;
                  if (!bestTimeSig && t.timeSig) bestTimeSig = t.timeSig;
                }
                if (bestTitle) setMtTitle(prev => prev || bestTitle);
                if (bestArtist) setMtArtist(prev => prev || bestArtist);
                if (bestBpm) setMtBpm(prev => prev || bestBpm);
                if (bestKey) setMtKey(prev => prev || bestKey);
                if (bestTimeSig) setMtTimeSig(prev => prev || bestTimeSig);
              }).catch(() => {});
            }

            resolve();
          } catch (writeErr) {
            reject(writeErr);
          }
        });
      });
    } catch (e) {
      Alert.alert("ZIP Error", `${e.message || e}\n\nTip: if the ZIP is very large, extract it in the Files app first then use "Pick Multiple Files".`);
    }
    setPickingMt(false);
  }

  // ── Save multitrack import to song library ──
  async function saveMultitrackImport() {
    if (!Object.keys(detectedStems).length) {
      Alert.alert("No stems", "Pick some audio files first.");
      return;
    }
    setSavingMt(true);
    try {
      const allSongs = await getSongs();
      const existing = mtTitle
        ? findSongDuplicate(allSongs, mtTitle, mtArtist)
        : null;

      // Copy files to permanent stems directory
      const songId = existing?.id || makeId("song");
      const dir = `${STEMS_DIR}${songId}/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

      const permanentStems = {};
      for (const [slotName, info] of Object.entries(detectedStems)) {
        const ext = (info.fileName || "audio").split(".").pop() || "wav";
        const safeKey = slotName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const destPath = `${dir}${safeKey}.${ext}`;
        await FileSystem.copyAsync({ from: info.localUri, to: destPath });
        permanentStems[slotName] = { localUri: destPath, fileName: info.fileName };
      }

      const saved = await addOrUpdateSong({
        id: songId,
        ...(existing || {}),
        title: mtTitle || existing?.title || "Imported Multitracks",
        artist: mtArtist || existing?.artist || "",
        ...(mtBpm ? { bpm: Number(mtBpm) || mtBpm } : {}),
        ...(mtKey ? { originalKey: mtKey } : {}),
        ...(mtTimeSig ? { timeSig: mtTimeSig } : {}),
        localStems: permanentStems,
      });

      setSongs((prev) => {
        const idx = prev.findIndex((s) => s.id === saved.id);
        return idx >= 0 ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved];
      });

      setDetectedStems({});
      setMtTitle(""); setMtArtist(""); setMtBpm(""); setMtKey(""); setMtTimeSig("");
      Alert.alert(
        "✓ Imported",
        `${Object.keys(permanentStems).length} stem tracks saved for "${saved.title}".`,
        [
          {
            text: "Open Mixer",
            onPress: () => navigation.navigate("Rehearsal", { song: saved, apiBase, isAdmin: true, hideVocalSection: true }),
          },
          {
            text: "Edit Song",
            onPress: () =>
              navigation.navigate("SongDetail", { song: saved, editMode: true }),
          },
          { text: "Done", onPress: () => setActiveTab(0) },
        ]
      );
    } catch (e) {
      Alert.alert("Error", String(e.message || e));
    }
    setSavingMt(false);
  }

  // ── Scan all stems, collect metadata, then open Rehearsal ──
  async function handleScanAndOpenRehearsal() {
    if (!Object.keys(detectedStems).length) {
      Alert.alert("No stems", "Pick some audio files first.");
      return;
    }
    setScanningMt(true);
    try {
      // Step 1: Scan all files for ID3 tags
      setScanStep("Scanning stems for metadata…");
      const uris = Object.values(detectedStems).map(d => d.localUri).filter(Boolean);
      const tagResults = await Promise.allSettled(uris.map(u => analyzeAudioFile(u)));

      let bestTitle = mtTitle, bestArtist = mtArtist;
      let bestBpm = mtBpm, bestKey = mtKey, bestTimeSig = mtTimeSig;
      for (const r of tagResults) {
        if (r.status !== "fulfilled") continue;
        const t = r.value;
        if (!bestTitle && t.title) bestTitle = t.title;
        if (!bestArtist && t.artist) bestArtist = t.artist;
        if (!bestBpm && t.bpm) bestBpm = String(t.bpm);
        if (!bestKey && t.key) bestKey = t.key;
        if (!bestTimeSig && t.timeSig) bestTimeSig = t.timeSig;
      }

      // Step 2: Copy stems to permanent storage
      setScanStep("Saving stems to library…");
      const allSongs = await getSongs();
      const existing = bestTitle ? findSongDuplicate(allSongs, bestTitle, bestArtist) : null;
      const songId = existing?.id || makeId("song");
      const dir = `${STEMS_DIR}${songId}/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

      const permanentStems = {};
      for (const [slotName, info] of Object.entries(detectedStems)) {
        const ext = (info.fileName || "audio").split(".").pop() || "wav";
        const safeKey = slotName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const destPath = `${dir}${safeKey}.${ext}`;
        await FileSystem.copyAsync({ from: info.localUri, to: destPath });
        permanentStems[slotName] = { localUri: destPath, fileName: info.fileName };
      }

      const saved = await addOrUpdateSong({
        id: songId,
        ...(existing || {}),
        title: bestTitle || existing?.title || "Imported Multitracks",
        artist: bestArtist || existing?.artist || "",
        ...(bestBpm ? { bpm: Number(bestBpm) || bestBpm } : {}),
        ...(bestKey ? { originalKey: bestKey } : {}),
        ...(bestTimeSig ? { timeSig: bestTimeSig } : {}),
        localStems: permanentStems,
      });

      setSongs(prev => {
        const idx = prev.findIndex(s => s.id === saved.id);
        return idx >= 0 ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved];
      });

      // Reset form
      setDetectedStems({});
      setMtTitle(""); setMtArtist(""); setMtBpm(""); setMtKey(""); setMtTimeSig("");

      setScanStep("Opening Live Performance…");
      await new Promise(r => setTimeout(r, 350));
      setScanningMt(false);

      navigation.navigate("Live", { song: saved });
    } catch (e) {
      setScanningMt(false);
      Alert.alert("Error", String(e.message || e));
    }
  }

  // ── Import from URL ──
  function importHeaders() {
    const h = { "Content-Type": "application/json" };
    if (userId.trim()) h["X-User-Id"] = userId.trim();
    return h;
  }

  async function handleImport() {
    if (!entitlements.stemSeparation && !entitlements.vocalHarmony) {
      Alert.alert(
        "Upgrade Required",
        "Stem separation requires a Pro plan. Vocal harmony requires Premium or above.",
        [{ text: "OK" }],
      );
      return;
    }
    if (!sourceUrl.trim()) {
      Alert.alert("Missing info", "A YouTube/audio URL or local file is required.");
      return;
    }
    // Generate a song ID for KV storage
    const songId = makeId("song");

    // ── Step 0: Collecting song info ──
    setProcessingStep(0);
    setProcessingProgress(5);
    setImporting(true);
    setCineStageStatus("Separating stems");

    try {
      const { job, fileUrl: resolvedSourceUrl } = await submitStemJob({
        sourceUrl: sourceUrl.trim(),
        title: title || "Imported Stems",
        songId,
        separateHarmonies: entitlements.vocalHarmony,
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
              setProcessingProgress((prev) => Math.min(88, prev + 0.2));
            }
          }
        },
      });

      if (!hasStemJobResult(current)) {
        clearCineStageStatus();
        setImporting(false);
        Alert.alert("Processing error", formatStemJobFailure(current));
        return;
      }

      const result = current.result || {};

      // ── Step 2: Vocal harmony step (if plan allows) ──
      if (entitlements.vocalHarmony && result.stems?.vocals) {
        setProcessingStep(2);
        setProcessingProgress(86);
        // Harmony was triggered inside the job pipeline automatically —
        // results are already in result.harmonies from the CineStage server.
        await new Promise((r) => setTimeout(r, 600));
      }

      // ── Step 3: Preparing tracks ──
      setProcessingStep(3);
      setProcessingProgress(92);

      const allSongs = await getSongs();
      const existing = findSongDuplicate(
        allSongs,
        result.title || title,
        result.artist || artist,
      );

      const saved = await addOrUpdateSong({
        id: songId,
        ...(existing || {}),
        title: result.title || title || "Imported Stems",
        artist: result.artist || artist || "",
        sourceUrl: resolvedSourceUrl,
        originalKey: current.key || result.key || existing?.originalKey || "",
        bpm: current.bpm || result.bpm || existing?.bpm || null,
        latestStemsJob: current,
        // Store harmony voice URLs for Playback to read
        vocalHarmonies: result.harmonies || {},
        cinestageJobId: current.id,
      });

      // ── Step 4: CineStage Analysis (BPM, key, sections, cues, graph) ──
      setProcessingStep(4);
      setProcessingProgress(94);
      try {
        const analysis = await analyzeAudio({
          file_url:   resolvedSourceUrl,
          title:      saved.title,
          song_id:    saved.id,
          n_sections: 6,
        });
        // Persist analysis fields back to the song
        await addOrUpdateSong({
          ...saved,
          bpm: analysis.bpm || saved.bpm,
          originalKey: analysis.key || saved.originalKey,
          analysis: {
            sections:          analysis.sections,
            chords:            analysis.chords,
            cues:              analysis.cues,
            beats_ms:          analysis.beats_ms,
            performance_graph: analysis.performance_graph,
            duration_ms:       analysis.duration_ms,
            analyzedAt:        new Date().toISOString(),
          },
        });
      } catch {
        // Analysis is best-effort — don't fail the whole import
      }

      setProcessingProgress(100);
      await loadSongs();

      // ── Background: generate team partsheets from stems (fire-and-forget) ──
      if (result.stems && typeof result.stems === 'object') {
        const stemToInstrument = {
          vocals: 'lead_vocals', drums: 'drums', bass: 'bass',
          guitar: 'guitar_rhythm', guitars: 'guitar_rhythm',
          keys: 'keys_lead', other: null,
        };
        const stemFiles = {};
        Object.entries(result.stems).forEach(([name, url]) => {
          const inst = stemToInstrument[name.toLowerCase()];
          if (inst && url) stemFiles[inst] = url;
        });
        if (apiBase.trim() && Object.keys(stemFiles).length > 0) {
          fetch(`${apiBase}/ai/partsheets/team/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              song_id: saved.id,
              song_title: saved.title,
              artist: saved.artist || '',
              stem_files: stemFiles,
              metadata: {
                title: saved.title,
                artist: saved.artist || '',
                key: saved.originalKey || '',
                bpm: saved.bpm || 0,
                time_signature: saved.timeSig || '4/4',
              },
            }),
          }).catch(() => {/* best-effort — ignore errors */});
        }
      }

      // Brief pause so user sees "Job done!" before navigating
      await new Promise((r) => setTimeout(r, 900));

      clearCineStageStatus();
      setImporting(false);
      setActiveTab(0);
      navigation.navigate("Live", { song: saved, apiBase, autoPlay: true });
    } catch (e) {
      console.error(e);
      clearCineStageStatus();
      setImporting(false);
      Alert.alert("Error", String(e.message || e));
    }
  }

  // ── Render ──
  return (
    <View style={styles.root}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {["Library", "Import"].map((label, i) => (
          <TouchableOpacity
            key={label}
            style={[styles.tabBtn, activeTab === i && styles.tabBtnActive]}
            onPress={() => setActiveTab(i)}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.tabText, activeTab === i && styles.tabTextActive]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Library tab ── */}
      {activeTab === 0 && (
        <FlatList
          data={songs}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContainer}
          refreshing={loadingSongs}
          onRefresh={loadSongs}
          ListHeaderComponent={
            <Text style={styles.listHint}>
              Tap ▶ Rehearsal to open with stems loaded, or ＋ Stems to attach local audio files.
            </Text>
          }
          ListEmptyComponent={
            loadingSongs ? (
              <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No songs in library</Text>
                <Text style={styles.emptyCaption}>
                  Add songs via the Library tab, then come back here to attach
                  stems.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.songCard}
              activeOpacity={0.75}
              onPress={() => {
                if (hasMixableStems(item)) {
                  navigation.navigate("Rehearsal", { song: item, apiBase, isAdmin: true, hideVocalSection: true });
                } else {
                  setTitle(item.title || "");
                  setArtist(item.artist || "");
                  setActiveTab(1);
                }
              }}
            >
              <View style={styles.songInfo}>
                <Text style={styles.songName} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.artist ? (
                  <Text style={styles.songArtist} numberOfLines={1}>
                    {item.artist}
                  </Text>
                ) : null}
                <StemDots song={item} />
                {/* CineStage analysis badges */}
                {(item.originalKey || item.bpm || item.analysis?.sections?.length) ? (
                  <View style={styles.analysisBadgeRow}>
                    {!!item.originalKey && (
                      <View style={styles.analysisBadge}>
                        <Text style={styles.analysisBadgeText}>🎵 {item.originalKey}</Text>
                      </View>
                    )}
                    {!!item.bpm && (
                      <View style={styles.analysisBadge}>
                        <Text style={styles.analysisBadgeText}>⚡ {item.bpm} BPM</Text>
                      </View>
                    )}
                    {item.analysis?.sections?.length > 0 && (
                      <View style={[styles.analysisBadge, { borderColor: '#6366F1' }]}>
                        <Text style={[styles.analysisBadgeText, { color: '#818CF8' }]}>
                          {item.analysis.sections.length} sections
                        </Text>
                      </View>
                    )}
                  </View>
                ) : null}
                {!hasMixableStems(item) && (
                  <Text style={styles.noStemsHint}>Tap to import stems</Text>
                )}
              </View>
              <View style={styles.songActions}>
                {hasMixableStems(item) && (
                  <TouchableOpacity
                    style={styles.mixBtn}
                    onPress={() =>
                      navigation.navigate("Rehearsal", { song: item, apiBase, isAdmin: true, hideVocalSection: true })
                    }
                    activeOpacity={0.7}
                  >
                    <Text style={styles.mixBtnText}>▶ Rehearsal</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => openAttachModal(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addBtnText}>＋ Stems</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── Import tab ── */}
      {activeTab === 1 && (
        <ScrollView
          contentContainerStyle={styles.importContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Import mode selector */}
          <View style={styles.importModeRow}>
            <TouchableOpacity
              style={[styles.importModeBtn, importMode === "url" && styles.importModeBtnActive]}
              onPress={() => setImportMode("url")}
            >
              <Text style={[styles.importModeBtnText, importMode === "url" && styles.importModeBtnTextActive]}>
                🔗 URL / CineStage
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.importModeBtn, importMode === "multitrack" && styles.importModeBtnActive]}
              onPress={() => setImportMode("multitrack")}
            >
              <Text style={[styles.importModeBtnText, importMode === "multitrack" && styles.importModeBtnTextActive]}>
                📦 Multitrack / ZIP
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── URL / CineStage mode ── */}
          {importMode === "url" && (
            <>
              <View style={styles.importHeadingRow}>
                <Text style={styles.importHeading}>CineStage™ Import</Text>
                <View style={styles.serverPill}>
                  <View
                    style={[
                      styles.serverDot,
                      serverStatus === "railway"
                        ? { backgroundColor: "#34D399" }
                        : serverStatus === "local"
                          ? { backgroundColor: "#FBBF24" }
                          : { backgroundColor: "#4B5563" },
                    ]}
                  />
                  <Text style={styles.serverLabel}>
                    {serverStatus === "railway" ? "Railway" : serverStatus === "local" ? "Local" : "…"}
                  </Text>
                </View>
              </View>
              <Text style={styles.importCaption}>
                CineStage™ will analyze the track and extract all song info automatically.
              </Text>

              <Text style={styles.fieldLabel}>Song Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Gratitude"
                placeholderTextColor="#4B5563"
              />

              {/* YouTube / URL field — prominent */}
              <Text style={styles.fieldLabel}>🔗 YouTube / Streaming URL</Text>
              <View style={styles.urlInputRow}>
                <TextInput
                  style={[styles.input, styles.urlInput]}
                  value={isLocalSourceUrl(sourceUrl) ? "" : sourceUrl}
                  onChangeText={setSourceUrl}
                  placeholder="https://youtube.com/watch?v=... or any audio URL"
                  placeholderTextColor="#4B5563"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {(sourceUrl && !isLocalSourceUrl(sourceUrl)) && (
                  <TouchableOpacity style={styles.urlClearBtn} onPress={() => setSourceUrl("")}>
                    <Text style={styles.urlClearBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
              {isYouTubeUrl(sourceUrl) && (
                <View style={styles.ytDetectedBadge}>
                  <Text style={styles.ytDetectedText}>▶ YouTube detected — CineStage will download automatically</Text>
                </View>
              )}

              {/* OR divider */}
              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or pick from device</Text>
                <View style={styles.orLine} />
              </View>

              <TouchableOpacity
                style={styles.pickFileBtn}
                onPress={handlePickLocalAudio}
                disabled={analyzing}
              >
                {analyzing ? (
                  <ActivityIndicator size="small" color="#A5B4FC" />
                ) : (
                  <Text style={styles.pickFileBtnText}>
                    {isLocalSourceUrl(sourceUrl) ? "📂 Change Local File" : "📂 Pick Local Audio File"}
                  </Text>
                )}
              </TouchableOpacity>
              {isLocalSourceUrl(sourceUrl) && (
                <Text style={styles.fileHint} numberOfLines={1}>
                  📁 {sourceUrl.split("/").pop()}
                </Text>
              )}

              {!entitlements.cineStage && (
                <View style={styles.upgradeNotice}>
                  <Text style={styles.upgradeNoticeText}>
                    🔒 CineStage™ stem separation is available on Pro and Enterprise plans.
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.importBtn, (importing || !entitlements.cineStage) && styles.importBtnDisabled]}
                onPress={handleImport}
                disabled={importing}
                activeOpacity={0.8}
              >
                <Text style={styles.importBtnText}>
                  {entitlements.cineStage ? "🎛 Run CineStage™" : "🔒 Run CineStage™ (Pro)"}
                </Text>
              </TouchableOpacity>

              {!importing && (
                <Text style={styles.importingNote}>
                  CineStage™ will separate stems and detect key, BPM, and structure automatically.
                </Text>
              )}
            </>
          )}

          {/* ── Multitrack / ZIP mode ── */}
          {importMode === "multitrack" && (
            <>
              <Text style={styles.importHeading}>Multitrack Import</Text>
              <Text style={styles.importCaption}>
                Import pre-separated stem tracks from your device. Stems are auto-detected from filenames.
              </Text>

              {/* Hint: large ZIP fallback */}
              {fromZipHint && (
                <View style={styles.zipHintBanner}>
                  <Text style={styles.zipHintText}>
                    📂 ZIP too large to extract here — extract it in the Files app, then tap{" "}
                    <Text style={{ fontWeight: "700" }}>Pick Multiple Files</Text>.
                  </Text>
                  <TouchableOpacity onPress={() => setFromZipHint(false)}>
                    <Text style={styles.zipHintDismiss}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ZIP + Multi-file buttons */}
              <View style={styles.mtPickRow}>
                <TouchableOpacity
                  style={[styles.mtPickBtn, { borderColor: "#6366F1" }]}
                  onPress={handlePickZip}
                  disabled={pickingMt}
                >
                  {pickingMt ? <ActivityIndicator size="small" color="#6366F1" /> : (
                    <>
                      <Text style={styles.mtPickIcon}>📦</Text>
                      <Text style={styles.mtPickLabel}>Pick ZIP File</Text>
                      <Text style={styles.mtPickSub}>ZIP with multitracks</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mtPickBtn, { borderColor: "#34D399" }]}
                  onPress={handlePickMultipleStems}
                  disabled={pickingMt}
                >
                  {pickingMt ? <ActivityIndicator size="small" color="#34D399" /> : (
                    <>
                      <Text style={styles.mtPickIcon}>🗂</Text>
                      <Text style={styles.mtPickLabel}>Pick Multiple Files</Text>
                      <Text style={styles.mtPickSub}>Select all stem files</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Detected stems list */}
              {Object.keys(detectedStems).length > 0 && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
                    Detected Stems ({Object.keys(detectedStems).length} tracks)
                  </Text>
                  {Object.entries(detectedStems).map(([slotName, info]) => (
                    <View key={slotName} style={styles.detectedStemRow}>
                      <View style={[styles.slotDot, { backgroundColor: dotColorFor(slotName) }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detectedSlotName}>{slotName}</Text>
                        <Text style={styles.detectedFileName} numberOfLines={1}>{info.fileName}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setDetectedStems(prev => {
                          const next = { ...prev };
                          delete next[slotName];
                          return next;
                        })}
                      >
                        <Text style={{ color: "#EF4444", fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <Text style={styles.fieldLabel}>Song Title *</Text>
                  <TextInput
                    style={styles.input}
                    value={mtTitle}
                    onChangeText={setMtTitle}
                    placeholder="e.g. Eu Me Rendo"
                    placeholderTextColor="#4B5563"
                  />

                  <Text style={styles.fieldLabel}>Artist</Text>
                  <TextInput
                    style={styles.input}
                    value={mtArtist}
                    onChangeText={setMtArtist}
                    placeholder="e.g. Renascer Praise"
                    placeholderTextColor="#4B5563"
                  />

                  {/* Detected BPM / Key / TimeSig pills */}
                  {(mtBpm || mtKey || mtTimeSig) && (
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      {!!mtKey && (
                        <View style={styles.detectedPill}>
                          <Text style={styles.detectedPillText}>🎵 {mtKey}</Text>
                        </View>
                      )}
                      {!!mtBpm && (
                        <View style={styles.detectedPill}>
                          <Text style={styles.detectedPillText}>⚡ {mtBpm} BPM</Text>
                        </View>
                      )}
                      {!!mtTimeSig && (
                        <View style={styles.detectedPill}>
                          <Text style={styles.detectedPillText}>♩ {mtTimeSig}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Two-button row: Save to Library + Load in Rehearsal */}
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      style={[styles.importBtn, { flex: 1, backgroundColor: "#1E2740" }, savingMt && styles.importBtnDisabled]}
                      onPress={saveMultitrackImport}
                      disabled={savingMt || scanningMt}
                      activeOpacity={0.8}
                    >
                      {savingMt ? <ActivityIndicator size="small" color="#FFF" /> : (
                        <Text style={[styles.importBtnText, { fontSize: 13 }]}>💾 Save to Library</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.importBtn, { flex: 1.3 }, (savingMt || scanningMt) && styles.importBtnDisabled]}
                      onPress={handleScanAndOpenRehearsal}
                      disabled={savingMt || scanningMt}
                      activeOpacity={0.8}
                    >
                      {scanningMt ? <ActivityIndicator size="small" color="#FFF" /> : (
                        <Text style={[styles.importBtnText, { fontSize: 13 }]}>🎛 Load in Rehearsal →</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {scanningMt && scanStep ? (
                    <Text style={{ fontSize: 12, color: "#6366F1", textAlign: "center", marginTop: 8 }}>
                      {scanStep}
                    </Text>
                  ) : null}
                </>
              )}

              {Object.keys(detectedStems).length === 0 && (
                <View style={styles.mtEmptyHint}>
                  <Text style={styles.mtEmptyIcon}>🎛</Text>
                  <Text style={styles.mtEmptyTitle}>Ready to import</Text>
                  <Text style={styles.mtEmptyText}>
                    Pick a ZIP file to auto-extract all stems, or tap "Pick Multiple Files" to select audio files from a folder. Song name and artist are auto-detected from filenames and ID3 tags.
                  </Text>
                  <Text style={styles.mtEmptyTip}>
                    Stem keywords: vocals/vox, drums/beat, bass, keys/piano, guitar/EG/ACG, strings, click/guia/bip{"\n"}Name patterns: "Artist - Song Title.zip" or "Song Title (Artist)"
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Attach stems modal ── */}
      <Modal
        visible={!!attachSong}
        animationType="slide"
        transparent
        onRequestClose={closeAttachModal}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Attach Local Stems</Text>
            {attachSong && (
              <Text style={styles.modalSong}>{attachSong.title}</Text>
            )}

            <ScrollView
              style={styles.slotList}
              showsVerticalScrollIndicator={false}
            >
              {STEM_SLOTS.map((slot) => {
                const info = modalStems[slot];
                return (
                  <View key={slot} style={styles.slotRow}>
                    <View
                      style={[
                        styles.slotDot,
                        { backgroundColor: dotColorFor(slot) },
                      ]}
                    />
                    <View style={styles.slotMeta}>
                      <Text style={styles.slotName}>{slot}</Text>
                      {info ? (
                        <Text style={styles.slotFile} numberOfLines={1}>
                          {info.fileName}
                        </Text>
                      ) : (
                        <Text style={styles.slotNone}>No file attached</Text>
                      )}
                    </View>
                    {info ? (
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => removeStemFile(slot)}
                      >
                        <Text style={styles.removeBtnText}>✕</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.pickBtn}
                      onPress={() => pickStemFile(slot)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.pickBtnText}>
                        {info ? "Replace" : "Pick"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={closeAttachModal}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, savingStems && styles.saveBtnDisabled]}
                onPress={saveLocalStems}
                disabled={savingStems}
                activeOpacity={0.8}
              >
                {savingStems ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveText}>Save Stems</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* ── CineStage processing overlay ── */}
      <CineStageProcessingOverlay
        visible={importing}
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
  root: { flex: 1, backgroundColor: "#020617" },

  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  tabBtnActive: { backgroundColor: "#6366F1", borderColor: "#6366F1" },
  tabText: { color: "#6B7280", fontWeight: "600", fontSize: 14 },
  tabTextActive: { color: "#FFFFFF" },

  // Library
  listContainer: { padding: 16, paddingBottom: 40 },
  listHint: { color: "#4B5563", fontSize: 11, marginBottom: 12 },

  songCard: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
  },
  songInfo: { flex: 1, marginRight: 10 },
  songName: { color: "#F9FAFB", fontSize: 15, fontWeight: "600" },
  songArtist: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  dotsRow: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 4 },
  stemDot: { width: 8, height: 8, borderRadius: 4 },
  dotLabel: { color: "#4B5563", fontSize: 10, marginLeft: 4 },
  noStemsHint: { color: "#4F46E5", fontSize: 11, marginTop: 4 },
  ytBadge: { color: "#EF4444", fontSize: 10, fontWeight: "800", marginLeft: 4 },
  analysisBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  analysisBadge: {
    borderWidth: 1, borderColor: '#10B981', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  analysisBadgeText: { color: '#6EE7B7', fontSize: 10, fontWeight: '700' },

  songActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  mixBtn: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  mixBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  addBtn: {
    backgroundColor: "#1F2937",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: { color: "#9CA3AF", fontSize: 13, fontWeight: "600" },

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

  // Import
  importContainer: { padding: 16, paddingBottom: 60 },

  // Import mode selector
  importModeRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  importModeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
    backgroundColor: "#0F172A", borderWidth: 1, borderColor: "#1E293B",
  },
  importModeBtnActive: { backgroundColor: "#1E1B4B", borderColor: "#6366F1" },
  importModeBtnText: { color: "#6B7280", fontSize: 13, fontWeight: "600" },
  importModeBtnTextActive: { color: "#A5B4FC" },

  // URL field
  urlInputRow: { position: "relative" },
  urlInput: { paddingRight: 36 },
  urlClearBtn: {
    position: "absolute", right: 10, top: 10,
    padding: 2,
  },
  urlClearBtnText: { color: "#6B7280", fontSize: 14 },
  ytDetectedBadge: {
    backgroundColor: "#1A0A0A", borderRadius: 6, padding: 8,
    borderWidth: 1, borderColor: "#EF4444", marginTop: 4, marginBottom: 4,
  },
  ytDetectedText: { color: "#F87171", fontSize: 11, fontWeight: "600" },

  // OR divider
  orDivider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16 },
  orLine: { flex: 1, height: 1, backgroundColor: "#1E293B" },
  orText: { color: "#4B5563", fontSize: 11, fontWeight: "600" },

  // ZIP hint banner
  zipHintBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#1E3A5F", borderRadius: 10, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: "#3B82F6",
  },
  zipHintText: { flex: 1, color: "#93C5FD", fontSize: 13, lineHeight: 18 },
  zipHintDismiss: { color: "#60A5FA", fontSize: 15, paddingLeft: 4 },

  // Multitrack mode
  mtPickRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  mtPickBtn: {
    flex: 1, paddingVertical: 18, borderRadius: 12, alignItems: "center",
    backgroundColor: "#0F172A", borderWidth: 1.5,
    minHeight: 90,
  },
  mtPickIcon: { fontSize: 28, marginBottom: 4 },
  mtPickLabel: { color: "#E5E7EB", fontSize: 13, fontWeight: "700" },
  mtPickSub: { color: "#6B7280", fontSize: 11, marginTop: 2 },

  detectedStemRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1E293B",
  },
  detectedSlotName: { color: "#F9FAFB", fontSize: 14, fontWeight: "600" },
  detectedFileName: { color: "#6B7280", fontSize: 11, marginTop: 2 },

  mtEmptyHint: { alignItems: "center", paddingTop: 32, paddingHorizontal: 8 },
  mtEmptyIcon: { fontSize: 48, marginBottom: 12 },
  mtEmptyTitle: { color: "#F9FAFB", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  mtEmptyText: { color: "#6B7280", fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 12 },
  mtEmptyTip: { color: "#4B5563", fontSize: 11, textAlign: "center", lineHeight: 17 },
  detectedPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#10B981",
    backgroundColor: "#0B1120",
  },
  detectedPillText: { color: "#6EE7B7", fontSize: 11, fontWeight: "700" },
  importHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  importHeading: { color: "#F9FAFB", fontSize: 20, fontWeight: "700" },
  importCaption: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  serverPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  serverDot: { width: 7, height: 7, borderRadius: 4 },
  serverLabel: { color: "#94A3B8", fontSize: 11, fontWeight: "600" },
  pickFileBtn: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#334155",
  },
  pickFileBtnText: { color: "#A5B4FC", fontSize: 13, fontWeight: "600" },
  fileHint: { color: "#4B5563", fontSize: 11, marginBottom: 12 },
  fieldLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    marginBottom: 5,
    marginTop: 14,
  },
  input: {
    backgroundColor: "#0B1120",
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#E5E7EB",
    fontSize: 13,
  },
  upgradeNotice: {
    marginTop: 20,
    backgroundColor: "#1C1917",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#78350F",
    padding: 12,
  },
  upgradeNoticeText: {
    color: "#D97706",
    fontSize: 13,
    lineHeight: 19,
  },
  importBtn: {
    marginTop: 24,
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  importBtnDisabled: { opacity: 0.55 },
  importBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
    marginLeft: 8,
  },
  importingRow: { flexDirection: "row", alignItems: "center" },
  importingNote: {
    color: "#6B7280",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
  },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: "#00000099",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#0B1120",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: "#1F2937",
  },
  modalTitle: {
    color: "#F9FAFB",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalSong: { color: "#6B7280", fontSize: 13, marginBottom: 14 },
  slotList: { maxHeight: 360 },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
    gap: 10,
  },
  slotDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  slotMeta: { flex: 1 },
  slotName: { color: "#F9FAFB", fontSize: 14, fontWeight: "600" },
  slotFile: { color: "#6366F1", fontSize: 11, marginTop: 2 },
  slotNone: { color: "#4B5563", fontSize: 11, marginTop: 2 },
  removeBtn: { padding: 6 },
  removeBtnText: { color: "#EF4444", fontSize: 14 },
  pickBtn: {
    backgroundColor: "#1F2937",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  pickBtnText: { color: "#E5E7EB", fontSize: 12, fontWeight: "600" },

  modalFooter: { flexDirection: "row", gap: 12, marginTop: 18 },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#1F2937",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  cancelText: { color: "#E5E7EB", fontWeight: "600" },
  saveBtn: {
    flex: 2,
    backgroundColor: "#6366F1",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});
