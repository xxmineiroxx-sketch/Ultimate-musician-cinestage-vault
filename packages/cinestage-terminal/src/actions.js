import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SAFE_NPM_SCRIPTS } from './config.js';
import { appendAudit, run } from './shell.js';

function readPackage(project) {
  if (!project?.packageJson || !existsSync(project.packageJson)) return null;
  try {
    return JSON.parse(readFileSync(project.packageJson, 'utf8'));
  } catch {
    return null;
  }
}

export function diagnoseProject(project) {
  if (!project) return { ok: false, error: 'Project not found.' };
  const pkg = readPackage(project);
  const gitStatus = project.git ? run('git', ['status', '--short'], { cwd: project.root, timeoutMs: 10000 }) : null;
  return {
    ok: true,
    project: {
      name: project.name,
      kind: project.kind,
      root: project.root,
      packageJson: project.packageJson,
      graphifyReport: project.graphifyReport,
      obsidian: project.obsidian,
      git: project.git,
    },
    scripts: pkg?.scripts || {},
    safeScripts: Object.keys(pkg?.scripts || {}).filter((script) => SAFE_NPM_SCRIPTS.has(script)),
    gitStatus: gitStatus ? {
      ok: gitStatus.ok,
      dirty: gitStatus.stdout.split('\n').filter(Boolean).slice(0, 80),
      stderr: gitStatus.stderr,
    } : null,
  };
}

export function runProjectScript(project, script, options = {}) {
  if (!project) return { ok: false, error: 'Project not found.' };
  const selected = String(script || '').trim();
  if (!selected) return { ok: false, error: 'Script name is required.' };
  const pkg = readPackage(project);
  if (!pkg?.scripts?.[selected]) {
    return { ok: false, error: `Script "${selected}" was not found in ${project.name}.` };
  }
  if (!SAFE_NPM_SCRIPTS.has(selected)) {
    return {
      ok: false,
      error: `Script "${selected}" is not in the safe allowlist. Run manually or add an explicit safety rule after review.`,
      allowedScripts: [...SAFE_NPM_SCRIPTS].sort(),
    };
  }
  if (!options.approve) {
    return {
      ok: false,
      approvalRequired: true,
      proposedCommand: `npm run ${selected}`,
      cwd: project.root,
      reason: 'CineStage Terminal requires explicit approval before executing project scripts.',
    };
  }
  const result = run('npm', ['run', selected], {
    cwd: project.root,
    timeoutMs: options.timeoutMs || 120000,
  });
  appendAudit({
    action: 'runProjectScript',
    project: project.name,
    root: project.root,
    script: selected,
    ok: result.ok,
    status: result.status,
  });
  return result;
}

export function proposeFixLoop(project, failingOutput = '') {
  return [
    `Project: ${project?.name || 'unknown'}`,
    `Root: ${project?.root || 'unknown'}`,
    '',
    'Safe debug loop:',
    '1. Run `cinestage diagnose <project>` to inspect scripts, git state, Graphify, and Obsidian memory.',
    '2. Run safe checks only, such as `cinestage run <project> build --approve` or `cinestage run <project> test --approve`.',
    '3. Paste or pipe the failing output into `cinestage ask "..." --project <project>`.',
    '4. Apply file edits through Codex or the standalone terminal app with human approval.',
    '',
    failingOutput ? `Latest failing output:\n${String(failingOutput).slice(0, 4000)}` : 'No failing output was provided yet.',
  ].join('\n');
}

export function formatDiagnostic(diag) {
  if (!diag?.ok) return diag?.error || 'Diagnostic failed.';
  const lines = [
    `${diag.project.name} (${diag.project.kind})`,
    `Root: ${diag.project.root}`,
    `Git: ${diag.project.git ? 'yes' : 'no'}`,
    `Graphify: ${diag.project.graphifyReport || 'none'}`,
    `Obsidian: ${diag.project.obsidian || 'none'}`,
    '',
    'Scripts:',
  ];
  const scripts = Object.keys(diag.scripts);
  if (!scripts.length) lines.push('- none');
  for (const script of scripts) {
    const safe = diag.safeScripts.includes(script) ? 'safe' : 'manual';
    lines.push(`- ${script} (${safe}): ${diag.scripts[script]}`);
  }
  if (diag.gitStatus) {
    lines.push('');
    lines.push(`Git status: ${diag.gitStatus.dirty.length ? `${diag.gitStatus.dirty.length} visible entries` : 'clean'}`);
    for (const entry of diag.gitStatus.dirty.slice(0, 20)) lines.push(`- ${entry}`);
  }
  return lines.join('\n');
}

export function projectRootLabel(project) {
  return project?.root ? path.basename(project.root) : 'unknown';
}
