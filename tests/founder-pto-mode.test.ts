import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import {
  FOUNDER_PTO_MODE_SETTING_KEY,
  PTO_NOTIFIER_REGISTRY,
  getFounderPtoModeConfig,
  setFounderPtoEnrollment,
  setFounderPtoSnooze,
  evaluateAndMaybeAutoExtendFounderPtoSnooze,
  isNotifierMutedByPto,
  bumpFounderPtoSuppressedCount,
  runFounderPtoResumeRecapIfDue,
  getFounderPtoSuppressionLog,
  getAllFounderPtoSuppressionLogForExport,
  clearFounderPtoSuppressionLog,
  pruneFounderPtoSuppressionLogOlderThan,
  clearFounderPtoSuppressionLogForTests,
  FOUNDER_PTO_SUPPRESSION_LOG_MAX_LIMIT,
  getFounderPtoSuppressionStats,
  FOUNDER_PTO_SUPPRESSION_STATS_MAX_DAYS,
  FOUNDER_PTO_SUPPRESSION_LOG_EXPORT_MAX,
} from "../server/services/founder-pto-mode-service";
import { emailService } from "../server/services/email-service";
import {
  AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY,
  setAudienceArchiveDeletionNotifierConfig,
} from "../server/services/audience-archive-deletion-notifier";

type RecapArgs = Parameters<typeof emailService.sendFounderPtoResumeRecap>;
const originalRecap = emailService.sendFounderPtoResumeRecap.bind(emailService);
let recapCalls: { recipients: RecapArgs[0]; payload: RecapArgs[1] }[] = [];
let recapImpl: (r: RecapArgs[0], p: RecapArgs[1]) => Promise<any> =
  async () => ({ id: "mock" });
(emailService as any).sendFounderPtoResumeRecap = async (
  recipients: RecapArgs[0],
  payload: RecapArgs[1],
) => {
  recapCalls.push({ recipients, payload });
  return recapImpl(recipients, payload);
};
process.on("exit", () => {
  (emailService as any).sendFounderPtoResumeRecap = originalRecap;
});

async function clear() {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, FOUNDER_PTO_MODE_SETTING_KEY));
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY));
  await clearFounderPtoSuppressionLogForTests();
}

async function seedRecipients(recipients: string[]) {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients,
    updatedBy: "test",
  });
}

beforeEach(async () => {
  await clear();
  recapCalls = [];
  recapImpl = async () => ({ id: "mock" });
});

test("default config is disabled and enrolls every known notifier", async () => {
  const cfg = await getFounderPtoModeConfig();
  assert.equal(cfg.enabled, false);
  assert.deepEqual(
    cfg.enrolledNotifiers.sort(),
    PTO_NOTIFIER_REGISTRY.map((n) => n.id).sort(),
  );
  assert.equal(cfg.snoozeUntil, null);
  assert.deepEqual(cfg.snoozePolicy, { kind: "fixed" });
  assert.equal(cfg.snoozeSuppressedCount, 0);
});

test("setFounderPtoEnrollment drops unknown notifier ids and dedups", async () => {
  const cfg = await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: [
      "audience_archive_deletion",
      "audience_archive_deletion",
      "made_up_notifier",
    ],
    updatedBy: "founder",
  });
  assert.equal(cfg.enabled, true);
  assert.deepEqual(cfg.enrolledNotifiers, ["audience_archive_deletion"]);
});

test("setFounderPtoSnooze rejects invalid + past timestamps, accepts future, can clear", async () => {
  await assert.rejects(
    setFounderPtoSnooze({ snoozeUntil: "not-a-date" }),
    /invalid snoozeUntil/,
  );
  await assert.rejects(
    setFounderPtoSnooze({
      snoozeUntil: new Date(Date.now() - 1_000).toISOString(),
    }),
    /must be in the future/,
  );
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const c1 = await setFounderPtoSnooze({ snoozeUntil: future });
  assert.ok(c1.snoozeUntil);
  assert.equal(c1.lastSnoozeSource, "manual");
  const c2 = await setFounderPtoSnooze({ snoozeUntil: null });
  assert.equal(c2.snoozeUntil, null);
  assert.equal(c2.lastSnoozeSource, null);
});

