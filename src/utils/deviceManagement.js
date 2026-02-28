/**
 * Enhanced Device Management - Ultimate Playback
 * Device grouping, templates, backup/restore
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_GROUPS_KEY = '@ultimate_playback_device_groups';
const PRESET_TEMPLATES_KEY = '@ultimate_playback_preset_templates';
const DEVICE_SETTINGS_KEY = '@ultimate_playback_device_settings';

/**
 * Device Group
 * Groups multiple devices for bulk operations
 */
export const createDeviceGroup = (name, devices = []) => ({
  id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  name,
  devices, // Array of { role, deviceType }
  created_at: new Date().toISOString(),
});

/**
 * Get all device groups
 */
export const getDeviceGroups = async () => {
  try {
    const data = await AsyncStorage.getItem(DEVICE_GROUPS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading device groups:', error);
    return [];
  }
};

/**
 * Save device group
 */
export const saveDeviceGroup = async (group) => {
  try {
    const groups = await getDeviceGroups();
    const existingIndex = groups.findIndex((g) => g.id === group.id);

    if (existingIndex >= 0) {
      groups[existingIndex] = group;
    } else {
      groups.push(group);
    }

    await AsyncStorage.setItem(DEVICE_GROUPS_KEY, JSON.stringify(groups));
    return group;
  } catch (error) {
    console.error('Error saving device group:', error);
    throw error;
  }
};

/**
 * Delete device group
 */
export const deleteDeviceGroup = async (groupId) => {
  try {
    const groups = await getDeviceGroups();
    const filtered = groups.filter((g) => g.id !== groupId);
    await AsyncStorage.setItem(DEVICE_GROUPS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting device group:', error);
    throw error;
  }
};

/**
 * Preset Template
 * Reusable preset configurations
 */
export const createPresetTemplate = (name, role, deviceType, presets) => ({
  id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  name,
  role,
  deviceType,
  presets, // Array of preset objects
  created_at: new Date().toISOString(),
});

/**
 * Get all preset templates
 */
export const getPresetTemplates = async () => {
  try {
    const data = await AsyncStorage.getItem(PRESET_TEMPLATES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading preset templates:', error);
    return [];
  }
};

/**
 * Save preset template
 */
export const savePresetTemplate = async (template) => {
  try {
    const templates = await getPresetTemplates();
    const existingIndex = templates.findIndex((t) => t.id === template.id);

    if (existingIndex >= 0) {
      templates[existingIndex] = template;
    } else {
      templates.push(template);
    }

    await AsyncStorage.setItem(PRESET_TEMPLATES_KEY, JSON.stringify(templates));
    return template;
  } catch (error) {
    console.error('Error saving preset template:', error);
    throw error;
  }
};

/**
 * Delete preset template
 */
export const deletePresetTemplate = async (templateId) => {
  try {
    const templates = await getPresetTemplates();
    const filtered = templates.filter((t) => t.id !== templateId);
    await AsyncStorage.setItem(PRESET_TEMPLATES_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting preset template:', error);
    throw error;
  }
};

/**
 * Apply template to song
 */
export const applyTemplateToSong = (song, template) => {
  const updatedSong = { ...song };

  if (!updatedSong.device_setups[template.role]) {
    updatedSong.device_setups[template.role] = {};
  }

  // Deep copy presets
  updatedSong.device_setups[template.role][template.deviceType] = {
    ...JSON.parse(JSON.stringify(template.presets)),
  };

  return updatedSong;
};

/**
 * Device Settings
 * Per-device configuration (MIDI channel, etc.)
 */
export const getDeviceSettings = async (deviceType) => {
  try {
    const allSettings = await AsyncStorage.getItem(DEVICE_SETTINGS_KEY);
    const settings = allSettings ? JSON.parse(allSettings) : {};
    return settings[deviceType] || {
      midi_channel: 1,
      connection_type: 'auto', // 'usb', 'bluetooth', 'auto'
      auto_connect: true,
    };
  } catch (error) {
    console.error('Error loading device settings:', error);
    return {
      midi_channel: 1,
      connection_type: 'auto',
      auto_connect: true,
    };
  }
};

/**
 * Save device settings
 */
export const saveDeviceSettings = async (deviceType, settings) => {
  try {
    const allSettings = await AsyncStorage.getItem(DEVICE_SETTINGS_KEY);
    const current = allSettings ? JSON.parse(allSettings) : {};

    current[deviceType] = settings;

    await AsyncStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(current));
  } catch (error) {
    console.error('Error saving device settings:', error);
    throw error;
  }
};

/**
 * Backup all data
 */
export const backupAllData = async () => {
  try {
    const [songs, groups, templates, settings] = await Promise.all([
      AsyncStorage.getItem('@ultimate_playback_songs'),
      AsyncStorage.getItem(DEVICE_GROUPS_KEY),
      AsyncStorage.getItem(PRESET_TEMPLATES_KEY),
      AsyncStorage.getItem(DEVICE_SETTINGS_KEY),
    ]);

    const backup = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      data: {
        songs: songs ? JSON.parse(songs) : [],
        device_groups: groups ? JSON.parse(groups) : [],
        preset_templates: templates ? JSON.parse(templates) : [],
        device_settings: settings ? JSON.parse(settings) : {},
      },
    };

    return JSON.stringify(backup, null, 2);
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
};

/**
 * Restore from backup
 */
export const restoreFromBackup = async (backupJson) => {
  try {
    const backup = JSON.parse(backupJson);

    if (!backup.version || !backup.data) {
      throw new Error('Invalid backup format');
    }

    // Restore songs
    if (backup.data.songs) {
      await AsyncStorage.setItem(
        '@ultimate_playback_songs',
        JSON.stringify(backup.data.songs)
      );
    }

    // Restore device groups
    if (backup.data.device_groups) {
      await AsyncStorage.setItem(
        DEVICE_GROUPS_KEY,
        JSON.stringify(backup.data.device_groups)
      );
    }

    // Restore preset templates
    if (backup.data.preset_templates) {
      await AsyncStorage.setItem(
        PRESET_TEMPLATES_KEY,
        JSON.stringify(backup.data.preset_templates)
      );
    }

    // Restore device settings
    if (backup.data.device_settings) {
      await AsyncStorage.setItem(
        DEVICE_SETTINGS_KEY,
        JSON.stringify(backup.data.device_settings)
      );
    }

    return {
      success: true,
      restored: {
        songs: backup.data.songs?.length || 0,
        groups: backup.data.device_groups?.length || 0,
        templates: backup.data.preset_templates?.length || 0,
      },
    };
  } catch (error) {
    console.error('Error restoring backup:', error);
    throw error;
  }
};

/**
 * Export backup to file
 */
export const exportBackupToFile = async () => {
  try {
    const backupData = await backupAllData();
    const filename = `ultimate_playback_backup_${new Date().toISOString().split('T')[0]}.json`;

    // Use expo-file-system or react-native-fs
    // This is a placeholder - actual implementation depends on available libraries
    return {
      filename,
      data: backupData,
    };
  } catch (error) {
    console.error('Error exporting backup:', error);
    throw error;
  }
};

/**
 * Bulk operations
 */

/**
 * Clone preset configuration from one song to multiple songs
 */
export const clonePresetToSongs = async (sourceSong, targetSongIds, role, deviceType) => {
  try {
    const { getAllSongs, addOrUpdateSong } = require('../data/storage');
    const allSongs = await getAllSongs();

    const sourceSetup = sourceSong.device_setups[role]?.[deviceType];
    if (!sourceSetup) {
      throw new Error('Source song has no preset for this device');
    }

    const updates = [];

    for (const songId of targetSongIds) {
      const song = allSongs.find((s) => s.id === songId);
      if (!song) continue;

      const updatedSong = { ...song };

      if (!updatedSong.device_setups[role]) {
        updatedSong.device_setups[role] = {};
      }

      // Deep copy
      updatedSong.device_setups[role][deviceType] = JSON.parse(
        JSON.stringify(sourceSetup)
      );

      updates.push(addOrUpdateSong(updatedSong));
    }

    await Promise.all(updates);

    return {
      success: true,
      updated: updates.length,
    };
  } catch (error) {
    console.error('Error cloning preset:', error);
    throw error;
  }
};

/**
 * Delete device setup from multiple songs
 */
export const deleteDeviceFromSongs = async (songIds, role, deviceType) => {
  try {
    const { getAllSongs, addOrUpdateSong } = require('../data/storage');
    const allSongs = await getAllSongs();

    const updates = [];

    for (const songId of songIds) {
      const song = allSongs.find((s) => s.id === songId);
      if (!song) continue;

      const updatedSong = { ...song };

      if (updatedSong.device_setups[role]?.[deviceType]) {
        delete updatedSong.device_setups[role][deviceType];
      }

      updates.push(addOrUpdateSong(updatedSong));
    }

    await Promise.all(updates);

    return {
      success: true,
      updated: updates.length,
    };
  } catch (error) {
    console.error('Error deleting device:', error);
    throw error;
  }
};

export default {
  // Device Groups
  createDeviceGroup,
  getDeviceGroups,
  saveDeviceGroup,
  deleteDeviceGroup,

  // Preset Templates
  createPresetTemplate,
  getPresetTemplates,
  savePresetTemplate,
  deletePresetTemplate,
  applyTemplateToSong,

  // Device Settings
  getDeviceSettings,
  saveDeviceSettings,

  // Backup/Restore
  backupAllData,
  restoreFromBackup,
  exportBackupToFile,

  // Bulk Operations
  clonePresetToSongs,
  deleteDeviceFromSongs,
};
