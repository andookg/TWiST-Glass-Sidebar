# Security

## Supported Version

This project is pre-1.0. Security fixes land on `main`.

## Secret Handling

- Do not commit API keys.
- Do not commit `.env.local`, `.env`, `.data`, build output, or generated videos.
- Local key setup stores provider keys in `.data/runtime-secrets.json`, which is gitignored.
- Runtime status routes expose only redacted key metadata.
- Hosted deployments should set `BROWSER_KEY_SETUP_DISABLED=true` and provide secrets through environment variables.

## Reporting a Vulnerability

Open a private security advisory on GitHub when available, or contact the repository owner directly. Do not include live API keys, user audio, transcript data, or private memory files in public issues.

## Data Flow Summary

- Browser audio streams to OpenAI Realtime through ephemeral client secrets.
- Standard API keys stay server-side.
- Project memory and memory stash previews are local by default.
- Optional storage adapters post only allowed event payloads and redact secret-looking fields.
