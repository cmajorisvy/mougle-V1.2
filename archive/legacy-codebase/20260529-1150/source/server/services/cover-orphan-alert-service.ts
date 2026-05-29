/**
 * Cover-orphan alert.
 *
 * The Cover File Sweep panel only runs when an admin opens it. If a failed
 * delete or crashed render silently leaves cover files behind, nobody notices
 * until storage matters.
 *
 * This service runs the same dry-run sweep on a schedule (daily by default)
 * and, when the orphan count exceeds a configurable threshold, fires a single
 * `platform_alerts` row + best-effort email to active root admins.
 *
 * It mirrors the pattern used by `shorts-backlog-alert-service.ts`:
 *  - Threshold lives in `system_settings` under `cover_orphan_alert_threshold`
 *    (default 25) so it can be tuned without a deploy.
 *  - The alert only re-fires on the transition from <= threshold to >
 *    threshold; it will not spam while the backlog stays above the line.
 *  - The latest scan timestamp + count are exposed via `getStatus()` so the
 *    admin panel can show "last scheduled scan ran at …".
 */

import { readdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { adminStaff, platformAlerts, systemSettings } from "@shared/schema";
import { broadcastCompositorService } from "./broadcast-compositor-service";
import { panicButtonService } from "./panic-button-service";
import { EmailService } from "./email-service";

const THRESHOLD_KEY = "cover_orphan_alert_threshold";
const THRESHOLD_DEFAULT = 25;
const ALERT_TYPE = "broadcast_cover_orphans";
const FLAPPING_ALERT_TYPE = "broadcast_cover_orphans_flapping";

// Audit-log rotation tuning. Persisted in system_settings so founders can
// tweak retention from the admin dashboard without redeploying. Falls back
// to env var (`COVER_SWEEP_AUDIT_MAX_BYTES`, `COVER_SWEEP_AUDIT_MAX_ARCHIVES`)
// and then to the platform defaults below.
const AUDIT_MAX_BYTES_KEY = "cover_sweep_audit_max_bytes";
const AUDIT_MAX_ARCHIVES_KEY = "cover_sweep_audit_max_archives";
const AUDIT_MAX_BYTES_DEFAULT = 1024 * 1024; // 1 MiB
const AUDIT_MAX_ARCHIVES_DEFAULT = 4;
// Guardrails so a bad admin value can't make the audit unbounded or so small
// that every line rotates. 64 KiB ≤ size ≤ 100 MiB ; 1 ≤ archives ≤ 100.
//
// Decision (task #334, see `docs/RELEASE_NOTES.md`) — zero archives is NOT honoured. The legacy
// `COVER_SWEEP_AUDIT_MAX_ARCHIVES=0` value used to mean "rotate and
// immediately delete the old file"; we intentionally reject that here
// because an audit log with zero retained archives wipes its own
// evidence on every rotation. `envPositiveInt` treats 0 as unset so
// upgraded deployments fall through to the platform default (4) rather
// than the new minimum of 1. Founders who genuinely want "rotate and
// delete" should disable the audit at the source rather than configure
// zero retention. The same decision is mirrored in
// `media-orphan-alert-service.ts` and
// `fallback-preset-audit-settings-service.ts`.
const AUDIT_MAX_BYTES_MIN = 64 * 1024;
const AUDIT_MAX_BYTES_MAX = 100 * 1024 * 1024;
const AUDIT_MAX_ARCHIVES_MIN = 1;
const AUDIT_MAX_ARCHIVES_MAX = 100;

export const COVER_SWEEP_AUDIT_LIMITS = {
  bytesMin: AUDIT_MAX_BYTES_MIN,
  bytesMax: AUDIT_MAX_BYTES_MAX,
  archivesMin: AUDIT_MAX_ARCHIVES_MIN,
  archivesMax: AUDIT_MAX_ARCHIVES_MAX,
  bytesDefault: AUDIT_MAX_BYTES_DEFAULT,
  archivesDefault: AUDIT_MAX_ARCHIVES_DEFAULT,
} as const;

function envPositiveInt(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const n = Number(raw);
  // `n <= 0` deliberately includes 0: see the AUDIT_MAX_* guardrails
  // comment above (task #334). 0 is treated as unset so callers fall
  // through to the platform default rather than the new minimum of 1.
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

const COVER_EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const LOCAL_COVERS_FALLBACK = resolve(
  process.cwd(),
  ".local/media-assets/broadcasts/covers",
);

function coversDir(): string {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (envDir) {
    try {
      return resolve(envDir, "broadcasts", "covers");
    } catch {
      /* fall through */
    }
  }
  return LOCAL_COVERS_FALLBACK;
}

export interface CoverSweepScanResult {
  orphanCount: number;
  orphanBytes: number;
  scannedAt: number;
}

export interface CoverOrphanAlertStatus {
  lastScanAt: number | null;
  lastOrphanCount: number | null;
  lastOrphanBytes: number | null;
  threshold: number;
  wasAboveThreshold: boolean;
  nextScanAt: number | null;
  intervalMs: number | null;
  lastAutoResolvedAt: number | null;
  lastAutoResolvedCount: number | null;
  flapping: boolean;
  flappingCount: number;
  flappingWindowMs: number;
  flappingThreshold: number;
  // Task #831 — observability for the flapping latch. `lastFlappingFiredAt`
  // is the createdAt of the most recent `broadcast_cover_orphans_flapping`
  // platform_alert (null if it has never fired). `lastReArmedAt` is the
  // wall-clock time the latch was last re-armed by a threshold/window
  // save (null if it has never been re-armed via the DB-backed setters).
  lastFlappingFiredAt: number | null;
  lastReArmedAt: number | null;
  auditMaxBytes: number;
  auditMaxArchives: number;
  auditMaxBytesSource: "db" | "env" | "default";
  auditMaxArchivesSource: "db" | "env" | "default";
  auditLimits: {
    bytesMin: number;
    bytesMax: number;
    archivesMin: number;
    archivesMax: number;
    bytesDefault: number;
    archivesDefault: number;
  };
}

// An alert is considered "flapping" when this many or more
// `broadcast_cover_orphans` alerts auto-cleared inside the recent window
// below. Three fires within 24h is the heuristic from task #198.
//
// Task #804 — both values are now DB-backed via `system_settings` (mirroring
// the 3D-asset orphan sweep, task #794) so a founder can calm a noisy cover
// sweep or tighten it without a redeploy. Guardrails: ≥2 auto-clears
// (otherwise "flapping" is meaningless), ≤1000 (sane upper bound). Window
// between 1 minute and 90 days (matches the snooze cap used elsewhere).
const FLAPPING_THRESHOLD_KEY = "cover_orphan_sweep_flapping_threshold";
const FLAPPING_WINDOW_MS_KEY = "cover_orphan_sweep_flapping_window_ms";
// Task #831 — persisted wall-clock (ms since epoch) of the most recent
// time a founder re-armed the flapping latch by saving the threshold or
// window. Surfaced in `getStatus()` so the admin panel can show
// "Last re-arm: <time>" without grepping logs.
const LAST_REARMED_AT_KEY = "cover_orphan_sweep_flapping_last_rearmed_at";
const FLAPPING_THRESHOLD_DEFAULT = 3;
const FLAPPING_WINDOW_MS_DEFAULT = 24 * 60 * 60 * 1000;
const FLAPPING_THRESHOLD_MIN = 2;
const FLAPPING_THRESHOLD_MAX = 1000;
const FLAPPING_WINDOW_MS_MIN = 60_000;
const FLAPPING_WINDOW_MS_MAX = 90 * 24 * 60 * 60 * 1000;

export const COVER_SWEEP_FLAPPING_LIMITS = {
  thresholdMin: FLAPPING_THRESHOLD_MIN,
  thresholdMax: FLAPPING_THRESHOLD_MAX,
  thresholdDefault: FLAPPING_THRESHOLD_DEFAULT,
  windowMsMin: FLAPPING_WINDOW_MS_MIN,
  windowMsMax: FLAPPING_WINDOW_MS_MAX,
  windowMsDefault: FLAPPING_WINDOW_MS_DEFAULT,
} as const;

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

async function readBoundedSetting(
  key: string,
  defaultValue: number,
  min: number,
  max: number,
): Promise<number> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    if (rows.length === 0) return defaultValue;
    const parsed = Number.parseInt(rows[0].value, 10);
    if (!Number.isFinite(parsed)) return defaultValue;
    if (parsed < min || parsed > max) return defaultValue;
    return parsed;
  } catch {
    return defaultValue;
  }
}

