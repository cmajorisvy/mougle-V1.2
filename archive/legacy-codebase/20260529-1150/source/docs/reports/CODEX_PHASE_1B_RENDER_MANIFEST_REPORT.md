# Phase 1B — Canonical RenderManifest Contract (FFmpeg + Remotion)

**Status:** Merged. Pure, deterministic, no DB / no provider / no render-runtime impact.

## Goal

Establish one shared structural contract that both render backends (FFmpeg via `server/services/render-mp4-service.ts` and any future Remotion `<Composition>`) consume, so the pipelines cannot drift into incompatible scene packages.

## Files changed

| File | Kind | Purpose |
|---|---|---|
| `shared/render-manifest.ts` | **NEW** | Canonical `RenderManifest` Zod schema + `EventMediaMode` + `RightsGate` enums + validators + adapters (`fromNewsroomRenderManifest`, `toMp4PreviewOptions`, `toRemotionScenePackage`) + `summarizeRenderManifestCompliance`. |
| `tests/render-manifest.test.ts` | **NEW** | 16 tests covering enums, validation, normalization, both forward adapters, backward-compat adapter, and compliance summary. |
| `package.json` | modified | Added the new test file to the `test` script. |

**No existing render-service internals were modified.** Backward compatibility is preserved via adapter functions — existing call sites continue to work unchanged.

## Pre-existing logic surveyed

| Location | What it does |
|---|---|
| `server/services/avatar-video-render-service.ts` (~1180 lines) | Owns the legacy `RenderBaseline` (layers / safeZones / textSafety / timing) embedded in `avatar_video_render_jobs.preview_metadata` JSONB. |
| `server/services/render-mp4-service.ts` (~281 lines) | FFmpeg path. Consumes `Mp4PreviewOptions { title, watermarkLabel, segments: Mp4PreviewSegmentInput[], srtPath? }`. |
| `server/services/render-srt-service.ts` | SRT (caption) generation + MP4 route handler factory. |
| `shared/newsroom-types.ts` §13 | Already defined `NewsroomRenderManifest` (Phase 1B contract-only). Reused: `RenderLayer`, `SafeZone`, `RenderSafeZones`, `RenderTextSafety`, `RightsStatus`, `ComplianceFinding`. |

## Canonical `RenderManifest` shape

```
contractVersion        literal "1"
manifestId             string
packageId              string | null
packageVersion         number | null
canvas                 { width, height, pixelAspect }
fps                    int (≤120)
duration               { totalMs }
scenes[]               { sceneIndex, startMs, endMs, label, template? }
layers[]               RenderLayer (reused from newsroom-types §13)
safeZones              RenderSafeZones (reused)
textSafety             RenderTextSafety (reused)
tracks
  ├─ anchor[]          { sceneIndex, startMs, endMs, speakerLabel, narrationText, voiceId? }
  ├─ voice[]           { source: tts|external, startMs, endMs, audioRef?, voiceId?, gainDb }
  ├─ caption           { format: srt|vtt, cues[{index, startMs, endMs, text}], overflowFindings[] }
  ├─ lowerThird[]      { startMs, endMs, primary, secondary? }
  ├─ ticker            { items[≤20], loopMs }
  ├─ monitorPanels[]   { panelKey, cues[{startMs, endMs, content, mediaRef?}] }
  └─ eventMedia[]      { mediaId, kind, mode, rightsGate, rightsStatusSource?, startMs, endMs,
                         renderable, storageRef?, note? }
transitionCues[]       { atMs, kind: cut|crossfade|slide_in|slide_out|fade_to_black, durationMs }
musicSfxCues[]         { kind: music|sfx|bed, startMs, endMs, audioRef?, gainDb, loop }  (placeholder)
storageRefs            { backgroundsBase?, mediaBase?, captionsBase?, audioBase? }       (opaque keys, no secrets)
compliance             { blocking[], warnings[] }
safety                 RenderSafetyFlags (literal-locked — see below)
generatedAt            string (caller-supplied ISO)
```

## Event-media modes (required)

