/**
 * PersonProfileScreen - Ultimate Musician
 * Full profile view for a team member with permissions management.
 */

import * as ImagePicker from "expo-image-picker";
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";

import { SYNC_URL, syncHeaders } from "./config";
import Chip from "../components/Chip";
import {
  ROLE_OPTIONS,
  formatRoleLabel,
  rolesToAssignmentString,
} from "../data/models";
import {
  addOrUpdatePerson,
  deletePerson,
  deletePersonFromCloud,
  getSettings,
  syncPersonToCloud,
} from "../data/storage";
import {
  getSharedTeamMembers,
  saveSharedTeamMembers,
  syncProfileToTeamMembers,
} from "../utils/sharedStorage";
const ROLE_LABEL = {
  worship_leader: "Worship Leader",
  md:             "Music Director",
  admin:          "Admin",
  org_owner:      "Org Owner",
};
const ROLE_COLOR = {
  worship_leader: "#10B981",
  md:             "#8B5CF6",
  admin:          "#F59E0B",
  org_owner:      "#EF4444",
};
const ROLE_ICON = { worship_leader: "🎵", md: "🎛", admin: "👑", org_owner: "🏛" };
const INVITE_HELPER_TEXT =
  "Invites are sent by email with your church or organization name, an accept link, and iPhone or Android install options. Registration confirmation codes are delivered by email.";

function normalizeInviteStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function shouldShowInviteAction(person) {
  if (!person) return false;
  return !(
    person?.playbackRegistered === true
    || Boolean(person?.playbackRegisteredAt)
    || Boolean(person?.inviteRegisteredAt)
    || normalizeInviteStatus(person?.inviteStatus) === "registered"
  );
}

function getAllowedCycle(viewerRole) {
  if (viewerRole === "org_owner") return [null, "worship_leader", "md", "admin", "org_owner"];
  if (viewerRole === "admin")     return [null, "worship_leader", "md"];
  return [null, "worship_leader"];
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, photo_url, size = 80, onPress }) {
  const initials = (name || "?")[0].toUpperCase();
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}
    >
      {photo_url ? (
        <Image
          source={{ uri: photo_url }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[s.avatarText, { fontSize: size * 0.38 }]}>
          {initials}
        </Text>
      )}
      {onPress && (
        <View style={s.avatarEditBadge}>
          <Text style={s.avatarEditBadgeText}>📷</Text>
        </View>
      )}
    </Wrapper>
  );
}

