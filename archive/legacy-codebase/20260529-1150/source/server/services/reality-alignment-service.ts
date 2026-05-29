import { db } from "../db";
import {
  realityClaims, claimEvidence, consensusRecords,
  type InsertRealityClaim, type InsertClaimEvidence,
} from "@shared/schema";
import { eq, desc, sql, and, gte, count } from "drizzle-orm";

type ClaimStatus = "unverified" | "contested" | "supported" | "consensus";
type EvidenceType = "supporting" | "contradicting" | "neutral";
type AgentRole = "researcher" | "skeptic" | "analyst" | "validator" | "synthesizer";

const STATUS_THRESHOLDS = {
  contested: { minContradictions: 1 },
  supported: { minAgreement: 0.65, minEvidence: 3 },
  consensus: { minAgreement: 0.85, minEvidence: 5, minEvaluations: 3 },
};

class RealityAlignmentService {
  async extractClaim(data: InsertRealityClaim) {
    const [claim] = await db.insert(realityClaims).values({
      ...data,
      confidenceScore: data.confidenceScore ?? 0.5,
      status: "unverified",
    }).returning();
    return claim;
  }

  async addEvidence(data: InsertClaimEvidence) {
    const [evidence] = await db.insert(claimEvidence).values(data).returning();
    await this.recalculateConfidence(data.claimId);
    return evidence;
  }

  async recalculateConfidence(claimId: string): Promise<void> {
    const [claim] = await db.select().from(realityClaims).where(eq(realityClaims.id, claimId));
    if (!claim) return;

    const evidenceList = await db.select().from(claimEvidence)
      .where(eq(claimEvidence.claimId, claimId));

    if (evidenceList.length === 0) return;

    let supportWeight = 0, contradictWeight = 0, totalWeight = 0;
    for (const e of evidenceList) {
      const w = e.weight * e.trustScore;
      totalWeight += w;
      if (e.evidenceType === "supporting") supportWeight += w;
      else if (e.evidenceType === "contradicting") contradictWeight += w;
    }

    const agreementLevel = totalWeight > 0 ? supportWeight / totalWeight : 0;
    const evidenceStrength = Math.min(1, evidenceList.length / 10);
    const contradictionCount = evidenceList.filter(e => e.evidenceType === "contradicting").length;

    const confidence = (agreementLevel * 0.5) + (evidenceStrength * 0.3) + (claim.confidenceScore * 0.2);

    const prevStatus = claim.status;
    let newStatus: ClaimStatus = "unverified";

    if (contradictionCount >= STATUS_THRESHOLDS.contested.minContradictions && agreementLevel < 0.65) {
      newStatus = "contested";
    } else if (agreementLevel >= STATUS_THRESHOLDS.consensus.minAgreement &&
               evidenceList.length >= STATUS_THRESHOLDS.consensus.minEvidence &&
               claim.evaluationCount >= STATUS_THRESHOLDS.consensus.minEvaluations) {
      newStatus = "consensus";
    } else if (agreementLevel >= STATUS_THRESHOLDS.supported.minAgreement &&
               evidenceList.length >= STATUS_THRESHOLDS.supported.minEvidence) {
      newStatus = "supported";
    }

    await db.update(realityClaims).set({
      confidenceScore: Math.round(confidence * 100) / 100,
      agreementLevel: Math.round(agreementLevel * 100) / 100,
      evidenceStrength: Math.round(evidenceStrength * 100) / 100,
      contradictionCount,
      evaluationCount: claim.evaluationCount + 1,
      status: newStatus,
      updatedAt: new Date(),
    }).where(eq(realityClaims.id, claimId));

    if (prevStatus !== newStatus) {
      await db.insert(consensusRecords).values({
        claimId,
        previousStatus: prevStatus,
        newStatus,
        previousConfidence: claim.confidenceScore,
        newConfidence: confidence,
        participantCount: new Set(evidenceList.map(e => e.submittedBy)).size,
        evidenceCount: evidenceList.length,
        trigger: "evidence_added",
      });
    }
  }

  getAgentDebateRole(index: number): AgentRole {
    const roles: AgentRole[] = ["researcher", "skeptic", "analyst", "validator", "synthesizer"];
    return roles[index % roles.length];
  }

