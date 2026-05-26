/**
 * Task #524 — Audit-export history email staleness alert.
 *
 * Verifies that when the scheduled compliance email goes silent past
 * the cadence + grace window (weekly => 8d, monthly => 32d), a
 * `platform_alerts` row of type `audience_audit_history_email_stale`
 * is created, that the alert is NOT duplicated while still stale, and
 * that the alert auto-resolves once a fresh successful run lands.
 * Disabled schedules and schedules with no recipients never trigger.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
// Task #729 — this file is DB-heavy. Pool sizing is governed by
// `server/db.ts` under NODE_ENV=test (default max=2, overridable via
// the `TEST_DB_POOL_MAX` env var). The accompanying helper
// `tests/helpers/db-cleanup.ts` documents the pattern. We do NOT call
// `pool.end()` per file — tsx --test runs every file in a single
// process, so ending the pool mid-suite would break sibling files.
import "./helpers/db-cleanup";
import { platformAlerts } from "@shared/schema";
import { audienceAuditExports } from "../shared/omni-channel-audience-schema";
import { audienceAuditHistoryEmailScheduler } from "../server/services/audience-audit-history-email-scheduler";
import {
  AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_ALERT_TYPE,
  audienceAuditHistoryEmailStaleAlertService,
  getAudienceAuditHistoryEmailStaleSnooze,
  resetAudienceAuditHistoryEmailStaleSnoozeForTests,
  setAudienceAuditHistoryEmailStaleSnooze,
  listAudienceAuditHistoryEmailStaleSnoozeLog,
  pruneAudienceAuditHistoryEmailStaleSnoozeLogOlderThan,
  clearAudienceAuditHistoryEmailStaleSnoozeLogForTests,
} from "../server/services/audience-audit-history-email-stale-alert-service";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { emailService } from "../server/services/email-service";

type SendArgs = Parameters<typeof emailService.sendAudienceAuditHistoryExport>;
type SendImpl = (
  recipients: SendArgs[0],
  payload: SendArgs[1],
) => Promise<any>;

const originalSend = emailService.sendAudienceAuditHistoryExport.bind(emailService);
let sendImpl: SendImpl = async () => ({ id: "mock_email_id" });

(emailService as any).sendAudienceAuditHistoryExport = async (
  recipients: SendArgs[0],
  payload: SendArgs[1],
) => sendImpl(recipients, payload);

// Task #626 — capture recap-email sends so tests can assert on payload.
type RecapArgs = Parameters<typeof emailService.sendAudienceAuditHistoryEmailStaleSnoozeRecap>;
type RecapPayload = RecapArgs[1];
type RecapImpl = (to: RecapArgs[0], payload: RecapPayload) => Promise<any>;

const originalRecap =
  emailService.sendAudienceAuditHistoryEmailStaleSnoozeRecap.bind(emailService);
let recapImpl: RecapImpl = async () => ({ id: "mock_recap_id" });
const recapCalls: Array<{ to: string; payload: RecapPayload }> = [];
(emailService as any).sendAudienceAuditHistoryEmailStaleSnoozeRecap = async (
  to: RecapArgs[0],
  payload: RecapPayload,
) => {
  recapCalls.push({ to, payload });
  return recapImpl(to, payload);
};

async function clearOurAlerts() {
  await db
    .delete(platformAlerts)
    .where(
      eq(
        platformAlerts.type,
        AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_ALERT_TYPE,
      ),
    );
}

async function listOpenAlerts() {
  return db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(
          platformAlerts.type,
          AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_ALERT_TYPE,
        ),
        eq(platformAlerts.acknowledged, false),
      ),
    );
}

beforeEach(async () => {
  sendImpl = async () => ({ id: "mock_email_id" });
  recapImpl = async () => ({ id: "mock_recap_id" });
  recapCalls.length = 0;
  audienceAuditHistoryEmailStaleAlertService.resetForTests();
  await omniChannelAudienceSafetyService.reset();
  await db.delete(audienceAuditExports);
  await audienceAuditHistoryEmailScheduler.resetForTests();
  await clearOurAlerts();
  // Task #570 + #626 — wipe persisted snooze + recap state across tests.
  await resetAudienceAuditHistoryEmailStaleSnoozeForTests();
  // Task #686 — clear the snooze-log audit table so the per-test
  // assertions below see a clean ledger.
  await clearAudienceAuditHistoryEmailStaleSnoozeLogForTests();
});

afterEach(async () => {
  sendImpl = async () => ({ id: "mock_email_id" });
  recapImpl = async () => ({ id: "mock_recap_id" });
  recapCalls.length = 0;
  await clearOurAlerts();
  await resetAudienceAuditHistoryEmailStaleSnoozeForTests();
});

process.on("exit", () => {
  (emailService as any).sendAudienceAuditHistoryExport = originalSend;
  (emailService as any).sendAudienceAuditHistoryEmailStaleSnoozeRecap =
    originalRecap;
});

const DAY_MS = 24 * 60 * 60 * 1000;

async function configureSchedule(
  cadence: "weekly" | "monthly" = "weekly",
): Promise<void> {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence,
    recipients: ["ops@example.com"],
  });
}

test("disabled schedule never triggers staleness alert", async () => {
  // Schedule defaults to disabled with no recipients.
  const farFuture = new Date(Date.now() + 365 * DAY_MS);
  const out = await audienceAuditHistoryEmailStaleAlertService.tick(farFuture);
  assert.equal(out.evaluation.stale, false);
  assert.equal(out.evaluation.reason, "disabled");
  assert.equal(out.fired, false);
  const open = await listOpenAlerts();
  assert.equal(open.length, 0);
});

test("enabled-but-fresh schedule does not trigger", async () => {
  await configureSchedule("weekly");
  // Land a successful real scheduler run.
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  const out = await audienceAuditHistoryEmailStaleAlertService.tick();
  assert.equal(out.evaluation.stale, false);
  assert.equal(out.evaluation.reason, "fresh");
  assert.equal(out.fired, false);
  assert.equal((await listOpenAlerts()).length, 0);
});

test("weekly schedule with last success >8d ago fires the alert", async () => {
  await configureSchedule("weekly");
  // Seed a successful run that completes "now-ish", then move the clock
  // forward 9 days.
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  const now = new Date(Date.now() + 9 * DAY_MS);

  const out = await audienceAuditHistoryEmailStaleAlertService.tick(now);
  assert.equal(out.evaluation.stale, true);
  assert.equal(out.evaluation.cadence, "weekly");
  assert.equal(out.evaluation.reason, "stale_overdue");
  assert.equal(out.fired, true);

  const open = await listOpenAlerts();
  assert.equal(open.length, 1, "exactly one stale alert");
  const row = open[0];
  assert.match(row.message, /history email has gone silent/i);
  assert.match(row.message, /cadence=weekly/);
  const d = (row.details as Record<string, any>) ?? {};
  assert.equal(d.source, "audience-audit-history-email-stale-alert-service");
  assert.equal(d.cadence, "weekly");
  assert.equal(d.allowedAgeDays, 8);
  assert.equal(d.reason, "stale_overdue");
  assert.deepEqual(d.recipients, ["ops@example.com"]);
  assert.equal(d.link, "/admin/omni-channel-audience#audit-history");

  const exposed =
    await audienceAuditHistoryEmailStaleAlertService.getOpenAlert();
  assert.ok(exposed);
  assert.match(exposed!.message, /history email has gone silent/i);
});

test("monthly schedule allows up to 32d before firing", async () => {
  await configureSchedule("monthly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // 30d later: still fresh for monthly cadence.
  let out = await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(Date.now() + 30 * DAY_MS),
  );
  assert.equal(out.evaluation.stale, false);
  assert.equal(out.fired, false);
  assert.equal((await listOpenAlerts()).length, 0);

  // 33d later: stale for monthly cadence.
  out = await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(Date.now() + 33 * DAY_MS),
  );
  assert.equal(out.evaluation.stale, true);
  assert.equal(out.evaluation.cadence, "monthly");
  assert.equal(out.fired, true);
  const open = await listOpenAlerts();
  assert.equal(open.length, 1);
  const d = (open[0].details as Record<string, any>) ?? {};
  assert.equal(d.allowedAgeDays, 32);
});

test("repeated stale ticks do not duplicate the open alert", async () => {
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  const now = new Date(Date.now() + 9 * DAY_MS);

  await audienceAuditHistoryEmailStaleAlertService.tick(now);
  const second = await audienceAuditHistoryEmailStaleAlertService.tick(now);
  const third = await audienceAuditHistoryEmailStaleAlertService.tick(now);

  assert.equal(second.fired, false, "no second page while already open");
  assert.equal(third.fired, false, "no third page while already open");
  const open = await listOpenAlerts();
  assert.equal(open.length, 1, "still exactly one open alert");
});

test("fresh successful run auto-resolves the stale alert", async () => {
  await configureSchedule("weekly");
  // Seed prior export so the run has something meaningful to attach.
  await omniChannelAudienceSafetyService.recordAuditExport({
    actorId: "admin-1",
    actorType: "staff",
    actorRole: "root_admin",
    format: "json",
    filters: { fromDate: null, toDate: null, platform: null, productionId: null },
    rowCounts: { connectors: 0, messages: 1, decisions: 0, commands: 0 },
  });
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // Go stale.
  const stalenessClock = new Date(Date.now() + 10 * DAY_MS);
  const fired =
    await audienceAuditHistoryEmailStaleAlertService.tick(stalenessClock);
  assert.equal(fired.fired, true);
  assert.equal((await listOpenAlerts()).length, 1);

  // Land a fresh successful run.
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  const recovered = await audienceAuditHistoryEmailStaleAlertService.tick();
  assert.equal(recovered.evaluation.stale, false);
  assert.equal(recovered.evaluation.reason, "fresh");
  assert.equal(recovered.fired, false);
  assert.equal(recovered.resolved, 1);
  assert.equal((await listOpenAlerts()).length, 0);

  // The acked row must carry the autoResolved annotation.
  const all = await db
    .select()
    .from(platformAlerts)
    .where(
      eq(
        platformAlerts.type,
        AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_ALERT_TYPE,
      ),
    );
  const acked = all.filter((r) => r.acknowledged);
  assert.equal(acked.length, 1);
  const d = (acked[0].details as Record<string, any>) ?? {};
  assert.equal(d.autoResolved, true);
  assert.equal(acked[0].acknowledgedBy, "system");
  assert.ok(d.autoResolvedAt);
});

test("enabled schedule with no successful run yet only fires once configured-age exceeds the window", async () => {
  await configureSchedule("weekly");
  // No successful run on record. Immediately checking must NOT fire —
  // the schedule was just configured.
  const immediate = await audienceAuditHistoryEmailStaleAlertService.tick();
  assert.equal(immediate.evaluation.hasEverSucceeded, false);
  assert.equal(immediate.evaluation.stale, false);
  assert.equal(immediate.evaluation.reason, "never_succeeded");
  assert.equal(immediate.fired, false);

  // 10 days later, still no successful run → fire.
  const later = new Date(Date.now() + 10 * DAY_MS);
  const aged = await audienceAuditHistoryEmailStaleAlertService.tick(later);
  assert.equal(aged.evaluation.stale, true);
  assert.equal(aged.evaluation.reason, "stale_no_success");
  assert.equal(aged.fired, true);
  assert.equal((await listOpenAlerts()).length, 1);
});

test("test sends do not count as 'fresh' — staleness still evaluates against real scheduler success", async () => {
  await configureSchedule("weekly");
  // Land a real success first.
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  // 9d later, send a test → should not bump lastSuccessfulRunAt for
  // compliance purposes (excludeTestRuns defaults to true).
  await audienceAuditHistoryEmailScheduler.sendTestNow("me@example.com");

  const out = await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(Date.now() + 9 * DAY_MS),
  );
  assert.equal(out.evaluation.stale, true);
  assert.equal(out.fired, true);
});

// Task #570 — founder snooze blocks the staleness alert during planned
// downtime (maintenance, intentional Resend pause, recipient list
// rewrite) without losing the schedule.

test("snooze short-circuits a stale schedule — no alert fires while snoozed", async () => {
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // Snooze for 2 days starting now.
  const snoozeUntil = new Date(Date.now() + 2 * DAY_MS).toISOString();
  const set = await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil,
    updatedBy: "founder-1",
  });
  assert.equal(set.snoozeUntil, snoozeUntil);
  assert.equal(set.updatedBy, "founder-1");

  // Persisted to system_settings + reloadable.
  const reloaded = await getAudienceAuditHistoryEmailStaleSnooze();
  assert.equal(reloaded.snoozeUntil, snoozeUntil);
  assert.equal(reloaded.updatedBy, "founder-1");

  // Jump to 9 days from now — schedule is normally stale (>8d) but
  // we're still inside the snooze window.
  const now = new Date(Date.now() + 9 * DAY_MS);
  // To stay inside the snooze, extend it for the test window.
  const longSnooze = new Date(now.getTime() + DAY_MS).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: longSnooze,
    updatedBy: "founder-1",
    now,
  });

  const out = await audienceAuditHistoryEmailStaleAlertService.tick(now);
  assert.equal(out.evaluation.reason, "snoozed");
  assert.equal(out.evaluation.stale, false);
  assert.equal(out.evaluation.snoozeUntil, longSnooze);
  assert.equal(out.fired, false);
  assert.equal((await listOpenAlerts()).length, 0);
});

test("snooze expiry resumes firing the staleness alert", async () => {
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // Snooze for a small window relative to "now".
  const baseNow = new Date(Date.now() + 9 * DAY_MS);
  const snoozeUntil = new Date(baseNow.getTime() + DAY_MS).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil,
    updatedBy: "founder-1",
    now: baseNow,
  });

  // While snoozed → no fire.
  const duringSnooze =
    await audienceAuditHistoryEmailStaleAlertService.tick(baseNow);
  assert.equal(duringSnooze.evaluation.reason, "snoozed");
  assert.equal(duringSnooze.fired, false);
  assert.equal((await listOpenAlerts()).length, 0);

  // 2 days after baseNow — snooze has expired, scheduler is still
  // silent → alert fires.
  const afterSnooze = new Date(baseNow.getTime() + 2 * DAY_MS);
  const out =
    await audienceAuditHistoryEmailStaleAlertService.tick(afterSnooze);
  assert.equal(out.evaluation.reason, "stale_overdue");
  assert.equal(out.evaluation.stale, true);
  assert.equal(out.fired, true);
  assert.equal((await listOpenAlerts()).length, 1);
});

// Task #627 — recurring weekly mute window. No `snoozeUntil` required;
// muted only on the configured weekdays/hours.
test("weekday_mute policy mutes only within the configured window", async () => {
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // Mute Monday 09:00–10:00 UTC.
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: null,
    snoozePolicy: {
      kind: "weekday_mute",
      days: [1],
      startHour: 9,
      endHour: 10,
    },
    updatedBy: "founder-1",
  });
  const reloaded = await getAudienceAuditHistoryEmailStaleSnooze();
  assert.equal(reloaded.snoozePolicy.kind, "weekday_mute");

  // Pick a stale baseline (9d after last success). Force a Monday 09:30 UTC
  // — inside the mute window → should NOT fire.
  // Find next Monday at 09:30 UTC from "now + 9d".
  const baseline = new Date(Date.now() + 9 * DAY_MS);
  const insideMonday = new Date(baseline);
  insideMonday.setUTCHours(9, 30, 0, 0);
  while (insideMonday.getUTCDay() !== 1) {
    insideMonday.setUTCDate(insideMonday.getUTCDate() + 1);
  }
  const out = await audienceAuditHistoryEmailStaleAlertService.tick(insideMonday);
  assert.equal(out.evaluation.reason, "snoozed");
  assert.equal(out.evaluation.stale, false);
  assert.equal(out.evaluation.snoozePolicy.kind, "weekday_mute");
  assert.equal(out.fired, false);
  assert.equal((await listOpenAlerts()).length, 0);

  // Monday 11:00 UTC — outside the mute window, stale → fires.
  const outsideMonday = new Date(insideMonday);
  outsideMonday.setUTCHours(11, 0, 0, 0);
  const fired = await audienceAuditHistoryEmailStaleAlertService.tick(outsideMonday);
  assert.equal(fired.evaluation.reason, "stale_overdue");
  assert.equal(fired.fired, true);
  assert.equal((await listOpenAlerts()).length, 1);
});

test("auto_extend policy keeps re-rolling snoozeUntil past the original window", async () => {
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // Set a 1-day auto_extend snooze starting now-ish.
  const baseNow = new Date();
  const firstUntil = new Date(baseNow.getTime() + DAY_MS).toISOString();
  const set = await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: firstUntil,
    snoozePolicy: { kind: "auto_extend", extendDays: 3 },
    updatedBy: "founder-1",
    now: baseNow,
  });
  assert.equal(set.snoozePolicy.kind, "auto_extend");
  // auto_extend bypasses the 90d cap; snoozeUntil should be the exact ask.
  assert.equal(set.snoozeUntil, firstUntil);

  // Jump 9 days forward — schedule is stale AND the original snoozeUntil
  // has elapsed. Tick should auto-extend instead of firing.
  const later = new Date(baseNow.getTime() + 9 * DAY_MS);
  const out = await audienceAuditHistoryEmailStaleAlertService.tick(later);
  assert.equal(out.evaluation.reason, "snoozed");
  assert.equal(out.fired, false);
  assert.equal((await listOpenAlerts()).length, 0);

  // Reloaded snoozeUntil should now be ~3 days after `later`.
  const reloaded = await getAudienceAuditHistoryEmailStaleSnooze();
  assert.ok(reloaded.snoozeUntil);
  const newUntilMs = Date.parse(reloaded.snoozeUntil!);
  const expectedMs = later.getTime() + 3 * DAY_MS;
  assert.ok(
    Math.abs(newUntilMs - expectedMs) < 60_000,
    `expected snoozeUntil ~${new Date(expectedMs).toISOString()}, got ${reloaded.snoozeUntil}`,
  );
});

test("auto_extend bypasses the 90-day cap that fixed policy enforces", async () => {
  const now = new Date();
  const farFuture = new Date(now.getTime() + 200 * DAY_MS).toISOString();
  const cfg = await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: farFuture,
    snoozePolicy: { kind: "auto_extend", extendDays: 7 },
    now,
  });
  assert.equal(cfg.snoozeUntil, farFuture);
});

test("snooze rejects past timestamps and caps fixed window at 90 days", async () => {
  // Past timestamp → throws.
  await assert.rejects(
    () =>
      setAudienceAuditHistoryEmailStaleSnooze({
        snoozeUntil: new Date(Date.now() - DAY_MS).toISOString(),
      }),
    /future/,
  );

  // Invalid timestamp → throws.
  await assert.rejects(
    () =>
      setAudienceAuditHistoryEmailStaleSnooze({
        snoozeUntil: "not-a-date",
      }),
    /invalid/i,
  );

  // 365d ask gets capped at 90d.
  const now = new Date();
  const farFuture = new Date(now.getTime() + 365 * DAY_MS).toISOString();
  const cfg = await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: farFuture,
    now,
  });
  assert.ok(cfg.snoozeUntil);
  const cappedMs = Date.parse(cfg.snoozeUntil!);
  const maxAllowedMs = now.getTime() + 90 * DAY_MS;
  // Allow a few ms of clock drift between request and persistence.
  assert.ok(
    cappedMs <= maxAllowedMs + 1000,
    `expected snoozeUntil <= ${new Date(maxAllowedMs).toISOString()}, got ${cfg.snoozeUntil}`,
  );
  assert.ok(
    cappedMs >= maxAllowedMs - 1000,
    `expected snoozeUntil near 90d cap, got ${cfg.snoozeUntil}`,
  );

  // Unsnooze clears the row.
  const cleared = await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: null,
  });
  assert.equal(cleared.snoozeUntil, null);
  const reloaded = await getAudienceAuditHistoryEmailStaleSnooze();
  assert.equal(reloaded.snoozeUntil, null);
});


// ---------------------------------------------------------------------
// Task #626 — snooze-window recap. After a snooze ends and the
// schedule is *still* stale, founders should get a one-shot email
// telling them exactly how many ticks were silently swallowed.
// ---------------------------------------------------------------------

test("snooze recap email fires on first stale tick after snooze expiry", async () => {
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // Open a 1d snooze starting at "9d from now". The schedule is
  // already stale (>8d since last success) so every snooze tick is a
  // would-have-paged tick.
  const baseNow = new Date(Date.now() + 9 * DAY_MS);
  const snoozeUntil = new Date(baseNow.getTime() + DAY_MS).toISOString();
  const cfg = await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil,
    updatedBy: "founder-1",
    now: baseNow,
  });
  assert.equal(cfg.snoozeStartedAt, baseNow.toISOString());
  assert.equal(cfg.snoozeSuppressedTicks, 0);
  assert.equal(cfg.lastSnoozeRecapAt, null);

  // Two ticks during the snooze — each must bump the suppressed
  // counter (the scheduler is would-be-stale) and not page or recap.
  for (const offsetMs of [1 * 60 * 60 * 1000, 12 * 60 * 60 * 1000]) {
    const t = new Date(baseNow.getTime() + offsetMs);
    const out = await audienceAuditHistoryEmailStaleAlertService.tick(t);
    assert.equal(out.evaluation.reason, "snoozed");
    assert.equal(out.fired, false);
    assert.equal(out.recapSent, false);
  }
  const midSnooze = await getAudienceAuditHistoryEmailStaleSnooze();
  assert.equal(midSnooze.snoozeSuppressedTicks, 2);
  assert.ok(
    (midSnooze.snoozeMaxSuppressedAgeMs ?? 0) > 9 * DAY_MS,
    "max suppressed age must reflect actual staleness during the snooze",
  );
  assert.equal(recapCalls.length, 0);

  // Snooze expires; schedule is still stale → recap should fire on
  // this tick. The normal stale-alert page should also fire (no open
  // alert yet).
  const afterSnooze = new Date(baseNow.getTime() + 2 * DAY_MS);
  const expired =
    await audienceAuditHistoryEmailStaleAlertService.tick(afterSnooze);
  assert.equal(expired.evaluation.reason, "stale_overdue");
  assert.equal(expired.evaluation.stale, true);
  assert.equal(expired.fired, true);
  assert.equal(expired.recapSent, true);
  assert.equal(expired.recapReason, "sent");

  assert.equal(recapCalls.length, 1, "exactly one recap delivery");
  const recap = recapCalls[0];
  assert.equal(recap.payload.suppressedTicks, 2);
  assert.equal(recap.payload.cadence, "weekly");
  assert.equal(recap.payload.allowedAgeMs, 8 * DAY_MS);
  assert.equal(recap.payload.snoozeStartedAt, baseNow.toISOString());
  assert.equal(recap.payload.snoozeEndedAt, afterSnooze.toISOString());
  assert.ok(recap.payload.currentAgeMs && recap.payload.currentAgeMs > 8 * DAY_MS);
  assert.equal(typeof recap.payload.lastSuccessfulRunAt, "string");

  // Dedup: subsequent stale ticks must NOT re-send the recap.
  const followup = await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(afterSnooze.getTime() + DAY_MS),
  );
  assert.equal(followup.recapSent, false);
  assert.equal(recapCalls.length, 1, "recap is deduped per snooze window");
  const finalCfg = await getAudienceAuditHistoryEmailStaleSnooze();
  assert.equal(finalCfg.lastSnoozeRecapAt, baseNow.toISOString());
});

test("setting a new snooze resets the suppressed-tick counters and dedup key", async () => {
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // Snooze A, accumulate two suppressed ticks.
  const baseNow = new Date(Date.now() + 9 * DAY_MS);
  const snoozeA = new Date(baseNow.getTime() + DAY_MS).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: snoozeA,
    updatedBy: "founder-1",
    now: baseNow,
  });
  await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(baseNow.getTime() + 60 * 60 * 1000),
  );
  await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(baseNow.getTime() + 90 * 60 * 1000),
  );
  let cfg = await getAudienceAuditHistoryEmailStaleSnooze();
  assert.equal(cfg.snoozeSuppressedTicks, 2);
  assert.equal(cfg.snoozeStartedAt, baseNow.toISOString());

  // Set snooze B (a new window). Per task: counters must reset.
  const replaceAt = new Date(baseNow.getTime() + 30 * 60 * 1000);
  const snoozeB = new Date(replaceAt.getTime() + 2 * DAY_MS).toISOString();
  cfg = await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: snoozeB,
    updatedBy: "founder-1",
    now: replaceAt,
  });
  assert.equal(cfg.snoozeSuppressedTicks, 0);
  assert.equal(cfg.snoozeMaxSuppressedAgeMs, null);
  assert.equal(cfg.snoozeLastSuppressedLastSuccessfulRunAt, null);
  assert.equal(cfg.lastSnoozeRecapAt, null);
  assert.equal(cfg.snoozeStartedAt, replaceAt.toISOString());
});

test("manual unsnooze preserves recap state so the next stale tick still emits the recap", async () => {
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // Open a snooze and accumulate suppressed ticks.
  const baseNow = new Date(Date.now() + 9 * DAY_MS);
  const snoozeUntil = new Date(baseNow.getTime() + 2 * DAY_MS).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil,
    updatedBy: "founder-1",
    now: baseNow,
  });
  await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(baseNow.getTime() + 60 * 60 * 1000),
  );
  const beforeUnsnooze = await getAudienceAuditHistoryEmailStaleSnooze();
  assert.equal(beforeUnsnooze.snoozeSuppressedTicks, 1);

  // Manually unsnooze (snoozeUntil → null). State must persist so the
  // next stale tick can recap.
  await setAudienceAuditHistoryEmailStaleSnooze({ snoozeUntil: null });
  const afterUnsnooze = await getAudienceAuditHistoryEmailStaleSnooze();
  assert.equal(afterUnsnooze.snoozeUntil, null);
  assert.equal(afterUnsnooze.snoozeSuppressedTicks, 1);
  assert.equal(afterUnsnooze.snoozeStartedAt, baseNow.toISOString());

  // Next stale tick → recap fires.
  const tickAt = new Date(baseNow.getTime() + 2 * 60 * 60 * 1000);
  const out = await audienceAuditHistoryEmailStaleAlertService.tick(tickAt);
  assert.equal(out.evaluation.stale, true);
  assert.equal(out.recapSent, true);
  assert.equal(recapCalls.length, 1);
  assert.equal(recapCalls[0].payload.suppressedTicks, 1);
  assert.equal(recapCalls[0].payload.snoozeStartedAt, baseNow.toISOString());
  assert.equal(recapCalls[0].payload.snoozeEndedAt, tickAt.toISOString());
});

test("no recap fires when the schedule is healthy after the snooze ends", async () => {
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // Snooze for a short window; schedule is fresh, no suppressed ticks.
  const snoozeUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil,
    updatedBy: "founder-1",
  });

  // After snooze expiry but still fresh: no recap, no page.
  const afterSnooze = new Date(Date.now() + 60 * 60 * 1000);
  const out =
    await audienceAuditHistoryEmailStaleAlertService.tick(afterSnooze);
  assert.equal(out.evaluation.stale, false);
  assert.equal(out.evaluation.reason, "fresh");
  assert.equal(out.fired, false);
  assert.equal(out.recapSent, false);
  assert.equal(recapCalls.length, 0);
});

test("recap send failure does not advance dedup — retry on next tick", async () => {
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // Snooze then expire.
  const baseNow = new Date(Date.now() + 9 * DAY_MS);
  const snoozeUntil = new Date(baseNow.getTime() + 1 * 60 * 60 * 1000).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil,
    updatedBy: "founder-1",
    now: baseNow,
  });
  // One suppressed tick.
  await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(baseNow.getTime() + 30 * 60 * 1000),
  );

  // First post-snooze tick: recap email throws.
  recapImpl = async () => {
    throw new Error("resend boom");
  };
  const failed = await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(baseNow.getTime() + 2 * 60 * 60 * 1000),
  );
  assert.equal(failed.recapSent, false);
  assert.equal(failed.recapReason, "send_failed");
  const cfg = await getAudienceAuditHistoryEmailStaleSnooze();
  assert.equal(cfg.lastSnoozeRecapAt, null, "dedup must not advance on failure");

  // Restore success and retry on the next tick.
  recapImpl = async () => ({ id: "ok" });
  const retry = await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(baseNow.getTime() + 3 * 60 * 60 * 1000),
  );
  assert.equal(retry.recapSent, true);
  assert.equal(retry.recapReason, "sent");
  assert.equal(recapCalls.length, 2, "retry produced a second send attempt");
});

/* ------------------------------------------------------------------ */
/* Task #692 — durable snooze-window history                           */
/* ------------------------------------------------------------------ */

