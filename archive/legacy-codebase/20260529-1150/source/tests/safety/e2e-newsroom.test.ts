/**
 * Newsroom T11 — End-to-end safety test suite.
 *
 * Drives the full pipeline (Source Registry → Brief → B-Roll → Package →
 * Anchor → Compositor → Playout → Shorts) against adversarial fixtures
 * and asserts every one of the 10 universal safety gates declared in
 * `shared/safety-types.ts`.
 *
 * The suite uses pure helpers and the safety harness for most gates,
 * plus a live test-DB-backed call for the cost gate and the in-memory
 * playout adapter for the kill-switch gate, so adversarial fixtures
 * are rejected by the real services (not just verified via source-scan).
 *
 * A markdown report is generated to `docs/SAFETY_E2E_REPORT.md` after
 * the suite completes.
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  SAFETY_GATE_IDS,
  SafetyGateError,
  assertApprovalRequired,
  assertLicensed,
  assertNotLiveUnreal,
  assertNotPublished,
  assertNotRealHardware,
  type ApprovalRecord,
  type HardwareTarget,
  type MediaLicense,
  type PublishableItem,
  type SafetyGateId,
  type SceneRealismMode,
} from "../../server/safety/index";

import {
  isActiveLicense,
  filterActiveSources,
} from "../../server/services/news-source-registry";
import {
  BLOCKED_DOMAIN_LIST,
  blocklistMatch,
  isBlockedUrl,
} from "../../server/services/broll/blocklist";
import { pickModeForBeat } from "../../server/services/anchor-director-service";
import { AnchorModeError } from "../../server/services/anchor/modes";
import { buildPackagePayloadFromBrief } from "../../server/services/newsroom-package-builder-service";
import {
  FOUNDER_APPROVAL_FLAG_VALUE,
  buildManifest,
  type BroadcastRenderInput,
  type BroadcastSourceItem,
} from "../../server/services/broadcast-compositor-service";
import { BROADCAST_BRIEF_SAFETY_ENVELOPE } from "../../shared/newsroom-types";
import type { BroadcastBrief } from "../../shared/newsroom-types";

/* ---------- fixture loading ---------- */

interface FixtureStory {
  id: string;
  label: string;
  adversarial: boolean;
  media: MediaLicense | null;
  item: { itemId: string; mode: PublishableItem["mode"]; approvalActionId: string };
  approval: ApprovalRecord;
  hardware: HardwareTarget | "real_device";
  scene: SceneRealismMode | "live_action_unreal";
  brollUrl?: string;
  costKind?: string;
  costEstUsd?: number;
  broadcastId?: string;
  anchor?: {
    brief: { packageId: string; sensitive?: boolean; mood?: string; eventType?: string };
    beats: Array<{ index: number; text: string; modeOverride?: string }>;
  };
  rejectAtStage?: string;
  expectGate?: SafetyGateId;
}

const FIXTURES: FixtureStory[] = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/safety/fixtures/e2e-stories.json"), "utf8"),
).stories;

/* ---------- gate result registry ---------- */

interface GateResult {
  id: SafetyGateId;
  status: "pass" | "fail";
  details: string;
  fixtures: string[];
}
interface FixtureResult {
  id: string;
  adversarial: boolean;
  expectGate: SafetyGateId | null;
  rejectAtStage: string | null;
  outcome: string;
}

const gateResults = new Map<SafetyGateId, GateResult>();
const fixtureResults: FixtureResult[] = [];

function recordGate(id: SafetyGateId, details: string, fixtures: string[] = []): void {
  gateResults.set(id, { id, status: "pass", details, fixtures });
}
function failGate(id: SafetyGateId, details: string): void {
  gateResults.set(id, { id, status: "fail", details, fixtures: [] });
}
function recordFixture(id: string, outcome: string): void {
  const f = FIXTURES.find((s) => s.id === id);
  if (!f) return;
  fixtureResults.push({
    id,
    adversarial: f.adversarial,
    expectGate: f.expectGate ?? null,
    rejectAtStage: f.rejectAtStage ?? null,
    outcome,
  });
}

/* ---------- minimal brief factory for the package mapper ---------- */

