# Agent Guide

This repo is designed to be easy for coding agents to clone, activate, inspect, and extend.

## Fast Activation

```bash
npm install
npm run setup
npm run activate
```

Open `http://127.0.0.1:3000`.

## Machine-Readable Project Map

Once the dev server is running, read:

```bash
curl http://127.0.0.1:3000/api/agent/brief?projectId=default
curl "http://127.0.0.1:3000/api/agent/brief?projectId=default&format=md"
```

This returns the routes, model settings, persona definitions, memory stash metadata, clip schemas, and bot handoff contracts.

## Secrets Rules

- Never commit `.env.local`, `.env`, `.data`, runtime secrets, API keys, generated videos, or `node_modules`.
- Local browser key setup writes to `.data/runtime-secrets.json`.
- Status endpoints return redacted key status only.
- Hosted deployments should use environment variables and set `BROWSER_KEY_SETUP_DISABLED=true`.

## Useful Commands

```bash
npm run doctor
npm run typecheck
npm run build
npm run verify
```

## Key Files

- `app/page.tsx`: main app UI and browser audio capture.
- `app/api/realtime/session/route.ts`: Realtime transcription session.
- `app/api/realtime/voice-session/route.ts`: Realtime voice-agent session.
- `app/api/realtime/translate-session/route.ts`: Realtime translation session.
- `app/api/agent/brief/route.ts`: agent-readable manifest.
- `lib/runtime-config.ts`: server-side runtime key and model config.
- `lib/model-router.ts`: OpenAI, OpenRouter, and custom gateway routing.
- `lib/storage-adapters.ts`: local/webhook/custom/Supabase storage.
- `remotion-clips/`: Remotion clip rendering template.

## Verification Standard

Before publishing or opening a PR, run:

```bash
npm run verify
```

If `npm run build` fails while a dev server is running, stop the dev server, remove `.next`, and rerun the build.
