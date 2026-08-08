'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ICLOUD_CINESTAGE_ROOT = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs/Ultimate Ecosystem /Cinestage',
);

function candidateBrainRoots(extraRoots = []) {
  return [
    process.env.UM_CINESTAGE_BRAIN_PATH,
    ...extraRoots,
    path.join(process.cwd(), 'resources/cinestage-brain'),
    path.join(process.cwd(), 'cinestage-brain'),
    path.join(ICLOUD_CINESTAGE_ROOT, 'CineStage_Music_AI'),
    ICLOUD_CINESTAGE_ROOT,
  ]
    .filter(Boolean)
    .map((item) => path.resolve(String(item)));
}

function exists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function fileSize(root, relativePath) {
  try {
    return fs.statSync(path.join(root, relativePath)).size;
  } catch {
    return 0;
  }
}

function detectCapabilities(root) {
  const capabilityChecks = {
    songPipeline: ['cinestage/api/song_pipeline.py'],
    songIntelligence: ['cinestage/api/intelligence.py', 'cinestage/services/intelligence_layer.py'],
    stemSeparation: ['app/ai/stem_separator.py'],
    advancedStemSeparation: ['app/ai/advanced_stem_separator.py'],
    chordDetection: ['cinestage/pipeline/chord_detector.py'],
    keyDetection: ['cinestage/pipeline/key_detector.py'],
    tempoDetection: ['cinestage/pipeline/tempo_detector.py'],
    waveformAnalysis: ['cinestage/pipeline/waveform_analyzer.py'],
    sectionDetection: ['cinestage/pipeline/structure_detector.py'],
    cueGeneration: ['cinestage/services/cue_generator.py'],
    instrumentCharts: ['app/ai/instrument_chart_generator.py', 'app/routers/instrument_chart_routes.py'],
    partsheets: ['app/routers/partsheet_routes.py', 'app/services/partsheet_renderer.py'],
    vocalParts: ['app/routers/vocal_parts.py', 'app/routers/vocal_harmony_routes.py'],
    worshipFlow: ['app/routers/worship_flow.py', 'app/routers/setlist_flow.py'],
    worshipMemory: ['app/routers/worship_memory.py'],
    midiPresets: ['app/routers/midi_preset_routes.py', 'app/ai/midi_preset_manager.py'],
    mixIntelligence: ['app/ai/mix_intelligence.py', 'cinestage/services/intelligence_layer.py'],
  };

  return Object.fromEntries(
    Object.entries(capabilityChecks).map(([key, files]) => [
      key,
      files.every((relativePath) => exists(root, relativePath)),
    ]),
  );
}

function detectStorage(root) {
  const chartDirs = [
    'storage/charts',
    'CineStage_Music_AI/storage/charts',
  ];
  const stemDirs = [
    'storage/stems',
    'CineStage_Music_AI/storage/stems',
  ];

  const countFiles = (dirs) => dirs.reduce((count, relativeDir) => {
    const dir = path.join(root, relativeDir);
    if (!fs.existsSync(dir)) return count;
    const stack = [dir];
    let total = count;
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(fullPath);
        if (entry.isFile()) total += 1;
      }
    }
    return total;
  }, 0);

  return {
    charts: countFiles(chartDirs),
    stems: countFiles(stemDirs),
    memoryDbBytes: fileSize(root, 'cinestage_memory.db') || fileSize(root, 'CineStage_Music_AI/cinestage_memory.db'),
  };
}

function inspectBrainRoot(root) {
  const resolved = path.resolve(String(root || ''));
  const installed = Boolean(
    resolved &&
    fs.existsSync(resolved) &&
    (exists(resolved, 'app/main.py') || exists(resolved, 'cinestage/api/song_pipeline.py')),
  );

  if (!installed) {
    return {
      installed: false,
      path: resolved,
      status: 'missing',
      capabilities: {},
      storage: { charts: 0, stems: 0, memoryDbBytes: 0 },
    };
  }

  const capabilities = detectCapabilities(resolved);
  const capabilityCount = Object.values(capabilities).filter(Boolean).length;
  return {
    installed: true,
    path: resolved,
    status: capabilityCount >= 8 ? 'ready' : 'partial',
    capabilities,
    capabilityCount,
    storage: detectStorage(resolved),
  };
}

function findBrainInstallation(extraRoots = []) {
  const candidates = candidateBrainRoots(extraRoots);
  const inspections = candidates.map(inspectBrainRoot);
  const selected = inspections.find((item) => item.installed && item.status === 'ready') ||
    inspections.find((item) => item.installed) ||
    inspections[0];

  return {
    selected,
    candidates: inspections,
  };
}

module.exports = {
  candidateBrainRoots,
  findBrainInstallation,
  inspectBrainRoot,
};
