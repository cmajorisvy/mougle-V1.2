/**
 * Run-once-after-deploy wrapper around the Task #583 gateway-event
 * connector backfill (Task #635).
 *
 * The backfill script (`scripts/backfill-audience-gateway-event-connectors.ts`)
 * attributes a `connector_id` to pre-#532 rows in
 * `audience_gateway_events` that still have it NULL. Founders kept
 * forgetting to run it after a deploy, so this service:
 *
 *   - persists a `system_settings` marker row capturing { ranAt, version,
 *     trigger, summary, error } so re-running is a no-op,
 *   - exposes `runGatewayEventConnectorBackfillOnceOnBoot()` which the
 *     server invokes once on HTTP boot (best-effort, never crashes the
 *     server), and
 *   - exposes `runGatewayEventConnectorBackfill("manual")` for the
 *     admin "Run again" button so ops can re-attribute new NULL rows
 *     that may have appeared since the last run.
 *
 * The marker row is keyed under `audience_gateway_event_connector_backfill`
 * and is the only source of truth: the dashboard tile reads from it,
 * the boot-time check reads from it, and a successful run writes to it.
 * If a deploy run errors, the marker stores the error and the next
 * deploy will retry (we never consider an errored run "done").
 */

import { eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { systemSettings, audienceGatewayEvents } from "@shared/schema";
import { backfillGatewayEventConnectors } from "../../scripts/backfill-audience-gateway-event-connectors";

export const GATEWAY_EVENT_CONNECTOR_BACKFILL_SETTING_KEY =
  "audience_gateway_event_connector_backfill";

/**
 * Bump when the backfill semantics change in a way that requires every
 * deploy to re-run regardless of the prior marker. A bumped version
 * makes the next boot treat the previous run as stale.
 */
export const GATEWAY_EVENT_CONNECTOR_BACKFILL_VERSION = 1;

export interface GatewayEventConnectorBackfillSummary {
  totalNull: number;
  matched: number;
  updated: number;
  unmatchedNoCommandId: number;
  unmatchedCommandMissing: number;
  remainingNull: number;
}

export type GatewayEventConnectorBackfillTrigger = "deploy" | "manual";

export interface GatewayEventConnectorBackfillStatus {
  ranAt: string | null;
  version: number;
  trigger: GatewayEventConnectorBackfillTrigger | null;
  summary: GatewayEventConnectorBackfillSummary | null;
  error: string | null;
  /**
   * Task #682 — how many consecutive runs have errored. Persisted on
   * the marker so the count survives deploys (the in-memory boot path
   * would otherwise reset every restart). Cleared to 0 on success.
   */
  consecutiveFailures: number;
  /**
   * Task #681 — the user id (or "root_admin") who triggered the run
   * from the admin UI; null for system/boot-time deploy runs.
   */
  triggeredBy: string | null;
}

const EMPTY_STATUS: GatewayEventConnectorBackfillStatus = {
  ranAt: null,
  version: GATEWAY_EVENT_CONNECTOR_BACKFILL_VERSION,
  trigger: null,
  summary: null,
  error: null,
  consecutiveFailures: 0,
  triggeredBy: null,
};

export interface GatewayEventConnectorBackfillDryRunResult {
  summary: GatewayEventConnectorBackfillSummary;
  triggeredBy: string | null;
  ranAt: string;
}

type BackfillRunner = (opts: { dryRun?: boolean }) => Promise<{
  totalNull: number;
  matched: number;
  updated: number;
  unmatchedNoCommandId: number;
  unmatchedCommandMissing: number;
  remainingNull: number;
  dryRun: boolean;
}>;

let runnerOverride: BackfillRunner | null = null;
export function setGatewayEventConnectorBackfillRunnerForTests(
  fn: BackfillRunner | null,
): void {
  runnerOverride = fn;
}

export async function getGatewayEventConnectorBackfillStatus(): Promise<GatewayEventConnectorBackfillStatus> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, GATEWAY_EVENT_CONNECTOR_BACKFILL_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) return { ...EMPTY_STATUS };
    let parsed: any = null;
    try {
      parsed = JSON.parse(rows[0].value);
    } catch {
      return { ...EMPTY_STATUS };
    }
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_STATUS };
    const trigger =
      parsed.trigger === "manual"
        ? "manual"
        : parsed.trigger === "deploy"
          ? "deploy"
          : null;
    const summary =
      parsed.summary && typeof parsed.summary === "object"
        ? {
            totalNull: Number(parsed.summary.totalNull) || 0,
            matched: Number(parsed.summary.matched) || 0,
            updated: Number(parsed.summary.updated) || 0,
            unmatchedNoCommandId: Number(parsed.summary.unmatchedNoCommandId) || 0,
            unmatchedCommandMissing:
              Number(parsed.summary.unmatchedCommandMissing) || 0,
            remainingNull: Number(parsed.summary.remainingNull) || 0,
          }
        : null;
    return {
      ranAt: typeof parsed.ranAt === "string" ? parsed.ranAt : null,
      version: Number(parsed.version) || 0,
      trigger,
      summary,
      error: typeof parsed.error === "string" ? parsed.error : null,
      consecutiveFailures:
        Number.isFinite(Number(parsed.consecutiveFailures)) &&
        Number(parsed.consecutiveFailures) >= 0
          ? Math.floor(Number(parsed.consecutiveFailures))
          : 0,
      triggeredBy:
        typeof parsed.triggeredBy === "string" ? parsed.triggeredBy : null,
    };
  } catch {
    return { ...EMPTY_STATUS };
  }
}

