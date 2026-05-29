/**
 * Audience-retention sweep failure alert (Task #389).
 *
 * The daily audience-retention sweeper
 * (`audience-retention-service.ts`) prunes rows from `audience_messages`,
 * `audience_safety_decisions`, and `audience_moderation_commands` older
 * than the configured window. Failures are stored on the last-run
 * summary and logged to the console, but there is no proactive
 * notification — if Supabase is unreachable for several days the audit
 * tables silently keep growing.
 *
 * This service mirrors `broadcast-sweep-failure-alert-service.ts`:
 *   - Creates a `platform_alerts` row via `panicButtonService.createAlert`
 *     so the alert shows up on the founder dashboard.
 *   - Sends a best-effort email to every active root admin via the shared
 *     `EmailService`.
 *   - Rate-limits notifications so a sweep that keeps failing every tick
 *     does not spam the founder's inbox.
 *   - Auto-resolves any open `audience_retention_sweep_failure` alerts the
 *     next time the sweep succeeds, so admins do not have to clear stale
 *     warnings by hand.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { adminStaff, platformAlerts } from "@shared/schema";
import { panicButtonService } from "./panic-button-service";
import { EmailService } from "./email-service";
import {
  audienceRetentionGrowthStreakThreshold,
  getStalePendingHistory,
  summarizeStalePendingTrend,
  type AudienceStalePendingHistoryEntry,
} from "./audience-retention-service";

export const AUDIENCE_RETENTION_ALERT_TYPE = "audience_retention_sweep_failure";
/**
 * Task #486 — how many recent stale-pending samples to include in the
 * founder alert email / platform_alerts details so the founder can tell
 * at a glance whether the backlog is growing or shrinking without
 * opening the admin dashboard.
 */
export const AUDIENCE_RETENTION_ALERT_HISTORY_SAMPLES = 5;

const DEFAULT_DEDUP_MS = 60 * 60 * 1000;

