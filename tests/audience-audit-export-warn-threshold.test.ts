import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import {
  AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD_SETTING_KEY,
  DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD,
  getAudienceAuditExportWarnThreshold,
  setAudienceAuditExportWarnThreshold,
} from "../server/services/audience-audit-export-warn-threshold-service";

async function clearSetting() {
  await db
    .delete(systemSettings)
    .where(
      eq(
        systemSettings.key,
        AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD_SETTING_KEY,
      ),
    );
}

beforeEach(async () => {
  await clearSetting();
});

test("get returns the default when no row exists", async () => {
  const cfg = await getAudienceAuditExportWarnThreshold();
  assert.equal(cfg.threshold, DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD);
  assert.equal(cfg.isDefault, true);
  assert.equal(cfg.updatedAt, null);
  assert.equal(cfg.updatedBy, null);
});

test("set persists a custom threshold and is read back from the DB", async () => {
  const after = await setAudienceAuditExportWarnThreshold({
    threshold: 25000,
    updatedBy: "admin_a",
  });
  assert.equal(after.threshold, 25000);
  assert.equal(after.isDefault, false);
  assert.equal(after.updatedBy, "admin_a");

  const reloaded = await getAudienceAuditExportWarnThreshold();
  assert.equal(reloaded.threshold, 25000);
  assert.equal(reloaded.isDefault, false);
  assert.equal(reloaded.updatedBy, "admin_a");
});

test("set with null resets to the default", async () => {
  await setAudienceAuditExportWarnThreshold({
    threshold: 5000,
    updatedBy: "admin_a",
  });
  const reset = await setAudienceAuditExportWarnThreshold({
    threshold: null,
    updatedBy: "admin_b",
  });
  assert.equal(reset.threshold, DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD);
  assert.equal(reset.isDefault, true);
  assert.equal(reset.updatedBy, "admin_b");
});

test("set with 0 disables the warning entirely", async () => {
  const after = await setAudienceAuditExportWarnThreshold({
    threshold: 0,
    updatedBy: "admin_a",
  });
  assert.equal(after.threshold, 0);
  assert.equal(after.isDefault, false);
});

test("set clamps negatives and non-finite values to the default", async () => {
  const neg = await setAudienceAuditExportWarnThreshold({
    threshold: -500,
    updatedBy: "admin_a",
  });
  assert.equal(neg.threshold, DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD);

  const nan = await setAudienceAuditExportWarnThreshold({
    threshold: Number.NaN,
    updatedBy: "admin_a",
  });
  assert.equal(nan.threshold, DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD);
});

test("set floors fractional thresholds", async () => {
  const after = await setAudienceAuditExportWarnThreshold({
    threshold: 12345.78,
    updatedBy: "admin_a",
  });
  assert.equal(after.threshold, 12345);
});

test("two callers writing in sequence — last write wins (team-wide)", async () => {
  await setAudienceAuditExportWarnThreshold({
    threshold: 7500,
    updatedBy: "admin_a",
  });
  const second = await setAudienceAuditExportWarnThreshold({
    threshold: 15000,
    updatedBy: "admin_b",
  });
  assert.equal(second.threshold, 15000);
  assert.equal(second.updatedBy, "admin_b");

  const reloaded = await getAudienceAuditExportWarnThreshold();
  assert.equal(reloaded.threshold, 15000);
  assert.equal(reloaded.updatedBy, "admin_b");
});
