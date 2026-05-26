/**
 * Omni-Channel Audience Safety Layer (Task #371 + #373).
 *
 * Replaces the YouTube-only chat safety layer. Ingests audience messages
 * across YouTube / Facebook / X / Telegram / Instagram / TikTok / LinkedIn /
 * Reddit / custom adapters; scores them deterministically; produces
 * AudienceSafetyDecision + AudienceModerationCommand records that are
 * always `simulation_only` + `platformSendAllowed:false` in this phase.
 *
 * Task #373: connectors, messages, decisions and commands are now persisted
 * to Postgres via Drizzle (the four `audience_*` tables). The in-memory
 * `Map`s have been removed — every read goes through the DB so a restart
 * preserves the full audit trail. The `stories` Map is retained because
 * story context is short-lived evaluator scaffolding, not an audit record.
 *
 * Hard rules (enforced at the service boundary):
 *   - Official APIs only — this service NEVER calls a platform.
 *   - No scraping, no rate-limit bypass.
 *   - No private DMs (a `mention` from a public surface is fine; private
 *     channels are rejected unless `apiAccessMode === "official_api"`).
 *   - No PII on screens, no abuse / hate / misinformation read by robot or
 *     anchor, no celebration of unsafe paid messages.
 *   - All outputs draft + admin_only_internal + safetyEnvelope locked.
 */

import { createHash } from "node:crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "../db";
import {
  audienceAuditExports,
  audienceChannelConnectors,
  audienceMessages,
  audienceModerationCommands,
  audienceSafetyDecisions,
  systemSettings,
} from "../../shared/schema";
import {
  type AudienceChannelConnector,
  type AudienceConnectorFeatureFlags,
  type AudienceMessage,
  type AudienceMessageIngest,
  AudienceMessageIngestSchema,
  type AudienceSafetyDecision,
  type AudienceSafetyScores,
  type AudienceModerationCommand,
  type AudiencePlatform,
  type AudiencePermissions,
  type RequestedModerationAction,
  type ModerationRequestedBy,
  type CommandMode,
  type StoryContext,
  type StorySensitivity,
  type SupportedLexiconLocale,
  type AudienceAuditExportRecord,
  type AudienceAuditExportRiskSignal,
  type AudienceAuditExportOutlierStats,
  ZERO_PERMISSIONS,
  DEFAULT_FEATURE_FLAGS,
  AUDIENCE_SAFETY_ENVELOPE_LOCKED,
} from "../../shared/omni-channel-audience-schema";
import { neuralNewsroomBus } from "./neural-newsroom-bus";

const HASH_SALT = "mougle_audience_author_v1";
function hashAuthorId(externalAuthorId: string): string {
  return createHash("sha256").update(HASH_SALT + ":" + externalAuthorId).digest("hex").slice(0, 32);
}

