/**
 * Gateway block alert (Task #381).
 *
 * Subscribes to the `audience.gateway_send_blocked` events emitted by
 * `audience-platform-gateway-service.ts` and pages the founder when a
 * single platform exceeds a configurable per-minute block threshold.
 *
 * Why: a connector that has lost permissions, a token that has expired,
 * or a flood of stale decision-fingerprints will cause every moderation
 * command for that platform to be refused. Today those refusals just
 * stream onto the bus — nobody is paged, so a silent moderation outage
 * can sit undetected for hours.
 *
 * Behavior:
 *   - Maintains a per-platform rolling 60s window of block timestamps.
 *   - When the count for a platform crosses the threshold, fires a
 *     `platform_alerts` row via `panicButtonService.createAlert` and
 *     sends a best-effort email to every active root admin.
 *   - Each platform has its own dedup cooldown so a sustained outage
 *     does not spam the founder; the same standing block storm only
 *     re-fires after the cooldown elapses.
 *   - A lightweight tick (every 30s) auto-resolves open alerts for a
 *     platform once the rolling block rate falls back to <= the
 *     recovery threshold (defaults to floor(threshold / 2)).
 *
 * Threshold / cooldown / window are env-tunable:
 *   GATEWAY_BLOCK_ALERT_THRESHOLD   default 10 blocks / minute / platform
 *   GATEWAY_BLOCK_ALERT_WINDOW_MS   default 60_000ms
 *   GATEWAY_BLOCK_ALERT_DEDUP_MS    default 30 * 60 * 1000 (30 min)
 *   GATEWAY_BLOCK_ALERT_RECOVERY    default floor(threshold / 2)
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { adminStaff, platformAlerts } from "@shared/schema";
import { panicButtonService } from "./panic-button-service";
import { EmailService } from "./email-service";
import {
  type BusEvent,
  neuralNewsroomBus,
} from "./neural-newsroom-bus";
import type { AudiencePlatform } from "../../shared/omni-channel-audience-schema";
import { gatewayBlockAlertSettingsService } from "./gateway-block-alert-settings-service";
import {
  type GatewayBlockCategory,
  countReasonsByCategory,
} from "../../shared/gateway-block-categories";
import { omniChannelAudienceSafetyService } from "./omni-channel-audience-safety-service";

export const GATEWAY_BLOCK_ALERT_TYPE = "audience_gateway_blocks_high";

const DEFAULT_AUTO_RESOLVE_INTERVAL_MS = 30_000;
const ALERT_LINK = "/admin/omni-channel-audience#gateway";

// Threshold / window / dedup / recovery are now sourced from
// `gateway-block-alert-settings-service` (DB override → env → default).
// The service is primed at boot via `start()` so the sync getters used
// inside `handleBlocked` always reflect the latest admin choice.
function thresholdValue(): number {
  return gatewayBlockAlertSettingsService.getThresholdSync();
}

function windowMs(): number {
  return gatewayBlockAlertSettingsService.getWindowMsSync();
}

function dedupMs(): number {
  return gatewayBlockAlertSettingsService.getDedupMsSync();
}

function recoveryThreshold(): number {
  return gatewayBlockAlertSettingsService.getEffectiveRecoverySync();
}

interface BlockedPayload {
  commandId?: string;
  platform?: string | null;
  connectorId?: string | null;
  requestedAction?: string | null;
  reason?: string;
}

type PlatformKey = AudiencePlatform | "unknown";
type ConnectorKey = string;

interface ConnectorRollup {
  timestamps: number[];
  /**
   * Reasons aligned 1:1 with `timestamps` so they age out of the
   * rolling window together. Used to compute `reasonCategoryCounts`
   * over the full window (Task #444), not just the last 5.
   */
  reasons: string[];
  lastReasons: string[];
  /**
   * Task #443: number of consecutive auto-resolve "windows" (ticks)
   * during which this connector's rolling blockedCount was at or above
   * the per-platform alert threshold. Resets to 0 the moment the
   * connector's blockedCount falls to <= recovery.
   */
  consecutiveOverThreshold: number;
  /**
   * Task #443: set after this connector has been auto-paused, so the
   * alerter doesn't repeatedly try to pause the same connector while
   * the storm continues. Cleared when the connector is re-enabled or
   * its rolling blockedCount drops to the recovery floor.
   */
  autoPausedAt: number | null;
}

