import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import { emailService } from "../server/services/email-service";
import {
  AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY,
  getAudienceArchiveDeletionNotifierConfig,
  setAudienceArchiveDeletionNotifierConfig,
  setAudienceArchiveDeletionNotifierSnooze,
  runUpcomingExpiryDigest,
  notifyPostCleanup,
  runSnoozeRecapIfDue,
  sendTestArchiveDeletionEmail,
  sendTestArchiveExpiryDigestEmail,
  getAudienceArchiveDeletionNotifierHistory,
  resetAudienceArchiveDeletionNotifierHistoryForTests,
  evaluateAndMaybeAutoExtendSnooze,
  listAudienceArchiveDeletionSnoozeLog,
  pruneAudienceArchiveDeletionSnoozeLogOlderThan,
  clearAudienceArchiveDeletionSnoozeLogForTests,
  resendLastSnoozeRecap,
} from "../server/services/audience-archive-deletion-notifier";
import type {
  AudienceArchiveCleanupResult,
  AudienceArchiveStats,
} from "../server/services/audience-retention-service";

type DigestArgs = Parameters<typeof emailService.sendAudienceArchiveExpiryDigest>;
type SummaryArgs = Parameters<typeof emailService.sendAudienceArchiveCleanupSummary>;
type RecapArgs = Parameters<typeof emailService.sendAudienceArchiveSnoozeRecap>;

const originalDigest = emailService.sendAudienceArchiveExpiryDigest.bind(emailService);
const originalSummary = emailService.sendAudienceArchiveCleanupSummary.bind(emailService);
const originalRecap = emailService.sendAudienceArchiveSnoozeRecap.bind(emailService);

let digestCalls: { recipients: DigestArgs[0]; payload: DigestArgs[1] }[] = [];
let summaryCalls: { recipients: SummaryArgs[0]; payload: SummaryArgs[1] }[] = [];
let recapCalls: { recipients: RecapArgs[0]; payload: RecapArgs[1] }[] = [];
let digestImpl: (r: DigestArgs[0], p: DigestArgs[1]) => Promise<any> =
  async () => ({ id: "mock" });
let summaryImpl: (r: SummaryArgs[0], p: SummaryArgs[1]) => Promise<any> =
  async () => ({ id: "mock" });
let recapImpl: (r: RecapArgs[0], p: RecapArgs[1]) => Promise<any> =
  async () => ({ id: "mock" });

(emailService as any).sendAudienceArchiveExpiryDigest = async (
  recipients: DigestArgs[0],
  payload: DigestArgs[1],
) => {
  digestCalls.push({ recipients, payload });
  return digestImpl(recipients, payload);
};
(emailService as any).sendAudienceArchiveCleanupSummary = async (
  recipients: SummaryArgs[0],
  payload: SummaryArgs[1],
) => {
  summaryCalls.push({ recipients, payload });
  return summaryImpl(recipients, payload);
};
(emailService as any).sendAudienceArchiveSnoozeRecap = async (
  recipients: RecapArgs[0],
  payload: RecapArgs[1],
) => {
  recapCalls.push({ recipients, payload });
  return recapImpl(recipients, payload);
};
process.on("exit", () => {
  (emailService as any).sendAudienceArchiveExpiryDigest = originalDigest;
  (emailService as any).sendAudienceArchiveCleanupSummary = originalSummary;
  (emailService as any).sendAudienceArchiveSnoozeRecap = originalRecap;
});

async function clearConfig() {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY));
}

function buildStats(over: Partial<AudienceArchiveStats["nextExpiryBatch"]> = {}): AudienceArchiveStats {
  return {
    policy: { retentionDays: 365, autoDeleteEnabled: true },
    defaultRetentionDays: 365,
    defaultAutoDeleteEnabled: true,
    totalFiles: 100,
    totalBytes: 1_000_000,
    oldestFileAgeDays: 360,
    expiredFileCount: 0,
    expiredBytes: 0,
    nextExpiryBatch: {
      withinDays: 7,
      fileCount: 5,
      totalBytes: 50_000,
      earliestExpiryIso: new Date("2026-06-01T00:00:00Z").toISOString(),
      ...over,
    },
    lastCleanup: null,
    cleanupRunCount: 0,
  };
}

function buildCleanup(over: Partial<AudienceArchiveCleanupResult> = {}): AudienceArchiveCleanupResult {
  return {
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    retentionDays: 365,
    cutoffIso: new Date().toISOString(),
    autoDeleteEnabled: true,
    dryRun: false,
    trigger: "scheduled",
    candidateFiles: 50,
    deletedFiles: 50,
    bytesDeleted: 500_000_000,
    deletions: [],
    errors: [],
    skippedReason: null,
    ...over,
  };
}

beforeEach(async () => {
  digestCalls = [];
  summaryCalls = [];
  recapCalls = [];
  digestImpl = async () => ({ id: "mock" });
  summaryImpl = async () => ({ id: "mock" });
  recapImpl = async () => ({ id: "mock" });
  resetAudienceArchiveDeletionNotifierHistoryForTests();
  await clearAudienceArchiveDeletionSnoozeLogForTests();
  await clearConfig();
});

afterEach(() => {
  digestImpl = async () => ({ id: "mock" });
  summaryImpl = async () => ({ id: "mock" });
  recapImpl = async () => ({ id: "mock" });
});

/**
 * Persist a stale snooze (expired) directly into systemSettings,
 * bypassing the future-only validator in setSnooze. Used by the
 * Task #561 natural-expiry tests.
 */
async function persistExpiredSnoozeWithCounters(over: {
  snoozeStartedAt?: string;
  snoozeUntil?: string;
  snoozeSuppressedCount?: number;
  snoozeSuppressedFiles?: number;
  snoozeSuppressedBytes?: number;
  lastSnoozeRecapAt?: string | null;
} = {}) {
  const current = await getAudienceArchiveDeletionNotifierConfig();
  const stale = {
    ...current,
    snoozeStartedAt:
      over.snoozeStartedAt ?? new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    snoozeUntil: over.snoozeUntil ?? new Date(Date.now() - 60 * 1000).toISOString(),
    snoozeSuppressedCount: over.snoozeSuppressedCount ?? 4,
    snoozeSuppressedFiles: over.snoozeSuppressedFiles ?? 12,
    snoozeSuppressedBytes: over.snoozeSuppressedBytes ?? 5_000_000,
    lastSnoozeRecapAt: over.lastSnoozeRecapAt ?? null,
  };
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY,
      value: JSON.stringify(stale),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: JSON.stringify(stale) },
    });
  return stale;
}

test("default config is disabled with no recipients", async () => {
  const cfg = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(cfg.enabled, false);
  assert.deepEqual(cfg.recipients, []);
  assert.equal(cfg.warningLeadDays, 7);
  assert.equal(cfg.digestIntervalHours, 24);
  assert.equal(cfg.postCleanupFileThreshold, 10);
});