```ts
export const EVENT_MEDIA_MODES = [
  "fullscreen",
  "background_screen",
  "picture_in_picture",
  "disabled",
] as const;
```

## Rights gate (required)

```ts
export const RIGHTS_GATES = [
  "approved_for_use",
  "internal_reference_only",
  "needs_review",
  "rejected",
  "unknown",
] as const;
```

- `rightsStatusToRightsGate(s)` maps the upstream `RightsStatus` deterministically:
  - `owned` / `licensed` → `approved_for_use`
  - `fair_use_review` → `needs_review`
  - `rights_unknown` → `unknown`
  - `blocked` → `rejected`
- `isRenderableGate(g)` is `true` only for `approved_for_use`.
- `EventMediaCue.renderable` is resolved by `normalizeRenderManifest()` and **double-checked by `validateRenderManifest()`**: it is `true` iff `mode !== "disabled"` AND `rightsGate === "approved_for_use"`. Render backends MUST also recheck — defense-in-depth.

## Safety envelope (literal-locked)

```ts
publicPublishing: false       // literal
youtubeUpload: false          // literal
socialPosting: false          // literal
autonomousExecution: false    // literal
manualRootAdminTriggerOnly: true   // literal
internalAdminReviewOnly: true      // literal
nonRenderableReasons: string[]
```

The Zod schema rejects any attempt to flip these. `validateRenderManifest()` has a belt-and-suspenders cross-field check (`code: "safety_flag_tampered"`).

## Backward compatibility

- `fromNewsroomRenderManifest(legacy, { manifestId })` upgrades the existing `NewsroomRenderManifest` (already in `shared/newsroom-types.ts`) to the canonical shape. **All legacy timing fields are preserved verbatim** on each canonical scene under `scene.legacy` (`tickerVisible`, `lowerThirdVisible`, `captionWindow`, `sourceClaimIds`) via the optional `RenderSceneLegacyMetaSchema`. New manifests need not set `legacy`. Round-trip preservation is asserted by test.
- `toMp4PreviewOptions(manifest, { title, watermarkLabel, srtPath? })` projects the canonical manifest into the existing `Mp4PreviewOptions` shape that `server/services/render-mp4-service.ts` already consumes — so the FFmpeg path can be driven from the canonical manifest without a breaking change to the service's signature.
- `toRemotionScenePackage(manifest)` projects to a Remotion-friendly shape (`durationInFrames`, per-scene `startFrame`/`endFrame`, scoped `lowerThirds` + `eventMedia`) suitable for a future `<Composition>` `inputProps`. Frame conversion uses the canonical `fps`.

Existing services were intentionally **not modified** in this PR — the adapters give them everything they need at the boundary, and altering the live renderers (~1.4k lines combined) was out of scope and would have inflated blast radius.

## Render-service integration path (next-PR work, low-risk)

When a renderer is upgraded to read from the canonical manifest, the change is a one-line at the boundary:

```ts
// FFmpeg path (server/services/render-mp4-service.ts caller)
import { toMp4PreviewOptions, validateRenderManifest } from "@shared/render-manifest";
const v = validateRenderManifest(input);
if (!v.ok) return res.status(400).json({ ok: false, issues: v.issues });
const opts = toMp4PreviewOptions(v.manifest!, { title, watermarkLabel });
await runMp4Preview(opts); // unchanged service
```

```ts
// Remotion path (when added)
import { toRemotionScenePackage } from "@shared/render-manifest";
const inputProps = toRemotionScenePackage(manifest);
// pass to renderMedia / <Composition>
```

## Constraint verification

