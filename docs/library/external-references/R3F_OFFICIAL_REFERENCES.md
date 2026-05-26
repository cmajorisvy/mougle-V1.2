# React Three Fiber (R3F) — Official Reference Links

> Pinned upstream documentation for [`@react-three/fiber`](https://r3f.docs.pmnd.rs).
> This file is a **link index only** — it is reference material for engineers
> working on the R3F-backed surfaces (R3 sandbox, R5 asset library, R6 virtual
> sets, R7 avatar rig preview, R9 Production House 3D tab, R10 verification).
> It contains no code, no schema, and no behavioral guidance that overrides
> in-repo policy. When upstream docs and Mougle policy disagree, **Mougle
> policy wins** (admin-only, private storage, no public URLs, no provider
> calls, signed-URL TTL ≤ 900 s, etc.).

## Getting started

| Topic | URL |
|---|---|
| Installation | https://r3f.docs.pmnd.rs/getting-started/installation |
| Introduction | https://r3f.docs.pmnd.rs/getting-started/introduction |
| Community R3F components | https://r3f.docs.pmnd.rs/getting-started/community-r3f-components |

## API

| Topic | URL |
|---|---|
| Canvas | https://r3f.docs.pmnd.rs/api/canvas |
| Objects | https://r3f.docs.pmnd.rs/api/objects |
| Hooks | https://r3f.docs.pmnd.rs/api/hooks |
| Events | https://r3f.docs.pmnd.rs/api/events |
| TypeScript | https://r3f.docs.pmnd.rs/api/typescript |
| Testing | https://r3f.docs.pmnd.rs/api/testing |

## Advanced

| Topic | URL |
|---|---|
| Scaling performance | https://r3f.docs.pmnd.rs/advanced/scaling-performance |
| Pitfalls | https://r3f.docs.pmnd.rs/advanced/pitfalls |

## Tutorials

| Topic | URL |
|---|---|
| Loading models | https://r3f.docs.pmnd.rs/tutorials/loading-models |
| Loading textures | https://r3f.docs.pmnd.rs/tutorials/loading-textures |
| Basic animations | https://r3f.docs.pmnd.rs/tutorials/basic-animations |
| Events and interaction | https://r3f.docs.pmnd.rs/tutorials/events-and-interaction |
| How it works | https://r3f.docs.pmnd.rs/tutorials/how-it-works |
| v9 migration guide | https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide |

## Usage notes (Mougle-specific)

These are not from upstream — they are the in-repo guardrails every
R3F-backed surface must follow:

- All R3F surfaces are **admin-only**. No public route renders R3F.
- 3D assets are served from **private object storage** via **ephemeral
  signed preview URLs** (TTL clamped to ≤ 900 s, never persisted).
- `publicUrl` on `productionAssets` is always `null` (Drizzle default +
  CHECK constraint + route serializer).
- Approval gate terminates at `approved_internal`; `approved_public` is
  **not** an in-code state.
- No provider clients (HeyGen, ElevenLabs, Runway, etc.) may be called
  from R3F surfaces.
- R10 invariant suite (`tests/r10-r3f-3d-4d-safety-invariants.test.ts`)
  enforces the above at CI time.

## Related in-repo documents

- `docs/reports/R3F_REAL_3D_ASSET_LIBRARY_R5C_REPORT.md` — R5K verification
- `docs/reports/R6_VIRTUAL_SET_PREVIEW_DESIGN_REPORT.md` — virtual set design
- `docs/reports/R7_AVATAR_RIG_VISUAL_PREVIEW_REPORT.md` — avatar rig preview
- `docs/reports/R9_PRODUCTION_HOUSE_R3F_INTEGRATION_REPORT.md` — Production House 3D tab
- `docs/reports/R10_R3F_3D_4D_E2E_SAFETY_PERFORMANCE_REPORT.md` — full safety + perf E2E