function dedupWindowMs(): number {
  const raw = Number(process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_DEDUP_MS;
}

const ALERT_LINK = "/admin/omni-channel-audience#retention";

export interface AudienceRetentionFailureContext {
  error: string;
  cutoffIso: string;
  retentionDays: number;
  trigger: "scheduled" | "manual" | "cli";
}

class AudienceRetentionFailureAlertService {
  private lastAlertAt: number | null = null;
  private suppressedSince: number | null = null;
  private suppressedCount = 0;
  private consecutiveFailures = 0;
  private emailService = new EmailService();

  /**
   * Record a failed sweep run and fire a founder alert + email when the
   * rate limit allows. Safe to call on every failed tick; the service
   * handles dedup internally.
   *
   * Returns `true` if a notification was actually fired, `false` if it
   * was suppressed by the rate limit.
   */
  async notifyFailure(ctx: AudienceRetentionFailureContext): Promise<boolean> {
    this.consecutiveFailures += 1;
    const now = Date.now();
    const window = dedupWindowMs();
    if (this.lastAlertAt != null && window > 0 && now - this.lastAlertAt < window) {
      this.suppressedSince ??= this.lastAlertAt;
      this.suppressedCount += 1;
      return false;
    }

    // Task #620 — central founder PTO mode mutes this notifier without
    // resetting the suppressed/last-alert counters, so the first post-PTO
    // failure still includes a faithful "N similar failures since T" note.
    try {
      const { isNotifierMutedByPto, bumpFounderPtoSuppressedCount } =
        await import("./founder-pto-mode-service");
      const ptoSnooze = await isNotifierMutedByPto("audience_retention_failure");
      if (ptoSnooze) {
        this.suppressedSince ??= this.lastAlertAt ?? now;
        this.suppressedCount += 1;
        await bumpFounderPtoSuppressedCount();
        return false;
      }
    } catch (err) {
      console.error(
        "[AudienceRetentionFailureAlert] PTO mode check failed:",
        (err as Error)?.message ?? err,
      );
    }

    const suppressedCount = this.suppressedCount;
    const suppressedSince = this.suppressedSince;
    this.lastAlertAt = now;
    this.suppressedSince = null;
    this.suppressedCount = 0;

    const title = "Audience retention sweep failed";
    const truncatedDetail =
      ctx.error.length > 500 ? `${ctx.error.slice(0, 500)}…` : ctx.error;
    const repeatedNote =
      suppressedCount > 0
        ? ` (${suppressedCount} similar failure${
            suppressedCount === 1 ? "" : "s"
          } suppressed since ${
            suppressedSince ? new Date(suppressedSince).toISOString() : "?"
          })`
        : this.consecutiveFailures > 1
          ? ` (${this.consecutiveFailures} consecutive failures)`
          : "";
    // Task #486 — pull the last N stale-pending samples so the founder
    // can see whether the backlog is shrinking or growing without
    // opening the admin Audience page. Best-effort: a history-read
    // failure must not block the alert itself.
    let history: AudienceStalePendingHistoryEntry[] = [];
    try {
      history = await getStalePendingHistory(AUDIENCE_RETENTION_ALERT_HISTORY_SAMPLES);
    } catch (err) {
      console.warn(
        "[AudienceRetentionFailureAlert] failed to load stale-pending history:",
        (err as Error)?.message ?? String(err),
      );
    }
    const trend = summarizeStalePendingTrend(history);
    const trendLine = formatTrendLine(trend);
    const historyLines = formatHistoryLines(history);
    // Task #544 — when any table has been growing N sweeps in a row
    // (default 3), surface that streak prominently in the alert so the
    // founder can distinguish a sustained backlog from a one-off blip.
    const streakThreshold = audienceRetentionGrowthStreakThreshold();
    const streakOffenders = (
      ["messages", "decisions", "commands"] as const
    )
      .map((k) => ({ table: k, streak: trend.tables[k].consecutiveGrowthStreak }))
      .filter((s) => s.streak >= streakThreshold);
    const streakLine =
      streakOffenders.length > 0
        ? `Backlog growing ${streakThreshold}+ sweeps in a row: ${streakOffenders
            .map((s) => `${s.table} (${s.streak} sweeps)`)
            .join(", ")}`
        : "";

    const message =
      `${title}: ${truncatedDetail} ` +
      `(cutoff=${ctx.cutoffIso}, retentionDays=${ctx.retentionDays}, trigger=${ctx.trigger})` +
      repeatedNote +
      (streakLine ? ` — ${streakLine}` : "") +
      (trendLine ? ` — Backlog trend: ${trendLine}` : "");

    try {
      await panicButtonService.createAlert({
        type: AUDIENCE_RETENTION_ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          source: "audience-retention-failure-alert-service",
          error: truncatedDetail,
          cutoffIso: ctx.cutoffIso,
          retentionDays: ctx.retentionDays,
          trigger: ctx.trigger,
          consecutiveFailures: this.consecutiveFailures,
          suppressedCount,
          suppressedSince: suppressedSince
            ? new Date(suppressedSince).toISOString()
            : null,
          dedupWindowMs: window,
          link: ALERT_LINK,
          stalePendingTrend: trend,
          stalePendingHistory: history,
          growthStreakThreshold: streakThreshold,
          growthStreakOffenders: streakOffenders,
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error(
        "[AudienceRetentionFailureAlert] failed to create platform alert:",
        err,
      );
    }

    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(
          and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)),
        );
      const emailMessage = historyLines
        ? `${message}\n\nRecent stale-pending backlog (last ${history.length} sweep${history.length === 1 ? "" : "s"}):\n${historyLines}`
        : message;
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title,
          severity: "medium",
          message: emailMessage,
          actionUrl: ALERT_LINK,
        });
      }
    } catch (err) {
      console.error(
        "[AudienceRetentionFailureAlert] failed to email admins:",
        err,
      );
    }

    return true;
  }

  /**
   * Mark a sweep as healthy. Resets consecutive-failure / suppression
   * counters and auto-acknowledges any open
   * `audience_retention_sweep_failure` alerts so the founder dashboard
   * doesn't keep showing stale warnings once the sweeper recovers.
   *
   * Returns the number of alerts that were auto-resolved.
   */
  async notifySuccess(ctx: {
    cutoffIso: string;
    retentionDays: number;
    trigger: "scheduled" | "manual" | "cli";
  }): Promise<number> {
    this.consecutiveFailures = 0;
    this.suppressedSince = null;
    this.suppressedCount = 0;
    this.lastAlertAt = null;

    let resolved = 0;
    try {
      const open = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE),
            eq(platformAlerts.acknowledged, false),
          ),
        )
        .orderBy(desc(platformAlerts.createdAt));
      if (open.length === 0) return 0;
      const resolvedAt = new Date();
      for (const row of open) {
        const prevDetails =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        const mergedDetails = {
          ...prevDetails,
          autoResolved: true,
          autoResolvedAt: resolvedAt.toISOString(),
          autoResolvedCutoffIso: ctx.cutoffIso,
          autoResolvedRetentionDays: ctx.retentionDays,
          autoResolvedTrigger: ctx.trigger,
          autoResolvedNote:
            "Auto-cleared after a successful audience-retention sweep.",
        };
        await db
          .update(platformAlerts)
          .set({
            acknowledged: true,
            acknowledgedBy: "system",
            acknowledgedAt: resolvedAt,
            details: mergedDetails,
          })
          .where(eq(platformAlerts.id, row.id));
        resolved += 1;
      }
      if (resolved > 0) {
        console.log(
          `[AudienceRetentionFailureAlert] auto-resolved ${resolved} open alert(s) after healthy sweep`,
        );
      }
    } catch (err) {
      console.error(
        "[AudienceRetentionFailureAlert] failed to auto-resolve alerts:",
        err,
      );
    }
    return resolved;
  }

  /** Test helper: clear all dedup / counter state. */
  resetForTests() {
    this.lastAlertAt = null;
    this.suppressedSince = null;
    this.suppressedCount = 0;
    this.consecutiveFailures = 0;
  }
}

