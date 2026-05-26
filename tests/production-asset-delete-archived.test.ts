// Task #777 — Coverage for the archived-asset deletion endpoint introduced in
// Task #765 (DELETE /api/admin/production-assets/:id +
// storage.deleteArchivedAsset).
//
// This file exercises the full destructive path end-to-end:
//   - route refuses to delete a non-archived asset (409 asset_not_archived)
//     and does NOT touch object bytes
//   - storage.deleteArchivedAsset throws asset_not_archived for non-archived
//     rows (storage layer must enforce the same invariant in-transaction)
//   - on an archived asset the route invokes deleteObject on the object-
//     storage backend, drops the DB row + cascades the per-asset audit log,
//     and writes a moderation_logs row with
//     contentType="production_asset", contentId=<assetId>,
//     actionTaken="production_asset_deleted".
//
// Style modelled on tests/production-asset-storage.test.ts: a fake
// ProductionAssetStorageBackend recorded via __setBackendForTests so no real
// object-storage call is made. The DB itself is the real (Supabase) DB the
// rest of the suite uses; every row inserted here is cleaned up in after()
// so the test is safe against a shared dev DB.

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
import { storage, ProductionAssetStorageError } from "../server/storage";
import { db, pool } from "../server/db";
import {
  moderationLogs,
  platformAlerts,
  productionAssets,
  productionAssetDeletionSnapshots,
} from "../shared/schema";
import { PRODUCTION_ASSET_ORPHAN_ALERT_TYPE } from "../server/services/production-asset-orphan-alert-service";

