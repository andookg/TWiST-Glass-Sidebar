# Desktop App

Run the native wrapper when browser tab/microphone capture is blocked by the in-app browser:

```bash
npm run desktop
```

The wrapper starts the local Next app at `http://127.0.0.1:3000`, opens it in Electron, and asks macOS for microphone permission. Screen/tab capture uses Electron display capture, so macOS may also ask for Screen Recording permission in System Settings.

To build the drag-to-Applications macOS installer and a local `.app` bundle:

```bash
npm run desktop:pack
open dist-desktop
```

The build creates:

- `dist-desktop/TWiST Glass Sidebar-0.1.0-arm64.dmg`
- `dist-desktop/mac-arm64/TWiST Glass Sidebar.app`

Open the `.dmg`, then drag **TWiST Glass Sidebar** into **Applications**.

If macOS already denied Screen Recording, open:

`System Settings -> Privacy & Security -> Screen & System Audio Recording`

Then allow **TWiST Glass Sidebar** or **Electron**, quit the app, and run `npm run desktop` again.
