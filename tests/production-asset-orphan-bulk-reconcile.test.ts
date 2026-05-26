// Task #796 — Coverage for the bulk orphan-reconcile flow exposed by
// OrphanReconcilePanel.tsx ("Hard-delete selected"). The frontend's bulk
// path is just a sequential loop over POST /api/admin/production-assets/
// :id/reconcile with {action:"hard_delete", confirm:true, reason}. This
// test pins that contract end-to-end so a future refactor of either the
// panel or the route cannot silently regress the founder's recovery flow
// during a storage incident.
//
// What this test guards:
//   1. The orphans/list endpoint surfaces archived rows whose object
//      bytes are missing (the panel's data source).
//   2. The route honors the confirm + reason invariants the panel relies
//      on: confirm:false is refused at the server, a reason is accepted
//      and propagated to the moderation_logs row.
//   3. Sequentially calling reconcile for the two selected orphans
//      (mimicking the bulk loop) hard-deletes both, writes a moderation
//      log per row, and leaves orphans/list empty.
//   4. Mixed-outcome case: when one row 404s mid-loop the other still
//      succeeds — i.e. the bulk run produces a partial-success summary
//      instead of aborting the whole batch.
//   5. The per-row Re-link action is still gated on object bytes being
//      back (the panel only enables it per-row, never in bulk).
//
// Style mirrors tests/production-asset-delete-archived.test.ts: an
// in-memory ProductionAssetStorageBackend injected via
// __setBackendForTests so no real object-storage call is made; rows are
// created against the real (Supabase) DB and cleaned up in after().

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { registerProductionAssetRoutes } from "../server/routes/admin/production-assets";
import {
  __setBackendForTests,
  type ProductionAssetStorageBackend,
} from "../server/services/production-asset-storage";
import { storage } from "../server/storage";
import { db, pool } from "../server/db";
import {
  moderationLogs,
  productionAssets,
  productionAssetDeletionSnapshots,
} from "../shared/schema";

