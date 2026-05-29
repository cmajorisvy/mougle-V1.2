/**
 * Task #677 — tests for the persistent weakening-email notification history.
 *
 * Covers:
 *   - every weakening transition writes one row capturing actor, reason,
 *     prior/new effective, prior/new override, recipients, sent flag.
 *   - send failures are still persisted with `sent=false` + errorMessage
 *     and never crash the threshold update flow.
 *   - GET /weakening-history returns newest-first capped at the
 *     requested limit (default 10, max 50).
 *   - `pruneRestoreLogRateWeakeningNotificationsOlderThan` drops rows
 *     older than the cutoff.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { eq, inArray, sql } from "drizzle-orm";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { db } from "../server/db";
import { adminStaff, systemSettings } from "@shared/schema";
import {
  audienceRestoreLogRateThresholdHistory,
  audienceRestoreLogRateWeakeningNotifications,
} from "../shared/omni-channel-audience-schema";
import {
  AUDIENCE_RESTORE_LOG_RATE_NOTIFY_ON_WEAKENING_SETTING_KEY,
  AUDIENCE_RESTORE_LOG_RATE_THRESHOLD_SETTING_KEY,
  getRestoreLogRateWeakeningNotificationHistory,
  pruneRestoreLogRateWeakeningNotificationsOlderThan,
  setRestoreLogRateThresholdOverride,
} from "../server/services/audience-restore-log-rate-alert-service";
import { EmailService } from "../server/services/email-service";

let server: Server;
let baseUrl: string;

const TEST_ROOT_ADMIN_EMAIL = "task677-root@example.test";
const TEST_ROOT_ADMIN_USERNAME = "task677_root_admin";

type WeakenedArgs = Parameters<
  EmailService["sendRestoreRateAlertWeakenedEmail"]
>;
const origSendWeakened =
  EmailService.prototype.sendRestoreRateAlertWeakenedEmail;
let weakenedShouldThrow = false;

before(async () => {
  EmailService.prototype.sendRestoreRateAlertWeakenedEmail = async function (
    this: EmailService,
    ..._args: WeakenedArgs
  ) {
    if (weakenedShouldThrow) {
      throw new Error("resend simulated failure");
    }
    return null as any;
  };

  const app = express();
  app.use(express.json());
  const stubRequireRootAdmin: express.RequestHandler = (_req, _res, next) =>
    next();
  registerOmniChannelAudienceRoutes(app, stubRequireRootAdmin);
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  EmailService.prototype.sendRestoreRateAlertWeakenedEmail = origSendWeakened;
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  weakenedShouldThrow = false;
  await db
    .delete(systemSettings)
    .where(
      inArray(systemSettings.key, [
        AUDIENCE_RESTORE_LOG_RATE_THRESHOLD_SETTING_KEY,
        AUDIENCE_RESTORE_LOG_RATE_NOTIFY_ON_WEAKENING_SETTING_KEY,
      ]),
    );
  await db.delete(audienceRestoreLogRateThresholdHistory);
  await db.delete(audienceRestoreLogRateWeakeningNotifications);
  await db
    .delete(adminStaff)
    .where(eq(adminStaff.email, TEST_ROOT_ADMIN_EMAIL));
  await db.execute(sql`
    INSERT INTO admin_staff (email, username, password_hash, display_name, role, active)
    VALUES (${TEST_ROOT_ADMIN_EMAIL}, ${TEST_ROOT_ADMIN_USERNAME}, 'x', 'Task 677 Root Admin', 'root_admin', true)
  `);
});

test("disable transition persists a sent=true notification row", async () => {
  await setRestoreLogRateThresholdOverride(50, "alice");
  await setRestoreLogRateThresholdOverride(0, "bob");

  const history = await getRestoreLogRateWeakeningNotificationHistory(10);
  assert.equal(history.length, 1);
  const row = history[0];
  assert.equal(row.actor, "bob");
  assert.equal(row.reason, "disabled");
  assert.equal(row.priorEffective, 50);
  assert.equal(row.newEffective, 0);
  assert.equal(row.priorOverride, 50);
  assert.equal(row.newOverride, 0);
  assert.equal(row.sent, true);
  assert.equal(row.errorMessage, null);
  assert.ok(row.recipients.includes(TEST_ROOT_ADMIN_EMAIL));
});

test("loosen-2x transition persists a sent=true notification row", async () => {
  await setRestoreLogRateThresholdOverride(50, "alice");
  await setRestoreLogRateThresholdOverride(150, "bob");

  const history = await getRestoreLogRateWeakeningNotificationHistory(10);
  assert.equal(history.length, 1);
  assert.equal(history[0].reason, "loosened_2x");
  assert.equal(history[0].priorEffective, 50);
  assert.equal(history[0].newEffective, 150);
  assert.equal(history[0].sent, true);
});

test("non-weakening transitions do NOT persist a row", async () => {
  // Seed with 100 (this is itself a 2x loosen from the default 50, so
  // it produces one weakening row we explicitly clear before asserting).
  await setRestoreLogRateThresholdOverride(100, "alice");
  await db.delete(audienceRestoreLogRateWeakeningNotifications);

  await setRestoreLogRateThresholdOverride(25, "bob"); // tightening (100→25)
  await setRestoreLogRateThresholdOverride(40, "carol"); // small loosen 25→40 (<2x)

  const history = await getRestoreLogRateWeakeningNotificationHistory(10);
  assert.equal(history.length, 0);
});

test("Resend failure is persisted with sent=false + errorMessage and never throws", async () => {
  await setRestoreLogRateThresholdOverride(50, "alice");
  weakenedShouldThrow = true;
  await setRestoreLogRateThresholdOverride(0, "bob");

  const history = await getRestoreLogRateWeakeningNotificationHistory(10);
  assert.equal(history.length, 1);
  assert.equal(history[0].sent, false);
  assert.equal(history[0].reason, "disabled");
  assert.equal(history[0].errorMessage, "resend simulated failure");
  assert.ok(history[0].recipients.includes(TEST_ROOT_ADMIN_EMAIL));
});

test("GET /weakening-history returns newest-first capped at limit", async () => {
  // Five disable→re-enable cycles, each producing one weakening row.
  for (let i = 0; i < 5; i++) {
    await setRestoreLogRateThresholdOverride(50, `actor-${i}`);
    await setRestoreLogRateThresholdOverride(0, `actor-${i}`);
  }

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/restore-log/rate-threshold/weakening-history?limit=3`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.entries.length, 3);
  assert.equal(body.entries[0].actor, "actor-4");
  assert.equal(body.entries[1].actor, "actor-3");
  assert.equal(body.entries[2].actor, "actor-2");
});

test("GET /weakening-history defaults to a 10-row window", async () => {
  for (let i = 0; i < 12; i++) {
    await setRestoreLogRateThresholdOverride(50, `actor-${i}`);
    await setRestoreLogRateThresholdOverride(0, `actor-${i}`);
  }
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/restore-log/rate-threshold/weakening-history`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.entries.length, 10);
  assert.equal(body.entries[0].actor, "actor-11");
});

test("pruneRestoreLogRateWeakeningNotificationsOlderThan drops rows older than cutoff", async () => {
  await setRestoreLogRateThresholdOverride(50, "alice");
  await setRestoreLogRateThresholdOverride(0, "bob"); // weakening row
  // Force the row's occurredAt back in time so the prune sees it as old.
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  await db
    .update(audienceRestoreLogRateWeakeningNotifications)
    .set({ occurredAt: past });

  await setRestoreLogRateThresholdOverride(50, "alice");
  await setRestoreLogRateThresholdOverride(150, "carol"); // fresh weakening row

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pruned =
    await pruneRestoreLogRateWeakeningNotificationsOlderThan(cutoff);
  assert.equal(pruned, 1);

  const remaining = await getRestoreLogRateWeakeningNotificationHistory(10);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].actor, "carol");
});