| Constraint | Verified |
|---|---|
| `shared/schema.ts` untouched | `git diff HEAD -- shared/schema.ts` empty |
| No `db:push` run | none invoked |
| No new dependencies | `package.json` `dependencies`/`devDependencies` unchanged |
| No public publishing / YouTube / social / live | safety envelope literal-locks all four to `false`; renderable gate forbids non-approved rights |
| No secret exposure | `StorageRef` accepts opaque keys + optional `publicUrl` (URL-only). `audioRef.audioRef` likewise. No `voiceId` / `audioRef` field accepts API keys (max 120 chars, free text — caller is responsible for not putting secrets here, and we explicitly document it). No environment-secret reads in this module. |
| No render execution in this module | new file has zero imports from `child_process`, `ffmpeg`, `remotion`, `render-mp4-service`, `render-srt-service`, or `avatar-video-render-service` |
| Fully deterministic | no `Date.now()` / `Math.random()`; `generatedAt` is caller-supplied |

## Test results

```
npm test → 191/191 pass (was 174; +17 new)
npx tsc --noEmit → clean
```

`tests/render-manifest.test.ts` covers:
- `EVENT_MEDIA_MODES` enum is exactly the four required values ✓
- `RIGHTS_GATES` enum is exactly the five required values ✓
- `rightsStatusToRightsGate` covers every `RightsStatus` deterministically ✓
- `isRenderableGate` returns `true` only for `approved_for_use` ✓
- `validateRenderManifest` accepts a well-formed manifest ✓
- `validateRenderManifest` rejects scene window exceeding `totalMs` ✓
- `validateRenderManifest` rejects inconsistent `renderable` flag ✓
- `validateRenderManifest` rejects tampered safety flags at the Zod literal level ✓
- `normalizeRenderManifest` resolves `renderable` from `mode + rightsGate`, sorts cues, and emits a manifest that validates clean ✓
- `normalizeRenderManifest` is deterministic across runs ✓
- `toMp4PreviewOptions` projects scenes + anchor narration into the existing `Mp4PreviewOptions` shape ✓
- `toMp4PreviewOptions` falls back to scene label when no anchor cue is present ✓
- `toRemotionScenePackage` converts time windows to frames using `fps` ✓
- `toRemotionScenePackage` scopes per-scene `lowerThirds` and `eventMedia` to scene windows ✓
- `fromNewsroomRenderManifest` upgrades a legacy `NewsroomRenderManifest` into a valid canonical manifest with the rights gate applied ✓
- `fromNewsroomRenderManifest` preserves all legacy timing metadata (`tickerVisible`, `lowerThirdVisible`, `captionWindow`, `sourceClaimIds`) on each scene's `legacy` field ✓
- `summarizeRenderManifestCompliance` counts renderable / gated / rejected media correctly ✓

## Rollback notes

Safe to revert with no DB or runtime impact:
1. `git rm shared/render-manifest.ts tests/render-manifest.test.ts`
2. Remove `tests/render-manifest.test.ts` from the `test` script in `package.json`.

No existing services depend on the new module — nothing else needs to be touched.

## Remaining work before production integration

1. **Wire `render-mp4-service.ts` through `toMp4PreviewOptions`** — straightforward, can be done in a focused follow-up PR with the existing route tests as the regression net.
2. **Wire a Remotion `<Composition>`** — when the Remotion path is added, consume `toRemotionScenePackage(manifest)` as `inputProps`. This PR establishes the contract; the actual `Composition` lives outside this scope.
3. **Music/SFX cues** — schema is placeholder-only today (`musicSfxCues[]`). When the audio mix step is added, extend the FFmpeg/Remotion adapters; the schema is already forward-compatible.
4. **`audioRef` / `storageRef` validation** — currently free-form opaque keys; a future PR can add a stricter key-prefix policy once the persistent-storage namespacing is finalised.
5. **Manifest persistence** — when packages need to be saved, add a migration-gated table (likely in `shared/newsroom-schema.ts`); the canonical manifest serialises to JSON cleanly.
6. **`internal_reference_only` semantics** — defined in the rights-gate enum but not yet emitted by `rightsStatusToRightsGate`. Reserved for an admin-controlled overlay where the source is renderable but only inside the internal preview (e.g. watermarked).
7. **Public surfacing** — never automatic. The literal-locked safety envelope ensures any renderer driven by this contract cannot publish externally without an explicit, manual, root-admin-gated, out-of-band step.

— end of report —
