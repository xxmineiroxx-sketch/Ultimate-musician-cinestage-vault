'use strict';

/**
 * createRenderContext
 * Builds a lightweight context object passed to each processor during a render block.
 * @param {{ config: object, transport: TransportClock, blockIndex: number }} opts
 * @returns {object}
 */
function createRenderContext({ config, transport, blockIndex }) {
  const transportStatus = transport.getStatus();
  return {
    blockIndex,
    blockSize: config.blockSize,
    channelCount: config.channelCount,
    sampleRate: config.sampleRate,
    beatsPerBar: config.timeSignature[0],
    beatUnit: config.timeSignature[1],
    samplesPerBeat: transport.samplesPerBeat,
    currentSample: transport.currentSample,
    transport: transportStatus,
  };
}

module.exports = { createRenderContext };
