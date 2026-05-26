/**
 * Task #614 — Audit-email failure alert snooze expiry reminder.
 *
 * A founder can snooze the two audit-email failure alerts (trail
 * email + history email) for up to 90 days while a Resend / SMTP
 * outage is being worked. The 90-day cap protects against silent
 * forever-mute, but a founder who set a long snooze can still be
 * caught off-guard when alerts suddenly resume. This service runs a
 * daily tick that:
 *
 *   - Scans the two known snooze setting rows
 *     (`AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY` and
 *     `AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY`).
 *   - For each row whose `snoozeUntil` is between `now` and `now +
 *     REMINDER_WINDOW_MS` (24h by default) AND whose
 *     `expiryReminderSentAt` is either `null` or older than the
 *     current `snoozeUntil` (defensive), emails every active
 *     `root_admin` once via `EmailService.sendAdminAlert` and stamps
 *     `expiryReminderSentAt` so the reminder fires at most once per
 *     snooze window.
 *   - Silently no-ops when the snooze row is missing, when the
 *     snooze is already expired, when it is still more than 24h
 *     away, or when the reminder has already been sent for the
 *     current window.
 *
 * Email failures are caught so a broken Resend connection cannot
 * crash the tick. A failed send does NOT stamp
 * `expiryReminderSentAt`, so the next tick will retry. The shared
 * snooze helper resets `expiryReminderSentAt` to `null` whenever a
 * new `snoozeUntil` is written, so extending or replacing a snooze
 * always gets a fresh reminder for the new window.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { adminStaff } from "@shared/schema";
import { EmailService } from "./email-service";
import {
  AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
} from "./audience-audit-email-failure-alert-service";
import {
  AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
} from "./audience-audit-history-email-failure-alert-service";
import {
  PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
} from "./production-asset-orphan-alert-service";
import {
  getAuditEmailFailureAlertSnooze,
  markAuditEmailFailureAlertExpiryReminderSent,
} from "./audit-email-failure-alert-snooze";

export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface SnoozeTarget {
  key: string;
  label: string;
  actionUrl: string;
}

const TARGETS: SnoozeTarget[] = [
  {
    key: AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
    label: "Audit-trail compliance email failure alert",
    actionUrl: "/admin/omni-channel-audience#audit-trail-email",
  },
  {
    key: AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
    label: "Audit-export history email failure alert",
    actionUrl: "/admin/omni-channel-audience#audit-history",
  },
  {
    key: PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
    label: "Production-asset orphan-sweep flapping digest",
    actionUrl: "/admin/3d-assets#orphan-sweep",
  },
];

export interface SnoozeExpiryReminderResult {
  scanned: number;
  reminded: number;
  skipped: Array<{ key: string; reason: string }>;
  errors: Array<{ key: string; message: string }>;
}

class AuditEmailFailureAlertSnoozeExpiryReminderService {
  private timer: NodeJS.Timeout | null = null;
  private emailService = new EmailService();

  /**
   * Single tick. Exposed for tests and for the `runRetentionSweep`-style
   * manual triggers. Pass an explicit `now` to make tests deterministic.
   */
  async runTick(now: Date = new Date()): Promise<SnoozeExpiryReminderResult> {
    const result: SnoozeExpiryReminderResult = {
      scanned: 0,
      reminded: 0,
      skipped: [],
      errors: [],
    };
    for (const target of TARGETS) {
      result.scanned += 1;
      try {
        const cfg = await getAuditEmailFailureAlertSnooze(target.key);
        if (!cfg.snoozeUntil) {
          result.skipped.push({ key: target.key, reason: "no_snooze" });
          continue;
        }
        const expiresAt = Date.parse(cfg.snoozeUntil);
        if (!Number.isFinite(expiresAt)) {
          result.skipped.push({ key: target.key, reason: "invalid_snooze" });
          continue;
        }
        const nowMs = now.getTime();
        if (expiresAt <= nowMs) {
          result.skipped.push({ key: target.key, reason: "already_expired" });
          continue;
        }
        if (expiresAt - nowMs > REMINDER_WINDOW_MS) {
          result.skipped.push({ key: target.key, reason: "outside_window" });
          continue;
        }
        // Defensive: a stamp older than the current snoozeUntil refers
        // to a *previous* snooze window (e.g. founder replaced the
        // snooze without going through `setAuditEmailFailureAlertSnooze`).
        // In that case we still send for the new window.
        const sentAt = cfg.expiryReminderSentAt
          ? Date.parse(cfg.expiryReminderSentAt)
          : null;
        if (sentAt && Number.isFinite(sentAt) && sentAt >= nowMs - REMINDER_WINDOW_MS) {
          result.skipped.push({
            key: target.key,
            reason: "already_reminded",
          });
          continue;
        }
        const recipients = await this.loadRootAdminEmails();
        if (recipients.length === 0) {
          result.skipped.push({ key: target.key, reason: "no_recipients" });
          // Still stamp so we don't busy-loop in the rare case of an
          // empty root_admin table — the founder can always re-snooze
          // (which clears the stamp) once admins are added.
          await markAuditEmailFailureAlertExpiryReminderSent(target.key, now);
          continue;
        }
        const hoursLeft = Math.max(
          1,
          Math.round((expiresAt - nowMs) / (60 * 60 * 1000)),
        );
        const message =
          `Your snooze on the "${target.label}" expires in ` +
          `~${hoursLeft}h (at ${new Date(expiresAt).toISOString()}). ` +
          `If the underlying email outage is still ongoing, extend the ` +
          `snooze from the Omni-Channel Audience admin page; otherwise ` +
          `no action is needed and alerts will resume automatically.`;
        let allOk = true;
        for (const email of recipients) {
          try {
            await this.emailService.sendAdminAlert(email, {
              title: "Audit-alert snooze expires in ~24h",
              severity: "medium",
              message,
              actionUrl: target.actionUrl,
            });
          } catch (err) {
            allOk = false;
            result.errors.push({
              key: target.key,
              message:
                (err as Error)?.message ??
                "unknown error while sending reminder",
            });
          }
        }
        if (allOk) {
          await markAuditEmailFailureAlertExpiryReminderSent(target.key, now);
          result.reminded += 1;
        }
      } catch (err) {
        result.errors.push({
          key: target.key,
          message: (err as Error)?.message ?? "unexpected reminder error",
        });
      }
    }
    return result;
  }

  start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
    if (this.timer) return;
    // Fire-and-forget initial tick so a freshly-booted worker does
    // not have to wait a full day to send a pending reminder.
    this.runTick().catch((err) =>
      console.error(
        "[audit-email-snooze-expiry-reminder] initial tick failed:",
        (err as Error)?.message ?? err,
      ),
    );
    this.timer = setInterval(() => {
      this.runTick().catch((err) =>
        console.error(
          "[audit-email-snooze-expiry-reminder] scheduled tick failed:",
          (err as Error)?.message ?? err,
        ),
      );
    }, intervalMs);
    if (typeof (this.timer as any).unref === "function") {
      (this.timer as any).unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async loadRootAdminEmails(): Promise<string[]> {
    const rows = await db
      .select({ email: adminStaff.email })
      .from(adminStaff)
      .where(
        and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)),
      );
    const out: string[] = [];
    for (const r of rows) {
      if (r.email) out.push(r.email);
    }
    return out;
  }
}

export const auditEmailFailureAlertSnoozeExpiryReminderService =
  new AuditEmailFailureAlertSnoozeExpiryReminderService();
