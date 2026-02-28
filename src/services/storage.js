/**
 * Storage Service - Ultimate Playback V2
 * Manages AsyncStorage for team member data
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  USER_PROFILE: '@up_user_profile',
  ASSIGNMENTS: '@up_assignments',
  BLOCKOUT_DATES: '@up_blockout_dates',
  MESSAGES: '@up_messages',
  CONVERSATIONS: '@up_conversations',
  SETLISTS: '@up_setlists',
  SONGS: '@up_songs',
};

/**
 * User Profile
 */
export const saveUserProfile = async (profile) => {
  try {
    await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(profile));
    return profile;
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw error;
  }
};

export const getUserProfile = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.USER_PROFILE);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error loading user profile:', error);
    return null;
  }
};

/**
 * Assignments
 */
export const saveAssignments = async (assignments) => {
  try {
    await AsyncStorage.setItem(KEYS.ASSIGNMENTS, JSON.stringify(assignments));
  } catch (error) {
    console.error('Error saving assignments:', error);
    throw error;
  }
};

export const getAssignments = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.ASSIGNMENTS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading assignments:', error);
    return [];
  }
};

export const addAssignment = async (assignment) => {
  try {
    const assignments = await getAssignments();
    assignments.unshift(assignment); // Add to beginning
    await saveAssignments(assignments);
    return assignment;
  } catch (error) {
    console.error('Error adding assignment:', error);
    throw error;
  }
};

export const updateAssignment = async (assignmentId, updates) => {
  try {
    const assignments = await getAssignments();
    const index = assignments.findIndex((a) => a.id === assignmentId);

    if (index >= 0) {
      assignments[index] = { ...assignments[index], ...updates };
      await saveAssignments(assignments);
      return assignments[index];
    }

    throw new Error('Assignment not found');
  } catch (error) {
    console.error('Error updating assignment:', error);
    throw error;
  }
};

/**
 * Blockout Dates
 */
export const saveBlockoutDates = async (dates) => {
  try {
    await AsyncStorage.setItem(KEYS.BLOCKOUT_DATES, JSON.stringify(dates));
  } catch (error) {
    console.error('Error saving blockout dates:', error);
    throw error;
  }
};

export const getBlockoutDates = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.BLOCKOUT_DATES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading blockout dates:', error);
    return [];
  }
};

export const addBlockoutDate = async (blockoutDate) => {
  try {
    const dates = await getBlockoutDates();
    dates.push(blockoutDate);
    await saveBlockoutDates(dates);
    return blockoutDate;
  } catch (error) {
    console.error('Error adding blockout date:', error);
    throw error;
  }
};

export const deleteBlockoutDate = async (blockoutId) => {
  try {
    const dates = await getBlockoutDates();
    const filtered = dates.filter((d) => d.id !== blockoutId);
    await saveBlockoutDates(filtered);
  } catch (error) {
    console.error('Error deleting blockout date:', error);
    throw error;
  }
};

/**
 * Messages
 */
export const saveMessages = async (messages) => {
  try {
    await AsyncStorage.setItem(KEYS.MESSAGES, JSON.stringify(messages));
  } catch (error) {
    console.error('Error saving messages:', error);
    throw error;
  }
};

export const getMessages = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.MESSAGES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading messages:', error);
    return [];
  }
};

export const addMessage = async (message) => {
  try {
    const messages = await getMessages();
    messages.push(message);
    await saveMessages(messages);
    return message;
  } catch (error) {
    console.error('Error adding message:', error);
    throw error;
  }
};

/**
 * Conversations
 */
export const saveConversations = async (conversations) => {
  try {
    await AsyncStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(conversations));
  } catch (error) {
    console.error('Error saving conversations:', error);
    throw error;
  }
};

export const getConversations = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.CONVERSATIONS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading conversations:', error);
    return [];
  }
};

/**
 * Setlists
 */
export const saveSetlists = async (setlists) => {
  try {
    await AsyncStorage.setItem(KEYS.SETLISTS, JSON.stringify(setlists));
  } catch (error) {
    console.error('Error saving setlists:', error);
    throw error;
  }
};

export const getSetlists = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.SETLISTS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading setlists:', error);
    return [];
  }
};

export const getSetlistById = async (setlistId) => {
  try {
    const setlists = await getSetlists();
    return setlists.find((s) => s.id === setlistId) || null;
  } catch (error) {
    console.error('Error loading setlist:', error);
    return null;
  }
};

/**
 * Songs
 */
export const saveSongs = async (songs) => {
  try {
    await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));
  } catch (error) {
    console.error('Error saving songs:', error);
    throw error;
  }
};

export const getSongs = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.SONGS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading songs:', error);
    return [];
  }
};

export const getSongById = async (songId) => {
  try {
    const songs = await getSongs();
    return songs.find((s) => s.id === songId) || null;
  } catch (error) {
    console.error('Error loading song:', error);
    return null;
  }
};

/**
 * Clear all data (logout)
 */
export const clearAllData = async () => {
  try {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
};

export default {
  saveUserProfile,
  getUserProfile,
  saveAssignments,
  getAssignments,
  addAssignment,
  updateAssignment,
  saveBlockoutDates,
  getBlockoutDates,
  addBlockoutDate,
  deleteBlockoutDate,
  saveMessages,
  getMessages,
  addMessage,
  saveConversations,
  getConversations,
  saveSetlists,
  getSetlists,
  getSetlistById,
  saveSongs,
  getSongs,
  getSongById,
  clearAllData,
};
