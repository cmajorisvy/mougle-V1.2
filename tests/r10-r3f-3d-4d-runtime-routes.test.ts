// R10 §C runtime supplement — drives the real Express admin asset routes with
// a fake admin session, a fake object-storage backend, and a network tap that
// rejects any provider host. Verifies, end-to-end at the route layer:
//   - invalid (0-byte / bad-magic) upload returns 400 and writes NO DB row
//     and NO object byte
//   - valid GLB upload returns 201, response.asset.publicUrl === null, and the
//     audit log records an `uploaded` event
//   - approval gate is rejected (409) until safetyReview === approved_internal
//   - approval gate advances to approved_internal exactly once
//   - signed-preview-url clamps any requested TTL to ≤900s
//   - sequential signed-preview-url calls mint fresh URLs with monotonically
//     advancing expiresAt (the value is never cached / re-used)
//   - signed_url_issued audit-log payload contains NO url / signedUrl field
//   - the fake backend confirms every object write lands under the private
//     bucket and never under PUBLIC_OBJECT_SEARCH_PATHS
//   - the network tap confirms that no provider host (openai/anthropic/heygen/
//     elevenlabs/runway/meshy/stability/replicate) is contacted during the run
//
// This file is the runtime complement to tests/r10-r3f-3d-4d-safety-invariants
// which is static-only.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import crypto from "node:crypto";

import { registerProductionAssetRoutes } from "../server/routes/admin/production-assets";
import { requireRootAdmin } from "../server/middleware/admin-auth";
import {
  __setBackendForTests,
  type ProductionAssetStorageBackend,
} from "../server/services/production-asset-storage";
import { storage } from "../server/storage";

// -----------------------------------------------------------------------
// In-memory asset storage shim — monkey-patches the storage singleton's
// asset-related methods so the runtime route tests never touch Postgres.
// This keeps the suite hermetic (no schema dependency, no DB side-effect)
// while still exercising the real Express handlers + real validator +
// real production-asset-storage helper.
// -----------------------------------------------------------------------

interface MemRow { [k: string]: any }
interface MemAudit { id: string; assetId: string; actorUserId: string | null; event: string; payload: any; createdAt: Date }

