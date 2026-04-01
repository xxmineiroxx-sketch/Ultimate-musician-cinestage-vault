
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView } from 'react-native';
import * as audioEngine from '../audioEngine';
import WaveformTimeline from '../components/WaveformTimeline';

export default function LiveScreen({ route }) {
  const { song, mixerState } = route.params;
  const analysis = song.analysis || song.latestStemsJob?.result || song.latest_stems_job?.result || {};
  const sections = analysis.sections || [];
  const lengthSeconds = analysis.lengthSeconds || 0;
  const chart = song.chart || analysis.chart || null;
  const lyricsFallback = song.lyricsText || '';

  const [playing, setPlaying] = useState(false);
  const [clickOn, setClickOn] = useState(true);
  const [guideOn, setGuideOn] = useState(true);
  const [padOn, setPadOn] = useState(true);
  const [currentSection, setCurrentSection] = useState(
    sections.length ? sections[0].label : 'INTRO'
  );

  const handleTogglePlay = async () => {
    const next = !playing;
    setPlaying(next);
    if (next) {
      await audioEngine.play();
    } else {
      await audioEngine.pause();
    }
  };

  const handleJumpSection = async (section) => {
    setCurrentSection(section.label);
    await audioEngine.seek(section.positionSeconds);
  };

  const handleToggleClick = async (value) => {
    setClickOn(value);
    await audioEngine.setClickEnabled(value);
  };

  const handleToggleGuide = async (value) => {
    setGuideOn(value);
    await audioEngine.setGuideEnabled(value);
  };

  const handleTogglePad = async (value) => {
    setPadOn(value);
    await audioEngine.setPadEnabled(value);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{song.title}</Text>
      <Text style={styles.subtitle}>
        {song.artist || ''} {song.bpm ? `• ${song.bpm} BPM` : ''}{' '}
        {song.key ? `• Key ${song.key}` : ''}
      </Text>

      {/* ONE global waveform-style timeline */}
      <WaveformTimeline
        sections={sections}
        lengthSeconds={lengthSeconds}
        currentSection={currentSection}
      />

      <View style={styles.playRow}>
        <TouchableOpacity style={styles.playButton} onPress={handleTogglePlay}>
          <Text style={styles.playSymbol}>{playing ? '⏸' : '▶️'}</Text>
        </TouchableOpacity>
        <View style={styles.timeBox}>
          <Text style={styles.timeText}>0:00 / {Math.round(lengthSeconds)}s</Text>
          <Text style={styles.timeHint}>
            Global timeline only – stems are controlled via mixer and track toggles.
          </Text>
        </View>
      </View>

      <View style={styles.sectionsRow}>
        {sections.map((s) => (
          <TouchableOpacity
            key={s.label + s.positionSeconds}
            onPress={() => handleJumpSection(s)}
            style={[
              styles.sectionPill,
              currentSection === s.label && styles.sectionPillActive,
            ]}
          >
            <Text
              style={[
                styles.sectionPillText,
                currentSection === s.label && styles.sectionPillTextActive,
              ]}
            >
              {s.label.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleItem}>
          <Text style={styles.toggleLabel}>Click</Text>
          <Switch value={clickOn} onValueChange={handleToggleClick} />
        </View>
        <View style={styles.toggleItem}>
          <Text style={styles.toggleLabel}>Guide</Text>
          <Switch value={guideOn} onValueChange={handleToggleGuide} />
        </View>
        <View style={styles.toggleItem}>
          <Text style={styles.toggleLabel}>Pad</Text>
          <Switch value={padOn} onValueChange={handleTogglePad} />
        </View>
      </View>

      <View style={styles.tracksBox}>
        <Text style={styles.tracksTitle}>Tracks</Text>
        <View style={styles.tracksRow}>
          {mixerState.map((t) => (
            <View key={t.id} style={styles.trackStrip}>
              <Text style={styles.trackName} numberOfLines={1}>{t.name}</Text>
              <View style={styles.trackBadgeRow}>
                {t.solo && <Text style={styles.trackBadge}>S</Text>}
                {t.mute && <Text style={styles.trackBadgeMute}>M</Text>}
              </View>
              <Text style={styles.trackVol}>{Math.round(t.volume * 100)}%</Text>
            </View>
          ))}
        </View>
      </View>

      {(chart || lyricsFallback) && (
        <View style={styles.chartBox}>
          <Text style={styles.tracksTitle}>Chord Chart</Text>
          {chart.chord_chart_text ? (
            <Text style={styles.chartText}>{chart.chord_chart_text}</Text>
          ) : (
            <Text style={styles.chartHint}>No chords available.</Text>
          )}
          {chart.lyrics_text || lyricsFallback ? (
            <>
              <Text style={[styles.tracksTitle, { marginTop: 8 }]}>Lyrics</Text>
              <Text style={styles.chartText}>{chart.lyrics_text || lyricsFallback}</Text>
            </>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#020617',
  },
  title: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  playRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  playSymbol: {
    fontSize: 28,
  },
  timeBox: {
    flex: 1,
  },
  timeText: {
    color: '#E5E7EB',
    fontSize: 14,
  },
  timeHint: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  sectionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  sectionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    marginRight: 8,
    marginBottom: 8,
  },
  sectionPillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  sectionPillText: {
    color: '#E5E7EB',
    fontSize: 12,
  },
  sectionPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleLabel: {
    color: '#E5E7EB',
    marginRight: 6,
  },
  tracksBox: {
    marginTop: 24,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#111827',
  },
  tracksTitle: {
    color: '#E5E7EB',
    fontWeight: '600',
    marginBottom: 8,
  },
  tracksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  trackStrip: {
    width: 80,
    marginRight: 8,
    marginBottom: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#111827',
  },
  trackName: {
    color: '#E5E7EB',
    fontSize: 11,
  },
  trackBadgeRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  trackBadge: {
    backgroundColor: '#4F46E5',
    color: '#FFFFFF',
    fontSize: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
  },
  trackBadgeMute: {
    backgroundColor: '#991B1B',
    color: '#FFFFFF',
    fontSize: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  trackVol: {
    marginTop: 4,
    color: '#9CA3AF',
    fontSize: 11,
  },
  chartBox: {
    marginTop: 24,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#111827',
  },
  chartText: {
    color: '#E5E7EB',
    fontSize: 13,
  },
  chartHint: {
    color: '#6B7280',
    fontSize: 12,
  },
});
