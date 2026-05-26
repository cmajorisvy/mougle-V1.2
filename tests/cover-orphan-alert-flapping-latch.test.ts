/**
 * Task #247 — Lock the one-shot semantics of the cover-sweep flapping
 * alert (`broadcast_cover_orphans_flapping`).
 *
 * Background (see task #215 + `cover-orphan-alert-service.ts`):
 * `check()` recomputes how many `broadcast_cover_orphans` alerts have
 * auto-cleared in the last 24h. When that count crosses
 * `FLAPPING_THRESHOLD` (3) we fire ONE platform-alert row + ONE email
 * per active root admin, and latch (`wasFlapping = true`) so the alert
 * does NOT re-fire on every subsequent healthy sweep while the count
 * stays at or above the threshold. The latch only releases (re-arms)
 * once the recent auto-clear count drops back below the threshold.
 *
 * If a future refactor reorders `check()` or accidentally compares
 * against a stale `wasFlapping` value, founders would get spammed
 * with one flapping email per sweep — exactly the noise this alert
 * exists to prevent. This test fails fast in that case.
 *
 * Strategy:
 *  - Point the service at an empty temp covers dir and seed the
 *    desired number of "auto-resolved" cover-orphan rows in
 *    `platform_alerts` (acknowledged=true, acknowledgedBy="system",
 *    details.autoResolved=true). `countRecentAutoClears` counts those
 *    rows, so we can pin the flapping count to whatever we want by
 *    adding / removing seeded rows between `check()` calls.
 *  - Spy on `panicButtonService.createAlert` and
 *    `EmailService.prototype.sendAdminAlert` so we can count only the
 *    flapping-type fires, decoupled from the threshold alert path
 *    (which is exercised in other tests).
 *  - All seeded rows are tagged with a per-run TEST_MARKER on
 *    `details.source`; the after-hook deletes only those rows so the
 *    test stays safe against the shared dev DB.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { adminStaff, platformAlerts, systemSettings } from "../shared/schema";
import { coverOrphanAlertService } from "../server/services/cover-orphan-alert-service";
import { broadcastCompositorService } from "../server/services/broadcast-compositor-service";
import { panicButtonService } from "../server/services/panic-button-service";
import { EmailService } from "../server/services/email-service";

const ALERT_TYPE = "broadcast_cover_orphans";
const FLAPPING_ALERT_TYPE = "broadcast_cover_orphans_flapping";
const THRESHOLD_KEY = "cover_orphan_alert_threshold";
const FLAPPING_THRESHOLD_KEY = "cover_orphan_sweep_flapping_threshold";
const FLAPPING_WINDOW_MS_KEY = "cover_orphan_sweep_flapping_window_ms";
const LAST_REARMED_AT_KEY = "cover_orphan_sweep_flapping_last_rearmed_at";
const TEST_MARKER = `t247-${randomUUID()}`;
// Service constant; mirrored here so the test fails loudly if the
// production threshold is changed without revisiting this test.
const FLAPPING_THRESHOLD = 3;
// Threshold high enough that the test's empty covers dir is comfortably
// below it → orphan count is 0, so the (separate) above-threshold alert
// path never fires.
const TEST_THRESHOLD = 100;

let tmpRoot: string;
let coversDir: string;
let prevPrivateDir: string | undefined;
let prevThreshold: { value: string; updatedBy: string | null } | null = null;
const origListBroadcastIds = broadcastCompositorService.listBroadcastIds;
const origCreateAlert = panicButtonService.createAlert.bind(panicButtonService);
const origSendAdminAlert = EmailService.prototype.sendAdminAlert;
const origCountRecentAutoClears = (coverOrphanAlertService as any)
  .countRecentAutoClears.bind(coverOrphanAlertService);

type CreateAlertArg = {
  type: string;
  severity: string;
  message: string;
  details?: any;
  autoTriggered?: boolean;
};
const createAlertCalls: CreateAlertArg[] = [];
const emailCalls: Array<{ to: string; title: string }> = [];
const seededIds: string[] = [];
// Task #838 — flapping-alert rows we insert directly (to exercise the
// `findLastFlappingFiredAt` query in getStatus()). Tracked separately so
// cleanup deletes them by id, not by the auto-resolved-orphan filter
// used for `seededIds`.
const seededFlappingAlertIds: string[] = [];

// Test recipients seeded into `admin_staff` as active root_admins so the
// service's email branch actually runs (the production code emails all
// active root_admins on a flapping fire). Cleaned up in `after`.
const FOUNDER_EMAIL = `founder-${TEST_MARKER}@test.local`;
const SECURITY_EMAIL = `security-${TEST_MARKER}@test.local`;
const TEST_RECIPIENTS = new Set([FOUNDER_EMAIL, SECURITY_EMAIL]);
const seededAdminIds: string[] = [];

async function seedRootAdmin(email: string, username: string): Promise<void> {
  const [row] = await db
    .insert(adminStaff)
    .values({
      email,
      username,
      passwordHash: `[${TEST_MARKER}] not-a-real-hash`,
      displayName: username,
      role: "root_admin",
      active: true,
      createdBy: TEST_MARKER,
      updatedBy: TEST_MARKER,
    })
    .returning({ id: adminStaff.id });
  seededAdminIds.push(row.id);
}

function testEmailCount(predicate: (e: { to: string; title: string }) => boolean): number {
  return emailCalls.filter((e) => TEST_RECIPIENTS.has(e.to) && predicate(e)).length;
}

function flappingTestEmails(): Array<{ to: string; title: string }> {
  return emailCalls.filter(
    (e) => TEST_RECIPIENTS.has(e.to) && e.title === "Cover sweep is flapping",
  );
}

async function seedAutoResolvedAlert(ackOffsetMs = 60_000): Promise<string> {
  const ackAt = new Date(Date.now() - ackOffsetMs);
  const [row] = await db
    .insert(platformAlerts)
    .values({
      type: ALERT_TYPE,
      severity: "warning",
      message: `[${TEST_MARKER}] seeded auto-resolved orphan alert`,
      details: {
        source: TEST_MARKER,
        autoResolved: true,
        autoResolvedAt: ackAt.toISOString(),
        autoResolvedOrphanCount: 0,
        autoResolvedThreshold: TEST_THRESHOLD,
        autoResolvedNote: `[${TEST_MARKER}] seeded for flapping latch test`,
      },
      acknowledged: true,
      acknowledgedBy: "system",
      acknowledgedAt: ackAt,
      autoTriggered: true,
    })
    .returning();
  seededIds.push(row.id);
  return row.id;
}

async function removeOneSeededAlert(): Promise<void> {
  const id = seededIds.shift();
  if (!id) return;
  await db.delete(platformAlerts).where(eq(platformAlerts.id, id));
}

function flappingCreateAlertCount(): number {
  return createAlertCalls.filter((c) => c.type === FLAPPING_ALERT_TYPE).length;
}

function flappingEmailCount(): number {
  return emailCalls.filter((e) => e.title === "Cover sweep is flapping").length;
}

/**
 * The service's `countRecentAutoClears` counts ALL recent auto-resolved
 * cover-orphan alerts in the shared DB, not just rows tagged with our
 * marker. To stay deterministic we override that private method to
 * count only this test's seeded rows.
 */