test("setConfig normalizes recipients and rejects enable without any", async () => {
  await assert.rejects(
    setAudienceArchiveDeletionNotifierConfig({
      enabled: true,
      recipients: [],
      updatedBy: "tester",
    }),
    /recipient/,
  );
  const cfg = await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["  Founder@Mougle.com ", "founder@mougle.com", "not an email"],
    warningLeadDays: 14,
    postCleanupFileThreshold: 5,
    postCleanupBytesThreshold: 1024 * 1024,
    digestIntervalHours: 12,
    updatedBy: "tester",
  });
  assert.deepEqual(cfg.recipients, ["founder@mougle.com"]);
  assert.equal(cfg.warningLeadDays, 14);
  assert.equal(cfg.postCleanupFileThreshold, 5);
  assert.equal(cfg.postCleanupBytesThreshold, 1024 * 1024);
  assert.equal(cfg.digestIntervalHours, 12);
  assert.equal(cfg.updatedBy, "tester");
});

test("digest does nothing when disabled", async () => {
  const r = await runUpcomingExpiryDigest({ statsLoader: async () => buildStats() });
  assert.equal(r.notified, false);
  assert.equal(r.reason, "disabled");
  assert.equal(digestCalls.length, 0);
});

test("digest skips when recipients empty", async () => {
  // Manually persist enabled=true with empty recipients (bypassing
  // validator) to confirm runtime guard fires too.
  await db.insert(systemSettings).values({
    key: AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY,
    value: JSON.stringify({ enabled: true, recipients: [] }),
  });
  const r = await runUpcomingExpiryDigest({ statsLoader: async () => buildStats() });
  assert.equal(r.notified, false);
  assert.equal(r.reason, "no_recipients");
  assert.equal(digestCalls.length, 0);
});

test("digest skips when no files are scheduled for deletion", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  const r = await runUpcomingExpiryDigest({
    statsLoader: async () =>
      buildStats({ fileCount: 0, totalBytes: 0, earliestExpiryIso: null }),
  });
  assert.equal(r.notified, false);
  assert.equal(r.reason, "no_pending_deletions");
  assert.equal(digestCalls.length, 0);
});

test("digest sends and persists lastDigestAt + signature", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  const r = await runUpcomingExpiryDigest({ statsLoader: async () => buildStats() });
  assert.equal(r.notified, true);
  assert.equal(r.reason, "sent");
  assert.equal(digestCalls.length, 1);
  assert.deepEqual(digestCalls[0].recipients, ["founder@mougle.com"]);
  assert.equal(digestCalls[0].payload.fileCount, 5);
  assert.equal(digestCalls[0].payload.warningLeadDays, 7);
  const cfg = await getAudienceArchiveDeletionNotifierConfig();
  assert.ok(cfg.lastDigestAt);
  assert.ok(cfg.lastDigestSignature);
});

test("digest deduplicates within window when batch signature unchanged", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    digestIntervalHours: 24,
  });
  await runUpcomingExpiryDigest({ statsLoader: async () => buildStats() });
  assert.equal(digestCalls.length, 1);
  const r2 = await runUpcomingExpiryDigest({ statsLoader: async () => buildStats() });
  assert.equal(r2.notified, false);
  assert.equal(r2.reason, "deduplicated");
  assert.equal(digestCalls.length, 1);
});

test("digest re-sends when batch signature changes (more files pending)", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await runUpcomingExpiryDigest({ statsLoader: async () => buildStats({ fileCount: 5 }) });
  const r = await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 25 }),
  });
  assert.equal(r.notified, true);
  assert.equal(r.reason, "sent");
  assert.equal(digestCalls.length, 2);
});

test("digest re-sends after the dedup window elapses", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    digestIntervalHours: 1,
  });
  const t0 = new Date("2026-05-21T00:00:00Z");
  await runUpcomingExpiryDigest({ now: t0, statsLoader: async () => buildStats() });
  const t1 = new Date(t0.getTime() + 2 * 60 * 60 * 1000);
  const r = await runUpcomingExpiryDigest({ now: t1, statsLoader: async () => buildStats() });
  assert.equal(r.notified, true);
  assert.equal(digestCalls.length, 2);
});

test("digest send failure is caught, not thrown, and recorded", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  digestImpl = async () => {
    throw new Error("resend_down");
  };
  const r = await runUpcomingExpiryDigest({ statsLoader: async () => buildStats() });
  assert.equal(r.notified, false);
  assert.equal(r.reason, "send_failed");
  // Failed send must NOT advance lastDigestAt so retry isn't swallowed.
  const cfg = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(cfg.lastDigestAt, null);
  const hist = getAudienceArchiveDeletionNotifierHistory(5);
  assert.ok(hist.some((h) => h.errorMessage?.includes("resend_down")));
});

test("post-cleanup notifier fires when file threshold crossed", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    postCleanupFileThreshold: 10,
    postCleanupBytesThreshold: 100 * 1024 * 1024 * 1024,
  });
  const r = await notifyPostCleanup(buildCleanup({ deletedFiles: 50, bytesDeleted: 1000 }));
  assert.equal(r.notified, true);
  assert.equal(r.reason, "sent");
  assert.equal(summaryCalls.length, 1);
  assert.equal(summaryCalls[0].payload.thresholdHit, "files");
});

test("post-cleanup notifier fires when bytes threshold crossed", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    postCleanupFileThreshold: 1_000_000,
    postCleanupBytesThreshold: 1024,
  });
  const r = await notifyPostCleanup(
    buildCleanup({ deletedFiles: 1, bytesDeleted: 1024 * 1024 }),
  );
  assert.equal(r.notified, true);
  assert.equal(summaryCalls.length, 1);
  assert.equal(summaryCalls[0].payload.thresholdHit, "bytes");
});

test("post-cleanup notifier stays quiet for dry runs, skipped cleanups, and below-threshold runs", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    postCleanupFileThreshold: 100,
    postCleanupBytesThreshold: 1024 * 1024 * 1024,
  });
  const a = await notifyPostCleanup(buildCleanup({ dryRun: true, deletedFiles: 500 }));
  const b = await notifyPostCleanup(
    buildCleanup({ skippedReason: "auto_delete_disabled", deletedFiles: 0 }),
  );
  const c = await notifyPostCleanup(buildCleanup({ deletedFiles: 5, bytesDeleted: 100 }));
  assert.equal(a.notified, false);
  assert.equal(b.notified, false);
  assert.equal(c.notified, false);
  assert.equal(c.reason, "below_threshold");
  assert.equal(summaryCalls.length, 0);
});

test("post-cleanup notifier is no-op when disabled", async () => {
  const r = await notifyPostCleanup(buildCleanup({ deletedFiles: 9999 }));
  assert.equal(r.notified, false);
  assert.equal(r.reason, "disabled");
  assert.equal(summaryCalls.length, 0);
});

