import { and, desc, eq, or, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { db } from "../db";
import { emailService } from "./email-service";
import { riskManagementService } from "./risk-management-service";
import {
  adminStaff,
  adminStaffAccessRequests,
  type AdminStaffAccessRequest,
} from "@shared/schema";
import { invalidateAdminIdentityCache } from "./admin-identity-resolver";

export const ADMIN_ACCESS_REVIEW_EMAILS = ["cmajorisvy@gmail.com", "admin@mougle.com"] as const;

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

const staffRolePermissions = {
  support: ["support:view", "support:manage"],
  moderator: ["moderation:view", "moderation:manage", "legal-safety:view"],
  content: ["content:view", "content:manage", "news:manage", "knowledge:view"],
  finance: ["billing:view", "revenue:view"],
  ai_operator: ["ai:ops", "costs:view"],
  staff: ["operations:view", "support:view", "moderation:view", "content:view"],
} satisfies Record<string, string[]>;

const accessRequestInputSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, "Username may use letters, numbers, dots, underscores, and hyphens"),
  requestedAccessType: z.enum(["main_admin", "staff_admin"]),
  requestedRole: z.enum(["admin", "staff", "support", "moderator", "content", "finance", "ai_operator"]),
  reason: z.string().trim().min(10).max(2000),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match" });
  }
  if (data.requestedAccessType === "main_admin" && data.requestedRole !== "admin") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requestedRole"], message: "Main Admin requests must use the admin role" });
  }
  if (data.requestedAccessType === "staff_admin" && data.requestedRole === "admin") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requestedRole"], message: "Staff Admin requests must use a staff-safe role" });
  }
});

export type AdminAccessRequestInput = z.infer<typeof accessRequestInputSchema>;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateReviewToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL || "https://www.mougle.com").replace(/\/$/, "");
}

function reviewUrl(action: "approve" | "reject", token: string) {
  return `${appBaseUrl()}/api/admin/access-requests/${action}/${encodeURIComponent(token)}`;
}

function resolveRoleAndPermissions(requestedAccessType: AdminAccessRequestInput["requestedAccessType"], requestedRole: AdminAccessRequestInput["requestedRole"]) {
  if (requestedAccessType === "main_admin") {
    return { role: "admin", permissions: ["*"] };
  }

  const role = requestedRole === "admin" ? "staff" : requestedRole;
  return { role, permissions: staffRolePermissions[role as keyof typeof staffRolePermissions] || staffRolePermissions.staff };
}

function safeRequestResponse(request: AdminStaffAccessRequest) {
  return {
    id: request.id,
    status: request.status,
    email: request.email,
    username: request.username,
    requestedAccessType: request.requestedAccessType,
    requestedRole: request.requestedRole,
    tokenExpiresAt: request.tokenExpiresAt,
  };
}

async function expirePendingRequest(requestId: string) {
  await db.update(adminStaffAccessRequests)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(adminStaffAccessRequests.id, requestId), eq(adminStaffAccessRequests.status, "pending")));
}

async function auditAccessRequest(action: string, request: AdminStaffAccessRequest, reviewerEmail: string | null, details: Record<string, any> = {}) {
  try {
    await riskManagementService.logAudit({
      actorId: reviewerEmail || "public-access-request",
      actorType: reviewerEmail ? "admin" : "public",
      action,
      resourceType: "admin_staff_access_request",
      resourceId: request.id,
      outcome: "success",
      riskLevel: "medium",
      details: {
        requestedAccessType: request.requestedAccessType,
        requestedRole: request.requestedRole,
        requestedEmail: request.email,
        requestedUsername: request.username,
        ...details,
      },
      ipAddress: request.ipAddress || undefined,
    });
  } catch (err) {
    console.error("[AdminAccessRequest] Failed audit log:", (err as Error).message);
  }
}

