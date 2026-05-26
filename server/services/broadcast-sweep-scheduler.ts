/**
 * Broadcast orphan-sweep scheduler.
 *
 * Runs the cover + media sweeps on a daily cadence so orphaned MP4s,
 * manifests, and cover images don't quietly accumulate between admin visits
 * to the Production House panel. Results are written to the production-house
 * audit log so admins can review what was found (and what, if anything, was
 * removed).
 *
 * Configuration (environment variables):
 *  - BROADCAST_SWEEP_ENABLED          "true" to enable (default: true).
 *  - BROADCAST_SWEEP_APPLY            "true" to actually delete orphans;
 *                                     otherwise the run is dry-run only
 *                                     and just reports what it found
 *                                     (default: false). Acts as a fallback
 *                                     when the DB-backed override (the
 *                                     `broadcast_sweep_apply_mode` row in
 *                                     `system_settings`) is unset, so a
 *                                     fresh environment behaves the same as
 *                                     before this toggle existed.
 *  - BROADCAST_SWEEP_INTERVAL_HOURS   How often to run, in hours
 *                                     (default: 24). Minimum 1.
 *  - BROADCAST_SWEEP_INITIAL_DELAY_MS Delay before the first run after
 *                                     boot, in ms (default: 5 minutes).
 *
 * The scheduler is best-effort: any error is logged + audited but never
 * crashes the process, and the interval keeps running on the next tick.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { runCoversSweep, runMediaSweep } from "./broadcast-sweep-service";
import { recordAudit } from "./production-house-service";
import { broadcastSweepFailureAlertService } from "./broadcast-sweep-failure-alert-service";

const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_INITIAL_DELAY_MS = 5 * 60 * 1000;
const APPLY_MODE_KEY = "broadcast_sweep_apply_mode";

function isEnabled(): boolean {
  const raw = process.env.BROADCAST_SWEEP_ENABLED;
  if (raw === undefined || raw === "") return true;
  return raw.toLowerCase() === "true" || raw === "1";
}

function envApplyMode(): boolean {
  const raw = (process.env.BROADCAST_SWEEP_APPLY || "").toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * Read the admin-controlled apply override from `system_settings`. Returns
 * `null` when no override has been set so callers can fall back to the env
 * var. Any DB error is treated as "no override" rather than failing the
 * sweep tick.
 */
async function readApplyOverride(): Promise<boolean | null> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, APPLY_MODE_KEY))
      .limit(1);
    if (rows.length === 0) return null;
    const v = (rows[0].value || "").toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export async function getEffectiveApplyMode(): Promise<{
  apply: boolean;
  override: boolean | null;
  envFallback: boolean;
}> {
  const override = await readApplyOverride();
  const envFallback = envApplyMode();
  return {
    apply: override === null ? envFallback : override,
    override,
    envFallback,
  };
}

export async function setApplyOverride(
  value: boolean | null,
  updatedBy?: string,
): Promise<{ apply: boolean; override: boolean | null; envFallback: boolean }> {
  if (value === null) {
    await db.delete(systemSettings).where(eq(systemSettings.key, APPLY_MODE_KEY));
  } else {
    const stored = value ? "true" : "false";
    await db
      .insert(systemSettings)
      .values({ key: APPLY_MODE_KEY, value: stored, updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: stored, updatedBy, updatedAt: new Date() },
      });
  }
  return getEffectiveApplyMode();
}

function intervalMs(): number {
  const raw = Number(process.env.BROADCAST_SWEEP_INTERVAL_HOURS);
  const hours = Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_INTERVAL_HOURS;
  return Math.round(hours * 60 * 60 * 1000);
}