test("post-cleanup send failure is recorded but does not throw", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    postCleanupFileThreshold: 1,
  });
  summaryImpl = async () => {
    throw new Error("resend_down");
  };
  const r = await notifyPostCleanup(buildCleanup({ deletedFiles: 5 }));
  assert.equal(r.notified, false);
  assert.equal(r.reason, "send_failed");
  const hist = getAudienceArchiveDeletionNotifierHistory(5);
  assert.ok(hist.some((h) => h.kind === "post_cleanup" && h.errorMessage?.includes("resend_down")));
});

test("snooze rejects invalid + past timestamps, accepts ISO future, can be cleared", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await assert.rejects(
    setAudienceArchiveDeletionNotifierSnooze({ snoozeUntil: "not-a-date" }),
    /invalid/,
  );
  await assert.rejects(
    setAudienceArchiveDeletionNotifierSnooze({
      snoozeUntil: new Date(Date.now() - 1000).toISOString(),
    }),
    /future/,
  );
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const c1 = await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: future,
    updatedBy: "tester",
  });
  assert.ok(c1.snoozeUntil);
  assert.equal(c1.recipients.length, 1, "snooze must not lose recipients");
  assert.equal(c1.enabled, true, "snooze must not flip enabled");
  const c2 = await setAudienceArchiveDeletionNotifierSnooze({ snoozeUntil: null });
  assert.equal(c2.snoozeUntil, null);
});

test("digest returns 'snoozed' (no send) while snoozeUntil is in the future", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  const r = await runUpcomingExpiryDigest({ statsLoader: async () => buildStats() });
  assert.equal(r.notified, false);
  assert.equal(r.reason, "snoozed");
  assert.equal(digestCalls.length, 0);
  // History entry must record the snooze so the founder can prove the
  // email would have fired.
  const hist = getAudienceArchiveDeletionNotifierHistory(5);
  assert.ok(hist.some((h) => h.kind === "digest" && h.reason === "snoozed"));
  // Dedup state must NOT be advanced — once unsnoozed the next sweep
  // should fire the digest normally.
  const cfg = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(cfg.lastDigestAt, null);
});

test("digest resumes sending once snoozeUntil is in the past", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  // Bypass the validator (which rejects past timestamps) by writing the
  // config row directly — simulates a snooze whose window has elapsed.
  const current = await getAudienceArchiveDeletionNotifierConfig();
  await db.insert(systemSettings).values({
    key: AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY,
    value: JSON.stringify({ ...current, snoozeUntil: past }),
  }).onConflictDoUpdate({
    target: systemSettings.key,
    set: { value: JSON.stringify({ ...current, snoozeUntil: past }) },
  });
  const r = await runUpcomingExpiryDigest({ statsLoader: async () => buildStats() });
  assert.equal(r.notified, true);
  assert.equal(r.reason, "sent");
  assert.equal(digestCalls.length, 1);
});

test("post-cleanup returns 'snoozed' (no send) while snoozed", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    postCleanupFileThreshold: 1,
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  const r = await notifyPostCleanup(buildCleanup({ deletedFiles: 9999 }));
  assert.equal(r.notified, false);
  assert.equal(r.reason, "snoozed");
  assert.equal(summaryCalls.length, 0);
  const hist = getAudienceArchiveDeletionNotifierHistory(5);
  assert.ok(hist.some((h) => h.kind === "post_cleanup" && h.reason === "snoozed"));
});

test("snooze is capped at 90 days even if a far-future timestamp is requested", async () => {
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const c = await setAudienceArchiveDeletionNotifierSnooze({ snoozeUntil: farFuture });
  assert.ok(c.snoozeUntil);
  const dt = Date.parse(c.snoozeUntil);
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  assert.ok(
    dt - Date.now() <= ninetyDaysMs + 5_000,
    `snooze should be capped at 90 days, got ${(dt - Date.now()) / (24 * 60 * 60 * 1000)} days`,
  );
});

test("Task #517: snooze counters start at 0 and digest snooze bumps them with the would-be file/byte count", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  const c0 = await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    updatedBy: "tester",
  });
  assert.equal(c0.snoozeSuppressedCount, 0);
  assert.equal(c0.snoozeSuppressedFiles, 0);
  assert.equal(c0.snoozeSuppressedBytes, 0);
  assert.ok(c0.snoozeStartedAt, "snoozeStartedAt should be set");

  // Two snoozed digest ticks with file/byte info → counters bump.
  await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 5, totalBytes: 50_000 }),
  });
  await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 7, totalBytes: 70_000 }),
  });
  const c1 = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(c1.snoozeSuppressedCount, 2);
  assert.equal(c1.snoozeSuppressedFiles, 12);
  assert.equal(c1.snoozeSuppressedBytes, 120_000);

  // A snoozed digest tick with fileCount=0 (nothing would have
  // emailed anyway) must NOT bump the counters.
  await runUpcomingExpiryDigest({
    statsLoader: async () =>
      buildStats({ fileCount: 0, totalBytes: 0, earliestExpiryIso: null }),
  });
  const c2 = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(c2.snoozeSuppressedCount, 2);
  assert.equal(c2.snoozeSuppressedFiles, 12);
  assert.equal(c2.snoozeSuppressedBytes, 120_000);
});

test("Task #517: post-cleanup snooze bumps counters only when cleanup would have emailed", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    postCleanupFileThreshold: 10,
    postCleanupBytesThreshold: 100 * 1024 * 1024 * 1024,
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  // Would have emailed (over file threshold): bumps.
  await notifyPostCleanup(buildCleanup({ deletedFiles: 50, bytesDeleted: 1024 }));
  // Below threshold: does NOT bump.
  await notifyPostCleanup(buildCleanup({ deletedFiles: 3, bytesDeleted: 100 }));
  // Dry run: does NOT bump even though deletedFiles is large.
  await notifyPostCleanup(
    buildCleanup({ dryRun: true, deletedFiles: 500, bytesDeleted: 999 }),
  );
  // Skipped: does NOT bump.
  await notifyPostCleanup(
    buildCleanup({ skippedReason: "auto_delete_disabled", deletedFiles: 0 }),
  );
  const c = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(c.snoozeSuppressedCount, 1);
  assert.equal(c.snoozeSuppressedFiles, 50);
  assert.equal(c.snoozeSuppressedBytes, 1024);
});

