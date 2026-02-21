/**
 * Messages Screen - Ultimate Playback
 * Team communication with Admin and other members
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

export default function MessagesScreen({ navigation }) {
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [composeRecipient, setComposeRecipient] = useState('manager'); // 'manager' or 'team'
  const [composeSubject, setComposeSubject] = useState('');
  const [composeMessage, setComposeMessage] = useState('');

  useEffect(() => {
    loadMessages();
    loadConversations();
  }, []);

  const loadMessages = async () => {
    try {
      const stored = await AsyncStorage.getItem('@up_messages');
      if (stored) {
        setMessages(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const loadConversations = async () => {
    try {
      const stored = await AsyncStorage.getItem('@up_conversations');
      if (stored) {
        setConversations(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const markAsRead = async (messageId) => {
    try {
      const updated = messages.map((msg) =>
        msg.id === messageId ? { ...msg, read: true } : msg
      );
      setMessages(updated);
      await AsyncStorage.setItem('@up_messages', JSON.stringify(updated));
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const message = {
        id: `msg_${Date.now()}`,
        conversation_id: selectedConversation?.id,
        sender_id: 'current_user',
        sender_name: 'You',
        content: newMessage,
        timestamp: new Date().toISOString(),
        read: true,
      };

      const updated = [...messages, message];
      setMessages(updated);
      await AsyncStorage.setItem('@up_messages', JSON.stringify(updated));
      setNewMessage('');

      Alert.alert('Sent', 'Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const sendNewMessage = async () => {
    if (!composeSubject.trim() || !composeMessage.trim()) {
      Alert.alert('Required', 'Please enter both subject and message');
      return;
    }

    try {
      const message = {
        id: `msg_${Date.now()}`,
        from: 'You',
        sender_name: 'You',
        to: composeRecipient === 'manager' ? 'Manager' : 'Team',
        subject: composeSubject,
        message: composeMessage,
        content: composeMessage,
        timestamp: new Date().toISOString(),
        read: true,
        type: composeRecipient === 'manager' ? 'admin' : 'team',
      };

      const updated = [...messages, message];
      setMessages(updated);
      await AsyncStorage.setItem('@up_messages', JSON.stringify(updated));

      // Reset compose form
      setComposeSubject('');
      setComposeMessage('');
      setShowCompose(false);

      Alert.alert('Success', `Message sent to ${composeRecipient === 'manager' ? 'Manager' : 'Team'}`);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const unreadCount = messages.filter((m) => !m.read).length;

  // Compose Message Modal
  if (showCompose) {
    return (
      <View style={styles.container}>
        <View style={styles.composeHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setShowCompose(false)}
          >
            <Text style={styles.backButtonText}>← Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.composeTitle}>New Message</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.composeBody}>
          <View style={styles.composeSection}>
            <Text style={styles.composeLabel}>Send To:</Text>
            <View style={styles.recipientButtons}>
              <TouchableOpacity
                style={[
                  styles.recipientButton,
                  composeRecipient === 'manager' && styles.recipientButtonActive,
                ]}
                onPress={() => setComposeRecipient('manager')}
              >
                <Text
                  style={[
                    styles.recipientButtonText,
                    composeRecipient === 'manager' && styles.recipientButtonTextActive,
                  ]}
                >
                  👤 Manager
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.recipientButton,
                  composeRecipient === 'team' && styles.recipientButtonActive,
                ]}
                onPress={() => setComposeRecipient('team')}
              >
                <Text
                  style={[
                    styles.recipientButtonText,
                    composeRecipient === 'team' && styles.recipientButtonTextActive,
                  ]}
                >
                  👥 Team
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.composeSection}>
            <Text style={styles.composeLabel}>Subject:</Text>
            <TextInput
              style={styles.composeInput}
              value={composeSubject}
              onChangeText={setComposeSubject}
              placeholder="Enter subject"
              placeholderTextColor="#6B7280"
            />
          </View>

          <View style={styles.composeSection}>
            <Text style={styles.composeLabel}>Message:</Text>
            <TextInput
              style={styles.composeTextArea}
              value={composeMessage}
              onChangeText={setComposeMessage}
              placeholder="Type your message..."
              placeholderTextColor="#6B7280"
              multiline
              numberOfLines={8}
            />
          </View>

          <TouchableOpacity style={styles.composeSendButton} onPress={sendNewMessage}>
            <Text style={styles.composeSendButtonText}>Send Message</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  const renderMessage = ({ item }) => (
    <TouchableOpacity
      style={[styles.messageCard, !item.read && styles.unreadMessage]}
      onPress={() => {
        markAsRead(item.id);
        setSelectedConversation(item);
      }}
    >
      <View style={styles.messageHeader}>
        <Text style={styles.messageSender}>{item.sender_name || item.from}</Text>
        <Text style={styles.messageTime}>
          {new Date(item.timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>

      {item.subject && (
        <Text style={styles.messageSubject}>{item.subject}</Text>
      )}

      <Text style={styles.messagePreview} numberOfLines={2}>
        {item.content || item.message}
      </Text>

      <View style={styles.messageFooter}>
        <View
          style={[
            styles.typeBadge,
            item.type === 'admin' && styles.adminBadge,
            item.type === 'team' && styles.teamBadge,
            item.type === 'system' && styles.systemBadge,
          ]}
        >
          <Text style={styles.typeBadgeText}>
            {item.type === 'admin' ? '👤 Admin' :
             item.type === 'team' ? '👥 Team' :
             '⚙️ System'}
          </Text>
        </View>
        {!item.read && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );

  if (selectedConversation) {
    return (
      <View style={styles.container}>
        <View style={styles.conversationHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setSelectedConversation(null)}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.conversationTitle}>
            {selectedConversation.sender_name || selectedConversation.from}
          </Text>
        </View>

        <ScrollView style={styles.conversationBody}>
          <View style={styles.messageBubble}>
            <Text style={styles.bubbleSender}>
              {selectedConversation.sender_name || selectedConversation.from}
            </Text>
            {selectedConversation.subject && (
              <Text style={styles.bubbleSubject}>{selectedConversation.subject}</Text>
            )}
            <Text style={styles.bubbleText}>
              {selectedConversation.content || selectedConversation.message}
            </Text>
            <Text style={styles.bubbleTime}>
              {new Date(selectedConversation.timestamp).toLocaleString()}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.replyBox}>
          <TextInput
            style={styles.replyInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type your reply..."
            placeholderTextColor="#6B7280"
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>💬</Text>
        <Text style={styles.title}>Messages</Text>
        <Text style={styles.subtitle}>
          {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
        </Text>
      </View>

      {/* New Message Button */}
      <TouchableOpacity
        style={styles.newMessageButton}
        onPress={() => setShowCompose(true)}
      >
        <Text style={styles.newMessageButtonIcon}>✉️</Text>
        <Text style={styles.newMessageButtonText}>New Message</Text>
      </TouchableOpacity>

      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>No Messages</Text>
          <Text style={styles.emptyText}>
            You'll receive messages here from your team and admins.
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  filterRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#0B1120',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  messagesList: {
    padding: 16,
    paddingTop: 0,
  },
  messageCard: {
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12,
  },
  unreadMessage: {
    backgroundColor: '#1E1B4B',
    borderColor: '#4F46E5',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  messageSender: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  messageTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  messageSubject: {
    fontSize: 14,
    fontWeight: '500',
    color: '#E5E7EB',
    marginBottom: 4,
  },
  messagePreview: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#374151',
  },
  adminBadge: {
    backgroundColor: '#7C3AED20',
  },
  teamBadge: {
    backgroundColor: '#10B98120',
  },
  systemBadge: {
    backgroundColor: '#F59E0B20',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4F46E5',
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  backButton: {
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#4F46E5',
  },
  conversationTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  conversationBody: {
    flex: 1,
    padding: 16,
  },
  messageBubble: {
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  bubbleSender: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 4,
  },
  bubbleSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  bubbleText: {
    fontSize: 14,
    color: '#E5E7EB',
    lineHeight: 20,
    marginBottom: 8,
  },
  bubbleTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  replyBox: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    gap: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#F9FAFB',
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  newMessageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  newMessageButtonIcon: {
    fontSize: 20,
  },
  newMessageButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  composeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  composeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  composeBody: {
    flex: 1,
    padding: 16,
  },
  composeSection: {
    marginBottom: 24,
  },
  composeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  recipientButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  recipientButton: {
    flex: 1,
    padding: 16,
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#374151',
    alignItems: 'center',
  },
  recipientButtonActive: {
    backgroundColor: '#1E1B4B',
    borderColor: '#4F46E5',
  },
  recipientButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  recipientButtonTextActive: {
    color: '#F9FAFB',
  },
  composeInput: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#F9FAFB',
  },
  composeTextArea: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#F9FAFB',
    minHeight: 200,
    textAlignVertical: 'top',
  },
  composeSendButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  composeSendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