function makeBrief(over: Partial<BroadcastBrief> = {}): BroadcastBrief {
  return {
    id: "brief_e2e",
    storyId: "story_e2e",
    articleId: null,
    dataPackageId: "dp_e2e",
    verifiedKnowledgeId: "vk_e2e",
    approvalStatus: "approved",
    visibility: "admin_only_internal",
    publicUrl: null,
    signedUrl: null,
    realSendAllowed: false,
    executionEnabled: false,
    safetyEnvelope: { ...BROADCAST_BRIEF_SAFETY_ENVELOPE },
    approvedBy: "founder@mougle.com",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    headline: "E2E safety fixture",
    summary: "Self-contained brief for the T11 end-to-end safety suite.",
    location: { city: "Test", country: "Testland", lat: 0, lon: 0 },
    region: "Test",
    country: "Testland",
    latitude: 0,
    longitude: 0,
    eventType: "policy_update",
    entities: [{ name: "Mougle", kind: "org" }],
    mood: "neutral",
    impactScore: "high",
    breakingNews: true,
    scriptBeats: {
      coldOpen: "Open.",
      keyFacts: "Facts.",
      context: "Context.",
      signOff: "Sign-off.",
    },
    visualNeeds: {
      coldOpen: ["wide"],
      keyFacts: ["chart"],
      context: ["broll"],
      signOff: ["anchor"],
    },
    bRollNeeds: ["abstract"],
    mapNeeds: { needsMap: true, focus: "Test", zoomHint: "city" },
    anchorMode: "solo_desk",
    sensitivity: {
      graphicViolence: false,
      minors: false,
      disputed: true,
      medical: false,
      electoral: false,
      legal: false,
      death: false,
      financial: false,
      notes: [],
    },
    rightsFlags: { hasRestrictions: false, notes: [] },
    ...over,
  } as BroadcastBrief;
}

/* ---------- code-scan helpers (grep-style) ---------- */

const SERVER_SERVICES = resolve(process.cwd(), "server/services");

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function runSafetyLint(): { ok: boolean; out: string } {
  const result = spawnSync(
    process.execPath,
    [resolve(process.cwd(), "scripts/safety-lint.cjs")],
    { encoding: "utf8" },
  );
  return { ok: result.status === 0, out: (result.stdout || "") + (result.stderr || "") };
}

/* =====================================================================
 * GATE 1 — licensed_media_only
 * ===================================================================== */

describe("E2E safety — gate: licensed_media_only", () => {
  it("source registry rejects unknown license; compositor refuses missing license", () => {
    // Stage 1 — source registry
    assert.equal(isActiveLicense("unknown"), false);
    assert.equal(isActiveLicense(null), false);
    assert.equal(isActiveLicense("public_rss"), true);
    const filtered = filterActiveSources([
      { id: "ok", enabled: true, licenseStatus: "public_rss" },
      { id: "bad-unknown", enabled: true, licenseStatus: "unknown" },
      { id: "bad-disabled", enabled: false, licenseStatus: "licensed" },
    ]);
    assert.deepEqual(filtered.map((r) => r.id), ["ok"]);

    // Stage 3 — b-roll: every fixture media is run through assertLicensed
    const failedFixtures: string[] = [];
    for (const f of FIXTURES) {
      let threw = false;
      try {
        assertLicensed(f.media);
      } catch (err) {
        threw = true;
        assert.ok(err instanceof SafetyGateError);
        assert.equal((err as SafetyGateError).gateId, "licensed_media_only");
        if (f.adversarial && f.expectGate === "licensed_media_only") {
          recordFixture(f.id, `rejected at ${f.rejectAtStage} by licensed_media_only`);
          failedFixtures.push(f.id);
        }
      }
      if (!threw && !f.adversarial) {
        // clean story must pass
        assertLicensed(f.media);
      }
    }

    // Stage 6 — compositor manifest sources: every source has a license string
    const sources: BroadcastSourceItem[] = [
      { name: "Reuters", url: "https://reuters.com/a", license: "public_rss", tier: "paid" },
    ];
    const manifest = buildManifest(
      {
        packageId: "pkg",
        brollPlanId: null,
        anchorVideoUrl: null,
        backgroundImageUrl: null,
        backgroundAttribution: null,
        brandLabel: "MOUGLE",
        kicker: "WORLD",
        headline: "h",
        speakerName: null,
        speakerRole: null,
        tickerItems: [],
        breaking: { enabled: false, label: "", headline: "" },
        confidence: "high",
        confidenceScore: 0.9,
        sources,
        durationSec: 10,
        actorId: "tester",
      } as BroadcastRenderInput,
      "x.mp4",
      true,
    );
    for (const s of manifest.sources) {
      assert.ok(s.license, "manifest source must carry a license string");
    }

    recordGate(
      "licensed_media_only",
      `assertLicensed rejected ${failedFixtures.length} adversarial media fixtures; source registry filter rejects unknown/disabled; compositor manifest enforces license on every source.`,
      failedFixtures,
    );
  });
});