test("auto_extend policy re-extends snoozeUntil after the window elapses (Task #516)", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  // Install auto_extend policy with an explicit initial snoozeUntil.
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 1000).toISOString(),
    snoozePolicy: { kind: "auto_extend", extendDays: 2 },
    updatedBy: "founder",
  });
  // Force the stored snoozeUntil into the past to simulate an expired
  // window (bypassing the future-only validator).
  const cur = await getAudienceArchiveDeletionNotifierConfig();
  const expired = new Date(Date.now() - 60 * 1000).toISOString();
  await db.insert(systemSettings).values({
    key: AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY,
    value: JSON.stringify({ ...cur, snoozeUntil: expired }),
  }).onConflictDoUpdate({
    target: systemSettings.key,
    set: { value: JSON.stringify({ ...cur, snoozeUntil: expired }) },
  });

  const r = await runUpcomingExpiryDigest({ statsLoader: async () => buildStats() });
  assert.equal(r.notified, false);
  assert.equal(r.reason, "snoozed", "auto_extend should re-snooze, not let send through");
  assert.equal(digestCalls.length, 0);

  // The auto-extended snoozeUntil must now be ~2 days in the future and
  // the source must be marked "auto" so the founder can distinguish it.
  const updated = await getAudienceArchiveDeletionNotifierConfig();
  assert.ok(updated.snoozeUntil);
  const dt = Date.parse(updated.snoozeUntil!);
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  assert.ok(
    Math.abs(dt - Date.now() - twoDays) < 5_000,
    `expected snoozeUntil ~2d from now, got ${(dt - Date.now()) / 86400000}d`,
  );
  assert.equal(updated.lastSnoozeSource, "auto");

  // History entry must surface snoozeSource so the UI can tag it.
  const hist = getAudienceArchiveDeletionNotifierHistory(5);
  const snoozed = hist.find((h) => h.kind === "digest" && h.reason === "snoozed");
  assert.ok(snoozed);
  assert.equal(snoozed!.snoozeSource, "auto");
});

test("weekday_mute policy suppresses sends inside the window (Task #516)", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  // Mon–Fri 18:00 → next-day 08:00 UTC.
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: null,
    snoozePolicy: {
      kind: "weekday_mute",
      days: [1, 2, 3, 4, 5],
      startHour: 18,
      endHour: 8,
    },
  });
  // Tuesday 2026-05-19 at 20:00 UTC → inside the window.
  const inWindow = new Date(Date.UTC(2026, 4, 19, 20, 0, 0));
  const r1 = await runUpcomingExpiryDigest({
    now: inWindow,
    statsLoader: async () => buildStats(),
  });
  assert.equal(r1.notified, false);
  assert.equal(r1.reason, "snoozed");
  assert.equal(digestCalls.length, 0);
  const hist1 = getAudienceArchiveDeletionNotifierHistory(5);
  const snoozed = hist1.find((h) => h.reason === "snoozed");
  assert.ok(snoozed);
  assert.equal(snoozed!.snoozeSource, "weekday_window");
});

test("weekday_mute policy allows sends outside the window (Task #516)", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: null,
    snoozePolicy: {
      kind: "weekday_mute",
      days: [1, 2, 3, 4, 5],
      startHour: 18,
      endHour: 8,
    },
  });
  // Tuesday 2026-05-19 at 12:00 UTC → outside the 18→8 mute window.
  const outsideWindow = new Date(Date.UTC(2026, 4, 19, 12, 0, 0));
  const r = await runUpcomingExpiryDigest({
    now: outsideWindow,
    statsLoader: async () => buildStats(),
  });
  assert.equal(r.notified, true, "outside the weekday mute window, sends should resume");
  assert.equal(r.reason, "sent");
  assert.equal(digestCalls.length, 1);
});

test("manual fixed snooze records snoozeSource='manual' on history (Task #516)", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await runUpcomingExpiryDigest({ statsLoader: async () => buildStats() });
  const hist = getAudienceArchiveDeletionNotifierHistory(5);
  const snoozed = hist.find((h) => h.reason === "snoozed");
  assert.ok(snoozed);
  assert.equal(snoozed!.snoozeSource, "manual");
});

test("auto_extend manual snooze bypasses the 90-day cap (Task #516)", async () => {
  // Manual fixed snoozes are capped at 90 days. auto_extend is the
  // documented way to mute indefinitely so it must NOT be capped.
  const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const c = await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: oneYear,
    snoozePolicy: { kind: "auto_extend", extendDays: 1 },
  });
  assert.ok(c.snoozeUntil);
  const diffDays = (Date.parse(c.snoozeUntil!) - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(diffDays > 360, `auto_extend should not cap, got ${diffDays}d`);
  assert.equal(c.snoozePolicy.kind, "auto_extend");
  assert.equal(c.lastSnoozeSource, "manual");
});

test("Task #517: snooze counters reset whenever the snooze is set, replaced, or cleared", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 5, totalBytes: 50_000 }),
  });
  const c1 = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(c1.snoozeSuppressedCount, 1);

  // Replacing the snooze with a new window resets counters.
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  const c2 = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(c2.snoozeSuppressedCount, 0);
  assert.equal(c2.snoozeSuppressedFiles, 0);
  assert.equal(c2.snoozeSuppressedBytes, 0);

  // Bump again, then clear → resets.
  await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 9, totalBytes: 9_000 }),
  });
  const c3 = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(c3.snoozeSuppressedCount, 1);
  await setAudienceArchiveDeletionNotifierSnooze({ snoozeUntil: null });
  const c4 = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(c4.snoozeSuppressedCount, 0);
  assert.equal(c4.snoozeStartedAt, null);
});

test("Task #517: snooze counters surface as 0 once the snooze window expires naturally", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  // Persist a stale snooze (expired) with non-zero counters directly,
  // simulating a window that elapsed without an explicit unsnooze.
  const current = await getAudienceArchiveDeletionNotifierConfig();
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  const stale = {
    ...current,
    snoozeUntil: past,
    snoozeStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    snoozeSuppressedCount: 7,
    snoozeSuppressedFiles: 42,
    snoozeSuppressedBytes: 4242,
  };
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY,
      value: JSON.stringify(stale),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: JSON.stringify(stale) },
    });
  const c = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(c.snoozeSuppressedCount, 0);
  assert.equal(c.snoozeSuppressedFiles, 0);
  assert.equal(c.snoozeSuppressedBytes, 0);
});

/* ---------------------------------------------------------------- */
/* Task #561 — snooze recap email                                    */
/* ---------------------------------------------------------------- */

