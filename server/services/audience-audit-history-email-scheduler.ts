/**
 * Scheduled compliance email for the audit-export *history* (meta-audit)
 * (Task #432).
 *
 * Mirrors {@link AudienceAuditEmailScheduler} but, instead of mailing the
 * audience moderation audit trail itself, it mails the meta-audit "who
 * exported what, when" history (the same payload backing
 * `GET /api/admin/newsroom/audience/export-log/export`). Lives in the
 * same `audience_audit_email_schedules` / `audience_audit_email_runs`
 * tables, keyed by `scheduleId="history"`, so it can be configured
 * independently of the audit-trail email.
 *
 * Hard rules:
 *   - Same locked AUDIENCE_SAFETY envelope — no platform API is touched,
 *     this only re-uses the read-only `listAllAuditExports`.
 *   - Recipients are root-admin–editable only (route requires root admin
 *     + CSRF). Recipients are validated as RFC-shaped emails server-side.
 *   - Every send writes TWO rows to `audience_audit_exports`
 *     (`json-history` + `csv-history`) so each variant is itself
 *     traceable — matching the behavior of the existing on-demand
 *     `/export-log/export` download.
 *   - Run-level failures never throw out of the tick loop.
 */

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "../db";
import {
  audienceAuditEmailRuns,
  audienceAuditEmailSchedules,
  AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID,
  type AudienceAuditCadence,
  type AudienceAuditEmailRun,
  type AudienceAuditEmailSchedule,
} from "../../shared/omni-channel-audience-schema";
import { omniChannelAudienceSafetyService } from "./omni-channel-audience-safety-service";
import { buildAudienceAuditExportLogCsv } from "./audience-audit-csv";
import { emailService } from "./email-service";
import { audienceAuditHistoryEmailFailureAlertService } from "./audience-audit-history-email-failure-alert-service";

const SCHEDULE_ID = AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SCHEDULER_ACTOR_ID = "scheduler:audience-audit-history-email";

