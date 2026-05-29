/**
 * Shorts approval backlog alert.
 *
 * The admin dashboard already surfaces a "shorts awaiting approval" card when
 * the pending draft count exceeds the founder-configured threshold (stored in
 * `system_settings` under `shorts_draft_queue_threshold`).
 *
 * This service makes the same condition push-driven: when the pending count
 * transitions from <= threshold to > threshold it fires a single
 * `platform_alerts` row (severity = warning, type = `shorts_draft_backlog`)
 * and best-effort emails active root admins via the existing Resend pipeline.
 * It will NOT re-fire while the backlog stays above the threshold; the next
 * alert is only allowed after the backlog has dropped back to <= threshold.
 *
 * Founders acknowledge / clear the alert via the existing
 * `POST /api/admin/platform-alerts/:id/acknowledge` route used for every
 * other platform alert.
 */

import { eq, sql, and, desc } from "drizzle-orm";
import { db } from "../db";
import {
  adminStaff,
  platformAlerts,
  socialDrafts,
  systemSettings,
} from "@shared/schema";
import { panicButtonService } from "./panic-button-service";
import { EmailService } from "./email-service";

const THRESHOLD_KEY = "shorts_draft_queue_threshold";
const THRESHOLD_DEFAULT = 5;
const ALERT_TYPE = "shorts_draft_backlog";

async function readThreshold(): Promise<number> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, THRESHOLD_KEY))
      .limit(1);
    if (rows.length === 0) return THRESHOLD_DEFAULT;
    const parsed = Number.parseInt(rows[0].value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return THRESHOLD_DEFAULT;
    return parsed;
  } catch {
    return THRESHOLD_DEFAULT;
  }
}

async function countPendingDrafts(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(socialDrafts)
    .where(eq(socialDrafts.status, "draft"));
  return Number(rows[0]?.n ?? 0);
}

class ShortsBacklogAlertService {
  private wasAboveThreshold = false;
  private initialized = false;
  private emailService = new EmailService();

  async initialize() {
    try {
      const [threshold, count] = await Promise.all([
        readThreshold(),
        countPendingDrafts(),
      ]);
      this.wasAboveThreshold = count > threshold;
      this.initialized = true;
      console.log(
        `[ShortsBacklogAlert] initialized: pending=${count} threshold=${threshold} above=${this.wasAboveThreshold}`,
      );
    } catch (err) {
      console.error("[ShortsBacklogAlert] init failed:", err);
      this.initialized = true;
    }
  }

  /**
   * Re-evaluate the backlog. Fires an alert only on the transition from
   * <= threshold to > threshold (i.e. once per crossing).
   */
  async check(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
      return;
    }
    let threshold = THRESHOLD_DEFAULT;
    let count = 0;
    try {
      [threshold, count] = await Promise.all([
        readThreshold(),
        countPendingDrafts(),
      ]);
    } catch (err) {
      console.error("[ShortsBacklogAlert] check query failed:", err);
      return;
    }

    const above = count > threshold;
    if (above && !this.wasAboveThreshold) {
      await this.fireAlert(count, threshold);
    }
    if (!above) {
      await this.autoResolveOpenAlerts(count, threshold);
    }
    this.wasAboveThreshold = above;
  }

  /**
   * When the backlog returns to healthy (count <= threshold), acknowledge any
   * unacknowledged `shorts_draft_backlog` alerts as the system so founders
   * don't have to clear stale warnings by hand. Mirrors the cover-orphan
   * sweep pattern — the alerts list renders the existing "Auto-cleared by
   * sweep" badge based on `details.autoResolved === true`.
   */
  private async autoResolveOpenAlerts(count: number, threshold: number) {
    try {
      const open = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(platformAlerts.type, ALERT_TYPE),
            eq(platformAlerts.acknowledged, false),
          ),
        )
        .orderBy(desc(platformAlerts.createdAt));
      if (open.length === 0) return;
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
          autoResolvedCount: count,
          autoResolvedThreshold: threshold,
          autoResolvedNote: `Auto-cleared by backlog monitor: pending ${count} ≤ threshold ${threshold}.`,
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
      }
      console.log(
        `[ShortsBacklogAlert] auto-resolved ${open.length} open alert(s) (count=${count}, threshold=${threshold})`,
      );
    } catch (err) {
      console.error("[ShortsBacklogAlert] failed to auto-resolve alerts:", err);
    }
  }

  /** Test / introspection helper. */
  isCurrentlyAboveThreshold(): boolean {
    return this.wasAboveThreshold;
  }

  private async fireAlert(count: number, threshold: number) {
    // Task #620 — central founder PTO mode swallows the alert without
    // creating a platform_alerts row or emailing admins. The crossing
    // event is still consumed (caller sets `wasAboveThreshold=true`) so
    // we don't re-fire every tick during PTO; the next alert will be
    // gated by the same once-per-crossing rule.
    try {
      const { isNotifierMutedByPto, bumpFounderPtoSuppressedCount } =
        await import("./founder-pto-mode-service");
      const ptoSnooze = await isNotifierMutedByPto("shorts_backlog");
      if (ptoSnooze) {
        await bumpFounderPtoSuppressedCount();
        return;
      }
    } catch (err) {
      console.error(
        "[ShortsBacklogAlert] PTO mode check failed:",
        (err as Error)?.message ?? err,
      );
    }

    const message = `Shorts approval backlog crossed threshold: ${count} drafts pending (threshold ${threshold}).`;
    try {
      await panicButtonService.createAlert({
        type: ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          pendingCount: count,
          threshold,
          source: "shorts-backlog-alert-service",
          link: "/admin#shorts",
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error("[ShortsBacklogAlert] failed to create alert:", err);
    }

    // Best-effort email to active root admins. Failures are swallowed so the
    // platform alert remains the source of truth.
    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)));
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title: "Shorts approval backlog needs attention",
          severity: "medium",
          message,
        });
      }
    } catch (err) {
      console.error("[ShortsBacklogAlert] failed to email admins:", err);
    }
  }
}

export const shortsBacklogAlertService = new ShortsBacklogAlertService();
