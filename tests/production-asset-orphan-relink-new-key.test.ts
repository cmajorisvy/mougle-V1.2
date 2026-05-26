// Task #819 — Coverage for the "re-link to a NEW storageKey" path on
// reconcileOrphan added in Task #812. That path is the only thing
// standing between an admin typo and a row that silently points at the
// wrong file, so its four hard refusal conditions must be locked down:
//
//   1. invalid storageKey shape       → invalid_new_storage_key
//   2. bytes missing at the new key   → new_storage_key_not_found
//   3. byteSize mismatch              → new_storage_key_byte_size_mismatch
//   4. sha256 mismatch                → new_storage_key_sha256_mismatch
//
// Plus the happy path: matching bytes at the new key → row's storageKey
// is atomically rewritten AND a `relinked_to_new_storage_key` row is
// appended to production_asset_audit_log.
//
// Every refusal asserts that the DB row was NOT mutated (storageKey
// unchanged) and no audit-log row was inserted, so a regression that
// loses one of the guards can't silently slip past.
//
// Style mirrors tests/production-asset-orphan-bulk-reconcile.test.ts:
// an in-memory ProductionAssetStorageBackend injected via
// __setBackendForTests, rows created against the real DB and cleaned
// up in after().

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { productionAssetOrphanAlertService } from "../server/services/production-asset-orphan-alert-service";
import {
  __setBackendForTests,
  type ProductionAssetStorageBackend,
} from "../server/services/production-asset-storage";
import { storage } from "../server/storage";
import { db, pool } from "../server/db";
import {
  moderationLogs,
  productionAssetAuditLog,
  productionAssets,
  productionAssetDeletionSnapshots,
} from "../shared/schema";

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

const store = new Map<string, Buffer>();

const fakeBackend: ProductionAssetStorageBackend = {
  async putBytes(bucketName, objectName, buffer) {
    store.set(`${bucketName}/${objectName}`, Buffer.from(buffer));
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
    const had = store.delete(`${bucketName}/${objectName}`);
    return { deleted: had };
  },
  async downloadObject(bucketName, objectName) {
    const buf = store.get(`${bucketName}/${objectName}`);
    if (!buf) throw new Error(`fake-backend: object not found ${bucketName}/${objectName}`);
    return Buffer.from(buf);
  },
};

const ORIGINAL_PRIVATE = process.env.PRIVATE_OBJECT_DIR;
const ORIGINAL_PUBLIC = process.env.PUBLIC_OBJECT_SEARCH_PATHS;

const ACTOR_USER_ID = "test-admin-task-819";
const TEST_ASSET_NAME_PREFIX = "task-819-relink-";
const createdAssetIds: string[] = [];

interface OrphanedFixture {
  id: string;
  originalStorageKey: string;
  bytes: Buffer;
  sha256: string;
  byteSize: number;
}

async function createOrphanedArchivedAsset(): Promise<OrphanedFixture> {
  // Build an archived row whose bytes are missing in `store` → orphan.
  // We keep the canonical bytes on the test side so the happy-path test
  // can later seed them under a NEW storageKey and assert sha256 +
  // byteSize match the row.
  const id = crypto.randomUUID();
  const bytes = crypto.randomBytes(64);
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  const input = {
    name: `${TEST_ASSET_NAME_PREFIX}${id.slice(0, 8)}`,
    format: "glb",
    byteSize: bytes.byteLength,
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
    reason: "task-819 relink setup",
  });
  return {
    id: archived.id,
    originalStorageKey: archived.storageKey,
    bytes,
    sha256: sha,
    byteSize: bytes.byteLength,
  };
}

async function readRow(id: string) {
  const [row] = await db
    .select()
    .from(productionAssets)
    .where(eq(productionAssets.id, id))
    .limit(1);
  return row;
}

async function countAuditRows(id: string): Promise<number> {
  const rows = await db
    .select({ id: productionAssetAuditLog.id })
    .from(productionAssetAuditLog)
    .where(eq(productionAssetAuditLog.assetId, id));
  return rows.length;
}

