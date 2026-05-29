/**
 * Task #420 — `gatewayBlockAlertSettingsService`.
 *
 * Locks in the resolution order (cached DB → env → default), the
 * guardrails on `setThreshold` / `setWindowMs` / `setDedupMs` /
 * `setRecovery`, the "derive from threshold / 2" semantics, and the
 * `clearOverrides` reset path.
 */

import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "../shared/schema";
import {
  GATEWAY_BLOCK_ALERT_DEDUP_MS_KEY,
  GATEWAY_BLOCK_ALERT_DEFAULTS,
  GATEWAY_BLOCK_ALERT_RECOVERY_KEY,
  GATEWAY_BLOCK_ALERT_THRESHOLD_KEY,
  GATEWAY_BLOCK_ALERT_WINDOW_MS_KEY,
  gatewayBlockAlertSettingsService,
} from "../server/services/gateway-block-alert-settings-service";

const ALL_KEYS = [
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

async function clearDbRows() {
  await db.delete(systemSettings).where(inArray(systemSettings.key, ALL_KEYS));
}

describe("gatewayBlockAlertSettingsService", () => {
  const savedEnv: Record<string, string | undefined> = {};
  let prevRows: Array<typeof systemSettings.$inferSelect> = [];

  before(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    prevRows = await db.select().from(systemSettings).where(inArray(systemSettings.key, ALL_KEYS));
  });

  beforeEach(async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    await clearDbRows();
    gatewayBlockAlertSettingsService.resetForTests();
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    await clearDbRows();
    gatewayBlockAlertSettingsService.resetForTests();
  });

  after(async () => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] == null) delete process.env[k];
      else process.env[k] = savedEnv[k] as string;
    }
    await clearDbRows();
    for (const row of prevRows) {
      await db
        .insert(systemSettings)
        .values({ key: row.key, value: row.value, updatedBy: row.updatedBy ?? undefined })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: row.value, updatedBy: row.updatedBy ?? undefined, updatedAt: row.updatedAt ?? new Date() },
        });
    }
    gatewayBlockAlertSettingsService.resetForTests();
  });

  it("falls back to platform defaults when nothing is configured", async () => {
    await gatewayBlockAlertSettingsService.ensureCacheLoaded();
    assert.equal(gatewayBlockAlertSettingsService.getThresholdSync(), GATEWAY_BLOCK_ALERT_DEFAULTS.threshold);
    assert.equal(gatewayBlockAlertSettingsService.getWindowMsSync(), GATEWAY_BLOCK_ALERT_DEFAULTS.windowMs);
    assert.equal(gatewayBlockAlertSettingsService.getDedupMsSync(), GATEWAY_BLOCK_ALERT_DEFAULTS.dedupMs);
    assert.equal(
      gatewayBlockAlertSettingsService.getEffectiveRecoverySync(),
      Math.floor(GATEWAY_BLOCK_ALERT_DEFAULTS.threshold / 2),
    );
    const status = await gatewayBlockAlertSettingsService.getStatus();
    assert.equal(status.thresholdSource, "default");
    assert.equal(status.recoveryIsDerived, true);
  });

  it("honours env vars when no DB override exists", async () => {
    process.env.GATEWAY_BLOCK_ALERT_THRESHOLD = "25";
    process.env.GATEWAY_BLOCK_ALERT_WINDOW_MS = "30000";
    process.env.GATEWAY_BLOCK_ALERT_DEDUP_MS = "600000";
    process.env.GATEWAY_BLOCK_ALERT_RECOVERY = "3";
    await gatewayBlockAlertSettingsService.ensureCacheLoaded();
    assert.equal(gatewayBlockAlertSettingsService.getThresholdSync(), 25);
    assert.equal(gatewayBlockAlertSettingsService.getWindowMsSync(), 30_000);
    assert.equal(gatewayBlockAlertSettingsService.getDedupMsSync(), 600_000);
    assert.equal(gatewayBlockAlertSettingsService.getEffectiveRecoverySync(), 3);
    const status = await gatewayBlockAlertSettingsService.getStatus();
    assert.equal(status.thresholdSource, "env");
    assert.equal(status.recoverySource, "env");
    assert.equal(status.recoveryIsDerived, false);
  });

  it("DB override beats env var", async () => {
    process.env.GATEWAY_BLOCK_ALERT_THRESHOLD = "25";
    await gatewayBlockAlertSettingsService.setThreshold(7, "test-admin");
    assert.equal(gatewayBlockAlertSettingsService.getThresholdSync(), 7);
    const status = await gatewayBlockAlertSettingsService.getStatus();
    assert.equal(status.threshold, 7);
    assert.equal(status.thresholdSource, "db");
    assert.equal(status.envFallback.threshold, 25);
  });

  it("setRecovery(null) persists an explicit 'derive' choice", async () => {
    process.env.GATEWAY_BLOCK_ALERT_RECOVERY = "99";
    await gatewayBlockAlertSettingsService.setThreshold(20);
    await gatewayBlockAlertSettingsService.setRecovery(null, "test-admin");
    // 99 from env must be ignored: the DB row exists and pins to derive.
    assert.equal(gatewayBlockAlertSettingsService.getEffectiveRecoverySync(), 10);
    const status = await gatewayBlockAlertSettingsService.getStatus();
    assert.equal(status.recoveryIsDerived, true);
    assert.equal(status.recoverySource, "db");
  });

  it("setRecovery(number) is honoured even when env is set", async () => {
    process.env.GATEWAY_BLOCK_ALERT_RECOVERY = "99";
    await gatewayBlockAlertSettingsService.setRecovery(4, "test-admin");
    assert.equal(gatewayBlockAlertSettingsService.getEffectiveRecoverySync(), 4);
  });

  it("rejects values outside the documented limits", async () => {
    await assert.rejects(() => gatewayBlockAlertSettingsService.setThreshold(0), /out_of_range/);
    await assert.rejects(() => gatewayBlockAlertSettingsService.setThreshold(10_000), /out_of_range/);
    await assert.rejects(() => gatewayBlockAlertSettingsService.setWindowMs(100), /out_of_range/);
    await assert.rejects(
      () => gatewayBlockAlertSettingsService.setDedupMs(-1),
      /out_of_range/,
    );
    await assert.rejects(
      () => gatewayBlockAlertSettingsService.setRecovery(10_000),
      /out_of_range/,
    );
    await assert.rejects(() => gatewayBlockAlertSettingsService.setThreshold(Number.NaN), /invalid_value/);
  });

  it("clearOverrides drops every DB row and reverts to env / default", async () => {
    await gatewayBlockAlertSettingsService.setThreshold(7);
    await gatewayBlockAlertSettingsService.setWindowMs(45_000);
    await gatewayBlockAlertSettingsService.setDedupMs(120_000);
    await gatewayBlockAlertSettingsService.setRecovery(2);

    await gatewayBlockAlertSettingsService.clearOverrides("test-admin");
    const status = await gatewayBlockAlertSettingsService.getStatus();
    assert.equal(status.thresholdSource, "default");
    assert.equal(status.windowMsSource, "default");
    assert.equal(status.dedupMsSource, "default");
    assert.equal(status.recoverySource, "default");
    assert.equal(status.threshold, GATEWAY_BLOCK_ALERT_DEFAULTS.threshold);
    assert.equal(status.recoveryIsDerived, true);

    const remaining = await db
      .select()
      .from(systemSettings)
      .where(inArray(systemSettings.key, ALL_KEYS));
    assert.equal(remaining.length, 0);
  });

  it("cache primes from DB so sync getters see admin overrides after a 'restart'", async () => {
    await gatewayBlockAlertSettingsService.setThreshold(13);
    // Simulate a fresh process boot: drop the in-memory cache and re-prime.
    gatewayBlockAlertSettingsService.resetForTests();
    await gatewayBlockAlertSettingsService.ensureCacheLoaded();
    assert.equal(gatewayBlockAlertSettingsService.getThresholdSync(), 13);
  });
});
