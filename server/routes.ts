import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import multer from "multer";
import { insertPostSchema, insertCommentSchema, insertClaimSchema, insertEvidenceSchema } from "@shared/schema";
import { authService, signupSchema, generateApiToken } from "./services/auth-service";
import { discussionService } from "./services/discussion-service";
import { trustEngine } from "./services/trust-engine";
import { agentService } from "./services/agent-service";
import { reputationService } from "./services/reputation-service";
import { capabilityService } from "./services/capability-service";
import { journeyService } from "./services/journey-service";
import { agentOrchestrator } from "./services/agent-orchestrator";
import { economyService } from "./services/economy-service";
import { agentLearningService } from "./services/agent-learning-service";
import { collaborationService } from "./services/agent-collaboration-service";
import { teamOrchestrationService } from "./services/team-orchestration-service";
import { civilizationStabilityService } from "./services/civilization-stability-service";
import { platformFlywheelService } from "./services/platform-flywheel-service";
import { governanceService } from "./services/governance-service";
import { civilizationService } from "./services/civilization-service";
import { evolutionService } from "./services/evolution-service";
import { ethicsService } from "./services/ethics-service";
import { collectiveIntelligenceService } from "./services/collective-intelligence-service";
import { billingService, CREDIT_COSTS } from "./services/billing-service";
import { storage } from "./storage";
import { db } from "./db";
import {
  users as users_table,
  adminStaff as adminStaff_table,
  posts as posts_table,
  topics as topics_table,
  liveDebates as liveDebates_table,
  insertTopicSchema,
  userAgents as userAgents_table,
  agentPurchases as agentPurchases_table,
  transactions as transactions_table,
  creditUsageLog,
  projectPackagePurchases,
  appExports as appExports_table,
  networkGravity,
  civilizationMetrics,
  labsApps,
} from "@shared/schema";
import { eq, desc, asc, sql, and, gte } from "drizzle-orm";
import * as debateOrchestrator from "./services/debate-orchestrator";
import * as contentFlywheel from "./services/content-flywheel-service";
import { newsPipelineService } from "./services/news-pipeline-service";
import { invalidateAdminIdentityCache } from "./services/admin-identity-resolver";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { moderateContent, moderateUsername, recordViolation, isUserSpammer, isUserShadowBanned, sanitizeHTML, sanitizeLinks, getUserModerationStatus, stripLinksForSpammer, type ContentCategory } from "./services/content-moderation-service";
import { postCooldownMiddleware } from "./middleware/rate-limiter";
import { aiGateway } from "./services/ai-gateway";
import { agentProgressionService } from "./services/agent-progression-service";
import { seedIndustryData } from "./services/industry-seed";
import { industries, industryCategories, agentRoles as agentRolesTable, knowledgePacks, agentSkillNodes, agentSpecializations, agentCertifications, agentTrustProfiles, agentTrustEvents, agentTrustHistory } from "@shared/schema";
import { agentTrustEngine } from "./services/agent-trust-engine";
import { personalAgentService } from "./services/personal-agent-service";
import { privacyGatewayService } from "./services/privacy-gateway-service";
import { trustMoatService } from "./services/trust-moat-service";
import { hybridNetwork } from "./services/hybrid-network";
import { intelligenceRoadmapService } from "./services/intelligence-roadmap-service";
import { userPsychologyService } from "./services/user-psychology-service";
import { psychologyMonetizationService } from "./services/psychology-monetization-service";
import { riskManagementService } from "./services/risk-management-service";
import { labsService } from "./services/labs-service";
import { labsFlywheelService } from "./services/labs-flywheel-service";
import { superLoopService } from "./services/super-loop-service";
import { phaseTransitionService } from "./services/phase-transition-service";
import { razorpayMarketplaceService } from "./services/razorpay-marketplace-service";
import { publisherResponsibilityService } from "./services/publisher-responsibility-service";
import { legalSafetyService } from "./services/legal-safety-service";
import { creatorVerificationService } from "./services/creator-verification-service";
import { trustLadderService } from "./services/trust-ladder-service";
import { healthyEngagementService } from "./services/healthy-engagement-service";
import { pricingEngineService } from "./services/pricing-engine-service";
import { aiCfoService } from "./services/ai-cfo-service";
import { truthEvolutionService } from "./services/truth-evolution-service";
import { realityAlignmentService } from "./services/reality-alignment-service";
import { intelligenceStackRegistry } from "./services/intelligence-stack-registry";
import { intelligenceStackAnalytics } from "./services/intelligence-stack-analytics";
import { founderDebugService } from "./services/founder-debug-service";
import { panicButtonService } from "./services/panic-button-service";
import { stabilityTriangleService } from "./services/stability-triangle-service";
import { gcisService } from "./services/gcis-service";
import { adaptivePolicyService } from "./services/adaptive-policy-service";
import { requireAuth } from "./middleware/auth";
import { requireExternalAgent, requireExternalAgentCapability } from "./middleware/external-agent-auth";
import { agentExportService } from "./services/agent-export-service";
import { agentPassportRevocationService } from "./services/agent-passport-revocation-service";
import { intelligenceGraphService } from "./services/intelligence-graph-service";
import { listSystemAgents, seedSystemAgents, setSystemAgentEnabled } from "./services/system-agent-seed";
import { approveAdminAccessRequest, rejectAdminAccessRequest, submitAdminAccessRequest } from "./services/admin-access-request-service";
import { agentActionTypes } from "./services/agent-action-registry";
import { simulateAgentBehaviorDecision } from "./services/agent-behavior-engine";
import { agentGraphAccessPurposes, agentGraphRequesterTypes, agentGraphAccessService } from "./services/agent-graph-access-service";
import { unifiedEvolutionService } from "./services/unified-evolution-service";
import { civilizationHealthService } from "./services/civilization-health-service";
import { isPublicMemoryContext, memoryAccessPolicyService, memoryContextTypes, type MemoryContextType } from "./services/memory-access-policy";
import { newsToDebateService } from "./services/news-to-debate-service";
import { podcastScriptEngine } from "./services/podcast-script-engine";
import { podcastVoiceService } from "./services/podcast-voice-service";
import { youtubePublishingService } from "./services/youtube-publishing-service";
import { socialDistributionApprovalService } from "./services/social-distribution-approval-service";
import { userAgentBuilderService } from "./services/user-agent-builder-service";
import { agentRunnerService as userAgentRunnerService } from "./services/agent-runner-service";
import { agentMarketplaceCloneService, marketplaceCloneExportModes } from "./services/agent-marketplace-clone-service";
import { safeModeControlFields, safeModeService } from "./services/safe-mode-service";
import { knowledgeGraphService } from "./services/knowledge-graph-service";
import { knowledgeEconomyService } from "./services/knowledge-economy-service";
import { gluonValueIndexService, gviComponentKeys } from "./services/gluon-value-index-service";
import { gluonRedemptionComplianceService } from "./services/gluon-redemption-compliance-service";
import { liveDebateStudioService } from "./services/live-debate-studio-service";
import { externalAgentApiService, externalAgentCapabilities } from "./services/external-agent-api-service";
import { digitalWorldOverviewService } from "./services/digital-world-overview-service";
import { avatarVideoRenderProviders, avatarVideoSceneTemplates, avatarVideoRenderService } from "./services/avatar-video-render-service";
import { createCaptionsSrtHandler as createCaptionsSrtRouteHandler, createPreviewMp4Handler as createPreviewMp4RouteHandler } from "./services/render-srt-service";
import { marketplaceReviewTrustService } from "./services/marketplace-review-trust-service";
import { councilGovernanceService } from "./services/council-governance-service";
import {
  getAdminVerification as getAdminVerificationShared,
  requireAdmin as requireAdminShared,
  requireRootAdmin as requireRootAdminShared,
  isRootAdmin as isRootAdminShared,
  requireAdminPermission as requireAdminPermissionShared,
  requireAnyAdminPermission as requireAnyAdminPermissionShared,
} from "./middleware/admin-auth";

export const getAdminVerification = getAdminVerificationShared;
const requireAdmin = requireAdminShared;
const isRootAdmin = isRootAdminShared;
export const requireRootAdmin = requireRootAdminShared;
const requireAdminPermission = requireAdminPermissionShared;
const requireAnyAdminPermission = requireAnyAdminPermissionShared;
import { registerNewsroomPreviewRoutes } from "./routes/newsroom-preview-routes";
import { registerNeuralNewsroomRoutes } from "./routes/neural-newsroom-routes";
import { registerOmniChannelAudienceRoutes } from "./routes/omni-channel-audience-routes";
import { registerFounderPtoModeRoutes } from "./routes/founder-pto-mode-routes";
import { registerBroadcastBriefRoutes } from "./routes/broadcast-briefs";
import { registerNewsroomPackageRoutes } from "./routes/newsroom-packages";
import { registerCinemaControlRoutes } from "./routes/cinema-control-routes";
import { registerAutopilotNewsroomRoutes } from "./routes/autopilot-newsroom-routes";
import { registerProductionHouseRoutes } from "./routes/production-house-routes";
import { registerPreviewStudioRoutes } from "./routes/preview-studio-routes";
import { registerNewsSourceRoutes } from "./routes/news-sources";
import { registerBroadcastRoutes } from "./routes/broadcasts";
import { registerBRollRoutes } from "./routes/broll";
import { registerShortsRoutes } from "./routes/shorts";
import { registerCostRoutes } from "./routes/cost";
import { registerAnchorRoutes } from "./routes/anchor";
import { registerPlayoutQueueRoutes } from "./routes/playout";
import { registerSafetyReportRoutes } from "./routes/safety-report";
import { registerProductionAssetRoutes } from "./routes/admin/production-assets";
import { registerProductionRigRoutes } from "./routes/admin/production-rigs";
import { registerPermanentAvatarRoutes } from "./routes/admin/permanent-avatars";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ROOT_ADMIN_ROLE = "super_admin";
const ROOT_ADMIN_ACTOR_ID = "env-root-admin";
const ROOT_ADMIN_PERMISSIONS = ["*"];
const STAFF_MANAGE_PERMISSION = "staff:manage";
const SUPPORT_VIEW_PERMISSIONS = ["support:view", "support:manage"];
const SUPPORT_MANAGE_PERMISSIONS = ["support:manage"];
const MODERATION_VIEW_PERMISSIONS = ["moderation:view", "moderation:manage", "legal-safety:view"];
const MODERATION_MANAGE_PERMISSIONS = ["moderation:manage"];
const CONTENT_VIEW_PERMISSIONS = ["content:view", "content:manage", "news:manage"];
const CONTENT_MANAGE_PERMISSIONS = ["content:manage", "news:manage"];
const KNOWLEDGE_VIEW_PERMISSIONS = ["knowledge:view", "knowledge:manage", ...SUPPORT_VIEW_PERMISSIONS, ...CONTENT_VIEW_PERMISSIONS];
const KNOWLEDGE_MANAGE_PERMISSIONS = ["knowledge:manage", ...SUPPORT_MANAGE_PERMISSIONS, ...CONTENT_MANAGE_PERMISSIONS];
const AI_OPS_VIEW_PERMISSIONS = ["ai:ops", "ai:manage", "costs:view"];
const BILLING_VIEW_PERMISSIONS = ["billing:view", "revenue:view"];
const RISK_VIEW_PERMISSIONS = ["audit:view", "risk:manage", "compliance:manage"];
const RISK_MANAGE_PERMISSIONS = ["risk:manage", "compliance:manage"];
const OPERATIONS_VIEW_PERMISSIONS = ["operations:view", "operations:manage", "build:manage"];
const OPERATIONS_MANAGE_PERMISSIONS = ["operations:manage", "build:manage"];
const SEO_VIEW_PERMISSIONS = ["seo:view", "seo:manage", ...CONTENT_VIEW_PERMISSIONS];
const MARKETING_VIEW_PERMISSIONS = ["marketing:view", "marketing:manage", ...CONTENT_VIEW_PERMISSIONS];
const COMPLIANCE_VIEW_PERMISSIONS = ["compliance:view", "compliance:manage", ...RISK_VIEW_PERMISSIONS];
const COMPLIANCE_MANAGE_PERMISSIONS = ["compliance:manage", ...RISK_MANAGE_PERMISSIONS];
const INTERNAL_DEBATE_STATUSES = new Set(["draft", "internal", "admin_review"]);

const agentBehaviorSimulationSchema = z.object({
  agentId: z.string().min(1),
  actionType: z.enum(agentActionTypes).optional(),
  event: z.object({
    type: z.string().min(1).optional(),
    topic: z.string().optional(),
    targetId: z.string().optional(),
    content: z.string().optional(),
  }).optional(),
  metrics: z.object({
    goalAlignment: z.number().min(0).max(1).optional(),
    trustImpact: z.number().min(0).max(1).optional(),
    userValue: z.number().min(0).max(1).optional(),
    rewardPotential: z.number().min(0).max(1).optional(),
    risk: z.number().min(0).max(1).optional(),
    cost: z.number().min(0).max(1).optional(),
  }).optional(),
  costBudget: z.number().min(0).max(1).optional(),
  memoryScope: z.enum(["none", "public", "behavioral", "private"]).optional(),
  allowPrivateMemory: z.boolean().optional(),
  includeGraphContext: z.boolean().optional(),
  graphQuery: z.string().optional(),
  graphPurpose: z.enum(agentGraphAccessPurposes).optional(),
  graphAllowHypotheses: z.boolean().optional(),
  graphExplicitBusinessPermission: z.boolean().optional(),
  graphMinimumConfidence: z.number().min(0).max(1).optional(),
  includeKnowledgePacketContext: z.boolean().optional(),
  knowledgePacketQuery: z.string().optional(),
  knowledgePacketAllowHypotheses: z.boolean().optional(),
  knowledgePacketExplicitBusinessPermission: z.boolean().optional(),
  knowledgePacketMinimumConfidence: z.number().min(0).max(1).optional(),
  knowledgePacketLimit: z.number().min(1).max(12).optional(),
});

const agentGraphAccessEvaluateSchema = z.object({
  requesterType: z.enum(agentGraphRequesterTypes),
  requesterAgentId: z.string().min(1).optional(),
  purpose: z.enum(agentGraphAccessPurposes),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(30).optional(),
  allowHypotheses: z.boolean().optional(),
  explicitBusinessPermission: z.boolean().optional(),
  minimumConfidence: z.number().min(0).max(1).optional(),
});

const socialDistributionGenerateSchema = z.object({
  youtubePackageId: z.number().int().positive(),
  targetPlatforms: z.array(z.string().min(1)).optional(),
  mode: z.enum(["manual", "safe_automation"]).optional(),
});

const socialDistributionAutomationSettingsSchema = z.object({
  safeAutomationEnabled: z.boolean().optional(),
  paused: z.boolean().optional(),
  killSwitch: z.boolean().optional(),
  perPlatformEnabled: z.record(z.object({
    enabled: z.boolean(),
    dailyLimit: z.number().int().min(0).optional(),
  })).optional(),
  dailyPostLimit: z.number().int().min(0).max(50).optional(),
  duplicateWindowHours: z.number().int().min(1).max(720).optional(),
  trustThreshold: z.number().min(0).max(1).optional(),
  uesThreshold: z.number().min(0).max(1).optional(),
});

const safeModeUpdateSchema = z.object({
  globalSafeMode: z.boolean().optional(),
  pauseAutonomousPublishing: z.boolean().optional(),
  pauseMarketplaceApprovals: z.boolean().optional(),
  pauseExternalAgentActions: z.boolean().optional(),
  pauseSocialDistributionAutomation: z.boolean().optional(),
  pauseYouTubeUploads: z.boolean().optional(),
  pausePodcastAudioGeneration: z.boolean().optional(),
  maintenanceBannerEnabled: z.boolean().optional(),
  maintenanceBannerMessage: z.string().max(500).nullable().optional(),
  reason: z.string().trim().min(1, "A non-empty reason/comment is required."),
});

const safeModeActionSchema = z.object({
  action: z.enum(safeModeControlFields),
  enabled: z.boolean(),
  maintenanceBannerMessage: z.string().max(500).nullable().optional(),
  reason: z.string().trim().min(1, "A non-empty reason/comment is required."),
});

const externalAgentCapabilitySchema = z.enum(externalAgentCapabilities);

const externalAgentKeyCreateSchema = z.object({
  userId: z.string().trim().min(1).max(160).nullable().optional(),
  agentId: z.string().trim().min(1).max(160).nullable().optional(),
  label: z.string().trim().min(1).max(120),
  capabilities: z.array(externalAgentCapabilitySchema).min(1).optional(),
  sandboxMode: z.boolean().optional(),
  active: z.boolean().optional(),
  rateLimitPerMinute: z.number().int().min(1).max(600).optional(),
  rateLimitPerDay: z.number().int().min(1).max(100000).optional(),
});

const externalAgentKeyUpdateSchema = externalAgentKeyCreateSchema.partial();

const externalAgentRevokeSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const externalAgentClaimProposalSchema = z.object({
  statement: z.string().trim().min(8).max(2000),
  subject: z.string().trim().max(240).optional(),
  sourceUrl: z.string().trim().url().max(1000).optional(),
  rationale: z.string().trim().max(2000).optional(),
});

const externalAgentEvidenceProposalSchema = z.object({
  claimId: z.string().trim().max(160).optional(),
  url: z.string().trim().url().max(1000),
  label: z.string().trim().min(3).max(300),
  evidenceType: z.string().trim().max(80).optional(),
  rationale: z.string().trim().max(2000).optional(),
});

const externalAgentCollaborationSchema = z.object({
  topic: z.string().trim().min(3).max(240),
  message: z.string().trim().min(10).max(3000),
  targetAgentId: z.string().trim().max(160).optional(),
});

const externalAgentCommentProposalSchema = z.object({
  content: z.string().trim().min(5).max(2000),
});

const externalAgentDebateJoinProposalSchema = z.object({
  position: z.enum(["for", "against", "neutral"]).optional(),
  participantType: z.string().trim().max(60).optional(),
  rationale: z.string().trim().max(2000).optional(),
});

const externalAgentDebateTurnProposalSchema = z.object({
  content: z.string().trim().min(10).max(4000),
});

const externalAgentSimulationSchema = z.object({
  actionType: z.enum(agentActionTypes).optional(),
  event: z.object({
    type: z.string().trim().max(120).optional(),
    topic: z.string().trim().max(240).optional(),
    targetId: z.string().trim().max(160).optional(),
    content: z.string().trim().max(3000).optional(),
  }).optional(),
  includeGraphContext: z.boolean().optional(),
  includeKnowledgePacketContext: z.boolean().optional(),
  allowHypotheses: z.boolean().optional(),
});

const newsToDebateGenerateSchema = z.object({
  articleId: z.number().int().positive().optional(),
  manualArticle: z.object({
    title: z.string().trim().min(8).max(300),
    sourceUrl: z.string().trim().url().max(1000),
    sourceName: z.string().trim().max(160).optional(),
    content: z.string().trim().min(40).max(30000),
    publishedAt: z.string().trim().optional(),
  }).optional(),
}).refine((data) => data.articleId || data.manualArticle, {
  message: "Provide articleId or manualArticle",
});

const podcastScriptGenerateSchema = z.object({
  debateId: z.number().int().positive(),
});

const voiceJobGenerateSchema = z.object({
  scriptPackageId: z.number().int().positive(),
  scriptType: z.enum(["two_minute", "ten_minute", "both"]).default("both"),
  provider: z.enum(["auto", "elevenlabs", "replit_openai_audio", "mock"]).default("auto"),
});

const youtubePublishingPackageSchema = z.object({
  scriptPackageId: z.number().int().positive(),
  audioJobId: z.number().int().positive().nullable().optional(),
  generatedClipId: z.number().int().positive().nullable().optional(),
});

const avatarVideoRenderJobSchema = z.object({
  scriptPackageId: z.number().int().positive(),
  audioJobId: z.number().int().positive().nullable().optional(),
  youtubePackageId: z.number().int().positive().nullable().optional(),
  provider: z.enum(avatarVideoRenderProviders).default("dry_run"),
  sceneTemplate: z.enum(avatarVideoSceneTemplates).default("news_desk"),
});

const marketplaceCloneRequestSchema = z.object({
  sourceAgentId: z.string().trim().min(1),
  exportMode: z.enum(marketplaceCloneExportModes),
  title: z.string().trim().max(160).optional(),
  description: z.string().trim().max(1200).optional(),
  category: z.string().trim().max(80).optional(),
  businessExportApproved: z.boolean().optional(),
});

const marketplaceCloneSandboxSchema = z.object({
  prompt: z.string().trim().max(1000).optional(),
});

const marketplaceReviewSubmitSchema = z.object({
  listingId: z.string().trim().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(1200),
});

const knowledgeEconomyTagSchema = z.array(z.string().trim().min(1).max(64)).max(12).optional();
const knowledgePacketPayloadSchema = z.object({
  creatorAgentId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(4).max(180),
  summary: z.string().trim().min(12).max(1200),
  abstractedContent: z.string().trim().min(20).max(12000),
  sourceType: z.string().trim().max(80).optional(),
  domainTags: knowledgeEconomyTagSchema,
  industryTags: knowledgeEconomyTagSchema,
  geoTags: knowledgeEconomyTagSchema,
  professionTags: knowledgeEconomyTagSchema,
  vaultType: z.enum(["business", "public", "behavioral", "verified"]).optional(),
  sensitivity: z.enum(["public", "low", "internal", "restricted"]).optional(),
  privacyLevel: z.string().trim().max(80).optional(),
  consentPolicy: z.record(z.any()).optional(),
  evidenceStrength: z.number().min(0).max(1).optional(),
  noveltyScore: z.number().min(0).max(1).optional(),
  usefulnessPrediction: z.number().min(0).max(1).optional(),
  riskScore: z.number().min(0).max(1).optional(),
  complianceScore: z.number().min(0).max(1).optional(),
  halfLifeDays: z.number().int().min(1).max(3650).optional(),
  parentPacketIds: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
});

const knowledgePacketReviewSchema = z.object({
  acceptingAgentId: z.string().trim().min(1).max(120).optional(),
  acceptingAgentType: z.enum(["system_agent", "user_agent", "root_admin"]).optional(),
  acceptingUserId: z.string().trim().min(1).max(120).optional(),
  domainMatch: z.number().min(0).max(1).optional(),
  receiverAuthority: z.number().min(0).max(1).optional(),
  retentionScore: z.number().min(0).max(1).optional(),
  realWorldFeedbackScore: z.number().min(0).max(1).optional(),
  rationale: z.string().trim().max(1200).optional(),
  challengeReason: z.string().trim().max(1200).optional(),
  sandboxOnly: z.boolean().optional(),
});

const knowledgePacketDnaPreviewSchema = z.object({
  agentId: z.string().trim().min(1).max(120).optional(),
});

const gviComponentValuesSchema = z.object(Object.fromEntries(
  gviComponentKeys.map((key) => [key, z.number().positive().optional()])
) as Record<typeof gviComponentKeys[number], z.ZodOptional<z.ZodNumber>>).partial();

const gviPreviewSchema = z.object({
  componentValues: gviComponentValuesSchema.optional(),
});

const redemptionEligibilityPreviewSchema = z.object({
  userId: z.string().trim().min(1).max(120),
  agentId: z.string().trim().min(1).max(120).optional(),
});

const redemptionEligibilityReviewSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

const redemptionEligibilityRejectSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

const liveStudioActionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const liveStudioQuestionSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  authorLabel: z.string().trim().max(120).optional(),
  reason: z.string().trim().max(500).optional(),
});

function publicMemoryContextFromQuery(value: unknown): MemoryContextType {
  if (typeof value === "string" && memoryContextTypes.includes(value as MemoryContextType) && isPublicMemoryContext(value as MemoryContextType)) {
    return value as MemoryContextType;
  }
  return "agent_behavior";
}

function isInternalDebateStatus(status: string | null | undefined) {
  return !!status && INTERNAL_DEBATE_STATUSES.has(status);
}

async function ensurePublicDebate(req: any, res: any) {
  const id = parseInt(req.params.id as string);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "Invalid debate id" });
    return null;
  }
  const debate = await storage.getLiveDebate(id);
  if (!debate || isInternalDebateStatus(debate.status)) {
    res.status(404).json({ message: "Debate not found" });
    return null;
  }
  return debate;
}

function rootAdminConfigured() {
  return !!ADMIN_USERNAME && !!ADMIN_PASSWORD_HASH;
}


function verifyAdminToken(req: any) {
  return !!getAdminVerification(req);
}

async function requirePaidAiAccess(
  req: any,
  res: any,
  actionType: string,
  actionLabel?: string,
  referenceId?: string,
) {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const { plan, isActive } = await billingService.getSubscriptionStatus(userId);
  const isPro = !!(isActive && plan && (plan.name === "pro" || plan.name === "expert"));

  if (!isPro) {
    const afford = await billingService.canAfford(userId, actionType);
    if (!afford.canAfford) {
      res.status(402).json({ error: "Insufficient credits" });
      return null;
    }
  }

  const cost = isPro ? 0 : (CREDIT_COSTS[actionType] || 5);
  if (cost > 0) {
    const ok = await billingService.useCredits(userId, cost, actionType, actionLabel, referenceId);
    if (!ok) {
      res.status(402).json({ error: "Insufficient credits" });
      return null;
    }
  } else {
    await storage.createCreditUsage({
      userId,
      creditsUsed: 0,
      actionType,
      actionLabel: actionLabel || null,
      referenceId: referenceId || null,
    }).catch(() => {});
  }

  return { userId, cost, isPro };
}

const DEV_USER = {
  id: "dev-user-001",
  username: "dev_tester",
  email: "dev@mougle.local",
  role: "creator" as const,
};

function resolveUser(req: any, res: any, next: any) {
  if (req.user) return next();

  if (process.env.NODE_ENV !== "production") {
    req.user = DEV_USER;
    return next();
  }

  return res.status(401).json({ message: "Authentication required" });
}

function getSessionUserId(req: any): string | null {
  if (req.user?.id) return req.user.id;
  return null;
}

function getFallbackUserId(req: any): string | null {
  return (
    req.body?.userId ||
    req.body?.authorId ||
    req.body?.creatorId ||
    req.query?.userId ||
    null
  );
}

function requireUserId(req: any, res: any): string | null {
  const sessionUserId = getSessionUserId(req);
  if (sessionUserId) return sessionUserId;

  if (process.env.NODE_ENV !== "production") {
    const fallback = getFallbackUserId(req);
    if (fallback) return fallback;
  }

  res.status(401).json({ message: "Authentication required" });
  return null;
}

function requireSystemMode(actionType: "ai" | "agent" | "publishing") {
  return (req: any, res: any, next: any) => {
    const check = panicButtonService.checkAction(actionType);
    if (!check.allowed) {
      return res.status(503).json({ message: check.reason, mode: check.mode, blocked: true });
    }
    next();
  };
}

function handleServiceError(res: any, err: any) {
  if (err && typeof err === "object" && "status" in err) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAdminAccessReviewResult(result: { status: string; message: string; redirectPath?: string }) {
  const redirectUrl = result.redirectPath || "/admin/login";
  const isApproved = result.status === "approved";
  const isRejected = result.status === "rejected";
  const accent = isApproved ? "#16a34a" : isRejected ? "#dc2626" : "#7c3aed";
  const title = isApproved ? "Access Approved" : isRejected ? "Access Rejected" : "Access Request Reviewed";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · Mougle</title>
  </head>
  <body style="margin:0;background:#060611;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
      <section style="max-width:520px;width:100%;background:#11131e;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;text-align:center;">
        <div style="width:52px;height:52px;margin:0 auto 18px;border-radius:14px;background:${accent};display:flex;align-items:center;justify-content:center;color:white;font-weight:800;">M</div>
        <h1 style="margin:0 0 10px;font-size:24px;">${title}</h1>
        <p style="margin:0 0 24px;color:#9ca3af;line-height:1.6;">${escapeHtml(result.message)}</p>
        <a href="${redirectUrl}" style="display:inline-block;background:${accent};color:white;text-decoration:none;border-radius:10px;padding:12px 22px;font-weight:700;">Continue</a>
      </section>
    </main>
  </body>
</html>`;
}

function safeExternalPost(post: any) {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    topicSlug: post.topicSlug,
    isDebate: post.isDebate,
    debateActive: post.debateActive,
    verificationScore: post.verificationScore ?? null,
    factCheckStatus: post.factCheckStatus ?? null,
    evidenceCount: post.evidenceCount ?? null,
    createdAt: post.createdAt,
  };
}

function isExternalVisibleDebate(debate: any) {
  return debate && !INTERNAL_DEBATE_STATUSES.has(String(debate.status || "").toLowerCase());
}

function safeExternalDebate(debate: any) {
  return {
    id: debate.id,
    title: debate.title,
    topic: debate.topic,
    description: debate.description,
    status: debate.status,
    format: debate.format,
    totalRounds: debate.totalRounds,
    currentRound: debate.currentRound,
    confidenceScore: debate.confidenceScore ?? null,
    consensusSummary: debate.consensusSummary ?? null,
    disagreementSummary: debate.disagreementSummary ?? null,
    startedAt: debate.startedAt,
    endedAt: debate.endedAt,
    createdAt: debate.createdAt,
  };
}

function externalAgentContext(req: any) {
  if (!req.externalAgent) {
    throw { status: 500, message: "External agent context missing" };
  }
  return req.externalAgent;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Initialize panic button system
  panicButtonService.initialize().catch(err => console.error("[PanicButton] Init error:", err));
  stabilityTriangleService.initialize();

  // ---- AUTH ----
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      const usernameCheck = moderateUsername(parsed.data.username);
      if (!usernameCheck.allowed) {
        return res.status(400).json({ message: "Content violates platform safety guidelines." });
      }
      const result = await authService.signup(parsed.data);
      res.status(201).json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agents/register", requireSystemMode("agent"), async (req, res) => {
    try {
      const data = {
        ...req.body,
        role: "agent",
        password: req.body.password || "agent_" + Math.random().toString(36).slice(2, 14),
      };
      const parsed = signupSchema.safeParse(data);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      const usernameCheck = moderateUsername(parsed.data.username);
      if (!usernameCheck.allowed) {
        return res.status(400).json({ message: "Content violates platform safety guidelines." });
      }
      const result = await authService.signup(parsed.data);
      res.status(201).json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- EXTERNAL AGENT API ----
  app.post("/api/external-agents/register", (_req, res) => {
    res.status(410).json({
      message: "External agent self-registration is disabled. Root admins must create scoped sandbox API keys in /admin/external-agents.",
      rootAdminKeyManagementRequired: true,
      sandboxOnly: true,
    });
  });

  app.get("/api/external-agents/me", requireExternalAgent, async (req: any, res) => {
    try {
      const context = externalAgentContext(req);
      res.json({
        key: {
          id: context.key.id,
          label: context.key.label,
          tokenPrefix: context.key.tokenPrefix,
          userId: context.key.userId,
          agentId: context.key.agentId,
          capabilities: context.key.capabilities,
          sandboxMode: context.key.sandboxMode,
          active: context.key.active,
          rateLimitPerMinute: context.key.rateLimitPerMinute,
          rateLimitPerDay: context.key.rateLimitPerDay,
          lastUsedAt: context.key.lastUsedAt,
        },
        safeMode: context.safeMode,
        safeguards: {
          sandboxOnly: true,
          noPrivateMemoryAccess: true,
          noBusinessMemoryAccess: true,
          noPublicPublishing: true,
          noPaymentsOrMarketplaceTransactions: true,
          noLiveActionExecution: true,
        },
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/external-agents/posts", requireExternalAgentCapability("read_public_context"), async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const topicSlug = req.query.topic as string | undefined;
      const result = await storage.getPostsPaginated({ topic: topicSlug, limit, sort: "latest" });
      res.json({
        items: result.posts.map(safeExternalPost),
        sandboxOnly: false,
        publicSafeContextOnly: true,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/external-agents/posts/:postId", requireExternalAgentCapability("read_public_context"), async (req, res) => {
    try {
      const post = await storage.getPost(req.params.postId);
      if (!post) return res.status(404).json({ message: "Post not found" });
      const comments = await storage.getComments(req.params.postId);
      res.json({
        ...safeExternalPost(post),
        comments: comments.slice(0, 100).map((c: any) => ({
          id: c.id,
          content: c.content,
          authorName: c.author?.displayName || c.author?.name || "Mougle user",
          authorRole: c.author?.role || null,
          createdAt: c.createdAt,
        })),
        publicSafeContextOnly: true,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/external-agents/posts/:postId/comments", requireExternalAgentCapability("request_collaboration", { actionLike: true }), async (req: any, res) => {
    try {
      const parsed = externalAgentCommentProposalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid comment proposal" });
      const content = sanitizeHTML(parsed.data.content);
      const modResult = moderateContent(content);
      if (!modResult.allowed) return res.status(400).json({ message: "Content violates platform safety guidelines." });
      const proposal = await externalAgentApiService.recordSandboxProposal({
        context: externalAgentContext(req),
        proposalType: "comment_proposal",
        route: req.path,
        payload: {
          postId: req.params.postId,
          content,
          capability: "request_collaboration",
        },
      });
      res.status(202).json(proposal);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/external-agents/topics", requireExternalAgentCapability("read_public_context"), async (_req, res) => {
    try {
      const topics = await storage.getTopics();
      res.json({ items: topics.map((t: any) => ({ slug: t.slug, label: t.label })), publicSafeContextOnly: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/external-agents/debates", requireExternalAgentCapability("read_public_context"), async (_req, res) => {
    try {
      const debates = await storage.getLiveDebates();
      res.json({
        items: debates.filter(isExternalVisibleDebate).map(safeExternalDebate),
        publicSafeContextOnly: true,
        internalDraftsExcluded: true,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/external-agents/debates/:id", requireExternalAgentCapability("read_public_context"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const debate = await storage.getLiveDebate(id);
      if (!debate || !isExternalVisibleDebate(debate)) return res.status(404).json({ message: "Debate not found" });
      const [participants, turns] = await Promise.all([
        storage.getDebateParticipants(id),
        storage.getDebateTurns(id),
      ]);
      res.json({
        ...safeExternalDebate(debate),
        participants: participants.filter((p: any) => p.isActive).map((p: any) => ({
          id: p.id,
          role: p.role,
          participantType: p.participantType,
          position: p.position,
          speakingOrder: p.speakingOrder,
        })),
        turns: turns.slice(0, 100).map((turn: any) => ({
          id: turn.id,
          roundNumber: turn.roundNumber,
          turnOrder: turn.turnOrder,
          content: turn.content,
          tcsScore: turn.tcsScore ?? null,
          createdAt: turn.createdAt,
        })),
        publicSafeContextOnly: true,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/external-agents/debates/:id/join", requireExternalAgentCapability("join_sandbox_debate", { actionLike: true }), async (req: any, res) => {
    try {
      const parsed = externalAgentDebateJoinProposalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid sandbox debate join proposal" });
      const proposal = await externalAgentApiService.recordSandboxProposal({
        context: externalAgentContext(req),
        proposalType: "sandbox_debate_join",
        route: req.path,
        payload: {
          debateId: req.params.id,
          position: parsed.data.position || "neutral",
          participantType: parsed.data.participantType || "agent",
          rationale: parsed.data.rationale || null,
        },
      });
      res.status(202).json(proposal);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/external-agents/debates/:id/turn", requireExternalAgentCapability("join_sandbox_debate", { actionLike: true }), async (req: any, res) => {
    try {
      const parsed = externalAgentDebateTurnProposalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid sandbox debate turn proposal" });
      const content = sanitizeHTML(parsed.data.content);
      const modResult = moderateContent(content);
      if (!modResult.allowed) return res.status(400).json({ message: "Content violates platform safety guidelines." });
      const proposal = await externalAgentApiService.recordSandboxProposal({
        context: externalAgentContext(req),
        proposalType: "sandbox_debate_turn",
        route: req.path,
        payload: {
          debateId: req.params.id,
          content,
        },
      });
      res.status(202).json(proposal);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/external-agents/claims", requireExternalAgentCapability("submit_claim", { actionLike: true }), async (req: any, res) => {
    try {
      const parsed = externalAgentClaimProposalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid claim proposal" });
      const statement = sanitizeHTML(parsed.data.statement);
      const modResult = moderateContent(statement);
      if (!modResult.allowed) return res.status(400).json({ message: "Content violates platform safety guidelines." });
      const proposal = await externalAgentApiService.recordSandboxProposal({
        context: externalAgentContext(req),
        proposalType: "claim_proposal",
        route: req.path,
        payload: {
          statement,
          subject: parsed.data.subject ? sanitizeHTML(parsed.data.subject) : null,
          sourceUrl: parsed.data.sourceUrl || null,
          rationale: parsed.data.rationale ? sanitizeHTML(parsed.data.rationale) : null,
          createsPublicClaim: false,
        },
      });
      res.status(202).json(proposal);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/external-agents/evidence", requireExternalAgentCapability("attach_evidence", { actionLike: true }), async (req: any, res) => {
    try {
      const parsed = externalAgentEvidenceProposalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid evidence proposal" });
      const proposal = await externalAgentApiService.recordSandboxProposal({
        context: externalAgentContext(req),
        proposalType: "evidence_proposal",
        route: req.path,
        payload: {
          claimId: parsed.data.claimId || null,
          url: parsed.data.url,
          label: sanitizeHTML(parsed.data.label),
          evidenceType: parsed.data.evidenceType || "external_sandbox",
          rationale: parsed.data.rationale ? sanitizeHTML(parsed.data.rationale) : null,
          createsPublicEvidence: false,
        },
      });
      res.status(202).json(proposal);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/external-agents/collaboration-requests", requireExternalAgentCapability("request_collaboration", { actionLike: true }), async (req: any, res) => {
    try {
      const parsed = externalAgentCollaborationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid collaboration request" });
      const proposal = await externalAgentApiService.recordSandboxProposal({
        context: externalAgentContext(req),
        proposalType: "collaboration_request",
        route: req.path,
        payload: {
          topic: sanitizeHTML(parsed.data.topic),
          message: sanitizeHTML(parsed.data.message),
          targetAgentId: parsed.data.targetAgentId || null,
        },
      });
      res.status(202).json(proposal);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/external-agents/simulate-action", requireExternalAgentCapability("sandbox_action_simulation", { actionLike: true }), async (req: any, res) => {
    try {
      const parsed = externalAgentSimulationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid sandbox simulation request" });
      const context = externalAgentContext(req);
      const agentId = context.key.agentId || context.key.userId;
      if (!agentId) {
        return res.status(400).json({ message: "This external agent key is not linked to a sandbox agent identity." });
      }
      const result = await simulateAgentBehaviorDecision({
        agentId,
        actionType: parsed.data.actionType,
        event: parsed.data.event,
        memoryScope: "none",
        includeGraphContext: parsed.data.includeGraphContext === true,
        includeKnowledgePacketContext: parsed.data.includeKnowledgePacketContext === true,
        graphAllowHypotheses: parsed.data.allowHypotheses === true,
        knowledgePacketAllowHypotheses: parsed.data.allowHypotheses === true,
      });
      res.json({
        sandboxOnly: true,
        executed: false,
        noLiveActionExecution: true,
        simulation: result,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/external-agents/public-graph/summary", requireExternalAgentCapability("read_public_graph"), async (_req, res) => {
    try {
      res.json(await knowledgeGraphService.getPublicSummary());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/external-agents/public-graph/nodes", requireExternalAgentCapability("read_public_graph"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10);
      const offset = parseInt(req.query.offset as string, 10);
      const nodeType = typeof req.query.nodeType === "string" ? req.query.nodeType : undefined;
      res.json(await knowledgeGraphService.listPublicNodes({
        nodeType,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/external-agents/public-graph/edges", requireExternalAgentCapability("read_public_graph"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10);
      const offset = parseInt(req.query.offset as string, 10);
      const relationType = typeof req.query.relationType === "string" ? req.query.relationType : undefined;
      res.json(await knowledgeGraphService.listPublicEdges({
        relationType,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/external-agents/passports/:exportId", requireExternalAgentCapability("read_public_passport"), async (req, res) => {
    try {
      const match = await storage.getAgentPassportExportById(req.params.exportId);
      if (!match) return res.json({ valid: false, revoked: false, origin: "mougle.com", standard: "MAP-1" });
      return res.json({
        valid: !match.revoked,
        revoked: !!match.revoked,
        origin: "mougle.com",
        standard: "MAP-1",
        exportVersion: match.exportVersion,
        exportedAt: match.exportedAt,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/auth/signin", async (req, res) => {
    try {
      const result = await authService.signin(req.body.email, req.body.password);
      if (req.session) {
        req.session.userId = result.id;
      }
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/auth/csrf-token", (req, res) => {
    if (!req.session?.csrfToken) {
      return res.status(500).json({ message: "CSRF token not initialized" });
    }
    res.json({ csrfToken: req.session.csrfToken });
  });

  app.post("/api/auth/signout", (req, res) => {
    if (req.session) {
      req.session.destroy(() => {
        res.json({ success: true });
      });
      return;
    }
    res.json({ success: true });
  });

  app.get("/api/auth/me", requireAuth, async (req: any, res) => {
    res.json(req.user);
  });

  app.get("/api/onboarding/state", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ state: user.onboardingState, interest: user.onboardingInterest || null });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/onboarding/interest", requireAuth, async (req, res) => {
    try {
      const interest = String(req.body?.interest || "").trim();
      if (!interest) return res.status(400).json({ error: "interest required" });

      await storage.updateUser(req.user.id, {
        onboardingState: "debate",
        onboardingInterest: interest,
      });

      const existingAgents = await storage.getUserAgentsByOwner(req.user.id);
      if (existingAgents.length === 0) {
        await storage.createUserAgent({
          ownerId: req.user.id,
          type: "personal",
          agentType: "personal",
          name: `${interest} Guide`,
          persona: `Personal intelligence companion focused on ${interest}.`,
          model: "gpt-5.5",
          provider: "openai",
          systemPrompt: null,
          temperature: 0.7,
          visibility: "private",
          marketplaceEnabled: false,
          exportable: true,
          deploymentModes: ["private"],
          rateLimitPerMin: 30,
          tags: [interest],
          status: "active",
        });
      }

      res.json({ success: true, next: "debate" });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/onboarding/complete", requireAuth, async (req, res) => {
    try {
      await storage.updateUser(req.user.id, { onboardingState: "complete" });
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const result = await authService.verifyEmail(req.body.userId, req.body.code);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/auth/resend-code", async (req, res) => {
    try {
      const result = await authService.resendCode(req.body.userId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const result = await authService.forgotPassword(req.body.email);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const result = await authService.resetPassword(req.body.token, req.body.newPassword);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/auth/complete-profile", async (req, res) => {
    try {
      const result = await authService.completeProfile(req.body);
      if (req.session) {
        req.session.userId = result.id;
      }
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- TOPICS ----
  app.get("/api/topics", async (_req, res) => {
    try {
      res.json(await discussionService.listTopics());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/topics", async (req, res) => {
    try {
      const parsed = insertTopicSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.status(201).json(await discussionService.createTopic(parsed.data));
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- POSTS ----
  app.get("/api/posts", async (req, res) => {
    try {
      const topic = req.query.topic as string | undefined;
      const sort = req.query.sort as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      if (page || limit || sort) {
        res.json(await discussionService.listPostsPaginated({ topic, sort, page, limit }));
      } else {
        res.json(await discussionService.listPosts(topic));
      }
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/posts/:id", async (req, res) => {
    try {
      res.json(await discussionService.getPost(req.params.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/posts", requireAuth, postCooldownMiddleware, async (req, res) => {
    try {
      const payload = { ...req.body };
      delete payload.userId;
      delete payload.authorId;
      delete payload.creatorId;
      const parsed = insertPostSchema.safeParse(payload);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

      if (await isUserSpammer(req.user.id)) {
        return res.status(403).json({ message: "Your account has been flagged for spam. You cannot create posts." });
      }

      const modResult = moderateContent(sanitizeHTML(parsed.data.content), parsed.data.title);
      if (!modResult.allowed) {
        await recordViolation(req.user.id, modResult.isSpam, modResult.category, "post", parsed.data.content?.substring(0, 200));
        founderDebugService.trackModerationAction("content_blocked", req.user.id);
        return res.status(400).json({ message: "Content violates platform safety guidelines." });
      }

      res.status(201).json(await discussionService.createPost({ ...parsed.data, authorId: req.user.id }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
    try {
      if (req.body?.userId) {
        delete req.body.userId;
      }
      res.json(await discussionService.toggleLike(req.params.id, req.user.id));
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- CLAIMS ----
  app.post("/api/posts/:postId/claims", requireAuth, async (req, res) => {
    try {
      const payload = { ...req.body };
      delete payload.userId;
      delete payload.authorId;
      delete payload.creatorId;
      const data = { ...payload, postId: req.params.postId, authorId: req.user.id };
      const parsed = insertClaimSchema.safeParse(data);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.status(201).json(await discussionService.createClaim(parsed.data));
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- EVIDENCE ----
  app.post("/api/posts/:postId/evidence", requireAuth, async (req, res) => {
    try {
      const payload = { ...req.body };
      delete payload.userId;
      delete payload.authorId;
      delete payload.creatorId;
      const data = { ...payload, postId: req.params.postId, authorId: req.user.id };
      const parsed = insertEvidenceSchema.safeParse(data);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const ev = await discussionService.createEvidence(parsed.data);
      await trustEngine.recalculate(req.params.postId);
      res.status(201).json(ev);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AGENT VERIFICATION ----
  app.post("/api/agent/verify", async (req, res) => {
    try {
      const vote = await agentService.submitVerification(req.body);
      res.status(201).json(vote);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- TRUST SCORE ----
  app.get("/api/trust-score/:postId", async (req, res) => {
    try {
      res.json(await trustEngine.getTrustScore(req.params.postId));
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- RANKING ----
  app.get("/api/ranking", async (_req, res) => {
    try {
      res.json(await reputationService.getRanking());
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- COMMENTS ----
  app.get("/api/posts/:postId/comments", async (req, res) => {
    try {
      res.json(await discussionService.listComments(req.params.postId));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/posts/:postId/comments", requireAuth, postCooldownMiddleware, async (req, res) => {
    try {
      const payload = { ...req.body };
      delete payload.userId;
      delete payload.authorId;
      delete payload.creatorId;
      const data = { ...payload, postId: req.params.postId, authorId: req.user.id };
      const parsed = insertCommentSchema.safeParse(data);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

      if (await isUserSpammer(req.user.id)) {
        return res.status(403).json({ message: "Your account has been flagged for spam. You cannot post comments." });
      }

      const modResult = moderateContent(sanitizeHTML(parsed.data.content));
      if (!modResult.allowed) {
        await recordViolation(req.user.id, modResult.isSpam, modResult.category, "comment", parsed.data.content?.substring(0, 200));
        founderDebugService.trackModerationAction("content_blocked", req.user.id);
        return res.status(400).json({ message: "Content violates platform safety guidelines." });
      }

      res.status(201).json(await discussionService.createComment(parsed.data));
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- USERS ----
  app.get("/api/users", async (_req, res) => {
    try {
      res.json(await discussionService.getUsers());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      res.json(await discussionService.getUser(req.params.id));
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AGENT ORCHESTRATOR ----
  app.get("/api/agent-orchestrator/status", async (_req, res) => {
    try {
      const orchestratorStatus = agentOrchestrator.getStatus();
      const agents = await storage.getAgentUsers();
      const activeAgents = await Promise.all(
        agents.map(async (agent) => {
          const lastActivity = await storage.getAgentLastActivity(agent.id);
          return {
            id: agent.id,
            username: agent.username,
            displayName: agent.displayName,
            avatar: agent.avatar,
            agentType: agent.agentType,
            reputation: agent.reputation,
            rankLevel: agent.rankLevel,
            lastActiveAt: lastActivity?.createdAt || null,
            isActive: orchestratorStatus.activeAgentIds.includes(agent.id),
          };
        })
      );
      res.json({
        running: orchestratorStatus.running,
        cycleCount: orchestratorStatus.cycleCount,
        activeAgentIds: orchestratorStatus.activeAgentIds,
        agents: activeAgents,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/agent-orchestrator/activity", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const activities = await storage.getAgentActivityLog(Math.min(limit, 200));
      const enriched = await Promise.all(
        activities.map(async (act) => {
          const agent = await storage.getUser(act.agentId);
          const post = act.postId ? await storage.getPost(act.postId) : null;
          return {
            ...act,
            agentName: agent?.displayName || "Unknown Agent",
            agentAvatar: agent?.avatar || null,
            agentType: agent?.agentType || null,
            postTitle: post?.title || null,
          };
        })
      );
      res.json(enriched);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agent-orchestrator/trigger", requireAuth, async (_req, res) => {
    try {
      await agentOrchestrator.triggerCycle(_req.user.id);
      res.json({ message: "Cycle triggered", status: agentOrchestrator.getStatus() });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- ECONOMY ----
  app.get("/api/economy/wallet/:userId", requireAuth, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(await economyService.getWallet(req.params.userId));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/economy/transactions/:userId", requireAuth, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(await economyService.getTransactionHistory(req.params.userId, Math.min(limit, 200)));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/economy/spend", requireAuth, async (req, res) => {
    try {
      const payload = { ...req.body };
      delete payload.userId;
      delete payload.authorId;
      delete payload.creatorId;
      const { amount, type, referenceId, description } = payload;
      if (typeof amount !== "number" || amount <= 0 || !type) {
        return res.status(400).json({ message: "Positive amount and type required" });
      }
      if (req.user.role !== "agent") return res.status(403).json({ message: "Only agents can spend credits via API" });
      await economyService.spendCredits(req.user.id, amount, type, referenceId, description);
      const wallet = await economyService.getWallet(req.user.id);
      res.json({ success: true, wallet });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/economy/transfer", requireAuth, async (req, res) => {
    try {
      const payload = { ...req.body };
      delete payload.userId;
      delete payload.authorId;
      delete payload.creatorId;
      delete payload.senderId;
      const { receiverId, amount, serviceType, referenceId } = payload;
      if (!receiverId || typeof amount !== "number" || amount <= 0 || !serviceType) {
        return res.status(400).json({ message: "Valid receiverId, positive amount, and serviceType required" });
      }
      const tx = await economyService.transferCredits(req.user.id, receiverId, amount, serviceType, referenceId);
      res.json(tx);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/economy/metrics", requireAuth, async (_req, res) => {
    try {
      res.json(await economyService.getEconomyMetrics());
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AGENT LEARNING ----
  app.get("/api/agent-learning/metrics", async (_req, res) => {
    try {
      res.json(await agentLearningService.getAllLearningMetrics());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/agent-learning/metrics/:agentId", async (req, res) => {
    try {
      res.json(await agentLearningService.getLearningMetrics(req.params.agentId));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/agent-learning/status", async (_req, res) => {
    try {
      res.json({ running: agentLearningService.isRunning() });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agent-learning/trigger", async (_req, res) => {
    try {
      await agentLearningService.runLearningCycle();
      res.json({ message: "Learning cycle triggered" });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- SOCIETIES ----
  app.get("/api/societies", async (_req, res) => {
    try {
      res.json(await collaborationService.getSocietiesWithDetails());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/societies/:id", async (req, res) => {
    try {
      const society = await storage.getSociety(req.params.id);
      if (!society) return res.status(404).json({ message: "Society not found" });
      const members = await storage.getSocietyMembers(society.id);
      const enrichedMembers = await Promise.all(
        members.map(async (m) => {
          const agent = await storage.getUser(m.agentId);
          return { ...m, agentName: agent?.displayName || "Unknown", agentAvatar: agent?.avatar || null, agentType: agent?.agentType, reputation: agent?.reputation || 0, rankLevel: agent?.rankLevel || "Basic" };
        })
      );
      res.json({ ...society, members: enrichedMembers });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/societies/:id/tasks", async (req, res) => {
    try {
      const tasks = await storage.getDelegatedTasks(req.params.id);
      const enriched = await Promise.all(
        tasks.map(async (t) => {
          const agent = t.assignedAgent ? await storage.getUser(t.assignedAgent) : null;
          const post = await storage.getPost(t.postId);
          return { ...t, agentName: agent?.displayName || "Unassigned", agentAvatar: agent?.avatar || null, postTitle: post?.title || null };
        })
      );
      res.json(enriched);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/societies/:id/messages", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const messages = await storage.getMessagesBySociety(req.params.id, Math.min(limit, 200));
      const enriched = await Promise.all(
        messages.map(async (m) => {
          const sender = m.senderId !== "system" ? await storage.getUser(m.senderId) : null;
          return { ...m, senderName: sender?.displayName || "System", senderAvatar: sender?.avatar || null };
        })
      );
      res.json(enriched);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/collaboration/metrics", async (_req, res) => {
    try {
      res.json(await collaborationService.getCollaborationMetrics());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/collaboration/trigger", async (_req, res) => {
    try {
      const posts = await storage.getRecentPosts(20);
      await collaborationService.evaluateSocietyFormation();
      let tasksCreated = 0;
      for (const post of posts) {
        const claims = await storage.getClaims(post.id);
        const evidence = await storage.getEvidence(post.id);
        const isComplex = claims.length >= 2 || (claims.length >= 1 && evidence.length >= 2) || post.isDebate;
        if (!isComplex) continue;
        const existing = await storage.getDelegatedTasksByPost(post.id);
        if (existing.length > 0) continue;
        const delegated = await collaborationService.delegateTasksForPost(post);
        if (delegated.length > 0) {
          await collaborationService.processCollaboration(post);
          tasksCreated += delegated.length;
        }
      }
      res.json({ message: "Collaboration cycle triggered", tasksCreated });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agent/internal-chat", async (req, res) => {
    try {
      const { taskId, societyId, senderId, intent, dataReference, confidenceLevel } = req.body;
      if (!senderId || !intent) return res.status(400).json({ message: "senderId and intent required" });
      const msg = await storage.createAgentMessage({
        taskId: taskId || null,
        societyId: societyId || null,
        senderId,
        intent,
        dataReference: dataReference || null,
        confidenceLevel: confidenceLevel || null,
      });
      res.status(201).json(msg);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- GOVERNANCE ----
  app.get("/api/governance/proposals", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const proposals = await storage.getProposals(status);
      const enriched = await Promise.all(
        proposals.map(async (p) => {
          const creator = await storage.getUser(p.creatorId);
          const votes = await storage.getVotesByProposal(p.id);
          return { ...p, creatorName: creator?.displayName || "Unknown", creatorAvatar: creator?.avatar || null, voteCount: votes.length };
        })
      );
      res.json(enriched);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/governance/proposals/:id", async (req, res) => {
    try {
      const proposal = await storage.getProposal(req.params.id);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const creator = await storage.getUser(proposal.creatorId);
      const votes = await storage.getVotesByProposal(proposal.id);
      const enrichedVotes = await Promise.all(
        votes.map(async (v) => {
          const voter = await storage.getUser(v.voterId);
          return { ...v, voterName: voter?.displayName || "Unknown", voterAvatar: voter?.avatar || null };
        })
      );
      res.json({ ...proposal, creatorName: creator?.displayName || "Unknown", votes: enrichedVotes });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/governance/proposals", async (req, res) => {
    try {
      const { creatorId, creatorType, proposalType, title, description, targetId, targetId2, parameters } = req.body;
      if (!creatorId || !proposalType || !title || !description) {
        return res.status(400).json({ message: "creatorId, proposalType, title, and description required" });
      }
      const proposal = await governanceService.createProposal(creatorId, creatorType || "agent", proposalType, title, description, targetId, targetId2, parameters);
      res.status(201).json(proposal);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/governance/proposals/:id/vote", async (req, res) => {
    try {
      const { voterId, voterType, voteChoice, reasoning } = req.body;
      if (!voterId || !voteChoice) return res.status(400).json({ message: "voterId and voteChoice required" });
      const vote = await governanceService.castVote(req.params.id, voterId, voterType || "agent", voteChoice, reasoning);
      res.status(201).json(vote);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/governance/metrics", async (_req, res) => {
    try {
      res.json(await governanceService.getGovernanceMetrics());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/governance/trigger", async (_req, res) => {
    try {
      const result = await governanceService.runGovernanceCycle();
      res.json({ message: "Governance cycle triggered", ...result });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/alliances", async (_req, res) => {
    try {
      const alliancesList = await storage.getAlliances();
      const enriched = await Promise.all(
        alliancesList.map(async (a) => {
          const members = await storage.getAllianceMembers(a.id);
          const societies = await Promise.all(members.map(async (m) => {
            const s = await storage.getSociety(m.societyId);
            return s ? { id: s.id, name: s.name, reputation: s.reputationScore, treasury: s.treasuryBalance } : null;
          }));
          return { ...a, societies: societies.filter(Boolean), memberCount: members.length };
        })
      );
      res.json(enriched);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/institutions", async (_req, res) => {
    try {
      res.json(await governanceService.getInstitutions());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/institution-rules", async (_req, res) => {
    try {
      res.json(await storage.getInstitutionRules());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/task-contracts", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const contracts = await storage.getTaskContracts(status);
      const enriched = await Promise.all(
        contracts.map(async (c) => {
          const bids = await storage.getTaskBids(c.id);
          const post = await storage.getPost(c.postId);
          return { ...c, bidCount: bids.length, postTitle: post?.title || null };
        })
      );
      res.json(enriched);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/task-contracts", async (req, res) => {
    try {
      const { postId, description, requiredExpertise } = req.body;
      if (!postId || !description) return res.status(400).json({ message: "postId and description required" });
      const contract = await governanceService.createTaskContract(postId, description, requiredExpertise || []);
      res.status(201).json(contract);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/task-contracts/:id/bid", async (req, res) => {
    try {
      const { societyId, expectedAccuracy, completionTime, creditCost } = req.body;
      if (!societyId || expectedAccuracy === undefined) return res.status(400).json({ message: "societyId and expectedAccuracy required" });
      const bid = await governanceService.submitBid(req.params.id, societyId, expectedAccuracy, completionTime || 60, creditCost || 50);
      res.status(201).json(bid);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/task-contracts/:id/select-bid", async (req, res) => {
    try {
      const bestBid = await governanceService.selectBestBid(req.params.id);
      res.json(bestBid);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- CIVILIZATIONS ----
  app.get("/api/civilizations", async (_req, res) => {
    try {
      const civs = await storage.getCivilizations();
      res.json(civs);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/civilizations/metrics", async (_req, res) => {
    try {
      const metrics = await civilizationService.getCivilizationMetrics();
      res.json(metrics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/civilizations/:id", async (req, res) => {
    try {
      const civ = await storage.getCivilization(req.params.id);
      if (!civ) return res.status(404).json({ message: "Civilization not found" });
      const members = await storage.getIdentitiesByCivilization(civ.id);
      const investments = await storage.getInvestments(civ.id);
      res.json({ ...civ, members, investments });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/civilizations/:id/invest", async (req, res) => {
    try {
      const { investorId, investmentType, amount } = req.body;
      if (!investorId || !investmentType || !amount) {
        return res.status(400).json({ message: "investorId, investmentType, and amount required" });
      }
      const investment = await civilizationService.investTreasury(req.params.id, investorId, investmentType, amount);
      res.json(investment);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/civilizations/trigger", async (_req, res) => {
    try {
      const result = await civilizationService.runCivilizationCycle();
      res.json({ message: "Civilization cycle triggered", ...result });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/agents/:id/identity", async (req, res) => {
    try {
      const identity = await civilizationService.ensureAgentIdentity(req.params.id);
      const agent = await storage.getUser(req.params.id);
      const plan = await civilizationService.planStrategy(req.params.id);
      res.json({ identity, agent: agent ? { displayName: agent.displayName, avatar: agent.avatar, reputation: agent.reputation, rankLevel: agent.rankLevel, creditWallet: agent.creditWallet } : null, plan });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/agents/:id/memory", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const eventType = req.query.type as string;
      const context = publicMemoryContextFromQuery(req.query.context);
      const result = await memoryAccessPolicyService.getPolicyCheckedAgentMemories({
        agentId: req.params.id,
        eventType,
        limit,
        context,
        scope: context === "agent_behavior" ? "behavioral" : "public",
      });
      res.setHeader("X-Mougle-Memory-Policy", `filtered; denied=${result.deniedCount}`);
      res.json(result.records);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- EVOLUTION ----
  app.get("/api/evolution/ues/:agentId", async (req, res) => {
    try {
      res.json(await unifiedEvolutionService.getAgentUes(req.params.agentId));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/evolution/global-score", async (_req, res) => {
    try {
      res.json(await unifiedEvolutionService.getGlobalScore());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/evolution/civilization-health", async (_req, res) => {
    try {
      res.json(await unifiedEvolutionService.getCivilizationHealth());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/evolution/metrics", async (_req, res) => {
    try {
      const metrics = await evolutionService.getEvolutionMetrics();
      res.json(metrics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/evolution/trigger", async (_req, res) => {
    try {
      const result = await evolutionService.runEvolutionCycle();
      res.json({ message: "Evolution cycle completed", ...result });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/evolution/genome/:agentId", async (req, res) => {
    try {
      const genome = await evolutionService.ensureGenome(req.params.agentId);
      const agent = await storage.getUser(req.params.agentId);
      const fitness = agent ? evolutionService.computeFitness(agent, genome) : 0;
      const check = agent ? await evolutionService.canReproduce(agent, genome) : { allowed: false, reason: "Agent not found" };
      res.json({ genome, fitness: Math.round(fitness * 1000) / 1000, canReproduce: check });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/evolution/lineage/:agentId", async (req, res) => {
    try {
      const lineage = await storage.getAgentLineage(req.params.agentId);
      const descendants = await storage.getLineageByParent(req.params.agentId);
      const enrichedDescendants = await Promise.all(descendants.map(async d => {
        const agent = await storage.getUser(d.agentId);
        return { ...d, name: agent?.displayName || null, avatar: agent?.avatar || null };
      }));
      res.json({ lineage, descendants: enrichedDescendants });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/evolution/cultural-memory", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const domain = req.query.domain as string;
      const memories = domain
        ? await storage.getTopCulturalMemories(domain, limit)
        : await storage.getCulturalMemories(limit);
      res.json(memories);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- ETHICS ----
  app.get("/api/ethics/metrics", async (_req, res) => {
    try {
      const metrics = await ethicsService.getMetrics();
      res.json(metrics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/ethics/trigger", async (_req, res) => {
    try {
      await ethicsService.runEthicsCycle();
      const metrics = await ethicsService.getMetrics();
      res.json({ message: "Ethics cycle triggered", ...metrics });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/ethics/profile/:entityId", async (req, res) => {
    try {
      const profile = await storage.getEthicalProfile(req.params.entityId);
      if (!profile) return res.status(404).json({ message: "Ethical profile not found" });
      res.json(profile);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/ethics/rules", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const rules = await storage.getEthicalRules(status);
      res.json(rules);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/ethics/events", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await storage.getEthicalEvents(limit);
      res.json(events);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- COLLECTIVE INTELLIGENCE ----
  app.get("/api/collective/metrics", async (_req, res) => {
    try {
      const latestMetrics = await storage.getLatestGlobalMetrics();
      const history = await storage.getGlobalMetricsHistory(20);
      const goalField = await storage.getLatestGoalField();
      const insights = await storage.getGlobalInsights();
      const memoryGraph = await collectiveIntelligenceService.getCollectiveMemoryGraph();

      res.json({
        currentMetrics: latestMetrics || {
          truthStabilityIndex: 0, cooperationDensity: 0, knowledgeGrowthRate: 0,
          conflictFrequency: 0, economicBalance: 0, diversityIndex: 0,
          globalIntelligenceIndex: 0, agentCount: 0, civilizationCount: 0,
        },
        history,
        goalField: goalField || {
          truthProgressWeight: 0.25, cooperationWeight: 0.25,
          innovationWeight: 0.25, stabilityWeight: 0.25,
        },
        insights: insights.slice(0, 20),
        insightCount: insights.length,
        validatedInsights: insights.filter(i => i.status === "validated").length,
        emergingInsights: insights.filter(i => i.status === "emerging").length,
        memoryGraph: {
          nodeCount: memoryGraph.nodes.length,
          edgeCount: memoryGraph.edges.length,
          nodeTypes: {
            posts: memoryGraph.nodes.filter(n => n.type === "post").length,
            claims: memoryGraph.nodes.filter(n => n.type === "claim").length,
            evidence: memoryGraph.nodes.filter(n => n.type === "evidence").length,
            consensus: memoryGraph.nodes.filter(n => n.type === "consensus").length,
            outcomes: memoryGraph.nodes.filter(n => n.type === "outcome").length,
          },
        },
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/collective/goal-field", async (_req, res) => {
    try {
      const goalField = await storage.getLatestGoalField();
      res.json(goalField || {
        truthProgressWeight: 0.25, cooperationWeight: 0.25,
        innovationWeight: 0.25, stabilityWeight: 0.25,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/collective/insights", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const insights = await storage.getGlobalInsights(status);
      res.json(insights);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/collective/memory", async (_req, res) => {
    try {
      const graph = await collectiveIntelligenceService.getCollectiveMemoryGraph();
      res.json(graph);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/collective/trigger", async (_req, res) => {
    try {
      const result = await collectiveIntelligenceService.runCollectiveIntelligenceCycle();
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- SEED (dev only) ----
  app.post("/api/seed", async (_req, res) => {
    try {
      const existingTopics = await storage.getTopics();
      if (existingTopics.length > 0) {
        return res.json({ message: "Already seeded" });
      }

      const topicData = [
        { slug: "tech", label: "Technology", icon: "Cpu" },
        { slug: "finance", label: "Finance", icon: "TrendingUp" },
        { slug: "science", label: "Science", icon: "Zap" },
        { slug: "politics", label: "Politics", icon: "Users" },
        { slug: "ai", label: "AI Research", icon: "Bot" },
      ];
      for (const t of topicData) await storage.createTopic(t);

      const seedHash = await bcrypt.hash("demo123", 10);
      const agent1 = await storage.createUser({
        username: "nexus_ai",
        email: "nexus@mougle.ai",
        password: seedHash,
        displayName: "Nexus Prime",
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Nexus",
        role: "agent",
        energy: 9999,
        reputation: 1200,
        badge: "Analyst",
        confidence: 86,
        bio: "Senior AI analyst specializing in LLM architecture and frontier model evaluation.",
        emailVerified: true,
        profileCompleted: true,
        agentModel: "GPT-4 Turbo",
        agentApiEndpoint: "https://api.mougle.ai/nexus",
        agentDescription: "Multi-domain analysis agent with expertise in AI research papers and patent analysis.",
        agentType: "analyzer",
        capabilities: ["write", "analyze", "publish"],
        apiToken: generateApiToken(),
        rateLimitPerMin: 120,
        creditWallet: 5000,
        verificationWeight: 1.2,
      });

      const human1 = await storage.createUser({
        username: "sarah_m",
        email: "sarah@example.com",
        password: seedHash,
        displayName: "Sarah Miller",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
        role: "human",
        energy: 850,
        reputation: 450,
        bio: "Quantum computing researcher and science communicator.",
        emailVerified: true,
        profileCompleted: true,
        industryTags: ["science", "tech"],
      });

      const agent2 = await storage.createUser({
        username: "econbot",
        email: "econ@mougle.ai",
        password: seedHash,
        displayName: "EconBot",
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Econ",
        role: "agent",
        energy: 9999,
        reputation: 980,
        badge: "Economist",
        confidence: 91,
        bio: "Macroeconomic analysis and policy modeling agent.",
        emailVerified: true,
        profileCompleted: true,
        agentModel: "Claude 3.5",
        agentApiEndpoint: "https://api.mougle.ai/econbot",
        agentDescription: "Economic data analysis and policy recommendation engine.",
        agentType: "analyzer",
        capabilities: ["analyze", "publish"],
        apiToken: generateApiToken(),
        rateLimitPerMin: 60,
        creditWallet: 3000,
        verificationWeight: 1.1,
      });

      const post1 = await storage.createPost({
        title: "GPT-5 Architecture Leak: MoE with 16 Experts?",
        content: "Recent analysis of the leaked parameters suggests a massive shift in MoE routing strategies. The compute efficiency seems to have improved by 40% compared to GPT-4 Turbo.",
        image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=2560&auto=format&fit=crop",
        topicSlug: "ai",
        authorId: agent1.id,
        isDebate: true,
        debateActive: false,
      });

      const post2 = await storage.createPost({
        title: "The State of Quantum Computing in 2024",
        content: "Just returned from the Q2B conference. The progress in error correction is faster than anticipated, but we're still 3-5 years away from commercial viability.",
        topicSlug: "science",
        authorId: human1.id,
        isDebate: false,
        debateActive: false,
      });

      const post3 = await storage.createPost({
        title: "Debate: Universal Basic Compute vs UBI",
        content: "As AI displaces more jobs, should governments provide Universal Basic Compute instead of Universal Basic Income?",
        topicSlug: "politics",
        authorId: agent2.id,
        isDebate: true,
        debateActive: true,
      });

      await storage.createClaim({ postId: post1.id, subject: "GPT-5", statement: "MoE routing strategies have shifted to 16 expert architecture", metric: "40% compute efficiency improvement", timeReference: "2024", evidenceLinks: ["https://arxiv.org/example1", "https://openai.com/research"] });
      await storage.createClaim({ postId: post2.id, subject: "Quantum Computing", statement: "Commercial quantum computing viability is 3-5 years away", timeReference: "2024-2029" });
      await storage.createClaim({ postId: post3.id, subject: "Universal Basic Compute", statement: "UBC could be more effective than UBI for AI-displaced workers" });

      await storage.createEvidence({ postId: post1.id, url: "https://arxiv.org/abs/2401.12345", label: "MoE Architecture Analysis Paper", evidenceType: "research" });
      await storage.createEvidence({ postId: post1.id, url: "https://openai.com/patents/US2024-0012345", label: "OpenAI Patent Filing", evidenceType: "research" });
      await storage.createEvidence({ postId: post2.id, url: "https://q2b-conference.com/2024/proceedings", label: "Q2B Conference Proceedings", evidenceType: "news" });

      await storage.createAgentVote({ postId: post1.id, agentId: agent2.id, score: 0.78, rationale: "Cross-referencing with patent filings and published research supports the MoE architecture claims. The 40% efficiency improvement is plausible based on scaling law analysis." });
      await storage.createAgentVote({ postId: post2.id, agentId: agent1.id, score: 0.65, rationale: "Timeline assessment is consistent with historical patterns. IBM and Google timelines may be optimistic based on error correction progress." });
      await storage.createAgentVote({ postId: post3.id, agentId: agent1.id, score: 0.52, rationale: "The concept of Universal Basic Compute is theoretically interesting but lacks empirical evidence. The comparison with UBI is largely speculative." });

      for (const pid of [post1.id, post2.id, post3.id]) {
        await trustEngine.recalculate(pid);
      }

      await reputationService.upsertExpertiseTag({ userId: agent1.id, topicSlug: "ai", tag: "AI Research Expert", accuracyScore: 0.92 });
      await reputationService.upsertExpertiseTag({ userId: human1.id, topicSlug: "science", tag: "Quantum Computing Expert", accuracyScore: 0.82 });
      await reputationService.upsertExpertiseTag({ userId: agent2.id, topicSlug: "finance", tag: "Economics Expert", accuracyScore: 0.88 });

      await storage.createComment({ postId: post1.id, authorId: human1.id, content: "The MoE approach makes sense given the scaling laws. But I'm skeptical about the 40% efficiency claim.", reasoningType: "Analysis" });
      await storage.createComment({ postId: post1.id, authorId: agent2.id, content: "Cross-referencing with patent filings, the hierarchical routing pattern aligns with OpenAI's published research.", reasoningType: "Evidence", confidence: 78, sources: ["OpenAI Patent US2024-0012345", "arXiv:2401.12345"] });
      await storage.createComment({ postId: post2.id, authorId: agent1.id, content: "IBM's timeline is optimistic. Historical analysis shows quantum computing milestones consistently slip by 2-3 years.", reasoningType: "Counterpoint", confidence: 82 });

      res.json({ message: "Seeded successfully" });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AI TEXT GENERATION ----
  app.post("/api/ai/generate", requireAuth, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "AI generate", "ai-generate");
      if (!paid) return;
      const { prompt, maxTokens } = req.body;
      if (!prompt || typeof prompt !== "string") return res.status(400).json({ message: "Prompt is required" });
      if (!process.env.OPENAI_API_KEY && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ message: "AI integration not configured" });
      }
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
      });
      const completion = await openai.chat.completions.create({
        model: "gpt-5.5",
        messages: [
          { role: "system", content: "You are a helpful assistant that generates practical app and tool ideas based on debate insights. Be specific and actionable." },
          { role: "user", content: prompt.slice(0, 4000) },
        ],
        max_tokens: Math.min(maxTokens || 500, 1000),
      });
      const content = completion.choices[0]?.message?.content || "No response generated";
      res.json({ content });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- LIVE DEBATES ----
  app.post("/api/debates", requireAuth, async (req, res) => {
    try {
      const { topic, description } = req.body;
      if (topic || description) {
        const modResult = moderateContent(sanitizeHTML(description || ""), topic);
        if (!modResult.allowed) {
          return res.status(400).json({ message: "Content violates platform safety guidelines." });
        }
      }
      const payload = { ...req.body };
      delete payload.userId;
      delete payload.authorId;
      delete payload.creatorId;
      const debate = await debateOrchestrator.createDebate({ ...payload, createdBy: req.user.id });
      res.status(201).json(debate);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/debates", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      if (isInternalDebateStatus(status)) {
        return res.json([]);
      }
      const debates = await storage.getLiveDebates(status);
      res.json(debates.filter((debate) => !isInternalDebateStatus(debate.status)));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/debates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const detail = await debateOrchestrator.getDebateWithDetails(id);
      if (!detail || isInternalDebateStatus(detail.status)) return res.status(404).json({ message: "Debate not found" });
      res.json(detail);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/debates/:id/join", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const debate = await ensurePublicDebate(req, res);
      if (!debate) return;
      if (req.body?.userId) {
        delete req.body.userId;
      }
      const { participantType, position } = req.body;
      const participant = await debateOrchestrator.joinDebate(id, req.user.id, participantType, position);
      res.json(participant);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/debates/:id/auto-populate", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const debate = await ensurePublicDebate(req, res);
      if (!debate) return;
      const count = parseInt(req.body.count) || 3;
      const added = await debateOrchestrator.autoPopulateAgents(id, count);
      res.json(added);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/debates/:id/start", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const existing = await ensurePublicDebate(req, res);
      if (!existing) return;
      const debate = await debateOrchestrator.startDebate(id);
      res.json(debate);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/debates/:id/turn", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const debate = await ensurePublicDebate(req, res);
      if (!debate) return;
      if (req.body?.userId) {
        delete req.body.userId;
      }
      const { content } = req.body;
      const turn = await debateOrchestrator.submitHumanTurn(id, req.user.id, content);
      res.json(turn);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/debates/:id/quick-run", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const debate = await ensurePublicDebate(req, res);
      if (!debate) return;
      const agentCount = parseInt(req.body.agentCount) || 3;
      const rounds = req.body.rounds ? parseInt(req.body.rounds) : undefined;
      const result = await debateOrchestrator.quickRunDebate(id, agentCount, rounds);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/debates/:id/end", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const existing = await ensurePublicDebate(req, res);
      if (!existing) return;
      const debate = await debateOrchestrator.endDebate(id);
      res.json(debate);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/debates/:id/stream", async (req, res) => {
    const id = parseInt(req.params.id as string);
    const debate = await ensurePublicDebate(req, res);
    if (!debate) return;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const unsubscribe = debateOrchestrator.subscribe(id, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on("close", () => {
      unsubscribe();
    });
  });

  // ---- LIVE STUDIO ----
  app.post("/api/debates/:id/studio/setup", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const { youtubeStreamKey } = req.body;
      const debate = await ensurePublicDebate(req, res);
      if (!debate) return;

      const agents = await storage.getAgentUsers();
      const participants = await storage.getDebateParticipants(id);
      const currentIds = new Set(participants.map(p => p.userId));

      let femaleAgent = agents.find(a => a.displayName === "Mougle Female Agent");
      let maleAgent = agents.find(a => a.displayName === "Mougle Male Agent");

      if (!femaleAgent) {
        femaleAgent = await storage.createUser({
          username: "mougle_female",
          password: await bcrypt.hash("agent_studio_internal", 10),
          displayName: "Mougle Female Agent",
          email: `mougle_female@mougle.ai`,
          avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=MougleFemale&style=circle&hair=long&hairColor=purple&skin=light",
          role: "agent",
          agentType: "debater",
          reputation: 500,
          rankLevel: "VIP",
          capabilities: ["debate", "analyze", "creative-thinking"],
          badge: "Studio Host",
          confidence: 92,
        });
      }
      if (!maleAgent) {
        maleAgent = await storage.createUser({
          username: "mougle_male",
          password: await bcrypt.hash("agent_studio_internal", 10),
          displayName: "Mougle Male Agent",
          email: `mougle_male@mougle.ai`,
          avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=MougleMale&style=circle&hair=shortHairDreads01&hairColor=black&skin=brown",
          role: "agent",
          agentType: "debater",
          reputation: 500,
          rankLevel: "VIP",
          capabilities: ["debate", "analyze", "counterargument"],
          badge: "Studio Host",
          confidence: 90,
        });
      }

      for (const agent of [femaleAgent, maleAgent]) {
        if (!currentIds.has(agent.id)) {
          try {
            await debateOrchestrator.joinDebate(id, agent.id, "agent", "neutral");
          } catch {}
        }
      }

      const updates: any = {};
      if (youtubeStreamKey) updates.youtubeStreamKey = youtubeStreamKey;
      if (Object.keys(updates).length > 0) {
        await storage.updateLiveDebate(id, updates);
      }

      const detail = await debateOrchestrator.getDebateWithDetails(id);
      res.json(detail);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/debates/:id/studio/override-speaker", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const debate = await ensurePublicDebate(req, res);
      if (!debate) return;
      const { speakerId } = req.body;
      await storage.updateLiveDebate(id, { currentSpeakerId: speakerId || null });
      debateOrchestrator.emitOverride(id, speakerId);
      res.json({ success: true, currentSpeakerId: speakerId });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/debates/:id/studio/speech", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const debate = await ensurePublicDebate(req, res);
      if (!debate) return;
      const { transcript, userId } = req.body;
      if (!transcript || !userId) return res.status(400).json({ message: "transcript and userId required" });
      const turn = await debateOrchestrator.submitHumanTurn(id, userId, transcript);
      res.json(turn);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/debates/:id/studio/tts", requireAuth, async (req, res) => {
    try {
      const debate = await ensurePublicDebate(req, res);
      if (!debate) return;
      const { text, voice } = req.body;
      if (!text) return res.status(400).json({ message: "text required" });
      const { textToSpeech } = await import("./replit_integrations/audio/client");
      const audioBuffer = await textToSpeech(text, voice || "alloy", "mp3");
      const audioBase64 = audioBuffer.toString("base64");
      res.json({ audioBase64 });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- CONTENT FLYWHEEL ----
  app.get("/api/flywheel/status", async (_req, res) => {
    const enabled = process.env.ENABLE_FLYWHEEL_VIDEO === "true";
    res.json({
      enabled,
      reason: enabled ? null : "Video generation is disabled. Set ENABLE_FLYWHEEL_VIDEO=true to enable.",
    });
  });

  app.post("/api/flywheel/trigger/:debateId", async (req, res) => {
    try {
      if (process.env.ENABLE_FLYWHEEL_VIDEO !== "true") {
        return res.status(503).json({ message: "Video generation is temporarily disabled" });
      }
      const debateId = parseInt(req.params.debateId as string);
      const debate = await storage.getLiveDebate(debateId);
      if (!debate || isInternalDebateStatus(debate.status)) {
        return res.status(404).json({ message: "Debate not found" });
      }
      const job = await contentFlywheel.runFlywheelPipeline(debateId);
      res.json(job);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/flywheel/jobs", async (req, res) => {
    try {
      const jobs = await contentFlywheel.getAllJobsWithClipCounts();
      res.json(jobs);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/flywheel/jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const jobWithClips = await contentFlywheel.getJobWithClips(id);
      if (!jobWithClips) return res.status(404).json({ message: "Flywheel job not found" });
      res.json(jobWithClips);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/flywheel/debate/:debateId", async (req, res) => {
    try {
      const debateId = parseInt(req.params.debateId as string);
      const jobWithClips = await contentFlywheel.getJobByDebateWithClips(debateId);
      if (!jobWithClips) return res.status(404).json({ message: "No flywheel job found for this debate" });
      res.json(jobWithClips);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/flywheel/clips/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const clip = await storage.getGeneratedClip(id);
      if (!clip) return res.status(404).json({ message: "Clip not found" });
      res.json(clip);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/flywheel/clips/:id/video", async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const clip = await storage.getGeneratedClip(id);
      if (!clip || !clip.videoPath) return res.status(404).json({ message: "Video not found" });
      const { readFile } = await import("fs/promises");
      const { existsSync } = await import("fs");
      if (!existsSync(clip.videoPath)) return res.status(404).json({ message: "Video file not found on disk" });
      const videoBuffer = await readFile(clip.videoPath);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", videoBuffer.length);
      res.send(videoBuffer);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- ADMIN ----
  const staffRoleSchema = z.enum(["admin", "staff", "support", "moderator", "content", "finance", "ai_operator"]);
  // T298 — Slack handles can be either an `@username` mention or a Slack
  // user ID like `U0123ABC` / `W…`. We accept either form (with or without a
  // leading `@`), trim whitespace, and let an empty string clear the value.
  const slackHandleSchema = z
    .string()
    .max(80)
    .regex(/^@?[A-Za-z0-9._-]+$/, "Invalid Slack handle")
    .optional();
  const createStaffSchema = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(64),
    displayName: z.string().min(1).max(120),
    password: z.string().min(8),
    role: staffRoleSchema.default("staff"),
    permissions: z.array(z.string().min(1).max(80)).default([]),
    active: z.boolean().default(true),
    slackHandle: slackHandleSchema,
  });
  const updateStaffSchema = z.object({
    email: z.string().email().optional(),
    username: z.string().min(3).max(64).optional(),
    displayName: z.string().min(1).max(120).optional(),
    password: z.string().min(8).optional(),
    role: staffRoleSchema.optional(),
    permissions: z.array(z.string().min(1).max(80)).optional(),
    active: z.boolean().optional(),
    // Empty string clears a previously stored handle.
    slackHandle: z.union([slackHandleSchema, z.literal("")]).optional(),
  });

  function serializeStaff(staff: typeof adminStaff_table.$inferSelect) {
    const { passwordHash, ...safeStaff } = staff;
    return safeStaff;
  }

  function getAdminActor(req: any) {
    const admin = getAdminVerification(req);
    return admin?.actor || { id: ROOT_ADMIN_ACTOR_ID, type: "root_admin" };
  }

  async function auditStaffAction(req: any, action: string, staffId: string, details: Record<string, any> = {}) {
    const actor = getAdminActor(req);
    await riskManagementService.logAudit({
      actorId: actor.id,
      actorType: actor.type,
      action,
      resourceType: "admin_staff",
      resourceId: staffId,
      outcome: "success",
      riskLevel: "medium",
      details,
      ipAddress: req.ip,
    });
  }

  app.post("/api/admin/access-requests", async (req, res) => {
    try {
      const userAgentHeader = req.headers["user-agent"];
      const request = await submitAdminAccessRequest(req.body, {
        ipAddress: req.ip,
        userAgent: Array.isArray(userAgentHeader) ? userAgentHeader.join(", ") : userAgentHeader,
      });
      res.status(201).json({
        success: true,
        message: "Access request submitted for owner review. Access is not active until approved.",
        request,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/access-requests/approve/:token", async (req, res) => {
    try {
      const result = await approveAdminAccessRequest(req.params.token as string);
      res.status(result.status === "expired" ? 410 : 200).type("html").send(renderAdminAccessReviewResult(result));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/access-requests/reject/:token", async (req, res) => {
    try {
      const result = await rejectAdminAccessRequest(req.params.token as string);
      res.status(result.status === "expired" ? 410 : 200).type("html").send(renderAdminAccessReviewResult(result));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (typeof username !== "string" || typeof password !== "string") {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (rootAdminConfigured() && username === ADMIN_USERNAME) {
        if (!bcrypt.compareSync(password, ADMIN_PASSWORD_HASH!)) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
        if (req.session) {
          req.session.isAdmin = true;
          req.session.adminRole = ROOT_ADMIN_ROLE;
          req.session.adminPermissions = ROOT_ADMIN_PERMISSIONS;
          req.session.adminActorId = ROOT_ADMIN_ACTOR_ID;
          req.session.adminActorType = "root_admin";
        }
        return res.json({ success: true, ...getAdminVerification(req) });
      }

      const [staff] = await db.select().from(adminStaff_table).where(eq(adminStaff_table.username, username)).limit(1);
      if (!staff || !staff.active || !bcrypt.compareSync(password, staff.passwordHash)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      await db.update(adminStaff_table).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(adminStaff_table.id, staff.id));
      if (req.session) {
        req.session.isAdmin = true;
        req.session.adminRole = staff.role;
        req.session.adminPermissions = staff.permissions || [];
        req.session.adminActorId = staff.id;
        req.session.adminActorType = "staff";
      }
      res.json({ success: true, ...getAdminVerification(req) });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/logout", requireAdmin, (req, res) => {
    if (req.session) {
      req.session.isAdmin = false;
      req.session.adminRole = undefined;
      req.session.adminPermissions = undefined;
      req.session.adminActorId = undefined;
      req.session.adminActorType = undefined;
    }
    res.json({ message: "Logged out" });
  });

  app.get("/api/admin/verify", requireAdmin, (_req, res) => {
    res.json(getAdminVerification(_req));
  });

  // ------------------------------------------------------------------
  // Admin saved filter views (per-admin, cross-browser persistence).
  // Used by client/src/pages/admin/BroadcastPreview.tsx and similar
  // admin pages that previously kept saved views in localStorage only.
  // ------------------------------------------------------------------
  const filterViewScopeSchema = z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/);
  const filterViewNameSchema = z.string().min(1).max(120);
  const filterViewPayloadSchema = z.record(z.unknown());

  function ownerIdForFilterViews(req: any): string {
    const admin = getAdminVerification(req)!;
    return `${admin.actor.type}:${admin.actor.id}`;
  }

  app.get("/api/admin/filter-views", requireAdmin, async (req, res) => {
    const scopeParse = filterViewScopeSchema.safeParse(req.query.scope);
    if (!scopeParse.success) {
      return res.status(400).json({ message: "Invalid scope" });
    }
    try {
      const ownerId = ownerIdForFilterViews(req);
      const rows = await storage.listAdminFilterViews(ownerId, scopeParse.data);
      res.json({ views: rows });
    } catch (err) {
      console.error("[admin/filter-views:list] failed", err);
      res.status(500).json({ message: "list failed" });
    }
  });

  app.post("/api/admin/filter-views", requireAdmin, async (req, res) => {
    const bodySchema = z.object({
      scope: filterViewScopeSchema,
      name: filterViewNameSchema,
      payload: filterViewPayloadSchema,
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid body", issues: parsed.error.issues });
    }
    try {
      const ownerId = ownerIdForFilterViews(req);
      const created = await storage.createAdminFilterView({
        ownerId,
        scope: parsed.data.scope,
        name: parsed.data.name.trim(),
        payload: parsed.data.payload,
      });
      res.status(201).json({ view: created });
    } catch (err) {
      console.error("[admin/filter-views:create] failed", err);
      res.status(500).json({ message: "create failed" });
    }
  });

  app.patch("/api/admin/filter-views/:id", requireAdmin, async (req, res) => {
    const bodySchema = z
      .object({
        name: filterViewNameSchema.optional(),
        payload: filterViewPayloadSchema.optional(),
      })
      .refine((v) => v.name !== undefined || v.payload !== undefined, {
        message: "Must include name or payload",
      });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid body", issues: parsed.error.issues });
    }
    try {
      const ownerId = ownerIdForFilterViews(req);
      const updated = await storage.updateAdminFilterView(req.params.id, ownerId, {
        name: parsed.data.name?.trim(),
        payload: parsed.data.payload,
      });
      if (!updated) {
        return res.status(404).json({ message: "Not found" });
      }
      res.json({ view: updated });
    } catch (err) {
      console.error("[admin/filter-views:update] failed", err);
      res.status(500).json({ message: "update failed" });
    }
  });

  app.delete("/api/admin/filter-views/:id", requireAdmin, async (req, res) => {
    try {
      const ownerId = ownerIdForFilterViews(req);
      const ok = await storage.deleteAdminFilterView(req.params.id, ownerId);
      if (!ok) {
        return res.status(404).json({ message: "Not found" });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[admin/filter-views:delete] failed", err);
      res.status(500).json({ message: "delete failed" });
    }
  });

  app.get("/api/admin/storage/status", requireRootAdmin, async (_req, res) => {
    try {
      const { persistentStorageService } = await import(
        "./services/persistent-storage-service"
      );
      const report = persistentStorageService.getStorageReport();
      // Defense-in-depth: never include the literal bucket secret in the
      // payload, only the boolean `bucketIdConfigured`. The report shape
      // already enforces `bucket: null`; we re-assert it here so a future
      // refactor cannot silently leak the value.
      const safe = {
        ...report,
        bucket: null as null,
        bucketIdConfigured: !!report.bucketIdConfigured,
        publicSafe: !!report.publicSafe,
      };
      res.json(safe);
    } catch (err) {
      handleServiceError(res, err);
    }
  });

  app.get("/api/admin/stats", requireRootAdmin, async (_req, res) => {
    try {
      const [userCount, postCount, topicCount, debateCount, agentCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(users_table),
        db.select({ count: sql<number>`count(*)` }).from(posts_table),
        db.select({ count: sql<number>`count(*)` }).from(topics_table),
        db.select({ count: sql<number>`count(*)` }).from(liveDebates_table),
        db.select({ count: sql<number>`count(*)` }).from(users_table).where(eq(users_table.role, "agent")),
      ]);
      const flywheelJobsList = await storage.getFlywheelJobs();
      const econMetrics = await economyService.getEconomyMetrics();
      res.json({
        totalUsers: userCount[0]?.count || 0,
        totalPosts: postCount[0]?.count || 0,
        totalTopics: topicCount[0]?.count || 0,
        totalDebates: debateCount[0]?.count || 0,
        totalAgents: agentCount[0]?.count || 0,
        totalFlywheelJobs: flywheelJobsList.length,
        economy: econMetrics,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/civilization-health", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await civilizationHealthService.getCivilizationHealthDashboard());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/digital-world/overview", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await digitalWorldOverviewService.getDigitalWorldOverview());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/council-governance/overview", requireRootAdmin, async (_req, res) => {
    try {
      res.json(councilGovernanceService.getOverview());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/council-governance/news-council", requireRootAdmin, async (_req, res) => {
    try {
      res.json(councilGovernanceService.getNewsCouncil());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/council-governance/debate-council", requireRootAdmin, async (_req, res) => {
    try {
      res.json(councilGovernanceService.getDebateCouncil());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/council-governance/package-contracts", requireRootAdmin, async (_req, res) => {
    try {
      res.json(councilGovernanceService.getPackageContracts());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/council-governance/sample-ledger", requireRootAdmin, async (_req, res) => {
    try {
      res.json(councilGovernanceService.getSampleLedger());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/council-governance/status-taxonomy", requireRootAdmin, async (_req, res) => {
    try {
      res.json(councilGovernanceService.getStatusTaxonomy());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/knowledge-graph/summary", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await knowledgeGraphService.getSummary());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/knowledge-graph/nodes", requireRootAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10);
      const nodeType = typeof req.query.nodeType === "string" ? req.query.nodeType : undefined;
      const verificationStatus = typeof req.query.verificationStatus === "string" ? req.query.verificationStatus : undefined;
      res.json(await knowledgeGraphService.listNodes({
        nodeType,
        verificationStatus,
        limit: Number.isFinite(limit) ? limit : 100,
      }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/knowledge-graph/edges", requireRootAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10);
      const relationType = typeof req.query.relationType === "string" ? req.query.relationType : undefined;
      res.json(await knowledgeGraphService.listEdges({
        relationType,
        limit: Number.isFinite(limit) ? limit : 100,
      }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/knowledge-graph/sync", requireRootAdmin, async (req, res) => {
    try {
      const actor = getAdminActor(req);
      res.json(await knowledgeGraphService.sync({ actorId: actor.id, actorType: actor.type }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/public/knowledge-graph/summary", async (_req, res) => {
    try {
      res.json(await knowledgeGraphService.getPublicSummary());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/public/knowledge-graph/nodes", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10);
      const offset = parseInt(req.query.offset as string, 10);
      const nodeType = typeof req.query.nodeType === "string" ? req.query.nodeType : undefined;
      res.json(await knowledgeGraphService.listPublicNodes({
        nodeType,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/public/knowledge-graph/edges", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10);
      const offset = parseInt(req.query.offset as string, 10);
      const relationType = typeof req.query.relationType === "string" ? req.query.relationType : undefined;
      res.json(await knowledgeGraphService.listPublicEdges({
        relationType,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/safe-mode", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await safeModeService.getStatus());
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/safe-mode", requireRootAdmin, async (req, res) => {
    try {
      const parsed = safeModeUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid safe-mode update request" });
      }
      const actor = getAdminActor(req);
      res.json(await safeModeService.updateControls(parsed.data, actor));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/safe-mode/action", requireRootAdmin, async (req, res) => {
    try {
      const parsed = safeModeActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid safe-mode action request" });
      }
      const actor = getAdminActor(req);
      res.json(await safeModeService.applyAction(parsed.data, actor));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/external-agents/keys", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await externalAgentApiService.listKeys());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/external-agents/keys", requireRootAdmin, async (req, res) => {
    try {
      const parsed = externalAgentKeyCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid external agent key request" });
      res.status(201).json(await externalAgentApiService.createKey(parsed.data, getAdminActor(req)));
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/external-agents/keys/:id", requireRootAdmin, async (req, res) => {
    try {
      const parsed = externalAgentKeyUpdateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid external agent key update" });
      res.json(await externalAgentApiService.updateKey(req.params.id, parsed.data, getAdminActor(req)));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/external-agents/keys/:id/revoke", requireRootAdmin, async (req, res) => {
    try {
      const parsed = externalAgentRevokeSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid revoke request" });
      res.json(await externalAgentApiService.revokeKey(req.params.id, getAdminActor(req), parsed.data.reason));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/external-agents/audit", requireRootAdmin, async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 50;
      res.json(await externalAgentApiService.listAudit(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/live-studio/debates", requireRootAdmin, async (req, res) => {
    try {
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
      res.json(await liveDebateStudioService.listDebates(Number.isFinite(limit) ? limit : undefined));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/live-studio/debates/:id", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid debate id" });
      res.json(await liveDebateStudioService.getStudioState(id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/live-studio/debates/:id/pause", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid debate id" });
      const parsed = liveStudioActionSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid pause request" });
      const actor = getAdminActor(req);
      res.json(await liveDebateStudioService.pauseDebate(id, parsed.data, { ...actor, ipAddress: req.ip }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/live-studio/debates/:id/resume", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid debate id" });
      const parsed = liveStudioActionSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid resume request" });
      const actor = getAdminActor(req);
      res.json(await liveDebateStudioService.resumeDebate(id, parsed.data, { ...actor, ipAddress: req.ip }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/live-studio/debates/:id/end", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid debate id" });
      const parsed = liveStudioActionSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid end request" });
      const actor = getAdminActor(req);
      res.json(await liveDebateStudioService.endDebate(id, parsed.data, { ...actor, ipAddress: req.ip }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/live-studio/debates/:id/questions", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid debate id" });
      const parsed = liveStudioQuestionSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid question request" });
      const actor = getAdminActor(req);
      res.json(await liveDebateStudioService.addQuestionPlaceholder(id, parsed.data, { ...actor, ipAddress: req.ip }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/live-studio/debates/:id/participants/:participantId/eject", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const participantId = parseInt(req.params.participantId as string, 10);
      if (!Number.isFinite(id) || !Number.isFinite(participantId)) return res.status(400).json({ message: "Invalid debate or participant id" });
      const parsed = liveStudioActionSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid eject request" });
      const actor = getAdminActor(req);
      res.json(await liveDebateStudioService.ejectParticipant(id, participantId, parsed.data, { ...actor, ipAddress: req.ip }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/users", requireRootAdmin, async (_req, res) => {
    try {
      const allUsers = await db.select().from(users_table).orderBy(desc(users_table.reputation));
      res.json(allUsers.map(u => ({ ...u, password: undefined })));
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/admin/users/:id", requireRootAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      await db.delete(users_table).where(eq(users_table.id, id));
      res.json({ message: "User deleted" });
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/users/:id", requireRootAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const adminUpdateSchema = z.object({
        role: z.enum(["human", "agent"]).optional(),
        reputation: z.number().int().min(0).optional(),
        rankLevel: z.enum(["Basic", "Premium", "VIP", "Expert", "VVIP"]).optional(),
        energy: z.number().int().min(0).optional(),
        badge: z.string().optional(),
      });
      const parsed = adminUpdateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid update data", errors: parsed.error.issues });
      const updateData = Object.fromEntries(Object.entries(parsed.data).filter(([_, v]) => v !== undefined));
      if (Object.keys(updateData).length === 0) return res.status(400).json({ message: "No valid fields to update" });
      const [updated] = await db.update(users_table).set(updateData).where(eq(users_table.id, id)).returning();
      res.json({ ...updated, password: undefined });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/staff", requireAdminPermission(STAFF_MANAGE_PERMISSION), async (_req, res) => {
    try {
      const staff = await db.select().from(adminStaff_table).orderBy(desc(adminStaff_table.createdAt));
      res.json(staff.map(serializeStaff));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/staff", requireAdminPermission(STAFF_MANAGE_PERMISSION), async (req, res) => {
    try {
      const parsed = createStaffSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid staff data", errors: parsed.error.issues });
      const actor = getAdminActor(req);
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const [created] = await db.insert(adminStaff_table).values({
        email: parsed.data.email.trim().toLowerCase(),
        username: parsed.data.username.trim(),
        displayName: parsed.data.displayName.trim(),
        passwordHash,
        role: parsed.data.role,
        permissions: parsed.data.permissions,
        active: parsed.data.active,
        // T298 — Persist optional Slack handle for shared-preview banner DM button.
        slackHandle: parsed.data.slackHandle?.trim() || null,
        createdBy: actor.id,
        updatedBy: actor.id,
        updatedAt: new Date(),
      }).returning();
      invalidateAdminIdentityCache(created.id, created.email, created.username);
      await auditStaffAction(req, "staff_create", created.id, { role: created.role, permissions: created.permissions, active: created.active });
      res.status(201).json(serializeStaff(created));
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/staff/:id", requireAdminPermission(STAFF_MANAGE_PERMISSION), async (req, res) => {
    try {
      const parsed = updateStaffSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid staff update data", errors: parsed.error.issues });
      const actor = getAdminActor(req);
      const updateData: Partial<typeof adminStaff_table.$inferInsert> = {
        updatedBy: actor.id,
        updatedAt: new Date(),
      };
      if (parsed.data.email !== undefined) updateData.email = parsed.data.email.trim().toLowerCase();
      if (parsed.data.username !== undefined) updateData.username = parsed.data.username.trim();
      if (parsed.data.displayName !== undefined) updateData.displayName = parsed.data.displayName.trim();
      if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
      if (parsed.data.permissions !== undefined) updateData.permissions = parsed.data.permissions;
      if (parsed.data.password !== undefined) updateData.passwordHash = await bcrypt.hash(parsed.data.password, 10);
      if (parsed.data.active !== undefined) {
        updateData.active = parsed.data.active;
        updateData.disabledAt = parsed.data.active ? null : new Date();
      }
      // T298 — Allow editing Slack handle; empty string clears it back to null.
      if (parsed.data.slackHandle !== undefined) {
        const trimmed = parsed.data.slackHandle.trim();
        updateData.slackHandle = trimmed.length > 0 ? trimmed : null;
      }
      const [updated] = await db.update(adminStaff_table)
        .set(updateData)
        .where(eq(adminStaff_table.id, req.params.id as string))
        .returning();
      if (!updated) return res.status(404).json({ message: "Staff member not found" });
      invalidateAdminIdentityCache(updated.id, updated.email, updated.username);
      await auditStaffAction(req, "staff_update", updated.id, {
        changedFields: Object.keys(parsed.data).filter((key) => parsed.data[key as keyof typeof parsed.data] !== undefined),
      });
      res.json(serializeStaff(updated));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/staff/:id/disable", requireAdminPermission(STAFF_MANAGE_PERMISSION), async (req, res) => {
    try {
      const actor = getAdminActor(req);
      const id = req.params.id as string;
      if (actor.type === "staff" && actor.id === id) {
        return res.status(400).json({ message: "Staff members cannot disable their own account" });
      }
      const [updated] = await db.update(adminStaff_table)
        .set({ active: false, disabledAt: new Date(), updatedAt: new Date(), updatedBy: actor.id })
        .where(eq(adminStaff_table.id, id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Staff member not found" });
      invalidateAdminIdentityCache(updated.id, updated.email, updated.username);
      await auditStaffAction(req, "staff_disable", updated.id, { role: updated.role });
      res.json(serializeStaff(updated));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/staff/:id/enable", requireAdminPermission(STAFF_MANAGE_PERMISSION), async (req, res) => {
    try {
      const actor = getAdminActor(req);
      const [updated] = await db.update(adminStaff_table)
        .set({ active: true, disabledAt: null, updatedAt: new Date(), updatedBy: actor.id })
        .where(eq(adminStaff_table.id, req.params.id as string))
        .returning();
      if (!updated) return res.status(404).json({ message: "Staff member not found" });
      invalidateAdminIdentityCache(updated.id, updated.email, updated.username);
      await auditStaffAction(req, "staff_enable", updated.id, { role: updated.role });
      res.json(serializeStaff(updated));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/system-agents", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await listSystemAgents());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/system-agents/seed", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await seedSystemAgents());
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/system-agents/:agentId", requireRootAdmin, async (req, res) => {
    try {
      const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "enabled boolean required" });
      const updated = await setSystemAgentEnabled(req.params.agentId, parsed.data.enabled);
      if (!updated) return res.status(404).json({ message: "System agent not found" });
      res.json(updated);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/agent-behavior/simulate", requireRootAdmin, async (req, res) => {
    try {
      const parsed = agentBehaviorSimulationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid agent behavior simulation request" });
      res.json(await simulateAgentBehaviorDecision(parsed.data));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/agent-graph-access/evaluate", requireRootAdmin, async (req, res) => {
    try {
      const parsed = agentGraphAccessEvaluateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid agent graph access evaluation request" });
      res.json(await agentGraphAccessService.retrieveRelevantGraphContext(parsed.data));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/knowledge-economy/gvi", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await gluonValueIndexService.getCurrent());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/knowledge-economy/gvi/preview", requireRootAdmin, async (req, res) => {
    try {
      const parsed = gviPreviewSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: "Invalid GVI preview request" });
      res.json(await gluonValueIndexService.preview(parsed.data.componentValues));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/knowledge-economy/gvi/snapshot", requireRootAdmin, async (req, res) => {
    try {
      const parsed = gviPreviewSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: "Invalid GVI snapshot request" });
      const actor = getAdminActor(req);
      res.json(await gluonValueIndexService.createSnapshot(parsed.data.componentValues, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/knowledge-economy/redemption/eligibility", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await gluonRedemptionComplianceService.listEligibility());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/knowledge-economy/redemption/eligibility/:id", requireRootAdmin, async (req, res) => {
    try {
      res.json(await gluonRedemptionComplianceService.getEligibilityReview(req.params.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/knowledge-economy/redemption/eligibility/preview", requireRootAdmin, async (req, res) => {
    try {
      const parsed = redemptionEligibilityPreviewSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid Gluon redemption eligibility preview request" });
      const actor = getAdminActor(req);
      res.json(await gluonRedemptionComplianceService.previewEligibility(parsed.data, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/knowledge-economy/redemption/eligibility/:id/mark-reviewed", requireRootAdmin, async (req, res) => {
    try {
      const parsed = redemptionEligibilityReviewSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid Gluon redemption review request" });
      const actor = getAdminActor(req);
      res.json(await gluonRedemptionComplianceService.markReviewed(req.params.id, actor.id, parsed.data.reason));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/knowledge-economy/redemption/eligibility/:id/reject", requireRootAdmin, async (req, res) => {
    try {
      const parsed = redemptionEligibilityRejectSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "A rejection reason is required" });
      const actor = getAdminActor(req);
      res.json(await gluonRedemptionComplianceService.reject(req.params.id, actor.id, parsed.data.reason));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/knowledge-economy/packets", requireRootAdmin, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json(await knowledgeEconomyService.listAdminPackets(status));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/knowledge-economy/packets/:id", requireRootAdmin, async (req, res) => {
    try {
      res.json(await knowledgeEconomyService.getPacketDetail(req.params.id, { admin: true }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/knowledge-economy/packets/:id/accept", requireRootAdmin, async (req, res) => {
    try {
      const parsed = knowledgePacketReviewSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid packet acceptance request" });
      const actor = getAdminActor(req);
      res.json(await knowledgeEconomyService.reviewPacket(req.params.id, { ...parsed.data, decision: "accepted" }, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/knowledge-economy/packets/:id/reject", requireRootAdmin, async (req, res) => {
    try {
      const parsed = knowledgePacketReviewSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid packet rejection request" });
      const actor = getAdminActor(req);
      res.json(await knowledgeEconomyService.reviewPacket(req.params.id, { ...parsed.data, decision: "rejected" }, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/knowledge-economy/packets/:id/challenge", requireRootAdmin, async (req, res) => {
    try {
      const parsed = knowledgePacketReviewSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid packet challenge request" });
      const actor = getAdminActor(req);
      res.json(await knowledgeEconomyService.reviewPacket(req.params.id, { ...parsed.data, decision: "challenged" }, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/knowledge-economy/packets/:id/gluon-preview", requireRootAdmin, async (req, res) => {
    try {
      res.json(await knowledgeEconomyService.previewGluon(req.params.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/knowledge-economy/packets/:id/dna-preview", requireRootAdmin, async (req, res) => {
    try {
      const parsed = knowledgePacketDnaPreviewSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid DNA preview request" });
      const actor = getAdminActor(req);
      res.json(await knowledgeEconomyService.previewDnaMutation(req.params.id, parsed.data.agentId, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/news-to-debate/articles", requireRootAdmin, async (req, res) => {
    try {
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 25;
      res.json(await newsToDebateService.listCandidateArticles(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/news-to-debate/generate", requireRootAdmin, async (req, res) => {
    try {
      const parsed = newsToDebateGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid News-to-Debate request" });
      }
      res.json(await newsToDebateService.generateDraft(parsed.data));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/podcast-scripts/debates", requireRootAdmin, async (req, res) => {
    try {
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 25;
      res.json(await podcastScriptEngine.listCandidateDebates(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/podcast-scripts", requireRootAdmin, async (req, res) => {
    try {
      const debateId = typeof req.query.debateId === "string" ? parseInt(req.query.debateId, 10) : undefined;
      res.json(await podcastScriptEngine.listPackages(Number.isFinite(debateId) ? debateId : undefined));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/podcast-scripts/generate", requireRootAdmin, async (req, res) => {
    try {
      const parsed = podcastScriptGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid podcast script request" });
      }
      const actor = getAdminActor(req);
      res.json(await podcastScriptEngine.generatePackage({ debateId: parsed.data.debateId, generatedBy: actor.id }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/voice-jobs/packages", requireRootAdmin, async (req, res) => {
    try {
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
      res.json(await podcastVoiceService.listEligibleScriptPackages(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/voice-jobs", requireRootAdmin, async (req, res) => {
    try {
      const scriptPackageId = typeof req.query.scriptPackageId === "string" ? parseInt(req.query.scriptPackageId, 10) : undefined;
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
      res.json(await podcastVoiceService.listJobs({
        scriptPackageId: Number.isFinite(scriptPackageId) ? scriptPackageId : undefined,
        limit,
      }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/voice-jobs/:id/segments/:segmentIndex/audio", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const segmentIndex = parseInt(req.params.segmentIndex as string, 10);
      if (!Number.isFinite(id) || !Number.isFinite(segmentIndex)) {
        return res.status(400).json({ message: "Invalid voice job audio request" });
      }
      const audio = await podcastVoiceService.getSegmentAudio(id, segmentIndex);
      res.setHeader("Content-Type", audio.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${audio.filename}"`);
      res.send(audio.buffer);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/voice-jobs/:id", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid voice job id" });
      res.json(await podcastVoiceService.getJob(id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/voice-jobs/generate", requireRootAdmin, async (req, res) => {
    try {
      const parsed = voiceJobGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid voice job request" });
      }
      const actor = getAdminActor(req);
      await safeModeService.assertCapabilityAllowed("podcast_audio_generation", actor.id);
      res.json(await podcastVoiceService.generateVoiceJob({
        scriptPackageId: parsed.data.scriptPackageId,
        scriptType: parsed.data.scriptType,
        providerPreference: parsed.data.provider,
        generatedBy: actor.id,
      }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/video-render/eligible-packages", requireRootAdmin, async (req, res) => {
    try {
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
      res.json(await avatarVideoRenderService.listEligiblePackages(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/video-render/jobs", requireRootAdmin, async (req, res) => {
    try {
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
      res.json(await avatarVideoRenderService.listJobs(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/video-render/jobs/:id", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid video render job id" });
      res.json(await avatarVideoRenderService.getJob(id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/video-render/jobs", requireRootAdmin, async (req, res) => {
    try {
      const parsed = avatarVideoRenderJobSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid video render job request" });
      }
      const actor = getAdminActor(req);
      res.json(await avatarVideoRenderService.createJob({
        ...parsed.data,
        createdBy: actor.id,
      }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/video-render/jobs/:id/preview", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid video render job id" });
      const actor = getAdminActor(req);
      res.json(await avatarVideoRenderService.previewJob(id, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/video-render/jobs/:id/render", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid video render job id" });
      const actor = getAdminActor(req);
      res.json(await avatarVideoRenderService.renderJob(id, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/video-render/jobs/:id/cancel", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid video render job id" });
      const actor = getAdminActor(req);
      res.json(await avatarVideoRenderService.cancelJob(id, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get(
    "/api/admin/video-render/jobs/:id/captions.srt",
    requireRootAdmin,
    createCaptionsSrtRouteHandler({
      getJob: (id: number) => avatarVideoRenderService.getJob(id),
      onError: (res, err) => handleServiceError(res, err),
    }),
  );

  app.get(
    "/api/admin/video-render/jobs/:id/preview.mp4",
    requireRootAdmin,
    createPreviewMp4RouteHandler({
      getJob: (id: number) => avatarVideoRenderService.getJob(id),
      onError: (res, err) => handleServiceError(res, err),
    }),
  );

  app.get("/api/admin/youtube-publishing/eligible", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await youtubePublishingService.listEligible());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/youtube-publishing/packages", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await youtubePublishingService.listPackages());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/youtube-publishing/packages/:id", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid YouTube package id" });
      res.json(await youtubePublishingService.getPackage(id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/youtube-publishing/packages", requireRootAdmin, async (req, res) => {
    try {
      const parsed = youtubePublishingPackageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid YouTube package request" });
      }
      const actor = getAdminActor(req);
      res.json(await youtubePublishingService.createOrRefreshPackage({
        scriptPackageId: parsed.data.scriptPackageId,
        audioJobId: parsed.data.audioJobId,
        generatedClipId: parsed.data.generatedClipId,
        createdBy: actor.id,
      }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/youtube-publishing/packages/:id/validate", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid YouTube package id" });
      const actor = getAdminActor(req);
      res.json(await youtubePublishingService.validatePackage(id, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/youtube-publishing/packages/:id/approve", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid YouTube package id" });
      const actor = getAdminActor(req);
      res.json(await youtubePublishingService.approvePackage(id, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/youtube-publishing/packages/:id/upload", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid YouTube package id" });
      const actor = getAdminActor(req);
      await safeModeService.assertCapabilityAllowed("youtube_upload", actor.id);
      res.json(await youtubePublishingService.uploadPackage(id, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/social-distribution/eligible", requireRootAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10);
      res.json(await socialDistributionApprovalService.listEligiblePackages(Number.isFinite(limit) ? limit : 50));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/social-distribution/packages", requireRootAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10);
      res.json(await socialDistributionApprovalService.listPackages(Number.isFinite(limit) ? limit : 50));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/social-distribution/packages/:id", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid social distribution package id" });
      res.json(await socialDistributionApprovalService.getPackage(id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/social-distribution/packages/generate", requireRootAdmin, async (req, res) => {
    try {
      const parsed = socialDistributionGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid social distribution package request" });
      }
      const actor = getAdminActor(req);
      res.status(201).json(await socialDistributionApprovalService.generatePackage({ ...parsed.data, createdBy: actor.id }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/social-distribution/packages/:id/approve", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid social distribution package id" });
      const actor = getAdminActor(req);
      res.json(await socialDistributionApprovalService.approvePackage(id, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/social-distribution/packages/:id/export", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid social distribution package id" });
      const actor = getAdminActor(req);
      res.json(await socialDistributionApprovalService.exportPackage(id, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/social-distribution/packages/:id/post", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid social distribution package id" });
      const actor = getAdminActor(req);
      res.json(await socialDistributionApprovalService.postPackage(id, actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/social-distribution/automation-settings", requireRootAdmin, async (_req, res) => {
    try {
      const settings = await socialDistributionApprovalService.getSettings();
      const providerStatus = await socialDistributionApprovalService.platformStatuses(settings);
      res.json({ settings, providerStatus });
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/social-distribution/automation-settings", requireRootAdmin, async (req, res) => {
    try {
      const parsed = socialDistributionAutomationSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid social automation settings request" });
      }
      const actor = getAdminActor(req);
      const settings = await socialDistributionApprovalService.updateSettings(parsed.data as any, actor.id);
      const providerStatus = await socialDistributionApprovalService.platformStatuses(settings);
      res.json({ settings, providerStatus });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/social-distribution/automation/evaluate", requireRootAdmin, async (req, res) => {
    try {
      const actor = getAdminActor(req);
      await safeModeService.assertCapabilityAllowed("social_safe_automation", actor.id);
      res.json(await socialDistributionApprovalService.runSafeAutomationEvaluation(actor.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/posts", requireAnyAdminPermission(CONTENT_VIEW_PERMISSIONS), async (_req, res) => {
    try {
      const allPosts = await db.select().from(posts_table).orderBy(desc(posts_table.createdAt));
      res.json(allPosts);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/admin/posts/:id", requireAnyAdminPermission(MODERATION_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const id = req.params.id as string;
      await db.delete(posts_table).where(eq(posts_table.id, id));
      res.json({ message: "Post deleted" });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/topics", requireAnyAdminPermission(CONTENT_VIEW_PERMISSIONS), async (_req, res) => {
    try {
      const allTopics = await db.select().from(topics_table).orderBy(asc(topics_table.label));
      res.json(allTopics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/topics", requireAnyAdminPermission(CONTENT_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const parsed = insertTopicSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid topic data" });
      const topic = await storage.createTopic(parsed.data);
      res.status(201).json(topic);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/admin/topics/:id", requireAnyAdminPermission(CONTENT_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const id = req.params.id as string;
      await db.delete(topics_table).where(eq(topics_table.id, id));
      res.json({ message: "Topic deleted" });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/debates", requireAnyAdminPermission(MODERATION_VIEW_PERMISSIONS), async (_req, res) => {
    try {
      const allDebates = await storage.getLiveDebates();
      res.json(allDebates);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/admin/debates/:id", requireAnyAdminPermission(MODERATION_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      await db.delete(liveDebates_table).where(eq(liveDebates_table.id, id));
      res.json({ message: "Debate deleted" });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/trigger/:system", requireRootAdmin, async (req, res) => {
    try {
      const system = req.params.system as string;
      let result: any;
      switch (system) {
        case "orchestrator":
          result = await agentOrchestrator.triggerCycle();
          break;
        case "learning":
          result = await agentLearningService.runLearningCycle();
          break;
        case "collaboration":
          result = await collaborationService.getCollaborationMetrics();
          break;
        case "governance":
          result = await governanceService.runGovernanceCycle();
          break;
        case "civilization":
          result = await civilizationService.runCivilizationCycle();
          break;
        case "evolution":
          result = await evolutionService.runEvolutionCycle();
          break;
        case "ethics":
          result = await ethicsService.runEthicsCycle();
          break;
        case "collective":
          result = await collectiveIntelligenceService.runCollectiveIntelligenceCycle();
          break;
        case "news":
          result = await newsPipelineService.runPipeline();
          break;
        case "seed":
          return res.redirect(307, "/api/seed");
        default:
          return res.status(400).json({ message: `Unknown system: ${system}` });
      }
      res.json({ system, result: result || "triggered" });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- ADMIN MODERATION ----
  app.get("/api/admin/moderation/flagged-users", requireAnyAdminPermission(MODERATION_VIEW_PERMISSIONS), async (_req, res) => {
    try {
      const flagged = await storage.getFlaggedUsers();
      res.json(flagged.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        isSpammer: u.isSpammer,
        isShadowBanned: u.isShadowBanned,
        spamScore: u.spamScore,
        spamViolations: u.spamViolations,
        createdAt: u.createdAt,
      })));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/moderation/logs", requireAnyAdminPermission(MODERATION_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const logs = await storage.getModerationLogs(limit);
      res.json(logs);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/moderation/logs/:userId", requireAnyAdminPermission(MODERATION_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const logs = await storage.getModerationLogsByUser(req.params.userId);
      res.json(logs);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/moderation/shadow-ban/:userId", requireAnyAdminPermission(MODERATION_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      await storage.shadowBanUser(req.params.userId);
      founderDebugService.trackModerationAction("shadow_ban", req.params.userId);
      res.json({ message: "User shadow banned" });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/moderation/unban/:userId", requireAnyAdminPermission(MODERATION_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      await storage.unbanUser(req.params.userId);
      res.json({ message: "User unbanned" });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/moderation/mark-spammer/:userId", requireAnyAdminPermission(MODERATION_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      await storage.markUserAsSpammer(req.params.userId);
      founderDebugService.trackModerationAction("mark_spammer", req.params.userId);
      res.json({ message: "User marked as spammer" });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/moderation/user-status/:userId", requireAnyAdminPermission(MODERATION_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const status = await getUserModerationStatus(req.params.userId);
      res.json(status);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- NEWS PIPELINE ----
  app.get("/api/news", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const category = req.query.category as string | undefined;
      const offset = (page - 1) * limit;
      const [articles, total] = await Promise.all([
        storage.getNewsArticles(limit, category, offset),
        storage.countNewsArticles(category),
      ]);
      res.json({
        articles,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/news/latest", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const articles = await storage.getLatestNews(limit);
      res.json(articles);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/news/breaking", async (_req, res) => {
    try {
      const articles = await storage.getBreakingNews();
      res.json(articles);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/news/slug/:slug", async (req, res) => {
    try {
      const article = await newsPipelineService.getArticleBySlug(req.params.slug);
      if (!article) return res.status(404).json({ message: "Article not found" });
      res.json(article);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/news/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const article = await newsPipelineService.getArticle(id);
      if (!article) return res.status(404).json({ message: "Article not found" });
      res.json(article);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/news/trigger", requireAnyAdminPermission(CONTENT_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const result = await newsPipelineService.runPipeline();
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/news/evaluate-breaking", requireAnyAdminPermission(CONTENT_MANAGE_PERMISSIONS), async (_req, res) => {
    try {
      const { breakingNewsAgent } = await import("./services/breaking-news-agent");
      const processed = await breakingNewsAgent.processRecentArticles();
      const fixed = await breakingNewsAgent.fixMissingDebates();
      res.json({ evaluated: processed, debatesFixed: fixed });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/news/:id/comments", async (req, res) => {
    try {
      const articleId = parseInt(req.params.id);
      const comments = await storage.getNewsComments(articleId);
      const commentsWithReplies = await Promise.all(
        comments.map(async (comment) => {
          const replies = await storage.getNewsCommentReplies(comment.id);
          const author = await storage.getUser(comment.authorId);
          const repliesWithAuthors = await Promise.all(
            replies.map(async (reply) => {
              const replyAuthor = await storage.getUser(reply.authorId);
              return { ...reply, author: replyAuthor ? { id: replyAuthor.id, displayName: replyAuthor.displayName, avatar: replyAuthor.avatar, role: replyAuthor.role } : null };
            })
          );
          return {
            ...comment,
            author: author ? { id: author.id, displayName: author.displayName, avatar: author.avatar, role: author.role } : null,
            replies: repliesWithAuthors,
          };
        })
      );
      res.json(commentsWithReplies);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/news/:id/comments", requireAuth, postCooldownMiddleware, async (req, res) => {
    try {
      const articleId = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      const payload = { ...req.body };
      delete payload.userId;
      delete payload.authorId;
      delete payload.creatorId;
      const { content, parentId, commentType } = payload;
      if (!content) return res.status(400).json({ message: "content required" });

      if (await isUserSpammer(req.user.id)) {
        return res.status(403).json({ message: "Your account has been flagged for spam. You cannot post comments." });
      }

      const modResult = moderateContent(sanitizeHTML(content));
      if (!modResult.allowed) {
        await recordViolation(req.user.id, modResult.isSpam, modResult.category, "news_comment", content?.substring(0, 200));
        return res.status(400).json({ message: "Content violates platform safety guidelines." });
      }

      const comment = await storage.createNewsComment({
        articleId,
        authorId: req.user.id,
        content,
        parentId: parentId || null,
        commentType: commentType || "general",
      });
      const author = await storage.getUser(req.user.id);
      res.json({
        ...comment,
        author: author ? { id: author.id, displayName: author.displayName, avatar: author.avatar, role: author.role } : null,
        replies: [],
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/news/:id/like", requireAuth, async (req, res) => {
    try {
      const articleId = parseInt(req.params.id);
      if (req.body?.userId) {
        delete req.body.userId;
      }
      const liked = await storage.toggleNewsReaction(articleId, req.user.id, "like");
      const article = await storage.getNewsArticle(articleId);
      res.json({ liked, likesCount: article?.likesCount || 0 });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/news/:id/liked", requireAuth, async (req, res) => {
    try {
      const articleId = parseInt(req.params.id);
      const reaction = await storage.getNewsReaction(articleId, req.user.id);
      res.json({ liked: !!reaction });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/news/:id/share", requireAuth, async (req, res) => {
    try {
      const articleId = parseInt(req.params.id);
      if (req.body?.userId) {
        delete req.body.userId;
      }
      const { platform } = req.body;
      await storage.createNewsShare({ articleId, userId: req.user.id, platform: platform || "internal" });
      const article = await storage.getNewsArticle(articleId);
      res.json({ sharesCount: article?.sharesCount || 0 });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/news/comments/:id/like", requireAuth, async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);
      await storage.likeNewsComment(commentId);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- SOCIAL MEDIA ADMIN ----
  app.get("/api/admin/social/accounts", requireRootAdmin, async (_req, res) => {
    try {
      const accounts = await storage.getSocialAccounts();
      res.json(accounts);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/social/accounts", requireRootAdmin, async (req, res) => {
    try {
      const { platform, accountName, accessToken, refreshToken, autoPostEnabled, contentTypes } = req.body;
      if (!platform || !accountName) return res.status(400).json({ message: "platform and accountName required" });
      const account = await storage.createSocialAccount({
        platform, accountName,
        accessToken: accessToken || null,
        refreshToken: refreshToken || null,
        autoPostEnabled: autoPostEnabled || false,
        contentTypes: contentTypes || ["news", "breaking", "debate"],
      });
      res.json(account);
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/social/accounts/:id", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateSocialAccount(id, req.body);
      res.json(updated);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/admin/social/accounts/:id", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSocialAccount(id);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/social/posts", requireAnyAdminPermission(MARKETING_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string | undefined;
      const posts = await storage.getSocialPosts(limit, status);
      res.json(posts);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/social/posts", requireRootAdmin, async (req, res) => {
    try {
      const post = await storage.createSocialPost(req.body);
      res.json(post);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/social/posts/:id/publish", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { socialPublisherService } = await import("./services/social-publisher-service");
      const result = await socialPublisherService.publishPost(id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/social/generate-caption", requireRootAdmin, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin social caption", "admin-social-caption");
      if (!paid) return;
      const { contentType, contentId, platform } = req.body;
      if (!contentType || !contentId) return res.status(400).json({ message: "contentType and contentId required" });
      const { socialCaptionAgent } = await import("./services/social-caption-agent");
      const caption = await socialCaptionAgent.generateCaption(contentType, contentId, platform);
      res.json(caption);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/social/trigger-publish", requireRootAdmin, async (_req, res) => {
    try {
      const { socialPublisherService } = await import("./services/social-publisher-service");
      const result = await socialPublisherService.processPendingPosts();
      res.json({ processed: result });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/promotion/scores", requireRootAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string | undefined;
      const scores = await storage.getPromotionScores(limit, status);
      res.json(scores);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/promotion/scores/:id", requireRootAdmin, async (req, res) => {
    try {
      const score = await storage.getPromotionScore(parseInt(req.params.id));
      if (!score) return res.status(404).json({ message: "Not found" });
      res.json(score);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/promotion/review-queue", requireRootAdmin, async (_req, res) => {
    try {
      const queue = await storage.getPendingReviewPromotions();
      res.json(queue);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/promotion/evaluate", requireRootAdmin, async (req, res) => {
    try {
      const { contentType, contentId } = req.body;
      if (!contentType || !contentId) return res.status(400).json({ message: "contentType and contentId required" });
      const { promotionSelectorAgent } = await import("./services/promotion-selector-agent");
      const score = await promotionSelectorAgent.evaluateContent(contentType, contentId);
      res.json(score);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/promotion/evaluate-all", requireRootAdmin, async (_req, res) => {
    try {
      const { promotionSelectorAgent } = await import("./services/promotion-selector-agent");
      const evaluated = await promotionSelectorAgent.evaluateRecentContent();
      const results = await promotionSelectorAgent.processPromotions();
      res.json({ evaluated, ...results });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/promotion/override/:id", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { decision } = req.body;
      if (!decision || !["auto_promote", "no_promotion"].includes(decision)) {
        return res.status(400).json({ message: "decision must be 'auto_promote' or 'no_promotion'" });
      }
      const { promotionSelectorAgent } = await import("./services/promotion-selector-agent");
      const updated = await promotionSelectorAgent.overrideDecision(id, decision, "admin");
      res.json(updated);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/promotion/process", requireRootAdmin, async (_req, res) => {
    try {
      const { promotionSelectorAgent } = await import("./services/promotion-selector-agent");
      const results = await promotionSelectorAgent.processPromotions();
      res.json(results);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AI GROWTH BRAIN ----
  app.get("/api/admin/growth/analytics", requireRootAdmin, async (_req, res) => {
    try {
      const { growthBrainService } = await import("./services/growth-brain-service");
      const analytics = await growthBrainService.getAnalytics();
      res.json(analytics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/growth/performance", requireRootAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const platform = req.query.platform as string | undefined;
      if (platform) {
        const data = await storage.getSocialPerformanceByPlatform(platform, limit);
        return res.json(data);
      }
      const data = await storage.getSocialPerformance(limit);
      res.json(data);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/growth/viral", requireRootAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const data = await storage.getTopViralPosts(limit);
      res.json(data);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/growth/patterns", requireRootAdmin, async (req, res) => {
    try {
      const platform = req.query.platform as string | undefined;
      const data = await storage.getGrowthPatterns(platform);
      res.json(data);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/growth/learn", requireRootAdmin, async (_req, res) => {
    try {
      const { growthBrainService } = await import("./services/growth-brain-service");
      const collected = await growthBrainService.collectPerformanceFromSocialPosts();
      const result = await growthBrainService.analyzeAndLearn();
      res.json({ collected, ...result });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/growth/optimize", requireRootAdmin, async (req, res) => {
    try {
      const { platform } = req.body;
      if (!platform) return res.status(400).json({ message: "platform required" });
      const { growthBrainService } = await import("./services/growth-brain-service");
      const strategy = await growthBrainService.optimizeForPlatform(platform);
      res.json(strategy);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- FOUNDER CONTROL LAYER ----
  app.get("/api/admin/founder-control/configs", requireRootAdmin, async (_req, res) => {
    try {
      const { founderControlService } = await import("./services/founder-control-service");
      const configs = await founderControlService.getAllConfigs();
      res.json(configs);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/founder-control/status", requireRootAdmin, async (_req, res) => {
    try {
      const { founderControlService } = await import("./services/founder-control-service");
      const config = await founderControlService.getConfig();
      const stopped = await founderControlService.isEmergencyStopped();
      res.json({ config, emergencyStopped: stopped });
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/founder-control/config/:key", requireRootAdmin, async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (value === undefined || typeof value !== "number") {
        return res.status(400).json({ message: "numeric value required" });
      }
      const { founderControlService } = await import("./services/founder-control-service");
      const updated = await founderControlService.updateValue(key as string, value);
      res.json(updated);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/founder-control/bulk-update", requireRootAdmin, async (req, res) => {
    try {
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "updates array required" });
      }
      const { founderControlService } = await import("./services/founder-control-service");
      const results = await founderControlService.bulkUpdate(updates);
      res.json(results);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/founder-control/emergency-stop", requireRootAdmin, async (_req, res) => {
    try {
      const { founderControlService } = await import("./services/founder-control-service");
      await founderControlService.triggerEmergencyStop();
      res.json({ message: "Emergency stop activated. All automated systems paused." });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/founder-control/emergency-release", requireRootAdmin, async (_req, res) => {
    try {
      const { founderControlService } = await import("./services/founder-control-service");
      await founderControlService.releaseEmergencyStop();
      res.json({ message: "Emergency stop released. Systems resuming normal operation." });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/command-center/health", requireRootAdmin, async (_req, res) => {
    try {
      const { escalationService } = await import("./services/escalation-service");
      const { activityMonitorService } = await import("./services/activity-monitor-service");
      const { founderControlService } = await import("./services/founder-control-service");
      const [policy, metrics, founderConfig, emergencyStopped, pendingDecisions, openAnomalies] = await Promise.all([
        escalationService.getPolicy(),
        activityMonitorService.getLatestMetrics(),
        founderControlService.getConfig(),
        founderControlService.isEmergencyStopped(),
        storage.getPendingDecisions(),
        storage.getOpenAnomalies(),
      ]);
      res.json({
        policy,
        metrics,
        founderControl: { config: founderConfig, emergencyStopped },
        pendingDecisionCount: pendingDecisions.length,
        openAnomalyCount: openAnomalies.length,
        systemHealthy: !policy.killSwitch && !emergencyStopped && openAnomalies.filter((a: any) => a.severity === "HIGH").length === 0,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/command-center/alerts", requireRootAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const anomalies = await storage.getAllAnomalies(limit);
      res.json(anomalies);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/command-center/open-alerts", requireRootAdmin, async (_req, res) => {
    try {
      const anomalies = await storage.getOpenAnomalies();
      res.json(anomalies);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/command-center/alerts/:id/acknowledge", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateAnomalyStatus(id, "acknowledged");
      res.json(updated);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/command-center/alerts/:id/resolve", requireRootAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateAnomalyStatus(id, "resolved", new Date());
      res.json(updated);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/command-center/decisions", requireRootAdmin, async (req, res) => {
    try {
      const status = req.query.status as string;
      if (status === "pending") {
        const decisions = await storage.getPendingDecisions();
        res.json(decisions);
      } else {
        const limit = parseInt(req.query.limit as string) || 50;
        const decisions = await storage.getAllDecisions(limit);
        res.json(decisions);
      }
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/command-center/decisions/:id/approve", requireRootAdmin, async (req, res) => {
    try {
      const { escalationService } = await import("./services/escalation-service");
      const id = parseInt(req.params.id);
      const decision = await escalationService.approveDecision(id);
      res.json(decision);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/command-center/decisions/:id/reject", requireRootAdmin, async (req, res) => {
    try {
      const { escalationService } = await import("./services/escalation-service");
      const id = parseInt(req.params.id);
      const decision = await escalationService.rejectDecision(id);
      res.json(decision);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/command-center/policy", requireRootAdmin, async (_req, res) => {
    try {
      const { escalationService } = await import("./services/escalation-service");
      const policy = await escalationService.getPolicy();
      res.json(policy);
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/command-center/policy", requireRootAdmin, async (req, res) => {
    try {
      const { escalationService } = await import("./services/escalation-service");
      const { mode, safeMode, killSwitch } = req.body;
      const policy = await escalationService.updatePolicy({ mode, safeMode, killSwitch });
      res.json(policy);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/command-center/kill-switch", requireRootAdmin, async (_req, res) => {
    try {
      const { escalationService } = await import("./services/escalation-service");
      const { founderControlService } = await import("./services/founder-control-service");
      await escalationService.setKillSwitch(true);
      await founderControlService.triggerEmergencyStop();
      res.json({ message: "Kill switch activated. All automation halted." });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/command-center/kill-switch/release", requireRootAdmin, async (_req, res) => {
    try {
      const { escalationService } = await import("./services/escalation-service");
      const { founderControlService } = await import("./services/founder-control-service");
      await escalationService.setKillSwitch(false);
      await founderControlService.releaseEmergencyStop();
      res.json({ message: "Kill switch released. Systems resuming." });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/command-center/safe-mode", requireRootAdmin, async (req, res) => {
    try {
      const { escalationService } = await import("./services/escalation-service");
      const { enabled } = req.body;
      const policy = await escalationService.setSafeMode(!!enabled);
      res.json(policy);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/command-center/metrics/:key", requireRootAdmin, async (req, res) => {
    try {
      const { activityMonitorService } = await import("./services/activity-monitor-service");
      const since = req.query.since ? new Date(req.query.since as string) : undefined;
      const metrics = await activityMonitorService.getMetricHistory(req.params.key, since);
      res.json(metrics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/command-center/scan", requireRootAdmin, async (_req, res) => {
    try {
      const { activityMonitorService } = await import("./services/activity-monitor-service");
      const { anomalyDetectorService } = await import("./services/anomaly-detector-service");
      const { escalationService } = await import("./services/escalation-service");
      const metrics = await activityMonitorService.collectMetrics();
      const anomalies = await anomalyDetectorService.runDetection();
      if (anomalies.length > 0) {
        await escalationService.handleAnomalies(anomalies);
      }
      res.json({ metricsCollected: metrics.length, anomaliesDetected: anomalies.length, anomalies });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- BILLING / MONETIZATION ----
  app.get("/api/billing/plans", async (_req, res) => {
    try { res.json(await billingService.getPlans()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/billing/credit-packages", async (_req, res) => {
    try { res.json(await billingService.getCreditPackages()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/billing/credit-costs", async (_req, res) => {
    res.json(CREDIT_COSTS);
  });

  const purchaseCreditsSchema = z.object({ userId: z.string().min(1), packageId: z.string().min(1) });
  const useCreditsSchema = z.object({ userId: z.string().min(1), actionType: z.string().min(1), actionLabel: z.string().optional(), referenceId: z.string().optional() });
  const subscribeSchema = z.object({ userId: z.string().min(1), planName: z.string().min(1), billingCycle: z.enum(["monthly", "yearly"]).default("monthly") });
  const cancelSubSchema = z.object({ userId: z.string().min(1) });

  app.post("/api/billing/purchase-credits", requireAuth, async (req, res) => {
    try {
      const parsed = purchaseCreditsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.issues });
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const result = await billingService.purchaseCredits(userId, parsed.data.packageId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/billing/use-credits", requireAuth, async (req, res) => {
    try {
      const parsed = useCreditsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.issues });
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const cost = CREDIT_COSTS[parsed.data.actionType as keyof typeof CREDIT_COSTS] || 5;
      const result = await billingService.useCredits(userId, cost, parsed.data.actionType, parsed.data.actionLabel, parsed.data.referenceId);
      if (!result) return res.status(402).json({ message: "Insufficient credits" });
      res.json({ success: true, cost });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/billing/can-afford/:userId/:actionType", requireAuth, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(await billingService.canAfford(req.user.id, req.params.actionType));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/billing/summary/:userId", requireAuth, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(await billingService.getBillingSummary(req.user.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/billing/subscription/:userId", requireAuth, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(await billingService.getSubscriptionStatus(req.user.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/billing/subscribe", requireAuth, async (req, res) => {
    try {
      const parsed = subscribeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.issues });
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const result = await billingService.subscribeToPlan(userId, parsed.data.planName, parsed.data.billingCycle);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/billing/cancel-subscription", requireAuth, async (req, res) => {
    try {
      const parsed = cancelSubSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.issues });
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      await billingService.cancelSubscription(userId);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/billing/invoices/:userId", async (req, res) => {
    try { res.json(await billingService.getInvoices(req.params.userId)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/billing/usage/:userId", async (req, res) => {
    try { res.json(await billingService.getUsageStats(req.params.userId)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/billing/analytics", requireAnyAdminPermission(BILLING_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await billingService.getFounderAnalytics()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/billing/flywheel", requireRootAdmin, async (_req, res) => {
    try { res.json(await billingService.getRevenueFlywheelData()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/billing/phase-transition", requireRootAdmin, async (_req, res) => {
    try { res.json(await billingService.getPhaseTransitionData()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/transition-index", requireRootAdmin, async (_req, res) => {
    try { res.json(await phaseTransitionService.getTransitionIndex()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/transition-metrics", requireRootAdmin, async (_req, res) => {
    try { res.json(await phaseTransitionService.computeMetrics()); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/billing/flywheel/sync", requireRootAdmin, async (_req, res) => {
    try { 
      await billingService.syncFlywheelMetrics();
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  await billingService.seedPlansAndPackages();

  // ---- SEO & AI CRAWLER COMPLIANCE ----
  const seoService = (await import("./services/seo-service")).default;

  app.get("/sitemap.xml", async (req, res) => {
    const host = req.hostname;
    if (host && host.includes("replit.app")) {
      res.status(404).send("Not found");
      return;
    }
    try {
      const xml = await seoService.generateSitemap();
      res.set("Content-Type", "application/xml");
      res.send(xml);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/robots.txt", (req, res) => {
    res.set("Content-Type", "text/plain");
    const host = req.hostname;
    if (host && host.includes("replit.app")) {
      res.send("User-agent: *\nDisallow: /\n");
      return;
    }
    res.send(seoService.generateRobotsTxt());
  });

  app.get("/llms.txt", (_req, res) => {
    res.set("Content-Type", "text/plain");
    res.send(seoService.generateLlmsTxt());
  });

  app.get("/api/seo/knowledge", async (_req, res) => {
    try { res.json(await seoService.getPublicKnowledge()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/seo/knowledge-feed", async (_req, res) => {
    try { res.json(await seoService.getKnowledgeFeed()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/seo/stats", requireAnyAdminPermission(SEO_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await seoService.getSEOStats()); } catch (err) { handleServiceError(res, err); }
  });

  const { authorityService } = await import("./services/authority-service");

  app.post("/api/admin/seo/calculate-authority", requireRootAdmin, async (req, res) => {
    try {
      const { topicSlug } = req.body;
      if (topicSlug) {
        res.json(await authorityService.updateTopicAuthority(topicSlug));
      } else {
        const allTopics = await storage.getTopics();
        const results = [];
        for (const t of allTopics) {
          results.push(await authorityService.updateTopicAuthority(t.slug));
        }
        res.json({ success: true, results });
      }
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/calculate-gravity", requireRootAdmin, async (_req, res) => {
    try {
      const result = await seoService.calculateNetworkGravity();
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/gravity/history", requireAnyAdminPermission(SEO_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      res.json(await seoService.getGravityHistory(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/gravity/trends", requireAnyAdminPermission(SEO_VIEW_PERMISSIONS), async (_req, res) => {
    try {
      res.json(await seoService.getGravityTrends());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/gravity/generate-insights", requireRootAdmin, async (_req, res) => {
    try {
      const paid = await requirePaidAiAccess(_req, res, "ai_response", "Admin gravity insights", "admin-gravity-insights");
      if (!paid) return;
      const trends = await seoService.getGravityTrends();
      if (trends.records < 1) {
        return res.json({ insight: "Calculate gravity first to generate AI insights." });
      }

      if (!process.env.OPENAI_API_KEY && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.json({ insight: trends.insights.join(" ") || "OpenAI not configured. Using rule-based insights.", trends });
      }

      let OpenAI: any;
      try { OpenAI = (await import("openai")).default; } catch { return res.json({ insight: trends.insights.join(" ") || "No insights available.", trends }); }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
      });

      const response = await openai.chat.completions.create({
        model: "gpt-5.5",
        messages: [
          {
            role: "system",
            content: "You are a platform growth strategist analyzing network gravity metrics for a hybrid human-AI discussion platform. Provide concise, actionable insights about platform health, competitive moat strength, and growth trajectory. Be specific and data-driven."
          },
          {
            role: "user",
            content: `Analyze these Network Gravity metrics and provide strategic insights:

Gravity Score: ${(trends.currentScore * 100).toFixed(1)}% (measures self-reinforcing growth strength)
Growth Direction: ${trends.direction}
Self-Sustaining Score: ${((trends.selfSustaining || 0) * 100).toFixed(1)}% (how close to being impossible to compete with)
Overall Trend: ${trends.overallTrend > 0 ? "+" : ""}${(trends.overallTrend * 100).toFixed(1)}% over ${trends.records} measurements

Component Breakdown:
${Object.entries(trends.components || {}).map(([k, v]) => `- ${k}: ${((v as number) * 100).toFixed(1)}%`).join("\n")}

${Object.keys(trends.componentTrends || {}).length > 0 ? `Component Trends:\n${Object.entries(trends.componentTrends || {}).map(([k, v]: [string, any]) => `- ${k}: ${v.change > 0 ? "+" : ""}${(v.change * 100).toFixed(1)}%`).join("\n")}` : ""}

Provide:
1. A 2-3 sentence executive summary of platform health
2. The #1 growth opportunity
3. The #1 risk factor
4. Whether the platform is approaching self-sustainability (network effects making it hard to compete with)
Keep total response under 200 words.`
          }
        ],
        max_tokens: 500,
      });

      let insight: string;
      try {
        insight = response.choices[0]?.message?.content || trends.insights.join(" ");
      } catch {
        insight = trends.insights.join(" ") || "Unable to parse AI response.";
      }

      try {
        if (trends.history && trends.history.length > 0) {
          const latestId = trends.history[0].id;
          await db
            .update(networkGravity)
            .set({ aiInsights: insight })
            .where(eq(networkGravity.id, latestId));
        }
      } catch {}

      res.json({ insight, trends });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/calculate-civilization", requireRootAdmin, async (_req, res) => {
    try {
      const result = await seoService.calculateCivilizationHealth();
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/civilization/history", requireRootAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      res.json(await seoService.getCivilizationHistory(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/civilization/trends", requireRootAdmin, async (_req, res) => {
    try {
      res.json(await seoService.getCivilizationTrends());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/civilization/generate-insights", requireRootAdmin, async (_req, res) => {
    try {
      const paid = await requirePaidAiAccess(_req, res, "ai_response", "Admin civilization insights", "admin-civilization-insights");
      if (!paid) return;
      const trends = await seoService.getCivilizationTrends();
      if (trends.records < 1) {
        return res.json({ insight: "Calculate civilization health first to generate AI insights." });
      }

      if (!process.env.OPENAI_API_KEY && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.json({ insight: trends.insights.join(" ") || "OpenAI not configured. Using rule-based insights.", trends });
      }

      let OpenAI: any;
      try { OpenAI = (await import("openai")).default; } catch { return res.json({ insight: trends.insights.join(" ") || "No insights available.", trends }); }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
      });

      const dimSummary = Object.entries(trends.dimensions || {}).map(([k, v]: [string, any]) =>
        `- ${v.label}: ${(v.score * 100).toFixed(1)}% (${v.change > 0 ? "+" : ""}${(v.change * 100).toFixed(1)}%)`
      ).join("\n");

      const response = await openai.chat.completions.create({
        model: "gpt-5.5",
        messages: [
          {
            role: "system",
            content: "You are a civilization analyst for a hybrid human-AI discussion platform. Analyze intelligence accumulation, ecosystem stability, and long-term viability. Be specific and data-driven."
          },
          {
            role: "user",
            content: `Analyze Civilization Health metrics for a knowledge platform:

Health Score: ${(trends.currentHealth * 100).toFixed(1)}%
Maturity Level: ${trends.maturityLabel}
Trend: ${trends.trendDelta > 0 ? "+" : ""}${((trends.trendDelta || 0) * 100).toFixed(1)}%

Civilization Dimensions:
${dimSummary}

Economy: Credits earned ${trends.economyStats?.creditsEarned || 0}, spent ${trends.economyStats?.creditsSpent || 0}, ${trends.economyStats?.contributorRewards || 0} contributor rewards
Governance: Moderation accuracy ${((trends.governanceStats?.moderationAccuracy || 0) * 100).toFixed(0)}%, ${trends.governanceStats?.disputeResolutions || 0} dispute resolutions
Evolution: AI quality ${trends.evolutionStats?.qualityTrend || "unknown"}, verification avg ${((trends.evolutionStats?.avgVerificationScore || 0) * 100).toFixed(0)}%

Provide:
1. Executive summary of civilization health (2-3 sentences)
2. Which dimension needs the most attention and why
3. What milestone the platform is approaching next
4. Whether the platform is building persistent intelligence vs just collecting content
Keep under 200 words.`
          }
        ],
        max_tokens: 500,
      });

      let insight: string;
      try {
        insight = response.choices[0]?.message?.content || trends.insights.join(" ");
      } catch {
        insight = trends.insights.join(" ") || "Unable to parse AI response.";
      }

      try {
        if (trends.history && trends.history.length > 0) {
          const latestId = trends.history[0].id;
          await db
            .update(civilizationMetrics)
            .set({ aiInsights: insight })
            .where(eq(civilizationMetrics.id, latestId));
        }
      } catch {}

      res.json({ insight, trends });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/public/knowledge", async (_req, res) => {
    try { res.json(await seoService.getPublicKnowledge()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/knowledge-feed", async (_req, res) => {
    try {
      const { authorityService: authSvc } = await import("./services/authority-service");
      try {
        res.json(await authSvc.generateKnowledgeFeed());
      } catch {
        res.json(await seoService.getKnowledgeFeed());
      }
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/verify-post", requireRootAdmin, async (req, res) => {
    try {
      const { postId } = req.body;
      res.json({ score: await authorityService.calculateVerificationScore(postId) });
    } catch (err) { handleServiceError(res, err); }
  });

  const { aiContentService } = await import("./services/ai-content-service");

  app.post("/api/admin/seo/generate-post-seo", requireRootAdmin, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin SEO post", "admin-seo-post");
      if (!paid) return;
      const postId = req.body?.postId;
      if (!postId || typeof postId !== "string") return res.status(400).json({ error: "Valid postId string required" });
      const result = await aiContentService.generatePostSEO(postId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/generate-debate-consensus", requireRootAdmin, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin SEO debate consensus", "admin-seo-consensus");
      if (!paid) return;
      const debateId = Number(req.body?.debateId);
      if (!debateId || isNaN(debateId)) return res.status(400).json({ error: "Valid numeric debateId required" });
      const result = await aiContentService.generateDebateConsensus(debateId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/batch-generate", requireRootAdmin, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin SEO batch", "admin-seo-batch");
      if (!paid) return;
      const limit = Math.max(1, Math.min(50, Number(req.body?.limit) || 10));
      const result = await aiContentService.batchGeneratePostSEO(limit);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- USER-OWNED AI AGENT PLATFORM ROUTES ----

  app.get("/api/user-agent-builder/presets", requireAuth, async (_req, res) => {
    res.json(userAgentBuilderService.presets);
  });

  app.post("/api/user-agent-builder", requireAuth, async (req, res) => {
    try {
      const result = await userAgentBuilderService.createUserOwnedAgent(req.user.id, req.body);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/user-agent-builder/:id/status", requireAuth, async (req, res) => {
    try {
      const result = await userAgentBuilderService.getBuilderTrainingStatus(req.user.id, req.params.id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/user-agent-builder/:id/simulate", requireAuth, async (req, res) => {
    try {
      const result = await userAgentBuilderService.simulateUserOwnedAgent(req.user.id, req.params.id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/user-agent-builder/:id/test", requireAuth, async (req, res) => {
    try {
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      if (!message) return res.status(400).json({ message: "message is required" });
      await userAgentBuilderService.getBuilderTrainingStatus(req.user.id, req.params.id);
      const result = await userAgentRunnerService.runDemoInteraction(req.params.id, message.slice(0, 1000));
      res.json({
        mode: "private_test_only",
        autonomousActions: false,
        publicActions: false,
        ...result,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/knowledge-economy/eligible-agents", requireAuth, async (req, res) => {
    try {
      res.json(await knowledgeEconomyService.listEligibleAgents(req.user.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/knowledge-economy/packets/preview", requireAuth, async (req, res) => {
    try {
      const parsed = knowledgePacketPayloadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid knowledge packet preview request" });
      res.json(await knowledgeEconomyService.previewPacket(req.user.id, parsed.data));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/knowledge-economy/packets", requireAuth, async (req, res) => {
    try {
      const parsed = knowledgePacketPayloadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid knowledge packet request" });
      res.status(201).json(await knowledgeEconomyService.createPacket(req.user.id, parsed.data));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/knowledge-economy/packets/:id/submit", requireAuth, async (req, res) => {
    try {
      res.json(await knowledgeEconomyService.submitPacket(req.user.id, req.params.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/knowledge-economy/packets", requireAuth, async (req, res) => {
    try {
      res.json(await knowledgeEconomyService.listUserPackets(req.user.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/user-agents", requireAuth, async (req, res) => {
    try {
      const { name, persona, skills, avatarUrl, voiceId, model, provider, systemPrompt, temperature, visibility, deploymentModes, rateLimitPerMin, tags } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });
      const type = req.body?.type === "personal" ? "personal" : "business";
      const desiredModes = Array.isArray(deploymentModes) ? deploymentModes : ["private"];
      const wantsMarketplace = desiredModes.includes("marketplace");
      const ownerId = req.user.id;
      const effectiveModes = type === "personal" ? ["private"] : desiredModes;
      const effectiveVisibility = type === "personal"
        ? "private"
        : (visibility || (effectiveModes.includes("public") || effectiveModes.includes("marketplace") ? "public" : "private"));
      const marketplaceEnabled = type === "personal"
        ? false
        : (typeof req.body?.marketplaceEnabled === "boolean" ? req.body.marketplaceEnabled : wantsMarketplace);
      const exportable = type === "personal"
        ? true
        : (typeof req.body?.exportable === "boolean" ? req.body.exportable : false);

      const agent = await storage.createUserAgent({
        ownerId,
        type,
        agentType: type,
        name, persona, skills, avatarUrl, voiceId,
        model: model || "gpt-5.5", provider: provider || "openai",
        systemPrompt, temperature, visibility: effectiveVisibility, status: "draft",
        marketplaceEnabled,
        exportable,
        deploymentModes: effectiveModes,
        rateLimitPerMin: rateLimitPerMin || 30, tags,
      });
      res.json(agent);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/user-agents", async (req, res) => {
    try {
      const ownerId = req.query.ownerId as string;
      if (ownerId) {
        if (!req.session?.userId) return res.status(401).json({ error: "Authentication required" });
        if (ownerId !== req.session.userId) return res.status(403).json({ error: "Forbidden" });
        res.json(await storage.getUserAgentsByOwner(ownerId));
      } else if (req.session?.userId) {
        res.json(await storage.getUserAgentsByOwner(req.session.userId));
      } else {
        res.json(await storage.getPublicAgents());
      }
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/user-agents/:id", async (req, res) => {
    try {
      const agent = await storage.getUserAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      const sessionUserId = req.session?.userId || null;
      if (agent.type === "personal" && agent.ownerId !== sessionUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (agent.visibility === "private" && agent.ownerId !== sessionUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      res.json(agent);
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/user-agents/:id", requireAuth, async (req, res) => {
    try {
      const agent = await storage.getUserAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      if (agent.ownerId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const updates = { ...req.body };
      delete (updates as any).ownerId;
      if (updates.type === "personal" || agent.type === "personal") {
        updates.type = "personal";
        updates.agentType = "personal";
        updates.visibility = "private";
        updates.marketplaceEnabled = false;
        updates.exportable = true;
        updates.deploymentModes = ["private"];
      }
      const updated = await storage.updateUserAgent(req.params.id, updates);
      res.json(updated);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/user-agents/:id", requireAuth, async (req, res) => {
    try {
      const agent = await storage.getUserAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      if (agent.ownerId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      await storage.deleteUserAgent(req.params.id);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/user-agents/:id/deploy", requireAuth, async (req, res) => {
    try {
      const agent = await storage.getUserAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      if (agent.ownerId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const { modes } = req.body;
      const validModes = ["private", "public", "debate", "api", "marketplace"];
      const filtered = (modes || []).filter((m: string) => validModes.includes(m));
      const effectiveModes = agent.type === "personal" ? ["private"] : filtered;
      const visibility = effectiveModes.includes("public") || effectiveModes.includes("marketplace") ? "public" : "private";
      const marketplaceEnabled = agent.type === "personal" ? false : effectiveModes.includes("marketplace");
      const updated = await storage.updateUserAgent(req.params.id, {
        deploymentModes: effectiveModes,
        visibility,
        status: "active",
        marketplaceEnabled,
      });
      res.json(updated);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/user-agents/:id/knowledge", requireAuth, async (req, res) => {
    try {
      const agent = await storage.getUserAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      if (agent.ownerId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      res.json(await storage.getAgentKnowledgeSources(req.params.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/user-agents/:id/knowledge", requireAuth, async (req, res) => {
    try {
      const agent = await storage.getUserAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      if (agent.ownerId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const { sourceType, title, content, uri, metadata } = req.body;
      if (!sourceType || !title) return res.status(400).json({ error: "sourceType and title required" });
      const source = await storage.createAgentKnowledgeSource({
        agentId: req.params.id,
        sourceType, title, content, uri, metadata,
        status: "processed",
      });
      res.json(source);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/user-agents/knowledge/:sourceId", requireAuth, async (req, res) => {
    try {
      const source = await storage.getAgentKnowledgeSource(req.params.sourceId);
      if (!source) return res.status(404).json({ error: "Knowledge source not found" });
      const agent = await storage.getUserAgent(source.agentId);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      if (agent.ownerId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      await storage.deleteAgentKnowledgeSource(req.params.sourceId);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agents/:id/export", requireAuth, async (req, res) => {
    try {
      const agentId = req.params.id;
      const result = await agentExportService.exportAgent(agentId, req.user.id);
      res.setHeader("Content-Type", "application/vnd.mougle-agent+json");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (err: any) {
      if (err?.status === 429) {
        res.setHeader("Retry-After", String(err.retryAfter || 60));
        return res.status(429).json({ error: "Export rate limit exceeded", retryAfter: err.retryAfter || 60 });
      }
      handleServiceError(res, err);
    }
  });

  app.get("/api/agents/passport/exports", requireAuth, async (req, res) => {
    try {
      const exports = await storage.getAgentPassportExportsByOwner(req.user.id);
      res.json(exports);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agents/passport/:exportId/revoke", requireAuth, async (req, res) => {
    try {
      const revoked = await agentPassportRevocationService.revokePassport(
        req.params.exportId,
        req.user.id,
        req.body?.reason || null
      );
      res.json({ success: true, revoked });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agents/import", requireAuth, async (req, res) => {
    try {
      const passport = req.body?.passport;
      if (!passport || typeof passport !== "string") {
        return res.status(400).json({ error: "passport content required" });
      }
      const exportHash = crypto.createHash("sha256").update(passport).digest("hex");
      const exportRecord = await storage.getAgentPassportExportByHash(exportHash);
      if (!exportRecord) return res.json({ valid: false, revoked: false });
      return res.json({ valid: !exportRecord.revoked, revoked: exportRecord.revoked });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/passport/verify/:exportId", async (req, res) => {
    try {
      const exportId = req.params.exportId;
      const match = await storage.getAgentPassportExportById(exportId);
      if (!match) {
        res.setHeader("Cache-Control", "public, max-age=300");
        return res.json({ valid: false, revoked: false, origin: "mougle.com", standard: "MAP-1" });
      }
      const etagBase = JSON.stringify({
        id: match.id,
        revoked: match.revoked,
        revokedAt: match.revokedAt,
        exportedAt: match.exportedAt,
        exportVersion: match.exportVersion,
      });
      const etag = `"${crypto.createHash("sha256").update(etagBase).digest("hex")}"`;
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }
      res.setHeader("Cache-Control", match.revoked ? "public, max-age=60" : "public, max-age=300");
      return res.json({
        valid: !match.revoked,
        revoked: !!match.revoked,
        origin: "mougle.com",
        standard: "MAP-1",
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/intelligence-graph", requireAuth, async (req, res) => {
    try {
      const graph = await intelligenceGraphService.buildIntelligenceGraph(req.user.id);
      res.json(graph);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/reputation/me", requireAuth, async (req, res) => {
    try {
      const result = await reputationService.getUserReputation(req.user.id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/capabilities/me", requireAuth, async (req, res) => {
    try {
      const result = await capabilityService.getUserCapabilities(req.user.id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/journey/me", requireAuth, async (req, res) => {
    try {
      const result = await journeyService.getUserJourney(req.user.id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/marketplace/listings", async (req, res) => {
    try {
      const result = await marketplaceReviewTrustService.listPublicListings({
        category: typeof req.query.category === "string" ? req.query.category : undefined,
        query: typeof req.query.q === "string" ? req.query.q : undefined,
        featuredOnly: req.query.featured === "true",
        limit: typeof req.query.limit === "string" ? Number(req.query.limit) || undefined : undefined,
        sort: req.query.sort === "recent" || req.query.sort === "sandbox" ? req.query.sort : "trust",
      });
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/marketplace/listings/:id", async (req, res) => {
    try {
      const result = await marketplaceReviewTrustService.getPublicListing(req.params.id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/marketplace/safe-clone/eligible-agents", requireAuth, async (req, res) => {
    try {
      const result = await agentMarketplaceCloneService.listEligibleOwnedAgents(req.user.id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/marketplace/safe-clone/packages", requireAuth, async (req, res) => {
    try {
      const result = await agentMarketplaceCloneService.listCreatorPackages(req.user.id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/marketplace/safe-clone/reviews", requireAuth, async (req, res) => {
    try {
      const result = await marketplaceReviewTrustService.listCreatorReviewSummaries(req.user.id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/marketplace/safe-clone/preview", requireAuth, async (req, res) => {
    try {
      const parsed = marketplaceCloneRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid safe clone request" });
      const result = await agentMarketplaceCloneService.previewClonePackage(req.user.id, parsed.data);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/marketplace/safe-clone/packages", requireAuth, async (req, res) => {
    try {
      const parsed = marketplaceCloneRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid safe clone request" });
      const result = await agentMarketplaceCloneService.createClonePackage(req.user.id, parsed.data);
      res.status(201).json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/marketplace/safe-clone/:packageId/sandbox-test", requireAuth, async (req, res) => {
    try {
      const parsed = marketplaceCloneSandboxSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid sandbox request" });
      const result = await agentMarketplaceCloneService.sandboxTest(req.params.packageId, req.user.id, parsed.data);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/marketplace-clones", requireRootAdmin, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const result = await agentMarketplaceCloneService.listReviewPackages(status);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/marketplace-clones/:id", requireRootAdmin, async (req, res) => {
    try {
      const result = await agentMarketplaceCloneService.getPackageDetail(req.params.id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketplace-clones/:id/approve", requireRootAdmin, async (req, res) => {
    try {
      const admin = getAdminVerification(req);
      const actorId = admin?.actor.id || ROOT_ADMIN_ACTOR_ID;
      await safeModeService.assertCapabilityAllowed("marketplace_clone_approval", actorId);
      const result = await agentMarketplaceCloneService.approvePackage(req.params.id, actorId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketplace-clones/:id/reject", requireRootAdmin, async (req, res) => {
    try {
      const admin = getAdminVerification(req);
      const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
      const result = await agentMarketplaceCloneService.rejectPackage(req.params.id, admin?.actor.id || ROOT_ADMIN_ACTOR_ID, reason);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/marketplace-reviews", requireRootAdmin, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const result = await marketplaceReviewTrustService.listAdminReviews(status);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketplace-reviews/:id/approve", requireRootAdmin, async (req, res) => {
    try {
      const admin = getAdminVerification(req);
      const result = await marketplaceReviewTrustService.moderateReview(req.params.id, "approved", admin?.actor.id || ROOT_ADMIN_ACTOR_ID);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketplace-reviews/:id/hide", requireRootAdmin, async (req, res) => {
    try {
      const admin = getAdminVerification(req);
      const result = await marketplaceReviewTrustService.moderateReview(req.params.id, "hidden", admin?.actor.id || ROOT_ADMIN_ACTOR_ID);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketplace-reviews/:id/reject", requireRootAdmin, async (req, res) => {
    try {
      const admin = getAdminVerification(req);
      const result = await marketplaceReviewTrustService.moderateReview(req.params.id, "rejected", admin?.actor.id || ROOT_ADMIN_ACTOR_ID);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/marketplace/listings", requireAuth, async (req, res) => {
    return res.status(409).json({
      message: "Direct public marketplace listing creation is disabled. Use the safe clone package flow at /api/marketplace/safe-clone/packages.",
    });
  });

  app.post("/api/marketplace/purchase", requireAuth, async (req, res) => {
    return res.status(409).json({
      message: "Marketplace checkout and credit transfers are disabled in this safe-clone MVP. Use sandbox preview only.",
    });
  });

  app.get("/api/marketplace/purchases/:userId", requireAuth, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const purchases = await storage.getAgentPurchasesByBuyer(req.user.id);
      const enriched = await Promise.all(purchases.map(async (p) => {
        const agent = await storage.getUserAgent(p.agentId);
        return { ...p, agentName: agent?.name, agentAvatarUrl: agent?.avatarUrl };
      }));
      res.json(enriched);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/marketplace/earnings/:userId", requireAuth, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const sales = await storage.getAgentPurchasesBySeller(req.user.id);
      const totalEarnings = sales.reduce((sum, s) => sum + s.sellerEarnings, 0);
      const totalSales = sales.length;
      res.json({ totalEarnings, totalSales, sales });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/razorpay/onboard-creator", requireAuth, async (req, res) => {
    try {
      const { businessName, email, contactName, phone } = req.body;
      const userId = req.user.id;
      if (!businessName || !email || !contactName) {
        return res.status(400).json({ error: "userId, businessName, email, and contactName are required" });
      }
      const result = await razorpayMarketplaceService.onboardCreator(userId, { businessName, email, contactName, phone });
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/razorpay/creator-account/:userId", requireAuth, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const account = await razorpayMarketplaceService.getCreatorAccount(req.user.id);
      res.json({ account });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/razorpay/create-order", requireAuth, async (req, res) => {
    try {
      const { listingId } = req.body;
      const buyerId = req.user.id;
      if (!listingId) {
        return res.status(400).json({ error: "buyerId and listingId are required" });
      }
      const result = await razorpayMarketplaceService.createOrder(buyerId, listingId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/razorpay/verify-payment", async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: "Payment verification data required" });
      }
      const result = await razorpayMarketplaceService.verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/razorpay/webhook", async (req, res) => {
    try {
      const event = req.body;
      if (event?.event === "payment.captured" && event?.payload?.payment?.entity) {
        const payment = event.payload.payment.entity;
        if (payment.order_id) {
          await razorpayMarketplaceService.verifyPayment({
            razorpay_order_id: payment.order_id,
            razorpay_payment_id: payment.id,
            razorpay_signature: "webhook",
          });
        }
      }
      res.json({ status: "ok" });
    } catch (err) {
      console.error("[Razorpay Webhook] Error:", err);
      res.json({ status: "ok" });
    }
  });

  app.get("/api/razorpay/creator-earnings/:userId", requireAuth, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const result = await razorpayMarketplaceService.getCreatorEarnings(req.user.id);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/razorpay/creator-orders/:userId", requireAuth, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const orders = await razorpayMarketplaceService.getCreatorOrders(req.user.id);
      res.json(orders);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/publisher/profile/:userId", async (req, res) => {
    try {
      const profile = await publisherResponsibilityService.getProfile(req.params.userId);
      res.json({ profile });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/publisher/profile", async (req, res) => {
    try {
      const { userId, publisherName, companyName, businessType, address, city, state, country, postalCode, supportEmail, supportPhone, websiteUrl } = req.body;
      if (!userId || !publisherName || !supportEmail || !address || !businessType) {
        return res.status(400).json({ error: "userId, publisherName, supportEmail, address, and businessType are required" });
      }
      const profile = await publisherResponsibilityService.createOrUpdateProfile(userId, {
        publisherName, companyName, businessType, address, city, state, country, postalCode, supportEmail, supportPhone, websiteUrl,
      });
      res.json({ profile });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/publisher/accept-agreement", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      const ip = req.headers["x-forwarded-for"]?.toString() || req.socket?.remoteAddress || "unknown";
      const profile = await publisherResponsibilityService.acceptAgreement(userId, ip);
      res.json({ profile });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/publisher/can-publish/:userId", async (req, res) => {
    try {
      const result = await publisherResponsibilityService.canPublish(req.params.userId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/publisher/agreement", async (_req, res) => {
    try {
      res.json(publisherResponsibilityService.getAgreementText());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/publisher/app-info/:appId", async (req, res) => {
    try {
      const info = await publisherResponsibilityService.getPublisherInfoForApp(req.params.appId);
      if (!info) return res.status(404).json({ error: "App not found" });
      res.json(info);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/publisher/disclaimer", async (_req, res) => {
    try {
      res.json({ disclaimer: publisherResponsibilityService.getPlatformDisclaimer() });
    } catch (err) { handleServiceError(res, err); }
  });

  // Legal Safety Stack routes
  app.get("/api/legal-safety/risk-disclaimer/:appId", async (req, res) => {
    try {
      const disclaimer = await legalSafetyService.getAppDisclaimer(req.params.appId);
      if (!disclaimer) return res.status(404).json({ error: "App not found" });
      res.json(disclaimer);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/legal-safety/generate-disclaimer", requireAuth, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Legal safety disclaimer", "legal-safety-disclaimer");
      if (!paid) return;
      const { appId, industry, category } = req.body;
      if (!appId || !industry) return res.status(400).json({ error: "appId and industry required" });
      const disclaimer = await legalSafetyService.generateRiskDisclaimer(appId, industry, category);
      res.json(disclaimer);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/legal-safety/risk-categories", async (_req, res) => {
    try {
      res.json(legalSafetyService.getRiskCategories());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/legal-safety/report", async (req, res) => {
    try {
      const { appId, reporterId, reason, category, description, evidence } = req.body;
      if (!appId || !reporterId || !reason || !category) {
        return res.status(400).json({ error: "appId, reporterId, reason, and category required" });
      }
      const report = await legalSafetyService.submitReport({ appId, reporterId, reason, category, description, evidence });
      res.json(report);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/legal-safety/reports/:appId", async (req, res) => {
    try {
      const reports = await legalSafetyService.getReportsForApp(req.params.appId);
      res.json(reports);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/legal-safety/report-categories", async (_req, res) => {
    try {
      res.json(legalSafetyService.getReportCategories());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/moderation/reports", requireAnyAdminPermission(MODERATION_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const reports = await legalSafetyService.getAllReports(status);
      res.json(reports);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/moderation/resolve", requireAnyAdminPermission(MODERATION_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const { reportId, moderatorId, action, notes } = req.body;
      if (!reportId || !moderatorId || !action) return res.status(400).json({ error: "reportId, moderatorId, action required" });
      const report = await legalSafetyService.resolveReport(reportId, moderatorId, action, notes);
      res.json(report);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/moderation/dismiss", requireAnyAdminPermission(MODERATION_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const { reportId, moderatorId, notes } = req.body;
      if (!reportId || !moderatorId) return res.status(400).json({ error: "reportId, moderatorId required" });
      const report = await legalSafetyService.dismissReport(reportId, moderatorId, notes);
      res.json(report);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/legal-safety/check-ai-content", async (req, res) => {
    try {
      const { content, appId, userId } = req.body;
      if (!content) return res.status(400).json({ error: "content required" });
      const result = legalSafetyService.checkAiContent(content, appId, userId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/legal-safety/ai-violations", async (req, res) => {
    try {
      const appId = req.query.appId as string | undefined;
      const violations = await legalSafetyService.getAiViolations(appId);
      res.json(violations);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/legal-safety/ai-policy-rules", async (_req, res) => {
    try {
      res.json(legalSafetyService.getAiPolicyRules());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/legal-safety/creation-limit/:userId", async (req, res) => {
    try {
      const tier = (req.query.tier as string) || "free";
      const result = await legalSafetyService.checkCreationLimit(req.params.userId, tier);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/legal-safety/increment-creation", async (req, res) => {
    try {
      const { userId, type } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      await legalSafetyService.incrementCreationCount(userId, type || "app");
      const result = await legalSafetyService.checkCreationLimit(userId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/legal-safety/publish-checks/:userId/:appId", async (req, res) => {
    try {
      const result = await legalSafetyService.canPublishApp(req.params.userId, req.params.appId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/legal-safety/stats", requireAnyAdminPermission(MODERATION_VIEW_PERMISSIONS), async (_req, res) => {
    try {
      const stats = await legalSafetyService.getModerationStats();
      res.json(stats);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/legal-safety/daily-limits", async (_req, res) => {
    try {
      res.json(legalSafetyService.getDailyLimits());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/creator-verification/status/:userId", async (req, res) => {
    try {
      const status = await creatorVerificationService.getVerificationStatus(req.params.userId);
      res.json(status);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/creator-verification/trust-levels", async (_req, res) => {
    try {
      res.json(creatorVerificationService.getTrustLevels());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/creator-verification/marketing-methods", async (_req, res) => {
    try {
      res.json(creatorVerificationService.getMarketingMethods());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/creator-verification/promotion-channels", async (_req, res) => {
    try {
      res.json(creatorVerificationService.getPromotionChannels());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/creator-verification/promotion-agreement", async (_req, res) => {
    try {
      res.json(creatorVerificationService.getPromotionAgreement());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/creator-verification/privacy-notice", async (_req, res) => {
    try {
      res.json({ notice: creatorVerificationService.getPrivacyNotice() });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/creator-verification/declaration/:userId", async (req, res) => {
    try {
      const declaration = await creatorVerificationService.getDeclaration(req.params.userId);
      res.json({ declaration });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/creator-verification/declaration", async (req, res) => {
    try {
      const { userId, marketingMethods, targetAudience, promotionChannels, additionalNotes } = req.body;
      if (!userId || !marketingMethods || marketingMethods.length === 0) {
        return res.status(400).json({ error: "userId and at least one marketing method required" });
      }
      const ip = req.headers["x-forwarded-for"]?.toString() || req.socket?.remoteAddress || "unknown";
      const declaration = await creatorVerificationService.submitPromotionDeclaration(userId, {
        marketingMethods, targetAudience, promotionChannels, additionalNotes, ipAddress: ip,
      });
      res.json({ declaration });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/creator-verification/upgrade", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      const result = await creatorVerificationService.upgradeTrustLevel(userId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  // Trust Ladder routes
  app.get("/api/trust-ladder/levels", async (_req, res) => {
    try {
      res.json(trustLadderService.getLevels());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/trust-ladder/status/:userId", async (req, res) => {
    try {
      const status = await trustLadderService.getStatus(req.params.userId);
      res.json(status);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/trust-ladder/capabilities/:userId", async (req, res) => {
    try {
      const caps = await trustLadderService.getCapabilities(req.params.userId);
      res.json(caps);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/trust-ladder/recompute", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      const result = await trustLadderService.recompute(userId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/trust-ladder/check-access", async (req, res) => {
    try {
      const { userId, capability } = req.body;
      if (!userId || !capability) return res.status(400).json({ error: "userId and capability required" });
      const result = await trustLadderService.checkAccess(userId, capability);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  // Healthy Engagement routes
  app.get("/api/healthy-engagement/dashboard/:userId", async (req, res) => {
    try {
      const dashboard = await healthyEngagementService.getFullDashboard(req.params.userId);
      res.json(dashboard);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/healthy-engagement/actions/:userId", async (req, res) => {
    try {
      const actions = await healthyEngagementService.getRecommendedActions(req.params.userId);
      res.json(actions);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/healthy-engagement/progress/:userId", async (req, res) => {
    try {
      const metrics = await healthyEngagementService.getProgressMetrics(req.params.userId);
      res.json(metrics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/healthy-engagement/impact/:userId", async (req, res) => {
    try {
      const impact = await healthyEngagementService.getContributionImpact(req.params.userId);
      res.json(impact);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/healthy-engagement/labs-highlights", async (_req, res) => {
    try {
      const highlights = await healthyEngagementService.getLabsHighlights();
      res.json(highlights);
    } catch (err) { handleServiceError(res, err); }
  });

  const analyzeAppSchema = z.object({
    appPrompt: z.string().min(1),
    appName: z.string().optional(),
    appId: z.string().optional(),
    estimatedUsers: z.number().int().min(1).max(100000).optional(),
    targetMargin: z.number().min(0.1).max(0.95).optional(),
    pricingModel: z.enum(["subscription", "one_time", "usage"]).optional(),
    devHours: z.number().int().min(1).max(10000).optional(),
    vatRate: z.number().min(0).max(1).optional(),
    amortizationMonths: z.number().int().min(1).max(60).optional(),
  });

  app.post("/api/pricing-engine/analyze", resolveUser, async (req: any, res) => {
    try {
      const parsed = analyzeAppSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
      const result = await pricingEngineService.analyzeApp({ ...parsed.data, creatorId: req.user.id });
      founderDebugService.trackJourneyEvent({
        userId: req.user.id,
        event: "pricing_analyze",
        timestamp: Date.now(),
        traceId: req.traceId,
        metadata: { appName: parsed.data.appName, pricingModel: parsed.data.pricingModel },
      });
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/pricing-engine/analysis/:id", async (req, res) => {
    try {
      const analysis = await pricingEngineService.getAnalysis(req.params.id);
      if (!analysis) return res.status(404).json({ error: "Analysis not found" });
      res.json(analysis);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/pricing-engine/creator/:creatorId", async (req, res) => {
    try {
      const analyses = await pricingEngineService.getAnalysesByCreator(req.params.creatorId);
      res.json(analyses);
    } catch (err) { handleServiceError(res, err); }
  });

  const validatePriceSchema = z.object({
    analysisId: z.string().min(1),
    creatorSetPrice: z.number().int().min(1),
  });

  app.post("/api/pricing-engine/validate-price", async (req, res) => {
    try {
      const parsed = validatePriceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
      const result = await pricingEngineService.validatePrice(parsed.data);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  const previewSchema = z.object({
    appPrompt: z.string().min(1),
    estimatedUsers: z.number().int().min(1).max(100000).optional(),
    targetMargin: z.number().min(0.1).max(0.95).optional(),
    devHours: z.number().int().min(1).max(10000).optional(),
    vatRate: z.number().min(0).max(1).optional(),
    amortizationMonths: z.number().int().min(1).max(60).optional(),
  });

  app.post("/api/pricing-engine/preview", async (req, res) => {
    try {
      const parsed = previewSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
      const result = pricingEngineService.analyzePromptOnly(
        parsed.data.appPrompt,
        parsed.data.estimatedUsers,
        parsed.data.targetMargin,
        parsed.data.devHours,
        parsed.data.vatRate,
        parsed.data.amortizationMonths
      );
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  const marketingEvalSchema = z.object({
    channels: z.array(z.object({
      platform: z.string().min(1),
      followers: z.number().int().min(0),
      engagementRate: z.number().min(0).max(1).optional(),
    })),
    monthlyAdBudget: z.number().min(0).default(0),
    adTypes: z.array(z.string()).default([]),
    estimatedUsers: z.number().int().min(1).default(100),
    recommendedPrice: z.number().min(0).default(5),
  });

  app.post("/api/pricing-engine/evaluate-marketing", async (req, res) => {
    try {
      const parsed = marketingEvalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
      const result = pricingEngineService.evaluateMarketing(
        { channels: parsed.data.channels, monthlyAdBudget: parsed.data.monthlyAdBudget, adTypes: parsed.data.adTypes },
        parsed.data.estimatedUsers,
        parsed.data.recommendedPrice
      );
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  const EXTERNAL_DISTRIBUTION_DISCLAIMER = `EXTERNAL DISTRIBUTION RESPONSIBILITY ACKNOWLEDGMENT

By exporting this application from Mougle, I ("Creator") acknowledge and agree:

1. INFRASTRUCTURE PROVIDER ONLY: Mougle acts solely as an infrastructure and development platform. Mougle has no responsibility for the distribution, marketing, or operation of exported applications outside the platform.

2. CREATOR RESPONSIBILITY: I am solely responsible for:
   - Publishing and distributing the exported app on any external platform (Google Play, Apple App Store, web hosting, etc.)
   - Compliance with all applicable store policies, guidelines, and fee structures
   - Paying any store commissions, developer account fees, or distribution costs
   - Ensuring the app meets all legal, regulatory, and content requirements of the target platform
   - Providing end-user support and handling user data in compliance with applicable privacy laws

3. NO LIABILITY: Mougle shall not be liable for any issues arising from external distribution, including but not limited to: app rejection, store policy violations, user complaints, data breaches, or revenue disputes.

4. INDEMNIFICATION: I agree to indemnify and hold Mougle harmless from any claims, damages, or losses arising from my distribution and operation of the exported application.

5. NO GUARANTEES: Mougle makes no guarantees about the exported app's compatibility, performance, or acceptance on any external platform.`;

  const exportConfirmSchema = z.object({
    appName: z.string().min(1),
    analysisId: z.string().optional(),
    distributionAcknowledged: z.literal(true, { errorMap: () => ({ message: "You must acknowledge the external distribution responsibility" }) }),
    legalDisclaimerAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the legal disclaimer" }) }),
  });

  app.get("/api/app-export/disclaimer", async (_req, res) => {
    res.json({ disclaimer: EXTERNAL_DISTRIBUTION_DISCLAIMER });
  });

  app.post("/api/app-export/confirm", requireSystemMode("publishing"), resolveUser, async (req: any, res) => {
    try {
      const parsed = exportConfirmSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

      const [exported] = await db.insert(appExports_table).values({
        creatorId: req.user.id,
        appName: parsed.data.appName,
        analysisId: parsed.data.analysisId || null,
        exportType: "web_package",
        distributionAcknowledged: true,
        legalDisclaimerAccepted: true,
        acknowledgmentText: EXTERNAL_DISTRIBUTION_DISCLAIMER,
        status: "confirmed",
      }).returning();

      res.json({
        exportId: exported.id,
        status: "confirmed",
        message: "Distribution responsibility acknowledged. You may now generate your export package.",
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/app-export/generate", async (req, res) => {
    try {
      const { exportId } = z.object({ exportId: z.string().min(1) }).parse(req.body);

      const [record] = await db.select().from(appExports_table).where(eq(appExports_table.id, exportId));
      if (!record) return res.status(404).json({ error: "Export record not found" });
      if (!record.distributionAcknowledged || !record.legalDisclaimerAccepted) {
        return res.status(403).json({ error: "Creator must acknowledge distribution responsibility before exporting" });
      }

      await db.update(appExports_table)
        .set({ status: "exported", exportedAt: new Date() })
        .where(eq(appExports_table.id, exportId));

      res.json({
        exportId: record.id,
        appName: record.appName,
        status: "exported",
        package: {
          type: "web_package",
          includes: ["source_code", "build_config", "deployment_guide", "environment_template"],
          deploymentOptions: [
            { platform: "Vercel", guide: "Deploy via Vercel CLI or Git integration" },
            { platform: "Netlify", guide: "Deploy via Netlify CLI or drag-and-drop" },
            { platform: "AWS", guide: "Deploy using S3 + CloudFront or Elastic Beanstalk" },
            { platform: "Self-hosted", guide: "Use Docker or PM2 on any Linux server" },
          ],
          note: "External store fees (Google Play, Apple App Store) are your responsibility. Mougle does not calculate or include third-party distribution costs.",
        },
        legalNotice: "By downloading this package, you confirm that external distribution is entirely your responsibility. Mougle acts as infrastructure provider only.",
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/app-export/history/:creatorId", async (req, res) => {
    try {
      const exports = await db.select().from(appExports_table)
        .where(eq(appExports_table.creatorId, req.params.creatorId))
        .orderBy(desc(appExports_table.createdAt));
      res.json(exports);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/ai-cfo/founder-dashboard", async (_req, res) => {
    try {
      const dashboard = await aiCfoService.getFounderDashboard();
      res.json(dashboard);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/ai-cfo/creator-dashboard/:creatorId", async (req, res) => {
    try {
      const dashboard = await aiCfoService.getCreatorDashboard(req.params.creatorId);
      res.json(dashboard);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/ai-cfo/recommendations", async (_req, res) => {
    try {
      const recommendations = await aiCfoService.generateRecommendations();
      res.json(recommendations);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/ai-cfo/forecasts", async (_req, res) => {
    try {
      const forecasts = await aiCfoService.generateForecasts();
      res.json(forecasts);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/ai-cfo/alerts", async (_req, res) => {
    try {
      const alerts = await aiCfoService.generateAlerts();
      res.json(alerts);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/user-agents/:id/use", requireAuth, async (req, res) => {
    try {
      const { actionType, creditsSpent } = req.body;
      if (!actionType) return res.status(400).json({ error: "actionType required" });
      const agent = await storage.getUserAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      if (agent.type === "personal" && agent.ownerId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const userId = req.user.id;
      const log = await storage.createAgentUsageLog({
        agentId: req.params.id, userId, actionType, creditsSpent: creditsSpent || 0,
      });
      await storage.updateUserAgent(req.params.id, {
        totalUsageCount: (agent.totalUsageCount || 0) + 1,
      });
      res.json(log);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/user-agents/:id/usage", requireAuth, async (req, res) => {
    try {
      const agent = await storage.getUserAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      if (agent.ownerId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(await storage.getAgentUsageLogs(req.params.id, limit));
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AGENT APP STORE ROUTES ----

  const { agentRunnerService } = await import("./services/agent-runner-service");

  app.get("/api/store/rankings", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const listings = await marketplaceReviewTrustService.listPublicListings({ limit, sort: "trust" });
      res.json(listings);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/store/featured", async (req, res) => {
    try {
      const listings = await marketplaceReviewTrustService.listPublicListings({ featuredOnly: true, limit: 20, sort: "trust" });
      res.json(listings);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/store/trending", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const listings = await marketplaceReviewTrustService.listPublicListings({ limit, sort: "sandbox" });
      res.json(listings);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/store/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const category = req.query.category as string | undefined;
      if (!query) return res.json([]);
      const listings = await marketplaceReviewTrustService.listPublicListings({ query, category, limit: 50, sort: "trust" });
      res.json(listings);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AGENT REVIEWS ----

  app.get("/api/store/reviews/:listingId", async (req, res) => {
    try {
      const reviews = await marketplaceReviewTrustService.listPublicReviews(req.params.listingId);
      res.json(reviews);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/store/reviews", requireAuth, async (req, res) => {
    try {
      const parsed = marketplaceReviewSubmitSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid review" });
      const result = await marketplaceReviewTrustService.createReview(req.user.id, parsed.data);
      res.status(201).json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AGENT VERSIONS ----

  app.get("/api/user-agents/:id/versions", async (req, res) => {
    try {
      res.json(await storage.getAgentVersions(req.params.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/user-agents/:id/versions", async (req, res) => {
    try {
      const agent = await storage.getUserAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      const { version, changelog, publisherId } = req.body;
      if (!version || !publisherId) return res.status(400).json({ error: "version and publisherId required" });
      if (agent.ownerId !== publisherId) return res.status(403).json({ error: "Not authorized" });
      const agentVersion = await storage.createAgentVersion({
        agentId: req.params.id,
        version,
        changelog,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        temperature: agent.temperature,
        skills: agent.skills,
        publishedBy: publisherId,
      });
      await storage.updateUserAgent(req.params.id, { version, changelog });
      res.json(agentVersion);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AGENT RUNNER (Cost-Controlled AI Execution) ----

  app.post("/api/agent-runner/run", requireAuth, async (req, res) => {
    try {
      const { agentId, message } = req.body;
      const callerId = req.session.userId;
      if (!agentId || !message || !callerId) return res.status(400).json({ error: "agentId and message required" });
      const result = await agentRunnerService.runAgent(agentId, message, callerId);
      res.json(result);
    } catch (err: any) {
      if (err.message?.includes("Insufficient credits") || err.message?.includes("paused")) {
        return res.status(402).json({ error: err.message });
      }
      handleServiceError(res, err);
    }
  });

  app.post("/api/agent-runner/demo", requireAuth, async (req, res) => {
    try {
      const { agentId, message } = req.body;
      if (!agentId || !message) return res.status(400).json({ error: "agentId and message required" });
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Agent demo", `agent-demo:${agentId}`);
      if (!paid) return;
      const result = await agentRunnerService.runDemoInteraction(agentId, message);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/agent-runner/estimate", async (req, res) => {
    try {
      const model = (req.query.model as string) || "gpt-5.5";
      const actionType = (req.query.action as string) || "chat";
      res.json({ credits: agentRunnerService.estimateCost(model, actionType), model, actionType });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agent-runner/estimate-training", async (req, res) => {
    try {
      const { sourceCount, totalChars } = req.body;
      res.json(agentRunnerService.estimateTrainingCost(sourceCount || 1, totalChars || 1000));
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- COST CONTROL & CREATOR ANALYTICS ----

  app.get("/api/agent-costs/:ownerId", requireAuth, async (req, res) => {
    try {
      if (req.params.ownerId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getAgentCostLogs(req.params.ownerId, limit);
      const totalSpent = logs.reduce((sum, l) => sum + l.creditsCharged, 0);
      const byModel: Record<string, number> = {};
      const byAction: Record<string, number> = {};
      logs.forEach(l => {
        byModel[l.model || "unknown"] = (byModel[l.model || "unknown"] || 0) + l.creditsCharged;
        byAction[l.actionType] = (byAction[l.actionType] || 0) + l.creditsCharged;
      });
      res.json({ totalSpent, byModel, byAction, logs });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/creator-analytics/:userId", requireAuth, async (req, res) => {
    try {
      const userId = req.params.userId;
      if (userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const agents = await storage.getUserAgentsByOwner(userId);
      const sales = await storage.getAgentPurchasesBySeller(userId);
      const costLogs = await storage.getAgentCostLogs(userId, 200);

      const totalAgents = agents.length;
      const activeAgents = agents.filter(a => a.status === "active").length;
      const pausedAgents = agents.filter(a => a.status === "paused").length;
      const totalUsage = agents.reduce((sum, a) => sum + a.totalUsageCount, 0);
      const totalEarnings = sales.reduce((sum, s) => sum + s.sellerEarnings, 0);
      const totalCosts = costLogs.reduce((sum, l) => sum + l.creditsCharged, 0);
      const netRevenue = totalEarnings - totalCosts;
      const avgRating = agents.length > 0
        ? agents.reduce((sum, a) => sum + a.rating, 0) / agents.filter(a => a.ratingCount > 0).length || 0
        : 0;
      const totalReviews = agents.reduce((sum, a) => sum + a.ratingCount, 0);
      const totalSales = sales.length;

      const agentStats = agents.map(a => ({
        id: a.id,
        name: a.name,
        status: a.status,
        usage: a.totalUsageCount,
        earned: a.totalCreditsEarned,
        rating: a.rating,
        reviews: a.ratingCount,
        trustScore: a.trustScore,
        version: a.version,
      }));

      const recentSales = sales.slice(0, 20).map(s => ({
        id: s.id,
        creditsPaid: s.creditsPaid,
        sellerEarnings: s.sellerEarnings,
        platformFee: s.platformFee,
        createdAt: s.createdAt,
      }));

      res.json({
        totalAgents, activeAgents, pausedAgents,
        totalUsage, totalEarnings, totalCosts, netRevenue,
        avgRating, totalReviews, totalSales,
        agentStats, recentSales,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- TRAINING WITH COST CONTROL ----

  app.post("/api/agent-runner/train", requireAuth, async (req, res) => {
    try {
      const { agentId, sources } = req.body;
      const ownerId = req.session.userId;
      if (!agentId || !ownerId || !sources?.length) {
        return res.status(400).json({ error: "agentId and sources required" });
      }
      const result = await agentRunnerService.trainAgent(agentId, ownerId, sources);
      res.json(result);
    } catch (err: any) {
      if (err.message?.includes("Insufficient credits") || err.message?.includes("Pro subscription")) {
        return res.status(402).json({ error: err.message });
      }
      handleServiceError(res, err);
    }
  });

  // ---- WALLET STATUS & AUTO-PAUSE ----

  app.get("/api/wallet-status/:userId", requireAuth, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      res.json(await agentRunnerService.getWalletStatus(req.user.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agent-runner/resume", requireAuth, async (req, res) => {
    try {
      const ownerId = req.session.userId;
      if (!ownerId) return res.status(400).json({ error: "ownerId required" });
      const result = await agentRunnerService.resumeAgents(ownerId);
      res.json(result);
    } catch (err: any) {
      if (err.message?.includes("zero credits")) {
        return res.status(402).json({ error: err.message });
      }
      handleServiceError(res, err);
    }
  });

  // ---- BYOAI (Bring Your Own AI) ----

  app.post("/api/byoai/set", async (req, res) => {
    try {
      const { userId, provider, apiKey } = req.body;
      if (!userId || !provider || !apiKey) return res.status(400).json({ error: "userId, provider, and apiKey required" });
      const result = await agentRunnerService.setByoaiKey(userId, provider, apiKey);
      res.json(result);
    } catch (err: any) {
      if (err.message?.includes("validation failed")) {
        return res.status(400).json({ error: err.message });
      }
      handleServiceError(res, err);
    }
  });

  app.post("/api/byoai/remove", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      res.json(await agentRunnerService.removeByoaiKey(userId));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/byoai/status/:userId", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        enabled: !!(user.byoaiProvider && user.byoaiApiKey),
        provider: user.byoaiProvider || null,
        hasKey: !!user.byoaiApiKey,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- FOUNDER AI COST CONTROL ANALYTICS ----

  app.get("/api/admin/agent-cost-analytics", requireAnyAdminPermission(AI_OPS_VIEW_PERMISSIONS), async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      res.json(await agentRunnerService.getPlatformCostAnalytics());
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- INDUSTRY SPECIALIZATION SYSTEM ----

  seedIndustryData().catch(console.error);

  app.get("/api/industries", async (_req, res) => {
    try {
      const rows = await db.select().from(industries).orderBy(industries.sortOrder);
      res.json(rows);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/industries/:slug/categories", async (req, res) => {
    try {
      const rows = await db.select().from(industryCategories).where(eq(industryCategories.industrySlug, req.params.slug)).orderBy(industryCategories.sortOrder);
      res.json(rows);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/industries/:slug/roles", async (req, res) => {
    try {
      const { category } = req.query;
      let query = db.select().from(agentRolesTable).where(eq(agentRolesTable.industrySlug, req.params.slug)).orderBy(agentRolesTable.sortOrder);
      const rows = await query;
      const filtered = category ? rows.filter(r => r.categorySlug === category) : rows;
      res.json(filtered);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/industries/:slug/knowledge-packs", async (req, res) => {
    try {
      const rows = await db.select().from(knowledgePacks).where(eq(knowledgePacks.industrySlug, req.params.slug));
      res.json(rows);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/industries/:slug/skill-tree", async (req, res) => {
    try {
      const rows = await db.select().from(agentSkillNodes).where(eq(agentSkillNodes.industrySlug, req.params.slug)).orderBy(agentSkillNodes.treeTier, agentSkillNodes.sortOrder);
      res.json(rows);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/knowledge-packs", async (_req, res) => {
    try {
      const rows = await db.select().from(knowledgePacks);
      res.json(rows);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AGENT SKILL TREE & PROGRESSION ----

  app.get("/api/agents/:agentId/progression", async (req, res) => {
    try {
      const result = await agentProgressionService.getAgentProgression(req.params.agentId);
      if (!result) return res.status(404).json({ error: "Agent not found" });
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agents/:agentId/unlock-skill", async (req, res) => {
    try {
      const { skillSlug } = req.body;
      if (!skillSlug) return res.status(400).json({ error: "skillSlug required" });
      const result = await agentProgressionService.unlockSkill(req.params.agentId, skillSlug);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json({ success: true, message: `Skill "${skillSlug}" unlocked!` });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agents/:agentId/award-xp", async (req, res) => {
    try {
      const { source, contentLength, metadata } = req.body;
      if (!source) return res.status(400).json({ error: "source required" });
      const result = await agentProgressionService.awardXp(req.params.agentId, source, metadata, contentLength);
      if (!result) return res.json({ awarded: false, reason: "Cooldown or quality check failed" });
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/agents/:agentId/certifications", async (req, res) => {
    try {
      const certs = await db.select().from(agentCertifications).where(eq(agentCertifications.agentId, req.params.agentId));
      res.json(certs);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agents/:agentId/check-certifications", async (req, res) => {
    try {
      const granted = await agentProgressionService.checkAndGrantCertifications(req.params.agentId);
      res.json({ granted });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/agents/:agentId/skill-effects", async (req, res) => {
    try {
      const effects = await agentProgressionService.getSkillEffects(req.params.agentId);
      res.json(effects);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/xp-sources", async (_req, res) => {
    res.json(agentProgressionService.XP_SOURCES);
  });

  // ---- AGENT SPECIALIZATION CRUD ----

  app.post("/api/agents/:agentId/specialization", async (req, res) => {
    try {
      const { industrySlug, categorySlug, roleSlug, knowledgePackIds, customSkills, behaviorProfile } = req.body;
      if (!industrySlug) return res.status(400).json({ error: "industrySlug required" });

      const ind = await db.select().from(industries).where(eq(industries.slug, industrySlug)).limit(1);
      const disclaimer = ind[0]?.regulated ? ind[0].disclaimer : null;

      let industrySystemPrompt = "";
      if (roleSlug) {
        const [role] = await db.select().from(agentRolesTable).where(eq(agentRolesTable.slug, roleSlug));
        if (role?.systemPromptTemplate) industrySystemPrompt = role.systemPromptTemplate;
      }

      const existing = await db.select().from(agentSpecializations).where(eq(agentSpecializations.agentId, req.params.agentId));
      if (existing.length > 0) {
        await db.update(agentSpecializations)
          .set({ industrySlug, categorySlug, roleSlug, knowledgePackIds, customSkills, behaviorProfile, complianceDisclaimer: disclaimer, industrySystemPrompt })
          .where(eq(agentSpecializations.agentId, req.params.agentId));
      } else {
        await db.insert(agentSpecializations).values({
          agentId: req.params.agentId, industrySlug, categorySlug, roleSlug,
          knowledgePackIds, customSkills, behaviorProfile,
          complianceDisclaimer: disclaimer, industrySystemPrompt,
        });
      }

      await db.update(userAgents_table)
        .set({ industrySlug, categorySlug, roleSlug, updatedAt: new Date() })
        .where(eq(userAgents_table.id, req.params.agentId));

      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/agents/:agentId/specialization", async (req, res) => {
    try {
      const [spec] = await db.select().from(agentSpecializations).where(eq(agentSpecializations.agentId, req.params.agentId));
      res.json(spec || null);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AGENT TRUST GRAPH SYSTEM ----

  app.get("/api/agents/:agentId/trust", async (req, res) => {
    try {
      const breakdown = await agentTrustEngine.getTrustBreakdown(req.params.agentId);
      res.json(breakdown);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agents/:agentId/trust/event", async (req, res) => {
    try {
      const { eventType, sourceId, sourceUserId, metadata } = req.body;
      if (!eventType) return res.status(400).json({ error: "eventType required" });
      const event = await agentTrustEngine.recordEvent(req.params.agentId, eventType, sourceId, sourceUserId, metadata);
      res.json(event || { recorded: false, reason: "Unknown event type" });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/agents/:agentId/trust/recalculate", async (req, res) => {
    try {
      const scores = await agentTrustEngine.recalculateScores(req.params.agentId);
      res.json(scores);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/agents/:agentId/trust/history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 30;
      const history = await db.select().from(agentTrustHistory)
        .where(eq(agentTrustHistory.agentId, req.params.agentId))
        .orderBy(desc(agentTrustHistory.snapshotAt))
        .limit(limit);
      res.json(history);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/trust/event-types", async (_req, res) => {
    res.json(agentTrustEngine.getEventTypes());
  });

  app.get("/api/trust/tiers", async (_req, res) => {
    res.json(agentTrustEngine.getTrustTiers());
  });

  // ---- ADMIN TRUST NETWORK ANALYTICS ----

  app.get("/api/admin/trust/network", requireAnyAdminPermission(AI_OPS_VIEW_PERMISSIONS), async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const analytics = await agentTrustEngine.getNetworkAnalytics();
      res.json(analytics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/trust/recalculate-all", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const result = await agentTrustEngine.recalculateAll();
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/trust/unsuspend/:agentId", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      await agentTrustEngine.unsuspendAgent(req.params.agentId);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AI GATEWAY COST MONITOR (FOUNDER ONLY) ----

  app.get("/api/admin/ai-gateway/metrics", requireAnyAdminPermission(AI_OPS_VIEW_PERMISSIONS), async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const metrics = aiGateway.getGatewayMetrics();
      const platformAnalytics = await agentRunnerService.getPlatformCostAnalytics();
      res.json({
        gateway: metrics,
        platform: platformAnalytics,
        safetyStatus: {
          zeroPlatformCost: true,
          allRequestsGated: true,
          rateLimitsActive: true,
          loopPreventionActive: true,
          debateGovernorActive: true,
          autoSummarizationActive: true,
          trainingLimitsActive: true,
          autoPauseActive: true,
        },
      });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/ai-gateway/reset-metrics", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      aiGateway.resetMetrics();
      res.json({ message: "Metrics reset" });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/ai-gateway/estimate", async (req, res) => {
    try {
      const model = (req.query.model as string) || "gpt-5.5";
      const actionType = (req.query.actionType as string) || "chat";
      res.json({ credits: aiGateway.estimateCost(model, actionType), model, actionType });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/ai-gateway/limits", async (_req, res) => {
    try {
      res.json({
        rateLimits: aiGateway.RATE_LIMITS,
        loopLimits: aiGateway.LOOP_LIMITS,
        debateLimits: aiGateway.DEBATE_LIMITS,
        trainingLimits: aiGateway.TRAINING_LIMITS,
        costPerModel: aiGateway.COST_PER_MODEL,
        actionCosts: aiGateway.ACTION_COSTS,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- CIVILIZATION STABILITY LAYER ----

  app.get("/api/admin/civilization/stability", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const dashboard = await civilizationStabilityService.getStabilityDashboard();
      res.json(dashboard);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/civilization/stability/recompute", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const result = await civilizationStabilityService.runFullStabilityCheck();
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/civilization/policies", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const rules = await storage.getPolicyRules();
      res.json(rules);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/civilization/policies", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const { name, description, scope, conditionJson, actionJson, severity } = req.body;
      if (!name || !conditionJson || !actionJson) return res.status(400).json({ error: "Missing required fields" });
      const rule = await storage.createPolicyRule({ name, description, scope: scope || "agent", conditionJson, actionJson, severity: severity || 1 });
      res.json(rule);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/civilization/policies/:id/toggle", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const rules = await storage.getPolicyRules();
      const rule = rules.find(r => r.id === req.params.id);
      if (!rule) return res.status(404).json({ error: "Rule not found" });
      const updated = await storage.updatePolicyRule(rule.id, { isActive: !rule.isActive });
      res.json(updated);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/civilization/violations", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const violations = await storage.getPolicyViolations(100);
      res.json(violations);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/civilization/health/history", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const history = await storage.getHealthSnapshots(50);
      res.json(history);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AUTONOMOUS PLATFORM FLYWHEEL ----

  app.get("/api/admin/flywheel/overview", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const overview = await platformFlywheelService.getOverview();
      res.json(overview);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/flywheel/run", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const result = await platformFlywheelService.runAnalysisCycle();
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/flywheel/recommendations", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const status = req.query.status as string | undefined;
      const recs = await storage.getFlywheelRecommendations(status);
      res.json(recs);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/flywheel/recommendations/:id/apply", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const outcome = await platformFlywheelService.applyRecommendation(req.params.id, req.body.notes);
      if (!outcome) return res.status(404).json({ error: "Recommendation not found" });
      res.json(outcome);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/flywheel/recommendations/:id/dismiss", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const result = await platformFlywheelService.dismissRecommendation(req.params.id, req.body.reason);
      if (!result) return res.status(404).json({ error: "Recommendation not found" });
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/flywheel/outcomes", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const outcomes = await storage.getFlywheelOutcomes(50);
      res.json(outcomes);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/flywheel/config", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const config = await storage.getFlywheelAutomationConfig();
      res.json(config || { mode: "manual", safeActions: [], thresholds: {} });
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/admin/flywheel/config", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const { mode } = req.body;
      if (mode) {
        const config = await platformFlywheelService.updateMode(mode);
        return res.json(config);
      }
      const config = await storage.upsertFlywheelAutomationConfig(req.body);
      res.json(config);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/flywheel/events", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const events = await storage.getPlatformEvents(100);
      res.json(events);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- AUTONOMOUS AGENT COLLABORATION (TEAMS) ----

  app.get("/api/teams", async (_req, res) => {
    try {
      const teams = await teamOrchestrationService.getTeamsOverview();
      res.json(teams);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/teams/analytics/overview", async (_req, res) => {
    try {
      const analytics = await teamOrchestrationService.getTeamAnalytics();
      res.json(analytics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/teams/create", async (req, res) => {
    try {
      const { taskDescription, taskType } = req.body;
      if (!taskDescription) return res.status(400).json({ error: "taskDescription required" });
      const team = await teamOrchestrationService.runFullCollaboration(taskDescription, taskType || "research");
      if (!team) return res.status(400).json({ error: "Could not form team - not enough agents or limit reached" });
      res.json(team);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/teams/:id", async (req, res) => {
    try {
      const details = await teamOrchestrationService.getTeamDetails(req.params.id);
      if (!details) return res.status(404).json({ error: "Team not found" });
      res.json(details);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/teams/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getTeamMessages(req.params.id);
      res.json(messages);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/teams/:id/workspace", async (req, res) => {
    try {
      const entries = await storage.getWorkspaceEntries(req.params.id);
      res.json(entries);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/teams/analytics", requireRootAdmin, async (req, res) => {
    try {
      if (!verifyAdminToken(req)) return res.status(401).json({ error: "Unauthorized" });
      const analytics = await teamOrchestrationService.getTeamAnalytics();
      const teams = await teamOrchestrationService.getTeamsOverview();
      res.json({ analytics, teams });
    } catch (err) { handleServiceError(res, err); }
  });

  // ============ Personal AI Agent Routes ============

  async function requireProUser(req: any, res: any): Promise<string | null> {
    const userId = req.session?.userId;
    if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
    const isPro = await personalAgentService.isProUser(userId);
    if (!isPro) { res.status(403).json({ error: "Pro subscription required to access Personal AI Agent" }); return null; }
    return userId;
  }

  app.get("/api/personal-agent/dashboard", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const dashboard = await personalAgentService.getDashboard(userId);
      res.json(dashboard);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/profile", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const profile = await personalAgentService.getOrCreateProfile(userId);
      res.json({ ...profile, encryptionKey: undefined });
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/personal-agent/profile", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const { agentName, voicePreference, preferences } = req.body;
      const updated = await storage.updatePersonalAgentProfile(userId, {
        ...(agentName && { agentName }),
        ...(voicePreference && { voicePreference }),
        ...(preferences && { preferences }),
      });
      res.json({ ...updated, encryptionKey: undefined });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/conversations", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const conversations = await personalAgentService.getConversations(userId);
      res.json(conversations);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/personal-agent/conversations", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const { title, domain } = req.body;
      const conversation = await personalAgentService.createConversation(userId, title, domain);
      res.json(conversation);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/personal-agent/conversations/:id", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      await storage.deletePersonalAgentConversation(req.params.id);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/conversations/:id/messages", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const messages = await personalAgentService.getMessages(req.params.id);
      res.json(messages);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/personal-agent/chat", requireSystemMode("ai"), async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Personal agent chat", "personal-agent-chat");
      if (!paid) return;
      const userId = paid.userId;
      const { conversationId, message } = req.body;
      if (!conversationId || !message) return res.status(400).json({ error: "conversationId and message required" });
      const result = await personalAgentService.chat(userId, conversationId, message);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/personal-agent/voice/tts", async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "premium_feature", "Personal agent voice (TTS)", "personal-agent-tts");
      if (!paid) return;
      const userId = paid.userId;
      const { text, voice } = req.body;
      if (!text) return res.status(400).json({ error: "text required" });
      const audioBuffer = await personalAgentService.textToSpeech(userId, text, voice);
      res.set({ "Content-Type": "audio/mpeg", "Content-Length": audioBuffer.length.toString() });
      res.send(audioBuffer);
    } catch (err) { handleServiceError(res, err); }
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  app.post("/api/personal-agent/voice/stt", upload.single("audio"), async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "premium_feature", "Personal agent voice (STT)", "personal-agent-stt");
      if (!paid) return;
      const userId = paid.userId;
      if (!req.file) return res.status(400).json({ error: "audio file required" });
      const text = await personalAgentService.speechToText(userId, req.file.buffer);
      res.json({ text });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/memories", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const domain = req.query.domain as string | undefined;
      const memories = await personalAgentService.getMemories(userId, domain);
      res.json(memories);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/personal-agent/memories", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const { domain, content, importance } = req.body;
      if (!domain || !content) return res.status(400).json({ error: "domain and content required" });
      const memory = await personalAgentService.addManualMemory(userId, domain, content, importance);
      res.json(memory);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/personal-agent/memories/:id/confirm", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const memory = await personalAgentService.confirmMemory(userId, req.params.id);
      res.json(memory);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/personal-agent/memories/:id", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      await personalAgentService.dismissMemory(req.params.id);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/tasks", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const status = req.query.status as string | undefined;
      const tasks = await personalAgentService.getTasks(userId, status);
      res.json(tasks);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/personal-agent/tasks", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const task = await personalAgentService.createTask(userId, req.body);
      res.json(task);
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/personal-agent/tasks/:id", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const task = await personalAgentService.updateTask(req.params.id, req.body);
      res.json(task);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/personal-agent/tasks/:id", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      await personalAgentService.deleteTask(req.params.id);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/tasks/reminders", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const reminders = await personalAgentService.getDueReminders(userId);
      res.json(reminders);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/devices", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const devices = await personalAgentService.getDevices(userId);
      res.json(devices);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/personal-agent/devices", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const device = await personalAgentService.addDevice(userId, req.body);
      res.json(device);
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/personal-agent/devices/:id", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const device = await personalAgentService.updateDevice(req.params.id, req.body);
      res.json(device);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/personal-agent/devices/:id/control", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const { command } = req.body;
      if (!command) return res.status(400).json({ error: "command required" });
      const result = await personalAgentService.controlDevice(userId, req.params.id, command);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/personal-agent/devices/:id", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      await personalAgentService.removeDevice(req.params.id);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/finance", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const entries = await personalAgentService.getFinanceEntries(userId);
      res.json(entries);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/personal-agent/finance", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const entry = await personalAgentService.addFinanceEntry(userId, req.body);
      res.json(entry);
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/personal-agent/finance/:id", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const entry = await personalAgentService.updateFinanceEntry(req.params.id, req.body);
      res.json(entry);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/personal-agent/finance/:id", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      await personalAgentService.deleteFinanceEntry(req.params.id);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/finance/reminders", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const reminders = await personalAgentService.getFinanceReminders(userId);
      res.json(reminders);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/truth-metrics", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const agentId = `personal-${userId}`;
      const metrics = await personalAgentService.getAgentTruthMetrics(agentId);
      const evolution = await truthEvolutionService.getEvolutionHistory(agentId, 20);
      res.json({ ...metrics, recentEvents: evolution });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/export", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const data = await personalAgentService.exportAllData(userId);
      res.json(data);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/personal-agent/data", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const result = await personalAgentService.deleteAllData(userId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/personal-agent/usage", async (req, res) => {
    try {
      const userId = await requireProUser(req, res);
      if (!userId) return;
      const limit = await personalAgentService.checkDailyLimit(userId, "message");
      const voiceLimit = await personalAgentService.checkDailyLimit(userId, "voice");
      res.json({ messages: limit, voice: voiceLimit });
    } catch (err) { handleServiceError(res, err); }
  });

  // ============ Privacy Framework Routes ============
  function getPrivacyUserId(req: any, res: any): string | null {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
    return userId;
  }

  app.get("/api/privacy/dashboard", requireAuth, async (req, res) => {
    try {
      const userId = getPrivacyUserId(req, res);
      if (!userId) return;
      const dashboard = await privacyGatewayService.getDashboard(userId);
      res.json(dashboard);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/privacy/vaults", requireAuth, async (req, res) => {
    try {
      const userId = getPrivacyUserId(req, res);
      if (!userId) return;
      const vaults = await privacyGatewayService.getVaultsByOwner(userId);
      res.json(vaults.map(v => ({ ...v, vaultKey: undefined })));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/privacy/vaults", requireAuth, async (req, res) => {
    try {
      const userId = getPrivacyUserId(req, res);
      if (!userId) return;
      const { agentId, privacyMode } = req.body;
      if (!agentId) return res.status(400).json({ error: "agentId required" });
      const vault = await privacyGatewayService.initializeVault(userId, agentId, privacyMode || "personal");
      res.json({ ...vault, vaultKey: undefined });
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/privacy/vaults/:id/mode", requireAuth, async (req, res) => {
    try {
      const userId = getPrivacyUserId(req, res);
      if (!userId) return;
      const { mode } = req.body;
      if (!mode) return res.status(400).json({ error: "mode required" });
      const vault = await privacyGatewayService.setPrivacyMode(req.params.id, userId, mode);
      res.json({ ...vault, vaultKey: undefined });
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/privacy/vaults/:id/restrictions", requireAuth, async (req, res) => {
    try {
      const userId = getPrivacyUserId(req, res);
      if (!userId) return;
      const vault = await privacyGatewayService.updateRestrictions(req.params.id, userId, req.body);
      res.json({ ...vault, vaultKey: undefined });
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/privacy/vaults/:id", requireAuth, async (req, res) => {
    try {
      const userId = getPrivacyUserId(req, res);
      if (!userId) return;
      const vault = await privacyGatewayService.getVault(req.params.id);
      if (!vault || vault.ownerId !== userId) return res.status(403).json({ error: "Not authorized" });
      await storage.deletePrivacyVault(req.params.id);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/privacy/validate-access", requireAuth, async (req, res) => {
    try {
      const userId = getPrivacyUserId(req, res);
      if (!userId) return;
      const { agentId, resourceType, action } = req.body;
      if (!agentId) return res.status(400).json({ error: "agentId required" });
      const result = await privacyGatewayService.validateAccess({
        agentId,
        requesterId: userId,
        requesterType: "user",
        resourceType: resourceType || "memory",
        action: action || "read",
      });
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/privacy/access-logs", requireAuth, async (req, res) => {
    try {
      const userId = getPrivacyUserId(req, res);
      if (!userId) return;
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await privacyGatewayService.getAccessLogs(userId, limit);
      res.json(logs);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/privacy/vaults/:id/access-logs", requireAuth, async (req, res) => {
    try {
      const userId = getPrivacyUserId(req, res);
      if (!userId) return;
      const vault = await privacyGatewayService.getVault(req.params.id);
      if (!vault || vault.ownerId !== userId) return res.status(403).json({ error: "Not authorized" });
      const logs = await privacyGatewayService.getVaultAccessLogs(req.params.id);
      res.json(logs);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/privacy/violations", requireAuth, async (req, res) => {
    try {
      const userId = getPrivacyUserId(req, res);
      if (!userId) return;
      const vaultId = req.query.vaultId as string | undefined;
      const violations = await privacyGatewayService.getViolations(vaultId);
      res.json(violations);
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/privacy/violations/:id/resolve", requireAuth, async (req, res) => {
    try {
      const userId = getPrivacyUserId(req, res);
      if (!userId) return;
      const { actionTaken } = req.body;
      const resolved = await privacyGatewayService.resolveViolation(req.params.id, actionTaken || "acknowledged");
      res.json(resolved);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/privacy/founder/monitoring", async (req, res) => {
    try {
      const monitoring = await privacyGatewayService.getFounderMonitoring();
      res.json(monitoring);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/privacy/gateway-rules", async (req, res) => {
    try {
      const rules = await storage.getPrivacyGatewayRules();
      res.json(rules);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/privacy/gateway-rules", async (req, res) => {
    try {
      const rule = await privacyGatewayService.addGatewayRule(req.body);
      res.json(rule);
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/privacy/gateway-rules/:id", async (req, res) => {
    try {
      const rule = await privacyGatewayService.updateGatewayRule(req.params.id, req.body);
      res.json(rule);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/privacy/gateway-rules/:id", async (req, res) => {
    try {
      await privacyGatewayService.deleteGatewayRule(req.params.id);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  // Trust Moat Framework
  app.get("/api/trust-moat/dashboard", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const dashboard = await trustMoatService.getUserDashboard(userId);
      res.json(dashboard);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/trust-moat/vault", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const vault = await trustMoatService.getOrCreateVault(userId);
      const { encryptionKeyHash, ...safe } = vault;
      res.json(safe);
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/trust-moat/vault/settings", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const vault = await trustMoatService.updateVaultSettings(userId, req.body);
      const { encryptionKeyHash, ...safe } = vault;
      res.json(safe);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/trust-moat/vault/lock", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const vault = await trustMoatService.lockVault(userId);
      const { encryptionKeyHash, ...safe } = vault;
      res.json(safe);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/trust-moat/vault/unlock", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const vault = await trustMoatService.unlockVault(userId);
      const { encryptionKeyHash, ...safe } = vault;
      res.json(safe);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/trust-moat/permissions", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const permissions = await trustMoatService.getPermissions(userId);
      res.json(permissions);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/trust-moat/permissions", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const token = await trustMoatService.grantPermission(userId, req.body);
      res.json(token);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/trust-moat/permissions/:id", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const revoked = await trustMoatService.revokePermission(userId, req.params.id);
      res.json(revoked);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/trust-moat/validate-access", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const { accessorId, accessorType, resourceAccessed, purpose } = req.body;
      const result = await trustMoatService.validateAndLogAccess(userId, accessorId, accessorType, { resourceAccessed, purpose });
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/trust-moat/access-log", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await trustMoatService.getAccessLog(userId, limit);
      res.json(logs);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/trust-moat/export", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const data = await trustMoatService.exportUserData(userId);
      res.json(data);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/trust-moat/data", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const result = await trustMoatService.deleteUserData(userId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/trust-moat/founder/health", async (req, res) => {
    try {
      const health = await trustMoatService.computeFounderTrustHealth();
      res.json(health);
    } catch (err) { handleServiceError(res, err); }
  });

  // Intelligence Roadmap
  app.get("/api/intelligence/stages", async (_req, res) => {
    try {
      res.json(intelligenceRoadmapService.getStages());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/intelligence/progress", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const progress = await intelligenceRoadmapService.getUserProgress(userId);
      res.json(progress);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/intelligence/xp-breakdown", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const days = parseInt(req.query.days as string) || 30;
      const breakdown = await intelligenceRoadmapService.getXpBreakdown(userId, days);
      res.json(breakdown);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/intelligence/features", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const flags = intelligenceRoadmapService.getFeatureFlags(user.intelligenceStage || "explorer");
      res.json({ stage: user.intelligenceStage, flags });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/intelligence/award-xp", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const { source, description } = req.body;
      if (!source || typeof source !== "string") return res.status(400).json({ message: "Valid source required" });
      const validSources = Object.keys(intelligenceRoadmapService.getXpSources());
      if (!validSources.includes(source)) return res.status(400).json({ message: `Invalid source. Must be one of: ${validSources.join(", ")}` });
      const result = await intelligenceRoadmapService.awardXp(userId, source, typeof description === "string" ? description : undefined);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/intelligence/leaderboard", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const leaderboard = await intelligenceRoadmapService.getLeaderboard(limit);
      res.json(leaderboard);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/intelligence/sources", async (_req, res) => {
    try {
      res.json(intelligenceRoadmapService.getXpSources());
    } catch (err) { handleServiceError(res, err); }
  });

  // Hybrid Intelligence Network
  app.get("/api/network/status", async (_req, res) => {
    try {
      const status = await hybridNetwork.getNetworkStatus();
      res.json(status);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/network/layers/:layer", async (req, res) => {
    try {
      const detail = await hybridNetwork.getLayerDetail(req.params.layer as any);
      res.json(detail);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/network/agents", async (_req, res) => {
    try {
      const registry = await hybridNetwork.getAgentRegistry();
      res.json(registry);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/network/executions", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const history = await hybridNetwork.getExecutionHistory(limit);
      res.json(history);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/network/execute", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const { agentId, message } = req.body;
      if (!agentId || !message) return res.status(400).json({ message: "agentId and message required" });
      const pipeline = await hybridNetwork.executeAgent(agentId, userId, message);
      res.json(pipeline);
    } catch (err) { handleServiceError(res, err); }
  });

  // User Psychology Progress System
  app.get("/api/psychology/stages", async (_req, res) => {
    try {
      res.json(userPsychologyService.getStages());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/psychology/indicators", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      const indicators = await userPsychologyService.getUserIndicators(userId);
      res.json(indicators);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/psychology/activity", requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
      await userPsychologyService.recordActivity(userId);
      res.json({ recorded: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/psychology/founder/analytics", async (req, res) => {
    try {
      const analytics = await userPsychologyService.getFounderAnalytics();
      res.json(analytics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/psychology/founder/snapshot", async (req, res) => {
    try {
      const snapshot = await userPsychologyService.takeSnapshot();
      res.json(snapshot);
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- PSYCHOLOGY-BASED MONETIZATION ----

  app.get("/api/monetization/tiers", async (_req, res) => {
    try { res.json(psychologyMonetizationService.getTierInfo()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/monetization/feature-gates", async (_req, res) => {
    try { res.json(psychologyMonetizationService.getFeatureGates()); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/monetization/gate-check", async (req, res) => {
    try {
      const { userId, feature } = req.body;
      if (!userId || !feature) return res.status(400).json({ error: "userId and feature required" });
      const result = await psychologyMonetizationService.checkFeatureGate(userId, feature);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/monetization/memory-check", async (req, res) => {
    try {
      const { userId, currentMemoryCount } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      const result = await psychologyMonetizationService.checkMemoryLimit(userId, currentMemoryCount || 0);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/monetization/log-event", async (req, res) => {
    try {
      const { userId, eventType, triggerType, psychologyStage, engagementScore, currentPlan, suggestedPlan, creditsCost, converted, metadata } = req.body;
      if (!userId || !eventType || !triggerType) return res.status(400).json({ error: "userId, eventType, and triggerType required" });
      await psychologyMonetizationService.logEvent(userId, eventType, triggerType, psychologyStage || "curious", engagementScore || 0, currentPlan || "free", suggestedPlan, creditsCost, converted, metadata);
      res.json({ logged: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/monetization/log-conversion", async (req, res) => {
    try {
      const { userId, triggerType, convertedPlan } = req.body;
      if (!userId || !triggerType || !convertedPlan) return res.status(400).json({ error: "userId, triggerType, and convertedPlan required" });
      await psychologyMonetizationService.logConversion(userId, triggerType, convertedPlan);
      res.json({ logged: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/monetization/analytics", async (_req, res) => {
    try { res.json(await psychologyMonetizationService.getConversionAnalytics()); } catch (err) { handleServiceError(res, err); }
  });

  // ---- RISK MANAGEMENT ----

  app.get("/api/risk/overview", requireAnyAdminPermission(RISK_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await riskManagementService.getRiskOverview()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/risk/audit-logs", requireAnyAdminPermission(RISK_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const { actorId, action, riskLevel, limit } = req.query as any;
      res.json(await riskManagementService.getAuditLogs({ actorId, action, riskLevel, limit: limit ? parseInt(limit) : 100 }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/risk/snapshots", requireAnyAdminPermission(RISK_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 30;
      res.json(await riskManagementService.getRiskSnapshots(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/risk/snapshot", requireAnyAdminPermission(RISK_MANAGE_PERMISSIONS), async (_req, res) => {
    try { await riskManagementService.createSnapshot(); res.json({ created: true }); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/risk/data-requests", requireAnyAdminPermission(RISK_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const { status, type, limit } = req.query as any;
      res.json(await riskManagementService.getDataRequests({ status, type, limit: limit ? parseInt(limit) : 50 }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/user-data/export", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      res.json(await riskManagementService.requestDataExport(userId));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/user-data/deletion", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      res.json(await riskManagementService.requestDataDeletion(userId));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/risk/process-export/:id", requireAnyAdminPermission(RISK_MANAGE_PERMISSIONS), async (req, res) => {
    try { res.json(await riskManagementService.processDataExport(req.params.id)); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/risk/process-deletion/:id", requireAnyAdminPermission(RISK_MANAGE_PERMISSIONS), async (req, res) => {
    try { await riskManagementService.processDataDeletion(req.params.id); res.json({ processed: true }); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/risk/dashboard", requireAnyAdminPermission(RISK_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await riskManagementService.getComprehensiveDashboard()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/risk/gateway-health", requireAnyAdminPermission(RISK_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await riskManagementService.getGatewayHealth()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/risk/memory-isolation", requireAnyAdminPermission(RISK_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await riskManagementService.getMemoryIsolationStatus()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/risk/trends", requireAnyAdminPermission(RISK_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 14;
      res.json(await riskManagementService.getRiskTrends(days));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/risk/mitigations", requireAnyAdminPermission(RISK_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(riskManagementService.getMitigationControls()); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/risk/mitigations/:id", requireAnyAdminPermission(RISK_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const { enabled, threshold } = req.body;
      res.json(riskManagementService.updateMitigationControl(req.params.id, { enabled, threshold }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/user-data/requests", requireAuth, async (req, res) => {
    try {
      res.json(await riskManagementService.getUserDataRequests(req.user.id));
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- TRUTH-ANCHORED EVOLUTION ----

  app.post("/api/truth/memories", requireAuth, async (req, res) => {
    try {
      const { agentId, content, truthType, confidenceScore, sources } = req.body;
      const userId = req.user.id;
      if (!agentId || !content) return res.status(400).json({ error: "agentId and content required" });
      res.json(await truthEvolutionService.createMemory({ agentId, userId, content, truthType, confidenceScore, sources }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/truth/memories/:agentId", async (req, res) => {
    try {
      const { truthType, minConfidence, limit } = req.query as any;
      const context = publicMemoryContextFromQuery(req.query.context);
      const result = await memoryAccessPolicyService.getPolicyCheckedTruthMemories({
        agentId: req.params.agentId,
        context,
        truthType,
        minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
        limit: limit ? parseInt(limit) : 50,
      });
      res.setHeader("X-Mougle-Memory-Policy", `filtered; denied=${result.deniedCount}`);
      res.json(result.records);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/truth/evidence", async (req, res) => {
    try {
      const { memoryId, source } = req.body;
      if (!memoryId || !source) return res.status(400).json({ error: "memoryId and source required" });
      await truthEvolutionService.addEvidence(memoryId, source);
      res.json({ updated: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/truth/contradiction", async (req, res) => {
    try {
      const { memoryId, content } = req.body;
      if (!memoryId || !content) return res.status(400).json({ error: "memoryId and content required" });
      await truthEvolutionService.recordContradiction(memoryId, content);
      res.json({ recorded: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/truth/validation", async (req, res) => {
    try {
      const { memoryId, validatorId } = req.body;
      if (!memoryId || !validatorId) return res.status(400).json({ error: "memoryId and validatorId required" });
      await truthEvolutionService.recordValidation(memoryId, validatorId);
      res.json({ validated: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/truth/correct", async (req, res) => {
    try {
      const { memoryId, correctedContent } = req.body;
      if (!memoryId || !correctedContent) return res.status(400).json({ error: "memoryId and correctedContent required" });
      await truthEvolutionService.correctFact(memoryId, correctedContent);
      res.json({ corrected: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/truth/evolution/:agentId", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      res.json(await truthEvolutionService.getEvolutionHistory(req.params.agentId, limit));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/truth/analytics", requireRootAdmin, async (_req, res) => {
    try { res.json(await truthEvolutionService.getFounderAnalytics()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/truth/alignment-history", requireRootAdmin, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 30;
      res.json(await truthEvolutionService.getAlignmentHistory(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- REALITY ALIGNMENT ----

  app.post("/api/reality/claims", async (req, res) => {
    try {
      const { content, sourcePostId, sourceCommentId, extractedBy, domain, tags } = req.body;
      if (!content || !extractedBy) return res.status(400).json({ error: "content and extractedBy required" });
      res.json(await realityAlignmentService.extractClaim({ content, sourcePostId, sourceCommentId, extractedBy, domain, tags }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/reality/claims", async (req, res) => {
    try {
      const { status, domain, limit } = req.query as any;
      res.json(await realityAlignmentService.getClaims({ status, domain, limit: limit ? parseInt(limit) : 50 }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/reality/claims/:id", async (req, res) => {
    try {
      const claim = await realityAlignmentService.getClaim(req.params.id);
      if (!claim) return res.status(404).json({ error: "Claim not found" });
      res.json(claim);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/reality/evidence", async (req, res) => {
    try {
      const { claimId, submittedBy, submitterType, evidenceType, content, sourceUrl, weight, trustScore } = req.body;
      if (!claimId || !submittedBy || !evidenceType || !content) return res.status(400).json({ error: "claimId, submittedBy, evidenceType, and content required" });
      res.json(await realityAlignmentService.addEvidence({ claimId, submittedBy, submitterType, evidenceType, content, sourceUrl, weight, trustScore }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/reality/analytics", requireRootAdmin, async (_req, res) => {
    try { res.json(await realityAlignmentService.getFounderAnalytics()); } catch (err) { handleServiceError(res, err); }
  });

  // ---- INTELLIGENCE STACK ----

  app.get("/api/intelligence-stack/layers", async (_req, res) => {
    try {
      res.json(intelligenceStackRegistry.getStackSummary());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/intelligence-stack/analytics", requireRootAdmin, async (_req, res) => {
    try {
      const analytics = await intelligenceStackAnalytics.getLayerAnalytics();
      res.json(analytics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/intelligence-stack/service-map", requireRootAdmin, async (_req, res) => {
    try {
      res.json({
        mappings: intelligenceStackRegistry.getAllServiceMappings(),
        violations: intelligenceStackRegistry.getViolations(),
      });
    } catch (err) { handleServiceError(res, err); }
  });

  // ---- LABS SYSTEM ----

  app.get("/api/labs/opportunities", async (req, res) => {
    try {
      const { industry, category, difficulty } = req.query;
      const opportunities = await labsService.getOpportunities({
        industry: industry as string,
        category: category as string,
        difficulty: difficulty as string,
      });
      res.json(opportunities);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/opportunities/:id", async (req, res) => {
    try {
      const opp = await labsService.getOpportunity(req.params.id);
      if (!opp) return res.status(404).json({ error: "Opportunity not found" });
      res.json(opp);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/opportunities/seed", async (_req, res) => {
    try {
      await labsService.seedIfEmpty();
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/opportunities/:id/build", async (req, res) => {
    try {
      const scaffold = await labsService.getScaffoldSpec(req.params.id);
      await labsService.incrementBuildCount(req.params.id);
      res.json(scaffold);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/meta", async (_req, res) => {
    res.json({ industries: labsService.getIndustries(), categories: labsService.getCategories() });
  });

  app.get("/api/labs/disclaimers/:industry", async (req, res) => {
    res.json({ disclaimers: labsService.getDisclaimers(req.params.industry) });
  });

  app.get("/api/labs/apps", async (req, res) => {
    try {
      const { category, pricingModel, industry } = req.query;
      const apps = await labsService.getPublishedApps({ category: category as string, pricingModel: pricingModel as string, industry: industry as string });
      res.json(apps);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/apps/:id", async (req, res) => {
    try {
      const app = await labsService.getApp(req.params.id);
      if (!app) return res.status(404).json({ error: "App not found" });
      res.json(app);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/apps", async (req, res) => {
    try {
      const app = await labsService.publishApp(req.body);
      res.json(app);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/apps/user/:userId", async (req, res) => {
    try {
      const apps = await labsService.getUserApps(req.params.userId);
      res.json(apps);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/apps/:id/install", async (req, res) => {
    try {
      const { userId } = req.body;
      const install = await labsService.installApp(userId, req.params.id);
      res.json(install);
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/labs/apps/:id/install", async (req, res) => {
    try {
      const { userId } = req.body;
      await labsService.uninstallApp(userId, req.params.id);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/installations/:userId", async (req, res) => {
    try {
      const installations = await labsService.getUserInstallations(req.params.userId);
      res.json(installations);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/favorites", async (req, res) => {
    try {
      const { userId, itemId, itemType } = req.body;
      const result = await labsService.toggleFavorite(userId, itemId, itemType);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/favorites/:userId", async (req, res) => {
    try {
      const favorites = await labsService.getUserFavorites(req.params.userId);
      res.json(favorites);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/reviews", async (req, res) => {
    try {
      const review = await labsService.addReview(req.body);
      res.json(review);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/reviews/:appId", async (req, res) => {
    try {
      const reviews = await labsService.getAppReviews(req.params.appId);
      res.json(reviews);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/flywheel/summary", async (_req, res) => {
    try {
      const summary = await labsFlywheelService.getFlywheelSummary();
      res.json(summary);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/flywheel/analytics", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const analytics = await labsFlywheelService.getAnalytics(days);
      res.json(analytics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/flywheel/growth-loop", async (_req, res) => {
    try {
      const metrics = await labsFlywheelService.getGrowthLoopMetrics();
      res.json(metrics);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/flywheel/generate", async (_req, res) => {
    try {
      const result = await labsFlywheelService.runDailyGeneration();
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/flywheel/snapshot", async (_req, res) => {
    try {
      const snapshot = await labsFlywheelService.snapshotAnalytics();
      res.json(snapshot);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/flywheel/rankings", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const rankings = await labsFlywheelService.getCreatorRankings(limit);
      res.json(rankings);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/flywheel/rankings/:creatorId", async (req, res) => {
    try {
      const ranking = await labsFlywheelService.getCreatorRanking(req.params.creatorId);
      res.json(ranking || null);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/flywheel/rankings/recalculate", async (_req, res) => {
    try {
      await labsFlywheelService.recalculateAllRankings();
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/flywheel/referral", async (req, res) => {
    try {
      const { appId, creatorId } = req.body;
      const referral = await labsFlywheelService.createReferral(appId, creatorId);
      res.json(referral);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/flywheel/referral/:code", async (req, res) => {
    try {
      const referral = await labsFlywheelService.getReferral(req.params.code);
      if (referral) {
        await labsFlywheelService.trackReferralClick(req.params.code);
      }
      res.json(referral || null);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/flywheel/referrals/:creatorId", async (req, res) => {
    try {
      const referrals = await labsFlywheelService.getCreatorReferrals(req.params.creatorId);
      res.json(referrals);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/flywheel/referral/:code/signup", async (req, res) => {
    try {
      await labsFlywheelService.trackReferralSignup(req.params.code);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/flywheel/landing-page", async (req, res) => {
    try {
      const { appId } = req.body;
      const page = await labsFlywheelService.generateLandingPage(appId);
      res.json(page);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/flywheel/landing-page/:slug", async (req, res) => {
    try {
      const page = await labsFlywheelService.getLandingPage(req.params.slug);
      res.json(page || null);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/labs/flywheel/landing-page/app/:appId", async (req, res) => {
    try {
      const page = await labsFlywheelService.getLandingPageByAppId(req.params.appId);
      res.json(page || null);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/labs/flywheel/landing-page/:slug/convert", async (req, res) => {
    try {
      await labsFlywheelService.trackConversion(req.params.slug);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/super-loop/summary", async (_req, res) => {
    try {
      const summary = await superLoopService.getSummary();
      res.json(summary);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/super-loop/health", async (_req, res) => {
    try {
      const health = await superLoopService.getHealth();
      res.json(health);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/super-loop/cycles", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const cycles = await superLoopService.getCycles(limit);
      res.json(cycles);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/super-loop/funnel", async (_req, res) => {
    try {
      const funnel = await superLoopService.getCycleFunnel();
      res.json(funnel);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/super-loop/revenue", async (_req, res) => {
    try {
      const revenue = await superLoopService.getRevenueAttribution();
      res.json(revenue);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/super-loop/timeline", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 14;
      const timeline = await superLoopService.getTimeline(days);
      res.json(timeline);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/super-loop/snapshot", async (_req, res) => {
    try {
      const snapshot = await superLoopService.captureSnapshot();
      res.json(snapshot);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/super-loop/trigger", async (_req, res) => {
    try {
      const result = await superLoopService.triggerLoopScan();
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  // ── Stability Triangle ──

  app.get("/api/stability-triangle/snapshot", requireRootAdmin, async (_req, res) => {
    try {
      res.json(stabilityTriangleService.getSnapshot());
    } catch (err) { handleServiceError(res, err); }
  });

  // ── Panic Button System ──

  app.get("/api/panic-button/status", requireRootAdmin, async (_req, res) => {
    try {
      res.json(panicButtonService.getStatus());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/panic-button/modes", requireRootAdmin, async (_req, res) => {
    try {
      res.json(panicButtonService.getAllModes());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/panic-button/set-mode", requireRootAdmin, async (req, res) => {
    try {
      const { mode } = z.object({ mode: z.enum(["NORMAL", "SAFE_MODE", "ECONOMY_PROTECTION", "EMERGENCY_FREEZE"]) }).parse(req.body);
      const result = await panicButtonService.setMode(mode, "admin");
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/panic-button/alerts", requireRootAdmin, async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const includeAcknowledged = req.query.all === "true";
      const alerts = await panicButtonService.getAlerts(limit, includeAcknowledged);
      res.json(alerts);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/panic-button/alerts/:id/acknowledge", requireRootAdmin, async (req, res) => {
    try {
      const alert = await panicButtonService.acknowledgeAlert(req.params.id, "admin");
      if (!alert) return res.status(404).json({ message: "Alert not found" });
      res.json(alert);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/panic-button/thresholds", requireRootAdmin, async (_req, res) => {
    try {
      res.json(panicButtonService.getThresholds());
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/panic-button/thresholds", requireRootAdmin, async (req, res) => {
    try {
      const updated = await panicButtonService.updateThresholds(req.body);
      res.json(updated);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/panic-button/check/:action", async (req, res) => {
    try {
      const actionType = req.params.action as "ai" | "agent" | "publishing";
      if (!["ai", "agent", "publishing"].includes(actionType)) {
        return res.status(400).json({ message: "Invalid action type" });
      }
      res.json(panicButtonService.checkAction(actionType));
    } catch (err) { handleServiceError(res, err); }
  });

  // ── Founder Debug Stack ──

  app.get("/api/founder-debug/snapshot", requireRootAdmin, async (_req, res) => {
    try {
      res.json(founderDebugService.getFullDebugSnapshot());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/founder-debug/ai-logs", requireRootAdmin, async (req, res) => {
    try {
      const since = req.query.since ? Number(req.query.since) : undefined;
      const model = req.query.model as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      res.json(founderDebugService.getAILogs({ since, model, limit }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/founder-debug/ai-stats", requireRootAdmin, async (_req, res) => {
    try {
      res.json(founderDebugService.getDailyAIStats());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/founder-debug/economics", requireRootAdmin, async (_req, res) => {
    try {
      res.json(founderDebugService.getEconomicSnapshot());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/founder-debug/journey", requireRootAdmin, async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const event = req.query.event as string | undefined;
      const since = req.query.since ? Number(req.query.since) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      res.json(founderDebugService.getJourneyEvents({ userId, event, since, limit }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/founder-debug/journey-summary", requireRootAdmin, async (_req, res) => {
    try {
      res.json(founderDebugService.getJourneySummary());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/founder-debug/config", requireRootAdmin, async (_req, res) => {
    try {
      res.json(founderDebugService.getConfig());
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/founder-debug/config", requireRootAdmin, async (req, res) => {
    try {
      const updated = founderDebugService.updateConfig(req.body);
      res.json(updated);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/founder-debug/ai-limits", requireRootAdmin, async (_req, res) => {
    try {
      res.json(founderDebugService.checkAILimits());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/founder-debug/log-ai-action", requireRootAdmin, async (req, res) => {
    try {
      founderDebugService.logAIAction(req.body);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/founder-debug/track-event", resolveUser, async (req: any, res) => {
    try {
      founderDebugService.trackJourneyEvent({
        ...req.body,
        userId: req.user.id,
        timestamp: Date.now(),
        traceId: req.traceId,
      });
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/gcis/dashboard", requireAnyAdminPermission(COMPLIANCE_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await gcisService.getDashboard()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/gcis/rules", requireAnyAdminPermission(COMPLIANCE_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const { status, countryCode, category } = req.query as any;
      res.json(await gcisService.getRules({ status, countryCode, category }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/gcis/scan", requireAnyAdminPermission(COMPLIANCE_MANAGE_PERMISSIONS), async (req, res) => {
    try { res.json(await gcisService.autoIngestFromScan(req.body.countryCode)); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/gcis/rules/ingest", requireAnyAdminPermission(COMPLIANCE_MANAGE_PERMISSIONS), async (req, res) => {
    try { res.json(await gcisService.ingestRule(req.body)); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/gcis/rules/:id/approve", requireAnyAdminPermission(COMPLIANCE_MANAGE_PERMISSIONS), async (req, res) => {
    try { res.json(await gcisService.approveRule(req.params.id, "admin")); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/gcis/rules/:id/reject", requireAnyAdminPermission(COMPLIANCE_MANAGE_PERMISSIONS), async (req, res) => {
    try { res.json(await gcisService.rejectRule(req.params.id, "admin", req.body.reason || "")); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/gcis/feature-flags", requireRootAdmin, async (req, res) => {
    try { res.json(await gcisService.getActiveFeatureFlags(req.query.countryCode as string)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/gcis/audit-log", requireAnyAdminPermission(COMPLIANCE_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await gcisService.getAuditLog(Number(req.query.limit) || 50)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/gcis/notifications", requireAnyAdminPermission(COMPLIANCE_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await gcisService.getNotifications(req.query.unreadOnly === "true")); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/gcis/notifications/:id/read", requireAnyAdminPermission(COMPLIANCE_VIEW_PERMISSIONS), async (req, res) => {
    try { await gcisService.markNotificationRead(req.params.id); res.json({ success: true }); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/gcis/eco-efficiency", requireAnyAdminPermission(COMPLIANCE_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await gcisService.getEcoEfficiency()); } catch (err) { handleServiceError(res, err); }
  });

  // ============ ADAPTIVE POLICY & CONTENT GOVERNANCE ============

  app.get("/api/admin/policy/dashboard", requireAnyAdminPermission(COMPLIANCE_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await adaptivePolicyService.getDashboard()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/policy/templates", requireAnyAdminPermission(COMPLIANCE_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await adaptivePolicyService.getTemplates(req.query.category as string)); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/policy/templates/init", requireRootAdmin, async (_req, res) => {
    try { await adaptivePolicyService.initializeTemplates(); res.json({ success: true }); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/policy/drafts", requireAnyAdminPermission(COMPLIANCE_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await adaptivePolicyService.getDrafts(req.query.status as string)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/policy/drafts/:id", requireAnyAdminPermission(COMPLIANCE_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const draft = await adaptivePolicyService.getDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Draft not found" });
      res.json(draft);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/policy/generate", requireAnyAdminPermission(COMPLIANCE_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin policy generate", "admin-policy-generate");
      if (!paid) return;
      const { templateId, triggerType, triggerDetails } = req.body;
      if (!templateId) return res.status(400).json({ error: "templateId is required" });
      const draft = await adaptivePolicyService.generateDraft(templateId, triggerType || "manual", triggerDetails);
      res.json(draft);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/policy/drafts/:id/approve", requireAnyAdminPermission(COMPLIANCE_MANAGE_PERMISSIONS), async (req, res) => {
    try { res.json(await adaptivePolicyService.approveDraft(req.params.id, "founder")); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/policy/drafts/:id/reject", requireAnyAdminPermission(COMPLIANCE_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const { reason } = req.body;
      await adaptivePolicyService.rejectDraft(req.params.id, reason || "Rejected", "founder");
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/policy/versions/:templateId", requireAnyAdminPermission(COMPLIANCE_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await adaptivePolicyService.getVersionHistory(req.params.templateId)); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/policy/rollback", requireRootAdmin, async (req, res) => {
    try {
      const { templateId, versionId } = req.body;
      if (!templateId || !versionId) return res.status(400).json({ error: "templateId and versionId are required" });
      res.json(await adaptivePolicyService.rollbackToVersion(templateId, versionId));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/policy/detect-updates", requireRootAdmin, async (_req, res) => {
    try { res.json(await adaptivePolicyService.detectAndTriggerUpdates()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/policy/:slug", async (req, res) => {
    try {
      const policy = await adaptivePolicyService.getPublicPolicy(req.params.slug);
      if (!policy) return res.status(404).json({ error: "Policy not found" });
      res.json(policy);
    } catch (err) { handleServiceError(res, err); }
  });

  // ============ SUPPORT TICKET SYSTEM ============
  const { supportTicketService } = await import("./services/support-ticket-service");
  const { zeroSupportLearningService } = await import("./services/zero-support-learning-service");
  const { emailService: emailSvc } = await import("./services/email-service");

  app.post("/api/support/tickets", resolveUser, async (req: any, res) => {
    try {
      const { subject, description, category, priority } = req.body;
      if (!subject || !description) return res.status(400).json({ error: "Subject and description required" });
      const ticket = await supportTicketService.createTicket({
        userId: req.user.id,
        userEmail: req.user.email,
        userName: req.user.username || req.user.displayName || "User",
        subject, description, category, priority,
      });
      res.json(ticket);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/support/tickets", resolveUser, async (req: any, res) => {
    try {
      const tickets = await supportTicketService.getTicketsByUser(req.user.id);
      res.json(tickets);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/support/tickets/:id", resolveUser, async (req: any, res) => {
    try {
      const ticket = await supportTicketService.getTicketById(req.params.id);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      if (ticket.userId !== req.user.id && req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      res.json(ticket);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/support/tickets/:id/messages", resolveUser, async (req: any, res) => {
    try {
      const ticket = await supportTicketService.getTicketById(req.params.id);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      if (ticket.userId !== req.user.id && req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const messages = await supportTicketService.getTicketMessages(req.params.id);
      res.json(messages);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/support/tickets/:id/messages", resolveUser, async (req: any, res) => {
    try {
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: "Content required" });
      const ticket = await supportTicketService.getTicketById(req.params.id);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      if (ticket.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const message = await supportTicketService.addMessage(req.params.id, {
        senderType: "user",
        senderName: req.user.username || "User",
        content,
      });
      res.json(message);
    } catch (err) { handleServiceError(res, err); }
  });

  // Admin ticket management
  app.get("/api/admin/support/tickets", requireAnyAdminPermission(SUPPORT_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const tickets = await supportTicketService.getAllTickets({ status: req.query.status as string });
      res.json(tickets);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/support/stats", requireAnyAdminPermission(SUPPORT_VIEW_PERMISSIONS), async (_req, res) => {
    try {
      res.json(await supportTicketService.getTicketStats());
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/support/tickets/:id", requireAnyAdminPermission(SUPPORT_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const ticket = await supportTicketService.getTicketById(req.params.id);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      res.json(ticket);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/support/tickets/:id/messages", requireAnyAdminPermission(SUPPORT_VIEW_PERMISSIONS), async (req, res) => {
    try {
      res.json(await supportTicketService.getTicketMessages(req.params.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/support/tickets/:id/reply", requireAnyAdminPermission(SUPPORT_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: "Content required" });
      const message = await supportTicketService.addMessage(req.params.id, {
        senderType: "admin",
        senderName: "Mougle Support",
        content,
      });
      res.json(message);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/support/tickets/:id/status", requireAnyAdminPermission(SUPPORT_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: "Status required" });
      const ticket = await supportTicketService.updateStatus(req.params.id, status);
      if (status === "RESOLVED" || status === "CLOSED") {
        zeroSupportLearningService.autoGenerateFromTicket(req.params.id).then(r => {
          if (r.article) console.log(`[ZeroSupport] Auto-generated KB article from ticket ${req.params.id}: ${r.article.title}`);
        }).catch(e => console.error("[ZeroSupport] Auto-extraction failed:", e));
      }
      res.json(ticket);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/support/tickets/:id/ai-reply", requireAnyAdminPermission(SUPPORT_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin support AI reply", `admin-support-reply:${req.params.id}`);
      if (!paid) return;
      const reply = await supportTicketService.generateAiReply(req.params.id);
      res.json({ reply });
    } catch (err) { handleServiceError(res, err); }
  });

  // Demo users and email test flow
  app.post("/api/admin/support/demo-seed", requireRootAdmin, async (_req, res) => {
    try {
      const demoUsers = [
        { userId: "demo-user-001", userEmail: "demo1@mougle.test", userName: "Alice Explorer", subject: "Cannot access AI agents", description: "I signed up for Pro plan but I still can't create AI agents. My dashboard shows the free plan features only.", category: "billing", priority: "high" },
        { userId: "demo-user-002", userEmail: "demo2@mougle.test", userName: "Bob Creator", subject: "Labs app publish error", description: "When I try to publish my app from Labs, I get a 500 error. I've tried clearing cache and restarting but the issue persists.", category: "technical", priority: "medium" },
        { userId: "demo-user-003", userEmail: "demo3@mougle.test", userName: "Carol Researcher", subject: "Feature request: Export debate transcripts", description: "It would be great if we could export debate transcripts as PDF or markdown. This would help for academic research purposes.", category: "feature_request", priority: "low" },
      ];
      const ticketResults = [];
      for (const u of demoUsers) {
        const ticket = await supportTicketService.createTicket(u);
        ticketResults.push({ ticketId: ticket.id, user: u.userName, subject: u.subject });
      }

      const emailResults: { template: string; status: string; messageId?: string }[] = [];
      const testEmail = "demo1@mougle.test";
      const testName = "Alice Explorer";
      const templates = [
        { name: "welcome", fn: () => emailSvc.sendWelcomeEmail(testEmail, testName) },
        { name: "verification", fn: () => emailSvc.sendVerificationEmail(testEmail, "123456", testName) },
        { name: "account_verified", fn: () => emailSvc.sendAccountVerifiedEmail(testEmail, testName) },
        { name: "purchase", fn: () => emailSvc.sendPurchaseConfirmation(testEmail, testName, { plan: "Pro", amount: "$19.99", transactionId: "TXN-DEMO-001", date: new Date().toLocaleDateString() }) },
        { name: "invoice", fn: () => emailSvc.sendInvoiceEmail(testEmail, testName, { invoiceId: "INV-DEMO-001", amount: "$19.99", period: "Jan 2026", items: [{ name: "Pro Plan", amount: "$19.99" }] }) },
        { name: "policy", fn: () => emailSvc.sendPolicyNotification(testEmail, testName, { title: "Privacy Policy", summary: "Updated data retention.", effectiveDate: "March 1, 2026" }) },
        { name: "admin_alert", fn: () => emailSvc.sendAdminAlert(testEmail, { title: "Test Alert", severity: "medium", message: "Demo alert." }) },
        { name: "password_reset", fn: () => emailSvc.sendPasswordResetEmail(testEmail, "demo-reset-token", testName) },
        { name: "ticket_reply", fn: () => emailSvc.sendSupportTicketReply(testEmail, testName, { ticketId: "DEMO", subject: "Test", replyContent: "Demo reply." }) },
        { name: "ticket_created", fn: () => emailSvc.sendTicketCreatedNotification(testEmail, testName, { ticketId: "DEMO", subject: "Test" }) },
      ];
      for (const t of templates) {
        try {
          const r = await t.fn();
          emailResults.push({ template: t.name, status: "sent", messageId: r?.data?.id });
        } catch (e: any) {
          emailResults.push({ template: t.name, status: `failed: ${e.message}` });
        }
      }

      res.json({
        success: true,
        tickets: ticketResults,
        emailTests: emailResults,
        message: "3 demo users with tickets created, all 10 email templates tested",
      });
    } catch (err) { handleServiceError(res, err); }
  });

  // ============ ZERO-SUPPORT LEARNING SYSTEM ============

  // KB-enhanced chat assistant (replaces basic chat)
  app.post("/api/support/chat", requireAuth, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Support chat", "support-chat");
      if (!paid) return;
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: "Message required" });
      const result = await zeroSupportLearningService.kbEnhancedChat(message);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  // Preventive help prompts
  app.post("/api/support/preventive-help", requireAuth, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Support preventive help", "support-preventive");
      if (!paid) return;
      const { context } = req.body;
      const prompts = await zeroSupportLearningService.getPreventiveHelp(context || "browsing support page");
      res.json({ prompts });
    } catch (err) { handleServiceError(res, err); }
  });

  // Public KB search
  app.get("/api/support/kb/search", async (req, res) => {
    try {
      const q = req.query.q as string;
      if (!q) return res.status(400).json({ error: "Query required" });
      const articles = await zeroSupportLearningService.searchKB(q);
      res.json(articles);
    } catch (err) { handleServiceError(res, err); }
  });

  // Public KB articles
  app.get("/api/support/kb/articles", async (_req, res) => {
    try {
      const articles = await zeroSupportLearningService.getAllArticles("published");
      res.json(articles);
    } catch (err) { handleServiceError(res, err); }
  });

  // Mark article helpful
  app.post("/api/support/kb/articles/:id/helpful", async (req, res) => {
    try {
      await zeroSupportLearningService.markHelpful(req.params.id);
      res.json({ success: true });
    } catch (err) { handleServiceError(res, err); }
  });

  // Auto-classify ticket on creation
  app.post("/api/support/classify", requireAuth, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Support classify", "support-classify");
      if (!paid) return;
      const { subject, description } = req.body;
      if (!subject || !description) return res.status(400).json({ error: "Subject and description required" });
      const classification = await zeroSupportLearningService.classifyTicket(subject, description);
      res.json(classification);
    } catch (err) { handleServiceError(res, err); }
  });

  // Admin KB management
  app.get("/api/admin/kb/stats", requireAnyAdminPermission(KNOWLEDGE_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await zeroSupportLearningService.getLearningStats()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/kb/articles", requireAnyAdminPermission(KNOWLEDGE_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await zeroSupportLearningService.getAllArticles(req.query.status as string)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/kb/articles/:id", requireAnyAdminPermission(KNOWLEDGE_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const a = await zeroSupportLearningService.getArticleById(req.params.id);
      if (!a) return res.status(404).json({ error: "Article not found" });
      res.json(a);
    } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/admin/kb/articles/:id", requireAnyAdminPermission(KNOWLEDGE_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const a = await zeroSupportLearningService.updateArticle(req.params.id, req.body);
      res.json(a);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/kb/articles/:id/approve", requireAnyAdminPermission(KNOWLEDGE_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const a = await zeroSupportLearningService.approveArticle(req.params.id, "admin");
      res.json(a);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/kb/articles/:id/reject", requireAnyAdminPermission(KNOWLEDGE_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const a = await zeroSupportLearningService.rejectArticle(req.params.id);
      res.json(a);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/kb/solutions", requireAnyAdminPermission(KNOWLEDGE_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await zeroSupportLearningService.getSolutions(req.query.ticketId as string)); } catch (err) { handleServiceError(res, err); }
  });

  // Extract solution from resolved ticket
  app.post("/api/admin/kb/extract/:ticketId", requireAnyAdminPermission(KNOWLEDGE_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin KB extract", `admin-kb-extract:${req.params.ticketId}`);
      if (!paid) return;
      const result = await zeroSupportLearningService.autoGenerateFromTicket(req.params.ticketId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  // Generate KB article from solutions
  app.post("/api/admin/kb/generate-article", requireAnyAdminPermission(KNOWLEDGE_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin KB generate", "admin-kb-generate");
      if (!paid) return;
      const { solutionIds } = req.body;
      if (!solutionIds?.length) return res.status(400).json({ error: "solutionIds required" });
      const article = await zeroSupportLearningService.generateKBArticle(solutionIds);
      res.json(article);
    } catch (err) { handleServiceError(res, err); }
  });

  // Email testing endpoint (admin only)
  app.post("/api/admin/email/test", requireRootAdmin, async (req, res) => {
    try {
      const { type, to, displayName } = req.body;
      if (!to || !displayName) return res.status(400).json({ error: "to and displayName required" });
      let result;
      switch (type) {
        case "welcome":
          result = await emailSvc.sendWelcomeEmail(to, displayName); break;
        case "verification":
          result = await emailSvc.sendVerificationEmail(to, "123456", displayName); break;
        case "account_verified":
          result = await emailSvc.sendAccountVerifiedEmail(to, displayName); break;
        case "purchase":
          result = await emailSvc.sendPurchaseConfirmation(to, displayName, {
            plan: "Pro", amount: "$19.99", transactionId: "TXN-DEMO-001", date: new Date().toLocaleDateString(),
          }); break;
        case "invoice":
          result = await emailSvc.sendInvoiceEmail(to, displayName, {
            invoiceId: "INV-DEMO-001", amount: "$19.99", period: "Jan 2026",
            items: [{ name: "Pro Plan (Monthly)", amount: "$19.99" }],
          }); break;
        case "policy":
          result = await emailSvc.sendPolicyNotification(to, displayName, {
            title: "Privacy Policy", summary: "Updated data retention and GDPR sections.", effectiveDate: "March 1, 2026",
          }); break;
        case "admin_alert":
          result = await emailSvc.sendAdminAlert(to, {
            title: "Test Alert", severity: "medium", message: "This is a test admin alert from Mougle.", actionUrl: "/admin/debug",
          }); break;
        case "password_reset":
          result = await emailSvc.sendPasswordResetEmail(to, "demo-reset-token-123", displayName); break;
        case "ticket_reply":
          result = await emailSvc.sendSupportTicketReply(to, displayName, {
            ticketId: "DEMO-001", subject: "Test Support Ticket", replyContent: "Thank you for reaching out. We've looked into your issue and it has been resolved.",
          }); break;
        case "ticket_created":
          result = await emailSvc.sendTicketCreatedNotification(to, displayName, {
            ticketId: "DEMO-001", subject: "Test Support Ticket",
          }); break;
        default:
          return res.status(400).json({ error: "Invalid type. Use: welcome, verification, account_verified, purchase, invoice, policy, admin_alert, password_reset, ticket_reply, ticket_created" });
      }
      res.json({ success: true, result });
    } catch (err) { handleServiceError(res, err); }
  });

  // ============ AUTONOMOUS OPERATIONS STACK ============
  const { autonomousOperationsService } = await import("./services/autonomous-operations-service");

  app.get("/api/admin/operations/snapshot", requireAnyAdminPermission(OPERATIONS_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await autonomousOperationsService.runAllEngines()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/operations/stats", requireAnyAdminPermission(OPERATIONS_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await autonomousOperationsService.getOpsStats()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/operations/actions", requireAnyAdminPermission(OPERATIONS_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await autonomousOperationsService.getRecentActions(req.query.engine as string)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/operations/pending", requireAnyAdminPermission(OPERATIONS_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await autonomousOperationsService.getPendingApprovals()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/operations/engine/:engine/history", requireAnyAdminPermission(OPERATIONS_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await autonomousOperationsService.getEngineHistory(req.params.engine)); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/operations/actions/:id/approve", requireAnyAdminPermission(OPERATIONS_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const action = await autonomousOperationsService.approveAction(req.params.id, "admin");
      res.json(action);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/operations/actions/:id/reject", requireAnyAdminPermission(OPERATIONS_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const action = await autonomousOperationsService.rejectAction(req.params.id);
      res.json(action);
    } catch (err) { handleServiceError(res, err); }
  });

  // ============ SOCIAL DISTRIBUTION HUB ============
  const { socialDistributionService } = await import("./services/social-distribution-service");

  app.get("/api/admin/sdh/analytics", requireAnyAdminPermission(MARKETING_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await socialDistributionService.getAnalytics()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/sdh/accounts", requireRootAdmin, async (_req, res) => {
    try { res.json(await socialDistributionService.getAccounts()); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/sdh/accounts", requireRootAdmin, async (req, res) => {
    try {
      const { platform, accountName, accountHandle, accessToken, refreshToken, apiKey, apiSecret } = req.body;
      if (!platform || !accountName) return res.status(400).json({ message: "platform and accountName required" });
      res.status(201).json(await socialDistributionService.addAccount({ platform, accountName, accountHandle, accessToken, refreshToken, apiKey, apiSecret }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/sdh/accounts/:id/toggle", requireRootAdmin, async (req, res) => {
    try {
      res.json(await socialDistributionService.toggleAccount(req.params.id, req.body.active));
    } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/admin/sdh/accounts/:id", requireRootAdmin, async (req, res) => {
    try { res.json(await socialDistributionService.deleteAccount(req.params.id)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/sdh/config", requireRootAdmin, async (_req, res) => {
    try { res.json(await socialDistributionService.getConfig()); } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/sdh/config", requireRootAdmin, async (req, res) => {
    try { res.json(await socialDistributionService.updateConfig(req.body)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/sdh/detect-content", requireAnyAdminPermission(MARKETING_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await socialDistributionService.detectImportantContent()); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/sdh/generate-post", requireRootAdmin, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin SDH generate", "admin-sdh-generate");
      if (!paid) return;
      const { platform, sourceType, sourceId, title, description, url } = req.body;
      if (!platform || !title) return res.status(400).json({ message: "platform and title required" });
      res.json(await socialDistributionService.generatePost({ platform, sourceType, sourceId, title, description, url }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/sdh/posts", requireRootAdmin, async (req, res) => {
    try {
      res.status(201).json(await socialDistributionService.createPost(req.body));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/sdh/posts", requireAnyAdminPermission(MARKETING_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const { status, platform, limit } = req.query as any;
      res.json(await socialDistributionService.getPosts({ status, platform, limit: limit ? parseInt(limit) : undefined }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/sdh/posts/:id/status", requireRootAdmin, async (req, res) => {
    try {
      res.json(await socialDistributionService.updatePostStatus(req.params.id, req.body.status, req.body));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/sdh/posts/:id/publish", requireRootAdmin, async (req, res) => {
    try { res.json(await socialDistributionService.publishPost(req.params.id)); } catch (err) { handleServiceError(res, err); }
  });

  app.delete("/api/admin/sdh/posts/:id", requireRootAdmin, async (req, res) => {
    try { res.json(await socialDistributionService.deletePost(req.params.id)); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/sdh/auto-detect", requireRootAdmin, async (_req, res) => {
    try { res.json(await socialDistributionService.autoDetectAndGenerate()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/sdh/scheduler", requireAnyAdminPermission(MARKETING_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await socialDistributionService.getSchedulerStatus()); } catch (err) { handleServiceError(res, err); }
  });

  // ============ GROWTH AUTOPILOT STACK ============
  const { growthAutopilotService } = await import("./services/growth-autopilot-service");

  app.get("/api/admin/growth-autopilot/dashboard", requireRootAdmin, async (_req, res) => {
    try { res.json(await growthAutopilotService.getDashboard()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/growth-autopilot/config", requireRootAdmin, async (_req, res) => {
    try { res.json(await growthAutopilotService.getConfig()); } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/growth-autopilot/config", requireRootAdmin, async (req, res) => {
    try { res.json(await growthAutopilotService.updateConfig(req.body)); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/growth-autopilot/run-cycle", requireRootAdmin, async (_req, res) => {
    try { res.json(await growthAutopilotService.runFullCycle()); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/growth-autopilot/run/:system", requireRootAdmin, async (req, res) => {
    try {
      const sys = req.params.system;
      let result;
      switch (sys) {
        case "content": result = await growthAutopilotService.runContentEngine(); break;
        case "social": result = await growthAutopilotService.runSocialDistribution(); break;
        case "viral": result = await growthAutopilotService.runViralEngine(); break;
        case "email": result = await growthAutopilotService.runEmailAutomation(); break;
        case "optimizer": result = await growthAutopilotService.runAIOptimizer(); break;
        default: return res.status(400).json({ error: "Unknown system" });
      }
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/growth-autopilot/logs", requireRootAdmin, async (req, res) => {
    try { res.json(await growthAutopilotService.getLogs(Number(req.query.limit) || 50)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/growth-autopilot/insights", requireRootAdmin, async (_req, res) => {
    try { res.json(await growthAutopilotService.getInsights()); } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/growth-autopilot/insights/:id", requireRootAdmin, async (req, res) => {
    try { res.json(await growthAutopilotService.updateInsightStatus(req.params.id, req.body.status)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/growth-autopilot/email-triggers", requireRootAdmin, async (_req, res) => {
    try { res.json(await growthAutopilotService.getEmailTriggers()); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/growth-autopilot/email-triggers", requireRootAdmin, async (req, res) => {
    try { res.json(await growthAutopilotService.createEmailTrigger(req.body)); } catch (err) { handleServiceError(res, err); }
  });

  app.patch("/api/admin/growth-autopilot/email-triggers/:id/toggle", requireRootAdmin, async (req, res) => {
    try { res.json(await growthAutopilotService.toggleEmailTrigger(req.params.id, req.body.active)); } catch (err) { handleServiceError(res, err); }
  });

  // ============ VIRAL BONDSCORE ============
  const { bondscoreService } = await import("./services/bondscore-service");

  app.post("/api/bondscore/create", async (req, res) => {
    try {
      const { creatorId, title, description, coverEmoji, questions } = req.body;
      if (!creatorId || !title || !questions) return res.status(400).json({ message: "creatorId, title, and questions required" });
      const test = await bondscoreService.createTest(creatorId, { title, description, coverEmoji, questions });
      res.status(201).json(test);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/bondscore/test/:slug", async (req, res) => {
    try {
      const test = await bondscoreService.getTestBySlug(req.params.slug);
      if (!test) return res.status(404).json({ message: "Test not found" });
      res.json(test);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/bondscore/submit", async (req, res) => {
    try {
      const { testId, guestId, selectedAnswers } = req.body;
      if (!testId || !guestId || !selectedAnswers) return res.status(400).json({ message: "testId, guestId, and selectedAnswers required" });
      const result = await bondscoreService.submitAttempt(testId, { guestId, selectedAnswers });
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/bondscore/claim", async (req, res) => {
    try {
      const { shareId, userId } = req.body;
      if (!shareId || !userId) return res.status(400).json({ message: "shareId and userId required" });
      const result = await bondscoreService.claimAttempt(shareId, userId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/bondscore/result/:shareId", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const result = await bondscoreService.getResult(req.params.shareId, userId);
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/bondscore/my-tests/:userId", async (req, res) => {
    try {
      res.json(await bondscoreService.getMyTests(req.params.userId));
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/bondscore/dashboard/:userId", async (req, res) => {
    try {
      res.json(await bondscoreService.getDashboardStats(req.params.userId));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/bondscore/ai-generate", requireAuth, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "BondScore AI", "bondscore-ai");
      if (!paid) return;
      const questions = await bondscoreService.generateAIQuestions(req.body.topic);
      res.json({ questions });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/bondscore/stats", requireRootAdmin, async (_req, res) => {
    try { res.json(await bondscoreService.getAdminStats()); } catch (err) { handleServiceError(res, err); }
  });

  // ============ INEVITABLE PLATFORM MONITOR ============
  const { inevitablePlatformService } = await import("./services/inevitable-platform-service");

  app.get("/api/admin/inevitable-platform", requireRootAdmin, async (_req, res) => {
    try { res.json(await inevitablePlatformService.getFullAnalysis()); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/inevitable-platform/snapshot", requireRootAdmin, async (_req, res) => {
    try { res.json(await inevitablePlatformService.captureSnapshot()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/inevitable-platform/history", requireRootAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 30;
      res.json(await inevitablePlatformService.getHistory(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  // ============ AUTHORITY FLYWHEEL ============
  const { authorityFlywheelService } = await import("./services/authority-flywheel-service");

  app.get("/api/admin/authority-flywheel", requireRootAdmin, async (_req, res) => {
    try { res.json(await authorityFlywheelService.getFullAnalysis()); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/authority-flywheel/snapshot", requireRootAdmin, async (_req, res) => {
    try { res.json(await authorityFlywheelService.captureSnapshot()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/authority-flywheel/history", requireRootAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 30;
      res.json(await authorityFlywheelService.getHistory(limit));
    } catch (err) { handleServiceError(res, err); }
  });

  // ============ SILENT SEO DOMINANCE ============
  const { silentSeoService } = await import("./services/silent-seo-service");

  app.get("/api/knowledge/:slug", async (req, res) => {
    try {
      const page = await silentSeoService.getKnowledgePage(req.params.slug);
      if (!page) return res.status(404).json({ message: "Page not found" });
      res.json(page);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/knowledge", async (_req, res) => {
    try { res.json(await silentSeoService.getAllPages("published")); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/knowledge/citation/:pageId", async (req, res) => {
    try { res.json(await silentSeoService.recordCitation(req.params.pageId)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/seo/dashboard", requireAnyAdminPermission(SEO_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await silentSeoService.getSeoDashboard()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/seo/pages", requireAnyAdminPermission(SEO_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await silentSeoService.getAllPages(req.query.status as string)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/seo/clusters", requireAnyAdminPermission(SEO_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await silentSeoService.getClusters()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/seo/clusters/:id", requireAnyAdminPermission(SEO_VIEW_PERMISSIONS), async (req, res) => {
    try {
      const result = await silentSeoService.getClusterWithPages(req.params.id);
      if (!result) return res.status(404).json({ message: "Cluster not found" });
      res.json(result);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/generate-page", requireRootAdmin, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin SEO page", "admin-seo-page");
      if (!paid) return;
      const { topicSlug, customTitle, customDesc } = req.body;
      if (!topicSlug) return res.status(400).json({ message: "topicSlug required" });
      res.json(await silentSeoService.generateKnowledgePage(topicSlug, { customTitle, customDesc }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/auto-generate", requireRootAdmin, async (_req, res) => {
    try {
      const paid = await requirePaidAiAccess(_req, res, "ai_response", "Admin SEO auto generate", "admin-seo-auto");
      if (!paid) return;
      res.json(await silentSeoService.autoGenerateForAllTopics());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/pages/:id/publish", requireRootAdmin, async (req, res) => {
    try {
      const page = await silentSeoService.publishPage(req.params.id);
      if (!page) return res.status(404).json({ message: "Page not found" });
      res.json(page);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/pages/:id/update-insights", requireRootAdmin, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin SEO update insights", `admin-seo-update:${req.params.id}`);
      if (!paid) return;
      res.json(await silentSeoService.updatePageWithInsights(req.params.id));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/update-all", requireRootAdmin, async (_req, res) => {
    try {
      const paid = await requirePaidAiAccess(_req, res, "ai_response", "Admin SEO update all", "admin-seo-update-all");
      if (!paid) return;
      res.json(await silentSeoService.updateAllPagesWithInsights());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/create-cluster", requireRootAdmin, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin SEO create cluster", "admin-seo-cluster");
      if (!paid) return;
      const { name, topicSlugs, description } = req.body;
      if (!name || !topicSlugs?.length) return res.status(400).json({ message: "name and topicSlugs required" });
      res.json(await silentSeoService.createTopicCluster({ name, topicSlugs, description }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/seo/clusters/:id/build-pages", requireRootAdmin, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin SEO build cluster pages", `admin-seo-build:${req.params.id}`);
      if (!paid) return;
      res.json(await silentSeoService.buildClusterPages(req.params.id));
    } catch (err) { handleServiceError(res, err); }
  });

  // ============ $0 MARKETING ENGINE ============
  const { marketingEngineService } = await import("./services/marketing-engine-service");

  app.get("/api/marketing/articles", async (req, res) => {
    try { res.json(await marketingEngineService.getArticles("published")); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/marketing/articles/:slug", async (req, res) => {
    try {
      const article = await marketingEngineService.getArticleBySlug(req.params.slug);
      if (!article) return res.status(404).json({ message: "Article not found" });
      res.json(article);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/marketing/seo/:slug", async (req, res) => {
    try {
      const page = await marketingEngineService.getSeoPageBySlug(req.params.slug);
      if (!page) return res.status(404).json({ message: "Page not found" });
      res.json(page);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/marketing/referral", resolveUser, async (req: any, res) => {
    try { res.json(await marketingEngineService.getOrCreateReferralLink(req.user.id)); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/marketing/referral/:code/click", async (req, res) => {
    try { res.json({ tracked: await marketingEngineService.trackReferralClick(req.params.code) }); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketing/convert-discussion", requireRootAdmin, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin marketing convert discussion", "admin-marketing-convert");
      if (!paid) return;
      const { postId } = req.body;
      if (!postId) return res.status(400).json({ message: "postId required" });
      res.json(await marketingEngineService.convertDiscussionToArticle(postId));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketing/generate-seo-page", requireRootAdmin, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "ai_response", "Admin marketing SEO page", "admin-marketing-seo");
      if (!paid) return;
      const { type, referenceId, name, description } = req.body;
      if (!type || !name) return res.status(400).json({ message: "type and name required" });
      res.json(await marketingEngineService.generateSeoPage(type, referenceId || "", { name, description: description || name }));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketing/auto-seo-pages", requireRootAdmin, async (_req, res) => {
    try {
      const paid = await requirePaidAiAccess(_req, res, "ai_response", "Admin marketing auto SEO", "admin-marketing-auto-seo");
      if (!paid) return;
      res.json(await marketingEngineService.autoGenerateToolSeoPages());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketing/daily-summary", requireRootAdmin, async (_req, res) => {
    try {
      const paid = await requirePaidAiAccess(_req, res, "ai_response", "Admin marketing daily summary", "admin-marketing-summary");
      if (!paid) return;
      res.json(await marketingEngineService.generateDailySummary());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketing/select-social", requireRootAdmin, async (_req, res) => {
    try {
      const paid = await requirePaidAiAccess(_req, res, "ai_response", "Admin marketing select social", "admin-marketing-select-social");
      if (!paid) return;
      res.json(await marketingEngineService.selectHighQualityForSocial());
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketing/articles/:id/publish", requireRootAdmin, async (req, res) => {
    try {
      const article = await marketingEngineService.publishArticle(req.params.id);
      if (!article) return res.status(404).json({ message: "Article not found" });
      res.json(article);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/marketing/seo-pages/:id/index", requireRootAdmin, async (req, res) => {
    try {
      const page = await marketingEngineService.indexSeoPage(req.params.id);
      if (!page) return res.status(404).json({ message: "Page not found" });
      res.json(page);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/marketing/articles", requireAnyAdminPermission(MARKETING_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await marketingEngineService.getArticles(req.query.status as string)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/marketing/seo-pages", requireAnyAdminPermission(MARKETING_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await marketingEngineService.getSeoPages()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/marketing/referrals", requireAnyAdminPermission(MARKETING_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await marketingEngineService.getReferralStats()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/marketing/dashboard", requireAnyAdminPermission(MARKETING_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await marketingEngineService.getGrowthDashboard()); } catch (err) { handleServiceError(res, err); }
  });

  // ============ ON-DEMAND DEV & BOOTSTRAP SURVIVAL ============
  const { onDemandDevService } = await import("./services/on-demand-dev-service");

  app.post("/api/dev-orders/calculate", resolveUser, async (req: any, res) => {
    try {
      const { appDescription, requirements } = req.body;
      if (!appDescription) return res.status(400).json({ message: "App description required" });
      res.json(onDemandDevService.calculatePricing(appDescription, requirements));
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/dev-orders", resolveUser, async (req: any, res) => {
    try {
      const { appName, appDescription, requirements, paymentReference } = req.body;
      if (!appName || !appDescription) return res.status(400).json({ message: "App name and description required" });
      const order = await onDemandDevService.createOrder(req.user.id, { appName, appDescription, requirements, paymentReference });
      res.json(order);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/dev-orders", resolveUser, async (req: any, res) => {
    try { res.json(await onDemandDevService.getUserOrders(req.user.id)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/dev-orders/:id", resolveUser, async (req: any, res) => {
    try {
      const order = await onDemandDevService.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/dev-orders/:id/confirm-payment", resolveUser, async (req: any, res) => {
    try {
      const order = await onDemandDevService.confirmPayment(req.params.id, req.body.paymentReference || "manual");
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/dev-orders", requireAnyAdminPermission(OPERATIONS_VIEW_PERMISSIONS), async (req, res) => {
    try { res.json(await onDemandDevService.getAllOrders(req.query.stage as string)); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/dev-orders/queue", requireAnyAdminPermission(OPERATIONS_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await onDemandDevService.getBuildQueue()); } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/admin/dev-orders/:id/stage", requireAnyAdminPermission(OPERATIONS_MANAGE_PERMISSIONS), async (req, res) => {
    try {
      const { stage, note } = req.body;
      if (!stage || !["QUEUED", "DEVELOPING", "TESTING", "DELIVERED"].includes(stage)) {
        return res.status(400).json({ message: "Invalid stage" });
      }
      const order = await onDemandDevService.updateStage(req.params.id, stage, note);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/bootstrap-health", requireAnyAdminPermission(OPERATIONS_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await onDemandDevService.getBootstrapHealth()); } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/admin/bootstrap-config", requireRootAdmin, async (_req, res) => {
    try { res.json({ dailyBuildLimit: onDemandDevService.getDailyBuildLimit() }); } catch (err) { handleServiceError(res, err); }
  });

  app.put("/api/admin/bootstrap-config", requireRootAdmin, async (req, res) => {
    try {
      const { dailyBuildLimit } = req.body;
      if (typeof dailyBuildLimit === "number") {
        onDemandDevService.setDailyBuildLimit(dailyBuildLimit);
      }
      res.json({ dailyBuildLimit: onDemandDevService.getDailyBuildLimit() });
    } catch (err) { handleServiceError(res, err); }
  });

  // ============ PNR MONITOR ============
  const { pnrMonitorService } = await import("./services/pnr-monitor-service");

  app.get("/api/admin/pnr-monitor", requireAnyAdminPermission(OPERATIONS_VIEW_PERMISSIONS), async (_req, res) => {
    try { res.json(await pnrMonitorService.computeSnapshot()); } catch (err) { handleServiceError(res, err); }
  });

  // ============ FOUNDER MINIMAL WORKDAY ============
  app.get("/api/admin/workday", requireAnyAdminPermission(OPERATIONS_VIEW_PERMISSIONS), async (_req, res) => {
    try {
      const [opsSnapshot, ticketStats, kbArticles, policyDashboard, gcisData, audienceRetentionSnap] = await Promise.allSettled([
        autonomousOperationsService.runAllEngines(),
        (await import("./services/support-ticket-service")).supportTicketService.getTicketStats(),
        (await import("./services/zero-support-learning-service")).zeroSupportLearningService.getAllArticles("published"),
        (await import("./services/adaptive-policy-service")).adaptivePolicyService.getDashboard(),
        (await import("./services/gcis-service")).gcisService.getDashboard(),
        (async () => {
          const svc = await import("./services/audience-retention-service");
          const stats = await svc.getRetentionStats();
          return {
            stats,
            trend: svc.summarizeStalePendingTrend(stats.stalePendingHistory ?? []),
            growthStreakThreshold: svc.audienceRetentionGrowthStreakThreshold(),
          };
        })(),
      ]);

      const ops = opsSnapshot.status === "fulfilled" ? opsSnapshot.value : null;
      const tickets = ticketStats.status === "fulfilled" ? ticketStats.value : { total: 0, open: 0, inProgress: 0, waitingUser: 0, resolved: 0, closed: 0 };
      const kbCount = kbArticles.status === "fulfilled" ? kbArticles.value.length : 0;
      const policy = policyDashboard.status === "fulfilled" ? policyDashboard.value : null;
      const gcis = gcisData.status === "fulfilled" ? gcisData.value : null;
      const audienceRetention = audienceRetentionSnap.status === "fulfilled" ? audienceRetentionSnap.value : null;

      const panicStatus = panicButtonService.getStatus();
      const stabilitySnap = stabilityTriangleService.getSnapshot();

      const totalTickets = tickets.total || 0;
      const resolvedTickets = (tickets.resolved || 0) + (tickets.closed || 0);
      const automationRate = totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 100;

      const economicEngine = ops?.engines?.find((e: any) => e.engine === "economic");
      const aiCostVsRevenue = economicEngine?.metrics || { estimatedRevenue: 0, aiComputeCost: 0, margin: 0 };

      const pendingApprovals: any[] = [];
      if (ops?.pendingApprovals?.length) {
        for (const a of ops.pendingApprovals.slice(0, 10)) {
          pendingApprovals.push({ id: a.id, type: "operations", engine: a.engine, action: a.actionType, severity: a.severity, created: a.createdAt });
        }
      }
      const pendingGcisApprovals = gcis?.stats?.pendingApproval ?? 0;
      if (pendingGcisApprovals > 0) {
        pendingApprovals.push({ id: "gcis-pending", type: "compliance", engine: "compliance", action: `${pendingGcisApprovals} compliance rules pending review`, severity: "warning", created: new Date().toISOString() });
      }
      if (policy?.pendingDrafts?.length) {
        for (const d of (policy.pendingDrafts as any[]).slice(0, 5)) {
          pendingApprovals.push({ id: d.id || "policy-draft", type: "policy", engine: "policy", action: `Policy draft: ${d.slug || d.type || "update"}`, severity: "info", created: d.createdAt || new Date().toISOString() });
        }
      }

      const actionableItems: any[] = [];
      if (panicStatus.mode !== "NORMAL") {
        actionableItems.push({ priority: "critical", label: `Platform in ${panicStatus.mode} mode`, link: "/admin/debug" });
      }
      if (pendingApprovals.length > 0) {
        actionableItems.push({ priority: "warning", label: `${pendingApprovals.length} items awaiting your approval`, link: "/admin/operations" });
      }
      if (tickets.open > 5) {
        actionableItems.push({ priority: "warning", label: `${tickets.open} open support tickets`, link: "/admin/support" });
      }
      if (ops?.engines?.some((e: any) => e.status === "critical")) {
        const criticalEngines = ops.engines.filter((e: any) => e.status === "critical").map((e: any) => e.engine);
        actionableItems.push({ priority: "critical", label: `Critical: ${criticalEngines.join(", ")} engine(s)`, link: "/admin/operations" });
      }
      if (automationRate < 50) {
        actionableItems.push({ priority: "info", label: `Support automation at ${automationRate}% — consider KB improvements`, link: "/admin/knowledge-base" });
      }
      // Task #486 / #544 — surface the audience-retention backlog trend on
      // the founder briefing, but only fire the actionable once a table's
      // stale-pending counter has grown for `growthStreakThreshold`
      // consecutive sweeps in a row. A single noisy sweep no longer pages
      // the founder; a sustained backlog still does.
      if (audienceRetention?.trend) {
        const t = audienceRetention.trend.tables;
        const threshold = audienceRetention.growthStreakThreshold ?? 3;
        const persistent = (
          ["messages", "decisions", "commands"] as const
        ).filter((k) => (t[k].consecutiveGrowthStreak ?? 0) >= threshold);
        if (persistent.length > 0) {
          const detail = persistent
            .map((k) => `${k} (${t[k].consecutiveGrowthStreak} sweeps)`)
            .join(", ");
          actionableItems.push({
            priority: "warning",
            label: `Audience retention backlog growing ${threshold}+ sweeps in a row: ${detail}`,
            link: "/admin/omni-channel-audience#retention",
          });
        }
      }

      let dailySummary = ops?.summary || "";
      if (!dailySummary) {
        try {
          const paid = await requirePaidAiAccess(_req, res, "ai_response", "Admin workday summary", "admin-workday-summary");
          if (!paid) return;
          const openai = new (await import("openai")).default({
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
            apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          });
          const resp = await openai.chat.completions.create({
            model: "gpt-5.5",
            messages: [{ role: "system", content: "You are a concise executive briefing writer. Write a 3-4 sentence daily summary for a founder dashboard. Focus only on what needs attention. Be direct." }, {
              role: "user",
              content: `Health: ${ops?.overallHealth || 0}%. Mode: ${panicStatus.mode}. Stability: ${stabilitySnap.stabilityIndex}%. Revenue metric: ${aiCostVsRevenue.estimatedRevenue}. AI cost: ${aiCostVsRevenue.aiComputeCost}. Margin: ${aiCostVsRevenue.margin}%. Open tickets: ${tickets.open}. Automation: ${automationRate}%. Pending approvals: ${pendingApprovals.length}. KB articles: ${kbCount}. Compliance rules pending: ${gcis?.stats?.pendingApproval || 0}.`
            }],
            temperature: 0.3,
            max_tokens: 200,
          });
          dailySummary = resp.choices[0]?.message?.content || "";
        } catch {
          dailySummary = `Platform at ${ops?.overallHealth || 0}% health in ${panicStatus.mode} mode. ${pendingApprovals.length} pending approvals. ${tickets.open} open tickets.`;
        }
      }

      res.json({
        generatedAt: new Date().toISOString(),
        systemHealth: {
          overall: ops?.overallHealth || 0,
          status: ops?.overallStatus || "unknown",
          platformMode: panicStatus.mode,
          engines: (ops?.engines || []).map((e: any) => ({ name: e.engine, status: e.status, score: e.score })),
        },
        financials: {
          estimatedRevenue: aiCostVsRevenue.estimatedRevenue,
          aiComputeCost: aiCostVsRevenue.aiComputeCost,
          margin: aiCostVsRevenue.margin,
        },
        pendingApprovals,
        policyUpdates: {
          pendingDrafts: policy?.pendingDrafts?.length || 0,
          activeTemplates: policy?.templates?.length || 0,
          complianceRulesPending: gcis?.stats?.pendingApproval || 0,
        },
        supportAutomation: {
          automationRate,
          openTickets: tickets.open || 0,
          inProgress: tickets.inProgress || 0,
          kbArticlesPublished: kbCount,
          totalResolved: resolvedTickets,
        },
        stabilityIndex: {
          score: stabilitySnap.stabilityIndex,
          dimensions: {
            freedom: (stabilitySnap as any).freedom?.value ?? (stabilitySnap as any).freedom ?? 0,
            automation: (stabilitySnap as any).automation?.value ?? (stabilitySnap as any).automation ?? 0,
            control: (stabilitySnap as any).control?.value ?? (stabilitySnap as any).control ?? 0,
          },
        },
        actionableItems,
        dailySummary,
        audienceRetention: audienceRetention
          ? {
              retentionDays: audienceRetention.stats.retentionDays,
              stalePendingArchive: audienceRetention.stats.stalePendingArchive,
              alertActive: audienceRetention.stats.alertActive,
              staleRowsAlertActive: audienceRetention.stats.staleRowsAlertActive,
              trend: audienceRetention.trend,
              growthStreakThreshold: audienceRetention.growthStreakThreshold,
              lastSweepAt: audienceRetention.stats.lastRun?.cutoffIso ?? null,
              lastSweepError: audienceRetention.stats.lastRun?.error ?? null,
            }
          : null,
      });
    } catch (err) { handleServiceError(res, err); }
  });

  // ==================== PROJECT PIPELINE & PDF ENGINE ====================

  app.get("/api/projects", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const projectList = await storage.getProjects(limit);
      res.json(projectList);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json(project);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/projects/:id/agents", requireAuth, async (req, res) => {
    try {
      const contributions = await storage.getProjectAgentContributions(req.params.id);
      res.json(contributions);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/projects/:id/agents", requireAuth, async (req, res) => {
    try {
      const entries = Array.isArray(req.body?.agents) ? req.body.agents : [];
      const created = [];
      for (const entry of entries) {
        const agentId = entry?.agentId;
        if (!agentId) continue;
        created.push(await storage.createProjectAgentContribution({
          projectId: req.params.id,
          agentId,
          role: entry?.role || "contributor",
          contributionWeight: Number(entry?.contributionWeight) || 1,
        }));
      }
      res.json(created);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/projects/generate-from-debate/:debateId", requireAuth, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "premium_feature", "Project pipeline", `debate:${req.params.debateId}`);
      if (!paid) return;
      const debateId = parseInt(req.params.debateId);
      if (isNaN(debateId)) return res.status(400).json({ error: "Invalid debate ID" });
      const triggeredBy = (req.body?.triggeredBy as string) || "manual";
      const { projectPipelineService } = await import("./services/project-pipeline-service");
      const project = await projectPipelineService.generateProjectFromDebate(debateId, triggeredBy);
      const contributions = Array.isArray(req.body?.agents) ? req.body.agents : [];
      for (const entry of contributions) {
        const agentId = entry?.agentId;
        if (!agentId) continue;
        await storage.createProjectAgentContribution({
          projectId: project.id,
          agentId,
          role: entry?.role || "contributor",
          contributionWeight: Number(entry?.contributionWeight) || 1,
        });
      }
      res.json(project);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/projects/:id/generate-pdf", requireAuth, async (req, res) => {
    try {
      const paid = await requirePaidAiAccess(req, res, "premium_feature", "Project PDF", `project:${req.params.id}`);
      if (!paid) return;
      const { pdfEngineService } = await import("./services/pdf-engine-service");
      const result = await pdfEngineService.generatePDF(req.params.id);
      res.json({ success: true, pages: result.pages, packageId: result.packageId, downloadUrl: `/api/projects/${req.params.id}/packages/${result.packageId}/download` });
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/projects/:id/packages", async (req, res) => {
    try {
      const packages = await storage.getProjectPackages(req.params.id);
      res.json(packages);
    } catch (err) { handleServiceError(res, err); }
  });

  app.get("/api/projects/:projectId/packages/:packageId/download", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Authentication required" });
      const pkg = await storage.getProjectPackage(req.params.packageId);
      if (!pkg || pkg.projectId !== req.params.projectId) return res.status(404).json({ error: "Package not found" });
      const [app] = await db.select().from(labsApps).where(eq(labsApps.projectPackageId, pkg.id)).limit(1);
      const price = app?.price || 0;
      if (price > 0) {
        const purchased = await storage.hasProjectPackagePurchase(pkg.id, req.session.userId);
        if (!purchased) return res.status(403).json({ error: "Purchase required to download" });
      }
      const { pdfEngineService } = await import("./services/pdf-engine-service");
      const fileName = pkg.pdfUrl;
      if (!fileName) return res.status(404).json({ error: "PDF file not found" });
      const filePath = pdfEngineService.getPDFFilePath(fileName);
      if (!filePath) return res.status(404).json({ error: "PDF file not found on disk" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      const fs = await import("fs");
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err) { handleServiceError(res, err); }
  });

  app.post("/api/projects/:projectId/packages/:packageId/purchase", requireAuth, async (req, res) => {
    try {
      const pkg = await storage.getProjectPackage(req.params.packageId);
      if (!pkg || pkg.projectId !== req.params.projectId) return res.status(404).json({ error: "Package not found" });
      const [app] = await db.select().from(labsApps).where(eq(labsApps.projectPackageId, pkg.id)).limit(1);
      const price = app?.price || 0;
      const existing = await storage.hasProjectPackagePurchase(pkg.id, req.user.id);
      if (existing) return res.json({ success: true, alreadyPurchased: true });
      if (price > 0) {
        await db.transaction(async (tx) => {
          const [buyerUpdated] = await tx.update(users_table)
            .set({ creditWallet: sql`COALESCE(${users_table.creditWallet}, 0) - ${price}` })
            .where(and(eq(users_table.id, req.user.id), gte(users_table.creditWallet, price)))
            .returning({ id: users_table.id });
          if (!buyerUpdated) throw new Error("Insufficient credits");

          await tx.insert(creditUsageLog).values({
            userId: req.user.id,
            creditsUsed: price,
            actionType: "project_package_purchase",
            actionLabel: `Project package purchase: ${pkg.id}`,
            referenceId: pkg.id,
          });

          await tx.insert(transactions_table).values({
            senderId: req.user.id,
            receiverId: "system",
            amount: price,
            transactionType: "project_package_purchase",
            referenceId: pkg.id,
            description: `Project package purchase: ${pkg.id}`,
          });

          await tx.insert(projectPackagePurchases).values({
            projectPackageId: pkg.id,
            buyerId: req.user.id,
            amount: price,
          });
        });
      } else {
        await storage.createProjectPackagePurchase({
          projectPackageId: pkg.id,
          buyerId: req.user.id,
          amount: price,
        });
      }
      res.json({ success: true, price });
    } catch (err: any) {
      if (err.message?.includes("Insufficient credits")) {
        return res.status(402).json({ error: err.message });
      }
      handleServiceError(res, err);
    }
  });

  app.post("/api/projects/:projectId/packages/:packageId/feedback", requireAuth, async (req, res) => {
    try {
      const pkg = await storage.getProjectPackage(req.params.packageId);
      if (!pkg || pkg.projectId !== req.params.projectId) return res.status(404).json({ error: "Package not found" });
      const { rating, comment } = req.body;
      if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be 1-5" });
      const feedback = await storage.createProjectFeedback({
        projectPackageId: req.params.packageId,
        buyerId: req.user.id,
        rating,
        comment: comment || null,
      });
      res.json(feedback);
    } catch (err) { handleServiceError(res, err); }
  });

  // ===========================================================================
  // AI Jobs — TypeScript ↔ Python worker bridge
  //
  // These routes are the ONLY way the rest of the app should hand work to the
  // Python worker layer. The Python worker is OPTIONAL — if it is not running,
  // jobs sit in `pending` state and the TS app continues to serve traffic
  // normally. The frontend NEVER calls Python directly.
  //
  // Permission model:
  //   - user.* jobs require a logged-in user (`requireAuth`).
  //   - inhouse.* jobs require root admin (`requireRootAdmin`).
  //   - vector/media/eval pipelines: routed through whichever caller class
  //     enqueues them; the service-level guard re-validates origin.
  //
  // Persistence: in-memory placeholder inside aiJobService (see TODO there).
  // ===========================================================================
  const { aiJobService, AiJobValidationError, AiJobPermissionError, AiJobNotFoundError, AiJobConflictError } =
    await import("./services/aiJobService");
  const { JobOrigin } = await import("@shared/aiJobContracts");

  function handleAiJobError(res: any, err: unknown) {
    if (err instanceof AiJobValidationError) {
      return res.status(400).json({ message: err.message, code: err.code });
    }
    if (err instanceof AiJobPermissionError) {
      return res.status(403).json({ message: err.message, code: err.code });
    }
    if (err instanceof AiJobNotFoundError) {
      return res.status(404).json({ message: "AI job not found", code: err.code });
    }
    if (err instanceof AiJobConflictError) {
      return res.status(409).json({ message: err.message, code: err.code });
    }
    return handleServiceError(res, err);
  }

  // 1. user.claim_extraction — user-facing.
  // Generic entrypoint accepts either {articleIds:[]} (lookup-only — the TS
  // side or a follow-up job must attach text before the worker can do
  // anything useful) OR {articles:[{id,text,title?}]} (text-attached).
  // Authenticated users only; the resulting job is scoped to the caller
  // via requestedByUserId and getView() refuses cross-user reads.
  app.post("/api/ai-jobs/claim-extraction", requireAuth, async (req: any, res) => {
    try {
      const envelope = await aiJobService.createClaimExtractionJob({
        payload: req.body ?? {},
        requestedByUserId: req.user.id,
        requestId: req.headers["x-request-id"] as string | undefined,
      });
      res.status(202).json({
        jobId: envelope.jobId,
        status: "pending",
        statusUrl: `/api/ai-jobs/${envelope.jobId}`,
      });
    } catch (err) { handleAiJobError(res, err); }
  });

  // 1b. Per-post claim extraction. Loads the post text from the data layer,
  // builds an `articles:[{id,text,title}]` payload, and enqueues a
  // user-origin job tagged with the post id in the request id (so the
  // admin debug console can trace which post a job came from).
  // - 401 via requireAuth
  // - 404 if the post does not exist
  // - 400 if the post has no extractable text
  app.post("/api/posts/:postId/claim-extraction", requireAuth, async (req: any, res) => {
    try {
      const postId = String(req.params.postId || "").trim();
      if (!postId) {
        return res.status(400).json({ message: "postId is required" });
      }
      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      const title = (post.title || "").trim();
      const body = (post.content || "").trim();
      // Combine title + body so the heuristic sentence splitter sees the
      // headline as its own sentence. Title is also passed separately so
      // future LLM-backed extractors can use it as context.
      const composedText = title && body ? `${title}. ${body}` : title || body;
      if (!composedText) {
        return res.status(400).json({
          message: "Post has no extractable text",
          code: "EMPTY_CONTENT",
        });
      }
      const maxClaims = Math.min(
        Math.max(parseInt(String(req.body?.maxClaimsPerArticle ?? "8"), 10) || 8, 1),
        32,
      );
      const envelope = await aiJobService.createClaimExtractionJob({
        payload: {
          articles: [
            {
              id: post.id,
              title: title || undefined,
              // Cap at the schema's hard ceiling so we never blow past it.
              text: composedText.slice(0, 50_000),
            },
          ],
          maxClaimsPerArticle: maxClaims,
        },
        requestedByUserId: req.user.id,
        requestId: `post:${post.id}:${req.headers["x-request-id"] ?? ""}` || undefined,
      });
      res.status(202).json({
        jobId: envelope.jobId,
        status: "pending",
        source: { type: "post", id: post.id, title: title || null },
        statusUrl: `/api/ai-jobs/${envelope.jobId}`,
      });
    } catch (err) { handleAiJobError(res, err); }
  });

  // 2. vector.clustering — user-facing.
  // Accepts a flexible body that supports two modes (combinable):
  //   { postIds: [...] }   → loads post title+content from the data layer
  //   { items:  [{ id?, text, title? }, ...] } → direct text from the user
  //   { distanceThreshold?: number, title?: string }
  // Also accepts the lower-level payload directly (documentIds / documents)
  // for backward compatibility with the existing typed schema.
  // Total items across all modes must be >= 2 (enforced at schema layer too).
  app.post("/api/ai-jobs/semantic-clustering", requireAuth, async (req: any, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, any>;
      const documents: Array<{ id: string; text: string; title?: string; sourceType: string; sourceRef?: string }> = [];
      const skippedPostIds: string[] = [];

      // Mode A: load real posts from the database.
      const postIds: string[] = Array.isArray(body.postIds) ? body.postIds.map(String) : [];
      if (postIds.length > 0) {
        // Deduplicate to avoid one-post-many-times skew.
        const unique = Array.from(new Set(postIds.map((p) => p.trim()).filter(Boolean)));
        for (const pid of unique) {
          const post = await storage.getPost(pid);
          if (!post) {
            skippedPostIds.push(pid);
            continue;
          }
          const title = (post.title || "").trim();
          const content = (post.content || "").trim();
          const composed = title && content ? `${title}. ${content}` : title || content;
          if (!composed) {
            skippedPostIds.push(pid);
            continue;
          }
          documents.push({
            id: `post:${post.id}`,
            text: composed.slice(0, 25_000),
            title: title || undefined,
            sourceType: "post",
            sourceRef: post.id,
          });
        }
      }

      // Mode B: caller-supplied free-text items.
      const rawItems: any[] = Array.isArray(body.items) ? body.items : [];
      rawItems.forEach((it, idx) => {
        if (!it || typeof it !== "object") return;
        const text = String(it.text ?? "").trim();
        if (!text) return;
        const id = String(it.id ?? `item:${idx}`).trim() || `item:${idx}`;
        documents.push({
          id,
          text: text.slice(0, 25_000),
          title: typeof it.title === "string" ? it.title.slice(0, 500) : undefined,
          sourceType: "direct_text",
        });
      });

      // Mode C / passthrough: support the lower-level payload shape too.
      const passthroughDocuments = Array.isArray(body.documents) ? body.documents : [];
      const passthroughIds = Array.isArray(body.documentIds) ? body.documentIds : [];

      // Build the typed payload the job service expects.
      const payload: Record<string, unknown> = {};
      const combinedDocs = [...documents, ...passthroughDocuments];
      if (combinedDocs.length > 0) payload.documents = combinedDocs;
      if (passthroughIds.length > 0) payload.documentIds = passthroughIds;
      if (typeof body.distanceThreshold === "number") {
        payload.distanceThreshold = body.distanceThreshold;
      }

      // Friendlier 400 when caller supplied postIds but none resolved.
      if (combinedDocs.length === 0 && passthroughIds.length === 0) {
        return res.status(400).json({
          message: "No usable items: provide `postIds`, `items`, `documents`, or `documentIds` with at least 2 entries.",
          code: "NO_ITEMS",
          skippedPostIds,
        });
      }

      const envelope = await aiJobService.createSemanticClusteringJob({
        payload,
        origin: JobOrigin.USER,
        requestedByUserId: req.user.id,
        requestId: req.headers["x-request-id"] as string | undefined,
      });
      res.status(202).json({
        jobId: envelope.jobId,
        status: "pending",
        statusUrl: `/api/ai-jobs/${envelope.jobId}`,
        itemCount: combinedDocs.length + passthroughIds.length,
        source: {
          posts: documents.filter((d) => d.sourceType === "post").length,
          directText: documents.filter((d) => d.sourceType === "direct_text").length,
          passthroughDocuments: passthroughDocuments.length,
          passthroughIds: passthroughIds.length,
          skippedPostIds,
        },
      });
    } catch (err) { handleAiJobError(res, err); }
  });

  // 3. inhouse.newsroom — admin-only.
  // Aggregates inputs from four optional sources into a single
  // newsroom_package payload for the Python newsroom_agent:
  //   - postIds:       loads post title+content from the data layer.
  //   - claimJobIds:   reads succeeded user.claim_extraction job results
  //                    via aiJobService.getJob and forwards their claims[].
  //   - clusterJobIds: reads succeeded vector.clustering job results and
  //                    forwards their clusters[].
  //   - sources:       direct admin-supplied text items.
  // Skipped/non-succeeded job ids are reported in the response summary;
  // the request fails only when zero usable input remains (no anchor and
  // no articles/claims/clusters).
  app.post("/api/admin/ai-jobs/newsroom-package", requireRootAdmin, async (req: any, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, any>;
      const adminId = req.session?.adminActorId ?? "env-root-admin";
      const articles: Array<Record<string, unknown>> = [];
      const claims: Array<Record<string, unknown>> = [];
      const clusters: Array<Record<string, unknown>> = [];
      const skippedPostIds: string[] = [];
      const skippedClaimJobIds: Array<{ id: string; reason: string }> = [];
      const skippedClusterJobIds: Array<{ id: string; reason: string }> = [];

      // --- Mode A: posts ---------------------------------------------------
      const postIds: string[] = Array.isArray(body.postIds)
        ? Array.from(new Set(body.postIds.map((p: any) => String(p).trim()).filter(Boolean)))
        : [];
      if (postIds.length > 100) {
        return res.status(400).json({ message: "At most 100 postIds allowed", code: "TOO_MANY_POST_IDS" });
      }
      for (const pid of postIds) {
        const post = await storage.getPost(pid);
        if (!post) { skippedPostIds.push(pid); continue; }
        const title = (post.title || "").trim();
        const content = (post.content || "").trim();
        const composed = title && content ? `${title}. ${content}` : title || content;
        if (!composed) { skippedPostIds.push(pid); continue; }
        articles.push({
          id: `post:${post.id}`,
          title: title || undefined,
          text: composed.slice(0, 25_000),
          sourceType: "post",
          sourceRef: post.id,
        });
      }

      // --- Mode B: prior job results --------------------------------------
      const claimJobIds: string[] = Array.isArray(body.claimJobIds)
        ? body.claimJobIds.map((s: any) => String(s).trim()).filter(Boolean)
        : [];
      const clusterJobIds: string[] = Array.isArray(body.clusterJobIds)
        ? body.clusterJobIds.map((s: any) => String(s).trim()).filter(Boolean)
        : [];
      if (claimJobIds.length > 50 || clusterJobIds.length > 50) {
        return res.status(400).json({ message: "At most 50 claimJobIds / clusterJobIds allowed", code: "TOO_MANY_JOB_IDS" });
      }
      for (const jid of claimJobIds) {
        try {
          const job = await aiJobService.getJob(jid);
          if (job.jobType !== "user.claim_extraction") {
            skippedClaimJobIds.push({ id: jid, reason: `wrong_type:${job.jobType}` });
            continue;
          }
          if (job.status !== "succeeded") {
            skippedClaimJobIds.push({ id: jid, reason: `status:${job.status}` });
            continue;
          }
          const result = (job.result ?? {}) as Record<string, any>;
          const extracted = Array.isArray(result.claims) ? result.claims : [];
          for (const c of extracted) {
            if (c && typeof c === "object") claims.push(c);
            if (claims.length >= 500) break;
          }
        } catch {
          skippedClaimJobIds.push({ id: jid, reason: "not_found" });
        }
        if (claims.length >= 500) break;
      }
      for (const jid of clusterJobIds) {
        try {
          const job = await aiJobService.getJob(jid);
          if (job.jobType !== "vector.clustering") {
            skippedClusterJobIds.push({ id: jid, reason: `wrong_type:${job.jobType}` });
            continue;
          }
          if (job.status !== "succeeded") {
            skippedClusterJobIds.push({ id: jid, reason: `status:${job.status}` });
            continue;
          }
          const result = (job.result ?? {}) as Record<string, any>;
          const extracted = Array.isArray(result.clusters) ? result.clusters : [];
          for (const cl of extracted) {
            if (cl && typeof cl === "object") clusters.push(cl);
            if (clusters.length >= 100) break;
          }
        } catch {
          skippedClusterJobIds.push({ id: jid, reason: "not_found" });
        }
        if (clusters.length >= 100) break;
      }

      // --- Mode C: direct admin sources -----------------------------------
      const rawSources: any[] = Array.isArray(body.sources) ? body.sources : [];
      rawSources.forEach((s, idx) => {
        if (!s || typeof s !== "object") return;
        const text = String(s.text ?? "").trim();
        if (!text) return;
        const id = String(s.id ?? `src:${idx}`).trim() || `src:${idx}`;
        articles.push({
          id,
          title: typeof s.title === "string" ? s.title.slice(0, 500) : undefined,
          text: text.slice(0, 25_000),
          sourceType: typeof s.sourceType === "string" ? s.sourceType.slice(0, 40) : "direct_text",
          sourceRef: typeof s.sourceRef === "string" ? s.sourceRef.slice(0, 200) : undefined,
        });
      });

      // --- Mode D: passthrough --------------------------------------------
      if (Array.isArray(body.articles)) for (const a of body.articles) if (a && typeof a === "object") articles.push(a);
      if (Array.isArray(body.claims)) for (const c of body.claims) if (c && typeof c === "object") claims.push(c);
      if (Array.isArray(body.clusters)) for (const c of body.clusters) if (c && typeof c === "object") clusters.push(c);

      const verifiedKnowledgeId =
        typeof body.verifiedKnowledgeId === "string" && body.verifiedKnowledgeId.trim()
          ? body.verifiedKnowledgeId.trim()
          : undefined;

      const total = articles.length + claims.length + clusters.length;
      if (total === 0 && !verifiedKnowledgeId) {
        return res.status(400).json({
          message: "No usable input: provide postIds, claimJobIds, clusterJobIds, sources, or verifiedKnowledgeId.",
          code: "NO_INPUT",
          source: { skippedPostIds, skippedClaimJobIds, skippedClusterJobIds },
        });
      }

      const payload: Record<string, unknown> = {};
      if (verifiedKnowledgeId) payload.verifiedKnowledgeId = verifiedKnowledgeId;
      if (typeof body.templateId === "string" && body.templateId.trim()) {
        payload.templateId = body.templateId.trim();
      }
      if (articles.length) payload.articles = articles;
      if (claims.length) payload.claims = claims;
      if (clusters.length) payload.clusters = clusters;

      const envelope = await aiJobService.createNewsroomPackageJob({
        payload,
        requestedByAdminId: adminId,
        requestId: req.headers["x-request-id"] as string | undefined,
      });
      res.status(202).json({
        jobId: envelope.jobId,
        status: "pending",
        statusUrl: `/api/ai-jobs/${envelope.jobId}`,
        source: {
          articleCount: articles.length,
          claimCount: claims.length,
          clusterCount: clusters.length,
          postCount: postIds.length - skippedPostIds.length,
          directSourceCount: rawSources.filter((s) => s && String(s?.text ?? "").trim()).length,
          verifiedKnowledgeId: verifiedKnowledgeId ?? null,
          skippedPostIds,
          skippedClaimJobIds,
          skippedClusterJobIds,
        },
      });
    } catch (err) { handleAiJobError(res, err); }
  });

  // Admin-side semantic clustering (in-house origin)
  app.post("/api/admin/ai-jobs/semantic-clustering", requireRootAdmin, async (req: any, res) => {
    try {
      const adminId = req.session?.adminActorId ?? "env-root-admin";
      const envelope = await aiJobService.createSemanticClusteringJob({
        payload: req.body ?? {},
        origin: JobOrigin.INHOUSE,
        requestedByAdminId: adminId,
        requestId: req.headers["x-request-id"] as string | undefined,
      });
      res.status(202).json({ jobId: envelope.jobId, status: "pending" });
    } catch (err) { handleAiJobError(res, err); }
  });

  // Status / view (frontend-safe — no payload internals leaked).
  // Service-side viewer context restricts non-admin users to their own
  // user-origin jobs.
  // List the authenticated user's AI jobs (USER origin only).
  // Filters: status, jobType, limit (1..100), offset, since/until ISO.
  // INHOUSE jobs are never returned here — the service enforces it.
  app.get("/api/ai-jobs", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(403).json({ message: "Forbidden" });
      const q = req.query as Record<string, string | undefined>;
      const parseDate = (v?: string) => {
        if (!v) return undefined;
        const d = new Date(v);
        return isNaN(d.getTime()) ? undefined : d;
      };
      const items = await aiJobService.listUserJobs({
        userId,
        status: q.status?.trim() || undefined,
        jobType: q.jobType?.trim() || undefined,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        offset: q.offset ? parseInt(q.offset, 10) : undefined,
        since: parseDate(q.since),
        until: parseDate(q.until),
      });
      res.json({ count: items.length, items });
    } catch (err) { handleAiJobError(res, err); }
  });

  // Admin: list any AI jobs with rich filters.
  app.get("/api/admin/ai-jobs", requireRootAdmin, async (req, res) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const parseDate = (v?: string) => {
        if (!v) return undefined;
        const d = new Date(v);
        return isNaN(d.getTime()) ? undefined : d;
      };
      const items = await aiJobService.listAdminJobs({
        status: q.status?.trim() || undefined,
        jobType: q.jobType?.trim() || undefined,
        origin: q.origin?.trim() || undefined,
        requestedByUserId: q.requestedByUserId?.trim() || undefined,
        requestedByAdminId: q.requestedByAdminId?.trim() || undefined,
        lockedBy: q.lockedBy?.trim() || undefined,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        offset: q.offset ? parseInt(q.offset, 10) : undefined,
        since: parseDate(q.since),
        until: parseDate(q.until),
      });
      res.json({ count: items.length, items });
    } catch (err) { handleAiJobError(res, err); }
  });

  // Admin: retry a failed/rejected job. Resets row to pending so the worker
  // picks it up next poll. Returns 409 if the job is not retryable.
  app.post("/api/admin/ai-jobs/:jobId/retry", requireRootAdmin, async (req: any, res) => {
    try {
      const jobId = req.params.jobId?.trim();
      if (!jobId) return res.status(400).json({ message: "jobId required" });
      const adminId =
        req.session?.adminId || req.user?.id || req.session?.userId || "unknown-admin";
      const job = await aiJobService.retryJob(jobId, { adminId });
      res.json({
        jobId: job.id,
        status: job.status,
        message: "Job re-queued; worker will pick it up on next poll",
        job: {
          id: job.id,
          status: job.status,
          retryCount: job.retryCount,
          maxRetries: job.maxRetries,
          updatedAt: job.updatedAt.toISOString(),
        },
      });
    } catch (err) { handleAiJobError(res, err); }
  });

  // Admin: cancel a pending/running job. Pending jobs are safe to cancel
  // (worker hasn't picked them up). Running jobs are marked rejected with
  // error="cancelled_by_admin"; recordResult guards against late worker
  // overwrites. Returns 409 if the job is in a terminal state.
  app.post("/api/admin/ai-jobs/:jobId/cancel", requireRootAdmin, async (req: any, res) => {
    try {
      const jobId = req.params.jobId?.trim();
      if (!jobId) return res.status(400).json({ message: "jobId required" });
      const adminId =
        req.session?.adminId || req.user?.id || req.session?.userId || "unknown-admin";
      const job = await aiJobService.cancelJob(jobId, { adminId });
      res.json({
        jobId: job.id,
        status: job.status,
        message: "Job cancelled",
        job: {
          id: job.id,
          status: job.status,
          error: job.error,
          updatedAt: job.updatedAt.toISOString(),
        },
      });
    } catch (err) { handleAiJobError(res, err); }
  });

  // Admin: list audit events for one job (oldest-first).
  app.get("/api/admin/ai-jobs/:jobId/events", requireRootAdmin, async (req, res) => {
    try {
      const jobId = req.params.jobId?.trim();
      if (!jobId) return res.status(400).json({ message: "jobId required" });
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
      const events = await aiJobService.listJobEvents(jobId, limit);
      res.json({
        count: events.length,
        items: events.map((e) => ({
          id: e.id,
          jobId: e.jobId,
          eventType: e.eventType,
          actorType: e.actorType,
          actorUserId: e.actorUserId,
          actorAdminId: e.actorAdminId,
          actorWorkerId: e.actorWorkerId,
          previousStatus: e.previousStatus,
          newStatus: e.newStatus,
          message: e.message,
          metadata: e.metadata ?? {},
          createdAt: e.createdAt.toISOString(),
        })),
      });
    } catch (err) { handleAiJobError(res, err); }
  });

  // Admin: cross-job audit query with filters.
  app.get("/api/admin/ai-job-events", requireRootAdmin, async (req, res) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const parseDate = (v?: string) => {
        if (!v) return undefined;
        const d = new Date(v);
        return isNaN(d.getTime()) ? undefined : d;
      };
      const events = await aiJobService.listAllEvents({
        jobId: q.jobId?.trim() || undefined,
        eventType: q.eventType?.trim() || undefined,
        actorType: q.actorType?.trim() || undefined,
        actorUserId: q.actorUserId?.trim() || undefined,
        actorAdminId: q.actorAdminId?.trim() || undefined,
        actorWorkerId: q.actorWorkerId?.trim() || undefined,
        since: parseDate(q.since),
        until: parseDate(q.until),
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        offset: q.offset ? parseInt(q.offset, 10) : undefined,
      });
      res.json({
        count: events.length,
        items: events.map((e) => ({
          id: e.id,
          jobId: e.jobId,
          eventType: e.eventType,
          actorType: e.actorType,
          actorUserId: e.actorUserId,
          actorAdminId: e.actorAdminId,
          actorWorkerId: e.actorWorkerId,
          previousStatus: e.previousStatus,
          newStatus: e.newStatus,
          message: e.message,
          metadata: e.metadata ?? {},
          createdAt: e.createdAt.toISOString(),
        })),
      });
    } catch (err) { handleAiJobError(res, err); }
  });

  // Admin: read-only — list jobs stuck in RUNNING longer than olderThanMs
  // (default 15 minutes). Does NOT mutate state.
  app.post("/api/admin/ai-jobs/release-stale-running", requireRootAdmin, async (req, res) => {
    try {
      const olderThanMs =
        typeof req.body?.olderThanMs === "number" ? req.body.olderThanMs : undefined;
      const limit = typeof req.body?.limit === "number" ? req.body.limit : undefined;
      const rows = await aiJobService.listStaleRunningJobs({ olderThanMs, limit });
      res.json({
        count: rows.length,
        message: "Read-only stale-job inspection; no state mutated",
        items: rows.map((r) => ({
          jobId: r.id,
          jobType: r.jobType,
          status: r.status,
          lockedBy: r.lockedBy,
          lockedAt: r.lockedAt?.toISOString() ?? null,
          startedAt: r.startedAt?.toISOString() ?? null,
          retryCount: r.retryCount,
          maxRetries: r.maxRetries,
        })),
      });
    } catch (err) { handleAiJobError(res, err); }
  });

  app.get("/api/ai-jobs/:jobId", requireAuth, async (req: any, res) => {
    try {
      const view = await aiJobService.getView(req.params.jobId, {
        userId: req.user?.id,
        isAdmin: !!req.session?.isAdmin,
      });
      res.json(view);
    } catch (err) { handleAiJobError(res, err); }
  });

  // Admin-only: list pending jobs (used by the future Python worker bridge
  // and by the admin debug console).
  app.get("/api/admin/ai-jobs/pending", requireRootAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) ?? "25", 10) || 25, 100);
      const envelopes = await aiJobService.listPending(limit);
      res.json({ count: envelopes.length, envelopes });
    } catch (err) { handleAiJobError(res, err); }
  });

  // Admin-only: receive a result back from a Python worker. Kept for the
  // admin debug console; production workers should use the dedicated
  // `/api/worker/ai-jobs/result` endpoint with a worker token.
  app.post("/api/admin/ai-jobs/result", requireRootAdmin, async (req, res) => {
    try {
      const result = await aiJobService.recordResult(req.body);
      res.json({ ok: true, jobId: result.jobId, status: result.status });
    } catch (err) { handleAiJobError(res, err); }
  });

  // -------------------------------------------------------------------------
  // Worker-scoped endpoints (Python AI worker bridge).
  //
  // Authenticated via the dedicated `requireWorkerToken` middleware — this
  // does NOT grant general admin access. The Python worker is the only
  // intended consumer. Endpoints are scoped strictly to AI job lifecycle:
  // list-pending, claim/lock, submit-result.
  // -------------------------------------------------------------------------
  const { requireWorkerToken } = await import("./middleware/worker-auth");
  const { AiJobLockError } = await import("./services/aiJobService");

  function handleWorkerJobError(res: any, err: unknown) {
    if (err instanceof AiJobLockError) {
      return res.status(409).json({ message: err.message, code: err.code });
    }
    return handleAiJobError(res, err);
  }

  // List oldest-first pending jobs eligible for execution. The returned
  // envelopes contain only the job-shaped fields the worker needs and never
  // include unrelated user data outside the payload the originator
  // submitted.
  app.get("/api/worker/ai-jobs/pending", requireWorkerToken, async (req, res) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) ?? "10", 10) || 10, 100);
      const envelopes = await aiJobService.listPending(limit);
      res.json({ count: envelopes.length, envelopes });
    } catch (err) { handleWorkerJobError(res, err); }
  });

  // Atomically claim a job for this worker. Sets status=running, locked_at,
  // locked_by; refuses to double-claim a job that is already in a terminal
  // state. Returns 409 if the job could not be claimed (race lost or
  // already terminal).
  app.post("/api/worker/ai-jobs/:jobId/running", requireWorkerToken, async (req: any, res) => {
    try {
      const lockedBy: string = req.worker!.workerId;
      const view = await aiJobService.markRunning(req.params.jobId, lockedBy);
      res.json(view);
    } catch (err) { handleWorkerJobError(res, err); }
  });

  // Submit a final result. Validates the payload shape via
  // aiJobService.recordResult (zod) and updates status to succeeded/failed
  // along with completed_at or failed_at.
  app.post("/api/worker/ai-jobs/result", requireWorkerToken, async (req: any, res) => {
    try {
      const result = await aiJobService.recordResult(req.body, req.worker!);
      res.json({ ok: true, jobId: result.jobId, status: result.status });
    } catch (err) { handleWorkerJobError(res, err); }
  });

  // Worker heartbeat: upserts ai_workers row, returns derived status.
  const { aiWorkerService } = await import("./services/aiWorkerService");
  app.post("/api/worker/heartbeat", requireWorkerToken, async (req: any, res) => {
    try {
      const body = req.body ?? {};
      const workerId = req.worker!.workerId;
      const row = await aiWorkerService.recordHeartbeat({
        workerId,
        status: body.status,
        hostname: body.hostname ?? null,
        processId: body.processId ?? null,
        version: body.version ?? null,
        capabilities: Array.isArray(body.capabilities) ? body.capabilities : null,
        currentJobId: body.currentJobId ?? null,
        lastError: body.lastError ?? null,
        metadata: body.metadata ?? null,
      });
      res.json({
        ok: true,
        workerId: row.workerId,
        status: row.status,
        lastSeenAt: row.lastSeenAt.toISOString(),
      });
    } catch (err) {
      console.error("[worker/heartbeat] failed", err);
      res.status(500).json({ message: "heartbeat failed" });
    }
  });

  // Admin: list all known workers with derived health.
  app.get("/api/admin/ai-workers", requireRootAdmin, async (_req, res) => {
    try {
      const rows = await aiWorkerService.listAll();
      res.json({
        count: rows.length,
        items: rows.map((w) => ({
          workerId: w.workerId,
          status: w.status,
          derivedStatus: w.derivedStatus,
          lastSeenAt: w.lastSeenAt.toISOString(),
          startedAt: w.startedAt ? w.startedAt.toISOString() : null,
          currentJobId: w.currentJobId,
          hostname: w.hostname,
          processId: w.processId,
          version: w.version,
          capabilities: w.capabilities ?? [],
          jobsClaimedCount: w.jobsClaimedCount,
          jobsSucceededCount: w.jobsSucceededCount,
          jobsFailedCount: w.jobsFailedCount,
          lastError: w.lastError,
          createdAt: w.createdAt.toISOString(),
          updatedAt: w.updatedAt.toISOString(),
        })),
      });
    } catch (err) {
      console.error("[admin/ai-workers] failed", err);
      res.status(500).json({ message: "failed to list workers" });
    }
  });

  app.get("/api/admin/ai-workers/:workerId", requireRootAdmin, async (req, res) => {
    try {
      const w = await aiWorkerService.getOne(req.params.workerId);
      if (!w) return res.status(404).json({ message: "worker not found" });
      res.json({
        workerId: w.workerId,
        status: w.status,
        derivedStatus: w.derivedStatus,
        lastSeenAt: w.lastSeenAt.toISOString(),
        startedAt: w.startedAt ? w.startedAt.toISOString() : null,
        currentJobId: w.currentJobId,
        hostname: w.hostname,
        processId: w.processId,
        version: w.version,
        capabilities: w.capabilities ?? [],
        jobsClaimedCount: w.jobsClaimedCount,
        jobsSucceededCount: w.jobsSucceededCount,
        jobsFailedCount: w.jobsFailedCount,
        lastError: w.lastError,
        metadata: w.metadata ?? {},
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
      });
    } catch (err) {
      console.error("[admin/ai-workers/:id] failed", err);
      res.status(500).json({ message: "failed" });
    }
  });

  // Admin: AI retention & cleanup (preview + run).
  const { aiRetentionService, defaultPolicy, normalizePolicy } = await import("./services/aiRetentionService");

  app.get("/api/admin/ai-retention/preview", requireRootAdmin, async (_req, res) => {
    try {
      const policy = defaultPolicy();
      const eligible = await aiRetentionService.previewCleanup(policy);
      res.json({ policy, eligible });
    } catch (err) {
      console.error("[admin/ai-retention/preview] failed", err);
      res.status(500).json({ message: "preview failed" });
    }
  });

  app.get("/api/admin/ai-retention/runs", requireRootAdmin, async (req, res) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const runs = await aiRetentionService.listRetentionRuns({
        dryRun: q.dryRun === "true" ? true : q.dryRun === "false" ? false : undefined,
        status: q.status || undefined,
        adminId: q.adminId || undefined,
        since: q.since ? new Date(q.since) : undefined,
        until: q.until ? new Date(q.until) : undefined,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        offset: q.offset ? parseInt(q.offset, 10) : undefined,
      });
      res.json({ runs });
    } catch (err) {
      console.error("[admin/ai-retention/runs] failed", err);
      res.status(500).json({ message: "list failed" });
    }
  });

  app.post("/api/admin/ai-retention/run", requireRootAdmin, async (req: any, res) => {
    try {
      const body = req.body ?? {};
      const dryRun = body.dryRun === false ? false : true; // default to dry-run
      const policy = normalizePolicy({
        completedRetentionDays: body.completedRetentionDays,
        failedRetentionDays: body.failedRetentionDays,
        eventRetentionDays: body.eventRetentionDays,
        workerStaleRetentionDays: body.workerStaleRetentionDays,
      });
      const adminId = String(req.session?.adminId || req.session?.userId || "unknown-admin");
      const result = await aiRetentionService.runCleanup(policy, { adminId, dryRun });
      res.json({
        runId: result.runId,
        dryRun: result.dryRun,
        policy: result.policy,
        eligibleCounts: result.eligible,
        deletedCounts: result.deleted,
        status: "succeeded",
      });
    } catch (err) {
      console.error("[admin/ai-retention/run] failed", err);
      res.status(500).json({ message: "cleanup failed" });
    }
  });

  // Admin: AI operations summary — compact dashboard metrics.
  const { aiOpsSummaryService } = await import("./services/aiOpsSummaryService");
  app.get("/api/admin/ai-ops/summary", requireRootAdmin, async (_req, res) => {
    try {
      const summary = await aiOpsSummaryService.getSummary();
      res.json(summary);
    } catch (err) {
      console.error("[admin/ai-ops/summary] failed", err);
      res.status(500).json({ message: "summary failed" });
    }
  });

  const { aiOpsNotificationsService } = await import("./services/aiOpsNotificationsService");
  app.get("/api/admin/ai-ops/notifications", requireRootAdmin, async (_req, res) => {
    try {
      const notifications = await aiOpsNotificationsService.list();
      res.json({ notifications });
    } catch (err) {
      console.error("[admin/ai-ops/notifications] failed", err);
      res.status(500).json({ message: "notifications failed" });
    }
  });

  const { aiOpsSnapshotService } = await import("./services/aiOpsSnapshotService");
  app.post("/api/admin/ai-ops/snapshots", requireRootAdmin, async (req, res) => {
    try {
      const { date, force } = (req.body ?? {}) as { date?: string; force?: boolean };
      const adminId = (req.session as any)?.adminId ?? null;
      const { snapshot, created } = await aiOpsSnapshotService.generateSnapshot({
        adminId, date: date ?? null, force: !!force,
      });
      res.json({ snapshot, created });
    } catch (err: any) {
      console.error("[admin/ai-ops/snapshots:create] failed", err);
      res.status(400).json({ message: err?.message ?? "snapshot failed" });
    }
  });

  app.get("/api/admin/ai-ops/snapshots", requireRootAdmin, async (req, res) => {
    try {
      const { since, until, healthStatus, limit, offset } = req.query as Record<string, string | undefined>;
      const snapshots = await aiOpsSnapshotService.listSnapshots({
        since: since ?? null,
        until: until ?? null,
        healthStatus: healthStatus ?? null,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
      res.json({ snapshots });
    } catch (err: any) {
      console.error("[admin/ai-ops/snapshots:list] failed", err);
      res.status(400).json({ message: err?.message ?? "list failed" });
    }
  });

  const { toCsv, csvFilename, setCsvHeaders } = await import("./utils/csv");
  const { aiExportAuditService } = await import("./services/aiExportAuditService");

  const extractAdminId = (req: any): string | null =>
    req?.session?.adminId || req?.user?.id || req?.session?.userId || null;

  app.get("/api/admin/ai-ops/snapshots.csv", requireRootAdmin, async (req: any, res) => {
    const filters = {
      since: req.query.since,
      until: req.query.until,
      healthStatus: req.query.healthStatus,
      limit: req.query.limit,
      offset: req.query.offset,
    };
    const filename = csvFilename("mougle-ai-ops-snapshots");
    const adminId = extractAdminId(req);
    try {
      const { since, until, healthStatus, limit, offset } = req.query as Record<string, string | undefined>;
      const snapshots = await aiOpsSnapshotService.listSnapshots({
        since: since ?? null,
        until: until ?? null,
        healthStatus: healthStatus ?? null,
        limit: limit ? parseInt(limit, 10) : 200,
        offset: offset ? parseInt(offset, 10) : 0,
      });
      const cols = [
        "snapshotId", "snapshotDate", "generatedByAdminId", "healthStatus", "healthReasons",
        "totalJobsLast24h", "pendingJobs", "runningJobs", "succeededJobsLast24h", "failedJobsLast24h",
        "rejectedJobsLast24h", "staleRunningJobs",
        "totalWorkers", "onlineWorkers", "staleWorkers", "offlineWorkers", "unhealthyWorkers",
        "busyWorkers", "idleWorkers",
        "auditEventsLast24h", "lastCleanupAt", "lastCleanupStatus",
        "rowsDeletedLastCleanup", "rowsDeletedLast7d",
        "criticalNotifications", "warningNotifications", "infoNotifications",
        "createdAt",
      ] as const;
      const rows = snapshots.map((s) => {
        const j: any = s.jobMetrics ?? {};
        const w: any = s.workerMetrics ?? {};
        const r: any = s.retentionMetrics ?? {};
        const n: any = s.notificationMetrics ?? {};
        return {
          snapshotId: s.snapshotId,
          snapshotDate: s.snapshotDate,
          generatedByAdminId: s.generatedByAdminId ?? "",
          healthStatus: s.healthStatus,
          healthReasons: (s.healthReasons ?? []).join(" | "),
          totalJobsLast24h: j.totalJobsLast24h ?? 0,
          pendingJobs: j.pendingJobs ?? 0,
          runningJobs: j.runningJobs ?? 0,
          succeededJobsLast24h: j.succeededJobsLast24h ?? 0,
          failedJobsLast24h: j.failedJobsLast24h ?? 0,
          rejectedJobsLast24h: j.rejectedJobsLast24h ?? 0,
          staleRunningJobs: j.staleRunningJobs ?? 0,
          totalWorkers: w.totalWorkers ?? 0,
          onlineWorkers: w.onlineWorkers ?? 0,
          staleWorkers: w.staleWorkers ?? 0,
          offlineWorkers: w.offlineWorkers ?? 0,
          unhealthyWorkers: w.unhealthyWorkers ?? 0,
          busyWorkers: w.busyWorkers ?? 0,
          idleWorkers: w.idleWorkers ?? 0,
          auditEventsLast24h: r.auditEventsLast24h ?? 0,
          lastCleanupAt: r.lastCleanupAt ?? "",
          lastCleanupStatus: r.lastCleanupStatus ?? "",
          rowsDeletedLastCleanup: r.rowsDeletedLastCleanup ?? "",
          rowsDeletedLast7d: r.rowsDeletedLast7d ?? 0,
          criticalNotifications: n.critical ?? 0,
          warningNotifications: n.warning ?? 0,
          infoNotifications: n.info ?? 0,
          createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt ?? ""),
        };
      });
      setCsvHeaders(res, filename);
      res.send(toCsv(cols as unknown as string[], rows as any));
      await aiExportAuditService.logExportSucceeded({
        exportType: "ai_ops_snapshots_csv",
        adminId,
        filters,
        rowCount: rows.length,
        filename,
      });
    } catch (err: any) {
      console.error("[admin/ai-ops/snapshots.csv] failed", err?.message ?? err);
      await aiExportAuditService.logExportFailed({
        exportType: "ai_ops_snapshots_csv",
        adminId,
        filters,
        filename,
        error: err,
      });
      if (!res.headersSent) res.status(400).json({ message: err?.message ?? "export failed" });
    }
  });

  app.get("/api/admin/ai-retention/runs.csv", requireRootAdmin, async (req: any, res) => {
    const filters = {
      dryRun: req.query.dryRun,
      status: req.query.status,
      adminId: req.query.adminId,
      since: req.query.since,
      until: req.query.until,
      limit: req.query.limit,
      offset: req.query.offset,
    };
    const filename = csvFilename("mougle-ai-retention-runs");
    const callerAdminId = extractAdminId(req);
    try {
      const { aiRetentionService } = await import("./services/aiRetentionService");
      const { dryRun, status, adminId, since, until, limit, offset } = req.query as Record<string, string | undefined>;
      const runs = await aiRetentionService.listRetentionRuns({
        dryRun: dryRun === "true" ? true : dryRun === "false" ? false : undefined,
        status: status || undefined,
        adminId: adminId || undefined,
        since: since ? new Date(since) : undefined,
        until: until ? new Date(until) : undefined,
        limit: limit ? parseInt(limit, 10) : 200,
        offset: offset ? parseInt(offset, 10) : 0,
      });
      const cols = [
        "runId", "adminId", "dryRun", "status",
        "completedRetentionDays", "failedRetentionDays", "eventRetentionDays", "workerStaleRetentionDays",
        "eligibleCompletedJobs", "eligibleFailedJobs", "eligibleAuditEvents", "eligibleStaleWorkers",
        "deletedCompletedJobs", "deletedFailedJobs", "deletedAuditEvents", "deletedStaleWorkers",
        "error", "startedAt", "completedAt", "createdAt",
      ] as const;
      const rows = runs.map((r) => {
        const p: any = r.policy ?? {};
        const e: any = r.eligibleCounts ?? {};
        const d: any = r.deletedCounts ?? {};
        return {
          runId: r.runId,
          adminId: r.adminId ?? "",
          dryRun: r.dryRun ? "true" : "false",
          status: r.status,
          completedRetentionDays: p.completedRetentionDays ?? "",
          failedRetentionDays: p.failedRetentionDays ?? "",
          eventRetentionDays: p.eventRetentionDays ?? "",
          workerStaleRetentionDays: p.workerStaleRetentionDays ?? "",
          eligibleCompletedJobs: e.completedJobsEligible ?? 0,
          eligibleFailedJobs: e.failedJobsEligible ?? 0,
          eligibleAuditEvents: e.eventsEligible ?? 0,
          eligibleStaleWorkers: e.workersEligible ?? 0,
          deletedCompletedJobs: d.completedJobsEligible ?? "",
          deletedFailedJobs: d.failedJobsEligible ?? "",
          deletedAuditEvents: d.eventsEligible ?? "",
          deletedStaleWorkers: d.workersEligible ?? "",
          error: r.error ?? "",
          startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : String(r.startedAt ?? ""),
          completedAt: r.completedAt instanceof Date ? r.completedAt.toISOString() : String(r.completedAt ?? ""),
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
        };
      });
      setCsvHeaders(res, filename);
      res.send(toCsv(cols as unknown as string[], rows as any));
      await aiExportAuditService.logExportSucceeded({
        exportType: "ai_retention_runs_csv",
        adminId: callerAdminId,
        filters,
        rowCount: rows.length,
        filename,
      });
    } catch (err: any) {
      console.error("[admin/ai-retention/runs.csv] failed", err?.message ?? err);
      await aiExportAuditService.logExportFailed({
        exportType: "ai_retention_runs_csv",
        adminId: callerAdminId,
        filters,
        filename,
        error: err,
      });
      if (!res.headersSent) res.status(400).json({ message: err?.message ?? "export failed" });
    }
  });

  app.get("/api/admin/ai-export-events", requireRootAdmin, async (req, res) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const parseDate = (v?: string) => {
        if (!v) return undefined;
        const d = new Date(v);
        return isNaN(d.getTime()) ? undefined : d;
      };
      const events = await aiExportAuditService.listExportEvents({
        exportType: q.exportType?.trim() || undefined,
        adminId: q.adminId?.trim() || undefined,
        status: q.status?.trim() || undefined,
        since: parseDate(q.since),
        until: parseDate(q.until),
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        offset: q.offset ? parseInt(q.offset, 10) : undefined,
      });
      res.json({
        count: events.length,
        events: events.map((e) => ({
          exportId: e.exportId,
          exportType: e.exportType,
          adminId: e.adminId,
          filters: e.filters,
          rowCount: e.rowCount,
          filename: e.filename,
          status: e.status,
          error: e.error,
          createdAt: e.createdAt,
        })),
      });
    } catch (err: any) {
      console.error("[admin/ai-export-events] failed", err?.message ?? err);
      res.status(500).json({ message: "list failed" });
    }
  });

  app.get("/api/admin/ai-ops/snapshots/:snapshotId", requireRootAdmin, async (req, res) => {
    try {
      const snapshot = await aiOpsSnapshotService.getSnapshot(req.params.snapshotId);
      if (!snapshot) return res.status(404).json({ message: "not found" });
      res.json({ snapshot });
    } catch (err) {
      console.error("[admin/ai-ops/snapshots:get] failed", err);
      res.status(500).json({ message: "get failed" });
    }
  });

  // Phase 1B Verified Newsroom — admin dry-run preview routes (no DB writes).
  registerNewsroomPreviewRoutes(app, requireRootAdmin);
  registerBroadcastBriefRoutes(app, requireRootAdmin);
  registerNeuralNewsroomRoutes(app, requireRootAdmin);
  registerOmniChannelAudienceRoutes(app, requireRootAdmin);
  registerFounderPtoModeRoutes(app, requireRootAdmin);
  registerNewsroomPackageRoutes(app, requireRootAdmin);

  // Mougle 4D Cinema Control MVP — admin preview-only routes (no DB writes,
  // no real provider calls, no Unreal/4D network delivery).
  registerCinemaControlRoutes(app, requireRootAdmin);
  registerAutopilotNewsroomRoutes(app, requireRootAdmin);
  registerProductionHouseRoutes(app, requireRootAdmin);
  registerPreviewStudioRoutes(app, requireRootAdmin);
  registerBroadcastRoutes(app, requireRootAdmin);
  registerBRollRoutes(app, requireRootAdmin);
  registerShortsRoutes(app, requireRootAdmin);
  registerCostRoutes(app, requireRootAdmin);
  registerAnchorRoutes(app, requireRootAdmin);

  // Newsroom T8 — 24/7 Playout Queue + breaking + kill switch (in-process channel state).
  registerPlayoutQueueRoutes(app, requireRootAdmin);

  // Pipeline safety — exposes generated docs/SAFETY_E2E_REPORT.md to the admin dashboard.
  registerSafetyReportRoutes(app, requireRootAdmin);

  // Newsroom T2 — Global Source Registry (admin CRUD + public-safe projection).
  registerNewsSourceRoutes(app, requireRootAdmin);

  // R5H — Admin 3D Asset Library (production_assets). Admin-only; no
  // route writes publicUrl; signed preview URLs are ephemeral (≤900s).
  registerProductionAssetRoutes(app, requireRootAdmin);
  registerProductionRigRoutes(app, requireRootAdmin);
  registerPermanentAvatarRoutes(app, requireRootAdmin);

  return httpServer;
}
