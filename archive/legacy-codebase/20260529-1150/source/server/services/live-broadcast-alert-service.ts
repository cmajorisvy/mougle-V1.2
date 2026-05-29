/**
 * Live-broadcast alert.
 *
 * The Broadcast Compositor page already shows a banner + toast when the
 * count of non-dry-run ("live") broadcast rows exceeds an admin-configured
 * threshold. That warning only ever fires if an admin happens to have the
 * page open. If a live broadcast appears overnight or while every admin
 * is offline, nobody finds out until somebody opens the panel.
 *
 * This service closes that gap by counting live broadcasts on a schedule
 * and, when the count crosses a configurable server-side threshold, firing
 * a single `platform_alerts` row + best-effort email to active root admins.
 *
 * Mirrors the pattern used by `cover-orphan-alert-service.ts`:
 *  - Threshold lives in `system_settings` under `live_broadcast_alert_threshold`
 *    (default 0 — any live broadcast triggers an alert).
 *  - Only re-fires on the transition from <= threshold to > threshold so
 *    the same standing condition does not spam every cycle.
 *  - When the count drops back to <= threshold any open auto-alerts are
 *    acknowledged as the system, so founders don't have to clear stale
 *    warnings by hand.
 *  - The latest scan time + count are exposed via `getStatus()` so the
 *    admin panel can show "last scheduled scan ran at …".
 */

import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { adminStaff, broadcasts, platformAlerts, systemSettings } from "@shared/schema";
import { panicButtonService } from "./panic-button-service";
import { EmailService } from "./email-service";
import { sendFounderSms } from "./sms-service";

const THRESHOLD_KEY = "live_broadcast_alert_threshold";
const THRESHOLD_DEFAULT = 0;
const ALERT_TYPE = "broadcast_live_detected";

export interface LiveBroadcastScanResult {
  liveCount: number;
  scannedAt: number;
}

export interface LiveBroadcastAlertStatus {
  lastScanAt: number | null;
  lastLiveCount: number | null;
  threshold: number;
  wasAboveThreshold: boolean;
  nextScanAt: number | null;
  intervalMs: number | null;
  lastAlertAt: number | null;
  lastAlertCount: number | null;
  lastAutoResolvedAt: number | null;
  lastAutoResolvedCount: number | null;
}

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

async function countLiveBroadcasts(): Promise<number> {
  try {
    const rows = await db
      .select({ n: count() })
      .from(broadcasts)
      .where(eq(broadcasts.dryRun, false));
    return Number(rows[0]?.n ?? 0) || 0;
  } catch (err) {
    console.error("[LiveBroadcastAlert] count query failed:", err);
    return 0;
  }
}

class LiveBroadcastAlertService {
  private wasAboveThreshold = false;
  private lastScanAt: number | null = null;
  private lastLiveCount: number | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;
  private intervalMs: number | null = null;
  private lastAlertAt: number | null = null;
  private lastAlertCount: number | null = null;
  private lastAutoResolvedAt: number | null = null;
  private lastAutoResolvedCount: number | null = null;
  private emailService = new EmailService();

  async runScan(): Promise<LiveBroadcastScanResult> {
    const liveCount = await countLiveBroadcasts();
    const scannedAt = Date.now();
    this.lastLiveCount = liveCount;
    this.lastScanAt = scannedAt;
    return { liveCount, scannedAt };
  }

  async check(): Promise<LiveBroadcastScanResult & { threshold: number; alerted: boolean }> {
    const scan = await this.runScan();
    const threshold = await readThreshold();
    const above = scan.liveCount > threshold;
    let alerted = false;
    if (above && !this.wasAboveThreshold) {
      await this.fireAlert(scan.liveCount, threshold);
      alerted = true;
    }
    if (!above) {
      await this.autoResolveOpenAlerts(scan.liveCount, threshold);
    }
    this.wasAboveThreshold = above;
    return { ...scan, threshold, alerted };
  }

  private async autoResolveOpenAlerts(liveCount: number, threshold: number) {
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
          row.details && typeof row.details === "object" ? (row.details as Record<string, any>) : {};
        const mergedDetails = {
          ...prevDetails,
          autoResolved: true,
          autoResolvedAt: resolvedAt.toISOString(),
          autoResolvedLiveCount: liveCount,
          autoResolvedThreshold: threshold,
          autoResolvedNote: `Auto-cleared by scheduled scan: live count ${liveCount} ≤ threshold ${threshold}.`,
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
      this.lastAutoResolvedAt = resolvedAt.getTime();
      this.lastAutoResolvedCount = open.length;
      console.log(
        `[LiveBroadcastAlert] auto-resolved ${open.length} open alert(s) (live=${liveCount}, threshold=${threshold})`,
      );
    } catch (err) {
      console.error("[LiveBroadcastAlert] failed to auto-resolve alerts:", err);
    }
  }

