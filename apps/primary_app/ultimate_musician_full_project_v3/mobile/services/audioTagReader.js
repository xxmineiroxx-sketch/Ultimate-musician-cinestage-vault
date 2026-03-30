/**
 * Offline Audio Tag Reader
 * Reads ID3 metadata tags from a local audio file using jsmediatags (pure JS).
 * Works without internet — reads title, artist, BPM, key, time signature.
 * Never throws; returns partial results if tags are missing or file is unreadable.
 */

import * as FileSystem from "expo-file-system/legacy";

// Load jsmediatags browser bundle (avoids Node.js-specific require shims)
let jsmediatags = null;
try {
  jsmediatags = require("jsmediatags/build/jsmediatags.min.js");
} catch {
  try {
    jsmediatags = require("jsmediatags");
  } catch {
    // Library not installed — all calls will return empty results
  }
}

function base64ToBytes(base64) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < lookup.length; i++) lookup[i] = 255;
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  let bufferLength = base64.length * 0.75;
  if (base64.endsWith("==")) bufferLength -= 2;
  else if (base64.endsWith("=")) bufferLength -= 1;

  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)];
    const encoded2 = lookup[base64.charCodeAt(i + 1)];
    const encoded3 = lookup[base64.charCodeAt(i + 2)];
    const encoded4 = lookup[base64.charCodeAt(i + 3)];
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (base64[i + 2] !== "=")
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    if (base64[i + 3] !== "=") bytes[p++] = ((encoded3 & 3) << 6) | encoded4;
  }
  return bytes;
}

/**
 * Analyze a local audio file and extract metadata tags.
 * @param {string} localUri - file:// URI from expo-document-picker or expo-file-system
 * @returns {Promise<{ title, artist, album, bpm, key, timeSig, year, genre }>}
 *   All fields are strings/numbers or null if not present in the file tags.
 */
export async function analyzeAudioFile(localUri) {
  const result = {
    title: null,
    artist: null,
    album: null,
    bpm: null,
    key: null,
    timeSig: null,
    year: null,
    genre: null,
  };

  if (!jsmediatags || !localUri) return result;

  try {
    // Read first 256KB — enough for any ID3v2 header (tags are at file start)
    const b64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 262144, // 256 KB
      position: 0,
    });

    // Decode base64 → Uint8Array → ArrayBuffer (no atob dependency)
    const bytes = base64ToBytes(b64);
    const arrayBuffer = bytes.buffer;

    // Parse ID3 tags
    const tags = await new Promise((resolve, reject) => {
      jsmediatags.read(new Blob([arrayBuffer]), {
        onSuccess: (tag) => resolve(tag?.tags || {}),
        onError: (err) => reject(err),
      });
    });

    // Standard text tags
    if (tags.title) result.title = String(tags.title).trim() || null;
    if (tags.artist) result.artist = String(tags.artist).trim() || null;
    if (tags.album) result.album = String(tags.album).trim() || null;
    if (tags.year) result.year = String(tags.year).trim() || null;
    if (tags.genre) result.genre = String(tags.genre).trim() || null;

    // BPM — TBPM frame (e.g. "120" or "120.0")
    const bpmRaw = tags.TBPM?.data ?? tags.bpm ?? tags["TBPM"];
    if (bpmRaw != null) {
      const n = Math.round(parseFloat(String(bpmRaw)));
      if (!isNaN(n) && n > 20 && n < 400) result.bpm = n;
    }

    // Key — TKEY frame (e.g. "Am", "F#", "Bb")
    const keyRaw = tags.TKEY?.data ?? tags.key ?? tags["TKEY"];
    if (keyRaw) result.key = String(keyRaw).trim() || null;

    // Time signature — rarely in ID3 but check TSIG or custom TXXX frames
    const tsigRaw = tags.TSIG?.data;
    if (tsigRaw && /^\d+\/\d+/.test(String(tsigRaw))) {
      result.timeSig = String(tsigRaw).trim();
    } else if (Array.isArray(tags.TXXX)) {
      const tsSig = tags.TXXX.find(
        (t) =>
          t.description?.toLowerCase().includes("time") &&
          /^\d+\/\d+/.test(t.value || ""),
      );
      if (tsSig) result.timeSig = tsSig.value;
    }
  } catch {
    // Return whatever we managed to collect
  }

  return result;
}
