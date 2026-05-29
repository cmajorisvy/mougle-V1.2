/**
 * Audience audit-export *history* email failure alert (Task #482).
 *
 * The scheduled compliance email for the meta-audit export history
 * (`audience-audit-history-email-scheduler.ts`) writes a "failed" status
 * onto the schedule row when a send breaks but does nothing to actively
 * notify the founder. If Resend is rate-limited or recipients bounce for
 * several consecutive weeks, compliance silently loses coverage.
 *
 * This service mirrors `audience-retention-failure-alert-service.ts`:
 *   - After N consecutive failed scheduler-triggered runs (default 2),
 *     it creates a `platform_alerts` row via
 *     `panicButtonService.createAlert` so the alert appears on the
 *     founder dashboard and exposes a banner on
 *     `/admin/omni-channel-audience` via a small read endpoint.
 *   - Sends a best-effort email to every active root admin via the
 *     shared `EmailService`.
 *   - Auto-resolves any open `audience_audit_history_email_failure`
 *     alerts the next time a scheduler run succeeds.
 *   - The threshold can be tuned from the admin dashboard (persisted
 *     in `system_settings` under
 *     `audience_audit_history_email_failure_threshold`) or via the
 *     `AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD` env var.
 *     Precedence: admin override > env > default 2 (Task #521).
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { adminStaff, platformAlerts, systemSettings } from "@shared/schema";
import { panicButtonService } from "./panic-button-service";
import { EmailService } from "./email-service";
import {
  type AuditEmailFailureAlertSnoozeConfig,
  type AuditEmailFailureAlertSnoozeHistoryEntry,
  getAuditEmailFailureAlertSnooze,
  isAuditEmailFailureAlertSnoozed,
  listAuditEmailFailureAlertSnoozeHistory,
  setAuditEmailFailureAlertSnooze,
} from "./audit-email-failure-alert-snooze";

export const AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE =
  "audience_audit_history_email_failure";

export const AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY =
  "audience_audit_history_email_failure_alert_snooze";

const DEFAULT_THRESHOLD = 2;
const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 5;
const ALERT_LINK = "/admin/omni-channel-audience#audit-history";

export const AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD_SETTING_KEY =
  "audience_audit_history_email_failure_threshold";

function clampThreshold(n: number): number {
  const floored = Math.floor(n);
  if (floored < MIN_THRESHOLD) return MIN_THRESHOLD;
  if (floored > MAX_THRESHOLD) return MAX_THRESHOLD;
  return floored;
}

function envThreshold(): number | null {
  const raw = Number(
    process.env.AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD,
  );
  if (Number.isFinite(raw) && raw >= 1) return clampThreshold(raw);
  return null;
}

async function readOverrideThreshold(): Promise<number | null> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD_SETTING_KEY,
        ),
      )
      .limit(1);
    if (rows.length === 0) return null;
    const n = Number(rows[0].value);
    if (!Number.isFinite(n) || n < 1) return null;
    return clampThreshold(n);
  } catch {
    return null;
  }
}

export async function getEffectiveFailureThreshold(): Promise<{
  threshold: number;
  override: number | null;
  envFallback: number | null;
  defaultThreshold: number;
  min: number;
  max: number;
}> {
  const override = await readOverrideThreshold();
  const envFallback = envThreshold();
  const threshold = override ?? envFallback ?? DEFAULT_THRESHOLD;
  return {
    threshold,
    override,
    envFallback,
    defaultThreshold: DEFAULT_THRESHOLD,
    min: MIN_THRESHOLD,
    max: MAX_THRESHOLD,
  };
}

export async function setFailureThresholdOverride(
  value: number | null,
  updatedBy?: string,
): Promise<Awaited<ReturnType<typeof getEffectiveFailureThreshold>>> {
  if (value === null) {
    await db
      .delete(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD_SETTING_KEY,
        ),
      );
  } else {
    const stored = String(clampThreshold(value));
    await db
      .insert(systemSettings)
      .values({
        key: AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD_SETTING_KEY,
        value: stored,
        updatedBy,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: stored, updatedBy, updatedAt: new Date() },
      });
  }
  return getEffectiveFailureThreshold();
}

async function failureThreshold(): Promise<number> {
  const { threshold } = await getEffectiveFailureThreshold();
  return threshold;
}

export interface AudienceAuditHistoryEmailFailureContext {
  runId: string;
  error: string;
  cadence: string;
  recipients: string[];
}

class AudienceAuditHistoryEmailFailureAlertService {
  private consecutiveFailures = 0;
  private emailService = new EmailService();

  /**
   * Record a failed scheduler run. Fires a founder alert + email only
   * after `failureThreshold()` consecutive failures (default 2) so a
   * single hiccup does not page anybody.
   *
   * Returns `true` if a notification was actually fired, `false` if it
   * was suppressed because the threshold has not been reached yet.
   */
  async notifyFailure(
    ctx: AudienceAuditHistoryEmailFailureContext,
  ): Promise<boolean> {
    this.consecutiveFailures += 1;
    const threshold = await failureThreshold();
    if (this.consecutiveFailures < threshold) return false;

    // Task #560 — founder-set snooze short-circuits the alert without
    // writing a `platform_alerts` row or paging root admins. The
    // consecutive-failure counter is left intact so the alert fires
    // immediately once the snooze elapses.
    const snoozeStatus = await isAuditEmailFailureAlertSnoozed(
      AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
    );
    if (snoozeStatus.snoozed) return false;

    const title = "Audit-export history email failed";
    const truncatedDetail =
      ctx.error.length > 500 ? `${ctx.error.slice(0, 500)}…` : ctx.error;
    const message =
      `${title}: ${truncatedDetail} ` +
      `(runId=${ctx.runId}, cadence=${ctx.cadence}, ` +
      `consecutiveFailures=${this.consecutiveFailures}, ` +
      `threshold=${threshold})`;

    try {
      await panicButtonService.createAlert({
        type: AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          source: "audience-audit-history-email-failure-alert-service",
          runId: ctx.runId,
          error: truncatedDetail,
          cadence: ctx.cadence,
          recipients: ctx.recipients,
          consecutiveFailures: this.consecutiveFailures,
          threshold,
          link: ALERT_LINK,
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailFailureAlert] failed to create platform alert:",
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
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title,
          severity: "medium",
          message,
          actionUrl: ALERT_LINK,
        });
      }
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailFailureAlert] failed to email admins:",
        err,
      );
    }

    return true;
  }

  /**
   * Mark a scheduler run as healthy. Resets the consecutive-failure
   * counter and auto-acknowledges any open
   * `audience_audit_history_email_failure` alerts so the founder
   * dashboard does not keep showing stale warnings once delivery
   * recovers.
   *
   * Returns the number of alerts that were auto-resolved.
   */
  async notifySuccess(ctx: {
    runId: string;
    cadence: string;
  }): Promise<number> {
    this.consecutiveFailures = 0;

    let resolved = 0;
    try {
      const open = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(
              platformAlerts.type,
              AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE,
            ),
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
          autoResolvedRunId: ctx.runId,
          autoResolvedCadence: ctx.cadence,
          autoResolvedNote:
            "Auto-cleared after a successful audit-export history email run.",
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
          `[AudienceAuditHistoryEmailFailureAlert] auto-resolved ${resolved} open alert(s) after healthy run`,
        );
      }
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailFailureAlert] failed to auto-resolve alerts:",
        err,
      );
    }
    return resolved;
  }

  /**
   * Returns the most recent open
   * `audience_audit_history_email_failure` alert, or `null` if there
   * isn't one. Used by the admin UI to render the banner.
   */
  async getOpenAlert(): Promise<{
    id: number | string;
    message: string;
    createdAt: string;
    details: Record<string, any>;
  } | null> {
    try {
      const rows = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(
              platformAlerts.type,
              AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE,
            ),
            eq(platformAlerts.acknowledged, false),
          ),
        )
        .orderBy(desc(platformAlerts.createdAt))
        .limit(1);
      if (rows.length === 0) return null;
      const row = rows[0];
      const created = (row.createdAt as Date | null) ?? new Date();
      return {
        id: row.id as any,
        message: row.message,
        createdAt: created.toISOString(),
        details:
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {},
      };
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailFailureAlert] failed to load open alert:",
        err,
      );
      return null;
    }
  }

  /**
   * Task #560 — read the current snooze configuration. Exposed so the
   * admin UI can render the "snoozed until …" badge alongside the
   * failure-alert banner.
   */
  async getSnooze(): Promise<AuditEmailFailureAlertSnoozeConfig> {
    return getAuditEmailFailureAlertSnooze(
      AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
    );
  }

  /**
   * Task #560 — set or clear the snooze window. Pass `snoozeUntil:null`
   * to unsnooze. Values further than 90 days into the future are
   * clamped to now+90d to prevent silent forever-mute.
   */
  async setSnooze(input: {
    snoozeUntil: string | null;
    updatedBy?: string | null;
    now?: Date;
  }): Promise<AuditEmailFailureAlertSnoozeConfig> {
    return setAuditEmailFailureAlertSnooze(
      AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
      input,
    );
  }

  /**
   * Task #613 — newest-first list of past snooze actions (set / cleared
   * / expired) on this alert, for the founder compliance audit trail.
   */
  async getSnoozeHistory(
    limit = 10,
  ): Promise<AuditEmailFailureAlertSnoozeHistoryEntry[]> {
    return listAuditEmailFailureAlertSnoozeHistory(
      AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
      limit,
    );
  }

  /** Test helper: clear in-memory counters. */
  resetForTests(): void {
    this.consecutiveFailures = 0;
  }

  /** Test helper. */
  _consecutiveFailuresForTests(): number {
    return this.consecutiveFailures;
  }
}

export const audienceAuditHistoryEmailFailureAlertService =
  new AudienceAuditHistoryEmailFailureAlertService();
