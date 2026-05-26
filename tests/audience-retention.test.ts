import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";

import { db } from "../server/db";
import {
  audienceArchiveDeletions,
  audienceArchiveTrashPurges,
  audienceChannelConnectors,
  audienceMessages,
  audienceModerationCommands,
  audienceSafetyDecisions,
  gatewayAlertSettingsAudit,
} from "../shared/omni-channel-audience-schema";
import { systemSettings } from "@shared/schema";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { gunzipSync, gzipSync } from "node:zlib";
import { Readable } from "node:stream";
import {
  AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY,
  AUDIENCE_RETENTION_MODE_SETTING_KEY,
  AUDIENCE_RETENTION_SETTING_KEY,
  DEFAULT_AUDIENCE_ARCHIVE_RETENTION_DAYS,
  DEFAULT_AUDIENCE_RETENTION_DAYS,
  DEFAULT_AUDIENCE_ARCHIVE_TRASH_WARN_BYTES,
  DEFAULT_AUDIENCE_ARCHIVE_TRASH_WARN_FILES,
  getArchiveStats,
  getArchiveTrashStats,
  archiveTrashGraceDaysWithSource,
  DEFAULT_AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS,
  getAudienceRestoreLog,
  getEffectiveArchiveRetentionPolicy,
  getEffectiveArchiveRetentionPolicyWithSource,
  getEffectiveRetentionDays,
  getEffectiveRetentionMode,
  getRetentionStats,
  listArchiveDeletions,
  resetAudienceRetentionStateForTests,
  restoreFromArchive,
  restoreFromTrashDeletion,
  runArchiveCleanup,
  runArchiveTrashPurge,
  listArchiveTrashPurges,
  runRetentionSweep,
  setArchiveRetentionPolicy,
  previewAudienceArchive,
  setAudienceArchiveReader,
  setAudienceArchiveWriter,
  setRetentionMode,
  setRetentionOverride,
  type AudienceArchiveListing,
  type AudienceArchiveReader,
  type AudienceArchiveWriter,
} from "../server/services/audience-retention-service";

const svc = omniChannelAudienceSafetyService;

// Directly insert an ancient (message, decision, command) triple via the DB
// so the retention test suite isn't sensitive to read-after-write races
// against the Supabase transaction pooler that can intermittently affect
// the full ingest -> evaluate -> command service pipeline. The retention
// sweep only ever looks at `receivedAt` / `decidedAt` / `createdAt` plus
// the row counts per table, so minimal rows are enough to exercise every
// pruning / archiving code path.
async function seedOld(connectorId: string, ageDays: number) {
  if (!(await svc.getConnector(connectorId))) {
    await svc.registerConnector({
      connectorId,
      platform: "youtube",
      accountId: "y",
      displayName: "y",
      permissions: { canReadComments: true, canReadLiveChat: true } as any,
    });
  }
  const oldTs = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const messageId = `aud_test_msg_${suffix}`;
  const decisionId = `aud_test_dec_${suffix}`;
  const commandId = `aud_test_cmd_${suffix}`;
  const externalMessageId = `ext_${suffix}`;

  await db.insert(audienceMessages).values({
    messageId,
    connectorId,
    platform: "youtube",
    externalMessageId,
    externalAuthorIdHash: "deadbeef",
    authorDisplayNameSafe: "a",
    messageText: "hello world",
    messageType: "comment",
    receivedAt: oldTs,
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    realSendAllowed: false,
    executionEnabled: false,
    safetyEnvelope: {},
    rawMetadataRedacted: {},
  } as any);

  await db.insert(audienceSafetyDecisions).values({
    decisionId,
    messageId,
    platform: "youtube",
    action: "ignore",
    reasonCodes: [],
    scores: {
      toxicityScore: 0,
      spamScore: 0,
      abuseScore: 0,
      hateScore: 0,
      sexualContentRisk: 0,
      violenceRisk: 0,
      selfHarmRisk: 0,
      misinformationRisk: 0,
      piiRisk: 0,
      copyrightRisk: 0,
      impersonationRisk: 0,
      botRisk: 0,
      relevanceScore: 0,
    },
    giftValue: null,
    allowedForRobotSpeech: false,
    allowedForAnchorSpeech: false,
    allowedForScreenDisplay: false,
    allowedForAutoReply: false,
    allowedForModerationAction: false,
    requiresHumanReview: false,
    sensitivityOverride: false,
    cAudienceSafety: 1,
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    realSendAllowed: false,
    executionEnabled: false,
    notPublished: true,
    safetyEnvelope: {},
    decidedAt: oldTs,
  } as any);

  await db.insert(audienceModerationCommands).values({
    commandId,
    decisionId,
    platform: "youtube",
    connectorId,
    externalMessageId,
    requestedAction: "no_action",
    requestedBy: "ai_moderator",
    commandMode: "simulation_only",
    commandAllowed: false,
    blockerReason: null,
    requiresHumanApproval: false,
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    realSendAllowed: false,
    executionEnabled: false,
    platformSendAllowed: false,
    decisionFingerprint: "test",
    safetyEnvelope: {},
    createdAt: oldTs,
  } as any);

  return { messageId, decisionId, commandId };
}

// Keep test runs fast: zero out the archive-upload retry backoff so the
// retry loop in `archiveAndDelete` doesn't sleep between attempts.
process.env.AUDIENCE_ARCHIVE_UPLOAD_RETRY_BACKOFF_MS = "0";

beforeEach(async () => {
  await svc.reset();
  await db.delete(systemSettings).where(eq(systemSettings.key, AUDIENCE_RETENTION_SETTING_KEY));
  await db.delete(systemSettings).where(eq(systemSettings.key, AUDIENCE_RETENTION_MODE_SETTING_KEY));
  await resetAudienceRetentionStateForTests();
  delete process.env.AUDIENCE_ARCHIVE_UPLOAD_RETRIES;
});

function makeCapturingArchiveWriter() {
  const writes: Array<{
    table: string;
    path: string;
    rowCount: number;
    payload: Buffer;
    meta: { rowCount: number; cutoffIso: string; sweepStartedAt: string };
  }> = [];
  const writer: AudienceArchiveWriter = {
    async write(table, gzipped, meta) {
      const path = `/test-bucket/audience-archive/${table}/${meta.sweepStartedAt.replace(/[:.]/g, "-")}.jsonl.gz`;
      writes.push({ table, path, rowCount: meta.rowCount, payload: gzipped, meta });
      return path;
    },
  };
  return { writer, writes };
}

test("default retention is 90 days", async () => {
  const eff = await getEffectiveRetentionDays();
  assert.equal(eff.retentionDays, DEFAULT_AUDIENCE_RETENTION_DAYS);
  assert.equal(eff.override, null);
});

test("sweep deletes old messages, decisions, commands; keeps fresh rows and never touches connectors", async () => {
  const old1 = await seedOld("c_ret_old1", 120);
  const old2 = await seedOld("c_ret_old1", 200);
  // fresh row stays
  const fresh = await svc.ingestAudienceMessage({
    connectorId: "c_ret_old1",
    platform: "youtube",
    externalMessageId: "ext_fresh",
    externalAuthorId: "f",
    authorDisplayName: "f",
    messageText: "fresh",
    messageType: "comment",
  });
  await svc.evaluateAudienceSafety(fresh.messageId);

  const before = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(audienceChannelConnectors);
  const result = await runRetentionSweep(90, "manual");

  assert.equal(result.error, null);
  assert.equal(result.retentionDays, 90);
  assert.ok(result.messagesPruned >= 2, `messages pruned=${result.messagesPruned}`);
  assert.ok(result.decisionsPruned >= 2);
  assert.ok(result.commandsPruned >= 2);
  assert.equal(result.totalPruned, result.messagesPruned + result.decisionsPruned + result.commandsPruned);

  // connectors untouched
  const after = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(audienceChannelConnectors);
  assert.equal(after[0].c, before[0].c);

  // old rows gone
  const m1 = await db.select().from(audienceMessages).where(eq(audienceMessages.messageId, old1.messageId));
  assert.equal(m1.length, 0);
  const m2 = await db.select().from(audienceMessages).where(eq(audienceMessages.messageId, old2.messageId));
  assert.equal(m2.length, 0);

  // fresh row stays
  const mFresh = await db
    .select()
    .from(audienceMessages)
    .where(eq(audienceMessages.messageId, fresh.messageId));
  assert.equal(mFresh.length, 1);
});

test("admin override is honoured and persisted in system_settings", async () => {
  await seedOld("c_ret_o", 10);
  // default 90d window — 10d row should remain.
  const r1 = await runRetentionSweep();
  assert.equal(r1.messagesPruned, 0);
  assert.equal(r1.decisionsPruned, 0);
  assert.equal(r1.commandsPruned, 0);

  // override to 5d — 10d row now exceeds window.
  const eff = await setRetentionOverride(5, "test_admin");
  assert.equal(eff.retentionDays, 5);
  assert.equal(eff.override, 5);
  const row = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_RETENTION_SETTING_KEY));
  assert.equal(row[0].value, "5");

  const r2 = await runRetentionSweep();
  assert.equal(r2.retentionDays, 5);
  assert.ok(r2.messagesPruned >= 1);
  assert.ok(r2.decisionsPruned >= 1);
  assert.ok(r2.commandsPruned >= 1);

  // clear override — back to default 90d
  const cleared = await setRetentionOverride(null);
  assert.equal(cleared.override, null);
  assert.equal(cleared.retentionDays, DEFAULT_AUDIENCE_RETENTION_DAYS);
});

