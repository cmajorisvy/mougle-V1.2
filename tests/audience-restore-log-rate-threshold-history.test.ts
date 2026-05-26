/**
 * Task #571 — tests for the restore-log rate threshold change history.
 * Covers: record-on-save (prior/new/by/at), clear records a transition
 * to null, the GET /history route returns newest-first capped at the
 * requested limit, and `pruneRestoreLogRateThresholdHistoryOlderThan`
 * removes old rows.
 */

import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { eq, inArray, sql } from "drizzle-orm";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { db } from "../server/db";
import { adminStaff, systemSettings } from "@shared/schema";
import { audienceRestoreLogRateThresholdHistory } from "../shared/omni-channel-audience-schema";
import {
  AUDIENCE_RESTORE_LOG_RATE_NOTIFY_ON_WEAKENING_SETTING_KEY,
  AUDIENCE_RESTORE_LOG_RATE_THRESHOLD_SETTING_KEY,
  classifyRestoreLogRateWeakening,
  getRestoreLogRateThresholdHistory,
  isRestoreLogRateNotifyOnWeakeningEnabled,
  pruneRestoreLogRateThresholdHistoryOlderThan,
  setRestoreLogRateNotifyOnWeakeningEnabled,
  setRestoreLogRateThresholdOverride,
} from "../server/services/audience-restore-log-rate-alert-service";
import { EmailService } from "../server/services/email-service";

let server: Server;
let baseUrl: string;

before(async () => {
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
  await new Promise<void>((r) => server.close(() => r()));
});

type WeakenedArgs = Parameters<
  EmailService["sendRestoreRateAlertWeakenedEmail"]
>;
const origSendWeakened =
  EmailService.prototype.sendRestoreRateAlertWeakenedEmail;
let weakenedCalls: WeakenedArgs[] = [];
const TEST_ROOT_ADMIN_EMAIL = "task618-root@example.test";
const TEST_ROOT_ADMIN_USERNAME = "task618_root_admin";

before(() => {
  EmailService.prototype.sendRestoreRateAlertWeakenedEmail = async function (
    this: EmailService,
    ...args: WeakenedArgs
  ) {
    weakenedCalls.push(args);
    return null as any;
  };
});

after(() => {
  EmailService.prototype.sendRestoreRateAlertWeakenedEmail = origSendWeakened;
});

beforeEach(async () => {
  weakenedCalls = [];
  await db
    .delete(systemSettings)
    .where(
      inArray(systemSettings.key, [
        AUDIENCE_RESTORE_LOG_RATE_THRESHOLD_SETTING_KEY,
        AUDIENCE_RESTORE_LOG_RATE_NOTIFY_ON_WEAKENING_SETTING_KEY,
      ]),
    );
  await db.delete(audienceRestoreLogRateThresholdHistory);
  await db
    .delete(adminStaff)
    .where(eq(adminStaff.email, TEST_ROOT_ADMIN_EMAIL));
  // Raw SQL insert: some test DBs lack newer optional columns
  // (e.g. slack_handle) so we only set the strictly-required NOT NULL
  // fields.
  await db.execute(sql`
    INSERT INTO admin_staff (email, username, password_hash, display_name, role, active)
    VALUES (${TEST_ROOT_ADMIN_EMAIL}, ${TEST_ROOT_ADMIN_USERNAME}, 'x', 'Task 618 Root Admin', 'root_admin', true)
  `);
});

afterEach(async () => {
  await db
    .delete(adminStaff)
    .where(eq(adminStaff.email, TEST_ROOT_ADMIN_EMAIL));
});

test("setRestoreLogRateThresholdOverride records prior/new/by on every save", async () => {
  await setRestoreLogRateThresholdOverride(100, "alice");
  await setRestoreLogRateThresholdOverride(25, "bob");

  const history = await getRestoreLogRateThresholdHistory(10);
  assert.equal(history.length, 2);
  // Newest first.
  assert.equal(history[0].updatedBy, "bob");
  assert.equal(history[0].priorOverride, 100);
  assert.equal(history[0].newOverride, 25);
  assert.equal(history[1].updatedBy, "alice");
  assert.equal(history[1].priorOverride, null);
  assert.equal(history[1].newOverride, 100);
});

