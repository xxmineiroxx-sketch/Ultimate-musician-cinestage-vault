# CineStage Terminal

Standalone local-first CineStage Brain for full computer assistance: project memory, Graphify, Obsidian notes, diagnostics, guarded build/test execution, local Ollama reasoning, and future voice control.

This is intentionally separate from the embedded Ultimate DAW CineStage Brain. The DAW brain only helps inside the music app. CineStage Terminal is the broader desktop/terminal assistant that can help code, build, debug, organize, and inspect projects.

## Commands

```bash
npm run cinestage:install-local
cinestage status
cinestage projects cinestage-terminal
cinestage ask "what should I inspect next?" --project cinestage-terminal
cinestage diagnose ultimate_daw
cinestage run ultimate_daw build --approve
cinestage voice
cinestage voice:install
cinestage voice:clap
```

Repo-local commands also work from the repo root:

```bash
npm run cinestage -- help
npm run cinestage -- status
npm run cinestage -- projects ultimate_daw
npm run cinestage -- ask "what should I check in Ultimate DAW?"
npm run cinestage -- diagnose ultimate_daw
npm run cinestage -- run ultimate_daw build --approve
npm run cinestage -- voice
npm run cinestage:voice:clap
```

## Local AI Stack

- Reasoning: Ollama first, then optional OpenAI, Claude, Gemini, or Grok API keys.
- Speech to text: faster-whisper or whisper.cpp.
- Text to speech: Piper or Kokoro.
- Wake word: openWakeWord, with push-to-talk as the default safe trigger.
- Memory: Obsidian notes plus Graphify project index.
- Trigger prototype: optional double-clap listener inspired by the downloaded Jarvis reference, but wired to CineStage Terminal commands instead of opening random apps.

## Safety Model

CineStage Terminal can read project memory and diagnose projects without approval. It requires explicit `--approve` before running package scripts, builds, tests, installs, deployments, or anything that changes the machine.

The execution allowlist is intentionally small. New script names should be added to `src/config.js` only when they are predictable and safe enough for repeat use.

## Optional Double-Clap Trigger

Install the lightweight voice trigger dependencies only when you want to test microphone activation:

```bash
cinestage voice:install
cinestage voice:clap
```

By default the double clap runs a read-only status command. Override it with:

```bash
CINESTAGE_VOICE_COMMAND="cinestage ask 'status report for Ultimate DAW' --project ultimate_daw" cinestage voice:clap
```

Do not point `CINESTAGE_VOICE_COMMAND` at destructive shell commands. Build/test/project mutation still belongs behind the normal CineStage Terminal approval flow.
