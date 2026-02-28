/**
 * Cue Mapper v1
 * Helps producers quickly auto-assign cues.
 * Strategy:
 * - assign lyricsCue incrementally by marker order
 * - allow per-type offsets (future)
 */

import { sortMarkers } from '../songMap/model';

export function autoAssignLyricsCues(markers, startAt = 1, step = 1) {
  const sorted = sortMarkers(markers || []);
  let cue = startAt;
  return sorted.map(m => ({ ...m, lyricsCue: m.lyricsCue ?? cue++ * step }));
}

export function autoAssignLightingCues(markers, startAt = 1, step = 1) {
  const sorted = sortMarkers(markers || []);
  let cue = startAt;
  return sorted.map(m => ({ ...m, lightingCue: m.lightingCue ?? cue++ * step }));
}
