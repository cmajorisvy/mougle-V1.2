/**
 * Task #574 — Saved compliance audit filter presets.
 *
 * Verifies the filter-preset store backing the audit-export history panel:
 *   - Round-trip (save → list → delete) and createdBy capture.
 *   - Validation (name required, all-empty filters rejected, bad date /
 *     recipient rejected, duplicate-name rejected case-insensitively,
 *     max-count enforced).
 *   - Recipient normalization (trim + lowercase) so the same inbox cannot
 *     be saved twice as "Q3 Audit" with mixed-case email shadows.
 *   - Corrupt `system_settings` row falls back to [] instead of throwing.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import {
  AUDIENCE_AUDIT_HISTORY_EMAIL_FILTER_PRESETS_SETTING_KEY,
  FILTER_PRESET_MAX_COUNT,
  clearAudienceAuditHistoryEmailFilterPresetsForTests,
  deleteAudienceAuditHistoryEmailFilterPreset,
  listAudienceAuditHistoryEmailFilterPresets,
  saveAudienceAuditHistoryEmailFilterPreset,
  updateAudienceAuditHistoryEmailFilterPreset,
} from "../server/services/audience-audit-history-email-filter-presets-service";

beforeEach(async () => {
  await clearAudienceAuditHistoryEmailFilterPresetsForTests();
});

afterEach(async () => {
  await clearAudienceAuditHistoryEmailFilterPresetsForTests();
});

test("save → list → delete round-trip with createdBy", async () => {
  const saved = await saveAudienceAuditHistoryEmailFilterPreset({
    name: "Q3 2025 — audit@example.com",
    from: "2025-07-01",
    to: "2025-09-30",
    recipient: "Audit@Example.com",
    createdBy: "admin-1",
  });
  assert.ok(saved.id.startsWith("aud_hist_preset_"));
  assert.equal(saved.from, "2025-07-01");
  assert.equal(saved.to, "2025-09-30");
  assert.equal(saved.recipient, "audit@example.com");
  assert.equal(saved.createdBy, "admin-1");

  const listed = await listAudienceAuditHistoryEmailFilterPresets();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, saved.id);

  const del = await deleteAudienceAuditHistoryEmailFilterPreset(saved.id, "admin-2");
  assert.equal(del.deleted, true);

  const after = await listAudienceAuditHistoryEmailFilterPresets();
  assert.equal(after.length, 0);
});

test("rejects empty name, all-empty filters, bad date and bad recipient", async () => {
  await assert.rejects(
    () =>
      saveAudienceAuditHistoryEmailFilterPreset({
        name: "   ",
        from: "2025-01-01",
      }),
    /preset_name_required/,
  );
  await assert.rejects(
    () => saveAudienceAuditHistoryEmailFilterPreset({ name: "no filters" }),
    /preset_filters_required/,
  );
  await assert.rejects(
    () =>
      saveAudienceAuditHistoryEmailFilterPreset({
        name: "bad from",
        from: "07/01/2025",
      }),
    /preset_from_invalid/,
  );
  await assert.rejects(
    () =>
      saveAudienceAuditHistoryEmailFilterPreset({
        name: "bad to",
        to: "not-a-date",
      }),
    /preset_to_invalid/,
  );
  await assert.rejects(
    () =>
      saveAudienceAuditHistoryEmailFilterPreset({
        name: "bad recipient",
        recipient: "not-an-email",
      }),
    /preset_recipient_invalid/,
  );
});

test("rejects duplicate names case-insensitively", async () => {
  await saveAudienceAuditHistoryEmailFilterPreset({
    name: "Q3 2025",
    from: "2025-07-01",
  });
  await assert.rejects(
    () =>
      saveAudienceAuditHistoryEmailFilterPreset({
        name: "q3 2025",
        recipient: "audit@example.com",
      }),
    /preset_name_duplicate/,
  );
});

test("enforces the max-count cap", async () => {
  for (let i = 0; i < FILTER_PRESET_MAX_COUNT; i++) {
    await saveAudienceAuditHistoryEmailFilterPreset({
      name: `Preset ${i}`,
      from: "2025-01-01",
    });
  }
  await assert.rejects(
    () =>
      saveAudienceAuditHistoryEmailFilterPreset({
        name: "one too many",
        from: "2025-01-01",
      }),
    /preset_limit_reached/,
  );
});

test("delete of unknown id is a no-op", async () => {
  const result = await deleteAudienceAuditHistoryEmailFilterPreset("missing-id");
  assert.equal(result.deleted, false);
});

test("corrupt system_settings row falls back to empty list, not a throw", async () => {
  await db.insert(systemSettings).values({
    key: AUDIENCE_AUDIT_HISTORY_EMAIL_FILTER_PRESETS_SETTING_KEY,
    value: "{not json",
  });
  const presets = await listAudienceAuditHistoryEmailFilterPresets();
  assert.deepEqual(presets, []);

  // And the next save should still succeed (overwriting the bad row).
  const saved = await saveAudienceAuditHistoryEmailFilterPreset({
    name: "recovery",
    from: "2025-01-01",
  });
  assert.ok(saved.id);
  const after = await listAudienceAuditHistoryEmailFilterPresets();
  assert.equal(after.length, 1);
});

// Task #624 — edit/rename in place.
test("update renames and changes filters while preserving id + createdAt", async () => {
  const saved = await saveAudienceAuditHistoryEmailFilterPreset({
    name: "Q3 2025",
    from: "2025-07-01",
    to: "2025-09-30",
    createdBy: "admin-1",
  });
  const originalCreatedAt = saved.createdAt;

  const updated = await updateAudienceAuditHistoryEmailFilterPreset(saved.id, {
    name: "Q3 2025 — audit@example.com",
    from: "2025-07-15",
    to: "2025-10-15",
    recipient: "Audit@Example.com",
    updatedBy: "admin-2",
  });
  assert.equal(updated.id, saved.id);
  assert.equal(updated.createdAt, originalCreatedAt);
  assert.equal(updated.createdBy, "admin-1");
  assert.equal(updated.name, "Q3 2025 — audit@example.com");
  assert.equal(updated.from, "2025-07-15");
  assert.equal(updated.to, "2025-10-15");
  assert.equal(updated.recipient, "audit@example.com");

  const listed = await listAudienceAuditHistoryEmailFilterPresets();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, "Q3 2025 — audit@example.com");
});

test("update with partial input leaves untouched fields alone", async () => {
  const saved = await saveAudienceAuditHistoryEmailFilterPreset({
    name: "Original",
    from: "2025-01-01",
    to: "2025-03-31",
    recipient: "audit@example.com",
  });
  const updated = await updateAudienceAuditHistoryEmailFilterPreset(saved.id, {
    name: "Renamed",
  });
  assert.equal(updated.name, "Renamed");
  assert.equal(updated.from, "2025-01-01");
  assert.equal(updated.to, "2025-03-31");
  assert.equal(updated.recipient, "audit@example.com");
});

test("update validation mirrors save: empty name, all-empty filters, bad date, bad recipient", async () => {
  const saved = await saveAudienceAuditHistoryEmailFilterPreset({
    name: "Base",
    from: "2025-01-01",
  });
  await assert.rejects(
    () => updateAudienceAuditHistoryEmailFilterPreset(saved.id, { name: "   " }),
    /preset_name_required/,
  );
  await assert.rejects(
    () =>
      updateAudienceAuditHistoryEmailFilterPreset(saved.id, {
        from: null,
        to: null,
        recipient: null,
      }),
    /preset_filters_required/,
  );
  await assert.rejects(
    () =>
      updateAudienceAuditHistoryEmailFilterPreset(saved.id, {
        from: "07/01/2025",
      }),
    /preset_from_invalid/,
  );
  await assert.rejects(
    () =>
      updateAudienceAuditHistoryEmailFilterPreset(saved.id, {
        to: "not-a-date",
      }),
    /preset_to_invalid/,
  );
  await assert.rejects(
    () =>
      updateAudienceAuditHistoryEmailFilterPreset(saved.id, {
        recipient: "not-an-email",
      }),
    /preset_recipient_invalid/,
  );
});

test("update rejects duplicate name (case-insensitive) of a different preset, allows same-id rename to same name", async () => {
  const a = await saveAudienceAuditHistoryEmailFilterPreset({
    name: "Q3 2025",
    from: "2025-07-01",
  });
  await saveAudienceAuditHistoryEmailFilterPreset({
    name: "Q4 2025",
    from: "2025-10-01",
  });
  await assert.rejects(
    () =>
      updateAudienceAuditHistoryEmailFilterPreset(a.id, { name: "q4 2025" }),
    /preset_name_duplicate/,
  );
  // Renaming to its own current name (case-insensitive same) is allowed.
  const same = await updateAudienceAuditHistoryEmailFilterPreset(a.id, {
    name: "q3 2025",
  });
  assert.equal(same.id, a.id);
  assert.equal(same.name, "q3 2025");
});

test("update of unknown id throws preset_not_found", async () => {
  await assert.rejects(
    () =>
      updateAudienceAuditHistoryEmailFilterPreset("does-not-exist", {
        name: "x",
      }),
    /preset_not_found/,
  );
});

test("list is sorted alphabetically by name", async () => {
  await saveAudienceAuditHistoryEmailFilterPreset({
    name: "Zebra audit",
    from: "2025-01-01",
  });
  await saveAudienceAuditHistoryEmailFilterPreset({
    name: "alpha audit",
    from: "2025-01-01",
  });
  const listed = await listAudienceAuditHistoryEmailFilterPresets();
  assert.deepEqual(
    listed.map((p) => p.name),
    ["alpha audit", "Zebra audit"],
  );
});