// production_assets / production_asset_audit_log may not exist in every
// environment this test runs against (the schema is feature-flagged and
// hasn't necessarily been pushed to the shared Supabase DB). The test
// creates them on demand so it remains self-contained.
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
  // platform_alerts is the destination panicButtonService.createAlert
  // writes into; ensure it exists so the Task #782 orphan-alert path
  // can be observed end-to-end.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_alerts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      type text NOT NULL,
      severity text NOT NULL DEFAULT 'warning',
      message text NOT NULL,
      details jsonb,
      acknowledged boolean NOT NULL DEFAULT false,
      acknowledged_by varchar,
      acknowledged_at timestamp,
      auto_triggered boolean NOT NULL DEFAULT true,
      created_at timestamp DEFAULT now()
    );
  `);
  // Task #783 — sibling snapshot table. Written BEFORE the cascade in
  // storage.deleteArchivedAsset so the per-asset audit trail survives the
  // ON DELETE CASCADE on production_asset_audit_log. No FK to
  // production_assets — by design — because the asset row is gone after
  // the transaction.
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

interface DeleteCall {
  bucketName: string;
  objectName: string;
}

let deletes: DeleteCall[] = [];
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
    deletes.push({ bucketName, objectName });
    const key = `${bucketName}/${objectName}`;
    const had = store.delete(key);
    return { deleted: had };
  },
};

const ORIGINAL_PRIVATE = process.env.PRIVATE_OBJECT_DIR;
const ORIGINAL_PUBLIC = process.env.PUBLIC_OBJECT_SEARCH_PATHS;

const ACTOR_USER_ID = "test-admin-task-777";
const TEST_ASSET_NAME_PREFIX = "task-777-test-asset-";
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

function makeAssetInput(overrides: Partial<{ status: string }> = {}) {
  const id = crypto.randomUUID();
  const sha = crypto.randomBytes(32).toString("hex");
  return {
    id,
    sha,
    input: {
      name: `${TEST_ASSET_NAME_PREFIX}${id.slice(0, 8)}`,
      format: "glb",
      byteSize: 5,
      sha256: sha,
      storageKey: `production-assets/${id}.glb`,
      uploaderUserId: ACTOR_USER_ID,
      ...overrides,
    },
  };
}

async function createDraftAsset() {
  const { input } = makeAssetInput();
  const row = await storage.createAsset(input as any, {
    actorUserId: ACTOR_USER_ID,
    event: "uploaded",
  });
  createdAssetIds.push(row.id);
  return row;
}

async function createArchivedAsset() {
  const row = await createDraftAsset();
  // archiveAsset sets status='archived' atomically with an audit row.
  const archived = await storage.archiveAsset(row.id, {
    actorUserId: ACTOR_USER_ID,
    reason: "task-777 test setup",
  });
  return archived;
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
  // Best-effort cleanup of every row this file created — including
  // moderation_logs rows the deletion path wrote, since those survive the
  // asset row by design.
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
      // Task #782 — clear any platform_alerts rows fired during the
      // orphaned-row test so the shared dev DB doesn't accumulate them.
      try {
        const alertRows = await db
          .select()
          .from(platformAlerts)
          .where(eq(platformAlerts.type, PRODUCTION_ASSET_ORPHAN_ALERT_TYPE));
        const ourAlertIds = alertRows
          .filter((r) => {
            const d = (r.details as any) || {};
            return typeof d.assetId === "string" && createdAssetIds.includes(d.assetId);
          })
          .map((r) => r.id);
        if (ourAlertIds.length > 0) {
          await db
            .delete(platformAlerts)
            .where(inArray(platformAlerts.id, ourAlertIds));
        }
      } catch {
        /* ignore */
      }
      await db
        .delete(productionAssets)
        .where(inArray(productionAssets.id, createdAssetIds));
    }
  } catch {
    // ignore — tests should not fail because cleanup failed
  }

  await new Promise<void>((r) => server.close(() => r()));

  if (ORIGINAL_PRIVATE === undefined) delete process.env.PRIVATE_OBJECT_DIR;
  else process.env.PRIVATE_OBJECT_DIR = ORIGINAL_PRIVATE;
  if (ORIGINAL_PUBLIC === undefined) delete process.env.PUBLIC_OBJECT_SEARCH_PATHS;
  else process.env.PUBLIC_OBJECT_SEARCH_PATHS = ORIGINAL_PUBLIC;
  __setBackendForTests(null);
});

async function del(p: string, body: any) {
  return fetch(`${base}${p}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/admin/production-assets/:id — archived-asset deletion", () => {
  it("invokes deleteObject on the fake backend for an archived asset, drops the DB row, and writes a moderation_logs row", async () => {
    const asset = await createArchivedAsset();

    // Seed bytes in the fake backend so deleteObject reports {deleted:true}.
    const fullKey = `test-bucket/.private/${asset.storageKey}`;
    store.set(fullKey, Buffer.from([1, 2, 3, 4, 5]));

    deletes = [];

    const res = await del(`/api/admin/production-assets/${asset.id}`, {
      reason: "task-777 — verify destructive path",
      confirm: true,
    });
    assert.equal(res.status, 200, `unexpected status: ${res.status}`);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.deletedAssetId, asset.id);
    assert.equal(body.objectDeleted, true);

    // 1. deleteObject was invoked exactly once with the correct bucket+key.
    assert.equal(deletes.length, 1, "deleteObject should be invoked once");
    assert.equal(deletes[0].bucketName, "test-bucket");
    assert.equal(
      deletes[0].objectName,
      `.private/${asset.storageKey}`,
      "deleteObject must target the asset's private storageKey",
    );
    assert.equal(store.has(fullKey), false, "bytes should be gone");

    // 2. DB row is gone (cascade removed the asset's audit-log rows too).
    const [stillThere] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, asset.id))
      .limit(1);
    assert.equal(stillThere, undefined, "production_assets row should be deleted");

    // 3. moderation_logs row written with the required shape.
    const modRows = await db
      .select()
      .from(moderationLogs)
      .where(
        and(
          eq(moderationLogs.contentType, "production_asset"),
          eq(moderationLogs.contentId, asset.id),
        ),
      );
    assert.equal(
      modRows.length,
      1,
      "exactly one moderation_logs row should be written for the deletion",
    );
    const mod = modRows[0];
    assert.equal(mod.contentType, "production_asset");
    assert.equal(mod.contentId, asset.id);
    assert.equal(mod.actionTaken, "production_asset_deleted");
    assert.equal(mod.category, "asset_deletion");
    assert.equal(mod.userId, ACTOR_USER_ID);
    assert.equal(mod.severity, "high");
    assert.match(
      String(mod.reason),
      /task-777|deletion/i,
      "reason should reflect the caller-provided reason",
    );
  });

  it("refuses to delete a non-archived asset (409 asset_not_archived) and does not touch object bytes", async () => {
    const asset = await createDraftAsset();
    const fullKey = `test-bucket/.private/${asset.storageKey}`;
    store.set(fullKey, Buffer.from([9, 9, 9]));

    deletes = [];

    const res = await del(`/api/admin/production-assets/${asset.id}`, {
      reason: "should be rejected",
      confirm: true,
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "asset_not_archived");

    assert.equal(deletes.length, 0, "deleteObject must NOT be called");
    assert.equal(store.has(fullKey), true, "bytes must NOT be removed");

    // DB row preserved, no moderation_logs row written.
    const [stillThere] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, asset.id))
      .limit(1);
    assert.ok(stillThere, "non-archived asset row must be preserved");

    const modRows = await db
      .select()
      .from(moderationLogs)
      .where(
        and(
          eq(moderationLogs.contentType, "production_asset"),
          eq(moderationLogs.contentId, asset.id),
        ),
      );
    assert.equal(
      modRows.length,
      0,
      "no moderation_logs row should be written for a rejected delete",
    );
  });
});

