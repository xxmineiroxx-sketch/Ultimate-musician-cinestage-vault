# CineStage Terminal Local AI Resources - 2026-08-22

## Decision

CineStage Terminal/Desktop should be local-first and provider-flexible:

- Ollama for local reasoning and coding assistance.
- whisper.cpp or faster-whisper for offline speech-to-text.
- Piper or Kokoro for local text-to-speech.
- openWakeWord for a future "Hey CineStage" trigger.
- Cloudflare Sandbox SDK as a future remote isolated execution lane when local desktop is unavailable.
- Optional external model APIs for OpenAI, Claude, Gemini, and Grok.

## Product Boundary

Ultimate DAW embedded CineStage Brain stays scoped to app actions: stems, charts, mixer scenes, cue planning, playback readiness, and worship workflow help.

CineStage Terminal/Desktop is the full computer agent: code, build, debug, project memory, repo inspection, terminal workflows, and cross-project organization.

## Resource Notes

- Ollama exposes a local API at `http://localhost:11434/api`, which is the right base for local model routing.
- whisper.cpp is strong for Apple Silicon/local offline speech recognition and supports Metal/Core ML acceleration.
- Piper is a fast local neural TTS engine with available Portuguese and English voices.
- openWakeWord supports local wake word detection and can be trained/customized later.
- Cloudflare Sandbox SDK can run commands and code in isolated Workers-backed containers for remote fallback execution.

## Current Implementation

The repo now has `packages/cinestage-terminal`, a Node CLI that can:

- Read Graphify project index.
- Search Obsidian memory.
- Diagnose project scripts.
- Gate script execution behind `--approve`.
- Detect local/optional providers.
- Fall back to deterministic memory answers when Ollama is offline.
- Run an optional local double-clap trigger that launches a safe CineStage Terminal command.

Quick commands:

```bash
npm run cinestage -- status
npm run cinestage -- projects cinestage-terminal
npm run cinestage -- ask "what should I inspect next?" --project cinestage-terminal
npm run cinestage -- diagnose ultimate_daw
npm run cinestage -- run ultimate_daw build --approve
npm run cinestage -- voice
npm run cinestage:voice:clap
```

## Local Jarvis Reference Scan

User-provided folder: `/Users/studio/Downloads/jarvis-main`.

Useful ideas recovered:

- Double-clap can be a practical local trigger before wake-word training is ready.
- Mic probing and noise-floor adaptation matter because default input devices can be silent or noisy.
- Voice responses should cache generated audio where possible.
- App/window launching must be treated as a user-facing convenience, not as the core agent brain.

What was not adopted directly:

- The reference is Windows-oriented and opens Spotify, Chrome, Claude, Binance, and Cursor. CineStage should not ship with unrelated app launch behavior.
- It relies on ElevenLabs for the welcome line. CineStage should prefer local TTS first, with ElevenLabs or OpenAI TTS as optional fallback.
- It is not a coding/build/debug agent. CineStage Terminal keeps that responsibility in the guarded CLI.