test("Task #561: runSnoozeRecapIfDue emails the founder when a snooze expires with non-zero counters", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await persistExpiredSnoozeWithCounters({
    snoozeSuppressedCount: 4,
    snoozeSuppressedFiles: 12,
    snoozeSuppressedBytes: 5_000_000,
  });
  const r = await runSnoozeRecapIfDue();
  assert.equal(r.recapSent, true);
  assert.equal(r.reason, "sent");
  assert.equal(r.trigger, "natural_expiry");
  assert.equal(recapCalls.length, 1);
  assert.deepEqual(recapCalls[0].recipients, ["founder@mougle.com"]);
  assert.equal(recapCalls[0].payload.suppressedCount, 4);
  assert.equal(recapCalls[0].payload.suppressedFiles, 12);
  assert.equal(recapCalls[0].payload.suppressedBytes, 5_000_000);
  assert.equal(recapCalls[0].payload.trigger, "natural_expiry");

  // After recap, the window is cleared and dedup pointer advanced so a
  // second tick is a no-op.
  const after = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(after.snoozeUntil, null);
  assert.equal(after.snoozeStartedAt, null);
  assert.ok(after.lastSnoozeRecapAt, "lastSnoozeRecapAt must advance after recap");
  const r2 = await runSnoozeRecapIfDue();
  assert.equal(r2.recapSent, false);
  assert.equal(recapCalls.length, 1, "second tick must not re-send the recap");

  const hist = getAudienceArchiveDeletionNotifierHistory(10);
  assert.ok(hist.some((h) => h.kind === "snooze_recap" && h.reason === "sent"));
});

test("Task #561: runSnoozeRecapIfDue sends no email when counters are all zero", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await persistExpiredSnoozeWithCounters({
    snoozeSuppressedCount: 0,
    snoozeSuppressedFiles: 0,
    snoozeSuppressedBytes: 0,
  });
  const r = await runSnoozeRecapIfDue();
  assert.equal(r.recapSent, false);
  assert.equal(r.reason, "no_counters");
  assert.equal(recapCalls.length, 0);
  // Still advances the dedup pointer / clears the elapsed window so
  // we don't keep scanning it.
  const after = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(after.snoozeStartedAt, null);
});

test("Task #561: runSnoozeRecapIfDue skips while still snoozed", async () => {
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    updatedBy: "founder",
  });
  const rows = await listAudienceArchiveDeletionSnoozeLog(10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endedAt, null);
  assert.equal(rows[0].endedReason, null);
  assert.equal(rows[0].source, "manual");
  assert.equal(rows[0].policyKind, "fixed");
  assert.equal(rows[0].createdBy, "founder");
  assert.equal(rows[0].suppressedCount, 0);
});

test("Task #562: replacing the snooze closes the open row with reason=replaced and snapshots counters", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  // Bump counters via a snoozed digest tick.
  await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 5, totalBytes: 50_000 }),
  });
  const r = await runSnoozeRecapIfDue();
  assert.equal(r.recapSent, false);
  assert.equal(r.reason, "still_snoozed");
  assert.equal(recapCalls.length, 0);
});

test("Task #561: explicit unsnooze fires the recap and survives a follow-up tick (dedup)", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  // Open a first snooze window so the replacement has something to close.
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  // Bump counters via the digest path (digest is now snoozed).
  await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 5, totalBytes: 50_000 }),
  });
  // Replace with a new window.
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  const rows = await listAudienceArchiveDeletionSnoozeLog(10);
  assert.equal(rows.length, 2);
  // Newest first.
  const closed = rows.find((r) => r.endedReason === "replaced");
  assert.ok(closed, "expected a replaced row");
  assert.ok(closed!.endedAt);
  assert.equal(closed!.suppressedCount, 1);
  assert.equal(closed!.suppressedFiles, 5);
  assert.equal(closed!.suppressedBytes, 50_000);
  const open = rows.find((r) => r.endedReason === null);
  assert.ok(open, "expected the new open row");
  assert.equal(open!.suppressedCount, 0);
});

test("Task #562: unsnoozing closes the open row with reason=unsnoozed", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 7, totalBytes: 70_000 }),
  });

  // Founder clicks "Unsnooze" → recap must fire with trigger=manual_unsnooze.
  const cleared = await setAudienceArchiveDeletionNotifierSnooze({ snoozeUntil: null });
  assert.equal(cleared.snoozeUntil, null);
  assert.equal(cleared.snoozeStartedAt, null);
  assert.equal(recapCalls.length, 1);
  assert.equal(recapCalls[0].payload.trigger, "manual_unsnooze");
  assert.equal(recapCalls[0].payload.suppressedCount, 1);
  assert.equal(recapCalls[0].payload.suppressedFiles, 7);
  assert.equal(recapCalls[0].payload.suppressedBytes, 70_000);
  assert.ok(cleared.lastSnoozeRecapAt, "lastSnoozeRecapAt must be set after unsnooze recap");

  // Sweeper tick afterwards must not double-send.
  const r = await runSnoozeRecapIfDue();
  assert.equal(r.recapSent, false);
  assert.equal(recapCalls.length, 1);
});

test("Task #561: send failure leaves dedup state intact so the next tick retries", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  // Open a snooze so the subsequent unsnooze has a row to close.
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await setAudienceArchiveDeletionNotifierSnooze({ snoozeUntil: null });
  const rows = await listAudienceArchiveDeletionSnoozeLog(10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endedReason, "unsnoozed");
  assert.ok(rows[0].endedAt);
});

test("Task #562: natural expiry detected by evaluateAndMaybeAutoExtendSnooze closes the row with reason=expired", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await persistExpiredSnoozeWithCounters({ snoozeSuppressedCount: 2 });
  recapImpl = async () => {
    throw new Error("resend_down");
  };
  const r1 = await runSnoozeRecapIfDue();
  assert.equal(r1.recapSent, false);
  assert.equal(r1.reason, "send_failed");
  const hist = getAudienceArchiveDeletionNotifierHistory(5);
  assert.ok(
    hist.some(
      (h) =>
        h.kind === "snooze_recap" &&
        h.reason === "send_failed" &&
        h.errorMessage?.includes("resend_down"),
    ),
  );
  // Dedup pointer must NOT advance on failure.
  const after1 = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(after1.lastSnoozeRecapAt, null);

  // Retry succeeds.
  recapImpl = async () => ({ id: "mock" });
  const r2 = await runSnoozeRecapIfDue();
  assert.equal(r2.recapSent, true);
  assert.equal(recapCalls.length, 2);
});

test("Task #561: disabled notifier never emails a recap even when counters exist", async () => {
  // Persist enabled=false with non-zero counters and an elapsed snooze.
  // Open a snooze row.
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  // Bump counters.
  await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 3, totalBytes: 3_000 }),
  });
  // Now manually rewrite the persisted config so snoozeUntil is in the
  // past while counters are preserved (mirrors the existing #517 test).
  const current = await getAudienceArchiveDeletionNotifierConfig();
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  const stale = {
    ...current,
    snoozeUntil: past,
    snoozeSuppressedCount: 3,
    snoozeSuppressedFiles: 9,
    snoozeSuppressedBytes: 999,
  };
  const staleForDisabled = { ...stale, enabled: false };
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY,
      value: JSON.stringify(staleForDisabled),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: JSON.stringify(staleForDisabled) },
    });
  const r = await runSnoozeRecapIfDue();
  assert.equal(r.recapSent, false);
  assert.equal(r.reason, "disabled");
  assert.equal(recapCalls.length, 0);
  await evaluateAndMaybeAutoExtendSnooze(staleForDisabled as any, new Date());
  const rows = await listAudienceArchiveDeletionSnoozeLog(10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endedReason, "expired");
  assert.equal(rows[0].suppressedCount, 3);
  assert.equal(rows[0].suppressedFiles, 9);
  assert.equal(rows[0].suppressedBytes, 999);
});