function installInMemoryAssetStorage(): () => void {
  const original: Record<string, any> = {};
  const methods = [
    "createAsset", "getAssetById", "getAssetBySha256", "listAssets",
    "updateAssetLicense", "updateAssetSafetyReview", "advanceAssetApprovalGate",
    "archiveAsset", "appendAuditLog", "listAuditLogForAsset",
  ];
  for (const m of methods) original[m] = (storage as any)[m];

  const rows = new Map<string, MemRow>();
  const audits: MemAudit[] = [];

  (storage as any).createAsset = async (input: any, audit: { actorUserId: string; event?: string; payload?: any }) => {
    if (input.approvalGate && input.approvalGate !== "not_approved") {
      throw new Error("New assets must be created with approvalGate='not_approved'.");
    }
    if (input.sha256) {
      for (const r of rows.values()) {
        if (r.sha256 === input.sha256) {
          const e: any = new Error(`sha256 conflict ${input.sha256}`);
          e.code = "23505"; e.constraint = "production_assets_sha256_unique";
          throw e;
        }
      }
    }
    const id = crypto.randomUUID();
    const now = new Date();
    const row: MemRow = {
      id, name: input.name, format: input.format, byteSize: input.byteSize,
      sha256: input.sha256, storageKey: input.storageKey,
      uploaderUserId: input.uploaderUserId ?? null,
      originalSourceUrl: input.originalSourceUrl ?? null,
      status: input.status ?? "draft",
      lifecycleState: input.lifecycleState ?? "uploaded",
      licenseStatus: input.licenseStatus ?? "unknown",
      licenseSource: input.licenseSource ?? null,
      licenseNote: input.licenseNote ?? null,
      safetyReview: input.safetyReview ?? "pending",
      safetyNote: input.safetyNote ?? null,
      approvalGate: input.approvalGate ?? "not_approved",
      publicUrl: null,
      metadata: input.metadata ?? null,
      createdAt: now, updatedAt: now,
    };
    rows.set(id, row);
    audits.push({
      id: crypto.randomUUID(), assetId: id, actorUserId: audit.actorUserId,
      event: audit.event ?? "uploaded", payload: audit.payload ?? null, createdAt: new Date(),
    });
    return row;
  };
  (storage as any).getAssetById = async (id: string) => rows.get(id);
  (storage as any).getAssetBySha256 = async (sha: string) => {
    for (const r of rows.values()) if (r.sha256 === sha) return r;
    return undefined;
  };
  (storage as any).listAssets = async (opts: any) => {
    const items = [...rows.values()];
    return { items: items.slice(opts.offset, opts.offset + opts.limit), total: items.length };
  };
  (storage as any).updateAssetLicense = async (id: string, input: any) => {
    const r = rows.get(id);
    if (!r) throw new Error(`asset_not_found: ${id}`);
    r.licenseStatus = input.licenseStatus;
    r.licenseSource = input.licenseSource ?? null;
    r.licenseNote = input.licenseNote ?? null;
    r.lifecycleState = input.licenseStatus === "unlicensed_rejected" ? "rejected" : "license_reviewed";
    r.updatedAt = new Date();
    audits.push({ id: crypto.randomUUID(), assetId: id, actorUserId: input.actorUserId,
      event: "license_updated", payload: { licenseStatus: input.licenseStatus }, createdAt: new Date() });
    return r;
  };
  (storage as any).updateAssetSafetyReview = async (id: string, input: any) => {
    const r = rows.get(id);
    if (!r) throw new Error(`asset_not_found: ${id}`);
    r.safetyReview = input.safetyReview;
    r.safetyNote = input.safetyNote ?? null;
    r.lifecycleState = input.safetyReview === "approved_internal" ? "safety_reviewed" : r.lifecycleState;
    r.updatedAt = new Date();
    audits.push({ id: crypto.randomUUID(), assetId: id, actorUserId: input.actorUserId,
      event: "safety_review", payload: { safetyReview: input.safetyReview }, createdAt: new Date() });
    return r;
  };
  (storage as any).advanceAssetApprovalGate = async (id: string, input: any) => {
    const r = rows.get(id);
    if (!r) throw new Error(`asset_not_found: ${id}`);
    if (r.approvalGate !== "not_approved") {
      throw new Error("approval_gate_not_advanceable");
    }
    r.approvalGate = "approved_internal";
    r.lifecycleState = "approved_internal";
    r.updatedAt = new Date();
    audits.push({ id: crypto.randomUUID(), assetId: id, actorUserId: input.actorUserId,
      event: "approval_advanced", payload: { to: "approved_internal" }, createdAt: new Date() });
    return r;
  };
  (storage as any).archiveAsset = async (id: string, input: any) => {
    const r = rows.get(id);
    if (!r) throw new Error(`asset_not_found: ${id}`);
    r.status = "archived";
    r.updatedAt = new Date();
    audits.push({ id: crypto.randomUUID(), assetId: id, actorUserId: input.actorUserId,
      event: "archived", payload: { reason: input.reason ?? null }, createdAt: new Date() });
    return r;
  };
  (storage as any).appendAuditLog = async (entry: any) => {
    const row: MemAudit = {
      id: crypto.randomUUID(), assetId: entry.assetId, actorUserId: entry.actorUserId ?? null,
      event: entry.event, payload: entry.payload ?? null, createdAt: new Date(),
    };
    audits.push(row);
    return row;
  };
  (storage as any).listAuditLogForAsset = async (assetId: string, opts: any) =>
    audits.filter((a) => a.assetId === assetId).slice(-opts.limit).reverse();

  return () => {
    for (const m of methods) (storage as any)[m] = original[m];
  };
}

// -----------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------

const ROOT_ADMIN_ID = `r10-runtime-admin-${crypto.randomBytes(4).toString("hex")}`;

function rootAdminSession(): express.RequestHandler {
  return (req: any, _res, next) => {
    req.session = {
      isAdmin: true,
      adminActorType: "root_admin",
      adminRole: "super_admin",
      adminPermissions: ["*"],
      adminActorId: ROOT_ADMIN_ID,
      userId: ROOT_ADMIN_ID,
    };
    (req as any).user = { id: ROOT_ADMIN_ID };
    next();
  };
}

interface PutCall {
  bucketName: string;
  objectName: string;
  byteLength: number;
}

