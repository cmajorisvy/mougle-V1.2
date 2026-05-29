import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  OmniChannelAudienceSafetyService,
  omniChannelAudienceSafetyService,
  computeAudienceAuditExportOutlier,
  getAudienceAuditExportOutlierConfig,
  setAudienceAuditExportOutlierConfig,
  DEFAULT_AUDIENCE_AUDIT_EXPORT_OUTLIER_CONFIG,
} from "../server/services/omni-channel-audience-safety-service";
import { neuralNewsroomBus } from "../server/services/neural-newsroom-bus";
import { handleAuditExportEvent } from "../server/services/audience-audit-export-notifier";
import { computeCTotal } from "../server/services/neural-newsroom/confidence-vector";
import {
  buildAudienceAuditCsv,
  buildAudienceAuditExportLogCsv,
} from "../server/routes/omni-channel-audience-routes";
import type { AudiencePlatform } from "../shared/omni-channel-audience-schema";

const svc = omniChannelAudienceSafetyService;

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

async function ensureConnector(connectorId: string, platform: AudiencePlatform, perms = fullPerms()) {
  if (!(await svc.getConnector(connectorId))) {
    await svc.registerConnector({
      connectorId,
      platform,
      accountId: `${platform}_acct`,
      displayName: `${platform} account`,
      permissions: perms,
    });
  }
}

beforeEach(async () => {
  await svc.reset();
});

async function ingest(connectorId: string, platform: AudiencePlatform, text: string, opts: Partial<{
  messageType: any;
  storyId: string | null;
  productionId: string | null;
  giftValue: number | null;
}> = {}) {
  await ensureConnector(connectorId, platform);
  return svc.ingestAudienceMessage({
    connectorId,
    platform,
    externalMessageId: `ext_${Math.random().toString(36).slice(2, 8)}`,
    externalAuthorId: "author_1",
    authorDisplayName: "Author",
    messageText: text,
    messageType: opts.messageType ?? "comment",
    storyId: opts.storyId ?? null,
    productionId: opts.productionId ?? null,
    giftValue: opts.giftValue ?? null,
  });
}

/* 1 */
test("YouTube spam is blocked from speech / display / auto-reply", async () => {
  const m = await ingest("c_yt", "youtube", "CLICK HERE for FREE MONEY https://bit.ly/x https://bit.ly/y");
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.ok(d.reasonCodes.includes("spam"));
  assert.equal(d.allowedForRobotSpeech, false);
  assert.equal(d.allowedForScreenDisplay, false);
  assert.equal(d.allowedForAutoReply, false);
  assert.equal(d.cAudienceSafety, 0);
});

/* 2 */
test("Facebook abusive comment is blocked", async () => {
  const m = await ingest("c_fb", "facebook", "you are an idiot and a moron, shut up");
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.ok(d.reasonCodes.includes("abuse"));
  assert.equal(d.allowedForAnchorSpeech, false);
  assert.equal(d.allowedForScreenDisplay, false);
});

/* 3 */
test("X misinformation reply is blocked", async () => {
  const m = await ingest("c_x", "x", "BREAKING: the president has died in an attack", { messageType: "reply" });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.ok(d.reasonCodes.includes("misinformation"));
  assert.equal(d.allowedForAnchorSpeech, false);
  assert.equal(d.requiresHumanReview, true);
});

/* 4 */
test("Telegram PII message is blocked from screen display", async () => {
  const m = await ingest("c_tg", "telegram", "contact me at user@example.com or +1 (555) 123-4567");
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.ok(d.reasonCodes.includes("pii"));
  assert.equal(d.allowedForScreenDisplay, false);
});

/* 5 */
test("unsafe gift is not acknowledged (spam superchat)", async () => {
  const m = await ingest("c_yt", "youtube", "CLICK HERE for FREE MONEY https://bit.ly/x https://bit.ly/y", {
    messageType: "superchat",
    giftValue: 50,
  });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.ok(d.reasonCodes.includes("spam"));
  assert.equal(d.action !== "robot_acknowledge", true);
  assert.equal(d.allowedForRobotSpeech, false);
});

/* 6 */
test("safe gift CAN be acknowledged in non-sensitive state", async () => {
  const m = await ingest("c_yt", "youtube", "Great show!", {
    messageType: "superchat",
    giftValue: 5,
    storyId: "s_normal",
  });
  svc.setStoryContext({ storyId: "s_normal", sensitivityClass: "normal", verifiedClaims: [] });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.equal(d.action, "robot_acknowledge");
  assert.equal(d.allowedForRobotSpeech, true);
});

/* 7 */
test("sensitive story DISABLES playful gift reaction", async () => {
  const m = await ingest("c_yt", "youtube", "Great show!", {
    messageType: "superchat",
    giftValue: 5,
    storyId: "s_disaster",
  });
  svc.setStoryContext({ storyId: "s_disaster", sensitivityClass: "disaster", verifiedClaims: [] });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.notEqual(d.action, "robot_acknowledge");
  assert.equal(d.requiresHumanReview, true);
  assert.equal(d.sensitivityOverride, true);
});

/* 8 */
test("message with PII cannot be displayed on screen even if route requested", async () => {
  const m = await ingest("c_tg", "telegram", "my email is user@example.com");
  await svc.evaluateAudienceSafety(m.messageId);
  const decision = (await svc.listDecisions(undefined, 1))[0];
  const result = await svc.routeSafeHighlightToScreen(decision.decisionId);
  assert.equal(result.routed, false);
});

/* 9 */
test("robot cannot read an abusive message", async () => {
  const m = await ingest("c_fb", "facebook", "you are an idiot");
  await svc.evaluateAudienceSafety(m.messageId);
  const decision = (await svc.listDecisions(undefined, 1))[0];
  const reaction = await svc.buildRobotAudienceReaction(decision.decisionId);
  assert.equal(reaction.canSpeak, false);
  assert.equal(reaction.text, null);
});

/* 10 */
test("anchor cannot read an unsupported BREAKING claim", async () => {
  const m = await ingest("c_x", "x", "BREAKING: nuke war just started");
  await svc.evaluateAudienceSafety(m.messageId);
  const decision = (await svc.listDecisions(undefined, 1))[0];
  const reaction = await svc.buildAnchorAudienceReaction(decision.decisionId);
  assert.equal(reaction.canSpeak, false);
});

