/**
 * Scheduled compliance email for the audience moderation audit trail
 * (Task #385).
 *
 * Once configured by root-admin, runs on a fixed cadence (weekly / monthly),
 * exports the previous period's audit trail via
 * `omniChannelAudienceSafetyService.exportAuditTrail`, and emails the JSON
 * + CSV attachments to a fixed recipient list via Resend.
 *
 * Hard rules:
 *   - The locked AUDIENCE_SAFETY_ENVELOPE still applies — this scheduler
 *     never calls a platform API, it only re-uses the read-only
 *     `exportAuditTrail`.
 *   - Recipients are root-admin–editable only (route requires root admin +
 *     CSRF). Recipients are validated as RFC-shaped emails server-side.
 *   - Every run (success or failure) is persisted to
 *     `audience_audit_email_runs` for compliance traceability.
 *   - Failures never throw out of the tick loop — they are logged and
 *     surfaced on the schedule row so the admin dashboard can show them.
 */

import { desc, eq, sql } from "drizzle-orm";

import { db } from "../db";
import {
  audienceAuditEmailRuns,
  audienceAuditEmailSchedules,
  AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID,
  type AudienceAuditCadence,
  type AudienceAuditEmailRun,
  type AudienceAuditEmailSchedule,
  type AudiencePlatform,
} from "../../shared/omni-channel-audience-schema";
import { omniChannelAudienceSafetyService } from "./omni-channel-audience-safety-service";
import { buildAudienceAuditCsv } from "./audience-audit-csv";
import { emailService } from "./email-service";
import { audienceAuditEmailFailureAlertService } from "./audience-audit-email-failure-alert-service";
import {
  getStalePendingHistory,
  summarizeStalePendingTrend,
  type AudienceStalePendingHistoryEntry,
} from "./audience-retention-service";
import {
  formatHistoryLines,
  formatTrendLine,
} from "./audience-retention-failure-alert-service";

/**
 * Task #543 — how many recent stale-pending samples to embed in the
 * weekly audience digest so the founder can see backlog direction even
 * when nothing is broken. Matches `AUDIENCE_RETENTION_ALERT_HISTORY_SAMPLES`.
 */
const AUDIENCE_DIGEST_STALE_HISTORY_SAMPLES = 5;

async function loadStalePendingDigestBlock(): Promise<{
  history: AudienceStalePendingHistoryEntry[];
  trendLine: string;
  historyLines: string;
  series: {
    messages: number[];
    decisions: number[];
    commands: number[];
  };
}> {
  let history: AudienceStalePendingHistoryEntry[] = [];
  try {
    history = await getStalePendingHistory(AUDIENCE_DIGEST_STALE_HISTORY_SAMPLES);
  } catch (err) {
    console.warn(
      "[audience-audit-email] failed to load stale-pending history for digest:",
      (err as Error)?.message ?? String(err),
    );
  }
  const trend = summarizeStalePendingTrend(history);
  // `getStalePendingHistory` already returns oldest-first so the
  // sparkline reads left-to-right across time the way a human expects.
  return {
    history,
    trendLine: formatTrendLine(trend),
    historyLines: formatHistoryLines(history),
    series: {
      messages: history.map((h) => h.messages),
      decisions: history.map((h) => h.decisions),
      commands: history.map((h) => h.commands),
    },
  };
}

