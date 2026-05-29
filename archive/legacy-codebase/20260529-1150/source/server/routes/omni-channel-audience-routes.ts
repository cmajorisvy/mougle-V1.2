/**
 * Omni-Channel Audience Safety Layer — admin routes (Task #371 + #373).
 *
 * All routes require root admin (CSRF is enforced globally for /api/*).
 * Every moderation route is simulation_only — no platform API is touched
 * in this phase. `platformSendAllowed:false` is the default for every
 * command record returned. As of Task #373 the service is DB-backed, so
 * every handler awaits its calls.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  AudienceMessageIngestSchema,
  AudiencePlatformSchema,
  type AudiencePlatform,
  RequestedModerationActionSchema,
  ModerationRequestedBySchema,
  CommandModeSchema,
  StoryContextSchema,
  AudiencePermissionsSchema,
  ApiAccessModeSchema,
  ConnectionStatusSchema,
  SupportedLexiconLocaleSchema,
} from "../../shared/omni-channel-audience-schema";
import { omniChannelAudienceSafetyService } from "../services/omni-channel-audience-safety-service";
import {
  getArchiveStats,
  getArchiveTrashStats,
  getAudienceRestoreLog,
  getEffectiveArchiveRetentionPolicy,
  getEffectiveArchiveRetentionPolicyWithSource,
  getRetentionStats,
  listArchiveDeletions,
  countAudienceArchiveRows,
  listAudienceArchiveFiles,
  openAudienceArchiveStream,
  previewAudienceArchive,
  streamAudienceArchiveSearchMatchesCsv,
  restoreFromArchive,
  restoreFromTrashDeletion,
  runArchiveCleanup,
  runArchiveTrashPurge,
  listArchiveTrashPurges,
  runRetentionSweep,
  setArchiveRetentionPolicy,
  setRetentionMode,
  setRetentionOverride,
  getEffectiveRestoreLogRetentionDays,
  setRestoreLogRetentionOverride,
} from "../services/audience-retention-service";
import {
  getGatewayEventConnectorBackfillStatus,
  getGatewayEventConnectorCurrentNullCount,
  runGatewayEventConnectorBackfill,
  runGatewayEventConnectorBackfillDryRun,
} from "../services/audience-gateway-event-connector-backfill-service";
import {
  getGatewayEventConnectorBackfillAlertSnooze,
  listGatewayEventConnectorBackfillAlertSnoozeHistory,
  setGatewayEventConnectorBackfillAlertSnooze,
} from "../services/audience-gateway-event-connector-backfill-failure-alert-service";
import {
  audienceRetentionStaleRowsAlertService,
  getEffectiveStaleRowsThresholds,
  getStaleRowsThresholdHistory,
  getAllStaleRowsThresholdHistory,
  isStaleRowsNotifyOnWeakeningEnabled,
  setStaleRowsNotifyOnWeakeningEnabled,
  setStaleRowsThresholdOverride,
  type StaleRowsThresholdOverride,
} from "../services/audience-retention-stale-rows-alert-service";
import {
  getEffectiveRestoreLogRateThreshold,
  getRestoreLogDailyActivity,
  MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS,
  DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS,
  getRestoreLogRateStats,
  getRestoreLogRateThresholdHistory,
  getRestoreLogRateWeakeningNotificationHistory,
  isRestoreLogRateNotifyOnWeakeningEnabled,
  setRestoreLogRateNotifyOnWeakeningEnabled,
  setRestoreLogRateThresholdOverride,
} from "../services/audience-restore-log-rate-alert-service";
import { audienceAuditEmailScheduler } from "../services/audience-audit-email-scheduler";
import { audienceAuditHistoryEmailScheduler } from "../services/audience-audit-history-email-scheduler";
import {
  deleteAudienceAuditHistoryEmailFilterPreset,
  listAudienceAuditHistoryEmailFilterPresets,
  saveAudienceAuditHistoryEmailFilterPreset,
  updateAudienceAuditHistoryEmailFilterPreset,
} from "../services/audience-audit-history-email-filter-presets-service";
import {
  audienceAuditHistoryEmailFailureAlertService,
  getEffectiveFailureThreshold as getEffectiveHistoryEmailFailureThreshold,
  setFailureThresholdOverride as setHistoryEmailFailureThresholdOverride,
} from "../services/audience-audit-history-email-failure-alert-service";
import { audienceAuditEmailFailureAlertService } from "../services/audience-audit-email-failure-alert-service";
import {
  audienceAuditHistoryEmailStaleAlertService,
  getAudienceAuditHistoryEmailStaleSnooze,
  setAudienceAuditHistoryEmailStaleSnooze,
  listAudienceAuditHistoryEmailStaleSnoozeLog,
  STALE_SNOOZE_MAX_MS,
  STALE_SNOOZE_MAX_DAYS,
} from "../services/audience-audit-history-email-stale-alert-service";
import {
  getAudienceAuditExportNotifierConfig,
  setAudienceAuditExportNotifierConfig,
  getAuditExportNotificationHistory,
  isAuditExportNotifyOnWeakeningEnabled,
  setAuditExportNotifyOnWeakeningEnabled,
  sendTestAuditExportNotification,
  listAuditExportNotifierConfigHistory,
} from "../services/audience-audit-export-notifier";
import {
  getAudienceAuditExportWarnThreshold,
  setAudienceAuditExportWarnThreshold,
  DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD,
} from "../services/audience-audit-export-warn-threshold-service";
import {
  getAudienceAuditRowCap,
  getAudienceAuditRowCaps,
  setAudienceAuditRowCap,
  DEFAULT_AUDIENCE_AUDIT_ROW_CAP,
  MIN_AUDIENCE_AUDIT_ROW_CAP,
  MAX_AUDIENCE_AUDIT_ROW_CAP,
} from "../services/audience-audit-export-row-cap-service";
import {
  getAudienceConnectorRotationNotifierConfig,
  setAudienceConnectorRotationNotifierConfig,
  getConnectorRotationNotificationHistory,
  sendTestConnectorRotationNotification,
} from "../services/audience-connector-rotation-notifier";
import {
  getAudienceLegacyTokenDispatchAlertConfig,
  setAudienceLegacyTokenDispatchAlertConfig,
  getLegacyTokenDispatchAlertHistory,
} from "../services/audience-legacy-token-dispatch-alert-service";
import {
  ALL_RISK_SIGNALS,
  DEFAULT_AUDIENCE_RISK_SIGNAL_RULES,
  MAX_WIDE_DATE_WINDOW_DAYS,
  MIN_WIDE_DATE_WINDOW_DAYS,
  getAudienceRiskSignalRules,
  partitionRiskSignalsForEmail,
  setAudienceRiskSignalRules,
} from "../services/audience-risk-signal-rules-service";
import { emailService } from "../services/email-service";
import { AudienceAuditExportRiskSignalSchema } from "../../shared/omni-channel-audience-schema";
import {
  getAudienceArchiveDeletionNotifierConfig,
  isArchiveDeletionNotifyOnWeakeningEnabled,
  setArchiveDeletionNotifyOnWeakeningEnabled,
  setAudienceArchiveDeletionNotifierConfig,
  setAudienceArchiveDeletionNotifierSnooze,
  getAudienceArchiveDeletionNotifierHistory,
  runUpcomingExpiryDigest,
  sendTestArchiveDeletionEmail,
  sendTestArchiveExpiryDigestEmail,
  listAudienceArchiveDeletionSnoozeLog,
  resendLastSnoozeRecap,
} from "../services/audience-archive-deletion-notifier";
import {
  getAudienceArchiveTrashBinNotifierConfig,
  setAudienceArchiveTrashBinNotifierConfig,
  setAudienceArchiveTrashBinNotifierSnooze,
  getAudienceArchiveTrashBinNotifierHistory,
  runTrashBinAlert,
  sendTestTrashBinAlertEmail,
} from "../services/audience-archive-trash-bin-notifier";
import {
  getAudienceAuditExportOutlierConfig,
  setAudienceAuditExportOutlierConfig,
  DEFAULT_AUDIENCE_AUDIT_EXPORT_OUTLIER_CONFIG,
} from "../services/omni-channel-audience-safety-service";
import {
  buildAudienceAuditCsv,
  buildAudienceAuditExportLogCsv,
  buildAudienceConnectorSecretRotationsCsv,
  buildAudienceGatewayEventsCsv,
} from "../services/audience-audit-csv";
export {
  buildAudienceAuditCsv,
  buildAudienceAuditExportLogCsv,
  buildAudienceConnectorSecretRotationsCsv,
  buildAudienceGatewayEventsCsv,
} from "../services/audience-audit-csv";
import { AudienceAuditCadenceSchema } from "../../shared/omni-channel-audience-schema";
import {
  audiencePlatformGatewayService,
  setEnvFallbackDisabledOverride,
  setEnvFallbackDisabledOverridesBulk,
} from "../services/audience-platform-gateway-service";
import { gatewayBlockAlertService } from "../services/gateway-block-alert-service";
import { gatewayBlockAlertSettingsService } from "../services/gateway-block-alert-settings-service";
import {
  gatewayAlertSettingsAuditService,
  formatAuditValue,
  type GatewayAlertAuditEntryInput,
} from "../services/gateway-alert-settings-audit-service";
import { getAdminVerification } from "../middleware/admin-auth";
import { db } from "../db";
import { adminStaff } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { audienceConnectorSecretsService } from "../services/audience-connector-secrets-service";
import {
  countGatewayEventsWithoutConnector,
  listGatewayEvents,
} from "../services/audience-gateway-event-log-service";
import { getAudienceOrphanedAttributionSummary } from "../services/audience-orphaned-attribution-service";
import { legacyTokenKillSwitchAuditService } from "../services/audience-legacy-token-kill-switch-audit-service";
import {
  getAudienceLegacyTokenKillSwitchNotifierConfig,
  setAudienceLegacyTokenKillSwitchNotifierConfig,
  getLegacyTokenKillSwitchNotificationHistory,
  sendTestLegacyTokenKillSwitchNotification,
} from "../services/audience-legacy-token-kill-switch-notifier";

// Task #576: hard cap on rows returned by the connector-secret-rotations
// CSV/JSON export. Mirrored in
// `client/src/pages/admin/OmniChannelAudience.tsx` so the admin UI can
// preflight the filtered total and warn before a silently-truncated
// download. Kept aligned with the long-standing default in
// `audienceConnectorSecretsService.listAllRotations`.
const ROTATIONS_CSV_ROW_CAP = 10_000;

// Task #492: hard cap on rows returned by the gateway-events CSV export.
// Picked deliberately high enough to cover normal incident-review use
// cases (last several months of traffic) while still bounding the
// response size and DB scan; the route streams in 500-row pages and
// stops at this cap, surfacing `truncated:true` in the CSV meta row.
const GATEWAY_EVENTS_CSV_ROW_CAP = 100_000;

// Task #632 / Task #703 — hard caps on the three audience admin
// downloads. Task #703 moved these from compile-time constants to
// founder-configurable values in `system_settings` (keys
// `audience_audit_trail_row_cap` /
// `audience_audit_export_history_row_cap`), so a founder can raise the
// cap for a one-off subpoena dump or lower it during an incident
// without shipping code. The default is still 100,000 per section.
// `DEFAULT_AUDIENCE_AUDIT_ROW_CAP` is kept here only as the
// last-resort fallback if the system_settings read fails — runtime
// uses `getAudienceAuditRowCap("trail" | "history")` on every request.
// Mirrored on the client by
// `client/src/pages/admin/omni-channel-audience/{AuditExportCard,ExportLogCard}.tsx`
// which now fetch the live cap from
// `/api/admin/newsroom/audience/export/row-cap` before showing the
// preflight hint / `confirm()` so the UI's "filtered total vs cap"
// math agrees with the route on the truncation boundary.

async function resolveAdminEmail(req: any): Promise<string | null> {
  const actorType = req.session?.adminActorType;
  const actorId = req.session?.adminActorId;
  if (actorType === "staff" && actorId) {
    const [row] = await db
      .select({ email: adminStaff.email })
      .from(adminStaff)
      .where(eq(adminStaff.id, String(actorId)))
      .limit(1);
    return row?.email ?? null;
  }
  // root_admin (env-root-admin): prefer FOUNDER_EMAIL, fall back to
  // ADMIN_USERNAME if it looks like an email address.
  const founder = process.env.FOUNDER_EMAIL?.trim();
  if (founder && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(founder)) return founder.toLowerCase();
  const username = process.env.ADMIN_USERNAME?.trim();
  if (username && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) return username.toLowerCase();
  return null;
}

const RetentionModeValueSchema = z.enum(["delete", "archive"]);
const RetentionModeBodySchema = z
  .object({
    mode: z
      .object({
        messages: RetentionModeValueSchema.optional(),
        decisions: RetentionModeValueSchema.optional(),
        commands: RetentionModeValueSchema.optional(),
      })
      .nullable(),
  });

const RegisterConnectorSchema = z.object({
  connectorId: z.string().min(1),
  platform: AudiencePlatformSchema,
  accountId: z.string().min(1),
  displayName: z.string().min(1),
  connectionStatus: ConnectionStatusSchema.optional(),
  apiAccessMode: ApiAccessModeSchema.optional(),
  permissions: AudiencePermissionsSchema.partial().optional(),
});

const ConnectorRotationNotifierUpsertSchema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string().email()).max(20),
  suppressedActions: z
    .array(z.enum(["set", "rotate", "delete"]))
    .max(3)
    .optional(),
  dedupWindowMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000)
    .nullable()
    .optional(),
});

const LegacyTokenDispatchAlertUpsertSchema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string().email()).max(20),
  dedupWindowMs: z
    .number()
    .int()
    .min(0)
    .max(7 * 24 * 60 * 60 * 1000)
    .nullable()
    .optional(),
});

const ExportNotifierUpsertSchema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string().email()).max(20),
  minRowCount: z.number().int().min(0).max(10_000_000).default(0),
  suppressedActorIds: z.array(z.string().min(1)).max(50).optional(),
  dedupWindowMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000)
    .nullable()
    .optional(),
});

const RiskSignalRulesUpsertSchema = z.object({
  wideDateWindowDays: z
    .number()
    .int()
    .min(MIN_WIDE_DATE_WINDOW_DAYS)
    .max(MAX_WIDE_DATE_WINDOW_DAYS),
  loudSignals: z.array(AudienceAuditExportRiskSignalSchema).max(20),
  mutedSignals: z.array(AudienceAuditExportRiskSignalSchema).max(20),
});

const RiskSignalRulesPreviewSchema = z.object({
  rules: RiskSignalRulesUpsertSchema,
  sampleSignals: z.array(AudienceAuditExportRiskSignalSchema).max(20),
});

const ArchiveDeletionNotifierUpsertSchema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string().email()).max(20),
  warningLeadDays: z.number().int().min(1).max(365).optional(),
  digestIntervalHours: z.number().int().min(1).max(24 * 30).optional(),
  postCleanupFileThreshold: z.number().int().min(0).max(1_000_000).optional(),
  postCleanupBytesThreshold: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});

const ArchiveTrashBinNotifierUpsertSchema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string().email()).max(20),
  alertIntervalHours: z.number().int().min(1).max(24 * 30).optional(),
});

// Task #428 — configurable rolling-outlier detection for audit exports.
const ExportOutlierUpsertSchema = z.object({
  enabled: z.boolean().optional(),
  windowSize: z.number().int().min(5).max(1000).optional(),
  medianMultiplier: z.number().min(2).max(1000).optional(),
  minSampleSize: z.number().int().min(2).max(1000).optional(),
  minTotalRowCount: z.number().int().min(0).max(1_000_000_000).optional(),
});

const EmailScheduleUpsertSchema = z.object({
  enabled: z.boolean(),
  cadence: AudienceAuditCadenceSchema,
  recipients: z.array(z.string().email()).max(20),
  platform: AudiencePlatformSchema.nullable().optional(),
  productionId: z.string().min(1).nullable().optional(),
});

// Task #432 — meta-audit "export history" email schedule. No platform /
// productionId filter applies here since the meta-audit log is global.
const HistoryEmailScheduleUpsertSchema = z.object({
  enabled: z.boolean(),
  cadence: AudienceAuditCadenceSchema,
  recipients: z.array(z.string().email()).max(20),
});

const UpdateFeatureFlagsSchema = z.object({
  multilingualLexicons: z.array(SupportedLexiconLocaleSchema).optional(),
  aiModerationSecondOpinion: z.boolean().optional(),
});

const BuildModerationSchema = z.object({
  requestedAction: RequestedModerationActionSchema,
  requestedBy: ModerationRequestedBySchema.default("ai_moderator"),
  commandMode: CommandModeSchema.optional(),
});

export function registerOmniChannelAudienceRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  registerOn(app, requireRootAdmin, "/api/admin/newsroom/audience");
  registerOn(app, requireRootAdmin, "/api/admin/omni-channel-audience");
}

function registerOn(app: Express, requireRootAdmin: RequestHandler, base: string): void {
  app.get(`${base}/connectors`, requireRootAdmin, async (_req, res) => {
    res.json({
      connectors: await omniChannelAudienceSafetyService.listConnectors(),
      platformSendAllowed: false,
      realSendAllowed: false,
    });
  });

  app.post(`${base}/connectors`, requireRootAdmin, async (req, res) => {
    const parsed = RegisterConnectorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    const connector = await omniChannelAudienceSafetyService.registerConnector({
      connectorId: parsed.data.connectorId,
      platform: parsed.data.platform,
      accountId: parsed.data.accountId,
      displayName: parsed.data.displayName,
      connectionStatus: parsed.data.connectionStatus,
      apiAccessMode: parsed.data.apiAccessMode,
      permissions: parsed.data.permissions,
    });
    res.json({ connector });
  });

  app.patch(`${base}/connectors/:connectorId/feature-flags`, requireRootAdmin, async (req, res) => {
    const parsed = UpdateFeatureFlagsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    try {
      const connector = await omniChannelAudienceSafetyService.updateConnectorFeatureFlags(
        String(req.params.connectorId),
        parsed.data,
      );
      res.json({ connector });
    } catch (e: any) {
      const msg = e?.message ?? "update_failed";
      const status = msg === "connector_not_found" ? 404 : 400;
      res.status(status).json({ message: msg });
    }
  });

  app.post(`${base}/story-context`, requireRootAdmin, (req, res) => {
    const parsed = StoryContextSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    omniChannelAudienceSafetyService.setStoryContext(parsed.data);
    res.json({ ok: true });
  });

  app.post(`${base}/:platform/ingest`, requireRootAdmin, async (req, res) => {
    const platformParse = AudiencePlatformSchema.safeParse(req.params.platform);
    if (!platformParse.success) return res.status(400).json({ message: "invalid platform" });
    const body = { ...req.body, platform: platformParse.data };
    const parsed = AudienceMessageIngestSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ message: "invalid message", errors: parsed.error.flatten() });
    try {
      const message = await omniChannelAudienceSafetyService.ingestAudienceMessage(parsed.data);
      res.json({ message });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "ingest_failed" });
    }
  });

  app.post(`${base}/message/:messageId/evaluate`, requireRootAdmin, async (req, res) => {
    try {
      const decision = await omniChannelAudienceSafetyService.evaluateAudienceSafety(String(req.params.messageId));
      res.json({ decision });
    } catch (e: any) {
      res.status(404).json({ message: e?.message ?? "not_found" });
    }
  });

  app.post(`${base}/message/:messageId/simulate-moderation`, requireRootAdmin, async (req, res) => {
    const parsed = BuildModerationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    try {
      const decision = await omniChannelAudienceSafetyService.evaluateAudienceSafety(String(req.params.messageId));
      const cmd = await omniChannelAudienceSafetyService.buildAudienceModerationCommand({
        decisionId: decision.decisionId,
        requestedAction: parsed.data.requestedAction,
        requestedBy: parsed.data.requestedBy,
        commandMode: parsed.data.commandMode,
      });
      const sim = await omniChannelAudienceSafetyService.simulateAudienceModerationCommand(cmd.commandId);
      res.json({ decision, command: cmd, simulation: sim });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "simulate_failed" });
    }
  });

  app.post(`${base}/message/:messageId/route-to-robot`, requireRootAdmin, async (req, res) => {
    try {
      const decision = await omniChannelAudienceSafetyService.evaluateAudienceSafety(String(req.params.messageId));
      const result = await omniChannelAudienceSafetyService.routeSafeQuestionToRobot(decision.decisionId);
      const reaction = await omniChannelAudienceSafetyService.buildRobotAudienceReaction(decision.decisionId);
      res.json({ decision, route: result, reaction });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "route_failed" });
    }
  });

  app.post(`${base}/message/:messageId/route-to-screen`, requireRootAdmin, async (req, res) => {
    try {
      const decision = await omniChannelAudienceSafetyService.evaluateAudienceSafety(String(req.params.messageId));
      const result = await omniChannelAudienceSafetyService.routeSafeHighlightToScreen(decision.decisionId);
      res.json({ decision, route: result });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "route_failed" });
    }
  });

  app.get(`${base}/export`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      platform: AudiencePlatformSchema.optional(),
      productionId: z.string().min(1).optional(),
      format: z.enum(["json", "csv"]).default("json"),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const { from, to, platform, productionId, format } = parsed.data;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ message: "from must be <= to" });
    }
    try {
      // Task #703 — load the founder-configurable per-section cap.
      const trailCapCfg = await getAudienceAuditRowCap("trail");
      const AUDIT_TRAIL_ROW_CAP = trailCapCfg.rowCap;
      const data = await omniChannelAudienceSafetyService.exportAuditTrail({
        fromDate,
        toDate,
        platform,
        productionId,
        // Task #632 — hard per-section cap. Service returns
        // `truncated:true` if any of messages/decisions/commands hit it.
        limit: AUDIT_TRAIL_ROW_CAP,
      });
      const admin = getAdminVerification(req);
      const auditLog = await omniChannelAudienceSafetyService.recordAuditExport({
        actorId: admin?.actor.id ?? "unknown",
        actorType: admin?.actor.type ?? "unknown",
        actorRole: admin?.role ?? null,
        format,
        // Task #632 — annotate the meta-audit productionId with the
        // truncation sentinel so reviewers can grep for capped exports
        // without parsing the CSV/JSON payload.
        filters: data.truncated
          ? {
              ...data.filters,
              productionId: `${data.filters.productionId ?? ""}:truncated@${AUDIT_TRAIL_ROW_CAP}`,
            }
          : data.filters,
        rowCounts: {
          connectors: data.connectors.length,
          messages: data.messages.length,
          decisions: data.decisions.length,
          commands: data.commands.length,
        },
      });
      const stamp = data.exportedAt.replace(/[:.]/g, "-");
      if (format === "csv") {
        const csv = buildAudienceAuditCsv({
          ...data,
          truncated: data.truncated,
          rowCap: AUDIT_TRAIL_ROW_CAP,
        });
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="audience-audit-trail-${stamp}.csv"`,
        );
        res.setHeader("X-Audit-Export", "audience-moderation");
        res.setHeader("X-Audit-Export-Id", auditLog.exportId);
        res.setHeader("X-Audit-Export-Truncated", data.truncated ? "true" : "false");
        res.setHeader("X-Audit-Export-Row-Cap", String(AUDIT_TRAIL_ROW_CAP));
        return res.send(csv);
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audience-audit-trail-${stamp}.json"`,
      );
      res.setHeader("X-Audit-Export", "audience-moderation");
      res.setHeader("X-Audit-Export-Id", auditLog.exportId);
      res.setHeader("X-Audit-Export-Truncated", data.truncated ? "true" : "false");
      res.setHeader("X-Audit-Export-Row-Cap", String(AUDIT_TRAIL_ROW_CAP));
      return res.json({
        ...data,
        truncated: data.truncated,
        rowCap: AUDIT_TRAIL_ROW_CAP,
        platformSendAllowed: false,
        realSendAllowed: false,
        exportLog: auditLog,
        notice:
          "Audience moderation audit trail. PII is redacted at ingestion (hashed authorIds, scrubbed metadata). This export was logged in the audit-export trail.",
      });
    } catch (e: any) {
      return res.status(500).json({ message: e?.message ?? "export_failed" });
    }
  });

  // Task #632 — lightweight preflight count for the audit-trail export.
  // The admin UI calls this before showing the Download buttons so a
  // founder can see "N messages, M decisions, ... will be pulled —
  // narrow filters first" and avoid a silently-truncated download.
  app.get(`${base}/export/count`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      platform: AudiencePlatformSchema.optional(),
      productionId: z.string().min(1).optional(),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const { from, to, platform, productionId } = parsed.data;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ message: "from must be <= to" });
    }
    try {
      // Task #703 — preflight uses the same founder-configurable cap
      // as the export route so the UI's "would be truncated" hint
      // always agrees with what the download will actually do.
      const trailCapCfg = await getAudienceAuditRowCap("trail");
      const AUDIT_TRAIL_ROW_CAP = trailCapCfg.rowCap;
      const counts = await omniChannelAudienceSafetyService.countAuditTrail({
        fromDate,
        toDate,
        platform,
        productionId,
      });
      return res.json({
        ...counts,
        rowCap: AUDIT_TRAIL_ROW_CAP,
        // `truncated` is what a real download with these filters WOULD
        // surface — true if any single section is above the per-section
        // cap. Lets the UI label the hint "would be truncated" before
        // anyone clicks Download.
        wouldTruncate:
          counts.messages > AUDIT_TRAIL_ROW_CAP ||
          counts.decisions > AUDIT_TRAIL_ROW_CAP ||
          counts.commands > AUDIT_TRAIL_ROW_CAP,
      });
    } catch (e: any) {
      return res
        .status(500)
        .json({ message: e?.message ?? "export_count_failed" });
    }
  });

  app.get(`${base}/email-schedule`, requireRootAdmin, async (_req, res) => {
    const schedule = await audienceAuditEmailScheduler.getSchedule();
    const runs = await audienceAuditEmailScheduler.listRuns(20);
    res.json({ schedule, runs, platformSendAllowed: false, realSendAllowed: false });
  });

  app.put(`${base}/email-schedule`, requireRootAdmin, async (req, res) => {
    const parsed = EmailScheduleUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    try {
      const schedule = await audienceAuditEmailScheduler.upsertSchedule(parsed.data);
      res.json({ schedule });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "save_failed" });
    }
  });

  app.post(`${base}/email-schedule/preview`, requireRootAdmin, async (_req, res) => {
    try {
      const preview = await audienceAuditEmailScheduler.previewNow();
      res.json({ preview, platformSendAllowed: false, realSendAllowed: false });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "preview_failed" });
    }
  });

  app.post(`${base}/email-schedule/preview/send-test`, requireRootAdmin, async (req, res) => {
    try {
      const adminEmail = await resolveAdminEmail(req);
      if (!adminEmail) {
        return res.status(400).json({
          message: "no admin email configured (set FOUNDER_EMAIL or use a staff account with an email)",
        });
      }
      const run = await audienceAuditEmailScheduler.sendTestNow(adminEmail);
      res.json({ run, recipient: adminEmail });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "test_send_failed" });
    }
  });

  app.get(
    `${base}/email-schedule/failure-alert`,
    requireRootAdmin,
    async (_req, res) => {
      const [alert, snooze] = await Promise.all([
        audienceAuditEmailFailureAlertService.getOpenAlert(),
        audienceAuditEmailFailureAlertService.getSnooze(),
      ]);
      res.json({ alert, snooze });
    },
  );

  // Task #560 — snooze the audit-trail failure alert for a planned
  // outage window without disabling the schedule. Capped at 90 days.
  // Task #613 — newest-first snooze history (set/cleared/expired) for the
  // audit-trail failure alert, surfaced in the admin card under the
  // snooze controls so compliance can prove who muted what when.
  app.get(
    `${base}/email-schedule/failure-alert/snooze-history`,
    requireRootAdmin,
    async (req, res) => {
      const limitRaw = Number(req.query.limit);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 10;
      const history =
        await audienceAuditEmailFailureAlertService.getSnoozeHistory(limit);
      res.json({ history });
    },
  );

  app.post(
    `${base}/email-schedule/failure-alert/snooze`,
    requireRootAdmin,
    async (req, res) => {
      const Schema = z.object({
        snoozeUntil: z.string().datetime().nullable(),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const snooze = await audienceAuditEmailFailureAlertService.setSnooze({
          snoozeUntil: parsed.data.snoozeUntil,
          updatedBy: String(updatedBy),
        });
        res.json({ snooze });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "snooze_failed" });
      }
    },
  );

  app.post(`${base}/email-schedule/run-now`, requireRootAdmin, async (_req, res) => {
    try {
      const run = await audienceAuditEmailScheduler.runNow("manual");
      res.json({ run });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "run_failed" });
    }
  });

  // ─── Task #432 — scheduled meta-audit export-history email ────────────
  app.get(`${base}/email-schedule-history`, requireRootAdmin, async (_req, res) => {
    const schedule = await audienceAuditHistoryEmailScheduler.getSchedule();
    const runs = await audienceAuditHistoryEmailScheduler.listRuns(20);
    res.json({ schedule, runs, platformSendAllowed: false, realSendAllowed: false });
  });

  app.put(`${base}/email-schedule-history`, requireRootAdmin, async (req, res) => {
    const parsed = HistoryEmailScheduleUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    try {
      const schedule = await audienceAuditHistoryEmailScheduler.upsertSchedule(parsed.data);
      res.json({ schedule });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "save_failed" });
    }
  });

  app.post(`${base}/email-schedule-history/preview`, requireRootAdmin, async (_req, res) => {
    try {
      const preview = await audienceAuditHistoryEmailScheduler.previewNow();
      res.json({ preview, platformSendAllowed: false, realSendAllowed: false });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "preview_failed" });
    }
  });

  app.post(
    `${base}/email-schedule-history/preview/send-test`,
    requireRootAdmin,
    async (req, res) => {
      try {
        const adminEmail = await resolveAdminEmail(req);
        if (!adminEmail) {
          return res.status(400).json({
            message:
              "no admin email configured (set FOUNDER_EMAIL or use a staff account with an email)",
          });
        }
        const run = await audienceAuditHistoryEmailScheduler.sendTestNow(adminEmail);
        res.json({ run, recipient: adminEmail });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "test_send_failed" });
      }
    },
  );

  app.get(
    `${base}/email-schedule-history/failure-alert`,
    requireRootAdmin,
    async (_req, res) => {
      const [alert, snooze] = await Promise.all([
        audienceAuditHistoryEmailFailureAlertService.getOpenAlert(),
        audienceAuditHistoryEmailFailureAlertService.getSnooze(),
      ]);
      res.json({ alert, snooze });
    },
  );

  // Task #560 — snooze the history failure alert for a planned outage
  // window without disabling the schedule. Capped at 90 days.
  // Task #613 — newest-first snooze history (set/cleared/expired) for the
  // history failure alert, surfaced in the admin card under the snooze
  // controls so compliance can prove who muted what when.
  app.get(
    `${base}/email-schedule-history/failure-alert/snooze-history`,
    requireRootAdmin,
    async (req, res) => {
      const limitRaw = Number(req.query.limit);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 10;
      const history =
        await audienceAuditHistoryEmailFailureAlertService.getSnoozeHistory(
          limit,
        );
      res.json({ history });
    },
  );

  app.post(
    `${base}/email-schedule-history/failure-alert/snooze`,
    requireRootAdmin,
    async (req, res) => {
      const Schema = z.object({
        snoozeUntil: z.string().datetime().nullable(),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const snooze =
          await audienceAuditHistoryEmailFailureAlertService.setSnooze({
            snoozeUntil: parsed.data.snoozeUntil,
            updatedBy: String(updatedBy),
          });
        res.json({ snooze });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "snooze_failed" });
      }
    },
  );

  // Task #521 — admin-tunable failure-alert threshold (1..5). Precedence:
  // admin override (system_settings) > env > default 2.
  app.get(
    `${base}/email-schedule-history/failure-threshold`,
    requireRootAdmin,
    async (_req, res) => {
      const config = await getEffectiveHistoryEmailFailureThreshold();
      res.json({ config });
    },
  );

  app.put(
    `${base}/email-schedule-history/failure-threshold`,
    requireRootAdmin,
    async (req, res) => {
      const schema = z.object({
        value: z.union([z.number().int().min(1).max(5), z.null()]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy = (req as any).user?.id
          ? String((req as any).user.id)
          : undefined;
        const config = await setHistoryEmailFailureThresholdOverride(
          parsed.data.value,
          updatedBy,
        );
        res.json({ config });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "save_failed" });
      }
    },
  );

  // Task #524 — surface the "scheduler has gone silent" alert.
  // Task #570 — also returns the founder snooze state so the admin UI
  // can render an "Unsnooze" button while a snooze window is active.
  app.get(
    `${base}/email-schedule-history/stale-alert`,
    requireRootAdmin,
    async (_req, res) => {
      // Task #637 — also surface per-recipient inbox silence so the
      // banner can name the specific dead mailbox.
      const [alert, evaluation, snooze, recipientAlerts, recipientEvaluation] =
        await Promise.all([
          audienceAuditHistoryEmailStaleAlertService.getOpenAlert(),
          audienceAuditHistoryEmailStaleAlertService.evaluate(),
          getAudienceAuditHistoryEmailStaleSnooze(),
          audienceAuditHistoryEmailStaleAlertService.getOpenRecipientAlerts(),
          audienceAuditHistoryEmailStaleAlertService.evaluateRecipients(),
        ]);
      res.json({
        alert,
        evaluation,
        snooze,
        recipientAlerts,
        recipientEvaluation,
        // Task #713 — surface the snooze cap so the admin UI can render
        // the limit inline and detect when a request was truncated.
        snoozeCap: {
          maxMs: STALE_SNOOZE_MAX_MS,
          maxDays: STALE_SNOOZE_MAX_DAYS,
        },
      });
    },
  );

  // Task #686 — durable history of every snooze window on the
  // scheduler-silent (staleness) alert. Newest-first, limit clamped
  // 1..50. Mirrors the archive-deletion notifier snooze-log route
  // (Task #562) so the admin UI can show "Past snooze windows".
  app.get(
    `${base}/email-schedule-history/stale-alert/snooze-log`,
    requireRootAdmin,
    async (req, res) => {
      const limitRaw = Number(req.query.limit);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 10;
      const entries =
        await listAudienceAuditHistoryEmailStaleSnoozeLog(limit);
      res.json({ entries });
    },
  );

  // Task #570 — snooze / unsnooze the staleness alert during planned
  // downtime. Pass `snoozeUntil: null` to unsnooze.
  app.post(
    `${base}/email-schedule-history/stale-alert/snooze`,
    requireRootAdmin,
    async (req, res) => {
      const policySchema = z.union([
        z.object({ kind: z.literal("fixed") }),
        z.object({
          kind: z.literal("auto_extend"),
          extendDays: z.number().int().min(1).max(30),
        }),
        z.object({
          kind: z.literal("weekday_mute"),
          days: z.array(z.number().int().min(0).max(6)).min(1),
          startHour: z.number().int().min(0).max(23),
          endHour: z.number().int().min(0).max(23),
        }),
      ]);
      const schema = z.object({
        snoozeUntil: z.string().datetime().nullable(),
        snoozePolicy: policySchema.nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy = (req as any).user?.id
          ? String((req as any).user.id)
          : undefined;
        const snooze = await setAudienceAuditHistoryEmailStaleSnooze({
          snoozeUntil: parsed.data.snoozeUntil,
          snoozePolicy: parsed.data.snoozePolicy ?? null,
          updatedBy,
        });
        res.json({ snooze });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "snooze_failed" });
      }
    },
  );

  // Task #692 — surface past stale-alert snooze windows so founders
  // can audit "what happened the last N times we silenced the
  // scheduler-silent alert?". Mirrors the archive-deletion notifier
  // snooze-log endpoint (Task #562).
  app.get(
    `${base}/email-schedule-history/stale-alert/snooze-log`,
    requireRootAdmin,
    async (req, res) => {
      const limitRaw = Number((req.query?.limit as string) ?? "10");
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;
      const entries = await listAudienceAuditHistoryEmailStaleSnoozeLog(limit);
      res.json({ entries });
    },
  );

  // Task #481 — aggregate compliance stats for the history-email panel.
  // Task #525 — also accept `from`, `to`, `recipient` so compliance can
  // scope the panel to a specific quarter and/or inbox under audit.
  app.get(`${base}/email-schedule-history/stats`, requireRootAdmin, async (req, res) => {
    const windowDaysRaw = Number((req.query?.windowDays as string) ?? "");
    const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw > 0 ? windowDaysRaw : 30;
    const includeTests = String(req.query?.includeTests ?? "") === "true";
    const from = typeof req.query?.from === "string" ? req.query.from : null;
    const to = typeof req.query?.to === "string" ? req.query.to : null;
    const recipient = typeof req.query?.recipient === "string" ? req.query.recipient : null;
    try {
      const stats = await audienceAuditHistoryEmailScheduler.getRunStats({
        windowDays,
        excludeTestRuns: !includeTests,
        from,
        to,
        recipient,
      });
      const byRecipient = await audienceAuditHistoryEmailScheduler.getRunStatsByRecipient({
        windowDays,
        excludeTestRuns: !includeTests,
        from,
        to,
        recipient,
      });
      const knownRecipients = await audienceAuditHistoryEmailScheduler.listKnownRecipients({
        excludeTestRuns: !includeTests,
      });
      res.json({ stats, byRecipient, knownRecipients });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "stats_failed" });
    }
  });

  // Task #574 — saved filter presets for the audit-export history panel.
  // Shared across all root admins (lives in `system_settings`) so a named
  // quarterly scope ("Q3 2025 — audit@example.com") can be reapplied in
  // one click during recurring SOC2 / ISO audit binders.
  app.get(
    `${base}/email-schedule-history/filter-presets`,
    requireRootAdmin,
    async (_req, res) => {
      try {
        const presets = await listAudienceAuditHistoryEmailFilterPresets();
        res.json({ presets });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "presets_failed" });
      }
    },
  );

  app.post(
    `${base}/email-schedule-history/filter-presets`,
    requireRootAdmin,
    async (req, res) => {
      const Schema = z.object({
        name: z.string().min(1).max(80),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
        recipient: z.string().nullable().optional(),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const createdBy =
          (req as any).user?.id ?? (req as any).session?.userId ?? null;
        const preset = await saveAudienceAuditHistoryEmailFilterPreset({
          name: parsed.data.name,
          from: parsed.data.from ?? null,
          to: parsed.data.to ?? null,
          recipient: parsed.data.recipient ?? null,
          createdBy: createdBy ? String(createdBy) : null,
        });
        const presets = await listAudienceAuditHistoryEmailFilterPresets();
        res.json({ preset, presets });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "save_failed" });
      }
    },
  );

  // Task #624 — edit/rename an existing preset in place (preserves id + createdAt).
  app.put(
    `${base}/email-schedule-history/filter-presets/:presetId`,
    requireRootAdmin,
    async (req, res) => {
      const Schema = z.object({
        name: z.string().min(1).max(80).optional(),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
        recipient: z.string().nullable().optional(),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy =
          (req as any).user?.id ?? (req as any).session?.userId ?? null;
        const preset = await updateAudienceAuditHistoryEmailFilterPreset(
          String(req.params.presetId),
          {
            ...parsed.data,
            updatedBy: updatedBy ? String(updatedBy) : null,
          },
        );
        const presets = await listAudienceAuditHistoryEmailFilterPresets();
        res.json({ preset, presets });
      } catch (e: any) {
        const msg = e?.message ?? "update_failed";
        const status = msg === "preset_not_found" ? 404 : 400;
        res.status(status).json({ message: msg });
      }
    },
  );

  app.delete(
    `${base}/email-schedule-history/filter-presets/:presetId`,
    requireRootAdmin,
    async (req, res) => {
      try {
        const updatedBy =
          (req as any).user?.id ?? (req as any).session?.userId ?? null;
        const result = await deleteAudienceAuditHistoryEmailFilterPreset(
          String(req.params.presetId),
          updatedBy ? String(updatedBy) : null,
        );
        if (!result.deleted) {
          return res.status(404).json({ message: "preset_not_found" });
        }
        const presets = await listAudienceAuditHistoryEmailFilterPresets();
        res.json({ deleted: true, presets });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "delete_failed" });
      }
    },
  );

  // Task #481 — CSV download of recent history-email runs (default 90d).
  app.get(
    `${base}/email-schedule-history/runs/export.csv`,
    requireRootAdmin,
    async (req, res) => {
      const windowDaysRaw = Number((req.query?.windowDays as string) ?? "");
      const windowDays =
        Number.isFinite(windowDaysRaw) && windowDaysRaw > 0 ? windowDaysRaw : 90;
      const from = typeof req.query?.from === "string" ? req.query.from : null;
      const to = typeof req.query?.to === "string" ? req.query.to : null;
      const recipient =
        typeof req.query?.recipient === "string" ? req.query.recipient : null;
      try {
        const runs = await audienceAuditHistoryEmailScheduler.listRecentRuns({
          windowDays,
          from,
          to,
          recipient,
        });
        const exportedAt = new Date().toISOString();
        const csvEscape = (v: unknown) => {
          if (v === null || v === undefined) return "";
          const s = typeof v === "string" ? v : String(v);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const headers = [
          "runId",
          "scheduleId",
          "cadence",
          "triggeredBy",
          "isTest",
          "status",
          "errorMessage",
          "startedAt",
          "completedAt",
          "windowFrom",
          "windowTo",
          "historyRowCount",
          "recipientCount",
          "recipients",
        ];
        const lines: string[] = [];
        lines.push(
          `# audience_audit_history_email_runs windowDays=${windowDays} from=${from ?? ""} to=${to ?? ""} recipient=${recipient ?? ""} exportedAt=${exportedAt} totalRuns=${runs.length}`,
        );
        lines.push(headers.join(","));
        for (const r of runs) {
          lines.push(
            headers
              .map((h) => {
                switch (h) {
                  case "historyRowCount":
                    return csvEscape(r.messageCount);
                  case "recipientCount":
                    return csvEscape(r.recipients.length);
                  case "recipients":
                    return csvEscape(r.recipients.join("; "));
                  default:
                    return csvEscape((r as any)[h]);
                }
              })
              .join(","),
          );
        }
        const csv = lines.join("\r\n") + "\r\n";
        const stamp = exportedAt.replace(/[:.]/g, "-");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="audience-audit-history-email-runs-${stamp}.csv"`,
        );
        res.send(csv);
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "runs_export_failed" });
      }
    },
  );

  // Task #636 — CSV download of the per-recipient breakdown so compliance
  // binders can paste a one-row-per-inbox roll-up into quarterly reviews.
  app.get(
    `${base}/email-schedule-history/recipient-breakdown/export.csv`,
    requireRootAdmin,
    async (req, res) => {
      const windowDaysRaw = Number((req.query?.windowDays as string) ?? "");
      const windowDays =
        Number.isFinite(windowDaysRaw) && windowDaysRaw > 0 ? windowDaysRaw : 30;
      const includeTests = String(req.query?.includeTests ?? "") === "true";
      const from = typeof req.query?.from === "string" ? req.query.from : null;
      const to = typeof req.query?.to === "string" ? req.query.to : null;
      const recipient =
        typeof req.query?.recipient === "string" ? req.query.recipient : null;
      try {
        const rows = await audienceAuditHistoryEmailScheduler.getRunStatsByRecipient({
          windowDays,
          excludeTestRuns: !includeTests,
          from,
          to,
          recipient,
        });
        const exportedAt = new Date().toISOString();
        const csvEscape = (v: unknown) => {
          if (v === null || v === undefined) return "";
          const s = typeof v === "string" ? v : String(v);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const headers = [
          "recipient",
          "totalSends",
          "successCount",
          "failureCount",
          "successRate",
          "lastSuccessfulRunAt",
        ];
        const lines: string[] = [];
        lines.push(
          `# audience_audit_history_email_recipient_breakdown windowDays=${windowDays} from=${from ?? ""} to=${to ?? ""} recipient=${recipient ?? ""} includeTests=${includeTests} exportedAt=${exportedAt} totalRecipients=${rows.length}`,
        );
        lines.push(headers.join(","));
        for (const r of rows) {
          lines.push(
            [
              csvEscape(r.recipient),
              csvEscape(r.totalSends),
              csvEscape(r.successCount),
              csvEscape(r.failureCount),
              csvEscape(r.successRate),
              csvEscape(r.lastSuccessfulRunAt ?? ""),
            ].join(","),
          );
        }
        const csv = lines.join("\r\n") + "\r\n";
        const stamp = exportedAt.replace(/[:.]/g, "-");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="audience-audit-history-email-recipient-breakdown-${stamp}.csv"`,
        );
        res.send(csv);
      } catch (e: any) {
        res
          .status(400)
          .json({ message: e?.message ?? "recipient_breakdown_export_failed" });
      }
    },
  );

  app.post(`${base}/email-schedule-history/run-now`, requireRootAdmin, async (_req, res) => {
    try {
      const run = await audienceAuditHistoryEmailScheduler.runNow("manual");
      res.json({ run });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "run_failed" });
    }
  });

  app.post(`${base}/connectors/:connectorId/platform-send-approval`, requireRootAdmin, async (req, res) => {
    const schema = z.object({ approved: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    // Source the approver identity exclusively from the authenticated
    // root-admin session — never from the request body — so the audit
    // field cannot be spoofed.
    const adminId = (req as any).user?.id ?? null;
    if (!adminId) return res.status(401).json({ message: "missing_root_admin_identity" });
    try {
      const connector = await omniChannelAudienceSafetyService.approvePlatformSend(
        String(req.params.connectorId),
        parsed.data.approved,
        adminId,
      );
      res.json({ connector });
    } catch (e: any) {
      res.status(404).json({ message: e?.message ?? "not_found" });
    }
  });

  app.get(`${base}/connectors/:connectorId/secret`, requireRootAdmin, async (req, res) => {
    const connectorId = String(req.params.connectorId);
    const [meta, rotations] = await Promise.all([
      audienceConnectorSecretsService.getMetadata(connectorId),
      audienceConnectorSecretsService.listRotations(connectorId, 20),
    ]);
    res.json({
      secret: meta,
      rotations,
      secretsKeyConfigured: audienceConnectorSecretsService.isConfigured(),
    });
  });

  app.get(
    `${base}/connectors/:connectorId/secret/rotations`,
    requireRootAdmin,
    async (req, res) => {
      const limitParse = z
        .coerce.number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .safeParse(req.query.limit);
      if (!limitParse.success) {
        return res.status(400).json({ message: "invalid limit" });
      }
      const rotations = await audienceConnectorSecretsService.listRotations(
        String(req.params.connectorId),
        limitParse.data ?? 50,
      );
      res.json({ rotations });
    },
  );

  // Task #576 — lightweight count endpoint so the admin UI can show a
  // "filtered total vs CSV cap" warning next to the connector-token
  // rotation Download CSV button without pulling the full slice.
  // Accepts the same filters as the export route.
  app.get(`${base}/secret-rotations/count`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      platform: AudiencePlatformSchema.optional(),
      connectorId: z.string().min(1).optional(),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const { from, to, platform, connectorId } = parsed.data;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ message: "from must be <= to" });
    }
    try {
      const count = await audienceConnectorSecretsService.countAllRotations({
        fromDate,
        toDate,
        platform,
        connectorId,
      });
      return res.json({ count, rowCap: ROTATIONS_CSV_ROW_CAP });
    } catch (e: any) {
      return res
        .status(500)
        .json({ message: e?.message ?? "rotations_count_failed" });
    }
  });

  // Task #497 — full cross-connector rotation export (CSV or JSON) for
  // incident review / quarterly key-hygiene reports. Audited via
  // recordAuditExport so the download itself lands in the audit-export
  // history. NEVER includes ciphertext / IV / auth-tag.
  app.get(`${base}/secret-rotations/export`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      platform: AudiencePlatformSchema.optional(),
      connectorId: z.string().min(1).optional(),
      format: z.enum(["json", "csv"]).default("json"),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const { from, to, platform, connectorId, format } = parsed.data;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ message: "from must be <= to" });
    }
    try {
      const rotations = await audienceConnectorSecretsService.listAllRotations({
        fromDate,
        toDate,
        platform,
        connectorId,
        // Task #576: pin the route to the documented cap so the UI's
        // preflight warning and the actual download agree on the
        // truncation boundary even if the service-level default ever
        // drifts.
        limit: ROTATIONS_CSV_ROW_CAP,
      });
      const exportedAt = new Date().toISOString();
      const filters = {
        fromDate: fromDate ? fromDate.toISOString() : null,
        toDate: toDate ? toDate.toISOString() : null,
        platform: platform ?? null,
        connectorId: connectorId ?? null,
      };
      let auditExportId: string | null = null;
      try {
        const admin = getAdminVerification(req);
        const auditLog = await omniChannelAudienceSafetyService.recordAuditExport({
          actorId: admin?.actor.id ?? "unknown",
          actorType: admin?.actor.type ?? "unknown",
          actorRole: admin?.role ?? null,
          format,
          filters: {
            fromDate: filters.fromDate,
            toDate: filters.toDate,
            platform: platform ?? null,
            productionId: `secret-rotations${connectorId ? `:connector=${connectorId}` : ""}`,
          },
          rowCounts: {
            connectors: 0,
            messages: 0,
            decisions: 0,
            commands: rotations.length,
          },
        });
        auditExportId = auditLog.exportId;
      } catch (err) {
        console.error("[audience-secret-rotations-export] audit log failed:", err);
      }
      const stamp = exportedAt.replace(/[:.]/g, "-");
      if (format === "csv") {
        const csv = buildAudienceConnectorSecretRotationsCsv({
          rotations,
          filters,
          exportedAt,
        });
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="audience-connector-secret-rotations-${stamp}.csv"`,
        );
        res.setHeader("X-Audit-Export", "audience-connector-secret-rotations");
        if (auditExportId) res.setHeader("X-Audit-Export-Id", auditExportId);
        return res.send(csv);
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audience-connector-secret-rotations-${stamp}.json"`,
      );
      res.setHeader("X-Audit-Export", "audience-connector-secret-rotations");
      if (auditExportId) res.setHeader("X-Audit-Export-Id", auditExportId);
      return res.json({
        rotations,
        filters,
        exportedAt,
        totalRotations: rotations.length,
        platformSendAllowed: false,
        realSendAllowed: false,
        auditExportId,
        notice:
          "Connector token rotation audit log. Metadata only — ciphertext, IV, and auth-tag are never included. This export was logged in the audit-export trail.",
      });
    } catch (e: any) {
      return res.status(500).json({ message: e?.message ?? "export_failed" });
    }
  });

  app.put(`${base}/connectors/:connectorId/secret`, requireRootAdmin, async (req, res) => {
    const schema = z.object({
      token: z.string().min(1),
      platform: AudiencePlatformSchema,
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    const adminId = (req as any).user?.id ?? null;
    if (!adminId) return res.status(401).json({ message: "missing_root_admin_identity" });
    if (!audienceConnectorSecretsService.isConfigured()) {
      return res.status(503).json({ message: "secrets_key_not_configured" });
    }
    const connectorId = String(req.params.connectorId);
    try {
      // If a secret already exists this is a rotation (compromise-response
      // or routine hygiene); use rotateToken to document the intent at the
      // call site. The first install goes through setToken.
      const existing = await audienceConnectorSecretsService.getMetadata(connectorId);
      const input = {
        connectorId,
        platform: parsed.data.platform,
        token: parsed.data.token,
        rotatedBy: adminId,
      };
      const meta = existing
        ? await audienceConnectorSecretsService.rotateToken(input)
        : await audienceConnectorSecretsService.setToken(input);
      // The PUT response must never echo back the plaintext token.
      res.json({ secret: meta, rotated: meta.rotationCount > 1 });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "set_token_failed" });
    }
  });

  app.delete(`${base}/connectors/:connectorId/secret`, requireRootAdmin, async (req, res) => {
    const adminId = (req as any).user?.id ?? null;
    const deleted = await audienceConnectorSecretsService.deleteToken(
      String(req.params.connectorId),
      { deletedBy: adminId },
    );
    res.json({ deleted });
  });

  // Task #462 — per-connector legacy-token visibility. Returns, for every
  // registered connector, whether it has a per-connector encrypted secret
  // installed, is still relying on the shared `AUDIENCE_GATEWAY_<P>_TOKEN`
  // env fallback, or has no token at all. Also surfaces the per-platform
  // env-fallback disable flag and the list of connectors that would
  // start failing `platform_token_missing` if that flag were flipped on
  // right now. NEVER returns token material.
  app.get(`${base}/legacy-token-status`, requireRootAdmin, async (_req, res) => {
    const status = await audiencePlatformGatewayService.getLegacyTokenStatus();
    res.json(status);
  });

  // Task #559 — bulk apply per-platform legacy-token kill-switch overrides
  // in a single atomic write. Body:
  //   `{ overrides: Array<{ platform, disabled: boolean | null }> }`.
  // Use this for "Clear all overrides" or "Disable env-fallback everywhere"
  // bulk actions from the admin UI. A single invalid platform aborts the
  // whole batch — there are no partial writes.
  app.put(
    `${base}/legacy-token-status/env-fallback-disabled-bulk`,
    requireRootAdmin,
    async (req, res) => {
      const bodyParse = z
        .object({
          overrides: z
            .array(
              z.object({
                platform: AudiencePlatformSchema,
                disabled: z.boolean().nullable(),
              }),
            )
            .min(1),
        })
        .safeParse(req.body);
      if (!bodyParse.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: bodyParse.error.flatten() });
      }
      try {
        const adminId =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        await setEnvFallbackDisabledOverridesBulk(
          bodyParse.data.overrides,
          adminId,
        );
        const status = await audiencePlatformGatewayService.getLegacyTokenStatus();
        res.json(status);
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "save_failed" });
      }
    },
  );

  // Task #501 — DB-backed admin override for the per-platform legacy-token
  // kill-switch. Body: `{ disabled: boolean | null }`. `null` clears the
  // override for that platform and restores the env/default behavior.
  app.put(
    `${base}/legacy-token-status/:platform/env-fallback-disabled`,
    requireRootAdmin,
    async (req, res) => {
      const platformParse = AudiencePlatformSchema.safeParse(req.params.platform);
      if (!platformParse.success) {
        return res.status(400).json({ message: "unknown_platform" });
      }
      const bodyParse = z
        .object({ disabled: z.boolean().nullable() })
        .safeParse(req.body);
      if (!bodyParse.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: bodyParse.error.flatten() });
      }
      try {
        const adminId =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        await setEnvFallbackDisabledOverride(
          platformParse.data,
          bodyParse.data.disabled,
          adminId,
        );
        const status = await audiencePlatformGatewayService.getLegacyTokenStatus();
        res.json(status);
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "save_failed" });
      }
    },
  );

  // Task #558 — admin-visible audit history for every per-platform
  // legacy-token kill-switch flip. Query: `?platform=<p>&limit=<N>`
  // (both optional). Returns rows newest-first. NEVER returns token
  // material.
  app.get(
    `${base}/legacy-token-status/history`,
    requireRootAdmin,
    async (req, res) => {
      const platformRaw =
        typeof req.query.platform === "string" ? req.query.platform : null;
      const limitRaw =
        typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
      let platform: AudiencePlatform | null = null;
      if (platformRaw) {
        const parsed = AudiencePlatformSchema.safeParse(platformRaw);
        if (!parsed.success) {
          return res.status(400).json({ message: "unknown_platform" });
        }
        platform = parsed.data;
      }
      const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
      const rows = await legacyTokenKillSwitchAuditService.list({
        platform,
        limit,
      });
      res.json({
        entries: rows.map((r) => ({
          id: r.id,
          platform: r.platform,
          previousValue: r.previousValue,
          newValue: r.newValue,
          updatedBy: r.updatedBy,
          batchId: r.batchId ?? null,
          updatedAt:
            r.updatedAt instanceof Date
              ? r.updatedAt.toISOString()
              : String(r.updatedAt),
        })),
      });
    },
  );

  // Task #608 — legacy-token kill-switch notifier (real-time founder email
  // every time a root admin flips the per-platform env-fallback kill-switch).
  app.get(
    `${base}/legacy-token-kill-switch-notifier`,
    requireRootAdmin,
    async (_req, res) => {
      const config = await getAudienceLegacyTokenKillSwitchNotifierConfig();
      res.json({ config });
    },
  );

  app.put(
    `${base}/legacy-token-kill-switch-notifier`,
    requireRootAdmin,
    async (req, res) => {
      const parsed = z
        .object({
          enabled: z.boolean(),
          recipients: z.array(z.string()).max(50).default([]),
          suppressedActorIds: z.array(z.string()).max(50).optional(),
          dedupWindowMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const config = await setAudienceLegacyTokenKillSwitchNotifierConfig({
          ...parsed.data,
          updatedBy,
        });
        res.json({ config });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "save_failed" });
      }
    },
  );

  app.get(
    `${base}/legacy-token-kill-switch-notifier/history`,
    requireRootAdmin,
    (req, res) => {
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
      res.json({
        history: getLegacyTokenKillSwitchNotificationHistory(limit),
      });
    },
  );

  app.post(
    `${base}/legacy-token-kill-switch-notifier/test`,
    requireRootAdmin,
    async (req, res) => {
      try {
        const triggeredBy =
          (req as any).user?.id ||
          (req as any).session?.userId ||
          "root_admin";
        const result = await sendTestLegacyTokenKillSwitchNotification({
          triggeredBy,
        });
        res.json(result);
      } catch (e: any) {
        const msg = e?.message ?? "test_failed";
        const status = msg === "no_recipients_configured" ? 400 : 500;
        res.status(status).json({ message: msg });
      }
    },
  );

  // Task #607 — CSV export of the full legacy-token kill-switch
  // history with optional date / platform / actor filters. Mirrors the
  // gateway-alert-settings audit CSV route so founders can hand a
  // regulator a complete offline record during a compliance review.
  app.get(
    `${base}/legacy-token-status/history.csv`,
    requireRootAdmin,
    async (req, res) => {
      const QuerySchema = z
        .object({
          fromDate: z.string().datetime().optional(),
          toDate: z.string().datetime().optional(),
          platform: AudiencePlatformSchema.optional(),
          updatedBy: z.string().trim().min(1).max(200).optional(),
        })
        .strict();
      const parsed = QuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid query", errors: parsed.error.flatten() });
      }
      const rows = await legacyTokenKillSwitchAuditService.listFiltered({
        platform: parsed.data.platform ?? null,
        updatedBy: parsed.data.updatedBy ?? null,
        fromDate: parsed.data.fromDate ? new Date(parsed.data.fromDate) : null,
        toDate: parsed.data.toDate ? new Date(parsed.data.toDate) : null,
      });

      const header = [
        "id",
        "updatedAt",
        "platform",
        "previousValue",
        "newValue",
        "updatedBy",
        "batchId",
      ];
      const escape = (v: unknown): string => {
        if (v === null || v === undefined) return "";
        const s = v instanceof Date ? v.toISOString() : String(v);
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const body = rows
        .map((r) =>
          [
            r.id,
            r.updatedAt ? new Date(r.updatedAt).toISOString() : "",
            r.platform,
            r.previousValue,
            r.newValue,
            r.updatedBy,
            r.batchId ?? "",
          ]
            .map(escape)
            .join(","),
        )
        .join("\n");
      const csv = body ? `${header.join(",")}\n${body}\n` : `${header.join(",")}\n`;

      const filename = `legacy-token-kill-switch-history-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.send(csv);
    },
  );

  app.post(`${base}/command/:commandId/gateway-send`, requireRootAdmin, async (req, res) => {
    try {
      const adminId = (req as any).user?.id ?? null;
      const result = await audiencePlatformGatewayService.dispatch(String(req.params.commandId), { adminId });
      res.json({ result, platformSendAllowed: false });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "gateway_dispatch_failed" });
    }
  });

  app.get(`${base}/connectors/:connectorId/rate-limit`, requireRootAdmin, async (req, res) => {
    const status = await audiencePlatformGatewayService.peekRateLimit(String(req.params.connectorId));
    if (!status) return res.status(404).json({ message: "unknown connector" });
    res.json({ rateLimit: status });
  });

  // Task #496 — connector token rotation notifier (compromise-response email)
  app.get(
    `${base}/connector-rotation-notifier`,
    requireRootAdmin,
    async (_req, res) => {
      const config = await getAudienceConnectorRotationNotifierConfig();
      res.json({ config });
    },
  );

  // Task #500 — proactive founder alert when an approved official_api
  // connector successfully dispatches via the legacy shared env-token
  // fallback. Config is per-recipient list + dedup window; the actual
  // send happens in the bus subscriber installed at boot. NEVER returns
  // or accepts token material.
  app.get(
    `${base}/legacy-token-dispatch-alert`,
    requireRootAdmin,
    async (_req, res) => {
      const config = await getAudienceLegacyTokenDispatchAlertConfig();
      res.json({ config });
    },
  );

  app.put(
    `${base}/connector-rotation-notifier`,
    requireRootAdmin,
    async (req, res) => {
      const parsed = ConnectorRotationNotifierUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const config = await setAudienceConnectorRotationNotifierConfig({
          enabled: parsed.data.enabled,
          recipients: parsed.data.recipients,
          suppressedActions: parsed.data.suppressedActions ?? [],
          dedupWindowMs:
            parsed.data.dedupWindowMs === undefined
              ? null
              : parsed.data.dedupWindowMs,
          updatedBy,
        });
        res.json({ config });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "save_failed" });
      }
    },
  );

  // Task #549 — durable searchable history of legacy-token dispatch
  // alert decisions (sent / deduplicated / send_failed / disabled /
  // no_recipients / not_legacy_fallback / not_official_api / not_approved
  // / missing_connector). Backed by `audience_legacy_token_dispatch_alerts`
  // and pruned by the audience retention sweeper.
  app.get(
    `${base}/legacy-token-dispatch-alert/history`,
    requireRootAdmin,
    async (req, res) => {
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
      const history = await getLegacyTokenDispatchAlertHistory(limit);
      res.json({ history });
    },
  );

  app.put(
    `${base}/legacy-token-dispatch-alert`,
    requireRootAdmin,
    async (req, res) => {
      const parsed = LegacyTokenDispatchAlertUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const config = await setAudienceLegacyTokenDispatchAlertConfig({
          enabled: parsed.data.enabled,
          recipients: parsed.data.recipients,
          dedupWindowMs:
            parsed.data.dedupWindowMs === undefined
              ? null
              : parsed.data.dedupWindowMs,
          updatedBy,
        });
        res.json({ config });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "save_failed" });
      }
    },
  );

  app.get(
    `${base}/connector-rotation-notifier/history`,
    requireRootAdmin,
    async (req, res) => {
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
      res.json({ history: await getConnectorRotationNotificationHistory(limit) });
    },
  );

  app.post(
    `${base}/connector-rotation-notifier/test`,
    requireRootAdmin,
    async (req, res) => {
      try {
        const triggeredBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const result = await sendTestConnectorRotationNotification({ triggeredBy });
        res.json(result);
      } catch (e: any) {
        const msg = e?.message ?? "test_failed";
        const status = msg === "no_recipients_configured" ? 400 : 500;
        res.status(status).json({ message: msg });
      }
    },
  );
  app.get(`${base}/export-notifier`, requireRootAdmin, async (_req, res) => {
    const config = await getAudienceAuditExportNotifierConfig();
    res.json({ config });
  });

  // Task #728 — newest-first sanitized history of audit-export notifier
  // config changes (who muted/suppressed what, when). Surfaces in the
  // admin card under the suppression controls so compliance can prove
  // who turned the notifier off or loosened the dedup window long
  // after the live `system_settings` row has been overwritten.
  app.get(
    `${base}/export-notifier/config-history`,
    requireRootAdmin,
    async (req, res) => {
      const limitRaw = Number(req.query.limit);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 10;
      const history = await listAuditExportNotifierConfigHistory(limit);
      res.json({ history });
    },
  );

  app.put(`${base}/export-notifier`, requireRootAdmin, async (req, res) => {
    const parsed = ExportNotifierUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    try {
      const updatedBy =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      const config = await setAudienceAuditExportNotifierConfig({
        enabled: parsed.data.enabled,
        recipients: parsed.data.recipients,
        minRowCount: parsed.data.minRowCount,
        suppressedActorIds: parsed.data.suppressedActorIds ?? [],
        dedupWindowMs:
          parsed.data.dedupWindowMs === undefined
            ? null
            : parsed.data.dedupWindowMs,
        updatedBy,
      });
      res.json({ config });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "save_failed" });
    }
  });

  // Task #597 — team-wide soft warning threshold for the audience audit
  // history download buttons. Persisted in `system_settings` so every
  // admin / browser / incognito session sees the same value.
  app.get(
    `${base}/export-log/warn-threshold`,
    requireRootAdmin,
    async (_req, res) => {
      const config = await getAudienceAuditExportWarnThreshold();
      res.json({
        config,
        defaultThreshold: DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD,
      });
    },
  );

  app.put(
    `${base}/export-log/warn-threshold`,
    requireRootAdmin,
    async (req, res) => {
      const Schema = z.object({
        threshold: z
          .union([z.number(), z.null()])
          .refine(
            (v) =>
              v === null ||
              (Number.isFinite(v) && v >= 0 && Math.floor(v) === v),
            "threshold must be a non-negative integer or null",
          ),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy =
          (req as any).user?.id ||
          (req as any).session?.userId ||
          "root_admin";
        const config = await setAudienceAuditExportWarnThreshold({
          threshold: parsed.data.threshold,
          updatedBy,
        });
        res.json({
          config,
          defaultThreshold: DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD,
        });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "save_failed" });
      }
    },
  );

  // Task #703 — founder-configurable hard caps on audience audit
  // downloads. Stored in `system_settings` under
  // `audience_audit_trail_row_cap` and
  // `audience_audit_export_history_row_cap`. Bounds are enforced
  // server-side (1k..1M); `null` resets the cap to the default
  // (100k). Mirrors the warn-threshold flow on the same card.
  app.get(`${base}/export/row-cap`, requireRootAdmin, async (_req, res) => {
    const caps = await getAudienceAuditRowCaps();
    res.json({
      caps,
      defaultRowCap: DEFAULT_AUDIENCE_AUDIT_ROW_CAP,
      minRowCap: MIN_AUDIENCE_AUDIT_ROW_CAP,
      maxRowCap: MAX_AUDIENCE_AUDIT_ROW_CAP,
    });
  });

  app.put(`${base}/export/row-cap`, requireRootAdmin, async (req, res) => {
    const Schema = z.object({
      kind: z.enum(["trail", "history"]),
      rowCap: z
        .union([z.number(), z.null()])
        .refine(
          (v) =>
            v === null ||
            (Number.isFinite(v) && v >= 0 && Math.floor(v) === v),
          "rowCap must be a non-negative integer or null",
        ),
    });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    try {
      const updatedBy =
        (req as any).user?.id ||
        (req as any).session?.userId ||
        "root_admin";
      const config = await setAudienceAuditRowCap(parsed.data.kind, {
        rowCap: parsed.data.rowCap,
        updatedBy,
      });
      const caps = await getAudienceAuditRowCaps();
      res.json({
        config,
        caps,
        defaultRowCap: DEFAULT_AUDIENCE_AUDIT_ROW_CAP,
        minRowCap: MIN_AUDIENCE_AUDIT_ROW_CAP,
        maxRowCap: MAX_AUDIENCE_AUDIT_ROW_CAP,
      });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "save_failed" });
    }
  });

  app.get(`${base}/risk-signal-rules`, requireRootAdmin, async (_req, res) => {
    const rules = await getAudienceRiskSignalRules();
    res.json({
      rules,
      allSignals: ALL_RISK_SIGNALS,
      defaults: DEFAULT_AUDIENCE_RISK_SIGNAL_RULES,
      bounds: {
        minWideDateWindowDays: MIN_WIDE_DATE_WINDOW_DAYS,
        maxWideDateWindowDays: MAX_WIDE_DATE_WINDOW_DAYS,
      },
    });
  });

  app.put(`${base}/risk-signal-rules`, requireRootAdmin, async (req, res) => {
    const parsed = RiskSignalRulesUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    try {
      const updatedBy =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      const rules = await setAudienceRiskSignalRules({
        wideDateWindowDays: parsed.data.wideDateWindowDays,
        loudSignals: parsed.data.loudSignals,
        mutedSignals: parsed.data.mutedSignals,
        updatedBy,
      });
      res.json({
        rules,
        allSignals: ALL_RISK_SIGNALS,
        defaults: DEFAULT_AUDIENCE_RISK_SIGNAL_RULES,
        bounds: {
          minWideDateWindowDays: MIN_WIDE_DATE_WINDOW_DAYS,
          maxWideDateWindowDays: MAX_WIDE_DATE_WINDOW_DAYS,
        },
      });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "save_failed" });
    }
  });

  app.post(`${base}/risk-signal-rules/preview-email`, requireRootAdmin, async (req, res) => {
    const parsed = RiskSignalRulesPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    try {
      const candidateRules = {
        wideDateWindowDays: parsed.data.rules.wideDateWindowDays,
        loudSignals: parsed.data.rules.loudSignals,
        mutedSignals: parsed.data.rules.mutedSignals,
        updatedAt: null,
        updatedBy: null,
      };
      const partition = partitionRiskSignalsForEmail(
        parsed.data.sampleSignals,
        candidateRules,
      );
      const exportedAt = new Date().toISOString();
      const built = emailService.buildAudienceAuditExportNotificationEmail({
        exportId: `aud_exp_preview_${Date.now().toString(36)}`,
        actorId: "preview_admin",
        actorType: "root_admin",
        actorRole: "preview",
        format: "json",
        filters: {
          fromDate: null,
          toDate: null,
          platform: null,
          productionId: null,
        },
        rowCounts: {
          connectors: 3,
          messages: 1200,
          decisions: 1200,
          commands: 24,
          total: 2427,
        },
        riskSignals: partition.bodySignals,
        riskSubjectSignals: partition.subjectSignals,
        exportedAt,
        thresholdRowCount: 1000,
        thresholdExceeded: true,
        outlier: null,
      });
      res.json({
        subject: built.subject,
        html: built.html,
        partition,
        sample: {
          inputSignals: parsed.data.sampleSignals,
          appliedRules: candidateRules,
        },
      });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "preview_failed" });
    }
  });

  app.get(`${base}/export-notifier/history`, requireRootAdmin, async (req, res) => {
    const HistorySchema = z.object({
      limit: z.coerce.number().int().min(1).max(50).optional(),
      actorId: z.string().trim().min(1).max(200).optional(),
      fromDate: z
        .string()
        .trim()
        .min(1)
        .refine((v) => !Number.isNaN(new Date(v).getTime()), "invalid fromDate")
        .optional(),
      toDate: z
        .string()
        .trim()
        .min(1)
        .refine((v) => !Number.isNaN(new Date(v).getTime()), "invalid toDate")
        .optional(),
      reason: z
        .enum([
          "sent",
          "disabled",
          "no_recipients",
          "actor_suppressed",
          "below_threshold",
          "deduplicated",
          "send_failed",
          "history_format_skipped",
        ])
        .optional(),
    });
    const parsed = HistorySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    const { limit, actorId, fromDate, toDate, reason } = parsed.data;
    res.json({
      history: await getAuditExportNotificationHistory(limit ?? 20, {
        actorId: actorId ?? null,
        fromDate: fromDate ?? null,
        toDate: toDate ?? null,
        reason: reason ?? null,
      }),
      filters: {
        actorId: actorId ?? null,
        fromDate: fromDate ?? null,
        toDate: toDate ?? null,
        reason: reason ?? null,
      },
    });
  });

  app.post(`${base}/export-notifier/test`, requireRootAdmin, async (req, res) => {
    try {
      const triggeredBy =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      const result = await sendTestAuditExportNotification({ triggeredBy });
      res.json(result);
    } catch (e: any) {
      const msg = e?.message ?? "test_failed";
      const status = msg === "no_recipients_configured" ? 400 : 500;
      res.status(status).json({ message: msg });
    }
  });

  // Task #428 — outlier detection config.
  app.get(`${base}/export-outlier-config`, requireRootAdmin, async (_req, res) => {
    const config = await getAudienceAuditExportOutlierConfig();
    res.json({ config, defaults: DEFAULT_AUDIENCE_AUDIT_EXPORT_OUTLIER_CONFIG });
  });

  app.put(`${base}/export-outlier-config`, requireRootAdmin, async (req, res) => {
    const parsed = ExportOutlierUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    try {
      const updatedBy =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      const config = await setAudienceAuditExportOutlierConfig({
        ...parsed.data,
        updatedBy,
      });
      res.json({ config });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "save_failed" });
    }
  });

  app.get(`${base}/export-log`, requireRootAdmin, async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const allowedPlatforms = new Set([
      "youtube",
      "facebook",
      "x",
      "telegram",
      "instagram",
      "tiktok",
      "linkedin",
      "reddit",
      "custom",
    ]);
    const platformRaw = typeof req.query.platform === "string" ? req.query.platform : "";
    const platform = allowedPlatforms.has(platformRaw)
      ? (platformRaw as any)
      : null;
    const formatRaw = typeof req.query.format === "string" ? req.query.format : "";
    const format = formatRaw === "json" || formatRaw === "csv" ? formatRaw : null;
    const actorIdRaw = typeof req.query.actorId === "string" ? req.query.actorId.trim() : "";
    const actorId = actorIdRaw.length > 0 ? actorIdRaw : null;
    const parseDate = (v: unknown): Date | null => {
      if (typeof v !== "string" || v.length === 0) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const minTotalRowsRaw = Number(req.query.minTotalRows);
    const minTotalRows =
      Number.isFinite(minTotalRowsRaw) && minTotalRowsRaw >= 0 ? minTotalRowsRaw : null;
    const sortByRaw = typeof req.query.sortBy === "string" ? req.query.sortBy : "";
    const sortBy: "exportedAt" | "totalRowCount" =
      sortByRaw === "totalRowCount" ? "totalRowCount" : "exportedAt";
    const sortOrderRaw = typeof req.query.sortOrder === "string" ? req.query.sortOrder : "";
    const sortOrder: "asc" | "desc" = sortOrderRaw === "asc" ? "asc" : "desc";
    const flaggedOnly = req.query.flaggedOnly === "true" || req.query.flaggedOnly === "1";

    try {
      const result = await omniChannelAudienceSafetyService.listAuditExports({
        limit,
        offset,
        actorId,
        from,
        to,
        platform,
        format,
        minTotalRows,
        flaggedOnly,
        sortBy,
        sortOrder,
      });
      res.json({
        exports: result.rows,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        sortBy,
        sortOrder,
        filters: {
          actorId,
          from: from ? from.toISOString() : null,
          to: to ? to.toISOString() : null,
          platform,
          format,
          minTotalRows,
          flaggedOnly,
        },
      });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "export_log_failed" });
    }
  });

  app.get(`${base}/gateway/alert-settings`, requireRootAdmin, async (_req, res) => {
    res.json({ settings: await gatewayBlockAlertSettingsService.getStatus() });
  });

  app.patch(`${base}/gateway/alert-settings`, requireRootAdmin, async (req, res) => {
    const Schema = z
      .object({
        threshold: z.number().int().optional(),
        windowMs: z.number().int().optional(),
        dedupMs: z.number().int().optional(),
        // `null` => persist "derive from threshold/2"; omit to leave unchanged.
        recovery: z.number().int().nullable().optional(),
        // Task #443
        autoPauseEnabled: z.boolean().optional(),
        autoPauseWindows: z.number().int().optional(),
      })
      .strict();
    const parsed = Schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    const updatedBy =
      (req as any).user?.id || (req as any).session?.userId || "root_admin";
    // Task #454: capture the *current* effective value for each field
    // before mutating anything so the audit row can record old → new.
    const before = await gatewayBlockAlertSettingsService.getStatus();
    const auditEntries: GatewayAlertAuditEntryInput[] = [];
    try {
      if (parsed.data.threshold != null) {
        const next = await gatewayBlockAlertSettingsService.setThreshold(parsed.data.threshold, updatedBy);
        const oldVal = formatAuditValue("threshold", before.threshold);
        const newVal = formatAuditValue("threshold", next);
        if (oldVal !== newVal) {
          auditEntries.push({ field: "threshold", oldValue: oldVal, newValue: newVal, action: "update", updatedBy });
        }
      }
      if (parsed.data.windowMs != null) {
        const next = await gatewayBlockAlertSettingsService.setWindowMs(parsed.data.windowMs, updatedBy);
        const oldVal = formatAuditValue("windowMs", before.windowMs);
        const newVal = formatAuditValue("windowMs", next);
        if (oldVal !== newVal) {
          auditEntries.push({ field: "windowMs", oldValue: oldVal, newValue: newVal, action: "update", updatedBy });
        }
      }
      if (parsed.data.dedupMs != null) {
        const next = await gatewayBlockAlertSettingsService.setDedupMs(parsed.data.dedupMs, updatedBy);
        const oldVal = formatAuditValue("dedupMs", before.dedupMs);
        const newVal = formatAuditValue("dedupMs", next);
        if (oldVal !== newVal) {
          auditEntries.push({ field: "dedupMs", oldValue: oldVal, newValue: newVal, action: "update", updatedBy });
        }
      }
      if (parsed.data.recovery !== undefined) {
        const next = await gatewayBlockAlertSettingsService.setRecovery(parsed.data.recovery, updatedBy);
        const oldVal = before.recoveryIsDerived
          ? "derive"
          : formatAuditValue("recovery", before.recovery);
        const newVal = formatAuditValue("recovery", next);
        if (oldVal !== newVal) {
          auditEntries.push({ field: "recovery", oldValue: oldVal, newValue: newVal, action: "update", updatedBy });
        }
      }
      if (parsed.data.autoPauseEnabled !== undefined) {
        await gatewayBlockAlertSettingsService.setAutoPauseEnabled(
          parsed.data.autoPauseEnabled,
          updatedBy,
        );
      }
      if (parsed.data.autoPauseWindows !== undefined) {
        await gatewayBlockAlertSettingsService.setAutoPauseWindows(
          parsed.data.autoPauseWindows,
          updatedBy,
        );
      }
      await gatewayAlertSettingsAuditService.recordMany(auditEntries);
      res.json({ settings: await gatewayBlockAlertSettingsService.getStatus() });
    } catch (e: any) {
      const msg = e?.message ?? "save_failed";
      const status = msg === "out_of_range" || msg === "invalid_value" ? 400 : 500;
      res.status(status).json({ message: msg });
    }
  });

  app.post(`${base}/gateway/alert-settings/reset`, requireRootAdmin, async (req, res) => {
    const updatedBy =
      (req as any).user?.id || (req as any).session?.userId || "root_admin";
    try {
      // Task #454: snapshot the DB overrides that are about to disappear
      // so the audit row makes the reset reviewable after the fact.
      const before = await gatewayBlockAlertSettingsService.getStatus();
      await gatewayBlockAlertSettingsService.clearOverrides(updatedBy);
      const after = await gatewayBlockAlertSettingsService.getStatus();
      const snapshot = JSON.stringify({
        threshold: before.overrides.threshold,
        windowMs: before.overrides.windowMs,
        dedupMs: before.overrides.dedupMs,
        recovery: before.overrides.recovery,
        recoveryIsDerived: before.recoveryIsDerived,
      });
      const hadAnyOverride =
        before.thresholdSource === "db" ||
        before.windowMsSource === "db" ||
        before.dedupMsSource === "db" ||
        before.recoverySource === "db";
      await gatewayAlertSettingsAuditService.record({
        field: "all",
        oldValue: snapshot,
        newValue: hadAnyOverride
          ? JSON.stringify({
              threshold: after.threshold,
              windowMs: after.windowMs,
              dedupMs: after.dedupMs,
              recovery: after.recovery,
              recoveryIsDerived: after.recoveryIsDerived,
            })
          : null,
        action: "reset",
        updatedBy,
      });
      res.json({ settings: after });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "reset_failed" });
    }
  });

  app.get(`${base}/gateway/alert-settings/audit-log`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      limit: z.coerce.number().int().positive().max(200).default(20),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const entries = await gatewayAlertSettingsAuditService.list(parsed.data.limit);
    res.json({ entries });
  });

  // Task #489 — CSV export of the full threshold-change history with
  // optional date / actor filters. Every export is itself written to the
  // same audit table (action="export") so we know who pulled the file.
  app.get(
    `${base}/gateway/alert-settings/audit-log/export`,
    requireRootAdmin,
    async (req, res) => {
      const QuerySchema = z
        .object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          updatedBy: z.string().trim().min(1).max(200).optional(),
        })
        .strict();
      const parsed = QuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid query", errors: parsed.error.flatten() });
      }
      const fromDate = parsed.data.from ? new Date(parsed.data.from) : null;
      const toDate = parsed.data.to ? new Date(parsed.data.to) : null;
      const updatedBy = parsed.data.updatedBy ?? null;

      const rows = await gatewayAlertSettingsAuditService.listFiltered({
        fromDate,
        toDate,
        updatedBy,
      });

      const actor =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      // Self-audit the export. Failures are swallowed inside the service
      // so a broken audit log can never block the download.
      await gatewayAlertSettingsAuditService.record({
        field: "all",
        oldValue: null,
        newValue: JSON.stringify({
          rowCount: rows.length,
          from: parsed.data.from ?? null,
          to: parsed.data.to ?? null,
          updatedBy: updatedBy,
        }),
        action: "export",
        updatedBy: actor,
      });

      const header = [
        "id",
        "updatedAt",
        "field",
        "action",
        "oldValue",
        "newValue",
        "updatedBy",
      ];
      const escape = (v: unknown): string => {
        if (v === null || v === undefined) return "";
        const s = v instanceof Date ? v.toISOString() : String(v);
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const body = rows
        .map((r) =>
          [
            r.id,
            r.updatedAt ? new Date(r.updatedAt).toISOString() : "",
            r.field,
            r.action,
            r.oldValue,
            r.newValue,
            r.updatedBy,
          ]
            .map(escape)
            .join(","),
        )
        .join("\n");
      const csv = body ? `${header.join(",")}\n${body}\n` : `${header.join(",")}\n`;

      const filename = `gateway-alert-settings-audit-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.send(csv);
    },
  );

  app.get(`${base}/gateway/activity`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      limit: z.coerce.number().int().positive().max(500).default(100),
      offset: z.coerce.number().int().nonnegative().max(100000).default(0),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      // Task #491: narrow by connector platform and/or outcome so admins
      // chasing an incident on one connector don't have to scroll past
      // unrelated rows.
      platform: AudiencePlatformSchema.optional(),
      kind: z.enum(["simulated", "dispatched", "blocked"]).optional(),
      // Task #532: narrow further to a single connector when one
      // platform/account has multiple connectors (e.g. two YouTube
      // channels under the same brand).
      connectorId: z.string().min(1).max(200).optional(),
      // Task #573: narrow further to a specific admin actor id so an
      // incident responder can pull "everything admin_X dispatched"
      // without scrolling past every other actor's rows.
      adminId: z.string().trim().min(1).max(200).optional(),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const fromDate = parsed.data.from ? new Date(parsed.data.from) : null;
    const toDate = parsed.data.to ? new Date(parsed.data.to) : null;
    // Task #421: read the permanent DB-backed log instead of the 2k-event
    // in-memory bus so admins can review past incidents and run audits.
    const eventsResult = await listGatewayEvents({
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      fromDate,
      toDate,
      platform: parsed.data.platform ?? null,
      connectorId: parsed.data.connectorId ?? null,
      kind: parsed.data.kind ?? null,
      adminId: parsed.data.adminId ?? null,
    });
    // Task #583 — surface a hint when historical rows have no connector
    // attribution so admins understand the Connector filter can hide them.
    const unattributedConnectorCount = await countGatewayEventsWithoutConnector();
    const connectors = await omniChannelAudienceSafetyService.listConnectors();
    const rateLimits = await Promise.all(
      connectors.map(async (c) => ({
        connectorId: c.connectorId,
        platform: c.platform,
        displayName: c.displayName,
        platformSendApproved: c.platformSendApproved,
        platformSendApprovedBy: c.platformSendApprovedBy,
        platformSendApprovedAt: c.platformSendApprovedAt,
        autoPausedAt: c.autoPausedAt,
        autoPausedReason: c.autoPausedReason,
        apiAccessMode: c.apiAccessMode,
        rateLimit: await audiencePlatformGatewayService.peekRateLimit(c.connectorId),
      })),
    );
    res.json({
      events: eventsResult.events,
      total: eventsResult.total,
      limit: eventsResult.limit,
      offset: eventsResult.offset,
      filters: {
        from: fromDate ? fromDate.toISOString() : null,
        to: toDate ? toDate.toISOString() : null,
        platform: parsed.data.platform ?? null,
        connectorId: parsed.data.connectorId ?? null,
        kind: parsed.data.kind ?? null,
        adminId: parsed.data.adminId ?? null,
      },
      rateLimits,
      unattributedConnectorCount,
      // Per-connector block-rate widget (Task #419) — driven by the same
      // rolling window that decides whether to page the founder. Lets
      // admins see which connector is causing the storm without waiting
      // for the alert to fire and without digging through the audit log.
      blockRate: gatewayBlockAlertService.getConnectorBlockSnapshot(),
      liveDispatchEnabled: process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH === "true",
      platformSendAllowed: false,
    });
  });

  // Task #492 — download the *filtered* slice of the permanent gateway
  // events log as CSV. Mirrors the audit-export pattern: incident
  // responders and regulators get the exact rows they were just looking
  // at without needing direct DB access. The download is logged into
  // the same `audience_audit_exports` meta-audit trail so "who pulled
  // what" is always recoverable. Hard-capped at `GATEWAY_EVENTS_CSV_ROW_CAP`
  // (100k) rows — the meta row in the CSV surfaces `truncated:true` if
  // the cap was hit so the operator knows to narrow their filters.
  app.get(`${base}/gateway/activity/export`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      // Task #533 / #537: mirror the live `gateway/activity` filters
      // so the CSV download covers the exact slice the admin is
      // viewing — narrow by connector platform and/or outcome
      // (simulated / dispatched / blocked).
      platform: AudiencePlatformSchema.optional(),
      kind: z.enum(["simulated", "dispatched", "blocked"]).optional(),
      // Task #573: mirror the live `gateway/activity` adminId filter so
      // the CSV download covers the exact "everything admin_X did"
      // slice the incident responder is viewing.
      adminId: z.string().trim().min(1).max(200).optional(),
      // Task #584: also forward the connector filter so an admin who
      // just isolated one channel's traffic can download exactly that
      // slice instead of re-grepping the full CSV.
      connectorId: z.string().min(1).max(200).optional(),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const fromDate = parsed.data.from ? new Date(parsed.data.from) : null;
    const toDate = parsed.data.to ? new Date(parsed.data.to) : null;
    const platformFilter = parsed.data.platform ?? null;
    const kindFilter = parsed.data.kind ?? null;
    const adminIdFilter = parsed.data.adminId ?? null;
    const connectorIdFilter = parsed.data.connectorId ?? null;
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ message: "from must be <= to" });
    }
    try {
      const PAGE = 500;
      const events: any[] = [];
      let offset = 0;
      let total = 0;
      let truncated = false;
      // Stream the matching rows in PAGE-sized chunks so a large
      // window doesn't try to materialize everything in a single
      // unbounded query.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const page = await listGatewayEvents({
          limit: PAGE,
          offset,
          fromDate,
          toDate,
          platform: platformFilter,
          kind: kindFilter,
          adminId: adminIdFilter,
          connectorId: connectorIdFilter,
        });
        total = page.total;
        for (const ev of page.events) {
          if (events.length >= GATEWAY_EVENTS_CSV_ROW_CAP) {
            truncated = true;
            break;
          }
          events.push(ev);
        }
        if (
          truncated ||
          page.events.length < PAGE ||
          events.length >= page.total
        ) {
          break;
        }
        offset += PAGE;
      }

      const exportedAt = new Date();
      const filtersForMeta = {
        fromDate: fromDate ? fromDate.toISOString() : null,
        toDate: toDate ? toDate.toISOString() : null,
        // Task #537: surface the active platform filter in the
        // meta-audit row so reviewers can tell from the audit trail
        // which slice was downloaded.
        platform: platformFilter,
        // Task #573: also persist the adminId filter on the meta-audit
        // row alongside platform / kind so compliance reviewers can
        // tell exactly which actor-slice was downloaded.
        adminId: adminIdFilter,
        // Task #584: also surface the connector filter so the
        // meta-audit row records which specific channel was pulled.
        connectorId: connectorIdFilter,
        // Sentinel productionId so this row is greppable in the
        // meta-audit history alongside the other "non-trail"
        // downloads (filtered history, gateway events, etc).
        // Task #533 / #537 / #584: surface the optional kind /
        // connector filters on the sentinel so meta-audit reviewers
        // can tell which slice was pulled without re-running the
        // export.
        // Task #573: also surface the optional adminId filter on the
        // sentinel — same rationale as kind / connector.
        productionId: `__gateway_activity__${
          kindFilter ? `:kind=${kindFilter}` : ""
        }${adminIdFilter ? `:admin=${adminIdFilter}` : ""}${
          connectorIdFilter ? `:connector=${connectorIdFilter}` : ""
        }${
          truncated ? `:truncated@${GATEWAY_EVENTS_CSV_ROW_CAP}` : ""
        }`,
      };

      const admin = getAdminVerification(req);
      const auditLog = await omniChannelAudienceSafetyService.recordAuditExport({
        actorId: admin?.actor.id ?? "unknown",
        actorType: admin?.actor.type ?? "unknown",
        actorRole: admin?.role ?? null,
        format: "csv",
        filters: filtersForMeta,
        rowCounts: {
          connectors: 0,
          messages: events.length,
          decisions: 0,
          commands: 0,
        },
      });

      const csv = buildAudienceGatewayEventsCsv({
        events,
        filters: {
          fromDate: filtersForMeta.fromDate,
          toDate: filtersForMeta.toDate,
          platform: platformFilter,
          kind: kindFilter,
          adminId: adminIdFilter,
          connectorId: connectorIdFilter,
        },
        exportedAt: exportedAt.toISOString(),
        totalEvents: total,
        truncated,
        rowCap: GATEWAY_EVENTS_CSV_ROW_CAP,
      });
      const stamp = exportedAt.toISOString().replace(/[:.]/g, "-");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audience-gateway-events-${stamp}.csv"`,
      );
      res.setHeader("X-Audit-Export", "audience-gateway-events");
      res.setHeader("X-Audit-Export-Id", auditLog.exportId);
      res.setHeader("X-Audit-Export-Truncated", truncated ? "true" : "false");
      res.setHeader("X-Audit-Export-Row-Cap", String(GATEWAY_EVENTS_CSV_ROW_CAP));
      return res.send(csv);
    } catch (e: any) {
      return res
        .status(500)
        .json({ message: e?.message ?? "gateway_events_export_failed" });
    }
  });

  // Task #398 — download the meta-audit trail itself as CSV or JSON.
  // Regulators and incident responders often want the "who exported
  // what, when" trail as a standalone file. This route streams every
  // row from `audience_audit_exports` (no row cap) and logs the
  // download itself as a meta-meta-export with format `csv-history`
  // or `json-history` so the recursion is itself auditable.
  // Task #510 — lightweight count endpoint so the admin UI can show
  // "N rows match these filters" next to the Download history buttons
  // without triggering a real meta-meta-export. Accepts the same query
  // params as `export-log/export` and returns just the row count.
  app.get(`${base}/export-log/count`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      actorId: z.string().trim().min(1).optional(),
      formatFilter: z.enum(["json", "csv", "json-history", "csv-history"]).optional(),
      platform: z
        .enum([
          "youtube", "facebook", "x", "telegram", "instagram",
          "tiktok", "linkedin", "reddit", "custom",
        ])
        .optional(),
      minTotalRows: z.coerce.number().int().min(0).optional(),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const { from, to, actorId, formatFilter, platform, minTotalRows } = parsed.data;
    try {
      const result = await omniChannelAudienceSafetyService.listAuditExports({
        limit: 1,
        offset: 0,
        actorId: actorId ?? null,
        from: from ? new Date(from) : null,
        to: to ? new Date(to) : null,
        platform: platform ?? null,
        format: formatFilter ?? null,
        minTotalRows: minTotalRows ?? null,
      });
      return res.json({ count: result.total });
    } catch (e: any) {
      return res.status(500).json({ message: e?.message ?? "export_log_count_failed" });
    }
  });

  app.get(`${base}/export-log/export`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      format: z.enum(["json", "csv"]).default("json"),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      actorId: z.string().trim().min(1).optional(),
      // Task #464: bring the history download in line with the list
      // view filters so admins can grab exactly the slice they were
      // just looking at without re-filtering in a spreadsheet.
      formatFilter: z.enum(["json", "csv", "json-history", "csv-history"]).optional(),
      platform: z
        .enum([
          "youtube", "facebook", "x", "telegram", "instagram",
          "tiktok", "linkedin", "reddit", "custom",
        ])
        .optional(),
      minTotalRows: z.coerce.number().int().min(0).optional(),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const { format, from, to, actorId, formatFilter, platform, minTotalRows } = parsed.data;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    try {
      // Task #433: forward optional from/to/actorId filters to the
      // service so incident responders can scope the meta-audit
      // trail download instead of pulling the entire table.
      // Task #464: also forward formatFilter / platform / minTotalRows
      // so the download matches the list-view filters.
      // Task #632 — bounded fetch so a runaway history (post-incident,
      // millions of rows) can't materialize unbounded. `truncated` flows
      // through to the response envelope / CSV meta row.
      // Task #703 — founder-configurable history cap.
      const historyCapCfg = await getAudienceAuditRowCap("history");
      const AUDIT_EXPORT_HISTORY_ROW_CAP = historyCapCfg.rowCap;
      const { rows: exports, truncated, rowCap } =
        await omniChannelAudienceSafetyService.listAllAuditExportsBounded({
          from: fromDate,
          to: toDate,
          actorId: actorId ?? null,
          platform: platform ?? null,
          format: formatFilter ?? null,
          minTotalRows: minTotalRows ?? null,
          limit: AUDIT_EXPORT_HISTORY_ROW_CAP,
        });
      return await streamExportLogDownload(req, res, {
        exports,
        truncated,
        rowCap,
        format,
        filename: "audience-audit-export-history",
        filtersForMeta: {
          // Task #433/#464: record the actual filters applied to the
          // history download so the meta-meta-export trail captures
          // the scope of the investigation, not just the sentinel.
          fromDate: fromDate ? fromDate.toISOString() : null,
          toDate: toDate ? toDate.toISOString() : null,
          platform: platform ?? null,
          productionId: "__audit_export_log__",
          actorId: actorId ?? null,
          formatFilter: formatFilter ?? null,
          minTotalRows: minTotalRows ?? null,
        },
        notice:
          "Meta-audit trail of every audience-moderation audit-export download. This download was itself logged in the audit-export trail with format=json-history.",
      });
    } catch (e: any) {
      return res.status(500).json({ message: e?.message ?? "export_log_export_failed" });
    }
  });

  // Task #427: download just the *filtered* slice currently shown in
  // the Audit Export History card (same filter + sort params as
  // `GET /export-log`, no pagination). The download itself is logged
  // as a `csv-history` / `json-history` meta-meta-export so the
  // recursion stays auditable. `productionId` carries a sentinel that
  // encodes the active filters so an investigator can later see
  // exactly which slice was pulled.
  app.get(`${base}/export-log/export-filtered`, requireRootAdmin, async (req, res) => {
    const allowedPlatforms = new Set([
      "youtube", "facebook", "x", "telegram", "instagram",
      "tiktok", "linkedin", "reddit", "custom",
    ]);
    const platformRaw = typeof req.query.platform === "string" ? req.query.platform : "";
    const platform = allowedPlatforms.has(platformRaw) ? (platformRaw as any) : null;
    const formatFilterRaw = typeof req.query.formatFilter === "string" ? req.query.formatFilter : "";
    const formatFilter =
      formatFilterRaw === "json" || formatFilterRaw === "csv" ? formatFilterRaw : null;
    const actorIdRaw = typeof req.query.actorId === "string" ? req.query.actorId.trim() : "";
    const actorId = actorIdRaw.length > 0 ? actorIdRaw : null;
    const parseDate = (v: unknown): Date | null => {
      if (typeof v !== "string" || v.length === 0) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const minTotalRowsRaw = Number(req.query.minTotalRows);
    const minTotalRows =
      Number.isFinite(minTotalRowsRaw) && minTotalRowsRaw >= 0 ? minTotalRowsRaw : null;
    const sortByRaw = typeof req.query.sortBy === "string" ? req.query.sortBy : "";
    const sortBy: "exportedAt" | "totalRowCount" =
      sortByRaw === "totalRowCount" ? "totalRowCount" : "exportedAt";
    const sortOrderRaw = typeof req.query.sortOrder === "string" ? req.query.sortOrder : "";
    const sortOrder: "asc" | "desc" = sortOrderRaw === "asc" ? "asc" : "desc";
    const downloadFormatRaw = typeof req.query.format === "string" ? req.query.format : "";
    const downloadFormat: "json" | "csv" = downloadFormatRaw === "csv" ? "csv" : "json";
    const flaggedOnly = req.query.flaggedOnly === "true" || req.query.flaggedOnly === "1";

    try {
      // Task #632 — bounded variant; filtered history can still be huge
      // if the operator picks a wide window. Truncation surfaces in the
      // download envelope + CSV meta row + response headers.
      // Task #703 — founder-configurable history cap.
      const historyCapCfg = await getAudienceAuditRowCap("history");
      const AUDIT_EXPORT_HISTORY_ROW_CAP = historyCapCfg.rowCap;
      const { rows: exports, truncated, rowCap } =
        await omniChannelAudienceSafetyService.listAllFilteredAuditExportsBounded({
          actorId,
          from,
          to,
          platform,
          format: formatFilter,
          minTotalRows,
          flaggedOnly,
          sortBy,
          sortOrder,
          limit: AUDIT_EXPORT_HISTORY_ROW_CAP,
        });
      const filterParts = [
        actorId ? `actor=${actorId}` : null,
        from ? `from=${from.toISOString()}` : null,
        to ? `to=${to.toISOString()}` : null,
        platform ? `platform=${platform}` : null,
        formatFilter ? `format=${formatFilter}` : null,
        minTotalRows != null ? `minRows=${minTotalRows}` : null,
        flaggedOnly ? `flaggedOnly=1` : null,
        `sort=${sortBy}:${sortOrder}`,
      ].filter(Boolean).join(";");
      return await streamExportLogDownload(req, res, {
        exports,
        truncated,
        rowCap,
        format: downloadFormat,
        filename: "audience-audit-export-history-filtered",
        filtersForMeta: {
          fromDate: from ? from.toISOString() : null,
          toDate: to ? to.toISOString() : null,
          platform,
          // Sentinel + active-filter trail so the meta-meta-export
          // is greppable and the slice that was pulled is recoverable.
          productionId: `__audit_export_log_filtered__:${filterParts}`,
        },
        notice:
          "Filtered slice of the audience-moderation audit-export history. This download was itself logged in the audit-export trail with format=json-history/csv-history.",
      });
    } catch (e: any) {
      return res.status(500).json({ message: e?.message ?? "export_log_filtered_failed" });
    }
  });

  // Legacy `export-log/export` body is below — keep nothing after this
  // marker so the helper above owns the response.
  async function streamExportLogDownload(
    req: any,
    res: any,
    args: {
      exports: any[];
      // Task #632 — bounded download signals.
      truncated?: boolean;
      rowCap?: number;
      format: "json" | "csv";
      filename: string;
      filtersForMeta: {
        fromDate: string | null;
        toDate: string | null;
        platform: any;
        productionId: string;
        actorId?: string | null;
        formatFilter?: string | null;
        minTotalRows?: number | null;
      };
      notice: string;
    },
  ) {
    const { exports, format, filename, filtersForMeta, notice } = args;
    const truncated = args.truncated === true;
    const rowCap = args.rowCap ?? DEFAULT_AUDIENCE_AUDIT_ROW_CAP;
    const exportedAt = new Date().toISOString();
    const admin = getAdminVerification(req);
    const auditLog = await omniChannelAudienceSafetyService.recordAuditExport({
      actorId: admin?.actor.id ?? "unknown",
      actorType: admin?.actor.type ?? "unknown",
      actorRole: admin?.role ?? null,
      format: format === "csv" ? "csv-history" : "json-history",
      // Task #632 — annotate the meta-meta-export productionId with a
      // truncation sentinel so reviewers can grep for capped history
      // downloads without re-pulling the CSV/JSON payload.
      filters: truncated
        ? {
            ...filtersForMeta,
            productionId: `${filtersForMeta.productionId}:truncated@${rowCap}`,
          }
        : filtersForMeta,
      rowCounts: {
        connectors: 0,
        // Record the total number of history rows pulled in `messages`
        // so the existing list UI / total column still reflects the
        // size of the meta-export.
        messages: exports.length,
        decisions: 0,
        commands: 0,
      },
    });
    const stamp = exportedAt.replace(/[:.]/g, "-");
    if (format === "csv") {
      const csv = buildAudienceAuditExportLogCsv({
        exports,
        exportedAt,
        totalExports: exports.length,
        truncated,
        rowCap,
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}-${stamp}.csv"`,
      );
      res.setHeader("X-Audit-Export", "audience-audit-export-history");
      res.setHeader("X-Audit-Export-Id", auditLog.exportId);
      res.setHeader("X-Audit-Export-Truncated", truncated ? "true" : "false");
      res.setHeader("X-Audit-Export-Row-Cap", String(rowCap));
      return res.send(csv);
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}-${stamp}.json"`,
    );
    res.setHeader("X-Audit-Export", "audience-audit-export-history");
    res.setHeader("X-Audit-Export-Id", auditLog.exportId);
    res.setHeader("X-Audit-Export-Truncated", truncated ? "true" : "false");
    res.setHeader("X-Audit-Export-Row-Cap", String(rowCap));
    return res.json({
      exports,
      exportedAt,
      totalExports: exports.length,
      truncated,
      rowCap,
      filters: filtersForMeta,
      platformSendAllowed: false,
      realSendAllowed: false,
      exportLog: auditLog,
      notice,
    });
  }

  app.get(`${base}/:productionId/safety-queue`, requireRootAdmin, async (req, res) => {
    res.json({
      decisions: await omniChannelAudienceSafetyService.listDecisions(String(req.params.productionId), 200),
      platformSendAllowed: false,
    });
  });

  app.get(`${base}/retention/stats`, requireRootAdmin, async (_req, res) => {
    res.json({ stats: await getRetentionStats() });
  });

  // Task #634 — per-(table, column) summary of audience-* rows whose
  // attribution columns are still NULL because they were persisted
  // before the column was added. Mirrors the "(N rows have no
  // connector)" hint Task #583 added for `audience_gateway_events`
  // but covers every known attribution column in one read.
  app.get(`${base}/orphaned-attribution`, requireRootAdmin, async (_req, res) => {
    res.json({ summary: await getAudienceOrphanedAttributionSummary() });
  });

  app.post(`${base}/retention/sweep`, requireRootAdmin, async (req, res) => {
    const parsed = z
      .object({ retentionDays: z.number().int().positive().optional() })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    const result = await runRetentionSweep(parsed.data.retentionDays, "manual");
    res.json({ result, stats: await getRetentionStats() });
  });

  app.post(`${base}/retention/mode`, requireRootAdmin, async (req, res) => {
    const parsed = RetentionModeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    const updatedBy =
      (req as any).user?.id || (req as any).session?.userId || "root_admin";
    const eff = await setRetentionMode(parsed.data.mode, updatedBy);
    res.json({ ...eff, stats: await getRetentionStats() });
  });

  app.post(`${base}/retention/restore`, requireRootAdmin, async (req, res) => {
    const parsed = z
      .object({ archivePath: z.string().min(1) })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    const restoredBy =
      (req as any).user?.id || (req as any).session?.userId || "root_admin";
    try {
      const result = await restoreFromArchive(parsed.data.archivePath, String(restoredBy));
      const status = result.error ? 400 : 200;
      return res
        .status(status)
        .json({ result, restoreLog: (await getAudienceRestoreLog()).slice(0, 20) });
    } catch (e: any) {
      return res.status(400).json({ message: e?.message ?? "restore_failed" });
    }
  });

  app.get(`${base}/retention/restore-log`, requireRootAdmin, async (_req, res) => {
    res.json({ restoreLog: await getAudienceRestoreLog() });
  });

  app.get(`${base}/retention/restore-log/retention`, requireRootAdmin, async (_req, res) => {
    res.json({ ...(await getEffectiveRestoreLogRetentionDays()), stats: await getRetentionStats() });
  });

  app.post(`${base}/retention/restore-log/retention`, requireRootAdmin, async (req, res) => {
    const parsed = z
      .object({ retentionDays: z.number().int().positive().nullable() })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    const updatedBy =
      (req as any).user?.id || (req as any).session?.userId || "root_admin";
    const eff = await setRestoreLogRetentionOverride(parsed.data.retentionDays, updatedBy);
    res.json({ ...eff, stats: await getRetentionStats() });
  });

  // Task #470: restore-log per-day rate threshold (founder alert when
  // today's `audience_restore_log` insert count crosses the limit).
  app.get(`${base}/retention/restore-log/rate-threshold`, requireRootAdmin, async (_req, res) => {
    res.json({
      ...(await getEffectiveRestoreLogRateThreshold()),
      rate: await getRestoreLogRateStats(),
    });
  });

  // Task #578: dedicated endpoint so the admin chart can request a
  // 7d / 14d / 30d window without re-fetching the entire retention stats blob.
  app.get(`${base}/retention/restore-log/daily-activity`, requireRootAdmin, async (req, res) => {
    const raw = req.query?.days;
    const parsed = raw == null || raw === "" ? DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS : Number(raw);
    if (!Number.isFinite(parsed)) {
      return res.status(400).json({ message: "invalid days" });
    }
    const days = Math.max(
      1,
      Math.min(MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS, Math.floor(parsed)),
    );
    res.json({
      days,
      maxDays: MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS,
      defaultDays: DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS,
      dailyActivity: await getRestoreLogDailyActivity(days),
    });
  });

  app.post(`${base}/retention/restore-log/rate-threshold`, requireRootAdmin, async (req, res) => {
    const parsed = z
      .object({ threshold: z.number().int().min(0).nullable() })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    const updatedBy =
      (req as any).user?.id || (req as any).session?.userId || "root_admin";
    const eff = await setRestoreLogRateThresholdOverride(parsed.data.threshold, updatedBy);
    res.json({ ...eff, rate: await getRestoreLogRateStats(), stats: await getRetentionStats() });
  });

  // Task #571: history of every save/clear of the restore-log rate
  // spike threshold. Surfaces in the Retention Mode card so admins can
  // audit who lowered/raised/disabled the alert and when.
  app.get(
    `${base}/retention/restore-log/rate-threshold/history`,
    requireRootAdmin,
    async (req, res) => {
      const raw = Number((req.query as any)?.limit);
      const limit = Number.isFinite(raw) && raw > 0 ? raw : 10;
      try {
        const entries = await getRestoreLogRateThresholdHistory(limit);
        res.json({ entries });
      } catch (e: any) {
        res.status(500).json({
          message: e?.message ?? "restore_log_rate_threshold_history_failed",
        });
      }
    },
  );

  // Task #618: notify-on-weakening toggle for the restore-log rate
  // spike threshold. Default ON; founders can opt out from the UI.
  app.get(
    `${base}/retention/restore-log/rate-threshold/notify-on-weakening`,
    requireRootAdmin,
    async (_req, res) => {
      res.json({ enabled: await isRestoreLogRateNotifyOnWeakeningEnabled() });
    },
  );
  app.post(
    `${base}/retention/restore-log/rate-threshold/notify-on-weakening`,
    requireRootAdmin,
    async (req, res) => {
      const parsed = z
        .object({ enabled: z.boolean() })
        .safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      const updatedBy =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      res.json(
        await setRestoreLogRateNotifyOnWeakeningEnabled(
          parsed.data.enabled,
          updatedBy,
        ),
      );
    },
  );

  // Task #677: persistent history of every weakening-email send attempt
  // fired from `maybeNotifyWeakening`. Lets founders verify the email
  // was actually attempted even when Resend silently swallows a message.
  app.get(
    `${base}/retention/restore-log/rate-threshold/weakening-history`,
    requireRootAdmin,
    async (req, res) => {
      const raw = Number((req.query as any)?.limit);
      const limit = Number.isFinite(raw) && raw > 0 ? raw : 10;
      try {
        const entries =
          await getRestoreLogRateWeakeningNotificationHistory(limit);
        res.json({ entries });
      } catch (e: any) {
        res.status(500).json({
          message:
            e?.message ?? "restore_log_rate_weakening_history_failed",
        });
      }
    },
  );

  // Task #676: notify-on-weakening toggle for the stale-rows backlog
  // thresholds. Default ON.
  app.get(
    `${base}/retention/stale-rows-threshold/notify-on-weakening`,
    requireRootAdmin,
    async (_req, res) => {
      res.json({ enabled: await isStaleRowsNotifyOnWeakeningEnabled() });
    },
  );
  app.post(
    `${base}/retention/stale-rows-threshold/notify-on-weakening`,
    requireRootAdmin,
    async (req, res) => {
      const parsed = z
        .object({ enabled: z.boolean() })
        .safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      const updatedBy =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      res.json(
        await setStaleRowsNotifyOnWeakeningEnabled(
          parsed.data.enabled,
          updatedBy,
        ),
      );
    },
  );

  // Task #676: notify-on-weakening toggle for the archive-deletion
  // notifier. Default ON.
  app.get(
    `${base}/retention/archive/deletion-notifier/notify-on-weakening`,
    requireRootAdmin,
    async (_req, res) => {
      res.json({ enabled: await isArchiveDeletionNotifyOnWeakeningEnabled() });
    },
  );
  app.post(
    `${base}/retention/archive/deletion-notifier/notify-on-weakening`,
    requireRootAdmin,
    async (req, res) => {
      const parsed = z
        .object({ enabled: z.boolean() })
        .safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      const updatedBy =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      res.json(
        await setArchiveDeletionNotifyOnWeakeningEnabled(
          parsed.data.enabled,
          updatedBy,
        ),
      );
    },
  );

  // Task #676: notify-on-weakening toggle for the audit-export
  // notifier. Default ON.
  app.get(
    `${base}/export-notifier/notify-on-weakening`,
    requireRootAdmin,
    async (_req, res) => {
      res.json({ enabled: await isAuditExportNotifyOnWeakeningEnabled() });
    },
  );
  app.post(
    `${base}/export-notifier/notify-on-weakening`,
    requireRootAdmin,
    async (req, res) => {
      const parsed = z
        .object({ enabled: z.boolean() })
        .safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      const updatedBy =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      res.json(
        await setAuditExportNotifyOnWeakeningEnabled(
          parsed.data.enabled,
          updatedBy,
        ),
      );
    },
  );

  // Task #635: gateway-event connector backfill status + manual re-run.
  app.get(
    `${base}/retention/connector-backfill`,
    requireRootAdmin,
    async (_req, res) => {
      const [status, currentNullCount] = await Promise.all([
        getGatewayEventConnectorBackfillStatus(),
        getGatewayEventConnectorCurrentNullCount(),
      ]);
      const { gatewayEventConnectorBackfillFailureThreshold } = await import(
        "../services/audience-gateway-event-connector-backfill-failure-alert-service"
      );
      const failureAlertThreshold =
        gatewayEventConnectorBackfillFailureThreshold();
      res.json({ status, currentNullCount, failureAlertThreshold });
    },
  );

  app.post(
    `${base}/retention/connector-backfill/run`,
    requireRootAdmin,
    async (req, res) => {
      const triggeredBy =
        String(
          (req as any).user?.id ||
            (req as any).session?.userId ||
            "root_admin",
        ) || null;
      const status = await runGatewayEventConnectorBackfill(
        "manual",
        triggeredBy,
      );
      const currentNullCount = await getGatewayEventConnectorCurrentNullCount();
      const { gatewayEventConnectorBackfillFailureThreshold } = await import(
        "../services/audience-gateway-event-connector-backfill-failure-alert-service"
      );
      const failureAlertThreshold =
        gatewayEventConnectorBackfillFailureThreshold();
      res
        .status(status.error ? 500 : 200)
        .json({ status, currentNullCount, failureAlertThreshold });
    },
  );

  // Task #681: read-only preview of a manual backfill so admins can
  // see matched / remaining counts in the Orphaned attribution card
  // before committing to a write. Does NOT touch the marker row.
  app.post(
    `${base}/retention/connector-backfill/dry-run`,
    requireRootAdmin,
    async (req, res) => {
      const triggeredBy =
        String(
          (req as any).user?.id ||
            (req as any).session?.userId ||
            "root_admin",
        ) || null;
      try {
        const result =
          await runGatewayEventConnectorBackfillDryRun(triggeredBy);
        res.json({ result });
      } catch (e: any) {
        res
          .status(500)
          .json({ message: e?.message ?? "dry_run_failed" });
      }
    },
  );

  // Task #694: founder-controlled snooze for the post-deploy gateway-event
  // connector backfill failure alert. Mirrors the existing audit-email
  // snooze routes — the live config + last N history rows live behind
  // the same shared helper.
  app.get(
    `${base}/retention/connector-backfill/alert-snooze`,
    requireRootAdmin,
    async (_req, res) => {
      const [snooze, history] = await Promise.all([
        getGatewayEventConnectorBackfillAlertSnooze(),
        listGatewayEventConnectorBackfillAlertSnoozeHistory(10),
      ]);
      res.json({ snooze, history });
    },
  );

  app.put(
    `${base}/retention/connector-backfill/alert-snooze`,
    requireRootAdmin,
    async (req, res) => {
      const parsed = z
        .object({ snoozeUntil: z.string().datetime().nullable() })
        .safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: "invalid input",
          errors: parsed.error.flatten(),
        });
      }
      const updatedBy =
        (req as any).user?.id ||
        (req as any).session?.userId ||
        "root_admin";
      try {
        const snooze = await setGatewayEventConnectorBackfillAlertSnooze({
          snoozeUntil: parsed.data.snoozeUntil,
          updatedBy,
        });
        const history =
          await listGatewayEventConnectorBackfillAlertSnoozeHistory(10);
        res.json({ snooze, history });
      } catch (e: any) {
        res
          .status(400)
          .json({ message: e?.message ?? "snooze_update_failed" });
      }
    },
  );

  app.post(`${base}/retention/override`, requireRootAdmin, async (req, res) => {
    const parsed = z
      .object({ retentionDays: z.number().int().positive().nullable() })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    const updatedBy =
      (req as any).user?.id || (req as any).session?.userId || "root_admin";
    const eff = await setRetentionOverride(parsed.data.retentionDays, updatedBy);
    res.json({ ...eff, stats: await getRetentionStats() });
  });

  // Task #468: stale-pending-archive backlog alert threshold.
  app.get(
    `${base}/retention/stale-rows-threshold`,
    requireRootAdmin,
    async (_req, res) => {
      res.json(await getEffectiveStaleRowsThresholds());
    },
  );

  app.put(
    `${base}/retention/stale-rows-threshold`,
    requireRootAdmin,
    async (req, res) => {
      const PerTable = z.number().int().min(0).optional();
      const Schema = z
        .object({
          override: z
            .object({
              messages: PerTable,
              decisions: PerTable,
              commands: PerTable,
              default: PerTable,
            })
            .nullable(),
        })
        .or(z.object({ override: z.null() }));
      const parsed = Schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      const updatedBy =
        (req as any).user?.id ||
        (req as any).session?.userId ||
        "root_admin";
      const raw = parsed.data.override;
      let cleaned: StaleRowsThresholdOverride | null = null;
      if (raw) {
        const out: StaleRowsThresholdOverride = {};
        for (const k of ["messages", "decisions", "commands", "default"] as const) {
          const v = raw[k];
          if (typeof v === "number") out[k] = v;
        }
        cleaned = Object.keys(out).length > 0 ? out : null;
      }
      const eff = await setStaleRowsThresholdOverride(cleaned, String(updatedBy));
      res.json(eff);
    },
  );

  // Task #512: plural-form aliases so admins can hit the canonical
  // `/stale-rows-thresholds` path documented in the dashboard task spec
  // without breaking the original `/stale-rows-threshold` route.
  app.get(
    `${base}/retention/stale-rows-thresholds`,
    requireRootAdmin,
    async (_req, res) => {
      res.json(await getEffectiveStaleRowsThresholds());
    },
  );

  app.put(
    `${base}/retention/stale-rows-thresholds`,
    requireRootAdmin,
    async (req, res) => {
      const PerTable = z.number().int().min(0).optional();
      const Schema = z
        .object({
          override: z
            .object({
              messages: PerTable,
              decisions: PerTable,
              commands: PerTable,
              default: PerTable,
            })
            .nullable(),
        })
        .or(z.object({ override: z.null() }));
      const parsed = Schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      const updatedBy =
        (req as any).user?.id ||
        (req as any).session?.userId ||
        "root_admin";
      const raw = parsed.data.override;
      let cleaned: StaleRowsThresholdOverride | null = null;
      if (raw) {
        const out: StaleRowsThresholdOverride = {};
        for (const k of ["messages", "decisions", "commands", "default"] as const) {
          const v = raw[k];
          if (typeof v === "number") out[k] = v;
        }
        cleaned = Object.keys(out).length > 0 ? out : null;
      }
      const eff = await setStaleRowsThresholdOverride(cleaned, String(updatedBy));
      res.json(eff);
    },
  );

  // Task #556: history of every save/clear of the stale-rows alert
  // thresholds. Surfaces in the Retention Mode card so admins can scroll
  // past who lowered/raised which threshold and when.
  app.get(
    `${base}/retention/stale-rows-thresholds/history`,
    requireRootAdmin,
    async (req, res) => {
      const raw = Number((req.query as any)?.limit);
      const limit = Number.isFinite(raw) && raw > 0 ? raw : 10;
      const q = (req.query as any) ?? {};
      const updatedByParam =
        typeof q.updatedBy === "string" && q.updatedBy.trim().length > 0
          ? q.updatedBy.trim()
          : null;
      const fromParam =
        typeof q.from === "string" && q.from.trim().length > 0
          ? q.from.trim()
          : null;
      const toParam =
        typeof q.to === "string" && q.to.trim().length > 0 ? q.to.trim() : null;
      try {
        const entries = await getStaleRowsThresholdHistory(limit, {
          updatedBy: updatedByParam,
          fromDate: fromParam,
          toDate: toParam,
        });
        res.json({ entries });
      } catch (e: any) {
        res
          .status(500)
          .json({ message: e?.message ?? "stale_rows_threshold_history_failed" });
      }
    },
  );

  // Task #606: export the full stale-rows threshold history as CSV so
  // compliance reviewers can attach the complete audit trail to
  // post-incident write-ups instead of just the last 10 rows visible
  // in the Retention Mode card.
  //
  // Task #882 — also accepts an optional `timeZone` query parameter
  // (IANA name, e.g. `America/Los_Angeles`). When supplied and valid,
  // each row carries a `changed_at_local` column rendered in that zone
  // and a constant `time_zone` column, alongside the raw UTC ISO
  // `occurredAt`. The zone is recorded in the filename suffix so the
  // export is self-describing. Invalid/unknown zones fall back to UTC.
  app.get(
    `${base}/retention/stale-rows-thresholds/history.csv`,
    requireRootAdmin,
    async (req, res) => {
      try {
        const q = (req.query ?? {}) as Record<string, unknown>;
        const updatedByParam =
          typeof q.updatedBy === "string" && q.updatedBy.trim().length > 0
            ? q.updatedBy.trim()
            : null;
        const fromParam =
          typeof q.from === "string" && q.from.trim().length > 0
            ? q.from.trim()
            : null;
        const toParam =
          typeof q.to === "string" && q.to.trim().length > 0
            ? q.to.trim()
            : null;
        const requestedTz =
          typeof q.timeZone === "string" && q.timeZone.trim().length > 0
            ? q.timeZone.trim()
            : null;
        let tzFormatter: Intl.DateTimeFormat | null = null;
        let resolvedTz = "UTC";
        if (requestedTz) {
          try {
            tzFormatter = new Intl.DateTimeFormat("en-CA", {
              timeZone: requestedTz,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            });
            resolvedTz = requestedTz;
          } catch {
            tzFormatter = null;
            resolvedTz = "UTC";
          }
        }
        const formatLocal = (iso: string | null): string => {
          if (!iso) return "";
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return "";
          if (!tzFormatter) {
            return iso.replace("T", " ").replace(/\.\d+Z$/, "Z").replace("Z", "");
          }
          const parts = tzFormatter.formatToParts(d);
          const get = (t: string) =>
            parts.find((p) => p.type === t)?.value ?? "";
          const hour = get("hour") === "24" ? "00" : get("hour");
          return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get(
            "minute",
          )}:${get("second")}`;
        };
        const entries = await getAllStaleRowsThresholdHistory({
          updatedBy: updatedByParam,
          fromDate: fromParam,
          toDate: toParam,
        });
        const csvEscape = (v: unknown): string => {
          if (v === null || v === undefined) return "";
          const s =
            typeof v === "string"
              ? v
              : typeof v === "object"
                ? JSON.stringify(v)
                : String(v);
          if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };
        const headers = [
          "occurredAt",
          "changed_at_local",
          "time_zone",
          "updatedBy",
          "priorOverride",
          "newOverride",
        ];
        const lines: string[] = [];
        lines.push(headers.join(","));
        for (const e of entries) {
          lines.push(
            [
              csvEscape(e.occurredAt),
              csvEscape(formatLocal(e.occurredAt)),
              csvEscape(resolvedTz),
              csvEscape(e.updatedBy ?? ""),
              csvEscape(e.priorOverride),
              csvEscape(e.newOverride),
            ].join(","),
          );
        }
        const csv = lines.join("\r\n") + "\r\n";
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const tzSlug = resolvedTz.replace(/[^A-Za-z0-9._-]+/g, "_");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="stale-rows-thresholds-history-${stamp}-${tzSlug}.csv"`,
        );
        res.setHeader(
          "X-Audit-Export",
          "audience-stale-rows-threshold-history",
        );
        res.setHeader("X-Export-Time-Zone", resolvedTz);
        return res.send(csv);
      } catch (e: any) {
        return res
          .status(500)
          .json({
            message: e?.message ?? "stale_rows_threshold_history_csv_failed",
          });
      }
    },
  );

  // Task #511: one-click acknowledge for the open stale-rows backlog
  // alert. Lets ops dismiss a known/triaged backlog from the Retention
  // Mode card without leaving the audience dashboard.
  app.post(
    `${base}/retention/stale-rows-alert/acknowledge`,
    requireRootAdmin,
    async (req, res) => {
      try {
        const actor =
          (req as any).user?.id ||
          (req as any).session?.userId ||
          "root_admin";
        const acknowledged =
          await audienceRetentionStaleRowsAlertService.acknowledgeOpenAlerts(
            String(actor),
          );
        res.json({ acknowledged, stats: await getRetentionStats() });
      } catch (e: any) {
        res
          .status(500)
          .json({ message: e?.message ?? "stale_rows_alert_acknowledge_failed" });
      }
    },
  );

  app.get(
    `${base}/retention/archive/trash/stats`,
    requireRootAdmin,
    async (_req, res) => {
      try {
        const stats = await getArchiveTrashStats();
        res.json({ stats });
      } catch (e: any) {
        res.status(500).json({ message: e?.message ?? "trash_stats_failed" });
      }
    },
  );

  app.get(`${base}/retention/archive/policy`, requireRootAdmin, async (_req, res) => {
    try {
      const [withSource, stats] = await Promise.all([
        getEffectiveArchiveRetentionPolicyWithSource(),
        getArchiveStats(),
      ]);
      res.json({
        policy: withSource.policy,
        stats,
        retentionDaysSource: withSource.retentionDaysSource,
        retentionDaysEnvFallback: withSource.retentionDaysEnvFallback,
      });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "policy_failed" });
    }
  });

  app.post(`${base}/retention/archive/policy`, requireRootAdmin, async (req, res) => {
    const Schema = z
      .object({
        retentionDays: z.number().int().positive().optional(),
        autoDeleteEnabled: z.boolean().optional(),
        trashGraceDays: z.number().int().positive().optional(),
        trashWarnFileCount: z.number().int().min(0).optional(),
        trashWarnBytes: z.number().int().min(0).optional(),
      })
      .refine(
        (v) =>
          v.retentionDays !== undefined ||
          v.autoDeleteEnabled !== undefined ||
          v.trashGraceDays !== undefined ||
          v.trashWarnFileCount !== undefined ||
          v.trashWarnBytes !== undefined,
        {
          message:
            "must provide retentionDays, autoDeleteEnabled, trashGraceDays, trashWarnFileCount or trashWarnBytes",
        },
      );
    const parsed = Schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    const updatedBy =
      (req as any).user?.id || (req as any).session?.userId || "root_admin";
    try {
      const policy = await setArchiveRetentionPolicy(parsed.data, updatedBy);
      res.json({ policy, stats: await getArchiveStats() });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "policy_save_failed" });
    }
  });

  app.post(`${base}/retention/archive/cleanup`, requireRootAdmin, async (req, res) => {
    const Schema = z.object({
      dryRun: z.boolean().optional(),
      retentionDays: z.number().int().positive().optional(),
      forceWhenDisabled: z.boolean().optional(),
    });
    const parsed = Schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    const actor =
      (req as any).user?.id || (req as any).session?.userId || "root_admin";
    try {
      const result = await runArchiveCleanup({
        trigger: "manual",
        dryRun: parsed.data.dryRun ?? false,
        retentionDaysArg: parsed.data.retentionDays,
        forceWhenDisabled: parsed.data.forceWhenDisabled ?? false,
        actor,
      });
      res.json({ result, stats: await getArchiveStats() });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "cleanup_failed" });
    }
  });

  app.get(
    `${base}/retention/archive/deletion-notifier`,
    requireRootAdmin,
    async (_req, res) => {
      const config = await getAudienceArchiveDeletionNotifierConfig();
      res.json({ config });
    },
  );

  app.put(
    `${base}/retention/archive/deletion-notifier`,
    requireRootAdmin,
    async (req, res) => {
      const parsed = ArchiveDeletionNotifierUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const config = await setAudienceArchiveDeletionNotifierConfig({
          enabled: parsed.data.enabled,
          recipients: parsed.data.recipients,
          warningLeadDays: parsed.data.warningLeadDays,
          digestIntervalHours: parsed.data.digestIntervalHours,
          postCleanupFileThreshold: parsed.data.postCleanupFileThreshold,
          postCleanupBytesThreshold: parsed.data.postCleanupBytesThreshold,
          updatedBy,
        });
        res.json({ config });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "save_failed" });
      }
    },
  );

  app.get(
    `${base}/retention/archive/deletion-notifier/history`,
    requireRootAdmin,
    async (req, res) => {
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
      res.json({ history: getAudienceArchiveDeletionNotifierHistory(limit) });
    },
  );

  app.post(
    `${base}/retention/archive/deletion-notifier/test`,
    requireRootAdmin,
    async (_req, res) => {
      try {
        const result = await sendTestArchiveDeletionEmail();
        const status = result.ok ? 200 : 500;
        res.status(status).json(result);
      } catch (e: any) {
        const msg = e?.message ?? "test_failed";
        const status = msg === "no_recipients_configured" ? 400 : 500;
        res.status(status).json({ message: msg });
      }
    },
  );

  // Task #474 — snooze deletion alerts for a planned window without
  // losing recipients, thresholds, or dedup state. Pass `snoozeUntil`
  // as an ISO timestamp in the future, or `null` to clear (unsnooze).
  app.post(
    `${base}/retention/archive/deletion-notifier/snooze`,
    requireRootAdmin,
    async (req, res) => {
      // Task #516 — `snoozePolicy` (optional) lets the founder opt
      // into auto-extending or recurring weekday mutes alongside the
      // existing fixed window. Pass `null` to clear the policy back
      // to the fixed default.
      const SnoozePolicySchema = z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("fixed") }),
        z.object({
          kind: z.literal("auto_extend"),
          extendDays: z.number().int().min(1).max(30),
        }),
        z.object({
          kind: z.literal("weekday_mute"),
          days: z.array(z.number().int().min(0).max(6)).min(1),
          startHour: z.number().int().min(0).max(23),
          endHour: z.number().int().min(0).max(23),
          // Task #615 — optional IANA time zone. Service-level
          // `parseSnoozePolicy` validates and drops unknown zones,
          // but accept it at the schema level so the round-trip
          // preserves the founder's choice end-to-end.
          timeZone: z.string().min(1).max(64).optional(),
        }),
      ]);
      const Schema = z.object({
        snoozeUntil: z.string().datetime().nullable(),
        snoozePolicy: SnoozePolicySchema.nullable().optional(),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const config = await setAudienceArchiveDeletionNotifierSnooze({
          snoozeUntil: parsed.data.snoozeUntil,
          snoozePolicy: parsed.data.snoozePolicy ?? undefined,
          updatedBy,
        });
        res.json({ config });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "snooze_failed" });
      }
    },
  );

  // Task #552 — send a one-off preview of the upcoming-expiry digest
  // (subject + body) with the CURRENT nextExpiryBatch numbers so the
  // founder can confirm formatting in their inbox without waiting for
  // the scheduler tick. Does NOT update lastDigestAt / dedup state.
  app.post(
    `${base}/retention/archive/deletion-notifier/test-digest`,
    requireRootAdmin,
    async (req, res) => {
      try {
        const triggeredBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const result = await sendTestArchiveExpiryDigestEmail({ triggeredBy });
        const status = result.ok ? 200 : 500;
        res.status(status).json(result);
      } catch (e: any) {
        const msg = e?.message ?? "test_digest_failed";
        const status = msg === "no_recipients_configured" ? 400 : 500;
        res.status(status).json({ message: msg });
      }
    },
  );

  app.post(
    `${base}/retention/archive/deletion-notifier/run-digest`,
    requireRootAdmin,
    async (req, res) => {
      try {
        const triggeredBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const result = await runUpcomingExpiryDigest({ triggeredBy });
        res.json({ result });
      } catch (e: any) {
        res.status(500).json({ message: e?.message ?? "digest_failed" });
      }
    },
  );

  // Task #612 — manually re-send the recap email for the most recently
  // recapped snooze window using the persisted counters from the
  // snooze-log row. Useful when the auto-fired recap was lost
  // (bounced, deleted, marked as spam). Does not touch dedup state.
  app.post(
    `${base}/retention/archive/deletion-notifier/resend-recap`,
    requireRootAdmin,
    async (req, res) => {
      try {
        const triggeredBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const result = await resendLastSnoozeRecap({ triggeredBy });
        const status = result.recapSent ? 200 : result.reason === "send_failed" ? 500 : 400;
        res.status(status).json({ result });
      } catch (e: any) {
        res.status(500).json({ message: e?.message ?? "resend_failed" });
      }
    },
  );

  // Task #562 — persistent history of past snooze windows + what each
  // one swallowed. Read-only; does not affect the live snooze state.
  app.get(
    `${base}/retention/archive/deletion-notifier/snooze-log`,
    requireRootAdmin,
    async (req, res) => {
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
      const entries = await listAudienceArchiveDeletionSnoozeLog(limit);
      res.json({ entries });
    },
  );

  // Task #568 — recycle-bin storage alert (proactive email when
  // `getArchiveTrashStats().trashFileCountExceeded` or `trashBytesExceeded`).
  app.get(
    `${base}/retention/archive/trash-bin-notifier`,
    requireRootAdmin,
    async (_req, res) => {
      const config = await getAudienceArchiveTrashBinNotifierConfig();
      res.json({ config });
    },
  );

  app.put(
    `${base}/retention/archive/trash-bin-notifier`,
    requireRootAdmin,
    async (req, res) => {
      const parsed = ArchiveTrashBinNotifierUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const config = await setAudienceArchiveTrashBinNotifierConfig({
          enabled: parsed.data.enabled,
          recipients: parsed.data.recipients,
          alertIntervalHours: parsed.data.alertIntervalHours,
          updatedBy,
        });
        res.json({ config });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "save_failed" });
      }
    },
  );

  app.get(
    `${base}/retention/archive/trash-bin-notifier/history`,
    requireRootAdmin,
    async (req, res) => {
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
      res.json({ history: getAudienceArchiveTrashBinNotifierHistory(limit) });
    },
  );

  app.post(
    `${base}/retention/archive/trash-bin-notifier/snooze`,
    requireRootAdmin,
    async (req, res) => {
      const Schema = z.object({
        snoozeUntil: z.string().datetime().nullable(),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "invalid input", errors: parsed.error.flatten() });
      }
      try {
        const updatedBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const config = await setAudienceArchiveTrashBinNotifierSnooze({
          snoozeUntil: parsed.data.snoozeUntil,
          updatedBy,
        });
        res.json({ config });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "snooze_failed" });
      }
    },
  );

  app.post(
    `${base}/retention/archive/trash-bin-notifier/test`,
    requireRootAdmin,
    async (_req, res) => {
      try {
        const result = await sendTestTrashBinAlertEmail();
        const status = result.ok ? 200 : 500;
        res.status(status).json(result);
      } catch (e: any) {
        const msg = e?.message ?? "test_failed";
        const status = msg === "no_recipients_configured" ? 400 : 500;
        res.status(status).json({ message: msg });
      }
    },
  );

  app.post(
    `${base}/retention/archive/trash-bin-notifier/run`,
    requireRootAdmin,
    async (req, res) => {
      try {
        const triggeredBy =
          (req as any).user?.id || (req as any).session?.userId || "root_admin";
        const result = await runTrashBinAlert({ triggeredBy });
        res.json({ result });
      } catch (e: any) {
        res.status(500).json({ message: e?.message ?? "alert_failed" });
      }
    },
  );

  app.get(`${base}/retention/archive/deletions`, requireRootAdmin, async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const rows = await listArchiveDeletions(limit);
    res.json({ deletions: rows, limit });
  });

  // Task #439: restore an accidentally soft-deleted archive file from
  // its `.trash/<deletionId>/` location back to its original audience
  // archive path. Only valid while the file is still in trash (i.e. the
  // grace-window purge sweep hasn't hard-deleted it yet).
  app.post(
    `${base}/retention/archive/deletions/:deletionId/restore`,
    requireRootAdmin,
    async (req, res) => {
      const deletionId = String(req.params.deletionId || "").trim();
      if (!deletionId) {
        return res.status(400).json({ message: "deletionId required" });
      }
      const restoredBy =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      try {
        const result = await restoreFromTrashDeletion(deletionId, restoredBy);
        res.json({ result });
      } catch (e: any) {
        const msg = e?.message ?? "restore_failed";
        const status =
          msg === "deletion_not_found"
            ? 404
            : msg === "not_restorable_legacy_hard_delete" || msg === "already_purged_from_trash"
              ? 409
              : msg === "not_found"
                ? 410
                : 500;
        res.status(status).json({ message: msg });
      }
    },
  );

  // Task #439: manually trigger the trash purge sweep (hard-delete trash
  // entries past their grace window). Mainly useful for ops drills /
  // tests; the scheduled tick runs this on the same cadence as cleanup.
  app.post(`${base}/retention/archive/trash/purge`, requireRootAdmin, async (req, res) => {
    // Task #514: allow `graceDays: 0` so the "Empty trash" CTA in the
    // recycle-bin too-large warning can purge every soft-deleted file
    // regardless of the configured grace window.
    const Schema = z.object({
      graceDays: z.number().int().nonnegative().optional(),
    });
    const parsed = Schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    // Task #557 — capture the actor (admin email when resolvable, else
    // role tag) so the recycle-bin purge history can show who triggered
    // each manual clear.
    let actor: string | null = null;
    try {
      actor = await resolveAdminEmail(req);
    } catch {
      actor = null;
    }
    if (!actor) {
      actor =
        (req as any).user?.id ||
        (req as any).session?.userId ||
        (req as any).session?.adminActorId ||
        "root_admin";
    }
    try {
      const result = await runArchiveTrashPurge({
        trigger: "manual",
        graceDaysArg: parsed.data.graceDays,
        actor,
      });
      res.json({ result });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "purge_failed" });
    }
  });

  // Task #557 — recent recycle-bin purge history for the admin Archive
  // Retention card. Returns the last N audit rows newest-first.
  app.get(
    `${base}/retention/archive/trash/purges`,
    requireRootAdmin,
    async (req, res) => {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
      try {
        const purges = await listArchiveTrashPurges(limit);
        res.json({ purges, limit });
      } catch (e: any) {
        res
          .status(500)
          .json({ message: e?.message ?? "trash_purges_history_failed" });
      }
    },
  );

  app.get(`${base}/retention/archive/files`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      table: z.enum(["messages", "decisions", "commands"]).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(200).default(50),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    try {
      let files = await listAudienceArchiveFiles();
      if (parsed.data.table) {
        files = files.filter((f) => f.table === parsed.data.table);
      }
      files.sort((a, b) => {
        const av = a.updatedAt ?? a.sweepStartedAt ?? "";
        const bv = b.updatedAt ?? b.sweepStartedAt ?? "";
        if (av < bv) return 1;
        if (av > bv) return -1;
        return 0;
      });
      const total = files.length;
      const { page, pageSize } = parsed.data;
      const start = (page - 1) * pageSize;
      const items = files.slice(start, start + pageSize);
      res.json({ files: items, total, page, pageSize });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "list_failed" });
    }
  });

  app.get(`${base}/retention/archive/download`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({ path: z.string().min(1) });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const requested = parsed.data.path;
    if (
      !requested.includes("/audience-archive/") ||
      requested.includes("..") ||
      requested.includes("\0")
    ) {
      return res.status(400).json({ message: "path must be a file under audience-archive/" });
    }
    try {
      const opened = await openAudienceArchiveStream(requested);
      res.setHeader("Content-Type", opened.contentType);
      if (opened.bytes != null) res.setHeader("Content-Length", String(opened.bytes));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${opened.filename}"`,
      );
      res.setHeader("X-Audit-Export", "audience-archive");
      opened.stream.on("error", (err) => {
        if (!res.headersSent) {
          res.status(500).json({ message: (err as Error).message });
        } else {
          res.end();
        }
      });
      opened.stream.pipe(res);
    } catch (e: any) {
      const msg = e?.message ?? "download_failed";
      const status = msg === "not_found" ? 404 : msg === "invalid_path" ? 400 : 500;
      res.status(status).json({ message: msg });
    }
  });

  app.get(`${base}/retention/archive/preview`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      path: z.string().min(1),
      limit: z.coerce.number().int().positive().max(500).default(50),
      offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
      q: z.string().max(500).optional(),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const requested = parsed.data.path;
    if (
      !requested.includes("/audience-archive/") ||
      requested.includes("..") ||
      requested.includes("\0")
    ) {
      return res.status(400).json({ message: "path must be a file under audience-archive/" });
    }
    try {
      const q = parsed.data.q?.trim();
      const preview = await previewAudienceArchive(
        requested,
        parsed.data.limit,
        q && q.length > 0
          ? { query: q }
          : { offset: parsed.data.offset },
      );
      res.json(preview);
    } catch (e: any) {
      const msg = e?.message ?? "preview_failed";
      const status = msg === "not_found" ? 404 : msg === "invalid_path" ? 400 : 500;
      res.status(status).json({ message: msg });
    }
  });

  // Task #484 — stream CSV of every whole-file search match. Audited via
  // recordAuditExport so the download itself ends up in the audit-export
  // history and the notifier email pipeline.
  app.get(`${base}/retention/archive/search-export.csv`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({
      path: z.string().min(1),
      q: z.string().trim().min(1).max(500),
    });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const requested = parsed.data.path;
    if (
      !requested.includes("/audience-archive/") ||
      requested.includes("..") ||
      requested.includes("\0")
    ) {
      return res.status(400).json({ message: "path must be a file under audience-archive/" });
    }
    const filename = `${(requested.split("/").pop() ?? "archive").replace(/\.jsonl\.gz$/, "")}-matches.csv`;
    let headerSent = false;
    try {
      const writeRow = async (csvLine: string) => {
        if (!headerSent) {
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          res.setHeader("X-Audit-Export", "audience-archive-search");
          res.write("line_number,payload\n");
          headerSent = true;
        }
        if (!res.write(csvLine)) {
          await new Promise<void>((resolve) => res.once("drain", () => resolve()));
        }
      };
      const result = await streamAudienceArchiveSearchMatchesCsv(
        requested,
        parsed.data.q,
        writeRow,
      );
      if (!headerSent) {
        // Zero matches — still send a valid (header-only) CSV + audit.
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("X-Audit-Export", "audience-archive-search");
        res.write("line_number,payload\n");
        headerSent = true;
      }
      try {
        const admin = getAdminVerification(req);
        const auditLog = await omniChannelAudienceSafetyService.recordAuditExport({
          actorId: admin?.actor.id ?? "unknown",
          actorType: admin?.actor.type ?? "unknown",
          actorRole: admin?.role ?? null,
          format: "csv",
          filters: {
            fromDate: null,
            toDate: null,
            platform: null,
            productionId: `archive-search:${requested}?q=${result.query}`,
          },
          rowCounts: {
            connectors: 0,
            messages: 0,
            decisions: 0,
            commands: result.totalMatches,
          },
        });
        res.setHeader("X-Audit-Export-Id", auditLog.exportId);
        res.setHeader("X-Audit-Match-Count", String(result.totalMatches));
        res.setHeader("X-Audit-Scanned-Count", String(result.totalScanned));
      } catch (err) {
        // Audit write must not break the download; surface in server logs.
        console.error("[audience-archive-search-export] audit log failed:", err);
      }
      res.end();
    } catch (e: any) {
      const msg = e?.message ?? "search_export_failed";
      if (!headerSent) {
        const status =
          msg === "not_found"
            ? 404
            : msg === "invalid_path" || msg === "query_required"
              ? 400
              : 500;
        return res.status(status).json({ message: msg });
      }
      res.end();
    }
  });

  app.get(`${base}/retention/archive/count`, requireRootAdmin, async (req, res) => {
    const QuerySchema = z.object({ path: z.string().min(1) });
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid query", errors: parsed.error.flatten() });
    }
    const requested = parsed.data.path;
    if (
      !requested.includes("/audience-archive/") ||
      requested.includes("..") ||
      requested.includes("\0")
    ) {
      return res.status(400).json({ message: "path must be a file under audience-archive/" });
    }
    try {
      const result = await countAudienceArchiveRows(requested);
      res.json(result);
    } catch (e: any) {
      const msg = e?.message ?? "count_failed";
      const status = msg === "not_found" ? 404 : msg === "invalid_path" ? 400 : 500;
      res.status(status).json({ message: msg });
    }
  });

  app.get(`${base}/:productionId/history`, requireRootAdmin, async (req, res) => {
    res.json({
      messages: await omniChannelAudienceSafetyService.listMessages(String(req.params.productionId), 200),
      decisions: await omniChannelAudienceSafetyService.listDecisions(String(req.params.productionId), 200),
      // Task #689 — enrich each command with a resolved admin identity
      // for `requestedBy` so the "issued by" column on the simulated
      // moderation commands panel shows "Display Name (email)" instead
      // of a raw uuid. Mirrors Task #672's pattern for the four audit
      // panels.
      commands: await omniChannelAudienceSafetyService.listCommandsWithActorIdentities(200),
      platformSendAllowed: false,
    });
  });
}
