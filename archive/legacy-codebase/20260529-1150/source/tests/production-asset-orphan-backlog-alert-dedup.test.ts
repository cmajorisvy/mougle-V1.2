/**
 * Task #799 — Lock in the once-per-crossing contract for the
 * production-asset orphan backlog alert (added in Task #789).
 *
 * `productionAssetOrphanAlertService.check()` (the "scanBacklogAndAlert"
 * method) must:
 *   1. Fire the sweep alert exactly once when the orphan count first
 *      crosses ABOVE the configured threshold.
 *   2. NOT re-fire on subsequent ticks while still above the threshold.
 *   3. Auto-resolve open sweep alerts once the count is back at/below
 *      the threshold (and re-arm the in-memory `wasAboveThreshold`
 *      latch so a future crossing can fire again).
 *   4. When founder PTO mute is active, `fireSweepAlert` swallows the
 *      alert (no platform_alerts row, no email) but the caller still
 *      flips `wasAboveThreshold`, so subsequent ticks do NOT keep
 *      calling `fireSweepAlert` every tick.
 *
 * The test stubs `listOrphanedRows` (to control the perceived orphan
 * count without touching object storage) and the three private helpers
 * that would otherwise hit the DB / email / panic-button stack:
 * `fireSweepAlert`, `autoResolveOpenSweepAlerts`, and
 * `countRecentAutoClears`. The configured threshold is set once via
 * `setSweepThreshold()` and restored in the after-hook so a shared dev
 * DB stays clean.
 */

import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "../shared/schema";
import { productionAssetOrphanAlertService } from "../server/services/production-asset-orphan-alert-service";

const THRESHOLD_KEY = "production_asset_orphan_alert_threshold";
const THRESHOLD = 5;
const TEST_MARKER = `t799-${randomUUID()}`;

type Stubs = {
  fireCalls: Array<{ count: number; threshold: number; pto: boolean }>;
  resolveCalls: Array<{ count: number; threshold: number }>;
  ptoActive: boolean;
  orphanCount: number;
};

const svc = productionAssetOrphanAlertService as any;

let prevThreshold: { value: string; updatedBy: string | null } | null = null;
let originalListOrphanedRows: any;
let originalFireSweepAlert: any;
let originalAutoResolveOpenSweepAlerts: any;
let originalCountRecentAutoClears: any;

const stubs: Stubs = {
  fireCalls: [],
  resolveCalls: [],
  ptoActive: false,
  orphanCount: 0,
};

function resetStubsState() {
  stubs.fireCalls = [];
  stubs.resolveCalls = [];
  stubs.ptoActive = false;
  stubs.orphanCount = 0;
  // Re-arm the in-memory latch so each test starts from a known state.
  svc.wasAboveThreshold = false;
  svc.lastOrphanCount = null;
  svc.lastScanAt = null;
  svc.wasFlapping = false;
}

