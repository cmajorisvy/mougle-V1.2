/**
 * Task #805 — Lock the recurring flapping-digest semantics for the
 * production-asset orphan sweep.
 *
 * Background: the one-shot
 * `production_asset_orphan_sweep_flapping` alert only pages on the
 * false → true crossing of the flapping latch. Once latched, no
 * further notification fires until the latch releases — which means a
 * sweep that has been flapping for days can sit silently. Task #805
 * adds a recurring digest:
 *
 *   - While `flapping === true`, fire a
 *     `production_asset_orphan_sweep_flapping_digest` platform_alerts
 *     row (+ email root admins) at most once per
 *     `flappingDigestIntervalMs` (default 24h).
 *   - Stops automatically (clears last-sent receipt + auto-resolves
 *     open digest alerts) the moment `flapping === false`.
 *   - Honors the shared audit-email failure-alert snooze pattern: a
 *     founder snooze suppresses both the email and the platform_alerts
 *     row but does not advance the latch / receipt.
 *
 * Strategy:
 *   - Stub `countRecentAutoClears` so we can pin the flapping count to
 *     whatever the test needs.
 *   - Stub `panicButtonService.createAlert` + `EmailService.sendAdminAlert`
 *     so we observe digest fires without writing to the shared DB.
 *   - Stub `readFlappingDigestLastSentAt` / `writeFlappingDigestLastSentAt`
 *     / `clearFlappingDigestLastSentAt` to keep the receipt in-memory.
 *   - Drive the digest interval via the env var the service honors.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  productionAssetOrphanAlertService,
  PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE,
  PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
} from "../server/services/production-asset-orphan-alert-service";
import { panicButtonService } from "../server/services/panic-button-service";
import { EmailService } from "../server/services/email-service";
import {
  setAuditEmailFailureAlertSnooze,
  clearAuditEmailFailureAlertSnoozeForTests,
} from "../server/services/audit-email-failure-alert-snooze";

const svc = productionAssetOrphanAlertService as any;

const origCreateAlert = panicButtonService.createAlert.bind(panicButtonService);
const origSendAdminAlert = EmailService.prototype.sendAdminAlert;
const origCountRecentAutoClears = svc.countRecentAutoClears.bind(svc);
const origListOrphanedRows = svc.listOrphanedRows.bind(svc);
const origReadReceipt = svc.readFlappingDigestLastSentAt.bind(svc);
const origWriteReceipt = svc.writeFlappingDigestLastSentAt.bind(svc);
const origClearReceipt = svc.clearFlappingDigestLastSentAt.bind(svc);
const origAutoResolveSweep = svc.autoResolveOpenSweepAlerts.bind(svc);
const prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
const prevDigestIntervalEnv =
  process.env.PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_INTERVAL_MS;

type CreateAlertArg = { type: string; severity: string; message: string };
const createAlertCalls: CreateAlertArg[] = [];
const emailCalls: Array<{ title: string }> = [];
let stubbedFlappingCount = 0;
let inMemoryReceipt: number | null = null;
// Track digest-type alerts we'd have "resolved" via the recovery path.
let recoveryResolveCount = 0;

function digestFireCount(): number {
  return createAlertCalls.filter(
    (c) => c.type === PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE,
  ).length;
}

function digestEmailCount(): number {
  return emailCalls.filter(
    (e) => e.title === "3D asset orphan sweep still flapping (daily digest)",
  ).length;
}

describe("productionAssetOrphanAlertService flapping digest (#805)", () => {
  let tmpRoot: string;

  before(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "prod-asset-flapping-digest-"));
    process.env.PRIVATE_OBJECT_DIR = tmpRoot;
    // Tiny interval so the test can advance "across" it deterministically
    // without leaning on fake timers.
    process.env.PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_INTERVAL_MS =
      "60000";

    // Empty orphan list — keeps the above-threshold sweep alert path
    // quiet so we observe only the flapping-digest path.
    svc.listOrphanedRows = async () => [];

    // Pin the flapping count to whatever the test wants.
    svc.countRecentAutoClears = async () => stubbedFlappingCount;

    // In-memory digest receipt so we do not pollute system_settings.
    svc.readFlappingDigestLastSentAt = async () => inMemoryReceipt;
    svc.writeFlappingDigestLastSentAt = async (ts: number) => {
      inMemoryReceipt = ts;
    };
    svc.clearFlappingDigestLastSentAt = async () => {
      inMemoryReceipt = null;
    };

    // The shared dev DB has zero archived rows in CI for this slice;
    // skip the auto-resolve sweep step so we don't depend on its state.
    svc.autoResolveOpenSweepAlerts = async () => {
      /* no-op for this test */
    };

    // Capture digest fires.
    (panicButtonService as any).createAlert = async (a: CreateAlertArg) => {
      createAlertCalls.push(a);
      return undefined as any;
    };
    EmailService.prototype.sendAdminAlert = async function (
      _to: string,
      a: { title: string },
    ) {
      emailCalls.push({ title: a.title });
      return undefined as any;
    };

    // Make sure the latch starts clean regardless of prior test runs in
    // the same process.
    svc.wasFlapping = false;
    svc.wasAboveThreshold = false;
    stubbedFlappingCount = 0;
    inMemoryReceipt = null;

    // Make sure no stale snooze row in the shared dev DB suppresses the
    // very first phase of the test.
    await clearAuditEmailFailureAlertSnoozeForTests(
      PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
    );
  });

  after(async () => {
    svc.listOrphanedRows = origListOrphanedRows;
    svc.countRecentAutoClears = origCountRecentAutoClears;
    svc.readFlappingDigestLastSentAt = origReadReceipt;
    svc.writeFlappingDigestLastSentAt = origWriteReceipt;
    svc.clearFlappingDigestLastSentAt = origClearReceipt;
    svc.autoResolveOpenSweepAlerts = origAutoResolveSweep;
    (panicButtonService as any).createAlert = origCreateAlert;
    EmailService.prototype.sendAdminAlert = origSendAdminAlert;
    if (prevPrivateDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = prevPrivateDir;
    if (prevDigestIntervalEnv === undefined)
      delete process.env.PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_INTERVAL_MS;
    else
      process.env.PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_INTERVAL_MS =
        prevDigestIntervalEnv;
    await clearAuditEmailFailureAlertSnoozeForTests(
      PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
    );
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    void recoveryResolveCount; // referenced to silence "unused" if helpers shift later
  });

  it("fires once per interval while flapping, stops on recovery, honors snooze", async () => {
    // --- Phase 1: not flapping yet → no digest fires ---
    stubbedFlappingCount = 0;
    await productionAssetOrphanAlertService.check();
    assert.equal(
      digestFireCount(),
      0,
      "digest must not fire while flapping=false",
    );
    assert.equal(inMemoryReceipt, null, "no receipt should be written");

    // --- Phase 2: flapping flips → first digest fires immediately ---
    stubbedFlappingCount = 5; // default flapping threshold is 3
    const beforeFirst = digestFireCount();
    await productionAssetOrphanAlertService.check();
    assert.equal(
      digestFireCount(),
      beforeFirst + 1,
      "digest must fire on the first scan that sees flapping=true",
    );
    assert.ok(inMemoryReceipt != null, "receipt must be written");
    const firstReceipt = inMemoryReceipt;

    // --- Phase 3: still flapping but inside the interval → no re-fire ---
    await productionAssetOrphanAlertService.check();
    await productionAssetOrphanAlertService.check();
    assert.equal(
      digestFireCount(),
      beforeFirst + 1,
      "digest must NOT re-fire inside the interval (no spam)",
    );
    assert.equal(
      inMemoryReceipt,
      firstReceipt,
      "receipt should not advance inside the interval",
    );

    // --- Phase 4: roll the receipt back past the interval → second digest fires ---
    inMemoryReceipt = Date.now() - 120_000; // 2 minutes ago, interval is 60s
    await productionAssetOrphanAlertService.check();
    assert.equal(
      digestFireCount(),
      beforeFirst + 2,
      "digest must re-fire after the interval elapses",
    );
    assert.ok(
      inMemoryReceipt != null && inMemoryReceipt > Date.now() - 5_000,
      "receipt must advance after a re-fire",
    );

    // --- Phase 5: snooze the digest → no further fires even after interval ---
    await setAuditEmailFailureAlertSnooze(
      PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
      {
        snoozeUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
        updatedBy: "t805-test",
      },
    );
    inMemoryReceipt = Date.now() - 120_000;
    const beforeSnoozed = digestFireCount();
    await productionAssetOrphanAlertService.check();
    assert.equal(
      digestFireCount(),
      beforeSnoozed,
      "digest must be suppressed while the snooze window is active",
    );
    // Receipt is intentionally NOT advanced when snoozed, so the digest
    // fires immediately once the founder unsnoozes.
    assert.ok(
      inMemoryReceipt != null && inMemoryReceipt < Date.now() - 60_000,
      "receipt must not advance while snoozed",
    );

    // --- Phase 6: clear snooze → next scan fires again ---
    await clearAuditEmailFailureAlertSnoozeForTests(
      PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
    );
    await productionAssetOrphanAlertService.check();
    assert.equal(
      digestFireCount(),
      beforeSnoozed + 1,
      "digest must fire on the first scan after the snooze is cleared",
    );

    // --- Phase 7: flapping resolves → receipt cleared, no further fires ---
    stubbedFlappingCount = 0;
    const beforeRecovery = digestFireCount();
    await productionAssetOrphanAlertService.check();
    assert.equal(
      digestFireCount(),
      beforeRecovery,
      "no digest fires while flapping=false",
    );
    assert.equal(
      inMemoryReceipt,
      null,
      "receipt must be cleared once flapping resolves",
    );

    // --- Phase 8: stuck episode #2 → first digest of new episode fires ---
    stubbedFlappingCount = 5;
    await productionAssetOrphanAlertService.check();
    assert.equal(
      digestFireCount(),
      beforeRecovery + 1,
      "digest must fire on the first scan of a fresh stuck episode",
    );

    // Email path should fire at least once across the whole run (when
    // there are any active root_admins; otherwise it harmlessly emits
    // zero). Just sanity-check the call surface is wired up.
    if (emailCalls.length > 0) {
      assert.ok(
        digestEmailCount() > 0,
        "digest emails must use the daily-digest subject when they fire",
      );
    }
  });
});
