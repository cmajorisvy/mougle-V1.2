/**
 * Manual audience-moderation retention sweep (Task #383).
 *
 * Deletes rows older than the configured retention window from the
 * three audience audit tables. Connectors are never touched.
 *
 * Usage:
 *   tsx scripts/run-audience-retention-sweep.ts            # use configured window
 *   tsx scripts/run-audience-retention-sweep.ts --days=30  # override window
 */

import { pool } from "../server/db";
import { runRetentionSweep } from "../server/services/audience-retention-service";

function parseDays(): number | undefined {
  const arg = process.argv.find((a) => a.startsWith("--days="));
  if (!arg) return undefined;
  const n = Number(arg.split("=")[1]);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`invalid --days argument: ${arg}`);
  }
  return Math.floor(n);
}

async function main() {
  const days = parseDays();
  console.log(
    `[audience-retention-cli] starting sweep${days ? ` with override=${days}d` : ""}...`,
  );
  const result = await runRetentionSweep(days, "cli");
  console.log(JSON.stringify(result, null, 2));
  if (result.error) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