import {
  listAudienceAuditHistoryEmailStaleSnoozeLog,
  pruneAudienceAuditHistoryEmailStaleSnoozeLogOlderThan,
  clearAudienceAuditHistoryEmailStaleSnoozeLogForTests,
} from "../server/services/audience-audit-history-email-stale-alert-service";
import { audienceAuditHistoryEmailStaleSnoozeLog } from "../shared/omni-channel-audience-schema";

test("Task #692: setting a snooze opens a fresh log row", async () => {
  await clearAudienceAuditHistoryEmailStaleSnoozeLogForTests();
  const until = new Date(Date.now() + 2 * DAY_MS).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: until,
    updatedBy: "founder-1",
  });
  const rows = await listAudienceAuditHistoryEmailStaleSnoozeLog(10);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.endedAt, null);
  assert.equal(row.endedReason, null);
  assert.equal(row.policyKind, "fixed");
  assert.equal(row.createdBy, "founder-1");
  assert.equal(row.snoozeUntil, until);
});

test("Task #692: replacing an active snooze closes the open row with reason=replaced and snapshots counters", async () => {
  await clearAudienceAuditHistoryEmailStaleSnoozeLogForTests();
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  // Open snooze #1 long enough to suppress a tick.
  const first = new Date(Date.now() + 30 * DAY_MS).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: first,
    updatedBy: "founder-1",
  });
  // Suppressed tick at +9d (would normally page).
  await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(Date.now() + 9 * DAY_MS),
  );
  const counters = await getAudienceAuditHistoryEmailStaleSnooze();
  assert.ok(counters.snoozeSuppressedTicks >= 1, "counters bumped");

  // Replace with a new window.
  const second = new Date(Date.now() + 60 * DAY_MS).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: second,
    updatedBy: "founder-2",
  });

  const rows = await listAudienceAuditHistoryEmailStaleSnoozeLog(10);
  assert.equal(rows.length, 2, "old + new");
  const open = rows.filter((r) => r.endedAt === null);
  const closed = rows.filter((r) => r.endedAt !== null);
  assert.equal(open.length, 1);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].endedReason, "replaced");
  assert.equal(closed[0].createdBy, "founder-1");
  assert.equal(closed[0].suppressedTicks, counters.snoozeSuppressedTicks);
  assert.equal(open[0].createdBy, "founder-2");
  assert.equal(open[0].snoozeUntil, second);
});

