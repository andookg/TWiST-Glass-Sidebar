# Agent Activation

Use this when an agent, contributor, or evaluator downloads the repo and needs it running quickly.

## One-Command Path

```bash
npm install
npm run activate
```

`npm run activate` creates `.env.local` if it is missing, creates `.data`, and starts the app on `http://127.0.0.1:3000`.

## Manual Path

```bash
npm install
npm run setup
npm run dev:local
```

## Add an API Key

You can use either path:

- UI: open **Setup**, paste an OpenAI/OpenRouter/custom gateway key, press Enter.
- Env: copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`.

The UI stores keys server-side in `.data/runtime-secrets.json`; it does not store keys in browser localStorage.

## Prove It Works

Without a key:

```bash
npm run doctor
```

With a valid OpenAI key and the server running:

```bash
curl -X POST http://127.0.0.1:3000/api/realtime/session
curl http://127.0.0.1:3000/api/agent/brief?projectId=default
```

Do not print or commit returned client secrets.

## Agent Brief

The canonical machine-readable map is:

```bash
GET /api/agent/brief?projectId=default
```

It includes:

- public API routes
- current model routing
- OpenAI Realtime model names
- personas
- memory stash summaries
- clip and Remotion schemas
- bot handoff actions