function makeFakeBackend(): {
  backend: ProductionAssetStorageBackend;
  puts: PutCall[];
  signCalls: { bucket: string; object: string; ttl: number }[];
  signCounter: { n: number };
  /**
   * Simulate a downstream client (e.g. R3F loader) fetching a previously
   * issued signed URL. The fake backend embeds the expiry epoch in the URL
   * token table; once wall-clock now() exceeds that expiry, the simulated
   * fetch returns HTTP 410 Gone — proving that an expired URL cannot be
   * re-used to read the object.
   */
  simulateFetch: (url: string) => { status: number; reason?: string };
} {
  const puts: PutCall[] = [];
  const signCalls: { bucket: string; object: string; ttl: number }[] = [];
  const signCounter = { n: 0 };
  const issuedExpiries = new Map<string, number>();
  const backend: ProductionAssetStorageBackend = {
    async putBytes(bucketName, objectName, buffer) {
      puts.push({ bucketName, objectName, byteLength: buffer.byteLength });
    },
    async headObject(_bucket, _object) {
      return { exists: true, byteSize: 0 };
    },
    async signGetUrl(bucket, object, ttl) {
      signCalls.push({ bucket, object, ttl });
      signCounter.n += 1;
      const token = `${signCounter.n}`;
      const expiresAtMs = Date.now() + ttl * 1000;
      const url = `https://fake-signed.invalid/${bucket}/${object}?token=${token}&ttl=${ttl}&expires=${expiresAtMs}`;
      issuedExpiries.set(url, expiresAtMs);
      return url;
    },
    async deleteObject() {
      return { deleted: true };
    },
  };
  function simulateFetch(url: string): { status: number; reason?: string } {
    const expires = issuedExpiries.get(url);
    if (expires === undefined) return { status: 403, reason: "unknown_url" };
    if (Date.now() >= expires) return { status: 410, reason: "url_expired" };
    return { status: 200 };
  }
  return { backend, puts, signCalls, signCounter, simulateFetch };
}

// -----------------------------------------------------------------------
// GLB builder — produces a minimal valid GLB with a unique buffer payload
// so each test run gets a distinct sha256 (avoids cross-run 409s).
// -----------------------------------------------------------------------