function newRunId(): string {
  return `aud_hist_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    platform: null,
    productionId: null,
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
    // For history runs, reuse `messageCount` to mean "total meta-audit
    // rows attached". decision/command/connector counts stay zero — the
    // attached payload has only the history table rows.
    messageCount: row.messageCount,
    decisionCount: row.decisionCount,
    commandCount: row.commandCount,
    connectorCount: row.connectorCount,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export class AudienceAuditHistoryEmailScheduler {
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  async getSchedule(): Promise<AudienceAuditEmailSchedule> {
    const rows = await db
      .select()
      .from(audienceAuditEmailSchedules)
      .where(eq(audienceAuditEmailSchedules.scheduleId, SCHEDULE_ID))
      .limit(1);
    if (rows[0]) return rowToSchedule(rows[0]);
    await db
      .insert(audienceAuditEmailSchedules)
      .values({
        scheduleId: SCHEDULE_ID,
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
      .where(eq(audienceAuditEmailSchedules.scheduleId, SCHEDULE_ID))
      .limit(1);
    return rowToSchedule(created[0]);
  }

  async upsertSchedule(input: {
    enabled: boolean;
    cadence: AudienceAuditCadence;
    recipients: string[];
  }): Promise<AudienceAuditEmailSchedule> {
    await this.getSchedule();
    const now = new Date();
    const recipients = Array.from(
      new Set(input.recipients.map((r) => r.trim().toLowerCase()).filter(Boolean)),
    );
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
        platform: null,
        productionId: null,
        nextRunAt,
        updatedAt: now,
      })
      .where(eq(audienceAuditEmailSchedules.scheduleId, SCHEDULE_ID));
    return this.getSchedule();
  }

  /**
   * Aggregate run stats for the compliance panel (Task #481). Counts
   * runs whose `startedAt` is within the last `windowDays` days, plus
   * the most recent successful delivery and the history rows it
   * shipped. `excludeTestRuns` is on by default so the panel reflects
   * real compliance deliveries.
   */
  /**
   * Resolves the effective time window for a stats/list query.
   * Explicit `from`/`to` always win over `windowDays`. If only one of
   * `from`/`to` is provided, the other defaults to "beginning of time" /
   * "now". When neither is provided, falls back to the rolling
   * `windowDays` window anchored at `now`.
   */
  private resolveWindow(
    opts: { windowDays?: number; from?: string | Date | null; to?: string | Date | null },
    defaultWindowDays: number,
    now: Date,
  ): { windowStart: Date; windowEnd: Date | null; windowDays: number; usedExplicitRange: boolean } {
    const parse = (v: string | Date | null | undefined): Date | null => {
      if (v === null || v === undefined || v === "") return null;
      const d = v instanceof Date ? v : new Date(v);
      return Number.isFinite(d.getTime()) ? d : null;
    };
    const fromD = parse(opts.from ?? null);
    const toD = parse(opts.to ?? null);
    if (fromD || toD) {
      const start = fromD ?? new Date(0);
      const end = toD ?? now;
      const days = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
      );
      return { windowStart: start, windowEnd: end, windowDays: days, usedExplicitRange: true };
    }
    const windowDays = Math.max(1, Math.min(opts.windowDays ?? defaultWindowDays, 365));
    return {
      windowStart: new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000),
      windowEnd: null,
      windowDays,
      usedExplicitRange: false,
    };
  }

  private normalizeRecipient(r: string | null | undefined): string | null {
    if (!r) return null;
    const v = r.trim().toLowerCase();
    return v.length ? v : null;
  }

  /**
   * List unique recipient inboxes ever attached to a run (excluding
   * test sends by default). Used to populate the compliance panel's
   * recipient picker.
   */
  async listKnownRecipients(opts: { excludeTestRuns?: boolean } = {}): Promise<string[]> {
    const excludeTestRuns = opts.excludeTestRuns !== false;
    const rows = await db
      .select({ recipients: audienceAuditEmailRuns.recipients, isTest: audienceAuditEmailRuns.isTest })
      .from(audienceAuditEmailRuns)
      .where(eq(audienceAuditEmailRuns.scheduleId, SCHEDULE_ID));
    const set = new Set<string>();
    for (const r of rows) {
      if (excludeTestRuns && r.isTest) continue;
      for (const addr of r.recipients ?? []) {
        const n = this.normalizeRecipient(addr);
        if (n) set.add(n);
      }
    }
    return Array.from(set).sort();
  }

  async getRunStats(
    opts: {
      windowDays?: number;
      excludeTestRuns?: boolean;
      from?: string | Date | null;
      to?: string | Date | null;
      recipient?: string | null;
    } = {},
  ): Promise<{
    windowDays: number;
    windowStart: string;
    windowEnd: string | null;
    usedExplicitRange: boolean;
    recipient: string | null;
    totalSends: number;
    successCount: number;
    failureCount: number;
    pendingCount: number;
    lastSuccessfulRunAt: string | null;
    lastSuccessfulRunAgeMs: number | null;
    lastSuccessfulHistoryRows: number | null;
    lastRunAt: string | null;
    lastRunStatus: AudienceAuditEmailRun["status"] | null;
    excludesTestRuns: boolean;
  }> {
    const excludeTestRuns = opts.excludeTestRuns !== false;
    const now = new Date();
    const { windowStart, windowEnd, windowDays, usedExplicitRange } = this.resolveWindow(
      opts,
      30,
      now,
    );
    const recipient = this.normalizeRecipient(opts.recipient ?? null);
    const filters = [
      eq(audienceAuditEmailRuns.scheduleId, SCHEDULE_ID),
      gte(audienceAuditEmailRuns.startedAt, windowStart),
    ];
    if (windowEnd) filters.push(lte(audienceAuditEmailRuns.startedAt, windowEnd));
    if (recipient) {
      filters.push(sql`${recipient} = ANY(${audienceAuditEmailRuns.recipients})`);
    }
    const rows = await db
      .select()
      .from(audienceAuditEmailRuns)
      .where(and(...filters));
    const considered = excludeTestRuns ? rows.filter((r) => !r.isTest) : rows;
    let successCount = 0;
    let failureCount = 0;
    let pendingCount = 0;
    for (const r of considered) {
      if (r.status === "success") successCount += 1;
      else if (r.status === "failed") failureCount += 1;
      else pendingCount += 1;
    }
    // For "last successful" / "last run" lookups we also honor the
    // recipient filter so the panel reflects the inbox under audit, but
    // we deliberately ignore the time window so a quarter-scoped view
    // can still show "last successful delivery" for that inbox.
    const tailFilters = [eq(audienceAuditEmailRuns.scheduleId, SCHEDULE_ID)];
    if (recipient) {
      tailFilters.push(sql`${recipient} = ANY(${audienceAuditEmailRuns.recipients})`);
    }
    const successRows = await db
      .select()
      .from(audienceAuditEmailRuns)
      .where(and(...tailFilters, eq(audienceAuditEmailRuns.status, "success")))
      .orderBy(desc(audienceAuditEmailRuns.completedAt))
      .limit(50);
    const lastSuccess = successRows.find((r) => (excludeTestRuns ? !r.isTest : true)) ?? null;
    const lastRunRows = await db
      .select()
      .from(audienceAuditEmailRuns)
      .where(and(...tailFilters))
      .orderBy(desc(audienceAuditEmailRuns.startedAt))
      .limit(20);
    const lastRun =
      lastRunRows.find((r) => (excludeTestRuns ? !r.isTest : true)) ?? null;
    const lastSuccessAt =
      lastSuccess?.completedAt ?? lastSuccess?.startedAt ?? null;
    return {
      windowDays,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd ? windowEnd.toISOString() : null,
      usedExplicitRange,
      recipient,
      totalSends: considered.length,
      successCount,
      failureCount,
      pendingCount,
      lastSuccessfulRunAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
      lastSuccessfulRunAgeMs: lastSuccessAt
        ? Math.max(0, now.getTime() - lastSuccessAt.getTime())
        : null,
      lastSuccessfulHistoryRows: lastSuccess ? lastSuccess.messageCount : null,
      lastRunAt: lastRun
        ? (lastRun.completedAt ?? lastRun.startedAt).toISOString()
        : null,
      lastRunStatus: (lastRun?.status as AudienceAuditEmailRun["status"]) ?? null,
      excludesTestRuns: excludeTestRuns,
    };
  }

  /**
   * Per-recipient success-rate breakdown for the compliance panel
   * (Task #575). Counts runs whose `startedAt` is within the same
   * window as `getRunStats`, honors the same recipient filter, and
   * fans out across each recipient inbox attached to a run so an
   * auditor can see at a glance which inbox is silently failing.
   *
   * Sorted by failure count desc, then total sends desc, then by
   * recipient string asc for stable output.
   */
  async getRunStatsByRecipient(
    opts: {
      windowDays?: number;
      excludeTestRuns?: boolean;
      from?: string | Date | null;
      to?: string | Date | null;
      recipient?: string | null;
    } = {},
  ): Promise<
    Array<{
      recipient: string;
      totalSends: number;
      successCount: number;
      failureCount: number;
      pendingCount: number;
      successRate: number;
      lastSuccessfulRunAt: string | null;
    }>
  > {
    const excludeTestRuns = opts.excludeTestRuns !== false;
    const now = new Date();
    const { windowStart, windowEnd } = this.resolveWindow(opts, 30, now);
    const recipientFilter = this.normalizeRecipient(opts.recipient ?? null);
    const filters = [
      eq(audienceAuditEmailRuns.scheduleId, SCHEDULE_ID),
      gte(audienceAuditEmailRuns.startedAt, windowStart),
    ];
    if (windowEnd) filters.push(lte(audienceAuditEmailRuns.startedAt, windowEnd));
    if (recipientFilter) {
      filters.push(sql`${recipientFilter} = ANY(${audienceAuditEmailRuns.recipients})`);
    }
    const rows = await db
      .select()
      .from(audienceAuditEmailRuns)
      .where(and(...filters));
    const considered = excludeTestRuns ? rows.filter((r) => !r.isTest) : rows;
    type Bucket = {
      recipient: string;
      totalSends: number;
      successCount: number;
      failureCount: number;
      pendingCount: number;
      lastSuccessfulAt: Date | null;
    };
    const buckets = new Map<string, Bucket>();
    for (const r of considered) {
      const recipients = Array.isArray(r.recipients) ? r.recipients : [];
      for (const raw of recipients) {
        const addr = this.normalizeRecipient(raw);
        if (!addr) continue;
        if (recipientFilter && addr !== recipientFilter) continue;
        let b = buckets.get(addr);
        if (!b) {
          b = {
            recipient: addr,
            totalSends: 0,
            successCount: 0,
            failureCount: 0,
            pendingCount: 0,
            lastSuccessfulAt: null,
          };
          buckets.set(addr, b);
        }
        b.totalSends += 1;
        if (r.status === "success") {
          b.successCount += 1;
          const ts = r.completedAt ?? r.startedAt;
          if (ts && (!b.lastSuccessfulAt || ts.getTime() > b.lastSuccessfulAt.getTime())) {
            b.lastSuccessfulAt = ts;
          }
        } else if (r.status === "failed") {
          b.failureCount += 1;
        } else {
          b.pendingCount += 1;
        }
      }
    }
    return Array.from(buckets.values())
      .map((b) => ({
        recipient: b.recipient,
        totalSends: b.totalSends,
        successCount: b.successCount,
        failureCount: b.failureCount,
        pendingCount: b.pendingCount,
        successRate: b.totalSends > 0 ? b.successCount / b.totalSends : 0,
        lastSuccessfulRunAt: b.lastSuccessfulAt
          ? b.lastSuccessfulAt.toISOString()
          : null,
      }))
      .sort((a, b) => {
        if (b.failureCount !== a.failureCount) return b.failureCount - a.failureCount;
        if (b.totalSends !== a.totalSends) return b.totalSends - a.totalSends;
        return a.recipient.localeCompare(b.recipient);
      });
  }

  /**
   * Plain-rows export of recent run history for the compliance binder
   * (Task #481). Defaults to a 90-day window. Returns the rows so the
   * caller can serialize to CSV / JSON.
   */
  async listRecentRuns(
    opts: {
      windowDays?: number;
      from?: string | Date | null;
      to?: string | Date | null;
      recipient?: string | null;
    } = {},
  ): Promise<AudienceAuditEmailRun[]> {
    const now = new Date();
    const { windowStart, windowEnd } = this.resolveWindow(opts, 90, now);
    const recipient = this.normalizeRecipient(opts.recipient ?? null);
    const filters = [
      eq(audienceAuditEmailRuns.scheduleId, SCHEDULE_ID),
      gte(audienceAuditEmailRuns.startedAt, windowStart),
    ];
    if (windowEnd) filters.push(lte(audienceAuditEmailRuns.startedAt, windowEnd));
    if (recipient) {
      filters.push(sql`${recipient} = ANY(${audienceAuditEmailRuns.recipients})`);
    }
    const rows = await db
      .select()
      .from(audienceAuditEmailRuns)
      .where(and(...filters))
      .orderBy(desc(audienceAuditEmailRuns.startedAt));
    return rows.map(rowToRun);
  }

  async listRuns(limit = 20): Promise<AudienceAuditEmailRun[]> {
    const cap = Math.max(1, Math.min(limit, 200));
    const rows = await db
      .select()
      .from(audienceAuditEmailRuns)
      .where(eq(audienceAuditEmailRuns.scheduleId, SCHEDULE_ID))
      .orderBy(desc(audienceAuditEmailRuns.startedAt))
      .limit(cap);
    return rows.map(rowToRun);
  }

  private async loadPayload(): Promise<{
    exports: Awaited<ReturnType<typeof omniChannelAudienceSafetyService.listAllAuditExports>>;
    exportedAt: string;
    jsonContent: string;
    csvContent: string;
    jsonFilename: string;
    csvFilename: string;
  }> {
    const exports = await omniChannelAudienceSafetyService.listAllAuditExports();
    const exportedAt = new Date().toISOString();
    const jsonContent = JSON.stringify(
      {
        exports,
        exportedAt,
        totalExports: exports.length,
        platformSendAllowed: false,
        realSendAllowed: false,
        notice:
          "Meta-audit trail of every audience-moderation audit-export download. This send was itself logged in the audit-export trail with format=json-history and format=csv-history.",
      },
      null,
      2,
    );
    const csvContent = buildAudienceAuditExportLogCsv({
      exports,
      exportedAt,
      totalExports: exports.length,
    });
    const stamp = exportedAt.replace(/[:.]/g, "-");
    return {
      exports,
      exportedAt,
      jsonContent,
      csvContent,
      jsonFilename: `audience-audit-export-history-${stamp}.json`,
      csvFilename: `audience-audit-export-history-${stamp}.csv`,
    };
  }

  async previewNow(): Promise<{
    schedule: AudienceAuditEmailSchedule;
    exportedAt: string;
    subject: string;
    html: string;
    recipients: string[];
    attachments: Array<{ filename: string; sizeBytes: number }>;
    totalExports: number;
  }> {
    const schedule = await this.getSchedule();
    const p = await this.loadPayload();
    const built = emailService.buildAudienceAuditHistoryExportEmail({
      cadence: schedule.cadence,
      totalExports: p.exports.length,
      exportedAt: p.exportedAt,
      jsonContent: p.jsonContent,
      csvContent: p.csvContent,
      jsonFilename: p.jsonFilename,
      csvFilename: p.csvFilename,
      triggeredBy: "manual",
    });
    return {
      schedule,
      exportedAt: p.exportedAt,
      subject: built.subject,
      html: built.html,
      recipients: schedule.recipients,
      attachments: built.attachments,
      totalExports: p.exports.length,
    };
  }

  async runNow(triggeredBy: "scheduler" | "manual"): Promise<AudienceAuditEmailRun> {
    const schedule = await this.getSchedule();
    if (schedule.recipients.length === 0) {
      throw new Error("no recipients configured");
    }
    return this.executeRun(schedule, triggeredBy, new Date());
  }

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
    const runId = newRunId();
    // For meta-audit history, the "window" is "from beginning of time to
    // now" — there's no rolling window. Use the same instant for both so
    // the run row carries the send moment.
    const windowFrom = now;
    const windowTo = now;
    await db.insert(audienceAuditEmailRuns).values({
      runId,
      scheduleId: schedule.scheduleId,
      cadence: schedule.cadence,
      triggeredBy,
      isTest,
      windowFrom,
      windowTo,
      recipients,
      status: "pending",
      startedAt: now,
    });

    let status: "success" | "failed" = "success";
    let errorMessage: string | null = null;
    let totalExports = 0;

    try {
      const p = await this.loadPayload();
      totalExports = p.exports.length;
      await emailService.sendAudienceAuditHistoryExport(recipients, {
        cadence: schedule.cadence,
        totalExports,
        exportedAt: p.exportedAt,
        jsonContent: p.jsonContent,
        csvContent: p.csvContent,
        jsonFilename: p.jsonFilename,
        csvFilename: p.csvFilename,
        triggeredBy,
      });

      // Each variant attached -> one meta-audit row per format, mirroring
      // what `/export-log/export` writes when an admin downloads on demand.
      // Skipped for test sends so the meta-audit reflects real compliance
      // deliveries only.
      if (!isTest) {
        const auditFilters = {
          fromDate: null,
          toDate: null,
          platform: null,
          productionId: "__audit_export_log__",
        } as const;
        const rowCounts = {
          connectors: 0,
          messages: totalExports,
          decisions: 0,
          commands: 0,
        };
        await omniChannelAudienceSafetyService.recordAuditExport({
          actorId: SCHEDULER_ACTOR_ID,
          actorType: "scheduler",
          actorRole: "audience-audit-history-email",
          format: "json-history",
          filters: auditFilters,
          rowCounts,
        });
        await omniChannelAudienceSafetyService.recordAuditExport({
          actorId: SCHEDULER_ACTOR_ID,
          actorType: "scheduler",
          actorRole: "audience-audit-history-email",
          format: "csv-history",
          filters: auditFilters,
          rowCounts,
        });
      }
    } catch (e: any) {
      status = "failed";
      errorMessage = (e?.message ?? String(e)).slice(0, 500);
      console.error("[audience-audit-history-email] run failed:", errorMessage);
    }

    // Task #482 — alert founder when scheduler runs keep failing, and
    // auto-clear the banner once delivery recovers. Manual / test sends
    // are excluded so a deliberate "send test to me" failure cannot
    // fire the founder alert.
    if (triggeredBy === "scheduler" && !isTest) {
      if (status === "failed") {
        await audienceAuditHistoryEmailFailureAlertService
          .notifyFailure({
            runId,
            error: errorMessage ?? "unknown_error",
            cadence: schedule.cadence,
            recipients,
          })
          .catch((alertErr) =>
            console.error(
              "[audience-audit-history-email] failure-alert notifyFailure threw:",
              (alertErr as Error)?.message ?? alertErr,
            ),
          );
      } else {
        await audienceAuditHistoryEmailFailureAlertService
          .notifySuccess({ runId, cadence: schedule.cadence })
          .catch((alertErr) =>
            console.error(
              "[audience-audit-history-email] failure-alert notifySuccess threw:",
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
        // Reuse `messageCount` to record the total meta-audit rows shipped.
        messageCount: totalExports,
        decisionCount: 0,
        commandCount: 0,
        connectorCount: 0,
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
      console.error("[audience-audit-history-email] tick error:", e?.message ?? e);
    } finally {
      this.ticking = false;
    }
  }

  startScheduler(checkIntervalMs = 15 * 60 * 1000): void {
    if (this.timerHandle) return;
    console.log(
      `[audience-audit-history-email] scheduler started (check every ${Math.round(
        checkIntervalMs / 60000,
      )}m)`,
    );
    this.timerHandle = setInterval(() => {
      this.tick().catch((e) =>
        console.error(
          "[audience-audit-history-email] scheduled tick error:",
          (e as Error)?.message ?? e,
        ),
      );
    }, checkIntervalMs);
  }

  stop(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
      console.log("[audience-audit-history-email] scheduler stopped");
    }
  }

  /** Test-only: wipe just this scheduler's rows (history schedule + runs). */
  async resetForTests(): Promise<void> {
    if (process.env.NODE_ENV !== "test") return;
    await db
      .delete(audienceAuditEmailRuns)
      .where(eq(audienceAuditEmailRuns.scheduleId, SCHEDULE_ID));
    await db
      .delete(audienceAuditEmailSchedules)
      .where(eq(audienceAuditEmailSchedules.scheduleId, SCHEDULE_ID));
  }
}

export const audienceAuditHistoryEmailScheduler = new AudienceAuditHistoryEmailScheduler();
