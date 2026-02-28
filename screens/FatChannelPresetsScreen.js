import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import presetIndex from '../assets/fat-channel-presets/index.json';
import { getPresetInstallStatus, installPresetsFromBundle, presetInstallDir } from '../services/fatChannelPresets';
import { useTheme } from '../context/ThemeContext';

export default function FatChannelPresetsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [installState, setInstallState] = useState({ installed: false, manifest: null, error: null });
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState(null);

  React.useEffect(() => {
    refreshStatus();
  }, []);

  const refreshStatus = async () => {
    try {
      const status = await getPresetInstallStatus();
      setInstallState(status);
    } catch (error) {
      setInstallState({ installed: false, manifest: null, error });
    }
  };

  const handleInstall = async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      const manifest = await installPresetsFromBundle();
      setInstallState({ installed: true, manifest });
    } catch (error) {
      setInstallError(error);
    } finally {
      setInstalling(false);
    }
  };

  const sections = useMemo(() => {
    const entries = Object.entries(presetIndex.categories || {});
    return entries.map(([category, presets]) => ({
      category,
      presets,
    }));
  }, []);

  const totalCount = presetIndex.totalCount || 0;
  const totalBytes = presetIndex.totalBytes || 0;
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
  const installedCount = installState?.manifest?.filesWritten || 0;
  const installedAt = installState?.manifest?.installedAt;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Fat Channel Presets</Text>
      <Text style={styles.subtitle}>
        StudioLive preset library loaded from bundled .channel files.
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{totalCount} presets</Text>
        <Text style={styles.metaText}>{totalMb} MB</Text>
        <Text style={styles.metaText}>{presetIndex.zipFile || 'Library'}</Text>
      </View>
      <View style={styles.installCard}>
        <Text style={styles.cardTitle}>Install Presets on Device</Text>
        <Text style={styles.subtitle}>
          Unzips the bundled library so presets are available offline for quick browsing and linking.
        </Text>
        <Text style={styles.metaText}>Install dir: {presetInstallDir}</Text>
        <View style={styles.installRow}>
          <TouchableOpacity style={styles.installButton} onPress={handleInstall} disabled={installing}>
            {installing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.installButtonText}>
                {installState.installed ? 'Reinstall Presets' : 'Install Presets'}
              </Text>
            )}
          </TouchableOpacity>
          {installState.installed ? (
            <Text style={styles.installStatus}>
              Installed {installedCount} files{installedAt ? ` • ${new Date(installedAt).toLocaleString()}` : ''}
            </Text>
          ) : (
            <Text style={styles.installStatus}>Not installed yet.</Text>
          )}
        </View>
        {installError ? (
          <Text style={styles.errorText}>Install error: {String(installError.message || installError)}</Text>
        ) : null}
      </View>
      {sections.map((section) => (
        <View key={section.category} style={styles.card}>
          <Text style={styles.cardTitle}>
            {section.category} <Text style={styles.cardMeta}>({section.presets.length})</Text>
          </Text>
          {section.presets.map((preset) => (
            <View key={`${section.category}-${preset.path}`} style={styles.itemRow}>
              <Text style={styles.itemText}>
                • {preset.subCategory ? `${preset.subCategory} — ` : ''}{preset.name}
              </Text>
              <Text style={styles.itemMeta}>{Math.max(1, Math.round(preset.sizeBytes / 1024))} KB</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  subtitle: { color: colors.subtle, fontSize: 12, marginTop: 8 },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 16, flexWrap: 'wrap' },
  metaText: { color: colors.subtle, fontSize: 11, fontWeight: '700' },
  card: { marginBottom: 12, padding: 14, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.text, fontWeight: '900', marginBottom: 8 },
  cardMeta: { color: colors.subtle, fontSize: 12 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  itemText: { color: colors.text, fontSize: 12, flex: 1 },
  itemMeta: { color: colors.subtle, fontSize: 11 },
  installCard: {
    marginBottom: 12,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.pillActive,
  },
  installRow: { marginTop: 12 },
  installButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.pillActive,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  installButtonText: { color: '#FFFFFF', fontWeight: '700' },
  installStatus: { color: colors.subtle, fontSize: 11, marginTop: 10 },
  errorText: { color: '#FCA5A5', fontSize: 11, marginTop: 8 },
});