describe("storage.deleteArchivedAsset — invariants", () => {
  it("rejects a non-archived asset with ProductionAssetStorageError('asset_not_archived')", async () => {
    const asset = await createDraftAsset();
    await assert.rejects(
      () => storage.deleteArchivedAsset(asset.id, { actorUserId: ACTOR_USER_ID }),
      (err: unknown) => {
        assert.ok(
          err instanceof ProductionAssetStorageError,
          "should throw ProductionAssetStorageError",
        );
        assert.equal((err as ProductionAssetStorageError).code, "asset_not_archived");
        return true;
      },
    );
    // Row must still exist and no moderation_logs row written.
    const [stillThere] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, asset.id))
      .limit(1);
    assert.ok(stillThere);
    const modRows = await db
      .select()
      .from(moderationLogs)
      .where(
        and(
          eq(moderationLogs.contentType, "production_asset"),
          eq(moderationLogs.contentId, asset.id),
        ),
      );
    assert.equal(modRows.length, 0);
  });

  it("writes a moderation_logs row with contentType='production_asset' and contentId=<assetId> on archived delete", async () => {
    const asset = await createArchivedAsset();
    const result = await storage.deleteArchivedAsset(asset.id, {
      actorUserId: ACTOR_USER_ID,
      reason: "task-777 storage-layer audit-trail check",
    });
    assert.equal(result.asset.id, asset.id);

    const modRows = await db
      .select()
      .from(moderationLogs)
      .where(
        and(
          eq(moderationLogs.contentType, "production_asset"),
          eq(moderationLogs.contentId, asset.id),
        ),
      );
    assert.equal(modRows.length, 1);
    assert.equal(modRows[0].contentType, "production_asset");
    assert.equal(modRows[0].contentId, asset.id);
    assert.equal(modRows[0].actionTaken, "production_asset_deleted");
    assert.equal(modRows[0].userId, ACTOR_USER_ID);
  });
});

