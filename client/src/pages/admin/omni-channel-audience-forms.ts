/**
 * Task #541 — pure payload-building helpers for every "save" card in
 * OmniChannelAudience.tsx. Mirrors the audit-export-outlier-form.ts
 * pattern: a small synchronous builder per card that either returns a
 * validated payload (exactly matching the server Zod schema) or throws
 * an Error with the exact inline error text the form shows. Because
 * each card's mutationFn calls the builder *before* the network
 * request, a thrown error structurally guarantees the PUT is skipped.
 */

export function parseRecipientList(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((r) => r.trim())
    .filter(Boolean);
}

const MAX_RECIPIENTS = 20;

// ---------------------------------------------------------------------------
// 1. ScheduledComplianceEmailCard  →  PUT /email-schedule
// ---------------------------------------------------------------------------

export const COMPLIANCE_EMAIL_SCHEDULE_URL =
  "/api/admin/newsroom/audience/email-schedule";

export const COMPLIANCE_EMAIL_SCHEDULE_ERRORS = {
  recipientsTooMany: `Too many recipients (max ${MAX_RECIPIENTS}).`,
} as const;

export interface ComplianceEmailScheduleFormState {
  enabled: boolean;
  cadence: "weekly" | "monthly";
  recipientsText: string;
  platform: string;
  productionIdFilter: string;
}

export interface ComplianceEmailSchedulePayload {
  enabled: boolean;
  cadence: "weekly" | "monthly";
  recipients: string[];
  platform: string | null;
  productionId: string | null;
}

export function buildComplianceEmailSchedulePayload(
  s: ComplianceEmailScheduleFormState,
): ComplianceEmailSchedulePayload {
  const recipients = parseRecipientList(s.recipientsText);
  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error(COMPLIANCE_EMAIL_SCHEDULE_ERRORS.recipientsTooMany);
  }
  return {
    enabled: s.enabled,
    cadence: s.cadence,
    recipients,
    platform: s.platform || null,
    productionId: s.productionIdFilter || null,
  };
}

// ---------------------------------------------------------------------------
// 2. ConnectorRotationNotifierCard  →  PUT /connector-rotation-notifier
// ---------------------------------------------------------------------------

export const CONNECTOR_ROTATION_NOTIFIER_URL =
  "/api/admin/newsroom/audience/connector-rotation-notifier";

const CONNECTOR_ROTATION_DEDUP_MAX_SEC = 7 * 24 * 60 * 60;

export const CONNECTOR_ROTATION_NOTIFIER_ERRORS = {
  recipientsTooMany: `Too many recipients (max ${MAX_RECIPIENTS}).`,
  dedupWindow:
    "Dedup window must be a non-negative number of seconds (max 7 days).",
} as const;

export interface ConnectorRotationNotifierFormState {
  enabled: boolean;
  recipientsText: string;
  suppressSet: boolean;
  suppressRotate: boolean;
  suppressDelete: boolean;
  dedupWindowSecText?: string;
}

export interface ConnectorRotationNotifierPayload {
  enabled: boolean;
  recipients: string[];
  suppressedActions: Array<"set" | "rotate" | "delete">;
  dedupWindowMs: number | null;
}

export function buildConnectorRotationNotifierPayload(
  s: ConnectorRotationNotifierFormState,
): ConnectorRotationNotifierPayload {
  const recipients = parseRecipientList(s.recipientsText);
  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error(CONNECTOR_ROTATION_NOTIFIER_ERRORS.recipientsTooMany);
  }
  const suppressedActions: Array<"set" | "rotate" | "delete"> = [];
  if (s.suppressSet) suppressedActions.push("set");
  if (s.suppressRotate) suppressedActions.push("rotate");
  if (s.suppressDelete) suppressedActions.push("delete");
  const trimmed = (s.dedupWindowSecText ?? "").trim();
  let dedupWindowMs: number | null = null;
  if (trimmed !== "") {
    const sec = Number(trimmed);
    if (
      !Number.isFinite(sec) ||
      sec < 0 ||
      sec > CONNECTOR_ROTATION_DEDUP_MAX_SEC
    ) {
      throw new Error(CONNECTOR_ROTATION_NOTIFIER_ERRORS.dedupWindow);
    }
    dedupWindowMs = Math.floor(sec * 1000);
  }
  return {
    enabled: s.enabled,
    recipients,
    suppressedActions,
    dedupWindowMs,
  };
}