interface PerPlatformState {
  timestamps: number[];
  reasons: string[];
  lastReasons: string[];
  lastAlertAt: number | null;
  suppressedSinceLastFire: number;
  hasOpenAlert: boolean;
  /**
   * Per-connector rolling window so the alert can name *which* connector(s)
   * on the offending platform are actually failing — e.g. a single expired
   * YouTube token vs. a fleet-wide outage (Task #419).
   */
  perConnector: Map<ConnectorKey, ConnectorRollup>;
}

class GatewayBlockAlertService {
  private state = new Map<PlatformKey, PerPlatformState>();
  private emailService = new EmailService();
  private unsubscribe: (() => void) | null = null;
  private autoResolveHandle: NodeJS.Timeout | null = null;
  private autoResolveIntervalMs: number | null = null;

  private getState(platform: PlatformKey): PerPlatformState {
    let s = this.state.get(platform);
    if (!s) {
      s = {
        timestamps: [],
        reasons: [],
        lastReasons: [],
        lastAlertAt: null,
        suppressedSinceLastFire: 0,
        hasOpenAlert: false,
        perConnector: new Map(),
      };
      this.state.set(platform, s);
    }
    return s;
  }

  private prune(s: PerPlatformState, now: number): void {
    const cutoff = now - windowMs();
    while (s.timestamps.length > 0 && s.timestamps[0] < cutoff) {
      s.timestamps.shift();
      s.reasons.shift();
    }
    // Keep recent-reason display buffer bounded; drop oldest beyond 5.
    if (s.lastReasons.length > 5) {
      s.lastReasons.splice(0, s.lastReasons.length - 5);
    }
    for (const [cid, c] of s.perConnector.entries()) {
      while (c.timestamps.length > 0 && c.timestamps[0] < cutoff) {
        c.timestamps.shift();
        c.reasons.shift();
      }
      if (c.lastReasons.length > 5) {
        c.lastReasons.splice(0, c.lastReasons.length - 5);
      }
      if (c.timestamps.length === 0) {
        s.perConnector.delete(cid);
      }
    }
  }

  private topOffendingConnectors(
    s: PerPlatformState,
    limit = 3,
  ): Array<{
    connectorId: string;
    count: number;
    recentReasons: string[];
    reasonCategoryCounts: Partial<Record<GatewayBlockCategory, number>>;
  }> {
    const out: Array<{
      connectorId: string;
      count: number;
      recentReasons: string[];
      reasonCategoryCounts: Partial<Record<GatewayBlockCategory, number>>;
    }> = [];
    for (const [connectorId, c] of s.perConnector.entries()) {
      if (c.timestamps.length === 0) continue;
      out.push({
        connectorId,
        count: c.timestamps.length,
        recentReasons: Array.from(new Set(c.lastReasons)).slice(-3),
        reasonCategoryCounts: countReasonsByCategory(c.reasons),
      });
    }
    out.sort((a, b) => b.count - a.count);
    return out.slice(0, limit);
  }

  /**
   * Process a single `audience.gateway_send_blocked` payload. Exposed for
   * tests; the wired subscriber calls this on every emitted event.
   */
  async handleBlocked(payload: BlockedPayload, now = Date.now()): Promise<boolean> {
    const platform = (payload?.platform ?? "unknown") as PlatformKey;
    const reason = typeof payload?.reason === "string" ? payload.reason : "unknown";
    const connectorId =
      typeof payload?.connectorId === "string" && payload.connectorId.length > 0
        ? payload.connectorId
        : "unknown";
    const s = this.getState(platform);
    s.timestamps.push(now);
    s.reasons.push(reason);
    s.lastReasons.push(reason);
    let c = s.perConnector.get(connectorId);
    if (!c) {
      c = { timestamps: [], reasons: [], lastReasons: [], consecutiveOverThreshold: 0, autoPausedAt: null };
      s.perConnector.set(connectorId, c);
    }
    c.timestamps.push(now);
    c.reasons.push(reason);
    c.lastReasons.push(reason);
    this.prune(s, now);

    const threshold = thresholdValue();
    if (s.timestamps.length < threshold) return false;

    const dedup = dedupMs();
    if (s.lastAlertAt != null && dedup > 0 && now - s.lastAlertAt < dedup) {
      s.suppressedSinceLastFire += 1;
      return false;
    }

    return this.fire(platform, s, now);
  }

