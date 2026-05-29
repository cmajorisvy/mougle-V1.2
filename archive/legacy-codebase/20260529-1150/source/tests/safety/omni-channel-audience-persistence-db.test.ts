/**
 * Task #384 — Verify the audience audit trail survives a server restart.
 *
 * Task #373 moved audience connectors, messages, decisions and moderation
 * commands out of in-process `Map`s and into Postgres so the compliance
 * audit trail outlives a process restart. The existing 22 in-process tests
 * in `tests/omni-channel-audience.test.ts` only exercise behaviour within
 * one service instance — nothing asserts that ingesting + evaluating in
 * one `OmniChannelAudienceSafetyService` instance and then constructing a
 * fresh second instance returns the same rows from the DB.
 *
 * This test performs that real round-trip:
 *   - Instance A: registerConnector → ingestAudienceMessage →
 *     evaluateAudienceSafety → buildAudienceModerationCommand.
 *   - Instance B (newly constructed, no shared state) reads back via
 *     listMessages / listDecisions / listCommands and asserts every
 *     persisted field — locked safetyEnvelope, hashed authorId, redacted
 *     metadata, scores, reason codes, draft/admin envelope — matches what
 *     instance A wrote.
 *
 * SAFETY:
 *   - Uses unique `t384-*` ids and a per-run productionId so it cannot
 *     collide with rows written by a running dev server.
 *   - Cleans up every row it inserts (and the connector) in `after()` so
 *     it is safe to run against the shared dev DB.
 *   - Does NOT call `svc.reset()` — that path TRUNCATEs the audience
 *     tables in NODE_ENV=test and would wipe out other test fixtures /
 *     dev data.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "../../server/db";
import {
  audienceChannelConnectors,
  audienceMessages,
  audienceModerationCommands,
  audienceSafetyDecisions,
} from "../../shared/schema";
import { OmniChannelAudienceSafetyService } from "../../server/services/omni-channel-audience-safety-service";
import { AUDIENCE_SAFETY_ENVELOPE_LOCKED } from "../../shared/omni-channel-audience-schema";

const RUN_ID = randomUUID().slice(0, 8);
const CONNECTOR_ID = `t384-conn-${RUN_ID}`;
const PRODUCTION_ID = `t384-prod-${RUN_ID}`;
const EXTERNAL_MESSAGE_ID = `t384-ext-${RUN_ID}`;
const EXTERNAL_AUTHOR_ID = `t384-secret-author-${RUN_ID}`;

// State captured from instance A so instance B's reads can be compared
// byte-for-byte against what was originally written.
let writtenMessageId: string;
let writtenDecisionId: string;
let writtenCommandId: string;

before(async () => {
  const a = new OmniChannelAudienceSafetyService();
  await a.registerConnector({
    connectorId: CONNECTOR_ID,
    platform: "youtube",
    accountId: `acct-${RUN_ID}`,
    displayName: "task-384 connector",
    permissions: {
      canReadComments: true,
      canReadLiveChat: true,
      canHideComment: true,
      canDeleteComment: true,
      canReply: true,
      canPin: true,
      canBanUser: true,
      canTimeoutUser: true,
      canEditOwnReply: true,
    },
  });

  const message = await a.ingestAudienceMessage({
    connectorId: CONNECTOR_ID,
    platform: "youtube",
    externalMessageId: EXTERNAL_MESSAGE_ID,
    externalAuthorId: EXTERNAL_AUTHOR_ID,
    authorDisplayName: "Author 384",
    // Abusive text guarantees a hard-blocker decision with reasonCodes
    // populated and allowedForModerationAction === true so the moderation
    // command path also exercises a non-trivial branch.
    messageText: "you are an idiot",
    messageType: "comment",
    productionId: PRODUCTION_ID,
    rawMetadata: {
      email: "leak@example.com",
      ip: "10.0.0.1",
      color: "blue",
    },
  });
  writtenMessageId = message.messageId;

  const decision = await a.evaluateAudienceSafety(writtenMessageId);
  writtenDecisionId = decision.decisionId;

  const command = await a.buildAudienceModerationCommand({
    decisionId: writtenDecisionId,
    requestedAction: "hide_comment",
    requestedBy: "ai_moderator",
  });
  writtenCommandId = command.commandId;
});

after(async () => {
  // Delete in child→parent order even though there are no real FKs
  // between these tables — keeps the test idempotent and easy to reason
  // about.
  if (writtenCommandId) {
    await db
      .delete(audienceModerationCommands)
      .where(eq(audienceModerationCommands.commandId, writtenCommandId));
  }
  if (writtenDecisionId) {
    await db
      .delete(audienceSafetyDecisions)
      .where(eq(audienceSafetyDecisions.decisionId, writtenDecisionId));
  }
  if (writtenMessageId) {
    await db
      .delete(audienceMessages)
      .where(eq(audienceMessages.messageId, writtenMessageId));
  }
  await db
    .delete(audienceChannelConnectors)
    .where(eq(audienceChannelConnectors.connectorId, CONNECTOR_ID));
});

describe("OmniChannelAudienceSafetyService — audit trail survives a fresh service instance", () => {
  it("listMessages on a fresh instance returns the persisted message with hashed authorId, redacted metadata and locked envelope", async () => {
    const b = new OmniChannelAudienceSafetyService();
    const messages = await b.listMessages(PRODUCTION_ID, 100);
    const got = messages.find((m) => m.messageId === writtenMessageId);
    assert.ok(got, "ingested message must be readable by a fresh service instance");

    assert.equal(got.connectorId, CONNECTOR_ID);
    assert.equal(got.platform, "youtube");
    assert.equal(got.externalMessageId, EXTERNAL_MESSAGE_ID);
    assert.equal(got.messageText, "you are an idiot");
    assert.equal(got.messageType, "comment");
    assert.equal(got.productionId, PRODUCTION_ID);

    // authorId must be hashed (never the raw secret) and stable across
    // instances.
    assert.notEqual(got.externalAuthorIdHash, EXTERNAL_AUTHOR_ID);
    assert.equal(got.externalAuthorIdHash.length, 32);
    assert.match(got.externalAuthorIdHash, /^[a-f0-9]{32}$/);

    // PII keys must have been stripped on write; the harmless key survives.
    assert.equal(got.rawMetadataRedacted.email, undefined);
    assert.equal(got.rawMetadataRedacted.ip, undefined);
    assert.equal(got.rawMetadataRedacted.color, "blue");

    // Locked envelope + draft/admin shell rehydrates byte-for-byte.
    assert.equal(got.approvalStatus, "draft");
    assert.equal(got.visibility, "admin_only_internal");
    assert.equal(got.realSendAllowed, false);
    assert.equal(got.executionEnabled, false);
    assert.deepEqual(got.safetyEnvelope, { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED });
  });

  it("listDecisions on a fresh instance returns the persisted decision with scores, reason codes and locked envelope", async () => {
    const b = new OmniChannelAudienceSafetyService();
    const decisions = await b.listDecisions(PRODUCTION_ID, 100);
    const got = decisions.find((d) => d.decisionId === writtenDecisionId);
    assert.ok(got, "evaluated decision must be readable by a fresh service instance");

    assert.equal(got.messageId, writtenMessageId);
    assert.equal(got.platform, "youtube");
    assert.ok(got.reasonCodes.includes("abuse"), "abuse hard-blocker must survive the round-trip");
    assert.equal(got.allowedForRobotSpeech, false);
    assert.equal(got.allowedForAnchorSpeech, false);
    assert.equal(got.allowedForScreenDisplay, false);
    assert.equal(got.allowedForModerationAction, true);
    assert.equal(got.cAudienceSafety, 0);

    // Scores jsonb must rehydrate as a populated object (not undefined /
    // null) — a regression here would mean the column was renamed or the
    // mapper dropped the field.
    assert.equal(typeof got.scores, "object");
    assert.ok(got.scores !== null);
    assert.equal(typeof got.scores.abuseScore, "number");
    assert.ok(got.scores.abuseScore >= 0.5);

    assert.equal(got.approvalStatus, "draft");
    assert.equal(got.visibility, "admin_only_internal");
    assert.equal(got.notPublished, true);
    assert.equal(got.realSendAllowed, false);
    assert.equal(got.executionEnabled, false);
    assert.deepEqual(got.safetyEnvelope, { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED });
  });

  it("listCommands on a fresh instance returns the persisted moderation command with simulation_only + platformSendAllowed:false intact", async () => {
    const b = new OmniChannelAudienceSafetyService();
    const commands = await b.listCommands(500);
    const got = commands.find((c) => c.commandId === writtenCommandId);
    assert.ok(got, "moderation command must be readable by a fresh service instance");

    assert.equal(got.decisionId, writtenDecisionId);
    assert.equal(got.platform, "youtube");
    assert.equal(got.connectorId, CONNECTOR_ID);
    assert.equal(got.externalMessageId, EXTERNAL_MESSAGE_ID);
    assert.equal(got.requestedAction, "hide_comment");
    assert.equal(got.requestedBy, "ai_moderator");
    assert.equal(got.commandMode, "simulation_only");
    assert.equal(got.commandAllowed, true);
    assert.equal(got.platformSendAllowed, false);
    assert.equal(got.realSendAllowed, false);
    assert.equal(got.executionEnabled, false);
    assert.equal(got.approvalStatus, "draft");
    assert.equal(got.visibility, "admin_only_internal");
    assert.deepEqual(got.safetyEnvelope, { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED });
  });
});