export async function submitAdminAccessRequest(input: unknown, context: { ipAddress?: string; userAgent?: string }) {
  const parsed = accessRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    throw { status: 400, message: parsed.error.issues[0]?.message || "Invalid access request" };
  }

  const data = parsed.data;
  const email = normalizeEmail(data.email);
  const username = normalizeUsername(data.username);
  const now = new Date();

  const [existingStaff] = await db.select({ id: adminStaff.id })
    .from(adminStaff)
    .where(or(eq(adminStaff.email, email), eq(adminStaff.username, username)))
    .limit(1);

  if (existingStaff) {
    throw { status: 409, message: "An internal account already exists for that email or username" };
  }

  const [existingPending] = await db.select()
    .from(adminStaffAccessRequests)
    .where(and(
      eq(adminStaffAccessRequests.status, "pending"),
      or(eq(adminStaffAccessRequests.email, email), eq(adminStaffAccessRequests.username, username)),
    ))
    .orderBy(desc(adminStaffAccessRequests.createdAt))
    .limit(1);

  if (existingPending) {
    if (existingPending.tokenExpiresAt && existingPending.tokenExpiresAt > now) {
      throw { status: 409, message: "A pending access request already exists for that email or username" };
    }
    await expirePendingRequest(existingPending.id);
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const { role, permissions } = resolveRoleAndPermissions(data.requestedAccessType, data.requestedRole);
  const tokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  const reviewerTokens = ADMIN_ACCESS_REVIEW_EMAILS.map((reviewerEmail) => ({
    email: reviewerEmail,
    approvalToken: generateReviewToken(),
    rejectionToken: generateReviewToken(),
  }));

  const reviewTokenHashes = reviewerTokens.map((reviewer) => ({
    email: reviewer.email,
    approvalTokenHash: tokenHash(reviewer.approvalToken),
    rejectionTokenHash: tokenHash(reviewer.rejectionToken),
  }));

  const [created] = await db.insert(adminStaffAccessRequests).values({
    fullName: data.fullName,
    email,
    username,
    requestedAccessType: data.requestedAccessType,
    requestedRole: role,
    requestedPermissions: permissions,
    passwordHash,
    reason: data.reason,
    status: "pending",
    reviewTokenHashes,
    tokenExpiresAt,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent?.slice(0, 500),
    updatedAt: now,
  }).returning();

  await Promise.all(reviewerTokens.map((reviewer) => emailService.sendAdminAccessRequestReviewEmail(reviewer.email, {
    requestId: created.id,
    fullName: created.fullName,
    email: created.email,
    username: created.username,
    requestedAccessType: created.requestedAccessType,
    requestedRole: created.requestedRole,
    requestedPermissions: created.requestedPermissions,
    reason: created.reason,
    approveUrl: reviewUrl("approve", reviewer.approvalToken),
    rejectUrl: reviewUrl("reject", reviewer.rejectionToken),
    expiresAt: tokenExpiresAt,
  })));

  return safeRequestResponse(created);
}

async function findRequestByToken(token: string, action: "approve" | "reject") {
  const hash = tokenHash(token);
  const needle = action === "approve"
    ? [{ approvalTokenHash: hash }]
    : [{ rejectionTokenHash: hash }];

  const [request] = await db.select()
    .from(adminStaffAccessRequests)
    .where(sql`${adminStaffAccessRequests.reviewTokenHashes} @> ${JSON.stringify(needle)}::jsonb`)
    .limit(1);

  if (!request) {
    throw { status: 404, message: "Review link is invalid or no longer available" };
  }

  const reviewer = request.reviewTokenHashes.find((entry) => (
    action === "approve" ? entry.approvalTokenHash === hash : entry.rejectionTokenHash === hash
  ));

  if (!reviewer) {
    throw { status: 404, message: "Review link is invalid or no longer available" };
  }

  return { request, reviewerEmail: reviewer.email };
}

function alreadyReviewedResult(request: AdminStaffAccessRequest) {
  return {
    status: request.status,
    alreadyReviewed: true,
    requestId: request.id,
    accessType: request.requestedAccessType,
    staffId: request.createdStaffId,
    redirectPath: request.requestedAccessType === "main_admin" ? "/admin/dashboard" : "/staff/dashboard",
    message: `This request has already been ${request.status}.`,
  };
}

