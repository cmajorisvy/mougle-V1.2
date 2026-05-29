/**
 * Task #541 — pure-helper coverage for every save card in
 * client/src/pages/admin/OmniChannelAudience.tsx.
 *
 * For each helper we assert (a) the happy-path payload parses cleanly
 * through a Zod schema mirroring the matching server upsert validator
 * in server/routes/omni-channel-audience-routes.ts and (b) at least one
 * out-of-bounds form state throws the EXACT error message surfaced
 * inline by the card AND that a tracked apiRequest mock is NOT called
 * — proving the PUT is skipped when validation fails.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import {
  ARCHIVE_DELETION_NOTIFIER_ERRORS,
  COMPLIANCE_EMAIL_SCHEDULE_ERRORS,
  CONNECTOR_ROTATION_NOTIFIER_ERRORS,
  EXPORT_NOTIFIER_ERRORS,
  HISTORY_EMAIL_FAILURE_THRESHOLD_ERRORS,
  HISTORY_EMAIL_SCHEDULE_ERRORS,
  RISK_SIGNAL_RULES_ERRORS,
  STALE_ROWS_THRESHOLDS_ERRORS,
  LEGACY_TOKEN_DISPATCH_ALERT_ERRORS,
  GATEWAY_BLOCK_ALERT_SETTINGS_ERRORS,
  ARCHIVE_RETENTION_POLICY_ERRORS,
  RETENTION_DAYS_ERRORS,
  buildArchiveDeletionNotifierPayload,
  buildComplianceEmailSchedulePayload,
  buildConnectorRotationNotifierPayload,
  buildExportNotifierPayload,
  buildHistoryEmailFailureThresholdPayload,
  buildHistoryEmailSchedulePayload,
  buildRiskSignalRulesPayload,
  buildStaleRowsThresholdsPayload,
  buildLegacyTokenDispatchAlertPayload,
  buildGatewayBlockAlertSettingsPayload,
  buildArchiveRetentionPolicyFieldPayload,
  buildRetentionDaysPayload,
  buildOptionalRetentionDaysPayload,
  type GatewayBlockAlertSettingsLimits,
} from "../client/src/pages/admin/omni-channel-audience-forms";

// --- shared Zod mirrors of the server upsert schemas -----------------------

const CadenceSchema = z.enum(["daily", "weekly", "monthly"]);

const EmailScheduleServerSchema = z.object({
  enabled: z.boolean(),
  cadence: CadenceSchema,
  recipients: z.array(z.string().email()).max(20),
  platform: z.string().min(1).nullable().optional(),
  productionId: z.string().min(1).nullable().optional(),
});

const ConnectorRotationServerSchema = z.object({
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
    .max(7 * 24 * 60 * 60 * 1000)
    .nullable()
    .optional(),
});

const ExportNotifierServerSchema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string().email()).max(20),
  minRowCount: z.number().int().min(0).max(10_000_000).default(0),
  suppressedActorIds: z.array(z.string().min(1)).max(50).optional(),
});

const RiskSignalRulesServerSchema = z.object({
  wideDateWindowDays: z.number().int().min(1).max(3650),
  loudSignals: z.array(z.string()).max(20),
  mutedSignals: z.array(z.string()).max(20),
});

const ArchiveDeletionNotifierServerSchema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string().email()).max(20),
  warningLeadDays: z.number().int().min(1).max(365).optional(),
  digestIntervalHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .optional(),
  postCleanupFileThreshold: z.number().int().min(0).max(1_000_000).optional(),
  postCleanupBytesThreshold: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});

const HistoryEmailServerSchema = z.object({
  enabled: z.boolean(),
  cadence: CadenceSchema,
  recipients: z.array(z.string().email()).max(20),
});

// Mirrors the inline schema at /retention/stale-rows-thresholds
const StaleRowsServerSchema = z.object({
  override: z
    .object({
      default: z.number().int().min(0).optional(),
      messages: z.number().int().min(0).optional(),
      decisions: z.number().int().min(0).optional(),
      commands: z.number().int().min(0).optional(),
    })
    .refine((o) => Object.keys(o).length > 0, "at least one threshold"),
});

const FailureThresholdServerSchema = z.object({
  value: z.number().int().min(1).max(50).nullable(),
});

// --- shared apiRequest mock harness ----------------------------------------

interface Call {
  method: string;
  url: string;
  body?: unknown;
}
function makeApi() {
  const calls: Call[] = [];
  const apiRequest = async (method: string, url: string, body?: unknown) => {
    calls.push({ method, url, body });
    return { ok: true } as any;
  };
  return { calls, apiRequest };
}

/**
 * Tiny wrapper that mimics the mutationFn pattern in each card:
 * call the helper, then PUT. If the helper throws, the PUT is skipped.
 */
