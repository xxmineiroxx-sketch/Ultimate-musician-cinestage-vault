import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Share,
  Clipboard,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { SYNC_URL, syncHeaders } from "./config";
import { getBrainStats, getPersonHistory } from "../services/cinestageDataAPI";
import Chip from "../components/Chip";
import {
  makeId,
  ROLE_OPTIONS,
  formatRoleLabel,
  rolesToAssignmentString,
} from "../data/models";
import {
  addOrUpdatePerson,
  deletePerson,
  deletePersonFromCloud,
  getSettings,
  getPeople,
  syncPersonToCloud,
} from "../data/storage";
import {
  getSharedTeamMembers,
  saveSharedTeamMembers,
  syncProfileToTeamMembers,
} from "../utils/sharedStorage";

const ORG_ROLE_LABELS = { owner: "Organization Owner", admin: "Admin", worship_leader: "Worship Leader" };
const ORG_ROLE_COLORS = { owner: "#EAB308", admin: "#F59E0B", worship_leader: "#8B5CF6" };
const INVITE_HELPER_TEXT =
  "Invites are sent by email with your church or organization name, an accept link, and iPhone or Android install options. Registration confirmation codes are delivered by email.";

function normalizeInviteStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function getEffectiveInviteStatus(person) {
  const inviteStatus = normalizeInviteStatus(person?.inviteStatus);
  const isRegistered =
    person?.playbackRegistered === true
    || Boolean(person?.playbackRegisteredAt)
    || Boolean(person?.inviteRegisteredAt);

  if (isRegistered || inviteStatus === "registered") return "registered";
  if (person?.inviteAcceptedAt) {
    return inviteStatus === "registered" ? inviteStatus : "accepted";
  }
  return inviteStatus;
}

function shouldShowInviteAction(person) {
  if (!person) return false;
  const inviteStatus = getEffectiveInviteStatus(person);
  return !(
    person?.playbackRegistered
    || person?.playbackRegisteredAt
    || person?.inviteRegisteredAt
    || inviteStatus === "registered"
  );
}

// ─── Photo picker helper ──────────────────────────────────────────────────────
async function pickPhoto() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Permission needed",
      "Allow access to your photo library to upload an avatar.",
    );
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
}

// ─── Avatar component ─────────────────────────────────────────────────────────
function Avatar({ name, photo_url, size = 44, onPress }) {
  const initials = (name || "?")[0].toUpperCase();
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {photo_url ? (
        <Image
          source={{ uri: photo_url }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>
          {initials}
        </Text>
      )}
      {onPress && (
        <View style={styles.avatarEditBadge}>
          <Text style={styles.avatarEditBadgeText}>📷</Text>
        </View>
      )}
    </Wrapper>
  );
}