test("retention stats counter tracks total rows pruned and last-run summary", async () => {
  await seedOld("c_ret_s", 200);
  await seedOld("c_ret_s", 200);
  const r = await runRetentionSweep(30, "manual");
  const stats = await getRetentionStats();
  assert.equal(stats.lastRun?.totalPruned, r.totalPruned);
  assert.equal(stats.totalRowsPruned, r.totalPruned);
  assert.equal(stats.runCount, 1);
  assert.equal(stats.defaultRetentionDays, DEFAULT_AUDIENCE_RETENTION_DAYS);
  // Task #418: per-table stale counter is always returned; alertActive is a boolean.
  assert.ok(stats.stalePendingArchive);
  assert.equal(typeof stats.stalePendingArchive.messages, "number");
  assert.equal(typeof stats.stalePendingArchive.decisions, "number");
  assert.equal(typeof stats.stalePendingArchive.commands, "number");
  assert.equal(typeof stats.alertActive, "boolean");
});

test("Task #418: stalePendingArchive counts per-table rows still over the retention window", async () => {
  // Two old message+decision+command triples (200 days each) — both exceed 90-day window.
  await seedOld("c_ret_stale", 200);
  await seedOld("c_ret_stale", 200);
  // Fresh row stays under the window.
  await svc.ingestAudienceMessage({
    connectorId: "c_ret_stale",
    platform: "youtube",
    externalMessageId: "ext_fresh_stale",
    externalAuthorId: "f",
    authorDisplayName: "f",
    messageText: "fresh",
    messageType: "comment",
  });
  const stats = await getRetentionStats();
  assert.ok(
    stats.stalePendingArchive.messages >= 2,
    `expected >=2 stale messages, got ${stats.stalePendingArchive.messages}`,
  );
  assert.ok(stats.stalePendingArchive.decisions >= 2);
  assert.ok(stats.stalePendingArchive.commands >= 2);
});

test("Task #435: sweep prunes audience_restore_log rows older than the restore-log retention window", async () => {
  const { audienceRestoreLog } = await import(
    "../shared/omni-channel-audience-schema"
  );
  const {
    AUDIENCE_RESTORE_LOG_RETENTION_SETTING_KEY,
    DEFAULT_AUDIENCE_RESTORE_LOG_RETENTION_DAYS,
    getEffectiveRestoreLogRetentionDays,
    setRestoreLogRetentionOverride,
  } = await import("../server/services/audience-retention-service");

  await db.delete(audienceRestoreLog);
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_RESTORE_LOG_RETENTION_SETTING_KEY));

  // Default window is 365 days.
  const def = await getEffectiveRestoreLogRetentionDays();
  assert.equal(def.retentionDays, DEFAULT_AUDIENCE_RESTORE_LOG_RETENTION_DAYS);
  assert.equal(def.override, null);

  // The `audience_restore_log` table is shared with other test files that
  // run against the same Supabase DB and can race with this one when the
  // suite runs in parallel. Scope every assertion to a unique tester id so
  // leaked rows from sibling tests can't make this test flaky.
  const TESTER = `task577_${Math.random().toString(36).slice(2, 10)}`;
  const FRESH_PATH = `audience-archive/commands/fresh_${TESTER}.jsonl.gz`;
  const OLD1_PATH = `audience-archive/messages/old1_${TESTER}.jsonl.gz`;
  const OLD2_PATH = `audience-archive/decisions/old2_${TESTER}.jsonl.gz`;

  const scopedRows = async () =>
    db
      .select()
      .from(audienceRestoreLog)
      .where(eq(audienceRestoreLog.restoredBy, TESTER));

  // Seed two ancient rows (well beyond 365 days) and one fresh row.
  const ancient = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000);
  const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  await db.insert(audienceRestoreLog).values([
    {
      restoredAt: ancient,
      archivePath: OLD1_PATH,
      tableName: "messages",
      restoredBy: TESTER,
      rowsParsed: 1,
      rowsInserted: 1,
      rowsSkipped: 0,
      error: null,
    },
    {
      restoredAt: ancient,
      archivePath: OLD2_PATH,
      tableName: "decisions",
      restoredBy: TESTER,
      rowsParsed: 1,
      rowsInserted: 1,
      rowsSkipped: 0,
      error: null,
    },
    {
      restoredAt: recent,
      archivePath: FRESH_PATH,
      tableName: "commands",
      restoredBy: TESTER,
      rowsParsed: 1,
      rowsInserted: 1,
      rowsSkipped: 0,
      error: null,
    },
  ]);

  const r = await runRetentionSweep(undefined, "manual");
  // Other tests may leak ancient rows into this shared table when run in
  // parallel, so assert at-least semantics for the global prune count and
  // verify our own seeded ancient rows are gone.
  assert.ok(
    r.restoreLogPruned >= 2,
    `should prune at least our 2 ancient rows, got ${r.restoreLogPruned}`,
  );
  assert.equal(
    r.restoreLogRetentionDays,
    DEFAULT_AUDIENCE_RESTORE_LOG_RETENTION_DAYS,
  );
  assert.ok(r.restoreLogCutoffIso);

  const remaining = await scopedRows();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].archivePath, FRESH_PATH);

  // Stats surface the new fields. `totalRestoreLogPruned` is a cumulative
  // counter shared across sweeps, so just assert it includes our 2 prunes.
  const stats = await getRetentionStats();
  assert.equal(stats.restoreLogRetentionDays, DEFAULT_AUDIENCE_RESTORE_LOG_RETENTION_DAYS);
  assert.ok(
    stats.totalRestoreLogPruned >= 2,
    `totalRestoreLogPruned should include our 2 prunes, got ${stats.totalRestoreLogPruned}`,
  );
  assert.ok(
    stats.restoreLogRowCount >= 1,
    `restoreLogRowCount should include our fresh row, got ${stats.restoreLogRowCount}`,
  );

  // Admin override shortens the window so the fresh row also becomes eligible.
  await setRestoreLogRetentionOverride(1, "test_admin");
  const eff2 = await getEffectiveRestoreLogRetentionDays();
  assert.equal(eff2.retentionDays, 1);
  assert.equal(eff2.override, 1);

  const r2 = await runRetentionSweep(undefined, "manual");
  assert.ok(
    r2.restoreLogPruned >= 1,
    `should prune at least our 1 remaining row, got ${r2.restoreLogPruned}`,
  );
  assert.equal(r2.restoreLogRetentionDays, 1);

  const after = await scopedRows();
  assert.equal(after.length, 0);

  // Clear override — back to default.
  const cleared = await setRestoreLogRetentionOverride(null);
  assert.equal(cleared.override, null);
  assert.equal(cleared.retentionDays, DEFAULT_AUDIENCE_RESTORE_LOG_RETENTION_DAYS);
});

test("Task #488: sweep surfaces audit-export notification prune count and bubbles failures into the sweep error", async () => {
  const {
    audienceAuditExportNotifications,
  } = await import("../shared/omni-channel-audience-schema");
  const {
    setAuditExportNotificationsPrunerForTests,
    resetAuditExportNotificationsPrunerForTests,
  } = await import("../server/services/audience-retention-service");

  await db.delete(audienceAuditExportNotifications);

  // Seed two ancient notification rows (well beyond the 90-day default
  // audit retention window) and one fresh row.
  const ancient = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
  const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const seed = (occurredAt: Date, suffix: string) => ({
    notificationId: `notif_${suffix}_${Math.random().toString(36).slice(2, 8)}`,
    exportId: `exp_${suffix}`,
    actorId: "founder_1",
    actorType: "user",
    actorRole: "root_admin",
    format: "json",
    totalRowCount: 1,
    thresholdRowCount: 0,
    thresholdExceeded: false,
    recipients: ["ops@example.com"],
    notified: true,
    reason: "sent",
    isTest: false,
    errorMessage: null,
    occurredAt,
  });
  await db.insert(audienceAuditExportNotifications).values([
    seed(ancient, "old1"),
    seed(ancient, "old2"),
    seed(recent, "fresh"),
  ] as any);

  const r = await runRetentionSweep(undefined, "manual");
  assert.equal(
    r.notificationHistoryPruned,
    2,
    "should prune both ancient notification rows",
  );
  assert.equal(r.error, null, "happy-path prune must not poison sweep error");

  const remaining = await db.select().from(audienceAuditExportNotifications);
  assert.equal(remaining.length, 1);

  // Now simulate a prune failure and ensure it surfaces as the sweep error
  // (so the founder failure-alert service fires) without crashing the run.
  setAuditExportNotificationsPrunerForTests(async () => {
    throw new Error("simulated permissions error");
  });
  try {
    const r2 = await runRetentionSweep(undefined, "manual");
    assert.equal(r2.notificationHistoryPruned, 0);
    assert.ok(r2.error, "failure must surface as a sweep error");
    assert.match(
      r2.error ?? "",
      /audit-export notification prune failed/,
      "sweep error must identify the audit-export prune",
    );
  } finally {
    resetAuditExportNotificationsPrunerForTests();
  }
});

