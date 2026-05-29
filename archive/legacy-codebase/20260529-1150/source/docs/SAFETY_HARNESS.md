# Safety Harness (Newsroom T1)

This is the shared safety foundation for the 24/7 Cinematic Newsroom (tasks T2–T11). Every newsroom service **must** call into these gates before performing risky actions (using media, publishing, touching hardware, escalating realism, calling external publish APIs, etc.).

## Modules

- `shared/safety-types.ts` — pure type definitions (`LicenseStatus`, `MediaLicense`, `ApprovalState`, `ApprovalRecord`, `PublishingMode`, `PublishableItem`, `HardwareTarget`, `SceneRealismMode`, `SafetyGateId`, `SafetyGateError`).
- `server/safety/index.ts` — typed gate helpers a service can call before a risky action. All helpers throw `SafetyGateError` with a stable `gateId` on failure.
- `tests/safety/_fixtures.ts` — shared good/bad fixtures every later test suite can import.
- `tests/safety/base.test.ts` — base suite proving each gate rejects the wrong input and that the lint script catches disallowed patterns.
- `scripts/safety-lint.cjs` — repo-level grep guardrail (also runnable on individual files for tests).

## Universal "do not" gates

| Gate id | Helper | Forbids |
| --- | --- | --- |
| `licensed_media_only` | `assertLicensed(media)` | Using media that is not `status: "licensed"`, has `tier: "unknown"`, or is expired. |
| `no_premature_publish` | `assertNotPublished(item)` | Touching an already-published item; scheduling an item without approval. |
| `no_real_hardware` | `assertNotRealHardware(target)` | Targeting `real_device` (or missing target — refuses to default). |
| `no_live_unreal_scenes` | `assertNotLiveUnreal(mode)` | Generating `live_action_unreal` scenes (must be `stylized` or `synthetic_preview`). |
| `founder_approval_required` | `assertApprovalRequired({ action, approval })` / `requireFounderApproval(approval, action)` | Performing a flagged action without a fully-approved approval record (state + approver). |
| `no_watermark_removal` | lint | Code that calls `removeWatermark` / `stripWatermark` / `deleteWatermark`. |
| `no_logo_stripping` | lint | Code that calls `stripLogo` / `removeLogo` / `eraseLogo`. |
| `no_external_publish_without_approval` | lint | Direct calls to YouTube / TikTok / Facebook / Twitter publish endpoints without going through an approved gateway. |
| `kill_switch_respected` | (reserved — T8) | Continuing playout after the founder kill switch fires. |
| `cost_gate_enforced` | (reserved — T10) | Skipping the cost gate before spending render or API budget. |

`SAFETY_GATE_IDS` is exported so later suites can enumerate them and prove coverage.

## How later tasks plug in

- **T2 — Source Registry:** every `SourceMedia` row must produce a `MediaLicense`, and the writer service calls `assertLicensed` before persisting.
- **T3 — Brief Builder:** before attaching media to a brief, call `assertLicensed` on each clip; before publishing the brief, call `assertNotPublished` and `requireFounderApproval`.
- **T4 — Legal B-Roll Resolver:** each tier resolver returns a `MediaLicense`; final selection is gated by `assertLicensed`.
- **T5 — 3D/4D Package Builder:** every scene must declare its `SceneRealismMode`; the builder calls `assertNotLiveUnreal` and `assertNotRealHardware`.
- **T6 — Compositor:** before writing the final composition, calls `assertLicensed` on every media id used.
- **T7 — Anchor Director:** generates synthetic anchors only; calls `assertNotLiveUnreal`.
- **T8 — Playout Queue:** wraps every dequeue in `assertNotPublished` + kill-switch gate (`kill_switch_respected`).
- **T9 — Shorts Cutter:** approval-gated; calls `requireFounderApproval` before producing.
- **T10 — Cost Control:** cost gate (`cost_gate_enforced`) wraps every compute-spending call.
- **T11 — End-to-end safety suite:** imports `tests/safety/_fixtures.ts` and walks every full pipeline, asserting `SafetyGateError` is thrown for each disallowed path.

## Running the harness

```bash
npm test                       # runs the base safety suite as part of the test set
node scripts/safety-lint.cjs   # repo-wide lint (CI-friendly, exit code 0/1)
```

## Gateway allowlist

Some files are legitimate external-publish gateways and must be allowed to call publish endpoints directly — but only when each call is also wrapped in `requireFounderApproval`. Add such files to the `GATEWAY_ALLOWLIST` set at the top of `scripts/safety-lint.cjs`. Currently allowlisted:

- `server/services/youtube-publishing-service.ts`

If you add a new risky surface, add the gate id to `SAFETY_GATE_IDS`, add a helper to `server/safety/index.ts`, and add fixtures + assertions to `tests/safety/`.
