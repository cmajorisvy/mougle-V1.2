/**
 * Task #897 — Scheduled R7B-E2E test-seed cleanup.
 *
 * Task #896 added the manual `scripts/cleanup-r7b-e2e-seeds.ts` script
 * that archives + permanently deletes approved-internal asset/rig rows
 * left behind by the R7B-E2E-Real Playwright spec. This scheduler
 * wraps that script and runs it on a daily cadence so the admin
 * library stays tidy without operator action.
 *
 * On each tick:
 *  - Invokes `runCleanup({ hours, prefix })` from the script.
 *  - Writes a `cleanup.r7b_e2e.summary` row to the production-house
 *    audit log so admins can see what was scanned / archived / deleted
 *    in the Scheduled Cleanup History panel.
 *  - If any row erroreds out — i.e. the JSON summary has a non-empty
 *    `errors[]` — a `platform_alerts` row is created via
 *    `panicButtonService.createAlert` so the failure shows up on the
 *    founder dashboard. Per-kind dedup keeps a flapping cleanup from
 *    spamming alerts.
 *
 * Configuration (env vars):
 *  - CLEANUP_R7B_E2E_ENABLED          "true" to enable (default: true).
 *  - CLEANUP_R7B_E2E_INTERVAL_HOURS   Tick cadence (default: 24, min 1).
 *  - CLEANUP_R7B_E2E_INITIAL_DELAY_MS Delay before first run after boot
 *                                     (default: 10 minutes).
 *  - CLEANUP_R7B_E2E_HOURS            Cutoff window in hours passed to
 *                                     runCleanup (default: 24).
 *  - CLEANUP_R7B_E2E_PREFIX           Name prefix filter (default:
 *                                     `r7b-e2e`).
 *  - CLEANUP_R7B_E2E_FAILURE_DEDUP_MS Cooldown between failure alerts
 *                                     (default: 1 hour).
 *
 * The scheduler is best-effort: any unexpected error is logged + a
 * panic-alert is fired, but the process is never crashed and the
 * interval keeps running on the next tick.
 */

import { runCleanup } from "../../scripts/cleanup-r7b-e2e-seeds";
import { recordAudit } from "./production-house-service";
import { panicButtonService } from "./panic-button-service";

const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_INITIAL_DELAY_MS = 10 * 60 * 1000;
const DEFAULT_HOURS = 24;
const DEFAULT_PREFIX = "r7b-e2e";
const DEFAULT_FAILURE_DEDUP_MS = 60 * 60 * 1000;
const ALERT_TYPE = "cleanup_r7b_e2e_failure";

function isEnabled(): boolean {
  const raw = process.env.CLEANUP_R7B_E2E_ENABLED;
  if (raw === undefined || raw === "") return true;
  return raw.toLowerCase() === "true" || raw === "1";
}

function intervalMs(): number {
  const raw = Number(process.env.CLEANUP_R7B_E2E_INTERVAL_HOURS);
  const hours = Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_INTERVAL_HOURS;
  return Math.round(hours * 60 * 60 * 1000);
}

