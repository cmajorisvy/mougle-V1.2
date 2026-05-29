/**
 * R5H — Admin Production Assets (3D Asset Library) routes.
 *
 * SAFETY (R5C plan §9):
 *  - All routes require root admin (`requireRootAdmin`). Non-admin callers
 *    receive 403 (or 401 if unauthenticated). CSRF is enforced globally on
 *    `/api/*` by `server/index.ts`.
 *  - No route sets, advances past, or returns a non-null `publicUrl`. The
 *    field is always serialized as `null`.
 *  - The R5E GLB/GLTF validator runs BEFORE any DB row is created and
 *    BEFORE any byte is written to object storage. A validator failure
 *    leaves zero side effects.
 *  - Signed preview URLs are ephemeral (TTL clamped to ≤900s) and are
 *    never persisted in the DB; the audit log records only
 *    `{ adminUserId, ttlSeconds, expiresAt }` — the URL itself is not
 *    logged.
 *  - No provider calls (OpenAI / Meshy / Runway / etc). URL import uses
 *    raw `fetch` with HTTPS-only, ≤25 MB, content-type allow-list.
 */

import { createHash } from "node:crypto";
import type { Express, RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { storage, ProductionAssetStorageError } from "../../storage";
import type { ProductionAsset, ProductionAssetAuditLog } from "@shared/schema";
import { getAdminVerification } from "../../middleware/admin-auth";
import { validateGlbOrGltf } from "../../services/gltf-validator";
import {
  putAssetBytes,
  issueSignedPreviewUrl,
  deleteAssetBytes,
} from "../../services/production-asset-storage";
import {
  previewAssetCleanup,
  runAssetCleanup,
  CLEANUP_DEFAULT_HOURS,
  CLEANUP_DEFAULT_PREFIX,
} from "../../../scripts/cleanup-r7b-e2e-seeds";
import {
  productionAssetOrphanAlertService,
  getProductionAssetOrphanSweepFlappingDigestSnooze,
  setProductionAssetOrphanSweepFlappingDigestSnooze,
  listProductionAssetOrphanSweepFlappingDigestSnoozeHistory,
  listFlappingConfigHistory,
  listFlappingConfigHistoryActorStats,
  listFlappingConfigHistoryDailyStats,
  FLAPPING_CONFIG_HISTORY_DAILY_STATS_MAX_WINDOW_DAYS,
  listFlappingAlertDailyStats,
  FLAPPING_ALERT_DAILY_STATS_MAX_WINDOW_DAYS,
  listFlappingAlertsForDay,
  FLAPPING_ALERT_BY_DAY_MAX_LIMIT,
  FLAPPING_ALERT_BY_DAY_DEFAULT_LIMIT,
  type ReconcileAction,
} from "../../services/production-asset-orphan-alert-service";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_SIGNED_URL_TTL = 900;
const URL_IMPORT_TIMEOUT_MS = 30_000;

const IMPORT_CONTENT_TYPE_ALLOW_LIST = new Set<string>([
  "model/gltf-binary",
  "model/gltf+json",
  "application/octet-stream",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

// ---------- Serialization (R5C §9: publicUrl always null) ----------
function serializeAsset(row: ProductionAsset): ProductionAsset & { publicUrl: null } {
  return { ...row, publicUrl: null };
}

function serializeAuditLog(row: ProductionAssetAuditLog) {
  return row;
}

// ---------- Helpers ----------
function getActorUserId(req: any): string {
  const admin = getAdminVerification(req);
  return admin?.actor.id || "env-root-admin";
}

function detectFormatFromName(name: string | undefined | null): "glb" | "gltf" | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.endsWith(".glb")) return "glb";
  if (lower.endsWith(".gltf")) return "gltf";
  return null;
}

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function mapStorageErrorStatus(err: ProductionAssetStorageError): number {
  switch (err.code) {
    case "asset_not_found":
      return 404;
    case "asset_sha256_conflict":
      return 409;
    case "asset_invalid_approval_transition":
      return 409;
    case "asset_not_archived":
      return 409;
    case "asset_invalid_input":
    default:
      return 400;
  }
}

function handleError(res: any, err: unknown, fallback = "internal_error") {
  if (err instanceof ProductionAssetStorageError) {
    res.status(mapStorageErrorStatus(err)).json({
      ok: false,
      error: err.code,
      message: err.message,
    });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ ok: false, error: "invalid_input", message: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ ok: false, error: fallback, message });
}

// ---------- Zod schemas ----------
const licenseHintSchema = z
  .enum([
    "unknown",
    "internal_only",
    "cc0",
    "cc_by",
    "proprietary_licensed",
    "unlicensed_rejected",
  ])
  .optional();

const assetKindSchema = z.enum(["rig", "set_prop"]).optional();

const importBodySchema = z.object({
  url: z.string().url(),
  name: z.string().trim().min(1).max(256),
  licenseHint: licenseHintSchema,
  licenseSource: z.string().max(2048).optional(),
  assetKind: assetKindSchema,
});