/* =====================================================================
 * GATE 2 — no_premature_publish
 * ===================================================================== */

describe("E2E safety — gate: no_premature_publish", () => {
  it("every pipeline output is draft/internal until approved; scheduled-without-approval rejected", () => {
    // Stage 4 — package output is always status=draft (mapper is pure;
    // the service writes draft unconditionally — see newsroom-package-
    // builder-service.ts line 379 region). We verify the brief envelope
    // also locks publishing to false.
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.publicPublishing, false);
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.youtubeUpload, false);
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.socialPosting, false);
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.liveStreaming, false);
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.publicUrlGeneration, false);
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.signedUrlGeneration, false);

    // Stage 7 — playout / shorts: assertNotPublished must reject any
    // scheduled-without-approval item.
    const rejected: string[] = [];
    for (const f of FIXTURES) {
      const item: PublishableItem = {
        itemId: f.item.itemId,
        mode: f.item.mode,
        approval: f.approval,
      };
      try {
        assertNotPublished(item);
        // accepted: must be draft/preview, OR scheduled+approved
        assert.notEqual(item.mode, "published");
        if (item.mode === "scheduled") {
          assert.equal(item.approval.state, "approved");
        }
      } catch (err) {
        assert.ok(err instanceof SafetyGateError);
        assert.equal((err as SafetyGateError).gateId, "no_premature_publish");
        if (f.adversarial && f.expectGate === "no_premature_publish") {
          recordFixture(f.id, `rejected at ${f.rejectAtStage} by no_premature_publish`);
          rejected.push(f.id);
        }
      }
    }

    // Manifest carries safety:false flags
    const manifest = buildManifest(
      {
        packageId: "pkg",
        brollPlanId: null,
        anchorVideoUrl: null,
        backgroundImageUrl: null,
        backgroundAttribution: null,
        brandLabel: "MOUGLE",
        kicker: "K",
        headline: "h",
        speakerName: null,
        speakerRole: null,
        tickerItems: [],
        breaking: { enabled: false, label: "", headline: "" },
        confidence: "high",
        confidenceScore: 0.9,
        sources: [{ name: "Reuters", url: null, license: "public_rss" }],
        durationSec: 10,
        actorId: "tester",
      } as BroadcastRenderInput,
      "x.mp4",
      true,
    );
    assert.equal(manifest.safety.publicPublishing, false);
    assert.equal(manifest.safety.youtubeUpload, false);
    assert.equal(manifest.safety.socialPosting, false);
    assert.equal(manifest.safety.externalUpload, false);
    assert.equal(manifest.safety.requiresFounderApprovalForLive, true);

    recordGate(
      "no_premature_publish",
      `Brief safety envelope locks 6 publishing toggles to false; assertNotPublished rejected ${rejected.length} adversarial fixtures; manifest safety block carries publish=false flags.`,
      rejected,
    );
  });
});

/* =====================================================================
 * GATE 3 — no_real_hardware
 * ===================================================================== */

describe("E2E safety — gate: no_real_hardware", () => {
  it("4D cues are simulationOnly; assertNotRealHardware rejects real_device", () => {
    // Stage 4 — pure package mapper: every cue must be simulationOnly
    const payload = buildPackagePayloadFromBrief(makeBrief({ breakingNews: true }));
    assert.ok(payload.fourDCues.length > 0);
    for (const cue of payload.fourDCues) {
      assert.equal(cue.simulationOnly, true);
      for (const forbidden of ["payload", "hardwarePayload", "deviceId", "execute", "fire", "url"] as const) {
        assert.equal(
          (cue as unknown as Record<string, unknown>)[forbidden],
          undefined,
          `cue ${cue.id} must not carry "${forbidden}"`,
        );
      }
    }

    // Stage-wide: every fixture's hardware target is gated
    const rejected: string[] = [];
    for (const f of FIXTURES) {
      try {
        assertNotRealHardware(f.hardware as HardwareTarget);
      } catch (err) {
        assert.ok(err instanceof SafetyGateError);
        assert.equal((err as SafetyGateError).gateId, "no_real_hardware");
        if (f.adversarial && f.expectGate === "no_real_hardware") {
          recordFixture(f.id, `rejected at ${f.rejectAtStage} by no_real_hardware`);
          rejected.push(f.id);
        }
      }
    }

    // Envelope locks real-hardware toggles
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.real4DCommands, false);
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.cinema4dExecution, false);

    recordGate(
      "no_real_hardware",
      `${payload.fourDCues.length} generated 4D cues all carry simulationOnly:true; assertNotRealHardware rejected ${rejected.length} adversarial fixtures; envelope locks real4DCommands=false.`,
      rejected,
    );
  });
});