export const audienceRetentionFailureAlertService =
  new AudienceRetentionFailureAlertService();

export function arrowGlyph(arrow: "up" | "down" | "flat" | "none"): string {
  switch (arrow) {
    case "up":
      return "▲";
    case "down":
      return "▼";
    case "flat":
      return "▬";
    default:
      return "·";
  }
}

export function formatTrendLine(
  trend: ReturnType<typeof summarizeStalePendingTrend>,
): string {
  if (trend.sampleCount < 2) {
    return "";
  }
  const parts: string[] = [];
  for (const [label, t] of [
    ["messages", trend.tables.messages] as const,
    ["decisions", trend.tables.decisions] as const,
    ["commands", trend.tables.commands] as const,
  ]) {
    const deltaStr =
      t.delta == null
        ? ""
        : t.delta > 0
          ? ` (+${t.delta.toLocaleString()})`
          : t.delta < 0
            ? ` (${t.delta.toLocaleString()})`
            : "";
    parts.push(`${label} ${arrowGlyph(t.arrow)} ${t.current.toLocaleString()}${deltaStr}`);
  }
  return parts.join(", ");
}

export function formatHistoryLines(history: AudienceStalePendingHistoryEntry[]): string {
  if (history.length === 0) return "";
  // Oldest-first → newest-last, so the founder reads "what happened, then what happened next".
  return history
    .map((h) => {
      const when = h.recordedAt;
      return `  • ${when} — messages=${h.messages.toLocaleString()}, decisions=${h.decisions.toLocaleString()}, commands=${h.commands.toLocaleString()} (trigger=${h.trigger}${h.error ? ", error" : ""})`;
    })
    .join("\n");
}
