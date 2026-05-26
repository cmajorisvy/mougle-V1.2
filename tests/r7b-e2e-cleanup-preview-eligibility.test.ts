// Task #902 — Coverage for the test-seed cleanup admin panel introduced in
// Task #898 (GET /api/admin/production-{assets,rigs}/r7b-e2e-cleanup/preview
// + POST .../r7b-e2e-cleanup/run).
//
// We seed, per kind (asset + rig), three rows and a fourth non-matching
// prefix row, then assert:
//   1. The eligible row is listed in the preview (boundByPermanentAvatar=false)
//      and DELETED by the run.
//   2. The bound-by-permanent-avatar row is listed with
//      boundByPermanentAvatar=true and SKIPPED by the run (summary
//      .skippedReferenced incremented, DB row preserved).
//   3. The too-young row (createdAt newer than cutoff) is NOT listed
//      and NOT touched by the run.
//   4. A row whose name does not start with the configured prefix is NOT
//      listed and NOT touched by the run.
//
// We avoid needing a real permanent_avatars table by monkey-patching
// storage.countPermanentAvatarsReferencingAsset / ...Rig to return >0 for
// the explicit "bound" IDs we seeded.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { registerProductionAssetRoutes } from "../server/routes/admin/production-assets";
import { registerProductionRigRoutes } from "../server/routes/admin/production-rigs";
import {
  __setBackendForTests as __setAssetBackendForTests,
  type ProductionAssetStorageBackend,
} from "../server/services/production-asset-storage";
import {
  __setRigBackendForTests,
  type ProductionRigStorageBackend,
} from "../server/services/production-rig-storage";
import { storage } from "../server/storage";
import { db, pool } from "../server/db";
import {
  productionAssets,
  productionRigs,
} from "../shared/schema";

async function ensureTables() {
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_rigs (
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
      CONSTRAINT production_rigs_public_url_must_be_null CHECK (public_url IS NULL)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_rig_audit_log (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      rig_id varchar NOT NULL REFERENCES production_rigs(id) ON DELETE CASCADE,
      actor_user_id text NOT NULL,
      event text NOT NULL,
      payload jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);
}

const fakeAssetBackend: ProductionAssetStorageBackend = {
  async putBytes() {},
  async headObject() {
    return { exists: false };
  },
  async signGetUrl(b, o, ttl) {
    return `https://x/${b}/${o}?ttl=${ttl}`;
  },
  async deleteObject() {
    return { deleted: true };
  },
};
const fakeRigBackend: ProductionRigStorageBackend = {
  async putBytes() {},
  async headObject() {
    return { exists: false };
  },
  async signGetUrl(b, o, ttl) {
    return `https://x/${b}/${o}?ttl=${ttl}`;
  },
  async deleteObject() {
    return { deleted: true };
  },
};

const ORIGINAL_PRIVATE = process.env.PRIVATE_OBJECT_DIR;
const ORIGINAL_PUBLIC = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
const ACTOR_USER_ID = "test-admin-task-902";

const createdAssetIds: string[] = [];
const createdRigIds: string[] = [];
const boundAssetIds = new Set<string>();
const boundRigIds = new Set<string>();

let server: Server;
let base: string;

const originalCountAsset = storage.countPermanentAvatarsReferencingAsset.bind(storage);
const originalCountRig = storage.countPermanentAvatarsReferencingRig.bind(storage);

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
  registerProductionRigRoutes(app, requireAdmin);
  return app;
}

