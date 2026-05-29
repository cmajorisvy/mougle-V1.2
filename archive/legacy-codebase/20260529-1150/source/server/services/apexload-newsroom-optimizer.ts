/**
 * ApexLoad Optimizer — scores every incoming story and decides how much
 * production effort it deserves.
 *
 * Spec §1. All decisions are draft / admin_only_internal. No publishing,
 * no hardware, no real send.
 */

import {
  ApexLoadInputSchema,
  type ApexLoadInput,
  type ProductionTier,
  SAFETY_ENVELOPE_LOCKED,
  type SafetyEnvelope,
} from "../../shared/neural-newsroom-schema";

export interface ApexLoadDecision {
  decisionId: string;
  storyId: string;
  apexScore: number;
  productionTier: ProductionTier;
  reasonCodes: string[];
  costEstimate: number;
  approvalStatus: "draft";
  visibility: "admin_only_internal";
  publicUrl: null;
  signedUrl: null;
  realSendAllowed: false;
  executionEnabled: false;
  hardwareSendAllowed: false;
  notPublished: true;
  safetyEnvelope: SafetyEnvelope;
  createdAt: string;
}

function routeTier(score: number): ProductionTier {
  if (score < 40) return "text_only";
  if (score < 60) return "voice_summary";
  if (score < 75) return "newsroom_read";
  if (score < 90) return "full_visual_package";
  return "cinematic_4d_treatment";
}

const TIER_COST: Record<ProductionTier, number> = {
  text_only: 0,
  voice_summary: 0.02,
  newsroom_read: 0.08,
  full_visual_package: 0.35,
  cinematic_4d_treatment: 1.2,
};

export class ApexLoadOptimizerService {
  private recent: ApexLoadDecision[] = [];

  listRecent(limit = 50): ApexLoadDecision[] {
    return this.recent.slice(-limit).reverse();
  }

  decide(raw: ApexLoadInput): ApexLoadDecision {
    const input = ApexLoadInputSchema.parse(raw);
    // Weighted formula (Spec §1).
    const apexScore =
      0.25 * input.impactScore +
      0.20 * (input.sourceReliability * 100) +
      0.15 * (input.verificationConfidence * 100) +
      0.10 * input.freshnessScore +
      0.10 * input.regionalImportance +
      0.10 * input.publicInterest +
      0.05 * input.visualPotential +
      0.05 * input.rightsReadiness;

    const tier = routeTier(apexScore);

    const reasonCodes: string[] = [];
    if (input.sourceReliability < 0.5) reasonCodes.push("low_source_reliability");
    if (input.verificationConfidence < 0.5) reasonCodes.push("low_verification");
    if (input.rightsReadiness < 50) reasonCodes.push("rights_not_ready");
    if (input.impactScore >= 80) reasonCodes.push("high_impact");
    if (input.freshnessScore >= 80) reasonCodes.push("fresh");
    if (input.visualPotential < 30) reasonCodes.push("low_visual_potential");
    reasonCodes.push(`tier:${tier}`);

    const decision: ApexLoadDecision = {
      decisionId: `apex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      storyId: input.storyId,
      apexScore: Math.round(apexScore * 100) / 100,
      productionTier: tier,
      reasonCodes,
      costEstimate: TIER_COST[tier],
      approvalStatus: "draft",
      visibility: "admin_only_internal",
      publicUrl: null,
      signedUrl: null,
      realSendAllowed: false,
      executionEnabled: false,
      hardwareSendAllowed: false,
      notPublished: true,
      safetyEnvelope: { ...SAFETY_ENVELOPE_LOCKED },
      createdAt: new Date().toISOString(),
    };
    this.recent.push(decision);
    if (this.recent.length > 200) this.recent.splice(0, this.recent.length - 200);
    return decision;
  }
}

export const apexloadOptimizerService = new ApexLoadOptimizerService();
