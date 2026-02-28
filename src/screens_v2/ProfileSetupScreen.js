/**
 * Profile Screen - Ultimate Playback
 * User profile with name, photo, date of birth, and role assignments
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile, saveUserProfile } from '../services/storage';

export default function ProfileSetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    photo_url: '',
    roleAssignments: '',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const userProfile = await getUserProfile();
    if (userProfile) {
      setProfile(userProfile);
      setFormData({
        name: userProfile.name || '',
        lastName: userProfile.lastName || '',
        email: userProfile.email || '',
        phone: userProfile.phone || '',
        dateOfBirth: userProfile.dateOfBirth || '',
        photo_url: userProfile.photo_url || '',
        roleAssignments: userProfile.roleAssignments || '',
      });
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
      const updatedProfile = {
        ...profile,
        id: profile?.id || `user_${Date.now()}`,
        name: formData.name,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        dateOfBirth: formData.dateOfBirth,
        photo_url: formData.photo_url,
        roleAssignments: formData.roleAssignments,
        roles: formData.roleAssignments ? formData.roleAssignments.split(',').map(r => r.trim()) : [],
        notification_preferences: profile?.notification_preferences || {
          assignments: true,
          messages: true,
          reminders: true,
        },
      };

      await saveUserProfile(updatedProfile);
      setProfile(updatedProfile);
      setIsEditing(false);

      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    }
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
        roleAssignments: profile.roleAssignments || '',
      });
      setIsEditing(false);
    }
  };

  const handlePhotoUpload = () => {
    Alert.alert(
      'Photo Upload',
      'Photo upload feature will be available soon. For now, you can use a default avatar.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use Default',
          onPress: () => {
            setFormData({ ...formData, photo_url: 'https://via.placeholder.com/150' });
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
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
          onPress={isEditing ? handlePhotoUpload : null}
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
              {profile.id ? new Date(parseInt(profile.id.split('_')[1])).toLocaleDateString() : 'N/A'}
            </Text>
          </View>
        </View>
      )}
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
});
