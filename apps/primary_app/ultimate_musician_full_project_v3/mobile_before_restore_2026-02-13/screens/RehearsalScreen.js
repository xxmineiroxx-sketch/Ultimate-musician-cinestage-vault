import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import { addOrUpdateService, getServices, getSongs } from '../data/storage';

export default function RehearsalScreen({ route, navigation }) {
  const { serviceId } = route.params || {};
  const [service, setService] = useState(null);
  const [songs, setSongs] = useState([]);

  const load = async () => {
    const services = await getServices();
    const chosen = services.find((s) => s.id === serviceId) || services[0] || null;
    setService(chosen);
    const library = await getSongs();
    setSongs(library);
  };

  useEffect(() => {
    load();
  }, [serviceId]);

  const handleAddToSetlist = async (songId) => {
    if (!service) return;
    const setlist = service.setlist || [];
    if (setlist.includes(songId)) return;
    const next = { ...service, setlist: [...setlist, songId] };
    await addOrUpdateService(next);
    setService(next);
  };

  if (!service) {
    return (
      <View style={styles.container}>
        <Text style={styles.caption}>No active service yet.</Text>
      </View>
    );
  }

  const setlistSongs = songs.filter((s) => (service.setlist || []).includes(s.id));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Rehearsal</Text>
      <Text style={styles.caption}>{service.title}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Setlist</Text>
        {setlistSongs.map((song) => (
          <TouchableOpacity
            key={song.id}
            style={styles.row}
            onPress={() => navigation.navigate('SongDetail', { songId: song.id })}
          >
            <Text style={styles.songTitle}>{song.title}</Text>
            <Text style={styles.songMeta}>{song.artist || ''}</Text>
          </TouchableOpacity>
        ))}
        {!setlistSongs.length && <Text style={styles.caption}>No songs yet.</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add Songs</Text>
        {songs.map((song) => (
          <TouchableOpacity key={song.id} style={styles.addRow} onPress={() => handleAddToSetlist(song.id)}>
            <Text style={styles.songTitle}>{song.title}</Text>
            <Text style={styles.addHint}>Add</Text>
          </TouchableOpacity>
        ))}
      </View>

      <PrimaryButton title="Open Live View" onPress={() => navigation.navigate('Live', { song: {}, mixerState: [] })} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#020617',
  },
  heading: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  caption: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#0B1120',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#111827',
    marginBottom: 12,
  },
  cardTitle: {
    color: '#E5E7EB',
    fontWeight: '600',
    marginBottom: 8,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  songTitle: {
    color: '#F9FAFB',
    fontWeight: '600',
  },
  songMeta: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  addHint: {
    color: '#8B5CF6',
    fontSize: 12,
  },
});