const DEFAULT_SCHEDULE_ID = AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function newRunId(): string {
  return `aud_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function computeWindow(cadence: AudienceAuditCadence, now: Date): { from: Date; to: Date } {
  const to = new Date(now);
  if (cadence === "weekly") {
    const from = new Date(to.getTime() - WEEK_MS);
    return { from, to };
  }
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - 1);
  return { from, to };
}

function computeNextRun(cadence: AudienceAuditCadence, from: Date): Date {
  const next = new Date(from);
  if (cadence === "weekly") {
    next.setTime(next.getTime() + WEEK_MS);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

function rowToSchedule(row: typeof audienceAuditEmailSchedules.$inferSelect): AudienceAuditEmailSchedule {
  return {
    scheduleId: row.scheduleId,
    enabled: row.enabled,
    cadence: row.cadence as AudienceAuditCadence,
    recipients: row.recipients ?? [],
    platform: (row.platform as AudiencePlatform | null) ?? null,
    productionId: row.productionId ?? null,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastRunStatus: (row.lastRunStatus as AudienceAuditEmailSchedule["lastRunStatus"]) ?? null,
    lastRunError: row.lastRunError ?? null,
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToRun(row: typeof audienceAuditEmailRuns.$inferSelect): AudienceAuditEmailRun {
  return {
    runId: row.runId,
    scheduleId: row.scheduleId,
    cadence: row.cadence as AudienceAuditCadence,
    triggeredBy: row.triggeredBy as "scheduler" | "manual",
    isTest: row.isTest ?? false,
    windowFrom: row.windowFrom.toISOString(),
    windowTo: row.windowTo.toISOString(),
    recipients: row.recipients ?? [],
    status: row.status as AudienceAuditEmailRun["status"],
    errorMessage: row.errorMessage ?? null,
    messageCount: row.messageCount,
    decisionCount: row.decisionCount,
    commandCount: row.commandCount,
    connectorCount: row.connectorCount,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export class AudienceAuditEmailScheduler {
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  async getSchedule(): Promise<AudienceAuditEmailSchedule> {
    const rows = await db
      .select()
      .from(audienceAuditEmailSchedules)
      .where(eq(audienceAuditEmailSchedules.scheduleId, DEFAULT_SCHEDULE_ID))
      .limit(1);
    if (rows[0]) return rowToSchedule(rows[0]);
    await db
      .insert(audienceAuditEmailSchedules)
      .values({
        scheduleId: DEFAULT_SCHEDULE_ID,
        enabled: false,
        cadence: "weekly",
        recipients: [],
        platform: null,
        productionId: null,
        nextRunAt: null,
      })
      .onConflictDoNothing({ target: audienceAuditEmailSchedules.scheduleId });
    const created = await db
      .select()
      .from(audienceAuditEmailSchedules)
      .where(eq(audienceAuditEmailSchedules.scheduleId, DEFAULT_SCHEDULE_ID))
      .limit(1);
    return rowToSchedule(created[0]);
  }

  async upsertSchedule(input: {
    enabled: boolean;
    cadence: AudienceAuditCadence;
    recipients: string[];
    platform?: AudiencePlatform | null;
    productionId?: string | null;
  }): Promise<AudienceAuditEmailSchedule> {
    await this.getSchedule();
    const now = new Date();
    const recipients = Array.from(new Set(input.recipients.map((r) => r.trim().toLowerCase()).filter(Boolean)));
    if (input.enabled && recipients.length === 0) {
      throw new Error("at least one recipient is required when enabled");
    }
    const current = await this.getSchedule();
    const nextRunAt = input.enabled
      ? (current.nextRunAt ? new Date(current.nextRunAt) : computeNextRun(input.cadence, now))
      : null;
    await db
      .update(audienceAuditEmailSchedules)
      .set({
        enabled: input.enabled,
        cadence: input.cadence,
        recipients,
        platform: input.platform ?? null,
        productionId: input.productionId ?? null,
        nextRunAt,
        updatedAt: now,
      })
      .where(eq(audienceAuditEmailSchedules.scheduleId, DEFAULT_SCHEDULE_ID));
    return this.getSchedule();
  }

  async listRuns(limit = 20): Promise<AudienceAuditEmailRun[]> {
    const cap = Math.max(1, Math.min(limit, 200));
    const rows = await db
      .select()
      .from(audienceAuditEmailRuns)
      .where(eq(audienceAuditEmailRuns.scheduleId, DEFAULT_SCHEDULE_ID))
      .orderBy(desc(audienceAuditEmailRuns.startedAt))
      .limit(cap);
    return rows.map(rowToRun);
  }

  async previewNow(): Promise<{
    schedule: AudienceAuditEmailSchedule;
    windowFrom: string;
    windowTo: string;
    subject: string;
    html: string;
    recipients: string[];
    attachments: Array<{ filename: string; sizeBytes: number }>;
    messageCount: number;
    decisionCount: number;
    commandCount: number;
    connectorCount: number;
  }> {
    const schedule = await this.getSchedule();
    const now = new Date();
    const { from, to } = computeWindow(schedule.cadence, now);
    const data = await omniChannelAudienceSafetyService.exportAuditTrail({
      fromDate: from,
      toDate: to,
      platform: schedule.platform ?? undefined,
      productionId: schedule.productionId ?? undefined,
    });
    const stamp = data.exportedAt.replace(/[:.]/g, "-");
    const jsonContent = JSON.stringify(
      {
        ...data,
        platformSendAllowed: false,
        realSendAllowed: false,
        notice:
          "Audience moderation audit trail. PII is redacted at ingestion (hashed authorIds, scrubbed metadata).",
      },
      null,
      2,
    );
    const csvContent = buildAudienceAuditCsv(data);
    const backlog = await loadStalePendingDigestBlock();
    const built = emailService.buildAudienceAuditExportEmail({
      cadence: schedule.cadence,
      windowFrom: from,
      windowTo: to,
      messageCount: data.messages.length,
      decisionCount: data.decisions.length,
      commandCount: data.commands.length,
      connectorCount: data.connectors.length,
      jsonContent,
      csvContent,
      jsonFilename: `audience-audit-trail-${stamp}.json`,
      csvFilename: `audience-audit-trail-${stamp}.csv`,
      triggeredBy: "manual",
      stalePendingTrendLine: backlog.trendLine,
      stalePendingHistoryLines: backlog.historyLines,
      stalePendingHistoryLength: backlog.history.length,
      stalePendingSeries: backlog.series,
    });
    return {
      schedule,
      windowFrom: from.toISOString(),
      windowTo: to.toISOString(),
      subject: built.subject,
      html: built.html,
      recipients: schedule.recipients,
      attachments: built.attachments,
      messageCount: data.messages.length,
      decisionCount: data.decisions.length,
      commandCount: data.commands.length,
      connectorCount: data.connectors.length,
    };
  }

  async runNow(triggeredBy: "scheduler" | "manual"): Promise<AudienceAuditEmailRun> {
    const schedule = await this.getSchedule();
    if (schedule.recipients.length === 0) {
      throw new Error("no recipients configured");
    }
    return this.executeRun(schedule, triggeredBy, new Date());
  }

  /**
   * Task #409 — Send the previewed email to a single admin address only.
   * Does NOT use the schedule's configured recipients and does NOT update
   * `lastRunAt` / `nextRunAt` on the schedule row, since it is a test send.
   * The run is still persisted with triggeredBy="manual" and the admin's
   * email as the sole recipient (which serves as the test marker).
   */
  async sendTestNow(adminEmail: string): Promise<AudienceAuditEmailRun> {
    const normalized = adminEmail.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new Error("invalid admin email");
    }
    const schedule = await this.getSchedule();
    return this.executeRun(schedule, "manual", new Date(), {
      recipientsOverride: [normalized],
      updateScheduleState: false,
      isTest: true,
    });
  }

  private async executeRun(
    schedule: AudienceAuditEmailSchedule,
    triggeredBy: "scheduler" | "manual",
    now: Date,
    opts: { recipientsOverride?: string[]; updateScheduleState?: boolean; isTest?: boolean } = {},
  ): Promise<AudienceAuditEmailRun> {
    const recipients = opts.recipientsOverride ?? schedule.recipients;
    const updateScheduleState = opts.updateScheduleState !== false;
    const isTest = opts.isTest === true;
    const { from, to } = computeWindow(schedule.cadence, now);
    const runId = newRunId();
    await db.insert(audienceAuditEmailRuns).values({
      runId,
      scheduleId: schedule.scheduleId,
      cadence: schedule.cadence,
      triggeredBy,
      isTest,
      windowFrom: from,
      windowTo: to,
      recipients,
      status: "pending",
      startedAt: now,
    });

    let status: "success" | "failed" = "success";
    let errorMessage: string | null = null;
    let messageCount = 0;
    let decisionCount = 0;
    let commandCount = 0;
    let connectorCount = 0;

    try {
      const data = await omniChannelAudienceSafetyService.exportAuditTrail({
        fromDate: from,
        toDate: to,
        platform: schedule.platform ?? undefined,
        productionId: schedule.productionId ?? undefined,
      });
      messageCount = data.messages.length;
      decisionCount = data.decisions.length;
      commandCount = data.commands.length;
      connectorCount = data.connectors.length;

      const stamp = data.exportedAt.replace(/[:.]/g, "-");
      const jsonContent = JSON.stringify(
        {
          ...data,
          platformSendAllowed: false,
          realSendAllowed: false,
          notice:
            "Audience moderation audit trail. PII is redacted at ingestion (hashed authorIds, scrubbed metadata).",
        },
        null,
        2,
      );
      const csvContent = buildAudienceAuditCsv(data);
      const backlog = await loadStalePendingDigestBlock();

      await emailService.sendAudienceAuditExport(recipients, {
        cadence: schedule.cadence,
        windowFrom: from,
        windowTo: to,
        messageCount,
        decisionCount,
        commandCount,
        connectorCount,
        jsonContent,
        csvContent,
        jsonFilename: `audience-audit-trail-${stamp}.json`,
        csvFilename: `audience-audit-trail-${stamp}.csv`,
        triggeredBy,
        stalePendingTrendLine: backlog.trendLine,
        stalePendingHistoryLines: backlog.historyLines,
        stalePendingHistoryLength: backlog.history.length,
        stalePendingSeries: backlog.series,
      });
    } catch (e: any) {
      status = "failed";
      errorMessage = (e?.message ?? String(e)).slice(0, 500);
      console.error("[audience-audit-email] run failed:", errorMessage);
    }

    // Task #520 — alert founder when scheduler runs keep failing, and
    // auto-clear the banner once delivery recovers. Manual / test sends
    // are excluded so a deliberate "send test to me" failure cannot
    // fire the founder alert.
    if (triggeredBy === "scheduler" && !isTest) {
      if (status === "failed") {
        await audienceAuditEmailFailureAlertService
          .notifyFailure({
            runId,
            error: errorMessage ?? "unknown_error",
            cadence: schedule.cadence,
            recipients,
          })
          .catch((alertErr) =>
            console.error(
              "[audience-audit-email] failure-alert notifyFailure threw:",
              (alertErr as Error)?.message ?? alertErr,
            ),
          );
      } else {
        await audienceAuditEmailFailureAlertService
          .notifySuccess({ runId, cadence: schedule.cadence })
          .catch((alertErr) =>
            console.error(
              "[audience-audit-email] failure-alert notifySuccess threw:",
              (alertErr as Error)?.message ?? alertErr,
            ),
          );
      }
    }

    const completedAt = new Date();
    await db
      .update(audienceAuditEmailRuns)
      .set({
        status,
        errorMessage,
        messageCount,
        decisionCount,
        commandCount,
        connectorCount,
        completedAt,
      })
      .where(eq(audienceAuditEmailRuns.runId, runId));

    if (updateScheduleState) {
      const nextRunAt = schedule.enabled ? computeNextRun(schedule.cadence, completedAt) : null;
      await db
        .update(audienceAuditEmailSchedules)
        .set({
          lastRunAt: completedAt,
          lastRunStatus: status,
          lastRunError: errorMessage,
          nextRunAt,
        })
        .where(eq(audienceAuditEmailSchedules.scheduleId, schedule.scheduleId));
    }

    const rows = await db
      .select()
      .from(audienceAuditEmailRuns)
      .where(eq(audienceAuditEmailRuns.runId, runId))
      .limit(1);
    return rowToRun(rows[0]);
  }

  async tick(now: Date = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const schedule = await this.getSchedule();
      if (!schedule.enabled || schedule.recipients.length === 0) return;
      const nextRunAt = schedule.nextRunAt ? new Date(schedule.nextRunAt) : null;
      if (nextRunAt && nextRunAt.getTime() > now.getTime()) return;
      await this.executeRun(schedule, "scheduler", now);
    } catch (e: any) {
      console.error("[audience-audit-email] tick error:", e?.message ?? e);
    } finally {
      this.ticking = false;
    }
  }

  startScheduler(checkIntervalMs = 15 * 60 * 1000): void {
    if (this.timerHandle) return;
    console.log(
      `[audience-audit-email] scheduler started (check every ${Math.round(checkIntervalMs / 60000)}m)`,
    );
    this.timerHandle = setInterval(() => {
      this.tick().catch((e) =>
        console.error("[audience-audit-email] scheduled tick error:", (e as Error)?.message ?? e),
      );
    }, checkIntervalMs);
  }

  stop(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
      console.log("[audience-audit-email] scheduler stopped");
    }
  }

  /** Test-only: truncate schedule + run tables. */
  async resetForTests(): Promise<void> {
    if (process.env.NODE_ENV !== "test") return;
    await db.execute(sql`TRUNCATE TABLE audience_audit_email_runs, audience_audit_email_schedules`);
  }
}

export const audienceAuditEmailScheduler = new AudienceAuditEmailScheduler();