describe("Task #782 — orphaned-row alert path (object deleted but DB delete failed)", () => {
  it("fires a platform_alert + returns asset_row_orphaned_after_object_delete when storage.deleteArchivedAsset throws after the object was removed", async () => {
    const asset = await createArchivedAsset();
    const fullKey = `test-bucket/.private/${asset.storageKey}`;
    store.set(fullKey, Buffer.from([1, 2, 3]));

    deletes = [];

    // Force storage.deleteArchivedAsset to throw — simulating a DB-side
    // failure (transaction rollback, deadlock, etc.) AFTER the object
    // bytes have already been removed by the route's step 2.
    const original = storage.deleteArchivedAsset.bind(storage);
    const injected = new Error("injected_db_failure_task_782");
    (storage as any).deleteArchivedAsset = async () => {
      throw injected;
    };

    let res: Response;
    try {
      res = await del(`/api/admin/production-assets/${asset.id}`, {
        reason: "task-782 — simulate DB failure after object delete",
        confirm: true,
      });
    } finally {
      (storage as any).deleteArchivedAsset = original;
    }

    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "asset_row_orphaned_after_object_delete");
    assert.equal(body.assetId, asset.id);

    // Object bytes ARE gone (deleteObject was called once and succeeded).
    assert.equal(deletes.length, 1);
    assert.equal(store.has(fullKey), false);

    // DB row is preserved (still archived) — this is the orphan we are
    // alerting on.
    const [stillThere] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, asset.id))
      .limit(1);
    assert.ok(stillThere, "orphan row must be preserved for reconcile");
    assert.equal(stillThere.status, "archived");

    // A platform_alerts row of the orphan type must have been written
    // with details.assetId === this asset's id.
    const alertRows = await db
      .select()
      .from(platformAlerts)
      .where(eq(platformAlerts.type, PRODUCTION_ASSET_ORPHAN_ALERT_TYPE));
    const ourAlert = alertRows.find((r) => {
      const d = (r.details as any) || {};
      return d.assetId === asset.id;
    });
    assert.ok(ourAlert, "founder alert must be created for the orphan");
    assert.equal(ourAlert!.severity, "critical");
    const details = (ourAlert!.details as any) || {};
    assert.equal(details.storageKey, asset.storageKey);
    assert.equal(details.actorUserId, ACTOR_USER_ID);
    assert.match(
      String(details.errorMessage || ""),
      /injected_db_failure_task_782/,
    );
  });

  it("orphan reconcile: hard_delete removes the DB row + writes a moderation_logs row when object bytes are genuinely gone", async () => {
    const asset = await createArchivedAsset();
    // Intentionally do NOT seed bytes in `store` — simulating a row whose
    // object bytes were already deleted by an earlier (broken) attempt.

    const res = await fetch(
      `${base}/api/admin/production-assets/${asset.id}/reconcile`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "hard_delete",
          reason: "task-782 reconcile test",
          confirm: true,
        }),
      },
    );
    assert.equal(res.status, 200, `unexpected status: ${res.status}`);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.result.action, "hard_delete");
    assert.equal(body.result.hardDeleted, true);
    assert.equal(body.result.objectExists, false);

    // DB row is gone.
    const [stillThere] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, asset.id))
      .limit(1);
    assert.equal(stillThere, undefined);

    // moderation_logs row with the orphan-specific actionTaken is written.
    const modRows = await db
      .select()
      .from(moderationLogs)
      .where(
        and(
          eq(moderationLogs.contentType, "production_asset"),
          eq(moderationLogs.contentId, asset.id),
        ),
      );
    assert.equal(modRows.length, 1);
    assert.equal(modRows[0].actionTaken, "production_asset_orphan_hard_deleted");
    assert.equal(modRows[0].userId, ACTOR_USER_ID);
  });

  it("orphan reconcile: refuses hard_delete when object bytes are still present", async () => {
    const asset = await createArchivedAsset();
    const fullKey = `test-bucket/.private/${asset.storageKey}`;
    store.set(fullKey, Buffer.from([7, 7, 7]));

    const res = await fetch(
      `${base}/api/admin/production-assets/${asset.id}/reconcile`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "hard_delete",
          reason: "should be refused",
          confirm: true,
        }),
      },
    );
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "object_still_present");

    // Row preserved.
    const [stillThere] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, asset.id))
      .limit(1);
    assert.ok(stillThere);
  });
});

