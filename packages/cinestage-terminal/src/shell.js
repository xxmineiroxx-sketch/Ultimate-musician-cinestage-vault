import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { AUDIT_LOG_PATH, REPO_ROOT } from './config.js';

export function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs || 30000,
    maxBuffer: options.maxBuffer || 1024 * 1024 * 8,
    env: { ...process.env, CI: '1', NO_COLOR: '1', ...(options.env || {}) },
  });
  return {
    command: [command, ...args].join(' '),
    cwd: options.cwd || REPO_ROOT,
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || '',
  };
}

export function commandExists(command) {
  return run('which', [command], { timeoutMs: 5000 }).ok;
}

export function appendAudit(entry) {
  mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
  appendFileSync(AUDIT_LOG_PATH, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, 'utf8');
}

export function safeRelative(root, target = '.') {
  const resolved = path.resolve(root, target);
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Target path escapes the selected project root.');
  }
  return resolved;
}

export function pathExists(target) {
  return existsSync(target);
}