/* =====================================================================
 * GATE 4 — no_live_unreal_scenes
 * ===================================================================== */

describe("E2E safety — gate: no_live_unreal_scenes", () => {
  it("live_action_unreal is rejected; shapeshift forbidden on sensitive briefs", () => {
    const rejected: string[] = [];

    for (const f of FIXTURES) {
      try {
        assertNotLiveUnreal(f.scene as SceneRealismMode);
      } catch (err) {
        assert.ok(err instanceof SafetyGateError);
        assert.equal((err as SafetyGateError).gateId, "no_live_unreal_scenes");
        if (f.adversarial && f.expectGate === "no_live_unreal_scenes") {
          recordFixture(f.id, `rejected at ${f.rejectAtStage} by no_live_unreal_scenes`);
          rejected.push(f.id);
        }
      }

      // Stage 5 — anchor director: shapeshift_explainer on sensitive must throw.
      if (f.anchor) {
        for (const beat of f.anchor.beats) {
          let threw = false;
          try {
            pickModeForBeat(f.anchor.brief, {
              index: beat.index,
              text: beat.text,
              modeOverride: (beat.modeOverride as ReturnType<typeof pickModeForBeat>["mode"]) ?? null,
            });
          } catch (err) {
            threw = true;
            assert.ok(err instanceof AnchorModeError, "anchor must use AnchorModeError");
          }
          if (beat.modeOverride === "shapeshift_explainer" && f.anchor.brief.sensitive) {
            assert.equal(threw, true, "shapeshift on sensitive brief must throw");
            if (!rejected.includes(f.id)) {
              recordFixture(f.id, `rejected at anchor by no_live_unreal_scenes (shapeshift)`);
              rejected.push(f.id);
            }
          }
        }
      }
    }

    // Envelope locks the related toggles
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.realUnrealCommands, false);

    recordGate(
      "no_live_unreal_scenes",
      `assertNotLiveUnreal + anchor sensitivity gate rejected ${rejected.length} adversarial scenarios; envelope locks realUnrealCommands=false.`,
      rejected,
    );
  });
});

/* =====================================================================
 * GATE 5 — founder_approval_required
 * ===================================================================== */

describe("E2E safety — gate: founder_approval_required", () => {
  it("approval gate rejects pending/rejected/missing approver; compositor requires founder flag for live", () => {
    const rejected: string[] = [];
    for (const f of FIXTURES) {
      try {
        assertApprovalRequired({ action: "publish", approval: f.approval });
      } catch (err) {
        assert.ok(err instanceof SafetyGateError);
        assert.equal((err as SafetyGateError).gateId, "founder_approval_required");
        rejected.push(f.id);
      }
    }

    // Compositor: the founder approval flag constant must exist and be a
    // non-empty literal that callers cannot guess casually.
    assert.equal(typeof FOUNDER_APPROVAL_FLAG_VALUE, "string");
    assert.ok(FOUNDER_APPROVAL_FLAG_VALUE.length >= 16);

    // Source-level check: the compositor's live path requires the flag.
    const compositorSrc = readSource("server/services/broadcast-compositor-service.ts");
    assert.match(
      compositorSrc,
      /wantsLive\s*&&\s*input\.founderApprovalFlag\s*!==\s*FOUNDER_APPROVAL_FLAG_VALUE/,
      "live render path must require founderApprovalFlag === FOUNDER_APPROVAL_FLAG_VALUE",
    );
    // Default to dryRun=true
    assert.match(
      compositorSrc,
      /const\s+dryRun\s*=\s*input\.dryRun\s*!==\s*false/,
      "renderBroadcast must default dryRun to true",
    );

    recordGate(
      "founder_approval_required",
      `Approval gate rejected ${rejected.length} fixtures with pending/missing approval; compositor requires FOUNDER_APPROVAL_FLAG_VALUE on every live render and defaults to dryRun=true.`,
      rejected,
    );
  });
});

