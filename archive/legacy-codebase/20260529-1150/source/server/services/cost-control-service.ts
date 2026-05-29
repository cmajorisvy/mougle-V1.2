/**
 * Newsroom T10 — Cost Control gating.
 *
 * Centralized gate that decides whether a story is allowed to use
 * expensive resources (premium B-roll APIs, premium anchor render,
 * full broadcast render, shorts cutting, AI thumbnail generation).
 *
 * Spec gating conditions (all must hold for `allowed=true`):
 *   1. paidApisPaused === false                       (global kill switch)
 *   2. daily and monthly spend caps not exceeded      (cost ceiling)
 *   3. when briefId is provided:
 *       - brief.impactScore >= impactScoreThreshold  (impact gate)
 *       - confidence >= confidenceThreshold          (confidence gate)
 *       - source/license safe (no rightsFlags / unknown license)
 *   4. when broadcastId is provided:
 *       - parent package has an active approval row  (admin approval)
 *
 * Every decision (allow or block) is appended to `cost_events`. The
 * table is treated as immutable from the application layer — no
 * UPDATE/DELETE paths exist.
 */

import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  broadcastPackageApprovals,
  broadcasts,
  costEvents,
  costPolicies,
  COST_KINDS,
  type CostEventRow,
  type CostKind,
  type CostPolicyRow,
} from "@shared/schema";
import { broadcastBriefs, type BroadcastBriefRow } from "../../shared/newsroom-schema";

export class CostControlError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface CanSpendInput {
  kind: CostKind;
  briefId?: string | null;
  broadcastId?: string | null;
  estUsd?: number;
  metadata?: Record<string, unknown>;
  /** Skip the audit log insert (used by the read-only preview endpoint). */
  skipAudit?: boolean;
}

export interface CanSpendResult {
  allowed: boolean;
  reasons: string[];
  policy: CostPolicyRow;
  spend: { dailyUsd: number; monthlyUsd: number };
  eventId: string | null;
}

const DEFAULT_POLICY = {
  id: "singleton",
  dailyCapUsd: 5,
  monthlyCapUsd: 100,
  paidApisPaused: true,
  impactScoreThreshold: 70,
  confidenceThreshold: 0.7,
} as const;

const IMPACT_MAP: Record<string, number> = {
  high: 85,
  medium: 55,
  low: 25,
};

function impactScoreFor(brief: BroadcastBriefRow): number {
  const raw = (brief.impactScore || "").toLowerCase();
  return IMPACT_MAP[raw] ?? (Number.parseFloat(raw) || 0);
}