test("Task #692: clearing a snooze closes the open row with reason=unsnoozed", async () => {
  await clearAudienceAuditHistoryEmailStaleSnoozeLogForTests();
  const until = new Date(Date.now() + 2 * DAY_MS).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: until,
    updatedBy: "founder-1",
  });
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: null,
    updatedBy: "founder-1",
  });
  const rows = await listAudienceAuditHistoryEmailStaleSnoozeLog(10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endedReason, "unsnoozed");
  assert.ok(rows[0].endedAt);
});

test("Task #692: natural expiry via tick closes the open row with reason=expired", async () => {
  await clearAudienceAuditHistoryEmailStaleSnoozeLogForTests();
  await configureSchedule("weekly");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  const until = new Date(Date.now() + 1 * DAY_MS).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: until,
    updatedBy: "founder-1",
  });

  // Tick AFTER snoozeUntil has elapsed.
  await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(Date.now() + 2 * DAY_MS),
  );
  const rows = await listAudienceAuditHistoryEmailStaleSnoozeLog(10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endedReason, "expired");
  assert.ok(rows[0].endedAt);

  // Idempotent: a second tick after expiry must not create a duplicate
  // close (where now matches `endedAt IS NULL`).
  await audienceAuditHistoryEmailStaleAlertService.tick(
    new Date(Date.now() + 3 * DAY_MS),
  );
  const rows2 = await listAudienceAuditHistoryEmailStaleSnoozeLog(10);
  assert.equal(rows2.length, 1, "no duplicate close");
});

