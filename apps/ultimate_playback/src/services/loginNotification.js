import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { CINESTAGE_URL } from '../../config/syncConfig';

export function sendLoginNotification(email) {
  if (!email) return;
  const body = JSON.stringify({
    email,
    device_name: Device.deviceName || Device.modelName || 'Unknown Device',
    platform: Platform.OS,
    platform_version: String(Platform.Version),
    app_name: 'Ultimate Playback',
    app_version: '1.0.0',
  });
  fetch(`${CINESTAGE_URL}/api/auth/login-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {});
}
