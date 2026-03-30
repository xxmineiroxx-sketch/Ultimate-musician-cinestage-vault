/**
 * Profile Screen - Ultimate Playback
 * User profile with name, photo, date of birth, and role assignments
 */

import React, { useState, useEffect, useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  Image,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile, saveUserProfile } from '../services/storage';
import { syncProfileToTeamMembers } from '../services/sharedStorage';
import { logout } from '../services/authAPI';
import { SYNC_URL, syncHeaders } from '../../config/syncConfig';
import { parseRoleAssignments } from '../models_v2/models';

const normalizeRemotePhoneLookup = (value) =>
  String(value || '').replace(/\D+/g, '');

const PHOTO_MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};
const MAX_PROFILE_PHOTO_BASE64_LENGTH = 900000;
const DEFAULT_NOTIFICATION_PREFERENCES = {
  assignments: true,
  messages: true,
  reminders: true,
};

const isPortablePhotoUrl = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return (
    normalized.startsWith('data:image/')
    || normalized.startsWith('http://')
    || normalized.startsWith('https://')
  );
};

const inferPhotoMimeType = (uri, fallback = 'image/jpeg') => {
  const normalized = String(uri || '').split('?')[0].trim().toLowerCase();
  const extension = normalized.includes('.') ? normalized.split('.').pop() : '';
  return PHOTO_MIME_BY_EXT[extension] || fallback;
};

const buildPhotoDataUrl = (base64, mimeType = 'image/jpeg') =>
  `data:${mimeType};base64,${base64}`;

const parseValidDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) return null;
  return date;
};

const parseMemberSinceFromId = (id) => {
  const match = String(id || '').match(/(?:^|_)(\d{10,})(?:$|_)/);
  if (!match) return null;
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 2020) return null;
  return date;
};

const formatMemberSince = (profile) => {
  const candidates = [
    profile?.playbackRegisteredAt,
    profile?.inviteRegisteredAt,
    profile?.createdAt,
    profile?.memberSince,
  ];
  for (const candidate of candidates) {
    const parsed = parseValidDate(candidate);
    if (parsed) return parsed.toLocaleDateString();
  }
  const parsedFromId = parseMemberSinceFromId(profile?.id);
  return parsedFromId ? parsedFromId.toLocaleDateString() : 'N/A';
};

const getPreferredSyncedPhotoUrl = (...values) => {
  for (const value of values) {
    if (isPortablePhotoUrl(value)) return value;
  }
  return '';
};

const findRemotePersonMatch = (people, localProfile) => {
  const localId = String(localProfile?.id || '').trim();
  const localEmail = String(localProfile?.email || '').trim().toLowerCase();
  const localPhone = normalizeRemotePhoneLookup(localProfile?.phone);

  return (Array.isArray(people) ? people : []).find((person) => {
    const personId = String(person?.id || '').trim();
    const personEmail = String(person?.email || '').trim().toLowerCase();
    const personPhone = normalizeRemotePhoneLookup(person?.phone);

    return (
      (localId && personId && personId === localId)
      || (localEmail && personEmail && personEmail === localEmail)
      || (localPhone && personPhone && personPhone === localPhone)
    );
  }) || null;
};