// ---------------------------------------------------------------------------
// 3. AuditExportNotifierCard  →  PUT /export-notifier
// ---------------------------------------------------------------------------

export const EXPORT_NOTIFIER_URL =
  "/api/admin/newsroom/audience/export-notifier";

export const EXPORT_NOTIFIER_MIN_ROW_COUNT_MAX = 10_000_000;
export const EXPORT_NOTIFIER_SUPPRESSED_MAX = 50;

export const EXPORT_NOTIFIER_ERRORS = {
  recipientsTooMany: `Too many recipients (max ${MAX_RECIPIENTS}).`,
  suppressedTooMany: `Too many suppressed actor IDs (max ${EXPORT_NOTIFIER_SUPPRESSED_MAX}).`,
  minRowCount: `Min row count must be an integer between 0 and ${EXPORT_NOTIFIER_MIN_ROW_COUNT_MAX.toLocaleString()}.`,
} as const;

export interface ExportNotifierFormState {
  enabled: boolean;
  recipientsText: string;
  minRowCountText: string;
  suppressedText: string;
}

export interface ExportNotifierPayload {
  enabled: boolean;
  recipients: string[];
  minRowCount: number;
  suppressedActorIds: string[];
}

export function buildExportNotifierPayload(
  s: ExportNotifierFormState,
): ExportNotifierPayload {
  const recipients = parseRecipientList(s.recipientsText);
  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error(EXPORT_NOTIFIER_ERRORS.recipientsTooMany);
  }
  const suppressedActorIds = parseRecipientList(s.suppressedText);
  if (suppressedActorIds.length > EXPORT_NOTIFIER_SUPPRESSED_MAX) {
    throw new Error(EXPORT_NOTIFIER_ERRORS.suppressedTooMany);
  }
  const rawTrim = s.minRowCountText.trim();
  const raw = rawTrim === "" ? 0 : Number(rawTrim);
  if (
    !Number.isFinite(raw) ||
    raw < 0 ||
    raw > EXPORT_NOTIFIER_MIN_ROW_COUNT_MAX
  ) {
    throw new Error(EXPORT_NOTIFIER_ERRORS.minRowCount);
  }
  const minRowCount = Math.floor(raw);
  return { enabled: s.enabled, recipients, minRowCount, suppressedActorIds };
}

// ---------------------------------------------------------------------------
// 4. RiskSignalRulesCard  →  PUT /risk-signal-rules
// ---------------------------------------------------------------------------

export const RISK_SIGNAL_RULES_URL =
  "/api/admin/newsroom/audience/risk-signal-rules";

export const RISK_SIGNAL_RULES_ERRORS = {
  wideDateWindowDays: (min: number, max: number) =>
    `Wide date window must be an integer between ${min} and ${max} days.`,
  signalsTooMany: "Each signal list is capped at 20 entries.",
} as const;

export interface RiskSignalRulesFormState<S extends string = string> {
  daysInput: string;
  loud: Iterable<S>;
  muted: Iterable<S>;
  bounds: {
    minWideDateWindowDays: number;
    maxWideDateWindowDays: number;
  };
}

export interface RiskSignalRulesPayload<S extends string = string> {
  wideDateWindowDays: number;
  loudSignals: S[];
  mutedSignals: S[];
}

export function buildRiskSignalRulesPayload<S extends string>(
  s: RiskSignalRulesFormState<S>,
): RiskSignalRulesPayload<S> {
  const min = s.bounds.minWideDateWindowDays;
  const max = s.bounds.maxWideDateWindowDays;
  const raw = Number(s.daysInput);
  if (!Number.isFinite(raw) || raw < min || raw > max) {
    throw new Error(RISK_SIGNAL_RULES_ERRORS.wideDateWindowDays(min, max));
  }
  const wideDateWindowDays = Math.floor(raw);
  const loudSignals = Array.from(s.loud);
  const mutedSignals = Array.from(s.muted);
  if (loudSignals.length > 20 || mutedSignals.length > 20) {
    throw new Error(RISK_SIGNAL_RULES_ERRORS.signalsTooMany);
  }
  return { wideDateWindowDays, loudSignals, mutedSignals };
}