async function assertRefusal(opts: {
  fixture: OrphanedFixture;
  newStorageKey: string;
  expectedMessageStartsWith: string;
}) {
  const before = await readRow(opts.fixture.id);
  assert.ok(before, "row must exist before refusal");
  const beforeAuditCount = await countAuditRows(opts.fixture.id);

  await assert.rejects(
    productionAssetOrphanAlertService.reconcileOrphan({
      assetId: opts.fixture.id,
      action: "relink_object",
      actorUserId: ACTOR_USER_ID,
      newStorageKey: opts.newStorageKey,
    }),
    (err: unknown) => {
      assert.ok(err instanceof Error, "must throw an Error");
      assert.ok(
        err.message.startsWith(opts.expectedMessageStartsWith),
        `error message must start with "${opts.expectedMessageStartsWith}", got "${err.message}"`,
      );
      return true;
    },
  );

  // Row unchanged.
  const after = await readRow(opts.fixture.id);
  assert.ok(after, "row must still exist after refusal");
  assert.equal(
    after.storageKey,
    before.storageKey,
    "storageKey must NOT mutate on refusal",
  );
  assert.equal(after.status, before.status, "status must NOT mutate on refusal");
  assert.equal(after.sha256, before.sha256, "sha256 must NOT mutate on refusal");
  assert.equal(after.byteSize, before.byteSize, "byteSize must NOT mutate on refusal");

  // No audit-log row appended.
  const afterAuditCount = await countAuditRows(opts.fixture.id);
  assert.equal(
    afterAuditCount,
    beforeAuditCount,
    "no production_asset_audit_log row may be inserted on refusal",
  );
}

before(async () => {
  process.env.PRIVATE_OBJECT_DIR = "/test-bucket/.private";
  process.env.PUBLIC_OBJECT_SEARCH_PATHS = "/test-bucket/public";
  __setBackendForTests(fakeBackend);
  await ensureProductionAssetTables();
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
  store.clear();
  if (ORIGINAL_PRIVATE === undefined) delete process.env.PRIVATE_OBJECT_DIR;
  else process.env.PRIVATE_OBJECT_DIR = ORIGINAL_PRIVATE;
  if (ORIGINAL_PUBLIC === undefined) delete process.env.PUBLIC_OBJECT_SEARCH_PATHS;
  else process.env.PUBLIC_OBJECT_SEARCH_PATHS = ORIGINAL_PUBLIC;
  __setBackendForTests(null);
});