export async function approveAdminAccessRequest(token: string) {
  const { request, reviewerEmail } = await findRequestByToken(token, "approve");

  if (request.status !== "pending") {
    return alreadyReviewedResult(request);
  }

  const now = new Date();
  if (request.tokenExpiresAt && request.tokenExpiresAt < now) {
    await expirePendingRequest(request.id);
    return { status: "expired", alreadyReviewed: true, requestId: request.id, message: "This approval link has expired." };
  }

  const result = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(adminStaffAccessRequests)
      .set({ status: "approved", approvedByEmail: reviewerEmail, reviewedAt: now, updatedAt: now })
      .where(and(eq(adminStaffAccessRequests.id, request.id), eq(adminStaffAccessRequests.status, "pending")))
      .returning();

    if (!claimed) {
      const [latest] = await tx.select().from(adminStaffAccessRequests).where(eq(adminStaffAccessRequests.id, request.id)).limit(1);
      return alreadyReviewedResult(latest || request);
    }

    const existingStaff = await tx.select()
      .from(adminStaff)
      .where(or(eq(adminStaff.email, claimed.email), eq(adminStaff.username, claimed.username)));

    if (existingStaff.length > 1) {
      throw { status: 409, message: "Access request conflicts with multiple staff accounts" };
    }

    const staffValues = {
      email: claimed.email,
      username: claimed.username,
      passwordHash: claimed.passwordHash,
      displayName: claimed.fullName,
      role: claimed.requestedRole,
      permissions: claimed.requestedPermissions,
      active: true,
      disabledAt: null,
      updatedBy: `access-request:${reviewerEmail}`,
      updatedAt: now,
    };

    const [staff] = existingStaff[0]
      ? await tx.update(adminStaff)
        .set(staffValues)
        .where(eq(adminStaff.id, existingStaff[0].id))
        .returning()
      : await tx.insert(adminStaff)
        .values({ ...staffValues, createdBy: `access-request:${reviewerEmail}` })
        .returning();

    // Task #690 — flush the admin-identity cache so the freshly-created
    // (or re-activated) staff row resolves immediately in audit panels.
    invalidateAdminIdentityCache(staff.id, staff.email, staff.username);

    await tx.update(adminStaffAccessRequests)
      .set({ createdStaffId: staff.id, updatedAt: now })
      .where(eq(adminStaffAccessRequests.id, claimed.id));

    return {
      status: "approved",
      alreadyReviewed: false,
      requestId: claimed.id,
      staffId: staff.id,
      accessType: claimed.requestedAccessType,
      redirectPath: claimed.requestedAccessType === "main_admin" ? "/admin/dashboard" : "/staff/dashboard",
      message: "Access request approved. The account can now sign in.",
    };
  });

  await auditAccessRequest("admin_staff_access_request_approve", request, reviewerEmail, {
    createdStaffId: result.staffId,
    alreadyReviewed: result.alreadyReviewed,
  });

  return result;
}

export async function rejectAdminAccessRequest(token: string) {
  const { request, reviewerEmail } = await findRequestByToken(token, "reject");

  if (request.status !== "pending") {
    return alreadyReviewedResult(request);
  }

  const now = new Date();
  if (request.tokenExpiresAt && request.tokenExpiresAt < now) {
    await expirePendingRequest(request.id);
    return { status: "expired", alreadyReviewed: true, requestId: request.id, message: "This rejection link has expired." };
  }

  const [rejected] = await db.update(adminStaffAccessRequests)
    .set({ status: "rejected", rejectedByEmail: reviewerEmail, reviewedAt: now, updatedAt: now })
    .where(and(eq(adminStaffAccessRequests.id, request.id), eq(adminStaffAccessRequests.status, "pending")))
    .returning();

  const reviewed = rejected || request;
  await auditAccessRequest("admin_staff_access_request_reject", reviewed, reviewerEmail, { alreadyReviewed: !rejected });

  if (!rejected) {
    return alreadyReviewedResult(reviewed);
  }

  return {
    status: "rejected",
    alreadyReviewed: false,
    requestId: rejected.id,
    accessType: rejected.requestedAccessType,
    message: "Access request rejected. The account was not activated.",
  };
}