// ---------------------------------------------------------------------------
// 5. ArchiveDeletionNotifierCard  →  PUT /archive/deletion-notifier
// ---------------------------------------------------------------------------

export const ARCHIVE_DELETION_NOTIFIER_URL =
  "/api/admin/newsroom/audience/retention/archive/deletion-notifier";

const WARNING_LEAD_DAYS_MIN = 1;
const WARNING_LEAD_DAYS_MAX = 365;
const DIGEST_INTERVAL_HOURS_MIN = 1;
const DIGEST_INTERVAL_HOURS_MAX = 24 * 30;
const POST_CLEANUP_FILE_THRESHOLD_MAX = 1_000_000;
const POST_CLEANUP_MB_THRESHOLD_MAX = 1_000_000; // 1 PB cap; well under SAFE_INT/MB.

export const ARCHIVE_DELETION_NOTIFIER_ERRORS = {
  recipientsTooMany: `Too many recipients (max ${MAX_RECIPIENTS}).`,
  warningLeadDays: `Warning lead must be an integer between ${WARNING_LEAD_DAYS_MIN} and ${WARNING_LEAD_DAYS_MAX} days.`,
  digestIntervalHours: `Digest interval must be an integer between ${DIGEST_INTERVAL_HOURS_MIN} and ${DIGEST_INTERVAL_HOURS_MAX} hours.`,
  fileThreshold: `Cleanup file threshold must be an integer between 0 and ${POST_CLEANUP_FILE_THRESHOLD_MAX.toLocaleString()}.`,
  bytesThreshold: `Cleanup bytes threshold must be an integer between 0 and ${POST_CLEANUP_MB_THRESHOLD_MAX.toLocaleString()} MB.`,
} as const;

export interface ArchiveDeletionNotifierFormState {
  enabled: boolean;
  recipientsText: string;
  warningLeadDaysText: string;
  digestHoursText: string;
  fileThresholdText: string;
  mbThresholdText: string;
}

export interface ArchiveDeletionNotifierPayload {
  enabled: boolean;
  recipients: string[];
  warningLeadDays: number;
  digestIntervalHours: number;
  postCleanupFileThreshold: number;
  postCleanupBytesThreshold: number;
}

function parseBoundedInt(
  text: string,
  min: number,
  max: number,
  errorMessage: string,
): number {
  const raw = Number(text);
  if (!Number.isFinite(raw) || raw < min || raw > max) {
    throw new Error(errorMessage);
  }
  return Math.floor(raw);
}

export function buildArchiveDeletionNotifierPayload(
  s: ArchiveDeletionNotifierFormState,
): ArchiveDeletionNotifierPayload {
  const recipients = parseRecipientList(s.recipientsText);
  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error(ARCHIVE_DELETION_NOTIFIER_ERRORS.recipientsTooMany);
  }
  const warningLeadDays = parseBoundedInt(
    s.warningLeadDaysText,
    WARNING_LEAD_DAYS_MIN,
    WARNING_LEAD_DAYS_MAX,
    ARCHIVE_DELETION_NOTIFIER_ERRORS.warningLeadDays,
  );
  const digestIntervalHours = parseBoundedInt(
    s.digestHoursText,
    DIGEST_INTERVAL_HOURS_MIN,
    DIGEST_INTERVAL_HOURS_MAX,
    ARCHIVE_DELETION_NOTIFIER_ERRORS.digestIntervalHours,
  );
  const postCleanupFileThreshold = parseBoundedInt(
    s.fileThresholdText,
    0,
    POST_CLEANUP_FILE_THRESHOLD_MAX,
    ARCHIVE_DELETION_NOTIFIER_ERRORS.fileThreshold,
  );
  const mb = parseBoundedInt(
    s.mbThresholdText,
    0,
    POST_CLEANUP_MB_THRESHOLD_MAX,
    ARCHIVE_DELETION_NOTIFIER_ERRORS.bytesThreshold,
  );
  const postCleanupBytesThreshold = mb * 1024 * 1024;
  return {
    enabled: s.enabled,
    recipients,
    warningLeadDays,
    digestIntervalHours,
    postCleanupFileThreshold,
    postCleanupBytesThreshold,
  };
}

