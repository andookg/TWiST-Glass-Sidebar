# TWiST Clip Renderer

This Remotion project is created with `npx create-video@latest` and adapted as the render target for the podcast sidebar's Clip Studio.

## Commands

```bash
npm install
npm run dev
```

Render the bundled sample:

```bash
npx remotion render src/index.ts ClipSuggestion out/sample.mp4 --props src/sample-props.json
```

Render a clip suggested by the web app:

```bash
npx remotion render src/index.ts ClipSuggestion out/clip.mp4 --props ../.data/remotion-props/<clip-id>.json --duration 900
```

The app returns this command for each suggestion in `clip.remotion.renderCommand`. External agents can call `POST /api/agent/clip-handoff`, write each action's `inputProps` to `propsPath`, then run the command.