async function readFlappingThreshold(): Promise<number> {
  return readBoundedSetting(
    FLAPPING_THRESHOLD_KEY,
    FLAPPING_THRESHOLD_DEFAULT,
    FLAPPING_THRESHOLD_MIN,
    FLAPPING_THRESHOLD_MAX,
  );
}

async function readFlappingWindowMs(): Promise<number> {
  return readBoundedSetting(
    FLAPPING_WINDOW_MS_KEY,
    FLAPPING_WINDOW_MS_DEFAULT,
    FLAPPING_WINDOW_MS_MIN,
    FLAPPING_WINDOW_MS_MAX,
  );
}

// Task #831 — read/write the persisted "last re-arm" wall-clock so the
// admin panel can render it next to the threshold/window controls.
async function readLastReArmedAt(): Promise<number | null> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, LAST_REARMED_AT_KEY))
      .limit(1);
    if (rows.length === 0) return null;
    const n = Number.parseInt(rows[0].value, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  } catch {
    return null;
  }
}

async function writeLastReArmedAt(
  ms: number,
  updatedBy?: string,
): Promise<void> {
  try {
    await db
      .insert(systemSettings)
      .values({
        key: LAST_REARMED_AT_KEY,
        value: String(Math.floor(ms)),
        updatedBy,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: String(Math.floor(ms)),
          updatedBy,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error(
      "[CoverOrphanAlert] failed to persist last re-arm timestamp:",
      err,
    );
  }
}

async function scanOrphanCount(): Promise<{ count: number; bytes: number }> {
  const dir = coversDir();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    // Directory not present yet (no covers ever uploaded) → 0 orphans.
    return { count: 0, bytes: 0 };
  }
  const knownIds = new Set(await broadcastCompositorService.listBroadcastIds());
  let count = 0;
  let bytes = 0;
  for (const name of entries) {
    const ext = extname(name).slice(1).toLowerCase();
    if (!COVER_EXT_TO_MIME[ext]) continue;
    const id = name.slice(0, -(ext.length + 1));
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) continue;
    if (knownIds.has(id)) continue;
    count += 1;
    try {
      const st = statSync(resolve(dir, name));
      if (st.isFile()) bytes += st.size;
    } catch {
      /* file vanished between readdir and stat; ignore */
    }
  }
  return { count, bytes };
}