async function writeStatus(status: GatewayEventConnectorBackfillStatus): Promise<void> {
  const value = JSON.stringify(status);
  await db
    .insert(systemSettings)
    .values({
      key: GATEWAY_EVENT_CONNECTOR_BACKFILL_SETTING_KEY,
      value,
      updatedBy: "system",
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedBy: "system", updatedAt: new Date() },
    });
}

export async function runGatewayEventConnectorBackfill(
  trigger: GatewayEventConnectorBackfillTrigger,
  triggeredBy: string | null = null,
): Promise<GatewayEventConnectorBackfillStatus> {
  const runner = runnerOverride ?? backfillGatewayEventConnectors;
  const prior = await getGatewayEventConnectorBackfillStatus();
  const priorConsecutiveFailures = prior.consecutiveFailures ?? 0;
  try {
    const res = await runner({ dryRun: false });
    const status: GatewayEventConnectorBackfillStatus = {
      ranAt: new Date().toISOString(),
      version: GATEWAY_EVENT_CONNECTOR_BACKFILL_VERSION,
      trigger,
      summary: {
        totalNull: res.totalNull,
        matched: res.matched,
        updated: res.updated,
        unmatchedNoCommandId: res.unmatchedNoCommandId,
        unmatchedCommandMissing: res.unmatchedCommandMissing,
        remainingNull: res.remainingNull,
      },
      error: null,
      consecutiveFailures: 0,
      triggeredBy,
    };
    await writeStatus(status);
    console.info(
      `[audit] gateway-event-connector-backfill run trigger=${trigger} triggeredBy=${triggeredBy ?? "system"} updated=${status.summary?.updated ?? 0} remainingNull=${status.summary?.remainingNull ?? 0}`,
    );
    // Task #682 — auto-resolve any open failure alerts now that the
    // backfill is healthy again. Best-effort; never block the run.
    try {
      const { getGatewayEventConnectorBackfillFailureAlertNotifier } =
        await import(
          "./audience-gateway-event-connector-backfill-failure-alert-service"
        );
      await getGatewayEventConnectorBackfillFailureAlertNotifier().notifySuccess(
        { status, trigger },
      );
    } catch (err) {
      console.warn(
        "[gateway-event-connector-backfill] success notifier skipped:",
        (err as Error)?.message ?? err,
      );
    }
    return status;
  } catch (e: any) {
    const status: GatewayEventConnectorBackfillStatus = {
      ranAt: new Date().toISOString(),
      version: GATEWAY_EVENT_CONNECTOR_BACKFILL_VERSION,
      trigger,
      summary: null,
      error: e?.message ?? String(e),
      consecutiveFailures: priorConsecutiveFailures + 1,
      triggeredBy,
    };
    try {
      await writeStatus(status);
    } catch {
      // swallow — surfacing the original error is more useful than a
      // secondary failure to persist the marker.
    }
    console.info(
      `[audit] gateway-event-connector-backfill run trigger=${trigger} triggeredBy=${triggeredBy ?? "system"} error=${status.error ?? ""}`,
    );
    // Task #682 — fire the founder alert (email + platform_alerts row)
    // once we've seen `>= threshold` consecutive failures. The notifier
    // is threshold-aware, so calling it on every failure is safe.
    try {
      const { getGatewayEventConnectorBackfillFailureAlertNotifier } =
        await import(
          "./audience-gateway-event-connector-backfill-failure-alert-service"
        );
      await getGatewayEventConnectorBackfillFailureAlertNotifier().notifyFailure(
        { status, trigger },
      );
    } catch (err) {
      console.warn(
        "[gateway-event-connector-backfill] failure notifier skipped:",
        (err as Error)?.message ?? err,
      );
    }
    return status;
  }
}