  start(intervalMs = 5 * 60 * 1000) {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalMs = intervalMs;
    setTimeout(() => {
      this.check().catch((err) =>
        console.error("[LiveBroadcastAlert] initial check failed:", err),
      );
    }, 10_000).unref?.();
    this.intervalHandle = setInterval(() => {
      this.check().catch((err) =>
        console.error("[LiveBroadcastAlert] scheduled check failed:", err),
      );
    }, intervalMs);
    this.intervalHandle.unref?.();
    console.log(
      `[LiveBroadcastAlert] scheduler started (every ${Math.round(intervalMs / 60_000)}m)`,
    );
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.intervalMs = null;
      console.log("[LiveBroadcastAlert] scheduler stopped");
    }
  }

  async getStatus(): Promise<LiveBroadcastAlertStatus> {
    const threshold = await readThreshold();
    return {
      lastScanAt: this.lastScanAt,
      lastLiveCount: this.lastLiveCount,
      threshold,
      wasAboveThreshold: this.wasAboveThreshold,
      nextScanAt:
        this.lastScanAt && this.intervalMs
          ? this.lastScanAt + this.intervalMs
          : null,
      intervalMs: this.intervalMs,
      lastAlertAt: this.lastAlertAt,
      lastAlertCount: this.lastAlertCount,
      lastAutoResolvedAt: this.lastAutoResolvedAt,
      lastAutoResolvedCount: this.lastAutoResolvedCount,
    };
  }

  async setThreshold(value: number, updatedBy?: string): Promise<number> {
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
      throw new Error("invalid_threshold");
    }
    const v = Math.floor(value);
    await db
      .insert(systemSettings)
      .values({ key: THRESHOLD_KEY, value: String(v), updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(v), updatedBy, updatedAt: new Date() },
      });
    if (this.lastLiveCount != null) {
      this.wasAboveThreshold = this.lastLiveCount > v;
    }
    return v;
  }

  private async fireAlert(liveCount: number, threshold: number) {
    // Task #620 — central founder PTO mode mutes platform_alerts row +
    // email + SMS without touching the "wasAboveThreshold" transition
    // gate set by the caller. We deliberately do not advance
    // lastAlertAt/lastAlertCount so the founder dashboard still shows
    // the last real notification rather than a phantom-suppressed one.
    try {
      const { isNotifierMutedByPto, bumpFounderPtoSuppressedCount } =
        await import("./founder-pto-mode-service");
      const ptoSnooze = await isNotifierMutedByPto("live_broadcast");
      if (ptoSnooze) {
        await bumpFounderPtoSuppressedCount();
        return;
      }
    } catch (err) {
      console.error(
        "[LiveBroadcastAlert] PTO mode check failed:",
        (err as Error)?.message ?? err,
      );
    }

    const message =
      threshold === 0
        ? `Live broadcast detected: ${liveCount} non-dry-run broadcast row(s) on the platform.`
        : `Live broadcasts crossed threshold: ${liveCount} live broadcast row(s) (threshold ${threshold}).`;
    this.lastAlertAt = Date.now();
    this.lastAlertCount = liveCount;

    try {
      await panicButtonService.createAlert({
        type: ALERT_TYPE,
        severity: liveCount > Math.max(threshold + 1, 5) ? "critical" : "warning",
        message,
        details: {
          liveCount,
          threshold,
          source: "live-broadcast-alert-service",
          link: "/admin/broadcast-preview",
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error("[LiveBroadcastAlert] failed to create alert:", err);
    }

    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)));
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title: "Live broadcast detected on Mougle",
          severity: "high",
          message,
          actionUrl: `${process.env.APP_BASE_URL || "https://www.mougle.com"}/admin/broadcast-preview`,
        });
      }
    } catch (err) {
      console.error("[LiveBroadcastAlert] failed to email admins:", err);
    }

    // Best-effort SMS page to the founder. Mirrors the alerting pattern
    // used by the playout recovery path: SMS is never allowed to block
    // or revert the platform_alerts row + email fan-out above.
    try {
      const actionUrl = `${process.env.APP_BASE_URL || "https://www.mougle.com"}/admin/broadcast-preview`;
      const smsBody = `[Mougle] ${message} ${actionUrl}`;
      const results = await sendFounderSms(smsBody);
      const okCount = results.filter((r) => r.ok).length;
      if (results.length > 0) {
        console.log(
          `[LiveBroadcastAlert] founder SMS dispatched (ok=${okCount}/${results.length})`,
        );
      }
    } catch (err) {
      console.error("[LiveBroadcastAlert] failed to send founder SMS:", err);
    }
  }
}

export const liveBroadcastAlertService = new LiveBroadcastAlertService();
