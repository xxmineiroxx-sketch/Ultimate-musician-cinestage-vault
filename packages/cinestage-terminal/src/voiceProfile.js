export const VOICE_PROFILE = {
  id: 'cinestage-voice-v1',
  triggerOrder: [
    {
      id: 'push_to_talk',
      status: 'recommended_first',
      reason: 'Safe for coding/build/debug workflows because it avoids accidental terminal actions.',
    },
    {
      id: 'wake_word',
      status: 'planned',
      engines: ['openWakeWord', 'Porcupine'],
      phrase: 'Hey CineStage',
    },
    {
      id: 'double_clap',
      status: 'prototype_available',
      command: 'cinestage voice:clap',
      reason: 'Useful Jarvis-like gesture, but should be secondary to push-to-talk for noisy rooms.',
    },
  ],
  speechToText: {
    localFirst: ['faster-whisper', 'whisper.cpp'],
    cloudFallback: ['OpenAI transcription'],
  },
  reasoning: {
    localFirst: ['Ollama'],
    models: ['llama3.1:8b', 'qwen2.5-coder:14b', 'gpt-oss:20b'],
    optionalApis: ['OpenAI', 'Claude', 'Gemini', 'Grok'],
  },
  textToSpeech: {
    localFirst: ['Piper', 'Kokoro'],
    cloudFallback: ['ElevenLabs', 'OpenAI TTS'],
  },
  safety: {
    defaultMode: 'listen_and_answer',
    approvalRequiredFor: [
      'file edits',
      'terminal command execution',
      'build/test execution',
      'dependency installation',
      'deployments',
      'secrets',
      'destructive commands',
      'hardware control',
    ],
  },
};

export function voiceProfileMarkdown() {
  return [
    '# CineStage Voice Profile',
    '',
    `Profile: ${VOICE_PROFILE.id}`,
    '',
    '## Trigger Order',
    '',
    ...VOICE_PROFILE.triggerOrder.map((trigger) => `- ${trigger.id}: ${trigger.status}${trigger.phrase ? ` (${trigger.phrase})` : ''}${trigger.command ? ` (${trigger.command})` : ''}`),
    '',
    '## Speech-To-Text',
    '',
    `- Local first: ${VOICE_PROFILE.speechToText.localFirst.join(', ')}`,
    `- Cloud fallback: ${VOICE_PROFILE.speechToText.cloudFallback.join(', ')}`,
    '',
    '## Reasoning',
    '',
    `- Local first: ${VOICE_PROFILE.reasoning.localFirst.join(', ')}`,
    `- Models: ${VOICE_PROFILE.reasoning.models.join(', ')}`,
    `- Optional APIs: ${VOICE_PROFILE.reasoning.optionalApis.join(', ')}`,
    '',
    '## Text-To-Speech',
    '',
    `- Local first: ${VOICE_PROFILE.textToSpeech.localFirst.join(', ')}`,
    `- Cloud fallback: ${VOICE_PROFILE.textToSpeech.cloudFallback.join(', ')}`,
    '',
    '## Safety',
    '',
    `- Default mode: ${VOICE_PROFILE.safety.defaultMode}`,
    ...VOICE_PROFILE.safety.approvalRequiredFor.map((item) => `- Approval required for: ${item}`),
    '',
  ].join('\n');
}
