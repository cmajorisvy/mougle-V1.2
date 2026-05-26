/**
 * Task #222 — Verify that `shorts-backlog-alert-service.check()` auto-clears
 * open `shorts_draft_backlog` platform alerts when the pending draft count
 * is back at or below the configured threshold, mirroring the cover-orphan
 * sweep pattern (task #179).
 *
 * The test seeds a real `platform_alerts` row tagged with a per-run marker
 * (so a shared dev DB stays safe), bumps the threshold to a value that is
 * guaranteed to be >= the current pending count, calls `check()`, and
 * asserts the row is now acknowledged by "system" with the expected
 * `details.autoResolved*` shape.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts, systemSettings } from "../shared/schema";
import { shortsBacklogAlertService } from "../server/services/shorts-backlog-alert-service";

const ALERT_TYPE = "shorts_draft_backlog";
const THRESHOLD_KEY = "shorts_draft_queue_threshold";
const TEST_MARKER = `t222-${randomUUID()}`;
const HUGE_THRESHOLD = 1_000_000;

let prevThreshold: { value: string; updatedBy: string | null } | null = null;

async function seedOpenAlert(): Promise<string> {
  const [row] = await db
    .insert(platformAlerts)
    .values({
      type: ALERT_TYPE,
      severity: "warning",
      message: `[${TEST_MARKER}] seeded open shorts backlog alert`,
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

describe("shortsBacklogAlertService.check() auto-resolves open backlog alerts", () => {
  before(async () => {
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
        value: String(HUGE_THRESHOLD),
        updatedBy: TEST_MARKER,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: String(HUGE_THRESHOLD),
          updatedBy: TEST_MARKER,
          updatedAt: new Date(),
        },
      });
  });

  after(async () => {
    // Remove only the alert rows this test created (matched by marker).
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
  });

  it("clears the open alert when the backlog is at or below threshold", async () => {
    const alertId = await seedOpenAlert();

    // Force initialization with the huge threshold, then run a fresh check().
    await (shortsBacklogAlertService as any).initialize();
    await shortsBacklogAlertService.check();

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
    const details = (row.details as Record<string, any> | null) ?? {};
    assert.equal(
      details.autoResolved,
      true,
      "details.autoResolved should be true",
    );
    assert.equal(
      typeof details.autoResolvedAt,
      "string",
      "details.autoResolvedAt should be set",
    );
    assert.equal(
      typeof details.autoResolvedCount,
      "number",
      "details.autoResolvedCount should be a number",
    );
    assert.equal(
      details.autoResolvedThreshold,
      HUGE_THRESHOLD,
      "details.autoResolvedThreshold should reflect the configured threshold",
    );
    // Original seeded details must be preserved.
    assert.equal(details.source, TEST_MARKER);
    assert.equal(details.seeded, true);
  });

  it("autoResolveOpenAlerts leaves already-acknowledged rows untouched", async () => {
    // Seed an already-acknowledged row; the WHERE clause filters
    // `acknowledged = false`, so the private method must not touch it.
    const ackAt = new Date(Date.now() - 60_000);
    const [row] = await db
      .insert(platformAlerts)
      .values({
        type: ALERT_TYPE,
        severity: "warning",
        message: `[${TEST_MARKER}] previously-acked row`,
        details: { source: TEST_MARKER, seeded: true, handAcked: true },
        acknowledged: true,
        acknowledgedBy: "human-admin",
        acknowledgedAt: ackAt,
        autoTriggered: true,
      })
      .returning();

    await (shortsBacklogAlertService as any).autoResolveOpenAlerts(
      0,
      HUGE_THRESHOLD,
    );

    const after = await getAlert(row.id);
    assert.ok(after);
    assert.equal(after.acknowledgedBy, "human-admin");
    const d = (after.details as Record<string, any> | null) ?? {};
    assert.notEqual(
      d.autoResolved,
      true,
      "human-acked rows must not be overwritten as auto-resolved",
    );
  });
});
