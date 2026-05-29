import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  assertApprovalRequired,
  assertLicensed,
  assertNotLiveUnreal,
  assertNotPublished,
  assertNotRealHardware,
  requireFounderApproval,
  SafetyGateError,
  SAFETY_GATE_IDS,
} from "../../server/safety/index";
import {
  approvedApproval,
  draftItem,
  expiredMedia,
  licensedMedia,
  liveUnrealScene,
  notRequiredApproval,
  ownedLicensedMedia,
  pendingApproval,
  pendingMedia,
  previewItem,
  publishedItem,
  realHardware,
  rejectedApproval,
  scheduledApprovedItem,
  scheduledUnapprovedItem,
  simulatedHardware,
  stylizedScene,
  syntheticScene,
  unknownTierMedia,
  unlicensedMedia,
  virtualActorHardware,
} from "./_fixtures";

describe("safety harness — universal gates", () => {
  describe("assertLicensed", () => {
    it("accepts licensed media with a known tier", () => {
      assert.doesNotThrow(() => assertLicensed(licensedMedia));
      assert.doesNotThrow(() => assertLicensed(ownedLicensedMedia));
    });

    it("rejects null / unlicensed / pending / unknown-tier / expired", () => {
      for (const bad of [null, unlicensedMedia, pendingMedia, unknownTierMedia, expiredMedia]) {
        assert.throws(() => assertLicensed(bad as any), (err: unknown) => {
          assert.ok(err instanceof SafetyGateError);
          assert.equal((err as SafetyGateError).gateId, "licensed_media_only");
          return true;
        });
      }
    });
  });

  describe("assertNotPublished", () => {
    it("accepts drafts, previews, and scheduled+approved items", () => {
      assert.doesNotThrow(() => assertNotPublished(draftItem));
      assert.doesNotThrow(() => assertNotPublished(previewItem));
      assert.doesNotThrow(() => assertNotPublished(scheduledApprovedItem));
    });

    it("rejects already-published or scheduled-without-approval items", () => {
      for (const bad of [publishedItem, scheduledUnapprovedItem, null]) {
        assert.throws(() => assertNotPublished(bad as any), (err: unknown) => {
          assert.ok(err instanceof SafetyGateError);
          assert.equal((err as SafetyGateError).gateId, "no_premature_publish");
          return true;
        });
      }
    });
  });

  describe("assertNotRealHardware", () => {
    it("accepts simulated and virtual_actor targets", () => {
      assert.doesNotThrow(() => assertNotRealHardware(simulatedHardware));
      assert.doesNotThrow(() => assertNotRealHardware(virtualActorHardware));
    });

    it("rejects real devices or missing targets", () => {
      for (const bad of [realHardware, null, undefined]) {
        assert.throws(() => assertNotRealHardware(bad as any), (err: unknown) => {
          assert.ok(err instanceof SafetyGateError);
          assert.equal((err as SafetyGateError).gateId, "no_real_hardware");
          return true;
        });
      }
    });
  });

  describe("assertNotLiveUnreal", () => {
    it("accepts stylized and synthetic_preview modes", () => {
      assert.doesNotThrow(() => assertNotLiveUnreal(stylizedScene));
      assert.doesNotThrow(() => assertNotLiveUnreal(syntheticScene));
    });

    it("rejects live_action_unreal and missing modes", () => {
      for (const bad of [liveUnrealScene, null, undefined]) {
        assert.throws(() => assertNotLiveUnreal(bad as any), (err: unknown) => {
          assert.ok(err instanceof SafetyGateError);
          assert.equal((err as SafetyGateError).gateId, "no_live_unreal_scenes");
          return true;
        });
      }
    });
  });

  describe("assertApprovalRequired / requireFounderApproval", () => {
    it("accepts actions that do not require founder approval", () => {
      assert.doesNotThrow(() =>
        assertApprovalRequired({ action: "public-read", approval: notRequiredApproval }),
      );
    });

    it("accepts actions with a fully approved record", () => {
      assert.doesNotThrow(() =>
        assertApprovalRequired({ action: "publish", approval: approvedApproval }),
      );
      assert.doesNotThrow(() => requireFounderApproval(approvedApproval, "publish"));
    });

    it("rejects pending, rejected, missing approval, and approvals without approver", () => {
      const noApprover = { ...approvedApproval, approvedBy: undefined };
      const cases = [pendingApproval, rejectedApproval, null, noApprover];
      for (const bad of cases) {
        assert.throws(
          () => assertApprovalRequired({ action: "publish", approval: bad as any }),
          (err: unknown) => {
            assert.ok(err instanceof SafetyGateError);
            assert.equal((err as SafetyGateError).gateId, "founder_approval_required");
            return true;
          },
        );
      }
    });
  });

  describe("SAFETY_GATE_IDS exhaustiveness", () => {
    it("declares all 10 universal gate ids", () => {
      assert.equal(SAFETY_GATE_IDS.length, 10);
      assert.equal(new Set(SAFETY_GATE_IDS).size, 10);
    });
  });
});

describe("safety-lint script", () => {
  const scriptPath = path.join(process.cwd(), "scripts/safety-lint.cjs");
  const goodFixture = path.join(process.cwd(), "tests/safety/fixtures/lint-good.txt");
  const badFixture = path.join(process.cwd(), "tests/safety/fixtures/lint-bad.txt");

  it("passes on a clean fixture", () => {
    const result = spawnSync(process.execPath, [scriptPath, goodFixture], { encoding: "utf8" });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stderr}`);
  });

  it("fails on a fixture containing disallowed patterns", () => {
    const result = spawnSync(process.execPath, [scriptPath, badFixture], { encoding: "utf8" });
    assert.notEqual(result.status, 0, "expected non-zero exit on bad fixture");
    assert.match(result.stdout + result.stderr, /removeWatermark|stripLogo|youtube|publish/i);
  });
});
