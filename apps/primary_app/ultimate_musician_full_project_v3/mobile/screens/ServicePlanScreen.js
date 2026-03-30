import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
} from "react-native";

import { SYNC_URL, CINESTAGE_URL, syncHeaders } from "./config";
import { getBlockoutsForDate } from "../data/blockoutsStore";
import { ROLE_OPTIONS, formatRoleLabel } from "../data/models";
import {
  getPlanForService,
  addSongToService,
  removeSongFromService,
  assignTeamMember,
  removeTeamAssignment,
  updateServiceNotes,
  updateSongItem,
  distributeChordChart,
} from "../data/servicePlanStore";
import { SERVICE_TYPES } from "../data/serviceTemplates";
import {
  getServices,
  updateService,
  deleteService,
  humanStatus,
  getActiveServiceId,
} from "../data/servicesStore";
import { getSongs, getPeople, addOrUpdateSong } from "../data/storage";
import { generateVocalParts as cinestageGenerateParts } from "../services/cinestage/client";
import {
  recordAssignments as brainRecordAssignments,
  getBrainStats,
  suggestAssignments as brainSuggest,
} from "../services/cinestageDataAPI";
import {
  setCineStageStatus,
  clearCineStageStatus,
} from "../services/cinestageStatus";
import { calculateSemitoneShift } from "../src/utils/transpose";

// ─── Readiness helpers ────────────────────────────────────────────────────────
const THEME_MAP = {
  communion: {
    id: "th_communion",
    label: "Communion elements ready (bread & cup set up)",
  },
  eucharist: {
    id: "th_communion",
    label: "Communion elements ready (bread & cup set up)",
  },
  easter: {
    id: "th_easter",
    label: "Easter staging / visual elements confirmed",
  },
  christmas: {
    id: "th_christmas",
    label: "Christmas staging / visual elements confirmed",
  },
  baptism: { id: "th_baptism", label: "Baptism area / pool prepared" },
  healing: { id: "th_healing", label: "Prayer team briefed and in position" },
  prayer: { id: "th_prayer", label: "Prayer team briefed and in position" },
  memorial: {
    id: "th_memorial",
    label: "Memorial service materials confirmed",
  },
  conference: {
    id: "th_conference",
    label: "Conference schedule / speaker slots confirmed",
  },
  youth: {
    id: "th_youth",
    label: "Youth setup confirmed (stage, seating, AV)",
  },
  gospel: {
    id: "th_gospel",
    label: "Salvation / gospel presentation prepared",
  },
  worship: {
    id: "th_worship",
    label: "Worship flow order confirmed with the band",
  },
  dedication: {
    id: "th_dedication",
    label: "Baby / building dedication elements prepared",
  },
  outreach: {
    id: "th_outreach",
    label: "Outreach materials / guest welcome confirmed",
  },
};
const SERVICE_TYPE_READINESS_MAP = {
  communion: "th_communion",
  easter: "th_easter",
  christmas: "th_christmas",
  conference: "th_conference",
  youth: "th_youth",
  rehearsal: {
    id: "th_rehearsal",
    label: "All musicians have received chord charts",
  },
};
const READINESS_BASE = [
  { id: "r_songs", label: "Songs finalized in setlist", base: true },
  {
    id: "r_cues",
    label: "Cue stacks reviewed (Intro / Verse / Chorus…)",
    base: true,
  },
  { id: "r_team", label: "All team roles assigned", base: true },
  { id: "r_click", label: "Click / Guide tested in Rehearsal", base: true },
  { id: "r_pp", label: "ProPresenter / Lyrics target set", base: true },
  { id: "r_lights", label: "Lighting target confirmed", base: true },
];
function normalizePlanState(value) {
  const base = value && typeof value === "object" ? value : {};
  return {
    ...base,
    songs: Array.isArray(base.songs) ? base.songs : [],
    team: Array.isArray(base.team) ? base.team : [],
    notes: typeof base.notes === "string" ? base.notes : "",
  };
}

