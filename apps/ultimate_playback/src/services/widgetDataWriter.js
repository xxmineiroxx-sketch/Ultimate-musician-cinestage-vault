/**
 * widgetDataWriter.js — Writes verse + service + role data to the
 * App Groups shared container so the iOS Home Screen Widget can read it.
 *
 * The native WidgetDataModule (native/RN/WidgetDataModule.swift) exposes
 * writeWidgetData(json: string) which writes to the shared group container.
 * Safe to import in Expo Go — no-ops if native module not present.
 */

import { NativeModules, Platform } from 'react-native';

const { WidgetDataModule } = NativeModules;

const APP_GROUP_ID = 'group.com.ultimatemusician.playback';

function writeIfAvailable(data) {
  if (Platform.OS !== 'ios' || !WidgetDataModule) return;
  WidgetDataModule.writeWidgetData(JSON.stringify(data)).catch(() => {});
}

/**
 * Call this from HomeScreen whenever verse / services / role change.
 * The Widget reads this file via FileManager(url: appGroupContainer).
 */
export function updateWidgetData({
  verse       = null,   // { text, ref, theme }
  nextService = null,   // { name, date, time }
  role        = '',
  assignmentStatus = 'pending',
}) {
  writeIfAvailable({
    verse,
    nextService,
    role,
    assignmentStatus,
    updatedAt: new Date().toISOString(),
  });
}