test("fixed snooze is capped at 90 days, auto_extend bypasses the cap", async () => {
  const now = new Date();
  const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const fixed = await setFounderPtoSnooze({
    snoozeUntil: oneYear.toISOString(),
    snoozePolicy: { kind: "fixed" },
    now,
  });
  const fixedMs = Date.parse(fixed.snoozeUntil!);
  const ninetyMs = now.getTime() + 90 * 24 * 60 * 60 * 1000;
  assert.ok(
    Math.abs(fixedMs - ninetyMs) < 5_000,
    "fixed snooze should be capped at +90d",
  );

  const auto = await setFounderPtoSnooze({
    snoozeUntil: oneYear.toISOString(),
    snoozePolicy: { kind: "auto_extend", extendDays: 7 },
    now,
  });
  assert.equal(
    Date.parse(auto.snoozeUntil!),
    oneYear.getTime(),
    "auto_extend bypasses the 90-day cap",
  );
});

test("isNotifierMutedByPto returns null when disabled, source when active", async () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await setFounderPtoSnooze({ snoozeUntil: future });
  // Disabled by default — still null.
  let r = await isNotifierMutedByPto("audience_audit_export");
  assert.equal(r, null);

  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_audit_export"],
  });
  r = await isNotifierMutedByPto("audience_audit_export");
  assert.ok(r, "PTO should be muting the enrolled notifier");
  assert.equal(r!.source, "manual");
  assert.equal(r!.effectiveUntil, future);

  // Not enrolled → not muted.
  const r2 = await isNotifierMutedByPto("audience_archive_deletion");
  assert.equal(r2, null);
});

test("auto_extend bumps snoozeUntil forward when window elapses", async () => {
  // Seed an already-expired snoozeUntil with auto_extend policy.
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const cfg = await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_archive_deletion"],
  });
  await db
    .insert(systemSettings)
    .values({
      key: FOUNDER_PTO_MODE_SETTING_KEY,
      value: JSON.stringify({
        ...cfg,
        snoozeUntil: past,
        snoozePolicy: { kind: "auto_extend", extendDays: 3 },
        lastSnoozeSource: "manual",
      }),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: JSON.stringify({
          ...cfg,
          snoozeUntil: past,
          snoozePolicy: { kind: "auto_extend", extendDays: 3 },
          lastSnoozeSource: "manual",
        }),
      },
    });

  const now = new Date();
  const cur = await getFounderPtoModeConfig();
  const evaluated = await evaluateAndMaybeAutoExtendFounderPtoSnooze(cur, now);
  assert.equal(evaluated.snoozed, true);
  assert.equal(evaluated.source, "auto");
  assert.ok(evaluated.effectiveUntil);
  const bumpedMs = Date.parse(evaluated.effectiveUntil!);
  const expected = now.getTime() + 3 * 24 * 60 * 60 * 1000;
  assert.ok(
    Math.abs(bumpedMs - expected) < 5_000,
    "auto_extend should bump snoozeUntil ~3 days forward",
  );

  // Persisted — reloading returns the new timestamp.
  const reloaded = await getFounderPtoModeConfig();
  assert.equal(reloaded.snoozeUntil, evaluated.effectiveUntil);
  assert.equal(reloaded.lastSnoozeSource, "auto");
});

test("weekday_mute is active inside the window, inactive outside", async () => {
  // 18→8 with all days selected = window crosses midnight, so a UTC
  // hour of 20 must be inside the window and a UTC hour of 12 must be
  // outside.
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_audit_export"],
  });
  await setFounderPtoSnooze({
    snoozeUntil: null,
    snoozePolicy: {
      kind: "weekday_mute",
      days: [0, 1, 2, 3, 4, 5, 6],
      startHour: 18,
      endHour: 8,
    },
  });
  const cfg = await getFounderPtoModeConfig();

  const inside = new Date(Date.UTC(2026, 0, 1, 20, 0, 0));
  const outside = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));

  const a = await evaluateAndMaybeAutoExtendFounderPtoSnooze(cfg, inside);
  assert.equal(a.snoozed, true);
  assert.equal(a.source, "weekday_window");

  const b = await evaluateAndMaybeAutoExtendFounderPtoSnooze(cfg, outside);
  assert.equal(b.snoozed, false);
});

test("bumpFounderPtoSuppressedCount increments persistently", async () => {
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_audit_export"],
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await bumpFounderPtoSuppressedCount();
  await bumpFounderPtoSuppressedCount();
  const cfg = await getFounderPtoModeConfig();
  assert.equal(cfg.snoozeSuppressedCount, 2);

  // Snooze reset clears the counter.
  await setFounderPtoSnooze({ snoozeUntil: null });
  const cleared = await getFounderPtoModeConfig();
  assert.equal(cleared.snoozeSuppressedCount, 0);
});

