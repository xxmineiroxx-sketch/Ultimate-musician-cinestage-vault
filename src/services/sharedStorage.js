/**
 * Shared Storage - Ultimate Playback & Ultimate Musician Integration
 * Provides shared AsyncStorage access for cross-app communication
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage Keys
export const KEYS = {
  TEAM_MEMBERS: '@shared_team_members',
  ASSIGNMENTS: '@shared_assignments',
  MESSAGES: '@shared_messages',
  SERVICES: '@shared_services',
  SONGS: '@shared_songs',
};

// ============================================
// TEAM MEMBERS
// ============================================

export const getSharedTeamMembers = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.TEAM_MEMBERS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading shared team members:', error);
    return [];
  }
};

export const saveSharedTeamMembers = async (members) => {
  try {
    await AsyncStorage.setItem(KEYS.TEAM_MEMBERS, JSON.stringify(members));
    return true;
  } catch (error) {
    console.error('Error saving shared team members:', error);
    return false;
  }
};

export const getTeamMemberById = async (memberId) => {
  const members = await getSharedTeamMembers();
  return members.find(m => m.id === memberId);
};

export const getTeamMemberByEmail = async (email) => {
  const members = await getSharedTeamMembers();
  return members.find(m => m.email?.toLowerCase() === email?.toLowerCase());
};

const normalizePhoneForLookup = (value) =>
  String(value || '').replace(/\D+/g, '');

const INVITE_STATUS_ORDER = {
  '': 0,
  ready: 1,
  pending: 2,
  accepted: 3,
  registered: 4,
};

const normalizeInviteStatus = (value) =>
  String(value || '').trim().toLowerCase();

const isPortablePhotoUrl = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return (
    normalized.startsWith('data:image/')
    || normalized.startsWith('http://')
    || normalized.startsWith('https://')
  );
};

const pickPreferredPhotoUrl = (...values) => {
  for (const value of values) {
    if (isPortablePhotoUrl(value)) return String(value || '').trim();
  }
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return null;
};

const getEffectiveInviteStatus = (person = {}) => {
  const baseStatus = normalizeInviteStatus(person?.inviteStatus);
  const isRegistered =
    person?.playbackRegistered === true
    || Boolean(person?.playbackRegisteredAt)
    || Boolean(person?.inviteRegisteredAt);
  if (isRegistered || baseStatus === 'registered') return 'registered';
  if (person?.inviteAcceptedAt) {
    return INVITE_STATUS_ORDER[baseStatus] >= INVITE_STATUS_ORDER.accepted
      ? baseStatus
      : 'accepted';
  }
  return baseStatus;
};

const pickHighestInviteStatus = (...records) => {
  let bestStatus = '';
  let bestRank = -1;

  for (const record of records) {
    const status = getEffectiveInviteStatus(record);
    const rank = INVITE_STATUS_ORDER[status] ?? 0;
    if (rank >= bestRank) {
      bestStatus = status;
      bestRank = rank;
    }
  }

  return bestStatus;
};

const findTeamMemberIndex = (members, localProfile) => {
  const profileId = String(localProfile?.id || '').trim();
  const profileEmail = String(localProfile?.email || '').trim().toLowerCase();
  const profilePhone = normalizePhoneForLookup(localProfile?.phone);

  return members.findIndex((member) => {
    const memberId = String(member?.id || '').trim();
    const memberEmail = String(member?.email || '').trim().toLowerCase();
    const memberPhone = normalizePhoneForLookup(member?.phone);

    if (profileId && memberId && memberId === profileId) return true;
    if (profileEmail && memberEmail && memberEmail === profileEmail) return true;
    if (profilePhone && memberPhone && memberPhone === profilePhone) return true;
    return false;
  });
};

export const updateTeamMember = async (memberId, updates) => {
  const members = await getSharedTeamMembers();
  const index = members.findIndex(m => m.id === memberId);

  if (index !== -1) {
    members[index] = {
      ...members[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await saveSharedTeamMembers(members);
    return members[index];
  }

  return null;
};

// ============================================
// ASSIGNMENTS
// ============================================

export const getSharedAssignments = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.ASSIGNMENTS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading shared assignments:', error);
    return [];
  }
};

export const saveSharedAssignments = async (assignments) => {
  try {
    await AsyncStorage.setItem(KEYS.ASSIGNMENTS, JSON.stringify(assignments));
    return true;
  } catch (error) {
    console.error('Error saving shared assignments:', error);
    return false;
  }
};

export const getAssignmentsByPersonId = async (personId) => {
  const assignments = await getSharedAssignments();
  return assignments.filter(a => a.person_id === personId);
};

export const updateAssignment = async (assignmentId, updates) => {
  const assignments = await getSharedAssignments();
  const index = assignments.findIndex(a => a.id === assignmentId);

  if (index !== -1) {
    assignments[index] = {
      ...assignments[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    await saveSharedAssignments(assignments);
    return assignments[index];
  }

  return null;
};

export const acceptAssignment = async (assignmentId) => {
  return await updateAssignment(assignmentId, {
    status: 'accepted',
    responded_at: new Date().toISOString(),
  });
};

export const declineAssignment = async (assignmentId) => {
  return await updateAssignment(assignmentId, {
    status: 'declined',
    responded_at: new Date().toISOString(),
  });
};

// ============================================
// MESSAGES
// ============================================

export const getSharedMessages = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.MESSAGES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading shared messages:', error);
    return [];
  }
};

export const saveSharedMessages = async (messages) => {
  try {
    await AsyncStorage.setItem(KEYS.MESSAGES, JSON.stringify(messages));
    return true;
  } catch (error) {
    console.error('Error saving shared messages:', error);
    return false;
  }
};

export const getMessagesByRecipient = async (personId) => {
  const messages = await getSharedMessages();
  return messages.filter(m =>
    m.to === personId ||
    m.to === 'all' ||
    m.to === 'team' ||
    m.sender_id === personId
  );
};

export const sendMessage = async (messageData) => {
  const messages = await getSharedMessages();
  const newMessage = {
    id: `msg_${Date.now()}`,
    timestamp: new Date().toISOString(),
    read: false,
    ...messageData,
  };

  messages.push(newMessage);
  await saveSharedMessages(messages);
  return newMessage;
};

export const markMessageAsRead = async (messageId) => {
  const messages = await getSharedMessages();
  const index = messages.findIndex(m => m.id === messageId);

  if (index !== -1) {
    messages[index].read = true;
    await saveSharedMessages(messages);
    return true;
  }

  return false;
};

// ============================================
// SERVICES
// ============================================

export const getSharedServices = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.SERVICES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading shared services:', error);
    return [];
  }
};

export const saveSharedServices = async (services) => {
  try {
    await AsyncStorage.setItem(KEYS.SERVICES, JSON.stringify(services));
    return true;
  } catch (error) {
    console.error('Error saving shared services:', error);
    return false;
  }
};

export const getServiceById = async (serviceId) => {
  const services = await getSharedServices();
  return services.find(s => s.id === serviceId);
};

// ============================================
// SONGS
// ============================================

export const getSharedSongs = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.SONGS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading shared songs:', error);
    return [];
  }
};

export const saveSharedSongs = async (songs) => {
  try {
    await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));
    return true;
  } catch (error) {
    console.error('Error saving shared songs:', error);
    return false;
  }
};

export const getSongById = async (songId) => {
  const songs = await getSharedSongs();
  return songs.find(s => s.id === songId);
};

export const getSongsByIds = async (songIds) => {
  const songs = await getSharedSongs();
  return songs.filter(s => songIds.includes(s.id));
};

// ============================================
// SYNC HELPERS
// ============================================

/**
 * Sync local profile to shared team members
 */
