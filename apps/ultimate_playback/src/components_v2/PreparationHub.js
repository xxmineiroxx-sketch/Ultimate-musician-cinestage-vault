import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import ModernDashboardCard from './ModernDashboardCard';

/**
 * PreparationHub - Visualizes user readiness and practice progress.
 * Optimized for high-end iOS displays with subtle animations.
 */
export default function PreparationHub({ score = 85, mastered = 4, total = 6 }) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Score filling animation
    Animated.timing(animatedValue, {
      toValue: score,
      duration: 1500,
      easing: Easing.out(Easing.exp),
      useNativeDriver: false,
    }).start();

    // Subtle pulse for the "active" glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [score]);

  return (
    <ModernDashboardCard variant="default" style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Preparation Hub</Text>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>READY FOR SUNDAY</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Readiness Circular Progress (CSS approach) */}
        <View style={styles.scoreContainer}>
          <View style={styles.scoreCircle}>
            <Animated.Text style={styles.scoreNumber}>
              {score}%
            </Animated.Text>
            <Text style={styles.scoreLabel}>READINESS</Text>
          </View>
          
          {/* Animated Progress Ring Background */}
          <View style={styles.ringBg} />
        </View>

        {/* Stats and Progress Bars */}
        <View style={styles.statsContainer}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Songs Mastered</Text>
            <Text style={styles.statValue}>{mastered}/{total}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <Animated.View 
              style={[
                styles.progressBarFill, 
                { width: animatedValue.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%']
                  })
                }
              ]} 
            />
          </View>

          <View style={[styles.statRow, { marginTop: 15 }]}>
            <Text style={styles.statLabel}>Stems Practiced</Text>
            <Text style={styles.statValue}>12/12</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: '100%', backgroundColor: '#10B981' }]} />
          </View>
        </View>
      </View>
    </ModernDashboardCard>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  liveText: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  scoreContainer: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  ringBg: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 6,
    borderColor: 'rgba(56, 189, 248, 0.1)',
  },
  scoreNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: '#38BDF8',
  },
  scoreLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 2,
    letterSpacing: 1,
  },
  statsContainer: {
    flex: 1,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F1F5F9',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38BDF8',
    borderRadius: 3,
  },
});
