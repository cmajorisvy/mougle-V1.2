/**
 * Task #455 — Integration test for live admin threshold edits.
 *
 * The unit tests in `gateway-block-alert-settings-service.test.ts` cover
 * the settings service in isolation and `gateway-block-alert.test.ts`
 * covers the alert service with env vars. This file wires the two
 * together: an admin lowering / raising the threshold via
 * `gatewayBlockAlertSettingsService.setThreshold` must take effect on
 * the very next `audience.gateway_send_blocked` event the alert service
 * processes — no server restart, no env reload.
 */

import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts, systemSettings } from "@shared/schema";
import {
  GATEWAY_BLOCK_ALERT_TYPE,
  gatewayBlockAlertService,
} from "../server/services/gateway-block-alert-service";
import {
  GATEWAY_BLOCK_ALERT_DEDUP_MS_KEY,
  GATEWAY_BLOCK_ALERT_RECOVERY_KEY,
  GATEWAY_BLOCK_ALERT_THRESHOLD_KEY,
  GATEWAY_BLOCK_ALERT_WINDOW_MS_KEY,
  gatewayBlockAlertSettingsService,
} from "../server/services/gateway-block-alert-settings-service";

const SETTING_KEYS = [
  GATEWAY_BLOCK_ALERT_THRESHOLD_KEY,
  GATEWAY_BLOCK_ALERT_WINDOW_MS_KEY,
  GATEWAY_BLOCK_ALERT_DEDUP_MS_KEY,
  GATEWAY_BLOCK_ALERT_RECOVERY_KEY,
];

const ENV_KEYS = [
  "GATEWAY_BLOCK_ALERT_THRESHOLD",
  "GATEWAY_BLOCK_ALERT_WINDOW_MS",
  "GATEWAY_BLOCK_ALERT_DEDUP_MS",
  "GATEWAY_BLOCK_ALERT_RECOVERY",
];

async function clearOurAlerts() {
  await db
    .delete(platformAlerts)
    .where(eq(platformAlerts.type, GATEWAY_BLOCK_ALERT_TYPE));
}

async function clearSettingRows() {
  await db
    .delete(systemSettings)
    .where(inArray(systemSettings.key, SETTING_KEYS));
}

async function openAlerts() {
  return db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, GATEWAY_BLOCK_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    );
}