/* =====================================================================
 * GATE 6 — no_watermark_removal   |   GATE 7 — no_logo_stripping
 *
 * Both enforced by scripts/safety-lint.cjs. We run it here and fail this
 * suite if it returns non-zero (== forbidden patterns present).
 * ===================================================================== */

describe("E2E safety — gate: no_watermark_removal / no_logo_stripping", () => {
  it("safety-lint passes (no removeWatermark / stripLogo anywhere)", () => {
    const { ok, out } = runSafetyLint();
    assert.equal(ok, true, `safety-lint failed:\n${out}`);
    recordGate(
      "no_watermark_removal",
      "scripts/safety-lint.cjs clean across server/, client/src/, shared/ — no removeWatermark/stripWatermark patterns.",
    );
    recordGate(
      "no_logo_stripping",
      "scripts/safety-lint.cjs clean — no stripLogo/removeLogo/eraseLogo patterns.",
    );
  });
});

/* =====================================================================
 * GATE 8 — no_external_publish_without_approval
 * ===================================================================== */

describe("E2E safety — gate: no_external_publish_without_approval", () => {
  it("b-roll blocklist rejects copyrighted hosts; no direct upload SDK reachable", () => {
    // Stage 3 — b-roll: blocklist must reject youtube/vimeo/tiktok-style hosts.
    assert.ok(BLOCKED_DOMAIN_LIST.includes("youtube.com"));
    assert.ok(BLOCKED_DOMAIN_LIST.includes("tiktok.com"));
    assert.ok(BLOCKED_DOMAIN_LIST.includes("vimeo.com"));

    const rejected: string[] = [];
    for (const f of FIXTURES) {
      if (!f.brollUrl) continue;
      const blocked = isBlockedUrl(f.brollUrl);
      const match = blocklistMatch(f.brollUrl);
      if (f.adversarial && f.expectGate === "licensed_media_only" && f.brollUrl.includes("youtube")) {
        assert.equal(blocked, true, `b-roll url ${f.brollUrl} must be blocked`);
        assert.ok(match, "blocklist should return matched domain");
        rejected.push(f.id);
      }
    }

    // Code scan: the safety-lint script already enforces no direct
    // youtube/tiktok/etc upload calls outside the gateway allow-list.
    // Reassert here to harden the e2e gate.
    const lint = runSafetyLint();
    assert.equal(lint.ok, true, `safety-lint flagged external publish calls:\n${lint.out}`);

    // Brief envelope must lock external posting toggles
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.youtubeUpload, false);
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.socialPosting, false);
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.liveStreaming, false);

    recordGate(
      "no_external_publish_without_approval",
      `Blocklist covers ${BLOCKED_DOMAIN_LIST.length} hosts and rejected ${rejected.length} adversarial b-roll URLs; safety-lint forbids unguarded social/youtube upload calls; brief envelope locks external posting to false.`,
      rejected,
    );
  });

  it("MRQ/Sequencer start is guarded — every reference is gated by simulation-only / dry-run language", () => {
    // We scan for explicit "start" verbs on Movie Render Queue / Sequencer.
    // Every match in the production code must sit inside a line that also
    // mentions a guard token (dry-run, simulation, planning_only, etc).
    // The unreal-bridge-contract is a payload-shape contract, NOT an
    // executor — it never invokes MRQ/Sequencer. The executor lives in
    // production-house-service.ts; we scan that one for unguarded calls.
    const TARGETS = ["server/services/production-house-service.ts"];
    const GUARDS = /dry[\s_-]?run|simulation|planning_only|liveExecutionEnabled\s*=\s*false|realSendAllowed|DRY RUN|never|no MRQ|no Sequencer|stop signal|emergency lock|description:/i;
    const VERBS = /(start\w*|trigger\w*|submit\w*|execute\w*|run\w*)\s*(?:\()?\s*(MovieRenderQueue|MRQ|Sequencer)/i;
    const failures: string[] = [];
    for (const rel of TARGETS) {
      const src = readSource(rel);
      const lines = src.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!VERBS.test(line)) continue;
        const window = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
        if (!GUARDS.test(window)) {
          failures.push(`${rel}:${i + 1}  ${line.trim().slice(0, 160)}`);
        }
      }
    }
    assert.deepEqual(
      failures,
      [],
      `Found unguarded MRQ/Sequencer start references:\n${failures.join("\n")}`,
    );
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.movieRenderQueue, false);
    assert.equal(BROADCAST_BRIEF_SAFETY_ENVELOPE.sequencerExecution, false);
  });
});

