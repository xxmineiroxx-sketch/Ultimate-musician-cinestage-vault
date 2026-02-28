export function defaultSetlist() {
  return {
    id: "setlist_default",
    name: "Sunday Set",
    songs: [
      // each song references a session snapshot or audio uri later
      // { id, title, bpm, markers, stems }
    ],
    activeSongId: null,
    activeIndex: 0,
    preloadNext: true,
  };
}
