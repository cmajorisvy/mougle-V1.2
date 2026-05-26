/**
 * Task #543 — the weekly audience-audit digest email must include the
 * same retention-backlog trend arrows + recent stale-pending samples
 * that the failure alert (Task #486) embeds, so a slowly growing
 * backlog that never crosses the hard alert threshold is still visible
 * during routine founder reviews.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { db } from "../server/db";
import { audienceRetentionStaleHistory } from "../shared/omni-channel-audience-schema";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { audienceAuditEmailScheduler } from "../server/services/audience-audit-email-scheduler";

const originalExport = (omniChannelAudienceSafetyService as any).exportAuditTrail.bind(
  omniChannelAudienceSafetyService,
);

const fakeExportPayload = {
  connectors: [],
  messages: [{ messageId: "m1" }],
  decisions: [{ decisionId: "d1" }],
  commands: [{ commandId: "c1" }],
  filters: { fromDate: null, toDate: null, platform: null, productionId: null },
  exportedAt: new Date("2026-05-20T12:00:00.000Z").toISOString(),
};

before(async () => {
  (omniChannelAudienceSafetyService as any).exportAuditTrail = async (filters: any) => ({
    ...fakeExportPayload,
    filters: {
      fromDate: filters?.fromDate ? filters.fromDate.toISOString() : null,
      toDate: filters?.toDate ? filters.toDate.toISOString() : null,
      platform: filters?.platform ?? null,
      productionId: filters?.productionId ?? null,
    },
  });

  await audienceAuditEmailScheduler.resetForTests();
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["compliance@example.com"],
    platform: null,
    productionId: null,
  });

  await db.delete(audienceRetentionStaleHistory);
  // Seed three sweeps so summarizeStalePendingTrend has >=2 samples
  // and the digest can render arrows + history lines.
  const base = Date.now() - 3 * 60 * 60 * 1000;
  for (let i = 0; i < 3; i++) {
    await db.insert(audienceRetentionStaleHistory).values({
      retentionDays: 90,
      stalePendingMessages: 10 + i * 5, // growing
      stalePendingDecisions: 4,         // flat
      stalePendingCommands: 6 - i,      // shrinking
      sweepTrigger: "scheduled",
      sweepError: null,
      recordedAt: new Date(base + i * 60 * 60 * 1000),
    });
  }
});

after(async () => {
  (omniChannelAudienceSafetyService as any).exportAuditTrail = originalExport;
  await audienceAuditEmailScheduler.resetForTests();
  await db.delete(audienceRetentionStaleHistory);
});

test("weekly audience-audit digest embeds the retention backlog trend block", async () => {
  const preview = await audienceAuditEmailScheduler.previewNow();
  const html = preview.html;

  assert.ok(
    html.includes("Retention backlog trend"),
    "digest html must include the Retention backlog trend section header",
  );
  // Growing messages should show the up arrow with the current count.
  assert.ok(
    html.includes("messages ▲ 20"),
    `digest html must show messages ▲ 20 (got: ${html.slice(0, 400)}…)`,
  );
  // Shrinking commands -> down arrow.
  assert.ok(
    html.includes("commands ▼"),
    "digest html must show commands ▼ for the shrinking series",
  );
  // Flat decisions -> flat glyph.
  assert.ok(
    html.includes("decisions ▬"),
    "digest html must show decisions ▬ for the flat series",
  );
  // Recent samples list must be present and reference the sample count.
  assert.ok(
    html.includes("Recent stale-pending samples"),
    "digest html must include the recent stale-pending samples header",
  );
  assert.ok(
    /last 3 sweeps/.test(html),
    "digest html must reference the 3 seeded sweep samples",
  );
});

test("weekly digest embeds one inline SVG sparkline per backlog table", async () => {
  const preview = await audienceAuditEmailScheduler.previewNow();
  const html = preview.html;

  // One <svg> sparkline per table (messages / decisions / commands) plus
  // the labelled row that wraps each one.
  const svgMatches = html.match(/<svg [^>]*role="img"/g) ?? [];
  assert.ok(
    svgMatches.length >= 3,
    `expected at least 3 inline SVG sparklines in the digest, got ${svgMatches.length}`,
  );

  // Each labelled row must show the table name + latest sample so the
  // text fallback (Task #543 plain block) is still readable in clients
  // that strip inline SVG (e.g. Gmail).
  for (const label of ["messages", "decisions", "commands"]) {
    assert.ok(
      html.includes(`>${label}</span>`),
      `digest html must include a sparkline row labelled "${label}"`,
    );
  }
  // Latest seeded counters were messages=20, decisions=4, commands=4.
  assert.ok(html.includes("latest 20"), "messages sparkline must show latest 20");
  assert.ok(html.includes("latest 4"), "decisions/commands sparkline must show latest 4");

  // The plain monospace fallback block must still be present so the
  // digest stays useful for plaintext-only readers.
  assert.ok(html.includes("Recent stale-pending samples"));
  assert.ok(html.includes("messages ▲ 20"));
});

test("digest still renders when no stale-pending history exists yet", async () => {
  await db.delete(audienceRetentionStaleHistory);
  const preview = await audienceAuditEmailScheduler.previewNow();
  // With zero samples we either omit the block entirely or fall back to
  // the "not enough samples" copy — never crash.
  assert.ok(preview.html.length > 0);
  if (preview.html.includes("Retention backlog trend")) {
    assert.ok(preview.html.includes("Not enough samples"));
  }
});