test("Task #562: list returns newest-first, capped by limit", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  for (let i = 0; i < 3; i += 1) {
    await setAudienceArchiveDeletionNotifierSnooze({
      snoozeUntil: new Date(Date.now() + (i + 1) * 60 * 60 * 1000).toISOString(),
    });
    // Small delay so startedAt timestamps differ.
    await new Promise((r) => setTimeout(r, 5));
  }
  const all = await listAudienceArchiveDeletionSnoozeLog(50);
  assert.equal(all.length, 3);
  for (let i = 0; i + 1 < all.length; i += 1) {
    assert.ok(
      Date.parse(all[i].startedAt) >= Date.parse(all[i + 1].startedAt),
      "expected newest-first ordering",
    );
  }
  const limited = await listAudienceArchiveDeletionSnoozeLog(2);
  assert.equal(limited.length, 2);
});

test("Task #562: prune only deletes closed rows older than cutoff", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  // Closed row #1 (replaced).
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  // Open row #2 is now live. Pruning with a cutoff in the future
  // must NOT remove the open row.
  const beforeOpenCount = (
    await listAudienceArchiveDeletionSnoozeLog(50)
  ).filter((r) => r.endedAt === null).length;
  assert.equal(beforeOpenCount, 1);

  // Cutoff in the past → nothing eligible.
  const noop = await pruneAudienceArchiveDeletionSnoozeLogOlderThan(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
  );
  assert.equal(noop, 0);

  // Cutoff in the far future → closed row pruned, open row preserved.
  const pruned = await pruneAudienceArchiveDeletionSnoozeLogOlderThan(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  );
  assert.equal(pruned, 1);
  const remaining = await listAudienceArchiveDeletionSnoozeLog(50);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].endedAt, null);
});

/* ---------------------------------------------------------------- */
/* Task #564 — recurring snooze policies across time zones           */
/* ---------------------------------------------------------------- */

test("Task #564: weekday_mute policy without timeZone evaluates the window in UTC (back-compat)", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  // Mon-only 09:00–10:00, no timeZone field → must default to UTC,
  // matching every policy persisted before Task #564 was deployed.
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: null,
    snoozePolicy: {
      kind: "weekday_mute",
      days: [1],
      startHour: 9,
      endHour: 10,
    },
  });
  // Mon 2026-05-18 09:30 UTC — inside in UTC, but it would NOT be 09:30
  // in any zone west of UTC, which is exactly the bug Task #564
  // documents (founders in Pacific time get muted at the wrong wall
  // clock). We pin the UTC behavior so the bug stays observable.
  const utcInside = new Date(Date.UTC(2026, 4, 18, 9, 30, 0));
  const r1 = await runUpcomingExpiryDigest({
    now: utcInside,
    statsLoader: async () => buildStats(),
  });
  assert.equal(r1.notified, false, "09:30 UTC on Mon should be muted in UTC");
  assert.equal(r1.reason, "snoozed");

  // 09:30 Pacific on the same Monday = 16:30 UTC. With a UTC-default
  // policy this is OUTSIDE the 09–10 window, so the founder gets
  // emailed even though their wall clock says 09:30. Task #564 fixes
  // this by letting them set timeZone explicitly (covered below).
  const pacificMorningInUtc = new Date(Date.UTC(2026, 4, 18, 16, 30, 0));
  const r2 = await runUpcomingExpiryDigest({
    now: pacificMorningInUtc,
    statsLoader: async () => buildStats(),
  });
  assert.equal(
    r2.notified,
    true,
    "09:30 Pacific (16:30 UTC) is outside a UTC-evaluated 09–10 window",
  );
  assert.equal(r2.reason, "sent");
});

test("Task #564: weekday_mute policy with timeZone='America/Los_Angeles' evaluates the window in founder-local time", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  const cfg = await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: null,
    snoozePolicy: {
      kind: "weekday_mute",
      days: [1],
      startHour: 9,
      endHour: 10,
      timeZone: "America/Los_Angeles",
    },
  });
  // Round-trip: the IANA timeZone must persist in the saved policy.
  assert.equal(cfg.snoozePolicy.kind, "weekday_mute");
  assert.equal(
    (cfg.snoozePolicy as { timeZone?: string }).timeZone,
    "America/Los_Angeles",
  );

  // Mon 2026-05-18 09:30 PDT = 16:30 UTC. Inside the founder-local
  // window → must be muted.
  const localInside = new Date(Date.UTC(2026, 4, 18, 16, 30, 0));
  const r1 = await runUpcomingExpiryDigest({
    now: localInside,
    statsLoader: async () => buildStats(),
  });
  assert.equal(r1.notified, false, "09:30 Pacific should be muted in Pacific zone");
  assert.equal(r1.reason, "snoozed");
  const hist = getAudienceArchiveDeletionNotifierHistory(5);
  const snoozed = hist.find((h) => h.reason === "snoozed");
  assert.ok(snoozed);
  assert.equal(snoozed!.snoozeSource, "weekday_window");

  // Mon 2026-05-18 09:30 UTC = 02:30 PDT. Outside the founder-local
  // 09–10 window → must NOT be muted, proving the check is no longer
  // anchored to UTC.
  const utcMorning = new Date(Date.UTC(2026, 4, 18, 9, 30, 0));
  digestCalls = [];
  const r2 = await runUpcomingExpiryDigest({
    now: utcMorning,
    statsLoader: async () => buildStats(),
  });
  assert.equal(
    r2.notified,
    true,
    "09:30 UTC = 02:30 Pacific, outside the Pacific 09–10 window",
  );
  assert.equal(r2.reason, "sent");
});