test("bumpFounderPtoSuppressedCount with a record writes a suppression log row", async () => {
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_audit_export"],
  });
  const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await setFounderPtoSnooze({ snoozeUntil: until });

  await bumpFounderPtoSuppressedCount({
    notifierId: "audience_audit_export",
    source: "manual",
    effectiveUntil: until,
    summary: "Audit export by founder — 42 rows, csv",
    payload: { actorId: "founder", totalRowCount: 42, format: "csv" },
  });
  // Bumps with no record still bump the counter but DO NOT write a row.
  await bumpFounderPtoSuppressedCount();

  const cfg = await getFounderPtoModeConfig();
  assert.equal(cfg.snoozeSuppressedCount, 2);

  const log = await getFounderPtoSuppressionLog({ limit: 10 });
  assert.equal(log.length, 1);
  assert.equal(log[0].notifierId, "audience_audit_export");
  assert.equal(log[0].snoozeSource, "manual");
  assert.equal(log[0].effectiveUntil, until);
  assert.equal(log[0].summary, "Audit export by founder — 42 rows, csv");
  assert.deepEqual(log[0].payload, {
    actorId: "founder",
    totalRowCount: 42,
    format: "csv",
  });
});

test("getFounderPtoSuppressionLog filters by notifierId, orders newest first, and caps limit", async () => {
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: PTO_NOTIFIER_REGISTRY.map((n) => n.id),
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });

  await bumpFounderPtoSuppressedCount({
    notifierId: "audience_archive_deletion",
    source: "auto",
    summary: "digest A",
  });
  await new Promise((r) => setTimeout(r, 5));
  await bumpFounderPtoSuppressedCount({
    notifierId: "audience_audit_export",
    source: "manual",
    summary: "export B",
  });
  await new Promise((r) => setTimeout(r, 5));
  await bumpFounderPtoSuppressedCount({
    notifierId: "audience_archive_deletion",
    source: "weekday_window",
    summary: "digest C",
  });

  const all = await getFounderPtoSuppressionLog({ limit: 10 });
  assert.equal(all.length, 3);
  // newest first
  assert.equal(all[0].summary, "digest C");
  assert.equal(all[2].summary, "digest A");

  const archiveOnly = await getFounderPtoSuppressionLog({
    notifierId: "audience_archive_deletion",
    limit: 10,
  });
  assert.equal(archiveOnly.length, 2);
  assert.ok(
    archiveOnly.every((r) => r.notifierId === "audience_archive_deletion"),
  );

  // Limit clamp: anything above the max gets capped, anything <=0 falls
  // back to the default.
  const capped = await getFounderPtoSuppressionLog({
    limit: FOUNDER_PTO_SUPPRESSION_LOG_MAX_LIMIT + 999,
  });
  assert.ok(capped.length <= FOUNDER_PTO_SUPPRESSION_LOG_MAX_LIMIT);
});

test("pruneFounderPtoSuppressionLogOlderThan deletes only rows older than cutoff", async () => {
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_audit_export"],
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });

  // Old row.
  await bumpFounderPtoSuppressedCount({
    notifierId: "audience_audit_export",
    source: "manual",
    summary: "old one",
  });
  // Backdate it.
  const { founderPtoSuppressionLog } = await import("@shared/schema");
  await db
    .update(founderPtoSuppressionLog)
    .set({ occurredAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) });

  // Fresh row.
  await bumpFounderPtoSuppressedCount({
    notifierId: "audience_audit_export",
    source: "manual",
    summary: "fresh one",
  });

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const deleted = await pruneFounderPtoSuppressionLogOlderThan(cutoff);
  assert.equal(deleted, 1);

  const remaining = await getFounderPtoSuppressionLog({ limit: 10 });
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].summary, "fresh one");
});

