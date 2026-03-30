export function buildSetlistWaveState(setlist, fallbackPipeline) {
  const songs = Array.isArray(setlist?.songs) ? setlist.songs : [];
  const fallbackSong = fallbackPipeline
    ? [
        {
          id: fallbackPipeline.songId || "armed_song",
          title: fallbackPipeline.songTitle || "Armed Song",
          bpm: Number(fallbackPipeline.bpm || 120),
          pipeline: fallbackPipeline,
        },
      ]
    : [];

  const queue = (songs.length > 0 ? songs : fallbackSong).map((song, idx) => ({
    id: song.id || `song_${idx + 1}`,
    title: song.title || `Song ${idx + 1}`,
    bpm: Number(song.bpm || 120),
    pipeline: song.pipeline || null,
    stemsResult:
      song.stemsResult ||
      song.latestStemsJob?.result ||
      song.pipeline?.latestStemsJob?.result ||
      null,
    apiBase: song.apiBase || song.pipeline?.apiBase || null,
    preloadStatus: idx === 0 ? "loaded" : "idle",
  }));

  return {
    queue,
    activeIndex: Math.max(0, Number(setlist?.activeIndex || 0)),
    preloadNext: setlist?.preloadNext !== false,
    autoPlayNext: Boolean(setlist?.autoPlayNext),
    transitionGapSec: Math.max(0, Number(setlist?.transitionGapSec || 0)),
  };
}

export function getActiveSong(state) {
  return state?.queue?.[state?.activeIndex || 0] || null;
}

export function getNextSong(state) {
  const nextIndex = Number(state?.activeIndex || 0) + 1;
  return state?.queue?.[nextIndex] || null;
}

export function markSongPreloaded(state, songId) {
  const queue = (state?.queue || []).map((song) =>
    song.id === songId ? { ...song, preloadStatus: "preloaded" } : song,
  );
  return { ...state, queue };
}

export function markSongLoaded(state, songId) {
  const queue = (state?.queue || []).map((song) =>
    song.id === songId ? { ...song, preloadStatus: "loaded" } : song,
  );
  return { ...state, queue };
}

export function advanceToNextSong(state) {
  const nextIndex = Number(state?.activeIndex || 0) + 1;
  if (!state?.queue || nextIndex >= state.queue.length) return state;
  return {
    ...state,
    activeIndex: nextIndex,
    queue: state.queue.map((song, idx) =>
      idx === nextIndex ? { ...song, preloadStatus: "loaded" } : song,
    ),
  };
}

export function shouldAutoPlayNext(state) {
  return Boolean(state?.autoPlayNext);
}