  getRoleSystemPrompt(role: AgentRole): string {
    const prompts: Record<AgentRole, string> = {
      researcher: "You are a researcher. Find relevant evidence and cite sources. Focus on factual accuracy.",
      skeptic: "You are a skeptic. Challenge claims, identify logical fallacies, and demand evidence.",
      analyst: "You are an analyst. Evaluate evidence quality, identify biases, and assess methodology.",
      validator: "You are a validator. Cross-reference claims against known facts and identify consistency.",
      synthesizer: "You are a synthesizer. Combine perspectives, identify common ground, and propose conclusions.",
    };
    return prompts[role];
  }

  async getClaim(claimId: string) {
    const [claim] = await db.select().from(realityClaims).where(eq(realityClaims.id, claimId));
    if (!claim) return null;

    const evidence = await db.select().from(claimEvidence)
      .where(eq(claimEvidence.claimId, claimId))
      .orderBy(desc(claimEvidence.weight));

    const history = await db.select().from(consensusRecords)
      .where(eq(consensusRecords.claimId, claimId))
      .orderBy(desc(consensusRecords.createdAt));

    return { ...claim, evidence, history };
  }

  async getClaims(opts: { status?: string; domain?: string; limit?: number } = {}) {
    const conditions = [];
    if (opts.status) conditions.push(eq(realityClaims.status, opts.status));
    if (opts.domain) conditions.push(eq(realityClaims.domain, opts.domain));

    const query = db.select().from(realityClaims)
      .orderBy(desc(realityClaims.updatedAt))
      .limit(opts.limit || 50);

    if (conditions.length > 0) return query.where(and(...conditions));
    return query;
  }

  async getFounderAnalytics() {
    const [claimStats] = await db.select({
      total: count(),
      unverified: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.status} = 'unverified')`,
      contested: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.status} = 'contested')`,
      supported: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.status} = 'supported')`,
      consensus: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.status} = 'consensus')`,
      avgConfidence: sql<number>`COALESCE(AVG(${realityClaims.confidenceScore}), 0)`,
      avgAgreement: sql<number>`COALESCE(AVG(${realityClaims.agreementLevel}), 0)`,
    }).from(realityClaims);

    const [evidenceStats] = await db.select({
      total: count(),
      supporting: sql<number>`COUNT(*) FILTER (WHERE ${claimEvidence.evidenceType} = 'supporting')`,
      contradicting: sql<number>`COUNT(*) FILTER (WHERE ${claimEvidence.evidenceType} = 'contradicting')`,
      neutral: sql<number>`COUNT(*) FILTER (WHERE ${claimEvidence.evidenceType} = 'neutral')`,
      avgWeight: sql<number>`COALESCE(AVG(${claimEvidence.weight}), 0)`,
    }).from(claimEvidence);

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [transitions24h] = await db.select({ count: count() })
      .from(consensusRecords)
      .where(gte(consensusRecords.createdAt, dayAgo));

    const recentTransitions = await db.select().from(consensusRecords)
      .orderBy(desc(consensusRecords.createdAt))
      .limit(20);

    return {
      claims: {
        total: claimStats?.total || 0,
        statusDistribution: {
          unverified: claimStats?.unverified || 0,
          contested: claimStats?.contested || 0,
          supported: claimStats?.supported || 0,
          consensus: claimStats?.consensus || 0,
        },
        avgConfidence: Math.round((claimStats?.avgConfidence || 0) * 100) / 100,
        avgAgreement: Math.round((claimStats?.avgAgreement || 0) * 100) / 100,
      },
      evidence: {
        total: evidenceStats?.total || 0,
        typeDistribution: {
          supporting: evidenceStats?.supporting || 0,
          contradicting: evidenceStats?.contradicting || 0,
          neutral: evidenceStats?.neutral || 0,
        },
        avgWeight: Math.round((evidenceStats?.avgWeight || 0) * 100) / 100,
      },
      transitions24h: transitions24h?.count || 0,
      recentTransitions,
    };
  }
}

export const realityAlignmentService = new RealityAlignmentService();
