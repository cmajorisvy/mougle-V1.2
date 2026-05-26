# Mougle Studio Pro Mac App Report

## v0.2.0 Native Electron App Status

Mougle Studio Pro v0.2.0 is now configured as a proper Electron desktop app. The packaged app launches a native Electron `BrowserWindow` titled `Mougle Studio Pro`; it does not open the built `index.html` in an external browser and does not use the v0.1.0 fake `.app` shell script.

The Electron main process lives at:

```text
apps/mougle-studio-pro/electron/main.cjs
```

The preload bridge lives at:

```text
apps/mougle-studio-pro/electron/preload.cjs
```

The preload exposes only safe metadata/helper APIs:

- App info and version.
- Platform.
- Default downloads folder.
- Open downloads folder helper.

It does not expose raw filesystem access, secrets, tokens, or shell execution.

The v0.2.0 packaging flow builds a clean Electron payload before running electron-builder. The payload includes only the Electron shell, the built Vite app, and minimal package metadata; it does not include root `node_modules`, `.env` files, database dumps, API keys, client downloads, or provider tokens.

## Summary

Mougle Studio Pro is a macOS-focused desktop controller and preview application for the Mougle Production House workflow. It is built as a React + TypeScript app packaged with Electron for macOS.

Tauri was preferred originally, but the current repo did not include Tauri packages, `src-tauri`, or a committed Rust/Tauri build setup. Electron was faster to implement in this repo, so v0.2.0 uses Electron.

## Framework Used

- UI: React + TypeScript + Vite.
- Desktop shell: Electron `BrowserWindow`.
- Packager: electron-builder.
- Native bridge: restricted Electron preload.
- Future native hardening: code signing, notarization, and Keychain-backed token storage if token auth is added.

## How To Run Locally

Run the Mougle API server in one terminal:

```bash
npm run dev
```

Run Mougle Studio Pro in native Electron dev mode in another terminal:

```bash
npm run mac:dev
```

The dev script starts Vite at `http://127.0.0.1:5177` and opens it inside an Electron `BrowserWindow`.

## How To Build And Package For Mac

Build the web app:

```bash
npm run mac:build
```

Create the native Electron Mac app and ZIP:

```bash
npm run mac:package
```

Output:

```text
dist/mac/Mougle Studio Pro.app
dist/mac/Mougle-Studio-Pro-mac.zip
```

Create the full Mac distribution, including `.dmg` when electron-builder supports it locally:

```bash
npm run mac:dist
```

Possible output:

```text
dist/mac/Mougle-Studio-Pro.dmg
```

If the local macOS environment cannot create disk images, `mac:dist` falls back to the native `.app` plus ZIP package and still writes the release folder.

The app is not code-signed or notarized yet.

## How To Open The App

After packaging, open:

```text
dist/mac/Mougle Studio Pro.app
```

or unzip:

```text
dist/mac/Mougle-Studio-Pro-mac.zip
```

then open `Mougle Studio Pro.app`.

If macOS blocks the unsigned app, Control-click the app, choose `Open`, then confirm. Only do this for a build produced from your own Mougle workspace.

## Troubleshooting A Blank Window

If the window is blank:

1. Run `npm run mac:build`.
2. Confirm `dist/mougle-studio-pro/index.html` exists.
3. Confirm the built `index.html` uses relative `./assets/...` paths, not absolute `/assets/...` paths.
4. Run `npm run mac:package`.
5. Run `npm run mac:smoke`.
6. Confirm the app contains:
   - `Contents/Resources/app/dist/mougle-studio-pro/index.html`
   - `Contents/Resources/app/dist/mougle-studio-pro/assets/*.js`
   - `Contents/Resources/app/dist/mougle-studio-pro/assets/*.css`

The Electron main process loads the packaged file with `BrowserWindow.loadFile(...)`; it does not call macOS `open` on the HTML file.

## v0.1.0 Fallback vs v0.2.0 Native

v0.1.0 created a lightweight `.app` wrapper that opened the packaged `index.html`, which could appear as a raw `file://` browser page. v0.2.0 replaces that with a real Electron application bundle. The app executable is Electron, and the UI is rendered inside a native macOS window.

