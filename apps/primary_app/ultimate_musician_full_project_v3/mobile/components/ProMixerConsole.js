import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import ProTrackFader from './ProTrackFader';

const ProMixerConsole = ({ tracks, onUpdateTrack, isWorship }) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PRO MIXER HUD</Text>
        <Text style={styles.count}>{tracks.length} CHANNELS</Text>
      </View>
      
      <FlatList
        data={tracks}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ProTrackFader 
            track={item} 
            onChange={onUpdateTrack}
            isWorship={isWorship}
          />
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  title: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  count: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
  },
  listContent: {
    paddingRight: 20,
  }
});

export default ProMixerConsole;
