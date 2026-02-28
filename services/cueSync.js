/**
 * Cue Sync — bridges song sections to ProPresenter / lyric software
 *
 * The Bridge server (port 7070) receives these JSON messages and translates them:
 *   CUE_CHANGE   → ProPresenter 7 OSC: /presentation/slide/{sectionIndex}
 *   SONG_LOADED  → broadcast the full section list so lyric software can pre-load
 *
 * Enable per song via song.cueSync.enabled toggle in Song Detail.
 * Configure the bridge host in Settings → Sync or Bridge Setup screen.
 */

import { sendBridge, getBridgeUrl } from './bridgeClient';
import { getSettings } from '../data/storage';

/**
 * Fire when the user or playhead lands on a new section.
 * Reads the target software from settings so the bridge knows which protocol to use.
 */
export async function sendCue({ songTitle, sectionName, sectionIndex, totalSections }) {
  const settings = await getSettings().catch(() => ({}));
  const pp = settings.proPresenter || {};
  return sendBridge({
    type: 'CUE_CHANGE',
    songTitle,
    sectionName,
    sectionIndex,
    totalSections,
    // Bridge uses these to pick the right protocol
    software:    pp.software    || 'propresenter7',
    target:      pp.target      || '',
    oscPath:     pp.oscPath     || '',   // custom OSC path override
    midiChannel: pp.midiChannel || 1,
    timestamp: Date.now(),
  });
}

/**
 * Fire when a song loads so lyric software can pre-index all slides.
 */
export async function sendSongLoaded({ songTitle, sections = [] }) {
  const settings = await getSettings().catch(() => ({}));
  const pp = settings.proPresenter || {};
  return sendBridge({
    type: 'SONG_LOADED',
    songTitle,
    totalSections: sections.length,
    sections: sections.map((s, i) => ({
      index: i,
      name: s.name || s.label || `Section ${i + 1}`,
    })),
    software:    pp.software || 'propresenter7',
    target:      pp.target   || '',
    timestamp: Date.now(),
  });
}

/** True when the bridge WebSocket is open and ready. */
export function isBridgeReady() {
  return !!getBridgeUrl();
}