// ── Role picker (edit modal) ──────────────────────────────────────────────────
function RolePicker({ selected, onToggle }) {
  return (
    <View style={s.chipRow}>
      {ROLE_OPTIONS.map((role) => (
        <Chip
          key={role}
          label={formatRoleLabel(role)}
          selected={selected.includes(role)}
          onPress={() => onToggle(role)}
        />
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function PersonProfileScreen({ navigation, route }) {
  const { person: initialPerson } = route.params || {};
  const [person, setPerson] = useState(initialPerson || null);

  // Grant state
  const [grant, setGrant]             = useState(null);
  const [viewerRole, setViewerRole]   = useState(null);
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantSaving, setGrantSaving] = useState(false);
  const [grantError, setGrantError]   = useState(null);

  // Edit modal state
  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRoles, setEditRoles] = useState([]);
  const [editPhoto, setEditPhoto] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [inviteSenderName, setInviteSenderName] = useState("");

  // ── Load grant from sync server ───────────────────────────────────────────
  const loadGrant = useCallback(async () => {
    if (!person?.email) return;
    setGrantLoading(true);
    setGrantError(null);
    try {
      // Fetch target's grant
      const data = await fetchJson(
        `${SYNC_URL}/sync/grant?email=${encodeURIComponent(person.email.toLowerCase())}`,
        { headers: syncHeaders() },
      );
      setGrant(data.role || null);

      // Fetch viewer's own role to enforce grant restrictions
      const AsyncStorage = require("@react-native-async-storage/async-storage").default;
      const settingsRaw  = await AsyncStorage.getItem("settings.v1").catch(() => null);
      const settings     = settingsRaw ? JSON.parse(settingsRaw) : {};
      const viewerEmail  = (settings.email || "").toLowerCase();
      if (viewerEmail && viewerEmail !== person.email.toLowerCase()) {
        const vData = await fetchJson(
          `${SYNC_URL}/sync/grant?email=${encodeURIComponent(viewerEmail)}`,
          { headers: syncHeaders() },
        ).catch(() => null);
        setViewerRole(vData?.role || null);
      }
    } catch (_) {
      setGrantError("Cannot reach sync server");
    } finally {
      setGrantLoading(false);
    }
  }, [person?.email]);

  useEffect(() => {
    loadGrant();
  }, [loadGrant]);

  useEffect(() => {
    getSettings()
      .then((settings) => {
        const senderName = String(
          settings?.adminName || settings?.name || "",
        ).trim();
        if (senderName) {
          setInviteSenderName(senderName);
        }
      })
      .catch(() => {});
  }, []);

  if (!person) {
    return (
      <View style={s.root}>
        <Text style={{ color: "#9CA3AF", textAlign: "center", marginTop: 80 }}>
          No member selected.
        </Text>
      </View>
    );
  }

  // ── Grant cycling ─────────────────────────────────────────────────────────
  const cycleGrant = async () => {
    const email = (person.email || "").toLowerCase();
    if (!email) {
      Alert.alert("No Email", `${person.name} has no email — add one to grant permissions.`);
      return;
    }
    // org_owner is untouchable
    if (grant === "org_owner") {
      Alert.alert("🏛 Untouchable", "Org Owner role cannot be changed here.");
      return;
    }
    const allowedCycle   = getAllowedCycle(viewerRole);
    const currentInCycle = allowedCycle.includes(grant) ? grant : null;
    const nextIdx  = (allowedCycle.indexOf(currentInCycle) + 1) % allowedCycle.length;
    const nextRole = allowedCycle[nextIdx];
    setGrantSaving(true);
    try {
      if (nextRole === null) {
        await fetchJson(`${SYNC_URL}/sync/grant`, {
          method: "DELETE",
          headers: syncHeaders(),
          body: JSON.stringify({ email }),
        });
      } else {
        await fetchJson(`${SYNC_URL}/sync/grant`, {
          method: "POST",
          headers: syncHeaders(),
          body: JSON.stringify({ email, name: person.name, role: nextRole }),
        });
      }
      setGrant(nextRole);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setGrantSaving(false);
    }
  };

  // ── Edit handlers ─────────────────────────────────────────────────────────
  function openEdit() {
    setEditName(person.name || "");
    setEditEmail(person.email || "");
    setEditPhone(person.phone || "");
    setEditRoles(person.roles || []);
    setEditPhoto(person.photo_url || null);
    setEditModal(true);
  }

  function toggleEditRole(r) {
    setEditRoles((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  }

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setEditPhoto(
      asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri,
    );
  }

  async function handleSaveEdit() {
    if (!editName.trim()) {
      Alert.alert("Name required", "Name cannot be empty.");
      return;
    }
    setEditSaving(true);
    try {
      const updated = {
        ...person,
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        roles: editRoles,
        photo_url: editPhoto || null,
      };
      await addOrUpdatePerson(updated);
      await syncProfileToTeamMembers({
        id: updated._sharedId || updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        roles: updated.roles,
        roleAssignments: rolesToAssignmentString(updated.roles),
        photo_url: updated.photo_url || null,
      });
      await syncPersonToCloud({
        ...updated,
        id: updated._sharedId || updated.id,
      });
      setPerson(updated);
      setEditModal(false);
    } catch (e) {
      Alert.alert("Error saving", e.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    Alert.alert("Remove member?", `Remove ${person.name} from the team?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePerson(person.id);
            await deletePersonFromCloud(person);
            if (person._sharedId || person._source === "playback") {
              const members = await getSharedTeamMembers();
              const sharedId = person._sharedId || person.id;
              await saveSharedTeamMembers(
                members.filter((m) => m.id !== sharedId),
              );
            }
            navigation.goBack();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  }

  async function handleInvite() {
    const email = String(person?.email || "").trim().toLowerCase();
    const phone = String(person?.phone || "").trim();

    if (!email) {
      Alert.alert(
        "Email required",
        "Add an email address before sending an invite. Playback registration and confirmation codes are email-based.",
      );
      return;
    }

    try {
      const basePerson = {
        ...person,
        email,
        phone,
      };

      await addOrUpdatePerson(basePerson);
      await syncProfileToTeamMembers({
        id: basePerson._sharedId || basePerson.id,
        name: basePerson.name,
        email: basePerson.email,
        phone: basePerson.phone,
        roles: basePerson.roles,
        roleAssignments: rolesToAssignmentString(basePerson.roles || []),
        photo_url: basePerson.photo_url || null,
        inviteStatus: basePerson.inviteStatus || "",
        inviteToken: basePerson.inviteToken || "",
        inviteCreatedAt: basePerson.inviteCreatedAt || null,
        inviteSentAt: basePerson.inviteSentAt || null,
        inviteAcceptedAt: basePerson.inviteAcceptedAt || null,
        inviteRegisteredAt: basePerson.inviteRegisteredAt || null,
        playbackRegistered: basePerson.playbackRegistered === true,
        playbackRegisteredAt: basePerson.playbackRegisteredAt || null,
      });
      await syncPersonToCloud({
        ...basePerson,
        id: basePerson._sharedId || basePerson.id,
      });

      const res = await fetch(`${SYNC_URL}/sync/invite/create`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({
          name: basePerson.name,
          email,
          phone,
          sendEmail: true,
          invitedByName: inviteSenderName || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not send the invitation.");
      }

      const invitedPerson = {
        ...basePerson,
        inviteStatus: "pending",
        inviteToken: data?.token || basePerson?.inviteToken || "",
        inviteCreatedAt:
          data?.createdAt
          || basePerson?.inviteCreatedAt
          || new Date().toISOString(),
        inviteSentAt: new Date().toISOString(),
      };

      await addOrUpdatePerson(invitedPerson);
      await syncProfileToTeamMembers({
        id: invitedPerson._sharedId || invitedPerson.id,
        name: invitedPerson.name,
        email: invitedPerson.email,
        phone: invitedPerson.phone,
        roles: invitedPerson.roles,
        roleAssignments: rolesToAssignmentString(invitedPerson.roles || []),
        photo_url: invitedPerson.photo_url || null,
        inviteStatus: invitedPerson.inviteStatus || "",
        inviteToken: invitedPerson.inviteToken || "",
        inviteCreatedAt: invitedPerson.inviteCreatedAt || null,
        inviteSentAt: invitedPerson.inviteSentAt || null,
        inviteAcceptedAt: invitedPerson.inviteAcceptedAt || null,
        inviteRegisteredAt: invitedPerson.inviteRegisteredAt || null,
        playbackRegistered: invitedPerson.playbackRegistered === true,
        playbackRegisteredAt: invitedPerson.playbackRegisteredAt || null,
      });
      await syncPersonToCloud({
        ...invitedPerson,
        id: invitedPerson._sharedId || invitedPerson.id,
      });

      setPerson(invitedPerson);
      Alert.alert("Invitation Ready", "The invitation email was sent.");
    } catch (e) {
      Alert.alert("Invite failed", e.message || "Could not send the invitation.");
    }
  }

  const isFromPlayback =
    person._source === "playback" || person._source === "both";
  const roleList =
    (person.roles || []).map((role) => formatRoleLabel(role)).join(" · ") ||
    "No roles assigned";

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile Card ───────────────────────────────────────── */}
        <View style={s.profileCard}>
          <Avatar name={person.name} photo_url={person.photo_url} size={96} />

          <Text style={s.profileName}>{person.name}</Text>

          {/* Badges */}
          <View style={s.badgeRow}>
            {isFromPlayback && (
              <View style={s.upBadge}>
                <Text style={s.upBadgeText}>Playback</Text>
              </View>
            )}
            {grant && (
              <View
                style={[
                  s.grantBadge,
                  {
                    backgroundColor: ROLE_COLOR[grant] + "22",
                    borderColor: ROLE_COLOR[grant],
                  },
                ]}
              >
                <Text style={[s.grantBadgeText, { color: ROLE_COLOR[grant] }]}>
                  {ROLE_ICON[grant]} {ROLE_LABEL[grant]}
                </Text>
              </View>
            )}
          </View>

          {/* Contact info */}
          {person.email ? (
            <View style={s.infoRow}>
              <Text style={s.infoIcon}>✉️</Text>
              <Text style={s.infoValue}>{person.email}</Text>
            </View>
          ) : null}
          {person.phone ? (
            <View style={s.infoRow}>
              <Text style={s.infoIcon}>📱</Text>
              <Text style={s.infoValue}>{person.phone}</Text>
            </View>
          ) : null}

          {/* Roles */}
          <Text style={s.roleList}>{roleList}</Text>

          <TouchableOpacity style={s.editBtn} onPress={openEdit}>
            <Text style={s.editBtnText}>✏️ Edit Profile</Text>
          </TouchableOpacity>
          {shouldShowInviteAction(person) && (
            <TouchableOpacity style={s.inviteBtn} onPress={handleInvite}>
              <Text style={s.inviteBtnText}>Send Invitation</Text>
            </TouchableOpacity>
          )}
          {shouldShowInviteAction(person) && (
            <Text style={s.inviteHint}>{INVITE_HELPER_TEXT}</Text>
          )}
        </View>

        {/* ── Permissions Section ───────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🔐 App Permissions</Text>
          <Text style={s.sectionDesc}>
            Grant elevated access in Ultimate Playback. Tap the card below to
            cycle: None → Worship Leader → MD → Admin → None
          </Text>

          {!person.email ? (
            <View style={s.warningRow}>
              <Text style={s.warningText}>
                ⚠️ No email set — add an email to grant permissions.
              </Text>
            </View>
          ) : grantLoading ? (
            <ActivityIndicator color="#8B5CF6" style={{ marginVertical: 20 }} />
          ) : grantError ? (
            <View style={s.errorRow}>
              <Text style={s.errorText}>⚠️ {grantError}</Text>
              <TouchableOpacity onPress={loadGrant}>
                <Text style={s.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                s.grantCycleCard,
                grant && {
                  borderColor: ROLE_COLOR[grant],
                  backgroundColor: ROLE_COLOR[grant] + "12",
                },
              ]}
              onPress={cycleGrant}
              disabled={grantSaving || grant === "org_owner"}
            >
              {grantSaving ? (
                <ActivityIndicator color="#8B5CF6" />
              ) : (
                <View style={s.grantCycleInner}>
                  <Text style={s.grantCycleIcon}>
                    {grant ? ROLE_ICON[grant] : "🚫"}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        s.grantCycleName,
                        grant && { color: ROLE_COLOR[grant] },
                      ]}
                    >
                      {grant ? ROLE_LABEL[grant] : "No Special Role"}
                    </Text>
                    <Text style={s.grantCycleHint}>
                      {grant === "org_owner"
                        ? "🏛 Untouchable — cannot be changed"
                        : grant === null
                          ? "Tap to assign Worship Leader"
                          : grant === "worship_leader"
                            ? "Tap to promote to Music Director"
                            : grant === "md"
                              ? viewerRole === "org_owner" ? "Tap to promote to Admin" : "Tap to remove role"
                              : grant === "admin"
                                ? viewerRole === "org_owner" ? "Tap to promote to Org Owner" : "Tap to remove role"
                                : "Tap to remove role"}
                    </Text>
                  </View>
                  <Text
                    style={[
                      s.grantCycleArrow,
                      grant && { color: ROLE_COLOR[grant] },
                    ]}
                  >
                    ⟳
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Legend */}
          <View style={s.legendRow}>
            <View style={s.legendItem}>
              <Text style={s.legendIcon}>🎵</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.legendLabel}>Worship Leader</Text>
                <Text style={s.legendDesc}>
                  Can plan services, add songs and assign team members in
                  Playback
                </Text>
              </View>
            </View>
            <View style={s.legendItem}>
              <Text style={s.legendIcon}>🎛</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.legendLabel}>Music Director</Text>
                <Text style={s.legendDesc}>
                  Receives all team messages, can manage services, team & songs
                  in Playback
                </Text>
              </View>
            </View>
            <View style={s.legendItem}>
              <Text style={s.legendIcon}>👑</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.legendLabel}>Admin</Text>
                <Text style={s.legendDesc}>
                  Full MD access + can approve content edits from the team
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Remove button ──────────────────────────────────────── */}
        <TouchableOpacity style={s.removeBtn} onPress={handleDelete}>
          <Text style={s.removeBtnText}>Remove from Team</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Edit Profile Modal ──────────────────────────────────── */}
      <Modal
        visible={editModal}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={s.modalOverlay}
        >
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModal(false)}>
                <Text style={s.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Photo */}
              <View style={s.photoRow}>
                <Avatar
                  name={editName || "?"}
                  photo_url={editPhoto}
                  size={72}
                  onPress={handlePickPhoto}
                />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={s.photoHint}>Tap photo to change avatar</Text>
                  {editPhoto && (
                    <TouchableOpacity onPress={() => setEditPhoto(null)}>
                      <Text style={s.removePhotoLink}>Remove photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <Text style={s.fieldLabel}>Name *</Text>
              <TextInput
                style={s.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Full name"
                placeholderTextColor="#4B5563"
              />

              <Text style={s.fieldLabel}>Email</Text>
              <TextInput
                style={s.input}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="email@example.com"
                placeholderTextColor="#4B5563"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={s.fieldLabel}>Phone</Text>
              <TextInput
                style={s.input}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="+1 555 000 0000"
                placeholderTextColor="#4B5563"
                keyboardType="phone-pad"
              />

              <Text style={s.fieldLabel}>Roles</Text>
              <RolePicker selected={editRoles} onToggle={toggleEditRole} />

              <View style={{ marginTop: 20, gap: 10 }}>
                <TouchableOpacity
                  style={[s.saveBtn, editSaving && { opacity: 0.6 }]}
                  onPress={handleSaveEdit}
                  disabled={editSaving}
                >
                  {editSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.saveBtnText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  scroll: { padding: 16, paddingBottom: 40 },

  // Profile card
  profileCard: {
    backgroundColor: "#0B1120",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  profileName: {
    color: "#F9FAFB",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 14,
    marginBottom: 8,
    textAlign: "center",
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 12,
  },
  upBadge: {
    backgroundColor: "#1E3A5F",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#2563EB",
  },
  upBadgeText: {
    color: "#60A5FA",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  grantBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  grantBadgeText: { fontSize: 13, fontWeight: "700" },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    marginBottom: 6,
  },
  infoIcon: { fontSize: 16, width: 24, textAlign: "center" },
  infoValue: { color: "#9CA3AF", fontSize: 14, flex: 1 },

  roleList: {
    color: "#818CF8",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 18,
  },

  editBtn: {
    backgroundColor: "#1E3A5F",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 4,
  },
  editBtnText: { color: "#60A5FA", fontWeight: "700", fontSize: 14 },
  inviteBtn: {
    backgroundColor: "#312E81",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#8B5CF6",
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 10,
  },
  inviteBtnText: { color: "#C4B5FD", fontWeight: "800", fontSize: 14 },
  inviteHint: {
    color: "#6B7280",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 10,
  },

  // Section
  section: {
    backgroundColor: "#0B1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  sectionDesc: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },

  warningRow: {
    padding: 12,
    backgroundColor: "#7C2D1220",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F97316",
    marginBottom: 12,
  },
  warningText: { color: "#F97316", fontSize: 13 },

  errorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#7C2D1220",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F97316",
    marginBottom: 12,
  },
  errorText: { color: "#F97316", fontSize: 13, flex: 1 },
  retryText: {
    color: "#F97316",
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 10,
  },

  // Grant cycle card
  grantCycleCard: {
    backgroundColor: "#1F2937",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    padding: 14,
    marginBottom: 16,
  },
  grantCycleInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  grantCycleIcon: { fontSize: 28 },
  grantCycleName: {
    color: "#E5E7EB",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 2,
  },
  grantCycleHint: { color: "#6B7280", fontSize: 11 },
  grantCycleArrow: { fontSize: 20, color: "#4B5563", fontWeight: "700" },

  // Legend
  legendRow: { gap: 10 },
  legendItem: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  legendIcon: { fontSize: 18, marginTop: 2 },
  legendLabel: {
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  legendDesc: { color: "#6B7280", fontSize: 11, lineHeight: 16 },

  // Remove
  removeBtn: {
    borderWidth: 1,
    borderColor: "#7F1D1D",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  removeBtnText: { color: "#EF4444", fontWeight: "800", fontSize: 15 },

  // Avatar
  avatar: {
    backgroundColor: "#312E81",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: { color: "#A5B4FC", fontWeight: "900" },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#1E3A5F",
    borderRadius: 8,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEditBadgeText: { fontSize: 11 },

  // Edit modal
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
    maxHeight: "92%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { color: "#F9FAFB", fontSize: 18, fontWeight: "900" },
  modalClose: { color: "#6B7280", fontWeight: "700", fontSize: 14 },

  photoRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  photoHint: { color: "#6B7280", fontSize: 12 },
  removePhotoLink: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },

  fieldLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#020617",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1F2937",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#E5E7EB",
    fontSize: 14,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },

  saveBtn: {
    backgroundColor: "#16A34A",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
});
