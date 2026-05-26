/**
 * Task #820 — Lock the one-shot semantics of the media-sweep flapping
 * alert (`broadcast_media_orphans_flapping`) and the "re-arm when
 * setFlappingThreshold is called" guarantee added in Task #811.
 *
 * Mirrors `cover-orphan-alert-flapping-latch.test.ts` (task #247) but for
 * the media orphan sweep. Two episodes verify the latch's once-per-episode
 * behaviour; a third episode then asserts that calling
 * `setFlappingThreshold()` re-arms the latch without waiting for the
 * recent-auto-clear count to drop below the threshold first.
 *
 * Strategy:
 *  - Point the service at an empty temp broadcasts dir so the regular
 *    above-threshold alert path never fires (orphan count stays 0).
 *  - Stub `countRecentAutoClears` to read directly from `seededIds.length`
 *    so the assertions stay deterministic against the shared dev DB.
 *  - Spy on `panicButtonService.createAlert` and
 *    `EmailService.prototype.sendAdminAlert` so we count flapping-only
 *    fires.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { adminStaff, platformAlerts, systemSettings } from "../shared/schema";
import { mediaOrphanAlertService } from "../server/services/media-orphan-alert-service";
import { broadcastCompositorService } from "../server/services/broadcast-compositor-service";
import { panicButtonService } from "../server/services/panic-button-service";
import { EmailService } from "../server/services/email-service";

const ALERT_TYPE = "broadcast_media_orphans";
const FLAPPING_ALERT_TYPE = "broadcast_media_orphans_flapping";
const THRESHOLD_KEY = "media_orphan_alert_threshold";
const FLAPPING_THRESHOLD_KEY = "media_orphan_sweep_flapping_threshold";
const FLAPPING_WINDOW_MS_KEY = "media_orphan_sweep_flapping_window_ms";
const LAST_REARMED_AT_KEY = "media_orphan_sweep_flapping_last_rearmed_at";
const TEST_MARKER = `t820-${randomUUID()}`;
// Threshold the test will pin via setFlappingThreshold(). Distinct from
// the production default (3) so the re-arm phase exercises the persisted
// value rather than accidentally re-hitting the default.
const FLAPPING_THRESHOLD = 3;
const TEST_THRESHOLD = 100;

let tmpRoot: string;
let broadcastsDir: string;
let prevPrivateDir: string | undefined;
let prevThreshold: { value: string; updatedBy: string | null } | null = null;
let prevFlappingThreshold: { value: string; updatedBy: string | null } | null = null;
let prevFlappingWindowMs: { value: string; updatedBy: string | null } | null = null;

const origGetBroadcastStorageRoot =
  broadcastCompositorService.getBroadcastStorageRoot.bind(
    broadcastCompositorService,
  );
const origListBroadcastMediaBasenames =
  broadcastCompositorService.listBroadcastMediaBasenames.bind(
    broadcastCompositorService,
  );
const origCreateAlert = panicButtonService.createAlert.bind(panicButtonService);
const origSendAdminAlert = EmailService.prototype.sendAdminAlert;
const origCountRecentAutoClears = (mediaOrphanAlertService as any)
  .countRecentAutoClears.bind(mediaOrphanAlertService);

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
// Task #838 — flapping-alert rows we insert directly to exercise the
// `findLastFlappingFiredAt` query in getStatus().
const seededFlappingAlertIds: string[] = [];

// Task #830 — seed founder + security as active root_admins so the
// `fireFlappingAlert` email branch actually has recipients. Without
// these rows the recipients query returns 0 in a clean test DB and
// the email-path assertions would be vacuous.
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

function flappingTestEmails(): Array<{ to: string; title: string }> {
  return emailCalls.filter(
    (e) =>
      TEST_RECIPIENTS.has(e.to) &&
      e.title.toLowerCase().includes("media sweep flapping"),
  );
}

async function seedAutoResolvedAlert(ackOffsetMs = 60_000): Promise<string> {
  const ackAt = new Date(Date.now() - ackOffsetMs);
  const [row] = await db
    .insert(platformAlerts)
    .values({
      type: ALERT_TYPE,
      severity: "warning",
      message: `[${TEST_MARKER}] seeded auto-resolved media orphan alert`,
      details: {
        source: TEST_MARKER,
        autoResolved: true,
        autoResolvedAt: ackAt.toISOString(),
        autoResolvedOrphanCount: 0,
        autoResolvedThreshold: TEST_THRESHOLD,
        autoResolvedNote: `[${TEST_MARKER}] seeded for media flapping latch test`,
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

function flappingCreateAlertCount(): number {
  return createAlertCalls.filter((c) => c.type === FLAPPING_ALERT_TYPE).length;
}

function flappingEmailCount(): number {
  return emailCalls.filter((e) =>
    e.title.toLowerCase().includes("media sweep flapping"),
  ).length;
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value, updatedBy: TEST_MARKER })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedBy: TEST_MARKER, updatedAt: new Date() },
    });
}

async function snapshotSetting(
  key: string,
): Promise<{ value: string; updatedBy: string | null } | null> {
  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return rows.length > 0
    ? { value: rows[0].value, updatedBy: rows[0].updatedBy ?? null }
    : null;
}

async function restoreSetting(
  key: string,
  prev: { value: string; updatedBy: string | null } | null,
): Promise<void> {
  if (prev) {
    await db
      .update(systemSettings)
      .set({
        value: prev.value,
        updatedBy: prev.updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.key, key));
  } else {
    await db
      .delete(systemSettings)
      .where(
        and(eq(systemSettings.key, key), eq(systemSettings.updatedBy, TEST_MARKER)),
      );
  }
}

describe("mediaOrphanAlertService flapping alert latch (#820)", () => {
  before(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "media-orphan-flapping-"));
    prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = tmpRoot;
    broadcastsDir = join(tmpRoot, "broadcasts");
    mkdirSync(broadcastsDir, { recursive: true });

    // Force the service's scan path to an empty dir with no known media,
    // so the orphan count stays 0 and the above-threshold alert path
    // never fires.
    (broadcastCompositorService as any).getBroadcastStorageRoot = () =>
      broadcastsDir;
    (broadcastCompositorService as any).listBroadcastMediaBasenames =
      async () => ({ mp4: new Set<string>(), manifest: new Set<string>() });

    prevThreshold = await snapshotSetting(THRESHOLD_KEY);
    prevFlappingThreshold = await snapshotSetting(FLAPPING_THRESHOLD_KEY);
    prevFlappingWindowMs = await snapshotSetting(FLAPPING_WINDOW_MS_KEY);

    // Raise the orphan threshold so the orphan path stays quiet.
    await upsertSetting(THRESHOLD_KEY, String(TEST_THRESHOLD));
    // Pin the flapping threshold so the latch test is decoupled from
    // future default changes.
    await upsertSetting(FLAPPING_THRESHOLD_KEY, String(FLAPPING_THRESHOLD));
    // Pin a generous window (1h) so seeded rows are always "recent".
    await upsertSetting(FLAPPING_WINDOW_MS_KEY, String(60 * 60_000));

    (panicButtonService as any).createAlert = async (alert: CreateAlertArg) => {
      createAlertCalls.push(alert);
      return undefined as any;
    };
    EmailService.prototype.sendAdminAlert = async function (
      to: string,
      alert: { title: string; severity: string; message: string },
    ) {
      emailCalls.push({ to, title: alert.title });
      return undefined as any;
    };

    // Override countRecentAutoClears to count only this test's seeded rows
    // (avoids flakiness from the shared dev DB).
    (mediaOrphanAlertService as any).countRecentAutoClears = async () => {
      return seededIds.length;
    };

    (mediaOrphanAlertService as any).wasFlapping = false;
    (mediaOrphanAlertService as any).wasAboveThreshold = false;

    // Task #830 — seed founder + security recipients.
    await seedRootAdmin(FOUNDER_EMAIL, `founder-${TEST_MARKER}`);
    await seedRootAdmin(SECURITY_EMAIL, `security-${TEST_MARKER}`);
  });

  after(async () => {
    (broadcastCompositorService as any).getBroadcastStorageRoot =
      origGetBroadcastStorageRoot;
    (broadcastCompositorService as any).listBroadcastMediaBasenames =
      origListBroadcastMediaBasenames;
    (panicButtonService as any).createAlert = origCreateAlert;
    EmailService.prototype.sendAdminAlert = origSendAdminAlert;
    (mediaOrphanAlertService as any).countRecentAutoClears =
      origCountRecentAutoClears;

    try {
      for (const id of seededAdminIds.splice(0)) {
        await db.delete(adminStaff).where(eq(adminStaff.id, id));
      }
    } catch {
      /* best-effort */
    }

    try {
      for (const id of seededIds.splice(0)) {
        await db.delete(platformAlerts).where(eq(platformAlerts.id, id));
      }
      // Best-effort: clean any leftover rows tagged with the marker.
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

    // Task #838 — delete flapping rows we seeded directly + any
    // lastReArmedAt row the new readout test wrote.
    try {
      for (const id of seededFlappingAlertIds.splice(0)) {
        await db.delete(platformAlerts).where(eq(platformAlerts.id, id));
      }
    } catch {
      /* best-effort */
    }
    try {
      await db
        .delete(systemSettings)
        .where(
          and(
            eq(systemSettings.key, LAST_REARMED_AT_KEY),
            eq(systemSettings.updatedBy, TEST_MARKER),
          ),
        );
    } catch {
      /* best-effort */
    }

    await restoreSetting(THRESHOLD_KEY, prevThreshold);
    await restoreSetting(FLAPPING_THRESHOLD_KEY, prevFlappingThreshold);
    await restoreSetting(FLAPPING_WINDOW_MS_KEY, prevFlappingWindowMs);

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

  it("fires fireFlappingAlert exactly once per episode (latched while above threshold)", async () => {
    // Phase 1 — below threshold (2 auto-clears) — no fire.
    await seedAutoResolvedAlert(60_000);
    await seedAutoResolvedAlert(120_000);
    await mediaOrphanAlertService.check();
    assert.equal(
      flappingCreateAlertCount(),
      0,
      "flapping alert must not fire while below threshold",
    );

    // Phase 2 — cross above threshold (3 auto-clears) — fire once.
    await seedAutoResolvedAlert(30_000);
    await mediaOrphanAlertService.check();
    assert.equal(
      flappingCreateAlertCount(),
      1,
      "flapping alert must fire exactly once on the first crossing",
    );
    const firstFire = createAlertCalls.find(
      (c) => c.type === FLAPPING_ALERT_TYPE,
    );
    assert.ok(firstFire, "first flapping fire should be captured");
    assert.equal(firstFire!.severity, "warning");
    assert.ok(
      typeof firstFire!.message === "string" &&
        firstFire!.message.toLowerCase().includes("flapping"),
    );
    assert.equal(
      firstFire!.details?.flappingThreshold,
      FLAPPING_THRESHOLD,
      "alert details must record the threshold used",
    );

    // Task #830 — assert the email branch actually ran for both seeded
    // root_admin recipients (founder + security) with the expected
    // "Media sweep flapping" subject. If a future refactor short-circuits
    // the email branch, this catches it immediately.
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
      "founder root_admin must receive the media-flapping email",
    );
    assert.ok(
      firstEpisodeRecipients.has(SECURITY_EMAIL),
      "security root_admin must receive the media-flapping email",
    );
    for (const e of firstEpisodeTestEmails) {
      assert.match(
        e.title,
        /Media sweep flapping/i,
        `email subject for ${e.to} must mention "Media sweep flapping"`,
      );
    }

    const fireCountAfterFirstEpisode = flappingCreateAlertCount();
    const emailCountAfterFirstEpisode = flappingEmailCount();
    const testEmailCountAfterFirstEpisode = firstEpisodeTestEmails.length;

    // Phase 3 — stay above threshold for two more checks — no re-fire.
    await mediaOrphanAlertService.check();
    await mediaOrphanAlertService.check();
    assert.equal(
      flappingCreateAlertCount(),
      fireCountAfterFirstEpisode,
      "flapping alert must NOT re-fire while still above threshold (no spam)",
    );
    assert.equal(
      flappingEmailCount(),
      emailCountAfterFirstEpisode,
      "flapping email must NOT re-fire while latched",
    );
    // Task #830 — same guard for our seeded recipients specifically.
    assert.equal(
      flappingTestEmails().length,
      testEmailCountAfterFirstEpisode,
      "seeded recipients must NOT be re-emailed while latched (no per-sweep spam)",
    );
  });

  it("re-arms the latch when setFlappingThreshold() is called (Task #811)", async () => {
    // Sanity precondition — the previous test left the latch latched and
    // the seeded count at 3 (still above threshold).
    assert.equal(seededIds.length, 3);
    assert.equal((mediaOrphanAlertService as any).wasFlapping, true);
    const beforeReArm = flappingCreateAlertCount();

    // Re-arm the latch by re-saving the same threshold via the public
    // setter. The persisted value is unchanged but the in-memory
    // `wasFlapping` flag must flip back to false so the next sweep can
    // re-alert without waiting for a below→above transition.
    await mediaOrphanAlertService.setFlappingThreshold(
      FLAPPING_THRESHOLD,
      TEST_MARKER,
    );
    assert.equal(
      (mediaOrphanAlertService as any).wasFlapping,
      false,
      "setFlappingThreshold must re-arm the latch immediately",
    );

    const beforeReArmTestEmails = flappingTestEmails().length;

    // Next check fires the alert again (still above threshold + re-armed).
    await mediaOrphanAlertService.check();
    assert.equal(
      flappingCreateAlertCount(),
      beforeReArm + 1,
      "alert must fire once more after the latch is re-armed",
    );
    // Task #830 — the re-arm path must also re-mail BOTH seeded
    // recipients with the expected subject; otherwise a regression
    // could leave the alert recorded in-DB while the founder/security
    // recipients stop hearing about it.
    const reArmEpisodeEmails = flappingTestEmails().slice(beforeReArmTestEmails);
    assert.equal(
      reArmEpisodeEmails.length,
      2,
      "re-arm episode must re-mail each seeded recipient exactly once",
    );
    const reArmRecipients = new Set(reArmEpisodeEmails.map((e) => e.to));
    assert.ok(
      reArmRecipients.has(FOUNDER_EMAIL) && reArmRecipients.has(SECURITY_EMAIL),
      "re-arm flapping email must go to both founder + security",
    );
    for (const e of reArmEpisodeEmails) {
      assert.match(e.title, /Media sweep flapping/i);
    }

    // And it re-latches — subsequent checks do not re-fire.
    await mediaOrphanAlertService.check();
    assert.equal(
      flappingCreateAlertCount(),
      beforeReArm + 1,
      "alert must NOT re-fire on the very next sweep after re-arming + firing",
    );
    assert.equal(
      flappingTestEmails().length,
      beforeReArmTestEmails + 2,
      "no extra recipient emails after re-arm + latch",
    );
  });

  it("getStatus() surfaces lastFlappingFiredAt + lastReArmedAt (Task #838)", async () => {
    // Seed a flapping platform_alert row directly so the
    // `findLastFlappingFiredAt` query (which runs against the real DB,
    // not the createAlert spy) has a deterministic newest row to find.
    // Use a future-skewed createdAt so we beat any stray flapping rows
    // already present in the shared dev DB.
    const flappingCreatedAt = new Date(Date.now() + 60_000);
    const [flappingRow] = await db
      .insert(platformAlerts)
      .values({
        type: FLAPPING_ALERT_TYPE,
        severity: "warning",
        message: `[${TEST_MARKER}] seeded media flapping row for readout test`,
        details: { source: TEST_MARKER, seededForReadoutTest: true },
        acknowledged: false,
        autoTriggered: true,
        createdAt: flappingCreatedAt,
      })
      .returning();
    seededFlappingAlertIds.push(flappingRow.id);

    const statusAfterSeed = await mediaOrphanAlertService.getStatus();
    assert.equal(
      statusAfterSeed.lastFlappingFiredAt,
      flappingCreatedAt.getTime(),
      "getStatus().lastFlappingFiredAt must reflect the most recent flapping platform_alert createdAt",
    );

    // setFlappingThreshold persists lastReArmedAt.
    const beforeThresholdReArm = Date.now();
    await mediaOrphanAlertService.setFlappingThreshold(
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
    const statusAfterThreshold = await mediaOrphanAlertService.getStatus();
    assert.equal(
      statusAfterThreshold.lastReArmedAt,
      persistedThresholdMs,
      "getStatus().lastReArmedAt must reflect the persisted system_settings value after setFlappingThreshold",
    );

    // setFlappingWindowMs also updates lastReArmedAt.
    await new Promise((r) => setTimeout(r, 5));
    const beforeWindowReArm = Date.now();
    await mediaOrphanAlertService.setFlappingWindowMs(
      60 * 60_000,
      TEST_MARKER,
    );
    const windowRearmRows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, LAST_REARMED_AT_KEY))
      .limit(1);
    const persistedWindowMs = Number.parseInt(windowRearmRows[0].value, 10);
    assert.ok(
      Number.isFinite(persistedWindowMs) &&
        persistedWindowMs >= beforeWindowReArm,
      "persisted lastReArmedAt must advance after setFlappingWindowMs",
    );
    assert.ok(
      persistedWindowMs >= persistedThresholdMs,
      "setFlappingWindowMs must not move lastReArmedAt backwards",
    );
    const statusAfterWindow = await mediaOrphanAlertService.getStatus();
    assert.equal(
      statusAfterWindow.lastReArmedAt,
      persistedWindowMs,
      "getStatus().lastReArmedAt must reflect the persisted value after setFlappingWindowMs",
    );
  });
});