/* 11 */
test("platform action is blocked when connector lacks permission", async () => {
  await svc.registerConnector({
    connectorId: "c_limited",
    platform: "instagram",
    accountId: "ig_acct",
    displayName: "ig",
    permissions: { canReadComments: true },
  });
  const m = await svc.ingestAudienceMessage({
    connectorId: "c_limited",
    platform: "instagram",
    externalMessageId: "ext_1",
    externalAuthorId: "a1",
    authorDisplayName: "x",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  const cmd = await svc.buildAudienceModerationCommand({
    decisionId: d.decisionId,
    requestedAction: "hide_comment",
    requestedBy: "ai_moderator",
  });
  assert.equal(cmd.commandAllowed, false);
  assert.equal(cmd.blockerReason, "permission_missing_canHideComment");
  assert.equal(cmd.platformSendAllowed, false);
});

/* 12 */
test("delete/hide/reply commands remain simulation_only by default", async () => {
  const m = await ingest("c_yt", "youtube", "you are an idiot");
  const d = await svc.evaluateAudienceSafety(m.messageId);
  for (const action of ["hide_comment", "delete_comment", "reply", "ban_user", "timeout_user"] as const) {
    const cmd = await svc.buildAudienceModerationCommand({
      decisionId: d.decisionId,
      requestedAction: action,
      requestedBy: "ai_moderator",
    });
    assert.equal(cmd.commandMode, "simulation_only");
    assert.equal(cmd.platformSendAllowed, false);
    assert.equal(cmd.realSendAllowed, false);
    assert.equal(cmd.executionEnabled, false);
  }
});

/* 13 */
test("platformSendAllowed is false by default on every command", async () => {
  const m = await ingest("c_yt", "youtube", "hi");
  const d = await svc.evaluateAudienceSafety(m.messageId);
  const cmd = await svc.buildAudienceModerationCommand({
    decisionId: d.decisionId,
    requestedAction: "reply",
    requestedBy: "ai_moderator",
  });
  assert.equal(cmd.platformSendAllowed, false);
  assert.equal(cmd.safetyEnvelope.platformSendAllowed, false);
});

/* 14-17: no real platform API call (simulate must never call out) */
test("no real YouTube API call on simulate-moderation", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => { fetchCalls++; return new Response("{}"); }) as any;
  try {
    const m = await ingest("c_yt", "youtube", "spam CLICK HERE");
    const d = await svc.evaluateAudienceSafety(m.messageId);
    const cmd = await svc.buildAudienceModerationCommand({
      decisionId: d.decisionId,
      requestedAction: "hide_comment",
      requestedBy: "ai_moderator",
    });
    const sim = await svc.simulateAudienceModerationCommand(cmd.commandId);
    assert.equal(sim.platformSendAllowed, false);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no real Facebook API call", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as any;
  try {
    const m = await ingest("c_fb", "facebook", "idiot");
    const d = await svc.evaluateAudienceSafety(m.messageId);
    const cmd = await svc.buildAudienceModerationCommand({ decisionId: d.decisionId, requestedAction: "hide_comment", requestedBy: "ai_moderator" });
    await svc.simulateAudienceModerationCommand(cmd.commandId);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no real X API call", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as any;
  try {
    const m = await ingest("c_x", "x", "BREAKING: unconfirmed report");
    const d = await svc.evaluateAudienceSafety(m.messageId);
    const cmd = await svc.buildAudienceModerationCommand({ decisionId: d.decisionId, requestedAction: "delete_comment", requestedBy: "root_admin" });
    await svc.simulateAudienceModerationCommand(cmd.commandId);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no real Telegram API call", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as any;
  try {
    const m = await ingest("c_tg", "telegram", "user@example.com");
    const d = await svc.evaluateAudienceSafety(m.messageId);
    const cmd = await svc.buildAudienceModerationCommand({ decisionId: d.decisionId, requestedAction: "hide_comment", requestedBy: "ai_moderator" });
    await svc.simulateAudienceModerationCommand(cmd.commandId);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/* 18 */
test("no social posting — connectors carry realSendAllowed:false and notPublished envelope", async () => {
  await svc.registerConnector({ connectorId: "c_li", platform: "linkedin", accountId: "li", displayName: "li" });
  const connector = (await svc.getConnector("c_li"))!;
  assert.equal(connector.realSendAllowed, false);
  assert.equal(connector.executionEnabled, false);
  assert.equal(connector.safetyEnvelope.notPublished, true);
  assert.equal(connector.safetyEnvelope.platformSendAllowed, false);
});

/* 19 */
test("no publishing on decisions or commands", async () => {
  const m = await ingest("c_yt", "youtube", "hello world");
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.equal(d.notPublished, true);
  assert.equal(d.safetyEnvelope.notPublished, true);
  const cmd = await svc.buildAudienceModerationCommand({ decisionId: d.decisionId, requestedAction: "reply", requestedBy: "ai_moderator" });
  assert.equal(cmd.safetyEnvelope.notPublished, true);
});

/* 20 */
test("no private admin data leak — author id is hashed, raw PII metadata is redacted", async () => {
  const isolated = new OmniChannelAudienceSafetyService();
  await isolated.registerConnector({
    connectorId: "c_yt2",
    platform: "youtube",
    accountId: "y",
    displayName: "y",
    permissions: fullPerms(),
  });
  const m = await isolated.ingestAudienceMessage({
    connectorId: "c_yt2",
    platform: "youtube",
    externalMessageId: "ext_z",
    externalAuthorId: "secret_user_42",
    authorDisplayName: "x",
    messageText: "hi",
    messageType: "comment",
    rawMetadata: { email: "leak@example.com", ip: "1.2.3.4", color: "blue" },
  });
  assert.notEqual(m.externalAuthorIdHash, "secret_user_42");
  assert.equal(m.externalAuthorIdHash.length, 32);
  assert.equal(m.rawMetadataRedacted.email, undefined);
  assert.equal(m.rawMetadataRedacted.ip, undefined);
  assert.equal(m.rawMetadataRedacted.color, "blue");
});

/* 21 */
test("C_total uses C_audience_safety (MIN-based)", () => {
  const cTotal = computeCTotal({
    cSource: 0.95,
    cVerification: 0.95,
    cLicense: 0.95,
    cScreenMatch: 0.95,
    cSensitivity: 0.95,
    cAudienceSafety: 0.0,
    cFallback: 0.95,
  });
  assert.equal(cTotal, 0.0);
});

/* 23 - Task #375: leetspeak / zero-width abuse is detected after normalization */
test("leetspeak and zero-width obfuscation no longer bypasses abuse detection", async () => {
  // "idiot" obfuscated with zero-width chars, leet, and separators
  const m = await ingest("c_yt", "youtube", "you are an \u200Bi.d\u200B1\u200B0t and \u200Bm0r0n");
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.ok(d.reasonCodes.includes("abuse"), `expected abuse, got ${d.reasonCodes.join(",")}`);
  assert.equal(d.allowedForScreenDisplay, false);
});

/* 24 - Task #375: Spanish abuse via lexicon flag */
test("Spanish abuse is blocked when es lexicon is enabled on connector", async () => {
  await svc.registerConnector({
    connectorId: "c_yt_es",
    platform: "youtube",
    accountId: "yt_es",
    displayName: "yt es",
    permissions: fullPerms(),
    featureFlags: { multilingualLexicons: ["es"], aiModerationSecondOpinion: false },
  });
  const m = await svc.ingestAudienceMessage({
    connectorId: "c_yt_es",
    platform: "youtube",
    externalMessageId: "ext_es",
    externalAuthorId: "a_es",
    messageText: "callate idiota pendejo",
    messageType: "comment",
  });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.ok(d.reasonCodes.includes("abuse"));
  assert.equal(d.allowedForRobotSpeech, false);
});

/* 25 - Task #375: same Spanish phrase is NOT flagged when lexicon flag is off */
test("Spanish abuse passes when es lexicon is NOT enabled (feature-flag respected)", async () => {
  await svc.registerConnector({
    connectorId: "c_yt_noflag",
    platform: "youtube",
    accountId: "yt_x",
    displayName: "yt x",
    permissions: fullPerms(),
  });
  const m = await svc.ingestAudienceMessage({
    connectorId: "c_yt_noflag",
    platform: "youtube",
    externalMessageId: "ext_es2",
    externalAuthorId: "a_es2",
    messageText: "callate idiota pendejo",
    messageType: "comment",
  });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.ok(!d.reasonCodes.includes("abuse"));
});

/* 26 - Task #375: Chinese hate is blocked when zh lexicon is enabled */
test("Chinese hate phrase is blocked when zh lexicon enabled", async () => {
  await svc.registerConnector({
    connectorId: "c_yt_zh",
    platform: "youtube",
    accountId: "yt_zh",
    displayName: "yt zh",
    permissions: fullPerms(),
    featureFlags: { multilingualLexicons: ["zh"], aiModerationSecondOpinion: false },
  });
  const m = await svc.ingestAudienceMessage({
    connectorId: "c_yt_zh",
    platform: "youtube",
    externalMessageId: "ext_zh",
    externalAuthorId: "a_zh",
    messageText: "杀死所有敌人",
    messageType: "comment",
  });
  const d = await svc.evaluateAudienceSafety(m.messageId);
  assert.ok(d.reasonCodes.includes("hate"));
});

/* 27 - Task #375: AI second opinion escalates an ambiguous-band message */
test("AI second opinion escalates an ambiguous-band message into a block", async () => {
  await svc.registerConnector({
    connectorId: "c_yt_ai",
    platform: "youtube",
    accountId: "yt_ai",
    displayName: "yt ai",
    permissions: fullPerms(),
    featureFlags: { multilingualLexicons: [], aiModerationSecondOpinion: true },
  });
  // Single "stupid" hit -> abuseScore ~0.5 (in ambiguous band).
  // No call to AI without flag; with flag set + moderator installed, AI moves it to a block.
  let calls = 0;
  svc.setAiModerator(async (_text: string) => {
    calls++;
    return { abuse: 0.9, toxicity: 0.9 };
  });
  const m = await svc.ingestAudienceMessage({
    connectorId: "c_yt_ai",
    platform: "youtube",
    externalMessageId: "ext_ai",
    externalAuthorId: "a_ai",
    messageText: "that take is stupid",
    messageType: "comment",
  });
  const d = await svc.evaluateAudienceSafetyAsync(m.messageId);
  assert.equal(calls, 1);
  assert.ok(d.reasonCodes.includes("abuse"));
  assert.ok(d.reasonCodes.includes("ai_second_opinion_applied"));
  assert.equal(d.allowedForRobotSpeech, false);
  // Cached: second call to the same text reuses cache.
  const m2 = await svc.ingestAudienceMessage({
    connectorId: "c_yt_ai",
    platform: "youtube",
    externalMessageId: "ext_ai_2",
    externalAuthorId: "a_ai_2",
    messageText: "that take is stupid",
    messageType: "comment",
  });
  await svc.evaluateAudienceSafetyAsync(m2.messageId);
  assert.equal(calls, 1, "AI moderator should be cached by message hash");
  svc.setAiModerator(null);
});

/* 28 - Task #375: AI second opinion is NOT called for already-clean messages */
test("AI second opinion is skipped for clean messages and for hard-blocked ones", async () => {
  await svc.registerConnector({
    connectorId: "c_yt_ai2",
    platform: "youtube",
    accountId: "yt_ai2",
    displayName: "yt ai2",
    permissions: fullPerms(),
    featureFlags: { multilingualLexicons: [], aiModerationSecondOpinion: true },
  });
  let calls = 0;
  svc.setAiModerator(async () => { calls++; return { abuse: 0.9 }; });
  // Clean message: all axes 0 -> not ambiguous, skip AI.
  const clean = await svc.ingestAudienceMessage({
    connectorId: "c_yt_ai2", platform: "youtube",
    externalMessageId: "c1", externalAuthorId: "a1",
    messageText: "great show today!", messageType: "comment",
  });
  const dClean = await svc.evaluateAudienceSafetyAsync(clean.messageId);
  assert.equal(dClean.allowedForRobotSpeech, true);
  // Hard-block message: spam already >= 0.5 from a single match? Two links + "free money" pushes well above 0.6.
  const hard = await svc.ingestAudienceMessage({
    connectorId: "c_yt_ai2", platform: "youtube",
    externalMessageId: "c2", externalAuthorId: "a2",
    messageText: "CLICK HERE for FREE MONEY https://bit.ly/x https://bit.ly/y",
    messageType: "comment",
  });
  await svc.evaluateAudienceSafetyAsync(hard.messageId);
  assert.equal(calls, 0, `AI should not be called on clean or unambiguous-blocked messages, got ${calls}`);
  svc.setAiModerator(null);
});

/* 29 - Task #375: AI-rescored decision still passes through the locked envelope */
test("AI-rescored decision still flows through fail-closed envelope", async () => {
  await svc.registerConnector({
    connectorId: "c_yt_ai3",
    platform: "youtube",
    accountId: "yt_ai3",
    displayName: "yt ai3",
    permissions: fullPerms(),
    featureFlags: { aiModerationSecondOpinion: true, multilingualLexicons: [] },
  });
  svc.setAiModerator(async () => ({ abuse: 0.95 }));
  const m = await svc.ingestAudienceMessage({
    connectorId: "c_yt_ai3", platform: "youtube",
    externalMessageId: "e_env", externalAuthorId: "a_env",
    messageText: "that opinion is stupid", messageType: "comment",
  });
  const d = await svc.evaluateAudienceSafetyAsync(m.messageId);
  assert.equal(d.approvalStatus, "draft");
  assert.equal(d.visibility, "admin_only_internal");
  assert.equal(d.realSendAllowed, false);
  assert.equal(d.notPublished, true);
  assert.equal(d.safetyEnvelope.safetyEnvelopeLocked, true);
  assert.equal(d.safetyEnvelope.platformSendAllowed, false);
  svc.setAiModerator(null);
});

/* Task #378 — per-locale lexicon smoke tests (es/pt/fr/de/zh/ar) */
type SmokeCase = {
  locale: "es" | "pt" | "fr" | "de" | "zh" | "ar";
  abuseText: string;
  hateText: string;
  spamText: string;
};
const SMOKE_CASES: SmokeCase[] = [
  {
    locale: "es",
    abuseText: "eres un gilipollas y un subnormal",
    hateText: "muerte a los inmigrantes, fuera de mi pais",
    spamText: "gana dinero rapido, click en mi enlace y sigueme en tiktok",
  },
  {
    locale: "pt",
    abuseText: "voce e um otario, vai se foder fdp",
    hateText: "morte aos refugiados, fora os imigrantes do meu pais",
    spamText: "ganhe dinheiro rapido, me segue no instagram e clique aqui",
  },
  {
    locale: "fr",
    abuseText: "ferme ta gueule espece de connard, va te faire foutre",
    hateText: "mort aux immigres, dehors les arabes hors de mon pays",
    spamText: "gagne de l'argent, clique ici et abonne toi a ma chaine",
  },
  {
    locale: "de",
    abuseText: "halt die fresse du vollpfosten, verpiss dich arschloch",
    hateText: "auslaender raus, alle muslime sollten verschwinden",
    spamText: "verdiene geld schnell, klick hier und abonniere meinen kanal",
  },
  {
    locale: "zh",
    abuseText: "你这个傻逼脑残，去死吧废物",
    hateText: "杀光所有黑鬼，滚出我的国家",
    spamText: "免费赚钱，加我微信，点击这里订阅我的频道",
  },
  {
    locale: "ar",
    abuseText: "اخرس يا حقير يا ابن الكلب",
    hateText: "الموت لكل اللاجئين، اخرجوا من بلادنا",
    spamText: "ربح سريع مضمون، اضغط هنا واشترك في قناتي",
  },
];

// One connector covers all locales (flags-on) to keep DB pool pressure low.
test("Task #378 lexicon smoke: abuse / hate / spam fire across es/pt/fr/de/zh/ar with locale flags on", async () => {
  const allLocales = SMOKE_CASES.map((c) => c.locale);
  await svc.registerConnector({
    connectorId: "c_yt_t378_on",
    platform: "youtube",
    accountId: "yt_t378_on",
    displayName: "yt t378 on",
    permissions: fullPerms(),
    featureFlags: { multilingualLexicons: allLocales, aiModerationSecondOpinion: false },
  });
  for (const c of SMOKE_CASES) {
    const abuseMsg = await svc.ingestAudienceMessage({
      connectorId: "c_yt_t378_on",
      platform: "youtube",
      externalMessageId: `ext_${c.locale}_abuse`,
      externalAuthorId: `a_${c.locale}_abuse`,
      messageText: c.abuseText,
      messageType: "comment",
    });
    const abuseD = await svc.evaluateAudienceSafety(abuseMsg.messageId);
    assert.ok(
      abuseD.reasonCodes.includes("abuse"),
      `[${c.locale}] expected abuse in ${abuseD.reasonCodes.join(",")} for "${c.abuseText}"`,
    );
    assert.equal(abuseD.allowedForRobotSpeech, false);

    const hateMsg = await svc.ingestAudienceMessage({
      connectorId: "c_yt_t378_on",
      platform: "youtube",
      externalMessageId: `ext_${c.locale}_hate`,
      externalAuthorId: `a_${c.locale}_hate`,
      messageText: c.hateText,
      messageType: "comment",
    });
    const hateD = await svc.evaluateAudienceSafety(hateMsg.messageId);
    assert.ok(
      hateD.reasonCodes.includes("hate"),
      `[${c.locale}] expected hate in ${hateD.reasonCodes.join(",")} for "${c.hateText}"`,
    );
    assert.equal(hateD.allowedForScreenDisplay, false);

    const spamMsg = await svc.ingestAudienceMessage({
      connectorId: "c_yt_t378_on",
      platform: "youtube",
      externalMessageId: `ext_${c.locale}_spam`,
      externalAuthorId: `a_${c.locale}_spam`,
      messageText: c.spamText,
      messageType: "comment",
    });
    const spamD = await svc.evaluateAudienceSafety(spamMsg.messageId);
    assert.ok(
      spamD.reasonCodes.includes("spam"),
      `[${c.locale}] expected spam in ${spamD.reasonCodes.join(",")} for "${c.spamText}"`,
    );
    assert.equal(spamD.allowedForRobotSpeech, false);
  }
});

test("Task #378 lexicon smoke: same texts pass for every locale when no lexicon flag is enabled", async () => {
  await svc.registerConnector({
    connectorId: "c_yt_t378_off",
    platform: "youtube",
    accountId: "yt_t378_off",
    displayName: "yt t378 off",
    permissions: fullPerms(),
  });
  for (const c of SMOKE_CASES) {
    const m = await svc.ingestAudienceMessage({
      connectorId: "c_yt_t378_off",
      platform: "youtube",
      externalMessageId: `ext_${c.locale}_noflag_abuse`,
      externalAuthorId: `a_${c.locale}_noflag`,
      messageText: c.abuseText,
      messageType: "comment",
    });
    const d = await svc.evaluateAudienceSafety(m.messageId);
    assert.ok(
      !d.reasonCodes.includes("abuse"),
      `[${c.locale}] expected no abuse without flag, got ${d.reasonCodes.join(",")}`,
    );
  }
});

test("Task #378: every non-en locale lexicon has ~50+ terms per axis", async () => {
  const { MULTILINGUAL_LEXICONS } = await import("../shared/audience-lexicons");
  const MIN_TERMS = 40;
  for (const locale of ["es", "pt", "fr", "de", "zh", "ar"] as const) {
    for (const axis of ["abuse", "hate", "spam"] as const) {
      const list = MULTILINGUAL_LEXICONS[locale][axis];
      assert.ok(
        list.length >= MIN_TERMS,
        `${locale}.${axis} has only ${list.length} terms, expected >= ${MIN_TERMS}`,
      );
      const seen = new Set<string>();
      for (const term of list) {
        const key = term.trim();
        assert.ok(key.length > 0, `${locale}.${axis} contains an empty term`);
        assert.ok(!seen.has(key), `${locale}.${axis} duplicate term: ${key}`);
        seen.add(key);
      }
    }
  }
});

/* 31 */
test("audit-trail export is logged with actor, filters, row counts and timestamp — even for zero rows", async () => {
  const before = await svc.listAuditExports(10);
  const initial = before.rows.length;
  const initialTotal = before.total;

  // Zero-row export: no messages exist for this productionId.
  const data = await svc.exportAuditTrail({ productionId: "prod_nonexistent" });
  const logged = await svc.recordAuditExport({
    actorId: "test_root_admin",
    actorType: "root_admin",
    actorRole: "super_admin",
    format: "json",
    filters: data.filters,
    rowCounts: {
      connectors: data.connectors.length,
      messages: data.messages.length,
      decisions: data.decisions.length,
      commands: data.commands.length,
    },
  });
  assert.equal(logged.rowCounts.total, 0);
  assert.equal(logged.actorId, "test_root_admin");
  assert.equal(logged.format, "json");
  assert.equal(logged.filters.productionId, "prod_nonexistent");
  assert.ok(logged.exportId.startsWith("aud_exp_"));
  assert.ok(logged.exportedAt);

  // Non-zero export.
  await ingest("c_yt", "youtube", "great show!", { productionId: "prod_demo" });
  const data2 = await svc.exportAuditTrail({ productionId: "prod_demo" });
  await svc.recordAuditExport({
    actorId: "test_root_admin",
    actorType: "root_admin",
    actorRole: "super_admin",
    format: "csv",
    filters: data2.filters,
    rowCounts: {
      connectors: data2.connectors.length,
      messages: data2.messages.length,
      decisions: data2.decisions.length,
      commands: data2.commands.length,
    },
  });

  const after = await svc.listAuditExports(10);
  assert.equal(after.rows.length, initial + 2);
  assert.equal(after.total, initialTotal + 2);
  // Most recent first.
  assert.equal(after.rows[0].format, "csv");
  assert.equal(after.rows[0].rowCounts.messages >= 1, true);
  assert.equal(after.rows[1].format, "json");
  assert.equal(after.rows[1].rowCounts.total, 0);

  // Filters: by format
  const csvOnly = await svc.listAuditExports({ format: "csv", limit: 100 });
  assert.ok(csvOnly.rows.every((r) => r.format === "csv"));
  assert.ok(csvOnly.rows.length >= 1);

  // Filters: by actorId
  const byActor = await svc.listAuditExports({ actorId: "test_root_admin", limit: 100 });
  assert.ok(byActor.rows.every((r) => r.actorId === "test_root_admin"));

  // Filters: minTotalRows
  const onlyNonEmpty = await svc.listAuditExports({ minTotalRows: 1, limit: 100 });
  assert.ok(onlyNonEmpty.rows.every((r) => r.rowCounts.total >= 1));

  // Sort by totalRowCount asc
  const sortedAsc = await svc.listAuditExports({
    sortBy: "totalRowCount",
    sortOrder: "asc",
    limit: 100,
  });
  for (let i = 1; i < sortedAsc.rows.length; i++) {
    assert.ok(sortedAsc.rows[i].rowCounts.total >= sortedAsc.rows[i - 1].rowCounts.total);
  }

  // Pagination
  const page1 = await svc.listAuditExports({ limit: 1, offset: 0 });
  const page2 = await svc.listAuditExports({ limit: 1, offset: 1 });
  assert.equal(page1.rows.length, 1);
  assert.equal(page2.rows.length, 1);
  assert.notEqual(page1.rows[0].exportId, page2.rows[0].exportId);
  assert.equal(page1.total, page2.total);
});

/* 32 */
test("audit-export history is itself downloadable as JSON/CSV and the meta-meta-export is logged", async () => {
  // Seed two regular audit-trail exports so the history is non-empty.
  const seedDataA = await svc.exportAuditTrail({ productionId: "prod_demo" });
  await svc.recordAuditExport({
    actorId: "test_admin_a",
    actorType: "root_admin",
    actorRole: "super_admin",
    format: "json",
    filters: seedDataA.filters,
    rowCounts: {
      connectors: seedDataA.connectors.length,
      messages: seedDataA.messages.length,
      decisions: seedDataA.decisions.length,
      commands: seedDataA.commands.length,
    },
  });
  await svc.recordAuditExport({
    actorId: "test_admin_b",
    actorType: "root_admin",
    actorRole: "super_admin",
    format: "csv",
    filters: seedDataA.filters,
    rowCounts: { connectors: 0, messages: 0, decisions: 0, commands: 0 },
  });

  const all = await svc.listAllAuditExports();
  assert.ok(all.length >= 2, "seed exports should be present");

  // Simulate the route handler: pull the full meta-audit trail and
  // log the download itself as a meta-meta-export with format=csv-history.
  const fullHistory = await svc.listAllAuditExports();
  const logged = await svc.recordAuditExport({
    actorId: "test_admin_history",
    actorType: "root_admin",
    actorRole: "super_admin",
    format: "csv-history",
    filters: {
      fromDate: null,
      toDate: null,
      platform: null,
      productionId: "__audit_export_log__",
    },
    rowCounts: {
      connectors: 0,
      messages: fullHistory.length,
      decisions: 0,
      commands: 0,
    },
  });
  assert.equal(logged.format, "csv-history");
  assert.equal(logged.filters.productionId, "__audit_export_log__");
  assert.equal(logged.rowCounts.total, fullHistory.length);

  // The meta-meta-export row must now be visible in the history list.
  const afterHistory = await svc.listAllAuditExports();
  assert.equal(afterHistory.length, fullHistory.length + 1);
  assert.equal(afterHistory[0].exportId, logged.exportId);
  assert.equal(afterHistory[0].format, "csv-history");

  // CSV serializer for the meta-audit trail must include the meta
  // section, headers, and a row per logged export.
  const csv = buildAudienceAuditExportLogCsv({
    exports: afterHistory,
    exportedAt: new Date().toISOString(),
    totalExports: afterHistory.length,
  });
  assert.match(csv, /# audience_audit_export_log/);
  assert.match(csv, /# exports/);
  assert.match(csv, /exportId,exportedAt,actorId/);
  assert.match(csv, /csv-history/);
  assert.match(csv, /test_admin_a/);
  assert.match(csv, /test_admin_b/);
  assert.match(csv, /test_admin_history/);

  // JSON-history is also a valid format marker.
  const loggedJson = await svc.recordAuditExport({
    actorId: "test_admin_history_json",
    actorType: "root_admin",
    actorRole: null,
    format: "json-history",
    filters: {
      fromDate: null,
      toDate: null,
      platform: null,
      productionId: "__audit_export_log__",
    },
    rowCounts: { connectors: 0, messages: afterHistory.length, decisions: 0, commands: 0 },
  });
  assert.equal(loggedJson.format, "json-history");
});

/* Task #427 — Filtered audit-export history download */
test("listAllFilteredAuditExports applies filters/sort without pagination (Task #427)", async () => {
  // Seed three meta-audit rows with different actors, formats, and row counts.
  const baseFilters = {
    fromDate: null,
    toDate: null,
    platform: "youtube" as const,
    productionId: "prod_demo",
  };
  await svc.recordAuditExport({
    actorId: "task_427_actor_a",
    actorType: "root_admin",
    actorRole: "super_admin",
    format: "json",
    filters: baseFilters,
    rowCounts: { connectors: 1, messages: 1, decisions: 1, commands: 1 },
  });
  await svc.recordAuditExport({
    actorId: "task_427_actor_a",
    actorType: "root_admin",
    actorRole: "super_admin",
    format: "csv",
    filters: baseFilters,
    rowCounts: { connectors: 0, messages: 0, decisions: 0, commands: 0 },
  });
  await svc.recordAuditExport({
    actorId: "task_427_actor_b",
    actorType: "root_admin",
    actorRole: "super_admin",
    format: "csv",
    filters: { ...baseFilters, platform: "telegram" },
    rowCounts: { connectors: 2, messages: 5, decisions: 0, commands: 0 },
  });

  // Filter: actor=A only — should return exactly the two rows we seeded
  // for actor A, with no pagination cap applied.
  const onlyA = await svc.listAllFilteredAuditExports({ actorId: "task_427_actor_a" });
  assert.ok(onlyA.length >= 2);
  assert.ok(onlyA.every((r) => r.actorId === "task_427_actor_a"));

  // Filter: format=csv + minTotalRows=5 → only the actor_b row.
  const csvBig = await svc.listAllFilteredAuditExports({
    format: "csv",
    minTotalRows: 5,
  });
  assert.ok(csvBig.length >= 1);
  assert.ok(csvBig.every((r) => r.format === "csv" && r.rowCounts.total >= 5));
  assert.ok(csvBig.some((r) => r.actorId === "task_427_actor_b"));

  // Sort by totalRowCount asc must order rows by total ascending.
  const ascByTotal = await svc.listAllFilteredAuditExports({
    actorId: "task_427_actor_a",
    sortBy: "totalRowCount",
    sortOrder: "asc",
  });
  for (let i = 1; i < ascByTotal.length; i++) {
    assert.ok(ascByTotal[i].rowCounts.total >= ascByTotal[i - 1].rowCounts.total);
  }

  // Platform filter routes through the JSONB ->> 'platform' predicate.
  const tg = await svc.listAllFilteredAuditExports({ platform: "telegram" });
  assert.ok(tg.every((r) => r.filters.platform === "telegram"));
});

/* 33 — Task #433: history download can be filtered by from/to/actorId */
test("listAllAuditExports filters by from/to/actorId for history download", async () => {
  const seed = await svc.exportAuditTrail({ productionId: "prod_demo" });

  const oldRec = await svc.recordAuditExport({
    actorId: "actor_alpha",
    actorType: "root_admin",
    actorRole: null,
    format: "json",
    filters: seed.filters,
    rowCounts: { connectors: 0, messages: 0, decisions: 0, commands: 0 },
  });
  const newRec1 = await svc.recordAuditExport({
    actorId: "actor_beta",
    actorType: "root_admin",
    actorRole: null,
    format: "json",
    filters: seed.filters,
    rowCounts: { connectors: 0, messages: 0, decisions: 0, commands: 0 },
  });
  const newRec2 = await svc.recordAuditExport({
    actorId: "actor_alpha",
    actorType: "root_admin",
    actorRole: null,
    format: "csv",
    filters: seed.filters,
    rowCounts: { connectors: 0, messages: 0, decisions: 0, commands: 0 },
  });

  // Filter by actorId
  const alphaOnly = await svc.listAllAuditExports({ actorId: "actor_alpha" });
  assert.ok(alphaOnly.length >= 2);
  for (const r of alphaOnly) assert.equal(r.actorId, "actor_alpha");
  assert.ok(alphaOnly.some((r) => r.exportId === oldRec.exportId));
  assert.ok(alphaOnly.some((r) => r.exportId === newRec2.exportId));
  assert.ok(!alphaOnly.some((r) => r.exportId === newRec1.exportId));

  // Filter by date window — pick a window covering only the two most recent records
  const recentIso = new Date(Date.now() - 60_000).toISOString();
  const recent = await svc.listAllAuditExports({ from: new Date(recentIso) });
  assert.ok(recent.some((r) => r.exportId === newRec1.exportId));
  assert.ok(recent.some((r) => r.exportId === newRec2.exportId));

  // to in the far past returns nothing
  const none = await svc.listAllAuditExports({ to: new Date("2000-01-01T00:00:00Z") });
  assert.equal(none.length, 0);

  // Combined filter actorId + from
  const alphaRecent = await svc.listAllAuditExports({
    actorId: "actor_alpha",
    from: new Date(recentIso),
  });
  for (const r of alphaRecent) assert.equal(r.actorId, "actor_alpha");

  // recordAuditExport persists actorId in filters payload for the meta-meta-export
  const metaLog = await svc.recordAuditExport({
    actorId: "test_admin_meta",
    actorType: "root_admin",
    actorRole: null,
    format: "csv-history",
    filters: {
      fromDate: recentIso,
      toDate: null,
      platform: null,
      productionId: "__audit_export_log__",
      actorId: "actor_alpha",
    },
    rowCounts: { connectors: 0, messages: alphaRecent.length, decisions: 0, commands: 0 },
  });
  assert.equal(metaLog.filters.actorId, "actor_alpha");
  assert.equal(metaLog.filters.fromDate, recentIso);

  // Task #464 — listAllAuditExports also honors format / platform /
  // minTotalRows so the history download matches the list-view filters.
  const csvOnly = await svc.listAllAuditExports({ format: "csv" });
  assert.ok(csvOnly.length >= 1);
  for (const r of csvOnly) assert.equal(r.format, "csv");
  assert.ok(csvOnly.some((r) => r.exportId === newRec2.exportId));
  assert.ok(!csvOnly.some((r) => r.exportId === newRec1.exportId));

  const bigPull = await svc.recordAuditExport({
    actorId: "actor_gamma",
    actorType: "root_admin",
    actorRole: null,
    format: "json",
    filters: { ...seed.filters, platform: "telegram" },
    rowCounts: { connectors: 0, messages: 42, decisions: 0, commands: 0 },
  });
  const tgOnly = await svc.listAllAuditExports({ platform: "telegram" });
  assert.ok(tgOnly.some((r) => r.exportId === bigPull.exportId));
  for (const r of tgOnly) assert.equal(r.filters.platform, "telegram");

  const big = await svc.listAllAuditExports({ minTotalRows: 10 });
  assert.ok(big.some((r) => r.exportId === bigPull.exportId));
  for (const r of big) assert.ok(r.rowCounts.total >= 10);
  assert.equal(metaLog.filters.productionId, "__audit_export_log__");

  // CSV serializer includes filterActorId column
  const csv = buildAudienceAuditExportLogCsv({
    exports: [metaLog],
    exportedAt: new Date().toISOString(),
    totalExports: 1,
  });
  assert.match(csv, /filterActorId/);
  assert.match(csv, /actor_alpha/);
});

/* Task #428 — Outlier detection for audit-trail exports */

test("computeAudienceAuditExportOutlier flags 10× median pulls", () => {
  const prior = [10, 12, 11, 9, 13, 10, 11, 10, 12, 11];
  const normal = computeAudienceAuditExportOutlier(20, prior);
  assert.equal(normal.isOutlier, false);
  assert.ok(normal.rollingMedian > 0);
  const big = computeAudienceAuditExportOutlier(2000, prior);
  assert.equal(big.isOutlier, true);
  assert.ok(big.multiplier >= 10);
  assert.ok(big.threshold > 0);
});

test("computeAudienceAuditExportOutlier requires minimum sample size and minTotalRowCount", () => {
  // Too few prior samples (defaults: minSampleSize=5) → no outlier.
  const small = computeAudienceAuditExportOutlier(99999, [10, 10]);
  assert.equal(small.isOutlier, false);
  assert.equal(small.sampleSize, 2);
  // Below minTotalRowCount (default 100) even if multiplier exceeds.
  const tiny = computeAudienceAuditExportOutlier(50, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(tiny.isOutlier, false);
});

test("computeAudienceAuditExportOutlier respects enabled=false", () => {
  const prior = [10, 10, 10, 10, 10, 10];
  const r = computeAudienceAuditExportOutlier(10_000, prior, { enabled: false });
  assert.equal(r.isOutlier, false);
});

test("recordAuditExport emits audience.audit_export_outlier when a pull exceeds rolling median", async () => {
  // Seed enough small exports for a stable median.
  for (let i = 0; i < 8; i++) {
    const d = await svc.exportAuditTrail({ productionId: `prod_seed_${i}` });
    await svc.recordAuditExport({
      actorId: "seed_admin",
      actorType: "root_admin",
      actorRole: null,
      format: "json",
      filters: d.filters,
      rowCounts: { connectors: 1, messages: 0, decisions: 0, commands: 0 },
    });
  }

  const events: any[] = [];
  const unsub = neuralNewsroomBus.subscribe("audience.audit_export_outlier", {
    id: "test_outlier_sub",
    type: "admin",
    handler: (e) => events.push(e.payload),
  });

  // Now record a "huge" pull — fake the row counts to exceed the
  // default median × multiplier and the 100-row floor.
  const record = await svc.recordAuditExport({
    actorId: "suspicious_admin",
    actorType: "root_admin",
    actorRole: null,
    format: "csv",
    filters: { fromDate: null, toDate: null, platform: null, productionId: null },
    rowCounts: { connectors: 0, messages: 5000, decisions: 0, commands: 0 },
  });
  unsub();

  assert.equal(record.outlier.isOutlier, true);
  assert.equal(record.rowCounts.total, 5000);
  assert.ok(record.outlier.rollingMedian >= 1);
  assert.ok(record.outlier.multiplier >= 10);
  assert.equal(events.length, 1);
  assert.equal((events[0] as any).exportId, record.exportId);

  // The persisted row carries the outlier flag too.
  const list = await svc.listAuditExports(50);
  const stored = list.rows.find((r) => r.exportId === record.exportId);
  assert.ok(stored);
  assert.equal(stored!.outlier.isOutlier, true);
});

test("outlier config round-trips through setAudienceAuditExportOutlierConfig", async () => {
  const next = await setAudienceAuditExportOutlierConfig({
    enabled: false,
    windowSize: 20,
    medianMultiplier: 25,
    minSampleSize: 10,
    minTotalRowCount: 500,
    updatedBy: "test",
  });
  assert.deepEqual(next, {
    enabled: false,
    windowSize: 20,
    medianMultiplier: 25,
    minSampleSize: 10,
    minTotalRowCount: 500,
  });
  const loaded = await getAudienceAuditExportOutlierConfig();
  assert.equal(loaded.enabled, false);
  assert.equal(loaded.medianMultiplier, 25);
  // Reset to defaults so other tests still pick up the standard config.
  await setAudienceAuditExportOutlierConfig({
    ...DEFAULT_AUDIENCE_AUDIT_EXPORT_OUTLIER_CONFIG,
    updatedBy: "test",
  });
});

test("audit-export notifier force-sends for outliers even when below the minRowCount gate", async () => {
  const sends: any[] = [];
  const record = {
    exportId: "aud_exp_test_outlier",
    actorId: "actor_x",
    actorType: "root_admin",
    actorRole: null,
    format: "csv" as const,
    filters: { fromDate: null, toDate: null, platform: null, productionId: null },
    rowCounts: { connectors: 0, messages: 10, decisions: 0, commands: 0, total: 10 },
    exportedAt: new Date().toISOString(),
    outlier: {
      isOutlier: true,
      rollingMedian: 1,
      rollingP95: 2,
      threshold: 10,
      sampleSize: 8,
      multiplier: 10,
    },
  };
  // Inject a fake email service via the configLoader's view of the
  // notifier is non-trivial — instead we patch emailService directly
  // through a saved reference and restore it.
  const { emailService } = await import("../server/services/email-service");
  const orig = (emailService as any).sendAudienceAuditExportNotification.bind(emailService);
  (emailService as any).sendAudienceAuditExportNotification = async (
    recipients: string[],
    payload: any,
  ) => {
    sends.push({ recipients, payload });
    return { id: "stub" };
  };
  try {
    // minRowCount=1000 would normally suppress a 10-row pull, but
    // outlier flag must force the email through.
    const result = await handleAuditExportEvent(record as any, async () => ({
      enabled: true,
      recipients: ["sec@example.com"],
      minRowCount: 1000,
      suppressedActorIds: [],
      updatedAt: null,
      updatedBy: null,
    }));
    assert.equal(result.notified, true);
    assert.equal(result.reason, "sent");
    assert.equal(sends.length, 1);
    assert.equal(sends[0].payload.outlier?.isOutlier, true);

    // Suppressed actor still wins over outlier flag.
    sends.length = 0;
    const suppressed = await handleAuditExportEvent(record as any, async () => ({
      enabled: true,
      recipients: ["sec@example.com"],
      minRowCount: 0,
      suppressedActorIds: ["actor_x"],
      updatedAt: null,
      updatedBy: null,
    }));
    assert.equal(suppressed.notified, false);
    assert.equal(suppressed.reason, "actor_suppressed");
    assert.equal(sends.length, 0);
  } finally {
    (emailService as any).sendAudienceAuditExportNotification = orig;
  }
});

/* 22 */
test("safetyEnvelope unchanged across decisions/commands and bus emits audience.* events", async () => {
  const events: string[] = [];
  const unsub = neuralNewsroomBus.subscribe("audience.message_received", {
    id: "test_audience_sub",
    type: "admin",
    handler: (e) => events.push(e.name),
  });
  const m = await ingest("c_yt", "youtube", "great work!");
  const d = await svc.evaluateAudienceSafety(m.messageId);
  unsub();
  assert.deepEqual(events, ["audience.message_received"]);
  assert.ok(d.safetyEnvelope.safetyEnvelopeLocked);
  assert.equal(d.safetyEnvelope.platformSendAllowed, false);
  assert.equal(d.safetyEnvelope.noPiiOnScreens, true);
  assert.equal(d.safetyEnvelope.noAbusiveSpeech, true);
});

/* ------------------------------------------------------------------ */
/* Task #387 — Audit export keeps redacting PII                       */
/* ------------------------------------------------------------------ */

const RAW_PII = {
  email: "leak@example.com",
  phone: "+1 555 123 4567",
  ip: "10.0.0.42",
  ipAddress: "10.0.0.43",
  address: "221B Baker Street",
  fullName: "Jane Q. Public",
  realName: "Jane Public",
  dob: "1990-01-01",
  token: "tk_LEAKED_TOKEN_VALUE",
  accessToken: "at_LEAKED_ACCESS_TOKEN",
  refreshToken: "rt_LEAKED_REFRESH_TOKEN",
  apiKey: "ak_LEAKED_API_KEY",
  secret: "sh_LEAKED_SECRET",
  nested: {
    email: "nested@example.com",
    apiKey: "nested_ak_LEAK",
    color: "blue",
  },
  color: "red",
};

const RAW_PII_VALUES = [
  "leak@example.com",
  "+1 555 123 4567",
  "10.0.0.42",
  "10.0.0.43",
  "221B Baker Street",
  "Jane Q. Public",
  "Jane Public",
  "1990-01-01",
  "tk_LEAKED_TOKEN_VALUE",
  "at_LEAKED_ACCESS_TOKEN",
  "rt_LEAKED_REFRESH_TOKEN",
  "ak_LEAKED_API_KEY",
  "sh_LEAKED_SECRET",
  "nested@example.com",
  "nested_ak_LEAK",
];

async function ingestRawPii(opts: {
  connectorId: string;
  platform: AudiencePlatform;
  externalAuthorId: string;
  productionId?: string | null;
}) {
  await ensureConnector(opts.connectorId, opts.platform);
  return svc.ingestAudienceMessage({
    connectorId: opts.connectorId,
    platform: opts.platform,
    externalMessageId: `ext_${Math.random().toString(36).slice(2, 8)}`,
    externalAuthorId: opts.externalAuthorId,
    authorDisplayName: "Author",
    messageText: "hello",
    messageType: "comment",
    productionId: opts.productionId ?? null,
    rawMetadata: RAW_PII,
  });
}

function assertNoRawPii(text: string) {
  for (const val of RAW_PII_VALUES) {
    assert.ok(
      !text.includes(val),
      `export leaked raw PII value ${JSON.stringify(val)}`,
    );
  }
}

/* 23 */
test("audit export (JSON path) redacts raw PII metadata and hashes authorId", async () => {
  const secretAuthor = "secret_author_t387_json";
  const m = await ingestRawPii({
    connectorId: "c_yt",
    platform: "youtube",
    externalAuthorId: secretAuthor,
  });
  await svc.evaluateAudienceSafety(m.messageId);

  const data = await svc.exportAuditTrail({});
  const json = JSON.stringify(data);

  assertNoRawPii(json);
  assert.ok(!json.includes(secretAuthor), "raw externalAuthorId leaked into JSON export");

  const exported = data.messages.find((row) => row.messageId === m.messageId);
  assert.ok(exported, "ingested message missing from export");
  assert.notEqual(exported!.externalAuthorIdHash, secretAuthor);
  assert.equal(exported!.externalAuthorIdHash.length, 32);
  assert.match(exported!.externalAuthorIdHash, /^[0-9a-f]{32}$/);

  const meta = exported!.rawMetadataRedacted as Record<string, unknown>;
  for (const key of [
    "email",
    "phone",
    "ip",
    "ipAddress",
    "address",
    "fullName",
    "realName",
    "dob",
    "token",
    "accessToken",
    "refreshToken",
    "apiKey",
    "secret",
  ]) {
    assert.equal(meta[key], undefined, `${key} should be stripped from export`);
  }
  assert.equal(meta.color, "red");
  const nested = meta.nested as Record<string, unknown>;
  assert.equal(nested.email, undefined);
  assert.equal(nested.apiKey, undefined);
  assert.equal(nested.color, "blue");
});

/* 24 */
test("audit export (CSV path) redacts raw PII metadata and hashes authorId", async () => {
  const secretAuthor = "secret_author_t387_csv";
  const m = await ingestRawPii({
    connectorId: "c_yt",
    platform: "youtube",
    externalAuthorId: secretAuthor,
  });
  await svc.evaluateAudienceSafety(m.messageId);

  const data = await svc.exportAuditTrail({});
  const csv = buildAudienceAuditCsv(data);

  assertNoRawPii(csv);
  assert.ok(!csv.includes(secretAuthor), "raw externalAuthorId leaked into CSV export");

  const exported = data.messages.find((row) => row.messageId === m.messageId)!;
  assert.ok(csv.includes(exported.externalAuthorIdHash), "hashed authorId should appear in CSV");
});

/* 25 */
test("audit export honors date/platform/productionId filters (and still redacts PII)", async () => {
  const inProd = "prod_t387_in";
  const otherProd = "prod_t387_other";

  const mInclude = await ingestRawPii({
    connectorId: "c_yt",
    platform: "youtube",
    externalAuthorId: "secret_in_scope_t387",
    productionId: inProd,
  });
  await svc.evaluateAudienceSafety(mInclude.messageId);

  const mWrongPlatform = await ingestRawPii({
    connectorId: "c_fb",
    platform: "facebook",
    externalAuthorId: "secret_wrong_platform_t387",
    productionId: inProd,
  });
  await svc.evaluateAudienceSafety(mWrongPlatform.messageId);

  const mWrongProd = await ingestRawPii({
    connectorId: "c_yt",
    platform: "youtube",
    externalAuthorId: "secret_wrong_prod_t387",
    productionId: otherProd,
  });
  await svc.evaluateAudienceSafety(mWrongProd.messageId);

  const before = new Date(Date.now() - 60_000);
  const afterDate = new Date(Date.now() + 60_000);

  const filtered = await svc.exportAuditTrail({
    fromDate: before,
    toDate: afterDate,
    platform: "youtube",
    productionId: inProd,
  });

  const ids = filtered.messages.map((m) => m.messageId);
  assert.ok(ids.includes(mInclude.messageId), "in-scope message missing");
  assert.ok(!ids.includes(mWrongPlatform.messageId), "facebook message leaked through platform filter");
  assert.ok(!ids.includes(mWrongProd.messageId), "wrong productionId leaked through productionId filter");
  for (const msg of filtered.messages) {
    assert.equal(msg.platform, "youtube");
    assert.equal(msg.productionId, inProd);
  }

  const future1 = new Date(Date.now() + 3_600_000);
  const future2 = new Date(Date.now() + 7_200_000);
  const futureOnly = await svc.exportAuditTrail({ fromDate: future1, toDate: future2 });
  assert.equal(futureOnly.messages.length, 0);
  assert.equal(futureOnly.decisions.length, 0);
  assert.equal(futureOnly.commands.length, 0);

  assert.equal(filtered.filters.platform, "youtube");
  assert.equal(filtered.filters.productionId, inProd);
  assert.equal(filtered.filters.fromDate, before.toISOString());
  assert.equal(filtered.filters.toDate, afterDate.toISOString());

  const json = JSON.stringify(filtered);
  assertNoRawPii(json);
  assert.ok(!json.includes("secret_in_scope_t387"));
  assert.ok(!json.includes("secret_wrong_platform_t387"));
  assert.ok(!json.includes("secret_wrong_prod_t387"));

  const csv = buildAudienceAuditCsv(filtered);
  assertNoRawPii(csv);
  assert.ok(!csv.includes("secret_in_scope_t387"));
});

test("Task #377: updateConnectorFeatureFlags toggles lexicons + second opinion without restart", async () => {
  await ensureConnector("c_flag", "youtube");
  const before = await svc.getConnector("c_flag");
  assert.deepEqual(before?.featureFlags.multilingualLexicons, []);
  assert.equal(before?.featureFlags.aiModerationSecondOpinion, false);

  const updated = await svc.updateConnectorFeatureFlags("c_flag", {
    multilingualLexicons: ["es", "pt"],
    aiModerationSecondOpinion: true,
  });
  assert.deepEqual(updated.featureFlags.multilingualLexicons, ["es", "pt"]);
  assert.equal(updated.featureFlags.aiModerationSecondOpinion, true);

  const reread = await svc.getConnector("c_flag");
  assert.deepEqual(reread?.featureFlags.multilingualLexicons, ["es", "pt"]);
  assert.equal(reread?.featureFlags.aiModerationSecondOpinion, true);

  const partial = await svc.updateConnectorFeatureFlags("c_flag", {
    multilingualLexicons: ["zh"],
  });
  assert.deepEqual(partial.featureFlags.multilingualLexicons, ["zh"]);
  assert.equal(partial.featureFlags.aiModerationSecondOpinion, true);

  await assert.rejects(
    svc.updateConnectorFeatureFlags("c_missing", { aiModerationSecondOpinion: true }),
    /connector_not_found/,
  );
});

// =====================================================================
// Task #632 — hard row caps on the three audience admin downloads.
// =====================================================================

test("Task #632: exportAuditTrail honors limit and surfaces truncated", async () => {
  await ensureConnector("c_t632_a", "youtube");
  const uniqProd = `prod_t632_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const stamp = Date.now();
  for (let i = 0; i < 6; i++) {
    await svc.ingestAudienceMessage({
      connectorId: "c_t632_a",
      platform: "youtube",
      productionId: uniqProd,
      externalMessageId: `m_t632_${stamp}_${i}`,
      externalAuthorId: `author_${i}`,
      authorDisplayName: `A${i}`,
      messageText: `t632 msg ${i}`,
      messageType: "comment",
      storyId: null,
      giftValue: null,
    });
  }
  const uncapped = await svc.exportAuditTrail({ productionId: uniqProd });
  assert.equal(uncapped.truncated, false);
  assert.equal(uncapped.rowCap, null);
  assert.equal(uncapped.messages.length, 6);

  const capped = await svc.exportAuditTrail({
    productionId: uniqProd,
    limit: 3,
  });
  assert.equal(capped.truncated, true);
  assert.equal(capped.rowCap, 3);
  assert.equal(capped.messages.length, 3);

  const atCap = await svc.exportAuditTrail({
    productionId: uniqProd,
    limit: 6,
  });
  assert.equal(atCap.truncated, false);
  assert.equal(atCap.messages.length, 6);
});

test("Task #632: countAuditTrail returns per-section counts", async () => {
  await ensureConnector("c_t632_c", "youtube");
  const uniqProd = `prod_t632_c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const stamp = Date.now();
  for (let i = 0; i < 4; i++) {
    await svc.ingestAudienceMessage({
      connectorId: "c_t632_c",
      platform: "youtube",
      productionId: uniqProd,
      externalMessageId: `cm_${stamp}_${i}`,
      externalAuthorId: `a_${i}`,
      authorDisplayName: `A${i}`,
      messageText: `count test ${i}`,
      messageType: "comment",
      storyId: null,
      giftValue: null,
    });
  }
  const counts = await svc.countAuditTrail({ productionId: uniqProd });
  assert.equal(counts.messages, 4);
  assert.ok(counts.total >= 4);
  assert.equal(typeof counts.connectors, "number");
  assert.equal(typeof counts.decisions, "number");
  assert.equal(typeof counts.commands, "number");
});

test("Task #632: listAllAuditExportsBounded reports truncation", async () => {
  await ensureConnector("c_t632_b", "youtube");
  for (let i = 0; i < 5; i++) {
    await svc.recordAuditExport({
      actorId: `actor_t632_b_${i}`,
      actorType: "admin",
      actorRole: "root",
      format: "json",
      filters: { fromDate: null, toDate: null, platform: null, productionId: null },
      rowCounts: { connectors: 0, messages: i, decisions: 0, commands: 0 },
    });
  }
  const full = await svc.listAllAuditExportsBounded({ limit: 100 });
  assert.equal(full.truncated, false);
  assert.equal(full.rowCap, 100);
  assert.ok(full.rows.length >= 5);

  const capped = await svc.listAllAuditExportsBounded({ limit: 2 });
  assert.equal(capped.truncated, true);
  assert.equal(capped.rowCap, 2);
  assert.equal(capped.rows.length, 2);
});

test("Task #632: listAllFilteredAuditExportsBounded reports truncation", async () => {
  for (let i = 0; i < 4; i++) {
    await svc.recordAuditExport({
      actorId: `actor_t632_filt_${i}`,
      actorType: "admin",
      actorRole: "root",
      format: "json",
      filters: { fromDate: null, toDate: null, platform: null, productionId: null },
      rowCounts: { connectors: 0, messages: 12345 + i, decisions: 0, commands: 0 },
    });
  }
  // minTotalRows narrows to just the 4 rows we just seeded (no other
  // test recordAuditExport call uses 12345+ messages).
  const full = await svc.listAllFilteredAuditExportsBounded({
    minTotalRows: 12345,
    limit: 50,
  });
  assert.equal(full.truncated, false);
  assert.ok(full.rows.length >= 4);

  const capped = await svc.listAllFilteredAuditExportsBounded({
    minTotalRows: 12345,
    limit: 2,
  });
  assert.equal(capped.truncated, true);
  assert.equal(capped.rowCap, 2);
  assert.equal(capped.rows.length, 2);
});

test("Task #632: buildAudienceAuditCsv includes truncated + rowCap meta", () => {
  const csv = buildAudienceAuditCsv({
    connectors: [],
    messages: [],
    decisions: [],
    commands: [],
    filters: { fromDate: null, toDate: null, platform: null, productionId: "prod_x" },
    exportedAt: "2026-05-22T00:00:00.000Z",
    truncated: true,
    rowCap: 100_000,
  });
  assert.match(csv, /truncated/);
  assert.match(csv, /rowCap/);
  assert.match(csv, /100000/);
  assert.match(csv, /true/);
});

test("Task #632: buildAudienceAuditExportLogCsv includes truncated + rowCap meta", () => {
  const csv = buildAudienceAuditExportLogCsv({
    exports: [],
    exportedAt: "2026-05-22T00:00:00.000Z",
    totalExports: 0,
    truncated: true,
    rowCap: 100_000,
  });
  assert.match(csv, /truncated/);
  assert.match(csv, /rowCap/);
  assert.match(csv, /100000/);
});
