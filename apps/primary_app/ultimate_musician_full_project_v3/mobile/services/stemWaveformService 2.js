/**
 * stemWaveformService.js
 * Fetches per-stem waveform peak arrays and feeds them to StemWaveformView.
 * Thin wrapper around stemSyncService's getStemPeaks with convenience helpers.
 */
import { getStemPeaks } from './stemSyncService';

/**
 * Extract stem URLs from a stem job result object.
 * Handles multiple result shapes (from legacy and new CineStage jobs).
 */
export function extractStemUrls(song) {
  const job = song?.latestStemsJob;
  const stems =
    job?.result?.stems ||
    job?.stems ||
    song?.stems ||
    null;

  if (!stems) return null;

  // Normalize: some jobs use { vocals, drums, bass, other }
  // others use { Vocals, Drums, Bass, Other } or { vocal, drum, bass, other }
  const normalized = {};
  const keyMap = {
    vocals: ['vocals', 'vocal', 'Vocals', 'Vocal'],
    drums: ['drums', 'drum', 'Drums', 'Drum', 'percussion'],
    bass: ['bass', 'Bass'],
    other: ['other', 'Other', 'guitar', 'Guitar', 'keys', 'Keys', 'strings'],
  };

  for (const [canonical, aliases] of Object.entries(keyMap)) {
    for (const alias of aliases) {
      if (stems[alias]) { normalized[canonical] = stems[alias]; break; }
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : stems;
}

/**
 * Get display-ready stem peaks for StemWaveformView.
 * Returns { vocals: [...peaks], drums: [...], bass: [...], other: [...] }
 * or null if not available.
 *
 * @param {string} songId
 * @param {object} song - full song object (for stem URL extraction)
 */
export async function getStemWaveformData(songId, song) {
  const stemUrls = extractStemUrls(song);
  return getStemPeaks(songId, stemUrls);
}

/**
 * Build the activeStems object from a track list (for StemWaveformView).
 * @param {Array} tracks - [{name, mute, solo, ...}, ...]
 * @returns {{ vocals: bool, drums: bool, bass: bool, other: bool }}
 */
export function buildActiveStems(tracks) {
  const active = {};
  const anySolo = tracks.some(t => t.solo);

  tracks.forEach(track => {
    const name = (track.name || track.id || '').toLowerCase();
    const stemKey = ['vocals', 'drums', 'bass', 'other'].find(k => name.includes(k) || name.startsWith(k[0])) || name;
    if (anySolo) {
      active[stemKey] = !!track.solo;
    } else {
      active[stemKey] = !track.mute;
    }
  });

  return active;
}
