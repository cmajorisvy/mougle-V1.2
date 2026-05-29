/**
 * Task #896 — Cleanup test-seeded R7B-E2E approved avatars/rigs/assets.
 *
 * Every R7B-E2E-Real run (tests/e2e/permanent-avatars.spec.ts) seeds
 * approved-internal assets + rigs named with the `r7b-e2e` prefix. The
 * spec intentionally leaves them behind (cheap ≤200 B JSON-only GLBs).
 * In a long-running dev DB they accumulate in /admin/3d-assets and
 * /admin/3d-rigs. This script archives + permanently deletes any such
 * approved-internal row whose `name` starts with `r7b-e2e` and was
 * created more than 24 h ago.
 *
 * Mirrors the route-level flow:
 *   1. Archive (storage.archiveAsset / archiveRig) — only if not bound
 *      by a permanent avatar (`asset_referenced_by_permanent_avatar` /
 *      `rig_referenced_by_permanent_avatar` → skip and report).
 *   2. Delete object-storage bytes FIRST (deleteAssetBytes /
 *      deleteRigBytes). If that fails the DB row stays archived for a
 *      future retry.
 *   3. storage.deleteArchivedAsset / deleteArchivedRig to cascade DB
 *      rows + write the moderation-log trail.
 *
 * Usage:
 *   tsx scripts/cleanup-r7b-e2e-seeds.ts                 # default: 24h cutoff
 *   tsx scripts/cleanup-r7b-e2e-seeds.ts --hours=48      # override cutoff
 *   tsx scripts/cleanup-r7b-e2e-seeds.ts --dry-run       # report only
 *   tsx scripts/cleanup-r7b-e2e-seeds.ts --prefix=foo    # override prefix
 */