test("clearing the override records a transition to null", async () => {
  await setRestoreLogRateThresholdOverride(75, "alice");
  await setRestoreLogRateThresholdOverride(null, "alice");

  const history = await getRestoreLogRateThresholdHistory(10);
  assert.equal(history.length, 2);
  assert.equal(history[0].newOverride, null);
  assert.equal(history[0].priorOverride, 75);
});

test("setting the threshold to 0 records the disable transition", async () => {
  await setRestoreLogRateThresholdOverride(50, "alice");
  await setRestoreLogRateThresholdOverride(0, "bob");

  const history = await getRestoreLogRateThresholdHistory(10);
  assert.equal(history.length, 2);
  assert.equal(history[0].updatedBy, "bob");
  assert.equal(history[0].priorOverride, 50);
  assert.equal(history[0].newOverride, 0);
});

test("GET /restore-log/rate-threshold/history returns newest-first entries with limit", async () => {
  for (let i = 0; i < 5; i++) {
    await setRestoreLogRateThresholdOverride(100 + i, `actor-${i}`);
  }

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/restore-log/rate-threshold/history?limit=3`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.entries.length, 3);
  assert.equal(body.entries[0].updatedBy, "actor-4");
  assert.equal(body.entries[1].updatedBy, "actor-3");
  assert.equal(body.entries[2].updatedBy, "actor-2");
});

test("GET /restore-log/rate-threshold/history defaults to a 10-row window", async () => {
  for (let i = 0; i < 12; i++) {
    await setRestoreLogRateThresholdOverride(200 + i, `actor-${i}`);
  }
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/restore-log/rate-threshold/history`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.entries.length, 10);
  assert.equal(body.entries[0].updatedBy, "actor-11");
});

test("getRestoreLogRateThresholdHistory resolves updatedBy to admin_staff display name + email", async () => {
  const id = `t619-${Date.now()}`;
  const email = `t619-${Date.now()}@example.com`;
  const username = `t619u${Date.now()}`;
  // Use raw SQL to avoid drift between the schema definition and the
  // actual `admin_staff` columns in this test DB (e.g. `slack_handle`).
  await db.execute(sql`
    INSERT INTO admin_staff (id, email, username, password_hash, display_name, role)
    VALUES (${id}, ${email}, ${username}, 'x', 'Alice Cooper', 'root_admin')
  `);
  try {
    await setRestoreLogRateThresholdOverride(80, id);
    await setRestoreLogRateThresholdOverride(40, email);
    await setRestoreLogRateThresholdOverride(20, "unknown-id-not-in-staff");

    const history = await getRestoreLogRateThresholdHistory(10);
    assert.equal(history.length, 3);
    // by username/email/id-match should all resolve.
    assert.equal(history[1].updatedByDisplayName, "Alice Cooper");
    assert.equal(history[1].updatedByEmail, email);
    assert.equal(history[2].updatedByDisplayName, "Alice Cooper");
    assert.equal(history[2].updatedByEmail, email);
    // Unknown id falls back to nulls — UI shows the raw id.
    assert.equal(history[0].updatedBy, "unknown-id-not-in-staff");
    assert.equal(history[0].updatedByDisplayName, null);
    assert.equal(history[0].updatedByEmail, null);
  } finally {
    await db.delete(adminStaff).where(eq(adminStaff.id, id));
  }
});

// ----------------------------------------------------------------------
// Task #618 — email founders when someone disables / loosens the alert
// ----------------------------------------------------------------------

test("classifyRestoreLogRateWeakening detects disable and 2x+ loosen", () => {
  assert.equal(classifyRestoreLogRateWeakening(50, 0), "disabled");
  assert.equal(classifyRestoreLogRateWeakening(50, 100), "loosened_2x");
  assert.equal(classifyRestoreLogRateWeakening(50, 200), "loosened_2x");
  assert.equal(classifyRestoreLogRateWeakening(50, 99), null);
  assert.equal(classifyRestoreLogRateWeakening(50, 25), null); // tightening
  assert.equal(classifyRestoreLogRateWeakening(0, 0), null); // already off
  assert.equal(classifyRestoreLogRateWeakening(0, 100), null); // turning ON is not weakening
});

