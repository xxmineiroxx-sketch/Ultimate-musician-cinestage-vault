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
  // Existing cache file must be at least 100KB — anything smaller is almost
  // certainly an old 404 HTML page (~20KB) from a prior cache-poisoning bug.
  if (existing?.exists && Number(existing.size || 0) >= 100 * 1024) {
    return targetUri;
  }
  if (existing?.exists) {
    await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => {});
  }

  const download = await FileSystem.downloadAsync(url, targetUri).catch((err) => {
    console.log('[Loader] FileSystem.downloadAsync failed for', url, ':', err?.message || err);
    return null;
  });
  if (!download?.uri) return null;

  // Reject non-2xx — the worker returns 404 HTML for dead paths but downloadAsync
  // happily saves the body anyway. Without this guard, AVPlayer hangs trying to
  // decode HTML as m4a.
  const status = Number(download.status || 0);
  if (status && (status < 200 || status >= 300)) {
    console.log('[Loader] download status', status, 'for', url, '- discarding');
    await FileSystem.deleteAsync(download.uri, { idempotent: true }).catch(() => {});
    return null;
  }

  // Reject non-audio MIME types (HTML 404 pages, JSON errors).
  const mime = String(download.headers?.['content-type'] || download.mimeType || '').toLowerCase();
  if (mime && !mime.startsWith('audio/') && !mime.startsWith('video/') && !mime.includes('octet-stream')) {
    console.log('[Loader] download mime', mime, 'is not audio for', url, '- discarding');
    await FileSystem.deleteAsync(download.uri, { idempotent: true }).catch(() => {});
    return null;
  }

  const post = await FileSystem.getInfoAsync(download.uri).catch(() => null);
  if (!post?.exists || Number(post.size || 0) < 1024) {
    console.log('[Loader] cache file too small:', download.uri, 'size=', post?.size);
    await FileSystem.deleteAsync(download.uri, { idempotent: true }).catch(() => {});
    return null;
  }
  console.log('[Loader] cached', url, '→', download.uri, 'size=', post.size);
  return download.uri;
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
    // Detach the cleanup — awaiting unloadAsync while loadAsync is still in-flight
    // can hang indefinitely on iOS (expo-av AVPlayer locking).
    sound.unloadAsync?.().catch(() => {});
    throw err;
  }
}

export async function loadSound(url) {
  if (!url || /youtube\.com|youtu\.be/i.test(url)) return null;

  // For remote URLs, download to local file FIRST then load. The CineStage worker
  // serving /storage/* doesn't honor HTTP Range or set Content-Length, which causes
  // AVPlayer (expo-av's iOS backend) to stall during streamed loads. Loading from a
  // local file:// URI sidesteps the streaming path entirely.
  if (looksLikeRemoteAudioUrl(url)) {
    const cachedUri = await cacheRemoteAudioUrl(url);
    if (cachedUri) {
      try {
        return await loadSoundFromUri(cachedUri, 15000);
      } catch (err) {
        console.log('[Loader] local file load failed:', cachedUri, err?.message || err);
      }
    }
    // Last-ditch fallback: try direct stream (may stall, but timeout is bounded).
    try {
      return await loadSoundFromUri(url, 20000);
    } catch {
      return null;
    }
  }

  // Local URI (file://, asset://) — load directly.
  try {
    return await loadSoundFromUri(url, 15000);
  } catch {
    return null;
  }
}
