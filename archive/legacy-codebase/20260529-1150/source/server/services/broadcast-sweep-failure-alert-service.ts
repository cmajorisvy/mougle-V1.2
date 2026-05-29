/**
 * Broadcast-sweep failure alert.
 *
 * The scheduled broadcast sweep (`broadcast-sweep-scheduler.ts`) writes
 * `broadcasts.sweep.covers.failed`, `broadcasts.sweep.media.failed`, and
 * `broadcasts.sweep.error` rows to the production-house audit log when a
 * scheduled cleanup tick blows up. Those audit rows are only visible to
 * admins who open the Scheduled Cleanup History panel, so a silent
 * storage-cleanup regression can sit undetected for days.
 *
 * This service mirrors the pattern used by
 * `cover-orphan-alert-service.ts`:
 *   - Creates a `platform_alerts` row via `panicButtonService.createAlert`
 *     (so the alert shows up on the founder dashboard).
 *   - Sends a best-effort email to every active root admin via the shared
 *     `EmailService`.
 *
 * It also rate-limits notifications per failure kind so a sweep that keeps
 * failing every tick doesn't spam the founder's inbox. The dedup window
 * mirrors the large-sweep alert dedup approach: we only re-fire once the
 * configured cooldown has elapsed for that particular failure kind.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { adminStaff } from "@shared/schema";
import { panicButtonService } from "./panic-button-service";
import { EmailService } from "./email-service";

export type SweepFailureKind = "covers" | "media" | "error";

const ALERT_TYPE = "broadcast_sweep_failure";

// Don't re-fire the same failure kind more than once inside this window.
// One hour balances "founder hears about it quickly" against "scheduler
// runs every 30s in tests".
const DEFAULT_DEDUP_MS = 60 * 60 * 1000;

function dedupWindowMs(): number {
  const raw = Number(process.env.BROADCAST_SWEEP_FAILURE_DEDUP_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_DEDUP_MS;
}

function titleFor(kind: SweepFailureKind): string {
  switch (kind) {
    case "covers":
      return "Scheduled cover sweep failed";
    case "media":
      return "Scheduled media sweep failed";
    case "error":
    default:
      return "Scheduled broadcast sweep crashed";
  }
}

function auditEventFor(kind: SweepFailureKind): string {
  switch (kind) {
    case "covers":
      return "broadcasts.sweep.covers.failed";
    case "media":
      return "broadcasts.sweep.media.failed";
    case "error":
    default:
      return "broadcasts.sweep.error";
  }
}

class BroadcastSweepFailureAlertService {
  private lastAlertAt: Partial<Record<SweepFailureKind, number>> = {};
  private suppressedSince: Partial<Record<SweepFailureKind, number>> = {};
  private suppressedCount: Partial<Record<SweepFailureKind, number>> = {};
  private emailService = new EmailService();

  /**
   * Fire a founder alert + email for a failed scheduled sweep run. Safe to
   * call on every failed tick; the service handles dedup internally.
   *
   * Returns `true` if a notification was actually fired, `false` if it was
   * suppressed by the rate limit.
   */
  async notify(kind: SweepFailureKind, detail: string): Promise<boolean> {
    const now = Date.now();
    const window = dedupWindowMs();
    const last = this.lastAlertAt[kind];
    if (last != null && window > 0 && now - last < window) {
      this.suppressedSince[kind] ??= last;
      this.suppressedCount[kind] = (this.suppressedCount[kind] ?? 0) + 1;
      return false;
    }

    // Task #620 — central founder PTO mode mutes this notifier without
    // resetting the per-kind dedup state, so a future fire still reports
    // the correct "N similar failures suppressed since T" count.
    try {
      const { isNotifierMutedByPto, bumpFounderPtoSuppressedCount } =
        await import("./founder-pto-mode-service");
      const ptoSnooze = await isNotifierMutedByPto("broadcast_sweep_failure");
      if (ptoSnooze) {
        this.suppressedSince[kind] ??= last ?? now;
        this.suppressedCount[kind] = (this.suppressedCount[kind] ?? 0) + 1;
        await bumpFounderPtoSuppressedCount();
        return false;
      }
    } catch (err) {
      console.error(
        "[BroadcastSweepFailureAlert] PTO mode check failed:",
        (err as Error)?.message ?? err,
      );
    }

    const suppressedCount = this.suppressedCount[kind] ?? 0;
    const suppressedSince = this.suppressedSince[kind] ?? null;
    this.lastAlertAt[kind] = now;
    this.suppressedSince[kind] = undefined;
    this.suppressedCount[kind] = 0;

    const title = titleFor(kind);
    const truncatedDetail =
      detail.length > 500 ? `${detail.slice(0, 500)}…` : detail;
    const repeatedNote =
      suppressedCount > 0
        ? ` (${suppressedCount} similar failure${
            suppressedCount === 1 ? "" : "s"
          } suppressed since ${
            suppressedSince ? new Date(suppressedSince).toISOString() : "?"
          })`
        : "";
    const message = `${title}: ${truncatedDetail}${repeatedNote}`;

    try {
      await panicButtonService.createAlert({
        type: ALERT_TYPE,
        severity: kind === "error" ? "critical" : "warning",
        message,
        details: {
          kind,
          auditEvent: auditEventFor(kind),
          detail: truncatedDetail,
          source: "broadcast-sweep-failure-alert-service",
          link: "/admin/production-house#scheduled-cleanup-history",
          suppressedCount,
          suppressedSince: suppressedSince
            ? new Date(suppressedSince).toISOString()
            : null,
          dedupWindowMs: window,
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error(
        "[BroadcastSweepFailureAlert] failed to create platform alert:",
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
          severity: kind === "error" ? "high" : "medium",
          message,
          actionUrl: "/admin/production-house#scheduled-cleanup-history",
        });
      }
    } catch (err) {
      console.error(
        "[BroadcastSweepFailureAlert] failed to email admins:",
        err,
      );
    }

    return true;
  }

  /** Test helper: clear all dedup state. */
  resetForTests() {
    this.lastAlertAt = {};
    this.suppressedSince = {};
    this.suppressedCount = {};
  }
}

export const broadcastSweepFailureAlertService =
  new BroadcastSweepFailureAlertService();
