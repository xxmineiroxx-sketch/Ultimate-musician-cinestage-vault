import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function Chip({ label, selected, onPress, style, textStyle }) {
  if (!label) return null;
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.text, selected && styles.textSelected, textStyle]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: '#111827',
    borderColor: '#1F2937',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  chipSelected: {
    backgroundColor: '#312E81',
    borderColor: '#4F46E5',
  },
  text: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  textSelected: {
    color: '#A5B4FC',
  },
});