test("Task #692: prune drops only CLOSED rows older than the cutoff and preserves open windows", async () => {
  await clearAudienceAuditHistoryEmailStaleSnoozeLogForTests();
  // Open + close one window so we have a closed row to age out.
  const until = new Date(Date.now() + 2 * DAY_MS).toISOString();
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: until,
    updatedBy: "founder-1",
  });
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: null,
    updatedBy: "founder-1",
  });
  // Open another window (this one stays open).
  await setAudienceAuditHistoryEmailStaleSnooze({
    snoozeUntil: new Date(Date.now() + 10 * DAY_MS).toISOString(),
    updatedBy: "founder-1",
  });

  // Backdate the closed row's endedAt to ~90d ago.
  await db
    .update(audienceAuditHistoryEmailStaleSnoozeLog)
    .set({ endedAt: new Date(Date.now() - 90 * DAY_MS) })
    .where(eq(audienceAuditHistoryEmailStaleSnoozeLog.endedReason, "unsnoozed"));

  const before = await listAudienceAuditHistoryEmailStaleSnoozeLog(50);
  assert.ok(before.length >= 2);

  const cutoff = new Date(Date.now() - 30 * DAY_MS);
  const deleted = await pruneAudienceAuditHistoryEmailStaleSnoozeLogOlderThan(
    cutoff,
  );
  assert.equal(deleted, 1, "exactly one ancient closed row pruned");

  const after = await listAudienceAuditHistoryEmailStaleSnoozeLog(50);
  const stillOpen = after.filter((r) => r.endedAt === null);
  assert.equal(stillOpen.length, 1, "open snooze window preserved");
  assert.equal(
    after.filter((r) => r.endedReason === "unsnoozed").length,
    0,
    "old closed row gone",
  );
});
