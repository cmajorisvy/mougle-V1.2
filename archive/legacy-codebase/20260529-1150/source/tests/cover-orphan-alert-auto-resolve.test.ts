/**
 * Task #191 — Guard the auto-acknowledgement of `broadcast_cover_orphans`
 * platform alerts that was added in task #179.
 *
 * The scheduled cover sweep is supposed to clear open
 * `broadcast_cover_orphans` alerts when the latest scan shows the orphan
 * count is back at or below the configured threshold. If a future refactor
 * of `cover-orphan-alert-service.ts` silently dropped that behavior,
 * founders would once again have to hand-acknowledge stale warnings.
 *
 * This test seeds a real `platform_alerts` row against the configured
 * database, points the service at a temporary covers directory that is
 * either empty (healthy) or above-threshold, and verifies that:
 *   - A healthy sweep flips the row to acknowledged=true,
 *     acknowledgedBy="system", details.autoResolved===true.
 *   - An above-threshold sweep leaves the open alert untouched.
 *
 * The test is fully self-cleaning: every alert row it inserts is tagged
 * with a unique source marker so the after-hook can delete only its own
 * rows even when run against a shared dev DB.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts, systemSettings } from "../shared/schema";
import { coverOrphanAlertService } from "../server/services/cover-orphan-alert-service";
import { broadcastCompositorService } from "../server/services/broadcast-compositor-service";

const ALERT_TYPE = "broadcast_cover_orphans";
const TEST_MARKER = `t191-${randomUUID()}`;
const THRESHOLD_KEY = "cover_orphan_alert_threshold";
const TEST_THRESHOLD = 1;

let tmpRoot: string;
let coversDir: string;
let prevPrivateDir: string | undefined;
let prevThreshold: { value: string; updatedBy: string | null } | null = null;
const origListBroadcastIds = broadcastCompositorService.listBroadcastIds;

async function seedOpenAlert(): Promise<string> {
  const [row] = await db
    .insert(platformAlerts)
    .values({
      type: ALERT_TYPE,
      severity: "warning",
      message: `[${TEST_MARKER}] seeded open orphan alert`,
      details: { source: TEST_MARKER, seeded: true },
      acknowledged: false,
      autoTriggered: true,
    })
    .returning();
  return row.id;
}

async function getAlert(id: string) {
  const rows = await db
    .select()
    .from(platformAlerts)
    .where(eq(platformAlerts.id, id))
    .limit(1);
  return rows[0];
}

async function writeOrphanFiles(count: number) {
  for (let i = 0; i < count; i++) {
    writeFileSync(
      pathResolve(coversDir, `bc-orphan-${TEST_MARKER}-${i}.png`),
      Buffer.from("x"),
    );
  }
}

describe("coverOrphanAlertService.check() auto-resolves open orphan alerts", () => {
  before(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "cover-orphan-alert-"));
    prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = tmpRoot;
    coversDir = pathResolve(tmpRoot, "broadcasts", "covers");
    mkdirSync(coversDir, { recursive: true });

    // Ensure scanOrphanCount only sees this test's files.
    (broadcastCompositorService as any).listBroadcastIds = async () => [];

    // Snapshot and override the threshold so the "above threshold"
    // assertion can be triggered with a handful of files instead of 26.
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
    await db
      .insert(systemSettings)
      .values({
        key: THRESHOLD_KEY,
        value: String(TEST_THRESHOLD),
        updatedBy: TEST_MARKER,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: String(TEST_THRESHOLD),
          updatedBy: TEST_MARKER,
          updatedAt: new Date(),
        },
      });
  });

  after(async () => {
    (broadcastCompositorService as any).listBroadcastIds =
      origListBroadcastIds;

    // Delete only the alert rows this test created (matched by marker).
    try {
      const ours = await db
        .select({ id: platformAlerts.id, details: platformAlerts.details })
        .from(platformAlerts)
        .where(eq(platformAlerts.type, ALERT_TYPE));
      for (const row of ours) {
        const d = (row.details as Record<string, any> | null) ?? {};
        if (d?.source === TEST_MARKER) {
          await db.delete(platformAlerts).where(eq(platformAlerts.id, row.id));
        }
      }
    } catch {
      /* best-effort */
    }

    // Restore the previous threshold setting (or remove ours if there was none).
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
          .where(
            and(
              eq(systemSettings.key, THRESHOLD_KEY),
              eq(systemSettings.updatedBy, TEST_MARKER),
            ),
          );
      }
    } catch {
      /* best-effort */
    }

    if (prevPrivateDir === undefined) {
      delete process.env.PRIVATE_OBJECT_DIR;
    } else {
      process.env.PRIVATE_OBJECT_DIR = prevPrivateDir;
    }
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("clears the open alert when the sweep reports 0 orphans", async () => {
    // Empty covers directory → orphan count is 0, which is <= threshold.
    const alertId = await seedOpenAlert();

    const result = await coverOrphanAlertService.check();
    assert.equal(result.orphanCount, 0, "scan should see 0 orphans");
    assert.equal(result.alerted, false, "no new alert should be fired");

    const row = await getAlert(alertId);
    assert.ok(row, "seeded alert row should still exist");
    assert.equal(row.acknowledged, true, "alert should be auto-acknowledged");
    assert.equal(
      row.acknowledgedBy,
      "system",
      "alert should be acknowledged by the system",
    );
    assert.ok(
      row.acknowledgedAt instanceof Date,
      "alert should have an acknowledgedAt timestamp",
    );
    const details =
      (row.details as Record<string, any> | null) ?? {};
    assert.equal(
      details.autoResolved,
      true,
      "details.autoResolved should be true",
    );
    assert.equal(
      details.autoResolvedOrphanCount,
      0,
      "details.autoResolvedOrphanCount should reflect the healthy count",
    );
    assert.equal(
      details.autoResolvedThreshold,
      TEST_THRESHOLD,
      "details.autoResolvedThreshold should reflect the configured threshold",
    );
    // Original seeded details must be preserved.
    assert.equal(details.source, TEST_MARKER);
    assert.equal(details.seeded, true);
  });

  it("does NOT clear the open alert while orphan count is above threshold", async () => {
    // Put more orphan files on disk than the test threshold allows.
    await writeOrphanFiles(TEST_THRESHOLD + 2);

    const alertId = await seedOpenAlert();

    // Latch wasAboveThreshold=true so check() does not also fire a brand-new
    // alert (that path is covered by other tests); we only care that the
    // existing open alert is left untouched while we are still above the line.
    (coverOrphanAlertService as any).wasAboveThreshold = true;

    const result = await coverOrphanAlertService.check();
    assert.ok(
      result.orphanCount > TEST_THRESHOLD,
      `scan should report > ${TEST_THRESHOLD} orphans (got ${result.orphanCount})`,
    );

    const row = await getAlert(alertId);
    assert.ok(row, "seeded alert row should still exist");
    assert.equal(
      row.acknowledged,
      false,
      "alert must remain unacknowledged while above threshold",
    );
    assert.equal(row.acknowledgedBy, null);
    assert.equal(row.acknowledgedAt, null);
    const details = (row.details as Record<string, any> | null) ?? {};
    assert.notEqual(
      details.autoResolved,
      true,
      "details.autoResolved must not be set while above threshold",
    );
  });
});