function installCountRecentAutoClearsStub() {
  (coverOrphanAlertService as any).countRecentAutoClears = async () => {
    return seededIds.length;
  };
}

describe("coverOrphanAlertService flapping alert latch (#247)", () => {
  before(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "cover-orphan-flapping-"));
    prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = tmpRoot;
    coversDir = pathResolve(tmpRoot, "broadcasts", "covers");
    mkdirSync(coversDir, { recursive: true });

    // No real broadcast IDs and no orphan files → scan reports 0 orphans
    // every `check()`, so we exercise only the flapping latch (the
    // above-threshold path never fires and `autoResolveOpenAlerts` has
    // nothing to do against our seeded rows since they are already
    // acknowledged).
    (broadcastCompositorService as any).listBroadcastIds = async () => [];

    // Snapshot + raise the threshold so the orphan-count branch stays
    // quiet for the duration of this test.
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

    // Spy on createAlert: do NOT call through (we don't want a real
    // flapping platform_alerts row landing in the shared DB; the spy
    // count is the assertion surface).
    (panicButtonService as any).createAlert = async (alert: CreateAlertArg) => {
      createAlertCalls.push(alert);
      return undefined as any;
    };

    // Spy on EmailService.prototype.sendAdminAlert so we cover the
    // service's `new EmailService()` instance too (which is private
    // and instantiated at module load).
    EmailService.prototype.sendAdminAlert = async function (
      to: string,
      alert: { title: string; severity: string; message: string },
    ) {
      emailCalls.push({ to, title: alert.title });
      return undefined as any;
    };

    // Stub countRecentAutoClears so it counts only this test's seeded
    // rows (the production implementation counts all recent auto-resolved
    // cover-orphan alerts in the shared dev DB, which would make Phase
    // 1's "below threshold => no fire" assertion flaky).
    installCountRecentAutoClearsStub();

    // Make sure the latch starts from a known state regardless of
    // prior service activity in this Node process.
    (coverOrphanAlertService as any).wasFlapping = false;
    (coverOrphanAlertService as any).wasAboveThreshold = false;

    // Seed founder + security as active root_admins so the email branch
    // of `fireFlappingAlert` actually has someone to send to. Without
    // these rows the recipients query returns 0 in a clean test DB and
    // the email-path assertions would be vacuous.
    await seedRootAdmin(FOUNDER_EMAIL, `founder-${TEST_MARKER}`);
    await seedRootAdmin(SECURITY_EMAIL, `security-${TEST_MARKER}`);
  });

  after(async () => {
    (broadcastCompositorService as any).listBroadcastIds =
      origListBroadcastIds;
    (panicButtonService as any).createAlert = origCreateAlert;
    EmailService.prototype.sendAdminAlert = origSendAdminAlert;
    (coverOrphanAlertService as any).countRecentAutoClears =
      origCountRecentAutoClears;

    // Delete the seeded admin_staff recipients.
    try {
      for (const id of seededAdminIds.splice(0)) {
        await db.delete(adminStaff).where(eq(adminStaff.id, id));
      }
    } catch {
      /* best-effort */
    }

    // Delete any seeded rows still around (and any leftover rows tagged
    // with our marker, just in case).
    try {
      const ours = await db
        .select({ id: platformAlerts.id, details: platformAlerts.details })
        .from(platformAlerts)
        .where(eq(platformAlerts.type, ALERT_TYPE));
      for (const row of ours) {
        const d = (row.details as Record<string, any> | null) ?? {};
        if (d?.source === TEST_MARKER) {
          await db
            .delete(platformAlerts)
            .where(eq(platformAlerts.id, row.id));
        }
      }
    } catch {
      /* best-effort */
    }

    // Task #838 — delete flapping rows we seeded directly + any
    // system_settings rows the new readout test wrote.
    try {
      for (const id of seededFlappingAlertIds.splice(0)) {
        await db.delete(platformAlerts).where(eq(platformAlerts.id, id));
      }
    } catch {
      /* best-effort */
    }
    for (const key of [
      LAST_REARMED_AT_KEY,
      FLAPPING_THRESHOLD_KEY,
      FLAPPING_WINDOW_MS_KEY,
    ]) {
      try {
        await db
          .delete(systemSettings)
          .where(
            and(
              eq(systemSettings.key, key),
              eq(systemSettings.updatedBy, TEST_MARKER),
            ),
          );
      } catch {
        /* best-effort */
      }
    }

    // Restore the threshold setting.
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

  it(
    "fires flapping alert exactly once per episode and not while latched",
    async () => {
      // --- Phase 1: below threshold (2 auto-clears) → no fire ---
      await seedAutoResolvedAlert(60_000);
      await seedAutoResolvedAlert(120_000);

      await coverOrphanAlertService.check();
      assert.equal(
        flappingCreateAlertCount(),
        0,
        "flapping alert must not fire while below threshold",
      );
      assert.equal(
        flappingEmailCount(),
        0,
        "flapping email must not fire while below threshold",
      );

      // --- Phase 2: cross above threshold (3 auto-clears) → fire once ---
      await seedAutoResolvedAlert(30_000);
      await coverOrphanAlertService.check();
      assert.equal(
        flappingCreateAlertCount(),
        1,
        "flapping alert must fire exactly once on the first crossing",
      );
      // Task #830 — assert the email branch actually ran for both seeded
      // root_admin recipients (founder + security) with the expected
      // subject. Without this guard the email path could silently
      // regress while the createAlert path keeps recording the alert.
      const firstEpisodeTestEmails = flappingTestEmails();
      assert.equal(
        firstEpisodeTestEmails.length,
        2,
        "flapping email must be sent once to each seeded root_admin recipient",
      );
      const firstEpisodeRecipients = new Set(
        firstEpisodeTestEmails.map((e) => e.to),
      );
      assert.ok(
        firstEpisodeRecipients.has(FOUNDER_EMAIL),
        "founder root_admin must receive the cover-flapping email",
      );
      assert.ok(
        firstEpisodeRecipients.has(SECURITY_EMAIL),
        "security root_admin must receive the cover-flapping email",
      );
      for (const e of firstEpisodeTestEmails) {
        assert.match(
          e.title,
          /Cover sweep .*flapping/i,
          `email subject for ${e.to} must mention "Cover sweep" and "flapping"`,
        );
      }
      const fireCountAfterFirstEpisode = flappingCreateAlertCount();
      const emailCountAfterFirstEpisode = flappingEmailCount();
      const testEmailCountAfterFirstEpisode = firstEpisodeTestEmails.length;

      // Capture the alert payload to make sure we're counting the right alert.
      const firstFire = createAlertCalls.find(
        (c) => c.type === FLAPPING_ALERT_TYPE,
      );
      assert.ok(firstFire, "first flapping fire should be captured");
      assert.equal(firstFire!.severity, "warning");
      assert.ok(
        typeof firstFire!.message === "string" &&
          firstFire!.message.includes("flapping"),
      );
      assert.equal(
        firstFire!.details?.flappingThreshold,
        FLAPPING_THRESHOLD,
        "alert details must record the threshold used",
      );

      // --- Phase 3+4: stay above threshold for multiple checks → no re-fire ---
      await coverOrphanAlertService.check();
      await coverOrphanAlertService.check();
      assert.equal(
        flappingCreateAlertCount(),
        fireCountAfterFirstEpisode,
        "flapping alert must NOT re-fire while still above threshold (no spam)",
      );
      assert.equal(
        flappingEmailCount(),
        emailCountAfterFirstEpisode,
        "flapping email must NOT re-fire while still above threshold (no spam)",
      );
      // Task #830 — the email re-send guard must also hold for our
      // seeded recipients specifically (i.e. the latch protects them
      // from per-sweep spam, not just the aggregate count).
      assert.equal(
        flappingTestEmails().length,
        testEmailCountAfterFirstEpisode,
        "seeded recipients must NOT be re-emailed while latched (no per-sweep spam)",
      );

      // --- Phase 5: drop below threshold (remove 2 → 1 left) → latch releases, no fire ---
      await removeOneSeededAlert();
      await removeOneSeededAlert();
      await coverOrphanAlertService.check();
      assert.equal(
        flappingCreateAlertCount(),
        fireCountAfterFirstEpisode,
        "dropping back below threshold must not by itself fire a new alert",
      );
      assert.equal(
        (coverOrphanAlertService as any).wasFlapping,
        false,
        "latch must release once flapping count drops below threshold",
      );

      // --- Phase 6: cross above threshold again → fire second episode ---
      await seedAutoResolvedAlert(45_000);
      await seedAutoResolvedAlert(50_000);
      await coverOrphanAlertService.check();
      assert.equal(
        flappingCreateAlertCount(),
        fireCountAfterFirstEpisode + 1,
        "flapping alert must fire again on the second crossing (one per episode)",
      );
      // Task #830 — the second episode must re-mail BOTH seeded
      // recipients (one fresh email each), with the same subject shape.
      const secondEpisodeTestEmails = flappingTestEmails().slice(
        testEmailCountAfterFirstEpisode,
      );
      assert.equal(
        secondEpisodeTestEmails.length,
        2,
        "second episode must send exactly one new email to each seeded recipient",
      );
      const secondEpisodeRecipients = new Set(
        secondEpisodeTestEmails.map((e) => e.to),
      );
      assert.ok(
        secondEpisodeRecipients.has(FOUNDER_EMAIL) &&
          secondEpisodeRecipients.has(SECURITY_EMAIL),
        "second-episode flapping email must go to both founder + security",
      );
      for (const e of secondEpisodeTestEmails) {
        assert.match(e.title, /Cover sweep .*flapping/i);
      }
      if (emailCountAfterFirstEpisode > 0) {
        assert.ok(
          flappingEmailCount() > emailCountAfterFirstEpisode,
          "flapping email must fire again on the second crossing",
        );
      }

      // --- Final invariant: total fires == number of distinct episodes (2) ---
      assert.equal(
        flappingCreateAlertCount(),
        2,
        "exactly two flapping platform-alert fires across both episodes",
      );
    },
  );

  it(
    "getStatus() surfaces lastFlappingFiredAt + lastReArmedAt (Task #838)",
    async () => {
      // Seed a flapping platform_alert row directly so the
      // `findLastFlappingFiredAt` query (which runs against the real DB,
      // not the createAlert spy) has a deterministic newest row to find.
      // Use a future-skewed createdAt so we win against any stray
      // flapping rows that may already exist in the shared dev DB.
      const flappingCreatedAt = new Date(Date.now() + 60_000);
      const [flappingRow] = await db
        .insert(platformAlerts)
        .values({
          type: FLAPPING_ALERT_TYPE,
          severity: "warning",
          message: `[${TEST_MARKER}] seeded cover flapping row for readout test`,
          details: { source: TEST_MARKER, seededForReadoutTest: true },
          acknowledged: false,
          autoTriggered: true,
          createdAt: flappingCreatedAt,
        })
        .returning();
      seededFlappingAlertIds.push(flappingRow.id);

      const statusAfterSeed = await coverOrphanAlertService.getStatus();
      assert.equal(
        statusAfterSeed.lastFlappingFiredAt,
        flappingCreatedAt.getTime(),
        "getStatus().lastFlappingFiredAt must reflect the most recent flapping platform_alert createdAt",
      );

      // --- setFlappingThreshold persists lastReArmedAt ---
      const beforeThresholdReArm = Date.now();
      await coverOrphanAlertService.setFlappingThreshold(
        FLAPPING_THRESHOLD,
        TEST_MARKER,
      );
      const thresholdRearmRows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, LAST_REARMED_AT_KEY))
        .limit(1);
      assert.equal(
        thresholdRearmRows.length,
        1,
        "setFlappingThreshold must upsert the lastReArmedAt system_settings row",
      );
      const persistedThresholdMs = Number.parseInt(
        thresholdRearmRows[0].value,
        10,
      );
      assert.ok(
        Number.isFinite(persistedThresholdMs) &&
          persistedThresholdMs >= beforeThresholdReArm,
        "persisted lastReArmedAt must be >= the moment setFlappingThreshold was called",
      );
      const statusAfterThreshold = await coverOrphanAlertService.getStatus();
      assert.equal(
        statusAfterThreshold.lastReArmedAt,
        persistedThresholdMs,
        "getStatus().lastReArmedAt must reflect the persisted system_settings value after setFlappingThreshold",
      );

      // --- setFlappingWindowMs also updates lastReArmedAt ---
      // Small delay so the second write produces a strictly newer
      // timestamp (Date.now() is millisecond-resolution).
      await new Promise((r) => setTimeout(r, 5));
      const beforeWindowReArm = Date.now();
      await coverOrphanAlertService.setFlappingWindowMs(
        60 * 60_000,
        TEST_MARKER,
      );
      const windowRearmRows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, LAST_REARMED_AT_KEY))
        .limit(1);
      const persistedWindowMs = Number.parseInt(
        windowRearmRows[0].value,
        10,
      );
      assert.ok(
        Number.isFinite(persistedWindowMs) &&
          persistedWindowMs >= beforeWindowReArm,
        "persisted lastReArmedAt must advance after setFlappingWindowMs",
      );
      assert.ok(
        persistedWindowMs >= persistedThresholdMs,
        "setFlappingWindowMs must not move lastReArmedAt backwards",
      );
      const statusAfterWindow = await coverOrphanAlertService.getStatus();
      assert.equal(
        statusAfterWindow.lastReArmedAt,
        persistedWindowMs,
        "getStatus().lastReArmedAt must reflect the persisted value after setFlappingWindowMs",
      );
    },
  );
});
