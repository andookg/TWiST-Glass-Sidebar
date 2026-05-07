# Promo Video

Optional Remotion project for rendering a short product promo for TWiST Glass Sidebar.

This is not required to run the web app. It is included so agents and contributors can regenerate demo assets when publishing the open-source project.

## Commands

```bash
npm install
npm run dev
```

Render:

```bash
npx remotion render src/index.ts PromoVideo out/promo.mp4
```

## Notes

- `public/voiceover.wav` is the bundled demo narration.
- Generated videos under `out/` are ignored.
- The main app lives at the repository root.
