/**
 * Post-deploy gateway-event connector backfill failure alert (Task #682).
 *
 * Task #635 runs the `audience_gateway_events` connector backfill
 * automatically once after each deploy and persists a marker so that
 * re-running is a no-op. When the deploy run errors, the marker stores
 * the error and the next deploy retries — but nobody is told. If
 * Supabase is flaky for several deploys in a row the dashboard tile
 * silently shows a red badge that nobody opens.
 *
 * This service mirrors `audience-retention-failure-alert-service.ts`:
 *   - Creates a `platform_alerts` row via `panicButtonService.createAlert`
 *     so the alert shows up on the founder dashboard.
 *   - Sends a best-effort email to every active root admin via the shared
 *     `EmailService`.
 *   - Only fires once the consecutive-failure counter (persisted on the
 *     backfill marker) reaches the configured threshold (env
 *     `GATEWAY_EVENT_CONNECTOR_BACKFILL_FAILURE_THRESHOLD`, default 2),
 *     so a single transient blip never pages the founder.
 *   - Auto-resolves any open
 *     `gateway_event_connector_backfill_failure` alerts the next time
 *     the backfill succeeds.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { adminStaff, platformAlerts } from "@shared/schema";
import { panicButtonService } from "./panic-button-service";
import { EmailService } from "./email-service";
import {
  getAuditEmailFailureAlertSnooze,
  isAuditEmailFailureAlertSnoozed,
  listAuditEmailFailureAlertSnoozeHistory,
  setAuditEmailFailureAlertSnooze,
  type AuditEmailFailureAlertSnoozeConfig,
  type AuditEmailFailureAlertSnoozeHistoryEntry,
} from "./audit-email-failure-alert-snooze";
import type {
  GatewayEventConnectorBackfillStatus,
  GatewayEventConnectorBackfillTrigger,
} from "./audience-gateway-event-connector-backfill-service";

export const GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_TYPE =
  "gateway_event_connector_backfill_failure";

/**
 * Task #694 — `system_settings` key under which the founder-controlled
 * snooze window for this alert is persisted. Reuses the shared
 * audit-email failure-alert snooze helper (Task #560/613) so we
 * automatically inherit the same 90-day cap, lazy-expired logging, and
 * append-only history table.
 */
export const GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_SNOOZE_KEY =
  "gateway_event_connector_backfill_alert_snooze";

const DEFAULT_FAILURE_THRESHOLD = 2;
const ALERT_LINK = "/admin/omni-channel-audience#connector-backfill";

export function gatewayEventConnectorBackfillFailureThreshold(): number {
  const raw = Number(
    process.env.GATEWAY_EVENT_CONNECTOR_BACKFILL_FAILURE_THRESHOLD,
  );
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return DEFAULT_FAILURE_THRESHOLD;
}

export interface GatewayEventConnectorBackfillFailureContext {
  status: GatewayEventConnectorBackfillStatus;
  trigger: GatewayEventConnectorBackfillTrigger;
}

class GatewayEventConnectorBackfillFailureAlertService {
  private emailService = new EmailService();

