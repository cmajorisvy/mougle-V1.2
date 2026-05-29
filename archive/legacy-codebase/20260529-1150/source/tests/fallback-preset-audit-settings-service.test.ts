/**
 * Task #333 — Unit coverage for `fallbackPresetAuditSettingsService`.
 *
 * Locks in the resolution order documented in the service:
 *   cached DB value → env var → platform default
 *
 * plus the guardrails on `setAuditMaxBytes` / `setAuditMaxArchives` so a
 * future tweak can't silently allow an unbounded or single-byte audit log.
 */

import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "../shared/schema";
import {
  FALLBACK_PRESET_AUDIT_LIMITS,
  fallbackPresetAuditSettingsService,
} from "../server/services/fallback-preset-audit-settings-service";

const BYTES_KEY = "fallback_preset_audit_max_bytes";
const ARCHIVES_KEY = "fallback_preset_audit_max_archives";
const ENV_BYTES = "FALLBACK_PRESET_AUDIT_MAX_BYTES";
const ENV_ARCHIVES = "FALLBACK_PRESET_AUDIT_MAX_ARCHIVES";

function resetServiceCache() {
  const s = fallbackPresetAuditSettingsService as any;
  s.cachedAuditMaxBytes = null;
  s.cachedAuditMaxArchives = null;
  s.auditCacheLoadPromise = null;
}

async function clearDbRows() {
  await db
    .delete(systemSettings)
    .where(inArray(systemSettings.key, [BYTES_KEY, ARCHIVES_KEY]));
}

describe("fallbackPresetAuditSettingsService", () => {
  let prevEnvBytes: string | undefined;
  let prevEnvArchives: string | undefined;
  let prevRows: Array<typeof systemSettings.$inferSelect> = [];

  before(async () => {
    prevEnvBytes = process.env[ENV_BYTES];
    prevEnvArchives = process.env[ENV_ARCHIVES];
    prevRows = await db
      .select()
      .from(systemSettings)
      .where(inArray(systemSettings.key, [BYTES_KEY, ARCHIVES_KEY]));
  });

  beforeEach(async () => {
    delete process.env[ENV_BYTES];
    delete process.env[ENV_ARCHIVES];
    await clearDbRows();
    resetServiceCache();
  });

  afterEach(async () => {
    delete process.env[ENV_BYTES];
    delete process.env[ENV_ARCHIVES];
    await clearDbRows();
    resetServiceCache();
  });

  after(async () => {
    if (prevEnvBytes === undefined) delete process.env[ENV_BYTES];
    else process.env[ENV_BYTES] = prevEnvBytes;
    if (prevEnvArchives === undefined) delete process.env[ENV_ARCHIVES];
    else process.env[ENV_ARCHIVES] = prevEnvArchives;
    await clearDbRows();
    if (prevRows.length > 0) {
      await db.insert(systemSettings).values(prevRows);
    }
    resetServiceCache();
  });

  it("falls back to platform defaults when neither DB nor env is set", async () => {
    const status = await fallbackPresetAuditSettingsService.getStatus();
    assert.equal(status.auditMaxBytes, FALLBACK_PRESET_AUDIT_LIMITS.bytesDefault);
    assert.equal(
      status.auditMaxArchives,
      FALLBACK_PRESET_AUDIT_LIMITS.archivesDefault,
    );
    assert.equal(status.auditMaxBytesSource, "default");
    assert.equal(status.auditMaxArchivesSource, "default");
  });

  it("env var wins over default when DB has no row", async () => {
    process.env[ENV_BYTES] = "262144"; // 256 KiB
    process.env[ENV_ARCHIVES] = "7";
    const status = await fallbackPresetAuditSettingsService.getStatus();
    assert.equal(status.auditMaxBytes, 262144);
    assert.equal(status.auditMaxArchives, 7);
    assert.equal(status.auditMaxBytesSource, "env");
    assert.equal(status.auditMaxArchivesSource, "env");
  });

  it("DB value wins over env and default", async () => {
    process.env[ENV_BYTES] = "262144";
    process.env[ENV_ARCHIVES] = "7";
    await fallbackPresetAuditSettingsService.setAuditMaxBytes(524288, "tester");
    await fallbackPresetAuditSettingsService.setAuditMaxArchives(9, "tester");

    // Force a fresh load to confirm the cache reloads from the DB rather
    // than carrying the just-set value in memory only.
    resetServiceCache();

    const status = await fallbackPresetAuditSettingsService.getStatus();
    assert.equal(status.auditMaxBytes, 524288);
    assert.equal(status.auditMaxArchives, 9);
    assert.equal(status.auditMaxBytesSource, "db");
    assert.equal(status.auditMaxArchivesSource, "db");
  });

  it("rejects out-of-range maxBytes (below min, above max, NaN)", async () => {
    await assert.rejects(
      () =>
        fallbackPresetAuditSettingsService.setAuditMaxBytes(
          FALLBACK_PRESET_AUDIT_LIMITS.bytesMin - 1,
        ),
      /out_of_range/,
    );
    await assert.rejects(
      () =>
        fallbackPresetAuditSettingsService.setAuditMaxBytes(
          FALLBACK_PRESET_AUDIT_LIMITS.bytesMax + 1,
        ),
      /out_of_range/,
    );
    await assert.rejects(
      () => fallbackPresetAuditSettingsService.setAuditMaxBytes(Number.NaN),
      /invalid_value/,
    );

    // Nothing should have been persisted.
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, BYTES_KEY));
    assert.equal(rows.length, 0);
  });

  it("rejects out-of-range maxArchives (below min, above max, NaN)", async () => {
    await assert.rejects(
      () =>
        fallbackPresetAuditSettingsService.setAuditMaxArchives(
          FALLBACK_PRESET_AUDIT_LIMITS.archivesMin - 1,
        ),
      /out_of_range/,
    );
    await assert.rejects(
      () =>
        fallbackPresetAuditSettingsService.setAuditMaxArchives(
          FALLBACK_PRESET_AUDIT_LIMITS.archivesMax + 1,
        ),
      /out_of_range/,
    );
    await assert.rejects(
      () => fallbackPresetAuditSettingsService.setAuditMaxArchives(Number.NaN),
      /invalid_value/,
    );

    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, ARCHIVES_KEY));
    assert.equal(rows.length, 0);
  });

  it("ignores DB rows whose stored value is outside guardrails", async () => {
    // Insert a junk row directly (bypassing the setter) to simulate a
    // stale/corrupt value. The cache loader should refuse it and the
    // sync getter should fall back to the env (or default).
    await db.insert(systemSettings).values({
      key: BYTES_KEY,
      value: String(FALLBACK_PRESET_AUDIT_LIMITS.bytesMax + 1000),
      updatedBy: "test-corrupt",
    });
    await db.insert(systemSettings).values({
      key: ARCHIVES_KEY,
      value: "0",
      updatedBy: "test-corrupt",
    });
    resetServiceCache();

    const status = await fallbackPresetAuditSettingsService.getStatus();
    assert.equal(status.auditMaxBytes, FALLBACK_PRESET_AUDIT_LIMITS.bytesDefault);
    assert.equal(
      status.auditMaxArchives,
      FALLBACK_PRESET_AUDIT_LIMITS.archivesDefault,
    );
    assert.equal(status.auditMaxBytesSource, "default");
    assert.equal(status.auditMaxArchivesSource, "default");
  });
});