// ---------------------------------------------------------------------------
// 6. ScheduledHistoryEmailCard  →  PUT /email-schedule-history
// ---------------------------------------------------------------------------

export const HISTORY_EMAIL_SCHEDULE_URL =
  "/api/admin/newsroom/audience/email-schedule-history";

export const HISTORY_EMAIL_SCHEDULE_ERRORS = {
  recipientsTooMany: `Too many recipients (max ${MAX_RECIPIENTS}).`,
} as const;

export interface HistoryEmailScheduleFormState {
  enabled: boolean;
  cadence: "weekly" | "monthly";
  recipientsText: string;
}

export interface HistoryEmailSchedulePayload {
  enabled: boolean;
  cadence: "weekly" | "monthly";
  recipients: string[];
}

export function buildHistoryEmailSchedulePayload(
  s: HistoryEmailScheduleFormState,
): HistoryEmailSchedulePayload {
  const recipients = parseRecipientList(s.recipientsText);
  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error(HISTORY_EMAIL_SCHEDULE_ERRORS.recipientsTooMany);
  }
  return { enabled: s.enabled, cadence: s.cadence, recipients };
}

// ---------------------------------------------------------------------------
// 6b. HistoryEmail failure-threshold  →  PUT /email-schedule-history/failure-threshold
// ---------------------------------------------------------------------------

export const HISTORY_EMAIL_FAILURE_THRESHOLD_URL =
  "/api/admin/newsroom/audience/email-schedule-history/failure-threshold";

export const HISTORY_EMAIL_FAILURE_THRESHOLD_ERRORS = {
  outOfRange: (min: number, max: number) =>
    `Failure threshold must be an integer between ${min} and ${max} (or blank to reset).`,
} as const;

export interface HistoryEmailFailureThresholdFormState {
  draft: string;
  bounds: { min: number; max: number };
}

export interface HistoryEmailFailureThresholdPayload {
  value: number | null;
}

export function buildHistoryEmailFailureThresholdPayload(
  s: HistoryEmailFailureThresholdFormState,
): HistoryEmailFailureThresholdPayload {
  const trimmed = s.draft.trim();
  if (trimmed === "") return { value: null };
  const raw = Number(trimmed);
  const { min, max } = s.bounds;
  if (
    !Number.isFinite(raw) ||
    !Number.isInteger(raw) ||
    raw < min ||
    raw > max
  ) {
    throw new Error(
      HISTORY_EMAIL_FAILURE_THRESHOLD_ERRORS.outOfRange(min, max),
    );
  }
  return { value: raw };
}

// ---------------------------------------------------------------------------
// 6c. Restore-log rate-spike threshold  →  POST /retention/restore-log/rate-threshold
// (Task #529 inline editor; Task #572 test coverage)
// ---------------------------------------------------------------------------

export const RESTORE_LOG_RATE_THRESHOLD_URL =
  "/api/admin/newsroom/audience/retention/restore-log/rate-threshold";

export const RESTORE_LOG_RATE_THRESHOLD_ERRORS = {
  nonNegativeInteger:
    "Enter a non-negative integer (0 disables alerting).",
} as const;

export interface RestoreLogRateThresholdFormState {
  draft: string;
}

export interface RestoreLogRateThresholdPayload {
  threshold: number | null;
}

/**
 * Builds the POST payload for the restore-log rate-spike threshold editor.
 * Pass `{ draft: "" }` to reset to the default (sends `{ threshold: null }`).
 * Throws with the exact inline error text when the draft is not a
 * non-negative finite number.
 */
export function buildRestoreLogRateThresholdPayload(
  s: RestoreLogRateThresholdFormState,
): RestoreLogRateThresholdPayload {
  const trimmed = s.draft.trim();
  if (trimmed === "") return { threshold: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(RESTORE_LOG_RATE_THRESHOLD_ERRORS.nonNegativeInteger);
  }
  return { threshold: Math.floor(n) };
}