async function seedAsset(opts: {
  namePrefix: string;
  ageHours: number;
}): Promise<{ id: string; name: string }> {
  const id = crypto.randomUUID();
  const sha = crypto.randomBytes(32).toString("hex");
  const name = `${opts.namePrefix}-${id.slice(0, 8)}`;
  const created = await storage.createAsset(
    {
      name,
      format: "glb",
      byteSize: 5,
      sha256: sha,
      storageKey: `production-assets/${id}.glb`,
      uploaderUserId: ACTOR_USER_ID,
    } as any,
    { actorUserId: ACTOR_USER_ID, event: "uploaded" },
  );
  createdAssetIds.push(created.id);
  const createdAt = new Date(Date.now() - opts.ageHours * 3600 * 1000);
  await db
    .update(productionAssets)
    .set({ approvalGate: "approved_internal", createdAt })
    .where(eq(productionAssets.id, created.id));
  return { id: created.id, name };
}

async function seedRig(opts: {
  namePrefix: string;
  ageHours: number;
}): Promise<{ id: string; name: string }> {
  const id = crypto.randomUUID();
  const sha = crypto.randomBytes(32).toString("hex");
  const name = `${opts.namePrefix}-${id.slice(0, 8)}`;
  const created = await storage.createRig(
    {
      name,
      format: "glb",
      byteSize: 5,
      sha256: sha,
      storageKey: `production-rigs/${id}.glb`,
      uploaderUserId: ACTOR_USER_ID,
    } as any,
    { actorUserId: ACTOR_USER_ID, event: "uploaded" },
  );
  createdRigIds.push(created.id);
  const createdAt = new Date(Date.now() - opts.ageHours * 3600 * 1000);
  await db
    .update(productionRigs)
    .set({ approvalGate: "approved_internal", createdAt })
    .where(eq(productionRigs.id, created.id));
  return { id: created.id, name };
}

before(async () => {
  process.env.PRIVATE_OBJECT_DIR = "/test-bucket/.private";
  process.env.PUBLIC_OBJECT_SEARCH_PATHS = "/test-bucket/public";
  __setAssetBackendForTests(fakeAssetBackend);
  __setRigBackendForTests(fakeRigBackend);
  await ensureTables();

  // Monkey-patch reference counts: 1 only for IDs we register as bound.
  (storage as any).countPermanentAvatarsReferencingAsset = async (id: string) =>
    boundAssetIds.has(id) ? 1 : 0;
  (storage as any).countPermanentAvatarsReferencingRig = async (id: string) =>
    boundRigIds.has(id) ? 1 : 0;

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
        .delete(productionAssets)
        .where(inArray(productionAssets.id, createdAssetIds));
    }
    if (createdRigIds.length > 0) {
      await db
        .delete(productionRigs)
        .where(inArray(productionRigs.id, createdRigIds));
    }
  } catch {
    /* ignore */
  }
  await new Promise<void>((r) => server.close(() => r()));
  (storage as any).countPermanentAvatarsReferencingAsset = originalCountAsset;
  (storage as any).countPermanentAvatarsReferencingRig = originalCountRig;
  __setAssetBackendForTests(null);
  __setRigBackendForTests(null);
  if (ORIGINAL_PRIVATE === undefined) delete process.env.PRIVATE_OBJECT_DIR;
  else process.env.PRIVATE_OBJECT_DIR = ORIGINAL_PRIVATE;
  if (ORIGINAL_PUBLIC === undefined) delete process.env.PUBLIC_OBJECT_SEARCH_PATHS;
  else process.env.PUBLIC_OBJECT_SEARCH_PATHS = ORIGINAL_PUBLIC;
});

// Cutoff used for these tests is 24h (script default). "Old" rows are
// dated 48h ago; "young" rows are dated 1h ago.