describe("gateway block alert — admin threshold edits take effect live", () => {
  const savedEnv: Record<string, string | undefined> = {};
  let prevRows: Array<typeof systemSettings.$inferSelect> = [];

  before(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    prevRows = await db
      .select()
      .from(systemSettings)
      .where(inArray(systemSettings.key, SETTING_KEYS));
  });

  beforeEach(async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    await clearSettingRows();
    await clearOurAlerts();
    gatewayBlockAlertSettingsService.resetForTests();
    gatewayBlockAlertService.resetForTests();
    // Disable dedup so we can drive multiple storms in a single test
    // without the cooldown swallowing the second one.
    await gatewayBlockAlertSettingsService.setDedupMs(0, "test");
    // Recovery 0 — we don't exercise auto-resolve here.
    await gatewayBlockAlertSettingsService.setRecovery(0, "test");
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    await clearSettingRows();
    await clearOurAlerts();
    gatewayBlockAlertSettingsService.resetForTests();
    gatewayBlockAlertService.resetForTests();
  });

  after(async () => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    await clearSettingRows();
    for (const row of prevRows) {
      await db
        .insert(systemSettings)
        .values({ key: row.key, value: row.value, updatedBy: row.updatedBy ?? undefined })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: row.value, updatedBy: row.updatedBy ?? null, updatedAt: new Date() },
        });
    }
    gatewayBlockAlertSettingsService.resetForTests();
    gatewayBlockAlertService.resetForTests();
  });

  it("lowering the threshold via the settings service fires the alert at the new value on the very next event", async () => {
    await gatewayBlockAlertSettingsService.setThreshold(3, "admin_under_test");

    // Two blocks must NOT fire at threshold 3.
    await gatewayBlockAlertService.handleBlocked({
      platform: "youtube",
      connectorId: "conn_a",
      reason: "platform_token_missing",
    });
    await gatewayBlockAlertService.handleBlocked({
      platform: "youtube",
      connectorId: "conn_a",
      reason: "platform_token_missing",
    });
    assert.equal((await openAlerts()).length, 0, "alert must not fire below new threshold");

    // The third block crosses the freshly-set threshold and MUST fire,
    // with no server restart in between.
    await gatewayBlockAlertService.handleBlocked({
      platform: "youtube",
      connectorId: "conn_a",
      reason: "platform_token_missing",
    });
    const open = await openAlerts();
    assert.equal(open.length, 1, "next event after threshold edit must fire");
    const d = (open[0].details as Record<string, any>) ?? {};
    assert.equal(d.platform, "youtube");
    assert.equal(d.threshold, 3, "details.threshold must reflect the admin-edited value");
    assert.equal(d.blockedCount, 3);
  });

  it("raising the threshold mid-test means the next storm no longer opens an alert", async () => {
    // Start permissive so the first storm fires.
    await gatewayBlockAlertSettingsService.setThreshold(2, "admin_under_test");
    for (let i = 0; i < 2; i++) {
      await gatewayBlockAlertService.handleBlocked({
        platform: "facebook",
        connectorId: "fb_page_a",
        reason: "permissions_missing",
      });
    }
    assert.equal((await openAlerts()).length, 1, "low threshold should have fired");

    // Admin raises the threshold AND we clear the previous alert so we
    // can observe whether a second one opens. Reset per-platform state so
    // the rolling window starts fresh — otherwise the leftover counters
    // from the first storm would dominate the next decision.
    await clearOurAlerts();
    gatewayBlockAlertService.resetForTests();
    await gatewayBlockAlertSettingsService.setThreshold(50, "admin_under_test");

    // A second storm of the same size MUST NOT open a new alert because
    // the new threshold (50) is well above the count (5).
    for (let i = 0; i < 5; i++) {
      await gatewayBlockAlertService.handleBlocked({
        platform: "facebook",
        connectorId: "fb_page_a",
        reason: "permissions_missing",
      });
    }
    const open = await openAlerts();
    assert.equal(
      open.length,
      0,
      "after raising the threshold, the next storm must not fire an alert",
    );
  });

  it("clearOverrides falls back to env / default for the next event", async () => {
    // Admin had set a permissive threshold (50) and then clears all
    // overrides. The env var pins the fallback at 4 so we can assert
    // the alerter is back on env-driven config without restarting.
    await gatewayBlockAlertSettingsService.setThreshold(50, "admin_under_test");
    process.env.GATEWAY_BLOCK_ALERT_THRESHOLD = "4";
    await gatewayBlockAlertSettingsService.clearOverrides("admin_under_test");

    // Three blocks must NOT fire at env threshold 4.
    for (let i = 0; i < 3; i++) {
      await gatewayBlockAlertService.handleBlocked({
        platform: "telegram",
        connectorId: "tg_a",
        reason: "token_invalid",
      });
    }
    assert.equal(
      (await openAlerts()).length,
      0,
      "should not fire below env-fallback threshold",
    );

    // The fourth crosses the env-fallback threshold and MUST fire on
    // the very next event.
    await gatewayBlockAlertService.handleBlocked({
      platform: "telegram",
      connectorId: "tg_a",
      reason: "token_invalid",
    });
    const open = await openAlerts();
    assert.equal(open.length, 1, "env-fallback threshold must fire on the next event");
    const d = (open[0].details as Record<string, any>) ?? {};
    assert.equal(d.threshold, 4, "details.threshold must reflect the env fallback");
    assert.equal(d.platform, "telegram");
  });
});