async function runMutation<P>(
  api: ReturnType<typeof makeApi>,
  url: string,
  build: () => P,
): Promise<{ thrown?: Error; payload?: P }> {
  try {
    const payload = build();
    await api.apiRequest("PUT", url, payload);
    return { payload };
  } catch (e) {
    return { thrown: e as Error };
  }
}

// --- 1. ComplianceEmailSchedule -------------------------------------------

test("compliance email schedule — happy payload matches server schema", () => {
  const payload = buildComplianceEmailSchedulePayload({
    enabled: true,
    cadence: "weekly",
    recipientsText: "a@x.com, b@x.com\nc@x.com",
    platform: "youtube",
    productionIdFilter: "",
  });
  assert.deepEqual(payload.recipients, ["a@x.com", "b@x.com", "c@x.com"]);
  assert.equal(payload.productionId, null);
  EmailScheduleServerSchema.parse(payload);
});

test("compliance email schedule — too many recipients throws + skips PUT", async () => {
  const api = makeApi();
  const recipientsText = Array.from({ length: 21 }, (_, i) => `u${i}@x.com`).join(",");
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/email-schedule",
    () =>
      buildComplianceEmailSchedulePayload({
        enabled: true,
        cadence: "weekly",
        recipientsText,
        platform: "",
        productionIdFilter: "",
      }),
  );
  assert.equal(thrown?.message, COMPLIANCE_EMAIL_SCHEDULE_ERRORS.recipientsTooMany);
  assert.equal(api.calls.length, 0);
});

// --- 2. ConnectorRotationNotifier -----------------------------------------

test("connector rotation notifier — happy payload matches server schema", () => {
  const payload = buildConnectorRotationNotifierPayload({
    enabled: true,
    recipientsText: "ops@x.com",
    suppressSet: true,
    suppressRotate: false,
    suppressDelete: true,
  });
  assert.deepEqual(payload.suppressedActions, ["set", "delete"]);
  ConnectorRotationServerSchema.parse(payload);
});

test("connector rotation notifier — too many recipients throws + skips PUT", async () => {
  const api = makeApi();
  const recipientsText = Array.from({ length: 21 }, (_, i) => `u${i}@x.com`).join(" ");
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/connector-rotation-notifier",
    () =>
      buildConnectorRotationNotifierPayload({
        enabled: false,
        recipientsText,
        suppressSet: false,
        suppressRotate: false,
        suppressDelete: false,
      }),
  );
  assert.equal(thrown?.message, CONNECTOR_ROTATION_NOTIFIER_ERRORS.recipientsTooMany);
  assert.equal(api.calls.length, 0);
});

// --- 3. ExportNotifier -----------------------------------------------------

test("export notifier — happy payload matches server schema", () => {
  const payload = buildExportNotifierPayload({
    enabled: true,
    recipientsText: "sec@x.com",
    minRowCountText: "100",
    suppressedText: "founder-1, founder-2",
  });
  assert.equal(payload.minRowCount, 100);
  assert.deepEqual(payload.suppressedActorIds, ["founder-1", "founder-2"]);
  ExportNotifierServerSchema.parse(payload);
});

test("export notifier — minRowCount above 10M throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/export-notifier",
    () =>
      buildExportNotifierPayload({
        enabled: true,
        recipientsText: "sec@x.com",
        minRowCountText: "10000001",
        suppressedText: "",
      }),
  );
  assert.equal(thrown?.message, EXPORT_NOTIFIER_ERRORS.minRowCount);
  assert.equal(api.calls.length, 0);
});

test("export notifier — too many suppressed actor IDs throws + skips PUT", async () => {
  const api = makeApi();
  const suppressedText = Array.from({ length: 51 }, (_, i) => `id-${i}`).join(",");
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/export-notifier",
    () =>
      buildExportNotifierPayload({
        enabled: true,
        recipientsText: "sec@x.com",
        minRowCountText: "0",
        suppressedText,
      }),
  );
  assert.equal(thrown?.message, EXPORT_NOTIFIER_ERRORS.suppressedTooMany);
  assert.equal(api.calls.length, 0);
});