export default function ProfileSetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    photo_url: '',
    roleAssignments: '',
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    await fetch(`${SYNC_URL}/sync/org/profile`, { headers: syncHeaders() })
      .then(r => r.json())
      .then(d => setOrgName(d.name || ''))
      .catch(() => {});
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadProfile();
    fetch(`${SYNC_URL}/sync/org/profile`, { headers: syncHeaders() })
      .then(r => r.json())
      .then(d => setOrgName(d.name || ''))
      .catch(() => {});
  }, []);

  // Push local profile to Cloudflare KV so Ultimate Musician sees it
  const pushProfileToCloud = async (p) => {
    try {
      await fetch(`${SYNC_URL}/sync/library-push`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({
          people: [{
            id: p.id,
            name: p.name,
            lastName: p.lastName || '',
            email: p.email || '',
            phone: p.phone || '',
            photo_url: p.photo_url || null,
            roles: p.roles || [],
            roleAssignments: p.roleAssignments || (p.roles || []).join(', '),
            roleSyncSource: 'playback_profile',
            roleSyncUpdatedAt: new Date().toISOString(),
            dateOfBirth: p.dateOfBirth || '',
            playbackRegistered:
              p.playbackRegistered === true || Boolean(p.playbackRegisteredAt),
            playbackRegisteredAt: p.playbackRegisteredAt || null,
            inviteRegisteredAt: p.inviteRegisteredAt || null,
            createdAt:
              p.createdAt
              || p.playbackRegisteredAt
              || p.inviteRegisteredAt
              || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }],
        }),
      });
    } catch (_) {}
  };

  // Pull this user's profile from Cloudflare KV and merge roles into local
  const pullProfileFromCloud = async (localProfile) => {
    try {
      const email = (localProfile?.email || '').toLowerCase().trim();
      const phone = normalizeRemotePhoneLookup(localProfile?.phone);
      const id = String(localProfile?.id || '').trim();
      if (!email && !phone && !id) return localProfile;
      const res = await fetch(`${SYNC_URL}/sync/people`, { headers: syncHeaders() });
      if (!res.ok) return localProfile;
      const people = await res.json();
      const remote = findRemotePersonMatch(people, localProfile);
      if (!remote) return localProfile;
      const remoteRoles = parseRoleAssignments(
        remote.roleAssignments || remote.roles || [],
      );
      const mergedRoles = remoteRoles.length > 0
        ? remoteRoles
        : parseRoleAssignments(localProfile.roles || localProfile.roleAssignments || []);
      const mergedPhoto = getPreferredSyncedPhotoUrl(
        remote.photo_url,
        localProfile.photo_url,
      );

      return {
        ...localProfile,
        id: remote.id || localProfile.id,
        name: remote.name || localProfile.name,
        lastName: remote.lastName || localProfile.lastName,
        email: remote.email || localProfile.email,
        phone: remote.phone || localProfile.phone,
        roles: mergedRoles,
        roleAssignments:
          remote.roleAssignments
          || localProfile.roleAssignments
          || mergedRoles.join(', '),
        dateOfBirth: remote.dateOfBirth || localProfile.dateOfBirth,
        photo_url: mergedPhoto || localProfile.photo_url || '',
        createdAt:
          remote.createdAt
          || remote.playbackRegisteredAt
          || remote.inviteRegisteredAt
          || localProfile.createdAt
          || '',
        inviteRegisteredAt:
          remote.inviteRegisteredAt || localProfile.inviteRegisteredAt || '',
        playbackRegisteredAt:
          remote.playbackRegisteredAt || localProfile.playbackRegisteredAt || '',
        updatedAt: remote.updatedAt || localProfile.updatedAt || '',
      };
    } catch (_) {
      return localProfile;
    }
  };

  const convertPhotoToPortable = useCallback(async (value, options = {}) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (isPortablePhotoUrl(normalized)) return normalized;

    try {
      const base64 =
        options.base64
        || await FileSystem.readAsStringAsync(normalized, {
          encoding: FileSystem.EncodingType.Base64,
        });
      const normalizedBase64 = String(base64 || '').replace(/\s+/g, '');
      if (!normalizedBase64) return '';
      if (normalizedBase64.length > MAX_PROFILE_PHOTO_BASE64_LENGTH) return '';
      return buildPhotoDataUrl(
        normalizedBase64,
        options.mimeType || inferPhotoMimeType(normalized),
      );
    } catch {
      return '';
    }
  }, []);

  const persistProfilePhoto = useCallback(async (nextPhotoUrl) => {
    if (!profile?.name || !profile?.lastName) {
      setIsEditing(true);
      setFormData((prev) => ({ ...prev, photo_url: nextPhotoUrl || '' }));
      return false;
    }

    const normalizedRoles = parseRoleAssignments(
      profile?.roleAssignments || profile?.roles || [],
    );
    const updatedProfile = {
      ...profile,
      photo_url: nextPhotoUrl || '',
      roles: normalizedRoles,
      roleAssignments:
        profile?.roleAssignments || normalizedRoles.join(', '),
      playbackRegistered:
        profile?.playbackRegistered === true || Boolean(profile?.playbackRegisteredAt),
      createdAt:
        profile?.createdAt
        || profile?.playbackRegisteredAt
        || profile?.inviteRegisteredAt
        || new Date().toISOString(),
      playbackRegisteredAt: profile?.playbackRegisteredAt || '',
      inviteRegisteredAt: profile?.inviteRegisteredAt || '',
      updatedAt: new Date().toISOString(),
      notification_preferences:
        profile?.notification_preferences || DEFAULT_NOTIFICATION_PREFERENCES,
    };
    const syncedProfile = {
      ...updatedProfile,
      photo_url: getPreferredSyncedPhotoUrl(updatedProfile.photo_url) || null,
    };

    await saveUserProfile(updatedProfile);
    await syncProfileToTeamMembers(syncedProfile);
    await pushProfileToCloud(syncedProfile);

    setProfile(updatedProfile);
    setFormData((prev) => ({ ...prev, photo_url: updatedProfile.photo_url || '' }));
    return true;
  }, [profile]);

  const loadProfile = async () => {
    const userProfile = await getUserProfile();
    if (userProfile) {
      // Merge with latest from Cloudflare KV
      const merged = await pullProfileFromCloud(userProfile);
      const portablePhotoUrl = await convertPhotoToPortable(merged.photo_url);
      const normalizedRoles = parseRoleAssignments(
        merged.roleAssignments || merged.roles || [],
      );
      const normalizedProfile = {
        ...merged,
        createdAt:
          merged.createdAt
          || merged.playbackRegisteredAt
          || merged.inviteRegisteredAt
          || userProfile.createdAt
          || '',
        playbackRegisteredAt:
          merged.playbackRegisteredAt || userProfile.playbackRegisteredAt || '',
        inviteRegisteredAt:
          merged.inviteRegisteredAt || userProfile.inviteRegisteredAt || '',
        updatedAt: merged.updatedAt || userProfile.updatedAt || '',
        roleAssignments: merged.roleAssignments || normalizedRoles.join(', '),
        roles: normalizedRoles,
        photo_url: portablePhotoUrl || merged.photo_url || '',
      };

      // Persist the merged profile locally
      if (
        merged !== userProfile
        || normalizedProfile.photo_url !== (userProfile.photo_url || '')
        || normalizedProfile.createdAt !== (userProfile.createdAt || '')
        || normalizedProfile.playbackRegisteredAt !== (userProfile.playbackRegisteredAt || '')
        || normalizedProfile.inviteRegisteredAt !== (userProfile.inviteRegisteredAt || '')
      ) {
        await saveUserProfile(normalizedProfile).catch(() => {});
      }

      setProfile(normalizedProfile);
      setFormData({
        name: normalizedProfile.name || '',
        lastName: normalizedProfile.lastName || '',
        email: normalizedProfile.email || '',
        phone: normalizedProfile.phone || '',
        dateOfBirth: normalizedProfile.dateOfBirth || '',
        photo_url: normalizedProfile.photo_url || '',
        roleAssignments: normalizedProfile.roleAssignments || normalizedRoles.join(', '),
      });

      const syncedProfile = {
        ...normalizedProfile,
        photo_url: getPreferredSyncedPhotoUrl(normalizedProfile.photo_url) || null,
      };
      syncProfileToTeamMembers(syncedProfile).catch(() => {});
      pushProfileToCloud(syncedProfile).catch(() => {});
    } else {
      setIsEditing(true); // Auto-enable editing for new users
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.lastName) {
      Alert.alert('Required Fields', 'Please enter your first and last name');
      return;
    }

    try {
      const storedPhotoUrl =
        (await convertPhotoToPortable(formData.photo_url)) || formData.photo_url || '';
      const normalizedRoles = parseRoleAssignments(formData.roleAssignments);
      const updatedProfile = {
        ...profile,
        id: profile?.id || `user_${Date.now()}`,
        name: formData.name,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        dateOfBirth: formData.dateOfBirth,
        photo_url: storedPhotoUrl,
        roleAssignments: normalizedRoles.join(', '),
        roles: normalizedRoles,
        roleSyncSource: 'playback_profile',
        roleSyncUpdatedAt: new Date().toISOString(),
        createdAt:
          profile?.createdAt
          || profile?.playbackRegisteredAt
          || profile?.inviteRegisteredAt
          || new Date().toISOString(),
        playbackRegisteredAt: profile?.playbackRegisteredAt || '',
        inviteRegisteredAt: profile?.inviteRegisteredAt || '',
        updatedAt: new Date().toISOString(),
        playbackRegistered:
          profile?.playbackRegistered === true || Boolean(profile?.playbackRegisteredAt),
        notification_preferences:
          profile?.notification_preferences || DEFAULT_NOTIFICATION_PREFERENCES,
      };

      await saveUserProfile(updatedProfile);
      await syncProfileToTeamMembers({
        ...updatedProfile,
        photo_url: getPreferredSyncedPhotoUrl(updatedProfile.photo_url) || null,
      });
      // Push to Cloudflare KV so Ultimate Musician reflects the update
      pushProfileToCloud({
        ...updatedProfile,
        photo_url: getPreferredSyncedPhotoUrl(updatedProfile.photo_url) || null,
      }).catch(() => {});
      setProfile(updatedProfile);
      setIsEditing(false);

      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  const handleCancel = () => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        lastName: profile.lastName || '',
        email: profile.email || '',
        phone: profile.phone || '',
        dateOfBirth: profile.dateOfBirth || '',
        photo_url: profile.photo_url || '',
        roleAssignments:
          profile.roleAssignments ||
          parseRoleAssignments(profile.roles || []).join(', '),
      });
      setIsEditing(false);
    }
  };

  const applySelectedPhoto = useCallback(async (asset) => {
    const portablePhotoUrl = await convertPhotoToPortable(asset?.uri, {
      base64: asset?.base64 || '',
      mimeType: asset?.mimeType || inferPhotoMimeType(asset?.uri),
    });
    if (!portablePhotoUrl) {
      Alert.alert(
        'Profile Photo',
        'Could not prepare this image. Try a smaller photo or use Photo Library.'
      );
      return;
    }
    setFormData((prev) => ({ ...prev, photo_url: portablePhotoUrl }));
    await persistProfilePhoto(portablePhotoUrl);
  }, [convertPhotoToPortable, persistProfilePhoto]);

  const pickPhotoFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission required',
          'Allow photo library access to choose a profile picture, or use Files instead.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.35,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        await applySelectedPhoto(result.assets[0]);
      }
    } catch (error) {
      Alert.alert('Photo Library', 'Could not open the photo library. Try Files instead.');
    }
  }, [applySelectedPhoto]);

  const pickPhotoFromFiles = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        await applySelectedPhoto(result.assets[0]);
      }
    } catch (error) {
      Alert.alert('Files', 'Could not import an image from Files.');
    }
  }, [applySelectedPhoto]);

  const handlePhotoUpload = useCallback(() => {
    Alert.alert('Profile Photo', 'Choose how you want to add your profile photo.', [
      {
        text: 'Photo Library',
        onPress: () => {
          void pickPhotoFromLibrary();
        },
      },
      {
        text: 'Files',
        onPress: () => {
          void pickPhotoFromFiles();
        },
      },
      formData.photo_url
        ? {
            text: 'Remove Photo',
            style: 'destructive',
            onPress: () => {
              setFormData((prev) => ({ ...prev, photo_url: '' }));
              void persistProfilePhoto('');
            },
          }
        : undefined,
      { text: 'Cancel', style: 'cancel' },
    ].filter(Boolean));
  }, [formData.photo_url, persistProfilePhoto, pickPhotoFromFiles, pickPhotoFromLibrary]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
    >
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerIcon}>👤</Text>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          {isEditing ? 'Edit your information' : 'Your team member profile'}
        </Text>
      </View>

      {/* Photo Section */}
      <View style={styles.photoSection}>
        <TouchableOpacity
          style={styles.photoContainer}
          onPress={handlePhotoUpload}
        >
          {formData.photo_url ? (
            <Image
              source={{ uri: formData.photo_url }}
              style={styles.photo}
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderIcon}>📷</Text>
              <Text style={styles.photoPlaceholderText}>
                {isEditing ? 'Tap to add photo' : 'No photo'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.photoHint}>
          {isEditing ? 'Tap photo to change it' : 'Tap photo to add or change it'}
        </Text>
      </View>

      {/* Form Fields */}
      <View style={styles.formSection}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>First Name *</Text>
          <TextInput
            style={[styles.input, !isEditing && styles.inputDisabled]}
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
            placeholder="Enter your first name"
            placeholderTextColor="#6B7280"
            editable={isEditing}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Last Name *</Text>
          <TextInput
            style={[styles.input, !isEditing && styles.inputDisabled]}
            value={formData.lastName}
            onChangeText={(text) => setFormData({ ...formData, lastName: text })}
            placeholder="Enter your last name"
            placeholderTextColor="#6B7280"
            editable={isEditing}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, !isEditing && styles.inputDisabled]}
            value={formData.email}
            onChangeText={(text) => setFormData({ ...formData, email: text })}
            placeholder="Enter your email address"
            placeholderTextColor="#6B7280"
            editable={isEditing}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={[styles.input, !isEditing && styles.inputDisabled]}
            value={formData.phone}
            onChangeText={(text) => setFormData({ ...formData, phone: text })}
            placeholder="Enter your phone number"
            placeholderTextColor="#6B7280"
            editable={isEditing}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Date of Birth</Text>
          <TextInput
            style={[styles.input, !isEditing && styles.inputDisabled]}
            value={formData.dateOfBirth}
            onChangeText={(text) => setFormData({ ...formData, dateOfBirth: text })}
            placeholder="MM/DD/YYYY"
            placeholderTextColor="#6B7280"
            editable={isEditing}
          />
          <Text style={styles.helperText}>Format: MM/DD/YYYY (e.g., 01/15/1990)</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Role Assignments</Text>
          <TextInput
            style={[styles.textArea, !isEditing && styles.inputDisabled]}
            value={formData.roleAssignments}
            onChangeText={(text) => setFormData({ ...formData, roleAssignments: text })}
            placeholder="e.g., Keyboard, Bass, Acoustic Guitar, Backing Vocals, Music Director"
            placeholderTextColor="#6B7280"
            multiline
            numberOfLines={4}
            editable={isEditing}
          />
          <Text style={styles.helperText}>
            Enter all roles you can fill, separated by commas
          </Text>
        </View>
      </View>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ About Your Profile</Text>
        <Text style={styles.infoText}>
          • This information will be visible to your Admin/Manager
        </Text>
        <Text style={styles.infoText}>
          • They will assign you to services based on your roles and availability
        </Text>
        <Text style={styles.infoText}>
          • You can update your profile anytime
        </Text>
      </View>

      {/* Action Buttons */}
      {isEditing ? (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={handleCancel}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.saveButton]}
            onPress={handleSave}
          >
            <Text style={styles.saveButtonText}>Save Profile</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.button, styles.editButton]}
          onPress={() => setIsEditing(true)}
        >
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      )}

      {/* Account Info */}
      {profile && (
        <View style={styles.accountSection}>
          <Text style={styles.accountTitle}>Account Information</Text>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Member Since:</Text>
            <Text style={styles.accountValue}>
              {formatMemberSince(profile)}
            </Text>
          </View>
        </View>
      )}

      {/* Church / Organization */}
      {orgName ? (
        <View style={[styles.accountSection, { marginTop: 16 }]}>
          <Text style={styles.accountTitle}>Your Church</Text>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Organization:</Text>
            <Text style={[styles.accountValue, { color: '#818CF8' }]}>🏛 {orgName}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.supportCard}>
        <Text style={styles.supportTitle}>Support</Text>
        <Text style={styles.supportText}>
          Ran into a bug, crash, or sync problem? Send a report and the team will receive it.
        </Text>
        <TouchableOpacity
          style={styles.supportButton}
          onPress={() =>
            navigation.navigate('Feedback', {
              subject: 'Playback issue report',
              source: 'profile_screen',
            })
          }
        >
          <Text style={styles.supportButtonText}>Report a Problem</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutBtnText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  headerIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  photoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#4F46E5',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  photoPlaceholderText: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  photoHint: {
    marginTop: 12,
    fontSize: 12,
    color: '#818CF8',
    fontWeight: '600',
  },
  formSection: {
    marginBottom: 24,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#F9FAFB',
  },
  inputDisabled: {
    backgroundColor: '#020617',
    borderColor: '#1F2937',
    color: '#9CA3AF',
  },
  textArea: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#F9FAFB',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
    fontStyle: 'italic',
  },
  infoBox: {
    padding: 16,
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4F46E5',
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#374151',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  saveButton: {
    backgroundColor: '#4F46E5',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  editButton: {
    backgroundColor: '#4F46E5',
    marginBottom: 24,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  accountSection: {
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  accountTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 12,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  accountLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  accountValue: {
    fontSize: 14,
    color: '#F9FAFB',
    fontWeight: '500',
  },
  supportCard: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  supportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  supportText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#9CA3AF',
    marginBottom: 14,
  },
  supportButton: {
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  supportButtonText: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '800',
  },
  logoutBtn: {
    marginTop: 24,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7F1D1D',
    alignItems: 'center',
  },
  logoutBtnText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700',
  },
});