function initialDelayMs(): number {
  const raw = Number(process.env.BROADCAST_SWEEP_INITIAL_DELAY_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_INITIAL_DELAY_MS;
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let initialTimerHandle: ReturnType<typeof setTimeout> | null = null;
let running = false;

export interface LastRunSummary {
  startedAt: number;
  finishedAt: number;
  applyMode: boolean;
  covers: { ok: boolean; orphanCount: number; removed: number; error?: string } | null;
  media: {
    ok: boolean;
    orphanCount: number;
    removed: number;
    bytesRemoved: number;
    error?: string;
  } | null;
}

let lastRun: LastRunSummary | null = null;

export function getLastRunSummary(): LastRunSummary | null {
  return lastRun;
}

export async function runScheduledSweep(applyArg?: boolean): Promise<void> {
  if (running) {
    console.log("[broadcast-sweep] previous run still in progress; skipping tick");
    return;
  }
  running = true;
  const startedAt = Date.now();
  const apply =
    typeof applyArg === "boolean" ? applyArg : (await getEffectiveApplyMode()).apply;
  let coversSummary: LastRunSummary["covers"] = null;
  let mediaSummary: LastRunSummary["media"] = null;
  try {
    const covers = await runCoversSweep(apply);
    if (!covers.ok) {
      console.warn(`[broadcast-sweep] covers sweep failed: ${covers.error}`);
      const detail = `${covers.error}${covers.message ? `: ${covers.message}` : ""}`;
      recordAudit("scheduler", "broadcasts.sweep.covers.failed", detail);
      coversSummary = {
        ok: false,
        orphanCount: 0,
        removed: 0,
        error: covers.message || covers.error,
      };
      try {
        await broadcastSweepFailureAlertService.notify("covers", detail);
      } catch (alertErr) {
        console.error(
          "[broadcast-sweep] failed to notify on covers failure:",
          alertErr,
        );
      }
    } else {
      const detail = `orphans=${covers.orphanCount} removed=${covers.removed} dryRun=${covers.dryRun}`;
      console.log(`[broadcast-sweep] covers ${detail}`);
      recordAudit("scheduler", "broadcasts.sweep.covers", detail);
      coversSummary = {
        ok: true,
        orphanCount: covers.orphanCount,
        removed: covers.removed,
      };
    }

    const media = await runMediaSweep(apply);
    if (!media.ok) {
      const message = "message" in media ? media.message : undefined;
      console.warn(`[broadcast-sweep] media sweep failed: ${media.error}`);
      const detail = `${media.error}${message ? `: ${message}` : ""}`;
      recordAudit("scheduler", "broadcasts.sweep.media.failed", detail);
      mediaSummary = {
        ok: false,
        orphanCount: 0,
        removed: 0,
        bytesRemoved: 0,
        error: message || media.error,
      };
      try {
        await broadcastSweepFailureAlertService.notify("media", detail);
      } catch (alertErr) {
        console.error(
          "[broadcast-sweep] failed to notify on media failure:",
          alertErr,
        );
      }
    } else {
      const detail =
        `orphans=${media.orphanCount} removed=${media.removed} ` +
        `bytesRemoved=${media.bytesRemoved} dryRun=${media.dryRun}`;
      console.log(`[broadcast-sweep] media ${detail}`);
      recordAudit("scheduler", "broadcasts.sweep.media", detail);
      mediaSummary = {
        ok: true,
        orphanCount: media.orphanCount,
        removed: media.removed,
        bytesRemoved: media.bytesRemoved,
      };
    }
  } catch (err) {
    const msg = (err as Error).message || String(err);
    console.error(`[broadcast-sweep] unexpected error: ${msg}`);
    try {
      recordAudit("scheduler", "broadcasts.sweep.error", msg);
    } catch {
      /* audit best-effort */
    }
    try {
      await broadcastSweepFailureAlertService.notify("error", msg);
    } catch (alertErr) {
      console.error(
        "[broadcast-sweep] failed to notify on unexpected error:",
        alertErr,
      );
    }
  } finally {
    running = false;
    const finishedAt = Date.now();
    lastRun = {
      startedAt,
      finishedAt,
      applyMode: apply,
      covers: coversSummary,
      media: mediaSummary,
    };
    console.log(`[broadcast-sweep] tick complete in ${finishedAt - startedAt}ms`);
  }
}

export function startBroadcastSweepScheduler(): void {
  if (!isEnabled()) {
    console.log("[broadcast-sweep] disabled via BROADCAST_SWEEP_ENABLED");
    return;
  }
  if (intervalHandle || initialTimerHandle) {
    return;
  }
  const every = intervalMs();
  const delay = initialDelayMs();
  console.log(
    `[broadcast-sweep] scheduled every ${Math.round(every / 1000 / 60)}m, ` +
      `envApply=${envApplyMode()}, first run in ${Math.round(delay / 1000)}s`,
  );
  initialTimerHandle = setTimeout(() => {
    initialTimerHandle = null;
    void runScheduledSweep();
    intervalHandle = setInterval(() => {
      void runScheduledSweep();
    }, every);
  }, delay);
}

export function stopBroadcastSweepScheduler(): void {
  if (initialTimerHandle) {
    clearTimeout(initialTimerHandle);
    initialTimerHandle = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
