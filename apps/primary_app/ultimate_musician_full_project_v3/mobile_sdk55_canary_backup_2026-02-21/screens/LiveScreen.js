
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Alert } from 'react-native';
import * as audioEngine from '../audioEngine';
import WaveformTimeline from '../components/WaveformTimeline';
import DeviceStatusBar from '../components/DeviceStatusBar';
import * as cinestageAPI from '../api/cinestageAPI';
import { findSongPresetByTitle, songHasDeviceSetups } from '../utils/sharedPresetStorage';

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
  const [songPreset, setSongPreset] = useState(null);
  const [presetsReady, setPresetsReady] = useState(false);
  const [triggeringPreset, setTriggeringPreset] = useState(false);

  useEffect(() => {
    loadSongPreset();
  }, [song.title]);

  const loadSongPreset = async () => {
    try {
      const preset = await findSongPresetByTitle(song.title);
      if (preset && songHasDeviceSetups(preset)) {
        setSongPreset(preset);
      }
    } catch (error) {
      console.error('Error loading song preset:', error);
    }
  };

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

    // Trigger preset if available
    if (songPreset && presetsReady && !triggeringPreset) {
      triggerPresetForSection(section.label);
    }
  };

  const triggerPresetForSection = async (sectionLabel) => {
    setTriggeringPreset(true);
    try {
      const result = await cinestageAPI.triggerPreset(songPreset, sectionLabel);

      if (result.status === 'success' || result.status === 'partial_success') {
        // Success - optionally show subtle feedback
        console.log('Preset triggered:', result.triggered_devices);
      } else {
        // Show error only if it's a critical failure
        if (result.errors && result.errors.length > 0) {
          Alert.alert(
            'Preset Trigger Warning',
            `Some devices failed:\n${result.errors.map(e => `• ${e.device}: ${e.error}`).join('\n')}`,
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.error('Error triggering preset:', error);
      // Don't show alert for network errors - just log
    } finally {
      setTriggeringPreset(false);
    }
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

  const getSectionPresetInfo = (sectionLabel) => {
    if (!songPreset || !songPreset.section_mappings) return null;

    const mapping = songPreset.section_mappings[sectionLabel];
    if (!mapping) return null;

    const deviceOverrides = mapping.device_overrides;
    if (!deviceOverrides) return null;

    // Get first mapped device for display
    for (const [role, devices] of Object.entries(deviceOverrides)) {
      for (const [deviceType, presetIndex] of Object.entries(devices)) {
        const deviceSetup = songPreset.device_setups?.[role]?.[deviceType];
        if (!deviceSetup) continue;

        let presets = [];
        if (deviceType === 'nord_stage_4') {
          presets = deviceSetup.programs || [];
        } else if (deviceType === 'modx') {
          presets = deviceSetup.performances || [];
        }

        if (presets[presetIndex]) {
          const preset = presets[presetIndex];
          return {
            name: preset.name || `#${preset.program_number || preset.performance_number}`,
            deviceType,
          };
        }
      }
    }

    return null;
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{song.title}</Text>
      <Text style={styles.subtitle}>
        {song.artist || ''} {song.bpm ? `• ${song.bpm} BPM` : ''}{' '}
        {song.key ? `• Key ${song.key}` : ''}
      </Text>

      {/* Device Status & Preset Indicator */}
      <DeviceStatusBar
        songPreset={songPreset}
        onPresetsReady={setPresetsReady}
      />

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
        {sections.map((s) => {
          const presetInfo = getSectionPresetInfo(s.label);
          return (
            <TouchableOpacity
              key={s.label + s.positionSeconds}
              onPress={() => handleJumpSection(s)}
              style={[
                styles.sectionPill,
                currentSection === s.label && styles.sectionPillActive,
                triggeringPreset && styles.sectionPillTriggering,
                presetInfo && styles.sectionPillMapped,
              ]}
              disabled={triggeringPreset}
            >
              <View style={styles.sectionPillContent}>
                <Text
                  style={[
                    styles.sectionPillText,
                    currentSection === s.label && styles.sectionPillTextActive,
                  ]}
                >
                  {s.label.replace('_', ' ')}
                </Text>
                {presetsReady && currentSection === s.label && (
                  <Text style={styles.presetIndicator}>🎹</Text>
                )}
              </View>
              {presetInfo && (
                <Text style={styles.presetMappingText}>
                  {presetInfo.name}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
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
  sectionPillMapped: {
    borderColor: '#10B981',
    backgroundColor: '#064E3B',
  },
  sectionPillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  sectionPillContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionPillText: {
    color: '#E5E7EB',
    fontSize: 12,
  },
  sectionPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sectionPillTriggering: {
    opacity: 0.6,
  },
  presetIndicator: {
    fontSize: 10,
    marginLeft: 4,
  },
  presetMappingText: {
    color: '#D1FAE5',
    fontSize: 9,
    marginTop: 2,
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