const REDACT_METADATA_KEYS = new Set([
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
]);
function redactMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (REDACT_METADATA_KEYS.has(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactMetadata(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test";
}

/* ------------------------------------------------------------------ */
/* Text normalization (NFKC, zero-width strip, leet→ascii, lower)     */
/* ------------------------------------------------------------------ */
const ZERO_WIDTH_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  "$": "s",
  "!": "i",
  "|": "i",
};
function normalizeText(text: string): string {
  let s = text.normalize("NFKC").replace(ZERO_WIDTH_RE, "");
  // Collapse common separator obfuscation like "i.d.i.o.t" or "i d i o t".
  s = s.replace(/(?<=\w)[.\-_*\s](?=\w)/g, (m) => (m === " " ? " " : ""));
  s = s.toLowerCase();
  s = s.replace(/[01345789@$!|]/g, (c) => LEET_MAP[c] ?? c);
  // Collapse repeated characters of length >= 3 (e.g. "iiidiot" -> "idiot").
  s = s.replace(/(\w)\1{2,}/g, "$1");
  return s;
}
export function normalizeAudienceText(text: string): string {
  return normalizeText(text);
}

/* ------------------------------------------------------------------ */
/* Multilingual lexicons (feature-flagged per connector)              */
/* ------------------------------------------------------------------ */
// Source-of-truth lexicon data lives in `shared/audience-lexicons/` —
// one file per locale for reviewer-friendly diffs. See the README on the
// `MULTILINGUAL_LEXICONS` export for normalization assumptions.
import { MULTILINGUAL_LEXICONS, type LexiconAxis } from "@shared/audience-lexicons";

function lexiconScore(
  normalized: string,
  axis: LexiconAxis,
  locales: SupportedLexiconLocale[],
): number {
  let hits = 0;
  const seen = new Set<string>();
  for (const loc of locales) {
    const words = MULTILINGUAL_LEXICONS[loc]?.[axis] ?? [];
    for (const w of words) {
      const key = `${loc}:${w}`;
      if (seen.has(key)) continue;
      // For zh/ar use direct substring (no word boundaries); else lowercase substring match
      // since normalized text is already stripped of separators / lowercased.
      const needle = w.toLowerCase();
      if (normalized.includes(needle)) {
        seen.add(key);
        hits++;
      }
    }
  }
  if (hits === 0) return 0;
  return Math.min(1, 0.6 + 0.2 * (hits - 1));
}

/* ------------------------------------------------------------------ */
/* AI moderator (injectable second opinion)                           */
/* ------------------------------------------------------------------ */
export interface AiModerationResult {
  abuse?: number;
  hate?: number;
  spam?: number;
  toxicity?: number;
  sexual?: number;
  violence?: number;
  selfHarm?: number;
  misinformation?: number;
}
export type AiModeratorFn = (text: string) => Promise<AiModerationResult | null>;

function inAmbiguousBand(scores: AudienceSafetyScores): boolean {
  // Any toxicity-like axis where deterministic score is uncertain (0.3..<0.5)
  // OR exactly on the soft-threshold (0.5..0.6) is escalated. We deliberately
  // include 0.5 so the AI second opinion can DOWN-rate a borderline blocker
  // (and avoid false positives) as well as up-rate a near-miss.
  const axes = [
    scores.abuseScore,
    scores.hateScore,
    scores.spamScore,
    scores.toxicityScore,
    scores.misinformationRisk,
    scores.sexualContentRisk,
    scores.violenceRisk,
  ];
  return axes.some((v) => v >= 0.3 && v <= 0.6);
}

function mergeAiScores(base: AudienceSafetyScores, ai: AiModerationResult): AudienceSafetyScores {
  const merged: AudienceSafetyScores = { ...base };
  if (typeof ai.abuse === "number") merged.abuseScore = Math.max(merged.abuseScore, ai.abuse);
  if (typeof ai.hate === "number") merged.hateScore = Math.max(merged.hateScore, ai.hate);
  if (typeof ai.spam === "number") merged.spamScore = Math.max(merged.spamScore, ai.spam);
  if (typeof ai.sexual === "number") merged.sexualContentRisk = Math.max(merged.sexualContentRisk, ai.sexual);
  if (typeof ai.violence === "number") merged.violenceRisk = Math.max(merged.violenceRisk, ai.violence);
  if (typeof ai.selfHarm === "number") merged.selfHarmRisk = Math.max(merged.selfHarmRisk, ai.selfHarm);
  if (typeof ai.misinformation === "number") {
    merged.misinformationRisk = Math.max(merged.misinformationRisk, ai.misinformation);
  }
  if (typeof ai.toxicity === "number") merged.toxicityScore = Math.max(merged.toxicityScore, ai.toxicity);
  merged.toxicityScore = Math.max(merged.toxicityScore, merged.abuseScore, merged.hateScore);
  return merged;
}

/* ------------------------------------------------------------------ */
/* Deterministic safety scoring                                       */
/* ------------------------------------------------------------------ */
const SPAM_PATTERNS = [
  /\bclick here\b/i,
  /\bfree money\b/i,
  /\bsubscribe to my channel\b/i,
  /\bv[i1]agra\b/i,
  /\bcrypto.*airdrop\b/i,
  /https?:\/\/\S+.*https?:\/\/\S+/, // 2+ links
  /(.)\1{8,}/, // long char repeat
];
const ABUSE_PATTERNS = [
  /\bidiot\b/i,
  /\bstupid\b/i,
  /\bmoron\b/i,
  /\bshut up\b/i,
  /\byou suck\b/i,
];
const HATE_PATTERNS = [
  /\bhate\s+(all|every)\s+\w+/i,
  /\bkill\s+(all|every)\s+\w+/i,
  /\bdeath to\b/i,
  /\bgo back to your\b/i,
];
const THREAT_PATTERNS = [
  /\bi will (find|kill|hurt|kidnap)\b/i,
  /\bi'?ll (kill|hurt|find) you\b/i,
];
const PII_PATTERNS = [
  /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/, // SSN-shaped
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/, // credit-card-shaped
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /\+?\d{1,3}[ -]?\(?\d{2,4}\)?[ -]?\d{3,4}[ -]?\d{3,4}/, // phone
  /\bmy address is\b/i,
];
const MISINFO_PATTERNS = [
  /\bBREAKING:?\b.*\b(dead|died|killed|attack|nuke|war)\b/i,
  /\bunconfirmed\b.*\b(report|claim)\b/i,
  /\bI just heard that\b/i,
];
const COPYRIGHT_PATTERNS = [
  /["“][^"”]{200,}["”]/, // long quoted block
  /\blyrics:\s.{120,}/i,
];
const IMPERSONATION_PATTERNS = [
  /\bi am (the )?(founder|admin|moderator|staff|ceo)\b/i,
  /\bofficial (mougle|account)\b/i,
];
const MALICIOUS_LINK_PATTERNS = [
  /https?:\/\/(bit\.ly|tinyurl|goo\.gl|t\.co|grabify)/i,
  /https?:\/\/\S+\.(zip|exe|scr|apk)\b/i,
];

function scoreFor(patterns: RegExp[], text: string): number {
  let hits = 0;
  for (const p of patterns) if (p.test(text)) hits++;
  if (hits === 0) return 0;
  return Math.min(1, 0.5 + 0.25 * (hits - 1));
}

function botSignal(text: string): number {
  const lowerCount = text.length;
  if (lowerCount < 4) return 0.6;
  const upperRatio = (text.replace(/[^A-Z]/g, "").length) / Math.max(1, text.replace(/[^A-Za-z]/g, "").length);
  if (upperRatio > 0.85 && text.length > 12) return 0.7;
  return 0;
}

/**
 * Tamper-evident snapshot of a decision used by the future platform gateway
 * (Task #374). Includes every field that affects whether the action is
 * safe to dispatch.
 */
function computeDecisionFingerprint(d: {
  decisionId: string;
  action: string;
  reasonCodes: string[];
  scores: AudienceSafetyScores;
  allowedForRobotSpeech: boolean;
  allowedForAnchorSpeech: boolean;
  allowedForScreenDisplay: boolean;
  allowedForAutoReply: boolean;
  allowedForModerationAction: boolean;
  requiresHumanReview: boolean;
  sensitivityOverride: boolean;
  cAudienceSafety: number;
}): string {
  const sortedScores = Object.keys(d.scores)
    .sort()
    .map((k) => [k, (d.scores as any)[k]]);
  const payload = JSON.stringify([
    d.decisionId,
    d.action,
    [...d.reasonCodes].sort(),
    sortedScores,
    d.allowedForRobotSpeech,
    d.allowedForAnchorSpeech,
    d.allowedForScreenDisplay,
    d.allowedForAutoReply,
    d.allowedForModerationAction,
    d.requiresHumanReview,
    d.sensitivityOverride,
    d.cAudienceSafety,
  ]);
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function computeScores(
  text: string,
  msgType: string,
  locales: SupportedLexiconLocale[] = [],
): AudienceSafetyScores {
  const normalized = normalizeText(text);
  // Run regex patterns against BOTH the original and normalized text so
  // leetspeak / zero-width / separator obfuscation cannot bypass detection.
  const scoreAxis = (patterns: RegExp[]): number =>
    Math.max(scoreFor(patterns, text), scoreFor(patterns, normalized));
  const spamRegex = Math.max(scoreAxis(SPAM_PATTERNS), scoreAxis(MALICIOUS_LINK_PATTERNS) * 0.8);
  const abuseRegex = scoreAxis(ABUSE_PATTERNS);
  const hateRegex = scoreAxis(HATE_PATTERNS);
  const threat = scoreAxis(THREAT_PATTERNS);
  const pii = scoreAxis(PII_PATTERNS);
  const misinfo = scoreAxis(MISINFO_PATTERNS);
  const copyright = scoreAxis(COPYRIGHT_PATTERNS);
  const impersonation = scoreAxis(IMPERSONATION_PATTERNS);
  const spam = Math.max(spamRegex, lexiconScore(normalized, "spam", locales));
  const abuse = Math.max(abuseRegex, lexiconScore(normalized, "abuse", locales));
  const hate = Math.max(hateRegex, lexiconScore(normalized, "hate", locales));
  const toxicity = Math.max(abuse, hate, threat);
  const violenceRisk = Math.max(threat, hate * 0.6);
  const sexualContentRisk = /\b(porn|nude|sex(ual)?)\b/i.test(text) ? 0.8 : 0;
  const selfHarmRisk = /\b(suicide|kill myself|end my life)\b/i.test(text) ? 0.9 : 0;
  const bot = botSignal(text);
  const relevance = msgType === "moderator_note" ? 0.9 : msgType === "poll_response" ? 0.7 : 0.5;
  return {
    toxicityScore: toxicity,
    spamScore: spam,
    abuseScore: abuse,
    hateScore: hate,
    sexualContentRisk,
    violenceRisk,
    selfHarmRisk,
    misinformationRisk: misinfo,
    piiRisk: pii,
    copyrightRisk: copyright,
    impersonationRisk: impersonation,
    botRisk: bot,
    relevanceScore: relevance,
  };
}

/* ------------------------------------------------------------------ */
/* Row → API mappers                                                   */
/* ------------------------------------------------------------------ */
function rowToConnector(row: typeof audienceChannelConnectors.$inferSelect): AudienceChannelConnector {
  return {
    connectorId: row.connectorId,
    platform: row.platform as AudiencePlatform,
    accountId: row.accountId,
    displayName: row.displayName,
    connectionStatus: row.connectionStatus as AudienceChannelConnector["connectionStatus"],
    permissions: { ...ZERO_PERMISSIONS, ...(row.permissions ?? {}) },
    apiAccessMode: row.apiAccessMode as AudienceChannelConnector["apiAccessMode"],
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    rateLimitStatus: row.rateLimitStatus ?? null,
    featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null,
    signedUrl: null,
    realSendAllowed: false,
    executionEnabled: false,
    platformSendApproved: row.platformSendApproved,
    platformSendApprovedBy: row.platformSendApprovedBy ?? null,
    platformSendApprovedAt: row.platformSendApprovedAt ? row.platformSendApprovedAt.toISOString() : null,
    autoPausedAt: row.autoPausedAt ? row.autoPausedAt.toISOString() : null,
    autoPausedReason: row.autoPausedReason ?? null,
    safetyEnvelope: { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED },
  };
}

function rowToMessage(row: typeof audienceMessages.$inferSelect): AudienceMessage {
  return {
    messageId: row.messageId,
    connectorId: row.connectorId,
    platform: row.platform as AudiencePlatform,
    externalMessageId: row.externalMessageId,
    externalAuthorIdHash: row.externalAuthorIdHash,
    authorDisplayNameSafe: row.authorDisplayNameSafe ?? null,
    messageText: row.messageText,
    messageType: row.messageType as AudienceMessage["messageType"],
    receivedAt: row.receivedAt.toISOString(),
    storyId: row.storyId ?? null,
    productionId: row.productionId ?? null,
    broadcastBriefId: row.broadcastBriefId ?? null,
    giftValue: row.giftValue ?? null,
    rawMetadataRedacted: row.rawMetadataRedacted ?? {},
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null,
    signedUrl: null,
    realSendAllowed: false,
    executionEnabled: false,
    safetyEnvelope: { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED },
  };
}

function rowToDecision(row: typeof audienceSafetyDecisions.$inferSelect): AudienceSafetyDecision {
  return {
    decisionId: row.decisionId,
    messageId: row.messageId,
    platform: row.platform as AudiencePlatform,
    action: row.action as AudienceSafetyDecision["action"],
    reasonCodes: row.reasonCodes ?? [],
    scores: row.scores,
    giftValue: row.giftValue ?? null,
    allowedForRobotSpeech: row.allowedForRobotSpeech,
    allowedForAnchorSpeech: row.allowedForAnchorSpeech,
    allowedForScreenDisplay: row.allowedForScreenDisplay,
    allowedForAutoReply: row.allowedForAutoReply,
    allowedForModerationAction: row.allowedForModerationAction,
    requiresHumanReview: row.requiresHumanReview,
    sensitivityOverride: row.sensitivityOverride,
    cAudienceSafety: row.cAudienceSafety,
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    realSendAllowed: false,
    executionEnabled: false,
    notPublished: true,
    safetyEnvelope: { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED },
  };
}

function rowToCommand(row: typeof audienceModerationCommands.$inferSelect): AudienceModerationCommand {
  return {
    commandId: row.commandId,
    decisionId: row.decisionId,
    platform: row.platform as AudiencePlatform,
    connectorId: row.connectorId,
    externalMessageId: row.externalMessageId,
    requestedAction: row.requestedAction as RequestedModerationAction,
    requestedBy: row.requestedBy as ModerationRequestedBy,
    commandMode: row.commandMode as CommandMode,
    commandAllowed: row.commandAllowed,
    blockerReason: row.blockerReason ?? null,
    requiresHumanApproval: row.requiresHumanApproval,
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    realSendAllowed: false,
    executionEnabled: false,
    platformSendAllowed: false,
    decisionFingerprint: row.decisionFingerprint ?? "",
    safetyEnvelope: { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED },
  };
}

function rowToAuditExport(
  r: typeof audienceAuditExports.$inferSelect,
): AudienceAuditExportRecord {
  const median = Number(r.rollingMedian ?? 0);
  const total = Number(r.totalRowCount ?? 0);
  const multiplier = median > 0 ? total / median : 0;
  return {
    exportId: r.exportId,
    actorId: r.actorId,
    actorType: r.actorType,
    actorRole: r.actorRole ?? null,
    format: r.format as "json" | "csv" | "json-history" | "csv-history",
    filters: {
      fromDate: r.filters?.fromDate ?? null,
      toDate: r.filters?.toDate ?? null,
      platform: (r.filters?.platform ?? null) as AudiencePlatform | null,
      productionId: r.filters?.productionId ?? null,
      actorId: r.filters?.actorId ?? null,
    },
    rowCounts: {
      connectors: r.connectorCount,
      messages: r.messageCount,
      decisions: r.decisionCount,
      commands: r.commandCount,
      total: r.totalRowCount,
    },
    riskSignals: Array.isArray((r as any).riskSignals)
      ? ((r as any).riskSignals as AudienceAuditExportRiskSignal[])
      : [],
    exportedAt: r.exportedAt.toISOString(),
    outlier: {
      isOutlier: Boolean(r.isOutlier),
      rollingMedian: median,
      rollingP95: Number(r.rollingP95 ?? 0),
      threshold: Number(r.outlierThreshold ?? 0),
      sampleSize: Number(r.outlierSampleSize ?? 0),
      multiplier,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Task #428 — Rolling outlier detection for audit-trail exports.      */
/*   When the platform records an audit export it also computes a      */
/*   rolling median + p95 of the most-recent N exports' total row      */
/*   counts. If the new export exceeds `median * multiplier` (and is   */
/*   at least `minTotalRowCount` rows, with at least                   */
/*   `minSampleSize` prior exports for a stable median), it is         */
/*   flagged `isOutlier=true`. An "Outlier" badge renders in the       */
/*   admin UI and an `audience.audit_export_outlier` bus event is      */
/*   emitted so the founder/audit notifier can alert on it.            */
/* ------------------------------------------------------------------ */
export interface AudienceAuditExportOutlierConfig {
  enabled: boolean;
  windowSize: number;
  medianMultiplier: number;
  minSampleSize: number;
  minTotalRowCount: number;
}

export const DEFAULT_AUDIENCE_AUDIT_EXPORT_OUTLIER_CONFIG: AudienceAuditExportOutlierConfig =
  {
    enabled: true,
    windowSize: 50,
    medianMultiplier: 10,
    minSampleSize: 5,
    minTotalRowCount: 100,
  };

function clampOutlierConfig(
  input: Partial<AudienceAuditExportOutlierConfig> | null | undefined,
): AudienceAuditExportOutlierConfig {
  const base = DEFAULT_AUDIENCE_AUDIT_EXPORT_OUTLIER_CONFIG;
  if (!input || typeof input !== "object") return { ...base };
  const window = Number((input as any).windowSize);
  const multiplier = Number((input as any).medianMultiplier);
  const minSample = Number((input as any).minSampleSize);
  const minTotal = Number((input as any).minTotalRowCount);
  return {
    enabled: typeof (input as any).enabled === "boolean" ? (input as any).enabled : base.enabled,
    windowSize:
      Number.isFinite(window) && window >= 5 && window <= 1000
        ? Math.floor(window)
        : base.windowSize,
    medianMultiplier:
      Number.isFinite(multiplier) && multiplier >= 2 && multiplier <= 1000
        ? multiplier
        : base.medianMultiplier,
    minSampleSize:
      Number.isFinite(minSample) && minSample >= 2 && minSample <= 1000
        ? Math.floor(minSample)
        : base.minSampleSize,
    minTotalRowCount:
      Number.isFinite(minTotal) && minTotal >= 0 && minTotal <= 1_000_000_000
        ? Math.floor(minTotal)
        : base.minTotalRowCount,
  };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const w = idx - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

const AUDIENCE_AUDIT_EXPORT_OUTLIER_SETTING_KEY =
  "audience_audit_export_outlier";

export async function getAudienceAuditExportOutlierConfig(): Promise<AudienceAuditExportOutlierConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_AUDIT_EXPORT_OUTLIER_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) return { ...DEFAULT_AUDIENCE_AUDIT_EXPORT_OUTLIER_CONFIG };
    const raw = rows[0].value;
    if (!raw) return { ...DEFAULT_AUDIENCE_AUDIT_EXPORT_OUTLIER_CONFIG };
    try {
      const parsed = JSON.parse(raw);
      return clampOutlierConfig(parsed);
    } catch {
      return { ...DEFAULT_AUDIENCE_AUDIT_EXPORT_OUTLIER_CONFIG };
    }
  } catch (err) {
    console.error(
      "[audience-audit-export-outlier] failed to load config:",
      (err as Error)?.message ?? err,
    );
    return { ...DEFAULT_AUDIENCE_AUDIT_EXPORT_OUTLIER_CONFIG };
  }
}

export async function setAudienceAuditExportOutlierConfig(
  input: Partial<AudienceAuditExportOutlierConfig> & { updatedBy?: string | null },
): Promise<AudienceAuditExportOutlierConfig> {
  const next = clampOutlierConfig(input);
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_AUDIT_EXPORT_OUTLIER_SETTING_KEY,
      value: stored,
      updatedBy: input.updatedBy ?? undefined,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: stored,
        updatedBy: input.updatedBy ?? undefined,
        updatedAt: new Date(),
      },
    });
  return next;
}

export function computeAudienceAuditExportOutlier(
  totalRowCount: number,
  priorTotals: number[],
  cfgInput?: Partial<AudienceAuditExportOutlierConfig>,
): AudienceAuditExportOutlierStats {
  const cfg = clampOutlierConfig(cfgInput);
  const sample = priorTotals.filter((n) => Number.isFinite(n) && n >= 0);
  const sorted = [...sample].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const threshold = median > 0 ? median * cfg.medianMultiplier : 0;
  const multiplier = median > 0 ? totalRowCount / median : 0;
  const isOutlier =
    cfg.enabled &&
    sample.length >= cfg.minSampleSize &&
    median > 0 &&
    totalRowCount >= cfg.minTotalRowCount &&
    totalRowCount >= threshold;
  return {
    isOutlier,
    rollingMedian: median,
    rollingP95: p95,
    threshold,
    sampleSize: sample.length,
    multiplier,
  };
}

/**
 * Task #426: deterministic risk-signal detector for an audit-trail export.
 *
 * Pure with respect to its inputs — given the same `input` + `priorExports`
 * list it always returns the same signal array (sorted, deduplicated). The
 * service supplies `priorExports` from the DB, scoped to the same actor,
 * but the function itself does no IO so it stays trivially testable.
 *
 * Hard rules:
 *   - Special history formats (`json-history` / `csv-history`) and the
 *     audit-log sentinel `productionId === "__audit_export_log__"` are
 *     never themselves flagged — they exist to AUDIT exports, not to
 *     export user data, and flagging them would just spam the founder.
 *   - `full_trail` requires every filter to be null (date window AND
 *     platform AND productionId all empty).
 *   - `wide_date_window` only fires when BOTH endpoints are present;
 *     an open-ended window is already covered by `no_date_window`.
 */
export const WIDE_DATE_WINDOW_DAYS = 90;
export const WIDE_DATE_WINDOW_MS = WIDE_DATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function detectAuditExportRiskSignals(
  input: {
    format: AudienceAuditExportRecord["format"];
    filters: AudienceAuditExportRecord["filters"];
  },
  priorExports: ReadonlyArray<
    Pick<AudienceAuditExportRecord, "format" | "filters" | "exportedAt">
  >,
  options?: { wideDateWindowDays?: number },
): AudienceAuditExportRiskSignal[] {
  // Task #459: founder-tunable wide-window threshold. Default matches the
  // legacy `WIDE_DATE_WINDOW_DAYS` constant so behavior is unchanged until
  // an admin tunes it.
  const wideDays =
    options && typeof options.wideDateWindowDays === "number" &&
    Number.isFinite(options.wideDateWindowDays) &&
    options.wideDateWindowDays > 0
      ? Math.floor(options.wideDateWindowDays)
      : WIDE_DATE_WINDOW_DAYS;
  const wideMs = wideDays * 24 * 60 * 60 * 1000;
  // History-format meta-exports are themselves audit records — do not
  // flag them or every download of the export log would page the founder.
  if (input.format === "json-history" || input.format === "csv-history") {
    return [];
  }
  if (input.filters.productionId === "__audit_export_log__") {
    return [];
  }
  const signals = new Set<AudienceAuditExportRiskSignal>();
  const { fromDate, toDate, platform, productionId } = input.filters;
  const hasFrom = typeof fromDate === "string" && fromDate.length > 0;
  const hasTo = typeof toDate === "string" && toDate.length > 0;
  const hasPlatform = typeof platform === "string" && platform.length > 0;
  const hasProduction =
    typeof productionId === "string" && productionId.length > 0;

  if (!hasFrom && !hasTo && !hasPlatform && !hasProduction) {
    signals.add("full_trail");
  }
  if (!hasFrom && !hasTo) {
    signals.add("no_date_window");
  }
  if (hasFrom && hasTo) {
    const fromMs = Date.parse(fromDate as string);
    const toMs = Date.parse(toDate as string);
    if (
      Number.isFinite(fromMs) &&
      Number.isFinite(toMs) &&
      toMs - fromMs > wideMs
    ) {
      signals.add("wide_date_window");
    }
  }
  // Only consider prior REAL exports for actor-history signals, never
  // the actor's own meta-exports of the audit log.
  const priorReal = priorExports.filter(
    (p) =>
      p.format !== "json-history" &&
      p.format !== "csv-history" &&
      p.filters.productionId !== "__audit_export_log__",
  );
  if (priorReal.length === 0) {
    signals.add("first_export_by_actor");
  } else {
    if (hasProduction) {
      const seen = priorReal.some(
        (p) => p.filters.productionId === productionId,
      );
      if (!seen) signals.add("new_production_for_actor");
    }
    // Sort priors newest-first to find the most recent prior format.
    const mostRecent = priorReal
      .slice()
      .sort((a, b) => (a.exportedAt < b.exportedAt ? 1 : -1))[0];
    if (mostRecent && mostRecent.format !== input.format) {
      signals.add("format_change");
    }
  }
  return Array.from(signals).sort();
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */
export class OmniChannelAudienceSafetyService {
  // Story context is short-lived evaluator scaffolding (sensitivity class +
  // verified-claims overlay). It is not an audit record, so it stays in-
  // memory and is not persisted by Task #373.
  private stories: Map<string, StoryContext> = new Map();
  // Task #375: per-connector feature flags (multilingual lexicons +
  // AI second opinion). Kept in-memory as a lightweight overlay on top
  // of the DB-backed connector rows so we don't need a schema migration
  // for the toggle.
  private connectorFeatureFlags: Map<string, AudienceConnectorFeatureFlags> = new Map();
  // AI second-opinion plumbing (Task #375).
  private aiModerator: AiModeratorFn | null = null;
  private aiCache: Map<string, AiModerationResult | null> = new Map();
  private aiCallCount = 0;

  /**
   * Test/admin: clear all audience state. In test mode this truncates the
   * four `audience_*` tables so every test starts from a clean slate; in
   * non-test environments it only clears the ephemeral story context (the
   * audit trail must never be wiped from production).
   */
  async reset(): Promise<void> {
    this.stories.clear();
    this.connectorFeatureFlags.clear();
    this.aiCache.clear();
    this.aiCallCount = 0;
    if (!isTestEnv()) return;
    await db.execute(sql`TRUNCATE TABLE
      audience_audit_exports,
      audience_moderation_commands,
      audience_safety_decisions,
      audience_messages,
      audience_connector_secret_rotations,
      audience_connector_secrets,
      audience_channel_connectors
    `);
  }

  /** Admin/test: install an optional AI moderator for ambiguous-band rescoring. */
  setAiModerator(fn: AiModeratorFn | null): void {
    this.aiModerator = fn;
    this.aiCache.clear();
    this.aiCallCount = 0;
  }

  /** Test/admin: inspect cache for instrumentation. */
  getAiModerationStats(): { callCount: number; cacheSize: number } {
    return { callCount: this.aiCallCount, cacheSize: this.aiCache.size };
  }

  async registerConnector(input: {
    connectorId: string;
    platform: AudiencePlatform;
    accountId: string;
    displayName: string;
    connectionStatus?: AudienceChannelConnector["connectionStatus"];
    permissions?: Partial<AudiencePermissions>;
    apiAccessMode?: AudienceChannelConnector["apiAccessMode"];
    featureFlags?: Partial<AudienceConnectorFeatureFlags>;
  }): Promise<AudienceChannelConnector> {
    const connector: AudienceChannelConnector = {
      connectorId: input.connectorId,
      platform: input.platform,
      accountId: input.accountId,
      displayName: input.displayName,
      connectionStatus: input.connectionStatus ?? "connected",
      permissions: { ...ZERO_PERMISSIONS, ...input.permissions },
      apiAccessMode: input.apiAccessMode ?? "official_api",
      lastSyncAt: null,
      rateLimitStatus: null,
      featureFlags: { ...DEFAULT_FEATURE_FLAGS, ...input.featureFlags },
      approvalStatus: "draft",
      visibility: "admin_only_internal",
      publicUrl: null,
      signedUrl: null,
      realSendAllowed: false,
      executionEnabled: false,
      platformSendApproved: false,
      platformSendApprovedBy: null,
      platformSendApprovedAt: null,
      autoPausedAt: null,
      autoPausedReason: null,
      safetyEnvelope: { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED },
    };
    await db
      .insert(audienceChannelConnectors)
      .values({
        connectorId: connector.connectorId,
        platform: connector.platform,
        accountId: connector.accountId,
        displayName: connector.displayName,
        connectionStatus: connector.connectionStatus,
        permissions: connector.permissions,
        apiAccessMode: connector.apiAccessMode,
        lastSyncAt: null,
        rateLimitStatus: null,
        approvalStatus: "draft",
        visibility: "admin_only_internal",
        realSendAllowed: false,
        executionEnabled: false,
        platformSendApproved: false,
        platformSendApprovedBy: null,
        platformSendApprovedAt: null,
        autoPausedAt: null,
        autoPausedReason: null,
        safetyEnvelope: { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED },
      })
      .onConflictDoUpdate({
        target: audienceChannelConnectors.connectorId,
        set: {
          platform: connector.platform,
          accountId: connector.accountId,
          displayName: connector.displayName,
          connectionStatus: connector.connectionStatus,
          permissions: connector.permissions,
          apiAccessMode: connector.apiAccessMode,
        },
      });
    // Task #375: persist feature flags via in-memory overlay (not yet
    // materialized in the DB schema).
    this.connectorFeatureFlags.set(connector.connectorId, connector.featureFlags);
    return connector;
  }

  async updateConnectorFeatureFlags(
    connectorId: string,
    flags: Partial<AudienceConnectorFeatureFlags>,
  ): Promise<AudienceChannelConnector> {
    const existing = await this.getConnector(connectorId);
    if (!existing) throw new Error("connector_not_found");
    const merged: AudienceConnectorFeatureFlags = {
      ...DEFAULT_FEATURE_FLAGS,
      ...existing.featureFlags,
      ...flags,
    };
    this.connectorFeatureFlags.set(connectorId, merged);
    return { ...existing, featureFlags: merged };
  }

  private overlayFeatureFlags(c: AudienceChannelConnector): AudienceChannelConnector {
    const flags = this.connectorFeatureFlags.get(c.connectorId);
    return flags ? { ...c, featureFlags: flags } : c;
  }

  async listConnectors(): Promise<AudienceChannelConnector[]> {
    const rows = await db.select().from(audienceChannelConnectors);
    return rows.map(rowToConnector).map((c) => this.overlayFeatureFlags(c));
  }

  /**
   * Root-admin opt-in toggle for the future platform gateway (Task #374).
   * The gateway refuses to dispatch when this is false. Per-connector.
   * Persisted to Postgres so the approval survives restarts (Task #373).
   */
  async approvePlatformSend(
    connectorId: string,
    approved: boolean,
    approvedBy: string | null,
  ): Promise<AudienceChannelConnector> {
    const existing = await this.getConnector(connectorId);
    if (!existing) throw new Error(`unknown connector: ${connectorId}`);
    const approvedAt = approved ? new Date() : null;
    await db
      .update(audienceChannelConnectors)
      .set({
        platformSendApproved: approved,
        platformSendApprovedBy: approved ? approvedBy : null,
        platformSendApprovedAt: approvedAt,
        // Task #443: re-enabling a connector clears any previous
        // auto-pause stamp so the "auto-paused" badge disappears.
        autoPausedAt: null,
        autoPausedReason: null,
      })
      .where(eq(audienceChannelConnectors.connectorId, connectorId));
    return (await this.getConnector(connectorId))!;
  }

  /**
   * Task #443: auto-pause a connector after it crosses the gateway
   * block threshold for N consecutive windows. Flips
   * `platformSendApproved` to false and stamps the row with who/when/why
   * so the admin UI can surface an "auto-paused" badge.
   *
   * Returns the updated connector, or `null` if the connector is unknown
   * or was already paused (so the caller doesn't double-record).
   */
  async autoPauseConnector(
    connectorId: string,
    reason: string,
  ): Promise<AudienceChannelConnector | null> {
    const existing = await this.getConnector(connectorId);
    if (!existing) return null;
    if (!existing.platformSendApproved) return null;
    const pausedAt = new Date();
    await db
      .update(audienceChannelConnectors)
      .set({
        platformSendApproved: false,
        platformSendApprovedBy: null,
        platformSendApprovedAt: null,
        autoPausedAt: pausedAt,
        autoPausedReason: reason,
      })
      .where(eq(audienceChannelConnectors.connectorId, connectorId));
    return await this.getConnector(connectorId);
  }

  async getConnector(connectorId: string): Promise<AudienceChannelConnector | null> {
    const rows = await db
      .select()
      .from(audienceChannelConnectors)
      .where(eq(audienceChannelConnectors.connectorId, connectorId))
      .limit(1);
    return rows[0] ? this.overlayFeatureFlags(rowToConnector(rows[0])) : null;
  }

  setStoryContext(ctx: StoryContext): void {
    this.stories.set(ctx.storyId, ctx);
  }

  /** PUBLIC: redact a raw metadata object before persistence. */
  redactAudienceMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> {
    return redactMetadata(meta);
  }

  /** PUBLIC: validate that a connector has the required platform permission. */
  async validatePlatformPermission(
    connectorId: string,
    requestedAction: RequestedModerationAction,
  ): Promise<{ allowed: boolean; reason: string | null }> {
    const connector = await this.getConnector(connectorId);
    if (!connector) return { allowed: false, reason: "connector_not_registered" };
    if (connector.connectionStatus !== "connected" && connector.connectionStatus !== "limited_permissions") {
      return { allowed: false, reason: `connector_status_${connector.connectionStatus}` };
    }
    if (connector.apiAccessMode === "disabled") {
      return { allowed: false, reason: "api_access_disabled" };
    }
    const p = connector.permissions;
    const required: Record<RequestedModerationAction, keyof AudiencePermissions | null> = {
      hide_comment: "canHideComment",
      delete_comment: "canDeleteComment",
      timeout_user: "canTimeoutUser",
      ban_user: "canBanUser",
      reply: "canReply",
      pin: "canPin",
      edit_own_reply: "canEditOwnReply",
      no_action: null,
    };
    const key = required[requestedAction];
    if (key && !p[key]) return { allowed: false, reason: `permission_missing_${key}` };
    return { allowed: true, reason: null };
  }

  /** PUBLIC: ingest a raw audience message. */
  async ingestAudienceMessage(input: AudienceMessageIngest): Promise<AudienceMessage> {
    const parsed = AudienceMessageIngestSchema.parse(input);
    const connector = await this.getConnector(parsed.connectorId);
    if (!connector) throw new Error(`unknown connector: ${parsed.connectorId}`);
    if (connector.platform !== parsed.platform) {
      throw new Error(`platform mismatch for connector ${parsed.connectorId}`);
    }
    if (connector.apiAccessMode === "disabled") {
      throw new Error(`connector ${parsed.connectorId} api_access_disabled`);
    }
    const messageId = newId("aud");
    const receivedAt = parsed.receivedAt ? new Date(parsed.receivedAt) : new Date();
    const rawMetadataRedacted = redactMetadata(parsed.rawMetadata);
    await db.insert(audienceMessages).values({
      messageId,
      connectorId: parsed.connectorId,
      platform: parsed.platform,
      externalMessageId: parsed.externalMessageId,
      externalAuthorIdHash: hashAuthorId(parsed.externalAuthorId),
      authorDisplayNameSafe: parsed.authorDisplayName ?? null,
      messageText: parsed.messageText,
      messageType: parsed.messageType,
      receivedAt,
      storyId: parsed.storyId ?? null,
      productionId: parsed.productionId ?? null,
      broadcastBriefId: parsed.broadcastBriefId ?? null,
      giftValue: parsed.giftValue ?? null,
      rawMetadataRedacted,
      approvalStatus: "draft",
      visibility: "admin_only_internal",
      realSendAllowed: false,
      executionEnabled: false,
      safetyEnvelope: { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED },
    });
    const message = (await this.getMessage(messageId))!;
    neuralNewsroomBus.emit("audience.message_received", {
      messageId,
      platform: message.platform,
      messageType: message.messageType,
      storyId: message.storyId,
    });
    if (parsed.messageType === "gift" || parsed.messageType === "superchat" || parsed.messageType === "tip") {
      neuralNewsroomBus.emit("audience.gift_received", {
        messageId,
        platform: message.platform,
        giftValue: message.giftValue,
        storyId: message.storyId,
      });
    }
    return message;
  }

  async getMessage(messageId: string): Promise<AudienceMessage | null> {
    const rows = await db
      .select()
      .from(audienceMessages)
      .where(eq(audienceMessages.messageId, messageId))
      .limit(1);
    return rows[0] ? rowToMessage(rows[0]) : null;
  }

  async getDecision(decisionId: string): Promise<AudienceSafetyDecision | null> {
    const rows = await db
      .select()
      .from(audienceSafetyDecisions)
      .where(eq(audienceSafetyDecisions.decisionId, decisionId))
      .limit(1);
    return rows[0] ? rowToDecision(rows[0]) : null;
  }

  async getCommand(commandId: string): Promise<AudienceModerationCommand | null> {
    const rows = await db
      .select()
      .from(audienceModerationCommands)
      .where(eq(audienceModerationCommands.commandId, commandId))
      .limit(1);
    return rows[0] ? rowToCommand(rows[0]) : null;
  }

  /**
   * PUBLIC: evaluate safety + produce a decision for a message.
   *
   * Task #375: if the deterministic score sits in the ambiguous 0.3–0.6 band
   * on any toxicity-like axis AND the connector has
   * `aiModerationSecondOpinion` enabled AND an AI moderator is installed,
   * fetch a second opinion (cached per normalized-message hash) and fold it
   * into the final scores. Decisions still flow through the locked
   * `safetyEnvelope` and remain `draft` + `admin_only_internal`.
   */
  async evaluateAudienceSafety(messageId: string): Promise<AudienceSafetyDecision> {
    const message = await this.getMessage(messageId);
    if (!message) throw new Error(`unknown messageId: ${messageId}`);
    const connector = await this.getConnector(message.connectorId);
    const flags = connector?.featureFlags ?? DEFAULT_FEATURE_FLAGS;
    const baseScores = computeScores(
      message.messageText,
      message.messageType,
      flags.multilingualLexicons,
    );
    const extraReasons: string[] = [];
    let scores = baseScores;
    if (this.aiModerator && flags.aiModerationSecondOpinion && inAmbiguousBand(baseScores)) {
      const normalized = normalizeText(message.messageText);
      const hash = createHash("sha256").update(normalized).digest("hex");
      let result: AiModerationResult | null;
      if (this.aiCache.has(hash)) {
        result = this.aiCache.get(hash) ?? null;
      } else {
        try {
          result = await this.aiModerator(normalized);
        } catch {
          result = null;
        }
        this.aiCache.set(hash, result);
        this.aiCallCount++;
      }
      if (result) {
        scores = mergeAiScores(baseScores, result);
        extraReasons.push("ai_second_opinion_applied");
      }
    }
    return this.finalizeDecision(message, scores, extraReasons);
  }

  /**
   * Back-compat alias for callers that explicitly want the AI-aware path.
   * Identical to `evaluateAudienceSafety` post-Task-#375.
   */
  async evaluateAudienceSafetyAsync(messageId: string): Promise<AudienceSafetyDecision> {
    return this.evaluateAudienceSafety(messageId);
  }

  private async finalizeDecision(
    message: AudienceMessage,
    scores: AudienceSafetyScores,
    extraReasonCodes: string[],
  ): Promise<AudienceSafetyDecision> {
    const messageId = message.messageId;
    const reasonCodes: string[] = [...extraReasonCodes];
    const isPaid = message.messageType === "gift" || message.messageType === "superchat" || message.messageType === "tip";
    const story = message.storyId ? this.stories.get(message.storyId) ?? null : null;
    const sensitivity: StorySensitivity = story?.sensitivityClass ?? "normal";
    const sensitive = sensitivity !== "normal";

    // Hard blockers (anything ≥ 0.5 here forbids speech / display).
    if (scores.spamScore >= 0.5) reasonCodes.push("spam");
    if (scores.abuseScore >= 0.5) reasonCodes.push("abuse");
    if (scores.hateScore >= 0.5) reasonCodes.push("hate");
    if (scores.violenceRisk >= 0.5) reasonCodes.push("threats");
    if (scores.piiRisk >= 0.5) reasonCodes.push("pii");
    if (scores.misinformationRisk >= 0.5) reasonCodes.push("misinformation");
    if (scores.copyrightRisk >= 0.5) reasonCodes.push("copyright");
    if (scores.impersonationRisk >= 0.5) reasonCodes.push("impersonation");
    if (scores.sexualContentRisk >= 0.5) reasonCodes.push("sexual_content");
    if (scores.selfHarmRisk >= 0.5) reasonCodes.push("self_harm");
    if (scores.botRisk >= 0.6) reasonCodes.push("bot_pattern");

    const hardBlocked = reasonCodes.length > 0;

    let action: AudienceSafetyDecision["action"] = "ignore";
    let allowedForRobotSpeech = false;
    let allowedForAnchorSpeech = false;
    let allowedForScreenDisplay = false;
    let allowedForAutoReply = false;
    let allowedForModerationAction = false;
    let requiresHumanReview = false;
    let sensitivityOverride = false;

    if (hardBlocked) {
      if (reasonCodes.includes("spam") || reasonCodes.includes("bot_pattern")) action = "hide";
      else if (reasonCodes.includes("threats") || reasonCodes.includes("hate")) action = "ban_if_allowed";
      else if (reasonCodes.includes("abuse")) action = "timeout_if_allowed";
      else if (reasonCodes.includes("pii") || reasonCodes.includes("impersonation")) action = "delete_if_allowed";
      else action = "moderator_review";
      allowedForModerationAction = true;
      requiresHumanReview = reasonCodes.includes("misinformation")
        || reasonCodes.includes("self_harm")
        || reasonCodes.includes("threats")
        || reasonCodes.includes("hate");
      if (reasonCodes.includes("spam")) neuralNewsroomBus.emit("audience.spam_blocked", { messageId, platform: message.platform });
      if (reasonCodes.includes("abuse") || reasonCodes.includes("hate") || reasonCodes.includes("threats")) {
        neuralNewsroomBus.emit("audience.abuse_blocked", { messageId, platform: message.platform, reasons: reasonCodes });
      }
      if (reasonCodes.includes("misinformation")) {
        neuralNewsroomBus.emit("audience.misinformation_blocked", { messageId, platform: message.platform });
      }
    } else if (isPaid) {
      if (sensitive) {
        action = "moderator_review";
        requiresHumanReview = true;
        sensitivityOverride = true;
        reasonCodes.push("paid_message_during_sensitive_story");
      } else {
        action = "robot_acknowledge";
        allowedForRobotSpeech = true;
        allowedForScreenDisplay = true;
      }
    } else {
      if (sensitive) {
        const isModeratorNote = message.messageType === "moderator_note";
        const isQuestion = /\?/.test(message.messageText);
        const verifiedClaims = story?.verifiedClaims ?? [];
        const text = message.messageText.toLowerCase();
        const questionIsVerified = isQuestion && verifiedClaims.some((claim) => {
          const c = claim.trim().toLowerCase();
          if (!c) return false;
          if (text.includes(c)) return true;
          const tokens = c.split(/\W+/).filter((t) => t.length >= 4);
          return tokens.some((t) => text.includes(t));
        });
        if (isModeratorNote || questionIsVerified) {
          action = "anchor_read";
          allowedForAnchorSpeech = true;
          allowedForScreenDisplay = true;
          sensitivityOverride = true;
        } else {
          action = "moderator_review";
          requiresHumanReview = true;
          sensitivityOverride = true;
          if (isQuestion) reasonCodes.push("unverified_question_during_sensitive_story");
        }
      } else {
        action = "safe_highlight";
        allowedForRobotSpeech = true;
        allowedForAnchorSpeech = true;
        allowedForScreenDisplay = true;
        allowedForAutoReply = true;
      }
    }

    let cAudienceSafety = 1.0;
    if (hardBlocked) cAudienceSafety = 0.0;
    else if (requiresHumanReview || sensitivityOverride) cAudienceSafety = 0.6;

    const decisionId = newId("aud_dec");
    await db.insert(audienceSafetyDecisions).values({
      decisionId,
      messageId,
      platform: message.platform,
      action,
      reasonCodes,
      scores,
      giftValue: message.giftValue,
      allowedForRobotSpeech,
      allowedForAnchorSpeech,
      allowedForScreenDisplay,
      allowedForAutoReply,
      allowedForModerationAction,
      requiresHumanReview,
      sensitivityOverride,
      cAudienceSafety,
      approvalStatus: "draft",
      visibility: "admin_only_internal",
      realSendAllowed: false,
      executionEnabled: false,
      notPublished: true,
      safetyEnvelope: { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED },
    });
    const decision = (await this.getDecision(decisionId))!;
    neuralNewsroomBus.emit("audience.message_filtered", {
      decisionId: decision.decisionId,
      messageId,
      platform: message.platform,
      action: decision.action,
      reasonCodes: decision.reasonCodes,
    });
    if (action === "robot_acknowledge" && isPaid && !hardBlocked && !sensitive) {
      neuralNewsroomBus.emit("audience.gift_safe_acknowledged", {
        decisionId: decision.decisionId,
        messageId,
        platform: message.platform,
        giftValue: message.giftValue,
      });
    }
    return decision;
  }

  async listDecisions(productionId?: string, limit = 100): Promise<AudienceSafetyDecision[]> {
    const cap = Math.max(1, limit);
    if (!productionId) {
      const rows = await db
        .select()
        .from(audienceSafetyDecisions)
        .orderBy(desc(audienceSafetyDecisions.decidedAt))
        .limit(cap);
      return rows.map(rowToDecision);
    }
    const rows = await db
      .select({ d: audienceSafetyDecisions })
      .from(audienceSafetyDecisions)
      .innerJoin(audienceMessages, eq(audienceMessages.messageId, audienceSafetyDecisions.messageId))
      .where(eq(audienceMessages.productionId, productionId))
      .orderBy(desc(audienceSafetyDecisions.decidedAt))
      .limit(cap);
    return rows.map((r) => rowToDecision(r.d));
  }

  async listMessages(productionId?: string, limit = 100): Promise<AudienceMessage[]> {
    const cap = Math.max(1, limit);
    const rows = productionId
      ? await db
          .select()
          .from(audienceMessages)
          .where(eq(audienceMessages.productionId, productionId))
          .orderBy(desc(audienceMessages.receivedAt))
          .limit(cap)
      : await db
          .select()
          .from(audienceMessages)
          .orderBy(desc(audienceMessages.receivedAt))
          .limit(cap);
    return rows.map(rowToMessage);
  }

  async listCommands(limit = 100): Promise<AudienceModerationCommand[]> {
    const cap = Math.max(1, limit);
    const rows = await db
      .select()
      .from(audienceModerationCommands)
      .orderBy(desc(audienceModerationCommands.createdAt))
      .limit(cap);
    return rows.map(rowToCommand);
  }

  /**
   * Task #689 — same as `listCommands`, but enriches each command with
   * a resolved admin identity for `requestedBy` so the moderation
   * commands panel can render "Display Name (email)" instead of a raw
   * uuid in the "issued by" column. The DB column `requested_by` is a
   * free-form text field (the `ModerationRequestedBy` enum at the
   * service boundary is one of `robot_anchor` / `ai_moderator` /
   * `system_policy` / `root_admin`; older callers may have persisted a
   * raw admin uuid here). Enum values never match an admin_staff row,
   * so they pass through with `null` identity fields and the panel
   * just shows the enum text. Mirrors the resolution pattern shipped
   * for the four audit panels in Task #672.
   */
  async listCommandsWithActorIdentities(
    limit = 100,
  ): Promise<
    Array<
      AudienceModerationCommand & {
        requestedByDisplayName: string | null;
        requestedByEmail: string | null;
      }
    >
  > {
    const commands = await this.listCommands(limit);
    const { resolveAdminIdentities } = await import(
      "./admin-identity-resolver"
    );
    const identityById = await resolveAdminIdentities(
      commands.map((c) => c.requestedBy as unknown as string),
    );
    return commands.map((c) => {
      const ident = identityById.get(c.requestedBy as unknown as string) ?? null;
      return {
        ...c,
        requestedByDisplayName: ident?.displayName ?? null,
        requestedByEmail: ident?.email ?? null,
      };
    });
  }

  /**
   * Export the audience moderation audit trail for compliance review
   * (Task #382). Returns the four `audience_*` record types filtered by
   * date range, platform, and productionId. All records are already
   * PII-redacted (hashed authorIds, redacted metadata) by ingestion —
   * this method does not re-expose any raw data.
   */
  async exportAuditTrail(filters: {
    fromDate?: Date;
    toDate?: Date;
    platform?: AudiencePlatform;
    productionId?: string;
    /**
     * Task #632 — hard row cap applied per-section so a giant export
     * can't materialize unbounded rows. `truncated` in the return is
     * `true` whenever any section hit the cap.
     */
    limit?: number;
  } = {}): Promise<{
    connectors: AudienceChannelConnector[];
    messages: AudienceMessage[];
    decisions: AudienceSafetyDecision[];
    commands: AudienceModerationCommand[];
    filters: {
      fromDate: string | null;
      toDate: string | null;
      platform: AudiencePlatform | null;
      productionId: string | null;
    };
    exportedAt: string;
    truncated: boolean;
    rowCap: number | null;
  }> {
    const { fromDate, toDate, platform, productionId, limit } = filters;
    const cap =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : null;
    const fetchLimit = cap !== null ? cap + 1 : undefined;

    // Messages — filterable by all four
    const msgWhere = and(
      ...[
        fromDate ? gte(audienceMessages.receivedAt, fromDate) : undefined,
        toDate ? lte(audienceMessages.receivedAt, toDate) : undefined,
        platform ? eq(audienceMessages.platform, platform) : undefined,
        productionId ? eq(audienceMessages.productionId, productionId) : undefined,
      ].filter(Boolean) as any[],
    );
    const messageQuery = db
      .select()
      .from(audienceMessages)
      .where(msgWhere)
      .orderBy(desc(audienceMessages.receivedAt));
    const messageRowsRaw = fetchLimit
      ? await messageQuery.limit(fetchLimit)
      : await messageQuery;
    let messagesTruncated = false;
    let messageRows = messageRowsRaw;
    if (cap !== null && messageRows.length > cap) {
      messagesTruncated = true;
      messageRows = messageRows.slice(0, cap);
    }
    const messages = messageRows.map(rowToMessage);
    const messageIds = new Set(messages.map((m) => m.messageId));

    // Decisions — filter by date+platform, then narrow to the message scope
    // (productionId only lives on messages, so use the message-id allow-list).
    const decWhere = and(
      ...[
        fromDate ? gte(audienceSafetyDecisions.decidedAt, fromDate) : undefined,
        toDate ? lte(audienceSafetyDecisions.decidedAt, toDate) : undefined,
        platform ? eq(audienceSafetyDecisions.platform, platform) : undefined,
      ].filter(Boolean) as any[],
    );
    const decisionQuery = db
      .select()
      .from(audienceSafetyDecisions)
      .where(decWhere)
      .orderBy(desc(audienceSafetyDecisions.decidedAt));
    const decisionRowsRaw = fetchLimit
      ? await decisionQuery.limit(fetchLimit)
      : await decisionQuery;
    let decisionsTruncated = false;
    let decisionRows = decisionRowsRaw;
    if (cap !== null && decisionRows.length > cap) {
      decisionsTruncated = true;
      decisionRows = decisionRows.slice(0, cap);
    }
    const decisions = decisionRows
      .map(rowToDecision)
      .filter((d) => (productionId ? messageIds.has(d.messageId) : true));
    const decisionIds = new Set(decisions.map((d) => d.decisionId));

    // Commands — filter by date+platform, narrow to decision scope when
    // productionId is in play.
    const cmdWhere = and(
      ...[
        fromDate ? gte(audienceModerationCommands.createdAt, fromDate) : undefined,
        toDate ? lte(audienceModerationCommands.createdAt, toDate) : undefined,
        platform ? eq(audienceModerationCommands.platform, platform) : undefined,
      ].filter(Boolean) as any[],
    );
    const commandQuery = db
      .select()
      .from(audienceModerationCommands)
      .where(cmdWhere)
      .orderBy(desc(audienceModerationCommands.createdAt));
    const commandRowsRaw = fetchLimit
      ? await commandQuery.limit(fetchLimit)
      : await commandQuery;
    let commandsTruncated = false;
    let commandRows = commandRowsRaw;
    if (cap !== null && commandRows.length > cap) {
      commandsTruncated = true;
      commandRows = commandRows.slice(0, cap);
    }
    const commands = commandRows
      .map(rowToCommand)
      .filter((c) => (productionId ? decisionIds.has(c.decisionId) : true));

    // Connectors — filter by platform only (no date/productionId on table).
    const connectorRows = await db
      .select()
      .from(audienceChannelConnectors)
      .where(platform ? eq(audienceChannelConnectors.platform, platform) : undefined)
      .orderBy(desc(audienceChannelConnectors.createdAt));
    const connectors = connectorRows.map(rowToConnector);

    return {
      connectors,
      messages,
      decisions,
      commands,
      filters: {
        fromDate: fromDate ? fromDate.toISOString() : null,
        toDate: toDate ? toDate.toISOString() : null,
        platform: platform ?? null,
        productionId: productionId ?? null,
      },
      exportedAt: new Date().toISOString(),
      truncated: messagesTruncated || decisionsTruncated || commandsTruncated,
      rowCap: cap,
    };
  }

  /**
   * Task #632 — preflight count for the audit-trail export. Returns per-
   * section counts so the admin UI can warn before pulling a download
   * that would hit the hard row cap. Counts are independent (a single
   * productionId may match many messages but few decisions / commands).
   */
  async countAuditTrail(filters: {
    fromDate?: Date;
    toDate?: Date;
    platform?: AudiencePlatform;
    productionId?: string;
  } = {}): Promise<{
    connectors: number;
    messages: number;
    decisions: number;
    commands: number;
    total: number;
  }> {
    const { fromDate, toDate, platform, productionId } = filters;
    const msgWhere = and(
      ...[
        fromDate ? gte(audienceMessages.receivedAt, fromDate) : undefined,
        toDate ? lte(audienceMessages.receivedAt, toDate) : undefined,
        platform ? eq(audienceMessages.platform, platform) : undefined,
        productionId ? eq(audienceMessages.productionId, productionId) : undefined,
      ].filter(Boolean) as any[],
    );
    const decWhere = and(
      ...[
        fromDate ? gte(audienceSafetyDecisions.decidedAt, fromDate) : undefined,
        toDate ? lte(audienceSafetyDecisions.decidedAt, toDate) : undefined,
        platform ? eq(audienceSafetyDecisions.platform, platform) : undefined,
      ].filter(Boolean) as any[],
    );
    const cmdWhere = and(
      ...[
        fromDate ? gte(audienceModerationCommands.createdAt, fromDate) : undefined,
        toDate ? lte(audienceModerationCommands.createdAt, toDate) : undefined,
        platform ? eq(audienceModerationCommands.platform, platform) : undefined,
      ].filter(Boolean) as any[],
    );
    const countOf = async (q: any) => {
      const rows = await q;
      return Number(rows?.[0]?.count ?? 0);
    };
    const msgBase = db
      .select({ count: sql<number>`count(*)::int` })
      .from(audienceMessages);
    const decBase = db
      .select({ count: sql<number>`count(*)::int` })
      .from(audienceSafetyDecisions);
    const cmdBase = db
      .select({ count: sql<number>`count(*)::int` })
      .from(audienceModerationCommands);
    const conBase = db
      .select({ count: sql<number>`count(*)::int` })
      .from(audienceChannelConnectors);
    // Serial (not Promise.all) — `db` shares a small connection pool
    // with the rest of the request; four simultaneous count queries
    // can exhaust it under load. Counts are cheap so latency cost is
    // negligible.
    const messages = await countOf(msgWhere ? msgBase.where(msgWhere) : msgBase);
    const decisions = await countOf(decWhere ? decBase.where(decWhere) : decBase);
    const commands = await countOf(cmdWhere ? cmdBase.where(cmdWhere) : cmdBase);
    const connectors = await countOf(
      platform
        ? conBase.where(eq(audienceChannelConnectors.platform, platform))
        : conBase,
    );
    return {
      connectors,
      messages,
      decisions,
      commands,
      total: connectors + messages + decisions + commands,
    };
  }

  /**
   * Record a meta-audit row for an audit-trail export (Task #386). Logged
   * even when the export returns zero rows so that any leaked export can
   * be traced back to the actor + timestamp + filters that produced it.
   */
  async recordAuditExport(input: {
    actorId: string;
    actorType: string;
    actorRole?: string | null;
    format: "json" | "csv" | "json-history" | "csv-history";
    filters: {
      fromDate: string | null;
      toDate: string | null;
      platform: AudiencePlatform | null;
      productionId: string | null;
      actorId?: string | null;
    };
    rowCounts: {
      connectors: number;
      messages: number;
      decisions: number;
      commands: number;
    };
  }): Promise<AudienceAuditExportRecord> {
    const exportId = newId("aud_exp");
    const total =
      input.rowCounts.connectors +
      input.rowCounts.messages +
      input.rowCounts.decisions +
      input.rowCounts.commands;
    const exportedAt = new Date();
    // Task #426: compute risk signals against this actor's prior exports
    // BEFORE inserting the new row, so the new row is not counted as a
    // prior. Wrapped in try/catch so a transient DB read failure never
    // blocks an audit-trail export — better to log without signals than
    // to lose the audit record entirely.
    let riskSignals: AudienceAuditExportRiskSignal[] = [];
    try {
      const priorRows = await db
        .select({
          format: audienceAuditExports.format,
          filters: audienceAuditExports.filters,
          exportedAt: audienceAuditExports.exportedAt,
        })
        .from(audienceAuditExports)
        .where(eq(audienceAuditExports.actorId, input.actorId))
        .orderBy(desc(audienceAuditExports.exportedAt))
        .limit(500);
      const priors = priorRows.map((p) => ({
        format: p.format as AudienceAuditExportRecord["format"],
        filters: {
          fromDate: p.filters?.fromDate ?? null,
          toDate: p.filters?.toDate ?? null,
          platform: (p.filters?.platform ?? null) as AudiencePlatform | null,
          productionId: p.filters?.productionId ?? null,
        },
        exportedAt: p.exportedAt.toISOString(),
      }));
      const { getAudienceRiskSignalRules } = await import(
        "./audience-risk-signal-rules-service"
      );
      const rules = await getAudienceRiskSignalRules();
      riskSignals = detectAuditExportRiskSignals(
        { format: input.format, filters: input.filters },
        priors,
        { wideDateWindowDays: rules.wideDateWindowDays },
      );
    } catch (err) {
      console.error(
        "[audience-audit-export] risk-signal detection failed:",
        (err as Error)?.message ?? err,
      );
      riskSignals = [];
    }

    // Task #428 — pull the last N totals (across all actors) to compute
    // rolling median/p95 and decide whether this new export should be
    // flagged as an outlier.
    const cfg = await getAudienceAuditExportOutlierConfig();
    const outlierPriorRows = await db
      .select({ totalRowCount: audienceAuditExports.totalRowCount })
      .from(audienceAuditExports)
      .orderBy(desc(audienceAuditExports.exportedAt))
      .limit(cfg.windowSize);
    const priorTotals = outlierPriorRows.map((r) => Number(r.totalRowCount ?? 0));
    const outlier = computeAudienceAuditExportOutlier(total, priorTotals, cfg);

    await db.insert(audienceAuditExports).values({
      exportId,
      actorId: input.actorId,
      actorType: input.actorType,
      actorRole: input.actorRole ?? null,
      format: input.format,
      filters: input.filters,
      connectorCount: input.rowCounts.connectors,
      messageCount: input.rowCounts.messages,
      decisionCount: input.rowCounts.decisions,
      commandCount: input.rowCounts.commands,
      totalRowCount: total,
      riskSignals,
      isOutlier: outlier.isOutlier,
      rollingMedian: outlier.rollingMedian,
      rollingP95: outlier.rollingP95,
      outlierThreshold: outlier.threshold,
      outlierSampleSize: outlier.sampleSize,
      exportedAt,
    });
    const record: AudienceAuditExportRecord = {
      exportId,
      actorId: input.actorId,
      actorType: input.actorType,
      actorRole: input.actorRole ?? null,
      format: input.format,
      filters: input.filters,
      rowCounts: { ...input.rowCounts, total },
      riskSignals,
      exportedAt: exportedAt.toISOString(),
      outlier,
    };
    neuralNewsroomBus.emit("audience.audit_exported", record);
    if (outlier.isOutlier) {
      neuralNewsroomBus.emit("audience.audit_export_outlier", record);
    }
    return record;
  }

  async listAuditExports(
    arg: number | {
      limit?: number;
      offset?: number;
      actorId?: string | null;
      from?: Date | null;
      to?: Date | null;
      platform?: AudiencePlatform | null;
      format?: "json" | "csv" | "json-history" | "csv-history" | null;
      minTotalRows?: number | null;
      flaggedOnly?: boolean;
      sortBy?: "exportedAt" | "totalRowCount";
      sortOrder?: "asc" | "desc";
    } = 50,
  ): Promise<{ rows: AudienceAuditExportRecord[]; total: number; limit: number; offset: number }> {
    const opts = typeof arg === "number" ? { limit: arg } : arg;
    const limit = Math.max(1, Math.min(500, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);
    const sortBy = opts.sortBy ?? "exportedAt";
    const sortOrder = opts.sortOrder ?? "desc";

    const conds: any[] = [];
    if (opts.actorId) conds.push(eq(audienceAuditExports.actorId, opts.actorId));
    if (opts.from) conds.push(gte(audienceAuditExports.exportedAt, opts.from));
    if (opts.to) conds.push(lte(audienceAuditExports.exportedAt, opts.to));
    if (opts.format) conds.push(eq(audienceAuditExports.format, opts.format));
    if (opts.minTotalRows != null) {
      conds.push(gte(audienceAuditExports.totalRowCount, opts.minTotalRows));
    }
    if (opts.platform) {
      conds.push(sql`${audienceAuditExports.filters}->>'platform' = ${opts.platform}`);
    }
    if (opts.flaggedOnly) {
      conds.push(sql`cardinality(${audienceAuditExports.riskSignals}) > 0`);
    }
    const whereClause = conds.length > 0 ? and(...conds) : undefined;

    const sortCol =
      sortBy === "totalRowCount"
        ? audienceAuditExports.totalRowCount
        : audienceAuditExports.exportedAt;
    const orderExpr = sortOrder === "asc" ? sortCol : desc(sortCol);

    const baseSelect = db.select().from(audienceAuditExports);
    const filteredSelect = whereClause ? baseSelect.where(whereClause) : baseSelect;
    const rowsRaw = await filteredSelect.orderBy(orderExpr).limit(limit).offset(offset);

    const baseCount = db
      .select({ count: sql<number>`count(*)::int` })
      .from(audienceAuditExports);
    const countQuery = whereClause ? baseCount.where(whereClause) : baseCount;
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count ?? 0);

    const rows: AudienceAuditExportRecord[] = rowsRaw.map(rowToAuditExport);
    return { rows, total, limit, offset };
  }

  /**
   * Return the full meta-audit trail (no row cap) for the
   * `export-log/export` history download (Task #398). Ordered newest
   * first to match the admin UI.
   */
  async listAllAuditExports(
    opts: {
      from?: Date | null;
      to?: Date | null;
      actorId?: string | null;
      platform?: AudiencePlatform | null;
      format?: "json" | "csv" | "json-history" | "csv-history" | null;
      minTotalRows?: number | null;
    } = {},
  ): Promise<AudienceAuditExportRecord[]> {
    const conds: any[] = [];
    if (opts.actorId) conds.push(eq(audienceAuditExports.actorId, opts.actorId));
    if (opts.from) conds.push(gte(audienceAuditExports.exportedAt, opts.from));
    if (opts.to) conds.push(lte(audienceAuditExports.exportedAt, opts.to));
    if (opts.format) conds.push(eq(audienceAuditExports.format, opts.format));
    if (opts.minTotalRows != null) {
      conds.push(gte(audienceAuditExports.totalRowCount, opts.minTotalRows));
    }
    if (opts.platform) {
      conds.push(sql`${audienceAuditExports.filters}->>'platform' = ${opts.platform}`);
    }
    const baseSelect = db.select().from(audienceAuditExports);
    const filteredSelect =
      conds.length > 0 ? baseSelect.where(and(...conds)) : baseSelect;
    const rows = await filteredSelect.orderBy(desc(audienceAuditExports.exportedAt));
    return rows.map(rowToAuditExport);
  }

  /**
   * Task #632 — bounded variant of {@link listAllAuditExports}. Fetches
   * at most `limit` rows (cap+1 under the hood) and returns
   * `{ rows, truncated, rowCap }` so the admin history download route
   * can surface "this file stops at N rows; narrow filters to see more"
   * to the operator instead of silently dropping the rest.
   */
  async listAllAuditExportsBounded(
    opts: {
      from?: Date | null;
      to?: Date | null;
      actorId?: string | null;
      platform?: AudiencePlatform | null;
      format?: "json" | "csv" | "json-history" | "csv-history" | null;
      minTotalRows?: number | null;
      limit: number;
    },
  ): Promise<{ rows: AudienceAuditExportRecord[]; truncated: boolean; rowCap: number }> {
    const cap = Math.max(1, Math.floor(opts.limit));
    const conds: any[] = [];
    if (opts.actorId) conds.push(eq(audienceAuditExports.actorId, opts.actorId));
    if (opts.from) conds.push(gte(audienceAuditExports.exportedAt, opts.from));
    if (opts.to) conds.push(lte(audienceAuditExports.exportedAt, opts.to));
    if (opts.format) conds.push(eq(audienceAuditExports.format, opts.format));
    if (opts.minTotalRows != null) {
      conds.push(gte(audienceAuditExports.totalRowCount, opts.minTotalRows));
    }
    if (opts.platform) {
      conds.push(sql`${audienceAuditExports.filters}->>'platform' = ${opts.platform}`);
    }
    const baseSelect = db.select().from(audienceAuditExports);
    const filteredSelect =
      conds.length > 0 ? baseSelect.where(and(...conds)) : baseSelect;
    const rowsRaw = await filteredSelect
      .orderBy(desc(audienceAuditExports.exportedAt))
      .limit(cap + 1);
    let truncated = false;
    let rowsSlice = rowsRaw;
    if (rowsSlice.length > cap) {
      truncated = true;
      rowsSlice = rowsSlice.slice(0, cap);
    }
    return { rows: rowsSlice.map(rowToAuditExport), truncated, rowCap: cap };
  }

  /**
   * Return the meta-audit trail filtered + sorted with the same
   * predicates as {@link listAuditExports} but without pagination —
   * powers the admin "Download filtered results" button (Task #427) so
   * the downloaded file matches exactly what the admin is looking at.
   */
  async listAllFilteredAuditExports(opts: {
    actorId?: string | null;
    from?: Date | null;
    to?: Date | null;
    platform?: AudiencePlatform | null;
    format?: "json" | "csv" | "json-history" | "csv-history" | null;
    minTotalRows?: number | null;
    flaggedOnly?: boolean;
    sortBy?: "exportedAt" | "totalRowCount";
    sortOrder?: "asc" | "desc";
  } = {}): Promise<AudienceAuditExportRecord[]> {
    const sortBy = opts.sortBy ?? "exportedAt";
    const sortOrder = opts.sortOrder ?? "desc";

    const conds: any[] = [];
    if (opts.actorId) conds.push(eq(audienceAuditExports.actorId, opts.actorId));
    if (opts.from) conds.push(gte(audienceAuditExports.exportedAt, opts.from));
    if (opts.to) conds.push(lte(audienceAuditExports.exportedAt, opts.to));
    if (opts.format) conds.push(eq(audienceAuditExports.format, opts.format));
    if (opts.minTotalRows != null) {
      conds.push(gte(audienceAuditExports.totalRowCount, opts.minTotalRows));
    }
    if (opts.platform) {
      conds.push(sql`${audienceAuditExports.filters}->>'platform' = ${opts.platform}`);
    }
    if (opts.flaggedOnly) {
      conds.push(sql`cardinality(${audienceAuditExports.riskSignals}) > 0`);
    }
    const whereClause = conds.length > 0 ? and(...conds) : undefined;

    const sortCol =
      sortBy === "totalRowCount"
        ? audienceAuditExports.totalRowCount
        : audienceAuditExports.exportedAt;
    const orderExpr = sortOrder === "asc" ? sortCol : desc(sortCol);

    const baseSelect = db.select().from(audienceAuditExports);
    const filteredSelect = whereClause ? baseSelect.where(whereClause) : baseSelect;
    const rowsRaw = await filteredSelect.orderBy(orderExpr);
    return rowsRaw.map(rowToAuditExport);
  }

  /**
   * Task #632 — bounded variant of {@link listAllFilteredAuditExports}.
   * Same predicates + sort but stops at `limit` rows and reports
   * truncation so the filtered-download route can surface the cap.
   */
  async listAllFilteredAuditExportsBounded(opts: {
    actorId?: string | null;
    from?: Date | null;
    to?: Date | null;
    platform?: AudiencePlatform | null;
    format?: "json" | "csv" | "json-history" | "csv-history" | null;
    minTotalRows?: number | null;
    flaggedOnly?: boolean;
    sortBy?: "exportedAt" | "totalRowCount";
    sortOrder?: "asc" | "desc";
    limit: number;
  }): Promise<{ rows: AudienceAuditExportRecord[]; truncated: boolean; rowCap: number }> {
    const cap = Math.max(1, Math.floor(opts.limit));
    const sortBy = opts.sortBy ?? "exportedAt";
    const sortOrder = opts.sortOrder ?? "desc";
    const conds: any[] = [];
    if (opts.actorId) conds.push(eq(audienceAuditExports.actorId, opts.actorId));
    if (opts.from) conds.push(gte(audienceAuditExports.exportedAt, opts.from));
    if (opts.to) conds.push(lte(audienceAuditExports.exportedAt, opts.to));
    if (opts.format) conds.push(eq(audienceAuditExports.format, opts.format));
    if (opts.minTotalRows != null) {
      conds.push(gte(audienceAuditExports.totalRowCount, opts.minTotalRows));
    }
    if (opts.platform) {
      conds.push(sql`${audienceAuditExports.filters}->>'platform' = ${opts.platform}`);
    }
    if (opts.flaggedOnly) {
      conds.push(sql`cardinality(${audienceAuditExports.riskSignals}) > 0`);
    }
    const whereClause = conds.length > 0 ? and(...conds) : undefined;
    const sortCol =
      sortBy === "totalRowCount"
        ? audienceAuditExports.totalRowCount
        : audienceAuditExports.exportedAt;
    const orderExpr = sortOrder === "asc" ? sortCol : desc(sortCol);
    const baseSelect = db.select().from(audienceAuditExports);
    const filteredSelect = whereClause ? baseSelect.where(whereClause) : baseSelect;
    const rowsRaw = await filteredSelect.orderBy(orderExpr).limit(cap + 1);
    let truncated = false;
    let rowsSlice = rowsRaw;
    if (rowsSlice.length > cap) {
      truncated = true;
      rowsSlice = rowsSlice.slice(0, cap);
    }
    return { rows: rowsSlice.map(rowToAuditExport), truncated, rowCap: cap };
  }

  /** PUBLIC: build a robot-readable reaction payload. */
  async buildRobotAudienceReaction(decisionId: string): Promise<{
    decisionId: string;
    canSpeak: boolean;
    text: string | null;
    reason: string;
  }> {
    const d = await this.getDecision(decisionId);
    if (!d) throw new Error(`unknown decisionId: ${decisionId}`);
    const m = await this.getMessage(d.messageId);
    if (!d.allowedForRobotSpeech || !m) {
      return { decisionId, canSpeak: false, text: null, reason: d.reasonCodes.join(",") || "not_allowed" };
    }
    neuralNewsroomBus.emit("audience.robot_response_created", { decisionId, platform: d.platform });
    return {
      decisionId,
      canSpeak: true,
      text: `Thanks for the message: ${m.messageText.slice(0, 120)}`,
      reason: "safe",
    };
  }

  /** PUBLIC: build an anchor-readable reaction payload. */
  async buildAnchorAudienceReaction(decisionId: string): Promise<{
    decisionId: string;
    canSpeak: boolean;
    text: string | null;
    reason: string;
  }> {
    const d = await this.getDecision(decisionId);
    if (!d) throw new Error(`unknown decisionId: ${decisionId}`);
    const m = await this.getMessage(d.messageId);
    if (!d.allowedForAnchorSpeech || !m) {
      return { decisionId, canSpeak: false, text: null, reason: d.reasonCodes.join(",") || "not_allowed" };
    }
    return {
      decisionId,
      canSpeak: true,
      text: m.messageText.slice(0, 200),
      reason: "safe",
    };
  }

  /** PUBLIC: route an approved highlight to the screen (simulation only). */
  async routeSafeHighlightToScreen(decisionId: string): Promise<{
    decisionId: string;
    routed: boolean;
    reason: string;
  }> {
    const d = await this.getDecision(decisionId);
    if (!d) throw new Error(`unknown decisionId: ${decisionId}`);
    if (!d.allowedForScreenDisplay) {
      this.failClosedAudienceAction(decisionId, "screen_display_not_allowed");
      return { decisionId, routed: false, reason: d.reasonCodes.join(",") || "blocked" };
    }
    neuralNewsroomBus.emit("audience.highlight_approved", { decisionId, platform: d.platform });
    neuralNewsroomBus.emit("audience.screen_highlight_created", { decisionId, platform: d.platform });
    return { decisionId, routed: true, reason: "safe" };
  }

  /** PUBLIC: route a safe question to the robot anchor (simulation only). */
  async routeSafeQuestionToRobot(decisionId: string): Promise<{
    decisionId: string;
    routed: boolean;
    reason: string;
  }> {
    const d = await this.getDecision(decisionId);
    if (!d) throw new Error(`unknown decisionId: ${decisionId}`);
    if (!d.allowedForRobotSpeech) {
      this.failClosedAudienceAction(decisionId, "robot_speech_not_allowed");
      return { decisionId, routed: false, reason: d.reasonCodes.join(",") || "blocked" };
    }
    neuralNewsroomBus.emit("audience.robot_response_created", { decisionId, platform: d.platform });
    return { decisionId, routed: true, reason: "safe" };
  }

  /** PUBLIC: build a moderation command. NEVER calls the platform. */
  async buildAudienceModerationCommand(input: {
    decisionId: string;
    requestedAction: RequestedModerationAction;
    requestedBy: ModerationRequestedBy;
    commandMode?: CommandMode;
  }): Promise<AudienceModerationCommand> {
    const d = await this.getDecision(input.decisionId);
    if (!d) throw new Error(`unknown decisionId: ${input.decisionId}`);
    const m = await this.getMessage(d.messageId);
    if (!m) throw new Error(`message gone for decision ${d.decisionId}`);
    const connector = await this.getConnector(m.connectorId);
    const perm = await this.validatePlatformPermission(m.connectorId, input.requestedAction);
    const requiresHumanApproval = input.requestedBy !== "root_admin"
      && (input.requestedAction === "ban_user" || input.requestedAction === "delete_comment");
    // Task #374: the caller may opt into `future_platform_gateway` (the gated
    // real-send path) or `assisted_operator`. The default remains
    // `simulation_only` for backwards compatibility. Either way, the command
    // record itself still carries `platformSendAllowed:false` — the
    // separate `audience-platform-gateway-service` is the only thing that
    // may flip a real send, and only after re-validating this command +
    // the connector's `platformSendApproved` opt-in.
    const commandMode: CommandMode = input.commandMode ?? "simulation_only";

    let commandAllowed = perm.allowed;
    let blockerReason: string | null = perm.reason;
    if (commandAllowed) {
      if (input.requestedAction !== "no_action" && !d.allowedForModerationAction) {
        commandAllowed = false;
        blockerReason = "decision_not_action_eligible";
      } else if (d.approvalStatus !== "draft") {
        commandAllowed = false;
        blockerReason = `decision_state_${d.approvalStatus}`;
      } else if (
        connector?.rateLimitStatus
        && connector.rateLimitStatus.remaining <= 0
        && input.requestedAction !== "no_action"
      ) {
        commandAllowed = false;
        blockerReason = "rate_limit_exhausted";
      }
    }

    const commandId = newId("aud_cmd");
    await db.insert(audienceModerationCommands).values({
      commandId,
      decisionId: d.decisionId,
      platform: m.platform,
      connectorId: m.connectorId,
      externalMessageId: m.externalMessageId,
      requestedAction: input.requestedAction,
      requestedBy: input.requestedBy,
      commandMode,
      commandAllowed,
      blockerReason,
      requiresHumanApproval,
      approvalStatus: "draft",
      visibility: "admin_only_internal",
      realSendAllowed: false,
      executionEnabled: false,
      platformSendAllowed: false,
      decisionFingerprint: computeDecisionFingerprint(d),
      safetyEnvelope: { ...AUDIENCE_SAFETY_ENVELOPE_LOCKED },
    });
    return (await this.getCommand(commandId))!;
  }

  /** Public re-export of the fingerprint helper for the gateway (Task #374). */
  fingerprintDecision(d: AudienceSafetyDecision): string {
    return computeDecisionFingerprint(d);
  }

  /** PUBLIC: simulate (never send) a moderation command. */
  async simulateAudienceModerationCommand(commandId: string): Promise<{
    commandId: string;
    simulated: true;
    platformSendAllowed: false;
    realSendAllowed: false;
    summary: string;
  }> {
    const cmd = await this.getCommand(commandId);
    if (!cmd) throw new Error(`unknown commandId: ${commandId}`);
    neuralNewsroomBus.emit("audience.moderation_simulated", {
      commandId,
      platform: cmd.platform,
      requestedAction: cmd.requestedAction,
      commandAllowed: cmd.commandAllowed,
    });
    return {
      commandId,
      simulated: true,
      platformSendAllowed: false,
      realSendAllowed: false,
      summary: cmd.commandAllowed
        ? `would ${cmd.requestedAction} on ${cmd.platform} (blocked by simulation envelope)`
        : `cannot ${cmd.requestedAction} on ${cmd.platform}: ${cmd.blockerReason ?? "unknown"}`,
    };
  }

  /** PUBLIC: fail-closed — log a refusal, keep nothing routed. */
  failClosedAudienceAction(decisionId: string, reason: string): void {
    neuralNewsroomBus.emit("fallback.triggered", {
      source: "omni_channel_audience_safety",
      decisionId,
      reason,
    });
  }
}

export const omniChannelAudienceSafetyService = new OmniChannelAudienceSafetyService();
