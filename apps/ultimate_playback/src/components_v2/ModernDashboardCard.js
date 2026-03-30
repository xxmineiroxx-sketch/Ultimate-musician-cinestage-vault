import React from 'react';
import { View, StyleSheet, Text, Platform, useWindowDimensions } from 'react-native';

/**
 * ModernDashboardCard - A glassmorphic card for the Ultimate Playback dashboard.
 * Designed for iPhones and Tablets (Adaptive).
 */
export default function ModernDashboardCard({ children, style, variant = 'default' }) {
  const { width } = useWindowDimensions();
  const isTablet = width > 768;

  // Variant color mappings
  const variants = {
    default: {
      bg: 'rgba(30, 41, 59, 0.5)',
      border: 'rgba(51, 65, 85, 0.5)',
      accent: '#38BDF8'
    },
    verse: {
      bg: 'rgba(30, 58, 138, 0.4)',
      border: 'rgba(59, 130, 246, 0.3)',
      accent: '#60A5FA'
    },
    alert: {
      bg: 'rgba(76, 29, 149, 0.3)',
      border: 'rgba(139, 92, 246, 0.4)',
      accent: '#A78BFA'
    },
    setup: {
      bg: 'rgba(15, 23, 42, 0.8)',
      border: '#4F46E5',
      accent: '#818CF8'
    }
  };

  const config = variants[variant] || variants.default;

  return (
    <View style={[
      styles.cardWrapper, 
      { backgroundColor: config.bg, borderColor: config.border },
      isTablet && styles.tabletCard,
      style
    ]}>
      {/* Dynamic Glow Background */}
      <View style={[styles.glow, { backgroundColor: config.accent, opacity: 0.05 }]} />
      
      <View style={[styles.content, isTablet && styles.tabletContent]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  tabletCard: {
    borderRadius: 32,
    marginBottom: 24,
  },
  glow: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  content: {
    padding: 20,
    zIndex: 1,
  },
  tabletContent: {
    padding: 32,
  }
});