// ---------------------------------------------------------------------------
// 7. Stale-rows thresholds  →  PUT /retention/stale-rows-thresholds
// ---------------------------------------------------------------------------

export const STALE_ROWS_THRESHOLDS_URL =
  "/api/admin/newsroom/audience/retention/stale-rows-thresholds";

export const STALE_ROWS_THRESHOLDS_ERRORS = {
  nonNegativeIntegers: "Enter non-negative integers (or leave blank).",
  atLeastOne: "Enter at least one threshold value.",
} as const;

type StaleRowsKey = "default" | "messages" | "decisions" | "commands";

export type StaleRowsOverride = Partial<Record<StaleRowsKey, number>>;

export interface StaleRowsThresholdsFormState {
  defaultInput: string;
  messagesInput: string;
  decisionsInput: string;
  commandsInput: string;
  currentOverride: StaleRowsOverride | null;
}

export interface StaleRowsThresholdsPayload {
  override: StaleRowsOverride;
}

export function buildStaleRowsThresholdsPayload(
  s: StaleRowsThresholdsFormState,
): StaleRowsThresholdsPayload {
  const inputs: Record<StaleRowsKey, string> = {
    default: s.defaultInput,
    messages: s.messagesInput,
    decisions: s.decisionsInput,
    commands: s.commandsInput,
  };
  const current = s.currentOverride ?? {};
  const next: StaleRowsOverride = {};
  for (const k of ["default", "messages", "decisions", "commands"] as const) {
    const raw = inputs[k].trim();
    if (raw === "") {
      const carry = current[k];
      if (typeof carry === "number") next[k] = carry;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(STALE_ROWS_THRESHOLDS_ERRORS.nonNegativeIntegers);
    }
    next[k] = Math.floor(n);
  }
  if (Object.keys(next).length === 0) {
    throw new Error(STALE_ROWS_THRESHOLDS_ERRORS.atLeastOne);
  }
  return { override: next };
}

// ---------------------------------------------------------------------------
// Task #590 — additional builders for the remaining notifier and threshold
// cards on OmniChannelAudience.tsx that previously built payloads inline
// inside their mutationFn.
// ---------------------------------------------------------------------------

// 8. LegacyTokenDispatchAlertCard  →  PUT /legacy-token-dispatch-alert

export const LEGACY_TOKEN_DISPATCH_ALERT_URL =
  "/api/admin/newsroom/audience/legacy-token-dispatch-alert";

const LEGACY_TOKEN_DISPATCH_DEDUP_MAX_HOURS = 7 * 24;

export const LEGACY_TOKEN_DISPATCH_ALERT_ERRORS = {
  recipientsTooMany: `Too many recipients (max ${MAX_RECIPIENTS}).`,
  dedupWindow: `dedup window must be a non-negative number of hours (max ${LEGACY_TOKEN_DISPATCH_DEDUP_MAX_HOURS}h).`,
} as const;

export interface LegacyTokenDispatchAlertFormState {
  enabled: boolean;
  recipientsText: string;
  dedupHoursText: string;
}

export interface LegacyTokenDispatchAlertPayload {
  enabled: boolean;
  recipients: string[];
  dedupWindowMs: number | null;
}

export function buildLegacyTokenDispatchAlertPayload(
  s: LegacyTokenDispatchAlertFormState,
): LegacyTokenDispatchAlertPayload {
  const recipients = parseRecipientList(s.recipientsText);
  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error(LEGACY_TOKEN_DISPATCH_ALERT_ERRORS.recipientsTooMany);
  }
  const trimmed = s.dedupHoursText.trim();
  let dedupWindowMs: number | null = null;
  if (trimmed !== "") {
    const hours = Number(trimmed);
    if (
      !Number.isFinite(hours) ||
      hours < 0 ||
      hours > LEGACY_TOKEN_DISPATCH_DEDUP_MAX_HOURS
    ) {
      throw new Error(LEGACY_TOKEN_DISPATCH_ALERT_ERRORS.dedupWindow);
    }
    dedupWindowMs = Math.floor(hours * 60 * 60 * 1000);
  }
  return { enabled: s.enabled, recipients, dedupWindowMs };
}

