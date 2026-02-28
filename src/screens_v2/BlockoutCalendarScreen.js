/**
 * Blockout Calendar Screen - Phase 2
 * Mark dates when unavailable for service
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { getUserProfile, saveUserProfile } from '../services/storage';

const SYNC_URL = 'http://10.0.0.34:8099';

async function serverBlockout(method, params = {}, body = null) {
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 5000);
    const qs   = new URLSearchParams(params).toString();
    const url  = `${SYNC_URL}/sync/blockout${qs ? '?' + qs : ''}`;
    const opts = { method, signal: ctrl.signal };
    if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    clearTimeout(tid);
    return await res.json();
  } catch (_) { return null; }
}

export default function BlockoutCalendarScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [blockoutDates, setBlockoutDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [reason, setReason] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const userProfile = await getUserProfile();
    if (!userProfile) return;
    setProfile(userProfile);

    let localDates = userProfile.blockout_dates || [];

    // Pull from server and merge (handles reinstalls / multiple devices)
    if (userProfile.email) {
      try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 4000);
        const res  = await fetch(
          `${SYNC_URL}/sync/blockouts?email=${encodeURIComponent(userProfile.email.trim().toLowerCase())}`,
          { signal: ctrl.signal }
        );
        clearTimeout(tid);
        if (res.ok) {
          const serverDates = await res.json();
          if (serverDates.length > 0) {
            const localIds  = new Set(localDates.map(b => b.id));
            const newFromServer = serverDates.filter(b => !localIds.has(b.id));
            if (newFromServer.length > 0) {
              localDates = [...localDates, ...newFromServer];
              await saveUserProfile({ ...userProfile, blockout_dates: localDates });
            }
          }
        }
      } catch (_) {}
    }

    setBlockoutDates(localDates);
  };

  const handleAddDate = async () => {
    if (!selectedDate) {
      Alert.alert('Error', 'Please select a date from the calendar');
      return;
    }

    // Format date as YYYY-MM-DD
    const dateStr = selectedDate.toISOString().split('T')[0];

    // Check if date already blocked
    const alreadyBlocked = blockoutDates.some(b => b.date === dateStr);
    if (alreadyBlocked) {
      Alert.alert('Already Blocked', 'This date is already in your blockout list');
      return;
    }

    const newBlockout = {
      id: `blockout_${Date.now()}`,
      date: dateStr,
      reason: reason || 'Not available',
      created_at: new Date().toISOString(),
    };

    const updatedDates = [...blockoutDates, newBlockout];
    setBlockoutDates(updatedDates);

    try {
      const updatedProfile = { ...profile, blockout_dates: updatedDates };
      await saveUserProfile(updatedProfile);

      // Sync to server so admin can see blockouts when assigning
      if (profile?.email) {
        await serverBlockout('POST', {}, {
          ...newBlockout,
          email: profile.email.trim().toLowerCase(),
          name:  profile.name || profile.email,
        });
      }

      Alert.alert('Success', 'Blockout date added');
      setSelectedDate(null);
      setReason('');
    } catch (error) {
      Alert.alert('Error', 'Failed to add blockout date');
    }
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
  };

  const changeMonth = (direction) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
  };

  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before the first of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const isDateBlocked = (date) => {
    if (!date) return false;
    const dateStr = date.toISOString().split('T')[0];
    return blockoutDates.some(b => b.date === dateStr);
  };

  const isDateSelected = (date) => {
    if (!date || !selectedDate) return false;
    return date.toISOString().split('T')[0] === selectedDate.toISOString().split('T')[0];
  };

  const isDateInPast = (date) => {
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const handleRemoveDate = async (blockoutId) => {
    Alert.alert(
      'Remove Blockout Date',
      'Are you sure you want to remove this blockout date?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updatedDates = blockoutDates.filter((d) => d.id !== blockoutId);
            setBlockoutDates(updatedDates);

            try {
              const updatedProfile = { ...profile, blockout_dates: updatedDates };
              await saveUserProfile(updatedProfile);

              // Remove from server
              if (profile?.email) {
                await serverBlockout('DELETE', { id: blockoutId, email: profile.email.trim().toLowerCase() });
              }

              Alert.alert('Success', 'Blockout date removed');
            } catch (error) {
              Alert.alert('Error', 'Failed to remove blockout date');
            }
          },
        },
      ]
    );
  };

  const sortedDates = [...blockoutDates].sort((a, b) =>
    new Date(a.date) - new Date(b.date)
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
    >
      <View style={styles.header}>
        <Text style={styles.headerIcon}>📅</Text>
        <Text style={styles.title}>Blockout Calendar</Text>
        <Text style={styles.subtitle}>Mark dates when you're unavailable</Text>
      </View>

      <View style={styles.addSection}>
        <Text style={styles.sectionTitle}>Add Blockout Date</Text>

        {/* Calendar Navigation */}
        <View style={styles.calendarHeader}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => changeMonth(-1)}
          >
            <Text style={styles.navButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.monthTitle}>
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => changeMonth(1)}
          >
            <Text style={styles.navButtonText}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Calendar Grid */}
        <View style={styles.calendar}>
          {/* Day Headers */}
          <View style={styles.weekRow}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <View key={day} style={styles.dayHeader}>
                <Text style={styles.dayHeaderText}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Calendar Days */}
          <View style={styles.daysGrid}>
            {generateCalendarDays().map((date, index) => {
              const blocked = isDateBlocked(date);
              const selected = isDateSelected(date);
              const isPast = isDateInPast(date);

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dayCell,
                    !date && styles.emptyCell,
                    selected && styles.selectedCell,
                    blocked && styles.blockedCell,
                    isPast && styles.pastCell,
                  ]}
                  onPress={() => date && !isPast && handleDateSelect(date)}
                  disabled={!date || isPast}
                >
                  {date && (
                    <Text
                      style={[
                        styles.dayText,
                        selected && styles.selectedDayText,
                        blocked && styles.blockedDayText,
                        isPast && styles.pastDayText,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Selected Date Display */}
        {selectedDate && (
          <View style={styles.selectedDateDisplay}>
            <Text style={styles.selectedDateLabel}>Selected Date:</Text>
            <Text style={styles.selectedDateText}>
              {selectedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
        )}

        <Text style={styles.label}>Reason (optional)</Text>
        <TextInput
          style={styles.input}
          value={reason}
          onChangeText={setReason}
          placeholder="Vacation, Family event, etc."
          placeholderTextColor="#6B7280"
        />

        <TouchableOpacity style={styles.addButton} onPress={handleAddDate}>
          <Text style={styles.addButtonText}>Add Blockout Date</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>
          Your Blockout Dates ({sortedDates.length})
        </Text>

        {sortedDates.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📆</Text>
            <Text style={styles.emptyText}>
              No blockout dates set. You can add dates when you know you'll be unavailable.
            </Text>
          </View>
        ) : (
          sortedDates.map((blockout) => (
            <View key={blockout.id} style={styles.dateCard}>
              <View style={styles.dateCardContent}>
                <Text style={styles.dateText}>
                  📅 {new Date(blockout.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                {blockout.reason && (
                  <Text style={styles.reasonText}>{blockout.reason}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveDate(blockout.id)}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ How it works</Text>
        <Text style={styles.infoText}>
          • Admins/Managers won't be able to assign you to services on blocked dates
        </Text>
        <Text style={styles.infoText}>
          • You can add or remove blockout dates at any time
        </Text>
        <Text style={styles.infoText}>
          • Set dates for vacations, family events, or other commitments
        </Text>
      </View>
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
    marginBottom: 24,
    paddingTop: 20,
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
  },
  addSection: {
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#F9FAFB',
  },
  addButton: {
    backgroundColor: '#4F46E5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  listSection: {
    marginBottom: 24,
  },
  dateCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12,
  },
  dateCardContent: {
    flex: 1,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EF4444',
    borderRadius: 6,
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  infoBox: {
    padding: 16,
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 4,
  },
  navButton: {
    padding: 4,
    backgroundColor: '#374151',
    borderRadius: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  navButtonText: {
    fontSize: 14,
    color: '#E5E7EB',
    fontWeight: '600',
  },
  monthTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  calendar: {
    marginBottom: 8,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayHeaderText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 1,
  },
  emptyCell: {
    backgroundColor: 'transparent',
  },
  selectedCell: {
    backgroundColor: '#4F46E5',
    borderRadius: 4,
  },
  blockedCell: {
    backgroundColor: '#EF444420',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  pastCell: {
    opacity: 0.3,
  },
  dayText: {
    fontSize: 11,
    color: '#E5E7EB',
  },
  selectedDayText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  blockedDayText: {
    color: '#EF4444',
    fontWeight: '600',
  },
  pastDayText: {
    color: '#6B7280',
  },
  selectedDateDisplay: {
    padding: 8,
    backgroundColor: '#1E1B4B',
    borderRadius: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  selectedDateLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  selectedDateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F9FAFB',
  },
});