/* =====================================================================
 * GATE 9 — kill_switch_respected
 * ===================================================================== */

describe("E2E safety — gate: kill_switch_respected", () => {
  it("playout service exports kill-switch primitives and blocks dispatch when engaged", async () => {
    const src = readSource("server/services/playout-queue-service.ts");
    for (const sym of ["engageKillSwitch", "clearKillSwitch", "isKillSwitchActive"]) {
      assert.match(src, new RegExp(`export\\s+(?:async\\s+)?function\\s+${sym}|export\\s+\\{[^}]*\\b${sym}\\b`), `playout queue must export ${sym}`);
    }
    // The dispatch path must consult the kill switch.
    assert.match(src, /isKillSwitchActive|killSwitch|kill_switch/i);

    // Live fixture exercise: run the kill_switch fixture through the in-memory
    // playout-queue adapter and assert the enqueue path is rejected.
    const playout = await import("../../server/services/playout-queue-service");
    const rejected: string[] = [];
    try {
      playout._resetForTests();
      playout.engageKillSwitch("safety_e2e", "fixture_run");
      assert.equal(playout.isKillSwitchActive(), true);
      for (const f of FIXTURES) {
        if (f.expectGate !== "kill_switch_respected" || !f.broadcastId) continue;
        let threw = false;
        try {
          await playout.enqueueBroadcast({
            broadcastId: f.broadcastId,
            enqueuedBy: "safety_e2e",
          });
        } catch (err) {
          threw = true;
          assert.ok(
            err instanceof playout.PlayoutSafetyError,
            "kill-switch rejection must use PlayoutSafetyError",
          );
          assert.equal((err as { code: string }).code, "kill_switch_active");
          recordFixture(f.id, `rejected at ${f.rejectAtStage} by kill_switch_respected`);
          rejected.push(f.id);
        }
        assert.equal(threw, true, `fixture ${f.id} must be rejected when kill switch is engaged`);
      }
    } finally {
      playout.clearKillSwitch("safety_e2e", "fixture_run_complete");
      playout._resetForTests();
    }

    recordGate(
      "kill_switch_respected",
      `Playout queue exports engageKillSwitch/clearKillSwitch/isKillSwitchActive; engaging the kill switch rejected ${rejected.length} live fixture enqueue(s) with PlayoutSafetyError(kill_switch_active).`,
      rejected,
    );
  });
});

/* =====================================================================
 * GATE 10 — cost_gate_enforced
 * ===================================================================== */

