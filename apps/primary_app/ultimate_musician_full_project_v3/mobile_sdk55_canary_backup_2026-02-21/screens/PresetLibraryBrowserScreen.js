/**
 * Preset Library Browser Screen - Ultimate Playback
 * Browse and select presets from device libraries
 * Phase 2: Nord Stage 4 and MODX preset browsing
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Alert,
} from 'react-native';

// Mock preset libraries (Phase 2: will query from devices)
const NORD_STAGE_4_LIBRARY = {
  factory: {
    acoustic: [
      { id: 1, name: 'Grand Piano', category: 'Piano', bank: 'Factory', location: '001' },
      { id: 2, name: 'Bright Piano', category: 'Piano', bank: 'Factory', location: '002' },
      { id: 3, name: 'Electric Piano', category: 'Piano', bank: 'Factory', location: '003' },
      { id: 4, name: 'Wurlitzer', category: 'EP', bank: 'Factory', location: '004' },
      { id: 5, name: 'Rhodes', category: 'EP', bank: 'Factory', location: '005' },
    ],
    synth: [
      { id: 11, name: 'Analog Lead', category: 'Synth', bank: 'Factory', location: '011' },
      { id: 12, name: 'Pad Strings', category: 'Synth', bank: 'Factory', location: '012' },
      { id: 13, name: 'Brass Section', category: 'Synth', bank: 'Factory', location: '013' },
      { id: 14, name: 'Poly Synth', category: 'Synth', bank: 'Factory', location: '014' },
    ],
    organ: [
      { id: 21, name: 'B3 Classic', category: 'Organ', bank: 'Factory', location: '021' },
      { id: 22, name: 'Church Organ', category: 'Organ', bank: 'Factory', location: '022' },
      { id: 23, name: 'Jazz Organ', category: 'Organ', bank: 'Factory', location: '023' },
    ],
  },
  user: [
    { id: 101, name: 'My Custom Piano', category: 'Piano', bank: 'User', location: 'U01' },
    { id: 102, name: 'Worship Pad', category: 'Synth', bank: 'User', location: 'U02' },
  ],
};

const MODX_LIBRARY = {
  preset: [
    { id: 1, name: 'CFX Concert', category: 'Piano', bank: 'Preset', performance: 1 },
    { id: 2, name: 'S6 Grand', category: 'Piano', bank: 'Preset', performance: 2 },
    { id: 3, name: 'FM EP', category: 'EP', bank: 'Preset', performance: 3 },
    { id: 4, name: '70s Chorus EP', category: 'EP', bank: 'Preset', performance: 4 },
    { id: 5, name: 'Analog Strings', category: 'Strings', bank: 'Preset', performance: 5 },
    { id: 6, name: 'Orchestra', category: 'Strings', bank: 'Preset', performance: 6 },
    { id: 7, name: 'Brass Section', category: 'Brass', bank: 'Preset', performance: 7 },
    { id: 8, name: 'Synth Lead', category: 'Lead', bank: 'Preset', performance: 8 },
    { id: 9, name: 'Ambient Pad', category: 'Pad', bank: 'Preset', performance: 9 },
    { id: 10, name: 'Worship Keys', category: 'Pad', bank: 'Preset', performance: 10 },
  ],
  user: [
    { id: 101, name: 'My Split 1', category: 'Split', bank: 'User', performance: 641 },
    { id: 102, name: 'My Split 2', category: 'Split', bank: 'User', performance: 642 },
  ],
};

export default function PresetLibraryBrowserScreen({ route, navigation }) {
  const { deviceType } = route.params;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedBank, setSelectedBank] = useState('All');
  const [presets, setPresets] = useState([]);
  const [filteredPresets, setFilteredPresets] = useState([]);

  useEffect(() => {
    loadPresets();
  }, [deviceType]);

  useEffect(() => {
    filterPresets();
  }, [searchQuery, selectedCategory, selectedBank, presets]);

  const loadPresets = () => {
    if (deviceType === 'nord_stage_4') {
      // Flatten Nord library
      const allPresets = [
        ...NORD_STAGE_4_LIBRARY.factory.acoustic,
        ...NORD_STAGE_4_LIBRARY.factory.synth,
        ...NORD_STAGE_4_LIBRARY.factory.organ,
        ...NORD_STAGE_4_LIBRARY.user,
      ];
      setPresets(allPresets);
    } else if (deviceType === 'modx') {
      const allPresets = [
        ...MODX_LIBRARY.preset,
        ...MODX_LIBRARY.user,
      ];
      setPresets(allPresets);
    }
  };

  const filterPresets = () => {
    let filtered = [...presets];

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory !== 'All') {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    // Filter by bank
    if (selectedBank !== 'All') {
      filtered = filtered.filter((p) => p.bank === selectedBank);
    }

    setFilteredPresets(filtered);
  };

  const getCategories = () => {
    const categories = new Set(presets.map((p) => p.category));
    return ['All', ...Array.from(categories)];
  };

  const getBanks = () => {
    const banks = new Set(presets.map((p) => p.bank));
    return ['All', ...Array.from(banks)];
  };

  const handleSelectPreset = (preset) => {
    Alert.alert(
      'Preset Selected',
      `${preset.name}\n\nBank: ${preset.bank}\nCategory: ${preset.category}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add to Song',
          onPress: () => {
            // TODO: Navigate back with preset info
            navigation.navigate('PresetEditor', {
              selectedPreset: preset,
            });
          },
        },
      ]
    );
  };

  const getDeviceName = () => {
    if (deviceType === 'nord_stage_4') return 'Nord Stage 4';
    if (deviceType === 'modx') return 'Yamaha MODX';
    return deviceType;
  };

  const renderPresetItem = ({ item }) => (
    <TouchableOpacity
      style={styles.presetItem}
      onPress={() => handleSelectPreset(item)}
    >
      <View style={styles.presetInfo}>
        <Text style={styles.presetName}>{item.name}</Text>
        <View style={styles.presetMeta}>
          <Text style={styles.presetCategory}>{item.category}</Text>
          <Text style={styles.presetDivider}>•</Text>
          <Text style={styles.presetBank}>{item.bank}</Text>
          {item.location && (
            <>
              <Text style={styles.presetDivider}>•</Text>
              <Text style={styles.presetLocation}>{item.location}</Text>
            </>
          )}
          {item.performance && (
            <>
              <Text style={styles.presetDivider}>•</Text>
              <Text style={styles.presetPerformance}>#{item.performance}</Text>
            </>
          )}
        </View>
      </View>
      <Text style={styles.presetArrow}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{getDeviceName()} Library</Text>
        <Text style={styles.subtitle}>Browse and select presets</Text>
      </View>

      {/* Search */}
      <TextInput
        style={styles.searchInput}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search presets..."
        placeholderTextColor="#6B7280"
      />

      {/* Filters */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Category:</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
        >
          {getCategories().map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.filterChip,
                selectedCategory === cat && styles.filterChipActive,
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCategory === cat && styles.filterChipTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Bank:</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
        >
          {getBanks().map((bank) => (
            <TouchableOpacity
              key={bank}
              style={[
                styles.filterChip,
                selectedBank === bank && styles.filterChipActive,
              ]}
              onPress={() => setSelectedBank(bank)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedBank === bank && styles.filterChipTextActive,
                ]}
              >
                {bank}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Results count */}
      <Text style={styles.resultsCount}>
        {filteredPresets.length} preset{filteredPresets.length !== 1 ? 's' : ''}
      </Text>

      {/* Preset list */}
      <FlatList
        data={filteredPresets}
        renderItem={renderPresetItem}
        keyExtractor={(item) => item.id.toString()}
        style={styles.presetList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>No presets found</Text>
          </View>
        }
      />

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 Phase 2 Note:</Text>
        <Text style={styles.infoText}>
          Currently showing mock library data. Phase 3 will query presets directly from your device!
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#020617',
  },
  header: {
    marginBottom: 16,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 4,
  },
  searchInput: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#F9FAFB',
    fontSize: 16,
    marginBottom: 16,
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 8,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterChipText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#F9FAFB',
    fontWeight: '600',
  },
  resultsCount: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 8,
  },
  presetList: {
    flex: 1,
    marginBottom: 16,
  },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#374151',
  },
  presetInfo: {
    flex: 1,
  },
  presetName: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  presetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  presetCategory: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '500',
  },
  presetBank: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  presetLocation: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  presetPerformance: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  presetDivider: {
    color: '#6B7280',
    fontSize: 12,
    marginHorizontal: 6,
  },
  presetArrow: {
    color: '#6B7280',
    fontSize: 20,
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
  infoBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1E1B4B',
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  infoTitle: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    color: '#9CA3AF',
    fontSize: 11,
  },
});