// ─── Role picker ──────────────────────────────────────────────────────────────
function RolePicker({ selected, onToggle }) {
  return (
    <View style={styles.chipRow}>
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

// ─── Person card ──────────────────────────────────────────────────────────────
function PersonCard({
  person,
  onInvite,
  onViewProfile,
  orgRole,
  onSetOrgRole,
  showInvite,
  servedTotal,
  lastServed,
  myRole,
}) {
  const isFromPlayback =
    person._source === "playback" || person._source === "both";
  const roleList =
    (person.roles || []).map((role) => formatRoleLabel(role)).join(", ") ||
    "No roles assigned";

  function handleLongPress() {
    const isOwner = myRole === "owner";
    const isAdmin = myRole === "admin";
    if (!isOwner && !isAdmin) return; // non-admins: long-press does nothing

    const buttons = [];
    if (isOwner) {
      buttons.push({ text: "Organization Owner", onPress: () => onSetOrgRole(person, "owner") });
      buttons.push({ text: "Admin", onPress: () => onSetOrgRole(person, "admin") });
    }
    buttons.push({ text: "Worship Leader", onPress: () => onSetOrgRole(person, "worship_leader") });
    buttons.push({ text: "Remove Role", style: "destructive", onPress: () => onSetOrgRole(person, null) });
    buttons.push({ text: "Cancel", style: "cancel" });

    Alert.alert(`Role for ${person.name}`, "Set this person's organizational role:", buttons);
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onViewProfile(person)}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
      delayLongPress={600}
    >
      <Avatar name={person.name} photo_url={person.photo_url} size={56} />
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <Text style={styles.personName}>{person.name}</Text>
          {isFromPlayback && (
            <View style={styles.upBadge}>
              <Text style={styles.upBadgeText}>PLAYBACK</Text>
            </View>
          )}
          {orgRole && (
            <View
              style={[
                styles.orgRoleBadge,
                {
                  borderColor: ORG_ROLE_COLORS[orgRole] || "#6B7280",
                  backgroundColor: (ORG_ROLE_COLORS[orgRole] || "#6B7280") + "22",
                },
              ]}
            >
              <Text
                style={[
                  styles.orgRoleBadgeText,
                  { color: ORG_ROLE_COLORS[orgRole] || "#94A3B8" },
                ]}
              >
                {ORG_ROLE_LABELS[orgRole] || orgRole}
              </Text>
            </View>
          )}
          {getEffectiveInviteStatus(person) === "registered" &&
            person.inviteRegisteredAt &&
            Date.now() - new Date(person.inviteRegisteredAt).getTime() < 48 * 3600 * 1000 && (
            <View style={styles.joinedBadge}>
              <Text style={styles.joinedBadgeText}>✓ Joined</Text>
            </View>
          )}
        </View>
        {person.email || person.phone ? (
          <Text style={styles.personMeta}>{person.email || person.phone}</Text>
        ) : null}
        <Text style={styles.rolesText}>{roleList}</Text>
        
        {servedTotal > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.servedBadge}>
              <Text style={styles.servedBadgeText}>Served {servedTotal}×</Text>
            </View>
            {lastServed ? (
              <Text style={styles.lastServedText}>Last: {lastServed}</Text>
            ) : null}
          </View>
        )}
        
        {showInvite && (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.cardInviteBtn}
              onPress={() => onInvite(person)}
              activeOpacity={0.8}
            >
              <Text style={styles.cardInviteBtnText}>Send Invite</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <Text style={styles.editHint}>›</Text>
    </TouchableOpacity>
  );
}