class CoverOrphanAlertService {
  private wasAboveThreshold = false;
  private wasFlapping = false;
  private lastScanAt: number | null = null;
  private lastOrphanCount: number | null = null;
  private lastOrphanBytes: number | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;
  private intervalMs: number | null = null;
  private lastAutoResolvedAt: number | null = null;
  private lastAutoResolvedCount: number | null = null;
  private emailService = new EmailService();
  // Cached retention values so the synchronous rotation path in
  // `broadcasts.ts` can read them without an awaited DB hit on every audit
  // append. `null` means "not loaded yet" → fall back to env/default until
  // the first refresh completes.
  private cachedAuditMaxBytes: number | null = null;
  private cachedAuditMaxArchives: number | null = null;
  private auditCacheLoadPromise: Promise<void> | null = null;

  private async loadAuditRetentionCache(): Promise<void> {
    try {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, AUDIT_MAX_BYTES_KEY))
        .limit(1);
      if (rows.length > 0) {
        const n = Number.parseInt(rows[0].value, 10);
        if (Number.isFinite(n) && n >= AUDIT_MAX_BYTES_MIN && n <= AUDIT_MAX_BYTES_MAX) {
          this.cachedAuditMaxBytes = n;
        }
      }
    } catch {
      /* leave cache untouched; sync getter will fall back to env/default */
    }
    try {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, AUDIT_MAX_ARCHIVES_KEY))
        .limit(1);
      if (rows.length > 0) {
        const n = Number.parseInt(rows[0].value, 10);
        if (
          Number.isFinite(n) &&
          n >= AUDIT_MAX_ARCHIVES_MIN &&
          n <= AUDIT_MAX_ARCHIVES_MAX
        ) {
          this.cachedAuditMaxArchives = n;
        }
      }
    } catch {
      /* leave cache untouched */
    }
  }

  /**
   * Ensure the audit retention cache is loaded at least once. Cheap to call
   * repeatedly: the underlying promise is memoised.
   */
  ensureAuditCacheLoaded(): Promise<void> {
    if (!this.auditCacheLoadPromise) {
      this.auditCacheLoadPromise = this.loadAuditRetentionCache();
    }
    return this.auditCacheLoadPromise;
  }

  /**
   * Synchronous getter used by the audit rotation path. Priority:
   * cached DB value → env var → platform default.
   */
  getAuditMaxBytesSync(): number {
    if (this.cachedAuditMaxBytes != null) return this.cachedAuditMaxBytes;
    return envPositiveInt("COVER_SWEEP_AUDIT_MAX_BYTES") ?? AUDIT_MAX_BYTES_DEFAULT;
  }

  getAuditMaxArchivesSync(): number {
    if (this.cachedAuditMaxArchives != null) return this.cachedAuditMaxArchives;
    return (
      envPositiveInt("COVER_SWEEP_AUDIT_MAX_ARCHIVES") ?? AUDIT_MAX_ARCHIVES_DEFAULT
    );
  }

  getAuditMaxBytesSource(): "db" | "env" | "default" {
    if (this.cachedAuditMaxBytes != null) return "db";
    return envPositiveInt("COVER_SWEEP_AUDIT_MAX_BYTES") != null ? "env" : "default";
  }

  getAuditMaxArchivesSource(): "db" | "env" | "default" {
    if (this.cachedAuditMaxArchives != null) return "db";
    return envPositiveInt("COVER_SWEEP_AUDIT_MAX_ARCHIVES") != null ? "env" : "default";
  }

  async setAuditMaxBytes(value: number, updatedBy?: string): Promise<number> {
    if (!Number.isFinite(value)) throw new Error("invalid_value");
    const v = Math.floor(value);
    if (v < AUDIT_MAX_BYTES_MIN || v > AUDIT_MAX_BYTES_MAX) {
      throw new Error("out_of_range");
    }
    await db
      .insert(systemSettings)
      .values({ key: AUDIT_MAX_BYTES_KEY, value: String(v), updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(v), updatedBy, updatedAt: new Date() },
      });
    this.cachedAuditMaxBytes = v;
    return v;
  }

  async setAuditMaxArchives(value: number, updatedBy?: string): Promise<number> {
    if (!Number.isFinite(value)) throw new Error("invalid_value");
    const v = Math.floor(value);
    if (v < AUDIT_MAX_ARCHIVES_MIN || v > AUDIT_MAX_ARCHIVES_MAX) {
      throw new Error("out_of_range");
    }
    await db
      .insert(systemSettings)
      .values({ key: AUDIT_MAX_ARCHIVES_KEY, value: String(v), updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(v), updatedBy, updatedAt: new Date() },
      });
    this.cachedAuditMaxArchives = v;
    return v;
  }

  async runSweep(): Promise<CoverSweepScanResult> {
    const { count, bytes } = await scanOrphanCount();
    const scannedAt = Date.now();
    this.lastOrphanCount = count;
    this.lastOrphanBytes = bytes;
    this.lastScanAt = scannedAt;
    return { orphanCount: count, orphanBytes: bytes, scannedAt };
  }

  /**
   * Run the sweep and fire an alert when the orphan count crosses the
   * configured threshold. Safe to call repeatedly; only fires on the
   * transition from <= threshold to > threshold.
   */
  async check(): Promise<CoverSweepScanResult & { threshold: number; alerted: boolean }> {
    let scan: CoverSweepScanResult;
    try {
      scan = await this.runSweep();
    } catch (err) {
      console.error("[CoverOrphanAlert] scan failed:", err);
      return {
        orphanCount: this.lastOrphanCount ?? 0,
        orphanBytes: this.lastOrphanBytes ?? 0,
        scannedAt: Date.now(),
        threshold: await readThreshold(),
        alerted: false,
      };
    }
    const threshold = await readThreshold();
    const above = scan.orphanCount > threshold;
    let alerted = false;
    if (above && !this.wasAboveThreshold) {
      await this.fireAlert(scan.orphanCount, threshold);
      alerted = true;
    }
    if (!above) {
      await this.autoResolveOpenAlerts(scan.orphanCount, threshold);
    }
    this.wasAboveThreshold = above;

    // Flapping latch: after any state change above, recompute the
    // recent auto-clear count and fire a one-shot alert the first time
    // we cross into "flapping" territory. Re-arms only after the count
    // drops back below the flapping threshold.
    try {
      const flappingWindowMs = await readFlappingWindowMs();
      const flappingThreshold = await readFlappingThreshold();
      const flappingCount = await this.countRecentAutoClears(flappingWindowMs);
      const flapping = flappingCount >= flappingThreshold;
      if (flapping && !this.wasFlapping) {
        await this.fireFlappingAlert(
          flappingCount,
          flappingThreshold,
          flappingWindowMs,
        );
      }
      this.wasFlapping = flapping;
    } catch (err) {
      console.error("[CoverOrphanAlert] flapping check failed:", err);
    }

    return { ...scan, threshold, alerted };
  }

  /**
   * If the latest sweep is healthy (count <= threshold), acknowledge any
   * unacknowledged `broadcast_cover_orphans` alerts as the system so
   * founders don't have to clear stale warnings by hand.
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
          row.details && typeof row.details === "object" ? (row.details as Record<string, any>) : {};
        const mergedDetails = {
          ...prevDetails,
          autoResolved: true,
          autoResolvedAt: resolvedAt.toISOString(),
          autoResolvedOrphanCount: count,
          autoResolvedThreshold: threshold,
          autoResolvedNote: `Auto-cleared by scheduled sweep: orphan count ${count} ≤ threshold ${threshold}.`,
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
        `[CoverOrphanAlert] auto-resolved ${open.length} open alert(s) (count=${count}, threshold=${threshold})`,
      );
    } catch (err) {
      console.error("[CoverOrphanAlert] failed to auto-resolve alerts:", err);
    }
  }

  start(intervalMs = 24 * 60 * 60 * 1000) {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalMs = intervalMs;
    // Warm the audit-retention cache so the synchronous rotation path picks
    // up the persisted values before the first appended audit line.
    this.ensureAuditCacheLoaded().catch(() => {
      /* non-fatal: sync getter falls back to env/default */
    });
    // Defer the first run a few seconds so it doesn't compete with other
    // startup work.
    setTimeout(() => {
      this.check().catch((err) =>
        console.error("[CoverOrphanAlert] initial check failed:", err),
      );
    }, 10_000).unref?.();
    this.intervalHandle = setInterval(() => {
      this.check().catch((err) =>
        console.error("[CoverOrphanAlert] scheduled check failed:", err),
      );
    }, intervalMs);
    this.intervalHandle.unref?.();
    console.log(
      `[CoverOrphanAlert] scheduler started (every ${Math.round(intervalMs / 60_000)}m)`,
    );
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.intervalMs = null;
      console.log("[CoverOrphanAlert] scheduler stopped");
    }
  }

  /**
   * Return the most recent auto-resolved cover orphan alerts so admins can
   * audit the sweep's behaviour from the panel (spot flapping, confirm the
   * sweep is keeping the queue healthy, etc.) without querying the table.
   */
  async listRecentAutoResolved(
    limit = 10,
  ): Promise<
    Array<{
      id: string;
      acknowledgedAt: number | null;
      orphanCount: number | null;
      threshold: number | null;
    }>
  > {
    const capped = Math.max(1, Math.min(50, Math.floor(limit) || 10));
    try {
      const rows = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(platformAlerts.type, ALERT_TYPE),
            eq(platformAlerts.acknowledged, true),
            eq(platformAlerts.acknowledgedBy, "system"),
          ),
        )
        .orderBy(desc(platformAlerts.acknowledgedAt))
        .limit(capped);
      const result: Array<{
        id: string;
        acknowledgedAt: number | null;
        orphanCount: number | null;
        threshold: number | null;
      }> = [];
      for (const row of rows) {
        const d =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        if (d.autoResolved !== true) continue;
        const orphanCount =
          typeof d.autoResolvedOrphanCount === "number"
            ? d.autoResolvedOrphanCount
            : null;
        const threshold =
          typeof d.autoResolvedThreshold === "number"
            ? d.autoResolvedThreshold
            : null;
        result.push({
          id: row.id,
          acknowledgedAt: row.acknowledgedAt
            ? new Date(row.acknowledgedAt).getTime()
            : null,
          orphanCount,
          threshold,
        });
      }
      return result;
    } catch (err) {
      console.error("[CoverOrphanAlert] failed to list recent auto-resolved:", err);
      return [];
    }
  }

  /**
   * Return the most recent cover-orphan alerts that were re-opened by an
   * admin after being auto-cleared. Lets the panel close the audit loop:
   * once an admin re-opens a suspicious auto-clear the row disappears from
   * "Recent auto-clears", so this surfaces a parallel "Recently re-opened"
   * list showing when it was re-opened, who did it, and the original
   * auto-clear time — all without leaving the panel.
   */
  async listRecentReopened(
    limit = 10,
  ): Promise<
    Array<{
      id: string;
      reopenedAt: number | null;
      reopenedBy: string | null;
      autoResolvedAt: number | null;
      orphanCount: number | null;
      threshold: number | null;
    }>
  > {
    const capped = Math.max(1, Math.min(50, Math.floor(limit) || 10));
    try {
      const rows = await db
        .select()
        .from(platformAlerts)
        .where(eq(platformAlerts.type, ALERT_TYPE))
        .orderBy(desc(platformAlerts.createdAt))
        .limit(200);
      const result: Array<{
        id: string;
        reopenedAt: number | null;
        reopenedBy: string | null;
        autoResolvedAt: number | null;
        orphanCount: number | null;
        threshold: number | null;
      }> = [];
      for (const row of rows) {
        const d =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        if (d.reopened !== true) continue;
        const reopenedAtMs =
          typeof d.reopenedAt === "string"
            ? Date.parse(d.reopenedAt) || null
            : null;
        const autoResolvedAtMs =
          typeof d.autoResolvedAt === "string"
            ? Date.parse(d.autoResolvedAt) || null
            : null;
        result.push({
          id: row.id,
          reopenedAt: reopenedAtMs,
          reopenedBy:
            typeof d.reopenedBy === "string" ? d.reopenedBy : null,
          autoResolvedAt: autoResolvedAtMs,
          orphanCount:
            typeof d.autoResolvedOrphanCount === "number"
              ? d.autoResolvedOrphanCount
              : null,
          threshold:
            typeof d.autoResolvedThreshold === "number"
              ? d.autoResolvedThreshold
              : null,
        });
      }
      result.sort((a, b) => (b.reopenedAt ?? 0) - (a.reopenedAt ?? 0));
      return result.slice(0, capped);
    } catch (err) {
      console.error("[CoverOrphanAlert] failed to list recent reopened:", err);
      return [];
    }
  }

  /**
   * Count how many `broadcast_cover_orphans` alerts auto-cleared inside the
   * recent flapping window. Used by `getStatus()` so the admin panel can
   * surface a "flapping detected" banner without scanning the table itself.
   */
  private async countRecentAutoClears(windowMs: number): Promise<number> {
    try {
      const since = new Date(Date.now() - windowMs);
      const rows = await db
        .select({ id: platformAlerts.id, details: platformAlerts.details })
        .from(platformAlerts)
        .where(
          and(
            eq(platformAlerts.type, ALERT_TYPE),
            eq(platformAlerts.acknowledged, true),
            eq(platformAlerts.acknowledgedBy, "system"),
            gte(platformAlerts.acknowledgedAt, since),
          ),
        );
      let n = 0;
      for (const row of rows) {
        const d =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        if (d.autoResolved === true) n += 1;
      }
      return n;
    } catch (err) {
      console.error("[CoverOrphanAlert] failed to count recent auto-clears:", err);
      return 0;
    }
  }

  /**
   * Re-open a previously auto-cleared alert. Used when an admin spots a
   * suspicious auto-clear in the "Recent auto-clears" list and wants the
   * alert back on the founder dashboard for human review. The original
   * auto-resolve metadata is preserved in `details` so we keep a full
   * audit trail; we just add a `reopenedBy`/`reopenedAt` block and flip
   * acknowledged back to false.
   *
   * Returns `null` if the alert id doesn't exist, isn't the cover-orphan
   * type, or wasn't actually auto-resolved by the system.
   */
  async reopenAutoResolved(
    alertId: string,
    actorId: string,
  ): Promise<{ id: string; reopenedAt: number } | null> {
    if (!alertId) return null;
    try {
      const rows = await db
        .select()
        .from(platformAlerts)
        .where(eq(platformAlerts.id, alertId))
        .limit(1);
      if (rows.length === 0) return null;
      const row = rows[0];
      if (row.type !== ALERT_TYPE) return null;
      const prevDetails =
        row.details && typeof row.details === "object"
          ? (row.details as Record<string, any>)
          : {};
      // Only allow re-opening rows that were auto-cleared by the system.
      // A human ack should be re-acked manually, not via this path.
      if (prevDetails.autoResolved !== true) return null;
      if (row.acknowledged === false) {
        // Already open — nothing to do, but treat as success so the UI
        // can simply refresh the list.
        return { id: row.id, reopenedAt: Date.now() };
      }
      const reopenedAt = new Date();
      const mergedDetails = {
        ...prevDetails,
        reopened: true,
        reopenedBy: actorId,
        reopenedAt: reopenedAt.toISOString(),
        reopenedNote: `Re-opened by ${actorId} after auto-clear at ${
          prevDetails.autoResolvedAt ?? "(unknown)"
        }.`,
      };
      await db
        .update(platformAlerts)
        .set({
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedAt: null,
          details: mergedDetails,
        })
        .where(eq(platformAlerts.id, row.id));
      console.log(
        `[CoverOrphanAlert] alert ${row.id} re-opened by ${actorId}`,
      );
      return { id: row.id, reopenedAt: reopenedAt.getTime() };
    } catch (err) {
      console.error("[CoverOrphanAlert] failed to reopen alert:", err);
      throw err;
    }
  }

  /**
   * Task #831 — Look up the createdAt of the most recent
   * `broadcast_cover_orphans_flapping` platform_alert row. Returns null
   * if the flapping alert has never fired (typical for healthy
   * installs). Used by `getStatus()` so the admin panel can render
   * "Last flapping alert: <time>" without scanning the table.
   */
  private async findLastFlappingFiredAt(): Promise<number | null> {
    try {
      const rows = await db
        .select({ createdAt: platformAlerts.createdAt })
        .from(platformAlerts)
        .where(eq(platformAlerts.type, FLAPPING_ALERT_TYPE))
        .orderBy(desc(platformAlerts.createdAt))
        .limit(1);
      if (rows.length === 0) return null;
      const ts = rows[0].createdAt;
      if (!ts) return null;
      return new Date(ts).getTime();
    } catch (err) {
      console.error(
        "[CoverOrphanAlert] failed to read last flapping fire time:",
        err,
      );
      return null;
    }
  }

  async getStatus(): Promise<CoverOrphanAlertStatus> {
    const threshold = await readThreshold();
    const flappingThreshold = await readFlappingThreshold();
    const flappingWindowMs = await readFlappingWindowMs();
    const flappingCount = await this.countRecentAutoClears(flappingWindowMs);
    const lastFlappingFiredAt = await this.findLastFlappingFiredAt();
    const lastReArmedAt = await readLastReArmedAt();
    await this.ensureAuditCacheLoaded();
    return {
      lastScanAt: this.lastScanAt,
      lastOrphanCount: this.lastOrphanCount,
      lastOrphanBytes: this.lastOrphanBytes,
      threshold,
      wasAboveThreshold: this.wasAboveThreshold,
      nextScanAt:
        this.lastScanAt && this.intervalMs
          ? this.lastScanAt + this.intervalMs
          : null,
      intervalMs: this.intervalMs,
      lastAutoResolvedAt: this.lastAutoResolvedAt,
      lastAutoResolvedCount: this.lastAutoResolvedCount,
      flapping: flappingCount >= flappingThreshold,
      flappingCount,
      flappingWindowMs,
      flappingThreshold,
      lastFlappingFiredAt,
      lastReArmedAt,
      auditMaxBytes: this.getAuditMaxBytesSync(),
      auditMaxArchives: this.getAuditMaxArchivesSync(),
      auditMaxBytesSource: this.getAuditMaxBytesSource(),
      auditMaxArchivesSource: this.getAuditMaxArchivesSource(),
      auditLimits: {
        bytesMin: AUDIT_MAX_BYTES_MIN,
        bytesMax: AUDIT_MAX_BYTES_MAX,
        archivesMin: AUDIT_MAX_ARCHIVES_MIN,
        archivesMax: AUDIT_MAX_ARCHIVES_MAX,
        bytesDefault: AUDIT_MAX_BYTES_DEFAULT,
        archivesDefault: AUDIT_MAX_ARCHIVES_DEFAULT,
      },
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
    // Recompute the latch so a lowered threshold can re-fire next crossing.
    if (this.lastOrphanCount != null) {
      this.wasAboveThreshold = this.lastOrphanCount > v;
    }
    return v;
  }

  /**
   * Task #804 — DB-backed flapping threshold. Mirrors
   * `production-asset-orphan-alert-service.setSweepFlappingThreshold`:
   * validates against the bounded guardrails, upserts the
   * `system_settings` row, and returns the effective value. Re-arms the
   * in-memory latch so a tightened threshold can fire on the next scan
   * without waiting for a fresh below→above transition.
   */
  async setFlappingThreshold(
    value: number,
    updatedBy?: string,
  ): Promise<number> {
    if (
      !Number.isFinite(value) ||
      value < FLAPPING_THRESHOLD_MIN ||
      value > FLAPPING_THRESHOLD_MAX
    ) {
      throw new Error("invalid_flapping_threshold");
    }
    const v = Math.floor(value);
    await db
      .insert(systemSettings)
      .values({ key: FLAPPING_THRESHOLD_KEY, value: String(v), updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(v), updatedBy, updatedAt: new Date() },
      });
    this.wasFlapping = false;
    // Task #831 — record the re-arm so the panel can show when the
    // latch was last cleared by a founder action.
    await writeLastReArmedAt(Date.now(), updatedBy);
    return v;
  }

  /**
   * Task #837 — Acknowledge the flapping latch without re-saving the
   * threshold or window. Flips the in-memory `wasFlapping` latch off
   * and writes a fresh `lastReArmedAt` via the same helper used by
   * `setFlappingThreshold` / `setFlappingWindowMs` so the panel's
   * "Last re-arm" timestamp updates immediately.
   */
  async reArmFlapping(updatedBy?: string): Promise<number> {
    this.wasFlapping = false;
    const ts = Date.now();
    await writeLastReArmedAt(ts, updatedBy);
    return ts;
  }

  /**
   * Task #804 — DB-backed flapping window. Same shape as
   * `setFlappingThreshold`; bounded between 1 minute and 90 days.
   */
  async setFlappingWindowMs(
    value: number,
    updatedBy?: string,
  ): Promise<number> {
    if (
      !Number.isFinite(value) ||
      value < FLAPPING_WINDOW_MS_MIN ||
      value > FLAPPING_WINDOW_MS_MAX
    ) {
      throw new Error("invalid_flapping_window_ms");
    }
    const v = Math.floor(value);
    await db
      .insert(systemSettings)
      .values({ key: FLAPPING_WINDOW_MS_KEY, value: String(v), updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(v), updatedBy, updatedAt: new Date() },
      });
    this.wasFlapping = false;
    // Task #831 — saving the window also re-arms the latch.
    await writeLastReArmedAt(Date.now(), updatedBy);
    return v;
  }

  /**
   * One-shot alert when the cover sweep starts flapping (≥
   * FLAPPING_THRESHOLD auto-clears inside FLAPPING_WINDOW_MS). Mirrors
   * `fireAlert` but uses a distinct alert type and email subject so it
   * does not get conflated with the "above threshold" alert.
   */
  private async fireFlappingAlert(
    flappingCount: number,
    flappingThreshold: number,
    flappingWindowMs: number,
  ) {
    const windowHours = Math.round(flappingWindowMs / (60 * 60 * 1000));
    const message = `Cover sweep is flapping: ${flappingCount} auto-clears in the last ${windowHours}h (threshold ${flappingThreshold}). Something is repeatedly leaving cover files behind.`;
    try {
      await panicButtonService.createAlert({
        type: FLAPPING_ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          flappingCount,
          flappingThreshold,
          flappingWindowMs,
          source: "cover-orphan-alert-service",
          link: "/admin/production-house#cover-sweep",
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error("[CoverOrphanAlert] failed to create flapping alert:", err);
    }

    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)));
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title: "Cover sweep is flapping",
          severity: "medium",
          message,
        });
      }
    } catch (err) {
      console.error("[CoverOrphanAlert] failed to email admins about flapping:", err);
    }
  }

  private async fireAlert(count: number, threshold: number) {
    const message = `Orphaned broadcast cover files crossed threshold: ${count} files with no matching broadcast (threshold ${threshold}).`;
    try {
      await panicButtonService.createAlert({
        type: ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          orphanCount: count,
          threshold,
          source: "cover-orphan-alert-service",
          link: "/admin/production-house#cover-sweep",
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error("[CoverOrphanAlert] failed to create alert:", err);
    }

    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)));
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title: "Broadcast cover orphans need attention",
          severity: "medium",
          message,
        });
      }
    } catch (err) {
      console.error("[CoverOrphanAlert] failed to email admins:", err);
    }
  }
}

export const coverOrphanAlertService = new CoverOrphanAlertService();