// 9. GatewayBlockAlertSettingsCard  →  PATCH /gateway/alert-settings

export const GATEWAY_BLOCK_ALERT_SETTINGS_URL =
  "/api/admin/newsroom/audience/gateway/alert-settings";

export interface GatewayBlockAlertSettingsLimits {
  thresholdMin: number;
  thresholdMax: number;
  windowMsMin: number;
  windowMsMax: number;
  dedupMsMin: number;
  dedupMsMax: number;
  recoveryMin: number;
  recoveryMax: number;
  autoPauseWindowsMin: number;
  autoPauseWindowsMax: number;
}

export const GATEWAY_BLOCK_ALERT_SETTINGS_ERRORS = {
  threshold: (min: number, max: number) =>
    `Threshold must be an integer between ${min} and ${max}`,
  windowSec: (minSec: number, maxSec: number) =>
    `Window must be ${minSec}s – ${maxSec}s`,
  dedupMin: (minMin: number, maxMin: number) =>
    `Dedup must be ${minMin}m – ${maxMin}m`,
  recovery: (min: number, max: number) =>
    `Recovery must be an integer between ${min} and ${max}`,
  autoPauseWindows: (min: number, max: number) =>
    `Auto-pause windows must be an integer between ${min} and ${max}`,
} as const;

export interface GatewayBlockAlertSettingsFormState {
  thresholdInput: string;
  windowSecInput: string;
  dedupMinInput: string;
  recoveryDerived: boolean;
  recoveryInput: string;
  autoPauseEnabledInput: boolean;
  autoPauseWindowsInput: string;
  limits: GatewayBlockAlertSettingsLimits;
}

export interface GatewayBlockAlertSettingsPayload {
  threshold: number;
  windowMs: number;
  dedupMs: number;
  recovery: number | null;
  autoPauseEnabled: boolean;
  autoPauseWindows: number;
}

export function buildGatewayBlockAlertSettingsPayload(
  s: GatewayBlockAlertSettingsFormState,
): GatewayBlockAlertSettingsPayload {
  const { limits } = s;
  const threshold = Number.parseInt(s.thresholdInput, 10);
  if (
    !Number.isFinite(threshold) ||
    threshold < limits.thresholdMin ||
    threshold > limits.thresholdMax
  ) {
    throw new Error(
      GATEWAY_BLOCK_ALERT_SETTINGS_ERRORS.threshold(
        limits.thresholdMin,
        limits.thresholdMax,
      ),
    );
  }
  const windowSec = Number.parseInt(s.windowSecInput, 10);
  const windowMs = windowSec * 1000;
  if (
    !Number.isFinite(windowMs) ||
    windowMs < limits.windowMsMin ||
    windowMs > limits.windowMsMax
  ) {
    throw new Error(
      GATEWAY_BLOCK_ALERT_SETTINGS_ERRORS.windowSec(
        limits.windowMsMin / 1000,
        limits.windowMsMax / 1000,
      ),
    );
  }
  const dedupMin = Number.parseInt(s.dedupMinInput, 10);
  const dedupMs = dedupMin * 60_000;
  if (
    !Number.isFinite(dedupMs) ||
    dedupMs < limits.dedupMsMin ||
    dedupMs > limits.dedupMsMax
  ) {
    throw new Error(
      GATEWAY_BLOCK_ALERT_SETTINGS_ERRORS.dedupMin(
        limits.dedupMsMin / 60_000,
        limits.dedupMsMax / 60_000,
      ),
    );
  }
  let recovery: number | null = null;
  if (!s.recoveryDerived) {
    const r = Number.parseInt(s.recoveryInput, 10);
    if (
      !Number.isFinite(r) ||
      r < limits.recoveryMin ||
      r > limits.recoveryMax
    ) {
      throw new Error(
        GATEWAY_BLOCK_ALERT_SETTINGS_ERRORS.recovery(
          limits.recoveryMin,
          limits.recoveryMax,
        ),
      );
    }
    recovery = r;
  }
  const autoPauseWindows = Number.parseInt(s.autoPauseWindowsInput, 10);
  if (
    !Number.isFinite(autoPauseWindows) ||
    autoPauseWindows < limits.autoPauseWindowsMin ||
    autoPauseWindows > limits.autoPauseWindowsMax
  ) {
    throw new Error(
      GATEWAY_BLOCK_ALERT_SETTINGS_ERRORS.autoPauseWindows(
        limits.autoPauseWindowsMin,
        limits.autoPauseWindowsMax,
      ),
    );
  }
  return {
    threshold,
    windowMs,
    dedupMs,
    recovery,
    autoPauseEnabled: s.autoPauseEnabledInput,
    autoPauseWindows,
  };
}