  private async fire(platform: PlatformKey, s: PerPlatformState, now: number): Promise<boolean> {
    // Task #620 — central founder PTO mode acts as an OR-gate on top
    // of the per-platform dedup window. When this notifier is muted,
    // swallow the alert without creating a platform_alerts row or
    // emailing admins. State (`lastAlertAt`, `suppressedSinceLastFire`)
    // is left untouched so the next post-PTO fire still reports the
    // suppressed count accurately. Lazy import keeps the module DAG
    // cycle-free.
    try {
      const { isNotifierMutedByPto, bumpFounderPtoSuppressedCount } =
        await import("./founder-pto-mode-service");
      const ptoSnooze = await isNotifierMutedByPto("gateway_block_alert");
      if (ptoSnooze) {
        s.suppressedSinceLastFire += 1;
        await bumpFounderPtoSuppressedCount();
        return false;
      }
    } catch (err) {
      console.error(
        "[GatewayBlockAlert] PTO mode check failed:",
        (err as Error)?.message ?? err,
      );
    }

    const threshold = thresholdValue();
    const window = windowMs();
    const count = s.timestamps.length;
    const suppressed = s.suppressedSinceLastFire;
    s.lastAlertAt = now;
    s.suppressedSinceLastFire = 0;

    const windowSec = Math.round(window / 1000);
    const reasonSummary = Array.from(new Set(s.lastReasons)).slice(-3).join(", ");
    const repeatedNote =
      suppressed > 0 ? ` (${suppressed} further block(s) suppressed since last alert)` : "";
    const topConnectors = this.topOffendingConnectors(s, 3);
    const platformReasonCategoryCounts = countReasonsByCategory(s.reasons);
    const topConnector = topConnectors[0] ?? null;
    // Task #443: surface any connectors auto-paused for this platform
    // alongside the per-platform alert so the founder sees both the
    // outage and the containment action in one place.
    const autoPausedConnectors: Array<{ connectorId: string; reason: string; pausedAt: string }> = [];
    for (const [connectorId, c] of s.perConnector.entries()) {
      if (c.autoPausedAt != null) {
        autoPausedConnectors.push({
          connectorId,
          reason: `auto_paused after ${c.consecutiveOverThreshold} consecutive over-threshold window(s)`,
          pausedAt: new Date(c.autoPausedAt).toISOString(),
        });
      }
    }
    const connectorSummary = topConnectors.length
      ? `; top connector(s): ${topConnectors
          .map((tc) => `${tc.connectorId}=${tc.count}`)
          .join(", ")}`
      : "";
    // Deep-link the action URL straight to the offending connector row so
    // admins land on the right card with one click (Task #419).
    const actionUrl = topConnector
      ? `${ALERT_LINK}-${encodeURIComponent(topConnector.connectorId)}`
      : ALERT_LINK;
    const message =
      `Audience gateway is blocking sends for ${platform}: ` +
      `${count} block(s) in the last ${windowSec}s (threshold ${threshold})` +
      `${reasonSummary ? `; recent reasons: ${reasonSummary}` : ""}` +
      `${connectorSummary}` +
      repeatedNote;

    try {
      await panicButtonService.createAlert({
        type: GATEWAY_BLOCK_ALERT_TYPE,
        severity: count >= threshold * 2 ? "critical" : "warning",
        message,
        details: {
          source: "gateway-block-alert-service",
          platform,
          windowMs: window,
          threshold,
          blockedCount: count,
          recentReasons: Array.from(new Set(s.lastReasons)).slice(-5),
          reasonCategoryCounts: platformReasonCategoryCounts,
          topConnectors,
          suppressedSinceLastFire: suppressed,
          dedupWindowMs: dedupMs(),
          link: actionUrl,
          actionUrl,
          autoPausedConnectors,
        },
        autoTriggered: true,
      });
      s.hasOpenAlert = true;
    } catch (err) {
      console.error("[GatewayBlockAlert] failed to create platform alert:", err);
    }

    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)));
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title: `Audience gateway blocking sends (${platform})`,
          severity: count >= threshold * 2 ? "high" : "medium",
          message,
          actionUrl,
        });
      }
    } catch (err) {
      console.error("[GatewayBlockAlert] failed to email admins:", err);
    }

    return true;
  }

  /**
   * Task #443: evaluate per-connector consecutive-window counters and
   * auto-pause any connector that has stayed at-or-above the alert
   * threshold for the configured number of evaluation windows in a
   * row. The auto-resolve tick is the natural "window check" cadence
   * (defaults to one tick per `DEFAULT_AUTO_RESOLVE_INTERVAL_MS`).
   *
   * Returns the list of `{connectorId, platform, reason}` actually
   * paused on this evaluation pass — the caller stitches that list
   * into the alert detail field `autoPausedConnectors`.
   */
  async evaluateAutoPause(now = Date.now()): Promise<
    Array<{ connectorId: string; platform: PlatformKey; reason: string; consecutiveWindows: number }>
  > {
    if (!gatewayBlockAlertSettingsService.getAutoPauseEnabledSync()) return [];
    const threshold = thresholdValue();
    const recovery = recoveryThreshold();
    const requiredWindows = gatewayBlockAlertSettingsService.getAutoPauseWindowsSync();
    const paused: Array<{
      connectorId: string;
      platform: PlatformKey;
      reason: string;
      consecutiveWindows: number;
    }> = [];
    for (const [platform, s] of this.state.entries()) {
      this.prune(s, now);
      for (const [connectorId, c] of s.perConnector.entries()) {
        const count = c.timestamps.length;
        if (count >= threshold) {
          c.consecutiveOverThreshold += 1;
        } else if (count <= recovery) {
          c.consecutiveOverThreshold = 0;
          // Once the storm dies down, allow a future re-pause if it
          // returns. Without this reset we'd skip the pause forever
          // after the first one (autoPausedAt is sticky).
          if (c.autoPausedAt != null) c.autoPausedAt = null;
        }
        if (
          connectorId !== "unknown" &&
          c.consecutiveOverThreshold >= requiredWindows &&
          c.autoPausedAt == null
        ) {
          const reason =
            `auto_paused: ${count} gateway blocks in last ${Math.round(windowMs() / 1000)}s ` +
            `>= threshold ${threshold} for ${c.consecutiveOverThreshold} consecutive ` +
            `${c.consecutiveOverThreshold === 1 ? "window" : "windows"}`;
          try {
            const updated = await omniChannelAudienceSafetyService.autoPauseConnector(
              connectorId,
              reason,
            );
            if (updated) {
              c.autoPausedAt = now;
              paused.push({ connectorId, platform, reason, consecutiveWindows: c.consecutiveOverThreshold });
              console.log(
                `[GatewayBlockAlert] auto-paused connector=${connectorId} platform=${platform} ` +
                  `after ${c.consecutiveOverThreshold} consecutive over-threshold window(s)`,
              );
            } else {
              // Connector was already paused / unknown — record so we
              // don't re-attempt on every tick.
              c.autoPausedAt = now;
            }
          } catch (err) {
            console.error(
              `[GatewayBlockAlert] failed to auto-pause connector=${connectorId}:`,
              err,
            );
          }
        }
      }
    }
    if (paused.length > 0) {
      await this.recordAutoPauseOnOpenAlerts(paused, now);
    }
    return paused;
  }

  /**
   * Stitch the auto-paused-connectors list onto any open
   * `audience_gateway_blocks_high` alert row for the same platform so
   * a founder reading the existing alert sees the auto-pause action
   * even when dedup suppresses a fresh alert.
   */
  private async recordAutoPauseOnOpenAlerts(
    paused: Array<{ connectorId: string; platform: PlatformKey; reason: string }>,
    now: number,
  ): Promise<void> {
    try {
      const open = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(platformAlerts.type, GATEWAY_BLOCK_ALERT_TYPE),
            eq(platformAlerts.acknowledged, false),
          ),
        );
      const byPlatform = new Map<PlatformKey, typeof paused>();
      for (const p of paused) {
        const arr = byPlatform.get(p.platform) ?? [];
        arr.push(p);
        byPlatform.set(p.platform, arr);
      }
      for (const row of open) {
        const prev =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        const rowPlatform = (prev.platform ?? "unknown") as PlatformKey;
        const adds = byPlatform.get(rowPlatform);
        if (!adds || adds.length === 0) continue;
        const existing: Array<{ connectorId: string; reason: string; pausedAt: string }> =
          Array.isArray(prev.autoPausedConnectors) ? prev.autoPausedConnectors : [];
        const merged = [
          ...existing,
          ...adds.map((p) => ({
            connectorId: p.connectorId,
            reason: p.reason,
            pausedAt: new Date(now).toISOString(),
          })),
        ];
        await db
          .update(platformAlerts)
          .set({ details: { ...prev, autoPausedConnectors: merged } })
          .where(eq(platformAlerts.id, row.id));
      }
    } catch (err) {
      console.error("[GatewayBlockAlert] failed to record auto-pause on open alerts:", err);
    }
  }

  /**
   * Auto-resolve open `audience_gateway_blocks_high` alerts for any
   * platform whose current rolling block count has fallen back to
   * <= the recovery threshold.
   */
  async autoResolveHealthy(now = Date.now()): Promise<number> {
    const recovery = recoveryThreshold();
    const recovered: PlatformKey[] = [];
    for (const [platform, s] of this.state.entries()) {
      this.prune(s, now);
      if (s.hasOpenAlert && s.timestamps.length <= recovery) {
        recovered.push(platform);
      }
    }
    if (recovered.length === 0) return 0;

    let resolved = 0;
    try {
      const open = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(platformAlerts.type, GATEWAY_BLOCK_ALERT_TYPE),
            eq(platformAlerts.acknowledged, false),
          ),
        )
        .orderBy(desc(platformAlerts.createdAt));
      const resolvedAt = new Date();
      for (const row of open) {
        const prev =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        const rowPlatform = (prev.platform ?? "unknown") as PlatformKey;
        if (!recovered.includes(rowPlatform)) continue;
        const s = this.state.get(rowPlatform);
        const currentCount = s ? s.timestamps.length : 0;
        const mergedDetails = {
          ...prev,
          autoResolved: true,
          autoResolvedAt: resolvedAt.toISOString(),
          autoResolvedBlockedCount: currentCount,
          autoResolvedRecoveryThreshold: recovery,
          autoResolvedNote:
            `Auto-cleared: ${rowPlatform} gateway blocks fell to ${currentCount} ` +
            `(recovery threshold ${recovery}) in the last ${Math.round(windowMs() / 1000)}s.`,
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
      for (const p of recovered) {
        const s = this.state.get(p);
        if (s) {
          s.hasOpenAlert = false;
          s.lastAlertAt = null;
          s.suppressedSinceLastFire = 0;
        }
      }
      if (resolved > 0) {
        console.log(
          `[GatewayBlockAlert] auto-resolved ${resolved} open alert(s) for platforms=${recovered.join(",")}`,
        );
      }
    } catch (err) {
      console.error("[GatewayBlockAlert] failed to auto-resolve alerts:", err);
    }
    return resolved;
  }

  /**
   * Subscribe to the bus and start the periodic auto-resolve tick. Safe
   * to call once at boot; calling again is a no-op until `stop()`.
   */
  start(autoResolveIntervalMs = DEFAULT_AUTO_RESOLVE_INTERVAL_MS): void {
    if (this.unsubscribe) return;
    // Prime the DB-backed settings cache so the sync getters used inside
    // `handleBlocked` see any admin override that was saved before boot.
    gatewayBlockAlertSettingsService.ensureCacheLoaded().catch((err) =>
      console.error("[GatewayBlockAlert] failed to load settings cache", err),
    );
    this.unsubscribe = neuralNewsroomBus.subscribe("audience.gateway_send_blocked", {
      id: "gateway-block-alert-service",
      type: "admin",
      handler: (e: BusEvent) => {
        this.handleBlocked(e.payload as BlockedPayload).catch((err) =>
          console.error("[GatewayBlockAlert] handler error", err),
        );
      },
    });
    this.autoResolveIntervalMs = autoResolveIntervalMs;
    this.autoResolveHandle = setInterval(() => {
      // Task #443: evaluate auto-pause *before* auto-resolve so a
      // connector that just got paused doesn't briefly disappear from
      // the alert payload during the same tick.
      this.evaluateAutoPause()
        .catch((err) => console.error("[GatewayBlockAlert] auto-pause tick error", err))
        .then(() =>
          this.autoResolveHealthy().catch((err) =>
            console.error("[GatewayBlockAlert] auto-resolve tick error", err),
          ),
        );
    }, autoResolveIntervalMs);
    this.autoResolveHandle.unref?.();
    console.log(
      `[GatewayBlockAlert] subscriber started (threshold=${thresholdValue()}/${Math.round(
        windowMs() / 1000,
      )}s, recovery=${recoveryThreshold()}, dedup=${dedupMs()}ms)`,
    );
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.autoResolveHandle) {
      clearInterval(this.autoResolveHandle);
      this.autoResolveHandle = null;
      this.autoResolveIntervalMs = null;
    }
  }

  /** Test helper: snapshot current rolling counts. */
  getSnapshot(now = Date.now()): Array<{ platform: PlatformKey; count: number; hasOpenAlert: boolean }> {
    const out: Array<{ platform: PlatformKey; count: number; hasOpenAlert: boolean }> = [];
    for (const [platform, s] of this.state.entries()) {
      this.prune(s, now);
      out.push({ platform, count: s.timestamps.length, hasOpenAlert: s.hasOpenAlert });
    }
    return out;
  }

  /**
   * Public snapshot driven by the same rolling window as the alert
   * detector, broken down per connector. Surfaced on the omni-channel
   * audience admin page so admins can see which connector is causing
   * the block storm without waiting for the alert to fire (Task #419).
   */
  getConnectorBlockSnapshot(now = Date.now()): {
    windowMs: number;
    threshold: number;
    connectors: Array<{
      connectorId: string;
      platform: PlatformKey;
      blockedCount: number;
      recentReasons: string[];
      reasonCategoryCounts: Partial<Record<GatewayBlockCategory, number>>;
    }>;
  } {
    const connectors: Array<{
      connectorId: string;
      platform: PlatformKey;
      blockedCount: number;
      recentReasons: string[];
      reasonCategoryCounts: Partial<Record<GatewayBlockCategory, number>>;
    }> = [];
    for (const [platform, s] of this.state.entries()) {
      this.prune(s, now);
      for (const [connectorId, c] of s.perConnector.entries()) {
        if (c.timestamps.length === 0) continue;
        connectors.push({
          connectorId,
          platform,
          blockedCount: c.timestamps.length,
          recentReasons: Array.from(new Set(c.lastReasons)).slice(-5),
          reasonCategoryCounts: countReasonsByCategory(c.reasons),
        });
      }
    }
    connectors.sort((a, b) => b.blockedCount - a.blockedCount);
    return {
      windowMs: windowMs(),
      threshold: thresholdValue(),
      connectors,
    };
  }

  /** Test helper: clear all per-platform counters and dedup state. */
  resetForTests(): void {
    this.stop();
    this.state.clear();
  }
}

export const gatewayBlockAlertService = new GatewayBlockAlertService();
