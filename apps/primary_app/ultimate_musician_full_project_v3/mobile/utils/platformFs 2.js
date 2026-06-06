/**
 * platformFs.js
 * Platform-aware filesystem + document picker shims.
 * On web/desktop: uses browser APIs (fetch + Blob, <input type="file">).
 * On native (iOS/Android): uses expo-file-system and expo-document-picker.
 */
import { Platform } from 'react-native';

// ── Native lazy imports ───────────────────────────────────────────────────────
let _FileSystem = null;
let _DocumentPicker = null;

if (Platform.OS !== 'web') {
  try { _FileSystem = require('expo-file-system/legacy'); } catch {}
  try { _DocumentPicker = require('expo-document-picker'); } catch {}
}

export const FileSystem = _FileSystem;
export const DocumentPicker = _DocumentPicker;

// ── Web-compatible file picker ────────────────────────────────────────────────
/**
 * Pick a file on web using a hidden <input type="file"> element.
 * Returns { uri: string (blob URL), name: string, size: number, mimeType: string }
 * or null if cancelled.
 */
export async function pickFileWeb(accept = 'audio/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = (e) => {
      const file = e.target.files?.[0];
      document.body.removeChild(input);
      if (!file) { resolve(null); return; }
      const uri = URL.createObjectURL(file);
      resolve({ uri, name: file.name, size: file.size, mimeType: file.type });
    };

    input.oncancel = () => { document.body.removeChild(input); resolve(null); };
    input.click();
  });
}

/**
 * Cross-platform document picker.
 * On native: uses expo-document-picker.
 * On web: uses hidden <input type="file">.
 */
export async function pickDocument(options = {}) {
  if (Platform.OS !== 'web' && _DocumentPicker) {
    return _DocumentPicker.getDocumentAsync(options);
  }
  const accept = options.type?.join(',') || '*/*';
  return pickFileWeb(accept);
}

/**
 * Download a file from URL and return its blob URL (web only).
 * On native, returns the original URL (FileSystem.downloadAsync should be used instead).
 */
export async function downloadFileWeb(url, filename) {
  if (Platform.OS !== 'web') return url;
  const resp = await fetch(url);
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  // Auto-trigger download
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return blobUrl;
}

/**
 * Get info about a file. On web, returns minimal info.
 * On native: delegates to FileSystem.getInfoAsync.
 */
export async function getFileInfo(uri) {
  if (Platform.OS !== 'web' && _FileSystem) {
    return _FileSystem.getInfoAsync(uri);
  }
  // On web, blob URLs always "exist" if we created them
  return { exists: uri?.startsWith('blob:') || false, uri, size: 0 };
}

/**
 * Read a file as base64. On native uses FileSystem; on web uses FileReader.
 */
export async function readFileAsBase64(uri) {
  if (Platform.OS !== 'web' && _FileSystem) {
    return _FileSystem.readAsStringAsync(uri, { encoding: _FileSystem.EncodingType.Base64 });
  }
  const resp = await fetch(uri);
  const buffer = await resp.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
