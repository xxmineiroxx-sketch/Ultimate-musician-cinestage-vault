# CineStage Terminal Jarvis Agent - 2026-08-22

## Decision

CineStage needs two AI surfaces:

1. **Ultimate DAW embedded Brain**
   - Music-production scope only.
   - Stems, charts, lyrics, mixer scenes, setlists, rehearsal/live cues, sync readiness.

2. **CineStage Terminal/Desktop**
   - Full local computer agent.
   - Can code, build, debug, inspect projects, read Obsidian memory, query Graphify, use local AI, and route to external APIs with approval gates.

This note covers the second surface.

## First Implementation

Package:

```text
packages/cinestage-terminal
```

Root commands:

```bash
npm run cinestage -- status
npm run cinestage -- projects
npm run cinestage -- ask "what should I fix in ultimate daw?"
npm run cinestage -- diagnose ultimate_daw
npm run cinestage -- run ultimate_daw build --approve
npm run cinestage -- voice
npm run cinestage:doctor
```

## Current Capabilities

- Reads `graphify-out/project-access-index.json`
- Searches Obsidian notes in `docs/obsidian`
- Reads Graphify reports when available
- Detects local providers:
  - Ollama
  - Whisper/Faster Whisper
  - Piper
  - openWakeWord
- Detects optional API keys:
  - OpenAI
  - Anthropic
  - Google
  - xAI/Grok
- Can diagnose project scripts and git state
- Can run safe npm scripts only with `--approve`
- Writes an audit log to `~/.cinestage/terminal-audit.log`

## Safety Model

By default, CineStage Terminal can inspect and propose.

Execution requires explicit approval for:

- file edits
- terminal command execution
- build/test execution
- dependency installation
- deployments
- secrets
- destructive commands
- hardware control

Only known-safe npm scripts are allowlisted in the first version:

- build
- build:renderer
- check
- check:release-urls
- check:spine
- doctor
- lint
- smoke:worker
- status
- test
- test:coverage
- type-check

## Voice Stack

Recommended order:

1. Push-to-talk first
2. Wake word later
3. Double-clap optional

Local-first adapters:

- STT: Faster Whisper or whisper.cpp
- Reasoning: Ollama
- TTS: Piper or Kokoro
- Wake word: openWakeWord or Porcupine

Cloud fallbacks:

- OpenAI transcription
- OpenAI/Claude/Gemini/Grok reasoning
- ElevenLabs or OpenAI TTS

## Product Rule

The full Jarvis-like agent belongs in CineStage Terminal/Desktop.

Ultimate DAW should only embed CineStage Brain for DAW/music-production work.
