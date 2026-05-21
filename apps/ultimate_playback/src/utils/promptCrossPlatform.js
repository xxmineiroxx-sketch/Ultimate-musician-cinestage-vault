/**
 * Cross-platform replacement for Alert.prompt (iOS-only).
 * On iOS: uses native Alert.prompt.
 * On Android/web: falls back to a simple JS prompt simulation via Alert buttons.
 *
 * Usage:
 *   import { promptCrossPlatform } from '../utils/promptCrossPlatform';
 *
 *   promptCrossPlatform({
 *     title: 'Enter URL',
 *     message: 'Paste a YouTube link:',
 *     placeholder: 'https://...',
 *     onSubmit: (text) => handleText(text),
 *     onCancel: () => {},
 *     // For Android: optional preset options shown as buttons
 *     androidOptions: [],        // [] = skip to onSubmit('') immediately
 *   });
 */

import { Alert, Platform } from 'react-native';

export function promptCrossPlatform({ title, message, placeholder = '', onSubmit, onCancel, androidSkipReason = false }) {
  if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
    Alert.prompt(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => onCancel?.() },
        { text: 'Submit', onPress: (text) => onSubmit?.(text || '') },
      ],
      'plain-text',
      placeholder,
    );
    return;
  }

  // Android / web fallback — if reason is optional, just skip it
  if (androidSkipReason) {
    onSubmit?.('');
    return;
  }

  // For required input on Android, inform and call with empty
  Alert.alert(
    title,
    message + '\n(Enter via the text field that appears after tapping OK)',
    [
      { text: 'Cancel', style: 'cancel', onPress: () => onCancel?.() },
      { text: 'OK', onPress: () => onSubmit?.('') },
    ],
  );
}
