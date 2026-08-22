import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { GRAPH_REPORT_PATH, OBSIDIAN_ROOT, PROJECT_INDEX_PATH, REPO_ROOT } from './config.js';

function readText(filePath, maxChars = 12000) {
  try {
    return readFileSync(filePath, 'utf8').slice(0, maxChars);
  } catch {
    return '';
  }
}

export function loadProjectIndex() {
  if (!existsSync(PROJECT_INDEX_PATH)) return { generatedAt: null, projects: [] };
  try {
    const parsed = JSON.parse(readFileSync(PROJECT_INDEX_PATH, 'utf8'));
    return {
      generatedAt: parsed.generatedAt || null,
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
  } catch {
    return { generatedAt: null, projects: [] };
  }
}

export function searchProjects(query = '', limit = 12) {
  const q = String(query || '').toLowerCase();
  const index = loadProjectIndex();
  const scored = index.projects
    .map((project) => {
      const name = String(project.name || '').toLowerCase();
      const kind = String(project.kind || '').toLowerCase();
      const root = String(project.root || '').toLowerCase();
      const basename = path.basename(project.root || '').toLowerCase();
      const localBoost = root.startsWith(REPO_ROOT.toLowerCase()) ? 2 : 0;
      const haystack = [
        project.name,
        project.kind,
        project.root,
        project.packageJson,
        project.graphifyReport,
        project.obsidian,
        ...(project.scripts || []),
      ].filter(Boolean).join(' ').toLowerCase();
      const exactBoost = q && (name === q || basename === q || kind === q) ? 100 : 0;
      const score = !q
        ? 1 + localBoost
        : exactBoost + localBoost + (haystack.includes(q) ? 10 : q.split(/\s+/).filter(Boolean).reduce((sum, part) => sum + (haystack.includes(part) ? 1 : 0), 0));
      return { project, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.project.name.localeCompare(b.project.name));
  return scored.slice(0, limit).map((item) => item.project);
}

export function findProject(selector = '') {
  const normalized = String(selector || '').toLowerCase();
  const projects = searchProjects(selector, 20);
  if (!normalized && projects.length) return projects[0];
  return projects.find((project) => String(project.name || '').toLowerCase() === normalized)
    || projects.find((project) => path.basename(project.root || '').toLowerCase() === normalized)
    || projects.find((project) => String(project.kind || '').toLowerCase() === normalized)
    || projects[0]
    || null;
}

export function loadGraphSummary(project) {
  const reportPath = project?.graphifyReport || GRAPH_REPORT_PATH;
  if (!reportPath || !existsSync(reportPath)) return null;
  const text = readText(reportPath, 5000);
  const lines = text.split('\n').filter((line) => (
    line.startsWith('# Graph Report')
    || line.startsWith('- ')
    || line.startsWith('## Summary')
    || line.startsWith('## Graph Freshness')
  ));
  return {
    path: reportPath,
    summary: lines.slice(0, 18).join('\n'),
  };
}

function walkMarkdown(root, maxDepth, output) {
  if (maxDepth < 0) return;
  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walkMarkdown(entryPath, maxDepth - 1, output);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const stat = statSync(entryPath);
      output.push({ path: entryPath, mtimeMs: stat.mtimeMs, size: stat.size });
    }
  }
}

export function searchObsidian(query = '', limit = 8) {
  if (!existsSync(OBSIDIAN_ROOT)) return [];
  const files = [];
  walkMarkdown(OBSIDIAN_ROOT, 2, files);
  const q = String(query || '').toLowerCase();
  return files
    .map((file) => {
      const text = readText(file.path, 6000);
      const haystack = `${path.basename(file.path)}\n${text}`.toLowerCase();
      const score = !q ? file.mtimeMs / 1000000000000 : q.split(/\s+/).filter(Boolean).reduce((sum, part) => sum + (haystack.includes(part) ? 1 : 0), 0);
      return { ...file, text, score };
    })
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((file) => ({
      path: file.path,
      title: path.basename(file.path, '.md'),
      excerpt: file.text.slice(0, 1600),
    }));
}

export function buildMemoryContext(prompt = '', project = null) {
  const index = loadProjectIndex();
  return {
    projectIndex: {
      generatedAt: index.generatedAt,
      count: index.projects.length,
      matches: searchProjects(prompt, 8).map((item) => ({
        name: item.name,
        kind: item.kind,
        root: item.root,
        scripts: item.scripts,
        graphifyReport: item.graphifyReport,
        obsidian: item.obsidian,
      })),
    },
    selectedProject: project,
    graph: loadGraphSummary(project),
    obsidian: searchObsidian(prompt, 8),
  };
}
