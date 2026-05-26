/**
 * Task #588 — admin-only helper types extracted from the main
 * `OmniChannelAudience.tsx` composition root so the page file stays
 * focused on layout/state wiring. These shapes mirror the JSON
 * returned by the gateway + retention admin routes under
 * `/api/admin/newsroom/audience/*`.
 */

import type { GatewayBlockCategory } from "@shared/gateway-block-categories";

export interface GatewayBusEvent {
  id: string;
  name:
    | "audience.gateway_send_simulated"
    | "audience.gateway_send_dispatched"
    | "audience.gateway_send_blocked";
  emittedAt: string;
  payload: {
    commandId?: string;
    platform?: string | null;
    connectorId?: string | null;
    requestedAction?: string | null;
    url?: string;
    method?: string;
    status?: number;
    reason?: string;
  };
}

export interface GatewayBlockRateRow {
  connectorId: string;
  platform: string;
  blockedCount: number;
  recentReasons: string[];
  reasonCategoryCounts?: Partial<Record<GatewayBlockCategory, number>>;
}

export interface GatewayBlockRate {
  windowMs: number;
  threshold: number;
  connectors: GatewayBlockRateRow[];
}

export interface GatewayRateLimitRow {
  connectorId: string;
  platform: string;
  displayName: string;
  platformSendApproved: boolean;
  platformSendApprovedBy: string | null;
  platformSendApprovedAt: string | null;
  autoPausedAt: string | null;
  autoPausedReason: string | null;
  apiAccessMode: string;
  rateLimit: {
    used: number;
    limit: number;
    remaining: number;
    windowMs: number;
    resetAt: string;
  } | null;
}

export interface GatewayActivity {
  events: GatewayBusEvent[];
  total: number;
  limit: number;
  offset: number;
  filters?: {
    from: string | null;
    to: string | null;
    platform?: string | null;
    connectorId?: string | null;
    kind?: "simulated" | "dispatched" | "blocked" | null;
  };
  rateLimits: GatewayRateLimitRow[];
  blockRate?: GatewayBlockRate;
  liveDispatchEnabled: boolean;
  // Task #583 — number of rows in audience_gateway_events whose
  // connector_id is still NULL (pre-#532 rows that couldn't be
  // attributed by the backfill script). Used to show a hint next to
  // the Connector dropdown so admins know the filter can hide rows.
  unattributedConnectorCount?: number;
}

export interface RetentionSweepResult {
  startedAt: string;
  finishedAt: string;
  retentionDays: number;
  cutoffIso: string;
  messagesPruned: number;
  decisionsPruned: number;
  commandsPruned: number;
  gatewayEventsPruned?: number;
  notificationHistoryPruned?: number;
  thresholdAuditRowsPruned?: number;
  totalPruned: number;
  restoreLogPruned?: number;
  restoreLogRetentionDays?: number;
  restoreLogCutoffIso?: string;
  trigger: "scheduled" | "manual" | "cli";
  error: string | null;
}

export type RetentionMode = "delete" | "archive";

export interface RetentionModeMap {
  messages: RetentionMode;
  decisions: RetentionMode;
  commands: RetentionMode;
}

export interface RetentionArchiveFile {
  table: string;
  path: string;
  rowCount: number;
  bytes: number;
}

export interface RestoreLogEntry {
  restoredAt: string;
  archivePath: string;
  table: string;
  restoredBy: string;
  rowsParsed: number;
  rowsInserted: number;
  rowsSkipped: number;
  error: string | null;
}

export interface RetentionStats {
  retentionDays: number;
  defaultRetentionDays: number;
  override: number | null;
  envFallback: number | null;
  intervalHours: number;
  schedulerRunning: boolean;
  lastRun:
    | (RetentionSweepResult & {
        messagesArchived?: number;
        decisionsArchived?: number;
        commandsArchived?: number;
        archiveFiles?: RetentionArchiveFile[];
      })
    | null;
  totalRowsPruned: number;
  totalGatewayEventsPruned?: number;
  totalThresholdAuditPruned?: number;
  runCount: number;
  mode?: RetentionModeMap;
  modeOverride?: Partial<RetentionModeMap> | null;
  totalRowsArchived?: number;
  totalArchiveFiles?: number;
  archiveUploadRetryCount?: number;
  archiveUploadFinalFailureCount?: number;
  stalePendingArchive?: { messages: number; decisions: number; commands: number };
  alertActive?: boolean;
  staleRowsAlertActive?: boolean;
  staleRowsThresholds?: { messages: number; decisions: number; commands: number };
  restoreLogRetentionDays?: number;
  defaultRestoreLogRetentionDays?: number;
  restoreLogRetentionOverride?: number | null;
  restoreLogRetentionEnvFallback?: number | null;
  totalRestoreLogPruned?: number;
  restoreLogRowCount?: number;
  stalePendingHistory?: import("./_shared").StalePendingHistoryEntry[];
  restoreLogRate?: {
    todayCount: number;
    threshold: number;
    override: number | null;
    envFallback: number | null;
    alertActive: boolean;
    windowStartIso: string;
    defaultThreshold: number;
    dailyActivity?: { dayStartIso: string; count: number }[];
  };
}