// Same table-bootstrap as production-asset-delete-archived.test.ts —
// kept self-contained so the test runs against a fresh dev DB without
// requiring drizzle-kit push.
async function ensureProductionAssetTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_assets (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      format text NOT NULL,
      byte_size integer NOT NULL,
      sha256 text NOT NULL UNIQUE,
      original_source_url text,
      storage_key text NOT NULL,
      uploader_user_id text NOT NULL,
      status text NOT NULL DEFAULT 'draft',
      lifecycle_state text NOT NULL DEFAULT 'uploaded',
      license_status text NOT NULL DEFAULT 'unknown',
      license_source text,
      license_note text,
      safety_review text NOT NULL DEFAULT 'pending',
      safety_note text,
      approval_gate text NOT NULL DEFAULT 'not_approved',
      public_url text DEFAULT NULL,
      metadata jsonb,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT production_assets_public_url_must_be_null_in_r5c CHECK (public_url IS NULL)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_asset_audit_log (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id varchar NOT NULL REFERENCES production_assets(id) ON DELETE CASCADE,
      actor_user_id text NOT NULL,
      event text NOT NULL,
      payload jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_asset_deletion_snapshots (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id varchar NOT NULL,
      moderation_log_id varchar,
      actor_user_id text NOT NULL,
      reason text,
      asset_snapshot jsonb NOT NULL,
      audit_log_snapshot jsonb NOT NULL,
      audit_row_count integer NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);
}

let store: Map<string, Buffer> = new Map();

const fakeBackend: ProductionAssetStorageBackend = {
  async putBytes(bucketName, objectName, buffer) {
    store.set(`${bucketName}/${objectName}`, buffer);
  },
  async headObject(bucketName, objectName) {
    const buf = store.get(`${bucketName}/${objectName}`);
    if (!buf) return { exists: false };
    return { exists: true, byteSize: buf.byteLength };
  },
  async signGetUrl(bucketName, objectName, ttlSeconds) {
    return `https://signed.test/${bucketName}/${objectName}?ttl=${ttlSeconds}`;
  },
  async deleteObject(bucketName, objectName) {
    const key = `${bucketName}/${objectName}`;
    const had = store.delete(key);
    return { deleted: had };
  },
};

const ORIGINAL_PRIVATE = process.env.PRIVATE_OBJECT_DIR;
const ORIGINAL_PUBLIC = process.env.PUBLIC_OBJECT_SEARCH_PATHS;

const ACTOR_USER_ID = "test-admin-task-796";
const TEST_ASSET_NAME_PREFIX = "task-796-bulk-orphan-";
const createdAssetIds: string[] = [];

let server: Server;
let base: string;

function appWithStubAdmin() {
  const app = express();
  app.use(express.json());
  const requireAdmin: express.RequestHandler = (req: any, _res, next) => {
    req.session = {
      isAdmin: true,
      adminActorId: ACTOR_USER_ID,
      adminActorType: "root_admin",
      adminRole: "super_admin",
    };
    next();
  };
  registerProductionAssetRoutes(app, requireAdmin);
  return app;
}

async function createOrphanedArchivedAsset(): Promise<{
  id: string;
  storageKey: string;
  name: string;
}> {
  // Build an archived row but deliberately do NOT seed bytes in `store`,
  // so headAsset reports {exists:false} → the row is "orphaned" from the
  // panel's perspective.
  const id = crypto.randomUUID();
  const sha = crypto.randomBytes(32).toString("hex");
  const input = {
    name: `${TEST_ASSET_NAME_PREFIX}${id.slice(0, 8)}`,
    format: "glb",
    byteSize: 5,
    sha256: sha,
    storageKey: `production-assets/${id}.glb`,
    uploaderUserId: ACTOR_USER_ID,
  };
  const row = await storage.createAsset(input as any, {
    actorUserId: ACTOR_USER_ID,
    event: "uploaded",
  });
  createdAssetIds.push(row.id);
  const archived = await storage.archiveAsset(row.id, {
    actorUserId: ACTOR_USER_ID,
    reason: "task-796 bulk-orphan setup",
  });
  return { id: archived.id, storageKey: archived.storageKey, name: archived.name };
}

async function post(p: string, body: any) {
  return fetch(`${base}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function get(p: string) {
  return fetch(`${base}${p}`);
}

async function listOrphanIds(): Promise<string[]> {
  const res = await get(`/api/admin/production-assets/orphans/list`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  return (body.items as Array<{ id: string }>).map((o) => o.id);
}

before(async () => {
  process.env.PRIVATE_OBJECT_DIR = "/test-bucket/.private";
  process.env.PUBLIC_OBJECT_SEARCH_PATHS = "/test-bucket/public";
  __setBackendForTests(fakeBackend);
  await ensureProductionAssetTables();

  const app = appWithStubAdmin();
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  try {
    if (createdAssetIds.length > 0) {
      await db
        .delete(productionAssetDeletionSnapshots)
        .where(inArray(productionAssetDeletionSnapshots.assetId, createdAssetIds));
      await db
        .delete(moderationLogs)
        .where(
          and(
            eq(moderationLogs.contentType, "production_asset"),
            inArray(moderationLogs.contentId, createdAssetIds),
          ),
        );
      await db
        .delete(productionAssets)
        .where(inArray(productionAssets.id, createdAssetIds));
    }
  } catch {
    /* ignore — never fail a test on cleanup */
  }

  await new Promise<void>((r) => server.close(() => r()));

  if (ORIGINAL_PRIVATE === undefined) delete process.env.PRIVATE_OBJECT_DIR;
  else process.env.PRIVATE_OBJECT_DIR = ORIGINAL_PRIVATE;
  if (ORIGINAL_PUBLIC === undefined) delete process.env.PUBLIC_OBJECT_SEARCH_PATHS;
  else process.env.PUBLIC_OBJECT_SEARCH_PATHS = ORIGINAL_PUBLIC;
  __setBackendForTests(null);
});

describe("Task #796 — bulk orphan hard-delete (OrphanReconcilePanel)", () => {
  it("orphans/list surfaces archived rows whose object bytes are missing", async () => {
    const a = await createOrphanedArchivedAsset();
    const b = await createOrphanedArchivedAsset();

    const orphanIds = await listOrphanIds();
    assert.ok(orphanIds.includes(a.id), "orphan A must appear in /orphans/list");
    assert.ok(orphanIds.includes(b.id), "orphan B must appear in /orphans/list");
  });

  it("reconcile refuses confirm:false (the panel's confirm prompt is server-enforced)", async () => {
    const a = await createOrphanedArchivedAsset();
    const res = await post(
      `/api/admin/production-assets/${a.id}/reconcile`,
      {
        action: "hard_delete",
        // confirm omitted → zod literal(true) refuses
        reason: "task-796 — confirm refused",
      },
    );
    assert.equal(res.status, 400);

    // Row preserved.
    const [stillThere] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, a.id))
      .limit(1);
    assert.ok(stillThere, "asset must NOT be deleted when confirm is missing");
  });

  it("bulk hard-delete loop: two orphans both hard-delete, list goes empty, moderation_logs written per row", async () => {
    const a = await createOrphanedArchivedAsset();
    const b = await createOrphanedArchivedAsset();

    // Mimic the panel's loop verbatim: sequential POSTs, each with the
    // same {action, confirm, reason} body the panel sends.
    const reason = "task-796 — bulk hard-delete, bytes confirmed missing";
    const results: Array<{ id: string; ok: boolean; status: number }> = [];
    for (const target of [a, b]) {
      const res = await post(
        `/api/admin/production-assets/${target.id}/reconcile`,
        { action: "hard_delete", confirm: true, reason },
      );
      const json = await res.json().catch(() => ({}));
      results.push({ id: target.id, ok: res.ok && json?.ok === true, status: res.status });
      if (res.ok && json?.ok) {
        assert.equal(json.result.action, "hard_delete");
        assert.equal(json.result.hardDeleted, true);
        assert.equal(json.result.objectExists, false);
        assert.equal(json.result.assetId, target.id);
      }
    }

    // Per-row results render with ok/failed badges → here both must be ok.
    assert.deepEqual(
      results.map((r) => r.ok),
      [true, true],
      "every row in the bulk loop must succeed when bytes are confirmed missing",
    );

    // Both DB rows are gone (the panel removes succeeded rows from the
    // selection set and re-fetches the orphan list query).
    const remaining = await db
      .select()
      .from(productionAssets)
      .where(inArray(productionAssets.id, [a.id, b.id]));
    assert.equal(remaining.length, 0, "both orphan rows must be hard-deleted");

    // orphan list query invalidated → both ids disappear from /orphans/list.
    const orphanIdsAfter = await listOrphanIds();
    assert.ok(!orphanIdsAfter.includes(a.id));
    assert.ok(!orphanIdsAfter.includes(b.id));

    // moderation_logs row per asset, with the caller-provided reason.
    for (const target of [a, b]) {
      const modRows = await db
        .select()
        .from(moderationLogs)
        .where(
          and(
            eq(moderationLogs.contentType, "production_asset"),
            eq(moderationLogs.contentId, target.id),
          ),
        );
      assert.equal(modRows.length, 1, `one moderation_logs row per asset (${target.id})`);
      assert.equal(modRows[0].actionTaken, "production_asset_orphan_hard_deleted");
      assert.equal(modRows[0].userId, ACTOR_USER_ID);
      assert.equal(modRows[0].reason, reason);
    }
  });

  it("mixed-outcome: one row 404s mid-loop, the other still hard-deletes (partial-success summary)", async () => {
    const ok1 = await createOrphanedArchivedAsset();
    const missing = await createOrphanedArchivedAsset();
    const ok2 = await createOrphanedArchivedAsset();

    // Force `missing` to 404 by deleting its DB row directly BEFORE the
    // bulk loop runs. The panel's loop must not abort — it must record
    // the failure and keep going.
    await db.delete(productionAssets).where(eq(productionAssets.id, missing.id));

    const reason = "task-796 — mixed-outcome bulk";
    const results: Array<{ id: string; ok: boolean; status: number; error?: string }> = [];
    for (const target of [ok1, missing, ok2]) {
      const res = await post(
        `/api/admin/production-assets/${target.id}/reconcile`,
        { action: "hard_delete", confirm: true, reason },
      );
      const json = await res.json().catch(() => ({}));
      results.push({
        id: target.id,
        ok: res.ok && json?.ok === true,
        status: res.status,
        error: json?.error,
      });
    }

    // Partial-success summary: 2 ok, 1 failed.
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok).length;
    assert.equal(okCount, 2, "two succeeded rows in the mixed batch");
    assert.equal(failCount, 1, "one failed row in the mixed batch");

    const missingResult = results.find((r) => r.id === missing.id)!;
    assert.equal(missingResult.status, 404);
    assert.equal(missingResult.error, "asset_not_found");

    // The two succeeded rows must be gone; orphan list excludes them.
    const remaining = await db
      .select()
      .from(productionAssets)
      .where(inArray(productionAssets.id, [ok1.id, ok2.id]));
    assert.equal(remaining.length, 0);
    const orphanIdsAfter = await listOrphanIds();
    assert.ok(!orphanIdsAfter.includes(ok1.id));
    assert.ok(!orphanIdsAfter.includes(ok2.id));
  });

  it("Re-link in bulk-equivalent loop is still gated on bytes being back (panel-only-per-row guard mirrored at server)", async () => {
    const a = await createOrphanedArchivedAsset();
    // Bytes are still missing → relink_object must be refused server-side
    // with 409 object_still_missing. This is what keeps the panel honest
    // when it only exposes Re-link per-row.
    const res = await post(
      `/api/admin/production-assets/${a.id}/reconcile`,
      { action: "relink_object", confirm: true },
    );
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "object_still_missing");
  });
});
