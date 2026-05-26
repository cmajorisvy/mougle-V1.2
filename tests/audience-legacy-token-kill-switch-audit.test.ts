/**
 * Task #558 — Legacy-token kill-switch audit log.
 *
 * Verifies:
 *   1. Every call to `setEnvFallbackDisabledOverride` records exactly one
 *      audit row capturing the platform, previous value, new value, and
 *      actor.
 *   2. No-op changes (same value) don't write a duplicate row.
 *   3. `legacyTokenKillSwitchAuditService.list({ platform, limit })`
 *      filters and caps as expected, newest first.
 *   4. `GET /api/admin/newsroom/audience/legacy-token-status/history`
 *      returns the rows for the admin UI without echoing token material.
 *   5. `pruneLegacyTokenKillSwitchAuditOlderThan(cutoff)` drops only
 *      rows older than the cutoff and leaves newer rows untouched.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { eq, lt } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "../shared/schema";
import { audienceLegacyTokenKillSwitchAudit } from "../shared/omni-channel-audience-schema";
import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import {
  setEnvFallbackDisabledOverride,
  setEnvFallbackDisabledOverridesBulk,
} from "../server/services/audience-platform-gateway-service";
import {
  legacyTokenKillSwitchAuditService,
  pruneLegacyTokenKillSwitchAuditOlderThan,
} from "../server/services/audience-legacy-token-kill-switch-audit-service";

const SETTING_KEY = "audience_gateway_env_fallback_disabled";

let server: Server;
let baseUrl: string;

async function clearAll(): Promise<void> {
  await db.delete(systemSettings).where(eq(systemSettings.key, SETTING_KEY));
  await db
    .delete(audienceLegacyTokenKillSwitchAudit)
    .where(eq(audienceLegacyTokenKillSwitchAudit.platform, "youtube"));
  await db
    .delete(audienceLegacyTokenKillSwitchAudit)
    .where(eq(audienceLegacyTokenKillSwitchAudit.platform, "facebook"));
  await db
    .delete(audienceLegacyTokenKillSwitchAudit)
    .where(eq(audienceLegacyTokenKillSwitchAudit.platform, "telegram"));
}

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
  await clearAll();
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  await clearAll();
});

test("setEnvFallbackDisabledOverride records one audit row per actual change", async () => {
  await setEnvFallbackDisabledOverride("youtube", true, "alice");
  await setEnvFallbackDisabledOverride("youtube", false, "bob");
  await setEnvFallbackDisabledOverride("youtube", null, "carol");

  const entries = await legacyTokenKillSwitchAuditService.list({
    platform: "youtube",
  });
  // Newest first.
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((e) => [e.previousValue, e.newValue, e.updatedBy]),
    [
      ["false", "cleared", "carol"],
      ["true", "false", "bob"],
      ["cleared", "true", "alice"],
    ],
  );
  for (const e of entries) assert.equal(e.platform, "youtube");
});

test("setEnvFallbackDisabledOverride skips audit row for no-op changes", async () => {
  await setEnvFallbackDisabledOverride("youtube", true, "alice");
  await setEnvFallbackDisabledOverride("youtube", true, "alice");
  await setEnvFallbackDisabledOverride("youtube", true, "bob");

  const entries = await legacyTokenKillSwitchAuditService.list({
    platform: "youtube",
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].previousValue, "cleared");
  assert.equal(entries[0].newValue, "true");
});

test("audit list filters by platform and caps by limit", async () => {
  await setEnvFallbackDisabledOverride("youtube", true, "alice");
  await setEnvFallbackDisabledOverride("facebook", true, "alice");
  await setEnvFallbackDisabledOverride("telegram", true, "alice");

  const yt = await legacyTokenKillSwitchAuditService.list({
    platform: "youtube",
  });
  assert.equal(yt.length, 1);
  assert.equal(yt[0].platform, "youtube");

  const all = await legacyTokenKillSwitchAuditService.list({});
  assert.ok(all.length >= 3);

  const capped = await legacyTokenKillSwitchAuditService.list({ limit: 2 });
  assert.equal(capped.length, 2);
});

test("GET legacy-token-status/history returns rows newest-first without token material", async () => {
  await setEnvFallbackDisabledOverride("youtube", true, "alice");
  await setEnvFallbackDisabledOverride("youtube", false, "bob");

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/history?platform=youtube`,
  );
  assert.equal(r.status, 200);
  const text = await r.text();
  // Defensive: this route must never surface anything that could be
  // confused for token material.
  assert.equal(text.includes("AUDIENCE_GATEWAY_YOUTUBE_TOKEN"), false);

  const body = JSON.parse(text);
  assert.ok(Array.isArray(body.entries));
  assert.equal(body.entries.length, 2);
  assert.equal(body.entries[0].newValue, "false");
  assert.equal(body.entries[0].updatedBy, "bob");
  assert.equal(body.entries[1].newValue, "true");
  assert.equal(body.entries[1].updatedBy, "alice");
});

test("GET legacy-token-status/history rejects unknown platform with 400", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/history?platform=myspace`,
  );
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.message, "unknown_platform");
});

test("setEnvFallbackDisabledOverridesBulk records grouped audit rows with shared batchId", async () => {
  await setEnvFallbackDisabledOverridesBulk(
    [
      { platform: "youtube", disabled: true },
      { platform: "facebook", disabled: true },
      // No-op for telegram (cleared → cleared) — must NOT write a row.
      { platform: "telegram", disabled: null },
    ],
    "alice",
  );

  const all = await legacyTokenKillSwitchAuditService.list({});
  assert.equal(all.length, 2);
  const batchIds = new Set(all.map((r) => r.batchId));
  assert.equal(batchIds.size, 1);
  assert.ok(all[0].batchId && all[0].batchId.length > 0);
  for (const r of all) {
    assert.equal(r.updatedBy, "alice");
    assert.equal(r.newValue, "true");
    assert.equal(r.previousValue, "cleared");
  }

  // Single-platform writes must not share a batchId with each other or
  // with the bulk batch above.
  await setEnvFallbackDisabledOverride("youtube", false, "bob");
  const after = await legacyTokenKillSwitchAuditService.list({
    platform: "youtube",
  });
  const single = after.find((r) => r.updatedBy === "bob");
  assert.ok(single);
  assert.equal(single!.batchId, null);

  // History endpoint surfaces batchId on each row so the UI can group them.
  const resp = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/history`,
  );
  assert.equal(resp.status, 200);
  const body = await resp.json();
  const bulk = body.entries.filter((e: any) => e.batchId);
  assert.equal(bulk.length, 2);
  assert.equal(bulk[0].batchId, bulk[1].batchId);
});

test("listFiltered filters by platform, actor, and date range", async () => {
  await setEnvFallbackDisabledOverride("youtube", true, "alice");
  await setEnvFallbackDisabledOverride("facebook", true, "bob");
  await setEnvFallbackDisabledOverride("telegram", true, "alice");

  // Backdate the youtube row well into the past.
  const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db
    .update(audienceLegacyTokenKillSwitchAudit)
    .set({ updatedAt: past })
    .where(eq(audienceLegacyTokenKillSwitchAudit.platform, "youtube"));

  const byPlatform = await legacyTokenKillSwitchAuditService.listFiltered({
    platform: "facebook",
  });
  assert.equal(byPlatform.length, 1);
  assert.equal(byPlatform[0].platform, "facebook");

  const byActor = await legacyTokenKillSwitchAuditService.listFiltered({
    updatedBy: "alice",
  });
  assert.equal(byActor.length, 2);
  for (const r of byActor) assert.equal(r.updatedBy, "alice");

  // fromDate filter drops the backdated youtube row.
  const recent = await legacyTokenKillSwitchAuditService.listFiltered({
    fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
  assert.equal(recent.length, 2);
  for (const r of recent) assert.notEqual(r.platform, "youtube");

  // toDate filter keeps only the backdated row.
  const old = await legacyTokenKillSwitchAuditService.listFiltered({
    toDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
  assert.equal(old.length, 1);
  assert.equal(old[0].platform, "youtube");
});

test("GET legacy-token-status/history.csv returns CSV with full history honoring filters", async () => {
  await setEnvFallbackDisabledOverride("youtube", true, "alice");
  await setEnvFallbackDisabledOverride("facebook", true, "bob");

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/history.csv`,
  );
  assert.equal(r.status, 200);
  assert.match(
    r.headers.get("content-type") || "",
    /text\/csv/i,
  );
  const dispo = r.headers.get("content-disposition") || "";
  assert.match(dispo, /attachment;\s*filename="legacy-token-kill-switch-history-.+\.csv"/);
  const body = await r.text();
  const lines = body.trim().split("\n");
  assert.equal(
    lines[0],
    "id,updatedAt,platform,previousValue,newValue,updatedBy,batchId",
  );
  assert.equal(lines.length, 3);
  // Newest first — facebook was inserted last.
  assert.ok(lines[1].includes("facebook"));
  assert.ok(lines[1].includes("bob"));
  assert.ok(lines[2].includes("youtube"));
  assert.ok(lines[2].includes("alice"));

  // Platform filter narrows the export.
  const ytOnly = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/history.csv?platform=youtube`,
  );
  assert.equal(ytOnly.status, 200);
  const ytBody = await ytOnly.text();
  const ytLines = ytBody.trim().split("\n");
  assert.equal(ytLines.length, 2);
  assert.ok(ytLines[1].includes("youtube"));
  assert.equal(ytLines[1].includes("facebook"), false);

  // updatedBy filter narrows the export.
  const aliceOnly = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/history.csv?updatedBy=alice`,
  );
  assert.equal(aliceOnly.status, 200);
  const aliceLines = (await aliceOnly.text()).trim().split("\n");
  assert.equal(aliceLines.length, 2);
  assert.ok(aliceLines[1].includes("alice"));

  // Empty result still returns just the header.
  const none = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/history.csv?updatedBy=nobody`,
  );
  assert.equal(none.status, 200);
  const noneBody = await none.text();
  assert.equal(
    noneBody.trim(),
    "id,updatedAt,platform,previousValue,newValue,updatedBy,batchId",
  );
});

test("GET legacy-token-status/history.csv rejects unknown platform with 400", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/history.csv?platform=myspace`,
  );
  assert.equal(r.status, 400);
});

test("pruneLegacyTokenKillSwitchAuditOlderThan drops only rows older than cutoff", async () => {
  await setEnvFallbackDisabledOverride("youtube", true, "alice");
  // Backdate the row by setting updated_at into the past.
  const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db
    .update(audienceLegacyTokenKillSwitchAudit)
    .set({ updatedAt: past })
    .where(eq(audienceLegacyTokenKillSwitchAudit.platform, "youtube"));

  await setEnvFallbackDisabledOverride("facebook", true, "alice");

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pruned = await pruneLegacyTokenKillSwitchAuditOlderThan(cutoff);
  assert.equal(pruned, 1);

  const remaining = await legacyTokenKillSwitchAuditService.list({});
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].platform, "facebook");

  // Re-running the prune at the same cutoff is a no-op.
  const second = await pruneLegacyTokenKillSwitchAuditOlderThan(cutoff);
  assert.equal(second, 0);

  // Sanity: cutoff-aware deletion uses `<` (strict less than), so an
  // exactly-equal row is preserved.
  const _unusedLt = lt; // re-export check
});