function initialDelayMs(): number {
  const raw = Number(process.env.CLEANUP_R7B_E2E_INITIAL_DELAY_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_INITIAL_DELAY_MS;
}

function cutoffHours(): number {
  const raw = Number(process.env.CLEANUP_R7B_E2E_HOURS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_HOURS;
}

function prefix(): string {
  const raw = (process.env.CLEANUP_R7B_E2E_PREFIX || "").trim();
  return raw || DEFAULT_PREFIX;
}

function failureDedupMs(): number {
  const raw = Number(process.env.CLEANUP_R7B_E2E_FAILURE_DEDUP_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_FAILURE_DEDUP_MS;
}

export interface CleanupSchedulerLastRun {
  startedAt: number;
  finishedAt: number;
  ok: boolean;
  summary: Awaited<ReturnType<typeof runCleanup>> | null;
  error?: string;
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let initialTimerHandle: ReturnType<typeof setTimeout> | null = null;
let running = false;
let lastRun: CleanupSchedulerLastRun | null = null;
let lastFailureAlertAt = 0;

export function getCleanupR7bE2eLastRun(): CleanupSchedulerLastRun | null {
  return lastRun;
}

async function fireFailureAlert(
  severity: "warning" | "critical",
  message: string,
  details: Record<string, unknown>,
): Promise<void> {
  const now = Date.now();
  if (now - lastFailureAlertAt < failureDedupMs()) {
    console.log(
      `[cleanup-r7b-e2e] failure alert suppressed by dedup (last=${new Date(lastFailureAlertAt).toISOString()})`,
    );
    return;
  }
  lastFailureAlertAt = now;
  try {
    await panicButtonService.createAlert({
      type: ALERT_TYPE,
      severity,
      message,
      details,
      autoTriggered: true,
    });
  } catch (err) {
    console.error(
      "[cleanup-r7b-e2e] failed to create panic alert:",
      (err as Error)?.message ?? err,
    );
  }
}

export async function runScheduledCleanup(): Promise<void> {
  if (running) {
    console.log("[cleanup-r7b-e2e] previous run still in progress; skipping tick");
    return;
  }
  running = true;
  const startedAt = Date.now();
  const args = { hours: cutoffHours(), prefix: prefix() };
  console.log(
    `[cleanup-r7b-e2e] tick start hours=${args.hours} prefix="${args.prefix}"`,
  );
  try {
    const summary = await runCleanup(args);
    const a = summary.assets;
    const r = summary.rigs;
    const detail =
      `cutoff=${summary.cutoff} ` +
      `assets[scanned=${a.scanned} archived=${a.archived} deleted=${a.deleted} ` +
      `skippedReferenced=${a.skippedReferenced} errors=${a.errors.length}] ` +
      `rigs[scanned=${r.scanned} archived=${r.archived} deleted=${r.deleted} ` +
      `skippedReferenced=${r.skippedReferenced} errors=${r.errors.length}]`;
    console.log(`[cleanup-r7b-e2e] ${detail}`);
    try {
      recordAudit("scheduler", "cleanup.r7b_e2e.summary", detail);
    } catch (auditErr) {
      console.error(
        "[cleanup-r7b-e2e] failed to record audit row:",
        (auditErr as Error)?.message ?? auditErr,
      );
    }
    const totalErrors = a.errors.length + r.errors.length;
    if (totalErrors > 0) {
      await fireFailureAlert(
        "warning",
        `Scheduled R7B-E2E seed cleanup reported ${totalErrors} row error(s)`,
        {
          cutoff: summary.cutoff,
          assetErrors: a.errors,
          rigErrors: r.errors,
        },
      );
    }
    lastRun = {
      startedAt,
      finishedAt: Date.now(),
      ok: totalErrors === 0,
      summary,
      error: totalErrors > 0 ? `${totalErrors} row error(s)` : undefined,
    };
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(`[cleanup-r7b-e2e] unexpected error: ${msg}`);
    try {
      recordAudit("scheduler", "cleanup.r7b_e2e.error", msg);
    } catch {
      /* best-effort */
    }
    await fireFailureAlert(
      "critical",
      "Scheduled R7B-E2E seed cleanup crashed",
      { error: msg },
    );
    lastRun = {
      startedAt,
      finishedAt: Date.now(),
      ok: false,
      summary: null,
      error: msg,
    };
  } finally {
    running = false;
    console.log(
      `[cleanup-r7b-e2e] tick complete in ${Date.now() - startedAt}ms`,
    );
  }
}

export function startCleanupR7bE2eScheduler(): void {
  if (!isEnabled()) {
    console.log(
      "[cleanup-r7b-e2e] disabled via CLEANUP_R7B_E2E_ENABLED",
    );
    return;
  }
  if (intervalHandle || initialTimerHandle) return;
  const every = intervalMs();
  const delay = initialDelayMs();
  console.log(
    `[cleanup-r7b-e2e] scheduled every ${Math.round(every / 1000 / 60)}m, ` +
      `cutoffHours=${cutoffHours()} prefix="${prefix()}" ` +
      `first run in ${Math.round(delay / 1000)}s`,
  );
  initialTimerHandle = setTimeout(() => {
    initialTimerHandle = null;
    void runScheduledCleanup();
    intervalHandle = setInterval(() => {
      void runScheduledCleanup();
    }, every);
  }, delay);
}

export function stopCleanupR7bE2eScheduler(): void {
  if (initialTimerHandle) {
    clearTimeout(initialTimerHandle);
    initialTimerHandle = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
