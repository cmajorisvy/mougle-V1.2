/**
 * Task #381 — Gateway block alert.
 *
 * Verifies that a flood of `audience.gateway_send_blocked` events on a
 * single platform fires a founder `platform_alerts` row, dedups
 * subsequent storms within the cooldown window, and auto-resolves the
 * open alert once the block rate falls back to the recovery threshold.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts } from "@shared/schema";
import {
  GATEWAY_BLOCK_ALERT_TYPE,
  gatewayBlockAlertService,
} from "../server/services/gateway-block-alert-service";
import { neuralNewsroomBus } from "../server/services/neural-newsroom-bus";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { gatewayBlockAlertSettingsService } from "../server/services/gateway-block-alert-settings-service";

async function clearOurAlerts() {
  await db
    .delete(platformAlerts)
    .where(eq(platformAlerts.type, GATEWAY_BLOCK_ALERT_TYPE));
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

beforeEach(async () => {
  gatewayBlockAlertService.resetForTests();
  await clearOurAlerts();
  process.env.GATEWAY_BLOCK_ALERT_THRESHOLD = "5";
  process.env.GATEWAY_BLOCK_ALERT_WINDOW_MS = "60000";
  process.env.GATEWAY_BLOCK_ALERT_DEDUP_MS = "0";
  process.env.GATEWAY_BLOCK_ALERT_RECOVERY = "1";
});

afterEach(async () => {
  gatewayBlockAlertService.resetForTests();
  await clearOurAlerts();
  delete process.env.GATEWAY_BLOCK_ALERT_THRESHOLD;
  delete process.env.GATEWAY_BLOCK_ALERT_WINDOW_MS;
  delete process.env.GATEWAY_BLOCK_ALERT_DEDUP_MS;
  delete process.env.GATEWAY_BLOCK_ALERT_RECOVERY;
});

test("blocks below threshold do not fire", async () => {
  for (let i = 0; i < 4; i++) {
    await gatewayBlockAlertService.handleBlocked({
      platform: "youtube",
      reason: "decision_fingerprint_mismatch",
    });
  }
  const open = await openAlerts();
  assert.equal(open.length, 0);
});

test("crossing the threshold fires a founder alert tagged with the platform", async () => {
  for (let i = 0; i < 5; i++) {
    await gatewayBlockAlertService.handleBlocked({
      platform: "youtube",
      reason: "decision_fingerprint_mismatch",
    });
  }
  const open = await openAlerts();
  assert.equal(open.length, 1);
  const row = open[0];
  assert.match(row.message, /youtube/);
  assert.match(row.message, /5 block/);
  const d = (row.details as Record<string, any>) ?? {};
  assert.equal(d.source, "gateway-block-alert-service");
  assert.equal(d.platform, "youtube");
  assert.equal(d.threshold, 5);
  assert.equal(d.blockedCount, 5);
  assert.ok(Array.isArray(d.recentReasons));
  assert.ok(d.recentReasons.includes("decision_fingerprint_mismatch"));
});

test("alert payload breaks blocks down by connector and deep-links the top offender", async () => {
  // One noisy connector ("conn_bad") + one quiet one — top offender must
  // be the noisy one and the actionUrl must deep-link to it (Task #419).
  for (let i = 0; i < 4; i++) {
    await gatewayBlockAlertService.handleBlocked({
      platform: "youtube",
      connectorId: "conn_bad",
      reason: "platform_token_missing",
    });
  }
  await gatewayBlockAlertService.handleBlocked({
    platform: "youtube",
    connectorId: "conn_ok",
    reason: "rate_limit_exceeded",
  });
  const open = await openAlerts();
  assert.equal(open.length, 1);
  const d = (open[0].details as Record<string, any>) ?? {};
  assert.ok(Array.isArray(d.topConnectors), "topConnectors must be present");
  assert.equal(d.topConnectors[0].connectorId, "conn_bad");
  assert.equal(d.topConnectors[0].count, 4);
  assert.ok(d.topConnectors[0].recentReasons.includes("platform_token_missing"));
  assert.equal(
    d.actionUrl,
    "/admin/omni-channel-audience#gateway-conn_bad",
    "alert actionUrl must deep-link straight to the offending connector",
  );
  assert.match(open[0].message, /conn_bad=4/);
});

test("alert details bucket reasons by category per top connector (Task #444)", async () => {
  // Mixed reasons on one connector — must appear in `reasonCategoryCounts`.
  for (let i = 0; i < 3; i++) {
    await gatewayBlockAlertService.handleBlocked({
      platform: "youtube",
      connectorId: "conn_bad",
      reason: "platform_token_missing",
    });
  }
  await gatewayBlockAlertService.handleBlocked({
    platform: "youtube",
    connectorId: "conn_bad",
    reason: "rate_limit_exceeded",
  });
  await gatewayBlockAlertService.handleBlocked({
    platform: "youtube",
    connectorId: "conn_bad",
    reason: "decision_changed_since_build",
  });
  const open = await openAlerts();
  assert.equal(open.length, 1);
  const d = (open[0].details as Record<string, any>) ?? {};
  // Platform-level rollup.
  assert.deepEqual(d.reasonCategoryCounts, {
    auth: 3,
    rate_limit: 1,
    decision: 1,
  });
  // Per-connector rollup on the top offender.
  const top = d.topConnectors[0];
  assert.equal(top.connectorId, "conn_bad");
  assert.deepEqual(top.reasonCategoryCounts, {
    auth: 3,
    rate_limit: 1,
    decision: 1,
  });
});

test("getConnectorBlockSnapshot surfaces reasonCategoryCounts (Task #444)", async () => {
  await gatewayBlockAlertService.handleBlocked({
    platform: "facebook",
    connectorId: "fb_page_a",
    reason: "permissions_missing",
  });
  await gatewayBlockAlertService.handleBlocked({
    platform: "facebook",
    connectorId: "fb_page_a",
    reason: "platform_http_429",
  });
  const snap = gatewayBlockAlertService.getConnectorBlockSnapshot();
  const a = snap.connectors.find((c) => c.connectorId === "fb_page_a");
  assert.ok(a);
  assert.deepEqual(a!.reasonCategoryCounts, { permission: 1, http: 1 });
});

test("getConnectorBlockSnapshot exposes the same rolling window per connector", async () => {
  for (let i = 0; i < 3; i++) {
    await gatewayBlockAlertService.handleBlocked({
      platform: "facebook",
      connectorId: "fb_page_a",
      reason: "permissions_missing",
    });
  }
  await gatewayBlockAlertService.handleBlocked({
    platform: "facebook",
    connectorId: "fb_page_b",
    reason: "rate_limit_exceeded",
  });
  const snap = gatewayBlockAlertService.getConnectorBlockSnapshot();
  assert.equal(snap.threshold, 5);
  assert.ok(snap.windowMs > 0);
  const a = snap.connectors.find((c) => c.connectorId === "fb_page_a");
  const b = snap.connectors.find((c) => c.connectorId === "fb_page_b");
  assert.ok(a && b);
  assert.equal(a!.blockedCount, 3);
  assert.equal(a!.platform, "facebook");
  assert.equal(b!.blockedCount, 1);
  // The noisier connector must sort first so the UI lists it at the top.
  assert.equal(snap.connectors[0].connectorId, "fb_page_a");
});

test("two platforms are tracked independently", async () => {
  for (let i = 0; i < 5; i++) {
    await gatewayBlockAlertService.handleBlocked({
      platform: "youtube",
      reason: "connector_expired",
    });
  }
  // Only 3 facebook blocks — below threshold.
  for (let i = 0; i < 3; i++) {
    await gatewayBlockAlertService.handleBlocked({
      platform: "facebook",
      reason: "permissions_missing",
    });
  }
  const open = await openAlerts();
  assert.equal(open.length, 1);
  assert.equal(((open[0].details as any) ?? {}).platform, "youtube");
});

test("repeated storms inside the dedup window are suppressed", async () => {
  process.env.GATEWAY_BLOCK_ALERT_DEDUP_MS = String(60 * 60 * 1000);
  // First storm fires.
  for (let i = 0; i < 5; i++) {
    await gatewayBlockAlertService.handleBlocked({
      platform: "x",
      reason: "rate_limited",
    });
  }
  // Second storm immediately after — should NOT open a second alert.
  for (let i = 0; i < 5; i++) {
    await gatewayBlockAlertService.handleBlocked({
      platform: "x",
      reason: "rate_limited",
    });
  }
  const open = await openAlerts();
  assert.equal(open.length, 1);
});

test("auto-resolves the open alert once the rolling rate falls to recovery", async () => {
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) {
    await gatewayBlockAlertService.handleBlocked(
      { platform: "telegram", reason: "token_invalid" },
      t0 + i,
    );
  }
  const opened = await openAlerts();
  assert.equal(opened.length, 1);
  assert.equal(((opened[0].details as any) ?? {}).platform, "telegram");

  // Advance "now" past the rolling window so all timestamps age out;
  // recovery threshold is 1, current count is 0 → must auto-resolve.
  const future = t0 + 70_000;
  const resolved = await gatewayBlockAlertService.autoResolveHealthy(future);
  assert.equal(resolved, 1);

  const stillOpen = await openAlerts();
  assert.equal(stillOpen.length, 0);

  const rows = await db
    .select()
    .from(platformAlerts)
    .where(eq(platformAlerts.id, opened[0].id));
  const row = rows[0];
  assert.equal(row.acknowledged, true);
  assert.equal(row.acknowledgedBy, "system");
  assert.ok(row.acknowledgedAt instanceof Date);
  const d = (row.details as Record<string, any>) ?? {};
  assert.equal(d.autoResolved, true);
  assert.equal(d.autoResolvedBlockedCount, 0);
  assert.equal(d.autoResolvedRecoveryThreshold, 1);
});

test("auto-pause is a no-op when the admin knob is disabled", async () => {
  const origAutoPause = (omniChannelAudienceSafetyService as any).autoPauseConnector;
  let calls = 0;
  (omniChannelAudienceSafetyService as any).autoPauseConnector = async () => {
    calls += 1;
    return null;
  };
  try {
    // autoPauseEnabled defaults to false — flood blocks then run evaluate.
    for (let i = 0; i < 6; i++) {
      await gatewayBlockAlertService.handleBlocked({
        platform: "youtube",
        connectorId: "conn_x",
        reason: "rate_limit_exceeded",
      });
    }
    const paused = await gatewayBlockAlertService.evaluateAutoPause();
    assert.equal(paused.length, 0);
    assert.equal(calls, 0);
  } finally {
    (omniChannelAudienceSafetyService as any).autoPauseConnector = origAutoPause;
  }
});

test("auto-pause fires after N consecutive over-threshold windows and stitches details onto open alert", async () => {
  await gatewayBlockAlertSettingsService.setAutoPauseEnabled(true, "test");
  await gatewayBlockAlertSettingsService.setAutoPauseWindows(2, "test");
  const origAutoPause = (omniChannelAudienceSafetyService as any).autoPauseConnector;
  const pauseCalls: Array<{ connectorId: string; reason: string }> = [];
  (omniChannelAudienceSafetyService as any).autoPauseConnector = async (
    connectorId: string,
    reason: string,
  ) => {
    pauseCalls.push({ connectorId, reason });
    return { connectorId, platformSendApproved: false } as any;
  };
  try {
    // Flood exactly to threshold (5) — with dedupMs=0 each additional
    // block past threshold would open a fresh alert row, so cap at 5.
    for (let i = 0; i < 5; i++) {
      await gatewayBlockAlertService.handleBlocked({
        platform: "facebook",
        connectorId: "fb_bad",
        reason: "permissions_missing",
      });
    }
    assert.equal((await openAlerts()).length, 1);
    // Window 1: counter goes 0 -> 1, not yet at requiredWindows=2.
    let paused = await gatewayBlockAlertService.evaluateAutoPause();
    assert.equal(paused.length, 0);
    assert.equal(pauseCalls.length, 0);
    // Window 2: counter goes to 2 -> trigger pause.
    paused = await gatewayBlockAlertService.evaluateAutoPause();
    assert.equal(paused.length, 1);
    assert.equal(paused[0].connectorId, "fb_bad");
    assert.equal(paused[0].platform, "facebook");
    assert.equal(pauseCalls.length, 1);
    assert.equal(pauseCalls[0].connectorId, "fb_bad");
    assert.match(pauseCalls[0].reason, /auto_paused/);
    // Subsequent evaluations are idempotent.
    paused = await gatewayBlockAlertService.evaluateAutoPause();
    assert.equal(paused.length, 0);
    assert.equal(pauseCalls.length, 1);
    // The open alert row now carries autoPausedConnectors.
    const open = await openAlerts();
    assert.equal(open.length, 1);
    const d = (open[0].details as Record<string, any>) ?? {};
    assert.ok(Array.isArray(d.autoPausedConnectors));
    assert.equal(d.autoPausedConnectors.length, 1);
    assert.equal(d.autoPausedConnectors[0].connectorId, "fb_bad");
  } finally {
    (omniChannelAudienceSafetyService as any).autoPauseConnector = origAutoPause;
    await gatewayBlockAlertSettingsService.resetForTests();
  }
});

test("auto-pause counter resets when the connector recovers", async () => {
  await gatewayBlockAlertSettingsService.setAutoPauseEnabled(true, "test");
  await gatewayBlockAlertSettingsService.setAutoPauseWindows(3, "test");
  const origAutoPause = (omniChannelAudienceSafetyService as any).autoPauseConnector;
  let calls = 0;
  (omniChannelAudienceSafetyService as any).autoPauseConnector = async () => {
    calls += 1;
    return { connectorId: "x", platformSendApproved: false } as any;
  };
  try {
    const t0 = Date.now();
    // Storm: 6 blocks now.
    for (let i = 0; i < 6; i++) {
      await gatewayBlockAlertService.handleBlocked(
        { platform: "x", connectorId: "x_conn", reason: "rate_limit_exceeded" },
        t0 + i,
      );
    }
    // Window 1 + 2 increment counter — not yet at 3.
    await gatewayBlockAlertService.evaluateAutoPause(t0 + 100);
    await gatewayBlockAlertService.evaluateAutoPause(t0 + 200);
    assert.equal(calls, 0);
    // Advance past rolling window so blocks age out — count drops to <= recovery, counter resets.
    await gatewayBlockAlertService.evaluateAutoPause(t0 + 70_000);
    // Window 1 again — counter only at 1.
    await gatewayBlockAlertService.evaluateAutoPause(t0 + 70_001);
    assert.equal(calls, 0);
  } finally {
    (omniChannelAudienceSafetyService as any).autoPauseConnector = origAutoPause;
    await gatewayBlockAlertSettingsService.resetForTests();
  }
});

test("fire() includes autoPausedConnectors in alert details", async () => {
  await gatewayBlockAlertSettingsService.setAutoPauseEnabled(true, "test");
  await gatewayBlockAlertSettingsService.setAutoPauseWindows(1, "test");
  const origAutoPause = (omniChannelAudienceSafetyService as any).autoPauseConnector;
  (omniChannelAudienceSafetyService as any).autoPauseConnector = async (
    connectorId: string,
  ) => ({ connectorId, platformSendApproved: false }) as any;
  try {
    // First open an alert.
    for (let i = 0; i < 6; i++) {
      await gatewayBlockAlertService.handleBlocked({
        platform: "telegram",
        connectorId: "tg_a",
        reason: "token_invalid",
      });
    }
    // Auto-pause on first evaluation (windows=1).
    const paused = await gatewayBlockAlertService.evaluateAutoPause();
    assert.equal(paused.length, 1);
    // Open alert row was stitched.
    const open = await openAlerts();
    const d = (open[0].details as Record<string, any>) ?? {};
    assert.ok(Array.isArray(d.autoPausedConnectors));
    assert.equal(d.autoPausedConnectors[0].connectorId, "tg_a");
  } finally {
    (omniChannelAudienceSafetyService as any).autoPauseConnector = origAutoPause;
    await gatewayBlockAlertSettingsService.resetForTests();
  }
});

test("bus subscription forwards emitted events through start()", async () => {
  gatewayBlockAlertService.start(60_000);
  try {
    for (let i = 0; i < 5; i++) {
      neuralNewsroomBus.emit("audience.gateway_send_blocked", {
        commandId: `cmd_${i}`,
        platform: "reddit",
        requestedAction: "hide",
        reason: "not_platform_send_approved",
      });
    }
    // The subscriber dispatches asynchronously via Promise; wait a tick.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const open = await openAlerts();
    assert.equal(open.length, 1);
    assert.equal(((open[0].details as any) ?? {}).platform, "reddit");
  } finally {
    gatewayBlockAlertService.stop();
  }
});
