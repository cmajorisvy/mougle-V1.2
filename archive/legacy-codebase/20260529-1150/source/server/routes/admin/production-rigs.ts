/**
 * Task #754 — Admin Avatar Rig Library routes.
 *
 * Mirrors server/routes/admin/production-assets.ts for rigs. All routes are
 * root-admin-only (CSRF enforced globally). publicUrl is always null. Signed
 * preview URLs are ephemeral (≤900s) and never persisted; only metadata is
 * audit-logged. The GLB/GLTF validator runs before any byte or DB row.
 */

import { createHash } from "node:crypto";
import type { Express, RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { storage, ProductionRigStorageError } from "../../storage";
import type { ProductionRig, ProductionRigAuditLog } from "@shared/schema";
import { getAdminVerification } from "../../middleware/admin-auth";
import { validateGlbOrGltf } from "../../services/gltf-validator";
import {
  putRigBytes,
  issueSignedRigPreviewUrl,
  deleteRigBytes,
} from "../../services/production-rig-storage";
import {
  previewRigCleanup,
  runRigCleanup,
  CLEANUP_DEFAULT_HOURS,
  CLEANUP_DEFAULT_PREFIX,
} from "../../../scripts/cleanup-r7b-e2e-seeds";

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

function serializeRig(row: ProductionRig): ProductionRig & { publicUrl: null } {
  return { ...row, publicUrl: null };
}

function serializeAuditLog(row: ProductionRigAuditLog) {
  return row;
}

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

function mapStorageErrorStatus(err: ProductionRigStorageError): number {
  switch (err.code) {
    case "rig_not_found":
      return 404;
    case "rig_sha256_conflict":
      return 409;
    case "rig_invalid_approval_transition":
      return 409;
    case "rig_not_archived":
      return 409;
    case "rig_invalid_input":
    default:
      return 400;
  }
}

function handleError(res: any, err: unknown, fallback = "internal_error") {
  if (err instanceof ProductionRigStorageError) {
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

const importBodySchema = z.object({
  url: z.string().url(),
  name: z.string().trim().min(1).max(256),
  licenseHint: licenseHintSchema,
  licenseSource: z.string().max(2048).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["draft", "active", "archived"]).optional(),
  safetyReview: z.enum(["pending", "approved_internal", "rejected", "needs_changes"]).optional(),
  approvalGate: z.enum(["not_approved", "approved_internal"]).optional(),
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

const deleteBodySchema = z.object({
  reason: z.string().trim().min(1).max(2048),
  confirm: z.literal(true),
});

async function fetchRigFromUrl(url: string): Promise<{
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

export function registerProductionRigRoutes(
  app: Express,
  requireAdmin: RequestHandler,
): void {
  const BASE = "/api/admin/production-rigs";

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

        const validation = validateGlbOrGltf(file.buffer, { format });
        if (!validation.ok) {
          return res
            .status(400)
            .json({ ok: false, error: "validation_failed", reason: validation.reason });
        }

        const sha256 = sha256Hex(file.buffer);
        const existing = await storage.getRigBySha256(sha256);
        if (existing) {
          return res.status(409).json({
            ok: false,
            error: "rig_sha256_conflict",
            message: `A rig with sha256=${sha256} already exists.`,
            rig: serializeRig(existing),
          });
        }

        const actorUserId = getActorUserId(req);
        const licenseHint =
          typeof req.body?.licenseHint === "string" ? req.body.licenseHint : undefined;
        const licenseSource =
          typeof req.body?.licenseSource === "string" ? req.body.licenseSource : undefined;

        const rigId = crypto.randomUUID();
        const storageKey = `production-rigs/${rigId}.${format}`;

        await putRigBytes(storageKey, file.buffer);

        const created = await storage.createRig(
          {
            name,
            format,
            byteSize: file.buffer.byteLength,
            sha256,
            storageKey,
            uploaderUserId: actorUserId,
            licenseStatus: licenseHint ?? undefined,
            licenseSource: licenseSource ?? undefined,
            metadata: validation.metadata as any,
          } as any,
          {
            actorUserId,
            event: "uploaded",
            payload: {
              validator: validation.metadata,
              licenseHint: licenseHint ?? null,
              licenseSource: licenseSource ?? null,
            },
          },
        );

        return res.status(201).json({ ok: true, rig: serializeRig(created) });
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

  app.post(`${BASE}/import-from-url`, requireAdmin, async (req, res) => {
    try {
      const body = importBodySchema.parse(req.body ?? {});

      let fetched;
      try {
        fetched = await fetchRigFromUrl(body.url);
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
      const existing = await storage.getRigBySha256(sha256);
      if (existing) {
        return res.status(409).json({
          ok: false,
          error: "rig_sha256_conflict",
          message: `A rig with sha256=${sha256} already exists.`,
          rig: serializeRig(existing),
        });
      }

      const actorUserId = getActorUserId(req);
      const rigId = crypto.randomUUID();
      const storageKey = `production-rigs/${rigId}.${format}`;

      await putRigBytes(storageKey, fetched.buffer);

      const created = await storage.createRig(
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
          metadata: validation.metadata as any,
        } as any,
        {
          actorUserId,
          event: "imported",
          payload: {
            validator: validation.metadata,
            originalSourceUrl: body.url,
            licenseHint: body.licenseHint ?? null,
            licenseSource: body.licenseSource ?? null,
          },
        },
      );

      return res.status(201).json({ ok: true, rig: serializeRig(created) });
    } catch (err) {
      return handleError(res, err, "import_failed");
    }
  });

  app.get(BASE, requireAdmin, async (req, res) => {
    try {
      const q = listQuerySchema.parse(req.query ?? {});
      const result = await storage.listRigs({
        status: q.status,
        safetyReview: q.safetyReview,
        approvalGate: q.approvalGate,
        limit: q.limit,
        offset: q.offset,
      });
      return res.json({
        ok: true,
        items: result.items.map(serializeRig),
        total: result.total,
        limit: q.limit,
        offset: q.offset,
      });
    } catch (err) {
      return handleError(res, err, "list_failed");
    }
  });

  app.get(`${BASE}/:id`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const rig = await storage.getRigById(id);
      if (!rig) {
        return res
          .status(404)
          .json({ ok: false, error: "rig_not_found", message: `Rig ${id} not found.` });
      }
      const auditLog = await storage.listAuditLogForRig(id, { limit: 20 });
      return res.json({
        ok: true,
        rig: serializeRig(rig),
        auditLog: auditLog.map(serializeAuditLog),
      });
    } catch (err) {
      return handleError(res, err, "get_failed");
    }
  });

  app.post(`${BASE}/:id/signed-preview-url`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = signedUrlBodySchema.parse(req.body ?? {});
      const requestedTtl = body.ttlSeconds ?? MAX_SIGNED_URL_TTL;
      const ttlSeconds = Math.min(MAX_SIGNED_URL_TTL, Math.max(1, requestedTtl));

      const rig = await storage.getRigById(id);
      if (!rig) {
        return res
          .status(404)
          .json({ ok: false, error: "rig_not_found", message: `Rig ${id} not found.` });
      }

      const actorUserId = getActorUserId(req);
      const issued = await issueSignedRigPreviewUrl(rig.storageKey, {
        adminUserId: actorUserId,
        ttlSeconds,
      });

      await storage.appendRigAuditLog({
        rigId: id,
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

  app.post(`${BASE}/:id/safety-review`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = safetyReviewBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const updated = await storage.updateRigSafetyReview(id, {
        safetyReview: body.decision,
        safetyNote: body.note ?? null,
        actorUserId,
      });
      return res.json({ ok: true, rig: serializeRig(updated) });
    } catch (err) {
      return handleError(res, err, "safety_review_failed");
    }
  });

  app.post(`${BASE}/:id/license`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = licenseBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const updated = await storage.updateRigLicense(id, {
        licenseStatus: body.licenseStatus,
        licenseSource: body.licenseSource ?? null,
        licenseNote: body.licenseNote ?? null,
        actorUserId,
      });
      return res.json({ ok: true, rig: serializeRig(updated) });
    } catch (err) {
      return handleError(res, err, "license_update_failed");
    }
  });

  app.post(`${BASE}/:id/approval`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const actorUserId = getActorUserId(req);
      const rig = await storage.getRigById(id);
      if (!rig) {
        return res
          .status(404)
          .json({ ok: false, error: "rig_not_found", message: `Rig ${id} not found.` });
      }
      if (rig.safetyReview !== "approved_internal") {
        return res.status(409).json({
          ok: false,
          error: "safety_review_not_approved",
          message:
            "Rig cannot be approved: safetyReview must be 'approved_internal' before advancing the approval gate.",
        });
      }
      if (
        rig.licenseStatus === "unknown" ||
        rig.licenseStatus === "unlicensed_rejected"
      ) {
        return res.status(409).json({
          ok: false,
          error: "license_not_acceptable",
          message: `Rig cannot be approved while licenseStatus is '${rig.licenseStatus}'.`,
        });
      }
      const updated = await storage.advanceRigApprovalGate(id, { actorUserId });
      return res.json({ ok: true, rig: serializeRig(updated) });
    } catch (err) {
      return handleError(res, err, "approval_failed");
    }
  });

  app.post(`${BASE}/:id/archive`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = archiveBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      // R7B: a rig bound by any permanent avatar cannot be archived
      // until the avatar is rebound away. Pre-check returns 409.
      const referencingAvatars =
        await storage.countPermanentAvatarsReferencingRig(id);
      if (referencingAvatars > 0) {
        return res.status(409).json({
          ok: false,
          error: "rig_referenced_by_permanent_avatar",
          message: `Rig ${id} is bound by ${referencingAvatars} permanent avatar(s); rebind or delete them first.`,
          referencingAvatars,
        });
      }
      const updated = await storage.archiveRig(id, {
        actorUserId,
        reason: body.reason,
      });
      return res.json({ ok: true, rig: serializeRig(updated) });
    } catch (err) {
      return handleError(res, err, "archive_failed");
    }
  });

  // DELETE /:id — permanently delete an archived rig
  // (object-storage bytes + DB row + cascade audit-log rows).
  // Mirrors Task #765 for production assets. Object bytes are deleted
  // FIRST; if that fails the DB row is preserved so the admin can retry.
  app.delete(`${BASE}/:id`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = deleteBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);

      const rig = await storage.getRigById(id);
      if (!rig) {
        return res
          .status(404)
          .json({ ok: false, error: "rig_not_found", message: `Rig ${id} not found.` });
      }
      if (rig.status !== "archived") {
        return res.status(409).json({
          ok: false,
          error: "rig_not_archived",
          message: `Rig ${id} cannot be deleted: status='${rig.status}' (must be 'archived').`,
        });
      }

      let objectDeleted = false;
      try {
        const r = await deleteRigBytes(rig.storageKey);
        objectDeleted = r.deleted;
      } catch (e: any) {
        return res.status(502).json({
          ok: false,
          error: "object_delete_failed",
          message:
            "Failed to delete object-storage bytes; rig row preserved. Retry the delete.",
          detail: e?.message || String(e),
        });
      }

      const result = await storage.deleteArchivedRig(id, {
        actorUserId,
        reason: body.reason,
      });

      return res.json({
        ok: true,
        deletedRigId: id,
        deletedAuditRows: result.deletedAuditRows,
        objectDeleted,
      });
    } catch (err) {
      return handleError(res, err, "delete_failed");
    }
  });

  // Task #898 — R7B-E2E test-seed cleanup preview + one-click run (rigs).
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
      const result = await previewRigCleanup({ hours: q.hours, prefix: q.prefix });
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
      const result = await runRigCleanup({ hours: body.hours, prefix: body.prefix });
      return res.json({ ok: true, ...result });
    } catch (err) {
      return handleError(res, err, "r7b_run_failed");
    }
  });
}