describe("productionAssetOrphanAlertService.check() once-per-crossing contract", () => {
  before(async () => {
    // Snapshot + set the threshold via the real setter so readThreshold()
    // returns the value we expect for every check() call below.
    const existing = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, THRESHOLD_KEY))
      .limit(1);
    if (existing.length > 0) {
      prevThreshold = {
        value: existing[0].value,
        updatedBy: existing[0].updatedBy ?? null,
      };
    }
    await productionAssetOrphanAlertService.setSweepThreshold(
      THRESHOLD,
      TEST_MARKER,
    );

    // Stub the methods that would otherwise hit storage / DB / email.
    originalListOrphanedRows = svc.listOrphanedRows.bind(svc);
    originalFireSweepAlert = svc.fireSweepAlert.bind(svc);
    originalAutoResolveOpenSweepAlerts =
      svc.autoResolveOpenSweepAlerts.bind(svc);
    originalCountRecentAutoClears = svc.countRecentAutoClears.bind(svc);

    svc.listOrphanedRows = async () => {
      // The real method returns OrphanedRowSummary[]; check() only reads
      // `.length`, so an array of empty objects of the right length is
      // sufficient to drive the contract.
      return Array.from({ length: stubs.orphanCount }, () => ({}));
    };

    svc.fireSweepAlert = async (count: number, threshold: number) => {
      // Model the PTO short-circuit: in PTO mode the real method returns
      // early without writing a platform_alerts row or sending email, but
      // the caller still considers the crossing "consumed" and flips
      // wasAboveThreshold. Our stub records the invocation either way so
      // the test can distinguish "fired+emitted" from "fired+suppressed".
      stubs.fireCalls.push({ count, threshold, pto: stubs.ptoActive });
    };

    svc.autoResolveOpenSweepAlerts = async (
      count: number,
      threshold: number,
    ) => {
      stubs.resolveCalls.push({ count, threshold });
    };

    svc.countRecentAutoClears = async () => 0;
  });

  after(async () => {
    // Restore stubbed methods.
    svc.listOrphanedRows = originalListOrphanedRows;
    svc.fireSweepAlert = originalFireSweepAlert;
    svc.autoResolveOpenSweepAlerts = originalAutoResolveOpenSweepAlerts;
    svc.countRecentAutoClears = originalCountRecentAutoClears;

    // Restore threshold (or remove the row if we created it).
    try {
      if (prevThreshold) {
        await db
          .update(systemSettings)
          .set({
            value: prevThreshold.value,
            updatedBy: prevThreshold.updatedBy,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.key, THRESHOLD_KEY));
      } else {
        await db
          .delete(systemSettings)
          .where(eq(systemSettings.key, THRESHOLD_KEY));
      }
    } catch {
      /* best-effort */
    }
    // Reset the in-memory latch so we don't leak state into other suites.
    svc.wasAboveThreshold = false;
    svc.lastOrphanCount = null;
    svc.lastScanAt = null;
    svc.wasFlapping = false;
  });

  beforeEach(() => {
    resetStubsState();
  });

  it("does not fire when the orphan count is at/below the threshold", async () => {
    stubs.orphanCount = THRESHOLD; // equal → not above
    const res = await productionAssetOrphanAlertService.check();
    assert.equal(res.alerted, false);
    assert.equal(res.orphanCount, THRESHOLD);
    assert.equal(res.threshold, THRESHOLD);
    assert.equal(stubs.fireCalls.length, 0, "no alert at threshold");
    // Below-or-equal path always runs the auto-resolve sweep (it's a
    // no-op when there are no open rows — that's the resolver's job).
    assert.equal(stubs.resolveCalls.length, 1);
    assert.equal(svc.wasAboveThreshold, false);
  });

  it("fires exactly once on the first crossing and not on subsequent ticks while still above", async () => {
    stubs.orphanCount = THRESHOLD + 1;

    const first = await productionAssetOrphanAlertService.check();
    assert.equal(first.alerted, true, "first crossing must alert");
    assert.equal(stubs.fireCalls.length, 1);
    assert.deepEqual(stubs.fireCalls[0], {
      count: THRESHOLD + 1,
      threshold: THRESHOLD,
      pto: false,
    });
    assert.equal(svc.wasAboveThreshold, true);
    assert.equal(
      stubs.resolveCalls.length,
      0,
      "auto-resolve must not run while above threshold",
    );

    // Second tick: still above.
    stubs.orphanCount = THRESHOLD + 10;
    const second = await productionAssetOrphanAlertService.check();
    assert.equal(second.alerted, false, "second tick must NOT re-alert");
    assert.equal(stubs.fireCalls.length, 1, "fireSweepAlert called only once");

    // Third tick: still above.
    const third = await productionAssetOrphanAlertService.check();
    assert.equal(third.alerted, false);
    assert.equal(stubs.fireCalls.length, 1);
    assert.equal(stubs.resolveCalls.length, 0);
  });

  it("auto-resolves once the count drops back to/below threshold and re-arms the latch", async () => {
    // Cross above first.
    stubs.orphanCount = THRESHOLD + 3;
    await productionAssetOrphanAlertService.check();
    assert.equal(stubs.fireCalls.length, 1);
    assert.equal(svc.wasAboveThreshold, true);

    // Drop back below threshold.
    stubs.orphanCount = THRESHOLD - 1;
    const dropTick = await productionAssetOrphanAlertService.check();
    assert.equal(dropTick.alerted, false);
    assert.equal(
      stubs.resolveCalls.length,
      1,
      "auto-resolve must run exactly once when crossing back below",
    );
    assert.deepEqual(stubs.resolveCalls[0], {
      count: THRESHOLD - 1,
      threshold: THRESHOLD,
    });
    assert.equal(svc.wasAboveThreshold, false, "latch must re-arm");
    assert.equal(stubs.fireCalls.length, 1, "no new fire on the drop tick");

    // Next clean tick: still no alert, auto-resolve runs again (idempotent).
    await productionAssetOrphanAlertService.check();
    assert.equal(stubs.fireCalls.length, 1);
    assert.equal(stubs.resolveCalls.length, 2);

    // Cross above AGAIN: alert must fire (latch was re-armed).
    stubs.orphanCount = THRESHOLD + 1;
    const recross = await productionAssetOrphanAlertService.check();
    assert.equal(recross.alerted, true, "re-crossing must fire again");
    assert.equal(stubs.fireCalls.length, 2);
  });

  it("PTO mute swallows the alert without re-firing every tick", async () => {
    stubs.ptoActive = true;
    stubs.orphanCount = THRESHOLD + 2;

    // First tick under PTO: fireSweepAlert is called (which in PTO mode
    // returns without writing the alert), and `alerted` is still flagged
    // true because check() treats the crossing as consumed.
    const firstUnderPto = await productionAssetOrphanAlertService.check();
    assert.equal(firstUnderPto.alerted, true);
    assert.equal(stubs.fireCalls.length, 1);
    assert.equal(stubs.fireCalls[0].pto, true, "PTO suppression observed");
    assert.equal(
      svc.wasAboveThreshold,
      true,
      "latch must flip even when PTO swallowed the email/alert",
    );

    // Subsequent PTO ticks while still above: must NOT keep calling
    // fireSweepAlert. This is the core "no spam every tick" property.
    for (let i = 0; i < 5; i++) {
      const tick = await productionAssetOrphanAlertService.check();
      assert.equal(tick.alerted, false, `PTO tick ${i} must not alert`);
    }
    assert.equal(
      stubs.fireCalls.length,
      1,
      "PTO mute + once-per-crossing => fireSweepAlert called only once",
    );
    assert.equal(
      stubs.resolveCalls.length,
      0,
      "no auto-resolve while still above threshold under PTO",
    );
  });
});