// Task #783 — the per-asset audit-log used to vanish silently because the
// production_asset_audit_log FK has ON DELETE CASCADE on asset_id. The
// storage layer now snapshots the trail into
// production_asset_deletion_snapshots BEFORE the cascade fires, so admins
// can still answer "what was that asset and who approved it?" after the
// destructive delete.
describe("Task #783 — deletion snapshot survives the cascade", () => {
  it("captures the full asset row + audit-log payload BEFORE the cascade and persists it past delete", async () => {
    const asset = await createArchivedAsset();

    // Pre-condition: the archived asset has at least the `uploaded` +
    // `archived` audit-log rows (created by createDraftAsset +
    // archiveAsset). Capture the count so we can assert equality on the
    // snapshot's auditRowCount.
    const preRows = await storage.listAuditLogForAsset(asset.id, { limit: 100 });
    assert.ok(
      preRows.length >= 2,
      `expected ≥2 pre-deletion audit rows, got ${preRows.length}`,
    );

    const result = await storage.deleteArchivedAsset(asset.id, {
      actorUserId: ACTOR_USER_ID,
      reason: "task-783 — snapshot survives cascade",
    });
    assert.equal(result.deletedAuditRows, preRows.length);
    assert.ok(
      typeof result.snapshotId === "string" && result.snapshotId.length > 0,
      "deleteArchivedAsset must return a snapshotId",
    );

    // Asset row is gone, audit-log cascade fired.
    const [stillThere] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, asset.id))
      .limit(1);
    assert.equal(stillThere, undefined);
    const postRows = await storage.listAuditLogForAsset(asset.id, { limit: 100 });
    assert.equal(
      postRows.length,
      0,
      "per-asset audit-log rows must be cascade-deleted",
    );

    // But the snapshot survives, with the full payload preserved.
    const snap = await storage.getAssetDeletionSnapshotByAssetId(asset.id);
    assert.ok(snap, "deletion snapshot must exist after delete");
    assert.equal(snap!.assetId, asset.id);
    assert.equal(snap!.actorUserId, ACTOR_USER_ID);
    assert.equal(snap!.auditRowCount, preRows.length);

    const snapAsset = snap!.assetSnapshot as Record<string, unknown>;
    assert.equal(snapAsset.id, asset.id);
    assert.equal(snapAsset.name, asset.name);
    assert.equal(snapAsset.sha256, asset.sha256);
    assert.equal(snapAsset.storageKey, asset.storageKey);
    assert.equal(snapAsset.status, "archived");

    const snapAudit = snap!.auditLogSnapshot as Array<Record<string, unknown>>;
    assert.equal(Array.isArray(snapAudit), true);
    assert.equal(snapAudit.length, preRows.length);
    const events = snapAudit.map((r) => r.event);
    assert.ok(events.includes("uploaded"), `events missing 'uploaded': ${events.join(",")}`);
    assert.ok(events.includes("archived"), `events missing 'archived': ${events.join(",")}`);
    for (const row of snapAudit) {
      assert.equal(row.assetId, asset.id, "every snapshot row points at the deleted asset");
    }

    // The snapshot's moderationLogId should link to the moderation_logs
    // row written by the same transaction.
    assert.ok(snap!.moderationLogId, "snapshot must reference its moderation_logs row");
    const [modRow] = await db
      .select()
      .from(moderationLogs)
      .where(eq(moderationLogs.id, snap!.moderationLogId!))
      .limit(1);
    assert.ok(modRow, "moderation_logs row referenced by the snapshot must exist");
    assert.equal(modRow.contentId, asset.id);
  });
});
