/**
 * R7B-Routes — /api/admin/permanent-avatars/* REST surface.
 *
 * Design: docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md §7
 *
 * Hard safety invariants (defence-in-depth alongside DB CHECK constraints
 * shipped by R7B-Schema):
 *  - publicUrl always serialized as null
 *  - realSendAllowed always serialized as false
 *  - executionEnabled always serialized as false
 *  - visibility always serialized as 'admin_only_internal'
 *  - approvalGate may never be 'approved_public' (DB-pinned)
 *  - signed preview URLs are ≤900s and never persisted (only
 *    {ttlSeconds, expiresAt} is audit-logged)
 *  - no provider client / SDK / fetch — grep guard in
 *    tests/permanent-avatars-routes-provider-isolation.test.ts
 *
 * Provider isolation: this file must NOT mention any external
 * avatar / voice / motion provider name (full token list lives in
 * tests/permanent-avatars-routes-provider-isolation.test.ts).
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { storage, PermanentAvatarStorageError } from "../../storage";
import type {
  PermanentAvatar,
  PermanentAvatarAuditLog,
} from "@shared/schema";
import { getAdminVerification } from "../../middleware/admin-auth";
import { issueSignedPreviewUrl } from "../../services/production-asset-storage";
import { issueSignedRigPreviewUrl } from "../../services/production-rig-storage";

const MAX_SIGNED_URL_TTL = 900;

function getActorUserId(req: any): string {
  const admin = getAdminVerification(req);
  return admin?.actor.id || "env-root-admin";
}

// Defence-in-depth serializer overlay (design §7.1)
function serializeAvatar(
  row: PermanentAvatar,
): PermanentAvatar & {
  publicUrl: null;
  realSendAllowed: false;
  executionEnabled: false;
  visibility: "admin_only_internal";
} {
  return {
    ...row,
    publicUrl: null,
    realSendAllowed: false,
    executionEnabled: false,
    visibility: "admin_only_internal",
  };
}

function serializeAuditLog(row: PermanentAvatarAuditLog) {
  return row;
}

function mapStorageErrorStatus(err: PermanentAvatarStorageError): number {
  switch (err.code) {
    case "avatar_not_found":
      return 404;
    case "avatar_slug_conflict":
      return 409;
    case "avatar_pair_not_approved_internal":
      return 409;
    case "avatar_pair_validity_failed":
      return 409;
    case "avatar_review_not_approved":
      return 409;
    case "avatar_not_archived":
      return 409;
    case "avatar_already_archived":
      return 409;
    case "avatar_invalid_state_transition":
      return 409;
    case "avatar_invalid_input":
    default:
      return 400;
  }
}

function handleError(res: any, err: unknown, fallback = "internal_error") {
  if (err instanceof PermanentAvatarStorageError) {
    res.status(mapStorageErrorStatus(err)).json({
      ok: false,
      error: err.code,
      message: err.message,
      ...(err.detail ? { detail: err.detail } : {}),
    });
    return;
  }
  if (err instanceof z.ZodError) {
    res
      .status(400)
      .json({ ok: false, error: "invalid_input", message: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ ok: false, error: fallback, message });
}

// --------------- Zod schemas ---------------

const rolePresetSchema = z.enum([
  "news_anchor",
  "podcast_host",
  "debate_moderator",
  "guest",
  "analyst",
  "field_reporter",
  "teacher",
  "virtual_ceo",
  "ai_assistant",
  "custom",
]);
const roomKindSchema = z.enum([
  "news_room",
  "podcast_room",
  "debate_studio",
  "living_room",
]);

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, {
    message: "slug must be lowercase alphanumeric with - or _",
  });

const createBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  slug: slugSchema,
  personaSummary: z.string().max(8192).optional(),
  rolePreset: rolePresetSchema.optional(),
  voiceProfileHint: z.string().max(2048).optional(),
  languageHint: z.string().max(256).optional(),
  bodyAssetId: z.string().trim().min(1),
  rigId: z.string().trim().min(1),
  defaultRoomKind: roomKindSchema.nullable().optional(),
  defaultRoomId: z.string().trim().min(1).nullable().optional(),
  metadata: z.record(z.any()).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["draft", "active", "archived"]).optional(),
  approvalGate: z.enum(["not_approved", "approved_internal"]).optional(),
  identityReview: z
    .enum(["pending", "approved_internal", "rejected", "needs_changes"])
    .optional(),
  safetyReview: z
    .enum(["pending", "approved_internal", "rejected", "needs_changes"])
    .optional(),
  bodyAssetId: z.string().trim().min(1).optional(),
  rigId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const patchBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256).optional(),
  personaSummary: z.string().max(8192).optional(),
  voiceProfileHint: z.string().max(2048).optional(),
  languageHint: z.string().max(256).optional(),
  rolePreset: rolePresetSchema.optional(),
  defaultRoomKind: roomKindSchema.nullable().optional(),
  defaultRoomId: z.string().trim().min(1).nullable().optional(),
});

const rebindBodySchema = z
  .object({
    bodyAssetId: z.string().trim().min(1).optional(),
    rigId: z.string().trim().min(1).optional(),
    reason: z.string().max(2048).optional(),
  })
  .refine((b) => b.bodyAssetId || b.rigId, {
    message: "rebind requires bodyAssetId and/or rigId",
  });

const reviewBodySchema = z.object({
  decision: z.enum(["approved_internal", "rejected", "needs_changes"]),
  note: z.string().max(4096).optional(),
});

const archiveBodySchema = z.object({
  reason: z.string().max(2048).optional(),
});

const deleteBodySchema = z.object({
  reason: z.string().trim().min(1).max(2048),
  confirm: z.literal(true),
});

const previewBundleQuerySchema = z.object({
  ttlSeconds: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_SIGNED_URL_TTL)
    .optional(),
});

// --------------- Route registration ---------------

export function registerPermanentAvatarRoutes(
  app: Express,
  requireAdmin: RequestHandler,
): void {
  const BASE = "/api/admin/permanent-avatars";

  // POST / — create with pair-validity gate
  app.post(BASE, requireAdmin, async (req, res) => {
    try {
      const body = createBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const created = await storage.createPermanentAvatar(
        {
          displayName: body.displayName,
          slug: body.slug,
          personaSummary: body.personaSummary ?? "",
          rolePreset: body.rolePreset ?? "custom",
          voiceProfileHint: body.voiceProfileHint ?? "",
          languageHint: body.languageHint ?? "",
          bodyAssetId: body.bodyAssetId,
          rigId: body.rigId,
          defaultRoomKind: body.defaultRoomKind ?? null,
          defaultRoomId: body.defaultRoomId ?? null,
          createdByUserId: actorUserId,
          metadata: (body.metadata ?? null) as any,
        } as any,
        { actorUserId },
      );
      return res
        .status(201)
        .json({ ok: true, avatar: serializeAvatar(created) });
    } catch (err) {
      return handleError(res, err, "create_failed");
    }
  });

  // GET / — list with filters
  app.get(BASE, requireAdmin, async (req, res) => {
    try {
      const q = listQuerySchema.parse(req.query ?? {});
      const result = await storage.listPermanentAvatars({
        status: q.status,
        approvalGate: q.approvalGate,
        identityReview: q.identityReview,
        safetyReview: q.safetyReview,
        bodyAssetId: q.bodyAssetId,
        rigId: q.rigId,
        limit: q.limit,
        offset: q.offset,
      });
      return res.json({
        ok: true,
        items: result.items.map(serializeAvatar),
        total: result.total,
        limit: q.limit,
        offset: q.offset,
      });
    } catch (err) {
      return handleError(res, err, "list_failed");
    }
  });

  // GET /:id — detail + last 20 audit rows + bound summaries
  app.get(`${BASE}/:id`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const avatar = await storage.getPermanentAvatarById(id);
      if (!avatar) {
        return res.status(404).json({
          ok: false,
          error: "avatar_not_found",
          message: `Permanent avatar ${id} not found.`,
        });
      }
      const auditLog = await storage.listPermanentAvatarAuditLog(id, {
        limit: 20,
      });
      const bound = await storage.getPermanentAvatarBoundSummaries(avatar);
      return res.json({
        ok: true,
        avatar: serializeAvatar(avatar),
        auditLog: auditLog.map(serializeAuditLog),
        boundBodyAsset: bound.bodyAsset,
        boundRig: bound.rig,
      });
    } catch (err) {
      return handleError(res, err, "get_failed");
    }
  });

  // PATCH /:id — identity field updates only
  app.patch(`${BASE}/:id`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = patchBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const updated = await storage.updatePermanentAvatarIdentityFields(id, {
        fields: body,
        actorUserId,
      });
      return res.json({ ok: true, avatar: serializeAvatar(updated) });
    } catch (err) {
      return handleError(res, err, "patch_failed");
    }
  });

  // POST /:id/rebind — change bodyAssetId/rigId, demote to composed,
  // reset both reviews. Pair-validity gate enforced.
  app.post(`${BASE}/:id/rebind`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = rebindBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const updated = await storage.rebindPermanentAvatar(id, {
        bodyAssetId: body.bodyAssetId,
        rigId: body.rigId,
        reason: body.reason ?? null,
        actorUserId,
      });
      return res.json({ ok: true, avatar: serializeAvatar(updated) });
    } catch (err) {
      return handleError(res, err, "rebind_failed");
    }
  });

  // POST /:id/identity-review
  app.post(`${BASE}/:id/identity-review`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = reviewBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const updated = await storage.setPermanentAvatarIdentityReview(id, {
        decision: body.decision,
        note: body.note ?? null,
        actorUserId,
      });
      return res.json({ ok: true, avatar: serializeAvatar(updated) });
    } catch (err) {
      return handleError(res, err, "identity_review_failed");
    }
  });

  // POST /:id/safety-review
  app.post(`${BASE}/:id/safety-review`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = reviewBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const updated = await storage.setPermanentAvatarSafetyReview(id, {
        decision: body.decision,
        note: body.note ?? null,
        actorUserId,
      });
      return res.json({ ok: true, avatar: serializeAvatar(updated) });
    } catch (err) {
      return handleError(res, err, "safety_review_failed");
    }
  });

  // POST /:id/approval — requires both reviews + pair-validity
  app.post(`${BASE}/:id/approval`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const actorUserId = getActorUserId(req);
      const updated = await storage.advancePermanentAvatarApprovalGate(id, {
        actorUserId,
      });
      return res.json({ ok: true, avatar: serializeAvatar(updated) });
    } catch (err) {
      return handleError(res, err, "approval_failed");
    }
  });

  // POST /:id/archive
  app.post(`${BASE}/:id/archive`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = archiveBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const updated = await storage.archivePermanentAvatar(id, {
        actorUserId,
        reason: body.reason ?? null,
      });
      return res.json({ ok: true, avatar: serializeAvatar(updated) });
    } catch (err) {
      return handleError(res, err, "archive_failed");
    }
  });

  // POST /:id/unarchive
  app.post(`${BASE}/:id/unarchive`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const actorUserId = getActorUserId(req);
      const updated = await storage.unarchivePermanentAvatar(id, {
        actorUserId,
      });
      return res.json({ ok: true, avatar: serializeAvatar(updated) });
    } catch (err) {
      return handleError(res, err, "unarchive_failed");
    }
  });

  // DELETE /:id — permanent delete from status='archived'.
  // Writes permanent_avatar_tombstones row + parent delete in one
  // transaction; the audit-log cascade fires after the tombstone is
  // recorded (snapshot preserves slug burn + final row + log count).
  app.delete(`${BASE}/:id`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = deleteBodySchema.parse(req.body ?? {});
      const actorUserId = getActorUserId(req);
      const result = await storage.deleteArchivedPermanentAvatar(id, {
        actorUserId,
        reason: body.reason,
      });
      return res.json({
        ok: true,
        deletedAvatarId: id,
        deletedAuditRows: result.deletedAuditRows,
        tombstoneId: result.tombstoneId,
      });
    } catch (err) {
      return handleError(res, err, "delete_failed");
    }
  });

  // GET /:id/preview-bundle — ephemeral signed URLs for body asset
  // GLB and rig GLB. TTL clamped to ≤900 s; URLs never persisted.
  // Audit log records {ttlSeconds, expiresAt} only.
  app.get(`${BASE}/:id/preview-bundle`, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const q = previewBundleQuerySchema.parse(req.query ?? {});
      const requestedTtl = q.ttlSeconds ?? MAX_SIGNED_URL_TTL;
      const ttlSeconds = Math.min(
        MAX_SIGNED_URL_TTL,
        Math.max(1, Math.floor(requestedTtl)),
      );
      const actorUserId = getActorUserId(req);

      const avatar = await storage.getPermanentAvatarById(id);
      if (!avatar) {
        return res.status(404).json({
          ok: false,
          error: "avatar_not_found",
          message: `Permanent avatar ${id} not found.`,
        });
      }
      const bound = await storage.getPermanentAvatarBoundSummaries(avatar);
      if (!bound.bodyAsset || !bound.rig) {
        return res.status(409).json({
          ok: false,
          error: "avatar_bound_pair_missing",
          message: "Bound body asset or rig no longer exists.",
        });
      }

      const bodyIssued = await issueSignedPreviewUrl(
        bound.bodyAsset.storageKey,
        { adminUserId: actorUserId, ttlSeconds },
      );
      const rigIssued = await issueSignedRigPreviewUrl(bound.rig.storageKey, {
        adminUserId: actorUserId,
        ttlSeconds,
      });

      await storage.appendPermanentAvatarAuditLog({
        permanentAvatarId: id,
        actorUserId,
        event: "preview_bundle_issued",
        payload: {
          ttlSeconds,
          bodyAssetExpiresAt: bodyIssued.expiresAt.toISOString(),
          rigExpiresAt: rigIssued.expiresAt.toISOString(),
        } as any,
      });

      return res.json({
        ok: true,
        bodyAssetSignedUrl: bodyIssued.url,
        rigSignedUrl: rigIssued.url,
        ttlSeconds,
        bodyAssetExpiresAt: bodyIssued.expiresAt.toISOString(),
        rigExpiresAt: rigIssued.expiresAt.toISOString(),
      });
    } catch (err) {
      return handleError(res, err, "preview_bundle_failed");
    }
  });
}
