# Newsroom Safety — End-to-End Report

Generated at: `2026-05-22T00:07:37.923Z`

**Result:** 6/10 gates passing — 4 failing

## Universal Gates

| # | Gate | Status | Details |
|---|------|--------|---------|
| 1 | `licensed_media_only` | PASS | assertLicensed rejected 2 adversarial media fixtures; source registry filter rejects unknown/disabled; compositor manifest enforces license on every source. |
| 2 | `no_premature_publish` | PASS | Brief safety envelope locks 6 publishing toggles to false; assertNotPublished rejected 1 adversarial fixtures; manifest safety block carries publish=false flags. |
| 3 | `no_real_hardware` | PASS | 5 generated 4D cues all carry simulationOnly:true; assertNotRealHardware rejected 1 adversarial fixtures; envelope locks real4DCommands=false. |
| 4 | `no_live_unreal_scenes` | PASS | assertNotLiveUnreal + anchor sensitivity gate rejected 2 adversarial scenarios; envelope locks realUnrealCommands=false. |
| 5 | `founder_approval_required` | PASS | Approval gate rejected 2 fixtures with pending/missing approval; compositor requires FOUNDER_APPROVAL_FLAG_VALUE on every live render and defaults to dryRun=true. |
| 6 | `no_watermark_removal` | FAIL | gate was not exercised by the e2e suite |
| 7 | `no_logo_stripping` | FAIL | gate was not exercised by the e2e suite |
| 8 | `no_external_publish_without_approval` | FAIL | gate was not exercised by the e2e suite |
| 9 | `kill_switch_respected` | PASS | Playout queue exports engageKillSwitch/clearKillSwitch/isKillSwitchActive; engaging the kill switch rejected 1 live fixture enqueue(s) with PlayoutSafetyError(kill_switch_active). |
| 10 | `cost_gate_enforced` | FAIL | gate was not exercised by the e2e suite |

## Adversarial Fixtures

| Fixture | Adversarial | Expected Gate | Rejected At | Outcome |
|---------|-------------|---------------|-------------|---------|
| `fix_copyrighted_002` | yes | `licensed_media_only` | broll | rejected at broll by licensed_media_only |
| `fix_missing_license_004` | yes | `licensed_media_only` | compositor | rejected at compositor by licensed_media_only |
| `fix_publish_without_approval_006` | yes | `no_premature_publish` | playout | rejected at playout by no_premature_publish |
| `fix_real_hardware_007` | yes | `no_real_hardware` | package | rejected at package by no_real_hardware |
| `fix_sensitive_shapeshift_003` | yes | `no_live_unreal_scenes` | anchor | rejected at anchor by no_live_unreal_scenes (shapeshift) |
| `fix_live_unreal_008` | yes | `no_live_unreal_scenes` | anchor | rejected at anchor by no_live_unreal_scenes |
| `fix_kill_switch_009` | yes | `kill_switch_respected` | playout | rejected at playout by kill_switch_respected |
| `fix_clean_001` | no | — | — | accepted across all stages |
| `fix_cost_exceeded_005` | yes | `cost_gate_enforced` | cost-gate | WARN: adversarial fixture not rejected |

## Notes

This report is regenerated on every `npm test` run by `tests/safety/e2e-newsroom.test.ts`. Each gate corresponds to one of the ten universal safety IDs declared in `shared/safety-types.ts`. Failures here MUST block merge.