// 10. ArchiveRetentionPolicyCard  →  POST /retention/archive/policy
// Five single-field save buttons all hit the same endpoint with one of:
//   { retentionDays | trashGraceDays | trashWarnFileCount | trashWarnBytes }
// (plus the auto-delete toggle, which has no input parsing). The first
// two require a positive integer; the warn-* pair require non-negative.

export const ARCHIVE_RETENTION_POLICY_URL =
  "/api/admin/newsroom/audience/retention/archive/policy";

export const ARCHIVE_RETENTION_POLICY_ERRORS = {
  positiveInteger: "enter a positive integer",
  nonNegativeInteger: "enter a non-negative integer",
} as const;

export type ArchiveRetentionPolicyFieldKey =
  | "retentionDays"
  | "trashGraceDays"
  | "trashWarnFileCount"
  | "trashWarnBytes";

export interface ArchiveRetentionPolicyFieldFormState {
  field: ArchiveRetentionPolicyFieldKey;
  input: string;
}

export type ArchiveRetentionPolicyFieldPayload = Partial<{
  retentionDays: number;
  trashGraceDays: number;
  trashWarnFileCount: number;
  trashWarnBytes: number;
}>;

export function buildArchiveRetentionPolicyFieldPayload(
  s: ArchiveRetentionPolicyFieldFormState,
): ArchiveRetentionPolicyFieldPayload {
  const positive = s.field === "retentionDays" || s.field === "trashGraceDays";
  const n = Number(s.input);
  if (positive) {
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(ARCHIVE_RETENTION_POLICY_ERRORS.positiveInteger);
    }
  } else {
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(ARCHIVE_RETENTION_POLICY_ERRORS.nonNegativeInteger);
    }
  }
  return { [s.field]: Math.floor(n) } as ArchiveRetentionPolicyFieldPayload;
}

// 11. Retention-window editors in OmniChannelAudience.tsx
//
//   - POST /retention/override         { retentionDays: positive int }
//   - POST /retention/restore-log/retention { retentionDays: positive int }
//   - POST /retention/sweep            { retentionDays?: positive int }
//
// All three previously parsed `retentionDaysInput` inline at the call site
// and inlined the same "Enter a positive integer number of days." error
// message. The sweep variant additionally allows the input to be blank,
// in which case the server uses the configured default.

export const RETENTION_OVERRIDE_URL =
  "/api/admin/newsroom/audience/retention/override";
export const RETENTION_RESTORE_LOG_URL =
  "/api/admin/newsroom/audience/retention/restore-log/retention";
export const RETENTION_SWEEP_URL =
  "/api/admin/newsroom/audience/retention/sweep";

export const RETENTION_DAYS_ERRORS = {
  positiveInteger: "Enter a positive integer number of days.",
} as const;

export interface RetentionDaysFormState {
  input: string;
}

export interface RetentionDaysPayload {
  retentionDays: number;
}

export interface OptionalRetentionDaysPayload {
  retentionDays?: number;
}

export function buildRetentionDaysPayload(
  s: RetentionDaysFormState,
): RetentionDaysPayload {
  const n = Number(s.input);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(RETENTION_DAYS_ERRORS.positiveInteger);
  }
  return { retentionDays: Math.floor(n) };
}

/**
 * Sweep allows a blank input (meaning "use the configured default"),
 * but a non-blank input still has to be a positive integer.
 */
export function buildOptionalRetentionDaysPayload(
  s: RetentionDaysFormState,
): OptionalRetentionDaysPayload {
  const trimmed = s.input.trim();
  if (trimmed === "") return {};
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(RETENTION_DAYS_ERRORS.positiveInteger);
  }
  return { retentionDays: Math.floor(n) };
}
