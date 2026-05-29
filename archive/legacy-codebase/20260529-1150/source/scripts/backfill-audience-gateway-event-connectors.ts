/**
 * Backfill connector attribution on older gateway event rows (Task #583).
 *
 * Task #532 added `connector_id` to `audience_gateway_events`, but rows
 * persisted before that change were left with `connector_id = NULL`. This
 * one-shot script walks every NULL-connector row that still has a
 * `command_id`, looks up the matching `audience_moderation_commands` row,
 * and writes the connector back so that the admin "Connector" filter on
 * the gateway-activity view stops silently hiding historical rows.
 *
 * Rows that genuinely cannot be attributed (no `command_id`, or the
 * referenced command no longer exists) are reported in the summary so the
 * founder can see how many pre-#532 rows will remain unattributed.
 *
 * Usage:
 *   tsx scripts/backfill-audience-gateway-event-connectors.ts            # write
 *   tsx scripts/backfill-audience-gateway-event-connectors.ts --dry-run  # report only
 */

import { sql } from "drizzle-orm";

import { db, pool } from "../server/db";

interface BackfillSummary {
  totalNull: number;
  matched: number;
  updated: number;
  unmatchedNoCommandId: number;
  unmatchedCommandMissing: number;
  remainingNull: number;
  dryRun: boolean;
}

export async function backfillGatewayEventConnectors(
  opts: { dryRun?: boolean } = {},
): Promise<BackfillSummary> {
  const dryRun = !!opts.dryRun;

  const totalNullRow: any = await db.execute(sql`
    SELECT count(*)::int AS c
      FROM audience_gateway_events
     WHERE connector_id IS NULL
  `);
  const totalNull = Number(totalNullRow?.rows?.[0]?.c ?? 0);

  const noCommandRow: any = await db.execute(sql`
    SELECT count(*)::int AS c
      FROM audience_gateway_events
     WHERE connector_id IS NULL
       AND command_id IS NULL
  `);
  const unmatchedNoCommandId = Number(noCommandRow?.rows?.[0]?.c ?? 0);

  const matchableRow: any = await db.execute(sql`
    SELECT count(*)::int AS c
      FROM audience_gateway_events e
      JOIN audience_moderation_commands c ON c.command_id = e.command_id
     WHERE e.connector_id IS NULL
       AND e.command_id IS NOT NULL
  `);
  const matched = Number(matchableRow?.rows?.[0]?.c ?? 0);

  const commandMissingRow: any = await db.execute(sql`
    SELECT count(*)::int AS c
      FROM audience_gateway_events e
     WHERE e.connector_id IS NULL
       AND e.command_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM audience_moderation_commands c
          WHERE c.command_id = e.command_id
       )
  `);
  const unmatchedCommandMissing = Number(commandMissingRow?.rows?.[0]?.c ?? 0);

  let updated = 0;
  if (!dryRun && matched > 0) {
    const res: any = await db.execute(sql`
      UPDATE audience_gateway_events AS e
         SET connector_id = c.connector_id
        FROM audience_moderation_commands AS c
       WHERE e.connector_id IS NULL
         AND e.command_id IS NOT NULL
         AND c.command_id = e.command_id
    `);
    updated = Number(res?.rowCount ?? res?.rows?.length ?? 0);
  }

  const remainingRow: any = await db.execute(sql`
    SELECT count(*)::int AS c
      FROM audience_gateway_events
     WHERE connector_id IS NULL
  `);
  const remainingNull = Number(remainingRow?.rows?.[0]?.c ?? 0);

  return {
    totalNull,
    matched,
    updated,
    unmatchedNoCommandId,
    unmatchedCommandMissing,
    remainingNull,
    dryRun,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    `[backfill-gateway-connectors] starting${dryRun ? " (dry-run)" : ""}...`,
  );
  const summary = await backfillGatewayEventConnectors({ dryRun });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.remainingNull > 0) {
    console.log(
      `[backfill-gateway-connectors] ${summary.remainingNull} row(s) remain unattributed ` +
        `(${summary.unmatchedNoCommandId} have no command_id, ${summary.unmatchedCommandMissing} reference a missing command).`,
    );
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  /backfill-audience-gateway-event-connectors\.ts$/.test(process.argv[1]);

if (isDirectRun) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end().catch(() => {});
    });
}
