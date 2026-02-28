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
  const existingIndex = members.findIndex(m =>
    m.email?.toLowerCase() === localProfile.email?.toLowerCase()
  );

  const memberData = {
    id: localProfile.id || `person_${Date.now()}`,
    name: localProfile.name,
    lastName: localProfile.lastName,
    email: localProfile.email,
    phone: localProfile.phone,
    dateOfBirth: localProfile.dateOfBirth,
    photo_url: localProfile.photo_url,
    roles: localProfile.roles || [],
    roleAssignments: localProfile.roleAssignments,
    blockout_dates: localProfile.blockout_dates || [],
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
      roles: member.roles || [],
      roleAssignments: member.roleAssignments,
      blockout_dates: member.blockout_dates || [],
    };
  }
  return null;
};

// ============================================
// DEMO DATA INITIALIZATION
// ============================================

export const initializeDemoData = async () => {
  // Check if data already exists
  const existingMembers = await getSharedTeamMembers();
  if (existingMembers.length > 0) {
    return; // Already initialized
  }

  // Create demo team members
  const demoMembers = [
    {
      id: 'person_demo1',
      name: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah@example.com',
      phone: '555-0101',
      roles: ['vocals', 'worship_leader'],
      roleAssignments: 'Vocals, Worship Leader',
      blockout_dates: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'person_demo2',
      name: 'Mike',
      lastName: 'Chen',
      email: 'mike@example.com',
      phone: '555-0102',
      roles: ['keyboard', 'music_director'],
      roleAssignments: 'Keyboard, Music Director',
      blockout_dates: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  await saveSharedTeamMembers(demoMembers);

  // Create demo service
  const demoServices = [
    {
      id: 'svc_demo1',
      date: '2026-03-15',
      title: 'Sunday Service - March 15',
      service_name: 'Sunday Service',
      setlist: ['song_demo1', 'song_demo2'],
      assignments: [],
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  await saveSharedServices(demoServices);

  // Create demo songs
  const demoSongs = [
    {
      id: 'song_demo1',
      title: 'Amazing Grace',
      artist: 'Traditional',
      originalKey: 'G',
      bpm: 80,
      role_content: {
        vocals: {
          notes: 'Lead on all verses, harmony on chorus',
          lyrics: 'Amazing grace, how sweet the sound...',
          vocal_range: 'G3-D5',
        },
        keyboard: {
          notes: 'Play in G major, simple chord progression',
          chords: 'G-C-D-Em',
        },
        foh_engineer: {
          notes: 'Boost vocals on chorus, add reverb',
          mix_notes: 'Compression 4:1, EQ cut at 200Hz',
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  await saveSharedSongs(demoSongs);

  console.log('Demo data initialized successfully');
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