const listQuerySchema = z.object({
  status: z.enum(["draft", "active", "archived"]).optional(),
  safetyReview: z.enum(["pending", "approved_internal", "rejected", "needs_changes"]).optional(),
  approvalGate: z.enum(["not_approved", "approved_internal"]).optional(),
  assetKind: z.enum(["rig", "set_prop"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const signedUrlBodySchema = z.object({
  ttlSeconds: z.number().int().min(1).max(MAX_SIGNED_URL_TTL).optional(),
});

const safetyReviewBodySchema = z.object({
  decision: z.enum(["approved_internal", "rejected", "needs_changes"]),
  note: z.string().max(4096).optional(),
});

const licenseBodySchema = z.object({
  licenseStatus: z.enum([
    "unknown",
    "internal_only",
    "cc0",
    "cc_by",
    "proprietary_licensed",
    "unlicensed_rejected",
  ]),
  licenseSource: z.string().max(2048).optional(),
  licenseNote: z.string().max(2048).optional(),
});

const archiveBodySchema = z.object({
  reason: z.string().max(2048).optional(),
});

const assetKindBodySchema = z.object({
  assetKind: z.enum(["rig", "set_prop"]).nullable(),
  reason: z.string().max(2048).optional(),
});

const deleteBodySchema = z.object({
  reason: z.string().trim().min(1).max(2048),
  confirm: z.literal(true),
});

const reconcileBodySchema = z.object({
  action: z.enum(["hard_delete", "relink_object"]),
  reason: z.string().trim().max(2048).optional(),
  confirm: z.literal(true),
  // Task #812 — optional. Only honored on `relink_object`. When set,
  // the server verifies bytes at this new key match the row's
  // sha256/byteSize and then atomically rewrites the row's storageKey.
  newStorageKey: z.string().trim().min(1).max(512).optional(),
});

// Task #795 — bulk hard-delete reconcile.
// Task #802 — bulk relink_object reconcile. Per-row head-probes only,
// no DB writes; useful when many archived rows' bytes have come back
// at once (e.g. after restoring object storage from a snapshot).
const bulkReconcileBodySchema = z.discriminatedUnion("action", [
  z.object({
    ids: z.array(z.string().trim().min(1)).min(1).max(200),
    action: z.literal("hard_delete"),
    reason: z.string().trim().min(1).max(2048),
    confirm: z.literal(true),
  }),
  z.object({
    ids: z.array(z.string().trim().min(1)).min(1).max(200),
    action: z.literal("relink_object"),
    reason: z.string().trim().max(2048).optional(),
    confirm: z.literal(true),
    // Task #818 — per-id map of new storageKeys. Server verifies the
    // bytes at each new key match the row's sha256/byteSize, then
    // atomically rewrites the row + writes an audit-log entry.
    newStorageKeys: z
      .record(z.string().trim().min(1), z.string().trim().min(1).max(512))
      .optional(),
    // Task #818 — shared prefix-rewrite rule. Any row whose current
    // storageKey starts with `from` is re-targeted to
    // `to + key.slice(from.length)`. Per-id entries above win.
    prefixRewrite: z
      .object({
        from: z.string().min(1).max(512),
        to: z.string().max(512),
      })
      .optional(),
  }),
]);

// Task #794 — DB-backed flapping config. Guardrails mirror the bounds in
// `production-asset-orphan-alert-service.ts`.
const sweepFlappingThresholdBodySchema = z.object({
  value: z.number().int().min(2).max(1000),
});

const sweepFlappingWindowMsBodySchema = z.object({
  value: z.number().int().min(60_000).max(90 * 24 * 60 * 60 * 1000),
});

// Task #805 — flapping-digest snooze body. `snoozeUntil:null` clears.
const flappingDigestSnoozeBodySchema = z.object({
  snoozeUntil: z.string().datetime().nullable(),
});

// Task #806 — flapping-banner snooze. Hours are bounded at the policy
// ceiling (24h); the service additionally clamps the resulting deadline.
const sweepFlappingSnoozeBodySchema = z.object({
  hours: z.number().positive().max(24),
  reason: z.string().trim().max(500).optional(),
});

// ---------- URL import fetch (HTTPS only, ≤25 MB, allow-list) ----------
async function fetchAssetFromUrl(url: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("url_must_be_https");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_IMPORT_TIMEOUT_MS);
  try {
    // SECURITY: manual redirect handling — every hop must remain HTTPS.
    // Using redirect:"follow" would allow https → http downgrade / SSRF.
    let currentUrl = url;
    let response: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      const hopParsed = new URL(currentUrl);
      if (hopParsed.protocol !== "https:") {
        throw new Error("url_must_be_https");
      }
      response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`url_fetch_failed_${response.status}`);
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      break;
    }
    if (!response) {
      throw new Error("url_fetch_no_response");
    }
    if (!response.ok) {
      throw new Error(`url_fetch_failed_${response.status}`);
    }
    // Defense-in-depth: confirm the final resolved URL (if exposed) is HTTPS.
    if (response.url && response.url.length > 0) {
      const finalParsed = new URL(response.url);
      if (finalParsed.protocol !== "https:") {
        throw new Error("url_must_be_https");
      }
    }
    const contentType = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!IMPORT_CONTENT_TYPE_ALLOW_LIST.has(contentType)) {
      throw new Error(`unsupported_content_type:${contentType || "unknown"}`);
    }
    const lenHeader = response.headers.get("content-length");
    if (lenHeader) {
      const len = Number.parseInt(lenHeader, 10);
      if (Number.isFinite(len) && len > MAX_UPLOAD_BYTES) {
        throw new Error("url_payload_too_large");
      }
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error("url_payload_too_large");
    }
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } finally {
    clearTimeout(timer);
  }
}

function detectFormatFromContentType(ct: string): "glb" | "gltf" | null {
  if (ct === "model/gltf-binary") return "glb";
  if (ct === "model/gltf+json") return "gltf";
  return null;
}

