/**
 * Scene Manager - Ultimate Playback Phase 3
 * Manages playback scenes (which stems active, routing, transitions)
 */

import audioEngine from './audioEngine';

class SceneManager {
  constructor() {
    this.scenes = [];
    this.currentScene = null;
    this.songStructure = [];
    this.autoTransition = true;
  }

  /**
   * Load scenes for a song
   */
  loadScenes(scenes, songStructure) {
    this.scenes = scenes;
    this.songStructure = songStructure;
    console.log(`Loaded ${scenes.length} scenes`);
  }

  /**
   * Apply scene by ID
   */
  async applyScene(sceneId) {
    const scene = this.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      console.error(`Scene ${sceneId} not found`);
      return false;
    }

    try {
      await audioEngine.applyScene(scene);
      this.currentScene = scene;
      console.log(`Applied scene: ${scene.name}`);
      return true;
    } catch (error) {
      console.error('Error applying scene:', error);
      return false;
    }
  }

  /**
   * Apply scene by section name (Intro, Verse, Chorus, etc.)
   */
  async applySceneBySection(sectionName) {
    const scene = this.scenes.find(
      (s) => s.section && s.section.toLowerCase() === sectionName.toLowerCase()
    );

    if (scene) {
      return this.applyScene(scene.id);
    }

    console.warn(`No scene found for section: ${sectionName}`);
    return false;
  }

  /**
   * Get scene for current playback position
   */
  getSceneForPosition(positionMs) {
    // Find which section we're in
    const currentSection = this.songStructure.find(
      (section) =>
        positionMs >= section.start_ms && positionMs < section.end_ms
    );

    if (currentSection) {
      return this.scenes.find(
        (s) => s.section === currentSection.section
      );
    }

    return null;
  }

  /**
   * Auto-transition scenes based on song position
   */
  startAutoTransition() {
    this.autoTransition = true;

    audioEngine.onProgressUpdate = ({ position }) => {
      if (this.autoTransition) {
        const scene = this.getSceneForPosition(position);
        if (scene && (!this.currentScene || scene.id !== this.currentScene.id)) {
          this.applyScene(scene.id);
        }
      }
    };

    console.log('Auto-transition enabled');
  }

  /**
   * Stop auto-transition
   */
  stopAutoTransition() {
    this.autoTransition = false;
    console.log('Auto-transition disabled');
  }

  /**
   * Get all scenes
   */
  getAllScenes() {
    return this.scenes;
  }

  /**
   * Get current scene
   */
  getCurrentScene() {
    return this.currentScene;
  }

  /**
   * Create default scene from song structure
   */
  createDefaultScene(section, stemIds) {
    return {
      id: `scene_${section.section}_${Date.now()}`,
      name: section.section,
      section: section.section,
      active_stems: stemIds, // All stems active by default
      click_enabled: true,
      guide_enabled: false,
      routing: {
        iem: true,
        foh: true,
        stream: true,
      },
      transition: {
        type: 'immediate', // immediate, fade, stop
        duration_ms: 0,
      },
    };
  }

  /**
   * Create scenes from song structure (auto-generate)
   */
  createScenesFromStructure(songStructure, availableStems) {
    const stemIds = availableStems.map((s) => s.id);

    const scenes = songStructure.map((section) =>
      this.createDefaultScene(section, stemIds)
    );

    this.loadScenes(scenes, songStructure);
    return scenes;
  }

  /**
   * Save custom scene
   */
  saveCustomScene(scene) {
    const existingIndex = this.scenes.findIndex((s) => s.id === scene.id);

    if (existingIndex >= 0) {
      this.scenes[existingIndex] = scene;
    } else {
      this.scenes.push(scene);
    }

    console.log(`Saved scene: ${scene.name}`);
    return scene;
  }

  /**
   * Delete scene
   */
  deleteScene(sceneId) {
    this.scenes = this.scenes.filter((s) => s.id !== sceneId);
    console.log(`Deleted scene: ${sceneId}`);
  }

  /**
   * Clear all scenes
   */
  clear() {
    this.scenes = [];
    this.currentScene = null;
    this.songStructure = [];
    this.autoTransition = false;
  }
}

// Export singleton instance
export default new SceneManager();