export const syncProfileToTeamMembers = async (localProfile) => {
  const members = await getSharedTeamMembers();
  const existingIndex = findTeamMemberIndex(members, localProfile);
  const existingMember = existingIndex !== -1 ? members[existingIndex] : null;
  const nextName = localProfile.name ?? existingMember?.name ?? '';
  const existingLastName = existingMember?.lastName ?? '';
  const nextRoles =
    Array.isArray(localProfile.roles) && localProfile.roles.length > 0
      ? localProfile.roles
      : existingMember?.roles || [];
  const nextLastName =
    localProfile.lastName !== undefined
      ? localProfile.lastName
      : nextName &&
          existingLastName &&
          nextName.toLowerCase().endsWith(existingLastName.toLowerCase())
        ? ''
        : existingLastName;
  const nextInviteStatus = pickHighestInviteStatus(existingMember, localProfile);
  const nextPlaybackRegistered =
    localProfile.playbackRegistered === true
      || existingMember?.playbackRegistered === true
      || Boolean(localProfile.playbackRegisteredAt)
      || Boolean(existingMember?.playbackRegisteredAt)
      || Boolean(localProfile.inviteRegisteredAt)
      || Boolean(existingMember?.inviteRegisteredAt);

  const memberData = {
    id: existingMember?.id || localProfile.id || `person_${Date.now()}`,
    name: nextName,
    lastName: nextLastName,
    email: localProfile.email ?? existingMember?.email ?? '',
    phone: localProfile.phone ?? existingMember?.phone ?? '',
    dateOfBirth: localProfile.dateOfBirth ?? existingMember?.dateOfBirth ?? '',
    photo_url: pickPreferredPhotoUrl(localProfile.photo_url, existingMember?.photo_url),
    roles: nextRoles,
    roleAssignments:
      localProfile.roleAssignments ??
      existingMember?.roleAssignments ??
      nextRoles.join(', '),
    roleSyncSource: 'playback_profile',
    roleSyncUpdatedAt: new Date().toISOString(),
    blockout_dates:
      localProfile.blockout_dates ?? existingMember?.blockout_dates ?? [],
    inviteStatus: nextInviteStatus,
    inviteToken:
      localProfile.inviteToken ?? existingMember?.inviteToken ?? '',
    inviteCreatedAt:
      localProfile.inviteCreatedAt ?? existingMember?.inviteCreatedAt ?? null,
    inviteSentAt:
      localProfile.inviteSentAt ?? existingMember?.inviteSentAt ?? null,
    inviteAcceptedAt:
      localProfile.inviteAcceptedAt ?? existingMember?.inviteAcceptedAt ?? null,
    inviteRegisteredAt:
      localProfile.inviteRegisteredAt ?? existingMember?.inviteRegisteredAt ?? null,
    playbackRegistered: nextPlaybackRegistered,
    playbackRegisteredAt:
      localProfile.playbackRegisteredAt
      ?? existingMember?.playbackRegisteredAt
      ?? localProfile.inviteRegisteredAt
      ?? existingMember?.inviteRegisteredAt
      ?? null,
    createdAt:
      localProfile.createdAt
      ?? existingMember?.createdAt
      ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex !== -1) {
    // Update existing
    members[existingIndex] = {
      ...members[existingIndex],
      ...memberData,
    };
  } else {
    // Add new
    memberData.createdAt = new Date().toISOString();
    members.push(memberData);
  }

  await saveSharedTeamMembers(members);
  return memberData;
};