  /**
   * Record a failed backfill run. Fires a founder alert + email when
   * the persisted `consecutiveFailures` counter on the marker has
   * reached the configured threshold. Safe to call on every failed
   * run; suppression is purely threshold-driven.
   *
   * Returns `true` if a notification was actually fired.
   */
  async notifyFailure(
    ctx: GatewayEventConnectorBackfillFailureContext,
  ): Promise<boolean> {
    const threshold = gatewayEventConnectorBackfillFailureThreshold();
    const consecutive = ctx.status.consecutiveFailures ?? 0;
    if (consecutive < threshold) return false;

    // Task #694 — a founder-controlled snooze window suppresses the
    // email + platform_alerts row but leaves the persisted counter
    // untouched (it was already incremented in
    // `runGatewayEventConnectorBackfill` before this notifier was
    // invoked), so the first send after the window expires still
    // carries an accurate `consecutiveFailures` value.
    try {
      const snoozed = await isAuditEmailFailureAlertSnoozed(
        GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_SNOOZE_KEY,
      );
      if (snoozed.snoozed) {
        console.info(
          `[GatewayEventConnectorBackfillFailureAlert] snoozed until ${snoozed.snoozeUntil} — skipping email + platform_alerts row (consecutiveFailures=${consecutive})`,
        );
        return false;
      }
    } catch (err) {
      // If reading the snooze fails we err on the side of paging the
      // founder — a noisy alert is better than a silent one.
      console.error(
        "[GatewayEventConnectorBackfillFailureAlert] failed to read snooze state, defaulting to NOT snoozed:",
        (err as Error)?.message ?? err,
      );
    }

    const errorText = ctx.status.error ?? "(no error message recorded)";
    const truncated =
      errorText.length > 500 ? `${errorText.slice(0, 500)}…` : errorText;
    const title = "Gateway-event connector backfill keeps failing";
    const message =
      `${title}: ${truncated} ` +
      `(consecutiveFailures=${consecutive}, threshold=${threshold}, trigger=${ctx.trigger}, ranAt=${ctx.status.ranAt ?? "?"})`;

    try {
      await panicButtonService.createAlert({
        type: GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          source:
            "audience-gateway-event-connector-backfill-failure-alert-service",
          error: truncated,
          trigger: ctx.trigger,
          ranAt: ctx.status.ranAt,
          consecutiveFailures: consecutive,
          threshold,
          link: ALERT_LINK,
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error(
        "[GatewayEventConnectorBackfillFailureAlert] failed to create platform alert:",
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
        "[GatewayEventConnectorBackfillFailureAlert] failed to email admins:",
        err,
      );
    }

    return true;
  }

  /**
   * Mark the backfill as healthy. Auto-acknowledges any open
   * `gateway_event_connector_backfill_failure` alerts so the dashboard
   * doesn't keep showing a stale warning once the backfill recovers.
   *
   * Returns the number of alerts that were auto-resolved.
   */
  async notifySuccess(
    ctx: GatewayEventConnectorBackfillFailureContext,
  ): Promise<number> {
    let resolved = 0;
    try {
      const open = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(
              platformAlerts.type,
              GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_TYPE,
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
          autoResolvedTrigger: ctx.trigger,
          autoResolvedRanAt: ctx.status.ranAt,
          autoResolvedNote:
            "Auto-cleared after a successful gateway-event connector backfill run.",
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
          `[GatewayEventConnectorBackfillFailureAlert] auto-resolved ${resolved} open alert(s) after healthy run`,
        );
      }
    } catch (err) {
      console.error(
        "[GatewayEventConnectorBackfillFailureAlert] failed to auto-resolve alerts:",
        err,
      );
    }
    return resolved;
  }
}

export const gatewayEventConnectorBackfillFailureAlertService =
  new GatewayEventConnectorBackfillFailureAlertService();

/* ------------------------------------------------------------------ */
/* Task #694 — snooze controls                                         */
/* ------------------------------------------------------------------ */

/**
 * Read the current snooze config for the backfill failure alert.
 * Returns the shared shape used by the audit-email snooze helper so the
 * admin UI can reuse the same display logic.
 */
export async function getGatewayEventConnectorBackfillAlertSnooze(): Promise<AuditEmailFailureAlertSnoozeConfig> {
  return getAuditEmailFailureAlertSnooze(
    GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_SNOOZE_KEY,
  );
}

/**
 * Set or clear the snooze window. `snoozeUntil:null` clears an active
 * snooze. ISO timestamps must be strictly in the future and are clamped
 * to the shared 90-day cap. Audit history is logged automatically via
 * `audience_audit_email_failure_alert_snoozes`.
 */
export async function setGatewayEventConnectorBackfillAlertSnooze(input: {
  snoozeUntil: string | null;
  updatedBy?: string | null;
}): Promise<AuditEmailFailureAlertSnoozeConfig> {
  return setAuditEmailFailureAlertSnooze(
    GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_SNOOZE_KEY,
    { snoozeUntil: input.snoozeUntil, updatedBy: input.updatedBy ?? null },
  );
}

/**
 * Newest-first audit history of snooze actions (set / cleared /
 * expired) for the backfill failure alert. `limit` is bounded to
 * [1, 50] by the underlying helper.
 */
export async function listGatewayEventConnectorBackfillAlertSnoozeHistory(
  limit = 10,
): Promise<AuditEmailFailureAlertSnoozeHistoryEntry[]> {
  return listAuditEmailFailureAlertSnoozeHistory(
    GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_SNOOZE_KEY,
    limit,
  );
}

/**
 * Test seam: swap the live alert service for a stub during unit tests.
 */
export type GatewayEventConnectorBackfillFailureAlertNotifier = Pick<
  GatewayEventConnectorBackfillFailureAlertService,
  "notifyFailure" | "notifySuccess"
>;

let notifierOverride: GatewayEventConnectorBackfillFailureAlertNotifier | null =
  null;
export function setGatewayEventConnectorBackfillFailureAlertNotifierForTests(
  fn: GatewayEventConnectorBackfillFailureAlertNotifier | null,
): void {
  notifierOverride = fn;
}
export function getGatewayEventConnectorBackfillFailureAlertNotifier(): GatewayEventConnectorBackfillFailureAlertNotifier {
  return notifierOverride ?? gatewayEventConnectorBackfillFailureAlertService;
}