test("getFounderPtoSuppressionStats groups by day+notifier+source within the window and filters by notifierId", async () => {
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: PTO_NOTIFIER_REGISTRY.map((n) => n.id),
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });

  // 3 archive-deletion / manual rows + 1 audit-export / auto row.
  await bumpFounderPtoSuppressedCount({
    notifierId: "audience_archive_deletion",
    source: "manual",
    summary: "a1",
  });
  await bumpFounderPtoSuppressedCount({
    notifierId: "audience_archive_deletion",
    source: "manual",
    summary: "a2",
  });
  await bumpFounderPtoSuppressedCount({
    notifierId: "audience_archive_deletion",
    source: "manual",
    summary: "a3",
  });
  await bumpFounderPtoSuppressedCount({
    notifierId: "audience_audit_export",
    source: "auto",
    summary: "b1",
  });
  // Backdate one row way outside the window — must be excluded.
  const { founderPtoSuppressionLog } = await import("@shared/schema");
  await bumpFounderPtoSuppressedCount({
    notifierId: "audience_archive_deletion",
    source: "weekday_window",
    summary: "old",
  });
  await db
    .update(founderPtoSuppressionLog)
    .set({ occurredAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) })
    .where(eq(founderPtoSuppressionLog.summary, "old"));

  const all = await getFounderPtoSuppressionStats({ days: 30 });
  assert.equal(all.totalCount, 4);
  assert.ok(all.buckets.length >= 2);
  const archiveBucket = all.buckets.find(
    (b) =>
      b.notifierId === "audience_archive_deletion" && b.source === "manual",
  );
  assert.ok(archiveBucket);
  assert.equal(archiveBucket!.count, 3);
  const auditBucket = all.buckets.find(
    (b) => b.notifierId === "audience_audit_export" && b.source === "auto",
  );
  assert.ok(auditBucket);
  assert.equal(auditBucket!.count, 1);
  // The backdated row is older than the 30-day window.
  assert.ok(
    !all.buckets.some((b) => b.source === "weekday_window"),
    "rows older than the window must be excluded",
  );

  const filtered = await getFounderPtoSuppressionStats({
    days: 30,
    notifierId: "audience_audit_export",
  });
  assert.equal(filtered.totalCount, 1);
  assert.ok(
    filtered.buckets.every((b) => b.notifierId === "audience_audit_export"),
  );

  // Day-cap clamp.
  const clamped = await getFounderPtoSuppressionStats({
    days: FOUNDER_PTO_SUPPRESSION_STATS_MAX_DAYS + 9999,
  });
  assert.equal(clamped.windowDays, FOUNDER_PTO_SUPPRESSION_STATS_MAX_DAYS);
});

test("getAllFounderPtoSuppressionLogForExport returns all surviving rows newest-first", async () => {
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: PTO_NOTIFIER_REGISTRY.map((n) => n.id),
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  for (const s of ["alpha", "beta", "gamma"]) {
    await bumpFounderPtoSuppressedCount({
      notifierId: "audience_audit_export",
      source: "manual",
      summary: s,
    });
    await new Promise((r) => setTimeout(r, 5));
  }
  const exported = await getAllFounderPtoSuppressionLogForExport();
  assert.equal(exported.length, 3);
  assert.equal(exported[0].summary, "gamma");
  assert.equal(exported[2].summary, "alpha");
  assert.ok(FOUNDER_PTO_SUPPRESSION_LOG_EXPORT_MAX >= 1000);

  const filtered = await getAllFounderPtoSuppressionLogForExport({
    notifierId: "audience_archive_deletion",
  });
  assert.equal(filtered.length, 0);
});

test("clearFounderPtoSuppressionLog wipes the table and returns the deleted count", async () => {
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: PTO_NOTIFIER_REGISTRY.map((n) => n.id),
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  for (let i = 0; i < 3; i++) {
    await bumpFounderPtoSuppressedCount({
      notifierId: "audience_audit_export",
      source: "manual",
      summary: `row ${i}`,
    });
  }
  assert.equal((await getFounderPtoSuppressionLog({ limit: 10 })).length, 3);

  const result = await clearFounderPtoSuppressionLog({ clearedBy: "founder@test" });
  assert.equal(result.deletedCount, 3);
  assert.equal(result.clearedBy, "founder@test");
  assert.ok(typeof result.clearedAt === "string" && result.clearedAt.length > 0);

  assert.equal((await getFounderPtoSuppressionLog({ limit: 10 })).length, 0);

  // Calling again on an empty table is a no-op that returns 0.
  const again = await clearFounderPtoSuppressionLog({ clearedBy: "founder@test" });
  assert.equal(again.deletedCount, 0);
});

test("disabled PTO never mutes even with a future snoozeUntil", async () => {
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  // Default enrollment but not enabled.
  const cfg = await getFounderPtoModeConfig();
  assert.equal(cfg.enabled, false);
  const evaluated = await evaluateAndMaybeAutoExtendFounderPtoSnooze(
    cfg,
    new Date(),
  );
  assert.equal(evaluated.snoozed, false);
});