/**
 * Sync shared team member to local profile
 */
export const syncTeamMemberToProfile = async (email) => {
  const member = await getTeamMemberByEmail(email);
  if (member) {
    return {
      id: member.id,
      name: member.name,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      dateOfBirth: member.dateOfBirth,
      photo_url: member.photo_url,
      createdAt: member.createdAt || '',
      inviteRegisteredAt: member.inviteRegisteredAt || '',
      playbackRegisteredAt: member.playbackRegisteredAt || '',
      playbackRegistered: member.playbackRegistered === true,
      roles: member.roles || [],
      roleAssignments: member.roleAssignments,
      roleSyncSource: member.roleSyncSource || '',
      roleSyncUpdatedAt: member.roleSyncUpdatedAt || null,
      blockout_dates: member.blockout_dates || [],
    };
  }
  return null;
};

// ============================================
// DEMO DATA INITIALIZATION
// ============================================

export const initializeDemoData = async () => {
  return;
};

export default {
  KEYS,
  getSharedTeamMembers,
  saveSharedTeamMembers,
  getTeamMemberById,
  getTeamMemberByEmail,
  updateTeamMember,
  getSharedAssignments,
  saveSharedAssignments,
  getAssignmentsByPersonId,
  updateAssignment,
  acceptAssignment,
  declineAssignment,
  getSharedMessages,
  saveSharedMessages,
  getMessagesByRecipient,
  sendMessage,
  markMessageAsRead,
  getSharedServices,
  saveSharedServices,
  getServiceById,
  getSharedSongs,
  saveSharedSongs,
  getSongById,
  getSongsByIds,
  syncProfileToTeamMembers,
  syncTeamMemberToProfile,
  initializeDemoData,
};