test("Task #564: weekday_mute timeZone correctly handles a Pacific window that crosses midnight + weekday rollover", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  // Pacific founder: Mon-Fri 22:00 → next-day 06:00 local. A founder
  // in PDT who finishes work at 22:00 wants alerts paused until 06:00
  // the next morning local — and the weekday roster is anchored to
  // *their* calendar, not UTC's.
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: null,
    snoozePolicy: {
      kind: "weekday_mute",
      days: [1, 2, 3, 4, 5],
      startHour: 22,
      endHour: 6,
      timeZone: "America/Los_Angeles",
    },
  });

  // Fri 2026-05-22 23:00 PDT = Sat 2026-05-23 06:00 UTC. In Pacific
  // it's still Friday (a configured day) and hour=23 ≥ 22 → muted.
  // In UTC it's already Saturday 06:00 (NOT a configured day) so a
  // UTC-anchored check would WRONGLY allow the send.
  const fridayLatePacific = new Date(Date.UTC(2026, 4, 23, 6, 0, 0));
  const r1 = await runUpcomingExpiryDigest({
    now: fridayLatePacific,
    statsLoader: async () => buildStats(),
  });
  assert.equal(
    r1.notified,
    false,
    "Fri 23:00 Pacific is inside the Mon-Fri 22→06 founder-local window",
  );
  assert.equal(r1.reason, "snoozed");

  // Sat 2026-05-23 03:00 PDT = Sat 2026-05-23 10:00 UTC. In Pacific
  // it's Saturday early morning — still inside the Fri-night window
  // that runs through 06:00 Sat (previous-day rollover).
  digestCalls = [];
  const satEarlyPacific = new Date(Date.UTC(2026, 4, 23, 10, 0, 0));
  const r2 = await runUpcomingExpiryDigest({
    now: satEarlyPacific,
    statsLoader: async () => buildStats(),
  });
  assert.equal(
    r2.notified,
    false,
    "Sat 03:00 Pacific should still be muted by Fri-night's 22→06 window",
  );
  assert.equal(r2.reason, "snoozed");

  // Sat 2026-05-23 07:00 PDT = Sat 2026-05-23 14:00 UTC. Past the
  // 06:00 end-of-window and Saturday isn't a configured day → send.
  digestCalls = [];
  const satMidMorningPacific = new Date(Date.UTC(2026, 4, 23, 14, 0, 0));
  const r3 = await runUpcomingExpiryDigest({
    now: satMidMorningPacific,
    statsLoader: async () => buildStats(),
  });
  assert.equal(
    r3.notified,
    true,
    "Sat 07:00 Pacific is outside the Mon-Fri 22→06 window",
  );
  assert.equal(r3.reason, "sent");
});

test("Task #564: weekday_mute policy with an invalid timeZone falls back to UTC", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  const cfg = await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: null,
    snoozePolicy: {
      kind: "weekday_mute",
      days: [1],
      startHour: 9,
      endHour: 10,
      // Not a real IANA zone — must be dropped, NOT cause an error.
      timeZone: "Mars/Olympus_Mons",
    } as any,
  });
  assert.equal(cfg.snoozePolicy.kind, "weekday_mute");
  assert.equal(
    (cfg.snoozePolicy as { timeZone?: string }).timeZone,
    undefined,
    "invalid timeZone must be dropped during persistence",
  );
  // Behaviour now matches the legacy UTC path: 09:30 UTC = muted.
  const utcInside = new Date(Date.UTC(2026, 4, 18, 9, 30, 0));
  const r = await runUpcomingExpiryDigest({
    now: utcInside,
    statsLoader: async () => buildStats(),
  });
  assert.equal(r.notified, false);
  assert.equal(r.reason, "snoozed");
});

test("sendTest throws no_recipients_configured when none set; sends when configured", async () => {
  await assert.rejects(sendTestArchiveDeletionEmail(), /no_recipients_configured/);
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: false,
    recipients: ["founder@mougle.com"],
  });
  const r = await sendTestArchiveDeletionEmail();
  assert.equal(r.ok, true);
  assert.equal(digestCalls.length, 1);
  assert.equal(digestCalls[0].payload.isTest, true);
  assert.equal(r.entry.kind, "test");
});

test("sendTestArchiveExpiryDigestEmail throws no_recipients_configured when none set", async () => {
  await assert.rejects(
    sendTestArchiveExpiryDigestEmail({ statsLoader: async () => buildStats() }),
    /no_recipients_configured/,
  );
  assert.equal(digestCalls.length, 0);
});

test("sendTestArchiveExpiryDigestEmail forwards current nextExpiryBatch with isTest:true", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  const earliest = new Date("2026-07-15T00:00:00Z").toISOString();
  const r = await sendTestArchiveExpiryDigestEmail({
    statsLoader: async () =>
      buildStats({
        withinDays: 14,
        fileCount: 42,
        totalBytes: 9_876_543,
        earliestExpiryIso: earliest,
      }),
    triggeredBy: "tester",
  });
  assert.equal(r.ok, true);
  assert.equal(digestCalls.length, 1);
  assert.deepEqual(digestCalls[0].recipients, ["founder@mougle.com"]);
  const payload = digestCalls[0].payload;
  assert.equal(payload.fileCount, 42);
  assert.equal(payload.totalBytes, 9_876_543);
  assert.equal(payload.earliestExpiryIso, earliest);
  assert.equal(payload.warningLeadDays, 14);
  assert.equal(payload.isTest, true);
  assert.equal(payload.triggeredBy, "tester");
  assert.equal(r.entry.kind, "test");
  assert.equal(r.entry.reason, "sent");
});

test("sendTestArchiveExpiryDigestEmail does NOT mutate lastDigestAt / lastDigestSignature on success", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  const before = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(before.lastDigestAt, null);
  assert.equal(before.lastDigestSignature, null);
  const r = await sendTestArchiveExpiryDigestEmail({
    statsLoader: async () => buildStats({ fileCount: 7 }),
  });
  assert.equal(r.ok, true);
  const after = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(after.lastDigestAt, null, "test digest must not advance lastDigestAt");
  assert.equal(
    after.lastDigestSignature,
    null,
    "test digest must not write lastDigestSignature",
  );
});

test("sendTestArchiveExpiryDigestEmail bypasses snooze and disabled gates", async () => {
  // disabled=false + snoozed far in the future — real digest would skip.
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: false,
    recipients: ["founder@mougle.com"],
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const r = await sendTestArchiveExpiryDigestEmail({
    statsLoader: async () => buildStats(),
  });
  assert.equal(r.ok, true);
  assert.equal(digestCalls.length, 1, "test digest must fire even while disabled+snoozed");
  assert.equal(digestCalls[0].payload.isTest, true);
  // Sanity: a real digest call in the same state would NOT send.
  const realRun = await runUpcomingExpiryDigest({ statsLoader: async () => buildStats() });
  assert.equal(realRun.notified, false);
});

