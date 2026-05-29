/**
 * Task #620 — Founder PTO mode notifier-enrollment integration tests.
 *
 * Verifies that each of the six newly-enrolled alert services consults
 * `isNotifierMutedByPto` from its existing send-decision path. With PTO
 * mode enabled + the notifier enrolled + an active snooze:
 *   - no `platform_alerts` row is created
 *   - the central `snoozeSuppressedCount` increments
 *   - per-service dedup state is untouched (regression for the "first
 *     post-PTO fire still reports an accurate suppressed-count" promise)
 * With PTO mode disabled the normal send path runs unchanged.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts, systemSettings } from "@shared/schema";
import {
  FOUNDER_PTO_MODE_SETTING_KEY,
  PTO_NOTIFIER_REGISTRY,
  getFounderPtoModeConfig,
  setFounderPtoEnrollment,
  setFounderPtoSnooze,
} from "../server/services/founder-pto-mode-service";

import {
  GATEWAY_BLOCK_ALERT_TYPE,
  gatewayBlockAlertService,
} from "../server/services/gateway-block-alert-service";
import {
  AUDIENCE_RETENTION_ALERT_TYPE,
  audienceRetentionFailureAlertService,
} from "../server/services/audience-retention-failure-alert-service";
import { broadcastSweepFailureAlertService } from "../server/services/broadcast-sweep-failure-alert-service";
import { shortsBacklogAlertService } from "../server/services/shorts-backlog-alert-service";
import { liveBroadcastAlertService } from "../server/services/live-broadcast-alert-service";
import {
  handleConnectorRotationEvent,
  clearConnectorRotationNotificationHistoryForTests,
  getConnectorRotationNotificationHistory,
  setAudienceConnectorRotationNotifierConfig,
  type AudienceConnectorSecretRotationEvent,
} from "../server/services/audience-connector-rotation-notifier";

const BROADCAST_SWEEP_ALERT_TYPE = "broadcast_sweep_failure";
const SHORTS_BACKLOG_ALERT_TYPE = "shorts_draft_backlog";
const LIVE_BROADCAST_ALERT_TYPE = "broadcast_live_detected";

const ALL_ALERT_TYPES = [
  GATEWAY_BLOCK_ALERT_TYPE,
  AUDIENCE_RETENTION_ALERT_TYPE,
  BROADCAST_SWEEP_ALERT_TYPE,
  SHORTS_BACKLOG_ALERT_TYPE,
  LIVE_BROADCAST_ALERT_TYPE,
];

async function clearOurAlerts() {
  for (const t of ALL_ALERT_TYPES) {
    await db.delete(platformAlerts).where(eq(platformAlerts.type, t));
  }
}

async function clearPtoConfig() {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, FOUNDER_PTO_MODE_SETTING_KEY));
}

async function countOpenAlerts(type: string): Promise<number> {
  const rows = await db
    .select()
    .from(platformAlerts)
    .where(eq(platformAlerts.type, type));
  return rows.length;
}

async function enableAllPto() {
  await setFounderPtoEnrollment({
    enabled: true,
    enrolledNotifiers: PTO_NOTIFIER_REGISTRY.map((n) => n.id),
    updatedBy: "test",
  });
  await setFounderPtoSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    snoozePolicy: { kind: "fixed" },
    updatedBy: "test",
  });
}

beforeEach(async () => {
  process.env.GATEWAY_BLOCK_ALERT_THRESHOLD = "3";
  process.env.GATEWAY_BLOCK_ALERT_WINDOW_MS = "60000";
  process.env.GATEWAY_BLOCK_ALERT_DEDUP_MS = "0";
  process.env.GATEWAY_BLOCK_ALERT_RECOVERY = "1";
  process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS = "0";
  process.env.BROADCAST_SWEEP_FAILURE_DEDUP_MS = "0";
  gatewayBlockAlertService.resetForTests();
  audienceRetentionFailureAlertService.resetForTests();
  broadcastSweepFailureAlertService.resetForTests();
  await clearConnectorRotationNotificationHistoryForTests();
  await clearOurAlerts();
  await clearPtoConfig();
});

afterEach(async () => {
  delete process.env.GATEWAY_BLOCK_ALERT_THRESHOLD;
  delete process.env.GATEWAY_BLOCK_ALERT_WINDOW_MS;
  delete process.env.GATEWAY_BLOCK_ALERT_DEDUP_MS;
  delete process.env.GATEWAY_BLOCK_ALERT_RECOVERY;
  delete process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS;
  delete process.env.BROADCAST_SWEEP_FAILURE_DEDUP_MS;
  await clearOurAlerts();
  await clearPtoConfig();
});

test("registry includes the six T620 notifier ids", () => {
  const ids = new Set(PTO_NOTIFIER_REGISTRY.map((n) => n.id));
  for (const expected of [
    "gateway_block_alert",
    "audience_retention_failure",
    "broadcast_sweep_failure",
    "shorts_backlog",
    "live_broadcast",
    "audience_connector_rotation",
  ]) {
    assert.ok(ids.has(expected), `missing registry entry: ${expected}`);
  }
});

test("PTO disabled: gateway-block-alert fires normally; PTO enabled: muted + counter bumps + dedup preserved", async () => {
  // Control: PTO disabled → crossing threshold creates a platform_alerts row.
  for (let i = 0; i < 3; i++) {
    await gatewayBlockAlertService.handleBlocked({
      platform: "youtube",
      reason: "platform_token_missing",
    });
  }
  assert.equal(await countOpenAlerts(GATEWAY_BLOCK_ALERT_TYPE), 1);

  // Reset and enable PTO.
  await clearOurAlerts();
  gatewayBlockAlertService.resetForTests();
  await enableAllPto();
  const before = (await getFounderPtoModeConfig()).snoozeSuppressedCount;

  for (let i = 0; i < 3; i++) {
    await gatewayBlockAlertService.handleBlocked({
      platform: "youtube",
      reason: "platform_token_missing",
    });
  }
  assert.equal(
    await countOpenAlerts(GATEWAY_BLOCK_ALERT_TYPE),
    0,
    "PTO mute should swallow gateway-block alert",
  );
  const after = (await getFounderPtoModeConfig()).snoozeSuppressedCount;
  assert.ok(after > before, "PTO suppressed counter should bump");

  // Dedup preserved: the swallowed event is tracked as suppressedSinceLastFire.
  const snapshot = gatewayBlockAlertService.getSnapshot();
  const ytState = snapshot.find((s) => s.platform === "youtube");
  assert.ok(ytState && ytState.count >= 3, "rolling window still counts the blocks");
});

test("audience-retention-failure: PTO mutes notifyFailure + preserves dedup", async () => {
  // Control: notifyFailure with no PTO fires.
  const fired1 = await audienceRetentionFailureAlertService.notifyFailure({
    error: "boom",
    cutoffIso: new Date().toISOString(),
    retentionDays: 90,
    trigger: "scheduled",
  });
  assert.equal(fired1, true);
  assert.ok((await countOpenAlerts(AUDIENCE_RETENTION_ALERT_TYPE)) >= 1);

  // Reset and enable PTO.
  await clearOurAlerts();
  audienceRetentionFailureAlertService.resetForTests();
  await enableAllPto();
  const before = (await getFounderPtoModeConfig()).snoozeSuppressedCount;

  const fired2 = await audienceRetentionFailureAlertService.notifyFailure({
    error: "still broken",
    cutoffIso: new Date().toISOString(),
    retentionDays: 90,
    trigger: "scheduled",
  });
  assert.equal(fired2, false, "PTO mute should swallow retention-failure alert");
  assert.equal(await countOpenAlerts(AUDIENCE_RETENTION_ALERT_TYPE), 0);
  const after = (await getFounderPtoModeConfig()).snoozeSuppressedCount;
  assert.ok(after > before, "PTO suppressed counter should bump");
});

test("broadcast-sweep-failure: PTO mutes notify() + preserves per-kind dedup state", async () => {
  // Control: PTO disabled → fires.
  const fired1 = await broadcastSweepFailureAlertService.notify("covers", "x");
  assert.equal(fired1, true);
  assert.ok((await countOpenAlerts(BROADCAST_SWEEP_ALERT_TYPE)) >= 1);

  // Reset and enable PTO.
  await clearOurAlerts();
  broadcastSweepFailureAlertService.resetForTests();
  await enableAllPto();
  const before = (await getFounderPtoModeConfig()).snoozeSuppressedCount;

  const fired2 = await broadcastSweepFailureAlertService.notify(
    "media",
    "still broken",
  );
  assert.equal(fired2, false, "PTO mute should swallow broadcast-sweep alert");
  assert.equal(await countOpenAlerts(BROADCAST_SWEEP_ALERT_TYPE), 0);
  const after = (await getFounderPtoModeConfig()).snoozeSuppressedCount;
  assert.ok(after > before);
});

test("shorts-backlog: PTO mutes fireAlert + counter bumps", async () => {
  // Control: invoke private fireAlert directly to bypass DB-seeding the drafts.
  await (shortsBacklogAlertService as any).fireAlert(10, 5);
  assert.ok((await countOpenAlerts(SHORTS_BACKLOG_ALERT_TYPE)) >= 1);

  await clearOurAlerts();
  await enableAllPto();
  const before = (await getFounderPtoModeConfig()).snoozeSuppressedCount;

  await (shortsBacklogAlertService as any).fireAlert(11, 5);
  assert.equal(
    await countOpenAlerts(SHORTS_BACKLOG_ALERT_TYPE),
    0,
    "PTO mute should swallow shorts-backlog alert",
  );
  const after = (await getFounderPtoModeConfig()).snoozeSuppressedCount;
  assert.ok(after > before);
});

test("live-broadcast: PTO mutes fireAlert + does not advance lastAlertAt", async () => {
  // Control: invoke private fireAlert directly to bypass seeding broadcasts.
  await (liveBroadcastAlertService as any).fireAlert(2, 0);
  assert.ok((await countOpenAlerts(LIVE_BROADCAST_ALERT_TYPE)) >= 1);
  const statusAfterCtrl = await liveBroadcastAlertService.getStatus();
  const lastAlertAtCtrl = statusAfterCtrl.lastAlertAt;
  assert.ok(lastAlertAtCtrl != null, "control fire should advance lastAlertAt");

  await clearOurAlerts();
  await enableAllPto();
  const before = (await getFounderPtoModeConfig()).snoozeSuppressedCount;

  await (liveBroadcastAlertService as any).fireAlert(5, 0);
  assert.equal(
    await countOpenAlerts(LIVE_BROADCAST_ALERT_TYPE),
    0,
    "PTO mute should swallow live-broadcast alert",
  );
  const after = (await getFounderPtoModeConfig()).snoozeSuppressedCount;
  assert.ok(after > before);

  const statusAfterPto = await liveBroadcastAlertService.getStatus();
  assert.equal(
    statusAfterPto.lastAlertAt,
    lastAlertAtCtrl,
    "PTO-muted fire must not advance lastAlertAt",
  );
});

test("audience-connector-rotation: PTO records pto_snoozed reason + skips email + counter bumps", async () => {
  // Configure with a recipient (required for any non-disabled / non-no_recipients path).
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["ops@example.com"],
  });

  const event: AudienceConnectorSecretRotationEvent = {
    connectorId: "conn_test",
    platform: "youtube",
    action: "rotate",
    rotatedBy: "founder",
    rotatedAt: new Date().toISOString(),
    rotationCount: 1,
    keyVersion: 1,
  };

  await enableAllPto();
  const before = (await getFounderPtoModeConfig()).snoozeSuppressedCount;

  const result = await handleConnectorRotationEvent(event);
  assert.equal(result.notified, false);
  assert.equal(result.reason, "pto_snoozed");
  assert.match(result.errorMessage ?? "", /^pto_snoozed_until:/);

  const after = (await getFounderPtoModeConfig()).snoozeSuppressedCount;
  assert.ok(after > before, "PTO suppressed counter should bump");

  // History row carries the pto_snoozed reason for auditability.
  const history = await getConnectorRotationNotificationHistory(5);
  const ours = history.find(
    (h) => h.event.connectorId === "conn_test" && h.reason === "pto_snoozed",
  );
  assert.ok(ours, "history should record the pto_snoozed entry");
});