// ---------- Route registration ----------
export function registerProductionAssetRoutes(
  app: Express,
  requireAdmin: RequestHandler,
): void {
  const BASE = "/api/admin/production-assets";

  // POST /upload — multipart upload
  app.post(
    `${BASE}/upload`,
    requireAdmin,
    upload.single("file"),
    async (req, res) => {
      try {
        const file = (req as any).file as
          | { buffer: Buffer; originalname: string; mimetype: string }
          | undefined;
        if (!file || !Buffer.isBuffer(file.buffer)) {
          return res
            .status(400)
            .json({ ok: false, error: "missing_file", message: "file is required" });
        }
        if (file.buffer.byteLength > MAX_UPLOAD_BYTES) {
          return res
            .status(400)
            .json({ ok: false, error: "payload_too_large", message: "file exceeds 25 MB" });
        }

        const name =
          typeof req.body?.name === "string" && req.body.name.trim().length > 0
            ? req.body.name.trim().slice(0, 256)
            : file.originalname;
        if (!name) {
          return res
            .status(400)
            .json({ ok: false, error: "missing_name", message: "name is required" });
        }

        const format =
          detectFormatFromName(file.originalname) ||
          detectFormatFromName(name) ||
          "glb";

        // R5C §5 / §9: validator runs BEFORE any DB row or object byte.
        const validation = validateGlbOrGltf(file.buffer, { format });
        if (!validation.ok) {
          return res
            .status(400)
            .json({ ok: false, error: "validation_failed", reason: validation.reason });
        }

        const sha256 = sha256Hex(file.buffer);
        const existing = await storage.getAssetBySha256(sha256);
        if (existing) {
          return res
            .status(409)
            .json({
              ok: false,
              error: "asset_sha256_conflict",
              message: `An asset with sha256=${sha256} already exists.`,
              asset: serializeAsset(existing),
            });
        }

        const actorUserId = getActorUserId(req);
        const licenseHint =
          typeof req.body?.licenseHint === "string" ? req.body.licenseHint : undefined;
        const licenseSource =
          typeof req.body?.licenseSource === "string" ? req.body.licenseSource : undefined;
        const rawAssetKind =
          typeof req.body?.assetKind === "string" ? req.body.assetKind : undefined;
        const assetKindParsed = assetKindSchema.safeParse(rawAssetKind);
        const assetKind = assetKindParsed.success ? assetKindParsed.data : undefined;

        // We need an id-derived storage key. Generate via crypto.randomUUID
        // so the byte write can happen BEFORE the DB row exists. If the DB
        // insert later fails (e.g. race on sha256), the orphan object is
        // bounded — but the validator + dedup probe above already minimize
        // that window.
        const assetId = crypto.randomUUID();
        const storageKey = `production-assets/${assetId}.${format}`;

        await putAssetBytes(storageKey, file.buffer);

        const created = await storage.createAsset(
          {
            name,
            format,
            byteSize: file.buffer.byteLength,
            sha256,
            storageKey,
            uploaderUserId: actorUserId,
            licenseStatus: licenseHint ?? undefined,
            licenseSource: licenseSource ?? undefined,
            metadata: {
              ...(validation.metadata as any),
              ...(assetKind ? { assetKind } : {}),
            } as any,
          } as any,
          {
            actorUserId,
            event: "uploaded",
            payload: {
              validator: validation.metadata,
              licenseHint: licenseHint ?? null,
              licenseSource: licenseSource ?? null,
              assetKind: assetKind ?? null,
            },
          },
        );

        return res.status(201).json({ ok: true, asset: serializeAsset(created) });
      } catch (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(400)
            .json({ ok: false, error: "payload_too_large", message: "file exceeds 25 MB" });
        }
        return handleError(res, err, "upload_failed");
      }
    },
  );

  // POST /import-from-url
  app.post(`${BASE}/import-from-url`, requireAdmin, async (req, res) => {
    try {
      const body = importBodySchema.parse(req.body ?? {});

      let fetched;
      try {
        fetched = await fetchAssetFromUrl(body.url);
      } catch (e: any) {
        return res
          .status(400)
          .json({ ok: false, error: "url_import_failed", message: e?.message ?? "fetch failed" });
      }

      const format =
        detectFormatFromContentType(fetched.contentType) ||
        detectFormatFromName(body.url) ||
        detectFormatFromName(body.name) ||
        "glb";

      const validation = validateGlbOrGltf(fetched.buffer, { format });
      if (!validation.ok) {
        return res
          .status(400)
          .json({ ok: false, error: "validation_failed", reason: validation.reason });
      }

      const sha256 = sha256Hex(fetched.buffer);
      const existing = await storage.getAssetBySha256(sha256);
      if (existing) {
        return res.status(409).json({
          ok: false,
          error: "asset_sha256_conflict",
          message: `An asset with sha256=${sha256} already exists.`,
          asset: serializeAsset(existing),
        });
      }

      const actorUserId = getActorUserId(req);
      const assetId = crypto.randomUUID();
      const storageKey = `production-assets/${assetId}.${format}`;

      await putAssetBytes(storageKey, fetched.buffer);

      const created = await storage.createAsset(
        {
          name: body.name,
          format,
          byteSize: fetched.buffer.byteLength,
          sha256,
          storageKey,
          uploaderUserId: actorUserId,
          originalSourceUrl: body.url,
          licenseStatus: body.licenseHint ?? undefined,
          licenseSource: body.licenseSource ?? undefined,
          metadata: {
            ...(validation.metadata as any),
            ...(body.assetKind ? { assetKind: body.assetKind } : {}),
          } as any,
        } as any,
        {
          actorUserId,
          event: "imported",
          payload: {
            validator: validation.metadata,
            originalSourceUrl: body.url,
            licenseHint: body.licenseHint ?? null,
            licenseSource: body.licenseSource ?? null,
            assetKind: body.assetKind ?? null,
          },
        },
      );

      return res.status(201).json({ ok: true, asset: serializeAsset(created) });
    } catch (err) {
      return handleError(res, err, "import_failed");
    }
  });

  // GET / — list
  app.get(BASE, requireAdmin, async (req, res) => {
    try {
      const q = listQuerySchema.parse(req.query ?? {});
      const result = await storage.listAssets({
        status: q.status,
        safetyReview: q.safetyReview,
        approvalGate: q.approvalGate,
        assetKind: q.assetKind,
        limit: q.limit,
        offset: q.offset,
      });
      return res.json({
        ok: true,
        items: result.items.map(serializeAsset),
        total: result.total,
        limit: q.limit,
        offset: q.offset,
      });
    } catch (err) {
      return handleError(res, err, "list_failed");
    }
  });

  // Task #783 — Deletion-snapshot audit timeline.
  // GET /deletions — paged list of deletion snapshots (newest first).
  // Lets admins answer "what was that asset and who approved it?" long
  // after the destructive delete fired. The snapshot row was written
  // atomically inside storage.deleteArchivedAsset BEFORE the cascade.
  // NOTE: Registered BEFORE GET /:id so the literal /deletions path is
  // not shadowed by the dynamic :id matcher.
  app.get(`${BASE}/deletions`, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20),
      );
      const offset = Math.max(
        0,
        Number.parseInt(String(req.query.offset ?? "0"), 10) || 0,
      );
      const result = await storage.listAssetDeletionSnapshots({ limit, offset });
      return res.json({
        ok: true,
        items: result.items,
        total: result.total,
        limit,
        offset,
      });
    } catch (err) {
      return handleError(res, err, "list_deletions_failed");
    }
  });

  // GET /deletions/:assetId — full snapshot for one deleted asset.
  app.get(`${BASE}/deletions/:assetId`, requireAdmin, async (req, res) => {
    try {
      const assetId = String(req.params.assetId || "");
      const snapshot = await storage.getAssetDeletionSnapshotByAssetId(assetId);
      if (!snapshot) {
        return res.status(404).json({
          ok: false,
          error: "deletion_snapshot_not_found",
          message: `No deletion snapshot found for asset ${assetId}.`,
        });
      }
      return res.json({ ok: true, snapshot });
    } catch (err) {
      return handleError(res, err, "get_deletion_snapshot_failed");
    }
  });

  // GET /:id — asset + last 20 audit-log rows
  app.get(`${BASE}/:id`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const asset = await storage.getAssetById(id);
      if (!asset) {
        return res
          .status(404)
          .json({ ok: false, error: "asset_not_found", message: `Asset ${id} not found.` });
      }
      const auditLog = await storage.listAuditLogForAsset(id, { limit: 20 });
      return res.json({
        ok: true,
        asset: serializeAsset(asset),
        auditLog: auditLog.map(serializeAuditLog),
      });
    } catch (err) {
      return handleError(res, err, "get_failed");
    }
  });

  // POST /:id/signed-preview-url
  app.post(`${BASE}/:id/signed-preview-url`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = signedUrlBodySchema.parse(req.body ?? {});
      const requestedTtl = body.ttlSeconds ?? MAX_SIGNED_URL_TTL;
      const ttlSeconds = Math.min(MAX_SIGNED_URL_TTL, Math.max(1, requestedTtl));

      const asset = await storage.getAssetById(id);
      if (!asset) {
        return res
          .status(404)
          .json({ ok: false, error: "asset_not_found", message: `Asset ${id} not found.` });
      }

      const actorUserId = getActorUserId(req);
      const issued = await issueSignedPreviewUrl(asset.storageKey, {
        adminUserId: actorUserId,
        ttlSeconds,
      });

      // R5C §9: only record metadata, never the URL itself.
      await storage.appendAuditLog({
        assetId: id,
        actorUserId,
        event: "signed_url_issued",
        payload: {
          adminUserId: actorUserId,
          ttlSeconds,
          expiresAt: issued.expiresAt.toISOString(),
        } as any,
      });

      return res.json({
        ok: true,
        url: issued.url,
        ttlSeconds,
        expiresAt: issued.expiresAt.toISOString(),
      });
    } catch (err) {
      return handleError(res, err, "signed_url_failed");
    }
  });

  // POST /:id/safety-review
  app.post(`${BASE}/:id/safety-review`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = safetyReviewBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const updated = await storage.updateAssetSafetyReview(id, {
        safetyReview: body.decision,
        safetyNote: body.note ?? null,
        actorUserId,
      });
      return res.json({ ok: true, asset: serializeAsset(updated) });
    } catch (err) {
      return handleError(res, err, "safety_review_failed");
    }
  });

  // POST /:id/license
  app.post(`${BASE}/:id/license`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = licenseBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const updated = await storage.updateAssetLicense(id, {
        licenseStatus: body.licenseStatus,
        licenseSource: body.licenseSource ?? null,
        licenseNote: body.licenseNote ?? null,
        actorUserId,
      });
      return res.json({ ok: true, asset: serializeAsset(updated) });
    } catch (err) {
      return handleError(res, err, "license_update_failed");
    }
  });

  // POST /:id/approval — advances not_approved → approved_internal only.
  // Refuses unless safetyReview is already approved_internal and license is
  // not in an invalid state.
  app.post(`${BASE}/:id/approval`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const actorUserId = getActorUserId(req);
      const asset = await storage.getAssetById(id);
      if (!asset) {
        return res
          .status(404)
          .json({ ok: false, error: "asset_not_found", message: `Asset ${id} not found.` });
      }
      if (asset.safetyReview !== "approved_internal") {
        return res.status(409).json({
          ok: false,
          error: "safety_review_not_approved",
          message:
            "Asset cannot be approved: safetyReview must be 'approved_internal' before advancing the approval gate.",
        });
      }
      if (
        asset.licenseStatus === "unknown" ||
        asset.licenseStatus === "unlicensed_rejected"
      ) {
        return res.status(409).json({
          ok: false,
          error: "license_not_acceptable",
          message: `Asset cannot be approved while licenseStatus is '${asset.licenseStatus}'.`,
        });
      }
      const updated = await storage.advanceAssetApprovalGate(id, { actorUserId });
      return res.json({ ok: true, asset: serializeAsset(updated) });
    } catch (err) {
      return handleError(res, err, "approval_failed");
    }
  });

  // POST /:id/asset-kind — Task #764 backfill/classify legacy rows.
  // Sets metadata.assetKind to "rig" | "set_prop" (or null to clear) on
  // an existing row, atomically writing an `asset_kind_set` audit-log
  // entry. Used to classify rows uploaded before assetKind existed so
  // the rig picker and library filters can surface them.
  app.post(`${BASE}/:id/asset-kind`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = assetKindBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const updated = await storage.updateAssetKind(id, {
        assetKind: body.assetKind,
        actorUserId,
        reason: body.reason,
      });
      return res.json({ ok: true, asset: serializeAsset(updated) });
    } catch (err) {
      return handleError(res, err, "asset_kind_update_failed");
    }
  });

  // POST /:id/archive
  app.post(`${BASE}/:id/archive`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = archiveBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      // R7B: an asset bound by any permanent avatar cannot be archived
      // until the avatar is rebound away. Pre-check returns 409.
      const referencingAvatars =
        await storage.countPermanentAvatarsReferencingAsset(id);
      if (referencingAvatars > 0) {
        return res.status(409).json({
          ok: false,
          error: "asset_referenced_by_permanent_avatar",
          message: `Asset ${id} is bound by ${referencingAvatars} permanent avatar(s); rebind or delete them first.`,
          referencingAvatars,
        });
      }
      const updated = await storage.archiveAsset(id, {
        actorUserId,
        reason: body.reason,
      });
      return res.json({ ok: true, asset: serializeAsset(updated) });
    } catch (err) {
      return handleError(res, err, "archive_failed");
    }
  });

  // DELETE /:id — permanently delete an archived asset
  // (object-storage bytes + DB row + cascade audit-log rows).
  // The deletion itself is recorded to moderation_logs so the trail
  // survives the cascade.
  //
  // Atomicity: object bytes are deleted FIRST. If that fails the DB
  // row is left intact and the route returns 502 so the admin can
  // retry. Only after the bytes are confirmed gone do we delete the
  // DB row + cascade audit-log + write the moderation_logs entry.
  app.delete(`${BASE}/:id`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = deleteBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);

      // Step 1: pre-flight — must exist and be archived. We do this
      // before touching object storage so a non-archived asset cannot
      // have its bytes deleted.
      const asset = await storage.getAssetById(id);
      if (!asset) {
        return res
          .status(404)
          .json({ ok: false, error: "asset_not_found", message: `Asset ${id} not found.` });
      }
      if (asset.status !== "archived") {
        return res.status(409).json({
          ok: false,
          error: "asset_not_archived",
          message: `Asset ${id} cannot be deleted: status='${asset.status}' (must be 'archived').`,
        });
      }

      // Step 2: delete object-storage bytes first.
      let objectDeleted = false;
      try {
        const r = await deleteAssetBytes(asset.storageKey);
        objectDeleted = r.deleted;
      } catch (e: any) {
        return res.status(502).json({
          ok: false,
          error: "object_delete_failed",
          message:
            "Failed to delete object-storage bytes; asset row preserved. Retry the delete.",
          detail: e?.message || String(e),
        });
      }

      // Step 3: delete DB row + cascade audit rows + write moderation log.
      // Re-checks archived state inside the transaction (defense in depth).
      // Task #782: if this throws AFTER step 2 succeeded the row is now
      // orphaned (status=archived but object bytes are gone). Fire the
      // founder alert with the original error context, then surface a
      // dedicated 500 so the admin sees it isn't a normal failure.
      let result: Awaited<ReturnType<typeof storage.deleteArchivedAsset>>;
      try {
        result = await storage.deleteArchivedAsset(id, {
          actorUserId,
          reason: body.reason,
        });
      } catch (dbErr) {
        if (objectDeleted) {
          await productionAssetOrphanAlertService.fireOrphanedRowAlert({
            assetId: id,
            storageKey: asset.storageKey,
            actorUserId,
            error: dbErr,
          });
          return res.status(500).json({
            ok: false,
            error: "asset_row_orphaned_after_object_delete",
            message:
              "Object bytes were deleted but the DB row delete failed. A " +
              "founder alert has been fired. Reconcile the row from the " +
              "orphan-reconcile panel.",
            detail: dbErr instanceof Error ? dbErr.message : String(dbErr),
            assetId: id,
          });
        }
        throw dbErr;
      }

      return res.json({
        ok: true,
        deletedAssetId: id,
        deletedAuditRows: result.deletedAuditRows,
        snapshotId: result.snapshotId,
        objectDeleted,
      });
    } catch (err) {
      return handleError(res, err, "delete_failed");
    }
  });

  // POST /orphans/sweep/flapping-threshold — Task #794. Tune the number
  // of auto-clears inside the flapping window that flips the latch.
  app.post(
    `${BASE}/orphans/sweep/flapping-threshold`,
    requireAdmin,
    async (req, res) => {
      try {
        const body = sweepFlappingThresholdBodySchema.parse(req.body ?? {});
        const actorUserId = getActorUserId(req);
        const value =
          await productionAssetOrphanAlertService.setSweepFlappingThreshold(
            body.value,
            actorUserId,
          );
        const status = await productionAssetOrphanAlertService.getSweepStatus();
        return res.json({ ok: true, value, status });
      } catch (err) {
        if (err instanceof Error && err.message === "invalid_flapping_threshold") {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_flapping_threshold" });
        }
        return handleError(res, err, "sweep_flapping_threshold_failed");
      }
    },
  );

  // POST /orphans/sweep/flapping-window-ms — Task #794. Tune how far back
  // the flapping latch counts auto-clears.
  app.post(
    `${BASE}/orphans/sweep/flapping-window-ms`,
    requireAdmin,
    async (req, res) => {
      try {
        const body = sweepFlappingWindowMsBodySchema.parse(req.body ?? {});
        const actorUserId = getActorUserId(req);
        const value =
          await productionAssetOrphanAlertService.setSweepFlappingWindowMs(
            body.value,
            actorUserId,
          );
        const status = await productionAssetOrphanAlertService.getSweepStatus();
        return res.json({ ok: true, value, status });
      } catch (err) {
        if (err instanceof Error && err.message === "invalid_flapping_window_ms") {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_flapping_window_ms" });
        }
        return handleError(res, err, "sweep_flapping_window_ms_failed");
      }
    },
  );

  // Task #805 — flapping-digest snooze. Mirrors the audit-email failure
  // alert snooze pattern (Task #560/613): persisted in `system_settings`
  // with a 90-day cap and an append-only history table.
  app.get(
    `${BASE}/orphans/sweep/flapping-digest/snooze`,
    requireAdmin,
    async (_req, res) => {
      try {
        const [snooze, history] = await Promise.all([
          getProductionAssetOrphanSweepFlappingDigestSnooze(),
          listProductionAssetOrphanSweepFlappingDigestSnoozeHistory(10),
        ]);
        return res.json({ ok: true, snooze, history });
      } catch (err) {
        return handleError(res, err, "flapping_digest_snooze_get_failed");
      }
    },
  );

  app.post(
    `${BASE}/orphans/sweep/flapping-digest/snooze`,
    requireAdmin,
    async (req, res) => {
      try {
        const body = flappingDigestSnoozeBodySchema.parse(req.body ?? {});
        const actorUserId = getActorUserId(req);
        const snooze = await setProductionAssetOrphanSweepFlappingDigestSnooze({
          snoozeUntil: body.snoozeUntil,
          updatedBy: actorUserId,
        });
        const history =
          await listProductionAssetOrphanSweepFlappingDigestSnoozeHistory(10);
        return res.json({ ok: true, snooze, history });
      } catch (err) {
        if (err instanceof Error) {
          const msg = err.message || "";
          if (
            msg === "invalid snoozeUntil timestamp" ||
            msg === "snoozeUntil must be in the future"
          ) {
            return res.status(400).json({
              ok: false,
              error: "invalid_snooze_until",
              message: msg,
            });
          }
        }
        return handleError(res, err, "flapping_digest_snooze_set_failed");
      }
    },
  );

  // POST /orphan-sweep/flapping-snooze — Task #806. Snooze the
  // flapping banner for a bounded window (≤24h). Each action is
  // audit-logged into production_asset_orphan_sweep_flapping_snoozes.
  app.post(
    `${BASE}/orphan-sweep/flapping-snooze`,
    requireAdmin,
    async (req, res) => {
      try {
        const body = sweepFlappingSnoozeBodySchema.parse(req.body ?? {});
        const actorUserId = getActorUserId(req);
        const untilMs =
          Date.now() + Math.floor(body.hours * 60 * 60 * 1000);
        const effective =
          await productionAssetOrphanAlertService.setFlappingSnooze({
            untilMs,
            updatedBy: actorUserId,
            reason: body.reason ?? null,
          });
        const status = await productionAssetOrphanAlertService.getSweepStatus();
        return res.json({ ok: true, snoozeUntil: effective, status });
      } catch (err) {
        if (err instanceof Error && err.message === "invalid_snooze_until") {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_snooze_until" });
        }
        return handleError(res, err, "flapping_snooze_failed");
      }
    },
  );

  // POST /orphan-sweep/flapping-unsnooze — Task #806. Founder cancels
  // an active snooze (or no-ops when no snooze is set).
  app.post(
    `${BASE}/orphan-sweep/flapping-unsnooze`,
    requireAdmin,
    async (req, res) => {
      try {
        const actorUserId = getActorUserId(req);
        await productionAssetOrphanAlertService.clearFlappingSnooze(
          actorUserId,
        );
        const status = await productionAssetOrphanAlertService.getSweepStatus();
        return res.json({ ok: true, status });
      } catch (err) {
        return handleError(res, err, "flapping_unsnooze_failed");
      }
    },
  );

  // GET /orphan-sweep/flapping-snooze-log — Task #806 (extended by
  // Task #829). Recent snooze actions (newest first), filterable by
  // date range + actor, with offset pagination. Used by the admin UI
  // for the audit trail.
  app.get(
    `${BASE}/orphan-sweep/flapping-snooze-log`,
    requireAdmin,
    async (req, res) => {
      try {
        const parsed = z
          .object({
            limit: z.coerce.number().int().min(1).max(200).optional(),
            offset: z.coerce.number().int().min(0).optional(),
            actor: z.string().trim().min(1).max(256).optional(),
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
          })
          .safeParse(req.query ?? {});
        if (!parsed.success) {
          return res.status(400).json({
            ok: false,
            error: "invalid_query",
            message: parsed.error.message,
          });
        }
        const q = parsed.data;
        const from = q.from ? new Date(q.from) : null;
        const to = q.to ? new Date(q.to) : null;
        const result =
          await productionAssetOrphanAlertService.listFlappingSnoozeLog({
            limit: q.limit ?? 20,
            offset: q.offset ?? 0,
            actor: q.actor ?? null,
            from,
            to,
          });
        return res.json({
          ok: true,
          entries: result.entries,
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        });
      } catch (err) {
        return handleError(res, err, "flapping_snooze_log_failed");
      }
    },
  );

  // GET /orphans/sweep/flapping-config/history — Task #810. Recent changes
  // to the flapping threshold / window settings so founders can see at a
  // glance whether the values were recently tuned (and by whom).
  app.get(
    `${BASE}/orphans/sweep/flapping-config/history`,
    requireAdmin,
    async (req, res) => {
      try {
        const parsed = z
          .object({
            limit: z.coerce.number().int().min(1).max(100).optional(),
            offset: z.coerce.number().int().min(0).max(100_000).optional(),
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
            actorUserId: z.string().trim().min(1).max(128).optional(),
          })
          .safeParse(req.query ?? {});
        if (!parsed.success) {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_history_filters" });
        }
        const limit = parsed.data.limit ?? 10;
        const offset = parsed.data.offset ?? 0;
        const from = parsed.data.from ? new Date(parsed.data.from) : null;
        const to = parsed.data.to ? new Date(parsed.data.to) : null;
        const actorUserId = parsed.data.actorUserId ?? null;
        const { items, total } =
          await productionAssetOrphanAlertService.listFlappingConfigChanges({
            limit,
            offset,
            from,
            to,
            actorUserId,
          });
        return res.json({ ok: true, items, total, limit, offset });
      } catch (err) {
        return handleError(res, err, "sweep_flapping_config_history_failed");
      }
    },
  );

  // GET /orphans/sweep/flapping/config-history — Task #839. Newest-first
  // audit trail from the Task #825 durable history table — surfaces who
  // changed the flapping-alert threshold/window and the before→after
  // snapshots. Limit is bounded server-side (1..50).
  app.get(
    `${BASE}/orphans/sweep/flapping/config-history`,
    requireAdmin,
    async (req, res) => {
      try {
        const parsed = z
          .object({
            limit: z.coerce.number().int().min(1).max(50).optional(),
            actorUserId: z.string().trim().min(1).max(128).optional(),
          })
          .safeParse(req.query ?? {});
        if (!parsed.success) {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_history_filters" });
        }
        const limit = parsed.data.limit ?? 20;
        const actorUserId = parsed.data.actorUserId ?? null;
        const items = await listFlappingConfigHistory(limit, { actorUserId });
        return res.json({ ok: true, items, limit, actorUserId });
      } catch (err) {
        return handleError(res, err, "flapping_config_history_failed");
      }
    },
  );

  // GET /orphans/sweep/flapping/config-history/actor-stats — Task #848.
  // "Top changers" leaderboard so founders can see at a glance which
  // admin is doing most of the flapping-threshold tuning. Counts come
  // from the same Task #825 history table consumed by the audit card.
  // `windowDays` defaults to 7 and is bounded to 1..90 server-side;
  // `limit` defaults to 5 and is bounded to 1..20.
  app.get(
    `${BASE}/orphans/sweep/flapping/config-history/actor-stats`,
    requireAdmin,
    async (req, res) => {
      try {
        const parsed = z
          .object({
            windowDays: z.coerce.number().int().min(1).max(90).optional(),
            limit: z.coerce.number().int().min(1).max(20).optional(),
          })
          .safeParse(req.query ?? {});
        if (!parsed.success) {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_actor_stats_params" });
        }
        const result = await listFlappingConfigHistoryActorStats(
          parsed.data.windowDays ?? 7,
          parsed.data.limit ?? 5,
        );
        return res.json({ ok: true, ...result });
      } catch (err) {
        return handleError(
          res,
          err,
          "flapping_config_history_actor_stats_failed",
        );
      }
    },
  );

  // GET /orphans/sweep/flapping/config-history/daily-stats — Task #851.
  // Per-day change counts (UTC) over a caller-bounded window so the
  // founder UI can render a small spark/bar chart of WHEN tuning is
  // happening. `windowDays` defaults to 14 and is bounded server-side
  // to 1..90.
  app.get(
    `${BASE}/orphans/sweep/flapping/config-history/daily-stats`,
    requireAdmin,
    async (req, res) => {
      try {
        const parsed = z
          .object({
            windowDays: z.coerce
              .number()
              .int()
              .min(1)
              .max(FLAPPING_CONFIG_HISTORY_DAILY_STATS_MAX_WINDOW_DAYS)
              .optional(),
            timeZone: z.string().trim().min(1).max(64).optional(),
          })
          .safeParse(req.query ?? {});
        if (!parsed.success) {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_daily_stats_params" });
        }
        const result = await listFlappingConfigHistoryDailyStats(
          parsed.data.windowDays ?? 14,
          parsed.data.timeZone,
        );
        return res.json({ ok: true, ...result });
      } catch (err) {
        return handleError(
          res,
          err,
          "flapping_config_history_daily_stats_failed",
        );
      }
    },
  );

  // GET /orphans/sweep/flapping/alerts/daily-stats — Task #858.
  // Per-day flapping alert + digest counts over the same window as the
  // Task #851 config-change daily stats, so the founder UI can overlay
  // alert markers on the changes-per-day chart and visually confirm
  // whether a tuning spike followed an actual alert storm.
  app.get(
    `${BASE}/orphans/sweep/flapping/alerts/daily-stats`,
    requireAdmin,
    async (req, res) => {
      try {
        const parsed = z
          .object({
            windowDays: z.coerce
              .number()
              .int()
              .min(1)
              .max(FLAPPING_ALERT_DAILY_STATS_MAX_WINDOW_DAYS)
              .optional(),
            // Task #877 — Mirror the config-history daily-stats route so
            // the overlay buckets by the SAME founder-chosen calendar
            // day as the underlying changes-per-day series.
            timeZone: z.string().trim().min(1).max(64).optional(),
          })
          .safeParse(req.query ?? {});
        if (!parsed.success) {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_alert_daily_stats_params" });
        }
        const result = await listFlappingAlertDailyStats(
          parsed.data.windowDays ?? 14,
          parsed.data.timeZone,
        );
        return res.json({ ok: true, ...result });
      } catch (err) {
        return handleError(
          res,
          err,
          "flapping_alert_daily_stats_failed",
        );
      }
    },
  );

  // GET /orphans/sweep/flapping/alerts/by-day — Task #861. Returns the
  // raw `platform_alerts` rows of the two flapping types whose
  // `created_at` falls inside the given UTC day, newest-first, so the
  // founder UI can drill into a clicked alert marker and read the
  // actual alert payloads (severity / message / ack state) instead of
  // just the per-day count surfaced by /alerts/daily-stats.
  app.get(
    `${BASE}/orphans/sweep/flapping/alerts/by-day`,
    requireAdmin,
    async (req, res) => {
      try {
        const parsed = z
          .object({
            day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            limit: z.coerce
              .number()
              .int()
              .min(1)
              .max(FLAPPING_ALERT_BY_DAY_MAX_LIMIT)
              .optional(),
          })
          .safeParse(req.query ?? {});
        if (!parsed.success) {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_alert_by_day_params" });
        }
        const result = await listFlappingAlertsForDay(parsed.data.day, {
          limit: parsed.data.limit ?? FLAPPING_ALERT_BY_DAY_DEFAULT_LIMIT,
        });
        return res.json({ ok: true, ...result });
      } catch (err) {
        if (err instanceof Error && err.message === "invalid_day") {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_alert_by_day_params" });
        }
        return handleError(res, err, "flapping_alert_by_day_failed");
      }
    },
  );

  // GET /orphans — Task #782. Archived rows whose object bytes are missing.
  app.get(`${BASE}/orphans/list`, requireAdmin, async (_req, res) => {
    try {
      const items = await productionAssetOrphanAlertService.listOrphanedRows();
      return res.json({ ok: true, items });
    } catch (err) {
      return handleError(res, err, "orphans_list_failed");
    }
  });

  // Task #791 — Scheduled sweep status + threshold (mirrors cover-orphan).
  app.get(`${BASE}/orphan-sweep/status`, requireAdmin, async (_req, res) => {
    try {
      const status = await productionAssetOrphanAlertService.getSweepStatus();
      return res.json({ ok: true, status });
    } catch (err) {
      return handleError(res, err, "orphan_sweep_status_failed");
    }
  });

  // GET /orphan-sweep/threshold/history — Task #845. Newest-first audit
  // trail of every change to the orphan-sweep threshold so founders can
  // see who tuned it and when. Limit is bounded server-side (1..50).
  //
  // Task #849 — also accepts `offset`, `from`, `to`, `actorUserId`
  // filters and returns a `total` count so the admin UI can paginate
  // and narrow by actor or date range, matching the Task #810
  // flapping-config history card.
  app.get(
    `${BASE}/orphan-sweep/threshold/history`,
    requireAdmin,
    async (req, res) => {
      try {
        const parsed = z
          .object({
            limit: z.coerce.number().int().min(1).max(50).optional(),
            offset: z.coerce.number().int().min(0).max(100_000).optional(),
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
            actorUserId: z.string().trim().min(1).max(128).optional(),
          })
          .safeParse(req.query ?? {});
        if (!parsed.success) {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_history_filters" });
        }
        const limit = parsed.data.limit ?? 10;
        const offset = parsed.data.offset ?? 0;
        const from = parsed.data.from ? new Date(parsed.data.from) : null;
        const to = parsed.data.to ? new Date(parsed.data.to) : null;
        const actorUserId = parsed.data.actorUserId ?? null;
        const { items, total } =
          await productionAssetOrphanAlertService.listSweepThresholdChanges({
            limit,
            offset,
            from,
            to,
            actorUserId,
          });
        return res.json({ ok: true, items, total, limit, offset });
      } catch (err) {
        return handleError(res, err, "sweep_threshold_history_failed");
      }
    },
  );

  // GET /orphan-sweep/threshold/history.csv — Task #853. Streams the
  // sweep-threshold change history as CSV using the same
  // from/to/actorUserId filters as /threshold/history, so founders
  // can download the filtered audit trail for offline review.
  //
  // Task #879 — also accepts an optional `timeZone` query parameter
  // (IANA name, e.g. `America/Los_Angeles`). When supplied and valid,
  // each row carries a `changed_at_local` column rendered in that zone
  // and a constant `time_zone` column, alongside the raw UTC ISO
  // `changed_at`. The zone is also recorded in the filename suffix so
  // the export is self-describing. Invalid/unknown zones fall back to
  // UTC (with `time_zone=UTC`) instead of failing the request.
  app.get(
    `${BASE}/orphan-sweep/threshold/history.csv`,
    requireAdmin,
    async (req, res) => {
      try {
        const parsed = z
          .object({
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
            actorUserId: z.string().trim().min(1).max(128).optional(),
            timeZone: z.string().trim().min(1).max(64).optional(),
          })
          .safeParse(req.query ?? {});
        if (!parsed.success) {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_history_filters" });
        }
        const from = parsed.data.from ? new Date(parsed.data.from) : null;
        const to = parsed.data.to ? new Date(parsed.data.to) : null;
        const actorUserId = parsed.data.actorUserId ?? null;
        const requestedTz = parsed.data.timeZone ?? null;
        let tzFormatter: Intl.DateTimeFormat | null = null;
        let resolvedTz = "UTC";
        if (requestedTz) {
          try {
            tzFormatter = new Intl.DateTimeFormat("en-CA", {
              timeZone: requestedTz,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            });
            resolvedTz = requestedTz;
          } catch {
            tzFormatter = null;
            resolvedTz = "UTC";
          }
        }
        const formatLocal = (iso: string | null): string => {
          if (!iso) return "";
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return "";
          if (!tzFormatter) {
            return iso.replace("T", " ").replace(/\.\d+Z$/, "Z").replace("Z", "");
          }
          const parts = tzFormatter.formatToParts(d);
          const get = (t: string) =>
            parts.find((p) => p.type === t)?.value ?? "";
          const hour = get("hour") === "24" ? "00" : get("hour");
          return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get(
            "minute",
          )}:${get("second")}`;
        };
        const { items, truncated } =
          await productionAssetOrphanAlertService.exportSweepThresholdChanges({
            from,
            to,
            actorUserId,
          });
        const escapeCsv = (v: string | null): string => {
          if (v == null) return "";
          const s = String(v);
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };
        const header =
          "id,changed_at,changed_at_local,time_zone,previous_value,new_value,actor_user_id";
        const lines = items.map((r) =>
          [
            escapeCsv(r.id),
            escapeCsv(r.changedAt),
            escapeCsv(formatLocal(r.changedAt)),
            escapeCsv(resolvedTz),
            escapeCsv(r.previousValue),
            escapeCsv(r.newValue),
            escapeCsv(r.actorUserId),
          ].join(","),
        );
        const body = [header, ...lines].join("\r\n") + "\r\n";
        const ts = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .replace("T", "_")
          .replace("Z", "");
        const tzSlug = resolvedTz.replace(/[^A-Za-z0-9._-]+/g, "_");
        const filename = `orphan-sweep-threshold-history-${ts}-${tzSlug}.csv`;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
        res.setHeader("X-Export-Row-Count", String(items.length));
        res.setHeader("X-Export-Time-Zone", resolvedTz);
        if (truncated) res.setHeader("X-Export-Truncated", "true");
        return res.status(200).send(body);
      } catch (err) {
        return handleError(res, err, "sweep_threshold_history_csv_failed");
      }
    },
  );

  // GET /orphans/sweep/flapping-config/history.csv — Task #885. Sibling
  // CSV export for the orphan-sweep flapping-config audit trail.
  // Mirrors `/orphan-sweep/threshold/history.csv` (Task #853 + Task #879)
  // 1:1 — same filters (`from` / `to` / `actorUserId`), same optional
  // `timeZone` (with UTC fallback for invalid zones), same response
  // headers (`X-Export-Row-Count`, `X-Export-Time-Zone`,
  // `X-Export-Truncated`) and the same filename suffix discipline. The
  // flapping table multiplexes multiple settings (threshold + window)
  // so we add a `setting` column on top of the threshold schema.
  app.get(
    `${BASE}/orphans/sweep/flapping-config/history.csv`,
    requireAdmin,
    async (req, res) => {
      try {
        const parsed = z
          .object({
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
            actorUserId: z.string().trim().min(1).max(128).optional(),
            timeZone: z.string().trim().min(1).max(64).optional(),
          })
          .safeParse(req.query ?? {});
        if (!parsed.success) {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_history_filters" });
        }
        const from = parsed.data.from ? new Date(parsed.data.from) : null;
        const to = parsed.data.to ? new Date(parsed.data.to) : null;
        const actorUserId = parsed.data.actorUserId ?? null;
        const requestedTz = parsed.data.timeZone ?? null;
        let tzFormatter: Intl.DateTimeFormat | null = null;
        let resolvedTz = "UTC";
        if (requestedTz) {
          try {
            tzFormatter = new Intl.DateTimeFormat("en-CA", {
              timeZone: requestedTz,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            });
            resolvedTz = requestedTz;
          } catch {
            tzFormatter = null;
            resolvedTz = "UTC";
          }
        }
        const formatLocal = (iso: string | null): string => {
          if (!iso) return "";
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return "";
          if (!tzFormatter) {
            return iso.replace("T", " ").replace(/\.\d+Z$/, "Z").replace("Z", "");
          }
          const parts = tzFormatter.formatToParts(d);
          const get = (t: string) =>
            parts.find((p) => p.type === t)?.value ?? "";
          const hour = get("hour") === "24" ? "00" : get("hour");
          return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get(
            "minute",
          )}:${get("second")}`;
        };
        const { items, truncated } =
          await productionAssetOrphanAlertService.exportSweepFlappingConfigChanges(
            { from, to, actorUserId },
          );
        const escapeCsv = (v: string | null): string => {
          if (v == null) return "";
          const s = String(v);
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };
        const header =
          "id,changed_at,changed_at_local,time_zone,setting,previous_value,new_value,actor_user_id";
        const lines = items.map((r) =>
          [
            escapeCsv(r.id),
            escapeCsv(r.changedAt),
            escapeCsv(formatLocal(r.changedAt)),
            escapeCsv(resolvedTz),
            escapeCsv(r.setting),
            escapeCsv(r.previousValue),
            escapeCsv(r.newValue),
            escapeCsv(r.actorUserId),
          ].join(","),
        );
        const body = [header, ...lines].join("\r\n") + "\r\n";
        const ts = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .replace("T", "_")
          .replace("Z", "");
        const tzSlug = resolvedTz.replace(/[^A-Za-z0-9._-]+/g, "_");
        const filename = `orphan-sweep-flapping-config-history-${ts}-${tzSlug}.csv`;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
        res.setHeader("X-Export-Row-Count", String(items.length));
        res.setHeader("X-Export-Time-Zone", resolvedTz);
        if (truncated) res.setHeader("X-Export-Truncated", "true");
        return res.status(200).send(body);
      } catch (err) {
        return handleError(
          res,
          err,
          "sweep_flapping_config_history_csv_failed",
        );
      }
    },
  );

  app.post(`${BASE}/orphan-sweep/threshold`, requireAdmin, async (req, res) => {
    try {
      const body = z
        .object({ threshold: z.number().int().min(0).max(1_000_000) })
        .parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const value = await productionAssetOrphanAlertService.setSweepThreshold(
        body.threshold,
        actorUserId,
      );
      const status = await productionAssetOrphanAlertService.getSweepStatus();
      return res.json({ ok: true, threshold: value, status });
    } catch (err) {
      if (err instanceof Error && err.message === "invalid_threshold") {
        return res
          .status(400)
          .json({ ok: false, error: "invalid_threshold", message: err.message });
      }
      return handleError(res, err, "orphan_sweep_threshold_failed");
    }
  });

  // POST /orphans/bulk-reconcile — Task #795. Hard-delete every
  // selected orphan in one round-trip. Validates each id is actually
  // an orphan (archived row + bytes missing) and runs the destructive
  // step in a single transaction with ONE moderation_logs entry
  // covering all affected ids. Per-id validation failures are
  // returned in the `results` array with `ok:false` and never abort
  // the batch.
  //
  // NOTE: registered BEFORE the dynamic `/:id/reconcile` route so the
  // literal `/orphans/bulk-reconcile` path is not shadowed.
  app.post(`${BASE}/orphans/bulk-reconcile`, requireAdmin, async (req, res) => {
    try {
      const body = bulkReconcileBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      if (body.action === "relink_object") {
        const out = await productionAssetOrphanAlertService.bulkRelinkOrphans({
          assetIds: body.ids,
          actorUserId,
          newStorageKeys: body.newStorageKeys,
          prefixRewrite: body.prefixRewrite ?? null,
          reason: body.reason ?? null,
        });
        return res.json({
          ok: true,
          results: out.results,
          deletedAuditRows: 0,
          moderationLogId: null,
        });
      }
      const out = await productionAssetOrphanAlertService.bulkReconcileOrphans({
        assetIds: body.ids,
        actorUserId,
        reason: body.reason,
      });
      return res.json({
        ok: true,
        results: out.results,
        deletedAuditRows: out.deletedAuditRows,
        moderationLogId: out.moderationLogId,
      });
    } catch (err) {
      return handleError(res, err, "bulk_reconcile_failed");
    }
  });

  // POST /:id/reconcile — Task #782. Hard-delete an orphaned row, or
  // confirm the object bytes have come back (`relink_object`).
  app.post(`${BASE}/:id/reconcile`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = reconcileBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const action: ReconcileAction = body.action;
      const result = await productionAssetOrphanAlertService.reconcileOrphan({
        assetId: id,
        action,
        actorUserId,
        reason: body.reason,
        newStorageKey: body.newStorageKey,
      });
      return res.json({ ok: true, result });
    } catch (err) {
      if (err instanceof Error) {
        const msg = err.message || "";
        if (msg.startsWith("asset_not_found")) {
          return res.status(404).json({ ok: false, error: "asset_not_found", message: msg });
        }
        if (msg.startsWith("asset_not_archived")) {
          return res.status(409).json({ ok: false, error: "asset_not_archived", message: msg });
        }
        if (msg === "object_still_missing") {
          return res.status(409).json({
            ok: false,
            error: "object_still_missing",
            message:
              "relink_object refused: storage still reports no bytes at this storageKey.",
          });
        }
        if (msg === "object_still_present_refusing_hard_delete") {
          return res.status(409).json({
            ok: false,
            error: "object_still_present",
            message:
              "hard_delete refused: storage still reports bytes at this storageKey. Use the normal archive-delete flow instead.",
          });
        }
        // Task #812 — relink_object with a new storageKey error surface.
        if (msg.startsWith("invalid_new_storage_key")) {
          return res.status(400).json({ ok: false, error: "invalid_new_storage_key", message: msg });
        }
        if (msg === "new_storage_key_not_found") {
          return res.status(409).json({
            ok: false,
            error: "new_storage_key_not_found",
            message: "relink_object refused: storage reports no bytes at the supplied new storageKey.",
          });
        }
        if (msg.startsWith("new_storage_key_byte_size_mismatch")) {
          return res.status(409).json({ ok: false, error: "new_storage_key_byte_size_mismatch", message: msg });
        }
        if (msg.startsWith("new_storage_key_sha256_mismatch")) {
          return res.status(409).json({ ok: false, error: "new_storage_key_sha256_mismatch", message: msg });
        }
        if (msg.startsWith("new_storage_key_download_failed")) {
          return res.status(502).json({ ok: false, error: "new_storage_key_download_failed", message: msg });
        }
        if (msg.startsWith("head_probe_failed")) {
          return res.status(502).json({ ok: false, error: "head_probe_failed", message: msg });
        }
      }
      return handleError(res, err, "reconcile_failed");
    }
  });

  // Task #898 — R7B-E2E test-seed cleanup preview + one-click run.
  // Surfaces the same candidate list as `scripts/cleanup-r7b-e2e-seeds.ts
  // --dry-run` (approved_internal rows whose name starts with `r7b-e2e`
  // older than the cutoff), and a button that triggers the same cleanup.
  // Rows bound by a permanent avatar are returned with
  // `boundByPermanentAvatar=true` so the UI can disable the row.
  const r7bQuerySchema = z.object({
    hours: z.coerce.number().int().min(0).max(24 * 365).optional(),
    prefix: z.string().trim().min(1).max(64).optional(),
  });
  const r7bRunBodySchema = z.object({
    hours: z.number().int().min(0).max(24 * 365).optional(),
    prefix: z.string().trim().min(1).max(64).optional(),
    confirm: z.literal(true),
  });

  app.get(`${BASE}/r7b-e2e-cleanup/preview`, requireAdmin, async (req, res) => {
    try {
      const q = r7bQuerySchema.parse(req.query ?? {});
      const result = await previewAssetCleanup({ hours: q.hours, prefix: q.prefix });
      return res.json({
        ok: true,
        ...result,
        defaults: { hours: CLEANUP_DEFAULT_HOURS, prefix: CLEANUP_DEFAULT_PREFIX },
      });
    } catch (err) {
      return handleError(res, err, "r7b_preview_failed");
    }
  });

  app.post(`${BASE}/r7b-e2e-cleanup/run`, requireAdmin, async (req, res) => {
    try {
      const body = r7bRunBodySchema.parse(req.body ?? {});
      const result = await runAssetCleanup({ hours: body.hours, prefix: body.prefix });
      return res.json({ ok: true, ...result });
    } catch (err) {
      return handleError(res, err, "r7b_run_failed");
    }
  });
}