// --- 4. RiskSignalRules ----------------------------------------------------

test("risk signal rules — happy payload matches server schema", () => {
  const payload = buildRiskSignalRulesPayload<string>({
    daysInput: "60",
    loud: ["high_volume_export"],
    muted: [],
    bounds: { minWideDateWindowDays: 1, maxWideDateWindowDays: 3650 },
  });
  assert.equal(payload.wideDateWindowDays, 60);
  RiskSignalRulesServerSchema.parse(payload);
});

test("risk signal rules — out-of-bounds days throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/risk-signal-rules",
    () =>
      buildRiskSignalRulesPayload<string>({
        daysInput: "9999",
        loud: [],
        muted: [],
        bounds: { minWideDateWindowDays: 1, maxWideDateWindowDays: 3650 },
      }),
  );
  assert.equal(
    thrown?.message,
    RISK_SIGNAL_RULES_ERRORS.wideDateWindowDays(1, 3650),
  );
  assert.equal(api.calls.length, 0);
});

// --- 5. ArchiveDeletionNotifier -------------------------------------------

test("archive deletion notifier — happy payload matches server schema", () => {
  const payload = buildArchiveDeletionNotifierPayload({
    enabled: true,
    recipientsText: "ops@x.com",
    warningLeadDaysText: "7",
    digestHoursText: "24",
    fileThresholdText: "10",
    mbThresholdText: "5",
  });
  assert.equal(payload.warningLeadDays, 7);
  assert.equal(payload.digestIntervalHours, 24);
  assert.equal(payload.postCleanupFileThreshold, 10);
  assert.equal(payload.postCleanupBytesThreshold, 5 * 1024 * 1024);
  ArchiveDeletionNotifierServerSchema.parse(payload);
});

test("archive deletion notifier — warningLeadDays > 365 throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/retention/archive/deletion-notifier",
    () =>
      buildArchiveDeletionNotifierPayload({
        enabled: true,
        recipientsText: "ops@x.com",
        warningLeadDaysText: "400",
        digestHoursText: "24",
        fileThresholdText: "0",
        mbThresholdText: "0",
      }),
  );
  assert.equal(thrown?.message, ARCHIVE_DELETION_NOTIFIER_ERRORS.warningLeadDays);
  assert.equal(api.calls.length, 0);
});

test("archive deletion notifier — digestIntervalHours > 720 throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/retention/archive/deletion-notifier",
    () =>
      buildArchiveDeletionNotifierPayload({
        enabled: true,
        recipientsText: "ops@x.com",
        warningLeadDaysText: "7",
        digestHoursText: "10000",
        fileThresholdText: "0",
        mbThresholdText: "0",
      }),
  );
  assert.equal(
    thrown?.message,
    ARCHIVE_DELETION_NOTIFIER_ERRORS.digestIntervalHours,
  );
  assert.equal(api.calls.length, 0);
});

// --- 6. HistoryEmailSchedule ----------------------------------------------

test("history email schedule — happy payload matches server schema", () => {
  const payload = buildHistoryEmailSchedulePayload({
    enabled: true,
    cadence: "monthly",
    recipientsText: "x@y.com",
  });
  HistoryEmailServerSchema.parse(payload);
});

test("history email schedule — too many recipients throws + skips PUT", async () => {
  const api = makeApi();
  const recipientsText = Array.from({ length: 21 }, (_, i) => `u${i}@x.com`).join(",");
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/email-schedule-history",
    () =>
      buildHistoryEmailSchedulePayload({
        enabled: true,
        cadence: "weekly",
        recipientsText,
      }),
  );
  assert.equal(thrown?.message, HISTORY_EMAIL_SCHEDULE_ERRORS.recipientsTooMany);
  assert.equal(api.calls.length, 0);
});

// --- 6b. HistoryEmail failure-threshold -----------------------------------

test("history email failure-threshold — happy payload matches server schema", () => {
  const blank = buildHistoryEmailFailureThresholdPayload({
    draft: "",
    bounds: { min: 1, max: 50 },
  });
  assert.equal(blank.value, null);
  FailureThresholdServerSchema.parse(blank);

  const numeric = buildHistoryEmailFailureThresholdPayload({
    draft: "5",
    bounds: { min: 1, max: 50 },
  });
  assert.equal(numeric.value, 5);
  FailureThresholdServerSchema.parse(numeric);
});

