import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq, or } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import {
  AUDIENCE_AUDIT_TRAIL_ROW_CAP_SETTING_KEY,
  AUDIENCE_AUDIT_EXPORT_HISTORY_ROW_CAP_SETTING_KEY,
  DEFAULT_AUDIENCE_AUDIT_ROW_CAP,
  MAX_AUDIENCE_AUDIT_ROW_CAP,
  MIN_AUDIENCE_AUDIT_ROW_CAP,
  getAudienceAuditRowCap,
  getAudienceAuditRowCaps,
  setAudienceAuditRowCap,
} from "../server/services/audience-audit-export-row-cap-service";

async function clearSettings() {
  await db
    .delete(systemSettings)
    .where(
      or(
        eq(systemSettings.key, AUDIENCE_AUDIT_TRAIL_ROW_CAP_SETTING_KEY),
        eq(
          systemSettings.key,
          AUDIENCE_AUDIT_EXPORT_HISTORY_ROW_CAP_SETTING_KEY,
        ),
      ),
    );
}

beforeEach(async () => {
  await clearSettings();
});

test("get returns the default for both kinds when no row exists", async () => {
  const trail = await getAudienceAuditRowCap("trail");
  assert.equal(trail.rowCap, DEFAULT_AUDIENCE_AUDIT_ROW_CAP);
  assert.equal(trail.isDefault, true);
  assert.equal(trail.updatedAt, null);

  const history = await getAudienceAuditRowCap("history");
  assert.equal(history.rowCap, DEFAULT_AUDIENCE_AUDIT_ROW_CAP);
  assert.equal(history.isDefault, true);
});

test("set persists a custom cap and is read back from the DB", async () => {
  const after = await setAudienceAuditRowCap("trail", {
    rowCap: 250_000,
    updatedBy: "admin_a",
  });
  assert.equal(after.rowCap, 250_000);
  assert.equal(after.isDefault, false);
  assert.equal(after.updatedBy, "admin_a");

  const reloaded = await getAudienceAuditRowCap("trail");
  assert.equal(reloaded.rowCap, 250_000);
  assert.equal(reloaded.isDefault, false);
});

test("trail and history caps are independent", async () => {
  await setAudienceAuditRowCap("trail", {
    rowCap: 5_000,
    updatedBy: "admin_a",
  });
  await setAudienceAuditRowCap("history", {
    rowCap: 500_000,
    updatedBy: "admin_b",
  });
  const both = await getAudienceAuditRowCaps();
  assert.equal(both.trail.rowCap, 5_000);
  assert.equal(both.history.rowCap, 500_000);
  assert.equal(both.trail.updatedBy, "admin_a");
  assert.equal(both.history.updatedBy, "admin_b");
});

test("set with null resets to the default", async () => {
  await setAudienceAuditRowCap("history", {
    rowCap: 50_000,
    updatedBy: "admin_a",
  });
  const reset = await setAudienceAuditRowCap("history", {
    rowCap: null,
    updatedBy: "admin_b",
  });
  assert.equal(reset.rowCap, DEFAULT_AUDIENCE_AUDIT_ROW_CAP);
  assert.equal(reset.isDefault, true);
});

test("set clamps values below the minimum up to the minimum bound", async () => {
  const after = await setAudienceAuditRowCap("trail", {
    rowCap: 50,
    updatedBy: "admin_a",
  });
  assert.equal(after.rowCap, MIN_AUDIENCE_AUDIT_ROW_CAP);
});

test("set clamps values above the maximum down to the maximum bound", async () => {
  const after = await setAudienceAuditRowCap("history", {
    rowCap: 10_000_000,
    updatedBy: "admin_a",
  });
  assert.equal(after.rowCap, MAX_AUDIENCE_AUDIT_ROW_CAP);
});

test("set floors fractional caps", async () => {
  const after = await setAudienceAuditRowCap("trail", {
    rowCap: 12345.78,
    updatedBy: "admin_a",
  });
  assert.equal(after.rowCap, 12345);
});

test("set falls back to the default for NaN / non-finite inputs", async () => {
  const after = await setAudienceAuditRowCap("history", {
    rowCap: Number.NaN,
    updatedBy: "admin_a",
  });
  assert.equal(after.rowCap, DEFAULT_AUDIENCE_AUDIT_ROW_CAP);
});

test("smoke: changing the trail cap shifts the truncation boundary used by the export route", async () => {
  // The route logic reads the configured trail cap and passes it
  // straight through to `omniChannelAudienceSafetyService.exportAuditTrail`
  // as the per-section `limit`. This smoke test exercises that read
  // path with three configurations (default / lowered / raised /
  // reset) and asserts the cap the route would apply changes
  // accordingly — which is the same value the response envelope
  // surfaces as `rowCap` and that the service uses to compute
  // `truncated:true`.
  const defaultCap = await getAudienceAuditRowCap("trail");
  assert.equal(defaultCap.rowCap, DEFAULT_AUDIENCE_AUDIT_ROW_CAP);

  await setAudienceAuditRowCap("trail", {
    rowCap: 2_500,
    updatedBy: "incident_responder",
  });
  const lowered = await getAudienceAuditRowCap("trail");
  assert.equal(lowered.rowCap, 2_500);
  assert.equal(lowered.isDefault, false);

  await setAudienceAuditRowCap("trail", {
    rowCap: 750_000,
    updatedBy: "subpoena_lead",
  });
  const raised = await getAudienceAuditRowCap("trail");
  assert.equal(raised.rowCap, 750_000);
  assert.equal(raised.isDefault, false);

  await setAudienceAuditRowCap("trail", {
    rowCap: null,
    updatedBy: "cleanup_bot",
  });
  const resetBack = await getAudienceAuditRowCap("trail");
  assert.equal(resetBack.rowCap, DEFAULT_AUDIENCE_AUDIT_ROW_CAP);
  assert.equal(resetBack.isDefault, true);
});