describe("R7B-E2E cleanup panel — preview eligibility (assets)", () => {
  it("lists only eligible + bound rows; bound rows carry boundByPermanentAvatar=true; run skips bound + young + non-matching prefix", async () => {
    const eligible = await seedAsset({ namePrefix: "r7b-e2e-elig", ageHours: 48 });
    const bound = await seedAsset({ namePrefix: "r7b-e2e-bound", ageHours: 48 });
    boundAssetIds.add(bound.id);
    const young = await seedAsset({ namePrefix: "r7b-e2e-young", ageHours: 1 });
    const otherPrefix = await seedAsset({ namePrefix: "task-902-other", ageHours: 48 });

    // --- Preview ---
    const previewRes = await fetch(
      `${base}/api/admin/production-assets/r7b-e2e-cleanup/preview`,
    );
    assert.equal(previewRes.status, 200);
    const previewBody = await previewRes.json();
    assert.equal(previewBody.ok, true);
    const candidates: Array<{
      id: string;
      boundByPermanentAvatar: boolean;
      permanentAvatarRefs: number;
    }> = previewBody.candidates;
    const ids = new Set(candidates.map((c) => c.id));

    assert.ok(ids.has(eligible.id), "eligible asset must be listed");
    assert.ok(ids.has(bound.id), "bound asset must be listed");
    assert.equal(
      ids.has(young.id),
      false,
      "too-young asset must NOT be listed",
    );
    assert.equal(
      ids.has(otherPrefix.id),
      false,
      "non-matching-prefix asset must NOT be listed",
    );

    const boundCandidate = candidates.find((c) => c.id === bound.id)!;
    assert.equal(boundCandidate.boundByPermanentAvatar, true);
    assert.equal(boundCandidate.permanentAvatarRefs, 1);
    const eligibleCandidate = candidates.find((c) => c.id === eligible.id)!;
    assert.equal(eligibleCandidate.boundByPermanentAvatar, false);
    assert.equal(eligibleCandidate.permanentAvatarRefs, 0);

    // --- Run ---
    const runRes = await fetch(
      `${base}/api/admin/production-assets/r7b-e2e-cleanup/run`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, hours: 24, prefix: "r7b-e2e" }),
      },
    );
    const runBody = await runRes.json();
    assert.equal(runRes.status, 200);
    assert.equal(runBody.ok, true);
    assert.ok(
      runBody.summary.skippedReferenced >= 1,
      "summary must record at least one bound row skipped",
    );
    assert.ok(
      runBody.summary.deleted >= 1,
      "summary must record at least one row deleted",
    );

    // Eligible row deleted, bound + young + other rows preserved.
    const [eligibleRow] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, eligible.id))
      .limit(1);
    assert.equal(eligibleRow, undefined, "eligible asset should be deleted");

    const [boundRow] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, bound.id))
      .limit(1);
    assert.ok(boundRow, "bound asset row must be preserved");
    assert.notEqual(boundRow.status, "archived", "bound row must not be archived");

    const [youngRow] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, young.id))
      .limit(1);
    assert.ok(youngRow, "too-young asset row must be preserved");

    const [otherRow] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, otherPrefix.id))
      .limit(1);
    assert.ok(otherRow, "non-matching-prefix asset row must be preserved");
  });
});

