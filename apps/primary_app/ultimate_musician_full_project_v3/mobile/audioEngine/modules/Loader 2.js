import { Platform } from 'react-native';

let Audio = null;
let FileSystem = null;
if (Platform.OS !== 'web') {
  try { Audio = require('expo-av').Audio; } catch {}
  try { FileSystem = require('expo-file-system/legacy'); } catch {}
}

const AUDIO_CACHE_DIR = FileSystem?.cacheDirectory
  ? `${FileSystem.cacheDirectory}um_audio_cache/`
  : null;

function looksLikeRemoteAudioUrl(url) {
  return /^https?:\/\//i.test(String(url || "").trim());
}

function fileExtensionFromUrl(url) {
  try {
    const pathname = new URL(String(url || "")).pathname || "";
    const match = pathname.match(/(\.[a-z0-9]{2,5})$/i);
    return match ? match[1].toLowerCase() : ".audio";
  } catch {
    const match = String(url || "").match(/(\.[a-z0-9]{2,5})(?:[?#].*)?$/i);
    return match ? match[1].toLowerCase() : ".audio";
  }
}

function stableHash(value) {
  let hash = 2166136261;
  const input = String(value || "");
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function ensureAudioCacheDir() {
  if (!AUDIO_CACHE_DIR) return null;
  const info = await FileSystem.getInfoAsync(AUDIO_CACHE_DIR).catch(() => null);
  if (!info?.exists) {
    await FileSystem.makeDirectoryAsync(AUDIO_CACHE_DIR, {
      intermediates: true,
    }).catch(() => {});
  }
  return AUDIO_CACHE_DIR;
}

export async function cacheRemoteAudioUrl(url) {
  if (!looksLikeRemoteAudioUrl(url)) return null;
  const dir = await ensureAudioCacheDir();
  if (!dir) return null;

  const targetUri = `${dir}${stableHash(url)}${fileExtensionFromUrl(url)}`;
  const existing = await FileSystem.getInfoAsync(targetUri).catch(() => null);
  if (existing?.exists && Number(existing.size || 0) > 0) {
    return targetUri;
  }

  const download = await FileSystem.downloadAsync(url, targetUri).catch(() => null);
  return download?.uri || targetUri;
}

export async function loadSoundFromUri(uri, timeoutMs = 12000) {
  if (!Audio) return null;
  const sound = new Audio.Sound();
  try {
    await Promise.race([
      sound.loadAsync({ uri }, { shouldPlay: false, volume: 1.0 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("load timeout")), timeoutMs)),
    ]);
    return sound;
  } catch (err) {
    try { await sound.unloadAsync(); } catch {}
    throw err;
  }
}

export async function loadSound(url) {
  if (!url || /youtube\.com|youtu\.be/i.test(url)) return null;

  try {
    return await loadSoundFromUri(url, 12000);
  } catch (err) {
    if (!looksLikeRemoteAudioUrl(url)) return null;
    const cachedUri = await cacheRemoteAudioUrl(url);
    if (!cachedUri) return null;
    return await loadSoundFromUri(cachedUri, 12000);
  }
}