/**
 * Read-only preview of what a real backfill would touch. Does NOT
 * persist a marker (the marker is reserved for actual writes), so
 * admins can "Dry run" the button from the dashboard as many times
 * as they like without polluting the audit trail of real runs.
 */
export async function runGatewayEventConnectorBackfillDryRun(
  triggeredBy: string | null = null,
): Promise<GatewayEventConnectorBackfillDryRunResult> {
  const runner = runnerOverride ?? backfillGatewayEventConnectors;
  const res = await runner({ dryRun: true });
  const result: GatewayEventConnectorBackfillDryRunResult = {
    summary: {
      totalNull: res.totalNull,
      matched: res.matched,
      updated: res.updated,
      unmatchedNoCommandId: res.unmatchedNoCommandId,
      unmatchedCommandMissing: res.unmatchedCommandMissing,
      remainingNull: res.remainingNull,
    },
    triggeredBy,
    ranAt: new Date().toISOString(),
  };
  console.info(
    `[audit] gateway-event-connector-backfill dry-run triggeredBy=${triggeredBy ?? "system"} matched=${result.summary.matched} totalNull=${result.summary.totalNull}`,
  );
  return result;
}

/**
 * Idempotent boot-time entry point. Runs the backfill if the marker is
 * missing, the recorded version is older than the current version, or
 * the previous run recorded an error (so a transient failure on the
 * previous deploy can self-heal on the next one). Returns `{ ran,
 * status }` so callers can log meaningfully without rereading.
 */
export async function runGatewayEventConnectorBackfillOnceOnBoot(): Promise<{
  ran: boolean;
  status: GatewayEventConnectorBackfillStatus;
}> {
  const existing = await getGatewayEventConnectorBackfillStatus();
  if (
    existing.ranAt &&
    existing.error === null &&
    existing.version >= GATEWAY_EVENT_CONNECTOR_BACKFILL_VERSION
  ) {
    return { ran: false, status: existing };
  }
  const status = await runGatewayEventConnectorBackfill("deploy");
  return { ran: true, status };
}

/**
 * Task #683 — live count of `audience_gateway_events` rows that still
 * have a NULL `connector_id`, computed via a cheap `COUNT(*) WHERE
 * connector_id IS NULL` on every read. The marker-row `summary.remainingNull`
 * is only updated when the backfill runs; this number reflects "right now"
 * so admins can spot a regression (newly-written NULL rows) without waiting
 * for the next deploy or manual re-run. Best-effort: any DB error returns
 * `null` rather than throwing, so the dashboard tile never breaks.
 */
let currentNullCountFnOverride:
  | (() => Promise<number | null>)
  | null = null;
export function setGatewayEventConnectorBackfillCurrentNullCountFnForTests(
  fn: (() => Promise<number | null>) | null,
): void {
  currentNullCountFnOverride = fn;
}

export async function getGatewayEventConnectorCurrentNullCount(): Promise<number | null> {
  if (currentNullCountFnOverride) return currentNullCountFnOverride();
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(audienceGatewayEvents)
      .where(isNull(audienceGatewayEvents.connectorId));
    const n = Number(rows[0]?.count ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return null;
  }
}

export async function resetGatewayEventConnectorBackfillMarkerForTests(): Promise<void> {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, GATEWAY_EVENT_CONNECTOR_BACKFILL_SETTING_KEY));
}
