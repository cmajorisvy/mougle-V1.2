/**
 * Task #389 — Audience-retention sweep failure alert.
 *
 * Verifies that a failing `runRetentionSweep` fires a founder
 * `platform_alerts` row via `audience-retention-failure-alert-service`,
 * dedup'd repeated failures within the cooldown, and auto-resolves the
 * open alert once the next sweep succeeds.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts, systemSettings } from "@shared/schema";
import {
  AUDIENCE_RETENTION_MODE_SETTING_KEY,
  AUDIENCE_RETENTION_SETTING_KEY,
  resetAudienceRetentionStateForTests,
  runRetentionSweep,
  setAudienceArchiveWriter,
  setRetentionMode,
} from "../server/services/audience-retention-service";
import {
  AUDIENCE_RETENTION_ALERT_TYPE,
  audienceRetentionFailureAlertService,
} from "../server/services/audience-retention-failure-alert-service";
import {
  audienceMessages,
  audienceModerationCommands,
  audienceSafetyDecisions,
} from "../shared/omni-channel-audience-schema";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";

const origDelete = (db as any).delete.bind(db);

function patchDeleteFailure(message: string) {
  (db as any).delete = (table: any) => {
    if (table === audienceSafetyDecisions) {
      throw new Error(message);
    }
    return origDelete(table);
  };
}

async function clearOurAlerts() {
  await db
    .delete(platformAlerts)
    .where(eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE));
}

beforeEach(async () => {
  (db as any).delete = origDelete;
  audienceRetentionFailureAlertService.resetForTests();
  await resetAudienceRetentionStateForTests();
  await clearOurAlerts();
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_RETENTION_SETTING_KEY));
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_RETENTION_MODE_SETTING_KEY));
  delete process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS;
});

afterEach(async () => {
  (db as any).delete = origDelete;
  await clearOurAlerts();
});

async function seedOldArchiveable(connectorId: string, ageDays: number) {
  const svc = omniChannelAudienceSafetyService;
  if (!(await svc.getConnector(connectorId))) {
    await svc.registerConnector({
      connectorId,
      platform: "youtube",
      accountId: "y",
      displayName: "y",
      permissions: { canReadComments: true, canReadLiveChat: true } as any,
    });
  }
  const m = await svc.ingestAudienceMessage({
    connectorId,
    platform: "youtube",
    externalMessageId: `ext_${Math.random().toString(36).slice(2, 8)}`,
    externalAuthorId: "a1",
    authorDisplayName: "a",
    messageText: "hello",
    messageType: "comment",
  });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  const cmd = await svc.buildAudienceModerationCommand({
    decisionId: d.decisionId,
    requestedAction: "no_action",
    requestedBy: "ai_moderator",
  });
  const oldTs = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  await db
    .update(audienceMessages)
    .set({ receivedAt: oldTs })
    .where(eq(audienceMessages.messageId, m.messageId));
  await db
    .update(audienceSafetyDecisions)
    .set({ decidedAt: oldTs })
    .where(eq(audienceSafetyDecisions.decisionId, d.decisionId));
  await db
    .update(audienceModerationCommands)
    .set({ createdAt: oldTs })
    .where(eq(audienceModerationCommands.commandId, cmd.commandId));
  return { messageId: m.messageId, decisionId: d.decisionId, commandId: cmd.commandId };
}

test("failed sweep fires a founder alert with error + cutoff", async () => {
  process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS = "0";
  patchDeleteFailure("supabase unreachable: ECONNREFUSED");

  const r = await runRetentionSweep(30, "scheduled");
  assert.ok(r.error, "sweep should record an error");

  const open = await db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    );
  assert.equal(open.length, 1, "exactly one open alert");
  const row = open[0];
  assert.match(row.message, /Audience retention sweep failed/);
  assert.match(row.message, /supabase unreachable/);
  const d = (row.details as Record<string, any>) ?? {};
  assert.equal(d.source, "audience-retention-failure-alert-service");
  assert.equal(d.retentionDays, 30);
  assert.equal(d.trigger, "scheduled");
  assert.equal(d.consecutiveFailures, 1);
  assert.ok(typeof d.cutoffIso === "string");
});

test("repeated failures inside the dedup window are suppressed", async () => {
  process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS = String(60 * 60 * 1000);
  patchDeleteFailure("db down");

  await runRetentionSweep(30, "scheduled");
  await runRetentionSweep(30, "scheduled");
  await runRetentionSweep(30, "scheduled");

  const open = await db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    );
  assert.equal(open.length, 1, "dedup must collapse repeated failures");
});

test("successful sweep auto-resolves any open failure alert", async () => {
  process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS = "0";
  patchDeleteFailure("transient outage");

  await runRetentionSweep(30, "scheduled");
  const beforeOpen = await db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    );
  assert.equal(beforeOpen.length, 1);
  const alertId = beforeOpen[0].id;

  // Restore db, run successful sweep.
  (db as any).delete = origDelete;
  const ok = await runRetentionSweep(30, "scheduled");
  assert.equal(ok.error, null);

  const rows = await db
    .select()
    .from(platformAlerts)
    .where(eq(platformAlerts.id, alertId));
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.acknowledged, true, "alert should be auto-acknowledged");
  assert.equal(row.acknowledgedBy, "system");
  assert.ok(row.acknowledgedAt instanceof Date);
  const d = (row.details as Record<string, any>) ?? {};
  assert.equal(d.autoResolved, true);
  assert.equal(d.autoResolvedRetentionDays, 30);
  assert.equal(d.autoResolvedTrigger, "scheduled");
  assert.ok(typeof d.autoResolvedCutoffIso === "string");

  // Subsequent failure after a healthy run is treated as the first
  // failure again (consecutiveFailures resets to 1).
  patchDeleteFailure("flaky again");
  await runRetentionSweep(30, "scheduled");
  const reopened = await db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    );
  assert.equal(reopened.length, 1);
  const nd = (reopened[0].details as Record<string, any>) ?? {};
  assert.equal(nd.consecutiveFailures, 1);
});

test("silent archive upload failure (writer returns empty path) fires a founder alert", async () => {
  process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS = "0";
  await seedOldArchiveable("c_silent_fail", 200);
  await setRetentionMode(
    { messages: "archive", decisions: "archive", commands: "archive" },
    "test_admin",
  );
  // Writer that returns "" — simulates a misconfigured bucket / quota
  // hit where the upload call resolves without throwing but no archive
  // file actually lands in storage.
  setAudienceArchiveWriter({
    async write() {
      return "";
    },
  });

  const r = await runRetentionSweep(90, "scheduled");
  assert.ok(
    r.error && /silently failed/i.test(r.error),
    `expected silent-failure error, got: ${r.error}`,
  );
  assert.equal(r.messagesPruned, 0);
  assert.equal(r.decisionsPruned, 0);
  assert.equal(r.commandsPruned, 0);
  assert.equal(r.archiveFiles.length, 0);

  // Rows must still be in Postgres (no DELETE happened).
  const survivors = await db.select().from(audienceMessages);
  assert.ok(survivors.length >= 1, "old messages must remain for retry");

  const open = await db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    );
  assert.equal(open.length, 1, "exactly one open silent-failure alert");
  assert.match(open[0].message, /silently failed/i);
  const d = (open[0].details as Record<string, any>) ?? {};
  assert.equal(d.trigger, "scheduled");
  assert.equal(d.retentionDays, 90);
});

test("successful sweep after a silent archive failure auto-resolves the alert", async () => {
  process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS = "0";
  await seedOldArchiveable("c_silent_recover", 200);
  await setRetentionMode(
    { messages: "archive", decisions: "archive", commands: "archive" },
    "test_admin",
  );

  // First sweep: writer silently no-ops -> alert fires.
  setAudienceArchiveWriter({
    async write() {
      return "";
    },
  });
  const failed = await runRetentionSweep(90, "scheduled");
  assert.ok(failed.error && /silently failed/i.test(failed.error));

  const opened = await db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    );
  assert.equal(opened.length, 1);
  const alertId = opened[0].id;

  // Second sweep: writer now returns a real path -> rows archived &
  // deleted, alert should auto-resolve.
  let captured = 0;
  setAudienceArchiveWriter({
    async write(table, _payload, meta) {
      captured += 1;
      return `/test-bucket/audience-archive/${table}/${meta.sweepStartedAt}.jsonl.gz`;
    },
  });
  const ok = await runRetentionSweep(90, "scheduled");
  assert.equal(ok.error, null, `recovery sweep should be clean: ${ok.error}`);
  assert.ok(captured >= 1, "writer must have been called for at least one table");
  assert.ok(ok.archiveFiles.length >= 1);

  const rows = await db
    .select()
    .from(platformAlerts)
    .where(eq(platformAlerts.id, alertId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].acknowledged, true, "silent-failure alert should be auto-cleared");
  const ad = (rows[0].details as Record<string, any>) ?? {};
  assert.equal(ad.autoResolved, true);
});
