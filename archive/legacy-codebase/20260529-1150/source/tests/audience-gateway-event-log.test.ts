/**
 * Tests for the permanent gateway event log (Task #421).
 *
 * Covers: persisting every emission of `audience.gateway_send_simulated`
 * / `_dispatched` / `_blocked` via the audience platform gateway,
 * paginated reads with date-range filtering, and pruning by the audience
 * retention sweeper on the same schedule as the other audit tables.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "../server/db";
import { audienceGatewayEvents } from "../shared/omni-channel-audience-schema";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { AudiencePlatformGatewayService } from "../server/services/audience-platform-gateway-service";
import {
  listGatewayEvents,
  pruneGatewayEventsOlderThan,
  recordGatewayEvent,
} from "../server/services/audience-gateway-event-log-service";
import {
  resetAudienceRetentionStateForTests,
  runRetentionSweep,
} from "../server/services/audience-retention-service";

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

beforeEach(async () => {
  await omniChannelAudienceSafetyService.reset();
  await db.delete(audienceGatewayEvents);
  resetAudienceRetentionStateForTests();
  delete process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH;
});

test("gateway dispatch persists a simulated-send row", async () => {
  const svc = omniChannelAudienceSafetyService;
  const gw = new AudiencePlatformGatewayService(svc);
  await svc.registerConnector({
    connectorId: "c_yt",
    platform: "youtube",
    accountId: "yt",
    displayName: "yt",
    permissions: fullPerms(),
    apiAccessMode: "official_api",
  });
  await svc.approvePlatformSend("c_yt", true, "root_admin_1");
  const m = await svc.ingestAudienceMessage({
    connectorId: "c_yt",
    platform: "youtube",
    externalMessageId: "ext_yt_1",
    externalAuthorId: "author_a",
    authorDisplayName: "A",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  const cmd = await svc.buildAudienceModerationCommand({
    decisionId: d.decisionId,
    requestedAction: "hide_comment",
    requestedBy: "root_admin",
    commandMode: "future_platform_gateway",
  });
  const result = await gw.dispatch(cmd.commandId, { adminId: "admin_999" });
  assert.equal(result.simulated, true);
  const log = await listGatewayEvents({ limit: 50 });
  const sim = log.events.find(
    (e) => e.name === "audience.gateway_send_simulated" && e.payload.commandId === cmd.commandId,
  );
  assert.ok(sim, "expected a simulated-send row in the permanent log");
  assert.equal(sim!.payload.platform, "youtube");
  assert.equal(sim!.payload.adminId, "admin_999");
});

test("gateway dispatch persists a blocked row when refused", async () => {
  const svc = omniChannelAudienceSafetyService;
  const gw = new AudiencePlatformGatewayService(svc);
  await svc.registerConnector({
    connectorId: "c_yt2",
    platform: "youtube",
    accountId: "yt2",
    displayName: "yt2",
    permissions: fullPerms(),
    apiAccessMode: "official_api",
  });
  const m = await svc.ingestAudienceMessage({
    connectorId: "c_yt2",
    platform: "youtube",
    externalMessageId: "ext_yt_2",
    externalAuthorId: "author_b",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  const cmd = await svc.buildAudienceModerationCommand({
    decisionId: d.decisionId,
    requestedAction: "hide_comment",
    requestedBy: "root_admin",
    commandMode: "future_platform_gateway",
  });
  const result = await gw.dispatch(cmd.commandId);
  assert.equal(result.dispatched, false);
  assert.equal(result.blockerReason, "connector_not_platform_send_approved");
  const log = await listGatewayEvents({ limit: 50 });
  const blocked = log.events.find(
    (e) => e.name === "audience.gateway_send_blocked" && e.payload.commandId === cmd.commandId,
  );
  assert.ok(blocked, "expected a blocked row in the permanent log");
  assert.equal(blocked!.payload.reason, "connector_not_platform_send_approved");
});

test("listGatewayEvents filters by date range and paginates", async () => {
  const now = Date.now();
  await recordGatewayEvent({
    name: "audience.gateway_send_simulated",
    commandId: "cmd_a",
    platform: "youtube",
    requestedAction: "hide_comment",
    emittedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_dispatched",
    commandId: "cmd_b",
    platform: "facebook",
    requestedAction: "delete_comment",
    status: 200,
    emittedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_blocked",
    commandId: "cmd_c",
    platform: "x",
    requestedAction: "ban_user",
    reason: "rate_limit_exceeded",
    emittedAt: new Date(now - 30 * 60 * 1000),
  });

  const all = await listGatewayEvents({ limit: 10 });
  assert.equal(all.total, 3);
  assert.equal(all.events.length, 3);
  // Newest first.
  assert.equal(all.events[0].payload.commandId, "cmd_c");
  assert.equal(all.events[2].payload.commandId, "cmd_a");

  const recent = await listGatewayEvents({
    limit: 10,
    fromDate: new Date(now - 5 * 24 * 60 * 60 * 1000),
  });
  assert.equal(recent.total, 2);
  assert.deepEqual(
    recent.events.map((e) => e.payload.commandId).sort(),
    ["cmd_b", "cmd_c"],
  );

  const page = await listGatewayEvents({ limit: 1, offset: 1 });
  assert.equal(page.total, 3);
  assert.equal(page.events.length, 1);
  assert.equal(page.events[0].payload.commandId, "cmd_b");
});

test("listGatewayEvents filters by platform and by kind (Task #491)", async () => {
  const now = Date.now();
  await recordGatewayEvent({
    name: "audience.gateway_send_simulated",
    commandId: "cmd_yt_sim",
    platform: "youtube",
    emittedAt: new Date(now - 60 * 1000),
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_dispatched",
    commandId: "cmd_yt_disp",
    platform: "youtube",
    status: 200,
    emittedAt: new Date(now - 50 * 1000),
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_blocked",
    commandId: "cmd_yt_blk",
    platform: "youtube",
    reason: "rate_limit_exceeded",
    emittedAt: new Date(now - 40 * 1000),
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_blocked",
    commandId: "cmd_fb_blk",
    platform: "facebook",
    reason: "connector_not_platform_send_approved",
    emittedAt: new Date(now - 30 * 1000),
  });

  const onlyYoutube = await listGatewayEvents({ limit: 100, platform: "youtube" });
  assert.equal(onlyYoutube.total, 3);
  assert.ok(onlyYoutube.events.every((e) => e.payload.platform === "youtube"));

  const onlyBlocked = await listGatewayEvents({ limit: 100, kind: "blocked" });
  assert.equal(onlyBlocked.total, 2);
  assert.ok(
    onlyBlocked.events.every((e) => e.name === "audience.gateway_send_blocked"),
  );

  const ytBlocked = await listGatewayEvents({
    limit: 100,
    platform: "youtube",
    kind: "blocked",
  });
  assert.equal(ytBlocked.total, 1);
  assert.equal(ytBlocked.events[0].payload.commandId, "cmd_yt_blk");

  const ytDispatched = await listGatewayEvents({
    limit: 100,
    platform: "youtube",
    kind: "dispatched",
  });
  assert.equal(ytDispatched.total, 1);
  assert.equal(ytDispatched.events[0].payload.commandId, "cmd_yt_disp");
});

test("listGatewayEvents filters by connectorId (Task #532)", async () => {
  const now = Date.now();
  await recordGatewayEvent({
    name: "audience.gateway_send_simulated",
    commandId: "cmd_yt_a",
    connectorId: "c_yt_a",
    platform: "youtube",
    emittedAt: new Date(now - 60 * 1000),
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_dispatched",
    commandId: "cmd_yt_b",
    connectorId: "c_yt_b",
    platform: "youtube",
    status: 200,
    emittedAt: new Date(now - 50 * 1000),
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_blocked",
    commandId: "cmd_yt_b_blk",
    connectorId: "c_yt_b",
    platform: "youtube",
    reason: "rate_limit_exceeded",
    emittedAt: new Date(now - 40 * 1000),
  });

  const onlyB = await listGatewayEvents({ limit: 100, connectorId: "c_yt_b" });
  assert.equal(onlyB.total, 2);
  assert.ok(onlyB.events.every((e) => e.payload.connectorId === "c_yt_b"));

  const onlyA = await listGatewayEvents({ limit: 100, connectorId: "c_yt_a" });
  assert.equal(onlyA.total, 1);
  assert.equal(onlyA.events[0].payload.commandId, "cmd_yt_a");

  const platformAndConnector = await listGatewayEvents({
    limit: 100,
    platform: "youtube",
    connectorId: "c_yt_b",
    kind: "blocked",
  });
  assert.equal(platformAndConnector.total, 1);
  assert.equal(platformAndConnector.events[0].payload.commandId, "cmd_yt_b_blk");
});

test("gateway dispatch persists the connectorId on every kind of row (Task #532)", async () => {
  const svc = omniChannelAudienceSafetyService;
  const gw = new AudiencePlatformGatewayService(svc);
  // Two YouTube connectors on the same account — exactly the scenario
  // Task #532 calls out (admins need to isolate one channel's traffic).
  for (const id of ["c_yt_one", "c_yt_two"]) {
    await svc.registerConnector({
      connectorId: id,
      platform: "youtube",
      accountId: "shared_acct",
      displayName: id,
      permissions: fullPerms(),
      apiAccessMode: "official_api",
    });
  }
  await svc.approvePlatformSend("c_yt_one", true, "root_admin");

  // Connector one: ends up simulated (approved, no live dispatch).
  const m1 = await svc.ingestAudienceMessage({
    connectorId: "c_yt_one",
    platform: "youtube",
    externalMessageId: "ext_one_1",
    externalAuthorId: "author_one",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d1 = await svc.evaluateAudienceSafety(m1.messageId);
  const cmd1 = await svc.buildAudienceModerationCommand({
    decisionId: d1.decisionId,
    requestedAction: "hide_comment",
    requestedBy: "root_admin",
    commandMode: "future_platform_gateway",
  });
  await gw.dispatch(cmd1.commandId);

  // Connector two: not approved, hits the blocked path.
  const m2 = await svc.ingestAudienceMessage({
    connectorId: "c_yt_two",
    platform: "youtube",
    externalMessageId: "ext_two_1",
    externalAuthorId: "author_two",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d2 = await svc.evaluateAudienceSafety(m2.messageId);
  const cmd2 = await svc.buildAudienceModerationCommand({
    decisionId: d2.decisionId,
    requestedAction: "hide_comment",
    requestedBy: "root_admin",
    commandMode: "future_platform_gateway",
  });
  await gw.dispatch(cmd2.commandId);

  const oneEvents = await listGatewayEvents({ limit: 100, connectorId: "c_yt_one" });
  assert.ok(oneEvents.total >= 1);
  assert.ok(oneEvents.events.every((e) => e.payload.connectorId === "c_yt_one"));
  const twoEvents = await listGatewayEvents({ limit: 100, connectorId: "c_yt_two" });
  assert.ok(twoEvents.total >= 1);
  assert.ok(twoEvents.events.every((e) => e.payload.connectorId === "c_yt_two"));
  // Sanity: the two streams are disjoint even though they share a platform.
  const overlap = oneEvents.events.filter((a) =>
    twoEvents.events.some((b) => b.id === a.id),
  );
  assert.equal(overlap.length, 0);
});

test("retention sweep prunes gateway events older than the cutoff", async () => {
  const now = Date.now();
  await recordGatewayEvent({
    name: "audience.gateway_send_simulated",
    commandId: "cmd_old",
    platform: "youtube",
    emittedAt: new Date(now - 120 * 24 * 60 * 60 * 1000),
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_simulated",
    commandId: "cmd_new",
    platform: "youtube",
    emittedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
  });
  const before = await listGatewayEvents({ limit: 100 });
  assert.equal(before.total, 2);

  const result = await runRetentionSweep(90, "manual");
  assert.equal(result.error, null);
  assert.ok(result.gatewayEventsPruned >= 1, "expected >=1 gateway event pruned");
  const after = await listGatewayEvents({ limit: 100 });
  assert.equal(after.total, 1);
  assert.equal(after.events[0].payload.commandId, "cmd_new");
});

test("pruneGatewayEventsOlderThan returns the count of deleted rows", async () => {
  await recordGatewayEvent({
    name: "audience.gateway_send_blocked",
    commandId: "cmd_x",
    emittedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_blocked",
    commandId: "cmd_y",
    emittedAt: new Date(),
  });
  const removed = await pruneGatewayEventsOlderThan(
    new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  );
  assert.equal(removed, 1);
  const left = await listGatewayEvents({ limit: 100 });
  assert.equal(left.total, 1);
  assert.equal(left.events[0].payload.commandId, "cmd_y");
});