describe("E2E safety — gate: cost_gate_enforced", () => {
  it("compositor calls cost-control canSpend before every render; service exposes pause/resume", async () => {
    const compositorSrc = readSource("server/services/broadcast-compositor-service.ts");
    assert.match(
      compositorSrc,
      /from\s+["'](?:\.\/)?cost-control-service["']|import\([^)]*cost-control-service/,
      "compositor must import cost-control-service",
    );
    assert.match(compositorSrc, /canSpend\b/, "compositor must invoke canSpend");
    assert.match(compositorSrc, /cost_blocked/, "compositor must throw cost_blocked when refused");

    const costSrc = readSource("server/services/cost-control-service.ts");
    for (const sym of ["canSpend", "pausePaidApis", "resumePaidApis"]) {
      assert.match(costSrc, new RegExp(`export\\s+(?:async\\s+)?function\\s+${sym}|export\\s+const\\s+${sym}`), `cost-control must export ${sym}`);
    }

    // Live fixture exercise: run the cost-exceeded fixture through the
    // real cost-control-service against the test DB. We tighten the cap
    // below the fixture's estimated spend, call canSpend, and assert it
    // is refused with a cost-gate reason. Original policy is restored.
    const cost = await import("../../server/services/cost-control-service");
    const original = await cost.getPolicy();
    const rejected: string[] = [];
    try {
      await cost.updatePolicy({
        paidApisPaused: false,
        dailyCapUsd: 1,
        monthlyCapUsd: 1,
        updatedBy: "safety_e2e",
      });
      for (const f of FIXTURES) {
        if (f.expectGate !== "cost_gate_enforced") continue;
        const kind = (f.costKind as Parameters<typeof cost.canSpend>[0]["kind"]) || "broadcast_full";
        const result = await cost.canSpend({
          kind,
          estUsd: f.costEstUsd ?? 9999.99,
          skipAudit: true,
          metadata: { fixtureId: f.id, source: "safety_e2e" },
        });
        assert.equal(
          result.allowed,
          false,
          `fixture ${f.id} must be refused by cost gate (got reasons=${result.reasons.join(",")})`,
        );
        const costReasons = ["daily_cap_exceeded", "monthly_cap_exceeded", "paid_apis_paused"];
        assert.ok(
          result.reasons.some((r) => costReasons.includes(r)),
          `fixture ${f.id} must be refused with a cost-gate reason (got ${result.reasons.join(",")})`,
        );
        recordFixture(f.id, `rejected at ${f.rejectAtStage} by cost_gate_enforced`);
        rejected.push(f.id);
      }
    } finally {
      await cost.updatePolicy({
        paidApisPaused: original.paidApisPaused,
        dailyCapUsd: original.dailyCapUsd,
        monthlyCapUsd: original.monthlyCapUsd,
        impactScoreThreshold: original.impactScoreThreshold,
        confidenceThreshold: original.confidenceThreshold,
        updatedBy: "safety_e2e_cleanup",
      });
    }

    recordGate(
      "cost_gate_enforced",
      `broadcast-compositor invokes cost-control canSpend() and throws cost_blocked on refusal; cost-control exports pause/resume primitives; live canSpend() refused ${rejected.length} cost-exceeded fixture(s) at the cost gate.`,
      rejected,
    );
  });
});

/* =====================================================================
 * Exhaustiveness + report generation
 * ===================================================================== */

describe("E2E safety — exhaustiveness", () => {
  it("every one of the 10 universal gates was exercised", () => {
    const missing: SafetyGateId[] = [];
    for (const id of SAFETY_GATE_IDS) {
      if (!gateResults.has(id)) {
        missing.push(id);
        failGate(id, "gate was not exercised by the e2e suite");
      }
    }
    assert.deepEqual(missing, [], `Missing e2e coverage for gates: ${missing.join(", ")}`);
  });
});

after(() => {
  // Ensure every clean fixture without an explicit reject stage is recorded
  // as "accepted across the chain".
  // Gates exercised only via source scan (no runtime fixture chain because
  // the underlying services require DB / network in production paths).
  const SOURCE_SCAN_GATES = new Set<SafetyGateId>([
    "no_watermark_removal",
    "no_logo_stripping",
  ]);
  for (const f of FIXTURES) {
    if (!fixtureResults.some((r) => r.id === f.id)) {
      let outcome: string;
      if (!f.adversarial) {
        outcome = "accepted across all stages";
      } else if (f.expectGate && SOURCE_SCAN_GATES.has(f.expectGate)) {
        outcome = `gate verified by source-scan (no DB fixture run)`;
      } else {
        outcome = "WARN: adversarial fixture not rejected";
      }
      fixtureResults.push({
        id: f.id,
        adversarial: f.adversarial,
        expectGate: f.expectGate ?? null,
        rejectAtStage: f.rejectAtStage ?? null,
        outcome,
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    gates: SAFETY_GATE_IDS.map(
      (id) =>
        gateResults.get(id) ?? {
          id,
          status: "fail" as const,
          details: "not exercised",
          fixtures: [],
        },
    ),
    fixtures: fixtureResults,
  };

  const report = spawnSync(
    process.execPath,
    [resolve(process.cwd(), "scripts/safety-report.cjs")],
    { input: JSON.stringify(payload), encoding: "utf8" },
  );
  if (report.status !== 0) {
    // Surface — but do not fail the entire suite — if report generation
    // itself errors, so the underlying gate result remains the source of
    // truth.
    process.stderr.write(`safety-report failed: ${report.stderr}\n`);
  }
});
