# Unity WebGL Sandbox Build Slot (R8)

This directory is the **reserved static slot** for a future committed Unity WebGL
build artifact. R8 does **not** ship a real Unity build — this is an
admin-only sandbox shell with a placeholder until a founder drops a build in.

## Expected file layout

When a Unity WebGL build is added later, the Unity editor (Build Settings →
WebGL → Build) is expected to produce a `Build/` subdirectory next to an
`index.html`. The minimal expected file shape is:

```
client/public/unity-sandbox/
├── README.md              (this file)
├── index.html             (Unity-generated bootstrap, served same-origin)
└── Build/
    ├── Build.loader.js    (Unity loader)
    ├── Build.framework.js (Unity framework)
    ├── Build.data         (Unity data bundle)
    └── Build.wasm         (Unity WebAssembly module)
```

(Filename prefix `Build` is the Unity default; if the Unity build name
differs, all four files share the same custom prefix.)

## Hard sandboxing rules

The admin page that embeds this slot (`/admin/unity-webgl-sandbox`) enforces:

- iframe `sandbox="allow-scripts allow-same-origin"` only.
  **No** `allow-popups`, `allow-top-navigation`, `allow-forms`,
  `allow-modals`, `allow-pointer-lock`, `allow-downloads`.
- Same-origin only. The iframe `src` is always a relative path under
  `/unity-sandbox/`. Loading arbitrary external Unity URLs is refused.
- `postMessage` allow-list. The parent only accepts messages whose
  `event.origin` matches `window.location.origin` and whose payload passes
  a strict Zod schema. Everything else is dropped silently and logged.
- One iframe at a time. The iframe is unmounted on route change.
- No provider calls from the Unity build. No network calls to anything
  other than the same origin.
- No public surface. The page is admin-only and not surfaced to users.

## Memory & FPS budget (documented)

- Target memory budget: **≤ 512 MB** Unity heap (set in Unity
  Player Settings → WebGL → Memory Size or via `unityInstance` config).
- Target FPS cap: **30 fps** for preview workloads, capped via
  `Application.targetFrameRate = 30;` in the Unity build's bootstrap
  scene. Higher rates are not appropriate for an admin preview surface.
- DPR cap: handled by the iframe page (Unity-side `devicePixelRatio`
  override).
- One simultaneous iframe instance only. Closed on route unmount.

## Status

- **R8 phase:** placeholder only. No `index.html`, no `Build/` directory.
- **Founder action:** drop a Unity-generated WebGL build here later;
  the admin page will detect `index.html` and load it inside the
  sandboxed iframe.
