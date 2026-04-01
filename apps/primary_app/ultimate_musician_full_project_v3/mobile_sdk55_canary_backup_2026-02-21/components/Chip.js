import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  selected: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  text: {
    color: '#E5E7EB',
    fontSize: 12,
  },
  textSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
