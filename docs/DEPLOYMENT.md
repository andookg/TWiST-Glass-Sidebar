# Deployment

This app is local-first by default. For hosted deployments, keep secrets in the server environment and disable browser key setup.

## Required

```bash
OPENAI_API_KEY=sk-proj-...
BROWSER_KEY_SETUP_DISABLED=true
```

## Recommended Defaults

```bash
OPENAI_TRANSCRIBE_MODEL=gpt-realtime-whisper
OPENAI_PERSONA_MODEL=gpt-4o
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_REALTIME_TRANSLATE_MODEL=gpt-realtime-translate
OPENAI_REALTIME_VOICE=marin
PERSONA_PROVIDER=openai
```

## Optional Persona Providers

OpenRouter:

```bash
PERSONA_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=openrouter/auto
```

Custom OpenAI-compatible gateway:

```bash
PERSONA_PROVIDER=custom
AI_GATEWAY_BASE_URL=https://your-gateway.example.com
AI_GATEWAY_API_KEY=...
AI_GATEWAY_MODEL=your/provider-model
```

## Optional Storage

```bash
DATA_STORAGE_PROVIDER=none
```

Other values: `local`, `webhook`, `custom`, `supabase`.

Hosted deployments should avoid `DATA_STORAGE_PROVIDER=local` unless the host has persistent disk.

## Build

```bash
npm ci
npm run build
npm run start
```

## Browser Requirements

Live capture requires a browser that supports:

- `getDisplayMedia`
- tab audio sharing
- microphone permission when using `Mic` or `Both`
- WebRTC
