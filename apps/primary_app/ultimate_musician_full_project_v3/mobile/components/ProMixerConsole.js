import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import ProTrackFader from './ProTrackFader';

const ProMixerConsole = ({ tracks, onUpdateTrack, isWorship }) => {
  const [expandedGroups, setExpandedGroups] = useState({});

  // Group tracks by parent category
  const groups = tracks.reduce((acc, track) => {
    const parent = track.parent_category || 'other';
    if (!acc[parent]) acc[parent] = [];
    acc[parent].push(track);
    return acc;
  }, {});

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  const renderGroup = (groupName, groupTracks) => {
    const isExpanded = expandedGroups[groupName];
    const groupColor = groupName === 'vocals' ? '#EC4899' : groupName === 'guitars' ? '#8B5CF6' : '#6366F1';

    return (
      <View key={groupName} style={[styles.groupContainer, isExpanded && styles.groupExpanded]}>
        {/* Group Header / Folder */}
        <TouchableOpacity 
          style={[styles.groupHeader, { borderLeftColor: groupColor }]} 
          onPress={() => toggleGroup(groupName)}
        >
          <Text style={styles.groupEmoji}>{groupName === 'vocals' ? '🎤' : groupName === 'drums' ? '🥁' : '🎸'}</Text>
          <Text style={styles.groupTitle}>{groupName.toUpperCase()}</Text>
          <View style={[styles.badge, { backgroundColor: groupColor }]}>
            <Text style={styles.badgeText}>{groupTracks.length}</Text>
          </View>
        </TouchableOpacity>

        {/* Collapsible Tracks */}
        {isExpanded && (
          <View style={styles.tracksRow}>
            {groupTracks.map(track => (
              <ProTrackFader 
                key={track.id}
                track={track} 
                onChange={onUpdateTrack}
                compact
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>ULTIMATE MIXER HUD</Text>
          <Text style={styles.version}>v3.3.0 · HI-RES ENGINE</Text>
        </View>
        
        <View style={styles.aiControls}>
          <View style={styles.aiPill}>
             <View style={styles.aiIndicator} />
             <Text style={styles.aiText}>AI INFILL ACTIVE</Text>
          </View>
        </View>
      </View>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        {/* Master Section */}
        <View style={styles.masterSection}>
          <ProTrackFader 
            track={{ name: 'MASTER', id: 'master', volume: 0.9 }} 
            onChange={() => {}} 
            isMaster
          />
        </View>

        {/* Hierarchical Groups */}
        {Object.entries(groups).map(([name, tracks]) => renderGroup(name, tracks))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#020617',
    borderRadius: 28,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  title: {
    color: '#F8FAF3',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  version: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  aiControls: {
    flexDirection: 'row',
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  aiIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  aiText: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '900',
  },
  listContent: {
    flexDirection: 'row',
    paddingRight: 40,
  },
  masterSection: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.1)',
    marginRight: 16,
    paddingRight: 8,
  },
  groupContainer: {
    marginRight: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
  },
  groupExpanded: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingRight: 12,
  },
  groupHeader: {
    width: 60,
    height: 300, // Matches track height
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 4,
  },
  groupEmoji: {
    fontSize: 20,
    marginBottom: 12,
  },
  groupTitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '900',
    transform: [{ rotate: '90deg' }],
    width: 120,
    textAlign: 'center',
  },
  badge: {
    marginTop: 40,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
  },
  tracksRow: {
    flexDirection: 'row',
    paddingLeft: 8,
  }
});

export default ProMixerConsole;
