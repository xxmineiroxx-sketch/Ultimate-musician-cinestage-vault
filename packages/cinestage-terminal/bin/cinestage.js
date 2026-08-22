#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildMemoryContext, findProject, loadProjectIndex, searchProjects } from '../src/memory.js';
import { askOllama, deterministicAnswer, detectProviders } from '../src/providers.js';
import { diagnoseProject, formatDiagnostic, proposeFixLoop, runProjectScript } from '../src/actions.js';
import { AUDIT_LOG_PATH, PROJECT_INDEX_PATH, REPO_ROOT } from '../src/config.js';
import { VOICE_PROFILE, voiceProfileMarkdown } from '../src/voiceProfile.js';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function print(value, json = false) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  } else if (typeof value === 'string') {
    process.stdout.write(`${value}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }
}

function help() {
  return [
    'CineStage Terminal/Desktop',
    '',
    'Commands:',
    '  cinestage status [--json]',
    '  cinestage projects [query] [--json]',
    '  cinestage ask "question" [--project name] [--json]',
    '  cinestage diagnose <project> [--json]',
    '  cinestage run <project> <script> [--approve] [--json]',
    '  cinestage doctor [--json]',
    '  cinestage voice [--json]',
    '  cinestage voice:install [--json]',
    '  cinestage voice:clap',
    '',
    'Safety:',
    '  Script execution requires --approve and only safe build/test/check scripts are allowlisted.',
    '  File edits, destructive commands, deployments, secrets, payments, and hardware control are not automatic.',
  ].join('\n');
}

async function ask(args, json) {
  const projectSelector = argValue(args, '--project', '');
  const promptParts = args.filter((arg, index) => {
    if (arg === '--project' || args[index - 1] === '--project') return false;
    if (arg === '--json') return false;
    return true;
  });
  const prompt = promptParts.join(' ').trim() || readFileSync(0, 'utf8').trim();
  const project = projectSelector ? findProject(projectSelector) : null;
  const context = buildMemoryContext(prompt, project);
  const local = await askOllama(prompt, context);
  const response = local.ok ? local.response : deterministicAnswer(prompt, context);
  print({
    ok: true,
    mode: local.ok ? 'ollama' : 'deterministic',
    provider: local.ok ? { id: local.provider, model: local.model } : { id: 'deterministic', error: local.error, setup: local.setup },
    project: project ? { name: project.name, root: project.root, kind: project.kind } : null,
    response,
  }, json);
}

function status(json) {
  const providers = detectProviders();
  const index = loadProjectIndex();
  print({
    ok: true,
    name: 'CineStage Terminal/Desktop',
    scope: 'full_computer_agent',
    projectIndex: {
      path: PROJECT_INDEX_PATH,
      generatedAt: index.generatedAt,
      projects: index.projects.length,
    },
    providers,
    auditLog: AUDIT_LOG_PATH,
    capabilities: [
      'Obsidian memory search',
      'Graphify project access',
      'project diagnostics',
      'safe build/test script execution',
      'local Ollama reasoning',
      'voice adapter ready for Whisper/Piper/openWakeWord',
      'optional external API routing',
    ],
  }, json);
}

function projects(args, json) {
  const query = args.filter((arg) => arg !== '--json').join(' ');
  const matches = searchProjects(query, query ? 20 : 80);
  if (json) return print({ ok: true, projects: matches }, true);
  const lines = matches.map((project) => {
    const markers = [
      project.graphifyReport ? 'graphify' : null,
      project.obsidian ? 'obsidian' : null,
      project.git ? 'git' : null,
      project.packageJson ? 'package' : null,
    ].filter(Boolean).join(', ');
    return `- ${project.name} (${project.kind})${markers ? ` [${markers}]` : ''}\n  ${project.root}`;
  });
  print(lines.join('\n') || 'No projects found.');
}

function diagnose(args, json) {
  const selector = args.filter((arg) => arg !== '--json').join(' ');
  const project = findProject(selector);
  const diag = diagnoseProject(project);
  print(json ? diag : formatDiagnostic(diag), json);
}

function runScript(args, json) {
  const filtered = args.filter((arg) => arg !== '--json' && arg !== '--approve');
  const [selector, script] = filtered;
  const project = findProject(selector);
  const result = runProjectScript(project, script, { approve: hasFlag(args, '--approve') });
  print(result, json);
}

function doctor(json) {
  const index = loadProjectIndex();
  const providers = detectProviders();
  const issues = [];
  if (!index.projects.length) issues.push('Project index is empty. Run `npm run knowledge:projects` from the repo root.');
  if (!providers.local.ollama.ready) issues.push(`Ollama is not ready. ${providers.local.ollama.setup}`);
  if (!providers.local.whisper.installed) issues.push('Speech-to-text is not installed. Recommended adapter: faster-whisper or whisper.cpp.');
  if (!providers.local.piper.installed) issues.push('Local text-to-speech is not installed. Recommended adapter: Piper or Kokoro.');
  const payload = {
    ok: issues.length === 0,
    issues,
    next: issues.length ? issues[0] : 'CineStage Terminal core is ready.',
  };
  print(json ? payload : [
    payload.ok ? 'CineStage Terminal doctor passed.' : 'CineStage Terminal doctor found setup work:',
    ...issues.map((issue) => `- ${issue}`),
  ].join('\n'), json);
}

function voiceInstall(json) {
  const result = spawnSync('python3', ['-m', 'pip', 'install', '-r', 'packages/cinestage-terminal/voice/requirements.txt'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 8,
    env: { ...process.env, NO_COLOR: '1' },
  });
  const payload = {
    ok: result.status === 0,
    command: 'python3 -m pip install -r packages/cinestage-terminal/voice/requirements.txt',
    cwd: REPO_ROOT,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || '',
  };
  print(json ? payload : [
    payload.ok ? 'CineStage voice dependencies installed.' : 'CineStage voice dependency install failed.',
    payload.stdout.trim(),
    payload.stderr.trim(),
  ].filter(Boolean).join('\n'), json);
}

function voiceClap() {
  const result = spawnSync('python3', ['packages/cinestage-terminal/voice/cinestage_voice_trigger.py'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  process.exitCode = result.status || 0;
}

async function main() {
  const [command = 'help', ...args] = process.argv.slice(2);
  const json = hasFlag(args, '--json');
  if (command === 'help' || command === '--help' || command === '-h') return print(help());
  if (command === 'status') return status(json);
  if (command === 'projects') return projects(args, json);
  if (command === 'ask') return ask(args, json);
  if (command === 'diagnose') return diagnose(args, json);
  if (command === 'run') return runScript(args, json);
  if (command === 'doctor') return doctor(json);
  if (command === 'voice') return print(json ? VOICE_PROFILE : voiceProfileMarkdown(), json);
  if (command === 'voice:install') return voiceInstall(json);
  if (command === 'voice:clap') return voiceClap();
  if (command === 'debug') {
    const project = findProject(args.join(' '));
    return print(proposeFixLoop(project));
  }
  print(help());
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || error}\n`);
  process.exitCode = 1;
});
