/**
 * PCOIntegrationScreen — Planning Center Online integration hub.
 *
 * Sections:
 *   1. Connection  — Personal Access Token (App ID + Secret) auth
 *   2. Services    — Import upcoming plans as UM services
 *   3. People      — Import team members into People & Roles
 *   4. Songs       — Import song library
 *
 * Auth: PCO Personal Access Token (App ID : Secret), stored in AsyncStorage.
 * Docs: https://developer.planning.center/docs#/introduction/authentication
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { makeId } from "../data/models";
import { addOrUpdatePerson, addOrUpdateService, addOrUpdateSong, getSongs } from "../data/storage";
import {
  clearPCOCredentials,
  getAllUpcomingPlans,
  getPCOCredentials,
  getPCOPeople,
  getPCOSongLibrary,
  getServiceTypes,
  savePCOCredentials,
} from "../services/planningCenterService";

// ── Constants ─────────────────────────────────────────────────────────────────

const PC_BLUE = "#3B82F6";
const PC_BLUE_DIM = "#1D4ED8";
const NAV_BG = "#020617";

const TABS = ["Services", "People", "Songs"];

// ── Small UI atoms ─────────────────────────────────────────────────────────────

function PCLogo({ size = 32 }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: PC_BLUE, alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ color: "#fff", fontSize: size * 0.45, fontWeight: "900" }}>PC</Text>
    </View>
  );
}

function SectionLabel({ text }) {
  return (
    <Text style={styles.sectionLabel}>{text}</Text>
  );
}

function StatusPill({ connected }) {
  return (
    <View style={[styles.statusPill, connected ? styles.statusPillOk : styles.statusPillOff]}>
      <View style={[styles.statusDot, { backgroundColor: connected ? "#34D399" : "#6B7280" }]} />
      <Text style={[styles.statusPillText, { color: connected ? "#34D399" : "#9CA3AF" }]}>
        {connected ? "Connected" : "Not connected"}
      </Text>
    </View>
  );
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function ImportBtn({ label, onPress, done, loading, style }) {
  if (loading) {
    return (
      <View style={[styles.importBtnBase, styles.importBtnLoading, style]}>
        <ActivityIndicator color="#93C5FD" size="small" />
      </View>
    );
  }
  if (done) {
    return (
      <View style={[styles.importBtnBase, styles.importBtnDone, style]}>
        <Text style={styles.importBtnDoneText}>Imported</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={[styles.importBtnBase, style]} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.importBtnText}>{label || "Import"}</Text>
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function PCOIntegrationScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isIPad = width >= 768;

  // ── Credentials ──
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const [creds, setCreds] = useState(null);
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // ── Org info ──
  const [orgName, setOrgName] = useState("");

  // ── Tabs ──
  const [activeTab, setActiveTab] = useState(0);

  // ── Services tab ──
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState(null);
  const [selectedServices, setSelectedServices] = useState(new Set());
  const [importingServices, setImportingServices] = useState(false);
  const [importedServices, setImportedServices] = useState(new Set());

  // ── People tab ──
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState(null);
  const [selectedPeople, setSelectedPeople] = useState(new Set());
  const [importingPeople, setImportingPeople] = useState(false);
  const [importedPeople, setImportedPeople] = useState(new Set());

  // ── Songs tab ──
  const [songs, setSongs] = useState([]);
  const [songsLoading, setSongsLoading] = useState(false);
  const [songsError, setSongsError] = useState(null);
  const [selectedSongs, setSelectedSongs] = useState(new Set());
  const [importingSongs, setImportingSongs] = useState(false);
  const [importedSongs, setImportedSongs] = useState(new Set());

  // ── Load saved credentials on mount ──────────────────────────────────────────

  useEffect(() => {
    getPCOCredentials().then((saved) => {
      if (saved) {
        setCreds(saved);
        setAppId(saved.appId);
        setSecret(saved.secret);
        setOrgName(saved.orgName || "");
        setShowConnectForm(false);
      } else {
        setShowConnectForm(true);
      }
    });
  }, []);

  // ── Load tab data when creds are ready ────────────────────────────────────────

  useEffect(() => {
    if (!creds) return;
    if (activeTab === 0) loadServices();
    else if (activeTab === 1) loadPeople();
    else if (activeTab === 2) loadSongs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds, activeTab]);

  // ── Connect ──────────────────────────────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    const id = appId.trim();
    const sec = secret.trim();
    if (!id || !sec) {
      Alert.alert("Missing credentials", "Enter both App ID and Secret from Planning Center.");
      return;
    }
    setConnecting(true);
    try {
      // Validate by fetching org info
      const resp = await fetch(
        "https://api.planningcenteronline.com/services/v2/service_types?per_page=1",
        {
          headers: {
            Authorization: `Basic ${btoa(`${id}:${sec}`)}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(
          resp.status === 401
            ? "Invalid credentials. Check your App ID and Secret."
            : `PCO error ${resp.status}: ${txt.slice(0, 120)}`
        );
      }
      // Try to get org name from /me
      let detectedOrg = "";
      try {
        const meResp = await fetch("https://api.planningcenteronline.com/people/v2/me", {
          headers: { Authorization: `Basic ${btoa(`${id}:${sec}`)}` },
        });
        if (meResp.ok) {
          const me = await meResp.json();
          const org = me?.data?.relationships?.organization?.data;
          detectedOrg = me?.included?.find?.((i) => i.id === org?.id)?.attributes?.name || "";
        }
      } catch { /* optional */ }

      await savePCOCredentials(id, sec);
      const saved = { appId: id, secret: sec, orgName: detectedOrg };
      setCreds(saved);
      setOrgName(detectedOrg);
      setShowConnectForm(false);
    } catch (err) {
      Alert.alert("Connection failed", err.message);
    } finally {
      setConnecting(false);
    }
  }, [appId, secret]);

  const handleDisconnect = useCallback(() => {
    Alert.alert("Disconnect Planning Center?", "Your saved credentials will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          await clearPCOCredentials();
          setCreds(null);
          setOrgName("");
          setServices([]);
          setPeople([]);
          setSongs([]);
          setSelectedServices(new Set());
          setSelectedPeople(new Set());
          setSelectedSongs(new Set());
          setImportedServices(new Set());
          setImportedPeople(new Set());
          setImportedSongs(new Set());
          setShowConnectForm(true);
        },
      },
    ]);
  }, []);

  // ── Load data functions ───────────────────────────────────────────────────────

  const loadServices = useCallback(async () => {
    if (!creds) return;
    setServicesLoading(true);
    setServicesError(null);
    try {
      const plans = await getAllUpcomingPlans(creds);
      setServices(plans);
    } catch (err) {
      setServicesError(err.message || "Failed to load services.");
    } finally {
      setServicesLoading(false);
    }
  }, [creds]);

  const loadPeople = useCallback(async () => {
    if (!creds) return;
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      const data = await getPCOPeople(creds);
      setPeople(data);
    } catch (err) {
      setPeopleError(err.message || "Failed to load people.");
    } finally {
      setPeopleLoading(false);
    }
  }, [creds]);

  const loadSongs = useCallback(async () => {
    if (!creds) return;
    setSongsLoading(true);
    setSongsError(null);
    try {
      const data = await getPCOSongLibrary(creds);
      setSongs(data);
    } catch (err) {
      setSongsError(err.message || "Failed to load songs.");
    } finally {
      setSongsLoading(false);
    }
  }, [creds]);

  // ── Toggle selection helpers ─────────────────────────────────────────────────

  const toggleSelect = (set, setFn, id) => {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (items, setFn) => {
    setFn(new Set(items.map((i) => i.id)));
  };

  const deselectAll = (setFn) => {
    setFn(new Set());
  };

  // ── Import handlers ───────────────────────────────────────────────────────────

  const handleImportServices = useCallback(async () => {
    if (selectedServices.size === 0) {
      Alert.alert("No services selected", "Check at least one service to import.");
      return;
    }
    setImportingServices(true);
    try {
      const toImport = services.filter((s) => selectedServices.has(s.id));
      const justImported = new Set();
      for (const plan of toImport) {
        const service = {
          id: makeId("pco_svc"),
          title: plan.title || plan.serviceTypeName || "Untitled Service",
          service_date: plan.sortDate ? plan.sortDate.split("T")[0] : "",
          time: "",
          notes: plan.publicNotes || "",
          serviceType: plan.serviceTypeName || "Standard",
          songs: [],
          tags: ["from:pco"],
          pcoId: plan.id,
          pcoServiceTypeId: plan.serviceTypeId,
          createdAt: new Date().toISOString(),
        };
        await addOrUpdateService(service);
        justImported.add(plan.id);
      }
      setImportedServices((prev) => new Set([...prev, ...justImported]));
      setSelectedServices(new Set());
      Alert.alert(
        "Services Imported",
        `${toImport.length} service${toImport.length !== 1 ? "s" : ""} added to your planning calendar.`
      );
    } catch (err) {
      Alert.alert("Import error", err.message || "Something went wrong.");
    } finally {
      setImportingServices(false);
    }
  }, [services, selectedServices]);

  const handleImportPeople = useCallback(async () => {
    if (selectedPeople.size === 0) {
      Alert.alert("No people selected", "Check at least one team member to import.");
      return;
    }
    setImportingPeople(true);
    try {
      const toImport = people.filter((p) => selectedPeople.has(p.id));
      const justImported = new Set();
      for (const pco of toImport) {
        const person = {
          id: makeId("pco_per"),
          name: pco.name,
          email: pco.email || "",
          photo_url: pco.photoUrl || null,
          roles: ["member"],
          roleAssignments: "member",
          _source: "pco",
          pcoId: pco.id,
          tags: ["from:pco"],
          createdAt: new Date().toISOString(),
        };
        await addOrUpdatePerson(person);
        justImported.add(pco.id);
      }
      setImportedPeople((prev) => new Set([...prev, ...justImported]));
      setSelectedPeople(new Set());
      Alert.alert(
        "Team Imported",
        `${toImport.length} member${toImport.length !== 1 ? "s" : ""} added to your team.`
      );
    } catch (err) {
      Alert.alert("Import error", err.message || "Something went wrong.");
    } finally {
      setImportingPeople(false);
    }
  }, [people, selectedPeople]);

  const handleImportSongs = useCallback(async () => {
    const toImportIds = selectedSongs.size > 0 ? selectedSongs : null;
    const toImport = toImportIds
      ? songs.filter((s) => toImportIds.has(s.id))
      : songs;

    if (toImport.length === 0) {
      Alert.alert("Nothing to import", "No songs available.");
      return;
    }
    setImportingSongs(true);
    try {
      const existingSongs = await getSongs();
      const justImported = new Set();
      for (const pcoSong of toImport) {
        const dup = existingSongs.find(
          (s) =>
            s.title?.toLowerCase() === pcoSong.title?.toLowerCase() &&
            s.artist?.toLowerCase() === pcoSong.author?.toLowerCase()
        );
        const song = {
          id: dup?.id || makeId("pco_song"),
          title: pcoSong.title,
          artist: pcoSong.author || "",
          key: "",
          bpm: null,
          ccliNumber: pcoSong.ccliNumber || null,
          themes: pcoSong.themes || "",
          tags: ["from:pco"],
          pcoId: pcoSong.id,
          createdAt: dup?.createdAt || new Date().toISOString(),
        };
        await addOrUpdateSong(song);
        justImported.add(pcoSong.id);
      }
      setImportedSongs((prev) => new Set([...prev, ...justImported]));
      setSelectedSongs(new Set());
      Alert.alert(
        "Songs Imported",
        `${toImport.length} song${toImport.length !== 1 ? "s" : ""} added to your library.`
      );
    } catch (err) {
      Alert.alert("Import error", err.message || "Something went wrong.");
    } finally {
      setImportingSongs(false);
    }
  }, [songs, selectedSongs]);

  // ── Render helpers ────────────────────────────────────────────────────────────

  function renderConnectCard() {
    if (creds && !showConnectForm) {
      return (
        <Card style={styles.connectedCard}>
          <View style={styles.connectedRow}>
            <PCLogo size={36} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.connectedTitle}>
                {orgName ? `Connected — ${orgName}` : "Connected to Planning Center"}
              </Text>
              <Text style={styles.connectedSub}>App ID: {creds.appId.slice(0, 8)}…</Text>
            </View>
            <StatusPill connected />
          </View>
          <View style={styles.connectedActions}>
            <TouchableOpacity
              style={styles.switchCredsBtn}
              onPress={() => setShowConnectForm((v) => !v)}
            >
              <Text style={styles.switchCredsBtnText}>Change Credentials</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Text style={styles.disconnectBtnText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        </Card>
      );
    }

    return (
      <Card style={styles.connectCard}>
        <View style={styles.connectCardHeader}>
          <PCLogo size={40} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.connectCardTitle}>Connect Planning Center</Text>
            <Text style={styles.connectCardSub}>Use your Personal Access Token</Text>
          </View>
          <StatusPill connected={false} />
        </View>

        <Text style={styles.connectHint}>
          Get credentials at:{" "}
          <Text
            style={styles.connectHintLink}
            onPress={() =>
              Linking.openURL("https://api.planningcenteronline.com/oauth/applications")
            }
          >
            api.planningcenteronline.com → Apps
          </Text>
          {"\n"}Under "Personal Access Tokens", create a token and copy the App ID and Secret.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="App ID"
          placeholderTextColor="#4B5563"
          value={appId}
          onChangeText={setAppId}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Secret"
          placeholderTextColor="#4B5563"
          value={secret}
          onChangeText={setSecret}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleConnect}
        />

        <TouchableOpacity
          style={[styles.connectBtn, connecting && { opacity: 0.6 }]}
          onPress={handleConnect}
          disabled={connecting}
          activeOpacity={0.8}
        >
          {connecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.connectBtnText}>Connect to Planning Center →</Text>
          )}
        </TouchableOpacity>

        {creds && (
          <TouchableOpacity
            style={{ marginTop: 10, alignItems: "center" }}
            onPress={() => setShowConnectForm(false)}
          >
            <Text style={{ color: "#6B7280", fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
        )}
      </Card>
    );
  }

  function renderServicesTab() {
    if (!creds) return renderNotConnectedPrompt();

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.tabToolbar}>
          <Text style={styles.tabCount}>
            {servicesLoading ? "Loading…" : `${services.length} upcoming services`}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {services.length > 0 && (
              <>
                {selectedServices.size < services.length ? (
                  <TouchableOpacity onPress={() => selectAll(services, setSelectedServices)}>
                    <Text style={styles.toolbarAction}>Select All</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => deselectAll(setSelectedServices)}>
                    <Text style={styles.toolbarAction}>Deselect All</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            <TouchableOpacity onPress={loadServices}>
              <Text style={styles.toolbarAction}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        {servicesLoading && (
          <View style={styles.loadingState}>
            <ActivityIndicator color={PC_BLUE} size="large" />
            <Text style={styles.loadingText}>Fetching upcoming services…</Text>
          </View>
        )}

        {servicesError && !servicesLoading && (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{servicesError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadServices}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!servicesLoading && !servicesError && services.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyTitle}>No upcoming services found</Text>
            <Text style={styles.emptyText}>
              Make sure you have future plans in Planning Center.
            </Text>
          </View>
        )}

        {!servicesLoading && !servicesError && services.length > 0 && (
          <ScrollView contentContainerStyle={styles.listContent}>
            {services.map((svc) => {
              const checked = selectedServices.has(svc.id);
              const done = importedServices.has(svc.id);
              const dateStr = svc.sortDate
                ? new Date(svc.sortDate).toLocaleDateString("en-US", {
                    weekday: "short", month: "short", day: "numeric", year: "numeric",
                  })
                : svc.dates || "";

              return (
                <TouchableOpacity
                  key={svc.id}
                  style={[styles.listRow, checked && styles.listRowSelected]}
                  onPress={() => !done && toggleSelect(selectedServices, setSelectedServices, svc.id)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listRowTitle}>{svc.title}</Text>
                    <Text style={styles.listRowSub}>{svc.serviceTypeName}</Text>
                    {dateStr ? <Text style={styles.listRowDate}>{dateStr}</Text> : null}
                    {svc.publicNotes ? (
                      <Text style={styles.listRowNotes} numberOfLines={2}>
                        {svc.publicNotes}
                      </Text>
                    ) : null}
                  </View>
                  {done && (
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneBadgeText}>Imported</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 100 }} />
          </ScrollView>
        )}

        {selectedServices.size > 0 && (
          <View style={styles.importFooter}>
            <TouchableOpacity
              style={[styles.importFooterBtn, importingServices && { opacity: 0.6 }]}
              onPress={handleImportServices}
              disabled={importingServices}
            >
              {importingServices ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.importFooterBtnText}>
                  Import {selectedServices.size} Service{selectedServices.size !== 1 ? "s" : ""} →
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  function renderPeopleTab() {
    if (!creds) return renderNotConnectedPrompt();

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.tabToolbar}>
          <Text style={styles.tabCount}>
            {peopleLoading ? "Loading…" : `${people.length} team members`}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {people.length > 0 && (
              <>
                {selectedPeople.size < people.length ? (
                  <TouchableOpacity onPress={() => selectAll(people, setSelectedPeople)}>
                    <Text style={styles.toolbarAction}>Select All</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => deselectAll(setSelectedPeople)}>
                    <Text style={styles.toolbarAction}>Deselect All</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            <TouchableOpacity onPress={loadPeople}>
              <Text style={styles.toolbarAction}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        {peopleLoading && (
          <View style={styles.loadingState}>
            <ActivityIndicator color={PC_BLUE} size="large" />
            <Text style={styles.loadingText}>Fetching team members…</Text>
          </View>
        )}

        {peopleError && !peopleLoading && (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{peopleError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadPeople}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!peopleLoading && !peopleError && people.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No team members found</Text>
            <Text style={styles.emptyText}>
              Make sure your PCO account has access to the Services app people.
            </Text>
          </View>
        )}

        {!peopleLoading && !peopleError && people.length > 0 && (
          <ScrollView contentContainerStyle={styles.listContent}>
            {people.map((p) => {
              const checked = selectedPeople.has(p.id);
              const done = importedPeople.has(p.id);
              const initials = p.name
                ? p.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
                : "?";

              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.listRow, checked && styles.listRowSelected]}
                  onPress={() => !done && toggleSelect(selectedPeople, setSelectedPeople, p.id)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={styles.personAvatar}>
                    <Text style={styles.personAvatarText}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listRowTitle}>{p.name}</Text>
                    {p.email ? <Text style={styles.listRowSub}>{p.email}</Text> : null}
                  </View>
                  {done && (
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneBadgeText}>Imported</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 100 }} />
          </ScrollView>
        )}

        {selectedPeople.size > 0 && (
          <View style={styles.importFooter}>
            <TouchableOpacity
              style={[styles.importFooterBtn, importingPeople && { opacity: 0.6 }]}
              onPress={handleImportPeople}
              disabled={importingPeople}
            >
              {importingPeople ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.importFooterBtnText}>
                  Import {selectedPeople.size} Member{selectedPeople.size !== 1 ? "s" : ""} →
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  function renderSongsTab() {
    if (!creds) return renderNotConnectedPrompt();

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.tabToolbar}>
          <Text style={styles.tabCount}>
            {songsLoading ? "Loading…" : `${songs.length} songs`}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {songs.length > 0 && (
              <>
                {selectedSongs.size < songs.length ? (
                  <TouchableOpacity onPress={() => selectAll(songs, setSelectedSongs)}>
                    <Text style={styles.toolbarAction}>Select All</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => deselectAll(setSelectedSongs)}>
                    <Text style={styles.toolbarAction}>Deselect All</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            <TouchableOpacity onPress={loadSongs}>
              <Text style={styles.toolbarAction}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        {songsLoading && (
          <View style={styles.loadingState}>
            <ActivityIndicator color={PC_BLUE} size="large" />
            <Text style={styles.loadingText}>Fetching song library…</Text>
          </View>
        )}

        {songsError && !songsLoading && (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{songsError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadSongs}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!songsLoading && !songsError && songs.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎵</Text>
            <Text style={styles.emptyTitle}>No songs found</Text>
            <Text style={styles.emptyText}>
              Your Planning Center song library appears to be empty.
            </Text>
          </View>
        )}

        {!songsLoading && !songsError && songs.length > 0 && (
          <ScrollView contentContainerStyle={styles.listContent}>
            {songs.map((song) => {
              const checked = selectedSongs.has(song.id);
              const done = importedSongs.has(song.id);

              return (
                <TouchableOpacity
                  key={song.id}
                  style={[styles.listRow, checked && styles.listRowSelected]}
                  onPress={() => !done && toggleSelect(selectedSongs, setSelectedSongs, song.id)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listRowTitle}>{song.title}</Text>
                    {song.author ? <Text style={styles.listRowSub}>{song.author}</Text> : null}
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
                      {song.ccliNumber ? (
                        <Text style={styles.metaChip}>CCLI #{song.ccliNumber}</Text>
                      ) : null}
                      {song.themes ? (
                        <Text style={styles.metaChip}>{song.themes.slice(0, 30)}</Text>
                      ) : null}
                    </View>
                  </View>
                  {done && (
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneBadgeText}>Imported</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 100 }} />
          </ScrollView>
        )}

        {/* Footer: Import selected or Import All */}
        {!songsLoading && !songsError && songs.length > 0 && (
          <View style={styles.importFooter}>
            <TouchableOpacity
              style={[styles.importFooterBtn, importingSongs && { opacity: 0.6 }]}
              onPress={handleImportSongs}
              disabled={importingSongs}
            >
              {importingSongs ? (
                <ActivityIndicator color="#fff" />
              ) : selectedSongs.size > 0 ? (
                <Text style={styles.importFooterBtnText}>
                  Import {selectedSongs.size} Song{selectedSongs.size !== 1 ? "s" : ""} →
                </Text>
              ) : (
                <Text style={styles.importFooterBtnText}>
                  Import All {songs.length} Songs →
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  function renderNotConnectedPrompt() {
    return (
      <View style={styles.emptyState}>
        <PCLogo size={48} />
        <Text style={[styles.emptyTitle, { marginTop: 16 }]}>Connect Planning Center first</Text>
        <Text style={styles.emptyText}>
          Enter your App ID and Secret above to start importing.
        </Text>
      </View>
    );
  }

  // ── Root render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* ── Sticky header (connect card + tabs) ── */}
      <View style={styles.stickyTop}>
        {/* Page header row */}
        <View style={styles.pageHeader}>
          <PCLogo size={30} />
          <Text style={styles.pageTitle}>Planning Center</Text>
          <Text style={styles.pageSubtitle}>Online Integration</Text>
        </View>

        {/* Connection card */}
        <View style={[styles.connectSection, isIPad && { paddingHorizontal: 40 }]}>
          {renderConnectCard()}
        </View>

        {/* Tab bar — only shown when connected */}
        {creds && (
          <View style={styles.tabBar}>
            {TABS.map((tab, i) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabItem, activeTab === i && styles.tabItemActive]}
                onPress={() => setActiveTab(i)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabItemText, activeTab === i && styles.tabItemTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ── Tab content ── */}
      {creds ? (
        <View style={[styles.tabContent, isIPad && { paddingHorizontal: 20 }]}>
          {activeTab === 0 && renderServicesTab()}
          {activeTab === 1 && renderPeopleTab()}
          {activeTab === 2 && renderSongsTab()}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Enter your Planning Center credentials above to get started.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAV_BG },

  stickyTop: {
    backgroundColor: NAV_BG,
    borderBottomWidth: 1,
    borderBottomColor: "#0F172A",
    paddingBottom: 0,
  },

  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  pageTitle: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "900",
  },
  pageSubtitle: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 2,
    alignSelf: "flex-end",
    paddingBottom: 1,
  },

  connectSection: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },

  // Connection cards
  connectCard: {
    backgroundColor: "#0B1220",
    gap: 0,
  },
  connectCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  connectCardTitle: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "800",
  },
  connectCardSub: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 1,
  },
  connectHint: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  connectHintLink: {
    color: PC_BLUE,
  },
  input: {
    backgroundColor: "#111827",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1F2937",
    color: "#F9FAFB",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  connectBtn: {
    backgroundColor: PC_BLUE,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  connectBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  connectedCard: {
    backgroundColor: "#071226",
    borderColor: `${PC_BLUE}44`,
  },
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  connectedTitle: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "700",
  },
  connectedSub: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 2,
  },
  connectedActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    justifyContent: "flex-end",
  },
  switchCredsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
  },
  switchCredsBtnText: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
  },
  disconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#7F1D1D55",
    backgroundColor: "#0D0505",
  },
  disconnectBtnText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "600",
  },

  // Status pill
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusPillOk: {
    borderColor: "#14532D55",
    backgroundColor: "#0D1B0D",
  },
  statusPillOff: {
    borderColor: "#37415155",
    backgroundColor: "#111827",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Card
  card: {
    backgroundColor: "#0B1220",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 16,
  },

  // Section label
  sectionLabel: {
    color: "#9CA3AF",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 4,
  },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#111827",
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: {
    borderBottomColor: PC_BLUE,
  },
  tabItemText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
  },
  tabItemTextActive: {
    color: PC_BLUE,
    fontWeight: "700",
  },

  // Tab content area
  tabContent: {
    flex: 1,
  },

  // Toolbar
  tabToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#0F172A",
  },
  tabCount: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
  },
  toolbarAction: {
    color: PC_BLUE,
    fontSize: 12,
    fontWeight: "700",
  },

  // List items
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0B1220",
    marginBottom: 8,
  },
  listRowSelected: {
    borderColor: `${PC_BLUE}80`,
    backgroundColor: "#071226",
  },
  listRowTitle: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "700",
  },
  listRowSub: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 2,
  },
  listRowDate: {
    color: PC_BLUE,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
  },
  listRowNotes: {
    color: "#4B5563",
    fontSize: 11,
    marginTop: 3,
    lineHeight: 16,
  },

  // Checkbox
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxChecked: {
    borderColor: PC_BLUE,
    backgroundColor: PC_BLUE,
  },
  checkmark: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
  },

  // Person avatar
  personAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${PC_BLUE}33`,
    borderWidth: 1,
    borderColor: `${PC_BLUE}66`,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  personAvatarText: {
    color: "#93C5FD",
    fontSize: 13,
    fontWeight: "800",
  },

  // Done badge
  doneBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "#0D1B0D",
    borderWidth: 1,
    borderColor: "#14532D55",
  },
  doneBadgeText: {
    color: "#34D399",
    fontSize: 11,
    fontWeight: "700",
  },

  // Meta chip (CCLI, themes)
  metaChip: {
    color: "#4B5563",
    fontSize: 10,
    backgroundColor: "#111827",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },

  // Import footer
  importFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#111827",
    backgroundColor: NAV_BG,
  },
  importFooterBtn: {
    backgroundColor: PC_BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  importFooterBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  // Import button variants
  importBtnBase: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${PC_BLUE}66`,
    backgroundColor: "#071226",
    alignItems: "center",
    minWidth: 70,
  },
  importBtnLoading: {
    borderColor: "#374151",
    backgroundColor: "#111827",
  },
  importBtnDone: {
    borderColor: "#14532D55",
    backgroundColor: "#0D1B0D",
  },
  importBtnText: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "700",
  },
  importBtnDoneText: {
    color: "#34D399",
    fontSize: 12,
    fontWeight: "700",
  },

  // Retry button
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${PC_BLUE}66`,
    backgroundColor: "#071226",
  },
  retryBtnText: {
    color: PC_BLUE,
    fontSize: 13,
    fontWeight: "700",
  },

  // States
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 60,
  },
  loadingText: {
    color: "#6B7280",
    fontSize: 14,
  },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 60,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
});