test("sendTestArchiveExpiryDigestEmail records history kind:test on success and failure", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  // Success path.
  const ok = await sendTestArchiveExpiryDigestEmail({
    statsLoader: async () => buildStats({ fileCount: 3 }),
  });
  assert.equal(ok.ok, true);
  let hist = getAudienceArchiveDeletionNotifierHistory(10);
  const okEntry = hist.find((h) => h.id === ok.entry.id);
  assert.ok(okEntry, "success entry must be in history");
  assert.equal(okEntry!.kind, "test");
  assert.equal(okEntry!.reason, "sent");
  assert.equal(okEntry!.notified, true);
  assert.equal(okEntry!.fileCount, 3);
  assert.equal(okEntry!.errorMessage, null);

  // Send failure path — emailService throws.
  digestImpl = async () => {
    throw new Error("resend_down");
  };
  const fail = await sendTestArchiveExpiryDigestEmail({
    statsLoader: async () => buildStats({ fileCount: 9 }),
  });
  assert.equal(fail.ok, false);
  assert.match(fail.errorMessage ?? "", /resend_down/);
  hist = getAudienceArchiveDeletionNotifierHistory(10);
  const failEntry = hist.find((h) => h.id === fail.entry.id);
  assert.ok(failEntry, "failure entry must be in history");
  assert.equal(failEntry!.kind, "test");
  assert.equal(failEntry!.reason, "send_failed");
  assert.equal(failEntry!.notified, false);
  assert.equal(failEntry!.fileCount, 9);
  assert.match(failEntry!.errorMessage ?? "", /resend_down/);
});

test("Task #612: resendLastSnoozeRecap re-emits the recap email using persisted counters", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  // Open a snooze window, bump counters via the digest path, then
  // unsnooze to fire the original recap.
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 6, totalBytes: 60_000 }),
  });
  await setAudienceArchiveDeletionNotifierSnooze({ snoozeUntil: null });
  assert.equal(recapCalls.length, 1, "original recap fires on unsnooze");
  const originalPayload = recapCalls[0].payload;

  // Now resend — counters come from the snooze-log row, dedup is
  // untouched, and the email matches the original numbers.
  const r = await resendLastSnoozeRecap({ triggeredBy: "founder_x" });
  assert.equal(r.recapSent, true);
  assert.equal(r.reason, "sent");
  assert.equal(r.suppressedCount, originalPayload.suppressedCount);
  assert.equal(r.suppressedFiles, originalPayload.suppressedFiles);
  assert.equal(r.suppressedBytes, originalPayload.suppressedBytes);
  assert.equal(r.trigger, "manual_unsnooze");
  assert.equal(recapCalls.length, 2, "resend produces a second send");
  assert.equal(recapCalls[1].payload.suppressedCount, originalPayload.suppressedCount);
  assert.equal(recapCalls[1].payload.suppressedFiles, originalPayload.suppressedFiles);
  assert.equal(recapCalls[1].payload.suppressedBytes, originalPayload.suppressedBytes);

  // History records the resend as a snooze_recap tagged manual_resend.
  const hist = getAudienceArchiveDeletionNotifierHistory(10);
  const resendEntry = hist.find(
    (h) => h.kind === "snooze_recap" && (h.errorMessage ?? "").includes("manual_resend"),
  );
  assert.ok(resendEntry, "manual_resend history entry must exist");
  assert.equal(resendEntry!.reason, "sent");
  assert.equal(resendEntry!.notified, true);
  assert.match(resendEntry!.errorMessage ?? "", /by:founder_x/);

  // Dedup pointer is untouched — repeated resends keep working.
  const cfg = await getAudienceArchiveDeletionNotifierConfig();
  const recapAtBefore = cfg.lastSnoozeRecapAt;
  const r2 = await resendLastSnoozeRecap();
  assert.equal(r2.recapSent, true);
  const cfgAfter = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(cfgAfter.lastSnoozeRecapAt, recapAtBefore);
});

test("Task #612: resendLastSnoozeRecap returns no_prior_recap when nothing was ever recapped", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  const r = await resendLastSnoozeRecap();
  assert.equal(r.recapSent, false);
  assert.equal(r.reason, "no_prior_recap");
  assert.equal(recapCalls.length, 0);
});

test("Task #612: resendLastSnoozeRecap is gated by enabled and recipients", async () => {
  // Set up a recapped window first.
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 3, totalBytes: 3_000 }),
  });
  await setAudienceArchiveDeletionNotifierSnooze({ snoozeUntil: null });
  recapCalls = [];

  // Disabled → silent skip.
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: false,
    recipients: ["founder@mougle.com"],
  });
  const rd = await resendLastSnoozeRecap();
  assert.equal(rd.recapSent, false);
  assert.equal(rd.reason, "disabled");
  assert.equal(recapCalls.length, 0);

  // Re-enable but with no recipients → no_recipients.
  // (setConfig refuses enabled+empty recipients, so simulate by
  // writing the row directly.)
  const cur = await getAudienceArchiveDeletionNotifierConfig();
  const stale = { ...cur, enabled: true, recipients: [] };
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY,
      value: JSON.stringify(stale),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: JSON.stringify(stale) },
    });
  const rn = await resendLastSnoozeRecap();
  assert.equal(rn.recapSent, false);
  assert.equal(rn.reason, "no_recipients");
  assert.equal(recapCalls.length, 0);
});

test("Task #612: resendLastSnoozeRecap surfaces send_failed in history without changing dedup state", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  await setAudienceArchiveDeletionNotifierSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  await runUpcomingExpiryDigest({
    statsLoader: async () => buildStats({ fileCount: 4, totalBytes: 4_000 }),
  });
  await setAudienceArchiveDeletionNotifierSnooze({ snoozeUntil: null });
  const cfgBefore = await getAudienceArchiveDeletionNotifierConfig();
  recapImpl = async () => {
    throw new Error("resend_down");
  };
  const r = await resendLastSnoozeRecap();
  assert.equal(r.recapSent, false);
  assert.equal(r.reason, "send_failed");
  assert.match(r.errorMessage ?? "", /resend_down/);
  const hist = getAudienceArchiveDeletionNotifierHistory(10);
  assert.ok(
    hist.some(
      (h) =>
        h.kind === "snooze_recap" &&
        h.reason === "send_failed" &&
        (h.errorMessage ?? "").includes("manual_resend") &&
        (h.errorMessage ?? "").includes("resend_down"),
    ),
  );
  const cfgAfter = await getAudienceArchiveDeletionNotifierConfig();
  assert.equal(cfgAfter.lastSnoozeRecapAt, cfgBefore.lastSnoozeRecapAt);
});

test("sendTestArchiveExpiryDigestEmail records history kind:test when stats loader fails", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
  });
  const r = await sendTestArchiveExpiryDigestEmail({
    statsLoader: async () => {
      throw new Error("stats_unavailable");
    },
  });
  assert.equal(r.ok, false);
  assert.equal(digestCalls.length, 0, "no email may be sent when stats fail to load");
  assert.match(r.errorMessage ?? "", /stats_unavailable/);
  const hist = getAudienceArchiveDeletionNotifierHistory(10);
  const entry = hist.find((h) => h.id === r.entry.id);
  assert.ok(entry, "stats-failure entry must be in history");
  assert.equal(entry!.kind, "test");
  assert.equal(entry!.reason, "send_failed");
  assert.equal(entry!.notified, false);
  assert.equal(entry!.fileCount, 0);
  assert.match(entry!.errorMessage ?? "", /stats_load_failed/);
  assert.match(entry!.errorMessage ?? "", /stats_unavailable/);
});