export async function getPolicy(): Promise<CostPolicyRow> {
  const rows = await db.select().from(costPolicies).where(eq(costPolicies.id, "singleton")).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db
    .insert(costPolicies)
    .values({
      id: "singleton",
      dailyCapUsd: DEFAULT_POLICY.dailyCapUsd,
      monthlyCapUsd: DEFAULT_POLICY.monthlyCapUsd,
      paidApisPaused: DEFAULT_POLICY.paidApisPaused,
      impactScoreThreshold: DEFAULT_POLICY.impactScoreThreshold,
      confidenceThreshold: DEFAULT_POLICY.confidenceThreshold,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [after] = await db.select().from(costPolicies).where(eq(costPolicies.id, "singleton")).limit(1);
  return after;
}

export interface UpdatePolicyInput {
  dailyCapUsd?: number;
  monthlyCapUsd?: number;
  paidApisPaused?: boolean;
  impactScoreThreshold?: number;
  confidenceThreshold?: number;
  updatedBy: string;
}

export async function updatePolicy(input: UpdatePolicyInput): Promise<CostPolicyRow> {
  await getPolicy();
  const patch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: input.updatedBy };
  if (typeof input.dailyCapUsd === "number") {
    if (input.dailyCapUsd < 0) throw new CostControlError("invalid_daily_cap", "dailyCapUsd must be >= 0");
    patch.dailyCapUsd = input.dailyCapUsd;
  }
  if (typeof input.monthlyCapUsd === "number") {
    if (input.monthlyCapUsd < 0) throw new CostControlError("invalid_monthly_cap", "monthlyCapUsd must be >= 0");
    patch.monthlyCapUsd = input.monthlyCapUsd;
  }
  if (typeof input.paidApisPaused === "boolean") patch.paidApisPaused = input.paidApisPaused;
  if (typeof input.impactScoreThreshold === "number") {
    if (input.impactScoreThreshold < 0 || input.impactScoreThreshold > 100) {
      throw new CostControlError("invalid_impact_threshold", "impactScoreThreshold must be 0..100");
    }
    patch.impactScoreThreshold = input.impactScoreThreshold;
  }
  if (typeof input.confidenceThreshold === "number") {
    if (input.confidenceThreshold < 0 || input.confidenceThreshold > 1) {
      throw new CostControlError("invalid_confidence_threshold", "confidenceThreshold must be 0..1");
    }
    patch.confidenceThreshold = input.confidenceThreshold;
  }
  const [row] = await db.update(costPolicies).set(patch).where(eq(costPolicies.id, "singleton")).returning();
  return row;
}

export async function pausePaidApis(actor: string): Promise<CostPolicyRow> {
  return updatePolicy({ paidApisPaused: true, updatedBy: actor });
}

export async function resumePaidApis(actor: string): Promise<CostPolicyRow> {
  return updatePolicy({ paidApisPaused: false, updatedBy: actor });
}

async function computeSpend(): Promise<{ dailyUsd: number; monthlyUsd: number }> {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daily = await db
    .select({ s: sql<string>`COALESCE(SUM(${costEvents.actualUsd}), 0)` })
    .from(costEvents)
    .where(and(eq(costEvents.allowed, true), gte(costEvents.createdAt, dayStart)));
  const monthly = await db
    .select({ s: sql<string>`COALESCE(SUM(${costEvents.actualUsd}), 0)` })
    .from(costEvents)
    .where(and(eq(costEvents.allowed, true), gte(costEvents.createdAt, monthStart)));
  return {
    dailyUsd: Number.parseFloat(daily[0]?.s ?? "0") || 0,
    monthlyUsd: Number.parseFloat(monthly[0]?.s ?? "0") || 0,
  };
}

export async function getSpend(): Promise<{ dailyUsd: number; monthlyUsd: number }> {
  return computeSpend();
}

async function loadBrief(briefId: string): Promise<BroadcastBriefRow | null> {
  try {
    const rows = await db.select().from(broadcastBriefs).where(eq(broadcastBriefs.id, briefId)).limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function isBroadcastApproved(broadcastId: string): Promise<{ approved: boolean; broadcast: typeof broadcasts.$inferSelect | null }> {
  const rows = await db.select().from(broadcasts).where(eq(broadcasts.id, broadcastId)).limit(1);
  const bc = rows[0];
  if (!bc) return { approved: false, broadcast: null };
  const appr = await db
    .select({ packageId: broadcastPackageApprovals.packageId })
    .from(broadcastPackageApprovals)
    .where(and(
      eq(broadcastPackageApprovals.packageId, bc.packageId),
      isNull(broadcastPackageApprovals.revokedAt),
    ))
    .limit(1);
  return { approved: appr.length > 0, broadcast: bc };
}

export async function canSpend(input: CanSpendInput): Promise<CanSpendResult> {
  if (!COST_KINDS.includes(input.kind)) {
    throw new CostControlError("invalid_kind", `Unknown cost kind: ${input.kind}`);
  }
  const policy = await getPolicy();
  const spend = await computeSpend();
  const reasons: string[] = [];

  if (policy.paidApisPaused) reasons.push("paid_apis_paused");

  const estUsd = Math.max(0, input.estUsd ?? 0);
  if (spend.dailyUsd + estUsd > policy.dailyCapUsd) reasons.push("daily_cap_exceeded");
  if (spend.monthlyUsd + estUsd > policy.monthlyCapUsd) reasons.push("monthly_cap_exceeded");

  let broadcastSources: Array<{ license: string }> | null = null;
  if (input.broadcastId) {
    const { approved, broadcast } = await isBroadcastApproved(input.broadcastId);
    if (!broadcast) {
      reasons.push("broadcast_not_found");
    } else {
      if (!approved) reasons.push("broadcast_not_approved");
      broadcastSources = (broadcast.manifestJson?.sources ?? []) as Array<{ license: string }>;
    }
  }

  if (input.briefId) {
    const brief = await loadBrief(input.briefId);
    if (!brief) {
      reasons.push("brief_not_found");
    } else {
      if (brief.approvalStatus !== "approved") reasons.push("brief_not_approved");
      const impact = impactScoreFor(brief);
      if (impact < policy.impactScoreThreshold) reasons.push("impact_score_below_threshold");
      if (brief.rightsFlags?.hasRestrictions) reasons.push("license_restricted");
      const sens = brief.sensitivity;
      if (sens?.disputed || sens?.minors || sens?.graphicViolence) {
        reasons.push("sensitive_content_blocked");
      }
    }
  }

  if (broadcastSources) {
    const unknown = broadcastSources.some((s) => !s.license || s.license === "unknown");
    if (unknown) reasons.push("unknown_license_in_sources");
  }

  const allowed = reasons.length === 0;

  let eventId: string | null = null;
  if (!input.skipAudit) {
    const [row] = await db
      .insert(costEvents)
      .values({
        kind: input.kind,
        briefId: input.briefId ?? null,
        broadcastId: input.broadcastId ?? null,
        estUsd,
        actualUsd: allowed ? estUsd : 0,
        allowed,
        reasons,
        metadata: input.metadata ?? {},
      })
      .returning({ id: costEvents.id });
    eventId = row?.id ?? null;
  }

  return { allowed, reasons, policy, spend, eventId };
}

/**
 * Convenience helper: throws CostControlError if the spend is blocked.
 * Returns the audit event id on allow.
 */
export async function assertCanSpend(input: CanSpendInput): Promise<string | null> {
  const r = await canSpend(input);
  if (!r.allowed) {
    throw new CostControlError(
      "spend_blocked",
      `Cost control refused ${input.kind}: ${r.reasons.join(", ")}`,
      403,
    );
  }
  return r.eventId;
}

export async function listRecentEvents(limit = 100): Promise<CostEventRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  return db
    .select()
    .from(costEvents)
    .orderBy(sql`${costEvents.createdAt} DESC`)
    .limit(safeLimit);
}

export const costControlService = {
  COST_KINDS,
  getPolicy,
  updatePolicy,
  pausePaidApis,
  resumePaidApis,
  canSpend,
  assertCanSpend,
  getSpend,
  listRecentEvents,
};
