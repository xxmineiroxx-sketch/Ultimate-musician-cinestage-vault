/**
 * CentralAdminScreen — Central Worship Director dashboard.
 * Manages multiple church campuses: view campuses, cross-campus library,
 * and all team members across the organization.
 *
 * Tabs: Campuses | Library | People
 */
import React, { useState, useEffect, useCallback, useRef, useContext } from "react";
import { useAuth } from "../context/AuthContext";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  CINESTAGE_URL,
  SYNC_URL,
  syncHeaders,
  SYNC_ORG_ID,
  SYNC_SECRET_KEY,
  saveBranchConfig,
  clearBranchConfig,
} from "./config";

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = ["Campuses", "Library", "People"];

const LANGUAGES = ["English", "Spanish", "Portuguese", "Haitian Creole", "Other"];

const LANG_COLORS = {
  English: "#3B82F6",
  Spanish: "#EF4444",
  Portuguese: "#10B981",
  "Haitian Creole": "#F59E0B",
  Other: "#8B5CF6",
};

const ROLE_FILTER_OPTIONS = ["All", "Worship Leader", "Musician", "Vocalist", "Tech", "Pastor", "Admin"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysAgo(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    return diff;
  } catch {
    return null;
  }
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.charAt(0).toUpperCase();
}

function getLibraryGroupLabel(song = {}) {
  if (song?.shared || song?.scope === "shared" || song?._group === "Shared") {
    return "Shared";
  }

  const branchLabel = [
    song?._group,
    song?.campusName,
    song?.branchName,
    song?.campus,
    song?.branch,
    song?.orgName,
  ].find((value) => String(value || "").trim());

  return String(branchLabel || "Unassigned Branch").trim();
}

