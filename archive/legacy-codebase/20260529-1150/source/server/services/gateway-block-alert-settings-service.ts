/**
 * Gateway block alert settings (Task #420).
 *
 * Centralises the four tunables introduced by Task #381 so root admins
 * can edit them from the omni-channel audience dashboard instead of
 * editing Replit Secrets + restarting the server:
 *
 *   - threshold   : blocks per window per platform that opens an alert
 *   - windowMs    : rolling window the threshold is measured over
 *   - dedupMs     : cooldown after firing before the same platform may
 *                   re-fire (0 disables dedup)
 *   - recovery    : rolling count at-or-below which an open alert is
 *                   auto-cleared. `null` means "derive from threshold / 2"
 *
 * Resolution order (highest first):
 *   1. cached DB value (`system_settings`)
 *   2. legacy env var (GATEWAY_BLOCK_ALERT_THRESHOLD / _WINDOW_MS /
 *      _DEDUP_MS / _RECOVERY) — kept so deployments that set these in
 *      Replit Secrets keep working until admins switch to the DB-backed
 *      knob.
 *   3. platform default
 *
 * `gateway-block-alert-service` reads through the sync getters on every
 * incoming block event, so the cache MUST be primed at boot via
 * `ensureCacheLoaded()` before the first event is handled.
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";

export const GATEWAY_BLOCK_ALERT_THRESHOLD_KEY = "gateway_block_alert_threshold";
export const GATEWAY_BLOCK_ALERT_WINDOW_MS_KEY = "gateway_block_alert_window_ms";
export const GATEWAY_BLOCK_ALERT_DEDUP_MS_KEY = "gateway_block_alert_dedup_ms";
export const GATEWAY_BLOCK_ALERT_RECOVERY_KEY = "gateway_block_alert_recovery";
// Task #443: auto-pause tunables.
export const GATEWAY_BLOCK_ALERT_AUTO_PAUSE_ENABLED_KEY =
  "gateway_block_alert_auto_pause_enabled";
export const GATEWAY_BLOCK_ALERT_AUTO_PAUSE_WINDOWS_KEY =
  "gateway_block_alert_auto_pause_windows";

const ALL_KEYS = [
  GATEWAY_BLOCK_ALERT_THRESHOLD_KEY,
  GATEWAY_BLOCK_ALERT_WINDOW_MS_KEY,
  GATEWAY_BLOCK_ALERT_DEDUP_MS_KEY,
  GATEWAY_BLOCK_ALERT_RECOVERY_KEY,
  GATEWAY_BLOCK_ALERT_AUTO_PAUSE_ENABLED_KEY,
  GATEWAY_BLOCK_ALERT_AUTO_PAUSE_WINDOWS_KEY,
] as const;

export const GATEWAY_BLOCK_ALERT_DEFAULTS = {
  threshold: 10,
  windowMs: 60_000,
  dedupMs: 30 * 60 * 1000,
  // null means "derive from threshold / 2" at read time.
  recovery: null as number | null,
  // Task #443: auto-pause is opt-in. When enabled, a connector that
  // crosses the per-platform block threshold for `autoPauseWindows`
  // consecutive evaluation windows has its `platformSendApproved` flag
  // flipped to false by the alert service.
  autoPauseEnabled: false,
  autoPauseWindows: 3,
};

export const GATEWAY_BLOCK_ALERT_LIMITS = {
  thresholdMin: 1,
  thresholdMax: 1000,
  windowMsMin: 1000,
  windowMsMax: 60 * 60 * 1000,
  dedupMsMin: 0,
  dedupMsMax: 24 * 60 * 60 * 1000,
  recoveryMin: 0,
  recoveryMax: 1000,
  autoPauseWindowsMin: 1,
  autoPauseWindowsMax: 100,
} as const;

export type GatewayBlockAlertSource = "db" | "env" | "default";

export interface GatewayBlockAlertSettingsStatus {
  threshold: number;
  windowMs: number;
  dedupMs: number;
  recovery: number;
  effectiveRecovery: number;
  autoPauseEnabled: boolean;
  autoPauseWindows: number;
  thresholdSource: GatewayBlockAlertSource;
  windowMsSource: GatewayBlockAlertSource;
  dedupMsSource: GatewayBlockAlertSource;
  recoverySource: GatewayBlockAlertSource;
  autoPauseEnabledSource: GatewayBlockAlertSource;
  autoPauseWindowsSource: GatewayBlockAlertSource;
  recoveryIsDerived: boolean;
  overrides: {
    threshold: number | null;
    windowMs: number | null;
    dedupMs: number | null;
    recovery: number | null;
    autoPauseEnabled: boolean | null;
    autoPauseWindows: number | null;
  };
  envFallback: {
    threshold: number | null;
    windowMs: number | null;
    dedupMs: number | null;
    recovery: number | null;
    autoPauseEnabled: boolean | null;
    autoPauseWindows: number | null;
  };
  defaults: typeof GATEWAY_BLOCK_ALERT_DEFAULTS;
  limits: typeof GATEWAY_BLOCK_ALERT_LIMITS;
}

function clampInt(n: number, min: number, max: number): number {
  const x = Math.floor(n);
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function envInt(name: string, min: number, max: number): number | null {
  const raw = process.env[name];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // Honour the caller's documented min/max even for env-sourced values so
  // a typo in Secrets can't disable the alerter entirely.
  return clampInt(n, min, max);
}

function envBool(name: string): boolean | null {
  const raw = process.env[name];
  if (raw == null || raw === "") return null;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return null;
}

class GatewayBlockAlertSettingsService {
  private cachedThreshold: number | null = null;
  private cachedWindowMs: number | null = null;
  private cachedDedupMs: number | null = null;
  // `null` is a meaningful cached value for recovery (= "derive"), so we
  // need a separate "loaded" flag.
  private cachedRecovery: number | null = null;
  private cachedRecoveryLoaded = false;
  // Task #443 auto-pause cache.
  private cachedAutoPauseEnabled: boolean | null = null;
  private cachedAutoPauseWindows: number | null = null;
  private cacheLoadPromise: Promise<void> | null = null;

  private async loadCache(): Promise<void> {
    try {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(inArray(systemSettings.key, ALL_KEYS as unknown as string[]));
      for (const row of rows) {
        const n = Number.parseInt(row.value, 10);
        if (row.key === GATEWAY_BLOCK_ALERT_THRESHOLD_KEY) {
          if (Number.isFinite(n) && n >= GATEWAY_BLOCK_ALERT_LIMITS.thresholdMin && n <= GATEWAY_BLOCK_ALERT_LIMITS.thresholdMax) {
            this.cachedThreshold = n;
          }
        } else if (row.key === GATEWAY_BLOCK_ALERT_WINDOW_MS_KEY) {
          if (Number.isFinite(n) && n >= GATEWAY_BLOCK_ALERT_LIMITS.windowMsMin && n <= GATEWAY_BLOCK_ALERT_LIMITS.windowMsMax) {
            this.cachedWindowMs = n;
          }
        } else if (row.key === GATEWAY_BLOCK_ALERT_DEDUP_MS_KEY) {
          if (Number.isFinite(n) && n >= GATEWAY_BLOCK_ALERT_LIMITS.dedupMsMin && n <= GATEWAY_BLOCK_ALERT_LIMITS.dedupMsMax) {
            this.cachedDedupMs = n;
          }
        } else if (row.key === GATEWAY_BLOCK_ALERT_RECOVERY_KEY) {
          this.cachedRecoveryLoaded = true;
          if (row.value === "" || row.value === "null") {
            this.cachedRecovery = null;
          } else if (Number.isFinite(n) && n >= GATEWAY_BLOCK_ALERT_LIMITS.recoveryMin && n <= GATEWAY_BLOCK_ALERT_LIMITS.recoveryMax) {
            this.cachedRecovery = n;
          }
        } else if (row.key === GATEWAY_BLOCK_ALERT_AUTO_PAUSE_ENABLED_KEY) {
          const v = row.value.trim().toLowerCase();
          if (v === "true" || v === "1") this.cachedAutoPauseEnabled = true;
          else if (v === "false" || v === "0") this.cachedAutoPauseEnabled = false;
        } else if (row.key === GATEWAY_BLOCK_ALERT_AUTO_PAUSE_WINDOWS_KEY) {
          if (
            Number.isFinite(n) &&
            n >= GATEWAY_BLOCK_ALERT_LIMITS.autoPauseWindowsMin &&
            n <= GATEWAY_BLOCK_ALERT_LIMITS.autoPauseWindowsMax
          ) {
            this.cachedAutoPauseWindows = n;
          }
        }
      }
    } catch {
      /* leave cache untouched; sync getters fall back to env/default */
    }
  }

  ensureCacheLoaded(): Promise<void> {
    if (!this.cacheLoadPromise) {
      this.cacheLoadPromise = this.loadCache();
    }
    return this.cacheLoadPromise;
  }

  getThresholdSync(): number {
    if (this.cachedThreshold != null) return this.cachedThreshold;
    return (
      envInt("GATEWAY_BLOCK_ALERT_THRESHOLD", GATEWAY_BLOCK_ALERT_LIMITS.thresholdMin, GATEWAY_BLOCK_ALERT_LIMITS.thresholdMax) ??
      GATEWAY_BLOCK_ALERT_DEFAULTS.threshold
    );
  }

  getWindowMsSync(): number {
    if (this.cachedWindowMs != null) return this.cachedWindowMs;
    return (
      envInt("GATEWAY_BLOCK_ALERT_WINDOW_MS", GATEWAY_BLOCK_ALERT_LIMITS.windowMsMin, GATEWAY_BLOCK_ALERT_LIMITS.windowMsMax) ??
      GATEWAY_BLOCK_ALERT_DEFAULTS.windowMs
    );
  }

  getDedupMsSync(): number {
    if (this.cachedDedupMs != null) return this.cachedDedupMs;
    return (
      envInt("GATEWAY_BLOCK_ALERT_DEDUP_MS", GATEWAY_BLOCK_ALERT_LIMITS.dedupMsMin, GATEWAY_BLOCK_ALERT_LIMITS.dedupMsMax) ??
      GATEWAY_BLOCK_ALERT_DEFAULTS.dedupMs
    );
  }

  /**
   * Raw recovery override: returns the explicit value (DB cache or env) or
   * `null` to mean "derive from threshold / 2".
   */
  private getRecoveryRawSync(): number | null {
    if (this.cachedRecoveryLoaded) return this.cachedRecovery;
    const env = envInt(
      "GATEWAY_BLOCK_ALERT_RECOVERY",
      GATEWAY_BLOCK_ALERT_LIMITS.recoveryMin,
      GATEWAY_BLOCK_ALERT_LIMITS.recoveryMax,
    );
    return env;
  }

  /** Effective recovery threshold the alert service should use. */
  getEffectiveRecoverySync(): number {
    const raw = this.getRecoveryRawSync();
    if (raw != null) return raw;
    return Math.floor(this.getThresholdSync() / 2);
  }

  /** Task #443: opt-in auto-pause flag (DB > env > default false). */
  getAutoPauseEnabledSync(): boolean {
    if (this.cachedAutoPauseEnabled != null) return this.cachedAutoPauseEnabled;
    const env = envBool("GATEWAY_BLOCK_ALERT_AUTO_PAUSE_ENABLED");
    if (env != null) return env;
    return GATEWAY_BLOCK_ALERT_DEFAULTS.autoPauseEnabled;
  }

  /** Task #443: consecutive-window threshold for auto-pause. */
  getAutoPauseWindowsSync(): number {
    if (this.cachedAutoPauseWindows != null) return this.cachedAutoPauseWindows;
    return (
      envInt(
        "GATEWAY_BLOCK_ALERT_AUTO_PAUSE_WINDOWS",
        GATEWAY_BLOCK_ALERT_LIMITS.autoPauseWindowsMin,
        GATEWAY_BLOCK_ALERT_LIMITS.autoPauseWindowsMax,
      ) ?? GATEWAY_BLOCK_ALERT_DEFAULTS.autoPauseWindows
    );
  }

  private thresholdSource(): GatewayBlockAlertSource {
    if (this.cachedThreshold != null) return "db";
    return envInt("GATEWAY_BLOCK_ALERT_THRESHOLD", GATEWAY_BLOCK_ALERT_LIMITS.thresholdMin, GATEWAY_BLOCK_ALERT_LIMITS.thresholdMax) != null
      ? "env"
      : "default";
  }

  private windowMsSource(): GatewayBlockAlertSource {
    if (this.cachedWindowMs != null) return "db";
    return envInt("GATEWAY_BLOCK_ALERT_WINDOW_MS", GATEWAY_BLOCK_ALERT_LIMITS.windowMsMin, GATEWAY_BLOCK_ALERT_LIMITS.windowMsMax) != null
      ? "env"
      : "default";
  }

  private dedupMsSource(): GatewayBlockAlertSource {
    if (this.cachedDedupMs != null) return "db";
    return envInt("GATEWAY_BLOCK_ALERT_DEDUP_MS", GATEWAY_BLOCK_ALERT_LIMITS.dedupMsMin, GATEWAY_BLOCK_ALERT_LIMITS.dedupMsMax) != null
      ? "env"
      : "default";
  }

  private recoverySource(): GatewayBlockAlertSource {
    if (this.cachedRecoveryLoaded) return "db";
    return envInt("GATEWAY_BLOCK_ALERT_RECOVERY", GATEWAY_BLOCK_ALERT_LIMITS.recoveryMin, GATEWAY_BLOCK_ALERT_LIMITS.recoveryMax) != null
      ? "env"
      : "default";
  }

  private autoPauseEnabledSource(): GatewayBlockAlertSource {
    if (this.cachedAutoPauseEnabled != null) return "db";
    return envBool("GATEWAY_BLOCK_ALERT_AUTO_PAUSE_ENABLED") != null ? "env" : "default";
  }

  private autoPauseWindowsSource(): GatewayBlockAlertSource {
    if (this.cachedAutoPauseWindows != null) return "db";
    return envInt(
      "GATEWAY_BLOCK_ALERT_AUTO_PAUSE_WINDOWS",
      GATEWAY_BLOCK_ALERT_LIMITS.autoPauseWindowsMin,
      GATEWAY_BLOCK_ALERT_LIMITS.autoPauseWindowsMax,
    ) != null
      ? "env"
      : "default";
  }

  async setThreshold(value: number, updatedBy?: string): Promise<number> {
    if (!Number.isFinite(value)) throw new Error("invalid_value");
    const v = clampInt(value, GATEWAY_BLOCK_ALERT_LIMITS.thresholdMin, GATEWAY_BLOCK_ALERT_LIMITS.thresholdMax);
    if (v !== Math.floor(value)) throw new Error("out_of_range");
    await this.writeRow(GATEWAY_BLOCK_ALERT_THRESHOLD_KEY, String(v), updatedBy);
    this.cachedThreshold = v;
    return v;
  }

  async setWindowMs(value: number, updatedBy?: string): Promise<number> {
    if (!Number.isFinite(value)) throw new Error("invalid_value");
    const v = clampInt(value, GATEWAY_BLOCK_ALERT_LIMITS.windowMsMin, GATEWAY_BLOCK_ALERT_LIMITS.windowMsMax);
    if (v !== Math.floor(value)) throw new Error("out_of_range");
    await this.writeRow(GATEWAY_BLOCK_ALERT_WINDOW_MS_KEY, String(v), updatedBy);
    this.cachedWindowMs = v;
    return v;
  }

  async setDedupMs(value: number, updatedBy?: string): Promise<number> {
    if (!Number.isFinite(value)) throw new Error("invalid_value");
    const v = clampInt(value, GATEWAY_BLOCK_ALERT_LIMITS.dedupMsMin, GATEWAY_BLOCK_ALERT_LIMITS.dedupMsMax);
    if (v !== Math.floor(value)) throw new Error("out_of_range");
    await this.writeRow(GATEWAY_BLOCK_ALERT_DEDUP_MS_KEY, String(v), updatedBy);
    this.cachedDedupMs = v;
    return v;
  }

  /**
   * `null` => persist an explicit "derive from threshold / 2" choice
   * (overrides any env var). `undefined` is not accepted here; callers
   * that want to clear the DB override should use `clearRecovery()`.
   */
  async setRecovery(value: number | null, updatedBy?: string): Promise<number | null> {
    if (value === null) {
      await this.writeRow(GATEWAY_BLOCK_ALERT_RECOVERY_KEY, "null", updatedBy);
      this.cachedRecoveryLoaded = true;
      this.cachedRecovery = null;
      return null;
    }
    if (!Number.isFinite(value)) throw new Error("invalid_value");
    const v = clampInt(value, GATEWAY_BLOCK_ALERT_LIMITS.recoveryMin, GATEWAY_BLOCK_ALERT_LIMITS.recoveryMax);
    if (v !== Math.floor(value)) throw new Error("out_of_range");
    await this.writeRow(GATEWAY_BLOCK_ALERT_RECOVERY_KEY, String(v), updatedBy);
    this.cachedRecoveryLoaded = true;
    this.cachedRecovery = v;
    return v;
  }

  async setAutoPauseEnabled(value: boolean, updatedBy?: string): Promise<boolean> {
    const v = value === true;
    await this.writeRow(GATEWAY_BLOCK_ALERT_AUTO_PAUSE_ENABLED_KEY, v ? "true" : "false", updatedBy);
    this.cachedAutoPauseEnabled = v;
    return v;
  }

  async setAutoPauseWindows(value: number, updatedBy?: string): Promise<number> {
    if (!Number.isFinite(value)) throw new Error("invalid_value");
    const v = clampInt(
      value,
      GATEWAY_BLOCK_ALERT_LIMITS.autoPauseWindowsMin,
      GATEWAY_BLOCK_ALERT_LIMITS.autoPauseWindowsMax,
    );
    if (v !== Math.floor(value)) throw new Error("out_of_range");
    await this.writeRow(GATEWAY_BLOCK_ALERT_AUTO_PAUSE_WINDOWS_KEY, String(v), updatedBy);
    this.cachedAutoPauseWindows = v;
    return v;
  }

  async clearOverrides(updatedBy?: string): Promise<void> {
    void updatedBy;
    await db.delete(systemSettings).where(inArray(systemSettings.key, ALL_KEYS as unknown as string[]));
    this.cachedThreshold = null;
    this.cachedWindowMs = null;
    this.cachedDedupMs = null;
    this.cachedRecovery = null;
    this.cachedRecoveryLoaded = false;
    this.cachedAutoPauseEnabled = null;
    this.cachedAutoPauseWindows = null;
  }

  private async writeRow(key: string, value: string, updatedBy?: string): Promise<void> {
    await db
      .insert(systemSettings)
      .values({ key, value, updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedBy, updatedAt: new Date() },
      });
  }

  async getStatus(): Promise<GatewayBlockAlertSettingsStatus> {
    await this.ensureCacheLoaded();
    const recoveryRaw = this.getRecoveryRawSync();
    return {
      threshold: this.getThresholdSync(),
      windowMs: this.getWindowMsSync(),
      dedupMs: this.getDedupMsSync(),
      recovery: recoveryRaw ?? this.getEffectiveRecoverySync(),
      effectiveRecovery: this.getEffectiveRecoverySync(),
      autoPauseEnabled: this.getAutoPauseEnabledSync(),
      autoPauseWindows: this.getAutoPauseWindowsSync(),
      thresholdSource: this.thresholdSource(),
      windowMsSource: this.windowMsSource(),
      dedupMsSource: this.dedupMsSource(),
      recoverySource: this.recoverySource(),
      autoPauseEnabledSource: this.autoPauseEnabledSource(),
      autoPauseWindowsSource: this.autoPauseWindowsSource(),
      recoveryIsDerived: recoveryRaw == null,
      overrides: {
        threshold: this.cachedThreshold,
        windowMs: this.cachedWindowMs,
        dedupMs: this.cachedDedupMs,
        recovery: this.cachedRecoveryLoaded ? this.cachedRecovery : null,
        autoPauseEnabled: this.cachedAutoPauseEnabled,
        autoPauseWindows: this.cachedAutoPauseWindows,
      },
      envFallback: {
        threshold: envInt(
          "GATEWAY_BLOCK_ALERT_THRESHOLD",
          GATEWAY_BLOCK_ALERT_LIMITS.thresholdMin,
          GATEWAY_BLOCK_ALERT_LIMITS.thresholdMax,
        ),
        windowMs: envInt(
          "GATEWAY_BLOCK_ALERT_WINDOW_MS",
          GATEWAY_BLOCK_ALERT_LIMITS.windowMsMin,
          GATEWAY_BLOCK_ALERT_LIMITS.windowMsMax,
        ),
        dedupMs: envInt(
          "GATEWAY_BLOCK_ALERT_DEDUP_MS",
          GATEWAY_BLOCK_ALERT_LIMITS.dedupMsMin,
          GATEWAY_BLOCK_ALERT_LIMITS.dedupMsMax,
        ),
        recovery: envInt(
          "GATEWAY_BLOCK_ALERT_RECOVERY",
          GATEWAY_BLOCK_ALERT_LIMITS.recoveryMin,
          GATEWAY_BLOCK_ALERT_LIMITS.recoveryMax,
        ),
        autoPauseEnabled: envBool("GATEWAY_BLOCK_ALERT_AUTO_PAUSE_ENABLED"),
        autoPauseWindows: envInt(
          "GATEWAY_BLOCK_ALERT_AUTO_PAUSE_WINDOWS",
          GATEWAY_BLOCK_ALERT_LIMITS.autoPauseWindowsMin,
          GATEWAY_BLOCK_ALERT_LIMITS.autoPauseWindowsMax,
        ),
      },
      defaults: GATEWAY_BLOCK_ALERT_DEFAULTS,
      limits: GATEWAY_BLOCK_ALERT_LIMITS,
    };
  }

  /** Test helper: drop in-memory cache so the next read re-loads from DB. */
  resetForTests(): void {
    this.cachedAutoPauseEnabled = null;
    this.cachedAutoPauseWindows = null;
    this.cachedThreshold = null;
    this.cachedWindowMs = null;
    this.cachedDedupMs = null;
    this.cachedRecovery = null;
    this.cachedRecoveryLoaded = false;
    this.cacheLoadPromise = null;
  }
}

export const gatewayBlockAlertSettingsService = new GatewayBlockAlertSettingsService();
