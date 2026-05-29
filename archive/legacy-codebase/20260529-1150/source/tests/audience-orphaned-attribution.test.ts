/**
 * Tests for the audience orphaned-attribution summary (Task #634).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "../server/db";
import {
  audienceGatewayEvents,
  audienceLegacyTokenDispatchAlerts,
  audienceConnectorRotationNotifications,
} from "../shared/omni-channel-audience-schema";
import { recordGatewayEvent } from "../server/services/audience-gateway-event-log-service";
import {
  AUDIENCE_ORPHANED_ATTRIBUTION_TARGETS,
  getAudienceOrphanedAttributionSummary,
} from "../server/services/audience-orphaned-attribution-service";

beforeEach(async () => {
  await db.delete(audienceGatewayEvents);
  await db.delete(audienceLegacyTokenDispatchAlerts);
  await db.delete(audienceConnectorRotationNotifications);
});

function findRow(summary: Awaited<ReturnType<typeof getAudienceOrphanedAttributionSummary>>, key: string) {
  const row = summary.rows.find((r) => r.key === key);
  assert.ok(row, `missing row for ${key}`);
  return row!;
}

test("summary returns one row per tracked attribution column with zero counts when empty", async () => {
  const summary = await getAudienceOrphanedAttributionSummary();
  assert.equal(summary.rows.length, AUDIENCE_ORPHANED_ATTRIBUTION_TARGETS.length);
  assert.equal(summary.totalOrphanRows, 0);
  for (const row of summary.rows) {
    assert.equal(row.nullCount, 0, `${row.key} expected 0 nulls`);
    assert.equal(row.totalCount, 0, `${row.key} expected 0 total`);
    assert.equal(row.error, null);
  }
});

test("summary counts NULL gateway-event attribution columns", async () => {
  await recordGatewayEvent({
    name: "audience.gateway_send_blocked",
    connectorId: null,
    commandId: null,
    platform: null,
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_simulated",
    connectorId: "c_known",
    commandId: "cmd_known",
    platform: "youtube",
  });

  const summary = await getAudienceOrphanedAttributionSummary();
  const conn = findRow(summary, "audience_gateway_events.connector_id");
  assert.equal(conn.nullCount, 1);
  assert.equal(conn.totalCount, 2);
  const cmd = findRow(summary, "audience_gateway_events.command_id");
  assert.equal(cmd.nullCount, 1);
  const plat = findRow(summary, "audience_gateway_events.platform");
  assert.equal(plat.nullCount, 1);
  assert.equal(summary.totalOrphanRows, 3);
});

test("summary counts NULL legacy-token dispatch-alert columns", async () => {
  await db.insert(audienceLegacyTokenDispatchAlerts).values({
    alertId: "alert_1",
    connectorId: null,
    platform: null,
    commandId: null,
    reason: "sent",
  } as any);
  await db.insert(audienceLegacyTokenDispatchAlerts).values({
    alertId: "alert_2",
    connectorId: "c_present",
    platform: "youtube",
    commandId: "cmd_present",
    reason: "sent",
  } as any);

  const summary = await getAudienceOrphanedAttributionSummary();
  assert.equal(findRow(summary, "audience_legacy_token_dispatch_alerts.connector_id").nullCount, 1);
  assert.equal(findRow(summary, "audience_legacy_token_dispatch_alerts.platform").nullCount, 1);
  assert.equal(findRow(summary, "audience_legacy_token_dispatch_alerts.command_id").nullCount, 1);
  assert.equal(findRow(summary, "audience_legacy_token_dispatch_alerts.connector_id").totalCount, 2);
});

test("summary counts NULL connector-rotation rotated_by entries", async () => {
  await db.insert(audienceConnectorRotationNotifications).values({
    notificationId: "n1",
    connectorId: "c1",
    platform: "youtube",
    action: "rotate",
    rotatedBy: null,
    event: {},
    reason: "sent",
  } as any);
  await db.insert(audienceConnectorRotationNotifications).values({
    notificationId: "n2",
    connectorId: "c1",
    platform: "youtube",
    action: "rotate",
    rotatedBy: "root_admin",
    event: {},
    reason: "sent",
  } as any);

  const row = findRow(
    await getAudienceOrphanedAttributionSummary(),
    "audience_connector_rotation_notifications.rotated_by",
  );
  assert.equal(row.nullCount, 1);
  assert.equal(row.totalCount, 2);
});

test("each target carries a stable backfill status + doc link", async () => {
  const summary = await getAudienceOrphanedAttributionSummary();
  for (const row of summary.rows) {
    assert.ok(["backfillable", "manual_only", "no_backfill_path"].includes(row.backfillStatus));
    assert.equal(row.docHref, "/docs/audience-orphaned-attribution");
    if (row.backfillStatus === "backfillable") {
      assert.ok(row.backfillCommand && row.backfillCommand.startsWith("tsx scripts/"));
    }
  }
});
