# R8 — Unity WebGL Sandbox (Admin-Only, Sandbox-Only)

**Date:** 2026-05-22
**Status:** Shipped. Sandbox shell only. **No Unity build is committed.**
**Scope reference:** `.local/tasks/task-750.md`.

---

## 1. What shipped

| Surface | Path | Notes |
|---|---|---|
| Admin page | `client/src/pages/admin/UnityWebGLSandbox.tsx` | Lazy-loaded route, admin-only, env-isolated. |
| Route registration | `client/src/App.tsx` → `/admin/unity-webgl-sandbox` | Uses the existing `LazyAssetPage` Suspense wrapper. |
| Static slot | `client/public/unity-sandbox/README.md` | Placeholder only. No `index.html`, no `Build/`. |
| Dashboard card | `client/src/pages/admin/AdminDashboard.tsx` → 3D / 4D / Unreal zone | New link card, `dryRun` status, `Cpu` icon. |
| Library index row | `docs/library/INDEX.md` §E | Row appended pointing at this report. |

---

## 2. Sandboxing model

The admin page mounts a single `<iframe>` whose `src` is the same-origin
relative path `/unity-sandbox/index.html`. The iframe carries:

```html
sandbox="allow-scripts allow-same-origin"
referrerPolicy="no-referrer"
loading="lazy"
```

Explicitly **omitted** sandbox tokens:

- `allow-popups`
- `allow-popups-to-escape-sandbox`
- `allow-top-navigation`
- `allow-top-navigation-by-user-activation`
- `allow-forms`
- `allow-modals`
- `allow-pointer-lock`
- `allow-downloads`
- `allow-storage-access-by-user-activation`

External Unity URLs are not loadable — the `src` is a hard-coded relative
path inside the bundle. Toggle controls mount + remount; the iframe is
unmounted on route change (component teardown forces `embedActive = false`).

Hard caps:

- One iframe at a time. The page only renders a single `<iframe>` element
  when the toggle is on.
- Iframe is unmounted on route unmount (teardown effect).
- Documented memory budget: ≤ 512 MB Unity heap.
- Documented FPS cap: 30 fps via Unity `Application.targetFrameRate`
  (build-side setting).

---

## 3. postMessage allow-list

The parent registers a `window.addEventListener("message", …)` only while
the iframe is mounted, and validates every event in three layers:

1. **Source check.** `event.source` must equal the iframe's
   `contentWindow`. Anything else is dropped silently and logged
   (admin UI list + `console.warn`).
2. **Origin check.** `event.origin` must equal `window.location.origin`.
   Anything else is dropped silently and logged.
3. **Schema check.** The payload is parsed by a Zod
   `discriminatedUnion("type", …)` over:
   - `unity:ready { buildId?, unityVersion? }`
   - `unity:status { fps?, memoryMb?, message? }`
   - `unity:error { code?, message }`

   String lengths are capped (≤ 64 / 128 / 280) and numerics are clamped
   (fps ≤ 240, memoryMb ≤ 2048). Anything else is dropped silently and
   logged.

Dropped messages are recorded in an in-memory ring buffer
(last 25 entries) and surfaced in the admin UI under
**Message log**. A separate `unity_sandbox_message_log` table is **not**
created in R8 (table addition requires separate founder approval per the
task brief).

---

## 4. Out-of-scope (explicitly not shipped)

- Loading external Unity URLs.
- Production rendering, export, publishing, live broadcast.
- Provider API calls from inside the Unity build.
- Network calls from the Unity build to anything other than the same
  origin.
- Any News / Podcast / Debate / Production House integration.
- Asset-pipeline integration with R5 `production_assets`.
- Mobile / VR / AR build targets.
- Schema changes. Migration changes. New backend routes.
  Signed-URL helper. Audit-log table.

---

## 5. Files changed

| File | Change |
|---|---|
| `client/public/unity-sandbox/README.md` | **NEW** — slot placeholder + expected layout + sandbox rules + memory/FPS budget. |
| `client/src/pages/admin/UnityWebGLSandbox.tsx` | **NEW** — admin page, iframe shell, postMessage allow-list, message-log UI. |
| `client/src/App.tsx` | Added lazy import + route `/admin/unity-webgl-sandbox`. |
| `client/src/pages/admin/AdminDashboard.tsx` | Added `Cpu` icon import + new Unity sandbox link card in the 3D / 4D / Unreal zone. |
| `docs/reports/R8_UNITY_WEBGL_SANDBOX_REPORT.md` | **NEW** — this report. |
| `docs/library/INDEX.md` | Appended new row in §E pointing at this report. |

Zero backend changes. Zero schema changes. Zero migrations.
Zero changes to safe-mode flags. Zero changes to provider clients.

---

## 6. Safety envelope

| Invariant | Status |
|---|---|
| Admin-only surface (no public route) | ✅ |
| Same-origin iframe only | ✅ |
| `sandbox` attribute restricted to `allow-scripts allow-same-origin` | ✅ |
| No `allow-popups` / `allow-top-navigation` / `allow-forms` | ✅ |
| Origin allow-list on postMessage | ✅ |
| Zod-validated payload | ✅ |
| Drops logged | ✅ (in-memory + `console.warn`) |
| One iframe at a time | ✅ |
| Iframe closed on route unmount | ✅ |
| No provider call from sandbox | ✅ |
| No public URL exposure | ✅ |
| No signed URL minting | ✅ (none required — static same-origin path) |
| No real Unity build committed | ✅ (placeholder README only) |

---

## 7. Follow-ups (not in R8)

- Commit a real Unity WebGL build into `client/public/unity-sandbox/`
  (founder action). The page will detect `index.html` and load it.
- If/when persistent audit of dropped messages is required, propose a
  minimal `unity_sandbox_message_log` table under a separate task
  (requires founder approval).
- Deeper integration with R5 `production_assets` (Unity loading approved
  asset metadata) is intentionally a later task.
