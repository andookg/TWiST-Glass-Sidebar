# Contributing

Thanks for helping improve TWiST Glass Sidebar.

## Local Setup

```bash
npm install
npm run setup
npm run dev:local
```

Open `http://127.0.0.1:3000`.

## Before You Open a PR

```bash
npm run doctor
npm run verify
```

Keep changes focused. Avoid committing generated data, local secrets, build output, or `node_modules`.

## Development Notes

- Use the in-app **Setup** panel or `.env.local` for local keys.
- Use **Sample** mode for UI work without API keys.
- Use **Tab** or **Both** capture for real podcast demos.
- `POST /api/personas/analyze` falls back to demo cards when no persona model is configured.
- `GET /api/agent/brief` is the best entry point for other agents.

## Reporting Bugs

Include:

- what capture mode you used: `Tab`, `Mic`, or `Both`
- browser and OS
- whether `npm run doctor` passed
- any redacted error message from the UI or terminal