## Mougle API Connection

Settings allow configuration of:

- Mougle API base URL.
- Login/session status mode.
- Download folder.
- Local Cinema 4D script folder.
- Local export folder.
- Locked safety mode.

API calls use session/cookie credentials. Mutating requests obtain `/api/auth/csrf-token` and send `X-CSRF-Token`, matching the existing Mougle admin API helper behavior.

Raw secrets are not stored in local storage. Future native Tauri builds should use macOS Keychain for token storage if token auth is added.

## Modules Implemented

- Dashboard
- Production Preview Studio
- Cinema 4D Studio
- Newsroom Creator
- Podcast Room Creator
- Avatar Studio
- Media Package Studio
- Unreal Dry-Run Studio
- 4D Sandbox Studio
- Settings

## Cinema 4D Downloads

Cinema 4D Studio connects to safe Mougle endpoints:

- `GET /api/admin/production-house/cinema4d-studio/templates`
- `POST /api/admin/production-house/cinema4d-studio/generate-room-manifest`
- `POST /api/admin/production-house/cinema4d-studio/generate-avatar-manifest`
- `POST /api/admin/production-house/cinema4d-studio/generate-script`
- `POST /api/admin/production-house/cinema4d-studio/generate-room-character-script`
- `GET /api/admin/production-house/cinema4d-studio/:roomId/download-script`
- `GET /api/admin/production-house/cinema4d-studio/:roomId/download-package`
- `POST /api/admin/production-house/cinema4d-studio/:roomId/open-preview-with-character`

Download buttons:

- `Download Cinema 4D Script`
- `Download Production Package ZIP`
- `Open in Finder`

The native Electron build exposes a safe downloads-folder helper through preload, and the React UI calls that helper for `Open in Finder` when running inside the packaged app.

## Safety Guarantees

The app is a controller and preview tool only. It does not enable:

- Real Unreal execution.
- Real video rendering.
- Movie Render Queue.
- Sequencer start.
- Unreal asset import.
- Real 4D hardware commands.
- Publishing.
- YouTube upload.
- Social posting.
- Live streaming.

The app API client refuses known live execution endpoints before any network call is made. All output records are treated as draft/internal and must keep:

- `status:"draft"`
- `approvalStatus:"draft"`
- `visibility:"admin_only_internal"`
- `publicUrl:null`
- `signedUrl:null`
- `realSendAllowed:false`
- `executionEnabled:false`
- `adminPreviewOnly:true` where preview-related
- `notRendered:true` where preview-related
- `notPublished:true` where preview-related
- `noUnrealExecution:true` where preview-related
- `noFourDHardware:true` where preview-related
- `safetyEnvelope` present

## Test Coverage

Focused Mac app tests cover:

- App shell renders.
- Settings save/load.
- API client sends CSRF for mutating requests.
- Cinema 4D script download client path.
- Cinema 4D package ZIP download client path.
- Preview state load.
- Safety field locking.
- Live Unreal endpoint refusal.
- Real 4D endpoint refusal.
- Publishing endpoint refusal.

Run:

```bash
NODE_ENV=test node --import tsx --test tests/mougle-studio-pro.test.tsx
```

## Human 3D / 4D Expert Review Required

Mougle Studio Pro previews placeholder geometry and draft manifests only. Human 3D/4D expert review is still required for final character rigs, Cinema 4D materials, lighting, camera blocking, render settings, animation/lip-sync, hardware cue timing, DMX/OSC/MIDI mappings, venue safety checks, and publishing approval workflows.

## Limitations

- This phase uses Electron, not Tauri.
- No secure keychain token storage is implemented because token auth is not added in this phase.
- The package is not notarized or code-signed.
- DMG creation depends on local electron-builder/macOS disk-image support; the current sandbox can package `.app` and `.zip`, but `hdiutil` can fail with `Device not configured`.
- The app depends on the Mougle API server for real admin data.
- All production workflows remain draft/internal-only.
