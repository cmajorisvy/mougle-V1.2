/**
 * Tests for the connector-attribution backfill (Task #583).
 *
 * Covers the one-shot backfill script that walks `audience_gateway_events`
 * rows with NULL `connector_id` + non-null `command_id`, joins back to
 * `audience_moderation_commands` to fill the connector, and the
 * `countGatewayEventsWithoutConnector` helper used by the admin UI hint.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

import { db } from "../server/db";
import { audienceGatewayEvents } from "../shared/omni-channel-audience-schema";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import {
  countGatewayEventsWithoutConnector,
  recordGatewayEvent,
} from "../server/services/audience-gateway-event-log-service";
import { backfillGatewayEventConnectors } from "../scripts/backfill-audience-gateway-event-connectors";

function fullPerms() {
  return {
    canReadComments: true,
    canReadLiveChat: true,
    canHideComment: true,
    canDeleteComment: true,
    canReply: true,
    canPin: true,
    canBanUser: true,
    canTimeoutUser: true,
    canEditOwnReply: true,
  };
}

async function buildCommand(connectorId: string, extId: string) {
  const svc = omniChannelAudienceSafetyService;
  await svc.registerConnector({
    connectorId,
    platform: "youtube",
    accountId: connectorId,
    displayName: connectorId,
    permissions: fullPerms(),
    apiAccessMode: "official_api",
  });
  const m = await svc.ingestAudienceMessage({
    connectorId,
    platform: "youtube",
    externalMessageId: extId,
    externalAuthorId: "author_x",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  return svc.buildAudienceModerationCommand({
    decisionId: d.decisionId,
    requestedAction: "hide_comment",
    requestedBy: "root_admin",
    commandMode: "future_platform_gateway",
  });
}

beforeEach(async () => {
  await omniChannelAudienceSafetyService.reset();
  await db.delete(audienceGatewayEvents);
});

test("backfill fills connector_id from the matching moderation command", async () => {
  const cmd = await buildCommand("c_bk1", "ext_bk1");
  await recordGatewayEvent({
    name: "audience.gateway_send_simulated",
    commandId: cmd.commandId,
    connectorId: null,
    platform: "youtube",
  });
  assert.equal(await countGatewayEventsWithoutConnector(), 1);

  const summary = await backfillGatewayEventConnectors();
  assert.equal(summary.matched, 1);
  assert.equal(summary.updated, 1);
  assert.equal(summary.remainingNull, 0);

  const rows: any = await db.execute(sql`
    SELECT connector_id FROM audience_gateway_events WHERE command_id = ${cmd.commandId}
  `);
  assert.equal(rows.rows?.[0]?.connector_id, "c_bk1");
  assert.equal(await countGatewayEventsWithoutConnector(), 0);
});

test("backfill --dry-run reports counts without writing", async () => {
  const cmd = await buildCommand("c_bk2", "ext_bk2");
  await recordGatewayEvent({
    name: "audience.gateway_send_blocked",
    commandId: cmd.commandId,
    connectorId: null,
  });

  const summary = await backfillGatewayEventConnectors({ dryRun: true });
  assert.equal(summary.matched, 1);
  assert.equal(summary.updated, 0);
  assert.equal(summary.remainingNull, 1);
  assert.equal(summary.dryRun, true);
  assert.equal(await countGatewayEventsWithoutConnector(), 1);
});

test("backfill reports rows that genuinely can't be attributed", async () => {
  // No command_id at all.
  await recordGatewayEvent({
    name: "audience.gateway_send_blocked",
    commandId: null,
    connectorId: null,
  });
  // command_id references a command that doesn't exist.
  await recordGatewayEvent({
    name: "audience.gateway_send_blocked",
    commandId: "cmd_does_not_exist",
    connectorId: null,
  });

  const summary = await backfillGatewayEventConnectors();
  assert.equal(summary.totalNull, 2);
  assert.equal(summary.matched, 0);
  assert.equal(summary.updated, 0);
  assert.equal(summary.unmatchedNoCommandId, 1);
  assert.equal(summary.unmatchedCommandMissing, 1);
  assert.equal(summary.remainingNull, 2);
});

test("backfill leaves rows that already have a connector untouched", async () => {
  const cmd = await buildCommand("c_bk3", "ext_bk3");
  await recordGatewayEvent({
    name: "audience.gateway_send_simulated",
    commandId: cmd.commandId,
    connectorId: "c_explicit",
  });
  const summary = await backfillGatewayEventConnectors();
  assert.equal(summary.totalNull, 0);
  assert.equal(summary.updated, 0);

  const rows: any = await db.execute(sql`
    SELECT connector_id FROM audience_gateway_events WHERE command_id = ${cmd.commandId}
  `);
  assert.equal(rows.rows?.[0]?.connector_id, "c_explicit");
});