import { and, eq, lt, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { productionAssets, productionRigs } from "@shared/schema";
import { storage } from "../server/storage";
import { deleteAssetBytes } from "../server/services/production-asset-storage";
import { deleteRigBytes } from "../server/services/production-rig-storage";

const DEFAULT_PREFIX = "r7b-e2e";
const DEFAULT_HOURS = 24;
const ACTOR_USER_ID = "system-cleanup-r7b-e2e";
const REASON = "Task #896 automated cleanup of test-seeded r7b-e2e rows";

type Args = { hours: number; prefix: string; dryRun: boolean };

function parseArgs(): Args {
  let hours = DEFAULT_HOURS;
  let prefix = DEFAULT_PREFIX;
  let dryRun = false;
  for (const a of process.argv.slice(2)) {
    if (a === "--dry-run") {
      dryRun = true;
    } else if (a.startsWith("--hours=")) {
      const n = Number(a.slice("--hours=".length));
      if (!Number.isFinite(n) || n < 0) throw new Error(`invalid --hours: ${a}`);
      hours = n;
    } else if (a.startsWith("--prefix=")) {
      const v = a.slice("--prefix=".length).trim();
      if (!v) throw new Error(`invalid --prefix: ${a}`);
      prefix = v;
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return { hours, prefix, dryRun };
}

type Summary = {
  scanned: number;
  archivedSkipped: number;
  archived: number;
  deleted: number;
  skippedReferenced: number;
  errors: Array<{ id: string; kind: "asset" | "rig"; error: string }>;
};

async function cleanupAssets(args: Args, cutoff: Date): Promise<Summary> {
  const summary: Summary = {
    scanned: 0,
    archivedSkipped: 0,
    archived: 0,
    deleted: 0,
    skippedReferenced: 0,
    errors: [],
  };

  const rows = await db
    .select()
    .from(productionAssets)
    .where(
      and(
        eq(productionAssets.approvalGate, "approved_internal"),
        lt(productionAssets.createdAt, cutoff),
        sql`${productionAssets.name} LIKE ${`${args.prefix}%`}`,
      ),
    );

  summary.scanned = rows.length;

  for (const row of rows) {
    try {
      if (row.status !== "archived") {
        const refs = await storage.countPermanentAvatarsReferencingAsset(row.id);
        if (refs > 0) {
          summary.skippedReferenced++;
          console.log(
            `[asset ${row.id}] SKIP — referenced by ${refs} permanent avatar(s) (name="${row.name}")`,
          );
          continue;
        }
        if (args.dryRun) {
          console.log(
            `[asset ${row.id}] DRY-RUN would archive + delete (name="${row.name}", createdAt=${row.createdAt.toISOString()})`,
          );
          continue;
        }
        await storage.archiveAsset(row.id, {
          actorUserId: ACTOR_USER_ID,
          reason: REASON,
        });
        summary.archived++;
      } else {
        summary.archivedSkipped++;
        if (args.dryRun) {
          console.log(
            `[asset ${row.id}] DRY-RUN already archived — would permanent-delete (name="${row.name}")`,
          );
          continue;
        }
      }

      // Delete object bytes first, then DB row + cascade.
      await deleteAssetBytes(row.storageKey).catch((e) => {
        throw new Error(`object_delete_failed: ${e?.message ?? String(e)}`);
      });
      await storage.deleteArchivedAsset(row.id, {
        actorUserId: ACTOR_USER_ID,
        reason: REASON,
      });
      summary.deleted++;
      console.log(`[asset ${row.id}] DELETED (name="${row.name}")`);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      summary.errors.push({ id: row.id, kind: "asset", error: msg });
      console.error(`[asset ${row.id}] ERROR ${msg}`);
    }
  }

  return summary;
}

async function cleanupRigs(args: Args, cutoff: Date): Promise<Summary> {
  const summary: Summary = {
    scanned: 0,
    archivedSkipped: 0,
    archived: 0,
    deleted: 0,
    skippedReferenced: 0,
    errors: [],
  };

  const rows = await db
    .select()
    .from(productionRigs)
    .where(
      and(
        eq(productionRigs.approvalGate, "approved_internal"),
        lt(productionRigs.createdAt, cutoff),
        sql`${productionRigs.name} LIKE ${`${args.prefix}%`}`,
      ),
    );

  summary.scanned = rows.length;

  for (const row of rows) {
    try {
      if (row.status !== "archived") {
        const refs = await storage.countPermanentAvatarsReferencingRig(row.id);
        if (refs > 0) {
          summary.skippedReferenced++;
          console.log(
            `[rig ${row.id}] SKIP — referenced by ${refs} permanent avatar(s) (name="${row.name}")`,
          );
          continue;
        }
        if (args.dryRun) {
          console.log(
            `[rig ${row.id}] DRY-RUN would archive + delete (name="${row.name}", createdAt=${row.createdAt.toISOString()})`,
          );
          continue;
        }
        await storage.archiveRig(row.id, {
          actorUserId: ACTOR_USER_ID,
          reason: REASON,
        });
        summary.archived++;
      } else {
        summary.archivedSkipped++;
        if (args.dryRun) {
          console.log(
            `[rig ${row.id}] DRY-RUN already archived — would permanent-delete (name="${row.name}")`,
          );
          continue;
        }
      }

      await deleteRigBytes(row.storageKey).catch((e) => {
        throw new Error(`object_delete_failed: ${e?.message ?? String(e)}`);
      });
      await storage.deleteArchivedRig(row.id, {
        actorUserId: ACTOR_USER_ID,
        reason: REASON,
      });
      summary.deleted++;
      console.log(`[rig ${row.id}] DELETED (name="${row.name}")`);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      summary.errors.push({ id: row.id, kind: "rig", error: msg });
      console.error(`[rig ${row.id}] ERROR ${msg}`);
    }
  }

  return summary;
}

function resolveArgs(overrides?: Partial<Args>): Args {
  return {
    hours: overrides?.hours ?? DEFAULT_HOURS,
    prefix: overrides?.prefix ?? DEFAULT_PREFIX,
    dryRun: overrides?.dryRun ?? false,
  };
}

export async function runCleanup(
  overrides?: Partial<Args>,
): Promise<{ assets: Summary; rigs: Summary; cutoff: string }> {
  const args = resolveArgs(overrides);
  const cutoff = new Date(Date.now() - args.hours * 60 * 60 * 1000);
  const assets = await cleanupAssets(args, cutoff);
  const rigs = await cleanupRigs(args, cutoff);
  return { assets, rigs, cutoff: cutoff.toISOString() };
}

export async function runAssetCleanup(
  overrides?: Partial<Args>,
): Promise<{ summary: Summary; cutoff: string; prefix: string; hours: number }> {
  const args = resolveArgs(overrides);
  const cutoff = new Date(Date.now() - args.hours * 60 * 60 * 1000);
  const summary = await cleanupAssets(args, cutoff);
  return { summary, cutoff: cutoff.toISOString(), prefix: args.prefix, hours: args.hours };
}

export async function runRigCleanup(
  overrides?: Partial<Args>,
): Promise<{ summary: Summary; cutoff: string; prefix: string; hours: number }> {
  const args = resolveArgs(overrides);
  const cutoff = new Date(Date.now() - args.hours * 60 * 60 * 1000);
  const summary = await cleanupRigs(args, cutoff);
  return { summary, cutoff: cutoff.toISOString(), prefix: args.prefix, hours: args.hours };
}

export type CleanupCandidate = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  byteSize: number;
  permanentAvatarRefs: number;
  boundByPermanentAvatar: boolean;
};

type PreviewOptions = Partial<Pick<Args, "hours" | "prefix">>;

async function previewAssetRows(opts: PreviewOptions): Promise<CleanupCandidate[]> {
  const hours = opts.hours ?? DEFAULT_HOURS;
  const prefix = opts.prefix ?? DEFAULT_PREFIX;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(productionAssets)
    .where(
      and(
        eq(productionAssets.approvalGate, "approved_internal"),
        lt(productionAssets.createdAt, cutoff),
        sql`${productionAssets.name} LIKE ${`${prefix}%`}`,
      ),
    );
  const out: CleanupCandidate[] = [];
  for (const row of rows) {
    const refs = await storage.countPermanentAvatarsReferencingAsset(row.id);
    out.push({
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      byteSize: row.byteSize,
      permanentAvatarRefs: refs,
      boundByPermanentAvatar: refs > 0,
    });
  }
  return out;
}

async function previewRigRows(opts: PreviewOptions): Promise<CleanupCandidate[]> {
  const hours = opts.hours ?? DEFAULT_HOURS;
  const prefix = opts.prefix ?? DEFAULT_PREFIX;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(productionRigs)
    .where(
      and(
        eq(productionRigs.approvalGate, "approved_internal"),
        lt(productionRigs.createdAt, cutoff),
        sql`${productionRigs.name} LIKE ${`${prefix}%`}`,
      ),
    );
  const out: CleanupCandidate[] = [];
  for (const row of rows) {
    const refs = await storage.countPermanentAvatarsReferencingRig(row.id);
    out.push({
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      byteSize: row.byteSize,
      permanentAvatarRefs: refs,
      boundByPermanentAvatar: refs > 0,
    });
  }
  return out;
}

export async function previewAssetCleanup(
  opts: PreviewOptions = {},
): Promise<{ candidates: CleanupCandidate[]; cutoff: string; prefix: string; hours: number }> {
  const hours = opts.hours ?? DEFAULT_HOURS;
  const prefix = opts.prefix ?? DEFAULT_PREFIX;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const candidates = await previewAssetRows({ hours, prefix });
  return { candidates, cutoff: cutoff.toISOString(), prefix, hours };
}

export async function previewRigCleanup(
  opts: PreviewOptions = {},
): Promise<{ candidates: CleanupCandidate[]; cutoff: string; prefix: string; hours: number }> {
  const hours = opts.hours ?? DEFAULT_HOURS;
  const prefix = opts.prefix ?? DEFAULT_PREFIX;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const candidates = await previewRigRows({ hours, prefix });
  return { candidates, cutoff: cutoff.toISOString(), prefix, hours };
}

export const CLEANUP_DEFAULT_HOURS = DEFAULT_HOURS;
export const CLEANUP_DEFAULT_PREFIX = DEFAULT_PREFIX;

async function main() {
  const args = parseArgs();
  const cutoff = new Date(Date.now() - args.hours * 60 * 60 * 1000);
  console.log(
    `[cleanup-r7b-e2e] prefix="${args.prefix}" cutoff=${cutoff.toISOString()} dryRun=${args.dryRun}`,
  );
  const assets = await cleanupAssets(args, cutoff);
  const rigs = await cleanupRigs(args, cutoff);
  console.log(JSON.stringify({ assets, rigs, cutoff: cutoff.toISOString() }, null, 2));
  if (assets.errors.length || rigs.errors.length) {
    process.exitCode = 1;
  }
}

const isDirectRun = (() => {
  try {
    const entry = process.argv[1] ?? "";
    return entry.endsWith("cleanup-r7b-e2e-seeds.ts") ||
      entry.endsWith("cleanup-r7b-e2e-seeds.js");
  } catch {
    return false;
  }
})();

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
