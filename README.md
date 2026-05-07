# TWiST Glass Sidebar

Open-source live podcast sidebar with OpenAI Realtime transcription, four AI persona cards, two-stream recording, project memory, clip suggestions, and agent handoffs.

The app listens to a podcast/show through tab audio, microphone, or both, builds a rolling transcript, and renders a glass-style AI writer's room beside the regular stream.

## Quick Start

```bash
git clone https://github.com/andookg/TWiST-Glass-Sidebar.git
cd TWiST-Glass-Sidebar
npm install
npm run activate
```

Open `http://127.0.0.1:3000`.

Add an API key in either place:

- Open **Setup** in the app, paste a key, press Enter.
- Or set `OPENAI_API_KEY` in `.env.local`.

The app stores local UI-pasted keys in `.data/runtime-secrets.json`, which is gitignored.

## What It Does

- Captures `Tab`, `Mic`, or `Both` audio sources.
- Uses OpenAI Realtime transcription with `gpt-realtime-whisper`.
- Exposes Realtime voice sessions with `gpt-realtime-2`.
- Exposes Realtime translation sessions with `gpt-realtime-translate`.
- Routes transcript windows to four AI personas:
  - Fact-checker
  - Comedy Writer
  - News Update
  - Cynical Commentary
- Supports OpenAI Responses, OpenRouter, or a custom OpenAI-compatible gateway for persona cards.
- Includes Prompt Studio, Project Memory, Memory Stash, secure storage adapters, Clip Studio, and Remotion handoff manifests.
- Records the regular show stream or the enhanced sidebar stream as local WebM files with browser MediaRecorder.
- Exposes `/api/agent/brief` so outside agents can understand and operate the project.

## Agent Activation

Agents should read [AGENTS.md](./AGENTS.md) and [docs/AGENT_ACTIVATION.md](./docs/AGENT_ACTIVATION.md).

Once the app is running:

```bash
curl http://127.0.0.1:3000/api/agent/brief?projectId=default
curl "http://127.0.0.1:3000/api/agent/brief?projectId=default&format=md"
```

## Commands

```bash
npm run setup       # create .env.local and .data if needed
npm run activate    # setup and start local dev server
npm run dev:local   # start on 127.0.0.1:3000
npm run doctor      # repo and secret-safety checks
npm run typecheck   # TypeScript
npm run build       # production build
npm run verify      # typecheck + build
```

## Environment

```bash
OPENAI_API_KEY=
OPENAI_TRANSCRIBE_MODEL=gpt-realtime-whisper
OPENAI_PERSONA_MODEL=gpt-4o
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_REALTIME_TRANSLATE_MODEL=gpt-realtime-translate
OPENAI_REALTIME_VOICE=marin
PERSONA_PROVIDER=openai
```

Optional providers:

```bash
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/auto
AI_GATEWAY_BASE_URL=https://your-gateway.example.com
AI_GATEWAY_API_KEY=
AI_GATEWAY_MODEL=your/provider-model
```

Optional storage:

```bash
DATA_STORAGE_PROVIDER=none
DATA_STORAGE_LOCAL_PATH=.data/sidebar-events.jsonl
DATA_STORAGE_WEBHOOK_URL=https://your-webhook.example.com/events
DATA_STORAGE_CUSTOM_URL=https://your-api.example.com/events
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_TABLE=twist_sidebar_events
```

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

## API

See [docs/API.md](./docs/API.md).

Key routes:

- `POST /api/realtime/session`
- `POST /api/realtime/voice-session`
- `POST /api/realtime/translate-session`
- `POST /api/personas/analyze`
- `POST /api/clips/suggest`
- `GET /api/agent/brief`
- `GET|POST /api/memory/stash`
- `GET|POST /api/agent/clip-handoff`

## Capture Tips

- **Tab**: best for YouTube/podcast playback. Choose the show tab and enable tab audio.
- **Mic**: best for local voice testing.
- **Both**: mixes show tab audio and microphone into one Realtime stream.
- **Sample**: demos the UI without an API key.
- **Record Show**: saves the current captured show stream.
- **Record Enhanced**: asks you to share the app view and saves the sidebar-enhanced stream.

Do not share the sidebar tab into itself unless you are intentionally testing screen capture.

## Remotion Clips

`remotion-clips/` contains a Remotion template created with `npx create-video@latest`.

```bash
cd remotion-clips
npm install
npm run dev
npx remotion render src/index.ts ClipSuggestion out/sample.mp4 --props src/sample-props.json
```

## Security

Read [SECURITY.md](./SECURITY.md).

Never commit:

- `.data/`
- `.env.local`
- `.env`
- API keys
- Realtime client secrets
- generated videos
- `node_modules/`

## Open Source Release

Read [docs/OPEN_SOURCE_RELEASE.md](./docs/OPEN_SOURCE_RELEASE.md).

```bash
npm run doctor
npm run verify
git status --short
```

## License

MIT. See [LICENSE](./LICENSE).