test("history email failure-threshold — out-of-range throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/email-schedule-history/failure-threshold",
    () =>
      buildHistoryEmailFailureThresholdPayload({
        draft: "999",
        bounds: { min: 1, max: 50 },
      }),
  );
  assert.equal(
    thrown?.message,
    HISTORY_EMAIL_FAILURE_THRESHOLD_ERRORS.outOfRange(1, 50),
  );
  assert.equal(api.calls.length, 0);
});

// --- 7. Stale-rows thresholds ---------------------------------------------

test("stale-rows thresholds — happy payload matches server schema", () => {
  const payload = buildStaleRowsThresholdsPayload({
    defaultInput: "",
    messagesInput: "100",
    decisionsInput: "",
    commandsInput: "50",
    currentOverride: { default: 10 },
  });
  // blank `default` carries the current override; messages + commands set from input.
  assert.deepEqual(payload.override, { default: 10, messages: 100, commands: 50 });
  StaleRowsServerSchema.parse(payload);
});

test("stale-rows thresholds — negative integer throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/retention/stale-rows-thresholds",
    () =>
      buildStaleRowsThresholdsPayload({
        defaultInput: "-1",
        messagesInput: "",
        decisionsInput: "",
        commandsInput: "",
        currentOverride: null,
      }),
  );
  assert.equal(thrown?.message, STALE_ROWS_THRESHOLDS_ERRORS.nonNegativeIntegers);
  assert.equal(api.calls.length, 0);
});

test("stale-rows thresholds — all blank + no current override throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/retention/stale-rows-thresholds",
    () =>
      buildStaleRowsThresholdsPayload({
        defaultInput: "",
        messagesInput: "",
        decisionsInput: "",
        commandsInput: "",
        currentOverride: null,
      }),
  );
  assert.equal(thrown?.message, STALE_ROWS_THRESHOLDS_ERRORS.atLeastOne);
  assert.equal(api.calls.length, 0);
});

// --- 8. LegacyTokenDispatchAlert (Task #590) ------------------------------

const LegacyTokenDispatchServerSchema = z.object({
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

test("legacy token dispatch alert — happy payload matches server schema", () => {
  const payload = buildLegacyTokenDispatchAlertPayload({
    enabled: true,
    recipientsText: "sec@x.com, ops@x.com",
    dedupHoursText: "6",
  });
  assert.deepEqual(payload.recipients, ["sec@x.com", "ops@x.com"]);
  assert.equal(payload.dedupWindowMs, 6 * 60 * 60 * 1000);
  LegacyTokenDispatchServerSchema.parse(payload);
});

test("legacy token dispatch alert — dedup above 7d throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/legacy-token-dispatch-alert",
    () =>
      buildLegacyTokenDispatchAlertPayload({
        enabled: true,
        recipientsText: "sec@x.com",
        dedupHoursText: "200",
      }),
  );
  assert.equal(thrown?.message, LEGACY_TOKEN_DISPATCH_ALERT_ERRORS.dedupWindow);
  assert.equal(api.calls.length, 0);
});

// --- 9. GatewayBlockAlertSettings (Task #590) -----------------------------

const GatewayBlockAlertServerSchema = z
  .object({
    threshold: z.number().int().optional(),
    windowMs: z.number().int().optional(),
    dedupMs: z.number().int().optional(),
    recovery: z.number().int().nullable().optional(),
    autoPauseEnabled: z.boolean().optional(),
    autoPauseWindows: z.number().int().optional(),
  })
  .strict();

const GATEWAY_LIMITS: GatewayBlockAlertSettingsLimits = {
  thresholdMin: 1,
  thresholdMax: 1000,
  windowMsMin: 1000,
  windowMsMax: 24 * 60 * 60 * 1000,
  dedupMsMin: 0,
  dedupMsMax: 24 * 60 * 60 * 1000,
  recoveryMin: 0,
  recoveryMax: 1000,
  autoPauseWindowsMin: 1,
  autoPauseWindowsMax: 100,
};

test("gateway block alert settings — happy payload matches server schema", () => {
  const payload = buildGatewayBlockAlertSettingsPayload({
    thresholdInput: "10",
    windowSecInput: "60",
    dedupMinInput: "15",
    recoveryDerived: false,
    recoveryInput: "5",
    autoPauseEnabledInput: true,
    autoPauseWindowsInput: "3",
    limits: GATEWAY_LIMITS,
  });
  assert.deepEqual(payload, {
    threshold: 10,
    windowMs: 60_000,
    dedupMs: 15 * 60_000,
    recovery: 5,
    autoPauseEnabled: true,
    autoPauseWindows: 3,
  });
  GatewayBlockAlertServerSchema.parse(payload);
});

