import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
let unzipSync = null;
try {
  // fflate is optional in this build; load dynamically to avoid hard crash if missing.
  // eslint-disable-next-line global-require
  ({ unzipSync } = require('fflate'));
} catch (error) {
  unzipSync = null;
}
import presetIndex from '../assets/fat-channel-presets/index.json';

const INSTALL_DIR = `${FileSystem.documentDirectory}fat-channel-presets/`;
const MANIFEST_PATH = `${INSTALL_DIR}manifest.json`;

function base64ToBytes(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i += 1) lookup[chars.charCodeAt(i)] = i;

  let bufferLength = base64.length * 0.75;
  if (base64.endsWith('==')) bufferLength -= 2;
  else if (base64.endsWith('=')) bufferLength -= 1;

  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)];
    const encoded2 = lookup[base64.charCodeAt(i + 1)];
    const encoded3 = lookup[base64.charCodeAt(i + 2)];
    const encoded4 = lookup[base64.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (base64[i + 2] !== '=') bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    if (base64[i + 3] !== '=') bytes[p++] = ((encoded3 & 3) << 6) | encoded4;
  }

  return bytes;
}

function bytesToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const byte1 = bytes[i++];
    const byte2 = i < bytes.length ? bytes[i++] : NaN;
    const byte3 = i < bytes.length ? bytes[i++] : NaN;

    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 3) << 4) | (byte2 >> 4);
    let enc3 = ((byte2 & 15) << 2) | (byte3 >> 6);
    let enc4 = byte3 & 63;

    if (Number.isNaN(byte2)) {
      enc3 = 64;
      enc4 = 64;
    } else if (Number.isNaN(byte3)) {
      enc4 = 64;
    }

    result += chars.charAt(enc1);
    result += chars.charAt(enc2);
    result += enc3 === 64 ? '=' : chars.charAt(enc3);
    result += enc4 === 64 ? '=' : chars.charAt(enc4);
  }

  return result;
}

function normalizeEntryPath(entryPath) {
  let path = entryPath.replace(/^Fat Channel Presets\//, '');
  if (!path) return null;
  if (path.includes('__MACOSX')) return null;
  if (path.endsWith('.DS_Store')) return null;
  if (path.endsWith('/')) return null;
  return path;
}

export async function getPresetInstallStatus() {
  const info = await FileSystem.getInfoAsync(MANIFEST_PATH);
  if (!info.exists) {
    return { installed: false, manifest: null };
  }
  try {
    const data = await FileSystem.readAsStringAsync(MANIFEST_PATH);
    return { installed: true, manifest: JSON.parse(data) };
  } catch (error) {
    return { installed: true, manifest: null, error };
  }
}

export async function installPresetsFromBundle() {
  if (!unzipSync) {
    return {
      installedAt: new Date().toISOString(),
      totalCount: 0,
      totalBytes: 0,
      zipFile: presetIndex.zipFile || 'Fat_Channel_Presets.zip',
      filesWritten: 0,
      error: 'fflate_not_available',
    };
  }
  const asset = Asset.fromModule(
    require('../assets/fat-channel-presets/Fat_Channel_Presets.zip')
  );
  await asset.downloadAsync();

  const zipUri = asset.localUri || asset.uri;
  const base64Zip = await FileSystem.readAsStringAsync(zipUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const zipBytes = base64ToBytes(base64Zip);
  const entries = unzipSync(zipBytes);

  await FileSystem.makeDirectoryAsync(INSTALL_DIR, { intermediates: true });

  const written = [];
  for (const [entryPath, data] of Object.entries(entries)) {
    const normalized = normalizeEntryPath(entryPath);
    if (!normalized) continue;

    const outputPath = `${INSTALL_DIR}${normalized}`;
    const dirPath = outputPath.substring(0, outputPath.lastIndexOf('/'));
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });

    const fileBase64 = bytesToBase64(data);
    await FileSystem.writeAsStringAsync(outputPath, fileBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    written.push(normalized);
  }

  const manifest = {
    installedAt: new Date().toISOString(),
    totalCount: presetIndex.totalCount || written.length,
    totalBytes: presetIndex.totalBytes || 0,
    zipFile: presetIndex.zipFile || 'Fat_Channel_Presets.zip',
    filesWritten: written.length,
  };

  await FileSystem.writeAsStringAsync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  return manifest;
}

export const presetInstallDir = INSTALL_DIR;