test("notify-on-weakening: default is enabled and survives explicit toggle", async () => {
  assert.equal(await isRestoreLogRateNotifyOnWeakeningEnabled(), true);
  await setRestoreLogRateNotifyOnWeakeningEnabled(false, "alice");
  assert.equal(await isRestoreLogRateNotifyOnWeakeningEnabled(), false);
  await setRestoreLogRateNotifyOnWeakeningEnabled(true, "alice");
  assert.equal(await isRestoreLogRateNotifyOnWeakeningEnabled(), true);
});

test("setting threshold to 0 emails root admins with reason=disabled", async () => {
  await setRestoreLogRateThresholdOverride(50, "alice");
  weakenedCalls = [];
  await setRestoreLogRateThresholdOverride(0, "bob");
  assert.equal(weakenedCalls.length, 1);
  const [recipients, payload] = weakenedCalls[0];
  assert.ok(recipients.includes(TEST_ROOT_ADMIN_EMAIL));
  assert.equal(payload.reason, "disabled");
  assert.equal(payload.actor, "bob");
  assert.equal(payload.priorEffective, 50);
  assert.equal(payload.newEffective, 0);
  assert.equal(payload.priorOverride, 50);
  assert.equal(payload.newOverride, 0);
});

test("loosening by 2x+ emails root admins with reason=loosened_2x", async () => {
  await setRestoreLogRateThresholdOverride(50, "alice");
  weakenedCalls = [];
  await setRestoreLogRateThresholdOverride(150, "bob");
  assert.equal(weakenedCalls.length, 1);
  const [, payload] = weakenedCalls[0];
  assert.equal(payload.reason, "loosened_2x");
  assert.equal(payload.priorEffective, 50);
  assert.equal(payload.newEffective, 150);
  assert.equal(payload.actor, "bob");
});

test("loosening by less than 2x does NOT email", async () => {
  await setRestoreLogRateThresholdOverride(50, "alice");
  weakenedCalls = [];
  await setRestoreLogRateThresholdOverride(75, "bob");
  assert.equal(weakenedCalls.length, 0);
});

test("tightening (lower threshold) does NOT email", async () => {
  await setRestoreLogRateThresholdOverride(100, "alice");
  weakenedCalls = [];
  await setRestoreLogRateThresholdOverride(25, "bob");
  assert.equal(weakenedCalls.length, 0);
});

test("opting out via the toggle suppresses the weakening email", async () => {
  await setRestoreLogRateThresholdOverride(50, "alice");
  await setRestoreLogRateNotifyOnWeakeningEnabled(false, "alice");
  weakenedCalls = [];
  await setRestoreLogRateThresholdOverride(0, "bob");
  assert.equal(weakenedCalls.length, 0);
});

test("GET/POST notify-on-weakening route round-trips the toggle", async () => {
  const r1 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/restore-log/rate-threshold/notify-on-weakening`,
  );
  assert.equal(r1.status, 200);
  assert.deepEqual(await r1.json(), { enabled: true });

  const r2 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/restore-log/rate-threshold/notify-on-weakening`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    },
  );
  assert.equal(r2.status, 200);
  assert.deepEqual(await r2.json(), { enabled: false });

  assert.equal(await isRestoreLogRateNotifyOnWeakeningEnabled(), false);
});

test("pruneRestoreLogRateThresholdHistoryOlderThan drops rows older than cutoff", async () => {
  await setRestoreLogRateThresholdOverride(75, "alice");
  // Force the row's occurredAt back in time so the prune sees it as old.
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  await db
    .update(audienceRestoreLogRateThresholdHistory)
    .set({ occurredAt: past });
  await setRestoreLogRateThresholdOverride(150, "bob");

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pruned = await pruneRestoreLogRateThresholdHistoryOlderThan(cutoff);
  assert.equal(pruned, 1);

  const remaining = await getRestoreLogRateThresholdHistory(10);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].updatedBy, "bob");
});