test("gateway block alert settings — threshold above max throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/gateway/alert-settings",
    () =>
      buildGatewayBlockAlertSettingsPayload({
        thresholdInput: "9999",
        windowSecInput: "60",
        dedupMinInput: "15",
        recoveryDerived: true,
        recoveryInput: "",
        autoPauseEnabledInput: false,
        autoPauseWindowsInput: "3",
        limits: GATEWAY_LIMITS,
      }),
  );
  assert.equal(
    thrown?.message,
    GATEWAY_BLOCK_ALERT_SETTINGS_ERRORS.threshold(1, 1000),
  );
  assert.equal(api.calls.length, 0);
});

test("gateway block alert settings — recoveryDerived skips recovery validation", () => {
  const payload = buildGatewayBlockAlertSettingsPayload({
    thresholdInput: "10",
    windowSecInput: "60",
    dedupMinInput: "15",
    recoveryDerived: true,
    recoveryInput: "garbage",
    autoPauseEnabledInput: false,
    autoPauseWindowsInput: "3",
    limits: GATEWAY_LIMITS,
  });
  assert.equal(payload.recovery, null);
  GatewayBlockAlertServerSchema.parse(payload);
});

// --- 10. ArchiveRetentionPolicy per-field saves (Task #590) ---------------

const ArchiveRetentionPolicyServerSchema = z
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
  );

test("archive retention policy — happy positive-int field matches server schema", () => {
  const payload = buildArchiveRetentionPolicyFieldPayload({
    field: "retentionDays",
    input: "45",
  });
  assert.deepEqual(payload, { retentionDays: 45 });
  ArchiveRetentionPolicyServerSchema.parse(payload);
});

test("archive retention policy — happy non-negative field matches server schema", () => {
  const payload = buildArchiveRetentionPolicyFieldPayload({
    field: "trashWarnFileCount",
    input: "0",
  });
  assert.deepEqual(payload, { trashWarnFileCount: 0 });
  ArchiveRetentionPolicyServerSchema.parse(payload);
});

test("archive retention policy — zero retentionDays throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/retention/archive/policy",
    () =>
      buildArchiveRetentionPolicyFieldPayload({
        field: "retentionDays",
        input: "0",
      }),
  );
  assert.equal(
    thrown?.message,
    ARCHIVE_RETENTION_POLICY_ERRORS.positiveInteger,
  );
  assert.equal(api.calls.length, 0);
});

test("archive retention policy — negative warn-bytes throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/retention/archive/policy",
    () =>
      buildArchiveRetentionPolicyFieldPayload({
        field: "trashWarnBytes",
        input: "-1",
      }),
  );
  assert.equal(
    thrown?.message,
    ARCHIVE_RETENTION_POLICY_ERRORS.nonNegativeInteger,
  );
  assert.equal(api.calls.length, 0);
});

// --- 11. Retention-window editors in OmniChannelAudience.tsx (Task #590) ---

const RetentionOverrideServerSchema = z.object({
  retentionDays: z.number().int().positive().nullable(),
});
const RetentionSweepServerSchema = z.object({
  retentionDays: z.number().int().positive().optional(),
});

test("retention days — happy positive int matches server schema", () => {
  const payload = buildRetentionDaysPayload({ input: "90" });
  assert.deepEqual(payload, { retentionDays: 90 });
  RetentionOverrideServerSchema.parse(payload);
});

test("retention days — zero throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/retention/override",
    () => buildRetentionDaysPayload({ input: "0" }),
  );
  assert.equal(thrown?.message, RETENTION_DAYS_ERRORS.positiveInteger);
  assert.equal(api.calls.length, 0);
});

test("optional retention days — blank input returns empty payload", () => {
  const payload = buildOptionalRetentionDaysPayload({ input: "   " });
  assert.deepEqual(payload, {});
  RetentionSweepServerSchema.parse(payload);
});

test("optional retention days — negative input throws + skips PUT", async () => {
  const api = makeApi();
  const { thrown } = await runMutation(
    api,
    "/api/admin/newsroom/audience/retention/sweep",
    () => buildOptionalRetentionDaysPayload({ input: "-3" }),
  );
  assert.equal(thrown?.message, RETENTION_DAYS_ERRORS.positiveInteger);
  assert.equal(api.calls.length, 0);
});
