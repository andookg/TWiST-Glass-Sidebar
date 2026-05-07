# Open Source Release Checklist

Use this before pushing to a public repo.

## Required Checks

```bash
npm run doctor
npm run verify
git status --short
```

## Must Not Be Committed

- `.data/`
- `.env`
- `.env.local`
- `.env*.local`
- `.next/`
- `node_modules/`
- generated videos under `out/`
- API keys or Realtime client secrets

## GitHub Setup

```bash
git remote -v
git branch -M main
git add .
git commit -m "Prepare open-source TWiST Glass Sidebar"
git push -u origin main
```

## First Issue Labels

- `bug`
- `docs`
- `good first issue`
- `realtime`
- `persona`
- `clip-studio`
- `security`

## Suggested Repo Description

Open-source live podcast sidebar with OpenAI Realtime transcription, AI persona cards, project memory, and agent handoffs.