function normalizeAggregateLibraryPayload(data) {
  if (Array.isArray(data)) {
    return data.map((song) => ({
      ...song,
      _group: getLibraryGroupLabel(song),
    }));
  }

  if (data?.shared || data?.campuses) {
    const sharedItems = (data.shared || []).map((song) => ({
      ...song,
      shared: true,
      _group: "Shared",
    }));
    const campusItems = [];

    for (const [campusName, songs] of Object.entries(data.campuses || {})) {
      for (const song of songs || []) {
        campusItems.push({
          ...song,
          _group: getLibraryGroupLabel({ ...song, campusName }),
        });
      }
    }

    return [...sharedItems, ...campusItems];
  }

  return [];
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CentralAdminScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userRole } = useAuth();

  const [activeTab, setActiveTab] = useState(0); // 0=Campuses, 1=Library, 2=People
  const [orgName, setOrgName] = useState("Central Command");

  // ── Campuses tab state ──
  const [campuses, setCampuses] = useState([]);
  const [campusesLoading, setCampusesLoading] = useState(false);
  const [campusesError, setCampusesError] = useState(null);
  const [showAddCampus, setShowAddCampus] = useState(false);
  const [pushingLibrary, setPushingLibrary] = useState({}); // { [campusId]: bool }

  // Add Campus form
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newLang, setNewLang] = useState("English");
  const [creating, setCreating] = useState(false);
  const [newCreds, setNewCreds] = useState(null);

  // ── Library tab state ──
  const [libSongs, setLibSongs] = useState([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libError, setLibError] = useState(null);
  const [libSearch, setLibSearch] = useState("");
  const [sharingId, setSharingId] = useState(null);

  // ── People tab state ──
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState(null);
  const [roleFilter, setRoleFilter] = useState("All");
  const [selectedPerson, setSelectedPerson] = useState(null);

  // ── Invite modal state ──
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteTab, setInviteTab] = useState("single"); // "single" | "bulk"
  // Single invite
  const [invSingleName, setInvSingleName] = useState("");
  const [invSingleEmail, setInvSingleEmail] = useState("");
  const [invSingleRole, setInvSingleRole] = useState("member");
  const [invSingleCampus, setInvSingleCampus] = useState("");
  // Bulk CSV
  const [invCsvText, setInvCsvText] = useState("");
  const [invParsedRows, setInvParsedRows] = useState([]);
  const [showCsvInput, setShowCsvInput] = useState(false);
  // Shared sending state
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null); // { processed, created, existing, errors }

  // ── Load org name ──
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("um_org_name");
        if (stored) setOrgName(stored);
      } catch { /* keep default */ }
    })();
  }, []);

  // ── Load data based on active tab ──
  useEffect(() => {
    if (activeTab === 0) loadCampuses();
    else if (activeTab === 1) loadLibrary();
    else if (activeTab === 2) loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Tab 1: Campuses
  // ─────────────────────────────────────────────────────────────────────────────
  const loadCampuses = useCallback(async () => {
    setCampusesLoading(true);
    setCampusesError(null);
    try {
      const res = await fetch(`${CINESTAGE_URL}/api/orgs/children`, {
        headers: syncHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Expect: array of { id, name, city, language, songCount, peopleCount, lastActiveAt, orgId, secretKey }
      setCampuses(Array.isArray(data) ? data : []);
    } catch (err) {
      // Fallback: try the sync server branches endpoint
      try {
        const res2 = await fetch(`${SYNC_URL}/sync/branches`, {
          headers: syncHeaders(),
        });
        const data2 = await res2.json();
        const normalized = (Array.isArray(data2) ? data2 : []).map((b) => ({
          id: b.branchId || b.id,
          name: b.name,
          city: b.city || "",
          language: b.language || "English",
          songCount: b.songCount || 0,
          peopleCount: b.memberCount || 0,
          lastActiveAt: b.lastActiveAt || null,
          orgId: b.orgId,
          secretKey: b.secretKey,
        }));
        setCampuses(normalized);
      } catch {
        setCampusesError("Could not load campuses. Check your network connection.");
      }
    } finally {
      setCampusesLoading(false);
    }
  }, []);

  async function handleSwitchToCampus(campus) {
    if (!campus.orgId || !campus.secretKey) {
      Alert.alert(
        "Campus Credentials Missing",
        "This campus does not have stored credentials. Please re-add it.",
      );
      return;
    }
    Alert.alert(
      `Switch to ${campus.name}?`,
      "Your active org will change to this campus. You can switch back from the Organization screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            await saveBranchConfig(campus.orgId, campus.secretKey);
            navigation.reset({ index: 0, routes: [{ name: "Home" }] });
          },
        },
      ],
    );
  }

  async function handlePushLibrary(campus) {
    const id = campus.id;
    setPushingLibrary((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(
        `${CINESTAGE_URL}/api/orgs/children/${id}/push-library`,
        {
          method: "POST",
          headers: syncHeaders(),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      Alert.alert("Library Pushed", `Shared songs have been pushed to ${campus.name}.`);
    } catch {
      Alert.alert("Error", "Could not push library. Try again.");
    } finally {
      setPushingLibrary((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleCreateCampus() {
    const name = newName.trim();
    const city = newCity.trim();
    if (!name) {
      Alert.alert("Required", "Campus name is required.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${SYNC_URL}/sync/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          city,
          language: newLang,
          parentOrgId: SYNC_ORG_ID,
          parentSecretKey: SYNC_SECRET_KEY,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error("Failed");
      setNewCreds({ orgId: data.orgId, secretKey: data.secretKey, name: data.name, city: data.city });
      setShowAddCampus(false);
      setNewName("");
      setNewCity("");
      setNewLang("English");
      loadCampuses();
    } catch {
      Alert.alert("Error", "Could not create campus. Try again.");
    } finally {
      setCreating(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tab 2: Library
  // ─────────────────────────────────────────────────────────────────────────────
  const loadLibrary = useCallback(async () => {
    setLibLoading(true);
    setLibError(null);
    try {
      const res = await fetch(
        `${CINESTAGE_URL}/api/orgs/aggregate?resource=songs`,
        { headers: syncHeaders() },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Expect: { shared: Song[], campuses: { [campusName]: Song[] } }
      // Or fallback: flat array of songs with optional .campus field
      setLibSongs(normalizeAggregateLibraryPayload(data));
    } catch {
      setLibError("Could not load library. Check your network connection.");
    } finally {
      setLibLoading(false);
    }
  }, []);

  async function handleShareSong(song) {
    setSharingId(song.id);
    try {
      // Mark the song as shared + push to all campuses
      const res = await fetch(`${CINESTAGE_URL}/api/orgs/songs/${song.id}/share`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({ shared: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Optimistically update the UI
      setLibSongs((prev) =>
        prev.map((s) => (s.id === song.id ? { ...s, _group: "Shared", shared: true } : s)),
      );
      Alert.alert("Shared", `"${song.title}" is now shared to all campuses.`);
    } catch {
      Alert.alert("Error", "Could not share song. Try again.");
    } finally {
      setSharingId(null);
    }
  }

  const filteredSongs = libSongs.filter((s) => {
    if (!libSearch.trim()) return true;
    const q = libSearch.toLowerCase();
    return (
      (s.title || "").toLowerCase().includes(q) ||
      (s.artist || "").toLowerCase().includes(q)
    );
  });

  // Group songs
  const songGroups = {};
  for (const s of filteredSongs) {
    const group = s._group || "Uncategorized";
    if (!songGroups[group]) songGroups[group] = [];
    songGroups[group].push(s);
  }
  const branchGroups = Object.keys(songGroups)
    .filter((group) => group !== "Shared")
    .sort((left, right) => left.localeCompare(right));
  const groupOrder = songGroups.Shared ? ["Shared", ...branchGroups] : branchGroups;

  // ─────────────────────────────────────────────────────────────────────────────
  // Tab 3: People
  // ─────────────────────────────────────────────────────────────────────────────
  const loadPeople = useCallback(async () => {
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      const res = await fetch(
        `${CINESTAGE_URL}/api/orgs/aggregate?resource=people`,
        { headers: syncHeaders() },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Expect: flat array of { id, name, email, roles, campus, campusName }
      // Or: { [campusName]: Person[] }
      if (Array.isArray(data)) {
        setPeople(data);
      } else {
        const flat = [];
        for (const [campusName, members] of Object.entries(data)) {
          for (const m of members) {
            flat.push({ ...m, campusName });
          }
        }
        setPeople(flat);
      }
    } catch {
      setPeopleError("Could not load team members. Check your network connection.");
    } finally {
      setPeopleLoading(false);
    }
  }, []);

  const filteredPeople = people.filter((p) => {
    if (roleFilter === "All") return true;
    const roles = Array.isArray(p.roles) ? p.roles : [p.role].filter(Boolean);
    return roles.some((r) =>
      (r || "").toLowerCase().includes(roleFilter.toLowerCase()),
    );
  });

  // ── CSV parsing ──
  function parseCsvText(raw) {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
      // Support comma or semicolon separators; handle quoted fields naively
      const parts = line.split(/,|;/).map((p) => p.trim().replace(/^"|"$/g, ""));
      if (parts.length < 2) continue;
      const [name, email, role, campus] = parts;
      if (!email || !email.includes("@")) continue;
      rows.push({
        name: name || "",
        email: email.toLowerCase(),
        role: role || "member",
        campusOrgId: campus || "",
      });
    }
    return rows;
  }

  function handleCsvTextChange(text) {
    setInvCsvText(text);
    setInvParsedRows(parseCsvText(text));
    setInviteResult(null);
  }

  // ── Send invites ──
  async function handleSendInvites(invitesList) {
    if (!invitesList || invitesList.length === 0) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await fetch(`${CINESTAGE_URL}/api/orgs/invite-bulk`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({ invites: invitesList }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      const data = await res.json();
      setInviteResult(data);
      if (data.created > 0) loadPeople();
    } catch (err) {
      Alert.alert("Invite Error", err.message || "Could not send invites. Try again.");
    } finally {
      setInviting(false);
    }
  }

  function handleSendSingleInvite() {
    const email = invSingleEmail.trim().toLowerCase();
    const name = invSingleName.trim();
    if (!email || !email.includes("@")) {
      Alert.alert("Required", "Please enter a valid email address.");
      return;
    }
    handleSendInvites([{
      name: name || email.split("@")[0],
      email,
      role: invSingleRole,
      campusOrgId: invSingleCampus || undefined,
    }]);
  }

  function resetInviteModal() {
    setInviteTab("single");
    setInvSingleName("");
    setInvSingleEmail("");
    setInvSingleRole("member");
    setInvSingleCampus("");
    setInvCsvText("");
    setInvParsedRows([]);
    setShowCsvInput(false);
    setInviteResult(null);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Renders
  // ─────────────────────────────────────────────────────────────────────────────

  function renderCampusesTab() {
    if (campusesLoading) {
      return (
        <View style={styles.centeredState}>
          <ActivityIndicator color="#6366F1" size="large" />
          <Text style={styles.loadingText}>Loading campuses…</Text>
        </View>
      );
    }
    if (campusesError) {
      return (
        <View style={styles.centeredState}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{campusesError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadCampuses}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (campuses.length === 0) {
      return (
        <View style={styles.centeredState}>
          <Text style={styles.emptyIcon}>🏗️</Text>
          <Text style={styles.emptyTitle}>No campuses yet</Text>
          <Text style={styles.emptyText}>
            Tap "＋ Add Campus" to create your first campus. Each gets its own
            isolated library, members, and services.
          </Text>
          <TouchableOpacity style={styles.addCampusBtn} onPress={() => setShowAddCampus(true)}>
            <Text style={styles.addCampusBtnText}>＋ Add First Campus</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.tabContent}>
        {campuses.map((campus) => {
          const days = daysAgo(campus.lastActiveAt);
          const langColor = LANG_COLORS[campus.language] || "#8B5CF6";
          return (
            <View key={campus.id} style={styles.campusCard}>
              <TouchableOpacity
                style={styles.campusCardMain}
                activeOpacity={0.8}
                onPress={() => handleSwitchToCampus(campus)}
              >
                {/* Top row: name + language badge */}
                <View style={styles.campusCardTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.campusName}>{campus.name}</Text>
                    {campus.city ? (
                      <Text style={styles.campusCity}>📍 {campus.city}</Text>
                    ) : null}
                  </View>
                  {campus.language ? (
                    <View style={[styles.langBadge, { backgroundColor: langColor + "28", borderColor: langColor + "60" }]}>
                      <Text style={[styles.langBadgeText, { color: langColor }]}>
                        {campus.language}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Stats row */}
                <View style={styles.campusStatsRow}>
                  <View style={styles.campusStat}>
                    <Text style={styles.campusStatValue}>{campus.songCount ?? "—"}</Text>
                    <Text style={styles.campusStatLabel}>Songs</Text>
                  </View>
                  <View style={[styles.campusStat, styles.campusStatBorder]}>
                    <Text style={styles.campusStatValue}>{campus.peopleCount ?? "—"}</Text>
                    <Text style={styles.campusStatLabel}>Members</Text>
                  </View>
                  <View style={[styles.campusStat, styles.campusStatBorder]}>
                    <Text style={styles.campusStatValue}>
                      {days !== null ? `${days}d` : "—"}
                    </Text>
                    <Text style={styles.campusStatLabel}>Last Active</Text>
                  </View>
                </View>

                <Text style={styles.campusSwitchHint}>Tap to switch to this campus →</Text>
              </TouchableOpacity>

              {/* Push Library button */}
              <TouchableOpacity
                style={[styles.pushLibBtn, pushingLibrary[campus.id] && styles.pushLibBtnDisabled]}
                onPress={() => handlePushLibrary(campus)}
                disabled={!!pushingLibrary[campus.id]}
              >
                {pushingLibrary[campus.id] ? (
                  <ActivityIndicator color="#A5B4FC" size="small" />
                ) : (
                  <Text style={styles.pushLibBtnText}>Push Library →</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
        <View style={{ height: 24 }} />
      </ScrollView>
    );
  }

  function renderLibraryTab() {
    return (
      <View style={{ flex: 1 }}>
        {/* Search bar */}
        <View style={styles.searchBarWrap}>
          <TextInput
            style={styles.searchBar}
            value={libSearch}
            onChangeText={setLibSearch}
            placeholder="Search songs…"
            placeholderTextColor="#4B5563"
          />
          {libSearch.length > 0 && (
            <TouchableOpacity onPress={() => setLibSearch("")} style={styles.searchClear}>
              <Text style={styles.searchClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {libLoading && (
          <View style={styles.centeredState}>
            <ActivityIndicator color="#6366F1" size="large" />
            <Text style={styles.loadingText}>Loading library…</Text>
          </View>
        )}
        {libError && (
          <View style={styles.centeredState}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{libError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadLibrary}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {!libLoading && !libError && libSongs.length === 0 && (
          <View style={styles.centeredState}>
            <Text style={styles.emptyIcon}>🎵</Text>
            <Text style={styles.emptyTitle}>No songs found</Text>
            <Text style={styles.emptyText}>
              Once campuses sync their libraries, songs will appear here.
            </Text>
          </View>
        )}
        {!libLoading && !libError && libSongs.length > 0 && (
          <ScrollView contentContainerStyle={styles.tabContent}>
            <Text style={styles.libraryScopeNote}>
              Each branch keeps its own library folder. Only songs marked as shared are meant to travel across campuses.
            </Text>
            {groupOrder.map((group) => {
              const songs = songGroups[group];
              if (!songs || songs.length === 0) return null;
              const isShared = group === "Shared";
              return (
                <View key={group}>
                  <View style={styles.groupHeaderRow}>
                    <Text style={[styles.groupHeader, isShared && { color: "#10B981" }]}>
                      {isShared ? "✓ Shared Across All Campuses" : `🏛️ ${group}`}
                    </Text>
                    <Text style={styles.groupCount}>{songs.length}</Text>
                  </View>
                  {songs.map((song) => (
                    <View key={song.id} style={styles.songRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.songTitle}>{song.title || "Untitled"}</Text>
                        <Text style={styles.songArtist}>{song.artist || "Unknown Artist"}</Text>
                      </View>
                      {!isShared && (
                        <TouchableOpacity
                          style={[styles.shareBtn, sharingId === song.id && { opacity: 0.5 }]}
                          onPress={() => handleShareSong(song)}
                          disabled={sharingId === song.id}
                        >
                          {sharingId === song.id ? (
                            <ActivityIndicator color="#6366F1" size="small" />
                          ) : (
                            <Text style={styles.shareBtnText}>Share to All</Text>
                          )}
                        </TouchableOpacity>
                      )}
                      {isShared && (
                        <View style={styles.sharedBadge}>
                          <Text style={styles.sharedBadgeText}>Shared</Text>
                        </View>
                      )}
                    </View>
                  ))}
                  <View style={styles.groupDivider} />
                </View>
              );
            })}
            <View style={{ height: 24 }} />
          </ScrollView>
        )}
      </View>
    );
  }

  function renderPeopleTab() {
    return (
      <View style={{ flex: 1 }}>
        {/* Invite Team button */}
        <TouchableOpacity
          style={styles.inviteTeamBtn}
          onPress={() => { resetInviteModal(); setShowInviteModal(true); }}
        >
          <Text style={styles.inviteTeamBtnText}>＋ Invite Team</Text>
        </TouchableOpacity>

        {/* Role filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterRowContent}
        >
          {ROLE_FILTER_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.filterChip, roleFilter === r && styles.filterChipActive]}
              onPress={() => setRoleFilter(r)}
            >
              <Text style={[styles.filterChipText, roleFilter === r && styles.filterChipTextActive]}>
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {peopleLoading && (
          <View style={styles.centeredState}>
            <ActivityIndicator color="#6366F1" size="large" />
            <Text style={styles.loadingText}>Loading team…</Text>
          </View>
        )}
        {peopleError && (
          <View style={styles.centeredState}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{peopleError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadPeople}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {!peopleLoading && !peopleError && filteredPeople.length === 0 && (
          <View style={styles.centeredState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No team members found</Text>
            <Text style={styles.emptyText}>
              Team members from all campuses will appear here once they sync.
            </Text>
          </View>
        )}
        {!peopleLoading && !peopleError && filteredPeople.length > 0 && (
          <ScrollView contentContainerStyle={styles.tabContent}>
            {filteredPeople.map((person, idx) => {
              const roles = Array.isArray(person.roles)
                ? person.roles
                : [person.role].filter(Boolean);
              const campusName = person.campusName || person.campus || "—";
              return (
                <TouchableOpacity
                  key={person.id || idx}
                  style={styles.personRow}
                  onPress={() => setSelectedPerson(person)}
                  activeOpacity={0.75}
                >
                  <View style={styles.personAvatar}>
                    <Text style={styles.personAvatarText}>{initials(person.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.personNameRow}>
                      <Text style={styles.personName}>{person.name || "Unknown"}</Text>
                      <View style={styles.campusBadge}>
                        <Text style={styles.campusBadgeText}>{campusName}</Text>
                      </View>
                    </View>
                    {person.email ? (
                      <Text style={styles.personEmail}>{person.email}</Text>
                    ) : null}
                    {roles.length > 0 && (
                      <View style={styles.personRoleRow}>
                        {roles.slice(0, 3).map((r, ri) => (
                          <View key={ri} style={styles.roleChip}>
                            <Text style={styles.roleChipText}>{r}</Text>
                          </View>
                        ))}
                        {roles.length > 3 && (
                          <Text style={styles.moreRoles}>+{roles.length - 3}</Text>
                        )}
                      </View>
                    )}
                  </View>
                  <Text style={styles.personChevron}>›</Text>
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 24 }} />
          </ScrollView>
        )}

        {/* Person detail modal */}
        <Modal
          visible={!!selectedPerson}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedPerson(null)}
        >
          <View style={styles.personModalOverlay}>
            <View style={styles.personModalBox}>
              {selectedPerson && (
                <>
                  <View style={styles.personModalHeader}>
                    <View style={styles.personModalAvatar}>
                      <Text style={styles.personModalAvatarText}>
                        {initials(selectedPerson.name)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personModalName}>{selectedPerson.name || "Unknown"}</Text>
                      {selectedPerson.email ? (
                        <Text style={styles.personModalEmail}>{selectedPerson.email}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity onPress={() => setSelectedPerson(null)}>
                      <Text style={styles.personModalClose}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.personModalDetail}>
                    <Text style={styles.personModalLabel}>Campus</Text>
                    <Text style={styles.personModalValue}>
                      {selectedPerson.campusName || selectedPerson.campus || "—"}
                    </Text>
                  </View>

                  {(Array.isArray(selectedPerson.roles)
                    ? selectedPerson.roles
                    : [selectedPerson.role].filter(Boolean)
                  ).length > 0 && (
                    <View style={styles.personModalDetail}>
                      <Text style={styles.personModalLabel}>Roles</Text>
                      <View style={styles.personRoleRow}>
                        {(Array.isArray(selectedPerson.roles)
                          ? selectedPerson.roles
                          : [selectedPerson.role].filter(Boolean)
                        ).map((r, ri) => (
                          <View key={ri} style={[styles.roleChip, { backgroundColor: "#1E1B4B", borderColor: "#6366F1" }]}>
                            <Text style={[styles.roleChipText, { color: "#A5B4FC" }]}>{r}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {selectedPerson.notes ? (
                    <View style={styles.personModalDetail}>
                      <Text style={styles.personModalLabel}>Notes</Text>
                      <Text style={styles.personModalValue}>{selectedPerson.notes}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={styles.personModalDone}
                    onPress={() => setSelectedPerson(null)}
                  >
                    <Text style={styles.personModalDoneText}>Done</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Root render
  // ─────────────────────────────────────────────────────────────────────────────

  // Admin access guard — only admins and leaders may view this screen
  if (userRole !== 'admin' && userRole !== 'leader') {
    return (
      <View style={{ flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#94A3B8', fontSize: 16 }}>Admin access required</Text>
        <Text style={{ color: '#64748B', fontSize: 13, marginTop: 8 }}>Contact your organization administrator</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Screen Header ── */}
      <View style={styles.screenHeader}>
        <View style={styles.screenHeaderLeft}>
          <Text style={styles.screenHeaderIcon}>🏛️</Text>
          <View>
            <Text style={styles.screenHeaderTitle}>Central Command</Text>
            <Text style={styles.screenHeaderSub}>{orgName}</Text>
          </View>
        </View>
        <View style={styles.screenHeaderActions}>
          <TouchableOpacity
            style={styles.analyticsBtn}
            onPress={() => navigation.navigate("AnalyticsDashboard")}
          >
            <Text style={styles.analyticsBtnText}>📊 Analytics</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pcoBtn}
            onPress={() => navigation.navigate("PCOIntegration")}
          >
            <Text style={styles.pcoBtnText}>PC Import</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.upgradePlanBtn}
            onPress={() => navigation.navigate("Billing")}
          >
            <Text style={styles.upgradePlanBtnText}>⭐ Upgrade</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.webhooksBtn}
            onPress={() => navigation.navigate("Webhooks")}
          >
            <Text style={styles.webhooksBtnText}>🔗 Webhooks</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addCampusHeaderBtn}
            onPress={() => { setActiveTab(0); setShowAddCampus(true); }}
          >
            <Text style={styles.addCampusHeaderBtnText}>＋ Campus</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tab Bar ── */}
      <View style={styles.tabBar}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBarItem, activeTab === i && styles.tabBarItemActive]}
            onPress={() => setActiveTab(i)}
          >
            <Text style={[styles.tabBarText, activeTab === i && styles.tabBarTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab Content ── */}
      <View style={{ flex: 1 }}>
        {activeTab === 0 && renderCampusesTab()}
        {activeTab === 1 && renderLibraryTab()}
        {activeTab === 2 && renderPeopleTab()}
      </View>

      {/* ── Add Campus Modal ── */}
      <Modal
        visible={showAddCampus}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddCampus(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Campus</Text>

            <Text style={styles.modalLabel}>Campus Name *</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Faith Church — North Campus"
              placeholderTextColor="#4B5563"
            />

            <Text style={styles.modalLabel}>City</Text>
            <TextInput
              style={styles.modalInput}
              value={newCity}
              onChangeText={setNewCity}
              placeholder="e.g. Wellington, FL"
              placeholderTextColor="#4B5563"
            />

            <Text style={styles.modalLabel}>Primary Language</Text>
            <View style={styles.langPicker}>
              {LANGUAGES.map((lang) => {
                const lc = LANG_COLORS[lang] || "#8B5CF6";
                const active = newLang === lang;
                return (
                  <TouchableOpacity
                    key={lang}
                    style={[
                      styles.langOption,
                      active && { backgroundColor: lc + "28", borderColor: lc },
                    ]}
                    onPress={() => setNewLang(lang)}
                  >
                    <Text style={[styles.langOptionText, active && { color: lc }]}>
                      {lang}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowAddCampus(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCreate, creating && { opacity: 0.6 }]}
                onPress={handleCreateCampus}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalCreateText}>Create Campus</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Invite Team Modal ── */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: "90%" }]}>
            {/* Header */}
            <View style={styles.inviteModalHeader}>
              <Text style={styles.modalTitle}>Invite Team Members</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                <Text style={styles.personModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Tab toggle */}
            <View style={styles.inviteTabToggle}>
              <TouchableOpacity
                style={[styles.inviteTabBtn, inviteTab === "single" && styles.inviteTabBtnActive]}
                onPress={() => { setInviteTab("single"); setInviteResult(null); }}
              >
                <Text style={[styles.inviteTabBtnText, inviteTab === "single" && styles.inviteTabBtnTextActive]}>
                  Single
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteTabBtn, inviteTab === "bulk" && styles.inviteTabBtnActive]}
                onPress={() => { setInviteTab("bulk"); setInviteResult(null); }}
              >
                <Text style={[styles.inviteTabBtnText, inviteTab === "bulk" && styles.inviteTabBtnTextActive]}>
                  Bulk CSV
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* ── Single Tab ── */}
              {inviteTab === "single" && (
                <View>
                  <Text style={styles.modalLabel}>Name</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={invSingleName}
                    onChangeText={setInvSingleName}
                    placeholder="Jefferson Silva"
                    placeholderTextColor="#4B5563"
                    autoCapitalize="words"
                  />

                  <Text style={styles.modalLabel}>Email *</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={invSingleEmail}
                    onChangeText={setInvSingleEmail}
                    placeholder="jefferson@church.com"
                    placeholderTextColor="#4B5563"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  <Text style={styles.modalLabel}>Role</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                      {[
                        { label: "Worship Leader", value: "worship_leader" },
                        { label: "Vocalist", value: "vocalist" },
                        { label: "Musician", value: "musician" },
                        { label: "Sound Tech", value: "sound_tech" },
                        { label: "Pastor", value: "pastor" },
                        { label: "Member", value: "member" },
                      ].map((opt) => (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.langOption,
                            invSingleRole === opt.value && { backgroundColor: "#1E1B4B", borderColor: "#6366F1" },
                          ]}
                          onPress={() => setInvSingleRole(opt.value)}
                        >
                          <Text style={[
                            styles.langOptionText,
                            invSingleRole === opt.value && { color: "#818CF8" },
                          ]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <Text style={styles.modalLabel}>Campus (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                      <TouchableOpacity
                        style={[styles.langOption, invSingleCampus === "" && { backgroundColor: "#1E1B4B", borderColor: "#6366F1" }]}
                        onPress={() => setInvSingleCampus("")}
                      >
                        <Text style={[styles.langOptionText, invSingleCampus === "" && { color: "#818CF8" }]}>
                          This Org
                        </Text>
                      </TouchableOpacity>
                      {campuses.map((c) => (
                        <TouchableOpacity
                          key={c.orgId || c.id}
                          style={[styles.langOption, invSingleCampus === (c.orgId || c.id) && { backgroundColor: "#1E1B4B", borderColor: "#6366F1" }]}
                          onPress={() => setInvSingleCampus(c.orgId || c.id)}
                        >
                          <Text style={[styles.langOptionText, invSingleCampus === (c.orgId || c.id) && { color: "#818CF8" }]}>
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* ── Bulk CSV Tab ── */}
              {inviteTab === "bulk" && (
                <View>
                  <Text style={styles.inviteCsvInstruction}>
                    Upload a CSV with columns: name, email, role, campus
                  </Text>

                  {/* Example box */}
                  <View style={styles.inviteCsvExample}>
                    <Text style={styles.inviteCsvExampleText}>
                      {"Jefferson Silva,jefferson@church.com,worship_leader,Main Campus\nMaria Santos,maria@church.com,vocalist,\nDave Kim,dave@church.com,sound_tech,"}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.invitePasteBtn}
                    onPress={() => setShowCsvInput(true)}
                  >
                    <Text style={styles.invitePasteBtnText}>
                      {showCsvInput ? "Edit CSV" : "Paste CSV"}
                    </Text>
                  </TouchableOpacity>

                  {showCsvInput && (
                    <TextInput
                      style={styles.inviteCsvInput}
                      value={invCsvText}
                      onChangeText={handleCsvTextChange}
                      placeholder={"name,email,role,campus\nJefferson,jeff@church.com,worship_leader,"}
                      placeholderTextColor="#4B5563"
                      multiline
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  )}

                  {/* Preview parsed rows */}
                  {invParsedRows.length > 0 && (
                    <View style={styles.invitePreviewBox}>
                      <Text style={styles.invitePreviewHeader}>
                        Preview — {invParsedRows.length} row{invParsedRows.length !== 1 ? "s" : ""}
                      </Text>
                      {invParsedRows.slice(0, 8).map((row, i) => (
                        <View key={i} style={styles.invitePreviewRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.invitePreviewName}>{row.name || row.email}</Text>
                            <Text style={styles.invitePreviewEmail}>{row.email}</Text>
                          </View>
                          <View style={styles.inviteRoleBadge}>
                            <Text style={styles.inviteRoleBadgeText}>
                              {row.role.replace("_", " ")}
                            </Text>
                          </View>
                        </View>
                      ))}
                      {invParsedRows.length > 8 && (
                        <Text style={styles.invitePreviewMore}>
                          +{invParsedRows.length - 8} more…
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* ── Result card ── */}
              {inviteResult && (
                <View style={styles.inviteResultCard}>
                  <Text style={styles.inviteResultTitle}>Invite Results</Text>
                  <Text style={styles.inviteResultLine}>
                    {"✓ "}{inviteResult.created} invited
                  </Text>
                  {inviteResult.existing > 0 && (
                    <Text style={styles.inviteResultLineGray}>
                      {inviteResult.existing} already in org
                    </Text>
                  )}
                  {inviteResult.errors && inviteResult.errors.length > 0 && (
                    <Text style={styles.inviteResultError}>
                      {inviteResult.errors.length} error{inviteResult.errors.length !== 1 ? "s" : ""}
                    </Text>
                  )}
                </View>
              )}

              {/* ── Action buttons ── */}
              <View style={[styles.modalBtns, { marginTop: 20 }]}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => setShowInviteModal(false)}
                >
                  <Text style={styles.modalCancelText}>Close</Text>
                </TouchableOpacity>

                {inviteTab === "single" && (
                  <TouchableOpacity
                    style={[styles.modalCreate, inviting && { opacity: 0.6 }]}
                    onPress={handleSendSingleInvite}
                    disabled={inviting}
                  >
                    {inviting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.modalCreateText}>Send Invite</Text>
                    )}
                  </TouchableOpacity>
                )}

                {inviteTab === "bulk" && invParsedRows.length > 0 && (
                  <TouchableOpacity
                    style={[styles.modalCreate, inviting && { opacity: 0.6 }]}
                    onPress={() => handleSendInvites(invParsedRows)}
                    disabled={inviting}
                  >
                    {inviting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.modalCreateText}>
                        Send {invParsedRows.length} Invite{invParsedRows.length !== 1 ? "s" : ""}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── New Campus Credentials Modal (show once) ── */}
      <Modal
        visible={!!newCreds}
        transparent
        animationType="fade"
        onRequestClose={() => setNewCreds(null)}
      >
        <View style={styles.credOverlay}>
          <View style={styles.credBox}>
            <Text style={styles.credTitle}>🔑 Campus Created!</Text>
            <Text style={styles.credWarning}>
              Save these credentials now — the Secret Key will NEVER be shown again.
            </Text>
            <View style={styles.credRow}>
              <Text style={styles.credLabel}>Campus Name</Text>
              <Text style={styles.credValue}>
                {newCreds?.name}{newCreds?.city ? ` — ${newCreds.city}` : ""}
              </Text>
            </View>
            <View style={styles.credRow}>
              <Text style={styles.credLabel}>Campus ID</Text>
              <Text style={[styles.credValue, styles.mono]} selectable>
                {newCreds?.orgId}
              </Text>
            </View>
            <View style={styles.credRow}>
              <Text style={styles.credLabel}>Secret Key</Text>
              <Text style={[styles.credValue, styles.mono]} selectable>
                {newCreds?.secretKey}
              </Text>
            </View>
            <Text style={styles.credNote}>
              Give these to the campus worship leader. They enter them under
              Organization → Connect to Campus.
            </Text>
            <TouchableOpacity style={styles.credDone} onPress={() => setNewCreds(null)}>
              <Text style={styles.credDoneText}>✓ I've Saved These</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#020617",
  },

  // ── Screen header ──
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  screenHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  screenHeaderIcon: { fontSize: 28 },
  screenHeaderTitle: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  screenHeaderSub: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },
  screenHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  analyticsBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  analyticsBtnText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },
  pcoBtn: {
    backgroundColor: "#1E3A5F",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#3B82F6",
  },
  pcoBtnText: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "700",
  },
  upgradePlanBtn: {
    backgroundColor: "#78350F",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#D97706",
  },
  upgradePlanBtnText: {
    color: "#FCD34D",
    fontSize: 12,
    fontWeight: "800",
  },
  addCampusHeaderBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addCampusHeaderBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  webhooksBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  webhooksBtnText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Tab bar ──
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#0B1120",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  tabBarItem: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBarItemActive: {
    borderBottomColor: "#6366F1",
  },
  tabBarText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  tabBarTextActive: {
    color: "#818CF8",
  },

  // ── Shared states ──
  tabContent: {
    padding: 16,
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    marginTop: 40,
  },
  loadingText: {
    color: "#6B7280",
    fontSize: 14,
    marginTop: 12,
  },
  errorIcon: { fontSize: 36, marginBottom: 12 },
  errorText: {
    color: "#EF4444",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#374151",
  },
  retryBtnText: { color: "#9CA3AF", fontWeight: "600", fontSize: 14 },
  emptyIcon: { fontSize: 48, marginBottom: 14 },
  emptyTitle: {
    color: "#F9FAFB",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
  },

  // ── Campuses tab ──
  campusCard: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    marginBottom: 14,
    overflow: "hidden",
  },
  campusCardMain: {
    padding: 18,
  },
  campusCardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  campusName: {
    color: "#F9FAFB",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  campusCity: {
    color: "#9CA3AF",
    fontSize: 13,
  },
  langBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    marginLeft: 8,
  },
  langBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  campusStatsRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 12,
  },
  campusStat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
  },
  campusStatBorder: {
    borderLeftWidth: 1,
    borderLeftColor: "#1E293B",
  },
  campusStatValue: {
    color: "#E5E7EB",
    fontSize: 17,
    fontWeight: "700",
  },
  campusStatLabel: {
    color: "#6B7280",
    fontSize: 11,
    marginTop: 2,
  },
  campusSwitchHint: {
    color: "#6366F1",
    fontSize: 12,
    fontWeight: "600",
  },
  pushLibBtn: {
    backgroundColor: "#1E1B4B",
    borderTopWidth: 1,
    borderTopColor: "#2E2B5B",
    paddingVertical: 12,
    alignItems: "center",
  },
  pushLibBtnDisabled: {
    opacity: 0.5,
  },
  pushLibBtnText: {
    color: "#A5B4FC",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  addCampusBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  addCampusBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  // ── Library tab ──
  searchBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    backgroundColor: "#0F172A",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    paddingHorizontal: 12,
  },
  searchBar: {
    flex: 1,
    color: "#E5E7EB",
    fontSize: 14,
    paddingVertical: 11,
  },
  searchClear: {
    paddingLeft: 8,
    paddingVertical: 8,
  },
  searchClearText: {
    color: "#6B7280",
    fontSize: 14,
  },
  libraryScopeNote: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 8,
  },
  groupHeader: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  groupCount: {
    color: "#4B5563",
    fontSize: 11,
    fontWeight: "600",
  },
  groupDivider: {
    height: 1,
    backgroundColor: "#1E293B",
    marginTop: 8,
    marginBottom: 4,
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#0F172A",
    gap: 10,
  },
  songTitle: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "600",
  },
  songArtist: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 2,
  },
  shareBtn: {
    backgroundColor: "#1E1B4B",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#4F46E5",
    minWidth: 80,
    alignItems: "center",
  },
  shareBtnText: {
    color: "#818CF8",
    fontSize: 11,
    fontWeight: "700",
  },
  sharedBadge: {
    backgroundColor: "#052E1C",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#10B981",
  },
  sharedBadgeText: {
    color: "#10B981",
    fontSize: 11,
    fontWeight: "700",
  },

  // ── People tab ──
  filterRow: {
    flexShrink: 0,
    maxHeight: 52,
  },
  filterRowContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  filterChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  filterChipActive: {
    backgroundColor: "#1E1B4B",
    borderColor: "#6366F1",
  },
  filterChipText: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#818CF8",
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    gap: 12,
  },
  personAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1E1B4B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#4F46E5",
    flexShrink: 0,
  },
  personAvatarText: {
    color: "#818CF8",
    fontWeight: "700",
    fontSize: 15,
  },
  personNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 2,
  },
  personName: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "600",
  },
  campusBadge: {
    backgroundColor: "#0F172A",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#374151",
  },
  campusBadgeText: {
    color: "#9CA3AF",
    fontSize: 10,
    fontWeight: "600",
  },
  personEmail: {
    color: "#6B7280",
    fontSize: 11,
    marginBottom: 4,
  },
  personRoleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 4,
  },
  roleChip: {
    backgroundColor: "#1E293B",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#374151",
  },
  roleChipText: {
    color: "#9CA3AF",
    fontSize: 10,
    fontWeight: "600",
  },
  moreRoles: {
    color: "#4B5563",
    fontSize: 10,
    fontWeight: "600",
    alignSelf: "center",
  },
  personChevron: {
    color: "#374151",
    fontSize: 22,
    fontWeight: "300",
    flexShrink: 0,
  },

  // ── Person detail modal ──
  personModalOverlay: {
    flex: 1,
    backgroundColor: "#000000BB",
    justifyContent: "flex-end",
  },
  personModalBox: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  personModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
  },
  personModalAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1E1B4B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#6366F1",
  },
  personModalAvatarText: {
    color: "#818CF8",
    fontWeight: "800",
    fontSize: 20,
  },
  personModalName: {
    color: "#F9FAFB",
    fontSize: 18,
    fontWeight: "700",
  },
  personModalEmail: {
    color: "#6B7280",
    fontSize: 13,
    marginTop: 2,
  },
  personModalClose: {
    color: "#6B7280",
    fontSize: 18,
    padding: 4,
  },
  personModalDetail: {
    marginBottom: 14,
  },
  personModalLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  personModalValue: {
    color: "#E5E7EB",
    fontSize: 14,
  },
  personModalDone: {
    backgroundColor: "#4F46E5",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  personModalDoneText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  // ── Add campus modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "#000000BB",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 20,
  },
  modalLabel: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  modalInput: {
    backgroundColor: "#1E293B",
    color: "#F9FAFB",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#374151",
  },
  langPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  langOption: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#374151",
  },
  langOptionText: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
  },
  modalBtns: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  modalCancel: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCancelText: {
    color: "#9CA3AF",
    fontWeight: "600",
    fontSize: 14,
  },
  modalCreate: {
    flex: 1,
    backgroundColor: "#4F46E5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCreateText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  // ── Credentials reveal modal ──
  credOverlay: {
    flex: 1,
    backgroundColor: "#000000CC",
    justifyContent: "center",
    padding: 24,
  },
  credBox: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  credTitle: {
    color: "#F59E0B",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  credWarning: {
    color: "#9CA3AF",
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  credRow: { marginBottom: 14 },
  credLabel: {
    color: "#6B7280",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  credValue: {
    color: "#F9FAFB",
    fontSize: 14,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#818CF8",
    letterSpacing: 0.5,
  },
  credNote: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 20,
  },
  credDone: {
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  credDoneText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  // ── Invite Team button (People tab top) ──
  inviteTeamBtn: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    backgroundColor: "#4F46E5",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  inviteTeamBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.2,
  },

  // ── Invite modal ──
  inviteModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  inviteTabToggle: {
    flexDirection: "row",
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 3,
    marginBottom: 18,
  },
  inviteTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  inviteTabBtnActive: {
    backgroundColor: "#4F46E5",
  },
  inviteTabBtnText: {
    color: "#6B7280",
    fontWeight: "600",
    fontSize: 13,
  },
  inviteTabBtnTextActive: {
    color: "#fff",
  },
  inviteCsvInstruction: {
    color: "#9CA3AF",
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  inviteCsvExample: {
    backgroundColor: "#0B1120",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  inviteCsvExampleText: {
    color: "#4B5563",
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 18,
  },
  invitePasteBtn: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#374151",
  },
  invitePasteBtnText: {
    color: "#9CA3AF",
    fontWeight: "600",
    fontSize: 13,
  },
  inviteCsvInput: {
    backgroundColor: "#1E293B",
    color: "#F9FAFB",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 12,
    borderWidth: 1,
    borderColor: "#374151",
    minHeight: 120,
    textAlignVertical: "top",
    fontFamily: "monospace",
    marginBottom: 12,
  },
  invitePreviewBox: {
    backgroundColor: "#0B1120",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 12,
    marginBottom: 4,
  },
  invitePreviewHeader: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 10,
  },
  invitePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    gap: 10,
  },
  invitePreviewName: {
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "600",
  },
  invitePreviewEmail: {
    color: "#6B7280",
    fontSize: 11,
    marginTop: 1,
  },
  inviteRoleBadge: {
    backgroundColor: "#1E1B4B",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#4F46E5",
  },
  inviteRoleBadgeText: {
    color: "#818CF8",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  invitePreviewMore: {
    color: "#4B5563",
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
  },
  inviteResultCard: {
    backgroundColor: "#052E1C",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#10B981",
    padding: 14,
    marginTop: 16,
  },
  inviteResultTitle: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  inviteResultLine: {
    color: "#6EE7B7",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  inviteResultLineGray: {
    color: "#9CA3AF",
    fontSize: 13,
    marginBottom: 2,
  },
  inviteResultError: {
    color: "#F87171",
    fontSize: 13,
    marginTop: 4,
  },
});