describe("Task #819 — reconcileOrphan(relink_object) re-link to NEW storageKey refusal coverage", () => {
  it("happy path: matching bytes at the new storageKey → row updated atomically + audit log written", async () => {
    const fixture = await createOrphanedArchivedAsset();
    const newId = crypto.randomUUID();
    const newKey = `production-assets/${newId}.glb`;

    // Seed identical bytes at the NEW key only. Original storageKey is
    // still missing — this is exactly the "bytes came back at a different
    // path" recovery scenario the new path exists to handle.
    const { bucketName, objectName } = parseTestPath(newKey);
    store.set(`${bucketName}/${objectName}`, Buffer.from(fixture.bytes));

    const before = await readRow(fixture.id);
    const beforeAuditCount = await countAuditRows(fixture.id);

    const result = await productionAssetOrphanAlertService.reconcileOrphan({
      assetId: fixture.id,
      action: "relink_object",
      actorUserId: ACTOR_USER_ID,
      newStorageKey: newKey,
      reason: "task-819 happy path",
    });

    assert.equal(result.action, "relink_object");
    assert.equal(result.assetId, fixture.id);
    assert.equal(result.storageKeyUpdated, true);
    assert.equal(result.oldStorageKey, fixture.originalStorageKey);
    assert.equal(result.newStorageKey, newKey);
    assert.equal(result.hardDeleted, false);
    assert.equal(result.objectExists, true);

    // Row atomically rewritten.
    const after = await readRow(fixture.id);
    assert.ok(after);
    assert.equal(after.storageKey, newKey, "storageKey must be rewritten to the new key");
    assert.equal(after.sha256, before!.sha256, "sha256 must be unchanged");
    assert.equal(after.byteSize, before!.byteSize, "byteSize must be unchanged");
    assert.equal(after.status, "archived", "status must remain archived");

    // Exactly one audit-log row appended, with the expected event +
    // payload describing the rewrite.
    const afterAuditCount = await countAuditRows(fixture.id);
    assert.equal(afterAuditCount, beforeAuditCount + 1, "exactly one new audit-log row");
    const auditRows = await db
      .select()
      .from(productionAssetAuditLog)
      .where(
        and(
          eq(productionAssetAuditLog.assetId, fixture.id),
          eq(productionAssetAuditLog.event, "relinked_to_new_storage_key"),
        ),
      );
    assert.equal(auditRows.length, 1, "one relinked_to_new_storage_key audit row");
    const audit = auditRows[0];
    assert.equal(audit.actorUserId, ACTOR_USER_ID);
    const payload = audit.payload as any;
    assert.equal(payload.oldStorageKey, fixture.originalStorageKey);
    assert.equal(payload.newStorageKey, newKey);
    assert.equal(payload.byteSize, fixture.byteSize);
    assert.equal(payload.sha256, fixture.sha256);
    assert.equal(payload.reason, "task-819 happy path");
  });

  it("refuses invalid storageKey shape (does not match production-assets/<uuid>.<glb|gltf>)", async () => {
    const fixture = await createOrphanedArchivedAsset();
    await assertRefusal({
      fixture,
      // Wrong prefix → resolveFullPath throws "invalid storageKey", which
      // the service wraps as `invalid_new_storage_key: ...`.
      newStorageKey: "totally-not-a-production-asset-path.glb",
      expectedMessageStartsWith: "invalid_new_storage_key",
    });
  });

  it("refuses when bytes are missing at the new storageKey", async () => {
    const fixture = await createOrphanedArchivedAsset();
    const missingId = crypto.randomUUID();
    const missingKey = `production-assets/${missingId}.glb`;
    // Do NOT seed bytes at missingKey → headAsset reports {exists:false}.
    await assertRefusal({
      fixture,
      newStorageKey: missingKey,
      expectedMessageStartsWith: "new_storage_key_not_found",
    });
  });

  it("refuses byteSize mismatch (bytes at new key are the wrong size)", async () => {
    const fixture = await createOrphanedArchivedAsset();
    const newId = crypto.randomUUID();
    const newKey = `production-assets/${newId}.glb`;
    // Seed bytes whose size differs from what the row claims. headObject
    // will report a byteSize that disagrees with existing.byteSize, so
    // the service must throw before downloading.
    const wrongSize = Buffer.alloc(fixture.byteSize + 7, 0xab);
    const { bucketName, objectName } = parseTestPath(newKey);
    store.set(`${bucketName}/${objectName}`, wrongSize);

    await assertRefusal({
      fixture,
      newStorageKey: newKey,
      expectedMessageStartsWith: "new_storage_key_byte_size_mismatch",
    });
  });

  it("refuses sha256 mismatch (bytes at new key have correct size but wrong content)", async () => {
    const fixture = await createOrphanedArchivedAsset();
    const newId = crypto.randomUUID();
    const newKey = `production-assets/${newId}.glb`;
    // Same byteSize, different bytes → byteSize check passes, sha256
    // check is the one that must catch the swap. This is the canonical
    // "admin typo points at the wrong file" scenario.
    const wrongContent = crypto.randomBytes(fixture.byteSize);
    // Vanishingly unlikely to collide with fixture.sha256, but assert
    // explicitly so the test is deterministic.
    const wrongSha = crypto.createHash("sha256").update(wrongContent).digest("hex");
    assert.notEqual(wrongSha, fixture.sha256, "test setup: bytes must differ");
    const { bucketName, objectName } = parseTestPath(newKey);
    store.set(`${bucketName}/${objectName}`, wrongContent);

    await assertRefusal({
      fixture,
      newStorageKey: newKey,
      expectedMessageStartsWith: "new_storage_key_sha256_mismatch",
    });
  });
});

// Mirror of the service's parseObjectPath, kept local so the test does
// not depend on a private export. Only used to seed/inspect the in-memory
// fake backend keyed by `${bucketName}/${objectName}`.
function parseTestPath(storageKey: string): { bucketName: string; objectName: string } {
  const fullPath = `${process.env.PRIVATE_OBJECT_DIR}/${storageKey}`;
  const normalized = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = normalized.split("/").filter((p) => p.length > 0);
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}