describe("R7B-E2E cleanup panel — empty-body run uses script defaults (Task #905)", () => {
  it("POST /run with only {confirm:true} returns the documented 24h cutoff and 'r7b-e2e' prefix (no NaN, no 'undefined%' LIKE)", async () => {
    // Seed one ineligible-but-script-prefix-matching row so we exercise the
    // LIKE clause: it must scan with the default prefix, not 'undefined%'.
    // We pick an asset newer than 24h so it is *not* deleted regardless.
    const young = await seedAsset({ namePrefix: "r7b-e2e-defaults", ageHours: 1 });

    for (const kind of ["production-assets", "production-rigs"] as const) {
      const res = await fetch(`${base}/api/admin/${kind}/r7b-e2e-cleanup/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      assert.equal(res.status, 200, `${kind} run must succeed`);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.hours, 24, `${kind} must fall back to 24h cutoff`);
      assert.equal(body.prefix, "r7b-e2e", `${kind} must fall back to 'r7b-e2e' prefix`);
      // cutoff must be a valid ISO timestamp, NOT 'Invalid Date'.
      assert.ok(
        !Number.isNaN(Date.parse(body.cutoff)),
        `${kind} cutoff must be a valid ISO timestamp (got ${body.cutoff})`,
      );
    }

    // Young, prefix-matching asset must still exist — proves the LIKE clause
    // used the real prefix (matched it) and the cutoff was a real 24h window
    // (excluded it), not NaN (which would have excluded everything).
    const [stillThere] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, young.id))
      .limit(1);
    assert.ok(stillThere, "young prefix-matching asset must be preserved");
  });
});

describe("R7B-E2E cleanup panel — preview eligibility (rigs)", () => {
  it("lists only eligible + bound rows; bound rows carry boundByPermanentAvatar=true; run skips bound + young + non-matching prefix", async () => {
    const eligible = await seedRig({ namePrefix: "r7b-e2e-elig", ageHours: 48 });
    const bound = await seedRig({ namePrefix: "r7b-e2e-bound", ageHours: 48 });
    boundRigIds.add(bound.id);
    const young = await seedRig({ namePrefix: "r7b-e2e-young", ageHours: 1 });
    const otherPrefix = await seedRig({ namePrefix: "task-902-other", ageHours: 48 });

    const previewRes = await fetch(
      `${base}/api/admin/production-rigs/r7b-e2e-cleanup/preview`,
    );
    assert.equal(previewRes.status, 200);
    const previewBody = await previewRes.json();
    assert.equal(previewBody.ok, true);
    const candidates: Array<{
      id: string;
      boundByPermanentAvatar: boolean;
      permanentAvatarRefs: number;
    }> = previewBody.candidates;
    const ids = new Set(candidates.map((c) => c.id));

    assert.ok(ids.has(eligible.id), "eligible rig must be listed");
    assert.ok(ids.has(bound.id), "bound rig must be listed");
    assert.equal(ids.has(young.id), false, "too-young rig must NOT be listed");
    assert.equal(
      ids.has(otherPrefix.id),
      false,
      "non-matching-prefix rig must NOT be listed",
    );

    const boundCandidate = candidates.find((c) => c.id === bound.id)!;
    assert.equal(boundCandidate.boundByPermanentAvatar, true);
    assert.equal(boundCandidate.permanentAvatarRefs, 1);
    const eligibleCandidate = candidates.find((c) => c.id === eligible.id)!;
    assert.equal(eligibleCandidate.boundByPermanentAvatar, false);
    assert.equal(eligibleCandidate.permanentAvatarRefs, 0);

    const runRes = await fetch(
      `${base}/api/admin/production-rigs/r7b-e2e-cleanup/run`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, hours: 24, prefix: "r7b-e2e" }),
      },
    );
    assert.equal(runRes.status, 200);
    const runBody = await runRes.json();
    assert.equal(runBody.ok, true);
    assert.ok(
      runBody.summary.skippedReferenced >= 1,
      "summary must record at least one bound rig skipped",
    );
    assert.ok(
      runBody.summary.deleted >= 1,
      "summary must record at least one rig deleted",
    );

    const [eligibleRow] = await db
      .select()
      .from(productionRigs)
      .where(eq(productionRigs.id, eligible.id))
      .limit(1);
    assert.equal(eligibleRow, undefined, "eligible rig should be deleted");

    const [boundRow] = await db
      .select()
      .from(productionRigs)
      .where(eq(productionRigs.id, bound.id))
      .limit(1);
    assert.ok(boundRow, "bound rig row must be preserved");
    assert.notEqual(boundRow.status, "archived", "bound row must not be archived");

    const [youngRow] = await db
      .select()
      .from(productionRigs)
      .where(eq(productionRigs.id, young.id))
      .limit(1);
    assert.ok(youngRow, "too-young rig row must be preserved");

    const [otherRow] = await db
      .select()
      .from(productionRigs)
      .where(eq(productionRigs.id, otherPrefix.id))
      .limit(1);
    assert.ok(otherRow, "non-matching-prefix rig row must be preserved");
  });
});
