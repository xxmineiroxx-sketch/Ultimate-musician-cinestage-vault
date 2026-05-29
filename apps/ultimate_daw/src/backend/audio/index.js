'use strict';

const { NodeAudioEngine } = require('./engine/NodeAudioEngine');

/**
 * createAudioEngine
 * Factory used by main.js to create the singleton audio engine.
 * @returns {NodeAudioEngine}
 */
function createAudioEngine() {
  return new NodeAudioEngine();
}

module.exports = { createAudioEngine, NodeAudioEngine };