function getPersonCardKey(person, index) {
  const sharedId = String(person?._sharedId || "").trim();
  const email = String(person?.email || "").trim().toLowerCase();
  const phone = String(person?.phone || "").replace(/\D+/g, "");
  const id = String(person?.id || "").trim();
  const parts = [
    sharedId ? `shared:${sharedId}` : "",
    email ? `email:${email}` : "",
    phone ? `phone:${phone}` : "",
    id ? `id:${id}` : "",
  ].filter(Boolean);

  return `${parts.join("|") || "person"}:${index}`;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PeopleRolesScreen({ navigation }) {
  const [people, setPeople] = useState([]);
  const [myRole, setMyRole] = useState(null); // current user's org role
  const [orgRoles, setOrgRoles] = useState({}); // { "email": "admin" | "worship_leader" }
  const [brainStats, setBrainStats] = useState({}); // { [personId]: { total, byRole, lastServed } }

  // Add form
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addRoles, setAddRoles] = useState([]);
  const [addPhoto, setAddPhoto] = useState(null);

  // Edit modal
  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRoles, setEditRoles] = useState([]);
  const [editPhoto, setEditPhoto] = useState(null);
  const [inviteSenderName, setInviteSenderName] = useState("");

  // ── Load & merge ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const localPeople = await getPeople();
    setPeople(localPeople);
    // Pull cloud to pick up roles + registration confirmed by Playback
    try {
      const res = await fetch(`${SYNC_URL}/sync/people`, { headers: syncHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const cloudList = Array.isArray(data) ? data : (data?.people || []);
      let changed = false;
      const merged = localPeople.map((local) => {
        const cloud = cloudList.find((c) =>
          (c.email && c.email === local.email) ||
          (c.phone && c.phone === local.phone) ||
          c.id === local.id
        );
        if (!cloud) return local;

        const cloudHasRoles = Array.isArray(cloud.roles) && cloud.roles.length > 0;
        const cloudIsRegistered = cloud.playbackRegistered || cloud.inviteStatus === "registered";
        const cloudUpdatedAt = new Date(cloud.updatedAt || 0).getTime();
        const localUpdatedAt = new Date(local.updatedAt || 0).getTime();
        const cloudIsNewer = cloudUpdatedAt > localUpdatedAt;

        let updated = { ...local };
        let didChange = false;

        // Sync registration + roles when Playback has confirmed them
        if (cloudIsRegistered && cloudHasRoles) {
          updated = {
            ...updated,
            roles: cloud.roles,
            roleAssignments: cloud.roleAssignments || cloud.roles.join(", "),
            inviteStatus: "registered",
            playbackRegistered: true,
            playbackRegisteredAt: cloud.playbackRegisteredAt || local.playbackRegisteredAt,
            inviteRegisteredAt: cloud.inviteRegisteredAt || local.inviteRegisteredAt,
          };
          didChange = true;
        }

        // Sync name / photo / lastName when the cloud version is newer
        // (covers profile updates made in the Playback app)
        if (cloudIsNewer) {
          if (cloud.name && cloud.name !== local.name) {
            updated.name = cloud.name; didChange = true;
          }
          if (cloud.lastName !== undefined && cloud.lastName !== local.lastName) {
            updated.lastName = cloud.lastName; didChange = true;
          }
          if (cloud.photo_url && cloud.photo_url !== local.photo_url) {
            updated.photo_url = cloud.photo_url; didChange = true;
          }
          if (didChange) updated.updatedAt = cloud.updatedAt;
        }

        if (didChange) {
          changed = true;
          addOrUpdatePerson(updated).catch(() => {});
          return updated;
        }
        return local;
      });
      if (changed) setPeople(merged);
    } catch { /* no-op */ }
  }, []);

  const loadOrgRoles = useCallback(async () => {
    try {
      const res = await fetch(`${SYNC_URL}/sync/roles`, {
        headers: syncHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setOrgRoles(data || {});
      }
    } catch {
      /* no-op */
    }
  }, []);

  async function handleSetOrgRole(person, role) {
    // Permission check: owner can set any role, admin can set worship_leader or remove,
    // worship_leader cannot grant org roles at all.
    const isOwner = myRole === "owner";
    const isAdmin = myRole === "admin";
    if (!isOwner && !isAdmin) {
      Alert.alert("Permission Denied", "Only Admins and Org Owners can assign organization roles.");
      return;
    }
    if (!isOwner && role === "owner") {
      Alert.alert("Permission Denied", "Only an Organization Owner can grant the Owner role.");
      return;
    }
    if (!isOwner && role === "admin") {
      Alert.alert("Permission Denied", "Only an Organization Owner can grant the Admin role.");
      return;
    }

    const email = (person.email || "").toLowerCase().trim();
    if (!email) {
      Alert.alert(
        "No email",
        "This person has no email address — needed to assign a role.",
      );
      return;
    }
    try {
      const res = await fetch(`${SYNC_URL}/sync/role/set`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (data.ok) {
        setOrgRoles((prev) => {
          const next = { ...prev };
          if (role === null) delete next[email];
          else next[email] = role;
          return next;
        });
        Alert.alert(
          "Role Updated",
          role
            ? `${person.name} is now ${ORG_ROLE_LABELS[role] || role}.`
            : `${person.name}'s role has been removed.`,
        );
      }
    } catch {
      Alert.alert("Error", "Could not update role. Check your connection.");
    }
  }

  // Load the current user's own org role
  const loadMyRole = useCallback(async () => {
    try {
      const email = await AsyncStorage.getItem("@user_email");
      if (!email) return;
      const res = await fetch(`${SYNC_URL}/sync/role?email=${encodeURIComponent(email)}`, {
        headers: syncHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.role) setMyRole(data.role);
      }
    } catch { /* no-op */ }
  }, []);

  useEffect(() => {
    const unsub = navigation?.addListener?.("focus", () => {
      load();
      loadOrgRoles();
      loadMyRole();
    });
    load();
    loadOrgRoles();
    loadMyRole();
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
    getBrainStats().then(({ stats }) => { if (stats) setBrainStats(stats); }).catch(() => {});
    return unsub;
  }, [navigation, load, loadOrgRoles, loadMyRole]);

  // ── Shared sync helper ──────────────────────────────────────────────────────
  async function syncToShared(person) {
    await syncProfileToTeamMembers({
      id: person._sharedId || person.id,
      name: person.name,
      email: person.email,
      phone: person.phone,
      roles: person.roles,
      roleAssignments: rolesToAssignmentString(person.roles),
      photo_url: person.photo_url || null,
      inviteStatus: person.inviteStatus || "",
      inviteToken: person.inviteToken || "",
      inviteCreatedAt: person.inviteCreatedAt || null,
      inviteSentAt: person.inviteSentAt || null,
      inviteAcceptedAt: person.inviteAcceptedAt || null,
      inviteRegisteredAt: person.inviteRegisteredAt || null,
      playbackRegistered: person.playbackRegistered === true,
      playbackRegisteredAt: person.playbackRegisteredAt || null,
    });
  }

  async function syncToServer(person) {
    await syncPersonToCloud({
      ...person,
      id: person._sharedId || person.id,
    });
  }

  async function copyInviteLink(inviteLink) {
    const link = String(inviteLink || "").trim();
    if (!link) {
      throw new Error("Could not prepare the invite link.");
    }

    if (Clipboard?.setString) {
      Clipboard.setString(link);
      return "copied";
    }

    await Share.share({
      message: link,
      title: "Team Invitation",
    });
    return "shared";
  }

  async function sendInvite(person, channels = []) {
    const email = String(person?.email || "").trim().toLowerCase();
    const phone = String(person?.phone || "").trim();
    const wantsEmail = channels.includes("email");
    const wantsCopy = channels.includes("copy");

    if (!email) {
      Alert.alert(
        "Email required",
        "Add an email address before sending an invite. Playback account verification is email-based.",
      );
      return;
    }

    try {
      await syncToServer(person);
      const res = await fetch(`${SYNC_URL}/sync/invite/create`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({
          name: person.name,
          email,
          phone,
          sendEmail: wantsEmail,
          invitedByName: inviteSenderName || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not prepare the invitation.");
      }

      let copyMode = "";
      if (wantsCopy) {
        copyMode = await copyInviteLink(
          data.downloadLinks?.landing || data.shareText || "",
        );
      }

      await addOrUpdatePerson({
        ...person,
        inviteStatus: "pending",
        inviteToken: data?.token || person?.inviteToken || "",
        inviteCreatedAt:
          data?.createdAt ||
          person?.inviteCreatedAt ||
          new Date().toISOString(),
        inviteSentAt: new Date().toISOString(),
      });
      load();

      Alert.alert(
        "Invitation Ready",
        wantsEmail && wantsCopy
          ? copyMode === "copied"
            ? "The invitation email was sent and the invite link was copied."
            : "The invitation email was sent and the invite link was opened in the share sheet."
          : wantsEmail
            ? "The invitation email was sent."
            : copyMode === "copied"
              ? "The invite link was copied."
              : "The invite link was opened in the share sheet.",
      );
    } catch (e) {
      Alert.alert("Invite failed", e.message || "Could not send the invitation.");
    }
  }

  function promptInvite(person) {
    const email = String(person?.email || "").trim().toLowerCase();
    const canInvite = Boolean(email);

    if (!canInvite) {
      Alert.alert(
        "Email required",
        "Add an email address to this team member before sending the invitation. Playback registration and confirmation codes are email-based.",
      );
      return;
    }

    const buttons = [];
    if (email) {
      buttons.push({
        text: "Send Email",
        onPress: () => sendInvite(person, ["email"]),
      });
      buttons.push({
        text: "Copy Invite Link",
        onPress: () => sendInvite(person, ["copy"]),
      });
      buttons.push({
        text: "Email + Copy Link",
        onPress: () => sendInvite(person, ["email", "copy"]),
      });
    }
    buttons.push({ text: "Later", style: "cancel" });

    Alert.alert("Send invitation now?", INVITE_HELPER_TEXT, buttons);
  }

  // ── Add handlers ────────────────────────────────────────────────────────────
  function toggleAddRole(r) {
    setAddRoles((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  }

  async function handlePickAddPhoto() {
    const uri = await pickPhoto();
    if (uri) setAddPhoto(uri);
  }

  async function handleAdd() {
    if (!addName.trim()) {
      Alert.alert("Name required", "Enter the team member's name.");
      return;
    }
    // Capture before clearing state
    const name  = addName.trim();
    const email = addEmail.trim();
    const phone = addPhone.trim();

    const person = {
      id: makeId("person"),
      name,
      email,
      phone,
      roles: addRoles,
      photo_url: addPhoto || null,
      inviteStatus: "ready",
      inviteCreatedAt: new Date().toISOString(),
      playbackRegistered: false,
    };
    const saved = await addOrUpdatePerson(person);
    await syncToShared(saved);
    await syncToServer(saved);
    setAddName("");
    setAddEmail("");
    setAddPhone("");
    setAddRoles([]);
    setAddPhoto(null);
    setAddFormOpen(false);
    load();
    Alert.alert(
      "Member Added",
      "Use the Invite button on this new member card when you're ready to send the invitation.",
    );
  }

  // ── Edit handlers ───────────────────────────────────────────────────────────
  function openEdit(person) {
    setEditTarget(person);
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

  async function handlePickEditPhoto() {
    const uri = await pickPhoto();
    if (uri) setEditPhoto(uri);
  }

  async function handleSaveEdit() {
    if (!editName.trim()) {
      Alert.alert("Name required", "Name cannot be empty.");
      return;
    }
    const updated = {
      ...editTarget,
      name: editName.trim(),
      email: editEmail.trim(),
      phone: editPhone.trim(),
      roles: editRoles,
      photo_url: editPhoto || null,
    };

    // Playback-only members don't exist in local storage — add them there too
    await addOrUpdatePerson(updated);
    await syncToShared(updated);
    await syncToServer(updated);
    setEditModal(false);
    load();
  }

  async function handleInviteFromEdit() {
    const draft = {
      ...editTarget,
      name: editName.trim(),
      email: editEmail.trim(),
      phone: editPhone.trim(),
      roles: editRoles,
      photo_url: editPhoto || null,
    };

    if (!draft.name) {
      Alert.alert("Name required", "Name cannot be empty.");
      return;
    }

    await addOrUpdatePerson(draft);
    await syncToShared(draft);
    await syncToServer(draft);
    setEditTarget(draft);
    load();
    promptInvite(draft);
  }

  async function handleDeletePerson() {
    Alert.alert("Remove member?", `Remove ${editTarget?.name} from the team?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          // Remove from local storage
          await deletePerson(editTarget.id);
          await deletePersonFromCloud(editTarget);
          // Remove from shared storage
          if (editTarget._sharedId || editTarget._source === "playback") {
            const members = await getSharedTeamMembers();
            const sharedId = editTarget._sharedId || editTarget.id;
            await saveSharedTeamMembers(
              members.filter((m) => m.id !== sharedId),
            );
          }
          setEditModal(false);
          load();
        },
      },
    ]);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const playbackCount = people.filter(
    (p) => p._source === "playback" || p._source === "both",
  ).length;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.heading}>People & Roles</Text>
            <Text style={styles.caption}>
              {people.length} member{people.length !== 1 ? "s" : ""}
              {playbackCount > 0 ? ` · ${playbackCount} from Playback` : ""}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addMemberBtn}
            onPress={() => setAddFormOpen((v) => !v)}
          >
            <Text style={styles.addMemberBtnText}>
              {addFormOpen ? "✕ Cancel" : "+ Add Member"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Add form ──────────────────────────────────────────── */}
        {addFormOpen && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Team Member</Text>

            {/* Photo picker */}
            <View style={styles.photoRow}>
              <Avatar
                name={addName || "?"}
                photo_url={addPhoto}
                size={64}
                onPress={handlePickAddPhoto}
              />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.photoHint}>
                  Tap photo to upload an avatar
                </Text>
                {addPhoto && (
                  <TouchableOpacity onPress={() => setAddPhoto(null)}>
                    <Text style={styles.removePhotoLink}>Remove photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput
              style={styles.input}
              value={addName}
              onChangeText={setAddName}
              placeholder="Full name"
              placeholderTextColor="#4B5563"
            />

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={addEmail}
              onChangeText={setAddEmail}
              placeholder="email@example.com"
              placeholderTextColor="#4B5563"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={styles.input}
              value={addPhone}
              onChangeText={setAddPhone}
              placeholder="+1 555 000 0000"
              placeholderTextColor="#4B5563"
              keyboardType="phone-pad"
            />
            <Text style={styles.roleHint}>{INVITE_HELPER_TEXT}</Text>

            <Text style={styles.fieldLabel}>Roles</Text>
            <RolePicker selected={addRoles} onToggle={toggleAddRole} />
            {addRoles.length === 0 && (
              <Text style={styles.roleHint}>
                Tap a role above to select it.
              </Text>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
              <Text style={styles.saveBtnText}>Add Team Member</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── People list ───────────────────────────────────────── */}
        {people.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No team members yet.</Text>
            <Text style={styles.emptySubText}>
              Tap "+ Add Member" to get started.
            </Text>
          </View>
        ) : (
          people.map((person, index) => (
            <PersonCard
              key={getPersonCardKey(person, index)}
              person={person}
              onInvite={promptInvite}
              showInvite={shouldShowInviteAction(person)}
              onViewProfile={(p) =>
                navigation.navigate("PersonProfile", { person: p })
              }
              orgRole={orgRoles[(person.email || "").toLowerCase()] || null}
              onSetOrgRole={handleSetOrgRole}
              myRole={myRole}
              servedTotal={(brainStats[person.id] || {}).total || 0}
              lastServed={(brainStats[person.id] || {}).lastServed || ""}
            />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Edit Member Modal ────────────────────────────────────── */}
      <Modal
        visible={editModal}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Member</Text>
              <TouchableOpacity onPress={() => setEditModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Photo picker */}
              <View style={styles.photoRow}>
                <Avatar
                  name={editName || "?"}
                  photo_url={editPhoto}
                  size={72}
                  onPress={handlePickEditPhoto}
                />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.photoHint}>
                    Tap photo to change avatar
                  </Text>
                  {editPhoto && (
                    <TouchableOpacity onPress={() => setEditPhoto(null)}>
                      <Text style={styles.removePhotoLink}>Remove photo</Text>
                    </TouchableOpacity>
                  )}
                  {editTarget?._source === "playback" && (
                    <View
                      style={[
                        styles.upBadge,
                        { marginTop: 6, alignSelf: "flex-start" },
                      ]}
                    >
                      <Text style={styles.upBadgeText}>
                        Synced from Playback
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Full name"
                placeholderTextColor="#4B5563"
              />

              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="email@example.com"
                placeholderTextColor="#4B5563"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.input}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="+1 555 000 0000"
                placeholderTextColor="#4B5563"
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Roles</Text>
              <RolePicker selected={editRoles} onToggle={toggleEditRole} />
              {editRoles.length === 0 && (
                <Text style={styles.roleHint}>
                  Tap a role above to select it.
                </Text>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveEdit}
                >
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>
                {shouldShowInviteAction(editTarget) && (
                  <TouchableOpacity
                    style={styles.inviteBtn}
                    onPress={handleInviteFromEdit}
                  >
                    <Text style={styles.inviteBtnText}>Send Invitation</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={handleDeletePerson}
                >
                  <Text style={styles.deleteBtnText}>Remove Member</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  scroll: { padding: 24, paddingBottom: 80, maxWidth: 800, alignSelf: 'center', width: '100%' },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  heading: { color: "#F8FAFC", fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  caption: { color: "#94A3B8", fontSize: 15, marginTop: 4, fontWeight: "500" },

  addMemberBtn: {
    backgroundColor: "#1E1B4B",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#4F46E5",
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  addMemberBtnText: { color: "#A5B4FC", fontWeight: "800", fontSize: 14 },

  // Add form
  formCard: {
    backgroundColor: "#0B1120",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 24,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  formTitle: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 20,
    letterSpacing: -0.3,
  },

  photoRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  photoHint: { color: "#64748B", fontSize: 13, fontWeight: "500", marginLeft: 16 },
  removePhotoLink: {
    color: "#EF4444",
    fontSize: 13,
    marginTop: 6,
    fontWeight: "700",
    marginLeft: 16,
  },

  fieldLabel: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 16,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#050608",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "500"
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 8 },
  roleHint: { color: "#475569", fontSize: 12, marginTop: 8, marginBottom: 8, fontStyle: "italic" },

  saveBtn: {
    backgroundColor: "#064E3B",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#10B981",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  saveBtnText: { color: "#34D399", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },

  // Person card
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 20,
    marginBottom: 12,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  personName: { color: "#F8FAFC", fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  personMeta: { color: "#94A3B8", fontSize: 13, marginTop: 4, fontWeight: "500" },
  rolesText: {
    color: "#6366F1",
    fontSize: 12,
    marginTop: 6,
    fontWeight: "700",
  },
  
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  lastServedText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: "600"
  },

  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  cardInviteBtn: {
    backgroundColor: "#1E1B4B",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4F46E5",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cardInviteBtnText: {
    color: "#A5B4FC",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  editHint: { color: "#334155", fontSize: 24, fontWeight: "300" },

  // Avatar
  avatar: {
    backgroundColor: "#312E81",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#4F46E5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  avatarText: { color: "#C7D2FE", fontWeight: "900" },
  avatarEditBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "#1E1B4B",
    borderRadius: 12,
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: "#4F46E5",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEditBadgeText: { fontSize: 12 },

  // Badges
  upBadge: {
    backgroundColor: "#0F172A",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#3B82F6",
  },
  upBadgeText: {
    color: "#60A5FA",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  orgRoleBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  orgRoleBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Empty
  emptyState: { paddingVertical: 80, alignItems: "center" },
  emptyText: { color: "#64748B", fontSize: 18, fontWeight: "800" },
  emptySubText: { color: "#475569", fontSize: 14, marginTop: 8 },

  // Edit modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 32,
    paddingBottom: 40,
    maxHeight: "92%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: { color: "#F8FAFC", fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  modalClose: { color: "#94A3B8", fontWeight: "700", fontSize: 16 },

  modalActions: { gap: 12, marginTop: 8 },
  inviteBtn: {
    borderWidth: 1,
    borderColor: "#3B82F6",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  inviteBtnText: { color: "#60A5FA", fontWeight: "900", fontSize: 15 },
  deleteBtn: {
    borderWidth: 1,
    borderColor: "#EF444455",
    backgroundColor: "#7F1D1D22",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  deleteBtnText: { color: "#F87171", fontWeight: "900", fontSize: 15 },
  joinedBadge: { backgroundColor: "#064E3B", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#10B981" },
  joinedBadgeText: { color: "#34D399", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  servedBadge: { backgroundColor: "#1E1B4B", borderRadius: 8, borderWidth: 1, borderColor: "#4F46E5", paddingHorizontal: 8, paddingVertical: 3 },
  servedBadgeText: { color: "#A5B4FC", fontSize: 11, fontWeight: "800" },
});
