import os from 'node:os';
import path from 'node:path';

export const REPO_ROOT = path.resolve(new URL('../../../', import.meta.url).pathname);
export const PROJECT_INDEX_PATH = path.join(REPO_ROOT, 'graphify-out', 'project-access-index.json');
export const OBSIDIAN_ROOT = path.join(REPO_ROOT, 'docs', 'obsidian');
export const GRAPH_REPORT_PATH = path.join(REPO_ROOT, 'graphify-out', 'GRAPH_REPORT.md');
export const CINESTAGE_HOME = path.join(os.homedir(), '.cinestage');
export const AUDIT_LOG_PATH = path.join(CINESTAGE_HOME, 'terminal-audit.log');
export const OLLAMA_URL = process.env.CINESTAGE_OLLAMA_URL || 'http://127.0.0.1:11434';

export const SAFE_NPM_SCRIPTS = new Set([
  'build',
  'build:renderer',
  'check',
  'check:release-urls',
  'check:spine',
  'doctor',
  'lint',
  'smoke:worker',
  'status',
  'test',
  'test:coverage',
  'type-check',
]);

export const PROJECT_SCAN_HINTS = [
  'Ultimate DAW',
  'Ultimate Musician',
  'Ultimate Playback',
  'CineStage',
  'Pool Tech',
  'Ultimate Mixer',
];
