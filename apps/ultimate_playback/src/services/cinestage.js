/**
 * Legacy compatibility wrapper for older playback screens.
 *
 * The canonical CineStage client lives in `src/api/cinestage.js`. Keep this file
 * as a thin adapter so older screens stop bypassing the unified CineStage backend.
 */

import { CineStageAPI } from '../api/cinestage';

function resolveSourceUrl(payload = {}) {
  return (
    payload?.sourceUrl
    || payload?.audioUrl
    || payload?.audio_url
    || payload?.file_url
    || payload?.fileUrl
    || ''
  );
}

export const bootstrapBrain = async (force = false) =>
  CineStageAPI.bootstrapBrain(force);

export const analyzeAudio = async (payload = {}) => {
  const sourceUrl = resolveSourceUrl(payload);

  if (!sourceUrl) {
    throw new Error('CineStage audio analysis requires a source URL.');
  }

  const result = await CineStageAPI.analyzeWaveform({
    ...payload,
    sourceUrl,
    audioUrl: sourceUrl,
    audio_url: sourceUrl,
    file_url: sourceUrl,
    fileUrl: sourceUrl,
  });

  return {
    ...result,
    title: result?.title || payload?.title || 'Untitled Song',
    metadata: result?.metadata || {},
  };
};

export default {
  bootstrapBrain,
  analyzeAudio,
};
