/**
 * Task #334 — Lock in the "zero archives is not honoured" decision for
 * the three audit-retention services (cover sweep, media sweep, and
 * fallback-preset audit).
 *
 * The legacy env vars (`COVER_SWEEP_AUDIT_MAX_ARCHIVES`,
 * `MEDIA_SWEEP_AUDIT_MAX_ARCHIVES`, `FALLBACK_PRESET_AUDIT_MAX_ARCHIVES`)
 * used to treat `0` as "rotate and immediately delete". The new
 * DB-backed settings enforce a minimum of 1, and the env-parsing helper
 * silently coerces `0` (and any non-positive value) to "unset" so that
 * upgraded deployments fall through to the platform default of 4 rather
 * than the new minimum of 1.
 *
 * This test guards both halves of that contract:
 *   - env=0 → sync getter returns the platform default (4), not 1.
 *   - env=0 → source reports "default", not "env".
 *
 * It does NOT touch the database; the cached DB value stays null in
 * fresh service instances, so the sync getter resolves env → default.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { coverOrphanAlertService } from "../server/services/cover-orphan-alert-service";
import { mediaOrphanAlertService } from "../server/services/media-orphan-alert-service";
import { fallbackPresetAuditSettingsService } from "../server/services/fallback-preset-audit-settings-service";

const ENV_KEYS = [
  "COVER_SWEEP_AUDIT_MAX_ARCHIVES",
  "MEDIA_SWEEP_AUDIT_MAX_ARCHIVES",
  "FALLBACK_PRESET_AUDIT_MAX_ARCHIVES",
] as const;

const PLATFORM_DEFAULT_ARCHIVES = 4;

describe("Task #334 — zero archives is not honoured", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
    {};

  before(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });

  after(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  });

  it("cover sweep: env=0 falls through to platform default (4), not minimum (1)", () => {
    process.env.COVER_SWEEP_AUDIT_MAX_ARCHIVES = "0";
    assert.equal(
      coverOrphanAlertService.getAuditMaxArchivesSync(),
      PLATFORM_DEFAULT_ARCHIVES,
    );
    assert.equal(coverOrphanAlertService.getAuditMaxArchivesSource(), "default");
  });

  it("media sweep: env=0 falls through to platform default (4), not minimum (1)", () => {
    process.env.MEDIA_SWEEP_AUDIT_MAX_ARCHIVES = "0";
    assert.equal(
      mediaOrphanAlertService.getAuditMaxArchivesSync(),
      PLATFORM_DEFAULT_ARCHIVES,
    );
    assert.equal(mediaOrphanAlertService.getAuditMaxArchivesSource(), "default");
  });

  it("fallback preset audit: env=0 falls through to platform default (4), not minimum (1)", () => {
    process.env.FALLBACK_PRESET_AUDIT_MAX_ARCHIVES = "0";
    assert.equal(
      fallbackPresetAuditSettingsService.getAuditMaxArchivesSync(),
      PLATFORM_DEFAULT_ARCHIVES,
    );
    assert.equal(
      fallbackPresetAuditSettingsService.getAuditMaxArchivesSource(),
      "default",
    );
  });

  it("negative values are also treated as unset (defence-in-depth)", () => {
    process.env.COVER_SWEEP_AUDIT_MAX_ARCHIVES = "-3";
    assert.equal(
      coverOrphanAlertService.getAuditMaxArchivesSync(),
      PLATFORM_DEFAULT_ARCHIVES,
    );
    assert.equal(coverOrphanAlertService.getAuditMaxArchivesSource(), "default");
  });

  it("setAuditMaxArchives rejects 0 with out_of_range", async () => {
    await assert.rejects(
      () => coverOrphanAlertService.setAuditMaxArchives(0),
      /out_of_range/,
    );
    await assert.rejects(
      () => mediaOrphanAlertService.setAuditMaxArchives(0),
      /out_of_range/,
    );
    await assert.rejects(
      () => fallbackPresetAuditSettingsService.setAuditMaxArchives(0),
      /out_of_range/,
    );
  });
});