/* ---------------- Task #622 — resume-recap email ---------------- */

test("manual unsnooze sends one resume recap when alerts were suppressed", async () => {
  await seedRecipients(["founder@mougle.com"]);
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_audit_export"],
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await bumpFounderPtoSuppressedCount();
  await bumpFounderPtoSuppressedCount();
  await bumpFounderPtoSuppressedCount();

  await setFounderPtoSnooze({ snoozeUntil: null });

  assert.equal(recapCalls.length, 1, "exactly one recap email should fire");
  assert.deepEqual(recapCalls[0].recipients, ["founder@mougle.com"]);
  assert.equal(recapCalls[0].payload.trigger, "manual_unsnooze");
  assert.equal(recapCalls[0].payload.suppressedCount, 3);
  assert.deepEqual(recapCalls[0].payload.enrolledNotifiers, [
    "audience_audit_export",
  ]);
});

test("replacing a snooze sends recap with trigger=replaced", async () => {
  await seedRecipients(["founder@mougle.com"]);
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_audit_export"],
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await bumpFounderPtoSuppressedCount();
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  assert.equal(recapCalls.length, 1);
  assert.equal(recapCalls[0].payload.trigger, "replaced");
  assert.equal(recapCalls[0].payload.suppressedCount, 1);
});

test("recap is not sent when no alerts were suppressed", async () => {
  await seedRecipients(["founder@mougle.com"]);
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_audit_export"],
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await setFounderPtoSnooze({ snoozeUntil: null });
  assert.equal(recapCalls.length, 0, "no recap when counter is 0");
});

test("recap is skipped when no recipients are configured", async () => {
  // no seedRecipients() call
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_audit_export"],
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await bumpFounderPtoSuppressedCount();
  await setFounderPtoSnooze({ snoozeUntil: null });
  assert.equal(recapCalls.length, 0);
});

test("runFounderPtoResumeRecapIfDue fires once after natural expiry, dedups after", async () => {
  await seedRecipients(["founder@mougle.com"]);
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_audit_export"],
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await bumpFounderPtoSuppressedCount();
  await bumpFounderPtoSuppressedCount();

  // Still snoozed — recap not due.
  const stillSnoozed = await runFounderPtoResumeRecapIfDue();
  assert.equal(stillSnoozed.recapSent, false);
  assert.equal(stillSnoozed.reason, "still_snoozed");
  assert.equal(recapCalls.length, 0);

  // Simulate the window having elapsed by walking the clock forward.
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const fired = await runFounderPtoResumeRecapIfDue({ now: future });
  assert.equal(fired.recapSent, true);
  assert.equal(fired.reason, "sent");
  assert.equal(fired.trigger, "natural_expiry");
  assert.equal(recapCalls.length, 1);
  assert.equal(recapCalls[0].payload.suppressedCount, 2);

  // State is cleared + dedup advanced — a second tick is a no-op.
  const again = await runFounderPtoResumeRecapIfDue({ now: future });
  assert.equal(again.recapSent, false);
  assert.equal(recapCalls.length, 1, "second tick must not re-send");

  const cleared = await getFounderPtoModeConfig();
  assert.equal(cleared.snoozeStartedAt, null);
  assert.equal(cleared.snoozeSuppressedCount, 0);
});

test("recap send failure does not advance dedup state (next tick retries)", async () => {
  await seedRecipients(["founder@mougle.com"]);
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: ["audience_audit_export"],
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await bumpFounderPtoSuppressedCount();

  recapImpl = async () => {
    throw new Error("resend down");
  };
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const failed = await runFounderPtoResumeRecapIfDue({ now: future });
  assert.equal(failed.recapSent, false);
  assert.equal(failed.reason, "send_failed");
  assert.equal(recapCalls.length, 1);

  const cfgAfter = await getFounderPtoModeConfig();
  assert.ok(cfgAfter.snoozeStartedAt, "snoozeStartedAt must persist for retry");
  assert.notEqual(cfgAfter.lastResumeRecapAt, cfgAfter.snoozeStartedAt);

  // Recover and retry — the next tick fires successfully.
  recapImpl = async () => ({ id: "mock" });
  const retried = await runFounderPtoResumeRecapIfDue({ now: future });
  assert.equal(retried.recapSent, true);
  assert.equal(recapCalls.length, 2);
});