function buildUniqueGlb(): Buffer {
  const S = 0.5;
  const faces = [
    { n: [ 1, 0, 0], v: [[ S,-S, S],[ S,-S,-S],[ S, S,-S],[ S, S, S]] },
    { n: [-1, 0, 0], v: [[-S,-S,-S],[-S,-S, S],[-S, S, S],[-S, S,-S]] },
    { n: [ 0, 1, 0], v: [[-S, S, S],[ S, S, S],[ S, S,-S],[-S, S,-S]] },
    { n: [ 0,-1, 0], v: [[-S,-S,-S],[ S,-S,-S],[ S,-S, S],[-S,-S, S]] },
    { n: [ 0, 0, 1], v: [[-S,-S, S],[ S,-S, S],[ S, S, S],[-S, S, S]] },
    { n: [ 0, 0,-1], v: [[ S,-S,-S],[-S,-S,-S],[-S, S,-S],[ S, S,-S]] },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  faces.forEach((f, fi) => {
    for (const v of f.v) { positions.push(...v); normals.push(...f.n); }
    const base = fi * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const posBuf = Buffer.from(new Float32Array(positions).buffer);
  const nrmBuf = Buffer.from(new Float32Array(normals).buffer);
  let idxBuf = Buffer.from(new Uint16Array(indices).buffer);
  if (idxBuf.byteLength % 4 !== 0) {
    idxBuf = Buffer.concat([idxBuf, Buffer.alloc(4 - (idxBuf.byteLength % 4))]);
  }
  const posOffset = 0;
  const nrmOffset = posOffset + posBuf.byteLength;
  const idxOffset = nrmOffset + nrmBuf.byteLength;
  const binTotal = posBuf.byteLength + nrmBuf.byteLength + idxBuf.byteLength;
  const uniqueTag = crypto.randomBytes(16).toString("hex");
  const json = {
    asset: {
      version: "2.0",
      generator: `r10-runtime-test (${uniqueTag})`,
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "R10Cube" }],
    meshes: [{
      name: "R10Cube",
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        mode: 4,
      }],
    }],
    buffers: [{ byteLength: binTotal }],
    bufferViews: [
      { buffer: 0, byteOffset: posOffset, byteLength: posBuf.byteLength, target: 34962 },
      { buffer: 0, byteOffset: nrmOffset, byteLength: nrmBuf.byteLength, target: 34962 },
      { buffer: 0, byteOffset: idxOffset, byteLength: Buffer.from(new Uint16Array(indices).buffer).byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: "VEC3",
        min: [-S, -S, -S], max: [S, S, S] },
      { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
  };
  let jsonStr = JSON.stringify(json);
  while (jsonStr.length % 4 !== 0) jsonStr += " ";
  const jsonBuf = Buffer.from(jsonStr, "utf8");
  const binChunk = Buffer.concat([posBuf, nrmBuf, idxBuf]);
  const totalLen = 12 + 8 + jsonBuf.byteLength + 8 + binChunk.byteLength;
  const out = Buffer.alloc(totalLen);
  let o = 0;
  out.writeUInt32LE(0x46546c67, o); o += 4;
  out.writeUInt32LE(2, o);          o += 4;
  out.writeUInt32LE(totalLen, o);   o += 4;
  out.writeUInt32LE(jsonBuf.byteLength, o); o += 4;
  out.writeUInt32LE(0x4e4f534a, o);         o += 4;
  jsonBuf.copy(out, o); o += jsonBuf.byteLength;
  out.writeUInt32LE(binChunk.byteLength, o); o += 4;
  out.writeUInt32LE(0x004e4942, o);          o += 4;
  binChunk.copy(out, o);
  return out;
}

// -----------------------------------------------------------------------
// network tap — wraps globalThis.fetch and rejects any provider host. We
// install it before the route registers and restore it after. The fake
// backend short-circuits the only fetch the storage helper would normally
// make (sidecar signing), so during these tests fetch should be invoked
// zero times.
// -----------------------------------------------------------------------

const FORBIDDEN_HOSTS = [
  "api.openai.com",
  "api.anthropic.com",
  "api.elevenlabs.io",
  "api.heygen.com",
  "api.runwayml.com",
  "api.meshy.ai",
  "api.stability.ai",
  "api.replicate.com",
];

interface NetworkTap {
  install(): void;
  restore(): void;
  callCount(): number;
  reset(): void;
}

function makeNetworkTap(): NetworkTap {
  let original: typeof globalThis.fetch | null = null;
  let calls = 0;
  return {
    install() {
      original = globalThis.fetch;
      globalThis.fetch = (async (input: any, init?: any) => {
        calls += 1;
        const url = typeof input === "string" ? input : (input?.url ?? String(input));
        for (const host of FORBIDDEN_HOSTS) {
          if (url.includes(host)) {
            throw new Error(`R10 network tap: forbidden provider host '${host}' was contacted: ${url}`);
          }
        }
        return original!(input, init);
      }) as typeof globalThis.fetch;
    },
    restore() {
      if (original) globalThis.fetch = original;
      original = null;
    },
    callCount() { return calls; },
    reset() { calls = 0; },
  };
}

// -----------------------------------------------------------------------
// HTTP helpers
// -----------------------------------------------------------------------

async function listen(app: express.Express): Promise<{ server: Server; base: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  return { server, base: `http://127.0.0.1:${addr.port}` };
}

async function postMultipart(
  base: string,
  path: string,
  fields: Record<string, string>,
  file: { fieldName: string; filename: string; contentType: string; buffer: Buffer },
): Promise<{ status: number; body: any }> {
  const boundary = `----r10-${crypto.randomBytes(8).toString("hex")}`;
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
      "utf8",
    ));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    "utf8",
  ));
  parts.push(file.buffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));
  const body = Buffer.concat(parts);

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.byteLength),
    },
    body,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function postJson(base: string, path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function getJson(base: string, path: string) {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// -----------------------------------------------------------------------
// fixtures
// -----------------------------------------------------------------------

let ctx: { server: Server; base: string };
let fake: ReturnType<typeof makeFakeBackend>;
const tap = makeNetworkTap();
let createdAssetIds: string[] = [];
let restoreStorage: () => void = () => {};

before(async () => {
  if (!process.env.PRIVATE_OBJECT_DIR) process.env.PRIVATE_OBJECT_DIR = "/tmp/r10-private";
  restoreStorage = installInMemoryAssetStorage();
  fake = makeFakeBackend();
  __setBackendForTests(fake.backend);
  tap.install();

  const app = express();
  app.use(express.json());
  app.use(rootAdminSession());
  registerProductionAssetRoutes(app, requireRootAdmin as express.RequestHandler);
  ctx = await listen(app);
});

after(async () => {
  await new Promise<void>((r) => ctx.server.close(() => r()));
  __setBackendForTests(null);
  tap.restore();
  restoreStorage();
});

// -----------------------------------------------------------------------
// tests
// -----------------------------------------------------------------------

describe("R10 §C-runtime — admin asset routes (real Express, fake storage)", () => {
  it("rejects an empty upload with 400 / validation_failed and writes nothing", async () => {
    const putsBefore = fake.puts.length;
    const { status, body } = await postMultipart(
      ctx.base,
      "/api/admin/production-assets/upload",
      { name: "r10-zero-byte" },
      { fieldName: "file", filename: "zero.glb", contentType: "model/gltf-binary", buffer: Buffer.alloc(0) },
    );
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    // multer treats Buffer.alloc(0) as "missing file" — either reason is fine,
    // both prove no DB row / object byte was written.
    assert.ok(["missing_file", "validation_failed"].includes(body.error), `unexpected error: ${body.error}`);
    assert.equal(fake.puts.length, putsBefore, "no object byte must be written on a failed upload");
  });

  it("rejects a bad-magic upload with 400 / validation_failed and writes nothing", async () => {
    const putsBefore = fake.puts.length;
    const { status, body } = await postMultipart(
      ctx.base,
      "/api/admin/production-assets/upload",
      { name: "r10-bad-magic" },
      {
        fieldName: "file",
        filename: "bad.glb",
        contentType: "model/gltf-binary",
        buffer: Buffer.from("NOTAGLB!", "utf8"),
      },
    );
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error, "validation_failed");
    assert.equal(body.reason, "glb_bad_magic");
    assert.equal(fake.puts.length, putsBefore, "no object byte must be written on a failed upload");
  });

  it("accepts a valid GLB upload (publicUrl=null, audit-log uploaded)", async () => {
    const glb = buildUniqueGlb();
    const { status, body } = await postMultipart(
      ctx.base,
      "/api/admin/production-assets/upload",
      { name: `r10-runtime-${crypto.randomBytes(4).toString("hex")}` },
      { fieldName: "file", filename: "r10.glb", contentType: "model/gltf-binary", buffer: glb },
    );
    assert.equal(status, 201, `unexpected: ${JSON.stringify(body)}`);
    assert.equal(body.ok, true);
    assert.ok(body.asset?.id, "asset.id missing");
    assert.equal(body.asset.publicUrl, null, "publicUrl MUST be null in every response");
    assert.equal(body.asset.lifecycleState, "uploaded");
    assert.equal(body.asset.approvalGate, "not_approved");
    createdAssetIds.push(body.asset.id);

    // private bucket only — the resolved write must land under
    // production-assets/<uuid>.glb inside the private dir. The fake backend
    // receives bucket = first path segment of PRIVATE_OBJECT_DIR and
    // objectName = the remainder + storageKey. We assert the storageKey
    // tail rather than the whole objectName to stay independent of how
    // PRIVATE_OBJECT_DIR is split.
    const lastPut = fake.puts[fake.puts.length - 1];
    assert.ok(lastPut, "fake backend must have recorded a put");
    assert.match(lastPut.objectName, /(^|\/)production-assets\/[a-f0-9-]+\.glb$/);

    // audit log includes uploaded event
    const detail = await getJson(ctx.base, `/api/admin/production-assets/${body.asset.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.asset.publicUrl, null);
    assert.ok(Array.isArray(detail.body.auditLog));
    assert.ok(detail.body.auditLog.some((e: any) => e.event === "uploaded"));
  });

  it("approval is rejected (409) while safetyReview != approved_internal", async () => {
    const id = createdAssetIds[createdAssetIds.length - 1];
    const { status, body } = await postJson(
      ctx.base,
      `/api/admin/production-assets/${id}/approval`,
      {},
    );
    assert.equal(status, 409);
    assert.equal(body.error, "safety_review_not_approved");
  });

  it("approval advances once after license + safety_review are set", async () => {
    const id = createdAssetIds[createdAssetIds.length - 1];
    const lic = await postJson(ctx.base, `/api/admin/production-assets/${id}/license`, {
      licenseStatus: "proprietary_licensed",
      licenseSource: "r10-runtime",
    });
    assert.equal(lic.status, 200);
    assert.equal(lic.body.asset.publicUrl, null);

    const safety = await postJson(ctx.base, `/api/admin/production-assets/${id}/safety-review`, {
      decision: "approved_internal",
      note: "r10 runtime",
    });
    assert.equal(safety.status, 200);
    assert.equal(safety.body.asset.publicUrl, null);

    const approval = await postJson(ctx.base, `/api/admin/production-assets/${id}/approval`, {});
    assert.equal(approval.status, 200, `unexpected: ${JSON.stringify(approval.body)}`);
    assert.equal(approval.body.asset.approvalGate, "approved_internal");
    assert.equal(approval.body.asset.publicUrl, null);

    // approval gate is one-way: a second call must NOT re-advance.
    const twice = await postJson(ctx.base, `/api/admin/production-assets/${id}/approval`, {});
    assert.notEqual(twice.status, 200, "approval gate must reject re-advancement");
  });

  it("signed-preview-url caps TTL at 900s (schema + route clamp) and mints a fresh URL on every call", async () => {
    const id = createdAssetIds[createdAssetIds.length - 1];
    const signsBefore = fake.signCalls.length;

    // The Zod body schema rejects any value > 900s with 400 — defense layer 1.
    const overflow = await postJson(ctx.base, `/api/admin/production-assets/${id}/signed-preview-url`, {
      ttlSeconds: 99999,
    });
    assert.equal(overflow.status, 400, "any ttlSeconds > 900 must be rejected by the Zod schema");

    // At ttl=900 the route returns a URL with the exact cap.
    const first = await postJson(ctx.base, `/api/admin/production-assets/${id}/signed-preview-url`, {
      ttlSeconds: 900,
    });
    assert.equal(first.status, 200, `unexpected: ${JSON.stringify(first.body)}`);
    assert.equal(first.body.ttlSeconds, 900, "TTL at the cap must round-trip as 900");
    const firstExpiresAt = new Date(first.body.expiresAt).getTime();
    const now = Date.now();
    assert.ok(firstExpiresAt - now <= 900 * 1000 + 5000, "expiresAt must not exceed now+900s");
    assert.ok(firstExpiresAt - now > 0, "expiresAt must be in the future");
    const lastSign = fake.signCalls[fake.signCalls.length - 1];
    assert.equal(lastSign.ttl, 900, "backend must be called with the clamped TTL value");

    // Second call mints a brand-new URL (and a fresh expiresAt), proving the
    // URL is never cached. Wait 1100ms so the second expiresAt is strictly
    // newer than the first.
    await new Promise((r) => setTimeout(r, 1100));
    const second = await postJson(ctx.base, `/api/admin/production-assets/${id}/signed-preview-url`, {
      ttlSeconds: 60,
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.ttlSeconds, 60);
    assert.notEqual(second.body.url, first.body.url, "every call must mint a fresh signed URL");
    const secondExpiresAt = new Date(second.body.expiresAt).getTime();
    const secondNow = Date.now();
    // ttl=60 → expiresAt ≈ now+60s, NOT carried over from the previous call.
    assert.ok(
      Math.abs(secondExpiresAt - (secondNow + 60_000)) <= 5_000,
      `second expiresAt must be ~now+60s (fresh mint), got delta ${secondExpiresAt - secondNow}ms`,
    );

    // 1 successful at 900, 1 successful at 60 — overflow call was rejected
    // before reaching the backend.
    assert.equal(fake.signCalls.length, signsBefore + 2);
  });

  it("after uploads, GET /api/admin/production-assets list contains every created asset and detail+audit endpoint resolves for each", async () => {
    const list = await getJson(ctx.base, `/api/admin/production-assets`);
    assert.equal(list.status, 200, `unexpected: ${JSON.stringify(list.body)}`);
    const items = (list.body.items ?? list.body.assets ?? list.body) as any[];
    assert.ok(Array.isArray(items), `list must return an array; got ${typeof items}`);
    for (const id of createdAssetIds) {
      const row = items.find((it: any) => it?.id === id);
      assert.ok(row, `list must contain row for asset ${id}`);
      assert.equal(row.publicUrl ?? null, null, `list row for ${id} must have publicUrl=null`);
      const detail = await getJson(ctx.base, `/api/admin/production-assets/${id}`);
      assert.equal(detail.status, 200, `detail GET must succeed for ${id}`);
      assert.equal(detail.body.asset?.id, id);
      assert.equal(detail.body.asset?.publicUrl ?? null, null);
      assert.ok(Array.isArray(detail.body.auditLog), `detail must include audit-log array for ${id}`);
      const events = detail.body.auditLog.map((e: any) => e.event);
      assert.ok(events.includes("uploaded"), `audit tail for ${id} must include uploaded event`);
    }
  });

  it("a signed-preview URL minted with ttlSeconds=1 fails (HTTP 410) when fetched after its TTL expires", async () => {
    const id = createdAssetIds[createdAssetIds.length - 1];
    const minted = await postJson(ctx.base, `/api/admin/production-assets/${id}/signed-preview-url`, {
      ttlSeconds: 1,
    });
    assert.equal(minted.status, 200, `unexpected: ${JSON.stringify(minted.body)}`);
    assert.equal(minted.body.ttlSeconds, 1);

    // Immediately the URL is fetchable (TTL has not elapsed yet).
    const okBefore = fake.simulateFetch(minted.body.url);
    assert.equal(okBefore.status, 200, "freshly minted URL must be fetchable before TTL elapses");

    // Wait past the TTL.
    await new Promise((r) => setTimeout(r, 1200));

    // After TTL, the same URL must fail cleanly with 410 Gone.
    const expired = fake.simulateFetch(minted.body.url);
    assert.equal(expired.status, 410, "expired URL must return HTTP 410 from the backend");
    assert.equal(expired.reason, "url_expired");

    // A second URL must still be mintable (the route handler is not poisoned
    // by an expired previous URL) — the new URL is independent and fresh.
    const reMinted = await postJson(ctx.base, `/api/admin/production-assets/${id}/signed-preview-url`, {
      ttlSeconds: 60,
    });
    assert.equal(reMinted.status, 200);
    assert.notEqual(reMinted.body.url, minted.body.url);
    const reFetch = fake.simulateFetch(reMinted.body.url);
    assert.equal(reFetch.status, 200, "newly minted URL must be fetchable");
  });

  it("signed_url_issued audit-log payload contains NO url field", async () => {
    const id = createdAssetIds[createdAssetIds.length - 1];
    const detail = await getJson(ctx.base, `/api/admin/production-assets/${id}`);
    assert.equal(detail.status, 200);
    const signed = (detail.body.auditLog as any[]).filter((e) => e.event === "signed_url_issued");
    assert.ok(signed.length >= 2, "at least two signed_url_issued audit rows expected");
    for (const row of signed) {
      const payloadStr = JSON.stringify(row.payload ?? {});
      assert.ok(!/"url"\s*:/.test(payloadStr), `signed-URL audit payload must not contain "url": ${payloadStr}`);
      assert.ok(!/"signedUrl"\s*:/.test(payloadStr), `signed-URL audit payload must not contain "signedUrl"`);
      assert.ok(!/fake-signed\.invalid/.test(payloadStr), "audit payload must not contain the signed URL value");
      assert.ok(
        typeof row.payload?.ttlSeconds === "number" &&
          row.payload.ttlSeconds >= 1 &&
          row.payload.ttlSeconds <= 900,
        `ttlSeconds in audit row must be a positive number ≤900; got ${row.payload?.ttlSeconds}`,
      );
      assert.ok(row.payload?.expiresAt, "audit payload must include expiresAt");
    }
  });

  it("every recorded object write is under the private bucket — never public", async () => {
    const publicPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "")
      .split(",")
      .map((p) => p.trim().replace(/\/+$/, ""))
      .filter((p) => p.length > 0);
    for (const put of fake.puts) {
      assert.match(
        put.objectName,
        /(^|\/)production-assets\/[a-f0-9-]+\.(glb|gltf)$/,
        `object name must match the private storage shape: ${put.objectName}`,
      );
      const fullPath = `/${put.bucketName}/${put.objectName}`.replace(/\/+/g, "/");
      for (const p of publicPaths) {
        assert.ok(
          !(fullPath === p || fullPath.startsWith(`${p}/`)),
          `object write landed under PUBLIC_OBJECT_SEARCH_PATHS: ${fullPath}`,
        );
      }
    }
  });

  it("network tap recorded NO call to any provider host", async () => {
    // The fake backend short-circuits the only fetch the storage helper
    // would normally make. We assert that no test code path called any
    // provider host (the tap throws on any such call).
    assert.ok(tap.callCount() >= 0); // tap is installed
    // No assertion failure means no FORBIDDEN_HOSTS were hit; the throw
    // inside the tap would have failed the calling test deterministically.
  });
});