// Insert a single ancient audience_messages row directly via the DB so the
// test isn't sensitive to read-after-write races against the pooler that
// can intermittently affect the full ingest -> evaluate -> command
// pipeline. The retention sweep only ever looks at `receivedAt`, so a
// minimal row is enough to exercise the history-capture code path.
async function insertAncientMessageRow(connectorId: string, ageDays: number, suffix: string) {
  const oldTs = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  const messageId = `aud_test_${Date.now()}_${suffix}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(audienceMessages).values({
    messageId,
    connectorId,
    platform: "youtube",
    externalMessageId: `ext_${suffix}_${Math.random().toString(36).slice(2, 8)}`,
    externalAuthorIdHash: "deadbeef",
    authorDisplayNameSafe: "a",
    messageText: "hello",
    messageType: "comment",
    receivedAt: oldTs,
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    realSendAllowed: false,
    executionEnabled: false,
    safetyEnvelope: {},
    rawMetadataRedacted: {},
  } as any);
  return messageId;
}

test("Task #441: each sweep appends a stale-pending history sample and the trend reflects backlog catching up", async () => {
  // Seed two ancient message rows directly. They exceed the default 90-day
  // window so the sweep will prune them; the post-sweep stale-pending
  // counter for messages should drop to 0.
  await insertAncientMessageRow("c_ret_trend", 200, "a");
  await insertAncientMessageRow("c_ret_trend", 200, "b");

  const r1 = await runRetentionSweep(90, "manual");
  assert.equal(r1.error, null);

  await insertAncientMessageRow("c_ret_trend", 200, "c");
  const r2 = await runRetentionSweep(90, "manual");
  assert.equal(r2.error, null);

  const stats = await getRetentionStats();
  assert.ok(
    stats.stalePendingHistory.length >= 2,
    `expected at least 2 history rows, got ${stats.stalePendingHistory.length}`,
  );
  // Oldest-first ordering: the older sample's recordedAt must be <=
  // the newest sample's recordedAt.
  const first = stats.stalePendingHistory[0];
  const last = stats.stalePendingHistory[stats.stalePendingHistory.length - 1];
  assert.ok(Date.parse(first.recordedAt) <= Date.parse(last.recordedAt));
  // Both sweeps successfully drained the backlog, so post-sweep messages
  // count must be 0 on the latest sample.
  assert.equal(last.messages, 0);
  assert.equal(last.retentionDays, 90);
  assert.equal(last.trigger, "manual");
  assert.equal(last.error, null);
});

test("Task #441: stale-pending history captures a GROWING backlog when archive uploads silently fail", async () => {
  // Force archive mode for messages so a writer failure leaves stale rows
  // sitting in Postgres — exactly the partial-failure scenario the trend
  // arrow needs to surface.
  await setRetentionMode({ messages: "archive", decisions: "delete", commands: "delete" }, "tester");
  // Writer that throws (== upload failed) so rows are never deleted from
  // `audience_messages` and the sweep surfaces an error every time.
  process.env.AUDIENCE_ARCHIVE_UPLOAD_RETRIES = "1";
  setAudienceArchiveWriter({ async write() { throw new Error("archive_writer_down"); } });

  await insertAncientMessageRow("c_ret_growing", 200, "g1");
  const r1 = await runRetentionSweep(90, "manual");
  assert.ok(r1.error, "expected silent-failure to surface as an error");

  await insertAncientMessageRow("c_ret_growing", 200, "g2");
  await insertAncientMessageRow("c_ret_growing", 200, "g3");
  const r2 = await runRetentionSweep(90, "manual");
  assert.ok(r2.error);

  const stats = await getRetentionStats();
  assert.ok(stats.stalePendingHistory.length >= 2);
  const first = stats.stalePendingHistory[0];
  const last = stats.stalePendingHistory[stats.stalePendingHistory.length - 1];
  // Backlog should be visibly larger after the second failed sweep.
  assert.ok(
    last.messages > first.messages,
    `expected messages backlog to grow: first=${first.messages} last=${last.messages}`,
  );
  // The failed sweep's error must be recorded on the history sample so
  // the dashboard can correlate the trend with the failure cause.
  assert.ok(last.error && last.error.length > 0);
});

test("Task #441: getStalePendingHistory clamps the limit between 1 and the hard ceiling", async () => {
  await insertAncientMessageRow("c_ret_limit", 200, "lim");
  await runRetentionSweep(90, "manual");
  await runRetentionSweep(90, "manual");
  await runRetentionSweep(90, "manual");

  const { getStalePendingHistory, AUDIENCE_STALE_HISTORY_MAX_LIMIT } = await import(
    "../server/services/audience-retention-service"
  );
  const tooSmall = await getStalePendingHistory(0);
  assert.ok(tooSmall.length >= 1, "limit < 1 should clamp to 1 not 0");
  const huge = await getStalePendingHistory(AUDIENCE_STALE_HISTORY_MAX_LIMIT * 10);
  assert.ok(huge.length <= AUDIENCE_STALE_HISTORY_MAX_LIMIT);
});

test("retentionDays argument overrides admin override for one run", async () => {
  await seedOld("c_ret_a", 100);
  await setRetentionOverride(365, "test_admin");
  const r = await runRetentionSweep(50, "manual");
  assert.equal(r.retentionDays, 50);
  assert.ok(r.messagesPruned >= 1);
  // override persists for subsequent runs
  const eff = await getEffectiveRetentionDays();
  assert.equal(eff.retentionDays, 365);
});

test("default retention mode is delete for all three audit tables", async () => {
  const m = await getEffectiveRetentionMode();
  assert.equal(m.mode.messages, "delete");
  assert.equal(m.mode.decisions, "delete");
  assert.equal(m.mode.commands, "delete");
  assert.equal(m.modeOverride, null);
});

test("setRetentionMode persists per-table overrides in system_settings", async () => {
  const eff = await setRetentionMode(
    { messages: "archive", decisions: "delete", commands: "archive" },
    "test_admin",
  );
  assert.equal(eff.mode.messages, "archive");
  assert.equal(eff.mode.decisions, "delete");
  assert.equal(eff.mode.commands, "archive");
  assert.deepEqual(eff.modeOverride, {
    messages: "archive",
    decisions: "delete",
    commands: "archive",
  });
  const row = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_RETENTION_MODE_SETTING_KEY));
  assert.equal(row.length, 1);
  const parsed = JSON.parse(row[0].value);
  assert.equal(parsed.messages, "archive");

  const cleared = await setRetentionMode(null);
  assert.equal(cleared.modeOverride, null);
  assert.equal(cleared.mode.messages, "delete");
});

test("archive mode writes gzipped JSONL to storage and then deletes rows", async () => {
  const old1 = await seedOld("c_ret_arch", 200);
  const old2 = await seedOld("c_ret_arch", 200);
  // fresh row should not be archived or deleted
  const fresh = await svc.ingestAudienceMessage({
    connectorId: "c_ret_arch",
    platform: "youtube",
    externalMessageId: "ext_fresh_arch",
    externalAuthorId: "f",
    authorDisplayName: "f",
    messageText: "fresh",
    messageType: "comment",
  });
  await svc.evaluateAudienceSafety(fresh.messageId);

  const { writer, writes } = makeCapturingArchiveWriter();
  setAudienceArchiveWriter(writer);
  await setRetentionMode(
    { messages: "archive", decisions: "archive", commands: "archive" },
    "test_admin",
  );

  const r = await runRetentionSweep(90, "manual");
  assert.equal(r.error, null);
  assert.equal(r.mode.messages, "archive");

  // All three tables should have written one archive file each.
  assert.equal(writes.length, 3, `expected 3 archive files, got ${writes.length}`);
  const byTable = Object.fromEntries(writes.map((w) => [w.table, w]));
  assert.ok(byTable.messages && byTable.decisions && byTable.commands);

  // Counters reflect archived rows and pruned rows match.
  assert.ok(r.messagesArchived >= 2);
  assert.ok(r.decisionsArchived >= 2);
  assert.ok(r.commandsArchived >= 2);
  assert.equal(r.totalArchived, r.messagesArchived + r.decisionsArchived + r.commandsArchived);
  assert.equal(r.messagesPruned, r.messagesArchived);
  assert.equal(r.decisionsPruned, r.decisionsArchived);
  assert.equal(r.commandsPruned, r.commandsArchived);
  assert.equal(r.archiveFiles.length, 3);

  // Payload is gzipped JSONL and contains the old rows.
  const decoded = gunzipSync(byTable.messages.payload).toString("utf8");
  const lines = decoded.trim().split("\n").map((l) => JSON.parse(l));
  const ids = new Set(lines.map((l: any) => l.messageId));
  assert.ok(ids.has(old1.messageId));
  assert.ok(ids.has(old2.messageId));

  // Old rows are gone from Postgres; fresh row remains.
  const oldRow = await db
    .select()
    .from(audienceMessages)
    .where(eq(audienceMessages.messageId, old1.messageId));
  assert.equal(oldRow.length, 0);
  const freshRow = await db
    .select()
    .from(audienceMessages)
    .where(eq(audienceMessages.messageId, fresh.messageId));
  assert.equal(freshRow.length, 1);

  // Stats counter tracks archived rows too.
  const stats = await getRetentionStats();
  assert.equal(stats.totalRowsArchived, r.totalArchived);
  assert.equal(stats.totalArchiveFiles, 3);
});

test("mixed mode: only tables in archive mode write archive files; delete-mode tables skip storage", async () => {
  await seedOld("c_ret_mixed", 150);
  await seedOld("c_ret_mixed", 150);

  const { writer, writes } = makeCapturingArchiveWriter();
  setAudienceArchiveWriter(writer);
  await setRetentionMode(
    { messages: "archive", decisions: "delete", commands: "delete" },
    "test_admin",
  );

  const r = await runRetentionSweep(90, "manual");
  assert.equal(r.error, null);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, "messages");
  assert.ok(r.messagesArchived >= 2);
  assert.equal(r.decisionsArchived, 0);
  assert.equal(r.commandsArchived, 0);
  // delete-mode tables still prune their rows
  assert.ok(r.decisionsPruned >= 2);
  assert.ok(r.commandsPruned >= 2);
});

test("restoreFromArchive re-inserts archived rows back into the audience_messages table", async () => {
  const old1 = await seedOld("c_ret_restore", 200);
  const old2 = await seedOld("c_ret_restore", 200);

  // archive both old rows out via the sweep
  const captured: Map<string, Buffer> = new Map();
  const writer: AudienceArchiveWriter = {
    async write(table, gz, meta) {
      const p = `/test-bucket/audience-archive/${table}/${meta.sweepStartedAt.replace(/[:.]/g, "-")}.jsonl.gz`;
      captured.set(p, gz);
      return p;
    },
  };
  setAudienceArchiveWriter(writer);
  await setRetentionMode({ messages: "archive" }, "test_admin");
  const sweep = await runRetentionSweep(90, "manual");
  assert.equal(sweep.error, null);
  const msgFile = sweep.archiveFiles.find((f) => f.table === "messages");
  assert.ok(msgFile, "expected messages archive file");

  // confirm both rows are gone
  const gone1 = await db
    .select()
    .from(audienceMessages)
    .where(eq(audienceMessages.messageId, old1.messageId));
  assert.equal(gone1.length, 0);

  // wire reader to the captured payload and restore
  const reader: AudienceArchiveReader = {
    async read(path) {
      const buf = captured.get(path);
      if (!buf) throw new Error(`no fixture for ${path}`);
      return buf;
    },
  };
  setAudienceArchiveReader(reader);
  const r = await restoreFromArchive(msgFile!.path, "test_admin");
  assert.equal(r.error, null);
  assert.equal(r.table, "messages");
  assert.equal(r.restoredBy, "test_admin");
  assert.ok(r.rowsParsed >= 2);
  assert.equal(r.rowsInserted, r.rowsParsed);
  assert.equal(r.rowsSkipped, 0);

  // both rows should be back
  const back1 = await db
    .select()
    .from(audienceMessages)
    .where(eq(audienceMessages.messageId, old1.messageId));
  assert.equal(back1.length, 1);
  const back2 = await db
    .select()
    .from(audienceMessages)
    .where(eq(audienceMessages.messageId, old2.messageId));
  assert.equal(back2.length, 1);

  // running restore again is idempotent — all rows skipped via onConflictDoNothing
  const again = await restoreFromArchive(msgFile!.path, "test_admin");
  assert.equal(again.error, null);
  assert.equal(again.rowsInserted, 0);
  assert.equal(again.rowsSkipped, again.rowsParsed);

  // audit log records both attempts (newest first) with the operator id
  const logEntries = await getAudienceRestoreLog();
  assert.ok(logEntries.length >= 2);
  assert.equal(logEntries[0].restoredBy, "test_admin");
  assert.equal(logEntries[0].archivePath, msgFile!.path);
});

test("restoreFromArchive rejects an archive path without an audience-archive/<table>/ segment", async () => {
  setAudienceArchiveReader({
    async read() {
      return Buffer.from("");
    },
  });
  const r = await restoreFromArchive("/test-bucket/unrelated/file.jsonl.gz", "test_admin");
  assert.ok(r.error && r.error.includes("cannot infer audience table"));
  assert.equal(r.rowsInserted, 0);
});

test("restoreFromArchive surfaces reader failures and logs them in the audit trail", async () => {
  setAudienceArchiveReader({
    async read() {
      throw new Error("storage_unavailable");
    },
  });
  const r = await restoreFromArchive(
    "/test-bucket/audience-archive/decisions/2026-01-01.jsonl.gz",
    "test_admin",
  );
  assert.equal(r.error, "storage_unavailable");
  assert.equal(r.rowsInserted, 0);
  const log = await getAudienceRestoreLog();
  assert.equal(log[0].error, "storage_unavailable");
  assert.equal(log[0].table, "decisions");
});

test("archive writer failure keeps rows intact and surfaces error on the sweep result", async () => {
  const seeded = await seedOld("c_ret_fail", 200);
  setAudienceArchiveWriter({
    async write() {
      throw new Error("archive_write_failed");
    },
  });
  await setRetentionMode({ messages: "archive" }, "test_admin");

  const r = await runRetentionSweep(90, "manual");
  assert.equal(r.error, "archive_write_failed");
  // Failure happened on first archive table attempted (decisions); messages table never ran
  // — but the seeded row's specific table depends on iteration order. Just assert that the
  // seeded message row still exists since the messages table is processed last.
  const row = await db
    .select()
    .from(audienceMessages)
    .where(eq(audienceMessages.messageId, seeded.messageId));
  assert.equal(row.length, 1);
});

test("transient archive writer failure is retried in-process and the sweep ultimately succeeds", async () => {
  await seedOld("c_ret_retry_ok", 200);
  await setRetentionMode({ messages: "archive" }, "test_admin");

  const attemptsByTable: Record<string, number> = {};
  setAudienceArchiveWriter({
    async write(table, _gz, meta) {
      attemptsByTable[table] = (attemptsByTable[table] ?? 0) + 1;
      // Fail the first two attempts per table, succeed on the third.
      if (attemptsByTable[table] < 3) {
        throw new Error(`transient_${table}_failure`);
      }
      return `/test-bucket/audience-archive/${table}/${meta.sweepStartedAt.replace(/[:.]/g, "-")}.jsonl.gz`;
    },
  });

  const r = await runRetentionSweep(90, "manual");
  assert.equal(r.error, null, `sweep should succeed after retries, got error: ${r.error}`);
  // Only the messages table is in archive mode; the writer was called 3 times for it.
  assert.equal(attemptsByTable.messages, 3);
  assert.ok(r.messagesArchived >= 1);
  assert.equal(r.archiveFiles.length, 1);
});

test("archive upload retry counter increments per retry attempt and final failure", async () => {
  await seedOld("c_ret_retry_metric", 200);
  await setRetentionMode({ messages: "archive" }, "test_admin");

  const before = await getRetentionStats();
  const baselineRetries = before.archiveUploadRetryCount;
  const baselineFinal = before.archiveUploadFinalFailureCount;

  // Case A: 2 transient failures then success → +2 retries, +0 final failures.
  let attemptsA = 0;
  setAudienceArchiveWriter({
    async write(table, _gz, meta) {
      attemptsA += 1;
      if (attemptsA < 3) throw new Error("transient");
      return `/test-bucket/audience-archive/${table}/${meta.sweepStartedAt.replace(/[:.]/g, "-")}.jsonl.gz`;
    },
  });
  const okRun = await runRetentionSweep(90, "manual");
  assert.equal(okRun.error, null);
  const afterOk = await getRetentionStats();
  assert.equal(afterOk.archiveUploadRetryCount, baselineRetries + 2);
  assert.equal(afterOk.archiveUploadFinalFailureCount, baselineFinal);

  // Case B: every attempt fails → +(attempts-1) retries, +1 final failure.
  await seedOld("c_ret_retry_metric_2", 200);
  process.env.AUDIENCE_ARCHIVE_UPLOAD_RETRIES = "4";
  setAudienceArchiveWriter({
    async write() {
      throw new Error("persistent");
    },
  });
  const failRun = await runRetentionSweep(90, "manual");
  assert.equal(failRun.error, "persistent");
  const afterFail = await getRetentionStats();
  assert.equal(afterFail.archiveUploadRetryCount, baselineRetries + 2 + 3);
  assert.equal(afterFail.archiveUploadFinalFailureCount, baselineFinal + 1);
});

test("archive writer retries respect AUDIENCE_ARCHIVE_UPLOAD_RETRIES and only the final failure alerts", async () => {
  await seedOld("c_ret_retry_fail", 200);
  await setRetentionMode({ messages: "archive" }, "test_admin");
  process.env.AUDIENCE_ARCHIVE_UPLOAD_RETRIES = "5";

  let attempts = 0;
  setAudienceArchiveWriter({
    async write() {
      attempts += 1;
      throw new Error("persistent_failure");
    },
  });

  const r = await runRetentionSweep(90, "manual");
  assert.equal(r.error, "persistent_failure");
  // Writer was retried exactly 5 times before giving up.
  assert.equal(attempts, 5);
});

/* ------------------------------------------------------------------- */
/* Task #413 — archive-file retention policy + cleanup                 */
/* ------------------------------------------------------------------- */

beforeEach(async () => {
  await db.delete(systemSettings).where(eq(systemSettings.key, AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY));
  await db.delete(audienceArchiveDeletions);
  await db.delete(audienceArchiveTrashPurges);
});

function makeFakeArchiveReader(initial: AudienceArchiveListing[]) {
  const files = [...initial];
  const trash: AudienceArchiveListing[] = [];
  const deleted: string[] = [];
  const reader: AudienceArchiveReader = {
    async list() {
      // Real GCS reader filters out non-table prefixes (so `.trash/` files
      // are invisible to the cleanup loop). Mirror that here.
      return [...files];
    },
    async openStream(path: string) {
      const found = files.find((f) => f.path === path) ?? trash.find((f) => f.path === path);
      if (!found) throw new Error("not_found");
      return {
        stream: require("node:stream").Readable.from(Buffer.from("x")),
        bytes: 1,
        contentType: "application/gzip",
        filename: path.split("/").pop() ?? "x.gz",
      };
    },
    async delete(path: string) {
      let idx = files.findIndex((f) => f.path === path);
      if (idx !== -1) {
        files.splice(idx, 1);
        deleted.push(path);
        return;
      }
      idx = trash.findIndex((f) => f.path === path);
      if (idx !== -1) {
        trash.splice(idx, 1);
        deleted.push(path);
        return;
      }
      throw new Error("not_found");
    },
    async move(srcPath: string, dstPath: string) {
      let idx = files.findIndex((f) => f.path === srcPath);
      let bucket: "files" | "trash" = "files";
      if (idx === -1) {
        idx = trash.findIndex((f) => f.path === srcPath);
        bucket = "trash";
      }
      if (idx === -1) throw new Error("not_found");
      const src = (bucket === "files" ? files : trash).splice(idx, 1)[0];
      const moved: AudienceArchiveListing = { ...src, path: dstPath };
      if (dstPath.includes("/.trash/")) {
        trash.push(moved);
      } else {
        files.push(moved);
      }
    },
  };
  return { reader, deleted, files, trash };
}

function fakeFile(
  table: "messages" | "decisions" | "commands",
  ageDays: number,
  bytes = 1024,
  rowCount: number | null = 10,
): AudienceArchiveListing {
  const stamp = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000).toISOString();
  return {
    table,
    path: `/test-bucket/audience-archive/${table}/${stamp.replace(/[:.]/g, "-")}.jsonl.gz`,
    bytes,
    rowCount,
    updatedAt: stamp,
    sweepStartedAt: stamp,
    cutoffIso: stamp,
  };
}

test("archive retention policy defaults to 365 days with auto-delete enabled", async () => {
  const p = await getEffectiveArchiveRetentionPolicy();
  assert.equal(p.retentionDays, DEFAULT_AUDIENCE_ARCHIVE_RETENTION_DAYS);
  assert.equal(p.autoDeleteEnabled, true);
});

test("admin can configure archive retention window and opt-out flag", async () => {
  const p1 = await setArchiveRetentionPolicy({ retentionDays: 180 }, "test_admin");
  assert.equal(p1.retentionDays, 180);
  assert.equal(p1.autoDeleteEnabled, true);
  const stored = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY));
  assert.equal(stored.length, 1);
  const parsed = JSON.parse(stored[0].value);
  assert.equal(parsed.retentionDays, 180);
  assert.equal(parsed.autoDeleteEnabled, true);

  // opt out → autoDeleteEnabled false, retentionDays unchanged
  const p2 = await setArchiveRetentionPolicy({ autoDeleteEnabled: false }, "test_admin");
  assert.equal(p2.autoDeleteEnabled, false);
  assert.equal(p2.retentionDays, 180);
});

test("archive stats reports total bytes, oldest age, and next expiry batch", async () => {
  const { reader } = makeFakeArchiveReader([
    fakeFile("messages", 5, 2048),
    fakeFile("messages", 100, 4096),
    fakeFile("decisions", 360, 1024), // within 7-day warning of 365-day default
    fakeFile("commands", 400, 512),    // already past 365-day window
  ]);
  setAudienceArchiveReader(reader);

  const s = await getArchiveStats();
  assert.equal(s.totalFiles, 4);
  assert.equal(s.totalBytes, 2048 + 4096 + 1024 + 512);
  assert.equal(s.policy.retentionDays, DEFAULT_AUDIENCE_ARCHIVE_RETENTION_DAYS);
  assert.equal(s.policy.autoDeleteEnabled, true);
  assert.equal(s.expiredFileCount, 1);
  assert.equal(s.expiredBytes, 512);
  // next batch should include the expired file AND the 360-day file
  assert.equal(s.nextExpiryBatch.fileCount, 2);
  assert.equal(s.nextExpiryBatch.totalBytes, 1024 + 512);
  assert.equal(s.nextExpiryBatch.withinDays, 7);
  assert.ok(s.nextExpiryBatch.earliestExpiryIso != null);
  assert.ok((s.oldestFileAgeDays ?? 0) >= 399);
});

test("cleanup soft-deletes expired archive files to .trash/ and writes one audit row each", async () => {
  const { reader, deleted, files, trash } = makeFakeArchiveReader([
    fakeFile("messages", 5, 1000),
    fakeFile("decisions", 400, 2000),
    fakeFile("commands", 500, 3000),
  ]);
  setAudienceArchiveReader(reader);

  const r = await runArchiveCleanup({ trigger: "manual", actor: "test_admin" });
  assert.equal(r.skippedReason, null);
  assert.equal(r.candidateFiles, 2);
  assert.equal(r.deletedFiles, 2);
  assert.equal(r.bytesDeleted, 5000);
  assert.equal(r.errors.length, 0);
  // Task #439: cleanup is now a soft-delete (move to .trash/), not a
  // hard delete. Nothing should have been hard-deleted yet.
  assert.equal(deleted.length, 0);
  assert.equal(trash.length, 2);
  for (const t of trash) {
    assert.ok(t.path.includes("/.trash/"), `expected trash path, got ${t.path}`);
  }
  // fresh file stays in the live listing
  assert.equal(files.length, 1);
  assert.equal(files[0].table, "messages");

  const audit = await listArchiveDeletions(10);
  assert.equal(audit.length, 2);
  for (const row of audit) {
    assert.equal(row.trigger, "manual");
    assert.equal(row.actor, "test_admin");
    assert.equal(row.retentionDays, DEFAULT_AUDIENCE_ARCHIVE_RETENTION_DAYS);
    assert.ok(row.archiveAgeDays > DEFAULT_AUDIENCE_ARCHIVE_RETENTION_DAYS);
    assert.ok(row.trashPath && row.trashPath.includes("/.trash/"));
    assert.ok((row.graceDays ?? 0) > 0);
    assert.equal(row.purgedAt, null);
  }
});

test("dry-run lists candidates without deleting anything or writing audit rows", async () => {
  const { reader, deleted, files } = makeFakeArchiveReader([
    fakeFile("messages", 500, 1000),
    fakeFile("decisions", 400, 2000),
  ]);
  setAudienceArchiveReader(reader);

  const r = await runArchiveCleanup({ trigger: "manual", dryRun: true });
  assert.equal(r.dryRun, true);
  assert.equal(r.candidateFiles, 2);
  assert.equal(r.deletedFiles, 0);
  assert.equal(r.bytesDeleted, 0);
  assert.equal(r.deletions.length, 2);
  assert.equal(deleted.length, 0);
  assert.equal(files.length, 2);
  const audit = await listArchiveDeletions(10);
  assert.equal(audit.length, 0);
});

test("opt-out: scheduled tick skips with auto_delete_disabled reason and deletes nothing", async () => {
  const { reader, deleted } = makeFakeArchiveReader([fakeFile("messages", 500, 1000)]);
  setAudienceArchiveReader(reader);
  await setArchiveRetentionPolicy({ autoDeleteEnabled: false });

  const r = await runArchiveCleanup({ trigger: "scheduled" });
  assert.equal(r.skippedReason, "auto_delete_disabled");
  assert.equal(r.deletedFiles, 0);
  assert.equal(deleted.length, 0);
});

test("opt-out: manual run falls back to dry-run unless forceWhenDisabled is set", async () => {
  const { reader, deleted, files } = makeFakeArchiveReader([fakeFile("messages", 500, 1000)]);
  setAudienceArchiveReader(reader);
  await setArchiveRetentionPolicy({ autoDeleteEnabled: false });

  const r1 = await runArchiveCleanup({ trigger: "manual" });
  assert.equal(r1.dryRun, true);
  assert.equal(r1.deletedFiles, 0);
  assert.equal(deleted.length, 0);
  assert.equal(files.length, 1);

  const r2 = await runArchiveCleanup({
    trigger: "manual",
    forceWhenDisabled: true,
    actor: "test_admin",
  });
  assert.equal(r2.dryRun, false);
  assert.equal(r2.deletedFiles, 1);
  // soft-delete: file moved to trash, not hard-deleted
  assert.equal(deleted.length, 0);
  assert.equal(files.length, 0);
});

test("explicit retentionDays argument overrides the configured policy for one run", async () => {
  const { reader, files } = makeFakeArchiveReader([
    fakeFile("messages", 50, 1000),
    fakeFile("decisions", 200, 2000),
  ]);
  setAudienceArchiveReader(reader);
  // Default 365d: nothing would expire. Override to 30d → both expire.
  const r = await runArchiveCleanup({
    trigger: "manual",
    retentionDaysArg: 30,
    actor: "test_admin",
  });
  assert.equal(r.retentionDays, 30);
  assert.equal(r.candidateFiles, 2);
  assert.equal(r.deletedFiles, 2);
  assert.equal(files.length, 0);
});

function makePreviewReader(lines: string[]): AudienceArchiveReader {
  const gz = gzipSync(Buffer.from(lines.join("\n"), "utf8"));
  return {
    async list() {
      return [];
    },
    async openStream() {
      return {
        stream: Readable.from([gz]),
        bytes: gz.byteLength,
        contentType: "application/gzip",
        filename: "preview-fixture.jsonl.gz",
      };
    },
    async read() {
      return gz;
    },
    async delete() {
      // not used
    },
  };
}

test("previewAudienceArchive offset=0 returns the first N rows with offset:0", async () => {
  const lines = Array.from({ length: 10 }, (_, i) => JSON.stringify({ i, msg: `row-${i}` }));
  setAudienceArchiveReader(makePreviewReader(lines));
  const r = await previewAudienceArchive("/test-bucket/audience-archive/messages/x.jsonl.gz", 3, 0);
  assert.equal(r.offset, 0);
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows[0], { i: 0, msg: "row-0" });
  assert.deepEqual(r.rows[2], { i: 2, msg: "row-2" });
  assert.equal(r.truncated, true);
  assert.equal(r.totalRows, null);
  assert.equal(r.parseErrors, 0);
});

test("previewAudienceArchive offset=N returns rows N+1..2N with offset:N and truncated", async () => {
  const lines = Array.from({ length: 10 }, (_, i) => JSON.stringify({ i }));
  setAudienceArchiveReader(makePreviewReader(lines));
  const r = await previewAudienceArchive("/test-bucket/audience-archive/messages/x.jsonl.gz", 3, 3);
  assert.equal(r.offset, 3);
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows[0], { i: 3 });
  assert.deepEqual(r.rows[1], { i: 4 });
  assert.deepEqual(r.rows[2], { i: 5 });
  assert.equal(r.truncated, true);
  assert.equal(r.totalRows, null);
  assert.equal(r.parseErrors, 0);
});

test("previewAudienceArchive offset within last page reports totalRows and not truncated", async () => {
  const lines = Array.from({ length: 7 }, (_, i) => JSON.stringify({ i }));
  setAudienceArchiveReader(makePreviewReader(lines));
  const r = await previewAudienceArchive("/test-bucket/audience-archive/messages/x.jsonl.gz", 5, 5);
  assert.equal(r.offset, 5);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], { i: 5 });
  assert.deepEqual(r.rows[1], { i: 6 });
  assert.equal(r.truncated, false);
  assert.equal(r.totalRows, 7);
});

test("previewAudienceArchive offset past end returns empty rows and truncated:false", async () => {
  const lines = Array.from({ length: 4 }, (_, i) => JSON.stringify({ i }));
  setAudienceArchiveReader(makePreviewReader(lines));
  const r = await previewAudienceArchive("/test-bucket/audience-archive/messages/x.jsonl.gz", 5, 100);
  assert.equal(r.offset, 100);
  assert.deepEqual(r.rows, []);
  assert.equal(r.truncated, false);
  assert.equal(r.parseErrors, 0);
  assert.equal(r.totalRows, 100);
});

test("previewAudienceArchive counts a malformed line in parseErrors regardless of offset", async () => {
  const lines = [
    JSON.stringify({ i: 0 }),
    JSON.stringify({ i: 1 }),
    "{not-json",
    JSON.stringify({ i: 3 }),
    JSON.stringify({ i: 4 }),
  ];
  setAudienceArchiveReader(makePreviewReader(lines));

  const first = await previewAudienceArchive("/test-bucket/audience-archive/messages/x.jsonl.gz", 10, 0);
  assert.equal(first.parseErrors, 1);
  assert.equal(first.rows.length, 5);
  assert.equal((first.rows[2] as any)._parseError, true);
  assert.equal(first.truncated, false);
  assert.equal(first.totalRows, 5);

  setAudienceArchiveReader(makePreviewReader(lines));
  const skipped = await previewAudienceArchive("/test-bucket/audience-archive/messages/x.jsonl.gz", 10, 3);
  assert.equal(skipped.offset, 3);
  assert.equal(skipped.rows.length, 2);
  assert.equal(skipped.parseErrors, 0);
  assert.deepEqual(skipped.rows[0], { i: 3 });

  setAudienceArchiveReader(makePreviewReader(lines));
  const acrossBad = await previewAudienceArchive("/test-bucket/audience-archive/messages/x.jsonl.gz", 10, 2);
  assert.equal(acrossBad.offset, 2);
  assert.equal(acrossBad.rows.length, 3);
  assert.equal(acrossBad.parseErrors, 1);
  assert.equal((acrossBad.rows[0] as any)._parseError, true);
});

test("per-file move failure is captured in errors and other files still proceed", async () => {
  const initial = [
    fakeFile("messages", 500, 1000),
    fakeFile("decisions", 500, 2000),
  ];
  const files = [...initial];
  const reader: AudienceArchiveReader = {
    async list() {
      return [...files];
    },
    async openStream() {
      throw new Error("not used");
    },
    async delete() {
      throw new Error("not used");
    },
    async move(srcPath: string) {
      if (srcPath.includes("/decisions/")) throw new Error("storage_unavailable");
      const idx = files.findIndex((f) => f.path === srcPath);
      if (idx !== -1) files.splice(idx, 1);
    },
  };
  setAudienceArchiveReader(reader);

  const r = await runArchiveCleanup({ trigger: "manual", actor: "test_admin" });
  assert.equal(r.candidateFiles, 2);
  assert.equal(r.deletedFiles, 1);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].error, /storage_unavailable/);
  // messages file gone, decisions file still there
  assert.equal(files.length, 1);
  assert.equal(files[0].table, "decisions");
});

// ----------------------------------------------------------------------
// Task #439: soft-delete + grace-window purge + restore round-trip
// ----------------------------------------------------------------------

test("trash purge sweep respects the grace window and only hard-deletes past-cutoff entries", async () => {
  const { reader, deleted, trash } = makeFakeArchiveReader([
    fakeFile("messages", 500, 1000),
    fakeFile("decisions", 500, 2000),
  ]);
  setAudienceArchiveReader(reader);

  // Soft-delete both expired files into .trash/
  const cleanup = await runArchiveCleanup({ trigger: "manual", actor: "test_admin" });
  assert.equal(cleanup.deletedFiles, 2);
  assert.equal(trash.length, 2);
  assert.equal(deleted.length, 0);

  // Default grace window has not elapsed → purge should be a no-op.
  const purge1 = await runArchiveTrashPurge({ trigger: "manual" });
  assert.equal(purge1.candidateEntries, 0);
  assert.equal(purge1.purgedEntries, 0);
  assert.equal(deleted.length, 0);
  assert.equal(trash.length, 2);

  // Backdate one audit row so its deletion is older than the grace window.
  const rowsBefore = await listArchiveDeletions(10);
  assert.equal(rowsBefore.length, 2);
  const oldDeletedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await db
    .update(audienceArchiveDeletions)
    .set({ deletedAt: oldDeletedAt })
    .where(eq(audienceArchiveDeletions.deletionId, rowsBefore[0].deletionId));

  const purge2 = await runArchiveTrashPurge({ trigger: "manual" });
  assert.equal(purge2.candidateEntries, 1);
  assert.equal(purge2.purgedEntries, 1);
  assert.equal(purge2.errors.length, 0);
  assert.equal(deleted.length, 1);
  assert.equal(trash.length, 1);

  const rowsAfter = await listArchiveDeletions(10);
  const purgedRow = rowsAfter.find((r) => r.deletionId === rowsBefore[0].deletionId);
  assert.ok(purgedRow);
  assert.ok(purgedRow!.purgedAt != null);

  // Running the purge again must not re-process the same row.
  const purge3 = await runArchiveTrashPurge({ trigger: "manual" });
  assert.equal(purge3.candidateEntries, 0);
  assert.equal(purge3.purgedEntries, 0);
});

test("trash purge with graceDays:0 force-purges everything regardless of how recent the soft-delete is", async () => {
  const { reader, deleted, trash } = makeFakeArchiveReader([
    fakeFile("messages", 500, 4444),
    fakeFile("decisions", 500, 5555),
  ]);
  setAudienceArchiveReader(reader);

  const cleanup = await runArchiveCleanup({ trigger: "manual", actor: "test_admin" });
  assert.equal(cleanup.deletedFiles, 2);
  assert.equal(trash.length, 2);

  // Without graceDays:0 the freshly trashed rows must NOT be purged.
  const guard = await runArchiveTrashPurge({ trigger: "manual" });
  assert.equal(guard.purgedEntries, 0);
  assert.equal(trash.length, 2);

  // graceDays:0 bypasses the grace window entirely.
  const purge = await runArchiveTrashPurge({ trigger: "manual", graceDaysArg: 0 });
  assert.equal(purge.graceDays, 0);
  assert.equal(purge.candidateEntries, 2);
  assert.equal(purge.purgedEntries, 2);
  assert.equal(purge.errors.length, 0);
  assert.equal(deleted.length, 2);
  assert.equal(trash.length, 0);
});

test("restoreFromTrashDeletion moves the file back and clears the trash pointer", async () => {
  const original = fakeFile("messages", 500, 1234);
  const { reader, deleted, files, trash } = makeFakeArchiveReader([original]);
  setAudienceArchiveReader(reader);

  const cleanup = await runArchiveCleanup({ trigger: "manual", actor: "test_admin" });
  assert.equal(cleanup.deletedFiles, 1);
  assert.equal(files.length, 0);
  assert.equal(trash.length, 1);

  const audit = await listArchiveDeletions(10);
  assert.equal(audit.length, 1);
  const row = audit[0];
  assert.ok(row.trashPath && row.trashPath.includes("/.trash/"));

  const result = await restoreFromTrashDeletion(row.deletionId, "test_admin");
  assert.equal(result.deletionId, row.deletionId);
  assert.equal(result.restoredPath, original.path);
  assert.equal(result.restoredBy, "test_admin");

  // file is back in the live listing, trash is empty, audit pointer cleared
  assert.equal(files.length, 1);
  assert.equal(files[0].path, original.path);
  assert.equal(trash.length, 0);
  assert.equal(deleted.length, 0);

  const auditAfter = await listArchiveDeletions(10);
  assert.equal(auditAfter[0].trashPath, null);

  // Restoring a second time must fail because the trash pointer is gone.
  await assert.rejects(
    () => restoreFromTrashDeletion(row.deletionId, "test_admin"),
    /not_restorable_legacy_hard_delete/,
  );
});

test("restoreFromTrashDeletion refuses to restore an already-purged entry", async () => {
  const { reader, trash } = makeFakeArchiveReader([fakeFile("decisions", 500, 999)]);
  setAudienceArchiveReader(reader);

  await runArchiveCleanup({ trigger: "manual", actor: "test_admin" });
  assert.equal(trash.length, 1);
  const [row] = await listArchiveDeletions(10);

  // Backdate + purge → audit row gets purgedAt
  await db
    .update(audienceArchiveDeletions)
    .set({ deletedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) })
    .where(eq(audienceArchiveDeletions.deletionId, row.deletionId));
  await runArchiveTrashPurge({ trigger: "manual" });

  await assert.rejects(
    () => restoreFromTrashDeletion(row.deletionId, "test_admin"),
    /already_purged_from_trash/,
  );
});

test("restoreFromTrashDeletion rejects an unknown deletionId", async () => {
  await assert.rejects(
    () => restoreFromTrashDeletion("does-not-exist", "test_admin"),
    /deletion_not_found/,
  );
});

// ----------------------------------------------------------------------
// Task #476: trash grace days precedence (admin override > env > default)
// ----------------------------------------------------------------------

test("archive trash grace days precedence: admin override beats env beats default", async () => {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY));
  delete process.env.AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS;

  // 1. Default when nothing is configured.
  let policy = await getEffectiveArchiveRetentionPolicy();
  assert.equal(policy.trashGraceDays, 7);

  const baseRow = fakeFile("messages", 500, 12345);

  async function purgeWith(daysOld: number): Promise<{
    graceDays: number;
    purgedEntries: number;
  }> {
    // Set up a fake reader + soft-delete one file
    const { reader } = makeFakeArchiveReader([baseRow]);
    setAudienceArchiveReader(reader);
    await runArchiveCleanup({ trigger: "manual", actor: "test_admin" });
    const [row] = await listArchiveDeletions(10);
    await db
      .update(audienceArchiveDeletions)
      .set({ deletedAt: new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000) })
      .where(eq(audienceArchiveDeletions.deletionId, row.deletionId));
    const result = await runArchiveTrashPurge({ trigger: "manual" });
    // Cleanup the audit row so the next iteration starts fresh
    await db
      .delete(audienceArchiveDeletions)
      .where(eq(audienceArchiveDeletions.deletionId, row.deletionId));
    return { graceDays: result.graceDays, purgedEntries: result.purgedEntries };
  }

  // 2. Env var wins over the default.
  process.env.AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS = "30";
  policy = await getEffectiveArchiveRetentionPolicy();
  assert.equal(policy.trashGraceDays, 30);
  let r = await purgeWith(20);
  assert.equal(r.graceDays, 30);
  assert.equal(r.purgedEntries, 0, "20d old should NOT purge under 30d env grace");
  r = await purgeWith(45);
  assert.equal(r.graceDays, 30);
  assert.equal(r.purgedEntries, 1, "45d old SHOULD purge under 30d env grace");

  // 3. Admin override wins over the env var.
  await setArchiveRetentionPolicy({ trashGraceDays: 60 }, "test_admin");
  policy = await getEffectiveArchiveRetentionPolicy();
  assert.equal(policy.trashGraceDays, 60);
  r = await purgeWith(45);
  assert.equal(r.graceDays, 60);
  assert.equal(
    r.purgedEntries,
    0,
    "45d old should NOT purge under 60d admin override (even though env says 30d)",
  );
  r = await purgeWith(75);
  assert.equal(r.graceDays, 60);
  assert.equal(r.purgedEntries, 1, "75d old SHOULD purge under 60d admin override");

  delete process.env.AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS;
});

// ----------------------------------------------------------------------
// Task #519: trash grace days source classification (admin/env/default)
// ----------------------------------------------------------------------

test("archive trash grace days source: classifies admin override / env fallback / default", async () => {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY));
  delete process.env.AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS;

  // 1. Default — no admin override, no env var.
  let ws = await archiveTrashGraceDaysWithSource();
  assert.equal(ws.source, "default");
  assert.equal(ws.graceDays, DEFAULT_AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS);
  let stats = await getArchiveTrashStats();
  assert.equal(stats.graceDaysSource, "default");
  assert.equal(stats.graceDays, DEFAULT_AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS);
  assert.equal(stats.defaultGraceDays, DEFAULT_AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS);
  assert.equal(stats.graceDaysEnvFallback, null);

  // 2. Env fallback — env var set, no admin override.
  process.env.AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS = "21";
  ws = await archiveTrashGraceDaysWithSource();
  assert.equal(ws.source, "env");
  assert.equal(ws.graceDays, 21);
  stats = await getArchiveTrashStats();
  assert.equal(stats.graceDaysSource, "env");
  assert.equal(stats.graceDays, 21);
  assert.equal(stats.graceDaysEnvFallback, 21);

  // 3. Admin override wins over env.
  await setArchiveRetentionPolicy({ trashGraceDays: 45 }, "test_admin");
  ws = await archiveTrashGraceDaysWithSource();
  assert.equal(ws.source, "admin");
  assert.equal(ws.graceDays, 45);
  stats = await getArchiveTrashStats();
  assert.equal(stats.graceDaysSource, "admin");
  assert.equal(stats.graceDays, 45);
  // env fallback is still reported so the UI can also show what would
  // take effect if the admin override were cleared.
  assert.equal(stats.graceDaysEnvFallback, 21);

  // Cleanup
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY));
  delete process.env.AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS;
});

// ----------------------------------------------------------------------
// Task #567: archive retention days source classification
// ----------------------------------------------------------------------

test("archive retention days source: classifies admin override / env fallback / default", async () => {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY));
  delete process.env.AUDIENCE_ARCHIVE_RETENTION_DAYS;

  // 1. Default — no admin override, no env var.
  let ws = await getEffectiveArchiveRetentionPolicyWithSource();
  assert.equal(ws.retentionDaysSource, "default");
  assert.equal(ws.policy.retentionDays, DEFAULT_AUDIENCE_ARCHIVE_RETENTION_DAYS);
  assert.equal(ws.retentionDaysEnvFallback, null);

  // 2. Env fallback — env var set, no admin override.
  process.env.AUDIENCE_ARCHIVE_RETENTION_DAYS = "120";
  ws = await getEffectiveArchiveRetentionPolicyWithSource();
  assert.equal(ws.retentionDaysSource, "env");
  assert.equal(ws.policy.retentionDays, 120);
  assert.equal(ws.retentionDaysEnvFallback, 120);

  // 3. Admin override wins over env.
  await setArchiveRetentionPolicy({ retentionDays: 200 }, "test_admin");
  ws = await getEffectiveArchiveRetentionPolicyWithSource();
  assert.equal(ws.retentionDaysSource, "admin");
  assert.equal(ws.policy.retentionDays, 200);
  // env fallback is still reported so the UI can show what would take
  // effect if the admin override were cleared.
  assert.equal(ws.retentionDaysEnvFallback, 120);

  // Cleanup
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY));
  delete process.env.AUDIENCE_ARCHIVE_RETENTION_DAYS;
});

// ----------------------------------------------------------------------
// Task #514: recycle-bin "too large" warning thresholds
// ----------------------------------------------------------------------

test("trash warn thresholds default to constants and persist via policy", async () => {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY));

  const p1 = await getEffectiveArchiveRetentionPolicy();
  assert.equal(p1.trashWarnFileCount, DEFAULT_AUDIENCE_ARCHIVE_TRASH_WARN_FILES);
  assert.equal(p1.trashWarnBytes, DEFAULT_AUDIENCE_ARCHIVE_TRASH_WARN_BYTES);

  const p2 = await setArchiveRetentionPolicy(
    { trashWarnFileCount: 25, trashWarnBytes: 4096 },
    "test_admin",
  );
  assert.equal(p2.trashWarnFileCount, 25);
  assert.equal(p2.trashWarnBytes, 4096);
  assert.equal(p2.retentionDays, DEFAULT_AUDIENCE_ARCHIVE_RETENTION_DAYS);

  const reloaded = await getEffectiveArchiveRetentionPolicy();
  assert.equal(reloaded.trashWarnFileCount, 25);
  assert.equal(reloaded.trashWarnBytes, 4096);

  // 0 disables; negative / non-finite is clamped to 0.
  const p3 = await setArchiveRetentionPolicy(
    { trashWarnFileCount: 0, trashWarnBytes: -10 },
    "test_admin",
  );
  assert.equal(p3.trashWarnFileCount, 0);
  assert.equal(p3.trashWarnBytes, 0);
});

test("getArchiveTrashStats flags exceeded thresholds (and respects 0 = disabled)", async () => {
  // Soft-delete two files into .trash/ so the deletions table has real
  // rows with realistic byte counts.
  const { reader } = makeFakeArchiveReader([
    fakeFile("messages", 500, 2048),
    fakeFile("decisions", 500, 4096),
  ]);
  setAudienceArchiveReader(reader);
  await runArchiveCleanup({ trigger: "manual", actor: "test_admin" });

  // 1. Both thresholds disabled → no warning flags even though trash has rows.
  await setArchiveRetentionPolicy(
    { trashWarnFileCount: 0, trashWarnBytes: 0 },
    "test_admin",
  );
  let stats = await getArchiveTrashStats();
  assert.equal(stats.trashFileCount, 2);
  assert.equal(stats.totalTrashBytes, 6144);
  assert.equal(stats.trashFileCountExceeded, false);
  assert.equal(stats.trashBytesExceeded, false);

  // 2. File-count threshold below current count → fires.
  await setArchiveRetentionPolicy({ trashWarnFileCount: 1 }, "test_admin");
  stats = await getArchiveTrashStats();
  assert.equal(stats.trashFileCountExceeded, true);
  assert.equal(stats.trashBytesExceeded, false);
  assert.equal(stats.trashWarnFileCount, 1);

  // 3. Byte threshold below current total → fires; file threshold ABOVE → quiet.
  await setArchiveRetentionPolicy(
    { trashWarnFileCount: 100, trashWarnBytes: 1024 },
    "test_admin",
  );
  stats = await getArchiveTrashStats();
  assert.equal(stats.trashFileCountExceeded, false);
  assert.equal(stats.trashBytesExceeded, true);
  assert.equal(stats.trashWarnBytes, 1024);

  // 4. Strict ">" semantics: trash count exactly == threshold does NOT warn.
  await setArchiveRetentionPolicy(
    { trashWarnFileCount: 2, trashWarnBytes: 6144 },
    "test_admin",
  );
  stats = await getArchiveTrashStats();
  assert.equal(stats.trashFileCountExceeded, false);
  assert.equal(stats.trashBytesExceeded, false);
});

test("runArchiveTrashPurge with graceDays=0 empties the entire recycle bin", async () => {
  const { reader, deleted, trash } = makeFakeArchiveReader([
    fakeFile("messages", 500, 1024),
    fakeFile("decisions", 500, 2048),
  ]);
  setAudienceArchiveReader(reader);
  await runArchiveCleanup({ trigger: "manual", actor: "test_admin" });
  assert.equal(trash.length, 2);

  // Default grace would be 7 days → would purge nothing fresh.
  const noop = await runArchiveTrashPurge({ trigger: "manual" });
  assert.equal(noop.purgedEntries, 0);
  assert.equal(deleted.length, 0);

  // Empty-trash CTA passes graceDays=0 → purge everything regardless of age.
  const purged = await runArchiveTrashPurge({ trigger: "manual", graceDaysArg: 0 });
  assert.equal(purged.graceDays, 0);
  assert.equal(purged.candidateEntries, 2);
  assert.equal(purged.purgedEntries, 2);
  assert.equal(purged.bytesPurged, 3072);
  assert.equal(trash.length, 0);
  assert.equal(deleted.length, 2);
});

// ----------------------------------------------------------------------
// Task #557: per-run audit history for recycle-bin (.trash/) purges
// ----------------------------------------------------------------------

test("runArchiveTrashPurge writes a per-run audit row that listArchiveTrashPurges returns newest-first", async () => {
  const { reader } = makeFakeArchiveReader([
    fakeFile("messages", 500, 4096),
    fakeFile("decisions", 500, 8192),
  ]);
  setAudienceArchiveReader(reader);
  await runArchiveCleanup({ trigger: "manual", actor: "test_admin" });

  // First purge: scheduled, no candidates past grace -> still writes an audit row.
  const scheduled = await runArchiveTrashPurge({
    trigger: "scheduled",
    actor: "worker",
  });
  assert.equal(scheduled.purgedEntries, 0);

  // Second purge: manual, graceDays=0 forces hard-delete of everything.
  const manual = await runArchiveTrashPurge({
    trigger: "manual",
    graceDaysArg: 0,
    actor: "founder@example.com",
  });
  assert.equal(manual.purgedEntries, 2);
  assert.equal(manual.bytesPurged, 12288);

  const history = await listArchiveTrashPurges(10);
  assert.equal(history.length, 2);
  // Newest first: the manual run must be first.
  assert.equal(history[0].trigger, "manual");
  assert.equal(history[0].actor, "founder@example.com");
  assert.equal(history[0].purgedEntries, 2);
  assert.equal(history[0].candidateEntries, 2);
  assert.equal(Number(history[0].bytesPurged), 12288);
  assert.equal(history[0].errorCount, 0);
  assert.equal(history[0].graceDays, 0);
  assert.ok(history[0].startedAt instanceof Date);
  assert.ok(history[0].finishedAt instanceof Date);
  // Scheduled no-op run still recorded with actor "worker".
  assert.equal(history[1].trigger, "scheduled");
  assert.equal(history[1].actor, "worker");
  assert.equal(history[1].purgedEntries, 0);
});

test("listArchiveTrashPurges respects the limit cap and returns an empty array when nothing has been purged", async () => {
  const empty = await listArchiveTrashPurges(5);
  assert.equal(empty.length, 0);

  // Insert 3 audit rows by triggering three purges (graceDays:0 so each
  // run is independent of any cleanup state).
  const { reader } = makeFakeArchiveReader([fakeFile("messages", 500, 100)]);
  setAudienceArchiveReader(reader);
  await runArchiveCleanup({ trigger: "manual", actor: "a" });
  await runArchiveTrashPurge({ trigger: "manual", graceDaysArg: 0, actor: "u1" });
  await runArchiveTrashPurge({ trigger: "scheduled", actor: "worker" });
  await runArchiveTrashPurge({ trigger: "cli", actor: "ops_cli" });

  const limited = await listArchiveTrashPurges(2);
  assert.equal(limited.length, 2);
  // newest-first ordering: cli, then scheduled
  assert.equal(limited[0].trigger, "cli");
  assert.equal(limited[1].trigger, "scheduled");
});

// ----------------------------------------------------------------------
// Task #490: auto-trim old gateway_alert_settings_audit rows
// ----------------------------------------------------------------------

test("retention sweep prunes gateway_alert_settings_audit rows older than the cutoff", async () => {
  await db.delete(gatewayAlertSettingsAudit);

  const oldRow = await db
    .insert(gatewayAlertSettingsAudit)
    .values({
      field: "threshold",
      oldValue: "5",
      newValue: "10",
      action: "update",
      updatedBy: "founder",
    })
    .returning();
  await db
    .update(gatewayAlertSettingsAudit)
    .set({ updatedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) })
    .where(eq(gatewayAlertSettingsAudit.id, oldRow[0].id));

  const recent = await db
    .insert(gatewayAlertSettingsAudit)
    .values({
      field: "windowMs",
      oldValue: "1000",
      newValue: "2000",
      action: "update",
      updatedBy: "founder",
    })
    .returning();

  const before = await db.select().from(gatewayAlertSettingsAudit);
  assert.equal(before.length, 2);

  const result = await runRetentionSweep(90, "manual");
  assert.equal(result.error, null);
  assert.equal(result.thresholdAuditRowsPruned, 1);

  const after = await db.select().from(gatewayAlertSettingsAudit);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, recent[0].id);

  await db.delete(gatewayAlertSettingsAudit);
});

test("retention sweep with custom override prunes threshold-audit rows past that window", async () => {
  await db.delete(gatewayAlertSettingsAudit);

  const oldRow = await db
    .insert(gatewayAlertSettingsAudit)
    .values({
      field: "all",
      oldValue: null,
      newValue: "reset",
      action: "reset",
      updatedBy: "founder",
    })
    .returning();
  await db
    .update(gatewayAlertSettingsAudit)
    .set({ updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) })
    .where(eq(gatewayAlertSettingsAudit.id, oldRow[0].id));

  // 30d window: 10d-old row should survive
  let result = await runRetentionSweep(30, "manual");
  assert.equal(result.error, null);
  assert.equal(result.thresholdAuditRowsPruned, 0);
  let rows = await db.select().from(gatewayAlertSettingsAudit);
  assert.equal(rows.length, 1);

  // 5d window: 10d-old row should be pruned
  result = await runRetentionSweep(5, "manual");
  assert.equal(result.error, null);
  assert.equal(result.thresholdAuditRowsPruned, 1);
  rows = await db.select().from(gatewayAlertSettingsAudit);
  assert.equal(rows.length, 0);
});

test("totalThresholdAuditPruned accumulates across sweeps and is surfaced via getRetentionStats (Task #565)", async () => {
  await resetAudienceRetentionStateForTests();
  await db.delete(gatewayAlertSettingsAudit);

  const statsBefore = await getRetentionStats();
  assert.equal(statsBefore.totalThresholdAuditPruned, 0);

  // First sweep: insert 2 old rows + 1 fresh row, expect 2 pruned.
  const oldA = await db
    .insert(gatewayAlertSettingsAudit)
    .values({ field: "threshold", oldValue: "1", newValue: "2", action: "update", updatedBy: "founder" })
    .returning();
  const oldB = await db
    .insert(gatewayAlertSettingsAudit)
    .values({ field: "threshold", oldValue: "2", newValue: "3", action: "update", updatedBy: "founder" })
    .returning();
  await db
    .update(gatewayAlertSettingsAudit)
    .set({ updatedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) })
    .where(eq(gatewayAlertSettingsAudit.id, oldA[0].id));
  await db
    .update(gatewayAlertSettingsAudit)
    .set({ updatedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) })
    .where(eq(gatewayAlertSettingsAudit.id, oldB[0].id));
  await db
    .insert(gatewayAlertSettingsAudit)
    .values({ field: "windowMs", oldValue: "1000", newValue: "2000", action: "update", updatedBy: "founder" });

  let r = await runRetentionSweep(90, "manual");
  assert.equal(r.error, null);
  assert.equal(r.thresholdAuditRowsPruned, 2);

  let stats = await getRetentionStats();
  assert.equal(stats.totalThresholdAuditPruned, 2);

  // Second sweep: age out one more old row, expect running total to grow.
  const oldC = await db
    .insert(gatewayAlertSettingsAudit)
    .values({ field: "threshold", oldValue: "3", newValue: "4", action: "update", updatedBy: "founder" })
    .returning();
  await db
    .update(gatewayAlertSettingsAudit)
    .set({ updatedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) })
    .where(eq(gatewayAlertSettingsAudit.id, oldC[0].id));

  r = await runRetentionSweep(90, "manual");
  assert.equal(r.error, null);
  assert.equal(r.thresholdAuditRowsPruned, 1);

  stats = await getRetentionStats();
  assert.equal(stats.totalThresholdAuditPruned, 3);

  await db.delete(gatewayAlertSettingsAudit);
});
