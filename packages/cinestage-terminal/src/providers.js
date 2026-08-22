import { OLLAMA_URL } from './config.js';
import { commandExists, run } from './shell.js';

export function detectProviders() {
  const ollamaCli = commandExists('ollama');
  const ollamaList = ollamaCli ? run('ollama', ['list'], { timeoutMs: 8000 }) : null;
  const ollamaModels = ollamaList?.ok
    ? ollamaList.stdout.split('\n').slice(1).map((line) => line.trim().split(/\s+/)[0]).filter(Boolean)
    : [];
  return {
    local: {
      ollama: {
        installed: ollamaCli,
        online: Boolean(ollamaList?.ok),
        models: ollamaModels,
        ready: Boolean(ollamaList?.ok && ollamaModels.length),
        setup: ollamaCli ? 'open -a Ollama' : 'brew install --cask ollama',
      },
      whisper: {
        installed: commandExists('whisper') || commandExists('faster-whisper'),
        purpose: 'speech-to-text adapter',
      },
      piper: {
        installed: commandExists('piper'),
        purpose: 'local text-to-speech adapter',
      },
      openWakeWord: {
        installed: commandExists('openwakeword'),
        purpose: 'optional wake-word adapter',
      },
    },
    optionalApis: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      google: Boolean(process.env.GOOGLE_API_KEY),
      grok: Boolean(process.env.XAI_API_KEY),
    },
  };
}

function chooseModel(models = []) {
  const preferred = [
    process.env.CINESTAGE_LOCAL_MODEL,
    'llama3.1:8b',
    'qwen2.5-coder:14b',
    'gpt-oss:20b',
    'gemma4:latest',
  ].filter(Boolean);
  return preferred.find((model) => models.includes(model)) || models[0] || 'llama3.1:8b';
}

export async function askOllama(prompt, context = {}, options = {}) {
  const providers = detectProviders();
  if (!providers.local.ollama.ready) {
    return {
      ok: false,
      provider: 'ollama',
      error: providers.local.ollama.installed ? 'Ollama is installed but not running or has no models.' : 'Ollama is not installed.',
      setup: providers.local.ollama.setup,
    };
  }

  const model = chooseModel(providers.local.ollama.models);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 45000);
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: 'system',
            content: [
              'You are CineStage Terminal/Desktop, a standalone local computer agent for the Ultimate Labs ecosystem.',
              'You can help with code, builds, debugging, project structure, Obsidian memory, Graphify project maps, and safe terminal workflows.',
              'Be practical and concise. Do not claim that commands ran unless command output is present in context.',
              'Never recommend destructive commands without explicit backup and human approval.',
              'When a command should be run, mark it as a proposed command and explain why.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({ prompt, context }).slice(0, 18000),
          },
        ],
        options: {
          temperature: 0.2,
          num_ctx: 8192,
        },
      }),
    });
    const data = await response.json().catch(() => null);
    return {
      ok: response.ok,
      provider: 'ollama',
      model,
      response: data?.message?.content || data?.response || '',
      error: response.ok ? '' : (data?.error || `Ollama HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'ollama',
      model,
      error: error?.name === 'AbortError' ? 'Ollama request timed out.' : String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function deterministicAnswer(prompt, context = {}) {
  const lines = [
    'CineStage Terminal/Desktop is ready in deterministic mode.',
    '',
    'Local AI is not available yet, so I can still inspect memory, projects, scripts, Graphify reports, and propose safe next commands.',
    '',
    `Request: ${prompt}`,
  ];
  if (context.projectIndex) {
    lines.push('');
    lines.push(`Project index: ${context.projectIndex.count} projects, generated ${context.projectIndex.generatedAt || 'unknown'}.`);
    for (const project of context.projectIndex.matches || []) {
      lines.push(`- ${project.name} (${project.kind}) ${project.root}`);
    }
  }
  if (context.graph?.summary) {
    lines.push('');
    lines.push('Graphify context:');
    lines.push(context.graph.summary);
  }
  if (context.obsidian?.length) {
    lines.push('');
    lines.push('Relevant Obsidian memory:');
    for (const note of context.obsidian.slice(0, 5)) {
      lines.push(`- ${note.title}: ${note.path}`);
    }
  }
  return lines.join('\n');
}
