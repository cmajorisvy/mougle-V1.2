/**
 * Audience orphaned-attribution summary (Task #634).
 *
 * Task #583 added a one-shot backfill + a "(N rows have no connector)" hint
 * to the gateway-activity admin view, but only for one (table, column)
 * pair: `audience_gateway_events.connector_id`. Several other audience-*
 * tables added similar attribution columns later in the project's life,
 * and rows persisted before those columns existed still have NULL values.
 * Admins had no visibility into how many such rows remained per table, so
 * they could not request (or even ask for) future backfills.
 *
 * This service exposes a single, read-only summary that scans every known
 * audience-* attribution column for NULL row counts and returns one entry
 * per (table, column) so the admin dashboard can render a table with a
 * "request backfill" or "explain" link next to each row. The list of
 * scanned columns is intentionally hand-curated (instead of reflected from
 * `information_schema`) so we only surface columns where a NULL is
 * meaningful attribution loss — not e.g. an always-nullable `error_message`
 * or a timestamp.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

export type OrphanedAttributionBackfillStatus =
  | "backfillable"
  | "no_backfill_path"
  | "manual_only";

export interface OrphanedAttributionTarget {
  /** Stable identifier used as a React key and as test data-testid. */
  key: string;
  /** Postgres table name. */
  table: string;
  /** Postgres column name. */
  column: string;
  /** Human-readable label shown in the admin UI. */
  label: string;
  /** One-sentence explanation of why the column may be NULL on old rows. */
  description: string;
  backfillStatus: OrphanedAttributionBackfillStatus;
  /** Optional `tsx scripts/...` command an operator can run. */
  backfillCommand?: string;
  /** Relative URL of the docs page that explains the situation. */
  docHref: string;
}

export interface OrphanedAttributionRow extends OrphanedAttributionTarget {
  /** Count of rows where the column is NULL. -1 indicates the count failed. */
  nullCount: number;
  /** Count of rows in the table. -1 indicates the count failed. */
  totalCount: number;
  /** Set when the count query failed; nullCount/totalCount will be -1. */
  error: string | null;
}

export interface OrphanedAttributionSummary {
  generatedAt: string;
  docHref: string;
  totalOrphanRows: number;
  rows: OrphanedAttributionRow[];
}

const DOC_HREF = "/docs/audience-orphaned-attribution";

export const AUDIENCE_ORPHANED_ATTRIBUTION_TARGETS: OrphanedAttributionTarget[] = [
  {
    key: "audience_gateway_events.connector_id",
    table: "audience_gateway_events",
    column: "connector_id",
    label: "Gateway events missing connector",
    description:
      "Rows persisted before Task #532 added connector attribution. Backfillable for rows that still have a command_id.",
    backfillStatus: "backfillable",
    backfillCommand: "tsx scripts/backfill-audience-gateway-event-connectors.ts",
    docHref: DOC_HREF,
  },
  {
    key: "audience_gateway_events.command_id",
    table: "audience_gateway_events",
    column: "command_id",
    label: "Gateway events missing command",
    description:
      "Pre-attribution blocked sends emitted before a command was built. No backfill path — the command never existed.",
    backfillStatus: "no_backfill_path",
    docHref: DOC_HREF,
  },
  {
    key: "audience_gateway_events.platform",
    table: "audience_gateway_events",
    column: "platform",
    label: "Gateway events missing platform",
    description:
      "Pre-attribution rows where the platform tag was never recorded. Manual reconciliation only.",
    backfillStatus: "manual_only",
    docHref: DOC_HREF,
  },
  {
    key: "audience_legacy_token_dispatch_alerts.connector_id",
    table: "audience_legacy_token_dispatch_alerts",
    column: "connector_id",
    label: "Legacy-token alerts missing connector",
    description:
      "Older legacy-token dispatch alerts (Task #549) that fired before the connector field was added.",
    backfillStatus: "manual_only",
    docHref: DOC_HREF,
  },
  {
    key: "audience_legacy_token_dispatch_alerts.platform",
    table: "audience_legacy_token_dispatch_alerts",
    column: "platform",
    label: "Legacy-token alerts missing platform",
    description:
      "Older legacy-token dispatch alerts (Task #549) that fired before the platform field was added.",
    backfillStatus: "manual_only",
    docHref: DOC_HREF,
  },
  {
    key: "audience_legacy_token_dispatch_alerts.command_id",
    table: "audience_legacy_token_dispatch_alerts",
    column: "command_id",
    label: "Legacy-token alerts missing command",
    description:
      "Pre-attribution legacy-token alerts where the originating command id was never captured.",
    backfillStatus: "no_backfill_path",
    docHref: DOC_HREF,
  },
  {
    key: "audience_connector_rotation_notifications.rotated_by",
    table: "audience_connector_rotation_notifications",
    column: "rotated_by",
    label: "Connector rotations missing actor",
    description:
      "Connector secret rotations recorded before the rotated_by actor field was added. Manual reconciliation only.",
    backfillStatus: "manual_only",
    docHref: DOC_HREF,
  },
];

async function countNullAndTotal(
  table: string,
  column: string,
): Promise<{ nullCount: number; totalCount: number; error: string | null }> {
  try {
    const tableIdent = sql.identifier(table);
    const columnIdent = sql.identifier(column);
    const res: any = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE ${columnIdent} IS NULL)::int AS null_count,
        count(*)::int AS total_count
      FROM ${tableIdent}
    `);
    const row = res?.rows?.[0] ?? {};
    return {
      nullCount: Number(row.null_count ?? 0),
      totalCount: Number(row.total_count ?? 0),
      error: null,
    };
  } catch (err: any) {
    return {
      nullCount: -1,
      totalCount: -1,
      error: String(err?.message ?? err ?? "count_failed"),
    };
  }
}

export async function getAudienceOrphanedAttributionSummary(): Promise<OrphanedAttributionSummary> {
  // Serialize the per-(table, column) counts so we don't fan out one
  // connection per target — the pool is shared with the rest of the
  // admin dashboard and a 7-row summary should not be a hotspot.
  const rows: OrphanedAttributionRow[] = [];
  for (const t of AUDIENCE_ORPHANED_ATTRIBUTION_TARGETS) {
    const { nullCount, totalCount, error } = await countNullAndTotal(t.table, t.column);
    rows.push({ ...t, nullCount, totalCount, error });
  }
  const totalOrphanRows = rows.reduce(
    (acc, r) => acc + (r.nullCount > 0 ? r.nullCount : 0),
    0,
  );
  return {
    generatedAt: new Date().toISOString(),
    docHref: DOC_HREF,
    totalOrphanRows,
    rows,
  };
}
