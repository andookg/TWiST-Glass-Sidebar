# API

All routes are Next.js route handlers under `app/api`.

## Agent and Project

- `GET /api/agent/brief?projectId=default`
  - Machine-readable manifest for agents.
- `GET /api/agent/brief?projectId=default&format=md`
  - Markdown version of the same brief.
- `GET /api/project-context`
  - Safe project capability summary.

## Realtime

- `POST /api/realtime/session`
  - Creates a Realtime transcription client secret.
  - Default model: `gpt-realtime-whisper`.
- `POST /api/realtime/voice-session`
  - Creates a speech-to-speech Realtime client secret.
  - Default model: `gpt-realtime-2`.
- `POST /api/realtime/translate-session`
  - Creates a live translation Realtime client secret.
  - Default model: `gpt-realtime-translate`.
  - Optional body: `{ "outputLanguage": "English", "voice": "marin" }`.

## Personas

- `POST /api/personas/analyze`
  - Body: `{ transcriptWindow, activePersonas, modelRouter, promptStudio, projectMemory, showMetadata }`
  - Returns: `{ cards }`.

## Clips

- `POST /api/clips/suggest`
  - Body: `{ transcriptWindow, personaCards, modelRouter, promptStudio, projectMemory }`
  - Returns clip candidates with Remotion props.
- `GET /api/agent/clip-handoff`
  - Returns schema and bot action contract.
- `POST /api/agent/clip-handoff`
  - Converts clip suggestions into render actions.

## Runtime and Storage

- `GET /api/model-router`
  - Safe provider readiness metadata.
- `GET /api/runtime-config`
  - Redacted local key setup status.
- `POST /api/runtime-config`
  - Local-only runtime key and model setup.
- `GET /api/memory/stash`
  - Local memory stash metadata.
- `POST /api/memory/stash`
  - Attach or clear local memory files/folders.
- `GET /api/storage/status`
  - Storage readiness metadata.
- `POST /api/storage/events`
  - Saves allowed event types to the configured storage adapter.
