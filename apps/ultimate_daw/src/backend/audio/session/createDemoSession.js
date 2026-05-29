'use strict';

/**
 * createDemoSession
 *
 * Returns a fully populated session object used as the default project
 * when no saved session is loaded. Contains 5 tracks across 4 scenes.
 *
 * Tracks: Kick, Snare, Bass, Keys, Vox FX
 * Scenes: Intro, Verse, Hook, Break
 */
function createDemoSession() {
  return {
    projectName: 'Demo Session',
    transport: { bpm: 120 },

    // -------------------------------------------------------------------------
    // Scenes
    // -------------------------------------------------------------------------
    scenes: [
      { id: 's1', name: 'Intro', color: '#6366f1' },
      { id: 's2', name: 'Verse', color: '#22c55e' },
      { id: 's3', name: 'Hook',  color: '#f59e0b' },
      { id: 's4', name: 'Break', color: '#ec4899' },
    ],

    // -------------------------------------------------------------------------
    // Tracks
    // -------------------------------------------------------------------------
    tracks: [
      // ---- Track 1: Kick ----
      {
        id: 't1',
        name: 'Kick',
        type: 'instrument',
        color: '#22c55e',
        volume: 0.85,
        pan: 0,
        mute: false,
        outputBus: 'Master',
        activeClipId: null,
        clips: [
          { slotId: 0, sceneId: 's1', name: 'Kick Intro',  color: '#22c55e', active: false },
          { slotId: 1, sceneId: 's2', name: 'Kick Groove', color: '#22c55e', active: false },
          { slotId: 2, sceneId: 's3', name: 'Kick Hook',   color: '#22c55e', active: false },
          { slotId: 3, sceneId: 's4', name: null,          color: '#22c55e', active: false },
        ],
        arrangementClips: [
          { id: 'ac1', name: 'Kick Intro',  color: '#22c55e', startBar: 1,  lengthBars: 4  },
          { id: 'ac2', name: 'Kick Groove', color: '#22c55e', startBar: 5,  lengthBars: 12 },
          { id: 'ac3', name: 'Kick Hook',   color: '#22c55e', startBar: 17, lengthBars: 8  },
        ],
      },

      // ---- Track 2: Snare ----
      {
        id: 't2',
        name: 'Snare',
        type: 'instrument',
        color: '#f97316',
        volume: 0.75,
        pan: 0,
        mute: false,
        outputBus: 'Master',
        activeClipId: null,
        clips: [
          { slotId: 0, sceneId: 's1', name: null,           color: '#f97316', active: false },
          { slotId: 1, sceneId: 's2', name: 'Snare Groove', color: '#f97316', active: false },
          { slotId: 2, sceneId: 's3', name: 'Snare Hook',   color: '#f97316', active: false },
          { slotId: 3, sceneId: 's4', name: 'Snare Break',  color: '#f97316', active: false },
        ],
        arrangementClips: [
          { id: 'ac4', name: 'Snare Groove', color: '#f97316', startBar: 5,  lengthBars: 12 },
          { id: 'ac5', name: 'Snare Hook',   color: '#f97316', startBar: 17, lengthBars: 8  },
          { id: 'ac6', name: 'Snare Break',  color: '#f97316', startBar: 25, lengthBars: 4  },
        ],
      },

      // ---- Track 3: Bass ----
      {
        id: 't3',
        name: 'Bass',
        type: 'instrument',
        color: '#f59e0b',
        volume: 0.78,
        pan: -0.05,
        mute: false,
        outputBus: 'Master',
        activeClipId: null,
        clips: [
          { slotId: 0, sceneId: 's1', name: 'Bass Intro', color: '#f59e0b', active: false },
          { slotId: 1, sceneId: 's2', name: 'Bass Groove', color: '#f59e0b', active: false },
          { slotId: 2, sceneId: 's3', name: 'Bass Hook',  color: '#f59e0b', active: false },
          { slotId: 3, sceneId: 's4', name: 'Bass Break', color: '#f59e0b', active: false },
        ],
        arrangementClips: [
          { id: 'ac7', name: 'Bass Intro',  color: '#f59e0b', startBar: 1,  lengthBars: 4  },
          { id: 'ac8', name: 'Bass Groove', color: '#f59e0b', startBar: 5,  lengthBars: 20 },
          { id: 'ac9', name: 'Bass Break',  color: '#f59e0b', startBar: 25, lengthBars: 4  },
        ],
      },

      // ---- Track 4: Keys ----
      {
        id: 't4',
        name: 'Keys',
        type: 'instrument',
        color: '#6366f1',
        volume: 0.70,
        pan: 0.15,
        mute: false,
        outputBus: 'Master',
        activeClipId: null,
        clips: [
          { slotId: 0, sceneId: 's1', name: null,          color: '#6366f1', active: false },
          { slotId: 1, sceneId: 's2', name: 'Keys Pad',    color: '#6366f1', active: false },
          { slotId: 2, sceneId: 's3', name: 'Keys Lead',   color: '#6366f1', active: false },
          { slotId: 3, sceneId: 's4', name: 'Keys Outro',  color: '#6366f1', active: false },
        ],
        arrangementClips: [
          { id: 'ac10', name: 'Keys Pad',   color: '#6366f1', startBar: 5,  lengthBars: 12 },
          { id: 'ac11', name: 'Keys Lead',  color: '#6366f1', startBar: 17, lengthBars: 8  },
          { id: 'ac12', name: 'Keys Outro', color: '#6366f1', startBar: 25, lengthBars: 4  },
        ],
      },

      // ---- Track 5: Vox FX ----
      {
        id: 't5',
        name: 'Vox FX',
        type: 'audio',
        color: '#ec4899',
        volume: 0.80,
        pan: 0,
        mute: false,
        outputBus: 'FX',
        activeClipId: null,
        clips: [
          { slotId: 0, sceneId: 's1', name: null,          color: '#ec4899', active: false },
          { slotId: 1, sceneId: 's2', name: 'Verse Vox',   color: '#ec4899', active: false },
          { slotId: 2, sceneId: 's3', name: 'Hook Vox',    color: '#ec4899', active: false },
          { slotId: 3, sceneId: 's4', name: 'FX Riser',    color: '#ec4899', active: false },
        ],
        arrangementClips: [
          { id: 'ac13', name: 'Verse Vox', color: '#ec4899', startBar: 5,  lengthBars: 12 },
          { id: 'ac14', name: 'Hook Vox',  color: '#ec4899', startBar: 17, lengthBars: 8  },
          { id: 'ac15', name: 'FX Riser',  color: '#ec4899', startBar: 25, lengthBars: 4  },
        ],
      },
    ],
  };
}

module.exports = { createDemoSession };
