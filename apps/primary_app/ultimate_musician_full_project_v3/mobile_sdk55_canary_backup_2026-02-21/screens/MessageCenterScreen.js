/**
 * Message Center Screen - Ultimate Musician
 * Team communication, announcements, and notifications
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MOCK_MESSAGES = [
  {
    id: '1',
    from: 'Band Leader',
    subject: 'Rehearsal Tomorrow',
    message: "Don't forget we have rehearsal tomorrow at 7 PM. Please review the new setlist!",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    read: false,
    type: 'team',
  },
  {
    id: '2',
    from: 'System',
    subject: 'Preset Sync Complete',
    message: 'Your device presets have been successfully synced to the cloud.',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    read: true,
    type: 'system',
  },
  {
    id: '3',
    from: 'John (Guitarist)',
    subject: 'Key Change Request',
    message: 'Hey, can we change "Amazing Grace" to the key of G? It\'s easier for my vocal range.',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    read: false,
    type: 'team',
  },
  {
    id: '4',
    from: 'System',
    subject: 'New Feature Available',
    message: 'Check out the new Auto-Transpose feature in the Presets tab!',
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    read: true,
    type: 'system',
  },
];

export default function MessageCenterScreen({ navigation }) {
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'team', 'system'

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    try {
      const stored = await AsyncStorage.getItem('@messages');
      if (stored) {
        setMessages(JSON.parse(stored));
      } else {
        setMessages(MOCK_MESSAGES);
        await AsyncStorage.setItem('@messages', JSON.stringify(MOCK_MESSAGES));
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      setMessages(MOCK_MESSAGES);
    }
  };

  const markAsRead = async (messageId) => {
    try {
      const updated = messages.map((msg) =>
        msg.id === messageId ? { ...msg, read: true } : msg
      );
      setMessages(updated);
      await AsyncStorage.setItem('@messages', JSON.stringify(updated));
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const deleteMessage = async (messageId) => {
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const updated = messages.filter((msg) => msg.id !== messageId);
            setMessages(updated);
            await AsyncStorage.setItem('@messages', JSON.stringify(updated));
            setSelectedMessage(null);
          } catch (error) {
            console.error('Error deleting message:', error);
          }
        },
      },
    ]);
  };

  const getTimeAgo = (timestamp) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  };

  const filteredMessages = messages.filter((msg) => {
    if (filter === 'all') return true;
    return msg.type === filter;
  });

  const unreadCount = messages.filter((msg) => !msg.read).length;

  if (selectedMessage) {
    return (
      <View style={styles.container}>
        <View style={styles.messageHeader}>
          <TouchableOpacity
            onPress={() => setSelectedMessage(null)}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => deleteMessage(selectedMessage.id)}
            style={styles.deleteButton}
          >
            <Text style={styles.deleteButtonText}>🗑️</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.messageContent}>
          <View style={styles.messageHeaderInfo}>
            <Text style={styles.messageFrom}>{selectedMessage.from}</Text>
            <Text style={styles.messageTime}>
              {getTimeAgo(selectedMessage.timestamp)}
            </Text>
          </View>

          <Text style={styles.messageSubject}>{selectedMessage.subject}</Text>

          <View style={styles.messageBody}>
            <Text style={styles.messageText}>{selectedMessage.message}</Text>
          </View>
        </ScrollView>

        <View style={styles.messageActions}>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount} unread</Text>
          </View>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === 'all' && styles.filterButtonTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, filter === 'team' && styles.filterButtonActive]}
          onPress={() => setFilter('team')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === 'team' && styles.filterButtonTextActive,
            ]}
          >
            Team
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, filter === 'system' && styles.filterButtonActive]}
          onPress={() => setFilter('system')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === 'system' && styles.filterButtonTextActive,
            ]}
          >
            System
          </Text>
        </TouchableOpacity>
      </View>

      {/* Message List */}
      <FlatList
        data={filteredMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.messageItem, !item.read && styles.messageItemUnread]}
            onPress={() => {
              setSelectedMessage(item);
              markAsRead(item.id);
            }}
          >
            <View style={styles.messageItemHeader}>
              <View style={styles.messageItemFrom}>
                {!item.read && <View style={styles.unreadDot} />}
                <Text style={styles.messageItemFromText}>{item.from}</Text>
              </View>
              <Text style={styles.messageItemTime}>
                {getTimeAgo(item.timestamp)}
              </Text>
            </View>
            <Text style={styles.messageItemSubject}>{item.subject}</Text>
            <Text style={styles.messageItemPreview} numberOfLines={2}>
              {item.message}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📬</Text>
            <Text style={styles.emptyStateText}>No messages</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F9FAFB',
  },
  unreadBadge: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  filters: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
  },
  filterButtonActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  messageItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  messageItemUnread: {
    backgroundColor: '#0B1120',
  },
  messageItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  messageItemFrom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8B5CF6',
  },
  messageItemFromText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  messageItemTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  messageItemSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  messageItemPreview: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
  },
  // Message View Styles
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 18,
    color: '#8B5CF6',
    fontWeight: '500',
  },
  deleteButton: {
    padding: 8,
  },
  deleteButtonText: {
    fontSize: 20,
  },
  messageContent: {
    flex: 1,
    padding: 20,
  },
  messageHeaderInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  messageFrom: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  messageTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  messageSubject: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 24,
  },
  messageBody: {
    backgroundColor: '#0B1120',
    borderRadius: 12,
    padding: 16,
  },
  messageText: {
    fontSize: 16,
    color: '#E5E7EB',
    lineHeight: 24,
  },
  messageActions: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  actionButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