function buildReadinessSuggestions(serviceType, songTagsList = []) {
  const seen = new Set();
  const results = [];
  function add(item) {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    results.push({ ...item, suggested: true, done: false });
  }
  const stEntry = SERVICE_TYPE_READINESS_MAP[serviceType];
  if (stEntry) {
    if (typeof stEntry === "string")
      add(Object.values(THEME_MAP).find((v) => v.id === stEntry));
    else add(stEntry);
  }
  for (const rawTags of songTagsList || []) {
    const rawStr = Array.isArray(rawTags) ? rawTags.join(' ') : (rawTags || '');
    const tags = rawStr
      .toLowerCase()
      .split(/[,;/\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    for (const tag of tags) {
      if (THEME_MAP[tag]) add(THEME_MAP[tag]);
    }
  }
  return results;
}

function normalizePersonLookup(value) {
  return String(value || "").trim().toLowerCase();
}

function isPersonBlockedByEntry(person, entry) {
  const personId = normalizePersonLookup(person?.id);
  const personEmail = normalizePersonLookup(person?.email);
  const personName = normalizePersonLookup(person?.name);
  const entryPersonId = normalizePersonLookup(entry?.personId);
  const entryEmail = normalizePersonLookup(entry?.email);
  const entryName = normalizePersonLookup(entry?.name);

  return (
    (personEmail && entryEmail && personEmail === entryEmail)
    || (personId && entryPersonId && personId === entryPersonId)
    || (personName && entryName && personName === entryName)
  );
}

function findBlockingEntryForPerson(person, blockoutEntries = []) {
  return (Array.isArray(blockoutEntries) ? blockoutEntries : []).find((entry) =>
    isPersonBlockedByEntry(person, entry),
  ) || null;
}

function countBlockedMembers(blockoutEntries = []) {
  return new Set(
    (Array.isArray(blockoutEntries) ? blockoutEntries : [])
      .map((entry) => normalizePersonLookup(entry?.email || entry?.personId || entry?.name))
      .filter(Boolean),
  ).size;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}
function toISO(display) {
  if (!display) return "";
  const [m, d, y] = display.split("/");
  return y && m && d ? `${y}-${m}-${d}` : display;
}

// ─── Status cycle ─────────────────────────────────────────────────────────────
const STATUS_CYCLE = ["draft", "ready", "locked"];
const STATUS_COLORS = { draft: "#D97706", ready: "#16A34A", locked: "#4F46E5" };
const STATUS_LABELS = {
  draft: "🟡 Draft",
  ready: "🟢 Ready",
  locked: "🔒 Locked",
};

// ─── Vocal parts constants ─────────────────────────────────────────────────────
const SATB_PARTS = [
  { key: "lead", label: "Lead Vocal", color: "#F59E0B" },
  { key: "soprano", label: "Soprano", color: "#EC4899" },
  { key: "mezzo", label: "Mezzo", color: "#C026D3" },
  { key: "alto", label: "Alto", color: "#9333EA" },
  { key: "tenor", label: "Tenor", color: "#6366F1" },
  { key: "baritone", label: "Baritone", color: "#3B82F6" },
  { key: "bass", label: "Bass", color: "#0EA5E9" },
];
const VOICE_PARTS = [
  { key: "voice1", label: "1st Voice", color: "#EC4899" },
  { key: "voice2", label: "2nd Voice", color: "#C026D3" },
  { key: "voice3", label: "3rd Voice", color: "#9333EA" },
  { key: "voice4", label: "4th Voice", color: "#6366F1" },
  { key: "voice5", label: "5th Voice", color: "#0EA5E9" },
];
const VOCAL_TEAM_ROLES = new Set([
  "worship leader",
  "lead vocal",
  "lead vocals",
  "vocals",
  "bgv 1",
  "bgv 2",
  "bgv 3",
  "bgv",
  "background vocal",
  "soprano",
  "mezzo",
  "alto",
  "contralto",
  "tenor",
  "baritone",
  "bass",
]);
// Maps normalized role key → SATB/Voice part key for auto-assign
const VOCAL_ROLE_TO_PART = {
  worship_leader: "lead",  lead_vocal: "lead",    lead_vocals: "lead",
  vocals: "lead",          vocalist: "lead",      lead_singer: "lead",
  soprano: "soprano",      soprano_1: "soprano",  soprano_2: "mezzo",
  mezzo_soprano: "mezzo",  mezzo: "mezzo",
  alto: "alto",            contralto: "alto",     alto_1: "alto",
  tenor: "tenor",          tenor_1: "tenor",
  baritone: "baritone",
  bass: "bass",
  bgv: "bgv1",             bgv_1: "bgv1",         bgv_2: "bgv2",          bgv_3: "bgv3",
  background_vocal: "bgv1", harmony: "bgv1",
  voice_1: "voice1",       voice_2: "voice2",     voice_3: "voice3",
  voice_4: "voice4",       voice_5: "voice5",
};
function normalizeRoleForPart(role) {
  return (role || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
const MUSIC_KEYS = [
  "C",
  "C#",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function TabBar({ active, onChange }) {
  const tabs = [
    { key: "setlist", label: "Setlist" },
    { key: "team", label: "Team" },
    { key: "vocals", label: "Vocals" },
  ];
  return (
    <View style={tb.row}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t.key}
          style={[tb.tab, active === t.key && tb.tabActive]}
          onPress={() => onChange(t.key)}
        >
          <Text style={[tb.tabText, active === t.key && tb.tabTextActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const tb = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: "#0B1120",
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: "#4F46E5" },
  tabText: { color: "#6B7280", fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: "#fff" },
});

// ─── Song row ─────────────────────────────────────────────────────────────────
function SongRow({ item, index, onRemove, onKeyEdit, onPress }) {
  const [editing, setEditing] = useState(false);
  const [transposedKey, setTransposedKey] = useState(item.transposedKey || "");

  const hasVocals = (item.vocalAssignments || []).length > 0;
  const hasLyrics = !!(item.chordChart || item.lyrics || "").trim();
  const hasNotes = Object.values(item.instrumentNotes || {}).some((v) =>
    (v || "").trim(),
  );

  function save() {
    onKeyEdit(item.id, transposedKey.trim());
    setEditing(false);
  }

  return (
    <TouchableOpacity
      style={styles.songRow}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.songIndex}>
        <Text style={styles.songIndexText}>{index + 1}</Text>
      </View>
      <View style={styles.songInfo}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Text style={styles.songTitle}>{item.title}</Text>
          {hasVocals && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                🎤 {item.vocalAssignments.length}
              </Text>
            </View>
          )}
          {hasLyrics && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>📝</Text>
            </View>
          )}
          {hasNotes && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🎸</Text>
            </View>
          )}
        </View>
        <Text style={styles.songMeta}>
          {item.artist ? `${item.artist} · ` : ""}
          Key:{" "}
          {item.transposedKey
            ? `${item.transposedKey} (orig ${item.key})`
            : item.key || "—"}
          {item.bpm ? ` · ${item.bpm} BPM` : ""}
        </Text>
        {editing ? (
          <View style={styles.keyEditRow}>
            <TextInput
              style={styles.keyInput}
              value={transposedKey}
              onChangeText={setTransposedKey}
              placeholder="Transposed key (e.g. G)"
              placeholderTextColor="#4B5563"
              autoCapitalize="characters"
              maxLength={4}
            />
            <TouchableOpacity style={styles.keyEditSave} onPress={save}>
              <Text style={styles.keyEditSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.keyEditLink}>
              {item.transposedKey ? "Edit key" : "+ Set transposed key"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
        <Text style={styles.removeBtnText}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Team row ─────────────────────────────────────────────────────────────────
const RESP_STYLE = {
  registered:{ bg: '#052E16', border: '#10B981', text: '#34D399', label: '✓ Registered' },
  accepted: { bg: '#052E16', border: '#10B981', text: '#34D399', label: '✓ Accepted' },
  declined:  { bg: '#1A0000', border: '#DC2626', text: '#F87171', label: '✗ Declined' },
  pending:   { bg: '#1C1000', border: '#F59E0B', text: '#FCD34D', label: '⏳ Pending' },
};

const TEAM_STATUS_ORDER = {
  pending: 0,
  declined: 1,
  accepted: 2,
  registered: 3,
};

function normalizeTeamStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "registered") return "registered";
  if (normalized === "accepted") return "accepted";
  if (normalized === "declined") return "declined";
  return "pending";
}

function getEffectiveInviteTeamStatus(person) {
  const inviteStatus = normalizeTeamStatus(person?.inviteStatus);
  const isRegistered =
    person?.playbackRegistered === true
    || Boolean(person?.playbackRegisteredAt)
    || Boolean(person?.inviteRegisteredAt);

  if (isRegistered || inviteStatus === "registered") return "registered";
  if (person?.inviteAcceptedAt) {
    return TEAM_STATUS_ORDER[inviteStatus] >= TEAM_STATUS_ORDER.accepted
      ? inviteStatus
      : "accepted";
  }
  return inviteStatus;
}

function findAssignedPerson(people, assignment) {
  const personId = String(assignment?.personId || "").trim();
  const email = String(assignment?.email || "").trim().toLowerCase();
  const name = String(assignment?.name || "").trim().toLowerCase();

  return (
    (Array.isArray(people) ? people : []).find((person) => {
      const id = String(person?.id || "").trim();
      const sharedId = String(person?._sharedId || "").trim();
      const personEmail = String(person?.email || "").trim().toLowerCase();
      const personName = String(person?.name || "").trim().toLowerCase();

      return (
        (personId && (id === personId || sharedId === personId))
        || (email && personEmail === email)
        || (name && personName === name)
      );
    }) || null
  );
}

function findAssignmentResponse(assignment, person, responseMap) {
  const keys = [
    person?.email,
    assignment?.email,
    person?.id,
    person?._sharedId,
    assignment?.personId,
    assignment?.id,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  let best = null;

  for (const key of keys) {
    const entry = responseMap?.[key];
    if (!entry) continue;

    const status = normalizeTeamStatus(entry.status || entry.response);
    const rank = TEAM_STATUS_ORDER[status] ?? 0;
    if (!best || rank >= best.rank) {
      best = {
        status,
        declineReason: entry.declineReason || "",
        rank,
      };
    }
  }

  return best;
}

function resolveTeamResponseMeta(assignment, person, responseMap) {
  const response = findAssignmentResponse(assignment, person, responseMap);
  const assignmentStatus = normalizeTeamStatus(assignment?.status);
  const personStatus = getEffectiveInviteTeamStatus(person);

  let bestStatus = "pending";
  let bestRank = TEAM_STATUS_ORDER.pending;

  for (const status of [assignmentStatus, response?.status, personStatus]) {
    const rank = TEAM_STATUS_ORDER[normalizeTeamStatus(status)] ?? 0;
    if (rank >= bestRank) {
      bestStatus = normalizeTeamStatus(status);
      bestRank = rank;
    }
  }

  return {
    status: bestStatus,
    declineReason: bestStatus === "declined" ? response?.declineReason || "" : "",
  };
}

function TeamRow({ assignment, isBlocked, onRemove, respStatus, declineReason, servedCount, lastServed }) {
  const rs = RESP_STYLE[respStatus] || RESP_STYLE.pending;
  return (
    <View style={[styles.teamRow, isBlocked && styles.teamRowBlocked]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.teamRole}>{formatRoleLabel(assignment.role)}</Text>
        <View style={styles.teamPersonRow}>
          <Text style={styles.teamName}>{assignment.name}</Text>
          {isBlocked && (
            <View style={styles.blockedBadge}>
              <Text style={styles.blockedBadgeText}>⚠️ Unavailable</Text>
            </View>
          )}
          {servedCount > 0 && (
            <View style={styles.servedBadge}>
              <Text style={styles.servedBadgeText}>{servedCount}×</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 }}>
          <View style={{ backgroundColor: rs.bg, borderWidth: 1, borderColor: rs.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: rs.text, fontSize: 10, fontWeight: '700' }}>{rs.label}</Text>
          </View>
          {lastServed ? (
            <Text style={{ color: '#475569', fontSize: 10 }}>Last: {lastServed}</Text>
          ) : null}
          {declineReason ? (
            <Text style={{ color: '#6B7280', fontSize: 10, fontStyle: 'italic' }} numberOfLines={1}>
              "{declineReason}"
            </Text>
          ) : null}
        </View>
      </View>
      <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
        <Text style={styles.removeBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ServicePlanScreen({ route, navigation }) {
  const { width: _spWidth } = useWindowDimensions();
  const _spIsIPad = _spWidth >= 768;
  const paramServiceId = route?.params?.serviceId;

  const [loading, setLoading] = useState(true);
  const [resolvedServiceId, setResolvedServiceId] = useState(
    paramServiceId || null,
  );
  const [service, setService] = useState(null);
  const [rawPlan, setRawPlan] = useState(() => normalizePlanState());
  const plan = useMemo(() => normalizePlanState(rawPlan), [rawPlan]);
  const setPlan = useCallback((nextPlan) => {
    setRawPlan(normalizePlanState(nextPlan));
  }, []);
  const [people, setPeople] = useState([]);
  const [library, setLibrary] = useState([]);
  const [assignmentResponses, setAssignmentResponses] = useState({}); // email → { status, declineReason }
  const [blockedEntries, setBlockedEntries] = useState([]);
  const [tab, setTab] = useState("setlist");

  // Download All Stems
  const [downloadingStems, setDownloadingStems] = useState(false);
  const [stemDownloadMsg, setStemDownloadMsg] = useState("");

  // Details edit state
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editType, setEditType] = useState("standard");
  const [saving, setSaving] = useState(false);

  // Song picker modal
  const [songModal, setSongModal] = useState(false);
  const [songSearch, setSongSearch] = useState("");

  // Team assign modal
  const [teamModal, setTeamModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [personSearch, setPersonSearch] = useState("");

  // Notes modal
  const [notesModal, setNotesModal] = useState(false);
  const [editNotes, setEditNotes] = useState("");

  // Service Brain
  const [brainStats, setBrainStats] = useState({}); // { [personId]: { total, byRole, lastServed } }
  const [isSuggesting, setIsSuggesting] = useState(false);

  // Vocal parts assignment
  const [vocalMode, setVocalMode] = useState("satb"); // 'satb' | 'voice'
  const [vocalAssignments, setVocalAssignments] = useState({}); // { songId: { partKey: { personId, name, email, phone, key, notes } } }
  const [vocalPickerSongId, setVocalPickerSongId] = useState(null);
  const [vocalPickerPart, setVocalPickerPart] = useState(null);
  const [vocalPickerModal, setVocalPickerModal] = useState(false);
  const [vocalSearch, setVocalSearch] = useState("");
  // Key picker
  const [vocalKeyModal, setVocalKeyModal] = useState(false);
  const [vocalKeyTarget, setVocalKeyTarget] = useState({
    songId: null,
    partKey: null,
  });
  // Personal notes modal
  const [vocalNotesModal, setVocalNotesModal] = useState(false);
  const [vocalNotesTarget, setVocalNotesTarget] = useState({
    songId: null,
    partKey: null,
  });
  const [vocalNotesText, setVocalNotesText] = useState("");
  // View toggle: by song vs by member
  const [vocalView, setVocalView] = useState("song"); // 'song' | 'member'
  const [selectedMember, setSelectedMember] = useState(null);
  // AI Vocal Part Generator
  const [aiPartsModal, setAiPartsModal] = useState(false);
  const [aiPartsSongId, setAiPartsSongId] = useState(null);
  const [aiPartsLoading, setAiPartsLoading] = useState(false);
  const [aiPartsResult, setAiPartsResult] = useState(null); // { parts: { 'Soprano': '...', ... } }
  const [aiPartsError, setAiPartsError] = useState(null);

  // Readiness hints (auto-suggested from song themes — hidden until relevant)
  const [readinessHints, setReadinessHints] = useState([]);
  const [hintsExpanded, setHintsExpanded] = useState(true);
  const blockedMemberCount = useMemo(
    () => countBlockedMembers(blockedEntries),
    [blockedEntries],
  );

  const refresh = useCallback(async () => {
    try {
      // Resolve service ID: prefer route param, fall back to active service
      const id = paramServiceId || (await getActiveServiceId());
      if (!id) {
        setLoading(false);
        return;
      }

      setResolvedServiceId(id);

      const [svcs, peeps, songs, pl] = await Promise.all([
        getServices(),
        getPeople(),
        getSongs(),
        getPlanForService(id),
      ]);
      const svc = svcs.find((s) => s.id === id);
      if (!svc) {
        setLoading(false);
        return;
      }

      setService(svc);
      const loadedPlan = normalizePlanState(pl);
      setPlan(loadedPlan);
      setPeople(peeps);
      setLibrary(songs);
      setEditTitle(svc.title || "");
      setEditDate(toDisplay(svc.date || ""));
      setEditTime(svc.time || "09:00");
      setEditType(svc.serviceType || "standard");

      const blockouts = await getBlockoutsForDate(svc.date);
      setBlockedEntries(Array.isArray(blockouts) ? blockouts : []);

      // Init readiness hints
      try {
        const tagsList = loadedPlan.songs.map((s) => {
          const t = songs.find((l) => l.id === s.songId)?.tags;
          return Array.isArray(t) ? t.join(' ') : (t || '');
        });
        const initialSuggestions = buildReadinessSuggestions(
          svc.serviceType,
          tagsList,
        );
        let hintsDoneMap = {};
        const raw = await AsyncStorage.getItem(`um/hints/v1/${id}`);
        if (raw) {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved))
            hintsDoneMap = Object.fromEntries(saved.map((i) => [i.id, i.done]));
        }
        setReadinessHints(
          initialSuggestions.map((s) => ({
            ...s,
            done: hintsDoneMap[s.id] ?? false,
          })),
        );
        if (initialSuggestions.length > 0) setHintsExpanded(true);
      } catch {
        /* ignore */
      }

      // Load vocal assignments
      try {
        const vRaw = await AsyncStorage.getItem(`um/vocals/v1/${id}`);
        if (vRaw) setVocalAssignments(JSON.parse(vRaw));
      } catch { /* ignore */ }

      // Load brain stats (fire-and-forget — non-blocking)
      getBrainStats().then(({ stats }) => {
        if (stats) setBrainStats(stats);
      }).catch(() => {});

      // Fetch assignment responses for this service
      try {
        const respRes = await fetch(`${SYNC_URL}/sync/assignment/responses?serviceId=${id}`, { headers: syncHeaders() });
        if (respRes.ok) {
          const respData = await respRes.json();
          const rMap = {};
          // Server returns object: { email: { status, response, declineReason } }
          if (respData && typeof respData === 'object' && !Array.isArray(respData)) {
            Object.entries(respData).forEach(([email, val]) => {
              const key = email.toLowerCase();
              rMap[key] = { status: val.status || val.response || 'pending', declineReason: val.declineReason || '' };
            });
          } else if (Array.isArray(respData)) {
            respData.forEach(r => {
              const key = (r.email || r.personId || '').toLowerCase();
              if (key) rMap[key] = { status: r.status || r.response || 'pending', declineReason: r.declineReason || '' };
            });
          }
          setAssignmentResponses(rMap);
        }
      } catch {
        /* ignore — offline */
      }
    } finally {
      setLoading(false);
    }
  }, [paramServiceId]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", refresh);
    refresh();
    return unsub;
  }, [navigation, refresh]);

  // Songs already in the plan
  const planSongIds = useMemo(
    () => new Set(plan.songs.map((s) => s.songId)),
    [plan.songs],
  );

  // Filtered library for song picker
  const filteredLibrary = useMemo(() => {
    const q = songSearch.toLowerCase();
    return library.filter(
      (s) =>
        !planSongIds.has(s.id) &&
        (s.title?.toLowerCase().includes(q) ||
          s.artist?.toLowerCase().includes(q)),
    );
  }, [library, planSongIds, songSearch]);

  // Filtered people for team picker
  const filteredPeople = useMemo(() => {
    const q = personSearch.toLowerCase();
    return people.filter((p) => {
      // Name search
      if (q && !p.name?.toLowerCase().includes(q)) return false;
      // Role filter — when a role is selected, only show people who have it
      if (selectedRole && !(p.roles || []).includes(selectedRole)) return false;
      return true;
    });
  }, [people, personSearch, selectedRole]);

  // Group team by role
  const teamByRole = useMemo(() => {
    const map = {};
    for (const t of plan.team) {
      if (!map[t.role]) map[t.role] = [];
      map[t.role].push(t);
    }
    return map;
  }, [plan.team]);

  // Detected themes (used in hints UI)
  const detectedThemes = useMemo(() => {
    if (!service) return [];
    const names = [];
    if (service.serviceType && SERVICE_TYPE_READINESS_MAP[service.serviceType])
      names.push(service.serviceType);
    for (const s of plan.songs) {
      const libSong = library.find((l) => l.id === s.songId);
      const rawT = libSong?.tags;
      const tagsStr = Array.isArray(rawT) ? rawT.join(' ') : (rawT || '');
      tagsStr
        .toLowerCase()
        .split(/[,;/\s]+/)
        .forEach((t) => {
          const tt = t.trim();
          if (THEME_MAP[tt] && !names.includes(tt)) names.push(tt);
        });
    }
    return names;
  }, [plan.songs, library, service?.serviceType]);

  // Persist hints to AsyncStorage whenever they change
  useEffect(() => {
    if (resolvedServiceId) {
      AsyncStorage.setItem(
        `um/hints/v1/${resolvedServiceId}`,
        JSON.stringify(readinessHints),
      );
    }
  }, [readinessHints, resolvedServiceId]);

  // Persist vocal assignments
  useEffect(() => {
    if (resolvedServiceId && Object.keys(vocalAssignments).length > 0) {
      AsyncStorage.setItem(
        `um/vocals/v1/${resolvedServiceId}`,
        JSON.stringify(vocalAssignments),
      );
    }
  }, [vocalAssignments, resolvedServiceId]);

  // People available for vocal picker — all team members, vocalists sorted first
  const vocalPickerPeople = useMemo(() => {
    const q = vocalSearch.toLowerCase();
    // Start with everyone on the team
    const pool =
      plan.team.length > 0
        ? plan.team
        : people.map((p) => ({
            personId: p.id,
            name: p.name,
            role: (p.roles || [])[0] || "",
          }));
    const filtered = pool.filter(
      (m) => !q || (m.name || "").toLowerCase().includes(q),
    );
    // Sort: vocal roles first, then everyone else alphabetically
    return [...filtered].sort((a, b) => {
      const aVocal = VOCAL_TEAM_ROLES.has((a.role || "").toLowerCase());
      const bVocal = VOCAL_TEAM_ROLES.has((b.role || "").toLowerCase());
      if (aVocal && !bVocal) return -1;
      if (!aVocal && bVocal) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [plan.team, people, vocalSearch]);

  // Rebuild hints when song list changes (preserves existing done states)
  function rebuildHints(planSongs, svcType) {
    const tagsList = (planSongs || []).map((s) => {
      const t = library.find((l) => l.id === s.songId)?.tags;
      return Array.isArray(t) ? t.join(' ') : (t || '');
    });
    const newSuggestions = buildReadinessSuggestions(
      svcType || service?.serviceType,
      tagsList,
    );
    setReadinessHints((prev) => {
      const doneMap = Object.fromEntries(prev.map((i) => [i.id, i.done]));
      return newSuggestions.map((s) => ({
        ...s,
        done: doneMap[s.id] ?? false,
      }));
    });
    if (newSuggestions.length > 0) setHintsExpanded(true);
  }

  function toggleHint(id) {
    setReadinessHints((prev) =>
      prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
    );
  }

  // Handlers
  async function handleAddSong(song) {
    try {
      const targetServiceId = resolvedServiceId || service?.id;
      const next = normalizePlanState(
        await addSongToService(targetServiceId, song),
      );
      setPlan(next);
      rebuildHints(next.songs);
      setSongSearch("");
      setSongModal(false);
    } catch (error) {
      Alert.alert(
        "Could not add song",
        error?.message || "The song could not be added to this setlist.",
      );
    }
  }

  async function handleRemoveSong(itemId) {
    Alert.alert("Remove song?", "Remove this song from the setlist?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const next = normalizePlanState(
            await removeSongFromService(resolvedServiceId, itemId),
          );
          setPlan(next);
          rebuildHints(next.songs);
        },
      },
    ]);
  }

  async function handleKeyEdit(itemId, key) {
    const next = normalizePlanState(await updateSongItem(resolvedServiceId, itemId, {
      transposedKey: key,
    }));
    setPlan(next);
    // Auto-redistribute chord chart in new key for all harmonic instruments
    const updatedItem = next.songs.find((s) => s.id === itemId);
    if (updatedItem?.chordChart) {
      const redistributed = normalizePlanState(await distributeChordChart(
        resolvedServiceId,
        itemId,
      ));
      setPlan(redistributed);
    }
  }

  async function handleAssignPerson(person) {
    if (!selectedRole) {
      Alert.alert(
        "Pick a role first",
        "Select a role above before choosing a person.",
      );
      return;
    }

    const blockingEntry = findBlockingEntryForPerson(person, blockedEntries);
    if (blockingEntry) {
      Alert.alert(
        "Member unavailable",
        `${person.name} is blocked out on ${toDisplay(service?.date || editDate || blockingEntry.date)}`
          + `${blockingEntry.reason ? `.\n\nReason: ${blockingEntry.reason}` : "."}`
          + "\n\nRemove the blockout before assigning this person.",
      );
      return;
    }

    const isKeyboardist = selectedRole === "Keys";

    async function doAssign(roles) {
      let updated = normalizePlanState();
      for (const role of roles) {
        updated = normalizePlanState(await assignTeamMember(resolvedServiceId, {
          role,
          personId: person.id,
          name: person.name,
        }));
      }
      setPlan(updated);
      setTeamModal(false);
      setSelectedRole("");
      setPersonSearch("");
    }

    if (isKeyboardist) {
      Alert.alert(
        "🎹 Auto-assign to Synth/Pad?",
        `${person.name} → Keys.\n\nKeyboardists normally also cover Synth/Pad. Auto-assign to both?`,
        [
          {
            text: "Keys only",
            style: "cancel",
            onPress: () => doAssign(["Keys"]),
          },
          {
            text: "Yes — Keys + Synth/Pad",
            onPress: () => doAssign(["Keys", "Synth/Pad"]),
          },
        ],
      );
    } else {
      await doAssign([selectedRole]);
    }
  }

  async function handleRemoveAssignment(assignmentId) {
    const next = normalizePlanState(
      await removeTeamAssignment(resolvedServiceId, assignmentId),
    );
    setPlan(next);
  }

  async function handleSaveNotes() {
    const next = normalizePlanState(
      await updateServiceNotes(resolvedServiceId, editNotes),
    );
    setPlan(next);
    setNotesModal(false);
  }

  function handleVocalAssign(person) {
    // Default key = song's transposed key or original key
    const planItem = plan.songs.find((s) => s.songId === vocalPickerSongId);
    const libSong = library.find((l) => l.id === vocalPickerSongId);
    const defaultKey =
      planItem?.transposedKey ||
      planItem?.key ||
      libSong?.key ||
      libSong?.originalKey ||
      "";
    setVocalAssignments((prev) => ({
      ...prev,
      [vocalPickerSongId]: {
        ...(prev[vocalPickerSongId] || {}),
        [vocalPickerPart]: {
          personId: person.personId || person.id,
          name: person.name,
          role: person.role || "",
          key: defaultKey,
          notes: "",
        },
      },
    }));
    setVocalPickerModal(false);
    setVocalPickerSongId(null);
    setVocalPickerPart(null);
  }

  function handleVocalClear(songId, partKey) {
    setVocalAssignments((prev) => {
      const song = { ...(prev[songId] || {}) };
      delete song[partKey];
      return { ...prev, [songId]: song };
    });
  }

  function handleVocalSetKey(songId, partKey, key) {
    setVocalAssignments((prev) => ({
      ...prev,
      [songId]: {
        ...(prev[songId] || {}),
        [partKey]: { ...(prev[songId]?.[partKey] || {}), key },
      },
    }));
    setVocalKeyModal(false);
  }

  function handleVocalSaveNotes() {
    const { songId, partKey } = vocalNotesTarget;
    setVocalAssignments((prev) => ({
      ...prev,
      [songId]: {
        ...(prev[songId] || {}),
        [partKey]: {
          ...(prev[songId]?.[partKey] || {}),
          notes: vocalNotesText,
        },
      },
    }));
    setVocalNotesModal(false);
  }

  async function handleGenerateParts(item, libSong) {
    const title = item.title || libSong?.title || "Untitled";
    const key = item.transposedKey || item.key || libSong?.key || "C";
    const chordChart = (item.chordChart || libSong?.chordChart || "").trim();
    const lyrics = (item.lyrics || libSong?.lyrics || "").trim();

    setAiPartsSongId(item.songId);
    setAiPartsResult(null);
    setAiPartsError(null);
    setAiPartsLoading(true);
    setAiPartsModal(true);

    const payload = {
      title,
      key,
      chord_chart: chordChart,
      lyrics,
      mode: vocalMode,
    };

    setCineStageStatus("Generating vocal parts");
    try {
      // Try CineStage local server first (faster, richer AI stack)
      let data;
      try {
        data = await cinestageGenerateParts(payload);
      } catch {
        // CineStage server not running — fall back to Cloudflare
        const res = await fetch(`${SYNC_URL}/sync/ai/vocal-parts`, {
          method: "POST",
          headers: { ...syncHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            chordChart,
            chord_chart: undefined,
          }),
        });
        data = await res.json();
        if (!res.ok || data.error)
          throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (data.error) throw new Error(data.error);
      setAiPartsResult(data);
    } catch (e) {
      setAiPartsError(e?.message || "Request failed");
    } finally {
      setAiPartsLoading(false);
      clearCineStageStatus();
    }
  }

  function handleApplyAiPart(partLabel, guidance) {
    // Map AI part label → SATB/voice key
    const labelToKey = {
      "Lead Vocal": "lead",
      Soprano: "soprano",
      "Mezzo-Soprano": "mezzo",
      Alto: "alto",
      Tenor: "tenor",
      Baritone: "baritone",
      Bass: "bass",
      "1st Voice": "voice1",
      "2nd Voice": "voice2",
      "3rd Voice": "voice3",
      "4th Voice": "voice4",
      "5th Voice": "voice5",
    };
    const partKey = labelToKey[partLabel];
    if (!partKey || !aiPartsSongId) return;
    setVocalAssignments((prev) => ({
      ...prev,
      [aiPartsSongId]: {
        ...(prev[aiPartsSongId] || {}),
        [partKey]: {
          ...(prev[aiPartsSongId]?.[partKey] || {}),
          notes: guidance,
        },
      },
    }));
    Alert.alert("Applied", `"${partLabel}" harmony notes updated.`);
  }

  // ── By-Member helpers ──────────────────────────────────────────────────────
  function getMemberPartForSong(personId, songId) {
    const sa = vocalAssignments[songId] || {};
    for (const [pk, a] of Object.entries(sa)) {
      if (a.personId === personId) return pk;
    }
    return null;
  }

  function getAssignedSongsForMember(personId) {
    return plan.songs.filter((s) => {
      const sa = vocalAssignments[s.songId] || {};
      return Object.values(sa).some((a) => a.personId === personId);
    });
  }

  function getMemberIdentity(memberId, member = null) {
    const rosterPerson =
      people.find((person) => person.id === memberId) || null;
    const teamMember =
      plan.team.find((teamPerson) => (teamPerson.personId || teamPerson.id) === memberId) ||
      null;

    return {
      name: rosterPerson?.name || member?.name || teamMember?.name || "",
      lastName:
        rosterPerson?.lastName || member?.lastName || teamMember?.lastName || "",
      email: rosterPerson?.email || member?.email || teamMember?.email || "",
      phone: rosterPerson?.phone || member?.phone || teamMember?.phone || "",
      role:
        member?.role ||
        teamMember?.role ||
        rosterPerson?.role ||
        (rosterPerson?.roles || [])[0] ||
        "",
    };
  }

  function buildPublishedVocalAssignments(sourceAssignments = vocalAssignments) {
    const publishedAssignments = {};

    for (const [songId, songAssignments] of Object.entries(
      sourceAssignments || {},
    )) {
      const nextSongAssignments = {};

      for (const [partKey, assignment] of Object.entries(songAssignments || {})) {
        if (!assignment) continue;
        const memberIdentity = getMemberIdentity(assignment.personId);
        nextSongAssignments[partKey] = {
          ...assignment,
          personId: assignment.personId || "",
          name: assignment.name || memberIdentity.name || "",
          lastName: assignment.lastName || memberIdentity.lastName || "",
          email: assignment.email || memberIdentity.email || "",
          phone: assignment.phone || memberIdentity.phone || "",
          role: assignment.role || memberIdentity.role || "",
        };
      }

      publishedAssignments[songId] = nextSongAssignments;
    }

    return publishedAssignments;
  }

  async function syncPlanSnapshot(
    nextPlan,
    nextVocalAssignments = vocalAssignments,
  ) {
    const publishedVocalAssignments =
      buildPublishedVocalAssignments(nextVocalAssignments);
    const res = await fetch(`${SYNC_URL}/sync/publish`, {
      method: "POST",
      headers: syncHeaders(),
      body: JSON.stringify({
        serviceId: resolvedServiceId,
        plan: nextPlan,
        vocalAssignments: publishedVocalAssignments,
      }),
    });
    const publishResult = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
      publishedVocalAssignments,
      publishResult,
    };
  }

  function handleMemberPartAssign(member, songId, partKey) {
    const memberId = member.personId || member.id;
    const memberIdentity = getMemberIdentity(memberId, member);
    const planItem = plan.songs.find((s) => s.songId === songId);
    const libSong = library.find((l) => l.id === songId);
    const defaultKey =
      planItem?.transposedKey ||
      planItem?.key ||
      libSong?.key ||
      libSong?.originalKey ||
      "";
    setVocalAssignments((prev) => {
      const sa = { ...(prev[songId] || {}) };
      // Remove any prior slot for this member on this song
      Object.keys(sa).forEach((pk) => {
        if (sa[pk].personId === memberId) delete sa[pk];
      });
      if (partKey !== null) {
        sa[partKey] = {
          personId: memberId,
          name: memberIdentity.name,
          lastName: memberIdentity.lastName,
          email: memberIdentity.email,
          phone: memberIdentity.phone,
          role: memberIdentity.role,
          key: prev[songId]?.[partKey]?.key || defaultKey,
          notes: prev[songId]?.[partKey]?.notes || "",
        };
      }
      return { ...prev, [songId]: sa };
    });
  }

  // Auto-assign vocal team members to parts by role.
  // songIdOrAll: a specific songId, or 'all' for every song in the setlist.
  function handleAutoAssignRoles(songIdOrAll) {
    const targetSongIds =
      songIdOrAll === "all"
        ? plan.songs.map((s) => s.songId)
        : [songIdOrAll];

    const vocalists = plan.team.filter((m) => {
      const norm = normalizeRoleForPart(m.role);
      return (
        VOCAL_TEAM_ROLES.has((m.role || "").toLowerCase()) ||
        VOCAL_ROLE_TO_PART[norm] !== undefined
      );
    });

    if (vocalists.length === 0) {
      Alert.alert(
        "No Vocalists",
        "Add vocal team members (Soprano, Alto, BGV, Lead Vocal…) in the Team tab first.",
      );
      return;
    }

    let totalAssigned = 0;
    const nextVocalAssignments = { ...vocalAssignments };

    for (const songId of targetSongIds) {
      const planItem = plan.songs.find((s) => s.songId === songId);
      const libSong = library.find((l) => l.id === songId);
      const defaultKey =
        planItem?.transposedKey || planItem?.key || libSong?.key || "";

      const usedParts = new Set(
        Object.keys(nextVocalAssignments[songId] || {}),
      );
      const newAssign = { ...(nextVocalAssignments[songId] || {}) };

      // Pass 1: role-mapped parts
      for (const member of vocalists) {
        const memberId = member.personId || member.id;
        if (Object.values(newAssign).some((a) => a.personId === memberId))
          continue;
        const norm = normalizeRoleForPart(member.role);
        const partKey = VOCAL_ROLE_TO_PART[norm];
        if (partKey && !usedParts.has(partKey)) {
          usedParts.add(partKey);
          const identity = getMemberIdentity(memberId, member);
          newAssign[partKey] = {
            personId: memberId,
            name: identity.name,
            lastName: identity.lastName || "",
            email: identity.email || "",
            phone: identity.phone || "",
            role: identity.role || member.role || "",
            key: defaultKey,
            notes: newAssign[partKey]?.notes || "",
          };
          totalAssigned++;
        }
      }

      // Pass 2: BGV overflow for any remaining vocal members
      const bgvSlots = ["bgv1", "bgv2", "bgv3"];
      for (const member of vocalists) {
        const memberId = member.personId || member.id;
        if (Object.values(newAssign).some((a) => a.personId === memberId))
          continue;
        const slot = bgvSlots.find((s) => !usedParts.has(s));
        if (slot) {
          usedParts.add(slot);
          const identity = getMemberIdentity(memberId, member);
          newAssign[slot] = {
            personId: memberId,
            name: identity.name,
            lastName: identity.lastName || "",
            email: identity.email || "",
            phone: identity.phone || "",
            role: identity.role || member.role || "",
            key: defaultKey,
            notes: "",
          };
          totalAssigned++;
        }
      }

      nextVocalAssignments[songId] = newAssign;
    }

    setVocalAssignments(nextVocalAssignments);
    if (totalAssigned > 0) {
      Alert.alert(
        "Auto-Assigned ✓",
        `${totalAssigned} part${totalAssigned !== 1 ? "s" : ""} assigned across ${targetSongIds.length} song${targetSongIds.length !== 1 ? "s" : ""}.\nTap Publish to send to Playback.`,
      );
    } else {
      Alert.alert(
        "Nothing New",
        "All vocal members already assigned, or no matching roles found.",
      );
    }
  }

  async function handleStatusChange(newStatus) {
    if (newStatus === "locked") {
      Alert.alert(
        "Lock service?",
        "Locking prevents further edits. You can unlock it later.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Lock", onPress: () => applyStatus("locked") },
        ],
      );
    } else {
      applyStatus(newStatus);
    }
  }

  async function applyStatus(status) {
    const svc = await updateService(resolvedServiceId, { status });
    setService(svc);
  }

  async function handleSaveDetails() {
    const isoDate = toISO(editDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      Alert.alert("Invalid date", "Use MM/DD/YYYY format (e.g. 02/01/2026).");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(editTime)) {
      Alert.alert("Invalid time", "Use HH:mm format (e.g. 09:00).");
      return;
    }
    setSaving(true);
    try {
      const svc = await updateService(resolvedServiceId, {
        title: editTitle.trim() || service.title,
        date: isoDate,
        time: editTime,
        serviceType: editType,
      });
      setService(svc);
      // Reload blockouts for potentially new date
      const blockouts = await getBlockoutsForDate(isoDate);
      setBlockedEntries(Array.isArray(blockouts) ? blockouts : []);
      // Rebuild hints for new service type
      rebuildHints(plan.songs, editType);
      Alert.alert("Saved", "Service details updated.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadAllStems() {
    if (plan.songs.length === 0) return;
    setDownloadingStems(true);
    const STEMS_DIR = FileSystem.documentDirectory + "um_stems/";
    let downloaded = 0;
    let skipped = 0;

    for (const planSong of plan.songs) {
      const libSong = library.find((l) => l.id === planSong.songId);
      if (!libSong) continue;

      setStemDownloadMsg(
        `${libSong.title || "Song"} (${downloaded + skipped + 1}/${plan.songs.length})`,
      );

      // Resolve stem URLs: prefer existing job result, otherwise fetch from CF KV
      let stemsMap = libSong.latestStemsJob?.result?.stems;
      if (!stemsMap || Object.keys(stemsMap).length === 0) {
        try {
          const r = await fetch(
            `${SYNC_URL}/sync/stems-result?songId=${libSong.id}`,
            { headers: syncHeaders() },
          );
          if (r.ok) {
            const kv = await r.json();
            stemsMap = kv.stems;
          }
        } catch {
          /* no stems available */
        }
      }

      if (!stemsMap || Object.keys(stemsMap).length === 0) {
        skipped++;
        continue;
      }

      const dir = `${STEMS_DIR}${libSong.id}/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(
        () => {},
      );
      const newLocalStems = { ...(libSong.localStems || {}) };
      let anyNew = false;

      for (const [stemName, stemUrl] of Object.entries(stemsMap)) {
        if (!stemUrl || stemUrl.startsWith("file://")) continue;
        const ext = (
          stemUrl.split("?")[0].split(".").pop() || "wav"
        ).toLowerCase();
        const destPath = `${dir}${stemName}.${ext}`;
        const info = await FileSystem.getInfoAsync(destPath).catch(() => ({
          exists: false,
        }));
        if (!info.exists) {
          setStemDownloadMsg(`↓ ${stemName} — ${libSong.title}`);
          try {
            const dl = await FileSystem.downloadAsync(stemUrl, destPath);
            if (dl.status === 200) {
              newLocalStems[stemName] = {
                localUri: destPath,
                fileName: `${stemName}.${ext}`,
              };
              anyNew = true;
            }
          } catch (e) {
            console.warn(`Download failed for ${stemName}: ${e.message}`);
          }
        } else if (!newLocalStems[stemName]) {
          newLocalStems[stemName] = {
            localUri: destPath,
            fileName: `${stemName}.${ext}`,
          };
          anyNew = true;
        }
      }

      if (anyNew) {
        await addOrUpdateSong({ ...libSong, localStems: newLocalStems });
      }
      downloaded++;
    }

    setDownloadingStems(false);
    setStemDownloadMsg("");
    const msg =
      downloaded > 0
        ? `Stems ready for ${downloaded} song${downloaded !== 1 ? "s" : ""}.${skipped > 0 ? ` (${skipped} had no stems yet)` : ""}`
        : `No stems found. Run CineStage on songs first to generate stems.`;
    Alert.alert("Download Complete", msg);
  }

  async function handlePublishToTeam() {
    if (plan.team.length === 0) {
      Alert.alert(
        "No Team Assigned",
        "Assign team members first before publishing.",
      );
      return;
    }
    setCineStageStatus("Publishing to team");
    try {
      const draftPublishedVocalAssignments = buildPublishedVocalAssignments();
      const { publishedVocalAssignments, publishResult } =
        await syncPlanSnapshot(plan, draftPublishedVocalAssignments);
      setVocalAssignments(publishedVocalAssignments);
      {
        // Also push full song content (charts, lyrics, instrumentNotes) so UP can see them.
        // plan.songs only has references; the full data lives in the local library.
        const songsToSync = plan.songs
          .map((s) => {
            const libSong = library.find((l) => l.id === s.songId) || {};
            return { ...libSong, ...s, id: s.songId };
          })
          .filter((s) => s.id);
        if (songsToSync.length > 0) {
          fetch(`${SYNC_URL}/sync/library-push`, {
            method: "POST",
            headers: syncHeaders(),
            body: JSON.stringify({ songs: songsToSync }),
          }).catch(() => {}); // fire-and-forget, non-blocking
        }
        const emailSent = Number(publishResult?.alerts?.emailSent || 0);
        const emailAttempted = Number(
          publishResult?.alerts?.emailAttempted || 0,
        );
        Alert.alert(
          "✅ Published!",
          [
            `Assignment sent to ${plan.team.length} team member(s).`,
            "They can now sync in the Playback app.",
            emailSent > 0
              ? `Email alert${emailSent === 1 ? "" : "s"} sent to ${emailSent} member${emailSent === 1 ? "" : "s"}.`
              : emailAttempted > 0
                ? "Assignment emails were attempted but were not delivered."
                : "",
          ].filter(Boolean).join("\n"),
        );
        // Pre-process pitch-shifted stems for songs with key changes (fire-and-forget)
        // By the time musicians open Personal Practice, the stems are already cached in R2.
        ;(async () => {
          try {
            for (const item of plan.songs) {
              const libSong = library.find((l) => l.id === item.songId) || {};
              const origKey = libSong.key || item.key || '';
              const svcKey  = item.transposedKey || '';
              if (!origKey || !svcKey || origKey === svcKey) continue;
              const semitones = calculateSemitoneShift(origKey, svcKey);
              if (!semitones) continue;
              // Gather stem URLs for this song
              let stemsMap = libSong.latestStemsJob?.result?.stems || {};
              if (!Object.keys(stemsMap).length) {
                const kres = await fetch(`${SYNC_URL}/sync/stems-result?songId=${libSong.id}`, { headers: syncHeaders() }).catch(() => null);
                if (kres?.ok) {
                  const kdata = await kres.json().catch(() => ({}));
                  stemsMap = kdata?.stems || {};
                }
              }
              const stemUrls = {};
              for (const [k, v] of Object.entries(stemsMap)) {
                if (typeof v === 'string' && v.startsWith('http')) stemUrls[k] = v;
                else if (typeof v === 'object' && v?.url) stemUrls[k] = v.url;
              }
              if (!Object.keys(stemUrls).length) continue;
              // Request transposition — CineStage caches result in R2
              fetch(`${CINESTAGE_URL}/stems/transpose`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stems: stemUrls, semitones }),
              }).catch(() => {});
            }
          } catch (_) {}
        })();

        // Record in service brain (fire-and-forget)
        brainRecordAssignments({
          serviceId: resolvedServiceId,
          serviceDate: service?.date || "",
          serviceTitle: service?.title || "",
          team: plan.team.map(t => ({ personId: t.personId || t.id, name: t.name, role: t.role })),
        }).catch(() => {});
      }
    } catch (e) {
      Alert.alert("Sync Error", "Could not reach sync server.");
    } finally {
      clearCineStageStatus();
    }
  }

  async function handleSuggestTeam() {
    if (!service?.date || isSuggesting) return;
    // Gather unique roles needed from existing team slots or ask for all roles
    const neededRoles = plan.team.length > 0
      ? [...new Set(plan.team.map(t => t.role).filter(Boolean))]
      : ROLE_OPTIONS.map(r => r.label || r.value || r).filter(Boolean).slice(0, 8);
    if (neededRoles.length === 0) {
      Alert.alert("No Roles", "Add team roles first, then tap Suggest.");
      return;
    }
    setIsSuggesting(true);
    try {
      const { suggestions } = await brainSuggest({
        serviceDate: service.date,
        neededRoles,
      });
      if (!suggestions || Object.keys(suggestions).length === 0) {
        Alert.alert("No History", "Not enough assignment history yet. Serve more services to build the brain.");
        return;
      }
      // Show summary of top picks
      const lines = Object.entries(suggestions).map(([role, candidates]) => {
        const top = candidates[0];
        if (!top) return null;
        const status = top.available ? "" : " ⚠️blocked";
        return `${role}: ${top.name} (${top.timesServed}×)${status}`;
      }).filter(Boolean);
      Alert.alert(
        "🧠 Brain Suggestion",
        lines.join("\n") + "\n\nOpen the People picker to apply.",
      );
    } catch (e) {
      Alert.alert("Suggest Failed", e.message);
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleDeleteService() {
    Alert.alert(
      "Delete service?",
      `"${service?.title}" will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${SYNC_URL}/sync/service/delete`, {
                method: "POST",
                headers: syncHeaders(),
                body: JSON.stringify({ serviceId: resolvedServiceId }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
            } catch (err) {
              Alert.alert(
                "Cloud Sync Error",
                "The service was not removed from the shared cloud yet. Try again when the connection is stable.",
              );
              return;
            }
            await deleteService(resolvedServiceId);
            navigation.goBack();
          },
        },
      ],
    );
  }

  async function handleOpenInRehearsal() {
    const targetServiceId = resolvedServiceId || service?.id;
    const latestPlan = normalizePlanState(
      targetServiceId ? await getPlanForService(targetServiceId) : plan,
    );

    if (latestPlan.songs.length === 0) {
      Alert.alert("No Songs", "Add songs to the setlist first.");
      return;
    }

    const latestLibrary = await getSongs();

    // Build full resolved setlist from the freshest storage snapshot so newly
    // downloaded local stems are included even if this screen state is stale.
    const setlist = latestPlan.songs.map((item) => {
      const libSong = latestLibrary.find((l) => l.id === item.songId);
      return libSong
        ? { ...libSong, ...item, id: item.songId }
        : { id: item.songId, title: item.title || "Song" };
    });

    navigation.navigate("Rehearsal", {
      song: setlist[0],
      setlist,
      setlistIndex: 0,
      apiBase: CINESTAGE_URL,
      userRole: "Music Director",
      serviceId: targetServiceId,
      service,
      plan: latestPlan,
      isAdmin: true,
      hideVocalSection: true,
      nextSong: setlist[1] || null,
    });
  }

  async function handleOpenInPlayback() {
    if (plan.songs.length === 0) {
      Alert.alert("No Songs", "Add songs to the setlist first.");
      return;
    }
    try {
      const draftPublishedVocalAssignments = buildPublishedVocalAssignments();
      const { publishedVocalAssignments } = await syncPlanSnapshot(
        plan,
        draftPublishedVocalAssignments,
      );
      setVocalAssignments(publishedVocalAssignments);
      // Push current plan so UP can load the setlist
      // Sync full song content alongside the plan
      const songsToSync = plan.songs
        .map((s) => {
          const libSong = library.find((l) => l.id === s.songId) || {};
          return { ...libSong, ...s, id: s.songId };
        })
        .filter((s) => s.id);
      if (songsToSync.length > 0) {
        fetch(`${SYNC_URL}/sync/library-push`, {
          method: "POST",
          headers: syncHeaders(),
          body: JSON.stringify({ songs: songsToSync }),
        }).catch(() => {});
      }
      // Signal UP to open this service
      await fetch(`${SYNC_URL}/sync/playback-trigger`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({ serviceId: resolvedServiceId }),
      });
      Alert.alert(
        "✅ Sent to Playback",
        "Open Ultimate Playback — the setlist will load automatically.",
      );
    } catch (_e) {
      Alert.alert("Sync Error", "Could not reach sync server.");
    }
  }

  // ── Loading / not found ────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#818CF8" size="large" />
      </View>
    );
  }

  if (!service) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>No service selected.</Text>
        <Text
          style={[
            styles.notFoundText,
            { fontSize: 13, color: "#4B5563", marginTop: 8, marginBottom: 20 },
          ]}
        >
          Open the Calendar, tap a service date, then tap "Open" to load a
          service plan.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate("Calendar")}
          style={[
            styles.backBtn,
            { backgroundColor: "#4F46E5", borderRadius: 12, marginBottom: 10 },
          ]}
        >
          <Text style={[styles.backBtnText, { color: "#fff" }]}>
            Open Calendar →
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Text style={styles.backBtnText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isLocked = service.status === "locked";
  const statusColor = STATUS_COLORS[service.status] || STATUS_COLORS.draft;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── Service Header ─────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {service.title}
            </Text>
            <Text style={styles.headerMeta}>
              {toDisplay(service.date)} · {service.time} · {service.serviceType}
            </Text>
            {service.created_by_name ? (
              <Text style={styles.headerCreatedBy}>
                👤 Created by {service.created_by_name}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColor + "22", borderColor: statusColor },
            ]}
          >
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {STATUS_LABELS[service.status] || "🟡 Draft"}
            </Text>
          </View>
        </View>

        {/* Status quick-change (only when not locked, or allow unlock) */}
        <View style={styles.statusRow}>
          <Text style={styles.statusRowLabel}>Status:</Text>
          {STATUS_CYCLE.map((s) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.statusPill,
                service.status === s && {
                  backgroundColor: STATUS_COLORS[s],
                  borderColor: STATUS_COLORS[s],
                },
              ]}
              onPress={() => handleStatusChange(s)}
            >
              <Text
                style={[
                  styles.statusPillText,
                  service.status === s && { color: "#fff" },
                ]}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Tab Bar ─────────────────────────────────────────────── */}
      <TabBar active={tab} onChange={setTab} />
      {tab === "setlist" && (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Setlist <Text style={styles.count}>({plan.songs.length})</Text>
            </Text>
            {!isLocked && (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => {
                  setSongSearch("");
                  setSongModal(true);
                }}
              >
                <Text style={styles.addBtnText}>+ Add Song</Text>
              </TouchableOpacity>
            )}
          </View>

          {plan.songs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No songs yet. Tap "+ Add Song" to build the setlist.
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate("Library")}
                style={styles.emptyLink}
              >
                <Text style={styles.emptyLinkText}>Go to Library →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            plan.songs.map((item, idx) => (
              <SongRow
                key={item.id}
                item={item}
                index={idx}
                onRemove={() => handleRemoveSong(item.id)}
                onKeyEdit={handleKeyEdit}
                onPress={() =>
                  navigation.navigate("SongPlanDetail", {
                    serviceId: resolvedServiceId,
                    itemId: item.id,
                  })
                }
              />
            ))
          )}

          {/* Readiness hints — auto-surfaces when song themes are detected */}
          {readinessHints.length > 0 && (
            <View style={styles.hintsCard}>
              <TouchableOpacity
                style={styles.hintsHeader}
                onPress={() => setHintsExpanded((e) => !e)}
                activeOpacity={0.7}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Text style={styles.hintsHeaderIcon}>✦</Text>
                  <Text style={styles.hintsHeaderTitle}>Readiness Hints</Text>
                  {readinessHints.every((i) => i.done) && (
                    <View style={styles.hintsDoneBadge}>
                      <Text style={styles.hintsDoneBadgeText}>✓ All set</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.hintsChevron}>
                  {hintsExpanded ? "∧" : "∨"}
                </Text>
              </TouchableOpacity>

              {hintsExpanded && (
                <View style={styles.hintsBody}>
                  {detectedThemes.length > 0 && (
                    <Text style={styles.hintsThemeText}>
                      Based on:{" "}
                      <Text style={styles.hintsThemeHighlight}>
                        {detectedThemes
                          .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
                          .join(", ")}
                      </Text>
                    </Text>
                  )}
                  {readinessHints.map((hint) => (
                    <TouchableOpacity
                      key={hint.id}
                      style={[
                        styles.hintItem,
                        hint.done && styles.hintItemDone,
                      ]}
                      onPress={() => toggleHint(hint.id)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.hintItemCheck}>
                        {hint.done ? "✅" : "◇"}
                      </Text>
                      <Text
                        style={[
                          styles.hintItemLabel,
                          hint.done && styles.hintItemLabelDone,
                        ]}
                      >
                        {hint.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Part Sheets shortcut */}
          {plan.songs.length > 0 && (
            <TouchableOpacity
              style={styles.partSheetsBtn}
              onPress={() => {
                const setlist = plan.songs.map((item) => {
                  const libSong = library.find((l) => l.id === item.songId);
                  if (!libSong) return { id: item.songId, title: item.title || "Song" };
                  // Content (lyrics, charts) from library — they have the full text.
                  // Service-specific overrides (transposedKey, tempo) from item.
                  return {
                    ...libSong,
                    ...item,
                    id: item.songId,
                    // Never let an empty item field blank out library content:
                    lyrics: (item.lyrics || "").trim() || libSong.lyrics || "",
                    chordChart: (item.chordChart || "").trim() || libSong.chordChart || "",
                    instrumentNotes: {
                      ...(libSong.instrumentNotes || {}),
                      ...(item.instrumentNotes || {}),
                    },
                    key: item.transposedKey || item.key || libSong.key || "",
                  };
                });
                navigation.navigate("PartSheet", {
                  songs: setlist,
                  serviceName: service?.title || service?.name || "Service",
                  role: "vocals",
                  teamMembers: plan.team || [],
                });
              }}
            >
              <Text style={styles.partSheetsBtnText}>📋 View Part Sheets</Text>
            </TouchableOpacity>
          )}

          {/* Download All Stems */}
          {plan.songs.length > 0 && (
            <TouchableOpacity
              style={[
                styles.downloadStemsBtn,
                downloadingStems && { opacity: 0.7 },
              ]}
              onPress={handleDownloadAllStems}
              disabled={downloadingStems}
            >
              {downloadingStems ? (
                <View style={styles.downloadStemsBtnInner}>
                  <ActivityIndicator
                    size="small"
                    color="#A78BFA"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.downloadStemsBtnText} numberOfLines={1}>
                    {stemDownloadMsg || "Downloading…"}
                  </Text>
                </View>
              ) : (
                <Text style={styles.downloadStemsBtnText}>
                  📥 Download Stems to Device
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Notes */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => {
                setEditNotes(plan.notes || "");
                setNotesModal(true);
              }}
            >
              <Text style={styles.addBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.notesBox}>
            <Text style={styles.notesText}>
              {plan.notes
                ? plan.notes
                : "No notes. Tap Edit to add service notes."}
            </Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {tab === "team" && (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Team <Text style={styles.count}>({plan.team.length})</Text>
            </Text>
            {!isLocked && (
              <>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => {
                    setSelectedRole("");
                    setPersonSearch("");
                    setTeamModal(true);
                  }}
                >
                  <Text style={styles.addBtnText}>+ Assign</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.suggestBtn, isSuggesting && { opacity: 0.5 }]}
                  onPress={handleSuggestTeam}
                  disabled={isSuggesting}
                >
                  <Text style={styles.suggestBtnText}>
                    {isSuggesting ? "…" : "🧠 Suggest"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {blockedMemberCount > 0 && (
            <View style={styles.conflictBanner}>
              <Text style={styles.conflictBannerText}>
                ⚠️ {blockedMemberCount} team member(s) marked unavailable on{" "}
                {toDisplay(service.date)}. Assignments with ⚠️ are potentially
                conflicted.
              </Text>
            </View>
          )}

          {plan.team.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No team assigned. Tap "+ Assign" to add members.
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate("PeopleRoles")}
                style={styles.emptyLink}
              >
                <Text style={styles.emptyLinkText}>
                  Manage People & Roles →
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            ROLE_OPTIONS.filter((role) => teamByRole[role]).map((role) => (
              <View key={role} style={styles.roleGroup}>
                <Text style={styles.roleGroupLabel}>{formatRoleLabel(role)}</Text>
                {teamByRole[role].map((a) => {
                  const person = findAssignedPerson(people, a);
                  const resp = resolveTeamResponseMeta(
                    a,
                    person,
                    assignmentResponses,
                  );
                  const isBlocked = findBlockingEntryForPerson(
                    person || a,
                    blockedEntries,
                  );
                  const pStats   = brainStats[a.personId] || {};
                  const roleCount = (pStats.byRole || {})[a.role] || 0;
                  return (
                  <TeamRow
                    key={a.id}
                    assignment={a}
                    isBlocked={Boolean(isBlocked)}
                    onRemove={() => handleRemoveAssignment(a.id)}
                    respStatus={resp.status}
                    declineReason={resp.declineReason}
                    servedCount={roleCount}
                    lastServed={pStats.lastServed || ''}
                  />
                  );
                })}
              </View>
            ))
          )}

          {plan.team.length > 0 && (
            <TouchableOpacity
              style={styles.publishBtn}
              onPress={handlePublishToTeam}
            >
              <Text style={styles.publishBtnText}>📡 Publish to Team</Text>
            </TouchableOpacity>
          )}

          {plan.songs.length > 0 && (
            <TouchableOpacity
              style={styles.openRehearsalBtn}
              onPress={handleOpenInRehearsal}
            >
              <Text style={styles.openRehearsalBtnText}>
                🎛️ ARM & Open Rehearsal
              </Text>
            </TouchableOpacity>
          )}

          {plan.songs.length > 0 && (
            <TouchableOpacity
              style={styles.openPlaybackBtn}
              onPress={handleOpenInPlayback}
            >
              <Text style={styles.openPlaybackBtnText}>
                ▶ Open in Playback →
              </Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {tab === "vocals" && (
        <View style={{ flex: 1 }}>
          {/* ── View toggle: By Song / By Member ─────────────────── */}
          <View style={styles.vocalViewToggleRow}>
            <TouchableOpacity
              style={[
                styles.vocalViewBtn,
                vocalView === "song" && styles.vocalViewBtnActive,
              ]}
              onPress={() => setVocalView("song")}
            >
              <Text
                style={[
                  styles.vocalViewBtnText,
                  vocalView === "song" && styles.vocalViewBtnTextActive,
                ]}
              >
                By Song
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.vocalViewBtn,
                vocalView === "member" && styles.vocalViewBtnActive,
              ]}
              onPress={() => {
                setVocalView("member");
                setSelectedMember(null);
              }}
            >
              <Text
                style={[
                  styles.vocalViewBtnText,
                  vocalView === "member" && styles.vocalViewBtnTextActive,
                ]}
              >
                By Member
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── SATB / Voice # mode toggle (shared) ──────────────── */}
          <View style={styles.vocalModeRow}>
            <TouchableOpacity
              style={[
                styles.vocalModeBtn,
                vocalMode === "satb" && styles.vocalModeBtnActive,
              ]}
              onPress={() => setVocalMode("satb")}
            >
              <Text
                style={[
                  styles.vocalModeBtnText,
                  vocalMode === "satb" && styles.vocalModeBtnTextActive,
                ]}
              >
                SATB
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.vocalModeBtn,
                vocalMode === "voice" && styles.vocalModeBtnActive,
              ]}
              onPress={() => setVocalMode("voice")}
            >
              <Text
                style={[
                  styles.vocalModeBtnText,
                  vocalMode === "voice" && styles.vocalModeBtnTextActive,
                ]}
              >
                Voice #
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Auto-Assign All Songs by Role ─────────────────────── */}
          {vocalView === "song" && plan.songs.length > 0 && (
            <TouchableOpacity
              style={styles.autoAssignAllBtn}
              onPress={() => handleAutoAssignRoles("all")}
            >
              <Text style={styles.autoAssignAllBtnText}>
                🎙 Auto-Assign All Songs by Role
              </Text>
            </TouchableOpacity>
          )}

          {/* ════════════════════════════════════════════════════════
              BY MEMBER — list
          ════════════════════════════════════════════════════════ */}
          {vocalView === "member" && !selectedMember && (
            <ScrollView
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.vocalSubtitle}>
                Select a member to assign their vocal parts across all songs at
                once.
              </Text>

              {plan.team.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    Add team members in the Team tab first.
                  </Text>
                </View>
              ) : (
                plan.team.map((member) => {
                  const assigned = getAssignedSongsForMember(
                    member.personId || member.id,
                  );
                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={styles.memberCard}
                      onPress={() => setSelectedMember(member)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberCardName}>{member.name}</Text>
                        <Text style={styles.memberCardRole}>{formatRoleLabel(member.role)}</Text>
                        {assigned.length > 0 && (
                          <Text
                            style={styles.memberCardAssigned}
                            numberOfLines={1}
                          >
                            {assigned.map((s) => s.title || "—").join("  ·  ")}
                          </Text>
                        )}
                      </View>
                      <View style={styles.memberCardRight}>
                        {assigned.length > 0 && (
                          <View style={styles.memberCardCountBadge}>
                            <Text style={styles.memberCardCountText}>
                              🎤 {assigned.length}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.memberCardArrow}>›</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          )}

          {/* ════════════════════════════════════════════════════════
              BY MEMBER — member detail
          ════════════════════════════════════════════════════════ */}
          {vocalView === "member" && !!selectedMember && (
            <ScrollView
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
            >
              {/* Back + member header */}
              <TouchableOpacity
                style={styles.memberBackBtn}
                onPress={() => setSelectedMember(null)}
              >
                <Text style={styles.memberBackBtnText}>‹ All Members</Text>
              </TouchableOpacity>

              <View style={styles.memberDetailHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberDetailName}>
                    {selectedMember.name}
                  </Text>
                  <Text style={styles.memberDetailRole}>
                    {selectedMember.role}
                  </Text>
                </View>
                <View style={styles.memberDetailBadge}>
                  <Text style={styles.memberDetailBadgeText}>
                    🎤{" "}
                    {
                      getAssignedSongsForMember(
                        selectedMember.personId || selectedMember.id,
                      ).length
                    }{" "}
                    songs
                  </Text>
                </View>
              </View>

              <Text style={styles.memberDetailHint}>
                Tap a part to assign — tap the active part to remove it.
              </Text>

              {plan.songs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No songs in setlist yet.</Text>
                </View>
              ) : (
                plan.songs.map((item, idx) => {
                  const libSong = library.find((l) => l.id === item.songId);
                  const memberId = selectedMember.personId || selectedMember.id;
                  const currentPart = getMemberPartForSong(
                    memberId,
                    item.songId,
                  );
                  const parts = vocalMode === "satb" ? SATB_PARTS : VOICE_PARTS;
                  const activePart = parts.find((p) => p.key === currentPart);

                  return (
                    <View key={item.id} style={styles.memberSongRow}>
                      {/* Song info */}
                      <View style={styles.memberSongInfo}>
                        <View style={styles.songIndexSmall}>
                          <Text style={styles.songIndexText}>{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={styles.memberSongTitle}
                            numberOfLines={1}
                          >
                            {item.title || libSong?.title || "Untitled"}
                          </Text>
                          <View style={styles.memberSongMetaRow}>
                            <Text style={styles.memberSongMeta}>
                              Key:{" "}
                              {item.transposedKey ||
                                item.key ||
                                libSong?.key ||
                                "—"}
                            </Text>
                            {activePart && (
                              <View
                                style={[
                                  styles.memberActivePill,
                                  {
                                    backgroundColor: activePart.color + "33",
                                    borderColor: activePart.color,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.memberActivePillText,
                                    { color: activePart.color },
                                  ]}
                                >
                                  {activePart.label}
                                </Text>
                                {/* Key badge for this part */}
                                <TouchableOpacity
                                  onPress={() => {
                                    setVocalKeyTarget({
                                      songId: item.songId,
                                      partKey: currentPart,
                                    });
                                    setVocalKeyModal(true);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.memberPartKeyBadge,
                                      { color: activePart.color },
                                    ]}
                                  >
                                    {"  "}
                                    {vocalAssignments[item.songId]?.[
                                      currentPart
                                    ]?.key || "—"}{" "}
                                    ▾
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      {/* Part chips */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.partChipsScroll}
                        contentContainerStyle={{ gap: 6, paddingRight: 8 }}
                      >
                        {currentPart !== null && (
                          <TouchableOpacity
                            style={styles.partChipNone}
                            onPress={() =>
                              handleMemberPartAssign(
                                selectedMember,
                                item.songId,
                                null,
                              )
                            }
                          >
                            <Text style={styles.partChipNoneText}>✕</Text>
                          </TouchableOpacity>
                        )}
                        {parts.map((part) => {
                          const active = currentPart === part.key;
                          return (
                            <TouchableOpacity
                              key={part.key}
                              style={[
                                styles.partChip,
                                { borderColor: part.color },
                                active && { backgroundColor: part.color },
                              ]}
                              onPress={() =>
                                handleMemberPartAssign(
                                  selectedMember,
                                  item.songId,
                                  active ? null : part.key,
                                )
                              }
                              activeOpacity={0.75}
                            >
                              <Text
                                style={[
                                  styles.partChipText,
                                  { color: active ? "#FFFFFF" : part.color },
                                ]}
                              >
                                {part.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      {/* Personal notes shortcut */}
                      {currentPart && (
                        <TouchableOpacity
                          style={styles.memberNoteRow}
                          onPress={() => {
                            setVocalNotesTarget({
                              songId: item.songId,
                              partKey: currentPart,
                            });
                            setVocalNotesText(
                              vocalAssignments[item.songId]?.[currentPart]
                                ?.notes || "",
                            );
                            setVocalNotesModal(true);
                          }}
                        >
                          <Text
                            style={[
                              styles.vocalNotePreview,
                              vocalAssignments[item.songId]?.[currentPart]
                                ?.notes && styles.vocalNotePreviewFilled,
                            ]}
                            numberOfLines={1}
                          >
                            {vocalAssignments[item.songId]?.[currentPart]?.notes
                              ? `📝 ${vocalAssignments[item.songId][currentPart].notes}`
                              : "📝 Add licks / cue notes..."}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          )}

          {/* ════════════════════════════════════════════════════════
              BY SONG view
          ════════════════════════════════════════════════════════ */}
          {vocalView === "song" && (
            <ScrollView
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
            >
              {plan.songs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    Add songs to the Setlist first, then assign vocal parts
                    here.
                  </Text>
                </View>
              ) : (
                plan.songs.map((item, idx) => {
                  const libSong = library.find((l) => l.id === item.songId);
                  const parts = vocalMode === "satb" ? SATB_PARTS : VOICE_PARTS;
                  const songAssign = vocalAssignments[item.songId] || {};
                  const assignedCount = Object.keys(songAssign).length;

                  // Content availability
                  const hasLyrics = !!(
                    item.lyrics ||
                    libSong?.lyrics ||
                    ""
                  ).trim();
                  const hasChart = !!(
                    item.chordChart ||
                    libSong?.chordChart ||
                    ""
                  ).trim();
                  const hasCues = !!(libSong?.cues || libSong?.role_content?.vocals?.cues);
                  const allContent = hasLyrics && hasChart && hasCues;

                  return (
                    <View key={item.id} style={styles.vocalSongCard}>
                      {/* ── Song header ─────────────────────────────── */}
                      <View style={styles.vocalSongHeader}>
                        <View style={styles.songIndexSmall}>
                          <Text style={styles.songIndexText}>{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.vocalSongTitle} numberOfLines={1}>
                            {item.title || libSong?.title || "Untitled"}
                          </Text>
                          <Text style={styles.vocalSongMeta}>
                            {"Base key: "}
                            <Text style={styles.vocalSongKey}>
                              {item.transposedKey ||
                                item.key ||
                                libSong?.key ||
                                "—"}
                            </Text>
                            {libSong?.bpm ? `  ·  ${libSong.bpm} BPM` : ""}
                          </Text>
                        </View>
                        {assignedCount > 0 && (
                          <View style={styles.vocalCountBadge}>
                            <Text style={styles.vocalCountText}>
                              🎤 {assignedCount}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* ── Content status ──────────────────────────── */}
                      <View style={styles.vocalContentStatus}>
                        <View
                          style={[
                            styles.vocalContentBadge,
                            hasLyrics && styles.vocalContentBadgeOk,
                          ]}
                        >
                          <Text
                            style={[
                              styles.vocalContentBadgeText,
                              hasLyrics && styles.vocalContentBadgeTextOk,
                            ]}
                          >
                            📋 Lyrics
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.vocalContentBadge,
                            hasChart && styles.vocalContentBadgeOk,
                          ]}
                        >
                          <Text
                            style={[
                              styles.vocalContentBadgeText,
                              hasChart && styles.vocalContentBadgeTextOk,
                            ]}
                          >
                            🎸 Chart
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.vocalContentBadge,
                            hasCues && styles.vocalContentBadgeOk,
                          ]}
                        >
                          <Text
                            style={[
                              styles.vocalContentBadgeText,
                              hasCues && styles.vocalContentBadgeTextOk,
                            ]}
                          >
                            💡 Cues
                          </Text>
                        </View>
                      </View>
                      {!allContent && (
                        <View style={styles.vocalMissingNote}>
                          <Text style={styles.vocalMissingNoteText}>
                            ⬆ Missing content can be added from the Playback app
                            — lyrics, charts & cues sync automatically to the
                            song library.
                          </Text>
                        </View>
                      )}

                      {/* ── AI Generate + Auto-Assign row ───────────── */}
                      <View style={styles.vocalActionRow}>
                        <TouchableOpacity
                          style={[styles.aiGenBtn, { flex: 1 }]}
                          onPress={() => handleGenerateParts(item, libSong)}
                        >
                          <Text style={styles.aiGenBtnText}>
                            🤖 AI Harmony
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.autoAssignBtn, { flex: 1 }]}
                          onPress={() => handleAutoAssignRoles(item.songId)}
                        >
                          <Text style={styles.autoAssignBtnText}>
                            🎙 Auto-Assign
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* ── Part rows ───────────────────────────────── */}
                      {parts.map((part) => {
                        const assigned = songAssign[part.key];
                        return (
                          <View key={part.key} style={styles.vocalPartRow}>
                            {/* Part label pill */}
                            <View
                              style={[
                                styles.vocalPartPill,
                                {
                                  backgroundColor: part.color + "22",
                                  borderColor: part.color,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.vocalPartLabel,
                                  { color: part.color },
                                ]}
                              >
                                {part.label}
                              </Text>
                            </View>

                            {assigned ? (
                              <View style={styles.vocalAssignedCol}>
                                {/* Name + key + clear */}
                                <View style={styles.vocalAssignedRow}>
                                  <Text
                                    style={styles.vocalAssignedName}
                                    numberOfLines={1}
                                  >
                                    {assigned.name}
                                  </Text>
                                  {/* Key badge — tap to change */}
                                  <TouchableOpacity
                                    style={styles.vocalKeyBadge}
                                    onPress={() => {
                                      setVocalKeyTarget({
                                        songId: item.songId,
                                        partKey: part.key,
                                      });
                                      setVocalKeyModal(true);
                                    }}
                                  >
                                    <Text style={styles.vocalKeyBadgeText}>
                                      {assigned.key || "—"} ▾
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() =>
                                      handleVocalClear(item.songId, part.key)
                                    }
                                    hitSlop={{
                                      top: 8,
                                      bottom: 8,
                                      left: 8,
                                      right: 8,
                                    }}
                                  >
                                    <Text style={styles.vocalClearBtn}>✕</Text>
                                  </TouchableOpacity>
                                </View>
                                {/* Personal notes */}
                                <TouchableOpacity
                                  onPress={() => {
                                    setVocalNotesTarget({
                                      songId: item.songId,
                                      partKey: part.key,
                                    });
                                    setVocalNotesText(assigned.notes || "");
                                    setVocalNotesModal(true);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.vocalNotePreview,
                                      assigned.notes &&
                                        styles.vocalNotePreviewFilled,
                                    ]}
                                    numberOfLines={2}
                                  >
                                    {assigned.notes
                                      ? `📝 ${assigned.notes}`
                                      : "📝 Add licks / patterns / cue notes..."}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={styles.vocalAssignBtn}
                                onPress={() => {
                                  setVocalPickerSongId(item.songId);
                                  setVocalPickerPart(part.key);
                                  setVocalSearch("");
                                  setVocalPickerModal(true);
                                }}
                              >
                                <Text style={styles.vocalAssignBtnText}>
                                  + Assign
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  );
                })
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Vocal Picker Modal ─────────────────────────────────── */}
      <Modal
        visible={vocalPickerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setVocalPickerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Assign{" "}
                  {[...SATB_PARTS, ...VOICE_PARTS].find(
                    (p) => p.key === vocalPickerPart,
                  )?.label || vocalPickerPart}
                </Text>
                <Text style={styles.vocalPickerSongName} numberOfLines={1}>
                  {plan.songs.find((s) => s.songId === vocalPickerSongId)
                    ?.title || ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setVocalPickerModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              value={vocalSearch}
              onChangeText={setVocalSearch}
              placeholder="Search team members..."
              placeholderTextColor="#4B5563"
              autoCapitalize="none"
            />

            <ScrollView showsVerticalScrollIndicator={false}>
              {vocalPickerPeople.length === 0 ? (
                <Text style={styles.emptyText}>
                  No vocal team members found. Add vocalists in the Team tab
                  first.
                </Text>
              ) : (
                vocalPickerPeople.map((member) => (
                  <TouchableOpacity
                    key={member.id || member.personId}
                    style={styles.pickRow}
                    onPress={() => handleVocalAssign(member)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickRowTitle}>{member.name}</Text>
                      <Text style={styles.pickRowMeta}>
                        {formatRoleLabel(member.role) || "Vocalist"}
                      </Text>
                    </View>
                    <Text style={styles.pickRowAdd}>Assign</Text>
                  </TouchableOpacity>
                ))
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Key Picker Modal ───────────────────────────────────── */}
      <Modal
        visible={vocalKeyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setVocalKeyModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setVocalKeyModal(false)}
        >
          <View style={styles.keyPickerSheet}>
            <Text style={styles.keyPickerTitle}>Select Key</Text>
            <Text style={styles.keyPickerSub}>
              {plan.songs.find((s) => s.songId === vocalKeyTarget.songId)
                ?.title || ""}
              {"  ·  "}
              {[...SATB_PARTS, ...VOICE_PARTS].find(
                (p) => p.key === vocalKeyTarget.partKey,
              )?.label || ""}
            </Text>
            <View style={styles.keyPickerGrid}>
              {MUSIC_KEYS.map((k) => {
                const currentKey =
                  vocalAssignments[vocalKeyTarget.songId]?.[
                    vocalKeyTarget.partKey
                  ]?.key;
                return (
                  <TouchableOpacity
                    key={k}
                    style={[
                      styles.keyPickerBtn,
                      currentKey === k && styles.keyPickerBtnActive,
                    ]}
                    onPress={() =>
                      handleVocalSetKey(
                        vocalKeyTarget.songId,
                        vocalKeyTarget.partKey,
                        k,
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.keyPickerBtnText,
                        currentKey === k && styles.keyPickerBtnTextActive,
                      ]}
                    >
                      {k}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Personal Notes Modal ────────────────────────────────── */}
      <Modal
        visible={vocalNotesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setVocalNotesModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Personal Notes</Text>
                <Text style={styles.keyPickerSub}>
                  {[...SATB_PARTS, ...VOICE_PARTS].find(
                    (p) => p.key === vocalNotesTarget.partKey,
                  )?.label || ""}
                  {"  ·  "}
                  {plan.songs.find((s) => s.songId === vocalNotesTarget.songId)
                    ?.title || ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setVocalNotesModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.vocalNotesHint}>
              Licks, patterns, cue words, runs, dynamics — visible only in your
              part on the app.
            </Text>
            <TextInput
              style={[
                styles.fieldInput,
                { height: 130, textAlignVertical: "top", marginTop: 10 },
              ]}
              value={vocalNotesText}
              onChangeText={setVocalNotesText}
              placeholder='e.g. "Soft on verse 1, harmony on bar 8 — run: C–E–G–A"'
              placeholderTextColor="#4B5563"
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleVocalSaveNotes}
            >
              <Text style={styles.saveBtnText}>Save Notes</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── AI Vocal Parts Modal ────────────────────────────────── */}
      <Modal
        visible={aiPartsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setAiPartsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: "85%" }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>🤖 AI Harmony Parts</Text>
                <Text style={styles.keyPickerSub}>
                  {plan.songs.find((s) => s.songId === aiPartsSongId)?.title ||
                    ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAiPartsModal(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            {aiPartsLoading && (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text
                  style={{
                    color: "#9CA3AF",
                    marginTop: 12,
                    textAlign: "center",
                  }}
                >
                  Generating harmony guidance…{"\n"}This may take a few seconds.
                </Text>
              </View>
            )}

            {aiPartsError && !aiPartsLoading && (
              <View style={{ padding: 16, alignItems: "center" }}>
                <Text
                  style={{
                    color: "#EF4444",
                    textAlign: "center",
                    fontSize: 14,
                  }}
                >
                  ⚠️ {aiPartsError}
                </Text>
                {aiPartsError.includes("ANTHROPIC_API_KEY") && (
                  <Text
                    style={{
                      color: "#6B7280",
                      textAlign: "center",
                      fontSize: 12,
                      marginTop: 8,
                    }}
                  >
                    Ask your admin to add the Anthropic API key to the sync
                    server settings.
                  </Text>
                )}
              </View>
            )}

            {aiPartsResult && !aiPartsLoading && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
              >
                <Text
                  style={{
                    color: "#6B7280",
                    fontSize: 12,
                    marginBottom: 8,
                    fontStyle: "italic",
                  }}
                >
                  Tap "Apply" to copy guidance into a part's notes field.
                </Text>
                {/* Apply All button */}
                <TouchableOpacity
                  style={[styles.autoAssignAllBtn, { marginHorizontal: 0, marginBottom: 12 }]}
                  onPress={() => {
                    Object.entries(aiPartsResult.parts || {}).forEach(([label, guidance]) =>
                      handleApplyAiPart(label, guidance),
                    );
                    setAiPartsModal(false);
                  }}
                >
                  <Text style={styles.autoAssignAllBtnText}>✅ Apply All Guidance</Text>
                </TouchableOpacity>
                {Object.entries(aiPartsResult.parts || {}).map(
                  ([label, guidance]) => (
                    <View key={label} style={styles.aiPartResultRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.aiPartResultLabel}>{label}</Text>
                        <Text style={styles.aiPartResultText}>{guidance}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.aiApplyBtn}
                        onPress={() => handleApplyAiPart(label, guidance)}
                      >
                        <Text style={styles.aiApplyBtnText}>Apply</Text>
                      </TouchableOpacity>
                    </View>
                  ),
                )}
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Song Picker Modal ───────────────────────────────────── */}
      <Modal
        visible={songModal}
        transparent
        animationType="slide"
        onRequestClose={() => setSongModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Song</Text>
              <TouchableOpacity onPress={() => setSongModal(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              value={songSearch}
              onChangeText={setSongSearch}
              placeholder="Search songs..."
              placeholderTextColor="#4B5563"
              autoCapitalize="none"
            />
            <ScrollView showsVerticalScrollIndicator={false}>
              {filteredLibrary.length === 0 ? (
                <Text style={styles.emptyText}>
                  {library.length === 0
                    ? "No songs in library. Go to Library to add songs."
                    : "All library songs already added to this setlist."}
                </Text>
              ) : (
                filteredLibrary.map((song) => (
                  <TouchableOpacity
                    key={song.id}
                    style={styles.pickRow}
                    onPress={() => handleAddSong(song)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickRowTitle}>{song.title}</Text>
                      <Text style={styles.pickRowMeta}>
                        {song.artist ? `${song.artist} · ` : ""}
                        {song.originalKey || song.key || "—"} ·{" "}
                        {song.bpm || "—"} BPM
                      </Text>
                    </View>
                    <Text style={styles.pickRowAdd}>+ Add</Text>
                  </TouchableOpacity>
                ))
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Team Assign Modal ───────────────────────────────────── */}
      <Modal
        visible={teamModal}
        transparent
        animationType="slide"
        onRequestClose={() => setTeamModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, justifyContent: "flex-end" }}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Assign Team Member</Text>
                <TouchableOpacity onPress={() => setTeamModal(false)}>
                  <Text style={styles.modalClose}>Done</Text>
                </TouchableOpacity>
              </View>

              {/* Step 1: Pick a role */}
              <Text style={styles.modalSectionLabel}>1. Select Role</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 14 }}
              >
                {ROLE_OPTIONS.map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.rolePill,
                      selectedRole === role && styles.rolePillActive,
                    ]}
                    onPress={() => setSelectedRole(role)}
                  >
                    <Text
                      style={[
                        styles.rolePillText,
                        selectedRole === role && styles.rolePillTextActive,
                      ]}
                    >
                      {formatRoleLabel(role)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Step 2: Pick a person */}
              <Text style={styles.modalSectionLabel}>2. Select Person</Text>
              <TextInput
                style={styles.searchInput}
                value={personSearch}
                onChangeText={setPersonSearch}
                placeholder="Search people..."
                placeholderTextColor="#4B5563"
              />
              <ScrollView
                style={{ maxHeight: 280 }}
                showsVerticalScrollIndicator={false}
              >
                {filteredPeople.length === 0 ? (
                  <View>
                    <Text style={styles.emptyText}>
                      {selectedRole
                        ? `No members have "${selectedRole}" assigned to their profile.`
                        : "No members found."}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setTeamModal(false);
                        navigation.navigate("PeopleRoles");
                      }}
                      style={{ marginTop: 8 }}
                    >
                      <Text style={[styles.emptyText, { color: "#818CF8" }]}>
                        Edit roles in People & Roles →
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  filteredPeople.map((person) => {
                    const blockingEntry = findBlockingEntryForPerson(
                      person,
                      blockedEntries,
                    );
                    const isBlocked = Boolean(blockingEntry);
                    return (
                      <TouchableOpacity
                        key={person.id}
                        style={[styles.pickRow, isBlocked && { opacity: 0.55 }]}
                        onPress={() => handleAssignPerson(person)}
                        disabled={isBlocked}
                      >
                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <Text style={styles.pickRowTitle}>
                              {person.name}
                            </Text>
                            {isBlocked && (
                              <View style={styles.blockedBadge}>
                                <Text style={styles.blockedBadgeText}>
                                  ⚠️ Unavailable
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.pickRowMeta}>
                            {(person.roles || []).join(", ") || "No roles set"}
                          </Text>
                          {isBlocked && (
                            <Text style={styles.pickRowMeta}>
                              {blockingEntry?.reason
                                ? `Unavailable: ${blockingEntry.reason}`
                                : "Unavailable on this date"}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.pickRowAdd}>
                          {isBlocked ? "Blocked" : "Assign"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Notes Modal ─────────────────────────────────────────── */}
      <Modal
        visible={notesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setNotesModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Service Notes</Text>
              <TouchableOpacity onPress={() => setNotesModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[
                styles.fieldInput,
                { height: 140, textAlignVertical: "top" },
              ]}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Add notes for this service..."
              placeholderTextColor="#4B5563"
              multiline
              autoFocus
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveNotes}>
              <Text style={styles.saveBtnText}>Save Notes</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#020617",
  },
  scroll: { padding: 16, paddingTop: 12 },

  // Header
  header: {
    backgroundColor: "#0B1120",
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
    padding: 16,
    paddingBottom: 12,
    marginBottom: 10,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 10,
  },
  headerTitle: { color: "#F9FAFB", fontSize: 20, fontWeight: "900" },
  headerMeta: { color: "#6B7280", fontSize: 12, marginTop: 3 },
  headerCreatedBy: { color: "#4B5563", fontSize: 11, marginTop: 2, fontStyle: "italic" },
  statusBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  statusBadgeText: { fontSize: 12, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusRowLabel: { color: "#6B7280", fontSize: 12, fontWeight: "600" },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "transparent",
  },
  statusPillText: { color: "#9CA3AF", fontSize: 12, fontWeight: "700" },

  // Section
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#E5E7EB",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  count: { color: "#6B7280", fontWeight: "400", fontSize: 13 },

  addBtn: {
    backgroundColor: "#1E3A5F",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
  },
  addBtnText: { color: "#60A5FA", fontWeight: "800", fontSize: 12 },
  suggestBtn: {
    backgroundColor: "#1A0A2E",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#7C3AED",
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  suggestBtnText: { color: "#A78BFA", fontWeight: "800", fontSize: 12 },
  servedBadge: {
    backgroundColor: "#0F2A1A",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#10B981",
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  servedBadgeText: { color: "#34D399", fontSize: 9, fontWeight: "800" },
  publishBtn: {
    backgroundColor: "#0F3D2E",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#10B981",
    marginTop: 20,
  },
  publishBtnText: { color: "#10B981", fontWeight: "700", fontSize: 15 },
  openRehearsalBtn: {
    backgroundColor: "#1E1B4B",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#6366F1",
    marginTop: 10,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  openRehearsalBtnText: { color: "#A5B4FC", fontWeight: "800", fontSize: 15 },
  openPlaybackBtn: {
    backgroundColor: "#0C1F12",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#10B981",
    marginTop: 10,
  },
  openPlaybackBtnText: { color: "#34D399", fontWeight: "800", fontSize: 15 },
  partSheetsBtn: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#374151",
    marginTop: 4,
    marginBottom: 4,
  },
  partSheetsBtnText: { color: "#9CA3AF", fontWeight: "700", fontSize: 14 },
  downloadStemsBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3730A3",
    marginTop: 4,
    marginBottom: 16,
  },
  downloadStemsBtnInner: { flexDirection: "row", alignItems: "center" },
  downloadStemsBtnText: { color: "#A78BFA", fontWeight: "700", fontSize: 14 },

  // Song row
  songRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#0B1120",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  songIndex: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
  },
  songIndexText: { color: "#9CA3AF", fontSize: 13, fontWeight: "700" },
  songInfo: { flex: 1 },
  songTitle: { color: "#F9FAFB", fontSize: 15, fontWeight: "800" },
  songMeta: { color: "#6B7280", fontSize: 12, marginTop: 3 },
  keyEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  keyInput: {
    flex: 1,
    backgroundColor: "#1F2937",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    color: "#F9FAFB",
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  keyEditSave: {
    backgroundColor: "#4F46E5",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  keyEditSaveText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  keyEditLink: {
    color: "#818CF8",
    fontSize: 12,
    marginTop: 5,
    fontWeight: "600",
  },

  // Song detail badges
  badge: {
    backgroundColor: "#1E1B4B",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
    marginTop: 1,
  },
  badgeText: { color: "#A5B4FC", fontSize: 11, fontWeight: "700" },

  // Team row
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0B1120",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 12,
    marginBottom: 6,
    gap: 10,
  },
  teamRowBlocked: { borderColor: "#7F1D1D", backgroundColor: "#0D0202" },
  teamRole: {
    color: "#818CF8",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  teamPersonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  teamName: { color: "#F9FAFB", fontSize: 15, fontWeight: "700" },

  blockedBadge: {
    backgroundColor: "#7F1D1D",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  blockedBadgeText: { color: "#FCA5A5", fontSize: 10, fontWeight: "700" },

  roleGroup: { marginBottom: 12 },
  roleGroupLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },

  conflictBanner: {
    backgroundColor: "#431407",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#92400E",
    padding: 10,
    marginBottom: 12,
  },
  conflictBannerText: { color: "#FDE68A", fontSize: 12, lineHeight: 17 },

  // Details tab
  fieldLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 14,
  },
  fieldInput: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    color: "#F9FAFB",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
    marginRight: 8,
  },
  typePillActive: { backgroundColor: "#312E81", borderColor: "#4F46E5" },
  typePillText: { color: "#9CA3AF", fontWeight: "700", fontSize: 13 },
  typePillTextActive: { color: "#A5B4FC" },
  saveBtn: {
    backgroundColor: "#16A34A",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  unlockBtn: {
    backgroundColor: "#1F2937",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#374151",
  },
  unlockBtnText: { color: "#E5E7EB", fontWeight: "800" },
  divider: { height: 1, backgroundColor: "#1F2937", marginVertical: 20 },
  deleteBtn: {
    borderWidth: 1,
    borderColor: "#7F1D1D",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  deleteBtnText: { color: "#EF4444", fontWeight: "800" },

  // Notes
  notesBox: {
    backgroundColor: "#0B1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 12,
    minHeight: 60,
  },
  notesText: { color: "#6B7280", fontSize: 13, lineHeight: 19 },

  // Empty state
  emptyState: { paddingVertical: 32, alignItems: "center" },
  emptyText: {
    color: "#4B5563",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  emptyLink: { marginTop: 10 },
  emptyLinkText: { color: "#818CF8", fontSize: 13, fontWeight: "700" },

  // Not found
  notFoundText: { color: "#6B7280", fontSize: 16, marginBottom: 16 },
  backBtn: {
    backgroundColor: "#1F2937",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backBtnText: { color: "#E5E7EB", fontWeight: "700" },

  // Remove button (shared)
  removeBtn: {
    backgroundColor: "#1F2937",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  removeBtnText: { color: "#EF4444", fontWeight: "800", fontSize: 12 },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { color: "#F9FAFB", fontSize: 18, fontWeight: "900" },
  modalClose: { color: "#818CF8", fontWeight: "700", fontSize: 14 },
  modalSectionLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },

  searchInput: {
    backgroundColor: "#1F2937",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    color: "#F9FAFB",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },

  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
    gap: 10,
  },
  pickRowTitle: { color: "#F9FAFB", fontSize: 14, fontWeight: "700" },
  pickRowMeta: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  pickRowAdd: { color: "#4ADE80", fontWeight: "800", fontSize: 13 },

  // Readiness hints panel
  hintsCard: {
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#4338CA33",
    backgroundColor: "#0D0B1C",
    overflow: "hidden",
  },
  hintsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  hintsHeaderIcon: { color: "#818CF8", fontSize: 13 },
  hintsHeaderTitle: { color: "#A5B4FC", fontWeight: "800", fontSize: 13 },
  hintsChevron: { color: "#4B5563", fontSize: 14 },
  hintsDoneBadge: {
    backgroundColor: "#052E16",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#166534",
  },
  hintsDoneBadgeText: { color: "#4ADE80", fontSize: 10, fontWeight: "800" },
  hintsBody: { paddingHorizontal: 12, paddingBottom: 12 },
  hintsThemeText: {
    color: "#4B5563",
    fontSize: 11,
    marginBottom: 8,
    lineHeight: 16,
  },
  hintsThemeHighlight: { color: "#818CF8", fontWeight: "700" },
  hintItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
  },
  hintItemDone: {},
  hintItemCheck: { fontSize: 14, marginTop: 1 },
  hintItemLabel: { color: "#C4B5FD", fontSize: 13, flex: 1, lineHeight: 18 },
  hintItemLabelDone: { color: "#4B5563", textDecorationLine: "line-through" },

  // Role picker chips in team modal
  rolePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
    marginRight: 8,
  },
  rolePillActive: { backgroundColor: "#312E81", borderColor: "#818CF8" },
  rolePillText: { color: "#9CA3AF", fontWeight: "700", fontSize: 12 },
  rolePillTextActive: { color: "#A5B4FC" },

  // ── Vocal Parts tab ────────────────────────────────────────────────────────
  vocalHeader: { marginBottom: 10 },
  vocalSubtitle: {
    color: "#4B5563",
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },

  vocalModeRow: {
    flexDirection: "row",
    backgroundColor: "#0B1120",
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    gap: 3,
  },
  vocalModeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  vocalModeBtnActive: { backgroundColor: "#4F46E5" },
  vocalModeBtnText: { color: "#6B7280", fontWeight: "800", fontSize: 13 },
  vocalModeBtnTextActive: { color: "#FFFFFF" },

  vocalSongCard: {
    backgroundColor: "#080E1A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    marginBottom: 12,
    overflow: "hidden",
  },
  vocalSongHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  songIndexSmall: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
  },
  vocalSongTitle: { color: "#F1F5F9", fontSize: 14, fontWeight: "800" },
  vocalSongMeta: { color: "#4B5563", fontSize: 11, marginTop: 2 },
  vocalCountBadge: {
    backgroundColor: "#1E1B4B",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#4F46E5",
  },
  vocalCountText: { color: "#A5B4FC", fontSize: 11, fontWeight: "800" },

  vocalPartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "#0F172A",
  },
  vocalPartPill: {
    width: 80,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
  },
  vocalPartLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 0.2 },

  vocalAssignBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#020E1F",
    alignItems: "center",
  },
  vocalAssignBtnText: { color: "#3B82F6", fontSize: 12, fontWeight: "700" },

  vocalPickerSongName: { color: "#4B5563", fontSize: 11, marginTop: 2 },

  // ── View toggle (By Song / By Member)
  vocalViewToggleRow: {
    flexDirection: "row",
    backgroundColor: "#060D1E",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    padding: 10,
    gap: 8,
  },
  vocalViewBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
  },
  vocalViewBtnActive: { backgroundColor: "#1E1B4B", borderColor: "#6366F1" },
  vocalViewBtnText: { color: "#4B5563", fontWeight: "800", fontSize: 13 },
  vocalViewBtnTextActive: { color: "#A5B4FC" },

  // ── Member list cards
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#080E1A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 14,
    marginBottom: 8,
    gap: 10,
  },
  memberCardName: { color: "#F1F5F9", fontSize: 15, fontWeight: "800" },
  memberCardRole: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  memberCardAssigned: { color: "#4F46E5", fontSize: 11, marginTop: 4 },
  memberCardRight: { alignItems: "center", gap: 6 },
  memberCardCountBadge: {
    backgroundColor: "#1E1B4B",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#4F46E5",
  },
  memberCardCountText: { color: "#A5B4FC", fontSize: 11, fontWeight: "800" },
  memberCardArrow: { color: "#374151", fontSize: 22, fontWeight: "300" },

  // ── Member detail
  memberBackBtn: { marginBottom: 14 },
  memberBackBtnText: { color: "#6366F1", fontSize: 14, fontWeight: "700" },
  memberDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    padding: 14,
    backgroundColor: "#080E1A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  memberDetailName: { color: "#F1F5F9", fontSize: 18, fontWeight: "900" },
  memberDetailRole: { color: "#6B7280", fontSize: 13, marginTop: 2 },
  memberDetailBadge: {
    backgroundColor: "#1E1B4B",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#4F46E5",
  },
  memberDetailBadgeText: { color: "#A5B4FC", fontSize: 12, fontWeight: "800" },
  memberDetailHint: {
    color: "#374151",
    fontSize: 12,
    marginBottom: 12,
    marginTop: 6,
  },

  // ── Per-song row in member detail
  memberSongRow: {
    backgroundColor: "#080E1A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    marginBottom: 8,
    overflow: "hidden",
  },
  memberSongInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#0F172A",
  },
  memberSongTitle: { color: "#E2E8F0", fontSize: 13, fontWeight: "800" },
  memberSongMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    flexWrap: "wrap",
  },
  memberSongMeta: { color: "#4B5563", fontSize: 11 },
  memberActivePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  memberActivePillText: { fontSize: 10, fontWeight: "900" },
  memberPartKeyBadge: { fontSize: 10, fontWeight: "900" },
  memberNoteRow: { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 2 },

  // ── Part chips (in member detail song rows)
  partChipsScroll: { paddingHorizontal: 10, paddingVertical: 8 },
  partChipNone: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#0B1120",
    alignItems: "center",
    justifyContent: "center",
  },
  partChipNoneText: { color: "#6B7280", fontSize: 12, fontWeight: "800" },
  partChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  partChipText: { fontSize: 11, fontWeight: "800" },

  // Content status row
  vocalContentStatus: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  vocalContentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0B1120",
  },
  vocalContentBadgeOk: { borderColor: "#166534", backgroundColor: "#052E16" },
  vocalContentBadgeText: { color: "#374151", fontSize: 10, fontWeight: "700" },
  vocalContentBadgeTextOk: { color: "#4ADE80" },
  vocalMissingNote: {
    marginHorizontal: 12,
    marginBottom: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#0A0F1E",
    borderWidth: 1,
    borderColor: "#1E2A3A",
  },
  vocalMissingNoteText: { color: "#3B82F6", fontSize: 11, lineHeight: 16 },

  // AI Generate Parts button
  vocalActionRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 12,
  },
  aiGenBtn: {
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#1E1B4B",
    borderWidth: 1,
    borderColor: "#4F46E5",
    alignItems: "center",
  },
  aiGenBtnText: { color: "#A5B4FC", fontSize: 12, fontWeight: "700" },
  autoAssignBtn: {
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#052E16",
    borderWidth: 1,
    borderColor: "#16A34A",
    alignItems: "center",
  },
  autoAssignBtnText: { color: "#4ADE80", fontSize: 12, fontWeight: "700" },
  autoAssignAllBtn: {
    marginHorizontal: 12,
    marginBottom: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#052E16",
    borderWidth: 1,
    borderColor: "#16A34A",
    alignItems: "center",
  },
  autoAssignAllBtnText: { color: "#4ADE80", fontSize: 13, fontWeight: "800" },

  // AI Parts modal rows
  aiPartResultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  aiPartResultLabel: {
    color: "#C7D2FE",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 3,
  },
  aiPartResultText: { color: "#9CA3AF", fontSize: 12, lineHeight: 18 },
  aiApplyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: "#312E81",
    borderWidth: 1,
    borderColor: "#4F46E5",
    alignSelf: "flex-start",
  },
  aiApplyBtnText: { color: "#A5B4FC", fontSize: 12, fontWeight: "700" },

  // Song key highlight in header
  vocalSongKey: { color: "#A5B4FC", fontWeight: "900" },

  // Assigned column (name + key + notes stacked)
  vocalAssignedCol: { flex: 1, gap: 4 },
  vocalAssignedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  vocalAssignedName: {
    flex: 1,
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "700",
  },
  vocalClearBtn: { color: "#374151", fontSize: 16, paddingHorizontal: 4 },

  // Key badge inside assigned row
  vocalKeyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#1E1B4B",
    borderWidth: 1,
    borderColor: "#4F46E5",
  },
  vocalKeyBadgeText: { color: "#A5B4FC", fontSize: 11, fontWeight: "900" },

  // Personal notes preview
  vocalNotePreview: {
    color: "#374151",
    fontSize: 11,
    fontStyle: "italic",
    paddingLeft: 2,
  },
  vocalNotePreviewFilled: { color: "#94A3B8", fontStyle: "normal" },
  vocalNotesHint: {
    color: "#4B5563",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },

  // Key picker sheet (bottom sheet style)
  keyPickerSheet: {
    backgroundColor: "#0B1120",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  keyPickerTitle: {
    color: "#F1F5F9",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 3,
  },
  keyPickerSub: { color: "#4B5563", fontSize: 12, marginBottom: 16 },
  keyPickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  keyPickerBtn: {
    width: 52,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#060D1E",
  },
  keyPickerBtnActive: { backgroundColor: "#4F46E5", borderColor: "#6366F1" },
  keyPickerBtnText: { color: "#64748B", fontSize: 14, fontWeight: "800" },
  keyPickerBtnTextActive: { color: "#FFFFFF" },
});
